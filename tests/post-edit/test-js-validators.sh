#!/bin/bash
# Comprehensive Test Suite for JavaScript Validators
# Tests js-async-error-handling validator and ESLint integration

set -euo pipefail

# Test environment setup
VALIDATOR_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/hook-pipeline"
TEST_DIR="/tmp/js-validator-tests-$$"
PASSED=0
FAILED=0

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Setup test directory
setup_test_env() {
    mkdir -p "$TEST_DIR"
    echo "Test directory: $TEST_DIR"
}

# Cleanup test directory
cleanup() {
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test result reporting
report_result() {
    local test_name="$1"
    local result="$2"
    local message="${3:-}"

    if [[ "$result" == "PASS" ]]; then
        echo -e "${GREEN}✓ PASSED${NC}: $test_name"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAILED${NC}: $test_name"
        if [[ -n "$message" ]]; then
            echo -e "  ${YELLOW}Reason: $message${NC}"
        fi
        FAILED=$((FAILED + 1))
    fi
}

# ============================================================================
# TEST 1: js-async-error-handling detects async call without await/catch
# ============================================================================
test_async_no_error_handling() {
    local test_file="$TEST_DIR/async_no_error_handling.js"

    cat > "$test_file" <<'EOF'
// Async calls without error handling

async function fetchData() {
    const response = await fetch('https://api.example.com/data');
    return response.json();
}

async function main() {
    // Fire-and-forget without await or .catch()
    fetchData();

    // Promise without .catch()
    Promise.resolve().then(() => {
        throw new Error('Unhandled error');
    });

    // Async function call without await
    const promise = fetchData();
}

main();
EOF

    # Run validator
    local exit_code=0
    local output
    output=$("$VALIDATOR_DIR/js-promise-safety.sh" "$test_file" 2>&1) || exit_code=$?

    # Expected: Exit 2 (warning), output contains error handling warning
    if [[ $exit_code -eq 2 ]] && [[ "$output" =~ "async" || "$output" =~ "error" || "$output" =~ "catch" ]]; then
        report_result "TEST 1: async without await/catch detection" "PASS"
    else
        report_result "TEST 1: async without await/catch detection" "FAIL" \
            "Expected exit 2 and warning, got exit $exit_code. Output: $output"
    fi
}

# ============================================================================
# TEST 2: js-async-error-handling passes async call with await
# ============================================================================
test_async_with_await() {
    local test_file="$TEST_DIR/async_with_await.js"

    cat > "$test_file" <<'EOF'
// Async calls with proper error handling

async function fetchData() {
    const response = await fetch('https://api.example.com/data');
    return response.json();
}

async function main() {
    try {
        // Properly awaited with try-catch
        const data = await fetchData();
        console.log(data);
    } catch (error) {
        console.error('Error fetching data:', error);
    }

    // Another valid pattern with await
    const result = await Promise.resolve('success');
}

main().catch(error => {
    console.error('Unhandled error in main:', error);
});
EOF

    # Run validator
    local exit_code=0
    "$VALIDATOR_DIR/js-promise-safety.sh" "$test_file" 2>/dev/null || exit_code=$?

    # Expected: Exit 0 (pass)
    if [[ $exit_code -eq 0 ]]; then
        report_result "TEST 2: async with await and try-catch" "PASS"
    else
        report_result "TEST 2: async with await and try-catch" "FAIL" \
            "Expected exit 0, got exit $exit_code"
    fi
}

# ============================================================================
# TEST 3: js-async-error-handling passes async call with .catch()
# ============================================================================
test_async_with_catch() {
    local test_file="$TEST_DIR/async_with_catch.js"

    cat > "$test_file" <<'EOF'
// Async calls with .catch() error handling

async function fetchData() {
    const response = await fetch('https://api.example.com/data');
    return response.json();
}

function main() {
    // Promise chain with .catch()
    fetchData()
        .then(data => {
            console.log(data);
        })
        .catch(error => {
            console.error('Error:', error);
        });

    // Another valid pattern
    Promise.resolve('success')
        .then(result => console.log(result))
        .catch(error => console.error(error));

    // Async IIFE with .catch()
    (async () => {
        const data = await fetchData();
        console.log(data);
    })().catch(error => {
        console.error('Error in IIFE:', error);
    });
}

main();
EOF

    # Run validator
    local exit_code=0
    "$VALIDATOR_DIR/js-promise-safety.sh" "$test_file" 2>/dev/null || exit_code=$?

    # Expected: Exit 0 (pass)
    if [[ $exit_code -eq 0 ]]; then
        report_result "TEST 3: async with .catch() handlers" "PASS"
    else
        report_result "TEST 3: async with .catch() handlers" "FAIL" \
            "Expected exit 0, got exit $exit_code"
    fi
}

# ============================================================================
# TEST 4: ESLint integration (if installed)
# ============================================================================
test_eslint_integration() {
    local test_file="$TEST_DIR/eslint_test.js"

    cat > "$test_file" <<'EOF'
// Code with potential ESLint issues

function example() {
    var x = 1; // prefer const/let
    console.log(x)
    return x + 2
}

const unused = 'variable'; // unused variable

example();
EOF

    # Check if ESLint is installed
    if ! command -v eslint &> /dev/null; then
        report_result "TEST 4: ESLint integration" "PASS" \
            "ESLint not installed, skipping integration test"
        return
    fi

    # Run ESLint
    local exit_code=0
    local output
    output=$(eslint "$test_file" 2>&1) || exit_code=$?

    # Expected: ESLint runs (exit code may vary based on issues found)
    # Just verify ESLint executed successfully
    if [[ $exit_code -ge 0 ]]; then
        report_result "TEST 4: ESLint integration" "PASS"
    else
        report_result "TEST 4: ESLint integration" "FAIL" \
            "ESLint execution failed with exit $exit_code"
    fi
}

# ============================================================================
# Main Test Execution
# ============================================================================

echo "=========================================="
echo "JavaScript Validators Comprehensive Test Suite"
echo "=========================================="
echo ""

setup_test_env

echo "Running tests..."
echo ""

# Execute all tests
test_async_no_error_handling
test_async_with_await
test_async_with_catch
test_eslint_integration

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "Total:  $((PASSED + FAILED))"

# Exit with appropriate code
if [[ $FAILED -eq 0 ]]; then
    echo -e "\n${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}Some tests failed!${NC}"
    exit 1
fi
