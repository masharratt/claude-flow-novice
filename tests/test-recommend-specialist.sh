#!/usr/bin/env bash
# Regression tests for cfn-task-intelligence recommend-specialist.sh
# Bug: jq `join(", ", $themes)` is malformed (join takes array as input, not arg).
#   Pre-fix: `jq: error (at <unknown>): Cannot iterate over null (null)`, exit 5.
#   Post-fix: valid JSON, reasoning string interpolates the theme list.
set -u

SCRIPT="$(git rev-parse --show-toplevel)/.claude/skills/cfn-task-intelligence/lib/specialist/recommend-specialist.sh"
PASS=0; FAIL=0
ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

# 1. matching theme -> exit 0, valid JSON, specialist set, themes joined in reasoning
out=$(bash "$SCRIPT" --current-loop3 coder,tester --feedback-themes security,authentication --recurring-count 3 2>&1)
rc=$?
[ "$rc" -eq 0 ] && ok "matching theme exits 0" || bad "matching theme exit=$rc (expected 0): $out"
echo "$out" | jq -e . >/dev/null 2>&1 && ok "output is valid JSON" || bad "output not valid JSON: $out"
[ "$(echo "$out" | jq -r '.add_specialist')" = "security-specialist" ] && ok "recommends security-specialist" || bad "wrong specialist: $out"
echo "$out" | jq -e '.reasoning | test("security")' >/dev/null 2>&1 && ok "reasoning includes joined theme" || bad "reasoning missing theme: $out"

# 2. already-in-team -> exit 0, error JSON (regression: jq must not choke)
out=$(bash "$SCRIPT" --current-loop3 security-specialist,coder --feedback-themes security --recurring-count 3 2>&1)
echo "$out" | jq -e . >/dev/null 2>&1 && ok "already-in-team path valid JSON" || bad "already-in-team not JSON: $out"

# 3. no matching specialist -> exit 1, error JSON
out=$(bash "$SCRIPT" --current-loop3 coder --feedback-themes unrelated --recurring-count 3 2>&1)
[ $? -eq 1 ] && ok "no-match exits 1" || bad "no-match wrong exit: $out"

echo "---"; echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
