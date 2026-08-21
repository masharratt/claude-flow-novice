#!/usr/bin/env bash
# Comprehensive test suite for sqlite-params.sh helper library
# Tests all functions with edge cases, injection attempts, and integration scenarios
#
# Usage: ./tests/test-sqlite-params-helper.sh
# Returns: 0 if all tests pass, 1 if any test fails

set -euo pipefail

# Source the helper library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# A single dirname() only strips one level (tests/security -> tests), one
# short of the repo root; this file is two levels down (tests/security), so
# it needs two.
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$PROJECT_ROOT/.claude/shared-lib/bootstrap/sqlite-params.sh"

TEST_DB="/tmp/test-sqlite-comprehensive-$$.db"
TESTS_PASSED=0
TESTS_FAILED=0

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Setup test database with realistic schema
setup_test_db() {
    rm -f "$TEST_DB"
    sqlite3 "$TEST_DB" <<'SCHEMA'
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    level TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
SCHEMA
}

# Teardown
teardown_test_db() {
    rm -f "$TEST_DB"
}

# Test helper
assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if [[ "$expected" == "$actual" ]]; then
        echo -e "${GREEN}✓ PASS${NC}: $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}: $test_name"
        echo "  Expected: $expected"
        echo "  Actual: $actual"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_not_empty() {
    local actual="$1"
    local test_name="$2"

    if [[ -n "$actual" ]]; then
        echo -e "${GREEN}✓ PASS${NC}: $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}: $test_name"
        echo "  Expected: non-empty value"
        echo "  Actual: empty string"
        ((TESTS_FAILED++))
        return 1
    fi
}

# ============================================================================
# BASIC OPERATIONS TESTS
# ============================================================================

test_basic_insert() {
    setup_test_db

    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "alice" "alice@example.com" "1"

    local count
    count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users WHERE username = ?1" "alice")

    assert_equals "1" "$count" "Basic INSERT operation"

    teardown_test_db
}

test_basic_select() {
    setup_test_db

    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "bob" "bob@example.com" "1"

    local email
    email=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE username = ?1" "bob")

    assert_equals "bob@example.com" "$email" "Basic SELECT operation"

    teardown_test_db
}

test_basic_update() {
    setup_test_db

    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "charlie" "charlie@old.com" "1"
    sqlite_update "$TEST_DB" "UPDATE users SET email = ?1 WHERE username = ?2" "charlie@new.com" "charlie"

    local email
    email=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE username = ?1" "charlie")

    assert_equals "charlie@new.com" "$email" "Basic UPDATE operation"

    teardown_test_db
}

test_basic_delete() {
    setup_test_db

    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "dave" "dave@example.com" "1"
    sqlite_delete "$TEST_DB" "DELETE FROM users WHERE username = ?1" "dave"

    local count
    count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users WHERE username = ?1" "dave")

    assert_equals "0" "$count" "Basic DELETE operation"

    teardown_test_db
}

# ============================================================================
# SQL INJECTION TESTS
# ============================================================================

test_injection_drop_table() {
    setup_test_db

    local malicious="'; DROP TABLE users; --"
    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "$malicious" "hacker@example.com" "1"

    # Verify table still exists and has data
    local count
    count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users")

    assert_equals "1" "$count" "SQL injection - DROP TABLE neutralized"

    # Verify malicious string was stored as literal data
    local stored_username
    stored_username=$(sqlite_select "$TEST_DB" "SELECT username FROM users WHERE email = ?1" "hacker@example.com")

    assert_equals "$malicious" "$stored_username" "SQL injection - malicious string stored as data"

    teardown_test_db
}

test_injection_or_always_true() {
    setup_test_db

    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "alice" "alice@example.com" "1"
    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "bob" "bob@example.com" "1"

    local malicious="' OR '1'='1"
    local count
    count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users WHERE username = ?1" "$malicious")

    assert_equals "0" "$count" "SQL injection - OR 1=1 neutralized"

    teardown_test_db
}

test_injection_union_select() {
    setup_test_db

    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "alice" "alice@example.com" "1"

    local malicious="' UNION SELECT username FROM users WHERE '1'='1"
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE username = ?1" "$malicious")

    # Should return empty (no match) instead of leaking data
    assert_equals "" "$result" "SQL injection - UNION SELECT neutralized"

    teardown_test_db
}

test_injection_comment_bypass() {
    setup_test_db

    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "admin" "admin@example.com" "1"

    # Try to bypass with comment
    local malicious="admin' --"
    local result
    result=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users WHERE username = ?1 AND active = 1" "$malicious")

    assert_equals "0" "$result" "SQL injection - comment bypass neutralized"

    teardown_test_db
}

test_injection_stacked_queries() {
    setup_test_db

    # Try to execute multiple statements
    local malicious="'; INSERT INTO users (username, email) VALUES ('hacked', 'hacked@evil.com'); --"
    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "$malicious" "test@example.com" "1"

    # Should only have 1 row (the malicious string stored as data, not executed)
    local count
    count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users")

    assert_equals "1" "$count" "SQL injection - stacked queries neutralized"

    teardown_test_db
}

# ============================================================================
# SPECIAL CHARACTERS AND EDGE CASES
# ============================================================================

test_special_characters() {
    setup_test_db

    local special_chars="!@#\$%^&*()[]{}|;:',.<>?/~\`\""
    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "special" "$special_chars" "1"

    local stored
    stored=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE username = ?1" "special")

    assert_equals "$special_chars" "$stored" "Special characters preserved"

    teardown_test_db
}

test_empty_parameters() {
    setup_test_db

    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "empty" "" "1"

    local stored
    stored=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE username = ?1" "empty")

    assert_equals "" "$stored" "Empty string parameter handled"

    teardown_test_db
}

test_whitespace_parameters() {
    setup_test_db

    local whitespace="   leading and trailing spaces   "
    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "spaces" "$whitespace" "1"

    local stored
    stored=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE username = ?1" "spaces")

    assert_equals "$whitespace" "$stored" "Whitespace preserved"

    teardown_test_db
}

test_newlines_and_tabs() {
    setup_test_db

    local multiline=$'line1\nline2\ttabbed'
    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "multiline" "$multiline" "1"

    local stored
    stored=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE username = ?1" "multiline")

    assert_equals "$multiline" "$stored" "Newlines and tabs preserved"

    teardown_test_db
}

test_unicode_characters() {
    setup_test_db

    local unicode="Hello 世界 🌍 Здравствуй"
    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "unicode" "$unicode" "1"

    local stored
    stored=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE username = ?1" "unicode")

    assert_equals "$unicode" "$stored" "Unicode characters preserved"

    teardown_test_db
}

# ============================================================================
# ADVANCED OPERATIONS
# ============================================================================

test_upsert() {
    setup_test_db

    # First insert
    sqlite_upsert "$TEST_DB" "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)" "theme" "dark"

    local value1
    value1=$(sqlite_select "$TEST_DB" "SELECT value FROM config WHERE key = ?1" "theme")
    assert_equals "dark" "$value1" "UPSERT - initial insert"

    # Update via upsert
    sqlite_upsert "$TEST_DB" "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)" "theme" "light"

    local value2
    value2=$(sqlite_select "$TEST_DB" "SELECT value FROM config WHERE key = ?1" "theme")
    assert_equals "light" "$value2" "UPSERT - update existing"

    # Verify only one row
    local count
    count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM config WHERE key = ?1" "theme")
    assert_equals "1" "$count" "UPSERT - no duplicates"

    teardown_test_db
}

test_multiple_parameters() {
    setup_test_db

    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "alice" "alice@example.com" "1"
    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "bob" "bob@example.com" "0"
    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "charlie" "charlie@test.com" "1"

    local count
    count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users WHERE active = ?1 AND email LIKE ?2 AND username != ?3" "1" "%@example.com" "bob")

    assert_equals "1" "$count" "Complex WHERE with 3 parameters"

    teardown_test_db
}

test_foreign_key_integrity() {
    setup_test_db

    # Insert user
    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email) VALUES (?1, ?2)" "alice" "alice@example.com"

    # Get user ID
    local user_id
    user_id=$(sqlite_select "$TEST_DB" "SELECT id FROM users WHERE username = ?1" "alice")

    # Insert log with foreign key
    sqlite_insert "$TEST_DB" "INSERT INTO logs (user_id, message, level) VALUES (?1, ?2, ?3)" "$user_id" "User logged in" "INFO"

    # Verify log was created
    local log_count
    log_count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM logs WHERE user_id = ?1" "$user_id")

    assert_equals "1" "$log_count" "Foreign key relationship maintained"

    teardown_test_db
}

test_transaction_like_behavior() {
    setup_test_db

    # Insert 100 users sequentially
    for i in {1..100}; do
        sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "user$i" "user$i@example.com" "1"
    done

    local count
    count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users")

    assert_equals "100" "$count" "Multiple sequential inserts"

    teardown_test_db
}

# ============================================================================
# ERROR HANDLING TESTS
# ============================================================================

test_database_not_found() {
    local nonexistent_db="/tmp/nonexistent-db-$$.db"
    rm -f "$nonexistent_db"

    local output
    output=$(sqlite_select "$nonexistent_db" "SELECT 1" 2>&1 || true)

    if [[ "$output" =~ "ERROR: Database not found" ]]; then
        echo -e "${GREEN}✓ PASS${NC}: Database not found error handling"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: Database not found error handling"
        echo "  Expected error message not found"
        echo "  Output: $output"
        ((TESTS_FAILED++))
    fi
}

test_upsert_validation() {
    setup_test_db

    # Try to use upsert with regular INSERT
    local output
    output=$(sqlite_upsert "$TEST_DB" "INSERT INTO users (username, email) VALUES (?1, ?2)" "test" "test@example.com" 2>&1 || true)

    if [[ "$output" =~ "ERROR: Query must be INSERT OR REPLACE" ]]; then
        echo -e "${GREEN}✓ PASS${NC}: UPSERT validates query type"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: UPSERT validates query type"
        echo "  Expected validation error"
        echo "  Output: $output"
        ((TESTS_FAILED++))
    fi

    teardown_test_db
}

# ============================================================================
# INTEGRATION TESTS
# ============================================================================

test_realistic_user_workflow() {
    setup_test_db

    # Simulate realistic application workflow

    # 1. Create user
    sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "john_doe" "john@example.com" "1"

    # 2. Get user ID
    local user_id
    user_id=$(sqlite_select "$TEST_DB" "SELECT id FROM users WHERE username = ?1" "john_doe")
    assert_not_empty "$user_id" "Workflow - user created with ID"

    # 3. Create log entries
    sqlite_insert "$TEST_DB" "INSERT INTO logs (user_id, message, level) VALUES (?1, ?2, ?3)" "$user_id" "User registered" "INFO"
    sqlite_insert "$TEST_DB" "INSERT INTO logs (user_id, message, level) VALUES (?1, ?2, ?3)" "$user_id" "Email verified" "INFO"

    # 4. Update user config
    sqlite_upsert "$TEST_DB" "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)" "user_${user_id}_theme" "dark"

    # 5. Check logs
    local log_count
    log_count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM logs WHERE user_id = ?1" "$user_id")
    assert_equals "2" "$log_count" "Workflow - logs created"

    # 6. Update email
    sqlite_update "$TEST_DB" "UPDATE users SET email = ?1 WHERE id = ?2" "john.doe@newdomain.com" "$user_id"

    # 7. Verify update
    local new_email
    new_email=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE id = ?1" "$user_id")
    assert_equals "john.doe@newdomain.com" "$new_email" "Workflow - email updated"

    # 8. Deactivate user
    sqlite_update "$TEST_DB" "UPDATE users SET active = ?1 WHERE id = ?2" "0" "$user_id"

    # 9. Verify deactivation
    local active
    active=$(sqlite_select "$TEST_DB" "SELECT active FROM users WHERE id = ?1" "$user_id")
    assert_equals "0" "$active" "Workflow - user deactivated"

    teardown_test_db
}

test_concurrent_like_operations() {
    setup_test_db

    # Simulate multiple operations happening in sequence (like concurrent requests)
    for i in {1..10}; do
        sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" "user_$i" "user$i@example.com" "1"
        sqlite_upsert "$TEST_DB" "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)" "last_user_id" "$i"
    done

    local user_count
    user_count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users")
    assert_equals "10" "$user_count" "Concurrent-like - all users created"

    local last_id
    last_id=$(sqlite_select "$TEST_DB" "SELECT value FROM config WHERE key = ?1" "last_user_id")
    assert_equals "10" "$last_id" "Concurrent-like - config updated correctly"

    teardown_test_db
}

# ============================================================================
# TEST EXECUTION
# ============================================================================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}SQLite Parameter Helper Library Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${YELLOW}Running Basic Operations Tests...${NC}"
test_basic_insert
test_basic_select
test_basic_update
test_basic_delete
echo ""

echo -e "${YELLOW}Running SQL Injection Tests...${NC}"
test_injection_drop_table
test_injection_or_always_true
test_injection_union_select
test_injection_comment_bypass
test_injection_stacked_queries
echo ""

echo -e "${YELLOW}Running Special Characters Tests...${NC}"
test_special_characters
test_empty_parameters
test_whitespace_parameters
test_newlines_and_tabs
test_unicode_characters
echo ""

echo -e "${YELLOW}Running Advanced Operations Tests...${NC}"
test_upsert
test_multiple_parameters
test_foreign_key_integrity
test_transaction_like_behavior
echo ""

echo -e "${YELLOW}Running Error Handling Tests...${NC}"
test_database_not_found
test_upsert_validation
echo ""

echo -e "${YELLOW}Running Integration Tests...${NC}"
test_realistic_user_workflow
test_concurrent_like_operations
echo ""

# Final report
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Results${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo "Total:  $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
