#!/bin/bash
# MVP Coordination Test Suite - Sprint 1.3 Loop 3 Iteration 1/10
# Tests agent-to-agent messaging, coordinator status updates, and concurrent messaging

set -euo pipefail

# Source message bus functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/message-bus.sh"

# Configuration
TEST_BASE_DIR="/dev/shm/cfn-mvp-test"
MESSAGE_BASE_DIR="$TEST_BASE_DIR/messages"
STATUS_DIR="$TEST_BASE_DIR/status"
COORDINATOR_DIR="$TEST_BASE_DIR/coordinator"
LOG_FILE="$TEST_BASE_DIR/coordination-test.log"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"
}

# Test framework functions
start_test() {
    local test_name="$1"
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    log_info "Test #$TESTS_TOTAL: $test_name"
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [[ "$expected" == "$actual" ]]; then
        log_success "$message (expected=$expected, actual=$actual)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$message (expected=$expected, actual=$actual)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_greater_than() {
    local threshold="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [[ "$actual" -gt "$threshold" ]]; then
        log_success "$message (threshold=$threshold, actual=$actual)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$message (threshold=$threshold, actual=$actual)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_file_exists() {
    local filepath="$1"
    local message="${2:-File should exist}"

    if [[ -f "$filepath" ]]; then
        log_success "$message (file=$filepath)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$message (file=$filepath not found)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_json_field() {
    local json_file="$1"
    local field_path="$2"
    local expected_value="$3"
    local message="${4:-JSON field mismatch}"

    if ! command -v jq >/dev/null 2>&1; then
        log_warn "jq not available, skipping JSON assertion"
        return 0
    fi

    local actual_value=$(jq -r "$field_path" "$json_file" 2>/dev/null || echo "null")

    if [[ "$actual_value" == "$expected_value" ]]; then
        log_success "$message (field=$field_path, value=$expected_value)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$message (field=$field_path, expected=$expected_value, actual=$actual_value)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Setup test environment
setup_test_env() {
    log_info "Setting up test environment..."

    # Clean up any existing test structure
    if [[ -d "$TEST_BASE_DIR" ]]; then
        rm -rf "$TEST_BASE_DIR"
    fi

    # Create test directories
    mkdir -p "$MESSAGE_BASE_DIR" "$STATUS_DIR" "$COORDINATOR_DIR"
    chmod 755 "$TEST_BASE_DIR" "$MESSAGE_BASE_DIR" "$STATUS_DIR" "$COORDINATOR_DIR"

    # Initialize test log
    touch "$LOG_FILE"
    chmod 644 "$LOG_FILE"

    log_success "Test environment initialized at $TEST_BASE_DIR"
}

# Cleanup test environment
cleanup_test_env() {
    log_info "Cleaning up test environment..."

    if [[ -d "$TEST_BASE_DIR" ]]; then
        rm -rf "$TEST_BASE_DIR"
    fi

    log_success "Test environment cleaned up"
}

# Test 1: 2-Agent Bidirectional Messaging
test_bidirectional_messaging() {
    start_test "2-agent bidirectional messaging"

    local agent1="agent-1"
    local agent2="agent-2"

    # Initialize message buses (suppress logging)
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$agent1" 2>/dev/null
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$agent2" 2>/dev/null

    # Agent-1 sends task-delegation message to Agent-2
    local task_payload='{"task_id":"task-001","action":"run_tests","priority":5}'
    local msg_id=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$agent1" "$agent2" "task-delegation" "$task_payload" 2>&1 | tail -1)

    # Small delay to ensure filesystem sync
    sleep 0.1

    assert_file_exists "$MESSAGE_BASE_DIR/$agent2/inbox/$msg_id.json" "Agent-2 should receive message in inbox"

    # Agent-2 receives message
    local received_msgs=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" receive_messages "$agent2" 2>/dev/null)

    # Count messages (jq-free alternative using grep)
    local msg_count=$(echo "$received_msgs" | grep -c '"msg_id"' || echo "0")

    assert_equals "1" "$msg_count" "Agent-2 should have 1 message in inbox"

    # Agent-2 processes and sends result back to Agent-1
    local result_payload='{"task_id":"task-001","status":"completed","test_results":{"passed":15,"failed":0}}'
    local result_msg_id=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$agent2" "$agent1" "task-result" "$result_payload" 2>&1 | tail -1)

    sleep 0.1

    assert_file_exists "$MESSAGE_BASE_DIR/$agent1/inbox/$result_msg_id.json" "Agent-1 should receive result message"

    # Agent-1 receives result
    local agent1_msgs=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" receive_messages "$agent1" 2>/dev/null)
    local agent1_msg_count=$(echo "$agent1_msgs" | grep -c '"msg_id"' || echo "0")

    assert_equals "1" "$agent1_msg_count" "Agent-1 should have 1 message (result) in inbox"

    # Verify message types (using grep instead of jq)
    local msg_type=$(echo "$received_msgs" | grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    assert_equals "task-delegation" "$msg_type" "Message type should be task-delegation"

    local result_type=$(echo "$agent1_msgs" | grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    assert_equals "task-result" "$result_type" "Result type should be task-result"

    # Cleanup
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" clear_inbox "$agent1" 2>/dev/null
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" clear_inbox "$agent2" 2>/dev/null
}

# Test 2: Agent-Coordinator Status Updates
test_coordinator_status_updates() {
    start_test "Agent-coordinator status updates"

    local agent_id="agent-status-1"
    local coordinator_id="coordinator"

    # Initialize message buses
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$agent_id" 2>/dev/null
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$coordinator_id" 2>/dev/null

    # Agent sends periodic status updates (simulate 5 updates)
    local update_count=5
    for i in $(seq 1 $update_count); do
        local progress=$((i * 20))
        local confidence=$(awk "BEGIN {print 0.5 + (${i} * 0.1)}")
        local status_payload="{\"agent_id\":\"$agent_id\",\"progress\":$progress,\"confidence\":$confidence,\"phase\":\"implementation\"}"

        MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$agent_id" "$coordinator_id" "status-update" "$status_payload" 2>&1 | tail -1

        sleep 0.05  # Simulate periodic updates
    done

    # Coordinator receives status messages
    local coord_msgs=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" receive_messages "$coordinator_id" 2>/dev/null)
    local coord_msg_count=$(echo "$coord_msgs" | grep -c '"msg_id"' || echo "0")

    assert_equals "$update_count" "$coord_msg_count" "Coordinator should receive $update_count status updates"

    # Validate message format (using grep/sed)
    local first_msg_type=$(echo "$coord_msgs" | grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    assert_equals "status-update" "$first_msg_type" "First message should be status-update"

    local first_msg_from=$(echo "$coord_msgs" | grep -o '"from"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"from"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    assert_equals "$agent_id" "$first_msg_from" "Message should be from $agent_id"

    # Validate payload structure (check for progress field)
    if echo "$coord_msgs" | grep -q '"progress"[[:space:]]*:[[:space:]]*[0-9]'; then
        log_success "Status payload contains progress field"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "Status payload missing progress field"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    # Cleanup
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" clear_inbox "$coordinator_id" 2>/dev/null
}

# Test 3: Message Delivery Reliability
test_message_delivery_reliability() {
    start_test "Message delivery reliability (10 messages)"

    local sender="agent-sender"
    local receiver="agent-receiver"

    # Initialize message buses
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$sender" 2>/dev/null
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$receiver" 2>/dev/null

    # Send 10 messages with sequence numbers
    local total_messages=10
    local sent_msg_ids=()

    for i in $(seq 1 $total_messages); do
        local seq_payload="{\"sequence\":$i,\"data\":\"message_$i\"}"
        local msg_id=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$sender" "$receiver" "test-message" "$seq_payload" 2>&1 | tail -1)
        sent_msg_ids+=("$msg_id")
    done

    # Verify all messages delivered
    local received_count=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" message_count "$receiver" "inbox")
    assert_equals "$total_messages" "$received_count" "All 10 messages should be delivered"

    # Verify message order preserved (check sequence numbers using grep)
    local received_msgs=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" receive_messages "$receiver" 2>/dev/null)

    # Extract all sequence numbers
    local sequences=$(echo "$received_msgs" | grep -o '"sequence"[[:space:]]*:[[:space:]]*[0-9]*' | sed 's/.*:[[:space:]]*\([0-9]*\).*/\1/')

    local seq_idx=1
    for seq_num in $sequences; do
        if [[ "$seq_num" == "$seq_idx" ]]; then
            log_success "Message $seq_idx has correct sequence number"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_error "Message $seq_idx sequence mismatch (expected=$seq_idx, actual=$seq_num)"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
        seq_idx=$((seq_idx + 1))
    done

    # Verify no message loss (check sender outbox)
    local outbox_count=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" message_count "$sender" "outbox")
    assert_equals "$total_messages" "$outbox_count" "Sender outbox should contain $total_messages messages"

    # Cleanup
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" clear_inbox "$receiver" 2>/dev/null
}

# Test 4: Concurrent Messaging (3 agents)
test_concurrent_messaging() {
    start_test "Concurrent messaging with 3 agents"

    local agent1="concurrent-agent-1"
    local agent2="concurrent-agent-2"
    local agent3="concurrent-agent-3"

    # Initialize message buses
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$agent1" 2>/dev/null
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$agent2" 2>/dev/null
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$agent3" 2>/dev/null

    # All agents send messages to each other concurrently
    # Agent-1 → Agent-2, Agent-3
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$agent1" "$agent2" "peer-message" '{"from":"agent1","to":"agent2"}' >/dev/null 2>&1 &
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$agent1" "$agent3" "peer-message" '{"from":"agent1","to":"agent3"}' >/dev/null 2>&1 &

    # Agent-2 → Agent-1, Agent-3
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$agent2" "$agent1" "peer-message" '{"from":"agent2","to":"agent1"}' >/dev/null 2>&1 &
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$agent2" "$agent3" "peer-message" '{"from":"agent2","to":"agent3"}' >/dev/null 2>&1 &

    # Agent-3 → Agent-1, Agent-2
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$agent3" "$agent1" "peer-message" '{"from":"agent3","to":"agent1"}' >/dev/null 2>&1 &
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$agent3" "$agent2" "peer-message" '{"from":"agent3","to":"agent2"}' >/dev/null 2>&1 &

    # Wait for all concurrent sends to complete
    wait

    # Verify each agent received 2 messages (from 2 other agents)
    local agent1_count=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" message_count "$agent1" "inbox")
    local agent2_count=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" message_count "$agent2" "inbox")
    local agent3_count=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" message_count "$agent3" "inbox")

    assert_equals "2" "$agent1_count" "Agent-1 should receive 2 messages"
    assert_equals "2" "$agent2_count" "Agent-2 should receive 2 messages"
    assert_equals "2" "$agent3_count" "Agent-3 should receive 2 messages"

    # Verify inbox isolation (Agent-1 messages != Agent-2 messages)
    local agent1_msgs=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" receive_messages "$agent1" 2>/dev/null)
    local agent2_msgs=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" receive_messages "$agent2" 2>/dev/null)

    if [[ "$agent1_msgs" == "$agent2_msgs" ]]; then
        log_error "Inbox isolation violated: Agent-1 and Agent-2 have identical inboxes"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    else
        log_success "Inbox isolation verified: Agents have separate inboxes"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    fi

    # Verify no message corruption (check message IDs are unique using grep)
    local agent1_msg_ids=$(echo "$agent1_msgs" | grep -o '"msg_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"msg_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' | sort)
    local agent1_unique_ids=$(echo "$agent1_msg_ids" | uniq | wc -l)

    if [[ "$agent1_unique_ids" == "2" ]]; then
        log_success "No message ID corruption detected (all unique)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "Message ID corruption: duplicate message IDs found"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    # Cleanup
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" clear_inbox "$agent1" 2>/dev/null
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" clear_inbox "$agent2" 2>/dev/null
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" clear_inbox "$agent3" 2>/dev/null
}

# Test 5: Message Bus System Cleanup
test_message_bus_cleanup() {
    start_test "Message bus system cleanup"

    local cleanup_agent="cleanup-agent-1"
    local target_agent="target-agent"

    # Initialize message buses
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$cleanup_agent" 2>/dev/null
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$target_agent" 2>/dev/null

    # Send some messages
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$cleanup_agent" "$target_agent" "test" '{"test":"data"}' >/dev/null 2>&1

    # Verify agent directory exists
    if [[ -d "$MESSAGE_BASE_DIR/$cleanup_agent" ]]; then
        log_success "Agent message directory exists before cleanup"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "Agent message directory missing"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    # Cleanup agent message bus
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" cleanup_message_bus "$cleanup_agent" 2>/dev/null

    # Verify cleanup
    if [[ ! -d "$MESSAGE_BASE_DIR/$cleanup_agent" ]]; then
        log_success "Agent message directory cleaned up successfully"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "Agent message directory still exists after cleanup"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 6: High-Frequency Messaging Stress Test
test_high_frequency_messaging() {
    start_test "High-frequency messaging stress test (50 messages)"

    local stress_sender="stress-sender"
    local stress_receiver="stress-receiver"

    # Initialize message buses
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$stress_sender" 2>/dev/null
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" init_message_bus "$stress_receiver" 2>/dev/null

    # Send 50 messages rapidly
    local stress_count=50
    local start_time=$(date +%s%N)

    for i in $(seq 1 $stress_count); do
        MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" send_message "$stress_sender" "$stress_receiver" "stress-test" "{\"iteration\":$i}" >/dev/null 2>&1
    done

    local end_time=$(date +%s%N)
    local duration_ns=$((end_time - start_time))
    local duration_ms=$((duration_ns / 1000000))

    # Verify all messages delivered
    local delivered_count=$(MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" message_count "$stress_receiver" "inbox")
    assert_equals "$stress_count" "$delivered_count" "All $stress_count messages delivered under stress"

    # Log performance metrics
    log_info "Stress test performance: $stress_count messages in ${duration_ms}ms ($(awk "BEGIN {print $stress_count / ($duration_ms / 1000)}" 2>/dev/null || echo "N/A") msg/sec)"

    # Cleanup
    MESSAGE_BASE_DIR="$MESSAGE_BASE_DIR" clear_inbox "$stress_receiver" 2>/dev/null
}

# Print test summary
print_test_summary() {
    echo ""
    echo "========================================"
    echo "         TEST SUMMARY"
    echo "========================================"
    echo "Total Tests:    $TESTS_TOTAL"
    echo -e "Tests Passed:   ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed:   ${RED}$TESTS_FAILED${NC}"
    echo "Success Rate:   $(awk "BEGIN {print ($TESTS_PASSED / $TESTS_TOTAL) * 100}" 2>/dev/null || echo "N/A")%"
    echo "========================================"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "All tests passed! ✅"
        return 0
    else
        log_error "$TESTS_FAILED test(s) failed ❌"
        return 1
    fi
}

# Main test execution
main() {
    echo "========================================"
    echo "   CFN MVP Coordination Test Suite"
    echo "   Sprint 1.3 - Loop 3 Iteration 1/10"
    echo "========================================"
    echo ""

    # Setup
    setup_test_env

    # Run tests
    test_bidirectional_messaging
    echo ""

    test_coordinator_status_updates
    echo ""

    test_message_delivery_reliability
    echo ""

    test_concurrent_messaging
    echo ""

    test_message_bus_cleanup
    echo ""

    test_high_frequency_messaging
    echo ""

    # Summary
    print_test_summary
    local exit_code=$?

    # Cleanup
    cleanup_test_env

    echo ""
    log_info "Test log saved to: $LOG_FILE"

    exit $exit_code
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
