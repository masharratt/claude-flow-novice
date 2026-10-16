#!/usr/bin/env bash
# Tests for `mailbox.sh listen`, `mailbox.sh unread`, `mailbox.sh whoami --sid` and the shared
# session-name resolver (agent mailbox, stage 6 "listener for the Claude Code mod").
#
# Offline only: a fake `redis-cli` (tests/lib/fake-redis-cli.sh) goes first on PATH, HOME points at a
# scratch directory, MAILBOX_NOW is a fake clock. Never touches a network, real tmux or real HOME.
#
# Usage: bash tests/test-cfn-mailbox-listen.sh
# Exit codes: 0 all green, 1 a test failed.
#
# No `set -e`: assertions must all run so every failure shows in one pass.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
MB="$REPO/.claude/skills/cfn-mailbox/mailbox.sh"
WATCH="$REPO/.claude/skills/cfn-mailbox/mailbox-watch.sh"
HOOK="$REPO/.claude/hooks/cfn-mailbox-hook.sh"

PASS=0
FAIL=0
CASES=0
CASE_NAME=""
# shellcheck source=/dev/null
. "$REPO/.claude/cfn-scripts/lib/safe-rm.sh"
# shellcheck source=/dev/null
. "$REPO/tests/lib/fake-redis-cli.sh"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/cfn-mailbox-listen-test.XXXXXX")" || exit 1
SCRATCH="$(cd -P "$SCRATCH" && pwd -P)" || exit 1
trap 'cfn_safe_rm_tmp "$SCRATCH"' EXIT

ok()   { PASS=$((PASS + 1)); }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL [%s] %s\n' "$CASE_NAME" "$1"; }
assert_eq() { if [ "$1" = "$2" ]; then ok; else bad "$3: expected [$1] got [$2]"; fi; }
assert_contains() { case "$2" in "") bad "$3: empty needle" ;; esac; case "$1" in *"$2"*) ok ;; *) bad "$3: missing [$2] in [$1]" ;; esac; }
assert_not_contains() { case "$1" in *"$2"*) bad "$3: unexpected [$2] in [$1]" ;; *) ok ;; esac; }
assert_rc() { if [ "$RC" = "$1" ]; then ok; else bad "$2: exit expected $1 got $RC (stderr: $ERR)"; fi; }
yn() { if "$@"; then echo yes; else echo no; fi; }
fmode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1" 2>/dev/null; }

# ---------------------------------------------------------------- fixtures

PASSWORD="pw-SECRET-do-not-leak-123"
NOW=1700000000
SID="abc123def456"
LONGBODY="please look at the failing build and tell me what changed since lunch"   # >= 40 bytes
SKEY="mbx:michael:s:my-proj-abc123:from:michael"
PKEY="mbx:michael:p:my-proj:from:michael"
RKEY="mbx:michael:r:ops:from:michael"
CACHE=""
LENV=()

new_case() {
  CASE_NAME="$1"
  CASES=$((CASES + 1))
  T="$SCRATCH/case-$CASES"
  mkdir -p "$T/bin" "$T/home" "$T/work/My_Proj"
  CACHE="$T/home/.cache/cfn-mailbox"
  : > "$T/calls"; : > "$T/rules"; : > "$T/sleeplog"
  install_fake_redis_cli "$T/bin"
  printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" >> "%s"\n' "$T/sleeplog" > "$T/bin/sleep"
  chmod +x "$T/bin/sleep"
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
  LENV=()
}

rule() { printf '%s\t%s\n' "$1" "$2" >> "$T/rules"; }
cmds() { grep '^CMD	' "$T/calls" | cut -f2-; }
has_cmd() { cmds | grep -F -q -- "$1"; }
count_cmd() { cmds | grep -F -c -- "$1" || true; }

run_env() { # CMD... : fakes on PATH, clean session env. Sets OUT ERR RC.
  RC=0
  OUT="$(env -u MAILBOX_SESSION -u MAILBOX_SESSION_ID -u CLAUDE_CODE_SESSION_ID -u TMUX_PANE \
    PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" MAILBOX_NOW="$NOW" TZ=UTC \
    ${LENV[@]+"${LENV[@]}"} "$@" 2>"$T/stderr" </dev/null)" || RC=$?
  ERR="$(cat "$T/stderr")"
}
mbx() { run_env bash "$MB" "$@"; }
listen_once() { LENV+=(MAILBOX_LISTEN_ONCE=1); mbx listen --sid "$SID" --cwd "$T/work/My_Proj" "$@"; }

# xr KEY ID KIND BODY: XREAD reply (redis-cli 8 object shape) with one message addressed to KEY.
xr() {
  local to="${1#mbx:}"; to="${to%%:from:*}"; to="${to//://}"
  jq -n -c --arg k "$1" --arg id "$2" --arg kind "$3" --arg body "$4" --arg to "$to" \
    '{($k): [[$id, ["from","michael/s/zzz","to",$to,"kind",$kind,"body",$body,"sent_at","1","thread","t-a","hops","0"]]]}'
}

# ---------------------------------------------------------------- resolver / whoami

test_resolver() {
  new_case "whoami --sid: <project>-<first 6 of sid>, project from cwd, sanitized and lowercased"
  mbx whoami --sid "$SID" --cwd "$T/work/My_Proj"
  assert_rc 0 "whoami"
  assert_eq "my-proj-abc123" "$OUT" "derived name"

  new_case "whoami --sid: MAILBOX_SESSION wins"
  LENV+=(MAILBOX_SESSION=role-x)
  mbx whoami --sid "$SID" --cwd "$T/work/My_Proj"
  assert_eq "role-x" "$OUT" "env session"

  new_case "whoami --sid: a claimed role name (alias file for the sid) wins over the derived name"
  mkdir -p "$CACHE"; printf 'builder\n' > "$CACHE/alias-$SID"
  mbx whoami --sid "$SID" --cwd "$T/work/My_Proj"
  assert_eq "builder" "$OUT" "alias"

  new_case "whoami --sid: an invalid alias file is ignored"
  mkdir -p "$CACHE"; printf 'Bad Name!\n' > "$CACHE/alias-$SID"
  mbx whoami --sid "$SID" --cwd "$T/work/My_Proj"
  assert_eq "my-proj-abc123" "$OUT" "bad alias ignored"

  new_case "whoami without flags keeps the three-line owner/session/address form"
  LENV+=(MAILBOX_SESSION=s9)
  mbx whoami
  assert_contains "$OUT" "owner=michael" "owner line"
  assert_contains "$OUT" "address=michael/s/s9" "address line"

  new_case "one resolver: the hook and listen share it (no second copy of the derivation)"
  assert_eq "yes" "$(yn grep -q '^resolve_session()' "$MB")" "mailbox.sh defines resolve_session"
  assert_eq "no" "$(yn grep -q 'alias-\$SID' "$HOOK")" "hook no longer reads the alias file itself"
  assert_eq "yes" "$(yn grep -q 'resolve_session' "$HOOK")" "hook calls resolve_session"

  new_case "hook and whoami agree on the session name (directory heartbeat address)"
  local w="$T/work/My_Proj" input
  input="$(jq -n -c --arg sid "$SID" --arg cwd "$w" '{hook_event_name:"SessionStart", session_id:$sid, cwd:$cwd}')"
  printf '%s' "$input" | env -u MAILBOX_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u TMUX_PANE -u TMUX \
    PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" CFN_MAILBOX_HOOK_TIMEOUT=30 \
    bash "$HOOK" >/dev/null 2>&1
  mbx whoami --sid "$SID" --cwd "$w"
  assert_eq "yes" "$(yn has_cmd "HSET dir:michael michael/s/$OUT ")" "hook heartbeat used $OUT"

  new_case "one eligible(): lives in mailbox.sh, not duplicated in the watcher"
  assert_eq "yes" "$(yn grep -q '^eligible()' "$MB")" "mailbox.sh defines eligible"
  assert_eq "no" "$(yn grep -q '^eligible()' "$WATCH")" "watcher does not redefine it"
}

# ---------------------------------------------------------------- listen

test_listen() {
  new_case "listen: ready line first, then one metadata-only mail line; body never printed"
  rule "XREVRANGE $SKEY *" '[["1700000000000-0",["from","a","kind","fyi","body","old"]]]'
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask "secret-body-text")"
  listen_once
  assert_rc 0 "listen once"
  assert_eq "2" "$(printf '%s\n' "$OUT" | wc -l | tr -d ' ')" "two lines"
  assert_eq '{"event":"ready","session":"my-proj-abc123"}' "$(printf '%s\n' "$OUT" | sed -n 1p)" "ready line"
  assert_eq '{"event":"mail","id":"1700000000500-0","addr_kind":"s","from":"michael/s/zzz","kind":"ask","bytes":16,"wake":true}' \
    "$(printf '%s\n' "$OUT" | sed -n 2p)" "mail line"
  assert_not_contains "$OUT" "secret-body-text" "body not printed"

  new_case "listen: reads exactly its own keys with plain XREAD BLOCK 25000 from the newest id; consumes nothing"
  rule "XREVRANGE $SKEY *" '[["1700000000000-0",["from","a","kind","fyi","body","old"]]]'
  rule "HGET dir:michael michael/s/my-proj-abc123" '{"rooms":["ops"]}'
  listen_once
  assert_eq "yes" "$(yn has_cmd "XREAD BLOCK 25000 STREAMS $SKEY $PKEY $RKEY 1700000000000-0 0-0 0-0")" "one XREAD over session, project and room keys"
  assert_eq "0" "$(count_cmd XREADGROUP)" "no group read"
  assert_eq "0" "$(count_cmd XACK)" "no ack"
  assert_eq "0" "$(count_cmd 'SET ')" "no marker moved"
  assert_eq "0" "$(count_cmd XGROUP)" "no group created"

  new_case "listen: wake rules match the watcher (ask/reminder wake, fyi/bounce never, reply only from 40 bytes)"
  local kind body expect
  for spec in "ask|hello|true" "reminder|hello|true" "fyi|$LONGBODY|false" "bounce|$LONGBODY|false" "reply|thanks|false" "reply|$LONGBODY|true"; do
    kind="${spec%%|*}"; body="${spec#*|}"; expect="${body##*|}"; body="${body%|*}"
    new_case "listen: wake kind=$kind bytes=${#body} -> $expect"
    rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 "$kind" "$body")"
    listen_once
    assert_eq "$expect" "$(printf '%s\n' "$OUT" | sed -n 2p | jq -r '.wake')" "wake for $kind"
  done

  new_case "listen: project mail reports addr_kind p; room mail reports r and never wakes, even an ask"
  rule "HGET dir:michael michael/s/my-proj-abc123" '{"rooms":["ops"]}'
  rule "XREAD *" "$(jq -n -c --arg p "$PKEY" --arg r "$RKEY" \
    '{($p): [["1700000000600-0",["from","michael/s/zzz","to","michael/p/my-proj","kind","ask","body","hi","sent_at","1","thread","t","hops","0"]]],
      ($r): [["1700000000700-0",["from","michael/s/zzz","to","michael/r/ops","kind","ask","body","hi","sent_at","1","thread","t","hops","0"]]]}')"
  listen_once
  assert_eq "p" "$(printf '%s\n' "$OUT" | sed -n 2p | jq -r '.addr_kind')" "project kind"
  assert_eq "true" "$(printf '%s\n' "$OUT" | sed -n 2p | jq -r '.wake')" "project ask wakes"
  assert_eq "r" "$(printf '%s\n' "$OUT" | sed -n 3p | jq -r '.addr_kind')" "room kind"
  assert_eq "false" "$(printf '%s\n' "$OUT" | sed -n 3p | jq -r '.wake')" "room never wakes"

  new_case "listen: a message whose to does not match its key is not reported"
  rule "XREAD *" "$(jq -n -c --arg k "$SKEY" '{($k): [["1700000000500-0",["from","michael/s/zzz","to","michael/s/someone-else","kind","ask","body","hi"]]]}')"
  listen_once
  assert_eq "1" "$(printf '%s\n' "$OUT" | wc -l | tr -d ' ')" "only the ready line"

  new_case "listen: touches listener-<session> with the epoch, mode 600"
  listen_once
  assert_eq "$NOW" "$(tr -d '\r\n ' < "$CACHE/listener-my-proj-abc123" 2>/dev/null)" "epoch in file"
  assert_eq "600" "$(fmode "$CACHE/listener-my-proj-abc123")" "file mode"

  new_case "listen: redis down -> one down event (no secret), no crash; recovery -> up"
  rule "XREVRANGE *" '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  rule "HGET *" '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  listen_once
  assert_rc 0 "down is not fatal"
  assert_eq "down" "$(printf '%s\n' "$OUT" | sed -n 2p | jq -r '.event')" "down event"
  assert_contains "$(printf '%s\n' "$OUT" | sed -n 2p | jq -r '.reason')" "Connection refused" "reason"
  assert_not_contains "$OUT" "$PASSWORD" "no secret in output"
}

# A redis-cli that fails its first N calls, then behaves like the fake.
test_listen_backoff() {
  new_case "listen: repeated failures print down once, back off 5 then 10 s, then print up on recovery"
  mv "$T/bin/redis-cli" "$T/bin/redis-cli.real"
  cat > "$T/bin/redis-cli" <<EOF
#!/usr/bin/env bash
n="\$(cat "$T/failcount" 2>/dev/null || echo 0)"
if [ "\$n" -lt 2 ]; then
  printf '%s' \$((n + 1)) > "$T/failcount"
  echo "Could not connect to Redis at mbx.example.test:6379: Connection refused" >&2
  exit 1
fi
exec "$T/bin/redis-cli.real" "\$@"
EOF
  chmod +x "$T/bin/redis-cli"
  rule "XREAD *" "null"
  LENV+=(MAILBOX_LISTEN_ONCE=3)
  mbx listen --sid "$SID" --cwd "$T/work/My_Proj"
  assert_rc 0 "three passes"
  assert_eq '{"event":"ready","session":"my-proj-abc123"}' "$(printf '%s\n' "$OUT" | sed -n 1p)" "ready"
  assert_eq "down" "$(printf '%s\n' "$OUT" | sed -n 2p | jq -r '.event')" "down once"
  assert_eq '{"event":"up"}' "$(printf '%s\n' "$OUT" | sed -n 3p)" "up on recovery"
  assert_eq "3" "$(printf '%s\n' "$OUT" | wc -l | tr -d ' ')" "no repeated down"
  assert_eq "5 10" "$(tr '\n' ' ' < "$T/sleeplog" | sed 's/ $//')" "backoff 5 then 10"
}

test_listen_signals() {
  new_case "listen: SIGTERM while blocked in redis exits 0 quickly and quietly"
  mv "$T/bin/redis-cli" "$T/bin/redis-cli.real"
  printf '#!/usr/bin/env bash\ncase "$*" in *XREAD*) exec /bin/sleep 30 ;; esac\nexec "%s" "$@"\n' "$T/bin/redis-cli.real" > "$T/bin/redis-cli"
  chmod +x "$T/bin/redis-cli"
  rm -f "$T/bin/sleep"   # this case needs the real sleep for the blocked child
  env -u MAILBOX_SESSION -u MAILBOX_SESSION_ID -u CLAUDE_CODE_SESSION_ID \
    PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" \
    bash "$MB" listen --sid "$SID" --cwd "$T/work/My_Proj" > "$T/out" 2> "$T/err" < /dev/null &
  local pid=$! i=0 start
  while [ $i -lt 50 ] && ! grep -q '"ready"' "$T/out" 2>/dev/null; do sleep 0.1; i=$((i + 1)); done
  sleep 0.5
  start=$(date +%s)
  kill -TERM "$pid" 2>/dev/null
  RC=0; wait "$pid" || RC=$?
  ERR="$(cat "$T/err")"
  assert_rc 0 "SIGTERM exit"
  assert_eq "yes" "$(yn test $(( $(date +%s) - start )) -le 3)" "exited without waiting out the 30 s block"
  assert_eq "" "$ERR" "quiet on stderr"
}

# ---------------------------------------------------------------- unread

test_unread() {
  new_case "unread: counts session, project (pending + not yet delivered) and room mail without consuming"
  rule "HGET dir:michael michael/s/my-proj-abc123" '{"rooms":["ops"]}'
  rule "GET seen:*" "1700000000000-0"
  rule "XRANGE mbx:michael:s:*" '[["1-0",["kind","ask"]],["2-0",["kind","fyi"]]]'
  rule "XINFO GROUPS mbx:michael:p:*" '[{"name":"readers","consumers":1,"pending":3,"last-delivered-id":"1700000000100-0"}]'
  rule "XRANGE mbx:michael:p:*" '[["1-0",["kind","ask"]]]'
  rule "XRANGE mbx:michael:r:*" '[["1-0",["kind","ask"]],["2-0",["kind","fyi"]],["3-0",["kind","fyi"]],["4-0",["kind","fyi"]]]'
  mbx unread --sid "$SID" --cwd "$T/work/My_Proj"
  assert_rc 0 "unread"
  assert_eq "10" "$OUT" "2 session + (3 pending + 1 new) project + 4 room"
  assert_eq "0" "$(count_cmd XREADGROUP)" "no group read"
  assert_eq "0" "$(count_cmd XACK)" "no ack"
  assert_eq "0" "$(count_cmd 'SET ')" "no marker moved"
  assert_eq "0" "$(count_cmd XGROUP)" "no group created"

  new_case "unread: nothing waiting prints 0; a new room subscriber (no marker) counts 0 for the room"
  mbx unread --sid "$SID" --cwd "$T/work/My_Proj"
  assert_eq "0" "$OUT" "zero"
}

test_resolver
test_listen
test_listen_backoff
test_listen_signals
test_unread

echo "cases=$CASES assertions_passed=$PASS assertions_failed=$FAIL"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0
