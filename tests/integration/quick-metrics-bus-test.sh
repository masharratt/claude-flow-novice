#!/bin/bash
# Quick Integration Test: Metrics + Message-Bus
# Validates core integration without slow find operations

set -euo pipefail

# Setup
PROJECT_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice"
source "$PROJECT_ROOT/lib/metrics.sh"
source "$PROJECT_ROOT/tests/cli-coordination/message-bus.sh"

TEST_METRICS_FILE="/dev/shm/quick-test-metrics.jsonl"
TEST_MESSAGE_DIR="/dev/shm/quick-test-messages"
METRICS_FILE="$TEST_METRICS_FILE"
MESSAGE_BASE_DIR="$TEST_MESSAGE_DIR"

# Cleanup
rm -f "$TEST_METRICS_FILE"
rm -rf "$TEST_MESSAGE_DIR"
mkdir -p "$TEST_MESSAGE_DIR"
touch "$TEST_METRICS_FILE"

echo "============================================================"
echo "QUICK METRICS-BUS INTEGRATION TEST"
echo "============================================================"

# Test 1: Basic emit_metric writes to JSONL
echo ""
echo "[1/5] Testing basic metrics emission..."
emit_metric "test.basic" "100" "count" '{"test":true}'
if grep -q "test.basic" "$TEST_METRICS_FILE"; then
    echo "✓ PASS: Basic metric emitted to JSONL"
else
    echo "✗ FAIL: Basic metric not found"
    exit 1
fi

# Test 2: Message-bus initialization
echo ""
echo "[2/5] Testing message-bus initialization..."
init_message_bus "agent-test"
if [[ -d "$TEST_MESSAGE_DIR/agent-test/inbox" ]]; then
    echo "✓ PASS: Agent inbox created"
else
    echo "✗ FAIL: Agent inbox not created"
    exit 1
fi

# Test 3: send_message emits coordination metrics
echo ""
echo "[3/5] Testing send_message metrics emission..."
init_message_bus "receiver"
send_message "agent-test" "receiver" "test.msg" '{"data":123}' >/dev/null 2>&1

if grep -q "coordination.message_sent" "$TEST_METRICS_FILE"; then
    echo "✓ PASS: Message sent metric emitted"
else
    echo "✗ FAIL: Message sent metric not found"
    exit 1
fi

if grep -q "coordination.latency" "$TEST_METRICS_FILE"; then
    echo "✓ PASS: Coordination latency metric emitted"
else
    echo "✗ FAIL: Coordination latency metric not found"
    exit 1
fi

# Test 4: emit_coordination_metric dual-channel
echo ""
echo "[4/5] Testing emit_coordination_metric..."
emit_coordination_metric "custom.metric" "50" "ms" '{"agent":"test"}' "agent-test"

if grep -q "custom.metric" "$TEST_METRICS_FILE"; then
    echo "✓ PASS: Coordination metric in JSONL"
else
    echo "✗ FAIL: Coordination metric not in JSONL"
    exit 1
fi

# Test 5: Thread-safety with concurrent emissions
echo ""
echo "[5/5] Testing thread-safety..."
for i in {1..5}; do
    emit_metric "concurrent.$i" "$i" "count" '{}' &
done
wait

concurrent_count=$(grep -c "concurrent\." "$TEST_METRICS_FILE" || echo "0")
if [[ $concurrent_count -eq 5 ]]; then
    echo "✓ PASS: All 5 concurrent metrics written"
else
    echo "✗ FAIL: Expected 5 concurrent metrics, found $concurrent_count"
    exit 1
fi

# Cleanup
rm -f "$TEST_METRICS_FILE"
rm -rf "$TEST_MESSAGE_DIR"

echo ""
echo "============================================================"
echo "✓ ALL TESTS PASSED"
echo "============================================================"
exit 0
