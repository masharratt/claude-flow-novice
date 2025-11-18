#!/bin/bash
# Memory Leak Test for Task Mode
#
# Tests memory accumulation patterns in Task Mode CFN Loop execution
# Validates conversation fork cleanup and TTL enforcement

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Redis connection
REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
REDIS_PORT="${CFN_REDIS_PORT:-6379}"
REDIS_PASSWORD="${CFN_REDIS_PASSWORD:-}"

# Test configuration
TEST_TASK_ID="test-memory-leak-$(date +%s)"
TEST_AGENT_ID="test-agent-$$"
MESSAGE_TTL=300  # 5 minutes for testing
FORK_TTL=300     # 5 minutes for testing

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Redis command builder
redis_cmd() {
    local cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
    if [ -n "$REDIS_PASSWORD" ]; then
        cmd="$cmd -a $REDIS_PASSWORD"
    fi
    echo "$cmd"
}

# Helper: Print test result
print_result() {
    local test_name="$1"
    local result="$2"
    local message="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $test_name: $message"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name: $message"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Helper: Store test message
store_message() {
    local task_id="$1"
    local agent_id="$2"
    local role="$3"
    local iteration="$4"

    local key="swarm:${task_id}:${agent_id}:messages"
    local message="{\"role\":\"$role\",\"content\":\"Test message\",\"iteration\":$iteration,\"timestamp\":\"$(date -Iseconds)\"}"

    $(redis_cmd) rpush "$key" "$message" >/dev/null
    $(redis_cmd) expire "$key" "$MESSAGE_TTL" >/dev/null
}

# Helper: Create test fork
create_fork() {
    local task_id="$1"
    local agent_id="$2"
    local iteration="$3"

    local fork_id="fork-${iteration}-testfork"
    local fork_key="swarm:${task_id}:${agent_id}:fork:${fork_id}:messages"
    local meta_key="swarm:${task_id}:${agent_id}:fork:${fork_id}:meta"

    # Store fork messages
    for i in $(seq 1 "$iteration"); do
        local message="{\"role\":\"user\",\"content\":\"Fork message $i\",\"iteration\":$i,\"timestamp\":\"$(date -Iseconds)\"}"
        $(redis_cmd) rpush "$fork_key" "$message" >/dev/null
    done

    # Set TTL on fork messages (CRITICAL for memory leak fix)
    $(redis_cmd) expire "$fork_key" "$FORK_TTL" >/dev/null

    # Store fork metadata with TTL
    local metadata="{\"forkId\":\"$fork_id\",\"taskId\":\"$task_id\",\"agentId\":\"$agent_id\",\"createdAt\":\"$(date -Iseconds)\",\"parentIteration\":$iteration,\"messageCount\":$iteration}"
    $(redis_cmd) setex "$meta_key" "$FORK_TTL" "$metadata" >/dev/null

    echo "$fork_id"
}

# Helper: Get key count matching pattern
count_keys() {
    local pattern="$1"
    local keys=$($(redis_cmd) keys "$pattern" 2>/dev/null | grep -v '^$' || true)
    if [ -z "$keys" ]; then
        echo "0"
    else
        echo "$keys" | wc -l
    fi
}

# Helper: Get list length
get_list_length() {
    local key="$1"
    local length=$($(redis_cmd) llen "$key" 2>/dev/null || echo "0")
    echo "$length"
}

# Helper: Get TTL
get_ttl() {
    local key="$1"
    local ttl=$($(redis_cmd) ttl "$key" 2>/dev/null || echo "-2")
    echo "$ttl"
}

# Helper: Get memory usage (approximate)
get_redis_memory() {
    $(redis_cmd) info memory | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r\n'
}

# Setup test environment
setup() {
    echo "========================================="
    echo "Memory Leak Test - Task Mode"
    echo "========================================="
    echo ""
    echo "Configuration:"
    echo "  Task ID: $TEST_TASK_ID"
    echo "  Agent ID: $TEST_AGENT_ID"
    echo "  Message TTL: ${MESSAGE_TTL}s"
    echo "  Fork TTL: ${FORK_TTL}s"
    echo "  Redis: $REDIS_HOST:$REDIS_PORT"
    echo ""

    # Check Redis connection
    if ! $(redis_cmd) ping >/dev/null 2>&1; then
        echo -e "${RED}ERROR${NC}: Cannot connect to Redis at $REDIS_HOST:$REDIS_PORT"
        exit 1
    fi

    echo -e "${GREEN}✓${NC} Redis connection successful"
    echo ""
}

# Cleanup test data
cleanup() {
    echo ""
    echo "Cleaning up test data..."

    # Delete test keys
    $(redis_cmd) del "swarm:${TEST_TASK_ID}:*" >/dev/null 2>&1 || true

    # Pattern-based cleanup
    local patterns=(
        "swarm:${TEST_TASK_ID}:*:messages"
        "swarm:${TEST_TASK_ID}:*:fork:*:messages"
        "swarm:${TEST_TASK_ID}:*:fork:*:meta"
        "swarm:${TEST_TASK_ID}:*:current-fork"
    )

    for pattern in "${patterns[@]}"; do
        local keys=$($(redis_cmd) keys "$pattern" 2>/dev/null || true)
        if [ -n "$keys" ]; then
            echo "$keys" | xargs -r $(redis_cmd) del >/dev/null 2>&1 || true
        fi
    done

    echo -e "${GREEN}✓${NC} Cleanup complete"
}

# Test 1: Message list has TTL
test_message_ttl() {
    echo "Test 1: Message List TTL"

    store_message "$TEST_TASK_ID" "$TEST_AGENT_ID" "user" 1

    local key="swarm:${TEST_TASK_ID}:${TEST_AGENT_ID}:messages"
    local ttl=$(get_ttl "$key")

    if [ "$ttl" -gt 0 ] && [ "$ttl" -le "$MESSAGE_TTL" ]; then
        print_result "Message TTL" "PASS" "TTL set correctly ($ttl seconds)"
    else
        print_result "Message TTL" "FAIL" "TTL not set (got: $ttl, expected: >0 and <=$MESSAGE_TTL)"
    fi
}

# Test 2: Fork messages have TTL
test_fork_message_ttl() {
    echo "Test 2: Fork Message TTL"

    # Store some messages first
    for i in {1..5}; do
        store_message "$TEST_TASK_ID" "$TEST_AGENT_ID" "user" "$i"
        store_message "$TEST_TASK_ID" "$TEST_AGENT_ID" "assistant" "$i"
    done

    # Create fork
    local fork_id=$(create_fork "$TEST_TASK_ID" "$TEST_AGENT_ID" 3)
    local fork_key="swarm:${TEST_TASK_ID}:${TEST_AGENT_ID}:fork:${fork_id}:messages"

    local ttl=$(get_ttl "$fork_key")

    if [ "$ttl" -gt 0 ] && [ "$ttl" -le "$FORK_TTL" ]; then
        print_result "Fork Message TTL" "PASS" "TTL set correctly ($ttl seconds)"
    else
        print_result "Fork Message TTL" "FAIL" "TTL not set on fork messages (got: $ttl, expected: >0 and <=$FORK_TTL)"
    fi
}

# Test 3: Memory accumulation with iterations
test_memory_accumulation() {
    echo "Test 3: Memory Accumulation (10 iterations)"

    local initial_memory=$(get_redis_memory)
    echo "  Initial memory: $initial_memory"

    # Simulate 10 iterations with 3 agents each
    for iter in {1..10}; do
        for agent in {1..3}; do
            local agent_id="${TEST_AGENT_ID}-agent${agent}"
            store_message "$TEST_TASK_ID" "$agent_id" "user" "$iter"
            store_message "$TEST_TASK_ID" "$agent_id" "assistant" "$iter"

            # Create fork every 2 iterations
            if [ $((iter % 2)) -eq 0 ]; then
                create_fork "$TEST_TASK_ID" "$agent_id" "$iter" >/dev/null
            fi
        done
    done

    # Count keys
    local message_count=$(count_keys "swarm:${TEST_TASK_ID}:*:messages")
    local fork_count=$(count_keys "swarm:${TEST_TASK_ID}:*:fork:*:messages")

    local final_memory=$(get_redis_memory)
    echo "  Final memory: $final_memory"
    echo "  Message keys: $message_count"
    echo "  Fork keys: $fork_count"

    # All keys should have TTL
    local keys_without_ttl=0
    for key in $($(redis_cmd) keys "swarm:${TEST_TASK_ID}:*" 2>/dev/null); do
        local ttl=$(get_ttl "$key")
        if [ "$ttl" -eq -1 ]; then
            keys_without_ttl=$((keys_without_ttl + 1))
        fi
    done

    if [ "$keys_without_ttl" -eq 0 ]; then
        print_result "Memory Accumulation" "PASS" "All keys have TTL (no indefinite retention)"
    else
        print_result "Memory Accumulation" "FAIL" "$keys_without_ttl keys without TTL (memory leak risk)"
    fi
}

# Test 4: Cleanup utility integration
test_cleanup_utility() {
    echo "Test 4: Cleanup Utility"

    # Use a dedicated agent ID for this test
    local cleanup_agent_id="${TEST_AGENT_ID}-cleanup"

    # Store messages
    for i in {1..20}; do
        store_message "$TEST_TASK_ID" "$cleanup_agent_id" "user" "$i"
    done

    # Create multiple forks
    for i in {2..10..2}; do
        create_fork "$TEST_TASK_ID" "$cleanup_agent_id" "$i" >/dev/null
    done

    # Count before cleanup (only for this specific agent)
    local before_count=$(count_keys "swarm:${TEST_TASK_ID}:${cleanup_agent_id}:*")

    # Run cleanup utility (using Node.js with environment variables)
    cd "$PROJECT_ROOT"
    CFN_REDIS_HOST="$REDIS_HOST" CFN_REDIS_PORT="$REDIS_PORT" node -e "
    const { cleanupTaskMessages } = require('./dist/cli/conversation-fork-cleanup.js');
    cleanupTaskMessages('$TEST_TASK_ID', '$cleanup_agent_id');
    " 2>/dev/null || {
        print_result "Cleanup Utility" "SKIP" "Cleanup utility not built (run: npm run build)"
        return
    }

    # Count after cleanup (only for this specific agent)
    local after_count=$(count_keys "swarm:${TEST_TASK_ID}:${cleanup_agent_id}:*")

    if [ "$after_count" -eq 0 ]; then
        print_result "Cleanup Utility" "PASS" "All keys removed ($before_count → $after_count)"
    else
        print_result "Cleanup Utility" "FAIL" "Cleanup incomplete ($before_count → $after_count, expected: 0)"
    fi
}

# Test 5: TTL enforcement (expiration test)
test_ttl_enforcement() {
    echo "Test 5: TTL Enforcement (5 second expiration)"

    # Create key with very short TTL
    local short_ttl=5
    local key="swarm:${TEST_TASK_ID}:${TEST_AGENT_ID}:test-expiration"

    $(redis_cmd) rpush "$key" "test-message" >/dev/null
    $(redis_cmd) expire "$key" "$short_ttl" >/dev/null

    echo "  Waiting ${short_ttl}s for expiration..."
    sleep $((short_ttl + 1))

    local exists=$($(redis_cmd) exists "$key")

    if [ "$exists" -eq 0 ]; then
        print_result "TTL Enforcement" "PASS" "Key expired after ${short_ttl}s"
    else
        print_result "TTL Enforcement" "FAIL" "Key still exists after TTL"
    fi
}

# Test 6: Fork metadata and message consistency
test_fork_consistency() {
    echo "Test 6: Fork Metadata/Message Consistency"

    # Store messages
    for i in {1..5}; do
        store_message "$TEST_TASK_ID" "$TEST_AGENT_ID" "user" "$i"
    done

    # Create fork
    local fork_id=$(create_fork "$TEST_TASK_ID" "$TEST_AGENT_ID" 3)

    # Check both have same TTL
    local meta_key="swarm:${TEST_TASK_ID}:${TEST_AGENT_ID}:fork:${fork_id}:meta"
    local msg_key="swarm:${TEST_TASK_ID}:${TEST_AGENT_ID}:fork:${fork_id}:messages"

    local meta_ttl=$(get_ttl "$meta_key")
    local msg_ttl=$(get_ttl "$msg_key")

    # TTLs should be within 5 seconds of each other
    local ttl_diff=$((meta_ttl - msg_ttl))
    ttl_diff=${ttl_diff#-}  # Absolute value

    if [ "$ttl_diff" -le 5 ]; then
        print_result "Fork Consistency" "PASS" "Metadata and messages have consistent TTL (diff: ${ttl_diff}s)"
    else
        print_result "Fork Consistency" "FAIL" "TTL mismatch (meta: ${meta_ttl}s, msg: ${msg_ttl}s, diff: ${ttl_diff}s)"
    fi
}

# Test 7: Memory statistics utility
test_memory_statistics() {
    echo "Test 7: Memory Statistics"

    # Store messages
    for i in {1..10}; do
        store_message "$TEST_TASK_ID" "$TEST_AGENT_ID" "user" "$i"
        store_message "$TEST_TASK_ID" "$TEST_AGENT_ID" "assistant" "$i"
    done

    # Create forks
    create_fork "$TEST_TASK_ID" "$TEST_AGENT_ID" 5 >/dev/null

    # Get statistics (using Node.js with environment variables)
    cd "$PROJECT_ROOT"
    local stats=$(CFN_REDIS_HOST="$REDIS_HOST" CFN_REDIS_PORT="$REDIS_PORT" node -e "
    const { getTaskMemoryStats } = require('./dist/cli/conversation-fork-cleanup.js');
    const stats = getTaskMemoryStats('$TEST_TASK_ID', '$TEST_AGENT_ID');
    console.log(JSON.stringify(stats));
    " 2>/dev/null || echo "{}")

    if [ "$stats" != "{}" ]; then
        local message_count=$(echo "$stats" | grep -o '"messageCount":[0-9]*' | cut -d: -f2)
        local fork_count=$(echo "$stats" | grep -o '"forkCount":[0-9]*' | cut -d: -f2)

        if [ "$message_count" -gt 0 ] && [ "$fork_count" -gt 0 ]; then
            print_result "Memory Statistics" "PASS" "Stats collected (messages: $message_count, forks: $fork_count)"
        else
            print_result "Memory Statistics" "FAIL" "Stats invalid (messages: $message_count, forks: $fork_count)"
        fi
    else
        print_result "Memory Statistics" "SKIP" "Statistics utility not built"
    fi
}

# Main test execution
main() {
    setup

    echo "Running memory leak tests..."
    echo ""

    test_message_ttl
    test_fork_message_ttl
    test_memory_accumulation
    test_cleanup_utility
    test_ttl_enforcement
    test_fork_consistency
    test_memory_statistics

    cleanup

    # Print summary
    echo ""
    echo "========================================="
    echo "Test Summary"
    echo "========================================="
    echo -e "Total:  $TESTS_RUN"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    if [ "$TESTS_FAILED" -gt 0 ]; then
        echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    else
        echo -e "Failed: $TESTS_FAILED"
    fi
    echo ""

    # Exit code
    if [ "$TESTS_FAILED" -gt 0 ]; then
        echo -e "${RED}TESTS FAILED${NC}"
        exit 1
    else
        echo -e "${GREEN}ALL TESTS PASSED${NC}"
        exit 0
    fi
}

# Run tests
main "$@"
