#!/usr/bin/env bash
# Integration test for health.sh + message-bus.sh coordination
# Tests distributed health monitoring with message-bus propagation
# Success Criteria:
#   - Health events in message-bus
#   - Coordination state reflects health
#   - Detection time <5s
#   - Zero false positives

set -euo pipefail

# Test configuration
TEST_DIR="/dev/shm/health-messagebus-test-$$"
HEALTH_DIR="$TEST_DIR/health"
MESSAGE_BASE_DIR="$TEST_DIR/messages"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Setup test environment
setup_test_env() {
  mkdir -p "$TEST_DIR"
  export HEALTH_DIR
  export MESSAGE_BASE_DIR
  export HEALTH_MESSAGE_BUS_AVAILABLE=true
  export MESSAGE_BUS_ENABLED=true
  export HEALTH_TIMEOUT=10

  # Source libraries
  source /mnt/c/Users/masha/Documents/claude-flow-novice/tests/cli-coordination/message-bus.sh
  source /mnt/c/Users/masha/Documents/claude-flow-novice/lib/health.sh

  echo "[SETUP] Test environment initialized at $TEST_DIR"
}

# Cleanup test environment
cleanup_test_env() {
  if [[ -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
    echo "[CLEANUP] Test environment cleaned up"
  fi
}

# Test helper: assert equal
assert_equal() {
  local expected="$1"
  local actual="$2"
  local test_name="$3"

  if [[ "$expected" == "$actual" ]]; then
    echo -e "${GREEN}✓${NC} PASS: $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}✗${NC} FAIL: $test_name"
    echo "  Expected: $expected"
    echo "  Actual:   $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# Test helper: assert contains
assert_contains() {
  local haystack="$1"
  local needle="$2"
  local test_name="$3"

  if echo "$haystack" | grep -q "$needle"; then
    echo -e "${GREEN}✓${NC} PASS: $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}✗${NC} FAIL: $test_name"
    echo "  Expected to contain: $needle"
    echo "  Actual: $haystack"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# Test helper: assert less than
assert_less_than() {
  local value="$1"
  local threshold="$2"
  local test_name="$3"

  if [[ "$value" -lt "$threshold" ]]; then
    echo -e "${GREEN}✓${NC} PASS: $test_name (${value} < ${threshold})"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}✗${NC} FAIL: $test_name"
    echo "  Expected: < $threshold"
    echo "  Actual:   $value"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# ==============================================================================
# TEST SUITE 1: Basic Integration
# ==============================================================================

test_health_event_publishing() {
  echo ""
  echo "=== TEST SUITE 1: Health Event Publishing ==="

  # Initialize agents
  init_message_bus "agent-1"
  init_message_bus "health-coordinator"

  # Report health (should trigger message-bus event)
  report_health "agent-1" "healthy" '{"test":"initial"}'

  # Check if health event was published to health-coordinator
  local messages
  messages=$(receive_messages "health-coordinator")
  local event_count=$(echo "$messages" | jq '[.[] | select(.type == "health_event")] | length')

  assert_equal "1" "$event_count" "Health event published to message-bus"

  # Verify event payload
  local event_agent=$(echo "$messages" | jq -r '.[0].payload.agent_id')
  assert_equal "agent-1" "$event_agent" "Health event contains correct agent_id"

  local event_status=$(echo "$messages" | jq -r '.[0].payload.status')
  assert_equal "healthy" "$event_status" "Health event contains correct status"
}

test_health_status_change_detection() {
  echo ""
  echo "=== TEST SUITE 2: Status Change Detection ==="

  # Clear previous messages
  clear_inbox "health-coordinator"

  # Report same status (should NOT trigger new event)
  report_health "agent-1" "healthy" '{"test":"same"}'

  local messages
  messages=$(receive_messages "health-coordinator")
  local event_count=$(echo "$messages" | jq 'length')

  assert_equal "0" "$event_count" "No event for unchanged status"

  # Change status (should trigger event)
  report_health "agent-1" "degraded" '{"test":"changed"}'

  messages=$(receive_messages "health-coordinator")
  event_count=$(echo "$messages" | jq '[.[] | select(.type == "health_event")] | length')

  assert_equal "1" "$event_count" "Event published for status change"

  local new_status=$(echo "$messages" | jq -r '.[0].payload.status')
  assert_equal "degraded" "$new_status" "Status change reflected in event"
}

# ==============================================================================
# TEST SUITE 3: Coordination Topology
# ==============================================================================

test_coordination_topology_update() {
  echo ""
  echo "=== TEST SUITE 3: Coordination Topology Update ==="

  # Initialize multiple agents
  init_message_bus "agent-2"
  init_message_bus "agent-3"

  report_health "agent-2" "healthy" '{"role":"worker"}'
  report_health "agent-3" "unhealthy" '{"role":"worker","error":"timeout"}'

  # Get coordination topology
  local topology
  topology=$(update_coordination_topology json)

  # Verify cluster health summary
  local total_agents=$(echo "$topology" | jq -r '.cluster_health.total')
  assert_equal "3" "$total_agents" "Topology shows all agents"

  local unhealthy_count=$(echo "$topology" | jq -r '.cluster_health.unhealthy')
  assert_equal "1" "$unhealthy_count" "Topology shows unhealthy count"

  # Verify agent details include message-bus status
  local agent3_has_bus=$(echo "$topology" | jq -r '.agents[] | select(.agent_id == "agent-3") | .message_bus_enabled')
  assert_equal "true" "$agent3_has_bus" "Agent topology includes message-bus status"
}

# ==============================================================================
# TEST SUITE 4: Fast Unhealthy Detection
# ==============================================================================

test_fast_unhealthy_detection() {
  echo ""
  echo "=== TEST SUITE 4: Fast Unhealthy Detection (<5s) ==="

  # Report multiple agents with different statuses
  init_message_bus "agent-4"
  init_message_bus "agent-5"
  init_message_bus "agent-6"

  report_health "agent-4" "healthy"
  report_health "agent-5" "degraded"
  report_health "agent-6" "unhealthy"

  # Run fast detection
  local start_ms=$(date +%s%3N)
  local detection_result
  detection_result=$(detect_unhealthy_agents_fast)
  local end_ms=$(date +%s%3N)
  local elapsed_ms=$((end_ms - start_ms))

  # Verify detection time < 5000ms
  assert_less_than "$elapsed_ms" "5000" "Detection completes in <5s"

  # Verify unhealthy agents detected
  local unhealthy_count=$(echo "$detection_result" | jq '.unhealthy_agents | length')
  assert_equal "2" "$unhealthy_count" "Detected 2 unhealthy agents (degraded + unhealthy)"

  # Verify no false positives (agent-4 should NOT be in list)
  local agent4_detected=$(echo "$detection_result" | jq '.unhealthy_agents[] | select(.agent_id == "agent-4") | .agent_id // empty')
  assert_equal "" "$agent4_detected" "No false positives (healthy agent not detected)"
}

# ==============================================================================
# TEST SUITE 5: Liveness Probe Integration
# ==============================================================================

test_liveness_probe_messagebus_init() {
  echo ""
  echo "=== TEST SUITE 5: Liveness Probe Message-Bus Integration ==="

  # Start liveness probe (should auto-initialize message-bus)
  start_liveness_probe "agent-probe" 2

  # Verify message-bus initialized for agent
  local inbox_exists=false
  if [[ -d "$MESSAGE_BASE_DIR/agent-probe/inbox" ]]; then
    inbox_exists=true
  fi

  assert_equal "true" "$inbox_exists" "Liveness probe initializes message-bus inbox"

  # Wait for probe to report health
  sleep 3

  # Check health was reported
  local health_status
  health_status=$(check_agent_health "agent-probe")
  assert_equal "healthy" "$health_status" "Liveness probe reports healthy status"

  # Stop probe
  stop_liveness_probe "agent-probe"
}

# ==============================================================================
# TEST SUITE 6: Topology Broadcasting
# ==============================================================================

test_topology_broadcasting() {
  echo ""
  echo "=== TEST SUITE 6: Topology Broadcasting ==="

  # Clear all inboxes
  clear_inbox "agent-2"
  clear_inbox "agent-3"

  # Publish topology update
  publish_topology_update "health-coordinator"

  # Verify all agents received topology update
  local agent2_messages
  agent2_messages=$(receive_messages "agent-2")
  local topology_msg_count=$(echo "$agent2_messages" | jq '[.[] | select(.type == "topology_update")] | length')

  assert_equal "1" "$topology_msg_count" "Agent-2 received topology update"

  local agent3_messages
  agent3_messages=$(receive_messages "agent-3")
  local topology_msg_count3=$(echo "$agent3_messages" | jq '[.[] | select(.type == "topology_update")] | length')

  assert_equal "1" "$topology_msg_count3" "Agent-3 received topology update"

  # Verify topology payload contains cluster health
  local cluster_health=$(echo "$agent2_messages" | jq '.[0].payload.cluster_health.total')
  assert_contains "$cluster_health" "[0-9]" "Topology update contains cluster health data"
}

# ==============================================================================
# TEST SUITE 7: Subscription Mechanism
# ==============================================================================

test_health_subscription() {
  echo ""
  echo "=== TEST SUITE 7: Health Event Subscription ==="

  # Initialize subscriber agent
  init_message_bus "subscriber-1"

  # Send health events to subscriber
  send_message "agent-1" "subscriber-1" "health_event" '{"event":"health_change","agent_id":"agent-1","status":"healthy"}'
  send_message "agent-3" "subscriber-1" "health_event" '{"event":"health_change","agent_id":"agent-3","status":"unhealthy"}'

  # Subscribe to health updates
  local health_events
  health_events=$(subscribe_health_updates "subscriber-1")

  local event_count=$(echo "$health_events" | jq 'length')
  assert_equal "2" "$event_count" "Subscription retrieves all health events"

  # Verify filtering works (only health_event type)
  local all_health=$(echo "$health_events" | jq '[.[] | select(.type == "health_event")] | length')
  assert_equal "2" "$all_health" "Subscription filters health events correctly"
}

# ==============================================================================
# RUN ALL TESTS
# ==============================================================================

run_all_tests() {
  setup_test_env

  test_health_event_publishing
  test_health_status_change_detection
  test_coordination_topology_update
  test_fast_unhealthy_detection
  test_liveness_probe_messagebus_init
  test_topology_broadcasting
  test_health_subscription

  cleanup_test_env

  echo ""
  echo "============================================================"
  echo "TEST RESULTS"
  echo "============================================================"
  echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
  echo "Total:  $((TESTS_PASSED + TESTS_FAILED))"
  echo "============================================================"

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    return 0
  else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    return 1
  fi
}

# Execute tests
run_all_tests
