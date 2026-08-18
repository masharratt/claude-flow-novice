#!/usr/bin/env bash
set -eu

# google-sheets-validation/test.sh
# Comprehensive test suite for validation
# Version: 1.0.0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test helpers
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
  actual=$(echo "$result" | jq -r "$field" 2>/dev/null || echo "PARSE_ERROR")

  if [ "$actual" = "$expected" ]; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} $message"
    return 0
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} $message"
    echo "  Expected: $expected"
    echo "  Actual:   $actual"
    return 1
  fi
}

# Test: Help flag works
test_help_flag() {
  echo ""
  echo "Testing help flag..."

  if "$SCRIPT_DIR/validate-state.sh" --help >/dev/null 2>&1; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Help flag should work"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Help flag should work"
  fi
  ((TESTS_TOTAL++))
}

# Test: Missing required parameters rejected
test_missing_parameters() {
  echo ""
  echo "Testing missing parameter validation..."

  local result
  result=$("$SCRIPT_DIR/validate-state.sh" 2>&1 || true)

  if echo "$result" | grep -q "required"; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Missing parameters should be rejected"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Missing parameters should be rejected"
  fi
  ((TESTS_TOTAL++))
}

# Test: Schema validation with mock data
test_schema_validation() {
  echo ""
  echo "Testing schema validation..."

  local result
  result=$("$SCRIPT_DIR/validate-state.sh" \
    --spreadsheet-id "test123" \
    --sheet-name "TestSheet" \
    --check schema 2>&1 || true)

  if echo "$result" | jq -e '.validations.schema.passed' >/dev/null 2>&1; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Schema validation should return structure"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Schema validation should return structure"
  fi
  ((TESTS_TOTAL++))
}

# Test: Data validation with mock data
test_data_validation() {
  echo ""
  echo "Testing data validation..."

  local result
  result=$("$SCRIPT_DIR/validate-state.sh" \
    --spreadsheet-id "test123" \
    --sheet-name "TestSheet" \
    --check data 2>&1 || true)

  if echo "$result" | jq -e '.validations.data.passed' >/dev/null 2>&1; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Data validation should return structure"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Data validation should return structure"
  fi
  ((TESTS_TOTAL++))
}

# Test: Formula validation with mock data
test_formula_validation() {
  echo ""
  echo "Testing formula validation..."

  local result
  result=$("$SCRIPT_DIR/validate-state.sh" \
    --spreadsheet-id "test123" \
    --sheet-name "TestSheet" \
    --check formulas 2>&1 || true)

  if echo "$result" | jq -e '.validations.formulas.passed' >/dev/null 2>&1; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Formula validation should return structure"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Formula validation should return structure"
  fi
  ((TESTS_TOTAL++))
}

# Test: All validation checks
test_all_validation() {
  echo ""
  echo "Testing all validation checks..."

  local result
  result=$("$SCRIPT_DIR/validate-state.sh" \
    --spreadsheet-id "test123" \
    --sheet-name "TestSheet" \
    --check all 2>&1)

  if echo "$result" | jq -e '.overall_status' >/dev/null 2>&1; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} All checks should include overall_status"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} All checks should include overall_status"
  fi
  ((TESTS_TOTAL++))
}

# Test: JSON output format
test_json_output_format() {
  echo ""
  echo "Testing JSON output format..."

  local result
  result=$("$SCRIPT_DIR/validate-state.sh" \
    --spreadsheet-id "test123" \
    --sheet-name "TestSheet" \
    --output-format json 2>&1)

  if echo "$result" | jq empty 2>/dev/null; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} JSON output should be valid"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} JSON output should be valid"
  fi
  ((TESTS_TOTAL++))
}

# Test: Report output format
test_report_output_format() {
  echo ""
  echo "Testing report output format..."

  local result
  result=$("$SCRIPT_DIR/validate-state.sh" \
    --spreadsheet-id "test123" \
    --sheet-name "TestSheet" \
    --output-format report 2>&1)

  if echo "$result" | grep -q "Validation Report"; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Report output should contain header"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Report output should contain header"
  fi
  ((TESTS_TOTAL++))
}

# Test: Brief output format
test_brief_output_format() {
  echo ""
  echo "Testing brief output format..."

  local result
  result=$("$SCRIPT_DIR/validate-state.sh" \
    --spreadsheet-id "test123" \
    --sheet-name "TestSheet" \
    --output-format brief 2>&1)

  if echo "$result" | grep -q "Schema:"; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Brief output should contain Schema line"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Brief output should contain Schema line"
  fi
  ((TESTS_TOTAL++))
}

# Test: Verbose flag
test_verbose_flag() {
  echo ""
  echo "Testing verbose flag..."

  # Verbose outputs to stderr, so we capture both
  local result
  result=$("$SCRIPT_DIR/validate-state.sh" \
    --spreadsheet-id "test123" \
    --sheet-name "TestSheet" \
    --verbose 2>&1)

  if echo "$result" | grep -q "VERBOSE" || echo "$result" | jq -e '.success' >/dev/null 2>&1; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Verbose flag should work"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Verbose flag should work"
  fi
  ((TESTS_TOTAL++))
}

# Test: Invalid check type rejected
test_invalid_check_type() {
  echo ""
  echo "Testing invalid check type..."

  local result
  result=$("$SCRIPT_DIR/validate-state.sh" \
    --spreadsheet-id "test123" \
    --sheet-name "TestSheet" \
    --check invalid 2>&1 || true)

  if echo "$result" | grep -qi "unknown\|invalid"; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Invalid check type should be rejected"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Invalid check type should be rejected"
  fi
  ((TESTS_TOTAL++))
}

# Test: Output structure has required fields
test_output_structure() {
  echo ""
  echo "Testing output structure..."

  local result
  result=$("$SCRIPT_DIR/validate-state.sh" \
    --spreadsheet-id "test123" \
    --sheet-name "TestSheet" \
    --check all 2>&1)

  local required_fields=("success" "confidence" "validation_timestamp" "spreadsheet_id" "overall_status" "error_count" "deliverables")
  local missing_fields=0

  for field in "${required_fields[@]}"; do
    if ! echo "$result" | jq -e ".$field" >/dev/null 2>&1; then
      echo "  Missing field: $field"
      ((missing_fields++))
    fi
  done

  ((TESTS_TOTAL++))
  if [ $missing_fields -eq 0 ]; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Output should contain all required fields"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Output should contain all required fields ($missing_fields missing)"
  fi
}

# Run all tests
run_tests() {
  echo "========================================"
  echo "Running tests for google-sheets-validation"
  echo "========================================"

  test_help_flag
  test_missing_parameters
  test_schema_validation
  test_data_validation
  test_formula_validation
  test_all_validation
  test_json_output_format
  test_report_output_format
  test_brief_output_format
  test_verbose_flag
  test_invalid_check_type
  test_output_structure

  echo ""
  echo "========================================"
  echo "Test Results"
  echo "========================================"
  echo "Total:  ${TESTS_TOTAL}"
  echo -e "Passed: ${GREEN}${TESTS_PASSED}${NC}"

  if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "Failed: ${RED}${TESTS_FAILED}${NC}"
    local pass_rate
    pass_rate=$(echo "scale=3; $TESTS_PASSED / $TESTS_TOTAL" | bc)
    echo "Pass Rate: $pass_rate"
    exit 1
  else
    echo -e "Failed: ${TESTS_FAILED}"
    echo ""
    echo -e "${GREEN}All tests passed! Pass rate: 1.000${NC}"
    exit 0
  fi
}

run_tests
