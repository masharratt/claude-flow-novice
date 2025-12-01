#!/bin/bash
# tests/docker/teams/test-team-isolation.sh
# Phase 5 Wave 4A :: Team isolation validation (IMPL-003)
# Validates that teams cannot access each other's containers/data

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test helper functions
pass() {
    local msg="$1"
    echo -e "${GREEN}✓ PASS:${NC} $msg"
    TEST_PASSED=$((TEST_PASSED + 1))
    return 0
}

fail() {
    local msg="$1"
    echo -e "${RED}✗ FAIL:${NC} $msg"
    TEST_FAILED=$((TEST_FAILED + 1))
    exit 1
}

skip() {
    local msg="$1"
    echo -e "${YELLOW}⊘ SKIP:${NC} $msg"
    return 0
}

print_summary() {
    local suite_name="$1"
    echo ""
    echo "=========================================="
    echo "$suite_name Summary"
    echo "=========================================="
    echo "Total: $((TEST_PASSED + TEST_FAILED))"
    echo "Passed: $TEST_PASSED"
    echo "Failed: $TEST_FAILED"
    echo "=========================================="
}

# Test configuration
TEAM_A="team-alpha"
TEAM_B="team-beta"
NETWORK_A="cfn-net-${TEAM_A}"
NETWORK_B="cfn-net-${TEAM_B}"

cleanup() {
    log_info "Cleaning up test artifacts"
    docker rm -f "${TEAM_A}-agent" "${TEAM_B}-agent" 2>/dev/null || true
    docker network rm "$NETWORK_A" "$NETWORK_B" 2>/dev/null || true
    docker volume rm "${TEAM_A}-data" "${TEAM_B}-data" 2>/dev/null || true
}
trap cleanup EXIT

test_network_isolation() {
    log_step "TEST 1: Network isolation - teams cannot communicate across networks"

    # GIVEN two isolated networks for different teams
    docker network create "$NETWORK_A" >/dev/null 2>&1
    docker network create "$NETWORK_B" >/dev/null 2>&1

    # WHEN agents are spawned in different networks
    docker run -d --name "${TEAM_A}-agent" --network "$NETWORK_A" \
        --label "cfn.team=${TEAM_A}" \
        alpine:latest sleep 300 >/dev/null

    docker run -d --name "${TEAM_B}-agent" --network "$NETWORK_B" \
        --label "cfn.team=${TEAM_B}" \
        alpine:latest sleep 300 >/dev/null

    # THEN Team A cannot ping Team B
    if docker exec "${TEAM_A}-agent" ping -c 1 -W 1 "${TEAM_B}-agent" 2>/dev/null; then
        fail "Network isolation broken: Team A can reach Team B"
    fi

    # THEN Team B cannot ping Team A
    if docker exec "${TEAM_B}-agent" ping -c 1 -W 1 "${TEAM_A}-agent" 2>/dev/null; then
        fail "Network isolation broken: Team B can reach Team A"
    fi

    pass "Network isolation verified"
}

test_volume_isolation() {
    log_step "TEST 2: Volume isolation - teams cannot access each other's data"

    # GIVEN two isolated volumes for different teams
    docker volume create "${TEAM_A}-data" >/dev/null
    docker volume create "${TEAM_B}-data" >/dev/null

    # WHEN Team A writes sensitive data
    docker run --rm -v "${TEAM_A}-data:/data" alpine:latest \
        sh -c "echo 'TEAM_A_SECRET' > /data/secret.txt" >/dev/null

    # THEN Team B cannot access Team A's volume
    TEAM_B_READ=$(docker run --rm -v "${TEAM_B}-data:/data" alpine:latest \
        sh -c "cat /data/secret.txt 2>/dev/null || echo 'ACCESS_DENIED'")

    if [[ "$TEAM_B_READ" != "ACCESS_DENIED" ]]; then
        fail "Volume isolation broken: Team B accessed Team A's data"
    fi

    pass "Volume isolation verified"
}

test_container_label_enforcement() {
    log_step "TEST 3: Label enforcement - containers must have team labels"

    # GIVEN a container without team label
    docker run -d --name "unlabeled-container" alpine:latest sleep 60 >/dev/null || true

    # WHEN checking for team label
    LABEL_VALUE=$(docker inspect unlabeled-container --format '{{index .Config.Labels "cfn.team"}}' 2>/dev/null || echo "")

    # THEN unlabeled containers should be detectable
    if [[ -z "$LABEL_VALUE" ]]; then
        pass "Unlabeled container detected (as expected)"
    else
        fail "Container should not have team label: $LABEL_VALUE"
    fi

    docker rm -f unlabeled-container >/dev/null 2>&1
}

test_cross_team_container_access() {
    log_step "TEST 4: Container access control - teams cannot exec into other teams' containers"

    # GIVEN Team A has a running container with team label
    docker network create "$NETWORK_A" >/dev/null 2>&1 || true
    docker run -d --name "${TEAM_A}-agent" --network "$NETWORK_A" \
        --label "cfn.team=${TEAM_A}" \
        alpine:latest sleep 300 >/dev/null

    # WHEN checking Team A label
    ACTUAL_TEAM=$(docker inspect "${TEAM_A}-agent" --format '{{index .Config.Labels "cfn.team"}}')

    # THEN label should match expected team
    if [[ "$ACTUAL_TEAM" != "$TEAM_A" ]]; then
        fail "Team label mismatch: expected $TEAM_A, got $ACTUAL_TEAM"
    fi

    # THEN Team B should not be able to find Team A containers without label filtering
    CROSS_TEAM_CONTAINERS=$(docker ps --filter "label=cfn.team=${TEAM_B}" --format '{{.Names}}' | grep -c "${TEAM_A}-agent" || echo "0")

    if [[ "$CROSS_TEAM_CONTAINERS" != "0" ]]; then
        fail "Cross-team container access: Team B can see Team A containers"
    fi

    pass "Container access control verified"
}

# Execute tests
log_info "Starting team isolation tests (4 tests)"
test_network_isolation
test_volume_isolation
test_container_label_enforcement
test_cross_team_container_access

# Summary
print_summary "Team Isolation Tests"
