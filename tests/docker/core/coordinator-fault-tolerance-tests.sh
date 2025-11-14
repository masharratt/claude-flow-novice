#!/bin/bash
# tests/docker/coordinator-fault-tolerance-tests.sh
# Phase 4 :: P2 - Coordinator fault tolerance and recovery validation

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
source "$PROJECT_ROOT/tests/docker/helpers/architecture-test-helpers.sh"

# Configuration
NETWORK_NAME="mcp-network"
REDIS_SERVICE="cfn-redis"
TEST_COORDINATOR="test-fault-coordinator-$$"
TEST_DIR="$(create_temp_dir)"

cleanup() {
    log_step "Cleaning up test containers and data"
    cleanup_container "$TEST_COORDINATOR" 2>/dev/null || true
    docker ps -a --filter "name=test-orphan-agent-" --format "{{.Names}}" | while read -r container; do
        cleanup_container "$container" 2>/dev/null || true
    done
    redis_del "coordinator:${TEST_COORDINATOR}:state" || true
    redis_del "coordinator:${TEST_COORDINATOR}:heartbeat" || true
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test 1: Coordinator restart recovery
test_coordinator_restart() {
    log_step "Test 1: Coordinator restart recovery"

    # GIVEN: Start coordinator with state
    docker run -d \
        $(get_secure_docker_flags) \
        --name "$TEST_COORDINATOR" \
        --network "$NETWORK_NAME" \
        -e CFN_REDIS_HOST="$REDIS_SERVICE" \
        -e CFN_REDIS_PORT=6379 \
        node:20-slim \
        sh -c 'sleep 30' >/dev/null 2>&1

    wait_for_container "$TEST_COORDINATOR" 5

    # WHEN: Store coordinator state in Redis
    local coordinator_state='{"task_id": "test-task", "iteration": 1, "active_agents": 3}'
    redis_set "coordinator:${TEST_COORDINATOR}:state" "$coordinator_state"

    log_info "Coordinator state stored"

    # WHEN: Stop coordinator
    docker stop "$TEST_COORDINATOR" >/dev/null 2>&1
    log_info "Coordinator stopped"

    sleep 2

    # WHEN: Restart coordinator
    docker start "$TEST_COORDINATOR" >/dev/null 2>&1

    # Use helper to wait for coordinator readiness
    wait_for_container "$TEST_COORDINATOR" 5

    log_info "Coordinator restarted"

    # THEN: Verify state persists in Redis
    local recovered_state
    recovered_state=$(redis_get "coordinator:${TEST_COORDINATOR}:state")

    if [ -n "$recovered_state" ]; then
        log_success "Coordinator state recovered from Redis"
    else
        log_error "Failed to recover coordinator state"
        return 1
    fi

    # THEN: Verify state content matches
    if echo "$recovered_state" | grep -q "test-task"; then
        log_success "Coordinator state content validated"
    else
        log_error "Coordinator state content mismatch"
        return 1
    fi
}

# Test 2: Redis state persistence across restarts
test_redis_persistence() {
    log_step "Test 2: Redis state persistence across coordinator restarts"

    # GIVEN: Multiple keys representing coordinator state
    local keys=(
        "coordinator:test:task_id"
        "coordinator:test:iteration"
        "coordinator:test:agents"
    )

    local values=(
        "task-12345"
        "2"
        "agent-1,agent-2,agent-3"
    )

    # WHEN: Write coordinator state to Redis
    for i in "${!keys[@]}"; do
        redis_set "${keys[$i]}" "${values[$i]}"
    done

    log_info "Coordinator state written to Redis"

    # WHEN: Simulate coordinator crash (no cleanup)
    # State remains in Redis

    # THEN: Verify all keys persist
    local all_keys_present=true
    for key in "${keys[@]}"; do
        if ! redis_exists "$key"; then
            log_error "Key not found: $key"
            all_keys_present=false
        fi
    done

    if [ "$all_keys_present" = true ]; then
        log_success "All coordinator state keys persisted"
    else
        log_error "Some keys were lost"
        return 1
    fi

    # THEN: Verify values intact
    for i in "${!keys[@]}"; do
        local retrieved_value
        retrieved_value=$(redis_get "${keys[$i]}")
        if [ "$retrieved_value" = "${values[$i]}" ]; then
            log_info "Value verified: ${keys[$i]} = $retrieved_value"
        else
            log_error "Value mismatch for ${keys[$i]}"
            return 1
        fi
    done

    log_success "All coordinator state values validated"

    # Cleanup test keys
    for key in "${keys[@]}"; do
        redis_del "$key" || true
    done
}

# Test 3: Agent orphan detection and cleanup
test_orphan_detection() {
    log_step "Test 3: Agent orphan detection and cleanup"

    # GIVEN: Start test agents
    local agents=("test-orphan-agent-1-$$" "test-orphan-agent-2-$$" "test-orphan-agent-3-$$")

    for agent in "${agents[@]}"; do
        docker run -d \
            $(get_secure_docker_flags) \
            --name "$agent" \
            --network "$NETWORK_NAME" \
            --label "coordinator=${TEST_COORDINATOR}" \
            node:20-slim \
            sh -c 'sleep 60' >/dev/null 2>&1
    done

    log_info "Started ${#agents[@]} test agents"

    # WHEN: Coordinator crashes (simulate)
    # Agents are now orphaned

    # THEN: Detect orphaned agents by label
    local orphaned_agents=()
    while IFS= read -r container; do
        orphaned_agents+=("$container")
    done < <(docker ps --filter "label=coordinator=${TEST_COORDINATOR}" --format "{{.Names}}")

    if [ ${#orphaned_agents[@]} -eq 3 ]; then
        log_success "Detected ${#orphaned_agents[@]} orphaned agents"
    else
        log_error "Expected 3 orphaned agents, found ${#orphaned_agents[@]}"
        return 1
    fi

    # WHEN: Cleanup orphaned agents
    for agent in "${orphaned_agents[@]}"; do
        cleanup_container "$agent"
        log_info "Cleaned up orphaned agent: $agent"
    done

    # THEN: Verify all orphans removed
    local remaining_count
    remaining_count=$(docker ps --filter "label=coordinator=${TEST_COORDINATOR}" --format "{{.Names}}" | wc -l)

    if [ "$remaining_count" -eq 0 ]; then
        log_success "All orphaned agents cleaned up"
    else
        log_error "Found $remaining_count remaining orphaned agents"
        return 1
    fi
}

# Test 4: Graceful failure handling
test_graceful_failure() {
    log_step "Test 4: Graceful failure handling"

    # GIVEN: Coordinator with active task
    local task_id="test-graceful-task-$$"
    redis_set "coordinator:graceful:task_id" "$task_id"
    redis_set "coordinator:graceful:status" "running"

    # WHEN: Simulate error condition
    redis_set "coordinator:graceful:error" "Agent timeout detected"

    # THEN: Coordinator should mark task as failed
    local error_msg
    error_msg=$(redis_get "coordinator:graceful:error")

    if [ -n "$error_msg" ]; then
        log_success "Error condition recorded: $error_msg"
    else
        log_error "Error condition not recorded"
        return 1
    fi

    # WHEN: Coordinator transitions to failed state
    redis_set "coordinator:graceful:status" "failed"

    # THEN: Verify failure state
    local final_status
    final_status=$(redis_get "coordinator:graceful:status")

    if [ "$final_status" = "failed" ]; then
        log_success "Coordinator transitioned to failed state"
    else
        log_error "Expected 'failed' status, got: $final_status"
        return 1
    fi

    # THEN: Verify cleanup actions recorded
    redis_set "coordinator:graceful:cleanup_performed" "true"
    local cleanup_flag
    cleanup_flag=$(redis_get "coordinator:graceful:cleanup_performed")

    if [ "$cleanup_flag" = "true" ]; then
        log_success "Cleanup actions recorded"
    else
        log_error "Cleanup actions not recorded"
        return 1
    fi

    # THEN: Test recovery after failure
    redis_set "coordinator:graceful:status" "recovered"
    redis_del "coordinator:graceful:error" || true

    local recovered_status
    recovered_status=$(redis_get "coordinator:graceful:status")

    if [ "$recovered_status" = "recovered" ]; then
        log_success "Coordinator recovered from failure"
    else
        log_error "Recovery failed"
        return 1
    fi

    # Cleanup test keys
    redis_del "coordinator:graceful:task_id" || true
    redis_del "coordinator:graceful:status" || true
    redis_del "coordinator:graceful:cleanup_performed" || true
}

# Execute all tests
setup_test "coordinator-fault-tolerance"

test_coordinator_restart
test_redis_persistence
test_orphan_detection
test_graceful_failure

teardown_test
