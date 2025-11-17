#!/bin/bash
# SQLite Parameterized Query Helper Library
# Provides secure parameter binding for SQLite queries to prevent SQL injection
#
# SECURITY: This library replaces manual SQL escaping (${var//\'/\'\'}) with
# proper parameterized queries using SQLite's .parameter command.
#
# SQLite Version Requirement: 3.32.0+ (for .parameter support)
# Check with: sqlite3 --version
#
# Usage:
#   source ".claude/skills/bootstrap/sqlite-params.sh"
#   sqlite_select "$DB_PATH" "SELECT * FROM table WHERE id = ?1" "$user_input"
#   sqlite_insert "$DB_PATH" "INSERT INTO table (col1, col2) VALUES (?1, ?2)" "$val1" "$val2"
#
# Parameter Syntax:
#   Positional: ?1, ?2, ?3, ... (recommended for positional args)
#   Named:      :name, @name, $name (use with associative arrays)
#
# Implementation Notes:
#   - Uses .parameter init to create TEMP binding table
#   - Uses .parameter set to bind values safely
#   - All user input is treated as data, not SQL code
#   - Prevents SQL injection attacks

set -euo pipefail

# Execute SELECT query with parameter binding
# Usage: sqlite_select <db_path> <query> [param1] [param2] ...
# Returns: Query result (stdout)
# Example: sqlite_select "$DB" "SELECT * FROM users WHERE id = ?1" "123"
sqlite_select() {
    local db_path="$1"
    local query="$2"
    shift 2

    if [[ ! -f "$db_path" ]]; then
        echo "ERROR: Database not found: $db_path" >&2
        return 1
    fi

    # Build parameter binding commands
    # Use .parameter init to create binding table
    # Use .parameter set for each positional parameter (?1, ?2, ?3, ...)
    local param_count=1
    local param_commands=".parameter init"$'\n'

    for param in "$@"; do
        # Escape double quotes in parameter value for heredoc safety
        local escaped_param="${param//\"/\\\"}"
        param_commands+=".parameter set ?${param_count} \"${escaped_param}\""$'\n'
        ((param_count++))
    done

    # Execute query with parameter binding
    sqlite3 "$db_path" <<EOF
${param_commands}${query}
EOF
}

# Execute INSERT query with parameter binding
# Usage: sqlite_insert <db_path> <query> [param1] [param2] ...
# Returns: 0 on success, 1 on failure
# Example: sqlite_insert "$DB" "INSERT INTO users (name, email) VALUES (?1, ?2)" "Alice" "alice@example.com"
sqlite_insert() {
    local db_path="$1"
    local query="$2"
    shift 2

    if [[ ! -f "$db_path" ]]; then
        echo "ERROR: Database not found: $db_path" >&2
        return 1
    fi

    # Build parameter binding commands
    local param_count=1
    local param_commands=".parameter init"$'\n'

    for param in "$@"; do
        local escaped_param="${param//\"/\\\"}"
        param_commands+=".parameter set ?${param_count} \"${escaped_param}\""$'\n'
        ((param_count++))
    done

    sqlite3 "$db_path" <<EOF
${param_commands}${query}
EOF

    return $?
}

# Execute UPDATE query with parameter binding
# Usage: sqlite_update <db_path> <query> [param1] [param2] ...
# Returns: 0 on success, 1 on failure
# Example: sqlite_update "$DB" "UPDATE users SET email = ?1 WHERE id = ?2" "new@example.com" "123"
sqlite_update() {
    local db_path="$1"
    local query="$2"
    shift 2

    if [[ ! -f "$db_path" ]]; then
        echo "ERROR: Database not found: $db_path" >&2
        return 1
    fi

    # Build parameter binding commands
    local param_count=1
    local param_commands=".parameter init"$'\n'

    for param in "$@"; do
        local escaped_param="${param//\"/\\\"}"
        param_commands+=".parameter set ?${param_count} \"${escaped_param}\""$'\n'
        ((param_count++))
    done

    sqlite3 "$db_path" <<EOF
${param_commands}${query}
EOF

    return $?
}

# Execute DELETE query with parameter binding
# Usage: sqlite_delete <db_path> <query> [param1] [param2] ...
# Returns: 0 on success, 1 on failure
# Example: sqlite_delete "$DB" "DELETE FROM users WHERE id = ?1" "123"
sqlite_delete() {
    local db_path="$1"
    local query="$2"
    shift 2

    if [[ ! -f "$db_path" ]]; then
        echo "ERROR: Database not found: $db_path" >&2
        return 1
    fi

    # Build parameter binding commands
    local param_count=1
    local param_commands=".parameter init"$'\n'

    for param in "$@"; do
        local escaped_param="${param//\"/\\\"}"
        param_commands+=".parameter set ?${param_count} \"${escaped_param}\""$'\n'
        ((param_count++))
    done

    sqlite3 "$db_path" <<EOF
${param_commands}${query}
EOF

    return $?
}

# Execute generic query with parameter binding
# Usage: sqlite_exec <db_path> <query> [param1] [param2] ...
# Returns: Query result (stdout) or 0 on success
# Example: sqlite_exec "$DB" "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"
sqlite_exec() {
    local db_path="$1"
    local query="$2"
    shift 2

    if [[ ! -f "$db_path" ]]; then
        echo "ERROR: Database not found: $db_path" >&2
        return 1
    fi

    # Build parameter binding commands (if parameters provided)
    local param_commands=""
    if [[ $# -gt 0 ]]; then
        param_commands=".parameter init"$'\n'
        local param_count=1
        for param in "$@"; do
            local escaped_param="${param//\"/\\\"}"
            param_commands+=".parameter set ?${param_count} \"${escaped_param}\""$'\n'
            ((param_count++))
        done
    fi

    sqlite3 "$db_path" <<EOF
${param_commands}${query}
EOF
}

# Execute INSERT OR REPLACE with parameter binding
# Usage: sqlite_upsert <db_path> <query> [param1] [param2] ...
# Returns: 0 on success, 1 on failure
# Example: sqlite_upsert "$DB" "INSERT OR REPLACE INTO users (id, name) VALUES (?1, ?2)" "1" "Alice"
sqlite_upsert() {
    local db_path="$1"
    local query="$2"
    shift 2

    # Validate query contains INSERT OR REPLACE
    if [[ ! "$query" =~ INSERT[[:space:]]+OR[[:space:]]+REPLACE ]]; then
        echo "ERROR: Query must be INSERT OR REPLACE" >&2
        return 1
    fi

    sqlite_insert "$db_path" "$query" "$@"
}

# Helper: Test parameter binding with injection attempts
# Usage: test_param_binding
# Returns: 0 if all tests pass
test_param_binding() {
    local test_db="/tmp/test-sqlite-params-$$.db"

    # Create test database
    sqlite3 "$test_db" "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, value TEXT);"

    echo "Testing SQLite parameter binding security..."

    # Test 1: Basic parameter binding
    echo "Test 1: Basic INSERT with parameters"
    sqlite_insert "$test_db" "INSERT INTO test (name, value) VALUES (?1, ?2)" "user1" "value1"
    local count
    count=$(sqlite_select "$test_db" "SELECT COUNT(*) FROM test WHERE name = ?1" "user1")
    if [[ "$count" != "1" ]]; then
        echo "FAIL: Expected 1 row, got $count" >&2
        rm "$test_db"
        return 1
    fi
    echo "PASS"

    # Test 2: SQL injection attempt - DROP TABLE
    echo "Test 2: SQL injection attempt - DROP TABLE"
    local malicious_input="'; DROP TABLE test; --"
    sqlite_insert "$test_db" "INSERT INTO test (name, value) VALUES (?1, ?2)" "$malicious_input" "value2"
    count=$(sqlite_select "$test_db" "SELECT COUNT(*) FROM test")
    if [[ "$count" != "2" ]]; then
        echo "FAIL: Table was altered by injection! Count: $count" >&2
        rm "$test_db"
        return 1
    fi
    # Verify the malicious string was stored as literal data
    local stored_value
    stored_value=$(sqlite_select "$test_db" "SELECT name FROM test WHERE value = ?1" "value2")
    if [[ "$stored_value" != "$malicious_input" ]]; then
        echo "FAIL: Malicious input was not stored correctly" >&2
        rm "$test_db"
        return 1
    fi
    echo "PASS: Injection attempt was neutralized"

    # Test 3: SQL injection attempt - OR 1=1
    echo "Test 3: SQL injection attempt - OR 1=1"
    malicious_input="' OR '1'='1"
    count=$(sqlite_select "$test_db" "SELECT COUNT(*) FROM test WHERE name = ?1" "$malicious_input")
    if [[ "$count" != "0" ]]; then
        echo "FAIL: OR injection succeeded! Count: $count" >&2
        rm "$test_db"
        return 1
    fi
    echo "PASS: OR injection was neutralized"

    # Test 4: UPDATE with parameters
    echo "Test 4: UPDATE with parameters"
    sqlite_update "$test_db" "UPDATE test SET value = ?1 WHERE name = ?2" "updated_value" "user1"
    local updated_value
    updated_value=$(sqlite_select "$test_db" "SELECT value FROM test WHERE name = ?1" "user1")
    if [[ "$updated_value" != "updated_value" ]]; then
        echo "FAIL: UPDATE failed" >&2
        rm "$test_db"
        return 1
    fi
    echo "PASS"

    # Test 5: DELETE with parameters
    echo "Test 5: DELETE with parameters"
    sqlite_delete "$test_db" "DELETE FROM test WHERE name = ?1" "user1"
    count=$(sqlite_select "$test_db" "SELECT COUNT(*) FROM test WHERE name = ?1" "user1")
    if [[ "$count" != "0" ]]; then
        echo "FAIL: DELETE failed" >&2
        rm "$test_db"
        return 1
    fi
    echo "PASS"

    # Cleanup
    rm "$test_db"
    echo "All parameter binding tests passed!"
    return 0
}

# Export functions for use in other scripts
export -f sqlite_select sqlite_insert sqlite_update sqlite_delete sqlite_exec sqlite_upsert
