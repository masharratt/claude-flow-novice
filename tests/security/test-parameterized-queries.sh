#!/usr/bin/env bash
# Test: Parameterized Queries Security and Functionality
set -euo pipefail

# Source test utilities
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$TEST_DIR/../test-utils.sh"

# Source the parameterized queries skill
SKILL_DIR="$(dirname "$TEST_DIR")/../.claude/skills/cfn-parameterized-queries"
source "$SKILL_DIR/parameterized-queries.sh"

# Test configuration
TEST_DB="/tmp/cfn-test-queries-$$.sqlite"
TEST_TABLE="test_users"

# Setup test database
setup_test_db() {
    log_step "Setting up test database"
    
    # Create test table
    sqlite3 "$TEST_DB" <<EOF
CREATE TABLE IF NOT EXISTS $TEST_TABLE (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
EOF
    
    # Insert test data using parameterized queries
    execute_insert "$TEST_DB" "$TEST_TABLE" \
        --columns "name,email,status" \
        --values "Admin User" "admin@test.com" "active"
    
    execute_insert "$TEST_DB" "$TEST_TABLE" \
        --columns "name,email,status" \
        --values "Test User" "user@test.com" "active"
    
    log_info "Test database created with 2 users"
}

# Cleanup
cleanup() {
    log_step "Cleaning up test database"
    rm -f "$TEST_DB"
}

# Test cases
test_validate_identifier() {
    log_step "Testing identifier validation"
    
    # Valid identifiers
    assert_success validate_sql_identifier "users"
    assert_success validate_sql_identifier "user_profiles"
    assert_success validate_sql_identifier "_private"
    assert_success validate_sql_identifier "table_123"
    
    # Invalid identifiers
    assert_failure validate_sql_identifier "users; DROP TABLE"
    assert_failure validate_sql_identifier "users'"
    assert_failure validate_sql_identifier "users--"
    assert_failure validate_sql_identifier "users/**/"
    assert_failure validate_sql_identifier "1users"  # Starts with number
    assert_failure validate_sql_identifier ""        # Empty
    
    log_info "✓ Identifier validation working correctly"
}

test_sql_injection_prevention() {
    log_step "Testing SQL injection prevention"
    
    # Attempt SQL injection through parameters
    local malicious_input="admin@test.com'; DROP TABLE ${TEST_TABLE}; --"
    
    # This should NOT drop the table (parameter binding)
    local result
    result=$(execute_select_one "$TEST_DB" \
        "SELECT name FROM $TEST_TABLE WHERE email = ? LIMIT 1;" \
        "$malicious_input" 2>&1 || true)
    
    # Table should still exist and have data
    local count
    count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM $TEST_TABLE;")
    assert_equals "$count" "2" "Table should still have 2 records"
    
    # Valid query should still work
    local name
    name=$(execute_select_one "$TEST_DB" \
        "SELECT name FROM $TEST_TABLE WHERE email = ? LIMIT 1;" \
        "admin@test.com")
    assert_equals "$name" "Admin User" "Valid query should work"
    
    log_info "✓ SQL injection prevented"
}

test_parameterized_select() {
    log_step "Testing parameterized SELECT queries"
    
    # Test single result
    local name
    name=$(execute_select_one "$TEST_DB" \
        "SELECT name FROM $TEST_TABLE WHERE email = ? LIMIT 1;" \
        "admin@test.com")
    assert_equals "$name" "Admin User"
    
    # Test multiple results
    local emails
    emails=$(execute_select_many "$TEST_DB" \
        "SELECT email FROM $TEST_TABLE WHERE status = ?;" \
        "active" | tr '\n' ',')
    [[ "$emails" == *"admin@test.com"* ]] || fail "admin@test.com not found"
    [[ "$emails" == *"user@test.com"* ]] || fail "user@test.com not found"
    
    # Test no parameters
    local count
    count=$(execute_select_one "$TEST_DB" "SELECT COUNT(*) FROM $TEST_TABLE;")
    assert_equals "$count" "2"
    
    log_info "✓ Parameterized SELECT queries working"
}

test_parameterized_insert() {
    log_step "Testing parameterized INSERT"
    
    # Insert new user
    execute_insert "$TEST_DB" "$TEST_TABLE" \
        --columns "name,email,status" \
        --values "New User" "new@test.com" "inactive"
    
    # Verify insertion
    local count
    count=$(count_records "$TEST_DB" "$TEST_TABLE")
    assert_equals "$count" "3"
    
    # Verify data integrity
    local name
    name=$(get_by_id "$TEST_DB" "$TEST_TABLE" "3" "id" | cut -d'|' -f2)
    assert_equals "$name" "New User"
    
    log_info "✓ Parameterized INSERT working"
}

test_parameterized_update() {
    log_step "Testing parameterized UPDATE"
    
    # Update user status
    execute_update "$TEST_DB" "$TEST_TABLE" "status" "inactive" "email" "user@test.com"
    
    # Verify update
    local status
    status=$(execute_select_one "$TEST_DB" \
        "SELECT status FROM $TEST_TABLE WHERE email = ?;" \
        "user@test.com")
    assert_equals "$status" "inactive"
    
    log_info "✓ Parameterized UPDATE working"
}

test_parameterized_delete() {
    log_step "Testing parameterized DELETE"
    
    # Delete inactive user
    execute_delete "$TEST_DB" "$TEST_TABLE" "status" "inactive"
    
    # Verify deletion
    local count
    count=$(count_records "$TEST_DB" "$TEST_TABLE")
    assert_equals "$count" "2"
    
    log_info "✓ Parameterized DELETE working"
}

test_transaction_support() {
    log_step "Testing transaction support"
    
    # Begin transaction
    begin_transaction "$TEST_DB"
    
    # Insert user
    execute_insert "$TEST_DB" "$TEST_TABLE" \
        --columns "name,email,status" \
        --values "Transaction User" "trans@test.com" "pending"
    
    # Rollback
    rollback_transaction "$TEST_DB"
    
    # Verify rollback
    local exists
    exists=$(execute_exists "$TEST_DB" "$TEST_TABLE" "email" "trans@test.com" && echo "true" || echo "false")
    assert_equals "$exists" "false"
    
    # Test successful transaction
    begin_transaction "$TEST_DB"
    execute_insert "$TEST_DB" "$TEST_TABLE" \
        --columns "name,email" \
        --values "Committed User" "committed@test.com"
    commit_transaction "$TEST_DB"
    
    # Verify commit
    exists=$(execute_exists "$TEST_DB" "$TEST_TABLE" "email" "committed@test.com" && echo "true" || echo "false")
    assert_equals "$exists" "true"
    
    log_info "✓ Transaction support working"
}

test_error_handling() {
    log_step "Testing error handling"
    
    # Test invalid database file
    assert_failure execute_select_one "/nonexistent/db.sqlite" "SELECT 1;"
    
    # Test invalid table name
    assert_failure validate_table_name "invalid;table"
    
    # Test invalid column name
    assert_failure validate_column_name "invalid'column"
    
    # Test SQL error
    assert_failure sqlite3 "$TEST_DB" "SELECT * FROM nonexistent_table;"
    
    log_info "✓ Error handling working correctly"
}

test_input_sanitization() {
    log_step "Testing input sanitization"
    
    # Test with control characters
    local malicious_input="test$(printf '\000\001\002')@example.com"
    local sanitized
    sanitized=$(sanitize_value "$malicious_input")
    
    # Control characters should be removed
    [[ ! "$sanitized" == *$'\000'* ]] || fail "Null byte not removed"
    [[ ! "$sanitized" == *$'\001'* ]] || fail "Control character 1 not removed"
    
    # Valid characters should remain
    [[ "$sanitized" == *"test@example.com"* ]] || fail "Valid content was modified"
    
    log_info "✓ Input sanitization working"
}

test_performance() {
    log_step "Testing performance with many parameters"
    
    # Insert 100 records with parameters
    begin_transaction "$TEST_DB"
    for i in {1..100}; do
        execute_insert "$TEST_DB" "$TEST_TABLE" \
            --columns "name,email,status" \
            --values "User $i" "user$i@test.com" "active"
    done
    commit_transaction "$TEST_DB"
    
    # Count all records
    local count
    count=$(count_records "$TEST_DB" "$TEST_TABLE")
    assert_equals "$count" "102"  # 2 initial + 100 new
    
    log_info "✓ Performance test passed (102 records)"
}

# Main test execution
main() {
    log_test suite "CFN Parameterized Queries Security and Functionality"
    
    # Setup
    setup_cleanup_trap cleanup
    setup_test_db
    
    # Run tests
    test_validate_identifier
    test_sql_injection_prevention
    test_parameterized_select
    test_parameterized_insert
    test_parameterized_update
    test_parameterized_delete
    test_transaction_support
    test_error_handling
    test_input_sanitization
    test_performance
    
    # Summary
    log_test_suite_passed
}

# Execute if run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi