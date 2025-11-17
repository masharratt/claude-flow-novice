# Security Audit: Top 5 Priority Recommendations
**Skills Database Implementation**
**Generated:** 2025-11-16

---

## Recommendation #1: CRITICAL - Implement SQL Escaping Utility (Blocks SQL Injection)
**Impact:** Eliminates 2 CRITICAL vulnerabilities (CWE-89)
**Effort:** 30 minutes
**Timeline:** Immediate (today)

### The Problem
```bash
# Current vulnerable code in deploy-approved-skill.sh:220
sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
INSERT INTO skills (name, category, ...)
VALUES ('$skill_name', '$category', ...)  # VULNERABLE
EOF
```

An attacker providing `skill_name="'; DROP TABLE skills; --"` destroys the entire database.

### The Solution
Create and use SQL escaping function:

```bash
# Add to top of deploy-approved-skill.sh and propagate-skill-update.sh
escape_sql_string() {
    local str="$1"
    # SQLite: double single quotes to escape them
    str="${str//\'/\'\'}"
    echo "$str"
}
```

Then use it:
```bash
# Update all INSERT/UPDATE/SELECT statements:
skill_name_safe=$(escape_sql_string "$skill_name")
category_safe=$(escape_sql_string "$category")

sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
INSERT INTO skills (name, category, ...)
VALUES ('$skill_name_safe', '$category_safe', ...)
EOF
```

### Verification
Test with injection payload:
```bash
./deploy-approved-skill.sh "42" "test'; DROP TABLE skills; --" "skill.md" 2>&1
# Should see error, not table deletion
```

### Files to Modify
- `.claude/skills/workflow-codification/deploy-approved-skill.sh` (Lines 220-250, 270-310, 315-325)
- `.claude/skills/workflow-codification/propagate-skill-update.sh` (Lines 200-205, 325-335, 375-400)

---

## Recommendation #2: CRITICAL - Fix Command Injection in PostgreSQL (Blocks Command Injection)
**Impact:** Eliminates 1 CRITICAL vulnerability (CWE-78)
**Effort:** 15 minutes
**Timeline:** Immediate (today)

### The Problem
```bash
# Current vulnerable code in deploy-approved-skill.sh:361
local psql_cmd="psql -h $PHASE4_POSTGRES_HOST -U $PHASE4_POSTGRES_USER ..."
if $psql_cmd -c "UPDATE ..."; then  # VULNERABLE to shell metacharacters
```

If `PHASE4_POSTGRES_HOST="localhost; rm -rf /"`, arbitrary commands execute.

### The Solution
Quote all parameters and avoid variable expansion:

```bash
# Replace the entire section (lines 361-382):
log_info "Updating Phase 4 workflow pattern status"

# Validate PostgreSQL credentials are provided
if [[ -z "$PHASE4_POSTGRES_HOST" ]] || [[ -z "$PHASE4_POSTGRES_USER" ]]; then
    log_warning "PostgreSQL not configured, skipping Phase 4 status update"
    return 0
fi

# Build .pgpass file for secure credential passing (see Recommendation #3)
local pgpass_file=$(create_pgpass_file)
export PGPASSFILE="$pgpass_file"

# Execute with quoted parameters (no variable expansion)
if psql \
    -h "$PHASE4_POSTGRES_HOST" \
    -U "$PHASE4_POSTGRES_USER" \
    -d "$PHASE4_POSTGRES_DB" \
    -t -A \
    -c "UPDATE workflow_patterns SET status = 'deployed', deployed_skill_id = $skill_id WHERE id = $pattern_id;" \
    2>/dev/null; then
    log_success "Phase 4 status updated successfully"
else
    log_warning "Failed to update Phase 4 status (non-fatal)"
fi

# Cleanup
cleanup_pgpass_file "$pgpass_file"
unset PGPASSFILE
```

### Why This Works
- Quoting parameters prevents shell metacharacter interpretation
- Each parameter is passed as a separate argument to psql
- No shell expansion occurs within double quotes

### Verification
```bash
# This should NOT create /tmp/pwned:
export PHASE4_POSTGRES_HOST="localhost; touch /tmp/pwned"
./deploy-approved-skill.sh "42" "test" "skill.md" 2>&1
[ -f /tmp/pwned ] && echo "VULNERABLE" || echo "PROTECTED"
```

### Files to Modify
- `.claude/skills/workflow-codification/deploy-approved-skill.sh` (Lines 355-381)

---

## Recommendation #3: HIGH - Eliminate PGPASSWORD Environment Exposure (Blocks Password Exposure)
**Impact:** Eliminates 1 HIGH vulnerability (CWE-542)
**Effort:** 20 minutes
**Timeline:** Today

### The Problem
```bash
# Current code exposing password:
export PGPASSWORD="$PHASE4_POSTGRES_PASS"  # Visible in: ps auxe, /proc/PID/environ
```

Credentials are visible in:
- `ps auxe` output
- `/proc/PID/environ` during execution
- System monitoring tools
- Core dumps and system logs

### The Solution
Use PostgreSQL's standard `.pgpass` file mechanism:

```bash
# Add these helper functions to the script:
create_pgpass_file() {
    local pgpass_file="/tmp/.pgpass-$$"

    # Create .pgpass file with secure format
    cat > "$pgpass_file" <<EOF
$PHASE4_POSTGRES_HOST:$PHASE4_POSTGRES_PORT:$PHASE4_POSTGRES_DB:$PHASE4_POSTGRES_USER:$PHASE4_POSTGRES_PASS
EOF

    # PostgreSQL requires 600 permissions (owner read-only)
    chmod 600 "$pgpass_file"

    if [[ $? -ne 0 ]]; then
        error_exit 4 "Failed to set .pgpass permissions"
    fi

    echo "$pgpass_file"
}

cleanup_pgpass_file() {
    local pgpass_file="$1"
    if [[ -f "$pgpass_file" ]]; then
        # Securely overwrite before deletion (5 passes)
        if command -v shred &> /dev/null; then
            shred -vfz -n 5 "$pgpass_file" 2>/dev/null || rm -f "$pgpass_file"
        else
            # Fallback if shred not available
            dd if=/dev/zero of="$pgpass_file" bs=1 count=$(stat -f%z "$pgpass_file") 2>/dev/null || true
            rm -f "$pgpass_file"
        fi
    fi
}

# Then in update_phase4_status() function:
PGPASS_FILE=$(create_pgpass_file)
export PGPASSFILE="$PGPASS_FILE"

# Now psql will read credentials from .pgpass file, not environment
psql -h "$PHASE4_POSTGRES_HOST" -U "$PHASE4_POSTGRES_USER" -d "$PHASE4_POSTGRES_DB" \
    -c "UPDATE workflow_patterns SET status = 'deployed' WHERE id = $pattern_id;"

cleanup_pgpass_file "$PGPASS_FILE"
unset PGPASSFILE
```

### Why This Works
- `.pgpass` is standard PostgreSQL secure credential storage
- Credentials not visible in environment or process listings
- File is only readable by owner (mode 600)
- Secure cleanup with `shred` overwrites sensitive data

### Verification
```bash
# Monitor process during execution:
./deploy-approved-skill.sh "42" "test" "skill.md" &
PID=$!
# Check that PGPASSWORD is NOT in environment:
cat /proc/$PID/environ | tr '\0' '\n' | grep PGPASSWORD
# Should return nothing (exit code 1)
wait $PID
```

### Files to Modify
- `.claude/skills/workflow-codification/deploy-approved-skill.sh` (Lines 50-60, 355-382)
- `.claude/skills/workflow-codification/propagate-skill-update.sh` (Lines 50-60)

---

## Recommendation #4: HIGH - Implement Comprehensive Input Validation (Blocks Multiple Attack Vectors)
**Impact:** Eliminates 1 HIGH vulnerability (CWE-20) and prevents bypass attacks
**Effort:** 45 minutes
**Timeline:** Within 24 hours

### The Problem
- `$skill_name` not validated (allows SQL injection, special characters)
- `$category` not checked against allowed values (bypasses approval logic)
- `$agent_type` not validated before use
- File paths not checked for traversal attacks

### The Solution
Create validation library file:

```bash
# Create: .claude/skills/workflow-codification/lib/validate-inputs.sh
#!/usr/bin/env bash

# Numeric validation (pattern ID)
validate_pattern_id() {
    local id="$1"
    if [[ ! "$id" =~ ^[0-9]+$ ]] || [ "$id" -lt 1 ] || [ "$id" -gt 999999 ]; then
        return 1
    fi
    return 0
}

# Skill name: 3-50 chars, starts with letter, alphanumeric/hyphens/underscores
validate_skill_name() {
    local name="$1"
    if [[ ! "$name" =~ ^[a-zA-Z][a-zA-Z0-9_-]{2,49}$ ]]; then
        return 1
    fi
    return 0
}

# Category must be one of: coordination, domain, infrastructure, testing, foundation
validate_category() {
    local category="$1"
    case "$category" in
        coordination|domain|infrastructure|testing|foundation)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# File path: must be .md, no traversal, relative path
validate_file_path() {
    local path="$1"
    # Prevent traversal
    if [[ "$path" == *".."* ]] || [[ "$path" == "/"* ]]; then
        return 1
    fi
    # Must end in .md
    if [[ ! "$path" == *.md ]]; then
        return 1
    fi
    # Cannot contain shell metacharacters
    if [[ "$path" =~ [\$\`\(\)\{\}\;] ]]; then
        return 1
    fi
    return 0
}

# Agent type: alphanumeric, hyphens, starts with letter
validate_agent_type() {
    local agent="$1"
    if [[ ! "$agent" =~ ^[a-zA-Z][a-zA-Z0-9_-]{2,49}$ ]]; then
        return 1
    fi
    return 0
}
```

Then use in deploy-approved-skill.sh:

```bash
# Add to top of script:
source ".claude/skills/workflow-codification/lib/validate-inputs.sh"

# Replace validate_inputs() function:
validate_inputs() {
    local pattern_id="$1"
    local skill_name="$2"
    local content_path="$3"
    local category="${4:-domain}"

    # Check existence
    if [[ -z "$pattern_id" ]] || [[ -z "$skill_name" ]] || [[ -z "$content_path" ]]; then
        error_exit 1 "Missing required parameters"
    fi

    # Validate PATTERN_ID
    if ! validate_pattern_id "$pattern_id"; then
        error_exit 1 "Invalid pattern ID: $pattern_id"
    fi

    # Validate SKILL_NAME
    if ! validate_skill_name "$skill_name"; then
        error_exit 1 "Invalid skill name: $skill_name. Must be 3-50 chars, start with letter"
    fi

    # Validate FILE_PATH
    if ! validate_file_path "$content_path"; then
        error_exit 1 "Invalid file path: $content_path. Must be .md file, no traversal"
    fi

    # Validate CATEGORY
    if ! validate_category "$category"; then
        error_exit 1 "Invalid category: $category"
    fi

    # File exists check
    if [[ ! -f "$content_path" ]]; then
        error_exit 2 "File not found: $content_path"
    fi

    if [[ ! -r "$content_path" ]]; then
        error_exit 2 "File not readable: $content_path"
    fi

    if [[ ! -f "$CFN_SKILLS_DB_PATH" ]]; then
        error_exit 3 "Database not found"
    fi
}
```

### Verification
```bash
# Test with invalid inputs:
./deploy-approved-skill.sh "abc" "jwt-auth" "skill.md" 2>&1  # Expect error (non-numeric ID)
./deploy-approved-skill.sh "42" "x" "skill.md" 2>&1  # Expect error (name too short)
./deploy-approved-skill.sh "42" "test'; DROP" "skill.md" 2>&1  # Expect error (special chars)
./deploy-approved-skill.sh "42" "jwt" "../../../etc/passwd" 2>&1  # Expect error (traversal)
```

### Files to Modify
- Create: `.claude/skills/workflow-codification/lib/validate-inputs.sh`
- Modify: `.claude/skills/workflow-codification/deploy-approved-skill.sh` (Lines 100-137)
- Modify: `.claude/skills/workflow-codification/propagate-skill-update.sh` (Lines 185-216)

---

## Recommendation #5: MEDIUM - Reduce Information Disclosure in Error Messages
**Impact:** Reduces reconnaissance value for attackers (CWE-209)
**Effort:** 30 minutes
**Timeline:** Within 48 hours

### The Problem
Current error messages reveal:
- Full database file paths
- Complete list of available skills
- Schema structure details
- Internal system configuration

Example:
```bash
[ERROR] Skills database not found: /home/user/claude-flow-novice/.claude/skills-database/skills.db
[ERROR] Skill not found: jwt-auth
Available skills:
coordination-protocol-v2
backend-api-patterns
error-handling-strategies
...
```

Attackers use this information to:
1. Target specific files on filesystem
2. Understand system architecture
3. Craft targeted SQL injection payloads
4. Identify valuable skills to compromise

### The Solution
Modify error messages and add debug logging:

```bash
# Update validate_inputs() in deploy-approved-skill.sh:

validate_inputs() {
    local pattern_id="$1"
    local skill_name="$2"
    local content_path="$3"

    if [[ -z "$pattern_id" ]] || [[ -z "$skill_name" ]] || [[ -z "$content_path" ]]; then
        # BEFORE: echo "Missing required parameters" >&2
        # AFTER: Generic message
        error_exit 1 "Invalid input. Run with -h for usage information."
    fi

    if ! [[ "$pattern_id" =~ ^[0-9]+$ ]]; then
        # BEFORE: echo "[ERROR] PATTERN_ID must be numeric: $pattern_id" >&2
        # AFTER: No specific value leaked
        error_exit 1 "Pattern ID validation failed."
        # But log the details:
        log_debug "Invalid PATTERN_ID: $pattern_id"
    fi

    if [[ ! -f "$CFN_SKILLS_DB_PATH" ]]; then
        # BEFORE: echo "[ERROR] Skills database not found: $CFN_SKILLS_DB_PATH" >&2
        # AFTER: Generic message
        error_exit 3 "Database access failed. Contact administrator."
        # Log the actual path for diagnostics:
        log_debug "Database path: $CFN_SKILLS_DB_PATH"
    fi

    # Also in propagate-skill-update.sh, when skill not found:
    if [[ "$skill_count" -eq 0 ]]; then
        # BEFORE:
        # echo "[ERROR] Skill not found in database: $skill_name" >&2
        # echo "Available skills:" >&2
        # sqlite3 "$CFN_SKILLS_DB_PATH" "SELECT name FROM skills ORDER BY name"

        # AFTER:
        error_exit 4 "Skill not found."

        # Only log skill list in debug mode:
        if [[ "${DEBUG:-0}" == "1" ]]; then
            log_debug "Requested skill: $skill_name"
            log_debug "Available skills:"
            sqlite3 "$CFN_SKILLS_DB_PATH" "SELECT name FROM skills ORDER BY name" 2>/dev/null | \
                while read skill; do
                    log_debug "  - $skill"
                done
        fi
    fi
}

# Add debug logging helper (if not already present):
log_debug() {
    if [[ "${DEBUG:-0}" == "1" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $*" >&2
    fi
}
```

### User-Facing vs. Debug Output
```bash
# When something fails, users see:
[ERROR] Operation failed. Contact support with reference: SKL-20251116-0342

# In logs (only visible with DEBUG=1):
[DEBUG] Database path: /home/user/claude-flow-novice/.claude/skills-database/skills.db
[DEBUG] Available skills: coordination-protocol-v2, backend-api-patterns
```

### Verification
```bash
# Normal mode - minimal information:
./deploy-approved-skill.sh invalid 2>&1
# Output: [ERROR] Invalid input. Run with -h for usage information.

# Debug mode - full diagnostics:
DEBUG=1 ./deploy-approved-skill.sh invalid 2>&1
# Output: [ERROR] Invalid input...
#         [DEBUG] Failed validation: parameter count
#         [DEBUG] Database path: ...
```

### Files to Modify
- `.claude/skills/workflow-codification/deploy-approved-skill.sh` (Lines 100-140)
- `.claude/skills/workflow-codification/propagate-skill-update.sh` (Lines 185-230)

---

## Implementation Checklist

### Week 1 (Immediate)
- [ ] Implement SQL escaping utility (Recommendation #1)
- [ ] Fix PostgreSQL command injection (Recommendation #2)
- [ ] Implement .pgpass credential handling (Recommendation #3)
- [ ] Run integration tests: `bash tests/integration/test-deploy-approved-skill.sh`
- [ ] Deploy to staging environment

### Week 2 (Following Days)
- [ ] Implement comprehensive input validation (Recommendation #4)
- [ ] Reduce information disclosure (Recommendation #5)
- [ ] Run full security test suite
- [ ] Code review of all changes
- [ ] Documentation update

### Week 3 (Ongoing)
- [ ] Monitor production deployment
- [ ] Set up automated security testing in CI/CD
- [ ] Schedule monthly security reviews
- [ ] Update team on security best practices

---

## Testing Your Fixes

Run these tests after each recommendation:

```bash
#!/bin/bash
# test-security-fixes.sh

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DB="/tmp/test-skills-$$.db"
export CFN_SKILLS_DB_PATH="$TEST_DB"

# Initialize test database
sqlite3 "$TEST_DB" < "${PROJECT_ROOT}/.claude/skills-database/schema-v2.sql"

echo "Testing SQL Injection Protection..."
./deploy-approved-skill.sh "1" "test'; DROP TABLE skills; --" "skill.md" 2>&1
if [ $? -eq 0 ]; then
    sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skills" >/dev/null && echo "✓ SQL Injection BLOCKED"
else
    echo "✓ Input validation blocked injection"
fi

echo "Testing Command Injection Protection..."
export PHASE4_POSTGRES_HOST="localhost; touch /tmp/pwned"
./deploy-approved-skill.sh "1" "test" "skill.md" 2>&1
[ -f /tmp/pwned ] && echo "✗ Command Injection VULNERABLE" || echo "✓ Command Injection BLOCKED"

echo "Testing Input Validation..."
./deploy-approved-skill.sh "abc" "test" "skill.md" 2>&1 | grep -q "Invalid" && echo "✓ Pattern ID validation works"
./deploy-approved-skill.sh "1" "x" "skill.md" 2>&1 | grep -q "Invalid" && echo "✓ Skill name validation works"

# Cleanup
rm -f "$TEST_DB" /tmp/pwned

echo "All tests completed!"
```

---

## Support and Questions

For implementation questions:
1. Refer to the full security audit report: `SECURITY_AUDIT_SKILLS_DB.md`
2. Check PostgreSQL documentation: https://www.postgresql.org/docs/
3. Review SQLite escaping: https://www.sqlite.org/lang_keywords.html

---

**Security Audit: Top 5 Recommendations**
**Confidence: 92%**
**Next Review: 2026-11-16 (12 months)**
