#!/bin/bash
# Test: Orchestrator Parameter Validation
# Purpose: Verify that orchestrate.sh properly validates --loop3-agents, --loop2-agents, and --product-owner parameters
# Bug Fix: Prevents empty string parameters from bypassing validation
# Date: 2025-11-17

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ORCHESTRATOR="./.claude/skills/cfn-loop-orchestration/orchestrate.sh"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run a test
run_test() {
    local test_name="$1"
    local expected_result="$2" # "pass" or "fail"
    shift 2
    local cmd=("$@")

    TESTS_RUN=$((TESTS_RUN + 1))
    echo ""
    echo "Test $TESTS_RUN: $test_name"
    echo "Command: ${cmd[@]}"

    # Capture output and exit code
    set +e
    output=$("${cmd[@]}" 2>&1)
    exit_code=$?
    set -e

    # Check result
    if [[ "$expected_result" == "pass" ]]; then
        if [[ $exit_code -eq 0 ]] || [[ $exit_code -eq 141 ]]; then
            echo -e "${GREEN}✓ PASS${NC}: Command succeeded as expected"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        else
            echo -e "${RED}✗ FAIL${NC}: Command failed but should have passed"
            echo "Exit code: $exit_code"
            echo "Output: $output" | head -10
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    else
        if [[ $exit_code -ne 0 ]] && [[ $exit_code -ne 141 ]]; then
            echo -e "${GREEN}✓ PASS${NC}: Command failed as expected"
            echo "Error message: $(echo "$output" | grep -i "error" | head -1)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        else
            echo -e "${RED}✗ FAIL${NC}: Command passed but should have failed"
            echo "Exit code: $exit_code"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    fi
}

echo "============================================"
echo "Orchestrator Parameter Validation Test Suite"
echo "============================================"

# Test 1: Valid parameters with single agents
run_test "Valid parameters with single agents" "pass" \
    "$ORCHESTRATOR" \
    --task-id "test-valid-single" \
    --mode "standard" \
    --loop3-agents "devops-engineer" \
    --loop2-agents "security-auditor" \
    --product-owner "product-owner" \
    --max-iterations 1 \
    --success-criteria '{"test":"criteria"}'

# Test 2: Valid parameters with multiple comma-separated agents
run_test "Valid parameters with multiple agents" "pass" \
    "$ORCHESTRATOR" \
    --task-id "test-valid-multiple" \
    --mode "standard" \
    --loop3-agents "devops-engineer,backend-dev" \
    --loop2-agents "security-auditor,compliance-checker" \
    --product-owner "product-owner" \
    --max-iterations 1 \
    --success-criteria '{"test":"criteria"}'

# Test 3: Empty --loop3-agents parameter (should fail)
run_test "Empty --loop3-agents parameter" "fail" \
    "$ORCHESTRATOR" \
    --task-id "test-empty-loop3" \
    --mode "standard" \
    --loop3-agents "" \
    --loop2-agents "security-auditor" \
    --product-owner "product-owner" \
    --max-iterations 1 \
    --success-criteria '{"test":"criteria"}'

# Test 4: Empty --loop2-agents parameter (should fail)
run_test "Empty --loop2-agents parameter" "fail" \
    "$ORCHESTRATOR" \
    --task-id "test-empty-loop2" \
    --mode "standard" \
    --loop3-agents "devops-engineer" \
    --loop2-agents "" \
    --product-owner "product-owner" \
    --max-iterations 1 \
    --success-criteria '{"test":"criteria"}'

# Test 5: Empty --product-owner parameter (should fail)
run_test "Empty --product-owner parameter" "fail" \
    "$ORCHESTRATOR" \
    --task-id "test-empty-owner" \
    --mode "standard" \
    --loop3-agents "devops-engineer" \
    --loop2-agents "security-auditor" \
    --product-owner "" \
    --max-iterations 1 \
    --success-criteria '{"test":"criteria"}'

# Test 6: Empty variable expansion for --loop3-agents (should fail)
LOOP3_AGENTS=""
run_test "Empty variable expansion for --loop3-agents" "fail" \
    "$ORCHESTRATOR" \
    --task-id "test-var-empty-loop3" \
    --mode "standard" \
    --loop3-agents "$LOOP3_AGENTS" \
    --loop2-agents "security-auditor" \
    --product-owner "product-owner" \
    --max-iterations 1 \
    --success-criteria '{"test":"criteria"}'

# Test 7: Empty variable expansion for --loop2-agents (should fail)
LOOP2_AGENTS=""
run_test "Empty variable expansion for --loop2-agents" "fail" \
    "$ORCHESTRATOR" \
    --task-id "test-var-empty-loop2" \
    --mode "standard" \
    --loop3-agents "devops-engineer" \
    --loop2-agents "$LOOP2_AGENTS" \
    --product-owner "product-owner" \
    --max-iterations 1 \
    --success-criteria '{"test":"criteria"}'

# Test 8: Unset variable with default empty (should fail)
unset LOOP3_AGENTS
run_test "Unset variable with default empty" "fail" \
    "$ORCHESTRATOR" \
    --task-id "test-unset-default" \
    --mode "standard" \
    --loop3-agents "${LOOP3_AGENTS:-}" \
    --loop2-agents "security-auditor" \
    --product-owner "product-owner" \
    --max-iterations 1 \
    --success-criteria '{"test":"criteria"}'

# Summary
echo ""
echo "============================================"
echo "Test Summary"
echo "============================================"
echo "Total tests run: $TESTS_RUN"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
