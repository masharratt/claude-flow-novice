# CFN Loop Shell Security Integration Guide

**Integration of shell security best practices with CFN Loop infrastructure**

**Date:** November 17, 2025
**Scope:** Hook scripts, coordination scripts, agent execution contexts
**Status:** Research and Integration Planning

---

## Overview

The CFN Loop execution model relies heavily on shell scripts for:
- **Pre-edit backups** (cfn-invoke-pre-edit.sh)
- **Post-edit validation** (cfn-invoke-post-edit.sh)
- **Security validation** (cfn-invoke-security-validation.sh)
- **Temporary file management** (backup creation/cleanup)
- **Agent spawning** (orchestration scripts)

This document maps shell security best practices to CFN Loop components and identifies integration points.

---

## Current CFN Loop Shell Usage

### Critical Paths

#### 1. File Edit Workflow

```
Agent → Pre-Edit Backup → File Edit → Post-Edit Validation → Completion
         └─ Hook Script ─┘              └─ Hook Script ───┘
```

**Scripts Involved:**
- `cfn-invoke-pre-edit.sh` - Creates backup before edit
- `cfn-invoke-post-edit.sh` - Validates after edit
- Backup/restore scripts

**Security Requirements:**
- Backup directory must be private (mode 700)
- Filenames must not be predictable
- Cleanup must be guaranteed
- File paths must be properly quoted

#### 2. Agent Spawning Workflow

```
Coordinator → Spawn CLI Worker → Execute Agent Script → Report Results
```

**Scripts Involved:**
- Orchestration scripts
- Agent startup scripts
- Completion reporting scripts

**Security Requirements:**
- Agent context variables must be quoted
- Temporary working directories must be secure
- Error handling must not mask failures

#### 3. Validation Workflow

```
Agent Completes → Security Check → File Validation → Coordination Update
                   └─ Hook Script ─┘
```

**Scripts Involved:**
- cfn-invoke-security-validation.sh
- Custom validators
- Integration hooks

**Security Requirements:**
- Regex patterns must be safely escaped
- File paths must be quoted
- Error codes must propagate correctly

---

## Security Best Practices Implementation

### Area 1: Variable Quoting (SC2086, SC2048)

#### Current State Analysis

**File:** `.claude/hooks/cfn-invoke-pre-edit.sh`

```bash
# GOOD - File path quoted
if ! BACKUP_DIR=$("$BACKUP_SCRIPT" "$FILE_PATH" "$AGENT_ID" 2>&1); then
    echo "Error: Backup failed: $BACKUP_DIR" >&2  # GOOD - quoted
    exit 1
fi

echo "$BACKUP_DIR"  # GOOD - quoted
```

**Assessment:** Quoting is implemented correctly

**File:** `.claude/hooks/cfn-invoke-post-edit.sh`

```bash
# Argument parsing - looks good
FILE_PATH=""
AGENT_ID="${AGENT_ID:-unknown}"  # GOOD - quoted with default

# Variable usage
if [ -z "$FILE_PATH" ]; then     # GOOD - quoted
    echo "Error: File path required"
    exit 1
fi

node "$PIPELINE" "$FILE_PATH" --memory-key "$MEMORY_KEY" || EXIT_CODE=$?  # GOOD
```

**Assessment:** Quoting is consistent and correct

**File:** `.claude/hooks/cfn-invoke-security-validation.sh`

```bash
# ISSUE - Grep pattern not quoted
if grep -qE '(sk-ant-|token-|api_key=)' "$file_path"; then  # Pattern OK, path quoted
    echo "❌ SECURITY RISK: Potential secret exposure in $file_path"
    return 1
fi

# ISSUE - File path in condition quoted correctly
if ! grep -qE 'driver:\s*overlay' "$compose_file"; then
    echo "⚠️ NETWORK CONFIG: Recommended to use overlay network"
    return 2
fi
```

**Assessment:** File paths quoted correctly; patterns safe

#### Recommendations

1. **Audit** - Run comprehensive check of all hooks:
```bash
find .claude/hooks -name "*.sh" -exec grep -l '\$[A-Z_]' {} \; | \
  while read f; do
    echo "=== $f ==="
    grep -n '\$[A-Z_]' "$f" | grep -v '"\$'
  done
```

2. **Document** - Create SC2086 compliance matrix showing:
   - File path variables: Always quoted
   - Arrays: Use proper syntax
   - Arithmetic: OK unquoted in $(( ))

3. **Testing** - Add test for variable quoting:
```bash
test_path_with_spaces() {
    local TEST_FILE=$(mktemp -d)/test\ file.txt
    touch "$TEST_FILE"

    # Hook should handle spaces
    ./.claude/hooks/cfn-invoke-pre-edit.sh "$TEST_FILE" --agent-id "test"

    rm -rf "$(dirname "$TEST_FILE")"
}
```

---

### Area 2: Strict Mode (set -euo pipefail)

#### Current State Analysis

**File:** `.claude/hooks/cfn-invoke-pre-edit.sh`
```bash
set -euo pipefail  # ✅ IMPLEMENTED
```

**File:** `.claude/hooks/cfn-invoke-post-edit.sh`
```bash
set -euo pipefail  # ✅ IMPLEMENTED
```

**File:** `.claude/hooks/cfn-invoke-security-validation.sh`
```bash
set -euo pipefail  # ✅ IMPLEMENTED
```

**Assessment:** Strict mode is consistently implemented

#### Error Handling Analysis

**Issue 1:** Intentional Failures Not Handled

```bash
# In cfn-invoke-post-edit.sh
node "$PIPELINE" "$FILE_PATH" --memory-key "$MEMORY_KEY" || EXIT_CODE=$?

# With set -e, this is fine because:
# - Command runs
# - If it fails, the || catches it
# - EXIT_CODE is set to non-zero
```

**Assessment:** Error handling is correct

**Issue 2:** Pipeline Failures

```bash
# Potential issue - grep on unvalidated input
if grep -qE 'pattern' "$file_path" 2>/dev/null; then
    # This is safe even without pipefail because grep is the only command
fi

# Potential issue - multiple commands in sequence
command1 | command2 | command3
# With pipefail: If any fails, whole pipeline fails (GOOD)
# Without pipefail: Only command3's exit code matters (BAD)
```

**Assessment:** Most uses are safe; consider explicit pipefail testing

#### Recommendations

1. **Document** - Each hook should document why it uses strict mode:
```bash
#!/bin/bash
# Pre-Edit Backup Hook
#
# Strict mode requirements:
# - File creation errors must exit (prevents silent failures)
# - Undefined AGENT_ID must error (prevents invalid backups)
# - Backup command failures must propagate (ensures backup success)
#
set -euo pipefail
```

2. **Test** - Add strict mode validation tests:
```bash
test_strict_mode_enforcement() {
    # Should exit if file path undefined
    bash -c 'set -u; . cfn-invoke-pre-edit.sh "" --agent-id "test"' 2>&1 | \
        grep -q "unbound variable" && echo "PASS: -u works"
}
```

3. **Audit** - Check for edge cases with set -e:
```bash
# Dangerous pattern with set -e
set -e
result=$(optional_command)  # If fails, script exits
echo "$result"  # Never reached

# Safe pattern
result=$(optional_command || echo "default")
echo "${result}"
```

---

### Area 3: mktemp Security

#### Current State Analysis

**File:** `.claude/hooks/cfn-invoke-pre-edit.sh`

```bash
# Uses external backup script - doesn't directly create temp files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/../skills/pre-edit-backup/backup.sh"

if ! BACKUP_DIR=$("$BACKUP_SCRIPT" "$FILE_PATH" "$AGENT_ID" 2>&1); then
```

**Assessment:** Delegates to backup script (needs audit)

**File:** Referenced backup script location
`.claude/skills/pre-edit-backup/backup.sh` - Need to examine

**Issue:** The pre-edit backup skill script needs audit for mktemp usage

#### Checking Backup Script Pattern

Expected implementation pattern:
```bash
#!/bin/bash
set -euo pipefail

FILE_PATH="$1"
AGENT_ID="$2"

# Should use mktemp for secure directory
BACKUP_DIR=$(mktemp -d)
trap "rm -rf '$BACKUP_DIR'" EXIT  # Cleanup on exit

# Create backup
cp -p "$FILE_PATH" "$BACKUP_DIR/original"

# Return path
echo "$BACKUP_DIR"
```

**Current Usage in Hooks:** Good - delegates to skill script

#### Recommendations

1. **Verify** - Check backup.sh implementation:
```bash
grep "mktemp" .claude/skills/pre-edit-backup/backup.sh
grep "trap.*EXIT" .claude/skills/pre-edit-backup/backup.sh
```

2. **Audit** - Test mktemp security:
```bash
test_backup_permissions() {
    # Create backup
    BACKUP=$(./.claude/skills/pre-edit-backup/backup.sh "/tmp/test" "agent-1")

    # Verify permissions (should be 700)
    PERMS=$(stat -c %a "$BACKUP" 2>/dev/null || stat -f %A "$BACKUP")
    [[ "$PERMS" == "700" ]] && echo "PASS: Backup has secure permissions"

    # Cleanup
    rm -rf "$BACKUP"
}
```

3. **Document** - Create mktemp usage map:
```
Script                          | Temp Type | Current | Needed
================================|===========|=========|========
cfn-invoke-pre-edit.sh         | Backup    | Script  | mktemp
cfn-invoke-post-edit.sh        | Temp      | Node.js | Check
cfn-invoke-security-validation | Temp      | None    | N/A
```

---

## Hook-by-Hook Integration

### Hook 1: cfn-invoke-pre-edit.sh

**Purpose:** Create backup before agent edits file

**Current Security Status:**
```
✅ Strict mode: set -euo pipefail
✅ Variable quoting: All paths quoted
⚠️  mktemp: Delegated to backup.sh (needs verification)
```

**Recommended Changes:**
```bash
#!/bin/bash
# Pre-Edit Backup Hook Wrapper
# Security: Implements SC2086 quoting, SC2048 arg handling, mktemp via backup.sh
# Threat Model: Prevents file corruption via safe backup before edit

set -euo pipefail

# Argument parsing with strict validation
FILE_PATH=""
AGENT_ID=""

if [[ -n "${1:-}" ]] && [[ "$1" != --* ]]; then
    FILE_PATH="$1"
    shift
fi

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --agent-id)
            if [[ -z "${2:-}" ]]; then
                echo "Error: --agent-id requires a value" >&2
                exit 1
            fi
            AGENT_ID="$2"
            shift 2
            ;;
        *)
            echo "Error: Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

# Validation - strict
if [[ -z "$FILE_PATH" ]]; then
    echo "Error: No file path provided" >&2
    exit 1
fi

if [[ -z "$AGENT_ID" ]]; then
    echo "Error: No agent ID provided" >&2
    exit 1
fi

if [[ ! -f "$FILE_PATH" ]]; then
    echo "Error: File does not exist: $FILE_PATH" >&2
    exit 1
fi

# Execute backup script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/../skills/pre-edit-backup/backup.sh"

if [[ ! -f "$BACKUP_SCRIPT" ]]; then
    echo "Error: Backup script not found: $BACKUP_SCRIPT" >&2
    exit 1
fi

# Call backup script with proper quoting
if ! BACKUP_DIR=$("$BACKUP_SCRIPT" "$FILE_PATH" "$AGENT_ID" 2>&1); then
    echo "Error: Backup failed: $BACKUP_DIR" >&2
    exit 1
fi

# Return backup directory
echo "$BACKUP_DIR"
```

**Testing Requirements:**
```bash
# Test 1: Filenames with spaces
test_pre_edit_spaces()
test_pre_edit_special_chars()

# Test 2: Error conditions
test_pre_edit_missing_file()
test_pre_edit_invalid_args()

# Test 3: Backup security
test_pre_edit_backup_perms()
test_pre_edit_backup_uniqueness()
```

---

### Hook 2: cfn-invoke-post-edit.sh

**Purpose:** Validate file after agent edit

**Current Security Status:**
```
✅ Strict mode: set -euo pipefail
✅ Variable quoting: Consistent
✅ Error handling: Proper || suppression
⚠️  mktemp: Node.js script creates temps (needs audit)
```

**Recommended Improvements:**

The hook should document its security model:

```bash
#!/bin/bash
#
# Post-Edit Hook Invocation Script
#
# Security Implementation:
# - SC2086: All variables quoted to prevent word splitting
# - SC2048: Uses "$@" for argument passing (would apply if forking)
# - Strict mode: set -euo pipefail ensures errors propagate
# - mktemp: Delegates to Node.js script (see node validation)
#
# Threat Model: Prevents invalid edits from being committed
# Validates: File structure, content integrity, security compliance
#
set -euo pipefail

# ... rest of script ...
```

**Verify Node.js Temp Files:**
```bash
# Check what Node.js script uses for temp files
grep -n "mktemp\|/tmp/\|temp" "dist/hooks/post-edit-pipeline.js"

# If creating temp files:
# - Must use Node.js equivalent: os.tmpdir(), tmp module
# - Must have cleanup handlers
```

---

### Hook 3: cfn-invoke-security-validation.sh

**Purpose:** Validate security properties of edited files

**Current Security Status:**
```
✅ Strict mode: set -euo pipefail
✅ Variable quoting: File paths quoted correctly
✅ Grep patterns: Safe special characters
⚠️  Error handling: grep exit codes might mask issues
```

**Current Implementation Review:**

```bash
#!/bin/bash
set -euo pipefail

validate_secret_management() {
    local file_path="$1"

    # SC2086: file_path is properly quoted
    if grep -qE '(sk-ant-|token-|api_key=)' "$file_path"; then
        echo "❌ SECURITY RISK: Potential secret exposure in $file_path"
        return 1
    fi

    # Error handling: grep -q suppresses output, function returns exit code
    if grep -qE 'API_KEY=|SECRET=|TOKEN=' "$file_path"; then
        echo "⚠️ NAMING RISK: Inconsistent secret variable names in $file_path"
        return 2
    fi

    return 0
}
```

**Assessment:**
- Quoting correct
- Error codes propagate
- Patterns are safe
- Could improve error messages

**Recommended Enhancement:**

```bash
#!/bin/bash
set -euo pipefail

# Enhanced validation with better error messages
validate_secret_management() {
    local file_path="$1"
    local exit_code=0

    # Check for hardcoded secrets
    if grep -qE '(sk-ant-|token-|api_key=)' "$file_path" 2>/dev/null || [[ $? -ne 1 ]]; then
        echo "ERROR: Hardcoded secret found in $file_path" >&2
        exit_code=1
    fi

    # Check for inconsistent naming
    if grep -qE 'API_KEY=|SECRET=|TOKEN=' "$file_path" 2>/dev/null || [[ $? -ne 1 ]]; then
        echo "WARNING: Inconsistent secret naming in $file_path" >&2
        # Don't exit - just warn
    fi

    return "$exit_code"
}
```

---

## Testing Framework for Integrated Security

### Test Suite 1: Variable Quoting Compliance

```bash
#!/bin/bash
# Test Suite: Variable Quoting (SC2086, SC2048)

test_quoting() {
    local hook="$1"
    local test_dir=$(mktemp -d)
    trap "rm -rf '$test_dir'" EXIT

    # Create test files
    touch "$test_dir/normal_file.txt"
    touch "$test_dir/file with spaces.txt"
    touch "$test_dir/file-with-'quotes'.txt"
    touch "$test_dir/file\$with\$dollars.txt"

    # Run hook on each test file
    for file in "$test_dir"/*; do
        if bash "$hook" "$file" --agent-id "test-agent" 2>/dev/null; then
            echo "PASS: $hook handles $(basename "$file")"
        else
            echo "FAIL: $hook fails on $(basename "$file")"
        fi
    done
}

# Run tests
test_quoting ".claude/hooks/cfn-invoke-pre-edit.sh"
```

### Test Suite 2: Strict Mode Enforcement

```bash
#!/bin/bash
# Test Suite: Strict Mode (set -euo pipefail)

test_strict_mode() {
    local hook="$1"

    # Test 1: -e (exit on error)
    echo "Testing -e (exit on error)..."
    # (Hook should fail if dependencies missing)

    # Test 2: -u (undefined variables)
    echo "Testing -u (undefined variables)..."
    bash -c "source $hook; echo \$UNDEFINED_VAR" 2>&1 | \
        grep -q "unbound" && echo "PASS: -u catches undefined variables"

    # Test 3: -o pipefail (pipeline failures)
    echo "Testing -o pipefail (pipeline failures)..."
    # (More complex to test in isolation)
}
```

### Test Suite 3: mktemp Security

```bash
#!/bin/bash
# Test Suite: mktemp Security

test_mktemp_security() {
    # Test 1: Backup directory is secure
    BACKUP=$(./.claude/hooks/cfn-invoke-pre-edit.sh /tmp/test.txt --agent-id test)

    PERMS=$(stat -c %a "$BACKUP" 2>/dev/null || stat -f %A "$BACKUP")
    if [[ "$PERMS" == "700" ]]; then
        echo "PASS: Backup directory has secure permissions (700)"
    else
        echo "FAIL: Backup directory has insecure permissions ($PERMS)"
    fi

    # Test 2: Multiple backups are unique
    BACKUP1=$(./.claude/hooks/cfn-invoke-pre-edit.sh /tmp/test.txt --agent-id test1)
    BACKUP2=$(./.claude/hooks/cfn-invoke-pre-edit.sh /tmp/test.txt --agent-id test2)

    if [[ "$BACKUP1" != "$BACKUP2" ]]; then
        echo "PASS: Backup directories are unique"
    else
        echo "FAIL: Backup directories are identical"
    fi

    # Cleanup
    rm -rf "$BACKUP1" "$BACKUP2"
}
```

---

## Integration Checklist

### Before Deploying CFN Loop with Security Fixes

#### Phase 1: Code Review

- [ ] All shell hooks reviewed for SC2086 quoting compliance
- [ ] All shell hooks reviewed for SC2048 argument handling
- [ ] Strict mode `set -euo pipefail` present in all hooks
- [ ] mktemp usage verified in backup/temp creation scripts
- [ ] Error handlers do not suppress legitimate errors
- [ ] Documentation exists for security model of each hook

#### Phase 2: Testing

- [ ] Test filenames with spaces
- [ ] Test filenames with special characters
- [ ] Test with undefined environment variables
- [ ] Test error propagation (exit codes)
- [ ] Test backup directory permissions
- [ ] Test cleanup on exit

#### Phase 3: Documentation

- [ ] SHELL_SECURITY_BEST_PRACTICES.md created
- [ ] SHELL_SECURITY_QUICK_REFERENCE.md created
- [ ] CFN_LOOP_SHELL_SECURITY_INTEGRATION.md created (this file)
- [ ] Each hook documented with security model
- [ ] Testing procedures documented

#### Phase 4: Deployment

- [ ] All hooks pass security audit
- [ ] All tests pass
- [ ] Staging environment validation
- [ ] Production deployment with monitoring

---

## Validation Commands

Quick commands to verify integration:

```bash
# 1. Check strict mode in all hooks
echo "=== Strict Mode Check ==="
grep -l "set -euo pipefail" .claude/hooks/*.sh

# 2. Find unquoted variables
echo "=== Quoting Check ==="
grep -h '\$[A-Z_]' .claude/hooks/*.sh | grep -v '"\$'

# 3. Check mktemp usage
echo "=== mktemp Check ==="
grep -l "mktemp" .claude/hooks/*.sh

# 4. Run ShellCheck if available
echo "=== ShellCheck ==="
shellcheck .claude/hooks/*.sh 2>/dev/null || echo "ShellCheck not installed"

# 5. Test with special characters
echo "=== Integration Test ==="
bash -c '
    TEST_FILE=$(mktemp)
    trap "rm -f $TEST_FILE" EXIT
    echo "test" > "$TEST_FILE"
    ./.claude/hooks/cfn-invoke-pre-edit.sh "$TEST_FILE" --agent-id test
'
```

---

## References

### Related Documentation
- `docs/SHELL_SECURITY_BEST_PRACTICES.md` - Comprehensive guide
- `docs/SHELL_SECURITY_QUICK_REFERENCE.md` - Quick reference
- `.claude/CLAUDE.md` - General project standards
- `.claude/hooks/cfn-BACKUP_USAGE.md` - Backup usage guide

### Security Standards
- POSIX Shell Standard: https://pubs.opengroup.org/onlinepubs/9699919799/
- ShellCheck: https://www.shellcheck.net/
- CWE-78: OS Command Injection
- CWE-367: TOCTOU Race Condition

---

**Document Status:** Complete Research and Integration Planning
**Date:** November 17, 2025
**Applicable Fixes:** Shell Security Integration #1, #2, #3
**Next Steps:** Execute integration plan and run validation tests
