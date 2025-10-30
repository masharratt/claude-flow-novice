#!/bin/bash
# Quick test suite for negative context formatter
# Focuses on core functionality without complex test harness

set -euo pipefail

SCRIPT="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-ace-system/format-negative-context.sh"
ACE_DB="/mnt/c/Users/masha/Documents/claude-flow-novice/ace-context.db"

echo "========================================"
echo "Negative Formatter Quick Test Suite"
echo "========================================"
echo ""

# Cleanup any previous test data
echo "Cleaning up test database..."
sqlite3 "$ACE_DB" "DELETE FROM context_reflections WHERE id LIKE 'test-%' OR agent_id LIKE 'test-%';" 2>/dev/null || true
echo "✓ Cleanup complete"
echo ""

# Insert test data
echo "Inserting test data..."
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
echo "✓ Test data inserted (3 anti-patterns)"
echo ""

# Test 1: Basic output formatting
echo "Test 1: Basic output formatting"
OUTPUT=$(timeout 5 "$SCRIPT" --limit 3 2>&1)
if echo "$OUTPUT" | grep -q "### ⚠️ Anti-Patterns to Avoid"; then
  echo "✅ PASS: Header present"
else
  echo "❌ FAIL: Header missing"
  exit 1
fi
echo ""

# Test 2: Severity emojis
echo "Test 2: Severity emojis (critical = 🚫)"
OUTPUT=$(timeout 5 "$SCRIPT" --limit 3 2>&1)
if echo "$OUTPUT" | grep -q "🚫"; then
  echo "✅ PASS: Critical emoji present"
else
  echo "❌ FAIL: Critical emoji missing"
  exit 1
fi
echo ""

# Test 3: Domain filtering (security)
echo "Test 3: Domain filtering (security only)"
OUTPUT=$(timeout 5 "$SCRIPT" --domain security --limit 5 2>&1)
if echo "$OUTPUT" | grep -q "Long-lived access tokens"; then
  echo "✅ PASS: Security anti-pattern found"
else
  echo "❌ FAIL: Security anti-pattern missing"
  exit 1
fi
echo ""

# Test 4: Tag filtering
echo "Test 4: Tag filtering (JWT relevance)"
OUTPUT=$(timeout 5 "$SCRIPT" --task-tags "JWT,session" --limit 5 2>&1)
if echo "$OUTPUT" | grep -q "session-management-001"; then
  echo "✅ PASS: JWT-tagged anti-pattern found"
else
  echo "❌ FAIL: JWT-tagged anti-pattern missing"
  exit 1
fi
echo ""

# Test 5: Security redaction (API keys)
echo "Test 5: Security redaction (sk_live_XXX → [REDACTED_API_KEY])"
OUTPUT=$(timeout 5 "$SCRIPT" --domain security --limit 5 2>&1)
if echo "$OUTPUT" | grep -q "sk_live_abc123xyz789"; then
  echo "❌ FAIL: API key exposed (not redacted)"
  exit 1
elif echo "$OUTPUT" | grep -q "\[REDACTED_API_KEY\]"; then
  echo "✅ PASS: API key properly redacted"
else
  echo "❌ FAIL: API key pattern not found"
  exit 1
fi
echo ""

# Test 6: Null solution handling
echo "Test 6: Null solution handling"
OUTPUT=$(timeout 5 "$SCRIPT" --limit 5 2>&1)
if echo "$OUTPUT" | grep -q "Not yet determined"; then
  echo "✅ PASS: Null solution handled"
else
  echo "❌ FAIL: Null solution not handled"
  exit 1
fi
echo ""

# Test 7: Iteration count display
echo "Test 7: Iteration count display"
OUTPUT=$(timeout 5 "$SCRIPT" --limit 5 2>&1)
if echo "$OUTPUT" | grep -q "failed in [0-9]* sprint"; then
  echo "✅ PASS: Iteration count displayed"
else
  echo "❌ FAIL: Iteration count missing"
  exit 1
fi
echo ""

# Test 8: Input sanitization (prevent SQL injection)
echo "Test 8: Input sanitization (SQL injection prevention)"
OUTPUT=$(timeout 5 "$SCRIPT" --domain "security; DROP TABLE context_reflections;--" --limit 1 2>&1)
if [ $? -eq 0 ]; then
  # Check database still exists
  if sqlite3 "$ACE_DB" "SELECT COUNT(*) FROM context_reflections WHERE id LIKE 'test-%';" | grep -q "3"; then
    echo "✅ PASS: SQL injection prevented, data intact"
  else
    echo "❌ FAIL: Data corruption detected"
    exit 1
  fi
else
  echo "✅ PASS: Invalid input rejected"
fi
echo ""

# Test 9: Limit boundary validation
echo "Test 9: Limit boundary validation (max 20)"
OUTPUT=$(timeout 5 "$SCRIPT" --limit 100 2>&1 || true)
if echo "$OUTPUT" | grep -q "Error: --limit must be between 1 and 20"; then
  echo "✅ PASS: Limit boundary enforced"
else
  echo "❌ FAIL: Limit boundary not enforced"
  echo "Output: $OUTPUT"
  exit 1
fi
echo ""

# Test 10: No results handling
echo "Test 10: No results handling (nonexistent domain)"
OUTPUT=$(timeout 5 "$SCRIPT" --domain "nonexistent" --limit 5 2>&1)
if echo "$OUTPUT" | grep -q "No anti-patterns found matching criteria"; then
  echo "✅ PASS: No results message displayed"
else
  echo "❌ FAIL: No results message missing"
  exit 1
fi
echo ""

# Cleanup
echo "Cleaning up test database..."
sqlite3 "$ACE_DB" "DELETE FROM context_reflections WHERE id LIKE 'test-%' OR agent_id LIKE 'test-%';" 2>/dev/null || true
echo "✓ Cleanup complete"
echo ""

# Summary
echo "========================================"
echo "✅ All 10 tests passed"
echo "========================================"
echo ""
echo "Validated functionality:"
echo "- Output formatting with severity emojis"
echo "- Domain and tag filtering"
echo "- Security redaction (API keys, tokens)"
echo "- Null value handling"
echo "- Input sanitization (SQL injection prevention)"
echo "- Boundary validation"
echo ""

exit 0
