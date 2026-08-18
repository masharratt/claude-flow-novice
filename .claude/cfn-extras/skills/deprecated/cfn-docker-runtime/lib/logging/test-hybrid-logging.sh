#!/usr/bin/env bash
# Test hybrid logging system: Text files + SQLite
# Validates both logging mechanisms work correctly

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_test() { echo -e "${YELLOW}[TEST]${NC} $*"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $*"; }

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Cleanup function
cleanup() {
    log_test "Cleaning up test resources..."
    docker rm -f test-logging-container 2>/dev/null || true
    rm -rf /tmp/test-hybrid-logging
}

trap cleanup EXIT

# Test 1: Initialize hybrid logging
test_init() {
    log_test "Test 1: Initialize hybrid logging"

    TASK_ID="test-task-$(date +%s)"
    LOG_DIR="logs/docker-mode/${TASK_ID}"

    # Initialize
    "$SCRIPT_DIR/init-hybrid-logging.sh" "$TASK_ID" >/dev/null 2>&1

    # Verify database created
    if [[ -f "$LOG_DIR/logs.db" ]]; then
        log_pass "SQLite database created"
        ((TESTS_PASSED++))
    else
        log_fail "SQLite database not created"
        ((TESTS_FAILED++))
        return 1
    fi

    # Verify schema
    TABLES=$(sqlite3 "$LOG_DIR/logs.db" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" | tr '\n' ' ')
    EXPECTED="container_events container_logs coordination_events gate_checks performance_metrics product_owner_decisions validator_consensus"

    if [[ "$TABLES" == *"container_logs"* && "$TABLES" == *"container_events"* ]]; then
        log_pass "Schema initialized correctly"
        ((TESTS_PASSED++))
    else
        log_fail "Schema incomplete. Got: $TABLES"
        ((TESTS_FAILED++))
        return 1
    fi

    # Verify query scripts copied
    if [[ -f "$LOG_DIR/queries/analytics-summary.sh" ]]; then
        log_pass "Query scripts installed"
        ((TESTS_PASSED++))
    else
        log_fail "Query scripts not installed"
        ((TESTS_FAILED++))
    fi

    # Verify README
    if [[ -f "$LOG_DIR/README.md" ]]; then
        log_pass "README created"
        ((TESTS_PASSED++))
    else
        log_fail "README not created"
        ((TESTS_FAILED++))
    fi

    # Export for next tests
    export TEST_TASK_ID="$TASK_ID"
    export TEST_LOG_DIR="$LOG_DIR"
    export TEST_DB_PATH="$LOG_DIR/logs.db"
}

# Test 2: Log container spawn event
test_container_spawn() {
    log_test "Test 2: Log container spawn event"

    source "$SCRIPT_DIR/sqlite-helpers.sh"

    CONTAINER_ID="test-container-123"
    AGENT_ID="test-agent-1"
    STARTED_AT=$(date -u +"%Y-%m-%d %H:%M:%S")

    log_container_spawn "$TEST_DB_PATH" "$TEST_TASK_ID" "$AGENT_ID" "$CONTAINER_ID" "$STARTED_AT" '{"test": true}'

    # Verify
    COUNT=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM container_events WHERE container_id='$CONTAINER_ID' AND event_type='spawn';")

    if [[ "$COUNT" == "1" ]]; then
        log_pass "Container spawn logged to database"
        ((TESTS_PASSED++))
    else
        log_fail "Container spawn not logged. Count: $COUNT"
        ((TESTS_FAILED++))
    fi
}

# Test 3: Log container logs
test_log_lines() {
    log_test "Test 3: Log container log lines"

    source "$SCRIPT_DIR/sqlite-helpers.sh"

    CONTAINER_ID="test-container-123"
    AGENT_ID="test-agent-1"
    TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S")

    # Log stdout
    log_to_db "$TEST_DB_PATH" "$TEST_TASK_ID" "$AGENT_ID" "$CONTAINER_ID" "$TIMESTAMP" "Test stdout line" "stdout"

    # Log stderr
    log_to_db "$TEST_DB_PATH" "$TEST_TASK_ID" "$AGENT_ID" "$CONTAINER_ID" "$TIMESTAMP" "Test stderr line" "stderr"

    # Verify
    STDOUT_COUNT=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM container_logs WHERE stream='stdout';")
    STDERR_COUNT=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM container_logs WHERE stream='stderr';")

    if [[ "$STDOUT_COUNT" == "1" && "$STDERR_COUNT" == "1" ]]; then
        log_pass "Log lines inserted correctly"
        ((TESTS_PASSED++))
    else
        log_fail "Log lines not inserted. stdout: $STDOUT_COUNT, stderr: $STDERR_COUNT"
        ((TESTS_FAILED++))
    fi
}

# Test 4: Log container exit
test_container_exit() {
    log_test "Test 4: Log container exit event"

    source "$SCRIPT_DIR/sqlite-helpers.sh"

    CONTAINER_ID="test-container-123"
    AGENT_ID="test-agent-1"
    STARTED_AT=$(date -u +"%Y-%m-%d %H:%M:%S")
    sleep 1
    FINISHED_AT=$(date -u +"%Y-%m-%d %H:%M:%S")

    log_container_exit "$TEST_DB_PATH" "$TEST_TASK_ID" "$AGENT_ID" "$CONTAINER_ID" 0 "$STARTED_AT" "$FINISHED_AT"

    # Verify
    EXIT_COUNT=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM container_events WHERE event_type='exit' AND exit_code=0;")
    DURATION=$(sqlite3 "$TEST_DB_PATH" "SELECT duration_seconds FROM container_events WHERE event_type='exit' LIMIT 1;")

    if [[ "$EXIT_COUNT" == "1" ]]; then
        log_pass "Container exit logged (duration: ${DURATION}s)"
        ((TESTS_PASSED++))
    else
        log_fail "Container exit not logged. Count: $EXIT_COUNT"
        ((TESTS_FAILED++))
    fi
}

# Test 5: Log gate check
test_gate_check() {
    log_test "Test 5: Log gate check result"

    source "$SCRIPT_DIR/sqlite-helpers.sh"

    TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S")

    log_gate_check "$TEST_DB_PATH" "$TEST_TASK_ID" 1 0.95 0.90 1 3 "$TIMESTAMP"

    # Verify
    GATE_COUNT=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM gate_checks WHERE iteration=1 AND passed=1;")

    if [[ "$GATE_COUNT" == "1" ]]; then
        log_pass "Gate check logged"
        ((TESTS_PASSED++))
    else
        log_fail "Gate check not logged. Count: $GATE_COUNT"
        ((TESTS_FAILED++))
    fi
}

# Test 6: Log validator consensus
test_validator_consensus() {
    log_test "Test 6: Log validator consensus"

    source "$SCRIPT_DIR/sqlite-helpers.sh"

    TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S")

    log_validator_consensus "$TEST_DB_PATH" "$TEST_TASK_ID" 1 "validator-1" 0.92 "Looks good" "$TIMESTAMP"

    # Verify
    CONSENSUS_COUNT=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM validator_consensus WHERE validator_id='validator-1';")

    if [[ "$CONSENSUS_COUNT" == "1" ]]; then
        log_pass "Validator consensus logged"
        ((TESTS_PASSED++))
    else
        log_fail "Validator consensus not logged. Count: $CONSENSUS_COUNT"
        ((TESTS_FAILED++))
    fi
}

# Test 7: Run query scripts
test_query_scripts() {
    log_test "Test 7: Run query scripts"

    cd "$TEST_LOG_DIR"

    # Test analytics summary
    if ./queries/analytics-summary.sh logs.db "$TEST_TASK_ID" >/dev/null 2>&1; then
        log_pass "Analytics summary query works"
        ((TESTS_PASSED++))
    else
        log_fail "Analytics summary query failed"
        ((TESTS_FAILED++))
    fi

    # Test gate checks query
    if ./queries/query-gate-checks.sh logs.db "$TEST_TASK_ID" >/dev/null 2>&1; then
        log_pass "Gate checks query works"
        ((TESTS_PASSED++))
    else
        log_fail "Gate checks query failed"
        ((TESTS_FAILED++))
    fi

    # Test consensus query
    if ./queries/query-consensus-history.sh logs.db "$TEST_TASK_ID" >/dev/null 2>&1; then
        log_pass "Consensus history query works"
        ((TESTS_PASSED++))
    else
        log_fail "Consensus history query failed"
        ((TESTS_FAILED++))
    fi

    cd - >/dev/null
}

# Test 8: Integration test with real container
test_real_container() {
    log_test "Test 8: Integration test with real container (optional)"

    if ! command -v docker &>/dev/null; then
        log_test "Docker not available, skipping integration test"
        return 0
    fi

    TASK_ID="integration-test-$(date +%s)"
    LOG_DIR="logs/docker-mode/${TASK_ID}"
    DB_PATH="$LOG_DIR/logs.db"

    # Initialize
    "$SCRIPT_DIR/init-hybrid-logging.sh" "$TASK_ID" >/dev/null 2>&1

    # Spawn test container
    CONTAINER_ID=$(docker run -d alpine sh -c "echo 'stdout test'; echo 'stderr test' >&2; sleep 2; exit 0")

    # Capture logs
    "$SCRIPT_DIR/capture-container-logs.sh" "$CONTAINER_ID" "integration-agent" "$LOG_DIR" "$DB_PATH" "$TASK_ID" &
    CAPTURE_PID=$!

    # Wait for container
    docker wait "$CONTAINER_ID" >/dev/null 2>&1

    # Wait for capture to finish
    wait $CAPTURE_PID 2>/dev/null || true

    # Verify text files
    if [[ -f "$LOG_DIR/integration-agent-stdout.log" && -f "$LOG_DIR/integration-agent-stderr.log" ]]; then
        log_pass "Text files created"
        ((TESTS_PASSED++))
    else
        log_fail "Text files not created"
        ((TESTS_FAILED++))
    fi

    # Verify database entries
    LOG_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM container_logs;")
    EVENT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM container_events;")

    if [[ "$LOG_COUNT" -ge 2 && "$EVENT_COUNT" -ge 2 ]]; then
        log_pass "Database populated (logs: $LOG_COUNT, events: $EVENT_COUNT)"
        ((TESTS_PASSED++))
    else
        log_fail "Database not populated. logs: $LOG_COUNT, events: $EVENT_COUNT"
        ((TESTS_FAILED++))
    fi

    # Cleanup
    docker rm -f "$CONTAINER_ID" 2>/dev/null || true
}

# Run all tests
main() {
    echo "=== CFN Hybrid Logging Test Suite ==="
    echo ""

    test_init
    test_container_spawn
    test_log_lines
    test_container_exit
    test_gate_check
    test_validator_consensus
    test_query_scripts
    test_real_container

    echo ""
    echo "=== Test Results ==="
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_pass "All tests passed!"
        exit 0
    else
        log_fail "Some tests failed"
        exit 1
    fi
}

main
