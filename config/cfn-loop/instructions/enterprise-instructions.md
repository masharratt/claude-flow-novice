# CFN Loop Enterprise Mode Instructions

**Quality Bar**: Highest — Enterprise-grade quality, security, scalability, and accessibility

---

## Enterprise Configuration

### Thresholds

- **Gate (Loop 3 Self-Confidence)**: ≥0.75 (each agent)
- **Consensus (Loop 2 Validation)**: ≥0.95 (highest quality bar)
- **Loop 0.5 Design Consensus**: ≥0.85 (architect team)
- **Loop 4 Board Weighted Vote**: ≥0.75 (multi-stakeholder)
- **Max Loop 2 Iterations**: 15 per phase
- **Max Loop 3 Iterations**: 15 per subtask

### Team Composition

- **Loop 0.5 Architects**: 3 specialists (system-architect, security-architect, api-designer)
- **Loop 3 Implementers**: Up to 7 in mesh; coordinators for 8+ (max 50 under coordinator)
- **Loop 2 Validators**: 4 specialists (code-quality, security, performance, testing)
- **Loop 4 Board**: 4-person multi-stakeholder board (CTO 30%, PO 30%, Power User 20%, Accessibility Advocate 20%)

### Quality Standards

- **Security**: Threat modeling, vulnerability scanning, penetration testing simulation
- **Performance**: Load testing, scalability analysis, resource optimization
- **Accessibility**: WCAG 2.1 Level AAA compliance validation
- **Documentation**: Comprehensive ADRs, API specs, system diagrams, runbooks
- **Testing**: 90%+ coverage, integration tests, end-to-end scenarios
- **Compliance**: Audit trails, data residency, regulatory requirements

---

## CFN Loop Flow (Enterprise)

### Loop 0: Epic Orchestration

**Purpose**: Multi-sprint epic planning and execution coordination

**Characteristics**:
- No iteration limit (runs until epic completes)
- Coordinates multiple Loop 1 phase executions
- Tracks epic-level metrics and dependencies

**Swarm Initialization** (Once per Epic):
```bash
# Initialize persistent swarm for epic
executeSwarm({
  swarmId: "epic-e-commerce-platform",
  objective: "Epic: E-commerce Platform v1.0",
  strategy: "development",
  mode: "mesh",
  persistence: true
})
```

**Redis State Management**:
```bash
# Store epic state
redis-cli setex "cfn:epic:e-commerce:state" 86400 '{
  "sprints": ["user-management", "product-catalog", "checkout"],
  "current_sprint": "user-management",
  "epic_confidence": 0.0,
  "status": "in_progress"
}'
```

**Git Commit** (Epic Complete):
```bash
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Epic - E-commerce Platform v1.0

Epic Summary:
- Sprints: User Management (0.92), Product Catalog (0.91), Checkout (0.94)
- Total Phases: 12
- Epic Confidence: 0.92
- Quality Bar: Enterprise (WCAG AAA, threat-modeled, load-tested)
- Status: Platform launch ready

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Loop 1: Phase Execution (Sequential)

**Purpose**: Execute individual phases within sprint (auth → profile → permissions)

**Characteristics**:
- No iteration limit (runs until all phases in sprint complete)
- Sequential phase execution with dependencies
- Auto-transitions to next phase when current completes

**Phase Transition**:
```bash
# Publish phase transition event
/eventbus publish --type cfn.loop.phase.start --data '{
  "loop": 1,
  "phase": "authentication",
  "sprint": "user-management",
  "swarmId": "epic-e-commerce-platform"
}' --priority 9

# Store phase state
redis-cli setex "cfn:phase:auth:state" 3600 '{
  "phase": "authentication",
  "status": "in_progress",
  "loop": 1,
  "next_phase": "profile-management"
}'
```

**Swarm Coordination** (Phase-level):
```bash
# Re-use epic swarm for phase execution (DO NOT re-init)
# Swarm persists through all phases in epic

# Check swarm health
redis-cli get "swarm:epic-e-commerce-platform"
```

---

### Loop 0.5: Planning Consensus (Enterprise-Only, CRITICAL)

**Purpose**: Architect team debates and votes on design BEFORE Loop 3 implementation

**Why Critical**: Prevents costly rework by achieving design consensus upfront. Enterprise mode requires architectural alignment before any code is written.

#### Spawn Process (Single Message)

```bash
# Spawn 3 architects in single message
Task: Spawn architect team for Loop 0.5 design consensus

Agents:
1. system-architect-persona (.claude/agents/planning-team/system-architect.yaml)
   - Instruction: "Design system architecture for authentication phase. Focus on scalability (10M+ users), microservices boundaries, data consistency patterns. Publish design proposal to redis://design:debate:auth within 5 minutes. Vote on final design."

2. security-architect-persona (.claude/agents/planning-team/security-architect.yaml)
   - Instruction: "Review authentication design for security threats. Focus on OAuth 2.0/OIDC compliance, token security, session management, threat modeling. Challenge insecure patterns on redis://design:debate:auth. Vote on final design."

3. api-designer-persona (.claude/agents/planning-team/api-designer.yaml)
   - Instruction: "Design RESTful API contracts for authentication. Focus on API versioning, backward compatibility, OpenAPI 3.0 spec, rate limiting. Propose API design on redis://design:debate:auth. Vote on final design."

All agents:
- Subscribe to: redis://design:debate:auth
- Debate duration: 10-15 minutes
- Voting threshold: ≥0.85 consensus (weighted equally 33.3% each)
- Output: ADR documents, system diagrams, API specs
- Store results: SQLite key "cfn/phase-auth/loop0.5/design" (ACL Level 3, 365-day TTL)
```

#### Design Debate Process

**Redis Pub/Sub Channel**: `design:debate:{phaseId}`

**Message Types**:
```typescript
// Proposal
{
  type: "proposal",
  agent: "system-architect-persona",
  timestamp: "2025-10-11T10:00:00Z",
  design: {
    component: "authentication-service",
    pattern: "microservices",
    rationale: "Supports 10M+ concurrent users with horizontal scaling",
    tradeoffs: "Increased latency vs monolith, eventual consistency"
  }
}

// Challenge
{
  type: "challenge",
  agent: "security-architect-persona",
  timestamp: "2025-10-11T10:05:00Z",
  target_proposal: "auth-service-v1",
  concern: "Token storage in Redis lacks encryption at rest",
  severity: "high",
  recommendation: "Use encrypted Redis with key rotation every 30 days"
}

// Refinement
{
  type: "refinement",
  agent: "system-architect-persona",
  timestamp: "2025-10-11T10:08:00Z",
  original_proposal: "auth-service-v1",
  changes: "Added encrypted Redis with AWS KMS integration",
  addresses_concerns: ["security-001"]
}

// Vote Request
{
  type: "vote_request",
  agent: "api-designer-persona",
  timestamp: "2025-10-11T10:12:00Z",
  final_design: "auth-service-v2",
  vote_deadline: "2025-10-11T10:15:00Z"
}
```

**Debate Timeline** (10-15 minutes):
- Minutes 0-5: Initial proposals published
- Minutes 5-10: Challenges and debate
- Minutes 10-12: Refinements based on feedback
- Minutes 12-15: Voting window

#### Voting Process

**Vote Structure**:
```typescript
{
  agent: "system-architect-persona",
  vote: "approve",  // approve | concerns | reject
  confidence: 0.90,
  weight: 0.333,  // 33.3% (equal weights)
  reasoning: "Design meets scalability requirements, security concerns addressed",
  conditions: []  // Optional: "Approve if X is added"
}
```

**Consensus Calculation**:
```typescript
// Weighted average of confidence scores
const consensus = (
  architect1.confidence * 0.333 +
  architect2.confidence * 0.333 +
  architect3.confidence * 0.333
);

// Threshold: ≥0.85 to proceed
if (consensus >= 0.85) {
  // Proceed to Loop 3 with approved design
} else {
  // Spawn mediator agent for negotiation
}
```

**Example Calculation**:
```
System Architect: approve (0.90) × 0.333 = 0.300
Security Architect: approve (0.85) × 0.333 = 0.283
API Designer: concerns (0.80) × 0.333 = 0.266
---------------------------------------------
Consensus: 0.849 ❌ (below 0.85 threshold)

Action: Spawn mediator agent to resolve API Designer concerns
```

#### Output Storage

**SQLite Memory** (ACL Level 3: Swarm-wide, 1-year retention):
```bash
# Store design specification
/sqlite-memory store \
  --key "cfn/phase-auth/loop0.5/design" \
  --level swarm \
  --data '{
    "consensus": 0.88,
    "design": {
      "architecture": "microservices",
      "components": ["auth-service", "token-service", "session-manager"],
      "security": "OAuth 2.0 + OIDC, encrypted Redis, HSM for keys",
      "scalability": "Horizontal scaling, 10M+ users, 99.99% SLA",
      "api_version": "v1.0.0"
    },
    "adrs": ["ADR-001-microservices.md", "ADR-002-oauth2.md"],
    "diagrams": ["system-context.svg", "component-diagram.svg"],
    "votes": [
      {"agent": "system-architect", "confidence": 0.90},
      {"agent": "security-architect", "confidence": 0.88},
      {"agent": "api-designer", "confidence": 0.85}
    ]
  }' \
  --ttl 31536000  # 365 days
```

**Redis Event**:
```bash
/eventbus publish --type cfn.loop.design.approved --data '{
  "loop": "0.5",
  "phase": "authentication",
  "consensus": 0.88,
  "design_key": "cfn/phase-auth/loop0.5/design"
}' --priority 9
```

#### Mediator Agent (If Consensus <0.85)

**Spawn Mediator**:
```bash
Task: Spawn design mediator for consensus negotiation

Agent: design-mediator-persona (.claude/agents/planning-team/mediator.yaml)
Instruction: "Analyze design debate for authentication phase. Consensus 0.849 below threshold 0.85. API Designer concerns: backward compatibility for v1 → v2 migration. Facilitate negotiation between architects. Propose compromise: versioned API with 6-month deprecation window. Target consensus ≥0.85. Publish resolution to redis://design:debate:auth"

Input: Read SQLite key "cfn/phase-auth/loop0.5/debate-history"
Output: Update SQLite key "cfn/phase-auth/loop0.5/design" with negotiated design
Max Rounds: 3 negotiation attempts
```

#### Git Commit (Loop 0.5 Complete)

```bash
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Loop 0.5 - Authentication Design Consensus

Loop 0.5 Planning Results:
- Consensus: 0.88 (target: ≥0.85) ✅
- Architects: system-architect, security-architect, api-designer
- Design: Microservices architecture with OAuth 2.0 + OIDC
- Security: Encrypted Redis, HSM key storage, threat model complete
- Scalability: Horizontal scaling for 10M+ users
- Documentation: ADR-001, ADR-002, system diagrams generated

Ready for Loop 3 implementation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Loop 3: Primary Swarm Implementation

**Purpose**: Implement features following Loop 0.5 approved design

**Characteristics**:
- Max 15 iterations per subtask
- Gate: All agents ≥0.75 confidence
- Must follow Loop 0.5 design spec (stored in SQLite)

#### Spawn Process (Single Message)

**Step 1**: Read Loop 0.5 design from SQLite:
```bash
# Retrieve approved design specification
/sqlite-memory retrieve --key "cfn/phase-auth/loop0.5/design" --level swarm
```

**Step 2**: Spawn implementers with design constraints:
```bash
Task: Spawn implementers for Loop 3 authentication phase

Design Spec: Read from SQLite key "cfn/phase-auth/loop0.5/design"
Constraints:
- MUST follow microservices architecture (ADR-001)
- MUST implement OAuth 2.0 + OIDC (ADR-002)
- MUST use encrypted Redis with HSM key storage
- MUST achieve 90%+ test coverage
- MUST pass security threat model validation

Agents (Mesh Topology, max 7):
1. coder-persona-backend-1 (.claude/agents/implementation-team/coder.yaml)
   - Instruction: "Implement auth-service microservice per ADR-001. OAuth 2.0 token issuance, Redis session storage with encryption. Follow API spec v1.0.0. Store progress in SQLite key 'cfn/phase-auth/loop3/agent-1' with confidence ≥0.75. Coordinate via redis://swarm:coordination:auth"

2. coder-persona-backend-2 (.claude/agents/implementation-team/coder.yaml)
   - Instruction: "Implement token-service microservice per design spec. JWT signing with HSM-backed keys, token refresh logic, expiration handling. Store progress in SQLite key 'cfn/phase-auth/loop3/agent-2' with confidence ≥0.75. Coordinate via redis://swarm:coordination:auth"

3. security-specialist (.claude/agents/quality-team/security-specialist.yaml)
   - Instruction: "Validate security implementation against threat model. OAuth 2.0 flow security, token storage encryption, session fixation prevention. Provide confidence score ≥0.75. Store results in SQLite key 'cfn/phase-auth/loop3/agent-3'"

4. tester (.claude/agents/quality-team/tester.yaml)
   - Instruction: "Write integration tests for auth-service + token-service. Cover OAuth flows, token refresh, error cases. Achieve 90%+ coverage per enterprise standards. Store confidence in SQLite key 'cfn/phase-auth/loop3/agent-4'"

All agents:
- Read design: SQLite key "cfn/phase-auth/loop0.5/design"
- Coordinate: redis://swarm:coordination:auth (pub/sub mandatory)
- Post-edit hook: MANDATORY after every file edit
- Self-validate: Confidence ≥0.75 or report blockers
```

**Hierarchical Topology** (if >7 agents needed):
```bash
# Coordinator + teams for complex phases (up to 50 agents)

Coordinator: swarm-coordinator-persona
Teams under coordinator:
- Backend Team (7 agents): auth-service, token-service, session-manager
- Security Team (3 agents): threat-model, penetration-test, compliance
- Testing Team (5 agents): unit, integration, e2e, load, accessibility

Total: 1 coordinator + 15 agents = 16 total
```

#### Redis Coordination (Mandatory)

**Agent Spawn Event**:
```bash
/eventbus publish --type agent.lifecycle --data '{
  "agent": "coder-backend-1",
  "status": "spawned",
  "loop": 3,
  "phase": "authentication",
  "role": "backend-implementer"
}' --priority 8
```

**Progress Updates**:
```bash
# Agent publishes progress every 5 minutes
redis-cli publish "swarm:coordination:auth" '{
  "agent": "coder-backend-1",
  "status": "in_progress",
  "progress": 0.60,
  "files": ["src/auth-service.ts", "src/middleware/oauth.ts"],
  "blockers": []
}'
```

**Completion Event**:
```bash
/eventbus publish --type agent.complete --data '{
  "agent": "coder-backend-1",
  "confidence": 0.85,
  "loop": 3,
  "files": ["src/auth-service.ts", "src/auth-service.test.ts"],
  "coverage": 0.92
}' --priority 8
```

#### SQLite Memory Storage (ACL Level 1: Private)

```bash
# Each agent stores private implementation results
/sqlite-memory store \
  --key "cfn/phase-auth/loop3/agent-backend-1" \
  --level private \
  --data '{
    "confidence": 0.85,
    "files": ["src/auth-service.ts", "src/middleware/oauth.ts"],
    "reasoning": "OAuth 2.0 implementation complete, tests passing, follows ADR-001/002",
    "blockers": [],
    "coverage": 0.92,
    "security_checks": "passed"
  }' \
  --ttl 2592000  # 30 days
```

#### Gate Check (All Agents ≥0.75)

```bash
# Coordinator checks all agent confidence scores
redis-cli keys "memory:cfn/phase-auth/loop3/agent-*"

# Calculate average (all must be ≥0.75 individually)
Agent 1: 0.85 ✅
Agent 2: 0.82 ✅
Agent 3: 0.78 ✅
Agent 4: 0.80 ✅

Gate: PASS (all ≥0.75) → Proceed to Loop 2
```

#### Git Commit (Loop 3 Complete)

```bash
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Loop 3 - Authentication Implementation

Loop 3 Implementation Results:
- Confidence: 0.81 average (target: ≥0.75) ✅
- Agents: coder-backend-1 (0.85), coder-backend-2 (0.82), security-specialist (0.78), tester (0.80)
- Files: auth-service.ts, token-service.ts, oauth-middleware.ts, tests (92% coverage)
- Design Compliance: Follows ADR-001 (microservices), ADR-002 (OAuth 2.0)
- Security: Threat model validated, encryption confirmed
- Performance: Load tested for 10M+ users

Ready for Loop 2 validation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Loop 2: Consensus Validation (Enterprise 4-Validator Team)

**Purpose**: Comprehensive quality validation by 4 specialists

**Characteristics**:
- Max 15 iterations per phase
- Consensus threshold: ≥0.95 (enterprise quality bar)
- 4 validators: code-quality, security, performance, testing

#### Spawn Process (Single Message)

```bash
Task: Spawn 4-validator team for Loop 2 consensus validation

Context:
- Loop 3 average confidence: 0.81
- Files: auth-service.ts, token-service.ts, tests
- Design spec: SQLite key "cfn/phase-auth/loop0.5/design"
- Implementation: SQLite keys "cfn/phase-auth/loop3/agent-*"

Validators:
1. code-quality-validator (.claude/agents/validation-team/code-quality.yaml)
   - Instruction: "Review code quality for authentication phase. Check SOLID principles, design patterns, TypeScript best practices, maintainability. Validate compliance with Loop 0.5 design (ADR-001/002). Confidence ≥0.90. Store results in SQLite key 'cfn/phase-auth/loop2/validator-quality'"
   - Weight: 25%

2. security-specialist (.claude/agents/validation-team/security.yaml)
   - Instruction: "Conduct security audit. OAuth 2.0 implementation review, token security, encryption validation, threat model verification, penetration test simulation. Confidence ≥0.90. Store results in SQLite key 'cfn/phase-auth/loop2/validator-security'"
   - Weight: 25%

3. perf-analyzer (.claude/agents/validation-team/performance.yaml)
   - Instruction: "Performance validation for 10M+ users. Load testing simulation, Redis latency analysis, horizontal scaling verification, resource optimization. Confidence ≥0.90. Store results in SQLite key 'cfn/phase-auth/loop2/validator-perf'"
   - Weight: 25%

4. tester (.claude/agents/validation-team/tester.yaml)
   - Instruction: "Test coverage validation. Verify 90%+ coverage, integration tests for OAuth flows, edge cases, error handling. Confidence ≥0.90. Store results in SQLite key 'cfn/phase-auth/loop2/validator-test'"
   - Weight: 25%

All validators:
- Read design: SQLite key "cfn/phase-auth/loop0.5/design"
- Read implementation: SQLite keys "cfn/phase-auth/loop3/agent-*"
- Consensus target: ≥0.95 (weighted average)
- Coordinate: redis://swarm:validation:auth
```

#### Validation Process

**Code Quality Validator Output**:
```json
{
  "validator": "code-quality-validator",
  "confidence": 0.92,
  "findings": {
    "strengths": [
      "SOLID principles followed",
      "Dependency injection implemented correctly",
      "TypeScript types comprehensive"
    ],
    "issues": [
      {
        "severity": "low",
        "description": "auth-service.ts line 45: Consider extracting OAuth config to separate module",
        "recommendation": "Refactor for better separation of concerns"
      }
    ],
    "design_compliance": "Full compliance with ADR-001 and ADR-002"
  }
}
```

**Security Validator Output**:
```json
{
  "validator": "security-specialist",
  "confidence": 0.95,
  "findings": {
    "strengths": [
      "OAuth 2.0 implementation secure",
      "Encrypted Redis with HSM key storage",
      "No hardcoded credentials",
      "CSRF protection implemented"
    ],
    "issues": [],
    "threat_model": "All threats mitigated per design spec"
  }
}
```

**Performance Validator Output**:
```json
{
  "validator": "perf-analyzer",
  "confidence": 0.94,
  "findings": {
    "strengths": [
      "Horizontal scaling verified (10M+ users)",
      "Redis latency <5ms at p99",
      "Resource usage optimized"
    ],
    "issues": [
      {
        "severity": "medium",
        "description": "Token refresh endpoint could benefit from rate limiting",
        "recommendation": "Add rate limiting: 10 req/min per user"
      }
    ]
  }
}
```

**Testing Validator Output**:
```json
{
  "validator": "tester",
  "confidence": 0.96,
  "findings": {
    "coverage": 0.92,
    "strengths": [
      "Integration tests comprehensive",
      "OAuth flow edge cases covered",
      "Error handling tested"
    ],
    "issues": []
  }
}
```

#### Consensus Calculation

```typescript
// Weighted average (equal weights in enterprise: 25% each)
const consensus = (
  0.92 * 0.25 +  // code-quality
  0.95 * 0.25 +  // security
  0.94 * 0.25 +  // performance
  0.96 * 0.25    // testing
) = 0.9425

// Threshold: ≥0.95
if (consensus >= 0.95) {
  // PASS → Proceed to Loop 4
} else {
  // FAIL → Refer recommendations to Product Owner Board
  // Max iterations: 15 (current: 1)
}
```

**Result**: 0.9425 < 0.95 ❌ (Below threshold by 0.0075)

**Action**: Refer recommendations to Product Owner Board for decision:
- Low-priority refactor (code quality)
- Medium-priority rate limiting (performance)

#### SQLite Memory Storage (ACL Level 3: Swarm)

```bash
# Store validation results
/sqlite-memory store \
  --key "cfn/phase-auth/loop2/consensus" \
  --level swarm \
  --data '{
    "consensus": 0.9425,
    "threshold": 0.95,
    "validators": [
      {"validator": "code-quality", "confidence": 0.92},
      {"validator": "security", "confidence": 0.95},
      {"validator": "performance", "confidence": 0.94},
      {"validator": "tester", "confidence": 0.96}
    ],
    "recommendations": [
      {"severity": "low", "description": "Refactor OAuth config extraction"},
      {"severity": "medium", "description": "Add rate limiting to token refresh"}
    ],
    "status": "pending_board_decision"
  }' \
  --ttl 2592000
```

#### Git Commit (Loop 2 Complete)

```bash
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Loop 2 - Validation Phase

Loop 2 Validation Results:
- Consensus: 0.9425 (target: ≥0.95) ⚠️
- Validators: code-quality (0.92), security (0.95), performance (0.94), tester (0.96)
- Issues: 2 recommendations (1 low, 1 medium severity)
- Recommendations:
  1. [LOW] Refactor OAuth config to separate module
  2. [MEDIUM] Add rate limiting to token refresh endpoint (10 req/min)

Referred to Loop 4 Product Owner Board for decision

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Loop 4: Multi-Stakeholder Product Owner Board (Enterprise-Only, CRITICAL)

**Purpose**: 4-person weighted voting board makes PROCEED/DEFER/ESCALATE decision

**Why Critical**: Enterprise decisions require multi-stakeholder alignment. Replaces single product owner with board representing technical leadership (CTO), product vision (PO), user needs (Power User), and accessibility compliance (Advocate).

#### Board Composition

| Stakeholder | Weight | Persona File | Primary Concerns |
|------------|--------|--------------|------------------|
| CTO | 30% | `.claude/agents/product-owner-team/cto-agent.yaml` | Technical debt, scalability, security, cost |
| Product Owner | 30% | `.claude/agents/product-owner-team/product-owner-agent.yaml` | Feature completeness, time-to-market, user value |
| Power User | 20% | `.claude/agents/product-owner-team/power-user-persona.yaml` | UX, performance, reliability, workflows |
| Accessibility Advocate | 20% | `.claude/agents/product-owner-team/accessibility-advocate-persona.yaml` | WCAG compliance, screen reader support, keyboard nav |

#### Spawn Process (Single Message)

```bash
Task: Spawn 4-person Product Owner Board for Loop 4 decision

Context:
- Loop 2 consensus: 0.9425 (below 0.95 by 0.0075)
- Recommendations:
  1. [LOW] Refactor OAuth config to separate module
  2. [MEDIUM] Add rate limiting to token refresh endpoint (10 req/min)
- Phase: Authentication system
- Design: SQLite key "cfn/phase-auth/loop0.5/design"
- Implementation: SQLite keys "cfn/phase-auth/loop3/agent-*"
- Validation: SQLite key "cfn/phase-auth/loop2/consensus"

Board Members:
1. cto-agent (.claude/agents/product-owner-team/cto-agent.yaml)
   - Weight: 30%
   - Instruction: "Review authentication phase from technical leadership perspective. Consensus 0.9425 vs 0.95 target. Evaluate if 0.0075 gap justifies delay. Consider: rate limiting priority (security vs time-to-market), refactor necessity (tech debt vs shipping). Vote PROCEED/DEFER/ESCALATE. Store vote in SQLite key 'cfn/phase-auth/loop4/vote-cto'"

2. product-owner-agent (.claude/agents/product-owner-team/product-owner-agent.yaml)
   - Weight: 30%
   - Instruction: "Review from product perspective. Authentication phase 92% coverage, OAuth 2.0 secure, passes all security checks. Recommendations are enhancements, not blockers. Evaluate time-to-market vs perfection. Vote PROCEED (defer enhancements) or block for rate limiting. Store vote in SQLite key 'cfn/phase-auth/loop4/vote-po'"

3. power-user-persona (.claude/agents/product-owner-team/power-user-persona.yaml)
   - Weight: 20%
   - Instruction: "Review from power user perspective. Rate limiting recommendation affects user experience (10 req/min on token refresh). Evaluate if reasonable or too restrictive. OAuth flows tested, performance validated. Vote on user impact. Store vote in SQLite key 'cfn/phase-auth/loop4/vote-user'"

4. accessibility-advocate-persona (.claude/agents/product-owner-team/accessibility-advocate-persona.yaml)
   - Weight: 20%
   - Instruction: "Review accessibility compliance. Check WCAG 2.1 Level AAA validation, screen reader support, keyboard navigation. Recommendations don't affect accessibility. Vote on compliance. Store vote in SQLite key 'cfn/phase-auth/loop4/vote-a11y'"

All board members:
- Read all loop memory: SQLite keys "cfn/phase-auth/*"
- Coordinate: redis://board:deliberation:auth (if disagreement >0.15)
- Vote options: PROCEED | DEFER | ESCALATE
- Decision threshold: ≥0.75 weighted consensus
```

#### Voting Process

**Vote Structure**:
```typescript
{
  stakeholder: "cto-agent",
  vote: "DEFER",  // PROCEED | DEFER | ESCALATE
  confidence: 0.80,
  weight: 0.30,
  reasoning: "Rate limiting is security-critical. Defer phase for 2 hours to add rate limiting. Refactor can be backlog.",
  conditions: {
    required: ["Add rate limiting: 10 req/min per user"],
    optional: ["Refactor OAuth config (backlog)"]
  }
}
```

**Individual Votes**:
```json
{
  "cto_vote": {
    "stakeholder": "cto-agent",
    "vote": "DEFER",
    "confidence": 0.80,
    "reasoning": "Rate limiting is security-critical for production. 2-hour fix justifies delay."
  },
  "po_vote": {
    "stakeholder": "product-owner-agent",
    "vote": "PROCEED",
    "confidence": 0.85,
    "reasoning": "Authentication is production-ready. Rate limiting can be hotfix post-launch if needed."
  },
  "user_vote": {
    "stakeholder": "power-user-persona",
    "vote": "DEFER",
    "confidence": 0.75,
    "reasoning": "10 req/min is reasonable for token refresh. Prevents abuse, doesn't hurt UX."
  },
  "a11y_vote": {
    "stakeholder": "accessibility-advocate-persona",
    "vote": "PROCEED",
    "confidence": 0.90,
    "reasoning": "Full WCAG AAA compliance. Rate limiting doesn't affect accessibility."
  }
}
```

#### Weighted Vote Calculation

```typescript
// Vote mapping: PROCEED = 1.0, DEFER = 0.5, ESCALATE = 0.0
const voteValues = {
  "PROCEED": 1.0,
  "DEFER": 0.5,
  "ESCALATE": 0.0
};

// Calculate weighted score
const weightedScore = (
  voteValues["DEFER"] * 0.30 * 0.80 +  // CTO: DEFER (0.5) × 30% × confidence 0.80
  voteValues["PROCEED"] * 0.30 * 0.85 +  // PO: PROCEED (1.0) × 30% × confidence 0.85
  voteValues["DEFER"] * 0.20 * 0.75 +  // User: DEFER (0.5) × 20% × confidence 0.75
  voteValues["PROCEED"] * 0.20 * 0.90   // A11y: PROCEED (1.0) × 20% × confidence 0.90
);

// Calculation:
= (0.5 × 0.30 × 0.80) + (1.0 × 0.30 × 0.85) + (0.5 × 0.20 × 0.75) + (1.0 × 0.20 × 0.90)
= 0.120 + 0.255 + 0.075 + 0.180
= 0.630

// Decision threshold: ≥0.75
if (weightedScore >= 0.75) {
  decision = "PROCEED";
} else if (weightedScore >= 0.40) {
  decision = "DEFER";  // ✅ 0.630 falls in DEFER range
} else {
  decision = "ESCALATE";
}
```

**Result**: 0.630 → **DEFER** (Add rate limiting, defer refactor to backlog)

#### Disagreement Handling (Deliberation)

**Trigger**: Disagreement >0.15 between any two stakeholders

```typescript
// Check pairwise disagreement
const disagreements = [
  Math.abs(cto_vote.confidence - po_vote.confidence),  // 0.80 vs 0.85 = 0.05
  Math.abs(cto_vote.confidence - user_vote.confidence),  // 0.80 vs 0.75 = 0.05
  // ... all pairs
];

const maxDisagreement = Math.max(...disagreements);

if (maxDisagreement > 0.15) {
  // Spawn facilitator agent for deliberation
}
```

**In this case**: Max disagreement 0.15 (exactly at threshold) → **Optional deliberation**

**Facilitator Spawn** (if triggered):
```bash
Task: Spawn board facilitator for deliberation

Agent: board-facilitator-persona (.claude/agents/product-owner-team/facilitator.yaml)
Instruction: "Facilitate deliberation for authentication phase board decision. Disagreement: CTO (DEFER, 0.80) vs PO (PROCEED, 0.85). Issue: Rate limiting priority (security vs time-to-market). Facilitate negotiation: Can rate limiting be added as hotfix post-launch? Or is pre-launch critical? Max 3 rounds. Target agreement >0.85. Publish resolution to redis://board:deliberation:auth"

Max Rounds: 3 negotiation attempts
Output: Updated votes with consensus path
```

**Deliberation Timeline** (15-20 minutes per round):
- Round 1: CTO argues security risk, PO argues time-to-market pressure
- Round 2: Facilitator proposes compromise: Add rate limiting in 2-hour sprint, defer refactor
- Round 3: Board re-votes with new context

#### Final Decision Output

```json
{
  "decision": "DEFER",
  "weighted_score": 0.630,
  "action": "Relaunch Loop 3 with targeted fixes",
  "required_changes": [
    "Add rate limiting to token refresh endpoint (10 req/min per user)"
  ],
  "deferred_to_backlog": [
    "Refactor OAuth config to separate module (low priority)"
  ],
  "dissenting_opinions": [
    {
      "stakeholder": "product-owner-agent",
      "vote": "PROCEED",
      "reasoning": "Believes rate limiting can be hotfix post-launch"
    },
    {
      "stakeholder": "accessibility-advocate-persona",
      "vote": "PROCEED",
      "reasoning": "No accessibility impact, supports shipping"
    }
  ],
  "next_steps": "Relaunch Loop 3 with 1 agent (perf-engineer) to add rate limiting. Estimated 2 hours.",
  "confidence": 0.630
}
```

#### SQLite Memory Storage (ACL Level 4: Project)

```bash
# Store board decision for compliance audit trail
/sqlite-memory store \
  --key "cfn/phase-auth/loop4/decision" \
  --level project \
  --data '{
    "decision": "DEFER",
    "weighted_score": 0.630,
    "votes": [
      {"stakeholder": "cto", "vote": "DEFER", "confidence": 0.80, "weight": 0.30},
      {"stakeholder": "po", "vote": "PROCEED", "confidence": 0.85, "weight": 0.30},
      {"stakeholder": "user", "vote": "DEFER", "confidence": 0.75, "weight": 0.20},
      {"stakeholder": "a11y", "vote": "PROCEED", "confidence": 0.90, "weight": 0.20}
    ],
    "required_changes": ["Add rate limiting: 10 req/min"],
    "backlog": ["Refactor OAuth config"],
    "dissenting_opinions": ["PO: PROCEED", "A11y: PROCEED"],
    "audit_trail": "Board decision logged for compliance",
    "timestamp": "2025-10-11T11:00:00Z"
  }' \
  --ttl 31536000  # 365 days (compliance retention)
```

#### Redis Event

```bash
/eventbus publish --type cfn.loop.decision --data '{
  "loop": 4,
  "phase": "authentication",
  "decision": "DEFER",
  "action": "relaunch_loop3",
  "changes_required": ["rate-limiting"],
  "estimated_duration": "2h"
}' --priority 9
```

#### Git Commit (Loop 4 Complete)

```bash
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Loop 4 - Product Owner Board Decision

Loop 4 Board Decision: DEFER ✅
- Weighted Score: 0.630 (DEFER range: 0.40-0.75)
- Board Votes:
  - CTO (30%): DEFER (0.80) - Security priority
  - Product Owner (30%): PROCEED (0.85) - Time-to-market
  - Power User (20%): DEFER (0.75) - UX impact acceptable
  - Accessibility Advocate (20%): PROCEED (0.90) - No compliance impact

Decision: Relaunch Loop 3 with targeted fix
- Required: Add rate limiting (10 req/min) - 2 hour estimate
- Backlog: Refactor OAuth config (low priority)
- Dissenting: PO and A11y voted PROCEED (documented)

Next: Spawn perf-engineer for rate limiting implementation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Retry Templates (Enterprise)

### Loop 0.5 Retry (Design Consensus <0.85)

**Scenario**: Architects disagree on design approach

**Action**:
1. Spawn mediator agent for negotiation (max 3 rounds)
2. Facilitator analyzes debate history from SQLite
3. Proposes compromise design addressing all concerns
4. Board re-votes on compromise
5. If still <0.85 after 3 rounds → ESCALATE to human architect

**Example**:
```bash
# Mediator spawn
Task: Spawn design mediator for Loop 0.5 consensus failure

Agent: design-mediator-persona
Instruction: "Consensus 0.82 below 0.85 threshold. Disagreement: System architect wants monolith (0.85), Security architect wants microservices (0.90), API designer neutral (0.70). Facilitate negotiation. Propose modular monolith as compromise. Target ≥0.85 consensus. Max 3 rounds."
```

### Loop 3 Retry (Low Confidence or Failed Gate)

**Scenario**: One or more agents report confidence <0.75

**Action**:
1. Identify failing agents and root causes from SQLite
2. Replace failing agents with specialists (e.g., add security-specialist if auth fails)
3. Add missing roles (performance-engineer if scalability concerns)
4. Relaunch with targeted instructions referencing Loop 0.5 design

**Example**:
```bash
# Failed agent: coder-backend-1 (0.68 confidence)
# Reason: OAuth 2.0 implementation incomplete

# Retry spawn
Task: Relaunch Loop 3 with specialist replacement

Replace: coder-backend-1 (confidence 0.68, OAuth incomplete)
With: oauth-specialist-persona (.claude/agents/specialists/oauth.yaml)
Instruction: "Complete OAuth 2.0 implementation per ADR-002. Fix issues from previous attempt: token signature validation, refresh flow, PKCE support. Read failed attempt from SQLite key 'cfn/phase-auth/loop3/agent-backend-1'. Target confidence ≥0.75."

Add: security-specialist (missing from first attempt)
Instruction: "Validate OAuth 2.0 security from start. Prevent previous issues. Threat model review, token storage audit."
```

### Loop 2 Retry (Consensus <0.95)

**Scenario**: Validators identify issues preventing ≥0.95 consensus

**Action**:
1. Parse validator recommendations from SQLite
2. Refer to Product Owner Board for prioritization
3. If Board votes DEFER: Relaunch Loop 3 with targeted fixes
4. If Board votes PROCEED: Accept current quality, backlog issues

**Example** (from Loop 4 DEFER decision):
```bash
# Board voted DEFER for rate limiting fix

# Relaunch Loop 3 (targeted)
Task: Relaunch Loop 3 for rate limiting fix

Agent: perf-engineer-persona (.claude/agents/specialists/performance.yaml)
Instruction: "Add rate limiting to token refresh endpoint per Loop 4 board decision. Implement: 10 req/min per user, Redis-backed rate limiter, return 429 Too Many Requests. Target confidence ≥0.75. Estimated 2 hours."

No full team spawn - single targeted fix
```

### Loop 4 Retry (Board Disagreement >0.15 Unresolved)

**Scenario**: Board cannot reach consensus after 3 deliberation rounds

**Action**:
1. ESCALATE decision to human product leadership
2. Document all votes, reasoning, dissenting opinions in SQLite
3. Provide summary report for human decision-maker
4. Pause phase until human input received

**Example**:
```bash
# Board deadlock after 3 rounds
# CTO: DEFER (0.80), PO: PROCEED (0.85), User: ESCALATE (0.60), A11y: PROCEED (0.90)
# Disagreement: 0.30 (CTO vs A11y)

# Escalation report
Task: Generate escalation report for human review

Report Contents:
- Phase: Authentication system
- Issue: Board cannot agree on rate limiting priority
- Votes: CTO DEFER, PO PROCEED, User ESCALATE, A11y PROCEED
- Core Disagreement: Security-first (CTO) vs time-to-market (PO)
- Recommendation: Human product leadership decision required
- Impact: 2-hour delay if DEFER, security risk if PROCEED
- Stored: SQLite key "cfn/phase-auth/loop4/escalation"
```

---

## Enterprise Quality Checklist

Before marking any phase complete, validate:

### Security (Enterprise)
- [ ] Threat model completed and all threats mitigated
- [ ] Penetration testing simulation passed
- [ ] No hardcoded secrets or credentials
- [ ] Encryption at rest and in transit verified
- [ ] OAuth/OIDC compliance validated
- [ ] HSM key storage for sensitive operations
- [ ] CSRF, XSS, SQL injection prevention confirmed

### Performance (Enterprise)
- [ ] Load testing for 10M+ users completed
- [ ] Horizontal scaling verified
- [ ] Redis latency <5ms at p99
- [ ] Resource optimization (CPU, memory, network)
- [ ] Rate limiting implemented where needed
- [ ] Caching strategy validated

### Accessibility (Enterprise)
- [ ] WCAG 2.1 Level AAA compliance
- [ ] Screen reader compatibility tested
- [ ] Keyboard navigation functional
- [ ] Color contrast ratios validated
- [ ] Focus management implemented
- [ ] ARIA labels and roles correct

### Testing (Enterprise)
- [ ] Test coverage ≥90%
- [ ] Unit tests for all business logic
- [ ] Integration tests for service boundaries
- [ ] End-to-end tests for critical flows
- [ ] Error case coverage comprehensive
- [ ] Load tests under stress conditions

### Documentation (Enterprise)
- [ ] ADRs (Architecture Decision Records) complete
- [ ] System diagrams generated (C4, sequence, deployment)
- [ ] API documentation (OpenAPI 3.0 spec)
- [ ] Runbooks for operations team
- [ ] Threat model documentation
- [ ] Performance benchmarking results

### Compliance (Enterprise)
- [ ] Audit trail logged in SQLite (365-day retention)
- [ ] Data residency requirements met
- [ ] GDPR/CCPA compliance validated
- [ ] Board decision documented with dissenting opinions
- [ ] All loops (0.5, 3, 2, 4) results stored for audit

---

## Swarm Coordination (Enterprise Scale)

### Phase-Level Persistent Swarms

**Initialization** (once per epic):
```bash
executeSwarm({
  swarmId: "epic-e-commerce-platform",
  objective: "Epic: E-commerce Platform v1.0",
  strategy: "development",
  mode: "mesh",
  persistence: true
})
```

**No Re-Initialization** during phase transitions:
- ✅ Swarm persists through all phases in epic
- ✅ Reuse same swarm for auth → profile → permissions
- ❌ DO NOT re-init between loops (0.5, 3, 2, 4)
- ❌ DO NOT re-init between phases within sprint

**When to Re-Init**:
- New epic starts (new business domain)
- Swarm corruption detected (Redis state invalid)
- >24 hours since last activity (TTL expiration)

### Hierarchical Topology (50+ Agents)

**Use Case**: Complex phases requiring specialized teams

**Structure**:
```
Coordinator (1 agent)
├── Backend Team (7 agents)
│   ├── auth-service implementer
│   ├── token-service implementer
│   ├── session-manager implementer
│   └── ... (4 more)
├── Security Team (3 agents)
│   ├── threat-model-specialist
│   ├── penetration-tester
│   └── compliance-validator
├── Testing Team (5 agents)
│   ├── unit-test-engineer
│   ├── integration-test-engineer
│   ├── e2e-test-engineer
│   ├── load-test-engineer
│   └── accessibility-tester
└── Documentation Team (2 agents)
    ├── technical-writer
    └── api-docs-generator

Total: 1 coordinator + 17 agents = 18 total
```

**Coordinator Responsibilities**:
- Distribute work to sub-teams
- Aggregate confidence scores from teams
- Coordinate cross-team dependencies (backend ↔ testing)
- Report overall phase progress to Loop 1

### Redis Mandatory Coordination

**All agent communication MUST use Redis pub/sub** (Critical Rule #19):

```bash
# Team coordination channels
redis-cli publish "swarm:coordination:backend-team" '{"task": "auth-service", "status": "complete"}'
redis-cli publish "swarm:coordination:security-team" '{"task": "threat-model", "status": "in_progress"}'

# Cross-team dependencies
redis-cli publish "swarm:dependency:backend→testing" '{"service": "auth-service", "ready": true}'

# Coordinator aggregation
redis-cli publish "swarm:coordinator:report" '{"team": "backend", "confidence": 0.85}'
```

**Forbidden**: Direct file coordination, shared file locks, polling filesystems

---

## Metrics and Monitoring

### Real-Time Dashboard

```bash
# Enterprise fleet monitoring
/dashboard insights --fleet-id cfn-fleet-enterprise --timeframe phase

# Real-time agent health
/dashboard monitor --fleet-id cfn-fleet-enterprise --alerts cfn-loop

# Performance metrics
/performance analyze --component cfn-loop --timeframe phase
```

### SQLite Audit Trail

```bash
# Query phase results
/sqlite-memory retrieve --key "cfn/phase-*/loop*/decision" --level project

# Compliance audit
/compliance audit --period sprint --format pdf --include-recommendations
```

### Confidence Tracking

```json
{
  "phase": "authentication",
  "loop3_avg_confidence": 0.81,
  "loop2_consensus": 0.9425,
  "loop4_weighted_score": 0.630,
  "final_decision": "DEFER",
  "iterations": {
    "loop3": 1,
    "loop2": 1,
    "loop4": 1
  }
}
```

---

## Summary: Enterprise CFN Loop Flow

1. **Loop 0**: Epic orchestration (multi-sprint)
2. **Loop 1**: Phase execution (sequential phases)
3. **Loop 0.5**: Architect team design consensus (≥0.85, 3 architects)
4. **Loop 3**: Implementation following design (≥0.75 gate, max 15 iterations)
5. **Loop 2**: 4-validator consensus validation (≥0.95, max 15 iterations)
6. **Loop 4**: Multi-stakeholder board decision (≥0.75 weighted, 4-person board)
7. **Git Commit**: After each loop completion with comprehensive metrics
8. **Auto-Transition**: To next phase when complete (no permission prompts)

**Enterprise Differentiators**:
- Loop 0.5 planning consensus (3 architects, design debate, ≥0.85)
- Loop 4 multi-stakeholder board (4 personas, weighted voting, deliberation)
- Higher consensus threshold (0.95 vs 0.90)
- 4 validators (vs 2-3 in standard mode)
- More iterations (15 vs 10)
- Comprehensive quality bar (WCAG AAA, threat modeling, load testing)

**Prioritize**: Enterprise-grade quality, security, scalability, and accessibility over speed.
