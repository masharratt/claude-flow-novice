#!/usr/bin/env bash
# mailbox-watch.sh: wakes idle tmux sessions when mail lands, and runs the mailbox lifecycle
# jobs (send-later, bounce, expiry). Spec: planning/PLAN_agent-mailbox.md (stage 4).
#
# Usage:
#   mailbox-watch.sh run [--nudge|--lifecycle]      loop forever (start by hand on macOS)
#   mailbox-watch.sh once [--nudge|--lifecycle]     one pass of everything (tests, cron)
#   mailbox-watch.sh install-systemd                Linux: write and enable the user service
#   mailbox-watch.sh status                         last log lines, systemd state, session states
#
# It reuses mailbox.sh (sourced): one implementation of config, redis calls, key building and the
# receiver policy (receiver_keys: a contact owner's key only for a MAILBOX_PUBLIC address).
#
# Waking: each pass reads the directory, picks this machine's sessions that run in tmux, and does
# one plain XREAD (no group, no marker moves) over their inbox keys from its own last-notified ids
# (~/.cache/cfn-mailbox/watch-ids). New ask/reminder mail (and replies of 40+ characters) types
# NUDGE_TEXT (defined once in mailbox.sh) into the pane of an idle session, at most once a minute per
# session. Room mail of any kind never nudges (stage 6); session and project mail do. Idle comes from the hook's state file ~/.cache/cfn-mailbox/state-<session>.
#
# Lifecycle (every 60 s, only when `SET lock:<owner>:lifecycle <host> NX EX 60` succeeds):
# send-later delivery, 24 h session and 7 d project bounces, 7 d session expiry. Both writers are
# crash-safe and at least once: send-later claims (`SET claim:<owner>:<msg_id> <host> NX EX 120`),
# XADDs with the stored msg_id, then ZREMs; a bounce is XADDed (msg_id b-<hash>) before its done
# marker and before the original is removed. A repeat is dropped by the receiver's msg_id check.
#
# Errors: one timestamped line in ~/.cache/cfn-mailbox/watch.log (never a secret), back off
# 5 s doubling to 60 s, and `run` never exits on a Redis error.
#
# Exit codes: 0 ok | 1 a pass failed (once) | 2 usage | 21 install-systemd unsupported here
#   22 systemctl failed | plus mailbox.sh's own (78 no config, ...)
#
# Test hooks (not config): MAILBOX_NOW fake clock, MAILBOX_NUDGE_DELAY (default 1) pause between
# the text and Enter, MAILBOX_WATCH_BLOCK_MS (XREAD BLOCK; `run` defaults to 5000, `once` to none),
# MAILBOX_WATCH_INTERVAL (default 2) pause between healthy passes, MAILBOX_WATCH_MAX_PASSES.
set -euo pipefail

WATCH_SELF="${BASH_SOURCE[0]}"
WATCH_DIR="$(cd "$(dirname "$WATCH_SELF")" && pwd -P)"
# shellcheck source=mailbox.sh
. "$WATCH_DIR/mailbox.sh"

# Limits (named constants; one place). NUDGE_TEXT and CACHE_DIR come from mailbox.sh.
NUDGE_COOLDOWN=60          # seconds between nudges to one session
NEW_KEY_LOOKBACK=600       # a key seen for the first time is read from at most 10 minutes back
NEW_KEY_MARGIN=5           # ... and from 5 s before its session's heartbeat (clock skew, SessionStart order)
LISTENER_FRESH=90          # a listener-<session> file younger than this means the mod wakes that session
LIFECYCLE_EVERY=60
LOCK_TTL=60
SESSION_BOUNCE_AGE=86400   # 24 h
PROJECT_BOUNCE_AGE=604800  # 7 d
EXPIRE_AGE=604800          # 7 d
DONE_TTL=604800
CLAIM_TTL=120              # a send-later claim; a watcher that died holding one is retried after this
DUE_BATCH=50
PAGE=100
PAGES_MAX=10
BACKOFF_MIN=5
BACKOFF_MAX=60
RUN_BLOCK_MS=5000
UNIT_NAME=cfn-mailbox-watch.service

WLOG="$CACHE_DIR/watch.log"
IDS_FILE="$CACHE_DIR/watch-ids"
WORK="$CACHE_DIR/w.$$"
HOST="$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo unknown)"
BLOCK_MS="${MAILBOX_WATCH_BLOCK_MS:-}"

wlog() { # one line, redacted
  ensure_cache_dir || return 0
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(redact "$1")" >> "$WLOG" 2>/dev/null || true
}

# guard LABEL CMD...: run CMD in a subshell so a die() inside it (mailbox.sh exits on Redis
# errors) ends only that part. Logs one line on failure; returns 1.
guard() {
  local label="$1" rc=0 errf="$WORK.err.$$.$RANDOM"
  shift
  ensure_cache_dir || true
  set +e
  ( set -e; "$@" ) 2>"$errf"
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    wlog "$label failed (exit $rc): $(head -n 1 "$errf" 2>/dev/null | cut -c1-300)"
    rm -f "$errf"
    return 1
  fi
  rm -f "$errf"
  return 0
}

# ------------------------------------------------------------------ directory

DIRF="$WORK.dir"
# load_dir: rows "name|project|last_seen|host|rooms|tmux" for this owner's sessions (any host).
# tmux is last so a "|" inside a target cannot shift the other columns.
load_dir() {
  rcmdj HGETALL "dir:$MAILBOX_OWNER"
  printf '%s' "$RC_OUT" | jq -r --arg pre "$MAILBOX_OWNER/s/" '
    (if type == "object" then to_entries | map({a: .key, v: .value})
     elif type == "array" then . as $a | [range(0; length; 2) | {a: $a[.], v: $a[. + 1]}]
     else [] end)
    | .[]
    | select(.a | startswith($pre))
    | (.v | if type == "string" then (fromjson? // {}) else (. // {}) end) as $e
    | [(.a | ltrimstr($pre)), ($e.project // ""), (($e.last_seen // 0) | tostring), ($e.host // ""),
       (($e.rooms // []) | join(",")), ($e.tmux_target // "")]
    | join("|")' > "$DIRF" || die 18 "unreadable directory reply"
  # keep only rows whose name is a valid session name
  local keep="$DIRF.keep" row
  : > "$keep"
  while IFS= read -r row; do
    valid_name "${row%%|*}" && printf '%s\n' "$row" >> "$keep"
  done < "$DIRF"
  mv -f "$keep" "$DIRF"
}

row_field() { # ROW N (1-based, "|"-separated; the last column keeps any "|")
  local row="$1" n="$2" i
  for ((i = 1; i < n; i++)); do row="${row#*|}"; done
  if [ "$n" -lt 6 ]; then printf '%s' "${row%%|*}"; else printf '%s' "$row"; fi
}
R_NAME=1; R_PROJECT=2; R_SEEN=3; R_HOST=4; R_ROOMS=5; R_TMUX=6

# ------------------------------------------------------------------ nudging

session_idle() { # NAME
  local w=""
  read -r w _ 2>/dev/null < "$CACHE_DIR/state-$1" || return 1
  [ "$w" = idle ]
}

# tmux_cmd and pane_alive live in mailbox.sh (sourced above); the heartbeat uses them too.

# maybe_nudge NAME TMUX: honour the 60 s cap, then type the text and press Enter.
maybe_nudge() {
  local name="$1" target="$2" now last=0 stamp="$CACHE_DIR/nudge-$1"
  now="$(now_s)"
  # A live `mailbox.sh listen` (the Claude Code mod) wakes this session itself; typing too would double it.
  local lf="$CACHE_DIR/listener-$1" seen=0
  read -r seen 2>/dev/null < "$lf" || seen=0
  if [[ "$seen" =~ ^[0-9]+$ ]] && [ $((now - seen)) -lt "$LISTENER_FRESH" ]; then
    wlog "nudge $name: listener live, skipped"
    return 0
  fi
  read -r last 2>/dev/null < "$stamp" || last=0
  [[ "$last" =~ ^[0-9]+$ ]] || last=0
  [ $((now - last)) -ge "$NUDGE_COOLDOWN" ] || return 0
  if ! command -v tmux >/dev/null 2>&1; then wlog "nudge $name skipped: tmux is not installed"; return 0; fi
  # "<socket>|<pane_id>" (hook-written) targets a pane on its own tmux socket; a bare target is a
  # session:window.pane on the default socket (older directory entries).
  local -a TM; local TM_TARGET
  tmux_cmd "$target"
  local -a tm=("${TM[@]}"); target="$TM_TARGET"
  # A Codex session (client-<name> says so) gets text without slash commands; it has no prompt hook,
  # so the nudge itself marks it busy and the launcher's notify hook marks it idle after the turn.
  local text="$NUDGE_TEXT" client="" is_codex=""
  read -r client 2>/dev/null < "$CACHE_DIR/client-$name" || client=""
  if [ "$client" = codex ]; then text="$NUDGE_TEXT_CODEX"; is_codex=1; fi
  if "${tm[@]}" send-keys -t "$target" -l -- "$text" >/dev/null 2>&1; then
    sleep "${MAILBOX_NUDGE_DELAY:-1}"
    "${tm[@]}" send-keys -t "$target" Enter >/dev/null 2>&1 || { wlog "nudge $name: Enter failed"; return 0; }
    printf '%s\n' "$now" > "$stamp"
    if [ -n "$is_codex" ]; then printf 'busy %s\n' "$now" > "$CACHE_DIR/state-$name" 2>/dev/null || true; fi
  else
    wlog "nudge $name: tmux could not reach pane $target"
  fi
  return 0
}

# ids file: "key|id" lines. ids_get KEY; ids_set KEY ID
ids_get() { [ -f "$IDS_FILE" ] || return 0; awk -F'|' -v k="$1" '$1 == k {v = $2} END {if (v != "") print v}' "$IDS_FILE"; }
ids_set() {
  local tmp="$IDS_FILE.$$"
  { [ ! -f "$IDS_FILE" ] || awk -F'|' -v k="$1" '$1 != k' "$IDS_FILE"; printf '%s|%s\n' "$1" "$2"; } > "$tmp"
  mv -f "$tmp" "$IDS_FILE"
}

# pick_project_session PROJECT: the idle local session of that project with the newest last_seen.
pick_project_session() {
  local row name
  while IFS= read -r row; do
    name="$(row_field "$row" $R_NAME)"
    if session_idle "$name"; then printf '%s' "$name"; return 0; fi
  done < <(awk -F'|' -v p="$1" '$2 == p' "$SESSF" | sort -t'|' -k3,3nr)
  return 0
}

SESSF="$WORK.sessions"
MAPF="$WORK.map"
KEYSF="$WORK.keys"
MSGSF="$WORK.msgs"

nudge_pass() {
  load_dir
  local now cutoff row name project seen host rooms tmux room key
  # last_seen only refreshes on hook events, so an idle worker (the one that needs a wake) ages out of
  # WHO_WINDOW. Waking therefore accepts a local row seen within SESSION_BOUNCE_AGE whose pane still exists.
  now="$(now_s)"; cutoff=$((now - SESSION_BOUNCE_AGE))
  : > "$SESSF"; : > "$MAPF"
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    host="$(row_field "$row" $R_HOST)"; seen="$(row_field "$row" $R_SEEN)"; tmux="$(row_field "$row" $R_TMUX)"
    [ "$host" = "$HOST" ] && [[ "$seen" =~ ^[0-9]+$ ]] && [ "$seen" -ge "$cutoff" ] && [ -n "$tmux" ] || continue
    pane_alive "$tmux" || continue
    printf '%s\n' "$row" >> "$SESSF"
    name="$(row_field "$row" $R_NAME)"; project="$(row_field "$row" $R_PROJECT)"; rooms="$(row_field "$row" $R_ROOMS)"
    # receiver_keys: an outside owner's key only for a public address, so mail injected into a
    # private address never wakes anyone.
    while IFS= read -r key; do [ -z "$key" ] || printf '%s|s|%s|%s\n' "$key" "$name" "$seen" >> "$MAPF"; done < <(receiver_keys s "$name")
    if [ -n "$project" ] && valid_name "$project"; then
      while IFS= read -r key; do [ -z "$key" ] || printf '%s|p|%s|%s\n' "$key" "$project" "$seen" >> "$MAPF"; done < <(receiver_keys p "$project")
    fi
    # Room mail is never watched for waking (stage 6): an ask in a mesh room would wake every idle
    # subscriber at once and they would all answer. Rooms are shown at the next prompt instead.
  done < "$DIRF"
  cut -d'|' -f1 "$MAPF" | sort -u > "$KEYSF"
  # forget keys nobody here watches any more
  if [ -f "$IDS_FILE" ]; then
    awk -F'|' 'NR == FNR {k[$1] = 1; next} ($1 in k)' "$KEYSF" "$IDS_FILE" > "$IDS_FILE.$$" && mv -f "$IDS_FILE.$$" "$IDS_FILE"
  fi
  [ -s "$KEYSF" ] || return 0

  # Start each new key just before the earliest heartbeat of the sessions behind it (at most
  # NEW_KEY_LOOKBACK back). Mail older than that was shown at those sessions' turns; mail that landed
  # between a session's start and this first sight still wakes it. Starting at the stream's newest
  # entry skipped exactly that mail (2026-10-16).
  local id last first start
  local -a keys=() ids=()
  while IFS= read -r key; do
    id="$(ids_get "$key")"
    if [ -z "$id" ]; then
      first="$(awk -F'|' -v k="$key" '$1 == k {print $4}' "$MAPF" | sort -n | head -n 1)"
      [[ "$first" =~ ^[0-9]+$ ]] || first="$now"
      start=$((first - NEW_KEY_MARGIN))
      [ "$start" -ge $((now - NEW_KEY_LOOKBACK)) ] || start=$((now - NEW_KEY_LOOKBACK))
      id="${start}000-0"
      ids_set "$key" "$id"
    fi
    keys+=("$key"); ids+=("$id")
  done < "$KEYSF"

  local -a xa=(XREAD COUNT "$PAGE")
  [ -z "$BLOCK_MS" ] || xa+=(BLOCK "$BLOCK_MS")
  xa+=(STREAMS "${keys[@]}" "${ids[@]}")
  rcmdj "${xa[@]}"
  case "$RC_OUT" in ''|null) return 0 ;; esac

  local norm='(if type == "object" then [to_entries[] | [.key, .value]] elif type == "array" then . else [] end)'
  # one row per message: key|id|kind|body bytes
  printf '%s' "$RC_OUT" | jq -r "$norm"'[]
    | .[0] as $k | (.[1] // [])[]
    | (([.[1] | _nwise(2) | {(.[0]): .[1]}] | add) // {}) as $f
    | [$k, .[0], ($f.kind // "fyi"), (($f.body // "") | utf8bytelength | tostring)] | join("|")' > "$MSGSF" \
    || die 18 "unreadable XREAD reply"
  # advance our own ids before nudging, so a failed nudge is not retried forever
  while IFS='|' read -r key id; do
    [ -n "$key" ] && [ -n "$id" ] && ids_set "$key" "$id"
  done < <(printf '%s' "$RC_OUT" | jq -r "$norm"'[] | select((.[1] // []) | length > 0) | [.[0], (.[1][-1][0])] | join("|")')

  local kind len type target tgt
  while IFS='|' read -r key id kind len; do
    [ -n "$key" ] || continue
    eligible "$kind" "$len" || continue
    while IFS='|' read -r _ type target _; do
      case "$type" in
        s|r) name="$target" ;;
        p) name="$(pick_project_session "$target")" ;;
        *) continue ;;
      esac
      [ -n "$name" ] || continue
      session_idle "$name" || continue
      tgt="$(row_field "$(awk -F'|' -v n="$name" '$1 == n' "$SESSF" | head -n 1)" $R_TMUX)"
      [ -n "$tgt" ] || continue
      maybe_nudge "$name" "$tgt"
    done < <(awk -F'|' -v k="$key" '$1 == k' "$MAPF")
  done < "$MSGSF"
}

# ------------------------------------------------------------------ lifecycle

life_lock() {
  rcmd SET "lock:$MAILBOX_OWNER:lifecycle" "$HOST" NX EX "$LOCK_TTL"
  [ "$RC_OUT" = OK ]
}

# ----- send-later

# due_msg_id MEMBER: the msg_id stored at `send --at` time; a member queued before msg_ids existed
# gets a stable one derived from the member itself, so every retry still carries the same id.
due_msg_id() {
  local mid
  mid="$(printf '%s' "$1" | jq -r '.fields.msg_id // empty' 2>/dev/null || true)"
  [[ "$mid" =~ $MSG_ID_RE ]] || mid="l-$(key_hash "$1")"
  printf '%s' "$mid"
}

# deliver_due MEMBER MSG_ID: write a claimed member into its inbox (the caller removes it after).
deliver_due() {
  local m="$1" mid="$2" key f now bytes rec
  local -a fa=()
  now="$(now_s)"
  key="$(printf '%s' "$m" | jq -r '.key // empty')" || return 1
  # Only this owner's own :from: keys; anything else in due: is not ours to write.
  if ! [[ "$key" =~ ^mbx:[a-z0-9-]+:(me|[spr]:[a-z0-9-]+):from:$MAILBOX_OWNER$ ]]; then
    wlog "dropped a send-later entry with an unusable target key"
    return 0
  fi
  while IFS= read -r -d '' f; do fa+=("$f"); done < <(printf '%s' "$m" | jq -j --arg now "$now" --arg mid "$mid" '
    (.fields // {}) + {deliver_at: $now, msg_id: $mid} | to_entries[] | .key, "\u0000", (.value | tostring), "\u0000"')
  [ "${#fa[@]}" -ge 2 ] || { wlog "dropped an empty send-later entry"; return 0; }
  if [[ "$key" == mbx:*:me:from:* ]]; then
    rcmd XADD "$key" '*' "${fa[@]}"
  else
    rcmd XADD "$key" MAXLEN '~' "$INBOX_MAXLEN" '*' "${fa[@]}"
  fi
  local id="$RC_OUT"
  rcmd EXPIRE "$key" "$EXPIRE_SECS"
  # Delivered already: a failed log write must not look like a failed delivery.
  rec="$(printf '%s' "$m" | jq -c --arg id "$id" --argjson at "$now" --arg mid "$mid" '
    .fields as $f | {id:$id, msg_id:$mid, from:$f.from, to:$f.to, kind:$f.kind, thread:$f.thread,
                     hops:(($f.hops // "0") | tonumber? // 0), bytes:(.bytes // 0), at:$at}' 2>/dev/null || true)"
  if [ -n "$rec" ]; then ( rcmd XADD "log:$MAILBOX_OWNER" MAXLEN '~' "$LOG_MAXLEN" '*' rec "$rec" ) 2>/dev/null || true; fi
  return 0
}

# Claim, deliver, then remove. Crash after the claim: the claim expires and a later pass delivers.
# Crash after the XADD: a later pass XADDs again with the same msg_id and the receiver shows it once.
# A second watcher fails the claim and leaves the member alone.
job_send_later() {
  local now m members failed=0 mid
  now="$(now_s)"
  rcmdj ZRANGEBYSCORE "due:$MAILBOX_OWNER" -inf "$now" LIMIT 0 "$DUE_BATCH"
  members="$(printf '%s' "$RC_OUT" | jq -r 'if type == "array" then .[] else empty end')" || die 18 "unreadable due list"
  while IFS= read -r m; do
    [ -n "$m" ] || continue
    mid="$(due_msg_id "$m")"
    rcmd SET "claim:$MAILBOX_OWNER:$mid" "$HOST" NX EX "$CLAIM_TTL"
    [ "$RC_OUT" = OK ] || continue           # claimed elsewhere (or by a watcher that died: retried after expiry)
    if guard "send-later delivery" deliver_due "$m" "$mid"; then
      guard "send-later remove" rcmd ZREM "due:$MAILBOX_OWNER" "$m" || failed=1
    else
      failed=1                               # still queued; retried once the claim expires
    fi
  done <<<"$members"
  [ "$failed" = 0 ] || die 18 "a send-later delivery did not finish; it stays queued and is retried"
}

# ----- bounce

# entry_json: stdin is an XRANGE reply; prints one compact object per entry ({id, field...}).
entries_of() {
  jq -c '(if type == "array" then . else [] end)[] | ({id: .[0]} + (([.[1] | _nwise(2) | {(.[0]): .[1]}] | add) // {}))'
}

# bounce_target FROM: the address a bounce goes to (sets TARGET_KIND TARGET_NAME).
TARGET_KIND="" TARGET_NAME=""
bounce_target() {
  local from="$1" fo fn seen row
  TARGET_KIND=me TARGET_NAME=""
  if [[ "$from" =~ ^([a-z0-9-]+)/s/([a-z0-9-]+)$ ]]; then
    fo="${BASH_REMATCH[1]}"; fn="${BASH_REMATCH[2]}"
    # Another owner's directory is not ours to read: their person inbox is the safe address.
    [ "$fo" = "$MAILBOX_OWNER" ] || { BT_OWNER="$fo"; return 0; }
    row="$(awk -F'|' -v n="$fn" '$1 == n' "$DIRF" | head -n 1)"
    seen="$(row_field "$row" $R_SEEN)"
    BT_OWNER="$fo"
    if [ -n "$row" ] && [[ "$seen" =~ ^[0-9]+$ ]] && [ $(( $(now_s) - seen )) -lt "$SESSION_BOUNCE_AGE" ]; then
      TARGET_KIND=s TARGET_NAME="$fn"
    fi
  elif [[ "$from" =~ ^([a-z0-9-]+)/me$ ]]; then
    BT_OWNER="${BASH_REMATCH[1]}"
  else
    BT_OWNER="$MAILBOX_OWNER"
  fi
}
BT_OWNER=""

# bounce_entry KEY ENTRY_JSON [GROUP]: return one unread message to its sender, safe to repeat.
# Order: XADD the bounce (stable msg_id), then the done marker, then XACK/XDEL the original. A
# failure before the marker leaves no marker, so a later pass retries; a repeated XADD carries the
# same msg_id and the receiver shows it once; a set marker means only the removal is left to do.
bounce_entry() {
  local key="$1" e="$2" group="${3:-}" id kind from to body ms utc tkey now dkey done_v
  id="$(printf '%s' "$e" | jq -r '.id')"
  kind="$(printf '%s' "$e" | jq -r '.kind // "fyi"')"
  [ "$kind" != bounce ] || return 0          # bounces never bounce
  from="$(printf '%s' "$e" | jq -r '.from // ""')"
  to="$(printf '%s' "$e" | jq -r '.to // ""')"
  body="$(printf '%s' "$e" | jq -r '(.body // "") | .[0:200] | gsub("[\\r\\n\\t]"; " ")')"
  # The id alone can repeat across streams, so the key hash is part of the marker name.
  dkey="done:$MAILBOX_OWNER:$id:$(key_hash "$key")"
  rcmd GET "$dkey"
  done_v="$(printf '%s' "$RC_OUT" | tr -d '\r\n ')"
  case "$done_v" in ''|'(nil)') ;; *) bounce_remove "$key" "$id" "$group"; return 0 ;; esac
  bounce_target "$from"
  ms="${id%%-*}"
  utc="$(fmt_epoch $((ms / 1000)) '%Y-%m-%dT%H:%MZ' utc)"
  [ -n "$to" ] || to="$(printf '%s' "$key" | cut -d: -f2-4 | tr ':' '/')"
  now="$(now_s)"
  tkey="$(inbox_key "$BT_OWNER" "$TARGET_KIND" "$TARGET_NAME" "$MAILBOX_OWNER")"
  local taddr="$BT_OWNER/me"
  [ "$TARGET_KIND" = me ] || taddr="$BT_OWNER/s/$TARGET_NAME"
  local -a f=(from "$MAILBOX_OWNER/me" to "$taddr" kind bounce
    body "undelivered: $to has not read this since $utc: $body" sent_at "$now"
    thread "$(printf '%s' "$e" | jq -r '.thread // "-"')" hops "$(printf '%s' "$e" | jq -r '.hops // "0"')" reply_to "$id"
    msg_id "b-$(key_hash "$key|$id")")
  if [ "$TARGET_KIND" = me ]; then rcmd XADD "$tkey" '*' "${f[@]}"
  else rcmd XADD "$tkey" MAXLEN '~' "$INBOX_MAXLEN" '*' "${f[@]}"; fi
  rcmd EXPIRE "$tkey" "$EXPIRE_SECS"
  rcmd SET "$dkey" 1 EX "$DONE_TTL"
  bounce_remove "$key" "$id" "$group"
}

bounce_remove() { # KEY ID [GROUP]: the bounce is written; take the original out of the inbox
  if [ -n "${3:-}" ]; then rcmd XACK "$1" "$3" "$2"; fi
  rcmd XDEL "$1" "$2"
}

# bounce_range KEY START MAXAGE [GROUP]: bounce entries after START (exclusive id) that are older
# than MAXAGE seconds (age from the stream id, never from a machine clock the sender set).
bounce_range() {
  local key="$1" start="$2" age="$3" group="${4:-}" cut_ms pages=0 page e last n
  cut_ms=$(( ($(now_s) - age) * 1000 ))
  while [ "$pages" -lt "$PAGES_MAX" ]; do
    rcmdj XRANGE "$key" "($start" "$cut_ms" COUNT "$PAGE"
    page="$(printf '%s' "$RC_OUT" | entries_of)" || die 18 "unreadable range reply for $key"
    [ -n "$page" ] || return 0
    n=0; last=""
    while IFS= read -r e; do
      [ -n "$e" ] || continue
      n=$((n + 1))
      last="$(printf '%s' "$e" | jq -r '.id')"
      # the server filtered by range; check again so a loose reply cannot bounce young mail
      [ "$(printf '%s' "$e" | jq -r '.id | split("-")[0] | tonumber')" -le "$cut_ms" ] || continue
      bounce_entry "$key" "$e" "$group"
    done <<<"$page"
    [ "$n" -ge "$PAGE" ] || return 0
    start="$last"; pages=$((pages + 1))
  done
}

session_keys() { receiver_keys s "$1"; }   # NAME -> the session's inbox keys under the receiver policy

# bounce_session NAME AGE: unread mail in a session's inboxes (after its reader marker) older than AGE.
bounce_session() {
  local name="$1" age="$2" key last
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    rcmd GET "$(marker_key "$name" "$key")"
    last="$(printf '%s' "$RC_OUT" | tr -d '\r\n ')"
    [[ "$last" =~ ^[0-9]+-[0-9]+$ ]] || last="0-0"
    bounce_range "$key" "$last" "$age"
  done < <(session_keys "$name")
}

job_bounce_sessions() {
  load_dir
  local row
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    bounce_session "$(row_field "$row" $R_NAME)" "$SESSION_BOUNCE_AGE"
  done < "$DIRF"
}

# bounce_project KEY: pending (claimed, never acknowledged) plus never-delivered entries, 7 d old.
bounce_project() {
  local key="$1" cut_ms ldid id e
  cut_ms=$(( ($(now_s) - PROJECT_BOUNCE_AGE) * 1000 ))
  RC_TOLERATE="NOGROUP" rcmdj XPENDING "$key" "$GROUP" - + "$PAGE"
  while IFS= read -r id; do
    [[ "$id" =~ ^[0-9]+-[0-9]+$ ]] || continue
    [ "${id%%-*}" -le "$cut_ms" ] || continue
    rcmdj XRANGE "$key" "$id" "$id"
    e="$(printf '%s' "$RC_OUT" | entries_of | head -n 1)"
    [ -z "$e" ] || bounce_entry "$key" "$e" "$GROUP"
  done < <(printf '%s' "$RC_OUT" | jq -r 'if type == "array" then .[] | .[0] else empty end' 2>/dev/null || true)
  RC_TOLERATE="no such key" rcmdj XINFO GROUPS "$key"
  ldid="$(printf '%s' "$RC_OUT" | jq -r '
    (if type == "array" then .[] else empty end)
    | (if type == "object" then . else (. as $a | [range(0; length; 2) | {($a[.]): $a[. + 1]}] | add) end)
    | select(.name == "readers") | ."last-delivered-id" // empty' 2>/dev/null | head -n 1 || true)"
  [[ "$ldid" =~ ^[0-9]+-[0-9]+$ ]] || ldid="0-0"
  bounce_range "$key" "$ldid" "$PROJECT_BOUNCE_AGE" "$GROUP"
}

job_bounce_projects() {
  load_dir
  local p key
  while IFS= read -r p; do
    [ -n "$p" ] && valid_name "$p" || continue
    while IFS= read -r key; do
      [ -z "$key" ] || guard "project bounce $p" bounce_project "$key" || true
    done < <(receiver_keys p "$p")
  done < <(cut -d'|' -f2 "$DIRF" | sort -u)
}

# ----- expiry

job_expire() {
  load_dir
  local now row name seen rooms key room markers keys so
  now="$(now_s)"
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    name="$(row_field "$row" $R_NAME)"; seen="$(row_field "$row" $R_SEEN)"; rooms="$(row_field "$row" $R_ROOMS)"
    [[ "$seen" =~ ^[0-9]+$ ]] && [ "$seen" -gt 0 ] && [ $((now - seen)) -ge "$EXPIRE_AGE" ] || continue
    # Unread mail goes back to its senders first; a failure here (die) stops before any DEL.
    bounce_session "$name" 0
    # Cleanup deletes every sender owner's copy (nothing is read), so mail injected into a private
    # address goes too; only the bounce scan above follows the receiver policy.
    keys=(); markers=()
    while IFS= read -r so; do
      key="$(inbox_key "$MAILBOX_OWNER" s "$name" "$so")"
      keys+=("$key"); markers+=("$(marker_key "$name" "$key")")
    done < <(sender_owners)
    for room in ${rooms//,/ }; do
      valid_name "$room" || continue
      while IFS= read -r so; do markers+=("$(marker_key "$name" "$(inbox_key "$MAILBOX_OWNER" r "$room" "$so")")"); done < <(sender_owners)
    done
    rcmd DEL "${keys[@]}" "${markers[@]}"
    rcmd HDEL "dir:$MAILBOX_OWNER" "$MAILBOX_OWNER/s/$name"
  done < "$DIRF"
}

lifecycle_all() {
  life_lock || return 0
  local rc=0
  guard "send-later" job_send_later || rc=1
  guard "session bounce" job_bounce_sessions || rc=1
  guard "project bounce" job_bounce_projects || rc=1
  guard "expiry" job_expire || rc=1
  return "$rc"
}

# ------------------------------------------------------------------ commands

PART=""   # nudge | lifecycle | "" (both)

# codex_wake_pass: run the Codex session's wake helper (codex-wake.py, owned by Codex) once, in the
# background so its pass (up to CODEX_WAKE_TIMEOUT s) never holds up other wake-ups. Only when
# python3, the helper and ~/.cache/codex-mailbox (its registrations) exist; one run at a time; a
# failure is logged and never fails the watcher.
CODEX_WAKE_TIMEOUT=45
codex_wake_pass() {
  local helper="${MAILBOX_CODEX_WAKE:-$WATCH_DIR/codex-wake.py}" pidf="$CACHE_DIR/codex-wake.pid" pid
  command -v python3 >/dev/null 2>&1 && [ -f "$helper" ] && [ -d "$HOME/.cache/codex-mailbox" ] || return 0
  pid="$(cat "$pidf" 2>/dev/null || true)"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then return 0; fi
  (
    python3 "$helper" once >> "$CACHE_DIR/codex-wake.log" 2>&1 &
    local child=$! rc=0
    ( sleep "$CODEX_WAKE_TIMEOUT"; kill "$child" 2>/dev/null ) &
    local timer=$!
    wait "$child" || rc=$?
    kill "$timer" 2>/dev/null || true
    [ "$rc" -eq 0 ] || wlog "codex-wake exited $rc"
    rm -f "$pidf"
  ) >/dev/null 2>&1 &
  printf '%s\n' "$!" > "$pidf"
}

pass_all() { # one pass; returns 1 when a part failed
  local rc=0
  if [ "$PART" != lifecycle ]; then
    guard "nudge pass" nudge_pass || rc=1
    codex_wake_pass || true
  fi
  if [ "$PART" != nudge ]; then
    if [ "${FORCE_LIFE:-}" = 1 ] || [ $(( $(now_s) - LAST_LIFE )) -ge "$LIFECYCLE_EVERY" ]; then
      LAST_LIFE="$(now_s)"
      guard "lifecycle" lifecycle_all || rc=1
    fi
  fi
  return "$rc"
}
LAST_LIFE=0

parse_part() {
  case "${1:-}" in
    '') PART="" ;;
    --nudge) PART=nudge ;;
    --lifecycle) PART=lifecycle ;;
    *) echo "mailbox-watch: unknown argument $1" >&2; exit 2 ;;
  esac
}

cmd_once() {
  parse_part "${1:-}"
  FORCE_LIFE=1
  pass_all
}

cmd_run() {
  parse_part "${1:-}"
  [ -n "$BLOCK_MS" ] || BLOCK_MS="$RUN_BLOCK_MS"
  local delay=0 passes=0 max="${MAILBOX_WATCH_MAX_PASSES:-}"
  while :; do
    if pass_all; then
      delay=0
      sleep "${MAILBOX_WATCH_INTERVAL:-2}"
    else
      if [ "$delay" -eq 0 ]; then delay="$BACKOFF_MIN"; else delay=$((delay * 2)); fi
      [ "$delay" -le "$BACKOFF_MAX" ] || delay="$BACKOFF_MAX"
      sleep "$delay"
    fi
    passes=$((passes + 1))
    if [ -n "$max" ] && [ "$passes" -ge "$max" ]; then break; fi
  done
}

cmd_install_systemd() {
  if [ "$(uname -s 2>/dev/null)" != Linux ]; then
    echo "mailbox-watch: install-systemd only works on Linux. On this machine start the watcher by hand: bash $WATCH_DIR/mailbox-watch.sh run" >&2
    exit 21
  fi
  local udir="$HOME/.config/systemd/user" unit
  unit="$udir/$UNIT_NAME"
  mkdir -p "$udir"
  {
    printf '[Unit]\nDescription=CFN agent mailbox watcher\nAfter=network-online.target\n\n[Service]\nType=simple\n'
    printf 'ExecStart=/bin/bash "%s/mailbox-watch.sh" run\n' "$WATCH_DIR"
    [ -z "${MAILBOX_CONFIG:-}" ] || printf 'Environment=MAILBOX_CONFIG=%s\n' "$MAILBOX_CONFIG"
    printf 'Restart=always\nRestartSec=10\n\n[Install]\nWantedBy=default.target\n'
  } > "$unit"
  systemctl --user daemon-reload || { echo "mailbox-watch: systemctl daemon-reload failed" >&2; exit 22; }
  systemctl --user enable --now "$UNIT_NAME" || { echo "mailbox-watch: systemctl enable failed" >&2; exit 22; }
  echo "installed $unit and started it. To keep it running after logout: loginctl enable-linger \$USER" >&2
}

cmd_status() {
  echo "log:    $WLOG"
  if [ -s "$WLOG" ]; then tail -n 5 "$WLOG"; else echo "(no log lines yet)"; fi
  if command -v systemctl >/dev/null 2>&1; then
    echo "systemd: $(systemctl --user is-active "$UNIT_NAME" 2>/dev/null || echo not-running)"
  fi
  local f
  for f in "$CACHE_DIR"/state-*; do
    [ -f "$f" ] || continue
    printf '%s\t%s\n' "${f##*/state-}" "$(cat "$f")"
  done
}

main() {
  local sub="${1:-}"
  [ $# -gt 0 ] && shift
  ensure_cache_dir || true
  trap 'rm -f "$WORK".* "$IDS_FILE.$$"' EXIT
  case "$sub" in
    run|once) load_config; "cmd_$sub" "$@" ;;
    install-systemd) cmd_install_systemd ;;
    status) cmd_status ;;
    ''|-h|--help|help) sed -n '2,12p' "$WATCH_SELF" | sed 's/^# \{0,1\}//' >&2; [ -n "$sub" ] && exit 0; exit 2 ;;
    *) echo "mailbox-watch: unknown subcommand '$sub' (run, once, install-systemd, status)" >&2; exit 2 ;;
  esac
}

main "$@"
