# BUG #28: Missing Deliverable Extraction from Phase Context

**Status:** ✅ FIXED
**Reported:** 2025-10-22
**Fixed:** 2025-10-22
**Severity:** High
**Category:** Context Injection, Deliverable Verification

## Summary

Orchestrator never extracted `deliverables` array from phase context JSON to populate `--expected-files` parameter for deliverable verification, causing system to fall back to `git status` which fails for files outside the repository.

## Root Cause

In `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`, the orchestrator extracted deliverables from phase context for **display purposes only** (lines 769-771), but never created a comma-separated list to pass to `validate-deliverables.sh --expected-files` parameter.

**Problem Code (lines 769-771):**
```bash
DELIVERABLES=$(echo "$PHASE_CTX" | jq -r '.deliverables[]? // empty' | sed 's/^/- /' || echo "- (not specified)")
DIRECTORY=$(echo "$PHASE_CTX" | jq -r '.directory // ""')
ACCEPTANCE=$(echo "$SUCCESS_CTX" | jq -r '.acceptanceCriteria[]? // empty' | sed 's/^/- /' || echo "- (not specified)")
```

Result: `DELIVERABLES` formatted with bullet points for display, no `EXPECTED_FILES` variable created.

## Impact

1. **Explicit file verification bypassed**: System fell back to `git status` checking (lines 73-82 in `validate-deliverables.sh`)
2. **Files outside git repo not detected**: `/tmp/bug28-test.txt` and similar test files reported zero deliverables
3. **Confidence incorrectly overridden**: Orchestrator overrode agent confidence from 1.0 → 0.0 due to "no deliverables detected"
4. **False BUG #27 diagnosis**: Initially diagnosed consensus returning 0.0 as a bug, when it was actually working as designed (BUG #12 fix) but receiving wrong input

## The Fix

**Location:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh` lines 773-775

**Added Code:**
```bash
# BUG #28 FIX: Extract deliverables array as comma-separated list for explicit file verification
# This prevents reliance on git status which fails for files outside the repository
EXPECTED_FILES=$(echo "$PHASE_CTX" | jq -r '.deliverables[]? // empty' | tr '\n' ',' | sed 's/,$//')
```

**Explanation:**
- `jq -r '.deliverables[]? // empty'` - Extract array elements as separate lines
- `tr '\n' ','` - Convert newlines to commas
- `sed 's/,$//'` - Remove trailing comma
- Result: `"/tmp/file1.txt,/tmp/file2.txt,docs/report.md"`

**Usage (lines 1069-1073):**
```bash
DELIVERABLE_ARGS="--task-id $TASK_ID"
if [ -n "$EXPECTED_FILES" ]; then
  DELIVERABLE_ARGS="$DELIVERABLE_ARGS --expected-files $EXPECTED_FILES"
  echo "  Expected files: $EXPECTED_FILES"
fi
```

## Test Results

**Test Command:**
```bash
orchestrate-cfn-loop.sh \
  --task-id "bug28-test-1761128485" \
  --phase-context '{"deliverables": ["/tmp/bug28-test.txt"], "directory": "/tmp"}' \
  --loop3-agents "coder" \
  --loop2-agents "reviewer" \
  ...
```

**Results:**
```
[Deliverable Check] Verifying implementation artifacts...
  Expected files: /tmp/bug28-test.txt
[Deliverable Check] ✅ Deliverables verified - proceeding to gate check
✅ Gate PASSED (.95 >= 0.75)
✅ CONSENSUS REACHED (.90 >= 0.90)
```

**Evidence:**
```bash
$ ls -la /tmp/bug28-test.txt
-rw-r--r-- 1 masharratt masharratt 233 Oct 22 03:21 /tmp/bug28-test.txt

$ cat /tmp/bug28-test.txt
BUG #28 Test File
This file is created to test the explicit file verification fix.
```

## Related Issues

- **BUG #12**: "Consensus on vapor" prevention (confidence override working correctly, but receiving wrong input)
- **BUG #27**: FALSE ALARM - Consensus returning 0.0 was actually working as designed; real issue was missing deliverable extraction
- **BUG #20**: Context injection gaps (similar root cause - context stored but not injected into agent prompts)
- **ANTI-020**: Context storage without injection anti-pattern

## Design Intent (Working Correctly Now)

**Deliverable Verification Design:**
1. **Primary method** (lines 47-70 in `validate-deliverables.sh`): Explicit file verification via `--expected-files`
   - Check each file exists with `[ ! -f "$file" ]`
   - Report missing files to Redis
   - Requires orchestrator to extract deliverables from phase context
2. **Fallback method** (lines 73-82): `git status` checking
   - Only used when `--expected-files` NOT provided
   - Unreliable for files outside git repository
   - Before BUG #28 fix: Used 100% of the time because orchestrator never provided expected files

## Validation Checklist

- ✅ Files outside git repo detected and verified
- ✅ Confidence preserved when deliverables exist
- ✅ `EXPECTED_FILES` extracted from phase context
- ✅ No fallback to `git status` when explicit files provided
- ✅ Test file `/tmp/bug28-test.txt` created and verified
- ✅ Consensus reached without confidence override

## Lessons Learned

1. **Context extraction requires explicit parsing**: Storing context in Redis is not sufficient; orchestrator must parse and inject into every relevant parameter
2. **Display formatting ≠ parameter formatting**: `DELIVERABLES` (bullet-pointed) served display purposes but couldn't be used for `--expected-files` (comma-separated)
3. **Fallback behavior masks missing features**: System appeared to "work" via `git status` fallback, masking the fact that explicit verification was never implemented
4. **Test with files outside git**: Using `/tmp/` test files exposed the git status limitation immediately

## Prevention

**Pattern for future context extraction:**
1. Extract once for display (formatted with bullets/newlines)
2. Extract separately for parameter injection (comma-separated, no formatting)
3. Validate both extractions succeeded before spawning agents
4. Test with files outside git repository to verify explicit verification works

## Confidence

0.99 (definitive test evidence, clear fix, validated working)

## Verification Date

2025-10-22
