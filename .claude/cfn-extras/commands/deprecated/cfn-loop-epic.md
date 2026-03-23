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

**MANDATORY: Spawn single coordinator agent that manages ALL phases autonomously.**

The coordinator uses CLI spawning per phase and provides full visibility via web portal.

### Epic Pattern (SINGLE COORDINATOR FOR ALL PHASES)

```javascript
Task("cfn-v3-coordinator", `
  CFN LOOP EPIC EXECUTION - MULTI-PHASE

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  COST OPTIMIZATION - CUSTOM ROUTING (CRITICAL)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ⚠️  IMPORTANT: Enable custom routing for maximum cost savings!

  1. Enable routing (one-time setup):
     /custom-routing-activate

  2. Verify status:
     /switch-api status

  Cost Breakdown (PER PHASE, per iteration):
  ┌─────────────────────┬──────────────┬────────────┐
  │ Component           │ Provider     │ Cost/Call  │
  ├─────────────────────┼──────────────┼────────────┤
  │ Main Chat           │ Anthropic    │ $0.015     │
  │ Coordinator (Task)  │ Anthropic    │ $0.015     │
  │ Loop 3 Agents (CLI) │ Z.ai         │ $0.003 ea  │
  │ Loop 2 Agents (CLI) │ Z.ai         │ $0.003 ea  │
  │ Product Owner (CLI) │ Z.ai         │ $0.003     │
  └─────────────────────┴──────────────┴────────────┘

  Epic Cost Example (3 phases, 2 iterations each):
  • WITH custom routing:    ~$0.30 total
  • WITHOUT custom routing: ~$0.90 total
  • SAVINGS: ~67% cost reduction

  Key Concept:
  - Task() agents use Main Chat provider (Anthropic)
  - CLI-spawned agents use custom routing (Z.ai when enabled)
  - Cost multiplies by number of phases and iterations

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EPIC SPECIFICATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Epic Goal: $ARGUMENTS
  Epic ID: epic-$(date +%s)
  Mode: STANDARD (gate: 0.75, consensus: 0.90)

  Phases (ANALYZE EPIC AND DEFINE):
  # Parse epic description and break into phases
  # Example structure:
  Phase 0: Assessment
    - Deliverables: Requirements analysis, Architecture design
    - Dependencies: None
    - Estimated agents: 2 (analyst, architect)

  Phase 1: Core Implementation
    - Deliverables: Main features, API endpoints
    - Dependencies: Phase 0
    - Estimated agents: 3 (backend-dev, researcher, devops)

  Phase 2: Validation
    - Deliverables: Tests, Security audit, Documentation
    - Dependencies: Phase 0, Phase 1
    - Estimated agents: 3 (tester, reviewer, security-specialist)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EPIC-LEVEL SUCCESS CRITERIA
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Scope Boundaries (CRITICAL - ENFORCE STRICTLY):

  In Scope (EXAMPLE - CUSTOMIZE FOR YOUR EPIC):
  - Feature implementation as described
  - Basic testing and validation
  - Essential documentation
  - Security fundamentals

  Out of Scope (DEFER TO BACKLOG - EXAMPLE):
  - Advanced features not in core spec
  - Performance optimization beyond basics
  - Additional integrations
  - Nice-to-have features

  Epic-Level Acceptance Criteria:
  - [ ] All phases complete with consensus ≥0.90
  - [ ] All deliverables implemented
  - [ ] Integration tests pass
  - [ ] Security audit complete
  - [ ] Documentation updated
  - [ ] No scope creep (out-of-scope items deferred)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE-BY-PHASE EXECUTION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  For EACH phase:

  1. CHECK DEPENDENCIES:
     - Verify all dependency phases complete
     - Load previous phase results from memory

  2. STORE SCOPE BOUNDARIES:
     mcp__claude-flow-novice__memory_usage({
       action: "store",
       namespace: "scope-control",
       key: "epic-${EPIC_ID}-scope",
       value: JSON.stringify({
         inScope: [...],
         outOfScope: [...],
         decisionAuthority: {...}
       })
     })

  3. INVOKE ORCHESTRATOR FOR PHASE:
     # Generate task ID and construct bash command with actual values
     # DO NOT use template literals - construct real bash variables

     TASK_ID="phase-0-$(date +%s)"
     MODE="standard"
     LOOP3_AGENTS="analyst,architect"
     LOOP2_AGENTS="reviewer,architect"

     ./.claude/skills/cfn-cfn-cfn-orchestration/orchestrate.sh \
       --task-id "$TASK_ID" \
       --mode "$MODE" \
       --loop3-agents "$LOOP3_AGENTS" \
       --loop2-agents "$LOOP2_AGENTS" \
       --product-owner "product-owner" \
       --max-iterations 10

  4. STORE PHASE RESULTS:
     mcp__claude-flow-novice__memory_usage({
       action: "store",
       namespace: "epic-progress",
       key: "phase-${PHASE_ID}-results",
       value: JSON.stringify({
         consensus: 0.XX,
         deliverables: [...],
         timestamp: Date.now()
       })
     })

  5. AUTO-TRANSITION:
     IF phase consensus ≥0.90 AND dependencies satisfied:
       IMMEDIATELY start next phase (NO approval needed)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MONITORING & VISIBILITY
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Web Portal: http://localhost:3000

  Per-Phase Monitoring:
  - Agents: ./.claude/skills/cfn-cfn-web-portal/invoke-portal-agents.sh --swarm phase-${PHASE_ID}
  - Events: ./.claude/skills/cfn-cfn-web-portal/invoke-portal-events.sh --phase phase-${PHASE_ID}
  - Metrics: ./.claude/skills/cfn-cfn-web-portal/invoke-portal-metrics.sh

  Epic Progress:
  - Query memory for phase results
  - Track consensus trends
  - Monitor scope adherence

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FINAL EPIC REPORT
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Return structured result to Main Chat:
  {
    "epicId": "epic-XXXXX",
    "status": "complete|partial|failed",
    "phases": [
      {
        "phaseId": "phase-1",
        "name": "User Authentication",
        "status": "complete",
        "consensus": 0.94,
        "iterations": {"loop3": 2, "loop2": 1},
        "deliverables": ["Login API", "JWT generation", ...]
      },
      ...
    ],
    "deferredItems": [
      "OAuth integration (out-of-scope)",
      "Biometric auth (out-of-scope)"
    ],
    "recommendations": [...]
  }

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CRITICAL RULES
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - DO NOT spawn agents with Task()
  - LET orchestrator handle CLI spawning per phase
  - USE memory for scope enforcement
  - AUTO-TRANSITION between phases (no approval)
  - DEFER out-of-scope items to backlog
  - PUBLISH events per phase
  - RETURN epic summary when complete
`, "cfn-v3-coordinator")
```

### Coordinator Autonomous Multi-Phase Execution

**Phase Iteration:**
For each phase, coordinator:
1. Checks dependencies satisfied
2. Loads scope boundaries
3. Invokes orchestrator for phase
4. Monitors via web portal
5. Stores phase results
6. Auto-transitions to next phase

**Visibility per Phase:**
- Web UI shows all phases, current phase highlighted
- Event stream filtered by phase ID
- Metrics track per-phase consensus trends

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
