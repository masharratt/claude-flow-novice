#!/bin/bash
# Test negative context formatter functionality
# Tests formatting, filtering, security redaction

set -euo pipefail

TEST_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/tests/ace-integration"
SCRIPT="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-ace-system/format-negative-context.sh"
ACE_DB="/mnt/c/Users/masha/Documents/claude-flow-novice/ace-context.db"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test helper
run_test() {
  local test_name="$1"
  local test_command="$2"
  local expected_pattern="$3"
  
  echo "TEST: $test_name"
  
  if OUTPUT=$(eval "$test_command" 2>&1); then
    if echo "$OUTPUT" | grep -q "$expected_pattern"; then
      echo "✅ PASS: $test_name"
      ((TESTS_PASSED++))
      return 0
    else
      echo "❌ FAIL: $test_name (pattern not found)"
      echo "Expected pattern: $expected_pattern"
      echo "Actual output: $OUTPUT"
      ((TESTS_FAILED++))
      return 1
    fi
  else
    echo "❌ FAIL: $test_name (command failed)"
    echo "Output: $OUTPUT"
    ((TESTS_FAILED++))
    return 1
  fi
}

# Setup test database with sample anti-patterns
setup_test_data() {
  echo "Setting up test database..."

  # Insert sample anti-patterns
  sqlite3 "$ACE_DB" << 'SQL'
INSERT INTO context_reflections (
  id, reflection_type, task_id, agent_id, swarm_id,
  extracted_lessons, metadata, confidence,
  execution_trace, feedback_signals, created_at
) VALUES
(
  'test-anti-1',
  'anti-pattern',
  'test-task-1',
  'test-security-1',
  'test-swarm-1',
  json('{"anti_pattern": "Long-lived access tokens", "solution": "Use 15-min access tokens + refresh token rotation"}'),
  json('{"severity": "critical", "sprint_ref": "session-management-001", "tags": "security,JWT,session", "domain": "security"}'),
  0.45,
  json('{"iterations": 3, "final_decision": "ITERATE"}'),
  json('{"loop2_feedback": ["Security risk"], "product_owner_decision": "ITERATE"}'),
  datetime('now')
),
(
  'test-anti-2',
  'anti-pattern',
  'test-task-2',
  'test-frontend-1',
  'test-swarm-1',
  json('{"anti_pattern": "Missing error boundaries", "solution": "Wrap components in React ErrorBoundary"}'),
  json('{"severity": "high", "sprint_ref": "dashboard-ui-002", "tags": "frontend,React,error-handling", "domain": "frontend"}'),
  0.65,
  json('{"iterations": 2, "final_decision": "ITERATE"}'),
  json('{"loop2_feedback": ["Error handling needed"], "product_owner_decision": "ITERATE"}'),
  datetime('now')
),
(
  'test-warn-1',
  'warning',
  'test-task-3',
  'test-testing-1',
  'test-swarm-1',
  json('{"anti_pattern": "Insufficient test coverage", "solution": "Add integration tests for edge cases"}'),
  json('{"severity": "medium", "sprint_ref": "api-implementation-003", "tags": "testing,coverage", "domain": "testing"}'),
  0.68,
  json('{"iterations": 1, "final_decision": "ITERATE"}'),
  json('{"loop2_feedback": ["Low coverage"], "product_owner_decision": "ITERATE"}'),
  datetime('now')
),
(
  'test-anti-3',
  'anti-pattern',
  'test-task-4',
  'test-security-2',
  'test-swarm-1',
  json('{"anti_pattern": "API key exposed as sk_live_abc123xyz789", "solution": null}'),
  json('{"severity": "critical", "sprint_ref": "security-audit-001", "tags": "security,credentials", "domain": "security"}'),
  0.30,
  json('{"iterations": 1, "final_decision": "ABORT"}'),
  json('{"loop2_feedback": ["Critical security issue"], "product_owner_decision": "ABORT"}'),
  datetime('now')
);
SQL

  echo "Test data inserted"
}

# Cleanup test data
cleanup_test_data() {
  echo "Cleaning up test database..."
  sqlite3 "$ACE_DB" "DELETE FROM context_reflections WHERE id LIKE 'test-%' OR agent_id LIKE 'test-%';" 2>/dev/null || true
  echo "Test data cleaned"
}

# Run tests
echo "======================================"
echo "Negative Context Formatter Test Suite"
echo "======================================"
echo ""

# Cleanup first (in case previous run failed)
cleanup_test_data

# Setup
setup_test_data

# Test 1: Basic formatting
run_test "Basic anti-pattern formatting" \
  "$SCRIPT --limit 3" \
  "### ⚠️ Anti-Patterns to Avoid"

# Test 2: Domain filtering (security)
run_test "Domain filtering (security)" \
  "$SCRIPT --domain security --limit 5" \
  "Long-lived access tokens"

# Test 3: Tag filtering (relevance scoring)
run_test "Tag filtering (JWT)" \
  "$SCRIPT --task-tags JWT,session --limit 5" \
  "session-management-001"

# Test 4: Severity emoji rendering
run_test "Severity emoji (critical)" \
  "$SCRIPT --limit 5" \
  "🚫"

# Test 5: Iteration count display
run_test "Iteration count display" \
  "$SCRIPT --limit 5" \
  "failed in [0-9]+ sprint"

# Test 6: Security redaction (API keys)
OUTPUT=$($SCRIPT --domain security --limit 5)
if echo "$OUTPUT" | grep -q "sk_live_abc123xyz789"; then
  echo "❌ FAIL: Security redaction (API key exposed)"
  ((TESTS_FAILED++))
elif echo "$OUTPUT" | grep -q "\[REDACTED\]"; then
  echo "✅ PASS: Security redaction (API key redacted)"
  ((TESTS_PASSED++))
else
  echo "❌ FAIL: Security redaction (pattern not found)"
  ((TESTS_FAILED++))
fi

# Test 7: Solution handling (null values)
run_test "Solution handling (null)" \
  "$SCRIPT --limit 5" \
  "Not yet determined"

# Test 8: Input sanitization (SQL injection prevention)
run_test "Input sanitization (safe)" \
  "$SCRIPT --domain 'security; DROP TABLE context_reflections;--' --limit 1" \
  "Anti-Patterns to Avoid"

# Test 9: Limit boundary validation
if $SCRIPT --limit 100 2>&1 | grep -q "Error: --limit must be between 1 and 20"; then
  echo "✅ PASS: Limit boundary validation"
  ((TESTS_PASSED++))
else
  echo "❌ FAIL: Limit boundary validation"
  ((TESTS_FAILED++))
fi

# Test 10: No results handling
run_test "No results handling" \
  "$SCRIPT --domain nonexistent --limit 5" \
  "No anti-patterns found matching criteria"

# Cleanup
cleanup_test_data

# Summary
echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo "✅ All tests passed"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi
