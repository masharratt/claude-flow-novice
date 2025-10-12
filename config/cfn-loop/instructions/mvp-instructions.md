# CFN Loop — MVP Mode

**Use when:** Prototypes, MVPs, rapid validation. Speed > perfection.

---

## Thresholds

| Gate (L3) | Consensus (L2) | Max Iters (L3/L2) | Coverage | Validators | PO |
|---|---|---|---|---|---|
| ≥0.70 | ≥0.80 | 5 / 5 | ≥60% | 2 (reviewer + tester) | Single |

---

## Loop Flow

```
Loop 3 (Implementation)
  → Gate ≥0.70 each agent
  → Post-edit hook after every edit
  → Max 5 iterations

Loop 2 (Validation)
  → 2 validators (reviewer + tester)
  → Consensus ≥0.80
  → Max 5 iterations

Loop 4 (Product Owner)
  → Single PO, speed-biased
  → DEFER > PROCEED (accept tech debt)
```

---

## Swarm Init (Once per Phase)

```bash
# Initialize ONCE per phase (persistent through retries)
executeSwarm({
  swarmId: "phase-auth-mvp",
  objective: "Phase: Authentication (MVP)",
  strategy: "development",
  mode: "mesh",
  persistence: true,
  metadata: { cfnMode: "mvp", gateThreshold: 0.70 }
})
```

**Re-init only when:**
- ✅ New phase starts
- ✅ Swarm corruption detected
- ✅ >24h since last activity
- ❌ NOT on Loop 3 retries
- ❌ NOT on Loop 2 validation

---

## Loop 3: Spawn Implementers

**Batch spawn in single message:**

```javascript
// Example: 3 agents for auth phase
[
  {
    agent: "coder-1",
    task: "Implement JWT auth middleware with login/logout. Basic error handling only.",
    instructions: [
      "Create src/middleware/auth.js",
      "Use bcrypt (10 rounds), Redis tokens (1h TTL)",
      "Return 401 for invalid tokens",
      "Skip rate limiting (MVP)"
    ],
    files: ["src/middleware/auth.js", "src/routes/auth.js"],
    confidence_target: 0.70
  },
  {
    agent: "coder-2",
    task: "Design users table, implement CRUD with Prisma.",
    instructions: [
      "Create prisma/schema.prisma with User model",
      "Unique email constraint",
      "Skip soft deletes (MVP)"
    ],
    files: ["prisma/schema.prisma", "src/db/users.js"],
    confidence_target: 0.70
  },
  {
    agent: "tester-1",
    task: "Write integration tests. Happy path + basic errors only.",
    instructions: [
      "Test: POST /login valid credentials → JWT",
      "Test: POST /login invalid → 401",
      "Target: 60% coverage (MVP)"
    ],
    files: ["tests/integration/auth.test.js"],
    confidence_target: 0.70
  }
]
```

**Topology:**
- **Mesh** (2-7 agents): Direct peer coordination
- **Hierarchical** (8+ agents): Coordinator + teams

---

## Redis Pub/Sub (Mandatory)

**All agent coordination MUST use Redis.**

```bash
# Phase start
redis-cli publish "cfn:phase:start" '{"phase":"auth-mvp","mode":"mvp","swarmId":"phase-auth-mvp"}'

# Agent lifecycle
redis-cli publish "cfn:loop3:agent:lifecycle" '{"agentId":"coder-1","status":"spawned","phase":"auth-mvp"}'

# Progress updates
redis-cli publish "cfn:loop3:agent:progress" '{"agentId":"coder-1","progress":0.50,"currentFile":"auth.js"}'

# Completion + confidence
redis-cli publish "cfn:loop3:agent:complete" '{
  "agentId":"coder-1",
  "confidence":0.72,
  "reasoning":"Tests pass, basic security clean",
  "filesChanged":["src/middleware/auth.js"]
}'

# Gate check result
redis-cli publish "cfn:loop3:gate:result" '{"passed":true,"avgConfidence":0.72,"target":0.70}'

# Validator spawn
redis-cli publish "cfn:loop2:validator:spawned" '{"validatorId":"reviewer-1","phase":"auth-mvp"}'

# Phase complete (after PO decision)
redis-cli publish "cfn:phase:complete" '{"phase":"auth-mvp","decision":"DEFER","nextPhase":"profile"}'
```

---

## SQLite Memory Storage

**Loop 3 results** (ACL Level 1: Private, 30-day TTL):

```bash
/sqlite-memory store \
  --key "cfn/phase-auth-mvp/loop3/agent-coder-1" \
  --level agent \
  --data '{"confidence":0.72,"filesChanged":["auth.js"],"blockers":[]}' \
  --ttl 2592000
```

---

## Post-Edit Hook (Mandatory)

```bash
# Run after EVERY file edit
node config/hooks/post-edit-pipeline.js "src/middleware/auth.js" \
  --memory-key "cfn/phase-auth-mvp/loop3/coder-1" \
  --minimum-coverage 60 \
  --skip-accessibility \
  --skip-performance
```

**Validates:**
- ✅ TDD compliance
- ✅ Security (basic OWASP, no eval(), SQLi detection)
- ✅ Coverage ≥60%
- ❌ Accessibility (skip)
- ❌ Performance benchmarks (skip)

---

## Gate Check (≥0.70)

```bash
# Check all agents ≥0.70
redis-cli get "cfn:phase-auth-mvp:loop3:aggregate"

# Pass: All ≥0.70 → Proceed to Loop 2
# Fail: Retry with specialists (max 5 iterations)
```

**Retry strategy:**
1. Replace failing agents with specialists
2. Add missing roles (security if auth fails)
3. Max 5 iterations → escalate if still failing

---

## Loop 2: Spawn Validators

**After Loop 3 gate passes, spawn 2 validators:**

```javascript
[
  {
    agent: "reviewer-1",
    task: "Review code quality and maintainability (MVP standards).",
    instructions: [
      "Read Loop 3 results from SQLite",
      "Check error handling, code duplication",
      "Skip advanced patterns (MVP)",
      "Target: ≥0.80 consensus"
    ],
    consensus_target: 0.80
  },
  {
    agent: "tester-1",
    task: "Validate test coverage ≥60% (MVP).",
    instructions: [
      "Read Loop 3 results",
      "Run tests, check coverage",
      "Skip edge cases (MVP)",
      "Target: ≥0.80 consensus"
    ],
    consensus_target: 0.80
  }
]
```

**Redis coordination:**

```bash
# Validator completion
redis-cli publish "cfn:loop2:validator:complete" '{
  "validatorId":"reviewer-1",
  "confidence":0.82,
  "reasoning":"Quality good. Minor duplication acceptable for MVP.",
  "issues":[{"severity":"low","description":"Extract utils","defer":true}]
}'
```

---

## Consensus Calculation (≥0.80)

```javascript
// Weighted average (50% each validator)
const consensus = (
  reviewer.confidence * 0.5 +
  tester.confidence * 0.5
);

// ALWAYS proceed to Loop 4 regardless of consensus
// Product Owner can override validator recommendations
// Validators provide recommendations, not gate-blocking decisions
```

**Redis event:**

```bash
# Publish consensus result (always proceed to Loop 4)
redis-cli publish "cfn:loop2:consensus:complete" '{
  "consensus":0.78,
  "target":0.80,
  "met":false,
  "recommendations":["Increase test coverage","Extract utils"],
  "action":"proceed_to_loop4"
}'
```

---

## Loop 4: Product Owner

**Spawn single PO after Loop 2 passes:**

```javascript
[
  {
    agent: "product-owner-1",
    task: "GOAP decision: PROCEED / DEFER / ESCALATE. MVP bias: favor DEFER.",
    instructions: [
      "Read Loop 3 + Loop 2 results from SQLite",
      "Decision: Working implementation? → DEFER",
      "Critical bugs? → PROCEED",
      "Ambiguous requirements? → ESCALATE"
    ],
    decision_target: "DEFER"
  }
]
```

**Decision criteria:**
- **DEFER** (approve + backlog): Consensus ≥0.80 OR PO overrides validator concerns, launch agents for next phase
- **PROCEED** (rework): Missing core functionality, critical bugs, launch targeted fix agents
- **ESCALATE**: Ambiguous requirements, conflicting feedback, human review

**PO can override validators:** Even if consensus <0.80, PO can DEFER if validator concerns are out-of-scope or can be backlogged.

**MVP bias:** Accept tech debt. Speed > perfection.

**Redis events:**

```bash
# Publish PO decision
redis-cli publish "cfn:loop4:decision:made" '{
  "decision":"DEFER",
  "consensus":0.78,
  "override":true,
  "reasoning":"Validator concerns out-of-scope, backlog for v2",
  "action":"launch_next_phase_agents"
}'

# Publish phase complete
redis-cli publish "cfn:phase:complete" '{
  "phase":"auth-mvp",
  "decision":"DEFER",
  "nextPhase":"profile-management",
  "action":"spawn_agents"
}'
```

---

## Git Commits

```bash
# After Loop 3 complete
/github-commit --chat

# After Loop 2 validation
/github-commit --chat

# After Loop 4 decision
/github-commit --chat

# After sprint complete
/github-commit --full  # Auto-triggers /cfn-loop-document
```

---

## Skip Validations (MVP Mode)

- ❌ Accessibility (WCAG)
- ❌ Performance benchmarks
- ❌ Comprehensive docs
- ❌ SEO optimization
- ❌ i18n (internationalization)
- ❌ Advanced security audits
- ✅ Basic OWASP checks (SQLi, XSS, eval)

---

## Retry Templates

**Loop 3 retry** (confidence <0.70):

```bash
# Replace failing agent
agent: "security-specialist-1"
task: "Fix auth security issues (previous: 0.68)"
instructions: [
  "Review failed attempt",
  "Add input validation, parameterized queries",
  "Target: ≥0.70"
]
```

**Loop 2 retry** (PO decides PROCEED):

```bash
# If PO votes PROCEED (not DEFER), relaunch Loop 3 with targeted fixes
agent: "tester-2-retry"
task: "Increase coverage to 60% per PO decision"
instructions: [
  "Read validator feedback from Loop 2",
  "Add 2 missing tests",
  "Target: Address PO blocking concerns"
]

# Publish retry event
redis-cli publish "cfn:loop3:retry" '{
  "iteration":2,
  "reason":"PO voted PROCEED - address test coverage",
  "targetAgent":"tester-2"
}'
```

---

## Stop Criteria

**Mandatory stop:**
- Iteration limits reached (5 L3, 5 L2)
- Critical security error (SQLi, XSS)
- Compilation error blocking progress
- Explicit STOP/PAUSE command

---

## Quick Reference

**Thresholds:**
- Gate: ≥0.70
- Consensus: ≥0.80
- Coverage: ≥60%

**Memory Keys:**
```
Loop 3: cfn/phase-{id}/loop3/agent-{id} (ACL 1, 30d)
Loop 2: cfn/phase-{id}/loop2/validation/{id} (ACL 3, 7d)
Loop 4: cfn/phase-{id}/loop4/decision (ACL 4, 90d)
```

**Redis Channels:**
```
cfn:loop3:agent:lifecycle
cfn:loop3:agent:complete
cfn:loop2:validator:complete
cfn:loop4:decision
```

---

**MVP Philosophy:** Ship fast, iterate later. Technical debt acceptable for validation.
