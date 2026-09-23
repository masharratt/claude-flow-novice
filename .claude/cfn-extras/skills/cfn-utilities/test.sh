#!/usr/bin/env bash
# CFN Utilities Test Suite
# Tests all utility functions in lib/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/execute.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test result helpers
pass() {
    echo "PASS: $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TESTS_RUN=$((TESTS_RUN + 1))
}

fail() {
    echo "FAIL: $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TESTS_RUN=$((TESTS_RUN + 1))
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if [ "$expected" = "$actual" ]; then
        pass "$test_name"
    else
        fail "$test_name (expected: '$expected', got: '$actual')"
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"

    if [[ "$haystack" == *"$needle"* ]]; then
        pass "$test_name"
    else
        fail "$test_name (string '$needle' not found in output)"
    fi
}

assert_success() {
    local test_name="$1"
    pass "$test_name"
}

assert_failure() {
    local test_name="$1"
    fail "$test_name"
}

# Cleanup temporary test files
cleanup() {
    rm -f /tmp/cfn-test-*
}
trap cleanup EXIT

echo "=== CFN Utilities Test Suite ==="
echo ""

# ===== LOGGING TESTS =====
echo "--- Testing Logging Functions ---"

# Test: log_json outputs valid JSON
output=$(log_json "info" "test message" '{"key":"value"}' 2>&1)
if echo "$output" | grep -q '"timestamp"' && echo "$output" | grep -q '"level":"info"' && echo "$output" | grep -q '"message":"test message"'; then
    pass "log_json outputs valid JSON structure"
else
    fail "log_json output invalid: $output"
fi

# Test: log_info outputs to stderr
output=$(log_info "info test" '{}' 2>&1 >/dev/null)
if echo "$output" | grep -q '"level":"info"'; then
    pass "log_info outputs to stderr"
else
    fail "log_info output incorrect"
fi

# Test: log_error includes error level
output=$(log_error "error test" '{"code":"E001"}' 2>&1)
if echo "$output" | grep -q '"level":"error"' && echo "$output" | grep -q 'E001'; then
    pass "log_error includes error level and context"
else
    fail "log_error output incorrect"
fi

# Test: log_debug respects LOG_LEVEL
LOG_LEVEL=info
output=$(log_debug "debug test" '{}' 2>&1)
if [ -z "$output" ]; then
    pass "log_debug respects LOG_LEVEL=info (no output)"
else
    fail "log_debug should not output when LOG_LEVEL=info"
fi

LOG_LEVEL=debug
output=$(log_debug "debug test" '{}' 2>&1)
if echo "$output" | grep -q '"level":"debug"'; then
    pass "log_debug outputs when LOG_LEVEL=debug"
else
    fail "log_debug should output when LOG_LEVEL=debug"
fi

# Test: generate_correlation_id produces output
corr_id=$(generate_correlation_id)
if [ -n "$corr_id" ]; then
    pass "generate_correlation_id produces non-empty ID"
else
    fail "generate_correlation_id produced empty ID"
fi

# ===== ERROR HANDLING TESTS =====
echo ""
echo "--- Testing Error Handling Functions ---"

# Test: error_handle returns error code
if error_handle "test error" '{}' 2>/dev/null; then
    fail "error_handle should return non-zero exit code"
else
    pass "error_handle returns non-zero exit code"
fi

# Test: is_error_code detects specific codes
EXITCODE=7
if is_error_code $EXITCODE 7; then
    pass "is_error_code detects correct exit code"
else
    fail "is_error_code should detect exit code 7"
fi

# Test: get_error_context returns JSON structure
test_exit_42() { return 42; }
test_exit_42 || true
context=$(get_error_context)
if echo "$context" | grep -q '"exit_code"' && echo "$context" | grep -q '"line"'; then
    pass "get_error_context returns JSON structure"
else
    fail "get_error_context output invalid: $context"
fi

# ===== RETRY TESTS =====
echo ""
echo "--- Testing Retry Functions ---"

# Test: retry_with_backoff succeeds on first try
counter=0
test_command() {
    counter=$((counter + 1))
    return 0
}
if retry_with_backoff 3 1 test_command 2>/dev/null; then
    pass "retry_with_backoff succeeds immediately"
else
    fail "retry_with_backoff should succeed"
fi

# Test: retry_with_backoff retries on failure
attempt_count=0
failing_command() {
    attempt_count=$((attempt_count + 1))
    [ $attempt_count -ge 3 ]
}
if retry_with_backoff 5 1 failing_command 2>/dev/null; then
    assert_equals "3" "$attempt_count" "retry_with_backoff retries correct number of times"
else
    fail "retry_with_backoff should eventually succeed"
fi

# Test: retry_with_backoff gives up after max attempts
always_fail() {
    return 1
}
if retry_with_backoff 2 1 always_fail 2>/dev/null; then
    fail "retry_with_backoff should fail after max attempts"
else
    pass "retry_with_backoff gives up after max attempts"
fi

# Test: retry_fixed uses fixed delay
fixed_count=0
fixed_test() {
    fixed_count=$((fixed_count + 1))
    [ $fixed_count -ge 2 ]
}
if retry_fixed 3 1 fixed_test 2>/dev/null; then
    pass "retry_fixed works with fixed delay"
else
    fail "retry_fixed should succeed"
fi

# ===== FILE OPERATIONS TESTS =====
echo ""
echo "--- Testing File Operations ---"

# Test: atomic_write creates file
test_file="/tmp/cfn-test-atomic-$$"
if atomic_write "$test_file" "test content" 2>/dev/null; then
    if [ -f "$test_file" ] && [ "$(cat "$test_file")" = "test content" ]; then
        pass "atomic_write creates file with correct content"
    else
        fail "atomic_write file content incorrect"
    fi
else
    fail "atomic_write failed"
fi

# Test: atomic_write is actually atomic (no .tmp files left)
test_file2="/tmp/cfn-test-atomic2-$$"
atomic_write "$test_file2" "content" 2>/dev/null
if ! ls /tmp/cfn-test-atomic2-$$.tmp* 2>/dev/null; then
    pass "atomic_write cleans up temporary files"
else
    fail "atomic_write left temporary files"
fi

# Test: acquire_lock creates lock file
lock_file="/tmp/cfn-test-lock-$$"
if acquire_lock "$lock_file" 5 2>/dev/null; then
    if [ -f "$lock_file" ] && [ "$(cat "$lock_file")" = "$$" ]; then
        pass "acquire_lock creates lock file with PID"
        release_lock "$lock_file" 2>/dev/null
    else
        fail "acquire_lock file content incorrect"
        release_lock "$lock_file" 2>/dev/null
    fi
else
    fail "acquire_lock failed"
fi

# Test: acquire_lock blocks concurrent access
lock_file2="/tmp/cfn-test-lock2-$$"
acquire_lock "$lock_file2" 30 2>/dev/null
if acquire_lock "$lock_file2" 1 2>/dev/null; then
    fail "acquire_lock should block when lock is held"
    release_lock "$lock_file2" 2>/dev/null
else
    pass "acquire_lock blocks concurrent access"
    release_lock "$lock_file2" 2>/dev/null
fi

# Test: release_lock removes lock file
lock_file3="/tmp/cfn-test-lock3-$$"
acquire_lock "$lock_file3" 5 2>/dev/null
if release_lock "$lock_file3" 2>/dev/null; then
    if [ ! -f "$lock_file3" ]; then
        pass "release_lock removes lock file"
    else
        fail "release_lock did not remove lock file"
    fi
else
    fail "release_lock failed"
fi

# Test: with_lock executes command with lock
lock_file4="/tmp/cfn-test-lock4-$$"
output_file="/tmp/cfn-test-output-$$"
if with_lock "$lock_file4" 5 bash -c "echo 'locked' > $output_file" 2>/dev/null; then
    if [ -f "$output_file" ] && [ "$(cat "$output_file")" = "locked" ]; then
        pass "with_lock executes command successfully"
    else
        fail "with_lock command did not execute correctly"
    fi
else
    fail "with_lock failed"
fi

# Test: with_lock releases lock after execution
if [ -f "$lock_file4" ]; then
    fail "with_lock did not release lock after execution"
else
    pass "with_lock releases lock after execution"
fi

# Test: is_locked detects active locks
lock_file5="/tmp/cfn-test-lock5-$$"
acquire_lock "$lock_file5" 5 2>/dev/null
if is_locked "$lock_file5"; then
    pass "is_locked detects active lock"
else
    fail "is_locked should detect active lock"
fi
release_lock "$lock_file5" 2>/dev/null

# Test: is_locked returns false when no lock
lock_file6="/tmp/cfn-test-lock6-$$"
if is_locked "$lock_file6"; then
    fail "is_locked should return false when no lock exists"
else
    pass "is_locked returns false when no lock exists"
fi

# ===== SUMMARY =====
echo ""
echo "==================================="
echo "Tests run: $TESTS_RUN"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo "==================================="

if [ $TESTS_FAILED -eq 0 ]; then
    echo "All tests passed!"
    exit 0
else
    echo "Some tests failed!"
    exit 1
fi
