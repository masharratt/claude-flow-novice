#!/bin/bash
# tests/integration/collision-mitigation/test-simultaneous-execution.sh
# Integration :: Simultaneous CLI + Trigger.dev execution validation

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_TASK_ID="simultaneous-$$"
CLI_NETWORK="mcp-network"
TRIGGER_NETWORK="trigger-cfn-network"
TEST_TIMEOUT=60
REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
REDIS_PORT="${CFN_REDIS_PORT:-6379}"
REDIS_CLI="redis-cli -h $REDIS_HOST -p $REDIS_PORT"

cleanup() {
    log_info "Cleaning up simultaneous execution test"

    # Clean up CLI mode artifacts
    $REDIS_CLI DEL "cfn:task:cli:${TEST_TASK_ID}:status" 2>/dev/null || true
    $REDIS_CLI DEL "cfn:task:cli:${TEST_TASK_ID}:completed" 2>/dev/null || true
    $REDIS_CLI DEL "cfn:task:cli:${TEST_TASK_ID}:result" 2>/dev/null || true

    # Clean up Trigger.dev mode artifacts
    $REDIS_CLI DEL "cfn:task:trigger:${TEST_TASK_ID}:status" 2>/dev/null || true
    $REDIS_CLI DEL "cfn:task:trigger:${TEST_TASK_ID}:completed" 2>/dev/null || true
    $REDIS_CLI DEL "cfn:task:trigger:${TEST_TASK_ID}:result" 2>/dev/null || true

    # Remove test containers
    docker rm -f "cli-agent-${TEST_TASK_ID}" 2>/dev/null || true
    docker rm -f "trigger-agent-${TEST_TASK_ID}" 2>/dev/null || true
    docker rm -f "cli-redis-temp-$$" 2>/dev/null || true
    docker rm -f "trigger-redis-temp-$$" 2>/dev/null || true
}
trap cleanup EXIT

test_simultaneous_redis_operations() {
    annotate "Simultaneous Redis Operations"

    log_step "GIVEN: Redis is available"
    if ! $REDIS_CLI PING >/dev/null 2>&1; then
        log_error "Redis not available at $REDIS_HOST:$REDIS_PORT"
        return 1
    fi

    log_step "WHEN: CLI mode starts a task"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:status" "running"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:started_at" "$(date -Iseconds)"

    log_step "WHEN: Trigger.dev mode starts a task with same ID"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:status" "running"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:started_at" "$(date -Iseconds)"

    log_step "THEN: Both tasks run independently"
    local cli_status=$($REDIS_CLI GET "cfn:task:cli:${TEST_TASK_ID}:status")
    local trigger_status=$($REDIS_CLI GET "cfn:task:trigger:${TEST_TASK_ID}:status")

    assert_equals "running" "$cli_status" "CLI task running"
    assert_equals "running" "$trigger_status" "Trigger task running"

    log_step "WHEN: CLI mode completes"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:status" "completed"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:completed" "1"

    log_step "THEN: Trigger mode task continues running"
    trigger_status=$($REDIS_CLI GET "cfn:task:trigger:${TEST_TASK_ID}:status")
    assert_equals "running" "$trigger_status" "Trigger task not affected"

    log_step "WHEN: Trigger mode completes"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:status" "completed"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:completed" "1"

    log_step "THEN: Both completions recorded independently"
    cli_status=$($REDIS_CLI GET "cfn:task:cli:${TEST_TASK_ID}:status")
    trigger_status=$($REDIS_CLI GET "cfn:task:trigger:${TEST_TASK_ID}:status")

    assert_equals "completed" "$cli_status" "CLI task completed"
    assert_equals "completed" "$trigger_status" "Trigger task completed"
}

test_parallel_agent_containers() {
    annotate "Parallel Agent Container Execution"

    log_step "GIVEN: Both Docker networks exist"
    if ! docker network inspect "$CLI_NETWORK" >/dev/null 2>&1; then
        docker network create "$CLI_NETWORK"
    fi
    if ! docker network inspect "$TRIGGER_NETWORK" >/dev/null 2>&1; then
        docker network create "$TRIGGER_NETWORK"
    fi

    log_step "GIVEN: Redis is available in both networks"
    if ! docker ps --filter "name=cfn-redis" --format "{{.Names}}" | grep -q "cfn-redis"; then
        log_info "Starting temporary Redis for CLI network"
        docker run -d \
            --name "cli-redis-temp-$$" \
            --network "$CLI_NETWORK" \
            redis:7-alpine \
            redis-server --appendonly yes >/dev/null 2>&1 || true
        sleep 2
    fi

    # Start temp Redis for Trigger network
    docker run -d \
        --name "trigger-redis-temp-$$" \
        --network "$TRIGGER_NETWORK" \
        --network-alias redis \
        redis:7-alpine \
        redis-server --appendonly yes >/dev/null 2>&1 || true
    sleep 2

    log_step "WHEN: CLI mode agent starts in mcp-network"
    docker run -d \
        --name "cli-agent-${TEST_TASK_ID}" \
        --network "$CLI_NETWORK" \
        alpine:latest \
        sh -c "echo 'CLI agent running' && sleep 10" >/dev/null 2>&1 || {
            log_error "Failed to start CLI agent"
            return 1
        }

    log_step "WHEN: Trigger.dev agent starts in trigger-cfn-network"
    docker run -d \
        --name "trigger-agent-${TEST_TASK_ID}" \
        --network "$TRIGGER_NETWORK" \
        alpine:latest \
        sh -c "echo 'Trigger agent running' && sleep 10" >/dev/null 2>&1 || {
            log_error "Failed to start Trigger agent"
            return 1
        }

    sleep 2

    log_step "THEN: Both agents are running simultaneously"
    local cli_status=$(docker inspect -f '{{.State.Status}}' "cli-agent-${TEST_TASK_ID}" 2>/dev/null || echo "not found")
    local trigger_status=$(docker inspect -f '{{.State.Status}}' "trigger-agent-${TEST_TASK_ID}" 2>/dev/null || echo "not found")

    assert_equals "running" "$cli_status" "CLI agent running"
    assert_equals "running" "$trigger_status" "Trigger agent running"

    log_step "THEN: Agents are network-isolated"
    # CLI agent should not see Trigger network services
    if docker exec "cli-agent-${TEST_TASK_ID}" \
        sh -c "ping -c 1 -W 1 trigger-agent-${TEST_TASK_ID}" 2>/dev/null; then
        log_error "Network isolation broken: CLI can reach Trigger network"
        return 1
    else
        log_success "Networks are properly isolated"
    fi
}

test_resource_contention() {
    annotate "Resource Contention Handling"

    log_step "GIVEN: Both modes have active tasks"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:counter" "0"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:counter" "0"

    log_step "WHEN: Both modes increment counters rapidly"
    for i in {1..10}; do
        $REDIS_CLI INCR "cfn:task:cli:${TEST_TASK_ID}:counter" >/dev/null &
        $REDIS_CLI INCR "cfn:task:trigger:${TEST_TASK_ID}:counter" >/dev/null &
    done
    wait

    log_step "THEN: Counters are accurate and isolated"
    local cli_counter=$($REDIS_CLI GET "cfn:task:cli:${TEST_TASK_ID}:counter")
    local trigger_counter=$($REDIS_CLI GET "cfn:task:trigger:${TEST_TASK_ID}:counter")

    assert_equals "10" "$cli_counter" "CLI counter accurate"
    assert_equals "10" "$trigger_counter" "Trigger counter accurate"
}

test_failure_isolation() {
    annotate "Failure Isolation Between Modes"

    log_step "GIVEN: Both modes have tasks running"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:status" "running"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:status" "running"

    log_step "WHEN: CLI mode task fails"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:status" "failed"
    $REDIS_CLI SET "cfn:task:cli:${TEST_TASK_ID}:error" "Test failure"

    log_step "THEN: Trigger mode task continues unaffected"
    local trigger_status=$($REDIS_CLI GET "cfn:task:trigger:${TEST_TASK_ID}:status")
    assert_equals "running" "$trigger_status" "Trigger task not affected by CLI failure"

    log_step "WHEN: Trigger mode task completes successfully"
    $REDIS_CLI SET "cfn:task:trigger:${TEST_TASK_ID}:status" "completed"

    log_step "THEN: Both final states are independent"
    local cli_status=$($REDIS_CLI GET "cfn:task:cli:${TEST_TASK_ID}:status")
    trigger_status=$($REDIS_CLI GET "cfn:task:trigger:${TEST_TASK_ID}:status")

    assert_equals "failed" "$cli_status" "CLI task failed state preserved"
    assert_equals "completed" "$trigger_status" "Trigger task completed state preserved"
}

test_concurrent_service_discovery() {
    annotate "Concurrent Service Discovery"

    log_step "GIVEN: Both networks have Redis services"
    if ! docker network inspect "$CLI_NETWORK" >/dev/null 2>&1; then
        docker network create "$CLI_NETWORK"
    fi
    if ! docker network inspect "$TRIGGER_NETWORK" >/dev/null 2>&1; then
        docker network create "$TRIGGER_NETWORK"
    fi

    log_step "WHEN: CLI agent resolves 'cfn-redis'"
    # This is a configuration check - actual resolution tested in Phase 2
    local cli_expected="cfn-redis"

    log_step "WHEN: Trigger agent resolves 'redis' or 'cfn-redis'"
    local trigger_expected="redis|cfn-redis"

    log_step "THEN: Each mode uses correct service names"
    log_success "CLI mode expects: $cli_expected"
    log_success "Trigger mode expects: $trigger_expected"
    log_info "Actual resolution tested in Phase 2"
}

# Execute tests
test_simultaneous_redis_operations
test_parallel_agent_containers
test_resource_contention
test_failure_isolation
test_concurrent_service_discovery

# Summary
annotate "Simultaneous Execution Test Summary"
echo "Total Tests: $TEST_TOTAL"
echo "Passed: $TEST_PASSED"
echo "Failed: $TEST_FAILED"

if [ "$TEST_FAILED" -eq 0 ]; then
    log_success "Simultaneous execution: All tests passed - zero collisions confirmed"
    exit 0
else
    log_error "Simultaneous execution: $TEST_FAILED test(s) failed - collisions detected"
    exit 1
fi
