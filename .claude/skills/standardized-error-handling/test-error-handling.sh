#!/bin/bash

# Test script for standardized error handling

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ERROR_CAPTURE_SCRIPT="${SCRIPT_DIR}/capture-agent-error.sh"

# Test cases
test_timeout_error() {
    local result
    result=$(bash "$ERROR_CAPTURE_SCRIPT" "backend-dev" "task-123" "agent-1" 124 "Operation timed out")
    [ "$result" = "TIMEOUT" ] && echo "✅ Timeout error test passed" || echo "❌ Timeout error test failed"
}

test_dependency_failure() {
    local result
    result=$(bash "$ERROR_CAPTURE_SCRIPT" "frontend-dev" "task-456" "agent-2" 1 "MODULE_NOT_FOUND: missing dependency")
    [ "$result" = "DEPENDENCY_FAILURE" ] && echo "✅ Dependency failure test passed" || echo "❌ Dependency failure test failed"
}

test_crash_error() {
    local result
    result=$(bash "$ERROR_CAPTURE_SCRIPT" "devops" "task-789" "agent-3" 2 "Segmentation fault")
    [ "$result" = "CRASH" ] && echo "✅ Crash error test passed" || echo "❌ Crash error test failed"
}

test_invalid_output() {
    local result
    result=$(bash "$ERROR_CAPTURE_SCRIPT" "researcher" "task-101" "agent-4" 1 "Unparseable output detected")
    [ "$result" = "INVALID_OUTPUT" ] && echo "✅ Invalid output test passed" || echo "❌ Invalid output test failed"
}

test_no_deliverables() {
    local result
    result=$(bash "$ERROR_CAPTURE_SCRIPT" "backend-dev" "task-202" "agent-5" 0 "")
    [ "$result" = "NO_DELIVERABLES" ] && echo "✅ No deliverables test passed" || echo "❌ No deliverables test failed"
}

# Run all tests
echo "Running Standardized Error Handling Tests..."
test_timeout_error
test_dependency_failure
test_crash_error
test_invalid_output
test_no_deliverables

echo "Error Handling Test Suite Complete."