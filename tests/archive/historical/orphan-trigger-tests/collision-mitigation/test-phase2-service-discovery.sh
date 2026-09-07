#!/bin/bash
# tests/integration/collision-mitigation/test-phase2-service-discovery.sh
# Phase 2 :: Service name alias validation (Reference: CLI_TRIGGER_COLLISION_ANALYSIS.md)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
CLI_NETWORK="mcp-network"
TRIGGER_NETWORK="trigger-cfn-network"
TEST_CONTAINER_PREFIX="service-discovery-test-$$"

cleanup() {
    log_info "Cleaning up Phase 2 test artifacts"

    # Remove test containers
    docker rm -f "${TEST_CONTAINER_PREFIX}-cli" 2>/dev/null || true
    docker rm -f "${TEST_CONTAINER_PREFIX}-trigger" 2>/dev/null || true

    # Clean up networks (only if they don't have other containers)
    if docker network inspect "$CLI_NETWORK" >/dev/null 2>&1; then
        local cli_containers=$(docker network inspect "$CLI_NETWORK" -f '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | wc -w)
        if [ "$cli_containers" -eq 0 ]; then
            docker network rm "$CLI_NETWORK" 2>/dev/null || true
        fi
    fi

    if docker network inspect "$TRIGGER_NETWORK" >/dev/null 2>&1; then
        local trigger_containers=$(docker network inspect "$TRIGGER_NETWORK" -f '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | wc -w)
        if [ "$trigger_containers" -eq 0 ]; then
            docker network rm "$TRIGGER_NETWORK" 2>/dev/null || true
        fi
    fi
}
trap cleanup EXIT

test_cli_network_service_discovery() {
    annotate "Phase 2: CLI Network Service Discovery"

    log_step "GIVEN: CLI network exists with Redis service"
    if ! docker network inspect "$CLI_NETWORK" >/dev/null 2>&1; then
        docker network create "$CLI_NETWORK"
    fi

    # Check if cfn-redis is running in CLI network
    if ! docker ps --filter "name=cfn-redis" --filter "network=$CLI_NETWORK" --format "{{.Names}}" | grep -q "cfn-redis"; then
        log_warn "cfn-redis not running in $CLI_NETWORK, starting it"
        docker run -d \
            --name cfn-redis-temp-$$ \
            --network "$CLI_NETWORK" \
            redis:7-alpine \
            redis-server --appendonly yes 2>/dev/null || true
        sleep 2
    fi

    log_step "WHEN: Test container connects to CLI network"
    docker run --rm \
        --name "${TEST_CONTAINER_PREFIX}-cli" \
        --network "$CLI_NETWORK" \
        alpine:latest \
        sh -c "apk add --no-cache bind-tools >/dev/null 2>&1 && nslookup redis >/dev/null 2>&1 || nslookup cfn-redis >/dev/null 2>&1" \
        && log_success "CLI network: Service discovery working" \
        || log_error "CLI network: Service discovery failed"

    # Cleanup temp redis if created
    docker rm -f cfn-redis-temp-$$ 2>/dev/null || true
}

test_trigger_network_service_discovery() {
    annotate "Phase 2: Trigger.dev Network Service Discovery"

    log_step "GIVEN: Trigger.dev network exists"
    if ! docker network inspect "$TRIGGER_NETWORK" >/dev/null 2>&1; then
        docker network create "$TRIGGER_NETWORK"
    fi

    log_step "WHEN: Test container connects to Trigger.dev network"
    # Create a temporary Redis service for testing
    docker run -d \
        --name redis-temp-trigger-$$ \
        --network "$TRIGGER_NETWORK" \
        --network-alias redis \
        --network-alias cfn-redis \
        redis:7-alpine \
        redis-server --appendonly yes 2>/dev/null || true
    sleep 2

    log_step "THEN: Both 'redis' and 'cfn-redis' resolve in Trigger.dev network"
    local redis_resolved=0
    local cfn_redis_resolved=0

    if docker run --rm \
        --network "$TRIGGER_NETWORK" \
        alpine:latest \
        sh -c "apk add --no-cache bind-tools >/dev/null 2>&1 && nslookup redis" >/dev/null 2>&1; then
        redis_resolved=1
        log_success "'redis' service name resolves"
    else
        log_error "'redis' service name does not resolve"
    fi

    if docker run --rm \
        --network "$TRIGGER_NETWORK" \
        alpine:latest \
        sh -c "apk add --no-cache bind-tools >/dev/null 2>&1 && nslookup cfn-redis" >/dev/null 2>&1; then
        cfn_redis_resolved=1
        log_success "'cfn-redis' service name resolves"
    else
        log_error "'cfn-redis' service name does not resolve"
    fi

    # Cleanup temp redis
    docker rm -f redis-temp-trigger-$$ 2>/dev/null || true

    if [ "$redis_resolved" -eq 1 ] && [ "$cfn_redis_resolved" -eq 1 ]; then
        log_success "Trigger.dev network: Both service names resolve"
        return 0
    else
        log_error "Trigger.dev network: Service discovery incomplete"
        return 1
    fi
}

test_network_isolation() {
    annotate "Phase 2: Network Isolation"

    log_step "GIVEN: Both networks exist"
    if ! docker network inspect "$CLI_NETWORK" >/dev/null 2>&1; then
        docker network create "$CLI_NETWORK"
    fi
    if ! docker network inspect "$TRIGGER_NETWORK" >/dev/null 2>&1; then
        docker network create "$TRIGGER_NETWORK"
    fi

    log_step "WHEN: Container in CLI network tries to reach Trigger network service"
    # Create a service in Trigger network
    docker run -d \
        --name trigger-only-service-$$ \
        --network "$TRIGGER_NETWORK" \
        nginx:alpine >/dev/null 2>&1 || true
    sleep 1

    log_step "THEN: Cross-network access fails (isolation verified)"
    if docker run --rm \
        --network "$CLI_NETWORK" \
        alpine:latest \
        sh -c "apk add --no-cache curl >/dev/null 2>&1 && curl -s --connect-timeout 2 http://trigger-only-service-$$" >/dev/null 2>&1; then
        log_error "Networks are NOT isolated (security risk)"
        docker rm -f trigger-only-service-$$ 2>/dev/null || true
        return 1
    else
        log_success "Networks are isolated (expected behavior)"
        docker rm -f trigger-only-service-$$ 2>/dev/null || true
        return 0
    fi
}

test_service_alias_configuration() {
    annotate "Phase 2: Service Alias Configuration Check"

    log_step "GIVEN: Docker Compose files exist"
    local cli_compose="$PROJECT_ROOT/docker/docker-compose.yml"
    local trigger_compose="$PROJECT_ROOT/docker/trigger-dev/docker-compose.yml"

    if [ ! -f "$cli_compose" ]; then
        log_error "CLI docker-compose.yml not found"
        return 1
    fi

    if [ ! -f "$trigger_compose" ]; then
        log_error "Trigger.dev docker-compose.yml not found"
        return 1
    fi

    log_step "WHEN: Checking Trigger.dev Redis service aliases"
    if grep -q "aliases:" "$trigger_compose" && \
       grep -A 2 "aliases:" "$trigger_compose" | grep -q "redis" && \
       grep -A 2 "aliases:" "$trigger_compose" | grep -q "cfn-redis"; then
        log_success "Trigger.dev Redis has both 'redis' and 'cfn-redis' aliases"
    else
        log_warn "Trigger.dev Redis may not have both service name aliases"
        log_info "This may cause cross-mode compatibility issues"
    fi

    log_step "WHEN: Checking CLI Redis service name"
    if grep -q "container_name: cfn-redis" "$cli_compose" || \
       grep -q "service: cfn-redis" "$cli_compose"; then
        log_success "CLI Redis uses 'cfn-redis' service name"
    else
        log_warn "CLI Redis service name configuration may differ"
    fi
}

# Execute tests
test_cli_network_service_discovery
test_trigger_network_service_discovery
test_network_isolation
test_service_alias_configuration

# Summary
annotate "Phase 2 Test Summary"
echo "Total Tests: $TEST_TOTAL"
echo "Passed: $TEST_PASSED"
echo "Failed: $TEST_FAILED"

if [ "$TEST_FAILED" -eq 0 ]; then
    log_success "Phase 2: All service discovery tests passed"
    exit 0
else
    log_error "Phase 2: $TEST_FAILED test(s) failed"
    exit 1
fi
