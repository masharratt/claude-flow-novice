#!/usr/bin/env bash
################################################################################
# test-equation-solver-minimal.sh
# Quick security and functional test suite for equation-solver skill
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOLVE_SCRIPT="$SCRIPT_DIR/solve.sh"

PASSED=0
FAILED=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

run_test() {
    local test_name="$1"
    local equation="$2"
    local expected_exit="${3:-1}"
    local check_output="${4:-}"

    local actual_exit=0
    local output=""

    output=$("$SOLVE_SCRIPT" "$equation" 2>&1) || actual_exit=$?

    if [[ $actual_exit -eq $expected_exit ]]; then
        if [[ -z "$check_output" ]] || echo "$output" | grep -q "$check_output"; then
            echo -e "${GREEN}✓${NC} $test_name"
            (( PASSED++ ))
            return 0
        fi
    fi

    echo -e "${RED}✗${NC} $test_name"
    echo "  Input: $equation"
    echo "  Expected exit: $expected_exit, got: $actual_exit"
    echo "  Output: $output"
    (( FAILED++ ))
    return 1
}

echo "================================================================================"
echo "SECURITY TESTS - Injection Prevention"
echo "================================================================================"

run_test "Template Injection: process.exit()" "'; process.exit(1); '" 1
run_test "Template Injection: console.log()" "x+'; console.log('hacked'); '" 1
run_test "Command Injection: Backticks" "\$(whoami)" 1
run_test "Command Injection: Pipe" "x + 1 | cat /etc/passwd" 1
run_test "Command Injection: Semicolon" "x + 1; rm -rf /" 1
run_test "Command Injection: Ampersand" "x + 1 & whoami" 1
run_test "Path Traversal" "../../etc/passwd" 1
run_test "Quote Injection: Single" "x'test'" 1
run_test "Quote Injection: Double" "x\"test\"" 1
run_test "Backtick Injection" "x\`whoami\`" 1
run_test "Variable Expansion" "\$SHELL" 1
run_test "Unbalanced Parentheses: Open" "x + ((5 + 2" 1
run_test "Unbalanced Parentheses: Close" "x + 5)) + 2" 1
run_test "Empty Input" "" 1
run_test "Very Long Input (1000 chars)" "$(printf 'x+1%.0s' {1..1000})" 1

echo ""
echo "================================================================================"
echo "FUNCTIONAL TESTS - Basic Solving"
echo "================================================================================"

run_test "Linear: x + 2 = 5" "x + 2 = 5" 0 "solutions"
run_test "Linear: 2x - 4 = 0" "2x - 4 = 0" 0 "solutions"
run_test "Quadratic: x^2 + 5x + 6 = 0" "x^2 + 5x + 6 = 0" 0 "solutions"
run_test "Factored: (x + 2)(x + 3) = 0" "(x + 2)(x + 3) = 0" 0 "solutions"
run_test "Decimals: 0.5x + 1 = 2" "0.5x + 1 = 2" 0 "solutions"
run_test "Cubic: x^3 = 8" "x^3 = 8" 0 "solutions"

echo ""
echo "================================================================================"
echo "EDGE CASE TESTS"
echo "================================================================================"

run_test "Single Variable: x = 0" "x = 0" 0 "solutions"
run_test "Max Length (500 chars)" "$(printf 'x+1%.0s' {1..249})" 0 "solutions"
run_test "Different Variable Name" "y^2 - 4 = 0" 0 "solutions"
run_test "Help Flag" "-h" 0 "Usage"

echo ""
echo "================================================================================"
echo "SUMMARY"
echo "================================================================================"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Total: $((PASSED + FAILED))"

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
