#!/bin/bash
# tests/trigger-dev/run-all-phase1-tests.sh
# Phase 1.3b :: Master test runner for all trigger.dev tests
# Executes:
#   1. Infrastructure validation
#   2. Edge case testing
#   3. Production image compliance
#   4. Container execution validation
#
# Generates aggregate test report with pass rates

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
TESTS_DIR="$PROJECT_ROOT/tests/trigger-dev"
RESULTS_DIR="$PROJECT_ROOT/.artifacts/test-results"
AGGREGATE_REPORT="$RESULTS_DIR/phase1-aggregate-report.json"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p "$RESULTS_DIR"

echo "==================================================================================="
echo "Phase 1.3b - Complete Test Suite Execution"
echo "==================================================================================="
echo ""
echo "Execution Start: $(date)"
echo "Tests Directory: $TESTS_DIR"
echo "Results Directory: $RESULTS_DIR"
echo ""

# Test suite tracking
declare -A TEST_SUITES
declare -A TEST_RESULTS
declare -A TEST_PASS_RATES

TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0

run_test_suite() {
  local suite_name="$1"
  local test_script="$2"
  local suite_id="$3"

  echo ""
  echo -e "${CYAN}===================================================================================${NC}"
  echo -e "${CYAN}Running Test Suite: $suite_name${NC}"
  echo -e "${CYAN}===================================================================================${NC}"
  echo ""

  ((TOTAL_SUITES++))

  if [ ! -f "$test_script" ]; then
    echo -e "${RED}✗ SKIP${NC} Test script not found: $test_script"
    TEST_RESULTS[$suite_id]="SKIPPED"
    TEST_PASS_RATES[$suite_id]="0.0"
    ((FAILED_SUITES++))
    return 1
  fi

  # Run test suite
  local start_time=$(date +%s)

  if bash "$test_script" 2>&1 | tee "$RESULTS_DIR/${suite_id}-output.log"; then
    local exit_code=0
  else
    local exit_code=$?
  fi

  local end_time=$(date +%s)
  local duration=$((end_time - start_time))

  echo ""
  echo -e "${BLUE}Test suite completed in ${duration}s (exit code: $exit_code)${NC}"

  if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC} $suite_name"
    TEST_RESULTS[$suite_id]="PASSED"
    ((PASSED_SUITES++))

    # Extract pass rate from result files if available
    local result_file="$RESULTS_DIR/${suite_id}-results.json"
    if [ -f "$result_file" ]; then
      local pass_rate=$(jq -r '.summary.pass_rate // 100' "$result_file" 2>/dev/null || echo "100")
      TEST_PASS_RATES[$suite_id]="$pass_rate"
    else
      TEST_PASS_RATES[$suite_id]="100.0"
    fi
  else
    echo -e "${RED}✗ FAIL${NC} $suite_name"
    TEST_RESULTS[$suite_id]="FAILED"
    ((FAILED_SUITES++))

    # Try to extract partial pass rate
    local result_file="$RESULTS_DIR/${suite_id}-results.json"
    if [ -f "$result_file" ]; then
      local pass_rate=$(jq -r '.summary.pass_rate // 0' "$result_file" 2>/dev/null || echo "0")
      TEST_PASS_RATES[$suite_id]="$pass_rate"
    else
      TEST_PASS_RATES[$suite_id]="0.0"
    fi
  fi

  TEST_SUITES[$suite_id]="$suite_name"
}

# =====================================================================
# EXECUTE TEST SUITES
# =====================================================================

# Test Suite 1: Infrastructure Validation
run_test_suite \
  "Infrastructure Validation" \
  "$TESTS_DIR/validate-phase1-infrastructure.sh" \
  "infrastructure"

# Test Suite 2: Edge Case Testing
run_test_suite \
  "Edge Case Testing" \
  "$TESTS_DIR/test-edge-cases.sh" \
  "edge-cases"

# Test Suite 3: Production Image Compliance (BUG #21)
run_test_suite \
  "Production Image Compliance (BUG #21)" \
  "$TESTS_DIR/test-production-image-compliance.sh" \
  "production-compliance"

# Test Suite 4: Container Execution Validation
run_test_suite \
  "Container Execution Validation" \
  "$TESTS_DIR/test-phase1-container-execution.sh" \
  "container-execution"

# =====================================================================
# GENERATE AGGREGATE REPORT
# =====================================================================

echo ""
echo -e "${CYAN}===================================================================================${NC}"
echo -e "${CYAN}Generating Aggregate Report${NC}"
echo -e "${CYAN}===================================================================================${NC}"
echo ""

# Calculate aggregate pass rate
TOTAL_PASS_RATE=0
SUITE_COUNT=0

for suite_id in "${!TEST_PASS_RATES[@]}"; do
  pass_rate="${TEST_PASS_RATES[$suite_id]}"
  TOTAL_PASS_RATE=$(echo "$TOTAL_PASS_RATE + $pass_rate" | bc)
  ((SUITE_COUNT++))
done

if [ $SUITE_COUNT -gt 0 ]; then
  AGGREGATE_PASS_RATE=$(echo "scale=1; $TOTAL_PASS_RATE / $SUITE_COUNT" | bc)
else
  AGGREGATE_PASS_RATE="0.0"
fi

# Generate JSON report
cat > "$AGGREGATE_REPORT" <<EOF
{
  "phase": "1.3b",
  "test_execution": "Complete Test Suite",
  "timestamp": "$(date -Iseconds)",
  "summary": {
    "total_suites": $TOTAL_SUITES,
    "passed_suites": $PASSED_SUITES,
    "failed_suites": $FAILED_SUITES,
    "aggregate_pass_rate": $AGGREGATE_PASS_RATE
  },
  "test_suites": [
EOF

# Add each test suite to report
FIRST=true
for suite_id in "${!TEST_SUITES[@]}"; do
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    echo "," >> "$AGGREGATE_REPORT"
  fi

  cat >> "$AGGREGATE_REPORT" <<EOF
    {
      "id": "$suite_id",
      "name": "${TEST_SUITES[$suite_id]}",
      "result": "${TEST_RESULTS[$suite_id]}",
      "pass_rate": ${TEST_PASS_RATES[$suite_id]}
    }
EOF
done

cat >> "$AGGREGATE_REPORT" <<EOF

  ]
}
EOF

# =====================================================================
# DISPLAY SUMMARY
# =====================================================================

echo ""
echo "==================================================================================="
echo "Phase 1.3b - Aggregate Test Results"
echo "==================================================================================="
echo ""
echo "Execution Complete: $(date)"
echo ""

echo "Test Suite Summary:"
echo ""

for suite_id in infrastructure edge-cases production-compliance container-execution; do
  if [ -n "${TEST_SUITES[$suite_id]:-}" ]; then
    local suite_name="${TEST_SUITES[$suite_id]}"
    local result="${TEST_RESULTS[$suite_id]}"
    local pass_rate="${TEST_PASS_RATES[$suite_id]}"

    if [ "$result" = "PASSED" ]; then
      echo -e "  ${GREEN}✓ $suite_name${NC} (${pass_rate}%)"
    elif [ "$result" = "FAILED" ]; then
      echo -e "  ${RED}✗ $suite_name${NC} (${pass_rate}%)"
    else
      echo -e "  ${YELLOW}⊘ $suite_name${NC} (SKIPPED)"
    fi
  fi
done

echo ""
echo "Aggregate Metrics:"
echo "  Total Suites: $TOTAL_SUITES"
echo "  Passed Suites: $PASSED_SUITES"
echo "  Failed Suites: $FAILED_SUITES"
echo "  Aggregate Pass Rate: ${AGGREGATE_PASS_RATE}%"
echo ""

# Calculate testing score (0.85-0.95 confidence scale)
# Base: 0.50 + (aggregate_pass_rate / 100) * 0.45
TESTING_SCORE=$(echo "scale=2; 0.50 + ($AGGREGATE_PASS_RATE / 100) * 0.45" | bc)

echo "Testing Score: $TESTING_SCORE"
echo ""

if (( $(echo "$TESTING_SCORE >= 0.90" | bc -l) )); then
  echo -e "${GREEN}✓ EXCELLENT${NC} Testing score ≥0.90 (target achieved)"
  QUALITY_VERDICT="EXCELLENT"
elif (( $(echo "$TESTING_SCORE >= 0.85" | bc -l) )); then
  echo -e "${GREEN}✓ GOOD${NC} Testing score ≥0.85 (acceptable)"
  QUALITY_VERDICT="GOOD"
elif (( $(echo "$TESTING_SCORE >= 0.80" | bc -l) )); then
  echo -e "${YELLOW}⚠ FAIR${NC} Testing score ≥0.80 (improvements needed)"
  QUALITY_VERDICT="FAIR"
else
  echo -e "${RED}✗ POOR${NC} Testing score <0.80 (significant issues)"
  QUALITY_VERDICT="POOR"
fi

echo ""

# Update report with testing score
jq --arg score "$TESTING_SCORE" --arg verdict "$QUALITY_VERDICT" \
  '.summary.testing_score = $score | .summary.quality_verdict = $verdict' \
  "$AGGREGATE_REPORT" > "$AGGREGATE_REPORT.tmp" && mv "$AGGREGATE_REPORT.tmp" "$AGGREGATE_REPORT"

echo "Results saved to: $AGGREGATE_REPORT"
echo "Individual logs: $RESULTS_DIR/*-output.log"
echo ""

if [ "$FAILED_SUITES" -eq 0 ]; then
  echo -e "${GREEN}✓ All test suites passed!${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}✗ $FAILED_SUITES test suite(s) failed${NC}"
  echo ""
  echo "Review individual test outputs for details:"
  for suite_id in "${!TEST_RESULTS[@]}"; do
    if [ "${TEST_RESULTS[$suite_id]}" = "FAILED" ]; then
      echo "  - $RESULTS_DIR/${suite_id}-output.log"
    fi
  done
  echo ""
  exit 1
fi
