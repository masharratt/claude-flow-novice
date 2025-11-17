# SEC-003: SQL Injection Prevention - Migration Guide

## Quick Reference

**Library:** `.claude/skills/bootstrap/sqlite-params.sh`
**Linter:** `.claude/hooks/cfn-lint-sql-injection.sh`
**Pre-commit Hook:** `.git/hooks/pre-commit`
**Test Suite:** `tests/security/test-sec-003-migration.sh`

## Migration Pattern

### Step 1: Source the Library
```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Load parameterized query library (SQL injection prevention)
source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"
```

### Step 2: Replace Direct sqlite3 Calls

**BEFORE (VULNERABLE):**
```bash
RESULT=$(sqlite3 "$DB" "SELECT * FROM users WHERE name='$user_input'")
```

**AFTER (SECURE):**
```bash
RESULT=$(sqlite_select "$DB" "SELECT * FROM users WHERE name = ?1" "$user_input")
```

## Function Reference

### sqlite_select
**Use:** SELECT queries that return data
**Signature:** `sqlite_select <db_path> <query> [param1] [param2] ...`
**Example:**
```bash
# Single parameter
user=$(sqlite_select "$DB" "SELECT name FROM users WHERE id = ?1" "$user_id")

# Multiple parameters
result=$(sqlite_select "$DB" "SELECT * FROM orders WHERE user_id = ?1 AND status = ?2" "$uid" "pending")

# Subquery with parameter
avg=$(sqlite_select "$DB" "SELECT AVG(price) FROM (SELECT price FROM products WHERE category = ?1)" "$category")
```

### sqlite_insert
**Use:** INSERT statements
**Signature:** `sqlite_insert <db_path> <query> [param1] [param2] ...`
**Example:**
```bash
sqlite_insert "$DB" "INSERT INTO users (name, email) VALUES (?1, ?2)" "$name" "$email"
```

### sqlite_exec
**Use:** UPDATE, DELETE, or any other statement (no result returned)
**Signature:** `sqlite_exec <db_path> <query> [param1] [param2] ...`
**Example:**
```bash
# UPDATE
sqlite_exec "$DB" "UPDATE users SET status = ?1 WHERE id = ?2" "active" "$user_id"

# DELETE
sqlite_exec "$DB" "DELETE FROM sessions WHERE expires < ?1" "$current_time"

# INSERT (when no result needed)
sqlite_exec "$DB" "INSERT INTO logs (message, level) VALUES (?1, ?2)" "$msg" "ERROR"
```

## Placeholder Syntax

### Positional Parameters (Recommended)
```bash
# Use ?1, ?2, ?3, ... for positional arguments
sqlite_select "$DB" "SELECT * FROM table WHERE col1 = ?1 AND col2 = ?2" "$val1" "$val2"
```

### Named Parameters (Advanced)
```bash
# Use :name, @name, $name for associative arrays
declare -A params=(["name"]="Alice" ["age"]="30")
# Implementation: contact maintainer for named parameter usage
```

## Common Migration Patterns

### Pattern 1: Simple WHERE Clause
```bash
# BEFORE
RESULT=$(sqlite3 "$DB" "SELECT * FROM table WHERE id = $id")

# AFTER
RESULT=$(sqlite_select "$DB" "SELECT * FROM table WHERE id = ?1" "$id")
```

### Pattern 2: Multiple WHERE Conditions
```bash
# BEFORE
RESULT=$(sqlite3 "$DB" "SELECT * FROM table WHERE status='$status' AND date='$date'")

# AFTER
RESULT=$(sqlite_select "$DB" "SELECT * FROM table WHERE status = ?1 AND date = ?2" "$status" "$date")
```

### Pattern 3: INSERT Statement
```bash
# BEFORE
sqlite3 "$DB" << EOF
INSERT INTO table (col1, col2, col3) VALUES ('$val1', '$val2', '$val3');
EOF

# AFTER
sqlite_insert "$DB" "INSERT INTO table (col1, col2, col3) VALUES (?1, ?2, ?3)" "$val1" "$val2" "$val3"
```

### Pattern 4: Heredoc with Variables
```bash
# BEFORE
sqlite3 "$DB" << EOFSQL
INSERT INTO alerts (run_id, type, severity, message)
VALUES ($run_id, '$type', '$severity', '$message');
EOFSQL

# AFTER
MESSAGE="$message"  # Extract to variable if needed
sqlite_exec "$DB" \
  "INSERT INTO alerts (run_id, type, severity, message) VALUES (?1, ?2, ?3, ?4)" \
  "$run_id" "$type" "$severity" "$MESSAGE"
```

### Pattern 5: Subquery with Parameter
```bash
# BEFORE
AVG=$(sqlite3 "$DB" "SELECT AVG(rate) FROM (SELECT rate FROM runs WHERE id != $latest_id LIMIT 10)")

# AFTER
AVG=$(sqlite_select "$DB" "SELECT AVG(rate) FROM (SELECT rate FROM runs WHERE id != ?1 LIMIT 10)" "$latest_id")
```

### Pattern 6: Date/Time Calculations
```bash
# BEFORE
COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM table WHERE timestamp >= datetime('now', '-$days days')")

# AFTER
# Note: Numeric values in datetime() are safe, but parameterize the filter
COUNT=$(sqlite_select "$DB" "SELECT COUNT(*) FROM table WHERE timestamp >= datetime('now', '-' || ?1 || ' days')" "$days")

# Or if days is validated numeric:
# Use literal string concatenation in query with validated input
COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM table WHERE timestamp >= datetime('now', '-$days days')")
# ONLY IF $days is validated with validate_numeric() or similar
```

### Pattern 7: JSON Queries
```bash
# BEFORE
DATA=$(sqlite3 -json "$DB" "SELECT * FROM table WHERE status='$status'")

# AFTER
DATA=$(sqlite3 -json "$DB" ".parameter init
.parameter set :status '$status'
SELECT * FROM table WHERE status = :status;")

# Or use sqlite_select wrapper (non-JSON):
RESULT=$(sqlite_select "$DB" "SELECT * FROM table WHERE status = ?1" "$status")
```

## Validation Before Parameterization

### When to Use Input Validation
Parameterized queries prevent SQL injection but validation adds defense-in-depth:

```bash
# Validate numeric input
validate_numeric() {
    local input="$1"
    if ! [[ "$input" =~ ^[0-9]+$ ]]; then
        echo "ERROR: Invalid numeric input: $input" >&2
        return 1
    fi
    return 0
}

validate_numeric "$user_input" || exit 1
RESULT=$(sqlite_select "$DB" "SELECT * FROM table WHERE id = ?1" "$user_input")
```

### When to Use Identifier Validation
For table/column names (cannot be parameterized):

```bash
validate_identifier() {
    local identifier="$1"
    if [[ ! "$identifier" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
        echo "ERROR: Invalid identifier: $identifier" >&2
        return 1
    fi
    echo "$identifier"
}

TABLE=$(validate_identifier "$1") || exit 1
sqlite3 "$DB" "SELECT * FROM $TABLE"  # Validated identifier safe to use
```

## Testing Your Migration

### Step 1: Run SQL Injection Linter
```bash
bash .claude/hooks/cfn-lint-sql-injection.sh path/to/your/script.sh
```

**Expected Output (Success):**
- No output (exit code 0)

**Expected Output (Vulnerability Found):**
```
VULNERABILITY DETECTED in path/to/your/script.sh:
42: RESULT=$(sqlite3 "$DB" "SELECT * FROM table WHERE id='$user_input'")

RECOMMENDATION: Use parameterized queries from .claude/skills/bootstrap/sqlite-params.sh
Example: sqlite_select "$DB" "SELECT * FROM table WHERE id = ?1" "$user_input"
```

### Step 2: Run Functional Test
```bash
# Create test database
TEST_DB="/tmp/test-$$.db"
source .claude/skills/bootstrap/sqlite-params.sh

sqlite3 "$TEST_DB" "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
sqlite_insert "$TEST_DB" "INSERT INTO users (name) VALUES (?1)" "Alice"

# Test injection attempt (should be safe)
INJECTION_ATTEMPT="'; DROP TABLE users; --"
RESULT=$(sqlite_select "$TEST_DB" "SELECT name FROM users WHERE name = ?1" "$INJECTION_ATTEMPT" || echo "")

# Verify table still exists
TABLE_COUNT=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users'")
[[ "$TABLE_COUNT" == "1" ]] && echo "✓ Injection prevented" || echo "✗ Injection succeeded"

rm -f "$TEST_DB"
```

### Step 3: Run Comprehensive Test Suite
```bash
bash tests/security/test-sec-003-migration.sh
```

## Pre-commit Hook Bypass (Not Recommended)

If you need to commit temporarily without SQL injection checks:
```bash
git commit --no-verify -m "WIP: migration in progress"
```

**WARNING:** Only use for work-in-progress commits during migration. Do NOT bypass for final commits.

## Troubleshooting

### Error: "sqlite-params.sh: No such file or directory"
**Cause:** Incorrect relative path to library
**Fix:** Verify PROJECT_ROOT calculation
```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"  # Adjust ../../../ as needed
echo "$PROJECT_ROOT"  # Should point to project root
```

### Error: "near '?1': syntax error"
**Cause:** Parameterized query not executed through sqlite-params.sh library
**Fix:** Ensure you're using sqlite_select/sqlite_insert/sqlite_exec, not direct sqlite3

### Error: "parameter :1 has no value"
**Cause:** Mismatch between placeholder count and parameter count
**Fix:** Verify all ?1, ?2, ?3, ... have corresponding parameters
```bash
# WRONG: Missing ?2
sqlite_select "$DB" "SELECT * FROM table WHERE a = ?1 AND b = ?3" "$a" "$b"

# CORRECT: All placeholders present
sqlite_select "$DB" "SELECT * FROM table WHERE a = ?1 AND b = ?2" "$a" "$b"
```

### Linter False Positive
**Cause:** Comment or heredoc flagged as vulnerability
**Fix:** Linter excludes most false positives. If needed, use `sqlite_*` functions to silence warnings

## Remaining Scripts to Migrate (Iteration 2)

1. **track-cost-savings.sh** (14+ patterns) - CRITICAL
2. **track-edge-case.sh** - MEDIUM
3. **scripts/skills-db/seed-from-filesystem.sh** - MEDIUM
4. **scripts/skills-db/init-database-v2.sh** - LOW (review for heredocs)
5. **scripts/skills-db/approve-skill.sh** - MEDIUM
6. **scripts/cleanup-workspaces.sh** - MEDIUM

**Completed:**
- ✓ store-benchmarks.sh
- ✓ test-memory-persistence.sh
- ✓ ttl-cleanup.sh
- ✓ agent-handoff.sh
- ✓ detect-regressions.sh

**Skip:**
- check-dependencies.sh (no SQL queries)
- init-benchmark-db.sh (static SQL only, already safe)

## References

- **Library Implementation:** `.claude/skills/bootstrap/sqlite-params.sh`
- **Security Guide:** `docs/SQL_INJECTION_PREVENTION_GUIDE.md`
- **Test Suite:** `tests/security/test-sec-003-migration.sh`
- **Iteration 1 Results:** `docs/security/SEC-003_ITERATION_1_RESULTS.md`

## Support

For questions or issues with migration:
1. Review this guide
2. Check test suite for examples
3. Run linter for specific vulnerability detection
4. Consult iteration 1 results for lessons learned
