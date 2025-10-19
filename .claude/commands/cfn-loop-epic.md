---
description: "Execute multi-phase epic with CFN Loop orchestration and autonomous phase transitions"
argument-hint: "<epic description>"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Edit", "Bash", "Glob", "Grep"]
---

# CFN Loop Epic - Multi-Phase Autonomous Development

Execute a large multi-phase epic using the full 4-loop CFN structure with autonomous phase orchestration.

🚨 **AUTONOMOUS MULTI-PHASE SELF-LOOPING PROCESS**

**Epic Goal**: $ARGUMENTS

## CFN Loop Structure (4 Loops)

```
LOOP 0: Epic/Sprint Orchestration (THIS COMMAND)
   ├─ Phase 1 → Phase 2 → Phase 3 → ... → Phase N
   ↓
LOOP 1: Phase Execution (current phase)
   ↓
LOOP 2: Consensus Validation (≥90% Byzantine consensus)
   ↓
LOOP 3: Primary Swarm Execution (implementation with confidence scores)
```

## Epic Planning (Loop 0)

### Step 1: Parse Epic into Phases
```javascript
// Use parse-epic utility to break down epic
const epicPlan = {
  epic_name: "auth-system",
  phases: [
    {
      phase_id: "1",
      name: "User Authentication",
      deliverables: ["Login API", "JWT generation", "Password hashing"],
      dependencies: [],
      estimated_agents: 5
    },
    {
      phase_id: "2",
      name: "Authorization & RBAC",
      deliverables: ["Role system", "Permission checks", "Middleware"],
      dependencies: ["1"],
      estimated_agents: 6
    },
    {
      phase_id: "3",
      name: "Session Management",
      deliverables: ["Refresh tokens", "Logout", "Session tracking"],
      dependencies: ["1", "2"],
      estimated_agents: 4
    }
  ]
}
```

### Step 2: Store Scope Boundaries (CRITICAL)
```javascript
mcp__claude-flow-novice__memory_usage({
  action: "store",
  namespace: "scope-control",
  key: "project-boundaries",
  value: JSON.stringify({
    primary_goal: "Build complete authentication system",
    in_scope: [
      "JWT authentication",
      "Role-based access control",
      "Session management",
      "Password security (bcrypt)"
    ],
    out_of_scope: [
      "OAuth/social login",
      "Multi-factor authentication",
      "Biometric authentication",
      "Advanced rate limiting beyond basic"
    ],
    risk_profile: "public-facing-medium-risk",
    decision_authority_config: {
      auto_approve_threshold: 0.90,
      auto_relaunch_max_iteration: 10,
      escalation_criteria: ["security vulnerability", "data loss risk"]
    }
  })
})
```

## Phase Execution (Loop 1)

For EACH phase in epic:

### Phase Initialization
1. Check dependencies satisfied
2. Load scope boundaries from memory
3. Initialize swarm for phase
4. Execute Loop 2 & Loop 3 (as defined in /cfn-loop command)

### Phase Pattern (MANDATORY Coordinator Pattern)

**CRITICAL:** Use CFN Loop Coordinator agent with automatic orchestration.

```javascript
// PHASE 1: User Authentication - Spawn coordinator (DO NOT spawn implementers directly)
Task("CFN Loop Coordinator", `
  Execute CFN Loop for Phase ${phaseId}: ${phaseName}

  MANDATORY: Use orchestrator script for dependency enforcement.

  ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
    --task-id "phase-${phaseId}-$(date +%s)" \
    --mode standard \
    --loop3-agents "backend-dev,frontend-dev,devops" \
    --loop2-agents "reviewer,architect,tester,security-specialist" \
    --product-owner "product-owner" \
    --max-iterations 10

  The orchestrator will:
  - Spawn all agents automatically
  - Enforce BLPOP dependency blocking
  - Collect consensus after validators finish
  - Wake agents for next iteration if needed
  - Report final result

  DO NOT spawn agents manually with Task().
`, "cfn-loop-coordinator")

// Self-Assessment Gate → Consensus → Product Owner → Action
// All handled by orchestrator

// If Phase 1 consensus ≥90% → AUTO-TRANSITION to Phase 2
```

### Alternative: Manual Spawning (NOT RECOMMENDED)

If you must spawn agents manually (NOT recommended), follow this pattern:

```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 5,
  strategy: "balanced"
})

Task("Coder 1", `
  Implement JWT generation...

  MANDATORY: After EVERY file edit:
  node config/hooks/post-edit-pipeline.js "[FILE_PATH]" --memory-key "swarm/auth/coder-1"

  Report confidence score.
`, "backend-dev")

// ... more agents
```

### Phase Transition Logic
```javascript
// After each phase completes
if (consensusScore >= 0.90 && allDeliverablesComplete) {
  // Store phase results
  mcp__claude-flow-novice__memory_usage({
    action: "store",
    namespace: "epic-progress",
    key: `phase-${phaseId}-results`,
    value: JSON.stringify({
      consensus: consensusScore,
      deliverables: completedDeliverables,
      timestamp: Date.now()
    })
  })

  // Check next phase dependencies
  const nextPhase = epicPlan.phases[currentPhaseIndex + 1];
  if (dependenciesSatisfied(nextPhase)) {
    // IMMEDIATELY transition (NO approval needed)
    executePhase(nextPhase);
  }
}
```

## Product Owner Integration (GOAP)

Product Owner operates at EACH phase completion:

```javascript
Task("Product Owner", `
  GOAP DECISION - Phase ${phaseId} Complete

  CURRENT STATE:
  - Phase ${phaseId} consensus: ${consensusScore}
  - Remaining phases: ${remainingPhases}
  - Validator concerns: ${concerns}

  RETRIEVE EPIC SCOPE:
  mcp__claude-flow-novice__memory_usage({
    action: "retrieve",
    namespace: "scope-control",
    key: "project-boundaries"
  })

  EXECUTE GOAP A* SEARCH:
  1. Classify phase completion quality
  2. Evaluate scope adherence
  3. Calculate cost of scope expansion vs backlog defer
  4. Make autonomous decision

  DECISION OPTIONS:
  - PROCEED_NEXT_PHASE (dependencies satisfied, scope intact)
  - DEFER_CONCERNS (save to backlog, continue epic)
  - ESCALATE (critical scope violation or blocker)

  OUTPUT: {decision: "...", next_action: "..."}
`, "product-owner")
```

## Autonomous Multi-Phase Execution

**FORBIDDEN PATTERNS:**
- ❌ "Phase 1 complete. Proceed to Phase 2?" (AUTO-PROCEED)
- ❌ "Should I continue the epic?" (ALWAYS continue until all phases done)
- ❌ Waiting for approval between phases (AUTONOMOUS TRANSITION)

**REQUIRED PATTERNS:**
```
Phase 1 consensus: 94% ✅
Dependencies for Phase 2 satisfied.
IMMEDIATELY transitioning to Phase 2...

Phase 2: Authorization & RBAC
[Spawning agents autonomously - no permission needed]
```

## Iteration Limits (Per Phase)
- **Loop 2** (Consensus): 10 iterations max per phase
- **Loop 3** (Primary Swarm): 10 iterations max per phase
- **Loop 1** (Phases): Unlimited (continues until all phases complete)

## Epic Progress Tracking

```javascript
// Query epic progress
mcp__claude-flow-novice__memory_usage({
  action: "list",
  namespace: "epic-progress"
})

// Output:
{
  "phase-1-results": {consensus: 0.94, deliverables: [...]},
  "phase-2-results": {consensus: 0.91, deliverables: [...]},
  "phase-3-results": null // Current phase in progress
}
```

## Example Multi-Phase Execution

```
[Turn 1] Epic: Auth System (3 phases)
         → Scope boundaries stored in memory
         → Phase 1: User Authentication

[Turn 2-5] Phase 1 Execution (Loop 3 + Loop 2)
           → Loop 3 iterations (confidence checks)
           → Loop 2 consensus validation
           → Product Owner: PROCEED_NEXT_PHASE
           → Phase 1 COMPLETE (consensus: 94%)

[Turn 6] AUTONOMOUS TRANSITION
         → Dependencies for Phase 2 satisfied
         → IMMEDIATELY starting Phase 2: Authorization & RBAC

[Turn 7-10] Phase 2 Execution
            → Loop 3 + Loop 2 cycles
            → Product Owner: DEFER (OAuth out-of-scope)
            → Phase 2 COMPLETE (consensus: 91%)

[Turn 11] AUTONOMOUS TRANSITION
          → Phase 3: Session Management

[Turn 12-14] Phase 3 Execution
             → Final phase completion
             → Epic COMPLETE ✅
```

## Output Format

```
Epic: auth-system (3 phases)
Phase 1/3: User Authentication

Loop 3 Iteration 2/10 - Confidence: 85% avg ✅
Loop 2 Iteration 1/10 - Consensus: 94% ✅

Phase 1 COMPLETE
Dependencies satisfied for Phase 2.
IMMEDIATELY transitioning to Phase 2...

─────────────────────────────────
Phase 2/3: Authorization & RBAC
[Executing autonomously - no permission needed]
```

## Epic Completion

When final phase achieves ≥90% consensus:
```
Phase 3 COMPLETE - Consensus: 92% ✅

Epic: auth-system - ALL PHASES COMPLETE ✅
- Phase 1: User Authentication (94%)
- Phase 2: Authorization & RBAC (91%)
- Phase 3: Session Management (92%)

Deferred items saved to backlog:
- OAuth/social login integration
- Multi-factor authentication

Epic execution complete. Self-looping terminated.
```
