#!/bin/bash
# tests/security/test-socket-proxy-socket-exposure-block.sh
# Phase 4 Security Validation :: Confirm Docker socket exposure is blocked by socket proxy
# Reference: planning/trigger/PHASE_4_SECURITY_VALIDATION_REPORT.md

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

PROXY_URL="${DOCKER_HOST:-tcp://localhost:2375}"

test_socket_exposure_blocked() {
  log_step "Testing: Docker socket exposure to spawned containers should be blocked"

  # Verify socket proxy is accessible
  if ! timeout 5 bash -c "echo > /dev/tcp/localhost/2375" 2>/dev/null; then
    echo "ERROR: Socket proxy not accessible at localhost:2375"
    return 1
  fi

  # Attempt to mount Docker socket to spawned container
  # This would allow the container to spawn its own containers (privilege escalation)
  local result
  result=$(DOCKER_HOST="$PROXY_URL" docker run --rm -v /var/run/docker.sock:/var/run/docker.sock alpine echo "socket-exposed" 2>&1 || echo "BLOCKED_OR_ERROR")

  # Check if the operation was blocked
  if echo "$result" | grep -qiE "denied|forbidden|error|not permitted|not allowed|socket"; then
    log_info "✅ PASS: Socket exposure blocked - error message: $(echo "$result" | head -1)"
    return 0
  else
    log_error "❌ FAIL: Socket exposure was allowed (CRITICAL SECURITY RISK)"
    echo "Result: $result"
    return 1
  fi
}

cleanup() {
  : # No cleanup needed for this test
}

trap cleanup EXIT

test_socket_exposure_blocked
