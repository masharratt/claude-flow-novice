#!/usr/bin/env bash
# Integration Test: Rate Limiting + Message Bus Backpressure
# Tests inbox capacity monitoring and backpressure coordination

set -euo pipefail

# Test configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$TEST_DIR/../../lib"
TEST_MESSAGE_BASE="/tmp/cfn-test-rate-limiting-$$"

# Source libraries
source "$LIB_DIR/message-bus.sh"
source "$LIB_DIR/rate-limiting.sh"
source "$LIB_DIR/metrics.sh" 2>/dev/null || true
source "$LIB_DIR/alerting.sh" 2>/dev/null || true

# Override base directory for testing
export MESSAGE_BASE_DIR="$TEST_MESSAGE_BASE"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
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

assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [[ "$expected" == "$actual" ]]; then
        log_pass "$message (expected: $expected, got: $actual)"
    else
        log_fail "$message (expected: $expected, got: $actual)"
    fi
}

assert_true() {
    local condition="$1"
    local message="$2"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [[ "$condition" == "0" ]]; then
        log_pass "$message"
    else
        log_fail "$message (condition returned: $condition)"
    fi
}

cleanup() {
    rm -rf "$TEST_MESSAGE_BASE"
    log_test "Cleaned up test directory: $TEST_MESSAGE_BASE"
}

# Set trap to cleanup on exit
trap cleanup EXIT

# ==============================================================================
# TEST SUITE
# ==============================================================================

echo "========================================"
echo "Rate Limiting + Message Bus Integration"
echo "========================================"
echo ""

# Test 1: Initialize message bus system
log_test "Test 1: Initialize message bus system"
init_message_bus_system
assert_true "$?" "Message bus system initialized"
echo ""

# Test 2: Initialize agent inboxes
log_test "Test 2: Initialize agent inboxes"
init_message_bus "agent-1"
init_message_bus "agent-2"
assert_true "$?" "Agent inboxes initialized"
echo ""

# Test 3: Check inbox capacity for empty inbox
log_test "Test 3: Check inbox capacity (empty inbox)"
check_inbox_capacity "agent-1"
assert_true "$?" "Empty inbox has capacity"
echo ""

# Test 4: Get inbox size (should be 0)
log_test "Test 4: Get inbox size (empty)"
size=$(get_inbox_size "agent-1")
assert_equals "0" "$size" "Empty inbox size is 0"
echo ""

# Test 5: Send messages and verify inbox size
log_test "Test 5: Send messages and verify inbox size"
for i in {1..10}; do
    send_message "agent-2" "agent-1" "test" '{"message":"test"}' > /dev/null
done
size=$(get_inbox_size "agent-1")
assert_equals "10" "$size" "Inbox contains 10 messages"
echo ""

# Test 6: Get inbox utilization
log_test "Test 6: Get inbox utilization"
export MAX_INBOX_SIZE=100
utilization=$(get_inbox_utilization "agent-1")
assert_equals "10" "$utilization" "Inbox utilization is 10%"
echo ""

# Test 7: Inbox still has capacity (10/100)
log_test "Test 7: Check inbox capacity (10/100 messages)"
check_inbox_capacity "agent-1"
assert_true "$?" "Inbox at 10% has capacity"
echo ""

# Test 8: Fill inbox to 90% capacity
log_test "Test 8: Fill inbox to 90% capacity"
for i in {11..90}; do
    send_message "agent-2" "agent-1" "test" '{"message":"test"}' > /dev/null
done
size=$(get_inbox_size "agent-1")
assert_equals "90" "$size" "Inbox contains 90 messages"
utilization=$(get_inbox_utilization "agent-1")
assert_equals "90" "$utilization" "Inbox utilization is 90%"
echo ""

# Test 9: Inbox still has capacity at 90%
log_test "Test 9: Check inbox capacity (90/100 messages)"
check_inbox_capacity "agent-1"
assert_true "$?" "Inbox at 90% still has capacity"
echo ""

# Test 10: Fill inbox to 100% capacity (should fail capacity check)
log_test "Test 10: Fill inbox to 100% capacity"
for i in {91..100}; do
    send_message "agent-2" "agent-1" "test" '{"message":"test"}' > /dev/null
done
size=$(get_inbox_size "agent-1")
assert_equals "100" "$size" "Inbox contains 100 messages"
utilization=$(get_inbox_utilization "agent-1")
assert_equals "100" "$utilization" "Inbox utilization is 100%"
echo ""

# Test 11: Inbox at capacity (should fail capacity check)
log_test "Test 11: Check inbox capacity (100/100 messages - FULL)"
check_inbox_capacity "agent-1"
# Expect failure (return code 1)
if [[ $? -eq 1 ]]; then
    log_pass "Inbox at 100% correctly reports no capacity"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    log_fail "Inbox at 100% should report no capacity"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Test 12: Send with backpressure (should retry until capacity)
log_test "Test 12: Send with backpressure (inbox full - should apply backpressure)"
# Set backpressure to small values for fast test
export BACKPRESSURE_WAIT_MS=10
export BACKPRESSURE_MAX_RETRIES=5

# Clear some messages to make room
clear_inbox "agent-1"
for i in {1..100}; do
    send_message "agent-2" "agent-1" "test" '{"message":"test"}' > /dev/null
done

# Try to send with backpressure (inbox full, should fail after retries)
send_with_backpressure "agent-2" "agent-1" "test" '{"message":"backpressure-test"}' 2>/dev/null
result=$?

if [[ $result -eq 1 ]]; then
    log_pass "Backpressure correctly failed after max retries"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    log_fail "Backpressure should fail when inbox full"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Test 13: Send with backpressure (inbox has capacity - should succeed)
log_test "Test 13: Send with backpressure (inbox has capacity)"
clear_inbox "agent-1"
send_with_backpressure "agent-2" "agent-1" "test" '{"message":"backpressure-success"}' > /dev/null
assert_true "$?" "Backpressure send succeeded when capacity available"
echo ""

# Test 14: Get all inbox stats
log_test "Test 14: Get all inbox stats (JSON)"
stats=$(get_all_inbox_stats)
# Verify it's valid JSON (contains agent-1 and agent-2)
if echo "$stats" | grep -q '"agent":"agent-1"' && echo "$stats" | grep -q '"agent":"agent-2"'; then
    log_pass "Inbox stats JSON contains both agents"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    log_fail "Inbox stats JSON should contain both agents"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Test 15: Message count function
log_test "Test 15: Message count function"
count=$(message_count "agent-1" "inbox")
expected_count=1  # We cleared and sent 1 message in test 13
assert_equals "$expected_count" "$count" "Message count matches expected"
echo ""

# Test 16: Performance test - ls vs find (verify <10ms latency)
log_test "Test 16: Performance test - inbox size latency"
# Fill inbox with 100 messages
clear_inbox "agent-1"
for i in {1..100}; do
    send_message "agent-2" "agent-1" "test" '{"message":"perf-test"}' > /dev/null
done

# Measure latency (should be <10ms with ls, would be 2-10s with find on WSL)
start_time=$(date +%s%N)
size=$(get_inbox_size "agent-1")
end_time=$(date +%s%N)
latency_ms=$(( (end_time - start_time) / 1000000 ))

if [[ $latency_ms -lt 100 ]]; then
    log_pass "Inbox size latency: ${latency_ms}ms (target: <100ms)"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    log_fail "Inbox size latency too high: ${latency_ms}ms (target: <100ms)"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# ==============================================================================
# TEST SUMMARY
# ==============================================================================

echo "========================================"
echo "TEST SUMMARY"
echo "========================================"
echo "Total Tests: $TESTS_RUN"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}ALL TESTS PASSED${NC}"
    exit 0
else
    echo -e "${RED}SOME TESTS FAILED${NC}"
    exit 1
fi
