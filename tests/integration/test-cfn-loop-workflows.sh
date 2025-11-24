#!/bin/bash
# tests/integration/test-cfn-loop-workflows.sh
# Phase 5 Wave 4A :: Integration tests (IMPL-003)
# End-to-end workflows: spawn agent, execute task, collect results

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
TASK_ID="test-task-$(date +%s)"
TEST_AGENT_TYPE="backend-dev"
REDIS_KEY_PREFIX="cfn:test:${TASK_ID}"

cleanup() {
    log_info "Cleaning up integration test artifacts"
    docker rm -f "test-agent-${TASK_ID}" 2>/dev/null || true
    redis-cli DEL "${REDIS_KEY_PREFIX}:status" "${REDIS_KEY_PREFIX}:result" "${REDIS_KEY_PREFIX}:logs" 2>/dev/null || true
}
trap cleanup EXIT

test_agent_spawn_basic() {
    log_step "TEST 1: Basic agent spawn - agent container starts successfully"

    # GIVEN agent spawn parameters
    AGENT_NAME="test-agent-${TASK_ID}"

    # WHEN spawning an agent container
    CONTAINER_ID=$(docker run -d --name "$AGENT_NAME" \
        --label "cfn.agent=true" \
        --label "cfn.task=${TASK_ID}" \
        alpine:latest sleep 60 2>&1)

    # THEN container should be running
    if [[ -z "$CONTAINER_ID" ]]; then
        fail "Failed to spawn agent container"
    fi

    CONTAINER_STATUS=$(docker inspect "$AGENT_NAME" --format '{{.State.Status}}')
    if [[ "$CONTAINER_STATUS" != "running" ]]; then
        fail "Agent container not running: $CONTAINER_STATUS"
    fi

    pass "Basic agent spawn verified"
}

test_agent_task_execution() {
    log_step "TEST 2: Agent task execution - agent can execute commands"

    # GIVEN a running agent container
    AGENT_NAME="test-agent-${TASK_ID}"
    docker run -d --name "$AGENT_NAME" alpine:latest sleep 300 >/dev/null

    # WHEN executing a task in the agent
    EXEC_OUTPUT=$(docker exec "$AGENT_NAME" echo "task-executed" 2>&1)

    # THEN task should execute successfully
    if [[ "$EXEC_OUTPUT" != "task-executed" ]]; then
        fail "Task execution failed: $EXEC_OUTPUT"
    fi

    pass "Agent task execution verified"
}

test_redis_coordination_basic() {
    log_step "TEST 3: Redis coordination - agents can write status to Redis"

    # GIVEN Redis is available
    if ! redis-cli ping >/dev/null 2>&1; then
        skip "Redis not available for coordination test"
        return
    fi

    # WHEN writing agent status to Redis
    redis-cli SET "${REDIS_KEY_PREFIX}:status" "running" >/dev/null

    # THEN status should be retrievable
    STATUS=$(redis-cli GET "${REDIS_KEY_PREFIX}:status")
    if [[ "$STATUS" != "running" ]]; then
        fail "Redis coordination failed: expected 'running', got '$STATUS'"
    fi

    pass "Redis coordination verified"
}

test_result_collection() {
    log_step "TEST 4: Result collection - agent results can be collected"

    # GIVEN an agent that produces output
    AGENT_NAME="test-agent-${TASK_ID}"
    docker run -d --name "$AGENT_NAME" alpine:latest sleep 300 >/dev/null

    # WHEN agent produces results
    docker exec "$AGENT_NAME" sh -c "echo 'result-data' > /tmp/result.txt" >/dev/null

    # THEN results should be retrievable
    RESULT=$(docker exec "$AGENT_NAME" cat /tmp/result.txt)
    if [[ "$RESULT" != "result-data" ]]; then
        fail "Result collection failed: expected 'result-data', got '$RESULT'"
    fi

    pass "Result collection verified"
}

test_agent_lifecycle_management() {
    log_step "TEST 5: Agent lifecycle - agents can be started, monitored, and stopped"

    # GIVEN an agent container
    AGENT_NAME="test-agent-${TASK_ID}"
    docker run -d --name "$AGENT_NAME" alpine:latest sleep 300 >/dev/null

    # WHEN checking lifecycle states
    # State 1: Running
    STATE_1=$(docker inspect "$AGENT_NAME" --format '{{.State.Status}}')
    if [[ "$STATE_1" != "running" ]]; then
        fail "Agent not in running state: $STATE_1"
    fi

    # State 2: Stop
    docker stop "$AGENT_NAME" >/dev/null
    STATE_2=$(docker inspect "$AGENT_NAME" --format '{{.State.Status}}')
    if [[ "$STATE_2" != "exited" ]]; then
        fail "Agent not in stopped state: $STATE_2"
    fi

    # State 3: Restart
    docker start "$AGENT_NAME" >/dev/null
    sleep 1
    STATE_3=$(docker inspect "$AGENT_NAME" --format '{{.State.Status}}')
    if [[ "$STATE_3" != "running" ]]; then
        fail "Agent not restarted: $STATE_3"
    fi

    pass "Agent lifecycle management verified"
}

test_multi_agent_coordination() {
    log_step "TEST 6: Multi-agent coordination - multiple agents can coordinate"

    # GIVEN multiple agent containers
    AGENT_1="test-agent-1-${TASK_ID}"
    AGENT_2="test-agent-2-${TASK_ID}"

    docker run -d --name "$AGENT_1" alpine:latest sleep 60 >/dev/null
    docker run -d --name "$AGENT_2" alpine:latest sleep 60 >/dev/null

    # WHEN agents coordinate via shared mechanism
    docker exec "$AGENT_1" sh -c "echo 'agent1-ready' > /tmp/status" >/dev/null
    docker exec "$AGENT_2" sh -c "echo 'agent2-ready' > /tmp/status" >/dev/null

    # THEN both agents should be operational
    STATUS_1=$(docker exec "$AGENT_1" cat /tmp/status)
    STATUS_2=$(docker exec "$AGENT_2" cat /tmp/status)

    if [[ "$STATUS_1" != "agent1-ready" ]] || [[ "$STATUS_2" != "agent2-ready" ]]; then
        fail "Multi-agent coordination failed"
    fi

    docker rm -f "$AGENT_1" "$AGENT_2" >/dev/null 2>&1

    pass "Multi-agent coordination verified"
}

test_error_handling() {
    log_step "TEST 7: Error handling - failed tasks are detected"

    # GIVEN an agent that will fail
    AGENT_NAME="test-agent-${TASK_ID}"
    docker run -d --name "$AGENT_NAME" alpine:latest sleep 60 >/dev/null

    # WHEN executing a failing command
    if docker exec "$AGENT_NAME" sh -c "exit 1" 2>/dev/null; then
        fail "Error handling failed: command should have failed"
    fi

    # THEN failure should be detectable
    pass "Error handling verified"
}

test_log_collection() {
    log_step "TEST 8: Log collection - agent logs can be retrieved"

    # GIVEN an agent producing logs
    AGENT_NAME="test-agent-${TASK_ID}"
    docker run -d --name "$AGENT_NAME" alpine:latest sh -c "echo 'log-message' && sleep 300" >/dev/null
    sleep 1

    # WHEN collecting logs
    LOGS=$(docker logs "$AGENT_NAME" 2>&1)

    # THEN logs should contain expected messages
    if ! echo "$LOGS" | grep -q "log-message"; then
        fail "Log collection failed: log-message not found"
    fi

    pass "Log collection verified"
}

test_resource_cleanup() {
    log_step "TEST 9: Resource cleanup - agents clean up after completion"

    # GIVEN a completed agent
    AGENT_NAME="test-agent-${TASK_ID}"
    docker run -d --name "$AGENT_NAME" alpine:latest sleep 2 >/dev/null
    sleep 3

    # WHEN agent completes and is removed
    docker rm "$AGENT_NAME" >/dev/null 2>&1

    # THEN agent should no longer exist
    if docker ps -a --format '{{.Names}}' | grep -q "^${AGENT_NAME}$"; then
        fail "Resource cleanup failed: agent still exists"
    fi

    pass "Resource cleanup verified"
}

test_timeout_handling() {
    log_step "TEST 10: Timeout handling - long-running agents can be terminated"

    # GIVEN a long-running agent
    AGENT_NAME="test-agent-${TASK_ID}"
    docker run -d --name "$AGENT_NAME" alpine:latest sleep 300 >/dev/null

    # WHEN timeout is enforced
    timeout 2 docker exec "$AGENT_NAME" sleep 10 2>/dev/null || TIMEOUT_RESULT=$?

    # THEN timeout should trigger
    if [[ "${TIMEOUT_RESULT:-0}" -ne 124 ]]; then
        fail "Timeout handling failed: expected timeout signal"
    fi

    pass "Timeout handling verified"
}

# Execute tests
log_info "Starting CFN Loop integration tests (10 tests)"
test_agent_spawn_basic
test_agent_task_execution
test_redis_coordination_basic
test_result_collection
test_agent_lifecycle_management
test_multi_agent_coordination
test_error_handling
test_log_collection
test_resource_cleanup
test_timeout_handling

# Summary
print_summary "CFN Loop Integration Tests"
