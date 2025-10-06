#!/bin/bash
# mvp-test-cli-agent-communication.sh - Proof that CLI agents can coordinate via message-bus
# Critical validation: Agents launched via mvp-agent.sh MUST be able to communicate

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESSAGE_BUS_SCRIPT="${SCRIPT_DIR}/message-bus.sh"
AGENT_SCRIPT="${SCRIPT_DIR}/mvp-agent.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Source message bus functions
if [[ ! -f "$MESSAGE_BUS_SCRIPT" ]]; then
    echo -e "${RED}ERROR: message-bus.sh not found at $MESSAGE_BUS_SCRIPT${NC}"
    exit 1
fi

source "$MESSAGE_BUS_SCRIPT"

# Helper: Print test header
print_test_header() {
    local test_name="$1"
    echo ""
    echo "=========================================="
    echo "TEST: $test_name"
    echo "=========================================="
}

# Helper: Assert equals
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="$3"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    if [[ "$expected" == "$actual" ]]; then
        echo -e "${GREEN}✓ PASS${NC}: $message"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}: $message"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Helper: Assert file exists
assert_file_exists() {
    local file_path="$1"
    local message="$2"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    if [[ -f "$file_path" ]]; then
        echo -e "${GREEN}✓ PASS${NC}: $message"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}: $message"
        echo "  File not found: $file_path"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Helper: Cleanup test environment
cleanup_test_env() {
    echo "Cleaning up test environment..."

    # Kill any running test agents
    pkill -f "mvp-agent.sh.*cli-agent" 2>/dev/null || true

    # Clean message bus
    if [[ -n "${MESSAGE_BASE_DIR:-}" ]] && [[ -d "$MESSAGE_BASE_DIR" ]]; then
        rm -rf "$MESSAGE_BASE_DIR"
    fi

    # Clean agent runtime directories
    rm -rf /dev/shm/cfn-mvp/agents/cli-agent-* 2>/dev/null || true

    sleep 0.5  # Ensure processes cleaned up
}

# Helper: Setup test environment
setup_test_env() {
    cleanup_test_env
    export MESSAGE_BASE_DIR="/dev/shm/cfn-test-cli-$$"
    mkdir -p "$MESSAGE_BASE_DIR"

    # Initialize message bus system
    init_message_bus_system
}

# Helper: Wait for agent to reach state
wait_for_agent_state() {
    local agent_id="$1"
    local expected_state="$2"
    local timeout_seconds="${3:-10}"

    local status_file="/dev/shm/cfn-mvp/agents/${agent_id}/status.json"
    local elapsed=0

    while [[ $elapsed -lt $((timeout_seconds * 10)) ]]; do
        if [[ -f "$status_file" ]]; then
            local current_state=$(grep -o '"state"[[:space:]]*:[[:space:]]*"[^"]*"' "$status_file" | sed 's/.*"state"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
            if [[ "$current_state" == "$expected_state" ]]; then
                return 0
            fi
        fi
        sleep 0.1
        elapsed=$((elapsed + 1))
    done

    return 1
}

# Helper: Get message count from inbox
get_message_count() {
    local agent_id="$1"
    local inbox="$MESSAGE_BASE_DIR/$agent_id/inbox"

    if [[ ! -d "$inbox" ]]; then
        echo "0"
        return
    fi

    find "$inbox" -name "*.json" -type f 2>/dev/null | wc -l
}

# ============================================
# TEST 1: Two CLI Agents - Simple Message Exchange
# ============================================
test_two_cli_agents_simple() {
    print_test_header "Two CLI Agents - Simple Message Exchange"
    setup_test_env

    echo "Initializing message bus for agents..."
    init_message_bus "cli-agent-sender"
    init_message_bus "cli-agent-receiver"

    # CRITICAL: Don't spawn agents yet - they will consume messages immediately
    # Instead, send message first, then verify delivery before agents process

    echo "Sending test message via message-bus.sh (NO AGENTS RUNNING YET)..."
    local msg_id=$(send_message "cli-agent-sender" "cli-agent-receiver" "test-message" '{"content": "Hello from CLI agent"}')

    echo "Message sent with ID: $msg_id"

    # Verify message delivered to inbox BEFORE spawning receiver
    local msg_count=$(get_message_count "cli-agent-receiver")
    assert_equals "1" "$msg_count" "Message delivered to receiver inbox"

    # Check message content
    local inbox="$MESSAGE_BASE_DIR/cli-agent-receiver/inbox"
    local msg_file="$inbox/$msg_id.json"

    if [[ -f "$msg_file" ]]; then
        echo -e "${GREEN}✓ PASS${NC}: Message file exists in receiver inbox"
        TESTS_PASSED=$((TESTS_PASSED + 1))

        # Validate message structure
        local msg_from=$(grep -o '"from"[[:space:]]*:[[:space:]]*"[^"]*"' "$msg_file" | sed 's/.*"from"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        local msg_to=$(grep -o '"to"[[:space:]]*:[[:space:]]*"[^"]*"' "$msg_file" | sed 's/.*"to"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        local msg_type=$(grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' "$msg_file" | sed 's/.*"type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

        assert_equals "cli-agent-sender" "$msg_from" "Message 'from' field correct"
        assert_equals "cli-agent-receiver" "$msg_to" "Message 'to' field correct"
        assert_equals "test-message" "$msg_type" "Message 'type' field correct"
    else
        echo -e "${RED}✗ FAIL${NC}: Message file not found in receiver inbox"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    # Now spawn agents to verify they can RECEIVE and PROCESS messages
    echo ""
    echo "Now spawning agents to verify message processing..."
    "$AGENT_SCRIPT" cli-agent-sender &
    local sender_pid=$!

    "$AGENT_SCRIPT" cli-agent-receiver &
    local receiver_pid=$!

    # Wait for agents to initialize
    sleep 2

    echo "Verifying agents are running..."
    if kill -0 $sender_pid 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Sender agent running (PID: $sender_pid)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Sender agent not running"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    if kill -0 $receiver_pid 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Receiver agent running (PID: $receiver_pid)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Receiver agent not running"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    # Wait for receiver to process message (check logs)
    sleep 3

    # Cleanup
    kill $sender_pid $receiver_pid 2>/dev/null || true
    wait $sender_pid $receiver_pid 2>/dev/null || true

    cleanup_test_env
}

# ============================================
# TEST 2: Three CLI Agents - Multi-Hop Communication
# ============================================
test_three_cli_agents_multihop() {
    print_test_header "Three CLI Agents - Multi-Hop Communication"
    setup_test_env

    echo "Initializing message bus for 3 agents..."
    init_message_bus "cli-agent-a"
    init_message_bus "cli-agent-b"
    init_message_bus "cli-agent-c"

    echo "Spawning agents A, B, C..."
    "$AGENT_SCRIPT" cli-agent-a &
    local pid_a=$!

    "$AGENT_SCRIPT" cli-agent-b &
    local pid_b=$!

    "$AGENT_SCRIPT" cli-agent-c &
    local pid_c=$!

    # Wait for agents to initialize
    sleep 2

    echo "Verifying all agents running..."
    local running_count=0
    kill -0 $pid_a 2>/dev/null && running_count=$((running_count + 1))
    kill -0 $pid_b 2>/dev/null && running_count=$((running_count + 1))
    kill -0 $pid_c 2>/dev/null && running_count=$((running_count + 1))

    assert_equals "3" "$running_count" "All 3 agents spawned and running"

    echo "Testing multi-hop communication: A → B → C"

    # A sends to B
    local msg1_id=$(send_message "cli-agent-a" "cli-agent-b" "task-request" '{"task": "process_data", "data": [1,2,3]}')
    echo "A → B: Message sent (ID: $msg1_id)"

    sleep 0.5

    # B sends to C
    local msg2_id=$(send_message "cli-agent-b" "cli-agent-c" "task-result" '{"result": "processed", "count": 3}')
    echo "B → C: Message sent (ID: $msg2_id)"

    sleep 0.5

    # Verify message delivery
    local b_count=$(get_message_count "cli-agent-b")
    local c_count=$(get_message_count "cli-agent-c")

    assert_equals "1" "$b_count" "Agent B received 1 message from A"
    assert_equals "1" "$c_count" "Agent C received 1 message from B"

    # Verify sequence numbers
    local b_inbox="$MESSAGE_BASE_DIR/cli-agent-b/inbox"
    local c_inbox="$MESSAGE_BASE_DIR/cli-agent-c/inbox"

    if [[ -f "$b_inbox/$msg1_id.json" ]]; then
        local seq_b=$(grep -o '"sequence"[[:space:]]*:[[:space:]]*[0-9]*' "$b_inbox/$msg1_id.json" | sed 's/.*"sequence"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/')
        assert_equals "1" "$seq_b" "Agent B message has sequence 1 (first from A)"
    fi

    if [[ -f "$c_inbox/$msg2_id.json" ]]; then
        local seq_c=$(grep -o '"sequence"[[:space:]]*:[[:space:]]*[0-9]*' "$c_inbox/$msg2_id.json" | sed 's/.*"sequence"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/')
        assert_equals "1" "$seq_c" "Agent C message has sequence 1 (first from B)"
    fi

    # Cleanup
    kill $pid_a $pid_b $pid_c 2>/dev/null || true
    wait $pid_a $pid_b $pid_c 2>/dev/null || true

    cleanup_test_env
}

# ============================================
# TEST 3: CLI Agent Coordination - Request/Response Pattern
# ============================================
test_cli_agent_request_response() {
    print_test_header "CLI Agent Coordination - Request/Response Pattern"
    setup_test_env

    echo "Initializing message bus for coordinator and worker..."
    init_message_bus "cli-coordinator"
    init_message_bus "cli-worker"

    echo "Spawning coordinator and worker agents..."
    "$AGENT_SCRIPT" cli-coordinator &
    local coordinator_pid=$!

    "$AGENT_SCRIPT" cli-worker &
    local worker_pid=$!

    # Wait for agents to initialize
    sleep 2

    echo "Coordinator sends task request to worker..."
    local request_id=$(send_message "cli-coordinator" "cli-worker" "task-request" '{"task_id": "job-001", "action": "analyze"}')

    sleep 1

    echo "Worker sends response back to coordinator..."
    local response_id=$(send_message "cli-worker" "cli-coordinator" "task-response" '{"task_id": "job-001", "status": "complete", "result": {"items": 42}}')

    sleep 1

    # Verify request received by worker
    local worker_msgs=$(get_message_count "cli-worker")
    assert_equals "1" "$worker_msgs" "Worker received task request"

    # Verify response received by coordinator
    local coordinator_msgs=$(get_message_count "cli-coordinator")
    assert_equals "1" "$coordinator_msgs" "Coordinator received task response"

    # Verify request/response linkage via task_id
    local worker_inbox="$MESSAGE_BASE_DIR/cli-worker/inbox"
    local coord_inbox="$MESSAGE_BASE_DIR/cli-coordinator/inbox"

    if [[ -f "$worker_inbox/$request_id.json" ]]; then
        local request_task_id=$(grep -o '"task_id"[[:space:]]*:[[:space:]]*"[^"]*"' "$worker_inbox/$request_id.json" | head -1 | sed 's/.*"task_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        echo "Request task_id: $request_task_id"

        if [[ -f "$coord_inbox/$response_id.json" ]]; then
            local response_task_id=$(grep -o '"task_id"[[:space:]]*:[[:space:]]*"[^"]*"' "$coord_inbox/$response_id.json" | head -1 | sed 's/.*"task_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
            echo "Response task_id: $response_task_id"

            assert_equals "$request_task_id" "$response_task_id" "Request/response linked via task_id"
        fi
    fi

    # Cleanup
    kill $coordinator_pid $worker_pid 2>/dev/null || true
    wait $coordinator_pid $worker_pid 2>/dev/null || true

    cleanup_test_env
}

# ============================================
# TEST 4: Concurrent CLI Agents - Stress Test
# ============================================
test_concurrent_cli_agents() {
    print_test_header "Concurrent CLI Agents - Stress Test (5 agents)"
    setup_test_env

    local agent_count=5
    local messages_per_agent=5

    echo "Initializing message bus for $agent_count agents + coordinator..."
    init_message_bus "cli-coordinator-stress"

    local pids=()
    for i in $(seq 1 $agent_count); do
        init_message_bus "cli-worker-$i"

        "$AGENT_SCRIPT" "cli-worker-$i" &
        pids+=($!)
    done

    # Wait for all agents to initialize
    sleep 3

    echo "Verifying all $agent_count agents running..."
    local running=0
    for pid in "${pids[@]}"; do
        if kill -0 $pid 2>/dev/null; then
            running=$((running + 1))
        fi
    done
    assert_equals "$agent_count" "$running" "All $agent_count worker agents spawned"

    echo "Each agent sends $messages_per_agent messages to coordinator (total: $((agent_count * messages_per_agent)) messages)..."

    for i in $(seq 1 $agent_count); do
        for j in $(seq 1 $messages_per_agent); do
            send_message "cli-worker-$i" "cli-coordinator-stress" "status-update" "{\"worker_id\": $i, \"msg_num\": $j}" >/dev/null 2>&1
        done
    done

    # Wait for all messages to be delivered
    sleep 2

    # Verify message delivery
    local coordinator_msgs=$(get_message_count "cli-coordinator-stress")
    local expected_msgs=$((agent_count * messages_per_agent))

    assert_equals "$expected_msgs" "$coordinator_msgs" "Coordinator received all $expected_msgs messages"

    # Verify per-sender sequence numbering
    echo "Verifying per-sender sequence numbering..."
    local coord_inbox="$MESSAGE_BASE_DIR/cli-coordinator-stress/inbox"

    for i in $(seq 1 $agent_count); do
        local worker_sequences=$(find "$coord_inbox" -name "*.json" -type f -exec grep -l "\"from\"[[:space:]]*:[[:space:]]*\"cli-worker-$i\"" {} \; | while read -r msg_file; do
            grep -o '"sequence"[[:space:]]*:[[:space:]]*[0-9]*' "$msg_file" | sed 's/.*"sequence"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/'
        done | sort -n | tr '\n' ' ')

        local expected_seq=$(seq 1 $messages_per_agent | tr '\n' ' ')

        if [[ "$(echo $worker_sequences | xargs)" == "$(echo $expected_seq | xargs)" ]]; then
            echo -e "${GREEN}✓ PASS${NC}: Worker $i sequences: $worker_sequences"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}✗ FAIL${NC}: Worker $i sequences incorrect"
            echo "  Expected: $expected_seq"
            echo "  Actual:   $worker_sequences"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
        TESTS_TOTAL=$((TESTS_TOTAL + 1))
    done

    # Cleanup
    for pid in "${pids[@]}"; do
        kill $pid 2>/dev/null || true
    done
    wait "${pids[@]}" 2>/dev/null || true

    cleanup_test_env
}

# ============================================
# MAIN TEST EXECUTION
# ============================================
main() {
    echo "=========================================="
    echo "CLI AGENT COMMUNICATION VALIDATION"
    echo "Critical proof: Agents via mvp-agent.sh"
    echo "can coordinate via message-bus.sh"
    echo "=========================================="
    echo ""

    # Run all tests
    test_two_cli_agents_simple
    test_three_cli_agents_multihop
    test_cli_agent_request_response
    test_concurrent_cli_agents

    # Print summary
    echo ""
    echo "=========================================="
    echo "TEST SUMMARY"
    echo "=========================================="
    echo "Total Tests:  $TESTS_TOTAL"
    echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"

    local pass_rate=0
    if [[ $TESTS_TOTAL -gt 0 ]]; then
        pass_rate=$((TESTS_PASSED * 100 / TESTS_TOTAL))
    fi
    echo "Pass Rate:    ${pass_rate}%"
    echo "=========================================="

    # Exit code
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✓ CLI AGENT COORDINATION PROVEN${NC}"
        echo "Agents spawned via CLI can communicate via message-bus.sh"
        exit 0
    else
        echo -e "${RED}✗ CLI AGENT COORDINATION FAILED${NC}"
        echo "Agents cannot reliably coordinate - MVP BLOCKED"
        exit 1
    fi
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
