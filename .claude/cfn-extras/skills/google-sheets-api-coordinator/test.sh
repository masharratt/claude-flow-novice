#!/usr/bin/env bash
set -eu

# google-sheets-api-coordinator/test.sh
# Test suite for API coordinator
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

test_basic_api_call() {
  echo ""
  echo "Testing basic API call..."
  local result
  result=$("$SCRIPT_DIR/api-call.sh" \
    --api-endpoint "spreadsheets.values:get" \
    --spreadsheet-id "test123")
  assert_success "$result" "Basic API call should succeed"
}

test_api_call_with_method() {
  echo ""
  echo "Testing API call with custom method..."
  local result
  result=$("$SCRIPT_DIR/api-call.sh" \
    --api-endpoint "spreadsheets:create" \
    --spreadsheet-id "test123" \
    --method POST)
  assert_success "$result" "API call with POST method should work"
}

test_batch_operation() {
  echo ""
  echo "Testing batch operation..."
  local result
  result=$("$SCRIPT_DIR/api-call.sh" \
    --api-endpoint "spreadsheets.values:batchUpdate" \
    --spreadsheet-id "test123" \
    --batch-size 100)
  assert_success "$result" "Batch operation should work"
}

test_quota_tracking() {
  echo ""
  echo "Testing quota tracking..."
  local result
  result=$("$SCRIPT_DIR/api-call.sh" \
    --api-endpoint "spreadsheets.values:get" \
    --spreadsheet-id "test123" \
    --quota-limit 300)
  assert_success "$result" "Quota tracking should work"

  # Check quota remaining field exists
  if echo "$result" | jq -e '.quota_usage.quota_remaining' >/dev/null 2>&1; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Quota remaining should be tracked"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Quota remaining should be tracked"
  fi
  ((TESTS_TOTAL++))
}

test_missing_required_params() {
  echo ""
  echo "Testing missing required parameters..."
  local result
  result=$("$SCRIPT_DIR/api-call.sh" 2>&1 || true)
  if echo "$result" | grep -q "required"; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Missing params should be rejected"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Missing params should be rejected"
  fi
  ((TESTS_TOTAL++))
}

test_output_structure() {
  echo ""
  echo "Testing output structure..."
  local result
  result=$("$SCRIPT_DIR/api-call.sh" \
    --api-endpoint "spreadsheets.values:get" \
    --spreadsheet-id "test123")

  local required_fields=("success" "confidence" "api_call" "quota_usage" "metrics" "deliverables")
  local missing=0

  for field in "${required_fields[@]}"; do
    if ! echo "$result" | jq -e ".$field" >/dev/null 2>&1; then
      ((missing++))
    fi
  done

  ((TESTS_TOTAL++))
  if [ $missing -eq 0 ]; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Output should have all required fields"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Output missing $missing fields"
  fi
}

run_tests() {
  echo "========================================"
  echo "Running tests for google-sheets-api-coordinator"
  echo "========================================"

  test_basic_api_call
  test_api_call_with_method
  test_batch_operation
  test_quota_tracking
  test_missing_required_params
  test_output_structure

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
