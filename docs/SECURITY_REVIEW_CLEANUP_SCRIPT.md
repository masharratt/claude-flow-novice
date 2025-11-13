# Security Review: Test Cleanup Script
**Phase 1 - Loop 2 Validation Analysis**
**Location:** `tests/docker/cleanup/remove-obsolete-tests.sh`
**Validator:** Security Specialist Agent
**Date:** 2025-11-13
**Confidence:** 0.88

---

## Executive Summary

The cleanup script implements **strong protective mechanisms** that prevent accidental or malicious deletion of files outside the intended test directory. The design prioritizes safety through:

- Dry-run enforcement by default
- Explicit file existence validation before any operation
- Comprehensive backup strategy before destructive operations
- Well-scoped path patterns with no wildcard expansions
- Clear separation between remove/move/archive operations

**Status:** APPROVED with notes on hardening opportunities

---

## Security Assessment by Threat Category

### 1. Path Traversal Attacks

**Threat:** Can the script be manipulated to delete files outside `tests/` directory?

**Analysis:**

#### Strengths:
- `PROJECT_ROOT=$(git rev-parse --show-toplevel)` - Git-validated root, can't be subverted
- All paths explicitly constructed with hardcoded directory names
- Search patterns limited to: `tests/docker/$file` and `tests/$file`
- No user input variables in path construction
- No `eval`, `exec`, or command substitution in paths

```bash
# SECURE PATTERN - paths are hardcoded
local search_paths=("tests/docker/$file" "tests/$file")
for path in "${search_paths[@]}"; do
    if [[ -f "$path" ]]; then
        # path is validated to exist before operation
```

#### Attack Vectors Evaluated:
| Vector | Risk | Mitigation |
|--------|------|-----------|
| Symlink in `tests/` → `/etc/` | LOW | File existence check triggers only on regular files; `-f` test fails for symlinks pointing outside tests/ |
| Malicious `$file` variable | NONE | Parameter is function argument, not user input; values hardcoded in calling code |
| Directory traversal (`../../../`) in filenames | LOW | Script searches `tests/docker/../../../etc/passwd` but this resolves to absolute path outside scope - existence check fails |
| Relative path manipulation | NONE | No relative paths used; git root anchors all operations |
| Backup directory escape | LOW | `BACKUP_DIR="tests/archive/pre-cleanup-backup-2025-11-13"` - hardcoded, absolute pattern |

**Finding:** Path traversal risk is **MINIMAL**. The script properly constrains all file operations to the `tests/` directory tree.

---

### 2. Backup Integrity and Race Conditions

**Threat:** Can backup operations be compromised? Are files vulnerable between backup and deletion?

**Analysis:**

#### Strengths:
- Backup created **before** any destructive operation: `cp "$path" "$BACKUP_DIR/" && rm "$path"`
- Backup directory created early: `mkdir -p "$BACKUP_DIR"` (when `DRY_RUN=false`)
- Sequential execution prevents race conditions in single-threaded bash
- File existence validated before backup: `if [[ -f "$path" ]]`

```bash
# SECURE SEQUENCE
if [[ "$DRY_RUN" == "false" ]]; then
    cp "$path" "$BACKUP_DIR/"    # BACKUP FIRST
    rm "$path"                    # THEN DELETE
    echo "  ❌ Removed: $path"
fi
```

#### Risks Identified:
| Risk | Severity | Mitigation |
|------|----------|-----------|
| Backup disk full → cp fails, but rm still executes | MEDIUM | Script uses `set -euo pipefail` - would halt on cp failure |
| TOCTOU (time-of-check-time-of-use) between check and backup | LOW | Single-threaded; no concurrent access possible |
| Backup directory not created before operations | LOW | Script validates `DRY_RUN=false` before mkdir |
| Symlink in backup dir → file copied to unexpected location | MEDIUM | `cp` without `-P` follows symlinks; backup could escape |

**Finding:** Backup integrity is **STRONG** with one caveat: symlinks in the backup directory could redirect copies.

**Recommendation:** Add explicit symlink validation:
```bash
# Verify backup directory has no symlinks
if [[ -L "$BACKUP_DIR" ]]; then
    echo "ERROR: Backup directory is a symlink" >&2
    exit 1
fi
```

---

### 3. Destructive Operations Scope

**Threat:** Are rm/mv commands properly scoped? Can they affect unintended files?

**Analysis:**

#### Strengths:
- No glob patterns: `rm "$path"` uses explicit variable, not `rm tests/docker/*.sh`
- Three separate functions prevent mixing operations: `remove_if_exists()`, `move_if_exists()`, `archive_if_exists()`
- Each function validates file existence independently
- Only removes files that are explicitly listed (no `find` or wildcard scanning)

```bash
# SECURE - explicit paths only
rm "$path"           # GOOD - variable contains exact path
rm tests/docker/*    # DANGEROUS - not used here
mv "$path" "$dest"   # GOOD - explicit path operations
```

#### Removal List Audit:
The script removes/moves/archives only these files (no system files at risk):
- `run-redis-coordination-tests-fixed.sh` (duplicate test)
- `redis-test-simple.sh` (duplicate test)
- `test-adaptive-timeout-*.sh` (obsolete timeout tests)
- `orchestration-fallback-test.sh` (deprecated pattern)
- `readonly-conflict-prevention-test.sh` (obsolete)
- `test_mode_detection.sh` → moves to `tests/cli-mode/` (preserved)
- `test-task-mode-*.sh` → moves to `tests/task-mode/` (preserved)
- `test-ace-context-lookup.sh` → archives (preserved)

**Finding:** Removal scope is **HIGHLY CONSTRAINED**. No risk of system file deletion.

---

### 4. Input Validation

**Threat:** Are file paths validated before operations?

**Analysis:**

#### Validation Present:
- `[[ -f "$path" ]]` - ensures file exists before any operation
- `[[ "$DRY_RUN" == "true" ]]` - validates only "true"/"false" values
- All file names hardcoded in script - no external input processed
- Backup directory validated to exist: `mkdir -p "$BACKUP_DIR"`

#### Validation Gaps:
| Check | Present | Gap |
|-------|---------|-----|
| File exists check (`-f`) | YES | Only validates type; doesn't check permissions |
| Directory writable check | NO | Script assumes `tests/` is writable |
| Disk space validation | NO | Script assumes sufficient space for backup |
| Filename special character handling | YES | No special chars in hardcoded names |

**Finding:** Input validation is **ADEQUATE for intended use** but could be hardened with permission and disk space checks.

---

### 5. Dry-Run Mode Enforcement

**Threat:** Can the dry-run be bypassed? Are protections properly gated?

**Analysis:**

#### Strengths:
- Dry-run is **DEFAULT**: `DRY_RUN="${DRY_RUN:-true}"`
- Explicit check before each destructive operation: `if [[ "$DRY_RUN" == "false" ]]`
- Backup directory creation **gated** on `DRY_RUN=false`
- Clear messaging: "DRY RUN MODE - No files will be modified"

```bash
DRY_RUN="${DRY_RUN:-true}"  # DEFAULT IS TRUE (safe)
if [[ "$DRY_RUN" == "false" ]]; then
    mkdir -p "$BACKUP_DIR"
fi
if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY RUN] Would remove: $path"
else
    cp "$path" "$BACKUP_DIR/"
    rm "$path"
fi
```

#### Dry-Run Validation:
- `DRY_RUN=false` explicitly required to execute
- No shell aliases or env substitutions can bypass this
- Boolean check is explicit (`== "true"` and `== "false"`)
- Clear warning printed at start and end

**Finding:** Dry-run enforcement is **ROBUST**. Safe-by-default pattern properly implemented.

---

### 6. Wildcard and Glob Expansion Risks

**Threat:** Do wildcard patterns expand to unintended files?

**Analysis:**

#### Assessment:
- **NO WILDCARDS USED** in the script
- All file operations use explicit variable substitution
- Search paths are hardcoded directories, not patterns
- Archive README and manifest use heredocs (no glob expansion)

```bash
# SECURE - no wildcards
remove_if_exists "run-redis-coordination-tests-fixed.sh"  # hardcoded

# DANGEROUS (NOT USED)
rm tests/docker/*.sh  # would expand to all files
```

**Finding:** Glob expansion risk is **ZERO**. Script explicitly avoids patterns.

---

### 7. Symlink Attack Scenarios

**Threat:** Can symlinks be exploited to delete files outside tests/?

**Analysis:**

#### Scenario 1: Symlink in removal path
```bash
# Attack: ln -s /etc/passwd tests/docker/test-file.sh
# Then script does: rm tests/docker/test-file.sh
```

**Status:** PROTECTED
- `[[ -f "$path" ]]` detects symlinks (returns true for symlinks to files)
- Script **WILL delete the symlink itself**, not the target
- `/etc/passwd` would remain untouched
- **LIMITATION:** Script correctly handles this but silently removes symlinks

#### Scenario 2: Symlink in backup directory
```bash
# Attack: ln -s / tests/archive/pre-cleanup-backup-2025-11-13
# Then: cp tests/docker/file.sh tests/archive/pre-cleanup-backup-2025-11-13/
```

**Status:** PARTIALLY VULNERABLE
- `cp` without `-P` flag follows symlinks
- Could copy to unexpected destination
- **Risk Level:** LOW (backup directory created by script, not user-provided)
- **Recommendation:** Add `--no-dereference` to cp

#### Scenario 3: Symlink in tests/ pointing to parent
```bash
# Attack: ln -s ../.. tests/docker/parent-link
# Then: remove_if_exists "parent-link"
```

**Status:** PROTECTED
- `[[ -f "$path" ]]` returns false (symlink to directory)
- File existence check enforces regular file only
- Symlink is never processed

**Finding:** Symlink attacks are **MITIGATED by design**. The `-f` test prevents directory symlinks; only file symlinks could be deleted (which is acceptable).

---

## Security Vulnerabilities and Recommendations

### Critical (Immediate Action Required)
**NONE IDENTIFIED** - Script contains no critical vulnerabilities.

---

### High Priority (Should Fix Before Production)

#### 1. Symlink Dereference in Backup
**Severity:** MEDIUM
**Location:** Lines with `cp "$path" "$BACKUP_DIR/"`
**Issue:** `cp` without `-P` flag could follow symlinks
**Fix:**
```bash
# Current (potentially unsafe with symlinks)
cp "$path" "$BACKUP_DIR/"

# Recommended (explicit symlink handling)
cp --no-dereference "$path" "$BACKUP_DIR/"
# OR for maximum safety
if [[ -L "$path" ]]; then
    cp -d "$path" "$BACKUP_DIR/"  # -d preserves links
else
    cp "$path" "$BACKUP_DIR/"
fi
```

---

### Medium Priority (Hardening Recommendations)

#### 2. Backup Directory Symlink Validation
**Location:** Line 23 (backup directory creation)
**Issue:** No validation that backup directory is not a symlink
**Fix:**
```bash
# After mkdir -p
if [[ -L "$BACKUP_DIR" ]]; then
    echo "ERROR: Backup directory is a symlink. Aborting." >&2
    exit 1
fi
```

#### 3. Disk Space Validation
**Location:** Before any backup operations
**Issue:** Script assumes sufficient disk space
**Fix:**
```bash
# Add after backup directory creation
if [[ "$DRY_RUN" == "false" ]]; then
    available_space=$(df "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 10000 ]]; then  # 10MB minimum
        echo "ERROR: Insufficient disk space. Need 10MB, have ${available_space}KB" >&2
        exit 1
    fi
fi
```

#### 4. File Permission Validation
**Location:** Before any destructive operations
**Issue:** Script doesn't verify write permissions
**Fix:**
```bash
# Add in each remove_if_exists() before cp/rm
if [[ ! -w "${path%/*}" ]]; then
    echo "ERROR: No write permission for $path directory" >&2
    exit 1
fi
```

#### 5. Explicit Symlink Reporting
**Location:** In removal handling
**Issue:** Script silently removes symlinks; user may not notice
**Fix:**
```bash
# In remove_if_exists function
if [[ -L "$path" ]]; then
    echo "  ⚠️  WARNING: Removing symlink (not target): $path"
fi
```

---

### Low Priority (Nice-to-Have Improvements)

#### 6. Atomic Operations with Temp Files
**Location:** Backup and move operations
**Improvement:** Use atomic operations for maximum safety
```bash
# Instead of: cp then rm
# Use: Create in temp, validate, then move
temp_backup="${BACKUP_DIR}/.tmp-$$-$(basename "$path")"
cp "$path" "$temp_backup" || exit 1
# Validate backup
if [[ ! -f "$temp_backup" ]]; then
    echo "ERROR: Backup validation failed" >&2
    exit 1
fi
mv "$temp_backup" "$BACKUP_DIR/$(basename "$path")"
```

#### 7. Removal Manifest with Checksums
**Location:** removal-manifest.txt generation
**Improvement:** Add file checksums for integrity verification
```bash
# Add to manifest
echo "run-redis-coordination-tests-fixed.sh: $(sha256sum "$path" | cut -d' ' -f1)"
```

#### 8. Concurrency Lock File
**Location:** Script initialization
**Improvement:** Prevent concurrent execution
```bash
LOCK_FILE="/tmp/cleanup-script.lock"
if [[ -f "$LOCK_FILE" ]]; then
    echo "ERROR: Script already running (lock: $LOCK_FILE)" >&2
    exit 1
fi
touch "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT
```

---

## Positive Security Patterns Identified

### 1. Safe-by-Default Design
- Dry-run mode is **default**, not opt-in
- All operations **must** be explicitly enabled
- Clear messaging at every stage
- **Pattern Rating:** EXCELLENT

### 2. Fail-Fast Error Handling
- `set -euo pipefail` enforces strict error handling
- Any command failure halts script
- Backup directory creation validated
- **Pattern Rating:** EXCELLENT

### 3. Comprehensive Logging
- Every operation logged with emoji indicators
- Dry-run vs actual operation clearly marked
- Summary provided at end
- **Pattern Rating:** STRONG

### 4. Backup-Before-Delete Pattern
- All files copied to backup before deletion
- Backup directory created first
- Manifest documents all operations
- **Pattern Rating:** STRONG

### 5. Explicit File Listing
- No wildcard scanning or find commands
- Only explicitly named files processed
- Reduces surprise deletions
- **Pattern Rating:** EXCELLENT

---

## Compliance Assessment

### OWASP Secure Coding Practices
| Control | Status | Notes |
|---------|--------|-------|
| Input Validation | PASS | No user input processed; hardcoded values only |
| Output Encoding | PASS | All output properly quoted and escaped |
| Authentication/Authorization | N/A | Script execution controlled by shell |
| Access Control | PASS | File operations respect OS permissions |
| Cryptographic Practices | N/A | Not applicable to file deletion |
| Error Handling | PASS | Strict mode with explicit error handling |
| Logging | PASS | Comprehensive operation logging |
| Data Protection | PASS | Backup preserved; manifest documents |
| Communication Security | N/A | Local script only |
| System Configuration | PASS | Safe defaults enforced |

### CWE Coverage
| CWE | Risk | Mitigation |
|-----|------|-----------|
| CWE-22 (Path Traversal) | LOW | Git-validated root; hardcoded paths |
| CWE-73 (External Control) | NONE | No user input in paths |
| CWE-367 (TOCTOU) | LOW | Single-threaded; sequential execution |
| CWE-426 (Untrusted Input) | NONE | No external input processed |
| CWE-552 (Files with Excessive Permissions) | NONE | Standard Unix permissions respected |

---

## Testing Recommendations

### 1. Path Traversal Test
```bash
# Verify script rejects paths outside tests/
mkdir -p /tmp/evil-dir
ln -s /tmp/evil-dir tests/docker/evil-link
bash tests/docker/cleanup/remove-obsolete-tests.sh
# Verify: evil-dir still exists, only symlink removed
rm tests/docker/evil-link
```

### 2. Symlink Target Preservation Test
```bash
# Create file and symlink
echo "important-file" > /tmp/important.txt
ln -s /tmp/important.txt tests/docker/test-link.sh
bash tests/docker/cleanup/remove-obsolete-tests.sh
# Verify: /tmp/important.txt still exists
cat /tmp/important.txt
rm tests/docker/test-link.sh
```

### 3. Backup Integrity Test
```bash
# Execute with DRY_RUN=false
DRY_RUN=false bash tests/docker/cleanup/remove-obsolete-tests.sh
# Verify files in backup directory
ls -la tests/archive/pre-cleanup-backup-2025-11-13/
# Compare checksums
diff <(find tests/archive/pre-cleanup-backup-2025-11-13/ -type f) <(git status --short)
```

### 4. Dry-Run Enforcement Test
```bash
# Verify no actual changes with dry-run
bash tests/docker/cleanup/remove-obsolete-tests.sh
git status --short
# Should show: nothing (no changes made)
```

### 5. Permission Denial Test
```bash
# Test behavior when directory not writable
chmod 000 tests/archive/
bash tests/docker/cleanup/remove-obsolete-tests.sh 2>&1 | grep -i "permission\|error" || echo "ISSUE: No permission error"
chmod 755 tests/archive/
```

---

## Risk Matrix

| Threat | Probability | Impact | Risk | Mitigated |
|--------|-------------|--------|------|-----------|
| Deletion outside tests/ | VERY LOW | CRITICAL | LOW | YES - path constraints |
| Backup corruption | LOW | HIGH | LOW | PARTIAL - recommend hardening |
| Symlink exploitation | LOW | MEDIUM | LOW | MOSTLY - file type check |
| Dry-run bypass | VERY LOW | HIGH | VERY LOW | YES - default enabled |
| Accidental file loss | MEDIUM | MEDIUM | MEDIUM | YES - backup provided |
| Race conditions | VERY LOW | MEDIUM | VERY LOW | YES - single-threaded |
| Disk space exhaustion | LOW | MEDIUM | LOW | PARTIAL - no validation |
| Permission errors | LOW | MEDIUM | LOW | PARTIAL - no pre-check |

---

## Consensus Findings Summary

### What Works Well
1. **Path safety:** All operations properly scoped to tests/ directory
2. **Safe defaults:** Dry-run mode enabled by default
3. **Backup strategy:** All files backed up before deletion
4. **No wildcards:** Explicit file listing prevents surprise deletions
5. **Error handling:** Strict mode catches failures
6. **Clear logging:** Operations clearly documented

### What Should Be Hardened
1. **Symlink dereference:** Add `--no-dereference` to cp
2. **Backup symlink check:** Validate backup directory itself
3. **Disk space:** Validate sufficient space before operations
4. **Permissions:** Check write permissions before operations
5. **Manifest checksums:** Add integrity verification

### Overall Security Posture
- **Suitable for production use** after applying hardening recommendations
- **Low risk of unintended file deletion** due to path constraints
- **Backup strategy enables safe recovery** from any issues
- **Dry-run testing provides safety net** before actual execution

---

## Recommendations for Improvement

### Phase 1 (Before First Execution - RECOMMENDED)
1. Add `--no-dereference` to cp command
2. Add symlink validation for backup directory
3. Document symlink handling behavior in README

### Phase 2 (Future Hardening)
1. Add disk space validation
2. Add file permission checks
3. Add integrity checksums to manifest

### Phase 3 (Optional Enhancements)
1. Implement atomic operations with temp files
2. Add concurrency locking
3. Add rollback capability

---

## Final Security Assessment

**Consensus Score: 0.88**

The cleanup script implements **strong protective mechanisms** against common deletion attacks and accidental file loss. Path traversal is effectively prevented through git-anchored paths and explicit file listing. The dry-run default provides a safety net for review before actual execution. Backup strategy enables recovery from any issues.

Recommended improvements focus on hardening symlink handling and adding pre-operation validation for disk space and permissions. These are enhancements rather than critical fixes.

**Recommendation:** APPROVED FOR USE with suggested hardening applied before widespread deployment.

---

## References

- **Script Location:** `tests/docker/cleanup/remove-obsolete-tests.sh`
- **Documentation:** `tests/docker/cleanup/README.md`
- **Related Tests:** `tests/docker/TEST_SUITE_MAINTENANCE_PLAN.md`
- **OWASP Secure Coding:** https://owasp.org/www-community/attacks/Path_Traversal
- **CWE-22 (Path Traversal):** https://cwe.mitre.org/data/definitions/22.html
- **Shell Best Practices:** `CLAUDE.md` - Shell Scripting Best Practices section
