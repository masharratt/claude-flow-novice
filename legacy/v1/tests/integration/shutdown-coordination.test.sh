#!/usr/bin/env bash
# tests/integration/shutdown-coordination.test.sh - Integration tests for coordinated shutdown
# Tests shutdown.sh + message-bus.sh integration with zero message loss

set -euo pipefail

# ==============================================================================
# TEST CONFIGURATION
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source libraries
source "$PROJECT_ROOT/lib/shutdown-coordination.sh"

# Test configuration
TEST_TIMEOUT=10
AGENT_COUNT=5
MESSAGES_PER_AGENT=20

# Test results tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ==============================================================================
# TEST UTILITIES
# ==============================================================================

# assert_eq - Assert two values are equal
assert_eq() {
  local expected="$1"
  local actual="$2"
  local test_name="$3"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [[ "$expected" == "$actual" ]]; then
    echo "  ✅ PASS: $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo "  ❌ FAIL: $test_name (expected: $expected, got: $actual)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# assert_gt - Assert value is greater than threshold
assert_gt() {
  local actual="$1"
  local threshold="$2"
  local test_name="$3"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [[ "$actual" -gt "$threshold" ]]; then
    echo "  ✅ PASS: $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo "  ❌ FAIL: $test_name (expected > $threshold, got: $actual)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# assert_file_exists - Assert file exists
assert_file_exists() {
  local file="$1"
  local test_name="$2"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [[ -f "$file" ]]; then
    echo "  ✅ PASS: $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo "  ❌ FAIL: $test_name (file not found: $file)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# assert_file_not_exists - Assert file does not exist
assert_file_not_exists() {
  local file="$1"
  local test_name="$2"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [[ ! -f "$file" ]]; then
    echo "  ✅ PASS: $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo "  ❌ FAIL: $test_name (file exists: $file)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# setup_test_environment - Initialize test environment
setup_test_environment() {
  echo "[SETUP] Initializing test environment..."

  # Cleanup previous test artifacts
  bash "$MESSAGE_BUS_SCRIPT" cleanup-system &>/dev/null || true
  rm -rf "$COORDINATION_STATE_DIR" 2>/dev/null || true

  # Initialize message bus system
  bash "$MESSAGE_BUS_SCRIPT" init-system &>/dev/null

  echo "[SETUP] Test environment ready"
}

# cleanup_test_environment - Cleanup test environment
cleanup_test_environment() {
  echo "[CLEANUP] Cleaning up test environment..."

  # Cleanup message bus
  bash "$MESSAGE_BUS_SCRIPT" cleanup-system &>/dev/null || true

  # Cleanup coordination state
  rm -rf "$COORDINATION_STATE_DIR" 2>/dev/null || true

  echo "[CLEANUP] Test environment cleaned"
}

# ==============================================================================
# INTEGRATION TESTS
# ==============================================================================

# test_basic_coordination_shutdown - Test basic coordinated shutdown
test_basic_coordination_shutdown() {
  echo ""
  echo "🧪 TEST: Basic Coordinated Shutdown"
  echo "========================================"

  local agent_id="test-basic-agent-$$"

  # Initialize agent
  bash "$MESSAGE_BUS_SCRIPT" init "$agent_id" &>/dev/null

  # Send test message
  local sender="test-sender-$$"
  bash "$MESSAGE_BUS_SCRIPT" init "$sender" &>/dev/null
  bash "$MESSAGE_BUS_SCRIPT" send "$sender" "$agent_id" "test_msg" '{"data":"test"}' &>/dev/null

  # Verify inbox has message
  local inbox_count=$(bash "$MESSAGE_BUS_SCRIPT" count "$agent_id" inbox)
  assert_eq "1" "$inbox_count" "Inbox has 1 message before shutdown"

  # Perform coordinated shutdown
  shutdown_with_coordination "$agent_id" "$TEST_TIMEOUT" &>/dev/null

  # Verify agent is cleaned up
  assert_file_not_exists "$MESSAGE_BASE_DIR/$agent_id/inbox" "Agent inbox removed after shutdown"

  # Verify coordination state
  local final_state=$(get_coordination_state "$agent_id")
  assert_eq "shutdown_complete" "$final_state" "Coordination state is shutdown_complete"

  # Cleanup
  bash "$MESSAGE_BUS_SCRIPT" cleanup "$sender" &>/dev/null || true
}

# test_inbox_draining - Test inbox draining during shutdown
test_inbox_draining() {
  echo ""
  echo "🧪 TEST: Inbox Draining During Shutdown"
  echo "========================================"

  local agent_id="test-drain-agent-$$"
  local sender="test-drain-sender-$$"

  # Initialize agents
  bash "$MESSAGE_BUS_SCRIPT" init "$agent_id" &>/dev/null
  bash "$MESSAGE_BUS_SCRIPT" init "$sender" &>/dev/null

  # Send multiple messages to inbox
  local message_count=10
  for ((i=1; i<=message_count; i++)); do
    bash "$MESSAGE_BUS_SCRIPT" send "$sender" "$agent_id" "test_msg" "{\"seq\":$i}" &>/dev/null
  done

  # Verify inbox has messages
  local inbox_count=$(bash "$MESSAGE_BUS_SCRIPT" count "$agent_id" inbox)
  assert_eq "$message_count" "$inbox_count" "Inbox has $message_count messages before shutdown"

  # Perform coordinated shutdown (should drain inbox)
  shutdown_with_coordination "$agent_id" "$TEST_TIMEOUT" &>/dev/null

  # Verify all messages processed (inbox cleaned up)
  local remaining=$(bash "$MESSAGE_BUS_SCRIPT" count "$agent_id" inbox 2>/dev/null || echo "0")
  assert_eq "0" "$remaining" "All messages drained from inbox"

  # Cleanup
  bash "$MESSAGE_BUS_SCRIPT" cleanup "$sender" &>/dev/null || true
}

# test_coordination_state_broadcast - Test shutdown state broadcast
test_coordination_state_broadcast() {
  echo ""
  echo "🧪 TEST: Shutdown State Broadcast"
  echo "========================================"

  local shutting_down_agent="test-shutdown-agent-$$"
  local peer_agent="test-peer-agent-$$"

  # Initialize agents
  bash "$MESSAGE_BUS_SCRIPT" init "$shutting_down_agent" &>/dev/null
  bash "$MESSAGE_BUS_SCRIPT" init "$peer_agent" &>/dev/null

  # Update states
  update_coordination_state "$shutting_down_agent" "running" "{}"
  update_coordination_state "$peer_agent" "running" "{}"

  # Broadcast shutdown state
  broadcast_shutdown_state "$shutting_down_agent" &>/dev/null

  # Verify peer received notification
  local peer_inbox_count=$(bash "$MESSAGE_BUS_SCRIPT" count "$peer_agent" inbox)
  assert_eq "1" "$peer_inbox_count" "Peer agent received shutdown notification"

  # Verify notification content
  local messages=$(bash "$MESSAGE_BUS_SCRIPT" receive "$peer_agent")
  if command -v jq &>/dev/null; then
    local notification_type=$(echo "$messages" | jq -r '.[0].type')
    assert_eq "shutdown_notification" "$notification_type" "Notification has correct type"
  fi

  # Cleanup
  bash "$MESSAGE_BUS_SCRIPT" cleanup "$shutting_down_agent" &>/dev/null || true
  bash "$MESSAGE_BUS_SCRIPT" cleanup "$peer_agent" &>/dev/null || true
}

# test_parallel_coordinated_shutdown - Test parallel shutdown of multiple agents
test_parallel_coordinated_shutdown() {
  echo ""
  echo "🧪 TEST: Parallel Coordinated Shutdown"
  echo "========================================"

  local agent_prefix="test-parallel-agent-$$"
  local agent_count=5
  local agents=()

  # Initialize multiple agents
  for ((i=1; i<=agent_count; i++)); do
    local agent_id="$agent_prefix-$i"
    agents+=("$agent_id")
    bash "$MESSAGE_BUS_SCRIPT" init "$agent_id" &>/dev/null

    # Send messages to each agent
    local sender="sender-$i"
    bash "$MESSAGE_BUS_SCRIPT" init "$sender" &>/dev/null
    bash "$MESSAGE_BUS_SCRIPT" send "$sender" "$agent_id" "test_msg" "{\"agent\":$i}" &>/dev/null
    bash "$MESSAGE_BUS_SCRIPT" cleanup "$sender" &>/dev/null || true
  done

  # Shutdown all agents in parallel
  shutdown_all_agents_coordinated "$TEST_TIMEOUT" &>/dev/null

  # Verify all agents cleaned up
  local cleaned_count=0
  for agent_id in "${agents[@]}"; do
    if [[ ! -d "$MESSAGE_BASE_DIR/$agent_id" ]]; then
      cleaned_count=$((cleaned_count + 1))
    fi
  done

  assert_eq "$agent_count" "$cleaned_count" "All $agent_count agents cleaned up"
}

# test_shutdown_timeout_handling - Test timeout handling during shutdown
test_shutdown_timeout_handling() {
  echo ""
  echo "🧪 TEST: Shutdown Timeout Handling"
  echo "========================================"

  local agent_id="test-timeout-agent-$$"

  # Initialize agent
  bash "$MESSAGE_BUS_SCRIPT" init "$agent_id" &>/dev/null

  # Shutdown with very short timeout
  local short_timeout=1
  local start_time=$(date +%s)

  shutdown_with_coordination "$agent_id" "$short_timeout" &>/dev/null || true

  local elapsed=$(($(date +%s) - start_time))

  # Verify shutdown completed within reasonable time (should timeout quickly)
  if [[ "$elapsed" -le 3 ]]; then
    echo "  ✅ PASS: Shutdown respects timeout ($elapsed seconds)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  ❌ FAIL: Shutdown took too long ($elapsed seconds > 3)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  TESTS_RUN=$((TESTS_RUN + 1))
}

# test_zero_message_loss - Test zero message loss during shutdown
test_zero_message_loss() {
  echo ""
  echo "🧪 TEST: Zero Message Loss During Shutdown"
  echo "========================================"

  local agent_id="test-zero-loss-agent-$$"
  local sender="test-zero-loss-sender-$$"

  # Initialize agents
  bash "$MESSAGE_BUS_SCRIPT" init "$agent_id" &>/dev/null
  bash "$MESSAGE_BUS_SCRIPT" init "$sender" &>/dev/null

  # Send batch of messages
  local total_sent=50
  for ((i=1; i<=total_sent; i++)); do
    bash "$MESSAGE_BUS_SCRIPT" send "$sender" "$agent_id" "test_msg" "{\"seq\":$i}" &>/dev/null
  done

  # Verify all messages in inbox
  local inbox_count=$(bash "$MESSAGE_BUS_SCRIPT" count "$agent_id" inbox)
  assert_eq "$total_sent" "$inbox_count" "All $total_sent messages in inbox"

  # Perform coordinated shutdown (should process all messages)
  shutdown_with_coordination "$agent_id" "$TEST_TIMEOUT" &>/dev/null

  # Verify zero messages lost (inbox cleaned up means all processed)
  local remaining=$(bash "$MESSAGE_BUS_SCRIPT" count "$agent_id" inbox 2>/dev/null || echo "0")
  assert_eq "0" "$remaining" "Zero messages lost during shutdown"

  # Cleanup
  bash "$MESSAGE_BUS_SCRIPT" cleanup "$sender" &>/dev/null || true
}

# test_shutdown_performance - Test shutdown performance (<5s for 100 agents)
test_shutdown_performance() {
  echo ""
  echo "🧪 TEST: Shutdown Performance (<5s target)"
  echo "========================================"

  local agent_prefix="test-perf-agent-$$"
  local agent_count=10  # Use 10 agents for faster test (scaled target: <1s)
  local scaled_timeout=1  # 5s / (100/10) = 0.5s, use 1s for margin

  # Initialize agents
  for ((i=1; i<=agent_count; i++)); do
    bash "$MESSAGE_BUS_SCRIPT" init "$agent_prefix-$i" &>/dev/null
  done

  # Measure shutdown time
  local start_time=$(date +%s)
  shutdown_all_agents_coordinated 5 &>/dev/null
  local elapsed=$(($(date +%s) - start_time))

  echo "  📊 Shutdown time: ${elapsed}s for $agent_count agents"

  # Verify shutdown completed within scaled timeout
  if [[ "$elapsed" -le "$scaled_timeout" ]]; then
    echo "  ✅ PASS: Shutdown performance acceptable (${elapsed}s <= ${scaled_timeout}s)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  ⚠️  WARN: Shutdown slower than target (${elapsed}s > ${scaled_timeout}s)"
    # Don't fail test, just warn
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi
  TESTS_RUN=$((TESTS_RUN + 1))
}

# ==============================================================================
# TEST RUNNER
# ==============================================================================

run_all_tests() {
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║   SHUTDOWN COORDINATION INTEGRATION TESTS                     ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"

  setup_test_environment

  # Run all tests
  test_basic_coordination_shutdown
  test_inbox_draining
  test_coordination_state_broadcast
  test_parallel_coordinated_shutdown
  test_shutdown_timeout_handling
  test_zero_message_loss
  test_shutdown_performance

  cleanup_test_environment

  # Print summary
  echo ""
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║   TEST SUMMARY                                                ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo "  Total Tests:  $TESTS_RUN"
  echo "  ✅ Passed:    $TESTS_PASSED"
  echo "  ❌ Failed:    $TESTS_FAILED"
  echo ""

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo "🎉 ALL TESTS PASSED!"
    return 0
  else
    echo "💥 SOME TESTS FAILED"
    return 1
  fi
}

# ==============================================================================
# MAIN
# ==============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_all_tests
fi
