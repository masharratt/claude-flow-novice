#!/usr/bin/env bash
set -euo pipefail

# test-integration.sh - Integration tests for workflow-codification skill
# Tests edge case tracking and cost tracking functionality

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${SCRIPT_DIR}/test-workflow-codification.db"
PROPOSALS_DIR="${SCRIPT_DIR}/test-proposals"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Setup test environment
setup() {
    echo "Setting up test environment..."
    rm -f "$DB_PATH"
    rm -rf "$PROPOSALS_DIR"
    export DB_PATH
    export PROPOSALS_DIR
}

# Cleanup test environment
cleanup() {
    echo "Cleaning up test environment..."
    rm -f "$DB_PATH"
    rm -rf "$PROPOSALS_DIR"
}

# Test helper functions
test_start() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo -e "\n${YELLOW}Test $TESTS_RUN: $1${NC}"
}

test_pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}✓ PASS${NC}"
}

test_fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "${RED}✗ FAIL: $1${NC}"
}

# Check dependencies
check_dependencies() {
    test_start "Check dependencies"

    if ! command -v sqlite3 &> /dev/null; then
        test_fail "sqlite3 not installed"
        return 1
    fi

    if ! command -v bc &> /dev/null; then
        test_fail "bc not installed"
        return 1
    fi

    test_pass
}

# Test edge case tracking
test_edge_case_record() {
    test_start "Record edge case"

    output=$("${SCRIPT_DIR}/track-edge-case.sh" --action record \
        --skill-name "test-skill" \
        --skill-version "1.0.0" \
        --exit-code 1 \
        --input-params "param1=value1 param2=value2" \
        --expected-output "success" \
        --actual-output "failure" \
        --error-message "Test error" 2>&1)

    if [[ $? -eq 0 ]] && [[ "$output" =~ "Recorded new edge case" ]]; then
        test_pass
    else
        test_fail "Failed to record edge case: $output"
    fi
}

# Test edge case recurrence
test_edge_case_recurrence() {
    test_start "Edge case recurrence detection"

    # Record same edge case 3 times
    for i in {1..3}; do
        "${SCRIPT_DIR}/track-edge-case.sh" --action record \
            --skill-name "test-skill-recurring" \
            --skill-version "1.0.0" \
            --exit-code 127 \
            --input-params "timeout=30" \
            --error-message "Command not found" &> /dev/null
    done

    # Check if occurrence count is 3
    count=$(sqlite3 "$DB_PATH" "SELECT occurrence_count FROM edge_cases WHERE skill_name = 'test-skill-recurring';" 2>/dev/null)

    if [[ "$count" == "3" ]]; then
        test_pass
    else
        test_fail "Expected occurrence_count=3, got: $count"
    fi
}

# Test edge case query
test_edge_case_query() {
    test_start "Query recurring edge cases"

    output=$("${SCRIPT_DIR}/track-edge-case.sh" --action query 2>&1)

    if [[ $? -eq 0 ]] && [[ "$output" =~ "test-skill-recurring" ]]; then
        test_pass
    else
        test_fail "Failed to query edge cases: $output"
    fi
}

# Test cost tracking
test_cost_tracking_log() {
    test_start "Log skill execution"

    output=$("${SCRIPT_DIR}/track-cost-savings.sh" --action log \
        --skill-name "test-skill-cost" \
        --skill-version "1.0.0" \
        --execution-time-ms 150 \
        --exit-code 0 \
        --tokens-avoided 3000 2>&1)

    if [[ $? -eq 0 ]] && [[ "$output" =~ "Logged execution" ]]; then
        test_pass
    else
        test_fail "Failed to log execution: $output"
    fi
}

# Test ROI ranking
test_roi_ranking() {
    test_start "Query skill ROI ranking"

    # Log multiple executions
    for i in {1..5}; do
        "${SCRIPT_DIR}/track-cost-savings.sh" --action log \
            --skill-name "test-skill-roi" \
            --skill-version "1.0.0" \
            --execution-time-ms 100 \
            --exit-code 0 \
            --tokens-avoided 3000 &> /dev/null
    done

    output=$("${SCRIPT_DIR}/track-cost-savings.sh" --action ranking --period 1 2>&1)

    if [[ $? -eq 0 ]] && [[ "$output" =~ "test-skill-roi" ]]; then
        test_pass
    else
        test_fail "Failed to query ROI ranking: $output"
    fi
}

# Test dashboard metrics
test_dashboard_metrics() {
    test_start "Export dashboard metrics (JSON)"

    output=$("${SCRIPT_DIR}/track-cost-savings.sh" --action dashboard --format json 2>&1)

    if [[ $? -eq 0 ]] && [[ "$output" =~ "total_executions" ]] && [[ "$output" =~ "total_cost_avoided_usd" ]]; then
        test_pass
    else
        test_fail "Failed to export dashboard metrics: $output"
    fi
}

# Test projections
test_projections() {
    test_start "Calculate cost projections"

    output=$("${SCRIPT_DIR}/track-cost-savings.sh" --action projections --period 1 2>&1)

    if [[ $? -eq 0 ]] && [[ "$output" =~ "Monthly Projection" ]] && [[ "$output" =~ "Annual Projection" ]]; then
        test_pass
    else
        test_fail "Failed to calculate projections: $output"
    fi
}

# Test ROI snapshot
test_roi_snapshot() {
    test_start "Generate ROI snapshot"

    output=$("${SCRIPT_DIR}/track-cost-savings.sh" --action snapshot 2>&1)

    if [[ $? -eq 0 ]] && [[ "$output" =~ "Generated ROI snapshot" ]]; then
        test_pass
    else
        test_fail "Failed to generate ROI snapshot: $output"
    fi
}

# Test database schema
test_database_schema() {
    test_start "Validate database schema"

    # Check edge_cases table
    edge_cases_exists=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='edge_cases';" 2>/dev/null)

    # Check skill_executions table
    executions_exists=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='skill_executions';" 2>/dev/null)

    # Check roi_snapshots table
    snapshots_exists=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='roi_snapshots';" 2>/dev/null)

    if [[ "$edge_cases_exists" == "edge_cases" ]] && \
       [[ "$executions_exists" == "skill_executions" ]] && \
       [[ "$snapshots_exists" == "roi_snapshots" ]]; then
        test_pass
    else
        test_fail "Database schema validation failed"
    fi
}

# Main test execution
main() {
    echo "=========================================="
    echo "Workflow Codification Integration Tests"
    echo "=========================================="

    setup

    # Run tests
    check_dependencies || {
        echo -e "\n${RED}Dependencies missing. Please install sqlite3 and bc.${NC}"
        cleanup
        exit 1
    }

    test_edge_case_record
    test_edge_case_recurrence
    test_edge_case_query
    test_cost_tracking_log
    test_roi_ranking
    test_dashboard_metrics
    test_projections
    test_roi_snapshot
    test_database_schema

    cleanup

    # Print summary
    echo -e "\n=========================================="
    echo "Test Summary"
    echo "=========================================="
    echo "Tests run: $TESTS_RUN"
    echo -e "${GREEN}Tests passed: $TESTS_PASSED${NC}"
    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo -e "${RED}Tests failed: $TESTS_FAILED${NC}"
    else
        echo "Tests failed: 0"
    fi
    echo "=========================================="

    # Exit with appropriate code
    if [[ $TESTS_FAILED -gt 0 ]]; then
        exit 1
    else
        exit 0
    fi
}

# Execute main if not sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
