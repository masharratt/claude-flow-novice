#!/usr/bin/env bash
# Input Validation and Security Test Suite
# Validates input handling and prevents potential injection scenarios

set -euo pipefail

# Source the main script to access validation functions
source "$(dirname "$0")/.claude/skills/cfn-cfn-test-integration.sh"

# Test Cases for validate_input function
test_input_validation() {
    local test_cases=(
        "valid_task_id:integration-test-task:task_id:pass"
        "valid_agent_id:test-agent-1:agent_id:pass"
        "invalid_task_id_with_space:test task:task_id:fail"
        "invalid_task_id_with_special_chars:test@task:task_id:fail"
        "invalid_agent_id_with_special_chars:test!agent:agent_id:fail"
    )

    for test_case in "${test_cases[@]}"; do
        local name=$(echo "$test_case" | cut -d: -f1)
        local input=$(echo "$test_case" | cut -d: -f2)
        local input_type=$(echo "$test_case" | cut -d: -f3)
        local expected=$(echo "$test_case" | cut -d: -f4)

        echo "Running test case: $name"

        if [[ "$expected" == "pass" ]]; then
            validate_input "$input" "$input_type"
            echo "✅ PASS: $name - Successfully validated"
        else
            set +e
            validate_input "$input" "$input_type" 2>/dev/null
            local exit_code=$?
            set -e

            if [ "$exit_code" -ne 0 ]; then
                echo "✅ PASS: $name - Correctly rejected invalid input"
            else
                echo "❌ FAIL: $name - Failed to reject invalid input"
                exit 1
            fi
        fi
    done
}

# Test SQLite Query Safety
test_sqlite_query_safety() {
    local db_file=$(mktemp)
    local bad_input="'; DROP TABLE agent_memory; --"

    # Setup test database
    sqlite3 "$db_file" <<EOF
CREATE TABLE agent_memory (
    task_id TEXT,
    event_data TEXT
);
INSERT INTO agent_memory VALUES ('test-task', 'sample data');
EOF

    # Attempt query with malicious input
    set +e
    local query_result=$(sqlite3 "$db_file" \
        "SELECT COUNT(*) FROM agent_memory WHERE task_id = '$bad_input';" 2>/dev/null)
    local exit_code=$?
    set -e

    # Verify query did not modify the database
    local row_count=$(sqlite3 "$db_file" "SELECT COUNT(*) FROM agent_memory;")

    if [ "$row_count" -eq 1 ] && [ "$exit_code" -eq 0 ]; then
        echo "✅ PASS: SQLite query safety - Malicious input contained"
    else
        echo "❌ FAIL: SQLite query safety - Potential vulnerability"
        exit 1
    fi

    # Cleanup
    rm -f "$db_file"
}

# Main test runner
main() {
    echo "=== Input Validation Security Tests ==="

    test_input_validation
    test_sqlite_query_safety

    echo "=== All Security Tests Passed ==="
}

# Run tests
main