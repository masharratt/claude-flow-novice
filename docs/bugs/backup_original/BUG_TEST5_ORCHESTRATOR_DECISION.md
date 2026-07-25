# Bug Report: TEST 5 - Product Owner Decision Key Not Created

**Bug ID:** TEST 5 Orchestrator Decision Flow
**Date Reported:** 2025-11-04
**Severity:** High
**Component:** CFN Loop Orchestration - Product Owner Decision

## Problem

TEST 5 fails because the `swarm:${TASK_ID}:decision` key is never created, causing the orchestrator (or test) to block indefinitely on `redis-cli blpop "swarm:${TASK_ID}:decision" 15`.

## Current Behavior

1. ✅ Coordinator invokes orchestrator successfully (TEST 1 PASSED)
2. ✅ Loop 3 agents spawn and report confidence (TEST 2 PASSED)
3. ✅ Loop 2 validators spawn (TEST 4 PASSED)
4. ✅ Product Owner spawns and creates `swarm:*:product-owner*:result` key
5. ❌ Decision key `swarm:${TASK_ID}:decision` is **never created**
6. ❌ TEST 5 times out waiting for decision key

## Root Cause Investigation

### Hypothesis 1: Product Owner Agent Not Creating Decision Key
From `BUG_TEST5_DECISION_KEY_FIX.md`:
- `.claude/skills/cfn-product-owner-decision/execute-decision.sh:206` uses `redis-cli LPUSH "swarm:${TASK_ID}:decision" "$DECISION_TYPE"`
- This is correct (LPUSH for BLPOP coordination)

### Hypothesis 2: Orchestrator Not Invoking Product Owner Decision Script
According to `BUG #11` fix documentation:
- Orchestrator should spawn Product Owner and extract decision from output
- Uses `.claude/skills/product-owner-decision/execute-decision.sh`
- Orchestrator pushes decision to Redis (not agent)

**CRITICAL GAP:** Need to verify which approach is actually implemented:
- Option A: Agent creates decision key directly (via execute-decision.sh)
- Option B: Orchestrator extracts decision from agent output and pushes to Redis

### Hypothesis 3: Product Owner Agent Not Using Decision Skill
Product Owner agent may be completing without invoking the decision skill that creates the Redis key.

## Evidence

### Test Results
```
TEST 5: Product Owner Decision Execution
[INFO] Waiting for pattern: swarm:e2e-test-*:product-owner*:result (timeout: 45s)
[PASS] Product Owner decision: Found 1 keys after 0s
[INFO] Waiting for Redis key: swarm:e2e-test-*:decision (timeout: 15s)
[FAIL] Timeout waiting for key: swarm:e2e-test-*:decision (15s)
```

### Redis Keys Present
```bash
# Product Owner created result but NOT decision
swarm:e2e-test-*:product-owner-*-1:result ✅
swarm:e2e-test-*:decision                 ❌ (missing)
```

### Coordinator Log
```
[executeWithTools] Iteration 5
[tool-executor] Bash command: ./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "e2e-test-1762265061" \
  --mode "standard" \
  --loop3-agents "coder,backend-dev" \
  --loop2-agents "reviewer,tester" \
  --product-owner "product-owner" \
  --max-iterations 10
[tool-executor] Timeout: 120000ms
[tool-executor] Background: false
```
Orchestrator is running but hasn't completed after 60s.

## Investigation Steps

1. Check Product Owner agent definition: Does it invoke `execute-decision.sh`?
2. Check orchestrator Product Owner invocation: Does it call the decision skill?
3. Check orchestrator decision extraction: Does it parse agent output and push to Redis?
4. Verify decision key data type: Should be LIST (for BLPOP), not STRING

## Files to Review

- `.claude/agents/cfn-dev-team/loop4/product-owner.md` - Agent definition
- `.claude/skills/cfn-loop-orchestration/orchestrate.sh` - Product Owner invocation
- `.claude/skills/cfn-product-owner-decision/execute-decision.sh` - Decision execution
- `tests/cfn-v3/test-e2e-cfn-loop.sh:271-279` - TEST 5 logic

## Expected Behavior

After Loop 2 consensus:
1. Orchestrator spawns Product Owner agent
2. Product Owner analyzes consensus + deliverables
3. Product Owner decides: PROCEED / ITERATE / ABORT
4. **Decision key created:** `redis-cli lpush "swarm:${TASK_ID}:decision" "$DECISION"`
5. Orchestrator reads decision via `redis-cli blpop "swarm:${TASK_ID}:decision" 30`
6. TEST 5 passes when decision key found within 15s timeout

## Success Criteria

- [ ] Product Owner agent invokes decision skill
- [ ] Decision skill creates `swarm:${TASK_ID}:decision` LIST key
- [ ] Orchestrator reads decision via BLPOP
- [ ] TEST 5 passes with decision key found
- [ ] Success rate: 84.21% → ~89.47% (17/19 tests passing)

## Next Steps

1. Review Product Owner agent prompt for decision skill invocation
2. Check orchestrator logs for Product Owner spawn confirmation
3. Verify decision skill is actually called (not just available)
4. Test decision key creation in isolation

## Related Documentation

- `docs/BUG_TEST5_DECISION_KEY_FIX.md` - Previous LPUSH fix
- `.claude/skills/cfn-product-owner-decision/SKILL.md` - Decision skill spec
- `.claude/skills/cfn-loop-orchestration/SKILL.md` - Orchestrator patterns

## Confidence

**Investigation Confidence:** 0.75
We know the decision key is missing, but root cause unclear without reviewing Product Owner implementation.
