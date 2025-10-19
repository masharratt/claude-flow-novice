#!/usr/bin/env bash

##############################################################################
# Test Dead Letter Queue (DLQ) Functionality
# Validates DLQ write and query operations with simulated failures
##############################################################################

set -euo pipefail

TASK_ID="test-dlq-$(date +%s)"
TEST_AGENT="test-agent-1"

echo "=== DLQ Functionality Test ==="
echo "Task ID: $TASK_ID"
echo "Test Agent: $TEST_AGENT"
echo ""

##############################################################################
# Test 1: Simulate DLQ Write
##############################################################################
echo "[Test 1] Simulating DLQ write for failed agent..."

DLQ_KEY="swarm:${TASK_ID}:dlq:${TEST_AGENT}"
DLQ_ENTRY=$(jq -n \
  --arg reason "timeout_after_retries" \
  --arg retries "3" \
  --arg ts "$(date +%s)" \
  '{reason: $reason, retry_count: ($retries | tonumber), timestamp: ($ts | tonumber)}')

echo "$DLQ_ENTRY" | redis-cli -x LPUSH "$DLQ_KEY" >/dev/null
redis-cli EXPIRE "$DLQ_KEY" 604800 >/dev/null  # 7 days TTL

echo "  ✓ DLQ entry written"
echo ""

##############################################################################
# Test 2: Query Specific Agent DLQ
##############################################################################
echo "[Test 2] Querying DLQ for specific agent..."
./.claude/skills/redis-coordination/query-dlq.sh \
  --task-id "$TASK_ID" \
  --agent-id "$TEST_AGENT"
echo ""

##############################################################################
# Test 3: Add Multiple Failures
##############################################################################
echo "[Test 3] Adding multiple failure entries..."

TEST_AGENT_2="test-agent-2"
DLQ_KEY_2="swarm:${TASK_ID}:dlq:${TEST_AGENT_2}"

for i in {1..3}; do
  DLQ_ENTRY=$(jq -n \
    --arg reason "timeout_after_retries" \
    --arg retries "$i" \
    --arg ts "$(date +%s)" \
    '{reason: $reason, retry_count: ($retries | tonumber), timestamp: ($ts | tonumber)}')

  echo "$DLQ_ENTRY" | redis-cli -x LPUSH "$DLQ_KEY_2" >/dev/null
  sleep 1
done

redis-cli EXPIRE "$DLQ_KEY_2" 604800 >/dev/null

echo "  ✓ Added 3 failure entries for $TEST_AGENT_2"
echo ""

##############################################################################
# Test 4: Query All DLQ Entries for Task
##############################################################################
echo "[Test 4] Querying all DLQ entries for task..."
./.claude/skills/redis-coordination/query-dlq.sh --task-id "$TASK_ID"
echo ""

##############################################################################
# Test 5: Verify TTL
##############################################################################
echo "[Test 5] Verifying TTL..."
TTL=$(redis-cli TTL "$DLQ_KEY")
EXPECTED_TTL=604800  # 7 days

if [ "$TTL" -gt 0 ] && [ "$TTL" -le "$EXPECTED_TTL" ]; then
  echo "  ✓ TTL correctly set: ${TTL}s (~7 days)"
else
  echo "  ✗ TTL verification failed: ${TTL}s"
  exit 1
fi
echo ""

##############################################################################
# Test 6: Verify Entry Count
##############################################################################
echo "[Test 6] Verifying entry counts..."

COUNT_1=$(redis-cli LLEN "$DLQ_KEY")
COUNT_2=$(redis-cli LLEN "$DLQ_KEY_2")

echo "  Agent 1 entries: $COUNT_1 (expected: 1)"
echo "  Agent 2 entries: $COUNT_2 (expected: 3)"

if [ "$COUNT_1" = "1" ] && [ "$COUNT_2" = "3" ]; then
  echo "  ✓ Entry counts correct"
else
  echo "  ✗ Entry count mismatch"
  exit 1
fi
echo ""

##############################################################################
# Cleanup
##############################################################################
echo "[Cleanup] Removing test DLQ entries..."
redis-cli DEL "$DLQ_KEY" "$DLQ_KEY_2" >/dev/null
echo "  ✓ Cleanup complete"
echo ""

##############################################################################
# Summary
##############################################################################
echo "=== Test Summary ==="
echo "✅ All DLQ tests passed!"
echo ""
echo "Validated:"
echo "  - DLQ write functionality"
echo "  - Single agent query"
echo "  - Multi-agent query"
echo "  - TTL expiration (7 days)"
echo "  - Entry counting"
