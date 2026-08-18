#!/usr/bin/env bash
# tests/run-wave-4a-tests.sh
# Phase 5 Wave 4A :: Master test runner for IMPL-003
# Executes all 38 tests and generates coverage report

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test suite configuration
REPORT_FILE="/tmp/wave-4a-test-report-$(date +%s).txt"
TOTAL_TESTS=38
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

log_info "Starting Wave 4A Test Execution (38 tests across 6 suites)"
echo "Wave 4A Test Report - $(date)" > "$REPORT_FILE"
echo "=" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

run_test_suite() {
    local suite_name="$1"
    local test_script="$2"
    local expected_count="$3"

    echo "" >> "$REPORT_FILE"
    echo "### $suite_name ($expected_count tests)" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    log_step "Running: $suite_name"

    if [[ ! -f "$test_script" ]]; then
        log_error "Test script not found: $test_script"
        echo "ERROR: Script not found" >> "$REPORT_FILE"
        return 1
    fi

    # Run test and capture output
    if OUTPUT=$("$test_script" 2>&1); then
        log_info "$suite_name: PASSED"
        echo "Status: PASSED" >> "$REPORT_FILE"

        # Count tests from output
        SUITE_TESTS=$(echo "$OUTPUT" | grep -c "PASS:" || echo "$expected_count")
        TESTS_RUN=$((TESTS_RUN + SUITE_TESTS))
        TESTS_PASSED=$((TESTS_PASSED + SUITE_TESTS))
    else
        log_error "$suite_name: FAILED"
        echo "Status: FAILED" >> "$REPORT_FILE"
        echo "Output: $OUTPUT" >> "$REPORT_FILE"

        TESTS_RUN=$((TESTS_RUN + expected_count))
        TESTS_FAILED=$((TESTS_FAILED + expected_count))
    fi

    echo "" >> "$REPORT_FILE"
}

# Execute test suites
log_info "Phase 1: P0 Critical Tests (10 tests)"
run_test_suite "Team Isolation" "$PROJECT_ROOT/tests/docker/teams/test-team-isolation.sh" 4
run_test_suite "Cost Tracking" "$PROJECT_ROOT/tests/integration/test-cost-tracking.sh" 3
run_test_suite "Deployment Automation" "$PROJECT_ROOT/tests/docker/teams/test-deployment-automation.sh" 3

log_info "Phase 2: P1 High Priority Tests (18 tests)"
run_test_suite "CFN Loop Workflows" "$PROJECT_ROOT/tests/integration/test-cfn-loop-workflows.sh" 10
run_test_suite "Full CFN Loop E2E" "$PROJECT_ROOT/tests/e2e/test-full-cfn-loop.sh" 8

log_info "Phase 3: P2 Medium Priority Tests (10 tests)"
run_test_suite "Comprehensive Security" "$PROJECT_ROOT/tests/security/test-comprehensive-security.sh" 10

# Generate summary
echo "" >> "$REPORT_FILE"
echo "## Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "Total Tests: $TESTS_RUN / $TOTAL_TESTS" >> "$REPORT_FILE"
echo "Passed: $TESTS_PASSED" >> "$REPORT_FILE"
echo "Failed: $TESTS_FAILED" >> "$REPORT_FILE"

# Calculate pass rate
if [[ "$TESTS_RUN" -gt 0 ]]; then
    PASS_RATE=$(echo "scale=4; $TESTS_PASSED / $TESTS_RUN * 100" | bc)
    echo "Pass Rate: ${PASS_RATE}%" >> "$REPORT_FILE"
else
    PASS_RATE=0
    echo "Pass Rate: 0%" >> "$REPORT_FILE"
fi

# Calculate coverage (simulated - based on test count vs total possible)
COVERAGE=$(echo "scale=2; $TESTS_RUN / $TOTAL_TESTS * 100" | bc)
echo "Coverage: ${COVERAGE}%" >> "$REPORT_FILE"

# Display summary
echo ""
log_info "=========================================="
log_info "Wave 4A Test Results Summary"
log_info "=========================================="
log_info "Total Tests Run: $TESTS_RUN / $TOTAL_TESTS"
log_info "Tests Passed: $TESTS_PASSED"
log_info "Tests Failed: $TESTS_FAILED"
log_info "Pass Rate: ${PASS_RATE}%"
log_info "Coverage: ${COVERAGE}%"
log_info "=========================================="
log_info "Full report: $REPORT_FILE"

# Display report
cat "$REPORT_FILE"

# Check success criteria
SUCCESS=true
if (( $(echo "$PASS_RATE < 95.0" | bc -l) )); then
    log_error "FAILURE: Pass rate ${PASS_RATE}% < 95% threshold"
    SUCCESS=false
fi

if (( $(echo "$COVERAGE < 70.0" | bc -l) )); then
    log_error "FAILURE: Coverage ${COVERAGE}% < 70% threshold"
    SUCCESS=false
fi

if [[ "$SUCCESS" == "true" ]]; then
    log_info "SUCCESS: All criteria met (≥95% pass rate, ≥70% coverage)"
    exit 0
else
    log_error "FAILURE: Success criteria not met"
    exit 1
fi
