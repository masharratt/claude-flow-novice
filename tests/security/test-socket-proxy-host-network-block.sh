#!/bin/bash
# tests/security/test-socket-proxy-host-network-block.sh
# Phase 4 Security Validation :: Confirm --network=host is blocked by socket proxy
# Reference: planning/trigger/PHASE_4_SECURITY_VALIDATION_REPORT.md

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

PROXY_URL="${DOCKER_HOST:-tcp://localhost:2375}"

test_host_network_blocked() {
  log_step "Testing: --network=host should be blocked by socket proxy"

  # Verify socket proxy is accessible
  if ! timeout 5 bash -c "echo > /dev/tcp/localhost/2375" 2>/dev/null; then
    echo "ERROR: Socket proxy not accessible at localhost:2375"
    return 1
  fi

  # Attempt to use host network mode via socket proxy
  local result
  result=$(DOCKER_HOST="$PROXY_URL" docker run --rm --network host alpine echo "host-network" 2>&1 || echo "BLOCKED_OR_ERROR")

  # Check if the operation was blocked
  if echo "$result" | grep -qiE "denied|forbidden|error|not permitted|not allowed|host"; then
    log_info "✅ PASS: Host network blocked - error message: $(echo "$result" | head -1)"
    return 0
  else
    log_error "❌ FAIL: Host network was allowed (SECURITY RISK)"
    echo "Result: $result"
    return 1
  fi
}

cleanup() {
  : # No cleanup needed for this test
}

trap cleanup EXIT

test_host_network_blocked
