# CFN Loop — Enterprise Mode

**Use when:** Production-critical systems, compliance, large scale, many stakeholders.

---

## Thresholds

| Gate (L3) | Consensus (L2) | Loop 0.5 Design | Max Iters (L3/L2) | Coverage | PO |
|---|---|---|---|---|---|
| ≥0.75 | ≥0.95 | ≥0.85 architect consensus | 15 / 15 | ≥90% + e2e | 4-person board (weighted) |

---

## Loop Flow

```
Loop 0.5 (Planning - Enterprise Only)
  → 3 architects → design consensus ≥0.85
  → ADRs, system diagrams, API specs
  → Redis debate channel, SQLite design storage

Loop 3 (Implementation)
  → Follow Loop 0.5 approved design
  → Gate ≥0.75 each agent
  → Max 15 iterations

Loop 2 (Validation)
  → 4 validators (quality, security, perf, tester)
  → Consensus ≥0.95 (highest bar)
  → Max 15 iterations

Loop 4 (Product Owner Board - Enterprise Only)
  → 4-person weighted board (CTO 30%, PO 30%, User 20%, A11y 20%)
  → PROCEED / DEFER / ESCALATE
  → Weighted voting ≥0.75
```

---

## Loop 0.5: Planning Consensus (Enterprise-Only)

**Purpose:** Architect team debates design BEFORE Loop 3 implementation.

**Why critical:** Prevents costly rework via upfront design consensus.

### Spawn Architects (Single Message)

```bash
Task: Spawn architect team for Loop 0.5 design consensus

Agents:
1. system-architect-persona (.claude/agents/planning-team/system-architect.yaml)
   - Instruction: "Design system architecture. Focus: scalability (10M+ users), microservices boundaries. Publish to redis://design:debate:auth. Vote on final design."

2. security-architect-persona (.claude/agents/planning-team/security-architect.yaml)
   - Instruction: "Review design for threats. Focus: OAuth 2.0/OIDC, token security, threat modeling. Challenge insecure patterns on redis://design:debate:auth. Vote."

3. api-designer-persona (.claude/agents/planning-team/api-designer.yaml)
   - Instruction: "Design REST API contracts. Focus: versioning, OpenAPI 3.0, rate limiting. Propose on redis://design:debate:auth. Vote."

All agents:
- Subscribe: redis://design:debate:auth
- Debate: 10-15 minutes
- Voting: ≥0.85 consensus (33.3% each)
- Output: ADRs, diagrams, API specs
- Store: SQLite key "cfn/phase-auth/loop0.5/design" (ACL 3, 365d)
```

### Design Debate Process

**Redis channel:** `design:debate:{phaseId}`

**Message types:**
- **Proposal:** Initial design with rationale, tradeoffs
- **Challenge:** Security/scalability concerns, severity, recommendations
- **Refinement:** Updated design addressing concerns
- **Vote Request:** Call for consensus vote

**Debate timeline:**
- Minutes 0-5: Proposals
- Minutes 5-10: Challenges and debate
- Minutes 10-12: Refinements
- Minutes 12-15: Voting

### Voting & Consensus

```typescript
// Vote structure
{
  agent: "system-architect-persona",
  vote: "approve",  // approve | concerns | reject
  confidence: 0.90,
  weight: 0.333,
  reasoning: "Design meets scalability requirements"
}

// Consensus calculation (≥0.85 to proceed)
const consensus = (
  architect1.confidence * 0.333 +
  architect2.confidence * 0.333 +
  architect3.confidence * 0.333
);
```

**Example:**
```
System Architect: approve (0.90) × 0.333 = 0.300
Security Architect: approve (0.85) × 0.333 = 0.283
API Designer: concerns (0.80) × 0.333 = 0.266
Consensus: 0.849 ❌ (below 0.85)

Action: Spawn mediator agent
```

### Output Storage

**SQLite** (ACL Level 3: Swarm, 365-day TTL):

```bash
/sqlite-memory store \
  --key "cfn/phase-auth/loop0.5/design" \
  --level swarm \
  --data '{
    "consensus":0.88,
    "design":{
      "architecture":"microservices",
      "security":"OAuth 2.0 + OIDC, encrypted Redis",
      "scalability":"10M+ users, 99.99% SLA"
    },
    "adrs":["ADR-001-microservices.md","ADR-002-oauth2.md"],
    "votes":[
      {"agent":"system-architect","confidence":0.90},
      {"agent":"security-architect","confidence":0.88},
      {"agent":"api-designer","confidence":0.85}
    ]
  }' \
  --ttl 31536000
```

### Mediator (If Consensus <0.85)

```bash
Task: Spawn design mediator

Agent: design-mediator-persona
Instruction: "Consensus 0.849 below 0.85. API Designer concerns: backward compatibility. Facilitate negotiation. Propose: versioned API with 6-month deprecation. Target ≥0.85. Max 3 rounds."
```

---

## Loop 3: Implementation (Following Design)

**Must follow Loop 0.5 approved design** (stored in SQLite).

### Spawn Implementers

```bash
Task: Spawn implementers for Loop 3

Design Spec: Read from SQLite key "cfn/phase-auth/loop0.5/design"

Constraints:
- MUST follow microservices architecture (ADR-001)
- MUST implement OAuth 2.0 + OIDC (ADR-002)
- MUST use encrypted Redis
- MUST achieve 90%+ test coverage

Agents (mesh, 2-7):
1. coder-backend-1: Implement auth-service per ADR-001
   - OAuth 2.0 token issuance, encrypted Redis
   - Store: SQLite "cfn/phase-auth/loop3/agent-1"
   - Confidence: ≥0.75

2. coder-backend-2: Implement token-service
   - JWT signing, token refresh logic
   - Store: SQLite "cfn/phase-auth/loop3/agent-2"
   - Confidence: ≥0.75

3. security-specialist: Validate security vs threat model
   - Store: SQLite "cfn/phase-auth/loop3/agent-3"
   - Confidence: ≥0.75

4. tester: Integration tests, 90%+ coverage
   - Store: SQLite "cfn/phase-auth/loop3/agent-4"
   - Confidence: ≥0.75

All: Coordinate via redis://swarm:coordination:auth
```

**Hierarchical** (if >7 agents): Coordinator + teams (up to 50 agents)

---

## Loop 2: 4-Validator Consensus (≥0.95)

**After Loop 3 gate passes, spawn 4 validators:**

```bash
Task: Spawn 4-validator team

Validators:
1. code-quality-validator: SOLID, design patterns, maintainability
   - Weight: 25%
   - Target: ≥0.90

2. security-specialist: OAuth review, threat model verification, pen test
   - Weight: 25%
   - Target: ≥0.90

3. perf-analyzer: Load testing (10M+ users), Redis latency, scaling
   - Weight: 25%
   - Target: ≥0.90

4. tester: 90%+ coverage, integration tests, edge cases
   - Weight: 25%
   - Target: ≥0.90

All: Read design (Loop 0.5) + implementation (Loop 3)
Consensus target: ≥0.95 (weighted average)
```

### Consensus Calculation

```typescript
const consensus = (
  0.92 * 0.25 +  // code-quality
  0.95 * 0.25 +  // security
  0.94 * 0.25 +  // performance
  0.96 * 0.25    // testing
) = 0.9425

// ALWAYS proceed to Loop 4 regardless of consensus
// Product Owner Board can override validator recommendations
// Validators provide recommendations, not gate-blocking decisions
```

**Result:** 0.9425 < 0.95 → Proceed to Loop 4 Board (Board can override)

**Redis event:**

```bash
# Publish consensus result (always proceed to Loop 4)
redis-cli publish "cfn:loop2:consensus:complete" '{
  "consensus":0.9425,
  "target":0.95,
  "met":false,
  "validators":[
    {"name":"code-quality","confidence":0.92},
    {"name":"security","confidence":0.95},
    {"name":"perf","confidence":0.94},
    {"name":"tester","confidence":0.96}
  ],
  "recommendations":[
    {"severity":"low","description":"Refactor OAuth config"},
    {"severity":"medium","description":"Add rate limiting"}
  ],
  "action":"proceed_to_loop4_board"
}'
```

---

## Loop 4: Multi-Stakeholder Board (Enterprise-Only)

**Purpose:** 4-person weighted voting board makes decision.

**Why critical:** Enterprise requires multi-stakeholder alignment.

### Board Composition

| Stakeholder | Weight | Primary Concerns |
|-------------|--------|------------------|
| CTO | 30% | Technical debt, scalability, security, cost |
| Product Owner | 30% | Feature completeness, time-to-market |
| Power User | 20% | UX, performance, workflows |
| Accessibility Advocate | 20% | WCAG AAA, screen readers, keyboard nav |

### Spawn Board

```bash
Task: Spawn 4-person Product Owner Board

Context:
- Loop 2 consensus: 0.9425 (below 0.95 by 0.0075)
- Recommendations:
  [LOW] Refactor OAuth config
  [MEDIUM] Add rate limiting (10 req/min)

Board:
1. cto-agent (30%): Evaluate if 0.0075 gap justifies delay
   - Vote: PROCEED/DEFER/ESCALATE
   - Store: SQLite "cfn/phase-auth/loop4/vote-cto"

2. product-owner-agent (30%): Time-to-market vs perfection
   - Store: SQLite "cfn/phase-auth/loop4/vote-po"

3. power-user-persona (20%): Rate limiting UX impact
   - Store: SQLite "cfn/phase-auth/loop4/vote-user"

4. accessibility-advocate-persona (20%): WCAG AAA compliance
   - Store: SQLite "cfn/phase-auth/loop4/vote-a11y"

All: Read all loop memory from SQLite
Decision threshold: ≥0.75 weighted consensus
```

### Weighted Vote Calculation

```typescript
// Vote mapping: PROCEED=1.0, DEFER=0.5, ESCALATE=0.0
const weightedScore = (
  0.5 * 0.30 * 0.80 +  // CTO: DEFER × 30% × confidence
  1.0 * 0.30 * 0.85 +  // PO: PROCEED × 30%
  0.5 * 0.20 * 0.75 +  // User: DEFER × 20%
  1.0 * 0.20 * 0.90    // A11y: PROCEED × 20%
) = 0.630

// Decision ranges
if (weightedScore >= 0.75) decision = "PROCEED";
else if (weightedScore >= 0.40) decision = "DEFER";
else decision = "ESCALATE";
```

**Result:** 0.630 → **DEFER** (Add rate limiting, backlog refactor, launch agents for next phase)

**Board can override validators:** Even if consensus <0.95, Board can vote DEFER if validator concerns are out-of-scope, enhancements, or can be backlogged.

**Redis events:**

```bash
# Publish Board decision
redis-cli publish "cfn:loop4:board:decision" '{
  "decision":"DEFER",
  "weighted_score":0.630,
  "consensus":0.9425,
  "override":true,
  "reasoning":"Low-priority refactor out-of-scope, defer rate limiting to post-launch",
  "action":"launch_next_phase_agents",
  "votes":[
    {"stakeholder":"cto","vote":"DEFER","confidence":0.80},
    {"stakeholder":"po","vote":"PROCEED","confidence":0.85},
    {"stakeholder":"user","vote":"DEFER","confidence":0.75},
    {"stakeholder":"a11y","vote":"PROCEED","confidence":0.90}
  ]
}'

# Publish phase complete
redis-cli publish "cfn:phase:complete" '{
  "phase":"auth",
  "decision":"DEFER",
  "boardOverride":true,
  "nextPhase":"user-profile",
  "action":"spawn_agents"
}'

# Publish phase transition
redis-cli publish "cfn:phase:transition" '{
  "from":"auth",
  "to":"user-profile",
  "trigger":"board_defer_decision",
  "consensusOverride":true
}'
```

### Disagreement Handling

**Trigger:** Disagreement >0.15 between any two stakeholders

```bash
# If triggered, spawn facilitator
Task: Spawn board facilitator

Agent: board-facilitator-persona
Instruction: "Disagreement: CTO (DEFER 0.80) vs PO (PROCEED 0.85). Issue: Rate limiting priority. Facilitate: Can it be hotfix post-launch? Max 3 rounds. Target >0.85."
```

### Decision Storage

**SQLite** (ACL Level 4: Project, 365-day TTL):

```bash
/sqlite-memory store \
  --key "cfn/phase-auth/loop4/decision" \
  --level project \
  --data '{
    "decision":"DEFER",
    "weighted_score":0.630,
    "consensus":0.9425,
    "override":true,
    "votes":[
      {"stakeholder":"cto","vote":"DEFER","confidence":0.80,"weight":0.30},
      {"stakeholder":"po","vote":"PROCEED","confidence":0.85,"weight":0.30},
      {"stakeholder":"user","vote":"DEFER","confidence":0.75,"weight":0.20},
      {"stakeholder":"a11y","vote":"PROCEED","confidence":0.90,"weight":0.20}
    ],
    "validator_recommendations":["Refactor OAuth config","Add rate limiting"],
    "backlog":["Refactor OAuth config","Rate limiting v2"],
    "nextAction":"launch agents for user-profile phase",
    "audit_trail":"Board decision for compliance"
  }' \
  --ttl 31536000
```

---

## Quality Bars (Enterprise)

### Security
- Threat model complete, all threats mitigated
- Penetration testing simulation
- No hardcoded secrets
- Encryption at rest + in transit
- OAuth/OIDC compliance
- HSM key storage

### Performance
- Load testing (10M+ users)
- Horizontal scaling verified
- Redis latency <5ms p99
- Rate limiting where needed

### Accessibility
- WCAG 2.1 Level AAA
- Screen reader compatibility
- Keyboard navigation
- Color contrast validated

### Testing
- Coverage ≥90%
- Unit + integration + e2e tests
- Load tests under stress

### Documentation
- ADRs complete
- System diagrams (C4, sequence)
- API docs (OpenAPI 3.0)
- Runbooks for operations

---

## Retry Templates

**Loop 0.5 retry** (consensus <0.85): Spawn mediator, negotiate, max 3 rounds

**Loop 3 retry** (confidence <0.75): Replace with specialists, add missing roles, max 15 iterations

**Loop 3 retry** (Board decides PROCEED): If Board votes PROCEED (not DEFER), relaunch Loop 3 with targeted fixes

```bash
# Publish retry event
redis-cli publish "cfn:loop3:retry" '{
  "iteration":4,
  "reason":"Board voted PROCEED - address rate limiting",
  "boardDecision":"PROCEED",
  "targetAgents":["perf-engineer"],
  "blocking_concerns":["rate_limiting_required"]
}'
```

**Loop 4 retry** (disagreement >0.15 unresolved): ESCALATE to human after 3 deliberation rounds

---

## Quick Reference

**Thresholds:**
- Gate: ≥0.75
- Consensus: ≥0.95
- Loop 0.5: ≥0.85
- Loop 4 Board: ≥0.75 weighted
- Coverage: ≥90%

**Board Weights:**
- CTO: 30%
- PO: 30%
- User: 20%
- A11y: 20%

**Memory Keys:**
```
Loop 0.5: cfn/phase-{id}/loop0.5/design (ACL 3, 365d)
Loop 3: cfn/phase-{id}/loop3/agent-{id} (ACL 1, 30d)
Loop 2: cfn/phase-{id}/loop2/consensus (ACL 3, 30d)
Loop 4: cfn/phase-{id}/loop4/decision (ACL 4, 365d)
```

**Redis Channels:**
```
design:debate:{phaseId}            # Loop 0.5 architect debate
cfn:phase:start                    # Phase begins
cfn:phase:complete                 # Phase ends (after Board)
cfn:phase:transition               # Phase → phase
cfn:loop3:agent:lifecycle          # Agent spawn/terminate
cfn:loop3:agent:complete           # Agent confidence
cfn:loop3:gate:result              # Gate pass/fail
cfn:loop2:validator:spawned        # Validator start
cfn:loop2:validator:complete       # Validator result
cfn:loop2:consensus:complete       # Consensus result (always → L4)
cfn:loop4:board:decision           # Board decision
cfn:loop3:retry                    # Retry iteration
```

---

**Enterprise Philosophy:** Highest quality bar. Security, scalability, accessibility, compliance.
