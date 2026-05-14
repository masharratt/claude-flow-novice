#!/bin/bash
# tests/docker/redis-validation-test.sh
# Phase 2 :: Redis connectivity and service validation (Bug #21 - Production Code Paths)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
NETWORK_NAME="${NETWORK_NAME:-trigger-dev_trigger-cfn-network}"
TEST_WORKER_NAME="test-redis-worker-$$"
TEST_KEY_PREFIX="test:redis:$$"

cleanup() {
    log_info "Cleaning up test resources..."

    # Remove test worker containers
    docker rm -f "$TEST_WORKER_NAME" "${TEST_WORKER_NAME}-env" "${TEST_WORKER_NAME}-reader" >/dev/null 2>&1 || true

    # Clean up test Redis keys
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --pattern "${TEST_KEY_PREFIX}:*" 2>/dev/null | \
        xargs -r redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL >/dev/null 2>&1 || true

    log_info "Cleanup complete"
}
trap cleanup EXIT

# Test 1: Host Redis connectivity
test_host_redis_connectivity() {
    log_step "GIVEN Redis should be accessible from host"

    # WHEN attempting to ping Redis
    local result
    result=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING 2>&1)

    # THEN Redis should respond with PONG
    assert_equals "PONG" "$result" "Host Redis connectivity (127.0.0.1:6379)"
}

# Test 2: Docker network exists
test_docker_network_exists() {
    log_step "GIVEN Docker Compose should have created the network"

    # WHEN checking for network existence
    local network_exists
    network_exists=$(docker network ls --format '{{.Name}}' | grep -c "^${NETWORK_NAME}$" || echo "0")

    # THEN network should exist
    assert_equals "1" "$network_exists" "Docker network '$NETWORK_NAME' exists"
}

# Test 3: Redis service resolution in Docker network
test_redis_service_resolution() {
    log_step "GIVEN Worker container should resolve 'redis' service name"

    # WHEN spawning test worker container
    docker run -d \
        --name "$TEST_WORKER_NAME" \
        --network "$NETWORK_NAME" \
        redis:7-alpine \
        sleep 300 >/dev/null 2>&1

    # THEN 'redis' hostname should resolve
    local dns_result
    dns_result=$(docker exec "$TEST_WORKER_NAME" getent hosts redis 2>&1 || echo "FAILED")

    assert_contains "$dns_result" "redis" "DNS resolution of 'redis' service name"
}

# Test 4: Redis connectivity from Docker network
test_redis_connectivity_from_docker() {
    log_step "GIVEN Worker container should connect to Redis service"

    # WHEN attempting to ping Redis from container
    local result
    result=$(docker exec "$TEST_WORKER_NAME" redis-cli -h redis -p 6379 PING 2>&1)

    # THEN Redis should respond with PONG
    assert_equals "PONG" "$result" "Redis connectivity from Docker container (redis:6379)"
}

# Test 5: Redis data operations (SET/GET)
test_redis_data_operations() {
    log_step "GIVEN Redis should support basic data operations"

    local test_key="${TEST_KEY_PREFIX}:data"
    local test_value="test-value-$$"

    # WHEN setting and retrieving a key
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "$test_key" "$test_value" >/dev/null 2>&1
    local retrieved
    retrieved=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "$test_key" 2>&1)

    # THEN retrieved value should match
    assert_equals "$test_value" "$retrieved" "Redis SET/GET operations"
}

# Test 6: Redis task queue operations (LPUSH/RPOP)
test_redis_queue_operations() {
    log_step "GIVEN Redis should support task queue operations"

    local queue_key="${TEST_KEY_PREFIX}:queue"
    local task_value="task-payload-$$"

    # WHEN pushing to queue and popping from queue
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "$queue_key" "$task_value" >/dev/null 2>&1
    local popped
    popped=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" RPOP "$queue_key" 2>&1)

    # THEN popped value should match
    assert_equals "$task_value" "$popped" "Redis LPUSH/RPOP task queue operations"
}

# Test 7: Worker container health status
test_worker_container_health() {
    log_step "GIVEN Test worker container should be running"

    # WHEN checking container status
    local status
    status=$(docker inspect "$TEST_WORKER_NAME" --format '{{.State.Status}}' 2>&1)

    # THEN container should be running
    assert_equals "running" "$status" "Worker container health status"
}

# Test 8: Environment variable validation in container
test_environment_variables() {
    log_step "GIVEN Container should have access to environment variables"

    # WHEN spawning container with custom env var
    local env_key="TEST_ENV_VAR"
    local env_value="test-env-value-$$"

    docker rm -f "${TEST_WORKER_NAME}-env" >/dev/null 2>&1 || true
    docker run -d \
        --name "${TEST_WORKER_NAME}-env" \
        --network "$NETWORK_NAME" \
        -e "${env_key}=${env_value}" \
        redis:7-alpine \
        sleep 300 >/dev/null 2>&1

    local retrieved_env
    retrieved_env=$(docker exec "${TEST_WORKER_NAME}-env" sh -c "echo \$$env_key" 2>&1)

    # THEN environment variable should be accessible
    assert_equals "$env_value" "$retrieved_env" "Environment variable access in container"

    # Cleanup env test container
    docker rm -f "${TEST_WORKER_NAME}-env" >/dev/null 2>&1 || true
}

# Test 9: Redis persistence check
test_redis_persistence() {
    log_step "GIVEN Redis should persist data across connections"

    local persist_key="${TEST_KEY_PREFIX}:persist"
    local persist_value="persistent-value-$$"

    # WHEN setting value and reconnecting
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "$persist_key" "$persist_value" >/dev/null 2>&1

    # Close connection and retrieve again
    local retrieved
    retrieved=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "$persist_key" 2>&1)

    # THEN value should persist
    assert_equals "$persist_value" "$retrieved" "Redis data persistence across connections"
}

# Test 10: Multi-container Redis access
test_multi_container_access() {
    log_step "GIVEN Multiple containers should access same Redis instance"

    local multi_key="${TEST_KEY_PREFIX}:multi"
    local multi_value="shared-value-$$"

    # WHEN one container writes
    docker exec "$TEST_WORKER_NAME" redis-cli -h redis -p 6379 SET "$multi_key" "$multi_value" >/dev/null 2>&1

    # AND another container reads
    docker rm -f "${TEST_WORKER_NAME}-reader" >/dev/null 2>&1 || true
    docker run -d \
        --name "${TEST_WORKER_NAME}-reader" \
        --network "$NETWORK_NAME" \
        redis:7-alpine \
        sleep 300 >/dev/null 2>&1

    local read_value
    read_value=$(docker exec "${TEST_WORKER_NAME}-reader" redis-cli -h redis -p 6379 GET "$multi_key" 2>&1)

    # THEN both should access same data
    assert_equals "$multi_value" "$read_value" "Multi-container Redis access to shared data"

    # Cleanup reader container
    docker rm -f "${TEST_WORKER_NAME}-reader" >/dev/null 2>&1 || true
}

# Execute all tests
main() {
    echo "================================================"
    echo "Redis Validation Test Suite"
    echo "Bug #21: Production Code Path Validation"
    echo "================================================"
    echo ""

    # Run all tests
    test_host_redis_connectivity
    test_docker_network_exists
    test_redis_service_resolution
    test_redis_connectivity_from_docker
    test_redis_data_operations
    test_redis_queue_operations
    test_worker_container_health
    test_environment_variables
    test_redis_persistence
    test_multi_container_access

    # Print summary
    print_test_summary
}

main
