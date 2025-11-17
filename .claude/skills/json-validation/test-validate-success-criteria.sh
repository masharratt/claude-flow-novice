#!/usr/bin/env bash
#
# Test Suite for JSON Validation Skill
# Validates defensive parsing, security features, and helper functions
#
# Usage:
#   ./.claude/skills/json-validation/test-validate-success-criteria.sh
#
# Exit Codes:
#   0 - All tests passed
#   1 - One or more tests failed

set -euo pipefail

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Source the skill
SKILL_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/validate-success-criteria.sh"
source "$SKILL_PATH"

# Test helper functions
assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [[ "$expected" == "$actual" ]]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo -e "${GREEN}✓${NC} $test_name"
        return 0
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo -e "${RED}✗${NC} $test_name"
        echo -e "  Expected: ${YELLOW}$expected${NC}"
        echo -e "  Actual:   ${YELLOW}$actual${NC}"
        return 1
    fi
}

assert_exit_code() {
    local expected_code="$1"
    local test_name="$2"
    shift 2
    local actual_code=0

    TESTS_RUN=$((TESTS_RUN + 1))

    # Run command and capture exit code
    "$@" >/dev/null 2>&1 || actual_code=$?

    if [[ "$expected_code" -eq "$actual_code" ]]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo -e "${GREEN}✓${NC} $test_name"
        return 0
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo -e "${RED}✗${NC} $test_name"
        echo -e "  Expected exit code: ${YELLOW}$expected_code${NC}"
        echo -e "  Actual exit code:   ${YELLOW}$actual_code${NC}"
        return 1
    fi
}

assert_non_empty() {
    local value="$1"
    local test_name="$2"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [[ -n "$value" ]]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo -e "${GREEN}✓${NC} $test_name"
        return 0
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo -e "${RED}✗${NC} $test_name"
        echo -e "  Expected non-empty value"
        return 1
    fi
}

# Test suite separator
test_suite() {
    echo ""
    echo "=== $1 ==="
}

# Cleanup function
cleanup() {
    unset AGENT_SUCCESS_CRITERIA
    unset CRITERIA
    unset TEST_SUITES
}

# Run tests
echo "JSON Validation Skill Test Suite"
echo "=================================="

# Test 1: Valid JSON parsing
test_suite "Test 1: Valid JSON Parsing"

export AGENT_SUCCESS_CRITERIA='{
  "test_suites": [
    {
      "name": "unit-tests",
      "command": "npm test",
      "pass_threshold": 0.95
    }
  ]
}'

assert_exit_code 0 "validate_success_criteria returns 0 for valid JSON" validate_success_criteria
assert_non_empty "$CRITERIA" "CRITERIA is exported and non-empty"
assert_non_empty "$TEST_SUITES" "TEST_SUITES is exported and non-empty"

cleanup

# Test 2: Invalid JSON rejection
test_suite "Test 2: Invalid JSON Rejection"

export AGENT_SUCCESS_CRITERIA='{"invalid": json}'

assert_exit_code 1 "validate_success_criteria returns 1 for invalid JSON" validate_success_criteria

cleanup

# Test 3: Empty criteria (valid case)
test_suite "Test 3: Empty Criteria"

export AGENT_SUCCESS_CRITERIA=""

assert_exit_code 0 "validate_success_criteria returns 0 for empty criteria" validate_success_criteria

cleanup

# Test 4: Missing AGENT_SUCCESS_CRITERIA (valid case)
test_suite "Test 4: Missing Environment Variable"

unset AGENT_SUCCESS_CRITERIA

assert_exit_code 0 "validate_success_criteria returns 0 when variable not set" validate_success_criteria

# Test 5: get_test_suite function
test_suite "Test 5: get_test_suite Function"

export AGENT_SUCCESS_CRITERIA='{
  "test_suites": [
    {
      "name": "unit-tests",
      "command": "npm test"
    },
    {
      "name": "integration-tests",
      "command": "npm run test:integration"
    }
  ]
}'

validate_success_criteria

suite=$(get_test_suite "unit-tests")
suite_name=$(echo "$suite" | jq -r '.name // empty')
assert_equals "unit-tests" "$suite_name" "get_test_suite retrieves correct suite"

suite2=$(get_test_suite "integration-tests")
suite2_name=$(echo "$suite2" | jq -r '.name // empty')
assert_equals "integration-tests" "$suite2_name" "get_test_suite retrieves second suite"

missing=$(get_test_suite "nonexistent")
assert_equals "" "$missing" "get_test_suite returns empty for missing suite"

cleanup

# Test 6: get_test_command function
test_suite "Test 6: get_test_command Function"

export AGENT_SUCCESS_CRITERIA='{
  "test_suites": [
    {
      "name": "unit-tests",
      "command": "npm test"
    }
  ]
}'

validate_success_criteria

cmd=$(get_test_command "unit-tests")
assert_equals "npm test" "$cmd" "get_test_command retrieves correct command"

missing_cmd=$(get_test_command "nonexistent")
assert_equals "" "$missing_cmd" "get_test_command returns empty for missing suite"

cleanup

# Test 7: get_pass_threshold function
test_suite "Test 7: get_pass_threshold Function"

export AGENT_SUCCESS_CRITERIA='{
  "test_suites": [
    {
      "name": "unit-tests",
      "command": "npm test",
      "pass_threshold": 0.95
    }
  ]
}'

validate_success_criteria

threshold=$(get_pass_threshold "unit-tests")
assert_equals "0.95" "$threshold" "get_pass_threshold retrieves correct threshold"

missing_threshold=$(get_pass_threshold "nonexistent")
assert_equals "" "$missing_threshold" "get_pass_threshold returns empty for missing suite"

cleanup

# Test 8: list_test_suites function
test_suite "Test 8: list_test_suites Function"

export AGENT_SUCCESS_CRITERIA='{
  "test_suites": [
    {"name": "unit-tests", "command": "npm test"},
    {"name": "integration-tests", "command": "npm run test:integration"},
    {"name": "e2e-tests", "command": "npm run test:e2e"}
  ]
}'

validate_success_criteria

suites=$(list_test_suites)
suite_count=$(echo "$suites" | wc -l)
assert_equals "3" "$suite_count" "list_test_suites returns correct count"

first_suite=$(echo "$suites" | head -1)
assert_equals "unit-tests" "$first_suite" "list_test_suites includes first suite"

cleanup

# Test 9: validate_criteria_structure - valid structure
test_suite "Test 9: validate_criteria_structure - Valid"

export AGENT_SUCCESS_CRITERIA='{
  "test_suites": [
    {
      "name": "unit-tests",
      "command": "npm test"
    }
  ]
}'

validate_success_criteria

assert_exit_code 0 "validate_criteria_structure returns 0 for valid structure" validate_criteria_structure

cleanup

# Test 10: validate_criteria_structure - missing test_suites
test_suite "Test 10: validate_criteria_structure - Missing test_suites"

export AGENT_SUCCESS_CRITERIA='{"other_field": "value"}'

validate_success_criteria

assert_exit_code 1 "validate_criteria_structure returns 1 for missing test_suites" validate_criteria_structure

cleanup

# Test 11: validate_criteria_structure - missing name field
test_suite "Test 11: validate_criteria_structure - Missing name"

export AGENT_SUCCESS_CRITERIA='{
  "test_suites": [
    {
      "command": "npm test"
    }
  ]
}'

validate_success_criteria

assert_exit_code 1 "validate_criteria_structure returns 1 for missing name field" validate_criteria_structure

cleanup

# Test 12: validate_criteria_structure - missing command field
test_suite "Test 12: validate_criteria_structure - Missing command"

export AGENT_SUCCESS_CRITERIA='{
  "test_suites": [
    {
      "name": "unit-tests"
    }
  ]
}'

validate_success_criteria

assert_exit_code 1 "validate_criteria_structure returns 1 for missing command field" validate_criteria_structure

cleanup

# Test 13: Fallback operators - missing optional fields
test_suite "Test 13: Fallback Operators"

export AGENT_SUCCESS_CRITERIA='{
  "test_suites": [
    {
      "name": "unit-tests",
      "command": "npm test"
    }
  ]
}'

validate_success_criteria

# Missing pass_threshold should return empty (not error)
threshold=$(get_pass_threshold "unit-tests")
assert_equals "" "$threshold" "Missing optional field returns empty (not error)"

cleanup

# Test 14: Security - JSON injection attempt
test_suite "Test 14: Security - JSON Injection"

export AGENT_SUCCESS_CRITERIA='{"test_suites": [{"name": "$(rm -rf /)", "command": "evil"}]}'

# Should validate successfully (structure is valid)
assert_exit_code 0 "Injection attempt in name field is parsed safely" validate_success_criteria

# But the name should be properly escaped when extracted
suite=$(get_test_suite '$(rm -rf /)')
suite_name=$(echo "$suite" | jq -r '.name // empty')
# The exact match proves it's treated as literal string, not executed
assert_equals '$(rm -rf /)' "$suite_name" "Injection payload treated as literal string"

cleanup

# Test 15: Multiple test suites with mixed valid/invalid
test_suite "Test 15: Multiple Test Suites"

export AGENT_SUCCESS_CRITERIA='{
  "test_suites": [
    {"name": "unit-tests", "command": "npm test", "pass_threshold": 0.95},
    {"name": "integration-tests", "command": "npm run test:integration", "pass_threshold": 0.90},
    {"name": "e2e-tests", "command": "npm run test:e2e"}
  ]
}'

validate_success_criteria

cmd1=$(get_test_command "unit-tests")
cmd2=$(get_test_command "integration-tests")
cmd3=$(get_test_command "e2e-tests")

assert_equals "npm test" "$cmd1" "First suite command correct"
assert_equals "npm run test:integration" "$cmd2" "Second suite command correct"
assert_equals "npm run test:e2e" "$cmd3" "Third suite command correct"

threshold1=$(get_pass_threshold "unit-tests")
threshold2=$(get_pass_threshold "integration-tests")
threshold3=$(get_pass_threshold "e2e-tests")

assert_equals "0.95" "$threshold1" "First suite threshold correct"
assert_equals "0.90" "$threshold2" "Second suite threshold correct"
assert_equals "" "$threshold3" "Missing threshold returns empty"

cleanup

# Test 16: Function exports
test_suite "Test 16: Function Exports"

# Verify all functions are exported
assert_exit_code 0 "validate_success_criteria is exported" declare -F validate_success_criteria
assert_exit_code 0 "get_test_suite is exported" declare -F get_test_suite
assert_exit_code 0 "get_test_command is exported" declare -F get_test_command
assert_exit_code 0 "get_pass_threshold is exported" declare -F get_pass_threshold
assert_exit_code 0 "list_test_suites is exported" declare -F list_test_suites
assert_exit_code 0 "validate_criteria_structure is exported" declare -F validate_criteria_structure

# Print summary
echo ""
echo "=================================="
echo "Test Summary"
echo "=================================="
echo -e "Total tests:  $TESTS_RUN"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
else
    echo -e "Failed:       $TESTS_FAILED"
fi

# Calculate pass rate
if [[ $TESTS_RUN -gt 0 ]]; then
    pass_rate=$(awk "BEGIN {printf \"%.2f\", ($TESTS_PASSED / $TESTS_RUN) * 100}")
    echo -e "Pass rate:    ${pass_rate}%"
fi

echo ""

# Exit with appropriate code
if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All tests passed${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
