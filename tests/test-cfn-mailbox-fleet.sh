#!/usr/bin/env bash
# Tests for agent mailbox stage 5 (fleet on the mailbox): role names (claim/release), the
# coordinator tier, the fleet message field, the worker outbound queue and the hook's use of all
# three. Spec: planning/PLAN_agent-mailbox.md "Stage 5 design (fleet, all workers)".
#
# Offline only: a fake `redis-cli` (tests/lib/fake-redis-cli.sh, key-value mode via FAKE_KV_DIR for
# claim races) is first on PATH, HOME is a scratch dir, nothing touches a network or real Redis.
#
# Usage: bash tests/test-cfn-mailbox-fleet.sh
# Exit codes: 0 all green, 1 a test failed.
#
# No `set -e`: assertions must all run so every failure shows in one pass.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
MB="$REPO/.claude/skills/cfn-mailbox/mailbox.sh"
HOOK="$REPO/.claude/hooks/cfn-mailbox-hook.sh"

PASS=0
FAIL=0
CASES=0
CASE_NAME=""
# shellcheck source=/dev/null
. "$REPO/.claude/cfn-scripts/lib/safe-rm.sh"
# shellcheck source=/dev/null
. "$REPO/tests/lib/fake-redis-cli.sh"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/cfn-mailbox-fleet-test.XXXXXX")" || exit 1
SCRATCH="$(cd -P "$SCRATCH" && pwd -P)" || exit 1
trap 'cfn_safe_rm_tmp "$SCRATCH"' EXIT

ok()   { PASS=$((PASS + 1)); }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL [%s] %s\n' "$CASE_NAME" "$1"; }
assert_eq() { if [ "$1" = "$2" ]; then ok; else bad "$3: expected [$1] got [$2]"; fi; }
assert_contains() { case "$1" in *"$2"*) ok ;; *) bad "$3: missing [$2] in [$1]" ;; esac; }
assert_not_contains() { case "$1" in *"$2"*) bad "$3: unexpected [$2] in [$1]" ;; *) ok ;; esac; }
assert_rc() { if [ "$RC" = "$1" ]; then ok; else bad "$2: exit expected $1 got $RC (stderr: $ERR)"; fi; }

PASSWORD="pw-SECRET-do-not-leak-123"
SECRET="0123456789abcdef0123456789abcdef"
NOW=1800000000

new_case() {
  CASE_NAME="$1"
  CASES=$((CASES + 1))
  T="$SCRATCH/case-$CASES"
  mkdir -p "$T/bin" "$T/home" "$T/kv" "$T/work/proj"
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
MAILBOX_CONTACTS="steve/me"
EOF
  chmod 600 "$T/env"
  printf 'Brief text\n\ncoordinator-secret: %s\n' "$SECRET" > "$T/coord"
  chmod 600 "$T/coord"
  export FAKE_LOG="$T/calls" FAKE_RULES="$T/rules" FAKE_KV_DIR="$T/kv"
  MENV=()
}

rule() { printf '%s\t%s\n' "$1" "$2" >> "$T/rules"; }

# mb ARGS: mailbox.sh with the fake on PATH, scratch HOME, no inherited session identity.
# MENV holds extra VAR=value words for this call. Sets OUT ERR RC.
mb() {
  RC=0
  OUT="$(env -u MAILBOX_SESSION -u MAILBOX_SESSION_ID -u CLAUDE_CODE_SESSION_ID -u MAILBOX_COORD_FILE -u MAILBOX_COORD_FROM -u MAILBOX_OUTQ \
    PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" MAILBOX_NOW="$NOW" ${MENV[@]+"${MENV[@]}"} \
    bash "$MB" "$@" 2>"$T/stderr" </dev/null)" || RC=$?
  ERR="$(cat "$T/stderr")"
}

SID="aaa111bbb222"
HENV=()
ev() {
  local extra="${2:-}"
  [ -n "$extra" ] || extra='{}'
  jq -n -c --arg e "$1" --arg sid "$SID" --arg cwd "$T/work/proj" --argjson x "$extra" \
    '{hook_event_name:$e, session_id:$sid, cwd:$cwd} + $x'
}
hook() {
  RC=0
  OUT="$(printf '%s' "$1" | env -u MAILBOX_SESSION -u MAILBOX_SESSION_ID -u CLAUDE_CODE_SESSION_ID -u MAILBOX_COORD_FILE \
    -u MAILBOX_OUTQ -u CLAUDE_CODE_SESSION_ATTENDED -u TMUX_PANE -u TMUX \
    PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" CFN_MAILBOX_HOOK_TIMEOUT=30 ${HENV[@]+"${HENV[@]}"} \
    bash "$HOOK" 2>"$T/stderr")" || RC=$?
  ERR="$(cat "$T/stderr")"
}
ctx() { printf '%s' "$OUT" | jq -r '.hookSpecificOutput.additionalContext // empty'; }

cmds() { grep '^CMD	' "$T/calls" | cut -f2-; }
has_cmd() { cmds | grep -F -q -- "$1"; }
yn() { if "$@"; then echo yes; else echo no; fi; }
kv() { cat "$T/kv/$(printf '%s' "$1" | tr -c 'A-Za-z0-9_.-' '_')" 2>/dev/null; }
kv_put() { printf '%s' "$2" > "$T/kv/$(printf '%s' "$1" | tr -c 'A-Za-z0-9_.-' '_')"; }
alias_json() { # sid last_seen [claimed_at]
  jq -n -c --arg s "$1" --argjson l "$2" --argjson c "${3:-$2}" '{session_id:$s, host:"otherhost", claimed_at:$c, last_seen:$l}'
}
key_to() { printf '%s' "$1" | sed -e 's/^mbx://' -e 's/:from:.*$//' -e 's#:#/#g'; }
# msg KEY ID FROM KIND BODY MSG_ID [EXTRA-FIELD VALUE]...: one-message XREAD --json reply.
msg() {
  local key="$1" id="$2" from="$3" kind="$4" body="$5" mid="$6"; shift 6
  local extra='[]'
  while [ $# -ge 2 ]; do extra="$(jq -c --arg k "$1" --arg v "$2" '. + [$k, $v]' <<<"$extra")"; shift 2; done
  jq -n -c --arg key "$key" --arg id "$id" --arg from "$from" --arg kind "$kind" --arg body "$body" \
    --arg to "$(key_to "$key")" --arg mid "$mid" --argjson x "$extra" \
    '[[$key, [[$id, (["from",$from,"to",$to,"kind",$kind,"body",$body,"sent_at","1","thread","t-1","hops","0","msg_id",$mid] + $x)]]]]'
}

AKEY="alias:michael:proj-master"

# ---------------------------------------------------------------- claim / release

test_claim_basic() {
  new_case "claim: free name is taken, stored with holder and times, local alias written"
  MENV=(MAILBOX_SESSION_ID=sess-a)
  mb claim proj-master
  assert_rc 0 "claim ok"
  assert_contains "$OUT" "claimed michael/s/proj-master" "prints the address"
  assert_eq "sess-a" "$(kv "$AKEY" | jq -r .session_id)" "holder is the session id"
  assert_eq "$NOW" "$(kv "$AKEY" | jq -r .last_seen)" "last_seen"
  assert_eq "$NOW" "$(kv "$AKEY" | jq -r .claimed_at)" "claimed_at"
  assert_eq "yes" "$(yn has_cmd "SET $AKEY")" "SET on the alias key"
  assert_eq "yes" "$(cmds | grep -F "SET $AKEY" | head -1 | grep -q ' NX' && echo yes || echo no)" "first SET is NX"
  assert_eq "proj-master" "$(cat "$CACHE/alias-sess-a" 2>/dev/null)" "local alias file names the role"

  new_case "claim: CLAUDE_CODE_SESSION_ID is the holder when MAILBOX_SESSION_ID is unset"
  MENV=(CLAUDE_CODE_SESSION_ID=b1e89cdf-cee0-4de3)
  mb claim proj-master
  assert_rc 0 "claim ok"
  assert_eq "b1e89cdf-cee0-4de3" "$(kv "$AKEY" | jq -r .session_id)" "holder from CLAUDE_CODE_SESSION_ID"

  new_case "claim: no session identity at all -> 19"
  MENV=()
  mb claim proj-master
  assert_rc 19 "needs a holder id"

  new_case "claim: invalid name -> 10, nothing written"
  MENV=(MAILBOX_SESSION_ID=sess-a)
  mb claim Bad_Name
  assert_rc 10 "invalid name"
  assert_eq "no" "$(yn has_cmd SET)" "no SET"
}

test_claim_race() {
  local round wins losses rc_a rc_b
  for round in 1 2 3 4 5; do
    new_case "claim race round $round: two sessions at once, exactly one wins"
    ( MENV=(MAILBOX_SESSION_ID=sess-a); mb claim proj-master; echo "$RC" > "$T/rc-a" ) &
    ( MENV=(MAILBOX_SESSION_ID=sess-b); mb claim proj-master; echo "$RC" > "$T/rc-b" ) &
    wait
    rc_a="$(cat "$T/rc-a")"; rc_b="$(cat "$T/rc-b")"
    wins=0; losses=0
    for r in "$rc_a" "$rc_b"; do
      case "$r" in 0) wins=$((wins + 1)) ;; 21) losses=$((losses + 1)) ;; esac
    done
    assert_eq "1 1" "$wins $losses" "one winner (0) and one refused (21), got a=$rc_a b=$rc_b"
    local holder; holder="$(kv "$AKEY" | jq -r .session_id)"
    if [ "$rc_a" = 0 ]; then assert_eq sess-a "$holder" "stored holder is the winner"; else assert_eq sess-b "$holder" "stored holder is the winner"; fi
  done
}

test_claim_live_and_stale() {
  new_case "claim: held by a live session (seen 60 s ago) -> 21, untouched"
  kv_put "$AKEY" "$(alias_json sess-b $((NOW - 60)))"
  MENV=(MAILBOX_SESSION_ID=sess-a)
  mb claim proj-master
  assert_rc 21 "refused"
  assert_contains "$ERR" "held" "says the name is held"
  assert_eq "sess-b" "$(kv "$AKEY" | jq -r .session_id)" "holder unchanged"
  [ ! -f "$CACHE/alias-sess-a" ] && ok || bad "no local alias file for the loser"

  new_case "claim: stale holder (seen 700 s ago) is taken over under the lock"
  kv_put "$AKEY" "$(alias_json sess-b $((NOW - 700)))"
  MENV=(MAILBOX_SESSION_ID=sess-a)
  mb claim proj-master
  assert_rc 0 "taken over"
  assert_eq "sess-a" "$(kv "$AKEY" | jq -r .session_id)" "new holder"
  assert_eq "yes" "$(yn has_cmd "SET lock:michael:alias-proj-master")" "takeover takes the lock"
  assert_eq "yes" "$(yn has_cmd "DEL lock:michael:alias-proj-master")" "and releases it"

  new_case "claim: stale holder but another takeover holds the lock -> 21"
  kv_put "$AKEY" "$(alias_json sess-b $((NOW - 700)))"
  kv_put "lock:michael:alias-proj-master" "sess-c"
  MENV=(MAILBOX_SESSION_ID=sess-a)
  mb claim proj-master
  assert_rc 21 "refused while another takeover runs"
  assert_eq "sess-b" "$(kv "$AKEY" | jq -r .session_id)" "holder unchanged"

  new_case "claim: the holder re-claiming refreshes last_seen and keeps claimed_at"
  kv_put "$AKEY" "$(alias_json sess-a $((NOW - 300)) $((NOW - 900)))"
  MENV=(MAILBOX_SESSION_ID=sess-a)
  mb claim proj-master
  assert_rc 0 "re-claim ok"
  assert_eq "$NOW" "$(kv "$AKEY" | jq -r .last_seen)" "last_seen refreshed"
  assert_eq "$((NOW - 900))" "$(kv "$AKEY" | jq -r .claimed_at)" "claimed_at kept"
}

test_release() {
  new_case "release: the holder gives the name up"
  MENV=(MAILBOX_SESSION_ID=sess-a)
  mb claim proj-master
  mb release proj-master
  assert_rc 0 "release ok"
  assert_eq "" "$(kv "$AKEY")" "alias key deleted"
  [ ! -f "$CACHE/alias-sess-a" ] && ok || bad "local alias file removed"

  new_case "release: another session's name -> 21, kept"
  kv_put "$AKEY" "$(alias_json sess-b "$NOW")"
  MENV=(MAILBOX_SESSION_ID=sess-a)
  mb release proj-master
  assert_rc 21 "not yours"
  assert_eq "sess-b" "$(kv "$AKEY" | jq -r .session_id)" "kept"

  new_case "release, then another session claims at once (no wait for the 10 min window)"
  MENV=(MAILBOX_SESSION_ID=sess-a); mb claim proj-master; mb release proj-master
  MENV=(MAILBOX_SESSION_ID=sess-b); mb claim proj-master
  assert_rc 0 "free after release"
  assert_eq "sess-b" "$(kv "$AKEY" | jq -r .session_id)" "new holder"
}

test_claimed_name_is_the_session() {
  new_case "claimed name becomes the session for send, whoami and heartbeat"
  MENV=(MAILBOX_SESSION_ID=sess-a)
  mb claim proj-master
  mb whoami
  assert_rc 0 "whoami ok"
  assert_contains "$OUT" "owner=michael" "owner"
  assert_contains "$OUT" "session=proj-master" "session from the alias"
  assert_contains "$OUT" "address=michael/s/proj-master" "address"
  mb send michael/s/proj-ws1 "hello"
  assert_rc 0 "send ok"
  assert_contains "$(cmds | grep -F 'XADD mbx:michael:s:proj-ws1' | head -1)" "from michael/s/proj-master" "from is the role"

  new_case "heartbeat refreshes the alias last_seen; directory entry under the role"
  MENV=(MAILBOX_SESSION_ID=sess-a); mb claim proj-master
  NOW=$((NOW + 300))
  mb heartbeat --project proj
  assert_rc 0 "heartbeat ok"
  assert_eq "$NOW" "$(kv "$AKEY" | jq -r .last_seen)" "alias last_seen refreshed"
  assert_eq "yes" "$(yn has_cmd "HSET dir:michael michael/s/proj-master")" "directory entry is the role"
  NOW=1800000000

  new_case "heartbeat after losing the name: local alias dropped, warning"
  MENV=(MAILBOX_SESSION_ID=sess-a); mb claim proj-master
  kv_put "$AKEY" "$(alias_json sess-b "$NOW")"
  mb heartbeat --project proj
  assert_contains "$ERR" "lost" "warns the name was lost"
  [ ! -f "$CACHE/alias-sess-a" ] && ok || bad "local alias removed after losing it"
  assert_eq "sess-b" "$(kv "$AKEY" | jq -r .session_id)" "other holder untouched"
}

# ---------------------------------------------------------------- hook and role names

test_hook_uses_claimed_name() {
  new_case "hook: a session with a local alias reads, heartbeats and replies as the role"
  mkdir -p "$CACHE"; printf 'proj-master\n' > "$CACHE/alias-$SID"
  kv_put "$AKEY" "$(alias_json "$SID" $((NOW - 30)))"
  local k="mbx:michael:s:proj-master:from:michael"
  rule "XREAD COUNT * STREAMS $k *" "$(msg "$k" 1700000000001-0 michael/s/proj-ws1 fyi "status in roster" m-0001)"
  hook "$(ev UserPromptSubmit '{"prompt":"hi"}')"
  assert_rc 0 "hook exit 0"
  assert_contains "$(ctx)" "for session proj-master" "injects for the role"
  assert_contains "$(ctx)" "status in roster" "role mail delivered"
  assert_eq "yes" "$(yn has_cmd "HSET dir:michael michael/s/proj-master")" "heartbeat as the role"
  assert_contains "$(ctx)" "MAILBOX_SESSION=proj-master" "reply command uses the role"
  assert_eq "$SID" "$(kv "$AKEY" | jq -r .session_id)" "alias still ours"
}

test_role_mail_survives_restart() {
  new_case "role mail: sent to the role, read by the next session after a restart"
  local k="mbx:michael:s:proj-master:from:michael"
  # Session 1 holds the role, then dies (never seen again).
  MENV=(MAILBOX_SESSION_ID=old-session); mb claim proj-master
  # A worker writes to the role while nobody is there.
  MENV=(MAILBOX_SESSION=proj-ws1); mb send michael/s/proj-master --kind ask "handoff ready: handoffs/HANDOFF_WS1.md"
  assert_rc 0 "send to the role"
  assert_eq "yes" "$(yn has_cmd "XADD $k")" "written to the role's inbox key"
  # 15 minutes later a new session (new id) claims the stale role and reads it through the hook.
  NOW=$((NOW + 900))
  MENV=(MAILBOX_SESSION_ID="$SID"); mb claim proj-master
  assert_rc 0 "new session takes the stale role"
  rule "XREAD COUNT * STREAMS $k *" "$(msg "$k" 1700000000002-0 michael/s/proj-ws1 ask "handoff ready: handoffs/HANDOFF_WS1.md" m-0002)"
  hook "$(ev UserPromptSubmit '{"prompt":"hi"}')"
  assert_contains "$(ctx)" "handoff ready: handoffs/HANDOFF_WS1.md" "the new session gets the role's mail"
  NOW=1800000000
}

# ---------------------------------------------------------------- coordinator tier

read_ws1() { # extra MENV words: read the proj-ws1 session inbox
  MENV=(MAILBOX_SESSION=proj-ws1 "$@")
  mb read
}

test_coordinator_tier() {
  local k="mbx:michael:s:proj-ws1:from:michael"
  new_case "coordinator: same owner + the brief's secret -> coordinator; secret stripped"
  rule "XREAD COUNT * STREAMS $k *" "$(msg "$k" 1700000000003-0 michael/s/proj-master ask "assign: briefs/WS1.md part 2" m-0003 fleet assign coord "$SECRET")"
  read_ws1 MAILBOX_COORD_FILE="$T/coord"
  assert_rc 0 "read ok"
  assert_eq "coordinator" "$(printf '%s\n' "$OUT" | head -1 | jq -r .tier)" "tier"
  assert_eq "assign" "$(printf '%s\n' "$OUT" | head -1 | jq -r .fleet)" "fleet type passes through"
  assert_eq "null" "$(printf '%s\n' "$OUT" | head -1 | jq -r .coord)" "coord field removed"
  assert_not_contains "$OUT$ERR" "$SECRET" "secret never printed"

  new_case "coordinator: wrong secret -> teammate"
  rule "XREAD COUNT * STREAMS $k *" "$(msg "$k" 1700000000004-0 michael/s/proj-master ask "stop now" m-0004 fleet stop coord "ffffffffffffffffffffffffffffffff")"
  read_ws1 MAILBOX_COORD_FILE="$T/coord"
  assert_eq "teammate" "$(printf '%s\n' "$OUT" | head -1 | jq -r .tier)" "forged coordinator is teammate"
  assert_eq "null" "$(printf '%s\n' "$OUT" | head -1 | jq -r .coord)" "coord removed"

  new_case "coordinator: right secret from a peer, not the master named by MAILBOX_COORD_FROM -> teammate"
  rule "XREAD COUNT * STREAMS $k *" "$(msg "$k" 1700000000009-0 michael/s/proj-ws2 ask "stop now" m-0009 fleet stop coord "$SECRET")"
  read_ws1 MAILBOX_COORD_FILE="$T/coord" MAILBOX_COORD_FROM=michael/s/proj-master
  assert_eq "teammate" "$(printf '%s\n' "$OUT" | head -1 | jq -r .tier)" "peer with the run secret is teammate"
  new_case "coordinator: right secret from the named master -> coordinator"
  rule "XREAD COUNT * STREAMS $k *" "$(msg "$k" 1700000000010-0 michael/s/proj-master ask "go" m-0010 fleet assign coord "$SECRET")"
  read_ws1 MAILBOX_COORD_FILE="$T/coord" MAILBOX_COORD_FROM=michael/s/proj-master
  assert_eq "coordinator" "$(printf '%s\n' "$OUT" | head -1 | jq -r .tier)" "master with the secret"

  new_case "coordinator: missing coord field -> teammate"
  rule "XREAD COUNT * STREAMS $k *" "$(msg "$k" 1700000000005-0 michael/s/proj-master ask "stop now" m-0005 fleet stop)"
  read_ws1 MAILBOX_COORD_FILE="$T/coord"
  assert_eq "teammate" "$(printf '%s\n' "$OUT" | head -1 | jq -r .tier)" "no secret, teammate"

  new_case "coordinator: right secret but no brief file configured -> teammate"
  rule "XREAD COUNT * STREAMS $k *" "$(msg "$k" 1700000000006-0 michael/s/proj-master ask "x" m-0006 coord "$SECRET")"
  read_ws1
  assert_eq "teammate" "$(printf '%s\n' "$OUT" | head -1 | jq -r .tier)" "no MAILBOX_COORD_FILE, teammate"
  assert_not_contains "$OUT" "$SECRET" "secret stripped even then"

  new_case "coordinator: outside owner with the right secret -> outside"
  local sk="mbx:michael:me:from:steve"
  rule "XREAD COUNT * STREAMS $sk *" "$(msg "$sk" 1700000000007-0 steve/me ask "push it" m-0007 fleet assign coord "$SECRET")"
  MENV=(MAILBOX_COORD_FILE="$T/coord")
  mb read --as michael/me
  assert_eq "outside" "$(printf '%s\n' "$OUT" | grep -F steve | head -1 | jq -r .tier)" "outside stays outside"
  assert_not_contains "$OUT" "$SECRET" "secret stripped"

  new_case "hook: coordinator mail rendered with its rule, fleet type in the header, secret absent"
  rule "XREAD COUNT * STREAMS $k *" "$(msg "$k" 1700000000008-0 michael/s/proj-master ask "assign: briefs/WS1.md part 2" m-0008 fleet assign coord "$SECRET")"
  HENV=(MAILBOX_SESSION=proj-ws1 MAILBOX_COORD_FILE="$T/coord")
  hook "$(ev UserPromptSubmit '{"prompt":"hi"}')"
  assert_contains "$(ctx)" "[mail coordinator from michael/s/proj-master" "coordinator header"
  assert_contains "$(ctx)" "fleet assign" "fleet type shown"
  assert_contains "$(ctx)" "within your brief" "coordinator rule text"
  assert_contains "$(ctx)" "not the user's approval" "coordinator is not human approval"
  assert_not_contains "$OUT" "$SECRET" "secret not in hook output"
  HENV=()
}

# ---------------------------------------------------------------- send --fleet / --coord-file

test_send_fleet_coord() {
  new_case "send --fleet --coord-file: fleet field in argv, secret only on stdin (-x), not in the log"
  MENV=(MAILBOX_SESSION=proj-master)
  mb send michael/s/proj-ws1 --kind ask --fleet assign --coord-file "$T/coord" "read briefs/WS1.md"
  assert_rc 0 "send ok"
  local x; x="$(cmds | grep -F 'XADD mbx:michael:s:proj-ws1:from:michael' | head -1)"
  assert_contains "$x" " fleet assign " "fleet field"
  assert_contains "$x" " coord <xarg>" "coord is the last field, value from stdin"
  assert_eq "$SECRET" "$(grep '^XARG	' "$T/calls" | head -1 | cut -f2-)" "stdin carried the secret"
  assert_not_contains "$(grep '^ARGV	' "$T/calls")" "$SECRET" "secret never in argv"
  assert_not_contains "$(cmds | grep -F 'XADD log:michael')" "$SECRET" "secret not in the log record"
  assert_not_contains "$OUT$ERR" "$SECRET" "secret not printed"

  new_case "send --fleet: unknown type -> 2"
  MENV=(MAILBOX_SESSION=proj-master)
  mb send michael/s/proj-ws1 --fleet launch "x"
  assert_rc 2 "bad fleet type"

  new_case "send --coord-file: no secret line -> 2"
  printf 'just a brief\n' > "$T/nosecret"
  MENV=(MAILBOX_SESSION=proj-master)
  mb send michael/s/proj-ws1 --coord-file "$T/nosecret" "x"
  assert_rc 2 "no secret"

  new_case "send --coord-file with --at -> 2 (secrets never parked in due:)"
  MENV=(MAILBOX_SESSION=proj-master)
  mb send michael/s/proj-ws1 --at +5m --coord-file "$T/coord" "x"
  assert_rc 2 "refused"
  assert_eq "no" "$(yn has_cmd ZADD)" "nothing scheduled"
}

# ---------------------------------------------------------------- queue / flush

test_queue_flush() {
  new_case "queue: writes one private JSON file, needs no config or network"
  MENV=(MAILBOX_OUTQ="$T/outq" MAILBOX_CONFIG="$T/missing")
  mb queue michael/s/proj-master --kind ask --fleet blocked "need src/b.md"
  assert_rc 0 "queued"
  local f; f="$(ls "$T/outq"/*.json 2>/dev/null | head -1)"
  [ -n "$f" ] && ok || bad "a queue file exists"
  assert_eq "michael/s/proj-master|ask|blocked|need src/b.md" "$(jq -r '[.to,.kind,.fleet,.body] | join("|")' "$f" 2>/dev/null)" "fields"
  assert_eq "no" "$(yn has_cmd XADD)" "no network on queue"
  local mode; mode="$(stat -c %a "$f" 2>/dev/null || stat -f %Lp "$f" 2>/dev/null)"
  assert_eq "600" "$mode" "queue file mode"

  new_case "queue: no MAILBOX_OUTQ -> 2"
  mb queue michael/s/proj-master "x"
  assert_rc 2 "needs MAILBOX_OUTQ"

  new_case "flush: sends each queued message as this session, removes it"
  MENV=(MAILBOX_OUTQ="$T/outq")
  mb queue michael/s/proj-master --fleet status "working: step 2"
  mb queue michael/s/proj-master --kind ask --fleet done "handoffs/HANDOFF_WS1.md"
  MENV=(MAILBOX_OUTQ="$T/outq" MAILBOX_SESSION=proj-ws1)
  mb flush
  assert_rc 0 "flush ok"
  local x; x="$(cmds | grep -F 'XADD mbx:michael:s:proj-master:from:michael')"
  assert_eq "2" "$(printf '%s\n' "$x" | grep -c .)" "two XADDs"
  assert_contains "$x" "from michael/s/proj-ws1" "from the worker"
  assert_contains "$x" "fleet status" "status type"
  assert_contains "$x" "fleet done" "done type"
  assert_eq "0" "$(ls "$T/outq"/*.json 2>/dev/null | wc -l | tr -d ' ')" "queue empty"

  new_case "flush: Redis unreachable -> 15, files kept for the next try"
  MENV=(MAILBOX_OUTQ="$T/outq")
  mb queue michael/s/proj-master --fleet status "x"
  rule "XADD *" "!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused"
  MENV=(MAILBOX_OUTQ="$T/outq" MAILBOX_SESSION=proj-ws1)
  mb flush
  assert_rc 15 "unreachable"
  assert_eq "1" "$(ls "$T/outq"/*.json 2>/dev/null | wc -l | tr -d ' ')" "kept"

  new_case "flush: a malformed entry is set aside (.failed), the rest still go"
  mkdir -p "$T/outq"
  printf '{"to":"not an address","kind":"fyi","body":"x"}\n' > "$T/outq/1000-a.json"
  MENV=(MAILBOX_OUTQ="$T/outq"); mb queue michael/s/proj-master --fleet status "good"
  MENV=(MAILBOX_OUTQ="$T/outq" MAILBOX_SESSION=proj-ws1)
  mb flush
  assert_rc 0 "flush ok"
  [ -f "$T/outq/1000-a.json.failed" ] && ok || bad "bad entry renamed .failed"
  assert_eq "yes" "$(yn has_cmd 'XADD mbx:michael:s:proj-master')" "good entry sent"

  new_case "hook: flushes the worker queue on PostToolUse even inside the 15 s check window"
  MENV=(MAILBOX_OUTQ="$T/outq"); mb queue michael/s/proj-master --fleet status "from the hook"
  mkdir -p "$CACHE"; date +%s > "$CACHE/check-proj-ws1"; date +%s > "$CACHE/hb-proj-ws1"
  HENV=(MAILBOX_SESSION=proj-ws1 MAILBOX_OUTQ="$T/outq")
  hook "$(ev PostToolUse '{"tool_name":"Bash"}')"
  assert_rc 0 "hook ok"
  assert_eq "yes" "$(yn has_cmd 'XADD mbx:michael:s:proj-master:from:michael')" "queued mail sent by the hook"
  assert_eq "0" "$(ls "$T/outq"/*.json 2>/dev/null | wc -l | tr -d ' ')" "queue drained"
  assert_eq "no" "$(yn has_cmd 'XREAD')" "mail check still throttled"
  HENV=()
}

# ---------------------------------------------------------------- read --reader / who --seen

test_reader_and_seen() {
  new_case "read --reader: own marker, so fleet watch and the hook both see every message"
  local k="mbx:michael:s:proj-master:from:michael" hash
  hash="$(printf '%s' "$k" | cksum | awk '{print $1}')"
  MENV=(MAILBOX_SESSION=proj-master)
  mb read --reader fleet-watch
  assert_rc 0 "read ok"
  assert_eq "yes" "$(yn has_cmd "GET seen:michael:proj-master--fleet-watch:$hash")" "separate marker key"
  mb read
  assert_eq "yes" "$(yn has_cmd "GET seen:michael:proj-master:$hash")" "plain read keeps the session marker"
  mb read --reader Bad_Reader
  assert_rc 10 "reader name validated"

  new_case "who --seen: address and last_seen for every directory entry"
  rule "HGETALL dir:michael" '["michael/s/proj-ws1","{\"host\":\"vps\",\"last_seen\":1799999990}","michael/s/proj-ws2","{\"host\":\"mac\",\"last_seen\":17}"]'
  mb who --seen
  assert_rc 0 "ok"
  assert_contains "$OUT" "michael/s/proj-ws1	1799999990" "ws1 row"
  assert_contains "$OUT" "michael/s/proj-ws2	17" "old rows too"
}

# Regression (2026-10-16, MDTWII): MAILBOX_SESSION set in a tmux session's environment was
# inherited by every window, so three Claude sessions shared michael/s/mdtwii. Whichever read
# first took a reply meant for another, and the watcher nudged whichever pane heartbeated last.
# fake_tmux ALIVE_PANE: a tmux whose display-message succeeds only for ALIVE_PANE.
fake_tmux() {
  printf '#!/usr/bin/env bash\nfor a in "$@"; do [ "$a" = "%s" ] && exit 0; done\nexit 1\n' "$1" > "$T/bin/tmux"
  chmod +x "$T/bin/tmux"
}
shared_entry() { # TMUX_TARGET LAST_SEEN: directory entry for michael/s/shared held by another pane
  rule "HGET dir:michael michael/s/shared" "$(jq -n -c --arg h "$(hostname -s)" --arg t "$1" --argjson l "$2" '{host:$h, tmux_target:$t, last_seen:$l, rooms:[]}')"
}
SHARED_OWN="proj-aaa111"

test_shared_env_name() {
  new_case "shared env name: another live pane on this host holds it -> this session uses its own name"
  fake_tmux %9; shared_entry "/sock|%9" $((NOW - 30))
  HENV=(MAILBOX_SESSION=shared MAILBOX_NOW="$NOW" TMUX="/sock,1,0" TMUX_PANE=%3)
  hook "$(ev SessionStart)"
  assert_eq "no" "$(yn has_cmd "HSET dir:michael michael/s/shared ")" "held name not overwritten"
  assert_eq "yes" "$(yn has_cmd "HSET dir:michael michael/s/$SHARED_OWN ")" "own derived name heartbeated"
  assert_eq "$SHARED_OWN" "$(cat "$CACHE/name-$SID" 2>/dev/null)" "resolved name recorded for the CLI"
  : > "$T/calls"
  hook "$(ev UserPromptSubmit '{"prompt":"x"}')"
  assert_eq "yes" "$(yn has_cmd "mbx:michael:s:$SHARED_OWN:from:michael")" "next event reads its own inbox"
  assert_eq "no" "$(yn has_cmd "mbx:michael:s:shared:from:michael")" "never the shared inbox again"

  new_case "shared env name: CLI in that session sends from the session's own name"
  fake_tmux %9; shared_entry "/sock|%9" $((NOW - 30))
  HENV=(MAILBOX_SESSION=shared MAILBOX_NOW="$NOW" TMUX="/sock,1,0" TMUX_PANE=%3)
  hook "$(ev SessionStart)"
  MENV=(MAILBOX_SESSION=shared CLAUDE_CODE_SESSION_ID="$SID")
  mb whoami
  assert_contains "$OUT" "session=$SHARED_OWN" "whoami follows the hook"

  new_case "shared env name: same pane (restart) keeps the name"
  fake_tmux %3; shared_entry "/sock|%3" $((NOW - 30))
  HENV=(MAILBOX_SESSION=shared MAILBOX_NOW="$NOW" TMUX="/sock,1,0" TMUX_PANE=%3)
  hook "$(ev SessionStart)"
  assert_eq "yes" "$(yn has_cmd "HSET dir:michael michael/s/shared ")" "name kept"
  assert_eq "shared" "$(cat "$CACHE/name-$SID" 2>/dev/null)" "recorded"

  new_case "shared env name: the other pane is gone -> name kept"
  fake_tmux %1; shared_entry "/sock|%9" $((NOW - 30))
  HENV=(MAILBOX_SESSION=shared MAILBOX_NOW="$NOW" TMUX="/sock,1,0" TMUX_PANE=%3)
  hook "$(ev SessionStart)"
  assert_eq "yes" "$(yn has_cmd "HSET dir:michael michael/s/shared ")" "dead pane does not hold"

  new_case "shared env name: holder silent for 10+ minutes -> name kept"
  fake_tmux %9; shared_entry "/sock|%9" $((NOW - 700))
  HENV=(MAILBOX_SESSION=shared MAILBOX_NOW="$NOW" TMUX="/sock,1,0" TMUX_PANE=%3)
  hook "$(ev SessionStart)"
  assert_eq "yes" "$(yn has_cmd "HSET dir:michael michael/s/shared ")" "stale holder does not hold"

  # Two windows starting at once both pass the check (each reads before the other writes). The
  # loser must step aside before its next read, not a minute later when its heartbeat is due.
  new_case "shared env name: the holder check runs before every read, not only once a minute"
  fake_tmux %3; shared_entry "/sock|%3" $((NOW - 30))
  HENV=(MAILBOX_SESSION=shared MAILBOX_NOW="$NOW" TMUX="/sock,1,0" TMUX_PANE=%3)
  hook "$(ev SessionStart)"
  assert_eq "shared" "$(cat "$CACHE/name-$SID" 2>/dev/null)" "held at start"
  : > "$T/rules"; : > "$T/calls"
  fake_tmux %9; shared_entry "/sock|%9" $((NOW - 2))
  hook "$(ev UserPromptSubmit '{"prompt":"x"}')"
  assert_eq "$SHARED_OWN" "$(cat "$CACHE/name-$SID" 2>/dev/null)" "stepped aside on the next turn"
  assert_eq "no" "$(yn has_cmd "mbx:michael:s:shared:from:michael")" "did not read the shared inbox"

  new_case "shared env name: heartbeat CLI refuses with exit 23 and names the pane"
  fake_tmux %9; shared_entry "/sock|%9" $((NOW - 30))
  MENV=(MAILBOX_SESSION=shared TMUX="/sock,1,0")
  mb heartbeat --project proj --tmux "/sock|%3"
  assert_rc 23 "duplicate refused"
  assert_contains "$ERR" "%9" "names the holding pane"
}

# Regression (2026-10-16): mailbox.sh run from an agent's Bash had no session (MAILBOX_SESSION
# unset), so its mail went out from michael/me and the reply landed in whichever attended session
# read the person inbox.
test_cli_session_from_hook() {
  new_case "CLI without MAILBOX_SESSION uses the name the hook recorded for this Claude session"
  HENV=()
  hook "$(ev SessionStart)"
  MENV=(CLAUDE_CODE_SESSION_ID="$SID")
  mb whoami
  assert_contains "$OUT" "session=$SHARED_OWN" "session from the hook's record"
  mb send michael/s/proj-ws1 "hello"
  assert_contains "$(cmds | grep -F 'XADD mbx:michael:s:proj-ws1' | head -1)" "from michael/s/$SHARED_OWN" "from is this session"

  new_case "CLI without MAILBOX_SESSION and no hook record derives <project>-<sid6> like the hook"
  MENV=(CLAUDE_CODE_SESSION_ID="$SID")
  RC=0
  OUT="$(cd "$T/work/proj" && env -u MAILBOX_SESSION -u MAILBOX_SESSION_ID PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" CLAUDE_CODE_SESSION_ID="$SID" bash "$MB" whoami 2>&1)" || RC=$?
  assert_contains "$OUT" "session=$SHARED_OWN" "derived the same way"

  new_case "CLI outside Claude (no session id) still has no session"
  mb whoami
  assert_contains "$OUT" "session=
" "empty session"
}

test_script_exists() {
  new_case "scripts exist"
  [ -f "$MB" ] && ok || bad "missing $MB"
  [ -f "$HOOK" ] && ok || bad "missing $HOOK"
}

test_script_exists
test_claim_basic
test_claim_race
test_claim_live_and_stale
test_release
test_claimed_name_is_the_session
test_hook_uses_claimed_name
test_role_mail_survives_restart
test_coordinator_tier
test_send_fleet_coord
test_queue_flush
test_reader_and_seen
test_shared_env_name
test_cli_session_from_hook

echo "cases: $CASES  assertions passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
