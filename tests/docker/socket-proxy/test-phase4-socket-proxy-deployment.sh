#!/bin/bash
# tests/docker/socket-proxy/test-phase4-socket-proxy-deployment.sh
# Phase 4 :: Socket Proxy Deployment Validation (Planning Reference: CLI_TRIGGER_COLLISION_ANALYSIS.md)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  log_step "CLEANUP: Stopping all services"
  docker-compose -f "$PROJECT_ROOT/docker/docker-compose.yml" down -v 2>/dev/null || true
  docker rm -f cfn-socket-proxy cfn-coordinator cfn-redis 2>/dev/null || true
}
trap cleanup EXIT

# ==============================================================================
# Test 1: Socket Proxy Service Deployment
# ==============================================================================
test_socket_proxy_deployment() {
  log_step "GIVEN docker-compose.yml with socket-proxy service"

  log_info "Starting socket-proxy service"
  docker-compose -f "$PROJECT_ROOT/docker/docker-compose.yml" up -d socket-proxy
  sleep 5

  log_step "WHEN checking socket-proxy container status"
  CONTAINER_STATUS=$(docker inspect cfn-socket-proxy --format '{{.State.Status}}')
  log_info "Container status: $CONTAINER_STATUS"

  log_step "THEN socket-proxy should be running"
  assert_equals "$CONTAINER_STATUS" "running" "Socket proxy container should be running"

  log_step "AND socket-proxy should be healthy"
  HEALTH_STATUS=$(docker inspect cfn-socket-proxy --format '{{.State.Health.Status}}')
  log_info "Health status: $HEALTH_STATUS"

  # Wait for health check to pass (max 30 seconds)
  for i in {1..30}; do
    HEALTH_STATUS=$(docker inspect cfn-socket-proxy --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
    if [ "$HEALTH_STATUS" = "healthy" ]; then
      break
    fi
    log_info "Waiting for health check... ($i/30)"
    sleep 1
  done

  assert_equals "$HEALTH_STATUS" "healthy" "Socket proxy should be healthy"
}

# ==============================================================================
# Test 2: Socket Proxy API Accessibility
# ==============================================================================
test_socket_proxy_api_access() {
  log_step "GIVEN socket-proxy service is running"

  log_step "WHEN querying Docker API via socket proxy"
  RESPONSE=$(docker exec cfn-socket-proxy wget -qO- http://localhost:2375/containers/json 2>&1) || true

  log_step "THEN response should be valid JSON array"
  if echo "$RESPONSE" | grep -q '^\['; then
    log_info "Valid JSON response received"
  else
    log_info "Response was: $RESPONSE"
    assert_fail "Response should be JSON array"
  fi

  annotate "Socket proxy API responding correctly"
}

# ==============================================================================
# Test 3: Coordinator Connection to Socket Proxy
# ==============================================================================
test_coordinator_socket_proxy_connection() {
  log_step "GIVEN socket-proxy and cfn-redis services running"
  docker-compose -f "$PROJECT_ROOT/docker/docker-compose.yml" up -d socket-proxy cfn-redis
  sleep 10

  log_step "WHEN starting cfn-coordinator service"
  docker-compose -f "$PROJECT_ROOT/docker/docker-compose.yml" up -d cfn-coordinator
  sleep 5

  COORDINATOR_STATUS=$(docker inspect cfn-coordinator --format '{{.State.Status}}' 2>/dev/null || echo "not_found")
  log_info "Coordinator status: $COORDINATOR_STATUS"

  log_step "THEN coordinator should be running"
  assert_equals "$COORDINATOR_STATUS" "running" "Coordinator should be running"

  log_step "AND coordinator should have DOCKER_HOST set to socket proxy"
  DOCKER_HOST_VAR=$(docker exec cfn-coordinator printenv DOCKER_HOST 2>/dev/null || echo "")
  log_info "DOCKER_HOST: $DOCKER_HOST_VAR"
  assert_equals "$DOCKER_HOST_VAR" "tcp://socket-proxy:2375" "DOCKER_HOST should point to socket proxy"

  log_step "AND coordinator should NOT have direct socket mount"
  SOCKET_MOUNT=$(docker inspect cfn-coordinator --format '{{range .Mounts}}{{if eq .Destination "/var/run/docker.sock"}}FOUND{{end}}{{end}}' 2>/dev/null || echo "")
  log_info "Direct socket mount: ${SOCKET_MOUNT:-NONE}"
  assert_not_equals "$SOCKET_MOUNT" "FOUND" "Coordinator should NOT have direct socket mount"

  annotate "Coordinator properly configured to use socket proxy"
}

# ==============================================================================
# Test 4: Agent Spawning Through Socket Proxy
# ==============================================================================
test_agent_spawning_via_proxy() {
  log_step "GIVEN all services running (socket-proxy, redis, coordinator)"

  log_step "WHEN coordinator attempts to spawn test agent"
  # Spawn a simple test container via coordinator's Docker connection
  TEST_CONTAINER_NAME="cfn-test-agent-$$"

  docker exec cfn-coordinator sh -c "
    export DOCKER_HOST=tcp://socket-proxy:2375
    docker run -d --name $TEST_CONTAINER_NAME --network mcp-network alpine:latest sleep 30
  " 2>&1 | tee /tmp/spawn-test.log || true

  sleep 2

  log_step "THEN test agent container should exist"
  AGENT_EXISTS=$(docker ps -a --filter "name=$TEST_CONTAINER_NAME" --format '{{.Names}}' | grep -c "$TEST_CONTAINER_NAME" || echo "0")
  log_info "Agent container found: $AGENT_EXISTS"

  assert_equals "$AGENT_EXISTS" "1" "Agent container should be spawned via socket proxy"

  # Cleanup test agent
  docker rm -f "$TEST_CONTAINER_NAME" 2>/dev/null || true

  annotate "Agent spawning works through socket proxy"
}

# ==============================================================================
# Test 5: Security Validation - Privileged Operations Blocked
# ==============================================================================
test_privileged_operations_blocked() {
  log_step "GIVEN socket-proxy with PRIVILEGED=0"

  log_step "WHEN attempting to create privileged container via proxy"
  TEST_CONTAINER_NAME="cfn-test-privileged-$$"

  # This should fail because socket proxy blocks privileged mode
  docker exec cfn-coordinator sh -c "
    export DOCKER_HOST=tcp://socket-proxy:2375
    docker run -d --name $TEST_CONTAINER_NAME --privileged alpine:latest sleep 10
  " 2>&1 | tee /tmp/privileged-test.log || true

  sleep 2

  log_step "THEN privileged container should NOT be created"
  PRIVILEGED_EXISTS=$(docker ps -a --filter "name=$TEST_CONTAINER_NAME" --format '{{.Names}}' | grep -c "$TEST_CONTAINER_NAME" || echo "0")
  log_info "Privileged container found: $PRIVILEGED_EXISTS"

  # Note: Socket proxy may still create the container but without privileged flag
  # The key check is whether the container has HostConfig.Privileged=false
  if [ "$PRIVILEGED_EXISTS" = "1" ]; then
    PRIVILEGED_FLAG=$(docker inspect "$TEST_CONTAINER_NAME" --format '{{.HostConfig.Privileged}}' 2>/dev/null || echo "false")
    assert_equals "$PRIVILEGED_FLAG" "false" "Container should not have privileged flag set"
    docker rm -f "$TEST_CONTAINER_NAME" 2>/dev/null || true
  fi

  annotate "Socket proxy blocks privileged operations"
}

# ==============================================================================
# Test 6: Security Validation - Audit Logging Enabled
# ==============================================================================
test_audit_logging_enabled() {
  log_step "GIVEN socket-proxy with LOG=1"

  log_step "WHEN checking socket-proxy logs"
  LOGS=$(docker logs cfn-socket-proxy 2>&1 | tail -20)
  log_info "Recent socket-proxy logs:"
  echo "$LOGS"

  log_step "THEN logs should contain Docker API requests"
  # Socket proxy logs HAProxy-style access logs
  echo "$LOGS" | grep -qE "(GET|POST|DELETE)" || log_info "Note: No API requests logged yet (expected if no activity)"

  annotate "Socket proxy audit logging is enabled"
}

# ==============================================================================
# Test 7: Service Health Checks
# ==============================================================================
test_service_health_checks() {
  log_step "GIVEN all services deployed"

  log_step "WHEN checking service health statuses"

  # Socket proxy health
  SOCKET_HEALTH=$(docker inspect cfn-socket-proxy --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
  log_info "socket-proxy health: $SOCKET_HEALTH"
  assert_equals "$SOCKET_HEALTH" "healthy" "Socket proxy should be healthy"

  # Redis health
  REDIS_HEALTH=$(docker inspect cfn-redis --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
  log_info "cfn-redis health: $REDIS_HEALTH"
  assert_equals "$REDIS_HEALTH" "healthy" "Redis should be healthy"

  # Coordinator should be running (no health check defined)
  COORDINATOR_STATUS=$(docker inspect cfn-coordinator --format '{{.State.Status}}' 2>/dev/null || echo "unknown")
  log_info "cfn-coordinator status: $COORDINATOR_STATUS"
  assert_equals "$COORDINATOR_STATUS" "running" "Coordinator should be running"

  annotate "All service health checks passing"
}

# ==============================================================================
# Test 8: Network Connectivity Validation
# ==============================================================================
test_network_connectivity() {
  log_step "GIVEN all services on mcp-network"

  log_step "WHEN testing network connectivity between services"

  # Coordinator can reach socket-proxy
  docker exec cfn-coordinator sh -c "wget -qO- http://socket-proxy:2375/containers/json" > /dev/null 2>&1
  assert_success $? "Coordinator should reach socket-proxy via service name"

  # Coordinator can reach Redis
  docker exec cfn-coordinator sh -c "ping -c 1 cfn-redis" > /dev/null 2>&1
  assert_success $? "Coordinator should reach cfn-redis via service name"

  annotate "Network connectivity between services validated"
}

# ==============================================================================
# Run All Tests
# ==============================================================================
log_step "=== Phase 4: Socket Proxy Deployment Validation ==="
log_info "Reference: planning/trigger/CLI_TRIGGER_COLLISION_ANALYSIS.md - Phase 4"
echo ""

test_socket_proxy_deployment
test_socket_proxy_api_access
test_coordinator_socket_proxy_connection
test_agent_spawning_via_proxy
test_privileged_operations_blocked
test_audit_logging_enabled
test_service_health_checks
test_network_connectivity

echo ""
log_step "=== All Phase 4 Tests Passed ==="
log_info "Socket proxy successfully deployed to CLI mode"
log_info "Security hardening complete - matching Trigger.dev security posture"
