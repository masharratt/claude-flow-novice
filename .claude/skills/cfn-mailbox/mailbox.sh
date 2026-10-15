#!/usr/bin/env bash
# mailbox.sh: agent mailbox client (Redis Streams on one hosted Upstash database).
# Spec: planning/PLAN_agent-mailbox.md (stage 1, "Core").
#
# Usage:
#   mailbox.sh send <to> [--kind ask|fyi|reply|reminder] [--thread ID] [--reply-to ID] [--hops N] "<text>"
#   mailbox.sh read [--as <session-address>]
#   mailbox.sh who
#   mailbox.sh log [N]
#   mailbox.sh join <room> | leave <room>
#   mailbox.sh doctor
#   mailbox.sh adduser <owner>        (admin only; needs UPSTASH_MAILBOX_ADMIN_URL in the repo .env)
#
# Addresses: <owner>/s/<session>, <owner>/p/<project>, <owner>/r/<room>, <owner>/me (or bare "me").
# Names are [a-z0-9-] only.
#
# Config: ${MAILBOX_CONFIG:-$HOME/.config/cfn-mailbox/env}, keys MAILBOX_HOST MAILBOX_PORT
# MAILBOX_USER MAILBOX_PASS MAILBOX_OWNER (required), MAILBOX_PUBLIC MAILBOX_CONTACTS (optional).
# There are no defaults: a missing or partial config stops every command. TLS is always on.
# The sender's session name comes from MAILBOX_SESSION (runtime, not config); without it the
# sender is <owner>/me.
#
# Exit codes:
#    0  success
#    2  usage error (unknown subcommand, bad flag, bad kind, bad --hops/--reply-to, missing text)
#   10  invalid address or name
#   11  body empty or over 4096 bytes
#   12  hop limit reached (a thread stops at 20 hops; ask the user)
#   13  rate limit (10 per sender/receiver pair per 10 minutes)
#   14  outside-owner address not in MAILBOX_CONTACTS
#   15  Redis unreachable (or redis-cli missing)
#   16  Redis refused the login (user or password)
#   17  Redis ACL denied the command or key
#   18  unexpected Redis reply
#   19  MAILBOX_SESSION required for this command
#   20  admin credential missing or unusable (adduser)
#   78  mailbox config missing or incomplete
#
# Test hooks (not config): MAILBOX_ADMIN_ENV overrides the .env file adduser reads.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"

# Limits (named constants; one place).
BODY_MAX=4096
HOP_MAX=20
RATE_MAX=10
RATE_WINDOW=600
INBOX_MAXLEN=500
LOG_MAXLEN=10000
EXPIRE_SECS=2592000     # 30 days
READ_COUNT=20
WHO_WINDOW=1800         # directory entries older than 30 minutes are hidden
GROUP=readers
NAME_RE='^[a-z0-9-]{1,64}$'

die() { local code="$1"; shift; echo "mailbox: $*" >&2; exit "$code"; }
warn() { echo "mailbox: $*" >&2; }

valid_name() { [[ "$1" =~ $NAME_RE ]]; }

# --------------------------------------------------------------------- config

MAILBOX_HOST="" MAILBOX_PORT="" MAILBOX_USER="" MAILBOX_PASS="" MAILBOX_OWNER=""
MAILBOX_PUBLIC="" MAILBOX_CONTACTS=""
RC_SECRET=""      # extra value to redact from Redis error text (adduser token)
SESSION=""

load_config() {
  local cfg="${MAILBOX_CONFIG:-$HOME/.config/cfn-mailbox/env}" line key val missing=""
  [ -r "$cfg" ] || die 78 "no mailbox config at $cfg (needs MAILBOX_HOST, MAILBOX_PORT, MAILBOX_USER, MAILBOX_PASS, MAILBOX_OWNER)"
  # Parse KEY=VALUE lines for known keys only. Never `source` the file.
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"; val="${line#*=}"
    val="${val#\"}"; val="${val%\"}"; val="${val#\'}"; val="${val%\'}"
    case "$key" in
      MAILBOX_HOST) MAILBOX_HOST="$val" ;;
      MAILBOX_PORT) MAILBOX_PORT="$val" ;;
      MAILBOX_USER) MAILBOX_USER="$val" ;;
      MAILBOX_PASS) MAILBOX_PASS="$val" ;;
      MAILBOX_OWNER) MAILBOX_OWNER="$val" ;;
      MAILBOX_PUBLIC) MAILBOX_PUBLIC="$val" ;;
      MAILBOX_CONTACTS) MAILBOX_CONTACTS="$val" ;;
    esac
  done < "$cfg"
  for key in MAILBOX_HOST MAILBOX_PORT MAILBOX_USER MAILBOX_PASS MAILBOX_OWNER; do
    [ -n "${!key}" ] || missing="$missing $key"
  done
  [ -z "$missing" ] || die 78 "mailbox config $cfg is missing:$missing"
  [[ "$MAILBOX_PORT" =~ ^[0-9]+$ ]] || die 78 "MAILBOX_PORT in $cfg must be a number"
  valid_name "$MAILBOX_OWNER" || die 78 "MAILBOX_OWNER in $cfg must be [a-z0-9-] only"
  local c
  for c in ${MAILBOX_CONTACTS//,/ }; do
    [[ "$c" =~ ^[a-z0-9-]+/(me|[spr]/[a-z0-9-]+)$ ]] || die 78 "MAILBOX_CONTACTS entry '$c' is not a valid address"
  done
  SESSION="${MAILBOX_SESSION:-}"
  if [ -n "$SESSION" ]; then valid_name "$SESSION" || die 10 "MAILBOX_SESSION must be [a-z0-9-] only"; fi
  command -v redis-cli >/dev/null 2>&1 || die 15 "redis-cli is not installed"
}

# --------------------------------------------------------------------- redis

# Password travels in REDISCLI_AUTH, never argv.
_rc() {
  REDISCLI_AUTH="$MAILBOX_PASS" redis-cli --tls -h "$MAILBOX_HOST" -p "$MAILBOX_PORT" \
    --user "$MAILBOX_USER" --no-auth-warning ${RC_JSON:+--json} "$@"
}

RC_OUT=""
RC_TOLERATE=""   # substring of an error reply to treat as success
RC_STDIN=""      # when set, sent to redis-cli on stdin (keeps secrets out of argv)
RC_JSON=""       # when set, ask for JSON output

redact() {
  local s="$1"
  [ -n "$MAILBOX_PASS" ] && s="${s//"$MAILBOX_PASS"/[REDACTED]}"
  [ -n "$RC_SECRET" ] && s="${s//"$RC_SECRET"/[REDACTED]}"
  printf '%s' "$s"
}

# rcmd CMD ARGS...: runs it, puts the reply in RC_OUT, dies with a distinct code on failure.
rcmd() {
  local status=0 out label="${1:-stdin}"
  if [ -n "$RC_STDIN" ]; then
    out="$(printf '%s\n' "$RC_STDIN" | _rc "$@" 2>&1)" || status=$?
  else
    out="$(_rc "$@" 2>&1 </dev/null)" || status=$?
  fi
  out="$(redact "$out")"
  if [ -n "$RC_TOLERATE" ]; then
    case "$out" in *"$RC_TOLERATE"*) RC_OUT=""; return 0 ;; esac
  fi
  case "$out" in
    *WRONGPASS*|*NOAUTH*|*"invalid password"*|*"AUTH failed"*|*"invalid username-password"*)
      die 16 "login refused by $MAILBOX_HOST for user $MAILBOX_USER (check MAILBOX_USER and MAILBOX_PASS)" ;;
    *NOPERM*)
      die 17 "permission denied for $label (ACL for user $MAILBOX_USER does not allow it)" ;;
    *"Could not connect"*|*"Connection refused"*|*"timed out"*|*"Name or service"*|*"nodename nor servname"*|*"SSL"*|*"TLS"*)
      die 15 "cannot reach $MAILBOX_HOST:$MAILBOX_PORT over TLS ($label)" ;;
    "(error)"*|ERR*)
      die 18 "redis error on $label: $out" ;;
  esac
  [ "$status" -eq 0 ] || die 15 "redis-cli failed on $label (exit $status): $out"
  RC_OUT="$out"
}

# rcmdj: same, JSON output.
rcmdj() { RC_JSON=1 rcmd "$@"; }

now_s() { date +%s; }
now_ms() {
  local t
  t="$(date +%s%3N 2>/dev/null || true)"
  if [[ "$t" =~ ^[0-9]{13}$ ]]; then printf '%s' "$t"; return; fi
  t="$(perl -MTime::HiRes=time -e 'printf "%d", time()*1000' 2>/dev/null || true)"
  if [[ "$t" =~ ^[0-9]{13}$ ]]; then printf '%s' "$t"; return; fi
  printf '%s000' "$(date +%s)"
}

# --------------------------------------------------------------------- addresses

A_OWNER="" A_KIND="" A_NAME="" A_STR=""

# parse_addr ADDR: sets A_OWNER A_KIND A_NAME A_STR, or dies 10.
parse_addr() {
  local a="$1" rest
  case "$a" in
    me) A_OWNER="$MAILBOX_OWNER"; A_KIND=me; A_NAME="" ;;
    */*/*/*) die 10 "invalid address '$a' (expected <owner>/s|p|r/<name> or <owner>/me)" ;;
    */*/*) A_OWNER="${a%%/*}"; rest="${a#*/}"; A_KIND="${rest%%/*}"; A_NAME="${rest#*/}" ;;
    */*) A_OWNER="${a%%/*}"; A_KIND="${a#*/}"; A_NAME="" ;;
    *) die 10 "invalid address '$a' (expected <owner>/s|p|r/<name> or <owner>/me)" ;;
  esac
  valid_name "$A_OWNER" || die 10 "invalid owner in address '$a' (use [a-z0-9-] only)"
  case "$A_KIND" in
    me) [ -z "$A_NAME" ] || die 10 "invalid address '$a' (a person inbox takes no name)" ;;
    s|p|r) valid_name "$A_NAME" || die 10 "invalid name in address '$a' (use [a-z0-9-] only)" ;;
    *) die 10 "invalid kind in address '$a' (use s, p, r or me)" ;;
  esac
  if [ "$A_KIND" = me ]; then A_STR="$A_OWNER/me"; else A_STR="$A_OWNER/$A_KIND/$A_NAME"; fi
}

# inbox_key TO_OWNER KIND NAME SENDER_OWNER
inbox_key() {
  if [ "$2" = me ]; then printf 'mbx:%s:me:from:%s' "$1" "$4"
  else printf 'mbx:%s:%s:%s:from:%s' "$1" "$2" "$3" "$4"; fi
}

own_from_address() {
  if [ -n "$SESSION" ]; then printf '%s/s/%s' "$MAILBOX_OWNER" "$SESSION"
  else printf '%s/me' "$MAILBOX_OWNER"; fi
}

in_contacts() {
  local c
  for c in ${MAILBOX_CONTACTS//,/ }; do [ "$c" = "$1" ] && return 0; done
  return 1
}

# Owners whose mail this reader will look at: itself plus its contacts (it builds the keys itself).
sender_owners() {
  local c o seen=" $MAILBOX_OWNER "
  printf '%s\n' "$MAILBOX_OWNER"
  for c in ${MAILBOX_CONTACTS//,/ }; do
    o="${c%%/*}"
    case "$seen" in *" $o "*) ;; *) seen="$seen$o "; printf '%s\n' "$o" ;; esac
  done
}

key_hash() { printf '%s' "$1" | cksum | awk '{print $1}'; }
marker_key() { printf 'seen:%s:%s:%s' "$MAILBOX_OWNER" "$1" "$(key_hash "$2")"; }

# --------------------------------------------------------------------- send

cmd_send() {
  local kind=fyi thread="" reply_to="" hops_in=0 to="" text="" have_text=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --kind) [ $# -ge 2 ] || die 2 "--kind needs a value"; kind="$2"; shift 2 ;;
      --thread) [ $# -ge 2 ] || die 2 "--thread needs a value"; thread="$2"; shift 2 ;;
      --reply-to) [ $# -ge 2 ] || die 2 "--reply-to needs a value"; reply_to="$2"; shift 2 ;;
      --hops) [ $# -ge 2 ] || die 2 "--hops needs a value"; hops_in="$2"; shift 2 ;;
      --) shift; break ;;
      -*) die 2 "unknown flag $1 for send" ;;
      *) if [ -z "$to" ]; then to="$1"; elif [ "$have_text" = 0 ]; then text="$1"; have_text=1; else die 2 "send takes one <to> and one text"; fi; shift ;;
    esac
  done
  if [ $# -gt 0 ]; then
    [ -n "$to" ] || { to="$1"; shift; }
    if [ $# -gt 0 ] && [ "$have_text" = 0 ]; then text="$1"; have_text=1; shift; fi
  fi
  [ -n "$to" ] || die 2 "send needs <to> and \"<text>\""
  [ "$have_text" = 1 ] || die 2 "send needs \"<text>\""

  case "$kind" in ask|fyi|reply|reminder) ;; *) die 2 "kind '$kind' not allowed (use ask, fyi, reply or reminder)" ;; esac
  [ "$kind" != reply ] || [ -n "$reply_to" ] || die 2 "kind reply needs --reply-to <message id>"
  [ -z "$reply_to" ] || [[ "$reply_to" =~ ^[0-9]+-[0-9]+$ ]] || die 2 "--reply-to must be a message id like 1700000000000-0"
  [[ "$hops_in" =~ ^[0-9]+$ ]] || die 2 "--hops must be a number"
  [ -z "$thread" ] || [[ "$thread" =~ $NAME_RE ]] || die 2 "--thread must be [a-z0-9-] only"

  parse_addr "$to"
  local to_owner="$A_OWNER" to_kind="$A_KIND" to_name="$A_NAME" to_str="$A_STR"
  if [ "$to_owner" != "$MAILBOX_OWNER" ] && ! in_contacts "$to_str"; then
    die 14 "$to_str is another owner's address that is not in MAILBOX_CONTACTS; outside mail only goes to listed public addresses"
  fi

  local bytes
  bytes="$(printf '%s' "$text" | wc -c | tr -d ' ')"
  [ "$bytes" -gt 0 ] || die 11 "message body is empty"
  [ "$bytes" -le "$BODY_MAX" ] || die 11 "message body is $bytes bytes; the limit is $BODY_MAX"

  local hops=0
  if [ -n "$reply_to" ]; then hops=$((hops_in + 1)); fi
  [ "$hops" -le "$HOP_MAX" ] || die 12 "hop limit: this thread is at $hops hops (limit $HOP_MAX); stop and ask the user"
  [ -n "$thread" ] || thread="t-$(now_s)-$RANDOM"

  # Rate limit per sender/receiver pair.
  local from_id="${SESSION:-me}" rate_key
  rate_key="rate:$MAILBOX_OWNER:$from_id:$to_owner-$to_kind${to_name:+-$to_name}"
  rcmd INCR "$rate_key"
  local n="$RC_OUT"
  [[ "$n" =~ ^[0-9]+$ ]] || die 18 "unexpected reply to INCR on the rate key"
  if [ "$n" -eq 1 ]; then rcmd EXPIRE "$rate_key" "$RATE_WINDOW"; fi
  [ "$n" -le "$RATE_MAX" ] || die 13 "rate limit: more than $RATE_MAX messages from $from_id to $to_str in $((RATE_WINDOW / 60)) minutes"

  local key from_addr now
  key="$(inbox_key "$to_owner" "$to_kind" "$to_name" "$MAILBOX_OWNER")"
  from_addr="$(own_from_address)"
  now="$(now_s)"
  local -a f=(from "$from_addr" to "$to_str" kind "$kind" body "$text" sent_at "$now" thread "$thread" hops "$hops")
  if [ -n "$reply_to" ]; then f+=(reply_to "$reply_to"); fi
  if [ "$to_kind" = me ]; then
    rcmd XADD "$key" '*' "${f[@]}"
  else
    rcmd XADD "$key" MAXLEN '~' "$INBOX_MAXLEN" '*' "${f[@]}"
  fi
  local id="$RC_OUT"
  [[ "$id" =~ ^[0-9]+-[0-9]+$ ]] || die 18 "unexpected reply to XADD (no message id)"
  rcmd EXPIRE "$key" "$EXPIRE_SECS"

  # The message is already delivered; a failed log write must not turn that into an error.
  local rec
  rec="$(jq -n -c --arg id "$id" --arg from "$from_addr" --arg to "$to_str" --arg kind "$kind" \
    --arg thread "$thread" --argjson hops "$hops" --argjson bytes "$bytes" --argjson at "$now" \
    '{id:$id,from:$from,to:$to,kind:$kind,thread:$thread,hops:$hops,bytes:$bytes,at:$at}')"
  if ! (rcmd XADD "log:$MAILBOX_OWNER" MAXLEN '~' "$LOG_MAXLEN" '*' rec "$rec") 2>/dev/null; then
    warn "sent $id, but the log entry could not be written"
  fi
  printf '%s\n' "$id"
  echo "thread=$thread" >&2
}

# --------------------------------------------------------------------- read

EMIT_COUNT=0 EMIT_LAST="" EMIT_IDS=""

# emit_msgs JSON KEY SENDER_OWNER: prints one compact JSON line per message. Tier comes from
# the key the reader built, never from the message.
emit_msgs() {
  local json="$1" key="$2" sender="$3" tier lines
  EMIT_COUNT=0; EMIT_LAST=""; EMIT_IDS=""
  case "$json" in ''|null) return 0 ;; esac
  # redis-cli 8 --json (RESP3) returns {"key":[...]}; older/RESP2 returns [["key",[...]]].
  json="$(printf '%s' "$json" | jq -c 'if type == "object" then [to_entries[] | [.key, .value]] else . end')" \
    || die 18 "unreadable reply while reading $key"
  tier=outside; [ "$sender" = "$MAILBOX_OWNER" ] && tier=teammate
  lines="$(printf '%s' "$json" | jq -c --arg key "$key" --arg tier "$tier" --arg sender "$sender" '
    (.[0][1] // [])[]
    | ({id: .[0]} + (([.[1] | _nwise(2) | {(.[0]): .[1]}] | add) // {}))
      + {inbox: $key, sender_owner: $sender, tier: $tier}')" || die 18 "unreadable reply while reading $key"
  [ -n "$lines" ] || return 0
  printf '%s\n' "$lines"
  EMIT_COUNT="$(printf '%s\n' "$lines" | wc -l | tr -d ' ')"
  EMIT_IDS="$(printf '%s' "$json" | jq -r '(.[0][1] // [])[] | .[0]')"
  EMIT_LAST="$(printf '%s\n' "$EMIT_IDS" | tail -n 1)"
}

read_group() { # key sender reader
  local key="$1" sender="$2" reader="$3" remaining="$READ_COUNT" i
  RC_TOLERATE=BUSYGROUP rcmd XGROUP CREATE "$key" "$GROUP" 0 MKSTREAM
  rcmdj XREADGROUP GROUP "$GROUP" "$reader" COUNT "$remaining" STREAMS "$key" 0
  emit_msgs "$RC_OUT" "$key" "$sender"
  ack_ids "$key"
  remaining=$((remaining - EMIT_COUNT))
  [ "$remaining" -gt 0 ] || return 0
  rcmdj XREADGROUP GROUP "$GROUP" "$reader" COUNT "$remaining" STREAMS "$key" '>'
  emit_msgs "$RC_OUT" "$key" "$sender"
  ack_ids "$key"
}

ack_ids() { # key; uses EMIT_IDS (acknowledge only after the messages were printed)
  [ "$EMIT_COUNT" -gt 0 ] || return 0
  local -a ids=() i
  while IFS= read -r i; do [ -n "$i" ] && ids+=("$i"); done <<<"$EMIT_IDS"
  rcmd XACK "$1" "$GROUP" "${ids[@]}"
}

read_seen() { # key sender reader kind
  local key="$1" sender="$2" reader="$3" kind="$4" marker last
  marker="$(marker_key "$reader" "$key")"
  rcmd GET "$marker"
  last="$(printf '%s' "$RC_OUT" | tr -d '\r\n ')"
  if [ -z "$last" ]; then
    if [ "$kind" = r ]; then
      # A new room subscriber starts at the newest message.
      rcmdj XREVRANGE "$key" + - COUNT 1
      last="$(printf '%s' "$RC_OUT" | jq -r '.[0][0] // empty' 2>/dev/null || true)"
      [ -n "$last" ] || last="0-0"
      rcmd SET "$marker" "$last" EX "$EXPIRE_SECS"
      return 0
    fi
    last="0-0"
  fi
  rcmdj XREAD COUNT "$READ_COUNT" STREAMS "$key" "$last"
  emit_msgs "$RC_OUT" "$key" "$sender"
  if [ "$EMIT_COUNT" -gt 0 ]; then rcmd SET "$marker" "$EMIT_LAST" EX "$EXPIRE_SECS"; fi
}

cmd_read() {
  local as=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --as) [ $# -ge 2 ] || die 2 "--as needs an address"; as="$2"; shift 2 ;;
      *) die 2 "unknown argument $1 for read" ;;
    esac
  done
  if [ -z "$as" ]; then as="$(own_from_address)"; fi
  parse_addr "$as"
  [ "$A_OWNER" = "$MAILBOX_OWNER" ] || die 10 "can only read your own inboxes (owner $MAILBOX_OWNER), not $A_STR"
  local kind="$A_KIND" name="$A_NAME" addr="$A_STR" reader
  reader="${name:-me}"   # person inbox: one shared marker so any session shows each mail once

  local -a targets=("$kind:$name")
  if [ "$kind" = s ]; then
    local room rooms
    rcmd HGET "dir:$MAILBOX_OWNER" "$addr"
    rooms="$(printf '%s' "$RC_OUT" | jq -R -r '(fromjson? // {}) | .rooms[]?' 2>/dev/null || true)"
    while IFS= read -r room; do
      [ -n "$room" ] && valid_name "$room" && targets+=("r:$room")
    done <<<"$rooms"
  fi

  local t tk tn so key
  for t in "${targets[@]}"; do
    tk="${t%%:*}"; tn="${t#*:}"
    while IFS= read -r so; do
      key="$(inbox_key "$MAILBOX_OWNER" "$tk" "$tn" "$so")"
      if [ "$tk" = p ]; then read_group "$key" "$so" "$reader"; else read_seen "$key" "$so" "$reader" "$tk"; fi
    done < <(sender_owners)
  done
}

# --------------------------------------------------------------------- who / log

cmd_who() {
  local cutoff
  cutoff=$(( $(now_s) - WHO_WINDOW ))
  rcmdj HGETALL "dir:$MAILBOX_OWNER"
  printf '%s' "$RC_OUT" | jq -r --argjson cutoff "$cutoff" '
    [ (. // [])[] ] as $a
    | [range(0; ($a | length); 2) | {addr: $a[.], v: (($a[. + 1] | fromjson?) // {})}]
    | map(select((.v.last_seen // 0) >= $cutoff))
    | sort_by(.addr)[]
    | [.addr, (.v.host // "-"), (.v.project // "-"), (.v.summary // "")] | @tsv' \
    || die 18 "unreadable directory reply"
}

cmd_log() {
  local n="${1:-50}"
  [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le 500 ] || die 2 "log takes a count from 1 to 500"
  rcmdj XREVRANGE "log:$MAILBOX_OWNER" + - COUNT "$n"
  printf '%s' "$RC_OUT" | jq -r '(. // [])[] | .[0] + "\t" + (.[1][1] // "")' || die 18 "unreadable log reply"
}

# --------------------------------------------------------------------- rooms

room_arg() { # sets ROOM
  local r="${1:-}"
  [ -n "$r" ] || die 2 "needs a room name"
  case "$r" in
    */*) parse_addr "$r"
         [ "$A_KIND" = r ] && [ "$A_OWNER" = "$MAILBOX_OWNER" ] || die 10 "'$r' is not one of your rooms ($MAILBOX_OWNER/r/<name>)"
         ROOM="$A_NAME" ;;
    *) valid_name "$r" || die 10 "invalid room name '$r' (use [a-z0-9-] only)"; ROOM="$r" ;;
  esac
}
ROOM=""

update_rooms() { # op(add|remove) room
  [ -n "$SESSION" ] || die 19 "set MAILBOX_SESSION to your session name first"
  local addr cur new
  addr="$MAILBOX_OWNER/s/$SESSION"
  rcmd HGET "dir:$MAILBOX_OWNER" "$addr"
  cur="$RC_OUT"
  new="$(jq -n -c --arg cur "$cur" --arg room "$2" --arg op "$1" --argjson now "$(now_s)" '
    (($cur | fromjson?) // {}) as $c
    | ($c.rooms // []) as $r
    | $c + {rooms: (if $op == "add" then ($r + [$room] | unique) else ($r - [$room]) end), last_seen: $now}')" \
    || die 18 "could not update the directory entry"
  rcmd HSET "dir:$MAILBOX_OWNER" "$addr" "$new"
}

cmd_join() {
  room_arg "${1:-}"
  update_rooms add "$ROOM"
  # Start at the newest message: record a marker for every sender key of this room.
  local so key last
  while IFS= read -r so; do
    key="$(inbox_key "$MAILBOX_OWNER" r "$ROOM" "$so")"
    rcmdj XREVRANGE "$key" + - COUNT 1
    last="$(printf '%s' "$RC_OUT" | jq -r '.[0][0] // empty' 2>/dev/null || true)"
    [ -n "$last" ] || last="0-0"
    rcmd SET "$(marker_key "$SESSION" "$key")" "$last" EX "$EXPIRE_SECS"
  done < <(sender_owners)
  echo "joined $MAILBOX_OWNER/r/$ROOM as $MAILBOX_OWNER/s/$SESSION"
}

cmd_leave() {
  room_arg "${1:-}"
  update_rooms remove "$ROOM"
  echo "left $MAILBOX_OWNER/r/$ROOM"
}

# --------------------------------------------------------------------- doctor

cmd_doctor() {
  local mode t0 t1
  echo "host:     $MAILBOX_HOST:$MAILBOX_PORT (TLS)"
  echo "user:     $MAILBOX_USER"
  echo "owner:    $MAILBOX_OWNER"
  echo "session:  ${SESSION:-(none)}"
  echo "public:   ${MAILBOX_PUBLIC:-(not set)}"
  echo "contacts: ${MAILBOX_CONTACTS:-(none)}"
  mode="$(stat -c %a "${MAILBOX_CONFIG:-$HOME/.config/cfn-mailbox/env}" 2>/dev/null || stat -f %Lp "${MAILBOX_CONFIG:-$HOME/.config/cfn-mailbox/env}" 2>/dev/null || true)"
  if [ -n "$mode" ] && [ "$mode" != 600 ]; then warn "config file mode is $mode; run chmod 600 on it"; fi
  t0="$(now_ms)"
  rcmd PING
  t1="$(now_ms)"
  [ "$RC_OUT" = PONG ] || die 18 "PING did not answer PONG"
  echo "auth:     ok"
  echo "ping:     $((t1 - t0)) ms"
}

# --------------------------------------------------------------------- adduser (admin)

ACL_CMDS="ping xadd xread xreadgroup xack xautoclaim xclaim xpending xinfo xgroup xrange xrevrange xlen xdel xtrim hset hget hgetall hdel zadd zrangebyscore zrem get set del expire incr"

acl_rule() { # owner token
  # reset first, so re-running adduser replaces the user's rules instead of adding to them
  local o="$1" c rule="ACL SETUSER $1 reset on >$2"
  rule="$rule ~mbx:$o:* ~mbx:*:from:$o ~dir:$o ~seen:$o:* ~due:$o ~log:$o ~lock:$o:* ~rate:$o:* ~done:$o:*"
  for c in $ACL_CMDS; do rule="$rule +$c"; done
  printf '%s' "$rule"
}

cmd_adduser() {
  local owner="${1:-}" envfile url rest userinfo hostport port
  [ -n "$owner" ] || die 2 "adduser needs an owner name"
  valid_name "$owner" || die 10 "invalid owner name '$owner' (use [a-z0-9-] only)"
  envfile="${MAILBOX_ADMIN_ENV:-$REPO/.env}"
  [ -r "$envfile" ] || die 20 "cannot read the admin env file $envfile"
  url="$(grep '^UPSTASH_MAILBOX_ADMIN_URL=' "$envfile" | tail -n 1 | cut -d= -f2- || true)"
  url="${url%$'\r'}"; url="${url#\"}"; url="${url%\"}"; url="${url#\'}"; url="${url%\'}"
  [ -n "$url" ] || die 20 "UPSTASH_MAILBOX_ADMIN_URL is not set in $envfile"
  case "$url" in rediss://*) rest="${url#rediss://}" ;; redis://*) rest="${url#redis://}" ;; *) die 20 "UPSTASH_MAILBOX_ADMIN_URL is not a redis:// or rediss:// URL" ;; esac
  case "$rest" in *@*) ;; *) die 20 "UPSTASH_MAILBOX_ADMIN_URL has no user:password@host part" ;; esac
  userinfo="${rest%@*}"; hostport="${rest##*@}"
  MAILBOX_USER="${userinfo%%:*}"; MAILBOX_PASS="${userinfo#*:}"
  MAILBOX_HOST="${hostport%%:*}"; port="${hostport#*:}"; port="${port%%/*}"
  [ "$port" != "$hostport" ] || port=""
  [ -n "$MAILBOX_USER" ] && [ -n "$MAILBOX_PASS" ] && [ "$MAILBOX_PASS" != "$userinfo" ] && [ -n "$MAILBOX_HOST" ] && [[ "$port" =~ ^[0-9]+$ ]] \
    || die 20 "UPSTASH_MAILBOX_ADMIN_URL must look like rediss://user:password@host:port"
  MAILBOX_PORT="$port"
  command -v redis-cli >/dev/null 2>&1 || die 15 "redis-cli is not installed"

  rcmd ACL GENTOKEN "$owner"
  local token
  token="$(printf '%s' "$RC_OUT" | tr -d '\r\n ')"
  [[ "$token" =~ ^[A-Za-z0-9_.~+/=-]+$ ]] || die 18 "ACL GENTOKEN returned an unexpected value"
  RC_SECRET="$token"
  # The token goes to Redis on stdin so it never appears in a process list.
  RC_STDIN="$(acl_rule "$owner" "$token")" rcmd
  [ "${RC_OUT:-OK}" = OK ] || die 18 "ACL SETUSER did not answer OK"

  warn "created user $owner; copy the lines below into that person's ~/.config/cfn-mailbox/env (chmod 600). They are shown once."
  printf 'MAILBOX_HOST=%s\nMAILBOX_PORT=%s\nMAILBOX_USER=%s\nMAILBOX_PASS=%s\nMAILBOX_OWNER=%s\nMAILBOX_PUBLIC=me\n' \
    "$MAILBOX_HOST" "$MAILBOX_PORT" "$owner" "$token" "$owner"
}

# --------------------------------------------------------------------- main

main() {
  local sub="${1:-}"
  [ $# -gt 0 ] && shift
  case "$sub" in
    adduser) cmd_adduser "$@" ;;
    send|read|who|log|join|leave|doctor)
      load_config
      "cmd_$sub" "$@" ;;
    ''|-h|--help|help)
      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
      [ -n "$sub" ] && exit 0
      exit 2 ;;
    *) die 2 "unknown subcommand '$sub' (send, read, who, log, join, leave, doctor, adduser)" ;;
  esac
}

main "$@"
