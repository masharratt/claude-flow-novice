#!/bin/bash

# Workflow Validation Report
REPORT_FILE="/mnt/c/Users/masha/Documents/claude-flow-novice/monitoring/sprint-2.2/workflow-validation.md"

echo "# Sprint 2.2 Workflow Validation Report" > "$REPORT_FILE"
echo "## Code Review Workflow" >> "$REPORT_FILE"

# Simulate code review workflow checks
CODE_REVIEW_TASKS=$(docker exec engineering-coordinator zai-cli list-tasks --type code-review | wc -l)
CODE_REVIEW_PASSED=$(docker exec engineering-coordinator zai-cli list-tasks --type code-review --status passed | wc -l)
CODE_REVIEW_FAILED=$(docker exec engineering-coordinator zai-cli list-tasks --type code-review --status failed | wc -l)

echo "- Total Code Review Tasks: $CODE_REVIEW_TASKS" >> "$REPORT_FILE"
echo "- Passed Tasks: $CODE_REVIEW_PASSED" >> "$REPORT_FILE"
echo "- Failed Tasks: $CODE_REVIEW_FAILED" >> "$REPORT_FILE"

if [[ $CODE_REVIEW_PASSED -gt 0 && $CODE_REVIEW_FAILED -eq 0 ]]; then
    echo "✅ Code Review Workflow: OPERATIONAL" >> "$REPORT_FILE"
else
    echo "❌ Code Review Workflow: REQUIRES INVESTIGATION" >> "$REPORT_FILE"
fi

echo "## Test Execution Workflow" >> "$REPORT_FILE"

# Simulate test execution workflow checks
TEST_TASKS=$(docker exec engineering-coordinator zai-cli list-tasks --type test-execution | wc -l)
TEST_PASSED=$(docker exec engineering-coordinator zai-cli list-tasks --type test-execution --status passed | wc -l)
TEST_FAILED=$(docker exec engineering-coordinator zai-cli list-tasks --type test-execution --status failed | wc -l)

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
CONFIDENCE=$(echo "scale=2; $PASSED_TASKS / $TOTAL_TASKS" | bc)

echo "## Overall Confidence" >> "$REPORT_FILE"
echo "- Confidence Score: $CONFIDENCE" >> "$REPORT_FILE"

cat "$REPORT_FILE"