#!/usr/bin/env bash
# tests/impl-002/test-validation-framework.sh
# Phase 5 :: Test Suite 3 - Input Validation Framework (IMPL-002)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Source validation library
source "$PROJECT_ROOT/scripts/lib/validation.sh"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test helper
run_test() {
  local test_name=$1
  shift

  log_step "TEST: $test_name"

  if "$@"; then
    log_info "  ✓ PASSED"
    ((TESTS_PASSED++))
    return 0
  else
    log_error "  ✗ FAILED"
    ((TESTS_FAILED++))
    return 1
  fi
}

# Test Suite 1: Numeric Validation
test_numeric_validation() {
  log_step "GIVEN numeric validation function"

  # Valid integers
  run_test "Valid integer" validate_numeric "42"
  run_test "Negative integer" validate_numeric "-10"
  run_test "Zero" validate_numeric "0"

  # Valid floats
  run_test "Valid float" validate_numeric "3.14"
  run_test "Negative float" validate_numeric "-2.71"

  # Range validation
  run_test "Within range" validate_numeric "50" "0" "100"

  # Invalid inputs (should fail)
  if validate_numeric "" 2>/dev/null; then
    log_error "  ✗ FAILED: Empty string should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Empty string rejected"
    ((TESTS_PASSED++))
  fi

  if validate_numeric "abc" 2>/dev/null; then
    log_error "  ✗ FAILED: Non-numeric should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Non-numeric rejected"
    ((TESTS_PASSED++))
  fi

  if validate_numeric "150" "0" "100" 2>/dev/null; then
    log_error "  ✗ FAILED: Out of range should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Out of range rejected"
    ((TESTS_PASSED++))
  fi
}

# Test Suite 2: Path Validation
test_path_validation() {
  log_step "GIVEN path validation function"

  # Valid paths
  run_test "Valid relative path" validate_path "scripts/lib/validation.sh"
  run_test "Valid absolute path" validate_path "/tmp/test"

  # Path traversal attempts (should fail)
  if validate_path "../../../etc/passwd" 2>/dev/null; then
    log_error "  ✗ FAILED: Path traversal should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Path traversal rejected"
    ((TESTS_PASSED++))
  fi

  if validate_path "scripts/../../etc/shadow" 2>/dev/null; then
    log_error "  ✗ FAILED: Hidden path traversal should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Hidden path traversal rejected"
    ((TESTS_PASSED++))
  fi
}

# Test Suite 3: Command Injection Prevention
test_command_validation() {
  log_step "GIVEN command validation function"

  # Valid commands
  run_test "Simple command" validate_command "echo hello"
  run_test "Command with args" validate_command "ls -la"

  # Injection attempts (should fail)
  local dangerous_commands=(
    "rm -rf /; echo hacked"
    "ls | grep secret"
    "cat file && rm file"
    "echo \$(cat /etc/passwd)"
    "ls \`whoami\`"
    "cat > /etc/passwd"
  )

  for cmd in "${dangerous_commands[@]}"; do
    if validate_command "$cmd" 2>/dev/null; then
      log_error "  ✗ FAILED: Dangerous command should fail: $cmd"
      ((TESTS_FAILED++))
    else
      log_info "  ✓ PASSED: Dangerous command rejected"
      ((TESTS_PASSED++))
    fi
  done
}

# Test Suite 4: Safe Division
test_safe_division() {
  log_step "GIVEN safe division function"

  # Valid divisions
  local result
  result=$(safe_divide 100 5 2)
  if [[ "$result" == "20.00" ]]; then
    log_info "  ✓ PASSED: Basic division (100/5 = 20.00)"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Expected 20.00, got $result"
    ((TESTS_FAILED++))
  fi

  result=$(safe_divide 1 3 4)
  # Should be approximately 0.3333
  if [[ "$result" =~ ^0\.333 ]]; then
    log_info "  ✓ PASSED: Float division (1/3 ≈ 0.3333)"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Expected ~0.3333, got $result"
    ((TESTS_FAILED++))
  fi

  # Division by zero (should fail)
  if safe_divide 100 0 2>/dev/null; then
    log_error "  ✗ FAILED: Division by zero should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Division by zero rejected"
    ((TESTS_PASSED++))
  fi

  # Invalid inputs (should fail)
  if safe_divide "abc" 5 2>/dev/null; then
    log_error "  ✗ FAILED: Non-numeric numerator should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Non-numeric numerator rejected"
    ((TESTS_PASSED++))
  fi

  if safe_divide 100 "xyz" 2>/dev/null; then
    log_error "  ✗ FAILED: Non-numeric denominator should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Non-numeric denominator rejected"
    ((TESTS_PASSED++))
  fi
}

# Test Suite 5: Checksum Verification
test_checksum_verification() {
  log_step "GIVEN checksum verification function"

  # Create test file
  local test_file="/tmp/test-checksum-$$"
  echo "test content" > "$test_file"

  # Calculate expected checksum
  local expected_checksum
  expected_checksum=$(sha256sum "$test_file" | awk '{print $1}')

  # Valid checksum
  if verify_checksum "$test_file" "$expected_checksum" 2>&1 | grep -q "Checksum verified"; then
    log_info "  ✓ PASSED: Valid checksum accepted"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Valid checksum rejected"
    ((TESTS_FAILED++))
  fi

  # Invalid checksum (should fail)
  if verify_checksum "$test_file" "invalid_checksum_123" 2>/dev/null; then
    log_error "  ✗ FAILED: Invalid checksum should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Invalid checksum rejected"
    ((TESTS_FAILED++))
  fi

  # Cleanup
  rm -f "$test_file"
}

# Test Suite 6: Filename Sanitization
test_filename_sanitization() {
  log_step "GIVEN filename sanitization function"

  # Valid filenames (should pass through)
  local result
  result=$(sanitize_filename "valid-file_name.txt")
  if [[ "$result" == "valid-file_name.txt" ]]; then
    log_info "  ✓ PASSED: Valid filename preserved"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Valid filename modified: $result"
    ((TESTS_FAILED++))
  fi

  # Dangerous filenames (should be sanitized)
  result=$(sanitize_filename "../../etc/passwd")
  if [[ "$result" != *".."* ]] && [[ "$result" != *"/"* ]]; then
    log_info "  ✓ PASSED: Path separators removed: $result"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Path separators not removed: $result"
    ((TESTS_FAILED++))
  fi

  result=$(sanitize_filename "file; rm -rf /")
  if [[ "$result" != *";"* ]] && [[ "$result" != *" "* ]]; then
    log_info "  ✓ PASSED: Special characters removed: $result"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Special characters not removed: $result"
    ((TESTS_FAILED++))
  fi
}

# Test Suite 7: URL Validation
test_url_validation() {
  log_step "GIVEN URL validation function"

  # Valid URLs
  run_test "HTTP URL" validate_url "http://example.com"
  run_test "HTTPS URL" validate_url "https://example.com/path"
  run_test "URL with subdomain" validate_url "https://api.example.com"

  # Invalid URLs (should fail)
  if validate_url "ftp://example.com" 2>/dev/null; then
    log_error "  ✗ FAILED: FTP URL should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: FTP URL rejected"
    ((TESTS_PASSED++))
  fi

  if validate_url "javascript:alert(1)" 2>/dev/null; then
    log_error "  ✗ FAILED: JavaScript URL should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: JavaScript URL rejected"
    ((TESTS_PASSED++))
  fi
}

# Test Suite 8: Port Validation
test_port_validation() {
  log_step "GIVEN port validation function"

  # Valid ports
  run_test "HTTP port" validate_port "80"
  run_test "HTTPS port" validate_port "443"
  run_test "Redis port" validate_port "6379"
  run_test "Max port" validate_port "65535"

  # Invalid ports (should fail)
  if validate_port "0" 2>/dev/null; then
    log_error "  ✗ FAILED: Port 0 should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Port 0 rejected"
    ((TESTS_PASSED++))
  fi

  if validate_port "65536" 2>/dev/null; then
    log_error "  ✗ FAILED: Port >65535 should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Port >65535 rejected"
    ((TESTS_PASSED++))
  fi

  if validate_port "abc" 2>/dev/null; then
    log_error "  ✗ FAILED: Non-numeric port should fail"
    ((TESTS_FAILED++))
  else
    log_info "  ✓ PASSED: Non-numeric port rejected"
    ((TESTS_PASSED++))
  fi
}

# Main test execution
main() {
  log_step "Starting IMPL-002 Validation Framework Tests"

  test_numeric_validation
  test_path_validation
  test_command_validation
  test_safe_division
  test_checksum_verification
  test_filename_sanitization
  test_url_validation
  test_port_validation

  # Summary
  echo ""
  echo "=== Test Summary ==="
  echo "Passed: $TESTS_PASSED"
  echo "Failed: $TESTS_FAILED"
  echo "Total:  $((TESTS_PASSED + TESTS_FAILED))"

  local pass_rate
  if [[ $((TESTS_PASSED + TESTS_FAILED)) -gt 0 ]]; then
    pass_rate=$(awk "BEGIN {printf \"%.2f\", $TESTS_PASSED / ($TESTS_PASSED + $TESTS_FAILED)}")
  else
    pass_rate="0.00"
  fi

  echo "Pass Rate: $pass_rate"

  if (( $(echo "$pass_rate >= 0.95" | bc -l) )); then
    log_success "✓ GATE PASSED (≥0.95 required)"
    exit 0
  else
    log_error "✗ GATE FAILED (pass rate $pass_rate < 0.95)"
    exit 1
  fi
}

main "$@"
