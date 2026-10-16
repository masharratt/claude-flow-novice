#!/usr/bin/env bash
# mailbox.sh: agent mailbox client (Redis Streams on one hosted Upstash database).
# Spec: planning/PLAN_agent-mailbox.md (stage 1, "Core").
#
# Usage:
#   mailbox.sh send <to> [--kind ask|fyi|reply|reminder] [--at <when>] [--thread ID] [--reply-to ID] [--hops N] [--fleet TYPE] [--coord-file F] "<text>"
#   mailbox.sh read [--as <session-address>] [--max N] [--peek] [--spool FILE] [--reader NAME]
#   mailbox.sh who [--seen]
#   mailbox.sh log [N]
#   mailbox.sh stats [--hours N]      loop/flood watch from log:<owner> (default 168 h); exit 0 clean, 1 LOOP?/FLOOD?, 2 empty
#   mailbox.sh join <room> | leave <room>
#   mailbox.sh claim <name> | release <name> | whoami
#   mailbox.sh queue <to> [--kind K] [--fleet TYPE] "<text>" | flush     (worker outbound queue, MAILBOX_OUTQ)
#   mailbox.sh doctor
#   mailbox.sh adduser <owner>        (admin only; needs UPSTASH_MAILBOX_ADMIN_URL in the repo .env)
#
# Role names (stage 5): `claim <name>` makes <owner>/s/<name> this session's address, stored as
# alias:<owner>:<name> = {session_id, host, claimed_at, last_seen}. Refused (21) while a different
# session holding it was seen in the last 10 minutes; a quieter holder is taken over under
# lock:<owner>:alias-<name>. The holder id is MAILBOX_SESSION_ID, else CLAUDE_CODE_SESSION_ID, else
# MAILBOX_SESSION. A local file ~/.cache/cfn-mailbox/alias-<holder> makes the claimed name the
# session for every later call and for the hook; heartbeat refreshes last_seen.
#
# Fleet: --fleet names the fleet message type (status handoff claim-request done blocked assign
# answer stop). --coord-file F reads "coordinator-secret: <hex>" from F and sends it as the last
# field (coord) through redis-cli -x, so it is never in argv, the log or output. A reader with
# MAILBOX_COORD_FILE set labels same-owner mail whose coord matches its own file "coordinator"
# (and, with MAILBOX_COORD_FROM set, only when from is that address);
# coord is always removed from what read prints. A sandboxed worker that cannot reach Redis puts
# mail in MAILBOX_OUTQ with `queue`; the (unsandboxed) hook sends it with `flush`.
#
# Addresses: <owner>/s/<session>, <owner>/p/<project>, <owner>/r/<room>, <owner>/me (or bare "me").
# Names are [a-z0-9-] only.
#
# Config: ${MAILBOX_CONFIG:-$HOME/.config/cfn-mailbox/env}, keys MAILBOX_HOST MAILBOX_PORT
# MAILBOX_USER MAILBOX_PASS MAILBOX_OWNER (required), MAILBOX_PUBLIC MAILBOX_CONTACTS (optional).
# MAILBOX_PUBLIC lists this owner's addresses that other owners may write to (me, p/<name>,
# r/<name>, s/<name>, optionally prefixed <owner>/). The receiver enforces it: for any other
# address only this owner's own from:<owner> key is ever built, read, watched or bounced.
#
# Delivery is at least once, shown once: every message carries a random msg_id (kept on retry),
# and a reader drops a msg_id it already showed (~/.cache/cfn-mailbox/delivered-<session>, 7 days).
# A message whose to field does not match its inbox key, or whose from owner differs from the
# key's from:<owner>, is consumed without being shown and logged (metadata only) to
# ~/.cache/cfn-mailbox/quarantine.log.
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
#   21  role name held by another live session (claim, release)
#   78  mailbox config missing or incomplete
#
# --at <when>: epoch seconds (9 to 12 digits), +<n>m|h|d, HH:MM (next occurrence, local time) or
# YYYY-MM-DDTHH:MM (local). The message waits in due:<owner> until mailbox-watch.sh delivers it;
# kind defaults to reminder. Prints the due time in UTC and local.
#
# Test hooks (not config): MAILBOX_ADMIN_ENV overrides the .env file adduser reads; MAILBOX_NOW
# (epoch seconds) replaces the clock. Sourcing this file (mailbox-watch.sh does) defines the
# functions without running main.
set -euo pipefail
umask 077   # spool, delivered set and quarantine log hold mail: owner-only

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
SUMMARY_MAX=200         # longest session summary kept in the directory
WHO_WINDOW=1800         # directory entries older than 30 minutes are hidden
GROUP=readers
NAME_RE='^[a-z0-9-]{1,64}$'
DELIVERED_TTL=604800    # msg_ids a reader remembers as shown (7 days)
MSG_ID_RE='^[A-Za-z0-9_-]{1,64}$'
# Typed into idle tmux panes by mailbox-watch.sh; the hook keeps the taint flag on a prompt equal to it.
NUDGE_TEXT="You have mail: run /mail read"
CACHE_DIR="$HOME/.cache/cfn-mailbox"
ALIAS_TTL=2592000       # alias keys age out after 30 days without a refresh
ALIAS_LIVE=600          # a holder seen within 10 minutes keeps its role name
FLEET_TYPES="status handoff claim-request done blocked assign answer stop"

die() { local code="$1"; shift; echo "mailbox: $*" >&2; exit "$code"; }
# ensure_cache_dir: create the local cache owner-only, and tighten one an older version left open.
ensure_cache_dir() { mkdir -p "$CACHE_DIR" 2>/dev/null && chmod 700 "$CACHE_DIR" 2>/dev/null; }
warn() { echo "mailbox: $*" >&2; }

valid_name() { [[ "$1" =~ $NAME_RE ]]; }

# --------------------------------------------------------------------- config

MAILBOX_HOST="" MAILBOX_PORT="" MAILBOX_USER="" MAILBOX_PASS="" MAILBOX_OWNER=""
MAILBOX_PUBLIC="" MAILBOX_CONTACTS=""
PUBLIC_LIST=""    # MAILBOX_PUBLIC normalised to " me p/x r/y" (no owner prefix)
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
  local c n
  for c in ${MAILBOX_CONTACTS//,/ }; do
    [[ "$c" =~ ^[a-z0-9-]+/(me|[spr]/[a-z0-9-]+)$ ]] || die 78 "MAILBOX_CONTACTS entry '$c' is not a valid address"
  done
  PUBLIC_LIST=""
  for c in ${MAILBOX_PUBLIC//,/ }; do
    n="$c"
    case "$n" in "$MAILBOX_OWNER"/*) n="${n#"$MAILBOX_OWNER"/}" ;; esac
    [[ "$n" =~ ^(me|[spr]/[a-z0-9-]{1,64})$ ]] || die 78 "MAILBOX_PUBLIC entry '$c' is not one of your addresses (use me, p/<name>, r/<name> or s/<name>)"
    PUBLIC_LIST="$PUBLIC_LIST $n"
  done
  SESSION="${MAILBOX_SESSION:-}"
  if [ -n "$SESSION" ]; then valid_name "$SESSION" || die 10 "MAILBOX_SESSION must be [a-z0-9-] only"; fi
  # No explicit session: a role name this session claimed earlier is its address.
  if [ -z "$SESSION" ]; then
    local h a
    h="$(holder_id)"
    if [ -n "$h" ] && [ -f "$(alias_file "$h")" ]; then
      a="$(head -n 1 "$(alias_file "$h")" 2>/dev/null | tr -d '\r\n ')"
      if valid_name "$a"; then SESSION="$a"; fi
    fi
  fi
  command -v redis-cli >/dev/null 2>&1 || die 15 "redis-cli is not installed"
}

# holder_id: who holds a role name (claim): MAILBOX_SESSION_ID, else CLAUDE_CODE_SESSION_ID (Claude
# Code exports it to Bash; the hook gets the same id as session_id), else MAILBOX_SESSION.
holder_id() {
  local h="${MAILBOX_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-${MAILBOX_SESSION:-}}}"
  [ -n "$h" ] || return 0
  h="$(printf '%s' "$h" | tr -c 'A-Za-z0-9_-' '_')"
  printf '%s' "${h:0:128}"
}
alias_file() { printf '%s/alias-%s' "$CACHE_DIR" "$1"; }

# coord_secret FILE: the "coordinator-secret: <hex>" value in FILE (16 to 128 hex), else nothing.
coord_secret() {
  [ -n "${1:-}" ] && [ -r "$1" ] || return 0
  awk '$1 == "coordinator-secret:" && $2 ~ /^[0-9a-f]+$/ && length($2) >= 16 && length($2) <= 128 { print $2; exit }' "$1" 2>/dev/null || true
}

valid_fleet_type() { case " $FLEET_TYPES " in *" $1 "*) return 0 ;; esac; return 1; }

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
RC_XARG=""       # when set, sent on stdin as the command's last argument (redis-cli -x)

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
  elif [ -n "$RC_XARG" ]; then
    out="$(printf '%s' "$RC_XARG" | _rc -x "$@" 2>&1)" || status=$?
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

now_s() {
  # MAILBOX_NOW (epoch seconds) is a test hook: a fake clock for every time decision.
  if [[ "${MAILBOX_NOW:-}" =~ ^[0-9]+$ ]]; then printf '%s\n' "$MAILBOX_NOW"; else date +%s; fi
}
now_ms() {
  local t
  if [[ "${MAILBOX_NOW:-}" =~ ^[0-9]+$ ]]; then printf '%s000' "$MAILBOX_NOW"; return; fi
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

# ----- receiver policy (one implementation: read, join, the watcher and lifecycle all use it)

# is_public KIND NAME: may other owners write to this address of mine (MAILBOX_PUBLIC)?
is_public() {
  local a="$1/$2"
  [ "$1" != me ] || a=me
  case "$PUBLIC_LIST " in *" $a "*) return 0 ;; esac
  return 1
}

# receiver_keys KIND NAME: the inbox keys this owner builds for one of its own addresses, one per
# line. Its own from:<owner> key always; a contact owner's key only when the address is public, so
# mail injected straight into Redis at a private address is never read, watched or bounced.
receiver_keys() {
  local so
  if is_public "$1" "$2"; then
    while IFS= read -r so; do inbox_key "$MAILBOX_OWNER" "$1" "$2" "$so"; printf '\n'; done < <(sender_owners)
  else
    inbox_key "$MAILBOX_OWNER" "$1" "$2" "$MAILBOX_OWNER"; printf '\n'
  fi
}

# key_address KEY: the address an inbox key belongs to (mbx:o:s:n:from:x -> o/s/n, mbx:o:me:from:x -> o/me).
key_address() { local k="${1#mbx:}"; k="${k%:from:*}"; printf '%s' "${k//://}"; }

# new_msg_id: 16 random hex characters, set once by the sender and kept on every retry.
new_msg_id() {
  local h
  h="$(od -An -N8 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n')"
  [[ "$h" =~ ^[0-9a-f]{16}$ ]] || die 18 "could not read /dev/urandom for a message id"
  printf '%s' "$h"
}

# ----- dates (GNU and BSD `date` both; no python)

DATE_GNU=""
date_flavor() {
  if [ -z "$DATE_GNU" ]; then
    if date -d @0 +%s >/dev/null 2>&1; then DATE_GNU=1; else DATE_GNU=0; fi
  fi
}

# fmt_epoch EPOCH FORMAT [utc]: format an epoch in local time, or UTC when a third arg is given.
fmt_epoch() {
  date_flavor
  if [ "$DATE_GNU" = 1 ]; then
    if [ -n "${3:-}" ]; then date -u -d "@$1" "+$2"; else date -d "@$1" "+$2"; fi
  else
    if [ -n "${3:-}" ]; then date -u -r "$1" "+$2"; else date -r "$1" "+$2"; fi
  fi
}

# local_epoch YYYY-MM-DD HH:MM: epoch of that local wall-clock time; prints nothing if it is invalid.
local_epoch() {
  date_flavor
  local e back
  if [ "$DATE_GNU" = 1 ]; then e="$(date -d "$1 $2" +%s 2>/dev/null || true)"
  else e="$(date -j -f '%Y-%m-%d %H:%M:%S' "$1 $2:00" +%s 2>/dev/null || true)"; fi
  [[ "$e" =~ ^[0-9]+$ ]] || return 0
  # BSD date rolls 2023-02-31 over to March; reject anything that does not round-trip.
  back="$(fmt_epoch "$e" '%Y-%m-%d %H:%M')"
  [ "$back" = "$1 $2" ] || return 0
  printf '%s' "$e"
}

AT_EPOCH=""
# parse_at WHEN: sets AT_EPOCH (UTC epoch seconds). Forms: epoch, +<n>m|h|d, HH:MM (next
# occurrence, local), YYYY-MM-DDTHH:MM (local). Anything else dies 2.
parse_at() {
  local w="$1" now n unit hh mm today e
  now="$(now_s)"
  AT_EPOCH=""
  if [[ "$w" =~ ^[0-9]{9,12}$ ]]; then
    AT_EPOCH="$((10#$w))"
  elif [[ "$w" =~ ^\+([0-9]+)([mhd])$ ]]; then
    n="${BASH_REMATCH[1]}"; unit="${BASH_REMATCH[2]}"
    [ "${#n}" -le 6 ] && [ "$((10#$n))" -ge 1 ] || die 2 "--at '$w': the amount must be 1 to 999999"
    case "$unit" in m) n=$((10#$n * 60)) ;; h) n=$((10#$n * 3600)) ;; d) n=$((10#$n * 86400)) ;; esac
    AT_EPOCH=$((now + n))
  elif [[ "$w" =~ ^([01]?[0-9]|2[0-3]):([0-5][0-9])$ ]]; then
    hh="$(printf '%02d' "$((10#${BASH_REMATCH[1]}))")"; mm="${BASH_REMATCH[2]}"
    today="$(fmt_epoch "$now" '%Y-%m-%d')"
    e="$(local_epoch "$today" "$hh:$mm")"
    # cfn: tomorrow is now+24h; a DST change can shift the wall clock by an hour, use a calendar-aware add if that ever matters
    if [ -z "$e" ] || [ "$e" -le "$now" ]; then e="$(local_epoch "$(fmt_epoch $((now + 86400)) '%Y-%m-%d')" "$hh:$mm")"; fi
    AT_EPOCH="$e"
  elif [[ "$w" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})T([01][0-9]|2[0-3]):([0-5][0-9])$ ]]; then
    AT_EPOCH="$(local_epoch "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}:${BASH_REMATCH[3]}")"
  fi
  [[ "$AT_EPOCH" =~ ^[0-9]+$ ]] || die 2 "--at '$w' is not a time (use epoch seconds, +30m, +2h, +1d, HH:MM or YYYY-MM-DDTHH:MM)"
}

key_hash() { printf '%s' "$1" | cksum | awk '{print $1}'; }
marker_key() { printf 'seen:%s:%s:%s' "$MAILBOX_OWNER" "$1" "$(key_hash "$2")"; }

# --------------------------------------------------------------------- send

cmd_send() {
  local kind=fyi thread="" reply_to="" hops_in=0 to="" text="" have_text=0 at="" at_set=0 kind_set=0
  local fleet="" coord_file="" coord="" msg_id_in=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --kind) [ $# -ge 2 ] || die 2 "--kind needs a value"; kind="$2"; kind_set=1; shift 2 ;;
      --fleet) [ $# -ge 2 ] || die 2 "--fleet needs a type"; fleet="$2"; shift 2 ;;
      --coord-file) [ $# -ge 2 ] || die 2 "--coord-file needs a file"; coord_file="$2"; shift 2 ;;
      --msg-id) [ $# -ge 2 ] || die 2 "--msg-id needs a value"; msg_id_in="$2"; shift 2 ;;
      --at) [ $# -ge 2 ] || die 2 "--at needs a time"; at="$2"; at_set=1; shift 2 ;;
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

  if [ "$at_set" = 1 ]; then
    parse_at "$at"
    [ "$kind_set" = 1 ] || kind=reminder   # send-later mail is a reminder unless the sender says otherwise
  fi
  case "$kind" in ask|fyi|reply|reminder) ;; *) die 2 "kind '$kind' not allowed (use ask, fyi, reply or reminder)" ;; esac
  [ "$kind" != reply ] || [ -n "$reply_to" ] || die 2 "kind reply needs --reply-to <message id>"
  [ -z "$reply_to" ] || [[ "$reply_to" =~ ^[0-9]+-[0-9]+$ ]] || die 2 "--reply-to must be a message id like 1700000000000-0"
  [[ "$hops_in" =~ ^[0-9]+$ ]] || die 2 "--hops must be a number"
  [ -z "$thread" ] || [[ "$thread" =~ $NAME_RE ]] || die 2 "--thread must be [a-z0-9-] only"
  [ -z "$fleet" ] || valid_fleet_type "$fleet" || die 2 "--fleet '$fleet' is not a fleet type ($FLEET_TYPES)"
  [ -z "$msg_id_in" ] || [[ "$msg_id_in" =~ $MSG_ID_RE ]] || die 2 "--msg-id must be [A-Za-z0-9_-], 1 to 64 characters"
  if [ -n "$coord_file" ]; then
    [ "$at_set" = 0 ] || die 2 "--coord-file cannot be combined with --at (a coordinator secret is never parked in due:)"
    coord="$(coord_secret "$coord_file")"
    [ -n "$coord" ] || die 2 "no 'coordinator-secret: <hex>' line in $coord_file"
    RC_SECRET="$coord"   # redacted from any Redis error text
  fi

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

  local key from_addr now msg_id
  key="$(inbox_key "$to_owner" "$to_kind" "$to_name" "$MAILBOX_OWNER")"
  from_addr="$(own_from_address)"
  now="$(now_s)"
  msg_id="${msg_id_in:-$(new_msg_id)}"
  local -a f=(from "$from_addr" to "$to_str" kind "$kind" body "$text" sent_at "$now" thread "$thread" hops "$hops" msg_id "$msg_id")
  if [ -n "$reply_to" ]; then f+=(reply_to "$reply_to"); fi
  if [ -n "$fleet" ]; then f+=(fleet "$fleet"); fi
  if [ "$at_set" = 1 ]; then
    # Send later: park it in due:<owner>; the watcher delivers it when it is due (claim, XADD with
    # this msg_id, then ZREM), so a crash repeats the delivery and the receiver shows it once.
    local member
    member="$(jq -n -c --arg key "$key" --arg uid "$(now_ms)-$RANDOM" --argjson bytes "$bytes" \
      --arg from "$from_addr" --arg to "$to_str" --arg kind "$kind" --arg body "$text" --arg sent "$now" \
      --arg thread "$thread" --arg hops "$hops" --arg reply_to "$reply_to" --arg mid "$msg_id" --arg fleet "$fleet" \
      '{key:$key, uid:$uid, bytes:$bytes,
        fields:({from:$from, to:$to, kind:$kind, body:$body, sent_at:$sent, thread:$thread, hops:$hops, msg_id:$mid}
                + (if $reply_to != "" then {reply_to:$reply_to} else {} end)
                + (if $fleet != "" then {fleet:$fleet} else {} end))}')" \
      || die 18 "could not build the send-later entry"
    rcmd ZADD "due:$MAILBOX_OWNER" "$AT_EPOCH" "$member"
    printf 'scheduled for %s UTC (%s local) as %s\n' "$(fmt_epoch "$AT_EPOCH" '%Y-%m-%dT%H:%M:%SZ' utc)" \
      "$(fmt_epoch "$AT_EPOCH" '%Y-%m-%d %H:%M:%S %Z')" "$kind"
    echo "thread=$thread" >&2
    return 0
  fi
  local -a cap=()
  [ "$to_kind" = me ] || cap=(MAXLEN '~' "$INBOX_MAXLEN")
  if [ -n "$coord" ]; then
    # The secret is the last field's value, read by redis-cli from stdin (-x): never in argv.
    RC_XARG="$coord" rcmd XADD "$key" ${cap[@]+"${cap[@]}"} '*' "${f[@]}" coord
  else
    rcmd XADD "$key" ${cap[@]+"${cap[@]}"} '*' "${f[@]}"
  fi
  local id="$RC_OUT"
  [[ "$id" =~ ^[0-9]+-[0-9]+$ ]] || die 18 "unexpected reply to XADD (no message id)"
  rcmd EXPIRE "$key" "$EXPIRE_SECS"

  # The message is already delivered; a failed log write must not turn that into an error.
  local rec
  rec="$(jq -n -c --arg id "$id" --arg from "$from_addr" --arg to "$to_str" --arg kind "$kind" \
    --arg thread "$thread" --argjson hops "$hops" --argjson bytes "$bytes" --argjson at "$now" --arg mid "$msg_id" \
    --arg fleet "$fleet" \
    '{id:$id,msg_id:$mid,from:$from,to:$to,kind:$kind,thread:$thread,hops:$hops,bytes:$bytes,at:$at}
     + (if $fleet != "" then {fleet:$fleet} else {} end)')"
  if ! (rcmd XADD "log:$MAILBOX_OWNER" MAXLEN '~' "$LOG_MAXLEN" '*' rec "$rec") 2>/dev/null; then
    warn "sent $id, but the log entry could not be written"
  fi
  printf '%s\n' "$id"
  echo "thread=$thread" >&2
}

# --------------------------------------------------------------------- read

EMIT_COUNT=0 EMIT_LAST="" EMIT_IDS="" EMIT_N=0
READ_LEFT=""   # `read --max N`: messages still allowed across the whole call (empty = no total cap)
PEEK=""        # `read --peek`: show mail without acknowledging it or moving any marker
SPOOL=""       # `read --spool FILE`: append each message line to FILE before any marker or XACK moves
DELIV_FILE=""  # this reader's delivered set: "msg_id epoch" lines
DELIV_JSON="{}"
QUAR_COUNT=0
COORD_SECRET=""  # this reader's coordinator secret (from MAILBOX_COORD_FILE), set by cmd_read
READER=""        # `read --reader NAME`: a second reader of the same inbox with its own marker

# take_count: how many messages one query may ask for (READ_COUNT, or what is left of --max).
take_count() {
  local n="$READ_COUNT"
  if [ -n "$READ_LEFT" ] && [ "$READ_LEFT" -lt "$n" ]; then n="$READ_LEFT"; fi
  printf '%s' "$n"
}
consume_left() { if [ -n "$READ_LEFT" ]; then READ_LEFT=$((READ_LEFT - $1)); fi; return 0; }

# delivered_load FILE: the msg_ids this reader already showed. Entries older than DELIVERED_TTL are
# pruned (not on a peek, which changes nothing on disk).
delivered_load() {
  DELIV_FILE="$1"; DELIV_JSON="{}"
  [ -f "$DELIV_FILE" ] || return 0
  if [ -z "$PEEK" ]; then
    local cut tmp="$DELIV_FILE.$$"
    cut=$(( $(now_s) - DELIVERED_TTL ))
    if awk -v c="$cut" 'NF >= 2 && $2 ~ /^[0-9]+$/ && $2 + 0 >= c + 0' "$DELIV_FILE" > "$tmp" 2>/dev/null; then
      mv -f "$tmp" "$DELIV_FILE"
    else
      rm -f "$tmp"
    fi
  fi
  DELIV_JSON="$(awk 'NF >= 1 {print $1}' "$DELIV_FILE" | jq -R -s -c 'split("\n") | map(select(. != "") | {(.): true}) | add // {}' 2>/dev/null)" \
    || DELIV_JSON="{}"
  [ -n "$DELIV_JSON" ] || DELIV_JSON="{}"
}

# delivered_add IDS (one per line): remember them as shown, on disk and for the rest of this call.
delivered_add() {
  [ -n "$1" ] || return 0
  local now i
  now="$(now_s)"
  while IFS= read -r i; do [ -n "$i" ] && printf '%s %s\n' "$i" "$now"; done <<<"$1" >> "$DELIV_FILE" \
    || die 18 "cannot write the delivered set $DELIV_FILE"
  DELIV_JSON="$(printf '%s\n' "$1" | jq -R -s -c --argjson d "$DELIV_JSON" '$d + (split("\n") | map(select(. != "") | {(.): true}) | add // {})')" \
    || die 18 "cannot update the delivered set"
}

# quarantine_log JSON-LINES ({key,id,msg_id,reason}): metadata only, never a body.
quarantine_log() {
  ensure_cache_dir || true
  printf '%s\n' "$1" | jq -r --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '"\($t) key=\(.key) id=\(.id) msg_id=\(if .msg_id == "" then "-" else .msg_id end) reason=\(.reason)"' \
    >> "$CACHE_DIR/quarantine.log" 2>/dev/null || warn "could not write $CACHE_DIR/quarantine.log"
}

# emit_msgs JSON KEY SENDER_OWNER: prints one compact JSON line per message that passes the
# checks. Tier and sender_owner come from the key the reader built, never from the message.
# Checks, in order: to must equal the key's address and the from owner must equal the key's
# from:<owner> (else quarantined); a msg_id already shown is dropped. Every id is still returned
# in EMIT_IDS / EMIT_N / EMIT_LAST, so the caller acks or moves its marker past all of them.
emit_msgs() {
  local json="$1" key="$2" sender="$3" tier lines addr cls q mids
  EMIT_COUNT=0; EMIT_LAST=""; EMIT_IDS=""; EMIT_N=0
  case "$json" in ''|null) return 0 ;; esac
  # redis-cli 8 --json (RESP3) returns {"key":[...]}; older/RESP2 returns [["key",[...]]].
  json="$(printf '%s' "$json" | jq -c 'if type == "object" then [to_entries[] | [.key, .value]] else . end')" \
    || die 18 "unreadable reply while reading $key"
  EMIT_IDS="$(printf '%s' "$json" | jq -r '(.[0][1] // [])[] | .[0]')" || die 18 "unreadable reply while reading $key"
  [ -n "$EMIT_IDS" ] || return 0
  EMIT_N="$(printf '%s\n' "$EMIT_IDS" | wc -l | tr -d ' ')"
  EMIT_LAST="$(printf '%s\n' "$EMIT_IDS" | tail -n 1)"
  addr="$(key_address "$key")"
  tier=outside; [ "$sender" = "$MAILBOX_OWNER" ] && tier=teammate
  # Coordinator: same-owner mail whose coord field equals this reader's own secret (MAILBOX_COORD_FILE)
  # and, when MAILBOX_COORD_FROM names the master, whose from is that master (the plan's "master
  # named in its brief"; workers of one run share the secret, so a peer's mail stays teammate).
  # The coord field is removed from every message, matched or not, so no secret is ever printed.
  cls="$(printf '%s' "$json" | jq -c --arg key "$key" --arg tier "$tier" --arg sender "$sender" --arg addr "$addr" \
    --arg idre "$MSG_ID_RE" --argjson seen "$DELIV_JSON" --arg sec "$COORD_SECRET" --arg cfrom "${MAILBOX_COORD_FROM:-}" '
    reduce ((.[0][1] // [])[] | ((([.[1] | _nwise(2) | {(.[0]): .[1]}] | add) // {}) + {id: .[0]})) as $m
      ({seen: $seen, out: []};
       (($m.msg_id // "") | if type == "string" and test($idre) then . else "" end) as $mid
       | if ($m.to // "") != $addr then .out += [{q: "to-mismatch", id: $m.id, mid: $mid}]
         elif ((($m.from // "") | tostring | split("/")[0]) != $sender) then .out += [{q: "from-owner-mismatch", id: $m.id, mid: $mid}]
         elif $mid != "" and .seen[$mid] then .out += [{q: "dup", id: $m.id, mid: $mid}]
         else (if $mid != "" then .seen[$mid] = true else . end)
              | (if $tier == "teammate" and $sec != "" and (($m.coord // "") == $sec)
                    and ($cfrom == "" or ($m.from // "") == $cfrom) then "coordinator" else $tier end) as $t
              | .out += [{q: "", id: $m.id, mid: $mid, m: (($m + {inbox: $key, sender_owner: $sender, tier: $t}) | del(.coord))}]
         end)
    | .out[]')" || die 18 "unreadable reply while reading $key"
  q="$(printf '%s\n' "$cls" | jq -c --arg key "$key" 'select(.q != "" and .q != "dup") | {key: $key, id, msg_id: .mid, reason: .q}')"
  if [ -n "$q" ] && [ -z "$PEEK" ]; then
    quarantine_log "$q"
    QUAR_COUNT=$((QUAR_COUNT + $(printf '%s\n' "$q" | wc -l | tr -d ' ')))
  fi
  lines="$(printf '%s\n' "$cls" | jq -c 'select(.q == "") | .m')"
  [ -n "$lines" ] || return 0
  # Spool first: if this process is killed before the caller moves the marker or acks, the
  # message is on disk and the next run still shows it (peeks consume nothing, so never spool).
  if [ -n "$SPOOL" ] && [ -z "$PEEK" ]; then printf '%s\n' "$lines" >> "$SPOOL" || die 18 "cannot write the spool file $SPOOL"; fi
  printf '%s\n' "$lines"
  EMIT_COUNT="$(printf '%s\n' "$lines" | wc -l | tr -d ' ')"
  if [ -z "$PEEK" ]; then
    mids="$(printf '%s\n' "$cls" | jq -r 'select(.q == "" and .mid != "") | .mid')"
    delivered_add "$mids"
  fi
}

read_group() { # key sender reader
  local key="$1" sender="$2" reader="$3" remaining
  remaining="$(take_count)"
  [ "$remaining" -gt 0 ] || return 0
  RC_TOLERATE=BUSYGROUP rcmd XGROUP CREATE "$key" "$GROUP" 0 MKSTREAM
  rcmdj XREADGROUP GROUP "$GROUP" "$reader" COUNT "$remaining" STREAMS "$key" 0
  emit_msgs "$RC_OUT" "$key" "$sender"
  ack_ids "$key"
  consume_left "$EMIT_COUNT"
  remaining=$((remaining - EMIT_COUNT))
  [ "$remaining" -gt 0 ] || return 0
  rcmdj XREADGROUP GROUP "$GROUP" "$reader" COUNT "$remaining" STREAMS "$key" '>'
  emit_msgs "$RC_OUT" "$key" "$sender"
  ack_ids "$key"
  consume_left "$EMIT_COUNT"
}

ack_ids() { # key; uses EMIT_IDS (acknowledge only after the messages were printed)
  # Peeked group mail stays in the pending list, so the next real read returns it again.
  # Quarantined and repeated mail is acked too (EMIT_IDS holds every id read), so it never returns.
  [ -z "$PEEK" ] || return 0
  [ "$EMIT_N" -gt 0 ] || return 0
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
  local cap
  cap="$(take_count)"
  [ "$cap" -gt 0 ] || return 0
  rcmdj XREAD COUNT "$cap" STREAMS "$key" "$last"
  emit_msgs "$RC_OUT" "$key" "$sender"
  if [ "$EMIT_N" -gt 0 ] && [ -z "$PEEK" ]; then rcmd SET "$marker" "$EMIT_LAST" EX "$EXPIRE_SECS"; fi
  consume_left "$EMIT_COUNT"
}

cmd_read() {
  local as=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --as) [ $# -ge 2 ] || die 2 "--as needs an address"; as="$2"; shift 2 ;;
      --max) [ $# -ge 2 ] || die 2 "--max needs a number"
             [[ "$2" =~ ^[0-9]+$ ]] && [ "$2" -ge 1 ] || die 2 "--max must be a number of 1 or more"
             READ_LEFT="$2"; shift 2 ;;
      --peek) PEEK=1; shift ;;
      --spool) [ $# -ge 2 ] && [ -n "$2" ] || die 2 "--spool needs a file"; SPOOL="$2"; shift 2 ;;
      --reader) [ $# -ge 2 ] || die 2 "--reader needs a name"
                valid_name "$2" || die 10 "invalid reader name '$2' (use [a-z0-9-] only)"
                READER="$2"; shift 2 ;;
      *) die 2 "unknown argument $1 for read" ;;
    esac
  done
  if [ -z "$as" ]; then as="$(own_from_address)"; fi
  parse_addr "$as"
  [ "$A_OWNER" = "$MAILBOX_OWNER" ] || die 10 "can only read your own inboxes (owner $MAILBOX_OWNER), not $A_STR"
  COORD_SECRET="$(coord_secret "${MAILBOX_COORD_FILE:-}")"
  local kind="$A_KIND" name="$A_NAME" addr="$A_STR" reader
  reader="${name:-me}"   # person inbox: one shared marker so any session shows each mail once
  local deliv_name="${SESSION:-$reader}"
  # A second reader (fleet watch beside the master's hook) keeps its own marker and delivered set.
  if [ -n "$READER" ]; then reader="$reader--$READER"; deliv_name="$deliv_name--$READER"; fi

  local -a targets=("$kind:$name")
  if [ "$kind" = s ]; then
    local room rooms
    rcmd HGET "dir:$MAILBOX_OWNER" "$addr"
    rooms="$(printf '%s' "$RC_OUT" | jq -R -r '(fromjson? // {}) | .rooms[]?' 2>/dev/null || true)"
    while IFS= read -r room; do
      [ -n "$room" ] && valid_name "$room" && targets+=("r:$room")
    done <<<"$rooms"
  fi

  # One delivered set per session (the hook reads several addresses as one session); a reader
  # without MAILBOX_SESSION keeps one per address name.
  ensure_cache_dir || true
  delivered_load "$CACHE_DIR/delivered-$deliv_name"

  local t tk tn so key
  for t in "${targets[@]}"; do
    tk="${t%%:*}"; tn="${t#*:}"
    while IFS= read -r key; do
      [ -n "$key" ] || continue
      [ -z "$READ_LEFT" ] || [ "$READ_LEFT" -gt 0 ] || break 2   # --max budget spent
      so="${key##*:from:}"
      if [ "$tk" = p ]; then read_group "$key" "$so" "$reader"; else read_seen "$key" "$so" "$reader" "$tk"; fi
    done < <(receiver_keys "$tk" "$tn")
  done
  if [ "$QUAR_COUNT" -gt 0 ]; then warn "quarantined $QUAR_COUNT message(s) whose to/from did not match their inbox; see $CACHE_DIR/quarantine.log"; fi
}

# --------------------------------------------------------------------- who / log

cmd_who() {
  local cutoff
  cutoff=$(( $(now_s) - WHO_WINDOW ))
  rcmdj HGETALL "dir:$MAILBOX_OWNER"
  if [ "${1:-}" = --seen ]; then
    # address<TAB>last_seen for every entry, any age (fleet watch reads worker liveness from it).
    printf '%s' "$RC_OUT" | jq -r '
      [ (. // [])[] ] as $a
      | [range(0; ($a | length); 2) | {addr: $a[.], v: (($a[. + 1] | fromjson?) // {})}]
      | sort_by(.addr)[]
      | [.addr, ((.v.last_seen // 0) | tostring)] | @tsv' || die 18 "unreadable directory reply"
    return 0
  fi
  [ $# -eq 0 ] || die 2 "who takes no arguments except --seen"
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

# cmd_stats [--hours N]: loop and flood watch over log:<owner> (metadata only, never bodies).
# Exit 0 clean | 1 a LOOP? or FLOOD? line | 2 the window held no messages (examined nothing).
STATS_LOOP_MSGS=6      # a thread with this many messages is a LOOP?
STATS_LOOP_HOPS=3      # ... or this many hops
STATS_FLOOD_MSGS=30    # a sender with MORE than this many in any 3600 s is a FLOOD?
cmd_stats() {
  local hours=168 out
  while [ $# -gt 0 ]; do
    case "$1" in
      --hours) [ $# -ge 2 ] || die 2 "--hours needs a number"; hours="$2"; shift 2 ;;
      *) die 2 "stats takes only [--hours N]" ;;
    esac
  done
  [[ "$hours" =~ ^[0-9]+$ ]] && [ "$hours" -ge 1 ] && [ "$hours" -le 8760 ] || die 2 "--hours takes a number from 1 to 8760"
  local now since
  now="$(now_s)"; since=$(( (now - hours * 3600) * 1000 ))
  rcmdj XRANGE "log:$MAILBOX_OWNER" "$since" +
  out="$(printf '%s' "$RC_OUT" | jq -r --argjson h "$hours" --argjson lm "$STATS_LOOP_MSGS" \
    --argjson lh "$STATS_LOOP_HOPS" --argjson fm "$STATS_FLOOD_MSGS" '
    def top5: sort_by(-.n, .k) | .[:5];
    [ (. // [])[] | (.[1][1] // "" | fromjson? // empty)
      | select(type == "object")
      | {from: (.from // "?"), kind: (.kind // "fyi"), thread: (.thread // "-"),
         hops: ((.hops // 0) | tonumber? // 0),
         at: ((.at // ((.id // "0-0" | split("-")[0] | tonumber? // 0) / 1000)) | floor)} ] as $r
    | if ($r | length) == 0 then "stats: no messages in the last \($h) h; examined nothing"
      else
        "stats: last \($h) h, \($r | length) messages examined",
        "total: \($r | length)",
        "kinds: " + ($r | group_by(.kind) | map("\(.[0].kind)=\(length)") | join(" ")),
        "top senders: " + ($r | group_by(.from) | map({k: .[0].from, n: length}) | top5 | map("\(.k)=\(.n)") | join(" ")),
        ( ($r | group_by(.thread) | map({k: .[0].thread, n: length, hops: (map(.hops) | max)})) as $t
          | "top threads: " + ($t | top5 | map("\(.k) messages=\(.n) max_hops=\(.hops)") | join(" | ")),
          ($t[] | select(.n >= $lm or .hops >= $lh)
            | "LOOP? thread \(.k): \(.n) messages, max hops \(.hops)") ),
        ( $r | group_by(.from)[]
          | {k: .[0].from, ats: (map(.at) | sort)} as $s
          | ([range(0; $s.ats | length) | . as $i | [$s.ats[$i:][] | select(. - $s.ats[$i] < 3600)] | length] | max) as $burst
          | select($burst > $fm)
          | "FLOOD? sender \($s.k): \($burst) messages in one hour" )
      end')" || die 18 "unreadable log reply"
  printf '%s\n' "$out"
  case "$out" in
    *"examined nothing"*) exit 2 ;;
    *$'\n'"LOOP?"*|*$'\n'"FLOOD?"*) exit 1 ;;
  esac
  return 0
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
  # Start at the newest message: record a marker for every key the receiver policy builds.
  local key last
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    rcmdj XREVRANGE "$key" + - COUNT 1
    last="$(printf '%s' "$RC_OUT" | jq -r '.[0][0] // empty' 2>/dev/null || true)"
    [ -n "$last" ] || last="0-0"
    rcmd SET "$(marker_key "$SESSION" "$key")" "$last" EX "$EXPIRE_SECS"
  done < <(receiver_keys r "$ROOM")
  echo "joined $MAILBOX_OWNER/r/$ROOM as $MAILBOX_OWNER/s/$SESSION"
}

cmd_leave() {
  room_arg "${1:-}"
  update_rooms remove "$ROOM"
  echo "left $MAILBOX_OWNER/r/$ROOM"
}

# --------------------------------------------------------------------- heartbeat

# heartbeat [--project P] [--host H] [--tmux T] [--summary S]: refresh this session's directory
# entry (what `who` shows). Keeps the rooms already joined. Used by the hooks.
cmd_heartbeat() {
  local project="" host="" tmux="" summary=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --project) [ $# -ge 2 ] || die 2 "--project needs a value"; project="$2"; shift 2 ;;
      --host) [ $# -ge 2 ] || die 2 "--host needs a value"; host="$2"; shift 2 ;;
      --tmux) [ $# -ge 2 ] || die 2 "--tmux needs a value"; tmux="$2"; shift 2 ;;
      --summary) [ $# -ge 2 ] || die 2 "--summary needs a value"; summary="$2"; shift 2 ;;
      *) die 2 "unknown argument $1 for heartbeat" ;;
    esac
  done
  [ -n "$SESSION" ] || die 19 "set MAILBOX_SESSION to your session name first"
  [ -z "$project" ] || valid_name "$project" || die 10 "invalid project name '$project' (use [a-z0-9-] only)"
  [ -n "$host" ] || host="$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo unknown)"
  summary="${summary:0:$SUMMARY_MAX}"
  alias_touch
  local addr cur new
  addr="$MAILBOX_OWNER/s/$SESSION"
  rcmd HGET "dir:$MAILBOX_OWNER" "$addr"
  cur="$RC_OUT"
  new="$(jq -n -c --arg cur "$cur" --arg host "$host" --arg project "$project" --arg tmux "$tmux" \
    --arg summary "$summary" --argjson now "$(now_s)" '
    (($cur | fromjson?) // {}) as $c
    | $c + {host: $host, last_seen: $now, summary: $summary}
    + (if $project != "" then {project: $project} else {} end)
    + (if $tmux != "" then {tmux_target: $tmux} else {} end)
    | .rooms = ($c.rooms // [])')" || die 18 "could not build the directory entry"
  rcmd HSET "dir:$MAILBOX_OWNER" "$addr" "$new"
}

# --------------------------------------------------------------------- role names (claim)

ALIAS_JSON=""
# alias_value HOLDER CLAIMED_AT LAST_SEEN -> ALIAS_JSON
alias_value() {
  local host
  host="$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo unknown)"
  ALIAS_JSON="$(jq -n -c --arg s "$1" --argjson c "$2" --argjson l "$3" --arg h "$host" \
    '{session_id:$s, host:$h, claimed_at:$c, last_seen:$l}')" || die 18 "could not build the alias entry"
}
# alias_field JSON FIELD: one field of a stored alias entry (empty when unreadable).
alias_field() { printf '%s' "$1" | jq -R -r --arg f "$2" '(fromjson? // {}) | if type == "object" then (.[$f] // empty | tostring) else empty end' 2>/dev/null || true; }

claim_args() { # name -> sets C_NAME C_HOLDER C_KEY, or dies
  C_NAME="${1:-}"
  [ -n "$C_NAME" ] || die 2 "needs a role name"
  valid_name "$C_NAME" || die 10 "invalid role name '$C_NAME' (use [a-z0-9-] only)"
  C_HOLDER="$(holder_id)"
  [ -n "$C_HOLDER" ] || die 19 "no session identity: set CLAUDE_CODE_SESSION_ID, MAILBOX_SESSION_ID or MAILBOX_SESSION"
  C_KEY="alias:$MAILBOX_OWNER:$C_NAME"
}
C_NAME="" C_HOLDER="" C_KEY=""

cmd_claim() {
  claim_args "${1:-}"
  local now cur cs cl cc age lock
  now="$(now_s)"
  alias_value "$C_HOLDER" "$now" "$now"
  rcmd SET "$C_KEY" "$ALIAS_JSON" NX EX "$ALIAS_TTL"
  if [ "$RC_OUT" != OK ]; then
    rcmd GET "$C_KEY"; cur="$RC_OUT"
    cs="$(alias_field "$cur" session_id)"; cl="$(alias_field "$cur" last_seen)"; cc="$(alias_field "$cur" claimed_at)"
    [[ "$cl" =~ ^[0-9]+$ ]] || cl=0
    if [ -n "$cs" ] && [ "$cs" = "$C_HOLDER" ]; then
      # Ours already: refresh last_seen, keep when it was first claimed.
      [[ "$cc" =~ ^[0-9]+$ ]] || cc="$now"
      alias_value "$C_HOLDER" "$cc" "$now"
      rcmd SET "$C_KEY" "$ALIAS_JSON" XX EX "$ALIAS_TTL"
      [ "$RC_OUT" = OK ] || rcmd SET "$C_KEY" "$ALIAS_JSON" NX EX "$ALIAS_TTL"
    else
      age=$((now - cl))
      if [ -n "$cs" ] && [ "$age" -lt "$ALIAS_LIVE" ]; then
        die 21 "$C_NAME is held by another live session on $(alias_field "$cur" host) (seen ${age}s ago); it frees after release or 10 minutes of silence"
      fi
      # Stale holder: take it over under a short lock so two takeovers cannot both win.
      lock="lock:$MAILBOX_OWNER:alias-$C_NAME"
      rcmd SET "$lock" "$C_HOLDER" NX EX 10
      [ "$RC_OUT" = OK ] || die 21 "$C_NAME is being claimed by another session right now; try again"
      rcmd GET "$C_KEY"
      if [ "$RC_OUT" != "$cur" ]; then
        cs="$(alias_field "$RC_OUT" session_id)"; cl="$(alias_field "$RC_OUT" last_seen)"
        [[ "$cl" =~ ^[0-9]+$ ]] || cl=0
        if [ -n "$cs" ] && [ "$cs" != "$C_HOLDER" ] && [ $((now - cl)) -lt "$ALIAS_LIVE" ]; then
          rcmd DEL "$lock"
          die 21 "$C_NAME was just claimed by another session"
        fi
      fi
      rcmd SET "$C_KEY" "$ALIAS_JSON" EX "$ALIAS_TTL"
      rcmd DEL "$lock"
    fi
  fi
  # Read back: only the session whose id is stored holds the name.
  rcmd GET "$C_KEY"
  [ "$(alias_field "$RC_OUT" session_id)" = "$C_HOLDER" ] || die 21 "$C_NAME was taken by another session at the same moment"
  ensure_cache_dir || true
  printf '%s\n' "$C_NAME" > "$(alias_file "$C_HOLDER")" || die 18 "cannot write $(alias_file "$C_HOLDER")"
  echo "claimed $MAILBOX_OWNER/s/$C_NAME"
}

cmd_release() {
  claim_args "${1:-}"
  local cs f
  f="$(alias_file "$C_HOLDER")"
  rcmd GET "$C_KEY"
  cs="$(alias_field "$RC_OUT" session_id)"
  if [ -n "$cs" ] && [ "$cs" != "$C_HOLDER" ]; then
    die 21 "$C_NAME is held by another session; only its holder can release it"
  fi
  [ -z "$cs" ] || rcmd DEL "$C_KEY"
  if [ -f "$f" ] && [ "$(head -n 1 "$f" | tr -d '\r\n ')" = "$C_NAME" ]; then rm -f "$f"; fi
  echo "released $MAILBOX_OWNER/s/$C_NAME"
}

# alias_touch: heartbeat for a claimed role name (SESSION came from this holder's alias file).
# Refreshes last_seen; a name another session has taken is dropped locally with a warning.
alias_touch() {
  local h f cur cs cc now
  h="$(holder_id)"; [ -n "$h" ] || return 0
  f="$(alias_file "$h")"
  [ -f "$f" ] && [ "$(head -n 1 "$f" 2>/dev/null | tr -d '\r\n ')" = "$SESSION" ] || return 0
  rcmd GET "alias:$MAILBOX_OWNER:$SESSION"; cur="$RC_OUT"
  cs="$(alias_field "$cur" session_id)"
  if [ "$cs" = "$h" ]; then
    now="$(now_s)"; cc="$(alias_field "$cur" claimed_at)"
    [[ "$cc" =~ ^[0-9]+$ ]] || cc="$now"
    alias_value "$h" "$cc" "$now"
    rcmd SET "alias:$MAILBOX_OWNER:$SESSION" "$ALIAS_JSON" XX EX "$ALIAS_TTL"
  else
    rm -f "$f"
    warn "lost the role name $SESSION to another session; run claim again to take it back"
  fi
}

cmd_whoami() {
  echo "owner=$MAILBOX_OWNER"
  echo "session=${SESSION:-}"
  echo "address=$(own_from_address)"
}

# --------------------------------------------------------------------- worker outbound queue

# queue <to> [--kind K] [--fleet T] "<text>": put one message in MAILBOX_OUTQ for the hook to send
# (a sandboxed worker cannot reach Redis; hooks run outside the sandbox). Local only: no config.
# File format (one JSON object, also written by cfn-fleet templates/remote-worker.sh without jq):
#   {"to":"<address>","kind":"fyi|ask|reminder","fleet":"<type or empty>","body":"...","msg_id":"..."}
cmd_queue() {
  local outq="${MAILBOX_OUTQ:-}" to="" text="" have_text=0 kind=fyi fleet="" bytes f mid
  [ -n "$outq" ] || die 2 "queue needs MAILBOX_OUTQ (the outbound queue directory)"
  case "$outq" in /*) ;; *) die 2 "MAILBOX_OUTQ must be an absolute path" ;; esac
  while [ $# -gt 0 ]; do
    case "$1" in
      --kind) [ $# -ge 2 ] || die 2 "--kind needs a value"; kind="$2"; shift 2 ;;
      --fleet) [ $# -ge 2 ] || die 2 "--fleet needs a type"; fleet="$2"; shift 2 ;;
      --) shift; break ;;
      -*) die 2 "unknown flag $1 for queue" ;;
      *) if [ -z "$to" ]; then to="$1"; elif [ "$have_text" = 0 ]; then text="$1"; have_text=1; else die 2 "queue takes one <to> and one text"; fi; shift ;;
    esac
  done
  if [ $# -gt 0 ]; then
    [ -n "$to" ] || { to="$1"; shift; }
    if [ $# -gt 0 ] && [ "$have_text" = 0 ]; then text="$1"; have_text=1; fi
  fi
  [ -n "$to" ] && [ "$have_text" = 1 ] || die 2 "queue needs <to> and \"<text>\""
  [[ "$to" =~ ^[a-z0-9-]{1,64}/(me|[spr]/[a-z0-9-]{1,64})$ ]] || die 10 "invalid address '$to' (queue needs a full <owner>/s|p|r/<name> or <owner>/me)"
  case "$kind" in ask|fyi|reminder) ;; *) die 2 "queue kind '$kind' not allowed (use ask, fyi or reminder)" ;; esac
  [ -z "$fleet" ] || valid_fleet_type "$fleet" || die 2 "--fleet '$fleet' is not a fleet type ($FLEET_TYPES)"
  bytes="$(printf '%s' "$text" | wc -c | tr -d ' ')"
  [ "$bytes" -gt 0 ] && [ "$bytes" -le "$BODY_MAX" ] || die 11 "message body must be 1 to $BODY_MAX bytes"
  mkdir -p "$outq" || die 2 "cannot create $outq"
  mid="$(new_msg_id)"
  f="$outq/$(now_ms)-$mid.json"
  jq -n -c --arg to "$to" --arg kind "$kind" --arg fleet "$fleet" --arg body "$text" --arg mid "$mid" \
    '{to:$to, kind:$kind, fleet:$fleet, body:$body, msg_id:$mid}' > "$f.tmp" && mv -f "$f.tmp" "$f" \
    || { rm -f "$f.tmp"; die 18 "cannot write $f"; }
  echo "queued $f"
}

# flush: send every message in MAILBOX_OUTQ as this session, oldest first, removing each once sent.
# Stops (keeping the rest) on a Redis or rate-limit failure; an entry that can never be sent is
# renamed <file>.failed with a warning. The queued msg_id rides along, so a resend shows once.
cmd_flush() {
  local outq="${MAILBOX_OUTQ:-}" f rc n=0 line to kind fleet body mid
  [ -n "$outq" ] || die 2 "flush needs MAILBOX_OUTQ"
  [ -d "$outq" ] || return 0
  for f in "$outq"/*.json; do
    [ -f "$f" ] || continue
    if [ -L "$f" ] || ! line="$(jq -c -e 'select(type == "object" and (.to|type) == "string" and (.body|type) == "string")' "$f" 2>/dev/null)"; then
      mv -f "$f" "$f.failed" 2>/dev/null; warn "flush: $f is not a queue entry; set aside as .failed"; continue
    fi
    to="$(jq -r '.to' <<<"$line")"; kind="$(jq -r '.kind // "fyi"' <<<"$line")"
    fleet="$(jq -r '.fleet // ""' <<<"$line")"; body="$(jq -r '.body' <<<"$line")"; mid="$(jq -r '.msg_id // ""' <<<"$line")"
    local -a a=("$to" --kind "$kind")
    [ -z "$fleet" ] || a+=(--fleet "$fleet")
    [ -z "$mid" ] || ! [[ "$mid" =~ $MSG_ID_RE ]] || a+=(--msg-id "$mid")
    rc=0
    ( cmd_send "${a[@]}" -- "$body" ) || rc=$?
    case "$rc" in
      0) rm -f "$f"; n=$((n + 1)) ;;
      13|15|16|17|18) warn "flush stopped (exit $rc); $f and later entries stay queued"; return "$rc" ;;
      *) mv -f "$f" "$f.failed" 2>/dev/null; warn "flush: $f could not be sent (exit $rc); set aside as .failed" ;;
    esac
  done
  [ "$n" -eq 0 ] || warn "flushed $n message(s) from $outq"
  return 0
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
  local qn=0
  [ ! -f "$CACHE_DIR/quarantine.log" ] || qn="$(wc -l < "$CACHE_DIR/quarantine.log" | tr -d ' ')"
  echo "quarantine: $qn ($CACHE_DIR/quarantine.log)"
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
  rule="$rule ~mbx:$o:* ~mbx:*:from:$o ~dir:$o ~seen:$o:* ~due:$o ~log:$o ~lock:$o:* ~rate:$o:* ~done:$o:* ~claim:$o:* ~alias:$o:*"
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
    queue) cmd_queue "$@" ;;   # local only: no config, no network
    send|read|who|log|stats|join|leave|heartbeat|doctor|claim|release|whoami|flush)
      load_config
      "cmd_$sub" "$@" ;;
    ''|-h|--help|help)
      sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
      [ -n "$sub" ] && exit 0
      exit 2 ;;
    *) die 2 "unknown subcommand '$sub' (send, read, who, log, stats, join, leave, claim, release, whoami, queue, flush, doctor, adduser)" ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
