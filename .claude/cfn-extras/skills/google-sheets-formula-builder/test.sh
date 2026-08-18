#!/usr/bin/env bash
set -eu

# google-sheets-formula-builder/test.sh
# Test suite for formula builder
# Version: 1.0.0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

assert_success() {
  local result="$1"
  local message="${2:-Command should succeed}"
  ((TESTS_TOTAL++))

  if echo "$result" | jq -e '.success == true' >/dev/null 2>&1; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} $message"
    return 0
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} $message"
    return 1
  fi
}

assert_field_equals() {
  local result="$1"
  local field="$2"
  local expected="$3"
  local message="${4:-Field should equal expected}"
  ((TESTS_TOTAL++))

  local actual
  actual=$(echo "$result" | jq -r "$field" 2>/dev/null || echo "ERROR")

  if [ "$actual" = "$expected" ]; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} $message"
    return 0
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} $message (got $actual)"
    return 1
  fi
}

test_sum_formula() {
  echo ""
  echo "Testing SUM formula generation..."
  local result
  result=$("$SCRIPT_DIR/build-formula.sh" \
    --formula-type SUM \
    --range A2:C10 \
    --target-cell D2)
  assert_success "$result" "SUM formula should generate"
  assert_field_equals "$result" ".formula" "=SUM(A2:C10)" "SUM formula should be correct"
}

test_average_formula() {
  echo ""
  echo "Testing AVERAGE formula generation..."
  local result
  result=$("$SCRIPT_DIR/build-formula.sh" \
    --formula-type AVERAGE \
    --range A2:C10 \
    --target-cell D2)
  assert_success "$result" "AVERAGE formula should generate"
  assert_field_equals "$result" ".formula" "=AVERAGE(A2:C10)" "AVERAGE formula should be correct"
}

test_if_formula() {
  echo ""
  echo "Testing IF formula generation..."
  local result
  result=$("$SCRIPT_DIR/build-formula.sh" \
    --formula-type IF \
    --range A2:C10 \
    --target-cell D2 \
    --condition "A2>100")
  assert_success "$result" "IF formula should generate"
}

test_vlookup_formula() {
  echo ""
  echo "Testing VLOOKUP formula generation..."
  local result
  result=$("$SCRIPT_DIR/build-formula.sh" \
    --formula-type VLOOKUP \
    --range A2:C10 \
    --target-cell D2 \
    --criteria "lookup")
  assert_success "$result" "VLOOKUP formula should generate"
}

test_syntax_validation() {
  echo ""
  echo "Testing syntax validation..."
  local result
  result=$("$SCRIPT_DIR/build-formula.sh" \
    --formula-type SUM \
    --range A2:C10 \
    --target-cell D2)
  assert_field_equals "$result" ".syntax_valid" "true" "Syntax should be valid"
}

test_missing_required_params() {
  echo ""
  echo "Testing missing required parameters..."
  local result
  result=$("$SCRIPT_DIR/build-formula.sh" 2>&1 || true)
  if echo "$result" | grep -q "required"; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Missing params should be rejected"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Missing params should be rejected"
  fi
  ((TESTS_TOTAL++))
}

test_invalid_range_format() {
  echo ""
  echo "Testing invalid range format..."
  local result
  result=$("$SCRIPT_DIR/build-formula.sh" \
    --formula-type SUM \
    --range "invalid" \
    --target-cell D2 2>&1 || true)
  if echo "$result" | grep -q "Invalid range"; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Invalid range should be rejected"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Invalid range should be rejected"
  fi
  ((TESTS_TOTAL++))
}

run_tests() {
  echo "========================================"
  echo "Running tests for google-sheets-formula-builder"
  echo "========================================"

  test_sum_formula
  test_average_formula
  test_if_formula
  test_vlookup_formula
  test_syntax_validation
  test_missing_required_params
  test_invalid_range_format

  echo ""
  echo "========================================"
  echo "Test Results: $TESTS_PASSED/$TESTS_TOTAL passed"
  echo "========================================"

  if [ $TESTS_FAILED -gt 0 ]; then
    exit 1
  else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  fi
}

run_tests
