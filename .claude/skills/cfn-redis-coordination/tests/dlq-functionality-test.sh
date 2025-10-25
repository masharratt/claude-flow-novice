#!/bin/bash
# DLQ Functionality Test Suite
# Validates Dead Letter Queue write, expiration, and query mechanisms

set -euo pipefail

# Source common test utilities
source "$(dirname "$0")/test-utils.sh"

# Generate test configuration
generate_test_config() {
    local config_file="/tmp/dlq-test-config.json"
    cat > "$config_file" << EOF
{
    "dlq_max_retries": 3,
    "dlq_ttl_days": 7,
    "dlq_write_mode": "strict",
    "redis_connection": {
        "host": "localhost",
        "port": 6379
    }
}
EOF
    echo "$config_file"
}

# Test DLQ write after max retries
test_dlq_write() {
    local config_file=$(generate_test_config)
    local task_id="test-task-$(date +%s)"
    local agent_id="tester-dlq"
    local error_details='{"code": 500, "message": "Test Error"}'

    # Simulate max retry failure
    local result=$(./.claude/skills/redis-coordination/write-to-dlq.sh \
        --task-id "$task_id" \
        --agent-id "$agent_id" \
        --error "$error_details" \
        --config "$config_file")

    assert_not_empty "$result" "DLQ write failed"

    # Validate DLQ entry structure
    local dlq_entry=$(redis-cli get "dlq:$task_id:$agent_id")
    assert_json_valid "$dlq_entry" "Invalid DLQ JSON structure"

    # Check specific fields
    local extracted_agent_id=$(echo "$dlq_entry" | jq -r '.agent_id')
    assert_equal "$extracted_agent_id" "$agent_id" "Agent ID not preserved in DLQ"
}

# Test TTL expiration
test_dlq_ttl() {
    local config_file=$(generate_test_config)
    local task_id="ttl-test-$(date +%s)"
    local agent_id="tester-ttl"
    local error_details='{"code": 404, "message": "Resource Not Found"}'

    # Write to DLQ
    ./.claude/skills/redis-coordination/write-to-dlq.sh \
        --task-id "$task_id" \
        --agent-id "$agent_id" \
        --error "$error_details" \
        --config "$config_file"

    # Check TTL (should be close to 7 days)
    local ttl=$(redis-cli ttl "dlq:$task_id:$agent_id")
    assert "[ $ttl -ge 604600 ] && [ $ttl -le 604800 ]" "TTL not set correctly"
}

# Test query-dlq script
test_dlq_query() {
    # Populate test DLQ entries
    local task_ids=("query-test-1" "query-test-2")
    for task_id in "${task_ids[@]}"; do
        ./.claude/skills/redis-coordination/write-to-dlq.sh \
            --task-id "$task_id" \
            --agent-id "tester-query" \
            --error '{"code": 503, "message": "Test Query Error"}'
    done

    # Query DLQ
    local query_result=$(./.claude/skills/redis-coordination/query-dlq.sh \
        --agent-id "tester-query")

    assert_not_empty "$query_result" "DLQ query returned no results"

    # Validate query results contain expected task IDs
    for task_id in "${task_ids[@]}"; do
        assert "echo '$query_result' | grep -q '$task_id'" "Task ID $task_id not found in query results"
    done
}

# Run tests
main() {
    test_dlq_write
    test_dlq_ttl
    test_dlq_query
    echo "DLQ Functionality Tests: PASSED"
}

main