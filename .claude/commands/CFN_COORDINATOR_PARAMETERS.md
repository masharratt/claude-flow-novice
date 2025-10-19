# CFN Loop Coordinator - Structured Parameters Reference

**Version:** 2.0.0
**Date:** 2025-10-19
**Status:** Production Ready

---

## Overview

This document defines the structured parameter specification for CFN Loop coordinator agents. All CFN slash commands (`/cfn-loop`, `/cfn-loop-single`, `/cfn-loop-epic`) now use a **single coordinator pattern** with enhanced parameter passing for maximum control and visibility.

---

## Core Architecture

### Single Coordinator Pattern

```
/cfn-loop "task"
  ↓
Main Chat spawns ONE agent: cost-savings-cfn-loop-coordinator
  ↓
Coordinator runs orchestrate-cfn-loop.sh internally
  ↓
Orchestrator spawns agents via CLI (npx claude-flow-novice)
  ↓
Coordinator manages Redis coordination, iterations, consensus
  ↓
Coordinator returns structured result to Main Chat
```

**Benefits:**
- 🚀 95-98% cost savings (CLI spawning vs Task() spawning)
- 💰 64-80% additional savings (Z.ai routing vs Anthropic)
- 🎯 Single point of control (one agent to prompt/configure)
- 🔧 Skill-driven behavior (Redis coordination skills)
- 📊 Web portal visibility (real-time monitoring)
- ⚡ Zero-token waiting (Redis BLPOP between iterations)

---

## Custom Routing for Maximum Cost Savings

### Provider Routing Model

**CRITICAL:** Task Tool agents use Main Chat provider, CLI agents use custom routing.

```
┌─────────────────────────────────────────────────┐
│ Main Chat (Anthropic Claude Max)               │
│   ↓ Task()                                      │
│ Coordinator Agent (Anthropic) [$0.015]         │
│   ↓ CLI spawn                                   │
│ Loop 3/Loop 2 Agents (Z.ai when enabled) [$0.003] │
└─────────────────────────────────────────────────┘
```

### Setup Instructions

**1. Enable Custom Routing (One-Time)**
```bash
/custom-routing-activate
```

**2. Verify Configuration**
```bash
/switch-api status
```

Expected output:
```
Current API: Anthropic Claude Max (Main Chat)
Custom Routing: ENABLED
├─ Task Tool agents → Anthropic (same as Main Chat)
└─ CLI agents → Z.ai (cost optimized)
```

### Cost Comparison

**Single CFN Loop Iteration (3 Loop 3 agents, 4 Loop 2 agents):**

| Configuration | Main Chat | Coordinator | Loop 3 (3) | Loop 2 (4) | PO | Total |
|---------------|-----------|-------------|------------|------------|----|----|
| **No Custom Routing** | $0.015 | $0.015 | $0.045 | $0.060 | $0.015 | **$0.150** |
| **With Custom Routing** | $0.015 | $0.015 | $0.009 | $0.012 | $0.003 | **$0.054** |
| **Savings** | - | - | $0.036 | $0.048 | $0.012 | **$0.096 (64%)** |

**Multi-Phase Epic (3 phases, 2 iterations each):**

| Configuration | Total Cost | Cost Per Phase |
|---------------|------------|----------------|
| **No Custom Routing** | $0.90 | $0.30 |
| **With Custom Routing** | $0.32 | $0.11 |
| **Savings** | **$0.58 (64%)** | $0.19 |

### Provider Pricing

| Provider | Input Tokens | Output Tokens | Use Case |
|----------|--------------|---------------|----------|
| **Anthropic** | $3.00/1M | $15.00/1M | Main Chat, Coordinator (Task tool) |
| **Z.ai** | $0.50/1M | $0.50/1M | All CLI-spawned agents |

**Estimated Cost Per Agent Call:**
- Anthropic (Task tool): ~$0.015 per call
- Z.ai (CLI): ~$0.003 per call
- **5x cheaper with Z.ai routing**

---

## Required Parameters

### 1. Task Specification

**Purpose:** Define what needs to be accomplished

```javascript
Task Description: ${taskDescription}  // REQUIRED - Natural language task description
Phase Name: ${phaseName || 'default'}  // OPTIONAL - Phase identifier for tracking
Task ID: cfn-${phaseName}-$(date +%s) // AUTO-GENERATED - Unique task ID
```

**Example:**
```
Task Description: Implement JWT authentication with refresh tokens
Phase Name: auth-implementation
Task ID: cfn-auth-implementation-1729350000
```

---

### 2. Success Criteria (MANDATORY)

**Purpose:** Define acceptance criteria, quality gates, and definition of done

#### Acceptance Criteria
Checklist of functional requirements that must be met:

```
Acceptance Criteria:
- [ ] Feature implements core functionality
- [ ] All tests pass with >80% coverage
- [ ] Security review completed
- [ ] Documentation updated
- [ ] No regression in existing features
```

**Guidelines:**
- Use checkbox format `- [ ]` for tracking
- Be specific and measurable
- Focus on functional outcomes
- Include cross-cutting concerns (tests, security, docs)

#### Quality Gates
Numerical thresholds for gate and consensus checks:

```
Quality Gates:
- Loop 3 Gate Threshold: ${gateThreshold} (${mode} mode)
- Loop 2 Consensus Threshold: ${consensusThreshold} (${mode} mode)
- Max Loop 3 Iterations: ${maxLoop3}
- Max Loop 2 Iterations: ${maxLoop2}
```

**Mode-Specific Thresholds:**
| Mode | Gate Threshold | Consensus Threshold | Max Iterations |
|------|----------------|---------------------|----------------|
| MVP | 0.70 | 0.80 | 5 |
| Standard | 0.75 | 0.90 | 10 |
| Enterprise | 0.85 | 0.95 | 15 |

#### Definition of Done
Final checklist before task completion:

```
Definition of Done:
- Consensus ≥${consensusThreshold} achieved
- All acceptance criteria met
- Product Owner approval received
```

---

### 3. Orchestration Configuration

**Purpose:** Define agent composition and coordination mode

```
Mode: ${mode.toUpperCase()} // MVP | STANDARD | ENTERPRISE

Loop 3 Agents (Implementation):
- ${loop3Agents.join('\n  - ')}

Loop 2 Agents (Validation):
- ${loop2Agents.join('\n  - ')}

Product Owner: product-owner
```

**Default Agent Configurations:**

**Loop 3 (Implementation):**
- `researcher` - Requirement analysis, research
- `backend-dev` - Backend implementation
- `frontend-dev` - Frontend implementation (if needed)
- `devops` - Infrastructure, deployment

**Loop 2 (Validation):**
- `reviewer` - Code review, quality assessment
- `architect` - Design validation, architecture review
- `tester` - Testing, QA validation
- `security-specialist` - Security audit

**Loop 1 (Product Owner):**
- `product-owner` - GOAP decision-making, scope enforcement

---

### 4. Execution Instructions

**Purpose:** Specify how coordinator should execute the task

```bash
1. INVOKE ORCHESTRATOR:
   ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
     --task-id "${taskId}" \
     --mode ${mode} \
     --loop3-agents "${loop3Agents.join(',')}" \
     --loop2-agents "${loop2Agents.join(',')}" \
     --product-owner "product-owner" \
     --max-iterations ${maxLoop2}

2. MONITOR PROGRESS:
   - Use web portal: http://localhost:3000
   - Query metrics: ./.claude/skills/web-portal/invoke-portal-metrics.sh
   - Track events: ./.claude/skills/web-portal/invoke-portal-events.sh --phase ${phaseName}

3. REPORT RESULTS:
   Return structured result to Main Chat:
   {
     "taskId": "${taskId}",
     "phase": "${phaseName}",
     "status": "complete|failed",
     "iterations": { "loop3": N, "loop2": M },
     "finalConsensus": 0.XX,
     "acceptanceCriteria": {
       "met": [...],
       "pending": [...]
     },
     "nextActions": [...]
   }
```

---

### 5. Critical Rules

**Purpose:** Enforce coordination patterns and prevent common mistakes

```
CRITICAL RULES:
- DO NOT spawn agents manually with Task()
- LET orchestrator script handle all agent spawning via CLI
- USE Redis BLPOP for loop dependencies
- REPORT confidence/consensus after each iteration
- WAKE agents via invoke-waiting-mode.sh wake
- PUBLISH events to web-portal:events channel
- RETURN structured result when complete
```

---

## Epic-Specific Parameters

### Additional Parameters for `/cfn-loop-epic`

#### Epic Specification

```javascript
Epic Goal: $ARGUMENTS  // High-level epic goal
Epic ID: epic-$(date +%s)  // Unique epic identifier
Mode: STANDARD  // Apply to all phases

Phases:
${epicPhases.map((p, i) =>
  `  Phase ${i+1}: ${p.name}
  - Deliverables: ${p.deliverables.join(', ')}
  - Dependencies: ${p.dependencies.join(', ') || 'None'}
  - Estimated agents: ${p.estimated_agents}`
).join('\n')}
```

#### Scope Boundaries (CRITICAL)

```
Scope Boundaries (CRITICAL - ENFORCE STRICTLY):

In Scope:
- ${inScopeItems.join('\n  - ')}

Out of Scope (DEFER TO BACKLOG):
- ${outOfScopeItems.join('\n  - ')}
```

**Purpose:** Prevent scope creep, enable Product Owner to defer out-of-scope items

#### Epic-Level Acceptance Criteria

```
Epic-Level Acceptance Criteria:
- [ ] All phases complete with consensus ≥0.90
- [ ] All deliverables implemented
- [ ] Integration tests pass
- [ ] Security audit complete
- [ ] Documentation updated
- [ ] No scope creep (out-of-scope items deferred)
```

---

## Structured Result Format

### Single Task Result

```json
{
  "taskId": "cfn-auth-1729350000",
  "phase": "auth-implementation",
  "status": "complete",
  "iterations": {
    "loop3": 2,
    "loop2": 1
  },
  "finalConsensus": 0.94,
  "acceptanceCriteria": {
    "met": [
      "Core functionality implemented",
      "Tests passing (85% coverage)",
      "Security review complete",
      "Documentation updated"
    ],
    "pending": [
      "Performance optimization (deferred)"
    ]
  },
  "nextActions": [
    "Deploy to staging",
    "Monitor for 24h",
    "Schedule production deployment"
  ]
}
```

### Epic Result

```json
{
  "epicId": "epic-1729350000",
  "status": "complete",
  "phases": [
    {
      "phaseId": "phase-1",
      "name": "User Authentication",
      "status": "complete",
      "consensus": 0.94,
      "iterations": {"loop3": 2, "loop2": 1},
      "deliverables": ["Login API", "JWT generation", "Password hashing"]
    },
    {
      "phaseId": "phase-2",
      "name": "Authorization & RBAC",
      "status": "complete",
      "consensus": 0.91,
      "iterations": {"loop3": 3, "loop2": 2},
      "deliverables": ["Role system", "Permission checks", "Middleware"]
    },
    {
      "phaseId": "phase-3",
      "name": "Session Management",
      "status": "complete",
      "consensus": 0.92,
      "iterations": {"loop3": 2, "loop2": 1},
      "deliverables": ["Refresh tokens", "Logout", "Session tracking"]
    }
  ],
  "deferredItems": [
    "OAuth/social login (out-of-scope)",
    "Multi-factor authentication (out-of-scope)",
    "Biometric authentication (out-of-scope)"
  ],
  "recommendations": [
    "Consider OAuth for Phase 2 of epic",
    "Monitor session timeout edge cases",
    "Plan MFA as separate epic"
  ]
}
```

---

## Visibility & Monitoring

### Web Portal Integration

**Real-time monitoring during execution:**

```bash
# Start web portal (if not running)
./.claude/skills/web-portal/invoke-portal-start.sh

# View all active agents
./.claude/skills/web-portal/invoke-portal-agents.sh --status active

# Track phase events
./.claude/skills/web-portal/invoke-portal-events.sh --phase ${PHASE_NAME}

# Get consensus metrics
./.claude/skills/web-portal/invoke-portal-metrics.sh --view consensus

# Dashboard summary
./.claude/skills/web-portal/invoke-portal-dashboard.sh
```

**Web UI:** http://localhost:3000
- Agent hierarchy (tree view)
- Confidence scores (per agent)
- Event timeline (filterable)
- Consensus trends (graph)
- Real-time updates (WebSocket)

---

## Example Parameter Sets

### Example 1: MVP Mode Single Task

```javascript
Task("cost-savings-cfn-loop-coordinator", `
  CFN LOOP EXECUTION - STRUCTURED PARAMETERS

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TASK SPECIFICATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Task Description: Build MVP user registration endpoint
  Phase Name: mvp-registration
  Task ID: cfn-mvp-registration-1729350000

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SUCCESS CRITERIA (REQUIRED)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Acceptance Criteria:
  - [ ] POST /register endpoint functional
  - [ ] Basic email/password validation
  - [ ] Passwords hashed with bcrypt
  - [ ] Returns JWT token
  - [ ] Basic test coverage (>60%)

  Quality Gates:
  - Loop 3 Gate Threshold: 0.70 (mvp mode)
  - Loop 2 Consensus Threshold: 0.80 (mvp mode)
  - Max Loop 3 Iterations: 5
  - Max Loop 2 Iterations: 5

  Definition of Done:
  - Consensus ≥0.80 achieved
  - All acceptance criteria met
  - Product Owner approval received

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ORCHESTRATION CONFIGURATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Mode: MVP

  Loop 3 Agents (Implementation):
  - backend-dev

  Loop 2 Agents (Validation):
  - reviewer
  - tester

  Product Owner: product-owner

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EXECUTION INSTRUCTIONS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. INVOKE ORCHESTRATOR:
     ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \\
       --task-id "cfn-mvp-registration-1729350000" \\
       --mode mvp \\
       --loop3-agents "backend-dev" \\
       --loop2-agents "reviewer,tester" \\
       --product-owner "product-owner" \\
       --max-iterations 5

  2. MONITOR PROGRESS:
     - Web portal: http://localhost:3000
     - CLI: ./.claude/skills/web-portal/invoke-portal-agents.sh

  3. REPORT RESULTS:
     {
       "taskId": "cfn-mvp-registration-1729350000",
       "status": "complete",
       "finalConsensus": 0.XX,
       "acceptanceCriteria": {"met": [...], "pending": [...]},
       "nextActions": [...]
     }

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CRITICAL RULES
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - DO NOT spawn agents with Task()
  - LET orchestrator handle CLI spawning
  - USE Redis BLPOP for dependencies
  - RETURN structured result
`, "cost-savings-cfn-loop-coordinator")
```

### Example 2: Enterprise Mode Multi-Phase Epic

```javascript
Task("cost-savings-cfn-loop-coordinator", `
  CFN LOOP EPIC EXECUTION - MULTI-PHASE

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EPIC SPECIFICATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Epic Goal: Build complete authentication system
  Epic ID: epic-1729350000
  Mode: ENTERPRISE (gate: 0.85, consensus: 0.95)

  Phases:
    Phase 1: User Authentication
    - Deliverables: Login API, JWT generation, Password hashing
    - Dependencies: None
    - Estimated agents: 5

    Phase 2: Authorization & RBAC
    - Deliverables: Role system, Permission checks, Middleware
    - Dependencies: Phase 1
    - Estimated agents: 6

    Phase 3: Session Management
    - Deliverables: Refresh tokens, Logout, Session tracking
    - Dependencies: Phase 1, Phase 2
    - Estimated agents: 4

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EPIC-LEVEL SUCCESS CRITERIA
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Scope Boundaries (CRITICAL - ENFORCE STRICTLY):

  In Scope:
  - JWT authentication
  - Role-based access control
  - Session management
  - Password security (bcrypt)

  Out of Scope (DEFER TO BACKLOG):
  - OAuth/social login
  - Multi-factor authentication
  - Biometric authentication
  - Advanced rate limiting

  Epic-Level Acceptance Criteria:
  - [ ] All phases complete with consensus ≥0.95
  - [ ] All deliverables implemented
  - [ ] Integration tests pass
  - [ ] Security audit complete
  - [ ] Documentation updated
  - [ ] No scope creep

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE-BY-PHASE EXECUTION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  For EACH phase:

  1. CHECK DEPENDENCIES
  2. STORE SCOPE BOUNDARIES (memory)
  3. INVOKE ORCHESTRATOR:
     ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \\
       --task-id "phase-X-$(date +%s)" \\
       --mode enterprise \\
       --loop3-agents "backend-dev,frontend-dev,devops,security-specialist,researcher" \\
       --loop2-agents "reviewer,architect,tester,security-specialist,performance-analyst" \\
       --product-owner "product-owner" \\
       --max-iterations 15
  4. STORE PHASE RESULTS (memory)
  5. AUTO-TRANSITION to next phase

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MONITORING & VISIBILITY
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Web Portal: http://localhost:3000
  Per-Phase Monitoring: ./.claude/skills/web-portal/invoke-portal-events.sh --phase phase-X

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FINAL EPIC REPORT
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Return structured result with all phases, deferred items, recommendations.

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CRITICAL RULES
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - DO NOT spawn agents with Task()
  - AUTO-TRANSITION between phases
  - DEFER out-of-scope items
  - RETURN epic summary
`, "cost-savings-cfn-loop-coordinator")
```

---

## Migration Notes

### What Changed (v1 → v2)

**v1 (Old Pattern):**
- Main Chat spawned coordinator + all agents in parallel
- Coordinator used Task() to spawn agents
- Manual spawning alternatives provided
- Confusing, prone to coordination failures

**v2 (New Pattern):**
- Main Chat spawns ONLY coordinator
- Coordinator spawns agents via CLI internally
- No manual spawning alternatives
- Single point of control, structured parameters

**Migration Impact:**
- 95-98% cost savings from CLI spawning
- Better visibility via web portal
- Easier debugging (single coordinator)
- Skill-driven coordination behavior

---

## Related Documentation

- **Redis Coordination Skill:** `.claude/skills/redis-coordination/SKILL.md`
- **Web Portal Skill:** `.claude/skills/web-portal/SKILL.md`
- **CFN Loop Validation Skill:** `.claude/skills/cfn-loop-validation/SKILL.md`
- **Slash Commands:** `.claude/commands/cfn-loop*.md`

---

**Version History:**

- **2.0.0 (2025-10-19):** Single coordinator pattern, structured parameters, web portal integration
- **1.0.0 (2025-10-15):** Initial CFN Loop implementation with parallel spawning
