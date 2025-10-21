#!/bin/bash

# Master test runner for all skill implementations
# Runs tests for the 7 skill enforcement implementations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOTAL_PASSED=0
TOTAL_FAILED=0
FAILED_TESTS=()

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "Skill Enforcement Test Suite"
echo "========================================"
echo ""

# Test 1: Loop 3 Output Processing
echo -e "${BLUE}[1/6] Loop 3 Output Processing Tests${NC}"
if cd "$SCRIPT_DIR/loop3-output-processing" && bash ./test-loop3-processing.sh 2>&1 | tee /tmp/loop3-test.log; then
  echo -e "${GREEN}✓ Loop 3 tests passed${NC}"
  ((TOTAL_PASSED++))
else
  echo -e "${RED}✗ Loop 3 tests failed${NC}"
  FAILED_TESTS+=("Loop 3 Output Processing")
  ((TOTAL_FAILED++))
fi
echo ""
cd "$SCRIPT_DIR"

# Test 2: Loop 2 Feedback Extraction
echo -e "${BLUE}[2/6] Loop 2 Feedback Extraction Tests${NC}"
if cd "$SCRIPT_DIR/loop2-output-processing" && bash ./test-loop2-processing.sh 2>&1 | tee /tmp/loop2-test.log; then
  echo -e "${GREEN}✓ Loop 2 tests passed${NC}"
  ((TOTAL_PASSED++))
else
  echo -e "${RED}✗ Loop 2 tests failed${NC}"
  FAILED_TESTS+=("Loop 2 Feedback Extraction")
  ((TOTAL_FAILED++))
fi
echo ""
cd "$SCRIPT_DIR"

# Test 3: Orchestrator Tests (includes deliverable verification)
echo -e "${BLUE}[3/6] Orchestrator Deliverable Verification Tests${NC}"
if cd "$SCRIPT_DIR/redis-coordination" && bash ./test-orchestrator.sh 2>&1 | tee /tmp/orchestrator-test.log; then
  echo -e "${GREEN}✓ Orchestrator tests passed${NC}"
  ((TOTAL_PASSED++))
else
  echo -e "${RED}✗ Orchestrator tests failed${NC}"
  FAILED_TESTS+=("Orchestrator Deliverable Verification")
  ((TOTAL_FAILED++))
fi
echo ""
cd "$SCRIPT_DIR"

# Test 4: Agent Timeout/Completion Protocol
echo -e "${BLUE}[4/6] Agent Completion Protocol Tests${NC}"
if cd "$SCRIPT_DIR/loop3-output-processing" && bash ./test-agent-timeout.sh 2>&1 | tee /tmp/timeout-test.log; then
  echo -e "${GREEN}✓ Agent timeout tests passed${NC}"
  ((TOTAL_PASSED++))
else
  echo -e "${RED}✗ Agent timeout tests failed${NC}"
  FAILED_TESTS+=("Agent Completion Protocol")
  ((TOTAL_FAILED++))
fi
echo ""
cd "$SCRIPT_DIR"

# Test 5: Memory Persistence
echo -e "${BLUE}[5/6] Automatic Memory Persistence Tests${NC}"
if cd "$SCRIPT_DIR/automatic-memory-persistence" && bash ./test-memory-persistence.sh 2>&1 | tee /tmp/memory-test.log; then
  echo -e "${GREEN}✓ Memory persistence tests passed${NC}"
  ((TOTAL_PASSED++))
else
  echo -e "${RED}✗ Memory persistence tests failed${NC}"
  FAILED_TESTS+=("Automatic Memory Persistence")
  ((TOTAL_FAILED++))
fi
echo ""
cd "$SCRIPT_DIR"

# Test 6: Error Handling
echo -e "${BLUE}[6/6] Standardized Error Handling Tests${NC}"
if cd "$SCRIPT_DIR/standardized-error-handling" && bash ./test-error-handling.sh 2>&1 | tee /tmp/error-test.log; then
  echo -e "${GREEN}✓ Error handling tests passed${NC}"
  ((TOTAL_PASSED++))
else
  echo -e "${RED}✗ Error handling tests failed${NC}"
  FAILED_TESTS+=("Standardized Error Handling")
  ((TOTAL_FAILED++))
fi
echo ""
cd "$SCRIPT_DIR"

# Summary
echo "========================================"
echo "Test Suite Summary"
echo "========================================"
echo -e "${GREEN}Passed: $TOTAL_PASSED/6${NC}"
echo -e "${RED}Failed: $TOTAL_FAILED/6${NC}"
echo ""

if [ $TOTAL_FAILED -gt 0 ]; then
  echo -e "${RED}Failed test suites:${NC}"
  for test in "${FAILED_TESTS[@]}"; do
    echo "  - $test"
  done
  echo ""
  echo "Check logs in /tmp/*-test.log for details"
  exit 1
else
  echo -e "${GREEN}✓ All skill tests passed!${NC}"
  echo ""
  echo "Skill Enforcement Implementation: VALIDATED ✅"
  exit 0
fi
