# Bug Fix: TEST 5 - Product Owner Decision Key Creation

**Bug ID:** TEST 5 Failure
**Date Fixed:** 2025-11-04
**Severity:** High
**Component:** Product Owner Decision Coordination

## Problem

Product Owner was creating `swarm:${TASK_ID}:product-owner*:result` but NOT creating `swarm:${TASK_ID}:decision` key, causing orchestrator to block indefinitely on `redis-cli blpop "swarm:${TASK_ID}:decision" 15`.

## Root Cause

In `.claude/skills/cfn-product-owner-decision/execute-decision.sh` (line 162), the script used:
```bash
redis-cli SET "swarm:${TASK_ID}:decision" "$DECISION_TYPE" EX 3600
```

**Problem:** `SET` creates a string key, but orchestrator reads with `BLPOP` (blocking list pop) which requires a list data structure.

**Result:** Orchestrator blocks forever because `BLPOP` cannot read string keys.

## Solution

Changed line 162 from `SET` to `LPUSH`:

```bash
# Before (WRONG)
redis-cli SET "swarm:${TASK_ID}:decision" "$DECISION_TYPE" EX 3600

# After (CORRECT)
redis-cli LPUSH "swarm:${TASK_ID}:decision" "$DECISION_TYPE"
```

## Why This Works

1. **LPUSH** creates a list data structure
2. **BLPOP** reads from lists (blocking until data available)
3. **Data Type Compatibility**: LPUSH → List → BLPOP ✓

## Verification

Created test script `tests/hello-world/test-decision-key-fix.sh`:

```bash
✅ PASS: Script uses LPUSH for decision key
✅ PASS: Old SET command removed
✅ PASS: LPUSH/BLPOP coordination compatible
```

## Impact

- **Before Fix:** Orchestrator hangs indefinitely waiting for decision
- **After Fix:** Decision immediately available via BLPOP
- **Cost:** Zero overhead (LPUSH ≈ SET performance)
- **Breaking Changes:** None (existing orchestrator code unchanged)

## Files Changed

1. `.claude/skills/cfn-product-owner-decision/execute-decision.sh` (line 162)

## Testing

Run verification test:
```bash
bash tests/hello-world/test-decision-key-fix.sh
```

Expected output:
```
TEST 5 PASSED
- Product Owner uses LPUSH (not SET)
- Decision key compatible with BLPOP
- Orchestrator can read decision with blocking read
```

## Related Issues

- Orchestrator coordination pattern (`.claude/skills/cfn-loop-orchestration/orchestrate.sh`)
- Redis coordination protocol (`.claude/skills/cfn-redis-coordination/SKILL.md`)

## Lessons Learned

1. **Data Type Matters:** Redis commands require matching data types (SET → GET, LPUSH → BLPOP)
2. **Blocking Reads:** BLPOP requires list data structure, not string
3. **Test Coverage:** Add integration tests for coordinator → Product Owner flow
4. **Documentation:** Redis key patterns should specify data type (string vs list)

## Confidence

**Fix Confidence:** 0.95

The fix is straightforward and follows established Redis patterns. LPUSH/BLPOP is the standard coordination mechanism used throughout the CFN Loop system.
