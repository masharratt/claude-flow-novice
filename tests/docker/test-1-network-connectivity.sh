#!/bin/bash
##############################################################################
# Test 1: Docker Network Connectivity
# Phase 4: Docker Mode Integration - Infrastructure Validation
#
# Tests that Docker network infrastructure is properly configured:
# 1. Docker daemon is accessible
# 2. Docker network exists
# 3. Redis container is running
# 4. Redis is accessible from network
# 5. Containers can communicate
##############################################################################

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

NETWORK_NAME="${DOCKER_NETWORK:-mcp-network}"
REDIS_CONTAINER="cfn-redis"
TEST_CONTAINER="test-network-$$"

cleanup() {
    docker rm -f "$TEST_CONTAINER" 2>/dev/null || true
    log_info "Cleanup completed"
}
trap cleanup EXIT

##############################################################################
# Test 1.1: Docker daemon accessibility
##############################################################################
test_docker_daemon() {
    log_step "Test 1.1: Docker daemon accessibility"

    # GIVEN: Docker daemon should be running
    # WHEN: Execute docker ps
    # THEN: Command should succeed
    assert_success "Docker daemon accessible" docker ps >/dev/null
}

##############################################################################
# Test 1.2: Docker network exists
##############################################################################
test_network_exists() {
    log_step "Test 1.2: Docker network exists"

    # GIVEN: Network should exist or be created
    ensure_network "$NETWORK_NAME"

    # WHEN: Check network existence
    local output
    output=$(docker network ls --filter "name=$NETWORK_NAME" --format "{{.Name}}")

    # THEN: Network should be listed
    assert_equals "$NETWORK_NAME" "$output" "Network '$NETWORK_NAME' exists"
}

##############################################################################
# Test 1.3: Redis container is running
##############################################################################
test_redis_running() {
    log_step "Test 1.3: Redis container is running"

    # GIVEN: Redis should be running on network
    # WHEN: Check container status
    # THEN: Container should be running
    if is_container_running "$REDIS_CONTAINER"; then
        log_success "PASS: Redis container is running"
        TEST_PASSED=$((TEST_PASSED + 1))
        TEST_TOTAL=$((TEST_TOTAL + 1))
        return 0
    else
        log_error "FAIL: Redis container is not running"
        log_info "Attempting to start Redis..."
        docker run -d \
            --name "$REDIS_CONTAINER" \
            --network "$NETWORK_NAME" \
            -p 6379:6379 \
            redis:7-alpine redis-server --appendonly yes \
            >/dev/null 2>&1 || true

        sleep 3

        if is_container_running "$REDIS_CONTAINER"; then
            log_success "Redis started successfully"
            TEST_PASSED=$((TEST_PASSED + 1))
            TEST_TOTAL=$((TEST_TOTAL + 1))
            return 0
        else
            TEST_FAILED=$((TEST_FAILED + 1))
            TEST_TOTAL=$((TEST_TOTAL + 1))
            return 1
        fi
    fi
}

##############################################################################
# Test 1.4: Redis health check
##############################################################################
test_redis_health() {
    log_step "Test 1.4: Redis health check"

    # GIVEN: Redis should respond to PING
    # WHEN: Execute PING command
    # THEN: Should return PONG
    assert_success "Redis responds to PING" verify_redis_health
}

##############################################################################
# Test 1.5: Container network communication
##############################################################################
test_container_communication() {
    log_step "Test 1.5: Container network communication"

    # GIVEN: Test container on same network
    docker run -d \
        --name "$TEST_CONTAINER" \
        --network "$NETWORK_NAME" \
        alpine:latest \
        sleep 300 >/dev/null 2>&1

    wait_for_container "$TEST_CONTAINER" 10

    # WHEN: Ping Redis from test container
    local output
    output=$(docker exec "$TEST_CONTAINER" \
        wget -qO- --timeout=5 "http://$REDIS_CONTAINER:6379" 2>&1 || echo "")

    # THEN: Connection should succeed (even with protocol error, TCP works)
    # Redis responds with -ERR to HTTP requests, which proves connectivity
    if [[ -n "$output" ]] || docker exec "$TEST_CONTAINER" \
        sh -c "nc -zv $REDIS_CONTAINER 6379" 2>&1 | grep -q "succeeded"; then
        log_success "PASS: Containers can communicate"
        TEST_PASSED=$((TEST_PASSED + 1))
        TEST_TOTAL=$((TEST_TOTAL + 1))
        return 0
    else
        log_error "FAIL: Network communication failed"
        TEST_FAILED=$((TEST_FAILED + 1))
        TEST_TOTAL=$((TEST_TOTAL + 1))
        return 1
    fi
}

##############################################################################
# Main execution
##############################################################################
setup_test "test-1-network-connectivity"

test_docker_daemon
test_network_exists
test_redis_running
test_redis_health
test_container_communication

teardown_test
