#!/usr/bin/env bash
# Tests for the mailbox delivery fixes (2026-11-07):
#   Fix 1  the hook finishes well inside its time limit: spooled mail is shown first with no new
#          Redis reads, project + person inboxes are read only on UserPromptSubmit (in parallel),
#          heartbeat at most once per 5 minutes, room join at most once a day.
#   Fix 2  `mailbox.sh read` tells the truth: spooled mail first, then session + project (+ person
#          when attended), and "No new mail." when there is none. The nudge names the real command.
#
# Offline only: the shared fake `redis-cli` (tests/lib/fake-redis-cli.sh) is first on PATH, HOME is
# a scratch directory, no test touches a network.
#
# Usage: bash tests/test-cfn-mailbox-delivery.sh
# Exit codes: 0 all green, 1 a test failed.
set -uo pipefail
unset CLAUDE_CODE_SESSION_ID MAILBOX_SESSION_ID

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
HOOK="$REPO/.claude/hooks/cfn-mailbox-hook.sh"
MB="$REPO/.claude/skills/cfn-mailbox/mailbox.sh"
REGISTER_TS="$REPO/.claude/skills/cfn-mailbox-listener/hooks/register.ts"

PASS=0
FAIL=0
CASES=0
CASE_NAME=""
# shellcheck source=/dev/null
. "$REPO/.claude/cfn-scripts/lib/safe-rm.sh"
# shellcheck source=/dev/null
. "$REPO/tests/lib/fake-redis-cli.sh"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/cfn-mailbox-delivery-test.XXXXXX")" || exit 1
SCRATCH="$(cd -P "$SCRATCH" && pwd -P)" || exit 1
trap 'cfn_safe_rm_tmp "$SCRATCH"' EXIT

ok()   { PASS=$((PASS + 1)); }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL [%s] %s\n' "$CASE_NAME" "$1"; }
assert_eq() { if [ "$1" = "$2" ]; then ok; else bad "$3: expected [$1] got [$2]"; fi; }
assert_contains() { case "$1" in *"$2"*) ok ;; *) bad "$3: missing [$2] in [$1]" ;; esac; }
assert_not_contains() { case "$1" in *"$2"*) bad "$3: unexpected [$2] in [$1]" ;; *) ok ;; esac; }

# ---------------------------------------------------------------- fixtures

PASSWORD="pw-SECRET-do-not-leak-123"
SID="abc123def456"
PROJ="my-proj"
SESS="my-proj-abc123"
SKEY="mbx:michael:s:$SESS:from:michael"
PKEY="mbx:michael:p:$PROJ:from:michael"
MEKEY="mbx:michael:me:from:michael"
CACHE=""
HENV=()

new_case() {
  CASE_NAME="$1"
  CASES=$((CASES + 1))
  T="$SCRATCH/case-$CASES"
  mkdir -p "$T/bin" "$T/home" "$T/work/My_Proj"
  W="$T/work/My_Proj"
  CACHE="$T/home/.cache/cfn-mailbox"
  : > "$T/calls"; : > "$T/rules"
  install_fake_redis_cli "$T/bin"
  cat > "$T/env" <<EOF
MAILBOX_HOST=mbx.example.test
MAILBOX_PORT=6379
MAILBOX_USER=michael
MAILBOX_PASS=$PASSWORD
MAILBOX_OWNER=michael
MAILBOX_PUBLIC=me
MAILBOX_CONTACTS="steve/me steve/p/liaison"
EOF
  chmod 600 "$T/env"
  export FAKE_LOG="$T/calls" FAKE_RULES="$T/rules"
  HENV=()
}

rule() { printf '%s\t%s\n' "$1" "$2" >> "$T/rules"; }

ev() {
  local extra="${2:-}"
  [ -n "$extra" ] || extra='{}'
  jq -n -c --arg e "$1" --arg sid "$SID" --arg cwd "$W" --argjson x "$extra" \
    '{hook_event_name:$e, session_id:$sid, cwd:$cwd} + $x'
}

# hook JSON: run the hook with the fake redis-cli on PATH. Sets OUT, RC.
hook() {
  RC=0
  OUT="$(printf '%s' "$1" | env -u MAILBOX_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u TMUX_PANE -u TMUX \
    PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" CFN_MAILBOX_HOOK_TIMEOUT=30 ${HENV[@]+"${HENV[@]}"} \
    bash "$HOOK" 2>/dev/null)" || RC=$?
}

# mbr ARGS...: run mailbox.sh as session $SESS from inside the project. Sets OUT, ERR, RC.
mbr() {
  RC=0
  OUT="$(cd "$W" && env -u CLAUDE_CODE_SESSION_ATTENDED PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" \
    MAILBOX_SESSION="$SESS" ${HENV[@]+"${HENV[@]}"} bash "$MB" "$@" 2>"$T/stderr" </dev/null)" || RC=$?
  ERR="$(cat "$T/stderr")"
}

cmds() { grep '^CMD	' "$T/calls" | cut -f2-; }
has_cmd() { cmds | grep -F -q -- "$1"; }
count_cmd() { cmds | grep -F -c -- "$1" || true; }
yn() { if "$@"; then echo yes; else echo no; fi; }
key_to() { printf '%s' "$1" | sed -e 's/^mbx://' -e 's/:from:.*$//' -e 's#:#/#g'; }

mkmsg() { # KEY ID FROM KIND BODY
  jq -n -c --arg key "$1" --arg id "$2" --arg from "$3" --arg kind "$4" --arg body "$5" --arg to "$(key_to "$1")" \
    '[[$key, [[$id, ["from",$from,"to",$to,"kind",$kind,"body",$body,"sent_at","1","thread","t","hops","0"]]]]]'
}
spool_line() { # ID KIND BODY [KEY]
  jq -n -c --arg id "$1" --arg kind "$2" --arg body "$3" --arg key "${4:-$SKEY}" \
    '{id:$id, from:"michael/s/zzz", to:"michael/s/x", kind:$kind, body:$body, sent_at:"1", thread:"t", hops:"0", inbox:$key, sender_owner:"michael", tier:"teammate"}'
}
ctx() { printf '%s' "$OUT" | jq -r '.hookSpecificOutput.additionalContext // empty'; }
header_count() { ctx | grep -c '^\[mail ' || true; }

# slow_redis PATTERN SECONDS: wrap the fake so commands matching PATTERN sleep first.
slow_redis() {
  mv "$T/bin/redis-cli" "$T/bin/redis-cli-real"
  cat > "$T/bin/redis-cli" <<WRAP
#!/usr/bin/env bash
case "\$*" in $1) sleep $2 ;; esac
exec "$T/bin/redis-cli-real" "\$@"
WRAP
  chmod +x "$T/bin/redis-cli"
}
fast_redis() { mv "$T/bin/redis-cli-real" "$T/bin/redis-cli"; }

# ---------------------------------------------------------------- Fix 1: hook

test_timeout_spool_first() {
  new_case "timeout: mail spooled by a run the timeout killed is shown first next run, with no new Redis read"
  rule "XREAD COUNT * STREAMS $SKEY *" "$(mkmsg "$SKEY" 1700000000001-0 michael/s/zzz ask 'held by a killed run')"
  slow_redis '*"SET seen:"*' 30
  HENV=(CFN_MAILBOX_HOOK_TIMEOUT=3)
  hook "$(ev UserPromptSubmit '{"prompt":"hi"}')"
  assert_eq "" "$OUT" "killed run printed nothing (so it showed nothing)"
  assert_contains "$(cat "$CACHE/spool-$SESS" 2>/dev/null)" "held by a killed run" "mail kept in the spool, not lost"
  fast_redis
  HENV=()
  : > "$T/calls"
  hook "$(ev PostToolUse '{"tool_name":"Bash"}')"
  assert_contains "$(ctx)" "held by a killed run" "spooled mail emitted on the next event"
  assert_eq "1" "$(header_count)" "shown once"
  assert_eq "0" "$(count_cmd 'XREAD')" "no new Redis read while the spool held mail"
  assert_eq "no" "$(yn test -s "$CACHE/spool-$SESS")" "spool trimmed after the print"
}

test_post_tool_use_spool_bypasses_throttle() {
  new_case "PostToolUse: spooled mail is shown even inside the 15 s check window"
  mkdir -p "$CACHE"
  spool_line 1700000000009-0 fyi "waiting in the spool" > "$CACHE/spool-$SESS"
  date +%s > "$CACHE/check-$SESS"
  hook "$(ev PostToolUse '{"tool_name":"Bash"}')"
  assert_contains "$(ctx)" "waiting in the spool" "shown without waiting for the throttle"
}

test_event_scope() {
  new_case "PostToolUse reads only the session inbox (no project, no person)"
  HENV=(CLAUDE_CODE_SESSION_ATTENDED=1)
  hook "$(ev PostToolUse '{"tool_name":"Bash"}')"
  assert_eq "yes" "$(yn has_cmd "STREAMS $SKEY ")" "session inbox read"
  assert_eq "no" "$(yn has_cmd "$PKEY")" "project inbox not read"
  assert_eq "no" "$(yn has_cmd "$MEKEY")" "person inbox not read"

  new_case "Stop peeks only the session inbox"
  HENV=(CLAUDE_CODE_SESSION_ATTENDED=1)
  hook "$(ev Stop '{"stop_hook_active":false}')"
  assert_eq "yes" "$(yn has_cmd "STREAMS $SKEY ")" "session inbox peeked"
  assert_eq "no" "$(yn has_cmd "$PKEY")" "project inbox not read"
  assert_eq "no" "$(yn has_cmd "$MEKEY")" "person inbox not read"

  new_case "SessionStart reads only the session inbox"
  HENV=(CLAUDE_CODE_SESSION_ATTENDED=1)
  hook "$(ev SessionStart)"
  assert_eq "yes" "$(yn has_cmd "STREAMS $SKEY ")" "session inbox read"
  assert_eq "no" "$(yn has_cmd "$PKEY")" "project inbox not read"
  assert_eq "no" "$(yn has_cmd "$MEKEY")" "person inbox not read"

  new_case "UserPromptSubmit reads session, project and (attended) person inboxes"
  HENV=(CLAUDE_CODE_SESSION_ATTENDED=1)
  hook "$(ev UserPromptSubmit '{"prompt":"hi"}')"
  assert_eq "yes" "$(yn has_cmd "STREAMS $SKEY ")" "session inbox read"
  assert_eq "yes" "$(yn has_cmd "STREAMS $PKEY ")" "project inbox read"
  assert_eq "yes" "$(yn has_cmd "STREAMS $MEKEY ")" "person inbox read"
}

test_parallel_reads() {
  new_case "UserPromptSubmit: the three inboxes are read in parallel, all mail shown"
  rule "XREAD COUNT * STREAMS $SKEY *" "$(mkmsg "$SKEY" 1700000000001-0 michael/s/a fyi 'from session')"
  rule "XREADGROUP GROUP readers * STREAMS $PKEY 0" "$(mkmsg "$PKEY" 1700000000002-0 michael/s/b fyi 'from project')"
  rule "XREAD COUNT * STREAMS $MEKEY *" "$(mkmsg "$MEKEY" 1700000000003-0 michael/s/c fyi 'from person')"
  # Each read costs 2 s: session 1 call, project 2, person 2 (two sender keys). In sequence that is
  # 10 s; in parallel the slowest address, 4 s.
  slow_redis '*XREAD*' 2
  HENV=(CLAUDE_CODE_SESSION_ATTENDED=1)
  local t0 t1
  t0="$(date +%s)"
  hook "$(ev UserPromptSubmit '{"prompt":"hi"}')"
  t1="$(date +%s)"
  if [ $((t1 - t0)) -lt 8 ]; then ok; else bad "took $((t1 - t0)) s; the reads ran one after another"; fi
  local c; c="$(ctx)"
  assert_contains "$c" "from session" "session mail"
  assert_contains "$c" "from project" "project mail"
  assert_contains "$c" "from person" "person mail"
  assert_eq "3" "$(header_count)" "three messages"
  fast_redis
  : > "$T/rules"
  hook "$(ev UserPromptSubmit '{"prompt":"again"}')"
  assert_eq "" "$OUT" "nothing left over in any spool"
}

test_cap_leftover() {
  new_case "cap: mail over the 20-message cap stays spooled and is shown next event without a Redis read"
  local many ten
  many="$(jq -n -c --arg k "$SKEY" --arg to "$(key_to "$SKEY")" '[[$k, [range(0;15) | ["17000000\(1000+.)-0", ["from","michael/s/z","to",$to,"kind","fyi","body","s\(.)","thread","t","hops","0"]]]]]')"
  ten="$(jq -n -c --arg k "$PKEY" --arg to "$(key_to "$PKEY")" '[[$k, [range(0;10) | ["17000001\(1000+.)-0", ["from","michael/s/z","to",$to,"kind","fyi","body","p\(.)","thread","t","hops","0"]]]]]')"
  rule "XREAD COUNT * STREAMS $SKEY *" "$many"
  rule "XREADGROUP GROUP readers * STREAMS $PKEY 0" "$ten"
  hook "$(ev UserPromptSubmit '{"prompt":"hi"}')"
  assert_eq "20" "$(header_count)" "first event shows 20"
  : > "$T/calls"
  hook "$(ev UserPromptSubmit '{"prompt":"again"}')"
  assert_eq "5" "$(header_count)" "the 5 left over shown next"
  assert_eq "0" "$(count_cmd 'XREAD')" "from the spool, no Redis read"
}

test_heartbeat_and_join_throttle() {
  new_case "heartbeat: at most once per 5 minutes"
  mkdir -p "$CACHE"
  echo $(( $(date +%s) - 120 )) > "$CACHE/hb-$SESS"
  hook "$(ev UserPromptSubmit '{"prompt":"hi"}')"
  assert_eq "no" "$(yn has_cmd "HSET dir:michael michael/s/$SESS ")" "no heartbeat 2 minutes after the last"
  echo $(( $(date +%s) - 400 )) > "$CACHE/hb-$SESS"
  hook "$(ev UserPromptSubmit '{"prompt":"hi"}')"
  assert_eq "yes" "$(yn has_cmd "HSET dir:michael michael/s/$SESS ")" "heartbeat once 5 minutes passed"

  new_case "room join: at most once a day per session name"
  hook "$(ev SessionStart)"
  hook "$(ev SessionStart)"
  assert_eq "1" "$(count_cmd "XREVRANGE mbx:michael:r:$PROJ:from:michael")" "joined once for two SessionStarts"
  echo 1 > "$CACHE/join-$SESS"
  hook "$(ev SessionStart)"
  assert_eq "2" "$(count_cmd "XREVRANGE mbx:michael:r:$PROJ:from:michael")" "joined again once the stamp aged"
}

# ---------------------------------------------------------------- Fix 2: read

test_read_truth() {
  new_case "read: no mail anywhere prints 'No new mail.'"
  mbr read
  assert_eq "0" "$RC" "exit 0"
  assert_eq "No new mail." "$OUT" "explicit empty answer"

  new_case "read: spooled mail first, then new mail; the spool is cleared"
  mkdir -p "$CACHE"
  spool_line 1700000000008-0 ask "held for this session" > "$CACHE/spool-$SESS"
  spool_line 1700000000009-0 fyi "held project mail" "$PKEY" > "$CACHE/spool-$SESS@p"
  rule "XREAD COUNT * STREAMS $SKEY *" "$(mkmsg "$SKEY" 1700000000010-0 michael/s/zzz fyi 'brand new')"
  mbr read
  assert_eq "0" "$RC" "exit 0 (stderr: $ERR)"
  assert_contains "$OUT" "held for this session" "session spool shown"
  assert_contains "$OUT" "held project mail" "project spool shown"
  assert_contains "$OUT" "brand new" "new mail shown"
  local first; first="$(printf '%s\n' "$OUT" | head -n 1)"
  assert_contains "$first" "held for this session" "spooled mail comes first"
  assert_not_contains "$OUT" "No new mail." "no empty line when mail was shown"
  assert_eq "no" "$(yn test -s "$CACHE/spool-$SESS")" "session spool cleared"
  assert_eq "no" "$(yn test -s "$CACHE/spool-$SESS@p")" "project spool cleared"

  new_case "read: session + project inboxes; person inbox only when attended"
  mbr read
  assert_eq "yes" "$(yn has_cmd "STREAMS $SKEY ")" "session inbox"
  assert_eq "yes" "$(yn has_cmd "STREAMS $PKEY ")" "project inbox"
  assert_eq "no" "$(yn has_cmd "$MEKEY")" "person inbox not read when unattended"
  : > "$T/calls"
  HENV=(CLAUDE_CODE_SESSION_ATTENDED=1)
  mbr read
  assert_eq "yes" "$(yn has_cmd "STREAMS $MEKEY ")" "person inbox read when attended"

  new_case "read: the project comes from the session's directory entry when it has one"
  rule "HGET dir:michael michael/s/$SESS" '{"project":"other-proj","rooms":[],"last_seen":1}'
  mbr read
  assert_eq "yes" "$(yn has_cmd "STREAMS mbx:michael:p:other-proj:from:michael ")" "project from the directory entry"

  # Regression (mdtwii-master / aa-cx, 2026-11-07): with an empty spool, dedupe_msgs' grep '^{'
  # exited 1 and, under set -e + pipefail, killed plain `read` before Redis was read: exit 1, no
  # output, so sessions believed they had no mail.
  new_case "read: an empty spool file does not hide new Redis mail"
  mkdir -p "$CACHE"
  : > "$CACHE/spool-$SESS"
  : > "$T/calls"
  rule "XREAD COUNT * STREAMS $SKEY *" "$(mkmsg "$SKEY" 1700000000011-0 michael/s/zzz fyi 'after empty spool')"
  mbr read
  assert_eq "0" "$RC" "exit 0 with an empty spool (stderr: $ERR)"
  assert_contains "$OUT" "after empty spool" "Redis mail shown after an empty spool"

  new_case "read --as: output unchanged (no 'No new mail.' line), spool untouched"
  mkdir -p "$CACHE"
  spool_line 1700000000008-0 ask "still held" > "$CACHE/spool-$SESS"
  mbr read --as "michael/s/$SESS"
  assert_eq "" "$OUT" "empty as before"
  assert_contains "$(cat "$CACHE/spool-$SESS")" "still held" "spool kept for the hook"
}

test_nudge_text() {
  new_case "nudge: names the real read command, same text in mailbox.sh and the listener"
  local want='You have mail: run $HOME/.claude/skills/cfn-mailbox/mailbox.sh read' got ts
  got="$(bash -c '. "$1" >/dev/null 2>&1; printf "%s" "$NUDGE_TEXT"' _ "$MB")"
  assert_eq "$want" "$got" "mailbox.sh NUDGE_TEXT"
  ts="$(sed -n "s/^export const NUDGE_TEXT = '\(.*\)'$/\1/p" "$REGISTER_TS")"
  assert_eq "$want" "$ts" "register.ts NUDGE_TEXT"
  assert_not_contains "$got$ts" "/mail read" "no reference to a /mail command"
}

test_timeout_spool_first
test_post_tool_use_spool_bypasses_throttle
test_event_scope
test_parallel_reads
test_cap_leftover
test_heartbeat_and_join_throttle
test_read_truth
test_nudge_text

printf '\n%d cases, %d passed, %d failed\n' "$CASES" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
