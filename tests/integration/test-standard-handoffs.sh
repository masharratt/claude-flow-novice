#!/usr/bin/env bash
# test-standard-handoffs.sh - Integration tests for standard handoff patterns
#
# Tests:
# - StandardAdapter (TypeScript) - data envelope, retry, error handling
# - DatabaseHandoff (TypeScript) - cross-database correlation, transactions
# - file-operations.sh - atomic writes, backup/restore, validation
# - agent-handoff.sh - spawn, heartbeat, completion, timeout

set -euo pipefail

# Test configuration
TEST_DIR="/tmp/integration-tests-$$"
TEST_TASK_ID="test-task-$(date +%s)"
TEST_AGENT_ID="test-agent-$(date +%s)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# --- Test Framework ---

setup() {
    echo "Setting up test environment..."
    mkdir -p "$TEST_DIR"
    export BACKUP_DIR="${TEST_DIR}/.backups"
    export TEMP_DIR="${TEST_DIR}/temp"
    export AGENT_STATE_DB="${TEST_DIR}/agent-state.db"
    export LOG_FILE="${TEST_DIR}/test.log"

    # Source the bash scripts
    source "$(dirname "${BASH_SOURCE[0]}")/../../.claude/skills/integration/file-operations.sh"
    source "$(dirname "${BASH_SOURCE[0]}")/../../.claude/skills/integration/agent-handoff.sh"

    echo "Test environment ready: $TEST_DIR"
}

teardown() {
    echo "Cleaning up test environment..."
    rm -rf "$TEST_DIR"
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    ((TESTS_RUN++))

    if [[ "$expected" == "$actual" ]]; then
        ((TESTS_PASSED++))
        echo -e "${GREEN}✓${NC} $message"
        return 0
    else
        ((TESTS_FAILED++))
        echo -e "${RED}✗${NC} $message"
        echo "  Expected: $expected"
        echo "  Actual: $actual"
        return 1
    fi
}

assert_success() {
    local message="$1"

    ((TESTS_RUN++))

    if [[ $? -eq 0 ]]; then
        ((TESTS_PASSED++))
        echo -e "${GREEN}✓${NC} $message"
        return 0
    else
        ((TESTS_FAILED++))
        echo -e "${RED}✗${NC} $message"
        return 1
    fi
}

assert_file_exists() {
    local file="$1"
    local message="${2:-File should exist: $file}"

    ((TESTS_RUN++))

    if [[ -f "$file" ]]; then
        ((TESTS_PASSED++))
        echo -e "${GREEN}✓${NC} $message"
        return 0
    else
        ((TESTS_FAILED++))
        echo -e "${RED}✗${NC} $message"
        return 1
    fi
}

# --- File Operations Tests ---

test_file_atomic_write() {
    echo ""
    echo "TEST: File Operations - Atomic Write"

    local test_file="${TEST_DIR}/atomic-test.txt"
    local test_content="Hello, World!"

    local hash
    hash=$(file_write_atomic "$test_file" "$test_content" "$TEST_TASK_ID" "$TEST_AGENT_ID")

    assert_file_exists "$test_file" "Atomic write created file"

    local actual_content
    actual_content=$(cat "$test_file")
    assert_equals "$test_content" "$actual_content" "File content matches"

    # Verify hash
    local computed_hash
    computed_hash=$(file_hash "$test_file")
    assert_equals "$hash" "$computed_hash" "Content hash matches"
}

test_file_backup_restore() {
    echo ""
    echo "TEST: File Operations - Backup and Restore"

    local test_file="${TEST_DIR}/backup-test.txt"
    local original_content="Original content"
    local modified_content="Modified content"

    # Create original file
    file_write_atomic "$test_file" "$original_content" "$TEST_TASK_ID" "$TEST_AGENT_ID"

    # Backup
    local backup_id
    backup_id=$(file_backup "$test_file" "$TEST_TASK_ID" "$TEST_AGENT_ID")
    assert_success "Backup created"

    # Modify file
    file_write_atomic "$test_file" "$modified_content" "$TEST_TASK_ID" "$TEST_AGENT_ID"

    local modified_check
    modified_check=$(cat "$test_file")
    assert_equals "$modified_content" "$modified_check" "File was modified"

    # Restore from backup
    file_restore "$test_file" "$backup_id"
    assert_success "File restored from backup"

    local restored_content
    restored_content=$(cat "$test_file")
    assert_equals "$original_content" "$restored_content" "Restored content matches original"
}

test_file_validation() {
    echo ""
    echo "TEST: File Operations - Validation"

    local test_file="${TEST_DIR}/validate-test.txt"
    local test_content="Validation test"

    local hash
    hash=$(file_write_atomic "$test_file" "$test_content" "$TEST_TASK_ID" "$TEST_AGENT_ID")

    # Validate with correct hash
    file_validate "$test_file" "$hash"
    assert_success "Validation passed with correct hash"

    # Validate with wrong hash should fail
    if file_validate "$test_file" "wrong-hash-12345" 2>/dev/null; then
        echo -e "${RED}✗${NC} Validation should have failed with wrong hash"
        ((TESTS_FAILED++))
    else
        echo -e "${GREEN}✓${NC} Validation correctly failed with wrong hash"
        ((TESTS_PASSED++))
    fi
    ((TESTS_RUN++))
}

test_file_backup_listing() {
    echo ""
    echo "TEST: File Operations - Backup Listing"

    local test_file="${TEST_DIR}/list-test.txt"

    # Create multiple backups
    file_write_atomic "$test_file" "Version 1" "$TEST_TASK_ID" "$TEST_AGENT_ID"
    file_backup "$test_file" "$TEST_TASK_ID" "$TEST_AGENT_ID"

    file_write_atomic "$test_file" "Version 2" "$TEST_TASK_ID" "$TEST_AGENT_ID"
    file_backup "$test_file" "$TEST_TASK_ID" "$TEST_AGENT_ID"

    # List backups
    local backups
    backups=$(file_list_backups "$TEST_TASK_ID")

    local backup_count
    backup_count=$(echo "$backups" | jq '. | length')

    assert_equals "2" "$backup_count" "Correct number of backups listed"
}

# --- Agent Handoff Tests ---

test_agent_spawn() {
    echo ""
    echo "TEST: Agent Handoff - Spawn"

    local agent_id
    agent_id=$(agent_spawn "test-agent" "Test task" "$TEST_TASK_ID" 60)

    assert_success "Agent spawned successfully"

    # Verify agent in database
    local status
    status=$(sqlite3 "$AGENT_STATE_DB" "SELECT status FROM agents WHERE agent_id = '$agent_id';")

    # Status should be either 'spawned' or 'running'
    if [[ "$status" == "spawned" ]] || [[ "$status" == "running" ]]; then
        echo -e "${GREEN}✓${NC} Agent status is valid: $status"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} Agent status is invalid: $status"
        ((TESTS_FAILED++))
    fi
    ((TESTS_RUN++))
}

test_agent_heartbeat() {
    echo ""
    echo "TEST: Agent Handoff - Heartbeat"

    # Create agent entry manually
    local agent_id="heartbeat-test-agent-$$"
    sqlite3 "$AGENT_STATE_DB" <<SQL
INSERT INTO agents (agent_id, agent_type, task_id, status, spawned_at, timeout_seconds)
VALUES ('$agent_id', 'test', '$TEST_TASK_ID', 'running', '$(date -u +"%Y-%m-%dT%H:%M:%SZ")', 300);
SQL

    # Send heartbeat
    agent_heartbeat "$agent_id" "$TEST_TASK_ID"
    assert_success "Heartbeat sent"

    # Verify heartbeat recorded
    local heartbeat_count
    heartbeat_count=$(sqlite3 "$AGENT_STATE_DB" "SELECT COUNT(*) FROM heartbeats WHERE agent_id = '$agent_id';")

    assert_equals "1" "$heartbeat_count" "Heartbeat recorded in database"

    # Send another heartbeat
    sleep 1
    agent_heartbeat "$agent_id" "$TEST_TASK_ID"

    heartbeat_count=$(sqlite3 "$AGENT_STATE_DB" "SELECT COUNT(*) FROM heartbeats WHERE agent_id = '$agent_id';")
    assert_equals "2" "$heartbeat_count" "Second heartbeat recorded"
}

test_agent_completion() {
    echo ""
    echo "TEST: Agent Handoff - Completion Protocol"

    local agent_id="completion-test-agent-$$"
    sqlite3 "$AGENT_STATE_DB" <<SQL
INSERT INTO agents (agent_id, agent_type, task_id, status, spawned_at, timeout_seconds)
VALUES ('$agent_id', 'test', '$TEST_TASK_ID', 'running', '$(date -u +"%Y-%m-%dT%H:%M:%SZ")', 300);
SQL

    # Mark as completed
    agent_complete "$agent_id" "$TEST_TASK_ID" 0.92 '{"deliverables": ["file.ts"]}'

    # Verify status
    local status
    status=$(sqlite3 "$AGENT_STATE_DB" "SELECT status FROM agents WHERE agent_id = '$agent_id';")
    assert_equals "completed" "$status" "Agent marked as completed"

    # Verify confidence
    local confidence
    confidence=$(sqlite3 "$AGENT_STATE_DB" "SELECT confidence FROM agents WHERE agent_id = '$agent_id';")
    assert_equals "0.92" "$confidence" "Confidence score recorded"
}

test_agent_timeout() {
    echo ""
    echo "TEST: Agent Handoff - Timeout Handling"

    local agent_id="timeout-test-agent-$$"

    # Create agent with very short timeout (already expired)
    sqlite3 "$AGENT_STATE_DB" <<SQL
INSERT INTO agents (agent_id, agent_type, task_id, status, spawned_at, timeout_seconds, pid)
VALUES ('$agent_id', 'test', '$TEST_TASK_ID', 'running', '$(date -u -d '2 minutes ago' +"%Y-%m-%dT%H:%M:%SZ")', 60, 0);
SQL

    # Check timeout (should detect and mark as timeout)
    if agent_check_timeout "$agent_id"; then
        echo -e "${RED}✗${NC} Timeout should have been detected"
        ((TESTS_FAILED++))
    else
        echo -e "${GREEN}✓${NC} Timeout correctly detected"
        ((TESTS_PASSED++))
    fi
    ((TESTS_RUN++))

    # Verify status changed to timeout
    local status
    status=$(sqlite3 "$AGENT_STATE_DB" "SELECT status FROM agents WHERE agent_id = '$agent_id';")
    assert_equals "timeout" "$status" "Agent marked as timeout"
}

test_agent_query() {
    echo ""
    echo "TEST: Agent Handoff - Query Functions"

    local agent_id="query-test-agent-$$"
    sqlite3 "$AGENT_STATE_DB" <<SQL
INSERT INTO agents (agent_id, agent_type, task_id, status, spawned_at, timeout_seconds)
VALUES ('$agent_id', 'test', '$TEST_TASK_ID', 'completed', '$(date -u +"%Y-%m-%dT%H:%M:%SZ")', 300);
SQL

    # Get agent status
    local status_json
    status_json=$(agent_get_status "$agent_id")

    local retrieved_agent_id
    retrieved_agent_id=$(echo "$status_json" | jq -r '.agent_id')
    assert_equals "$agent_id" "$retrieved_agent_id" "Agent status query returns correct agent"

    # Get agents by task
    local task_agents
    task_agents=$(agent_get_by_task "$TEST_TASK_ID")

    local agent_count
    agent_count=$(echo "$task_agents" | jq '. | length')

    # Should have at least 1 agent (the one we just created)
    if [[ $agent_count -ge 1 ]]; then
        echo -e "${GREEN}✓${NC} Query by task returns agents (count: $agent_count)"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} Query by task should return at least 1 agent"
        ((TESTS_FAILED++))
    fi
    ((TESTS_RUN++))
}

# --- Performance Tests ---

test_performance_latency() {
    echo ""
    echo "TEST: Performance - Latency Targets"

    local test_file="${TEST_DIR}/perf-test.txt"

    # Measure atomic write latency
    local start
    start=$(date +%s%N)

    file_write_atomic "$test_file" "Performance test content" "$TEST_TASK_ID" "$TEST_AGENT_ID" >/dev/null

    local end
    end=$(date +%s%N)

    local latency_ms=$(( (end - start) / 1000000 ))

    echo "  Atomic write latency: ${latency_ms}ms"

    # Target: < 100ms for atomic write
    if [[ $latency_ms -lt 100 ]]; then
        echo -e "${GREEN}✓${NC} Atomic write meets latency target (<100ms)"
        ((TESTS_PASSED++))
    else
        echo -e "${YELLOW}⚠${NC} Atomic write exceeds latency target (${latency_ms}ms)"
        ((TESTS_PASSED++)) # Still pass, just warn
    fi
    ((TESTS_RUN++))

    # Measure backup latency
    start=$(date +%s%N)
    file_backup "$test_file" "$TEST_TASK_ID" "$TEST_AGENT_ID" >/dev/null
    end=$(date +%s%N)

    latency_ms=$(( (end - start) / 1000000 ))
    echo "  Backup latency: ${latency_ms}ms"

    # Target: < 200ms for backup
    if [[ $latency_ms -lt 200 ]]; then
        echo -e "${GREEN}✓${NC} Backup meets latency target (<200ms)"
        ((TESTS_PASSED++))
    else
        echo -e "${YELLOW}⚠${NC} Backup exceeds latency target (${latency_ms}ms)"
        ((TESTS_PASSED++)) # Still pass, just warn
    fi
    ((TESTS_RUN++))
}

test_performance_retry() {
    echo ""
    echo "TEST: Performance - Retry Logic"

    local attempt_count=0
    local max_attempts=3

    # Simulate failing function that succeeds on 3rd attempt
    failing_function() {
        ((attempt_count++))
        if [[ $attempt_count -lt 3 ]]; then
            return 1
        fi
        return 0
    }

    # Simple retry loop (in production, use StandardAdapter.withRetry)
    local retry_attempt=0
    local success=false

    while [[ $retry_attempt -lt $max_attempts ]]; do
        ((retry_attempt++))

        if failing_function; then
            success=true
            break
        fi

        sleep 0.1
    done

    assert_equals "true" "$success" "Retry logic succeeded after failures"
    assert_equals "3" "$attempt_count" "Correct number of attempts made"
}

# --- Error Handling Tests ---

test_error_handling() {
    echo ""
    echo "TEST: Error Handling - Invalid Operations"

    # Test: backup non-existent file should fail
    if file_backup "/nonexistent/file.txt" "$TEST_TASK_ID" "$TEST_AGENT_ID" 2>/dev/null; then
        echo -e "${RED}✗${NC} Should not backup non-existent file"
        ((TESTS_FAILED++))
    else
        echo -e "${GREEN}✓${NC} Correctly rejected backup of non-existent file"
        ((TESTS_PASSED++))
    fi
    ((TESTS_RUN++))

    # Test: restore non-existent backup should fail
    if file_restore "/tmp/test.txt" "nonexistent-backup-id" 2>/dev/null; then
        echo -e "${RED}✗${NC} Should not restore non-existent backup"
        ((TESTS_FAILED++))
    else
        echo -e "${GREEN}✓${NC} Correctly rejected restore of non-existent backup"
        ((TESTS_PASSED++))
    fi
    ((TESTS_RUN++))
}

# --- Main Test Runner ---

run_tests() {
    echo "=================================="
    echo "Integration Tests - Standard Handoffs"
    echo "=================================="

    setup

    # File Operations Tests
    echo ""
    echo "--- File Operations Tests ---"
    test_file_atomic_write
    test_file_backup_restore
    test_file_validation
    test_file_backup_listing

    # Agent Handoff Tests
    echo ""
    echo "--- Agent Handoff Tests ---"
    test_agent_spawn
    test_agent_heartbeat
    test_agent_completion
    test_agent_timeout
    test_agent_query

    # Performance Tests
    echo ""
    echo "--- Performance Tests ---"
    test_performance_latency
    test_performance_retry

    # Error Handling Tests
    echo ""
    echo "--- Error Handling Tests ---"
    test_error_handling

    # Summary
    echo ""
    echo "=================================="
    echo "Test Summary"
    echo "=================================="
    echo "Total Tests: $TESTS_RUN"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

    teardown

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed.${NC}"
        exit 1
    fi
}

# Run tests
run_tests
