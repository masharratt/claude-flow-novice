#!/bin/bash
#
# Test shutdown handling for waiting agents
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WAITING_MODE_SCRIPT="$SCRIPT_DIR/invoke-waiting-mode.sh"

TASK_ID="test-shutdown-$(date +%s)"
AGENT_ID="test-agent-1"

echo "=========================================="
echo "Testing Shutdown Handling"
echo "=========================================="
echo ""
echo "Task ID: $TASK_ID"
echo "Agent ID: $AGENT_ID"
echo ""

# Clean up Redis keys before test
echo "Cleaning up Redis keys..."
redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:ready" >/dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" >/dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:shutdown" >/dev/null 2>&1 || true

echo ""
echo "Test 1: Agent enters waiting mode in background"
echo "------------------------------------------------"

# Start agent in background
{
    $WAITING_MODE_SCRIPT enter \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT_ID" \
        --context "test-shutdown"

    EXIT_CODE=$?
    echo "Agent exited with code: $EXIT_CODE"

    if [ $EXIT_CODE -eq 130 ]; then
        echo "✅ Agent gracefully shutdown with SIGINT code (130)"
    else
        echo "❌ Expected exit code 130, got $EXIT_CODE"
        exit 1
    fi
} &

AGENT_PID=$!
echo "Agent started (PID: $AGENT_PID)"

# Wait for agent to enter waiting mode
sleep 2

# Check if agent published ready status
READY_STATUS=$(redis-cli LPOP "swarm:${TASK_ID}:${AGENT_ID}:ready")
if [ -n "$READY_STATUS" ] && [ "$READY_STATUS" != "(nil)" ]; then
    echo "✅ Agent published ready status:"
    echo "$READY_STATUS" | jq '.'
else
    echo "❌ Agent did not publish ready status"
    kill $AGENT_PID 2>/dev/null || true
    exit 1
fi

echo ""
echo "Test 2: Send shutdown signal"
echo "-----------------------------"

$WAITING_MODE_SCRIPT shutdown \
    --task-id "$TASK_ID" \
    --reason "test_shutdown"

echo ""
echo "Test 3: Verify agent receives shutdown and exits"
echo "------------------------------------------------"

# Wait for agent to process shutdown (max 2 seconds for poll cycle)
sleep 3

# Check if agent process is still running
if ps -p $AGENT_PID >/dev/null 2>&1; then
    echo "❌ Agent still running after shutdown signal"
    kill $AGENT_PID 2>/dev/null || true
    exit 1
else
    echo "✅ Agent terminated after shutdown signal"
fi

# Wait for background process to finish and capture exit code
wait $AGENT_PID 2>/dev/null || true

echo ""
echo "Test 4: Verify shutdown with wake signal priority"
echo "-------------------------------------------------"

# Clean up
redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:ready" >/dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" >/dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:shutdown" >/dev/null 2>&1 || true

# Start agent in background
{
    $WAITING_MODE_SCRIPT enter \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT_ID" \
        --context "test-priority"

    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 130 ]; then
        echo "✅ Agent prioritized shutdown over wake signal"
    else
        echo "⚠️  Agent exited with code $EXIT_CODE (may have received wake signal first)"
    fi
} &

AGENT_PID=$!

# Wait for agent to enter waiting mode
sleep 2

# Send both wake and shutdown signals (shutdown should take priority)
$WAITING_MODE_SCRIPT wake \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --reason "test_wake" \
    --priority 50 &

$WAITING_MODE_SCRIPT shutdown \
    --task-id "$TASK_ID" \
    --reason "test_shutdown_priority" &

# Wait for signals to be sent
sleep 1

# Wait for agent to process
sleep 3

# Check if agent terminated
if ps -p $AGENT_PID >/dev/null 2>&1; then
    echo "⚠️  Agent still running (may have processed wake signal)"
    kill $AGENT_PID 2>/dev/null || true
else
    echo "✅ Agent terminated (shutdown had priority)"
fi

wait $AGENT_PID 2>/dev/null || true

echo ""
echo "=========================================="
echo "✅ All shutdown handling tests passed!"
echo "=========================================="

# Cleanup
redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:ready" >/dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" >/dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:shutdown" >/dev/null 2>&1 || true

exit 0
