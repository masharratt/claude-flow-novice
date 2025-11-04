#!/usr/bin/env bash
# Granular Coordinator Handoff Tests for CFN v3

set -euo pipefail

# Source test utilities
source "$(dirname "$0")/../test-utils.sh"

# Temporary directories and files
TEST_TMP_DIR="/tmp/cfn-v3-handoff-tests-$(date +%s)"
mkdir -p "$TEST_TMP_DIR"

# Redis configuration
REDIS_TEST_DB=15  # Dedicated test database
TASK_ID="test-handoff-$(uuidgen)"

# Cleanup function
cleanup() {
    # Clear Redis test database
    redis-cli -n "$REDIS_TEST_DB" FLUSHDB

    # Remove temporary directory
    rm -rf "$TEST_TMP_DIR"
}
trap cleanup EXIT

# Helper functions
setup_test_context() {
    # Simulate epic context in Redis
    redis-cli -n "$REDIS_TEST_DB" HMSET "cfn_loop:task:$TASK_ID:context" \
        epicGoal "Test coordinator handoff mechanisms" \
        inScope "task-classification,agent-selection" \
        outOfScope "advanced-scenarios"
}

# Test 1: Task Classification Handoff
test_task_classification() {
    setup_test_context

    # Mock task classifier
    task_type=$(./.claude/skills/agent-discovery/task-classifier.sh \
        --task-id "$TASK_ID" \
        --redis-db "$REDIS_TEST_DB")

    # Assertions
    assert_not_empty "$task_type" "Task type should be extracted"

    # Verify task type stored in Redis
    stored_task_type=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:$TASK_ID:context" "task_type")
    assert_equals "$task_type" "$stored_task_type" "Task type stored correctly in Redis"
}

# Test 2: Agent Selection Handoff
test_agent_selection() {
    setup_test_context

    # Invoke agent selector
    agent_list=$(./.claude/skills/cfn-agent-selector/select-agents.sh \
        --task-id "$TASK_ID" \
        --task-type "development" \
        --redis-db "$REDIS_TEST_DB")

    # Assertions
    assert_not_empty "$agent_list" "Agent list should be non-empty"

    # Verify agent lists in Redis
    loop3_agents=$(redis-cli -n "$REDIS_TEST_DB" LRANGE "cfn_loop:task:$TASK_ID:loop3_agents" 0 -1)
    loop2_agents=$(redis-cli -n "$REDIS_TEST_DB" LRANGE "cfn_loop:task:$TASK_ID:loop2_agents" 0 -1)

    assert_not_empty "$loop3_agents" "Loop 3 agents should be populated"
    assert_not_empty "$loop2_agents" "Loop 2 agents should be populated"
}

# Test 3: Orchestrator Spawn Handoff
test_orchestrator_spawn() {
    setup_test_context

    # Run orchestrator in background
    ./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
        --task-id "$TASK_ID" \
        --mode standard \
        --redis-db "$REDIS_TEST_DB" \
        --background &

    ORCHESTRATOR_PID=$!

    # Wait and check process status
    sleep 5  # Allow orchestrator to start

    if ! kill -0 "$ORCHESTRATOR_PID" 2>/dev/null; then
        fail "Orchestrator failed to start or crashed"
    fi

    # Verify orchestrator parameters in Redis
    mode=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:$TASK_ID:config" "mode")
    assert_equals "standard" "$mode" "Orchestrator mode set correctly"
}

# Test 4: Context Injection Handoff
test_context_injection() {
    setup_test_context

    # Verify context stored in Redis
    epic_goal=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:$TASK_ID:context" "epicGoal")
    in_scope=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:$TASK_ID:context" "inScope")

    assert_equals "Test coordinator handoff mechanisms" "$epic_goal" "Epic goal context preserved"
    assert_equals "task-classification,agent-selection" "$in_scope" "In-scope items preserved"
}

# Run tests
main() {
    echo "=== Starting Coordinator Handoff Tests ==="

    test_task_classification
    test_agent_selection
    test_orchestrator_spawn
    test_context_injection

    echo "=== Coordinator Handoff Tests Complete ==="
}

# Execute main with error handling
if main; then
    echo "All tests passed successfully! 🏆"
    exit 0
else
    echo "Some tests failed. Check output above."
    exit 1
fi