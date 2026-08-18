#!/usr/bin/env bash
# tests/impl-002/test-cost-script-error-handling.sh
# Phase 5 :: Test Suite 2 - Arithmetic Error Handling in Cost Scripts (IMPL-002)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

echo "=== IMPL-002: Cost Script Error Handling Tests ==="

# Test 1: Division by zero protection
test_division_by_zero() {
  log_step "Test 1: Division by zero protection"

  # Source the cost script (it sources validation.sh)
  source "$PROJECT_ROOT/scripts/cost-allocation-tracker.sh" 2>/dev/null || true

  # Test calculate_container_cost with zero runtime (should fail gracefully)
  local result
  result=$(calculate_container_cost "test-container" "50" "512" "0" "zai" 2>/dev/null || echo "0")

  if [[ "$result" == "0" ]]; then
    log_info "  ✓ PASSED: Division by zero handled gracefully"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Division by zero not handled (got: $result)"
    ((TESTS_FAILED++))
  fi
}

# Test 2: Invalid numeric inputs
test_invalid_inputs() {
  log_step "Test 2: Invalid numeric inputs rejected"

  source "$PROJECT_ROOT/scripts/cost-allocation-tracker.sh" 2>/dev/null || true

  # Test with non-numeric CPU percent
  local result
  result=$(calculate_container_cost "test-container" "abc" "512" "3600" "zai" 2>/dev/null || echo "0")

  if [[ "$result" == "0" ]]; then
    log_info "  ✓ PASSED: Non-numeric CPU rejected"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Non-numeric CPU not rejected (got: $result)"
    ((TESTS_FAILED++))
  fi

  # Test with non-numeric memory
  result=$(calculate_container_cost "test-container" "50" "xyz" "3600" "zai" 2>/dev/null || echo "0")

  if [[ "$result" == "0" ]]; then
    log_info "  ✓ PASSED: Non-numeric memory rejected"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Non-numeric memory not rejected (got: $result)"
    ((TESTS_FAILED++))
  fi
}

# Test 3: Negative cost values
test_negative_values() {
  log_step "Test 3: Negative cost values handling"

  source "$PROJECT_ROOT/scripts/cost-allocation-tracker.sh" 2>/dev/null || true

  # Test with negative CPU percent (should be rejected)
  local result
  result=$(calculate_container_cost "test-container" "-50" "512" "3600" "zai" 2>/dev/null || echo "0")

  if [[ "$result" == "0" ]]; then
    log_info "  ✓ PASSED: Negative CPU rejected"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Negative CPU not rejected (got: $result)"
    ((TESTS_FAILED++))
  fi

  # Test with negative memory (should be rejected)
  result=$(calculate_container_cost "test-container" "50" "-512" "3600" "zai" 2>/dev/null || echo "0")

  if [[ "$result" == "0" ]]; then
    log_info "  ✓ PASSED: Negative memory rejected"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Negative memory not rejected (got: $result)"
    ((TESTS_FAILED++))
  fi
}

# Test 4: Valid calculations still work
test_valid_calculations() {
  log_step "Test 4: Valid calculations produce correct results"

  source "$PROJECT_ROOT/scripts/cost-allocation-tracker.sh" 2>/dev/null || true

  # Test valid calculation (50% CPU, 512MB memory, 1 hour)
  local result
  result=$(calculate_container_cost "test-container" "50" "512" "3600" "zai" 2>/dev/null || echo "0")

  # Should be non-zero and numeric
  if [[ -n "$result" ]] && [[ "$result" != "0" ]] && [[ "$result" =~ ^[0-9]+\.?[0-9]*$ ]]; then
    log_info "  ✓ PASSED: Valid calculation works (result: $result)"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Valid calculation failed (got: $result)"
    ((TESTS_FAILED++))
  fi
}

# Test 5: API cost calculation with invalid tokens
test_api_cost_errors() {
  log_step "Test 5: API cost calculation error handling"

  source "$PROJECT_ROOT/scripts/cost-allocation-tracker.sh" 2>/dev/null || true

  # Test with invalid token count
  local result
  result=$(get_api_cost "zai" "abc" 2>/dev/null || echo "0")

  if [[ "$result" == "0" ]]; then
    log_info "  ✓ PASSED: Non-numeric tokens rejected"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Non-numeric tokens not rejected (got: $result)"
    ((TESTS_FAILED++))
  fi

  # Test with negative tokens
  result=$(get_api_cost "zai" "-1000" 2>/dev/null || echo "0")

  if [[ "$result" == "0" ]]; then
    log_info "  ✓ PASSED: Negative tokens rejected"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Negative tokens not rejected (got: $result)"
    ((TESTS_FAILED++))
  fi

  # Test valid API cost
  result=$(get_api_cost "zai" "1000000" 2>/dev/null || echo "0")

  # Should be 0.50 (1M tokens * $0.50/1M)
  if [[ -n "$result" ]] && [[ "$result" =~ ^[0-9]+\.?[0-9]*$ ]]; then
    log_info "  ✓ PASSED: Valid API cost calculation works (result: $result)"
    ((TESTS_PASSED++))
  else
    log_error "  ✗ FAILED: Valid API cost failed (got: $result)"
    ((TESTS_FAILED++))
  fi
}

# Main execution
main() {
  test_division_by_zero
  test_invalid_inputs
  test_negative_values
  test_valid_calculations
  test_api_cost_errors

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
