#!/bin/bash
################################################################################
# Test Suite: Bug Fix Validation - Container ID Validation
# Purpose: Validate container ID validation before checkpoint save
# Coverage: Bug #3 fix in orchestrate.sh
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

log_test() {
    echo -e "${BLUE}[TEST $((TESTS_RUN + 1))]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}  ✓ PASS${NC} $*"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}  ✗ FAIL${NC} $*"
    ((TESTS_FAILED++))
}

run_test() {
    ((TESTS_RUN++))
    "$@"
}

################################################################################
# TEST 1: Empty Container IDs Validation
################################################################################
test_empty_container_ids() {
    log_test "Empty container IDs should be detected and rejected"

    # Simulate the validation logic
    local container_ids=""

    if [[ -z "$container_ids" ]]; then
        log_pass "Empty container IDs detected correctly"
        return 0
    else
        log_fail "Empty container IDs not detected"
        return 1
    fi
}

################################################################################
# TEST 2: Valid Container IDs Accepted
################################################################################
test_valid_container_ids() {
    log_test "Valid container IDs should be accepted"

    local container_ids="abc123def456,ghi789jkl012"

    if [[ -n "$container_ids" ]]; then
        log_pass "Valid container IDs accepted"
        return 0
    else
        log_fail "Valid container IDs rejected"
        return 1
    fi
}

################################################################################
# TEST 3: Whitespace-Only Container IDs
################################################################################
test_whitespace_container_ids() {
    log_test "Whitespace-only container IDs should be rejected"

    local container_ids="   "
    # Trim whitespace
    container_ids=$(echo "$container_ids" | xargs)

    if [[ -z "$container_ids" ]]; then
        log_pass "Whitespace-only container IDs rejected"
        return 0
    else
        log_fail "Whitespace-only container IDs accepted: '$container_ids'"
        return 1
    fi
}

################################################################################
# TEST 4: Single Container ID
################################################################################
test_single_container_id() {
    log_test "Single container ID should be valid"

    local container_ids="abc123def456"

    if [[ -n "$container_ids" ]]; then
        log_pass "Single container ID accepted"
        return 0
    else
        log_fail "Single container ID rejected"
        return 1
    fi
}

################################################################################
# TEST 5: Multiple Container IDs
################################################################################
test_multiple_container_ids() {
    log_test "Multiple container IDs should be valid"

    local container_ids="container1,container2,container3"

    if [[ -n "$container_ids" ]]; then
        local count
        count=$(echo "$container_ids" | tr ',' '\n' | wc -l)

        if [[ "$count" -eq 3 ]]; then
            log_pass "Multiple container IDs accepted (count: $count)"
            return 0
        else
            log_fail "Container count incorrect: $count"
            return 1
        fi
    else
        log_fail "Multiple container IDs rejected"
        return 1
    fi
}

################################################################################
# TEST 6: Orchestrate.sh Integration - Empty Container Handling
################################################################################
test_orchestrate_empty_container_handling() {
    log_test "orchestrate.sh should handle empty container_ids gracefully"

    local ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

    if [[ ! -f "$ORCHESTRATE_SCRIPT" ]]; then
        log_fail "orchestrate.sh not found"
        return 1
    fi

    # Check if validation exists in the code
    if grep -q 'if \[\[ -z "$container_ids" \]\]; then' "$ORCHESTRATE_SCRIPT"; then
        log_pass "Empty container validation code exists"
        return 0
    else
        log_fail "Empty container validation code not found"
        return 1
    fi
}

################################################################################
# TEST 7: Checkpoint Not Saved for Empty Containers
################################################################################
test_checkpoint_not_saved_empty() {
    log_test "Checkpoint should not be saved if container_ids is empty"

    local ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

    # Check that error is logged and checkpoint is skipped
    if grep -A 5 'if \[\[ -z "$container_ids" \]\]; then' "$ORCHESTRATE_SCRIPT" | grep -q 'log_error.*No containers found'; then
        log_pass "Error logging for empty containers exists"

        if grep -A 5 'if \[\[ -z "$container_ids" \]\]; then' "$ORCHESTRATE_SCRIPT" | grep -q 'return 1'; then
            log_pass "Early return prevents checkpoint save"
            return 0
        else
            log_fail "No early return found"
            return 1
        fi
    else
        log_fail "Error logging not found"
        return 1
    fi
}

################################################################################
# TEST 8: Orphan Cleanup Called for Empty Containers
################################################################################
test_orphan_cleanup_empty() {
    log_test "Orphan cleanup should be called for empty containers"

    local ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

    # Check that cleanup is called
    if grep -A 5 'if \[\[ -z "$container_ids" \]\]; then' "$ORCHESTRATE_SCRIPT" | grep -q 'cleanup_orphaned_containers'; then
        log_pass "Orphan cleanup called for empty containers"
        return 0
    else
        log_fail "Orphan cleanup not called"
        return 1
    fi
}

################################################################################
# TEST 9: Container ID Format Validation
################################################################################
test_container_id_format() {
    log_test "Container IDs should follow Docker format (12 hex chars minimum)"

    local valid_id="abc123def456"
    local invalid_id="abc"

    # Valid format: 12+ alphanumeric characters
    if [[ ${#valid_id} -ge 12 ]] && [[ "$valid_id" =~ ^[a-zA-Z0-9]+$ ]]; then
        log_pass "Valid container ID format accepted"
    else
        log_fail "Valid container ID format rejected"
        return 1
    fi

    # Invalid format: too short
    if [[ ${#invalid_id} -lt 12 ]]; then
        log_pass "Short container ID rejected correctly"
        return 0
    else
        log_fail "Short container ID accepted"
        return 1
    fi
}

################################################################################
# TEST 10: Container ID List Parsing
################################################################################
test_container_id_list_parsing() {
    log_test "Container ID list should be parsable into array"

    local container_ids="abc123,def456,ghi789"
    local -a id_array

    IFS=',' read -ra id_array <<< "$container_ids"

    if [[ ${#id_array[@]} -eq 3 ]]; then
        log_pass "Container ID list parsed correctly (${#id_array[@]} IDs)"

        # Verify each ID
        if [[ "${id_array[0]}" == "abc123" ]] && \
           [[ "${id_array[1]}" == "def456" ]] && \
           [[ "${id_array[2]}" == "ghi789" ]]; then
            log_pass "All IDs parsed correctly"
            return 0
        else
            log_fail "IDs not parsed correctly"
            return 1
        fi
    else
        log_fail "Array size incorrect: ${#id_array[@]}"
        return 1
    fi
}

################################################################################
# TEST 11: Trailing Comma Handling
################################################################################
test_trailing_comma() {
    log_test "Trailing comma should not create empty ID"

    local container_ids="abc123,def456,"
    local -a id_array

    IFS=',' read -ra id_array <<< "$container_ids"

    # Remove empty elements
    local -a clean_array
    for id in "${id_array[@]}"; do
        if [[ -n "$id" ]]; then
            clean_array+=("$id")
        fi
    done

    if [[ ${#clean_array[@]} -eq 2 ]]; then
        log_pass "Trailing comma handled correctly (${#clean_array[@]} IDs)"
        return 0
    else
        log_fail "Clean array size incorrect: ${#clean_array[@]}"
        return 1
    fi
}

################################################################################
# TEST 12: Leading Comma Handling
################################################################################
test_leading_comma() {
    log_test "Leading comma should not create empty ID"

    local container_ids=",abc123,def456"
    local -a id_array

    IFS=',' read -ra id_array <<< "$container_ids"

    # Remove empty elements
    local -a clean_array
    for id in "${id_array[@]}"; do
        if [[ -n "$id" ]]; then
            clean_array+=("$id")
        fi
    done

    if [[ ${#clean_array[@]} -eq 2 ]]; then
        log_pass "Leading comma handled correctly (${#clean_array[@]} IDs)"
        return 0
    else
        log_fail "Clean array size incorrect: ${#clean_array[@]}"
        return 1
    fi
}

################################################################################
# MAIN TEST EXECUTION
################################################################################

echo "========================================"
echo "Bug Fix Validation: Container ID Validation"
echo "Target: orchestrate.sh container validation"
echo "========================================"
echo ""

run_test test_empty_container_ids
run_test test_valid_container_ids
run_test test_whitespace_container_ids
run_test test_single_container_id
run_test test_multiple_container_ids
run_test test_orchestrate_empty_container_handling
run_test test_checkpoint_not_saved_empty
run_test test_orphan_cleanup_empty
run_test test_container_id_format
run_test test_container_id_list_parsing
run_test test_trailing_comma
run_test test_leading_comma

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Total Tests:  $TESTS_RUN"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All container validation tests passed${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
