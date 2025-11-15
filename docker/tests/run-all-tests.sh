#!/bin/bash
# Run All Phase 4 Workflow Codification Tests
# Executes all 8 test suites and provides comprehensive summary

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test suite tracking
TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0

declare -a FAILED_SUITE_NAMES=()

# Summary arrays
declare -a SUITE_NAMES=()
declare -a SUITE_TESTS=()
declare -a SUITE_PASSED=()
declare -a SUITE_FAILED=()

run_test_suite() {
    local test_script="$1"
    local suite_name="$2"

    ((TOTAL_SUITES++))

    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  Running: ${BLUE}${suite_name}${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    set +e
    bash "$test_script"
    local exit_code=$?
    set -e

    SUITE_NAMES+=("$suite_name")

    if [[ $exit_code -eq 0 ]]; then
        ((PASSED_SUITES++))
        echo -e "${GREEN}✅ ${suite_name} PASSED${NC}"
    else
        ((FAILED_SUITES++))
        FAILED_SUITE_NAMES+=("$suite_name")
        echo -e "${RED}❌ ${suite_name} FAILED${NC}"
    fi

    return $exit_code
}

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  Phase 4 Workflow Codification - Comprehensive Test Suite     ${BLUE}║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Running 8 test suites with 73+ test scenarios...${NC}"
echo ""

START_TIME=$(date +%s)

# Run all test suites
run_test_suite "$SCRIPT_DIR/test-pattern-detection.sh" "Pattern Detection (10 tests)"
run_test_suite "$SCRIPT_DIR/test-skill-generation.sh" "Skill Generation (11 tests)"
run_test_suite "$SCRIPT_DIR/test-approval-workflow.sh" "Approval Workflow (16 tests)"
run_test_suite "$SCRIPT_DIR/test-edge-case-tracking.sh" "Edge Case Tracking (11 tests)"
run_test_suite "$SCRIPT_DIR/test-cost-tracking.sh" "Cost Tracking (11 tests)"
run_test_suite "$SCRIPT_DIR/test-workflow-codification-e2e.sh" "E2E Workflow (10 tests)"
run_test_suite "$SCRIPT_DIR/test-workflow-codification-security.sh" "Security (10 tests)"
run_test_suite "$SCRIPT_DIR/test-workflow-codification-performance.sh" "Performance (10 tests)"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Final Summary
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  Test Execution Summary                                        ${BLUE}║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Total Test Suites:    $TOTAL_SUITES"
echo -e "${GREEN}Suites Passed:        $PASSED_SUITES${NC}"

if [[ $FAILED_SUITES -gt 0 ]]; then
    echo -e "${RED}Suites Failed:        $FAILED_SUITES${NC}"
    echo ""
    echo -e "${RED}Failed Suites:${NC}"
    for suite in "${FAILED_SUITE_NAMES[@]}"; do
        echo -e "  ${RED}✗${NC} $suite"
    done
else
    echo -e "${GREEN}Suites Failed:        $FAILED_SUITES${NC}"
fi

PASS_RATE=$(echo "scale=2; $PASSED_SUITES * 100 / $TOTAL_SUITES" | bc)

echo ""
echo "Pass Rate:            ${PASS_RATE}%"
echo "Total Duration:       ${DURATION}s"
echo ""

if [[ $FAILED_SUITES -eq 0 ]]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}  ✅ ALL TESTS PASSED! System ready for deployment             ${GREEN}║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║${NC}  ❌ SOME TESTS FAILED - Review failures before deployment      ${RED}║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
