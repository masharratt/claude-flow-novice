#!/bin/bash
#
# Phase 4: Priority Wake-Up Queue Test Suite
# Task ID: redis-phase4-1760896217
# Agent ID: tester-4

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_ID="redis-phase4-1760896217"
AGENT_ID="tester-4"
TOTAL_TESTS=5
PASSED_TESTS=0

# Source test utilities
# shellcheck source=./test-utils.sh
source "$SCRIPT_DIR/test-utils.sh"

log_section() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
}

test_priority_order() {
    log_section "Test 1: Priority Wake-Up Order"

    # Clean previous state
    redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" >/dev/null 2>&1

    # Send wake signals in non-sequential order
    "$SCRIPT_DIR/invoke-waiting-mode.sh" wake \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT_ID" \
        --reason "medium_priority" \
        --priority 50

    "$SCRIPT_DIR/invoke-waiting-mode.sh" wake \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT_ID" \
        --reason "low_priority" \
        --priority 20

    "$SCRIPT_DIR/invoke-waiting-mode.sh" wake \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT_ID" \
        --reason "high_priority" \
        --priority 90

    # Consume messages and verify order
    local FIRST_WAKE=$("$SCRIPT_DIR/invoke-waiting-mode.sh" enter \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT_ID" \
        --context "priority_order_test" 2>/dev/null)

    local FIRST_REASON=$(echo "$FIRST_WAKE" | jq -r '.reason')

    if [[ "$FIRST_REASON" == "high_priority" ]]; then
        echo "✅ Priority wake-up order is correct"
        ((PASSED_TESTS++))
    else
        echo "❌ Priority wake-up order failed: Expected 'high_priority', Got '$FIRST_REASON'"
    fi
}

test_same_priority_fifo() {
    log_section "Test 2: FIFO Behavior for Same Priority"

    # Clean previous state
    redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" >/dev/null 2>&1

    # Send 3 messages with same priority
    for i in {1..3}; do
        "$SCRIPT_DIR/invoke-waiting-mode.sh" wake \
            --task-id "$TASK_ID" \
            --agent-id "$AGENT_ID" \
            --reason "fifo_task_$i" \
            --priority 50
        sleep 0.1  # Ensure different timestamps
    done

    # Verify FIFO order
    local FIFO_ORDER=()
    for _ in {1..3}; do
        local WAKE_MSG=$("$SCRIPT_DIR/invoke-waiting-mode.sh" enter \
            --task-id "$TASK_ID" \
            --agent-id "$AGENT_ID" \
            --context "fifo_test" 2>/dev/null)

        local REASON=$(echo "$WAKE_MSG" | jq -r '.reason')
        FIFO_ORDER+=("$REASON")
    done

    if [[ "${FIFO_ORDER[0]}" == "fifo_task_1" &&
          "${FIFO_ORDER[1]}" == "fifo_task_2" &&
          "${FIFO_ORDER[2]}" == "fifo_task_3" ]]; then
        echo "✅ FIFO order maintained for same priority"
        ((PASSED_TESTS++))
    else
        echo "❌ FIFO order failed: ${FIFO_ORDER[*]}"
    fi
}

test_timeout_behavior() {
    log_section "Test 3: BZPOPMIN Timeout Handling"

    # Test short timeout scenario
    local START_TIME=$(date +%s.%N)
    local TIMEOUT_RESULT=$("$SCRIPT_DIR/invoke-waiting-mode.sh" enter \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT_ID" \
        --timeout 1 \
        --context "timeout_test" 2>/dev/null || true)

    local END_TIME=$(date +%s.%N)
    local DURATION=$(echo "$END_TIME - $START_TIME" | bc)

    if (( $(echo "$DURATION >= 1.0 && $DURATION < 1.5" | bc -l) )); then
        echo "✅ BZPOPMIN timeout works as expected (≈1s)"
        ((PASSED_TESTS++))
    else
        echo "❌ Timeout behavior incorrect: Duration = $DURATION seconds"
    fi
}

test_shutdown_handling() {
    log_section "Test 4: Graceful Shutdown During Priority Wait"
    # Simulate a graceful shutdown while waiting
    # This would require mocking or a specific implementation
    echo "🔄 Skipping full shutdown test (requires specialized mock)"
}

calculate_consensus() {
    log_section "Consensus Calculation"

    local CONFIDENCE=$(echo "scale=2; $PASSED_TESTS / $TOTAL_TESTS" | bc)
    echo "Tests Passed: $PASSED_TESTS / $TOTAL_TESTS"
    echo "Confidence Score: $CONFIDENCE"

    # Signal completion
    redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete" >/dev/null 2>&1

    # Report results
    "$SCRIPT_DIR/invoke-waiting-mode.sh" report \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT_ID" \
        --confidence "$CONFIDENCE" \
        --iteration 1

    exit 0
}

# Main test execution
main() {
    test_priority_order
    test_same_priority_fifo
    test_timeout_behavior
    test_shutdown_handling
    calculate_consensus
}

main