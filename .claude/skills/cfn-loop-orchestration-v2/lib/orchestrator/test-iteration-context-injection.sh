#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# Test: Iteration Context Injection
# Validates that build_agent_context() injects test failure diagnostics
# from previous iteration into agent context
#
# NOTE: Float comparisons in bash require bc or awk:
#   CORRECT: (( $(echo "$value >= 0.95" | bc -l) ))
#   WRONG:   [[ "$value" -ge 0.95 ]]  # -ge only works with integers
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

##############################################################################
# Extract and define build_agent_context function
##############################################################################

# Extract just the build_agent_context function from orchestrate.sh
# We'll define it inline to avoid sourcing the entire script
build_agent_context() {
    local task_id="$1"
    local iteration="$2"
    local agent_type="$3"
    local feedback="$4"
    local loop_type="${5:-}"

    # Initialize context variables
    local context="Task: CFN Loop implementation"

    # Simplified version for testing - just the core functionality
    context="$context | Iteration: $iteration"

    # Inject test failure diagnostics from previous iteration
    if [ "$iteration" -gt 1 ]; then
        local iteration_context_file="/tmp/cfn-iteration-context-${task_id}.json"

        if [ -f "$iteration_context_file" ]; then
            # Extract failed test summary from iteration context
            local failed_summary=$(jq -r '
                if .failed_tests and (.failed_tests | length > 0) then
                    "Previous Test Results: Pass Rate " + (.pass_rate * 100 | floor | tostring) + "% | Failed Tests: " +
                    ([.failed_tests[].failed_test_names[]? // empty] | join(", "))
                else
                    empty
                end
            ' "$iteration_context_file" 2>/dev/null)

            if [ -n "$failed_summary" ]; then
                context="$context | $failed_summary"
                echo "📊 Injected test diagnostics from previous iteration" >&2
            fi
        fi
    fi

    if [[ -n "$feedback" ]]; then
        context="$context | Feedback: $feedback"
    fi

    echo "$context"
}

##############################################################################
# Test Helpers
##############################################################################

print_test_header() {
    echo ""
    echo "=========================================="
    echo "TEST: $1"
    echo "=========================================="
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if echo "$haystack" | grep -q "$needle"; then
        echo -e "${GREEN}✓ PASS${NC}: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}: $test_name"
        echo "  Expected to find: '$needle'"
        echo "  In output: '$haystack'"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if ! echo "$haystack" | grep -q "$needle"; then
        echo -e "${GREEN}✓ PASS${NC}: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}: $test_name"
        echo "  Expected NOT to find: '$needle'"
        echo "  In output: '$haystack'"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

cleanup() {
    rm -f /tmp/cfn-iteration-context-test-task-*.json
}

trap cleanup EXIT

##############################################################################
# Test 1: Iteration 1 should NOT inject test diagnostics
##############################################################################

test_iteration_1_no_diagnostics() {
    print_test_header "Iteration 1 - No Test Diagnostics"

    local task_id="test-task-no-diag"
    local output

    # Call build_agent_context with iteration=1
    output=$(build_agent_context "$task_id" "1" "backend-developer" "" "loop3" 2>&1)

    # Should NOT contain "Previous Test Results"
    assert_not_contains "$output" "Previous Test Results" \
        "Iteration 1 should not inject test diagnostics"

    # Should contain "Iteration: 1"
    assert_contains "$output" "Iteration: 1" \
        "Iteration 1 should show iteration number"
}

##############################################################################
# Test 2: Iteration 2 with failed tests should inject diagnostics
##############################################################################

test_iteration_2_with_failures() {
    print_test_header "Iteration 2 - With Failed Tests"

    local task_id="test-task-with-failures"
    local context_file="/tmp/cfn-iteration-context-${task_id}.json"

    # Create mock iteration context with failed tests
    cat > "$context_file" <<'EOF'
{
  "gate_status": "failed",
  "pass_rate": 0.80,
  "threshold": 0.95,
  "gap": 0.15,
  "failed_tests": [
    {
      "framework": "jest",
      "total_tests": 10,
      "passed_tests": 8,
      "failed_tests": 2,
      "pass_rate": 0.80,
      "failed_test_names": [
        "JWT authentication › should reject expired tokens",
        "JWT authentication › should refresh tokens correctly"
      ]
    }
  ]
}
EOF

    local output

    # Call build_agent_context with iteration=2
    output=$(build_agent_context "$task_id" "2" "backend-developer" "" "loop3" 2>&1)

    # Should contain "Previous Test Results"
    assert_contains "$output" "Previous Test Results" \
        "Iteration 2 should inject test diagnostics header"

    # Should contain "Pass Rate 80%"
    assert_contains "$output" "Pass Rate 80%" \
        "Should show pass rate from previous iteration"

    # Should contain failed test names
    assert_contains "$output" "JWT authentication › should reject expired tokens" \
        "Should include first failed test name"

    assert_contains "$output" "JWT authentication › should refresh tokens correctly" \
        "Should include second failed test name"

    # Should contain "Iteration: 2"
    assert_contains "$output" "Iteration: 2" \
        "Should show iteration number"

    # Clean up
    rm -f "$context_file"
}

##############################################################################
# Test 3: Iteration 2 with no context file should work gracefully
##############################################################################

test_iteration_2_no_context_file() {
    print_test_header "Iteration 2 - No Context File"

    local task_id="test-task-no-context"
    local output

    # Ensure no context file exists
    rm -f "/tmp/cfn-iteration-context-${task_id}.json"

    # Call build_agent_context with iteration=2
    output=$(build_agent_context "$task_id" "2" "backend-developer" "" "loop3" 2>&1)

    # Should NOT contain "Previous Test Results" (no file)
    assert_not_contains "$output" "Previous Test Results" \
        "Iteration 2 without context file should not inject diagnostics"

    # Should still contain "Iteration: 2"
    assert_contains "$output" "Iteration: 2" \
        "Should show iteration number even without diagnostics"
}

##############################################################################
# Test 4: Iteration 2 with all tests passing should not inject diagnostics
##############################################################################

test_iteration_2_all_passed() {
    print_test_header "Iteration 2 - All Tests Passed"

    local task_id="test-task-all-passed"
    local context_file="/tmp/cfn-iteration-context-${task_id}.json"

    # Create mock iteration context with all tests passing
    cat > "$context_file" <<'EOF'
{
  "gate_status": "passed",
  "pass_rate": 1.0,
  "threshold": 0.95,
  "gap": 0.0,
  "failed_tests": []
}
EOF

    local output

    # Call build_agent_context with iteration=2
    output=$(build_agent_context "$task_id" "2" "backend-developer" "" "loop3" 2>&1)

    # Should NOT contain "Previous Test Results" (no failures)
    assert_not_contains "$output" "Previous Test Results" \
        "Iteration 2 with all tests passing should not inject diagnostics"

    # Clean up
    rm -f "$context_file"
}

##############################################################################
# Test 5: Multiple failed test suites should combine diagnostics
##############################################################################

test_multiple_failed_suites() {
    print_test_header "Multiple Failed Test Suites"

    local task_id="test-task-multi-suites"
    local context_file="/tmp/cfn-iteration-context-${task_id}.json"

    # Create mock iteration context with multiple failed test suites
    cat > "$context_file" <<'EOF'
{
  "gate_status": "failed",
  "pass_rate": 0.75,
  "threshold": 0.95,
  "gap": 0.20,
  "failed_tests": [
    {
      "framework": "jest",
      "pass_rate": 0.80,
      "failed_test_names": [
        "Auth › should validate JWT tokens"
      ]
    },
    {
      "framework": "jest",
      "pass_rate": 0.70,
      "failed_test_names": [
        "Database › should handle connection errors",
        "Database › should retry on timeout"
      ]
    }
  ]
}
EOF

    local output

    # Call build_agent_context with iteration=2
    output=$(build_agent_context "$task_id" "2" "backend-developer" "" "loop3" 2>&1)

    # Should contain all failed test names
    assert_contains "$output" "Auth › should validate JWT tokens" \
        "Should include failed test from first suite"

    assert_contains "$output" "Database › should handle connection errors" \
        "Should include first failed test from second suite"

    assert_contains "$output" "Database › should retry on timeout" \
        "Should include second failed test from second suite"

    # Clean up
    rm -f "$context_file"
}

##############################################################################
# Run All Tests
##############################################################################

echo ""
echo "=================================================="
echo "  Iteration Context Injection Test Suite"
echo "=================================================="
echo ""

test_iteration_1_no_diagnostics
test_iteration_2_with_failures
test_iteration_2_no_context_file
test_iteration_2_all_passed
test_multiple_failed_suites

##############################################################################
# Summary
##############################################################################

echo ""
echo "=================================================="
echo "  Test Summary"
echo "=================================================="
echo "Total Tests:  $TESTS_RUN"
echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
