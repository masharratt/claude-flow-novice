# MDAP Atomicity Improvements Handoff

**Date**: 2025-11-28
**Session**: Trigger.dev v4 MDAP Integration Analysis

---

## Summary

Investigated low confidence scores (10%) in dashboard build tests. Root cause: tasks not atomic enough for T1 model to complete within timeout.

## Key Findings

### 1. Postgres Analysis Revealed Timeout Issue

Task 5 ("Add loading/error states") timed out after 195.7s exceeding the 180s limit:

```json
{
  "success": false,
  "timedOut": true,
  "confidence": 0.1,
  "durationMs": 195751
}
```

Task 4 ("Add event handlers") nearly hit timeout at 175s.

### 2. Root Cause: Non-Atomic Templates

The `mdap-atomicity.ts` template for `react-component` had tasks that violated atomicity rules:

**Before (5 tasks, 2 non-atomic):**
```typescript
// Task 4 - PLURAL = non-atomic
{ description: 'Add event handlers', ... }

// Task 5 - COMPOUND = non-atomic
{ description: 'Add loading/error states', ... }
```

**After (7 tasks, all atomic):**
```typescript
// Task 4 - specific single handler
{ description: 'Add click handler for primary action', estimatedLines: 8 }

// Task 5 - specific single handler
{ description: 'Add refresh handler with loading state', estimatedLines: 10 }

// Task 6 - single state
{ description: 'Add loading state indicator', estimatedLines: 8 }

// Task 7 - single state
{ description: 'Add error state display', estimatedLines: 8 }
```

## Files Modified

### `docker/trigger-dev/src/lib/mdap-atomicity.ts`

**Lines 187-210**: Split non-atomic tasks in `react-component` template

```typescript
// OLD (line 187-194)
{
  description: 'Add event handlers',
  action: 'add',
  complexity: 'simple',
  dependsOn: ['markup'],
  estimatedLines: 15,
  contextHints: ['Use useCallback if needed', 'Type event parameters'],
},

// NEW (line 187-210)
{
  description: 'Add click handler for primary action',
  action: 'add',
  complexity: 'simple',
  dependsOn: ['markup'],
  estimatedLines: 8,
  contextHints: ['Single onClick handler', 'Use useCallback with deps array'],
},
{
  description: 'Add refresh handler with loading state',
  action: 'add',
  complexity: 'simple',
  dependsOn: ['markup'],
  estimatedLines: 10,
  contextHints: ['Async handler for data refresh', 'Toggle loading before/after'],
},
{
  description: 'Add loading state indicator',
  action: 'add',
  complexity: 'simple',
  dependsOn: ['markup'],
  estimatedLines: 8,
  contextHints: ['Show spinner when isLoading=true', 'Add conditional rendering'],
},
{
  description: 'Add error state display',
  action: 'add',
  complexity: 'simple',
  dependsOn: ['markup'],
  estimatedLines: 8,
  contextHints: ['Show error message when error exists', 'Add conditional rendering'],
},
```

## Atomicity Principles Reinforced

1. **No plurals** - "handlers" becomes "handler for X"
2. **No compounds** - "loading/error" becomes separate tasks
3. **<50 lines** - Each task estimates 8-10 lines
4. **One file, one action** - Each task touches one concept
5. **T1 target: <60s** - Simple tasks for haiku model

## Test In Progress

New test running with 7 micro-tasks:

```
[mdap] Decomposed into 7 micro-tasks:
  1. Create TypeScript interface for component props (10 lines)
  2. Create empty component skeleton with props type (15 lines)
  3. Add JSX markup structure (20 lines)
  4. Add click handler for primary action (8 lines)
  5. Add refresh handler with loading state (10 lines)
  6. Add loading state indicator (8 lines)
  7. Add error state display (8 lines)
```

Background task ID: `275087`
First run ID: `run_cmiij37u3004n4jp37ukc5k7b`

## Expected Outcomes

| Metric | Before (5 tasks) | After (7 tasks) |
|--------|------------------|-----------------|
| Success Rate | 80% (4/5) | 100% (7/7) |
| Timeouts | 1 | 0 |
| Avg Duration | ~100s | ~40s |
| Confidence | 50% avg | 50%+ avg |
| Grade | C (73/100) | B+ (85+/100) |

## Next Steps

1. **Monitor test completion** - Check `BashOutput 275087`
2. **Query Postgres** - Verify all 7 tasks complete without timeout
3. **Compare grades** - Old (5 tasks) vs new (7 tasks)
4. **Consider parallel execution** - Tasks 4-7 have no dependencies on each other

## Postgres Queries for Verification

```sql
-- Check task status
SELECT id, status, "createdAt", "completedAt"
FROM "TaskRun"
WHERE "taskIdentifier" = 'cfn-implementer-v2'
ORDER BY "createdAt" DESC LIMIT 10;

-- Get task output/confidence
SELECT id, LEFT(output, 500) as output_preview
FROM "TaskRun"
WHERE id = '<run_id>';
```

## Key Insight

**If a task takes >60s on T1, it's not atomic enough.**

The MDAP system should:
- Detect plurals in task descriptions
- Flag compound concepts (X/Y, X and Y)
- Auto-split non-atomic templates before execution
- Escalate to T2 if T1 duration exceeds 60s threshold

---

## Session Results - Continuation

### Test with 5-Task Template (Before Fix)

**Test Run ID**: `22462e` (test-dashboard-build.ts)

| Task | Description | Duration | Confidence |
|------|-------------|----------|------------|
| 1 | Create TypeScript interface | 58.8s | 50% |
| 2 | Create component skeleton | 23.9s | 50% |
| 3 | Add JSX markup structure | 62.9s | 50% |
| 4 | Add event handlers | **177.1s** | 50% |
| 5 | Add loading/error states | **197.7s** | **10%** |

**Results**:
- Total Duration: 520.4s
- Avg Duration/Task: **104.1s** (target: <60s)
- Success Rate: 100% (5/5) - but Task 5 barely completed
- Grade: **C (73/100)**

**Issues Identified**:
- Task 4 took 177s (3x expected)
- Task 5 took 198s with 10% confidence (nearly timed out)
- Low confidence indicates agents doing excessive exploration

### Root Cause Analysis

**User observation**: "is enough context being passed to the subagents for them to complete the task quickly? it seems like theyre also doing research or investigations"

**Investigation Found**:
1. Context hints from `mdap-atomicity.ts` were NOT being passed to agents
2. File contents were not pre-read before agent execution
3. TDD instructions in `buildImplementerPrompt()` are essential (user confirmed: "dont skip tdd, its essential to working code")
4. The issue is **lack of CONTEXT**, not TDD overhead

### Context Passing Fix (cfn-implementer-v2.ts)

**Changes Made**:

1. **Added to payload interface**:
```typescript
contextHints?: string[];
fileContents?: Array<{ path: string; content: string }>;
```

2. **Enhanced prompt building**:
```typescript
// Context hints section
if (contextHints?.length > 0) {
  sections.push(`**Context Hints**:\n${contextHints.map(h => `- ${h}`).join('\n')}`);
}

// Pre-read file contents
if (fileContents?.length > 0) {
  sections.push(`**File Contents** (pre-read to avoid exploration):`);
  for (const fc of fileContents) {
    sections.push(`\`${fc.path}\`:\n\`\`\`\n${fc.content}\n\`\`\``);
  }
}
```

3. **test-dashboard-build.ts**: Now pre-reads files and passes to implementer

### 7-Task Template Verified Working

**Test**: `test-atomicity-count.ts`

```
[mdap] Decomposed into 7 micro-tasks:
  1. Create TypeScript interface for component props
  2. Create empty component skeleton with props type
  3. Add JSX markup structure
  4. Add click handler for primary action (NEW - split from "handlers")
  5. Add refresh handler with loading state (NEW - split from "handlers")
  6. Add loading state indicator (NEW - split from "loading/error")
  7. Add error state display (NEW - split from "loading/error")

Result: PASS - 7 tasks generated
```

### Remaining Work

1. **Re-run test with 7 tasks + context passing** - Dev server needs restart with updated code
2. **Validate execution times** - Target <60s per atomic task
3. **Check confidence improvement** - Should see 50%+ with context hints

### Files Modified This Session

| File | Change |
|------|--------|
| `docker/trigger-dev/src/trigger/cfn-implementer-v2.ts` | Added contextHints and fileContents to payload and prompt |
| `docker/trigger-dev/test-dashboard-build.ts` | Pre-read files before triggering implementer |
| `docker/trigger-dev/src/lib/mdap-atomicity.ts` | Already had 7-task template from previous session |

### Key Insights

1. **Context is crucial** - Agents without pre-read file contents spend time exploring
2. **TDD is essential** - User explicitly confirmed: "test-as-voter" validation is core to MDAP
3. **Atomicity alone isn't enough** - Need both atomic tasks AND rich context
4. **MDAP principle**: If task >60s on T1, either task isn't atomic enough OR context is missing

### Next Session Actions

1. Restart dev server to pick up `cfn-implementer-v2.ts` changes
2. Run `test-dashboard-build.ts` to validate context passing improvement
3. Compare: Before (5 tasks, no context) vs After (7 tasks, with context)
4. Expected improvement: Grade C → B+ (73 → 85+)

---

**Status**: Context passing fix implemented, awaiting validation test
**Previous Test**: 22462e (5 tasks, C grade, 104s avg)
**Template Status**: 7-task decomposition verified working
