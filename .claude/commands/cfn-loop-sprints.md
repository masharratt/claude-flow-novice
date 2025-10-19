---
description: "Execute single phase with multiple sprints using CFN Loop autonomous coordination"
argument-hint: "<phase description>"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Edit", "Bash", "Glob", "Grep"]
---

# CFN Loop Sprints - Single Phase, Multiple Sprints

Execute a single phase broken into multiple sprints using CFN Loop autonomous coordination.

🚨 **AUTONOMOUS SPRINT-BASED SELF-LOOPING PROCESS**

**Phase Goal**: $ARGUMENTS

## CFN Loop Structure (4 Loops)

```
LOOP 0: Epic/Sprint Orchestration (THIS COMMAND - sprint level)
   ├─ Sprint 1 → Sprint 2 → Sprint 3 → ... → Sprint N
   ↓
LOOP 1: Phase Execution (single phase with multiple sprints)
   ↓
LOOP 2: Consensus Validation (≥90% Byzantine consensus per sprint)
   ↓
LOOP 3: Primary Swarm Execution (implementation with confidence scores)
```

## Sprint Planning (Loop 0)

### Step 1: Parse Phase into Sprints
```javascript
const sprintPlan = {
  phase_name: "User Authentication",
  sprints: [
    {
      sprint_id: "1.1",
      name: "Core Login API",
      deliverables: [
        "POST /auth/login endpoint",
        "JWT token generation",
        "Password validation"
      ],
      estimated_agents: 3,
      dependencies: []
    },
    {
      sprint_id: "1.2",
      name: "Password Security",
      deliverables: [
        "bcrypt password hashing",
        "Salt generation",
        "Hash verification"
      ],
      estimated_agents: 2,
      dependencies: ["1.1"]
    },
    {
      sprint_id: "1.3",
      name: "Token Management",
      deliverables: [
        "Token refresh endpoint",
        "Token expiration handling",
        "Token blacklisting"
      ],
      estimated_agents: 4,
      dependencies: ["1.1", "1.2"]
    }
  ]
}
```

### Step 2: Store Scope Boundaries (Per Sprint)
```javascript
mcp__claude-flow-novice__memory_usage({
  action: "store",
  namespace: "scope-control",
  key: "sprint-boundaries",
  value: JSON.stringify({
    primary_goal: "User Authentication Phase",
    sprint_scope: {
      "1.1": {
        in_scope: ["Login API", "JWT generation", "Basic validation"],
        out_of_scope: ["OAuth", "MFA", "Password reset"]
      },
      "1.2": {
        in_scope: ["bcrypt hashing", "Salt generation"],
        out_of_scope: ["Argon2", "Key derivation functions"]
      },
      "1.3": {
        in_scope: ["Refresh tokens", "Expiration", "Blacklist"],
        out_of_scope: ["Sliding sessions", "Device tracking"]
      }
    },
    risk_profile: "public-facing-medium-risk"
  })
})
```

## Sprint Execution (Loop 1)

For EACH sprint in phase:

### Sprint Initialization (MANDATORY Coordinator Pattern)

**CRITICAL:** Use CFN Loop Coordinator agent with automatic orchestration.

```javascript
// SPRINT 1.1: Core Login API - Spawn coordinator (DO NOT spawn implementers directly)
Task("CFN Loop Coordinator", `
  Execute CFN Loop for Sprint ${sprintId}: ${sprintName}

  MANDATORY: Use orchestrator script for dependency enforcement.

  ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
    --task-id "sprint-${sprintId}-$(date +%s)" \
    --mode standard \
    --loop3-agents "backend-dev,tester,security-specialist" \
    --loop2-agents "reviewer,architect" \
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
```

### Alternative: Manual Spawning (NOT RECOMMENDED)

If you must spawn agents manually (NOT recommended due to lack of dependency enforcement), follow this pattern:

```javascript
// Initialize swarm for sprint
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 3,
  strategy: "balanced"
})

// Execute Loop 3 (Primary Swarm)
Task("Backend Dev 1", `
  Implement POST /auth/login endpoint

  MANDATORY: After EVERY file edit:
  node config/hooks/post-edit-pipeline.js "[FILE_PATH]" --memory-key "swarm/sprint-1.1/backend-1"

  Report confidence score when complete.
`, "backend-dev")

// ... more agents
```

### Sprint Self-Assessment Gate
```javascript
// Collect confidence scores
const sprintConfidence = {
  "backend-1": 0.88,
  "tester-1": 0.82,
  "security-1": 0.79
}

// Gate logic
if (allAgents >= 0.75) {
  // PROCEED to Loop 2 (Consensus)
  console.log("Sprint ${sprintId} gate PASSED. Proceeding to consensus...");
} else {
  // RELAUNCH Loop 3 (autonomous retry)
  console.log("Sprint ${sprintId} gate FAILED. Relaunching Loop 3 with feedback...");
}
```

### Sprint Consensus Validation
```javascript
// MESSAGE 2: Validators (AFTER sprint implementation complete)
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 2,
  strategy: "balanced"
})

Task("Reviewer 1", `
  Review completed Sprint ${sprintId} work:
  - Files: [list specific files]
  - Deliverables: ${JSON.stringify(deliverables)}

  Validate code quality, test coverage, security.
  Report consensus score.
`, "reviewer")

Task("Architect 1", `
  Validate Sprint ${sprintId} architecture:
  - API design consistency
  - Integration patterns
  - Scalability considerations

  Report consensus score.
`, "architect")
```

### Sprint Product Owner Decision
```javascript
Task("Product Owner", `
  GOAP DECISION - Sprint ${sprintId} Complete

  CURRENT STATE:
  - Sprint ${sprintId} consensus: ${consensusScore}
  - Remaining sprints: ${remainingSprints}
  - Validator concerns: ${concerns}

  RETRIEVE SPRINT SCOPE:
  mcp__claude-flow-novice__memory_usage({
    action: "retrieve",
    namespace: "scope-control",
    key: "sprint-boundaries"
  })

  EXECUTE GOAP A* SEARCH:
  1. Classify concerns by sprint scope
  2. Calculate cost: in-scope fix vs defer to backlog
  3. A* pathfinding for optimal decision
  4. Make autonomous decision

  DECISION OPTIONS:
  - PROCEED_NEXT_SPRINT (dependencies satisfied, scope intact)
  - RELAUNCH_SPRINT (in-scope blockers remain)
  - DEFER_CONCERNS (out-of-scope, save to backlog)

  OUTPUT: {decision: "...", next_action: "..."}
`, "product-owner")
```

### Sprint Transition Logic
```javascript
// Product Owner decision outcomes
switch (decision) {
  case "PROCEED_NEXT_SPRINT":
    // Store sprint results
    mcp__claude-flow-novice__memory_usage({
      action: "store",
      namespace: "sprint-progress",
      key: `sprint-${sprintId}-results`,
      value: JSON.stringify({
        consensus: consensusScore,
        deliverables: completedDeliverables,
        timestamp: Date.now()
      })
    })

    // Check next sprint dependencies
    const nextSprint = sprintPlan.sprints[currentSprintIndex + 1];
    if (dependenciesSatisfied(nextSprint)) {
      // IMMEDIATELY transition (NO approval needed)
      console.log(`IMMEDIATELY transitioning to Sprint ${nextSprint.sprint_id}...`);
      executeSprint(nextSprint);
    }
    break;

  case "RELAUNCH_SPRINT":
    // IMMEDIATELY relaunch Loop 3 with targeted agents (NO approval)
    console.log(`Relaunching Sprint ${sprintId} Loop 3 with targeted agents...`);
    break;

  case "DEFER_CONCERNS":
    // Save to backlog, proceed to next sprint
    console.log(`Deferred out-of-scope items. Proceeding to next sprint...`);
    break;
}
```

## Autonomous Sprint Execution

**FORBIDDEN PATTERNS:**
- ❌ "Sprint 1.1 complete. Proceed to Sprint 1.2?" (AUTO-PROCEED)
- ❌ "Should I continue with sprints?" (ALWAYS continue until all sprints done)
- ❌ Waiting for approval between sprints (AUTONOMOUS TRANSITION)

**REQUIRED PATTERNS:**
```
Sprint 1.1 consensus: 93% ✅
Dependencies for Sprint 1.2 satisfied.
IMMEDIATELY transitioning to Sprint 1.2...

Sprint 1.2: Password Security
[Spawning agents autonomously - no permission needed]
```

## Iteration Limits (Per Sprint)
- **Loop 2** (Consensus): 10 iterations max per sprint
- **Loop 3** (Primary Swarm): 10 iterations max per sprint
- **Loop 1** (Sprints): Unlimited (continues until all sprints complete)

## Sprint Progress Tracking

```javascript
// Query sprint progress
mcp__claude-flow-novice__memory_usage({
  action: "list",
  namespace: "sprint-progress"
})

// Output:
{
  "sprint-1.1-results": {consensus: 0.93, deliverables: [...]},
  "sprint-1.2-results": {consensus: 0.88, deliverables: [...]},
  "sprint-1.3-results": null // Current sprint in progress
}
```

## Example Sprint Execution

```
[Turn 1] Phase: User Authentication (3 sprints)
         → Sprint scope boundaries stored
         → Sprint 1.1: Core Login API

[Turn 2-3] Sprint 1.1 Execution
           → Loop 3 (backend-dev, tester, security)
           → Gate PASSES (all ≥75%)
           → Loop 2 consensus: 93% ✅
           → Product Owner: PROCEED_NEXT_SPRINT

[Turn 4] AUTONOMOUS TRANSITION
         → Dependencies for Sprint 1.2 satisfied
         → IMMEDIATELY starting Sprint 1.2: Password Security

[Turn 5-6] Sprint 1.2 Execution
           → Loop 3 (2 agents - smaller scope)
           → Consensus: 88% ✅
           → Product Owner: DEFER (Argon2 out-of-scope)

[Turn 7] AUTONOMOUS TRANSITION
         → Sprint 1.3: Token Management

[Turn 8-10] Sprint 1.3 Execution
            → Final sprint completion
            → Phase COMPLETE ✅
```

## Output Format

```
Phase: User Authentication (3 sprints)
Sprint 1.1/1.3: Core Login API

Loop 3 Iteration 1/10 - Confidence: 87% avg ✅
Loop 2 Iteration 1/10 - Consensus: 93% ✅

Sprint 1.1 COMPLETE
Dependencies satisfied for Sprint 1.2.
IMMEDIATELY transitioning to Sprint 1.2...

─────────────────────────────────
Sprint 1.2/1.3: Password Security
[Executing autonomously - no permission needed]
```

## Phase Completion

When final sprint achieves ≥90% consensus:
```
Sprint 1.3 COMPLETE - Consensus: 91% ✅

Phase: User Authentication - ALL SPRINTS COMPLETE ✅
- Sprint 1.1: Core Login API (93%)
- Sprint 1.2: Password Security (88%)
- Sprint 1.3: Token Management (91%)

Deferred items saved to backlog:
- OAuth integration (out-of-scope)
- Argon2 hashing (out-of-scope)
- Sliding session windows (out-of-scope)

Phase execution complete. Self-looping terminated.
```

## Integration with Epic

If this phase is part of a larger epic, results are stored for epic-level tracking:
```javascript
mcp__claude-flow-novice__memory_usage({
  action: "store",
  namespace: "epic-progress",
  key: "phase-1-results",
  value: JSON.stringify({
    phase_name: "User Authentication",
    sprints_completed: ["1.1", "1.2", "1.3"],
    overall_consensus: 0.91,
    ready_for_next_phase: true
  })
})
```
