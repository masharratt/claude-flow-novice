#!/usr/bin/env bash
################################################################################
# test-equation-solver.sh
# Comprehensive security and functional tests for equation-solver skill
#
# Test Coverage:
# - Security: Template injection, command injection, path traversal
# - Input validation: Character whitelisting, length limits, parentheses balancing
# - Functional: Basic equations, complex equations, no solutions, multiple solutions
# - Edge cases: Empty input, very long input, special characters
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
################################################################################

set -euo pipefail

# Source test utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TEST_UTILS="$PROJECT_ROOT/tests/test-utils.sh"

if [[ ! -f "$TEST_UTILS" ]]; then
    echo "Error: test-utils.sh not found at $TEST_UTILS" >&2
    exit 1
fi

source "$TEST_UTILS"

# Configuration
readonly SOLVE_SCRIPT="$SCRIPT_DIR/solve.sh"
readonly TEST_RESULTS_DIR="${PROJECT_ROOT}/.artifacts/test-results/equation-solver"

# Ensure solve.sh exists and is executable
if [[ ! -x "$SOLVE_SCRIPT" ]]; then
    echo "Error: $SOLVE_SCRIPT does not exist or is not executable" >&2
    exit 1
fi

# Create test results directory
mkdir -p "$TEST_RESULTS_DIR"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

################################################################################
# Function: run_security_test
# Executes a security test and validates the rejection
# Arguments:
#   $1 - Test name
#   $2 - Test input (equation)
#   $3 - Expected exit code (should be non-zero for injection attempts)
################################################################################
run_security_test() {
    local test_name="$1"
    local test_input="$2"
    local expected_exit_code="${3:-1}"

    (( TESTS_TOTAL++ ))

    log_step "Security Test: $test_name"
    log_info "Input: $test_input"

    # Run the test and capture output and exit code
    local output
    local exit_code=0
    output=$("$SOLVE_SCRIPT" "$test_input" 2>&1) || exit_code=$?

    log_info "Exit code: $exit_code"
    log_info "Output: $output"

    # Validate the test result
    if [[ $exit_code -eq $expected_exit_code ]]; then
        (( TESTS_PASSED++ ))
        annotate "✓ PASSED" "green"
        return 0
    else
        (( TESTS_FAILED++ ))
        annotate "✗ FAILED" "red"
        echo "Expected exit code $expected_exit_code, got $exit_code" >&2
        return 1
    fi
}

################################################################################
# Function: run_functional_test
# Executes a functional test and validates the solution
# Arguments:
#   $1 - Test name
#   $2 - Equation
#   $3 - Variable
#   $4 - Expected substring in output (optional)
################################################################################
run_functional_test() {
    local test_name="$1"
    local equation="$2"
    local variable="${3:-x}"
    local expected_pattern="${4:-solutions}"

    (( TESTS_TOTAL++ ))

    log_step "Functional Test: $test_name"
    log_info "Equation: $equation"
    log_info "Variable: $variable"

    # Run the test
    local output
    local exit_code=0
    output=$("$SOLVE_SCRIPT" "$equation" "$variable" 2>&1) || exit_code=$?

    log_info "Exit code: $exit_code"
    log_info "Output: $output"

    # Validate the test result
    if [[ $exit_code -eq 0 ]] && echo "$output" | grep -q "$expected_pattern"; then
        (( TESTS_PASSED++ ))
        annotate "✓ PASSED" "green"
        return 0
    else
        (( TESTS_FAILED++ ))
        annotate "✗ FAILED" "red"
        echo "Expected pattern '$expected_pattern' in output" >&2
        return 1
    fi
}

################################################################################
# SECURITY TESTS
################################################################################
run_security_tests() {
    echo "================================================================================"
    echo "SECURITY TESTS"
    echo "================================================================================"

    # Test 1: Template Injection - Process Exit
    run_security_test \
        "Template Injection: process.exit()" \
        "'; process.exit(1); '" \
        1

    # Test 2: Template Injection - Console Log
    run_security_test \
        "Template Injection: console.log" \
        "'; console.log('hacked'); '" \
        1

    # Test 3: Command Injection - Backticks
    run_security_test \
        "Command Injection: Backticks" \
        "\$(whoami)" \
        1

    # Test 4: Command Injection - Command Substitution
    run_security_test \
        "Command Injection: Command Substitution" \
        "x + \$(id)" \
        1

    # Test 5: Command Injection - Pipe
    run_security_test \
        "Command Injection: Pipe" \
        "x + 1 | cat /etc/passwd" \
        1

    # Test 6: Command Injection - Semicolon
    run_security_test \
        "Command Injection: Semicolon" \
        "x + 1; rm -rf /" \
        1

    # Test 7: Command Injection - Ampersand
    run_security_test \
        "Command Injection: Background Execution" \
        "x + 1 & whoami" \
        1

    # Test 8: Path Traversal
    run_security_test \
        "Path Traversal: Directory Traversal" \
        "../../etc/passwd" \
        1

    # Test 9: Complexity Attack - Very Long Equation
    local long_equation=$(printf 'x+1%.0s' {1..1000})
    run_security_test \
        "DoS Attack: Very Long Equation (1000 chars)" \
        "$long_equation" \
        1

    # Test 10: Double Quote Injection
    run_security_test \
        "Quote Injection: Double Quotes" \
        "x\"test\"" \
        1

    # Test 11: Single Quote Injection
    run_security_test \
        "Quote Injection: Single Quotes" \
        "x'test'" \
        1

    # Test 12: Backtick Injection
    run_security_test \
        "Backtick Injection" \
        "x\`whoami\`" \
        1

    # Test 13: Dollar Sign Injection (Variable Expansion)
    run_security_test \
        "Variable Expansion: Dollar Sign" \
        "\$SHELL" \
        1

    # Test 14: Require Statement (Node.js)
    run_security_test \
        "Node.js Injection: require" \
        "require('fs')" \
        1

    # Test 15: Eval Injection
    run_security_test \
        "Node.js Injection: eval" \
        "eval('malicious')" \
        1

    # Test 16: Process Object Access
    run_security_test \
        "Node.js Injection: process object" \
        "process.exit(1)" \
        1

    # Test 17: Unbalanced Parentheses - Open
    run_security_test \
        "Parentheses Validation: Unbalanced Open" \
        "x + ((5 + 2" \
        1

    # Test 18: Unbalanced Parentheses - Close
    run_security_test \
        "Parentheses Validation: Unbalanced Close" \
        "x + 5)) + 2" \
        1

    # Test 19: Empty Input
    run_security_test \
        "Empty Input" \
        "" \
        1

    # Test 20: Null Byte Injection
    run_security_test \
        "Null Byte Injection" \
        "x + 1\0malicious" \
        1

    echo ""
}

################################################################################
# FUNCTIONAL TESTS
################################################################################
run_functional_tests() {
    echo "================================================================================"
    echo "FUNCTIONAL TESTS"
    echo "================================================================================"

    # Test 1: Simple Linear Equation
    run_functional_test \
        "Linear Equation: x + 2 = 5" \
        "x + 2 = 5" \
        "x" \
        "solutions"

    # Test 2: Quadratic Equation with Two Solutions
    run_functional_test \
        "Quadratic Equation: x^2 + 5x + 6 = 0" \
        "x^2 + 5x + 6 = 0" \
        "x" \
        "solutions"

    # Test 3: Quadratic Equation Factored Form
    run_functional_test \
        "Factored Quadratic: (x + 2)(x + 3) = 0" \
        "(x + 2)(x + 3) = 0" \
        "x" \
        "solutions"

    # Test 4: Quadratic with Decimal Coefficients
    run_functional_test \
        "Decimal Coefficients: 0.5x^2 + 2.5x + 3 = 0" \
        "0.5x^2 + 2.5x + 3 = 0" \
        "x" \
        "solutions"

    # Test 5: Equation with No Solutions
    run_functional_test \
        "No Solutions: x^2 + 1 = 0 (imaginary roots)" \
        "x^2 + 1 = 0" \
        "x" \
        "solutions"

    # Test 6: Equation with Negative Coefficients
    run_functional_test \
        "Negative Coefficients: -x^2 - 5x - 6 = 0" \
        "-x^2 - 5x - 6 = 0" \
        "x" \
        "solutions"

    # Test 7: Equation with Division
    run_functional_test \
        "Division Operator: x / 2 + 3 = 5" \
        "x / 2 + 3 = 5" \
        "x" \
        "solutions"

    # Test 8: Equation with Exponent
    run_functional_test \
        "Exponent Operator: x^3 = 8" \
        "x^3 = 8" \
        "x" \
        "solutions"

    # Test 9: Multiple Variables (Solve for specific)
    run_functional_test \
        "Multiple Variables: 2x + y = 5, solve for x" \
        "2x + y = 5" \
        "x" \
        "solutions"

    # Test 10: Equation with Spaces
    run_functional_test \
        "Spaces in Equation: x + 2 = 5" \
        "x + 2 = 5" \
        "x" \
        "solutions"

    # Test 11: Complex Polynomial
    run_functional_test \
        "Cubic Equation: x^3 - 6x^2 + 11x - 6 = 0" \
        "x^3 - 6x^2 + 11x - 6 = 0" \
        "x" \
        "solutions"

    # Test 12: Equation with Multiple Operations
    run_functional_test \
        "Mixed Operations: 3x^2 - 12x + 9 = 0" \
        "3x^2 - 12x + 9 = 0" \
        "x" \
        "solutions"

    # Test 13: Different Variable Name
    run_functional_test \
        "Different Variable: y^2 - 4 = 0" \
        "y^2 - 4 = 0" \
        "y" \
        "solutions"

    # Test 14: Help Flag
    local help_output=$("$SOLVE_SCRIPT" -h 2>&1 || true)
    if echo "$help_output" | grep -q "Usage:"; then
        (( TESTS_PASSED++ ))
        (( TESTS_TOTAL++ ))
        log_step "Help Output Test"
        annotate "✓ PASSED" "green"
    else
        (( TESTS_FAILED++ ))
        (( TESTS_TOTAL++ ))
        log_step "Help Output Test"
        annotate "✗ FAILED" "red"
    fi

    echo ""
}

################################################################################
# EDGE CASE TESTS
################################################################################
run_edge_case_tests() {
    echo "================================================================================"
    echo "EDGE CASE TESTS"
    echo "================================================================================"

    # Test 1: Maximum Length Equation (exactly 500 chars)
    local max_eq=$(printf 'x+1%.0s' {1..249})  # 498 chars
    run_functional_test \
        "Maximum Length Equation (498 chars)" \
        "$max_eq" \
        "x" \
        "solutions"

    # Test 2: Equation at Length Boundary + 1 (501 chars - should fail)
    local over_limit=$(printf 'x+1%.0s' {1..251})  # 502 chars
    run_security_test \
        "Over Length Limit (502 chars)" \
        "$over_limit" \
        1

    # Test 3: Single Character Equation
    run_functional_test \
        "Single Variable: x" \
        "x = 0" \
        "x" \
        "solutions"

    # Test 4: Parentheses Only
    run_security_test \
        "Only Parentheses: ()" \
        "()" \
        1

    # Test 5: Invalid Variable Name Starting with Number
    local invalid_var_output=$("$SOLVE_SCRIPT" "x + 2 = 5" "1x" 2>&1 || true)
    if ! echo "$invalid_var_output" | grep -q "solutions"; then
        (( TESTS_PASSED++ ))
        (( TESTS_TOTAL++ ))
        log_step "Invalid Variable: Starting with Number"
        annotate "✓ PASSED" "green"
    else
        (( TESTS_FAILED++ ))
        (( TESTS_TOTAL++ ))
        log_step "Invalid Variable: Starting with Number"
        annotate "✗ FAILED" "red"
    fi

    # Test 6: Variable with Underscore (valid)
    run_functional_test \
        "Valid Variable: x_1" \
        "x_1 + 2 = 5" \
        "x_1" \
        "solutions"

    # Test 7: Zero Exponent
    run_functional_test \
        "Zero Exponent: x^0 = 1" \
        "x^0 = 1" \
        "x" \
        "solutions"

    # Test 8: Negative Exponent
    run_functional_test \
        "Negative Exponent: x^(-1) = 2" \
        "x^(-1) = 2" \
        "x" \
        "solutions"

    echo ""
}

################################################################################
# MAIN TEST EXECUTION
################################################################################
main() {
    log_info "Starting equation-solver security and functional tests..."
    echo ""

    # Run test suites
    run_security_tests
    run_functional_tests
    run_edge_case_tests

    # Generate test report
    local pass_percentage=0
    if (( TESTS_TOTAL > 0 )); then
        pass_percentage=$(( (TESTS_PASSED * 100) / TESTS_TOTAL ))
    fi

    # Save test results
    cat > "$TEST_RESULTS_DIR/test-summary.txt" << EOF
Equation-Solver Test Results
============================
Total Tests: $TESTS_TOTAL
Passed: $TESTS_PASSED
Failed: $TESTS_FAILED
Pass Rate: $pass_percentage%
Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

    # Print summary
    echo "================================================================================"
    echo "TEST SUMMARY"
    echo "================================================================================"
    echo "Total Tests: $TESTS_TOTAL"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"
    echo "Pass Rate: $pass_percentage%"
    echo "================================================================================"
    echo ""

    # Return appropriate exit code
    if (( TESTS_FAILED > 0 )); then
        echo "OVERALL RESULT: FAILED" >&2
        return 1
    else
        echo "OVERALL RESULT: PASSED"
        return 0
    fi
}

# Cleanup function
cleanup() {
    log_info "Test cleanup complete"
}

trap cleanup EXIT

# Execute main with all arguments passed through
main "$@"
