#!/usr/bin/env bash
##############################################################################
# CFN v3 Test Suite - Run All Tests
#
# Executes all CFN Loop v3 validation tests and generates comprehensive report
#
# Usage:
#   ./run-all-tests.sh [--verbose] [--category <category>]
#
# Categories:
#   - all (default)
#   - helpers
#   - integration
#   - cli-mode
#   - task-mode
#   - recovery
##############################################################################

set -euo pipefail

# Configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$TEST_DIR/results"
VERBOSE=false
CATEGORY="all"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose) VERBOSE=true; shift ;;
        --category) CATEGORY="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Create results directory
mkdir -p "$RESULTS_DIR"

# Test result tracking
TOTAL_TESTS=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Array to store test results
declare -a TEST_RESULTS=()

# Helper function to run test
run_test() {
    local test_script="$1"
    local test_name=$(basename "$test_script" .sh)

    echo ""
    echo "==================================================="
    echo "Running: $test_name"
    echo "==================================================="

    ((TOTAL_TESTS++))

    if [ ! -f "$test_script" ]; then
        echo "⚠️  SKIP: Test script not found"
        ((TESTS_SKIPPED++))
        TEST_RESULTS+=("$test_name:SKIP")
        return
    fi

    # Make script executable if needed
    chmod +x "$test_script" 2>/dev/null || true

    # Run test and capture output
    local output_file="$RESULTS_DIR/${test_name}.log"
    if "$test_script" > "$output_file" 2>&1; then
        echo "✅ PASS"
        ((TESTS_PASSED++))
        TEST_RESULTS+=("$test_name:PASS")
    else
        echo "❌ FAIL"
        ((TESTS_FAILED++))
        TEST_RESULTS+=("$test_name:FAIL")

        if [ "$VERBOSE" = true ]; then
            echo ""
            echo "--- Error Output ---"
            tail -n 20 "$output_file"
        fi
    fi
}

echo "=============================================="
echo "CFN v3 Test Suite"
echo "=============================================="
echo "Test Directory: $TEST_DIR"
echo "Results Directory: $RESULTS_DIR"
echo "Category: $CATEGORY"
echo "Verbose: $VERBOSE"
echo ""

# Run tests based on category
if [ "$CATEGORY" = "all" ] || [ "$CATEGORY" = "helpers" ]; then
    echo ""
    echo "=== Helper Tests ==="
    [ -f "$TEST_DIR/helpers/test-gate-check.sh" ] && run_test "$TEST_DIR/helpers/test-gate-check.sh"
    [ -f "$TEST_DIR/helpers/test-consensus.sh" ] && run_test "$TEST_DIR/helpers/test-consensus.sh"
    [ -f "$TEST_DIR/helpers/test-deliverable-verifier.sh" ] && run_test "$TEST_DIR/helpers/test-deliverable-verifier.sh"
    [ -f "$TEST_DIR/helpers/test-iteration-manager.sh" ] && run_test "$TEST_DIR/helpers/test-iteration-manager.sh"
fi

if [ "$CATEGORY" = "all" ] || [ "$CATEGORY" = "integration" ]; then
    echo ""
    echo "=== Integration Tests ==="
    [ -f "$TEST_DIR/integration/test-simple-task.sh" ] && run_test "$TEST_DIR/integration/test-simple-task.sh"
    [ -f "$TEST_DIR/integration/test-multi-iteration.sh" ] && run_test "$TEST_DIR/integration/test-multi-iteration.sh"
    [ -f "$TEST_DIR/integration/test-mode-comparison.sh" ] && run_test "$TEST_DIR/integration/test-mode-comparison.sh"
fi

if [ "$CATEGORY" = "all" ] || [ "$CATEGORY" = "cli-mode" ]; then
    echo ""
    echo "=== CLI Mode Tests ==="
    [ -f "$TEST_DIR/cli-mode/test-redis-context.sh" ] && run_test "$TEST_DIR/cli-mode/test-redis-context.sh"
    [ -f "$TEST_DIR/cli-mode/test-zai-routing.sh" ] && run_test "$TEST_DIR/cli-mode/test-zai-routing.sh"
    [ -f "$TEST_DIR/cli-mode/test-cost-optimization.sh" ] && run_test "$TEST_DIR/cli-mode/test-cost-optimization.sh"
fi

if [ "$CATEGORY" = "all" ] || [ "$CATEGORY" = "task-mode" ]; then
    echo ""
    echo "=== Task Mode Tests ==="
    [ -f "$TEST_DIR/task-mode/test-direct-injection.sh" ] && run_test "$TEST_DIR/task-mode/test-direct-injection.sh"
    [ -f "$TEST_DIR/task-mode/test-anthropic-routing.sh" ] && run_test "$TEST_DIR/task-mode/test-anthropic-routing.sh"
    [ -f "$TEST_DIR/task-mode/test-visibility.sh" ] && run_test "$TEST_DIR/task-mode/test-visibility.sh"
fi

if [ "$CATEGORY" = "all" ] || [ "$CATEGORY" = "recovery" ]; then
    echo ""
    echo "=== Recovery Tests ==="
    [ -f "$TEST_DIR/recovery/test-redis-persistence.sh" ] && run_test "$TEST_DIR/recovery/test-redis-persistence.sh"
    [ -f "$TEST_DIR/recovery/test-context-retrieval.sh" ] && run_test "$TEST_DIR/recovery/test-context-retrieval.sh"
    [ -f "$TEST_DIR/recovery/test-crash-recovery.sh" ] && run_test "$TEST_DIR/recovery/test-crash-recovery.sh"
fi

echo ""
echo "=============================================="
echo "Test Suite Results"
echo "=============================================="
echo "Total Tests:    $TOTAL_TESTS"
echo "Passed:         $TESTS_PASSED"
echo "Failed:         $TESTS_FAILED"
echo "Skipped:        $TESTS_SKIPPED"
echo "Success Rate:   $(echo "scale=2; $TESTS_PASSED * 100 / ($TESTS_PASSED + $TESTS_FAILED + 1)" | bc)%"
echo ""

# Print individual test results
echo "Individual Results:"
for result in "${TEST_RESULTS[@]}"; do
    IFS=':' read -r test_name status <<< "$result"
    case $status in
        PASS) echo "  ✅ $test_name" ;;
        FAIL) echo "  ❌ $test_name" ;;
        SKIP) echo "  ⚠️  $test_name" ;;
    esac
done

echo ""
echo "Detailed logs available in: $RESULTS_DIR"
echo ""

# Generate JSON report
REPORT_FILE="$RESULTS_DIR/test-suite-report.json"
cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "category": "$CATEGORY",
  "summary": {
    "total": $TOTAL_TESTS,
    "passed": $TESTS_PASSED,
    "failed": $TESTS_FAILED,
    "skipped": $TESTS_SKIPPED,
    "success_rate": $(echo "scale=4; $TESTS_PASSED / ($TESTS_PASSED + $TESTS_FAILED + 1)" | bc)
  },
  "results": [
$(for result in "${TEST_RESULTS[@]}"; do
    IFS=':' read -r test_name status <<< "$result"
    echo "    {\"test\": \"$test_name\", \"status\": \"$status\"},"
done | sed '$ s/,$//')
  ]
}
EOF

echo "JSON report saved to: $REPORT_FILE"
echo ""

# Exit with appropriate code
if [ $TESTS_FAILED -eq 0 ] && [ $TESTS_PASSED -gt 0 ]; then
    echo "✅ All tests passed!"
    exit 0
elif [ $TOTAL_TESTS -eq $TESTS_SKIPPED ]; then
    echo "⚠️  All tests skipped"
    exit 2
else
    echo "❌ Some tests failed"
    exit 1
fi
