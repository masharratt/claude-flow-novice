#!/bin/bash
# BUG #32 Fix Validation Test
# Tests that coordinator correctly invokes orchestrator

set -e

TASK_ID="bug-32-fix-test-$(date +%s)"
TIMEOUT=180  # 3 minutes

echo "=== BUG #32 Fix Validation Test ==="
echo "Task ID: $TASK_ID"
echo ""

# Cleanup function
cleanup() {
  echo "Cleaning up test data..."
  redis-cli keys "swarm:${TASK_ID}:*" | xargs -r redis-cli del
  redis-cli keys "cfn_loop:task:${TASK_ID}:*" | xargs -r redis-cli del
}
trap cleanup EXIT

echo "Step 1: Clear Redis state"
cleanup

echo ""
echo "Step 2: Spawn coordinator (should invoke orchestrator)"
npx claude-flow-novice agent cfn-v3-coordinator \
  --context "Implement simple test function that returns 'hello world'" \
  --task-id "$TASK_ID"

echo ""
echo "Step 3: Wait for orchestration to complete (max ${TIMEOUT}s)"
sleep 10  # Give orchestrator time to start

echo ""
echo "Step 4: Check Redis keys (should see orchestrator activity)"
REDIS_KEYS=$(redis-cli keys "swarm:${TASK_ID}:*")
KEY_COUNT=$(echo "$REDIS_KEYS" | wc -l)

echo "Found $KEY_COUNT Redis keys:"
echo "$REDIS_KEYS"

echo ""
echo "Step 5: Validate orchestrator ran"

# Check for gate-passed signal (proof orchestrator ran)
GATE_PASSED=$(redis-cli get "swarm:${TASK_ID}:gate-passed" 2>/dev/null || echo "")

if [ -n "$GATE_PASSED" ]; then
  echo "✅ Gate-check executed: $GATE_PASSED"
else
  echo "❌ Gate-check NOT executed (orchestrator didn't run)"
  echo ""
  echo "BUG #32 still present - coordinator didn't invoke orchestrator"
  exit 1
fi

# Check for Loop 2 validators
LOOP2_KEYS=$(redis-cli keys "swarm:${TASK_ID}:reviewer-*" "swarm:${TASK_ID}:tester-*" 2>/dev/null || echo "")

if [ -n "$LOOP2_KEYS" ]; then
  echo "✅ Loop 2 validators spawned:"
  echo "$LOOP2_KEYS"
else
  echo "⚠️  Loop 2 validators not found (may still be running)"
fi

# Check for Product Owner decision
DECISION=$(redis-cli get "swarm:${TASK_ID}:product-owner-decision" 2>/dev/null || echo "")

if [ -n "$DECISION" ]; then
  echo "✅ Product Owner decision: $DECISION"
else
  echo "⚠️  Product Owner decision not found (may still be running)"
fi

echo ""
echo "Step 6: Calculate confidence score"

TOTAL_SCORE=0
MAX_SCORE=3

# Gate-check exists
if [ -n "$GATE_PASSED" ]; then
  TOTAL_SCORE=$((TOTAL_SCORE + 1))
fi

# Loop 2 exists
if [ -n "$LOOP2_KEYS" ]; then
  TOTAL_SCORE=$((TOTAL_SCORE + 1))
fi

# Product Owner decision exists
if [ -n "$DECISION" ]; then
  TOTAL_SCORE=$((TOTAL_SCORE + 1))
fi

CONFIDENCE=$(echo "scale=2; $TOTAL_SCORE / $MAX_SCORE" | bc)

echo ""
echo "=== Test Results ==="
echo "Confidence Score: $CONFIDENCE"
echo "Components Validated: $TOTAL_SCORE / $MAX_SCORE"
echo ""

if (( $(echo "$CONFIDENCE >= 0.85" | bc -l) )); then
  echo "✅ BUG #32 FIX VALIDATED (confidence ≥ 0.85)"
  echo "   Orchestrator is correctly invoked by coordinator"
  exit 0
else
  echo "❌ BUG #32 FIX INCOMPLETE (confidence < 0.85)"
  echo "   Orchestrator may not be running correctly"
  exit 1
fi
