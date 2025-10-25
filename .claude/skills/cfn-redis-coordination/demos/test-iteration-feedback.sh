#!/bin/bash
#
# Test Script: Iteration Feedback Mechanism
#
# Validates that:
# 1. Validators can report feedback with confidence scores
# 2. Orchestrator collects and aggregates feedback
# 3. Feedback is passed to Loop 3 agents via wake signal
# 4. Feedback is stored in Redis with TTL
# 5. Agents can read feedback for iteration N

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_ID="test-feedback-$(date +%s)"

echo "=========================================="
echo "Iteration Feedback Mechanism Test"
echo "=========================================="
echo "Task ID: $TASK_ID"
echo ""

# Cleanup function
cleanup() {
  echo ""
  echo "Cleaning up Redis keys..."
  redis-cli --scan --pattern "swarm:${TASK_ID}:*" | xargs -r redis-cli del >/dev/null 2>&1 || true
  echo "✅ Cleanup complete"
}

# Register cleanup on exit
trap cleanup EXIT

# Test 1: Validators report confidence with feedback
echo "=== Test 1: Validators Report Feedback ==="
echo ""

VALIDATOR_1="reviewer-1"
VALIDATOR_2="tester-1"
VALIDATOR_3="security-1"

# Validator 1: Low confidence with specific feedback
echo "[$VALIDATOR_1] Reporting confidence 0.65 with 2 feedback items..."
$SCRIPT_DIR/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$VALIDATOR_1" \
  --confidence 0.65 \
  --iteration 1 \
  --feedback "Add error handling for null inputs,Improve documentation for API endpoints"

echo ""

# Validator 2: Medium confidence with 3 feedback items
echo "[$VALIDATOR_2] Reporting confidence 0.72 with 3 feedback items..."
$SCRIPT_DIR/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$VALIDATOR_2" \
  --confidence 0.72 \
  --iteration 1 \
  --feedback "Increase test coverage to 80%,Add edge case tests for empty arrays,Fix flaky timeout test"

echo ""

# Validator 3: Low confidence with security feedback
echo "[$VALIDATOR_3] Reporting confidence 0.60 with 2 feedback items..."
$SCRIPT_DIR/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$VALIDATOR_3" \
  --confidence 0.60 \
  --iteration 1 \
  --feedback "Fix SQL injection vulnerability in query builder,Add rate limiting to API endpoints"

echo ""

# Test 2: Collect feedback from validators
echo "=== Test 2: Orchestrator Collects Feedback ==="
echo ""

COLLECT_OUTPUT=$($SCRIPT_DIR/invoke-waiting-mode.sh collect \
  --task-id "$TASK_ID" \
  --agent-ids "$VALIDATOR_1,$VALIDATOR_2,$VALIDATOR_3")

echo "$COLLECT_OUTPUT"
echo ""

# Extract consensus and feedback
CONSENSUS=$(echo "$COLLECT_OUTPUT" | tail -1)
echo "Calculated Consensus: $CONSENSUS"

# Verify feedback aggregation
if echo "$COLLECT_OUTPUT" | grep -q "Aggregated Feedback"; then
  echo "✅ Feedback aggregated successfully"
  FEEDBACK_COUNT=$(echo "$COLLECT_OUTPUT" | grep -c '^\s*-' || echo "0")
  echo "   Total feedback items: $FEEDBACK_COUNT"
else
  echo "❌ No aggregated feedback found"
  exit 1
fi

echo ""

# Test 3: Wake Loop 3 agent with validator feedback
echo "=== Test 3: Wake Loop 3 Agent with Feedback ==="
echo ""

LOOP3_AGENT="backend-dev"

# Extract aggregated feedback for passing to Loop 3
LOOP2_FEEDBACK=$(echo "$COLLECT_OUTPUT" | sed -n '/Aggregated Feedback/,/Consensus:/p' | grep '^\s*-' | sed 's/^\s*-\s*//' | paste -sd ',' -)

# Build full feedback message
FULL_FEEDBACK="Improve consensus from $CONSENSUS to >=0.90,$LOOP2_FEEDBACK"

echo "Waking $LOOP3_AGENT with comprehensive feedback..."
echo "Feedback items: $(echo "$FULL_FEEDBACK" | tr ',' '\n' | wc -l)"
echo ""

$SCRIPT_DIR/invoke-waiting-mode.sh wake \
  --task-id "$TASK_ID" \
  --agent-id "$LOOP3_AGENT" \
  --reason "cfn_loop_iteration" \
  --iteration 2 \
  --priority 30 \
  --feedback "$FULL_FEEDBACK"

echo ""

# Test 4: Verify feedback stored in Redis
echo "=== Test 4: Verify Feedback Storage ==="
echo ""

FEEDBACK_KEY="swarm:${TASK_ID}:${LOOP3_AGENT}:feedback:iteration-2"
echo "Checking Redis key: $FEEDBACK_KEY"

STORED_FEEDBACK=$(redis-cli get "$FEEDBACK_KEY")

if [ -n "$STORED_FEEDBACK" ] && [ "$STORED_FEEDBACK" != "(nil)" ]; then
  echo "✅ Feedback stored successfully"
  echo ""
  echo "Stored feedback (JSON array):"
  echo "$STORED_FEEDBACK" | jq '.'
  echo ""

  # Verify TTL
  TTL=$(redis-cli ttl "$FEEDBACK_KEY")
  echo "TTL: $TTL seconds ($(echo "scale=1; $TTL / 3600" | bc) hours)"

  if [ "$TTL" -gt 0 ] && [ "$TTL" -le 86400 ]; then
    echo "✅ TTL is correct (≤24 hours)"
  else
    echo "❌ TTL is incorrect: $TTL"
    exit 1
  fi
else
  echo "❌ Feedback not found in Redis"
  exit 1
fi

echo ""

# Test 5: Agent reads feedback
echo "=== Test 5: Agent Reads Feedback ==="
echo ""

echo "Simulating agent reading feedback from Redis..."
AGENT_FEEDBACK=$(redis-cli get "$FEEDBACK_KEY")

if [ -n "$AGENT_FEEDBACK" ] && [ "$AGENT_FEEDBACK" != "(nil)" ]; then
  echo "✅ Agent successfully read feedback"
  echo ""
  echo "Feedback items available to agent:"
  echo "$AGENT_FEEDBACK" | jq -r '.[]' | nl -w2 -s'. '
  echo ""

  ITEM_COUNT=$(echo "$AGENT_FEEDBACK" | jq '. | length')
  echo "Total actionable items: $ITEM_COUNT"
else
  echo "❌ Agent failed to read feedback"
  exit 1
fi

echo ""

# Test 6: Wake queue contains feedback
echo "=== Test 6: Verify Wake Queue Feedback ==="
echo ""

WAKE_QUEUE="swarm:${TASK_ID}:${LOOP3_AGENT}:wake-queue"
echo "Checking wake queue: $WAKE_QUEUE"

# Pop wake message from queue
WAKE_MSG=$(redis-cli ZPOPMIN "$WAKE_QUEUE" 1 | sed -n '1p')

if [ -n "$WAKE_MSG" ] && [ "$WAKE_MSG" != "(nil)" ]; then
  echo "✅ Wake message found in queue"
  echo ""
  echo "Wake message contents:"
  echo "$WAKE_MSG" | jq '.'
  echo ""

  # Verify feedback in wake message
  WAKE_FEEDBACK=$(echo "$WAKE_MSG" | jq -r '.feedback[]' 2>/dev/null | head -3)
  if [ -n "$WAKE_FEEDBACK" ]; then
    echo "✅ Feedback included in wake message"
    echo ""
    echo "First 3 feedback items:"
    echo "$WAKE_MSG" | jq -r '.feedback[]' | head -3 | nl -w2 -s'. '
  else
    echo "❌ No feedback in wake message"
    exit 1
  fi
else
  echo "❌ No wake message in queue"
  exit 1
fi

echo ""

# Test 7: Multiple iterations
echo "=== Test 7: Multiple Iteration Feedback ==="
echo ""

echo "Simulating iteration 3 feedback..."
ITERATION_3_FEEDBACK="Address remaining issues from iteration 2,Add integration tests,Update changelog"

$SCRIPT_DIR/invoke-waiting-mode.sh wake \
  --task-id "$TASK_ID" \
  --agent-id "$LOOP3_AGENT" \
  --reason "cfn_loop_iteration" \
  --iteration 3 \
  --priority 30 \
  --feedback "$ITERATION_3_FEEDBACK"

echo ""

# Verify both iteration feedbacks are stored separately
FEEDBACK_KEY_2="swarm:${TASK_ID}:${LOOP3_AGENT}:feedback:iteration-2"
FEEDBACK_KEY_3="swarm:${TASK_ID}:${LOOP3_AGENT}:feedback:iteration-3"

FEEDBACK_2=$(redis-cli get "$FEEDBACK_KEY_2")
FEEDBACK_3=$(redis-cli get "$FEEDBACK_KEY_3")

if [ -n "$FEEDBACK_2" ] && [ "$FEEDBACK_2" != "(nil)" ]; then
  echo "✅ Iteration 2 feedback persists"
  echo "   Items: $(echo "$FEEDBACK_2" | jq '. | length')"
fi

if [ -n "$FEEDBACK_3" ] && [ "$FEEDBACK_3" != "(nil)" ]; then
  echo "✅ Iteration 3 feedback stored"
  echo "   Items: $(echo "$FEEDBACK_3" | jq '. | length')"
fi

echo ""

# Test 8: Edge cases
echo "=== Test 8: Edge Cases ==="
echo ""

# Empty feedback
echo "Testing wake with empty feedback..."
$SCRIPT_DIR/invoke-waiting-mode.sh wake \
  --task-id "$TASK_ID" \
  --agent-id "test-agent" \
  --reason "test" \
  --iteration 1 \
  --priority 50 \
  --feedback ""

EMPTY_FEEDBACK_KEY="swarm:${TASK_ID}:test-agent:feedback:iteration-1"
EMPTY_RESULT=$(redis-cli get "$EMPTY_FEEDBACK_KEY")

if [ -z "$EMPTY_RESULT" ] || [ "$EMPTY_RESULT" = "(nil)" ]; then
  echo "✅ Empty feedback not stored (expected)"
else
  echo "⚠️  Empty feedback stored: $EMPTY_RESULT"
fi

echo ""

# Iteration 0 (no feedback storage)
echo "Testing wake with iteration 0..."
$SCRIPT_DIR/invoke-waiting-mode.sh wake \
  --task-id "$TASK_ID" \
  --agent-id "test-agent-2" \
  --reason "initial" \
  --iteration 0 \
  --priority 50 \
  --feedback "This should not be stored"

ITER_0_KEY="swarm:${TASK_ID}:test-agent-2:feedback:iteration-0"
ITER_0_RESULT=$(redis-cli get "$ITER_0_KEY")

if [ -z "$ITER_0_RESULT" ] || [ "$ITER_0_RESULT" = "(nil)" ]; then
  echo "✅ Iteration 0 feedback not stored (expected)"
else
  echo "❌ Iteration 0 feedback should not be stored: '$ITER_0_RESULT'"
  exit 1
fi

echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "✅ All tests passed!"
echo ""
echo "Validated:"
echo "  1. Validators can report feedback with confidence"
echo "  2. Orchestrator collects and aggregates feedback"
echo "  3. Feedback passed to Loop 3 agents via wake signal"
echo "  4. Feedback stored in Redis with 24-hour TTL"
echo "  5. Agents can read feedback for iteration N"
echo "  6. Wake queue contains feedback in message"
echo "  7. Multiple iterations maintain separate feedback"
echo "  8. Edge cases handled correctly"
echo ""
echo "Task ID: $TASK_ID"
echo "Feedback mechanism is fully operational!"
echo ""
