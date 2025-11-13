#!/bin/bash
# tests/docker/example-test.sh
# Phase 3 :: Example test demonstrating test utilities usage
# This test shows how to use the shared test utilities and Docker helpers

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/docker/test-helpers.sh"

# Cleanup function
cleanup() {
    log_step "Cleaning up test containers"
    cleanup_container "example-test-agent" 2>/dev/null || true
    stop_redis
}
trap cleanup EXIT

# Test case: Verify test utilities work
test_utilities() {
    log_step "GIVEN test utilities are loaded"

    # WHEN we use assertion helpers
    assert_equals "hello" "hello" "String equality check"
    assert_contains "hello world" "world" "Substring check"
    assert_not_empty "test" "Non-empty value check"

    # THEN assertions pass
    log_success "Test utilities working correctly"
}

# Test case: Verify Redis connectivity
test_redis_connectivity() {
    log_step "GIVEN Redis is running"

    # WHEN we start Redis
    if ! start_redis; then
        log_error "Failed to start Redis"
        return 1
    fi

    # THEN Redis responds to ping
    if verify_redis_health; then
        log_success "Redis connectivity verified"
    else
        log_error "Redis health check failed"
        return 1
    fi

    # WHEN we set a test key
    redis_set "test:example" "test-value"

    # THEN we can retrieve it
    value=$(redis_get "test:example")
    assert_equals "test-value" "$value" "Redis read/write"

    # Cleanup
    redis_del "test:example"
}

# Test case: Verify Docker network
test_docker_network() {
    log_step "GIVEN Docker network exists"

    # WHEN we ensure network
    ensure_network

    # THEN network is available
    if docker network ls | grep -q "$DOCKER_NETWORK"; then
        log_success "Docker network verified"
    else
        log_error "Docker network not found"
        return 1
    fi

    # WHEN we list network containers
    containers=$(list_network_containers)
    log_info "Containers on network: $containers"
}

# Main test execution
main() {
    # Setup test environment
    setup_docker_test "example-test"

    # Run test cases
    test_utilities
    test_redis_connectivity
    test_docker_network

    # Print summary
    teardown_test
}

# Execute tests
main
