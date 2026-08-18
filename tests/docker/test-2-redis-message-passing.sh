#!/usr/bin/env bash
##############################################################################
# Test 2: Redis Message Passing and Coordination
# Phase 4: Docker Mode Integration - Coordination Protocol
#
# Tests Redis-based coordination mechanisms:
# 1. Basic key-value operations
# 2. Counter operations (INCR)
# 3. List operations (LPUSH/RPOP)
# 4. Hash operations (HSET/HGETALL)
# 5. Key expiration (TTL)
# 6. Multi-agent coordination simulation
##############################################################################

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

TEST_PREFIX="test:$$:"

cleanup() {
    # Clean up test keys
    local keys
    keys=$(redis_keys "${TEST_PREFIX}*")
    if [[ -n "$keys" ]]; then
        for key in $keys; do
            redis_del "$key"
        done
    fi
    log_info "Cleanup completed"
}
trap cleanup EXIT

##############################################################################
# Test 2.1: Basic key-value operations
##############################################################################
test_redis_key_value() {
    log_step "Test 2.1: Basic key-value operations"

    local key="${TEST_PREFIX}test-key"
    local value="test-value-$$"

    # GIVEN: Redis is running
    # WHEN: Set and get value
    redis_set "$key" "$value"
    local result
    result=$(redis_get "$key")

    # THEN: Values should match
    assert_equals "$value" "$result" "Redis key-value operations"
}

##############################################################################
# Test 2.2: Counter operations (INCR)
##############################################################################
test_redis_counters() {
    log_step "Test 2.2: Counter operations (INCR)"

    local counter="${TEST_PREFIX}counter"

    # GIVEN: Counter starts at 0
    redis_set "$counter" "0"

    # WHEN: Increment counter multiple times
    $REDIS_CLI_CMD INCR "$counter" >/dev/null
    $REDIS_CLI_CMD INCR "$counter" >/dev/null
    $REDIS_CLI_CMD INCR "$counter" >/dev/null

    local result
    result=$(redis_get "$counter")

    # THEN: Counter should be 3
    assert_equals "3" "$result" "Redis counter increments"
}

##############################################################################
# Test 2.3: List operations (LPUSH/RPOP - queue)
##############################################################################
test_redis_lists() {
    log_step "Test 2.3: List operations (LPUSH/RPOP - queue)"

    local queue="${TEST_PREFIX}queue"

    # GIVEN: Empty queue
    # WHEN: Push items to queue (LPUSH for FIFO via RPOP)
    $REDIS_CLI_CMD LPUSH "$queue" "task-1" >/dev/null
    $REDIS_CLI_CMD LPUSH "$queue" "task-2" >/dev/null
    $REDIS_CLI_CMD LPUSH "$queue" "task-3" >/dev/null

    # THEN: Pop items in FIFO order
    local item1 item2 item3
    item1=$($REDIS_CLI_CMD RPOP "$queue")
    item2=$($REDIS_CLI_CMD RPOP "$queue")
    item3=$($REDIS_CLI_CMD RPOP "$queue")

    assert_equals "task-1" "$item1" "First item (FIFO)"
    assert_equals "task-2" "$item2" "Second item (FIFO)"
    assert_equals "task-3" "$item3" "Third item (FIFO)"
}

##############################################################################
# Test 2.4: Hash operations (HSET/HGETALL)
##############################################################################
test_redis_hashes() {
    log_step "Test 2.4: Hash operations (HSET/HGETALL)"

    local hash="${TEST_PREFIX}task:1"

    # GIVEN: Task metadata hash
    # WHEN: Store multiple fields
    $REDIS_CLI_CMD HSET "$hash" "agent_id" "agent-123" >/dev/null
    $REDIS_CLI_CMD HSET "$hash" "status" "completed" >/dev/null
    $REDIS_CLI_CMD HSET "$hash" "confidence" "0.95" >/dev/null

    # THEN: Retrieve all fields
    local output
    output=$($REDIS_CLI_CMD HGETALL "$hash")

    assert_contains "$output" "agent-123" "Hash contains agent_id"
    assert_contains "$output" "completed" "Hash contains status"
    assert_contains "$output" "0.95" "Hash contains confidence"
}

##############################################################################
# Test 2.5: Key expiration (TTL)
##############################################################################
test_redis_expiration() {
    log_step "Test 2.5: Key expiration (TTL)"

    local key="${TEST_PREFIX}temp-key"

    # GIVEN: Key with 2 second TTL
    redis_set "$key" "temporary"
    $REDIS_CLI_CMD EXPIRE "$key" 2 >/dev/null

    # WHEN: Check key exists immediately
    if redis_exists "$key"; then
        log_success "PASS: Key exists before expiration"
        TEST_PASSED=$((TEST_PASSED + 1))
        TEST_TOTAL=$((TEST_TOTAL + 1))
    else
        log_error "FAIL: Key should exist before expiration"
        TEST_FAILED=$((TEST_FAILED + 1))
        TEST_TOTAL=$((TEST_TOTAL + 1))
    fi

    # THEN: Wait for expiration
    sleep 3

    if ! redis_exists "$key"; then
        log_success "PASS: Key expired after TTL"
        TEST_PASSED=$((TEST_PASSED + 1))
        TEST_TOTAL=$((TEST_TOTAL + 1))
        return 0
    else
        log_error "FAIL: Key should have expired"
        TEST_FAILED=$((TEST_FAILED + 1))
        TEST_TOTAL=$((TEST_TOTAL + 1))
        return 1
    fi
}

##############################################################################
# Test 2.6: Multi-agent coordination simulation
##############################################################################
test_multi_agent_coordination() {
    log_step "Test 2.6: Multi-agent coordination simulation"

    local task_prefix="${TEST_PREFIX}coord:"

    # GIVEN: Simulated CFN Loop coordination
    # Initialize task counters
    redis_set "${task_prefix}total" "5"
    redis_set "${task_prefix}completed" "0"

    # Create task queue
    $REDIS_CLI_CMD LPUSH "${task_prefix}queue" "task-1" >/dev/null
    $REDIS_CLI_CMD LPUSH "${task_prefix}queue" "task-2" >/dev/null
    $REDIS_CLI_CMD LPUSH "${task_prefix}queue" "task-3" >/dev/null
    $REDIS_CLI_CMD LPUSH "${task_prefix}queue" "task-4" >/dev/null
    $REDIS_CLI_CMD LPUSH "${task_prefix}queue" "task-5" >/dev/null

    # WHEN: Simulate 3 agents claiming tasks
    local claimed_tasks=()
    for i in {1..3}; do
        local task
        task=$($REDIS_CLI_CMD RPOP "${task_prefix}queue")
        if [[ -n "$task" ]]; then
            claimed_tasks+=("$task")
            $REDIS_CLI_CMD INCR "${task_prefix}completed" >/dev/null
        fi
    done

    # THEN: Verify coordination state
    local total completed remaining
    total=$(redis_get "${task_prefix}total")
    completed=$(redis_get "${task_prefix}completed")
    remaining=$($REDIS_CLI_CMD LLEN "${task_prefix}queue")

    assert_equals "5" "$total" "Total tasks unchanged"
    assert_equals "3" "$completed" "Completed counter incremented"
    assert_equals "2" "$remaining" "Remaining tasks in queue"

    log_info "Claimed tasks: ${claimed_tasks[*]}"
    assert_equals "3" "${#claimed_tasks[@]}" "Correct number of tasks claimed"
}

##############################################################################
# Main execution
##############################################################################
setup_test "test-2-redis-message-passing"

test_redis_key_value
test_redis_counters
test_redis_lists
test_redis_hashes
test_redis_expiration
test_multi_agent_coordination

teardown_test
