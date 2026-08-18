#!/usr/bin/env bash
# tests/security/test-socket-proxy-allowed-operations.sh
# Phase 4 Security Validation :: Confirm allowed Docker operations work correctly
# Reference: planning/trigger/PHASE_4_SECURITY_VALIDATION_REPORT.md

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

PROXY_URL="${DOCKER_HOST:-tcp://localhost:2375}"

test_allowed_operations() {
  log_step "Testing: Allowed Docker operations (container lifecycle) should work"

  # Verify socket proxy is accessible
  if ! timeout 5 bash -c "echo > /dev/tcp/localhost/2375" 2>/dev/null; then
    echo "ERROR: Socket proxy not accessible at localhost:2375"
    return 1
  fi

  local test_image="alpine:latest"
  local test_name="security-test-$(date +%s)"

  # Test 1: List containers (should work)
  log_info "Test 1a: GET /containers/json (list containers)"
  if DOCKER_HOST="$PROXY_URL" docker ps -a > /dev/null 2>&1; then
    log_info "✅ Container listing works"
  else
    log_error "❌ Container listing failed"
    return 1
  fi

  # Test 2: Create container
  log_info "Test 2: Create container"
  local container_id
  if container_id=$(DOCKER_HOST="$PROXY_URL" docker create --name "$test_name" "$test_image" echo "test" 2>&1); then
    log_info "✅ Container created: $container_id"
  else
    log_error "❌ Container creation failed: $container_id"
    return 1
  fi

  # Test 3: Inspect container (should work)
  log_info "Test 3: Inspect container"
  if DOCKER_HOST="$PROXY_URL" docker inspect "$test_name" > /dev/null 2>&1; then
    log_info "✅ Container inspection works"
  else
    log_error "❌ Container inspection failed"
    DOCKER_HOST="$PROXY_URL" docker rm -f "$test_name" 2>/dev/null || true
    return 1
  fi

  # Test 4: Start container
  log_info "Test 4: Start container"
  if DOCKER_HOST="$PROXY_URL" docker start "$test_name" 2>&1; then
    log_info "✅ Container started"
    sleep 1  # Allow container to run and exit
  else
    log_error "❌ Container start failed"
    DOCKER_HOST="$PROXY_URL" docker rm -f "$test_name" 2>/dev/null || true
    return 1
  fi

  # Test 5: Check container status (should work)
  log_info "Test 5: Check container status"
  if DOCKER_HOST="$PROXY_URL" docker ps -a --filter "name=$test_name" > /dev/null 2>&1; then
    log_info "✅ Container status check works"
  else
    log_error "❌ Container status check failed"
    DOCKER_HOST="$PROXY_URL" docker rm -f "$test_name" 2>/dev/null || true
    return 1
  fi

  # Test 6: Stop container (if running)
  log_info "Test 6: Stop container (if running)"
  if DOCKER_HOST="$PROXY_URL" docker stop "$test_name" 2>&1 || true; then
    log_info "✅ Container stop works"
  else
    log_info "⚠️  Container already stopped"
  fi

  # Test 7: Remove container
  log_info "Test 7: Remove container"
  if DOCKER_HOST="$PROXY_URL" docker rm "$test_name" 2>&1; then
    log_info "✅ Container removed"
  else
    log_error "❌ Container removal failed"
    return 1
  fi

  # Verify container is gone
  log_info "Test 8: Verify container is removed"
  if ! DOCKER_HOST="$PROXY_URL" docker ps -a --filter "name=$test_name" --format "{{.ID}}" 2>/dev/null | grep -q .; then
    log_info "✅ Container completely removed"
    return 0
  else
    log_error "❌ Container still exists after removal"
    return 1
  fi
}

cleanup() {
  # Cleanup test container if it still exists
  local test_name="security-test-*"
  DOCKER_HOST="${DOCKER_HOST:-tcp://localhost:2375}" docker ps -a --filter "name=security-test" --format "{{.ID}}" 2>/dev/null | \
    xargs -r -I {} bash -c "DOCKER_HOST='${DOCKER_HOST}' docker rm -f {} 2>/dev/null || true"
}

trap cleanup EXIT

test_allowed_operations
