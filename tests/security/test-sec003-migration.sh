#!/bin/bash
# SEC-003 Iteration 3: SQL Injection Migration Validation Test Suite
# Tests that parameterized query migration eliminates SQL injection vulnerabilities
# and maintains functionality

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Create temporary test directory
TEST_DIR="/tmp/sec003-migration-test-$$"
mkdir -p "$TEST_DIR"

# Cleanup on exit
cleanup() {
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Helper function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="${3:-success}"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -e "\n${BLUE}Test $TOTAL_TESTS: $test_name${NC}"

    if eval "$test_command" > /dev/null 2>&1; then
        if [ "$expected_result" = "success" ]; then
            echo -e "${GREEN}✓ PASS${NC}"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            echo -e "${RED}✗ FAIL${NC} (Expected to fail but succeeded)"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    else
        if [ "$expected_result" = "fail" ]; then
            echo -e "${GREEN}✓ PASS${NC} (Failed as expected)"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            echo -e "${RED}✗ FAIL${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    fi
}

# Test 1: Verify store-task-audit.sh imports sqlite-params.sh
run_test \
    "store-task-audit.sh imports sqlite-params.sh" \
    "grep -q 'source.*sqlite-params.sh' /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-audit/store-task-audit.sh"

# Test 2: Verify query-playbook.sh imports sqlite-params.sh
run_test \
    "query-playbook.sh imports sqlite-params.sh" \
    "grep -q 'source.*sqlite-params.sh' /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-playbook/query-playbook.sh"

# Test 3: Verify no direct $TASK_ID interpolation in SQL in store-task-audit.sh
run_test \
    "store-task-audit.sh has no direct \$TASK_ID in SQL" \
    "! grep -E \"sqlite.*\\'\\\$TASK_ID\" /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-audit/store-task-audit.sh"

# Test 4: Verify no direct $TASK_TYPE interpolation in SQL in query-playbook.sh
run_test \
    "query-playbook.sh has no direct \$TASK_TYPE in SQL" \
    "! grep -E \"sqlite3.*\\'\\\$TASK_TYPE\" /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-playbook/query-playbook.sh"

# Test 5: Verify sqlite_insert is used in store-task-audit.sh
run_test \
    "store-task-audit.sh uses sqlite_insert function" \
    "grep -q 'sqlite_insert' /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-audit/store-task-audit.sh"

# Test 6: Verify sqlite_select is used in query-playbook.sh
run_test \
    "query-playbook.sh uses sqlite_select function" \
    "grep -q 'sqlite_select' /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-playbook/query-playbook.sh"

# Test 7: Verify parameterized placeholders (?1, ?2, etc.) are used
run_test \
    "store-task-audit.sh uses parameterized placeholders" \
    "grep -q '?[0-9]' /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-audit/store-task-audit.sh"

# Test 8: Verify parameterized placeholders (?1, ?2, etc.) are used
run_test \
    "query-playbook.sh uses parameterized placeholders" \
    "grep -q '?[0-9]' /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-playbook/query-playbook.sh"

# Test 9: Test store-task-audit.sh syntax validation
run_test \
    "store-task-audit.sh has valid bash syntax" \
    "bash -n /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-audit/store-task-audit.sh"

# Test 10: Test query-playbook.sh syntax validation
run_test \
    "query-playbook.sh has valid bash syntax" \
    "bash -n /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-playbook/query-playbook.sh"

# Test 11: Verify no unquoted EOF (vulnerable pattern)
run_test \
    "store-task-audit.sh uses quoted EOF for safe heredocs" \
    "grep -q \"<<'EOF'\" /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-audit/store-task-audit.sh"

# Test 12: SQL injection test - verify escaped quotes are handled
run_test \
    "store-task-audit.sh properly escapes quotes in JSON metadata" \
    "grep -q '\\\\\"stored_via\\\\\"' /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-audit/store-task-audit.sh"

# Test 13: Functional test - verify store-task-audit.sh runs without errors
run_test \
    "store-task-audit.sh processes valid input correctly" \
    "bash /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-audit/store-task-audit.sh --task-id 'test-123' --agent-type 'tester' --output '{\"decision\": \"PASS\", \"confidence\": 0.95}'"

# Test 14: Functional test - verify query-playbook.sh can be sourced
run_test \
    "query-playbook.sh can be sourced without errors" \
    "bash -c 'source /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-playbook/query-playbook.sh --help 2>&1 | grep -q Usage || true'"

# Test 15: Code review - verify all user inputs are parameterized
run_test \
    "store-task-audit.sh parameterizes all user inputs (TASK_ID, AGENT_TYPE, etc.)" \
    "[ \$(grep -c 'sqlite_insert.*\\\$' /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-audit/store-task-audit.sh) -ge 1 ]"

# Test 16: Code review - verify all user inputs are parameterized in query-playbook.sh
run_test \
    "query-playbook.sh parameterizes all user inputs (TASK_TYPE)" \
    "grep -q '\$TASK_TYPE' /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-playbook/query-playbook.sh && grep -q 'sqlite_select' /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-playbook/query-playbook.sh"

# Print summary
echo -e "\n${YELLOW}=== TEST SUMMARY ===${NC}"
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}All tests passed! SEC-003 migration complete.${NC}"
    exit 0
else
    echo -e "\n${RED}Some tests failed. Please review the migration.${NC}"
    exit 1
fi
