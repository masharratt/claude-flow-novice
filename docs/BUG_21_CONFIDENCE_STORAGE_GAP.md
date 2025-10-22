# BUG #21: Confidence Storage Gap in Loop 3 Processing

**Date:** 2025-10-21
**Priority:** P0 (Blocking CFN Loop execution)
**Status:** 🐛 IDENTIFIED
**Severity:** Critical - Causes all tasks to fail gate check

---

## Summary

The Loop 3 skill script (`execute-and-extract.sh`) correctly extracts agent confidence scores (0.85, 1.0, etc.) and returns them to the orchestrator, but the orchestrator never stores these scores in Redis. When it later calls `invoke-waiting-mode.sh collect` to calculate consensus, Redis has no confidence data, returning 0.0 and causing all tasks to fail the gate check (threshold 0.75).

---

## Evidence

### Orchestrator Log (P1/P2 Validation Run)

```
  ✅ coder-1-1 complete (153054ms, confidence: 1.0 [explicit], files: 1)
[Loop 3] ✅ Quorum met: 1/1 agents completed
[Loop 3] Collecting confidence scores from 1 agents...
[Loop 3] Average confidence: 0.0 (from 1/1 agents)

❌ Gate FAILED (0.0 < 0.75)
```

**Analysis:**
- Agent reports `confidence: 1.0`
- Orchestrator logs it correctly
- But consensus collection returns `0.0`

### Redis Verification

```bash
$ redis-cli LRANGE "swarm:cfn-phase-1761069192:coder-3-3:result" 0 -1
{
  "confidence": 0.85,
  "iteration": 1,
  "feedback": [],
  "timestamp": 1761069781
}
```

**Key Finding:** This Redis key `swarm:{task}:{agent}:result` is created by `execute-and-extract.sh` AFTER agent execution, BUT it stores the result BEFORE the orchestrator reads it. The orchestrator doesn't use this key for consensus.

### Expected vs Actual Flow

**Expected:**
```
1. Skill script extracts confidence → Returns JSON to orchestrator
2. Orchestrator reads confidence → Stores via invoke-waiting-mode.sh report
3. Orchestrator calls invoke-waiting-mode.sh collect → Reads from Redis
4. Consensus calculated → Gate check passes
```

**Actual (Broken):**
```
1. Skill script extracts confidence → Returns JSON to orchestrator ✅
2. Orchestrator reads confidence → ❌ DOES NOT store in Redis
3. Orchestrator calls invoke-waiting-mode.sh collect → Redis empty → Returns 0.0
4. Consensus = 0.0 → Gate check fails
```

---

## Root Cause

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
**Location:** Lines 860-945 (Loop 3 agent processing)

**Missing Step:**

After line 889 where confidence is logged:
```bash
echo "  ✅ $UNIQUE_AGENT_ID complete (${LATENCY}ms, confidence: $CONFIDENCE [$CONFIDENCE_SOURCE], files: $FILES_CHANGED)"
```

**Should add:**
```bash
# Store confidence in Redis for consensus collection
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$UNIQUE_AGENT_ID" \
  --confidence "$CONFIDENCE" \
  --iteration "$ITERATION" >/dev/null
```

---

## Why This Bug Exists

### Historical Context

This bug was introduced when P3 transitioned from "agents report directly" to "skill scripts extract and return confidence":

**Old Pattern (Pre-P3):**
- Agents called `invoke-waiting-mode.sh report` themselves
- Confidence stored directly in Redis
- Orchestrator called `collect` to aggregate

**New Pattern (Post-P3 with Skill Scripts):**
- Skill scripts extract confidence from agent output
- Return JSON to orchestrator
- ❌ **FORGOT to store in Redis** (assumed extraction = storage)
- Orchestrator still calls `collect` expecting Redis data

### Why It Went Unnoticed

1. **P1/P2 focused on monitoring/logging** - didn't test full CFN Loop execution
2. **P3-P7 were simplification/documentation** - assumed existing code worked
3. **No integration tests** validating end-to-end confidence flow
4. **execute-and-extract.sh creates Redis key** - misleading, orchestrator doesn't use it

---

## Impact Assessment

### Tasks Affected

**ALL CFN Loop tasks fail at gate check:**
- Simple file creation → FAILS
- Complex implementations → FAILS
- High-confidence agents (0.95+) → FAILS
- Low-confidence agents (0.60) → FAILS

### Severity Levels

| Confidence | Expected Result | Actual Result | Impact |
|-----------|----------------|---------------|--------|
| 1.0 | ✅ Pass (1.0 > 0.75) | ❌ Fail (0.0 < 0.75) | Critical |
| 0.85 | ✅ Pass (0.85 > 0.75) | ❌ Fail (0.0 < 0.75) | Critical |
| 0.75 | ✅ Pass (0.75 = 0.75) | ❌ Fail (0.0 < 0.75) | Critical |
| 0.60 | ❌ Fail (0.60 < 0.75) | ❌ Fail (0.0 < 0.75) | Expected failure |

**Result:** 100% of tasks that should pass are failing.

---

## Proposed Fix

### Option 1: Store After Skill Processing (Recommended)

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
**Location:** After line 889

**Add:**
```bash
# Store confidence in Redis for consensus collection
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$UNIQUE_AGENT_ID" \
  --confidence "$CONFIDENCE" \
  --iteration "$ITERATION" >/dev/null
```

**Pros:**
- Minimal change (3 lines)
- Preserves existing `collect` logic
- Works with all agent types
- No breaking changes

**Cons:**
- Stores confidence in two places (skill script Redis key + invoke-waiting-mode Redis key)

### Option 2: Change Collect to Read Skill Script Redis Key

**File:** `.claude/skills/redis-coordination/invoke-waiting-mode.sh`
**Location:** `collect` subcommand (lines 126-194)

**Change:**
```bash
# OLD: Read from swarm:{task}:{agent}:result (never written)
RESULT_KEY="swarm:${TASK_ID}:${AGENT}:result"

# NEW: Read from swarm:{task}:{agent}:skill-result (written by skill script)
RESULT_KEY="swarm:${TASK_ID}:${AGENT}:skill-result"
```

**Pros:**
- Uses existing skill script Redis storage
- Removes Redis duplication

**Cons:**
- Requires changes to `invoke-waiting-mode.sh` (more complex)
- May break other parts that expect old key format
- Higher risk

**Recommendation:** Use Option 1 (simpler, safer).

---

## Validation Plan

After applying fix, validate with:

### Test 1: Simple File Creation (P1/P2 Validation)

```bash
TASK_ID="cfn-phase-$(date +%s)"

EPIC_CONTEXT_JSON='{
  "epicGoal": "Validate bug fix with simple file creation task",
  "inScope": ["File creation", "Content verification"],
  "outOfScope": ["Complex logic"]
}'

PHASE_CONTEXT_JSON='{
  "currentPhase": "bug21-validation",
  "deliverables": ["/tmp/bug21-test.txt"],
  "directory": "/tmp"
}'

SUCCESS_CRITERIA_JSON='{
  "acceptanceCriteria": [
    "File /tmp/bug21-test.txt created",
    "File contains text",
    "No errors during creation"
  ],
  "gateThreshold": 0.75,
  "consensusThreshold": 0.90
}'

./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "coder" \
  --loop2-agents "reviewer" \
  --max-iterations 3 \
  --epic-context "$EPIC_CONTEXT_JSON" \
  --phase-context "$PHASE_CONTEXT_JSON" \
  --success-criteria "$SUCCESS_CRITERIA_JSON"
```

**Expected:**
```
✅ coder-1-1 complete (confidence: 1.0)
[Loop 3] Average confidence: 1.0 (from 1/1 agents)
✅ Gate PASSED (1.0 > 0.75)
[Loop 2] Spawning validators...
```

### Test 2: Redis Verification

```bash
# Check Redis has confidence stored
redis-cli LRANGE "swarm:${TASK_ID}:coder-1-1:result" 0 -1

# Expected output:
{
  "confidence": 1.0,
  "iteration": 1,
  "feedback": [],
  "timestamp": 1234567890
}
```

### Test 3: Full P1-P7 Validation Suite

After bug fix, run comprehensive validation across all priorities.

---

## Lessons Learned

### What Went Wrong

1. **Assumed extraction = storage** - Skill script extracts confidence but doesn't store it where orchestrator expects
2. **No integration tests** - Unit tests for skill script passed, but end-to-end flow failed
3. **Silent failure** - Orchestrator logs correct confidence, then silently reads 0.0 from Redis without error
4. **Misleading Redis keys** - `execute-and-extract.sh` creates `swarm:{task}:{agent}:result` but orchestrator doesn't use it

### Prevention Strategies

1. **Integration Testing:** Add end-to-end tests that verify Redis storage AND retrieval
2. **Explicit Storage:** Make Redis storage explicit in code (not implicit in skill scripts)
3. **Error Handling:** Orchestrator should warn if `collect` returns 0.0 when agents reported non-zero
4. **Documentation:** Document exact Redis key formats and which component owns each key

---

## Success Metrics

✅ **Bug identified and root cause documented**
⏳ **Fix implemented** (pending)
⏳ **Tests pass** (pending)
⏳ **P1-P7 validation successful** (pending)

---

## Related Issues

- **BUG #20 (Consensus on Vapor):** Different issue - validators approved plans without deliverables
- **P1 (Coordinator Monitoring):** Fixed coordinator exit, but didn't test CFN Loop execution
- **P2 (SQLite Logging):** Added logging, but didn't validate confidence storage
- **P3 (Agent Lifecycle):** Introduced skill scripts, created this bug inadvertently

---

**Document Version:** 1.0
**Author:** Main Chat (CFN Loop Validation Session)
**Next:** Implement Option 1 fix and validate
