#!/usr/bin/env bash

##############################################################################
# ACE System Phase 3.1 - Anti-Pattern Detection Test Suite
# Tests: invoke-context-reflect.sh anti-pattern detection capabilities
#
# Test Coverage:
# 1. Critical anti-pattern (confidence < 0.50)
# 2. Warning pattern (confidence < 0.70)
# 3. Success pattern (confidence >= 0.90)
# 4. Solution extraction from final feedback
# 5. Tag generation from feedback
# 6. SQLite storage verification
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-ace-system"
TEST_DB="$PROJECT_ROOT/.artifacts/database/test-antipattern.db"
MEMORY_PATH="${ACE_MEMORY_PATH:-$PROJECT_ROOT/.artifacts/database/swarm-memory.db}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Initialize test database
init_test_db() {
  echo "Initializing test database: $TEST_DB"
  rm -f "$TEST_DB"

  # Create schema
  sqlite3 "$TEST_DB" < "$SKILL_DIR/schema/001-create-context-reflections.sql"

  echo "Test database initialized"
}

# Test result helper
assert_equal() {
  local actual="$1"
  local expected="$2"
  local test_name="$3"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [ "$actual" == "$expected" ]; then
    echo -e "${GREEN}✓${NC} PASS: $test_name"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    echo -e "${RED}✗${NC} FAIL: $test_name"
    echo "  Expected: $expected"
    echo "  Actual:   $actual"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi
}

assert_contains() {
  local actual="$1"
  local expected_substring="$2"
  local test_name="$3"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if echo "$actual" | grep -q "$expected_substring"; then
    echo -e "${GREEN}✓${NC} PASS: $test_name"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    echo -e "${RED}✗${NC} FAIL: $test_name"
    echo "  Expected substring: $expected_substring"
    echo "  Actual:   $actual"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi
}

assert_json_field() {
  local json="$1"
  local field="$2"
  local expected="$3"
  local test_name="$4"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  actual=$(echo "$json" | jq -r "$field")

  if [ "$actual" == "$expected" ]; then
    echo -e "${GREEN}✓${NC} PASS: $test_name"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    echo -e "${RED}✗${NC} FAIL: $test_name"
    echo "  Field:    $field"
    echo "  Expected: $expected"
    echo "  Actual:   $actual"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi
}

# Test 1: Critical Anti-Pattern (confidence < 0.50)
test_critical_antipattern() {
  echo ""
  echo "=== Test 1: Critical Anti-Pattern (confidence 0.45) ==="

  result=$("$SKILL_DIR/invoke-context-reflect.sh" \
    --confidence 0.45 \
    --iterations 3 \
    --feedback "Missing error boundaries caused app crashes" \
    --task-id "sprint-dashboard-002" \
    --sprint-ref "SPRINT-001" \
    --domain "frontend" \
    --memory-path "$TEST_DB")

  echo "Result: $result"

  # Validate response
  assert_json_field "$result" ".reflection_type" "anti-pattern" "Reflection type is anti-pattern"
  assert_json_field "$result" ".severity" "critical" "Severity is critical"
  assert_json_field "$result" ".confidence" "0.45" "Confidence preserved"
  assert_json_field "$result" ".iterations" "3" "Iterations preserved"
  assert_json_field "$result" ".stored" "true" "Data stored in SQLite"

  # Validate SQLite storage
  db_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM context_reflections WHERE task_id='sprint-dashboard-002'")
  assert_equal "$db_count" "1" "SQLite record created"

  db_type=$(sqlite3 "$TEST_DB" "SELECT reflection_type FROM context_reflections WHERE task_id='sprint-dashboard-002'")
  assert_equal "$db_type" "anti-pattern" "SQLite reflection_type correct"

  db_severity=$(sqlite3 "$TEST_DB" "SELECT json_extract(metadata, '\$.severity') FROM context_reflections WHERE task_id='sprint-dashboard-002'")
  assert_equal "$db_severity" "critical" "SQLite severity correct"
}

# Test 2: Warning Pattern (confidence < 0.70)
test_warning_pattern() {
  echo ""
  echo "=== Test 2: Warning Pattern (confidence 0.65) ==="

  result=$("$SKILL_DIR/invoke-context-reflect.sh" \
    --confidence 0.65 \
    --iterations 2 \
    --feedback "Test coverage below 80%" \
    --task-id "sprint-api-001" \
    --domain "backend" \
    --memory-path "$TEST_DB")

  echo "Result: $result"

  assert_json_field "$result" ".reflection_type" "warning" "Reflection type is warning"
  assert_json_field "$result" ".severity" "warning" "Severity is warning"
  assert_json_field "$result" ".confidence" "0.65" "Confidence preserved"

  # Check tags generated
  db_tags=$(sqlite3 "$TEST_DB" "SELECT json_extract(metadata, '\$.tags') FROM context_reflections WHERE task_id='sprint-api-001'")
  assert_contains "$db_tags" "testing" "Tags contain 'testing'"
  assert_contains "$db_tags" "coverage" "Tags contain 'coverage'"
}

# Test 3: Success Pattern (confidence >= 0.90)
test_success_pattern() {
  echo ""
  echo "=== Test 3: Success Pattern (confidence 0.92) ==="

  result=$("$SKILL_DIR/invoke-context-reflect.sh" \
    --confidence 0.92 \
    --iterations 1 \
    --feedback "All acceptance criteria met" \
    --task-id "sprint-auth-003" \
    --memory-path "$TEST_DB")

  echo "Result: $result"

  assert_json_field "$result" ".reflection_type" "strategy" "Reflection type is strategy"
  assert_json_field "$result" ".severity" "info" "Severity is info"
}

# Test 4: Solution Extraction
test_solution_extraction() {
  echo ""
  echo "=== Test 4: Solution Extraction from Final Feedback ==="

  result=$("$SKILL_DIR/invoke-context-reflect.sh" \
    --confidence 0.48 \
    --iterations 3 \
    --feedback "Security vulnerability in authentication" \
    --task-id "sprint-security-001" \
    --final-decision "PROCEED" \
    --final-feedback "Implemented security best practices including JWT validation" \
    --memory-path "$TEST_DB")

  echo "Result: $result"

  solution=$(echo "$result" | jq -r '.solution')
  assert_contains "$solution" "security" "Solution extracted"

  # Verify SQLite storage includes solution
  db_lessons=$(sqlite3 "$TEST_DB" "SELECT extracted_lessons FROM context_reflections WHERE task_id='sprint-security-001'")
  assert_contains "$db_lessons" "solution" "SQLite contains solution"
}

# Test 5: Tag Generation
test_tag_generation() {
  echo ""
  echo "=== Test 5: Tag Generation from Feedback ==="

  result=$("$SKILL_DIR/invoke-context-reflect.sh" \
    --confidence 0.55 \
    --iterations 2 \
    --feedback "Missing error handling, test failures, and performance issues detected" \
    --task-id "sprint-multi-tag-001" \
    --memory-path "$TEST_DB")

  echo "Result: $result"

  # Verify multiple tags generated
  db_tags=$(sqlite3 "$TEST_DB" "SELECT json_extract(metadata, '\$.tags') FROM context_reflections WHERE task_id='sprint-multi-tag-001'")
  echo "Generated tags: $db_tags"

  assert_contains "$db_tags" "error-handling" "Tags contain 'error-handling'"
  assert_contains "$db_tags" "testing" "Tags contain 'testing'"
  assert_contains "$db_tags" "performance" "Tags contain 'performance'"
}

# Test 6: Failure Reason Extraction
test_failure_reason_extraction() {
  echo ""
  echo "=== Test 6: Failure Reason Extraction ==="

  # Test each failure pattern
  patterns=(
    "0.42|Missing error boundaries in React|Missing error handling"
    "0.38|Security vulnerabilities in API|Security vulnerability detected"
    "0.44|Test suite failing with 15 errors|Test failures"
    "0.46|Performance bottleneck in DB queries|Performance issues"
    "0.41|Missing input validation on forms|Input validation missing"
  )

  test_num=1
  for pattern in "${patterns[@]}"; do
    IFS='|' read -r confidence feedback expected_reason <<< "$pattern"

    result=$("$SKILL_DIR/invoke-context-reflect.sh" \
      --confidence "$confidence" \
      --iterations 2 \
      --feedback "$feedback" \
      --task-id "sprint-reason-test-$test_num" \
      --memory-path "$TEST_DB")

    actual_reason=$(echo "$result" | jq -r '.failure_reason')
    assert_equal "$actual_reason" "$expected_reason" "Failure reason extraction: $feedback"

    test_num=$((test_num + 1))
  done
}

# Test 7: Database Query Views
test_database_views() {
  echo ""
  echo "=== Test 7: Database View Queries ==="

  # Query recent failures view
  failures=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM v_recent_failures")
  echo "Recent failures count: $failures"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  if [ "$failures" -ge 3 ]; then
    echo -e "${GREEN}✓${NC} PASS: v_recent_failures view returns results"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}✗${NC} FAIL: v_recent_failures view empty (expected >= 3, got $failures)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi

  # Query by severity
  critical_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM context_reflections WHERE json_extract(metadata, '\$.severity') = 'critical'")
  echo "Critical anti-patterns count: $critical_count"

  # Test should have created multiple critical patterns (Test 1 + Test 4 + Test 6)
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  if [ "$critical_count" -ge 5 ]; then
    echo -e "${GREEN}✓${NC} PASS: Critical severity filter works (found $critical_count)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}✗${NC} FAIL: Critical severity filter (expected >= 5, got $critical_count)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# Test 8: Sprint Reference Tracking
test_sprint_reference() {
  echo ""
  echo "=== Test 8: Sprint Reference Tracking ==="

  result=$("$SKILL_DIR/invoke-context-reflect.sh" \
    --confidence 0.43 \
    --iterations 4 \
    --feedback "Architecture refactor needed" \
    --task-id "sprint-refactor-001" \
    --sprint-ref "EPIC-ACE-001-PHASE-3.1" \
    --memory-path "$TEST_DB")

  # Verify sprint_ref stored in metadata
  db_sprint_ref=$(sqlite3 "$TEST_DB" "SELECT json_extract(metadata, '\$.sprint_ref') FROM context_reflections WHERE task_id='sprint-refactor-001'")
  assert_equal "$db_sprint_ref" "EPIC-ACE-001-PHASE-3.1" "Sprint reference tracked"
}

# Main execution
main() {
  echo "========================================"
  echo "ACE Anti-Pattern Detection Test Suite"
  echo "========================================"

  # Initialize
  init_test_db

  # Run tests
  test_critical_antipattern
  test_warning_pattern
  test_success_pattern
  test_solution_extraction
  test_tag_generation
  test_failure_reason_extraction
  test_database_views
  test_sprint_reference

  # Summary
  echo ""
  echo "========================================"
  echo "Test Summary"
  echo "========================================"
  echo "Total Tests:  $TOTAL_TESTS"
  echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"
  if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}Failed:       $FAILED_TESTS${NC}"
  else
    echo "Failed:       $FAILED_TESTS"
  fi
  echo "========================================"

  if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
  else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
  fi
}

main "$@"
