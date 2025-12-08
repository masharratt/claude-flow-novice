#!/bin/bash

# ACE System Test: Context Query Integration
# Purpose: Validate domain-aware context retrieval using task classifier
# Phase: 2.4 - Integration Testing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACE_SKILL_DIR="${SCRIPT_DIR}/../../.claude/skills/cfn-ace-system"
QUERY_SCRIPT="${ACE_SKILL_DIR}/query-contexts.sh"
DB_PATH="${SCRIPT_DIR}/../../data/ace-context.db"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "ACE System: Context Query Integration Test"
echo "========================================="
echo ""

# Helper functions
assert_equal() {
  local EXPECTED="$1"
  local ACTUAL="$2"
  local TEST_NAME="$3"

  ((TESTS_RUN++))

  if [ "$EXPECTED" = "$ACTUAL" ]; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} $TEST_NAME"
    return 0
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} $TEST_NAME"
    echo "   Expected: $EXPECTED"
    echo "   Got:      $ACTUAL"
    return 1
  fi
}

assert_contains() {
  local HAYSTACK="$1"
  local NEEDLE="$2"
  local TEST_NAME="$3"

  ((TESTS_RUN++))

  if echo "$HAYSTACK" | grep -q "$NEEDLE"; then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} $TEST_NAME"
    return 0
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} $TEST_NAME"
    echo "   Expected to find: $NEEDLE"
    echo "   In: $(echo "$HAYSTACK" | head -c 100)..."
    return 1
  fi
}

assert_greater_than() {
  local ACTUAL="$1"
  local THRESHOLD="$2"
  local TEST_NAME="$3"

  ((TESTS_RUN++))

  if (( $(echo "$ACTUAL > $THRESHOLD" | bc -l) )); then
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} $TEST_NAME"
    return 0
  else
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} $TEST_NAME"
    echo "   Expected > $THRESHOLD"
    echo "   Got:       $ACTUAL"
    return 1
  fi
}

# Test Setup
echo "Setup: Verifying dependencies..."

if [ ! -f "$QUERY_SCRIPT" ]; then
  echo -e "${RED}ERROR: Query script not found at $QUERY_SCRIPT${NC}"
  exit 1
fi

if [ ! -f "$DB_PATH" ]; then
  echo -e "${RED}ERROR: Database not found at $DB_PATH${NC}"
  exit 1
fi

echo -e "${GREEN}✓${NC} Dependencies verified"
echo ""

# ============================================================
# Test 1: Frontend Task Gets Frontend Contexts
# ============================================================
echo "Test 1: Frontend task retrieval"
echo "-------------------------------------------"

TASK_1="Build React component library with TypeScript"
RESULT_1=$("$QUERY_SCRIPT" "$TASK_1" --limit 3 --format json 2>&1)
EXIT_CODE_1=$?

if [ $EXIT_CODE_1 -eq 0 ]; then
  # Verify query metadata
  DETECTED_DOMAINS=$(echo "$RESULT_1" | jq -r '.query.domains')
  assert_contains "$DETECTED_DOMAINS" "frontend" "Frontend domain detected"

  # Verify results contain frontend contexts
  RESULT_COUNT=$(echo "$RESULT_1" | jq -r '.results.count')
  assert_greater_than "$RESULT_COUNT" 0 "Frontend contexts returned"

  # Check if at least one result is frontend
  FIRST_DOMAIN=$(echo "$RESULT_1" | jq -r '.results.contexts[0].domain // "none"')
  assert_equal "frontend" "$FIRST_DOMAIN" "First result is frontend domain"

  # Verify relevance scoring applied
  FIRST_SCORE=$(echo "$RESULT_1" | jq -r '.results.contexts[0].relevance_score // .results.contexts[0].confidence')
  assert_greater_than "$FIRST_SCORE" 0 "Relevance score calculated"
else
  echo -e "${RED}✗ Query execution failed (exit code: $EXIT_CODE_1)${NC}"
  echo "$RESULT_1"
  ((TESTS_RUN += 4))
  ((TESTS_FAILED += 4))
fi

echo ""

# ============================================================
# Test 2: Multi-Domain Task Gets Blended Results
# ============================================================
echo "Test 2: Multi-domain task retrieval"
echo "-------------------------------------------"

TASK_2="Implement JWT authentication with React login form and PostgreSQL user storage"
RESULT_2=$("$QUERY_SCRIPT" "$TASK_2" --limit 5 --format json 2>&1)
EXIT_CODE_2=$?

if [ $EXIT_CODE_2 -eq 0 ]; then
  # Verify multiple domains detected
  DETECTED_DOMAINS=$(echo "$RESULT_2" | jq -r '.query.domains')
  DOMAIN_COUNT=$(echo "$DETECTED_DOMAINS" | tr ',' '\n' | wc -l)
  assert_greater_than "$DOMAIN_COUNT" 1 "Multiple domains detected"

  # Verify mix of backend/security/frontend
  assert_contains "$DETECTED_DOMAINS" "backend" "Backend domain detected"
  assert_contains "$DETECTED_DOMAINS" "security" "Security domain detected (or frontend)" || \
    assert_contains "$DETECTED_DOMAINS" "frontend" "Frontend domain detected"

  # Verify results contain multiple domains
  RESULT_COUNT=$(echo "$RESULT_2" | jq -r '.results.count')
  assert_greater_than "$RESULT_COUNT" 1 "Multiple contexts returned"

  # Check domain diversity in results
  UNIQUE_DOMAINS=$(echo "$RESULT_2" | jq -r '.results.contexts[].domain' | sort -u | wc -l)
  assert_greater_than "$UNIQUE_DOMAINS" 1 "Results span multiple domains"
else
  echo -e "${RED}✗ Query execution failed (exit code: $EXIT_CODE_2)${NC}"
  echo "$RESULT_2"
  ((TESTS_RUN += 5))
  ((TESTS_FAILED += 5))
fi

echo ""

# ============================================================
# Test 3: Domain Mismatch Handling
# ============================================================
echo "Test 3: Domain mismatch handling"
echo "-------------------------------------------"

TASK_3="Design marketing graphics for social media campaign"
RESULT_3=$("$QUERY_SCRIPT" "$TASK_3" --limit 5 --format json 2>&1)
EXIT_CODE_3=$?

if [ $EXIT_CODE_3 -eq 0 ]; then
  # Verify query succeeded
  RESULT_COUNT=$(echo "$RESULT_3" | jq -r '.results.count')

  # Expected: Either empty results or very low relevance scores
  # (no design contexts in DB, should return minimal/generic results)
  if [ "$RESULT_COUNT" -eq 0 ]; then
    ((TESTS_RUN++))
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Empty results for mismatched domain (expected)"
  else
    # Check if returned contexts have low relevance
    MAX_RELEVANCE=$(echo "$RESULT_3" | jq -r '[.results.contexts[].relevance_score // .results.contexts[].confidence] | max')
    if (( $(echo "$MAX_RELEVANCE < 0.70" | bc -l) )); then
      ((TESTS_RUN++))
      ((TESTS_PASSED++))
      echo -e "${GREEN}✓${NC} Low relevance for mismatched domain (expected)"
    else
      ((TESTS_RUN++))
      ((TESTS_FAILED++))
      echo -e "${YELLOW}⚠${NC} High relevance for mismatched domain (unexpected: $MAX_RELEVANCE)"
    fi
  fi

  # Verify detected domain is not in our system
  DETECTED_DOMAINS=$(echo "$RESULT_3" | jq -r '.query.domains')
  if echo "$DETECTED_DOMAINS" | grep -qE "(design|general)"; then
    ((TESTS_RUN++))
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Classifier detected design/general domain"
  else
    ((TESTS_RUN++))
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Unexpected domain classification: $DETECTED_DOMAINS"
  fi
else
  echo -e "${RED}✗ Query execution failed (exit code: $EXIT_CODE_3)${NC}"
  echo "$RESULT_3"
  ((TESTS_RUN += 2))
  ((TESTS_FAILED += 2))
fi

echo ""

# ============================================================
# Test 4: Confidence Filtering
# ============================================================
echo "Test 4: Confidence filtering"
echo "-------------------------------------------"

TASK_4="Build REST API with Express and MongoDB"
RESULT_HIGH=$("$QUERY_SCRIPT" "$TASK_4" --limit 10 --min-confidence 0.90 --format json 2>&1)
RESULT_LOW=$("$QUERY_SCRIPT" "$TASK_4" --limit 10 --min-confidence 0.60 --format json 2>&1)

if [ $? -eq 0 ]; then
  COUNT_HIGH=$(echo "$RESULT_HIGH" | jq -r '.results.count')
  COUNT_LOW=$(echo "$RESULT_LOW" | jq -r '.results.count')

  # Higher confidence filter should return fewer (or equal) results
  if [ "$COUNT_LOW" -ge "$COUNT_HIGH" ]; then
    ((TESTS_RUN++))
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} Lower confidence threshold returns more results ($COUNT_LOW vs $COUNT_HIGH)"
  else
    ((TESTS_RUN++))
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Unexpected result counts (low: $COUNT_LOW, high: $COUNT_HIGH)"
  fi

  # All high-confidence results should meet threshold
  MIN_CONF=$(echo "$RESULT_HIGH" | jq -r '[.results.contexts[].confidence] | min // 1.0')
  if (( $(echo "$MIN_CONF >= 0.90" | bc -l) )); then
    ((TESTS_RUN++))
    ((TESTS_PASSED++))
    echo -e "${GREEN}✓${NC} All results meet min confidence threshold ($MIN_CONF)"
  else
    ((TESTS_RUN++))
    ((TESTS_FAILED++))
    echo -e "${RED}✗${NC} Result below threshold: $MIN_CONF"
  fi
else
  echo -e "${RED}✗ Query execution failed${NC}"
  ((TESTS_RUN += 2))
  ((TESTS_FAILED += 2))
fi

echo ""

# ============================================================
# Test 5: Simple Format Output
# ============================================================
echo "Test 5: Simple format output"
echo "-------------------------------------------"

TASK_5="Implement user authentication"
RESULT_5=$("$QUERY_SCRIPT" "$TASK_5" --limit 2 --format simple 2>&1)
EXIT_CODE_5=$?

if [ $EXIT_CODE_5 -eq 0 ]; then
  assert_contains "$RESULT_5" "Query:" "Simple format includes query"
  assert_contains "$RESULT_5" "Domains:" "Simple format includes domains"
  assert_contains "$RESULT_5" "Results:" "Simple format includes result count"
else
  echo -e "${RED}✗ Simple format query failed${NC}"
  echo "$RESULT_5"
  ((TESTS_RUN += 3))
  ((TESTS_FAILED += 3))
fi

echo ""

# ============================================================
# Performance Validation
# ============================================================
echo "Performance Validation"
echo "-------------------------------------------"

START_TIME=$(date +%s%N)
"$QUERY_SCRIPT" "Build microservice architecture" --limit 5 --format json > /dev/null 2>&1
END_TIME=$(date +%s%N)
DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))

echo "Query execution time: ${DURATION_MS}ms"

if [ "$DURATION_MS" -lt 5000 ]; then
  ((TESTS_RUN++))
  ((TESTS_PASSED++))
  echo -e "${GREEN}✓${NC} Query performance acceptable (<5s)"
else
  ((TESTS_RUN++))
  ((TESTS_FAILED++))
  echo -e "${YELLOW}⚠${NC} Query slower than expected (${DURATION_MS}ms)"
fi

echo ""

# ============================================================
# Summary
# ============================================================
echo "========================================="
echo "Test Summary"
echo "========================================="
echo "Tests Run:    $TESTS_RUN"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
