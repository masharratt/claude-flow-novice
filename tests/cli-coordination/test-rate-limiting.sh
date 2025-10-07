#!/usr/bin/env bash
# Integration Test: Rate Limiting & Backpressure System
# Phase 1 Sprint 1.5: Validates inbox capacity, backpressure, overflow detection

set -eo pipefail  # Remove -u to avoid issues with trap cleanup

# Test configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
TIMESTAMP=$(date +%s)
TEST_MESSAGE_BASE="/tmp/cfn-test-rate-limit-$TIMESTAMP"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Logging
log_test() {
    echo -e "${GREEN}[TEST]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

# Cleanup function
cleanup() {
    log_test "Cleaning up test environment..."

    # Kill background processes
    pkill -f "monitor_inbox_overflow" 2>/dev/null || true
    pkill -f "monitor_dynamic_rate_limit" 2>/dev/null || true

    # Remove test directories
    rm -rf "$TEST_MESSAGE_BASE" 2>/dev/null || true

    log_test "Cleanup complete"
}

trap cleanup EXIT

# Setup test environment
setup_test_env() {
    log_test "Setting up test environment..."

    # Override configuration for testing
    export MESSAGE_BASE_DIR="$TEST_MESSAGE_BASE"
    export MAX_INBOX_SIZE=10  # Low limit for testing
    export BACKPRESSURE_WAIT_MS=50  # Faster for testing
    export BACKPRESSURE_MAX_RETRIES=5  # Lower for testing

    # Create test directory
    mkdir -p "$TEST_MESSAGE_BASE"

    log_test "Test environment ready: $TEST_MESSAGE_BASE"
}

# Source required libraries
source_libraries() {
    log_test "Sourcing libraries..."

    # Source message bus
    if [[ -f "$TEST_DIR/message-bus.sh" ]]; then
        source "$TEST_DIR/message-bus.sh"
        log_test "✓ message-bus.sh loaded"
    else
        log_fail "message-bus.sh not found at $TEST_DIR/message-bus.sh"
        exit 1
    fi

    # Source metrics (optional)
    if [[ -f "$PROJECT_ROOT/lib/metrics.sh" ]]; then
        source "$PROJECT_ROOT/lib/metrics.sh"
        log_test "✓ metrics.sh loaded"
    else
        log_warn "metrics.sh not found (optional)"
    fi

    # Source alerting (optional)
    if [[ -f "$PROJECT_ROOT/lib/alerting.sh" ]]; then
        source "$PROJECT_ROOT/lib/alerting.sh"
        log_test "✓ alerting.sh loaded"
    else
        log_warn "alerting.sh not found (optional)"
    fi

    # Source rate limiting
    if [[ -f "$PROJECT_ROOT/lib/rate-limiting.sh" ]]; then
        source "$PROJECT_ROOT/lib/rate-limiting.sh"
        log_test "✓ rate-limiting.sh loaded"
    else
        log_fail "rate-limiting.sh not found at $PROJECT_ROOT/lib/rate-limiting.sh"
        exit 1
    fi
}

# Test 1: Inbox capacity checks
test_inbox_capacity() {
    log_test "Test 1: Inbox capacity checks"

    # Initialize inbox
    init_message_bus "test-agent-1"

    # Should have capacity initially
    if check_inbox_capacity "test-agent-1"; then
        log_pass "Empty inbox has capacity"
    else
        log_fail "Empty inbox should have capacity"
    fi

    # Check size
    local size=$(get_inbox_size "test-agent-1")
    if [[ $size -eq 0 ]]; then
        log_pass "Empty inbox size is 0"
    else
        log_fail "Empty inbox size should be 0, got $size"
    fi

    # Check utilization
    local util=$(get_inbox_utilization "test-agent-1")
    if [[ $util -eq 0 ]]; then
        log_pass "Empty inbox utilization is 0%"
    else
        log_fail "Empty inbox utilization should be 0%, got $util%"
    fi
}

# Test 2: Inbox overflow detection
test_inbox_overflow() {
    log_test "Test 2: Inbox overflow detection"

    init_message_bus "test-agent-2"
    init_message_bus "sender"

    # Fill inbox to capacity (MAX_INBOX_SIZE=10)
    for i in {1..10}; do
        send_message "sender" "test-agent-2" "test" "{\"msg\":$i}" >/dev/null 2>&1
    done

    local size=$(get_inbox_size "test-agent-2")
    if [[ $size -eq 10 ]]; then
        log_pass "Inbox filled to capacity: $size messages"
    else
        log_fail "Expected 10 messages, got $size"
    fi

    # Should NOT have capacity
    if ! check_inbox_capacity "test-agent-2"; then
        log_pass "Full inbox correctly reports no capacity"
    else
        log_fail "Full inbox should report no capacity"
    fi

    # Check utilization
    local util=$(get_inbox_utilization "test-agent-2")
    if [[ $util -eq 100 ]]; then
        log_pass "Full inbox utilization is 100%"
    else
        log_fail "Full inbox utilization should be 100%, got $util%"
    fi
}

# Test 3: Backpressure mechanism
test_backpressure() {
    log_test "Test 3: Backpressure mechanism"

    init_message_bus "test-agent-3"
    init_message_bus "bp-sender"

    # Fill inbox to capacity
    for i in {1..10}; do
        send_message "bp-sender" "test-agent-3" "test" "{\"msg\":$i}" >/dev/null 2>&1
    done

    # Attempt to send with backpressure (should fail after retries since inbox is full)
    log_test "Testing backpressure with full inbox..."
    set +e  # Temporarily disable exit on error for this test
    send_with_backpressure "bp-sender" "test-agent-3" "test" '{"msg":"overflow"}' 2>/dev/null
    local result=$?
    set -e  # Re-enable exit on error

    if [[ $result -eq 0 ]]; then
        log_fail "Should fail to send to full inbox after retries"
    else
        log_pass "Backpressure correctly failed after max retries"
    fi

    # Clear some messages to make space
    rm -f "$TEST_MESSAGE_BASE/test-agent-3/inbox"/*.json

    # Should succeed now
    if send_with_backpressure "bp-sender" "test-agent-3" "test" '{"msg":"success"}' >/dev/null 2>&1; then
        log_pass "Backpressure successfully sent after clearing inbox"
    else
        log_fail "Should succeed sending to cleared inbox"
    fi
}

# Test 4: Dynamic rate limiting
test_dynamic_rate_limiting() {
    log_test "Test 4: Dynamic rate limiting"

    # Save original values
    local original_batch=$CFN_BATCH_SIZE
    local original_wait=$BACKPRESSURE_WAIT_MS

    # Apply dynamic rate limit
    apply_dynamic_rate_limit

    # Check that values were set (exact values depend on system load)
    if [[ -n "$CFN_BATCH_SIZE" && -n "$BACKPRESSURE_WAIT_MS" ]]; then
        log_pass "Dynamic rate limiting applied: batch=$CFN_BATCH_SIZE, wait=${BACKPRESSURE_WAIT_MS}ms"
    else
        log_fail "Dynamic rate limiting failed to set values"
    fi

    # Check that values are within expected ranges
    if [[ $CFN_BATCH_SIZE -ge 5 && $CFN_BATCH_SIZE -le 20 ]]; then
        log_pass "Batch size within expected range: $CFN_BATCH_SIZE"
    else
        log_fail "Batch size out of range: $CFN_BATCH_SIZE (expected 5-20)"
    fi

    if [[ $BACKPRESSURE_WAIT_MS -ge 50 && $BACKPRESSURE_WAIT_MS -le 200 ]]; then
        log_pass "Backpressure wait within expected range: ${BACKPRESSURE_WAIT_MS}ms"
    else
        log_fail "Backpressure wait out of range: ${BACKPRESSURE_WAIT_MS}ms (expected 50-200)"
    fi
}

# Test 5: Inbox statistics
test_inbox_stats() {
    log_test "Test 5: Inbox statistics"

    init_message_bus "stats-agent-1"
    init_message_bus "stats-agent-2"
    init_message_bus "stats-sender"

    # Add different amounts to each inbox
    send_message "stats-sender" "stats-agent-1" "test" '{"msg":1}' >/dev/null 2>&1
    send_message "stats-sender" "stats-agent-1" "test" '{"msg":2}' >/dev/null 2>&1
    send_message "stats-sender" "stats-agent-2" "test" '{"msg":1}' >/dev/null 2>&1

    # Get all stats
    local stats=$(get_all_inbox_stats)

    if [[ -n "$stats" ]]; then
        log_pass "Inbox statistics retrieved"

        # Validate JSON structure (basic check)
        if echo "$stats" | jq -e '.' >/dev/null 2>&1; then
            log_pass "Statistics are valid JSON"

            # Count agents in stats
            local agent_count=$(echo "$stats" | jq 'length')
            if [[ $agent_count -ge 2 ]]; then
                log_pass "Statistics include multiple agents: $agent_count"
            else
                log_warn "Expected at least 2 agents in stats, got $agent_count"
            fi
        else
            log_fail "Statistics are not valid JSON"
        fi
    else
        log_fail "Failed to retrieve inbox statistics"
    fi
}

# Test 6: Monitoring (quick check, not full background test)
test_monitoring() {
    log_test "Test 6: Monitoring functions (smoke test)"

    # Test that monitoring functions exist and are callable
    if declare -f monitor_inbox_overflow >/dev/null; then
        log_pass "monitor_inbox_overflow function exists"
    else
        log_fail "monitor_inbox_overflow function not found"
    fi

    if declare -f monitor_dynamic_rate_limit >/dev/null; then
        log_pass "monitor_dynamic_rate_limit function exists"
    else
        log_fail "monitor_dynamic_rate_limit function not found"
    fi

    if declare -f cleanup_rate_limiting >/dev/null; then
        log_pass "cleanup_rate_limiting function exists"
    else
        log_fail "cleanup_rate_limiting function not found"
    fi
}

# Test 7: High utilization warning (80% threshold)
test_high_utilization_warning() {
    log_test "Test 7: High utilization warning (80% threshold)"

    init_message_bus "high-util-agent"
    init_message_bus "util-sender"

    # Fill inbox to 80% (8 messages out of 10)
    for i in {1..8}; do
        send_message "util-sender" "high-util-agent" "test" "{\"msg\":$i}" >/dev/null 2>&1
    done

    local util=$(get_inbox_utilization "high-util-agent")
    if [[ $util -eq 80 ]]; then
        log_pass "Inbox at 80% utilization as expected"
    else
        log_warn "Expected 80% utilization, got $util%"
    fi

    # Should still have capacity
    if check_inbox_capacity "high-util-agent"; then
        log_pass "Inbox with 80% utilization still has capacity"
    else
        log_fail "Inbox at 80% should still have capacity"
    fi
}

# Test 8: System load calculation
test_system_load() {
    log_test "Test 8: System load calculation"

    # Get system load
    local load=$(get_system_load)

    if [[ -n "$load" ]]; then
        log_pass "System load calculated: $load per CPU"

        # Validate it's a number
        if [[ "$load" =~ ^[0-9]+\.?[0-9]*$ ]]; then
            log_pass "System load is numeric: $load"
        else
            log_fail "System load should be numeric, got: $load"
        fi
    else
        log_fail "Failed to get system load"
    fi
}

# Main test execution
main() {
    echo "========================================"
    echo "Rate Limiting & Backpressure Test Suite"
    echo "========================================"
    echo ""

    setup_test_env
    source_libraries

    echo ""
    echo "Running tests..."
    echo ""

    test_inbox_capacity
    test_inbox_overflow
    test_backpressure
    test_dynamic_rate_limiting
    test_inbox_stats
    test_monitoring
    test_high_utilization_warning
    test_system_load

    echo ""
    echo "========================================"
    echo "Test Results"
    echo "========================================"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo "========================================"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some tests failed${NC}"
        exit 1
    fi
}

# Run tests
main "$@"
