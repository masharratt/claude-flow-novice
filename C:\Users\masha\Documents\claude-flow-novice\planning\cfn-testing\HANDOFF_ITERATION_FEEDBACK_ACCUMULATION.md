# Handoff: CFN Loop Iteration Feedback Accumulation

**Date:** 2025-10-21
**Priority:** P0 (Critical - Blocks Effective Iteration Learning)
**Effort:** ~5 hours total
**Status:** 🟡 APPROVED - Ready for Implementation

---

## Executive Summary

**Problem:** CFN Loop iterations do not accumulate feedback across iterations. Each iteration starts fresh with zero context from previous attempts, preventing agents from learning and causing repeated failures.

**Root Cause:** Orchestrator overwrites feedback each iteration instead of accumulating it in a persistent history.

**Solution:** Implement cumulative feedback storage pattern with JSON-based history tracking and context injection.

**Impact:** Enables agents to learn from past failures, improves iteration efficiency, increases consensus success rate.

---

## Current Broken Pattern

### Feedback Overwrite (Lines 1074-1081, 1531-1542)

**Current Code:**
```bash
# Gate failed feedback
FEEDBACK_KEY="swarm:${TASK_ID}:iteration:$((ITERATION + 1)):feedback"
FEEDBACK_MSG="Improve confidence from $LOOP3_CONSENSUS to >$GATE"
echo "$FEEDBACK_MSG" | redis-cli -x SET "$FEEDBACK_KEY" EX 86400 >/dev/null

# Product Owner ITERATE feedback
FEEDBACK_KEY="swarm:${TASK_ID}:iteration:$((ITERATION + 1)):feedback"
FEEDBACK_MSG="Product Owner decision: ITERATE - Improve consensus from $LOOP2_CONSENSUS to >=$CONSENSUS"
echo "$FEEDBACK_MSG" | redis-cli -x SET "$FEEDBACK_KEY" EX 86400 >/dev/null
```

### What Happens

**Iteration 1:**
- Loop 2 validators: "Missing P1 test script, P2 logging unclear"
- Product Owner: ITERATE (consensus 0.70 → need 0.90)
- Stores: `iteration:2:feedback = "Improve consensus from 0.70 to 0.90"`
- **LOST:** Specific validator criticisms about P1/P2

**Iteration 2:**
- Loop 3 receives: "Improve consensus from 0.70 to 0.90" (generic)
- **NO ACCESS:** Iteration 1 validator feedback about P1/P2
- Loop 2 validators: "Still missing P1 test, P2 incomplete"
- Product Owner: ITERATE (consensus 0.60)
- Stores: `iteration:3:feedback = "Improve consensus from 0.60 to 0.90"`
- **OVERWRITES:** Iteration 2 feedback

**Iteration 5:**
- Loop 3 receives: ONLY iteration 5 feedback
- **ZERO KNOWLEDGE:** What failed in iterations 1-4
- **CANNOT LEARN:** Repeats same mistakes

### Evidence from P1-P7 Validation

**SQLite Database Query Results:**
```
Iteration 1: reviewer-1-1, code-quality-validator-1-1
  Consensus: 0.70
  Feedback: 0C/0W/0S (no specific items logged)

Iteration 2-5: Same pattern
  Declining consensus: 0.70 → 0.50 → 0.45 → 0.60 → 0.81
  No accumulated learning
```

**Validators gave scores but no actionable feedback, AND agents couldn't see what little feedback existed.**

---

## Proposed Solution Architecture

### Phase 1: Feedback Accumulation (2 hours)

**Implementation:** Accumulate feedback as JSON array in Redis

#### 1.1 Feedback Storage Function

**Location:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh` (new function before iteration loop)

```bash
# Function: Store feedback in accumulated history
# Parameters: $1=TASK_ID, $2=ITERATION, $3=FEEDBACK_MSG, $4=SOURCE (gate_failed|po_iterate|deliverable_check)
store_feedback_history() {
  local TASK_ID="$1"
  local ITERATION="$2"
  local FEEDBACK_MSG="$3"
  local SOURCE="$4"

  local FEEDBACK_KEY="swarm:${TASK_ID}:feedback:history"

  # Retrieve existing feedback history
  local FEEDBACK_HISTORY=$(redis-cli GET "$FEEDBACK_KEY" 2>/dev/null || echo "[]")

  # Append new feedback with iteration number and timestamp
  local NEW_FEEDBACK=$(jq -n \
    --argjson history "$FEEDBACK_HISTORY" \
    --arg iteration "$ITERATION" \
    --arg feedback "$FEEDBACK_MSG" \
    --arg source "$SOURCE" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '$history + [{
      iteration: ($iteration | tonumber),
      feedback: $feedback,
      source: $source,
      timestamp: $timestamp
    }]')

  # Store accumulated history (7 day TTL)
  echo "$NEW_FEEDBACK" | redis-cli -x SET "$FEEDBACK_KEY" EX 604800 >/dev/null

  echo "[Feedback History] Stored for iteration $ITERATION (source: $SOURCE)"
}
```

#### 1.2 Update Feedback Storage Locations

**Location 1: Gate Failed (Line 1074-1081)**

**Replace:**
```bash
# BUGFIX #22: Store feedback in Redis for next iteration
FEEDBACK_KEY="swarm:${TASK_ID}:iteration:$((ITERATION + 1)):feedback"
FEEDBACK_MSG="Improve confidence from $LOOP3_CONSENSUS to >$GATE"
echo "$FEEDBACK_MSG" | redis-cli -x SET "$FEEDBACK_KEY" EX 86400 >/dev/null
```

**With:**
```bash
# Store feedback in accumulated history
FEEDBACK_MSG="Loop 3 gate failed: Improve confidence from $LOOP3_CONSENSUS to >$GATE"
store_feedback_history "$TASK_ID" "$ITERATION" "$FEEDBACK_MSG" "gate_failed"
```

**Location 2: No Deliverables (Line 1044-1050)**

**Replace:**
```bash
FEEDBACK_KEY="swarm:${TASK_ID}:iteration:$((ITERATION + 1)):feedback"
echo "$FEEDBACK" | redis-cli -x SET "$FEEDBACK_KEY" EX 86400 >/dev/null
```

**With:**
```bash
# Store deliverable failure feedback
store_feedback_history "$TASK_ID" "$ITERATION" "$FEEDBACK" "no_deliverables"
```

**Location 3: Product Owner ITERATE (Line 1531-1542)**

**Replace:**
```bash
FEEDBACK_KEY="swarm:${TASK_ID}:iteration:$((ITERATION + 1)):feedback"
FEEDBACK_MSG="Product Owner decision: ITERATE - Improve consensus from $LOOP2_CONSENSUS to >=$CONSENSUS"
echo "$FEEDBACK_MSG" | redis-cli -x SET "$FEEDBACK_KEY" EX 86400 >/dev/null
```

**With:**
```bash
# Store Product Owner feedback
FEEDBACK_MSG="Product Owner decision: ITERATE - Improve consensus from $LOOP2_CONSENSUS to >=$CONSENSUS. Reasoning: $DECISION_REASONING"
store_feedback_history "$TASK_ID" "$ITERATION" "$FEEDBACK_MSG" "po_iterate"
```

#### 1.3 Inject Feedback History into Loop 3 Context

**Location:** Lines 712-751 (Loop 3 context builder)

**Add before deliverables section:**
```bash
# Retrieve feedback history from previous iterations
FEEDBACK_HISTORY=$(redis-cli GET "swarm:${TASK_ID}:feedback:history" 2>/dev/null || echo "[]")
FEEDBACK_COUNT=$(echo "$FEEDBACK_HISTORY" | jq 'length')

if [ "$FEEDBACK_COUNT" -gt 0 ]; then
  FEEDBACK_SUMMARY=$(echo "$FEEDBACK_HISTORY" | jq -r '.[] | "- Iteration \(.iteration) [\(.source)]: \(.feedback)"')

  FEEDBACK_CONTEXT="
Previous Iteration Feedback (LEARN FROM PAST ATTEMPTS):
$FEEDBACK_SUMMARY

Critical: Review this feedback before implementing. Avoid repeating past mistakes.
"
else
  FEEDBACK_CONTEXT=""
fi
```

**Update context builder to include feedback:**
```bash
LOOP3_AGENT_CONTEXT="Loop 3 implementation for iteration $ITERATION

$FEEDBACK_CONTEXT

Epic Goal: $EPIC_GOAL
..."
```

### Phase 2: Validator Feedback Accumulation (1 hour)

**Implementation:** Extract and store structured validator feedback

#### 2.1 Validator Feedback Extraction Function

**Location:** After Loop 2 consensus collection (lines 1250-1280)

```bash
# Extract structured feedback from validators
extract_validator_feedback() {
  local TASK_ID="$1"
  local ITERATION="$2"
  local VALIDATOR_ID="$3"

  # Retrieve validator output
  local VALIDATOR_OUTPUT=$(redis-cli LRANGE "swarm:${TASK_ID}:${VALIDATOR_ID}:output" 0 -1 2>/dev/null)

  # Extract structured feedback (critical/warnings/suggestions)
  local CRITICAL=$(echo "$VALIDATOR_OUTPUT" | grep -i "CRITICAL:" || echo "")
  local WARNINGS=$(echo "$VALIDATOR_OUTPUT" | grep -i "WARNING:" || echo "")
  local SUGGESTIONS=$(echo "$VALIDATOR_OUTPUT" | grep -i "SUGGESTION:" || echo "")

  # Store in validator feedback history
  local FEEDBACK_KEY="swarm:${TASK_ID}:validator-feedback:history"
  local FEEDBACK_ENTRY=$(jq -n \
    --arg iteration "$ITERATION" \
    --arg validator "$VALIDATOR_ID" \
    --arg critical "$CRITICAL" \
    --arg warnings "$WARNINGS" \
    --arg suggestions "$SUGGESTIONS" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      iteration: ($iteration | tonumber),
      validator: $validator,
      critical: $critical,
      warnings: $warnings,
      suggestions: $suggestions,
      timestamp: $timestamp
    }')

  # Append to history
  redis-cli RPUSH "$FEEDBACK_KEY" "$FEEDBACK_ENTRY" >/dev/null
  redis-cli EXPIRE "$FEEDBACK_KEY" 604800 >/dev/null
}

# Call for each validator after consensus collection
for VALIDATOR in "${LOOP2_COMPLETED_AGENTS[@]}"; do
  extract_validator_feedback "$TASK_ID" "$ITERATION" "$VALIDATOR"
done
```

#### 2.2 Inject Validator History into Loop 2 Context

**Location:** Lines 1104-1125 (Loop 2 validator context builder)

**Add:**
```bash
# Retrieve validator feedback history
VALIDATOR_HISTORY_COUNT=$(redis-cli LLEN "swarm:${TASK_ID}:validator-feedback:history" 2>/dev/null || echo "0")

if [ "$VALIDATOR_HISTORY_COUNT" -gt 0 ]; then
  VALIDATOR_HISTORY=$(redis-cli LRANGE "swarm:${TASK_ID}:validator-feedback:history" 0 -1)
  VALIDATOR_SUMMARY=$(echo "$VALIDATOR_HISTORY" | jq -r '.[] | "- Iteration \(.iteration) (\(.validator | split("-")[0])): Critical: \(.critical), Warnings: \(.warnings)"')

  VALIDATOR_HISTORY_CONTEXT="
What Previous Validators Identified:
$VALIDATOR_SUMMARY

Review this history to:
1. Check if previous issues were addressed
2. Identify recurring problems
3. Avoid duplicate feedback
4. Track improvement trends
"
else
  VALIDATOR_HISTORY_CONTEXT=""
fi
```

**Update validator context:**
```bash
LOOP2_VALIDATOR_CONTEXT="Loop 2 validation for iteration $ITERATION

$VALIDATOR_HISTORY_CONTEXT

Review Loop 3 implementation against these requirements:
..."
```

### Phase 3: Product Owner Decision Memory (1 hour)

**Implementation:** Track Product Owner decision reasoning

#### 3.1 Store Product Owner Decision History

**Location:** After Product Owner decision parsing (lines 1412-1419)

```bash
# Store Product Owner decision in history
PO_HISTORY_KEY="swarm:${TASK_ID}:po-decisions:history"

PO_DECISION_ENTRY=$(jq -n \
  --arg iteration "$ITERATION" \
  --arg decision "$DECISION_TYPE" \
  --arg reasoning "$DECISION_REASONING" \
  --arg confidence "$DECISION_CONFIDENCE" \
  --arg in_scope_consensus "$IN_SCOPE_CONSENSUS" \
  --arg loop2_consensus "$LOOP2_CONSENSUS" \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{
    iteration: ($iteration | tonumber),
    decision: $decision,
    reasoning: $reasoning,
    confidence: ($confidence | tonumber),
    in_scope_consensus: ($in_scope_consensus | tonumber),
    loop2_consensus: ($loop2_consensus | tonumber),
    timestamp: $timestamp
  }')

redis-cli RPUSH "$PO_HISTORY_KEY" "$PO_DECISION_ENTRY" >/dev/null
redis-cli EXPIRE "$PO_HISTORY_KEY" 604800 >/dev/null
```

#### 3.2 Inject Decision History into Product Owner Context

**Location:** Lines 1356-1370 (Product Owner context builder)

**Add:**
```bash
# Retrieve Product Owner decision history
PO_HISTORY_COUNT=$(redis-cli LLEN "swarm:${TASK_ID}:po-decisions:history" 2>/dev/null || echo "0")

if [ "$PO_HISTORY_COUNT" -gt 0 ]; then
  PO_HISTORY=$(redis-cli LRANGE "swarm:${TASK_ID}:po-decisions:history" 0 -1)
  PO_SUMMARY=$(echo "$PO_HISTORY" | jq -r '.[] | "- Iteration \(.iteration): \(.decision) (consensus: \(.loop2_consensus), reasoning: \(.reasoning | .[0:60])...)"')

  PO_HISTORY_CONTEXT="
Previous Product Owner Decisions:
$PO_SUMMARY

Consensus Trend Analysis:
- Current iteration: $ITERATION
- Current consensus: $LOOP2_CONSENSUS
- Target consensus: $CONSENSUS
- Gap: $(echo "$CONSENSUS - $LOOP2_CONSENSUS" | bc)
"
else
  PO_HISTORY_CONTEXT=""
fi
```

**Update Product Owner context:**
```bash
PO_CONTEXT="CFN Loop iteration $ITERATION complete.

$PO_HISTORY_CONTEXT

Loop 2 Consensus: $LOOP2_CONSENSUS (threshold: $CONSENSUS)
..."
```

### Phase 4: Sprint-Aware Context Skill (2 hours)

**Implementation:** Create skill for sprint metadata injection

See previous proposal in conversation for full `execute-sprint-task.sh` implementation.

---

## Implementation Checklist

### Phase 1: Feedback Accumulation (Priority: Immediate)

- [ ] Create `store_feedback_history()` function (30 min)
- [ ] Update gate failed feedback storage (10 min)
- [ ] Update no deliverables feedback storage (10 min)
- [ ] Update Product Owner ITERATE feedback storage (10 min)
- [ ] Add feedback history retrieval to Loop 3 context (30 min)
- [ ] Test with simple iteration task (30 min)

### Phase 2: Validator Feedback (Priority: High)

- [ ] Create `extract_validator_feedback()` function (30 min)
- [ ] Call after each validator completion (15 min)
- [ ] Add validator history to Loop 2 context (30 min)
- [ ] Test with multi-iteration validation (15 min)

### Phase 3: Product Owner Memory (Priority: Medium)

- [ ] Store PO decision history after parsing (15 min)
- [ ] Calculate consensus trends (15 min)
- [ ] Add PO history to PO context (15 min)
- [ ] Test with ITERATE decisions (15 min)

### Phase 4: Sprint Skill (Priority: Later)

- [ ] Create `.claude/skills/sprint-execution/execute-sprint-task.sh` (1 hour)
- [ ] Update orchestrator to use skill (30 min)
- [ ] Test with sprint-based epic (30 min)

---

## Testing Plan

### Test 1: Simple Iteration Feedback

**Scenario:** 3-iteration task with deliberate failures

```bash
TASK_ID="feedback-test-$(date +%s)"

./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "coder" \
  --loop2-agents "reviewer" \
  --product-owner "product-owner" \
  --max-iterations 3 \
  --epic-context '{"epicGoal": "Create test file"}' \
  --phase-context '{"deliverables": ["/tmp/test.txt"]}' \
  --success-criteria '{"gateThreshold": 0.75, "consensusThreshold": 0.90}'
```

**Expected:**
- Iteration 1: Gate fails
- Iteration 2: Receives iteration 1 feedback
- Iteration 3: Receives iteration 1 + 2 feedback
- Feedback history accumulates

**Validation:**
```bash
# Check feedback history
redis-cli GET "swarm:${TASK_ID}:feedback:history" | jq .

# Should show array with entries for each iteration
```

### Test 2: Validator Feedback Accumulation

**Scenario:** Multi-validator feedback tracking

**Expected:**
- Validators provide structured feedback
- Feedback extracted and stored
- Next iteration validators see previous feedback

**Validation:**
```bash
# Check validator history
redis-cli LRANGE "swarm:${TASK_ID}:validator-feedback:history" 0 -1 | jq .
```

### Test 3: Product Owner Decision Trends

**Scenario:** 5-iteration task with improving consensus

**Expected:**
- Product Owner sees consensus trend
- Decision history shows progression
- PO can reference previous reasoning

**Validation:**
```bash
# Check PO history
redis-cli LRANGE "swarm:${TASK_ID}:po-decisions:history" 0 -1 | jq .
```

---

## Success Metrics

### Immediate (Phase 1)

✅ Feedback stored as JSON array
✅ Feedback history injected into agent context
✅ Agents can reference previous iteration failures
✅ Zero feedback loss across iterations

### Short-Term (Phase 2-3)

✅ Validators see what other validators said
✅ Product Owner tracks consensus trends
✅ Iteration efficiency improves (fewer retries)
✅ Consensus success rate increases

### Long-Term (Phase 4)

✅ Sprint-based execution with focused scope
✅ CLI agents have same context as Task agents
✅ Consistent sprint pattern across all CFN Loop executions

---

## Risk Assessment

### Risks

⚠️ **Redis Memory:** Accumulating feedback increases Redis usage
**Mitigation:** 7-day TTL on history keys, limit to 20 iterations max

⚠️ **Context Size:** Large feedback history may exceed agent context limits
**Mitigation:** Summarize feedback after 5 iterations, show recent 3 + summary

⚠️ **Performance:** JSON parsing adds ~10ms per iteration
**Mitigation:** Acceptable trade-off for learning capability

### Dependencies

🔗 **Redis:** Requires Redis server running (already dependency)
🔗 **jq:** Requires jq for JSON manipulation (already dependency)
🔗 **bash 4+:** Requires modern bash (already requirement)

---

## Related Issues

**Fixes:**
- Root cause of P1-P7 validation failure (consensus 0.81, couldn't reach 0.90)
- Iteration learning gap
- Validator feedback loss

**Enables:**
- Sprint-based CFN Loop execution
- Improved iteration efficiency
- Better Product Owner decision-making
- CLI agent context parity with Task agents

**Blocks:**
- Effective multi-iteration tasks
- Complex epic execution
- Consensus-based validation

---

## Next Steps

### Immediate (Today)

1. Implement Phase 1 (feedback accumulation) - 2 hours
2. Test with simple iteration task - 30 minutes
3. Verify feedback history works - 15 minutes

### This Week

4. Implement Phase 2 (validator feedback) - 1 hour
5. Implement Phase 3 (PO decision history) - 1 hour
6. Re-run P1-P7 validation with feedback accumulation - 1 hour

### Later

7. Implement Phase 4 (sprint skill) - 2 hours
8. Update `/cfn-loop-sprints` to use new patterns - 1 hour
9. Create integration tests - 2 hours

---

## Example: Before vs After

### Before (Current - Broken)

```
Iteration 1:
  Loop 3: Creates generic files
  Loop 2: "Missing specific test scripts" (0.70 consensus)
  PO: ITERATE
  Stores: "Improve from 0.70 to 0.90"

Iteration 2:
  Loop 3 receives: "Improve from 0.70 to 0.90" (generic)
  Loop 3: Creates same generic files (no learning)
  Loop 2: "Still missing test scripts" (0.60 consensus - WORSE)
  PO: ITERATE

Iteration 5:
  Loop 3 receives: Only iteration 5 feedback
  Result: FAILURE - Max iterations exhausted, consensus 0.81
```

### After (Fixed - Learning)

```
Iteration 1:
  Loop 3: Creates generic files
  Loop 2: "Missing P1 test script, P2 logging validation unclear" (0.70)
  PO: ITERATE
  Stores: Full feedback with specific criticisms

Iteration 2:
  Loop 3 receives: "Iteration 1: Missing P1 test script, P2 logging unclear"
  Loop 3: Creates test-p1.sh + p2-validation.sh (LEARNING!)
  Loop 2: "P1 test incomplete, P2 better but needs query output" (0.75)
  PO: ITERATE

Iteration 3:
  Loop 3 receives:
    - "Iteration 1: Missing P1/P2 tests"
    - "Iteration 2: P1 incomplete, P2 needs query output"
  Loop 3: Completes P1 test, adds SQLite query output to P2
  Loop 2: "Good progress, P1 complete, P2 almost there" (0.88)

Iteration 4:
  Loop 3: Final refinements based on full history
  Loop 2: "All requirements met" (0.93)
  PO: PROCEED

Result: SUCCESS - Consensus reached through accumulated learning
```

---

**Document Version:** 1.0
**Author:** Main Chat (Session 2025-10-21)
**Approved By:** User
**Implementation Status:** 🟡 Ready to Begin

**Related Documents:**
- `docs/P1_P7_VALIDATION_SESSION_SUMMARY.md`
- `docs/BUG_21_FIX_COMPLETE.md`
- `docs/BUG_22_ORCHESTRATOR_WAKE_DEPRECATED.md`

**Next:** Implement Phase 1 feedback accumulation
