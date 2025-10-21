# Bug #8: Product Owner Never Spawned in Orchestrator

## Issue
The orchestrator attempts to wake the Product Owner for decision-making after Loop 2 completes, but the Product Owner agent is never spawned initially.

## Discovery
During Phase 4 CFN Loop execution (task ID: phase-4-testing-qa-final-1761004321):
- Loop 3 completed successfully (consensus: 0.87, gate passed)
- Loop 2 completed successfully (consensus: 0.82, below threshold)
- Orchestrator queued Product Owner wake signal
- **Product Owner agent was never spawned** - no `swarm:...:agent:product-owner-*` key exists
- Orchestrator appears to hang waiting for PO decision via BLPOP

## Root Cause
The orchestrator script (`orchestrate-cfn-loop.sh`) contains logic to:
1. Wake Product Owner after Loop 2: `invoke-waiting-mode.sh wake --agent-id "$PRODUCT_OWNER"`
2. Wait for PO decision: `BLPOP swarm:${TASK_ID}:${PRODUCT_OWNER}:decision`

However, there is **no code to spawn the Product Owner agent** before attempting to wake it.

Expected pattern:
```bash
# MISSING in orchestrator:
npx cfn-spawn agent product-owner \
  --agent-id "product-owner-1-$ITERATION" \
  --task-id "$TASK_ID" \
  --iteration "$ITERATION"
```

## Evidence
```bash
$ redis-cli keys "swarm:phase-4-testing-qa-final-1761004321:agent:*"
swarm:phase-4-testing-qa-final-1761004321:agent:tester-1-1
swarm:phase-4-testing-qa-final-1761004321:agent:accessibility-advocate-1-1
swarm:phase-4-testing-qa-final-1761004321:agent:performance-benchmarker-1-1
swarm:phase-4-testing-qa-final-1761004321:agent:reviewer-1-1
swarm:phase-4-testing-qa-final-1761004321:agent:code-quality-validator-1-1
# ❌ NO product-owner agent!

$ redis-cli zrange "swarm:phase-4-testing-qa-final-1761004321:product-owner:wake-queue" 0 -1
{"reason":"loop2_complete","iteration":1,...,"priority":5,...}
# ✅ Wake queue has entry, but no agent to receive it
```

## Impact
- Orchestrator hangs indefinitely after Loop 2 completes
- BLPOP on `swarm:...:${PRODUCT_OWNER}:decision` will timeout (default: 15 minutes per retry)
- CFN Loop cannot complete, even with successful Loop 2 validation
- Affects ALL CFN Loop executions using Product Owner decision flow

## Fix Required
Add Product Owner spawning logic before the main iteration loop:

```bash
# After Loop 3 and Loop 2 agent spawning, add:
echo "[Product Owner] Spawning Product Owner agent..."
npx cfn-spawn agent "$PRODUCT_OWNER" \
  --agent-id "${PRODUCT_OWNER}-1-1" \
  --task-id "$TASK_ID" \
  --epic-context "$EPIC_CONTEXT" \
  --phase-context "$PHASE_CONTEXT" \
  --success-criteria "$SUCCESS_CRITERIA" \
  &
```

The Product Owner should:
1. Spawn once at start (not per-iteration)
2. Enter waiting mode after spawn
3. Wake when Loop 2 completes
4. Make PROCEED/ITERATE/ABORT decision
5. Return to waiting mode if ITERATE chosen

## Related Issues
- Bug #7 (Loop 3 → Loop 2 transition hang): ✅ FIXED
- Bug #8 (Product Owner not spawned): ❌ ACTIVE

## Verification Status
**BUG #7 FIX CONFIRMED:**
- ✅ Loop 3 → Loop 2 transition works correctly
- ✅ Gate-passed signal triggers Loop 2 spawn
- ✅ Loop 2 validators spawn and complete successfully
- ✅ No hang between loops

**BUG #8 DISCOVERED:**
- ⚠️ Product Owner spawning logic missing
- ⚠️ Orchestrator hangs waiting for PO decision
- ⚠️ CFN Loop cannot complete

## Test Case
Task ID: phase-4-testing-qa-final-1761004321
Mode: standard
Loop 3: tester, accessibility-advocate, performance-benchmarker
Loop 2: reviewer, code-quality-validator
Product Owner: product-owner (NOT SPAWNED)

Results:
- Loop 3 consensus: 0.87 (PASS)
- Loop 2 consensus: 0.82 (below 0.90 threshold)
- Expected: Product Owner decides ITERATE
- Actual: Hang waiting for PO that was never spawned

## Recommendation
Fix orchestrator to spawn Product Owner agent before entering iteration loop.
