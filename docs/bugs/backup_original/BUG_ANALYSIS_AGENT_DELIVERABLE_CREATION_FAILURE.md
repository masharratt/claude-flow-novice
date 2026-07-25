# Bug Analysis: Agent Deliverable Creation Failure

**Date:** 2025-11-20
**Severity:** P0 - Blocks E2E test validation
**Status:** FIXED - Build verified successful

## Summary

Agents receive workspace information in their context JSON but fail to create deliverables because the workspace path is not surfaced in the agent prompt.

## Root Cause

**Property name mismatch in `src/cli/agent-prompt-builder.ts`**

The orchestrator passes `workspace` (lowercase) in the context JSON:
```json
{
  "taskId": "cfn-1763690828",
  "mode": "standard",
  "iteration": 1,
  "phase": "loop3",
  "timestamp": 1763690828532,
  "workspace": "/tmp/cfn-cli-real-test-..."
}
```

But `enrichJSONContext()` only checks for `WORKSPACE` (uppercase) or `directory`:
```typescript
// Line 132-134 in agent-prompt-builder.ts
if (jsonObj.directory || jsonObj.WORKSPACE) {
    sections.push(`\n**Working Directory:** ${jsonObj.directory || jsonObj.WORKSPACE}`);
}
```

## Impact

1. **Agents never see workspace path** - The working directory section is not added to their prompt
2. **File creation fails silently** - Agents don't know where to create deliverables
3. **E2E tests fail** - North Star test cannot validate file creation

## Evidence

Test context JSON (confirmed workspace present):
```json
{"workspace":"/tmp/cfn-cli-real-test-cfn-cli-real-e2e-1763690803-86334"}
```

Agent prompt builder code (checks wrong property names):
```typescript
if (jsonObj.directory || jsonObj.WORKSPACE) {
```

## Fix Plan

### Option A: Add lowercase `workspace` check (Minimal Change)

Edit `src/cli/agent-prompt-builder.ts` line 132:

**Before:**
```typescript
if (jsonObj.directory || jsonObj.WORKSPACE) {
    sections.push(`\n**Working Directory:** ${jsonObj.directory || jsonObj.WORKSPACE}`);
}
```

**After:**
```typescript
if (jsonObj.directory || jsonObj.WORKSPACE || jsonObj.workspace) {
    sections.push(`\n**Working Directory:** ${jsonObj.directory || jsonObj.WORKSPACE || jsonObj.workspace}`);
}
```

### Option B: Normalize property names (Better Long-term)

Add case-insensitive property lookup in `enrichJSONContext()`:
```typescript
const workspacePath = jsonObj.workspace || jsonObj.WORKSPACE || jsonObj.directory;
if (workspacePath) {
    sections.push(`\n**Working Directory:** ${workspacePath}`);
}
```

## Recommended Fix

**Option A** - Minimal change, quick fix, maintains backwards compatibility.

## Test Strategy

1. Update `tests/cli/agent-prompt-builder.test.ts` to verify workspace (lowercase) is handled
2. Re-run North Star E2E test: `test-cfn-loop-cli-real-execution.sh`
3. Verify agent prompt includes `**Working Directory:**` section

## Related Files

- `/mnt/c/Users/masha/Documents/claude-flow-novice/src/cli/agent-prompt-builder.ts` (FIX LOCATION)
- `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-orchestration/src/orchestrate.ts` (workspace source)
- `/mnt/c/Users/masha/Documents/claude-flow-novice/tests/cli-mode/core/e2e/test-cfn-loop-5-iteration-real-execution.sh` (North Star test)

## Secondary Investigation

Even with the fix, agents may still fail to create files if:

1. **Permission issues** - Agents may lack write access to `/tmp/` directories
2. **Task description parsing** - The task itself may not clearly instruct file creation
3. **Redis coordination blocking** - Agents may be stuck waiting for signals

These should be verified after applying the workspace fix.
