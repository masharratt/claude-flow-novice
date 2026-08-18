#!/usr/bin/env bash
set -e

echo "═══════════════════════════════════════════════════════════"
echo "Production Criteria Test Suite"
echo "Claude Code Skills Integration - Epic Validation"
echo "═══════════════════════════════════════════════════════════"
echo ""

RESULTS_DIR=".artifacts/analytics"
mkdir -p $RESULTS_DIR

PASSED=0
FAILED=0
declare -a TEST_RESULTS

run_test() {
  local test_name=$1
  local test_command=$2

  echo ""
  echo "──────────────────────────────────────"
  echo "TEST: $test_name"
  echo "──────────────────────────────────────"

  if eval "$test_command"; then
    echo "✅ PASSED: $test_name"
    PASSED=$((PASSED + 1))
    TEST_RESULTS+=("PASS:$test_name")
  else
    echo "❌ FAILED: $test_name"
    FAILED=$((FAILED + 1))
    TEST_RESULTS+=("FAIL:$test_name")
  fi
}

# Run all 4 production criteria tests
run_test "Manual Override Rate <5%" \
  "node .claude/skills/cfn-analytics/test-manual-override-rate.js"

run_test "Zero Concurrent Test Conflicts" \
  ".claude/skills/cfn-test-execution/test-concurrent-conflicts.sh"

run_test "100% ROOT_WARNING Auto-Resolution" \
  ".claude/skills/cfn-hook-pipeline/test-root-warning-resolution.sh"

run_test "Agents Persist State Autonomously" \
  "node .claude/skills/cfn-sqlite-memory/test-state-persistence.js"

# Calculate success rate
TOTAL_TESTS=$((PASSED + FAILED))
SUCCESS_RATE=$(echo "scale=2; ($PASSED / $TOTAL_TESTS) * 100" | bc)

# Generate summary report
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "TEST SUITE SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Success Rate: ${SUCCESS_RATE}%"
echo ""

# Individual test results
echo "Individual Test Results:"
for result in "${TEST_RESULTS[@]}"; do
  IFS=':' read -r status test_name <<< "$result"
  if [ "$status" = "PASS" ]; then
    echo "  ✅ $test_name"
  else
    echo "  ❌ $test_name"
  fi
done
echo ""

# Generate JSON report
cat > $RESULTS_DIR/production-criteria-summary.json << REPORT
{
  "test_suite": "production_criteria_validation",
  "epic": "claude-code-skills-integration",
  "total_tests": $TOTAL_TESTS,
  "passed": $PASSED,
  "failed": $FAILED,
  "success_rate": $SUCCESS_RATE,
  "tests": [
    {
      "name": "Manual Override Rate",
      "result_file": "$RESULTS_DIR/manual-override-test.json",
      "status": "$(echo "${TEST_RESULTS[0]}" | cut -d: -f1)"
    },
    {
      "name": "Concurrent Test Conflicts",
      "result_file": "$RESULTS_DIR/test-conflict-results.json",
      "status": "$(echo "${TEST_RESULTS[1]}" | cut -d: -f1)"
    },
    {
      "name": "ROOT_WARNING Auto-Resolution",
      "result_file": "$RESULTS_DIR/root-warning-test.json",
      "status": "$(echo "${TEST_RESULTS[2]}" | cut -d: -f1)"
    },
    {
      "name": "State Persistence",
      "result_file": "$RESULTS_DIR/state-persistence-test.json",
      "status": "$(echo "${TEST_RESULTS[3]}" | cut -d: -f1)"
    }
  ],
  "test_date": "$(date -Iseconds)",
  "test_duration_seconds": $SECONDS
}
REPORT

echo "📄 Summary report saved to: $RESULTS_DIR/production-criteria-summary.json"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ ALL PRODUCTION CRITERIA TESTS PASSED ($PASSED/$TOTAL_TESTS)"
  echo ""
  echo "🚀 Epic is ready for production deployment!"
  exit 0
else
  echo "❌ SOME PRODUCTION CRITERIA TESTS FAILED ($FAILED/$TOTAL_TESTS)"
  echo ""
  echo "📋 Review individual test results for details"
  exit 1
fi
