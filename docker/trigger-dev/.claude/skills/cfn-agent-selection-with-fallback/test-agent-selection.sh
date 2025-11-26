#!/usr/bin/env bash
set -eu

# Test Suite for Agent Selection Skill
# Tests classification, selection, fallback, and validation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELECT_SCRIPT="${SCRIPT_DIR}/select-agents.sh"
CLASSIFIER="${SCRIPT_DIR}/task-classifier.sh"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

# Test helper functions
assert_equals() {
  local expected="$1"
  local actual="$2"
  local test_name="$3"

  if [ "$expected" = "$actual" ]; then
    echo -e "${GREEN}✓${NC} $test_name"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} $test_name"
    echo "  Expected: $expected"
    echo "  Got: $actual"
    ((TESTS_FAILED++))
  fi
}

assert_not_empty() {
  local value="$1"
  local test_name="$2"

  if [ -n "$value" ] && [ "$value" != "[]" ] && [ "$value" != "null" ]; then
    echo -e "${GREEN}✓${NC} $test_name"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} $test_name"
    echo "  Value is empty or null: $value"
    ((TESTS_FAILED++))
  fi
}

assert_min_length() {
  local array_json="$1"
  local min_length="$2"
  local test_name="$3"

  local actual_length=$(echo "$array_json" | jq 'length')

  if [ "$actual_length" -ge "$min_length" ]; then
    echo -e "${GREEN}✓${NC} $test_name (length: $actual_length)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} $test_name"
    echo "  Expected min length: $min_length"
    echo "  Got: $actual_length"
    ((TESTS_FAILED++))
  fi
}

echo "======================================"
echo "Agent Selection Skill Test Suite"
echo "======================================"
echo ""

# Test 1: Task Classification
echo "Test Group: Task Classification"
echo "--------------------------------------"

test_classifier() {
  local task="$1"
  local expected_category="$2"
  local actual_category=$("$CLASSIFIER" "$task")
  assert_equals "$expected_category" "$actual_category" "Classify: '$task'"
}

test_classifier "Implement JWT authentication API" "security"
test_classifier "Deploy Kubernetes cluster with Helm" "infrastructure"
test_classifier "Build React dashboard with TypeScript" "frontend"
test_classifier "Create mobile app for iOS and Android" "mobile"
test_classifier "Optimize database query performance" "performance"
test_classifier "Design database schema for users" "database"
test_classifier "Build fullstack application with Next.js" "fullstack"
test_classifier "Create REST API with Express" "backend-api"
test_classifier "Random unclassified task xyz" "default"

echo ""

# Test 2: Agent Selection Output Format
echo "Test Group: Agent Selection Output"
echo "--------------------------------------"

RESULT=$("$SELECT_SCRIPT" "Implement JWT authentication")

# Validate JSON structure
assert_not_empty "$(echo "$RESULT" | jq -r '.loop3')" "Loop 3 agents present"
assert_not_empty "$(echo "$RESULT" | jq -r '.loop2')" "Loop 2 validators present"
assert_not_empty "$(echo "$RESULT" | jq -r '.product_owner')" "Product owner present"
assert_not_empty "$(echo "$RESULT" | jq -r '.category')" "Category present"
assert_not_empty "$(echo "$RESULT" | jq -r '.confidence')" "Confidence score present"

echo ""

# Test 3: Minimum Agent Counts
echo "Test Group: Minimum Agent Counts"
echo "--------------------------------------"

test_min_agents() {
  local task="$1"
  local min_loop3="$2"
  local min_loop2="$3"

  local result=$("$SELECT_SCRIPT" "$task")
  local loop3=$(echo "$result" | jq -c '.loop3')
  local loop2=$(echo "$result" | jq -c '.loop2')

  assert_min_length "$loop3" "$min_loop3" "Min Loop 3 agents for: '$task'"
  assert_min_length "$loop2" "$min_loop2" "Min Loop 2 validators for: '$task'"
}

test_min_agents "Implement JWT authentication" 2 3
test_min_agents "Deploy Docker containers" 2 3
test_min_agents "Build React UI" 2 3
test_min_agents "Mobile app development" 2 3

echo ""

# Test 4: Category-Specific Selections
echo "Test Group: Category-Specific Agent Selection"
echo "--------------------------------------"

test_category_agents() {
  local task="$1"
  local expected_category="$2"
  local expected_loop3_agent="$3"  # At least one of these should be present

  local result=$("$SELECT_SCRIPT" "$task")
  local category=$(echo "$result" | jq -r '.category')
  local loop3=$(echo "$result" | jq -r '.loop3[]' | tr '\n' ' ')

  assert_equals "$expected_category" "$category" "Category for: '$task'"

  if echo "$loop3" | grep -q "$expected_loop3_agent"; then
    echo -e "${GREEN}✓${NC} Loop 3 includes '$expected_loop3_agent' for: '$task'"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Loop 3 missing '$expected_loop3_agent' for: '$task'"
    echo "  Loop 3 agents: $loop3"
    ((TESTS_FAILED++))
  fi
}

test_category_agents "Implement REST API with Express" "backend-api" "backend-developer"
test_category_agents "Deploy with Kubernetes" "infrastructure" "devops-engineer"
test_category_agents "Build React components" "frontend" "react-frontend-engineer"
test_category_agents "Fix security vulnerability" "security" "security-specialist"
test_category_agents "Create iOS mobile app" "mobile" "mobile-dev"

echo ""

# Test 5: Fallback Behavior
echo "Test Group: Fallback Behavior"
echo "--------------------------------------"

# Test empty task description
EMPTY_RESULT=$("$SELECT_SCRIPT" "")
assert_not_empty "$(echo "$EMPTY_RESULT" | jq -r '.loop3')" "Empty task: Loop 3 fallback"
assert_not_empty "$(echo "$EMPTY_RESULT" | jq -r '.loop2')" "Empty task: Loop 2 fallback"

EMPTY_CATEGORY=$(echo "$EMPTY_RESULT" | jq -r '.category')
assert_equals "default" "$EMPTY_CATEGORY" "Empty task: default category"

# Test unclassified task
UNCLASS_RESULT=$("$SELECT_SCRIPT" "Some random xyz task qwerty")
assert_not_empty "$(echo "$UNCLASS_RESULT" | jq -r '.loop3')" "Unclassified: Loop 3 fallback"
assert_not_empty "$(echo "$UNCLASS_RESULT" | jq -r '.loop2')" "Unclassified: Loop 2 fallback"

echo ""

# Test 6: Confidence Scoring
echo "Test Group: Confidence Scoring"
echo "--------------------------------------"

test_confidence_range() {
  local task="$1"
  local min_confidence="$2"

  local result=$("$SELECT_SCRIPT" "$task")
  local confidence=$(echo "$result" | jq -r '.confidence')

  # Compare floats using awk
  if awk -v conf="$confidence" -v min="$min_confidence" 'BEGIN {exit !(conf >= min)}'; then
    echo -e "${GREEN}✓${NC} Confidence ≥ $min_confidence for: '$task' (got: $confidence)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Confidence < $min_confidence for: '$task' (got: $confidence)"
    ((TESTS_FAILED++))
  fi
}

test_confidence_range "Implement JWT authentication API" 0.85
test_confidence_range "Deploy Kubernetes cluster" 0.85
test_confidence_range "Some random task" 0.70

echo ""

# Test 7: Custom Validator Count
echo "Test Group: Custom Validator Count"
echo "--------------------------------------"

CUSTOM_RESULT=$("$SELECT_SCRIPT" "Build API" --min-validators 5)
CUSTOM_LOOP2=$(echo "$CUSTOM_RESULT" | jq -c '.loop2')
assert_min_length "$CUSTOM_LOOP2" 5 "Custom min validators (5)"

echo ""

# Test 8: JSON Parsability
echo "Test Group: JSON Output Parsability"
echo "--------------------------------------"

PARSE_RESULT=$("$SELECT_SCRIPT" "Test task description")
if echo "$PARSE_RESULT" | jq empty 2>/dev/null; then
  echo -e "${GREEN}✓${NC} JSON output is valid and parseable"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} JSON output is invalid"
  ((TESTS_FAILED++))
fi

# Test all required fields parseable
LOOP3_PARSE=$(echo "$PARSE_RESULT" | jq -r '.loop3[]')
LOOP2_PARSE=$(echo "$PARSE_RESULT" | jq -r '.loop2[]')
PO_PARSE=$(echo "$PARSE_RESULT" | jq -r '.product_owner')
CAT_PARSE=$(echo "$PARSE_RESULT" | jq -r '.category')
CONF_PARSE=$(echo "$PARSE_RESULT" | jq -r '.confidence')

assert_not_empty "$LOOP3_PARSE" "Loop 3 array parseable"
assert_not_empty "$LOOP2_PARSE" "Loop 2 array parseable"
assert_not_empty "$PO_PARSE" "Product owner parseable"
assert_not_empty "$CAT_PARSE" "Category parseable"
assert_not_empty "$CONF_PARSE" "Confidence parseable"

echo ""

# Test 9: Agent Name Validation
echo "Test Group: Agent Name Validation"
echo "--------------------------------------"

# Test that common agent names are recognized
VALID_RESULT=$("$SELECT_SCRIPT" "Build backend API")
LOOP3_AGENTS=$(echo "$VALID_RESULT" | jq -r '.loop3[]')

echo "Selected Loop 3 agents: $(echo "$LOOP3_AGENTS" | tr '\n' ', ' | sed 's/,$//')"
echo -e "${YELLOW}Note: Agent validation happens internally, checking non-empty output${NC}"
assert_not_empty "$LOOP3_AGENTS" "Valid agents returned for backend-api task"

echo ""

# Summary
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed!${NC}"
  exit 1
fi
