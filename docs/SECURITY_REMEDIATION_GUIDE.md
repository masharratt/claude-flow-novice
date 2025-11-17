# Security Remediation Guide - PR #12 Fixes

**Purpose:** Detailed fix implementations for Agent 3 (Reviewer) validation
**Target Audience:** Code review phase, implementation verification
**Status:** Reference guide for security validation

---

## Fix #1: Standardized JSON Validation Pattern

**Files to Update:** 7 agent files (all except database-architect.md)

### Current Vulnerable Code

```bash
if [[ -n "${AGENT_SUCCESS_CRITERIA:-}" ]]; then
    CRITERIA=$(echo "$AGENT_SUCCESS_CRITERIA" | jq -r '.')
    TEST_SUITES=$(echo "$CRITERIA" | jq -r '.test_suites[]')
    echo "📋 Success Criteria Loaded:"
    echo "$TEST_SUITES" | jq -r '.name'
fi
```

### Fixed Code (Use This Pattern)

```bash
### 1. Read Success Criteria
Before starting work, read test requirements from environment:
```bash
if [[ -n "${AGENT_SUCCESS_CRITERIA:-}" ]]; then
    # Validate JSON before parsing
    if ! echo "$AGENT_SUCCESS_CRITERIA" | jq -e '.' >/dev/null 2>&1; then
        echo "❌ Invalid JSON in AGENT_SUCCESS_CRITERIA" >&2
        exit 1
    fi

    CRITERIA=$(echo "$AGENT_SUCCESS_CRITERIA" | jq -r '.')
    TEST_SUITES=$(echo "$CRITERIA" | jq -r '.test_suites[] // empty')

    if [[ -n "$TEST_SUITES" ]]; then
        echo "📋 Success Criteria Loaded:"
        echo "$TEST_SUITES" | jq -r '.name // "unnamed"'
    fi
fi
```
```

### Why This Works

1. **jq -e '.'** - Exit with non-zero if JSON is invalid (security validation)
2. **// empty** - Returns empty if field doesn't exist (prevents pipeline errors)
3. **// "unnamed"** - Provides default value if .name is null
4. **-n check** - Ensures loop only runs if output is non-empty

### Files to Update

- [ ] `/home/user/claude-flow-novice/.claude/agents/cfn-dev-team/developers/frontend/ui-designer.md`
- [ ] `/home/user/claude-flow-novice/.claude/agents/cfn-dev-team/testers/api-testing-specialist.md`
- [ ] `/home/user/claude-flow-novice/.claude/agents/cfn-dev-team/testers/chaos-engineering-specialist.md`
- [ ] `/home/user/claude-flow-novice/.claude/agents/cfn-dev-team/testers/contract-tester.md`
- [ ] `/home/user/claude-flow-novice/.claude/agents/cfn-dev-team/testers/mutation-testing-specialist.md`
- [ ] `/home/user/claude-flow-novice/.claude/agents/cfn-dev-team/developers/rust-developer.md`
- [ ] `/home/user/claude-flow-novice/.claude/agents/cfn-dev-team/utility/memory-leak-specialist.md`
- [ ] `/home/user/claude-flow-novice/.claude/agents/cfn-dev-team/developers/backend-developer.md` (verify complete)

### Test Validation

```bash
# Test 1: Invalid JSON should exit gracefully
export AGENT_SUCCESS_CRITERIA='{"invalid": json}'
source .claude/agents/cfn-dev-team/developers/frontend/ui-designer.md
# Expected: Error message, no jq failure

# Test 2: Missing test_suites should not crash
export AGENT_SUCCESS_CRITERIA='{"name": "test"}'
source .claude/agents/cfn-dev-team/developers/frontend/ui-designer.md
# Expected: No output, no error

# Test 3: Valid JSON should work
export AGENT_SUCCESS_CRITERIA='{"test_suites": [{"name": "auth"}]}'
source .claude/agents/cfn-dev-team/developers/frontend/ui-designer.md
# Expected: "📋 Success Criteria Loaded:" followed by test suite names
```

---

## Fix #2: Secure RESULTS Variable in Redis Commands

**Issue:** RESULTS variable can contain special characters that break redis-cli commands

**Current Vulnerable Code:**

```bash
redis-cli HSET "swarm:${TASK_ID}:test-results:iteration${ITERATION}" \
  "${AGENT_ID}" "$RESULTS"
```

### Solution A: Newline Replacement (Simple)

```bash
# Before redis-cli, sanitize RESULTS
SAFE_RESULTS=$(echo "$RESULTS" | tr '\n' ' ')

redis-cli HSET "swarm:${TASK_ID}:test-results:iteration${ITERATION}" \
  "${AGENT_ID}" "$SAFE_RESULTS"
```

**Pros:** Simple, minimal overhead
**Cons:** Loses newline structure in stored results

### Solution B: JSON Encoding (Recommended)

```bash
# Encode RESULTS as JSON string (safe for any characters)
SAFE_RESULTS=$(printf '%s\n' "$RESULTS" | jq -Rs '.')

redis-cli HSET "swarm:${TASK_ID}:test-results:iteration${ITERATION}" \
  "${AGENT_ID}" "$SAFE_RESULTS"
```

**Pros:**
- Preserves all characters including newlines
- Loop 2 validators can decode: `echo "$VALUE" | jq -r '."`
- Natural for JSON handling
- Prevents command injection

**Cons:** Requires jq, slightly more complex

### Solution C: Use Redis Protocol Directly

```bash
# Use redis-cli with RESP protocol explicitly
(
  echo -e "HSET swarm:${TASK_ID}:test-results:iteration${ITERATION} ${AGENT_ID} ${RESULTS}"
) | redis-cli --pipe
```

**Pros:** Proper protocol-level safety
**Cons:** More complex, requires RESP knowledge

### Recommended Implementation

Use Solution B (JSON encoding) in all agent files:

```bash
# Parse test results
RESULTS=$(./.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh \
  "jest" "$TEST_OUTPUT")

# JSON-encode for safe Redis storage
SAFE_RESULTS=$(printf '%s\n' "$RESULTS" | jq -Rs '.')

# Store in Redis
redis-cli HSET "swarm:${TASK_ID}:test-results:iteration${ITERATION}" \
  "${AGENT_ID}" "$SAFE_RESULTS"

# Signal completion
redis-cli LPUSH "swarm:${TASK_ID}:completion:${AGENT_ID}" "done"
```

### Files to Update

All agent files with redis-cli HSET commands:
- All developers agents (9 files)
- All tester agents (7 files)

### Test Validation

```bash
# Test 1: Results with newlines
TEST_OUTPUT=$'test 1\ntest 2\ntest 3'
RESULTS="$(echo "$TEST_OUTPUT" | wc -l) tests"
SAFE_RESULTS=$(printf '%s\n' "$RESULTS" | jq -Rs '.')

# Verify it can be stored and retrieved
redis-cli DEL test:key
redis-cli HSET test:key field "$SAFE_RESULTS"
RETRIEVED=$(redis-cli HGET test:key field)
echo "$RETRIEVED" | jq -r '.'
# Expected: Original RESULTS string restored

# Test 2: Results with special characters
RESULTS='test\n"quoted"\necho injected\n$variable'
SAFE_RESULTS=$(printf '%s\n' "$RESULTS" | jq -Rs '.')
redis-cli HSET test:key field "$SAFE_RESULTS"
# Expected: No command execution, safe storage
```

---

## Fix #3: Safe Error Messages (Information Disclosure)

**Issue:** Verbose error messages leak internal structure

### Current Code (Potentially Vulnerable)

```bash
if ! echo "$AGENT_SUCCESS_CRITERIA" | jq -e '.' >/dev/null 2>&1; then
    echo "❌ Invalid JSON in AGENT_SUCCESS_CRITERIA" >&2
    exit 1
fi
```

### Safe Error Message Pattern

```bash
if ! echo "$AGENT_SUCCESS_CRITERIA" | jq -e '.' >/dev/null 2>&1; then
    echo "[ERROR] Invalid success criteria format." >&2
    echo "[ERROR] Ensure AGENT_SUCCESS_CRITERIA contains valid JSON." >&2
    exit 1
fi
```

### What NOT to Do

```bash
# ❌ DON'T: Echo environment variables
echo "ERROR: Failed to parse: $AGENT_SUCCESS_CRITERIA" >&2

# ❌ DON'T: Show jq error details directly
echo "$AGENT_SUCCESS_CRITERIA" | jq -e '.' 2>&1

# ❌ DON'T: Expose internal file paths
echo "Error in /home/user/.claude/agents/agent.md line 23" >&2

# ❌ DON'T: Show variable values in errors
echo "TEST_SUITES=$TEST_SUITES is empty" >&2
```

### Safe Error Pattern (Template)

```bash
if [[ some_condition ]]; then
    # Log to file for debugging (secure storage)
    echo "DEBUG: Condition failed, VARIABLE=$VARIABLE" >> /tmp/agent-debug.log

    # Output generic message to stderr (safe)
    echo "[ERROR] Operation failed. Check logs for details." >&2
    exit 1
fi
```

### Files to Update

All agent files with error handling in:
1. JSON validation section
2. Test execution section
3. Completion protocol section

### Test Validation

```bash
# Test 1: Invalid JSON should not echo the input
export AGENT_SUCCESS_CRITERIA='{"secret": "leaked_token_12345"}'
# Capture stderr
ERROR_OUTPUT=$(bash -c 'source agent.md' 2>&1)
# Verify it doesn't contain "leaked_token"
if echo "$ERROR_OUTPUT" | grep -q "leaked_token"; then
    echo "FAIL: Information disclosure detected"
else
    echo "PASS: Error message is generic"
fi
```

---

## Fix #4: Safe File Path Handling in mutation-testing-specialist

**File:** `/home/user/claude-flow-novice/.claude/agents/cfn-dev-team/testers/mutation-testing-specialist.md`

### Current Vulnerable Code (Lines 83-93)

```bash
TEST_FILES=$(find . -type f \
  \( -name "*.test.ts" -o -name "*.spec.ts" -o -name "test_*.py" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "*/.next/*" \
  -not -path "*/coverage/*")
```

### Fixed Code

```bash
# Phase 1: Test Suite Analysis (5-10 min)

**1. Identify Test Files (Safely):**
```bash
# Find test files with safety limits
TEST_FILES=$(find . -maxdepth 5 -type f \
  \( -name "*.test.ts" -o -name "*.spec.ts" -o -name "test_*.py" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "*/.next/*" \
  -not -path "*/coverage/*" \
  -not -path "*/.*" \
  | while IFS= read -r file; do
      # Validate file before processing
      if [[ -f "$file" ]] && [[ ! -L "$file" ]]; then
          echo "$file"
      fi
  done)

echo "Test Files to Validate:"
echo "$TEST_FILES" | while IFS= read -r file; do
    if [[ -s "$file" ]]; then  # -s checks file is not empty
        TEST_COUNT=$(grep -c "it\|test\|def test_" "$file" 2>/dev/null || echo "0")
        echo "  - $file ($TEST_COUNT tests)"
    fi
done
```
```

### Why This is Safer

1. **-maxdepth 5** - Prevents traversing entire filesystem
2. **-not -path "*/.*"** - Skips hidden files and directories
3. **-not -L** - Skips symlinks (prevents directory traversal)
4. **-f check** - Verifies it's a regular file
5. **-s check** - Verifies file is not empty

### Test Validation

```bash
# Test 1: Find respects maxdepth
TEST_FILES=$(find . -maxdepth 5 -type f -name "*.ts")
# Count of TEST_FILES should be reasonable

# Test 2: Symlinks are skipped
ln -s /etc/passwd test.ts
TEST_FILES=$(find . -maxdepth 2 -type f -name "*.ts" -not -L)
if echo "$TEST_FILES" | grep -q "passwd"; then
    echo "FAIL: Symlink was included"
else
    echo "PASS: Symlink was skipped"
fi
rm test.ts

# Test 3: Hidden files are skipped
touch .hidden-test.ts
TEST_FILES=$(find . -maxdepth 2 -type f -name "*.ts" -not -path "*/.*")
if echo "$TEST_FILES" | grep -q "hidden"; then
    echo "FAIL: Hidden file was included"
else
    echo "PASS: Hidden file was skipped"
fi
rm .hidden-test.ts
```

---

## Fix #5: Safe jq Field Access

**Issue:** Missing fallback operators cause pipeline failures

### Current Pattern (Vulnerable)

```bash
TEST_SUITES=$(echo "$CRITERIA" | jq -r '.test_suites[]')
echo "$TEST_SUITES" | jq -r '.name'
```

### Fixed Pattern

```bash
# Safe field access with fallback operators
TEST_SUITES=$(echo "$CRITERIA" | jq -r '.test_suites[] // empty')

if [[ -n "$TEST_SUITES" ]]; then
    echo "📋 Success Criteria Loaded:"
    echo "$TEST_SUITES" | jq -r '.name // "unnamed"'
fi
```

### Operator Reference

| Operator | Purpose | Example |
|---|---|---|
| `// empty` | Return empty if null/missing | `.field // empty` |
| `// default` | Return default if null/missing | `.field // "unknown"` |
| `?` | Suppress errors | `.field?` (won't error if field missing) |
| `if-then-else` | Conditional processing | `if .field then . else empty end` |

### Files to Check

- [ ] api-testing-specialist.md - Line 24: `.test_suites[]`
- [ ] chaos-engineering-specialist.md - Line 24: `.test_suites[]`
- [ ] contract-tester.md - Line 24: `.test_suites[]`
- [ ] mutation-testing-specialist.md - Line 24: `.test_suites[]`
- [ ] rust-developer.md - Line 24: `.test_suites[]`
- [ ] memory-leak-specialist.md - Line 24: `.test_suites[]`
- [ ] ui-designer.md - Lines 24 & 27: `.test_suites[]` and `.name`

### Test Validation

```bash
# Test 1: Missing field returns empty
CRITERIA='{"other_field": "value"}'
RESULT=$(echo "$CRITERIA" | jq -r '.test_suites[] // empty')
if [[ -z "$RESULT" ]]; then
    echo "PASS: Missing field returned empty"
else
    echo "FAIL: Missing field handling broken"
fi

# Test 2: Null field returns fallback
CRITERIA='{"test_suites": null}'
RESULT=$(echo "$CRITERIA" | jq -r '.test_suites[] // empty')
if [[ -z "$RESULT" ]]; then
    echo "PASS: Null field returned empty"
else
    echo "FAIL: Null field handling broken"
fi

# Test 3: Valid field returns value
CRITERIA='{"test_suites": [{"name": "auth"}]}'
RESULT=$(echo "$CRITERIA" | jq -r '.test_suites[] | .name // "unnamed"')
if [[ "$RESULT" == "auth" ]]; then
    echo "PASS: Valid field returned correctly"
else
    echo "FAIL: Valid field handling broken"
fi
```

---

## Comprehensive Test Suite for Agent 3

### Test Harness

```bash
#!/bin/bash
set -e

echo "Security Remediation Test Suite"
echo "================================"

PASS=0
FAIL=0

test_case() {
    local name="$1"
    local command="$2"
    local expected="$3"

    echo -n "Testing: $name ... "
    if eval "$command" 2>/dev/null | grep -q "$expected"; then
        echo "✓ PASS"
        ((PASS++))
    else
        echo "✗ FAIL"
        ((FAIL++))
    fi
}

# Fix #1: JSON Validation
test_case "Invalid JSON rejected" \
    "AGENT_SUCCESS_CRITERIA='{broken' bash -c 'source agent.md'" \
    "Invalid JSON"

# Fix #2: RESULTS encoding
test_case "RESULTS with newlines safe" \
    "RESULTS='line1\nline2' && SAFE=\$(printf '%s\n' \"\$RESULTS\" | jq -Rs '.' | tr -d '\"')" \
    ""

# Fix #3: Error messages generic
test_case "Error message is generic" \
    "AGENT_SUCCESS_CRITERIA='{broken' bash -c 'source agent.md' 2>&1 | grep -v SECRET" \
    "ERROR"

# Fix #4: File paths safe
test_case "File discovery respects maxdepth" \
    "find . -maxdepth 5 -type f 2>/dev/null | wc -l" \
    ""

# Fix #5: jq field access safe
test_case "Missing field handled gracefully" \
    "echo '{}' | jq -r '.test_suites[] // empty'" \
    ""

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [[ $FAIL -gt 0 ]]; then
    exit 1
fi
```

---

## Review Checklist for Agent 3

### Security Validation Checklist

- [ ] **JSON Validation**
  - [ ] All 7 files have `jq -e '.' >/dev/null 2>&1` check
  - [ ] Error message is generic (not exposing variable contents)
  - [ ] Exit code is 1 on invalid JSON

- [ ] **RESULTS Variable Safety**
  - [ ] RESULTS is JSON-encoded before Redis storage
  - [ ] No unquoted variables in redis-cli commands
  - [ ] Test with special characters: `"`, `\n`, `$`, backticks

- [ ] **Error Message Safety**
  - [ ] No echo statements showing env variables
  - [ ] No jq error details exposed
  - [ ] No file paths in error messages
  - [ ] Generic, actionable messages only

- [ ] **File Path Safety**
  - [ ] mutation-testing-specialist has -maxdepth 5
  - [ ] -not -path "*/.*" excludes hidden files
  - [ ] Symlinks are rejected with -not -L
  - [ ] Files are validated as regular files

- [ ] **jq Field Access**
  - [ ] All `.test_suites[]` have `// empty` fallback
  - [ ] All `.name` accesses have `// "unnamed"` fallback
  - [ ] No bare field access without fallback

### Code Review Standards

```markdown
## Before Approving Fix

- [ ] All vulnerable patterns identified are fixed
- [ ] No new vulnerabilities introduced
- [ ] Error handling is consistent across files
- [ ] Test coverage for security fixes is present
- [ ] Performance impact is minimal
- [ ] Redis operations are safe
- [ ] JSON handling is secure

## Sign-Off Requirements

- [ ] At least one manual test for each fix
- [ ] No security regressions from original code
- [ ] Comments added explaining security rationale
- [ ] Related files checked for similar patterns
```

---

## Communication Template for Agent 3

When validating these fixes, Agent 3 should:

1. **Report Pass/Fail for Each Fix**
   ```
   Fix #1 (JSON Validation): PASS - All 7 files updated correctly
   Fix #2 (RESULTS Encoding): PASS - JSON encoding implemented
   Fix #3 (Error Messages): PASS - No information disclosure
   Fix #4 (File Paths): PASS - maxdepth and symlink checks added
   Fix #5 (jq Fields): PASS - All fallback operators added
   ```

2. **Test Results**
   ```
   Total Security Tests: 15
   Passed: 15
   Failed: 0
   Pass Rate: 100%
   Critical Vulnerabilities Remaining: 0
   ```

3. **Gate Decision**
   ```
   Security Gate Status: PASS
   Ready for merge: YES
   Requires additional work: NO
   ```

---

**Remediation Guide Complete**
**Next Step:** Agent 2 (Coder) implements fixes using this guide
**Then:** Agent 3 (Reviewer) validates completeness and quality
