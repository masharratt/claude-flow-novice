# Grep Patterns Quick Reference for CLI Tests
**Last Updated:** 2025-11-25
**Research Phase:** 1/10

---

## Quick Navigation

- [File Existence Patterns](#file-existence-patterns)
- [Content Validation Patterns](#content-validation-patterns)
- [CLI Mode Validation](#cli-mode-validation)
- [Path Resolution Patterns](#path-resolution-patterns)
- [Common Grep Mistakes](#common-grep-mistakes)

---

## File Existence Patterns

### WORKING: Check if orchestrator exists
```bash
# Correct path (cfn-docker-loop-orchestration)
[[ -f "$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh" ]] \
  && echo "✅ Found" || echo "❌ Not found"

# WRONG path (will fail - use only for backwards compat check)
[[ -f "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh" ]] \
  && echo "⚠️ Legacy path" || echo "✅ Not using legacy path"
```

### WORKING: Check if agent spawner exists
```bash
[[ -f "$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh" ]] \
  && echo "✅ Found" || echo "❌ Not found"
```

### WORKING: Check if test utilities exist
```bash
[[ -f "$PROJECT_ROOT/tests/test-utils.sh" ]] \
  && echo "✅ Found" || echo "❌ Not found"
```

### WORKING: Find all orchestration-related files
```bash
find "$PROJECT_ROOT/.claude/skills" -name "*orchestrat*" -type f
# Expected output:
# .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh
# .claude/skills/cfn-docker-loop-orchestration/test-*.sh
# .claude/skills/cfn-loop-orchestration/archive/legacy-bash/orchestrate.sh
# .claude/skills/cfn-loop-orchestration/archive/legacy-bash/orchestrate-wrapper.sh
```

---

## Content Validation Patterns

### WORKING: Check for PROJECT_ROOT definition
```bash
# Exact line match
grep "^PROJECT_ROOT=" "$ORCHESTRATOR"
# Output: PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Flexible match (recommended for robustness)
grep -E '^PROJECT_ROOT=' "$ORCHESTRATOR"

# Existence check only
grep -q 'PROJECT_ROOT=' "$ORCHESTRATOR" && echo "✅ Defined"
```

### WORKING: Check for SCRIPT_DIR definition
```bash
grep -q 'SCRIPT_DIR=' "$ORCHESTRATOR" && echo "✅ Defined"

# Get the actual line
grep "^SCRIPT_DIR=" "$ORCHESTRATOR"
# Output: SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
```

### WORKING: Check for skill references
```bash
# Find all skill path references
grep -o '\$PROJECT_ROOT/\.claude/skills/cfn-[a-z-]*' "$ORCHESTRATOR" | sort | uniq
# Expected output includes:
# $PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning
# $PROJECT_ROOT/.claude/skills/cfn-docker-redis-coordination
# $PROJECT_ROOT/.claude/skills/cfn-wave-execution
# $PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh

# Check for specific skill (agent spawning)
grep -q 'cfn-docker-agent-spawning' "$ORCHESTRATOR" && echo "✅ Agent spawning referenced"

# Check for specific skill (redis coordination)
grep -q 'cfn-docker-redis-coordination' "$ORCHESTRATOR" && echo "✅ Redis coordination referenced"
```

### WORKING: Check for function definitions
```bash
# Find all function names
grep '^[a-z_][a-z0-9_]*()' "$ORCHESTRATOR" | head -20

# Check for specific function
grep -q '^main()' "$ORCHESTRATOR" && echo "✅ Main function found"

# Extended regex for functions
grep -E '^[a-z_]+\s*\(\)' "$ORCHESTRATOR"
```

### WORKING: Check for variable assignments
```bash
# Find all variable definitions
grep -E '^[A-Z_]+=' "$ORCHESTRATOR" | head -20

# Check for specific variable pattern
grep -E 'AGENT.*TYPE|AGENT.*ID' "$ORCHESTRATOR"
```

---

## CLI Mode Validation

### WORKING: Verify spawning pattern
```bash
# Check for npx tsx spawning
grep -q 'npx tsx' "$ORCHESTRATOR" && echo "✅ Uses TypeScript spawning"

# Check for spawn-agent reference
grep -q 'spawn-agent' "$ORCHESTRATOR" && echo "✅ Uses agent spawning script"

# Alternative: check for agent spawning skill path
grep -q 'cfn-docker-agent-spawning' "$ORCHESTRATOR" && \
  echo "✅ References agent spawning skill"
```

### WORKING: Check for threshold-based completion
```bash
# Look for threshold variables
grep -q 'THRESHOLD' "$ORCHESTRATOR" && echo "✅ Threshold concept present"

# Look for completion signal patterns
grep -q 'completion\|complete\|COMPLETE' "$ORCHESTRATOR" && \
  echo "✅ Completion signals implemented"

# Check for wave execution (alternative to threshold)
grep -q 'wave\|WAVE' "$ORCHESTRATOR" && \
  echo "✅ Wave execution present"
```

### WORKING: Verify Redis coordination
```bash
# Check for Redis commands
grep -q 'redis-cli\|REDIS' "$ORCHESTRATOR" && \
  echo "✅ Redis used for coordination"

# Check for Redis key patterns
grep -o 'cfn:[a-z-]*' "$ORCHESTRATOR" | sort | uniq
# Look for patterns like:
# cfn:task:*
# cfn:agent:*
# cfn:completion:*
```

### WORKING: Validate task ID generation
```bash
# Check for task ID pattern
grep -q 'TASK_ID\|task.*id' "$ORCHESTRATOR" && \
  echo "✅ Task ID generation present"

# Look for specific task ID format
grep -q 'cfn-cli\|cfn-.*date' "$ORCHESTRATOR" && \
  echo "✅ Task ID format appears correct"
```

---

## Path Resolution Patterns

### CRITICAL: Check for correct PROJECT_ROOT usage
```bash
# CORRECT pattern (what we want):
# Variables defined at top:
grep -A 2 '^SCRIPT_DIR=' "$ORCHESTRATOR"
grep -A 2 '^PROJECT_ROOT=' "$ORCHESTRATOR"

# Used in paths:
grep '\$PROJECT_ROOT/\.claude/skills' "$ORCHESTRATOR"

# WRONG patterns (what to avoid):
grep 'absolute.*path\|hardcoded.*path' "$ORCHESTRATOR" && \
  echo "⚠️ May have hardcoded paths"
grep '/tmp/\|/home/\|/root/' "$ORCHESTRATOR" && \
  echo "⚠️ May have user-specific paths"
```

### CRITICAL: Verify no hardcoded paths
```bash
# Check for absolute paths (might indicate hardcoding)
grep -E '^/[a-z]' "$ORCHESTRATOR" && \
  echo "⚠️ Contains absolute paths"

# Check for home directory references
grep -E '~|/home/|/root/' "$ORCHESTRATOR" && \
  echo "⚠️ Contains home directory references"

# Check for typical user paths
grep -E '/Users/|/mnt/|/workspace/' "$ORCHESTRATOR" && \
  echo "⚠️ May contain user-specific paths"
```

### CRITICAL: Validate path construction
```bash
# Check for $(cd ...) pattern (good for relative paths)
grep -q '\$(cd' "$ORCHESTRATOR" && \
  echo "✅ Uses cd for relative path resolution"

# Check for git rev-parse (good for project root)
grep -q 'git rev-parse\|git.*show-toplevel' "$ORCHESTRATOR" && \
  echo "✅ Uses git for project root detection"
```

---

## Common Grep Mistakes

### MISTAKE 1: Forgetting to escape dots in regex
```bash
# WRONG: This matches "a" + "any char" + "claude"
grep 'a.claude' "$ORCHESTRATOR"

# CORRECT: This matches literal "a.claude"
grep 'a\.claude' "$ORCHESTRATOR"
grep -F 'a.claude' "$ORCHESTRATOR"  # -F for fixed string
```

### MISTAKE 2: Escaping the dollar sign incorrectly
```bash
# In single quotes (CORRECT): $ is literal
grep '\$PROJECT_ROOT' "$ORCHESTRATOR"

# In double quotes (WRONG): $ is interpreted by shell
grep "$VARIABLE" "$ORCHESTRATOR"  # Uses variable value instead

# EXCEPTION: Using grep -F (fixed string) ignores escaping
grep -F '$PROJECT_ROOT' "$ORCHESTRATOR"  # Works in double quotes too
```

### MISTAKE 3: Using grep in conditional without proper quoting
```bash
# WRONG: Pattern not quoted, may be interpreted by shell
if grep -q $PATTERN "$file"; then ...

# CORRECT: Pattern quoted
if grep -q "$PATTERN" "$file"; then ...

# BEST: Use literals or -F flag
if grep -qF "$PATTERN" "$file"; then ...
```

### MISTAKE 4: Mixing literal and regex patterns
```bash
# WRONG: Trying regex with fixed string flag
grep -F 'cfn-*' "$ORCHESTRATOR"  # Looks for literal "cfn-*", not wildcard

# CORRECT: Use regex without -F
grep -E 'cfn-[a-z]*' "$ORCHESTRATOR"

# CORRECT: Use -F with literal asterisk if that's what you want
grep -F 'cfn-*' "$ORCHESTRATOR"
```

### MISTAKE 5: Not redirecting stderr
```bash
# WRONG: Errors go to console
grep "pattern" "$nonexistent_file" 2>/dev/null

# CORRECT: Both stdout and stderr handled
if grep -q "pattern" "$file" 2>/dev/null; then
  echo "✅ Found"
else
  echo "❌ Not found"
fi
```

### MISTAKE 6: Inconsistent escaping of backslashes
```bash
# WRONG: In double quotes, needs extra escaping
grep "\\$PROJECT_ROOT" "$file"  # Too many backslashes

# CORRECT: In double quotes
grep '\$PROJECT_ROOT' "$file"  # Use single quotes

# CORRECT: In extended regex
grep -E '\$PROJECT_ROOT' "$file"
```

---

## Working Test Patterns

### Pattern 1: File existence + content check
```bash
local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

if [[ ! -f "$orchestrator" ]]; then
  echo "❌ FAIL: orchestrator.sh not found"
  return 1
fi

if ! grep -q 'PROJECT_ROOT=' "$orchestrator"; then
  echo "❌ FAIL: PROJECT_ROOT not defined"
  return 1
fi

echo "✅ PASS: orchestrator.sh valid"
return 0
```

### Pattern 2: Multiple content assertions
```bash
local REQUIRED_PATTERNS=(
  "^PROJECT_ROOT="
  "^SCRIPT_DIR="
  "cfn-docker-agent-spawning"
  "cfn-docker-redis-coordination"
)

local all_found=true
for pattern in "${REQUIRED_PATTERNS[@]}"; do
  if grep -qE "$pattern" "$orchestrator"; then
    echo "✅ Found: $pattern"
  else
    echo "❌ Missing: $pattern"
    all_found=false
  fi
done

[[ "$all_found" == true ]] && echo "✅ All patterns found" || echo "❌ Some patterns missing"
```

### Pattern 3: Content validation with context
```bash
# Get line number and content
grep -n 'PROJECT_ROOT=' "$orchestrator" | head -1
# Output: 9:PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Check if line exists and show context
grep -B 2 -A 2 'PROJECT_ROOT=' "$orchestrator"

# Count occurrences
grep -c 'PROJECT_ROOT=' "$orchestrator"
# Should be: 1 (definition at top)
```

---

## Quick Reference Sheet

| Need | Pattern | Example |
|------|---------|---------|
| Check file exists | `[[ -f "$file" ]]` | `[[ -f "$ORCHESTRATOR" ]] && echo OK` |
| Find text in file | `grep -q "text" "$file"` | `grep -q PROJECT_ROOT "$file"` |
| Find regex pattern | `grep -E "pattern" "$file"` | `grep -E '^[A-Z_]+=' "$file"` |
| Find line number | `grep -n "text" "$file"` | `grep -n PROJECT_ROOT "$file" \| head -1` |
| Find + context | `grep -C 2 "text" "$file"` | `grep -C 2 PROJECT_ROOT "$file"` |
| Fixed string | `grep -F "text" "$file"` | `grep -F '$PROJECT_ROOT' "$file"` |
| Invert match | `grep -v "text" "$file"` | `grep -v '^#' "$file"` (skip comments) |
| Count matches | `grep -c "text" "$file"` | `grep -c PROJECT_ROOT "$file"` |
| Multiple files | `grep -r "text" "$dir"` | `grep -r PROJECT_ROOT .claude/skills` |
| Case insensitive | `grep -i "text" "$file"` | `grep -i orchestrat "$file"` |

---

## Recommended Test Assertion Patterns

### Using test-utils.sh functions (PREFERRED)
```bash
# File existence
assert_file_exists "$orchestrator" "Orchestrator skill"

# Content validation
assert_contains "$orchestrator" "PROJECT_ROOT=" "PROJECT_ROOT definition"
assert_contains "$orchestrator" "cfn-docker-agent-spawning" "Agent spawning reference"

# Absence of deprecated patterns
assert_not_contains "$orchestrator" "cfn-loop-orchestration/archive" "No archived code"
assert_not_contains "$orchestrator" "cfn-v3-coordinator" "No legacy coordinator"

# Custom validation
if assert_contains "$orchestrator" "SCRIPT_DIR=" "SCRIPT_DIR"; then
  pass "SCRIPT_DIR defined"
else
  fail "SCRIPT_DIR not defined"
fi
```

### Custom bash patterns
```bash
# Simple check
grep -q 'pattern' "$file" && echo "✅" || echo "❌"

# With error message
if grep -q 'pattern' "$file" 2>/dev/null; then
  pass "Pattern found"
else
  fail "Pattern not found"
fi

# Multiple patterns
for pattern in "PROJECT_ROOT" "SCRIPT_DIR" "cfn-docker"; do
  grep -q "$pattern" "$file" && echo "✅ $pattern" || echo "❌ $pattern"
done
```

---

## Validation Checklist

- [x] Correct path: `cfn-docker-loop-orchestration` (not `cfn-loop-orchestration`)
- [x] Variables defined: `PROJECT_ROOT` and `SCRIPT_DIR`
- [x] Uses relative path construction: `$(cd ...)`
- [x] References active skills: `cfn-docker-*` patterns
- [x] No hardcoded paths: No `/tmp/`, `/home/`, `/root/`
- [x] No deprecated references: No `archive/`, `cfn-v3-coordinator`
- [x] Valid grep patterns: Proper escaping, quoted variables
- [x] Test utilities available: `tests/test-utils.sh` exists

---

## References

- **Research Document:** `docs/CLI_TEST_INFRASTRUCTURE_RESEARCH.md`
- **Test Utils:** `tests/test-utils.sh`
- **Active Orchestrator:** `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh`
- **CLI Mode Spec:** `.claude/commands/cfn-loop-cli.md`
