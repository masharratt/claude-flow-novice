#!/usr/bin/env bash
##############################################################################
# CFN Bootstrap Test Suite
#
# Purpose: Validate Sprint 7 features before using CFN to build more tests
#
# Tests:
#   1. Complexity analyzer scoring
#   2. Difficulty classification
#   3. Agent count scaling
#   4. Domain detection
#   5. JSON output validation
#   6. Background execution
#   7. Difficulty override
#
# Usage:
#   ./tests/cfn-bootstrap.test.sh
#
# Requirements:
#   - Redis running
#   - analyze-task-complexity.sh
#   - cfn-loop-exec.sh
##############################################################################

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test helpers
test_start() {
  echo -e "${BLUE}[TEST $((TESTS_RUN + 1))]${NC} $1"
  TESTS_RUN=$((TESTS_RUN + 1))
}

test_pass() {
  echo -e "${GREEN}  ✓ PASS${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

test_fail() {
  echo -e "${RED}  ✗ FAIL${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  local message="${3:-Expected $expected, got $actual}"

  if [ "$expected" = "$actual" ]; then
    test_pass "$message"
  else
    test_fail "$message (expected: $expected, actual: $actual)"
  fi
}

assert_greater_than() {
  local value="$1"
  local threshold="$2"
  local message="${3:-Expected $value > $threshold}"

  if [ "$value" -gt "$threshold" ]; then
    test_pass "$message"
  else
    test_fail "$message ($value <= $threshold)"
  fi
}

assert_json_valid() {
  local json="$1"
  local message="${2:-JSON is valid}"

  if echo "$json" | jq -e '.' > /dev/null 2>&1; then
    test_pass "$message"
  else
    test_fail "$message (invalid JSON)"
  fi
}

assert_json_field() {
  local json="$1"
  local field="$2"
  local expected="$3"
  local message="${4:-Field $field = $expected}"

  local actual=$(echo "$json" | jq -r ".$field")

  if [ "$actual" = "$expected" ]; then
    test_pass "$message"
  else
    test_fail "$message (expected: $expected, actual: $actual)"
  fi
}

echo ""
echo "========================================"
echo "  CFN Bootstrap Test Suite (Sprint 7)"
echo "========================================"
echo ""

# ==============================================================================
# TEST 1: Complexity Analyzer - Simple Task
# ==============================================================================
test_start "Complexity analyzer detects simple task"

RESULT=$(./.claude/skills/redis-coordination/analyze-task-complexity.sh --task "Fix button")
DIFFICULTY=$(echo "$RESULT" | jq -r '.difficulty')
LOOP3=$(echo "$RESULT" | jq -r '.suggested_agents.loop3_count')
SCORE=$(echo "$RESULT" | jq -r '.complexity_score')

assert_equals "simple" "$DIFFICULTY" "Simple task classified correctly"
assert_equals "1" "$LOOP3" "Simple task suggests 1 implementer"
assert_greater_than "$SCORE" "0" "Complexity score is positive"

# ==============================================================================
# TEST 2: Complexity Analyzer - Standard Task
# ==============================================================================
test_start "Complexity analyzer detects standard task"

RESULT=$(./.claude/skills/redis-coordination/analyze-task-complexity.sh \
  --task "Build React dashboard with API integration")
DIFFICULTY=$(echo "$RESULT" | jq -r '.difficulty')
LOOP3=$(echo "$RESULT" | jq -r '.suggested_agents.loop3_count')

# Standard should be 2-3 implementers
if [ "$LOOP3" -ge 2 ] && [ "$LOOP3" -le 4 ]; then
  test_pass "Standard task suggests 2-4 implementers (got $LOOP3)"
else
  test_fail "Standard task should suggest 2-4 implementers (got $LOOP3)"
fi

# ==============================================================================
# TEST 3: Complexity Analyzer - Complex Task
# ==============================================================================
test_start "Complexity analyzer detects complex task"

RESULT=$(./.claude/skills/redis-coordination/analyze-task-complexity.sh \
  --task "Build full-stack authentication with React frontend, Rust backend, and AWS deployment")
DIFFICULTY=$(echo "$RESULT" | jq -r '.difficulty')
LOOP3=$(echo "$RESULT" | jq -r '.suggested_agents.loop3_count')
DOMAINS=$(echo "$RESULT" | jq -r '.analysis.domain_count')

# Complex/Enterprise should be 3+ implementers
assert_greater_than "$LOOP3" "2" "Complex task suggests 3+ implementers (got $LOOP3)"
assert_greater_than "$DOMAINS" "2" "Complex task has multiple domains (got $DOMAINS)"

# ==============================================================================
# TEST 4: Complexity Analyzer - Enterprise Scope Modifier
# ==============================================================================
test_start "Complexity analyzer detects enterprise scope"

RESULT=$(./.claude/skills/redis-coordination/analyze-task-complexity.sh \
  --task "Build enterprise-grade payment processing system")
SCORE=$(echo "$RESULT" | jq -r '.complexity_score')

# Enterprise keyword should boost score
assert_greater_than "$SCORE" "7" "Enterprise scope increases complexity (got $SCORE)"

# ==============================================================================
# TEST 5: Agent Scaling - Increases with Complexity
# ==============================================================================
test_start "Agent count scales with task complexity"

SIMPLE=$(./.claude/skills/redis-coordination/analyze-task-complexity.sh \
  --task "Fix bug" | jq -r '.suggested_agents.loop3_count')

COMPLEX=$(./.claude/skills/redis-coordination/analyze-task-complexity.sh \
  --task "Build enterprise multi-domain system with React, Rust, and AWS" | \
  jq -r '.suggested_agents.loop3_count')

if [ "$COMPLEX" -gt "$SIMPLE" ]; then
  test_pass "Agent count scales (simple: $SIMPLE, complex: $COMPLEX)"
else
  test_fail "Agent count should scale (simple: $SIMPLE, complex: $COMPLEX)"
fi

# ==============================================================================
# TEST 6: Domain Detection - Frontend
# ==============================================================================
test_start "Domain detection finds frontend work"

RESULT=$(./.claude/skills/redis-coordination/analyze-task-complexity.sh \
  --task "Build React dashboard")
DOMAINS=$(echo "$RESULT" | jq -r '.domains[]')

if echo "$DOMAINS" | grep -q "frontend"; then
  test_pass "Frontend domain detected in React task"
else
  test_fail "Frontend domain not detected (domains: $DOMAINS)"
fi

# ==============================================================================
# TEST 7: Domain Detection - Multiple Domains
# ==============================================================================
test_start "Domain detection finds multiple domains"

RESULT=$(./.claude/skills/redis-coordination/analyze-task-complexity.sh \
  --task "Build API with React frontend and database")
DOMAIN_COUNT=$(echo "$RESULT" | jq -r '.analysis.domain_count')

assert_greater_than "$DOMAIN_COUNT" "1" "Multiple domains detected (got $DOMAIN_COUNT)"

# ==============================================================================
# TEST 8: JSON Output Validation
# ==============================================================================
test_start "Orchestration script outputs valid JSON"

OUTPUT=$(./.claude/skills/redis-coordination/cfn-loop-exec.sh \
  --task "Test task" \
  --background \
  --output json 2>/dev/null)

assert_json_valid "$OUTPUT" "Orchestration JSON is valid"
assert_json_field "$OUTPUT" "status" "running" "Status field is 'running'"

# Check required fields
if echo "$OUTPUT" | jq -e '.task_id' > /dev/null 2>&1; then
  test_pass "JSON contains task_id field"
else
  test_fail "JSON missing task_id field"
fi

if echo "$OUTPUT" | jq -e '.agents.loop3' > /dev/null 2>&1; then
  test_pass "JSON contains agents.loop3 field"
else
  test_fail "JSON missing agents.loop3 field"
fi

# ==============================================================================
# TEST 9: Agent Selection - Frontend Task
# ==============================================================================
test_start "Agent selection for frontend task"

OUTPUT=$(./.claude/skills/redis-coordination/cfn-loop-exec.sh \
  --task "Build React dashboard" \
  --background \
  --output json 2>/dev/null)

AGENTS=$(echo "$OUTPUT" | jq -r '.agents.loop3[]')

if echo "$AGENTS" | grep -q "react-frontend-engineer"; then
  test_pass "React frontend engineer selected for React task"
else
  test_fail "React frontend engineer not selected (agents: $AGENTS)"
fi

# ==============================================================================
# TEST 10: Difficulty Override
# ==============================================================================
test_start "Difficulty override works"

# Complex task forced to simple
RESULT=$(./.claude/skills/redis-coordination/analyze-task-complexity.sh \
  --task "Build enterprise authentication system" \
  --difficulty simple)

DIFFICULTY=$(echo "$RESULT" | jq -r '.difficulty')
LOOP3=$(echo "$RESULT" | jq -r '.suggested_agents.loop3_count')

assert_equals "simple" "$DIFFICULTY" "Difficulty override to simple works"

# Simple difficulty should cap agent count
if [ "$LOOP3" -le 2 ]; then
  test_pass "Simple difficulty caps agents at 1-2 (got $LOOP3)"
else
  test_fail "Simple difficulty should cap agents at 1-2 (got $LOOP3)"
fi

# ==============================================================================
# TEST 11: Keyword Matching - Backend
# ==============================================================================
test_start "Keyword matching detects backend work"

OUTPUT=$(./.claude/skills/redis-coordination/cfn-loop-exec.sh \
  --task "Build REST API with authentication" \
  --background \
  --output json 2>/dev/null)

AGENTS=$(echo "$OUTPUT" | jq -r '.agents.loop3[]')

if echo "$AGENTS" | grep -q "backend-dev"; then
  test_pass "Backend developer selected for API task"
else
  test_fail "Backend developer not selected (agents: $AGENTS)"
fi

# ==============================================================================
# TEST 12: JSON Schema - Required Fields
# ==============================================================================
test_start "JSON output has all required fields"

OUTPUT=$(./.claude/skills/redis-coordination/cfn-loop-exec.sh \
  --task "Test" \
  --background \
  --output json 2>/dev/null)

REQUIRED_FIELDS="status task_id orchestrator_pid agents monitor"
MISSING_FIELDS=""

for FIELD in $REQUIRED_FIELDS; do
  if ! echo "$OUTPUT" | jq -e ".$FIELD" > /dev/null 2>&1; then
    MISSING_FIELDS="$MISSING_FIELDS $FIELD"
  fi
done

if [ -z "$MISSING_FIELDS" ]; then
  test_pass "All required JSON fields present"
else
  test_fail "Missing JSON fields:$MISSING_FIELDS"
fi

# ==============================================================================
# TEST 13: Complexity Score Range Validation
# ==============================================================================
test_start "Complexity scores are within valid range"

SCORES=(
  $(./.claude/skills/redis-coordination/analyze-task-complexity.sh --task "Fix" | jq -r '.complexity_score')
  $(./.claude/skills/redis-coordination/analyze-task-complexity.sh --task "Build simple form" | jq -r '.complexity_score')
  $(./.claude/skills/redis-coordination/analyze-task-complexity.sh --task "Build dashboard" | jq -r '.complexity_score')
  $(./.claude/skills/redis-coordination/analyze-task-complexity.sh --task "Build enterprise system" | jq -r '.complexity_score')
)

ALL_VALID=true
for SCORE in "${SCORES[@]}"; do
  if [ "$SCORE" -lt 0 ] || [ "$SCORE" -gt 30 ]; then
    ALL_VALID=false
    test_fail "Score out of range: $SCORE"
  fi
done

if [ "$ALL_VALID" = true ]; then
  test_pass "All complexity scores in valid range (0-30)"
fi

# ==============================================================================
# Results Summary
# ==============================================================================
echo ""
echo "========================================"
echo "  Test Results"
echo "========================================"
echo ""
echo "Tests run:    $TESTS_RUN"
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
  echo ""
  echo "CFN Sprint 7 features validated!"
  echo "Ready to use CFN for test infrastructure development."
  echo ""
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo ""
  echo "Fix failing tests before using CFN to build more tests."
  echo ""
  exit 1
fi
