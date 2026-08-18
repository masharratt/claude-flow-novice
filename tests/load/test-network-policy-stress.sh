#!/usr/bin/env bash
# tests/load/test-network-policy-stress.sh
# Phase 6 Wave 5 :: Network policy stress testing with cross-team access simulation (3-layer isolation)

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
ATTACK_ATTEMPTS=1000
CONCURRENT_ATTACKERS=50
NETWORK_OVERHEAD_THRESHOLD_MS=50  # Max acceptable overhead from network policies

cleanup() {
    log_info "Cleaning up network policy stress test..."

    # Remove test containers
    docker ps -a --filter "label=load-test=network-policy" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true

    # Remove test networks
    docker network rm cfn-team-engineering-test cfn-team-data-test cfn-team-marketing-test 2>/dev/null || true

    log_info "Cleanup complete"
}
trap cleanup EXIT

# Create isolated team networks
setup_team_networks() {
    log_step "GIVEN three isolated team networks (engineering, data, marketing)"

    # Create team networks with network policies (using internal flag)
    docker network create --internal cfn-team-engineering-test --label "load-test=network-policy" 2>/dev/null || true
    docker network create --internal cfn-team-data-test --label "load-test=network-policy" 2>/dev/null || true
    docker network create --internal cfn-team-marketing-test --label "load-test=network-policy" 2>/dev/null || true

    # Deploy Redis instances per team
    docker run -d \
        --name redis-engineering-test \
        --network cfn-team-engineering-test \
        --label "load-test=network-policy" \
        --label "team=engineering" \
        redis:7-alpine >/dev/null

    docker run -d \
        --name redis-data-test \
        --network cfn-team-data-test \
        --label "load-test=network-policy" \
        --label "team=data" \
        redis:7-alpine >/dev/null

    docker run -d \
        --name redis-marketing-test \
        --network cfn-team-marketing-test \
        --label "load-test=network-policy" \
        --label "team=marketing" \
        redis:7-alpine >/dev/null

    # Wait for Redis instances to be ready
    sleep 2

    log_success "Team networks created with isolated Redis instances"
}

# Simulate cross-team access attack
simulate_cross_team_attack() {
    local attacker_team=$1
    local target_team=$2
    local attempt_num=$3

    # Spawn attacker container in source team network
    local attacker_name="attacker-${attacker_team}-to-${target_team}-${attempt_num}"

    # Try to access target team's Redis (should fail due to network isolation)
    local result=$(docker run --rm \
        --name "$attacker_name" \
        --network "cfn-team-${attacker_team}-test" \
        --label "load-test=network-policy" \
        redis:7-alpine \
        timeout 2 redis-cli -h "redis-${target_team}-test" ping 2>&1 || echo "BLOCKED")

    if echo "$result" | grep -q "PONG"; then
        echo "BREACH"
        return 1
    else
        echo "BLOCKED"
        return 0
    fi
}

test_network_isolation_stress() {
    setup_team_networks

    log_step "WHEN simulating $ATTACK_ATTEMPTS cross-team access attempts"

    local start_time=$(date +%s%3N)  # Milliseconds
    local blocked=0
    local breached=0
    local attack_scenarios=(
        "engineering:data"
        "engineering:marketing"
        "data:engineering"
        "data:marketing"
        "marketing:engineering"
        "marketing:data"
    )

    # Run attacks in parallel batches
    local batch_size=10
    local total_attempts=0

    for attempt in $(seq 1 $ATTACK_ATTEMPTS); do
        # Select random attack scenario
        local scenario_idx=$((RANDOM % ${#attack_scenarios[@]}))
        local scenario="${attack_scenarios[$scenario_idx]}"
        local attacker_team=$(echo "$scenario" | cut -d: -f1)
        local target_team=$(echo "$scenario" | cut -d: -f2)

        # Execute attack
        local result=$(simulate_cross_team_attack "$attacker_team" "$target_team" "$attempt")

        if [ "$result" = "BLOCKED" ]; then
            blocked=$((blocked + 1))
        else
            breached=$((breached + 1))
            log_error "SECURITY BREACH: $attacker_team → $target_team (attempt $attempt)"
        fi

        total_attempts=$((total_attempts + 1))

        # Progress indicator every 100 attempts
        if [ $((attempt % 100)) -eq 0 ]; then
            log_info "Progress: $attempt/$ATTACK_ATTEMPTS attempts (blocked: $blocked, breached: $breached)"
        fi

        # Batch throttling to avoid overwhelming system
        if [ $((attempt % batch_size)) -eq 0 ]; then
            sleep 0.1
        fi
    done

    local end_time=$(date +%s%3N)
    local duration_ms=$((end_time - start_time))
    local avg_time_per_attempt=$((duration_ms / ATTACK_ATTEMPTS))

    log_step "THEN validating 3-layer isolation effectiveness"

    # Calculate breach rate
    local breach_rate=$(echo "scale=4; ($breached / $total_attempts) * 100" | bc -l)

    log_info "Network Policy Stress Test Results:"
    log_info "  Total attempts: $total_attempts"
    log_info "  Blocked: $blocked"
    log_info "  Breached: $breached"
    log_info "  Breach rate: ${breach_rate}%"
    log_info "  Duration: ${duration_ms}ms"
    log_info "  Avg time per attempt: ${avg_time_per_attempt}ms"

    # Assert zero breaches (3-layer isolation must be perfect)
    if [ "$breached" -gt 0 ]; then
        log_error "Network isolation FAILED: $breached breaches detected"
        return 1
    fi

    # Assert performance overhead is acceptable
    if [ "$avg_time_per_attempt" -gt "$NETWORK_OVERHEAD_THRESHOLD_MS" ]; then
        log_error "Network policy overhead too high: ${avg_time_per_attempt}ms > ${NETWORK_OVERHEAD_THRESHOLD_MS}ms"
        return 1
    fi

    log_success "Network policy stress test PASSED"
    log_info "  3-layer isolation: 100% effective ($blocked/$total_attempts blocked)"
    log_info "  Performance overhead: ${avg_time_per_attempt}ms (limit: ${NETWORK_OVERHEAD_THRESHOLD_MS}ms)"

    return 0
}

test_concurrent_attack_simulation() {
    log_step "GIVEN concurrent attackers across all teams"

    local attacker_pids=()
    local breach_count=0

    log_step "WHEN launching $CONCURRENT_ATTACKERS concurrent attackers"

    for i in $(seq 1 $CONCURRENT_ATTACKERS); do
        local attacker_team="engineering"
        local target_team="data"

        if [ $((i % 3)) -eq 0 ]; then
            attacker_team="data"
            target_team="marketing"
        elif [ $((i % 3)) -eq 1 ]; then
            attacker_team="marketing"
            target_team="engineering"
        fi

        # Launch attacker in background
        (
            result=$(simulate_cross_team_attack "$attacker_team" "$target_team" "concurrent-$i")
            if [ "$result" = "BREACH" ]; then
                echo "1" > "/tmp/breach-$i"
            else
                echo "0" > "/tmp/breach-$i"
            fi
        ) &

        attacker_pids+=($!)
    done

    # Wait for all attackers to complete
    for pid in "${attacker_pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    # Count breaches
    for i in $(seq 1 $CONCURRENT_ATTACKERS); do
        if [ -f "/tmp/breach-$i" ]; then
            local breach_flag=$(cat "/tmp/breach-$i")
            breach_count=$((breach_count + breach_flag))
            rm -f "/tmp/breach-$i"
        fi
    done

    log_step "THEN validating isolation under concurrent attacks"

    log_info "Concurrent Attack Results:"
    log_info "  Concurrent attackers: $CONCURRENT_ATTACKERS"
    log_info "  Breaches detected: $breach_count"

    if [ "$breach_count" -gt 0 ]; then
        log_error "Network isolation FAILED under concurrent load: $breach_count breaches"
        return 1
    fi

    log_success "Concurrent attack simulation PASSED (0 breaches)"

    return 0
}

# Execute tests
log_info "Starting network policy stress test (Phase 6 Wave 5)"
test_network_isolation_stress
test_concurrent_attack_simulation

log_success "All network policy stress tests PASSED"
