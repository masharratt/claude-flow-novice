#!/usr/bin/env bash

# Enterprise Test Suite Runner
# Runs all enterprise tests across 13 epics
# Created: 2025-10-28

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Base directory
BASE_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/tests/enterprise"
LOG_DIR="/tmp/enterprise-test-logs-$(date +%Y%m%d-%H%M%S)"
RESULTS_FILE="/tmp/test-results-$(date +%Y%m%d-%H%M%S).txt"
mkdir -p "$LOG_DIR"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Enterprise Test Suite - Comprehensive Validation${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Find all test files
echo "Discovering test files..."
mapfile -t JS_TESTS < <(find "$BASE_DIR" \( -name 'test-*.js' -o -name 'test-*.cjs' \) | sort)
mapfile -t BASH_TESTS < <(find "$BASE_DIR" -name 'test-*.sh' | sort)

JS_COUNT=${#JS_TESTS[@]}
BASH_COUNT=${#BASH_TESTS[@]}
TOTAL_COUNT=$((JS_COUNT + BASH_COUNT))

echo -e "  JavaScript/Node tests: ${YELLOW}${JS_COUNT}${NC}"
echo -e "  Bash tests: ${YELLOW}${BASH_COUNT}${NC}"
echo -e "  Total tests: ${YELLOW}${TOTAL_COUNT}${NC}"
echo ""

# Initialize results file
echo "# Enterprise Test Results - $(date)" > "$RESULTS_FILE"
echo "# Total tests: $TOTAL_COUNT" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

# Function to run a single test
run_test() {
  local test_file="$1"
  local test_type="$2"
  local test_name=$(basename "$test_file")
  local epic_dir=$(basename $(dirname "$test_file"))
  local log_file="$LOG_DIR/${epic_dir}_${test_name}.log"
  local result_line="${epic_dir}/${test_name}"

  echo -n "  ${epic_dir}/${test_name} ... "

  # Run the test and capture output
  local exit_code=0
  if [ "$test_type" == "js" ]; then
    timeout 60 node "$test_file" > "$log_file" 2>&1 || exit_code=$?
  elif [ "$test_type" == "bash" ]; then
    timeout 60 bash "$test_file" > "$log_file" 2>&1 || exit_code=$?
  fi

  if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    echo "PASS|$result_line" >> "$RESULTS_FILE"
  else
    echo -e "${RED}✗ FAIL${NC} (exit code: $exit_code)"
    echo "FAIL|$result_line|$log_file" >> "$RESULTS_FILE"
  fi
}

# Run JavaScript/Node tests
if [ $JS_COUNT -gt 0 ]; then
  echo -e "${BLUE}Running JavaScript/Node Tests:${NC}"
  for test_file in "${JS_TESTS[@]}"; do
    [ -z "$test_file" ] && continue
    run_test "$test_file" "js"
  done
  echo ""
fi

# Run Bash tests
if [ $BASH_COUNT -gt 0 ]; then
  echo -e "${BLUE}Running Bash Tests:${NC}"
  for test_file in "${BASH_TESTS[@]}"; do
    [ -z "$test_file" ] && continue
    run_test "$test_file" "bash"
  done
  echo ""
fi

# Calculate summary from results file
PASSED_TESTS=$(grep -c "^PASS|" "$RESULTS_FILE" || echo 0)
FAILED_TESTS=$(grep -c "^FAIL|" "$RESULTS_FILE" || echo 0)
TOTAL_TESTS=$((PASSED_TESTS + FAILED_TESTS))

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Test Suite Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Total Tests:   ${YELLOW}${TOTAL_TESTS}${NC}"
echo -e "  Passed:        ${GREEN}${PASSED_TESTS}${NC}"
echo -e "  Failed:        ${RED}${FAILED_TESTS}${NC}"

if [ $TOTAL_TESTS -gt 0 ]; then
  PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")
  echo -e "  Pass Rate:     ${YELLOW}${PASS_RATE}%${NC}"
fi
echo ""

# Failed tests detail
if [ $FAILED_TESTS -gt 0 ]; then
  echo -e "${RED}Failed Tests:${NC}"
  grep "^FAIL|" "$RESULTS_FILE" | while IFS='|' read -r status test_path log_file; do
    echo -e "  ${RED}✗${NC} $test_path"
    echo "    Log: $log_file"
  done
  echo ""
fi

# Logs location
echo -e "Test logs saved to: ${BLUE}${LOG_DIR}${NC}"
echo -e "Results file: ${BLUE}${RESULTS_FILE}${NC}"
echo ""

# Exit code
if [ $FAILED_TESTS -gt 0 ]; then
  echo -e "${RED}✗ Test suite FAILED (${FAILED_TESTS} failures)${NC}"
  exit 1
else
  echo -e "${GREEN}✓ All ${PASSED_TESTS} tests PASSED${NC}"
  exit 0
fi
