#!/usr/bin/env bash

##############################################################################
# Context Lookup Helper Test Suite
# Validates ACE System Integration Phase 1.2
#
# Tests:
#   1. Keyword extraction (≥3 keywords)
#   2. Domain classification (80% accuracy target)
#   3. Historical context query
#   4. Redis storage with TTL
#   5. End-to-end integration
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTEXT_LOOKUP="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/helpers/context-lookup.sh"

PASS_COUNT=0
FAIL_COUNT=0

# Test helper functions
pass() {
  echo "[PASS] $1"
  ((PASS_COUNT++))
}

fail() {
  echo "[FAIL] $1"
  ((FAIL_COUNT++))
}

##############################################################################
# Test 1: Script Exists and Executable
##############################################################################
test_script_exists() {
  echo "Test 1: Script Exists and Executable"

  if [ ! -f "$CONTEXT_LOOKUP" ]; then
    fail "Script not found at $CONTEXT_LOOKUP"
    return
  fi

  if [ ! -x "$CONTEXT_LOOKUP" ]; then
    fail "Script is not executable"
    return
  fi

  pass "Script exists and is executable"
}

##############################################################################
# Test 2: Keyword Extraction (≥3 keywords)
##############################################################################
test_keyword_extraction() {
  echo "Test 2: Keyword Extraction"

  local task_id="test-kw-$(date +%s)"
  local description="Implement JWT authentication for API endpoints with OAuth2 integration"

  # Run context lookup
  if "$CONTEXT_LOOKUP" \
    --task-id "$task_id" \
    --description "$description" 2>&1 | tee /tmp/context-lookup-test.log; then

    # Check log for keyword count
    local keyword_line=$(grep "Extracted.*keywords:" /tmp/context-lookup-test.log || echo "")

    if [ -z "$keyword_line" ]; then
      fail "No keyword extraction log found"
      return
    fi

    # Extract keyword count
    local count=$(echo "$keyword_line" | grep -oE 'Extracted [0-9]+ keywords' | grep -oE '[0-9]+' || echo "0")

    if [ "$count" -ge 3 ]; then
      pass "Extracted $count keywords (requirement: ≥3)"
    else
      fail "Only extracted $count keywords (requirement: ≥3)"
    fi
  else
    fail "Script execution failed"
  fi

  # Cleanup
  redis-cli DEL "cfn_loop:${task_id}:historical_context" > /dev/null 2>&1 || true
}

##############################################################################
# Test 3: Domain Classification
##############################################################################
test_domain_classification() {
  echo "Test 3: Domain Classification"

  # Test backend detection
  local task_id="test-domain-backend-$(date +%s)"
  local description="Create REST API endpoints for user authentication with database integration"

  if "$CONTEXT_LOOKUP" \
    --task-id "$task_id" \
    --description "$description" 2>&1 | tee /tmp/context-lookup-domain.log; then

    local domain=$(grep "Domain classification:" /tmp/context-lookup-domain.log | grep -oE 'backend|frontend|security|devops|testing|general' || echo "unknown")

    if [ "$domain" = "backend" ]; then
      pass "Backend domain correctly classified"
    else
      fail "Expected backend, got $domain"
    fi
  else
    fail "Domain classification execution failed"
  fi

  # Test frontend detection
  task_id="test-domain-frontend-$(date +%s)"
  description="Build React component with JSX and CSS styling for user interface"

  if "$CONTEXT_LOOKUP" \
    --task-id "$task_id" \
    --description "$description" 2>&1 | tee /tmp/context-lookup-domain2.log; then

    domain=$(grep "Domain classification:" /tmp/context-lookup-domain2.log | grep -oE 'backend|frontend|security|devops|testing|general' || echo "unknown")

    if [ "$domain" = "frontend" ]; then
      pass "Frontend domain correctly classified"
    else
      fail "Expected frontend, got $domain"
    fi
  else
    fail "Domain classification execution failed"
  fi

  # Cleanup
  redis-cli DEL "cfn_loop:test-domain-backend-*:historical_context" > /dev/null 2>&1 || true
  redis-cli DEL "cfn_loop:test-domain-frontend-*:historical_context" > /dev/null 2>&1 || true
}

##############################################################################
# Test 4: Redis Storage with TTL
##############################################################################
test_redis_storage() {
  echo "Test 4: Redis Storage with TTL"

  local task_id="test-redis-$(date +%s)"
  local description="Implement caching layer with Redis for performance optimization"
  local redis_key="cfn_loop:${task_id}:historical_context"

  # Run context lookup
  if "$CONTEXT_LOOKUP" \
    --task-id "$task_id" \
    --description "$description" > /dev/null 2>&1; then

    # Check if key exists in Redis
    if redis-cli EXISTS "$redis_key" | grep -q "1"; then
      pass "Redis key created successfully"

      # Check TTL
      local ttl=$(redis-cli TTL "$redis_key")
      if [ "$ttl" -gt 0 ] && [ "$ttl" -le 3600 ]; then
        pass "Redis TTL set correctly (${ttl}s, expected: ≤3600s)"
      else
        fail "Redis TTL incorrect (${ttl}s)"
      fi

      # Validate JSON structure
      local data=$(redis-cli GET "$redis_key")
      if echo "$data" | jq -e '.keywords and .domain and .timestamp and .results' > /dev/null 2>&1; then
        pass "Redis data structure valid"
      else
        fail "Redis data structure invalid"
      fi
    else
      fail "Redis key not created"
    fi
  else
    fail "Context lookup execution failed"
  fi

  # Cleanup
  redis-cli DEL "$redis_key" > /dev/null 2>&1 || true
}

##############################################################################
# Test 5: Error Handling (Missing Arguments)
##############################################################################
test_error_handling() {
  echo "Test 5: Error Handling"

  # Test missing task-id
  if "$CONTEXT_LOOKUP" --description "Test" 2>&1 | grep -q "task-id is required"; then
    pass "Missing task-id error handled correctly"
  else
    fail "Missing task-id error not handled"
  fi

  # Test missing description
  if "$CONTEXT_LOOKUP" --task-id "test-123" 2>&1 | grep -q "description is required"; then
    pass "Missing description error handled correctly"
  else
    fail "Missing description error not handled"
  fi
}

##############################################################################
# Test 6: Confidence Score Calculation
##############################################################################
test_confidence_score() {
  echo "Test 6: Confidence Score Calculation"

  local task_id="test-confidence-$(date +%s)"
  local description="Implement authentication system with JWT tokens and user management API"

  if "$CONTEXT_LOOKUP" \
    --task-id "$task_id" \
    --description "$description" 2>&1 | tee /tmp/context-lookup-confidence.log; then

    # Extract confidence score
    local confidence=$(grep "Self-confidence score:" /tmp/context-lookup-confidence.log | grep -oE '[0-9]+\.[0-9]+' || echo "0.0")

    if (( $(echo "$confidence >= 0.75" | bc -l) )); then
      pass "Confidence score ≥0.75 (actual: $confidence)"
    else
      fail "Confidence score <0.75 (actual: $confidence)"
    fi
  else
    fail "Confidence score test execution failed"
  fi

  # Cleanup
  redis-cli DEL "cfn_loop:${task_id}:historical_context" > /dev/null 2>&1 || true
}

##############################################################################
# Main Test Execution
##############################################################################
main() {
  echo "========================================"
  echo "Context Lookup Helper Test Suite"
  echo "========================================"
  echo ""

  test_script_exists
  echo ""

  test_keyword_extraction
  echo ""

  test_domain_classification
  echo ""

  test_redis_storage
  echo ""

  test_error_handling
  echo ""

  test_confidence_score
  echo ""

  # Summary
  echo "========================================"
  echo "Test Results Summary"
  echo "========================================"
  echo "PASSED: $PASS_COUNT"
  echo "FAILED: $FAIL_COUNT"
  echo ""

  if [ $FAIL_COUNT -eq 0 ]; then
    echo "✅ All tests passed!"
    exit 0
  else
    echo "❌ Some tests failed"
    exit 1
  fi
}

main
