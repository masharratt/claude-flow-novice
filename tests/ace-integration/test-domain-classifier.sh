#!/bin/bash

# EPIC-ACE-001 Phase 2.4 - Domain Classifier Test Suite
# Tests domain classification, multi-domain detection, and complexity assessment

set -e

CLASSIFIER_SCRIPT="./.claude/skills/cfn-task-classifier/classify-task.sh"
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "==================================================================="
echo "EPIC-ACE-001 Phase 2.4 - Domain Classifier Test Suite"
echo "==================================================================="
echo ""

# Helper function to run test
run_test() {
  local test_name="$1"
  local task_description="$2"
  local expected_domains="$3"
  local expected_complexity="$4"

  ((TEST_COUNT++))

  echo "Test $TEST_COUNT: $test_name"
  echo "  Task: $task_description"

  # Run classifier
  RESULT=$("$CLASSIFIER_SCRIPT" "$task_description" --format=json)

  # Extract actual values
  ACTUAL_DOMAINS=$(echo "$RESULT" | grep -oP '"domains":\s*\[\K[^\]]+' | tr -d '"' | tr ',' ' ')
  ACTUAL_COMPLEXITY=$(echo "$RESULT" | grep -oP '"complexity":\s*"\K[^"]+')

  # Check domains
  DOMAINS_MATCH=1
  for expected_domain in $expected_domains; do
    if ! echo "$ACTUAL_DOMAINS" | grep -q "$expected_domain"; then
      DOMAINS_MATCH=0
      break
    fi
  done

  # Check complexity
  COMPLEXITY_MATCH=0
  if [ "$ACTUAL_COMPLEXITY" = "$expected_complexity" ]; then
    COMPLEXITY_MATCH=1
  fi

  # Display results
  echo "  Expected domains: $expected_domains"
  echo "  Actual domains:   $ACTUAL_DOMAINS"
  echo "  Expected complexity: $expected_complexity"
  echo "  Actual complexity:   $ACTUAL_COMPLEXITY"

  if [ "$DOMAINS_MATCH" -eq 1 ] && [ "$COMPLEXITY_MATCH" -eq 1 ]; then
    echo -e "  ${GREEN}✓ PASS${NC}"
    ((PASS_COUNT++))
  else
    echo -e "  ${RED}✗ FAIL${NC}"
    ((FAIL_COUNT++))
  fi

  echo ""
}

# Test 1: Single domain - Backend + Security
run_test \
  "Single domain authentication task" \
  "Implement JWT authentication" \
  "backend security" \
  "low"

# Test 2: Multi-domain - Frontend + Backend
run_test \
  "Multi-domain full-stack task" \
  "Build React frontend with Node.js backend API for user management" \
  "frontend backend" \
  "medium"

# Test 3: Frontend-only with UI/design focus
run_test \
  "Frontend-only UI task" \
  "Design responsive UI components" \
  "frontend" \
  "low"

# Test 4: Complex multi-domain task
run_test \
  "Complex multi-domain architecture task" \
  "Architect and implement microservices architecture with Docker, Kubernetes deployment, JWT authentication, PostgreSQL database, comprehensive testing suite, and API documentation using OpenAPI" \
  "frontend backend security devops testing database documentation" \
  "high"

# Test 5: Documentation-only task
run_test \
  "Documentation-only task" \
  "Write README documentation" \
  "documentation" \
  "low"

# Test 6: Minimal description (edge case)
run_test \
  "Minimal task description" \
  "Fix bug" \
  "general" \
  "low"

# Test 7: Backward compatibility (simple format)
echo "Test 7: Backward Compatibility (Simple Format)"
echo "  Task: Implement JWT authentication"
RESULT=$("$CLASSIFIER_SCRIPT" "Implement JWT authentication")
echo "  Result: $RESULT"

if [ "$RESULT" = "software-development" ]; then
  echo -e "  ${GREEN}✓ PASS${NC}"
  ((PASS_COUNT++))
else
  echo -e "  ${RED}✗ FAIL${NC}"
  ((FAIL_COUNT++))
fi
((TEST_COUNT++))

echo ""
echo "==================================================================="
echo "Test Summary"
echo "==================================================================="
echo "Total tests:  $TEST_COUNT"
echo -e "Passed:       ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed:       ${RED}$FAIL_COUNT${NC}"

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed.${NC}"
  exit 1
fi
