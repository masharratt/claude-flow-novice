#!/usr/bin/env bash
# Simple validation of coordinator → orchestrate.sh parameter passing

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

echo "Testing coordinator parameter handoff..."

# Test 1: Positional TASK_ID format
CALL=$(grep -A 5 'ORCHESTRATE_SCRIPT.*execute' "$PROJECT_ROOT/docker/coordinator-entrypoint.sh" | head -7)

if echo "$CALL" | grep -q 'execute "\$TASK_ID"'; then
  echo "✅ PASS: TASK_ID passed as positional argument"
  EXIT_CODE=0
else
  echo "❌ FAIL: TASK_ID not in positional format"
  echo "Found: $CALL"
  EXIT_CODE=1
fi

# Test 2: No --task-id flag in orchestrate.sh
if ! grep -q -- '--task-id)' "$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"; then
  echo "✅ PASS: No --task-id flag handler (correct)"
else
  echo "❌ FAIL: Found --task-id flag handler"
  ((EXIT_CODE++))
fi

exit $EXIT_CODE
