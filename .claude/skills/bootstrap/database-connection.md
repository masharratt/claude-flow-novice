---
name: database-connection
category: foundation
team: foundation
approval_level: auto
approval_criteria:
  max_commands: 15
  test_coverage: 0.95
  no_external_calls: true
tags: [sqlite, database, foundation]
version: 1.0.0
owner: cfn-core
---

# Database Connection - Bootstrap Skill

## Overview
Core patterns for SQLite database connections, query execution, and error handling. This skill is loaded before any database-driven skills and provides foundational database access patterns.

## SQLite Connection Patterns

### Basic Connection Pattern
```bash
#!/bin/bash
set -euo pipefail

DB_PATH="${1:-./data/skills.db}"

# Verify database exists and is readable
if [[ ! -f "$DB_PATH" ]]; then
    echo "ERROR: Database not found at $DB_PATH" >&2
    exit 1
fi

if [[ ! -r "$DB_PATH" ]]; then
    echo "ERROR: Database not readable at $DB_PATH" >&2
    exit 1
fi

# Test connection
if ! sqlite3 "$DB_PATH" "SELECT 1;" &>/dev/null; then
    echo "ERROR: Cannot connect to database at $DB_PATH" >&2
    exit 1
fi

echo "Connected to database: $DB_PATH"
```

### Safe Query Execution
```bash
# Execute query with error handling
execute_query() {
    local db_path="$1"
    local query="$2"
    local error_msg="${3:-Query execution failed}"

    local result
    if ! result=$(sqlite3 "$db_path" "$query" 2>&1); then
        echo "ERROR: $error_msg" >&2
        echo "Query: $query" >&2
        echo "Details: $result" >&2
        return 1
    fi

    echo "$result"
}

# Usage
RESULT=$(execute_query "$DB_PATH" "SELECT COUNT(*) FROM skills;" "Failed to count skills")
echo "Total skills: $RESULT"
```

### Parameterized Queries (SQL Injection Prevention)

**⚠️ CRITICAL SECURITY WARNING:**

The `${var//\'/\'\'}` pattern shown below has **significant limitations** and should **NOT** be used in production:

1. **Only protects single-quoted strings** - Does not work in comments, identifiers, or different quoting contexts
2. **Can be bypassed** - Multi-layered attacks or concatenation can still succeed
3. **Not true parameterization** - SQLite CLI has no prepared statement support
4. **Limited threat model** - Only acceptable for **controlled bootstrap scenarios** with trusted input

**Recommended Alternatives for Production:**

1. **Use languages with parameterized queries**: Python `sqlite3`, Node.js `better-sqlite3`, or similar
2. **Strict input validation**: Whitelist allowed values, reject everything else
3. **Safe wrapper libraries**: Delegate all DB operations to audited security libraries
4. **Minimize bash DB access**: Use bash only for orchestration, not data manipulation

```bash
# UNSAFE - DO NOT USE IN PRODUCTION
SKILL_NAME="malicious'; DROP TABLE skills; --"
sqlite3 "$DB_PATH" "SELECT * FROM skills WHERE name = '$SKILL_NAME';"  # VULNERABLE

# CONSTRAINED BOOTSTRAP ONLY - NOT PRODUCTION SAFE
# Only use when:
# - Input is from trusted sources (config files, not user input)
# - Operating in controlled bootstrap environment
# - Alternative languages not available
safe_query_by_name() {
    local db_path="$1"
    local skill_name="$2"

    # LIMITATION: Only protects when embedded in single-quoted SQL
    # DOES NOT protect against: comments (--), identifiers, or complex attacks
    local escaped_name="${skill_name//\'/\'\'}"

    sqlite3 "$db_path" "SELECT * FROM skills WHERE name = '$escaped_name';"
}

# PRODUCTION RECOMMENDATION: Use Python/Node.js instead
# Example (Python):
# import sqlite3
# conn = sqlite3.connect(db_path)
# cursor = conn.execute("SELECT * FROM skills WHERE name = ?", (skill_name,))
# result = cursor.fetchone()
```

## Query Execution Patterns

### Single Value Retrieval
```bash
get_skill_count() {
    local db_path="$1"
    sqlite3 "$db_path" "SELECT COUNT(*) FROM skills;"
}

COUNT=$(get_skill_count "$DB_PATH")
echo "Skills in database: $COUNT"
```

### Multiple Row Processing
```bash
list_all_skills() {
    local db_path="$1"

    # Use -csv or -json for structured output
    sqlite3 -csv "$db_path" "SELECT id, name, category FROM skills ORDER BY name;"
}

# Process line by line
while IFS=',' read -r id name category; do
    echo "Skill: $name (ID: $id, Category: $category)"
done < <(list_all_skills "$DB_PATH")
```

### JSON Output Processing
```bash
get_skills_json() {
    local db_path="$1"

    # SQLite 3.33+ supports JSON output
    sqlite3 -json "$db_path" "SELECT * FROM skills LIMIT 10;"
}

# Parse JSON with jq
SKILLS_JSON=$(get_skills_json "$DB_PATH")
echo "$SKILLS_JSON" | jq -r '.[] | .name'
```

## Error Handling

### Connection Timeout
```bash
connect_with_timeout() {
    local db_path="$1"
    local timeout="${2:-5}"

    # Set busy timeout (milliseconds)
    sqlite3 "$db_path" "PRAGMA busy_timeout = $((timeout * 1000)); SELECT 1;" || {
        echo "ERROR: Connection timeout after ${timeout}s" >&2
        return 1
    }
}
```

### Transaction Management
```bash
execute_transaction() {
    local db_path="$1"
    shift
    local queries=("$@")

    {
        echo "BEGIN TRANSACTION;"
        for query in "${queries[@]}"; do
            echo "$query"
        done
        echo "COMMIT;"
    } | sqlite3 "$db_path" || {
        echo "ROLLBACK;" | sqlite3 "$db_path"
        echo "ERROR: Transaction failed and rolled back" >&2
        return 1
    }
}

# Usage
execute_transaction "$DB_PATH" \
    "INSERT INTO skills (name, category) VALUES ('test1', 'test');" \
    "INSERT INTO skills (name, category) VALUES ('test2', 'test');"
```

### Database Lock Handling
```bash
wait_for_unlock() {
    local db_path="$1"
    local max_attempts="${2:-10}"
    local attempt=0

    while ((attempt < max_attempts)); do
        if sqlite3 "$db_path" "SELECT 1;" &>/dev/null; then
            return 0
        fi

        ((attempt++))
        echo "Database locked, waiting... (attempt $attempt/$max_attempts)" >&2
        sleep 0.5
    done

    echo "ERROR: Database remains locked after $max_attempts attempts" >&2
    return 1
}
```

## Database Validation

### SQL Identifier Validation (Injection Prevention)
```bash
# SQL INJECTION PROTECTION: Validate identifier before interpolation
validate_sql_identifier() {
    local identifier="$1"
    local identifier_type="${2:-identifier}"

    # Strict validation: only allow safe SQL identifiers
    # Pattern: starts with letter/underscore, contains only alphanumeric/underscore
    if [[ ! "$identifier" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
        echo "ERROR: Invalid $identifier_type '$identifier' - must match ^[a-zA-Z_][a-zA-Z0-9_]*$" >&2
        return 1
    fi

    return 0
}
```

### Schema Verification
```bash
verify_table_exists() {
    local db_path="$1"
    local table_name="$2"

    # SQL INJECTION PREVENTION: Validate table name before query
    validate_sql_identifier "$table_name" "table name" || return 1

    # Safe to use validated table name (no interpolation risk)
    local count
    count=$(sqlite3 "$db_path" \
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='$table_name';")

    if [[ "$count" -eq 0 ]]; then
        echo "ERROR: Table '$table_name' does not exist" >&2
        return 1
    fi

    return 0
}

# Verify required tables
for table in skills categories approvals; do
    verify_table_exists "$DB_PATH" "$table" || exit 1
done
```

### Column Verification
```bash
verify_columns() {
    local db_path="$1"
    local table_name="$2"
    shift 2
    local required_columns=("$@")

    # SQL INJECTION PREVENTION: Validate table name before PRAGMA
    validate_sql_identifier "$table_name" "table name" || return 1

    # Safe to use validated table name in PRAGMA
    local existing_columns
    existing_columns=$(sqlite3 "$db_path" "PRAGMA table_info($table_name);" | cut -d'|' -f2)

    for col in "${required_columns[@]}"; do
        # SQL INJECTION PREVENTION: Validate column name
        validate_sql_identifier "$col" "column name" || return 1

        if ! echo "$existing_columns" | grep -q "^${col}$"; then
            echo "ERROR: Column '$col' missing from table '$table_name'" >&2
            return 1
        fi
    done
}

# Usage
verify_columns "$DB_PATH" "skills" id name category content hash
```

## Performance Optimization

### Index Usage
```bash
# Check if query uses indexes
explain_query() {
    local db_path="$1"
    local query="$2"

    sqlite3 "$db_path" "EXPLAIN QUERY PLAN $query"
}

# Verify index usage
PLAN=$(explain_query "$DB_PATH" "SELECT * FROM skills WHERE name = 'test';")
if ! echo "$PLAN" | grep -q "USING INDEX"; then
    echo "WARNING: Query does not use index" >&2
fi
```

### Sequential Query Pattern (Recommended)
```bash
# ⚠️ NOTE: True connection pooling is NOT supported by sqlite3 CLI
# The sqlite3 CLI tool opens a new connection for each invocation

# RECOMMENDED: Use sequential sqlite3 invocations for bootstrap scripts
# Each query gets its own connection - this is safe and reliable

# Query 1
result1=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM skills;")

# Query 2
result2=$(sqlite3 "$DB_PATH" "SELECT name FROM skills WHERE id = 1;")

# Query 3
result3=$(sqlite3 "$DB_PATH" "SELECT category FROM skills WHERE active = 1;")

# This pattern is:
# - ✅ Reliable: No process lifetime or FD management issues
# - ✅ Safe: Each connection is isolated and properly closed
# - ✅ Simple: No complex error handling required
# - ✅ Performant: Adequate for bootstrap scenarios (< 100 queries)

# For high-throughput scenarios (> 100 queries/sec), use:
# - Python sqlite3 module with connection pooling
# - Node.js better-sqlite3 with persistent connections
# - Go database/sql with connection pool management
```

**⚠️ REMOVED PATTERN (UNSAFE):**
The previous "connection pooling" pattern using process substitution and file descriptors was:
- **Experimental**: Not production-ready
- **Unreliable**: Process lifetime and FD management issues
- **Unsafe**: No proper error handling for connection state
- **Misleading**: Gave false impression of true connection pooling

```bash
# ❌ DO NOT USE - Removed for safety
# exec 3< <(sqlite3 "$DB_PATH")  # Unreliable process lifetime
# read -r -u 3 result             # No error handling
# exec 3<&-                       # Unsafe FD management
```

## Test-Driven Patterns

### Database Test Setup
```bash
setup_test_db() {
    local test_db="/tmp/test-skills-$$.db"

    sqlite3 "$test_db" <<EOF
CREATE TABLE skills (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    content TEXT,
    hash TEXT
);
EOF

    echo "$test_db"
}

# Usage in tests
TEST_DB=$(setup_test_db)
trap "rm -f '$TEST_DB'" EXIT

# Run tests...
```

### Query Result Validation
```bash
assert_query_result() {
    local db_path="$1"
    local query="$2"
    local expected="$3"

    local actual
    actual=$(sqlite3 "$db_path" "$query")

    if [[ "$actual" != "$expected" ]]; then
        echo "ASSERTION FAILED" >&2
        echo "  Query: $query" >&2
        echo "  Expected: $expected" >&2
        echo "  Actual: $actual" >&2
        return 1
    fi
}

# Usage
assert_query_result "$TEST_DB" "SELECT COUNT(*) FROM skills;" "0"
```

## Security Considerations

### Read-Only Connections
```bash
# Open database in read-only mode
sqlite3 "file:${DB_PATH}?mode=ro" "SELECT * FROM skills;"
```

### Prevent Arbitrary SQL
```bash
# Whitelist allowed operations
execute_safe_query() {
    local db_path="$1"
    local operation="$2"
    shift 2

    case "$operation" in
        count)
            sqlite3 "$db_path" "SELECT COUNT(*) FROM skills;"
            ;;
        list)
            sqlite3 "$db_path" "SELECT name FROM skills ORDER BY name;"
            ;;
        get)
            # SQL INJECTION PREVENTION: Escape single quotes (SQLite standard)
            # Replaces ' with '' to prevent SQL injection attacks
            # For production deployments, use centralized escape_sql_string()
            # from .claude/skills/workflow-codification/lib/security-utils.sh
            local skill_name="${1//\'/\'\'}"
            sqlite3 "$db_path" "SELECT * FROM skills WHERE name = '$skill_name';"
            ;;
        *)
            echo "ERROR: Invalid operation: $operation" >&2
            return 1
            ;;
    esac
}
```

## Success Criteria

- ✅ Database connectivity verified before operations
- ✅ SQL injection prevention via proper escaping
- ✅ Transaction support with rollback on failure
- ✅ Lock handling with timeout
- ✅ Schema validation before queries
- ✅ Error messages include context and details
- ✅ Read-only mode support for safe operations
- ✅ Test database setup patterns included
