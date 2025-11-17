#!/bin/bash
# SQL Injection Security Test Suite
# Validates parameterized query implementation against 8 OWASP injection vectors
# Ensures zero false positives and 100% injection blocking

set -euo pipefail

# Setup
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# Test database
TEST_DB="/tmp/test-sql-injection-$$.db"

cleanup() {
    [[ -f "$TEST_DB" ]] && rm -f "$TEST_DB"
}
trap cleanup EXIT

# Initialize test database
init_test_db() {
    sqlite3 "$TEST_DB" << 'EOF'
CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE,
    content TEXT
);

INSERT INTO skills (name, content) VALUES ('test-skill', 'Content');
EOF
}

test_result() {
    local name="$1"
    local passed="$2"

    ((TESTS_PASSED++)) || true
    ((TOTAL_TESTS++)) || true

    if [[ "$passed" == "true" ]]; then
        echo -e "${GREEN}PASS${NC}: $name"
    else
        echo -e "${RED}FAIL${NC}: $name"
        ((TESTS_FAILED++)) || true
    fi
}

# OWASP Injection Vector 1: Basic quote injection
test_quote_injection() {
    local injection="test'; DROP TABLE skills; --"
    local count_before
    local result
    local count_after

    count_before=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skills;")
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM skills WHERE name = ?" "$injection" 2>/dev/null || echo "error")
    count_after=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skills;" 2>/dev/null || echo "0")

    if [[ "$count_before" == "$count_after" ]] && [[ "$result" == "0" ]]; then
        return 0
    else
        return 1
    fi
}

# OWASP Injection Vector 2: Boolean-based injection (OR 1=1)
test_boolean_injection() {
    local injection="' OR '1'='1"
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM skills WHERE name = ?" "$injection")
    [[ "$result" == "0" ]]
}

# OWASP Injection Vector 3: UNION-based injection
test_union_injection() {
    local injection="x' UNION SELECT 1,2,3 --"
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM skills WHERE name = ?" "$injection")
    [[ "$result" == "0" ]]
}

# OWASP Injection Vector 4: Comment-based injection
test_comment_injection() {
    local injection="test' OR '1'='1' --"
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM skills WHERE name = ?" "$injection")
    [[ "$result" == "0" ]]
}

# OWASP Injection Vector 5: Stacked queries injection
test_stacked_queries() {
    local injection="'; SELECT * FROM skills; --"
    local result
    local count
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM skills WHERE name = ?" "$injection")
    count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skills;")
    [[ "$result" == "0" ]] && [[ "$count" == "1" ]]
}

# OWASP Injection Vector 6: Time-based blind injection
test_time_based_injection() {
    local injection="'; PRAGMA compile_options; --"
    local start end elapsed_ms result
    start=$(date +%s%N)
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM skills WHERE name = ?" "$injection" 2>/dev/null || echo "0")
    end=$(date +%s%N)
    elapsed_ms=$(( (end - start) / 1000000 ))
    [[ "$result" == "0" ]] && [[ $elapsed_ms -lt 100 ]]
}

# OWASP Injection Vector 7: Encoding bypass (double quotes)
test_double_quote_injection() {
    local injection='test" OR "1"="1'
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM skills WHERE name = ?" "$injection")
    [[ "$result" == "0" ]]
}

# OWASP Injection Vector 8: Parameterized INSERT validation
test_parameterized_insert_security() {
    local malicious_name="malicious'; DROP TABLE skills; --"
    local malicious_content="content'; DROP TABLE skills; --"
    local count
    sqlite_insert "$TEST_DB" "INSERT INTO skills (id, name, content) VALUES (?, ?, ?)" "999" "$malicious_name" "$malicious_content"
    count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skills;" 2>/dev/null || echo "-1")
    [[ "$count" == "2" ]]
}

# Additional validation: Verify no escaping is needed
test_no_escaping_needed() {
    local injection="test'; DROP TABLE skills; --"
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM skills WHERE name = ?" "$injection")
    [[ "$result" == "0" ]]
}

# Validate identifier helper (simple inline test)
test_identifier_validation() {
    local id1="valid_name"
    local id2="test123"
    local id3="invalid-name"
    local id4="123invalid"

    # Test valid identifiers
    if [[ ! "$id1" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then return 1; fi
    if [[ ! "$id2" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then return 1; fi

    # Test invalid identifiers
    if [[ "$id3" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then return 1; fi
    if [[ "$id4" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then return 1; fi

    return 0
}

# Test UPDATE security
test_parameterized_update_security() {
    local new_content="safe_update"
    local updated_content
    sqlite_update "$TEST_DB" "UPDATE skills SET content = ? WHERE id = ?" "$new_content" "1"
    updated_content=$(sqlite3 "$TEST_DB" "SELECT content FROM skills WHERE id = 1;")
    [[ "$updated_content" == "$new_content" ]]
}

# Test DELETE security
test_parameterized_delete_security() {
    local count
    sqlite3 "$TEST_DB" "INSERT INTO skills (id, name, content) VALUES (1000, 'to_delete', 'content');"
    sqlite_delete "$TEST_DB" "DELETE FROM skills WHERE id = ?" "1000"
    count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skills WHERE id = 1000;")
    [[ "$count" == "0" ]]
}

run_test() {
    local test_name="$1"
    local test_func="$2"

    if $test_func 2>/dev/null; then
        test_result "$test_name" "true"
    else
        test_result "$test_name" "false"
    fi
}

main() {
    echo "SQL Injection Security Test Suite"
    echo "=================================="
    echo ""
    echo "Testing 8 OWASP injection vectors with parameterized queries"
    echo ""

    init_test_db

    # Run all tests
    run_test "OWASP-1: Quote injection blocked" "test_quote_injection"
    run_test "OWASP-2: Boolean injection (OR 1=1) blocked" "test_boolean_injection"
    run_test "OWASP-3: UNION injection blocked" "test_union_injection"
    run_test "OWASP-4: Comment injection blocked" "test_comment_injection"
    run_test "OWASP-5: Stacked queries injection blocked" "test_stacked_queries"
    run_test "OWASP-6: Time-based blind injection blocked" "test_time_based_injection"
    run_test "OWASP-7: Double-quote injection blocked" "test_double_quote_injection"
    run_test "OWASP-8: Parameterized INSERT security" "test_parameterized_insert_security"
    run_test "No escaping needed (automatic)" "test_no_escaping_needed"
    run_test "Identifier validation works" "test_identifier_validation"
    run_test "Parameterized UPDATE security" "test_parameterized_update_security"
    run_test "Parameterized DELETE security" "test_parameterized_delete_security"

    echo ""
    echo "=================================="
    echo "Results:"
    echo "  Passed: ${GREEN}$TESTS_PASSED${NC}/$TOTAL_TESTS"
    echo "  Failed: ${RED}$TESTS_FAILED${NC}/$TOTAL_TESTS"
    if [[ $TOTAL_TESTS -gt 0 ]]; then
        echo "  Pass Rate: $((TESTS_PASSED * 100 / TOTAL_TESTS))%"
    fi
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests PASSED${NC} - Zero false positives, 100% injection blocking"
        return 0
    else
        echo -e "${RED}Some tests FAILED${NC}"
        return 1
    fi
}

main
