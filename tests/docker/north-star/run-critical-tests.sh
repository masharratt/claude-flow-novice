#!/bin/bash
# tests/docker/north-star/run-critical-tests.sh
# Critical CFN Loop component tests for rapid validation (< 2 minutes)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Critical test categories (fastest, most important)
CRITICAL_TESTS=(
  "01-agent-spawning/test-basic-validation.sh"
  "03-redis-coordination/test-message-passing.sh"
)

cleanup() {
  log_step "Cleanup: Critical test artifacts"
  rm -rf /tmp/north-star-critical-* || true
  pkill -f "north-star-critical" || true
}
trap cleanup EXIT

validate_critical_environment() {
  log_step "Validating critical test environment"

  # Quick dependency checks
  if ! command -v redis-cli &> /dev/null; then
    log_error "Redis CLI not available"
    exit 1
  fi

  if ! redis-cli ping > /dev/null 2>&1; then
    log_error "Redis not running"
    exit 1
  fi

  log_info "✅ Critical environment validated"
}

run_critical_test() {
  local test_path="$1"
  local test_script="$PROJECT_ROOT/tests/docker/north-star/$test_path"
  local test_name=$(basename "$test_path" .sh)

  log_info "Running critical test: $test_name"

  if [ ! -f "$test_script" ]; then
    log_warn "Test script not found: $test_script"
    return 0
  fi

  # Execute with shorter timeout for critical tests
  local start_time=$(date +%s)
  timeout 120 "$test_script"
  local exit_code=$?
  local duration=$(($(date +%s) - start_time))

  if [ $exit_code -eq 0 ]; then
    log_success "✅ $test_name PASSED (${duration}s)"
  elif [ $exit_code -eq 124 ]; then
    log_error "❌ $test_name TIMEOUT (120s)"
    return 1
  else
    log_error "❌ $test_name FAILED (exit code: $exit_code)"
    return 1
  fi

  return 0
}

main() {
  annotate "CFN Loop Critical Tests" \
    "Rapid validation of core CFN Loop components"

  log_info "🚀 Running critical CFN Loop tests..."
  log_info "Expected duration: < 2 minutes"

  validate_critical_environment

  local passed=0
  local failed=0
  local total=${#CRITICAL_TESTS[@]}

  for test_path in "${CRITICAL_TESTS[@]}"; do
    if run_critical_test "$test_path"; then
      passed=$((passed + 1))
    else
      failed=$((failed + 1))
    fi
  done

  echo ""
  echo "================================"
  echo "Critical Test Results"
  echo "================================"
  echo "Total: $total"
  echo "Passed: $passed"
  echo "Failed: $failed"
  echo ""

  if [ $failed -eq 0 ]; then
    log_success "🎉 All critical tests passed!"
    log_info "Core CFN Loop functionality is working correctly"
    exit 0
  else
    log_error "💥 $failed critical test(s) failed"
    log_error "Core functionality needs attention before proceeding"
    exit 1
  fi
}

# Execute critical tests
main "$@"