---
name: database-connection
category: foundation
team: foundation
approval_level: auto
approval_criteria:
  max_commands: 3
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
```bash
# UNSAFE - DO NOT USE
SKILL_NAME="malicious'; DROP TABLE skills; --"
sqlite3 "$DB_PATH" "SELECT * FROM skills WHERE name = '$SKILL_NAME';"  # VULNERABLE

# SAFE - Use prepared statements via variables
safe_query_by_name() {
    local db_path="$1"
    local skill_name="$2"

    # Escape single quotes
    local escaped_name="${skill_name//\'/\'\'}"

    sqlite3 "$db_path" "SELECT * FROM skills WHERE name = '$escaped_name';"
}

# SAFER - Use printf and proper quoting
safe_query_printf() {
    local db_path="$1"
    local skill_name="$2"

    sqlite3 "$db_path" <<EOF
SELECT * FROM skills WHERE name = '${skill_name//\'/\'\'}';
EOF
}
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

### Schema Verification
```bash
verify_table_exists() {
    local db_path="$1"
    local table_name="$2"

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

    local existing_columns
    existing_columns=$(sqlite3 "$db_path" "PRAGMA table_info($table_name);" | cut -d'|' -f2)

    for col in "${required_columns[@]}"; do
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

### Connection Pooling Pattern
```bash
# Reuse database connection file descriptor
exec 3< <(sqlite3 "$DB_PATH")

# Read from connection
read -r -u 3 result

# Close connection
exec 3<&-
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
