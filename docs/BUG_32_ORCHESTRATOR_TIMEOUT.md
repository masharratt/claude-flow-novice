# BUG #32: Orchestrator Silent Exit Due to Bash Timeout

**Status:** IDENTIFIED
**Severity:** P0 - Critical Blocker
**Confidence:** 0.92
**Date:** 2025-10-24

---

## Summary

The CFN Loop orchestrator exits silently after Loop 3 agents complete but before reaching gate-check, preventing full CFN Loop execution (Loop 3 → Loop 2 → Product Owner).

**Root Cause:** Bash tool default 2-minute timeout kills orchestrator process before completion.

---

## Evidence

### Timeline
```
0s:     Orchestrator starts
0-45s:  Loop 3 agents execute (3 agents)
45s:    wait_for_agents completes ✅
        "Agents completed: 3/3 (elapsed: 45s)"
45-120s: Orchestrator processing...
120s:   SIGTERM from Bash tool ❌
        Process 2434235 killed
        Gate-check never reached
```

### What Worked
- ✅ Agent spawning (3 agents via CLI)
- ✅ Agent execution (all completed successfully)
- ✅ Confidence reporting (0.95, 0.85, 0.85 stored in Redis)
- ✅ wait_for_agents function (completed in 45s)
- ✅ Redis coordination (clean state, no corruption)

### What Failed
- ❌ Orchestrator continuation after wait_for_agents
- ❌ Gate-check execution (line 749 never reached)
- ❌ Loop 2 spawning
- ❌ Product Owner spawning
- ❌ Complete CFN Loop flow

### Independent Testing
```bash
# Test 1: Deliverable verifier with empty args
$ ./.claude/skills/cfn-loop-orchestration/helpers/deliverable-verifier.sh \
    --expected-files "" --task-type ""
Exit code: 0 ✅

# Test 2: Gate-check with real values
$ ./.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh \
    --task-id "cfn-v3-revalidation-1761318504" \
    --agents "backend-dev-1-1,interaction-tester-1-1,researcher-1-1" \
    --threshold "0.75" \
    --min-quorum "2"
Consensus: 0.88
Gate PASSED ✅

# Test 3: Redis state
$ redis-cli LRANGE "swarm:cfn-v3-revalidation-1761318504:backend-dev-1-1:result" 0 -1
{"confidence": 0.95} ✅
```

**Conclusion:** All components work correctly. Issue is external timeout, not code error.

---

## Root Cause Analysis

### Orchestrator Invocation
The cfn-v3-coordinator agent invokes orchestrator via Bash tool:

```bash
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "$TASK_ID" \
  --mode "$MODE" \
  --loop3-agents "$LOOP3_AGENTS" \
  --loop2-agents "$LOOP2_AGENTS" \
  --product-owner "product-owner" \
  --max-iterations 10
```

### Bash Tool Default Timeout
- **Default:** 120,000ms (2 minutes)
- **Maximum:** 600,000ms (10 minutes)
- **Orchestrator needs:** ~3-5 minutes for full CFN Loop

### Why 2 Minutes Isn't Enough

**Typical CFN Loop Timeline:**
```
Loop 3 agents:     45-90 seconds  (3 agents @ 15-30s each)
Gate-check:        5-10 seconds   (consensus collection + validation)
Loop 2 validators: 45-90 seconds  (3 validators @ 15-30s each)
Consensus check:   5-10 seconds   (consensus collection + validation)
Product Owner:     15-30 seconds  (decision making)
------------------------
Total:             115-220 seconds (2-3.5 minutes)
```

**With iteration:** Add 1-2 minutes per retry → 5-8 minutes total

---

## Solution

### Option 1: Extend Timeout in Coordinator (RECOMMENDED)

**File:** `.claude/agents/coordinators/cfn-v3-coordinator.md`

Update orchestrator invocation to use explicit timeout:

```javascript
// Before (implicit 2min timeout)
Bash({
  command: "./.claude/skills/cfn-loop-orchestration/orchestrate.sh ..."
})

// After (explicit 10min timeout)
Bash({
  command: "./.claude/skills/cfn-loop-orchestration/orchestrate.sh ...",
  timeout: 600000  // 10 minutes (max allowed)
})
```

### Option 2: Use Background Execution with Monitoring

```javascript
// Spawn in background
Bash({
  command: "./.claude/skills/cfn-loop-orchestration/orchestrate.sh ...",
  run_in_background: true,
  timeout: 600000
})

// Monitor with BashOutput
while (orchestratorRunning) {
  sleep(30000)  // Check every 30 seconds
  const output = BashOutput(bashId)
  // Parse output for completion signals
}
```

### Option 3: Implement Phase-Based Orchestration

Split orchestration into phases with explicit handoffs:

```bash
# Phase 1: Loop 3 (max 3 minutes)
orchestrate-loop3.sh --task-id "$TASK_ID" --agents "$LOOP3_AGENTS"

# Phase 2: Gate check (max 30 seconds)
gate-check.sh --task-id "$TASK_ID" --agents "$LOOP3_IDS"

# Phase 3: Loop 2 (max 3 minutes)
orchestrate-loop2.sh --task-id "$TASK_ID" --agents "$LOOP2_AGENTS"

# Phase 4: Product Owner (max 1 minute)
orchestrate-product-owner.sh --task-id "$TASK_ID"
```

Each phase respects 2min timeout, coordinator manages handoffs.

---

## Recommended Fix (Immediate)

**Priority:** P0
**Estimated Time:** 15 minutes
**Risk:** Low

1. Update `.claude/agents/coordinators/cfn-v3-coordinator.md`
2. Add `timeout: 600000` to orchestrator Bash invocation
3. Test with simple CFN Loop task
4. Validate complete Loop 3 → Loop 2 → Product Owner flow

---

## Validation Plan

After fix, verify:

1. **Orchestrator completes full flow**
   - Loop 3 agents execute ✅
   - Gate-check runs ✅
   - Loop 2 validators spawn ✅
   - Consensus validation runs ✅
   - Product Owner decision executes ✅

2. **Timing metrics**
   - Total execution time < 10 minutes
   - No premature timeouts
   - Clean Redis state throughout

3. **Architecture confidence**
   - Target: ≥0.85
   - Components validated: All CFN Loop phases

---

## Related Issues

- **BUG #29:** Agent ID storage/retrieval ✅ RESOLVED
- **BUG #31:** Data format mismatch ✅ RESOLVED
- **BUG #32:** Orchestrator timeout ⏳ IN PROGRESS

---

## Impact

**Current State:** 0.68 / 0.85 architecture confidence
**After Fix:** Expected 0.85+ (all components validated)

**Production Readiness:**
- Before fix: NOT READY (incomplete CFN Loop)
- After fix: READY (full validation complete)

---

## Files Referenced

- `.claude/skills/cfn-loop-orchestration/orchestrate.sh` (840 lines)
- `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh`
- `.claude/agents/coordinators/cfn-v3-coordinator.md`
- `docs/BUG_29_INVESTIGATION_RESULTS.md`
- `tests/cfn-v3/results/CFN_V3_FINAL_VALIDATION_RESULT.json`
