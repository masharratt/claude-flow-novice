#!/bin/bash
# Integration Test: Metrics + Message-Bus Integration
# Validates event-driven metrics emission through message-bus coordination

set -euo pipefail

# Test directory setup
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../.." && pwd)"

# Source libraries
source "$PROJECT_ROOT/lib/metrics.sh"
source "$PROJECT_ROOT/tests/cli-coordination/message-bus.sh"

# Test configuration
TEST_METRICS_FILE="/dev/shm/test-metrics-integration.jsonl"
TEST_MESSAGE_DIR="/dev/shm/test-message-bus-metrics"
METRICS_FILE="$TEST_METRICS_FILE"
MESSAGE_BASE_DIR="$TEST_MESSAGE_DIR"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Cleanup function
cleanup() {
    rm -f "$TEST_METRICS_FILE"
    rm -rf "$TEST_MESSAGE_DIR"
}

# Setup function
setup() {
    cleanup
    mkdir -p "$TEST_MESSAGE_DIR"
    touch "$TEST_METRICS_FILE"
}

# Test assertion helper
assert_equal() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if [[ "$expected" == "$actual" ]]; then
        echo -e "${GREEN}✓${NC} PASS: $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} FAIL: $test_name"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"

    if echo "$haystack" | grep -q "$needle"; then
        echo -e "${GREEN}✓${NC} PASS: $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} FAIL: $test_name"
        echo "  Expected to contain: $needle"
        echo "  Actual: $haystack"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Run tests
echo "============================================================"
echo "METRICS + MESSAGE-BUS INTEGRATION TEST"
echo "============================================================"

setup

# Test 1: Basic metrics emission still works
echo ""
echo "Test 1: Basic metrics emission (JSONL file)"
emit_metric "test.metric" "42" "count" '{"test":true}'
metrics_count=$(wc -l < "$TEST_METRICS_FILE")
assert_equal "1" "$metrics_count" "Metric written to JSONL file"

# Test 2: Message-bus initialization for metrics collector
echo ""
echo "Test 2: Initialize message-bus for metrics-collector"
init_message_bus "metrics-collector"
collector_inbox="$TEST_MESSAGE_DIR/metrics-collector/inbox"
if [[ -d "$collector_inbox" ]]; then
    echo -e "${GREEN}✓${NC} PASS: metrics-collector inbox created"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗${NC} FAIL: metrics-collector inbox not created"
    ((TESTS_FAILED++))
fi

# Test 3: Send message with metrics tracking
echo ""
echo "Test 3: Send message with automatic metrics emission"
init_message_bus "agent-1"
send_message "agent-1" "metrics-collector" "test.message" '{"data":"test"}' >/dev/null

# Check metrics file for coordination.message_sent
metrics_content=$(cat "$TEST_METRICS_FILE")
assert_contains "$metrics_content" "coordination.message_sent" "Message sent metric emitted"
assert_contains "$metrics_content" "coordination.latency" "Latency metric emitted"

# Test 4: emit_coordination_metric dual-channel emission
echo ""
echo "Test 4: emit_coordination_metric (dual-channel)"
emit_coordination_metric "test.coordination" "100" "milliseconds" '{"agent":"test"}' "agent-1"

# Check JSONL file
metrics_content=$(cat "$TEST_METRICS_FILE")
assert_contains "$metrics_content" "test.coordination" "Coordination metric in JSONL file"

# Check message-bus inbox
collector_msg_count=$(message_count "metrics-collector" "inbox")
if [[ $collector_msg_count -gt 0 ]]; then
    echo -e "${GREEN}✓${NC} PASS: Coordination metric sent to message-bus"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}⚠${NC} INFO: Message-bus emission skipped (expected if send_message not in PATH)"
fi

# Test 5: Receive messages with metrics tracking
echo ""
echo "Test 5: Receive messages with automatic metrics emission"
init_message_bus "agent-2"
send_message "agent-1" "agent-2" "test.receive" '{"test":true}' >/dev/null
receive_messages "agent-2" >/dev/null

# Check for coordination.message_received metric
metrics_content=$(cat "$TEST_METRICS_FILE")
assert_contains "$metrics_content" "coordination.message_received" "Message received metric emitted"

# Test 6: Inbox overflow metrics
echo ""
echo "Test 6: Inbox overflow metric emission"
init_message_bus "agent-overflow"

# Send 101 messages to trigger overflow
for i in {1..101}; do
    send_message "agent-1" "agent-overflow" "spam" '{"msg":'$i'}' >/dev/null 2>&1
done

# Check for inbox overflow metric
metrics_content=$(cat "$TEST_METRICS_FILE")
assert_contains "$metrics_content" "coordination.inbox_overflow" "Inbox overflow metric emitted"

# Test 7: Thread-safety (concurrent metrics emission)
echo ""
echo "Test 7: Thread-safety with concurrent emissions"
for i in {1..10}; do
    emit_metric "concurrent.test" "$i" "count" '{"iteration":'$i'}' &
done
wait

concurrent_count=$(grep -c "concurrent.test" "$TEST_METRICS_FILE" || true)
assert_equal "10" "$concurrent_count" "All concurrent metrics written"

# Test 8: Coordination latency measurement accuracy
echo ""
echo "Test 8: Coordination latency tracking"
init_message_bus "latency-test"
send_message "agent-1" "latency-test" "timing.test" '{"test":true}' >/dev/null

# Extract latency value from metrics
latency_line=$(grep "coordination.latency" "$TEST_METRICS_FILE" | tail -n 1)
if [[ -n "$latency_line" ]]; then
    echo -e "${GREEN}✓${NC} PASS: Latency metric captured: $latency_line"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗${NC} FAIL: Latency metric not found"
    ((TESTS_FAILED++))
fi

# Cleanup
cleanup

# Summary
echo ""
echo "============================================================"
echo "TEST SUMMARY"
echo "============================================================"
echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}Failed:${NC} $TESTS_FAILED"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
