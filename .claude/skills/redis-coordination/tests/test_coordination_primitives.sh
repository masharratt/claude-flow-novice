#!/bin/bash

# Redis Coordination Primitives Test Suite
# Validates core functionality of Redis coordination skills

# Fail fast on any error
set -e

# Source test utilities
source .claude/skills/redis-coordination/tests/test-utils.sh

# Test Context Storage
test_context_storage() {
    local task_id="test_task_$(date +%s)"
    local test_context='{"sprint": "P1", "agents": ["coder", "tester"]}'

    result=$(../src/redis-context-store.sh \
        --task-id "$task_id" \
        --context-json "$test_context")

    assert_not_empty "$result" "Context storage key generation failed"

    # Retrieve and verify
    retrieved=$(../src/redis-context-retrieve.sh \
        --task-id "$task_id")

    assert_json_equals "$retrieved" "$test_context" "Context retrieval mismatch"
}

# Test BLPOP Mechanism Simulation
test_blpop_mechanism() {
    local task_id="blpop_test_$(date +%s)"

    # Simulate agent completion signal
    ../src/redis-coordination.sh signal \
        --task-id "$task_id" \
        --signal-type "agent_complete"

    # Wait and retrieve signal
    signal=$(../src/redis-coordination.sh wait \
        --task-id "$task_id" \
        --timeout 5)

    assert_equals "$signal" "agent_complete" "BLPOP mechanism failed"
}

# Test Heartbeat Monitoring
test_heartbeat_monitoring() {
    local agent_id="test_agent_$(date +%s)"

    ../src/redis-coordination.sh heartbeat \
        --agent-id "$agent_id"

    status=$(../src/redis-coordination.sh check_heartbeat \
        --agent-id "$agent_id")

    assert_equals "$status" "alive" "Heartbeat monitoring failed"
}

# Main test runner
run_tests() {
    echo "Running Redis Coordination Primitives Test Suite"

    test_context_storage
    test_blpop_mechanism
    test_heartbeat_monitoring

    echo "✅ All tests passed successfully"
}

# Execute tests
run_tests