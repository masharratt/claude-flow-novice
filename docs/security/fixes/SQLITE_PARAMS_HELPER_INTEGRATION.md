# SQLite Parameter Helper Library - Integration Guide

## Overview

The `sqlite-params.sh` helper library provides secure parameterized SQL query execution to prevent SQL injection attacks. It uses SQLite's `.parameter` command for proper value binding.

## Installation

```bash
source ".claude/skills/bootstrap/sqlite-params.sh"
```

## Requirements

- SQLite 3.32.0+ (for `.parameter` support)
- Bash 4.0+

Check your SQLite version:
```bash
sqlite3 --version
```

## Functions

### sqlite_select

Execute SELECT query with parameter binding.

**Syntax:**
```bash
sqlite_select <db_path> <query> [param1] [param2] ...
```

**Example:**
```bash
# Simple SELECT
email=$(sqlite_select "$DB" "SELECT email FROM users WHERE id = ?1" "123")

# Multiple parameters
results=$(sqlite_select "$DB" "SELECT * FROM users WHERE active = ?1 AND email LIKE ?2" "1" "%@example.com")
```

### sqlite_insert

Execute INSERT query with parameter binding.

**Syntax:**
```bash
sqlite_insert <db_path> <query> [param1] [param2] ...
```

**Example:**
```bash
# Insert new user
sqlite_insert "$DB" "INSERT INTO users (username, email, active) VALUES (?1, ?2, ?3)" \
  "alice" "alice@example.com" "1"

# Returns 0 on success, 1 on failure
if sqlite_insert "$DB" "INSERT INTO logs (message) VALUES (?1)" "User logged in"; then
  echo "Log entry created"
fi
```

### sqlite_update

Execute UPDATE query with parameter binding.

**Syntax:**
```bash
sqlite_update <db_path> <query> [param1] [param2] ...
```

**Example:**
```bash
# Update user email
sqlite_update "$DB" "UPDATE users SET email = ?1 WHERE id = ?2" \
  "newemail@example.com" "123"

# Update multiple columns
sqlite_update "$DB" "UPDATE users SET email = ?1, active = ?2 WHERE id = ?3" \
  "updated@example.com" "0" "123"
```

### sqlite_delete

Execute DELETE query with parameter binding.

**Syntax:**
```bash
sqlite_delete <db_path> <query> [param1] [param2] ...
```

**Example:**
```bash
# Delete by ID
sqlite_delete "$DB" "DELETE FROM users WHERE id = ?1" "123"

# Delete with multiple conditions
sqlite_delete "$DB" "DELETE FROM sessions WHERE user_id = ?1 AND expired = ?2" \
  "123" "1"
```

### sqlite_upsert

Execute INSERT OR REPLACE query with parameter binding.

**Syntax:**
```bash
sqlite_upsert <db_path> <query> [param1] [param2] ...
```

**Example:**
```bash
# Insert or update config
sqlite_upsert "$DB" "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)" \
  "theme" "dark"

# Validation error if not INSERT OR REPLACE
sqlite_upsert "$DB" "INSERT INTO config (key, value) VALUES (?1, ?2)" \
  "theme" "dark"
# ERROR: Query must be INSERT OR REPLACE
```

### sqlite_exec

Execute any query with optional parameter binding.

**Syntax:**
```bash
sqlite_exec <db_path> <query> [param1] [param2] ...
```

**Example:**
```bash
# DDL without parameters
sqlite_exec "$DB" "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"

# Query with parameters
sqlite_exec "$DB" "PRAGMA table_info(?1)" "users"
```

## Parameter Syntax

The library uses numbered positional parameters:

- `?1` - First parameter
- `?2` - Second parameter
- `?3` - Third parameter
- etc.

**Note:** Parameters are indexed from 1, not 0.

## Security Features

### SQL Injection Prevention

All user input is treated as data, not SQL code:

```bash
# Safe - malicious input is stored as literal data
malicious="'; DROP TABLE users; --"
sqlite_insert "$DB" "INSERT INTO users (username) VALUES (?1)" "$malicious"

# The table is NOT dropped - the string is stored as-is
```

### Tested Attack Vectors

The library has been tested against:

1. **DROP TABLE injection**
   ```bash
   malicious="'; DROP TABLE users; --"
   # Neutralized ✓
   ```

2. **OR 1=1 injection**
   ```bash
   malicious="' OR '1'='1"
   # Neutralized ✓
   ```

3. **UNION SELECT injection**
   ```bash
   malicious="' UNION SELECT password FROM users WHERE '1'='1"
   # Neutralized ✓
   ```

4. **Comment bypass**
   ```bash
   malicious="admin' --"
   # Neutralized ✓
   ```

5. **Stacked queries**
   ```bash
   malicious="'; INSERT INTO users (username) VALUES ('hacked'); --"
   # Neutralized ✓
   ```

## Special Character Handling

The library correctly handles:

- Single and double quotes
- SQL keywords
- Special characters: `;`, `--`, `/*`, `*/`
- Newlines and tabs
- Unicode characters
- Empty strings
- Whitespace

```bash
# All of these work correctly
sqlite_insert "$DB" "INSERT INTO users (email) VALUES (?1)" "test@example.com"
sqlite_insert "$DB" "INSERT INTO users (email) VALUES (?1)" ""
sqlite_insert "$DB" "INSERT INTO users (email) VALUES (?1)" "Hello 世界"
sqlite_insert "$DB" "INSERT INTO users (email) VALUES (?1)" $'line1\nline2'
```

## Error Handling

### Database Not Found

```bash
result=$(sqlite_select "/nonexistent.db" "SELECT 1" 2>&1)
# Output: ERROR: Database not found: /nonexistent.db
# Return code: 1
```

### Invalid Query Type (upsert)

```bash
result=$(sqlite_upsert "$DB" "INSERT INTO users (name) VALUES (?1)" "test" 2>&1)
# Output: ERROR: Query must be INSERT OR REPLACE
# Return code: 1
```

## Integration Examples

### User Registration Workflow

```bash
#!/bin/bash
source ".claude/skills/bootstrap/sqlite-params.sh"

DB="app.db"

# Create user
register_user() {
    local username="$1"
    local email="$2"

    # Insert user
    if sqlite_insert "$DB" "INSERT INTO users (username, email, active, created_at) VALUES (?1, ?2, ?3, datetime('now'))" \
        "$username" "$email" "1"; then

        # Get user ID
        user_id=$(sqlite_select "$DB" "SELECT id FROM users WHERE username = ?1" "$username")

        # Create welcome log
        sqlite_insert "$DB" "INSERT INTO logs (user_id, message, level) VALUES (?1, ?2, ?3)" \
            "$user_id" "User registered" "INFO"

        # Set default config
        sqlite_upsert "$DB" "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)" \
            "user_${user_id}_theme" "light"

        echo "User registered: ID=$user_id"
        return 0
    else
        echo "Failed to register user" >&2
        return 1
    fi
}

# Usage
register_user "john_doe" "john@example.com"
```

### Data Migration Script

```bash
#!/bin/bash
source ".claude/skills/bootstrap/sqlite-params.sh"

OLD_DB="old_app.db"
NEW_DB="new_app.db"

# Migrate users
migrate_users() {
    # Get all users from old database
    local users
    users=$(sqlite_select "$OLD_DB" "SELECT id, username, email FROM users")

    # Process each user (assuming CSV output)
    while IFS='|' read -r id username email; do
        # Insert into new database with transformations
        sqlite_insert "$NEW_DB" "INSERT INTO users (legacy_id, username, email, migrated_at) VALUES (?1, ?2, ?3, datetime('now'))" \
            "$id" "$username" "$email"

        echo "Migrated user: $username"
    done <<< "$users"
}

migrate_users
```

### Configuration Management

```bash
#!/bin/bash
source ".claude/skills/bootstrap/sqlite-params.sh"

DB="config.db"

# Get config value
get_config() {
    local key="$1"
    local default="$2"

    local value
    value=$(sqlite_select "$DB" "SELECT value FROM config WHERE key = ?1" "$key")

    echo "${value:-$default}"
}

# Set config value (upsert)
set_config() {
    local key="$1"
    local value="$2"

    sqlite_upsert "$DB" "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?1, ?2, datetime('now'))" \
        "$key" "$value"
}

# Usage
set_config "app_name" "My Application"
set_config "debug_mode" "true"

app_name=$(get_config "app_name" "Default App")
debug_mode=$(get_config "debug_mode" "false")

echo "App: $app_name (debug: $debug_mode)"
```

## Testing

### Built-in Test Function

```bash
source ".claude/skills/bootstrap/sqlite-params.sh"

# Run built-in security tests
test_param_binding
```

### Comprehensive Test Suite

```bash
# Run full test suite
bash tests/test-sqlite-params-helper.sh
```

## Performance Considerations

### Batch Operations

For large datasets, use transactions:

```bash
# Start transaction
sqlite_exec "$DB" "BEGIN TRANSACTION"

# Batch inserts
for i in {1..1000}; do
    sqlite_insert "$DB" "INSERT INTO users (username) VALUES (?1)" "user_$i"
done

# Commit transaction
sqlite_exec "$DB" "COMMIT"
```

### Query Optimization

```bash
# Create indexes for frequently queried columns
sqlite_exec "$DB" "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"
sqlite_exec "$DB" "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)"

# Analyze query performance
sqlite_exec "$DB" "ANALYZE"
```

## Limitations

1. **Parameter binding for values only**
   - Table names and column names cannot be parameterized
   - Use `validate_sql_identifier()` helper for dynamic identifiers

2. **SQLite CLI specific**
   - For production applications, use language-specific SQLite bindings (Python `sqlite3`, Node `better-sqlite3`, etc.)

3. **SQLite version dependency**
   - Requires SQLite 3.32.0+ for `.parameter` command
   - Check version before deployment

## Migration from String Escaping

### Old Pattern (Unsafe)

```bash
# ❌ DON'T DO THIS
username="$1"
query="SELECT * FROM users WHERE username = '${username//\'/\'\'}'"
sqlite3 "$DB" "$query"
```

### New Pattern (Safe)

```bash
# ✅ DO THIS
username="$1"
sqlite_select "$DB" "SELECT * FROM users WHERE username = ?1" "$username"
```

## Troubleshooting

### Error: "unrecognized token: \".parameter\""

Your SQLite version is too old. Upgrade to 3.32.0+:

```bash
sqlite3 --version
# Should show: 3.32.0 or higher
```

### Error: "syntax error near ?"

Make sure you're using numbered parameters (`?1`, `?2`) not just `?`:

```bash
# ❌ Wrong
sqlite_select "$DB" "SELECT * FROM users WHERE id = ?" "123"

# ✅ Correct
sqlite_select "$DB" "SELECT * FROM users WHERE id = ?1" "123"
```

### Empty Results

Check that parameters are in the correct order:

```bash
# Parameters are bound in the order they appear in function call
sqlite_update "$DB" "UPDATE users SET email = ?1 WHERE id = ?2" \
  "new@example.com" \  # ?1
  "123"                # ?2
```

## References

- [SQLite `.parameter` command documentation](https://www.sqlite.org/cli.html#_param_eterize_sql_)
- [SQL injection prevention best practices](https://owasp.org/www-community/attacks/SQL_Injection)
- [CFN Loop sqlite-params skill](/.claude/skills/bootstrap/sqlite-params.sh)

## Support

For issues or questions:

1. Check SQLite version compatibility
2. Review parameter syntax (`?1`, `?2`, etc.)
3. Run built-in tests: `test_param_binding`
4. Check error messages for specific issues

---

**Version:** 1.0.0
**Last Updated:** 2025-11-17
**SQLite Requirement:** 3.32.0+
