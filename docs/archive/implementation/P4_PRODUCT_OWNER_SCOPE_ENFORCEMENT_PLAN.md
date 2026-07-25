# P4: Product Owner Scope Enforcement - Implementation Plan

**Date:** 2025-10-21
**Priority:** P4
**Status:** 📝 PLANNING
**Effort:** 1-2 days (estimated)

---

## Objective

Enable Product Owner to categorize validator feedback as in-scope vs. out-of-scope, preventing infinite improvement loops and allowing proper backlog deferral.

---

## Current State Analysis

### Current Product Owner Behavior

**File:** `.claude/agents/cfn-loop/product-owner.md`

**Current Output Format** (Text-based):
```
DECISION: PROCEED|ITERATE|ABORT
REASONING: [text explanation]
```

**Current Orchestrator Parsing** (`.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`):
```bash
# Line ~1283: Product Owner spawn
# Line ~1450+: Decision parsing

DECISION_JSON=$(redis-cli lpop "swarm:${TASK_ID}:product-owner:decision")
DECISION_TYPE=$(echo "$DECISION_JSON" | jq -r '.decision // "UNKNOWN"')

if [ "$DECISION_TYPE" = "PROCEED" ]; then
  # Task complete
elif [ "$DECISION_TYPE" = "ITERATE" ]; then
  # Continue iterations
elif [ "$DECISION_TYPE" = "ABORT" ]; then
  # Stop execution
fi
```

### Problem Identified

**Scenario:**
1. Loop 3 implements feature (confidence 0.95)
2. Loop 2 validators review:
   - Reviewer: 0.90 (code looks good)
   - Tester: 0.85 (add more tests - **out of scope**)
   - Security: 0.80 (improve logging - **out of scope**)
3. Average consensus: 0.85 (below 0.90 threshold)
4. Product Owner sees low consensus → **ITERATE**
5. Loop 3 adds tests + logging
6. Loop 2 validators find more improvements (performance, docs, etc.)
7. **Infinite loop** - validators keep finding valid but out-of-scope improvements

**Root Cause:** Product Owner has no mechanism to:
- Categorize feedback as in-scope vs. out-of-scope
- Accept task with "good enough" in-scope work
- Defer out-of-scope items to backlog

---

## Proposed Solution

### 1. Structured JSON Output Format

**New Product Owner Output:**
```json
{
  "decision": "PROCEED|ITERATE|DEFER_AND_PROCEED|ABORT",
  "reasoning": "Strategic explanation",
  "confidence": 0.95,
  "scope_analysis": {
    "in_scope_consensus": 0.92,
    "out_of_scope_items": [
      {
        "validator": "tester",
        "feedback": "Add integration tests for edge cases",
        "category": "testing-enhancement",
        "priority": "medium",
        "action": "backlog"
      },
      {
        "validator": "security-specialist",
        "feedback": "Improve audit logging detail",
        "category": "logging-enhancement",
        "priority": "low",
        "action": "backlog"
      }
    ],
    "in_scope_items": [
      {
        "validator": "reviewer",
        "feedback": "Code quality excellent",
        "consensus": 0.95,
        "status": "approved"
      }
    ]
  },
  "backlog_items": [
    {
      "title": "Add integration tests for edge cases",
      "source": "tester",
      "priority": "medium",
      "epic": "testing-improvements"
    },
    {
      "title": "Improve audit logging detail",
      "source": "security-specialist",
      "priority": "low",
      "epic": "observability"
    }
  ]
}
```

### 2. New Decision Type: DEFER_AND_PROCEED

**Meaning:** Task meets in-scope requirements, but validators identified valuable out-of-scope improvements.

**Action:**
- Mark task as COMPLETE
- Create backlog items for deferred work
- Do NOT iterate (prevents infinite loop)

### 3. Scope Categorization Logic

**Product Owner Decision Tree:**
```
1. Retrieve Loop 2 feedback
2. Retrieve acceptance criteria from success-criteria
3. For each validator feedback item:
   a. Check if addresses acceptance criteria → IN_SCOPE
   b. Check if mentioned in epicGoal/inScope → IN_SCOPE
   c. Check if in outOfScope list → OUT_OF_SCOPE (reject)
   d. Else → OUT_OF_SCOPE (defer to backlog)
4. Calculate in_scope_consensus (only in-scope feedback)
5. Make decision:
   - If in_scope_consensus >= threshold AND no critical in-scope issues:
     → DEFER_AND_PROCEED (create backlog for out-of-scope)
   - If in_scope_consensus < threshold:
     → ITERATE (provide only in-scope feedback)
   - If iteration >= max:
     → ABORT
```

---

## Implementation Tasks

### Task 1: Update Product Owner Agent Definition

**File:** `.claude/agents/cfn-loop/product-owner.md`

**Changes:**
1. Add JSON output format specification
2. Add scope categorization instructions
3. Add backlog item creation format
4. Add decision tree logic
5. Update examples with new format

**Estimated Effort:** 2-3 hours

### Task 2: Update Orchestrator Decision Parsing

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`

**Changes:**
1. Parse new JSON structure
2. Handle DEFER_AND_PROCEED decision type
3. Extract backlog items and log to file
4. Update feedback filtering (only in-scope items)
5. Update iteration logic

**Locations:**
- Line ~1450: Product Owner decision retrieval
- Line ~1480: Decision type handling
- Line ~1540: ITERATE path feedback construction

**Estimated Effort:** 3-4 hours

### Task 3: Create Backlog Management

**New Files:**
- `.claude/data/backlog/` directory
- `.claude/data/backlog/<task-id>.json` per task

**Format:**
```json
{
  "task_id": "cfn-phase-123",
  "created_at": "2025-10-21T18:00:00Z",
  "items": [
    {
      "id": "backlog-item-1",
      "title": "Add integration tests",
      "description": "Add integration tests for edge cases",
      "source": "tester",
      "priority": "medium",
      "epic": "testing-improvements",
      "status": "backlog"
    }
  ]
}
```

**Estimated Effort:** 1-2 hours

### Task 4: Testing & Validation

**Test Scenarios:**
1. **In-Scope Only:** All feedback addresses acceptance criteria → PROCEED
2. **Out-of-Scope Only:** All feedback out of scope → DEFER_AND_PROCEED
3. **Mixed:** Some in-scope (low consensus) + out-of-scope → ITERATE (in-scope only)
4. **Mixed (high in-scope consensus):** In-scope good + out-of-scope present → DEFER_AND_PROCEED
5. **Max Iterations:** ITERATE path hits max → ABORT

**Estimated Effort:** 2-3 hours

---

## Detailed Design

### Product Owner Agent Updates

**Section 1: Context Retrieval**
```markdown
## Step 1: Retrieve Context from Redis

```bash
# Get Loop 2 consensus and feedback
LOOP2_CONSENSUS=$(redis-cli get "swarm:${TASK_ID}:loop2:consensus")
LOOP2_FEEDBACK=$(redis-cli lrange "swarm:${TASK_ID}:loop2:feedback" 0 -1)

# Get original scope definitions
EPIC_CONTEXT=$(redis-cli get "swarm:${TASK_ID}:epic-context")
SUCCESS_CRITERIA=$(redis-cli get "swarm:${TASK_ID}:success-criteria")

# Parse JSON contexts
IN_SCOPE_LIST=$(echo "$EPIC_CONTEXT" | jq -r '.inScope[]')
OUT_OF_SCOPE_LIST=$(echo "$EPIC_CONTEXT" | jq -r '.outOfScope[]')
ACCEPTANCE_CRITERIA=$(echo "$SUCCESS_CRITERIA" | jq -r '.acceptanceCriteria[]')
```
```

**Section 2: Scope Categorization**
```markdown
## Step 2: Categorize Feedback Items

For each validator feedback item, determine if it's in-scope or out-of-scope:

**In-Scope Criteria:**
1. Directly addresses an acceptance criterion
2. Mentioned in epicGoal or inScope list
3. Fixes a bug or error in current implementation
4. Required for feature to work as specified

**Out-of-Scope Criteria:**
1. Enhancement not in acceptance criteria
2. Listed in outOfScope
3. "Nice-to-have" improvement
4. Performance optimization not required
5. Additional testing beyond requirements
6. Documentation improvements (unless in acceptance criteria)

**Categorization Process:**
```bash
for feedback_item in $LOOP2_FEEDBACK; do
  validator=$(echo "$feedback_item" | jq -r '.validator')
  feedback_text=$(echo "$feedback_item" | jq -r '.feedback')

  # Check against acceptance criteria
  is_in_scope=false
  for criterion in $ACCEPTANCE_CRITERIA; do
    if [[ "$feedback_text" =~ "$criterion" ]]; then
      is_in_scope=true
      break
    fi
  done

  # Check against out-of-scope list
  for out_of_scope_item in $OUT_OF_SCOPE_LIST; do
    if [[ "$feedback_text" =~ "$out_of_scope_item" ]]; then
      is_in_scope=false
      category="explicitly_out_of_scope"
      break
    fi
  done

  # Default: if not explicitly in acceptance criteria, it's out of scope
  if [ "$is_in_scope" = false ]; then
    # Add to out_of_scope_items array
    OUT_OF_SCOPE_ITEMS+=("$feedback_item")
  else
    # Add to in_scope_items array
    IN_SCOPE_ITEMS+=("$feedback_item")
  fi
done
```
```

**Section 3: Decision Logic**
```markdown
## Step 3: Make Strategic Decision

Calculate in-scope consensus (only count in-scope feedback):
```bash
in_scope_count=${#IN_SCOPE_ITEMS[@]}
if [ "$in_scope_count" -gt 0 ]; then
  # Recalculate consensus with only in-scope validators
  in_scope_consensus=[calculate from IN_SCOPE_ITEMS]
else
  # No in-scope issues = all validators happy with scope
  in_scope_consensus=1.0
fi
```

**Decision Tree:**
```
if in_scope_consensus >= threshold (0.90):
  if out_of_scope_items present:
    decision = "DEFER_AND_PROCEED"
    action = "Create backlog items, mark task complete"
  else:
    decision = "PROCEED"
    action = "Task complete, no backlog"
elif in_scope_consensus < threshold:
  if iteration < max_iterations:
    decision = "ITERATE"
    feedback = "Address only in-scope items: [list]"
  else:
    decision = "ABORT"
    reason = "Max iterations reached without meeting in-scope threshold"
else:
  decision = "ABORT"
  reason = "Unexpected state"
```
```

**Section 4: JSON Output**
```markdown
## Step 4: Output Structured Decision

```json
{
  "decision": "DEFER_AND_PROCEED",
  "reasoning": "Task meets all acceptance criteria (in-scope consensus: 0.95). Validators identified 2 valuable enhancements that are out of current scope - deferred to backlog for future work.",
  "confidence": 0.95,
  "iteration": 2,
  "scope_analysis": {
    "in_scope_consensus": 0.95,
    "in_scope_validator_count": 2,
    "out_of_scope_validator_count": 1,
    "in_scope_items": [
      {
        "validator": "reviewer",
        "feedback": "Code quality excellent, follows standards",
        "consensus": 0.95,
        "status": "approved",
        "category": "code-quality"
      },
      {
        "validator": "tester",
        "feedback": "Core functionality tests pass",
        "consensus": 0.90,
        "status": "approved",
        "category": "testing"
      }
    ],
    "out_of_scope_items": [
      {
        "validator": "security-specialist",
        "feedback": "Consider adding detailed audit logging",
        "category": "logging-enhancement",
        "priority": "low",
        "action": "backlog",
        "rationale": "Not in acceptance criteria, enhancement for future work"
      }
    ]
  },
  "backlog_items": [
    {
      "id": "backlog-item-1",
      "title": "Add detailed audit logging",
      "description": "Security-specialist suggested: Consider adding detailed audit logging for compliance. This is a valuable enhancement but not required for current scope.",
      "source": "security-specialist",
      "priority": "low",
      "epic": "observability-improvements",
      "estimated_effort": "medium",
      "created_at": "2025-10-21T18:00:00Z"
    }
  ],
  "next_actions": {
    "immediate": "Mark task as complete",
    "backlog": "Review backlog items in next planning session",
    "follow_up": "Consider creating epic for observability improvements"
  }
}
```

Store this JSON to Redis:
```bash
redis-cli lpush "swarm:${TASK_ID}:product-owner:decision" "$DECISION_JSON"
```
```

---

### Orchestrator Updates

**Location 1: Decision Retrieval (Line ~1450)**
```bash
# Retrieve Product Owner decision
DECISION_JSON=$(redis-cli lpop "swarm:${TASK_ID}:product-owner:decision" 2>/dev/null || echo "{}")

# Parse decision
DECISION_TYPE=$(echo "$DECISION_JSON" | jq -r '.decision // "UNKNOWN"')
DECISION_REASONING=$(echo "$DECISION_JSON" | jq -r '.reasoning // "No reasoning provided"')
IN_SCOPE_CONSENSUS=$(echo "$DECISION_JSON" | jq -r '.scope_analysis.in_scope_consensus // "N/A"')

echo "[Product Owner] Decision: $DECISION_TYPE"
echo "[Product Owner] In-Scope Consensus: $IN_SCOPE_CONSENSUS"
echo "[Product Owner] Reasoning: $DECISION_REASONING"
```

**Location 2: DEFER_AND_PROCEED Handler (NEW)**
```bash
elif [ "$DECISION_TYPE" = "DEFER_AND_PROCEED" ]; then
  echo "✅ Product Owner Decision: DEFER_AND_PROCEED"
  echo "   In-Scope Consensus: $IN_SCOPE_CONSENSUS"
  echo "   Out-of-scope items deferred to backlog"

  # Extract backlog items
  BACKLOG_ITEMS=$(echo "$DECISION_JSON" | jq -r '.backlog_items')

  # Save backlog to file
  mkdir -p .claude/data/backlog
  echo "$BACKLOG_ITEMS" | jq '.' > ".claude/data/backlog/${TASK_ID}.json"

  echo "[Backlog] Saved to .claude/data/backlog/${TASK_ID}.json"
  echo "[Backlog] Items: $(echo "$BACKLOG_ITEMS" | jq 'length')"

  # Mark task as complete (like PROCEED)
  exit 0
```

**Location 3: ITERATE with Scope Filtering (Line ~1540)**
```bash
elif [ "$DECISION_TYPE" = "ITERATE" ]; then
  echo "⚠️  Product Owner Decision: ITERATE"
  echo "   Improve in-scope consensus from $IN_SCOPE_CONSENSUS to >=$CONSENSUS"

  # Extract ONLY in-scope feedback for next iteration
  IN_SCOPE_FEEDBACK=$(echo "$DECISION_JSON" | jq -r '.scope_analysis.in_scope_items[] | .feedback')

  # Build feedback string
  ITERATION_FEEDBACK="Product Owner: ITERATE - Address in-scope items only:\n"
  while IFS= read -r item; do
    ITERATION_FEEDBACK="${ITERATION_FEEDBACK}- ${item}\n"
  done <<< "$IN_SCOPE_FEEDBACK"

  # Wake agents with filtered feedback
  # [existing wake logic with $ITERATION_FEEDBACK]
```

---

## Testing Strategy

### Test 1: All In-Scope (PROCEED)

**Setup:**
```bash
# Acceptance criteria: "File created", "Content correct"
# Loop 2 feedback: All address criteria
```

**Expected:**
- In-scope consensus: 1.0
- Decision: PROCEED
- No backlog items

### Test 2: All Out-of-Scope (DEFER_AND_PROCEED)

**Setup:**
```bash
# Acceptance criteria: "File created"
# Loop 2 feedback: "Add tests", "Improve docs", "Add logging"
```

**Expected:**
- In-scope consensus: 1.0 (no in-scope issues)
- Decision: DEFER_AND_PROCEED
- 3 backlog items created

### Test 3: Mixed - Low In-Scope Consensus (ITERATE)

**Setup:**
```bash
# Acceptance criteria: "Function works correctly"
# Loop 2 feedback:
#   - "Fix bug in edge case" (in-scope, consensus 0.70)
#   - "Add performance optimization" (out-of-scope)
```

**Expected:**
- In-scope consensus: 0.70
- Decision: ITERATE
- Feedback contains only in-scope items
- Out-of-scope deferred

### Test 4: Mixed - High In-Scope Consensus (DEFER_AND_PROCEED)

**Setup:**
```bash
# Acceptance criteria: "API endpoint functional"
# Loop 2 feedback:
#   - "API works great" (in-scope, consensus 0.95)
#   - "Add rate limiting" (out-of-scope)
#   - "Add caching" (out-of-scope)
```

**Expected:**
- In-scope consensus: 0.95
- Decision: DEFER_AND_PROCEED
- 2 backlog items (rate limiting, caching)

### Test 5: Max Iterations (ABORT)

**Setup:**
```bash
# Iteration: 10 (max reached)
# In-scope consensus: 0.70 (below threshold)
```

**Expected:**
- Decision: ABORT
- Reasoning: "Max iterations reached"

---

## Success Criteria

- [ ] Product Owner outputs valid JSON
- [ ] Orchestrator parses JSON correctly
- [ ] DEFER_AND_PROCEED decision type works
- [ ] Backlog items saved to `.claude/data/backlog/`
- [ ] Scope categorization logic accurate
- [ ] In-scope consensus calculated correctly
- [ ] All 5 test scenarios pass
- [ ] No infinite improvement loops
- [ ] Documentation updated

---

## Risks & Mitigation

### Risk 1: Scope Categorization Too Strict

**Mitigation:** Start conservative (most feedback = in-scope), refine over time

### Risk 2: JSON Parsing Errors

**Mitigation:** Validate JSON schema, add error handling in orchestrator

### Risk 3: Backlog File Growth

**Mitigation:** Add cleanup script, archive old backlog items

---

## Rollback Plan

If P4 causes issues:

```bash
# Restore product-owner.md from backup
cp .claude/agents/cfn-loop/product-owner.md.backup .claude/agents/cfn-loop/product-owner.md

# Restore orchestrator from backup
cp .claude/skills/redis-coordination/orchestrate-cfn-loop.sh.backup .claude/skills/redis-coordination/orchestrate-cfn-loop.sh
```

---

## Timeline

**Total Estimated Effort:** 8-12 hours (1-1.5 days)

**Breakdown:**
- Planning: 1 hour (this document)
- Product Owner updates: 2-3 hours
- Orchestrator updates: 3-4 hours
- Backlog management: 1-2 hours
- Testing: 2-3 hours
- Documentation: 1 hour

**Recommended Schedule:**
- Session 1 (4 hours): Product Owner updates + initial orchestrator changes
- Session 2 (4 hours): Complete orchestrator + backlog + testing
- Session 3 (2 hours): Final testing + documentation

---

## Next Steps

1. **Create backups** of product-owner.md and orchestrate-cfn-loop.sh
2. **Update product-owner.md** with new JSON format and scope logic
3. **Update orchestrator** to parse JSON and handle DEFER_AND_PROCEED
4. **Create backlog directory** structure
5. **Test** with all 5 scenarios
6. **Document** changes and create P4 completion summary

---

**Status:** 📝 READY FOR IMPLEMENTATION
**Estimated Start:** Next session
**Prerequisites:** P1/P2/P3 complete ✅
