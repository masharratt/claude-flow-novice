#!/usr/bin/env bash
# tests/security/run-socket-proxy-tests.sh
# Phase 4 Security Validation :: Master test runner for all socket proxy security tests
# Reference: planning/trigger/PHASE_4_SECURITY_VALIDATION_REPORT.md

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Configuration
DOCKER_COMPOSE_FILE="${PROJECT_ROOT}/docker/docker-compose.yml"
MAX_RETRIES=3
RETRY_DELAY=5

# Test tracking
TOTAL_TESTS=6
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

print_usage() {
  cat << 'EOF'
Usage: run-socket-proxy-tests.sh [OPTIONS]

Options:
  --help            Show this help message
  --skip-setup      Skip docker-compose setup (assume services are running)
  --verbose         Print detailed test output
  --only-audit      Run only the comprehensive audit test

Examples:
  # Run full test suite with setup
  ./tests/security/run-socket-proxy-tests.sh

  # Run tests assuming services are already running
  ./tests/security/run-socket-proxy-tests.sh --skip-setup

  # Run comprehensive audit only
  ./tests/security/run-socket-proxy-tests.sh --only-audit
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help) print_usage; exit 0 ;;
      --skip-setup) SKIP_SETUP=true ;;
      --verbose) VERBOSE=true ;;
      --only-audit) ONLY_AUDIT=true ;;
      *) log_error "Unknown option: $1"; print_usage; exit 1 ;;
    esac
    shift
  done
}

print_header() {
  echo ""
  echo "=================================================================================="
  echo "Socket Proxy Security Test Suite - Phase 4 Validation"
  echo "=================================================================================="
  echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Test Suite Version: 1.0"
  echo "Reference: planning/trigger/PHASE_4_SECURITY_VALIDATION_REPORT.md"
  echo "=================================================================================="
  echo ""
}

setup_services() {
  log_step "Setting up Docker services"

  if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
    log_error "Docker compose file not found: $DOCKER_COMPOSE_FILE"
    return 1
  fi

  log_info "Starting services with docker-compose..."
  cd "$PROJECT_ROOT" || exit 1

  # Start services
  if docker-compose -f "$DOCKER_COMPOSE_FILE" up -d socket-proxy cfn-redis 2>&1; then
    log_info "Services started successfully"
  else
    log_error "Failed to start services"
    return 1
  fi

  # Wait for services to be healthy
  log_info "Waiting for services to be healthy..."
  local retry_count=0
  while [ $retry_count -lt $MAX_RETRIES ]; do
    # Check socket proxy health
    if timeout 5 bash -c "echo > /dev/tcp/localhost/2375" 2>/dev/null; then
      log_info "✅ Socket proxy is healthy"
      return 0
    fi

    retry_count=$((retry_count + 1))
    if [ $retry_count -lt $MAX_RETRIES ]; then
      log_info "Waiting for socket proxy to be healthy (attempt $retry_count/$MAX_RETRIES)..."
      sleep $RETRY_DELAY
    fi
  done

  log_error "Socket proxy failed to become healthy after $MAX_RETRIES attempts"
  return 1
}

run_test() {
  local test_name="$1"
  local test_script="$2"

  log_step "Running: $test_name"

  if [ ! -f "$test_script" ]; then
    log_error "Test script not found: $test_script"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi

  if bash "$test_script" 2>&1; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi
}

run_all_tests() {
  log_step "Running Security Tests"
  echo ""

  # Test 1: Privileged mode block
  log_info "Test 1/5: Privileged Mode Block"
  if run_test "Privileged Mode Block" "$PROJECT_ROOT/tests/security/test-socket-proxy-privileged-block.sh"; then
    log_info "✅ PASSED"
  else
    log_error "❌ FAILED"
  fi
  echo ""

  # Test 2: Host network block
  log_info "Test 2/5: Host Network Block"
  if run_test "Host Network Block" "$PROJECT_ROOT/tests/security/test-socket-proxy-host-network-block.sh"; then
    log_info "✅ PASSED"
  else
    log_error "❌ FAILED"
  fi
  echo ""

  # Test 3: Dangerous volume mount block
  log_info "Test 3/5: Dangerous Volume Mount Block"
  if run_test "Dangerous Volume Mount Block" "$PROJECT_ROOT/tests/security/test-socket-proxy-volume-block.sh"; then
    log_info "✅ PASSED"
  else
    log_error "❌ FAILED"
  fi
  echo ""

  # Test 4: Socket exposure block
  log_info "Test 4/5: Socket Exposure Block"
  if run_test "Socket Exposure Block" "$PROJECT_ROOT/tests/security/test-socket-proxy-socket-exposure-block.sh"; then
    log_info "✅ PASSED"
  else
    log_error "❌ FAILED"
  fi
  echo ""

  # Test 5: Allowed operations
  log_info "Test 5/5: Allowed Container Operations"
  if run_test "Allowed Operations" "$PROJECT_ROOT/tests/security/test-socket-proxy-allowed-operations.sh"; then
    log_info "✅ PASSED"
  else
    log_error "❌ FAILED"
  fi
  echo ""
}

run_comprehensive_audit() {
  log_step "Running Comprehensive Security Audit"
  echo ""

  if bash "$PROJECT_ROOT/tests/security/test-socket-proxy-comprehensive-audit.sh"; then
    log_info "✅ AUDIT PASSED"
    return 0
  else
    log_error "❌ AUDIT FAILED"
    return 1
  fi
}

print_summary() {
  echo ""
  echo "=================================================================================="
  echo "Test Results Summary"
  echo "=================================================================================="
  echo ""
  echo "Total Tests: $TOTAL_TESTS"
  echo "Passed: $PASSED_TESTS"
  echo "Failed: $FAILED_TESTS"
  echo "Skipped: $SKIPPED_TESTS"
  echo ""

  if [ "$FAILED_TESTS" -eq 0 ]; then
    echo "Overall Status: ✅ ALL TESTS PASSED"
    echo ""
    echo "Security Assessment:"
    echo "  - Socket proxy is properly configured"
    echo "  - All dangerous operations are blocked"
    echo "  - Allowed operations work correctly"
    echo "  - Audit logging is enabled"
    echo ""
    echo "Phase 4 Validation: COMPLETE"
  else
    echo "Overall Status: ❌ TESTS FAILED"
    echo ""
    echo "Failed Tests: $FAILED_TESTS"
    echo ""
    echo "Next Steps:"
    echo "  1. Review the failed test output above"
    echo "  2. Check docker-compose.yml socket-proxy configuration"
    echo "  3. Verify socket proxy container is running: docker ps | grep socket-proxy"
    echo "  4. Check socket proxy logs: docker logs cfn-socket-proxy"
    echo "  5. Re-run tests: $0"
  fi

  echo ""
  echo "=================================================================================="
  echo "Test Execution Complete"
  echo "=================================================================================="
  echo ""
}

cleanup() {
  : # Services left running for potential manual inspection
}

trap cleanup EXIT

main() {
  # Parse arguments
  SKIP_SETUP=${SKIP_SETUP:-false}
  VERBOSE=${VERBOSE:-false}
  ONLY_AUDIT=${ONLY_AUDIT:-false}

  parse_args "$@"

  # Print header
  print_header

  # Setup services if needed
  if [ "$SKIP_SETUP" != "true" ]; then
    if ! setup_services; then
      log_error "Failed to setup services. Aborting."
      exit 1
    fi
  fi

  # Run tests
  if [ "$ONLY_AUDIT" = "true" ]; then
    log_step "Running Comprehensive Audit Only"
    if run_comprehensive_audit; then
      exit 0
    else
      exit 1
    fi
  else
    # Run individual tests
    run_all_tests

    # Run comprehensive audit
    echo ""
    log_step "Running Comprehensive Security Audit"
    echo ""
    if run_comprehensive_audit; then
      AUDIT_PASSED=true
    else
      AUDIT_PASSED=false
    fi

    # Print summary
    print_summary

    # Exit with appropriate code
    if [ "$FAILED_TESTS" -eq 0 ] && [ "$AUDIT_PASSED" = "true" ]; then
      exit 0
    else
      exit 1
    fi
  fi
}

main "$@"
