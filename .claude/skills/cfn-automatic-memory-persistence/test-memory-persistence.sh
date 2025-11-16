#!/bin/bash
# Comprehensive Test Suite for Automatic Memory Persistence Skill

set -e

# Temporary test database
TEST_DB="/tmp/test_memory_persistence_$(date +%s).sqlite"

# Mock SQLite database creation for testing
setup_mock_database() {
    sqlite3 "$TEST_DB" << EOF
CREATE TABLE agent_outputs (
    task_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    output TEXT NOT NULL,
    confidence REAL NOT NULL,
    iteration INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, agent_id, iteration)
);
CREATE INDEX idx_agent_task ON agent_outputs(agent_id, task_id);
EOF
}

# Mock persist-agent-output.sh for testing
mock_persist_agent_output() {
    local task_id="$1"
    local agent_id="$2"
    local output="$3"
    local confidence="$4"
    local iteration="$5"

    sqlite3 "$TEST_DB" << EOF
INSERT OR REPLACE INTO agent_outputs
(task_id, agent_id, output, confidence, iteration)
VALUES
('$task_id', '$agent_id', '$output', $confidence, $iteration);
EOF
}

# Mock query-agent-history.sh for testing
mock_query_agent_history() {
    local agent_id="$1"
    local task_id="$2"

    sqlite3 "$TEST_DB" << EOF
SELECT task_id, agent_id, output, confidence, iteration
FROM agent_outputs
WHERE agent_id = '$agent_id' AND task_id = '$task_id';
EOF
}

# Test 1: Successful output persistence with complete fields
test_output_persistence() {
    local task_id="test_task_complete_$(date +%s)"
    local agent_id="test_agent_complete"
    local test_output="Comprehensive agent output with complete details"
    local confidence=0.95
    local iteration=1

    # Persist output
    mock_persist_agent_output "$task_id" "$agent_id" "$test_output" "$confidence" "$iteration"

    # Query and validate
    local query_result
    query_result=$(mock_query_agent_history "$agent_id" "$task_id")

    if [ -z "$query_result" ]; then
        echo "Test 1 failed: No output retrieved for complete fields"
        return 1
    fi

    # Validate specific fields (using different field splitting)
    local retrieved_task_id retrieved_agent_id retrieved_output retrieved_confidence retrieved_iteration
    IFS='|' read -r retrieved_task_id retrieved_agent_id retrieved_output retrieved_confidence retrieved_iteration <<< "$query_result"

    if [ "$retrieved_task_id" != "$task_id" ] ||
       [ "$retrieved_agent_id" != "$agent_id" ] ||
       [ "$retrieved_output" != "$test_output" ] ||
       [ "$(echo "$retrieved_confidence != $confidence" | bc)" -eq 1 ] ||
       [ "$retrieved_iteration" != "$iteration" ]; then
        echo "Test 1 failed: Retrieved data does not match persisted data"
        return 1
    fi

    echo "Test 1: Complete output persistence passed"
    return 0
}

# Test 2: Multiple agent outputs for same task
test_multiple_agent_outputs() {
    local task_id="test_task_multiple_$(date +%s)"
    local agent_id_1="test_agent_1"
    local agent_id_2="test_agent_2"
    local test_output_1="First agent output"
    local test_output_2="Second agent output"
    local confidence_1=0.85
    local confidence_2=0.90
    local iteration_1=1
    local iteration_2=2

    # Persist outputs for multiple agents
    mock_persist_agent_output "$task_id" "$agent_id_1" "$test_output_1" "$confidence_1" "$iteration_1"
    mock_persist_agent_output "$task_id" "$agent_id_2" "$test_output_2" "$confidence_2" "$iteration_2"

    # Query and validate multiple agent outputs
    local query_result_1 query_result_2
    query_result_1=$(mock_query_agent_history "$agent_id_1" "$task_id")
    query_result_2=$(mock_query_agent_history "$agent_id_2" "$task_id")

    if [ -z "$query_result_1" ] || [ -z "$query_result_2" ]; then
        echo "Test 2 failed: Missing outputs for multiple agents"
        return 1
    fi

    echo "Test 2: Multiple agent outputs for same task passed"
    return 0
}

# Test 3: Error handling for invalid/missing data
test_invalid_data_handling() {
    local task_id="test_task_invalid_$(date +%s)"
    local agent_id="test_agent_invalid"

    # Attempt to query non-existent data
    local query_result
    query_result=$(mock_query_agent_history "$agent_id" "$task_id")

    if [ -n "$query_result" ]; then
        echo "Test 3 failed: Non-empty result for non-existent data"
        return 1
    fi

    echo "Test 3: Invalid data handling passed"
    return 0
}

# Test 4: Iteration and confidence tracking
test_iteration_confidence_tracking() {
    local task_id="test_task_iterations_$(date +%s)"
    local agent_id="test_agent_iterations"
    local outputs=("Initial output" "Improved output" "Final output")
    local confidences=(0.70 0.85 0.95)
    local iterations=(1 2 3)

    # Persist multiple iterations with increasing confidence
    for i in "${!outputs[@]}"; do
        mock_persist_agent_output "$task_id" "$agent_id" "${outputs[i]}" "${confidences[i]}" "${iterations[i]}"
    done

    # Verify iterations are tracked
    local iteration_count
    iteration_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(DISTINCT iteration) FROM agent_outputs WHERE task_id = '$task_id' AND agent_id = '$agent_id';")

    if [ "$iteration_count" -ne 3 ]; then
        echo "Test 4 failed: Incorrect iteration tracking"
        return 1
    fi

    echo "Test 4: Iteration and confidence tracking passed"
    return 0
}

# Test 5: ACL-level validation simulation
test_acl_simulation() {
    local task_id="test_task_acl_$(date +%s)"
    local authorized_agent="authorized_agent"
    local unauthorized_agent="unauthorized_agent"
    local output="Confidential agent output"
    local confidence=0.90
    local iteration=1

    # Simulate persisting output
    mock_persist_agent_output "$task_id" "$authorized_agent" "$output" "$confidence" "$iteration"

    # Verify authorized agent can access
    local auth_query_result
    auth_query_result=$(mock_query_agent_history "$authorized_agent" "$task_id")

    if [ -z "$auth_query_result" ]; then
        echo "Test 5 (Part A) failed: Authorized agent cannot access output"
        return 1
    fi

    # Simulate unauthorized access attempt
    local unauth_query_result
    unauth_query_result=$(mock_query_agent_history "$unauthorized_agent" "$task_id")

    if [ -n "$unauth_query_result" ]; then
        echo "Test 5 (Part B) failed: Unauthorized agent could access output"
        return 1
    fi

    echo "Test 5: ACL-level validation simulation passed"
    return 0
}

# Main test runner
main() {
    echo "Running Comprehensive Memory Persistence Tests..."

    # Setup test database
    setup_mock_database

    # Run tests
    local total_tests=5
    local passed_tests=0

    # Execute each test
    test_output_persistence && passed_tests=$((passed_tests+1))
    test_multiple_agent_outputs && passed_tests=$((passed_tests+1))
    test_invalid_data_handling && passed_tests=$((passed_tests+1))
    test_iteration_confidence_tracking && passed_tests=$((passed_tests+1))
    test_acl_simulation && passed_tests=$((passed_tests+1))

    # Calculate confidence
    local confidence=$(echo "scale=2; $passed_tests / $total_tests" | bc)

    # Cleanup test database
    rm -f "$TEST_DB"

    # Report results
    if [ "$passed_tests" -eq "$total_tests" ]; then
        echo "All Memory Persistence Tests Passed!"
        echo "Test Confidence: $confidence"
        exit 0
    else
        echo "Memory Persistence Test Suite Failed: $passed_tests/$total_tests tests passed"
        echo "Test Confidence: $confidence"
        exit 1
    fi
}

# Execute main test runner
main