# SQL Parameterization Migration Guide

**Version:** 1.0
**Date:** 2025-11-17
**Purpose:** Consolidate three parameterization approaches into single canonical pattern

---

## Migration Summary

**FROM:** Three documented patterns (stdin, `.parameter`, helper library)
**TO:** Single canonical pattern (`.parameter` named binding)
**IMPACT:** Documentation only - production code already compliant

---

## Why This Migration?

### Problem: Confusion from Multiple Patterns

**Current Documentation State:**
1. `SQLITE_PARAMETER_BINDING_GUIDE.md` recommends "stdin-based binding"
2. Same document presents `.parameter` as "alternative"
3. Helper library (`sqlite-params.sh`) exists but unused
4. Three different examples create confusion

**Reality:**
- Production code uses `.parameter` exclusively (2/2 files)
- Pattern A (stdin) has 0 implementations
- Pattern C (helper library) has 0 consumers
- Documentation doesn't match actual practice

### Solution: Align Documentation with Reality

**Promote `.parameter` to canonical pattern based on:**
- ✅ Actual developer adoption (100% of production code)
- ✅ Proven security (manual testing passed)
- ✅ Superior debuggability (explicit named parameters)
- ✅ Better scalability (multi-parameter queries)

---

## Changes Required

### Phase 1: Documentation Updates

#### 1.1 Update `SQLITE_PARAMETER_BINDING_GUIDE.md`

**Current Structure:**
```
Section 3: Recommended Approach: stdin-Based Binding  ← PRIMARY
Section 4: Alternative: .parameter Mode              ← SECONDARY
```

**New Structure:**
```
Section 3: Canonical Pattern: .parameter Named Binding  ← PRIMARY
Appendix C: Deprecated Patterns                         ← REFERENCE ONLY
  - Pattern A: stdin binding (never adopted)
  - Pattern C: Helper library (unused)
```

**Specific Changes:**

**Line 81-234:** Move stdin content to Appendix C (Deprecated Patterns)

**Line 236-330:** Promote `.parameter` content to Section 3

**Line 81:** Replace with:
```markdown
## Canonical Pattern: .parameter Named Binding

### Overview

The `.parameter` command provides explicit, debuggable SQL parameter binding. This is the **only recommended pattern** for SQLite parameterization in this project.

**Production Usage:**
- `agent-lifecycle/execute-lifecycle-hook.sh` (560 lines)
- `agent-lifecycle/simple-audit.sh` (66 lines)

**Security Status:** ✅ SECURE (manual testing passed, 0 vulnerabilities)
```

**New Appendix C (after line 1002):**
```markdown
## Appendix C: Deprecated Patterns

### Pattern A: stdin-Based Binding (DEPRECATED)

**Status:** Never adopted, documentation only
**Reason:** Zero production usage, developers preferred `.parameter` pattern

**Example (DO NOT USE):**
```bash
sqlite3 "$db" "SELECT * FROM t WHERE c = ?;" <<< "$val"
```

**Issues:**
- Limited to single parameter
- Unclear syntax for multi-parameter queries
- No explicit parameter naming
- Difficult to debug

**Migration:** Use canonical `.parameter` pattern instead.

---

### Pattern C: Helper Library (DEPRECATED)

**Status:** Created but unused
**Location:** `.claude/skills/bootstrap/sqlite-params.sh`
**Consumers:** 0

**Reason for Deprecation:**
- Over-engineered for simple use cases
- Unnecessary abstraction layer
- No developer adoption
- Pattern B preferred for transparency

**Example (DO NOT USE):**
```bash
source ".claude/skills/bootstrap/sqlite-params.sh"
sqlite_select "$db" "SELECT * FROM t WHERE c = ?" "$val"
```

**Migration:** Use canonical `.parameter` pattern directly.
```
markdown

#### 1.2 Update `.claude/skills/cfn-parameterized-queries/SKILL.md`

**Changes:**

**Lines 60-64:** Remove stdin example, replace with:
```markdown
### Parameterized SELECT (Canonical Pattern)

```bash
#!/bin/bash

# Execute SELECT with parameter binding
select_agent() {
    local db_path="$1"
    local agent_id="$2"

    sqlite3 "$db_path" <<EOF
.parameter init
.parameter set :id "$agent_id"
SELECT id, name, type, status, confidence
FROM agents WHERE id = :id;
EOF
}
```
markdown

**Lines 141-147:** Update INSERT example to canonical pattern

**Lines 305-307:** Remove stdin reference in "Never Use String Concatenation" section

**Line 1:** Update title to emphasize this is THE canonical pattern:
```markdown
# Parameterized Query Skill (Canonical Pattern)
```

#### 1.3 Create New Quick Reference

**New File:** `docs/SQLITE_PARAMETER_BINDING_QUICKSTART.md` ✅ CREATED

**Purpose:** 90% use case coverage in simple format

**Status:** Complete (see previous artifact)

---

### Phase 2: Codebase Cleanup

#### 2.1 Archive Helper Library

**File:** `.claude/skills/bootstrap/sqlite-params.sh`

**Options:**

**Option A: Archive (Recommended)**
```bash
mkdir -p .archive/deprecated-patterns
git mv .claude/skills/bootstrap/sqlite-params.sh .archive/deprecated-patterns/
git commit -m "archive: Move unused helper library to deprecated patterns"
```

**Option B: Delete**
```bash
git rm .claude/skills/bootstrap/sqlite-params.sh
git commit -m "remove: Delete unused sqlite-params helper library"
```

**Recommendation:** Archive (Option A) - preserves history and test suite for reference.

#### 2.2 Audit Production Code

**Expected Result:** No changes needed (already compliant)

**Verification Commands:**
```bash
# Should return 0 results (no deprecated patterns)
grep -r "sqlite3.*<<< " .claude/skills --include="*.sh"
grep -r "source.*sqlite-params" .claude/skills --include="*.sh"
grep -r "\${.*//\\\'/\\\\'\\\\'}" .claude/skills --include="*.sh"

# Should return 2 results (production implementations)
grep -r "\.parameter init" .claude/skills --include="*.sh"
```

**If Issues Found:**
1. Document file path
2. Create migration task
3. Update file to canonical pattern
4. Test thoroughly

---

### Phase 3: Developer Communication

#### 3.1 Update CLAUDE.md

**Add to Section 1 (Critical Rules):**
```markdown
### SQL Parameterization (REQUIRED)

**Canonical Pattern:** `.parameter` named binding

```bash
sqlite3 "$DB_PATH" << EOF
.parameter init
.parameter set :param "$value"
SELECT * FROM table WHERE column = :param;
EOF
```

**Reference:** `docs/SQLITE_PARAMETER_BINDING_QUICKSTART.md`

**Security:** Zero SQL injection vulnerabilities when used correctly.
```

#### 3.2 Update Agent Prompt Templates

**File:** `src/cli/agent-prompt-builder.ts` (or equivalent)

**Add SQL Pattern Guidance:**
```markdown
## SQLite Query Security

When writing SQL queries, ALWAYS use parameterized queries:

```bash
sqlite3 "$DB_PATH" << EOF
.parameter init
.parameter set :param "$user_input"
SELECT * FROM table WHERE column = :param;
EOF
```

NEVER use direct variable substitution or manual escaping.
```

#### 3.3 Create Linting Rule (Optional)

**File:** `.claude/skills/cfn-parameterized-queries/lint-sql-patterns.sh`

```bash
#!/bin/bash
# Lint SQL patterns for compliance with canonical pattern

set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
VIOLATIONS=0

echo "Checking for deprecated SQL patterns..."

# Check 1: Direct variable substitution
if grep -r "sqlite3.*INSERT.*\$\|sqlite3.*UPDATE.*\$\|sqlite3.*DELETE.*\$" \
   "$PROJECT_ROOT/.claude/skills" --include="*.sh" | grep -v "\.parameter"; then
    echo "❌ FAIL: Direct variable substitution found"
    ((VIOLATIONS++))
fi

# Check 2: Manual escaping
if grep -r "\${.*//\\\'/\\\\'\\\\'}" "$PROJECT_ROOT/.claude/skills" --include="*.sh"; then
    echo "❌ FAIL: Manual escaping found"
    ((VIOLATIONS++))
fi

# Check 3: stdin pattern
if grep -r "sqlite3.*<<< " "$PROJECT_ROOT/.claude/skills" --include="*.sh"; then
    echo "⚠️  WARNING: stdin pattern found (deprecated)"
    ((VIOLATIONS++))
fi

if [[ $VIOLATIONS -eq 0 ]]; then
    echo "✅ PASS: All SQL patterns compliant"
    exit 0
else
    echo "❌ FAIL: $VIOLATIONS violations found"
    echo "See: docs/SQLITE_PARAMETER_BINDING_QUICKSTART.md"
    exit 1
fi
```

**Integration:**
```bash
# Add to pre-commit hook
./.claude/skills/cfn-parameterized-queries/lint-sql-patterns.sh || exit 1
```

---

## Migration Checklist

### Documentation (30 minutes)

- [ ] Update `SQLITE_PARAMETER_BINDING_GUIDE.md`
  - [ ] Move stdin content to Appendix C
  - [ ] Promote `.parameter` to Section 3
  - [ ] Add production usage references
  - [ ] Update examples throughout
- [ ] Update `cfn-parameterized-queries/SKILL.md`
  - [ ] Remove stdin examples
  - [ ] Update title to emphasize canonical pattern
  - [ ] Add references to production code
- [x] Create `SQLITE_PARAMETER_BINDING_QUICKSTART.md` ✅
- [x] Create `SQL_PARAMETERIZATION_PATTERN_ANALYSIS.md` ✅
- [ ] Create this migration guide ✅ (in progress)

### Codebase Cleanup (15 minutes)

- [ ] Archive `bootstrap/sqlite-params.sh`
- [ ] Verify no consumers of helper library
- [ ] Run pattern compliance audit
- [ ] Document any violations found (expected: 0)

### Developer Communication (15 minutes)

- [ ] Update CLAUDE.md with SQL pattern guidance
- [ ] Add to agent prompt templates
- [ ] Create linting script (optional)
- [ ] Add to pre-commit hooks (optional)

### Testing (15 minutes)

- [ ] Verify production code still works
  - [ ] Test `execute-lifecycle-hook.sh spawn`
  - [ ] Test `execute-lifecycle-hook.sh complete`
  - [ ] Test `simple-audit.sh`
- [ ] Run security tests
  - [ ] `tests/test-sql-injection-prevention.sh`
  - [ ] Manual injection attempts
- [ ] Pattern compliance audit passes

### Final Validation (15 minutes)

- [ ] All documentation consistent
- [ ] No deprecated patterns in production
- [ ] Security tests passing
- [ ] Developer quick start available
- [ ] Migration guide complete

**Total Estimated Time:** 90 minutes

---

## Rollback Plan

**If Issues Found:**

1. **Preserve Original Documentation:**
   ```bash
   git checkout HEAD~1 docs/SQLITE_PARAMETER_BINDING_GUIDE.md
   git checkout HEAD~1 .claude/skills/cfn-parameterized-queries/SKILL.md
   ```

2. **Restore Helper Library:**
   ```bash
   git checkout HEAD~1 .claude/skills/bootstrap/sqlite-params.sh
   ```

3. **Document Issues:**
   - Create issue in `planning/issues/`
   - Document specific problems encountered
   - Propose alternative migration path

4. **Notify Team:**
   - Rollback complete
   - Migration postponed
   - Investigation required

**Rollback Risk:** LOW (documentation-only changes, production code unchanged)

---

## Success Criteria

**Definition of Done:**

1. ✅ Single canonical pattern documented (`.parameter`)
2. ⬜ Deprecated patterns clearly marked
3. ⬜ Quick start guide available
4. ⬜ Production code verified compliant
5. ⬜ Security tests passing
6. ⬜ No confusion about which pattern to use

**Quality Gates:**

- **Documentation Clarity:** Developer can implement pattern in <5 minutes
- **Pattern Compliance:** 100% of production SQL uses canonical pattern
- **Security Validation:** 0 SQL injection vulnerabilities
- **Developer Confusion:** Zero questions about "which pattern to use"

---

## Post-Migration

### Monitoring (First 2 Weeks)

- [ ] Watch for SQL-related questions in team communication
- [ ] Monitor git commits for deprecated patterns
- [ ] Track developer feedback on new documentation
- [ ] Run weekly pattern compliance audits

### Follow-Up Tasks

- [ ] Add SQL pattern to code review checklist
- [ ] Update onboarding documentation
- [ ] Create video walkthrough (optional)
- [ ] Add to security audit checklist

### Continuous Improvement

- [ ] Collect developer feedback
- [ ] Identify gaps in quick start guide
- [ ] Expand edge case examples
- [ ] Update based on real-world usage

---

## FAQ

### Q: Why not use stdin pattern? It's simpler.

**A:** Zero adoption by developers despite being documented. The `.parameter` pattern is preferred because:
- More explicit (named parameters)
- Better for multi-parameter queries
- Easier to debug
- Scales to complexity

### Q: Why deprecate the helper library?

**A:** Created but never used. Pattern B provides same security with:
- No extra dependency
- More transparent (SQL visible)
- Easier to understand
- Preferred by developers

### Q: Do I need to change production code?

**A:** No. Production code already uses canonical pattern. This migration is **documentation-only**.

### Q: What if I find deprecated patterns in production?

**A:** Document the finding and create migration task. Should be rare (audit expected to find 0 violations).

### Q: Can I still use the helper library?

**A:** Technically yes, but **not recommended**. Use canonical pattern for consistency. Helper library will be archived.

---

## Contact

**Questions:** Create issue in `planning/issues/`
**Blockers:** Tag as `sql-migration` for priority handling
**Feedback:** Document in migration retrospective

---

**Document Version:** 1.0
**Status:** READY FOR IMPLEMENTATION
**Estimated Effort:** 90 minutes total
**Risk Level:** LOW (documentation-only, production compliant)
