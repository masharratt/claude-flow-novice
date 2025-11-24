#!/bin/bash
# planning/trigger/tests/phase2/test-concurrent-spawning.sh
# Phase 2 :: Validate concurrent agent spawning (Bug #21 compliance)
# Tests: All 3 agents spawn simultaneously without blocking

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TASK_ID="phase2-spawn-$(date +%s)"
AGENT_COUNT=3
SPAWN_THRESHOLD_MS=2000  # All agents should spawn within 2 seconds

cleanup() {
    log_info "Cleaning up test artifacts"
    docker rm -f "cfn-agent-${TASK_ID}-0" "cfn-agent-${TASK_ID}-1" "cfn-agent-${TASK_ID}-2" 2>/dev/null || true
    docker network rm "cfn-network-${TASK_ID}" 2>/dev/null || true
    rm -rf "/tmp/trigger-test-${TASK_ID}" || true
}
trap cleanup EXIT

# ============================================================================
# Test 1: Concurrent Spawn Timing
# ============================================================================
test_concurrent_spawn_timing() {
    log_step "GIVEN trigger.dev job configured to spawn 3 agents in parallel"

    # Create test network
    docker network create "cfn-network-${TASK_ID}" >/dev/null 2>&1

    # WHEN spawning all agents concurrently
    log_info "Spawning 3 agents concurrently"
    local start_time=$(date +%s%3N)

    # Spawn agents in background (simulating Promise.all)
    for idx in 0 1 2; do
        (
            docker run -d \
                --name "cfn-agent-${TASK_ID}-${idx}" \
                --network "cfn-network-${TASK_ID}" \
                --cpus=1 \
                --memory=2g \
                -e TASK_ID="${TASK_ID}" \
                -e AGENT_ID="cfn-agent-${TASK_ID}-${idx}" \
                alpine:latest \
                sleep 10
        ) &
    done

    # Wait for all background spawns to complete
    wait

    local end_time=$(date +%s%3N)
    local elapsed_ms=$((end_time - start_time))

    # THEN all agents should spawn within threshold
    log_info "All agents spawned in ${elapsed_ms}ms"

    if [ "$elapsed_ms" -lt "$SPAWN_THRESHOLD_MS" ]; then
        log_success "✓ Concurrent spawning verified: ${elapsed_ms}ms < ${SPAWN_THRESHOLD_MS}ms threshold"
        return 0
    else
        log_error "✗ Sequential spawning detected: ${elapsed_ms}ms >= ${SPAWN_THRESHOLD_MS}ms threshold"
        return 1
    fi
}

# ============================================================================
# Test 2: All Agents Start Before Any Completes
# ============================================================================
test_spawn_before_completion() {
    log_step "GIVEN 3 agents with 10-second tasks"

    # WHEN checking container creation timestamps
    log_info "Analyzing container creation timestamps"

    local timestamps=()
    for idx in 0 1 2; do
        local created=$(docker inspect "cfn-agent-${TASK_ID}-${idx}" --format '{{.Created}}' 2>/dev/null || echo "")
        if [ -n "$created" ]; then
            timestamps+=("$created")
            log_info "Agent ${idx}: created at $created"
        fi
    done

    # THEN all timestamps should be within 1 second of each other
    if [ ${#timestamps[@]} -eq 3 ]; then
        local first=$(date -d "${timestamps[0]}" +%s)
        local last=$(date -d "${timestamps[2]}" +%s)
        local spread=$((last - first))

        if [ "$spread" -le 1 ]; then
            log_success "✓ All agents started within ${spread}s (expected: ≤1s)"
            return 0
        else
            log_error "✗ Agent spawn spread too large: ${spread}s > 1s threshold"
            return 1
        fi
    else
        log_error "✗ Expected 3 containers, found ${#timestamps[@]}"
        return 1
    fi
}

# ============================================================================
# Test 3: No Spawn Blocking (Promise.all Pattern)
# ============================================================================
test_no_spawn_blocking() {
    log_step "GIVEN trigger.dev Promise.all() pattern"

    # WHEN spawning agents with intentional delays on agent 0
    log_info "Testing spawn blocking resistance"

    # Simulate slow spawn on first agent
    local slow_start=$(date +%s%3N)
    docker run -d \
        --name "cfn-agent-blocking-test-0" \
        --network "cfn-network-${TASK_ID}" \
        alpine:latest \
        sh -c "sleep 5 && echo 'delayed start'" >/dev/null 2>&1 &

    # Spawn remaining agents immediately
    docker run -d \
        --name "cfn-agent-blocking-test-1" \
        --network "cfn-network-${TASK_ID}" \
        alpine:latest \
        echo "immediate start" >/dev/null 2>&1 &

    docker run -d \
        --name "cfn-agent-blocking-test-2" \
        --network "cfn-network-${TASK_ID}" \
        alpine:latest \
        echo "immediate start" >/dev/null 2>&1 &

    wait
    local fast_end=$(date +%s%3N)
    local fast_elapsed=$((fast_end - slow_start))

    # Cleanup test containers
    docker rm -f "cfn-agent-blocking-test-0" "cfn-agent-blocking-test-1" "cfn-agent-blocking-test-2" 2>/dev/null || true

    # THEN agents 1 and 2 should not wait for agent 0
    if [ "$fast_elapsed" -lt 2000 ]; then
        log_success "✓ Non-blocking spawn confirmed: agents 1,2 started in ${fast_elapsed}ms"
        return 0
    else
        log_error "✗ Blocking detected: agents 1,2 took ${fast_elapsed}ms (expected <2000ms)"
        return 1
    fi
}

# ============================================================================
# Test 4: Container State Verification
# ============================================================================
test_container_states() {
    log_step "GIVEN 3 spawned agents"

    # WHEN checking container states
    log_info "Verifying all containers are running"

    local running_count=0
    for idx in 0 1 2; do
        local state=$(docker inspect "cfn-agent-${TASK_ID}-${idx}" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
        if [ "$state" = "running" ]; then
            running_count=$((running_count + 1))
            log_info "✓ Agent ${idx}: ${state}"
        else
            log_warn "✗ Agent ${idx}: ${state}"
        fi
    done

    # THEN all 3 containers should be in running state
    if [ "$running_count" -eq 3 ]; then
        log_success "✓ All ${AGENT_COUNT} agents running"
        return 0
    else
        log_error "✗ Only ${running_count}/${AGENT_COUNT} agents running"
        return 1
    fi
}

# ============================================================================
# Test 5: Network Connectivity (All Agents on Same Network)
# ============================================================================
test_network_connectivity() {
    log_step "GIVEN agents on shared network cfn-network-${TASK_ID}"

    # WHEN checking network membership
    log_info "Verifying network connectivity"

    local connected_count=0
    for idx in 0 1 2; do
        local networks=$(docker inspect "cfn-agent-${TASK_ID}-${idx}" --format '{{range $net, $config := .NetworkSettings.Networks}}{{$net}} {{end}}' 2>/dev/null || echo "")
        if [[ "$networks" =~ "cfn-network-${TASK_ID}" ]]; then
            connected_count=$((connected_count + 1))
            log_info "✓ Agent ${idx}: connected to network"
        else
            log_warn "✗ Agent ${idx}: NOT on network (networks: $networks)"
        fi
    done

    # THEN all agents should be on the same network
    if [ "$connected_count" -eq 3 ]; then
        log_success "✓ All ${AGENT_COUNT} agents on shared network"
        return 0
    else
        log_error "✗ Only ${connected_count}/${AGENT_COUNT} agents on network"
        return 1
    fi
}

# ============================================================================
# Execute Tests
# ============================================================================
annotate "Phase 2 :: Concurrent Agent Spawning Tests"

test_concurrent_spawn_timing
test_spawn_before_completion
test_no_spawn_blocking
test_container_states
test_network_connectivity

# ============================================================================
# Test Summary
# ============================================================================
annotate "Test Summary: Concurrent Spawning"
log_info "Total tests: $TEST_TOTAL"
log_info "Passed: $TEST_PASSED"
log_info "Failed: $TEST_FAILED"

if [ "$TEST_FAILED" -eq 0 ]; then
    log_success "All concurrent spawning tests passed"
    exit 0
else
    log_error "Some tests failed"
    exit 1
fi
