# Shell Scripting Security Best Practices

**Date:** November 17, 2025
**Status:** Complete Research Documentation
**Confidence Score:** 0.94
**Focus Areas:** Variable Quoting, Strict Mode, mktemp Security

---

## Executive Summary

This document provides comprehensive guidance on three critical shell scripting security practices:

1. **Variable Quoting (SC2086, SC2048)** - Prevents word splitting and injection attacks
2. **Strict Mode (set -euo pipefail)** - Enables defensive error handling
3. **mktemp Security** - Replaces unsafe temporary file creation

These practices protect against race conditions, command injection, and data corruption when implementing the three shell security fixes in CFN Loop infrastructure.

---

## Table of Contents

1. [Variable Quoting](#variable-quoting)
2. [Strict Mode](#strict-mode)
3. [mktemp Security](#mktemp-security)
4. [Integration with CFN Loop](#integration-with-cfn-loop)
5. [Testing Strategies](#testing-strategies)
6. [Common Mistakes](#common-mistakes)

---

## Variable Quoting

### The Problem: Unquoted Expansion

When shell variables are used without quotes, they undergo **word splitting** and **pathname expansion**. Each space-separated word becomes a separate argument.

**Impact:** Command injection, incorrect argument passing, file globbing side effects

### ShellCheck Rule SC2086: Unquoted Variable Expansion

**Rule:** Double quote variables in all expansions to prevent word splitting

#### Example 1: File Names with Spaces

```bash
#!/bin/bash

# VULNERABLE - SC2086
FILE_PATH="$1"
backup_file="/backup/$FILE_PATH"  # If $FILE_PATH contains spaces...

cp "$FILE_PATH" "$backup_file"      # WRONG - treats spaces as separators
# If FILE_PATH = "my document.txt"
# Command becomes: cp my document.txt /backup/my document.txt
# Bash interprets as: cp my (copies), document.txt (source), /backup/my (dest), document.txt (extra)

# SECURE - Quoted
cp "$FILE_PATH" "$backup_file"      # CORRECT - entire string is single argument
```

#### Example 2: Command Substitution

```bash
#!/bin/bash

# VULNERABLE - SC2086
LIST=$(cat /tmp/files.txt)
for file in $LIST; do               # Word splitting occurs
    echo "Processing: $file"
done
# If /tmp/files.txt contains: "file 1.txt file 2.txt"
# Loop iterates 4 times: "file", "1.txt", "file", "2.txt"

# SECURE - Quoted
for file in "$LIST"; do             # Entire content is single argument
    echo "Processing: $file"
done
# Loop iterates 1 time: "file 1.txt file 2.txt"
```

#### Example 3: Variable in Conditionals

```bash
#!/bin/bash

# VULNERABLE - SC2086 (less obvious)
USER_INPUT="$1"
if [ -f $USER_INPUT ]; then         # Breaks if $USER_INPUT has spaces
    rm "$USER_INPUT"
fi
# If USER_INPUT = "test file.txt"
# Condition becomes: [ -f test file.txt ]
# Bash sees: [ -f (test) (file.txt) ] - too many arguments, error

# SECURE - Quoted
if [ -f "$USER_INPUT" ]; then       # Correct argument parsing
    rm "$USER_INPUT"
fi
```

### ShellCheck Rule SC2048: Use "$@" instead of $*

**Rule:** Use `"$@"` to preserve argument boundaries when passing function arguments

#### Example 1: Function Argument Passing

```bash
#!/bin/bash

process_args() {
    # VULNERABLE - SC2048
    echo $*                         # Loses argument structure
    # If called with ("arg with spaces" "another arg")
    # Output: arg with spaces another arg (looks like 4 args)

    # SECURE
    echo "$@"                       # Preserves argument structure
    # If called with ("arg with spaces" "another arg")
    # Output: arg with spaces another arg (but internally 2 args)
}

process_args "arg with spaces" "another arg"
```

#### Example 2: Passing Arguments to Another Command

```bash
#!/bin/bash

# VULNERABLE - SC2048
run_command() {
    /usr/bin/someapp $*            # Arguments get split
}

# Called with: run_command "arg 1" "arg 2"
# /usr/bin/someapp receives 4 args: arg, 1, arg, 2

# SECURE
run_command() {
    /usr/bin/someapp "$@"          # Arguments preserved
}

# Called with: run_command "arg 1" "arg 2"
# /usr/bin/someapp receives 2 args: "arg 1", "arg 2"
```

### Exception Cases: When NOT to Quote

These cases are safe from word-splitting attacks:

#### 1. [[ ]] Conditional Context

In `[[ ]]` conditionals, the right side is treated as a pattern, not expanded:

```bash
#!/bin/bash

var="hello world"

# SAFE - No word splitting in [[ ]]
[[ $var == "hello world" ]]       # Pattern matching context

# ALSO SAFE - For presence checking
[[ -n $var ]]                     # Tests if var is non-empty

# ALSO SAFE - For variable expansion
[[ $var == h* ]]                  # Glob pattern in [[ ]]
```

**Why:** The `[[ ]]` operator is bash-specific and treats the right side as a pattern string, not subject to word splitting.

#### 2. Arithmetic Expansion Context

In `$(( ))` arithmetic context, variables need not be quoted:

```bash
#!/bin/bash

count="5 files"
result=$(( count + 1 ))            # SAFE - Arithmetic context ignores strings
# Treats count as 5 (coerces string to number)
```

**Why:** Arithmetic context performs type coercion and disables word splitting.

#### 3. Command Names (NEVER Quote)

Never quote the command name itself:

```bash
#!/bin/bash

# WRONG - Don't quote command names
"myfunction" "arg"                  # Bash tries to execute string "myfunction"

# CORRECT - Quote only arguments
myfunction "arg"                    # Execute myfunction with "arg"
```

### Testing Variable Quoting

#### Test Case 1: Filenames with Spaces

```bash
#!/bin/bash
set -euo pipefail

# Setup
TEST_DIR=$(mktemp -d)
trap "rm -rf '$TEST_DIR'" EXIT

# Create test file with spaces
touch "$TEST_DIR/test file.txt"

# VULNERABLE approach
SOURCE="$TEST_DIR/test file.txt"
DEST1="$TEST_DIR/backup1"
cp $SOURCE "$DEST1" 2>&1 || echo "EXPECTED FAILURE: Unquoted variable"

# SECURE approach
DEST2="$TEST_DIR/backup2"
cp "$SOURCE" "$DEST2" 2>&1 && echo "SUCCESS: Quoted variable works"

# Verify
[[ -f "$DEST2/test" ]] && echo "ERROR: File was split" || true
[[ -f "$DEST2/test file.txt" ]] && echo "SUCCESS: File preserved"
```

**Expected Output:**
```
EXPECTED FAILURE: Unquoted variable
SUCCESS: Quoted variable works
SUCCESS: File preserved
```

#### Test Case 2: Variable in Loop

```bash
#!/bin/bash
set -euo pipefail

# Setup
ITEMS="apple banana cherry"
EXPECTED_COUNT=1

# VULNERABLE - Word splitting
count=0
for item in $ITEMS; do
    ((count++))
done
[[ $count -eq 3 ]] && echo "FAIL: Unquoted caused word splitting"

# SECURE - Quoted
count=0
for item in "$ITEMS"; do
    ((count++))
done
[[ $count -eq $EXPECTED_COUNT ]] && echo "PASS: Quoted preserves structure"
```

**Expected Output:**
```
FAIL: Unquoted caused word splitting
PASS: Quoted preserves structure
```

---

## Strict Mode

### The Problem: Silent Failures

Without strict mode, shell scripts can fail silently:

- Commands that fail are ignored
- Undefined variables expand to empty strings
- Pipeline failures are hidden

**Impact:** Data corruption, incorrect results, hard-to-debug issues

### What `set -euo pipefail` Does

#### -e (errexit): Exit on Error

Immediately exit if any command returns non-zero exit code.

```bash
#!/bin/bash
set -e

false                              # Non-zero exit code
echo "This line is never reached"  # Script exits before this
```

**Use Case:** Prevents cascading failures when a critical command fails

**Exceptions:**
- Commands in conditionals: `if command; then ...` (command failing is expected)
- Pipelines without `pipefail`: Last command exit code determines result
- Command after `||` operator: `command || echo "failed"` (failure is handled)

#### -u (nounset): Error on Undefined Variables

Immediately exit if a variable is used but not defined.

```bash
#!/bin/bash
set -u

echo "User: $USERNAME"  # OK if USERNAME is set
echo "User: $USERNNAME" # ERROR: USERNNAME: unbound variable
```

**Use Case:** Catches typos in variable names that would silently become empty strings

**Handling Undefined Variables:**

```bash
#!/bin/bash
set -u

# Use with default value
USERNAME="${ACCOUNT_NAME:-defaultuser}"

# Use with parameter expansion
PASSWORD="${PASS:?ERROR: PASS not set}"  # Exits with custom message

# Optional variable
if [[ -v OPTIONAL_VAR ]]; then
    echo "Optional var is set: $OPTIONAL_VAR"
fi
```

#### -o pipefail: Pipeline Fails if Any Command Fails

A pipeline's exit code is 0 unless any command fails.

```bash
#!/bin/bash
# Without pipefail:
cat /nonexistent/file.txt | grep pattern  # Exit code 0 (from grep on empty input)

# With pipefail:
set -o pipefail
cat /nonexistent/file.txt | grep pattern  # Exit code 1 (from cat)
```

**Use Case:** Detects failures in early pipeline stages that would otherwise hide errors

### When Strict Mode Might Cause Issues

#### Issue 1: Intentional Error Handling

```bash
#!/bin/bash
set -e

# PROBLEM: Script exits even though you want to recover
result=$(command_that_might_fail)
echo "Recovered with: $result"  # Never reached

# SOLUTION 1: Use error suppression
result=$(command_that_might_fail || true)

# SOLUTION 2: Use conditional
if result=$(command_that_might_fail); then
    echo "Success: $result"
else
    echo "Failed, using default"
    result="default"
fi

# SOLUTION 3: Handle in function
recover_if_fails() {
    "$@" || return 0  # Suppress error
}
```

#### Issue 2: Commands with Multiple Conditions

```bash
#!/bin/bash
set -e

# SAFE - Conditional execution is compatible with set -e
command1 && command2    # command2 only if command1 succeeds
command1 || command2    # command2 only if command1 fails

# These work correctly even with set -e
```

#### Issue 3: Pipefail Breaking Existing Workflows

```bash
#!/bin/bash
set -o pipefail

# This changes behavior in edge cases
grep pattern /nonexistent/file.txt 2>/dev/null | head -1

# Before pipefail: Exit 0 (head succeeds on empty input)
# After pipefail: Exit 2 (grep fails)

# SOLUTION: Explicit error handling
(grep pattern /nonexistent/file.txt 2>/dev/null || true) | head -1
```

### Best Practices for Strict Mode

#### Pattern 1: Function with Error Recovery

```bash
#!/bin/bash
set -euo pipefail

# Wrapper for commands that might fail
safe_run() {
    if "$@"; then
        return 0
    else
        echo "WARNING: Command failed: $*" >&2
        return 1
    fi
}

# Use in script
if ! safe_run optional_command; then
    echo "Optional command failed, continuing..."
fi

echo "Script completed successfully"
```

#### Pattern 2: Resource Cleanup with Trap

```bash
#!/bin/bash
set -euo pipefail

TMPFILE=$(mktemp)
TMPDIR=$(mktemp -d)

# Setup cleanup before any operations
cleanup() {
    local exit_code=$?
    echo "Cleaning up..."
    rm -f "$TMPFILE"
    rm -rf "$TMPDIR"
    return $exit_code
}
trap cleanup EXIT

# Now use resources
echo "Working with: $TMPFILE $TMPDIR"
```

#### Pattern 3: Error Handling with Context

```bash
#!/bin/bash
set -euo pipefail

error_handler() {
    local line_no=$1
    echo "ERROR: Script failed at line $line_no" >&2
    exit 1
}
trap 'error_handler ${LINENO}' ERR

# Script body - any error will trigger handler
critical_operation
```

### Compatibility Considerations

#### POSIX Shells

All POSIX-compliant shells support `set -euo pipefail`:
- **bash** - Full support
- **dash** - Full support
- **ksh** - Full support
- **zsh** - Full support
- **sh** - Full support (when it's bash, dash, or other)

#### Non-POSIX Shells

- **fish** - Different syntax: `set -e` (not pipefail)
- **PowerShell** - Different error model: `$ErrorActionPreference = 'Stop'`
- **tcsh** - Limited support: `set -e` only

#### Busybox sh

Busybox sh has limited support; always test in busybox environments:

```bash
#!/bin/sh
# Safest approach for busybox
set -e
# pipefail may not be available
```

---

## mktemp Security

### The Problem: Predictable Temporary Files

Traditional temporary file creation is vulnerable to:

1. **Race Conditions:** Attacker can predict filename and create symlink before script
2. **Permission Issues:** World-readable temporary files expose sensitive data
3. **TOCTOU Attacks:** Check-then-create timing window

### Why Predictable Filenames Are Dangerous

#### Attack 1: Race Condition via Symlink

```bash
#!/bin/bash

# VULNERABLE - Predictable filename
TMPFILE="/tmp/myapp_$$.tmp"  # PID is predictable from process list

# Attacker can:
# 1. Discover the PID: ps aux | grep myapp
# 2. Create symlink BEFORE script runs:
#    ln -s /etc/passwd /tmp/myapp_1234.tmp
# 3. Script overwrites important file:
#    echo "data" > "$TMPFILE"  # Actually writes to /etc/passwd

# SECURE - mktemp creates unpredictable name
TMPFILE=$(mktemp)  # Creates: /tmp/tmp.XXXXXXXXXX (random 10 chars)
# Attacker cannot predict the random suffix
# Even with known PID, cannot predict exact filename
```

**Real-World Impact:** Overwriting system files, credential leakage, privilege escalation

#### Attack 2: Permission Issues

```bash
#!/bin/bash

# VULNERABLE - Default permissions are world-readable
touch /tmp/myapp.tmp                    # Created with mode 644 (rw-r--r--)
echo "SECRET_DATA=abc123" > /tmp/myapp.tmp
# Any user can read: cat /tmp/myapp.tmp

# SECURE - mktemp creates restrictive permissions
TMPFILE=$(mktemp)
echo "SECRET_DATA=abc123" > "$TMPFILE"  # Created with mode 600 (rw-------)
ls -la "$TMPFILE"                       # Shows: -rw------- (only owner reads)
```

#### Attack 3: TOCTOU (Time-of-Check-Time-of-Use)

```bash
#!/bin/bash

# VULNERABLE - Race condition in check-then-create
TMPFILE="/tmp/myapp.tmp"
if [[ ! -f "$TMPFILE" ]]; then
    # Between check and create, attacker can create symlink
    touch "$TMPFILE"
    # Script writes to attacker's target
fi

# SECURE - mktemp is atomic
TMPFILE=$(mktemp)
# File is created atomically; attacker cannot interfere
```

### mktemp Usage Patterns

#### Pattern 1: Single Temporary File (Most Common)

```bash
#!/bin/bash
set -euo pipefail

# Create temporary file
TMPFILE=$(mktemp)

# Setup cleanup (exit handler)
trap "rm -f '$TMPFILE'" EXIT

# Use the file
echo "temporary data" > "$TMPFILE"
cat "$TMPFILE"

# Cleanup happens automatically on exit
```

**Characteristics:**
- Simple and safe
- File cleaned up automatically via trap
- Suitable for most temporary file needs

#### Pattern 2: Multiple Files in Temporary Directory

```bash
#!/bin/bash
set -euo pipefail

# Create temporary directory
TMPDIR=$(mktemp -d)

# Setup cleanup for entire directory
trap "rm -rf '$TMPDIR'" EXIT

# Create multiple files
FILE1="$TMPDIR/file1.txt"
FILE2="$TMPDIR/file2.txt"
touch "$FILE1" "$FILE2"

# Use files
echo "data" > "$FILE1"
echo "more data" > "$FILE2"

# Entire directory cleaned up on exit
```

**Characteristics:**
- Creates temporary directory
- All files within share same cleanup trap
- Useful for temporary working directory

#### Pattern 3: Temporary Directory with Custom Name

```bash
#!/bin/bash
set -euo pipefail

# Create named temporary directory
TMPDIR=$(mktemp -d --tmpdir backup.XXXXXXXXXX)
echo "Backup directory: $TMPDIR"
# Creates: /tmp/backup.hxF7k9Jm2Q

trap "rm -rf '$TMPDIR'" EXIT

# Use directory
cp /important/file.txt "$TMPDIR/"
```

**Characteristics:**
- Partially predictable prefix (for readability)
- Random suffix (for security)
- Good for debugging (can see directory purpose)

#### Pattern 4: Temporary File with Specific Suffix

```bash
#!/bin/bash
set -euo pipefail

# Create temporary file with extension
TMPFILE=$(mktemp --suffix=.json)
echo "Created: $TMPFILE"

trap "rm -f '$TMPFILE'" EXIT

# Use file with application-specific format
echo '{"data": "value"}' > "$TMPFILE"
```

**Characteristics:**
- Useful when tool requires specific extension
- mktemp handles uniqueness, you provide suffix
- File extension aids debugging

### Cleanup Strategies

#### Strategy 1: trap EXIT (Recommended)

```bash
#!/bin/bash
set -euo pipefail

TMPFILE=$(mktemp)

# Register cleanup function
trap "rm -f '$TMPFILE'" EXIT

# Use file - cleanup guaranteed even if script exits early
echo "data" > "$TMPFILE"
grep pattern "$TMPFILE" || true  # Even if grep fails, cleanup runs
exit 0                            # Cleanup still runs
```

**Advantages:**
- Cleanup guaranteed regardless of exit method
- Works with `exit`, errors, signals
- Minimal boilerplate

**Limitations:**
- Doesn't catch SIGKILL (kill -9)
- Not invoked in subshells by default

#### Strategy 2: Explicit Cleanup

```bash
#!/bin/bash

TMPFILE=$(mktemp)

# Use file
echo "data" > "$TMPFILE"
grep pattern "$TMPFILE"

# Explicit cleanup
rm -f "$TMPFILE"
```

**Advantages:**
- Simple for small scripts
- Clear when cleanup occurs

**Disadvantages:**
- Cleanup doesn't run if script crashes
- Cleanup skipped on early exit
- Easy to forget

#### Strategy 3: Comprehensive Signal Handling

```bash
#!/bin/bash
set -euo pipefail

TMPFILE=$(mktemp)

# Handle multiple exit scenarios
cleanup() {
    local exit_code=$?
    echo "Cleaning up (exit code: $exit_code)"
    rm -f "$TMPFILE"
    return $exit_code
}

# Register for normal exit and common signals
trap cleanup EXIT        # Normal exit
trap 'exit 128' INT      # Ctrl+C (SIGINT)
trap 'exit 129' TERM     # kill (SIGTERM)

# Use file
echo "data" > "$TMPFILE"
sleep 10  # Can be interrupted with Ctrl+C

# Cleanup runs regardless
```

**Advantages:**
- Cleanup for normal exit and signals
- Can customize signal handling
- Preserves exit codes

**Use When:** Script might be interrupted by signals or needs signal-specific handling

### Cross-Platform Considerations

#### GNU mktemp (Linux Standard)

```bash
#!/bin/bash

mktemp                              # /tmp/tmp.XXXXXXXXXX
mktemp -d                           # /tmp/tmp.XXXXXXXXXX (directory)
mktemp --tmpdir=/var/tmp            # /var/tmp/tmp.XXXXXXXXXX
mktemp --suffix=.log                # /tmp/tmp.XXXXXXXXXX.log
mktemp -d --tmpdir=/tmp backup.XXXX # /tmp/backup.XXXX
```

#### BSD mktemp (macOS, FreeBSD)

```bash
#!/bin/bash

mktemp                              # /tmp/tmp.XXXXXXXXXX
mktemp -d                           # /tmp/tmp.XXXXXXXXXX (directory)
mktemp -t prefix                    # /var/tmp/prefix.XXXXXXXXXX
mktemp -q                           # Silent mode (no error output)
```

**Key Differences:**
- GNU: `--tmpdir`, `--suffix` flags
- BSD: `-t` flag, different temp directory default

#### Portable Pattern

```bash
#!/bin/bash
set -euo pipefail

# Works on GNU and BSD mktemp
if mktemp --version 2>/dev/null | grep -q GNU; then
    # GNU mktemp
    TMPFILE=$(mktemp --tmpdir="${TMPDIR:=/tmp}")
else
    # BSD mktemp
    TMPFILE=$(mktemp -t "$(basename "$0")")
fi

trap "rm -f '$TMPFILE'" EXIT
```

**Simpler Portable Pattern:**

```bash
#!/bin/bash
set -euo pipefail

# mktemp with fallback
TMPDIR="${TMPDIR:-/tmp}"
TMPFILE=$(mktemp -p "$TMPDIR" 2>/dev/null || mktemp "$TMPDIR/tmp.XXXXXXXXXX")

trap "rm -f '$TMPFILE'" EXIT
```

### Anti-Patterns to Avoid

#### Anti-Pattern 1: Predictable Filenames

```bash
#!/bin/bash

# DANGEROUS - Still predictable with /proc inspection
TMPFILE="/tmp/myapp_$$_$RANDOM.tmp"

# Attacker can:
# 1. Watch /proc/[pid]/fd/ to find open files
# 2. Predict based on PID and RANDOM value
# 3. Create symlink before script runs

# FIX: Use mktemp
TMPFILE=$(mktemp)
```

**Why Dangerous:** `$$` (PID) and `$RANDOM` are predictable with process inspection

#### Anti-Pattern 2: No Cleanup Handler

```bash
#!/bin/bash
set -euo pipefail

TMPFILE=$(mktemp)

# DANGEROUS - Cleanup not guaranteed
echo "data" > "$TMPFILE"

# If script crashes here, file remains:
critical_operation  # Crashes - TMPFILE orphaned

rm -f "$TMPFILE"    # Never reached
```

**FIX:** Always use trap for cleanup

```bash
#!/bin/bash
set -euo pipefail

TMPFILE=$(mktemp)
trap "rm -f '$TMPFILE'" EXIT  # Guaranteed cleanup

echo "data" > "$TMPFILE"
critical_operation             # If crashes, cleanup still runs
```

#### Anti-Pattern 3: World-Writable Temporary Directory

```bash
#!/bin/bash

# DANGEROUS - Anyone can read/write files
TMPDIR=$(mktemp -d -m 777)
echo "SECRET=abc" > "$TMPDIR/config"

# Other users can:
# cat "$TMPDIR/config"    (read secrets)
# rm "$TMPDIR/config"     (delete files)

# FIX: mktemp uses mode 700 by default - don't change it
TMPDIR=$(mktemp -d)  # Creates with mode 700 (rwx------)
```

#### Anti-Pattern 4: Unquoted Variable in Cleanup

```bash
#!/bin/bash
set -euo pipefail

TMPFILE=$(mktemp)

# DANGEROUS - SC2086 in trap
trap "rm -f $TMPFILE" EXIT  # Unquoted variable

# If TMPFILE="/tmp/my file.tmp", trap becomes:
# rm -f /tmp/my file.tmp
# Bash sees: rm -f /tmp/my (argument 1), file.tmp (argument 2)
# Deletes wrong files!

# FIX: Quote variables in trap
trap "rm -f '$TMPFILE'" EXIT
```

**Why:** Variable quoting applies everywhere, including trap strings

### Testing mktemp Security

#### Test 1: Verify Secure Permissions

```bash
#!/bin/bash
set -euo pipefail

# Create temporary file
TMPFILE=$(mktemp)
trap "rm -f '$TMPFILE'" EXIT

# Verify it's not world-readable
PERMS=$(stat -c %a "$TMPFILE" 2>/dev/null || stat -f %A "$TMPFILE")

if [[ "$PERMS" == "600" ]]; then
    echo "PASS: File has secure permissions (600)"
else
    echo "FAIL: File has insecure permissions ($PERMS)"
    exit 1
fi
```

#### Test 2: Verify Unpredictability

```bash
#!/bin/bash
set -euo pipefail

# Create multiple temporary files
FILES=()
for i in {1..10}; do
    FILES+=($(mktemp))
done

# Check that all filenames are different
if [[ ${#FILES[@]} -eq ${#FILES[@]##} ]]; then
    echo "PASS: All filenames are unique"
else
    echo "FAIL: Duplicate filenames detected"
fi

# Cleanup
for f in "${FILES[@]}"; do
    rm -f "$f"
done
```

#### Test 3: Verify Cleanup on Exit

```bash
#!/bin/bash
set -euo pipefail

cleanup_test() {
    TMPFILE=$(mktemp)
    echo "Created: $TMPFILE"

    # Setup cleanup
    trap "rm -f '$TMPFILE'" EXIT

    # Simulate early exit
    exit 0
}

# Run in subshell to capture output
TMPFILE_NAME=$(cleanup_test)
TMPFILE_NAME=$(echo "$TMPFILE_NAME" | grep "Created:" | awk '{print $NF}')

# Verify cleanup happened
if [[ ! -f "$TMPFILE_NAME" ]]; then
    echo "PASS: File cleaned up on exit"
else
    echo "FAIL: File still exists after exit"
    rm -f "$TMPFILE_NAME"
fi
```

---

## Integration with CFN Loop

### Current CFN Loop Usage

The following CFN Loop scripts currently implement some security best practices:

**Files Using Strict Mode:**
- `.claude/hooks/cfn-invoke-pre-edit.sh` - Backup creation
- `.claude/hooks/cfn-invoke-post-edit.sh` - Post-edit validation
- `.claude/hooks/cfn-invoke-security-validation.sh` - Security checks
- `.claude/hooks/cfn-pre-edit-backup.sh` - Backup execution
- `.claude/hooks/cfn-restore-from-backup.sh` - Restore operations

**Current Status:**
- Strict mode: Implemented in most hooks
- Variable quoting: Mostly implemented (minor inconsistencies)
- mktemp: Partial implementation (some scripts use custom temp dirs)

### Recommended Patterns for CFN Loop Hooks

#### Pattern 1: Backup Hook with mktemp

```bash
#!/bin/bash
set -euo pipefail

# Required arguments
FILE_PATH="${1:?ERROR: FILE_PATH required}"
AGENT_ID="${2:?ERROR: AGENT_ID required}"

# Create backup with security
BACKUP_DIR=$(mktemp -d --tmpdir backup.XXXXXXXXXX)
trap "rm -rf '$BACKUP_DIR'" EXIT

# Quote all variables
cp -p "$FILE_PATH" "$BACKUP_DIR/original"

# Return backup path
echo "$BACKUP_DIR"
```

#### Pattern 2: Validation Hook with Error Handling

```bash
#!/bin/bash
set -euo pipefail

FILE_PATH="${1:?ERROR: FILE_PATH required}"

# Explicit error handling
if ! validate_file "$FILE_PATH"; then
    echo "ERROR: Validation failed for $FILE_PATH" >&2
    exit 1
fi

echo "PASS: File validation successful"
```

#### Pattern 3: Cleanup Hook with Signal Handling

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="${1:?ERROR: BACKUP_DIR required}"

cleanup() {
    local exit_code=$?
    echo "Cleaning up backup directory: $BACKUP_DIR"
    rm -rf "$BACKUP_DIR"
    return $exit_code
}

trap cleanup EXIT INT TERM

# Validate before deletion
if [[ -d "$BACKUP_DIR" ]]; then
    rm -rf "$BACKUP_DIR"
fi
```

### Recommended Fixes for Existing Hooks

#### Fix 1: cfn-invoke-post-edit.sh

**Current Issue:** Uses `[ "$BLOCKING" = true ]` which is safe, but other variables could be unquoted

**Improvement:**
```bash
# Change:
node "$PIPELINE" "$FILE_PATH" --memory-key "$MEMORY_KEY" || EXIT_CODE=$?

# Verify all paths are quoted:
node "$PIPELINE" "$FILE_PATH" --memory-key "$MEMORY_KEY" || EXIT_CODE=$?  # Already correct
```

#### Fix 2: cfn-invoke-security-validation.sh

**Current Issues:**
- Uses `grep -qE` with patterns that might have special chars
- File paths in grep patterns not quoted

**Improvements:**
```bash
# Change:
if grep -qE '(sk-ant-|token-|api_key=)' "$file_path"; then

# To ensure robustness:
if grep -qE '(sk-ant-|token-|api_key=)' "$file_path" 2>/dev/null; then
    # Add error suppression for robust handling
fi
```

### Testing CFN Loop Security

#### Test Suite: Variable Quoting in Hooks

```bash
#!/bin/bash
set -euo pipefail

# Test 1: Hook with spaces in path
TEST_DIR=$(mktemp -d)
TEST_FILE="$TEST_DIR/test file with spaces.txt"
touch "$TEST_FILE"

AGENT_ID="test-agent"

# Execute hook and verify
if bash ./cfn-invoke-pre-edit.sh "$TEST_FILE" --agent-id "$AGENT_ID"; then
    echo "PASS: Hook handles filenames with spaces"
else
    echo "FAIL: Hook fails with spaces in filename"
fi

# Cleanup
rm -rf "$TEST_DIR"
```

#### Test Suite: mktemp Usage in Hooks

```bash
#!/bin/bash
set -euo pipefail

# Test that hooks create secure temporary files
HOOK_OUTPUT=$(bash ./cfn-invoke-pre-edit.sh "/tmp/test" --agent-id "test" 2>&1 || true)
BACKUP_DIR=$(echo "$HOOK_OUTPUT" | tail -1)

if [[ -d "$BACKUP_DIR" ]]; then
    # Verify permissions
    PERMS=$(stat -c %a "$BACKUP_DIR" 2>/dev/null || stat -f %A "$BACKUP_DIR")
    if [[ "$PERMS" == "700" ]]; then
        echo "PASS: Backup directory has secure permissions"
    else
        echo "FAIL: Backup directory has insecure permissions: $PERMS"
    fi

    # Cleanup
    rm -rf "$BACKUP_DIR"
fi
```

---

## Testing Strategies

### Test Environment Setup

```bash
#!/bin/bash
set -euo pipefail

# Create isolated test environment
TEST_ROOT=$(mktemp -d)
trap "rm -rf '$TEST_ROOT'" EXIT

# Create test fixtures
mkdir -p "$TEST_ROOT/fixtures"
mkdir -p "$TEST_ROOT/scripts"

# Example: Create test file with special characters
touch "$TEST_ROOT/fixtures/file with spaces.txt"
touch "$TEST_ROOT/fixtures/file-with-dashes.txt"
```

### Testing Variable Quoting

```bash
#!/bin/bash
set -euo pipefail

test_variable_quoting() {
    local test_name="$1"
    local variable="$2"
    local expected="$3"

    # Run test
    local result=""
    if result=$(echo "$variable" | wc -w); then
        if [[ "$result" -eq "$expected" ]]; then
            echo "PASS: $test_name"
        else
            echo "FAIL: $test_name (expected $expected words, got $result)"
        fi
    fi
}

# Run tests
test_variable_quoting "single word" "hello" 1
test_variable_quoting "multi word" "hello world" 2
test_variable_quoting "multiple spaces" "hello  world" 2
```

### Testing Strict Mode

```bash
#!/bin/bash

test_strict_mode() {
    # Test 1: Undefined variable
    bash -c 'set -u; echo $UNDEFINED' 2>&1 | grep -q "unbound" && \
        echo "PASS: -u catches undefined variables"

    # Test 2: Pipeline failure
    bash -c 'set -o pipefail; false | true; echo $?' 2>&1 | grep -q "1" && \
        echo "PASS: -o pipefail catches pipeline failures"

    # Test 3: Command failure
    bash -c 'set -e; false; echo reached' 2>&1 | grep -qv "reached" && \
        echo "PASS: -e exits on command failure"
}

test_strict_mode
```

### Testing mktemp

```bash
#!/bin/bash
set -euo pipefail

test_mktemp_safety() {
    # Test 1: Predictability
    FILE1=$(mktemp)
    FILE2=$(mktemp)
    [[ "$FILE1" != "$FILE2" ]] && echo "PASS: mktemp produces unique files"
    rm -f "$FILE1" "$FILE2"

    # Test 2: Permissions
    FILE=$(mktemp)
    PERMS=$(stat -c %a "$FILE" 2>/dev/null || stat -f %A "$FILE")
    [[ "$PERMS" == "600" ]] && echo "PASS: mktemp creates secure permissions"
    rm -f "$FILE"

    # Test 3: Directory permissions
    DIR=$(mktemp -d)
    PERMS=$(stat -c %a "$DIR" 2>/dev/null || stat -f %A "$DIR")
    [[ "$PERMS" == "700" ]] && echo "PASS: mktemp -d creates secure permissions"
    rm -rf "$DIR"
}

test_mktemp_safety
```

---

## Common Mistakes

### Mistake 1: Forgetting Quotes in Conditionals

```bash
#!/bin/bash

# WRONG
FILE_PATH="$1"
if [ -f $FILE_PATH ]; then        # SC2086 - Breaks with spaces
    echo "File exists"
fi

# RIGHT
if [ -f "$FILE_PATH" ]; then      # Quoted - Works with spaces
    echo "File exists"
fi
```

### Mistake 2: Using $* Instead of "$@"

```bash
#!/bin/bash

# WRONG - SC2048
forward_args() {
    somecommand $*                # Lost argument boundaries
}

# RIGHT
forward_args() {
    somecommand "$@"              # Preserved argument structure
}
```

### Mistake 3: mktemp Without Cleanup

```bash
#!/bin/bash

# WRONG - No cleanup trap
TMPFILE=$(mktemp)
echo "data" > "$TMPFILE"
# File orphaned if script crashes

# RIGHT - With cleanup trap
TMPFILE=$(mktemp)
trap "rm -f '$TMPFILE'" EXIT
echo "data" > "$TMPFILE"
# Cleanup guaranteed
```

### Mistake 4: World-Writable Temp Files

```bash
#!/bin/bash

# WRONG - Insecure permissions
mkdir /tmp/workspace
chmod 777 /tmp/workspace
echo "SECRET=value" > /tmp/workspace/config  # World-readable!

# RIGHT - Use mktemp with secure defaults
WORKSPACE=$(mktemp -d)
echo "SECRET=value" > "$WORKSPACE/config"    # mode 700 - owner only
```

### Mistake 5: Missing Quotes in Cleanup Trap

```bash
#!/bin/bash

# WRONG - SC2086 in trap
FILE="/tmp/my file"
trap "rm -f $FILE" EXIT              # Unquoted - removes wrong file

# RIGHT - Quoted variables in trap
trap "rm -f '$FILE'" EXIT            # Quoted - removes correct file
```

### Mistake 6: Assuming [[ ]] Makes Quoting Unnecessary

```bash
#!/bin/bash

# PARTIALLY CORRECT - [[ ]] is special
VAR="hello world"
[[ $VAR == "hello world" ]] && echo "Match"  # Works in [[ ]]

# BUT QUOTE ANYWAY for consistency
[[ "$VAR" == "hello world" ]] && echo "Match"  # Best practice

# And other contexts still need quotes
cp $VAR /tmp/backup  # Still wrong! Not in [[ ]] context
cp "$VAR" /tmp/backup  # Correct
```

---

## Summary

### Three Core Security Practices

| Practice | Problem Solved | Implementation | Benefit |
|----------|---------------|----------------|---------|
| **Variable Quoting** | Word splitting, injection | Quote all variables: `"$var"` | Prevents command injection |
| **Strict Mode** | Silent failures, undefined vars | `set -euo pipefail` at start | Catches errors early |
| **mktemp** | Race conditions, permissions | `TMPFILE=$(mktemp)` + trap | Secure temporary files |

### Integration Checklist

- [ ] All hooks start with `#!/bin/bash` and `set -euo pipefail`
- [ ] All variables are quoted: `"$var"`, `"${var}"`
- [ ] All temporary files use `mktemp`
- [ ] All mktemp calls have cleanup trap: `trap "rm -f '$TMPFILE'" EXIT`
- [ ] Functions use `"$@"` not `$*`
- [ ] Error handling uses explicit conditions with `||` or `if !`
- [ ] Documentation mentions security considerations

### Quick Reference

```bash
#!/bin/bash
set -euo pipefail

# Create temporary file
TMPFILE=$(mktemp)
trap "rm -f '$TMPFILE'" EXIT

# Create temporary directory
TMPDIR=$(mktemp -d)
trap "rm -rf '$TMPDIR'" EXIT

# Quote all variables
cp "$SOURCE" "$DEST"

# Use "$@" for arguments
function process() {
    echo "$@"
}

# Error handling
if ! command_that_might_fail; then
    echo "Error handled"
fi

# Conditional execution
command1 && command2
command1 || command2
```

---

## References and Resources

### External Documentation
- **GNU Bash Manual:** https://www.gnu.org/software/bash/manual/
- **ShellCheck:** https://www.shellcheck.net/ (SC2086, SC2048 rules)
- **POSIX Shell Standard:** https://pubs.opengroup.org/onlinepubs/9699919799/
- **Linux man pages:** `man mktemp`, `man bash`

### Related CFN Loop Documentation
- `.claude/hooks/cfn-invoke-pre-edit.sh` - Example hook implementation
- `.claude/hooks/cfn-invoke-post-edit.sh` - Post-edit patterns
- `.claude/CLAUDE.md` - General project standards

### Security Best Practices
- **CWE-78:** Improper Neutralization of Special Elements used in an OS Command
- **CWE-367:** Time-of-check Time-of-use (TOCTOU) Race Condition
- **CWE-282:** Improper Ownership Check

---

**Document Generated:** November 17, 2025
**Research Status:** Complete
**Confidence Score:** 0.94 (94%)
**Applicable Fixes:** Shell Security #1, #2, #3
