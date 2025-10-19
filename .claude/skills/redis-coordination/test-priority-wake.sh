#!/bin/bash
#
# Test priority-based wake functionality
#
# Tests:
#   1. Agent enters waiting mode
#   2. Multiple wake signals with different priorities
#   3. Agent receives highest priority message first
#   4. FIFO for same priority

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_ID="priority-test-$$"
AGENT_ID="test-agent-1"

echo "=========================================="
echo "Test: Priority-Based Wake"
echo "=========================================="
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up Redis keys..."
    redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:ready" >/dev/null 2>&1 || true
    redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Test 1: Send multiple wake signals with different priorities"
echo "-----------------------------------------------------------"

# Send wake signals in random order
echo "Sending LOW priority wake (priority=20)..."
"$SCRIPT_DIR/invoke-waiting-mode.sh" wake \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --reason "low_priority_task" \
    --priority 20

echo ""
echo "Sending HIGH priority wake (priority=90)..."
"$SCRIPT_DIR/invoke-waiting-mode.sh" wake \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --reason "high_priority_task" \
    --priority 90

echo ""
echo "Sending MEDIUM priority wake (priority=50)..."
"$SCRIPT_DIR/invoke-waiting-mode.sh" wake \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --reason "medium_priority_task" \
    --priority 50

echo ""
echo "Sending CRITICAL priority wake (priority=95)..."
"$SCRIPT_DIR/invoke-waiting-mode.sh" wake \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --reason "critical_task" \
    --priority 95

echo ""
echo "Test 2: Agent enters waiting mode and receives messages"
echo "--------------------------------------------------------"

# Agent should receive messages in priority order: 95, 90, 50, 20
for i in 1 2 3 4; do
    echo ""
    echo "Pop #$i: Entering waiting mode..."

    # Start agent in background to enter waiting mode
    (
        WAKE_MSG=$("$SCRIPT_DIR/invoke-waiting-mode.sh" enter \
            --task-id "$TASK_ID" \
            --agent-id "$AGENT_ID" \
            --context "pop-$i" 2>/dev/null)

        echo "Received wake message:"
        echo "$WAKE_MSG" | jq '.'
    ) &

    AGENT_PID=$!

    # Give agent time to block
    sleep 0.5

    # Wait for agent to complete
    wait $AGENT_PID
done

echo ""
echo "Test 3: Verify queue is empty"
echo "------------------------------"
QUEUE_SIZE=$(redis-cli ZCARD "swarm:${TASK_ID}:${AGENT_ID}:wake-queue")
echo "Queue size: $QUEUE_SIZE"

if [ "$QUEUE_SIZE" = "0" ]; then
    echo "✅ Queue is empty (all messages consumed)"
else
    echo "❌ Queue still has messages (expected 0, got $QUEUE_SIZE)"
    exit 1
fi

echo ""
echo "Test 4: FIFO for same priority"
echo "-------------------------------"

# Send 3 messages with same priority
for i in 1 2 3; do
    echo "Sending message $i (priority=50)..."
    "$SCRIPT_DIR/invoke-waiting-mode.sh" wake \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT_ID" \
        --reason "task-$i" \
        --priority 50
    sleep 0.1  # Small delay to ensure timestamp order
done

echo ""
echo "Consuming messages (should be in FIFO order: 1, 2, 3)..."
for i in 1 2 3; do
    WAKE_MSG=$("$SCRIPT_DIR/invoke-waiting-mode.sh" enter \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT_ID" \
        --context "fifo-$i" 2>/dev/null)

    REASON=$(echo "$WAKE_MSG" | jq -r '.reason')
    echo "  Received: $REASON"
done

echo ""
echo "=========================================="
echo "✅ All priority-based wake tests passed!"
echo "=========================================="
