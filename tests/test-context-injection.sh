#!/usr/bin/env bash

##############################################################################
# Test Script for Context Injection Helper (Phase 1.3)
# Validates agent-specific filtering, markdown formatting, and character limits
##############################################################################

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_PATH="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/helpers/context-injection.sh"
TEST_TASK_ID="test-context-injection-$(date +%s)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

##############################################################################
# Test Helper Functions
##############################################################################
log_test() {
  echo -e "${YELLOW}[TEST]${NC} $*"
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $*"
  ((TESTS_PASSED++))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $*"
  ((TESTS_FAILED++))
}

##############################################################################
# Setup Test Data in Redis
##############################################################################
setup_test_data() {
  log_test "Setting up test data in Redis"
  echo "[DEBUG] Before redis-cli SET..." >&2

  local test_data='{"keywords":"authentication,jwt,token","domain":"backend","timestamp":"2025-10-30T02:00:00Z","similarity_threshold":0.70,"max_results":5,"query_error":false,"results":[{"id":"ref-backend-123","task":"Implement JWT authentication","similarity":0.85,"complexity":3.5,"domain":"backend","insights":[{"type":"strategy","text":"Use bcrypt for password hashing with salt rounds ≥12"},{"type":"strategy","text":"Implement JWT refresh tokens with sliding window"},{"type":"strategy","text":"Store tokens in httpOnly cookies for XSS protection"},{"type":"anti-pattern","text":"Avoid storing passwords in plain text or reversible encryption"},{"type":"anti-pattern","text":"Never expose JWT secrets in client-side code"},{"type":"edge-case","text":"Handle token expiration with graceful re-authentication flow"},{"type":"edge-case","text":"Account for clock skew in token validation (±5min tolerance)"}]},{"id":"ref-frontend-456","task":"Build React authentication UI","similarity":0.75,"complexity":2.8,"domain":"frontend","insights":[{"type":"strategy","text":"Use React Context for auth state management"},{"type":"anti-pattern","text":"Avoid storing sensitive tokens in localStorage"},{"type":"edge-case","text":"Handle race conditions with concurrent auth requests"}]},{"id":"ref-general-789","task":"Design microservices architecture","similarity":0.65,"complexity":4.2,"domain":"general","insights":[{"type":"strategy","text":"Implement distributed tracing for debugging"},{"type":"anti-pattern","text":"Avoid tight coupling between services"},{"type":"edge-case","text":"Plan for network partition scenarios"}]}]}'

  redis-cli SET "cfn_loop:${TEST_TASK_ID}:historical_context" "$test_data" EX 3600 > /dev/null 2>&1
  echo "[DEBUG] After redis-cli SET..." >&2
  log_pass "Test data stored in Redis"
  echo "[DEBUG] After log_pass..." >&2
}

##############################################################################
# Test 1: Agent-Specific Filtering (Backend)
##############################################################################
test_backend_filtering() {
  log_test "Test 1: Backend agent filtering"

  local original_context='{"task": "Implement auth", "constraints": []}'
  local result
  result=$("$SCRIPT_PATH" \
    --task-id "$TEST_TASK_ID" \
    --agent-type "backend-dev" \
    --original-context "$original_context")

  # Validate JSON
  if ! echo "$result" | jq . > /dev/null 2>&1; then
    log_fail "Invalid JSON output"
    return 1
  fi

  # Extract historical context
  local hist_context
  hist_context=$(echo "$result" | jq -r '.historical_context // empty')

  # Check that backend strategies are included
  if echo "$hist_context" | grep -q "bcrypt for password hashing"; then
    log_pass "Backend-specific strategy included"
  else
    log_fail "Backend-specific strategy missing"
  fi

  # Check that general strategies are included
  if echo "$hist_context" | grep -q "distributed tracing"; then
    log_pass "General strategy included for backend agent"
  else
    log_fail "General strategy missing for backend agent"
  fi

  # Check that frontend strategies are excluded
  if echo "$hist_context" | grep -q "React Context"; then
    log_fail "Frontend-specific strategy incorrectly included"
  else
    log_pass "Frontend-specific strategy correctly excluded"
  fi
}

##############################################################################
# Test 2: Agent-Specific Filtering (Frontend)
##############################################################################
test_frontend_filtering() {
  log_test "Test 2: Frontend agent filtering"

  local original_context='{"task": "Build UI", "constraints": []}'
  local result
  result=$("$SCRIPT_PATH" \
    --task-id "$TEST_TASK_ID" \
    --agent-type "react-frontend-engineer" \
    --original-context "$original_context")

  # Extract historical context
  local hist_context
  hist_context=$(echo "$result" | jq -r '.historical_context // empty')

  # Check that frontend strategies are included
  if echo "$hist_context" | grep -q "React Context"; then
    log_pass "Frontend-specific strategy included"
  else
    log_fail "Frontend-specific strategy missing"
  fi

  # Check that backend strategies are excluded
  if echo "$hist_context" | grep -q "bcrypt for password"; then
    log_fail "Backend-specific strategy incorrectly included"
  else
    log_pass "Backend-specific strategy correctly excluded"
  fi
}

##############################################################################
# Test 3: Markdown Formatting
##############################################################################
test_markdown_formatting() {
  log_test "Test 3: Markdown formatting"

  local original_context='{"task": "Test", "constraints": []}'
  local result
  result=$("$SCRIPT_PATH" \
    --task-id "$TEST_TASK_ID" \
    --agent-type "backend-dev" \
    --original-context "$original_context")

  local hist_context
  hist_context=$(echo "$result" | jq -r '.historical_context // empty')

  # Check for markdown headers
  if echo "$hist_context" | grep -q "## Historical Context"; then
    log_pass "Markdown header present"
  else
    log_fail "Markdown header missing"
  fi

  if echo "$hist_context" | grep -q "### Strategies"; then
    log_pass "Strategies section header present"
  else
    log_fail "Strategies section header missing"
  fi

  if echo "$hist_context" | grep -q "### Anti-Patterns"; then
    log_pass "Anti-Patterns section header present"
  else
    log_fail "Anti-Patterns section header missing"
  fi

  if echo "$hist_context" | grep -q "### Edge Cases"; then
    log_pass "Edge Cases section header present"
  else
    log_fail "Edge Cases section header missing"
  fi

  # Check for bullet points
  local bullet_count
  bullet_count=$(echo "$hist_context" | grep -c "^- " || echo 0)
  if [ "$bullet_count" -gt 0 ]; then
    log_pass "Bullet points present ($bullet_count found)"
  else
    log_fail "No bullet points found"
  fi
}

##############################################################################
# Test 4: Insight Limits (Max 3 per category)
##############################################################################
test_insight_limits() {
  log_test "Test 4: Insight limits (max 3 per category)"

  local original_context='{"task": "Test", "constraints": []}'
  local result
  result=$("$SCRIPT_PATH" \
    --task-id "$TEST_TASK_ID" \
    --agent-type "backend-dev" \
    --original-context "$original_context")

  local hist_context
  hist_context=$(echo "$result" | jq -r '.historical_context // empty')

  # Count insights under each section
  local strategies_section
  strategies_section=$(echo "$hist_context" | sed -n '/### Strategies/,/###/p' | grep "^- " || echo "")
  local strategy_count
  strategy_count=$(echo "$strategies_section" | grep -c "^- " || echo 0)

  if [ "$strategy_count" -le 3 ]; then
    log_pass "Strategy count within limit ($strategy_count ≤ 3)"
  else
    log_fail "Too many strategies ($strategy_count > 3)"
  fi

  local anti_patterns_section
  anti_patterns_section=$(echo "$hist_context" | sed -n '/### Anti-Patterns/,/###/p' | grep "^- " || echo "")
  local anti_pattern_count
  anti_pattern_count=$(echo "$anti_patterns_section" | grep -c "^- " || echo 0)

  if [ "$anti_pattern_count" -le 3 ]; then
    log_pass "Anti-pattern count within limit ($anti_pattern_count ≤ 3)"
  else
    log_fail "Too many anti-patterns ($anti_pattern_count > 3)"
  fi

  # Total should be ≤ 9
  local total_insights=$((strategy_count + anti_pattern_count))
  if [ "$total_insights" -le 9 ]; then
    log_pass "Total insights within limit ($total_insights ≤ 9)"
  else
    log_fail "Too many total insights ($total_insights > 9)"
  fi
}

##############################################################################
# Test 5: Character Limit (< 2000 chars)
##############################################################################
test_character_limit() {
  log_test "Test 5: Character limit (< 2000)"

  local original_context='{"task": "Test", "constraints": []}'
  local result
  result=$("$SCRIPT_PATH" \
    --task-id "$TEST_TASK_ID" \
    --agent-type "backend-dev" \
    --original-context "$original_context")

  local hist_context
  hist_context=$(echo "$result" | jq -r '.historical_context // empty')

  local char_count=${#hist_context}

  if [ "$char_count" -lt 2000 ]; then
    log_pass "Character count within limit ($char_count < 2000)"
  else
    log_fail "Character count exceeds limit ($char_count ≥ 2000)"
  fi
}

##############################################################################
# Test 6: JSON Validity
##############################################################################
test_json_validity() {
  log_test "Test 6: JSON validity"

  local original_context='{"task": "Test", "constraints": ["limit1", "limit2"]}'
  local result
  result=$("$SCRIPT_PATH" \
    --task-id "$TEST_TASK_ID" \
    --agent-type "backend-dev" \
    --original-context "$original_context")

  # Validate output is valid JSON
  if echo "$result" | jq . > /dev/null 2>&1; then
    log_pass "Output is valid JSON"
  else
    log_fail "Output is invalid JSON"
    return 1
  fi

  # Check that original fields are preserved
  local task_field
  task_field=$(echo "$result" | jq -r '.task // empty')
  if [ "$task_field" == "Test" ]; then
    log_pass "Original task field preserved"
  else
    log_fail "Original task field missing or modified"
  fi

  # Check that historical_context field was added
  if echo "$result" | jq -e '.historical_context' > /dev/null 2>&1; then
    log_pass "historical_context field added"
  else
    log_fail "historical_context field missing"
  fi
}

##############################################################################
# Test 7: No Context Available (Graceful Fallback)
##############################################################################
test_no_context_fallback() {
  log_test "Test 7: Graceful fallback when no context available"

  local fake_task_id="nonexistent-task-$(date +%s%N)"
  local original_context='{"task": "Test", "constraints": []}'

  local result
  result=$("$SCRIPT_PATH" \
    --task-id "$fake_task_id" \
    --agent-type "backend-dev" \
    --original-context "$original_context")

  # Should return original context unchanged
  if [ "$result" == "$original_context" ]; then
    log_pass "Returns original context when no historical data available"
  else
    log_fail "Did not return original context as fallback"
  fi
}

##############################################################################
# Test 8: Unknown Agent Type (Maps to General)
##############################################################################
test_unknown_agent_type() {
  log_test "Test 8: Unknown agent type maps to general domain"

  local original_context='{"task": "Test", "constraints": []}'
  local result
  result=$("$SCRIPT_PATH" \
    --task-id "$TEST_TASK_ID" \
    --agent-type "unknown-agent-type" \
    --original-context "$original_context")

  local hist_context
  hist_context=$(echo "$result" | jq -r '.historical_context // empty')

  # Should include general domain insights
  if echo "$hist_context" | grep -q "distributed tracing"; then
    log_pass "General domain insights included for unknown agent type"
  else
    log_fail "General domain insights missing for unknown agent type"
  fi
}

##############################################################################
# Cleanup
##############################################################################
cleanup() {
  log_test "Cleaning up test data"
  redis-cli DEL "cfn_loop:${TEST_TASK_ID}:historical_context" > /dev/null
  log_pass "Test data cleaned up"
}

##############################################################################
# Main Test Execution
##############################################################################
main() {
  echo "========================================="
  echo "Context Injection Helper - Test Suite"
  echo "========================================="
  echo ""

  # Setup
  setup_test_data
  echo "[DEBUG] Setup complete, starting tests..." >&2

  # Run tests
  echo "[DEBUG] Running test_backend_filtering..." >&2
  test_backend_filtering
  echo "[DEBUG] Running test_frontend_filtering..." >&2
  test_frontend_filtering
  echo "[DEBUG] Running test_markdown_formatting..." >&2
  test_markdown_formatting
  echo "[DEBUG] Running test_insight_limits..." >&2
  test_insight_limits
  echo "[DEBUG] Running test_character_limit..." >&2
  test_character_limit
  echo "[DEBUG] Running test_json_validity..." >&2
  test_json_validity
  echo "[DEBUG] Running test_no_context_fallback..." >&2
  test_no_context_fallback
  echo "[DEBUG] Running test_unknown_agent_type..." >&2
  test_unknown_agent_type

  # Cleanup
  cleanup

  # Summary
  echo ""
  echo "========================================="
  echo "Test Summary"
  echo "========================================="
  echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
  echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
  echo ""

  if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
    exit 0
  else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    exit 1
  fi
}

# Execute main
main "$@"
