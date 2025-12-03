#!/usr/bin/env bash
#
# JSON Validation Skill - Success Criteria Validator
# Centralized validation for AGENT_SUCCESS_CRITERIA environment variable
#
# Usage:
#   source .claude/skills/json-validation/validate-success-criteria.sh
#   validate_success_criteria
#
# Exit Codes:
#   0 - Success (criteria valid or not provided)
#   1 - Invalid JSON in AGENT_SUCCESS_CRITERIA
#
# Environment Variables:
#   AGENT_SUCCESS_CRITERIA - JSON string with test requirements
#
# Exports:
#   CRITERIA - Parsed JSON criteria object
#   TEST_SUITES - Array of test suite names

set -euo pipefail

# Validate and parse AGENT_SUCCESS_CRITERIA
#
# This function implements defensive JSON parsing to prevent injection attacks
# (CVSS 8.2) and ensures consistent error handling across all agents.
#
# Returns:
#   0 if validation succeeds (or no criteria provided)
#   1 if validation fails (malformed JSON)
validate_success_criteria() {
    # Check if AGENT_SUCCESS_CRITERIA is provided
    if [[ -z "${AGENT_SUCCESS_CRITERIA:-}" ]]; then
        # No criteria provided - this is valid (agent may not require test-driven execution)
        return 0
    fi

    # Validate JSON structure before parsing
    if ! echo "$AGENT_SUCCESS_CRITERIA" | jq -e '.' >/dev/null 2>&1; then
        echo "❌ Invalid JSON in AGENT_SUCCESS_CRITERIA" >&2
        echo "   Expected valid JSON object with test_suites array" >&2
        echo "   Received: ${AGENT_SUCCESS_CRITERIA:0:100}..." >&2
        return 1
    fi

    # Parse validated JSON
    CRITERIA=$(echo "$AGENT_SUCCESS_CRITERIA" | jq -r '.')
    export CRITERIA

    # Extract test suites with fallback operators (suppress iteration error if test_suites missing)
    TEST_SUITES=$(echo "$CRITERIA" | jq -r '.test_suites[]? // empty' 2>/dev/null || echo "")
    export TEST_SUITES

    # Display loaded criteria (if any test suites present)
    if [[ -n "$TEST_SUITES" ]]; then
        echo "📋 Success Criteria Loaded:"
        echo "$TEST_SUITES" | jq -r '.name // "unnamed"'
    fi

    return 0
}

# Extract specific test suite by name
#
# Usage:
#   get_test_suite "unit-tests"
#
# Returns:
#   JSON object for matching test suite, or empty string if not found
get_test_suite() {
    local suite_name="$1"

    if [[ -z "${CRITERIA:-}" ]]; then
        echo ""
        return 0
    fi

    echo "$CRITERIA" | jq -r --arg name "$suite_name" '.test_suites[]? | select(.name == $name) // empty' 2>/dev/null || echo ""
}

# Get test command for specific suite
#
# Usage:
#   get_test_command "unit-tests"
#
# Returns:
#   Test command string (e.g., "npm test"), or empty if not found
get_test_command() {
    local suite_name="$1"
    local suite

    suite=$(get_test_suite "$suite_name")

    if [[ -z "$suite" ]]; then
        echo ""
        return 0
    fi

    echo "$suite" | jq -r '.command // empty'
}

# Get pass rate threshold for specific suite
#
# Usage:
#   get_pass_threshold "unit-tests"
#
# Returns:
#   Pass rate threshold (e.g., "0.95"), or empty if not found
get_pass_threshold() {
    local suite_name="$1"
    local suite

    suite=$(get_test_suite "$suite_name")

    if [[ -z "$suite" ]]; then
        echo ""
        return 0
    fi

    echo "$suite" | jq -r '.pass_threshold // empty'
}

# List all test suite names
#
# Usage:
#   list_test_suites
#
# Returns:
#   Newline-separated list of suite names
list_test_suites() {
    if [[ -z "${CRITERIA:-}" ]]; then
        echo ""
        return 0
    fi

    echo "$CRITERIA" | jq -r '.test_suites[]?.name // "unnamed"' 2>/dev/null || echo ""
}

# Validate that required fields are present in criteria
#
# Usage:
#   validate_criteria_structure
#
# Returns:
#   0 if structure is valid
#   1 if required fields are missing
validate_criteria_structure() {
    if [[ -z "${CRITERIA:-}" ]]; then
        # No criteria to validate
        return 0
    fi

    # Check for required top-level structure
    if ! echo "$CRITERIA" | jq -e '.test_suites' >/dev/null 2>&1; then
        echo "❌ Missing required field: test_suites" >&2
        return 1
    fi

    # Check if test_suites is null or not an array
    local suite_type
    suite_type=$(echo "$CRITERIA" | jq -r '.test_suites | type')
    if [[ "$suite_type" != "array" ]]; then
        echo "❌ test_suites must be an array, got: $suite_type" >&2
        return 1
    fi

    # Validate each test suite has required fields
    local suite_count
    suite_count=$(echo "$CRITERIA" | jq -r '.test_suites | length')

    for ((i=0; i<suite_count; i++)); do
        local suite
        suite=$(echo "$CRITERIA" | jq -r ".test_suites[$i]")

        # Check for name field
        if ! echo "$suite" | jq -e '.name' >/dev/null 2>&1; then
            echo "❌ Test suite $i missing required field: name" >&2
            return 1
        fi

        # Check for command field
        if ! echo "$suite" | jq -e '.command' >/dev/null 2>&1; then
            echo "❌ Test suite $i missing required field: command" >&2
            return 1
        fi
    done

    return 0
}

# Export functions for use in agent scripts
export -f validate_success_criteria
export -f get_test_suite
export -f get_test_command
export -f get_pass_threshold
export -f list_test_suites
export -f validate_criteria_structure
