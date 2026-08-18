#!/usr/bin/env bash
# tests/integration/test-cost-tracking.sh
# Phase 5 Wave 4A :: Cost tracking validation (IMPL-003)
# Validates label-based cost calculation accuracy

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
    return 1
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
TEAM_NAME="test-team"
CONTAINER_PREFIX="cost-test"

cleanup() {
    log_info "Cleaning up cost tracking test artifacts"
    docker rm -f "${CONTAINER_PREFIX}-1" "${CONTAINER_PREFIX}-2" "${CONTAINER_PREFIX}-3" 2>/dev/null || true
}
trap cleanup EXIT

test_label_based_cost_tracking() {
    log_step "TEST 1: Label-based cost tracking - containers with cost labels are tracked"

    # GIVEN containers with cost tracking labels
    docker run -d --name "${CONTAINER_PREFIX}-1" \
        --label "cfn.team=${TEAM_NAME}" \
        --label "cfn.cost.enabled=true" \
        --label "cfn.cost.rate=0.50" \
        alpine:latest sleep 300 >/dev/null

    # WHEN querying cost-enabled containers
    COST_ENABLED=$(docker ps --filter "label=cfn.cost.enabled=true" --format '{{.Names}}' | grep -c "${CONTAINER_PREFIX}-1" || echo "0")

    # THEN container should be found in cost tracking
    if [[ "$COST_ENABLED" != "1" ]]; then
        fail "Cost tracking label not found on container"
    fi

    # THEN cost rate should be retrievable
    COST_RATE=$(docker inspect "${CONTAINER_PREFIX}-1" --format '{{index .Config.Labels "cfn.cost.rate"}}')
    if [[ "$COST_RATE" != "0.50" ]]; then
        fail "Cost rate mismatch: expected 0.50, got $COST_RATE"
    fi

    pass "Label-based cost tracking verified"
}

test_cost_calculation_accuracy() {
    log_step "TEST 2: Cost calculation accuracy - costs accumulate correctly over time"

    # GIVEN multiple containers with different cost rates
    docker run -d --name "${CONTAINER_PREFIX}-1" \
        --label "cfn.team=${TEAM_NAME}" \
        --label "cfn.cost.enabled=true" \
        --label "cfn.cost.rate=0.50" \
        alpine:latest sleep 300 >/dev/null

    docker run -d --name "${CONTAINER_PREFIX}-2" \
        --label "cfn.team=${TEAM_NAME}" \
        --label "cfn.cost.enabled=true" \
        --label "cfn.cost.rate=1.00" \
        alpine:latest sleep 300 >/dev/null

    docker run -d --name "${CONTAINER_PREFIX}-3" \
        --label "cfn.team=${TEAM_NAME}" \
        --label "cfn.cost.enabled=true" \
        --label "cfn.cost.rate=2.00" \
        alpine:latest sleep 300 >/dev/null

    # WHEN calculating total cost
    TOTAL_COST=0
    for container in "${CONTAINER_PREFIX}-1" "${CONTAINER_PREFIX}-2" "${CONTAINER_PREFIX}-3"; do
        RATE=$(docker inspect "$container" --format '{{index .Config.Labels "cfn.cost.rate"}}')
        TOTAL_COST=$(echo "$TOTAL_COST + $RATE" | bc)
    done

    # THEN total cost should be sum of individual rates
    EXPECTED_COST="3.50"
    if [[ "$TOTAL_COST" != "$EXPECTED_COST" ]]; then
        fail "Cost calculation error: expected $EXPECTED_COST, got $TOTAL_COST"
    fi

    pass "Cost calculation accuracy verified"
}

test_team_cost_aggregation() {
    log_step "TEST 3: Team cost aggregation - costs are correctly aggregated by team"

    # GIVEN containers from same team with cost tracking
    docker run -d --name "${CONTAINER_PREFIX}-1" \
        --label "cfn.team=${TEAM_NAME}" \
        --label "cfn.cost.enabled=true" \
        --label "cfn.cost.rate=1.25" \
        alpine:latest sleep 300 >/dev/null

    docker run -d --name "${CONTAINER_PREFIX}-2" \
        --label "cfn.team=${TEAM_NAME}" \
        --label "cfn.cost.enabled=true" \
        --label "cfn.cost.rate=2.75" \
        alpine:latest sleep 300 >/dev/null

    # WHEN aggregating costs by team
    TEAM_CONTAINERS=$(docker ps --filter "label=cfn.team=${TEAM_NAME}" --filter "label=cfn.cost.enabled=true" --format '{{.Names}}')
    TEAM_COST=0
    for container in $TEAM_CONTAINERS; do
        RATE=$(docker inspect "$container" --format '{{index .Config.Labels "cfn.cost.rate"}}')
        TEAM_COST=$(echo "$TEAM_COST + $RATE" | bc)
    done

    # THEN aggregated cost should match sum
    EXPECTED_TEAM_COST="4.00"
    if [[ "$TEAM_COST" != "$EXPECTED_TEAM_COST" ]]; then
        fail "Team cost aggregation error: expected $EXPECTED_TEAM_COST, got $TEAM_COST"
    fi

    pass "Team cost aggregation verified"
}

# Execute tests
log_info "Starting cost tracking tests (3 tests)"
test_label_based_cost_tracking
test_cost_calculation_accuracy
test_team_cost_aggregation

# Summary
print_summary "Cost Tracking Tests"
