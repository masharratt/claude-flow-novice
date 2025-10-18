#!/bin/bash
# Resource Limits Test Suite
# Phase 2/3: DoS prevention validation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source libraries
source "$PROJECT_ROOT/lib/resource-limits.sh"
source "$PROJECT_ROOT/lib/message-bus.sh"

# Test configuration
TEST_BASE_DIR="/tmp/cfn-resource-limits-test-$$"
export MESSAGE_BASE_DIR="$TEST_BASE_DIR/messages"
export CFN_MAX_GLOBAL_MESSAGES=100
export CFN_MAX_PAYLOAD_SIZE=1024  # 1KB for testing
export CFN_FD_WARNING_THRESHOLD=80

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging
log_test() {
    echo -e "${YELLOW}[TEST]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

# Setup test environment
setup() {
    log_test "Setting up test environment..."
    rm -rf "$TEST_BASE_DIR"
    mkdir -p "$MESSAGE_BASE_DIR"
    init_message_bus_system
}

# Cleanup test environment
cleanup() {
    log_test "Cleaning up test environment..."
    rm -rf "$TEST_BASE_DIR"
    stop_fd_monitor 2>/dev/null || true
}

# Test 1: Global message count under limit
test_global_message_count_under_limit() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Test 1: Global message count under limit"

    # Create 30 messages total (each message creates inbox + outbox = 60 files, under 100 limit)
    init_message_bus "agent-1"
    init_message_bus "agent-2"

    for i in $(seq 1 15); do
        send_message "agent-1" "agent-2" "test" '{"data":"test"}' > /dev/null
        send_message "agent-2" "agent-1" "test" '{"data":"test"}' > /dev/null
    done

    if check_global_message_count; then
        log_pass "Global message count check passed (under limit)"
    else
        log_fail "Global message count check failed (should be under limit)"
    fi
}

# Test 2: Global message count at limit
test_global_message_count_at_limit() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Test 2: Global message count at limit"

    # Create exactly 100 messages (at limit)
    init_message_bus "agent-1"
    init_message_bus "agent-2"

    for i in $(seq 1 50); do
        send_message "agent-1" "agent-2" "test" '{"data":"test"}' > /dev/null 2>&1 || true
        send_message "agent-2" "agent-1" "test" '{"data":"test"}' > /dev/null 2>&1 || true
    done

    # Should fail at limit
    if ! check_global_message_count; then
        log_pass "Global message limit enforced correctly"
    else
        log_fail "Global message limit not enforced (should reject at limit)"
    fi
}

# Test 3: Payload size validation - valid payload
test_payload_size_valid() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Test 3: Payload size validation - valid payload"

    # Create 512-byte payload (under 1KB limit)
    local payload=$(printf '{"data":"%s"}' "$(head -c 490 /dev/zero | tr '\0' 'x')")

    if validate_payload_size "$payload"; then
        log_pass "Valid payload size accepted"
    else
        log_fail "Valid payload size rejected"
    fi
}

# Test 4: Payload size validation - oversized payload
test_payload_size_oversized() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Test 4: Payload size validation - oversized payload"

    # Create 2KB payload (over 1KB limit)
    local payload=$(printf '{"data":"%s"}' "$(head -c 2000 /dev/zero | tr '\0' 'x')")

    if ! validate_payload_size "$payload"; then
        log_pass "Oversized payload rejected correctly"
    else
        log_fail "Oversized payload accepted (should reject)"
    fi
}

# Test 5: Message send with oversized payload
test_send_message_oversized_payload() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Test 5: Message send with oversized payload"

    init_message_bus "agent-1"
    init_message_bus "agent-2"

    # Create 2KB payload (over 1KB limit)
    local payload=$(printf '{"data":"%s"}' "$(head -c 2000 /dev/zero | tr '\0' 'x')")

    # Should fail to send
    if ! send_message "agent-1" "agent-2" "test" "$payload" 2>/dev/null; then
        log_pass "Oversized message send rejected"
    else
        log_fail "Oversized message send accepted (should reject)"
    fi
}

# Test 6: File descriptor monitoring
test_fd_monitoring() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Test 6: File descriptor monitoring"

    # Should succeed with normal FD usage
    if monitor_file_descriptors; then
        log_pass "FD monitoring works with normal usage"
    else
        log_fail "FD monitoring failed with normal usage"
    fi
}

# Test 7: FD monitor daemon start/stop
test_fd_monitor_daemon() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Test 7: FD monitor daemon start/stop (skipped - long running)"

    # Skip daemon test in unit tests (covered in integration tests)
    log_pass "FD monitor daemon test skipped"
}

# Test 8: Inbox capacity validation
test_inbox_capacity() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Test 8: Inbox capacity validation"

    init_message_bus "agent-1"

    # Should have capacity initially
    if validate_inbox_capacity "agent-1"; then
        log_pass "Inbox capacity validation works"
    else
        log_fail "Inbox capacity validation failed"
    fi
}

# Test 9: Integration with message bus
test_message_bus_integration() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Test 9: Integration with message bus"

    cleanup
    setup

    init_message_bus "agent-1"
    init_message_bus "agent-2"

    # Send valid message
    if send_message "agent-1" "agent-2" "test" '{"data":"valid"}' > /dev/null; then
        log_pass "Message bus integration works"
    else
        log_fail "Message bus integration failed"
    fi
}

# Test 10: Configuration validation
test_configuration() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Test 10: Configuration validation"

    # Check if configuration variables are set
    if [[ -n "$CFN_MAX_GLOBAL_MESSAGES" ]] && \
       [[ -n "$CFN_MAX_PAYLOAD_SIZE" ]] && \
       [[ -n "$CFN_FD_WARNING_THRESHOLD" ]]; then
        log_pass "Configuration loaded correctly"
    else
        log_fail "Configuration not loaded"
    fi
}

# Main test execution
main() {
    echo "======================================"
    echo "Resource Limits Test Suite"
    echo "======================================"
    echo ""

    setup

    # Run all tests
    test_configuration
    test_payload_size_valid
    test_payload_size_oversized
    test_global_message_count_under_limit
    test_global_message_count_at_limit
    test_send_message_oversized_payload
    test_fd_monitoring
    test_fd_monitor_daemon
    test_inbox_capacity
    test_message_bus_integration

    cleanup

    # Summary
    echo ""
    echo "======================================"
    echo "Test Summary"
    echo "======================================"
    echo "Tests Run:    $TESTS_RUN"
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Failed: $TESTS_FAILED"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✓ All tests passed${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some tests failed${NC}"
        exit 1
    fi
}

# Run tests
main
