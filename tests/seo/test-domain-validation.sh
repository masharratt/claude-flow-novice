#!/bin/bash
# tests/seo/test-domain-validation.sh
# Domain validation with SSRF protection tests
#
# Phase: Security & Validation
# Purpose: Validate domain validation script covers all OWASP SSRF prevention rules
# References: OWASP Server Side Request Forgery Prevention Cheat Sheet, SEC-1.6

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
VALIDATE_DOMAIN_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-seo/validate-domain.sh"

# Test counters
TEST_TOTAL=0
TEST_PASSED=0
TEST_FAILED=0

cleanup() {
  # No cleanup needed for this test suite
  :
}
trap cleanup EXIT

# Logging functions
log_pass() {
  ((TEST_PASSED++)) || true
  echo "PASS: $1"
}

log_fail() {
  ((TEST_FAILED++)) || true
  echo "FAIL: $1"
}

run_test() {
  local domain="$1"
  local should_pass="$2"
  local description="$3"

  ((TEST_TOTAL++)) || true

  # Capture output and exit code separately (|| true prevents script exit on failure)
  set +e
  output=$("$VALIDATE_DOMAIN_SCRIPT" "$domain" 2>&1)
  exit_code=$?
  set -e

  if [ "$should_pass" = "true" ]; then
    # Valid domain should exit 0
    if [ $exit_code -eq 0 ]; then
      log_pass "$description"
    else
      log_fail "$description (expected exit 0, got $exit_code)"
    fi
  else
    # Invalid domain should exit 1 and contain ERROR
    if [ $exit_code -ne 0 ] && echo "$output" | grep -q "ERROR"; then
      log_pass "$description"
    else
      log_fail "$description (expected ERROR, got exit $exit_code)"
    fi
  fi
}

# ============================================================================
# TESTS
# ============================================================================

echo ""
echo "Domain Validation Test Suite"
echo "Script: $VALIDATE_DOMAIN_SCRIPT"
echo ""

# Verify script exists
if [[ ! -x "$VALIDATE_DOMAIN_SCRIPT" ]]; then
  echo "ERROR: Script not found or not executable: $VALIDATE_DOMAIN_SCRIPT"
  exit 1
fi

# Valid domains (should pass)
echo "Valid domains:"
run_test "example.com" "true" "example.com"
run_test "sub.example.com" "true" "sub.example.com"
run_test "example.co.uk" "true" "example.co.uk"
run_test "a.io" "true" "a.io (minimal)"
run_test "test-domain.com" "true" "test-domain.com (with hyphen)"

# Invalid formats (should fail)
echo ""
echo "Invalid formats:"
run_test "invalid" "false" "invalid (no TLD)"
run_test "-invalid.com" "false" "-invalid.com (leading hyphen)"
run_test ".com" "false" ".com (missing name)"

# Injection attempts (should fail)
echo ""
echo "Injection prevention:"
run_test "<script>evil.com" "false" "<script>evil.com (HTML)"
run_test "example.com; rm -rf" "false" "example.com; rm -rf (command)"
run_test "example.com\$(whoami)" "false" "example.com\$(whoami) (substitution)"
run_test "example.com|cat" "false" "example.com|cat (pipe)"
run_test "example.com'or'1" "false" "example.com'or'1 (SQL)"

# SSRF protection (should fail)
echo ""
echo "SSRF protection:"
run_test "127.0.0.1" "false" "127.0.0.1 (localhost)"
run_test "localhost" "false" "localhost (string)"
run_test "10.0.0.1" "false" "10.0.0.1 (private)"
run_test "192.168.1.1" "false" "192.168.1.1 (private)"
run_test "169.254.1.1" "false" "169.254.1.1 (link-local)"
run_test "172.16.0.1" "false" "172.16.0.1 (private)"
run_test "8.8.8.8" "false" "8.8.8.8 (public DNS)"
run_test "1.1.1.1" "false" "1.1.1.1 (Cloudflare DNS)"
run_test "::1" "false" "::1 (IPv6 localhost)"

# Case handling (should pass)
echo ""
echo "Case handling:"
run_test "EXAMPLE.COM" "true" "EXAMPLE.COM (uppercase)"
run_test "Example.Com" "true" "Example.Com (mixed case)"

# ============================================================================
# Summary
# ============================================================================

echo ""
echo "Summary:"
echo "Total tests: $TEST_TOTAL"
echo "Passed: $TEST_PASSED"
echo "Failed: $TEST_FAILED"
echo ""

if [[ $TEST_FAILED -eq 0 ]]; then
  echo "All tests PASSED!"
  exit 0
else
  echo "Some tests FAILED!"
  exit 1
fi
