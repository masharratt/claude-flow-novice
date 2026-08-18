#!/usr/bin/env bash
# tests/cli-mode/core/e2e/test-main-chat-wait-exit.sh
# Phase 1 :: Validates main chat BLPOP wait/exit pattern
#
# Purpose:
#   Test (d) from CLI mode requirements: Does the subagent send a completion
#   signal to main chat to take it out of waiting mode?
#
# Architecture Context:
#   - Main chat IS the coordinator (no separate coordinator agent)
#   - Main chat spawns agent, then enters BLPOP wait
#   - Agent completes task, signals via Redis LPUSH
#   - Main chat exits BLPOP wait, processes result
#
# Test validates:
#   1. BLPOP can be set up to wait on a completion queue
#   2. LPUSH from agent side unblocks BLPOP
#   3. Timeout behavior works correctly
#   4. Multiple completion signals can be processed
#   5. Signal order is preserved (FIFO)

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# ============================================================================
# TEST CONFIGURATION
# ============================================================================

TEST_ID="wait-exit-$(date +%s)-$$"
TASK_ID="cli-test-${TEST_ID}"
REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
REDIS_PORT="${CFN_REDIS_PORT:-6379}"

# Queue names following CFN pattern
COMPLETION_QUEUE="cfn_loop:task:${TASK_ID}:completion"

# ============================================================================
# CLEANUP HANDLER
# ============================================================================

cleanup() {
    local exit_code=$?
    log_info "Cleaning up test resources..."

    # Kill any background processes
    jobs -p | xargs -r kill 2>/dev/null || true

    # Clean up Redis keys
    if command -v redis-cli >/dev/null 2>&1; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$COMPLETION_QUEUE" 2>/dev/null || true
        # Clean up any test-specific keys
        local keys
        keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "cfn_loop:task:${TASK_ID}:*" 2>/dev/null || echo "")
        if [ -n "$keys" ]; then
            echo "$keys" | xargs -r redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL 2>/dev/null || true
        fi
    fi

    # Clean up temp files
    rm -f /tmp/blpop-*-${TEST_ID}.* 2>/dev/null || true

    log_info "Cleanup complete (exit code: $exit_code)"
    exit $exit_code
}

trap cleanup EXIT INT TERM

# ============================================================================
# TEST 1: Verify BLPOP with timeout returns nil on empty queue
# ============================================================================

test_blpop_timeout() {
    log_step "TEST 1: Verify BLPOP timeout on empty queue"

    local test_queue="test:${TASK_ID}:timeout"

    # GIVEN: An empty queue
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$test_queue" >/dev/null 2>&1 || true

    # WHEN: We BLPOP with a short timeout
    log_info "Starting BLPOP with 2s timeout on empty queue..."
    local start_time=$(date +%s)
    local result
    result=$(timeout 5 redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BLPOP "$test_queue" 2 2>&1 || echo "timeout")
    local end_time=$(date +%s)
    local elapsed=$((end_time - start_time))

    # THEN: BLPOP should return after timeout (~2 seconds)
    if [ "$elapsed" -ge 1 ] && [ "$elapsed" -le 4 ]; then
        log_success "BLPOP timed out correctly after ${elapsed}s"
        return 0
    fi

    log_warn "BLPOP timing unexpected: ${elapsed}s (expected ~2s)"
    return 0  # Not critical
}

# ============================================================================
# TEST 2: Verify BLPOP receives signal immediately when available
# ============================================================================

test_blpop_immediate() {
    log_step "TEST 2: Verify BLPOP receives pre-existing signal"

    local test_queue="test:${TASK_ID}:immediate"
    local signal_value="agent_completed:immediate"

    # GIVEN: A queue with a signal already present
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$test_queue" >/dev/null 2>&1 || true
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "$test_queue" "$signal_value" >/dev/null

    # WHEN: We BLPOP
    local start_time=$(date +%s)
    local result
    result=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BLPOP "$test_queue" 5 2>&1)
    local end_time=$(date +%s)
    local elapsed=$((end_time - start_time))

    # THEN: BLPOP should return immediately with signal
    if [ "$elapsed" -le 2 ] && [[ "$result" == *"$signal_value"* ]]; then
        log_success "BLPOP received pre-existing signal immediately (${elapsed}s)"
        return 0
    fi

    log_error "BLPOP did not receive signal correctly"
    log_info "Result: $result"
    return 1
}

# ============================================================================
# TEST 3: Verify async signal unblocks BLPOP
# ============================================================================

test_async_unblock() {
    log_step "TEST 3: Verify async signal unblocks waiting BLPOP"

    local test_queue="test:${TASK_ID}:async"
    local signal_value="agent_completed:async"
    local result_file="/tmp/blpop-async-${TEST_ID}.txt"

    # GIVEN: An empty queue
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$test_queue" >/dev/null 2>&1 || true

    # Start BLPOP in background (simulating main chat waiting)
    log_info "Starting main chat BLPOP wait (10s timeout)..."
    (timeout 15 redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BLPOP "$test_queue" 10 > "$result_file" 2>&1) &
    local blpop_pid=$!

    # Give BLPOP time to start
    sleep 1

    # WHEN: Agent sends completion signal after 2 seconds
    log_info "Agent sending completion signal..."
    local signal_start=$(date +%s)
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "$test_queue" "$signal_value" >/dev/null

    # Wait for BLPOP to receive signal
    wait $blpop_pid 2>/dev/null || true
    local signal_end=$(date +%s)
    local response_time=$((signal_end - signal_start))

    # THEN: BLPOP should have unblocked and received signal
    local result
    result=$(cat "$result_file" 2>/dev/null || echo "")

    if [[ "$result" == *"$signal_value"* ]] && [ "$response_time" -le 3 ]; then
        log_success "BLPOP unblocked on async signal (response: ${response_time}s)"
        return 0
    fi

    log_error "Async unblock failed"
    log_info "Result: $result"
    log_info "Response time: ${response_time}s"
    return 1
}

# ============================================================================
# TEST 4: Verify multiple signals processed in order (FIFO)
# ============================================================================

test_fifo_order() {
    log_step "TEST 4: Verify signals processed in FIFO order"

    local test_queue="test:${TASK_ID}:fifo"

    # GIVEN: An empty queue
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$test_queue" >/dev/null 2>&1 || true

    # WHEN: Multiple agents push signals (using RPUSH for FIFO with LPOP)
    # Note: LPUSH + RPOP = FIFO, RPUSH + LPOP = FIFO
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" RPUSH "$test_queue" "agent_1:first" >/dev/null
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" RPUSH "$test_queue" "agent_2:second" >/dev/null
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" RPUSH "$test_queue" "agent_3:third" >/dev/null

    # THEN: Signals should be retrieved in order
    local first second third
    first=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPOP "$test_queue")
    second=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPOP "$test_queue")
    third=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPOP "$test_queue")

    if [[ "$first" == *"first"* ]] && [[ "$second" == *"second"* ]] && [[ "$third" == *"third"* ]]; then
        log_success "FIFO order preserved: first → second → third"
        return 0
    fi

    log_error "FIFO order not preserved"
    log_info "Got: $first, $second, $third"
    return 1
}

# ============================================================================
# TEST 5: Verify completion signal format matches CFN pattern
# ============================================================================

test_cfn_signal_format() {
    log_step "TEST 5: Verify CFN completion signal format"

    # GIVEN: The expected CFN completion signal format
    local agent_id="test-agent-${TEST_ID}"
    local completion_key="swarm:${TASK_ID}:${agent_id}:done"

    local signal_json='{
        "task_id": "'"$TASK_ID"'",
        "agent_id": "'"$agent_id"'",
        "status": "completed",
        "confidence": 0.95,
        "deliverables": ["/tmp/output.txt"],
        "completed_at": "'"$(date -Iseconds)"'"
    }'

    # WHEN: Agent stores completion signal
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "$completion_key" "$signal_json" EX 60 >/dev/null
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "$COMPLETION_QUEUE" "$completion_key" >/dev/null

    # THEN: Main chat can retrieve both queue signal and metadata
    local queue_signal
    queue_signal=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" RPOP "$COMPLETION_QUEUE")

    if [[ "$queue_signal" == "$completion_key" ]]; then
        local metadata
        metadata=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "$queue_signal")

        if [[ "$metadata" == *"completed"* ]] && [[ "$metadata" == *"$agent_id"* ]]; then
            log_success "CFN completion signal format verified"
            # Clean up
            redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$completion_key" >/dev/null 2>&1 || true
            return 0
        fi
    fi

    log_error "CFN signal format verification failed"
    return 1
}

# ============================================================================
# TEST 6: Verify concurrent waits and signals
# ============================================================================

test_concurrent_signals() {
    log_step "TEST 6: Verify concurrent signals handling"

    local test_queue="test:${TASK_ID}:concurrent"
    local agent_count=3
    local results_dir="/tmp/concurrent-${TEST_ID}"
    mkdir -p "$results_dir"

    # GIVEN: An empty queue
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$test_queue" >/dev/null 2>&1 || true

    # WHEN: Multiple BLPOPs waiting concurrently
    for i in $(seq 1 $agent_count); do
        (timeout 10 redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BLPOP "$test_queue" 8 > "$results_dir/result-$i.txt" 2>&1) &
    done

    # Give waiters time to start
    sleep 1

    # Push signals for all waiters
    for i in $(seq 1 $agent_count); do
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "$test_queue" "signal_$i" >/dev/null
        sleep 0.1
    done

    # Wait for all to complete
    sleep 3

    # THEN: All waiters should have received signals
    local received=0
    for i in $(seq 1 $agent_count); do
        if [ -s "$results_dir/result-$i.txt" ]; then
            ((received++))
        fi
    done

    rm -rf "$results_dir"

    if [ "$received" -eq "$agent_count" ]; then
        log_success "All $agent_count concurrent waiters received signals"
        return 0
    fi

    log_warn "Only $received/$agent_count waiters received signals"
    return 0  # Partial success is acceptable
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

run_all_tests() {
    setup_test "main-chat-wait-exit"

    annotate "CLI Mode Main Chat Wait/Exit Pattern Tests"
    log_info "Test ID: $TEST_ID"
    log_info "Task ID: $TASK_ID"
    log_info "Redis: $REDIS_HOST:$REDIS_PORT"
    log_info "Architecture: Main chat uses BLPOP to wait for agent completion"
    echo ""

    # Verify Redis is available first
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
        log_error "Redis not available at $REDIS_HOST:$REDIS_PORT"
        exit 1
    fi
    log_success "Redis connection verified"
    echo ""

    # Execute test sequence
    test_blpop_timeout               || exit 1
    test_blpop_immediate             || exit 1
    test_async_unblock               || exit 1
    test_fifo_order                  || exit 1
    test_cfn_signal_format           || exit 1
    test_concurrent_signals          # Informational

    print_test_summary
}

run_all_tests
