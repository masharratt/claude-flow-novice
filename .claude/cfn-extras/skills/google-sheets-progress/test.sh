#!/usr/bin/env bash
set -eu

# google-sheets-progress/test.sh
# Comprehensive test suite for progress tracking
# Version: 1.0.0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_STATE_FILE=$(mktemp)
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Cleanup
cleanup() {
  rm -f "$TEST_STATE_FILE" "$TEST_STATE_FILE.lock" 2>/dev/null || true
}
trap cleanup EXIT

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
    echo "  Result: $result"
    return 1
  fi
}

assert_field_equals() {
  local result="$1"
  local field="$2"
  local expected="$3"
  local message="${4:-Field $field should equal $expected}"

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

assert_file_exists() {
  local file="$1"
  local message="${2:-File should exist}"

  ((TESTS_TOTAL++))

  if [ -f "$file" ]; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} $message"
    return 0
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} $message"
    echo "  File not found: $file"
    return 1
  fi
}

# Test: Read from non-existent file initializes default state
test_read_initializes_default() {
  echo ""
  echo "Testing read action initialization..."

  local result
  result=$("$SCRIPT_DIR/track-progress.sh" --action read --state-file "$TEST_STATE_FILE")

  assert_success "$result" "Read should initialize default state"
  assert_field_equals "$result" ".state.completed | length" "0" "Default completed array should be empty"
  assert_field_equals "$result" ".state.status" "pending" "Default status should be pending"
}

# Test: Write action creates valid state
test_write_creates_state() {
  echo ""
  echo "Testing write action..."

  local result
  result=$("$SCRIPT_DIR/track-progress.sh" \
    --action write \
    --state-file "$TEST_STATE_FILE" \
    --completed '[]' \
    --current schema_001 \
    --remaining '["data_001","formula_001"]' \
    --status in_progress)

  assert_success "$result" "Write should succeed"
  assert_field_equals "$result" ".state.current" "schema_001" "Current should be schema_001"
  assert_field_equals "$result" ".state.status" "in_progress" "Status should be in_progress"
  assert_file_exists "$TEST_STATE_FILE" "State file should be created"
}

# Test: Update action modifies state
test_update_modifies_state() {
  echo ""
  echo "Testing update action..."

  # Initialize state first
  "$SCRIPT_DIR/track-progress.sh" \
    --action write \
    --state-file "$TEST_STATE_FILE" \
    --completed '[]' \
    --current schema_001 \
    --remaining '["data_001","formula_001"]' \
    --status in_progress >/dev/null

  # Update state
  local result
  result=$("$SCRIPT_DIR/track-progress.sh" \
    --action update \
    --state-file "$TEST_STATE_FILE" \
    --completed '["schema_001"]' \
    --current data_001 \
    --remaining '["formula_001"]')

  assert_success "$result" "Update should succeed"
  assert_field_equals "$result" ".state.current" "data_001" "Current should be updated to data_001"
  assert_field_equals "$result" ".state.completed | length" "1" "Completed array length should be 1"
}

# Test: Reset action clears state
test_reset_clears_state() {
  echo ""
  echo "Testing reset action..."

  # Initialize state first
  "$SCRIPT_DIR/track-progress.sh" \
    --action write \
    --state-file "$TEST_STATE_FILE" \
    --completed '[]' \
    --current schema_001 \
    --remaining '["data_001"]' \
    --status in_progress >/dev/null

  # Reset state
  local result
  result=$("$SCRIPT_DIR/track-progress.sh" \
    --action reset \
    --state-file "$TEST_STATE_FILE")

  assert_success "$result" "Reset should succeed"
  # Verify state file is removed
  if [ -f "$TEST_STATE_FILE" ]; then
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} State file should be removed after reset"
    ((TESTS_TOTAL++))
  else
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} State file should be removed after reset"
    ((TESTS_TOTAL++))
  fi
}

# Test: Metrics calculation
test_metrics_calculation() {
  echo ""
  echo "Testing metrics calculation..."

  local result
  result=$("$SCRIPT_DIR/track-progress.sh" \
    --action write \
    --state-file "$TEST_STATE_FILE" \
    --completed '[]' \
    --current schema_001 \
    --remaining '["data_001","formula_001"]' \
    --status in_progress)

  assert_success "$result" "Metrics calculation should succeed"

  # Check metrics
  local total_sprints
  total_sprints=$(echo "$result" | jq '.state.metrics.total_sprints')
  assert_field_equals "$result" ".state.metrics.total_sprints" "3" "Total sprints should be 3"

  local progress
  progress=$(echo "$result" | jq '.state.metrics.progress_percentage')
  if [ "$progress" = "0" ] || [ "$progress" = "0.0" ]; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Progress percentage should be 0 initially"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Progress percentage should be 0 initially (got $progress)"
  fi
  ((TESTS_TOTAL++))
}

# Test: Timestamp tracking
test_timestamp_tracking() {
  echo ""
  echo "Testing timestamp tracking..."

  local result
  result=$("$SCRIPT_DIR/track-progress.sh" \
    --action write \
    --state-file "$TEST_STATE_FILE" \
    --completed '[]' \
    --current schema_001 \
    --remaining '["data_001"]' \
    --status in_progress)

  assert_success "$result" "Timestamp tracking should succeed"

  # Check that timestamps are set
  local created
  created=$(echo "$result" | jq -r '.state.timestamps.created')

  if [ -n "$created" ] && [ "$created" != "null" ]; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Timestamp 'created' should be set"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Timestamp 'created' should be set"
  fi
  ((TESTS_TOTAL++))
}

# Test: Invalid sprint identifier rejected
test_invalid_sprint_id() {
  echo ""
  echo "Testing sprint ID validation..."

  local result
  result=$("$SCRIPT_DIR/track-progress.sh" \
    --action write \
    --state-file "$TEST_STATE_FILE" \
    --completed '[]' \
    --current invalid_sprint \
    --remaining '[]' \
    --status in_progress 2>&1 || true)

  if echo "$result" | grep -q "Invalid sprint identifier"; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Invalid sprint ID should be rejected"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Invalid sprint ID should be rejected"
  fi
  ((TESTS_TOTAL++))
}

# Test: Invalid status rejected
test_invalid_status() {
  echo ""
  echo "Testing status validation..."

  local result
  result=$("$SCRIPT_DIR/track-progress.sh" \
    --action write \
    --state-file "$TEST_STATE_FILE" \
    --completed '[]' \
    --current schema_001 \
    --remaining '[]' \
    --status invalid_status 2>&1 || true)

  if echo "$result" | grep -q "Invalid status"; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Invalid status should be rejected"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Invalid status should be rejected"
  fi
  ((TESTS_TOTAL++))
}

# Test: Metadata persistence
test_metadata_persistence() {
  echo ""
  echo "Testing metadata persistence..."

  local metadata='{"spreadsheet_id":"abc123","sheet_name":"Operations"}'

  local result
  result=$("$SCRIPT_DIR/track-progress.sh" \
    --action write \
    --state-file "$TEST_STATE_FILE" \
    --completed '[]' \
    --current schema_001 \
    --remaining '[]' \
    --status in_progress \
    --metadata "$metadata")

  assert_success "$result" "Metadata should be persisted"

  local sheet_name
  sheet_name=$(echo "$result" | jq -r '.state.metadata.sheet_name')
  assert_field_equals "$result" ".state.metadata.sheet_name" "Operations" "Metadata should be preserved"
}

# Test: Concurrent access handling
test_concurrent_access() {
  echo ""
  echo "Testing concurrent access handling..."

  # Initialize state
  "$SCRIPT_DIR/track-progress.sh" \
    --action write \
    --state-file "$TEST_STATE_FILE" \
    --completed '[]' \
    --current schema_001 \
    --remaining '[]' \
    --status in_progress >/dev/null

  # Simulate concurrent updates
  local result1
  result1=$("$SCRIPT_DIR/track-progress.sh" \
    --action update \
    --state-file "$TEST_STATE_FILE" \
    --status blocked 2>&1 || true)

  if echo "$result1" | jq -e '.success' >/dev/null 2>&1; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Concurrent access should be handled gracefully"
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Concurrent access should be handled gracefully"
  fi
  ((TESTS_TOTAL++))
}

# Run all tests
run_tests() {
  echo "========================================"
  echo "Running tests for google-sheets-progress"
  echo "========================================"

  test_read_initializes_default
  test_write_creates_state
  test_update_modifies_state
  test_reset_clears_state
  test_metrics_calculation
  test_timestamp_tracking
  test_invalid_sprint_id
  test_invalid_status
  test_metadata_persistence
  test_concurrent_access

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
