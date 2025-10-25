#!/bin/bash

# Enhanced Test Script for Standardized Error Handling
# Version 2.0 - Comprehensive Error Scenario Testing

# Directories and Script Paths
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ERROR_CAPTURE_SCRIPT="${SCRIPT_DIR}/capture-agent-error.sh"
RETRY_SCRIPT="${SCRIPT_DIR}/should-retry.sh"

# Colored Output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test Utility Functions
assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if [ "$actual" = "$expected" ]; then
        echo -e "${GREEN}✅ $test_name passed${NC}"
        return 0
    else
        echo -e "${RED}❌ $test_name failed${NC}"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        return 1
    }
}

# Error Categorization Tests
test_timeout_error_categorization() {
    local task_id="task-timeout-001"
    local agent_id="agent-timeout"
    local error_output="Operation timed out after 120 seconds"

    local result=$(bash "$ERROR_CAPTURE_SCRIPT" "backend-dev" "$task_id" "$agent_id" 124 "$error_output")
    assert_equals "TIMEOUT" "$result" "Timeout Error Categorization"

    # Check retry recommendation
    local retry_result=$(bash "$RETRY_SCRIPT" "TIMEOUT" "$task_id")
    assert_equals "RETRY_WITH_EXTENDED_TIMEOUT" "$retry_result" "Timeout Retry Recommendation"
}

test_crash_error_categorization() {
    local task_id="task-crash-002"
    local agent_id="agent-crash"
    local error_output="Segmentation fault in module X"

    local result=$(bash "$ERROR_CAPTURE_SCRIPT" "devops" "$task_id" "$agent_id" 139 "$error_output")
    assert_equals "CRASH" "$result" "Crash Error Categorization"

    # Check retry recommendation
    local retry_result=$(bash "$RETRY_SCRIPT" "CRASH" "$task_id")
    assert_equals "RETRY_WITH_ISOLATION" "$retry_result" "Crash Retry Recommendation"
}

test_dependency_failure_categorization() {
    local task_id="task-dep-003"
    local agent_id="agent-dep"
    local error_output="MODULE_NOT_FOUND: react-dom/server"

    local result=$(bash "$ERROR_CAPTURE_SCRIPT" "frontend-dev" "$task_id" "$agent_id" 1 "$error_output")
    assert_equals "DEPENDENCY_FAILURE" "$result" "Dependency Failure Categorization"

    # Check retry recommendation
    local retry_result=$(bash "$RETRY_SCRIPT" "DEPENDENCY_FAILURE" "$task_id")
    assert_equals "RETRY_WITH_DEPENDENCY_RESET" "$retry_result" "Dependency Failure Retry Recommendation"
}

test_no_deliverables_categorization() {
    local task_id="task-nodeliver-004"
    local agent_id="agent-nodeliver"
    local error_output=""

    local result=$(bash "$ERROR_CAPTURE_SCRIPT" "researcher" "$task_id" "$agent_id" 0 "$error_output")
    assert_equals "NO_DELIVERABLES" "$result" "No Deliverables Categorization"

    # Check retry recommendation
    local retry_result=$(bash "$RETRY_SCRIPT" "NO_DELIVERABLES" "$task_id")
    assert_equals "RETRY_WITH_CLARIFICATION" "$retry_result" "No Deliverables Retry Recommendation"
}

test_invalid_output_categorization() {
    local task_id="task-invalid-005"
    local agent_id="agent-invalid"
    local error_output="Unparseable or malformed output"

    local result=$(bash "$ERROR_CAPTURE_SCRIPT" "backend-dev" "$task_id" "$agent_id" 1 "$error_output")
    assert_equals "INVALID_OUTPUT" "$result" "Invalid Output Categorization"

    # Check retry recommendation
    local retry_result=$(bash "$RETRY_SCRIPT" "INVALID_OUTPUT" "$task_id")
    assert_equals "RETRY_WITH_VALIDATION" "$retry_result" "Invalid Output Retry Recommendation"
}

# JSON Error Report Validation Test
test_json_error_report() {
    local task_id="task-json-006"
    local agent_id="agent-json"
    local error_output="Complex error scenario with multiple components"

    local result=$(bash "$ERROR_CAPTURE_SCRIPT" "devops" "$task_id" "$agent_id" 2 "$error_output")
    local json_report=$(bash "$ERROR_CAPTURE_SCRIPT" "devops" "$task_id" "$agent_id" 2 "$error_output" --json)

    # Validate JSON structure (requires jq)
    local json_valid=$(echo "$json_report" | jq empty 2>/dev/null && echo "valid" || echo "invalid")
    assert_equals "valid" "$json_valid" "JSON Error Report Validation"

    # Additional JSON structure checks could be added here
}

# Performance and Edge Case Test
test_error_handling_performance() {
    local start_time=$(date +%s.%N)

    # Run multiple error scenarios quickly
    for _ in {1..10}; do
        bash "$ERROR_CAPTURE_SCRIPT" "backend-dev" "perf-task-$RANDOM" "agent-perf" 1 "Test performance"
    done

    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)

    # Check if total execution time is reasonable (under 2 seconds for 10 runs)
    local max_duration=2.0
    local passed=$(echo "$duration < $max_duration" | bc)

    assert_equals "1" "$passed" "Error Handling Performance Test"
}

# Main Test Runner
run_error_handling_test_suite() {
    echo "Starting Comprehensive Error Handling Test Suite..."

    # Track test results
    local total_tests=6
    local passed_tests=0

    # Run each test and count successes
    test_timeout_error_categorization && ((passed_tests++))
    test_crash_error_categorization && ((passed_tests++))
    test_dependency_failure_categorization && ((passed_tests++))
    test_no_deliverables_categorization && ((passed_tests++))
    test_invalid_output_categorization && ((passed_tests++))
    test_json_error_report && ((passed_tests++))
    test_error_handling_performance && ((passed_tests++))

    local confidence=$(echo "scale=2; ($passed_tests / $total_tests)" | bc)

    echo -e "\n${GREEN}Test Suite Summary:${NC}"
    echo "Total Tests: $total_tests"
    echo "Passed Tests: $passed_tests"
    echo "Confidence: $confidence"

    # Return non-zero if not all tests pass
    [ "$passed_tests" -eq "$total_tests" ]
}

# Execute the test suite
run_error_handling_test_suite
exit_code=$?

exit $exit_code