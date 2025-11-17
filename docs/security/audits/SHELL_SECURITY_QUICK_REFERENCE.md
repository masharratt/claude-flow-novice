# Shell Scripting Security - Quick Reference

**For developers implementing shell security fixes in CFN Loop**

---

## Three Critical Rules

### Rule 1: Quote Variables

```bash
# WRONG - SC2086
cp $FILE /backup
rm -f $TMPFILE

# RIGHT
cp "$FILE" /backup
rm -f "$TMPFILE"

# Exception: [[ ]] conditionals (safe without quotes)
[[ $var == pattern ]]  # OK
```

### Rule 2: Strict Mode

```bash
#!/bin/bash
set -euo pipefail

# What it does:
# -e: Exit on any error
# -u: Exit if variable undefined
# -o pipefail: Pipeline fails if any command fails
```

### Rule 3: Use mktemp

```bash
# WRONG - Predictable filename
TMPFILE="/tmp/myapp_$$.tmp"

# RIGHT - Secure
TMPFILE=$(mktemp)
trap "rm -f '$TMPFILE'" EXIT
```

---

## Pattern Reference

### Pattern: Backup Hook

```bash
#!/bin/bash
set -euo pipefail

FILE_PATH="$1"
AGENT_ID="$2"

BACKUP_DIR=$(mktemp -d)
trap "rm -rf '$BACKUP_DIR'" EXIT

cp -p "$FILE_PATH" "$BACKUP_DIR/original"
echo "$BACKUP_DIR"
```

### Pattern: Function with Error Handling

```bash
#!/bin/bash
set -euo pipefail

safe_operation() {
    if ! "$@"; then
        echo "Operation failed: $*" >&2
        return 1
    fi
}

safe_operation important_command
```

### Pattern: Signal Handling

```bash
#!/bin/bash
set -euo pipefail

TMPFILE=$(mktemp)

cleanup() {
    local exit_code=$?
    rm -f "$TMPFILE"
    return $exit_code
}

trap cleanup EXIT INT TERM
```

---

## ShellCheck Rules Summary

| Rule | Issue | Fix |
|------|-------|-----|
| **SC2086** | Unquoted `$var` | Quote: `"$var"` |
| **SC2048** | Use `$*` | Use: `"$@"` |
| **SC2181** | Check `$?` after command | Use: `if ! command;` |
| **SC2029** | Quotes in SSH | Quote carefully |

---

## Common Pitfalls

| Pitfall | Example | Fix |
|---------|---------|-----|
| Spaces in filename | `cp $file /tmp` | `cp "$file" /tmp` |
| Lost arguments | `process $*` | `process "$@"` |
| No cleanup | `TMPFILE=$(mktemp)` | Add `trap` handler |
| Silent failures | `cat file \| grep x` | Add `set -o pipefail` |
| Undefined variables | `echo $TYPO` | Add `set -u` |

---

## Testing Checklist

- [ ] All variables quoted: `grep -n '\$[A-Z]' script.sh`
- [ ] Strict mode enabled: `grep '^set -euo' script.sh`
- [ ] mktemp used: `grep -n 'mktemp' script.sh`
- [ ] Cleanup traps set: `grep -n 'trap.*EXIT' script.sh`
- [ ] ShellCheck clean: `shellcheck script.sh`

---

## One-Minute Fix Guide

### Fix 1: Quote Variables

```bash
# Find: grep -E '\$[A-Z_]' hook.sh
# Replace unquoted with quoted
sed -i 's/\$\([A-Z_][A-Z_0-9]*\)/"\$\1"/g' hook.sh
```

### Fix 2: Add Strict Mode

```bash
# Add after #!/bin/bash
sed -i '2i set -euo pipefail' hook.sh
```

### Fix 3: Use mktemp

```bash
# Replace predictable with mktemp
sed -i 's|/tmp/myapp_\$\$\.tmp|$(mktemp)|' hook.sh
# Add cleanup trap
sed -i '3a trap "rm -f '\''$TMPFILE'\''" EXIT' hook.sh
```

---

## Validation Commands

```bash
# Check strict mode
grep '^set -euo pipefail' *.sh

# Check variable quoting (shows problems)
grep -n '\$[A-Z_]' *.sh | grep -v '"\$'

# Check mktemp usage
grep -l 'mktemp' *.sh

# Check cleanup traps
grep 'trap.*EXIT' *.sh

# Full ShellCheck validation (if installed)
shellcheck *.sh
```

---

## Integration Points

### For cfn-invoke-pre-edit.sh
- ✅ Uses `set -euo pipefail`
- ✅ Quotes all file paths
- Need: mktemp for backup directory

### For cfn-invoke-post-edit.sh
- ✅ Uses `set -euo pipefail`
- ✅ Quotes variables
- Need: mktemp for temp files

### For cfn-invoke-security-validation.sh
- ✅ Uses `set -euo pipefail`
- Need: Quote grep patterns
- Need: Error handling for missing files

---

## Emergency Checklist

**Before deploying any shell hook:**

1. [ ] `#!/bin/bash` at top
2. [ ] `set -euo pipefail` on line 2
3. [ ] All variables quoted: `"$var"`
4. [ ] mktemp used for temp files
5. [ ] `trap "cleanup" EXIT` for cleanup
6. [ ] No ShellCheck warnings
7. [ ] Tested with special characters in paths
8. [ ] Error messages go to stderr: `echo "error" >&2`

---

## Real Example: Before and After

### BEFORE (Vulnerable)

```bash
#!/bin/bash
FILE=$1
TMPFILE="/tmp/backup_$$.tmp"
cp $FILE $TMPFILE
grep pattern $TMPFILE
rm $TMPFILE
```

**Problems:**
- SC2086: Unquoted variables
- Predictable temp filename
- No cleanup trap
- No error handling

### AFTER (Secure)

```bash
#!/bin/bash
set -euo pipefail

FILE="$1"
TMPFILE=$(mktemp)
trap "rm -f '$TMPFILE'" EXIT

cp "$FILE" "$TMPFILE"
grep pattern "$TMPFILE"
# Cleanup automatic via trap
```

**Improvements:**
- Strict mode enabled
- All variables quoted
- mktemp used
- Automatic cleanup
- Error handling

---

## References

- Full guide: `docs/SHELL_SECURITY_BEST_PRACTICES.md`
- ShellCheck: https://www.shellcheck.net/
- Bash manual: https://www.gnu.org/software/bash/manual/

---

**Last Updated:** November 17, 2025
**Applicable To:** CFN Loop Shell Security Fixes #1, #2, #3
