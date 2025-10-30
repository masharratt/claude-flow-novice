#!/bin/bash

# Test Helper Functions for ACE System Integration Tests

# Validate SQLite Setup
validate_sqlite_schema() {
    # Ensure context_reflections table exists with correct columns
    SCHEMA_CHECK=$(sqlite3 .artifacts/memory-store/context_reflections.db \
        ".schema context_reflections" | grep -c "sprint_name")

    if [[ "$SCHEMA_CHECK" -eq 0 ]]; then
        echo "❌ Invalid SQLite Schema"
        return 1
    fi
}

# Validate Redis Connectivity
validate_redis_connection() {
    redis-cli ping | grep -q PONG
    if [[ $? -ne 0 ]]; then
        echo "❌ Redis Connection Failed"
        return 1
    fi
}

# Validate Test Environment Prerequisites
pre_test_validation() {
    validate_sqlite_schema
    validate_redis_connection
}

# Initialize Test Environment
initialize_test_environment() {
    # Ensure directories exist
    mkdir -p .artifacts/logs
    mkdir -p .artifacts/test-results

    # Reset log files
    > .artifacts/logs/ace-e2e-test.log
    > .artifacts/test-results/ace-e2e-confidence.txt
}

# Error Handling Wrapper
safe_execute() {
    local command="$1"
    local error_message="${2:-Execution failed}"

    set +e
    eval "$command"
    local result=$?
    set -e

    if [[ $result -ne 0 ]]; then
        echo "❌ $error_message"
        return $result
    fi
}

# Cleanup after test
cleanup_test_environment() {
    # Optional: Add any cleanup logic
    :
}
