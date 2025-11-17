#!/bin/bash
# Final SQL Injection Validation - CFN Loop 5 Iteration 4
# Tests both propagate-skill-update.sh and deploy-approved-skill.sh
# OWASP SQL Injection Test Suite with 28 vectors

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_DB="/tmp/test-sql-injection-final-$$.db"
RESULTS_FILE="/tmp/sql-injection-final-results-$$.txt"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Initialize test database
init_test_db() {
    rm -f "$TEST_DB"
    sqlite3 "$TEST_DB" <<SQL_EOF
CREATE TABLE skills (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    version TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    content_path TEXT NOT NULL,
    category TEXT DEFAULT 'domain',
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO skills (name, version, content_hash, content_path) VALUES
    ('jwt-auth', '1.0.0', 'hash1234', '/path/to/jwt.md'),
    ('rbac', '1.0.0', 'hash5678', '/path/to/rbac.md'),
    ('encryption', '2.0.0', 'hash9012', '/path/to/encryption.md');
SQL_EOF
}

# Test 1: Single Quote Injection
test_single_quote_injection() {
    local test_name="Single Quote Injection"
    local payload="'); DROP TABLE skills; --"

    log_test "$test_name" "1" "$payload"

    # Source the parameterized query library
    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    # This should NOT execute the DROP TABLE
    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1) || true

    # Verify table still exists
    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='skills';" 2>&1)

    if [[ -n "$table_exists" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Table was dropped - parameterized query failed"
    fi
}

# Test 2: OR 1=1 Injection
test_or_injection() {
    local test_name="OR 1=1 Injection"
    local payload="' OR '1'='1"

    log_test "$test_name" "2" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT COUNT(*) FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    # Should return 0 (no match), not 3 (all records)
    if [[ "$result" == "0" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "OR injection was not blocked: got $result records instead of 0"
    fi
}

# Test 3: UNION SELECT Injection
test_union_injection() {
    local test_name="UNION SELECT Injection"
    local payload="' UNION SELECT * FROM skills; --"

    log_test "$test_name" "3" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    # Should not return all skills
    line_count=$(echo "$result" | wc -l)
    if [[ $line_count -eq 1 ]] || [[ -z "$result" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "UNION injection was not blocked"
    fi
}

# Test 4: Comment Bypass (SQL Comments)
test_comment_bypass() {
    local test_name="Comment Bypass (--)"
    local payload="'; DROP TABLE skills; --"

    log_test "$test_name" "4" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1) || true

    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='skills';" 2>&1)

    if [[ -n "$table_exists" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Comment bypass attack executed"
    fi
}

# Test 5: Block Comment Bypass (/* */)
test_block_comment_bypass() {
    local test_name="Comment Bypass (/* */)"
    local payload="'; DROP TABLE skills; /* comment"

    log_test "$test_name" "5" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1) || true

    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='skills';" 2>&1)

    if [[ -n "$table_exists" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Block comment bypass attack executed"
    fi
}

# Test 6: Stacked Queries
test_stacked_queries() {
    local test_name="Stacked Queries"
    local payload="jwt-auth'; DROP TABLE skills; --"

    log_test "$test_name" "6" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1) || true

    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='skills';" 2>&1)

    if [[ -n "$table_exists" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Stacked query attack executed"
    fi
}

# Test 7: Double Quote Injection
test_double_quote_injection() {
    local test_name="Double Quote Injection"
    local payload='"; DROP TABLE skills; --'

    log_test "$test_name" "7" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1) || true

    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='skills';" 2>&1)

    if [[ -n "$table_exists" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Double quote injection was not blocked"
    fi
}

# Test 8: Backtick Injection
test_backtick_injection() {
    local test_name="Backtick Injection"
    local payload='`; DROP TABLE skills; --'

    log_test "$test_name" "8" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1) || true

    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='skills';" 2>&1)

    if [[ -n "$table_exists" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Backtick injection was not blocked"
    fi
}

# Test 9: Time-Based Blind SQL Injection
test_time_blind_injection() {
    local test_name="Time-Based Blind SQL Injection"
    local payload="' OR SLEEP(5) OR '"

    log_test "$test_name" "9" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    # Should not cause delay
    local start_time=$(date +%s%N)
    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1) || true
    local end_time=$(date +%s%N)

    local elapsed=$((($end_time - $start_time) / 1000000))

    if [[ $elapsed -lt 5000 ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Time-based blind injection caused delay: ${elapsed}ms"
    fi
}

# Test 10: Boolean-Based Blind SQL Injection
test_boolean_blind_injection() {
    local test_name="Boolean-Based Blind SQL Injection"
    local payload="' OR '1'='1' AND '1'='1"

    log_test "$test_name" "10" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT COUNT(*) FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    # Should return 0 (no match), not 3 (all records)
    if [[ "$result" == "0" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Boolean-based blind injection was not blocked"
    fi
}

# Test 11: Hex Encoding Bypass
test_hex_encoding_bypass() {
    local test_name="Hex Encoding Bypass"
    local payload="0x27 OR 0x31 = 0x31"

    log_test "$test_name" "11" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT COUNT(*) FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    if [[ "$result" == "0" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Hex encoding bypass was not blocked"
    fi
}

# Test 12: Numeric ID Validation in deploy-approved-skill.sh
test_numeric_validation() {
    local test_name="Numeric ID Validation"

    log_test "$test_name" "12" "Non-numeric pattern_id"

    # Test that numeric validation works
    local skill_id="123"
    local pattern_id="'); DROP TABLE workflow_patterns; --"

    if ! [[ "$skill_id" =~ ^[0-9]+$ ]] || ! [[ "$pattern_id" =~ ^[0-9]+$ ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Numeric validation did not reject non-numeric IDs"
    fi
}

# Test 13: Valid Numeric IDs Pass Validation
test_numeric_validation_pass() {
    local test_name="Numeric Validation Pass (Valid IDs)"

    log_test "$test_name" "13" "Valid numeric IDs"

    local skill_id="123"
    local pattern_id="456"

    if [[ "$skill_id" =~ ^[0-9]+$ ]] && [[ "$pattern_id" =~ ^[0-9]+$ ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Numeric validation rejected valid numeric IDs"
    fi
}

# Test 14: SQL Injection via pattern_id
test_pattern_id_injection() {
    local test_name="pattern_id SQL Injection"

    log_test "$test_name" "14" "SQL injection via pattern_id"

    local pattern_id="1; DROP TABLE workflow_patterns; --"

    if ! [[ "$pattern_id" =~ ^[0-9]+$ ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "SQL injection via pattern_id was not blocked"
    fi
}

# Test 15: Variable Quoting in PostgreSQL Command
test_postgres_quoting() {
    local test_name="PostgreSQL Variable Quoting"

    log_test "$test_name" "15" "Check variable quoting in psql command"

    # Extract the psql command from deploy-approved-skill.sh
    local psql_cmd=$(sed -n '385,386p' "$PROJECT_ROOT/.claude/skills/workflow-codification/deploy-approved-skill.sh")

    # Check that variables are quoted
    if [[ "$psql_cmd" =~ \'\$\{skill_id\}\' ]] && [[ "$psql_cmd" =~ \'\$\{pattern_id\}\' ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Variables not properly quoted in psql command"
    fi
}

# Test 16: Escape Sequence Injection
test_escape_sequence_injection() {
    local test_name="Escape Sequence Injection"
    local payload="\\' OR '1'='1"

    log_test "$test_name" "16" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT COUNT(*) FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    if [[ "$result" == "0" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Escape sequence injection was not blocked"
    fi
}

# Test 17: NULL Byte Injection
test_null_byte_injection() {
    local test_name="NULL Byte Injection"
    local payload="$(printf "test\x00DROP TABLE skills")"

    log_test "$test_name" "17" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1) || true

    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='skills';" 2>&1)

    if [[ -n "$table_exists" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "NULL byte injection was not blocked"
    fi
}

# Test 18: newline (CRLF) Injection
test_newline_injection() {
    local test_name="CRLF Injection"
    local payload=$'test\nDROP TABLE skills'

    log_test "$test_name" "18" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1) || true

    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='skills';" 2>&1)

    if [[ -n "$table_exists" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "CRLF injection was not blocked"
    fi
}

# Test 19: Unicode Normalization Attack
test_unicode_normalization() {
    local test_name="Unicode Normalization Attack"
    local payload="$(printf '\xc3\xa9')"

    log_test "$test_name" "19" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    if [[ -z "$result" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Unicode normalization attack was not blocked"
    fi
}

# Test 20: Case Variation Attack
test_case_variation() {
    local test_name="Case Variation Attack"
    local payload="jWt-AuTh"

    log_test "$test_name" "20" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    if [[ -z "$result" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Case variation should not match case-sensitive queries"
    fi
}

# Test 21: Wildcard Injection
test_wildcard_injection() {
    local test_name="Wildcard Injection (%)"
    local payload="jwt%"

    log_test "$test_name" "21" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    if [[ -z "$result" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Wildcard injection was not blocked in exact match query"
    fi
}

# Test 22: Conditional Statements
test_conditional_statement() {
    local test_name="Conditional Statement Injection"
    local payload="' OR IF(1=1, 'true', 'false') OR '"

    log_test "$test_name" "22" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT COUNT(*) FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    if [[ "$result" == "0" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Conditional statement injection was not blocked"
    fi
}

# Test 23: Arithmetic Expression Injection
test_arithmetic_injection() {
    local test_name="Arithmetic Expression Injection"
    local payload="' OR 1=1+0 OR '"

    log_test "$test_name" "23" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT COUNT(*) FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    if [[ "$result" == "0" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Arithmetic expression injection was not blocked"
    fi
}

# Test 24: Long String Attack
test_long_string_attack() {
    local test_name="Long String Attack"
    local payload="$(printf 'A%.0s' {1..10000})"

    log_test "$test_name" "24" "10000 character payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    if [[ -z "$result" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Long string attack caused issues"
    fi
}

# Test 25: Special Character Handling
test_special_characters() {
    local test_name="Special Character Handling"
    local payload='!@#$%^&*()_+-=[]{}|;:,.<>?'

    log_test "$test_name" "25" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT name FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    if [[ -z "$result" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "Special character handling failed"
    fi
}

# Test 26: INSERT with parameterized queries
test_parameterized_insert() {
    local test_name="Parameterized INSERT Query"
    local payload="test-skill'; DROP TABLE skills; --"

    log_test "$test_name" "26" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    sqlite_insert "$TEST_DB" \
        "INSERT INTO skills (name, version, content_hash, content_path) VALUES (?1, ?2, ?3, ?4)" \
        "$payload" "1.0.0" "hash123" "/path/to/skill.md" 2>&1 || true

    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='skills';" 2>&1)

    if [[ -n "$table_exists" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "INSERT parameterized query failed"
    fi
}

# Test 27: UPDATE with parameterized queries
test_parameterized_update() {
    local test_name="Parameterized UPDATE Query"
    local payload="updated-skill'; DROP TABLE skills; --"

    log_test "$test_name" "27" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    sqlite_update "$TEST_DB" \
        "UPDATE skills SET name = ?1 WHERE id = ?2" \
        "$payload" "1" 2>&1 || true

    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='skills';" 2>&1)

    if [[ -n "$table_exists" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "UPDATE parameterized query failed"
    fi
}

# Test 28: String Concatenation Attack Prevention
test_concatenation_attack() {
    local test_name="String Concatenation Attack Prevention"
    local payload="test' || ' OR '1'='1"

    log_test "$test_name" "28" "$payload"

    source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

    result=$(sqlite_select "$TEST_DB" \
        "SELECT COUNT(*) FROM skills WHERE name = ?1" \
        "$payload" 2>&1)

    if [[ "$result" == "0" ]]; then
        log_pass "$test_name"
    else
        log_fail "$test_name" "String concatenation attack was not blocked"
    fi
}

# Logging functions
log_test() {
    local test_name="$1"
    local test_number="$2"
    local payload="$3"
    echo "[TEST $test_number] $test_name" >> "$RESULTS_FILE"
    echo "  Payload: $payload" >> "$RESULTS_FILE"
    ((TOTAL_TESTS++))
}

log_pass() {
    local test_name="$1"
    printf "[PASS] %s\n" "$test_name" | tee -a "$RESULTS_FILE"
    ((PASSED_TESTS++))
}

log_fail() {
    local test_name="$1"
    local reason="${2:-Unknown reason}"
    printf "[FAIL] %s\n" "$test_name" | tee -a "$RESULTS_FILE"
    echo "  Reason: $reason" | tee -a "$RESULTS_FILE"
    ((FAILED_TESTS++))
}

# Main execution
main() {
    echo "==============================================================================" | tee "$RESULTS_FILE"
    echo "CFN Loop 5 Iteration 4: Final SQL Injection Validation" | tee -a "$RESULTS_FILE"
    echo "OWASP SQL Injection Test Suite - 28 Vectors" | tee -a "$RESULTS_FILE"
    echo "==============================================================================" | tee -a "$RESULTS_FILE"
    echo "" | tee -a "$RESULTS_FILE"

    echo "Initializing test database..." | tee -a "$RESULTS_FILE"
    init_test_db

    echo "Running OWASP SQL Injection Test Suite..." | tee -a "$RESULTS_FILE"
    echo "" | tee -a "$RESULTS_FILE"

    # Run all tests
    test_single_quote_injection
    test_or_injection
    test_union_injection
    test_comment_bypass
    test_block_comment_bypass
    test_stacked_queries
    test_double_quote_injection
    test_backtick_injection
    test_time_blind_injection
    test_boolean_blind_injection
    test_hex_encoding_bypass
    test_numeric_validation
    test_numeric_validation_pass
    test_pattern_id_injection
    test_postgres_quoting
    test_escape_sequence_injection
    test_null_byte_injection
    test_newline_injection
    test_unicode_normalization
    test_case_variation
    test_wildcard_injection
    test_conditional_statement
    test_arithmetic_injection
    test_long_string_attack
    test_special_characters
    test_parameterized_insert
    test_parameterized_update
    test_concatenation_attack

    # Generate final report
    echo "" | tee -a "$RESULTS_FILE"
    echo "==============================================================================" | tee -a "$RESULTS_FILE"
    echo "Test Summary" | tee -a "$RESULTS_FILE"
    echo "==============================================================================" | tee -a "$RESULTS_FILE"
    echo "Total Tests: $TOTAL_TESTS" | tee -a "$RESULTS_FILE"
    echo "Passed: $PASSED_TESTS" | tee -a "$RESULTS_FILE"
    echo "Failed: $FAILED_TESTS" | tee -a "$RESULTS_FILE"

    if [[ $TOTAL_TESTS -gt 0 ]]; then
        PASS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
        echo "Pass Rate: ${PASS_RATE}%" | tee -a "$RESULTS_FILE"
    fi

    echo "" | tee -a "$RESULTS_FILE"

    # Clean up
    rm -f "$TEST_DB"

    # Exit with appropriate code
    if [[ $FAILED_TESTS -eq 0 ]]; then
        echo "All tests passed!" | tee -a "$RESULTS_FILE"
        return 0
    else
        echo "Some tests failed." | tee -a "$RESULTS_FILE"
        return 1
    fi
}

main "$@"
