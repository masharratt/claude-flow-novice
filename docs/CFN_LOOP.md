# CFN Loop Documentation - Self-Correcting Development Loop

**Claude Flow Novice 3-Loop System for Quality-Assured Agent Execution**

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [The 3 Loops Explained](#the-3-loops-explained)
4. [Confidence Scoring System](#confidence-scoring-system)
5. [Memory Namespacing Strategy](#memory-namespacing-strategy)
6. [Iteration Limits & Escalation](#iteration-limits--escalation)
7. [Example Workflows](#example-workflows)
8. [Integration Guide](#integration-guide)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The CFN (Claude Flow Novice) Loop is a **self-correcting, self-looping development system** that ensures high-quality deliverables through:

- **3 nested validation loops** (Execution → Self-Assessment → Consensus)
- **Confidence-based gating** (threshold: 0.75 for self-validation, 0.90 for consensus)
- **Byzantine consensus voting** across validator agents
- **Autonomous self-correction with feedback injection** (max 10 rounds)
- **Memory-coordinated learning** across all agents

**CRITICAL: This is a SELF-LOOPING PROCESS** - Claude autonomously continues through iterations without human intervention until consensus is achieved or iteration limits are reached.

**Key Benefit**: Catches 80% of errors before human review through agent self-validation and consensus verification.

---

## System Architecture

### High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CFN LOOP SYSTEM                             │
│                     (Self-Correcting Development)                    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  LOOP 1: SWARM INITIALIZATION (MANDATORY for Multi-Agent)   │
    │  ─────────────────────────────────────────────────────────  │
    │  • swarm_init(topology, maxAgents, strategy)                │
    │  • Topology: mesh (2-7 agents) | hierarchical (8+)          │
    │  • Establishes SwarmMemory coordination                     │
    │  • Byzantine consensus preparation                          │
    └─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  LOOP 2: EXECUTION LOOP (Primary Swarm)                     │
    │  ─────────────────────────────────────────────────────────  │
    │  Round Counter: r = 1                                       │
    │                                                             │
    │  ┌─────────────────────────────────────────────────────┐   │
    │  │ Step 2.1: Spawn Primary Agents (3-20 agents)        │   │
    │  │ • Concurrent execution via Task tool                │   │
    │  │ • Each agent: specific, non-overlapping task        │   │
    │  │ • Cross-coordination via SwarmMemory                │   │
    │  └─────────────────────────────────────────────────────┘   │
    │                       │                                     │
    │                       ▼                                     │
    │  ┌─────────────────────────────────────────────────────┐   │
    │  │ Step 2.2: Each Agent File Edit                      │   │
    │  │ • MANDATORY: Run enhanced-post-edit hook            │   │
    │  │ • Validation: format, lint, type, security, tests   │   │
    │  │ • Coverage analysis (threshold: 80%)                │   │
    │  │ • Store in memory: swarm/{agent}/{task}             │   │
    │  └─────────────────────────────────────────────────────┘   │
    │                       │                                     │
    │                       ▼                                     │
    │  ┌─────────────────────────────────────────────────────┐   │
    │  │ Step 2.3: Self-Validation (Per Agent)               │   │
    │  │ • Confidence score calculation: C_agent             │   │
    │  │ • Criteria: tests pass, coverage ≥80%, no critical │   │
    │  │ • Output: confidence ∈ [0.0, 1.0]                   │   │
    │  └─────────────────────────────────────────────────────┘   │
    │                       │                                     │
    │                       ▼                                     │
    │  ┌─────────────────────────────────────────────────────┐   │
    │  │ GATE 1: Self-Assessment Check                       │   │
    │  │                                                     │   │
    │  │ IF min(C_agent) ≥ 0.75:                             │   │
    │  │    → Proceed to LOOP 3 (Consensus)                  │   │
    │  │ ELSE:                                               │   │
    │  │    → Collect feedback from failed validations       │   │
    │  │    → Round counter r++                              │   │
    │  │    → IF r ≤ 10: IMMEDIATELY retry Step 2.1 (self-correcting) │   │
    │  │    → IF r > 10: Continue self-looping process      │   │
    │  └─────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ (Self-validation passed)
    ┌─────────────────────────────────────────────────────────────┐
    │  LOOP 3: CONSENSUS VERIFICATION LOOP                        │
    │  ─────────────────────────────────────────────────────────  │
    │  Round Counter: v = 1                                       │
    │                                                             │
    │  ┌─────────────────────────────────────────────────────┐   │
    │  │ Step 3.1: Spawn Validator Swarm (2-4 validators)    │   │
    │  │ • reviewer: Quality & architecture                  │   │
    │  │ • security-specialist: Security & performance       │   │
    │  │ • system-architect: Architecture validation         │   │
    │  │ • tester: Integration & regression testing          │   │
    │  └─────────────────────────────────────────────────────┘   │
    │                       │                                     │
    │                       ▼                                     │
    │  ┌─────────────────────────────────────────────────────┐   │
    │  │ Step 3.2: Multi-Dimensional Validation              │   │
    │  │ Each validator checks:                              │   │
    │  │ • Code quality (maintainability, patterns)          │   │
    │  │ • Security (XSS, SQL injection, secrets)            │   │
    │  │ • Performance (complexity, resource usage)          │   │
    │  │ • Tests (coverage, edge cases, integration)         │   │
    │  │ • Documentation (comments, API docs)                │   │
    │  │                                                     │   │
    │  │ Output: V_i = {approve: bool, confidence: float}    │   │
    │  └─────────────────────────────────────────────────────┘   │
    │                       │                                     │
    │                       ▼                                     │
    │  ┌─────────────────────────────────────────────────────┐   │
    │  │ Step 3.3: Byzantine Consensus Voting                │   │
    │  │                                                     │   │
    │  │ Agreement Rate (A) = (Approved Votes) / (Total)     │   │
    │  │ Avg Confidence (C_avg) = mean(C_validator)          │   │
    │  │                                                     │   │
    │  │ Critical Criteria (ALL must pass):                  │   │
    │  │  ✓ No security vulnerabilities (severity ≥ HIGH)    │   │
    │  │  ✓ All tests passing                                │   │
    │  │  ✓ Coverage ≥ minimum threshold                     │   │
    │  │  ✓ No blocking validation errors                    │   │
    │  └─────────────────────────────────────────────────────┘   │
    │                       │                                     │
    │                       ▼                                     │
    │  ┌─────────────────────────────────────────────────────┐   │
    │  │ GATE 2: Consensus Decision                          │   │
    │  │                                                     │   │
    │  │ PASS Criteria:                                      │   │
    │  │  • Agreement ≥ 90% (A ≥ 0.90)                       │   │
    │  │  • Avg Confidence ≥ 90% (C_avg ≥ 0.90)              │   │
    │  │  • All critical criteria met                        │   │
    │  │                                                     │   │
    │  │ IF PASS:                                            │   │
    │  │    → Store results in SwarmMemory                   │   │
    │  │    → Update documentation (if required)             │   │
    │  │    → EXIT: Success with Next Steps Guidance         │   │
    │  │                                                     │   │
    │  │ IF FAIL:                                            │   │
    │  │    → Aggregate validator feedback                   │   │
    │  │    → Round counter v++                              │   │
    │  │    → IF v ≤ 10: IMMEDIATELY return to LOOP 2 (self-correcting) │   │
    │  │    → IF v > 10: Continue self-looping (iteration limit guidance) │   │
    │  └─────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  EXIT: NEXT STEPS GUIDANCE                                  │
    │  ─────────────────────────────────────────────────────────  │
    │  1. ✅ What was completed: Summary of deliverables          │
    │  2. 📊 Validation results: Confidence scores, coverage      │
    │  3. 🔍 Identified issues: Technical debt, warnings          │
    │  4. 💡 Recommended next steps: Prioritized suggestions      │
    └─────────────────────────────────────────────────────────────┘
```

---

## Autonomous Self-Looping Behavior

The CFN Loop is designed to operate as a **self-correcting, self-looping system** that continues autonomously through iterations without human intervention.

### How Self-Looping Works:

1. **Loop 2 Failure** → System IMMEDIATELY relaunches primary swarm with feedback
2. **Loop 3 Failure** → System IMMEDIATELY retries consensus validation with adjustments
3. **Phase Complete** → System IMMEDIATELY transitions to next phase
4. **Max Iterations** → System provides iteration guidance but CONTINUES attempting resolution

### Continuation Prompts:

After each iteration, the system generates a continuation prompt that Claude should execute IMMEDIATELY:

```
"Consensus failed (Round 3/10). Validator feedback captured:
- [Issue 1]: Fix rate limiting
- [Issue 2]: Add token refresh

IMMEDIATELY relaunch Loop 2 with backend-dev and security-specialist agents. Inject feedback. DO NOT wait for approval. Self-correcting process in progress."
```

### Self-Correcting Escalation:

When iteration limits are reached (Loop 2: 3 attempts, Loop 3: 10 rounds), the system does NOT stop. Instead:

- **Generates continuation guidance** with specific next steps
- **CONTINUES attempting** with adjusted parameters
- **Provides escalation context** for Claude to proceed autonomously
- **NO HUMAN INTERVENTION REQUIRED** - system self-loops until resolution

---

## Sprint Orchestration (Two-Tier System)

### Overview: Phase/Sprint Architecture

The CFN Loop now supports a **two-tier orchestration system** for complex projects:

**Tier 1: Phases** - High-level milestones (e.g., "Authentication System")
- Composed of multiple sprints
- Epic-level coordination across 3-5 phases
- Progress tracked at phase level

**Tier 2: Sprints** - Focused deliverables within a phase (e.g., "JWT Token Generation")
- 1-3 day execution cycles
- Self-contained CFN loop per sprint
- Automatic rollup to phase completion

**Slash Commands**:
```bash
# Single-phase execution (original workflow)
/cfn-loop "Implement JWT auth" --phase=auth --max-loop2=10 --max-loop3=10

# Multi-sprint phase execution (NEW)
/cfn-loop-sprints "Authentication System" --sprints=3 --max-loop2=10

# Multi-phase epic execution (NEW)
/cfn-loop-epic "Complete User Management System" --phases=4 --max-loop2=10
```

### Sprint Execution Flow

```
EPIC: User Management System
├── PHASE 1: Authentication (3 sprints)
│   ├── Sprint 1.1: JWT Token Generation → CFN Loop (10 iterations)
│   ├── Sprint 1.2: Password Hashing → CFN Loop (10 iterations)
│   └── Sprint 1.3: Auth Middleware → CFN Loop (10 iterations)
├── PHASE 2: Authorization (2 sprints)
│   ├── Sprint 2.1: Role-Based Access → CFN Loop (10 iterations)
│   └── Sprint 2.2: Permission System → CFN Loop (10 iterations)
└── PHASE 3: User Profile (2 sprints)
    ├── Sprint 3.1: Profile CRUD → CFN Loop (10 iterations)
    └── Sprint 3.2: Avatar Upload → CFN Loop (10 iterations)
```

**Memory Namespace Pattern**:
```
cfn-loop/
├── epic-{id}/
│   ├── phase-1/
│   │   ├── sprint-1/iteration-{n}/
│   │   ├── sprint-2/iteration-{n}/
│   │   └── sprint-3/iteration-{n}/
│   └── phase-2/
│       ├── sprint-1/iteration-{n}/
│       └── sprint-2/iteration-{n}/
```

---

## The 3 Loops Explained

### Loop 1: Swarm Initialization (Setup Phase)

**Purpose**: Establish coordination infrastructure before spawning agents.

**When to Use**: ALWAYS when spawning multiple agents (2+).

**Process**:
```javascript
// MANDATORY: Initialize swarm BEFORE spawning agents
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",          // mesh (2-7 agents) | hierarchical (8+)
  maxAgents: 3,              // Must match actual agent count
  strategy: "balanced"       // balanced | adaptive
})

// THEN spawn all agents in SAME message
Task("Agent 1", "Specific task", "coder")
Task("Agent 2", "Specific task", "tester")
Task("Agent 3", "Specific task", "reviewer")
```

**Key Components**:
- **Topology Selection**:
  - `mesh`: Peer-to-peer (2-7 agents) - equal collaboration
  - `hierarchical`: Coordinator-led (8+ agents) - structured delegation
- **SwarmMemory Initialization**: Shared state across agents
- **Byzantine Consensus Setup**: Prepares voting infrastructure

**Without swarm_init**: Agents work independently → inconsistent solutions

**With swarm_init**: Agents coordinate → unified approach

---

### Loop 2: Execution Loop (Primary Development)

**Purpose**: Agents produce deliverables with self-validation.

**Participants**: 3-20 primary agents (coder, tester, backend-dev, etc.)

**Max Iterations**: **10 retries** (updated from 3)

**Process Flow (Self-Looping)**:

#### Step 2.1: Spawn Primary Agents (Autonomous Execution)
```javascript
[Single Message]:
  Task("Backend Dev", "Implement JWT auth with bcrypt", "backend-dev")
  Task("Security Analyst", "Security audit JWT implementation", "security-specialist")
  Task("Test Engineer", "Write integration tests for auth", "tester")

// Claude executes IMMEDIATELY - no wait for approval
```

**Agent Selection Guide**:
- **Simple tasks (3-5 steps)**: 2-3 agents (coder, tester, reviewer)
- **Medium tasks (6-10 steps)**: 4-6 agents (+ researcher, architect, security)
- **Complex tasks (11-20 steps)**: 8-12 agents (full specialist team)
- **Enterprise tasks (20+ steps)**: 15-20 agents (+ devops, api-docs, perf-analyzer)

#### Step 2.2: File Edit with Mandatory Post-Edit Hooks
```bash
# MANDATORY after EVERY file edit
npx enhanced-hooks post-edit "src/auth/jwt-handler.js" \
  --memory-key "swarm/backend-dev/jwt-auth" \
  --minimum-coverage 80 \
  --structured

# Validates:
# ✓ Syntax (prettier, eslint)
# ✓ Type checking (TypeScript, Flow)
# ✓ Security (XSS, secrets, SQL injection)
# ✓ Tests (Jest, Mocha, Cargo)
# ✓ Coverage (80% minimum)
# ✓ TDD compliance (Red-Green-Refactor)
```

**Hook Response Structure**:
```json
{
  "success": true,
  "file": "src/auth/jwt-handler.js",
  "validation": {
    "passed": true,
    "issues": [],
    "coverage": "advanced"
  },
  "formatting": {
    "needed": true,
    "changes": 5,
    "formatter": "prettier"
  },
  "testing": {
    "executed": true,
    "framework": "jest",
    "passed": 12,
    "failed": 0,
    "coverage": 85
  },
  "tddCompliance": {
    "hasTests": true,
    "coverage": 85,
    "phase": "green",
    "recommendations": []
  },
  "security": {
    "vulnerabilities": [],
    "warnings": ["Consider rate limiting for auth endpoints"]
  },
  "recommendations": [
    {
      "type": "security",
      "priority": "medium",
      "message": "Add rate limiting middleware",
      "action": "npm install express-rate-limit"
    }
  ],
  "memory": {
    "stored": true,
    "key": "swarm/backend-dev/jwt-auth"
  }
}
```

#### Step 2.3: Self-Validation & Confidence Scoring

**Each agent calculates confidence score**:

```javascript
// Confidence calculation formula
const confidence = calculateConfidence({
  testsPassed: true,        // Weight: 0.30
  coverage: 85,             // Weight: 0.25 (threshold: 80%)
  noSyntaxErrors: true,     // Weight: 0.15
  noSecurityIssues: true,   // Weight: 0.20
  formattingCorrect: true,  // Weight: 0.10
});

// Example: All criteria met
confidence = (0.30 * 1.0) + (0.25 * 1.0) + (0.15 * 1.0) + (0.20 * 1.0) + (0.10 * 1.0)
           = 1.0 (100%)

// Example: Low coverage (60%)
confidence = (0.30 * 1.0) + (0.25 * 0.75) + (0.15 * 1.0) + (0.20 * 1.0) + (0.10 * 1.0)
           = 0.8875 (88.75%)

// Example: Tests failing
confidence = (0.30 * 0.0) + (0.25 * 0.0) + (0.15 * 1.0) + (0.20 * 1.0) + (0.10 * 1.0)
           = 0.45 (45%) → RETRY REQUIRED
```

#### GATE 1: Self-Assessment Decision

**Threshold**: minimum confidence across ALL agents ≥ 0.75

```javascript
if (min(confidence_scores) >= 0.75) {
  // ✅ PASS: Proceed to Loop 3 (Consensus Verification)
  console.log("Self-validation passed. IMMEDIATELY proceeding to consensus...");
  enterLoop3();  // Autonomous continuation
} else {
  // ❌ FAIL: Collect feedback and IMMEDIATELY self-correct
  const feedback = collectFailedValidations();
  round++;

  if (round <= 10) {
    console.log(`Self-correcting iteration ${round}/10 - IMMEDIATELY relaunch Loop 2`);
    retryLoop2WithFeedback(feedback);  // NO WAIT - immediate continuation
  } else {
    console.log("Iteration limit reached. CONTINUE self-looping with guidance...");
    continueSelfLoopingWithGuidance();  // System continues autonomously
  }
}
```

**Feedback Injection Example**:
```javascript
// Failed validation from agent "Backend Dev"
const feedback = {
  agent: "backend-dev",
  confidence: 0.68,
  issues: [
    {
      type: "coverage",
      severity: "medium",
      message: "Coverage 72% below threshold (80%)",
      recommendation: "Add tests for error handling paths"
    },
    {
      type: "security",
      severity: "high",
      message: "JWT secret hardcoded in source",
      recommendation: "Move to environment variable process.env.JWT_SECRET"
    }
  ]
};

// Self-correction instructions for agent (IMMEDIATE continuation)
const selfCorrectionInstructions = `
SELF-CORRECTING ITERATION ${round}/3:

Previous attempt failed validation:
1. Coverage: 72% (need 80%+) → Add tests for error handling
2. Security: JWT secret hardcoded → Use process.env.JWT_SECRET

IMMEDIATELY apply these fixes. NO WAIT for approval - autonomous self-correction in progress.
`;
```

---

### Loop 3: Consensus Verification Loop

**Purpose**: Independent validators verify work via Byzantine consensus.

**Participants**: 2-4 validator agents (REQUIRED - no exceptions)

**Why Consensus Matters**: Prevents single-agent bias, catches integration issues, ensures multi-dimensional quality.

#### Step 3.1: Spawn Validator Swarm

```javascript
// MANDATORY: Spawn consensus validators
[Single Message]:
  Task("Validator 1", "Comprehensive quality review of JWT auth implementation", "reviewer")
  Task("Validator 2", "Security and performance audit of authentication flow", "security-specialist")
  Task("Validator 3", "Architecture validation for auth integration", "system-architect")
  Task("Validator 4", "Integration testing and regression checks", "tester")
```

**Validator Roles**:
- **reviewer**: Code quality, maintainability, design patterns
- **security-specialist**: Security vulnerabilities, best practices
- **system-architect**: Architecture consistency, scalability
- **tester**: Test completeness, edge cases, integration

#### Step 3.2: Multi-Dimensional Validation

**Each validator produces structured assessment**:

```javascript
// Validator assessment format
const validatorAssessment = {
  validatorId: "security-specialist",
  approve: true,
  confidence: 0.92,
  dimensions: {
    quality: {
      score: 0.90,
      issues: ["Consider extracting token generation to separate function"]
    },
    security: {
      score: 0.95,
      issues: [],
      warnings: ["Rate limiting recommended for production"]
    },
    performance: {
      score: 0.88,
      issues: ["JWT verification could be cached for 5 minutes"]
    },
    tests: {
      score: 0.94,
      coverage: 87,
      issues: [],
      edgeCases: ["Token expiration", "Invalid signatures", "Missing headers"]
    },
    documentation: {
      score: 0.85,
      issues: ["Add JSDoc comments for public API"]
    }
  },
  criticalIssues: [],
  recommendations: [
    "Add rate limiting middleware (express-rate-limit)",
    "Implement token refresh mechanism",
    "Add audit logging for authentication events"
  ]
};
```

#### Step 3.3: Byzantine Consensus Voting

**Voting Algorithm**:

```javascript
// Collect all validator assessments
const validators = [validator1, validator2, validator3, validator4];

// Calculate agreement rate
const approvals = validators.filter(v => v.approve).length;
const agreementRate = approvals / validators.length;

// Calculate average confidence
const avgConfidence = validators.reduce((sum, v) => sum + v.confidence, 0) / validators.length;

// Check critical criteria (ALL must pass)
const criticalPassing = validators.every(v => v.criticalIssues.length === 0);

// Byzantine consensus decision
const consensusResult = {
  agreementRate: agreementRate,        // e.g., 1.0 (100%)
  averageConfidence: avgConfidence,    // e.g., 0.92 (92%)
  criticalPassing: criticalPassing,    // true
  decision: (
    agreementRate >= 0.90 &&
    avgConfidence >= 0.90 &&
    criticalPassing
  ) ? 'PASS' : 'FAIL'
};
```

**Example Scenarios**:

**Scenario 1: Unanimous Approval**
```javascript
{
  validators: [
    { approve: true, confidence: 0.95 },
    { approve: true, confidence: 0.93 },
    { approve: true, confidence: 0.91 },
    { approve: true, confidence: 0.94 }
  ],
  agreementRate: 1.0,          // 100%
  averageConfidence: 0.9325,   // 93.25%
  decision: "PASS"             // ✅
}
```

**Scenario 2: Partial Disagreement**
```javascript
{
  validators: [
    { approve: true, confidence: 0.88 },
    { approve: true, confidence: 0.85 },
    { approve: false, confidence: 0.72 },  // Security concerns
    { approve: true, confidence: 0.90 }
  ],
  agreementRate: 0.75,         // 75% (below 90% threshold)
  averageConfidence: 0.8375,   // 83.75%
  decision: "FAIL"             // ❌ → Retry with feedback
}
```

**Scenario 3: Critical Issue Block**
```javascript
{
  validators: [
    { approve: true, confidence: 0.95, criticalIssues: [] },
    { approve: true, confidence: 0.93, criticalIssues: ["SQL Injection vulnerability"] },
    { approve: true, confidence: 0.91, criticalIssues: [] },
    { approve: true, confidence: 0.94, criticalIssues: [] }
  ],
  agreementRate: 1.0,          // 100%
  averageConfidence: 0.9325,   // 93.25%
  criticalPassing: false,      // ❌ Critical issue detected
  decision: "FAIL"             // ❌ → MUST fix before proceeding
}
```

#### GATE 2: Consensus Decision & Action

**PASS Criteria**:
- Agreement Rate ≥ 90%
- Average Confidence ≥ 90%
- All critical criteria passing

**PASS Action**:
```javascript
if (consensusResult.decision === 'PASS') {
  // 1. Store results in SwarmMemory
  await swarmMemory.store(`consensus/${taskId}`, {
    timestamp: Date.now(),
    agreementRate: consensusResult.agreementRate,
    avgConfidence: consensusResult.averageConfidence,
    validators: validators,
    recommendations: aggregateRecommendations(validators)
  });

  // 2. Update documentation (if required)
  if (taskRequiresDocumentation) {
    await updateDocumentation(validators);
  }

  // 3. Exit with Next Steps Guidance
  return nextStepsGuidance({
    completed: "JWT authentication implementation",
    validationResults: {
      confidence: 0.9325,
      coverage: 87,
      consensusApproval: true
    },
    identifiedIssues: [
      "Rate limiting recommended for production"
    ],
    nextSteps: [
      "Implement token refresh mechanism",
      "Add audit logging for authentication",
      "Deploy to staging environment"
    ]
  });
}
```

**FAIL Action**:
```javascript
if (consensusResult.decision === 'FAIL') {
  // 1. Aggregate validator feedback
  const feedback = aggregateFeedback(validators);

  // 2. Increment round counter
  round++;

  // 3. Check iteration limit
  if (round <= 10) {
    console.log(`Consensus failed. Retry ${round}/10 with validator feedback`);

    // 4. Inject feedback into Loop 2 (re-execute primary swarm)
    return retryLoop2WithFeedback({
      source: "consensus-validators",
      agreementRate: consensusResult.agreementRate,
      avgConfidence: consensusResult.averageConfidence,
      issues: feedback.criticalIssues,
      recommendations: feedback.recommendations
    });
  } else {
    // 5. Max iterations exceeded - escalate to human
    console.log("Max consensus iterations exceeded. Escalating...");
    return escalateWithNextSteps({
      reason: "Consensus not achieved after 10 rounds",
      lastAgreementRate: consensusResult.agreementRate,
      lastConfidence: consensusResult.averageConfidence,
      blockers: feedback.criticalIssues
    });
  }
}
```

---

## Confidence Scoring System

### Overview

**Confidence scores** quantify agent certainty about deliverable quality.

- **Range**: 0.0 (no confidence) to 1.0 (complete confidence)
- **Threshold (Self-validation)**: 0.75 (75%)
- **Threshold (Consensus)**: 0.90 (90%)

### Calculation Formula

**Self-Validation Confidence** (per agent):

```javascript
function calculateSelfConfidence(validationResults) {
  const weights = {
    testsPassed: 0.30,      // Critical: all tests must pass
    coverage: 0.25,         // Important: ≥80% coverage
    syntax: 0.15,           // Basic: no syntax/type errors
    security: 0.20,         // Critical: no vulnerabilities
    formatting: 0.10        // Style: code formatting
  };

  let score = 0;

  // Tests: binary (pass/fail)
  score += validationResults.testsPassed ? weights.testsPassed : 0;

  // Coverage: linear scale (80% threshold)
  const coverageScore = validationResults.coverage >= 80 ? 1.0 : validationResults.coverage / 80;
  score += weights.coverage * coverageScore;

  // Syntax: binary
  score += validationResults.noSyntaxErrors ? weights.syntax : 0;

  // Security: weighted by severity
  const securityScore = calculateSecurityScore(validationResults.securityIssues);
  score += weights.security * securityScore;

  // Formatting: binary
  score += validationResults.formattingCorrect ? weights.formatting : 0;

  return score;
}

function calculateSecurityScore(issues) {
  if (issues.length === 0) return 1.0;

  // Penalize by severity
  const severityWeights = { critical: 1.0, high: 0.5, medium: 0.2, low: 0.1 };
  const totalPenalty = issues.reduce((sum, issue) =>
    sum + (severityWeights[issue.severity] || 0), 0
  );

  // Maximum penalty: 1.0 (no confidence)
  return Math.max(0, 1.0 - totalPenalty);
}
```

**Consensus Confidence** (aggregate):

```javascript
function calculateConsensusConfidence(validators) {
  // Average confidence across all validators
  const avgConfidence = validators.reduce((sum, v) =>
    sum + v.confidence, 0
  ) / validators.length;

  // Agreement rate (percentage approving)
  const agreementRate = validators.filter(v => v.approve).length / validators.length;

  // Combined score (weighted average)
  const consensusConfidence = (avgConfidence * 0.6) + (agreementRate * 0.4);

  return {
    averageConfidence: avgConfidence,
    agreementRate: agreementRate,
    consensusConfidence: consensusConfidence
  };
}
```

### Confidence Score Examples

**Example 1: High Confidence (Pass)**
```javascript
{
  testsPassed: true,          // 0.30
  coverage: 92,               // 0.25 (92/80 = 1.0 capped)
  noSyntaxErrors: true,       // 0.15
  securityIssues: [],         // 0.20
  formattingCorrect: true,    // 0.10
  // Total: 1.00 (100%)
}
```

**Example 2: Moderate Confidence (Pass)**
```javascript
{
  testsPassed: true,          // 0.30
  coverage: 82,               // 0.25 (82/80 = 1.0 capped)
  noSyntaxErrors: true,       // 0.15
  securityIssues: [
    { severity: "low" }       // 0.20 * 0.9 = 0.18
  ],
  formattingCorrect: true,    // 0.10
  // Total: 0.98 (98%)
}
```

**Example 3: Low Confidence (Fail - Retry Required)**
```javascript
{
  testsPassed: true,          // 0.30
  coverage: 65,               // 0.25 * (65/80) = 0.203
  noSyntaxErrors: true,       // 0.15
  securityIssues: [
    { severity: "high" }      // 0.20 * 0.5 = 0.10
  ],
  formattingCorrect: true,    // 0.10
  // Total: 0.753 → Below threshold (0.75) → RETRY
}
```

**Example 4: Critical Failure (Fail - Block)**
```javascript
{
  testsPassed: false,         // 0.00 (critical failure)
  coverage: 45,               // 0.25 * (45/80) = 0.141
  noSyntaxErrors: false,      // 0.00
  securityIssues: [
    { severity: "critical" }  // 0.20 * 0.0 = 0.00
  ],
  formattingCorrect: false,   // 0.00
  // Total: 0.141 → BLOCK (multiple critical issues)
}
```

### Adjusting Confidence Thresholds

**When to Lower Thresholds** (not recommended):
- Prototyping / proof-of-concept work
- Non-production experimentation
- Learning exercises

**When to Raise Thresholds**:
- Production-critical systems
- Security-sensitive applications
- Compliance-regulated code (finance, healthcare)
- Public APIs

**Configuration Example**:
```javascript
// config/cfn-loop-config.js
export const CFN_CONFIG = {
  selfValidation: {
    confidenceThreshold: 0.75,    // Default: 75%
    maxRetries: 3,
    weights: {
      testsPassed: 0.30,
      coverage: 0.25,
      syntax: 0.15,
      security: 0.20,
      formatting: 0.10
    }
  },
  consensus: {
    agreementThreshold: 0.90,     // Default: 90%
    confidenceThreshold: 0.90,    // Default: 90%
    maxRounds: 10,
    minValidators: 2,
    maxValidators: 4
  }
};
```

---

## Memory Namespacing Strategy

### SwarmMemory Architecture

**Purpose**: Enable cross-agent coordination and learning through shared state.

**Storage Location**: `.swarm/swarm-memory.db` (SQLite)

**Namespace Hierarchy**:

```
swarm/
├── {swarm-id}/
│   ├── agents/
│   │   ├── {agent-id}/
│   │   │   ├── tasks/
│   │   │   │   ├── {task-id}/
│   │   │   │   │   ├── deliverables
│   │   │   │   │   ├── confidence
│   │   │   │   │   ├── validation
│   │   │   │   │   └── feedback
│   │   │   ├── learning/
│   │   │   │   ├── patterns
│   │   │   │   ├── errors
│   │   │   │   └── successes
│   │   │   └── metrics
│   ├── consensus/
│   │   ├── {round-id}/
│   │   │   ├── validators
│   │   │   ├── votes
│   │   │   ├── agreement
│   │   │   └── decision
│   ├── iterations/
│   │   ├── round-{n}/
│   │   │   ├── feedback
│   │   │   ├── changes
│   │   │   └── improvements
│   └── results/
│       ├── final-deliverable
│       ├── validation-summary
│       └── next-steps
```

### Memory Key Patterns

**Agent Task Memory**:
```javascript
// Format: swarm/{agent-id}/{task-name}
const key = "swarm/backend-dev/jwt-auth";

await swarmMemory.store(key, {
  timestamp: Date.now(),
  agent: "backend-dev",
  task: "jwt-auth",
  deliverables: {
    files: ["src/auth/jwt-handler.js", "tests/auth/jwt.test.js"],
    linesChanged: 247
  },
  validation: {
    confidence: 0.92,
    coverage: 87,
    passed: true
  },
  issues: [],
  recommendations: ["Add rate limiting"]
});
```

**Consensus Round Memory**:
```javascript
// Format: swarm/consensus/{task-id}/round-{n}
const key = "swarm/consensus/jwt-auth/round-1";

await swarmMemory.store(key, {
  round: 1,
  validators: [
    { id: "reviewer", approve: true, confidence: 0.93 },
    { id: "security", approve: true, confidence: 0.95 },
    { id: "architect", approve: true, confidence: 0.91 },
    { id: "tester", approve: true, confidence: 0.94 }
  ],
  agreementRate: 1.0,
  avgConfidence: 0.9325,
  decision: "PASS"
});
```

**Iteration Feedback Memory**:
```javascript
// Format: swarm/iterations/round-{n}/feedback
const key = "swarm/iterations/round-2/feedback";

await swarmMemory.store(key, {
  round: 2,
  source: "consensus-validators",
  aggregatedFeedback: {
    criticalIssues: ["JWT secret hardcoded"],
    recommendations: [
      "Use environment variable for JWT_SECRET",
      "Add token refresh mechanism"
    ]
  },
  targetAgents: ["backend-dev"],
  status: "injected"
});
```

**Learning Patterns Memory**:
```javascript
// Format: swarm/{agent-id}/learning/patterns
const key = "swarm/backend-dev/learning/patterns";

await swarmMemory.store(key, {
  successPatterns: [
    {
      pattern: "JWT authentication",
      approach: "bcrypt + jsonwebtoken",
      confidence: 0.95,
      occurrences: 3
    }
  ],
  commonErrors: [
    {
      error: "Hardcoded secrets",
      solution: "Environment variables",
      occurrences: 5
    }
  ],
  retryEffectiveness: {
    round1Success: 0.45,
    round2Success: 0.78,
    round3Success: 0.92
  }
});
```

### Memory Access Patterns

**Store Operation**:
```javascript
import { SwarmMemory } from '../memory/swarm-memory.js';

const memory = new SwarmMemory({
  swarmId: 'jwt-auth-swarm',
  directory: '.swarm',
  filename: 'swarm-memory.db'
});

await memory.initialize();

await memory.store('swarm/backend-dev/jwt-auth', {
  confidence: 0.92,
  deliverables: ['jwt-handler.js']
});
```

**Retrieve Operation**:
```javascript
// Retrieve specific task data
const taskData = await memory.retrieve('swarm/backend-dev/jwt-auth');

// Retrieve all agent tasks
const agentTasks = await memory.search('swarm/backend-dev/*');

// Retrieve consensus history
const consensusHistory = await memory.search('swarm/consensus/*/round-*');
```

**Search Operation**:
```javascript
// Find all high-confidence tasks
const highConfidenceTasks = await memory.search('swarm/*/tasks/*', {
  filter: (data) => data.validation?.confidence >= 0.90
});

// Find all failed consensus rounds
const failedRounds = await memory.search('swarm/consensus/*/round-*', {
  filter: (data) => data.decision === 'FAIL'
});
```

### Memory Coordination Benefits

1. **Cross-Agent Learning**: Agents share successful patterns and avoid repeated errors
2. **Feedback Loop**: Validators access primary agent work for informed reviews
3. **Iteration Tracking**: System tracks improvement across retry rounds
4. **Consensus History**: Audit trail of all validation decisions
5. **Performance Analytics**: Identify bottlenecks and optimization opportunities

---

## Iteration Limits & Escalation

### Iteration Limits

**Self-Validation Loop (Loop 2)**:
- **Max Retries**: 10 attempts (updated from 3)
- **Escalation**: After 10 failures, proceed to consensus with warnings

**Consensus Loop (Loop 3)**:
- **Max Rounds**: 10 iterations
- **Escalation**: After 10 failures, escalate to human with Next Steps Guidance

**Why These Limits?**:
- **10 self-validation retries**: Allows more sophisticated self-correction with feedback
- **10 consensus rounds**: Prevents infinite loops while allowing complex issue resolution
- **Total maximum**: 10 × 10 = 100 potential iterations (covers complex enterprise scenarios)

### Escalation Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Self-Validation Retry Flow (Max 3)                      │
└─────────────────────────────────────────────────────────┘
         │
         ▼
    Round 1: Initial attempt
         │
         ▼
    Confidence < 0.75?
         │
         ├─ NO → Proceed to Consensus ✅
         │
         └─ YES → Collect feedback
                  │
                  ▼
    Round 2: Retry with feedback
         │
         ▼
    Confidence < 0.75?
         │
         ├─ NO → Proceed to Consensus ✅
         │
         └─ YES → Collect feedback
                  │
                  ▼
    Round 3: Final retry with enhanced feedback
         │
         ▼
    Confidence < 0.75?
         │
         ├─ NO → Proceed to Consensus ✅
         │
         └─ YES → Proceed to Consensus with warnings ⚠️

┌─────────────────────────────────────────────────────────┐
│ Consensus Retry Flow (Max 10)                           │
└─────────────────────────────────────────────────────────┘
         │
         ▼
    Round 1: Initial consensus validation
         │
         ▼
    Agreement < 90% OR Critical Issues?
         │
         ├─ NO → Success! Store results ✅
         │
         └─ YES → Aggregate validator feedback
                  │
                  ▼
    Inject feedback → Return to Loop 2
         │
         ▼
    Round 2-9: Retry execution with validator feedback
         │
         ▼
    Agreement ≥ 90% AND No Critical Issues?
         │
         ├─ YES → Success! Store results ✅
         │
         └─ NO → Continue iterations
                  │
                  ▼
    Round 10: Final attempt
         │
         ▼
    Agreement ≥ 90% AND No Critical Issues?
         │
         ├─ YES → Success! Store results ✅
         │
         └─ NO → ESCALATE TO HUMAN 🚨
```

### Escalation Triggers

**Automatic Escalation Conditions**:
1. **Self-validation failures**: 3 consecutive rounds below confidence threshold
2. **Consensus failures**: 10 rounds without ≥90% agreement
3. **Critical blocking issues**: Security vulnerabilities, test failures blocking deployment
4. **Timeout**: Task exceeds time budget (configurable)
5. **Resource exhaustion**: System resources depleted

**Manual Escalation Conditions**:
1. **Human intervention requested**: Agent explicitly requests human review
2. **Ambiguous requirements**: Conflicting validator feedback
3. **Novel problem domain**: No similar patterns in learning history

### Next Steps Guidance Format

**When escalating to human, provide structured guidance**:

```javascript
const nextStepsGuidance = {
  status: "ESCALATED",
  reason: "Consensus not achieved after 10 rounds",

  // Section 1: What was completed
  completed: {
    summary: "JWT authentication implementation with bcrypt",
    deliverables: [
      "src/auth/jwt-handler.js (247 lines)",
      "tests/auth/jwt.test.js (182 lines)"
    ],
    filesModified: 2,
    testsAdded: 15
  },

  // Section 2: Validation results
  validationResults: {
    selfValidation: {
      finalConfidence: 0.72,
      attempts: 3,
      lastIssues: ["Coverage 68% below threshold (80%)"]
    },
    consensus: {
      rounds: 10,
      lastAgreementRate: 0.75,
      lastAvgConfidence: 0.82,
      validatorsApproving: [
        { id: "reviewer", confidence: 0.88 },
        { id: "tester", confidence: 0.85 }
      ],
      validatorsRejecting: [
        { id: "security-specialist", confidence: 0.65, reason: "Rate limiting missing" },
        { id: "system-architect", confidence: 0.72, reason: "Token refresh not implemented" }
      ]
    },
    coverage: 68,
    testsPassing: 15,
    testsFailing: 0
  },

  // Section 3: Identified issues
  identifiedIssues: [
    {
      severity: "high",
      type: "security",
      message: "Rate limiting missing for authentication endpoints",
      impact: "Susceptible to brute-force attacks",
      blocksConsensus: true
    },
    {
      severity: "medium",
      type: "feature",
      message: "Token refresh mechanism not implemented",
      impact: "Users must re-authenticate frequently",
      blocksConsensus: true
    },
    {
      severity: "medium",
      type: "coverage",
      message: "Test coverage 68% below threshold (80%)",
      impact: "Insufficient test protection",
      blocksConsensus: false
    }
  ],

  // Section 4: Recommended next steps
  recommendedNextSteps: [
    {
      priority: "critical",
      action: "Implement rate limiting middleware",
      rationale: "Blocks consensus (security concern)",
      estimatedEffort: "1-2 hours",
      implementation: [
        "npm install express-rate-limit",
        "Add rate limiting to /auth/login endpoint (max 5 attempts per 15 minutes)",
        "Add rate limiting to /auth/register (max 3 attempts per hour)"
      ]
    },
    {
      priority: "high",
      action: "Implement token refresh mechanism",
      rationale: "Blocks consensus (architecture requirement)",
      estimatedEffort: "2-3 hours",
      implementation: [
        "Add refresh token generation alongside access token",
        "Create /auth/refresh endpoint",
        "Store refresh tokens securely (e.g., Redis with TTL)"
      ]
    },
    {
      priority: "medium",
      action: "Increase test coverage to 80%+",
      rationale: "Quality requirement for self-validation",
      estimatedEffort: "1-2 hours",
      implementation: [
        "Add tests for error handling paths",
        "Add tests for edge cases (expired tokens, malformed headers)",
        "Add integration tests for refresh token flow"
      ]
    }
  ],

  // Debugging information
  debugInfo: {
    swarmId: "jwt-auth-swarm",
    topology: "mesh",
    primaryAgents: 3,
    validators: 4,
    totalRounds: 10,
    memoryKeys: [
      "swarm/backend-dev/jwt-auth",
      "swarm/consensus/jwt-auth/round-10"
    ]
  }
};

// Output to console and store in memory
console.log(JSON.stringify(nextStepsGuidance, null, 2));
await swarmMemory.store('swarm/escalation/jwt-auth', nextStepsGuidance);
```

### Human Decision Points

**After receiving Next Steps Guidance, human can**:

1. **Accept Partial Completion**:
   - Merge completed work
   - Create follow-up tasks for remaining issues
   - Document technical debt

2. **Revise Requirements**:
   - Adjust confidence thresholds
   - Modify acceptance criteria
   - Relax coverage requirements

3. **Provide Additional Context**:
   - Clarify ambiguous requirements
   - Provide domain expertise
   - Suggest alternative approaches

4. **Restart CFN Loop**:
   - Apply recommended fixes manually or via agents
   - Re-initialize swarm with updated context
   - Resume at Loop 2 or Loop 3

---

## Example Workflows

### Example 1: Simple Feature (3 Agents)

**Task**: Add user profile endpoint to REST API

**Complexity**: Simple (3-5 steps)

**Agent Team**: 3 agents (coder, tester, reviewer)

#### Full Workflow

**Loop 1: Swarm Initialization**
```javascript
[Single Message]:
  // Step 1: Initialize swarm
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  // Step 2: Spawn agents
  Task("Backend Coder", `
    Implement GET /api/users/:id endpoint:
    - Retrieve user profile from database
    - Return JSON response with user data
    - Handle user not found (404)
    - Add input validation for user ID
  `, "coder")

  Task("Test Engineer", `
    Write integration tests for /api/users/:id:
    - Test successful user retrieval
    - Test user not found (404)
    - Test invalid user ID format
    - Achieve 80%+ coverage
  `, "tester")

  Task("Code Reviewer", `
    Review implementation for:
    - Code quality and maintainability
    - Error handling completeness
    - API design consistency
    - Security best practices
  `, "reviewer")
```

**Loop 2: Execution (Round 1)**

*Agent: Backend Coder*
```bash
# Edit file
# File: src/routes/users.js
# Added: GET /api/users/:id endpoint (45 lines)

# MANDATORY: Run post-edit hook
npx enhanced-hooks post-edit "src/routes/users.js" \
  --memory-key "swarm/backend-coder/user-profile" \
  --structured
```

**Hook Response**:
```json
{
  "success": true,
  "validation": { "passed": true },
  "testing": { "passed": 0, "failed": 0, "coverage": 0 },
  "recommendations": [
    { "type": "test", "message": "No tests found for this file" }
  ]
}
```

**Self-Validation**:
```javascript
// Backend Coder confidence
{
  testsPassed: false,        // 0.00 (no tests yet)
  coverage: 0,               // 0.00
  noSyntaxErrors: true,      // 0.15
  securityIssues: [],        // 0.20
  formattingCorrect: true,   // 0.10
  confidence: 0.45           // ❌ Below threshold (0.75)
}
```

*Agent: Test Engineer*
```bash
# Edit file
# File: tests/routes/users.test.js
# Added: Integration tests for user endpoint (98 lines)

# MANDATORY: Run post-edit hook
npx enhanced-hooks post-edit "tests/routes/users.test.js" \
  --memory-key "swarm/test-engineer/user-profile" \
  --structured
```

**Hook Response**:
```json
{
  "success": true,
  "testing": {
    "framework": "jest",
    "passed": 5,
    "failed": 0,
    "coverage": 87
  }
}
```

**Self-Validation**:
```javascript
// Test Engineer confidence
{
  testsPassed: true,         // 0.30
  coverage: 87,              // 0.25
  noSyntaxErrors: true,      // 0.15
  securityIssues: [],        // 0.20
  formattingCorrect: true,   // 0.10
  confidence: 1.00           // ✅ Pass
}
```

*Agent: Code Reviewer*
```javascript
// Reviewer performs static analysis
{
  confidence: 0.88           // ✅ Pass
}
```

**GATE 1: Self-Assessment**
```javascript
minConfidence = min(0.45, 1.00, 0.88) = 0.45
// ❌ FAIL: Below threshold (0.75)
// → Round 2 with feedback
```

**Loop 2: Execution (Round 2 with Feedback)**

*Feedback to Backend Coder*:
```
Previous validation failed:
- No tests found for src/routes/users.js
- Work with Test Engineer to ensure tests cover your implementation
```

*Backend Coder re-runs post-edit hook after Test Engineer adds tests*
```bash
npx enhanced-hooks post-edit "src/routes/users.js" \
  --memory-key "swarm/backend-coder/user-profile" \
  --structured
```

**Updated Self-Validation**:
```javascript
// Backend Coder confidence (after tests added)
{
  testsPassed: true,         // 0.30
  coverage: 87,              // 0.25
  noSyntaxErrors: true,      // 0.15
  securityIssues: [],        // 0.20
  formattingCorrect: true,   // 0.10
  confidence: 1.00           // ✅ Pass
}

minConfidence = min(1.00, 1.00, 0.88) = 0.88
// ✅ PASS: Proceed to Loop 3
```

**Loop 3: Consensus Verification**

```javascript
[Single Message]:
  Task("Quality Reviewer", "Comprehensive quality review", "reviewer")
  Task("Security Auditor", "Security and performance audit", "security-specialist")
```

**Validator Assessments**:
```javascript
// Quality Reviewer
{
  approve: true,
  confidence: 0.92,
  issues: ["Consider extracting validation logic to middleware"]
}

// Security Auditor
{
  approve: true,
  confidence: 0.95,
  issues: []
}
```

**GATE 2: Consensus Decision**
```javascript
{
  agreementRate: 1.0,        // 100%
  avgConfidence: 0.935,      // 93.5%
  decision: "PASS"           // ✅
}
```

**Exit: Next Steps Guidance**
```javascript
{
  completed: "User profile endpoint (GET /api/users/:id)",
  validationResults: {
    confidence: 0.935,
    coverage: 87,
    consensusApproval: true
  },
  identifiedIssues: [],
  nextSteps: [
    "Consider extracting validation logic to reusable middleware",
    "Add user profile update endpoint (PUT /api/users/:id)",
    "Deploy to staging environment"
  ]
}
```

**Total Rounds**: 2 (1 retry in Loop 2, 1 consensus pass)

---

### Example 2: Medium Complexity (6 Agents)

**Task**: Implement real-time chat feature with WebSockets

**Complexity**: Medium (6-10 steps)

**Agent Team**: 6 agents (backend-dev, frontend-dev, tester, security-specialist, reviewer, api-docs)

#### Full Workflow

**Loop 1: Swarm Initialization**
```javascript
[Single Message]:
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 6,
    strategy: "balanced"
  })

  Task("Backend Developer", "Implement WebSocket server with socket.io", "backend-dev")
  Task("Frontend Developer", "Implement WebSocket client and chat UI", "frontend-dev")
  Task("Test Engineer", "Write integration tests for WebSocket flow", "tester")
  Task("Security Specialist", "Audit WebSocket security and authentication", "security-specialist")
  Task("Code Reviewer", "Review code quality and architecture", "reviewer")
  Task("API Documenter", "Document WebSocket API and events", "api-docs")
```

**Loop 2: Execution (Round 1)**

*All 6 agents work concurrently, each editing their files and running post-edit hooks*

**Self-Validation Results** (Round 1):
```javascript
{
  "backend-dev": { confidence: 0.82 },
  "frontend-dev": { confidence: 0.78 },
  "tester": { confidence: 0.85 },
  "security-specialist": { confidence: 0.68 },  // ❌ Below threshold
  "reviewer": { confidence: 0.88 },
  "api-docs": { confidence: 0.92 }
}

minConfidence = 0.68
// ❌ FAIL: Security concerns identified
// Feedback: "WebSocket connections lack authentication middleware"
```

**Loop 2: Execution (Round 2 with Feedback)**

*Feedback injected to Backend Developer*:
```
Security validation failed:
- WebSocket connections lack authentication middleware
- Implement JWT verification before accepting socket connections
```

*Backend Developer adds authentication*
```javascript
// Updated self-validation
{
  "backend-dev": { confidence: 0.95 },
  "security-specialist": { confidence: 0.91 }  // ✅ Now passes
}

minConfidence = 0.78
// ✅ PASS: Proceed to Loop 3
```

**Loop 3: Consensus Verification**

```javascript
[Single Message]:
  Task("Quality Reviewer", "Comprehensive review", "reviewer")
  Task("Security Auditor", "Security audit", "security-specialist")
  Task("System Architect", "Architecture validation", "system-architect")
  Task("Integration Tester", "End-to-end testing", "tester")
```

**Consensus Result**:
```javascript
{
  agreementRate: 1.0,        // 100% (4/4 approve)
  avgConfidence: 0.9125,     // 91.25%
  decision: "PASS"           // ✅
}
```

**Total Rounds**: 2 (1 retry in Loop 2, 1 consensus pass)

---

### Example 3: Complex System (12+ Agents)

**Task**: Build microservices API gateway with authentication, rate limiting, and monitoring

**Complexity**: Complex (11-20 steps)

**Agent Team**: 12 agents (backend-dev, system-architect, devops-engineer, security-specialist, perf-analyzer, tester, api-docs, database-specialist, monitoring-specialist, reviewer, network-engineer, compliance-auditor)

#### Full Workflow

**Loop 1: Swarm Initialization**
```javascript
[Single Message]:
  mcp__claude-flow-novice__swarm_init({
    topology: "hierarchical",  // 12 agents → use hierarchical
    maxAgents: 12,
    strategy: "adaptive"       // Complex task → adaptive strategy
  })

  Task("System Architect", "Design API gateway architecture", "system-architect")
  Task("Backend Developer", "Implement gateway routing logic", "backend-dev")
  Task("Security Specialist", "Implement JWT auth and encryption", "security-specialist")
  Task("Network Engineer", "Configure load balancing and proxying", "network-engineer")
  Task("DevOps Engineer", "Setup Docker and Kubernetes deployment", "devops-engineer")
  Task("Database Specialist", "Design rate limiting storage (Redis)", "database-specialist")
  Task("Performance Analyzer", "Optimize request latency and throughput", "perf-analyzer")
  Task("Monitoring Specialist", "Setup Prometheus and Grafana dashboards", "monitoring-specialist")
  Task("Test Engineer", "Write integration and load tests", "tester")
  Task("API Documenter", "Document gateway endpoints and configuration", "api-docs")
  Task("Compliance Auditor", "Ensure GDPR and security compliance", "compliance-auditor")
  Task("Code Reviewer", "Review overall quality and consistency", "reviewer")
```

**Loop 2: Execution (Round 1-5)**

*Due to complexity, multiple rounds required for coordination*

**Round 1**: Architecture design and initial implementation
**Round 2**: Security hardening after security audit feedback
**Round 3**: Performance optimization after load testing
**Round 4**: Configuration refinement after devops feedback
**Round 5**: Final integration and documentation updates

**Self-Validation Results** (Round 5):
```javascript
{
  minConfidence: 0.87,       // ✅ All agents above 0.75
  avgConfidence: 0.91
}
// ✅ PASS: Proceed to Loop 3
```

**Loop 3: Consensus Verification (Round 1-3)**

**Round 1**: Initial consensus with 75% agreement (below threshold)
**Round 2**: Re-validation after addressing feedback (85% agreement)
**Round 3**: Final consensus with full alignment

**Consensus Result** (Round 3):
```javascript
{
  agreementRate: 0.95,       // 95% (19/20 validator assessments approve)
  avgConfidence: 0.93,       // 93%
  decision: "PASS"           // ✅
}
```

**Total Rounds**: 5 (Loop 2) + 3 (Loop 3) = 8 total iterations

---

## Integration Guide

### Using the CFN Loop

#### Option 1: Via `/cfn-loop` Slash Command (Recommended)

```bash
# Auto-detected project type and complexity
/cfn-loop "Implement user authentication with JWT"

# With explicit configuration
/cfn-loop "Build real-time chat" --agents 6 --topology mesh --confidence 0.80

# Complex task with custom thresholds
/cfn-loop "Build microservices gateway" \
  --agents 12 \
  --topology hierarchical \
  --consensus-threshold 0.95 \
  --max-rounds 15
```

**Slash Command Options**:
- `--agents <N>`: Number of primary agents (default: auto-detect from task)
- `--topology <type>`: mesh | hierarchical (default: auto-select)
- `--confidence <N>`: Self-validation threshold (default: 0.75)
- `--consensus-threshold <N>`: Consensus threshold (default: 0.90)
- `--max-rounds <N>`: Max consensus rounds (default: 10)
- `--coverage <N>`: Minimum test coverage % (default: 80)

#### Option 2: Via CLAUDE.md Prompting Pattern

**Add to your prompt**:
```markdown
**Task**: Implement user authentication with JWT

**Requirements**:
- Use CFN Loop for quality assurance
- Minimum 80% test coverage
- Security audit required
- Deploy to staging after validation

**Agent Team**: backend-dev, security-specialist, tester, reviewer
```

**Claude will automatically**:
1. Initialize swarm with appropriate topology
2. Spawn agents with specific instructions
3. Run post-edit hooks after file changes
4. Execute self-validation loops
5. Spawn consensus validators
6. Provide Next Steps Guidance

#### Option 3: Manual Execution Pattern

**Full manual control**:

```javascript
// Step 1: Initialize swarm
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 3,
  strategy: "balanced"
})

// Step 2: Spawn primary agents
Task("Agent 1", "Task 1 instructions", "type1")
Task("Agent 2", "Task 2 instructions", "type2")
Task("Agent 3", "Task 3 instructions", "type3")

// Step 3: Monitor self-validation
// (Agents automatically run post-edit hooks)

// Step 4: Check confidence scores
// (System automatically gates on threshold)

// Step 5: Spawn consensus validators
Task("Validator 1", "Quality review", "reviewer")
Task("Validator 2", "Security audit", "security-specialist")

// Step 6: Monitor consensus decision
// (System automatically decides PASS/FAIL)
```

### Configuring the CFN Loop

**Configuration File**: `config/cfn-loop-config.js`

```javascript
export const CFN_CONFIG = {
  // Self-validation settings
  selfValidation: {
    confidenceThreshold: 0.75,
    maxRetries: 3,
    minimumCoverage: 80,
    enableTDD: true,
    enableSecurity: true,
    blockOnCritical: true,
    weights: {
      testsPassed: 0.30,
      coverage: 0.25,
      syntax: 0.15,
      security: 0.20,
      formatting: 0.10
    }
  },

  // Consensus settings
  consensus: {
    agreementThreshold: 0.90,
    confidenceThreshold: 0.90,
    maxRounds: 10,
    minValidators: 2,
    maxValidators: 4,
    validatorTypes: [
      "reviewer",
      "security-specialist",
      "system-architect",
      "tester"
    ]
  },

  // Memory settings
  memory: {
    directory: ".swarm",
    filename: "swarm-memory.db",
    enableLearning: true,
    retentionDays: 30
  },

  // Escalation settings
  escalation: {
    enableAutoEscalation: true,
    notificationChannels: ["console", "file"],
    nextStepsFormat: "structured-json"
  }
};
```

### Monitoring CFN Loop Execution

**Real-time monitoring via MCP tools**:

```javascript
// Check swarm status
mcp__claude-flow-novice__swarm_status({
  swarmId: "jwt-auth-swarm"
})

// Get agent metrics
mcp__claude-flow-novice__agent_metrics({
  agentId: "backend-dev"
})

// Retrieve task results
mcp__claude-flow-novice__task_results({
  taskId: "jwt-auth"
})

// Search memory
mcp__claude-flow-novice__memory_search({
  pattern: "swarm/*/confidence"
})
```

**Output Example**:
```json
{
  "swarmId": "jwt-auth-swarm",
  "status": "consensus-verification",
  "topology": "mesh",
  "agents": [
    { "id": "backend-dev", "status": "completed", "confidence": 0.92 },
    { "id": "tester", "status": "completed", "confidence": 0.87 },
    { "id": "reviewer", "status": "completed", "confidence": 0.88 }
  ],
  "currentRound": 1,
  "currentLoop": "consensus",
  "validators": [
    { "id": "reviewer", "status": "validating" },
    { "id": "security-specialist", "status": "validating" }
  ]
}
```

---

## Best Practices

### 1. Agent Selection

**DO**:
- ✅ Select agents based on specific task needs
- ✅ Use specialist agents (security-specialist, perf-analyzer)
- ✅ Include tester agent for ALL development tasks
- ✅ Match agent count to task complexity (3-5-8-12 pattern)

**DON'T**:
- ❌ Use generic "agent1", "agent2" naming
- ❌ Skip security-specialist for auth/payment features
- ❌ Spawn more agents than necessary (creates coordination overhead)
- ❌ Use hierarchical topology for <8 agents (overkill)

### 2. Confidence Threshold Tuning

**When to Lower (0.70-0.75)**:
- Prototyping / exploratory work
- Early-stage development
- Non-critical features

**When to Raise (0.80-0.85)**:
- Production systems
- Security-critical components
- Public APIs

**When to Maximize (0.90-0.95)**:
- Financial systems
- Healthcare applications
- Compliance-regulated code

### 3. Effective Feedback Writing

**Good Feedback** (specific, actionable):
```
Coverage 68% below threshold (80%):
- Add tests for error handling in handleJWT() function
- Add tests for expired token scenario in validateToken()
- Add edge case tests for malformed headers

Security issue detected:
- JWT secret hardcoded in jwt-handler.js line 23
- Action: Move to environment variable process.env.JWT_SECRET
- Update .env.example with JWT_SECRET placeholder
```

**Bad Feedback** (vague, non-actionable):
```
Coverage too low
Security problems found
Code needs improvement
```

### 4. Memory Namespacing

**DO**:
- ✅ Use hierarchical namespace: `swarm/{agent}/{task}`
- ✅ Include round number in iteration memory: `swarm/iterations/round-{n}`
- ✅ Store structured data (JSON)
- ✅ Use consistent naming conventions

**DON'T**:
- ❌ Use flat namespace: `jwt-auth-data`
- ❌ Mix different data types in same key
- ❌ Omit metadata (timestamps, agent IDs)

### 5. Post-Edit Hook Execution

**ALWAYS**:
- ✅ Run post-edit hook IMMEDIATELY after file edit
- ✅ Use `--structured` flag for machine-readable output
- ✅ Store hook results in memory with `--memory-key`
- ✅ Set appropriate `--minimum-coverage` threshold

**Example**:
```bash
# GOOD: Immediate execution with context
npx enhanced-hooks post-edit "src/auth/jwt.js" \
  --memory-key "swarm/backend-dev/jwt-auth" \
  --minimum-coverage 85 \
  --structured

# BAD: Missing context
npx enhanced-hooks post-edit "src/auth/jwt.js"
```

### 6. Consensus Validator Selection

**Recommended Validator Teams**:

**Simple tasks**:
- reviewer (quality)
- tester (integration)

**Medium tasks**:
- reviewer (quality)
- security-specialist (security)
- tester (integration)

**Complex tasks**:
- reviewer (quality)
- security-specialist (security)
- system-architect (architecture)
- tester (integration)
- perf-analyzer (performance) [optional]

**Enterprise tasks**:
- All of the above +
- compliance-auditor (regulatory)
- devops-engineer (deployment)

### 7. Handling Stuck Loops

**If self-validation stuck (3 retries)**:
1. Review feedback quality (is it actionable?)
2. Check if requirements are achievable
3. Consider lowering confidence threshold temporarily
4. Proceed to consensus with warnings

**If consensus stuck (5+ rounds)**:
1. Review validator feedback for contradictions
2. Check for ambiguous requirements
3. Consider manual intervention
4. Aggregate common recommendations

### 8. Optimizing for Speed

**Reduce iterations**:
- Use higher-quality initial instructions
- Include edge cases in task description
- Reference similar successful patterns from memory
- Pre-validate requirements before spawning agents

**Parallelize work**:
- Spawn all agents in single message
- Use mesh topology for maximum parallelization (2-7 agents)
- Batch file operations

**Cache validation results**:
- Reuse test results when code unchanged
- Store successful patterns in learning memory
- Skip redundant security scans

---

## Troubleshooting

### Common Issues

#### Issue 1: Agents Not Coordinating

**Symptom**: Agents produce conflicting solutions (e.g., 3 different auth methods)

**Cause**: `swarm_init` not called before spawning agents

**Solution**:
```javascript
// ❌ BAD: No swarm initialization
Task("Agent 1", "Fix auth", "coder")
Task("Agent 2", "Fix auth", "coder")

// ✅ GOOD: Initialize swarm first
mcp__claude-flow-novice__swarm_init({ topology: "mesh", maxAgents: 2 })
Task("Agent 1", "Fix auth", "coder")
Task("Agent 2", "Fix auth", "coder")
```

---

#### Issue 2: Post-Edit Hook Failures

**Symptom**: `enhanced-hooks` command fails or returns errors

**Cause**: Missing dependencies (prettier, eslint, jest, etc.)

**Solution**:
```bash
# Check what's missing
npx enhanced-hooks post-edit "file.js" --structured

# Install missing dependencies
npm install --save-dev prettier eslint jest

# Re-run hook
npx enhanced-hooks post-edit "file.js" --structured
```

**Alternative**: Enable graceful degradation (hook warns but doesn't block)
```javascript
// config/cfn-loop-config.js
export const CFN_CONFIG = {
  selfValidation: {
    blockOnCritical: false,  // Don't block on missing tools
    gracefulDegradation: true
  }
};
```

---

#### Issue 3: Low Confidence Scores (Always Below Threshold)

**Symptom**: Self-validation always fails, confidence < 0.75

**Cause**: Unrealistic coverage requirements or missing tests

**Solution**:
```bash
# Check detailed validation results
npx enhanced-hooks post-edit "file.js" --structured

# Common fixes:
# 1. Lower coverage threshold temporarily
npx enhanced-hooks post-edit "file.js" --minimum-coverage 60 --structured

# 2. Add missing tests
# (Focus on test coverage first)

# 3. Adjust confidence weights in config
# (Reduce coverage weight if prototyping)
```

---

#### Issue 4: Consensus Never Reached

**Symptom**: Validators disagree after 5+ rounds

**Cause**: Contradictory validator feedback or ambiguous requirements

**Solution**:
1. **Review validator feedback for conflicts**:
```javascript
// Validator 1: "Use Redis for rate limiting"
// Validator 2: "Use in-memory rate limiting"
// → Contradiction! Clarify requirements
```

2. **Manually resolve ambiguity**:
```markdown
**Clarification**: Use Redis for production rate limiting (scalable across instances)
Use in-memory for development/testing (simpler setup)
```

3. **Re-initialize swarm with clarified requirements**

---

#### Issue 5: Memory Storage Failures

**Symptom**: SwarmMemory operations fail or return null

**Cause**: SQLite database initialization issues

**Solution**:
```bash
# Check if .swarm directory exists
ls -la .swarm

# Create if missing
mkdir -p .swarm

# Re-initialize SwarmMemory
npx claude-flow-novice swarm init

# Verify database
sqlite3 .swarm/swarm-memory.db "SELECT * FROM memory LIMIT 5;"
```

---

#### Issue 6: Task Timeout (Exceeds Time Budget)

**Symptom**: CFN Loop aborts with "timeout exceeded"

**Cause**: Task too complex for single iteration or agent count too low

**Solution**:
1. **Break into smaller tasks**:
```markdown
# Instead of:
"Build complete authentication system"

# Use:
Task 1: "Implement JWT token generation"
Task 2: "Implement JWT token validation"
Task 3: "Implement password hashing with bcrypt"
Task 4: "Add authentication middleware"
```

2. **Increase agent count**:
```javascript
// If stuck with 3 agents, try 6
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 6  // Was 3
})
```

3. **Extend timeout**:
```javascript
// config/cfn-loop-config.js
export const CFN_CONFIG = {
  timeout: {
    taskTimeout: 600000,      // 10 minutes (was 5)
    consensusTimeout: 300000  // 5 minutes (was 3)
  }
};
```

---

#### Issue 7: Agent Self-Validation Stuck at Low Confidence

**Symptom**: Agent confidence stuck at 0.45-0.70 after multiple retries

**Cause**: Missing critical validation component (usually tests)

**Solution**:
```bash
# Check validation breakdown
npx enhanced-hooks post-edit "file.js" --structured

# Example output:
# {
#   "validation": {
#     "testsPassed": false,    // ← MISSING TESTS
#     "coverage": 0,
#     "syntax": true,
#     "security": true
#   },
#   "confidence": 0.45
# }

# Fix: Add tests FIRST
# Then re-run validation
```

---

### Debugging Commands

**Check swarm status**:
```bash
npx claude-flow-novice swarm status --swarm-id jwt-auth-swarm
```

**View memory contents**:
```bash
sqlite3 .swarm/swarm-memory.db "SELECT key, value FROM memory WHERE key LIKE 'swarm/%';"
```

**Trace agent execution**:
```bash
DEBUG=* npx claude-flow-novice swarm execute --task jwt-auth
```

**Export metrics for analysis**:
```bash
npx claude-flow-novice metrics export --format json > cfn-metrics.json
```

**Validate configuration**:
```bash
npx claude-flow-novice config validate
```

---

## Appendix: Quick Reference

### CFN Loop Checklist

**Before Starting**:
- [ ] Task complexity assessed (Simple/Medium/Complex/Enterprise)
- [ ] Agent count determined (3/6/12/20)
- [ ] Topology selected (mesh for 2-7, hierarchical for 8+)
- [ ] Configuration reviewed (thresholds, coverage, etc.)

**Loop 1 (Initialization)**:
- [ ] `swarm_init` called with correct parameters
- [ ] All agents spawned in SINGLE message
- [ ] Each agent has specific, non-overlapping instructions

**Loop 2 (Execution)**:
- [ ] Each file edit followed by post-edit hook
- [ ] Hook results stored in memory
- [ ] Self-validation confidence calculated
- [ ] GATE 1 passed (confidence ≥ 0.75) OR feedback injected

**Loop 3 (Consensus)**:
- [ ] 2-4 validators spawned
- [ ] Each validator performs multi-dimensional assessment
- [ ] Byzantine consensus voting executed
- [ ] GATE 2 passed (agreement ≥ 0.90) OR feedback injected

**Exit**:
- [ ] Results stored in SwarmMemory
- [ ] Next Steps Guidance provided
- [ ] Documentation updated (if required)

---

### Command Quick Reference

```bash
# Initialize swarm (MCP)
mcp__claude-flow-novice__swarm_init({ topology, maxAgents, strategy })

# Spawn agents (Claude Code Task tool)
Task("Name", "Instructions", "type")

# Post-edit hook (MANDATORY)
npx enhanced-hooks post-edit "file" --memory-key "key" --structured

# Check swarm status
npx claude-flow-novice swarm status

# View memory
npx claude-flow-novice memory search "swarm/*"

# Export metrics
npx claude-flow-novice metrics export
```

---

### Confidence Thresholds Summary

| Phase | Threshold | Description |
|-------|-----------|-------------|
| Self-Validation | 0.75 | Minimum agent confidence to proceed to consensus |
| Consensus Agreement | 0.90 | Minimum validator approval rate |
| Consensus Confidence | 0.90 | Minimum average validator confidence |
| Coverage Minimum | 0.80 | Minimum test coverage (80%) |

---

### Agent Type Reference

| Type | Role | Use Cases |
|------|------|-----------|
| `coder` | General implementation | Feature development, bug fixes |
| `tester` | Test writing and validation | Unit tests, integration tests |
| `reviewer` | Code quality review | Architecture, maintainability |
| `security-specialist` | Security auditing | Auth, encryption, vulnerability scan |
| `system-architect` | Architecture design | System design, scalability |
| `backend-dev` | Backend implementation | APIs, databases, servers |
| `frontend-dev` | Frontend implementation | UI, client-side logic |
| `devops-engineer` | Deployment and infrastructure | Docker, K8s, CI/CD |
| `api-docs` | Documentation | API specs, README, guides |
| `perf-analyzer` | Performance optimization | Profiling, caching, optimization |
| `database-specialist` | Database design | Schema, queries, migrations |
| `mobile-dev` | Mobile development | iOS, Android, React Native |
| `compliance-auditor` | Regulatory compliance | GDPR, HIPAA, SOC2 |

---

---

## Security Best Practices

### Input Validation and Sanitization

**CRITICAL**: Always validate and sanitize user inputs to prevent injection attacks.

#### Iteration Limit Validation

```javascript
// SECURITY: Validate iteration limits (1-100)
function validateIterationLimits(maxLoop2, maxLoop3) {
  if (!Number.isInteger(maxLoop2) || maxLoop2 < 1 || maxLoop2 > 100) {
    throw new Error('Invalid Loop 2 iteration limit (must be 1-100)');
  }
  if (!Number.isInteger(maxLoop3) || maxLoop3 < 1 || maxLoop3 > 100) {
    throw new Error('Invalid Loop 3 iteration limit (must be 1-100)');
  }
}
```

#### Feedback Sanitization

**Automatic Protection**: The `FeedbackInjectionSystem` automatically sanitizes all validator feedback to prevent prompt injection attacks (CVE-CFN-2025-002):

```javascript
// Feedback is automatically sanitized before injection
const sanitized = feedbackSystem.sanitizeFeedback(validatorFeedback);

// Blocks patterns like:
// - IGNORE PREVIOUS INSTRUCTIONS
// - SYSTEM:/ASSISTANT:/USER:
// - ACT AS/PRETEND TO BE
// - DISREGARD

// Maximum length: 5000 characters (prevents DoS)
```

**Manual Sanitization** (if needed):
```javascript
const { SecurityInputSanitizer } = require('../security/input-sanitizer.js');
const sanitizer = new SecurityInputSanitizer();

const result = sanitizer.sanitizeInput(userInput, { type: 'command_arg' });
if (!result.valid) {
  throw new Error('Invalid input');
}
```

#### Command Execution Security

**NEVER use `execSync` or `spawn` with `shell: true`**. Always use the `SecurityInputSanitizer`:

```javascript
// ❌ DANGEROUS: Direct execution
execSync(`node ${userFile}`); // Injection risk!

// ✅ SAFE: Sanitized execution
const result = await sanitizer.executeSecureCommand('node', [userFile]);
```

**Allowed Commands** (whitelist):
- `node`, `npm`, `yarn`
- `git`, `docker`, `kubectl`
- `curl`, `wget`

### Memory Management

**Automatic Cleanup**: The system prevents memory leaks through:

1. **LRU Eviction** (CVE-CFN-2025-003):
   - Maximum 100 feedback entries per phase
   - Automatic removal of oldest entries
   - Enforced in `FeedbackInjectionSystem.storeFeedbackInHistory()`

2. **Registry Size Limits**:
   - Issue deduplication registry capped at 100 entries per phase
   - Automatic cleanup via `FeedbackInjectionSystem.cleanup()`

3. **Periodic Cleanup**:
```javascript
// Runs automatically during long-running loops
feedbackSystem.cleanup(); // Removes old entries
```

**Manual Cleanup**:
```javascript
// Clear phase history when complete
feedbackSystem.clearPhaseHistory(phaseId);

// Shutdown when done
feedbackSystem.shutdown();
circuitBreakerManager.shutdown();
```

---

## CFNLoopOrchestrator API Reference

### Overview

The `CFNLoopOrchestrator` (or `CFNLoopIntegrator`) provides a high-level API for executing the complete CFN loop with automatic retry, circuit breaking, and memory management.

### Constructor

```javascript
import { CFNLoopIntegrator } from '../cfn-loop/cfn-loop-integrator.js';

const orchestrator = new CFNLoopIntegrator({
  phaseId: 'auth-implementation',
  maxLoop2: 5,              // Max self-validation retries (default: 10)
  maxLoop3: 10,             // Max consensus rounds (default: 10)
  selfValidationThreshold: 0.75,
  consensusThreshold: 0.90,
  enableCircuitBreaker: true,
  circuitBreakerOptions: {
    timeoutMs: 30 * 60 * 1000,  // 30 minutes
    failureThreshold: 3,
    cooldownMs: 5 * 60 * 1000   // 5 minutes
  }
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `phaseId` | string | (required) | Unique identifier for the CFN phase |
| `maxLoop2` | number | 10 | Maximum self-validation retries (1-100) |
| `maxLoop3` | number | 10 | Maximum consensus rounds (1-100) |
| `selfValidationThreshold` | number | 0.75 | Minimum confidence for Loop 2 (0.0-1.0) |
| `consensusThreshold` | number | 0.90 | Minimum consensus score for Loop 3 (0.0-1.0) |
| `enableCircuitBreaker` | boolean | true | Enable automatic circuit breaking |
| `circuitBreakerOptions` | object | See below | Circuit breaker configuration |

**Circuit Breaker Options**:
- `timeoutMs`: Maximum execution time before timeout (default: 30 minutes)
- `failureThreshold`: Failures before circuit opens (default: 3)
- `cooldownMs`: Wait time before retry after circuit opens (default: 5 minutes)
- `successThreshold`: Successes required to close circuit from half-open (default: 2)

### Methods

#### `executePhase(task)`

Execute a complete CFN loop phase with automatic retry and consensus validation.

```javascript
const result = await orchestrator.executePhase({
  description: 'Implement JWT authentication',
  agents: [
    { id: 'backend-dev', type: 'backend-dev', instructions: '...' },
    { id: 'security-specialist', type: 'security-specialist', instructions: '...' },
    { id: 'tester', type: 'tester', instructions: '...' }
  ],
  validators: [
    { id: 'reviewer', type: 'reviewer' },
    { id: 'security-auditor', type: 'security-specialist' }
  ]
});

// Result structure
{
  success: true,
  phaseId: 'auth-implementation',
  finalState: 'consensus-passed',
  iterations: {
    loop2: 2,  // Self-validation retries
    loop3: 1   // Consensus rounds
  },
  consensusScore: 0.95,
  validationResults: [...],
  deliverables: [...],
  nextSteps: [...]
}
```

#### `getState()`

Get current execution state.

```javascript
const state = orchestrator.getState();
// Returns: CFNLoopState enum
// - INITIALIZING
// - EXECUTING_PRIMARY
// - SELF_VALIDATION
// - CONSENSUS_VALIDATION
// - COMPLETED
// - FAILED
// - CIRCUIT_OPEN
```

#### `reset()`

Reset orchestrator for new phase execution.

```javascript
orchestrator.reset();
```

### Usage Examples

#### Basic Usage

```javascript
const orchestrator = new CFNLoopIntegrator({
  phaseId: 'user-profile-endpoint',
  maxLoop2: 10,
  maxLoop3: 5
});

const result = await orchestrator.executePhase({
  description: 'Add GET /api/users/:id endpoint',
  agents: [
    { id: 'coder', type: 'coder', instructions: 'Implement endpoint' },
    { id: 'tester', type: 'tester', instructions: 'Write tests' }
  ],
  validators: [
    { id: 'reviewer', type: 'reviewer' }
  ]
});

if (result.success) {
  console.log(`✅ Phase complete: ${result.consensusScore * 100}% consensus`);
} else {
  console.error(`❌ Phase failed: ${result.error}`);
}
```

#### Advanced Usage with Custom Thresholds

```javascript
// Production-critical feature (higher thresholds)
const orchestrator = new CFNLoopIntegrator({
  phaseId: 'payment-processing',
  maxLoop2: 5,
  maxLoop3: 15,
  selfValidationThreshold: 0.85,  // Stricter
  consensusThreshold: 0.95,       // Stricter
  circuitBreakerOptions: {
    timeoutMs: 60 * 60 * 1000,    // 1 hour (complex task)
    failureThreshold: 5
  }
});
```

---

## Circuit Breaker Usage

### Overview

The circuit breaker prevents infinite loops and system overload by automatically halting execution after repeated failures.

### States

1. **CLOSED**: Normal operation, requests allowed
2. **OPEN**: Too many failures, requests rejected
3. **HALF_OPEN**: Testing recovery, limited requests allowed

### Automatic Circuit Breaking

Circuit breaker is automatically integrated when using `CFNLoopIntegrator`:

```javascript
// Automatic circuit breaker
const result = await orchestrator.executePhase(task);

// If circuit opens:
// - Error: "Circuit breaker 'auth-implementation' is OPEN"
// - Next attempt time provided
// - System enters cooldown period
```

### Manual Circuit Breaker Control

```javascript
import { CFNCircuitBreakerManager } from '../cfn-loop/circuit-breaker.js';

const manager = new CFNCircuitBreakerManager();

// Execute with circuit breaker
const result = await manager.execute(
  'my-operation',
  async () => {
    // Your operation
    return await performTask();
  },
  {
    timeoutMs: 10 * 60 * 1000,  // 10 minutes
    failureThreshold: 3
  }
);
```

### Monitoring Circuit Breaker

```javascript
// Get single breaker state
const state = manager.getBreakerState('auth-implementation');
console.log(state);
// {
//   state: 'CLOSED',
//   failureCount: 0,
//   successCount: 5,
//   totalRequests: 10,
//   rejectedRequests: 0,
//   timeoutCount: 0
// }

// Get all breaker statistics
const stats = manager.getStatistics();
console.log(stats);
// {
//   totalBreakers: 3,
//   openCircuits: 0,
//   halfOpenCircuits: 0,
//   closedCircuits: 3,
//   totalRequests: 25,
//   totalRejections: 0,
//   totalTimeouts: 0
// }
```

### Resetting Circuit Breaker

```javascript
// Reset specific breaker
manager.resetBreaker('auth-implementation');

// Reset all breakers
manager.resetAll();

// Force state (for testing/manual intervention)
manager.forceState('auth-implementation', CircuitState.CLOSED);
```

### Circuit Breaker Events

```javascript
manager.on('breaker:failure', (data) => {
  console.log(`❌ Breaker failure: ${data.name}`);
});

manager.on('breaker:state-change', (data) => {
  console.log(`🔄 State change: ${data.from} → ${data.to}`);
});

manager.on('breaker:rejected', (data) => {
  console.log(`🚫 Request rejected: ${data.name}`);
});
```

### Troubleshooting Circuit Breaker

**Issue**: Circuit keeps opening
- **Cause**: Task consistently failing or timing out
- **Solution**: Increase `failureThreshold` or `timeoutMs`, or fix underlying issue

**Issue**: Circuit stuck in OPEN state
- **Cause**: Cooldown period not elapsed
- **Solution**: Wait for `nextAttemptTime` or manually reset

**Issue**: Requests rejected unexpectedly
- **Cause**: Circuit in HALF_OPEN state with limited requests
- **Solution**: Wait for successful requests to close circuit, or reset

---

## Performance Optimizations

### Parallel Confidence Collection

**Automatic**: The system collects confidence scores from all agents in parallel (not sequentially).

**Implementation** (internal):
```javascript
// All agents validate concurrently
const confidenceScores = await Promise.all(
  agents.map(agent => agent.calculateConfidence())
);

// Result: ~3x faster than sequential validation
```

**Benefit**:
- **3 agents**: 3x faster (parallel vs sequential)
- **6 agents**: 6x faster
- **12 agents**: 12x faster

### Memory-Efficient Feedback Storage

**LRU Cache** (automatic):
- Maximum 100 feedback entries per phase
- Oldest entries evicted automatically
- Prevents unbounded memory growth

**Deduplication**:
```javascript
// Automatic issue deduplication
const feedback = await feedbackSystem.captureFeedback({
  phaseId: 'auth',
  iteration: 2,
  validatorResults: [...]
});

// Duplicate issues filtered out
// Registry tracks seen issues per phase
```

### Batch Operations

**DO**: Batch all agent spawning in single message
```javascript
// ✅ GOOD: Single batch
[Single Message]:
  Task("Agent 1", "Instructions", "type")
  Task("Agent 2", "Instructions", "type")
  Task("Agent 3", "Instructions", "type")
```

**DON'T**: Spawn agents sequentially
```javascript
// ❌ BAD: Sequential spawning
Task("Agent 1", "Instructions", "type")
// Wait for response...
Task("Agent 2", "Instructions", "type")
// Wait for response...
```

### Caching Validation Results

**Manual** (if needed):
```javascript
// Cache test results if file unchanged
const fileHash = crypto.createHash('sha256')
  .update(fs.readFileSync(filePath))
  .digest('hex');

if (cachedResults[fileHash]) {
  return cachedResults[fileHash];
}

// Run validation and cache
const result = await runValidation(filePath);
cachedResults[fileHash] = result;
```

---

## Advanced Configuration

### Custom Feedback Priorities

```javascript
const feedbackSystem = new FeedbackInjectionSystem({
  priorityThresholds: {
    critical: 1.0,    // Block immediately
    high: 0.8,        // High priority
    medium: 0.5,      // Medium priority
    low: 0.3          // Low priority
  }
});
```

### Custom Memory Namespace

```javascript
const feedbackSystem = new FeedbackInjectionSystem({
  memoryNamespace: 'custom/cfn-loop/feedback'
});
```

### Disable Deduplication (not recommended)

```javascript
const feedbackSystem = new FeedbackInjectionSystem({
  deduplicationEnabled: false  // May cause duplicate issues
});
```

### Extended Iteration Limits (use cautiously)

```javascript
// SECURITY: Validate limits first
const maxLoop3 = 20;  // Higher than default (10)

if (maxLoop3 < 1 || maxLoop3 > 100) {
  throw new Error('Invalid iteration limit');
}

const orchestrator = new CFNLoopIntegrator({
  maxLoop3: maxLoop3
});
```

---

**Documentation Version**: 1.0.1
**Last Updated**: 2025-10-02
**Compatible With**: Claude Flow Novice v1.5.22+

For issues or questions, see [GitHub Issues](https://github.com/your-org/claude-flow-novice/issues) or consult the [main documentation](../README.md).
