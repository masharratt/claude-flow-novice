# TypeScript Pre-Check Feature for Agent Workflows

## Overview

This document describes the TypeScript pre-check feature that can be added to agent workflows to validate errors exist before invoking agents and include specific error details in prompts.

## Motivation

Currently, agents receive generic prompts like "Fix TypeScript errors in /workspace/file.ts". This approach has limitations:

1. **No validation** that errors actually exist
2. **No context** about what errors to fix
3. **No metrics** on fix effectiveness (errors before vs after)
4. **Wasted agent invocations** on files with no errors

## Solution: Pre-Check Pattern

Add TypeScript validation **before** and **after** agent execution:

```bash
# BEFORE agent execution
TSC_CHECK=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "$FILE.*error TS" || echo "")
ERROR_COUNT=$(echo "$TSC_CHECK" | grep -c "error TS" || echo "0")

# Skip if no errors
if [ "$ERROR_COUNT" -eq 0 ]; then
    echo "✅ No errors - skipping"
    exit 0
fi

# Include error details in prompt
ERROR_DETAILS=$(echo "$TSC_CHECK" | head -10)
PROMPT="Fix TypeScript errors in /workspace/$FILE

Errors found:
$ERROR_DETAILS"

# AFTER agent execution
TSC_RECHECK=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "$FILE.*error TS" || echo "")
ERRORS_REMAINING=$(echo "$TSC_RECHECK" | grep -c "error TS" || echo "0")
FIXES_APPLIED=$((ERROR_COUNT - ERRORS_REMAINING))
```

## Benefits

### 1. Skip Unnecessary Work
If a file has no TypeScript errors (or they were already fixed), the agent isn't invoked at all:
- ✅ Saves API costs
- ✅ Reduces execution time
- ✅ Prevents false positives in metrics

### 2. Provide Context to Agents
Instead of blind fixing, agents see actual error messages:

**Without Pre-Check**:
```
Fix TypeScript errors in /workspace/file.ts using Edit tool.
```

**With Pre-Check**:
```
Fix TypeScript errors in /workspace/file.ts using Edit tool.

Errors found:
src/file.ts:42:12 - error TS2304: Cannot find name 'Foo'.
src/file.ts:58:5 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```

### 3. Measure Fix Effectiveness
Track actual fixes applied vs errors remaining:
```
📊 Errors before: 5
📊 Errors after: 0
✅ Fixes applied: 5/5
```

### 4. Accurate Metrics
Report real error counts to Redis for better coordinator visibility:
```bash
redis-cli HSET "task:$TASK_NUM:result" \
    "errors_before" "$ERROR_COUNT" \
    "errors_after" "$ERRORS_REMAINING" \
    "fixes_applied" "$FIXES_APPLIED"
```

## Implementation

### Updated Worker Script

See: `tests/docker/b10-typescript-fix/agent-worker-with-precheck.sh`

Key changes:
1. **Pre-check** (lines 42-63): Validate errors exist, skip if none
2. **Error context** (lines 72-76): Include error details in prompt
3. **Post-check** (lines 88-90): Measure fixes applied
4. **Metrics** (lines 100-115): Report detailed statistics

### Example Output

```
🤖 Agent b10-agent-1 starting...
📝 Agent b10-agent-1 claimed task #1
   File: src/services/auth/TokenManager.ts
   Expected errors: 2
   ✅ File exists
   🔍 Pre-checking TypeScript errors...
   📊 Pre-check found 2 TypeScript errors
   🔧 Invoking Claude Code CLI to fix TypeScript errors...
   📁 File: /workspace/src/services/auth/TokenManager.ts
   🔍 Hash before: abc123def456
   🔍 Post-checking TypeScript errors...
   ⏱️  CLI completed in 12s (exit: 0)
   🔍 Hash after: fed654cba321
   📝 File changed: true
   📊 Errors before: 2
   📊 Errors after: 0
   ✅ All TypeScript errors fixed!
```

## Performance Considerations

### Cost Analysis

**Per-file TypeScript check time**: ~3-5 seconds

For 32 files in parallel:
- Pre-check: ~5s (parallel, single tsc run covers all files)
- Post-check: ~5s (parallel, single tsc run covers all files)
- **Total overhead**: ~10s

**Agent execution time**: ~15-30s per file

**Trade-off**:
- ✅ 10s overhead for validation
- ✅ Skip files with no errors (save 15-30s each)
- ✅ Better context = fewer iterations = faster fixes
- ✅ Accurate metrics for debugging

### Optimization: Batch Validation

Instead of running `tsc` per file, run once and filter:

```bash
# Coordinator pre-generates error map
TSC_OUTPUT=$(npx tsc --noEmit --project tsconfig.json 2>&1)

# Workers filter to their file
for i in $(seq 1 $NUM_AGENTS); do
    FILE_ERRORS=$(echo "$TSC_OUTPUT" | grep "$FILE.*error TS")
    # Pass FILE_ERRORS to worker via Redis
done
```

This reduces pre-check time from 5s×32 = 160s to single 5s run.

## Comparison: With vs Without Pre-Check

### Without Pre-Check (Current B10 Test)
```
✅ Tasks completed: 32/32
✅ Files modified: 31/31
⚠️  No per-file error metrics
⚠️  No validation errors existed
⚠️  No measurement of fixes applied
```

**Result**: All files modified, but we don't know:
- How many errors were actually fixed
- If any files had no errors to begin with
- Effectiveness of each fix

### With Pre-Check (Proposed)
```
✅ Tasks completed: 32/32
✅ Files with errors: 31/32 (1 skipped - no errors)
✅ Errors before: 87
✅ Errors after: 0
✅ Fixes applied: 87/87
✅ Fix rate: 100%
```

**Result**: Precise metrics on:
- Files actually needing fixes
- Total errors resolved
- Fix effectiveness per file
- Cost savings from skipped files

## Recommendations

### 1. Add Pre-Check to Production Workflows
Use `agent-worker-with-precheck.sh` as template for:
- TypeScript batch fixes
- ESLint fixes
- Code quality improvements
- Any automated fix pattern

### 2. Batch Pre-Validation at Coordinator Level
Move TypeScript validation to coordinator:
```bash
# Coordinator runs ONCE
TSC_OUTPUT=$(npx tsc --noEmit 2>&1)

# Store in Redis for workers
redis-cli SET "task:tsc-output" "$TSC_OUTPUT"

# Workers retrieve and filter
TSC_OUTPUT=$(redis-cli GET "task:tsc-output")
FILE_ERRORS=$(echo "$TSC_OUTPUT" | grep "$FILE.*error TS")
```

### 3. Use Error Context in Prompts
Always include actual error messages in prompts:
```bash
PROMPT="Fix TypeScript errors in /workspace/$FILE

Errors found:
$ERROR_DETAILS"
```

### 4. Track Metrics for Debugging
Store before/after error counts for analysis:
```bash
"errors_before": 5,
"errors_after": 0,
"fixes_applied": 5,
"fix_rate": 1.0
```

## Next Steps

1. ✅ Created enhanced worker script with pre-check
2. 🔄 Test with B10 batch using new script
3. 🔄 Compare metrics: with vs without pre-check
4. 🔄 Add batch optimization at coordinator level
5. 🔄 Document best practices for other fix patterns

## Related Files

- **Enhanced worker**: `tests/docker/b10-typescript-fix/agent-worker-with-precheck.sh`
- **Current worker**: `tests/docker/b10-typescript-fix/agent-worker.sh`
- **Coordinator**: `tests/docker/b10-typescript-fix/coordinator.sh`
- **Success report**: `docs/B10_TYPESCRIPT_FIX_SUCCESS.md`

## Conclusion

Adding TypeScript pre-check provides:
- ✅ Cost savings by skipping unnecessary work
- ✅ Better agent context with actual error messages
- ✅ Accurate metrics on fix effectiveness
- ✅ Validation that errors exist before fixing

**Overhead**: ~10s for validation
**Benefit**: Better fixes, accurate metrics, cost savings

Recommended for all automated fix workflows.
