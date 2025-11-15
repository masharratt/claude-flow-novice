#!/bin/bash

# Helper function to run docker exec with error handling
run_docker_count() {
    local container="$1"
    shift
    local cmd=("$@")

    # Capture output and exit status
    local output
    local exit_code
    output=$(docker exec "$container" "${cmd[@]}" 2>/dev/null | wc -l)
    exit_code=$?

    if [[ $exit_code -ne 0 ]]; then
        echo "❌ Docker exec failed: docker exec $container ${cmd[*]} (exit code: $exit_code)" >&2
        echo "-1"  # Return sentinel value for error
        return 1
    fi

    echo "$output"
    return 0
}

# Workflow Validation Report
REPORT_FILE="/mnt/c/Users/masha/Documents/claude-flow-novice/monitoring/sprint-2.2/workflow-validation.md"

echo "# Sprint 2.2 Workflow Validation Report" > "$REPORT_FILE"
echo "## Code Review Workflow" >> "$REPORT_FILE"

# Simulate code review workflow checks with error handling
CODE_REVIEW_TASKS=$(run_docker_count engineering-coordinator zai-cli list-tasks --type code-review)
CODE_REVIEW_PASSED=$(run_docker_count engineering-coordinator zai-cli list-tasks --type code-review --status passed)
CODE_REVIEW_FAILED=$(run_docker_count engineering-coordinator zai-cli list-tasks --type code-review --status failed)

# Treat -1 (error sentinel) as invalid, default to 0
[[ "$CODE_REVIEW_TASKS" == "-1" ]] && CODE_REVIEW_TASKS=0
[[ "$CODE_REVIEW_PASSED" == "-1" ]] && CODE_REVIEW_PASSED=0
[[ "$CODE_REVIEW_FAILED" == "-1" ]] && CODE_REVIEW_FAILED=0

echo "- Total Code Review Tasks: $CODE_REVIEW_TASKS" >> "$REPORT_FILE"
echo "- Passed Tasks: $CODE_REVIEW_PASSED" >> "$REPORT_FILE"
echo "- Failed Tasks: $CODE_REVIEW_FAILED" >> "$REPORT_FILE"

if [[ $CODE_REVIEW_PASSED -gt 0 && $CODE_REVIEW_FAILED -eq 0 ]]; then
    echo "✅ Code Review Workflow: OPERATIONAL" >> "$REPORT_FILE"
else
    echo "❌ Code Review Workflow: REQUIRES INVESTIGATION" >> "$REPORT_FILE"
fi

echo "## Test Execution Workflow" >> "$REPORT_FILE"

# Simulate test execution workflow checks with error handling
TEST_TASKS=$(run_docker_count engineering-coordinator zai-cli list-tasks --type test-execution)
TEST_PASSED=$(run_docker_count engineering-coordinator zai-cli list-tasks --type test-execution --status passed)
TEST_FAILED=$(run_docker_count engineering-coordinator zai-cli list-tasks --type test-execution --status failed)

# Treat -1 (error sentinel) as invalid, default to 0
[[ "$TEST_TASKS" == "-1" ]] && TEST_TASKS=0
[[ "$TEST_PASSED" == "-1" ]] && TEST_PASSED=0
[[ "$TEST_FAILED" == "-1" ]] && TEST_FAILED=0

echo "- Total Test Tasks: $TEST_TASKS" >> "$REPORT_FILE"
echo "- Passed Tasks: $TEST_PASSED" >> "$REPORT_FILE"
echo "- Failed Tasks: $TEST_FAILED" >> "$REPORT_FILE"

if [[ $TEST_PASSED -gt 0 && $TEST_FAILED -eq 0 ]]; then
    echo "✅ Test Execution Workflow: OPERATIONAL" >> "$REPORT_FILE"
else
    echo "❌ Test Execution Workflow: REQUIRES INVESTIGATION" >> "$REPORT_FILE"
fi

# Calculate overall confidence
TOTAL_TASKS=$((CODE_REVIEW_TASKS + TEST_TASKS))
PASSED_TASKS=$((CODE_REVIEW_PASSED + TEST_PASSED))

# Guard against division by zero
if [[ -z "$TOTAL_TASKS" || "$TOTAL_TASKS" -eq 0 ]]; then
    CONFIDENCE="0.00"
else
    CONFIDENCE=$(echo "scale=2; $PASSED_TASKS / $TOTAL_TASKS" | bc)
fi

echo "## Overall Confidence" >> "$REPORT_FILE"
echo "- Confidence Score: $CONFIDENCE" >> "$REPORT_FILE"

cat "$REPORT_FILE"