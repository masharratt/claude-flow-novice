# SQL Injection Migration Checklist for Developers

## Quick Start

This checklist guides developers through migrating existing SQL code to use secure parameterized queries.

**Time Estimate:** 5-15 minutes per file
**Difficulty:** Beginner-friendly
**Tools Required:** bash, grep, sqlite3

---

## Pre-Migration Assessment

### Step 1: Identify Vulnerable Files

```bash
# Run vulnerability scan
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
echo "Files containing direct SQL variable substitution:"
grep -r "sqlite3.*\"\$" "$PROJECT_ROOT" --include="*.sh" | \
    grep -v ".backups" | \
    grep -v ".parameter" | \
    cut -d: -f1 | sort | uniq
```

**Expected Output (Current State):**
```
./.claude/cfn-extras/skills/deprecated/cfn-ace-system/add-bullet.sh
./.claude/skills/cfn-sqlite-memory/ttl-cleanup.sh
./.claude/skills/agent-lifecycle/execute-lifecycle-hook.sh
./.claude/skills/cfn-test-runner/store-benchmarks.sh
... (approximately 15 files)
```

### Step 2: Assess Severity

For each vulnerable file:

| Risk Level | Indicator | Example |
|-----------|-----------|---------|
| CRITICAL | User input in WHERE clause | `WHERE id = '$user_input'` |
| HIGH | Untrusted variable in SELECT | `SELECT * FROM agents WHERE agent_id = '$param'` |
| MEDIUM | Configuration parameter in query | `WHERE status = '$status_var'` |
| LOW | Numeric-only variable | `WHERE count > $number` (still parameterize!) |

---

## Migration Workflow

### Phase 1: Prepare (5 minutes)

- [ ] **Step 1.1:** Read SQL_INJECTION_PREVENTION_GUIDE.md sections 1-3
- [ ] **Step 1.2:** Review the bootstrap library:
  ```bash
  less .claude/skills/bootstrap/sqlite-params.sh
  ```
- [ ] **Step 1.3:** Run existing tests to establish baseline:
  ```bash
  ./tests/sql-injection-security-test.sh
  # Expected: All 12 tests pass
  ```
- [ ] **Step 1.4:** Create backup of file being migrated:
  ```bash
  cp file.sh file.sh.backup
  git add file.sh.backup  # Track in version control
  ```

### Phase 2: Analyze Current Code (5-10 minutes)

For each vulnerable file, document:

**Template:**
```bash
# FILE: .claude/skills/example/vulnerable.sh
# CURRENT ISSUES:
# - Line 42: Direct substitution in WHERE clause
#   sqlite3 "$DB" "SELECT * FROM agents WHERE id = '$agent_id'"
#
# - Line 87: Variable in INSERT VALUES
#   sqlite3 "$DB" "INSERT INTO logs (message) VALUES ('$message')"
#
# - Line 123: Table name without validation
#   sqlite3 "$DB" "SELECT * FROM $table_name"
#
# PATTERN TYPES NEEDED:
# ✓ Pattern A (data parameters) - for user input
# ✓ Pattern B (identifier validation) - for table names
```

- [ ] Document all SQL queries containing variables
- [ ] Identify pattern type needed (A or B)
- [ ] Mark migration priority (CRITICAL > HIGH > MEDIUM > LOW)

### Phase 3: Execute Migration (10-15 minutes)

#### 3A: Source the Bootstrap Library

At the top of your file (after `#!/bin/bash`):
```bash
# Add this line after shebang and set -euo pipefail
source ".claude/skills/bootstrap/sqlite-params.sh"
```

- [ ] Verify library is sourced correctly
- [ ] Check path is correct (adjust if file is in different directory)

#### 3B: Replace Direct sqlite3 Calls

**For each vulnerable query:**

**Pattern A - Data Parameters (User Input):**

BEFORE:
```bash
# VULNERABLE: Direct variable substitution
count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM agents WHERE id = '$agent_id'")
```

AFTER:
```bash
# SECURE: Parameterized query
count=$(sqlite_select "$DB" "SELECT COUNT(*) FROM agents WHERE id = ?1" "$agent_id")
```

- [ ] Replace `sqlite3` calls with appropriate `sqlite_*` function
  - `SELECT` queries → `sqlite_select()`
  - `INSERT` queries → `sqlite_insert()`
  - `UPDATE` queries → `sqlite_update()`
  - `DELETE` queries → `sqlite_delete()`
  - `INSERT OR REPLACE` → `sqlite_upsert()`

- [ ] Convert variable substitution to positional parameters
  - `?1` for first parameter
  - `?2` for second parameter
  - etc.

- [ ] Verify parameter order matches function arguments

**Pattern B - Identifier Validation (Table/Column Names):**

BEFORE:
```bash
# VULNERABLE: Table name from variable
sqlite3 "$DB" "SELECT * FROM $table_name WHERE id = 1"
```

AFTER:
```bash
# SECURE: Validate identifier
table_name=$(validate_identifier "$table_name") || return 1
sqlite_select "$DB" "SELECT * FROM $table_name WHERE id = ?1" "1"
```

- [ ] Add helper function if not already present:
  ```bash
  validate_identifier() {
      local identifier="$1"
      if [[ ! "$identifier" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
          echo "ERROR: Invalid identifier: $identifier" >&2
          return 1
      fi
      echo "$identifier"
  }
  ```

- [ ] Validate before using in query
- [ ] Handle validation failure with explicit error

#### 3C: Handle Multi-Line Queries

For queries spanning multiple lines:

BEFORE:
```bash
count=$(sqlite3 "$DB" "
    SELECT COUNT(*) FROM agents
    WHERE status = '$status'
    AND type = '$type'
")
```

AFTER:
```bash
count=$(sqlite_select "$DB" \
    "SELECT COUNT(*) FROM agents
     WHERE status = ?1
     AND type = ?2" \
    "$status" "$type")
```

- [ ] Preserve line breaks for readability
- [ ] Use backslash continuation if needed
- [ ] Maintain indentation

#### 3D: Handle Complex Cases

**Date arithmetic with variables:**

BEFORE:
```bash
old_records=$(sqlite3 "$DB" \
    "SELECT * FROM table WHERE created_at < datetime('now', '-$days days')")
```

AFTER:
```bash
old_records=$(sqlite_select "$DB" \
    "SELECT * FROM table WHERE created_at < datetime('now', '-' || ?1 || ' days')" \
    "$days")
```

**Array iteration:**

BEFORE:
```bash
for agent_id in "${ids[@]}"; do
    sqlite3 "$DB" "UPDATE agents SET active = 1 WHERE id = '$agent_id'"
done
```

AFTER:
```bash
for agent_id in "${ids[@]}"; do
    sqlite_update "$DB" \
        "UPDATE agents SET active = ?1 WHERE id = ?2" \
        "1" "$agent_id"
done
```

- [ ] Apply parameterization inside loops
- [ ] Verify parameter binding for each iteration

### Phase 4: Add Error Handling (2-5 minutes)

Add defensive error checks:

```bash
# Validate database exists
if [[ ! -f "$DB_PATH" ]]; then
    echo "ERROR: Database not found: $DB_PATH" >&2
    return 1
fi

# Check query execution
if result=$(sqlite_select "$DB" "SELECT * FROM agents WHERE id = ?1" "$agent_id" 2>&1); then
    echo "$result"
else
    echo "ERROR: Database query failed: $result" >&2
    return 1
fi
```

- [ ] Add database file existence check
- [ ] Capture stderr for error messages
- [ ] Return distinct exit codes for different failure types
- [ ] Log error context (which query, which parameters) for debugging

### Phase 5: Testing (5 minutes)

#### 5A: Unit Test the Migration

```bash
# Test the updated function/script
bash file.sh --test

# Or manually test critical paths
```

- [ ] Run script with normal inputs
- [ ] Run with special characters (quotes, newlines, etc.)
- [ ] Verify output matches pre-migration behavior

#### 5B: Run Security Tests

```bash
# Run security test suite
./tests/sql-injection-security-test.sh

# Expected: All 12 tests pass
```

- [ ] Verify all OWASP injection vectors are blocked
- [ ] Check that legitimate queries still work
- [ ] Confirm no false positives/negatives

#### 5C: Integration Test

For script that integrates with other components:

```bash
# Run integration tests if available
./tests/integration/test-your-component.sh
```

- [ ] Verify the migrated script works with dependent components
- [ ] Check data consistency before/after migration
- [ ] Monitor for performance impact (should be negligible)

### Phase 6: Code Review (3 minutes)

Checklist for reviewer:

- [ ] All direct `sqlite3` calls replaced with `sqlite_*` functions
- [ ] All user input parameterized (no `"$var"` in queries)
- [ ] All identifiers validated before use
- [ ] Library sourced at top of file
- [ ] Error handling present (db file check, stderr capture)
- [ ] Comments explain security approach (for complex queries)
- [ ] Tests pass (unit + security + integration)
- [ ] Backup file preserved for reference

### Phase 7: Commit Changes (2 minutes)

```bash
# Stage changes
git add file.sh file.sh.backup

# Create descriptive commit
git commit -m "fix(sql): Migrate to parameterized queries for SQL injection prevention

- Convert direct sqlite3 calls to sqlite_* helper functions
- Parameterize all user-derived data (?1, ?2 syntax)
- Validate table/column identifiers before use
- Add error handling with distinct exit codes
- All 12 OWASP injection vectors now blocked
- Security test pass rate: 100%

Fixes: SQL injection vulnerability in [component]
See: docs/SQL_INJECTION_PREVENTION_GUIDE.md"
```

- [ ] Reference security guide in commit message
- [ ] Include test pass rate
- [ ] Document what was fixed

---

## Common Migration Patterns

### Pattern 1: Simple SELECT with One Parameter

```bash
# BEFORE
count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM agents WHERE id = '$agent_id'")

# AFTER
count=$(sqlite_select "$DB" "SELECT COUNT(*) FROM agents WHERE id = ?1" "$agent_id")
```

**Lines changed:** 1
**Risk reduction:** CRITICAL

---

### Pattern 2: INSERT with Multiple Values

```bash
# BEFORE
sqlite3 "$DB" "INSERT INTO agents (id, type, status) VALUES ('$id', '$type', '$status')"

# AFTER
sqlite_insert "$DB" \
    "INSERT INTO agents (id, type, status) VALUES (?1, ?2, ?3)" \
    "$id" "$type" "$status"
```

**Lines changed:** 2
**Risk reduction:** HIGH

---

### Pattern 3: UPDATE with Condition

```bash
# BEFORE
sqlite3 "$DB" "UPDATE agents SET status = '$new_status' WHERE id = '$agent_id'"

# AFTER
sqlite_update "$DB" \
    "UPDATE agents SET status = ?1 WHERE id = ?2" \
    "$new_status" "$agent_id"
```

**Lines changed:** 2
**Risk reduction:** CRITICAL

---

### Pattern 4: Table Name Parameter

```bash
# BEFORE
sqlite3 "$DB" "SELECT * FROM $table_name WHERE id = 1"

# AFTER
table_name=$(validate_identifier "$table_name") || return 1
sqlite_select "$DB" "SELECT * FROM $table_name WHERE id = ?1" "1"
```

**Lines changed:** 2
**Risk reduction:** CRITICAL

---

### Pattern 5: Conditional Delete

```bash
# BEFORE
sqlite3 "$DB" "DELETE FROM memory WHERE key = '$key' AND age > $days"

# AFTER
sqlite_delete "$DB" \
    "DELETE FROM memory WHERE key = ?1 AND age > ?2" \
    "$key" "$days"
```

**Lines changed:** 2
**Risk reduction:** CRITICAL

---

## Troubleshooting

### Issue 1: "Command not found: sqlite_select"

**Cause:** Library not sourced
**Solution:**
```bash
# Add to top of script after #!/bin/bash
source ".claude/skills/bootstrap/sqlite-params.sh"

# Adjust path if script is in subdirectory
source "../../.claude/skills/bootstrap/sqlite-params.sh"
```

### Issue 2: Parameter Order Mismatch

**Symptom:** Wrong values used in WHERE clause
**Debug:**
```bash
# Add verbose output
sqlite_select "$DB" "SELECT ?1, ?2, ?3" "first" "second" "third"
# Should print: first|second|third
```

**Solution:** Count parameters in query (`?1`, `?2`...) and function arguments

### Issue 3: Special Characters Breaking Queries

**Symptom:** Queries with quotes, newlines fail
**Cause:** Library not handling escaping
**Solution:** Library handles all escaping automatically, just pass data as-is

```bash
# This works - no escaping needed!
dangerous_string="'; DROP TABLE agents; --"
sqlite_select "$DB" "SELECT * FROM agents WHERE name = ?1" "$dangerous_string"
```

### Issue 4: Performance Degradation

**Symptom:** Queries run slower after migration
**Solution:** This is usually perception, not reality. If concerned:
```bash
# Benchmark before/after
time sqlite_select "$DB" "SELECT COUNT(*) FROM agents WHERE type = ?1" "worker"
```

Performance impact is typically <1% (negligible).

### Issue 5: Identifiers Still Vulnerable

**Symptom:** Table names from user input cause errors
**Solution:** Always validate identifiers:
```bash
# Get table name from user
user_table="$1"

# Validate before use
if ! table=$(validate_identifier "$user_table"); then
    echo "ERROR: Invalid table name" >&2
    return 1
fi

# Now safe to use in query
sqlite_select "$DB" "SELECT * FROM $table"
```

---

## Success Criteria

After migration, verify:

- [ ] **Functionality:** All queries produce identical results
- [ ] **Security:** All injection vectors blocked (run tests)
- [ ] **Error Handling:** Invalid queries return non-zero exit codes
- [ ] **Performance:** No measurable degradation (<1% acceptable)
- [ ] **Code Quality:** All parameters validated, error handling present
- [ ] **Documentation:** Commit message explains migration
- [ ] **Tests:** All unit/integration/security tests pass

---

## File-by-File Migration Status

| File | Priority | Status | Notes |
|------|----------|--------|-------|
| `.claude/skills/cfn-sqlite-memory/ttl-cleanup.sh` | CRITICAL | Pending | Lines 82, 104-107, 142 |
| `.claude/skills/agent-lifecycle/execute-lifecycle-hook.sh` | CRITICAL | Pending | Lines 87-92 |
| `.claude/skills/cfn-test-runner/store-benchmarks.sh` | HIGH | Pending | Lines with SUITE variable |
| `.claude/cfn-extras/skills/deprecated/cfn-ace-system/add-bullet.sh` | MEDIUM | Pending | Deprecated but still present |
| `.claude/skills/agent-lifecycle/simple-audit.sh` | CRITICAL | Pending | SAFE_AGENT_ID usage |

---

## Sign-Off

Developer: ________________
Date: ________________
Reviewed by: ________________
Date: ________________

---

## Additional Resources

- **Security Guide:** `docs/SQL_INJECTION_PREVENTION_GUIDE.md`
- **Library Code:** `.claude/skills/bootstrap/sqlite-params.sh`
- **Test Examples:** `tests/sql-injection-security-test.sh`
- **OWASP Ref:** https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
