#!/bin/bash
# Run all 45 Docker test implementations and report results
# tests/docker-mode/run-all-implementations.sh

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
IMPLEMENTATIONS_DIR="$PROJECT_ROOT/tests/docker-mode/implementations"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Docker Test Suite - All Implementations${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}ERROR: Docker not found. Please install Docker first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Docker is available"
echo ""

# Test suite results
TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0

# Run coordinator spawning tests
echo -e "${BLUE}Running Coordinator Spawning Tests (13 tests)...${NC}"
if bash "$IMPLEMENTATIONS_DIR/coordinator-spawning-real-tests.sh"; then
    COORD_PASSED=13
    COORD_FAILED=0
else
    COORD_PASSED=0
    COORD_FAILED=13
fi
TOTAL_TESTS=$((TOTAL_TESTS + 13))
TOTAL_PASSED=$((TOTAL_PASSED + COORD_PASSED))
TOTAL_FAILED=$((TOTAL_FAILED + COORD_FAILED))
echo ""

# Run orchestrator workflow tests
echo -e "${BLUE}Running Orchestrator Workflow Tests (13 tests)...${NC}"
if bash "$IMPLEMENTATIONS_DIR/orchestrator-workflow-real-tests.sh"; then
    ORCH_PASSED=13
    ORCH_FAILED=0
else
    ORCH_PASSED=0
    ORCH_FAILED=13
fi
TOTAL_TESTS=$((TOTAL_TESTS + 13))
TOTAL_PASSED=$((TOTAL_PASSED + ORCH_PASSED))
TOTAL_FAILED=$((TOTAL_FAILED + ORCH_FAILED))
echo ""

# Run TDD compliance tests
echo -e "${BLUE}Running TDD Compliance Tests (19 tests)...${NC}"
if bash "$IMPLEMENTATIONS_DIR/tdd-compliance-real-tests.sh"; then
    TDD_PASSED=19
    TDD_FAILED=0
else
    TDD_PASSED=0
    TDD_FAILED=19
fi
TOTAL_TESTS=$((TOTAL_TESTS + 19))
TOTAL_PASSED=$((TOTAL_PASSED + TDD_PASSED))
TOTAL_FAILED=$((TOTAL_FAILED + TDD_FAILED))
echo ""

# Summary
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Overall Test Results${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo "Coordinator Spawning:  ${COORD_PASSED}/${13} passed"
echo "Orchestrator Workflow: ${ORCH_PASSED}/13 passed"
echo "TDD Compliance:        ${TDD_PASSED}/19 passed"
echo ""
echo "Total Tests:    $TOTAL_TESTS"
echo -e "${GREEN}Tests Passed:   $TOTAL_PASSED${NC}"

if [[ $TOTAL_FAILED -gt 0 ]]; then
    echo -e "${RED}Tests Failed:   $TOTAL_FAILED${NC}"
else
    echo -e "${GREEN}Tests Failed:   $TOTAL_FAILED${NC}"
fi

echo ""

if [[ $TOTAL_FAILED -eq 0 ]]; then
    PASS_RATE=100
else
    PASS_RATE=$(( TOTAL_PASSED * 100 / TOTAL_TESTS ))
fi

echo "Pass Rate:      ${PASS_RATE}%"
echo ""

if [[ $TOTAL_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All 45 tests PASSED${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests FAILED${NC}"
    exit 1
fi
