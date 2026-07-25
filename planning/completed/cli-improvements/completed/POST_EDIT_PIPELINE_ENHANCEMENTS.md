# Post-Edit Pipeline Enhancements - Handoff Documentation

> ## STATUS: SUPERSEDED 2026-07-25. THE VALIDATORS THIS PLAN SHIPPED ARE GONE.
>
> This is the original 2025-11-04 handoff plan. It was implemented (`ec9c69585`,
> `938d96e60`) into `.claude/skills/hook-pipeline/`, and that directory was
> deleted the next day, 2025-11-05, in `304584e0b` as collateral in a bulk skill
> cleanup. The `validatorsByExtension` table in
> `.claude/hooks/post-edit-pipeline.js` was never updated, so every dispatch
> silently pointed at a missing file until 2026-07-25, when all ten entries were
> dropped.
>
> **Removed and deliberately NOT restored (10):** `bash-pipe-safety.sh`,
> `bash-dependency-checker.sh`, `enforce-lf.sh`, `python-subprocess-safety.py`,
> `python-async-safety.py`, `python-import-checker.py`, `js-promise-safety.sh`,
> `rust-command-safety.sh`, `rust-future-safety.sh`,
> `rust-dependency-checker.sh`.
>
> **What replaced them**
> - Shell checks (Enhancements 1 and 4 below) -> **shellcheck**, run by the
>   pipeline for `.sh`/`.bash`, non-blocking (warning bucket, exit 10). System
>   binary, not an npm dependency; absent shellcheck is reported as skipped.
> - Line endings (Enhancement 3, `enforce-lf.sh`) -> `* text=auto eol=lf` in
>   `.gitattributes`. A `sed -i` rewrite mid-edit was the wrong layer.
> - Promise safety (Enhancement 2) -> ESLint `plugin:promise/recommended` and
>   `@typescript-eslint/no-floating-promises` in `.eslintrc.json`.
> - Rust checks -> `cargo clippy` plus the pipeline's `.rs` quality block.
>
> Full rationale table:
> `docs/implementation/technical-implementation/POST_EDIT_VALIDATORS.md`.
> Treat the sections below as design history, not as a build instruction.

**Created**: 2025-11-04
**Status**: Superseded 2026-07-25 (see banner)
**Purpose**: Generic code quality checks to prevent production bugs
**Languages**: Bash, JavaScript/TypeScript, Python, Rust
**Priority**: High (prevents 75% of recently discovered bugs)

---

## Executive Summary

This document provides implementation guidance for post-edit pipeline enhancements that catch common production bugs **at write time** rather than runtime. These checks are language-agnostic patterns extracted from real debugging sessions.

**Impact**: Prevents pipe deadlocks, unhandled promises, line ending issues, and missing dependencies across all languages.

---

## Issue 1: Pipe Commands Without Error Handling

### Context
Commands in pipes without stderr redirection cause process hangs when:
- Script uses `set -o pipefail`
- Command writes to stderr
- Downstream command waits for pipe closure
- stderr remains open → infinite blocking

### Real-World Example
```bash
# ❌ BAD - Hangs indefinitely
if redis-cli keys "$pattern" | grep -q "."; then

# ✅ GOOD - Completes immediately
if redis-cli keys "$pattern" 2>/dev/null | grep -q "."; then
```

---

## Enhancement 1: Pipe Safety Validator

### Bash Implementation

**File**: `.claude/skills/hook-pipeline/bash-pipe-safety.sh`

```bash
#!/usr/bin/env bash
# Validates pipe safety in bash scripts
# Detects commands in pipes without stderr redirect when using set -o pipefail

set -euo pipefail

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  exit 0
fi

# Only check bash/shell scripts
if [[ ! "$FILE" =~ \.(sh|bash)$ ]]; then
  exit 0
fi

# Check if script uses pipefail
if ! grep -q "set.*pipefail" "$FILE"; then
  exit 0  # No pipefail, no issue
fi

# Commands that commonly write to stderr
RISKY_COMMANDS=(
  "redis-cli"
  "curl"
  "wget"
  "npm"
  "docker"
  "git"
  "mysql"
  "psql"
  "python"
  "node"
)

# Check for unsafe pipe patterns
ISSUES_FOUND=0
for cmd in "${RISKY_COMMANDS[@]}"; do
  # Find command in pipes without stderr redirect
  if grep -E "${cmd}\s+.*\|" "$FILE" | grep -v '2>/dev/null' | grep -v '2>&1'; then
    if [ $ISSUES_FOUND -eq 0 ]; then
      echo "⚠️  Pipe Safety Warning: Commands in pipes without stderr redirect"
      echo ""
    fi

    grep -nE "${cmd}\s+.*\|" "$FILE" | grep -v '2>/dev/null' | grep -v '2>&1' | while IFS=: read line_num content; do
      echo "   Line $line_num: ${content}"
    done

    ((ISSUES_FOUND++))
  fi
done

if [ $ISSUES_FOUND -gt 0 ]; then
  echo ""
  echo "   Recommendation: Add '2>/dev/null' or '2>&1' before pipe operator"
  echo "   Reason: Prevents pipe buffering deadlock with 'set -o pipefail'"
  echo ""
  exit 2  # Non-blocking warning
fi

exit 0
```

### Python Equivalent

**File**: `.claude/skills/hook-pipeline/python-subprocess-safety.py`

```python
#!/usr/bin/env python3
"""
Validates subprocess safety in Python scripts
Detects subprocess calls without stderr handling
"""

import sys
import re
from pathlib import Path

def check_subprocess_safety(file_path: Path) -> int:
    """Check Python file for unsafe subprocess usage"""

    if not file_path.suffix == '.py':
        return 0

    content = file_path.read_text()

    # Patterns that indicate subprocess usage
    unsafe_patterns = [
        # subprocess.run without stderr
        r'subprocess\.run\([^)]+\)',
        r'subprocess\.Popen\([^)]+\)',
        r'subprocess\.check_output\([^)]+\)',
        r'os\.popen\([^)]+\)',
    ]

    issues = []
    for line_num, line in enumerate(content.splitlines(), 1):
        for pattern in unsafe_patterns:
            if re.search(pattern, line):
                # Check if stderr is handled
                if 'stderr=' not in line and 'PIPE' not in line:
                    issues.append((line_num, line.strip()))

    if issues:
        print("⚠️  Subprocess Safety Warning: Missing stderr handling")
        print()
        for line_num, line in issues:
            print(f"   Line {line_num}: {line}")
        print()
        print("   Recommendation: Add stderr=subprocess.PIPE or stderr=subprocess.DEVNULL")
        print("   Reason: Prevents process blocking on stderr buffer")
        print()
        return 2  # Non-blocking warning

    return 0

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(0)

    file_path = Path(sys.argv[1])
    if not file_path.exists():
        sys.exit(0)

    sys.exit(check_subprocess_safety(file_path))
```

### Rust Equivalent

**File**: `.claude/skills/hook-pipeline/rust-command-safety.sh`

```bash
#!/usr/bin/env bash
# Validates Command safety in Rust code
# Detects Command::new() without stderr handling

set -euo pipefail

FILE="${1:-}"
if [[ ! "$FILE" =~ \.rs$ ]]; then
  exit 0
fi

# Check for Command::new() without stderr handling
ISSUES=$(grep -n "Command::new" "$FILE" | while IFS=: read line_num content; do
  # Get next 5 lines after Command::new
  CONTEXT=$(sed -n "${line_num},$((line_num + 5))p" "$FILE")

  # Check if stderr is configured
  if ! echo "$CONTEXT" | grep -qE "(stderr|Stdio)"; then
    echo "$line_num:$content"
  fi
done)

if [ -n "$ISSUES" ]; then
  echo "⚠️  Command Safety Warning: Missing stderr handling in Rust Command"
  echo ""
  echo "$ISSUES" | while IFS=: read line_num content; do
    echo "   Line $line_num: ${content}"
  done
  echo ""
  echo "   Recommendation: Add .stderr(Stdio::piped()) or .stderr(Stdio::null())"
  echo "   Reason: Prevents process blocking on stderr buffer"
  echo ""
  exit 2
fi

exit 0
```

---

## Enhancement 2: Unhandled Promise/Future Detection

### Context
Async functions called without proper error handling cause:
- Process hangs (event loop keeps running)
- Silent failures
- Memory leaks

### Real-World Example
```javascript
// ❌ BAD - Unhandled promise
if (import.meta.url === `file://${__filename}`) {
  initializeCfnProject();  // Returns promise but not handled
}

// ✅ GOOD - Promise handled
if (import.meta.url === `file://${__filename}`) {
  initializeCfnProject().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}
```

---

## Enhancement 2A: JavaScript/TypeScript - ESLint Configuration

**File**: `.eslintrc.json` (add to existing config)

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:promise/recommended"
  ],
  "plugins": [
    "@typescript-eslint",
    "promise"
  ],
  "rules": {
    // Unhandled Promise Detection
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "promise/catch-or-return": "error",
    "promise/always-return": "warn",
    "promise/no-nesting": "warn",

    // Async/Await Best Practices
    "no-async-promise-executor": "error",
    "require-atomic-updates": "error",

    // Prevent common mistakes
    "no-return-await": "error",
    "@typescript-eslint/await-thenable": "error"
  }
}
```

**Manual Check Script**: `.claude/skills/hook-pipeline/js-promise-safety.sh`

```bash
#!/usr/bin/env bash
# Manual check for unhandled promises (fallback if ESLint not available)

set -euo pipefail

FILE="${1:-}"
if [[ ! "$FILE" =~ \.(js|ts|mjs|cjs)$ ]]; then
  exit 0
fi

# Check for async function calls without await/catch/then
UNHANDLED=$(grep -nE '\w+\(\)' "$FILE" | while IFS=: read line_num content; do
  # Skip if line contains await, catch, or then
  if echo "$content" | grep -qE '(await|\.catch|\.then|return)'; then
    continue
  fi

  # Check if this might be an async function call
  FUNC_NAME=$(echo "$content" | grep -oE '\w+\(\)' | head -1 | sed 's/()//')

  # Check if function is async (simple heuristic)
  if grep -qE "async (function|const|let|var) ${FUNC_NAME}" "$FILE"; then
    echo "$line_num:$content"
  fi
done)

if [ -n "$UNHANDLED" ]; then
  echo "⚠️  Promise Safety Warning: Potential unhandled async calls"
  echo ""
  echo "$UNHANDLED" | while IFS=: read line_num content; do
    echo "   Line $line_num: ${content}"
  done
  echo ""
  echo "   Recommendation: Add 'await' or '.catch()' to handle promise"
  echo "   Better: Run ESLint with @typescript-eslint/no-floating-promises"
  echo ""
  exit 2
fi

exit 0
```

### Python Equivalent

**File**: `.claude/skills/hook-pipeline/python-async-safety.py`

```python
#!/usr/bin/env python3
"""
Validates async/await safety in Python scripts
Detects async function calls without await
"""

import sys
import ast
from pathlib import Path
from typing import List, Tuple

class AsyncCallChecker(ast.NodeVisitor):
    def __init__(self):
        self.issues: List[Tuple[int, str]] = []
        self.async_functions = set()

    def visit_AsyncFunctionDef(self, node):
        """Track async function definitions"""
        self.async_functions.add(node.name)
        self.generic_visit(node)

    def visit_Call(self, node):
        """Check function calls for async without await"""
        if isinstance(node.func, ast.Name):
            func_name = node.func.id

            # Check if calling async function without await
            if func_name in self.async_functions:
                # Check if parent is not Await
                if not isinstance(getattr(node, 'parent', None), ast.Await):
                    self.issues.append((
                        node.lineno,
                        f"Async function '{func_name}()' called without await"
                    ))

        self.generic_visit(node)

def check_async_safety(file_path: Path) -> int:
    """Check Python file for unsafe async usage"""

    if not file_path.suffix == '.py':
        return 0

    try:
        content = file_path.read_text()
        tree = ast.parse(content)

        # Add parent references
        for parent in ast.walk(tree):
            for child in ast.iter_child_nodes(parent):
                child.parent = parent

        checker = AsyncCallChecker()
        checker.visit(tree)

        if checker.issues:
            print("⚠️  Async Safety Warning: Async calls without await")
            print()
            for line_num, message in checker.issues:
                print(f"   Line {line_num}: {message}")
            print()
            print("   Recommendation: Add 'await' before async function calls")
            print("   Alternative: Use asyncio.create_task() for background tasks")
            print()
            return 2

    except SyntaxError:
        pass  # Ignore syntax errors (handled by other tools)

    return 0

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(0)

    file_path = Path(sys.argv[1])
    if not file_path.exists():
        sys.exit(0)

    sys.exit(check_async_safety(file_path))
```

### Rust Equivalent

**File**: `.claude/skills/hook-pipeline/rust-future-safety.sh`

```bash
#!/usr/bin/env bash
# Validates Future safety in Rust code
# Detects async fn calls without .await

set -euo pipefail

FILE="${1:-}"
if [[ ! "$FILE" =~ \.rs$ ]]; then
  exit 0
fi

# This is a heuristic check - proper validation needs cargo clippy
# Check for function calls that might return Future without .await

ISSUES=$(grep -nE 'async fn \w+' "$FILE" | while IFS=: read line_num content; do
  FUNC_NAME=$(echo "$content" | grep -oE 'async fn \w+' | sed 's/async fn //' | sed 's/(.*//')

  # Search for calls to this function without .await
  grep -n "${FUNC_NAME}(" "$FILE" | grep -v '\.await' | while IFS=: read call_line call_content; do
    # Skip the definition line
    if [ "$call_line" != "$line_num" ]; then
      echo "$call_line:$call_content"
    fi
  done
done)

if [ -n "$ISSUES" ]; then
  echo "⚠️  Future Safety Warning: Async function calls without .await"
  echo ""
  echo "$ISSUES" | while IFS=: read line_num content; do
    echo "   Line $line_num: ${content}"
  done
  echo ""
  echo "   Recommendation: Add '.await' after async function calls"
  echo "   Better: Run 'cargo clippy' for comprehensive async validation"
  echo ""
  exit 2
fi

exit 0
```

**Better Rust Solution**: Use `cargo clippy`

```toml
# .cargo/config.toml
[target.'cfg(all())']
rustflags = ["-W", "clippy::unused_async", "-W", "clippy::future_not_send"]
```

---

## Enhancement 3: Line Ending Enforcement

### Context
CRLF (Windows) line endings cause "command not found" errors in Linux/WSL2 environments.

### Universal Line Ending Fixer

**File**: `.claude/skills/hook-pipeline/enforce-lf.sh`

```bash
#!/usr/bin/env bash
# Enforces LF line endings (converts CRLF → LF automatically)
# Works for all text files

set -euo pipefail

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  exit 0
fi

# Check if file is binary
if file "$FILE" | grep -qE "(executable|binary|data)"; then
  exit 0
fi

# Check for CRLF line endings
if file "$FILE" | grep -q "CRLF"; then
  echo "⚠️  Line Ending Issue: CRLF detected in $FILE"
  echo "   Converting CRLF → LF..."

  # Convert line endings
  sed -i 's/\r$//' "$FILE"

  echo "   ✅ Converted to LF (Unix format)"
  echo ""

  # Non-blocking (auto-fixed)
  exit 0
fi

exit 0
```

### Python Alternative

```python
#!/usr/bin/env python3
"""Auto-fix line endings to LF"""

import sys
from pathlib import Path

def fix_line_endings(file_path: Path) -> int:
    try:
        content = file_path.read_bytes()

        if b'\r\n' in content:
            print(f"⚠️  Converting CRLF → LF: {file_path}")
            fixed = content.replace(b'\r\n', b'\n')
            file_path.write_bytes(fixed)
            print("   ✅ Line endings fixed")
            return 0

    except Exception:
        pass

    return 0

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(0)

    sys.exit(fix_line_endings(Path(sys.argv[1])))
```

---

## Enhancement 4: Dependency Validator

### Context
Scripts reference other scripts/modules that don't exist, causing runtime errors.

### Bash Script Dependency Checker

**File**: `.claude/skills/hook-pipeline/bash-dependency-checker.sh`

```bash
#!/usr/bin/env bash
# Validates bash script dependencies
# Detects referenced scripts that don't exist

set -euo pipefail

FILE="${1:-}"
if [[ ! "$FILE" =~ \.sh$ ]]; then
  exit 0
fi

SCRIPT_DIR=$(dirname "$FILE")
ISSUES_FOUND=0

# Extract script references (source, ., or direct paths)
grep -oE '(source|\.)\s+[^[:space:]]+\.sh|["\x27]?\./[^[:space:]"'\'']+\.sh["\x27]?' "$FILE" | \
  sed 's/source //; s/\. //; s/["'\''"]//g' | \
  sort -u | \
while read -r REFERENCED_SCRIPT; do
  # Try to resolve path
  if [[ "$REFERENCED_SCRIPT" =~ ^\.\. ]]; then
    FULL_PATH="$SCRIPT_DIR/$REFERENCED_SCRIPT"
  elif [[ "$REFERENCED_SCRIPT" =~ ^\. ]]; then
    FULL_PATH="${REFERENCED_SCRIPT#./}"
  else
    FULL_PATH="$REFERENCED_SCRIPT"
  fi

  # Check if script exists
  if [ ! -f "$FULL_PATH" ]; then
    if [ $ISSUES_FOUND -eq 0 ]; then
      echo "❌ Dependency Error: Referenced scripts not found"
      echo ""
    fi

    echo "   Missing: $REFERENCED_SCRIPT"
    echo "   Expected at: $FULL_PATH"
    ((ISSUES_FOUND++))
  fi
done

if [ $ISSUES_FOUND -gt 0 ]; then
  echo ""
  echo "   Recommendation: Create missing scripts or fix paths"
  echo ""
  exit 1  # Blocking error
fi

exit 0
```

### Python Import Validator

**File**: `.claude/skills/hook-pipeline/python-import-checker.py`

```python
#!/usr/bin/env python3
"""
Validates Python imports
Detects imports that don't exist in the project
"""

import sys
import ast
import importlib.util
from pathlib import Path
from typing import Set

def check_imports(file_path: Path) -> int:
    """Check if all imports can be resolved"""

    if not file_path.suffix == '.py':
        return 0

    try:
        content = file_path.read_text()
        tree = ast.parse(content)

        missing_imports = set()

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if not can_import(alias.name):
                        missing_imports.add(alias.name)

            elif isinstance(node, ast.ImportFrom):
                if node.module and not can_import(node.module):
                    missing_imports.add(node.module)

        if missing_imports:
            print("⚠️  Import Warning: Potentially missing dependencies")
            print()
            for module in sorted(missing_imports):
                print(f"   Missing: {module}")
            print()
            print("   Recommendation: Install missing packages or check spelling")
            print("   Note: May be false positives for optional dependencies")
            print()
            return 2  # Non-blocking warning

    except SyntaxError:
        pass

    return 0

def can_import(module_name: str) -> bool:
    """Check if module can be imported"""
    try:
        spec = importlib.util.find_spec(module_name)
        return spec is not None
    except (ImportError, ModuleNotFoundError, ValueError):
        return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(0)

    file_path = Path(sys.argv[1])
    if not file_path.exists():
        sys.exit(0)

    sys.exit(check_imports(file_path))
```

### Rust Dependency Checker

**File**: `.claude/skills/hook-pipeline/rust-dependency-checker.sh`

```bash
#!/usr/bin/env bash
# Validates Rust dependencies
# Checks if 'use' statements reference existing crates

set -euo pipefail

FILE="${1:-}"
if [[ ! "$FILE" =~ \.rs$ ]]; then
  exit 0
fi

# Check if Cargo.toml exists
if [ ! -f "Cargo.toml" ]; then
  exit 0
fi

# Extract crate names from use statements
USED_CRATES=$(grep -oE '^use \w+::' "$FILE" | sed 's/use //; s/::$//' | sort -u)

# Get dependencies from Cargo.toml
DECLARED_DEPS=$(grep -A 100 '^\[dependencies\]' Cargo.toml | \
                grep -E '^\w+ =' | \
                sed 's/ =.*//')

MISSING=()
while IFS= read -r crate; do
  # Skip std and built-in crates
  if [[ "$crate" =~ ^(std|core|alloc)$ ]]; then
    continue
  fi

  # Check if declared in Cargo.toml
  if ! echo "$DECLARED_DEPS" | grep -q "^${crate}$"; then
    MISSING+=("$crate")
  fi
done <<< "$USED_CRATES"

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "⚠️  Dependency Warning: Crates used but not declared in Cargo.toml"
  echo ""
  for crate in "${MISSING[@]}"; do
    echo "   Missing: $crate"
  done
  echo ""
  echo "   Recommendation: Add to [dependencies] in Cargo.toml"
  echo "   Note: May be false positives for local modules"
  echo ""
  exit 2
fi

exit 0
```

---

## Integration Guide

### Step 1: Add Validators to Post-Edit Hook

**File**: `.claude/hooks/cfn-invoke-post-edit.sh` (modify existing)

```bash
# After line where hook calls other checks, add:

# Language-specific safety checks
case "$FILE_EXT" in
  sh|bash)
    ./.claude/skills/hook-pipeline/bash-pipe-safety.sh "$FILE_PATH" || WARNING_COUNT=$((WARNING_COUNT + 1))
    ./.claude/skills/hook-pipeline/bash-dependency-checker.sh "$FILE_PATH" || ERROR_COUNT=$((ERROR_COUNT + 1))
    ;;

  js|ts|mjs|cjs)
    # ESLint handles promise safety (if configured)
    # Fallback manual check:
    ./.claude/skills/hook-pipeline/js-promise-safety.sh "$FILE_PATH" || WARNING_COUNT=$((WARNING_COUNT + 1))
    ;;

  py)
    ./.claude/skills/hook-pipeline/python-subprocess-safety.py "$FILE_PATH" || WARNING_COUNT=$((WARNING_COUNT + 1))
    ./.claude/skills/hook-pipeline/python-async-safety.py "$FILE_PATH" || WARNING_COUNT=$((WARNING_COUNT + 1))
    ./.claude/skills/hook-pipeline/python-import-checker.py "$FILE_PATH" || WARNING_COUNT=$((WARNING_COUNT + 1))
    ;;

  rs)
    ./.claude/skills/hook-pipeline/rust-command-safety.sh "$FILE_PATH" || WARNING_COUNT=$((WARNING_COUNT + 1))
    ./.claude/skills/hook-pipeline/rust-future-safety.sh "$FILE_PATH" || WARNING_COUNT=$((WARNING_COUNT + 1))
    ./.claude/skills/hook-pipeline/rust-dependency-checker.sh "$FILE_PATH" || WARNING_COUNT=$((WARNING_COUNT + 1))
    ;;
esac

# Universal checks (all file types)
./.claude/skills/hook-pipeline/enforce-lf.sh "$FILE_PATH" || true  # Auto-fix, don't fail
```

### Step 2: Configure ESLint (JavaScript/TypeScript)

```bash
# Install required packages
npm install --save-dev \
  eslint-plugin-promise \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser

# Update .eslintrc.json (see Enhancement 2A above)
```

### Step 3: Configure Cargo Clippy (Rust)

```bash
# Add clippy configuration
cat >> .cargo/config.toml <<EOF
[target.'cfg(all())']
rustflags = [
  "-W", "clippy::unused_async",
  "-W", "clippy::future_not_send",
  "-W", "clippy::missing_errors_doc"
]
EOF

# Run clippy as part of build
cargo clippy -- -D warnings
```

### Step 4: Make All Validators Executable

```bash
chmod +x .claude/skills/hook-pipeline/*.sh
chmod +x .claude/skills/hook-pipeline/*.py
```

---

## Testing the Enhancements

### Test 1: Bash Pipe Safety

```bash
# Create test file with unsafe pipe
cat > /tmp/test-unsafe-pipe.sh <<'EOF'
#!/bin/bash
set -euo pipefail

# This should trigger warning
if redis-cli keys "pattern" | grep -q "."; then
  echo "found"
fi
EOF

# Run validator
./.claude/skills/hook-pipeline/bash-pipe-safety.sh /tmp/test-unsafe-pipe.sh

# Expected output:
# ⚠️  Pipe Safety Warning: Commands in pipes without stderr redirect
#    Line 5: if redis-cli keys "pattern" | grep -q "."; then
```

### Test 2: Unhandled Promise (JavaScript)

```bash
# Create test file
cat > /tmp/test-unhandled.js <<'EOF'
async function doWork() {
  return Promise.resolve("done");
}

// This should trigger warning
doWork();
EOF

# Run validator
./.claude/skills/hook-pipeline/js-promise-safety.sh /tmp/test-unhandled.js

# Or use ESLint:
npx eslint /tmp/test-unhandled.js
```

### Test 3: Line Ending Fix

```bash
# Create file with CRLF
printf 'echo "test"\r\n' > /tmp/test-crlf.sh

# Run validator (should auto-fix)
./.claude/skills/hook-pipeline/enforce-lf.sh /tmp/test-crlf.sh

# Verify fix
file /tmp/test-crlf.sh  # Should show "ASCII text"
```

---

## Performance Impact

| Check | Language | Avg Time | Impact |
|-------|----------|----------|--------|
| Pipe Safety | Bash | ~50ms | Negligible |
| Promise Safety | JS/TS | ~100ms | Low (ESLint: ~500ms) |
| Async Safety | Python | ~200ms | Low |
| Future Safety | Rust | ~100ms | Low (Clippy: ~2s) |
| Line Ending | All | ~10ms | Negligible |
| Dependencies | All | ~100ms | Low |

**Total overhead**: ~500ms per file (or ~2.5s with full linting)

---

## Maintenance

### When to Update

1. **New language added**: Create equivalent validators
2. **Pattern discovered**: Add to relevant validator
3. **False positives**: Refine regex patterns
4. **Performance issues**: Optimize grep/AST traversal

### Monitoring

Track validation effectiveness:

```bash
# Add to hook output
echo "Validations run: $TOTAL_CHECKS"
echo "Issues found: $((WARNING_COUNT + ERROR_COUNT))"
echo "Auto-fixes applied: $FIX_COUNT"
```

---

## Rollout Plan

### Phase 1: Non-Blocking Warnings (Week 1)
- Enable all validators in warning mode
- Monitor false positive rate
- Refine patterns based on feedback

### Phase 2: Auto-Fixes (Week 2)
- Enable line ending auto-fix
- Add auto-fix for common patterns
- Document manual fix procedures

### Phase 3: Blocking Errors (Week 3)
- Promote critical checks to blocking (exit 1)
- Dependency validation blocks
- Unhandled promise detection blocks

---

## Success Metrics

**Target**:
- 75%+ bug prevention rate (measured against recent debugging sessions)
- <1s post-edit hook execution time
- <5% false positive rate

**Measurement**:
```bash
# Track over 30 days
grep "Issues found:" .claude/hooks/post-edit.log | \
  awk '{sum+=$3; count++} END {print "Avg issues/file:", sum/count}'
```

---

## References

- Original bugs: TEST 7 hang (pipe safety), postinstall hang (unhandled promise)
- Post-edit hook: `.claude/hooks/cfn-invoke-post-edit.sh`
- Hook config: `.claude/hooks/post-edit.config.json`
- Analysis docs: `/tmp/test7-root-cause-analysis.md`, `/tmp/npx-hang-root-cause.md`

---

**Implementation Priority**: High
**Estimated Effort**: 8-12 hours
**Expected ROI**: Prevents 75% of recently discovered production bugs
**Next Steps**: Create `.claude/skills/hook-pipeline/` validators in Phase 1 order
