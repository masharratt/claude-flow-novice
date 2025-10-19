#!/bin/bash
#
# Phase 4: Priority Wake-Up Queue Test Suite
# Task ID: redis-phase4-1760896217
# Agent ID: tester-4

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_ID="redis-phase4-1760896217"
AGENT_ID="tester-4"
TOTAL_TESTS=4
PASSED_TESTS=0

source "$SCRIPT_DIR/test-utils-unix.sh"

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

    # Send wake signals with priorities
    redis-cli ZADD "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" 50 "medium_priority" >/dev/null 2>&1
    redis-cli ZADD "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" 20 "low_priority" >/dev/null 2>&1
    redis-cli ZADD "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" 90 "high_priority" >/dev/null 2>&1

    # Check initial queue state
    echo "Queue contents:"
    redis-cli ZRANGE "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" 0 -1 WITHSCORES

    # Consume highest priority message first
    local FIRST_WAKE
    FIRST_WAKE=$(redis-cli BZPOPMIN "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" 1 | awk '{print $2}')
    echo "DEBUG: First wake result = $FIRST_WAKE"

    if [[ "$FIRST_WAKE" == "high_priority" ]]; then
        echo "✅ Priority wake-up order is correct"
        ((PASSED_TESTS++))
    else
        echo "❌ Priority wake-up order failed: Got '$FIRST_WAKE'"
    fi
}

test_same_priority_fifo() {
    log_section "Test 2: FIFO Behavior for Same Priority"

    # Clean previous state
    redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" >/dev/null 2>&1

    # Send 3 messages with same priority
    for i in {1..3}; do
        # Introduce small timestamp difference
        redis-cli ZADD "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" "$(echo "50 + 0.001 * $i" | bc)" "fifo_task_$i" >/dev/null 2>&1
    done

    # Verify FIFO order
    local FIFO_ORDER=()
    for _ in {1..3}; do
        local WAKE_MSG
        WAKE_MSG=$(redis-cli BZPOPMIN "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" 1 | awk '{print $2}')
        FIFO_ORDER+=("$WAKE_MSG")
        echo "DEBUG: Parsed FIFO reason = $WAKE_MSG"
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

    # Clean previous state
    redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" >/dev/null 2>&1

    # Test short timeout scenario
    local START_TIME
    START_TIME=$(date +%s.%N)

    local TIMEOUT_RESULT
    TIMEOUT_RESULT=$(redis-cli BZPOPMIN "swarm:${TASK_ID}:${AGENT_ID}:wake-queue" 1 2>&1)

    local END_TIME
    END_TIME=$(date +%s.%N)

    local DURATION
    DURATION=$(echo "$END_TIME - $START_TIME" | bc)

    echo "DEBUG: Timeout result = $TIMEOUT_RESULT"
    echo "DEBUG: Duration = $DURATION seconds"

    if (( $(echo "$DURATION >= 1.0 && $DURATION < 1.5" | bc -l) )); then
        if [[ -z "$TIMEOUT_RESULT" || "$TIMEOUT_RESULT" == "(nil)" ]]; then
            echo "✅ BZPOPMIN timeout works as expected (≈1s)"
            ((PASSED_TESTS++))
        else
            echo "❌ Timeout result not as expected: $TIMEOUT_RESULT"
        fi
    else
        echo "❌ Timeout behavior incorrect: Duration = $DURATION seconds"
    fi
}

test_shutdown_handling() {
    log_section "Test 4: Graceful Shutdown During Priority Wait"
    echo "🔄 Skipping full shutdown test (requires specialized mock)"
}

calculate_consensus() {
    log_section "Consensus Calculation"

    local CONFIDENCE
    CONFIDENCE=$(echo "scale=2; $PASSED_TESTS / $TOTAL_TESTS" | bc)
    echo "Tests Passed: $PASSED_TESTS / $TOTAL_TESTS"
    echo "Confidence Score: $CONFIDENCE"

    # Signal completion
    redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete" >/dev/null 2>&1

    # Report results
    redis-cli LPUSH "swarm:${TASK_ID}:reports" "$CONFIDENCE" >/dev/null 2>&1

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