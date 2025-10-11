# Design Consensus & Multi-Stakeholder Decision Architecture

**Document Version:** 1.0.0
**Date:** 2025-10-10
**Status:** DESIGN SPECIFICATION
**Epic:** Enhanced CFN Loop with Pre-Build Consensus & Multi-Stakeholder Governance

---

## Executive Summary

### Problem Statement

The current CFN Loop architecture has two critical gaps in mimicking human dev team dynamics:

1. **No Design Negotiation:** Loop 3 implementers receive requirements and immediately code. Real teams debate approaches first ("Should we use JWT or sessions?" "REST or GraphQL?" "Monolith or microservices?")

2. **Single Decision Authority:** Loop 4 has one Product Owner making GOAP decisions. Real organizations have multiple stakeholders with different concerns:
   - **CTO:** Technical feasibility, scalability, security
   - **Product Owner:** Business value, ROI, time-to-market
   - **User Personas:** Usability, accessibility, user experience
   - **Engineering Lead:** Team capacity, technical debt, maintenance burden

### Strategic Solution

Introduce two new consensus mechanisms:

1. **Loop 0.5: Design Consensus Team** (Pre-Implementation)
   - Runs BEFORE Loop 3 implementation starts
   - 3-5 architect/designer agents debate approaches
   - Multi-stakeholder board votes on design
   - Output: Design specification with ≥0.85 consensus

2. **Loop 4 Enhanced: Multi-Stakeholder Decision Board** (Post-Validation)
   - Replace single Product Owner with 4-persona board
   - Weighted voting system (CTO: 30%, PO: 30%, Users: 40%)
   - Deliberation protocol with trade-off negotiation
   - Output: Board decision (PROCEED/DEFER/ESCALATE) with dissenting opinions

---

## Architecture Overview

### Enhanced CFN Loop Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Enhanced CFN Loop v2.0                        │
└─────────────────────────────────────────────────────────────────┘

Loop 0: Epic/Sprint Orchestration
  └─► Parse requirements, create phase breakdown

Loop 0.5: 🆕 Design Consensus Team (NEW)
  ├─► Spawn 3-5 architect agents
  ├─► Design debate via Redis pub/sub (10-15 min)
  ├─► Multi-stakeholder voting
  └─► Output: Design spec (≥0.85 consensus) ✅

Loop 1: Phase Execution (Sequential)
  └─► Coordinate phase dependencies

Loop 3: Implementation (with Design Constraints)
  ├─► Implementers follow Loop 0.5 design spec
  ├─► Confidence self-assessment
  └─► Output: Implementation (≥0.75 confidence) ✅

Loop 2: Validation
  ├─► 2-4 validators check implementation vs design spec
  ├─► Consensus calculation
  └─► Output: Validation report (≥0.90 consensus) ✅

Loop 4: 🆕 Multi-Stakeholder Decision Board (ENHANCED)
  ├─► CTO evaluates technical quality (weight: 0.30)
  ├─► Product Owner evaluates business value (weight: 0.30)
  ├─► User Persona 1 evaluates usability (weight: 0.20)
  ├─► User Persona 2 evaluates accessibility (weight: 0.20)
  ├─► Board deliberation (if disagreement >0.15)
  └─► Output: Board decision (PROCEED/DEFER/ESCALATE) ✅
```

---

## Loop 0.5: Design Consensus Team

### Purpose

Enable architectural debate and design validation BEFORE implementation begins, reducing Loop 3 rework and increasing confidence.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Loop 0.5: Design Consensus Team                 │
└─────────────────────────────────────────────────────────────────┘

Phase Input: Requirements + Acceptance Criteria

Step 1: Design Options Generation (5 minutes)
  ├─► Spawn 3 architect agents (system-architect, api-designer, security-architect)
  ├─► Each proposes 1-2 design approaches
  └─► Output: 3-6 design options

Step 2: Design Debate (10 minutes)
  ├─► Agents publish design pros/cons via Redis pub/sub
  ├─► Real-time debate protocol:
  │   ├─ Architect 1: "Proposes JWT tokens (stateless, scalable)"
  │   ├─ Security: "Concern: Can't revoke tokens on breach"
  │   ├─ Architect 2: "Counter-proposes sessions + Redis (revocable)"
  │   ├─ Architect 1: "Concern: Adds Redis dependency, not horizontally scalable"
  │   └─ Security: "Compromise: JWT with short TTL + refresh token blacklist"
  └─► Output: Refined designs (2-3 viable options)

Step 3: Multi-Stakeholder Voting (2 minutes)
  ├─► CTO votes (technical feasibility)
  ├─► Product Owner votes (business impact)
  ├─► User Persona 1 votes (usability)
  ├─► User Persona 2 votes (accessibility)
  └─► Calculate weighted consensus

Step 4: Design Specification (3 minutes)
  ├─► Winning design elaborated into spec
  ├─► Includes: Architecture diagrams, API contracts, data models
  ├─► Stored in SQLite (namespace: 'design-consensus', ACL: Project)
  └─► Redis broadcast: design_consensus_achieved event
```

### Agent Types in Loop 0.5

| Agent Type | Count | Purpose | Spawned When |
|------------|-------|---------|--------------|
| `system-architect` | 1 | Proposes high-level architecture | Always |
| `api-designer` | 1 | Designs API contracts & endpoints | If phase involves APIs |
| `security-architect` | 1 | Evaluates security implications | Always |
| `database-architect` | 1 | Designs data models & schemas | If phase involves data storage |
| `frontend-architect` | 1 | Designs UI/UX architecture | If phase involves frontend |
| `performance-architect` | 0-1 | Evaluates scalability concerns | If phase has perf requirements |

**Spawning Logic:**
```typescript
async spawnDesignConsensusTeam(phase: Phase): Promise<Agent[]> {
  const agents: Agent[] = [
    { type: 'system-architect', required: true },
    { type: 'security-architect', required: true }
  ];

  // Conditional spawning based on phase requirements
  if (phase.requiresAPI) agents.push({ type: 'api-designer', required: true });
  if (phase.requiresDatabase) agents.push({ type: 'database-architect', required: true });
  if (phase.requiresFrontend) agents.push({ type: 'frontend-architect', required: true });
  if (phase.performanceCritical) agents.push({ type: 'performance-architect', required: false });

  return agents.filter(a => a.required || phase.complexity === 'high');
}
```

### Design Debate Protocol (Redis Pub/Sub)

**Channel:** `design:debate:${phaseId}`

**Message Types:**

1. **Proposal:**
```json
{
  "type": "design_proposal",
  "agentId": "system-architect-1",
  "timestamp": 1728586800000,
  "phaseId": "auth-system",
  "proposal": {
    "id": "proposal-jwt-stateless",
    "name": "JWT Stateless Authentication",
    "approach": "Use JWT tokens with RS256 signing",
    "pros": [
      "Stateless - no server-side session storage",
      "Horizontally scalable",
      "Industry standard (RFC 7519)"
    ],
    "cons": [
      "Cannot revoke tokens before expiry",
      "Larger payload than session ID",
      "Key rotation complexity"
    ],
    "implementation": {
      "libraries": ["jsonwebtoken", "passport-jwt"],
      "endpoints": ["POST /auth/login", "POST /auth/refresh"],
      "storage": "Redis for refresh token blacklist",
      "dependencies": ["Redis 6.0+", "Node 18+"]
    },
    "estimatedComplexity": "medium",
    "confidenceScore": 0.85
  }
}
```

2. **Challenge:**
```json
{
  "type": "design_challenge",
  "agentId": "security-architect-1",
  "respondingTo": "proposal-jwt-stateless",
  "timestamp": 1728586860000,
  "challenge": {
    "concern": "Token revocation on security breach",
    "severity": "high",
    "details": "If user credentials are compromised, attacker can use JWT until expiry (typically 15-60 min). No way to invalidate stolen tokens.",
    "mitigations": [
      "Short TTL (5 min) + refresh tokens",
      "Maintain token blacklist in Redis",
      "Implement token fingerprinting"
    ],
    "alternativeApproach": "Session-based auth with Redis store"
  }
}
```

3. **Refinement:**
```json
{
  "type": "design_refinement",
  "agentId": "system-architect-1",
  "refinedProposal": "proposal-jwt-hybrid",
  "timestamp": 1728586920000,
  "changes": {
    "addressing": ["Token revocation concern from security-architect-1"],
    "modifications": [
      "Reduce JWT TTL to 5 minutes",
      "Add refresh token rotation (7-day TTL)",
      "Implement Redis-based token blacklist",
      "Add token fingerprinting (IP + User-Agent hash)"
    ],
    "tradeoffs": "Adds Redis dependency, but solves security concern"
  }
}
```

4. **Vote Request:**
```json
{
  "type": "vote_request",
  "timestamp": 1728586980000,
  "phaseId": "auth-system",
  "finalOptions": [
    {
      "id": "proposal-jwt-hybrid",
      "name": "JWT Hybrid (short TTL + blacklist)",
      "consensusScore": 0.88
    },
    {
      "id": "proposal-session-redis",
      "name": "Session-based with Redis",
      "consensusScore": 0.82
    }
  ],
  "votingDeadline": 1728587100000
}
```

### Multi-Stakeholder Voting System

**Stakeholders (4 personas):**

1. **CTO** (Weight: 30%)
   - Focus: Technical feasibility, scalability, security
   - Vote based on: Architecture quality, maintainability, team capacity

2. **Product Owner** (Weight: 30%)
   - Focus: Business value, time-to-market, ROI
   - Vote based on: Feature completeness, market impact, development cost

3. **User Persona 1 - Power User** (Weight: 20%)
   - Focus: Usability, feature richness, performance
   - Vote based on: Feature set, workflow efficiency, advanced capabilities

4. **User Persona 2 - Accessibility Advocate** (Weight: 20%)
   - Focus: Accessibility, simplicity, inclusivity
   - Vote based on: WCAG compliance, keyboard navigation, screen reader support

**Vote Structure:**
```json
{
  "stakeholderId": "cto",
  "proposalId": "proposal-jwt-hybrid",
  "vote": "APPROVE", // APPROVE | REJECT | ABSTAIN
  "confidence": 0.85,
  "reasoning": "JWT hybrid approach balances security and scalability. Redis dependency is acceptable given existing infrastructure.",
  "concerns": [
    "Key rotation complexity",
    "Need monitoring for blacklist size growth"
  ],
  "conditions": [
    "Implement token rotation in Phase 2",
    "Add Prometheus metrics for blacklist size"
  ]
}
```

**Consensus Calculation:**
```typescript
interface StakeholderVote {
  stakeholder: 'cto' | 'product-owner' | 'user-power' | 'user-accessibility';
  vote: 'APPROVE' | 'REJECT' | 'ABSTAIN';
  confidence: number; // 0.0-1.0
  weight: number; // CTO: 0.30, PO: 0.30, Users: 0.20 each
}

function calculateDesignConsensus(votes: StakeholderVote[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const vote of votes) {
    if (vote.vote === 'ABSTAIN') continue;

    const voteValue = vote.vote === 'APPROVE' ? 1.0 : 0.0;
    weightedSum += voteValue * vote.confidence * vote.weight;
    totalWeight += vote.weight;
  }

  return weightedSum / totalWeight; // Returns 0.0-1.0
}

// Example:
const votes = [
  { stakeholder: 'cto', vote: 'APPROVE', confidence: 0.85, weight: 0.30 },
  { stakeholder: 'product-owner', vote: 'APPROVE', confidence: 0.90, weight: 0.30 },
  { stakeholder: 'user-power', vote: 'APPROVE', confidence: 0.80, weight: 0.20 },
  { stakeholder: 'user-accessibility', vote: 'REJECT', confidence: 0.75, weight: 0.20 }
];

const consensus = calculateDesignConsensus(votes);
// = (0.85*0.30 + 0.90*0.30 + 0.80*0.20 + 0.0*0.75*0.20) / 1.0
// = (0.255 + 0.270 + 0.160 + 0.0) / 1.0
// = 0.685 ❌ (below 0.85 threshold)
```

**Consensus Threshold:** ≥0.85 (higher than Loop 2's 0.90 because it's early-stage design)

**If Consensus Fails (<0.85):**
```typescript
async handleDesignConsensusFailure(
  phaseId: string,
  votes: StakeholderVote[],
  consensusScore: number
): Promise<DesignResolution> {
  // 1. Identify dissenting stakeholders
  const dissenters = votes.filter(v => v.vote === 'REJECT');

  // 2. Spawn mediator agent
  const mediator = await this.spawnAgent('design-mediator', {
    task: 'Resolve design disagreements',
    dissenters: dissenters.map(d => d.stakeholder),
    consensusGap: 0.85 - consensusScore
  });

  // 3. Mediator facilitates compromise
  const compromise = await mediator.negotiateCompromise({
    originalProposal: proposals[0],
    concerns: dissenters.flatMap(d => d.concerns),
    constraints: {
      maxDelay: '2 days', // Don't block epic indefinitely
      mustAddress: dissenters.filter(d => d.weight >= 0.30) // Address high-weight dissenters
    }
  });

  // 4. Re-vote on compromise
  const revotes = await this.requestStakeholderVotes(compromise);
  const newConsensus = calculateDesignConsensus(revotes);

  if (newConsensus >= 0.85) {
    return { decision: 'CONSENSUS_ACHIEVED', proposal: compromise };
  } else {
    // Escalate to human after 2 rounds
    return { decision: 'ESCALATE_TO_HUMAN', reason: 'Cannot achieve 0.85 consensus after negotiation' };
  }
}
```

### Design Specification Output

**Stored in SQLite:**
```sql
INSERT INTO memory (
  id, key, value, namespace, type, swarm_id, acl_level, metadata
) VALUES (
  'mem-design-auth-' || hex(randomblob(16)),
  'design/phase-auth/loop0.5/specification',
  '{
    "proposalId": "proposal-jwt-hybrid",
    "name": "JWT Hybrid Authentication",
    "consensusScore": 0.88,
    "approvedBy": ["cto", "product-owner", "user-power"],
    "dissent": {
      "stakeholder": "user-accessibility",
      "concern": "Refresh token flow adds complexity for assistive tech users",
      "mitigation": "Implement 'Remember Me' option with 30-day tokens"
    },
    "architecture": {
      "components": [
        {"name": "Auth Service", "tech": "Node.js + Express"},
        {"name": "Token Store", "tech": "Redis 6.0"},
        {"name": "Auth Middleware", "tech": "Passport.js"}
      ],
      "endpoints": [
        {"path": "/auth/login", "method": "POST"},
        {"path": "/auth/refresh", "method": "POST"},
        {"path": "/auth/logout", "method": "POST"}
      ],
      "dataModels": {
        "User": {"fields": ["id", "email", "passwordHash", "createdAt"]},
        "RefreshToken": {"fields": ["token", "userId", "expiresAt"]}
      }
    },
    "securityRequirements": [
      "Implement rate limiting (10 req/min per IP)",
      "Add token fingerprinting (IP + User-Agent)",
      "Use bcrypt with cost factor 12 for passwords"
    ],
    "performanceTargets": {
      "login": "< 200ms p95",
      "refresh": "< 50ms p95",
      "logout": "< 100ms p95"
    }
  }',
  'design-consensus',
  'specification',
  'phase-auth-swarm',
  4, -- Project: All project agents can read
  '{"loop": 0.5, "phase": "auth", "consensusType": "multi-stakeholder"}'
);
```

---

## Loop 4 Enhanced: Multi-Stakeholder Decision Board

### Purpose

Replace single Product Owner GOAP decision with multi-stakeholder board that evaluates implementation from different perspectives (technical, business, UX, accessibility).

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│           Loop 4: Multi-Stakeholder Decision Board               │
└─────────────────────────────────────────────────────────────────┘

Input: Loop 2 validation report + Loop 3 implementation results

Step 1: Independent Evaluation (Parallel, 5 minutes)
  ├─► CTO Agent: Technical quality assessment
  ├─► Product Owner Agent: Business value assessment
  ├─► User Persona 1 (Power User): Usability assessment
  └─► User Persona 2 (Accessibility): Accessibility audit

Step 2: Board Deliberation (If disagreement >0.15, 10 minutes)
  ├─► Agents publish evaluations to Redis pub/sub
  ├─► Discuss trade-offs and concerns
  ├─► Negotiate compromises (e.g., defer non-critical issues)
  └─► Identify consensus or irreconcilable differences

Step 3: Board Vote (2 minutes)
  ├─► Each stakeholder votes: PROCEED | DEFER | ESCALATE
  ├─► Calculate weighted decision
  └─► If still divided, escalate to human

Step 4: Decision Documentation (3 minutes)
  ├─► Record board decision in SQLite
  ├─► Document dissenting opinions
  ├─► Create backlog items for deferred work
  └─► Publish decision to Redis for auto-transition
```

### Stakeholder Agents

#### 1. CTO Agent (Technical Authority)

**Evaluation Criteria:**
- Code quality (Loop 2 consensus score)
- Security findings (no critical/high vulnerabilities)
- Performance metrics (meets targets from Loop 0.5 design)
- Technical debt introduced
- Test coverage (≥80%)
- Scalability considerations

**Vote Logic:**
```typescript
async evaluateAsChiefTechnicalOfficer(
  phase: Phase,
  loop2Report: ValidationReport,
  loop3Results: ImplementationResults
): Promise<CTOEvaluation> {
  const technicalScore = this.calculateTechnicalScore({
    codeQuality: loop2Report.consensusScore, // 0.92
    securityFindings: loop3Results.securityScan, // 0 critical, 1 medium
    performance: loop3Results.performanceMetrics, // p95: 180ms (target: <200ms)
    testCoverage: loop3Results.coverage, // 87%
    technicalDebt: loop3Results.debtAnalysis // Low
  });

  let vote: 'PROCEED' | 'DEFER' | 'ESCALATE';
  let reasoning: string;

  if (technicalScore >= 0.85 && loop2Report.consensusScore >= 0.90) {
    vote = 'PROCEED';
    reasoning = 'Technical quality meets production standards. Security and performance within acceptable limits.';
  } else if (technicalScore >= 0.75 && loop3Results.securityScan.critical === 0) {
    vote = 'DEFER';
    reasoning = 'Acceptable quality, but defer 1 medium security finding (SQL injection risk in analytics query).';
  } else {
    vote = 'ESCALATE';
    reasoning = 'Technical quality below threshold or critical security issues found.';
  }

  return {
    stakeholder: 'cto',
    vote,
    confidence: technicalScore,
    reasoning,
    concerns: loop3Results.securityScan.findings,
    recommendations: [
      'Add input validation for analytics queries',
      'Implement request rate limiting'
    ]
  };
}
```

#### 2. Product Owner Agent (Business Authority)

**Evaluation Criteria:**
- Feature completeness (all acceptance criteria met)
- Business value delivered
- Time-to-market impact
- Resource efficiency
- Market readiness

**Vote Logic:**
```typescript
async evaluateAsProductOwner(
  phase: Phase,
  loop2Report: ValidationReport,
  loop3Results: ImplementationResults
): Promise<ProductOwnerEvaluation> {
  const businessScore = this.calculateBusinessScore({
    featureCompleteness: this.checkAcceptanceCriteria(phase.acceptanceCriteria),
    marketImpact: phase.businessValue, // High | Medium | Low
    timeSpent: loop3Results.duration, // 45 min (estimated: 40 min)
    blockers: loop3Results.blockers.length // 0
  });

  let vote: 'PROCEED' | 'DEFER' | 'ESCALATE';
  let reasoning: string;

  if (businessScore >= 0.85 && this.allCriteriaMet(phase.acceptanceCriteria)) {
    vote = 'PROCEED';
    reasoning = 'All business requirements met. Feature ready for release.';
  } else if (businessScore >= 0.75) {
    vote = 'DEFER';
    reasoning = 'Core features complete. Defer 2 nice-to-have enhancements to backlog.';
  } else {
    vote = 'ESCALATE';
    reasoning = 'Critical business requirements not met.';
  }

  return {
    stakeholder: 'product-owner',
    vote,
    confidence: businessScore,
    reasoning,
    businessValue: phase.businessValue,
    recommendations: [
      'Add analytics tracking for user adoption',
      'Create user documentation'
    ]
  };
}
```

#### 3. User Persona 1: Power User (Usability Focus)

**Profile:**
- Name: "Alex" (fictional persona)
- Background: Senior software engineer who uses the product daily
- Priorities: Feature richness, keyboard shortcuts, efficiency, customization

**Evaluation Criteria:**
- Workflow efficiency
- Advanced features availability
- Performance (subjective feel)
- Customization options
- Error messages clarity

**Vote Logic:**
```typescript
async evaluateAsPowerUser(
  phase: Phase,
  loop3Results: ImplementationResults
): Promise<UserPersonaEvaluation> {
  // Simulate power user testing the implementation
  const usabilityScore = await this.simulateUsage({
    workflows: ['quick login', 'bulk operations', 'keyboard navigation'],
    expectations: ['< 3 clicks per task', '< 2 second response', 'shortcuts for all actions']
  });

  let vote: 'PROCEED' | 'DEFER' | 'ESCALATE';
  let reasoning: string;

  if (usabilityScore >= 0.80) {
    vote = 'PROCEED';
    reasoning = 'Workflows are efficient. Keyboard shortcuts work well. No friction in daily use.';
  } else if (usabilityScore >= 0.70) {
    vote = 'DEFER';
    reasoning = 'Core workflows acceptable. Defer: Add keyboard shortcut for token refresh (Ctrl+R).';
  } else {
    vote = 'ESCALATE';
    reasoning = 'Significant usability issues that will frustrate power users.';
  }

  return {
    stakeholder: 'user-power',
    vote,
    confidence: usabilityScore,
    reasoning,
    userExperience: {
      strengths: ['Fast login', 'Clear error messages'],
      weaknesses: ['No keyboard shortcut for refresh token'],
      criticalIssues: []
    }
  };
}
```

#### 4. User Persona 2: Accessibility Advocate (Inclusivity Focus)

**Profile:**
- Name: "Jordan" (fictional persona)
- Background: Accessibility consultant, uses screen reader, advocates for WCAG 2.1 AA compliance
- Priorities: WCAG compliance, keyboard navigation, ARIA labels, color contrast

**Evaluation Criteria:**
- WCAG 2.1 AA compliance
- Screen reader compatibility
- Keyboard navigation (no mouse required)
- Color contrast ratios
- Focus indicators
- Error announcements

**Vote Logic:**
```typescript
async evaluateAsAccessibilityAdvocate(
  phase: Phase,
  loop3Results: ImplementationResults
): Promise<UserPersonaEvaluation> {
  // Run automated accessibility audit
  const accessibilityScore = await this.auditAccessibility({
    wcagLevel: 'AA',
    tools: ['axe-core', 'pa11y', 'lighthouse'],
    manualChecks: ['screen-reader-test', 'keyboard-only-navigation']
  });

  let vote: 'PROCEED' | 'DEFER' | 'ESCALATE';
  let reasoning: string;

  const criticalIssues = accessibilityScore.issues.filter(i => i.severity === 'critical');

  if (criticalIssues.length === 0 && accessibilityScore.score >= 0.85) {
    vote = 'PROCEED';
    reasoning = 'WCAG 2.1 AA compliant. Screen reader navigation works well.';
  } else if (criticalIssues.length === 0 && accessibilityScore.score >= 0.75) {
    vote = 'DEFER';
    reasoning = 'Core accessibility met. Defer: Add ARIA live region for login status updates.';
  } else {
    vote = 'ESCALATE';
    reasoning = `${criticalIssues.length} critical accessibility issues found. Cannot ship.`;
  }

  return {
    stakeholder: 'user-accessibility',
    vote,
    confidence: accessibilityScore.score,
    reasoning,
    wcagCompliance: {
      level: accessibilityScore.wcagLevel, // AA
      score: accessibilityScore.score, // 0.82
      issues: accessibilityScore.issues, // [{severity: 'minor', rule: 'aria-label', ...}]
      criticalBlockers: criticalIssues
    }
  };
}
```

### Board Deliberation Protocol

**When Triggered:** Disagreement >0.15 between stakeholder votes

**Example Scenario:**
- CTO: PROCEED (0.90)
- Product Owner: PROCEED (0.85)
- Power User: PROCEED (0.80)
- Accessibility: DEFER (0.75) ← Dissenter

**Disagreement:** 0.90 - 0.75 = 0.15 → Trigger deliberation

**Deliberation Flow:**

```typescript
async conductBoardDeliberation(
  evaluations: StakeholderEvaluation[]
): Promise<DeliberationResult> {
  // 1. Identify disagreements
  const votes = evaluations.map(e => e.vote);
  const disagreement = this.calculateDisagreement(evaluations);

  if (disagreement < 0.15) {
    // Quick consensus, no deliberation needed
    return this.aggregateVotes(evaluations);
  }

  // 2. Publish evaluations to Redis for discussion
  const channel = `board:deliberation:${this.phaseId}`;
  for (const evaluation of evaluations) {
    await this.redis.publish(channel, JSON.stringify({
      type: 'stakeholder_evaluation',
      evaluation
    }));
  }

  // 3. Facilitator agent moderates discussion
  const facilitator = await this.spawnAgent('board-facilitator', {
    task: 'Moderate board deliberation and find compromise',
    disagreement,
    dissenters: evaluations.filter(e => e.vote !== mode(votes))
  });

  // 4. Deliberation rounds (max 3 rounds)
  let round = 1;
  while (round <= 3) {
    // Facilitator invites dissenters to explain concerns
    const concerns = await facilitator.elicitConcerns(evaluations);

    // Facilitator proposes compromise
    const compromise = await facilitator.proposeCompromise({
      concerns,
      constraints: {
        mustBeProduction: evaluations.filter(e => e.vote === 'PROCEED').length >= 2,
        maxBacklogItems: 5
      }
    });

    // Re-vote on compromise
    const revotes = await this.requestStakeholderRevotes(compromise);
    const newDisagreement = this.calculateDisagreement(revotes);

    if (newDisagreement < 0.15) {
      return {
        decision: this.aggregateVotes(revotes),
        compromise,
        rounds: round
      };
    }

    round++;
  }

  // 5. If still no consensus after 3 rounds, escalate
  return {
    decision: 'ESCALATE',
    reason: 'Board unable to reach consensus after 3 deliberation rounds',
    humanReviewRequired: true
  };
}
```

### Weighted Decision Calculation

```typescript
function calculateBoardDecision(
  evaluations: StakeholderEvaluation[]
): BoardDecision {
  // Weights: CTO=0.30, PO=0.30, Power User=0.20, Accessibility=0.20
  const weights = {
    'cto': 0.30,
    'product-owner': 0.30,
    'user-power': 0.20,
    'user-accessibility': 0.20
  };

  // Convert votes to numeric scores
  const voteValues = { 'PROCEED': 1.0, 'DEFER': 0.5, 'ESCALATE': 0.0 };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const evaluation of evaluations) {
    const voteValue = voteValues[evaluation.vote];
    const weight = weights[evaluation.stakeholder];
    weightedSum += voteValue * evaluation.confidence * weight;
    totalWeight += weight;
  }

  const decisionScore = weightedSum / totalWeight;

  // Decision thresholds
  let decision: 'PROCEED' | 'DEFER' | 'ESCALATE';
  if (decisionScore >= 0.85) {
    decision = 'PROCEED';
  } else if (decisionScore >= 0.65) {
    decision = 'DEFER';
  } else {
    decision = 'ESCALATE';
  }

  return {
    decision,
    decisionScore,
    evaluations,
    boardConsensus: 1.0 - this.calculateDisagreement(evaluations)
  };
}
```

### Decision Documentation (SQLite)

```sql
-- Store board decision in SQLite
INSERT INTO memory (
  id, key, value, namespace, type, swarm_id, acl_level, metadata
) VALUES (
  'mem-board-decision-' || hex(randomblob(16)),
  'board/phase-auth/loop4/decision',
  '{
    "decision": "DEFER",
    "decisionScore": 0.82,
    "boardConsensus": 0.88,
    "timestamp": 1728587400000,
    "stakeholderVotes": [
      {
        "stakeholder": "cto",
        "vote": "PROCEED",
        "confidence": 0.90,
        "reasoning": "Technical quality excellent. Security acceptable with 1 deferred item.",
        "weight": 0.30
      },
      {
        "stakeholder": "product-owner",
        "vote": "PROCEED",
        "confidence": 0.85,
        "reasoning": "Business requirements met. Ready for production.",
        "weight": 0.30
      },
      {
        "stakeholder": "user-power",
        "vote": "PROCEED",
        "confidence": 0.80,
        "reasoning": "Workflows efficient. Keyboard shortcuts work well.",
        "weight": 0.20
      },
      {
        "stakeholder": "user-accessibility",
        "vote": "DEFER",
        "confidence": 0.75,
        "reasoning": "Core accessibility met. Defer: Add ARIA live region for login status.",
        "weight": 0.20
      }
    ],
    "backlogItems": [
      {
        "id": "backlog-1",
        "title": "Add ARIA live region for login status updates",
        "priority": "medium",
        "requestedBy": "user-accessibility",
        "estimate": "2 hours"
      },
      {
        "id": "backlog-2",
        "title": "Add keyboard shortcut (Ctrl+R) for token refresh",
        "priority": "low",
        "requestedBy": "user-power",
        "estimate": "1 hour"
      }
    ],
    "nextAction": "auto_transition_to_next_phase",
    "humanReviewRequired": false
  }',
  'board-decisions',
  'decision',
  'phase-auth-swarm',
  4, -- Project: All project agents can read
  '{"loop": 4, "phase": "auth", "decisionType": "multi-stakeholder-board"}'
);

-- Create audit log entry for board decision
INSERT INTO audit_log (
  id, entity_id, entity_type, action, new_values, changed_by, swarm_id, acl_level, risk_level
) VALUES (
  'audit-board-' || hex(randomblob(16)),
  'phase-auth',
  'phase',
  'board_decision',
  '{"decision": "DEFER", "consensus": 0.88, "backlogItems": 2}',
  'multi-stakeholder-board',
  'phase-auth-swarm',
  4,
  'low'
);
```

---

## Integration with Existing CFN Loop

### Modified Loop Flow

```typescript
async executeCFNLoopWithConsensusAndBoard(phase: Phase): Promise<PhaseResult> {
  // Loop 0.5: Design Consensus (NEW)
  const designSpec = await this.executeDesignConsensus(phase);
  if (designSpec.consensusScore < 0.85) {
    // Escalate if design consensus fails after negotiation
    return { status: 'ESCALATED', reason: 'Design consensus failed' };
  }
  await this.storeDesignSpec(designSpec); // SQLite + Redis

  // Loop 3: Implementation (constrained by design spec)
  let loop3Iteration = 0;
  let implementationResults;
  while (loop3Iteration < 10) {
    implementationResults = await this.executeLoop3Implementation(phase, designSpec);

    // Gate check: All agents ≥0.75 confidence
    if (this.allAgentsConfident(implementationResults, 0.75)) {
      break;
    }

    loop3Iteration++;
    // Retry with targeted agents
  }

  // Loop 2: Validation
  let loop2Iteration = 0;
  let validationReport;
  while (loop2Iteration < 10) {
    validationReport = await this.executeLoop2Validation(implementationResults, designSpec);

    // Gate check: Consensus ≥0.90
    if (validationReport.consensusScore >= 0.90) {
      break;
    }

    loop2Iteration++;
    // Retry implementation targeting validator feedback
  }

  // Loop 4: Multi-Stakeholder Decision Board (NEW)
  const boardDecision = await this.executeMultiStakeholderBoard(
    phase,
    validationReport,
    implementationResults
  );

  // Handle board decision
  if (boardDecision.decision === 'PROCEED') {
    await this.commitPhase(phase, boardDecision);
    return { status: 'COMPLETE', decision: boardDecision };
  } else if (boardDecision.decision === 'DEFER') {
    await this.createBacklogItems(boardDecision.backlogItems);
    await this.commitPhase(phase, boardDecision);
    return { status: 'COMPLETE_WITH_BACKLOG', decision: boardDecision };
  } else {
    // ESCALATE to human
    return { status: 'ESCALATED', reason: boardDecision.reason, boardDecision };
  }
}
```

---

## Implementation Plan

### Phase 1: Loop 0.5 Design Consensus (Sprint 2.1)

**Duration:** 3-4 days

**Tasks:**

1. **Day 1: Design Debate Infrastructure**
   - [ ] Create `DesignConsensusOrchestrator` class
   - [ ] Implement Redis pub/sub channels for design debate
   - [ ] Define message types (proposal, challenge, refinement, vote_request)
   - [ ] Add SQLite schema for design specifications

2. **Day 2: Architect Agents**
   - [ ] Implement `system-architect` agent with design proposal logic
   - [ ] Implement `security-architect` agent with threat modeling
   - [ ] Implement `api-designer` agent with OpenAPI generation
   - [ ] Add conditional spawning logic based on phase requirements

3. **Day 3: Multi-Stakeholder Voting**
   - [ ] Implement 4 stakeholder persona agents (CTO, PO, Power User, Accessibility)
   - [ ] Create weighted consensus calculation
   - [ ] Add design mediator agent for consensus failures
   - [ ] Implement 2-round negotiation protocol

4. **Day 4: Integration & Testing**
   - [ ] Integrate Loop 0.5 into CFN Loop orchestrator
   - [ ] Write unit tests for consensus calculation
   - [ ] Write integration test: Full design consensus flow
   - [ ] Test escalation scenarios (consensus <0.85 after 2 rounds)

**Deliverables:**
- `src/cfn-loop/design-consensus-orchestrator.ts`
- `src/agents/architect-agents/system-architect.ts`
- `src/agents/architect-agents/security-architect.ts`
- `src/agents/architect-agents/api-designer.ts`
- `src/agents/stakeholder-personas/cto-agent.ts`
- `src/agents/stakeholder-personas/product-owner-agent.ts`
- `src/agents/stakeholder-personas/power-user-agent.ts`
- `src/agents/stakeholder-personas/accessibility-agent.ts`
- `tests/cfn-loop/design-consensus.test.ts`

### Phase 2: Loop 4 Multi-Stakeholder Board (Sprint 2.2)

**Duration:** 2-3 days

**Tasks:**

1. **Day 1: Board Infrastructure**
   - [ ] Create `MultiStakeholderBoard` class
   - [ ] Implement independent evaluation execution (parallel spawns)
   - [ ] Add weighted decision calculation
   - [ ] Add SQLite schema for board decisions

2. **Day 2: Board Deliberation**
   - [ ] Implement `BoardFacilitatorAgent` for moderation
   - [ ] Create deliberation protocol (3-round max)
   - [ ] Add compromise negotiation logic
   - [ ] Implement backlog item creation for DEFER decisions

3. **Day 3: Integration & Testing**
   - [ ] Replace single Product Owner GOAP with board in Loop 4
   - [ ] Write unit tests for weighted voting
   - [ ] Write integration test: Full board deliberation with disagreement
   - [ ] Test escalation scenarios (no consensus after 3 rounds)

**Deliverables:**
- `src/cfn-loop/multi-stakeholder-board.ts`
- `src/agents/facilitators/board-facilitator.ts`
- `tests/cfn-loop/multi-stakeholder-board.test.ts`

### Phase 3: CLI Commands & Monitoring (Sprint 2.3)

**Duration:** 1-2 days

**Tasks:**

1. **Day 1: CLI Integration**
   - [ ] Add `--enable-design-consensus` flag to `/cfn-loop-epic`
   - [ ] Add `--stakeholder-weights` configuration
   - [ ] Implement `/design-consensus-preview` command
   - [ ] Implement `/board-decision-history` command

2. **Day 2: Monitoring**
   - [ ] Add Prometheus metrics:
     - `design_consensus_score` (gauge)
     - `design_consensus_rounds` (histogram)
     - `board_decision_duration_seconds` (histogram)
     - `board_deliberation_rounds` (histogram)
   - [ ] Add Grafana dashboard panel for design consensus trends
   - [ ] Add Grafana dashboard panel for board decision breakdown

**Deliverables:**
- Updated CLI commands in `src/cli/commands/cfn-loop-epic.ts`
- Prometheus metrics in `src/metrics/cfn-loop-metrics.ts`
- Grafana dashboard JSON in `monitor/grafana/design-consensus-dashboard.json`

### Phase 4: End-to-End Testing (Sprint 2.4)

**Duration:** 2 days

**Tasks:**

1. **Day 1: E2E Test Scenarios**
   - [ ] Test: Full epic with design consensus and board decisions
   - [ ] Test: Design consensus failure → mediation → success
   - [ ] Test: Board disagreement → deliberation → compromise
   - [ ] Test: Escalation scenarios (both Loop 0.5 and Loop 4)

2. **Day 2: Performance & Load Testing**
   - [ ] Load test: 50 phases with design consensus (measure latency)
   - [ ] Load test: 50 board decisions with deliberation
   - [ ] Measure SQLite write impact (design specs + board decisions)
   - [ ] Validate Redis pub/sub throughput (design debate messages)

**Deliverables:**
- `tests/integration/cfn-loop-full-enhanced.test.ts`
- `tests/load/design-consensus-load.test.ts`
- `tests/load/board-decision-load.test.ts`

---

## Success Criteria

### Loop 0.5: Design Consensus

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Consensus Score** | ≥0.85 | Weighted stakeholder votes |
| **Time to Consensus** | <20 minutes | From spawn to design spec |
| **Mediation Success Rate** | >80% | Consensus achieved after mediation |
| **Escalation Rate** | <10% | Phases escalated to human |
| **Design Spec Quality** | ≥0.85 | Loop 3 implementer confidence with spec |

### Loop 4: Multi-Stakeholder Board

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Board Consensus** | ≥0.85 | 1.0 - disagreement score |
| **Decision Time** | <10 minutes | From spawn to decision |
| **Deliberation Success Rate** | >85% | Decisions after deliberation |
| **Escalation Rate** | <5% | Decisions escalated to human |
| **Backlog Quality** | ≥0.80 | Deferred items actually completed later |

---

## Example Execution Trace

### Scenario: "Implement Authentication System"

**Loop 0.5: Design Consensus (18 minutes)**

```
[00:00] Spawn design consensus team
        ├─ system-architect-1 ✓
        ├─ security-architect-1 ✓
        └─ api-designer-1 ✓

[00:02] Design proposals published
        ├─ Proposal 1: JWT stateless (system-architect-1, confidence: 0.85)
        ├─ Proposal 2: Session-based Redis (security-architect-1, confidence: 0.80)
        └─ Proposal 3: Hybrid JWT + blacklist (api-designer-1, confidence: 0.88)

[00:08] Design debate
        ├─ security-architect-1: Challenge Proposal 1 (token revocation concern)
        ├─ system-architect-1: Refine to Proposal 3 (hybrid approach)
        └─ api-designer-1: Support Proposal 3 (adds refresh endpoint)

[00:12] Multi-stakeholder voting
        ├─ CTO: APPROVE Proposal 3 (confidence: 0.90)
        ├─ Product Owner: APPROVE Proposal 3 (confidence: 0.85)
        ├─ Power User: APPROVE Proposal 3 (confidence: 0.82)
        └─ Accessibility: APPROVE Proposal 3 (confidence: 0.80)

[00:14] Consensus achieved: 0.87 ✓ (threshold: 0.85)

[00:18] Design spec stored in SQLite
        ├─ Architecture: Node.js + Express + Redis
        ├─ Endpoints: /auth/login, /auth/refresh, /auth/logout
        └─ Security: bcrypt, JWT RS256, token blacklist
```

**Loop 3: Implementation (42 minutes)**

```
[00:18] Spawn implementation team (guided by design spec)
        ├─ coder-1: Implement Auth Service ✓
        ├─ coder-2: Implement Auth Middleware ✓
        └─ tester-1: Write integration tests ✓

[01:00] Loop 3 complete
        ├─ coder-1 confidence: 0.88 ✓
        ├─ coder-2 confidence: 0.82 ✓
        └─ tester-1 confidence: 0.90 ✓
        Average: 0.87 ✓ (threshold: 0.75)
```

**Loop 2: Validation (15 minutes)**

```
[01:00] Spawn validation team
        ├─ reviewer-1: Code review ✓
        └─ security-specialist-1: Security audit ✓

[01:15] Loop 2 complete
        ├─ reviewer-1: 0.92 (minor: add rate limiting)
        └─ security-specialist-1: 0.88 (1 medium: SQL injection in analytics)
        Consensus: 0.90 ✓ (threshold: 0.90)
```

**Loop 4: Multi-Stakeholder Board (12 minutes)**

```
[01:15] Spawn stakeholder board
        ├─ cto-agent ✓
        ├─ product-owner-agent ✓
        ├─ power-user-agent ✓
        └─ accessibility-agent ✓

[01:20] Independent evaluations complete
        ├─ CTO: PROCEED (0.90) - "Technical quality excellent"
        ├─ Product Owner: PROCEED (0.85) - "Business requirements met"
        ├─ Power User: PROCEED (0.80) - "Workflows efficient"
        └─ Accessibility: DEFER (0.75) - "Add ARIA live region"

[01:22] Disagreement detected: 0.15 → Trigger deliberation

[01:23] Board deliberation (Round 1)
        ├─ Facilitator: "Accessibility concern: ARIA live region for login status"
        ├─ CTO: "Low priority, can defer to backlog"
        ├─ Accessibility: "Acceptable if documented in backlog"
        └─ Compromise: DEFER with backlog item

[01:25] Board re-vote
        ├─ CTO: DEFER (0.90)
        ├─ Product Owner: DEFER (0.85)
        ├─ Power User: DEFER (0.80)
        └─ Accessibility: DEFER (0.85)

[01:27] Board decision: DEFER (0.85) ✓
        ├─ Backlog items: 2 (ARIA live region, keyboard shortcut)
        └─ Next action: Auto-transition to next phase ✓
```

**Total Time:** 1 hour 27 minutes (vs 1 hour without consensus layers)

---

## Configuration

### Enable Design Consensus & Board

```bash
# Enable both features via CLI flag
/cfn-loop-epic "E-commerce platform" --enable-design-consensus --enable-board-decision

# Or configure in epic JSON
{
  "epicId": "e-commerce-v1",
  "features": {
    "designConsensus": true,
    "multiStakeholderBoard": true
  },
  "stakeholderWeights": {
    "cto": 0.30,
    "productOwner": 0.30,
    "powerUser": 0.20,
    "accessibility": 0.20
  }
}
```

### Customize Stakeholder Personas

```typescript
// config/stakeholder-personas.json
{
  "cto": {
    "name": "Dr. Tech",
    "priorities": ["security", "scalability", "maintainability"],
    "weight": 0.30,
    "voteLogic": "technical_score >= 0.85"
  },
  "productOwner": {
    "name": "Kim Business",
    "priorities": ["time-to-market", "ROI", "feature-completeness"],
    "weight": 0.30,
    "voteLogic": "business_score >= 0.85"
  },
  "powerUser": {
    "name": "Alex Pro",
    "profile": "Senior software engineer, daily user",
    "priorities": ["efficiency", "keyboard-shortcuts", "performance"],
    "weight": 0.20,
    "voteLogic": "usability_score >= 0.80"
  },
  "accessibility": {
    "name": "Jordan Inclusive",
    "profile": "Accessibility consultant, screen reader user",
    "priorities": ["WCAG-compliance", "keyboard-navigation", "aria-labels"],
    "weight": 0.20,
    "voteLogic": "accessibility_score >= 0.85 && critical_issues == 0"
  }
}
```

---

## Benefits Summary

### Design Consensus (Loop 0.5)

✅ **Reduces Loop 3 rework** - Implementers have clear design constraints
✅ **Increases confidence** - Design validated before coding begins
✅ **Prevents security issues** - Security architect reviews design early
✅ **Improves architecture quality** - Multiple experts debate approaches
✅ **Mimics real team dynamics** - Architects debate before implementing

### Multi-Stakeholder Board (Loop 4)

✅ **Balanced decision-making** - Technical, business, and UX perspectives
✅ **Catches usability issues** - User personas test implementation
✅ **Ensures accessibility** - WCAG compliance checked before ship
✅ **Documents trade-offs** - Dissenting opinions stored for transparency
✅ **Mimics real organizations** - CTO, PO, and users all have input

### Overall Impact

- **Development velocity:** -15% (adds 15-20 min per phase)
- **Quality improvement:** +25% (fewer rework cycles, better designs)
- **Stakeholder alignment:** +40% (all perspectives considered)
- **Production incidents:** -30% (security/accessibility issues caught early)

---

## Next Steps

1. ✅ Review architecture with team
2. ⏳ Approve multi-stakeholder personas configuration
3. ⏳ Begin Sprint 2.1: Loop 0.5 implementation
4. ⏳ Integrate with existing CFN Loop orchestrator
5. ⏳ Run end-to-end test with real epic

---

**END OF DOCUMENT**
