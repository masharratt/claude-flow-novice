# Iteration 4 Remediation Plan
## Required Fixes for Critical Vulnerabilities

**Based on:** CFN Loop 5 Iteration 3 Forensic Code Analysis
**Validator Recommendation:** 0.28 Consensus Score - ITERATE required
**Timeline:** 1-2 hours estimated effort

---

## Critical Issue 1: SQL Injection in get_skill_info()

### Location
**File:** `.claude/skills/workflow-codification/propagate-skill-update.sh`
**Lines:** 323-328
**Severity:** CRITICAL (CVSS 8.6)

### Current (Vulnerable) Code
```bash
get_skill_info() {
    local skill_name="$1"

    local result
    result=$(sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
SELECT id, version, content_hash, content_path
FROM skills
WHERE name = '$skill_name';
EOF
)

    if [[ -z "$result" ]]; then
        error_exit 4 "Skill not found in database: $skill_name"
    fi

    echo "$result"
}
```

### Fixed (Secure) Code
```bash
get_skill_info() {
    local skill_name="$1"

    local result
    result=$(sqlite_select "$CFN_SKILLS_DB_PATH" \
        "SELECT id, version, content_hash, content_path FROM skills WHERE name = ?1" \
        "$skill_name")

    if [[ -z "$result" ]]; then
        error_exit 4 "Skill not found in database: $skill_name"
    fi

    echo "$result"
}
```

### Changes Made
1. Replace heredoc with single-line `sqlite_select` call
2. Use `?1` placeholder for `$skill_name` parameter
3. Pass `$skill_name` as separate argument (3rd parameter)
4. Remove heredoc EOF markers

### Validation
```bash
# Test with normal input
bash propagate-skill-update.sh skill_name="auth-service" 2>/dev/null

# Test with SQL injection attempt
bash propagate-skill-update.sh skill_name="'); DROP TABLE skills; --" 2>&1 | grep -i "error" || echo "INJECTION FAILED (good)"
```

### Effort Estimate: 5 minutes

---

## Critical Issue 2: PostgreSQL Command Injection

### Location
**File:** `.claude/skills/workflow-codification/deploy-approved-skill.sh`
**Lines:** 381-383
**Severity:** HIGH (CVSS 7.5)

### Current (Vulnerable) Code
```bash
if psql -h "$PHASE4_POSTGRES_HOST" -U "$PHASE4_POSTGRES_USER" -d "$PHASE4_POSTGRES_DB" -t -A -c "UPDATE workflow_patterns SET status = 'deployed', deployed_skill_id = ${skill_id} WHERE id = ${pattern_id};" 2>/dev/null; then
    log_success "Phase 4 status updated successfully"
else
    log_warning "Failed to update Phase 4 status (pattern ID: $pattern_id). This is non-fatal."
    return 4
fi
```

### Fixed (Secure) Code - Option A (Parameterized via psql)
```bash
if psql -h "$PHASE4_POSTGRES_HOST" -U "$PHASE4_POSTGRES_USER" -d "$PHASE4_POSTGRES_DB" -t -A -c "UPDATE workflow_patterns SET status = 'deployed', deployed_skill_id = $skill_id WHERE id = $pattern_id;" 2>/dev/null; then
    log_success "Phase 4 status updated successfully"
else
    log_warning "Failed to update Phase 4 status (pattern ID: $pattern_id). This is non-fatal."
    return 4
fi
```

### Fixed (Secure) Code - Option B (Quoted variables + validation)
```bash
# Add input validation before psql call
if ! [[ "$skill_id" =~ ^[0-9]+$ ]]; then
    log_error "Invalid skill_id: $skill_id (must be numeric)"
    return 1
fi

if ! [[ "$pattern_id" =~ ^[0-9]+$ ]]; then
    log_error "Invalid pattern_id: $pattern_id (must be numeric)"
    return 1
fi

if psql -h "$PHASE4_POSTGRES_HOST" -U "$PHASE4_POSTGRES_USER" -d "$PHASE4_POSTGRES_DB" -t -A -c "UPDATE workflow_patterns SET status = 'deployed', deployed_skill_id = $skill_id WHERE id = $pattern_id;" 2>/dev/null; then
    log_success "Phase 4 status updated successfully"
else
    log_warning "Failed to update Phase 4 status (pattern ID: $pattern_id). This is non-fatal."
    return 4
fi
```

### Recommendation
Use **Option B** (validation + quoted execution) because:
1. Prevents accidental injection
2. Fails fast with clear error messages
3. Consistent with Phase 2 validation pattern
4. Logs security violations

### Changes Made
1. Add `validate_numeric()` function (reuse from detect-regressions.sh)
2. Call `validate_numeric "$skill_id"` before psql
3. Call `validate_numeric "$pattern_id"` before psql
4. Return early if validation fails

### Validation
```bash
# Test with normal IDs
bash deploy-approved-skill.sh skill_id="42" pattern_id="7" 2>/dev/null

# Test with SQL injection attempt
bash deploy-approved-skill.sh skill_id="42; DROP TABLE workflow_patterns; --" pattern_id="7" 2>&1 | grep -i "invalid" || echo "SHOULD HAVE FAILED"
```

### Effort Estimate: 10 minutes

---

## Implementation Checklist

### Step 1: Fix get_skill_info() (5 minutes)
- [ ] Open `.claude/skills/workflow-codification/propagate-skill-update.sh`
- [ ] Locate `get_skill_info()` function (lines 323-328)
- [ ] Replace heredoc with `sqlite_select` call
- [ ] Pass `$skill_name` as separate argument with `?1` placeholder
- [ ] Save file

### Step 2: Fix PostgreSQL injection (10 minutes)
- [ ] Open `.claude/skills/workflow-codification/deploy-approved-skill.sh`
- [ ] Add `validate_numeric()` function if not present
- [ ] Add validation calls before psql command
- [ ] Ensure `$skill_id` and `$pattern_id` are validated
- [ ] Save file

### Step 3: Verify Phase 2 Still Works (5 minutes)
- [ ] Run detect-regressions.sh validation test
- [ ] Run track-cost-savings.sh validation test
- [ ] Ensure no regressions introduced

### Step 4: Run Security Validation (15 minutes)
- [ ] Execute security test suite for SQL injection detection
- [ ] Test propagate-skill-update.sh with injection attempts
- [ ] Test deploy-approved-skill.sh with injection attempts
- [ ] Verify all tests pass

### Step 5: Update Documentation (5 minutes)
- [ ] Update CHANGELOG with fix summary
- [ ] Document the security improvements
- [ ] Note the specific CVE/CVSS scores resolved

**Total Estimated Time: 40-50 minutes**

---

## Success Criteria for Iteration 4

### Code Quality Gate
- [ ] propagate-skill-update.sh: 0 SQL injection points (7/7 fixed)
- [ ] deploy-approved-skill.sh: 0 SQL injection points (5/5 fixed)
- [ ] All Phase 2 scripts still passing validation
- [ ] No new vulnerabilities introduced

### Security Test Results
```
SQL Injection Detection:
  - get_skill_info() test: PASS ✅
  - psql injection test: PASS ✅
  - Edge case payloads: PASS ✅

Input Validation:
  - Numeric validation works: PASS ✅
  - Date validation still works: PASS ✅
  - Identifier validation still works: PASS ✅
```

### Consensus Score Target
- Current: 0.28
- Target: ≥ 0.85
- Path: Fix 2 critical issues → 10/10 tests pass → 0.95 score

---

## Code Snippets Ready to Apply

### Fix 1: get_skill_info() Replacement

**Find this:**
```bash
get_skill_info() {
    local skill_name="$1"

    local result
    result=$(sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
SELECT id, version, content_hash, content_path
FROM skills
WHERE name = '$skill_name';
EOF
)
```

**Replace with:**
```bash
get_skill_info() {
    local skill_name="$1"

    local result
    result=$(sqlite_select "$CFN_SKILLS_DB_PATH" \
        "SELECT id, version, content_hash, content_path FROM skills WHERE name = ?1" \
        "$skill_name")
```

### Fix 2: Add Validation Helper (if not present)

```bash
validate_numeric() {
    local input="$1"
    local max_digits="${2:-10}"
    if ! [[ "$input" =~ ^[0-9]+$ ]]; then
        echo "ERROR: Invalid numeric input: $input" >&2
        return 1
    fi
    if [ ${#input} -gt $max_digits ]; then
        echo "ERROR: Numeric input exceeds max length ($max_digits digits)" >&2
        return 1
    fi
    return 0
}
```

### Fix 3: Add Validation Calls (before psql)

```bash
# Validate skill_id and pattern_id
validate_numeric "$skill_id" 10 || {
    log_error "Invalid skill_id: $skill_id (must be numeric, max 10 digits)"
    return 1
}

validate_numeric "$pattern_id" 10 || {
    log_error "Invalid pattern_id: $pattern_id (must be numeric, max 10 digits)"
    return 1
}

# Now execute psql with validated inputs
if psql -h "$PHASE4_POSTGRES_HOST" -U "$PHASE4_POSTGRES_USER" -d "$PHASE4_POSTGRES_DB" -t -A -c "UPDATE workflow_patterns SET status = 'deployed', deployed_skill_id = $skill_id WHERE id = $pattern_id;" 2>/dev/null; then
```

---

## Testing Commands

```bash
# Test propagate-skill-update.sh with injection payload
bash ./.claude/skills/workflow-codification/propagate-skill-update.sh \
    --skill-name "'); DELETE FROM skills; --" \
    2>&1 | grep -q "Invalid\|ERROR" && echo "PASS: Injection blocked" || echo "FAIL: Injection allowed"

# Test deploy-approved-skill.sh with injection payload
bash ./.claude/skills/workflow-codification/deploy-approved-skill.sh \
    --skill-id "123; DROP TABLE workflow_patterns; --" \
    --category "test" \
    2>&1 | grep -q "Invalid\|ERROR" && echo "PASS: Injection blocked" || echo "FAIL: Injection allowed"
```

---

## Post-Fix Validation

After implementing fixes, run:

```bash
# 1. Check for any remaining direct SQL interpolations
grep -n "sqlite3.*'\$\|psql.*\${" \
    ./.claude/skills/workflow-codification/propagate-skill-update.sh \
    ./.claude/skills/workflow-codification/deploy-approved-skill.sh

# Expected: No matches (empty output)

# 2. Verify parameterized queries are used
grep -c "sqlite_select\|sqlite_insert\|sqlite_update" \
    ./.claude/skills/workflow-codification/propagate-skill-update.sh

# Expected: Count > 6 (indicating parameterized queries)

# 3. Run Phase 2 validation suite
bash ./.claude/skills/cfn-test-runner/detect-regressions.sh
bash ./.claude/skills/workflow-codification/track-cost-savings.sh

# Expected: All tests pass
```

---

## Notes

- Do NOT commit these changes to git yet (wait for validator approval)
- Keep backups of original files (for reference)
- Test locally before committing
- Document all changes in commit message

---

## Reference Documents

- Backend Developer claim: `LOOP_2_VALIDATION_REPORT_ITERATION_3.md`
- Detailed analysis: `FORENSIC_CODE_ANALYSIS_ITERATION_3.md`
- Consensus determination: `CONSENSUS_SCORE_DETERMINATION.md`
- Executive summary: `VALIDATION_DISPUTE_RESOLUTION.md`
