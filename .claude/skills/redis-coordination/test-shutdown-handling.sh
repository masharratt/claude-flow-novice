#!/usr/bin/env bash

##############################################################################
# Test: Shutdown Handling in Orchestrator
# Verifies that orchestrator responds to shutdown signals and cleans up
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_TASK_ID="test-shutdown-$(date +%s)"
CLEANUP_NEEDED=1

# Cleanup function
cleanup() {
  if [ $CLEANUP_NEEDED -eq 1 ]; then
    echo ""
    echo "=== Cleanup ==="
    redis-cli DEL "swarm:${TEST_TASK_ID}:shutdown" >/dev/null 2>&1 || true
    redis-cli DEL "swarm:${TEST_TASK_ID}:*" >/dev/null 2>&1 || true
    echo "Cleanup complete"
  fi
}

trap cleanup EXIT

echo "=== Test: Shutdown Handling in Orchestrator ==="
echo "Test Task ID: $TEST_TASK_ID"
echo ""

# Test 1: Start orchestrator in background
echo "Test 1: Starting orchestrator in background..."

# Create mock agents (we'll send shutdown before they complete)
MOCK_LOOP3="mock-agent-1,mock-agent-2"
MOCK_LOOP2="mock-validator-1"
MOCK_PO="mock-po"

# Start orchestrator in background with high timeout (so it doesn't fail quickly)
timeout 30 "$SCRIPT_DIR/orchestrate-cfn-loop.sh" \
  --task-id "$TEST_TASK_ID" \
  --mode standard \
  --loop3-agents "$MOCK_LOOP3" \
  --loop2-agents "$MOCK_LOOP2" \
  --product-owner "$MOCK_PO" \
  --timeout 3600 \
  --max-iterations 5 > /tmp/orchestrator-output-${TEST_TASK_ID}.log 2>&1 &

ORCHESTRATOR_PID=$!
echo "Orchestrator started (PID: $ORCHESTRATOR_PID)"

# Wait for orchestrator to initialize and start shutdown monitor
sleep 2

# Verify orchestrator is running
if ! kill -0 $ORCHESTRATOR_PID 2>/dev/null; then
  echo "❌ FAIL: Orchestrator process died prematurely"
  cat /tmp/orchestrator-output-${TEST_TASK_ID}.log
  exit 1
fi

echo "✅ PASS: Orchestrator is running"
echo ""

# Test 2: Send shutdown signal via Redis
echo "Test 2: Sending shutdown signal via Redis..."

SHUTDOWN_PAYLOAD=$(jq -n --arg reason "test_shutdown" '{reason: $reason}')
echo "$SHUTDOWN_PAYLOAD" | redis-cli -x LPUSH "swarm:${TEST_TASK_ID}:shutdown" >/dev/null

echo "Shutdown signal sent: $SHUTDOWN_PAYLOAD"
echo "Waiting for orchestrator to shutdown..."

# Wait up to 5 seconds for graceful shutdown
for i in {1..10}; do
  if ! kill -0 $ORCHESTRATOR_PID 2>/dev/null; then
    echo "✅ PASS: Orchestrator shutdown gracefully"
    break
  fi
  sleep 0.5
done

# Verify orchestrator has stopped
if kill -0 $ORCHESTRATOR_PID 2>/dev/null; then
  echo "❌ FAIL: Orchestrator did not shutdown within 5 seconds"
  kill -9 $ORCHESTRATOR_PID 2>/dev/null || true
  exit 1
fi

echo ""

# Test 3: Verify cleanup happened
echo "Test 3: Verifying cleanup..."

# Check orchestrator output for shutdown messages
if grep -q "Orchestrator shutting down gracefully" /tmp/orchestrator-output-${TEST_TASK_ID}.log; then
  echo "✅ PASS: Found shutdown message in output"
else
  echo "❌ FAIL: Shutdown message not found in output"
  echo "Output:"
  cat /tmp/orchestrator-output-${TEST_TASK_ID}.log
  exit 1
fi

if grep -q "Shutdown complete" /tmp/orchestrator-output-${TEST_TASK_ID}.log; then
  echo "✅ PASS: Found completion message in output"
else
  echo "⚠️  WARNING: Completion message not found (non-critical)"
fi

# Check if swarm was marked as cancelled (may not be present if init-swarm never ran)
if grep -q "Marking swarm as cancelled" /tmp/orchestrator-output-${TEST_TASK_ID}.log || grep -q "Failed to mark swarm as cancelled" /tmp/orchestrator-output-${TEST_TASK_ID}.log; then
  echo "✅ PASS: Attempted to mark swarm as cancelled"
else
  echo "⚠️  INFO: Swarm cancellation not attempted (may not have initialized yet)"
fi

echo ""

# Test 4: Send SIGTERM signal
echo "Test 4: Testing SIGTERM signal handling..."

# Start another orchestrator instance
timeout 30 "$SCRIPT_DIR/orchestrate-cfn-loop.sh" \
  --task-id "${TEST_TASK_ID}-sigterm" \
  --mode standard \
  --loop3-agents "$MOCK_LOOP3" \
  --loop2-agents "$MOCK_LOOP2" \
  --product-owner "$MOCK_PO" \
  --timeout 3600 \
  --max-iterations 5 > /tmp/orchestrator-output-${TEST_TASK_ID}-sigterm.log 2>&1 &

ORCHESTRATOR_PID_2=$!
echo "Second orchestrator started (PID: $ORCHESTRATOR_PID_2)"

# Wait for initialization
sleep 2

# Send SIGTERM
echo "Sending SIGTERM to orchestrator..."
kill -TERM $ORCHESTRATOR_PID_2 2>/dev/null || true

# Wait for shutdown
for i in {1..10}; do
  if ! kill -0 $ORCHESTRATOR_PID_2 2>/dev/null; then
    echo "✅ PASS: Orchestrator responded to SIGTERM"
    break
  fi
  sleep 0.5
done

# Verify shutdown
if kill -0 $ORCHESTRATOR_PID_2 2>/dev/null; then
  echo "❌ FAIL: Orchestrator did not respond to SIGTERM within 5 seconds"
  kill -9 $ORCHESTRATOR_PID_2 2>/dev/null || true
  exit 1
fi

# Check for SIGTERM handling in output
if grep -q "SIGTERM_received" /tmp/orchestrator-output-${TEST_TASK_ID}-sigterm.log; then
  echo "✅ PASS: SIGTERM signal was properly caught and handled"
else
  echo "⚠️  WARNING: SIGTERM handling message not clear in output"
fi

echo ""
echo "=== All Tests Passed ==="
echo ""
echo "Orchestrator output (Test 1 - Redis shutdown):"
echo "----------------------------------------------"
cat /tmp/orchestrator-output-${TEST_TASK_ID}.log
echo ""
echo "Orchestrator output (Test 2 - SIGTERM):"
echo "----------------------------------------"
cat /tmp/orchestrator-output-${TEST_TASK_ID}-sigterm.log

# Cleanup test files
rm -f /tmp/orchestrator-output-${TEST_TASK_ID}.log
rm -f /tmp/orchestrator-output-${TEST_TASK_ID}-sigterm.log
redis-cli DEL "swarm:${TEST_TASK_ID}-sigterm:shutdown" >/dev/null 2>&1 || true
redis-cli DEL "swarm:${TEST_TASK_ID}-sigterm:*" >/dev/null 2>&1 || true

CLEANUP_NEEDED=0  # Prevent duplicate cleanup

echo ""
echo "✅ All shutdown handling tests passed successfully"
exit 0
