#!/bin/bash
# Comprehensive Test Suite for Python Validators
# Tests python-subprocess-stderr, python-async-await, and python-import-checker validators

set -euo pipefail

# Test environment setup
VALIDATOR_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/hook-pipeline"
TEST_DIR="/tmp/python-validator-tests-$$"
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
# TEST 1: python-subprocess-stderr detects subprocess without stderr
# ============================================================================
test_subprocess_no_stderr() {
    local test_file="$TEST_DIR/subprocess_no_stderr.py"

    cat > "$test_file" <<'EOF'
#!/usr/bin/env python3
import subprocess

# Subprocess call without stderr redirect
result = subprocess.run(['ls', '-la'])
output = subprocess.check_output(['echo', 'hello'])

# Popen without stderr redirect
proc = subprocess.Popen(['cat', '/tmp/file.txt'])
EOF

    # Run validator
    local exit_code=0
    local output
    output=$("$VALIDATOR_DIR/python-subprocess-safety.py" "$test_file" 2>&1) || exit_code=$?

    # Expected: Exit 2 (warning), output contains warning message
    if [[ $exit_code -eq 2 ]] && [[ "$output" =~ "subprocess" || "$output" =~ "stderr" ]]; then
        report_result "TEST 1: subprocess without stderr redirect" "PASS"
    else
        report_result "TEST 1: subprocess without stderr redirect" "FAIL" \
            "Expected exit 2 and warning, got exit $exit_code. Output: $output"
    fi
}

# ============================================================================
# TEST 2: python-subprocess-stderr passes subprocess with stderr
# ============================================================================
test_subprocess_with_stderr() {
    local test_file="$TEST_DIR/subprocess_with_stderr.py"

    cat > "$test_file" <<'EOF'
#!/usr/bin/env python3
import subprocess

# Subprocess call with stderr redirect
result = subprocess.run(['ls', '-la'], stderr=subprocess.PIPE)
output = subprocess.check_output(['echo', 'hello'], stderr=subprocess.STDOUT)

# Popen with stderr redirect
proc = subprocess.Popen(['cat', '/tmp/file.txt'], stderr=subprocess.DEVNULL)

# Using capture_output (includes stderr)
result = subprocess.run(['pwd'], capture_output=True)
EOF

    # Run validator
    local exit_code=0
    "$VALIDATOR_DIR/python-subprocess-safety.py" "$test_file" 2>/dev/null || exit_code=$?

    # Expected: Exit 0 (pass)
    if [[ $exit_code -eq 0 ]]; then
        report_result "TEST 2: subprocess with stderr redirect" "PASS"
    else
        report_result "TEST 2: subprocess with stderr redirect" "FAIL" \
            "Expected exit 0, got exit $exit_code"
    fi
}

# ============================================================================
# TEST 3: python-async-await detects async call without await
# ============================================================================
test_async_no_await() {
    local test_file="$TEST_DIR/async_no_await.py"

    cat > "$test_file" <<'EOF'
#!/usr/bin/env python3
import asyncio

async def fetch_data():
    await asyncio.sleep(1)
    return "data"

async def main():
    # Async call without await (fire-and-forget)
    fetch_data()

    # Another async call without await
    result = fetch_data()  # Creates coroutine but doesn't await it
EOF

    # Run validator
    local exit_code=0
    local output
    output=$("$VALIDATOR_DIR/python-async-safety.py" "$test_file" 2>&1) || exit_code=$?

    # Expected: Exit 2 (warning), output contains warning message
    if [[ $exit_code -eq 2 ]] && [[ "$output" =~ "async" || "$output" =~ "await" ]]; then
        report_result "TEST 3: async call without await" "PASS"
    else
        report_result "TEST 3: async call without await" "FAIL" \
            "Expected exit 2 and warning, got exit $exit_code. Output: $output"
    fi
}

# ============================================================================
# TEST 4: python-async-await passes async call with await
# ============================================================================
test_async_with_await() {
    local test_file="$TEST_DIR/async_with_await.py"

    cat > "$test_file" <<'EOF'
#!/usr/bin/env python3
import asyncio

async def fetch_data():
    await asyncio.sleep(1)
    return "data"

async def main():
    # Async call with await
    result = await fetch_data()

    # asyncio.create_task is valid (tracked task)
    task = asyncio.create_task(fetch_data())
    await task

    # asyncio.gather is valid
    results = await asyncio.gather(fetch_data(), fetch_data())
EOF

    # Run validator
    local exit_code=0
    "$VALIDATOR_DIR/python-async-safety.py" "$test_file" --debug 2>/dev/null || exit_code=$?

    # Expected: Exit 0 (pass)
    if [[ $exit_code -eq 0 ]]; then
        report_result "TEST 4: async call with await" "PASS"
    else
        report_result "TEST 4: async call with await" "FAIL" \
            "Expected exit 0, got exit $exit_code. Debug output:"
        "$VALIDATOR_DIR/python-async-safety.py" "$test_file" --debug 2>&1
    fi
}

# ============================================================================
# TEST 5: python-import-checker catches missing import
# ============================================================================
test_import_missing() {
    local test_file="$TEST_DIR/import_missing.py"

    cat > "$test_file" <<'EOF'
#!/usr/bin/env python3
# Script with missing imports

def main():
    # Using json without import
    data = json.loads('{"key": "value"}')

    # Using requests without import
    response = requests.get('https://example.com')

    # Using numpy without import
    array = numpy.array([1, 2, 3])
EOF

    # Run validator
    local exit_code=0
    local output
    output=$("$VALIDATOR_DIR/python-import-checker.py" "$test_file" 2>&1) || exit_code=$?

    # Expected: Exit 2 (warning), output contains import warning
    if [[ $exit_code -eq 2 ]] && [[ "$output" =~ "import" || "$output" =~ "json" || "$output" =~ "requests" ]]; then
        report_result "TEST 5: missing import detection" "PASS"
    else
        report_result "TEST 5: missing import detection" "FAIL" \
            "Expected exit 2 and import warning, got exit $exit_code. Output: $output"
        "$VALIDATOR_DIR/python-import-checker.py" "$test_file" --debug 2>&1
    fi
}

# ============================================================================
# TEST 6: python-import-checker passes valid imports
# ============================================================================
test_import_valid() {
    local test_file="$TEST_DIR/import_valid.py"

    cat > "$test_file" <<'EOF'
#!/usr/bin/env python3
import json
import requests
import numpy as np
from typing import List, Dict

def main():
    # Using json after import
    data = json.loads('{"key": "value"}')

    # Using requests after import
    response = requests.get('https://example.com')

    # Using numpy after import
    array = np.array([1, 2, 3])

    # Using typing imports
    my_list: List[str] = ["a", "b"]
    my_dict: Dict[str, int] = {"key": 1}
EOF

    # Run validator
    local exit_code=0
    "$VALIDATOR_DIR/python-import-checker.py" "$test_file" 2>/dev/null || exit_code=$?

    # Expected: Exit 0 (pass)
    if [[ $exit_code -eq 0 ]]; then
        report_result "TEST 6: valid imports pass" "PASS"
    else
        report_result "TEST 6: valid imports pass" "FAIL" \
            "Expected exit 0, got exit $exit_code"
    fi
}

# ============================================================================
# Main Test Execution
# ============================================================================

echo "=========================================="
echo "Python Validators Comprehensive Test Suite"
echo "=========================================="
echo ""

setup_test_env

echo "Running tests..."
echo ""

# Execute all tests
test_subprocess_no_stderr
test_subprocess_with_stderr
test_async_no_await
test_async_with_await
test_import_missing
test_import_valid

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