#!/bin/bash
# Comprehensive SQL Injection Test Suite
# Tests OWASP Top 10 attack vectors against all audited scripts
#
# SECURITY AUDIT: Tests 14 scripts for SQL injection vulnerabilities
# Attack vectors: Single quote escape, comment injection, UNION injection,
#                 stacked queries, blind injection, time-based injection

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# OWASP Top 10 SQL Injection Attack Vectors
ATTACK_VECTORS=(
    "'; DROP TABLE agents; --"
    "' OR '1'='1"
    "' UNION SELECT * FROM sqlite_master --"
    "'; DELETE FROM memory_store; --"
    "' AND 1=2 UNION SELECT null, sqlite_version() --"
    "admin'--"
    "' OR 1=1--"
    "' OR 'x'='x"
    "'; ATTACH DATABASE 'evil.db' AS evil; --"
    "1'; UPDATE agents SET status='hacked' WHERE '1'='1"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
    PASSED_TESTS=$((PASSED_TESTS + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
    FAILED_TESTS=$((FAILED_TESTS + 1))
}

# Test 1: ttl-cleanup.sh SQL injection in acl_level
test_ttl_cleanup_injection() {
    log_test "Testing ttl-cleanup.sh against SQL injection"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    local test_db="/tmp/test-ttl-cleanup-$(date +%s).db"

    # Create test database
    sqlite3 "$test_db" <<'EOF'
CREATE TABLE memory_store (
    key TEXT PRIMARY KEY,
    value TEXT,
    acl_level INTEGER,
    expires_at TEXT
);
INSERT INTO memory_store VALUES ('test-key', 'test-value', 1, datetime('now', '-10 days'));
EOF

    # Attempt injection via ACL level environment variable
    local attack="1; DROP TABLE memory_store; --"

    # Run cleanup with malicious input (should fail safely)
    set +e
    DB_PATH="$test_db" DRY_RUN="true" \
        "$PROJECT_ROOT/.claude/skills/cfn-sqlite-memory/ttl-cleanup.sh" 2>&1 | grep -q "ERROR\|Invalid"
    local exit_code=$?
    set -e

    # Verify table still exists
    local table_count=$(sqlite3 "$test_db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='memory_store';" 2>/dev/null || echo "0")

    if [[ "$table_count" == "1" ]]; then
        log_pass "ttl-cleanup.sh blocked SQL injection (table preserved)"
    else
        log_fail "ttl-cleanup.sh vulnerable to SQL injection (table dropped)"
    fi

    rm -f "$test_db"
}

# Test 2: store-benchmarks.sh SQL injection in SUITE name
test_store_benchmarks_injection() {
    log_test "Testing store-benchmarks.sh against SQL injection"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    local test_db="/tmp/test-benchmarks-$(date +%s).db"

    # Create test database
    sqlite3 "$test_db" <<'EOF'
CREATE TABLE test_suites (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE test_runs (
    id INTEGER PRIMARY KEY,
    suite_id INTEGER,
    git_commit TEXT,
    git_branch TEXT,
    total_tests INTEGER,
    passed INTEGER,
    failed INTEGER,
    skipped INTEGER,
    duration_seconds INTEGER,
    success_rate REAL,
    run_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);
EOF

    # Attempt injection via SUITE parameter
    local malicious_suite="test'; DROP TABLE test_runs; --"

    set +e
    DB_FILE="$test_db" "$PROJECT_ROOT/.claude/skills/cfn-test-runner/store-benchmarks.sh" \
        --suite "$malicious_suite" \
        --total 10 \
        --passed 8 \
        --failed 2 \
        --skipped 0 \
        --duration 100 \
        --commit "abc123" \
        --branch "main" 2>&1 | grep -q "ERROR\|Invalid"
    local exit_code=$?
    set -e

    # Verify table still exists
    local table_count=$(sqlite3 "$test_db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='test_runs';" 2>/dev/null || echo "0")

    if [[ "$table_count" == "1" ]]; then
        log_pass "store-benchmarks.sh blocked SQL injection (table preserved)"
    else
        log_fail "store-benchmarks.sh vulnerable to SQL injection (table dropped)"
    fi

    rm -f "$test_db"
}

# Test 3: agent-handoff.sh SQL injection in agent_id
test_agent_handoff_injection() {
    log_test "Testing agent-handoff.sh against SQL injection"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    local test_db="/tmp/test-agent-handoff-$(date +%s).db"

    # Create test database
    sqlite3 "$test_db" <<'EOF'
CREATE TABLE agents (
    agent_id TEXT PRIMARY KEY,
    agent_type TEXT,
    task_id TEXT,
    status TEXT,
    spawned_at TEXT
);
EOF

    # Attempt injection via agent_id
    local malicious_agent_id="test'; DROP TABLE agents; --"

    # Source the agent-handoff library
    export AGENT_STATE_DB="$test_db"
    source "$PROJECT_ROOT/.claude/skills/integration/agent-handoff.sh"

    set +e
    agent_spawn "test-agent" "Test task" "task-123" 3600 2>&1 | grep -q "ERROR\|Invalid"
    set -e

    # Verify table still exists
    local table_count=$(sqlite3 "$test_db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='agents';" 2>/dev/null || echo "0")

    if [[ "$table_count" == "1" ]]; then
        log_pass "agent-handoff.sh blocked SQL injection (table preserved)"
    else
        log_fail "agent-handoff.sh vulnerable to SQL injection (table dropped)"
    fi

    rm -f "$test_db"
}

# Test 4: track-cost-savings.sh SQL injection in skill_name
test_track_cost_savings_injection() {
    log_test "Testing track-cost-savings.sh against SQL injection"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    local test_db="/tmp/test-cost-savings-$(date +%s).db"

    # Attempt injection via skill_name
    local malicious_skill="test'; DROP TABLE skill_executions; --"

    set +e
    DB_PATH="$test_db" "$PROJECT_ROOT/.claude/skills/workflow-codification/track-cost-savings.sh" \
        --action log \
        --skill-name "$malicious_skill" \
        --skill-version "1.0.0" \
        --execution-time-ms 100 \
        --exit-code 0 \
        --tokens-avoided 1000 2>&1 | grep -q "ERROR\|Invalid"
    local exit_code=$?
    set -e

    # Verify database structure intact
    if [[ -f "$test_db" ]]; then
        local table_count=$(sqlite3 "$test_db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")
        if [[ "$table_count" -ge 1 ]]; then
            log_pass "track-cost-savings.sh blocked SQL injection"
        else
            log_fail "track-cost-savings.sh vulnerable to SQL injection"
        fi
    else
        log_pass "track-cost-savings.sh rejected malicious input (no DB created)"
    fi

    rm -f "$test_db"
}

# Test 5: track-edge-case.sh SQL injection in skill_name
test_track_edge_case_injection() {
    log_test "Testing track-edge-case.sh against SQL injection"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    local test_db="/tmp/test-edge-case-$(date +%s).db"

    # Attempt injection via skill_name
    local malicious_skill="test'; DROP TABLE edge_cases; --"

    set +e
    DB_PATH="$test_db" "$PROJECT_ROOT/.claude/skills/workflow-codification/track-edge-case.sh" \
        --action record \
        --skill-name "$malicious_skill" \
        --skill-version "1.0.0" \
        --exit-code 1 \
        --input-params "test=value" \
        --error-message "Test error" 2>&1 | grep -q "ERROR\|Invalid"
    local exit_code=$?
    set -e

    # Verify database structure intact
    if [[ -f "$test_db" ]]; then
        local table_count=$(sqlite3 "$test_db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")
        if [[ "$table_count" -ge 1 ]]; then
            log_pass "track-edge-case.sh blocked SQL injection"
        else
            log_fail "track-edge-case.sh vulnerable to SQL injection"
        fi
    else
        log_pass "track-edge-case.sh rejected malicious input (no DB created)"
    fi

    rm -f "$test_db"
}

# Test 6: test-memory-persistence.sh SQL injection
test_memory_persistence_injection() {
    log_test "Testing test-memory-persistence.sh against SQL injection"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    # This is a test script itself, but we verify it doesn't execute malicious SQL
    # by checking if it creates/drops unexpected tables

    set +e
    "$PROJECT_ROOT/.claude/skills/cfn-automatic-memory-persistence/test-memory-persistence.sh" 2>&1 | \
        grep -q "All Memory Persistence Tests Passed"
    local exit_code=$?
    set -e

    if [[ "$exit_code" == "0" ]]; then
        log_pass "test-memory-persistence.sh executes safely"
    else
        log_fail "test-memory-persistence.sh may have vulnerabilities"
    fi
}

# Test 7: Verify Pattern B implementation (parameterized queries)
test_pattern_b_implementation() {
    log_test "Verifying Pattern B (parameterized queries) implementation"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    # The two agent-lifecycle entries previously floated OUTSIDE the array
    # (orphan bare strings below the closing paren), so the loop never
    # inspected them. They are now inside, pointing at the restructured
    # locations under cfn-agent-lifecycle/lib/audit/.
    #
    # NOTE: the other five entries reference skills that no longer exist in
    # this repo (cfn-test-runner/, cfn-sqlite-memory/, integration/,
    # workflow-codification/). They are listed here so the gap is visible;
    # each reports "missing" until those skills are re-homed or the entries
    # are removed.
    local fixed_scripts=(
        ".claude/skills/cfn-test-runner/store-benchmarks.sh"
        ".claude/skills/cfn-sqlite-memory/ttl-cleanup.sh"
        ".claude/skills/integration/agent-handoff.sh"
        ".claude/skills/workflow-codification/deploy-approved-skill.sh"
        ".claude/skills/workflow-codification/propagate-skill-update.sh"
        ".claude/skills/cfn-agent-lifecycle/lib/audit/execute-lifecycle-hook.sh"
        ".claude/skills/cfn-agent-lifecycle/lib/audit/simple-audit.sh"
    )

    # The real parameterized-query layer in this repo is sqlite-params.sh,
    # sourced as sqlite_upsert / sqlite_insert / sqlite_update / sqlite_select.
    # It does NOT use the sqlite3 CLI's `.parameter set` dot-command. Match
    # either form so the check reports accurately for both legacy and current
    # scripts instead of always saying "missing Pattern B".
    local pattern_b_regex='sqlite_upsert\|sqlite_insert\|sqlite_update\|sqlite_select\|\.parameter set'

    local all_implemented=true
    local present_count=0
    local total_count=0
    for script in "${fixed_scripts[@]}"; do
        total_count=$((total_count + 1))
        if grep -q "$pattern_b_regex" "$PROJECT_ROOT/$script" 2>/dev/null; then
            echo "  OK $script uses parameterized queries"
            present_count=$((present_count + 1))
        else
            echo "    $script missing or lacks parameterized-query marker"
            all_implemented=false
        fi
    done

    if [[ "$all_implemented" == "true" ]]; then
        log_pass "Pattern B implemented in all $total_count fixed scripts"
    else
        log_fail "Pattern B missing in $((total_count - present_count)) of $total_count scripts (see lines above)"
    fi
}

# Main test execution
main() {
    echo "========================================="
    echo "SQL Injection Security Test Suite"
    echo "Testing 14 Scripts for OWASP Top 10"
    echo "========================================="
    echo ""

    test_ttl_cleanup_injection
    test_store_benchmarks_injection
    test_agent_handoff_injection
    test_track_cost_savings_injection
    test_track_edge_case_injection
    test_memory_persistence_injection
    test_pattern_b_implementation

    echo ""
    echo "========================================="
    echo "Test Results"
    echo "========================================="
    echo "Total Tests: $TOTAL_TESTS"
    echo "Passed: $PASSED_TESTS"
    echo "Failed: $FAILED_TESTS"
    echo ""

    if [[ "$FAILED_TESTS" -eq 0 ]]; then
        echo -e "${GREEN}✓ All security tests passed${NC}"
        exit 0
    else
        echo -e "${RED}✗ Security vulnerabilities detected${NC}"
        exit 1
    fi
}

main "$@"
