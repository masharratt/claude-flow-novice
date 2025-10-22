#!/usr/bin/env bash

##############################################################################
# Test Cancel Swarm - Validates graceful shutdown functionality
#
# Tests:
#   1. Cancel active swarm (success path)
#   2. Cancel with custom reason and initiator
#   3. Cancel non-existent swarm (error handling)
#   4. Verify shutdown signals delivered to all agents
#   5. Verify swarm metadata updated correctly
#   6. Test force flag (skip confirmation)
##############################################################################

# Disable strict error handling for tests
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_TASK_ID="test-cancel-$(date +%s)"
FAILED_TESTS=0
PASSED_TESTS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_test() {
  echo ""
  echo "========================================="
  echo "TEST: $1"
  echo "========================================="
}

log_pass() {
  echo -e "${GREEN}✓ PASS:${NC} $1"
  ((PASSED_TESTS++))
}

log_fail() {
  echo -e "${RED}✗ FAIL:${NC} $1"
  ((FAILED_TESTS++))
}

log_info() {
  echo -e "${YELLOW}ℹ INFO:${NC} $1"
}

cleanup() {
  log_info "Cleaning up test data..."

  # Delete test keys matching patterns
  KEYS=$(redis-cli --scan --pattern "swarm:${TEST_TASK_ID}*" 2>/dev/null || true)
  if [ -n "$KEYS" ]; then
    echo "$KEYS" | while read -r KEY; do
      redis-cli del "$KEY" > /dev/null 2>&1 || true
    done
  fi

  KEYS=$(redis-cli --scan --pattern "swarm:test-cancel-*" 2>/dev/null || true)
  if [ -n "$KEYS" ]; then
    echo "$KEYS" | while read -r KEY; do
      redis-cli del "$KEY" > /dev/null 2>&1 || true
    done
  fi
}

# Cleanup on exit
trap cleanup EXIT

echo "========================================="
echo "Cancel Swarm Test Suite"
echo "========================================="
echo "Test Task ID: $TEST_TASK_ID"
echo ""

# =============================================================================
# Test 1: Cancel active swarm (success path)
# =============================================================================
log_test "Cancel Active Swarm"

# Initialize test swarm
SWARM_ID="${TEST_TASK_ID}-swarm1"
AGENTS="coder-1,reviewer-1,tester-1"

"$SCRIPT_DIR/init-swarm.sh" \
  --swarm-id "$SWARM_ID" \
  --task-id "$TEST_TASK_ID" \
  --agents "$AGENTS" > /dev/null

log_info "Swarm initialized: $SWARM_ID"

# Cancel swarm with force flag (skip confirmation)
OUTPUT=$("$SCRIPT_DIR/cancel-swarm.sh" \
  --task-id "$TEST_TASK_ID" \
  --force 2>&1 || true)

# Verify status updated
STATUS=$(redis-cli hget "swarm:${SWARM_ID}:metadata" status)
if [ "$STATUS" = "cancelled" ]; then
  log_pass "Swarm status updated to 'cancelled'"
else
  log_fail "Expected status 'cancelled', got: $STATUS"
fi

# Verify agents_notified count
NOTIFIED=$(redis-cli hget "swarm:${SWARM_ID}:metadata" agents_notified)
if [ "$NOTIFIED" = "3" ]; then
  log_pass "All 3 agents notified"
else
  log_fail "Expected 3 agents notified, got: $NOTIFIED"
fi

# Verify shutdown signal broadcasted
SHUTDOWN_KEY="swarm:${TEST_TASK_ID}:shutdown"
SHUTDOWN_MSG=$(redis-cli --raw lindex "$SHUTDOWN_KEY" 0 2>/dev/null || echo "{}")

if [ -n "$SHUTDOWN_MSG" ] && [ "$SHUTDOWN_MSG" != "(nil)" ]; then
  log_pass "Shutdown signal broadcasted to $SHUTDOWN_KEY"

  # Verify message content
  REASON=$(echo "$SHUTDOWN_MSG" | jq -r '.reason // empty')
  INITIATOR=$(echo "$SHUTDOWN_MSG" | jq -r '.initiator // empty')

  if [ "$REASON" = "user_requested_cancellation" ]; then
    log_pass "Shutdown signal has correct reason"
  else
    log_fail "Expected reason 'user_requested_cancellation', got: $REASON"
  fi

  if [ "$INITIATOR" = "main-chat" ]; then
    log_pass "Shutdown signal has correct initiator"
  else
    log_fail "Expected initiator 'main-chat', got: $INITIATOR"
  fi
else
  log_fail "No shutdown signal found"
fi

# =============================================================================
# Test 2: Cancel with custom reason and initiator
# =============================================================================
log_test "Cancel with Custom Reason and Initiator"

SWARM_ID2="${TEST_TASK_ID}-swarm2"
"$SCRIPT_DIR/init-swarm.sh" \
  --swarm-id "$SWARM_ID2" \
  --task-id "${TEST_TASK_ID}-custom" \
  --agents "backend-dev-1" > /dev/null

OUTPUT=$("$SCRIPT_DIR/cancel-swarm.sh" \
  --task-id "${TEST_TASK_ID}-custom" \
  --reason "integration_test_timeout" \
  --initiator "test-runner" \
  --force 2>&1 || true)

CANCEL_REASON=$(redis-cli hget "swarm:${SWARM_ID2}:metadata" cancellation_reason)
CANCEL_INIT=$(redis-cli hget "swarm:${SWARM_ID2}:metadata" cancellation_initiator)

if [ "$CANCEL_REASON" = "integration_test_timeout" ]; then
  log_pass "Custom cancellation reason recorded"
else
  log_fail "Expected reason 'integration_test_timeout', got: $CANCEL_REASON"
fi

if [ "$CANCEL_INIT" = "test-runner" ]; then
  log_pass "Custom initiator recorded"
else
  log_fail "Expected initiator 'test-runner', got: $CANCEL_INIT"
fi

# =============================================================================
# Test 3: Cancel non-existent swarm (error handling)
# =============================================================================
log_test "Cancel Non-Existent Swarm (Error Handling)"

OUTPUT=$("$SCRIPT_DIR/cancel-swarm.sh" \
  --task-id "non-existent-task-id-12345" \
  --force 2>&1 || true)

if echo "$OUTPUT" | grep -q "No swarm found"; then
  log_pass "Error message displayed for non-existent swarm"
else
  log_fail "Expected error message, got: $OUTPUT"
fi

# =============================================================================
# Test 4: Verify shutdown message format
# =============================================================================
log_test "Verify Shutdown Message Format"

SWARM_ID3="${TEST_TASK_ID}-swarm3"
"$SCRIPT_DIR/init-swarm.sh" \
  --swarm-id "$SWARM_ID3" \
  --task-id "${TEST_TASK_ID}-format" \
  --agents "security-1" > /dev/null

"$SCRIPT_DIR/cancel-swarm.sh" \
  --task-id "${TEST_TASK_ID}-format" \
  --reason "test_message_format" \
  --initiator "validator" \
  --force > /dev/null 2>&1

SHUTDOWN_KEY="swarm:${TEST_TASK_ID}-format:shutdown"
MSG=$(redis-cli --raw lindex "$SHUTDOWN_KEY" 0 2>/dev/null || echo "{}")

# Validate JSON structure
REASON=$(echo "$MSG" | jq -r '.reason // empty')
TIMESTAMP=$(echo "$MSG" | jq -r '.timestamp // empty')
INITIATOR=$(echo "$MSG" | jq -r '.initiator // empty')

if [ "$REASON" = "test_message_format" ] && \
   [ -n "$TIMESTAMP" ] && \
   [ "$INITIATOR" = "validator" ]; then
  log_pass "Shutdown message has correct format"
else
  log_fail "Shutdown message format incorrect: $MSG"
fi

# =============================================================================
# Test 5: Verify cancelled_at timestamp
# =============================================================================
log_test "Verify Cancelled Timestamp"

CANCELLED_AT=$(redis-cli hget "swarm:${SWARM_ID3}:metadata" cancelled_at)

if [[ "$CANCELLED_AT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
  log_pass "Cancelled timestamp in ISO 8601 format: $CANCELLED_AT"
else
  log_fail "Invalid timestamp format: $CANCELLED_AT"
fi

# =============================================================================
# Test 6: Empty agent list handling
# =============================================================================
log_test "Handle Swarm with Empty Agent List"

SWARM_ID4="${TEST_TASK_ID}-swarm4"
redis-cli hset "swarm:${SWARM_ID4}:metadata" \
  swarm_id "$SWARM_ID4" \
  task_id "${TEST_TASK_ID}-empty" \
  agents "" \
  status "in_progress" > /dev/null

OUTPUT=$("$SCRIPT_DIR/cancel-swarm.sh" \
  --task-id "${TEST_TASK_ID}-empty" \
  --force 2>&1 || true)

STATUS=$(redis-cli hget "swarm:${SWARM_ID4}:metadata" status)
NOTIFIED=$(redis-cli hget "swarm:${SWARM_ID4}:metadata" agents_notified)

if [ "$STATUS" = "cancelled" ] && [ "$NOTIFIED" = "0" ]; then
  log_pass "Empty agent list handled correctly"
else
  log_fail "Empty agent list handling failed (status: $STATUS, notified: $NOTIFIED)"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="
echo -e "${GREEN}Passed:${NC} $PASSED_TESTS"
echo -e "${RED}Failed:${NC} $FAILED_TESTS"
echo "========================================="

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
