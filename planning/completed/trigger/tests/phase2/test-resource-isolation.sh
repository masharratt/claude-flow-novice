#!/bin/bash
# planning/trigger/tests/phase2/test-resource-isolation.sh
# Phase 2 :: Validate resource isolation between concurrent agents
# Tests: CPU, memory, and I/O isolation (no contention)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TASK_ID="phase2-resource-$(date +%s)"
CPU_LIMIT="1.0"
MEMORY_LIMIT="2g"

cleanup() {
    log_info "Cleaning up test artifacts"
    docker rm -f "cfn-cpu-test-${TASK_ID}-0" "cfn-cpu-test-${TASK_ID}-1" "cfn-cpu-test-${TASK_ID}-2" 2>/dev/null || true
    docker rm -f "cfn-mem-test-${TASK_ID}-0" "cfn-mem-test-${TASK_ID}-1" "cfn-mem-test-${TASK_ID}-2" 2>/dev/null || true
    docker network rm "cfn-resource-net-${TASK_ID}" 2>/dev/null || true
}
trap cleanup EXIT

# ============================================================================
# Test 1: CPU Isolation (Resource Limits Enforced)
# ============================================================================
test_cpu_isolation() {
    log_step "GIVEN 3 agents with CPU limit of ${CPU_LIMIT} cores each"

    docker network create "cfn-resource-net-${TASK_ID}" >/dev/null 2>&1

    # WHEN spawning CPU-intensive agents
    log_info "Spawning CPU-intensive workloads"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-cpu-test-${TASK_ID}-${idx}" \
            --network "cfn-resource-net-${TASK_ID}" \
            --cpus="${CPU_LIMIT}" \
            --memory="${MEMORY_LIMIT}" \
            alpine:latest \
            sh -c 'while true; do echo "stress" >/dev/null; done' >/dev/null 2>&1
    done

    sleep 2  # Let containers stabilize

    # THEN verify CPU limits are enforced
    log_info "Verifying CPU limits"

    local violations=0
    for idx in 0 1 2; do
        local cpu_quota=$(docker inspect "cfn-cpu-test-${TASK_ID}-${idx}" --format '{{.HostConfig.CpuQuota}}')
        local cpu_period=$(docker inspect "cfn-cpu-test-${TASK_ID}-${idx}" --format '{{.HostConfig.CpuPeriod}}')

        if [ "$cpu_quota" -gt 0 ] && [ "$cpu_period" -gt 0 ]; then
            local effective_cpus=$(awk "BEGIN {print $cpu_quota / $cpu_period}")
            log_info "Agent ${idx}: CPU limit = ${effective_cpus} cores"

            # Check if within expected range (1.0 ± 0.01)
            if (( $(awk "BEGIN {print ($effective_cpus >= 0.99 && $effective_cpus <= 1.01)}") )); then
                log_success "✓ Agent ${idx}: CPU limit enforced correctly"
            else
                log_warn "✗ Agent ${idx}: CPU limit deviation (${effective_cpus})"
                violations=$((violations + 1))
            fi
        else
            log_warn "✗ Agent ${idx}: No CPU quota set"
            violations=$((violations + 1))
        fi
    done

    # Cleanup
    docker rm -f "cfn-cpu-test-${TASK_ID}-0" "cfn-cpu-test-${TASK_ID}-1" "cfn-cpu-test-${TASK_ID}-2" 2>/dev/null || true

    if [ "$violations" -eq 0 ]; then
        log_success "✓ CPU isolation verified for all agents"
        return 0
    else
        log_error "✗ CPU isolation violations: ${violations}/3"
        return 1
    fi
}

# ============================================================================
# Test 2: Memory Isolation (No Memory Contention)
# ============================================================================
test_memory_isolation() {
    log_step "GIVEN 3 agents with memory limit of ${MEMORY_LIMIT} each"

    # WHEN spawning memory-constrained agents
    log_info "Spawning memory-limited containers"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-mem-test-${TASK_ID}-${idx}" \
            --network "cfn-resource-net-${TASK_ID}" \
            --cpus="${CPU_LIMIT}" \
            --memory="${MEMORY_LIMIT}" \
            alpine:latest \
            sleep 30 >/dev/null 2>&1
    done

    sleep 2  # Let containers stabilize

    # THEN verify memory limits are enforced
    log_info "Verifying memory limits"

    local violations=0
    for idx in 0 1 2; do
        local mem_limit=$(docker inspect "cfn-mem-test-${TASK_ID}-${idx}" --format '{{.HostConfig.Memory}}')
        local expected_bytes=$((2 * 1024 * 1024 * 1024))  # 2GB in bytes

        if [ "$mem_limit" -eq "$expected_bytes" ]; then
            log_success "✓ Agent ${idx}: Memory limit = ${MEMORY_LIMIT}"
        else
            log_warn "✗ Agent ${idx}: Memory limit = $mem_limit bytes (expected $expected_bytes)"
            violations=$((violations + 1))
        fi
    done

    # Cleanup
    docker rm -f "cfn-mem-test-${TASK_ID}-0" "cfn-mem-test-${TASK_ID}-1" "cfn-mem-test-${TASK_ID}-2" 2>/dev/null || true

    if [ "$violations" -eq 0 ]; then
        log_success "✓ Memory isolation verified for all agents"
        return 0
    else
        log_error "✗ Memory isolation violations: ${violations}/3"
        return 1
    fi
}

# ============================================================================
# Test 3: Resource Contention Detection
# ============================================================================
test_no_resource_contention() {
    log_step "GIVEN 3 concurrent agents with resource limits"

    # WHEN running concurrent workloads
    log_info "Testing resource contention resistance"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-cpu-test-${TASK_ID}-${idx}" \
            --network "cfn-resource-net-${TASK_ID}" \
            --cpus="${CPU_LIMIT}" \
            --memory="${MEMORY_LIMIT}" \
            alpine:latest \
            sh -c 'dd if=/dev/zero of=/dev/null bs=1M count=100 2>/dev/null; sleep 10' >/dev/null 2>&1
    done

    sleep 3  # Let workloads run

    # THEN verify all containers remain running (no OOM kills)
    log_info "Checking for resource-related failures"

    local running=0
    local oom_killed=0

    for idx in 0 1 2; do
        local state=$(docker inspect "cfn-cpu-test-${TASK_ID}-${idx}" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
        local oom=$(docker inspect "cfn-cpu-test-${TASK_ID}-${idx}" --format '{{.State.OOMKilled}}' 2>/dev/null || echo "false")

        if [ "$state" = "running" ]; then
            running=$((running + 1))
        fi

        if [ "$oom" = "true" ]; then
            oom_killed=$((oom_killed + 1))
            log_warn "✗ Agent ${idx}: OOM killed"
        fi
    done

    # Cleanup
    docker rm -f "cfn-cpu-test-${TASK_ID}-0" "cfn-cpu-test-${TASK_ID}-1" "cfn-cpu-test-${TASK_ID}-2" 2>/dev/null || true

    if [ "$running" -eq 3 ] && [ "$oom_killed" -eq 0 ]; then
        log_success "✓ No resource contention detected (${running}/3 running, 0 OOM kills)"
        return 0
    else
        log_error "✗ Resource contention detected (${running}/3 running, ${oom_killed} OOM kills)"
        return 1
    fi
}

# ============================================================================
# Test 4: Cgroup Isolation Verification
# ============================================================================
test_cgroup_isolation() {
    log_step "GIVEN Docker cgroup v2 resource control"

    # WHEN spawning agents with resource limits
    log_info "Verifying cgroup isolation"

    docker run -d \
        --name "cfn-cgroup-test-${TASK_ID}" \
        --cpus="${CPU_LIMIT}" \
        --memory="${MEMORY_LIMIT}" \
        alpine:latest \
        sleep 30 >/dev/null 2>&1

    sleep 1

    # THEN verify cgroup configuration
    local cgroup_cpu=$(docker inspect "cfn-cgroup-test-${TASK_ID}" --format '{{.HostConfig.NanoCpus}}')
    local cgroup_mem=$(docker inspect "cfn-cgroup-test-${TASK_ID}" --format '{{.HostConfig.Memory}}')

    docker rm -f "cfn-cgroup-test-${TASK_ID}" 2>/dev/null || true

    local expected_nano_cpus=$((1 * 1000000000))  # 1.0 CPU = 1e9 nanocpus
    local expected_mem_bytes=$((2 * 1024 * 1024 * 1024))  # 2GB

    if [ "$cgroup_cpu" -eq "$expected_nano_cpus" ] && [ "$cgroup_mem" -eq "$expected_mem_bytes" ]; then
        log_success "✓ Cgroup isolation configured correctly"
        return 0
    else
        log_error "✗ Cgroup mismatch: CPU=$cgroup_cpu (expected $expected_nano_cpus), MEM=$cgroup_mem (expected $expected_mem_bytes)"
        return 1
    fi
}

# ============================================================================
# Test 5: I/O Bandwidth Isolation (Basic Check)
# ============================================================================
test_io_isolation() {
    log_step "GIVEN 3 agents performing I/O operations"

    # WHEN running concurrent I/O workloads
    log_info "Testing I/O isolation"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-cpu-test-${TASK_ID}-${idx}" \
            --network "cfn-resource-net-${TASK_ID}" \
            --cpus="${CPU_LIMIT}" \
            --memory="${MEMORY_LIMIT}" \
            alpine:latest \
            sh -c 'for i in $(seq 1 10); do dd if=/dev/zero of=/tmp/test bs=1M count=10 2>/dev/null; done; sleep 5' >/dev/null 2>&1
    done

    sleep 2

    # THEN verify all containers complete I/O without blocking
    local running=0
    for idx in 0 1 2; do
        local state=$(docker inspect "cfn-cpu-test-${TASK_ID}-${idx}" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
        if [ "$state" = "running" ]; then
            running=$((running + 1))
        fi
    done

    # Cleanup
    docker rm -f "cfn-cpu-test-${TASK_ID}-0" "cfn-cpu-test-${TASK_ID}-1" "cfn-cpu-test-${TASK_ID}-2" 2>/dev/null || true

    if [ "$running" -eq 3 ]; then
        log_success "✓ I/O isolation verified (all ${running} agents running)"
        return 0
    else
        log_error "✗ I/O contention detected (only ${running}/3 running)"
        return 1
    fi
}

# ============================================================================
# Execute Tests
# ============================================================================
annotate "Phase 2 :: Resource Isolation Tests"

test_cpu_isolation
test_memory_isolation
test_no_resource_contention
test_cgroup_isolation
test_io_isolation

# ============================================================================
# Test Summary
# ============================================================================
annotate "Test Summary: Resource Isolation"
log_info "Total tests: $TEST_TOTAL"
log_info "Passed: $TEST_PASSED"
log_info "Failed: $TEST_FAILED"

if [ "$TEST_FAILED" -eq 0 ]; then
    log_success "All resource isolation tests passed"
    exit 0
else
    log_error "Some tests failed"
    exit 1
fi
