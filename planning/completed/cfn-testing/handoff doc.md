# Handoff: Feedback Accumulation & Sprint Awareness for CFN Loop

**Date:** 2025-10-22
**Priority:** High
**Estimated Effort:** 5 hours total
**Status:** Approved, Not Yet Implemented

---

## Executive Summary

During P1-P7 validation (task `p1-p7-validation-fixed-1761091893`), we discovered **two critical gaps** in CFN Loop context management:

1. **Feedback Loss Across Iterations:** Each iteration starts fresh with zero memory of previous feedback
2. **CLI Agent Sprint Blindness:** CLI-spawned agents lack awareness of sprint decomposition

**Impact:** Validation failed to reach consensus (0.81 vs 0.90 threshold) after 5 iterations because:
- Loop 3 agents couldn't learn from iteration 1-4 failures
- Validators repeated the same critiques without seeing past feedback
- Agents created epic-level deliverables instead of sprint-focused files

**Solution:** Implement cumulative feedback pattern + sprint-aware context injection.

---

## Problem Statement

### Problem 1: Feedback Amnesia

**Current Behavior (Broken):**
```
Iteration 1:
- Validators: "Missing P1 test script"
- Feedback stored: "Improve consensus from 0.70 to 0.90"

Iteration 2:
- Loop 3 receives: "Improve consensus from 0.60 to 0.90"
- Iteration 1 feedback: LOST
- Validators: "Missing P1 test script" (REPEATED)

Iteration 5:
- Loop 3 receives: "Improve consensus from 0.81 to 0.90"
- Iterations 1-4 feedback: LOST
- No learning curve, no incremental improvement
```

**Root Cause:**
File: `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
Lines: 1074-1081, 1531-1542

Feedback storage uses **SET** (overwrite) instead of accumulation:
```bash
FEEDBACK_KEY="swarm:${TASK_ID}:iteration:$((ITERATION + 1)):feedback"
echo "$FEEDBACK_MSG" | redis-cli -x SET "$FEEDBACK_KEY" EX 86400 >/dev/null
```

### Problem 2: Sprint Context Gap

**Current Behavior (Broken):**
```bash
# Epic: P1-P7 Validation (7 priorities)
# Agent receives:
--context "Validate all P1-P7 priorities...
Deliverables:
- docs/P1_P7_VALIDATION_RESULTS.md
"

# Agent creates: Generic epic report (wrong scope)
```

**Expected Behavior (If Using Sprints):**
```bash
# Sprint 1: P1 Monitoring ONLY
# Agent receives:
--context "Sprint 1.1 - P1 Monitoring (Sprint 1 of 7)
Deliverables:
- test-p1-monitoring.sh
- docs/P1_MONITORING_RESULTS.md
"

# Agent creates: Focused P1-specific files (correct scope)
```

**Root Cause:**
CLI agents (`npx claude-flow-novice agent`) receive generic context via `--context` parameter. No sprint metadata is injected even when using `/cfn-loop-sprints` slash command.

---

## Solution Architecture

### Phase 1: Feedback Accumulation (2 hours)

**Objective:** Store iteration feedback as cumulative JSON array, inject complete history into agent context.

#### 1.1 Update Feedback Storage Pattern

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
**Locations:**
- Lines 1074-1081 (Gate failed path)
- Lines 1531-1542 (Product Owner ITERATE path)

**Change Pattern:**

**BEFORE (overwrites):**
```bash
FEEDBACK_KEY="swarm:${TASK_ID}:iteration:$((ITERATION + 1)):feedback"
echo "$FEEDBACK_MSG" | redis-cli -x SET "$FEEDBACK_KEY" EX 86400 >/dev/null
```

**AFTER (accumulates):**
```bash
# Accumulative feedback storage
FEEDBACK_KEY="swarm:${TASK_ID}:feedback:history"

# Retrieve existing history
FEEDBACK_HISTORY=$(redis-cli GET "$FEEDBACK_KEY" 2>/dev/null || echo "[]")

# Append new feedback with metadata
NEW_FEEDBACK=$(jq -n \
  --argjson history "$FEEDBACK_HISTORY" \
  --arg iteration "$ITERATION" \
  --arg source "gate_check" \
  --arg feedback "$FEEDBACK_MSG" \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '$history + [{
    iteration: ($iteration | tonumber),
    source: $source,
    feedback: $feedback,
    timestamp: $timestamp
  }]')

# Store accumulated history
echo "$NEW_FEEDBACK" | redis-cli -x SET "$FEEDBACK_KEY" EX 86400 >/dev/null

echo "[Feedback] ✅ Accumulated feedback for iteration $ITERATION"
```

**Apply to 5 locations:**
1. Line 1047: No deliverables path (source: "deliverable_check")
2. Line 1078: Gate failed path (source: "gate_check")
3. Line 1493: Task complete path (source: "completion")
4. Line 1537: Product Owner ITERATE Loop 3 (source: "product_owner_loop3")
5. Line 1542: Product Owner ITERATE Loop 2 (source: "product_owner_loop2")

#### 1.2 Inject Feedback History into Loop 3 Context

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
**Location:** Lines 711-751 (Loop 3 context builder)

**Add after line 753:**

```bash
# Retrieve feedback history
FEEDBACK_HISTORY=$(redis-cli GET "swarm:${TASK_ID}:feedback:history" 2>/dev/null || echo "[]")

# Format feedback for human readability
if [ "$FEEDBACK_HISTORY" != "[]" ]; then
  FEEDBACK_SUMMARY=$(echo "$FEEDBACK_HISTORY" | jq -r '.[] | "- Iteration \(.iteration) (\(.source)): \(.feedback)"')

  # Prepend feedback to agent context
  LOOP3_AGENT_CONTEXT="Loop 3 implementation for iteration $ITERATION

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREVIOUS ITERATION FEEDBACK (LEARN FROM THIS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$FEEDBACK_SUMMARY

CRITICAL: Address the feedback above. Do NOT repeat previous mistakes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$LOOP3_AGENT_CONTEXT"
fi
```

#### 1.3 Add Validator Feedback History

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
**Location:** After line 1250 (Loop 2 validators complete)

**Extract and store validator feedback:**

```bash
# After all validators complete, extract structured feedback
echo "[Loop 2] Extracting validator feedback for history..."

for i in "${!VALIDATORS[@]}"; do
  VALIDATOR="${VALIDATORS[$i]}"
  UNIQUE_VALIDATOR_ID="${VALIDATOR_IDS[$i]}"
  OUTPUT_FILE="${VALIDATOR_OUTPUT_FILES[$UNIQUE_VALIDATOR_ID]}"

  # Extract structured feedback (critical/warnings/suggestions)
  VALIDATOR_RESULT=$(cat "$OUTPUT_FILE" 2>/dev/null || echo "{}")
  VALIDATOR_FEEDBACK=$(echo "$VALIDATOR_RESULT" | jq -r '.feedback // []')

  if [ "$VALIDATOR_FEEDBACK" != "[]" ]; then
    # Store in validator feedback history
    VALIDATOR_HISTORY_KEY="swarm:${TASK_ID}:validator-feedback:history"
    VALIDATOR_HISTORY=$(redis-cli GET "$VALIDATOR_HISTORY_KEY" 2>/dev/null || echo "[]")

    NEW_VALIDATOR_FEEDBACK=$(jq -n \
      --argjson history "$VALIDATOR_HISTORY" \
      --arg iteration "$ITERATION" \
      --arg validator "$UNIQUE_VALIDATOR_ID" \
      --argjson feedback "$VALIDATOR_FEEDBACK" \
      --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '$history + [{
        iteration: ($iteration | tonumber),
        validator: $validator,
        feedback: $feedback,
        timestamp: $timestamp
      }]')

    echo "$NEW_VALIDATOR_FEEDBACK" | redis-cli -x SET "$VALIDATOR_HISTORY_KEY" EX 86400 >/dev/null
  fi
done

echo "[Loop 2] ✅ Validator feedback history updated"
```

#### 1.4 Inject Validator History into Loop 2 Context

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
**Location:** Lines 1104-1125 (Loop 2 validator context)

**Add after line 1125:**

```bash
# Retrieve validator feedback history
VALIDATOR_HISTORY_KEY="swarm:${TASK_ID}:validator-feedback:history"
VALIDATOR_HISTORY=$(redis-cli GET "$VALIDATOR_HISTORY_KEY" 2>/dev/null || echo "[]")

if [ "$VALIDATOR_HISTORY" != "[]" ]; then
  VALIDATOR_SUMMARY=$(echo "$VALIDATOR_HISTORY" | jq -r '.[] |
    "- Iteration \(.iteration) (\(.validator)):\n  \(.feedback | map("  • " + .message) | join("\n"))"')

  LOOP2_VALIDATOR_CONTEXT="Loop 2 validation for iteration $ITERATION

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREVIOUS VALIDATOR FEEDBACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$VALIDATOR_SUMMARY

CRITICAL: Check if previous issues were addressed. Provide SPECIFIC feedback.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$LOOP2_VALIDATOR_CONTEXT"
fi
```

---

### Phase 2: Validator Feedback Extraction (1 hour)

**Objective:** Ensure validators provide structured, actionable feedback.

#### 2.1 Update Validator Output Processing Skill

**File:** `.claude/skills/loop2-output-processing/execute-and-extract.sh`
**Location:** Lines where feedback is extracted (need to identify exact location)

**Enhance feedback extraction:**

```bash
# Extract structured feedback from validator output
FEEDBACK_JSON=$(echo "$AGENT_OUTPUT" | grep -A 50 "FEEDBACK:" | \
  jq -Rs 'split("\n") | map(select(length > 0)) |
  map(select(startswith("- ")) |
  {
    type: (if contains("CRITICAL") then "critical"
           elif contains("WARNING") then "warning"
           else "suggestion" end),
    message: (gsub("^- (CRITICAL|WARNING|SUGGESTION): "; ""))
  })')

# If no structured feedback found, create empty array
if [ -z "$FEEDBACK_JSON" ] || [ "$FEEDBACK_JSON" = "null" ]; then
  FEEDBACK_JSON="[]"
fi

# Add feedback to result JSON
RESULT_JSON=$(echo "$RESULT_JSON" | jq --argjson feedback "$FEEDBACK_JSON" '. + {feedback: $feedback}')
```

#### 2.2 Update Validator Agent Prompts

**File:** `.claude/agents/core-agents/reviewer.md`
**Location:** End of file (after existing instructions)

**Add structured feedback section:**

```markdown
## Structured Feedback Format (MANDATORY)

After validation, provide feedback in this exact format:

**FEEDBACK:**
- CRITICAL: [Issue that BLOCKS consensus] (if any)
- CRITICAL: [Another blocking issue] (if any)
- WARNING: [Issue that REDUCES confidence] (if any)
- SUGGESTION: [Improvement for future iterations] (if any)

**Example:**
FEEDBACK:
- CRITICAL: test-p1-monitoring.sh missing - required deliverable not created
- WARNING: P1_MONITORING_RESULTS.md lacks PASS/FAIL verdicts per criterion
- SUGGESTION: Add edge case testing for 10-minute coordinator tasks

If NO issues found, write:
FEEDBACK:
- (No critical issues, no warnings, no suggestions)

This feedback will be tracked across iterations to measure improvement.
```

**Apply same pattern to:**
- `.claude/agents/core-agents/code-quality-validator.md`
- Any other Loop 2 validator agents

---

### Phase 3: Sprint-Aware Context Injection (2 hours)

**Objective:** Enable CLI agents to understand sprint boundaries and create sprint-specific deliverables.

#### 3.1 Create Sprint Execution Skill

**File:** `.claude/skills/sprint-execution/execute-sprint-task.sh` (NEW)

```bash
#!/bin/bash
# Sprint-aware CLI agent execution wrapper
# Bridges CLI agents to sprint-based CFN Loop execution

set -euo pipefail

AGENT_TYPE="$1"
TASK_ID="$2"
AGENT_ID="$3"
SPRINT_ID="${4:-}"  # Optional sprint identifier

# Check if running in sprint mode
if [ -n "$SPRINT_ID" ]; then
  echo "[Sprint Execution] Retrieving sprint context for $SPRINT_ID..."

  # Retrieve sprint context from Redis
  SPRINT_CONTEXT=$(redis-cli GET "swarm:${TASK_ID}:sprint:${SPRINT_ID}:context" 2>/dev/null)

  if [ -n "$SPRINT_CONTEXT" ] && [ "$SPRINT_CONTEXT" != "(nil)" ]; then
    # Extract sprint metadata
    SPRINT_NAME=$(echo "$SPRINT_CONTEXT" | jq -r '.sprint_name')
    SPRINT_NUM=$(echo "$SPRINT_CONTEXT" | jq -r '.sprint_num')
    TOTAL_SPRINTS=$(echo "$SPRINT_CONTEXT" | jq -r '.total_sprints')
    SPRINT_DELIVERABLES=$(echo "$SPRINT_CONTEXT" | jq -r '.deliverables[]' | sed 's/^/- /')
    SPRINT_IN_SCOPE=$(echo "$SPRINT_CONTEXT" | jq -r '.in_scope[]' | sed 's/^/- /')
    SPRINT_OUT_SCOPE=$(echo "$SPRINT_CONTEXT" | jq -r '.out_of_scope[]' | sed 's/^/- /')
    SPRINT_DIRECTORY=$(echo "$SPRINT_CONTEXT" | jq -r '.directory // ""')

    # Build sprint-focused agent context
    AGENT_CONTEXT="Sprint: $SPRINT_ID - $SPRINT_NAME (Sprint $SPRINT_NUM of $TOTAL_SPRINTS)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOCUSED SPRINT EXECUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL: This is a FOCUSED SPRINT. Create ONLY sprint-specific deliverables.
DO NOT create epic-level or phase-level summaries.

Sprint Deliverables (CREATE EXACTLY THESE FILES):
$SPRINT_DELIVERABLES
$([ -n "$SPRINT_DIRECTORY" ] && echo "
Target Directory: $SPRINT_DIRECTORY")

Sprint Scope (IMPLEMENT ONLY THESE ITEMS):
$SPRINT_IN_SCOPE

Out of Sprint Scope (DO NOT IMPLEMENT):
$SPRINT_OUT_SCOPE

Instructions:
1. Use Write tool to create EACH deliverable file
2. Verify files created with 'ls -la' after each Write
3. Focus ONLY on sprint scope items
4. DO NOT implement out-of-scope items (they're handled in other sprints)
5. Report confidence based on sprint deliverable completion (not epic completion)
6. If you identify out-of-scope improvements, note them but DO NOT implement

Context:
This is Sprint $SPRINT_NUM of $TOTAL_SPRINTS in a larger epic. Other sprints will handle
out-of-scope items. Your success is measured by delivering sprint-specific files with
high quality, NOT by completing the entire epic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"

    echo "[Sprint Execution] ✅ Sprint context built ($(echo "$AGENT_CONTEXT" | wc -c) chars)"
  else
    echo "[Sprint Execution] ⚠️  Sprint context not found, using standard context"
    # Fall back to standard context retrieval
    AGENT_CONTEXT=$(redis-cli GET "swarm:${TASK_ID}:agent-context" 2>/dev/null || echo "")
  fi
else
  # Non-sprint mode: retrieve standard context
  echo "[Execution] Standard (non-sprint) mode"
  AGENT_CONTEXT=$(redis-cli GET "swarm:${TASK_ID}:agent-context" 2>/dev/null || echo "")
fi

# Execute agent with sprint-aware or standard context
echo "[Execution] Spawning $AGENT_TYPE agent (ID: $AGENT_ID)..."
npx claude-flow-novice agent "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$AGENT_CONTEXT"
```

**Make executable:**
```bash
chmod +x .claude/skills/sprint-execution/execute-sprint-task.sh
```

#### 3.2 Update Orchestrator to Use Sprint Skill (Optional)

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
**Location:** Lines 820-832 (Loop 3 agent spawning)

**BEFORE:**
```bash
npx claude-flow-novice agent "$AGENT" \
  --task-id "$TASK_ID" \
  --agent-id "$UNIQUE_AGENT_ID" \
  --context "$LOOP3_AGENT_CONTEXT"
```

**AFTER:**
```bash
# Use sprint-aware execution skill if available
if [ -f ./.claude/skills/sprint-execution/execute-sprint-task.sh ]; then
  ./.claude/skills/sprint-execution/execute-sprint-task.sh \
    "$AGENT" \
    "$TASK_ID" \
    "$UNIQUE_AGENT_ID" \
    "${SPRINT_ID:-}"
else
  # Fall back to direct CLI execution
  npx claude-flow-novice agent "$AGENT" \
    --task-id "$TASK_ID" \
    --agent-id "$UNIQUE_AGENT_ID" \
    --context "$LOOP3_AGENT_CONTEXT"
fi
```

#### 3.3 Update CLAUDE.md with Sprint Patterns

**File:** `CLAUDE.md`
**Location:** After existing CFN Loop sections

**Add new section:**

```markdown
## CFN Loop Sprint Execution Awareness (CLI Agents)

### Sprint-Based Execution Detection

When you are spawned via CLI (`npx claude-flow-novice agent`), you may be part of
**sprint-based CFN Loop execution** where a large epic is decomposed into focused sprints.

**Sprint Context Indicators:**
- `Sprint: X.Y` or `Sprint ID: sprint-name`
- `Sprint X of Y in phase Z`
- `FOCUSED SPRINT EXECUTION` header
- `Sprint Deliverables (CREATE EXACTLY THESE FILES):`
- `Sprint Scope (IMPLEMENT ONLY THESE ITEMS):`

### Your Responsibilities in Sprint Execution

1. **Create ONLY sprint-specific deliverables** - NOT epic-level summaries
2. **Focus on sprint scope items** - Ignore out-of-sprint features
3. **Report sprint completion** - Confidence based on sprint files, not epic
4. **Note out-of-scope improvements** - But DO NOT implement them

### Sprint vs Non-Sprint Execution

**Sprint Execution (Focused):**
```
Sprint: 1.1 - P1 Coordinator Monitoring (Sprint 1 of 7)

Sprint Deliverables:
- test-p1-monitoring.sh
- docs/P1_MONITORING_RESULTS.md

Sprint Scope:
- P1 coordinator monitoring validation ONLY

Out of Scope:
- P2-P7 (handled in separate sprints)
```

**Non-Sprint Execution (Phase-Level):**
```
Phase: User Authentication

Deliverables:
- Login API
- JWT generation
- Password hashing
- Session management
```

### Example: Sprint Execution

**Context Received:**
```
Sprint: 1.2 - P2 SQLite Logging (Sprint 2 of 7)

Sprint Deliverables (CREATE EXACTLY THESE FILES):
- test-p2-sqlite.sh
- docs/P2_SQLITE_RESULTS.md

Sprint Scope:
- Verify SQLite logging to .claude/data/cfn-loop.db
- Check event types and structure
- Document query results

Out of Scope:
- P1 monitoring (Sprint 1 - already complete)
- P3 agent lifecycle (Sprint 3 - separate)
```

**Correct Response:**
1. Create `test-p2-sqlite.sh` (test script for P2 ONLY)
2. Create `docs/P2_SQLITE_RESULTS.md` (results for P2 ONLY)
3. DO NOT create generic "P1-P7 validation report"
4. Report confidence: 0.95 (both sprint files created successfully)

**Incorrect Response (DON'T DO THIS):**
1. Create `docs/P1_P7_VALIDATION_RESULTS.md` (epic-level, out of sprint scope)
2. Include P1, P3-P7 content (out of sprint scope)
3. Report confidence: 0.80 (based on epic completion, not sprint)

### Benefits of Sprint Execution

- **Reduced Complexity:** Focus on ONE priority at a time
- **Clear Success Metrics:** Sprint deliverables are explicit
- **Incremental Progress:** Each sprint builds on previous
- **Specific Feedback:** Validators check sprint files, not entire epic
- **Higher Consensus:** Easier to agree on focused scope

### Integration with Feedback History

Sprint execution works WITH feedback accumulation:

```
Sprint 1.1 - Iteration 1:
- Create test-p1-monitoring.sh
- Validator: "Missing timeout check"

Sprint 1.1 - Iteration 2:
- Previous feedback: "Missing timeout check"
- Add timeout check to test-p1-monitoring.sh
- Validator: "All P1 criteria met"
- ✅ Sprint 1.1 COMPLETE

Sprint 1.2 - Iteration 1:
- Create test-p2-sqlite.sh (NEW sprint, fresh start)
- NO feedback from Sprint 1.1 (different scope)
```
```

---

## Testing Strategy

### Test 1: Feedback Accumulation (Simple Iteration Task)

**Objective:** Verify feedback persists across iterations.

```bash
TASK_ID="feedback-accumulation-test-$(date +%s)"

# Launch simple task that will iterate
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "coder" \
  --loop2-agents "reviewer" \
  --max-iterations 3 \
  --epic-context '{"epicGoal": "Test feedback accumulation"}' \
  --phase-context '{"deliverables": ["/tmp/feedback-test.txt"]}' \
  --success-criteria '{"acceptanceCriteria": ["File created with exact content"]}'

# After completion, check feedback history
redis-cli GET "swarm:${TASK_ID}:feedback:history" | jq .
```

**Expected Output:**
```json
[
  {
    "iteration": 1,
    "source": "gate_check",
    "feedback": "Improve confidence from 0.60 to 0.75",
    "timestamp": "2025-10-22T..."
  },
  {
    "iteration": 2,
    "source": "product_owner_loop2",
    "feedback": "Improve consensus from 0.70 to 0.90",
    "timestamp": "2025-10-22T..."
  }
]
```

**Success Criteria:**
- ✅ Feedback array contains 2+ items
- ✅ Each item has iteration, source, feedback, timestamp
- ✅ Iteration 2 context includes iteration 1 feedback

### Test 2: Sprint Context Injection (P1-P7 Validation)

**Objective:** Verify sprint-specific deliverables are created.

```bash
# Create sprint manifest
mkdir -p planning/p1-p7-sprints
cat > planning/p1-p7-sprints/OVERVIEW.md <<'EOF'
# P1-P7 Validation Epic

**Goal**: Validate each priority individually

## Scope
### In Scope
- Individual validation per priority
- Test script per priority
- Results documentation per priority

### Out of Scope
- Epic-level summaries
- Cross-priority integration
EOF

cat > planning/p1-p7-sprints/phase-1-validation.md <<'EOF'
# Phase 1: Priority Validation

## Sprint 1.1: P1 Coordinator Monitoring
**Deliverables:**
- test-p1-monitoring.sh
- docs/P1_MONITORING_RESULTS.md
**Estimated Agents**: 2

## Sprint 1.2: P2 SQLite Logging
**Deliverables:**
- test-p2-sqlite.sh
- docs/P2_SQLITE_RESULTS.md
**Estimated Agents**: 2
EOF

# Parse and execute (assuming /parse-epic and /cfn-loop-sprints work)
/parse-epic planning/p1-p7-sprints --output p1-p7-sprints-config.json --validate
/cfn-loop-sprints "$(cat p1-p7-sprints-config.json)"
```

**Expected Deliverables After Sprint 1.1:**
```
test-p1-monitoring.sh      ✅ (P1-specific test)
docs/P1_MONITORING_RESULTS.md   ✅ (P1-specific results)
docs/P1_P7_VALIDATION_RESULTS.md   ❌ (should NOT be created - epic-level)
```

**Success Criteria:**
- ✅ Sprint 1.1 creates ONLY P1 files
- ✅ Sprint 1.2 creates ONLY P2 files
- ✅ No epic-level summary files created
- ✅ Consensus reaches ≥0.90 per sprint

---

## Migration Path

### Step 1: Apply Feedback Accumulation (Week 1)
1. Backup orchestrator: `cp orchestrate-cfn-loop.sh orchestrate-cfn-loop.sh.backup`
2. Apply Phase 1 changes (feedback storage + injection)
3. Test with simple iteration task
4. Verify feedback persists in Redis
5. Commit changes

### Step 2: Add Validator Feedback Extraction (Week 1)
1. Update validator output processing skill
2. Update reviewer/code-quality-validator agent prompts
3. Test validator feedback structure
4. Verify feedback appears in history
5. Commit changes

### Step 3: Implement Sprint Skill (Week 2)
1. Create `execute-sprint-task.sh` skill
2. Test with manual sprint context in Redis
3. Update orchestrator to use skill (optional)
4. Test with P1-P7 sprint manifest
5. Commit changes

### Step 4: Update CLAUDE.md (Week 2)
1. Add sprint awareness documentation
2. Add feedback history examples
3. Commit changes

### Step 5: Re-Run P1-P7 Validation (Week 2)
1. Create sprint manifest for P1-P7
2. Use `/parse-epic` + `/cfn-loop-sprints`
3. Verify:
   - Feedback accumulates across iterations
   - Sprint-specific deliverables created
   - Consensus reaches ≥0.90
4. Document results

---

## Success Metrics

### Feedback Accumulation:
- ✅ Iteration 5 context includes feedback from iterations 1-4
- ✅ Validators see previous validator feedback
- ✅ Learning curve visible (consensus improves over iterations)

### Sprint Awareness:
- ✅ CLI agents create sprint-specific files (not epic summaries)
- ✅ Sprint 1 consensus ≥0.90
- ✅ Sprint 2 consensus ≥0.90
- ✅ All 7 sprints complete individually

### Overall Impact:
- ✅ P1-P7 validation succeeds with sprint decomposition
- ✅ Consensus threshold met (≥0.90)
- ✅ No epic-level deliverable confusion
- ✅ Validator feedback actionable and specific

---

## Risk Assessment

### Risks:

1. **Redis Key Schema Change:** Feedback history uses new key structure
   - **Mitigation:** Backward compatible (old keys ignored)

2. **jq Dependency:** Requires jq for JSON manipulation
   - **Mitigation:** Already used in orchestrator, no new dependency

3. **Performance:** Feedback history grows with iterations
   - **Mitigation:** TTL 86400s (24 hours), max 10 iterations typical

4. **Sprint Context Complexity:** Slash commands must populate sprint metadata
   - **Mitigation:** Phase 3 optional, can work with manual Redis setup

### Rollback Plan:

If issues arise:
1. Restore orchestrator from backup: `mv orchestrate-cfn-loop.sh.backup orchestrate-cfn-loop.sh`
2. Flush affected Redis keys: `redis-cli --scan --pattern "swarm:*:feedback:history" | xargs redis-cli DEL`
3. Re-run validation with original code

---

## Related Work

### Completed:
- ✅ BUG #21: Confidence storage gap (fixed)
- ✅ BUG #22: Wake command deprecation (fixed)
- ✅ P1-P7 validation execution (consensus 0.81, identified feedback gap)

### Blocked By This Work:
- ⏳ P1-P7 validation re-run with sprint decomposition
- ⏳ Sprint-based epic execution improvements
- ⏳ Validator prompt engineering for specific feedback

### Enables:
- ✅ Iterative improvement across CFN Loop executions
- ✅ Sprint-focused deliverable creation
- ✅ Higher consensus rates through focused scope
- ✅ Better validator feedback quality

---

## Next Actions

1. **Review this handoff** with team/stakeholders
2. **Approve implementation plan** (5-hour effort estimate)
3. **Schedule Phase 1** (feedback accumulation) for this week
4. **Schedule Phase 2** (validator feedback) for this week
5. **Schedule Phase 3** (sprint skill) for next week
6. **Re-run P1-P7 validation** after Phase 3 complete

---

**Document Version:** 1.0
**Author:** Main Chat (CFN Loop Validation Session)
**Approval Status:** Approved
**Implementation Status:** Not Started
**Target Completion:** Week 2 (2025-10-29)

---

## Appendix: Key Files Modified

| File | Lines Modified | Change Type | Effort |
|------|----------------|-------------|--------|
| `orchestrate-cfn-loop.sh` | 1047, 1078, 1493, 1537, 1542 | Feedback accumulation | 1 hour |
| `orchestrate-cfn-loop.sh` | 753 | Loop 3 feedback injection | 30 min |
| `orchestrate-cfn-loop.sh` | 1125 | Loop 2 feedback injection | 30 min |
| `orchestrate-cfn-loop.sh` | 1250 | Validator feedback extraction | 30 min |
| `execute-and-extract.sh` | TBD | Feedback parsing | 30 min |
| `reviewer.md` | End | Structured feedback format | 15 min |
| `code-quality-validator.md` | End | Structured feedback format | 15 min |
| `execute-sprint-task.sh` | NEW | Sprint context injection | 1.5 hours |
| `orchestrate-cfn-loop.sh` | 820-832 | Sprint skill integration | 30 min |
| `CLAUDE.md` | End | Sprint awareness docs | 30 min |

**Total Effort:** ~5 hours
