#!/bin/bash
# ACE System Context Injection Test Suite
set -eu

# Strict error handling
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS_COUNT=0
FAIL_COUNT=0

# Utility Functions
pass() {
  echo "[✅ PASS] $1"
  ((PASS_COUNT++))
}

fail() {
  echo "[❌ FAIL] $1"
  ((FAIL_COUNT++))
}

# Setup Test Data in Redis
setup_test_data() {
  # Backend context
  redis-cli SET "cfn_loop:context-test:backend_context" "$(cat <<EOF
{
  "domain": "backend",
  "lessons": {
    "strategies": [
      {"id": "backend-strat-1", "text": "Backend Strategy 1"},
      {"id": "backend-strat-2", "text": "Backend Strategy 2"},
      {"id": "backend-strat-3", "text": "Backend Strategy 3"}
    ],
    "antiPatterns": [
      {"id": "backend-anti-1", "text": "Backend Anti-Pattern 1"},
      {"id": "backend-anti-2", "text": "Backend Anti-Pattern 2"}
    ],
    "edgeCases": [
      {"id": "backend-edge-1", "text": "Backend Edge Case 1"}
    ]
  }
}
EOF
)" EX 3600

  # Frontend context
  redis-cli SET "cfn_loop:context-test:frontend_context" "$(cat <<EOF
{
  "domain": "frontend",
  "lessons": {
    "strategies": [
      {"id": "frontend-strat-1", "text": "Frontend Strategy 1"},
      {"id": "frontend-strat-2", "text": "Frontend Strategy 2"}
    ],
    "antiPatterns": [
      {"id": "frontend-anti-1", "text": "Frontend Anti-Pattern 1"}
    ]
  }
}
EOF
)" EX 3600

  # General context
  redis-cli SET "cfn_loop:context-test:general_context" "$(cat <<EOF
{
  "domain": "general",
  "lessons": {
    "strategies": [
      {"id": "general-strat-1", "text": "General Strategy 1"}
    ]
  }
}
EOF
)" EX 3600
}

# Cleanup Test Data
cleanup_test_data() {
  redis-cli DEL "cfn_loop:context-test:backend_context"
  redis-cli DEL "cfn_loop:context-test:frontend_context"
  redis-cli DEL "cfn_loop:context-test:general_context"
}

# 1. Agent-Specific Filtering Test
test_agent_specific_filtering() {
  echo "Testing Agent-Specific Context Filtering"

  # Backend Dev Test
  backend_result=$(./context-injection.sh --agent-type "backend-dev" --context-key "cfn_loop:context-test:backend_context")
  if [[ $(echo "$backend_result" | grep -c "Backend Strategy") -eq 3 ]] &&
     [[ $(echo "$backend_result" | grep -c "Backend Anti-Pattern") -eq 2 ]]; then
    pass "Backend agent receives backend-specific context"
  else
    fail "Backend agent context filtering failed"
  fi

  # Frontend Dev Test
  frontend_result=$(./context-injection.sh --agent-type "frontend-dev" --context-key "cfn_loop:context-test:frontend_context")
  if [[ $(echo "$frontend_result" | grep -c "Frontend Strategy") -eq 2 ]] &&
     [[ $(echo "$frontend_result" | grep -c "Frontend Anti-Pattern") -eq 1 ]]; then
    pass "Frontend agent receives frontend-specific context"
  else
    fail "Frontend agent context filtering failed"
  fi
}

# 2. Markdown Formatting Test
test_markdown_formatting() {
  echo "Testing Markdown Formatting"

  result=$(./context-injection.sh --agent-type "backend-dev" --context-key "cfn_loop:context-test:backend_context")

  # Check basic markdown structure
  if echo "$result" | grep -qE '^## '; then
    pass "Markdown header present"
  else
    fail "Missing markdown header"
  fi

  # Check bullet points
  if echo "$result" | grep -qE '^\* '; then
    pass "Markdown bullet points present"
  else
    fail "Missing markdown bullet points"
  fi
}

# 3. Lesson Limits Test
test_lesson_limits() {
  echo "Testing Lesson Limits"

  result=$(./context-injection.sh --agent-type "backend-dev" --context-key "cfn_loop:context-test:backend_context")

  strategy_count=$(echo "$result" | grep -c "### Strategy")
  anti_pattern_count=$(echo "$result" | grep -c "### Anti-Pattern")
  edge_case_count=$(echo "$result" | grep -c "### Edge Case")

  if [[ $strategy_count -le 3 ]] && [[ $anti_pattern_count -le 3 ]] && [[ $edge_case_count -le 3 ]]; then
    pass "Lesson limits enforced"
  else
    fail "Lesson limits exceeded"
  fi
}

# 4. Character Limit Test
test_character_limit() {
  echo "Testing Character Limit"

  # Generate long context
  long_context=$(head -c 3000 /dev/urandom | base64)
  redis-cli SET "cfn_loop:context-test:long_context" "{\"text\": \"$long_context\"}" EX 300

  result=$(./context-injection.sh --agent-type "general" --context-key "cfn_loop:context-test:long_context")

  if [[ ${#result} -le 2000 ]]; then
    pass "Context truncated to 2000 characters"
  else
    fail "Context exceeds 2000 character limit"
  fi

  redis-cli DEL "cfn_loop:context-test:long_context"
}

# 5. Context Merging Test
test_context_merging() {
  echo "Testing Context Merging"

  # Setup historical context
  redis-cli SET "cfn_loop:context-test:historical_context" '{"historical": "previous insights"}' EX 300

  result=$(./context-injection.sh --agent-type "backend-dev" --historical-context "cfn_loop:context-test:historical_context" --context-key "cfn_loop:context-test:backend_context")

  # Verify historical context is preserved
  if echo "$result" | grep -q "previous insights"; then
    pass "Historical context preserved"
  else
    fail "Historical context lost during merging"
  fi

  # Validate JSON structure
  if echo "$result" | jq empty 2>/dev/null; then
    pass "Merged context remains valid JSON"
  else
    fail "Merged context is not valid JSON"
  fi
}

# 6. Error Handling Test
test_error_handling() {
  echo "Testing Error Handling"

  # Non-existent Redis key
  result=$(./context-injection.sh --agent-type "backend-dev" --context-key "non_existent_key" 2>&1)
  if [[ $result == *"Fallback to general context"* ]]; then
    pass "Handles non-existent Redis key gracefully"
  else
    fail "No graceful fallback for missing Redis key"
  fi

  # Malformed JSON
  redis-cli SET "cfn_loop:context-test:malformed_context" "Invalid JSON" EX 300
  result=$(./context-injection.sh --agent-type "backend-dev" --context-key "cfn_loop:context-test:malformed_context" 2>&1)
  if [[ $result == *"Fallback to general context"* ]]; then
    pass "Handles malformed JSON gracefully"
  else
    fail "No graceful handling of malformed JSON"
  fi
}

# Main Test Execution
main() {
  setup_test_data

  test_agent_specific_filtering
  test_markdown_formatting
  test_lesson_limits
  test_character_limit
  test_context_merging
  test_error_handling

  cleanup_test_data

  echo "Test Results:"
  echo "Passed: $PASS_COUNT"
  echo "Failed: $FAIL_COUNT"

  if [[ $FAIL_COUNT -eq 0 ]]; then
    echo "All Context Injection Tests Passed"
    exit 0
  else
    echo "Some Context Injection Tests Failed"
    exit 1
  fi
}

# Execute
main