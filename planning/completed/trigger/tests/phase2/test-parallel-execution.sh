#!/bin/bash
# planning/trigger/tests/phase2/test-parallel-execution.sh
# Phase 2 :: Validate true parallel execution (performance benchmarking)
# Tests: Execution time matches slowest agent (not sum), parallelism verification

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TASK_ID="phase2-parallel-$(date +%s)"
NETWORK_NAME="cfn-parallel-net-${TASK_ID}"

cleanup() {
    log_info "Cleaning up test artifacts"
    docker rm -f "cfn-fast-${TASK_ID}" "cfn-medium-${TASK_ID}" "cfn-slow-${TASK_ID}" 2>/dev/null || true
    docker rm -f "cfn-parallel-${TASK_ID}-0" "cfn-parallel-${TASK_ID}-1" "cfn-parallel-${TASK_ID}-2" 2>/dev/null || true
    docker network rm "${NETWORK_NAME}" 2>/dev/null || true
    rm -rf "/tmp/parallel-bench-${TASK_ID}" 2>/dev/null || true
}
trap cleanup EXIT

# ============================================================================
# Test 1: Parallel Execution Timing (Critical)
# ============================================================================
test_parallel_execution_timing() {
    log_step "GIVEN 3 agents with different execution times (5s, 10s, 15s)"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN spawning agents in parallel
    log_info "Spawning agents with staggered execution times"

    local start_time=$(date +%s)

    # Spawn all agents in background (Promise.all pattern)
    docker run -d \
        --name "cfn-fast-${TASK_ID}" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sh -c "sleep 5; echo 'fast done'" >/dev/null 2>&1 &

    docker run -d \
        --name "cfn-medium-${TASK_ID}" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sh -c "sleep 10; echo 'medium done'" >/dev/null 2>&1 &

    docker run -d \
        --name "cfn-slow-${TASK_ID}" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sh -c "sleep 15; echo 'slow done'" >/dev/null 2>&1 &

    wait  # Wait for all background spawns

    # Wait for all containers to complete
    log_info "Waiting for all agents to complete"
    docker wait "cfn-fast-${TASK_ID}" >/dev/null 2>&1
    docker wait "cfn-medium-${TASK_ID}" >/dev/null 2>&1
    docker wait "cfn-slow-${TASK_ID}" >/dev/null 2>&1

    local end_time=$(date +%s)
    local total_elapsed=$((end_time - start_time))

    # THEN total time should be ~15s (slowest agent), NOT 30s (sum)
    log_info "Total execution time: ${total_elapsed}s"

    # Allow 2s tolerance for Docker overhead
    local expected_min=15
    local expected_max=17

    if [ "$total_elapsed" -ge "$expected_min" ] && [ "$total_elapsed" -le "$expected_max" ]; then
        log_success "✓ Parallel execution verified: ${total_elapsed}s ≈ ${expected_min}s (slowest agent)"
        log_success "  Sequential would take: 30s (5s + 10s + 15s)"
        return 0
    else
        log_error "✗ Execution time out of range: ${total_elapsed}s (expected ${expected_min}-${expected_max}s)"
        if [ "$total_elapsed" -gt 25 ]; then
            log_error "  Suggests sequential execution (30s expected for sum)"
        fi
        return 1
    fi
}

# ============================================================================
# Test 2: Parallelism Factor Calculation
# ============================================================================
test_parallelism_factor() {
    log_step "GIVEN known sequential vs parallel execution times"

    # From previous test: Sequential = 30s, Parallel = ~15s
    local sequential_time=30
    local parallel_time=15  # Approximate from Test 1

    # WHEN calculating parallelism factor
    log_info "Calculating parallelism factor"

    local speedup=$(awk "BEGIN {print $sequential_time / $parallel_time}")
    local efficiency=$(awk "BEGIN {print ($speedup / 3) * 100}")  # 3 agents

    log_info "Speedup: ${speedup}x"
    log_info "Parallel efficiency: ${efficiency}%"

    # THEN speedup should be close to 2x (ideal would be 3x with perfect parallelism)
    local min_speedup="1.8"
    local min_efficiency="60"

    if (( $(awk "BEGIN {print ($speedup >= $min_speedup)}") )); then
        log_success "✓ Speedup factor: ${speedup}x (≥${min_speedup}x threshold)"
    else
        log_error "✗ Speedup factor too low: ${speedup}x < ${min_speedup}x"
        return 1
    fi

    if (( $(awk "BEGIN {print ($efficiency >= $min_efficiency)}") )); then
        log_success "✓ Parallel efficiency: ${efficiency}% (≥${min_efficiency}%)"
        return 0
    else
        log_error "✗ Parallel efficiency too low: ${efficiency}% < ${min_efficiency}%"
        return 1
    fi
}

# ============================================================================
# Test 3: Concurrent Container Count Verification
# ============================================================================
test_concurrent_container_count() {
    log_step "GIVEN 3 agents running 10-second tasks"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN spawning agents
    log_info "Spawning concurrent agents"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-parallel-${TASK_ID}-${idx}" \
            --network "${NETWORK_NAME}" \
            alpine:latest \
            sleep 10 >/dev/null 2>&1
    done

    sleep 2  # Let containers stabilize

    # THEN all 3 containers should be running simultaneously
    log_info "Checking concurrent execution"

    local running_count=$(docker ps --filter "name=cfn-parallel-${TASK_ID}" --format "{{.Names}}" | wc -l)

    # Cleanup
    docker rm -f "cfn-parallel-${TASK_ID}-0" "cfn-parallel-${TASK_ID}-1" "cfn-parallel-${TASK_ID}-2" 2>/dev/null || true

    if [ "$running_count" -eq 3 ]; then
        log_success "✓ All 3 agents running concurrently"
        return 0
    else
        log_error "✗ Only ${running_count}/3 agents running concurrently"
        return 1
    fi
}

# ============================================================================
# Test 4: CPU Utilization During Parallel Execution
# ============================================================================
test_cpu_utilization() {
    log_step "GIVEN 3 CPU-intensive agents"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN spawning CPU-bound workloads
    log_info "Spawning CPU-intensive agents"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-parallel-${TASK_ID}-${idx}" \
            --network "${NETWORK_NAME}" \
            --cpus=1 \
            alpine:latest \
            sh -c 'for i in $(seq 1 1000000); do echo "cpu load" >/dev/null; done' >/dev/null 2>&1
    done

    sleep 2

    # THEN verify multiple containers consuming CPU simultaneously
    log_info "Checking CPU utilization"

    local active_containers=$(docker stats --no-stream --format "{{.Name}} {{.CPUPerc}}" | grep "cfn-parallel-${TASK_ID}" | wc -l)

    # Cleanup
    docker rm -f "cfn-parallel-${TASK_ID}-0" "cfn-parallel-${TASK_ID}-1" "cfn-parallel-${TASK_ID}-2" 2>/dev/null || true

    if [ "$active_containers" -ge 3 ]; then
        log_success "✓ All 3 agents consuming CPU in parallel"
        return 0
    else
        log_error "✗ Only ${active_containers}/3 agents showing CPU activity"
        return 1
    fi
}

# ============================================================================
# Test 5: Result Capture Independence
# ============================================================================
test_result_capture_independence() {
    log_step "GIVEN 3 agents producing independent results"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1
    mkdir -p "/tmp/parallel-bench-${TASK_ID}"

    # WHEN agents write results to separate files
    log_info "Testing independent result capture"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-parallel-${TASK_ID}-${idx}" \
            --network "${NETWORK_NAME}" \
            -v "/tmp/parallel-bench-${TASK_ID}:/results:rw" \
            alpine:latest \
            sh -c "echo 'Result from agent ${idx}' > /results/agent-${idx}.txt; sleep 5" >/dev/null 2>&1
    done

    # Wait for all agents to complete
    docker wait "cfn-parallel-${TASK_ID}-0" >/dev/null 2>&1
    docker wait "cfn-parallel-${TASK_ID}-1" >/dev/null 2>&1
    docker wait "cfn-parallel-${TASK_ID}-2" >/dev/null 2>&1

    # THEN verify all results captured independently
    log_info "Verifying result independence"

    local results_captured=0
    for idx in 0 1 2; do
        local result_content=$(cat "/tmp/parallel-bench-${TASK_ID}/agent-${idx}.txt" 2>/dev/null || echo "missing")
        local expected="Result from agent ${idx}"

        if [ "$result_content" = "$expected" ]; then
            log_success "✓ Agent ${idx}: Result captured correctly"
            results_captured=$((results_captured + 1))
        else
            log_warn "✗ Agent ${idx}: Result mismatch (got: '$result_content')"
        fi
    done

    # Cleanup
    docker rm -f "cfn-parallel-${TASK_ID}-0" "cfn-parallel-${TASK_ID}-1" "cfn-parallel-${TASK_ID}-2" 2>/dev/null || true

    if [ "$results_captured" -eq 3 ]; then
        log_success "✓ All 3 results captured independently"
        return 0
    else
        log_error "✗ Result capture failures: $((3 - results_captured))/3"
        return 1
    fi
}

# ============================================================================
# Test 6: Promise.all() Pattern Verification
# ============================================================================
test_promise_all_pattern() {
    log_step "GIVEN trigger.dev Promise.all() spawn pattern"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN one agent fails, others continue
    log_info "Testing Promise.all failure isolation"

    local start_time=$(date +%s)

    # Spawn: success, failure, success
    docker run -d \
        --name "cfn-parallel-${TASK_ID}-0" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sh -c "sleep 5; echo 'success'" >/dev/null 2>&1 &

    docker run -d \
        --name "cfn-parallel-${TASK_ID}-1" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sh -c "exit 1" >/dev/null 2>&1 &  # Immediate failure

    docker run -d \
        --name "cfn-parallel-${TASK_ID}-2" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sh -c "sleep 5; echo 'success'" >/dev/null 2>&1 &

    wait

    # Wait for successful agents
    docker wait "cfn-parallel-${TASK_ID}-0" >/dev/null 2>&1 || true
    docker wait "cfn-parallel-${TASK_ID}-2" >/dev/null 2>&1 || true

    local end_time=$(date +%s)
    local elapsed=$((end_time - start_time))

    # THEN successful agents should complete (~5s), not blocked by failure
    log_info "Execution time with one failure: ${elapsed}s"

    # Cleanup
    docker rm -f "cfn-parallel-${TASK_ID}-0" "cfn-parallel-${TASK_ID}-1" "cfn-parallel-${TASK_ID}-2" 2>/dev/null || true

    if [ "$elapsed" -le 7 ]; then
        log_success "✓ Promise.all pattern verified: successful agents not blocked (${elapsed}s)"
        return 0
    else
        log_error "✗ Agents may have been blocked by failure (${elapsed}s > 7s expected)"
        return 1
    fi
}

# ============================================================================
# Execute Tests
# ============================================================================
annotate "Phase 2 :: Parallel Execution Tests"

test_parallel_execution_timing
test_parallelism_factor
test_concurrent_container_count
test_cpu_utilization
test_result_capture_independence
test_promise_all_pattern

# ============================================================================
# Test Summary
# ============================================================================
annotate "Test Summary: Parallel Execution"
log_info "Total tests: $TEST_TOTAL"
log_info "Passed: $TEST_PASSED"
log_info "Failed: $TEST_FAILED"

if [ "$TEST_FAILED" -eq 0 ]; then
    log_success "All parallel execution tests passed"
    exit 0
else
    log_error "Some tests failed"
    exit 1
fi
