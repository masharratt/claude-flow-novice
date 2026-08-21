#!/usr/bin/env bash
# Quick Shell Test Runner - focuses on shell-based integration tests only

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Results directory
RESULTS_DIR="$PROJECT_ROOT/tests/integration/results"
mkdir -p "$RESULTS_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_FILE="$RESULTS_DIR/shell-tests-${TIMESTAMP}.log"

# Function to run test
run_test() {
    local test_file="$1"
    local test_name=$(basename "$test_file" .sh)

    ((TOTAL_TESTS++))
    echo -e "\n${BLUE}[$TOTAL_TESTS]${NC} Running: $test_name" | tee -a "$RESULTS_FILE"

    local start=$(date +%s)
    if timeout 60 bash "$test_file" > "$RESULTS_DIR/${test_name}-${TIMESTAMP}.log" 2>&1; then
        local duration=$(($(date +%s) - start))
        echo -e "${GREEN}✓ PASS${NC} $test_name (${duration}s)" | tee -a "$RESULTS_FILE"
        ((PASSED_TESTS++))
        return 0
    else
        local duration=$(($(date +%s) - start))
        local error=$(tail -3 "$RESULTS_DIR/${test_name}-${TIMESTAMP}.log" | tr '\n' ' ')
        echo -e "${RED}✗ FAIL${NC} $test_name (${duration}s)" | tee -a "$RESULTS_FILE"
        echo "  Error: $error" >> "$RESULTS_FILE"
        ((FAILED_TESTS++))
        return 1
    fi
}

echo "==========================================" | tee "$RESULTS_FILE"
echo "Shell Integration Test Suite" | tee -a "$RESULTS_FILE"
echo "Started: $(date)" | tee -a "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"

# Test environment
export CFN_TEST_MODE=true
export NODE_ENV=test

# Run shell tests
run_test "$PROJECT_ROOT/tests/integration/test-connectivity.sh"
run_test "$PROJECT_ROOT/tests/integration/test-integration-simple.sh"
run_test "$PROJECT_ROOT/tests/integration/test-component.sh"
run_test "$PROJECT_ROOT/tests/integration/test-environment-sanitization.sh"
run_test "$PROJECT_ROOT/tests/integration/test-parameter-standardization.sh"
run_test "$PROJECT_ROOT/tests/integration/test-priority-queue-unix.sh"
run_test "$PROJECT_ROOT/tests/integration/test-provider-routing.sh"
run_test "$PROJECT_ROOT/tests/integration/test-seo-pipeline-structure.sh"
# test-standard-handoffs.sh retired: tested StandardAdapter/DatabaseHandoff/
# file-operations.sh/agent-handoff.sh, all deleted in 1e4d22ae2's follow-up
# cleanup. No surviving code under test.
run_test "$PROJECT_ROOT/tests/integration/test-zai-routing.sh"

# Summary
echo "" | tee -a "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "Test Summary" | tee -a "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"
echo -e "Total:  $TOTAL_TESTS" | tee -a "$RESULTS_FILE"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}" | tee -a "$RESULTS_FILE"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}" | tee -a "$RESULTS_FILE"

if [ $TOTAL_TESTS -gt 0 ]; then
    PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")
    echo -e "Pass Rate: ${BLUE}${PASS_RATE}%${NC}" | tee -a "$RESULTS_FILE"
fi

echo "Results: $RESULTS_FILE" | tee -a "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"

[ $FAILED_TESTS -eq 0 ]
