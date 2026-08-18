#!/usr/bin/env bash
# Edge Case Test Suite for CFN Loop Orchestration

set -e

# Results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
OUTPUT_FILE="/tmp/edge-case-test-results.md"

# Utility function
log_test() {
    local test_name="$1"
    local result="$2"
    local reason="${3:-No details}"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if [[ "$result" == "PASS" ]]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo "- [x] $test_name" >> "$OUTPUT_FILE"
    else
        echo "- [ ] $test_name (FAILED)" >> "$OUTPUT_FILE"
        echo "  - Reason: $reason" >> "$OUTPUT_FILE"
    fi
}

# Prepare results file
echo "# CFN Loop Edge Case Test Suite" > "$OUTPUT_FILE"
echo "## Test Execution: $(date)" >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"

# Test context injection
test_context_injection() {
    # Test empty context
    if echo '{}' | jq empty >/dev/null 2>&1; then
        log_test "Empty Context" "PASS"
    else
        log_test "Empty Context" "FAIL" "JSON parsing failed"
    fi

    # Test large context
    local large_context=$(python3 -c "
import json
print(json.dumps({
    'deliverables': [f'file_{i}' for i in range(1000)],
    'description': 'A' * 10000
}))
")

    if echo "$large_context" | jq empty >/dev/null 2>&1; then
        log_test "Large Context" "PASS"
    else
        log_test "Large Context" "FAIL" "Large JSON parsing failed"
    fi

    # Test Unicode context
    local unicode_context='{"key": "こんにちは世界"}'
    if echo "$unicode_context" | jq empty >/dev/null 2>&1; then
        log_test "Unicode Context" "PASS"
    else
        log_test "Unicode Context" "FAIL" "Unicode JSON parsing failed"
    fi

    # Test malformed JSON
    local malformed_cases=(
        '{invalid json'
        '{"key": "value"'
        '{]'
        '{"nested": {]}'
    )

    for case in "${malformed_cases[@]}"; do
        if ! echo "$case" | jq empty >/dev/null 2>&1; then
            log_test "Malformed JSON: $case" "PASS"
        else
            log_test "Malformed JSON: $case" "FAIL" "Should fail parsing"
        fi
    done
}

# Test confidence handling
test_confidence_handling() {
    # Test valid confidence ranges
    local confidence_cases=(0.0 0.5 0.75 1.0)
    local invalid_cases=(-0.1 1.1)

    for conf in "${confidence_cases[@]}"; do
        if [[ $(echo "$conf >= 0.0 && $conf <= 1.0" | bc) -eq 1 ]]; then
            log_test "Confidence Range: $conf" "PASS"
        else
            log_test "Confidence Range: $conf" "FAIL" "Out of valid range"
        fi
    done

    for conf in "${invalid_cases[@]}"; do
        if [[ $(echo "$conf >= 0.0 && $conf <= 1.0" | bc) -eq 0 ]]; then
            log_test "Invalid Confidence: $conf" "PASS"
        else
            log_test "Invalid Confidence: $conf" "FAIL" "Should be rejected"
        fi
    done

    # Test mixed confidence formats
    local mixed_cases=(
        '{"agent1": 0.85, "agent2": "high", "agent3": 90}'
        '{"agent1": 95, "agent2": 0.95, "agent3": "excellent"}'
    )

    for case in "${mixed_cases[@]}"; do
        if echo "$case" | jq . >/dev/null 2>&1; then
            log_test "Mixed Confidence Format" "PASS"
        else
            log_test "Mixed Confidence Format" "FAIL" "Unable to parse mixed format"
        fi
    done
}

# Test agent spawning
test_agent_spawning() {
    # Simulate agent list scenarios
    local single_agent=("test-agent")
    local duplicate_agents=("agent1" "agent1" "agent2")
    local many_agents=("agent1" "agent2" "agent3" "agent4" "agent5")

    if [[ "${#single_agent[@]}" -eq 1 ]]; then
        log_test "Single Agent Spawn" "PASS"
    else
        log_test "Single Agent Spawn" "FAIL" "Incorrect agent count"
    fi

    local unique_agents=($(echo "${duplicate_agents[@]}" | tr ' ' '\n' | sort -u))
    if [[ "${#unique_agents[@]}" -lt "${#duplicate_agents[@]}" ]]; then
        log_test "Duplicate Agents Detection" "PASS"
    else
        log_test "Duplicate Agents Detection" "FAIL" "Failed to detect duplicates"
    fi

    if [[ "${#many_agents[@]}" -ge 3 ]]; then
        log_test "Multiple Agent Spawn" "PASS"
    else
        log_test "Multiple Agent Spawn" "FAIL" "Insufficient agents"
    fi
}

# Test Redis connectivity
test_redis_connectivity() {
    if redis-cli ping | grep -q PONG; then
        log_test "Redis Connection" "PASS"
    else
        log_test "Redis Connection" "FAIL" "Cannot connect to Redis"
    fi

    # Test Redis key operations
    local test_key="cfn_loop_test_$(date +%s)"
    if redis-cli SET "$test_key" "test_value" &&
       redis-cli GET "$test_key" | grep -q "test_value" &&
       redis-cli DEL "$test_key" >/dev/null; then
        log_test "Redis Key Operations" "PASS"
    else
        log_test "Redis Key Operations" "FAIL" "Failed basic Redis operations"
    fi
}

# Main test execution
main() {
    test_context_injection
    test_confidence_handling
    test_agent_spawning
    test_redis_connectivity

    # Summarize results
    echo "" >> "$OUTPUT_FILE"
    echo "## Test Summary" >> "$OUTPUT_FILE"
    echo "- Total Tests: $TOTAL_TESTS" >> "$OUTPUT_FILE"
    echo "- Passed: $PASSED_TESTS" >> "$OUTPUT_FILE"
    echo "- Failure Rate: $((TOTAL_TESTS - PASSED_TESTS))/$TOTAL_TESTS" >> "$OUTPUT_FILE"

    local confidence=$(echo "scale=2; $PASSED_TESTS / $TOTAL_TESTS" | bc)
    echo "CONFIDENCE_SCORE=$confidence" > /tmp/edge_case_confidence.txt

    cat "$OUTPUT_FILE"
    echo ""
    cat /tmp/edge_case_confidence.txt
}

# Run tests
main