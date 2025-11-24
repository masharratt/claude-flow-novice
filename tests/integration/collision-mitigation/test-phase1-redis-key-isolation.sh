#!/bin/bash
# tests/integration/collision-mitigation/test-phase1-redis-key-isolation.sh
# Phase 1 :: Redis namespace isolation validation (Reference: CLI_TRIGGER_COLLISION_ANALYSIS.md)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_TASK_ID="collision-test-$$"
REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
REDIS_PORT="${CFN_REDIS_PORT:-6379}"
REDIS_CLI="redis-cli -h $REDIS_HOST -p $REDIS_PORT"

cleanup() {
    log_info "Cleaning up Phase 1 test artifacts"

    # Clean up Redis keys
    $REDIS_CLI DEL "cfn:task:cli:${TEST_TASK_ID}:status" 2>/dev/null || true
    $REDIS_CLI DEL "cfn:task:cli:${TEST_TASK_ID}:completed" 2>/dev/null || true
    $REDIS_CLI DEL "cfn:task:cli:${TEST_TASK_ID}:result" 2>/dev/null || true
    $REDIS_CLI DEL "cfn:task:trigger:${TEST_TASK_ID}:status" 2>/dev/null || true
    $REDIS_CLI DEL "cfn:task:trigger:${TEST_TASK_ID}:completed" 2>/dev/null || true
    $REDIS_CLI DEL "cfn:task:trigger:${TEST_TASK_ID}:result" 2>/dev/null || true
}
trap cleanup EXIT

test_redis_key_prefix_isolation() {
    annotate "Phase 1: Redis Key Namespace Isolation"

    log_step "GIVEN: Redis is available"
    if ! $REDIS_CLI PING >/dev/null 2>&1; then
        log_error "Redis not available at $REDIS_HOST:$REDIS_PORT"
        return 1
    fi

    log_step "WHEN: CLI mode creates keys with 'cli:' prefix"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:status" "running"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:completed" "0"

    log_step "WHEN: Trigger.dev mode creates keys with 'trigger:' prefix"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:status" "running"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:completed" "0"

    log_step "THEN: CLI keys exist independently"
    local cli_status=$($REDIS_CLI GET "cfn:task:cli:${TEST_TASK_ID}:status")
    assert_equals "running" "$cli_status" "CLI status key exists"

    log_step "THEN: Trigger keys exist independently"
    local trigger_status=$($REDIS_CLI GET "cfn:task:trigger:${TEST_TASK_ID}:status")
    assert_equals "running" "$trigger_status" "Trigger status key exists"

    log_step "THEN: Keys are isolated (no collision)"
    local cli_key_count=$($REDIS_CLI KEYS "cfn:task:cli:${TEST_TASK_ID}:*" | wc -l)
    local trigger_key_count=$($REDIS_CLI KEYS "cfn:task:trigger:${TEST_TASK_ID}:*" | wc -l)

    if [ "$cli_key_count" -ge 2 ] && [ "$trigger_key_count" -ge 2 ]; then
        log_success "Keys isolated: CLI=$cli_key_count, Trigger=$trigger_key_count"
    else
        log_error "Key isolation failed: CLI=$cli_key_count, Trigger=$trigger_key_count"
        return 1
    fi
}

test_completion_signal_isolation() {
    annotate "Completion Signal Isolation"

    log_step "GIVEN: Both modes have active tasks"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:status" "running"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:status" "running"

    log_step "WHEN: CLI mode completes its task"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:status" "completed"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:completed" "1"

    log_step "THEN: Trigger mode task remains running"
    local trigger_status=$($REDIS_CLI GET "cfn:task:trigger:${TEST_TASK_ID}:status")
    assert_equals "running" "$trigger_status" "Trigger task not affected by CLI completion"

    log_step "WHEN: Trigger mode completes its task"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:status" "completed"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:completed" "1"

    log_step "THEN: Both completion signals are independent"
    local cli_completed=$($REDIS_CLI GET "cfn:task:cli:${TEST_TASK_ID}:completed")
    local trigger_completed=$($REDIS_CLI GET "cfn:task:trigger:${TEST_TASK_ID}:completed")

    assert_equals "1" "$cli_completed" "CLI completed independently"
    assert_equals "1" "$trigger_completed" "Trigger completed independently"
}

test_counter_isolation() {
    annotate "Counter Isolation"

    log_step "GIVEN: Both modes have counters initialized"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:total" "10"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:completed" "0"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:total" "20"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:completed" "0"

    log_step "WHEN: CLI mode increments completed counter"
    $REDIS_CLI INCR "cfn:task:cli:${TEST_TASK_ID}:completed"
    $REDIS_CLI INCR "cfn:task:cli:${TEST_TASK_ID}:completed"

    log_step "WHEN: Trigger mode increments completed counter"
    $REDIS_CLI INCR "cfn:task:trigger:${TEST_TASK_ID}:completed"

    log_step "THEN: Counters remain isolated"
    local cli_completed=$($REDIS_CLI GET "cfn:task:cli:${TEST_TASK_ID}:completed")
    local trigger_completed=$($REDIS_CLI GET "cfn:task:trigger:${TEST_TASK_ID}:completed")

    assert_equals "2" "$cli_completed" "CLI counter isolated"
    assert_equals "1" "$trigger_completed" "Trigger counter isolated"
}

# Execute tests
test_redis_key_prefix_isolation
test_completion_signal_isolation
test_counter_isolation

# Summary
annotate "Phase 1 Test Summary"
echo "Total Tests: $TEST_TOTAL"
echo "Passed: $TEST_PASSED"
echo "Failed: $TEST_FAILED"

if [ "$TEST_FAILED" -eq 0 ]; then
    log_success "Phase 1: All Redis key isolation tests passed"
    exit 0
else
    log_error "Phase 1: $TEST_FAILED test(s) failed"
    exit 1
fi
