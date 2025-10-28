# CLI Agent Context Passing Enhancement

**Status:** ✅ Implemented and Tested
**Date:** 2025-10-20
**Version:** v2.6.0

## Problem Statement

CLI-spawned agents in CFN Loop workflows lacked access to epic-level context that coordinators received, causing:
- Agents unaware of scope boundaries (in/out of scope)
- No knowledge of phase dependencies
- Missing success criteria and quality gates
- Inability to make informed decisions aligned with epic goals

## Solution Architecture

### Context Flow

```
Main Chat → Coordinator (via Task tool)
    ↓
Coordinator stores epic context in Redis
    ↓
Coordinator invokes orchestrator
    ↓
Orchestrator spawns agents via CLI (npx cfn-spawn)
    ↓
cfn-spawn reads epic context from Redis
    ↓
cfn-spawn injects context as environment variables
    ↓
Agents receive: EPIC_CONTEXT, PHASE_CONTEXT, SUCCESS_CRITERIA
```

### Redis Key Pattern

```bash
swarm:<task-id>:epic-context        # Epic-level scope and goals
swarm:<task-id>:phase-context       # Current phase info
swarm:<task-id>:success-criteria    # Acceptance criteria and gates
```

## Implementation

### 1. Context Storage Helper

**File:** `.claude/skills/redis-coordination/store-epic-context.sh`

**Usage:**
```bash
./.claude/skills/redis-coordination/store-epic-context.sh \
  --task-id "epic-auth-123" \
  --epic-context '{
    "epicGoal": "Build authentication system",
    "inScope": ["JWT auth", "RBAC", "Session management"],
    "outOfScope": ["OAuth", "MFA", "Biometrics"],
    "phases": ["assessment", "implementation", "validation"]
  }' \
  --phase-context '{
    "currentPhase": "assessment",
    "dependencies": [],
    "deliverables": ["Requirements doc", "Architecture design"]
  }' \
  --success-criteria '{
    "acceptanceCriteria": [
      "Core functionality implemented",
      "Tests pass >80% coverage"
    ],
    "gateThreshold": 0.75,
    "consensusThreshold": 0.90
  }' \
  --ttl 86400
```

### 2. Context Retrieval in CLI Spawn

**File:** `src/cli/agent-spawn.ts` (lines 122-177)

**Changes:**
- Reads Redis keys before spawning agent process
- Injects context into environment variables:
  - `EPIC_CONTEXT`
  - `PHASE_CONTEXT`
  - `SUCCESS_CRITERIA`
- Gracefully handles missing Redis or missing keys

**Code:**
```typescript
// Fetch epic context from Redis if available
let epicContext = '';
let phaseContext = '';
let successCriteria = '';

if (taskId) {
  try {
    const { execSync } = await import('child_process');

    epicContext = execSync(`redis-cli get "swarm:${taskId}:epic-context"`,
      { encoding: 'utf8' }).trim();
    // ... (similar for phase context and success criteria)

    if (epicContext) {
      console.log(`[cfn-spawn]   Epic context loaded from Redis`);
    }
  } catch (err) {
    console.warn(`[cfn-spawn]   Could not load epic context:`, err);
  }
}

// Add to environment
const env = {
  ...process.env,
  EPIC_CONTEXT: epicContext,
  PHASE_CONTEXT: phaseContext,
  SUCCESS_CRITERIA: successCriteria
};
```

### 3. Updated Coordinator Instructions

**File:** `.claude/agents/core-agents/cost-savings-cfn-loop-coordinator.md`

**Added:** Step 2 - Store Epic Context in Redis

Coordinators now:
1. Parse task requirements
2. **Store epic context in Redis** ← NEW
3. Invoke orchestrator script
4. Monitor progress via web portal

## Testing

**Test:** `tests/test-epic-context-passing.sh`

**Results:** ✅ All tests passed

```
✅ Epic context stored correctly
✅ Phase context stored correctly
✅ Success criteria stored correctly
✅ Context keys accessible from Redis
✅ cfn-spawn will read and inject context
```

## Usage Example

### For Coordinators

```bash
# Step 1: Store epic context
./.claude/skills/redis-coordination/store-epic-context.sh \
  --task-id "$TASK_ID" \
  --epic-context '{"epicGoal":"...","inScope":[...],"outOfScope":[...]}' \
  --phase-context '{"currentPhase":"...","dependencies":[...]}' \
  --success-criteria '{"acceptanceCriteria":[...]}' \
  --ttl 86400

# Step 2: Invoke orchestrator (agents will automatically receive context)
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "analyst,architect" \
  --loop2-agents "reviewer,architect"
```

### For Agents

Agents automatically receive context via environment variables:

```bash
# Read epic context in agent code
EPIC=$(echo "$EPIC_CONTEXT" | jq -r '.epicGoal')
IN_SCOPE=$(echo "$EPIC_CONTEXT" | jq -r '.inScope[]')
OUT_OF_SCOPE=$(echo "$EPIC_CONTEXT" | jq -r '.outOfScope[]')

# Read success criteria
GATE=$(echo "$SUCCESS_CRITERIA" | jq -r '.gateThreshold')
CONSENSUS=$(echo "$SUCCESS_CRITERIA" | jq -r '.consensusThreshold')
```

## When to Use

### Always Use Context Storage For:
- ✅ Multi-phase epics
- ✅ Complex scope boundaries (in/out of scope)
- ✅ Custom success criteria
- ✅ Phase dependencies
- ✅ Cross-phase deliverables

### Optional For:
- ⚠️  Simple single-phase tasks with default criteria
- ⚠️  Tasks with no scope ambiguity
- ⚠️  Proof-of-concept or testing work

## Benefits

1. **Scope Enforcement:** Agents know what's in/out of scope
2. **Context Awareness:** Agents understand epic goals and current phase
3. **Quality Gates:** Agents know success criteria and thresholds
4. **Phase Coordination:** Agents understand dependencies
5. **Cost Efficiency:** No need for manual context passing in each agent prompt
6. **Consistency:** All agents in same epic share consistent context

## Files Modified

1. `src/cli/agent-spawn.ts` - Read context from Redis
2. `.claude/skills/redis-coordination/store-epic-context.sh` - Store context helper
3. `.claude/agents/core-agents/cost-savings-cfn-loop-coordinator.md` - Updated instructions
4. `.claude/commands/cfn-loop.md` - Fixed template literals
5. `.claude/commands/cfn-loop-epic.md` - Fixed template literals
6. `tests/test-epic-context-passing.sh` - Integration test

## Migration Guide

### For Existing Coordinators

Before invoking orchestrator, add:

```bash
# NEW: Store epic context
./.claude/skills/redis-coordination/store-epic-context.sh \
  --task-id "$TASK_ID" \
  --epic-context "$EPIC_JSON" \
  --phase-context "$PHASE_JSON" \
  --success-criteria "$CRITERIA_JSON"

# Then proceed with orchestrator as before
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh ...
```

### For Existing Agents

No changes required! Context is automatically available via:
- `$EPIC_CONTEXT`
- `$PHASE_CONTEXT`
- `$SUCCESS_CRITERIA`

Parse with `jq` or read as-is.

## Future Enhancements

1. **Context Validation:** Schema validation for epic context JSON
2. **Context Versioning:** Track context changes across iterations
3. **Context Diffing:** Show what changed between iterations
4. **Context Templates:** Pre-built templates for common epic patterns
5. **Context Inheritance:** Child tasks inherit parent epic context

## Related Issues

- Fixes: CLI-spawned agents lacking epic context
- Related: #coordinator-context-gap
- Enables: Multi-phase epic execution
- Unblocks: Portal improvements Phase 0

---

**Implementation Complete:** 2025-10-20
**Test Status:** ✅ Passing
**Documentation:** Updated
**Ready for Production:** Yes
