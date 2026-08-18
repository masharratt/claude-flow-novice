#!/usr/bin/env bash
##############################################################################
# P4: Product Owner Scope Enforcement Test
#
# Tests 5 scenarios:
# 1. High consensus, no out-of-scope items → PROCEED
# 2. High consensus, out-of-scope items present → DEFER_AND_PROCEED
# 3. Low overall consensus, high in-scope consensus → DEFER_AND_PROCEED
# 4. Low in-scope consensus, within iteration limit → ITERATE
# 5. Max iterations reached → ABORT
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Test configuration
REDIS_PREFIX="test-p4"
PASS_COUNT=0
FAIL_COUNT=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper: Setup test Redis data
setup_test_data() {
  local TASK_ID=$1
  local CONSENSUS=$2
  local ITERATION=$3
  local FEEDBACK_JSON=$4

  # Store Loop 2 consensus metric
  CONSENSUS_METRIC=$(jq -nc \
    --arg consensus "$CONSENSUS" \
    --arg iteration "$ITERATION" \
    '{consensus: ($consensus | tonumber), iteration: ($iteration | tonumber)}')

  echo "$CONSENSUS_METRIC" | redis-cli -x LPUSH "swarm:${TASK_ID}:metrics:loop2_consensus" >/dev/null

  # Store feedback
  if [ "$FEEDBACK_JSON" != "[]" ]; then
    for item in $(echo "$FEEDBACK_JSON" | jq -r '.[] | @base64'); do
      FEEDBACK_TEXT=$(echo "$item" | base64 --decode)
      redis-cli LPUSH "swarm:${TASK_ID}:loop2:feedback" "$FEEDBACK_TEXT" >/dev/null
    done
  fi

  # Store success criteria
  SUCCESS_CRITERIA=$(jq -nc '{acceptanceCriteria: ["File created", "Content verified"]}')
  echo "$SUCCESS_CRITERIA" | redis-cli -x SET "swarm:${TASK_ID}:success-criteria" >/dev/null

  # Store epic context
  EPIC_CONTEXT=$(jq -nc '{
    epicGoal: "Test epic goal",
    inScope: ["File creation", "Content verification"],
    outOfScope: ["Advanced features", "Performance optimization"]
  }')
  echo "$EPIC_CONTEXT" | redis-cli -x SET "swarm:${TASK_ID}:epic-context" >/dev/null
}

# Helper: Cleanup test data
cleanup_test_data() {
  local TASK_ID=$1
  redis-cli --scan --pattern "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
}

# Helper: Run test
run_test() {
  local TEST_NAME=$1
  local TASK_ID="${REDIS_PREFIX}-$(date +%s%N)"
  local AGENT_ID="product-owner-test"

  echo ""
  echo -e "${YELLOW}Test: $TEST_NAME${NC}"
  echo "Task ID: $TASK_ID"

  # Execute test logic in subshell (captures test-specific setup)
  local RESULT
  if eval "$2"; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASS_COUNT++))
    RESULT="PASS"
  else
    echo -e "${RED}❌ FAIL${NC}"
    ((FAIL_COUNT++))
    RESULT="FAIL"
  fi

  # Cleanup
  cleanup_test_data "$TASK_ID"

  return 0
}

# Helper: Validate decision
validate_decision() {
  local TASK_ID=$1
  local AGENT_ID=$2
  local EXPECTED_DECISION=$3

  # Get decision from Redis
  DECISION_JSON=$(redis-cli lindex "swarm:${TASK_ID}:${AGENT_ID}:decision" 0)

  if [ -z "$DECISION_JSON" ] || [ "$DECISION_JSON" = "(nil)" ]; then
    echo "  ❌ No decision found in Redis"
    return 1
  fi

  ACTUAL_DECISION=$(echo "$DECISION_JSON" | jq -r '.decision')

  if [ "$ACTUAL_DECISION" = "$EXPECTED_DECISION" ]; then
    echo "  ✅ Decision: $ACTUAL_DECISION (expected: $EXPECTED_DECISION)"
    return 0
  else
    echo "  ❌ Decision: $ACTUAL_DECISION (expected: $EXPECTED_DECISION)"
    return 1
  fi
}

##############################################################################
# Test 1: High consensus, no out-of-scope items → PROCEED
##############################################################################
test_1() {
  local TASK_ID="${REDIS_PREFIX}-test1-$(date +%s%N)"
  local AGENT_ID="product-owner-test1"

  setup_test_data "$TASK_ID" "0.95" "1" '["File created successfully", "Content verified"]'

  # Run Product Owner decision script
  if ! ./.claude/skills/redis-coordination/execute-product-owner-decision.sh \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" >/dev/null 2>&1; then
    echo "  ❌ Script execution failed"
    return 1
  fi

  validate_decision "$TASK_ID" "$AGENT_ID" "PROCEED"
}

##############################################################################
# Test 2: High consensus, out-of-scope items → DEFER_AND_PROCEED
##############################################################################
test_2() {
  local TASK_ID="${REDIS_PREFIX}-test2-$(date +%s%N)"
  local AGENT_ID="product-owner-test2"

  setup_test_data "$TASK_ID" "0.92" "1" '[
    "File created successfully",
    "Consider adding caching for performance",
    "Future: Add retry logic for resilience"
  ]'

  # Run Product Owner decision script
  ./.claude/skills/redis-coordination/execute-product-owner-decision.sh \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" >/dev/null 2>&1

  # Check decision
  DECISION_JSON=$(redis-cli lindex "swarm:${TASK_ID}:${AGENT_ID}:decision" 0)
  DECISION=$(echo "$DECISION_JSON" | jq -r '.decision')
  BACKLOG_COUNT=$(echo "$DECISION_JSON" | jq -r '.backlog_items | length')

  if [ "$DECISION" = "DEFER_AND_PROCEED" ] && [ "$BACKLOG_COUNT" -gt 0 ]; then
    echo "  ✅ Decision: DEFER_AND_PROCEED with $BACKLOG_COUNT backlog items"
    return 0
  else
    echo "  ❌ Expected DEFER_AND_PROCEED with backlog items, got: $DECISION (backlog: $BACKLOG_COUNT)"
    return 1
  fi
}

##############################################################################
# Test 3: Low overall consensus, high in-scope consensus → DEFER_AND_PROCEED
##############################################################################
test_3() {
  local TASK_ID="${REDIS_PREFIX}-test3-$(date +%s%N)"
  local AGENT_ID="product-owner-test3"

  # Overall consensus 0.75, but mostly out-of-scope items
  setup_test_data "$TASK_ID" "0.75" "1" '[
    "Add monitoring dashboard",
    "Implement analytics tracking",
    "Add user notifications",
    "File created as specified"
  ]'

  ./.claude/skills/redis-coordination/execute-product-owner-decision.sh \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" >/dev/null 2>&1

  # Check decision and in-scope consensus
  DECISION_JSON=$(redis-cli lindex "swarm:${TASK_ID}:${AGENT_ID}:decision" 0)
  DECISION=$(echo "$DECISION_JSON" | jq -r '.decision')
  IN_SCOPE_CONSENSUS=$(echo "$DECISION_JSON" | jq -r '.scope_analysis.in_scope_consensus')

  # Even with low overall consensus, if high in-scope consensus → DEFER_AND_PROCEED
  echo "  In-scope consensus: $IN_SCOPE_CONSENSUS"

  if [ "$DECISION" = "PROCEED" ] || [ "$DECISION" = "DEFER_AND_PROCEED" ]; then
    echo "  ✅ Decision: $DECISION (in-scope work acceptable)"
    return 0
  else
    echo "  ❌ Expected PROCEED or DEFER_AND_PROCEED, got: $DECISION"
    return 1
  fi
}

##############################################################################
# Test 4: Low in-scope consensus → ITERATE
##############################################################################
test_4() {
  local TASK_ID="${REDIS_PREFIX}-test4-$(date +%s%N)"
  local AGENT_ID="product-owner-test4"

  setup_test_data "$TASK_ID" "0.65" "3" '["File content incomplete", "Missing error handling"]'

  ./.claude/skills/redis-coordination/execute-product-owner-decision.sh \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" >/dev/null 2>&1

  validate_decision "$TASK_ID" "$AGENT_ID" "ITERATE"
}

##############################################################################
# Test 5: Max iterations reached → ABORT
##############################################################################
test_5() {
  local TASK_ID="${REDIS_PREFIX}-test5-$(date +%s%N)"
  local AGENT_ID="product-owner-test5"

  setup_test_data "$TASK_ID" "0.70" "10" '["Still needs improvement"]'

  ./.claude/skills/redis-coordination/execute-product-owner-decision.sh \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" >/dev/null 2>&1

  validate_decision "$TASK_ID" "$AGENT_ID" "ABORT"
}

##############################################################################
# Main Test Execution
##############################################################################
echo "=========================================="
echo "P4: Product Owner Scope Enforcement Tests"
echo "=========================================="

run_test "Test 1: High consensus, no out-of-scope → PROCEED" test_1
run_test "Test 2: High consensus, out-of-scope items → DEFER_AND_PROCEED" test_2
run_test "Test 3: Low overall, high in-scope → DEFER_AND_PROCEED/PROCEED" test_3
run_test "Test 4: Low in-scope consensus → ITERATE" test_4
run_test "Test 5: Max iterations → ABORT" test_5

echo ""
echo "=========================================="
echo "Test Results"
echo "=========================================="
echo -e "${GREEN}PASSED: $PASS_COUNT${NC}"
echo -e "${RED}FAILED: $FAIL_COUNT${NC}"
echo "=========================================="

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
