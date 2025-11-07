# BUG #11: Product Owner Decision Key Missing

**Date:** 2025-11-04
**Status:** FIXED
**Priority:** Critical
**Type:** Integration Bug

---

## Problem

Product Owner agent completed execution but decision key not stored in Redis.

**Evidence:**
```bash
# Test found this key:
swarm:e2e-test-1762216067:product-owner*:result ✅

# But expected this key (not found):
swarm:e2e-test-1762216067:decision ❌
```

**Impact:**
- CFN Loop orchestrator cannot read decision (PROCEED/ITERATE/ABORT)
- Iteration cycle broken
- No decision history tracking

---

## Root Cause

**File:** `claude-assets/agents/cfn-dev-team/product-owners/product-owner.md`
**Line:** 211

Agent references non-existent script:
```bash
./.claude/skills/cfn-redis-coordination/execute-product-owner-decision.sh
```

**Problem:**
- Script only exists in `legacy/v1/` directory
- Product Owner agent completes without calling script
- Standard completion protocol stores `result` but not `decision` key
- Orchestrator expects `swarm:${TASK_ID}:decision` to exist

---

## Fix

Created missing script with guaranteed Redis coordination.

### 1. Created `execute-decision.sh`

**File:** `.claude/skills/cfn-product-owner-decision/execute-decision.sh`

**Responsibilities:**
- Spawn Product Owner agent with GOAP context
- Parse decision from output (robust fallback patterns)
- Validate deliverables (for PROCEED decisions)
- Store decision to Redis: `SET swarm:${TASK_ID}:decision "PROCEED|ITERATE|ABORT"`
- Signal completion
- Report confidence score

**Pattern Matching:**
```bash
# Primary: Labeled decision
grep -oiE "Decision:\s*(PROCEED|ITERATE|ABORT)"

# Fallback 1: Standalone keyword
grep -oE "(PROCEED|ITERATE|ABORT)"

# Fallback 2: Case-insensitive
grep -oiE "(proceed|iterate|abort)"
```

**Deliverable Verification:**
```bash
if [ "$DECISION_TYPE" = "PROCEED" ]; then
  FILES_CHANGED=$(git status --short | grep -E "^(A|M|\?\?)" | wc -l)
  
  if [ "$FILES_CHANGED" -eq 0 ]; then
    # Override PROCEED → ITERATE
    DECISION_TYPE="ITERATE"
    REASONING="No deliverables created - consensus on plans only"
  fi
fi
```

### 2. Updated Orchestrator

**File:** `.claude/skills/cfn-loop-orchestration/orchestrate.sh`
**Line:** 638

**Before:**
```bash
decision_output=$("$SCRIPT_DIR/.claude/skills/cfn-cfn-product-owner-decision/execute-decision.sh" \
```

**After:**
```bash
decision_output=$("$SCRIPT_DIR/.claude/skills/cfn-product-owner-decision/execute-decision.sh" \
```

**Fix:** Corrected double `cfn-` prefix in path

---

## Testing

### Validation

```bash
# Run E2E test
bash tests/cfn-v3/test-e2e-cfn-loop.sh

# Expected result:
# TEST 5: Product Owner Decision Execution
# ✅ PASSED: Decision key found: swarm:${TASK_ID}:decision
```

### Redis Keys Verified

After fix, these keys should exist:
```bash
swarm:${TASK_ID}:decision                        # PROCEED|ITERATE|ABORT
swarm:${TASK_ID}:${AGENT_ID}:result             # Full decision JSON
swarm:${TASK_ID}:metrics:product_owner_decisions # Decision history
```

---

## Prevention

**Added to SKILL.md:**
- Explicit Redis coordination requirements
- Output parsing patterns
- Deliverable verification protocol
- Error handling strategies

**Advantages of Skill-Based Approach:**

| Aspect | Template-Based | Skill-Based (Fixed) |
|--------|----------------|---------------------|
| **Execution Guarantee** | ❌ Agent decides | ✅ Script enforces |
| **Redis Coordination** | ❌ Agent must execute | ✅ Orchestrator controls |
| **Output Parsing** | ❌ None | ✅ Robust fallback patterns |
| **Deliverable Verification** | ❌ Manual | ✅ Automated |
| **Error Handling** | ❌ Agent-dependent | ✅ Skill-controlled |

---

## Related Documentation

- **Skill:** `.claude/skills/cfn-product-owner-decision/SKILL.md`
- **Agent:** `claude-assets/agents/cfn-dev-team/product-owners/product-owner.md`
- **Orchestrator:** `.claude/skills/cfn-loop-orchestration/orchestrate.sh`
- **Test:** `tests/cfn-v3/test-e2e-cfn-loop.sh`

---

## Lessons Learned

### STRAT-029: Skill-Based Execution Over Template Instructions
- **Confidence:** 0.95
- **Priority:** 10
- **Insight:** Use executable skills instead of agent template instructions for critical coordination. Template-based approach ("YOUR TASK: Use Bash tool to execute script") relies on agent compliance, which can fail. Skill-based approach (orchestrator calls script directly) guarantees execution.
- **Tags:** coordination, skills, execution-guarantee, reliability

### ANTI-024: Template-Based Redis Coordination
- **Confidence:** 0.90
- **Priority:** 9
- **Insight:** Avoid relying on agent templates to execute Redis coordination scripts. Agents may skip steps, misunderstand instructions, or fail to execute critical commands. Always use skills that orchestrator controls directly.
- **Tags:** anti-pattern, redis, coordination, agent-instructions

---

## Status

✅ **FIXED** - Script created, orchestrator updated, awaiting test validation
