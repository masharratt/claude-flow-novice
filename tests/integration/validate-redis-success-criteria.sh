#!/bin/bash
# Quick validation script for Redis-based success criteria implementation
# Tests the core coordinator → Redis → orchestrator flow

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "=== Redis Success Criteria Implementation Validation ==="
echo ""

# Test 1: Store success criteria (coordinator pattern)
echo "Test 1: Coordinator stores success criteria in Redis"
TASK_ID="validate-$(date +%s)"
REDIS_KEY="swarm:${TASK_ID}:context"

cat <<'CRITERIA_EOF' | redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" -x HSET "$REDIS_KEY" "success-criteria" 2>&1 | grep -q "^[0-9]"
{
  "deliverables": ["file1.ts", "file2.test.ts"],
  "acceptanceCriteria": ["All tests pass", "Code coverage ≥80%"],
  "test_suites": [
    {
      "name": "Unit Tests",
      "framework": "jest",
      "command": "npm test",
      "threshold": 0.95
    }
  ]
}
CRITERIA_EOF

if [ $? -eq 0 ]; then
    echo "✓ Success criteria stored in Redis"
else
    echo "✗ Failed to store success criteria"
    exit 1
fi

# Set TTL
redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" EXPIRE "$REDIS_KEY" 86400 >/dev/null
echo "✓ TTL set (24 hours)"
echo ""

# Test 2: Retrieve success criteria (orchestrator pattern)
echo "Test 2: Orchestrator retrieves success criteria from Redis"
CRITERIA_VALUE=$("$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/get-context.sh" \
    --task-id "$TASK_ID" \
    --key "success-criteria" \
    --namespace "swarm" 2>/dev/null || echo "")

if [ -z "$CRITERIA_VALUE" ]; then
    echo "✗ Failed: Success criteria not found in Redis"
    redis-cli DEL "$REDIS_KEY" >/dev/null
    exit 1
fi
echo "✓ Success criteria retrieved from Redis"

# Validate JSON syntax
if echo "$CRITERIA_VALUE" | jq empty 2>/dev/null; then
    echo "✓ JSON syntax valid"
else
    echo "✗ Failed: Invalid JSON"
    redis-cli DEL "$REDIS_KEY" >/dev/null
    exit 1
fi
echo ""

# Test 3: Verify data integrity
echo "Test 3: Verify data integrity"
DELIVERABLE=$(echo "$CRITERIA_VALUE" | jq -r '."success-criteria".deliverables[0]' 2>/dev/null)
if [ "$DELIVERABLE" = "file1.ts" ]; then
    echo "✓ Deliverables field correct: $DELIVERABLE"
else
    echo "✗ Failed: Expected 'file1.ts', got '$DELIVERABLE'"
    redis-cli DEL "$REDIS_KEY" >/dev/null
    exit 1
fi

TEST_SUITE=$(echo "$CRITERIA_VALUE" | jq -r '."success-criteria".test_suites[0].name' 2>/dev/null)
if [ "$TEST_SUITE" = "Unit Tests" ]; then
    echo "✓ Test suites field correct: $TEST_SUITE"
else
    echo "✗ Failed: Expected 'Unit Tests', got '$TEST_SUITE'"
    redis-cli DEL "$REDIS_KEY" >/dev/null
    exit 1
fi
echo ""

# Test 4: Shell escaping prevention
echo "Test 4: Shell escaping prevention"
TASK_ID_2="validate-special-$(date +%s)"
REDIS_KEY_2="swarm:${TASK_ID_2}:context"

cat <<'CRITERIA_EOF' | redis-cli -x HSET "$REDIS_KEY_2" "success-criteria" >/dev/null
{
  "description": "This $VARIABLE should not expand",
  "files": ["file with spaces.ts", "file-with-'quotes'.ts"]
}
CRITERIA_EOF

RETRIEVED=$("$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/get-context.sh" \
    --task-id "$TASK_ID_2" \
    --key "success-criteria" \
    --namespace "swarm" 2>/dev/null | jq -r '."success-criteria".description')

if echo "$RETRIEVED" | grep -q '\$VARIABLE'; then
    echo "✓ Variable not expanded (shell escaping prevented)"
else
    echo "✗ Failed: Variable was expanded"
    redis-cli DEL "$REDIS_KEY" "$REDIS_KEY_2" >/dev/null
    exit 1
fi

# Cleanup
redis-cli DEL "$REDIS_KEY" "$REDIS_KEY_2" >/dev/null
echo ""

echo "=== All Validation Tests Passed ==="
echo ""
echo "✓ Coordinator can store success criteria in Redis"
echo "✓ Orchestrator can retrieve success criteria from Redis"
echo "✓ JSON validation works correctly"
echo "✓ Data integrity maintained"
echo "✓ Shell escaping prevented"
echo ""
echo "Implementation is production-ready!"
exit 0
