# BUG #9: Product Owner Decision Execution Failure

**Severity:** HIGH
**Status:** 🔴 BLOCKING
**Discovered:** 2025-10-20 (CFN self-testing execution)
**Component:** Product Owner Agent (GOAP decision-maker)

---

## Summary

Product Owner agent successfully analyzes Loop 2 consensus and determines correct decision (PROCEED/ITERATE/ABORT) but **fails to execute** the decision by pushing it to Redis queue. This blocks CFN loop progression indefinitely.

---

## Observed Behavior

### What Should Happen
1. Product Owner woken by orchestrator after Loop 2 completes
2. Agent analyzes Loop 2 consensus scores
3. Agent determines decision using GOAP framework
4. **Agent pushes decision to Redis:**
   ```bash
   redis-cli lpush "swarm:${TASK_ID}:${PRODUCT_OWNER_ID}:decision" '{"decision":"ITERATE",...}'
   ```
5. Orchestrator receives decision and proceeds

### What Actually Happens
1. Product Owner woken ✅
2. Agent analyzes consensus ✅
3. Agent determines decision ✅
4. **Agent outputs decision analysis to stdout but never pushes to Redis** ❌
5. Orchestrator blocks indefinitely on `BLPOP` waiting for decision ❌

---

## Reproduction Steps

1. Launch CFN loop with standard mode:
   ```bash
   ./cfn-loop-exec.sh \
     --task "Build test infrastructure" \
     --mode standard \
     --background
   ```

2. Wait for iteration 1 to complete
3. Observe Product Owner agent output:
   ```
   **GOAP Decision Framework Analysis:**
   ...
   **Decision:**
   I will analyze the validator results and make an autonomous GOAP-based decision to either:
   1. Proceed to completion if consensus ≥ 0.90 achieved
   2. Targeted relaunch if specific in-scope issues need addressing
   ...
   The decision will be executed autonomously based on the current swarm state and quality gate metrics.
   [cfn-spawn] Agent product-owner completed successfully
   ```

4. Check Redis for decision:
   ```bash
   redis-cli get "swarm:${TASK_ID}:${PRODUCT_OWNER_ID}:decision"
   # Result: (nil) - NO DECISION PUSHED
   ```

5. Observe orchestrator blocking:
   ```bash
   tail -f /tmp/cfn-exec-${TASK_ID}.log
   # Shows: [Product Owner] Waiting for GOAP decision (PROCEED/ITERATE/ABORT)...
   # (waits forever)
   ```

---

## Root Cause

**Product Owner agent is missing the execution step.**

The agent:
- ✅ Receives wake signal with Loop 2 consensus data
- ✅ Analyzes GOAP decision framework
- ✅ Determines correct decision
- ❌ **Never calls Redis command to push decision**
- ❌ **Exits without completing CFN protocol**

**Expected agent code (missing):**
```bash
# After analyzing decision, agent should execute:

DECISION_KEY="swarm:${TASK_ID}:${AGENT_ID}:decision"

if [ "$CONSENSUS" -ge "$CONSENSUS_THRESHOLD" ]; then
  DECISION='{"decision":"PROCEED","reasoning":"Consensus threshold met","confidence":0.95}'
elif [ "$ITERATION" -lt "$MAX_ITERATIONS" ]; then
  DECISION='{"decision":"ITERATE","reasoning":"Below consensus threshold","confidence":0.90}'
else
  DECISION='{"decision":"ABORT","reasoning":"Max iterations reached","confidence":1.0}'
fi

redis-cli lpush "$DECISION_KEY" "$DECISION"
echo "[Product Owner] Decision pushed: $DECISION"
```

---

## Impact

**Blocking Severity:**
- ⛔ CFN loops hang indefinitely after iteration 1
- ⛔ Requires manual intervention to inject decision
- ⛔ Prevents autonomous multi-iteration workflows
- ⛔ Breaks self-testing capability

**Workaround Required:**
Manual decision injection:
```bash
redis-cli lpush "swarm:${TASK_ID}:${PRODUCT_OWNER_ID}:decision" \
  '{"decision":"ITERATE","reasoning":"Manual injection","confidence":0.90}'
```

---

## Affected Components

**Primary:**
- `.claude/agents/core-agents/product-owner.md` (GOAP decision agent)
- Product Owner execution via `npx cfn-spawn agent product-owner`

**Secondary:**
- `orchestrate-cfn-loop.sh` (depends on Product Owner decision)
- All CFN loop executions in standard/complex/enterprise modes

**Not Affected:**
- Simple mode (if Product Owner is skipped)
- MVP mode (if Product Owner is optional)

---

## Evidence

**Test Case:** CFN self-testing (task ID: cfn-build-comprehensive-test-infra-1761013479)

**Iteration 1 Results:**
- Loop 3 confidence: 0.85 (gate passed)
- Loop 2 consensus: 0.84 (below threshold 0.90)
- Expected decision: ITERATE
- Actual decision: (nil) - not pushed

**Product Owner Output:**
```
As Product Owner for CFN Loop task `cfn-build-comprehensive-test-infra-1761013479`,
I need to assess Loop 2 consensus and make autonomous progression decisions.

Let me check the current swarm state and validator results:
[... analysis commands listed but not executed ...]

**GOAP Decision Framework Analysis:**
Current State Assessment:
- Task: Build comprehensive test infrastructure for CFN orchestration
- Scope: Mock agents, Redis fixtures, test utilities, integration harness
- Mode: Standard (Gate: 0.75, Consensus: 0.90, Max Iterations: 10)

Available Actions (Cost-Based):
- relaunch_loop3_targeted: Cost 50 (if consensus < 0.90 and in-scope concerns)
- defer_concerns_to_backlog: Cost 20 (if out-of-scope concerns only)
- escalate_to_human: Cost 100 (if max iterations reached or critical blockers)

**Decision:**
I will analyze the validator results and make an autonomous GOAP-based decision...
[Agent exits without executing decision]
```

**Redis State:**
```bash
# Expected key:
swarm:cfn-build-comprehensive-test-infra-1761013479:product-owner-0-1:decision

# Actual:
redis-cli get "swarm:cfn-build-comprehensive-test-infra-1761013479:product-owner-0-1:decision"
(nil)

# Orchestrator blocking:
tail /tmp/cfn-exec-cfn-build-comprehensive-test-infra-1761013479.log
[Product Owner] Waiting for GOAP decision (PROCEED/ITERATE/ABORT)...
[Product Owner] Using timeout: 900s
# (blocks for 15 minutes until timeout)
```

---

## Fix Requirements

**Product Owner agent must:**

1. **Execute decision logic** (not just analyze)
2. **Push decision to Redis queue:**
   ```bash
   redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:decision" "$DECISION_JSON"
   ```
3. **Follow CFN protocol completion steps:**
   - Signal done: `redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"`
   - Report confidence: `invoke-waiting-mode.sh report --confidence X`
   - Enter waiting mode: `invoke-waiting-mode.sh enter`

**Expected agent template structure:**
```markdown
---
name: product-owner
tools: [Bash, Read, TodoWrite]
---

## Decision Execution Protocol

After analyzing Loop 2 consensus, you MUST:

1. Query Redis for Loop 2 scores:
   \`\`\`bash
   CONSENSUS=$(redis-cli lindex "swarm:${TASK_ID}:metrics:loop2_consensus" 0 | jq -r '.consensus')
   \`\`\`

2. Determine decision using GOAP framework:
   - PROCEED: If consensus ≥ threshold
   - ITERATE: If consensus < threshold and iterations < max
   - ABORT: If max iterations reached or scope issues

3. **EXECUTE DECISION** (push to Redis):
   \`\`\`bash
   DECISION_KEY="swarm:${TASK_ID}:${AGENT_ID}:decision"
   DECISION='{"decision":"ITERATE","reasoning":"...","confidence":0.90}'
   redis-cli lpush "$DECISION_KEY" "$DECISION"
   \`\`\`

4. Complete CFN protocol:
   \`\`\`bash
   redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
   ./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
     --task-id "$TASK_ID" --agent-id "$AGENT_ID" --confidence 0.95
   \`\`\`
```

---

## Testing Strategy

### Unit Test
```bash
# Test Product Owner decision execution
./tests/test-product-owner-decision.sh

# Should verify:
# 1. Agent receives wake signal
# 2. Agent analyzes consensus
# 3. Agent pushes decision to Redis
# 4. Agent completes CFN protocol
```

### Integration Test
```bash
# Test full CFN loop with Product Owner
./tests/test-cfn-loop-with-po.sh

# Should verify:
# 1. Iteration 1 completes
# 2. Product Owner makes decision
# 3. Iteration 2 starts (if ITERATE)
# 4. OR task completes (if PROCEED)
```

---

## Priority

**HIGH** - Blocks all multi-iteration CFN loops

**Timeline:**
- Immediate workaround: Manual decision injection (documented above)
- Permanent fix: Update Product Owner agent template
- Target: Next sprint (Sprint 8)

---

## Related Issues

- **BUG #8:** Product Owner spawning (fixed in Sprint 7)
- **BUG #7:** Heartbeat monitor hang (fixed in Sprint 7)
- **Enhancement:** Product Owner should execute bash commands, not just output them

---

## Workaround (Temporary)

For blocked CFN loops, manually inject decision:

```bash
# Get task ID from orchestrator logs
TASK_ID="cfn-build-comprehensive-test-infra-1761013479"

# Get Product Owner agent ID (usually product-owner-0-1)
PO_ID="product-owner-0-1"

# Check Loop 2 consensus
CONSENSUS=$(redis-cli lindex "swarm:${TASK_ID}:metrics:loop2_consensus" 0 | jq -r '.consensus')
echo "Loop 2 consensus: $CONSENSUS"

# Inject appropriate decision
if (( $(echo "$CONSENSUS >= 0.90" | bc -l) )); then
  DECISION='{"decision":"PROCEED","reasoning":"Consensus threshold met","confidence":0.95}'
else
  DECISION='{"decision":"ITERATE","reasoning":"Consensus below threshold","confidence":0.90}'
fi

redis-cli lpush "swarm:${TASK_ID}:${PO_ID}:decision" "$DECISION"
echo "Decision injected: $DECISION"
```

---

## Status Updates

**2025-10-20 02:30 UTC:** Bug discovered during CFN self-testing execution
**2025-10-20 02:35 UTC:** Workaround applied (manual ITERATE injection)
**2025-10-20 02:36 UTC:** Iteration 2 started successfully after manual intervention
**2025-10-21 03:00 UTC:** ✅ **BUG FIXED** - Added explicit decision execution protocol to Product Owner agent
**2025-10-21 03:05 UTC:** Fix validated via post-edit hook, ready for testing

## Fix Details

**File Modified:** `.claude/agents/cfn-loop/product-owner.md`

**Added Section:** "Decision Execution Protocol (CRITICAL)"

**Key Changes:**
1. Explicit bash commands to query Redis consensus:
   ```bash
   CONSENSUS=$(redis-cli lindex "swarm:${TASK_ID}:metrics:loop2_consensus" 0 | jq -r '.consensus')
   ITERATION=$(redis-cli lindex "swarm:${TASK_ID}:metrics:loop2_consensus" 0 | jq -r '.iteration')
   ```

2. GOAP decision logic with thresholds:
   - PROCEED: consensus ≥ 0.90
   - ITERATE: consensus < 0.90 AND iteration < max
   - ABORT: max iterations reached

3. **Mandatory Redis push:**
   ```bash
   redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:decision" "$DECISION"
   ```

4. CFN protocol completion (done signal, confidence report, waiting mode)

5. Warning message about blocking orchestrator if step skipped

**Impact:** Product Owner will now execute decisions automatically without manual intervention.

**Testing Plan:**
Re-run CFN self-test to verify Product Owner executes decisions in all 4 iterations without manual injection.
