# BUG #20: Insufficient Context Injection

**Date Discovered:** 2025-10-21
**Severity:** 🔴 CRITICAL - Blocks all CFN Loop executions
**Status:** 🔍 IDENTIFIED - Root cause confirmed

---

## Summary

Agents in CFN Loop receive insufficient task context, causing them to produce wrong deliverables despite reporting high confidence. This is the root cause of **BUG #12 (Consensus on Vapor)**.

---

## Evidence

### Sprint 4.1 Execution (Task ID: `sprint-4-1-fixed-proper`)

**Expected Deliverables:**
- `.claude/skills/checkpoint-state/SKILL.md`
- `.claude/skills/checkpoint-state/save-checkpoint.sh`
- `.claude/skills/checkpoint-state/restore-checkpoint.sh`
- `.claude/skills/checkpoint-state/test-checkpoint.sh`

**Actual Deliverables:**
- ZERO checkpoint files created
- Web portal files created instead (wrong task)

**Agent Confidence Scores:**
- Iteration 1: backend-dev 0.85, devops-engineer 0.85
- Iteration 2: backend-dev 0.85, devops-engineer 0.91
- Iteration 3: backend-dev 0.85, devops-engineer 0.85

**All 6 agents reported high confidence but created wrong deliverables.**

---

## Root Cause Analysis

### Context Passed to Orchestrator

**Actual invocation:**
```bash
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --epic-context {"epicGoal":"Checkpoint"} \
  --phase-context {"phase":"4.1"} \
  --success-criteria {"gateThreshold":0.70,"consensusThreshold":0.80}
```

**What agents received:**
- Epic goal: "Checkpoint" (vague, no details)
- Phase: "4.1" (meaningless number)
- Success criteria: Only thresholds (no acceptance criteria)

**Missing critical information:**
- ❌ No `inScope` (which files to create)
- ❌ No `deliverables` (where to create them)
- ❌ No `acceptanceCriteria` (what functionality to implement)

### Expected Context Structure

**From coordinator documentation:**
```bash
--epic-context '{
  "epicGoal": "Build authentication system",
  "inScope": ["JWT auth", "RBAC", "Session management"],
  "outOfScope": ["OAuth", "MFA", "Biometrics"]
}'

--phase-context '{
  "currentPhase": "Phase 2 - Implementation",
  "deliverables": ["Requirements doc", "Architecture design"]
}'

--success-criteria '{
  "acceptanceCriteria": [
    "Core functionality implemented",
    "Tests pass >80% coverage",
    "Documentation complete"
  ],
  "gateThreshold": 0.75,
  "consensusThreshold": 0.90
}'
```

### What Should Have Been Passed (Sprint 4.1)

```bash
--epic-context '{
  "epicGoal": "Implement Redis checkpoint state skill",
  "inScope": [
    "Save agent state to Redis",
    "Restore agent state from Redis",
    "TTL-based expiration",
    "Compression support"
  ],
  "outOfScope": [
    "Disk persistence",
    "Database integration",
    "Multi-datacenter sync"
  ]
}'

--phase-context '{
  "currentPhase": "Sprint 4.1 - Checkpoint State Skill",
  "deliverables": [
    ".claude/skills/checkpoint-state/SKILL.md",
    ".claude/skills/checkpoint-state/save-checkpoint.sh",
    ".claude/skills/checkpoint-state/restore-checkpoint.sh",
    ".claude/skills/checkpoint-state/test-checkpoint.sh"
  ],
  "directory": ".claude/skills/checkpoint-state"
}'

--success-criteria '{
  "acceptanceCriteria": [
    "All 4 skill files created in correct directory",
    "Save/restore scripts functional",
    "Test suite passes with 100% success rate",
    "SKILL.md documents usage patterns",
    "Redis compression working"
  ],
  "technicalRequirements": [
    "Use Redis HASH for state storage",
    "TTL defaults to 24 hours",
    "Base64 compression for large states",
    "Error handling for Redis failures"
  ],
  "gateThreshold": 0.70,
  "consensusThreshold": 0.80
}'
```

---

## Impact

**Why This Breaks Everything:**

1. **Agents don't know what to build** - "Checkpoint" is too vague
2. **Agents don't know where to build it** - No directory specified
3. **Agents can't self-validate** - No acceptance criteria
4. **Validators can't review properly** - No criteria to check against
5. **Product Owner can't make informed decisions** - No success metrics

**Result:** Agents report high confidence on wrong deliverables because they have NO WAY TO KNOW they're wrong.

---

## Failure Chain

1. **Coordinator spawned** with task description (unknown quality)
2. **Coordinator extracted minimal context** → Only "Checkpoint" + "4.1"
3. **Orchestrator stored minimal context** in Redis
4. **Agents received minimal context** via environment/Redis
5. **Agents guessed what to do** based on "Checkpoint" keyword
6. **Agents created wrong files** (or no files)
7. **Agents reported high confidence** (no validation criteria)
8. **Validators approved** (no acceptance criteria to check)
9. **Product Owner iterated** (saw low consensus, not wrong deliverables)
10. **Max iterations reached** with zero correct deliverables

---

## Fix Strategy

### Option 1: Fix Coordinator Context Extraction (RECOMMENDED)

**Problem:** Coordinator agent doesn't extract detailed context from task description

**Solution:** Update `.claude/agents/core-agents/cost-savings-cfn-loop-coordinator.md` to:
1. Parse task description for deliverables, scope, acceptance criteria
2. Extract file paths, technical requirements, success metrics
3. Structure context into proper JSON format
4. Pass complete context to orchestrator

**Changes:**
```markdown
## Step 1: Parse Task Description and Extract Context

**CRITICAL:** Extract ALL relevant context from task description before spawning orchestrator.

### Required Context Fields

**Epic Context:**
- `epicGoal`: High-level objective (1 sentence)
- `inScope`: List of features/components to build
- `outOfScope`: Explicitly excluded features (prevents scope creep)

**Phase Context:**
- `currentPhase`: Phase/sprint name
- `deliverables`: List of files/artifacts to create (CRITICAL)
- `directory`: Where to create files (if applicable)

**Success Criteria:**
- `acceptanceCriteria`: List of completion requirements
- `technicalRequirements`: Implementation details (optional)
- `gateThreshold`: Minimum confidence for Loop 3 (default 0.75)
- `consensusThreshold`: Minimum consensus for Loop 2 (default 0.90)

### Context Extraction Pattern

1. **Read task description carefully**
2. **Identify deliverables** (files, components, features)
3. **Extract scope boundaries** (what's included/excluded)
4. **Define acceptance criteria** (how to validate success)
5. **Structure into JSON format**

### Example

**Task Description:**
"Implement checkpoint state skill with save/restore functionality in .claude/skills/checkpoint-state/"

**Extracted Context:**
```json
{
  "epicContext": {
    "epicGoal": "Implement Redis checkpoint state skill",
    "inScope": ["Save state", "Restore state", "TTL expiration"],
    "outOfScope": ["Disk persistence", "Multi-datacenter sync"]
  },
  "phaseContext": {
    "currentPhase": "Sprint 4.1 - Checkpoint State",
    "deliverables": [
      ".claude/skills/checkpoint-state/SKILL.md",
      ".claude/skills/checkpoint-state/save-checkpoint.sh",
      ".claude/skills/checkpoint-state/restore-checkpoint.sh",
      ".claude/skills/checkpoint-state/test-checkpoint.sh"
    ],
    "directory": ".claude/skills/checkpoint-state"
  },
  "successCriteria": {
    "acceptanceCriteria": [
      "All 4 files created",
      "Scripts functional",
      "Tests pass"
    ],
    "gateThreshold": 0.70,
    "consensusThreshold": 0.80
  }
}
```
```

**Benefits:**
- ✅ Fixes at source (coordinator responsibility)
- ✅ No orchestrator changes needed
- ✅ Coordinator has full task description
- ✅ One-time fix (all future executions benefit)

**Risks:**
- ⚠️ Coordinator must parse natural language correctly
- ⚠️ May need iteration to get extraction right

---

### Option 2: Fix Orchestrator Context Injection

**Problem:** Orchestrator doesn't inject stored context into agent prompts

**Solution:** Update `orchestrate-cfn-loop.sh` to inject Redis context into agent spawn:

**Current agent spawn:**
```bash
npx cfn-spawn agent "$AGENT" \
  --agent-id "$UNIQUE_ID" \
  --task-id "$TASK_ID" \
  --iteration "$ITERATION" \
  --context "CFN Loop iteration $ITERATION"
```

**Fixed agent spawn:**
```bash
# Build detailed context from Redis
EPIC_CONTEXT=$(redis-cli get "swarm:${TASK_ID}:epic-context")
PHASE_CONTEXT=$(redis-cli get "swarm:${TASK_ID}:phase-context")
SUCCESS_CRITERIA=$(redis-cli get "swarm:${TASK_ID}:success-criteria")

AGENT_CONTEXT="CFN Loop iteration $ITERATION

Epic Goal: $(echo "$EPIC_CONTEXT" | jq -r '.epicGoal')

In Scope:
$(echo "$EPIC_CONTEXT" | jq -r '.inScope[]' | sed 's/^/- /')

Out of Scope:
$(echo "$EPIC_CONTEXT" | jq -r '.outOfScope[]' | sed 's/^/- /')

Deliverables:
$(echo "$PHASE_CONTEXT" | jq -r '.deliverables[]' | sed 's/^/- /')

Acceptance Criteria:
$(echo "$SUCCESS_CRITERIA" | jq -r '.acceptanceCriteria[]' | sed 's/^/- /')

Directory: $(echo "$PHASE_CONTEXT" | jq -r '.directory // "project root"')
"

npx cfn-spawn agent "$AGENT" \
  --agent-id "$UNIQUE_ID" \
  --task-id "$TASK_ID" \
  --iteration "$ITERATION" \
  --context "$AGENT_CONTEXT"
```

**Benefits:**
- ✅ Works even with minimal coordinator context
- ✅ Clear agent instructions
- ✅ Structured, readable format

**Risks:**
- ⚠️ Requires coordinator to pass SOME context
- ⚠️ Adds complexity to orchestrator

---

### Option 3: Combined Approach (BEST)

**Both fixes together:**
1. Coordinator extracts detailed context from task description
2. Orchestrator injects stored context into agent prompts

**Benefits:**
- ✅ Defense in depth (two validation layers)
- ✅ Better error messages if context missing
- ✅ Clear separation of concerns
- ✅ Coordinator responsible for extraction
- ✅ Orchestrator responsible for injection

**Recommended Implementation Order:**
1. Fix Option 1 (coordinator) first
2. Test with manual Sprint 4.1 re-run
3. Add Option 2 (orchestrator) as enhancement
4. Add validation (warn if context fields missing)

---

## Testing Plan

### Test 1: Sprint 4.1 Re-execution

**Task Description:**
```
Implement Redis checkpoint state skill with the following deliverables:
- .claude/skills/checkpoint-state/SKILL.md
- .claude/skills/checkpoint-state/save-checkpoint.sh
- .claude/skills/checkpoint-state/restore-checkpoint.sh
- .claude/skills/checkpoint-state/test-checkpoint.sh

The skill should enable agents to save and restore state to/from Redis with TTL expiration and compression support.

Acceptance criteria:
- All 4 files created in correct directory
- Save/restore scripts functional
- Test suite passes with 100% success rate
- SKILL.md documents usage patterns
```

**Expected Behavior:**
1. Coordinator extracts:
   - Epic goal: "Implement Redis checkpoint state skill"
   - Deliverables: 4 files
   - Directory: `.claude/skills/checkpoint-state/`
   - Acceptance criteria: 4 items
2. Orchestrator spawns agents with full context
3. Agents create files in correct directory
4. Validators check against acceptance criteria
5. Product Owner sees deliverables completed

**Success Criteria:**
- ✅ All 4 files created in `.claude/skills/checkpoint-state/`
- ✅ Files contain actual checkpoint functionality
- ✅ Agents don't create wrong files
- ✅ Consensus reached on correct deliverables

---

### Test 2: Different Task Types

**Test variations:**
1. **Backend API task** - Verify file paths for `src/api/` creation
2. **React component** - Verify component name extraction
3. **Documentation** - Verify docs directory detection
4. **Security audit** - Verify audit report generation

---

## Related Bugs

- **BUG #12 (Consensus on Vapor)** - Same root cause, different symptom
- **BUG #18 (Agent Blocking)** - Fixed, enabled iteration detection
- **BUG #11 (Product Owner)** - Fixed, enabled strategic decisions

**BUG #20 is the last major blocker for autonomous CFN Loop execution.**

---

## Priority

🔴 **CRITICAL - P0**

**Rationale:** Without proper context injection, ALL CFN Loop executions will fail to produce correct deliverables, making the entire system unusable for autonomous work.

---

## Next Steps

1. **Implement Option 1** (coordinator context extraction)
2. **Test with Sprint 4.1** re-execution
3. **Implement Option 2** (orchestrator context injection) if needed
4. **Add validation** (warn on missing context fields)
5. **Document patterns** for future agent development

---

**Document Version:** 1.0
**Last Updated:** 2025-10-21
**Status:** Ready for implementation
