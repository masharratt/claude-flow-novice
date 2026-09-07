#!/bin/bash
# Sprint 5 Function Tests - Redis Operations Validation

echo "=== Sprint 5 Function Tests ==="
echo ""

PASS_COUNT=0
FAIL_COUNT=0

# Test 1: Epic Context Redis Storage
echo "Test 1: Epic Context Storage"
TASK_ID="test-epic-$(date +%s)"
EPIC_DATA='{"epicName":"Test Epic","epicGoal":"Test goal","inScope":["feature1","feature2"]}'

redis-cli setex "swarm:${TASK_ID}:epic-context" 600 "$EPIC_DATA" >/dev/null 2>&1
RESULT=$(redis-cli get "swarm:${TASK_ID}:epic-context" 2>/dev/null)

if [[ "$RESULT" == *"Test Epic"* ]]; then
  echo "  ✓ Epic context storage works"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  ✗ Epic context storage failed"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Test 2: CFN Protocol Completion Signal
echo "Test 2: CFN Protocol Completion Signal"
AGENT_ID="test-agent-1"

redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete" >/dev/null 2>&1
DONE=$(redis-cli lpop "swarm:${TASK_ID}:${AGENT_ID}:done" 2>/dev/null)

if [ "$DONE" = "complete" ]; then
  echo "  ✓ Completion signal works"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  ✗ Completion signal failed"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Test 3: Heartbeat Redis Structure
echo "Test 3: Heartbeat Redis Structure"
NOW=$(date +%s000)

redis-cli hset "swarm:${TASK_ID}:agent:${AGENT_ID}" heartbeat "$NOW" status "working" >/dev/null 2>&1
HB=$(redis-cli hget "swarm:${TASK_ID}:agent:${AGENT_ID}" heartbeat 2>/dev/null)
ST=$(redis-cli hget "swarm:${TASK_ID}:agent:${AGENT_ID}" status 2>/dev/null)

if [ "$HB" = "$NOW" ] && [ "$ST" = "working" ]; then
  echo "  ✓ Heartbeat structure works"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  ✗ Heartbeat structure failed"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Cleanup
redis-cli del "swarm:${TASK_ID}:epic-context" >/dev/null 2>&1
redis-cli del "swarm:${TASK_ID}:agent:${AGENT_ID}" >/dev/null 2>&1

echo ""
echo "=== Test Results ==="
echo "Passed: $PASS_COUNT/3"
echo "Failed: $FAIL_COUNT/3"

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "✅ All Sprint 5 Redis operations verified!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi
