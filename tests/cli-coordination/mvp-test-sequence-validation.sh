#!/bin/bash
# mvp-test-sequence-validation.sh - Sequence numbering validation test suite
# Sprint 1.6 - Loop 3 Iteration 1/10
# Validates message-bus.sh sequence counter implementation

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESSAGE_BUS_SCRIPT="${SCRIPT_DIR}/message-bus.sh"

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
    if [[ -n "${MESSAGE_BASE_DIR:-}" ]] && [[ -d "$MESSAGE_BASE_DIR" ]]; then
        rm -rf "$MESSAGE_BASE_DIR"
    fi
}

# Helper: Setup test environment
setup_test_env() {
    cleanup_test_env
    export MESSAGE_BASE_DIR="/tmp/cfn-sequence-test-$$"
    mkdir -p "$MESSAGE_BASE_DIR"
}

# Helper: Get sequence from file
get_sequence_number() {
    local message_file="$1"
    grep -o '"sequence"[[:space:]]*:[[:space:]]*[0-9]*' "$message_file" | sed 's/.*:[ ]*\([0-9]*\).*/\1/'
}

# Helper: Get all sequences for recipient
get_all_sequences() {
    local recipient="$1"
    local inbox="${MESSAGE_BASE_DIR}/${recipient}/inbox"

    if [[ ! -d "$inbox" ]]; then
        echo ""
        return
    fi

    find "$inbox" -name "*.json" -type f | while read -r msg_file; do
        get_sequence_number "$msg_file"
    done | sort -n
}

# ============================================
# TEST 1: Sequence Counter Initialization
# ============================================
test_sequence_initialization() {
    print_test_header "Sequence Counter Initialization"
    setup_test_env

    # Initialize agents
    init_message_bus "agent-A"
    init_message_bus "agent-B"

    # Send first message
    send_message "agent-A" "agent-B" "test-message" '{"data": "first"}'

    # Check sequence file exists and contains 1
    local seq_file="${MESSAGE_BASE_DIR}/agent-A/.sequences/agent-B"
    assert_file_exists "$seq_file" "Sequence file created for agent-B"

    if [[ -f "$seq_file" ]]; then
        local sequence=$(cat "$seq_file")
        assert_equals "1" "$sequence" "First sequence number is 1"
    fi

    # Check message file has sequence: 1
    local msg_files=("${MESSAGE_BASE_DIR}/agent-B/inbox"/*.json)
    if [[ -f "${msg_files[0]}" ]]; then
        local msg_seq=$(get_sequence_number "${msg_files[0]}")
        assert_equals "1" "$msg_seq" "Message contains sequence number 1"
    else
        echo -e "${RED}✗ FAIL${NC}: No message file found in inbox"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        TESTS_TOTAL=$((TESTS_TOTAL + 1))
    fi

    cleanup_test_env
}

# ============================================
# TEST 2: Monotonic Sequence Increment
# ============================================
test_monotonic_increment() {
    print_test_header "Monotonic Sequence Increment"
    setup_test_env

    init_message_bus "agent-A"
    init_message_bus "agent-B"

    # Send 20 messages
    echo "Sending 20 messages..."
    for i in {1..20}; do
        send_message "agent-A" "agent-B" "test-msg-$i" "{\"msg\": $i}" >/dev/null 2>&1
    done

    # Get all sequences
    local sequences=$(get_all_sequences "agent-B")
    local sequence_array=($sequences)

    # Verify count
    assert_equals "20" "${#sequence_array[@]}" "20 messages received"

    # Verify sequences are 1-20 with no gaps
    local expected=$(seq 1 20 | tr '\n' ' ' | sed 's/ $//')
    local actual=$(echo "${sequence_array[@]}")
    assert_equals "$expected" "$actual" "Sequences are 1-20 with no gaps or duplicates"

    # Verify monotonic increment
    local prev=0
    local monotonic=true
    for seq in "${sequence_array[@]}"; do
        if [[ $seq -le $prev ]]; then
            monotonic=false
            break
        fi
        prev=$seq
    done

    if $monotonic; then
        echo -e "${GREEN}✓ PASS${NC}: Sequences are strictly monotonic increasing"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗ FAIL${NC}: Sequences are not monotonic increasing"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    cleanup_test_env
}

# ============================================
# TEST 3: Per-Recipient Sequence Tracking
# ============================================
test_per_recipient_sequences() {
    print_test_header "Per-Recipient Sequence Tracking"
    setup_test_env

    init_message_bus "agent-A"
    init_message_bus "agent-B"
    init_message_bus "agent-C"

    # Agent-A sends 5 messages to agent-B
    echo "Sending 5 messages to agent-B..."
    for i in {1..5}; do
        send_message "agent-A" "agent-B" "msg-b-$i" "{\"to\": \"B\", \"num\": $i}" >/dev/null 2>&1
    done

    # Agent-A sends 5 messages to agent-C
    echo "Sending 5 messages to agent-C..."
    for i in {1..5}; do
        send_message "agent-A" "agent-C" "msg-c-$i" "{\"to\": \"C\", \"num\": $i}" >/dev/null 2>&1
    done

    # Get sequences for each recipient
    local seq_b=$(get_all_sequences "agent-B")
    local seq_c=$(get_all_sequences "agent-C")

    local seq_b_array=($seq_b)
    local seq_c_array=($seq_c)

    # Verify agent-B sequences
    local expected_b=$(seq 1 5 | tr '\n' ' ' | sed 's/ $//')
    local actual_b=$(echo "${seq_b_array[@]}")
    assert_equals "$expected_b" "$actual_b" "Agent-B sequences are 1-5"

    # Verify agent-C sequences
    local expected_c=$(seq 1 5 | tr '\n' ' ' | sed 's/ $//')
    local actual_c=$(echo "${seq_c_array[@]}")
    assert_equals "$expected_c" "$actual_c" "Agent-C sequences are 1-5 (independent counter)"

    # Verify sequence files
    local seq_file_b="${MESSAGE_BASE_DIR}/agent-A/.sequences/agent-B"
    local seq_file_c="${MESSAGE_BASE_DIR}/agent-A/.sequences/agent-C"

    if [[ -f "$seq_file_b" ]] && [[ -f "$seq_file_c" ]]; then
        local stored_seq_b=$(cat "$seq_file_b")
        local stored_seq_c=$(cat "$seq_file_c")

        assert_equals "5" "$stored_seq_b" "Agent-B sequence counter is 5"
        assert_equals "5" "$stored_seq_c" "Agent-C sequence counter is 5"
    fi

    cleanup_test_env
}

# ============================================
# TEST 4: Concurrent Sequence Generation (Per-Sender Isolation)
# ============================================
test_concurrent_sequences() {
    print_test_header "Concurrent Sequence Generation (Per-Sender Isolation)"
    setup_test_env

    init_message_bus "agent-1"
    init_message_bus "agent-2"
    init_message_bus "agent-3"
    init_message_bus "coordinator"

    echo "Spawning 3 agents sending 10 messages each concurrently..."

    # Spawn 3 concurrent senders
    (
        for i in {1..10}; do
            send_message "agent-1" "coordinator" "msg-1-$i" "{\"agent\": 1, \"num\": $i}" >/dev/null 2>&1
        done
    ) &

    (
        for i in {1..10}; do
            send_message "agent-2" "coordinator" "msg-2-$i" "{\"agent\": 2, \"num\": $i}" >/dev/null 2>&1
        done
    ) &

    (
        for i in {1..10}; do
            send_message "agent-3" "coordinator" "msg-3-$i" "{\"agent\": 3, \"num\": $i}" >/dev/null 2>&1
        done
    ) &

    # Wait for all background jobs
    wait

    # Get all sequences
    local sequences=$(get_all_sequences "coordinator")
    local sequence_array=($sequences)

    # Verify count (should be 30 total)
    local count="${#sequence_array[@]}"
    assert_equals "30" "$count" "30 total messages received from 3 agents"

    # CORRECT EXPECTATION: Sequences are per-sender, so we expect THREE sequences of 1-10
    # Each agent (agent-1, agent-2, agent-3) maintains its own sequence counter to coordinator
    # So we expect: 1,1,1, 2,2,2, 3,3,3, ..., 10,10,10
    local sorted_sequences=$(echo "${sequence_array[@]}" | tr ' ' '\n' | sort -n | tr '\n' ' ' | sed 's/ $//')

    # Build expected: three copies of 1-10 sorted
    local expected=$(for i in {1..10}; do echo "$i $i $i"; done | tr '\n' ' ' | sed 's/ $//')

    assert_equals "$expected" "$sorted_sequences" "Per-sender sequences: 3 agents each with 1-10"

    # Verify each sender's sequence files contain 10
    local seq_file_1="${MESSAGE_BASE_DIR}/agent-1/.sequences/coordinator"
    local seq_file_2="${MESSAGE_BASE_DIR}/agent-2/.sequences/coordinator"
    local seq_file_3="${MESSAGE_BASE_DIR}/agent-3/.sequences/coordinator"

    if [[ -f "$seq_file_1" ]] && [[ -f "$seq_file_2" ]] && [[ -f "$seq_file_3" ]]; then
        local seq_1=$(cat "$seq_file_1")
        local seq_2=$(cat "$seq_file_2")
        local seq_3=$(cat "$seq_file_3")

        assert_equals "10" "$seq_1" "Agent-1 sequence counter is 10"
        assert_equals "10" "$seq_2" "Agent-2 sequence counter is 10"
        assert_equals "10" "$seq_3" "Agent-3 sequence counter is 10"
    fi

    cleanup_test_env
}

# ============================================
# TEST 5: Sequence Ordering Validation
# ============================================
test_sequence_ordering() {
    print_test_header "Sequence Ordering Validation"
    setup_test_env

    init_message_bus "sender"
    init_message_bus "receiver"

    echo "Sending 50 messages rapidly (stress test)..."

    # Send 50 messages as fast as possible
    for i in {1..50}; do
        send_message "sender" "receiver" "rapid-msg-$i" "{\"num\": $i}" >/dev/null 2>&1
    done

    # Use receive_messages to get ordered messages
    local inbox="${MESSAGE_BASE_DIR}/receiver/inbox"
    local ordered_messages=$(find "$inbox" -name "*.json" -type f -exec cat {} \; | \
        jq -s 'sort_by(.timestamp, .sequence)' 2>/dev/null)

    if [[ -n "$ordered_messages" ]]; then
        # Extract sequences from ordered messages
        local ordered_sequences=$(echo "$ordered_messages" | jq -r '.[].sequence' | tr '\n' ' ' | sed 's/ $//')
        local ordered_array=($ordered_sequences)

        # Verify sequences are in order 1-50
        local expected=$(seq 1 50 | tr '\n' ' ' | sed 's/ $//')
        local actual=$(echo "${ordered_array[@]}")
        assert_equals "$expected" "$actual" "Messages ordered correctly by timestamp+sequence"

        # Verify no out-of-order delivery
        local prev=0
        local in_order=true
        for seq in "${ordered_array[@]}"; do
            if [[ $seq -le $prev ]]; then
                in_order=false
                break
            fi
            prev=$seq
        done

        if $in_order; then
            echo -e "${GREEN}✓ PASS${NC}: No out-of-order message delivery"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}✗ FAIL${NC}: Out-of-order message delivery detected"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
        TESTS_TOTAL=$((TESTS_TOTAL + 1))
    else
        echo -e "${YELLOW}⚠ SKIP${NC}: Unable to parse messages with jq"
    fi

    cleanup_test_env
}

# ============================================
# MAIN TEST EXECUTION
# ============================================
main() {
    echo "=========================================="
    echo "SEQUENCE NUMBERING VALIDATION TEST SUITE"
    echo "Sprint 1.6 - Loop 3 Iteration 1/10"
    echo "=========================================="
    echo ""

    # Run all tests
    test_sequence_initialization
    test_monotonic_increment
    test_per_recipient_sequences
    test_concurrent_sequences
    test_sequence_ordering

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
        echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
        exit 0
    else
        echo -e "${RED}✗ SOME TESTS FAILED${NC}"
        exit 1
    fi
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
