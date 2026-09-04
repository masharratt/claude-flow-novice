#!/usr/bin/env bash
# Brief-budget branch of cfn-spawn-depth-guard.sh (rule 2). Depth-limit branch
# (rule 1) has its own selfcheck; these tests pin the main-chat size behavior:
# under-budget pass, over-budget warn (exit 0 + log line), deny mode (exit 2),
# off mode (no log), subagent payloads untouched by the size rule.
# Isolation: temp warn log via CFN_BRIEF_WARN_LOG; never touches real $HOME.
# Conventions per tests/test-night-mode.sh (ok/no counters, trap cleanup EXIT).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD="$ROOT/.claude/hooks/cfn-spawn-depth-guard.sh"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/briefguard-test-XXXXXX")
export CFN_BRIEF_WARN_LOG="$TMP/warn.log"
unset CFN_BRIEF_GUARD CFN_BRIEF_MAX_BYTES 2>/dev/null || true

PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }
cleanup(){ rm -rf "$TMP"; }
trap cleanup EXIT

for dep in jq wc date mktemp; do
    command -v "$dep" >/dev/null 2>&1 || { echo "FATAL: $dep not on PATH"; exit 1; }
done
[ -x "$GUARD" ] || { echo "FATAL: $GUARD not executable"; exit 1; }

main_payload(){ # $1 = prompt bytes (approx via head -c)
  local filler
  filler=$(head -c "$1" /dev/zero | tr '\0' 'x')
  printf '{"hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"subagent_type":"general-purpose","prompt":"%s"}}' "$filler"
}

run_guard(){ printf '%s' "$1" | "$GUARD" 2>"$TMP/stderr.txt"; }

# 1. small brief, main chat: pass, no warn, no log
unset CFN_BRIEF_GUARD CFN_BRIEF_MAX_BYTES
OUT=$(run_guard "$(main_payload 500)"); RC=$?
[ "$RC" -eq 0 ] && ok "small main-chat brief passes (rc=0)" || no "small main-chat brief rc=$RC"
[ ! -s "$TMP/stderr.txt" ] && ok "small brief: no stderr" || no "small brief wrote stderr"
[ ! -f "$CFN_BRIEF_WARN_LOG" ] && ok "small brief: no log file" || no "small brief logged"

# 2. over-budget brief, default (warn): rc=0, stderr flag, log line appended
run_guard "$(main_payload 6000)" >/dev/null; RC=$?
[ "$RC" -eq 0 ] && ok "over-budget default warn: spawn proceeds (rc=0)" || no "over-budget default rc=$RC (should be 0)"
grep -q "BRIEF OVER BUDGET" "$TMP/stderr.txt" && ok "warn prints BRIEF OVER BUDGET to stderr" || no "warn stderr missing"
grep -q "mode=warn size=" "$CFN_BRIEF_WARN_LOG" && ok "warn appends log line" || no "warn log line missing"

# 3. over-budget, CFN_BRIEF_GUARD=deny: rc=2, log line
CFN_BRIEF_GUARD=deny run_guard "$(main_payload 6000)" >/dev/null; RC=$?
[ "$RC" -eq 2 ] && ok "deny mode blocks (rc=2)" || no "deny mode rc=$RC (should be 2)"
grep -q "mode=deny" "$CFN_BRIEF_WARN_LOG" && ok "deny appends log line" || no "deny log line missing"

# 4. CFN_BRIEF_GUARD=off: rc=0, no new log lines
BEFORE=$(wc -l < "$CFN_BRIEF_WARN_LOG" 2>/dev/null || echo 0)
CFN_BRIEF_GUARD=off run_guard "$(main_payload 6000)" >/dev/null; RC=$?
AFTER=$(wc -l < "$CFN_BRIEF_WARN_LOG" 2>/dev/null || echo 0)
[ "$RC" -eq 0 ] && [ "$BEFORE" -eq "$AFTER" ] && ok "off mode: rc=0, no log" || no "off mode rc=$RC lines $BEFORE->$AFTER"

# 5. custom threshold respected: 5000-byte brief under CFN_BRIEF_MAX_BYTES=6000 passes
CFN_BRIEF_MAX_BYTES=6000 run_guard "$(main_payload 5000)" >/dev/null; RC=$?
[ "$RC" -eq 0 ] && ok "raised threshold: 5000B under 6000 passes" || no "raised threshold rc=$RC"

# 6. subagent payload (agent_id present): size rule never fires, depth rule path intact
SUB='{"agent_id":"a1","agent_type":"general-purpose","hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"subagent_type":"researcher","prompt":"'"$(head -c 6000 /dev/zero | tr '\0' 'x')"'"}}'
run_guard "$SUB" >/dev/null; RC=$?
[ "$RC" -eq 2 ] && ok "subagent big prompt: depth block (rc=2), size rule skipped" || no "subagent payload rc=$RC"
grep -q "nested subagent spawn" "$TMP/stderr.txt" && ok "subagent stderr cites depth rule" || no "subagent stderr missing depth text"

# 7. non-Agent/empty-prompt payload: silent pass
run_guard '{"hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"subagent_type":"general-purpose"}}' >/dev/null; RC=$?
[ "$RC" -eq 0 ] && [ ! -s "$TMP/stderr.txt" ] && ok "no-prompt payload passes silently" || no "no-prompt payload rc=$RC or stderr set"

echo
echo "brief-size-guard: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
