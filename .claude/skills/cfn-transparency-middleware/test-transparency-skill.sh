#!/usr/bin/env bash

# Transparency Middleware Test Suite
# Version: 1.0.0
# Sprint: 1.2 Middleware Skills Wrapper

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Import testing utilities
source .claude/skills/cfn-common/test-utils.sh
source .claude/skills/cfn-transparency-middleware/middleware-config.sh

# Logging configuration
LOG_FILE="/tmp/transparency-middleware-tests.log"
touch "$LOG_FILE"

# Redis connection parameters
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

# Test suite global variables
TEST_TASK_ID="transparency-test-$(date +%s)"
TOTAL_TESTS=10
PASSED_TESTS=0

# Utility Functions
log_test_start() {
    echo "[TEST] Starting: $1" | tee -a "$LOG_FILE"
}

log_test_result() {
    local status="$1"
    local message="$2"
    if [ "$status" -eq 0 ]; then
        echo "[PASS] $message" | tee -a "$LOG_FILE"
        ((PASSED_TESTS++))
    else
        echo "[FAIL] $message" | tee -a "$LOG_FILE"
    fi
}

# Test 1: Initialization
test_initialization() {
    log_test_start "Initialization Tests"
    local test_result=0

    # Test minimal transparency level
    ./invoke-transparency-middleware.sh init \
        --task-id "$TEST_TASK_ID" \
        --level minimal || test_result=1

    # Verify configuration
    local config=$(redis-cli hget "transparency:${TEST_TASK_ID}" config)
    [[ "$config" =~ "level:minimal" ]] || test_result=1

    # Test Redis connection
    redis-cli ping || test_result=1

    log_test_result "$test_result" "Initialization Test"
    return "$test_result"
}

# Test 2: Message Observation
test_message_observation() {
    log_test_start "Message Observation"
    local test_result=0

    # Simulate message generation
    ./invoke-transparency-middleware.sh subscribe \
        --task-id "$TEST_TASK_ID" \
        --channel "test-channel" || test_result=1

    # Publish test message
    redis-cli publish "test-channel" "Test observation message" || test_result=1

    # Check message reception
    local message=$(redis-cli blpop "transparency:${TEST_TASK_ID}:messages" 5)
    [[ -n "$message" ]] || test_result=1

    log_test_result "$test_result" "Message Observation Test"
    return "$test_result"
}

# Test 3: Transparency Level Changes
test_transparency_levels() {
    log_test_start "Transparency Level Changes"
    local test_result=0

    # Test level progression
    local levels=("minimal" "detailed" "verbose" "debug")
    for level in "${levels[@]}"; do
        ./invoke-transparency-middleware.sh set-level \
            --task-id "$TEST_TASK_ID" \
            --level "$level" || test_result=1
    done

    log_test_result "$test_result" "Transparency Level Changes Test"
    return "$test_result"
}

# Test 4: Filter Management
test_filter_management() {
    log_test_start "Filter Management"
    local test_result=0

    # Initialize
    ./invoke-transparency-middleware.sh init \
        --task-id "$TEST_TASK_ID" \
        --level detailed || test_result=1

    # Add include filter
    ./invoke-transparency-middleware.sh add-filter \
        --task-id "$TEST_TASK_ID" \
        --name "Error Filter" \
        --type include \
        --pattern "error|critical" || test_result=1

    # List filters
    local filters=$(./invoke-transparency-middleware.sh list-filters \
        --task-id "$TEST_TASK_ID")
    [[ "$filters" =~ "Error Filter" ]] || test_result=1

    # Test filter pattern
    local match=$(./invoke-transparency-middleware.sh test-filter \
        --task-id "$TEST_TASK_ID" \
        --name "Error Filter" \
        --message "critical system error")
    [[ "$match" == "true" ]] || test_result=1

    # Remove filter
    ./invoke-transparency-middleware.sh remove-filter \
        --task-id "$TEST_TASK_ID" \
        --name "Error Filter" || test_result=1

    log_test_result "$test_result" "Filter Management Test"
    return "$test_result"
}

# Test 5: Performance Metrics
test_performance_metrics() {
    log_test_start "Performance Metrics"
    local test_result=0

    # Initialize with verbose level
    ./invoke-transparency-middleware.sh init \
        --task-id "$TEST_TASK_ID" \
        --level verbose || test_result=1

    # Query metrics
    local metrics=$(./invoke-transparency-middleware.sh get-metrics \
        --task-id "$TEST_TASK_ID")

    # Verify metric fields
    [[ "$metrics" =~ "messages_generated" ]] || test_result=1
    [[ "$metrics" =~ "messages_filtered" ]] || test_result=1
    [[ "$metrics" =~ "overhead_percentage" ]] || test_result=1
    [[ "$metrics" =~ "queue_size" ]] || test_result=1

    # Verify overhead is reasonable (less than 10%)
    local overhead=$(echo "$metrics" | grep -o "overhead_percentage:[0-9.]*" | cut -d: -f2)
    (( $(echo "$overhead < 10" | bc -l) )) || test_result=1

    log_test_result "$test_result" "Performance Metrics Test"
    return "$test_result"
}

# Test 6: Redis Integration
test_redis_integration() {
    log_test_start "Redis Integration"
    local test_result=0

    # Initialize
    ./invoke-transparency-middleware.sh init \
        --task-id "$TEST_TASK_ID" \
        --level detailed || test_result=1

    # Verify Redis keys created
    local config_keys=$(redis-cli keys "transparency:config:*$TEST_TASK_ID*")
    local state_keys=$(redis-cli keys "transparency:state:*$TEST_TASK_ID*")

    [[ -n "$config_keys" ]] || test_result=1
    [[ -n "$state_keys" ]] || test_result=1

    # Publish test message
    redis-cli publish "transparency:messages:$TEST_TASK_ID" \
        '{"type":"test","message":"Redis integration test"}' || test_result=1

    # Observe message (with timeout)
    local message=$(timeout 5s ./invoke-transparency-middleware.sh observe \
        --task-id "$TEST_TASK_ID" \
        --timeout 3)
    [[ -n "$message" ]] || test_result=1

    # Cleanup
    ./invoke-transparency-middleware.sh stop \
        --task-id "$TEST_TASK_ID" || test_result=1

    log_test_result "$test_result" "Redis Integration Test"
    return "$test_result"
}

# Test 7: Multi-Agent Scenarios
test_multi_agent() {
    log_test_start "Multi-Agent Scenarios"
    local test_result=0

    # Initialize with different agent configs
    ./invoke-transparency-middleware.sh init \
        --task-id "${TEST_TASK_ID}-agent1" \
        --agent-id "agent-1" \
        --level detailed || test_result=1

    ./invoke-transparency-middleware.sh init \
        --task-id "${TEST_TASK_ID}-agent2" \
        --agent-id "agent-2" \
        --level verbose || test_result=1

    # Verify different levels per agent
    local agent1_level=$(./invoke-transparency-middleware.sh get-level \
        --agent-id "agent-1")
    local agent2_level=$(./invoke-transparency-middleware.sh get-level \
        --agent-id "agent-2")

    [[ "$agent1_level" == "detailed" ]] || test_result=1
    [[ "$agent2_level" == "verbose" ]] || test_result=1

    # Cleanup
    ./invoke-transparency-middleware.sh stop \
        --agent-id "agent-1" || test_result=1
    ./invoke-transparency-middleware.sh stop \
        --agent-id "agent-2" || test_result=1

    log_test_result "$test_result" "Multi-Agent Scenarios Test"
    return "$test_result"
}

# Test 8: Performance Overhead
test_performance_overhead() {
    log_test_start "Performance Overhead"
    local test_result=0

    # Test each transparency level
    local levels=("minimal" "detailed" "verbose" "debug")
    local max_overheads=(1.0 3.0 5.0 10.0)

    for i in "${!levels[@]}"; do
        local level="${levels[i]}"
        local max_overhead="${max_overheads[i]}"

        ./invoke-transparency-middleware.sh init \
            --task-id "${TEST_TASK_ID}-${level}" \
            --level "$level" || test_result=1

        local metrics=$(./invoke-transparency-middleware.sh get-metrics \
            --task-id "${TEST_TASK_ID}-${level}")

        local overhead=$(echo "$metrics" | grep -o "overhead_percentage:[0-9.]*" | cut -d: -f2)
        (( $(echo "$overhead <= $max_overhead" | bc -l) )) || {
            echo "❌ Level $level overhead $overhead% exceeds $max_overhead%"
            test_result=1
        }

        ./invoke-transparency-middleware.sh stop \
            --task-id "${TEST_TASK_ID}-${level}" || test_result=1
    done

    log_test_result "$test_result" "Performance Overhead Test"
    return "$test_result"
}

# Test 9: Error Handling
test_error_handling() {
    log_test_start "Error Handling"
    local test_result=0

    # Test invalid transparency level
    ! ./invoke-transparency-middleware.sh init \
        --task-id "$TEST_TASK_ID" \
        --level invalid 2>/dev/null || test_result=1

    # Test invalid task-id
    ! ./invoke-transparency-middleware.sh observe \
        --task-id "" 2>/dev/null || test_result=1

    # Test missing required parameters
    ! ./invoke-transparency-middleware.sh add-filter \
        --task-id "$TEST_TASK_ID" 2>/dev/null || test_result=1

    # Test invalid filter pattern
    ! ./invoke-transparency-middleware.sh add-filter \
        --task-id "$TEST_TASK_ID" \
        --name "test" \
        --pattern "" 2>/dev/null || test_result=1

    # Test observe on non-existent task
    ! ./invoke-transparency-middleware.sh observe \
        --task-id "nonexistent-task-12345" 2>/dev/null || test_result=1

    log_test_result "$test_result" "Error Handling Test"
    return "$test_result"
}

# Test 10: Graceful Shutdown
test_graceful_shutdown() {
    log_test_start "Graceful Shutdown"
    local test_result=0

    # Initialize
    ./invoke-transparency-middleware.sh init \
        --task-id "$TEST_TASK_ID" \
        --level detailed || test_result=1

    # Add some data
    ./invoke-transparency-middleware.sh add-filter \
        --task-id "$TEST_TASK_ID" \
        --name "Test Filter" \
        --pattern "test" || test_result=1

    # Shutdown with flush
    ./invoke-transparency-middleware.sh stop \
        --task-id "$TEST_TASK_ID" \
        --flush || test_result=1

    # Verify Redis keys cleaned up
    local keys=$(redis-cli keys "transparency:*$TEST_TASK_ID*")
    [[ -z "$keys" ]] || test_result=1

    # Test shutdown without flush
    ./invoke-transparency-middleware.sh init \
        --task-id "${TEST_TASK_ID}-noflush" \
        --level minimal || test_result=1

    ./invoke-transparency-middleware.sh stop \
        --task-id "${TEST_TASK_ID}-noflush" || test_result=1

    log_test_result "$test_result" "Graceful Shutdown Test"
    return "$test_result"
}

# Main Test Execution
main() {
    echo "Starting Transparency Middleware Test Suite" | tee -a "$LOG_FILE"

    test_initialization
    test_message_observation
    test_transparency_levels
    test_filter_management
    test_performance_metrics
    test_redis_integration
    test_multi_agent
    test_performance_overhead
    test_error_handling
    test_graceful_shutdown

    # Final Report
    echo "Test Results: $PASSED_TESTS/$TOTAL_TESTS passed" | tee -a "$LOG_FILE"

    if [ "$PASSED_TESTS" -eq "$TOTAL_TESTS" ]; then
        redis-cli publish "swarm:sprint-1.2:devops" "test_suite_passed:1.0"
        exit 0
    else
        redis-cli publish "swarm:sprint-1.2:devops" "test_suite_failed:0.0"
        exit 1
    fi
}

# Execute main function
main