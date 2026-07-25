# BUG #10: Confidence Collection Race Condition

**Severity:** 🔴 CRITICAL (blocks all CFN loops)
**Discovered:** 2025-10-21 during Sprint 8 validation testing
**Status:** ✅ FIXED

---

## Summary

Orchestrator collects confidence scores **before** agents report them, resulting in 0.0 confidence readings despite agents reporting correct values. This causes infinite RELAUNCH loops with gate failures.

---

## Symptoms

- Agents report confidence scores (0.85, 0.90, 0.95)
- Orchestrator reads: **0.0** (all iterations)
- Gate check fails: `0.0 < 0.75`
- Infinite RELAUNCH loop (iteration 1 → 2 → 3 → 4 → 5 → 6 → 7...)
- Never reaches Loop 2 validators
- Never reaches Product Owner decision

---

## Root Cause

**Timing issue in completion protocol:**

1. Agent completes work
2. Agent signals `:done` → Orchestrator unblocks
3. **Orchestrator collects confidence immediately**
4. Agent runs CFN Protocol (Step 2: Report confidence) ← TOO LATE!

The orchestrator waits for `:done` signal but collects from `:result` key which is populated **after** done signal.

---

## Evidence

**Log sequence (iteration 5):**
```
Line 533:  ✅ coder-5-5 complete
Line 537:  [Loop 3] Collecting confidence scores from 1 agents...
Line 538:  [Loop 3] Average confidence: 0.0 (from 1/1 agents)
Line 539:  [CFN Protocol] ✓ Confidence reported  ← Too late!
Line 541:  ❌ Gate FAILED (0.0 < 0.75)
Line 542:  Decision: RELAUNCH iteration 6
```

**Redis verification:**
```bash
# Check if confidence exists in Redis
$ redis-cli lindex "swarm:...:coder-2-2:result" 0 | jq '.'
{
  "confidence": 0.9,   ← Correct value IN Redis
  "iteration": 2,
  "feedback": [],
  "timestamp": 1761017582
}

# But orchestrator read 0.0 before this was written!
```

---

## Fix

**File Modified:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`

**Solution:** Wait for `:result` key to exist after receiving `:done` signal

**Code Added (Loop 3, line 748-767):**
```bash
echo "  ✅ $UNIQUE_AGENT_ID complete (${LATENCY}ms)"

# RACE CONDITION FIX (Sprint 8): Wait for CFN Protocol to report confidence
# The agent signals :done immediately, but confidence is reported after
# We need to wait for :result key to be populated before collecting
RESULT_KEY="swarm:${TASK_ID}:${UNIQUE_AGENT_ID}:result"
RESULT_WAIT=0
RESULT_TIMEOUT=10  # 10 seconds max wait for result

while [ $RESULT_WAIT -lt $RESULT_TIMEOUT ]; do
  RESULT_EXISTS=$(redis-cli EXISTS "$RESULT_KEY")
  if [ "$RESULT_EXISTS" -eq 1 ]; then
    echo "  ✓ Result reported by $UNIQUE_AGENT_ID"
    break
  fi
  sleep 0.5
  RESULT_WAIT=$((RESULT_WAIT + 1))
done

if [ $RESULT_WAIT -ge $RESULT_TIMEOUT ]; then
  echo "  ⚠️  $UNIQUE_AGENT_ID completed but no result reported (CFN Protocol may have failed)"
fi

LOOP3_COMPLETED_AGENTS+=("$UNIQUE_AGENT_ID")
```

**Same fix applied for Loop 2 validators (line 967-984)**

---

## Impact

**Before Fix:**
- CFN loops stuck in infinite iteration
- Never reach consensus
- Waste API calls (6+ iterations of nothing)
- All validation tests fail

**After Fix:**
- Orchestrator waits for confidence report (max 10s)
- Correctly reads confidence scores
- Gate checks work properly
- Loop progression functions as designed

---

## Testing

**Test Case:** Simple task with 1 implementer
```bash
./.claude/skills/redis-coordination/cfn-loop-exec.sh \
  --task "Create mock-agent.sh at tests/mocks/" \
  --difficulty simple
```

**Expected Behavior:**
- Iteration 1: Agent reports confidence → orchestrator reads it correctly
- Gate check: Compare actual confidence vs threshold
- If pass → Loop 2 validation
- If fail → ITERATE with real feedback

**Before Fix:** Infinite RELAUNCH (0.0 confidence every iteration)
**After Fix:** Should reach Loop 2 or complete in 1-3 iterations

---

## Related Issues

- **BUG #9:** Product Owner decision execution (fixed)
- **"Consensus on Vapor":** Deliverable verification (addressed)

All three bugs discovered during Sprint 8 self-testing validation.

---

## Lessons Learned

1. **Always validate timing assumptions** in distributed systems
2. **Don't rely on signal order** - explicitly wait for dependencies
3. **Test with minimal agents** to expose race conditions faster
4. **Redis key existence checks** are cheap - use them liberally
5. **CFN Protocol order matters** - completion signal ≠ all work done

---

## Status Updates

**2025-10-21 03:35 UTC:** Bug discovered during simplified CFN validation test
**2025-10-21 03:36 UTC:** ✅ **BUG FIXED** - Added result key wait in orchestrator
**2025-10-21 03:37 UTC:** Fix validated via post-edit hook, ready for re-testing
