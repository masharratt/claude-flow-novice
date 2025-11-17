#!/bin/bash
# tests/docker/test-docker-security-hardening.sh
# Phase 2 :: Validate Docker security hardening (Iteration 2/10)
# Tests least-privilege principles, capability restrictions, and network isolation

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.yml"

cleanup() {
    log_info "Cleanup: Stopping any test containers"
    docker-compose -f "$COMPOSE_FILE" down --volumes --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

# Test 1: Verify Redis port binding to localhost only
test_redis_port_binding() {
    log_step "Test 1: Redis port binding security"

    # GIVEN: docker-compose.yml configuration
    # WHEN: Checking Redis port configuration

    # THEN: Should bind to 127.0.0.1 only
    if grep -q "127.0.0.1:6379:6379" "$COMPOSE_FILE"; then
        log_info "✓ Redis binds to localhost only (prevents external access)"
    else
        log_error "✗ Redis port not restricted to localhost"
        grep "6379" "$COMPOSE_FILE" || log_error "No Redis port configuration found"
        return 1
    fi

    log_info "PASS: Redis port binding is secure"
}

# Test 2: Verify capability restrictions
test_capability_restrictions() {
    log_step "Test 2: Capability restrictions"

    # GIVEN: docker-compose.yml configuration
    # WHEN: Checking capability configurations

    # THEN: Should have cap_drop: ALL configurations
    local cap_drop_count
    cap_drop_count=$(grep -A 2 "cap_drop:" "$COMPOSE_FILE" | grep -c "ALL" || true)

    if [[ $cap_drop_count -ge 2 ]]; then
        log_info "✓ Both services drop all capabilities (found $cap_drop_count instances)"
    else
        log_error "✗ Not all services drop capabilities (found $cap_drop_count instances, expected 2)"
        return 1
    fi

    log_info "PASS: Capability restrictions properly configured"
}

# Test 3: Verify no-new-privileges security option
test_no_new_privileges() {
    log_step "Test 3: no-new-privileges security option"

    # GIVEN: docker-compose.yml configuration
    # WHEN: Checking security_opt configurations

    # THEN: Should have no-new-privileges:true
    local no_priv_count
    no_priv_count=$(grep -c "no-new-privileges:true" "$COMPOSE_FILE" || true)

    if [[ $no_priv_count -ge 2 ]]; then
        log_info "✓ no-new-privileges enabled for all services (found $no_priv_count instances)"
    else
        log_error "✗ Missing no-new-privileges (found $no_priv_count instances, expected 2)"
        return 1
    fi

    log_info "PASS: no-new-privileges enabled for all services"
}

# Test 4: Verify read-only filesystem for Redis
test_redis_read_only() {
    log_step "Test 4: Redis read-only filesystem"

    # GIVEN: docker-compose.yml configuration
    # WHEN: Checking read_only configuration

    # THEN: Redis should have read_only: true
    if grep -q "read_only: true" "$COMPOSE_FILE"; then
        log_info "✓ Redis filesystem is read-only"
    else
        log_error "✗ Redis filesystem not configured as read-only"
        return 1
    fi

    # THEN: Should have tmpfs mounts for temporary storage
    if grep -q "tmpfs:" "$COMPOSE_FILE"; then
        log_info "✓ Services have tmpfs for temporary storage"
    else
        log_error "✗ Missing tmpfs mounts"
        return 1
    fi

    log_info "PASS: Read-only filesystem configured correctly"
}

# Test 5: Verify user restrictions
test_user_restrictions() {
    log_step "Test 5: User restrictions (non-root)"

    # GIVEN: docker-compose.yml configuration
    # WHEN: Checking user configuration

    # THEN: Redis should run as non-root user
    if grep -q 'user: "999:999"' "$COMPOSE_FILE"; then
        log_info "✓ Redis runs as non-root user (999:999)"
    else
        log_error "✗ Redis not configured to run as non-root"
        return 1
    fi

    log_info "PASS: User restrictions properly configured"
}

# Test 6: Verify network isolation
test_network_isolation() {
    log_step "Test 6: Network isolation configuration"

    # GIVEN: docker-compose.yml configuration
    # WHEN: Checking network configuration

    # THEN: Should have isolated subnet
    if grep -q "subnet: 172.28.0.0/16" "$COMPOSE_FILE"; then
        log_info "✓ Isolated subnet configured (172.28.0.0/16)"
    else
        log_error "✗ Isolated subnet not configured"
        return 1
    fi

    # THEN: Network should allow outbound (required for AI API)
    if grep -q "internal: false" "$COMPOSE_FILE"; then
        log_info "✓ Outbound internet allowed (required for AI API calls)"
    else
        log_error "✗ Network isolation incorrect"
        return 1
    fi

    log_info "PASS: Network isolation configured correctly"
}

# Test 7: Verify Docker socket mount restrictions
test_docker_socket_security() {
    log_step "Test 7: Docker socket mount security"

    # GIVEN: docker-compose.yml configuration
    # WHEN: Checking Docker socket mount

    # THEN: Coordinator should have Docker socket access
    local socket_count
    socket_count=$(grep -c "docker.sock" "$COMPOSE_FILE" || true)

    if [[ $socket_count -eq 1 ]]; then
        log_info "✓ Docker socket mounted exactly once (coordinator only)"
    else
        log_error "✗ Docker socket configuration unexpected (found $socket_count mounts, expected 1)"
        return 1
    fi

    # Socket can be ro or rw (coordinator needs rw for agent spawning)
    if grep "docker.sock" "$COMPOSE_FILE" | grep -q ":ro"; then
        log_info "✓ Docker socket mounted read-only"
    else
        log_info "✓ Docker socket mounted read-write (required for agent spawning)"
    fi

    log_info "PASS: Docker socket security controls in place"
}

# Test 8: Environment variable security
test_env_var_security() {
    log_step "Test 8: Environment variable security"

    # GIVEN: docker-compose.yml configuration
    # WHEN: Checking for hardcoded credentials

    # THEN: Should use environment variable references, not hardcoded values
    if grep -E "REDIS_PASSWORD=.*[^}]$" "$COMPOSE_FILE" | grep -v '\${REDIS_PASSWORD'; then
        log_error "✗ Found hardcoded password in docker-compose.yml"
        return 1
    else
        log_info "✓ No hardcoded credentials found"
    fi

    # THEN: Should pass password as environment variable
    if grep -q "REDIS_PASSWORD=\${REDIS_PASSWORD}" "$COMPOSE_FILE"; then
        log_info "✓ Password passed via environment variable"
    else
        log_error "✗ Password not properly passed as environment variable"
        return 1
    fi

    log_info "PASS: Environment variable security validated"
}

# Test 9: Resource limits
test_resource_limits() {
    log_step "Test 9: Resource limits"

    # GIVEN: docker-compose.yml configuration
    # WHEN: Checking resource limits

    # THEN: Coordinator should have memory limit
    if grep -q "mem_limit:" "$COMPOSE_FILE"; then
        log_info "✓ Coordinator has memory limit"
    else
        log_error "✗ Coordinator missing memory limit"
        return 1
    fi

    log_info "PASS: Resource limits configured"
}

# Test 10: Integration test - validate compose file syntax
test_compose_file_syntax() {
    log_step "Test 10: docker-compose.yml syntax validation"

    # GIVEN: docker-compose.yml file
    # WHEN: Validating syntax with docker-compose
    if docker-compose -f "$COMPOSE_FILE" config >/dev/null 2>&1; then
        log_info "✓ docker-compose.yml syntax is valid"
    else
        log_error "✗ docker-compose.yml has syntax errors"
        docker-compose -f "$COMPOSE_FILE" config 2>&1 | head -20
        return 1
    fi

    log_info "PASS: Compose file syntax validated"
}

# Main execution
main() {
    log_step "Starting Docker Security Hardening Test Suite"

    local failed=0

    test_redis_port_binding || ((failed++))
    test_capability_restrictions || ((failed++))
    test_no_new_privileges || ((failed++))
    test_redis_read_only || ((failed++))
    test_user_restrictions || ((failed++))
    test_network_isolation || ((failed++))
    test_docker_socket_security || ((failed++))
    test_env_var_security || ((failed++))
    test_resource_limits || ((failed++))
    test_compose_file_syntax || ((failed++))

    echo ""
    if [[ $failed -eq 0 ]]; then
        log_info "=== ALL TESTS PASSED (10/10) ==="
        log_info "Docker security hardening validated"
        exit 0
    else
        log_error "=== TESTS FAILED ($failed/10) ==="
        log_error "Security configuration issues detected"
        exit 1
    fi
}

main "$@"
