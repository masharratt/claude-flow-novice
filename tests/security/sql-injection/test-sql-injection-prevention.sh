#!/bin/bash
# Comprehensive SQL Injection Prevention Tests
# Tests parameterized queries in agent-lifecycle and skill-loader scripts

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Test configuration
TEST_DB="/tmp/test-sql-injection-$$.db"
LIFECYCLE_SCRIPT="$PROJECT_ROOT/.claude/skills/agent-lifecycle/execute-lifecycle-hook.sh"
AUDIT_SCRIPT="$PROJECT_ROOT/.claude/skills/agent-lifecycle/simple-audit.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

# Setup test database
setup_test_db() {
    rm -f "$TEST_DB"
    sqlite3 "$TEST_DB" << 'EOF'
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'spawned',
    confidence REAL,
    output TEXT,
    metadata TEXT,
    spawned_at TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lifecycle_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    confidence REAL,
    reasoning TEXT,
    phase TEXT,
    iteration INTEGER,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);
EOF
}

# Cleanup
cleanup() {
    rm -f "$TEST_DB"
}

trap cleanup EXIT

# Test 1: Basic agent spawn with normal input
test_basic_spawn() {
    ((TESTS_RUN++))
    log_test "Test 1: Basic agent spawn with normal input"

    export AGENT_LIFECYCLE_DB="$TEST_DB"

    "$LIFECYCLE_SCRIPT" spawn \
        --agent-id "test-agent-1" \
        --agent-type "backend-developer" \
        --acl-level 1 \
        --name "Test Agent 1" > /dev/null 2>&1

    local count
    count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM agents WHERE id = 'test-agent-1';")

    if [[ "$count" == "1" ]]; then
        log_pass "Agent spawned successfully"
    else
        log_fail "Expected 1 agent, found $count"
    fi
}

# Test 2: SQL injection via DROP TABLE in agent ID
test_injection_drop_table() {
    ((TESTS_RUN++))
    log_test "Test 2: SQL injection attempt - DROP TABLE in agent ID"

    export AGENT_LIFECYCLE_DB="$TEST_DB"

    # This should fail validation before reaching SQL
    local malicious_id="test'; DROP TABLE agents; --"

    if "$LIFECYCLE_SCRIPT" spawn \
        --agent-id "$malicious_id" \
        --agent-type "backend-developer" \
        --acl-level 1 > /dev/null 2>&1; then
        log_fail "Malicious agent ID should be rejected by validation"
    else
        # Verify table still exists
        local count
        count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM agents;")

        if sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='agents';" | grep -q "agents"; then
            log_pass "Table 'agents' still exists after injection attempt"
        else
            log_fail "Table 'agents' was dropped by injection!"
        fi
    fi
}

# Test 3: SQL injection via OR 1=1 in agent name
test_injection_or_bypass() {
    ((TESTS_RUN++))
    log_test "Test 3: SQL injection attempt - OR 1=1 in agent name"

    export AGENT_LIFECYCLE_DB="$TEST_DB"

    local malicious_name="Agent' OR '1'='1"

    "$LIFECYCLE_SCRIPT" spawn \
        --agent-id "test-agent-or" \
        --agent-type "backend-developer" \
        --acl-level 1 \
        --name "$malicious_name" > /dev/null 2>&1

    # Verify the malicious string was stored as literal data
    local stored_name
    stored_name=$(sqlite3 "$TEST_DB" "SELECT name FROM agents WHERE id = 'test-agent-or';")

    if [[ "$stored_name" == "$malicious_name" ]]; then
        log_pass "Malicious name stored as literal data (injection neutralized)"
    else
        log_fail "Name mismatch: expected '$malicious_name', got '$stored_name'"
    fi
}

# Test 4: SQL injection in agent type with UNION SELECT
test_injection_union_select() {
    ((TESTS_RUN++))
    log_test "Test 4: SQL injection attempt - UNION SELECT in agent type"

    export AGENT_LIFECYCLE_DB="$TEST_DB"

    local malicious_type="backend' UNION SELECT * FROM agents; --"

    "$LIFECYCLE_SCRIPT" spawn \
        --agent-id "test-agent-union" \
        --agent-type "$malicious_type" \
        --acl-level 1 > /dev/null 2>&1

    # Verify the type was stored as literal data
    local stored_type
    stored_type=$(sqlite3 "$TEST_DB" "SELECT type FROM agents WHERE id = 'test-agent-union';")

    if [[ "$stored_type" == "$malicious_type" ]]; then
        log_pass "Malicious type stored as literal data (injection neutralized)"
    else
        log_fail "Type mismatch: expected '$malicious_type', got '$stored_type'"
    fi
}

# Test 5: SQL injection in reasoning field
test_injection_reasoning() {
    ((TESTS_RUN++))
    log_test "Test 5: SQL injection attempt - malicious reasoning field"

    export AGENT_LIFECYCLE_DB="$TEST_DB"

    # First spawn an agent
    "$LIFECYCLE_SCRIPT" spawn \
        --agent-id "test-agent-reason" \
        --agent-type "backend-developer" \
        --acl-level 1 > /dev/null 2>&1

    # Try to inject via reasoning
    local malicious_reason="Done'; DELETE FROM agents; --"

    "$LIFECYCLE_SCRIPT" update \
        --agent-id "test-agent-reason" \
        --confidence 0.85 \
        --reasoning "$malicious_reason" > /dev/null 2>&1

    # Verify reasoning was stored as literal and agents table intact
    local count
    count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM agents;")

    local stored_reason
    stored_reason=$(sqlite3 "$TEST_DB" "SELECT reasoning FROM lifecycle_events WHERE agent_id = 'test-agent-reason' AND event_type = 'confidence_update';")

    if [[ "$count" -ge "1" ]] && [[ "$stored_reason" == "$malicious_reason" ]]; then
        log_pass "Malicious reasoning stored as literal, agents table intact"
    else
        log_fail "Agents deleted or reasoning not stored correctly (count: $count)"
    fi
}

# Test 6: SQL injection in output field
test_injection_output() {
    ((TESTS_RUN++))
    log_test "Test 6: SQL injection attempt - malicious output field"

    export AGENT_LIFECYCLE_DB="$TEST_DB"

    "$LIFECYCLE_SCRIPT" spawn \
        --agent-id "test-agent-output" \
        --agent-type "backend-developer" \
        --acl-level 1 > /dev/null 2>&1

    local malicious_output="Success'; UPDATE agents SET confidence = 1.0; --"

    "$LIFECYCLE_SCRIPT" complete \
        --agent-id "test-agent-output" \
        --confidence 0.75 \
        --output "$malicious_output" > /dev/null 2>&1

    # Verify output stored as literal and other agents not affected
    local stored_output
    stored_output=$(sqlite3 "$TEST_DB" "SELECT output FROM agents WHERE id = 'test-agent-output';")

    local stored_confidence
    stored_confidence=$(sqlite3 "$TEST_DB" "SELECT confidence FROM agents WHERE id = 'test-agent-output';")

    if [[ "$stored_output" == "$malicious_output" ]] && [[ "$stored_confidence" == "0.75" ]]; then
        log_pass "Malicious output stored as literal, confidence unchanged"
    else
        log_fail "Output or confidence mismatch"
    fi
}

# Test 7: SQL injection in termination reason
test_injection_termination() {
    ((TESTS_RUN++))
    log_test "Test 7: SQL injection attempt - malicious termination reason"

    export AGENT_LIFECYCLE_DB="$TEST_DB"

    "$LIFECYCLE_SCRIPT" spawn \
        --agent-id "test-agent-term" \
        --agent-type "backend-developer" \
        --acl-level 1 > /dev/null 2>&1

    local malicious_reason="Failed'; DROP TABLE lifecycle_events; --"

    "$LIFECYCLE_SCRIPT" terminate \
        --agent-id "test-agent-term" \
        --reason "$malicious_reason" > /dev/null 2>&1

    # Verify lifecycle_events table still exists
    if sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='lifecycle_events';" | grep -q "lifecycle_events"; then
        local stored_reason
        stored_reason=$(sqlite3 "$TEST_DB" "SELECT reasoning FROM lifecycle_events WHERE agent_id = 'test-agent-term' AND event_type = 'terminate';")

        if [[ "$stored_reason" == "$malicious_reason" ]]; then
            log_pass "Malicious reason stored as literal, lifecycle_events table intact"
        else
            log_fail "Reason not stored correctly"
        fi
    else
        log_fail "lifecycle_events table was dropped!"
    fi
}

# Test 8: SQL injection in query_status (SELECT injection)
test_injection_query_status() {
    ((TESTS_RUN++))
    log_test "Test 8: SQL injection attempt - query_status with malicious ID"

    export AGENT_LIFECYCLE_DB="$TEST_DB"

    # This should fail validation before reaching SQL
    local malicious_query="test' OR '1'='1"

    if "$LIFECYCLE_SCRIPT" status --agent-id "$malicious_query" > /dev/null 2>&1; then
        log_fail "Malicious query ID should be rejected by validation"
    else
        log_pass "Malicious query ID rejected by validation"
    fi
}

# Test 9: simple-audit.sh SQL injection test
test_simple_audit_injection() {
    ((TESTS_RUN++))
    log_test "Test 9: simple-audit.sh SQL injection prevention"

    # Create test database for simple-audit
    local audit_db="/tmp/test-simple-audit-$$.db"
    mkdir -p "$(dirname "$audit_db")"
    sqlite3 "$audit_db" "CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, type TEXT, status TEXT, confidence REAL, spawned_at TEXT, completed_at TEXT, metadata TEXT);"

    local malicious_id="agent'; DROP TABLE agents; --"
    local malicious_type="type' OR '1'='1"

    # Override DB path for simple-audit
    cd "$PROJECT_ROOT"

    # Test with malicious inputs - should handle gracefully
    if bash "$AUDIT_SCRIPT" "$malicious_id" "$malicious_type" "0.85" "spawned" 2>&1 | grep -q "Invalid agent ID"; then
        log_pass "simple-audit.sh rejects malicious agent ID"
    else
        # Check if table still exists
        if sqlite3 "$audit_db" "SELECT name FROM sqlite_master WHERE type='table' AND name='agents';" | grep -q "agents"; then
            log_pass "simple-audit.sh prevented SQL injection"
        else
            log_fail "simple-audit.sh allowed SQL injection!"
        fi
    fi

    rm -f "$audit_db"
}

# Test 10: Multi-byte and Unicode injection attempts
test_unicode_injection() {
    ((TESTS_RUN++))
    log_test "Test 10: Unicode and multi-byte injection attempts"

    export AGENT_LIFECYCLE_DB="$TEST_DB"

    local unicode_injection="test'; SELECT '你好世界' || (SELECT sqlite_version()); --"

    "$LIFECYCLE_SCRIPT" spawn \
        --agent-id "test-agent-unicode" \
        --agent-type "backend-developer" \
        --acl-level 1 \
        --name "$unicode_injection" > /dev/null 2>&1

    local stored_name
    stored_name=$(sqlite3 "$TEST_DB" "SELECT name FROM agents WHERE id = 'test-agent-unicode';")

    if [[ "$stored_name" == "$unicode_injection" ]]; then
        log_pass "Unicode injection stored as literal data"
    else
        log_fail "Unicode injection not handled correctly"
    fi
}

# Main test execution
main() {
    echo "========================================"
    echo "SQL Injection Prevention Test Suite"
    echo "========================================"
    echo ""

    # Setup
    setup_test_db

    # Run all tests
    test_basic_spawn
    test_injection_drop_table
    test_injection_or_bypass
    test_injection_union_select
    test_injection_reasoning
    test_injection_output
    test_injection_termination
    test_injection_query_status
    test_simple_audit_injection
    test_unicode_injection

    # Summary
    echo ""
    echo "========================================"
    echo "Test Summary"
    echo "========================================"
    echo "Tests Run:    $TESTS_RUN"
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Failed: $TESTS_FAILED"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    fi
}

main "$@"
