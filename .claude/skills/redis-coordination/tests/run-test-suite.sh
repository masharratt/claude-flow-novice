#!/bin/bash
# Master Test Runner for Redis Phase 1 Error Recovery & Resilience

set -euo pipefail

# Source test utilities
source "$(dirname "$0")/test-utils.sh"

# Test suites to run
test_suites=(
    "./retry-mechanism-test.sh"
    "./dlq-functionality-test.sh"
    "./edge-cases-test.sh"
    "./integration-test.sh"
)

# Global tracking
total_tests=0
passed_tests=0
failed_test_suites=()

# Run individual test suite
run_test_suite() {
    local suite_path="$1"
    local suite_name=$(basename "$suite_path")

    echo "Running test suite: $suite_name"

    set +e  # Disable immediate exit on error
    "$suite_path"
    local exit_code=$?
    set -e

    if [ $exit_code -eq 0 ]; then
        ((passed_tests++))
        echo "✅ $suite_name: PASSED"
    else
        failed_test_suites+=("$suite_name")
        echo "❌ $suite_name: FAILED"
    fi

    ((total_tests++))
}

# Main execution
main() {
    echo "Starting Redis Phase 1 Error Recovery & Resilience Test Suite"

    # Run all test suites
    for suite in "${test_suites[@]}"; do
        chmod +x "$suite"
        run_test_suite "$suite"
    done

    # Calculate confidence
    local confidence=$(compute_confidence_score "$passed_tests" "$total_tests")

    # Report results
    echo -e "\n--- Test Suite Summary ---"
    echo "Total Test Suites: $total_tests"
    echo "Passed: $passed_tests"
    echo "Failed: $((total_tests - passed_tests))"
    echo "Confidence Score: $confidence"

    if [ ${#failed_test_suites[@]} -gt 0 ]; then
        echo -e "\nFailed Test Suites:"
        for failed_suite in "${failed_test_suites[@]}"; do
            echo "  - $failed_suite"
        done
    fi

    # CFN Loop reporting
    ./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
        --task-id "redis-phase1-1760875302" \
        --agent-id "tester-1" \
        --confidence "$confidence" \
        --iteration 1

    # Signal test completion
    redis-cli lpush "swarm:redis-phase1-1760875302:tester-1:done" "complete"

    # Enter waiting mode
    ./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
        --task-id "redis-phase1-1760875302" \
        --agent-id "tester-1" \
        --context "phase1-testing-complete"

    # Ensure exit code reflects overall test success
    [ $passed_tests -eq $total_tests ]
}

main