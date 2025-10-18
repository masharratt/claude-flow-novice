#!/bin/bash
# Timeout Handling: Comprehensive timeout patterns for Redis coordination
# Demonstrates proper timeout handling, error reporting, and recovery strategies

set -e

TASK_ID="demo:timeout"
SHORT_TIMEOUT=5    # 5 seconds (for demo of timeout failure)
NORMAL_TIMEOUT=300 # 5 minutes (production default)

echo "=== Timeout Handling Demo ==="
echo ""

# Cleanup previous demo data
echo "Cleaning up previous demo data..."
redis-cli del "${TASK_ID}:slow-agent:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:fast-agent:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:coordinator:error" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:coordinator:status" > /dev/null 2>&1 || true

echo "--- Scenario 1: Timeout Failure (Agent Too Slow) ---"
echo ""

# Simulate slow agent that exceeds timeout (runs in background)
(
  echo "[Slow Agent] Starting work..."
  sleep 10  # Takes 10s but timeout is 5s

  RESULT='{"agent":"slow-agent","confidence":0.85,"status":"complete"}'
  redis-cli lpush "${TASK_ID}:slow-agent:done" "$RESULT" > /dev/null
  echo "[Slow Agent] Work complete (but too late...)"
) &

SLOW_AGENT_PID=$!

# Coordinator waits with short timeout
echo "[Coordinator] Waiting for slow-agent with ${SHORT_TIMEOUT}s timeout..."
RESULT=$(timeout $SHORT_TIMEOUT redis-cli --csv blpop "${TASK_ID}:slow-agent:done" 0 2>/dev/null || echo "")
EXIT_CODE=$?

if [ $EXIT_CODE -eq 124 ]; then
  echo "[Coordinator] ❌ ERROR: Slow agent timeout after ${SHORT_TIMEOUT}s"

  # Report error to coordinator error channel
  ERROR_REPORT='{
    "agent": "slow-agent",
    "error": "timeout",
    "timeout": '${SHORT_TIMEOUT}',
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
  }'

  redis-cli lpush "${TASK_ID}:coordinator:error" "$ERROR_REPORT" > /dev/null
  echo "[Coordinator] Error reported to ${TASK_ID}:coordinator:error"

  # Kill slow agent background process
  kill $SLOW_AGENT_PID 2>/dev/null || true

  echo "[Coordinator] Decision: Terminate slow agent and retry with different agent"
else
  echo "[Coordinator] ✓ Slow agent completed within timeout"
fi

echo ""
echo "--- Scenario 2: Timeout Success (Agent Fast Enough) ---"
echo ""

# Simulate fast agent that completes within timeout (runs in background)
(
  echo "[Fast Agent] Starting work..."
  sleep 2  # Takes 2s, well within 5s timeout

  RESULT='{"agent":"fast-agent","confidence":0.90,"status":"complete"}'
  redis-cli lpush "${TASK_ID}:fast-agent:done" "$RESULT" > /dev/null
  echo "[Fast Agent] Work complete"
) &

# Coordinator waits with short timeout
echo "[Coordinator] Waiting for fast-agent with ${SHORT_TIMEOUT}s timeout..."
RESULT=$(timeout $SHORT_TIMEOUT redis-cli --csv blpop "${TASK_ID}:fast-agent:done" 0 2>/dev/null || echo "")
EXIT_CODE=$?

if [ $EXIT_CODE -eq 124 ]; then
  echo "[Coordinator] ❌ ERROR: Fast agent timeout after ${SHORT_TIMEOUT}s"
else
  echo "[Coordinator] ✓ Fast agent completed within timeout"
  echo "[Coordinator] Result: ${RESULT:0:80}..."
fi

wait

echo ""
echo "--- Scenario 3: Multi-Agent Timeout with Recovery ---"
echo ""

# Cleanup
redis-cli del "${TASK_ID}:agent-1:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:agent-2:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:agent-3:done" > /dev/null 2>&1 || true

# Simulate 3 agents with varying completion times
(
  sleep 1
  redis-cli lpush "${TASK_ID}:agent-1:done" '{"agent":"agent-1","confidence":0.85}' > /dev/null
  echo "[Agent 1] Complete (1s)"
) &

(
  sleep 2
  redis-cli lpush "${TASK_ID}:agent-2:done" '{"agent":"agent-2","confidence":0.90}' > /dev/null
  echo "[Agent 2] Complete (2s)"
) &

(
  sleep 15  # Too slow - exceeds 5s timeout
  redis-cli lpush "${TASK_ID}:agent-3:done" '{"agent":"agent-3","confidence":0.88}' > /dev/null
  echo "[Agent 3] Complete (15s - too late)"
) &

AGENT_3_PID=$!

echo "[Coordinator] Waiting for 3 agents with ${SHORT_TIMEOUT}s timeout each..."

# Wait for agent 1
RESULT_1=$(timeout $SHORT_TIMEOUT redis-cli --csv blpop "${TASK_ID}:agent-1:done" 0 2>/dev/null || echo "")
if [ -z "$RESULT_1" ]; then
  echo "[Coordinator] ❌ Agent 1 timeout"
  AGENT_1_FAILED=1
else
  echo "[Coordinator] ✓ Agent 1 complete"
  AGENT_1_FAILED=0
fi

# Wait for agent 2
RESULT_2=$(timeout $SHORT_TIMEOUT redis-cli --csv blpop "${TASK_ID}:agent-2:done" 0 2>/dev/null || echo "")
if [ -z "$RESULT_2" ]; then
  echo "[Coordinator] ❌ Agent 2 timeout"
  AGENT_2_FAILED=1
else
  echo "[Coordinator] ✓ Agent 2 complete"
  AGENT_2_FAILED=0
fi

# Wait for agent 3
RESULT_3=$(timeout $SHORT_TIMEOUT redis-cli --csv blpop "${TASK_ID}:agent-3:done" 0 2>/dev/null || echo "")
if [ -z "$RESULT_3" ]; then
  echo "[Coordinator] ❌ Agent 3 timeout"
  AGENT_3_FAILED=1

  # Kill agent 3 background process
  kill $AGENT_3_PID 2>/dev/null || true
else
  echo "[Coordinator] ✓ Agent 3 complete"
  AGENT_3_FAILED=0
fi

# Calculate success rate
FAILED_COUNT=$((AGENT_1_FAILED + AGENT_2_FAILED + AGENT_3_FAILED))
SUCCESS_COUNT=$((3 - FAILED_COUNT))

echo ""
echo "[Coordinator] Results: $SUCCESS_COUNT/3 agents completed within timeout"

if [ $SUCCESS_COUNT -ge 2 ]; then
  echo "[Coordinator] Decision: PROCEED with partial results (2/3 quorum met)"

  STATUS='{"status":"partial_success","completed":'$SUCCESS_COUNT',"failed":'$FAILED_COUNT',"decision":"proceed"}'
  redis-cli set "${TASK_ID}:coordinator:status" "$STATUS" > /dev/null
else
  echo "[Coordinator] Decision: RETRY all agents (quorum not met)"

  STATUS='{"status":"insufficient_quorum","completed":'$SUCCESS_COUNT',"failed":'$FAILED_COUNT',"decision":"retry"}'
  redis-cli set "${TASK_ID}:coordinator:status" "$STATUS" > /dev/null
fi

wait

echo ""
echo "--- Scenario 4: Timeout Best Practices ---"
echo ""

echo "✓ Timeout Guidelines:"
echo "  - Normal operations: 300s (5 minutes)"
echo "  - Research tasks: 600s (10 minutes)"
echo "  - Complex builds: 900s (15 minutes)"
echo "  - Testing: 600s (10 minutes)"
echo ""

echo "✓ Timeout Handling Pattern:"
echo '  result=$(timeout 300 redis-cli --csv blpop "channel" 0 2>/dev/null || echo "")'
echo '  if [ $? -eq 124 ]; then'
echo '    echo "TIMEOUT"'
echo '    redis-cli lpush "coordinator:error" '"'"'{"error":"timeout"}'"'"
echo '  fi'
echo ""

echo "✓ Error Reporting:"
echo "  - Always report timeout to coordinator:error channel"
echo "  - Include agent ID, timeout duration, timestamp"
echo "  - Coordinator decides: retry, skip, or escalate"
echo ""

echo "✓ Recovery Strategies:"
echo "  - Single agent timeout: Retry once with extended timeout"
echo "  - Multiple agent timeout: Check quorum (2/3 pass = proceed)"
echo "  - Critical agent timeout: Escalate to main chat"
echo "  - Repeated timeouts: Switch to different agent type"
echo ""

echo "=== Timeout Handling Demo Complete ==="
echo ""
echo "Key Takeaways:"
echo "  1. ALWAYS use timeout command with BLPOP"
echo "  2. Check exit code 124 for timeout detection"
echo "  3. Report timeouts to coordinator:error channel"
echo "  4. Implement recovery strategies (retry/skip/escalate)"
echo "  5. Use appropriate timeout values for task type"
echo "  6. Kill/cleanup timed-out background processes"
echo ""

# Cleanup
redis-cli del "${TASK_ID}:slow-agent:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:fast-agent:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:agent-1:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:agent-2:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:agent-3:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:coordinator:error" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:coordinator:status" > /dev/null 2>&1 || true
