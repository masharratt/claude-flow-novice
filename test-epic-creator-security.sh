#!/usr/bin/env bash
set -euo pipefail

# Test script to validate epic-creator-v2 security fixes
# Tests command injection, path traversal, and input sanitization

# Color codes for output
readonly GREEN='\033[0;32m'
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

# Run a test case
run_test() {
    ((TESTS_RUN++))
    log_test "Running: $1"

    if eval "$2"; then
        log_pass "Test passed: $1"
    else
        log_fail "Test failed: $1"
    fi
    echo
}

# Test command injection protection
test_command_injection() {
    echo "=== Testing Command Injection Protection ==="

    # Test 1: Command substitution attempt
    run_test "Command substitution \$(whoami)" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! sanitize_string "test\$(whoami)" 2>/dev/null'

    # Test 2: Backtick command substitution
    run_test "Backtick command substitution \`whoami\`" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! sanitize_string "test\`whoami\`" 2>/dev/null'

    # Test 3: Pipe character
    run_test "Pipe character injection" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! sanitize_string "test | ls" 2>/dev/null'

    # Test 4: Command chaining
    run_test "Command chaining &&" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! sanitize_string "test && rm -rf" 2>/dev/null'

    # Test 5: Command chaining ||"
    run_test "Command chaining ||" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! sanitize_string "test || rm -rf" 2>/dev/null'

    # Test 6: Semicolon
    run_test "Semicolon separator" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! sanitize_string "test; rm -rf" 2>/dev/null'

    # Test 7: Output redirection
    run_test "Output redirection >" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! sanitize_string "test > /etc/passwd" 2>/dev/null'
}

# Test path traversal protection
test_path_traversal() {
    echo "=== Testing Path Traversal Protection ==="

    # Test 1: Directory traversal
    run_test "Directory traversal ../etc/passwd" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! validate_path "../../../etc/passwd" 2>/dev/null'

    # Test 2: Absolute path outside
    run_test "Absolute path outside /etc/passwd" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! validate_path "/etc/passwd" 2>/dev/null'

    # Test 3: Home directory
    run_test "Home directory ~/" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! validate_path "~/.ssh/id_rsa" 2>/dev/null'

    # Test 4: Valid relative path
    run_test "Valid relative path" \
        '. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && validate_path "./output.json" 2>/dev/null'
}

# Test input validation
test_input_validation() {
    echo "=== Testing Input Validation ==="

    # Test 1: Empty input
    run_test "Empty epic description" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! validate_epic_description "" 2>/dev/null'

    # Test 2: Too short input
    run_test "Too short epic description" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! validate_epic_description "ab" 2>/dev/null'

    # Test 3: Valid input
    run_test "Valid epic description" \
        '. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && validate_epic_description "This is a valid epic description" 2>/dev/null'

    # Test 4: Input exceeding max length
    run_test "Input exceeding max length" \
        '!. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && ! sanitize_string "$(printf "a%.0s" {1..10001})" 2>/dev/null'
}

# Test secure temp file creation
test_temp_file_creation() {
    echo "=== Testing Secure Temp File Creation ==="

    # Test 1: Create secure temp file
    run_test "Create secure temp file" \
        '. ./.claude/skills/cfn-epic-creator/security-utils.sh \
            && temp_file=$(create_secure_temp "test" "tmp") \
            && [[ -f "$temp_file" ]] \
            && [[ "$(stat -c %a "$temp_file" 2>/dev/null || stat -f%A "$temp_file" 2>/dev/null)" == "600" ]] \
            && rm -f "$temp_file"'
}

# Test epic creator with malicious inputs
test_epic_creator_malicious() {
    echo "=== Testing Epic Creator with Malicious Inputs ==="

    # Test 1: Command injection in description
    run_test "Epic creator with command injection" \
        '! ./.claude/agents/cfn-dev-team/utility/epic-creator-v2.sh \
            "test\$(whoami) injection" --mode=mvp >/dev/null 2>&1'

    # Test 2: Path traversal in output
    run_test "Epic creator with path traversal output" \
        '! ./.claude/agents/cfn-dev-team/utility/epic-creator-v2.sh \
            "test epic" --output="../../../etc/passwd" >/dev/null 2>&1'

    # Test 3: Valid epic creation
    run_test "Valid epic creation" \
        'temp_out=$(mktemp) \
            && ./.claude/agents/cfn-dev-team/utility/epic-creator-v2.sh \
                "Test epic for validation" --output="$temp_out" >/dev/null 2>&1 \
            && [[ -f "$temp_out" ]] \
            && jq . "$temp_out" >/dev/null 2>&1 \
            && rm -f "$temp_out"'
}

# Main execution
main() {
    echo "Starting Epic Creator v2 Security Validation Tests"
    echo "=============================================="
    echo

    # Run all test suites
    test_command_injection
    test_path_traversal
    test_input_validation
    test_temp_file_creation
    test_epic_creator_malicious

    # Summary
    echo "=============================================="
    echo "Test Summary:"
    echo "  Total tests run: $TESTS_RUN"
    echo -e "  Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "  Failed: ${RED}$TESTS_FAILED${NC}"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}✅ All security tests passed!${NC}"
        exit 0
    else
        echo -e "\n${RED}❌ Some security tests failed!${NC}"
        exit 1
    fi
}

# Run main function
main "$@"