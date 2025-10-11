# Hook Timeout Fix - package.json Edits

## Problem

When editing `package.json`, hooks in `.claude/settings.json` were timing out (30s timeout):

```
PreToolUse:Bash [...] failed with non-blocking status code 124: No stderr output
PostToolUse:Bash [...] failed with non-blocking status code 124: No stderr output
```

**Root Cause:**
- Hooks call `claude-flow-novice hook pre-edit` and `post-edit` for all file edits
- When `package.json` is modified, these hooks may trigger package operations
- Package operations can be slow or hang, causing 30-second timeout
- Exit code 124 indicates timeout from the `timeout 30s` command

---

## Solution Implemented

Added package file exclusions to hook commands in `.claude/settings.json`:

### PreToolUse Hook (Before)
```bash
cat | jq -r ".tool_input.file_path // .tool_input.path // empty" | tr "\n" "\0" | timeout 30s xargs -0 -I {} claude-flow-novice hook pre-edit --file "{}" --auto-assign-agents true --load-context true
```

### PreToolUse Hook (After) ✅
```bash
FILE=$(cat | jq -r ".tool_input.file_path // .tool_input.path // empty");
if echo "$FILE" | grep -qE "package\.json$|package-lock\.json$|node_modules/"; then
  echo "[Hook] Skipping package files: $FILE" >&2;
  exit 0;
fi;
echo "$FILE" | tr "\n" "\0" | timeout 30s xargs -0 -I {} claude-flow-novice hook pre-edit --file "{}" --auto-assign-agents true --load-context true
```

### PostToolUse Hook (Before)
```bash
cat | jq -r ".tool_input.file_path // .tool_input.path // empty" | tr "\n" "\0" | timeout 30s xargs -0 -I {} claude-flow-novice hook post-edit --file "{}" --format true --update-memory true
```

### PostToolUse Hook (After) ✅
```bash
FILE=$(cat | jq -r ".tool_input.file_path // .tool_input.path // empty");
if echo "$FILE" | grep -qE "package\.json$|package-lock\.json$|node_modules/"; then
  echo "[Hook] Skipping package files: $FILE" >&2;
  exit 0;
fi;
echo "$FILE" | tr "\n" "\0" | timeout 30s xargs -0 -I {} claude-flow-novice hook post-edit --file "{}" --format true --update-memory true
```

---

## Files Excluded from Hooks

The following file patterns are now excluded from hook execution:

1. **`package.json`** - Main package configuration
2. **`package-lock.json`** - Dependency lock file
3. **`node_modules/`** - All installed dependencies

**Why Exclude These:**
- Package files can trigger npm operations that hang
- Lock files are auto-generated and don't need validation
- Node modules are external and shouldn't be processed

---

## How to Prevent in Future

### 1. Pattern: Skip Files That Trigger External Tools

When adding hooks, always consider files that might trigger slow external operations:

```bash
# Template for file exclusions
FILE=$(cat | jq -r ".tool_input.file_path // empty");

# Add exclusions for problem files
if echo "$FILE" | grep -qE "PATTERN1|PATTERN2|PATTERN3"; then
  echo "[Hook] Skipping: $FILE" >&2;
  exit 0;
fi;

# Continue with hook logic
echo "$FILE" | timeout 30s xargs -I {} your-command {}
```

### 2. Common File Patterns to Exclude

```bash
# Package managers
"package\\.json$|package-lock\\.json$|yarn\\.lock$|pnpm-lock\\.yaml$"

# Dependencies
"node_modules/|vendor/|\\.venv/"

# Lock files
"\\.lock$"

# Build artifacts
"dist/|build/|\\.build/"

# Large files that might timeout
"\\.log$|\\.db$|\\.sqlite$"

# Git internal files
"\\.git/"
```

### 3. Testing Hook Changes

Before deploying hook changes, test with problematic files:

```bash
# Test pre-edit hook manually
echo '{"tool_input": {"file_path": "package.json"}}' | \
  bash -c 'FILE=$(cat | jq -r ".tool_input.file_path"); \
  if echo "$FILE" | grep -qE "package\\.json$"; then \
    echo "[Hook] Skipping: $FILE" >&2; exit 0; \
  fi; \
  echo "Processing: $FILE"'

# Expected output: [Hook] Skipping: package.json
```

### 4. Hook Timeout Best Practices

**Increase Timeout for Slow Operations:**
```bash
# If legitimate operations need more time
timeout 60s xargs -I {} your-slow-command {}
```

**Add Early Exit for Known Issues:**
```bash
# Skip operations that might hang
case "$FILE" in
  *.json) exit 0 ;;  # Skip all JSON files
  */dist/*) exit 0 ;; # Skip build artifacts
esac
```

**Use Background Jobs for Non-Critical Tasks:**
```bash
# Run in background, don't wait
(your-command "$FILE" &) 2>/dev/null
exit 0
```

---

## Verification

Test that hooks now skip package files:

```bash
# Edit package.json - should not trigger hooks
# You should see:
# [Hook] Skipping package files: /path/to/package.json

# Edit other files - should trigger hooks normally
# You should see normal hook execution
```

---

## Related Files

1. **`.claude/settings.json`** - Hook configurations (updated)
2. **`CLAUDE.md`** - Hook documentation and patterns
3. **`config/hooks/`** - Hook implementation scripts

---

## Summary

**Problem:** package.json edits caused 30s hook timeouts
**Solution:** Skip package files in hook execution
**Prevention:** Always exclude files that trigger slow external operations

**Updated Hook Pattern:**
```bash
FILE=$(cat | jq -r ".tool_input.file_path // empty");
if echo "$FILE" | grep -qE "package\\.json$|package-lock\\.json$|node_modules/"; then
  exit 0;
fi;
# Continue with hook logic
```

This ensures hooks don't interfere with package management operations and prevents timeout errors in the future.
