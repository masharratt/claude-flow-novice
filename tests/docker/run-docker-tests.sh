#!/bin/bash
##############################################################################
# Docker Test Suite Runner
# Phase 4: Docker Mode Integration - Comprehensive Test Execution
#
# Executes all Docker environment validation tests sequentially:
# - Test 1: Network Connectivity
# - Test 2: Redis Message Passing
# - Test 3: Success Criteria Validation
#
# Features:
# - Sequential execution with colored output
# - Comprehensive summary report
# - Proper exit codes (0 = all pass, 1 = any fail)
# - Automatic cleanup on exit
# - Individual test isolation
##############################################################################

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test suite configuration
TESTS_DIR="$PROJECT_ROOT/tests/docker"
TEST_SCRIPTS=(
    "$TESTS_DIR/test-1-network-connectivity.sh"
    "$TESTS_DIR/test-2-redis-message-passing.sh"
    "$TESTS_DIR/test-3-success-criteria-validation.sh"
)

# Runner state
SUITE_START_TIME=$(date +%s)
SUITE_TESTS_PASSED=0
SUITE_TESTS_FAILED=0
SUITE_TESTS_TOTAL=0
FAILED_TESTS=()

cleanup() {
    log_info "Test suite cleanup initiated"
    # Individual tests handle their own cleanup via traps
}
trap cleanup EXIT

##############################################################################
# Print test suite header
##############################################################################
print_suite_header() {
    echo ""
    echo "========================================"
    echo "Docker Test Suite Runner"
    echo "========================================"
    echo "Started: $(date -Iseconds)"
    echo "Tests: ${#TEST_SCRIPTS[@]}"
    echo ""
}

##############################################################################
# Print test suite summary
##############################################################################
print_suite_summary() {
    local duration=$(($(date +%s) - SUITE_START_TIME))
    local pass_rate=0

    if [[ $SUITE_TESTS_TOTAL -gt 0 ]]; then
        pass_rate=$(awk "BEGIN {printf \"%.2f\", ($SUITE_TESTS_PASSED / $SUITE_TESTS_TOTAL) * 100}")
    fi

    echo ""
    echo "========================================"
    echo "Test Suite Summary"
    echo "========================================"
    echo "Total Tests:  $SUITE_TESTS_TOTAL"
    echo -e "Passed:       ${GREEN}$SUITE_TESTS_PASSED${NC}"
    echo -e "Failed:       ${RED}$SUITE_TESTS_FAILED${NC}"
    echo "Pass Rate:    ${pass_rate}%"
    echo "Duration:     ${duration}s"
    echo ""

    if [[ ${#FAILED_TESTS[@]} -gt 0 ]]; then
        echo -e "${RED}Failed Tests:${NC}"
        for test in "${FAILED_TESTS[@]}"; do
            echo -e "  ${RED}✗${NC} $test"
        done
        echo ""
    fi

    if [[ $SUITE_TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}❌ SOME TESTS FAILED${NC}"
        echo ""
        return 1
    fi
}

##############################################################################
# Execute single test script
##############################################################################
run_test_script() {
    local test_script="$1"
    local test_name
    test_name=$(basename "$test_script" .sh)

    log_step "Running: $test_name"

    # Check if test script exists and is executable
    if [[ ! -f "$test_script" ]]; then
        log_error "Test script not found: $test_script"
        FAILED_TESTS+=("$test_name (not found)")
        return 1
    fi

    if [[ ! -x "$test_script" ]]; then
        log_warn "Test script not executable, adding permissions: $test_script"
        chmod +x "$test_script"
    fi

    # Execute test in subshell to isolate environment
    local test_output test_exit_code
    if test_output=$("$test_script" 2>&1); then
        test_exit_code=0
    else
        test_exit_code=$?
    fi

    # Parse test results from output
    local passed failed total
    passed=$(echo "$test_output" | grep -oP 'Passed:\s+\K\d+' | tail -1 || echo "0")
    failed=$(echo "$test_output" | grep -oP 'Failed:\s+\K\d+' | tail -1 || echo "0")
    total=$(echo "$test_output" | grep -oP 'Total:\s+\K\d+' | tail -1 || echo "0")

    # Fallback: if parsing failed, use exit code
    if [[ "$total" -eq 0 ]]; then
        if [[ $test_exit_code -eq 0 ]]; then
            passed=1
            total=1
            failed=0
        else
            passed=0
            failed=1
            total=1
        fi
    fi

    # Update suite counters
    SUITE_TESTS_PASSED=$((SUITE_TESTS_PASSED + passed))
    SUITE_TESTS_FAILED=$((SUITE_TESTS_FAILED + failed))
    SUITE_TESTS_TOTAL=$((SUITE_TESTS_TOTAL + total))

    # Report test result
    if [[ $test_exit_code -eq 0 ]]; then
        log_success "$test_name: $passed/$total passed"
        echo ""
        return 0
    else
        log_error "$test_name: $failed/$total failed"
        FAILED_TESTS+=("$test_name")
        echo ""

        # Print last 20 lines of output for debugging
        log_info "Last 20 lines of output:"
        echo "$test_output" | tail -20
        echo ""
        return 1
    fi
}

##############################################################################
# Main execution
##############################################################################
print_suite_header

# Verify all test scripts exist
missing_tests=()
for test_script in "${TEST_SCRIPTS[@]}"; do
    if [[ ! -f "$test_script" ]]; then
        missing_tests+=("$(basename "$test_script")")
    fi
done

if [[ ${#missing_tests[@]} -gt 0 ]]; then
    log_error "Missing test scripts:"
    for test in "${missing_tests[@]}"; do
        echo "  - $test"
    done
    echo ""
    exit 1
fi

# Run all tests sequentially
for test_script in "${TEST_SCRIPTS[@]}"; do
    run_test_script "$test_script" || true  # Continue even if test fails
done

# Print final summary
if print_suite_summary; then
    exit 0
else
    exit 1
fi
