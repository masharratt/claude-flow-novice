#!/usr/bin/env bash
# Quick validation script for sqlite-params.sh fix
# Demonstrates correct .parameter syntax and security features

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Source the fixed helper library
source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

# Test database
TEST_DB="/tmp/validate-fix-$$.db"

# Cleanup on exit
cleanup() {
    rm -f "$TEST_DB"
}
trap cleanup EXIT

# Create test database
echo "Creating test database..."
sqlite3 "$TEST_DB" <<'EOF'
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    active INTEGER DEFAULT 1
);
EOF

echo "✓ Database created"
echo ""

# Test 1: Correct .parameter syntax
echo "Test 1: Verify correct .parameter syntax"
sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" \
    "alice" "alice@example.com" "1"
count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users WHERE username = ?1" "alice")
if [[ "$count" == "1" ]]; then
    echo "✓ PASS: .parameter syntax works correctly"
else
    echo "✗ FAIL: Expected 1 user, got $count"
    exit 1
fi
echo ""

# Test 2: SQL Injection - DROP TABLE
echo "Test 2: SQL Injection Protection - DROP TABLE"
malicious_drop="'; DROP TABLE users; --"
sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" \
    "$malicious_drop" "hacker@evil.com" "1"

# Verify table still exists
total_count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users")
if [[ "$total_count" == "2" ]]; then
    echo "✓ PASS: DROP TABLE injection neutralized"
    echo "  Table still exists with $total_count rows"
else
    echo "✗ FAIL: Table was affected by injection"
    exit 1
fi

# Verify malicious string stored as data
stored=$(sqlite_select "$TEST_DB" "SELECT username FROM users WHERE email = ?1" "hacker@evil.com")
if [[ "$stored" == "$malicious_drop" ]]; then
    echo "✓ PASS: Malicious input stored as literal data"
else
    echo "✗ FAIL: Malicious input not stored correctly"
    exit 1
fi
echo ""

# Test 3: SQL Injection - OR 1=1
echo "Test 3: SQL Injection Protection - OR 1=1"
malicious_or="' OR '1'='1"
count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users WHERE username = ?1" "$malicious_or")
if [[ "$count" == "0" ]]; then
    echo "✓ PASS: OR 1=1 injection neutralized"
    echo "  Query returned 0 rows (expected)"
else
    echo "✗ FAIL: OR injection succeeded, returned $count rows"
    exit 1
fi
echo ""

# Test 4: UPDATE with parameters
echo "Test 4: UPDATE operation with parameter binding"
sqlite_update "$TEST_DB" "UPDATE users SET email = ?1 WHERE username = ?2" \
    "alice.updated@example.com" "alice"

new_email=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE username = ?1" "alice")
if [[ "$new_email" == "alice.updated@example.com" ]]; then
    echo "✓ PASS: UPDATE with parameters works correctly"
else
    echo "✗ FAIL: UPDATE failed, got: $new_email"
    exit 1
fi
echo ""

# Test 5: DELETE with parameters
echo "Test 5: DELETE operation with parameter binding"
sqlite_delete "$TEST_DB" "DELETE FROM users WHERE email = ?1" "hacker@evil.com"

count=$(sqlite_select "$TEST_DB" "SELECT COUNT(*) FROM users WHERE email = ?1" "hacker@evil.com")
if [[ "$count" == "0" ]]; then
    echo "✓ PASS: DELETE with parameters works correctly"
else
    echo "✗ FAIL: DELETE failed, still $count rows"
    exit 1
fi
echo ""

# Test 6: UPSERT operation
echo "Test 6: UPSERT (INSERT OR REPLACE) operation"
sqlite_upsert "$TEST_DB" "INSERT OR REPLACE INTO users (id, username, email, active) VALUES (?1, ?2, ?3, ?4)" \
    "1" "alice" "alice.final@example.com" "1"

final_email=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE id = ?1" "1")
if [[ "$final_email" == "alice.final@example.com" ]]; then
    echo "✓ PASS: UPSERT works correctly"
else
    echo "✗ FAIL: UPSERT failed, got: $final_email"
    exit 1
fi
echo ""

# Test 7: Special characters
echo "Test 7: Special character handling"
special="!@#\$%^&*()[]{}|;:',.<>?/~\`\""
sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" \
    "special_user" "$special" "1"

stored_special=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE username = ?1" "special_user")
if [[ "$stored_special" == "$special" ]]; then
    echo "✓ PASS: Special characters preserved correctly"
else
    echo "✗ FAIL: Special characters corrupted"
    exit 1
fi
echo ""

# Test 8: Unicode characters
echo "Test 8: Unicode character handling"
unicode="Hello 世界 🌍 Здравствуй"
sqlite_insert "$TEST_DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" \
    "unicode_user" "$unicode" "1"

stored_unicode=$(sqlite_select "$TEST_DB" "SELECT email FROM users WHERE username = ?1" "unicode_user")
if [[ "$stored_unicode" == "$unicode" ]]; then
    echo "✓ PASS: Unicode characters preserved correctly"
else
    echo "✗ FAIL: Unicode characters corrupted"
    exit 1
fi
echo ""

# Final summary
echo "=========================================="
echo "VALIDATION SUMMARY"
echo "=========================================="
echo "✓ All 8 tests passed"
echo ""
echo "Validated features:"
echo "  ✓ Correct .parameter syntax"
echo "  ✓ SQL injection protection (DROP TABLE)"
echo "  ✓ SQL injection protection (OR 1=1)"
echo "  ✓ UPDATE with parameter binding"
echo "  ✓ DELETE with parameter binding"
echo "  ✓ UPSERT (INSERT OR REPLACE)"
echo "  ✓ Special character handling"
echo "  ✓ Unicode character handling"
echo ""
echo "SQLite version: $(sqlite3 --version | awk '{print $1}')"
echo "Helper library: .claude/skills/bootstrap/sqlite-params.sh"
echo ""
echo "STATUS: READY FOR PRODUCTION USE"
