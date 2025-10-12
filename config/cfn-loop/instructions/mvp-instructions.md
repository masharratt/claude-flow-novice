# CFN Loop Instructions - MVP Mode

**Purpose**: Fast iteration for prototypes and MVPs with reduced quality gates while maintaining core functionality validation.

**Target Use Cases**: Proof-of-concepts, MVP launches, rapid prototyping, early-stage startups, experimental features.

---

## 1) MVP Mode Configuration

**Quality Thresholds**:
- Gate (agent self-confidence): **≥0.70** (vs 0.75 standard, 0.75 enterprise)
- Consensus (validator agreement): **≥0.80** (vs 0.90 standard, 0.95 enterprise)
- Validators: **2 agents** (reviewer + tester) (vs 4 standard/enterprise)
- Product Owner: **Single agent** (vs single standard, 4-person board enterprise)

**Iteration Limits**:
- Loop 3 (implementation): **Max 5 iterations** (vs 10 standard, 15 enterprise)
- Loop 2 (validation): **Max 5 iterations** (vs 10 standard, 15 enterprise)

**Skip Validations** (MVP-specific):
- ❌ Accessibility checks (WCAG 2.1 AA compliance)
- ❌ Performance benchmarks (load testing, stress testing)
- ❌ Comprehensive documentation (API docs auto-generated only)
- ❌ SEO optimization
- ❌ Internationalization (i18n)
- ❌ Advanced security audits (OWASP Top 10 basic checks only)

**Rationale**: Ship fast, iterate later. Technical debt acceptable for MVP validation. Production-grade quality deferred to post-MVP phases.

---

## 2) CFN Loop Structure Overview

### Loop Hierarchy

```
Loop 0: Epic/Sprint Orchestration (Multi-Phase)
  ├── No iteration limit
  └── Coordinates multiple phases sequentially

Loop 1: Phase Execution (Sequential Phases)
  ├── No iteration limit
  └── Executes individual phases within sprint

Loop 3: Primary Implementation (Swarm Execution)
  ├── Max 5 iterations (MVP mode)
  ├── Exit when all agents ≥0.70 confidence
  └── Mesh topology (2-7 agents) or hierarchical (8+)

Loop 2: Consensus Validation (Quality Gate)
  ├── Max 5 iterations (MVP mode)
  ├── 2 validators (reviewer + tester)
  └── Exit when consensus ≥0.80

Loop 4: Product Owner Decision (GOAP)
  ├── Single iteration
  ├── Autonomous PROCEED/DEFER/ESCALATE decision
  └── Speed-biased: favor DEFER (approve + backlog) over PROCEED (rework)
```

**Critical Flow**: Loop 3 → Gate Check (≥0.70) → Loop 2 → Consensus (≥0.80) → Loop 4 → Decision

---

## 3) Loop 3 Implementation: Spawning Agents

### 3.1 Swarm Initialization (ONCE per Phase)

**CRITICAL**: Initialize swarm ONCE per phase, NOT per retry iteration. Swarm persists through all Loop 3 retries.

```bash
# Phase-level initialization (Redis-backed persistence)
executeSwarm({
  swarmId: "phase-auth-mvp",
  objective: "Phase: Authentication System (MVP Mode)",
  strategy: "development",
  mode: "mesh",
  persistence: true,
  metadata: {
    cfnMode: "mvp",
    gateThreshold: 0.70,
    maxIterations: 5
  }
})
```

**Alternative CLI Command**:
```bash
node tests/manual/test-swarm-direct.js "Implement authentication with JWT tokens (MVP mode)" \
  --executor \
  --max-agents 3 \
  --mode mesh \
  --cfn-mode mvp
```

**When to Re-Initialize Swarm**:
- ✅ New phase starts (auth → profile → permissions)
- ✅ Swarm corruption detected (Redis state invalid)
- ✅ >24 hours since last activity (TTL expiration)
- ❌ Loop 3 retry iterations (use EXISTING swarm)
- ❌ Loop 2 validation failures (use EXISTING swarm)
- ❌ Agent respawns within same phase (use EXISTING swarm)

### 3.2 Agent Spawning with Task Tool (Batch Spawn Pattern)

**CRITICAL**: Spawn ALL agents in ONE message using Task tool. Never spawn agents incrementally.

**Example: Authentication Phase (3 Agents)**

```javascript
// Spawn all Loop 3 implementers in single message
[
  {
    agent: "coder-1",
    role: "Backend Developer",
    task: "Implement JWT authentication middleware with login/logout endpoints. Use bcrypt for password hashing. Store tokens in Redis with 1-hour TTL. Basic error handling only (MVP mode).",
    instructions: [
      "Create src/middleware/auth.js with verifyToken middleware",
      "Create src/routes/auth.js with POST /login and POST /logout",
      "Use bcrypt.hash() for passwords (10 rounds)",
      "Store JWT in Redis: `auth:token:{userId}` with 3600s TTL",
      "Return 401 for invalid tokens, 500 for server errors",
      "Skip rate limiting (MVP mode)",
      "Skip refresh token logic (MVP mode)"
    ],
    files: ["src/middleware/auth.js", "src/routes/auth.js", "src/utils/jwt.js"],
    confidence_target: 0.70
  },
  {
    agent: "coder-2",
    role: "Database Developer",
    task: "Design users table schema and implement user CRUD operations. Use PostgreSQL with Prisma ORM. Basic validation only (MVP mode).",
    instructions: [
      "Create prisma/schema.prisma with User model (id, email, passwordHash, createdAt)",
      "Create src/db/users.js with createUser, getUserByEmail, updateUser",
      "Add unique constraint on email field",
      "Hash passwords before storing (use bcrypt from coder-1)",
      "Skip soft deletes (MVP mode)",
      "Skip audit logging (MVP mode)"
    ],
    files: ["prisma/schema.prisma", "src/db/users.js"],
    confidence_target: 0.70
  },
  {
    agent: "tester-1",
    role: "Test Engineer",
    task: "Write integration tests for authentication flow. Focus on happy path and basic error cases (MVP mode).",
    instructions: [
      "Create tests/integration/auth.test.js",
      "Test: POST /login with valid credentials returns JWT",
      "Test: POST /login with invalid credentials returns 401",
      "Test: Protected route with valid token returns 200",
      "Test: Protected route without token returns 401",
      "Skip edge cases like expired tokens, token refresh (MVP mode)",
      "Target: 60% coverage (MVP mode, not 80%)"
    ],
    files: ["tests/integration/auth.test.js"],
    confidence_target: 0.70
  }
]
```

**Topology Selection**:
- **Mesh** (2-7 agents): All agents coordinate directly via Redis pub/sub
- **Hierarchical** (8+ agents): Spawn coordinator in mesh, then spawn teams under coordinator

**Mesh Example** (3 agents):
```bash
# Direct peer-to-peer coordination
Coder-1 ←→ Coder-2
   ↕         ↕
Tester-1 ←→ Coder-2
```

**Hierarchical Example** (15 agents):
```bash
# Coordinator mesh with hierarchical teams
Coordinator-1 ←→ Coordinator-2 ←→ Coordinator-3
      ↓               ↓               ↓
  Team-Auth       Team-DB         Team-Test
  (5 agents)      (5 agents)      (5 agents)
```

### 3.3 Agent Communication via Redis Pub/Sub (MANDATORY)

**CRITICAL**: ALL agent coordination MUST use Redis pub/sub. Direct file coordination is PROHIBITED.

**Publishing Events**:
```bash
# Agent spawned: Publish lifecycle event
redis-cli publish "cfn:loop3:agent:lifecycle" '{
  "agentId": "coder-1",
  "status": "spawned",
  "phase": "auth-mvp",
  "timestamp": 1697123456789
}'

# Agent working: Publish progress event
redis-cli publish "cfn:loop3:agent:progress" '{
  "agentId": "coder-1",
  "status": "in_progress",
  "file": "src/middleware/auth.js",
  "progress": 0.50
}'

# Agent completed: Publish confidence score
redis-cli publish "cfn:loop3:agent:complete" '{
  "agentId": "coder-1",
  "confidence": 0.72,
  "reasoning": "JWT middleware implemented with bcrypt hashing. Tests pass. Basic error handling complete.",
  "blockers": [],
  "filesChanged": ["src/middleware/auth.js", "src/utils/jwt.js"]
}'
```

**Channel Naming Convention**:
- `cfn:loop3:agent:lifecycle` - Agent spawn/terminate events
- `cfn:loop3:agent:progress` - Work-in-progress updates
- `cfn:loop3:agent:complete` - Completion + confidence scores
- `cfn:loop3:coordination` - Cross-agent coordination messages
- `cfn:loop3:gate` - Gate check results (aggregate confidence)

**Subscribing to Events** (Coordinator Pattern):
```bash
# Subscribe to all Loop 3 events
redis-cli subscribe "cfn:loop3:*"

# Or use pattern matching
redis-cli psubscribe "cfn:loop3:agent:*"
```

**JavaScript Event Publishing**:
```javascript
// From within agent execution
const redis = require('redis');
const client = redis.createClient();

await client.publish('cfn:loop3:agent:complete', JSON.stringify({
  agentId: process.env.AGENT_ID,
  confidence: 0.72,
  reasoning: "Implementation complete. Tests pass.",
  blockers: [],
  filesChanged: ["src/middleware/auth.js"]
}));
```

### 3.4 SQLite Memory Storage (Loop 3 Results)

**CRITICAL**: Store implementation results in SQLite with ACL Level 1 (Private to Agent) for durable persistence.

**Memory Key Pattern**: `cfn/phase-{phaseId}/loop3/agent-{agentId}`

**Storage Example**:
```bash
# Store Loop 3 implementation results with ACL Level 1 (Private)
/sqlite-memory store \
  --key "cfn/phase-auth-mvp/loop3/agent-coder-1" \
  --level agent \
  --data '{
    "confidence": 0.72,
    "reasoning": "JWT middleware implemented. Bcrypt hashing works. Tests pass.",
    "filesChanged": ["src/middleware/auth.js", "src/utils/jwt.js"],
    "blockers": [],
    "timestamp": 1697123456789,
    "linesChanged": 145
  }' \
  --ttl 2592000
```

**TTL Values**:
- Loop 3 results: **30 days** (2,592,000 seconds) - ACL Level 1
- Phase state: **7 days** (604,800 seconds) - ACL Level 3
- Sprint summary: **90 days** (7,776,000 seconds) - ACL Level 4

**ACL Levels Explained**:
1. **Private** (Level 1): Agent-specific data, encrypted AES-256-GCM
2. **Agent** (Level 2): Shared within agent type (all coders)
3. **Swarm** (Level 3): Shared across swarm (all phase agents)
4. **Project** (Level 4): Shared across project (all phases)
5. **Team** (Level 5): Shared across team members
6. **System** (Level 6): System-wide configuration

**Retrieval Example** (Loop 2 validators read Loop 3 results):
```bash
# Retrieve all Loop 3 results for validation
/sqlite-memory retrieve \
  --key "cfn/phase-auth-mvp/loop3/*" \
  --level swarm

# Returns array of all agent results:
[
  { agentId: "coder-1", confidence: 0.72, ... },
  { agentId: "coder-2", confidence: 0.68, ... },
  { agentId: "tester-1", confidence: 0.75, ... }
]
```

### 3.5 Post-Edit Hook (MANDATORY After Every File Edit)

**CRITICAL**: Run post-edit hook after EVERY file edit. No exceptions.

```bash
# Standard post-edit hook
node config/hooks/post-edit-pipeline.js "src/middleware/auth.js" \
  --memory-key "cfn/phase-auth-mvp/loop3/coder-1"

# MVP mode (skip some validations)
node config/hooks/post-edit-pipeline.js "src/middleware/auth.js" \
  --memory-key "cfn/phase-auth-mvp/loop3/coder-1" \
  --minimum-coverage 60 \
  --skip-accessibility \
  --skip-performance
```

**What It Validates** (MVP mode):
- ✅ TDD compliance (test-first development)
- ✅ Security analysis (basic OWASP checks, no eval(), SQL injection detection)
- ✅ Formatting (Prettier/rustfmt)
- ✅ Test coverage (≥60% for MVP, vs ≥80% standard)
- ✅ Linting (ESLint/Clippy)
- ❌ Accessibility (WCAG) - skipped in MVP mode
- ❌ Performance benchmarks - skipped in MVP mode
- ❌ Comprehensive docs - skipped in MVP mode

**Hook Output** (stored in SQLite):
```json
{
  "file": "src/middleware/auth.js",
  "tdd_compliance": true,
  "security_issues": [],
  "coverage": 0.62,
  "formatting_issues": 0,
  "recommendations": [
    "Add input validation for JWT claims",
    "Consider rate limiting for /login endpoint (defer to post-MVP)"
  ]
}
```

### 3.6 Gate Check (Confidence Threshold ≥0.70)

**CRITICAL**: After all Loop 3 agents complete, check if ALL agents meet ≥0.70 confidence threshold.

**Aggregate Confidence Check**:
```bash
# Retrieve all Loop 3 confidence scores
redis-cli get "cfn:phase-auth-mvp:loop3:aggregate"

# Expected output:
{
  "agents": [
    { "id": "coder-1", "confidence": 0.72 },
    { "id": "coder-2", "confidence": 0.68 },
    { "id": "tester-1", "confidence": 0.75 }
  ],
  "average": 0.717,
  "min": 0.68,
  "passed": false  // coder-2 below 0.70 threshold
}
```

**Gate Decision Logic**:
```javascript
const gateThreshold = 0.70; // MVP mode
const allAgentsPassed = agents.every(a => a.confidence >= gateThreshold);

if (allAgentsPassed) {
  console.log("✅ Gate PASSED: Proceed to Loop 2 validation");
  // Publish gate success event
  await redis.publish('cfn:loop3:gate', JSON.stringify({
    phase: "auth-mvp",
    status: "PASSED",
    confidence: averageConfidence,
    nextLoop: 2
  }));
} else {
  console.log("❌ Gate FAILED: Retry Loop 3 with targeted improvements");
  const failedAgents = agents.filter(a => a.confidence < gateThreshold);
  console.log("Failed agents:", failedAgents.map(a => a.id));
  // Retry Loop 3 (max 5 iterations)
}
```

**Retry Strategy** (if gate fails):
1. Identify failing agents (confidence <0.70)
2. Replace failing agents with specialists (e.g., security-specialist if auth issues)
3. Add missing roles (e.g., performance-analyzer if slow queries)
4. Re-run Loop 3 with targeted instructions
5. Max 5 retries; escalate if still failing

**Example Retry Spawn**:
```javascript
// Original agent failed (coder-2: 0.68)
// Retry with more specific instructions + additional specialist

[
  {
    agent: "coder-2-retry",
    role: "Database Developer",
    task: "RETRY: Fix user CRUD operations. Focus on input validation and error handling (previous confidence: 0.68).",
    instructions: [
      "Add email format validation (regex: /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)",
      "Add password strength check (min 8 chars, 1 uppercase, 1 number)",
      "Handle duplicate email errors (UNIQUE constraint violation)",
      "Return proper HTTP status codes (400 validation, 409 conflict)",
      "Add JSDoc comments for all exported functions"
    ],
    files: ["src/db/users.js"],
    confidence_target: 0.70,
    retry_context: {
      originalAgent: "coder-2",
      originalConfidence: 0.68,
      failureReason: "Insufficient input validation and error handling"
    }
  },
  {
    agent: "security-specialist-1",
    role: "Security Specialist",
    task: "NEW: Review authentication implementation for security vulnerabilities (OWASP Top 10 basic checks only).",
    instructions: [
      "Check for SQL injection vulnerabilities (parameterized queries)",
      "Verify bcrypt rounds (min 10 for MVP mode)",
      "Check JWT secret strength (min 32 chars, from env var)",
      "Verify token expiration is set (no infinite tokens)",
      "Check for sensitive data in logs (no passwords logged)",
      "Skip: CSRF protection, rate limiting (MVP mode)"
    ],
    files: ["src/middleware/auth.js", "src/db/users.js"],
    confidence_target: 0.70
  }
]
```

---

## 4) Loop 2 Validation: Consensus Check

### 4.1 Spawning Validators (2 Agents in MVP Mode)

**CRITICAL**: Spawn validators ONLY after Loop 3 gate passes (all agents ≥0.70). Never mix implementers and validators in same message.

**Validator Selection** (MVP mode: 2 agents):
1. **Reviewer** (code quality, architecture, maintainability)
2. **Tester** (test coverage, integration tests, edge cases)

**Spawn Pattern**:
```javascript
// Spawn Loop 2 validators in single message (after Loop 3 success)
[
  {
    agent: "reviewer-1",
    role: "Code Reviewer",
    task: "Review authentication implementation for code quality and maintainability (MVP standards).",
    instructions: [
      "Read Loop 3 results from SQLite: /sqlite-memory retrieve --key 'cfn/phase-auth-mvp/loop3/*'",
      "Check code organization (proper separation of concerns)",
      "Check error handling (all endpoints return proper status codes)",
      "Check code duplication (extract common logic to utils)",
      "Check naming conventions (camelCase, descriptive names)",
      "Skip: Advanced architecture patterns, performance optimization (MVP mode)",
      "Target confidence: ≥0.80 (consensus threshold)"
    ],
    files_to_review: ["src/middleware/auth.js", "src/routes/auth.js", "src/db/users.js"],
    consensus_target: 0.80
  },
  {
    agent: "tester-1",
    role: "Test Validator",
    task: "Validate test coverage and integration tests for authentication flow (MVP standards).",
    instructions: [
      "Read Loop 3 results from SQLite: /sqlite-memory retrieve --key 'cfn/phase-auth-mvp/loop3/*'",
      "Run tests: npm test -- --run --reporter=json > test-results.json",
      "Check coverage: must be ≥60% (MVP mode, not 80%)",
      "Check integration tests exist for /login and /logout",
      "Check error case tests (invalid credentials, missing token)",
      "Skip: Edge cases, stress tests, performance tests (MVP mode)",
      "Target confidence: ≥0.80 (consensus threshold)"
    ],
    test_results_file: "test-results.json",
    consensus_target: 0.80
  }
]
```

### 4.2 Validator Communication via Redis Pub/Sub

**Publishing Validation Results**:
```bash
# Reviewer publishes validation result
redis-cli publish "cfn:loop2:validator:complete" '{
  "validatorId": "reviewer-1",
  "confidence": 0.82,
  "reasoning": "Code quality good. Error handling complete. Some duplication in auth.js but acceptable for MVP.",
  "issues": [
    { "severity": "low", "description": "Extract token generation to utils/jwt.js", "defer": true }
  ],
  "recommendations": [
    "Add rate limiting post-MVP",
    "Consider refresh token implementation in v2"
  ]
}'

# Tester publishes validation result
redis-cli publish "cfn:loop2:validator:complete" '{
  "validatorId": "tester-1",
  "confidence": 0.78,
  "reasoning": "Test coverage 62% (target: 60%). Integration tests pass. Missing some edge cases but acceptable for MVP.",
  "issues": [
    { "severity": "medium", "description": "Add test for expired token scenario", "defer": false }
  ],
  "recommendations": [
    "Add E2E tests for user flows post-MVP",
    "Add load testing for /login endpoint"
  ]
}'
```

**Channel Naming Convention**:
- `cfn:loop2:validator:lifecycle` - Validator spawn/terminate events
- `cfn:loop2:validator:progress` - Validation progress updates
- `cfn:loop2:validator:complete` - Validation results + confidence scores
- `cfn:loop2:consensus` - Consensus calculation results

### 4.3 SQLite Memory Storage (Loop 2 Validation Results)

**Memory Key Pattern**: `cfn/phase-{phaseId}/loop2/validation/{validatorId}`

**Storage Example**:
```bash
# Store Loop 2 validation results with ACL Level 3 (Swarm)
/sqlite-memory store \
  --key "cfn/phase-auth-mvp/loop2/validation/reviewer-1" \
  --level swarm \
  --data '{
    "validatorId": "reviewer-1",
    "confidence": 0.82,
    "reasoning": "Code quality good. Error handling complete.",
    "issues": [
      { "severity": "low", "description": "Extract token generation", "defer": true }
    ],
    "recommendations": [
      "Add rate limiting post-MVP"
    ],
    "timestamp": 1697123789012
  }' \
  --ttl 604800
```

**TTL: 7 days** (604,800 seconds) - ACL Level 3 (Swarm-scoped)

### 4.4 Consensus Calculation (≥0.80 in MVP Mode)

**CRITICAL**: Calculate weighted average of validator confidence scores. Must reach ≥0.80 to pass gate.

**Consensus Formula**:
```javascript
const consensusThreshold = 0.80; // MVP mode
const validatorScores = [
  { id: "reviewer-1", confidence: 0.82, weight: 0.5 },
  { id: "tester-1", confidence: 0.78, weight: 0.5 }
];

// Weighted average
const consensus = validatorScores.reduce(
  (sum, v) => sum + (v.confidence * v.weight),
  0
);

console.log("Consensus:", consensus); // 0.80

if (consensus >= consensusThreshold) {
  console.log("✅ Consensus PASSED: Proceed to Loop 4 Product Owner");
} else {
  console.log("❌ Consensus FAILED: Retry Loop 3 with validator feedback");
}
```

**Consensus Result Storage**:
```bash
# Store consensus result in Redis for Product Owner
redis-cli setex "cfn:phase-auth-mvp:loop2:consensus" 3600 '{
  "consensus": 0.80,
  "threshold": 0.80,
  "passed": true,
  "validators": [
    { "id": "reviewer-1", "confidence": 0.82 },
    { "id": "tester-1", "confidence": 0.78 }
  ],
  "issues": [
    { "severity": "low", "description": "Extract token generation", "defer": true }
  ],
  "recommendations": [
    "Add rate limiting post-MVP",
    "Add E2E tests post-MVP"
  ]
}'
```

### 4.5 Retry Strategy (If Consensus <0.80)

**Retry Loop 3 with Validator Feedback**:
1. Read validator issues from SQLite
2. Spawn targeted agents to fix issues
3. Re-run Loop 3 with specific instructions
4. Re-validate with Loop 2
5. Max 5 total Loop 2 iterations

**Example Retry** (consensus 0.75, below 0.80 threshold):
```javascript
// Validator issue: "Test coverage 58% (target: 60%)"
// Retry: Spawn tester to add missing tests

[
  {
    agent: "tester-2-retry",
    role: "Test Engineer",
    task: "RETRY: Increase test coverage to ≥60%. Add missing edge case tests.",
    instructions: [
      "Review validator feedback: /sqlite-memory retrieve --key 'cfn/phase-auth-mvp/loop2/validation/tester-1'",
      "Add test for expired token scenario",
      "Add test for malformed JWT token",
      "Add test for missing Authorization header",
      "Run coverage report: npm test -- --coverage",
      "Target: ≥60% coverage"
    ],
    files: ["tests/integration/auth.test.js"],
    confidence_target: 0.70,
    retry_context: {
      originalIssue: "Test coverage 58% (target: 60%)",
      validatorFeedback: "Missing edge case tests"
    }
  }
]
```

---

## 5) Loop 4 Product Owner: GOAP Decision

### 5.1 Spawning Product Owner (Single Agent in MVP Mode)

**CRITICAL**: Spawn Product Owner ONLY after Loop 2 consensus passes (≥0.80). Product Owner makes autonomous PROCEED/DEFER/ESCALATE decision.

**MVP Mode Bias**: Speed-biased. Favor DEFER (approve + backlog) over PROCEED (rework). Accept technical debt for MVP validation.

**Spawn Pattern**:
```javascript
// Spawn Loop 4 Product Owner (single message, after Loop 2 success)
[
  {
    agent: "product-owner-1",
    role: "Product Owner",
    task: "Make GOAP decision on authentication phase completion. MVP mode: prioritize speed, accept technical debt.",
    instructions: [
      "Read Loop 3 results: /sqlite-memory retrieve --key 'cfn/phase-auth-mvp/loop3/*'",
      "Read Loop 2 consensus: redis-cli get 'cfn:phase-auth-mvp:loop2:consensus'",
      "Evaluate: Does implementation meet MVP requirements?",
      "Evaluate: Are critical blockers present? (security, data loss, crashes)",
      "Decision options: PROCEED (rework), DEFER (approve + backlog), ESCALATE (human review)",
      "MVP bias: Favor DEFER over PROCEED. Technical debt acceptable.",
      "DEFER criteria: Consensus ≥0.80, no critical blockers, working implementation",
      "PROCEED criteria: Missing core functionality, critical bugs",
      "ESCALATE criteria: Ambiguous requirements, conflicting validator feedback"
    ],
    decision_target: "DEFER",
    mvp_mode: true
  }
]
```

### 5.2 GOAP Decision Criteria

**PROCEED** (Relaunch Loop 3 with fixes):
- Missing core functionality (e.g., login works but logout broken)
- Critical security vulnerabilities (SQL injection, XSS, authentication bypass)
- Critical bugs (data loss, crashes, infinite loops)
- Consensus <0.80 AND fixable with targeted retry

**DEFER** (Approve work, backlog non-critical issues):
- Consensus ≥0.80
- Core functionality works (happy path + basic error handling)
- No critical blockers
- Technical debt acceptable (e.g., code duplication, missing docs, low coverage)
- Recommendations backlogged for post-MVP iterations

**ESCALATE** (Human review required):
- Ambiguous requirements (unclear acceptance criteria)
- Conflicting validator feedback (reviewer says pass, tester says fail)
- Novel security vulnerability (zero-day, no established mitigation)
- Business logic uncertainty (legal/compliance questions)

**MVP Mode Decision Bias**:
```javascript
// Standard mode: Strict quality gates
if (consensus >= 0.90 && criticalIssues === 0) {
  return "DEFER";
} else if (consensus >= 0.80 && fixableIssues > 0) {
  return "PROCEED";
}

// MVP mode: Speed-biased, accept technical debt
if (consensus >= 0.80 && criticalIssues === 0) {
  return "DEFER"; // Lower bar for approval
} else if (consensus >= 0.70 && fixableIssues > 0 && retryCount < 3) {
  return "PROCEED"; // Allow more retries
}
```

### 5.3 Product Owner Communication via Redis Pub/Sub

**Publishing Decision**:
```bash
# Product Owner publishes GOAP decision
redis-cli publish "cfn:loop4:decision" '{
  "productOwnerId": "product-owner-1",
  "decision": "DEFER",
  "reasoning": "Consensus 0.80 meets MVP threshold. Core auth functionality works. No critical blockers. Technical debt (code duplication, missing docs) backlogged for post-MVP.",
  "confidence": 0.85,
  "approvedForProduction": false,
  "approvedForMVP": true,
  "backlog": [
    "Extract token generation to utils/jwt.js",
    "Add rate limiting to /login endpoint",
    "Increase test coverage to 80%",
    "Add E2E tests for user flows",
    "Add comprehensive API documentation"
  ],
  "nextPhase": "profile-management"
}'
```

**Decision Storage** (SQLite):
```bash
# Store Loop 4 decision with ACL Level 4 (Project)
/sqlite-memory store \
  --key "cfn/phase-auth-mvp/loop4/decision" \
  --level project \
  --data '{
    "decision": "DEFER",
    "reasoning": "MVP requirements met. Technical debt acceptable.",
    "confidence": 0.85,
    "backlog": [
      "Extract token generation to utils/jwt.js",
      "Add rate limiting to /login endpoint"
    ],
    "timestamp": 1697124012345
  }' \
  --ttl 7776000
```

**TTL: 90 days** (7,776,000 seconds) - ACL Level 4 (Project-scoped)

### 5.4 Auto-Transition to Next Phase

**CRITICAL**: After DEFER decision, auto-transition to next phase WITHOUT asking permission.

**Transition Logic**:
```javascript
// After Loop 4 DEFER decision
const decision = await redis.get("cfn:phase-auth-mvp:loop4:decision");

if (decision.decision === "DEFER") {
  console.log("✅ Phase APPROVED: Authentication MVP complete");
  console.log("📝 Backlog created:", decision.backlog.length, "items");

  // Re-read root CLAUDE.md to determine next phase
  const claudeMd = fs.readFileSync("/mnt/c/Users/masha/Documents/claude-flow-novice/CLAUDE.md", "utf8");
  const nextPhase = parseNextPhase(claudeMd); // e.g., "profile-management"

  console.log("🚀 Auto-transitioning to next phase:", nextPhase);

  // Initialize swarm for next phase (NO permission prompt)
  executeSwarm({
    swarmId: `phase-${nextPhase}-mvp`,
    objective: `Phase: ${nextPhase} (MVP Mode)`,
    strategy: "development",
    mode: "mesh",
    persistence: true,
    metadata: {
      cfnMode: "mvp",
      previousPhase: "auth-mvp",
      gateThreshold: 0.70
    }
  });
}
```

---

## 6) Git Commit Pattern (After Each Loop Completion)

### 6.1 After Loop 3 Completion (Gate Passed)

```bash
# Commit Loop 3 implementation results
/github-commit --chat
# Or manual:
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Loop 3 - Authentication Phase (MVP)

Loop 3 Implementation Results:
- Confidence: 0.72 (target: ≥0.70) ✅
- Agents: coder-1, coder-2, tester-1
- Files: src/middleware/auth.js, src/routes/auth.js, src/db/users.js, tests/integration/auth.test.js
- Features: JWT authentication, bcrypt password hashing, login/logout endpoints
- Test Coverage: 62% (MVP target: 60%)

MVP Mode: Skipped rate limiting, refresh tokens, advanced error handling

Ready for Loop 2 validation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### 6.2 After Loop 2 Validation (Consensus Passed)

```bash
# Commit Loop 2 validation results
/github-commit --chat
# Or manual:
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Loop 2 - Validation Phase (MVP)

Loop 2 Validation Results:
- Consensus: 0.80 (target: ≥0.80) ✅
- Validators: reviewer-1 (0.82), tester-1 (0.78)
- Issues: 1 low-severity (code duplication, deferred)
- Recommendations: Add rate limiting post-MVP, increase test coverage to 80%

MVP Mode: Accepted technical debt for speed

Ready for Loop 4 Product Owner decision

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### 6.3 After Loop 4 Decision (DEFER)

```bash
# Commit Loop 4 product owner decision
/github-commit --chat
# Or manual:
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Phase - Authentication System (MVP)

Loop 4 Product Owner Decision: DEFER ✅
- Phase: Authentication System COMPLETE (MVP)
- Overall Confidence: 0.85
- Status: Approved for MVP, technical debt backlogged
- Backlog Items: 5 (rate limiting, test coverage, docs, E2E tests, refactoring)

MVP Mode: Speed-prioritized, working implementation shipped

Next: Auto-transition to Profile Management phase

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### 6.4 After Sprint Completion (Multiple Phases Done)

```bash
# Commit sprint summary
/github-commit --full
# Triggers /cfn-loop-document automatically
# Or manual:
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Sprint 1 - User Management (MVP)

Sprint Summary:
- Phases Completed: Auth (0.85), Profile (0.82), Permissions (0.78)
- Total Agents: 9 (3 per phase)
- Sprint Confidence: 0.82 (MVP mode)
- Status: All phases approved for MVP, backlog created
- Backlog Items: 15 (technical debt, enhancements, docs)

MVP Mode: Fast iteration achieved, 3 phases in 2 days

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## 7) MVP-Specific Instructions

### 7.1 Product Owner Decision Bias

**MVP Mode Philosophy**: "Ship fast, iterate later. Technical debt is acceptable for MVP validation."

**Decision Rubric**:
- **Working implementation** > Perfect architecture
- **Core functionality** > Edge cases
- **Speed to market** > Comprehensive testing
- **User feedback** > Internal quality metrics

**Example Decision**:
```
Consensus: 0.80
Core Features: ✅ Login, logout, protected routes work
Critical Bugs: None
Technical Debt: Code duplication, missing docs, 62% coverage (target: 80%)

Decision: DEFER
Reasoning: MVP requirements met. Users can authenticate. Technical debt acceptable for validation phase. Backlog created for post-MVP iteration.
```

### 7.2 Skip Validations (MVP Mode)

**Accessibility (WCAG 2.1 AA)**:
- Skip: Screen reader support, keyboard navigation, color contrast
- Reason: MVP focuses on core functionality, not compliance
- Post-MVP: Add accessibility checklist to backlog

**Performance Benchmarks**:
- Skip: Load testing, stress testing, response time optimization
- Reason: Early users tolerate slower performance
- Post-MVP: Add performance testing after user validation

**Comprehensive Documentation**:
- Skip: API docs (use auto-generated), architecture diagrams, deployment guides
- Reason: Team understands codebase, external docs not critical for MVP
- Post-MVP: Add documentation after API stabilizes

**SEO Optimization**:
- Skip: Meta tags, sitemap, robots.txt, structured data
- Reason: MVP not focused on organic traffic
- Post-MVP: Add SEO after product-market fit

**Internationalization (i18n)**:
- Skip: Multi-language support, locale formatting
- Reason: MVP targets single market/language
- Post-MVP: Add i18n after market expansion

**Advanced Security Audits**:
- Keep: OWASP Top 10 basic checks (SQL injection, XSS, authentication)
- Skip: Penetration testing, threat modeling, security certifications
- Reason: Basic security sufficient for MVP, advanced audits post-launch

### 7.3 Prioritization Rules

**MUST HAVE** (block MVP launch):
- Core functionality (happy path works)
- Basic error handling (500 errors, 404 not found)
- Authentication (if required)
- Data persistence (database working)
- Basic security (input validation, SQL injection prevention)

**SHOULD HAVE** (defer to backlog):
- Edge case handling
- Comprehensive error messages
- Rate limiting
- Advanced security (CSRF, CORS fine-tuning)
- Code refactoring
- Test coverage >80%

**NICE TO HAVE** (defer to post-MVP):
- Performance optimization
- Accessibility compliance
- Comprehensive documentation
- Internationalization
- SEO optimization
- Advanced analytics

---

## 8) Retry Templates (MVP Mode)

### 8.1 Loop 3 Retry (Confidence <0.70)

**Max Iterations**: 5 (MVP mode)

**Retry Strategy**:
1. **Iteration 1-2**: Fix specific issues identified by agents
2. **Iteration 3-4**: Replace failing agents with specialists
3. **Iteration 5**: Escalate if still failing (ESCALATE to human)

**Example Retry 1** (specific fix):
```javascript
// Agent coder-2 confidence: 0.65 (below 0.70 threshold)
// Issue: Insufficient input validation

[
  {
    agent: "coder-2-retry1",
    task: "Fix input validation issues in user CRUD operations",
    instructions: [
      "Add email format validation",
      "Add password strength check",
      "Handle duplicate email errors",
      "Return proper HTTP status codes"
    ],
    retry_context: {
      iteration: 1,
      originalConfidence: 0.65,
      targetConfidence: 0.70
    }
  }
]
```

**Example Retry 3** (replace with specialist):
```javascript
// Agent coder-2 still at 0.68 after 2 retries
// Replace with security specialist

[
  {
    agent: "security-specialist-1",
    task: "Replace coder-2: Implement secure user CRUD with input validation",
    instructions: [
      "Review coder-2 previous attempts",
      "Implement OWASP input validation best practices",
      "Use parameterized queries to prevent SQL injection",
      "Add input sanitization for XSS prevention"
    ],
    replacement: true,
    retry_context: {
      iteration: 3,
      replacedAgent: "coder-2",
      originalConfidence: 0.68
    }
  }
]
```

### 8.2 Loop 2 Retry (Consensus <0.80)

**Max Iterations**: 5 (MVP mode)

**Retry Strategy**:
1. **Iteration 1-2**: Fix validator-identified issues in Loop 3
2. **Iteration 3-4**: Add missing test coverage or refactor code
3. **Iteration 5**: Escalate if consensus still <0.80

**Example Retry 1** (fix validator issues):
```javascript
// Consensus: 0.75 (below 0.80 threshold)
// Tester feedback: "Test coverage 58% (target: 60%)"

[
  {
    agent: "tester-2-retry1",
    task: "Increase test coverage to meet 60% MVP threshold",
    instructions: [
      "Read tester-1 feedback from SQLite",
      "Add missing edge case tests (expired token, malformed JWT)",
      "Run coverage report",
      "Target: ≥60% coverage"
    ],
    retry_context: {
      iteration: 1,
      consensusTarget: 0.80,
      currentConsensus: 0.75,
      issue: "Test coverage below target"
    }
  }
]
```

**Example Retry 3** (refactor + re-validate):
```javascript
// Consensus: 0.77 after 2 retries
// Reviewer feedback: "Code duplication in auth.js"

[
  {
    agent: "coder-refactor-1",
    task: "Refactor authentication code to reduce duplication",
    instructions: [
      "Extract token generation logic to utils/jwt.js",
      "Extract password hashing to utils/crypto.js",
      "Update imports in auth.js and routes/auth.js",
      "Ensure tests still pass after refactoring"
    ],
    retry_context: {
      iteration: 3,
      consensusTarget: 0.80,
      currentConsensus: 0.77,
      issue: "Code duplication"
    }
  }
]
```

### 8.3 Stop Conditions

**Mandatory Stop** (cannot continue):
- Iteration limits reached (5 for Loop 3, 5 for Loop 2)
- Critical security vulnerability (SQL injection, authentication bypass)
- Critical compilation error (syntax error, missing dependencies)
- Explicit STOP/PAUSE command from user

**Optional Escalate** (human review):
- Consensus stagnant (same score for 3 iterations)
- Conflicting agent feedback (one says pass, another says fail)
- Novel technical challenge (no established best practice)
- Ambiguous requirements (unclear acceptance criteria)

---

## 9) Event Bus Coordination Reference

### 9.1 Publishing Events

**Loop 3 Phase Start**:
```bash
/eventbus publish \
  --type cfn.loop.phase.start \
  --data '{"loop":3,"phase":"auth-mvp","swarmId":"phase-auth-mvp","mode":"mvp"}' \
  --priority 9
```

**Agent Lifecycle Events**:
```bash
# Agent spawned
/eventbus publish \
  --type agent.lifecycle \
  --data '{"agent":"coder-1","status":"spawned","loop":3,"phase":"auth-mvp"}' \
  --priority 8

# Agent completed
/eventbus publish \
  --type agent.complete \
  --data '{"agent":"coder-1","confidence":0.72,"loop":3,"files":["auth.js"]}' \
  --priority 8
```

**Loop 2 Validation Start**:
```bash
/eventbus publish \
  --type cfn.loop.validation.start \
  --data '{"loop":2,"validators":["reviewer-1","tester-1"],"phase":"auth-mvp"}' \
  --priority 9
```

**Loop 4 Decision Published**:
```bash
/eventbus publish \
  --type cfn.loop.decision \
  --data '{"loop":4,"decision":"DEFER","confidence":0.85,"phase":"auth-mvp"}' \
  --priority 9
```

### 9.2 Subscribing to Events

**Subscribe to All CFN Loop Events**:
```bash
/eventbus subscribe \
  --pattern "cfn.loop.*" \
  --handler cfn-coordinator \
  --batch-size 50
```

**Subscribe to Specific Loop**:
```bash
/eventbus subscribe \
  --pattern "cfn.loop.phase.*" \
  --handler loop3-monitor
```

### 9.3 Event Priority Levels

- **Priority 9**: Phase transitions (loop start/end)
- **Priority 8**: Agent lifecycle (spawn/complete)
- **Priority 7**: Progress updates
- **Priority 6**: Coordination messages
- **Priority 5**: Logging/telemetry

---

## 10) Troubleshooting Guide

### 10.1 Common Issues

**Issue**: Agent confidence stuck below 0.70
- **Solution**: Replace agent with specialist (e.g., security-specialist, performance-analyzer)
- **Example**: If coder fails on security validation, spawn security-specialist

**Issue**: Consensus stuck at 0.75-0.79 (just below 0.80 threshold)
- **Solution**: Identify specific validator concern, spawn targeted fix agent
- **Example**: If tester wants 60% coverage and current is 58%, spawn tester to add 2 tests

**Issue**: Loop 3 retry limit reached (5 iterations)
- **Solution**: Escalate to human review, may need requirement clarification
- **Example**: If ambiguous acceptance criteria, pause and ask user for clarification

**Issue**: Validators disagree (one passes, one fails)
- **Solution**: Spawn 3rd validator as tie-breaker OR escalate to product owner
- **Example**: Reviewer says code quality good (0.85), tester says coverage insufficient (0.72)

**Issue**: Redis pub/sub events not received
- **Solution**: Check Redis connection, verify channel names, check TTL expiration
- **Example**: `redis-cli ping` to verify connection, `redis-cli keys "cfn:*"` to check keys

### 10.2 Debugging Commands

**Check Swarm State**:
```bash
# List all active swarms
redis-cli keys "swarm:*"

# Get specific swarm state
redis-cli get "swarm:phase-auth-mvp"
```

**Check Agent Confidence Scores**:
```bash
# Retrieve Loop 3 results
/sqlite-memory retrieve --key "cfn/phase-auth-mvp/loop3/*" --level swarm
```

**Check Consensus Result**:
```bash
# Get Loop 2 consensus
redis-cli get "cfn:phase-auth-mvp:loop2:consensus"
```

**Check Product Owner Decision**:
```bash
# Get Loop 4 decision
/sqlite-memory retrieve --key "cfn/phase-auth-mvp/loop4/decision" --level project
```

**Monitor Event Bus**:
```bash
# Subscribe to all CFN Loop events
redis-cli psubscribe "cfn:loop:*"
```

---

## 11) Summary Checklist

**Before Starting CFN Loop**:
- [ ] Determine CFN mode (MVP: gate 0.70, consensus 0.80)
- [ ] Plan agent count (2-7 for mesh, 8+ for hierarchical)
- [ ] Prepare spawn instructions (unique, non-overlapping)

**During Loop 3 Implementation**:
- [ ] Initialize swarm ONCE per phase
- [ ] Spawn all agents in single message
- [ ] Coordinate via Redis pub/sub (MANDATORY)
- [ ] Run post-edit hook after every file edit
- [ ] Store results in SQLite with ACL Level 1
- [ ] Check gate (all agents ≥0.70)

**During Loop 2 Validation**:
- [ ] Spawn 2 validators (reviewer + tester) after gate passes
- [ ] Never mix implementers and validators in same message
- [ ] Validators read Loop 3 results from SQLite
- [ ] Publish validation results to Redis
- [ ] Store results in SQLite with ACL Level 3
- [ ] Calculate consensus (≥0.80 required)

**During Loop 4 Decision**:
- [ ] Spawn single product owner after consensus passes
- [ ] Product owner reads all Loop 3 + Loop 2 memory
- [ ] Make GOAP decision (PROCEED/DEFER/ESCALATE)
- [ ] MVP bias: favor DEFER (approve + backlog) over PROCEED (rework)
- [ ] Store decision in SQLite with ACL Level 4
- [ ] Auto-transition to next phase (NO permission prompt)

**After Each Loop Completion**:
- [ ] Commit Loop 3 results with `/github-commit --chat`
- [ ] Commit Loop 2 consensus with `/github-commit --chat`
- [ ] Commit Loop 4 decision with `/github-commit --chat`
- [ ] Commit sprint summary with `/github-commit --full`

**Error Handling**:
- [ ] Retry Loop 3 max 5 iterations
- [ ] Retry Loop 2 max 5 iterations
- [ ] Escalate after iteration limits or critical errors
- [ ] Never ask permission to retry (auto-retry within limits)

---

## 12) Quick Reference

**Mode Thresholds**:
```
MVP Mode:
- Gate: ≥0.70
- Consensus: ≥0.80
- Validators: 2
- Max Iterations: 5 (Loop 3), 5 (Loop 2)
```

**Agent Spawning**:
```javascript
// Loop 3: Implementers (batch spawn)
[
  { agent: "coder-1", task: "...", confidence_target: 0.70 },
  { agent: "coder-2", task: "...", confidence_target: 0.70 }
]

// Loop 2: Validators (batch spawn, after gate passes)
[
  { agent: "reviewer-1", task: "...", consensus_target: 0.80 },
  { agent: "tester-1", task: "...", consensus_target: 0.80 }
]

// Loop 4: Product Owner (single spawn, after consensus passes)
[
  { agent: "product-owner-1", task: "...", decision_target: "DEFER" }
]
```

**Memory Keys**:
```
Loop 3: cfn/phase-{id}/loop3/agent-{id} (ACL Level 1, TTL 30d)
Loop 2: cfn/phase-{id}/loop2/validation/{id} (ACL Level 3, TTL 7d)
Loop 4: cfn/phase-{id}/loop4/decision (ACL Level 4, TTL 90d)
```

**Redis Channels**:
```
cfn:loop3:agent:lifecycle    - Agent spawn/terminate
cfn:loop3:agent:complete     - Confidence scores
cfn:loop2:validator:complete - Validation results
cfn:loop2:consensus          - Consensus calculation
cfn:loop4:decision           - Product owner decision
```

**Git Commits**:
```bash
/github-commit --chat  # After Loop 3, Loop 2, Loop 4
/github-commit --full  # After sprint completion
```

---

**MVP Mode Philosophy**: "Prioritize working implementation over perfect architecture. Ship fast, iterate later. Technical debt acceptable for MVP validation."
