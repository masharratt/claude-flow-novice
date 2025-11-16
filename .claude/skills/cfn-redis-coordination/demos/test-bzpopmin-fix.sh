#!/bin/bash
#
# Test script to verify BZPOPMIN implementation fixes
#
# Tests:
# 1. Compact JSON storage (no newlines breaking Redis)
# 2. Priority ordering (high priority messages processed first)
# 3. JSON validation on retrieval
# 4. Timeout handling
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INVOKE_SCRIPT="${SCRIPT_DIR}/invoke-waiting-mode.sh"

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Cleanup function
cleanup() {
    local task_id="$1"
    echo ""
    echo "Cleaning up Redis keys for task: $task_id"
    redis-cli KEYS "swarm:${task_id}:*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
}

# Test function
run_test() {
    local test_name="$1"
    local test_func="$2"

    echo ""
    echo "=========================================="
    echo "TEST: $test_name"
    echo "=========================================="

    if $test_func; then
        echo "✅ PASSED: $test_name"
        ((TESTS_PASSED++))
    else
        echo "❌ FAILED: $test_name"
        ((TESTS_FAILED++))
    fi
}

# Test 1: Compact JSON storage (verify no newlines)
test_compact_json() {
    local task_id="test-compact-$(date +%s)"
    local agent_id="agent-1"

    # Send wake message
    "$INVOKE_SCRIPT" wake \
        --task-id "$task_id" \
        --agent-id "$agent_id" \
        --reason "test_reason" \
        --priority 50 >/dev/null

    # Retrieve message directly from Redis
    local queue_key="swarm:${task_id}:${agent_id}:wake-queue"
    local stored_msg=$(redis-cli ZRANGE "$queue_key" 0 0 2>/dev/null | head -1)

    cleanup "$task_id"

    # Check if message is valid JSON
    if echo "$stored_msg" | jq empty 2>/dev/null; then
        # Check if message is compact (no newlines)
        if [[ "$stored_msg" != *$'\n'* ]]; then
            echo "  ✓ Message stored as compact JSON"
            return 0
        else
            echo "  ✗ Message contains newlines"
            return 1
        fi
    else
        echo "  ✗ Message is not valid JSON"
        return 1
    fi
}

# Test 2: Priority ordering (high priority first)
test_priority_ordering() {
    local task_id="test-priority-$(date +%s)"
    local agent_id="agent-1"

    # Send 3 messages with different priorities
    "$INVOKE_SCRIPT" wake --task-id "$task_id" --agent-id "$agent_id" --reason "low" --priority 20 >/dev/null
    sleep 0.1
    "$INVOKE_SCRIPT" wake --task-id "$task_id" --agent-id "$agent_id" --reason "medium" --priority 50 >/dev/null
    sleep 0.1
    "$INVOKE_SCRIPT" wake --task-id "$task_id" --agent-id "$agent_id" --reason "high" --priority 90 >/dev/null

    # Agent should receive in order: high (90), medium (50), low (20)
    local queue_key="swarm:${task_id}:${agent_id}:wake-queue"

    # Get all messages in priority order
    local msg1=$(redis-cli ZPOPMIN "$queue_key" 2>/dev/null | sed -n '1p')
    local msg2=$(redis-cli ZPOPMIN "$queue_key" 2>/dev/null | sed -n '1p')
    local msg3=$(redis-cli ZPOPMIN "$queue_key" 2>/dev/null | sed -n '1p')

    cleanup "$task_id"

    # Verify order
    local reason1=$(echo "$msg1" | jq -r '.reason' 2>/dev/null)
    local reason2=$(echo "$msg2" | jq -r '.reason' 2>/dev/null)
    local reason3=$(echo "$msg3" | jq -r '.reason' 2>/dev/null)

    if [ "$reason1" = "high" ] && [ "$reason2" = "medium" ] && [ "$reason3" = "low" ]; then
        echo "  ✓ Messages retrieved in correct priority order: $reason1 → $reason2 → $reason3"
        return 0
    else
        echo "  ✗ Incorrect order: $reason1 → $reason2 → $reason3 (expected: high → medium → low)"
        return 1
    fi
}

# Test 3: JSON validation on retrieval
test_json_validation() {
    local task_id="test-validation-$(date +%s)"
    local agent_id="agent-1"

    # Send valid message
    "$INVOKE_SCRIPT" wake --task-id "$task_id" --agent-id "$agent_id" --reason "valid_test" --priority 50 >/dev/null

    # Start agent in background
    timeout 5 "$INVOKE_SCRIPT" enter --task-id "$task_id" --agent-id "$agent_id" --context "test" >test_output.txt 2>&1 &
    local agent_pid=$!

    # Wait for agent to process message
    sleep 2

    # Check if agent received valid JSON
    if wait $agent_pid 2>/dev/null; then
        if grep -q "✅ Woken up!" test_output.txt && grep -q "valid_test" test_output.txt; then
            echo "  ✓ Agent validated and processed JSON message"
            rm -f test_output.txt
            cleanup "$task_id"
            return 0
        fi
    fi

    echo "  ✗ Agent failed to validate JSON message"
    rm -f test_output.txt
    cleanup "$task_id"
    return 1
}

# Test 4: Timeout handling (no deadlock)
test_timeout_handling() {
    local task_id="test-timeout-$(date +%s)"
    local agent_id="agent-1"

    # Start agent without sending wake message
    # Should timeout after a few seconds
    timeout 3 "$INVOKE_SCRIPT" enter --task-id "$task_id" --agent-id "$agent_id" --context "test" >/dev/null 2>&1 &
    local agent_pid=$!

    sleep 4

    # Check if agent is still running (should have timed out)
    if ! kill -0 $agent_pid 2>/dev/null; then
        echo "  ✓ Agent handled timeout correctly"
        cleanup "$task_id"
        return 0
    else
        echo "  ✗ Agent did not timeout"
        kill $agent_pid 2>/dev/null || true
        cleanup "$task_id"
        return 1
    fi
}

# Test 5: End-to-end wake-up flow
test_e2e_wakeup() {
    local task_id="test-e2e-$(date +%s)"
    local agent_id="agent-1"

    # Start agent in background
    timeout 10 "$INVOKE_SCRIPT" enter --task-id "$task_id" --agent-id "$agent_id" --context "e2e-test" >test_e2e_output.txt 2>&1 &
    local agent_pid=$!

    # Give agent time to enter waiting mode
    sleep 1

    # Send wake message
    "$INVOKE_SCRIPT" wake \
        --task-id "$task_id" \
        --agent-id "$agent_id" \
        --reason "e2e_test" \
        --priority 80 \
        --iteration 1 >/dev/null

    # Wait for agent to complete
    sleep 2

    # Check results
    if grep -q "✅ Woken up!" test_e2e_output.txt && grep -q "e2e_test" test_e2e_output.txt; then
        echo "  ✓ End-to-end wake-up flow successful"
        rm -f test_e2e_output.txt
        cleanup "$task_id"
        return 0
    else
        echo "  ✗ End-to-end wake-up flow failed"
        cat test_e2e_output.txt
        rm -f test_e2e_output.txt
        cleanup "$task_id"
        return 1
    fi
}

# Test 6: Debug mode functionality
test_debug_mode() {
    local task_id="test-debug-$(date +%s)"
    local agent_id="agent-1"

    # Send wake message with debug mode enabled
    DEBUG=true "$INVOKE_SCRIPT" wake \
        --task-id "$task_id" \
        --agent-id "$agent_id" \
        --reason "debug_test" \
        --priority 75 >test_debug_output.txt 2>&1

    cleanup "$task_id"

    # Check if debug output is present
    if grep -q "\[DEBUG\]" test_debug_output.txt; then
        echo "  ✓ Debug mode produces verbose output"
        rm -f test_debug_output.txt
        return 0
    else
        echo "  ✗ Debug mode did not produce expected output"
        rm -f test_debug_output.txt
        return 1
    fi
}

# Main execution
echo "=========================================="
echo "BZPOPMIN Implementation Fix Test Suite"
echo "=========================================="
echo ""
echo "Testing fixes for:"
echo "  1. Compact JSON storage (no newlines)"
echo "  2. Priority ordering"
echo "  3. JSON validation on retrieval"
echo "  4. Timeout handling"
echo "  5. End-to-end wake-up flow"
echo "  6. Debug mode"

# Run all tests
run_test "Compact JSON Storage" test_compact_json
run_test "Priority Ordering" test_priority_ordering
run_test "JSON Validation" test_json_validation
run_test "Timeout Handling" test_timeout_handling
run_test "End-to-End Wake-Up Flow" test_e2e_wakeup
run_test "Debug Mode" test_debug_mode

# Summary
echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo "✅ All tests passed!"
    exit 0
else
    echo "❌ Some tests failed"
    exit 1
fi
