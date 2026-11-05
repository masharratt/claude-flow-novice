#!/usr/bin/env bash
# tests/test-cfn-repeat-fix-guard.sh
# Repeat-fix guard (.claude/hooks/cfn-repeat-fix-guard.sh): after a test run
# fails, files are edited, and the SAME test command still fails, one fix has
# failed. Further Edit/Write on those files is blocked until the session names
# the root cause (--root-cause) or a test run passes.
# Incident: MDTWII night of 2026-11-04/05, three fix rounds used the same
# method with no root cause named.
# Isolation: state root in a temp dir via CFN_REPEAT_FIX_STATE_ROOT.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD="$ROOT/.claude/hooks/cfn-repeat-fix-guard.sh"
# shellcheck disable=SC1091
source "$ROOT/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1   # cfn_safe_rm_tmp
# shellcheck disable=SC1091
source "$ROOT/.claude/hooks/cfn-hook-budget.sh" || exit 1     # cfn_now_ms

TMP=$(mktemp -d "${TMPDIR:-/tmp}/repeat-fix-test-XXXXXX") || exit 1
export CFN_REPEAT_FIX_STATE_ROOT="$TMP/state"
unset CFN_REPEAT_FIX_GUARD CFN_REPEAT_FIX_MIN_NOTE_CHARS CFN_REPEAT_FIX_SESSION 2>/dev/null || true

PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }
cleanup(){ chmod -R u+w "$TMP" 2>/dev/null; cfn_safe_rm_tmp "$TMP"; }
trap cleanup EXIT

for dep in jq mktemp; do
    command -v "$dep" >/dev/null 2>&1 || { echo "FATAL: $dep not on PATH"; exit 1; }
done
[ -x "$GUARD" ] || { echo "FATAL: $GUARD missing or not executable"; exit 1; }

# --- payload builders -------------------------------------------------------
# bash_run <session> <command> <stdout> [exit_code] [agent_id]
bash_run(){
    jq -nc --arg s "$1" --arg c "$2" --arg o "$3" --arg e "${4:-}" --arg a "${5:-}" '
      {session_id:$s, hook_event_name:"PostToolUse", tool_name:"Bash",
       tool_input:{command:$c},
       tool_response:({stdout:$o, stderr:"", interrupted:false}
                      + (if $e == "" then {} else {exit_code:($e|tonumber)} end))}
      + (if $a == "" then {} else {agent_id:$a, agent_type:"general-purpose"} end)'
}
# bash_fail_event <session> <command> <error text>  (PostToolUseFailure shape)
bash_fail_event(){
    jq -nc --arg s "$1" --arg c "$2" --arg e "$3" '
      {session_id:$s, hook_event_name:"PostToolUseFailure", tool_name:"Bash",
       tool_input:{command:$c}, error:$e}'
}
# edit_evt <phase Pre|Post> <session> <file> [tool] [agent_id]
edit_evt(){
    jq -nc --arg p "$1" --arg s "$2" --arg f "$3" --arg t "${4:-Edit}" --arg a "${5:-}" '
      {session_id:$s, hook_event_name:($p + "ToolUse"), tool_name:$t,
       tool_input:{file_path:$f, old_string:"a", new_string:"b"}}
      + (if $a == "" then {} else {agent_id:$a, agent_type:"general-purpose"} end)'
}
hook(){ printf '%s' "$1" | "$GUARD" >"$TMP/out.txt" 2>"$TMP/err.txt"; }

T1="bash tests/test-widget.sh"
FAILOUT=$'PASS: a\nFAIL: b\nwidget: 1 passed, 1 failed'
PASSOUT=$'PASS: a\nPASS: b\nwidget: 2 passed, 0 failed'

# 1. classifier: positives and negatives -----------------------------------
for c in "bash tests/test-foo.sh" "./tests/test-foo.sh 2>&1 | tee /tmp/x.txt" \
         "cd /p && bash tests/test-foo.sh" "npm test" "npm run test:unit" "pnpm test" \
         "pnpm vitest run src" "npx vitest run" "npx jest --ci" "yarn test" \
         "pytest -q tests/" "python3 -m pytest tests/x.py" "cargo test --lib" \
         "cargo nextest run" "go test ./..." "NODE_OPTIONS=--max-old-space-size=2048 npm test" \
         "timeout 300 bash tests/test-foo.sh" "node --test test/" "npx playwright test"; do
    "$GUARD" --classify "$c" >/dev/null 2>&1 && ok "classify test cmd: $c" || no "classify missed test cmd: $c"
done
for c in "cat tests/test-foo.sh" "grep -n test src/a.ts" "git commit -m 'npm test'" \
         "ls tests" "npx jest --version" "vitest --help" "echo pytest" "npm install" \
         "bash $HOME/.claude/hooks/cfn-repeat-fix-guard.sh --root-cause x"; do
    "$GUARD" --classify "$c" >/dev/null 2>&1 && no "classify false positive: $c" || ok "classify ignores: $c"
done
K1=$("$GUARD" --classify "cd /p && FOO=1 bash tests/test-foo.sh 2>&1 | tee /tmp/a.txt")
K2=$("$GUARD" --classify "bash tests/test-foo.sh > /tmp/b.txt 2>&1")
[ -n "$K1" ] && [ "$K1" = "$K2" ] && ok "same test, different plumbing -> same key ($K1)" || no "keys differ: '$K1' vs '$K2'"

# 2. first failing run never arms (TDD red) --------------------------------
S=s-red
hook "$(bash_run $S "$T1" "$FAILOUT")"
hook "$(edit_evt Pre $S /p/src/widget.sh)"; RC=$?
[ "$RC" -eq 0 ] && ok "first failing run: edit allowed (TDD red)" || no "first failing run blocked edit rc=$RC"

# 3. fail -> edit -> same fail arms; blocks edited file only ----------------
S=s-arm
hook "$(bash_run $S "$T1" "$FAILOUT")"
hook "$(edit_evt Post $S /p/src/widget.sh)"
hook "$(edit_evt Post $S /p/src/helper.sh Write)"
hook "$(bash_run $S "$T1" "$FAILOUT")"
grep -q "REPEAT-FIX GUARD ARMED" "$TMP/out.txt" && ok "arming emits additionalContext" || no "arming context missing: $(cat "$TMP/out.txt")"
hook "$(edit_evt Pre $S /p/src/widget.sh)"; RC=$?
[ "$RC" -eq 2 ] && ok "armed: Edit on fixed file blocked (rc=2)" || no "armed edit rc=$RC (want 2)"
grep -q "root cause" "$TMP/err.txt" && ok "block message asks for root cause" || no "block msg lacks root cause: $(cat "$TMP/err.txt")"
grep -q "never repeat the same method" "$TMP/err.txt" && ok "block message forbids same method" || no "block msg lacks same-method rule"
grep -q -- "--root-cause" "$TMP/err.txt" && grep -q -- "--session $S" "$TMP/err.txt" \
    && ok "block message names the disarm command + session" || no "block msg lacks disarm command"
grep -qE "armed=\[.*widget.sh.*\]" "$TMP/err.txt" && ok "block message lists armed files" || no "block msg lacks armed=[...]"
hook "$(edit_evt Pre $S /p/src/helper.sh Write)"; RC=$?
[ "$RC" -eq 2 ] && ok "armed: Write on second fixed file blocked" || no "armed write rc=$RC"
hook "$(edit_evt Pre $S /p/src/other.sh)"; RC=$?
[ "$RC" -eq 0 ] && ok "armed: unrelated file still editable" || no "unrelated file blocked rc=$RC"

# 4. root-cause note validation + disarm -----------------------------------
"$GUARD" --root-cause "too short" --session $S >"$TMP/out.txt" 2>"$TMP/err.txt"; RC=$?
[ "$RC" -ne 0 ] && grep -q "missing=" "$TMP/err.txt" && ok "short note rejected with missing=[...]" || no "short note rc=$RC err=$(cat "$TMP/err.txt")"
"$GUARD" --root-cause "the widget breaks because the parser handles empty input wrong somewhere" --session $S 2>"$TMP/err.txt"; RC=$?
[ "$RC" -ne 0 ] && ok "note without file:line or quoted log line rejected" || no "uncited note accepted"
hook "$(edit_evt Pre $S /p/src/widget.sh)"; RC=$?
[ "$RC" -eq 2 ] && ok "rejected notes leave guard armed" || no "rejected note disarmed rc=$RC"
NOTE="parse_row in src/widget.sh:42 drops the trailing field when the line ends with a comma"
"$GUARD" --root-cause "$NOTE" --session $S >"$TMP/out.txt" 2>"$TMP/err.txt"; RC=$?
[ "$RC" -eq 0 ] && ok "cited note accepted" || no "cited note rc=$RC err=$(cat "$TMP/err.txt")"
hook "$(edit_evt Pre $S /p/src/widget.sh)"; RC=$?
[ "$RC" -eq 0 ] && ok "after root-cause note: edit allowed" || no "still blocked after note rc=$RC"
grep -rqF "$NOTE" "$CFN_REPEAT_FIX_STATE_ROOT/$S" && ok "note appended to state audit log" || no "note not in audit log"
NOTE2='the failure is the log line "expected 3 columns, got 2" from the csv reader path'
"$GUARD" --root-cause "$NOTE2" --session $S >/dev/null 2>&1; RC=$?
[ "$RC" -eq 0 ] && ok "quoted log line counts as evidence" || no "quoted log line rejected rc=$RC"

# 5. a passing run disarms ---------------------------------------------------
S=s-pass
hook "$(bash_run $S "$T1" "$FAILOUT")"; hook "$(edit_evt Post $S /p/a.sh)"; hook "$(bash_run $S "$T1" "$FAILOUT")"
hook "$(edit_evt Pre $S /p/a.sh)"; [ $? -eq 2 ] && ok "pre-pass: armed" || no "pre-pass not armed"
hook "$(bash_run $S "$T1" "$PASSOUT")"
hook "$(edit_evt Pre $S /p/a.sh)"; RC=$?
[ "$RC" -eq 0 ] && ok "passing run disarms" || no "passing run did not disarm rc=$RC"

# 6. non-arming sequences ------------------------------------------------------
S=s-diff
hook "$(bash_run $S "$T1" "$FAILOUT")"; hook "$(edit_evt Post $S /p/a.sh)"
hook "$(bash_run $S "bash tests/test-other.sh" "$FAILOUT")"
hook "$(edit_evt Pre $S /p/a.sh)"; RC=$?
[ "$RC" -eq 0 ] && ok "different test command does not arm" || no "different command armed rc=$RC"
S=s-noedit
hook "$(bash_run $S "$T1" "$FAILOUT")"; hook "$(bash_run $S "$T1" "$FAILOUT")"
hook "$(edit_evt Pre $S /p/a.sh)"; RC=$?
[ "$RC" -eq 0 ] && ok "re-run without edits does not arm" || no "no-edit rerun armed rc=$RC"
S=s-fixed
hook "$(bash_run $S "$T1" "$FAILOUT")"; hook "$(edit_evt Post $S /p/a.sh)"; hook "$(bash_run $S "$T1" "$PASSOUT")"
hook "$(edit_evt Post $S /p/a.sh)"; hook "$(bash_run $S "$T1" "$FAILOUT")"
hook "$(edit_evt Pre $S /p/a.sh)"; RC=$?
[ "$RC" -eq 0 ] && ok "fail->edit->pass->edit->fail does not arm (new red)" || no "post-pass first fail armed rc=$RC"

# 7. outcome detection: exit code, failure event --------------------------------
S=s-exit
hook "$(bash_run $S "$T1" "no markers here" 1)"; hook "$(edit_evt Post $S /p/a.sh)"
hook "$(bash_run $S "$T1" "still nothing" 1)"
hook "$(edit_evt Pre $S /p/a.sh)"; RC=$?
[ "$RC" -eq 2 ] && ok "exit_code=1 counts as failure" || no "exit code ignored rc=$RC"
S=s-event
hook "$(bash_fail_event $S "$T1" "Exit code 1")"; hook "$(edit_evt Post $S /p/a.sh)"
hook "$(bash_fail_event $S "$T1" "Exit code 1")"
hook "$(edit_evt Pre $S /p/a.sh)"; RC=$?
[ "$RC" -eq 2 ] && ok "PostToolUseFailure counts as failure" || no "failure event ignored rc=$RC"
S=s-zero
hook "$(bash_run $S "$T1" "$FAILOUT")"; hook "$(edit_evt Post $S /p/a.sh)"
hook "$(bash_run $S "$T1" "$PASSOUT" 0)"
hook "$(edit_evt Pre $S /p/a.sh)"; RC=$?
[ "$RC" -eq 0 ] && ok "exit_code=0 with '0 failed' counts as pass" || no "pass misread rc=$RC"
S=s-cargo
C="cargo test"
hook "$(bash_run $S "$C" $'test result: FAILED. 3 passed; 1 failed')"; hook "$(edit_evt Post $S /p/lib.rs)"
hook "$(bash_run $S "$C" $'test result: FAILED. 3 passed; 1 failed')"
hook "$(edit_evt Pre $S /p/lib.rs)"; RC=$?
[ "$RC" -eq 2 ] && ok "cargo 'test result: FAILED' detected" || no "cargo failure missed rc=$RC"

# 8. subagent scope isolation ------------------------------------------------------
S=s-sub
hook "$(bash_run $S "$T1" "$FAILOUT" "" agentA)"; hook "$(edit_evt Post $S /p/a.sh Edit agentA)"
hook "$(bash_run $S "$T1" "$FAILOUT" "" agentA)"
hook "$(edit_evt Pre $S /p/a.sh Edit agentA)"; RC=$?
[ "$RC" -eq 2 ] && ok "subagent arms its own scope" || no "subagent not armed rc=$RC"
hook "$(edit_evt Pre $S /p/a.sh)"; RC=$?
[ "$RC" -eq 0 ] && ok "main chat unaffected by subagent arming" || no "main chat blocked by subagent rc=$RC"

# 9. --root-cause without --session: single armed scope is picked --------------
FRESH="$TMP/state2"
S=s-only
CFN_REPEAT_FIX_STATE_ROOT="$FRESH" bash -c '
  g=$1; s=$2; t=$3; f=$4
  printf "%s" "$(jq -nc --arg s "$s" --arg c "$t" --arg o "$f" "{session_id:\$s,hook_event_name:\"PostToolUse\",tool_name:\"Bash\",tool_input:{command:\$c},tool_response:{stdout:\$o}}")" | "$g" >/dev/null 2>&1
  printf "%s" "{\"session_id\":\"$s\",\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/p/a.sh\"}}" | "$g" >/dev/null 2>&1
  printf "%s" "$(jq -nc --arg s "$s" --arg c "$t" --arg o "$f" "{session_id:\$s,hook_event_name:\"PostToolUse\",tool_name:\"Bash\",tool_input:{command:\$c},tool_response:{stdout:\$o}}")" | "$g" >/dev/null 2>&1
' _ "$GUARD" "$S" "$T1" "$FAILOUT"
CFN_REPEAT_FIX_STATE_ROOT="$FRESH" "$GUARD" --root-cause "$NOTE" >/dev/null 2>"$TMP/err.txt"; RC=$?
[ "$RC" -eq 0 ] && ok "--root-cause without --session picks the only armed scope" || no "sessionless note rc=$RC err=$(cat "$TMP/err.txt")"

# 10. modes and fail-open ------------------------------------------------------------
S=s-mode
hook "$(bash_run $S "$T1" "$FAILOUT")"; hook "$(edit_evt Post $S /p/a.sh)"; hook "$(bash_run $S "$T1" "$FAILOUT")"
CFN_REPEAT_FIX_GUARD=warn hook "$(edit_evt Pre $S /p/a.sh)"; RC=$?
[ "$RC" -eq 0 ] && grep -q additionalContext "$TMP/out.txt" && ok "warn mode: allowed with additionalContext" || no "warn mode rc=$RC out=$(cat "$TMP/out.txt")"
CFN_REPEAT_FIX_GUARD=off hook "$(edit_evt Pre $S /p/a.sh)"; RC=$?
[ "$RC" -eq 0 ] && [ ! -s "$TMP/out.txt" ] && ok "off mode: silent allow" || no "off mode rc=$RC"
printf 'not json{{' | "$GUARD" >/dev/null 2>&1; RC=$?
[ "$RC" -eq 0 ] && ok "garbage stdin fails open" || no "garbage stdin rc=$RC"
mkdir -p "$TMP/ro"; chmod 500 "$TMP/ro"
printf '%s' "$(bash_run s-ro "$T1" "$FAILOUT")" | CFN_REPEAT_FIX_STATE_ROOT="$TMP/ro/x" "$GUARD" >/dev/null 2>"$TMP/err.txt"; RC=$?
[ "$RC" -eq 0 ] && ok "unwritable state root fails open (rc=0)" || no "unwritable state rc=$RC"
grep -q "cfn-repeat-fix-guard" "$TMP/err.txt" && ok "fail-open prints one stderr line" || no "fail-open silent"

# 11. cleanup of stale state ------------------------------------------------------------
mkdir -p "$CFN_REPEAT_FIX_STATE_ROOT/s-stale"; touch -d '10 days ago' "$CFN_REPEAT_FIX_STATE_ROOT/s-stale"
hook "$(bash_run s-new "$T1" "$FAILOUT")"
[ ! -d "$CFN_REPEAT_FIX_STATE_ROOT/s-stale" ] && ok "stale session state pruned" || no "stale state left behind"

# 12. latency: PreToolUse and PostToolUse Bash stay well under the 3000ms hook budget --
MAX=0
for _ in 1 2 3 4 5; do
    t0=$(cfn_now_ms); hook "$(edit_evt Pre s-arm /p/src/x.sh)"; t1=$(cfn_now_ms)
    hook "$(bash_run s-lat "$T1" "$FAILOUT")"; t2=$(cfn_now_ms)
    for d in $((t1 - t0)) $((t2 - t1)); do [ "$d" -gt "$MAX" ] && MAX=$d; done
done
[ "$MAX" -lt 1000 ] && ok "slowest call ${MAX}ms < 1000ms" || no "slowest call ${MAX}ms >= 1000ms"

echo
echo "repeat-fix-guard: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
