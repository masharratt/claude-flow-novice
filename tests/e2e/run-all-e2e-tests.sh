#!/bin/bash
# Run All E2E Test Suites
# Executes all Phase 7 end-to-end integration tests and generates summary

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Test results
SUITES_RUN=0
SUITES_PASSED=0
SUITES_FAILED=0

# Test suite files
TEST_SUITES=(
    "test-full-deployment-workflow.sh"
    "test-analytics-integration.sh"
    "test-error-recovery.sh"
    "test-performance-validation.sh"
)

# Results storage
declare -A SUITE_RESULTS
declare -A SUITE_DURATIONS

echo -e "${BOLD}${BLUE}================================================${NC}"
echo -e "${BOLD}${BLUE}Phase 7.4: End-to-End Integration Test Suite${NC}"
echo -e "${BOLD}${BLUE}================================================${NC}\n"

# Run each test suite
for suite in "${TEST_SUITES[@]}"; do
    suite_path="$SCRIPT_DIR/$suite"

    if [[ ! -f "$suite_path" ]]; then
        echo -e "${RED}✗ Test suite not found: $suite${NC}"
        continue
    fi

    echo -e "\n${BOLD}Running: $suite${NC}"
    echo -e "${BLUE}------------------------------------------------${NC}\n"

    # Measure execution time
    start_time=$(date +%s)

    # Run test suite
    if bash "$suite_path"; then
        exit_code=0
    else
        exit_code=$?
    fi

    end_time=$(date +%s)
    duration=$((end_time - start_time))

    # Record results
    ((SUITES_RUN++))

    if [[ $exit_code -eq 0 ]]; then
        ((SUITES_PASSED++))
        SUITE_RESULTS["$suite"]="PASSED"
        echo -e "\n${GREEN}✓ $suite PASSED${NC} (${duration}s)"
    else
        ((SUITES_FAILED++))
        SUITE_RESULTS["$suite"]="FAILED"
        echo -e "\n${RED}✗ $suite FAILED${NC} (${duration}s)"
    fi

    SUITE_DURATIONS["$suite"]=$duration

    echo -e "${BLUE}------------------------------------------------${NC}"
done

# Print summary
echo -e "\n${BOLD}${BLUE}================================================${NC}"
echo -e "${BOLD}${BLUE}Test Suite Summary${NC}"
echo -e "${BOLD}${BLUE}================================================${NC}\n"

for suite in "${TEST_SUITES[@]}"; do
    result="${SUITE_RESULTS[$suite]:-SKIPPED}"
    duration="${SUITE_DURATIONS[$suite]:-0}"

    if [[ "$result" == "PASSED" ]]; then
        echo -e "${GREEN}✓${NC} $suite - ${result} (${duration}s)"
    elif [[ "$result" == "FAILED" ]]; then
        echo -e "${RED}✗${NC} $suite - ${result} (${duration}s)"
    else
        echo -e "${YELLOW}⚠${NC} $suite - ${result}"
    fi
done

echo -e "\n${BOLD}Overall Results:${NC}"
echo -e "  Suites Run:    $SUITES_RUN"
echo -e "  Suites Passed: ${GREEN}$SUITES_PASSED${NC}"
echo -e "  Suites Failed: ${RED}$SUITES_FAILED${NC}"

# Calculate pass rate
if [[ $SUITES_RUN -gt 0 ]]; then
    pass_rate=$(( (SUITES_PASSED * 100) / SUITES_RUN ))
    echo -e "  Pass Rate:     ${pass_rate}%"
fi

echo -e "\n${BOLD}${BLUE}================================================${NC}\n"

# Exit with appropriate code
if [[ $SUITES_FAILED -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}✓ All E2E test suites passed!${NC}\n"
    exit 0
else
    echo -e "${RED}${BOLD}✗ Some E2E test suites failed${NC}\n"
    exit 1
fi
