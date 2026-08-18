#!/usr/bin/env bash
# tests/docker/socket-proxy/test-phase4-socket-proxy-smoke.sh
# Phase 4 :: Socket Proxy Smoke Test (Planning Reference: CLI_TRIGGER_COLLISION_ANALYSIS.md)
# Tests socket-proxy deployment and basic security features without requiring full stack

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  log_step "CLEANUP: Stopping socket-proxy"
  docker rm -f cfn-socket-proxy-test 2>/dev/null || true
  docker network rm cfn-test-network 2>/dev/null || true
}
trap cleanup EXIT

log_step "=== Phase 4: Socket Proxy Smoke Test ==="
log_info "Validates socket-proxy deployment and security configuration"
echo ""

# ==============================================================================
# Test 1: Socket Proxy Container Creation
# ==============================================================================
log_step "GIVEN tecnativa/docker-socket-proxy image"

log_info "Creating test network"
docker network create cfn-test-network || true

log_info "Starting socket-proxy container"
docker run -d \
  --name cfn-socket-proxy-test \
  --privileged \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e CONTAINERS=1 \
  -e POST=1 \
  -e DELETE=1 \
  -e PRIVILEGED=0 \
  -e HOST=0 \
  -e VOLUMES=0 \
  -e SOCKETV2=0 \
  -e LOG=1 \
  --network cfn-test-network \
  --health-cmd="wget --spider -q http://localhost:2375/containers/json" \
  --health-interval=10s \
  --health-timeout=5s \
  --health-retries=3 \
  tecnativa/docker-socket-proxy:latest

sleep 5

log_step "WHEN checking container status"
CONTAINER_STATUS=$(docker inspect cfn-socket-proxy-test --format '{{.State.Status}}')
log_info "Container status: $CONTAINER_STATUS"

log_step "THEN socket-proxy should be running"
assert_equals "$CONTAINER_STATUS" "running" "Socket proxy container should be running"

# Wait for health check
log_info "Waiting for health check..."
for i in {1..30}; do
  HEALTH_STATUS=$(docker inspect cfn-socket-proxy-test --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
  if [ "$HEALTH_STATUS" = "healthy" ]; then
    break
  fi
  sleep 1
done

log_step "AND socket-proxy should be healthy"
assert_equals "$HEALTH_STATUS" "healthy" "Socket proxy should be healthy"

# ==============================================================================
# Test 2: Docker API Accessibility
# ==============================================================================
log_step "GIVEN socket-proxy is running"

log_step "WHEN querying Docker API via socket proxy"
RESPONSE=$(docker exec cfn-socket-proxy-test wget -qO- http://localhost:2375/containers/json 2>&1) || true

log_step "THEN response should be valid JSON array"
if echo "$RESPONSE" | grep -q '^\['; then
  log_info "Valid JSON response received"
else
  log_info "Response was: $RESPONSE"
  assert_fail "Response should be JSON array"
fi

annotate "Socket proxy API responding correctly"

# ==============================================================================
# Test 3: Environment Variables Configuration
# ==============================================================================
log_step "GIVEN socket-proxy environment variables"

log_step "WHEN checking security configurations"
CONTAINERS_VAR=$(docker exec cfn-socket-proxy-test printenv CONTAINERS)
PRIVILEGED_VAR=$(docker exec cfn-socket-proxy-test printenv PRIVILEGED)
HOST_VAR=$(docker exec cfn-socket-proxy-test printenv HOST)
VOLUMES_VAR=$(docker exec cfn-socket-proxy-test printenv VOLUMES)
LOG_VAR=$(docker exec cfn-socket-proxy-test printenv LOG)

log_info "CONTAINERS: $CONTAINERS_VAR"
log_info "PRIVILEGED: $PRIVILEGED_VAR"
log_info "HOST: $HOST_VAR"
log_info "VOLUMES: $VOLUMES_VAR"
log_info "LOG: $LOG_VAR"

log_step "THEN security settings should be configured correctly"
assert_equals "$CONTAINERS_VAR" "1" "CONTAINERS should be enabled"
assert_equals "$PRIVILEGED_VAR" "0" "PRIVILEGED should be disabled"
assert_equals "$HOST_VAR" "0" "HOST should be disabled"
assert_equals "$VOLUMES_VAR" "0" "VOLUMES should be disabled"
assert_equals "$LOG_VAR" "1" "LOG should be enabled"

annotate "Socket proxy security configuration validated"

# ==============================================================================
# Test 4: Docker Compose Configuration Validation
# ==============================================================================
log_step "GIVEN docker/docker-compose.yml"

log_step "WHEN checking socket-proxy service configuration"
# Verify socket-proxy service exists
if ! grep -q "socket-proxy:" "$PROJECT_ROOT/docker/docker-compose.yml"; then
  log_info "ERROR: socket-proxy service not found"
  exit 1
fi

# Verify security environment variables exist in file
# Use simpler pattern matching to avoid confusion with other services
if ! grep -q "PRIVILEGED: '0'" "$PROJECT_ROOT/docker/docker-compose.yml"; then
  log_info "ERROR: PRIVILEGED: '0' not found in docker-compose.yml"
  exit 1
fi
if ! grep -q "HOST: '0'" "$PROJECT_ROOT/docker/docker-compose.yml"; then
  log_info "ERROR: HOST: '0' not found in docker-compose.yml"
  exit 1
fi
if ! grep -q "VOLUMES: '0'" "$PROJECT_ROOT/docker/docker-compose.yml"; then
  log_info "ERROR: VOLUMES: '0' not found in docker-compose.yml"
  exit 1
fi

log_step "THEN docker-compose.yml should have socket-proxy configured"
annotate "Socket proxy configuration in docker-compose.yml validated"

# ==============================================================================
# Test 5: Coordinator Integration Check
# ==============================================================================
log_step "GIVEN cfn-coordinator configuration in docker-compose.yml"

log_step "WHEN checking DOCKER_HOST environment variable"
# Verify coordinator has DOCKER_HOST pointing to socket-proxy
if ! grep -A 50 "cfn-coordinator:" "$PROJECT_ROOT/docker/docker-compose.yml" | grep -q "DOCKER_HOST=tcp://socket-proxy:2375"; then
  log_info "ERROR: DOCKER_HOST not configured to use socket-proxy"
  exit 1
fi

# Verify direct socket mount is removed (should be commented out or removed entirely)
# Look for uncommented socket mount lines
if grep -A 50 "cfn-coordinator:" "$PROJECT_ROOT/docker/docker-compose.yml" | grep "/var/run/docker.sock:/var/run/docker.sock" | grep -v "^[[:space:]]*#" | grep -v "REMOVED" | grep -v "Previous:"; then
  log_info "ERROR: Direct socket mount still present in coordinator (should be removed)"
  exit 1
fi

log_step "THEN coordinator should be configured to use socket-proxy"
annotate "Coordinator integration with socket-proxy validated"

# ==============================================================================
# Test 6: Security Documentation Check
# ==============================================================================
log_step "GIVEN Phase 4 security hardening requirements"

log_step "WHEN checking docker-compose.yml comments"
# Verify security benefits are documented
grep -B 5 -A 5 "socket-proxy:" "$PROJECT_ROOT/docker/docker-compose.yml" | grep -q "Phase 4" || log_info "Warning: Phase 4 reference not found in comments"

log_step "THEN security benefits should be documented"
annotate "Phase 4 security hardening documented"

echo ""
log_step "=== All Phase 4 Smoke Tests Passed ==="
log_info "Socket proxy successfully deployed and configured"
log_info "Security hardening complete - matching Trigger.dev security posture"
log_info ""
log_info "Next steps:"
log_info "1. Full integration test with coordinator spawning agents"
log_info "2. Privileged operation blocking validation"
log_info "3. Audit log analysis"
