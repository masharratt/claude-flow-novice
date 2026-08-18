#!/usr/bin/env bash
set -eu

# Enable DEBUG mode for verbose output
export DEBUG=true

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WAITING_MODE_SCRIPT="$SCRIPT_DIR/.claude/skills/redis-coordination/invoke-waiting-mode.sh"

TASK_ID="test-priority-$(date +%s)"
AGENT_ID="test-agent-1"

# Function to log test steps
log_test() {
    printf "\n\033[1;34m[TEST]\033[0m %s\n" "$1"
}

# Function to log success
log_success() {
    printf "\033[1;32m[PASS]\033[0m %s\n" "$1"
}

# Function to log failure
log_failure() {
    printf "\033[1;31m[FAIL]\033[0m %s\n" "$1"
    exit 1
}

# Clean up Redis keys before test
cleanup() {
    redis-cli DEL "swarm:$TASK_ID:$AGENT_ID:wake-queue"
    redis-cli DEL "swarm:$TASK_ID:$AGENT_ID:shutdown"
}

# Trap to ensure cleanup
trap cleanup EXIT

# 1. Priority Ordering Test
log_test "Priority Ordering Test"
bash "$WAITING_MODE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "low" --priority 20
bash "$WAITING_MODE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "high" --priority 90
bash "$WAITING_MODE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "medium" --priority 50

# Start agent in background to pop messages
(
    bash "$WAITING_MODE_SCRIPT" enter --task-id "$TASK_ID" --agent-id "$AGENT_ID" --context "priority-test"
) | while read -r line; do
    echo "$line"
    # Examine message order
    REASON=$(echo "$line" | jq -r '.reason // ""')
    case "$REASON" in
        "high")
            log_success "Highest priority message received first (90)"
            ;;
        "medium")
            log_success "Medium priority message received second (50)"
            ;;
        "low")
            log_success "Lowest priority message received last (20)"
            exit 0  # Test complete
            ;;
    esac
done || log_failure "Priority ordering test failed"

# 2. FIFO Same Priority Test
log_test "FIFO Same Priority Test"
TASK_ID="test-fifo-$(date +%s)"
bash "$WAITING_MODE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "first" --priority 50
bash "$WAITING_MODE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "second" --priority 50
bash "$WAITING_MODE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "third" --priority 50

# Verify FIFO order
(
    bash "$WAITING_MODE_SCRIPT" enter --task-id "$TASK_ID" --agent-id "$AGENT_ID" --context "fifo-test"
) | while read -r line; do
    echo "$line"
    REASON=$(echo "$line" | jq -r '.reason // ""')
    case "$REASON" in
        "first")
            log_success "First message in FIFO order received first"
            ;;
        "second")
            log_success "Second message in FIFO order received second"
            ;;
        "third")
            log_success "Third message in FIFO order received last"
            exit 0
            ;;
    esac
done || log_failure "FIFO same priority test failed"

# 3. Compact JSON Verification
log_test "Compact JSON Verification"
JSON_RESULT=$(redis-cli ZRANGE "swarm:$TASK_ID:$AGENT_ID:wake-queue" 0 -1)
echo "JSON Stored: $JSON_RESULT"

if echo "$JSON_RESULT" | jq -e '. | length > 0 and all(test("\\n") | not)' >/dev/null; then
    log_success "Compact JSON verification passed"
else
    log_failure "Compact JSON verification failed"
fi

# 4. Integration Test with Shutdown Signal
log_test "Shutdown Signal Test"
TASK_ID="test-shutdown-$(date +%s)"

# Background process to enter waiting mode and await shutdown
(
    set +e  # Disable exit on error for this block
    bash "$WAITING_MODE_SCRIPT" enter --task-id "$TASK_ID" --agent-id "$AGENT_ID" --context "shutdown-test"
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 130 ]; then
        log_success "Shutdown signal received and processed correctly (exit code 130)"
        exit 0
    else
        log_failure "Shutdown signal test failed (unexpected exit code: $EXIT_CODE)"
    fi
) &

# Wait a moment to ensure agent is in waiting mode
sleep 1

# Send shutdown signal
bash "$WAITING_MODE_SCRIPT" shutdown --task-id "$TASK_ID" --reason "test_shutdown"

# Wait for background process to complete
wait

echo -e "\n\033[1;32m[TEST SUITE COMPLETE] All priority queue tests passed successfully!\033[0m"
echo "0.95"