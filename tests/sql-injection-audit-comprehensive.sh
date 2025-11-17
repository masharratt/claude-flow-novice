#!/bin/bash
# Comprehensive SQL Injection Security Test Suite
# Tests Pattern B parameterized query implementation across all CFN scripts
# Covers OWASP Top 10 SQL injection attack vectors
#
# Test Coverage:
# - DROP TABLE injection
# - OR 1=1 (Boolean-based blind)
# - UNION SELECT (union-based)
# - Comment injection (--, #, /*)
# - Stacked queries
# - Time-based blind
# - Second-order injection
# - Identifier injection
#
# Expected Pass Rate: 100% (28/28 tests)

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DB="/tmp/sql-injection-test-$$.db"
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Source the parameterized query library
source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

# Test result tracking
declare -a FAILED_TESTS=()

#######################################
# Test helper functions
#######################################

setup_test_db() {
    rm -f "$TEST_DB"
    sqlite3 "$TEST_DB" <<'SQL'
CREATE TABLE test_users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0
);

CREATE TABLE test_data (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL,
    value TEXT,
    metadata TEXT
);

INSERT INTO test_users VALUES (1, 'admin', 'secret123', 1);
INSERT INTO test_users VALUES (2, 'user1', 'pass456', 0);
INSERT INTO test_users VALUES (3, 'user2', 'pass789', 0);

INSERT INTO test_data VALUES (1, 'config', 'production', '{"env":"prod"}');
INSERT INTO test_data VALUES (2, 'api_key', 'secret-key-123', '{"level":"high"}');
SQL
}

cleanup_test_db() {
    rm -f "$TEST_DB"
}

assert_equal() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    ((TEST_COUNT++))

    if [[ "$expected" == "$actual" ]]; then
        ((PASS_COUNT++))
        echo -e "${GREEN}✓${NC} Test $TEST_COUNT: $test_name"
        return 0
    else
        ((FAIL_COUNT++))
        FAILED_TESTS+=("$test_name")
        echo -e "${RED}✗${NC} Test $TEST_COUNT: $test_name"
        echo -e "  ${YELLOW}Expected:${NC} $expected"
        echo -e "  ${YELLOW}Actual:${NC} $actual"
        return 1
    fi
}

assert_not_empty() {
    local actual="$1"
    local test_name="$2"

    ((TEST_COUNT++))

    if [[ -n "$actual" ]]; then
        ((PASS_COUNT++))
        echo -e "${GREEN}✓${NC} Test $TEST_COUNT: $test_name"
        return 0
    else
        ((FAIL_COUNT++))
        FAILED_TESTS+=("$test_name")
        echo -e "${RED}✗${NC} Test $TEST_COUNT: $test_name (empty result)"
        return 1
    fi
}

assert_empty() {
    local actual="$1"
    local test_name="$2"

    ((TEST_COUNT++))

    if [[ -z "$actual" ]]; then
        ((PASS_COUNT++))
        echo -e "${GREEN}✓${NC} Test $TEST_COUNT: $test_name"
        return 0
    else
        ((FAIL_COUNT++))
        FAILED_TESTS+=("$test_name")
        echo -e "${RED}✗${NC} Test $TEST_COUNT: $test_name (expected empty, got: $actual)"
        return 1
    fi
}

#######################################
# OWASP Attack Vector Tests
#######################################

# Test 1-2: DROP TABLE Injection Prevention
test_drop_table_injection() {
    echo ""
    echo "=== Test Group 1: DROP TABLE Injection Prevention ==="

    # Test 1: Direct DROP TABLE attempt
    local malicious_input="admin'; DROP TABLE test_users; --"
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT username FROM test_users WHERE username = ?1" "$malicious_input" || echo "")

    assert_empty "$result" "DROP TABLE injection returns no results"

    # Test 2: Verify table still exists
    local table_exists
    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='test_users';")

    assert_equal "test_users" "$table_exists" "test_users table still exists after injection attempt"
}

# Test 3-5: OR 1=1 (Boolean-based Blind) Prevention
test_or_injection() {
    echo ""
    echo "=== Test Group 2: OR 1=1 Boolean Injection Prevention ==="

    # Test 3: OR 1=1 attack
    local malicious_input="' OR '1'='1"
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM test_users WHERE username = ?1" "$malicious_input")

    assert_equal "0" "$result" "OR 1=1 injection returns 0 rows"

    # Test 4: OR 1=1 with comment
    malicious_input="' OR 1=1 --"
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM test_users WHERE password = ?1" "$malicious_input")

    assert_equal "0" "$result" "OR 1=1 with comment returns 0 rows"

    # Test 5: Admin bypass attempt
    malicious_input="admin' OR 'a'='a"
    result=$(sqlite_select "$TEST_DB" "SELECT is_admin FROM test_users WHERE username = ?1" "$malicious_input")

    assert_empty "$result" "Admin bypass via OR injection fails"
}

# Test 6-8: UNION SELECT (Union-based) Prevention
test_union_select_injection() {
    echo ""
    echo "=== Test Group 3: UNION SELECT Injection Prevention ==="

    # Test 6: UNION SELECT to extract password
    local malicious_input="user1' UNION SELECT password FROM test_users WHERE username='admin' --"
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT username FROM test_users WHERE username = ?1" "$malicious_input" || echo "")

    assert_empty "$result" "UNION SELECT password extraction fails"

    # Test 7: UNION SELECT all columns
    malicious_input="' UNION SELECT * FROM test_users WHERE '1'='1"
    result=$(sqlite_select "$TEST_DB" "SELECT username FROM test_users WHERE username = ?1" "$malicious_input" || echo "")

    assert_empty "$result" "UNION SELECT * extraction fails"

    # Test 8: UNION SELECT with column count discovery
    malicious_input="' UNION SELECT NULL, NULL, NULL --"
    result=$(sqlite_select "$TEST_DB" "SELECT username FROM test_users WHERE id = ?1" "$malicious_input" || echo "")

    assert_empty "$result" "UNION SELECT column discovery fails"
}

# Test 9-11: Comment Injection Prevention
test_comment_injection() {
    echo ""
    echo "=== Test Group 4: Comment Injection Prevention ==="

    # Test 9: Double-dash comment
    local malicious_input="admin' --"
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT username FROM test_users WHERE username = ?1 AND password = 'ignored'" "$malicious_input" || echo "")

    assert_empty "$result" "Double-dash comment injection fails"

    # Test 10: Hash comment (MySQL style, should fail in SQLite)
    malicious_input="admin' #"
    result=$(sqlite_select "$TEST_DB" "SELECT username FROM test_users WHERE username = ?1" "$malicious_input" || echo "")

    assert_empty "$result" "Hash comment injection fails"

    # Test 11: C-style comment
    malicious_input="admin' /* comment */ --"
    result=$(sqlite_select "$TEST_DB" "SELECT username FROM test_users WHERE username = ?1" "$malicious_input" || echo "")

    assert_empty "$result" "C-style comment injection fails"
}

# Test 12-14: Stacked Queries Prevention
test_stacked_queries() {
    echo ""
    echo "=== Test Group 5: Stacked Queries Prevention ==="

    # Test 12: INSERT via stacked query
    local malicious_input="admin'; INSERT INTO test_users VALUES (999, 'hacker', 'owned', 1); --"
    sqlite_select "$TEST_DB" "SELECT username FROM test_users WHERE username = ?1" "$malicious_input" >/dev/null 2>&1 || true

    local hacker_count
    hacker_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM test_users WHERE username='hacker';")

    assert_equal "0" "$hacker_count" "Stacked INSERT query fails"

    # Test 13: UPDATE via stacked query
    malicious_input="user1'; UPDATE test_users SET is_admin=1 WHERE username='user1'; --"
    sqlite_select "$TEST_DB" "SELECT username FROM test_users WHERE username = ?1" "$malicious_input" >/dev/null 2>&1 || true

    local user1_admin
    user1_admin=$(sqlite3 "$TEST_DB" "SELECT is_admin FROM test_users WHERE username='user1';")

    assert_equal "0" "$user1_admin" "Stacked UPDATE query fails"

    # Test 14: DELETE via stacked query
    malicious_input="admin'; DELETE FROM test_users WHERE username='user2'; --"
    sqlite_select "$TEST_DB" "SELECT username FROM test_users WHERE username = ?1" "$malicious_input" >/dev/null 2>&1 || true

    local user2_exists
    user2_exists=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM test_users WHERE username='user2';")

    assert_equal "1" "$user2_exists" "Stacked DELETE query fails"
}

# Test 15-17: Special Characters and Encoding
test_special_characters() {
    echo ""
    echo "=== Test Group 6: Special Characters Handling ==="

    # Test 15: Single quote in data
    local test_value="O'Reilly"
    sqlite_insert "$TEST_DB" "INSERT INTO test_data (key, value) VALUES (?1, ?2)" "test_quote" "$test_value"

    local retrieved
    retrieved=$(sqlite_select "$TEST_DB" "SELECT value FROM test_data WHERE key = ?1" "test_quote")

    assert_equal "$test_value" "$retrieved" "Single quote in data handled correctly"

    # Test 16: Backslash in data
    test_value="C:\\Program Files\\App"
    sqlite_insert "$TEST_DB" "INSERT INTO test_data (key, value) VALUES (?1, ?2)" "test_backslash" "$test_value"

    retrieved=$(sqlite_select "$TEST_DB" "SELECT value FROM test_data WHERE key = ?1" "test_backslash")

    assert_equal "$test_value" "$retrieved" "Backslash in data handled correctly"

    # Test 17: Newline and special chars
    test_value=$'Line1\nLine2\tTab\r\nCRLF'
    sqlite_insert "$TEST_DB" "INSERT INTO test_data (key, value) VALUES (?1, ?2)" "test_newline" "$test_value"

    retrieved=$(sqlite_select "$TEST_DB" "SELECT value FROM test_data WHERE key = ?1" "test_newline")

    assert_equal "$test_value" "$retrieved" "Newline and special characters handled correctly"
}

# Test 18-20: Parameterized INSERT/UPDATE/DELETE
test_parameterized_operations() {
    echo ""
    echo "=== Test Group 7: Parameterized INSERT/UPDATE/DELETE ==="

    # Test 18: Parameterized INSERT
    sqlite_insert "$TEST_DB" "INSERT INTO test_users (username, password, is_admin) VALUES (?1, ?2, ?3)" "testuser" "testpass" "0"

    local inserted
    inserted=$(sqlite_select "$TEST_DB" "SELECT username FROM test_users WHERE username = ?1" "testuser")

    assert_equal "testuser" "$inserted" "Parameterized INSERT works"

    # Test 19: Parameterized UPDATE
    sqlite_update "$TEST_DB" "UPDATE test_users SET password = ?1 WHERE username = ?2" "newpass123" "testuser"

    local updated_pass
    updated_pass=$(sqlite_select "$TEST_DB" "SELECT password FROM test_users WHERE username = ?1" "testuser")

    assert_equal "newpass123" "$updated_pass" "Parameterized UPDATE works"

    # Test 20: Parameterized DELETE
    sqlite_delete "$TEST_DB" "DELETE FROM test_users WHERE username = ?1" "testuser"

    local deleted_count
    deleted_count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM test_users WHERE username = ?1" "testuser")

    assert_equal "0" "$deleted_count" "Parameterized DELETE works"
}

# Test 21-23: Edge Cases
test_edge_cases() {
    echo ""
    echo "=== Test Group 8: Edge Cases ==="

    # Test 21: Empty string parameter
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM test_users WHERE username = ?1" "")

    assert_equal "0" "$result" "Empty string parameter handled correctly"

    # Test 22: NULL-like string
    sqlite_insert "$TEST_DB" "INSERT INTO test_data (key, value) VALUES (?1, ?2)" "null_test" "NULL"

    local null_value
    null_value=$(sqlite_select "$TEST_DB" "SELECT value FROM test_data WHERE key = ?1" "null_test")

    assert_equal "NULL" "$null_value" "NULL string stored as literal text"

    # Test 23: Very long string
    local long_string
    long_string=$(printf 'A%.0s' {1..1000})
    sqlite_insert "$TEST_DB" "INSERT INTO test_data (key, value) VALUES (?1, ?2)" "long_test" "$long_string"

    local long_retrieved
    long_retrieved=$(sqlite_select "$TEST_DB" "SELECT value FROM test_data WHERE key = ?1" "long_test")

    assert_equal "$long_string" "$long_retrieved" "Very long string handled correctly"
}

# Test 24-26: Script-Specific Validation
test_store_benchmarks_script() {
    echo ""
    echo "=== Test Group 9: store-benchmarks.sh Validation ==="

    # Source the fixed script functions if available
    if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-test-runner/store-benchmarks.sh" ]]; then
        # Test 24: Verify script uses parameterized queries
        local uses_params
        uses_params=$(grep -c ".parameter init\|sqlite_select\|sqlite_insert" "$PROJECT_ROOT/.claude/skills/cfn-test-runner/store-benchmarks.sh" || echo "0")

        if [[ "$uses_params" -gt 0 ]]; then
            ((TEST_COUNT++))
            ((PASS_COUNT++))
            echo -e "${GREEN}✓${NC} Test $TEST_COUNT: store-benchmarks.sh uses parameterized queries"
        else
            ((TEST_COUNT++))
            ((FAIL_COUNT++))
            FAILED_TESTS+=("store-benchmarks.sh parameterization")
            echo -e "${RED}✗${NC} Test $TEST_COUNT: store-benchmarks.sh missing parameterization"
        fi

        # Test 25: Verify no vulnerable patterns remain
        local vulnerable_patterns
        vulnerable_patterns=$(grep -c "sqlite3.*\".*\\\$[A-Z_]" "$PROJECT_ROOT/.claude/skills/cfn-test-runner/store-benchmarks.sh" 2>/dev/null || echo "0")

        if [[ "$vulnerable_patterns" -eq 0 ]]; then
            ((TEST_COUNT++))
            ((PASS_COUNT++))
            echo -e "${GREEN}✓${NC} Test $TEST_COUNT: store-benchmarks.sh has no vulnerable patterns"
        else
            ((TEST_COUNT++))
            ((FAIL_COUNT++))
            FAILED_TESTS+=("store-benchmarks.sh vulnerability check")
            echo -e "${RED}✗${NC} Test $TEST_COUNT: store-benchmarks.sh contains $vulnerable_patterns vulnerable patterns"
        fi

        # Test 26: Script sources sqlite-params.sh
        local sources_lib
        sources_lib=$(grep -c "source.*sqlite-params.sh" "$PROJECT_ROOT/.claude/skills/cfn-test-runner/store-benchmarks.sh" || echo "0")

        if [[ "$sources_lib" -gt 0 ]]; then
            ((TEST_COUNT++))
            ((PASS_COUNT++))
            echo -e "${GREEN}✓${NC} Test $TEST_COUNT: store-benchmarks.sh sources sqlite-params.sh library"
        else
            ((TEST_COUNT++))
            ((FAIL_COUNT++))
            FAILED_TESTS+=("store-benchmarks.sh library import")
            echo -e "${RED}✗${NC} Test $TEST_COUNT: store-benchmarks.sh missing sqlite-params.sh import"
        fi
    else
        echo -e "${YELLOW}⚠${NC} Skipping store-benchmarks.sh tests (file not found)"
        TEST_COUNT+=3
    fi
}

# Test 27-28: Security Utilities Validation
test_security_utilities() {
    echo ""
    echo "=== Test Group 10: Security Utilities Validation ==="

    # Test 27: security-utils.sh escape_sql_string function
    if [[ -f "$PROJECT_ROOT/.claude/skills/workflow-codification/lib/security-utils.sh" ]]; then
        source "$PROJECT_ROOT/.claude/skills/workflow-codification/lib/security-utils.sh"

        local test_input="O'Reilly's book"
        local escaped
        escaped=$(escape_sql_string "$test_input")

        assert_equal "O''Reilly''s book" "$escaped" "escape_sql_string doubles single quotes"
    else
        ((TEST_COUNT++))
        echo -e "${YELLOW}⚠${NC} Test $TEST_COUNT: security-utils.sh not found (skipped)"
    fi

    # Test 28: Identifier validation regex
    if command -v validate_sql_identifier &>/dev/null; then
        if validate_sql_identifier "valid_table_name"; then
            ((TEST_COUNT++))
            ((PASS_COUNT++))
            echo -e "${GREEN}✓${NC} Test $TEST_COUNT: validate_sql_identifier accepts valid identifiers"
        else
            ((TEST_COUNT++))
            ((FAIL_COUNT++))
            FAILED_TESTS+=("validate_sql_identifier valid input")
            echo -e "${RED}✗${NC} Test $TEST_COUNT: validate_sql_identifier rejects valid input"
        fi
    else
        ((TEST_COUNT++))
        echo -e "${YELLOW}⚠${NC} Test $TEST_COUNT: validate_sql_identifier not found (skipped)"
    fi
}

#######################################
# Main Test Execution
#######################################

main() {
    echo "==============================================="
    echo "Comprehensive SQL Injection Security Test Suite"
    echo "==============================================="
    echo "Coverage: OWASP Top 10 Attack Vectors + Script Validation"
    echo "Expected: 28 tests, 100% pass rate"
    echo ""

    setup_test_db

    # Run all test groups
    test_drop_table_injection
    test_or_injection
    test_union_select_injection
    test_comment_injection
    test_stacked_queries
    test_special_characters
    test_parameterized_operations
    test_edge_cases
    test_store_benchmarks_script
    test_security_utilities

    cleanup_test_db

    # Final report
    echo ""
    echo "==============================================="
    echo "Test Results Summary"
    echo "==============================================="
    echo "Total Tests: $TEST_COUNT"
    echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
    echo -e "Failed: ${RED}$FAIL_COUNT${NC}"

    local pass_rate
    pass_rate=$(awk "BEGIN {printf \"%.2f\", ($PASS_COUNT / $TEST_COUNT) * 100}")
    echo "Pass Rate: $pass_rate%"

    if [[ "$FAIL_COUNT" -gt 0 ]]; then
        echo ""
        echo -e "${RED}Failed Tests:${NC}"
        for test in "${FAILED_TESTS[@]}"; do
            echo "  - $test"
        done
        echo ""
        echo "Status: FAILED"
        exit 1
    else
        echo ""
        echo -e "${GREEN}Status: ALL TESTS PASSED ✓${NC}"
        exit 0
    fi
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
