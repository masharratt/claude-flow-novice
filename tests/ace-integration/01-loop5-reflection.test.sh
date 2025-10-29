#!/usr/bin/env bash

##############################################################################
# Test: Loop 5 Reflection Hook Integration
# Verifies reflection launches in background without blocking orchestrator
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ORCHESTRATOR="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

# Test counter
TESTS_RUN=0
TESTS_PASSED=0

function test_assert() {
  local condition="$1"
  local description="$2"

  TESTS_RUN=$((TESTS_RUN + 1))

  if eval "$condition"; then
    echo "✅ PASS: $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "❌ FAIL: $description"
  fi
}

function cleanup() {
  # Clean up test artifacts
  rm -f /tmp/reflection-test-*.json
  rm -f "$PROJECT_ROOT/.artifacts/logs/ace-reflection-test-*.log"
  redis-cli DEL "swarm:test-task-*" >/dev/null 2>&1 || true
}

trap cleanup EXIT

echo "=============================================="
echo "Loop 5 Reflection Hook Tests"
echo "=============================================="
echo ""

##############################################################################
# Test 1: Verify PROCEED case includes reflection invocation
##############################################################################
echo "Test 1: Verify reflection hook exists in PROCEED case"

grep -A 20 'PROCEED)' "$ORCHESTRATOR" | grep -q "invoke-context-reflect.sh"
test_assert "$?" "Reflection invocation exists in PROCEED case"

grep -A 20 'PROCEED)' "$ORCHESTRATOR" | grep -q "Loop 5"
test_assert "$?" "Loop 5 marker comment exists"

##############################################################################
# Test 2: Verify background execution pattern
##############################################################################
echo ""
echo "Test 2: Verify background execution pattern"

grep -A 30 'PROCEED)' "$ORCHESTRATOR" | grep -q "& *$"
test_assert "$?" "Background execution operator (&) present"

grep -A 30 'PROCEED)' "$ORCHESTRATOR" | grep -q "REFLECTION_PID=\$!"
test_assert "$?" "PID capture for background process exists"

##############################################################################
# Test 3: Verify non-blocking behavior (exit before reflection completes)
##############################################################################
echo ""
echo "Test 3: Verify non-blocking behavior"

# Check that output_result and exit come AFTER reflection launch
PROCEED_LINE=$(grep -n 'PROCEED)' "$ORCHESTRATOR" | cut -d: -f1)
REFLECTION_LINE=$(grep -n "invoke-context-reflect.sh" "$ORCHESTRATOR" | cut -d: -f1)
OUTPUT_LINE=$(grep -n "output_result \"success\"" "$ORCHESTRATOR" | cut -d: -f1)

test_assert "[[ $REFLECTION_LINE -gt $PROCEED_LINE ]]" "Reflection launched after PROCEED case starts"
test_assert "[[ $OUTPUT_LINE -gt $REFLECTION_LINE ]]" "Output called after reflection launched"

##############################################################################
# Test 4: Verify error handling (stderr redirect to log)
##############################################################################
echo ""
echo "Test 4: Verify error handling"

grep -A 30 'PROCEED)' "$ORCHESTRATOR" | grep -q "2>&1"
test_assert "$?" "stderr redirect to log exists"

grep -A 30 'PROCEED)' "$ORCHESTRATOR" | grep -q "tee -a"
test_assert "$?" "Log file append (tee -a) exists"

##############################################################################
# Test 5: Verify log directory creation
##############################################################################
echo ""
echo "Test 5: Verify log directory creation"

grep -B 5 "invoke-context-reflect.sh" "$ORCHESTRATOR" | grep -q "mkdir -p.*\.artifacts/logs"
test_assert "$?" "Log directory creation exists"

##############################################################################
# Test 6: Verify reflection context structure
##############################################################################
echo ""
echo "Test 6: Verify reflection context structure"

grep -A 15 "REFLECTION_CONTEXT" "$ORCHESTRATOR" | grep -q '"task_id"'
test_assert "$?" "Context includes task_id"

grep -A 15 "REFLECTION_CONTEXT" "$ORCHESTRATOR" | grep -q '"task_type"'
test_assert "$?" "Context includes task_type"

grep -A 15 "REFLECTION_CONTEXT" "$ORCHESTRATOR" | grep -q '"loop3_confidence"'
test_assert "$?" "Context includes loop3_confidence"

grep -A 15 "REFLECTION_CONTEXT" "$ORCHESTRATOR" | grep -q '"loop2_consensus"'
test_assert "$?" "Context includes loop2_consensus"

##############################################################################
# Test 7: Verify JSON structure validity
##############################################################################
echo ""
echo "Test 7: Verify JSON context structure"

# Extract JSON template and validate structure
CONTEXT_TEMPLATE=$(grep -A 20 'REFLECTION_CONTEXT' "$ORCHESTRATOR" | \
  sed -n '/^{/,/^}/p' | \
  sed 's/\$[A-Z_]*/0/g' | \
  sed 's/\$[{][A-Z_]*[}]/0/g')

echo "$CONTEXT_TEMPLATE" | jq . >/dev/null 2>&1
test_assert "$?" "Reflection context is valid JSON structure"

##############################################################################
# Test 8: Verify output file path format
##############################################################################
echo ""
echo "Test 8: Verify output file path"

grep -A 30 'PROCEED)' "$ORCHESTRATOR" | grep -q "/tmp/reflection-\${TASK_ID}.json"
test_assert "$?" "Output file includes task_id in path"

grep -A 30 'PROCEED)' "$ORCHESTRATOR" | grep -q "\.artifacts/logs/ace-reflection-\${TASK_ID}.log"
test_assert "$?" "Log file includes task_id in path"

##############################################################################
# Summary
##############################################################################
echo ""
echo "=============================================="
echo "Test Summary"
echo "=============================================="
echo "Tests run: $TESTS_RUN"
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $((TESTS_RUN - TESTS_PASSED))"

if [ $TESTS_PASSED -eq $TESTS_RUN ]; then
  echo ""
  echo "✅ All tests passed!"
  exit 0
else
  echo ""
  echo "❌ Some tests failed"
  exit 1
fi
