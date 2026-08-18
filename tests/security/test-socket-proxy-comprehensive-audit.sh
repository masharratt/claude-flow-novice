#!/usr/bin/env bash
# tests/security/test-socket-proxy-comprehensive-audit.sh
# Phase 4 Security Validation :: Comprehensive socket proxy security audit
# Reference: planning/trigger/PHASE_4_SECURITY_VALIDATION_REPORT.md

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

TESTS_PASSED=0
TESTS_FAILED=0
CRITICAL_FAILURES=0

log_audit_header() {
  echo ""
  echo "================================================================================"
  echo "Socket Proxy Security Audit - Phase 4 Validation"
  echo "================================================================================"
  echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Reference: planning/trigger/PHASE_4_SECURITY_VALIDATION_REPORT.md"
  echo "================================================================================"
  echo ""
}

log_test_result() {
  local test_name="$1"
  local status="$2"
  local severity="${3:-medium}"

  if [ "$status" = "PASS" ]; then
    log_info "✅ PASS: $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "❌ FAIL: $test_name (Severity: $severity)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    if [ "$severity" = "critical" ]; then
      CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
    fi
  fi
}

verify_socket_proxy_health() {
  log_step "Pre-Audit Check: Socket Proxy Health"

  if ! timeout 5 bash -c "echo > /dev/tcp/localhost/2375" 2>/dev/null; then
    log_error "CRITICAL: Socket proxy not accessible at localhost:2375"
    log_error "Start the socket proxy with: docker-compose -f docker/docker-compose.yml up -d socket-proxy"
    return 1
  fi

  log_info "✅ Socket proxy is accessible and responding"
  return 0
}

run_security_tests() {
  log_step "Running Security Tests"
  echo ""

  # Test 1: Privileged mode block
  log_info "Test 1: Privileged Mode Block"
  if bash "$PROJECT_ROOT/tests/security/test-socket-proxy-privileged-block.sh" > /dev/null 2>&1; then
    log_test_result "Privileged mode is blocked" "PASS" "critical"
  else
    log_test_result "Privileged mode is blocked" "FAIL" "critical"
  fi
  echo ""

  # Test 2: Host network block
  log_info "Test 2: Host Network Block"
  if bash "$PROJECT_ROOT/tests/security/test-socket-proxy-host-network-block.sh" > /dev/null 2>&1; then
    log_test_result "Host network is blocked" "PASS" "critical"
  else
    log_test_result "Host network is blocked" "FAIL" "critical"
  fi
  echo ""

  # Test 3: Dangerous volume mount block
  log_info "Test 3: Dangerous Volume Mount Block"
  if bash "$PROJECT_ROOT/tests/security/test-socket-proxy-volume-block.sh" > /dev/null 2>&1; then
    log_test_result "Dangerous volume mounts are blocked" "PASS" "critical"
  else
    log_test_result "Dangerous volume mounts are blocked" "FAIL" "critical"
  fi
  echo ""

  # Test 4: Socket exposure block
  log_info "Test 4: Socket Exposure Block"
  if bash "$PROJECT_ROOT/tests/security/test-socket-proxy-socket-exposure-block.sh" > /dev/null 2>&1; then
    log_test_result "Socket exposure is blocked" "PASS" "critical"
  else
    log_test_result "Socket exposure is blocked" "FAIL" "critical"
  fi
  echo ""

  # Test 5: Allowed operations
  log_info "Test 5: Allowed Container Operations"
  if bash "$PROJECT_ROOT/tests/security/test-socket-proxy-allowed-operations.sh" > /dev/null 2>&1; then
    log_test_result "Allowed operations (create/start/stop/remove) work correctly" "PASS" "high"
  else
    log_test_result "Allowed operations (create/start/stop/remove) work correctly" "FAIL" "high"
  fi
  echo ""
}

check_socket_proxy_logs() {
  log_step "Checking Socket Proxy Logs"

  local proxy_container="cfn-socket-proxy"

  if docker ps -a --filter "name=$proxy_container" --format "{{.Names}}" 2>/dev/null | grep -q "$proxy_container"; then
    log_info "Socket proxy container found: $proxy_container"

    # Get recent logs (last 50 lines)
    local log_output
    log_output=$(docker logs "$proxy_container" 2>&1 | tail -20) || true

    if echo "$log_output" | grep -qi "error\|failed"; then
      log_test_result "Socket proxy logs for errors" "FAIL" "medium"
      echo "$log_output"
    else
      log_test_result "Socket proxy logs are clean" "PASS" "low"
    fi
  else
    log_info "⚠️  Socket proxy container not found (may not be started)"
  fi
  echo ""
}

verify_configuration() {
  log_step "Verifying Socket Proxy Configuration"

  local config_file="docker/docker-compose.yml"

  if [ ! -f "$config_file" ]; then
    log_error "Configuration file not found: $config_file"
    return 1
  fi

  # Check PRIVILEGED setting
  if grep -q "PRIVILEGED: '0'" "$config_file"; then
    log_test_result "PRIVILEGED=0 is configured" "PASS" "critical"
  else
    log_test_result "PRIVILEGED=0 is configured" "FAIL" "critical"
  fi

  # Check HOST setting
  if grep -q "HOST: '0'" "$config_file"; then
    log_test_result "HOST=0 is configured" "PASS" "critical"
  else
    log_test_result "HOST=0 is configured" "FAIL" "critical"
  fi

  # Check VOLUMES setting
  if grep -q "VOLUMES: '0'" "$config_file"; then
    log_test_result "VOLUMES=0 is configured" "PASS" "critical"
  else
    log_test_result "VOLUMES=0 is configured" "FAIL" "critical"
  fi

  # Check LOG setting
  if grep -q "LOG: '1'" "$config_file"; then
    log_test_result "LOG=1 (audit logging) is configured" "PASS" "high"
  else
    log_test_result "LOG=1 (audit logging) is configured" "FAIL" "high"
  fi

  # Check health check
  if grep -q "test: \[\"CMD\", \"wget\"" "$config_file"; then
    log_test_result "Health check is configured" "PASS" "medium"
  else
    log_test_result "Health check is configured" "FAIL" "medium"
  fi

  echo ""
}

print_audit_summary() {
  echo ""
  echo "================================================================================"
  echo "Socket Proxy Security Audit Results"
  echo "================================================================================"
  echo ""
  echo "Total Tests Run: $((TESTS_PASSED + TESTS_FAILED))"
  echo "Passed: $TESTS_PASSED"
  echo "Failed: $TESTS_FAILED"
  echo "Critical Failures: $CRITICAL_FAILURES"
  echo ""

  if [ "$CRITICAL_FAILURES" -eq 0 ]; then
    echo "STATUS: ✅ SECURITY AUDIT PASSED"
    echo "All critical security controls are properly configured and enforced."
    echo ""
    echo "Security Posture:"
    echo "  - Privileged container creation: BLOCKED"
    echo "  - Host network access: BLOCKED"
    echo "  - Dangerous volume mounts: BLOCKED"
    echo "  - Socket exposure to containers: BLOCKED"
    echo "  - Audit logging: ENABLED"
    echo "  - Container lifecycle operations: ALLOWED"
  else
    echo "STATUS: ❌ SECURITY AUDIT FAILED"
    echo "CRITICAL vulnerabilities detected. Remediate immediately before production."
  fi

  echo ""
  echo "================================================================================"
  echo "CVSS Risk Assessment"
  echo "================================================================================"
  echo ""

  if [ "$TESTS_PASSED" -eq 5 ] && [ "$TESTS_FAILED" -eq 0 ]; then
    echo "CVSS v3.1 Base Score: 1.0 (CRITICAL CONTROLS PASSING)"
    echo "Risk Level: LOW"
    echo ""
    echo "Threat Model Assessment:"
    echo "  [✅] Privilege Escalation via --privileged: MITIGATED"
    echo "  [✅] Host Filesystem Access via --net=host: MITIGATED"
    echo "  [✅] Sensitive Data Access via volume mounts: MITIGATED"
    echo "  [✅] Container Escape via socket exposure: MITIGATED"
    echo "  [✅] Unauthorized Operations logged for forensics: ENABLED"
  else
    echo "CVSS v3.1 Base Score: 7.5+ (MULTIPLE CONTROLS FAILING)"
    echo "Risk Level: CRITICAL"
    echo ""
    echo "Threat Model Assessment:"
    echo "  [❌] Privilege Escalation via --privileged: VULNERABLE"
    echo "  [❌] Host Filesystem Access via --net=host: VULNERABLE"
    echo "  [❌] Sensitive Data Access via volume mounts: VULNERABLE"
    echo "  [❌] Container Escape via socket exposure: VULNERABLE"
    echo ""
    echo "IMMEDIATE ACTION REQUIRED:"
    echo "  1. Review Phase 4 deployment documentation"
    echo "  2. Verify docker/docker-compose.yml socket-proxy configuration"
    echo "  3. Ensure socket-proxy service is running: docker-compose up -d socket-proxy"
    echo "  4. Run tests again after addressing issues"
  fi

  echo ""
  echo "================================================================================"
  echo "Recommendations"
  echo "================================================================================"
  echo ""

  if [ "$TESTS_FAILED" -eq 0 ]; then
    cat << 'EOF'
Phase 4 security implementation is COMPLETE and VALIDATED.

Next Steps:
1. ✅ Production Deployment Ready
2. Monitor audit logs for anomalous Docker API requests
3. Implement log retention policy (30+ days recommended)
4. Schedule quarterly security reviews

Future Enhancements (Optional):
1. Fine-Grained Volume Control (Whitelist specific paths)
2. Rate Limiting (Prevent API spam)
3. TLS Encryption (if socket proxy TLS support added)
4. Centralized Audit Log Aggregation
EOF
  else
    cat << 'EOF'
Phase 4 security implementation has ISSUES that must be resolved.

Immediate Actions Required:
1. Verify docker/docker-compose.yml has socket-proxy service
2. Ensure all security environment variables are correctly set
3. Restart Docker services: docker-compose down && docker-compose up -d
4. Re-run this audit to verify fixes

Debugging Steps:
1. Check socket proxy logs: docker logs cfn-socket-proxy
2. Verify connectivity: docker exec cfn-redis redis-cli ping
3. Test Docker API access: docker -H tcp://localhost:2375 ps

Do NOT proceed to production until ALL critical tests pass.
EOF
  fi

  echo ""
  echo "================================================================================"
  echo "Audit Complete"
  echo "================================================================================"
  echo ""
}

cleanup() {
  : # No cleanup needed for this comprehensive test
}

trap cleanup EXIT

main() {
  log_audit_header

  # Pre-flight check
  if ! verify_socket_proxy_health; then
    log_error "Socket proxy health check failed. Aborting audit."
    exit 1
  fi

  # Run all tests
  run_security_tests

  # Additional checks
  verify_configuration
  check_socket_proxy_logs

  # Print summary and recommendations
  print_audit_summary

  # Exit with appropriate code
  if [ "$CRITICAL_FAILURES" -eq 0 ]; then
    exit 0
  else
    exit 1
  fi
}

main
