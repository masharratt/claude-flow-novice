#!/bin/bash

# Test script for cfn-expert-update skill
# Validates the skill functionality and edge cases

set -eo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TEST_DIR="/tmp/cfn-expert-test-$$"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SKILL_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-expert-update/update-expert.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_test() { echo -e "${BLUE}TEST: $1${NC}"; }
log_pass() { echo -e "${GREEN}✓ PASS: $1${NC}"; TESTS_PASSED=$((TESTS_PASSED + 1)); }
log_fail() { echo -e "${RED}✗ FAIL: $1${NC}"; TESTS_FAILED=$((TESTS_FAILED + 1)); }
log_info() { echo -e "${YELLOW}INFO: $1${NC}"; }

# Test framework
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_exit="${3:-0}"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "$test_name"

    eval "$test_command" >/dev/null 2>&1
    local actual_exit=$?

    if [[ $actual_exit -eq $expected_exit ]]; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name (exit code: $actual_exit, expected: $expected_exit)"
        return 1
    fi
}

# Setup test environment
setup_test_env() {
    log_info "Setting up test environment..."

    # Create test directory
    mkdir -p "$TEST_DIR"
    cd "$TEST_DIR"

    # Initialize git repo
    git init >/dev/null 2>&1
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Create initial structure
    mkdir -p .claude/{agents/custom,state,backups}

    # Create a minimal expert agent file
    cat > .claude/agents/custom/cfn-system-expert.md << 'EOF'
---
name: cfn-system-expert
description: Test expert agent
---

# Test Expert Agent

This is a test expert agent.

EOF
}

# Cleanup test environment
cleanup_test_env() {
    log_info "Cleaning up test environment..."
    cd "$PROJECT_ROOT"
    rm -rf "$TEST_DIR"
}

# Test 1: Script exists and is executable
test_script_exists() {
    run_test "Script exists and is executable" \
        "test -f '$SKILL_SCRIPT' && test -x '$SKILL_SCRIPT'"
}

# Test 2: Help output
test_help_output() {
    run_test "Script shows help on unknown parameter" \
        "'$SKILL_SCRIPT' --help 2>&1 | grep -q 'Usage\\|Unknown parameter'"
}

# Test 3: Dry run mode
test_dry_run() {
    cd "$TEST_DIR"

    # Create a test commit
    echo "test" > test-file.md
    git add test-file.md
    git commit -m "test: Add test file" >/dev/null 2>&1

    run_test "Dry run mode works" \
        "'$SKILL_SCRIPT' --dry-run --since=HEAD~1"
}

# Test 4: Invalid commit range
test_invalid_range() {
    cd "$TEST_DIR"

    run_test "Handles invalid commit range gracefully" \
        "'$SKILL_SCRIPT' --since=invalidhash123"
}

# Test 5: Missing agent file
test_missing_agent() {
    cd "$TEST_DIR"
    rm -f .claude/agents/custom/cfn-system-expert.md

    run_test "Detects missing expert agent file" \
        "'$SKILL_SCRIPT' --dry-run" 1
}

# Test 6: No git repository
test_no_git_repo() {
    cd /tmp

    run_test "Detects non-git directory" \
        "'$SKILL_SCRIPT' --dry-run" 1
}

# Test 7: Force mode
test_force_mode() {
    cd "$TEST_DIR"

    # Restore agent file
    cat > .claude/agents/custom/cfn-system-expert.md << 'EOF'
---
name: cfn-system-expert
description: Test expert agent
---

# Test Expert Agent

EOF

    run_test "Force mode works" \
        "'$SKILL_SCRIPT' --dry-run --force"
}

# Test 8: Creates backups
test_backup_creation() {
    cd "$TEST_DIR"

    # Create another commit
    echo "test2" > test-file2.md
    git add test-file2.md
    git commit -m "test: Add second test file" >/dev/null 2>&1

    # Run without dry-run to create backup
    '$SKILL_SCRIPT' --since=HEAD~2 >/dev/null 2>&1 || true

    run_test "Creates backup directory" \
        "test -d .claude/backups/cfn-expert"
}

# Test 9: Pattern matching
test_pattern_matching() {
    cd "$TEST_DIR"

    # Create a CFN-relevant commit
    mkdir -p .claude/skills/cfn-test
    echo "test skill" > .claude/skills/cfn-test/test.md
    git add .claude/skills/cfn-test/test.md
    git commit -m "feat: Add CFN test skill" >/dev/null 2>&1

    # Check if it detects the pattern
    if '$SKILL_SCRIPT' --dry-run --since=HEAD~1 2>&1 | grep -q "Relevant commit found"; then
        log_pass "Pattern matching test"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Pattern matching test"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 10: State tracking
test_state_tracking() {
    cd "$TEST_DIR"

    # Run update
    '$SKILL_SCRIPT' --since=HEAD~1 >/dev/null 2>&1 || true

    run_test "Tracks last commit state" \
        "test -f .claude/state/cfn-expert-last-commit"
}

# Main test runner
main() {
    echo "Running CFN Expert Update Skill Tests"
    echo "===================================="
    echo

    # Run tests
    test_script_exists
    test_help_output

    # Setup test environment for integration tests
    setup_test_env

    test_dry_run
    test_invalid_range
    test_missing_agent
    test_no_git_repo

    # Recreate environment for remaining tests
    cleanup_test_env
    setup_test_env

    test_force_mode
    test_backup_creation
    test_pattern_matching
    test_state_tracking

    # Cleanup
    cleanup_test_env

    # Report results
    echo
    echo "Test Results"
    echo "============"
    echo "Tests run: $TESTS_RUN"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    fi
}

# Run main function
main "$@"