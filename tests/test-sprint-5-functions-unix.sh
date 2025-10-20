#!/bin/bash
# tests/test-sprint-5-functions.sh

echo "=== Sprint 5 Function Tests ==="

# Test 1: Epic Context Redis Storage
echo "Test 1: Epic Context Storage"
TASK_ID="test-epic-$(date +%s)"
EPIC_DATA='{"epicName":"Test","inScope":["a","b"]}'

redis-cli setex "swarm:${TASK_ID}:epic-context" 600 "$EPIC_DATA"
RESULT=$(redis-cli get "swarm:${TASK_ID}:epic-context")

if [[ "$RESULT" == *"Test"* ]]; then
  echo "  ✓ Epic context storage works"
else
  echo "  ✗ Epic context storage failed"
fi

# Test 2: CFN Protocol Redis Keys
echo "Test 2: CFN Protocol Completion Signal"
redis-cli lpush "swarm:${TASK_ID}:test-agent:done" "complete"
DONE=$(redis-cli lpop "swarm:${TASK_ID}:test-agent:done")

if [ "$DONE" = "complete" ]; then
  echo "  ✓ Completion signal works"
else
  echo "  ✗ Completion signal failed"
fi

# Test 3: Heartbeat Structure
echo "Test 3: Heartbeat Redis Structure"
NOW=$(date +%s000)
redis-cli hset "swarm:${TASK_ID}:agent:test" heartbeat "$NOW" status "working"
HB=$(redis-cli hget "swarm:${TASK_ID}:agent:test" heartbeat)
ST=$(redis-cli hget "swarm:${TASK_ID}:agent:test" status)

if [ "$HB" = "$NOW" ] && [ "$ST" = "working" ]; then
  echo "  ✓ Heartbeat structure works"
else
  echo "  ✗ Heartbeat structure failed"
fi

# Cleanup
redis-cli del "swarm:${TASK_ID}:epic-context"
redis-cli del "swarm:${TASK_ID}:agent:test"

echo ""
echo "=== Tests Complete ==="