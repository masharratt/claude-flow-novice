#!/usr/bin/env bash
# Quick Integration Test: Rate Limiting & Backpressure
# Simplified test without complex trap handling

MESSAGE_BASE_DIR="/tmp/cfn-test-rate-$$"
MAX_INBOX_SIZE=10
BACKPRESSURE_WAIT_MS=50
BACKPRESSURE_MAX_RETRIES=5
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../.." && pwd)"

PASS=0
FAIL=0

echo "========================================"
echo "Rate Limiting Quick Test"
echo "========================================"

# Source libraries
source "$TEST_DIR/message-bus.sh"
source "$PROJECT_ROOT/lib/rate-limiting.sh"

# Test 1: Basic capacity check
echo ""
echo "[TEST 1] Inbox capacity checks"
init_message_bus "agent1" >/dev/null 2>&1
if check_inbox_capacity "agent1" >/dev/null 2>&1; then
    echo "✓ PASS: Empty inbox has capacity"
    PASS=$((PASS + 1))
else
    echo "✗ FAIL: Empty inbox should have capacity"
    FAIL=$((FAIL + 1))
fi

# Test 2: Overflow detection
echo ""
echo "[TEST 2] Inbox overflow"
init_message_bus "agent2" >/dev/null 2>&1
init_message_bus "sender" >/dev/null 2>&1

for i in {1..10}; do
    send_message "sender" "agent2" "test" "{\"msg\":$i}" >/dev/null 2>&1
done

if ! check_inbox_capacity "agent2" >/dev/null 2>&1; then
    echo "✓ PASS: Full inbox correctly reports no capacity"
    PASS=$((PASS + 1))
else
    echo "✗ FAIL: Full inbox should report no capacity"
    FAIL=$((FAIL + 1))
fi

# Test 3: Backpressure
echo ""
echo "[TEST 3] Backpressure mechanism"
init_message_bus "agent3" >/dev/null 2>&1
init_message_bus "bp-sender" >/dev/null 2>&1

for i in {1..10}; do
    send_message "bp-sender" "agent3" "test" "{\"msg\":$i}" >/dev/null 2>&1
done

send_with_backpressure "bp-sender" "agent3" "test" '{"overflow":true}' >/dev/null 2>&1
result=$?

if [[ $result -ne 0 ]]; then
    echo "✓ PASS: Backpressure failed as expected (full inbox)"
    PASS=$((PASS + 1))
else
    echo "✗ FAIL: Should have failed on full inbox"
    FAIL=$((FAIL + 1))
fi

# Test 4: Backpressure success after clear
rm -f "$MESSAGE_BASE_DIR/agent3/inbox"/*.json 2>/dev/null

send_with_backpressure "bp-sender" "agent3" "test" '{"success":true}' >/dev/null 2>&1
result=$?

if [[ $result -eq 0 ]]; then
    echo "✓ PASS: Backpressure succeeded after clearing inbox"
    PASS=$((PASS + 1))
else
    echo "✗ FAIL: Should have succeeded on cleared inbox"
    FAIL=$((FAIL + 1))
fi

# Test 5: Dynamic rate limiting
echo ""
echo "[TEST 5] Dynamic rate limiting"
apply_dynamic_rate_limit >/dev/null 2>&1

if [[ -n "$CFN_BATCH_SIZE" && $CFN_BATCH_SIZE -ge 5 && $CFN_BATCH_SIZE -le 20 ]]; then
    echo "✓ PASS: Batch size adjusted: $CFN_BATCH_SIZE"
    PASS=$((PASS + 1))
else
    echo "✗ FAIL: Batch size not properly adjusted"
    FAIL=$((FAIL + 1))
fi

# Test 6: Inbox stats
echo ""
echo "[TEST 6] Inbox statistics"
stats=$(get_all_inbox_stats 2>/dev/null)

if echo "$stats" | jq -e '.' >/dev/null 2>&1; then
    echo "✓ PASS: Statistics are valid JSON"
    PASS=$((PASS + 1))
else
    echo "✗ FAIL: Statistics are not valid JSON"
    FAIL=$((FAIL + 1))
fi

# Cleanup
rm -rf "$MESSAGE_BASE_DIR" 2>/dev/null

# Summary
echo ""
echo "========================================"
echo "Test Results"
echo "========================================"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "========================================"

if [[ $FAIL -eq 0 ]]; then
    echo "✓ All tests passed!"
    exit 0
else
    echo "✗ Some tests failed"
    exit 1
fi
