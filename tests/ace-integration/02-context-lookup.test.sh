#!/usr/bin/env bash
# Test Suite for ACE Context Lookup Helper
# Phase 1.2 - Context Lookup Helper Tests

set -euo pipefail

# Source helper functions and configurations
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "${SCRIPT_DIR}/test-helpers.sh"

# Temporary Redis key prefix for testing
TEST_KEY_PREFIX="ace_test_context_lookup_"

# Helper function to generate test data
generate_test_tasks() {
    cat <<EOF
{"task1": "Implement user authentication system for web app", "domain": "backend"}
{"task2": "Design responsive dashboard layout", "domain": "frontend"}
{"task3": "Create machine learning model for customer churn prediction", "domain": "data-science"}
{"task4": "Set up continuous integration pipeline", "domain": "devops"}
EOF
}

# Test Cases
test_keyword_extraction() {
    local test_description="Implement user authentication system for web app"
    local keywords=$(extract_keywords "$test_description")

    assert_not_empty "$keywords" "Keyword extraction should return non-empty result"
    assert "$(echo "$keywords" | jq length)" -ge 3 "Should extract at least 3 keywords"

    # Validate specific keyword presence
    assert_contains "$keywords" "user" "Should contain relevant keywords"
    assert_contains "$keywords" "authentication" "Should contain domain-specific keywords"
}

test_domain_classification() {
    local test_description="Implement user authentication system with JWT tokens"
    local domain=$(classify_domain "$test_description")

    assert_not_empty "$domain" "Domain classification should return non-empty result"
    assert_equals "$domain" "backend" "Should correctly classify backend domain"
}

test_query_execution() {
    local test_task='{"description": "Develop machine learning recommendation engine", "domain": "data-science"}'
    local result=$(execute_context_query "$test_task")

    assert_not_empty "$result" "Query execution should return non-empty result"
    assert_json_valid "$result" "Result should be valid JSON"

    # Validate result structure
    local keywords=$(echo "$result" | jq -r '.keywords[]')
    local domain=$(echo "$result" | jq -r '.domain')

    assert_not_empty "$keywords" "Result should contain keywords"
    assert_not_empty "$domain" "Result should contain domain"
}

test_redis_storage() {
    local test_task='{"description": "Build secure API gateway", "domain": "backend"}'
    local task_id="test_task_123"

    # Store in Redis
    store_context_in_redis "$task_id" "$test_task"

    # Retrieve from Redis
    local retrieved_context=$(retrieve_context_from_redis "$task_id")

    assert_not_empty "$retrieved_context" "Should retrieve stored context"
    assert_json_valid "$retrieved_context" "Retrieved context should be valid JSON"
    assert_contains "$retrieved_context" "backend" "Retrieved context should match original"
}

test_ttl_expiration() {
    local test_task='{"description": "Optimize database query performance", "domain": "backend"}'
    local task_id="test_ttl_task"
    local ttl_seconds=10

    # Store with custom TTL
    store_context_in_redis "$task_id" "$test_task" "$ttl_seconds"

    # Check TTL is set correctly
    local current_ttl=$(redis-cli ttl "ace_context:${task_id}")

    assert "$(( current_ttl ))" -le "$ttl_seconds" "TTL should be set and decreasing"
    assert "$(( current_ttl ))" -gt 0 "TTL should be positive"
}

test_error_handling_invalid_input() {
    local invalid_task='{invalid json}'

    # Should handle invalid JSON gracefully
    local result=$(execute_context_query "$invalid_task" || true)

    assert_empty "$result" "Invalid input should return empty result"
}

test_error_handling_missing_files() {
    # Temporarily rename or remove required file
    local original_file="/path/to/context/helper.sh"
    local backup_file="${original_file}.bak"

    if [[ -f "$original_file" ]]; then
        mv "$original_file" "$backup_file"
    fi

    # Try to execute with missing file
    set +e
    local output=$(execute_context_query '{"description": "Test missing file"}' 2>&1 || true)
    set -e

    # Restore original file if it existed
    if [[ -f "$backup_file" ]]; then
        mv "$backup_file" "$original_file"
    fi

    assert_contains "$output" "ERROR" "Should produce error for missing files"
}

test_error_handling_redis_unavailable() {
    # Simulate Redis unavailability
    set +e
    redis-cli shutdown

    local result=$(execute_context_query '{"description": "Test Redis down"}' || true)

    # Restart Redis (assumes default config)
    redis-server --daemonize yes

    set -e

    assert_empty "$result" "Should handle Redis unavailability gracefully"
}

# Main test runner
main() {
    echo "Running ACE Context Lookup Helper Tests..."

    test_keyword_extraction
    test_domain_classification
    test_query_execution
    test_redis_storage
    test_ttl_expiration
    test_error_handling_invalid_input
    test_error_handling_missing_files
    test_error_handling_redis_unavailable

    echo "All tests completed successfully!"
}

# Run tests
main