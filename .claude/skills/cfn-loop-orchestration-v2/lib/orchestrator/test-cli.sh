#!/bin/bash

set -euo pipefail

CLI="./dist/cli/orchestrator-cli.js"
TESTS_PASSED=0
TESTS_FAILED=0

test_case() {
  local name="$1"
  local expected_exit="$2"
  shift 2
  
  echo -n "Testing: $name ... "
  
  if node "$@" > /tmp/test-output.json 2>&1; then
    actual_exit=$?
  else
    actual_exit=$?
  fi
  
  if [ "$actual_exit" -eq "$expected_exit" ]; then
    echo "PASS"
    ((TESTS_PASSED++))
  else
    echo "FAIL (expected exit $expected_exit, got $actual_exit)"
    ((TESTS_FAILED++))
  fi
}

# Test 1: Help flag
test_case "Help flag" 0 "$CLI" --help

# Test 2: Version flag
test_case "Version flag" 0 "$CLI" --version

# Test 3: Missing task-id (should fail)
test_case "Missing task-id" 1 "$CLI" --mode standard --max-iterations 5

# Test 4: Missing mode (should fail)
test_case "Missing mode" 1 "$CLI" --task-id test --max-iterations 5

# Test 5: Missing max-iterations (should fail)
test_case "Missing max-iterations" 1 "$CLI" --task-id test --mode standard

# Test 6: Invalid mode (should fail)
test_case "Invalid mode" 1 "$CLI" --task-id test --mode invalid --max-iterations 5

# Test 7: Valid basic parameters
test_case "Valid basic parameters" 0 "$CLI" --task-id test123 --mode standard --max-iterations 10

# Test 8: Valid with all optional parameters
test_case "Valid with all parameters" 0 "$CLI" \
  --task-id test-auth \
  --mode enterprise \
  --max-iterations 15 \
  --loop3-agents backend-dev,coder \
  --loop2-agents code-reviewer,tester \
  --product-owner product-owner \
  --success-criteria enabled

# Test 9: MVP mode
test_case "MVP mode" 0 "$CLI" --task-id mvp-test --mode mvp --max-iterations 3

# Test 10: Invalid max-iterations (too high)
test_case "Invalid max-iterations (>100)" 1 "$CLI" --task-id test --mode standard --max-iterations 101

# Test 11: Invalid max-iterations (too low)
test_case "Invalid max-iterations (<1)" 1 "$CLI" --task-id test --mode standard --max-iterations 0

# Test 12: Task ID with special chars (should sanitize)
test_case "Task ID sanitization" 0 "$CLI" --task-id "test@#$%task" --mode standard --max-iterations 5

# Test 13: Success criteria disabled
test_case "Success criteria disabled" 0 "$CLI" \
  --task-id test --mode standard --max-iterations 5 --success-criteria disabled

# Test 14: Success criteria with boolean value
test_case "Success criteria true" 0 "$CLI" \
  --task-id test --mode standard --max-iterations 5 --success-criteria true

echo ""
echo "========================================="
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo "========================================="

if [ "$TESTS_FAILED" -eq 0 ]; then
  exit 0
else
  exit 1
fi
