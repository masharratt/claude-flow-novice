#!/bin/bash
# Integration test for Redis-based success criteria passing
# Tests the pure Redis approach (no temp files)
#
# Success Criteria:
# - Coordinator stores success criteria in Redis using redis-cli -x HSET
# - Orchestrator validates criteria exists during pre-flight
# - No temp file management required
# - No shell escaping issues

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
    ((TESTS_RUN++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
    ((TESTS_RUN++))
}

info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Cleanup function
cleanup() {
    local task_id="$1"
    if [[ -n "$task_id" ]]; then
        redis-cli DEL "swarm:${task_id}:context" >/dev/null 2>&1 || true
    fi
}

echo "============================================"
echo "Redis Success Criteria Integration Test"
echo "============================================"
echo ""

# Test 1: Verify Redis is available
info "Test 1: Redis connectivity"
if redis-cli ping >/dev/null 2>&1; then
    pass "Redis is available"
else
    fail "Redis is not available"
    echo ""
    echo "Error: Redis is required for this test"
    exit 1
fi

# Test 2: Store success criteria using redis-cli -x HSET
info "Test 2: Store success criteria in Redis"
TASK_ID="test-redis-sc-$(date +%s)"
REDIS_KEY="swarm:${TASK_ID}:context"
cat <<'CRITERIA_EOF' | redis-cli -x HSET "$REDIS_KEY" "success-criteria" >/dev/null
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

if [[ $? -eq 0 ]]; then
    pass "Success criteria stored in Redis"
else
    fail "Failed to store success criteria"
    cleanup "$TASK_ID"
    exit 1
fi

# Test 3: Set TTL on context hash
info "Test 3: Set TTL on context"
redis-cli EXPIRE "$REDIS_KEY" 86400 >/dev/null
if [[ $? -eq 0 ]]; then
    pass "TTL set on context hash (24 hours)"
else
    fail "Failed to set TTL"
fi

# Test 4: Retrieve success criteria using get-context.sh
info "Test 4: Retrieve success criteria using get-context.sh"
RETRIEVED=$("$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/get-context.sh" \
    --task-id "$TASK_ID" \
    --key "success-criteria" \
    --namespace "swarm" 2>/dev/null || echo "")

if [[ -n "$RETRIEVED" ]]; then
    pass "Success criteria retrieved from Redis"
else
    fail "Failed to retrieve success criteria"
    cleanup "$TASK_ID"
    exit 1
fi

# Test 5: Validate JSON syntax
info "Test 5: Validate JSON syntax"
if echo "$RETRIEVED" | jq empty 2>/dev/null; then
    pass "Retrieved JSON is valid"
else
    fail "Retrieved JSON is invalid"
    cleanup "$TASK_ID"
    exit 1
fi

# Test 6: Verify deliverables field
info "Test 6: Verify deliverables field"
DELIVERABLES=$(echo "$RETRIEVED" | jq -r '.deliverables[]' 2>/dev/null)
if echo "$DELIVERABLES" | grep -q "file1.ts"; then
    pass "Deliverables field retrieved correctly"
else
    fail "Deliverables field missing or incorrect"
fi

# Test 7: Verify test_suites field
info "Test 7: Verify test_suites field"
TEST_SUITE_NAME=$(echo "$RETRIEVED" | jq -r '.test_suites[0].name' 2>/dev/null)
if [[ "$TEST_SUITE_NAME" == "Unit Tests" ]]; then
    pass "Test suites field retrieved correctly"
else
    fail "Test suites field missing or incorrect"
fi

# Test 8: Test shell escaping (special characters)
info "Test 8: Store success criteria with special characters"
TASK_ID_2="test-redis-sc-special-$(date +%s)"
REDIS_KEY_2="swarm:${TASK_ID_2}:context"
cat <<'CRITERIA_EOF' | redis-cli -x HSET "$REDIS_KEY_2" "success-criteria" >/dev/null
{
  "deliverables": ["file with spaces.ts", "file-with-'quotes'.ts"],
  "acceptanceCriteria": ["Tests \"pass\" with 95% coverage", "No \\ backslashes \\ allowed"],
  "description": "This is a $VARIABLE that should not be expanded"
}
CRITERIA_EOF

RETRIEVED_2=$("$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/get-context.sh" \
    --task-id "$TASK_ID_2" \
    --key "success-criteria" \
    --namespace "swarm" 2>/dev/null || echo "")

if echo "$RETRIEVED_2" | jq -r '.description' | grep -q '\$VARIABLE'; then
    pass "Special characters handled correctly (no shell expansion)"
else
    fail "Special characters not handled correctly"
fi

# Test 9: Simulate orchestrator pre-flight validation
info "Test 9: Orchestrator pre-flight validation"
SUCCESS_CRITERIA="enabled"
if [ -n "$SUCCESS_CRITERIA" ]; then
    CRITERIA_VALUE=$("$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/get-context.sh" \
        --task-id "$TASK_ID" \
        --key "success-criteria" \
        --namespace "swarm" 2>/dev/null || echo "")

    if [ -z "$CRITERIA_VALUE" ]; then
        fail "Pre-flight validation: Success criteria not found in Redis"
    else
        # Validate JSON syntax
        if echo "$CRITERIA_VALUE" | jq empty 2>/dev/null; then
            pass "Pre-flight validation: Success criteria validated in Redis"
        else
            fail "Pre-flight validation: Invalid JSON in Redis"
        fi
    fi
fi

# Test 10: Verify no temp files created
info "Test 10: Verify no temp files created"
TEMP_FILES=$(find /tmp -name "cfn-success-criteria-*" 2>/dev/null | wc -l)
if [[ "$TEMP_FILES" -eq 0 ]]; then
    pass "No temp files created (pure Redis approach)"
else
    fail "Temp files found: $TEMP_FILES"
fi

# Cleanup
cleanup "$TASK_ID"
cleanup "$TASK_ID_2"

# Summary
echo ""
echo "============================================"
echo "Test Summary"
echo "============================================"
echo "Total tests: $TESTS_RUN"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
