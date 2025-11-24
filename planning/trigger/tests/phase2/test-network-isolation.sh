#!/bin/bash
# planning/trigger/tests/phase2/test-network-isolation.sh
# Phase 2 :: Validate network isolation between concurrent agents
# Tests: Separate namespaces, DNS resolution, port conflicts, service discovery

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TASK_ID="phase2-net-$(date +%s)"
NETWORK_NAME="cfn-network-${TASK_ID}"

cleanup() {
    log_info "Cleaning up test artifacts"
    docker rm -f "cfn-net-test-${TASK_ID}-0" "cfn-net-test-${TASK_ID}-1" "cfn-net-test-${TASK_ID}-2" 2>/dev/null || true
    docker rm -f "cfn-dns-test-${TASK_ID}" "cfn-port-test-${TASK_ID}" 2>/dev/null || true
    docker network rm "${NETWORK_NAME}" "cfn-network-isolated-${TASK_ID}" 2>/dev/null || true
}
trap cleanup EXIT

# ============================================================================
# Test 1: Agents on Same Network Can Communicate
# ============================================================================
test_same_network_communication() {
    log_step "GIVEN 3 agents on shared network ${NETWORK_NAME}"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN spawning agents on same network
    log_info "Spawning agents on shared network"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-net-test-${TASK_ID}-${idx}" \
            --network "${NETWORK_NAME}" \
            alpine:latest \
            sh -c "while true; do nc -l -p 8080 -e echo 'Agent ${idx}' 2>/dev/null || sleep 1; done" >/dev/null 2>&1
    done

    sleep 2  # Let network stabilize

    # THEN agents should be able to resolve each other by name
    log_info "Testing DNS resolution between agents"

    local reachable_count=0
    for idx in 0 1 2; do
        # Try to ping agent 0 from each agent
        local ping_result=$(docker exec "cfn-net-test-${TASK_ID}-${idx}" ping -c 1 "cfn-net-test-${TASK_ID}-0" 2>/dev/null | grep -c "1 packets received" || echo 0)

        if [ "$ping_result" -gt 0 ]; then
            log_success "✓ Agent ${idx} can reach agent 0"
            reachable_count=$((reachable_count + 1))
        else
            log_warn "✗ Agent ${idx} cannot reach agent 0"
        fi
    done

    # Cleanup
    docker rm -f "cfn-net-test-${TASK_ID}-0" "cfn-net-test-${TASK_ID}-1" "cfn-net-test-${TASK_ID}-2" 2>/dev/null || true

    if [ "$reachable_count" -eq 3 ]; then
        log_success "✓ All agents can communicate via Docker DNS"
        return 0
    else
        log_error "✗ Network communication failures: $((3 - reachable_count))/3"
        return 1
    fi
}

# ============================================================================
# Test 2: Separate Networks Provide Isolation
# ============================================================================
test_separate_network_isolation() {
    log_step "GIVEN agents on different networks"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1
    docker network create "cfn-network-isolated-${TASK_ID}" >/dev/null 2>&1

    # WHEN spawning agents on separate networks
    log_info "Testing network isolation"

    docker run -d \
        --name "cfn-net-test-${TASK_ID}-0" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sleep 30 >/dev/null 2>&1

    docker run -d \
        --name "cfn-net-test-${TASK_ID}-1" \
        --network "cfn-network-isolated-${TASK_ID}" \
        alpine:latest \
        sleep 30 >/dev/null 2>&1

    sleep 2

    # THEN agents on different networks should NOT be able to communicate
    log_info "Verifying isolation between networks"

    local isolated=true
    local ping_result=$(docker exec "cfn-net-test-${TASK_ID}-1" ping -c 1 -W 2 "cfn-net-test-${TASK_ID}-0" 2>/dev/null | grep -c "1 packets received" || echo 0)

    if [ "$ping_result" -eq 0 ]; then
        log_success "✓ Agents on different networks are isolated"
    else
        log_warn "✗ Network isolation breach detected"
        isolated=false
    fi

    # Cleanup
    docker rm -f "cfn-net-test-${TASK_ID}-0" "cfn-net-test-${TASK_ID}-1" 2>/dev/null || true

    if [ "$isolated" = true ]; then
        return 0
    else
        return 1
    fi
}

# ============================================================================
# Test 3: No Port Conflicts Between Agents
# ============================================================================
test_no_port_conflicts() {
    log_step "GIVEN 3 agents listening on same internal port"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN all agents listen on port 8080 internally
    log_info "Testing port conflict avoidance"

    local conflicts=0
    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-net-test-${TASK_ID}-${idx}" \
            --network "${NETWORK_NAME}" \
            alpine:latest \
            sh -c "nc -l -p 8080 -e echo 'Agent ${idx}'; sleep 30" >/dev/null 2>&1

        sleep 1

        # Verify container is running (no port conflict crash)
        local state=$(docker inspect "cfn-net-test-${TASK_ID}-${idx}" --format '{{.State.Status}}' 2>/dev/null || echo "missing")

        if [ "$state" = "running" ]; then
            log_success "✓ Agent ${idx} started on port 8080 without conflict"
        else
            log_warn "✗ Agent ${idx} failed to start (port conflict?)"
            conflicts=$((conflicts + 1))
        fi
    done

    # Cleanup
    docker rm -f "cfn-net-test-${TASK_ID}-0" "cfn-net-test-${TASK_ID}-1" "cfn-net-test-${TASK_ID}-2" 2>/dev/null || true

    if [ "$conflicts" -eq 0 ]; then
        log_success "✓ No port conflicts detected (all agents running)"
        return 0
    else
        log_error "✗ Port conflicts detected: ${conflicts}/3"
        return 1
    fi
}

# ============================================================================
# Test 4: DNS Resolution Within Network
# ============================================================================
test_dns_resolution() {
    log_step "GIVEN agents with DNS-resolvable names"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN spawning agents with predictable names
    log_info "Testing DNS resolution"

    docker run -d \
        --name "cfn-dns-test-${TASK_ID}" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sleep 30 >/dev/null 2>&1

    docker run -d \
        --name "cfn-net-test-${TASK_ID}-0" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sleep 30 >/dev/null 2>&1

    sleep 2

    # THEN agents should resolve each other by container name
    log_info "Verifying DNS resolution"

    local dns_works=$(docker exec "cfn-net-test-${TASK_ID}-0" nslookup "cfn-dns-test-${TASK_ID}" 2>/dev/null | grep -c "Name:" || echo 0)

    # Cleanup
    docker rm -f "cfn-dns-test-${TASK_ID}" "cfn-net-test-${TASK_ID}-0" 2>/dev/null || true

    if [ "$dns_works" -gt 0 ]; then
        log_success "✓ DNS resolution working within network"
        return 0
    else
        log_error "✗ DNS resolution failed"
        return 1
    fi
}

# ============================================================================
# Test 5: Network Namespace Isolation
# ============================================================================
test_network_namespace_isolation() {
    log_step "GIVEN Docker network namespaces"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN spawning agents with network isolation
    log_info "Testing network namespace isolation"

    docker run -d \
        --name "cfn-net-test-${TASK_ID}-0" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sleep 30 >/dev/null 2>&1

    sleep 1

    # THEN agents should have separate network namespaces
    local namespace_0=$(docker inspect "cfn-net-test-${TASK_ID}-0" --format '{{.NetworkSettings.SandboxKey}}' 2>/dev/null || echo "")

    # Verify namespace exists and is unique
    if [ -n "$namespace_0" ]; then
        log_success "✓ Agent 0 has isolated network namespace: ${namespace_0}"

        # Spawn second agent and verify different namespace
        docker run -d \
            --name "cfn-net-test-${TASK_ID}-1" \
            --network "${NETWORK_NAME}" \
            alpine:latest \
            sleep 30 >/dev/null 2>&1

        sleep 1

        local namespace_1=$(docker inspect "cfn-net-test-${TASK_ID}-1" --format '{{.NetworkSettings.SandboxKey}}' 2>/dev/null || echo "")

        if [ -n "$namespace_1" ] && [ "$namespace_0" != "$namespace_1" ]; then
            log_success "✓ Agent 1 has separate namespace: ${namespace_1}"
            docker rm -f "cfn-net-test-${TASK_ID}-0" "cfn-net-test-${TASK_ID}-1" 2>/dev/null || true
            return 0
        else
            log_error "✗ Namespace isolation failed (same namespace or missing)"
            docker rm -f "cfn-net-test-${TASK_ID}-0" "cfn-net-test-${TASK_ID}-1" 2>/dev/null || true
            return 1
        fi
    else
        log_error "✗ Network namespace not found"
        docker rm -f "cfn-net-test-${TASK_ID}-0" 2>/dev/null || true
        return 1
    fi
}

# ============================================================================
# Test 6: Service Discovery Pattern
# ============================================================================
test_service_discovery() {
    log_step "GIVEN agents using service discovery"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN spawning service and client containers
    log_info "Testing service discovery pattern"

    # Spawn "service" container
    docker run -d \
        --name "cfn-service-${TASK_ID}" \
        --network "${NETWORK_NAME}" \
        --network-alias "my-service" \
        alpine:latest \
        sh -c "while true; do nc -l -p 8080 -e echo 'service response'; done" >/dev/null 2>&1

    # Spawn "client" container
    docker run -d \
        --name "cfn-client-${TASK_ID}" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sleep 30 >/dev/null 2>&1

    sleep 2

    # THEN client should discover service by alias
    local service_reachable=$(docker exec "cfn-client-${TASK_ID}" ping -c 1 my-service 2>/dev/null | grep -c "1 packets received" || echo 0)

    # Cleanup
    docker rm -f "cfn-service-${TASK_ID}" "cfn-client-${TASK_ID}" 2>/dev/null || true

    if [ "$service_reachable" -gt 0 ]; then
        log_success "✓ Service discovery via network alias working"
        return 0
    else
        log_error "✗ Service discovery failed"
        return 1
    fi
}

# ============================================================================
# Execute Tests
# ============================================================================
annotate "Phase 2 :: Network Isolation Tests"

test_same_network_communication
test_separate_network_isolation
test_no_port_conflicts
test_dns_resolution
test_network_namespace_isolation
test_service_discovery

# ============================================================================
# Test Summary
# ============================================================================
annotate "Test Summary: Network Isolation"
log_info "Total tests: $TEST_TOTAL"
log_info "Passed: $TEST_PASSED"
log_info "Failed: $TEST_FAILED"

if [ "$TEST_FAILED" -eq 0 ]; then
    log_success "All network isolation tests passed"
    exit 0
else
    log_error "Some tests failed"
    exit 1
fi
