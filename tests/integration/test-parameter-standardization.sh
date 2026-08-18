#!/usr/bin/env bash

##############################################################################
# Parameter Standardization Test Suite
# Tests the validate-parameters.sh script with various parameter combinations
#
# Usage: ./test-parameter-standardization.sh [--verbose]
##############################################################################

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VALIDATOR_SCRIPT="$PROJECT_ROOT/.claude/skills/redis-coordination/validate-parameters.sh"

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Verbose flag
VERBOSE=0

##############################################################################
# Utility Functions
##############################################################################

log_info() {
  if [[ $VERBOSE -eq 1 ]]; then
    echo -e "${BLUE}INFO: $1${NC}"
  fi
}

print_test_header() {
  local test_name="$1"
  echo ""
  echo "=== $test_name ==="
}

print_test_result() {
  local test_name="$1"
  local expected="$2"
  local actual="$3"
  
  if [[ "$expected" -eq "$actual" ]]; then
    echo -e "${GREEN}✅ PASS: $test_name${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ FAIL: $test_name (expected: $expected, got: $actual)${NC}"
    ((TESTS_FAILED++))
  fi
  ((TESTS_TOTAL++))
}

run_validation_test() {
  local test_name="$1"
  local expected_exit_code="$2"
  shift 2
  
  print_test_header "$test_name"
  
  log_info "Running: $VALIDATOR_SCRIPT $*"
  
  # Run validator and capture exit code
  if "$VALIDATOR_SCRIPT" "$@" 2>/dev/null; then
    local actual_exit_code=0
  else
    local actual_exit_code=$?
  fi
  
  print_test_result "$test_name" "$expected_exit_code" "$actual_exit_code"
  
  # Show verbose output if test failed and verbose mode is on
  if [[ $VERBOSE -eq 1 && "$expected_exit_code" -ne "$actual_exit_code" ]]; then
    echo "Command: $VALIDATOR_SCRIPT $*"
    echo "Exit code: $actual_exit_code"
    "$VALIDATOR_SCRIPT" "$@" || true
  fi
}

##############################################################################
# Test Cases
##############################################################################

test_required_parameters_validation() {
  echo "Testing required parameters validation..."
  
  # Test missing task-id
  run_validation_test "Missing task-id" 1 \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  # Test missing mode
  run_validation_test "Missing mode" 1 \
    --task-id "test-123" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  # Test missing loop3-agents
  run_validation_test "Missing loop3-agents" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  # Test missing loop2-agents
  run_validation_test "Missing loop2-agents" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --product-owner "owner"
  
  # Test missing product-owner
  run_validation_test "Missing product-owner" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer"
  
  # Test all required parameters present (should pass)
  run_validation_test "All required parameters present" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
}

test_task_id_validation() {
  echo "Testing task-id validation..."
  
  # Test valid task IDs
  run_validation_test "Valid task-id with hyphens" 0 \
    --task-id "valid-task-id-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  run_validation_test "Valid task-id with underscores" 0 \
    --task-id "valid_task_id_123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  run_validation_test "Valid task-id alphanumeric" 0 \
    --task-id "validTaskId123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  # Test invalid task IDs
  run_validation_test "Invalid task-id with spaces" 1 \
    --task-id "invalid task id" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  run_validation_test "Invalid task-id with special chars" 1 \
    --task-id "invalid@task#id" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  run_validation_test "Task-id too short" 1 \
    --task-id "ab" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  run_validation_test "Task-id too long" 1 \
    --task-id "$(printf 'a%.0s' {1..101})" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
}

test_mode_validation() {
  echo "Testing mode validation..."
  
  # Test valid modes
  run_validation_test "Valid mode: mvp" 0 \
    --task-id "test-123" \
    --mode "mvp" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  run_validation_test "Valid mode: standard" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  run_validation_test "Valid mode: enterprise" 0 \
    --task-id "test-123" \
    --mode "enterprise" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  # Test invalid modes
  run_validation_test "Invalid mode: custom" 1 \
    --task-id "test-123" \
    --mode "custom" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  run_validation_test "Invalid mode: uppercase" 1 \
    --task-id "test-123" \
    --mode "STANDARD" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
}

test_agent_list_validation() {
  echo "Testing agent list validation..."
  
  # Test valid agent lists
  run_validation_test "Valid single agent" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  run_validation_test "Valid multiple agents" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev,tester,security" \
    --loop2-agents "reviewer,architect" \
    --product-owner "owner"
  
  run_validation_test "Valid agents with hyphens" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "backend-dev,security-specialist" \
    --loop2-agents "code-reviewer" \
    --product-owner "product-owner"
  
  # Test invalid agent lists
  run_validation_test "Invalid agent with spaces" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "invalid agent" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  run_validation_test "Invalid agent with special chars" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "invalid@agent" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
  
  run_validation_test "Empty agent in list" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev,,tester" \
    --loop2-agents "reviewer" \
    --product-owner "owner"
}

test_quorum_validation() {
  echo "Testing quorum parameter validation..."
  
  # Test absolute numbers
  run_validation_test "Valid quorum: absolute number" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --min-quorum-loop3 3
  
  # Test percentages
  run_validation_test "Valid quorum: percentage" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --min-quorum-loop3 85%
  
  # Test decimals
  run_validation_test "Valid quorum: decimal" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --min-quorum-loop3 0.75
  
  # Test invalid quorum values
  run_validation_test "Invalid quorum: percentage too high" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --min-quorum-loop3 150%
  
  run_validation_test "Invalid quorum: decimal too low" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --min-quorum-loop3 0.00
  
  run_validation_test "Invalid quorum: absolute too high" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --min-quorum-loop3 25
}

test_json_validation() {
  echo "Testing JSON parameter validation..."
  
  # Test valid JSON
  run_validation_test "Valid epic-context JSON" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --epic-context '{"epicGoal":"test goal","inScope":["feature1"]}'
  
  run_validation_test "Valid phase-context JSON" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --phase-context '{"deliverables":["file1.ts"],"directory":"src"}'
  
  run_validation_test "Valid success-criteria JSON" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --success-criteria '{"acceptanceCriteria":["tests pass"],"gateThreshold":0.80}'
  
  # Test invalid JSON
  run_validation_test "Invalid epic-context JSON" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --epic-context '{"invalid": json}'
  
  run_validation_test "Invalid phase-context JSON" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --phase-context '{"unclosed": "bracket"'
  
  run_validation_test "Invalid success-criteria JSON" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --success-criteria 'not a json at all'
}

test_numeric_validation() {
  echo "Testing numeric parameter validation..."
  
  # Test valid numeric values
  run_validation_test "Valid max-iterations" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --max-iterations 10
  
  # Test invalid numeric values
  run_validation_test "Invalid max-iterations: too low" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --max-iterations 0
  
  run_validation_test "Invalid max-iterations: too high" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --max-iterations 25
  
  run_validation_test "Invalid max-iterations: not numeric" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --max-iterations "not-a-number"
}

test_edge_cases() {
  echo "Testing edge cases..."
  
  # Test complex valid scenario
  run_validation_test "Complex valid scenario" 0 \
    --task-id "complex-test-1234567890" \
    --mode "enterprise" \
    --loop3-agents "backend-dev,security-specialist,devops-engineer" \
    --loop2-agents "code-reviewer,security-reviewer,performance-reviewer" \
    --product-owner "product-owner-1" \
    --max-iterations 15 \
    --min-quorum-loop3 85% \
    --min-quorum-loop2 0.90 \
    --phase-id "implementation-phase" \
    --epic-context '{"epicGoal":"Build payment system","inScope":["Stripe"],"outOfScope":["PayPal"]}' \
    --phase-context '{"deliverables":["payment.service.ts"],"directory":"src/payment"}' \
    --success-criteria '{"acceptanceCriteria":["Tests pass"],"gateThreshold":0.85}' \
    --expected-files "src/payment.service.ts,tests/payment.test.ts"
  
  # Test phase-id validation
  run_validation_test "Valid phase-id" 0 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --phase-id "phase-1"
  
  run_validation_test "Invalid phase-id" 1 \
    --task-id "test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --phase-id "invalid phase id"
}

test_integration_scenarios() {
  echo "Testing integration scenarios..."
  
  # Test with orchestrator script format
  run_validation_test "Orchestrator format compatibility" 0 \
    --task-id "orchestrator-test-123" \
    --mode "standard" \
    --loop3-agents "backend-dev,frontend-dev" \
    --loop2-agents "code-reviewer,tester" \
    --product-owner "product-owner" \
    --epic-context '{"epicGoal":"Test integration","inScope":["validation"]}' \
    --phase-context '{"deliverables":["validation-results"],"directory":"test"}' \
    --success-criteria '{"acceptanceCriteria":["All tests pass"],"gateThreshold":0.75}'
}

test_verbose_mode() {
  echo "Testing verbose mode..."
  
  # Test verbose output (should still pass/fail correctly)
  print_test_header "Verbose mode test"
  
  local output
  output=$("$VALIDATOR_SCRIPT" \
    --task-id "verbose-test-123" \
    --mode "standard" \
    --loop3-agents "dev" \
    --loop2-agents "reviewer" \
    --product-owner "owner" \
    --verbose 2>&1)
  
  if [[ $? -eq 0 && "$output" == *"INFO:"* ]]; then
    echo -e "${GREEN}✅ PASS: Verbose mode produces info output${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ FAIL: Verbose mode test${NC}"
    ((TESTS_FAILED++))
  fi
  ((TESTS_TOTAL++))
}

##############################################################################
# Test Execution
##############################################################################

print_test_suite_header() {
  echo "=============================================="
  echo "🧪 CFN Loop Parameter Standardization Test Suite"
  echo "=============================================="
  echo "Testing: $VALIDATOR_SCRIPT"
  echo "Project Root: $PROJECT_ROOT"
  echo ""
}

print_test_suite_summary() {
  echo ""
  echo "=============================================="
  echo "📊 Test Suite Summary"
  echo "=============================================="
  echo "Total Tests: $TESTS_TOTAL"
  echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
  
  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "Parameter standardization is working correctly."
    echo "All orchestrator parameters are properly validated."
  else
    echo -e "${RED}❌ Some tests failed!${NC}"
    echo ""
    echo "Please review the validation logic and fix the issues."
    echo "Run with --verbose for detailed error messages."
  fi
  
  echo ""
  echo "Exit code: $TESTS_FAILED"
}

##############################################################################
# Main Execution
##############################################################################

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose|-v)
      VERBOSE=1
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--verbose|--help]"
      echo ""
      echo "Options:"
      echo "  --verbose, -v    Enable verbose output"
      echo "  --help, -h       Show this help message"
      echo ""
      echo "This test suite validates the parameter standardization"
      echo "helper script for CFN Loop orchestrator."
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Use --help for usage information" >&2
      exit 1
      ;;
  esac
done

# Check if validator script exists
if [[ ! -f "$VALIDATOR_SCRIPT" ]]; then
  echo -e "${RED}Error: Validator script not found: $VALIDATOR_SCRIPT${NC}" >&2
  exit 1
fi

# Check if validator script is executable
if [[ ! -x "$VALIDATOR_SCRIPT" ]]; then
  echo -e "${YELLOW}Warning: Validator script is not executable, fixing permissions...${NC}"
  chmod +x "$VALIDATOR_SCRIPT"
fi

# Print test suite header
print_test_suite_header

# Run all test categories
test_required_parameters_validation
test_task_id_validation
test_mode_validation
test_agent_list_validation
test_quorum_validation
test_json_validation
test_numeric_validation
test_edge_cases
test_integration_scenarios
test_verbose_mode

# Print summary
print_test_suite_summary

# Exit with number of failed tests
exit $TESTS_FAILED