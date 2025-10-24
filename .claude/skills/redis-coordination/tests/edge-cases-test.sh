#!/bin/bash
# Edge Cases Test Suite
# Validates complex and concurrent scenarios for error recovery

set -euo pipefail

# Source common test utilities
source "$(dirname "$0")/test-utils.sh"

# Redis connection failure simulation
test_redis_connection_failure() {
    local original_redis_host=$(redis-cli config get bind | tail -n 1)

    # Simulate connection failure by setting invalid host
    redis-cli config set bind "invalid-host"

    set +e  # Disable immediate exit on error
    ./.claude/skills/redis-coordination/retry-mechanism.sh \
        --task-id "connection-failure-test" \
        --max-retries 3 2>/dev/null
    local exit_code=$?
    set -e

    # Restore original Redis host
    redis-cli config set bind "$original_redis_host"

    # Check that retry mechanism handles connection failure
    assert "[ $exit_code -ne 0 ]" "Connection failure not handled correctly"
}

# Concurrent DLQ writes test
test_concurrent_dlq_writes() {
    local concurrent_tasks=10
    local base_task_id="concurrent-dlq-$(date +%s)"

    # Run concurrent DLQ writes
    for ((i=1; i<=concurrent_tasks; i++)); do
        (
            ./.claude/skills/redis-coordination/write-to-dlq.sh \
                --task-id "${base_task_id}-$i" \
                --agent-id "concurrent-tester" \
                --error '{"code": 500, "message": "Concurrent Test"}' &
        )
    done

    # Wait for all background processes
    wait

    # Verify all entries were written
    local query_result=$(./.claude/skills/redis-coordination/query-dlq.sh \
        --agent-id "concurrent-tester")

    assert "[ $(echo '$query_result' | grep -c "$base_task_id") -eq $concurrent_tasks ]" "Not all concurrent DLQ writes successful"
}

# Invalid agent ID handling
test_invalid_agent_id() {
    set +e  # Disable immediate exit on error
    local result=$(./.claude/skills/redis-coordination/query-dlq.sh \
        --agent-id "!@#$%^&*()-invalid-agent" 2>&1)
    local exit_code=$?
    set -e

    assert "[ $exit_code -ne 0 ]" "Invalid agent ID not rejected"
    assert_contains "$result" "Invalid agent ID" "Error message missing for invalid agent ID"
}

# TTL expiration edge cases
test_ttl_expiration_edge_cases() {
    local task_id="ttl-edge-$(date +%s)"
    local short_ttl=60  # 1 minute

    # Write with extremely short TTL
    ./.claude/skills/redis-coordination/write-to-dlq.sh \
        --task-id "$task_id" \
        --agent-id "ttl-edge-tester" \
        --error '{"code": 999, "message": "TTL Edge Case"}' \
        --ttl "$short_ttl"

    # Wait slightly beyond TTL
    sleep $((short_ttl + 5))

    # Verify entry is automatically removed
    local query_result=$(./.claude/skills/redis-coordination/query-dlq.sh \
        --task-id "$task_id")

    assert_empty "$query_result" "DLQ entry not automatically expired"
}

# Run tests
main() {
    test_redis_connection_failure
    test_concurrent_dlq_writes
    test_invalid_agent_id
    test_ttl_expiration_edge_cases
    echo "Edge Cases Tests: PASSED"
}

main