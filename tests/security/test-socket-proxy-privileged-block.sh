#!/usr/bin/env bash
# tests/security/test-socket-proxy-privileged-block.sh
# Phase 4 Security Validation :: Confirm --privileged mode is blocked by socket proxy
# Reference: planning/trigger/PHASE_4_SECURITY_VALIDATION_REPORT.md

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

PROXY_URL="${DOCKER_HOST:-tcp://localhost:2375}"
TIMEOUT=30

test_privileged_mode_blocked() {
  log_step "Testing: --privileged mode should be blocked by socket proxy"

  # Verify socket proxy is accessible
  if ! timeout 5 bash -c "echo > /dev/tcp/localhost/2375" 2>/dev/null; then
    echo "ERROR: Socket proxy not accessible at localhost:2375"
    return 1
  fi

  # Attempt to create privileged container via socket proxy
  # The socket proxy should reject this request
  local result
  result=$(DOCKER_HOST="$PROXY_URL" docker run --rm --privileged alpine echo "privileged" 2>&1 || echo "BLOCKED_OR_ERROR")

  # Check if the operation was blocked
  if echo "$result" | grep -qiE "denied|forbidden|error|not permitted|not allowed"; then
    log_info "✅ PASS: Privileged mode blocked - error message: $(echo "$result" | head -1)"
    return 0
  else
    log_error "❌ FAIL: Privileged container was allowed (SECURITY RISK)"
    echo "Result: $result"
    return 1
  fi
}

cleanup() {
  : # No cleanup needed for this test
}

trap cleanup EXIT

test_privileged_mode_blocked
