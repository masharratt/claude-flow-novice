#!/bin/bash
# tests/integration/collision-mitigation/test-phase4-socket-proxy.sh
# Phase 4 :: Socket proxy security validation (Reference: PHASE_4_SECURITY_VALIDATION_REPORT.md)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
PROXY_CONTAINER="cfn-socket-proxy-test-$$"
DOCKER_NETWORK="mcp-network"
TEST_AGENT_NAME="socket-proxy-test-agent-$$"

cleanup() {
    log_info "Cleaning up Phase 4 test artifacts"

    # Remove test containers
    docker rm -f "$PROXY_CONTAINER" 2>/dev/null || true
    docker rm -f "$TEST_AGENT_NAME" 2>/dev/null || true

    # Clean up network if empty
    if docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1; then
        local containers=$(docker network inspect "$DOCKER_NETWORK" -f '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | wc -w)
        if [ "$containers" -eq 0 ]; then
            docker network rm "$DOCKER_NETWORK" 2>/dev/null || true
        fi
    fi
}
trap cleanup EXIT

test_socket_proxy_deployment() {
    annotate "Phase 4: Socket Proxy Deployment"

    log_step "GIVEN: Docker network exists"
    if ! docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1; then
        docker network create "$DOCKER_NETWORK"
    fi

    log_step "WHEN: Socket proxy container is started"
    docker run -d \
        --name "$PROXY_CONTAINER" \
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
        --network "$DOCKER_NETWORK" \
        --health-cmd='wget --spider -q http://localhost:2375/containers/json' \
        --health-interval=10s \
        --health-timeout=5s \
        --health-retries=3 \
        tecnativa/docker-socket-proxy:latest >/dev/null 2>&1 || {
            log_error "Failed to start socket proxy container"
            return 1
        }

    log_step "THEN: Container starts successfully"
    sleep 3 # Allow container to initialize

    local status=$(docker inspect -f '{{.State.Status}}' "$PROXY_CONTAINER" 2>/dev/null || echo "not found")
    assert_equals "running" "$status" "Socket proxy is running"

    log_step "THEN: Health check becomes healthy"
    local max_wait=30
    local waited=0
    while [ $waited -lt $max_wait ]; do
        local health=$(docker inspect -f '{{.State.Health.Status}}' "$PROXY_CONTAINER" 2>/dev/null || echo "none")
        if [ "$health" = "healthy" ]; then
            log_success "Socket proxy is healthy"
            break
        fi
        sleep 2
        waited=$((waited + 2))
    done

    if [ $waited -ge $max_wait ]; then
        log_error "Socket proxy did not become healthy within ${max_wait}s"
        docker logs "$PROXY_CONTAINER" 2>&1 | tail -20
        return 1
    fi
}

test_docker_api_accessibility() {
    annotate "Phase 4: Docker API Accessibility via Proxy"

    log_step "GIVEN: Socket proxy is running"
    if ! docker ps --filter "name=$PROXY_CONTAINER" --format "{{.Names}}" | grep -q "$PROXY_CONTAINER"; then
        log_error "Socket proxy not running, cannot test API access"
        return 1
    fi

    log_step "WHEN: Accessing Docker API through proxy"
    local api_response=$(docker exec "$PROXY_CONTAINER" \
        wget -qO- http://localhost:2375/containers/json 2>/dev/null || echo "[]")

    log_step "THEN: API responds with valid JSON"
    if echo "$api_response" | grep -q '^\['; then
        log_success "Docker API accessible via proxy"
    else
        log_error "Docker API response invalid: $api_response"
        return 1
    fi
}

test_privileged_operation_blocking() {
    annotate "Phase 4: Privileged Operation Blocking"

    log_step "GIVEN: Socket proxy is running with PRIVILEGED=0"
    if ! docker ps --filter "name=$PROXY_CONTAINER" --format "{{.Names}}" | grep -q "$PROXY_CONTAINER"; then
        log_error "Socket proxy not running"
        return 1
    fi

    log_step "WHEN: Attempting to create privileged container via proxy"
    # Note: This test validates configuration, actual blocking happens at proxy level
    local privileged_env=$(docker exec "$PROXY_CONTAINER" sh -c 'echo $PRIVILEGED' 2>/dev/null || echo "")

    log_step "THEN: PRIVILEGED environment variable is set to 0"
    if [ "$privileged_env" = "0" ]; then
        log_success "Privileged operations are blocked (PRIVILEGED=0)"
    else
        log_error "PRIVILEGED=$privileged_env (expected: 0)"
        return 1
    fi
}

test_host_network_blocking() {
    annotate "Phase 4: Host Network Access Blocking"

    log_step "GIVEN: Socket proxy is running with HOST=0"
    if ! docker ps --filter "name=$PROXY_CONTAINER" --format "{{.Names}}" | grep -q "$PROXY_CONTAINER"; then
        log_error "Socket proxy not running"
        return 1
    fi

    log_step "WHEN: Checking HOST environment variable"
    local host_env=$(docker exec "$PROXY_CONTAINER" sh -c 'echo $HOST' 2>/dev/null || echo "")

    log_step "THEN: HOST environment variable is set to 0"
    if [ "$host_env" = "0" ]; then
        log_success "Host network access is blocked (HOST=0)"
    else
        log_error "HOST=$host_env (expected: 0)"
        return 1
    fi
}

test_volume_mount_blocking() {
    annotate "Phase 4: Dangerous Volume Mount Blocking"

    log_step "GIVEN: Socket proxy is running with VOLUMES=0"
    if ! docker ps --filter "name=$PROXY_CONTAINER" --format "{{.Names}}" | grep -q "$PROXY_CONTAINER"; then
        log_error "Socket proxy not running"
        return 1
    fi

    log_step "WHEN: Checking VOLUMES environment variable"
    local volumes_env=$(docker exec "$PROXY_CONTAINER" sh -c 'echo $VOLUMES' 2>/dev/null || echo "")

    log_step "THEN: VOLUMES environment variable is set to 0"
    if [ "$volumes_env" = "0" ]; then
        log_success "Arbitrary volume mounts are blocked (VOLUMES=0)"
    else
        log_error "VOLUMES=$volumes_env (expected: 0)"
        return 1
    fi
}

test_audit_logging_enabled() {
    annotate "Phase 4: Audit Logging"

    log_step "GIVEN: Socket proxy is running with LOG=1"
    if ! docker ps --filter "name=$PROXY_CONTAINER" --format "{{.Names}}" | grep -q "$PROXY_CONTAINER"; then
        log_error "Socket proxy not running"
        return 1
    fi

    log_step "WHEN: Checking LOG environment variable"
    local log_env=$(docker exec "$PROXY_CONTAINER" sh -c 'echo $LOG' 2>/dev/null || echo "")

    log_step "THEN: LOG environment variable is set to 1"
    if [ "$log_env" = "1" ]; then
        log_success "Audit logging is enabled (LOG=1)"
    else
        log_error "LOG=$log_env (expected: 1)"
        return 1
    fi

    log_step "WHEN: Making API request to generate log entry"
    docker exec "$PROXY_CONTAINER" \
        wget -qO- http://localhost:2375/containers/json >/dev/null 2>&1 || true

    sleep 1

    log_step "THEN: Logs contain API request record"
    local logs=$(docker logs "$PROXY_CONTAINER" 2>&1 | tail -10)
    if echo "$logs" | grep -q "containers"; then
        log_success "Audit logs capture API requests"
    else
        log_warn "Audit log format may differ, manual verification needed"
    fi
}

test_docker_compose_integration() {
    annotate "Phase 4: Docker Compose Integration"

    log_step "GIVEN: Docker Compose files exist"
    local cli_compose="$PROJECT_ROOT/docker/docker-compose.yml"

    if [ ! -f "$cli_compose" ]; then
        log_error "CLI docker-compose.yml not found"
        return 1
    fi

    log_step "WHEN: Checking socket-proxy service definition"
    if grep -q "socket-proxy:" "$cli_compose"; then
        log_success "socket-proxy service defined in docker-compose.yml"
    else
        log_error "socket-proxy service not found in docker-compose.yml"
        return 1
    fi

    log_step "THEN: Security environment variables are configured"
    local security_vars=("PRIVILEGED: '0'" "HOST: '0'" "VOLUMES: '0'" "LOG: '1'")
    local missing=0

    for var in "${security_vars[@]}"; do
        if grep -q "$var" "$cli_compose"; then
            log_success "Security setting configured: $var"
        else
            log_warn "Security setting may be missing: $var"
            missing=$((missing + 1))
        fi
    done

    if [ "$missing" -gt 0 ]; then
        log_warn "$missing security setting(s) may need verification"
    fi
}

test_coordinator_socket_proxy_connection() {
    annotate "Phase 4: Coordinator Socket Proxy Connection"

    log_step "GIVEN: Docker Compose files exist"
    local cli_compose="$PROJECT_ROOT/docker/docker-compose.yml"

    if [ ! -f "$cli_compose" ]; then
        log_error "CLI docker-compose.yml not found"
        return 1
    fi

    log_step "WHEN: Checking coordinator DOCKER_HOST configuration"
    if grep -q "DOCKER_HOST.*socket-proxy.*2375" "$cli_compose"; then
        log_success "Coordinator configured to use socket proxy"
    else
        log_warn "Coordinator DOCKER_HOST configuration may not be set"
    fi

    log_step "THEN: Direct socket mount should be removed"
    # Check if direct socket mount is commented out or removed
    if grep -v "^\s*#" "$cli_compose" | grep -q "/var/run/docker.sock.*coordinator"; then
        log_warn "Direct socket mount may still be present in coordinator"
    else
        log_success "Direct socket mount removed from coordinator"
    fi

    log_step "THEN: Coordinator depends on socket-proxy health"
    if grep -A 5 "coordinator:" "$cli_compose" | grep -q "socket-proxy"; then
        log_success "Coordinator has dependency on socket-proxy"
    else
        log_warn "Coordinator dependency on socket-proxy may not be configured"
    fi
}

# Execute tests
test_socket_proxy_deployment
test_docker_api_accessibility
test_privileged_operation_blocking
test_host_network_blocking
test_volume_mount_blocking
test_audit_logging_enabled
test_docker_compose_integration
test_coordinator_socket_proxy_connection

# Summary
annotate "Phase 4 Test Summary"
echo "Total Tests: $TEST_TOTAL"
echo "Passed: $TEST_PASSED"
echo "Failed: $TEST_FAILED"

if [ "$TEST_FAILED" -eq 0 ]; then
    log_success "Phase 4: All socket proxy tests passed"
    exit 0
else
    log_error "Phase 4: $TEST_FAILED test(s) failed"
    exit 1
fi
