# CFN Loop — Standard Mode (Default)

**Use when:** General feature development requiring balanced quality and velocity.

---

## Thresholds

| Gate (L3) | Consensus (L2) | Max Iters (L3/L2) | Coverage | Validators | PO |
|---|---|---|---|---|---|
| ≥0.75 | ≥0.90 | 10 / 10 | ≥80% | 4 (quality, security, perf, tester) | Single |

---

## Loop Flow

```
Loop 3 (Implementation)
  → Gate ≥0.75 each agent
  → Full validation suite (quality, security, perf, tests)
  → Max 10 iterations

Loop 2 (Validation)
  → 4 validators (code-quality, security, perf, tester)
  → Consensus ≥0.90
  → Max 10 iterations

Loop 4 (Product Owner)
  → Single PO, balanced criteria
  → DEFER for quality work, PROCEED for critical issues
```

---

## Swarm Init (Once per Phase)

```bash
# Initialize ONCE per phase (persistent through retries)
node tests/manual/test-swarm-direct.js \
  "Phase: Authentication System" \
  --executor \
  --max-agents 7 \
  --strategy development \
  --mode mesh \
  --swarm-id "phase-auth-implementation"

# Store state in Redis (survives interruptions)
redis-cli setex "swarm:phase-auth-implementation:state" 86400 '{
  "swarmId":"phase-auth-implementation",
  "phase":"auth",
  "mode":"mesh",
  "persistence":true
}'
```

**Re-init only when:**
- ✅ New phase starts
- ✅ Swarm corruption detected
- ✅ >24h since last activity
- ❌ NOT on Loop 3 retries
- ❌ NOT on Loop 2 validation

---

## Loop 3: Hybrid CLI Routing (Claude Max Mode)

**When hybrid routing enabled (default with `/switch-api max`):**

### Architecture

```
Main Chat (Claude Max subscription, $0)
  ↓
  Task("CFN-Loop3-Coordinator", "...", "coordinator")
  ↓
  Coordinator (Claude Max via Task tool, $0)
  ↓
  node tests/manual/test-swarm-direct.js
  ↓
  Worker Agents (z.ai via CLI, $0.10-2/1M)
```

### Coordinator Spawning Pattern

**IMPORTANT:** The coordinator itself spawns via the **Task tool** (uses Claude Max subscription, $0 cost):

```javascript
Task("CFN-Loop3-Coordinator",
  `Lead implementation of authentication system...`,
  "coordinator"
)
```

**Workers** spawn via **CLI commands** executed by the coordinator (uses z.ai provider, ~$0.50 cost):

```bash
node tests/manual/test-swarm-direct.js \
  "Implement auth: JWT, sessions" \
  --executor --max-agents 5
```

**Why This Pattern:**
- Coordinator needs intelligent orchestration → Claude Max quality ($0 via subscription)
- Workers execute parallel tasks → z.ai cost efficiency ($0.50 vs $15 per 1M tokens)
- **97% cost savings** while maintaining coordinator intelligence

---

**Spawn coordinator via Task tool (uses Claude Max subscription):**

```javascript
// Spawn coordinator via Task tool (Claude Max subscription, $0)
Task("CFN-Loop3-Coordinator",
  `**You are the coordinator** - spawned via Task tool using Claude Max subscription ($0 cost).
   Your role: Orchestrate workers via CLI.

   Lead implementation of [PHASE_NAME] (e.g., authentication system).

   **Your Mission:**
   Orchestrate [N] worker agents via CLI with intelligent monitoring.

   **Spawning Strategy (Hybrid CLI):**

   1. **Spawn workers via CLI with z.ai provider:**

   \`\`\`bash
   node tests/manual/test-swarm-direct.js \\
     "Implement [PHASE_NAME]: [LIST_COMPONENTS]" \\
     --executor --max-agents [N] --strategy development --mode mesh
   \`\`\`

   2. **Workers coordinate via Redis pub/sub channels:**
      - swarm:[phase]:[agent-id]:complete
      - swarm:[phase]:[agent-id]:progress
      - swarm:[phase]:coordination

   3. **Monitor Redis for worker completion events:**

   \`\`\`bash
   redis-cli SUBSCRIBE "swarm:[phase]:*:complete"
   \`\`\`

   4. **Parse worker completion events:**

   Workers publish JSON:
   \`\`\`json
   {
     "agent": "coder-1",
     "confidence": 0.85,
     "filesModified": ["src/auth/jwt.ts"],
     "linesOfCode": 450,
     "testsWritten": 12,
     "testsPassing": 12,
     "coverage": 0.87,
     "reasoning": "Implementation complete with comprehensive tests",
     "issues": [],
     "recommendations": ["Add edge case tests in Loop 2"]
   }
   \`\`\`

   5. **Error Detection & Recovery:**

   \`\`\`javascript
   // Detect low confidence workers
   if (data.confidence < 0.75) {
     console.log(\`⚠️ \${data.agent} below threshold (\${data.confidence})\`);
     console.log(\`Issue: \${data.reasoning}\`);

     // Relaunch with adjusted prompt
     await spawn(\`node tests/manual/test-swarm-direct.js \\
       "Retry \${data.agent} task - fix: [SPECIFIC_ISSUE]" \\
       --executor --max-agents 1\`);
   }
   \`\`\`

   6. **Aggregate Results & Report:**

   \`\`\`javascript
   const avgConfidence = workers.reduce((sum, w) => sum + w.confidence, 0) / workers.length;
   const allPass = workers.every(w => w.confidence >= 0.75);

   console.log(\`
   ## Loop 3 Complete - [PHASE_NAME] (Standard)

   **Workers:** \${workers.length}
   **Avg Confidence:** \${avgConfidence.toFixed(2)} (target: ≥0.75)
   **Files Modified:** \${totalFiles}
   **Tests Written:** \${totalTests}
   **Status:** \${allPass ? '✅ PASS' : '⚠️ NEEDS_RETRY'}

   **Cost Structure:**
   - You (coordinator): $0 (Claude Max subscription)
   - Workers: \${workers.length} × 200K tokens × $0.50/1M = $\${(workers.length * 0.10).toFixed(2)}
   - Total: ~$\${(workers.length * 0.10).toFixed(2)}
   - Savings: 97% vs pure Claude ($15/1M)

   **Next:** \${allPass ? 'Proceed to Loop 2 validation' : 'Retry failing agents'}
   \`);
   \`\`\`

   **Key Responsibilities in Hybrid Mode:**
   - Intelligent task decomposition (N workers with clear, non-overlapping scopes)
   - Real-time progress monitoring via Redis
   - Autonomous error detection and recovery (relaunch with targeted fixes)
   - Natural language interpretation of worker results
   - Structured reporting to main chat (human-readable summaries)
   - Cost tracking and optimization`,
  "coordinator"
)
```

### Benefits of Hybrid Approach

**vs Pure CLI (no coordinator):**
- ✅ 100% visibility into execution (CLI gives 0%)
- ✅ Natural language progress updates
- ✅ Autonomous error recovery
- ✅ Intelligent result aggregation
- ✅ 30 seconds to understand vs 15 minutes manual review

**vs Pure Claude Max (no workers):**
- ✅ 97% cost savings ($0.50 vs $15 per 1M tokens)
- ✅ Same coordinator quality (Claude Max for orchestration)
- ✅ Parallel worker execution (CLI spawning)

**Trade-offs:**
- ⚠️ Sequential agent spawning (~10s for 5 agents vs instant Task spawning)
- ⚠️ Requires Redis coordination infrastructure

### When Hybrid Routing is Disabled

**Pure provider mode** (all agents use main provider):
- No coordinator intelligence layer
- Direct CLI spawning without orchestration
- Manual result aggregation required

---

## Loop 3: Spawn Implementers

**Batch spawn in single message:**

```bash
Task: Implement authentication phase

Agents (mesh topology, 2-7):
1. coder-1: Core auth logic
   - Files: src/auth/core.ts, src/auth/middleware.ts
   - Focus: JWT tokens, validation
   - Confidence target: ≥0.75

2. coder-2: Session management
   - Files: src/auth/session.ts, src/auth/session-store.ts
   - Focus: Lifecycle, cleanup
   - Confidence target: ≥0.75

3. security-specialist-1: Security hardening
   - Files: src/auth/security.ts, src/auth/rate-limit.ts
   - Focus: Rate limiting, brute force prevention
   - Confidence target: ≥0.75

All coordinate via Redis pub/sub (mandatory).
```

**Hierarchical topology** (8+ agents):

```bash
# Spawn coordinators in mesh, teams under them
Coordinator-auth → Team-auth (5 agents)
Coordinator-payment → Team-payment (7 agents)
Coordinator-catalog → Team-catalog (6 agents)
```

---

## Redis Pub/Sub (Mandatory)

**Channel naming:**
- `cfn.loop.phase.start` - Phase transitions
- `cfn.loop.3.agent.spawned` - Lifecycle
- `cfn.loop.3.agent.complete` - Completion
- `cfn.loop.3.gate.check` - Gate evaluation

**Events:**

```bash
# Phase start (priority 9)
redis-cli publish "cfn.loop.phase.start" '{
  "loop":3,"phase":"auth","swarmId":"phase-auth-implementation"
}'

# Agent spawned (priority 8)
redis-cli publish "cfn.loop.3.agent.spawned" '{
  "agent":"coder-1","status":"spawned","loop":3,"phase":"auth"
}'

# Agent complete (priority 8)
redis-cli publish "cfn.loop.3.agent.complete" '{
  "agent":"coder-1","confidence":0.85,"files":["src/auth/core.ts"],
  "reasoning":"Tests pass, security clean, coverage 85%"
}'
```

---

## SQLite Memory Storage

### Dual-Write Pattern (Redis + SQLite)

**Architecture**: Write to Redis (hot, ephemeral) + SQLite (warm, persistent)
**Performance**: Write <60ms (p95), Read <5ms (Redis) / <20ms (SQLite)
**TTL**: Redis 1h, SQLite 30-365d

### Loop 3 Agent Confidence (ACL 1: Private)

```javascript
// Store agent confidence after implementation
await memory.memoryAdapter.set(
  `cfn/phase-auth/loop3/agent-${agentId}/confidence`,
  {
    confidence: 0.85,
    files: ['src/auth/core.ts', 'src/auth/middleware.ts'],
    linesOfCode: 450,
    testsWritten: 12,
    testsPassing: 12,
    coverage: 0.87,
    reasoning: 'Implementation complete with comprehensive tests',
    blockers: []
  },
  { agentId, aclLevel: 1, namespace: 'cfn-loop', ttl: 2592000 }
);
```

**CLI alternative**:
```bash
/sqlite-memory store \
  --key "cfn/phase-auth/loop3/agent-coder-1" \
  --level private \
  --data '{"confidence":0.85,"files":["src/auth/core.ts"],"reasoning":"Tests pass"}' \
  --ttl 2592000
```

### Loop 3 Phase Results (ACL 3: Swarm)

```javascript
// Aggregate all agent results for gate check
await memory.memoryAdapter.set(
  `cfn/phase-auth/loop3/results`,
  {
    avgConfidence: 0.85,
    agents: ['coder-1', 'coder-2', 'security-specialist-1'],
    gateStatus: 'pass',
    filesModified: 23,
    totalTests: 47,
    totalCoverage: 0.84
  },
  { agentId: 'coordinator', aclLevel: 3, namespace: 'cfn-loop', ttl: 2592000 }
);
```

### Loop 2 Consensus (ACL 3: Swarm)

```javascript
// Store validator consensus results
await memory.memoryAdapter.set(
  `cfn/phase-auth/loop2/consensus`,
  {
    avgConsensus: 0.92,
    validators: [
      { name: 'code-quality', confidence: 0.92 },
      { name: 'security', confidence: 0.95 },
      { name: 'perf', confidence: 0.88 },
      { name: 'tester', confidence: 0.93 }
    ],
    consensusStatus: 'pass',
    recommendations: ['Add factory pattern', 'Improve error messages']
  },
  { agentId: 'coordinator', aclLevel: 3, namespace: 'cfn-loop', ttl: 2592000 }
);
```

### Loop 4 Product Owner Decision (ACL 4: Project)

```javascript
// Store PO decision (long retention for audit)
await memory.memoryAdapter.set(
  `cfn/phase-auth/loop4/decision`,
  {
    decision: 'DEFER',
    reasoning: 'Meets criteria. Validator perf concerns out-of-scope.',
    consensus: 0.87,
    override: true,
    backlogItems: ['Add factory pattern', 'Rate limiting dashboard'],
    nextAction: 'launch agents for user-profile phase'
  },
  { agentId: 'product-owner', aclLevel: 4, namespace: 'cfn-loop', ttl: 31536000 }
);
```

### Cross-Session Recovery

```javascript
// Recover phase state after crash
const consensus = await db.query(`
  SELECT * FROM consensus
  WHERE target_id = ? AND status IN ('pending', 'in_progress')
`, [phaseId]);

if (consensus.length > 0) {
  const { current_score, threshold } = consensus[0];
  if (current_score >= threshold) {
    return { loop: 4, action: 'await_product_owner_decision' };
  } else {
    return { loop: 2, action: 'resume_validation' };
  }
}
```

---

## Post-Edit Hook (Mandatory)

```bash
# Run after EVERY file edit
node config/hooks/post-edit-pipeline.js \
  "src/auth/core.ts" \
  --memory-key "swarm/coder-1/auth-core" \
  --minimum-coverage 80 \
  --tdd-mode \
  --structured
```

**Validates:**
- ✅ TDD compliance
- ✅ Security (eval, secrets, XSS, SQLi)
- ✅ Formatting (Prettier)
- ✅ Coverage ≥80%
- ✅ Performance analysis

**WASM 52x acceleration** (default): AST parsing, linting, type checking

---

## Gate Check (≥0.75)

```bash
# Retrieve all agent scores
/sqlite-memory retrieve \
  --key "cfn/phase-auth/loop3/*" \
  --level swarm \
  | jq '[.[] | .confidence] | add / length'

# Pass: Avg ≥0.75 → Loop 2
# Fail: Retry Loop 3 (max 10 iterations)
```

**Retry strategy:**
1. Replace failing agents with specialists
2. Add missing roles (security if SQLi detected)
3. Target specific issues (raise coverage to 85%)
4. Max 10 iterations → escalate

---

## Loop 2: Spawn Validators

**After Loop 3 gate passes, spawn 4 validators:**

```bash
Task: Validate authentication phase

Validators (batch spawn):
1. code-quality-validator-1: Review quality
   - Read: cfn/phase-auth/loop3/results
   - Focus: SOLID, design patterns, complexity
   - Confidence target: ≥0.90

2. security-specialist-1: Review security
   - Read: cfn/phase-auth/loop3/results
   - Focus: SQLi, XSS, secrets, compliance
   - Confidence target: ≥0.90

3. perf-analyzer-1: Review performance
   - Read: cfn/phase-auth/loop3/results
   - Focus: O(n) complexity, memory leaks
   - Confidence target: ≥0.90

4. tester-1: Review test coverage
   - Read: cfn/phase-auth/loop3/results
   - Focus: Edge cases, integration tests, ≥80% coverage
   - Confidence target: ≥0.90

All coordinate via Redis pub/sub (mandatory).
```

---

## Consensus Calculation (≥0.90)

```javascript
// Weighted average (25% each validator)
const consensus = (
  qualityValidator.confidence * 0.25 +
  securityValidator.confidence * 0.25 +
  perfValidator.confidence * 0.25 +
  testerValidator.confidence * 0.25
);

// ALWAYS proceed to Loop 4 regardless of consensus
// Product Owner can override validator recommendations
// Validators provide recommendations, not gate-blocking decisions
```

**Redis event:**

```bash
# Publish consensus result (always proceed to Loop 4)
redis-cli publish "cfn:loop2:consensus:complete" '{
  "consensus":0.87,
  "target":0.90,
  "met":false,
  "validators":[
    {"name":"code-quality","confidence":0.92},
    {"name":"security","confidence":0.85},
    {"name":"perf","confidence":0.84},
    {"name":"tester","confidence":0.88}
  ],
  "recommendations":["Fix SQLi in auth.ts","Add rate limiting"],
  "action":"proceed_to_loop4"
}'
```

**Store consensus** (ACL Level 3: Swarm, 30-day TTL):

```bash
/sqlite-memory store \
  --key "cfn/phase-auth/loop2/consensus" \
  --level swarm \
  --data '{
    "avgConsensus":0.92,
    "validators":[
      {"name":"code-quality","confidence":0.92},
      {"name":"security","confidence":0.95},
      {"name":"perf","confidence":0.88},
      {"name":"tester","confidence":0.93}
    ],
    "consensusStatus":"pass"
  }' \
  --ttl 2592000
```

---

## Loop 4: Product Owner

**Spawn single PO after Loop 2 passes:**

```bash
Task: Make GOAP decision for authentication phase

Agent: product-owner-1
- Read: cfn/phase-auth/loop2/consensus
- Read: cfn/phase-auth/loop3/results
- Decision Criteria: Standard mode (balanced)
- Output: PROCEED / DEFER / ESCALATE
```

**Decision logic:**

```bash
# PROCEED: Issues can be fixed in current phase
# Action: Relaunch Loop 3 with targeted agents
# Example: "Security issue - fix SQLi before moving on"

# DEFER: Work meets criteria OR validator concerns out-of-scope
# Action: Approve, backlog items, launch agents for next phase
# Example: "Core complete. Rate limiting can be backlogged."
# PO can override validator consensus <0.90 if concerns are out-of-scope

# ESCALATE: Critical ambiguity requiring human review
# Action: Pause, notify human, wait for decision
# Example: "Unclear if OAuth or SAML required"
```

**Redis events:**

```bash
# Publish PO decision
redis-cli publish "cfn:loop4:decision:made" '{
  "decision":"DEFER",
  "consensus":0.87,
  "override":true,
  "reasoning":"Validator perf concerns out-of-scope, defer to v2",
  "action":"launch_next_phase_agents"
}'

# Publish phase complete
redis-cli publish "cfn:phase:complete" '{
  "phase":"auth",
  "decision":"DEFER",
  "nextPhase":"user-profile",
  "action":"spawn_agents"
}'

# Publish phase transition
redis-cli publish "cfn:phase:transition" '{
  "from":"auth",
  "to":"user-profile",
  "trigger":"po_defer_decision"
}'
```

**Store decision** (ACL Level 4: Project, 365-day TTL):

```bash
/sqlite-memory store \
  --key "cfn/phase-auth/loop4/decision" \
  --level project \
  --data '{
    "decision":"DEFER",
    "reasoning":"Meets criteria. Validator perf concerns out-of-scope.",
    "consensus":0.87,
    "override":true,
    "backlogItems":["Add factory pattern","Rate limiting dashboard"],
    "nextAction":"launch agents for user-profile phase"
  }' \
  --ttl 31536000
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

## Retry Templates

**Loop 3 retry** (confidence <0.75):

```bash
# Example: Replace failing agent
Task: Retry Loop 3 - Address low confidence

Replace: coder-1 (0.65) with backend-dev-1
- Issue: Insufficient error handling
- Focus: Comprehensive error recovery
- Target: ≥0.75

Add: security-specialist-2 (missing role)
- Issue: No brute force prevention
- Focus: Exponential backoff
- Target: ≥0.75

Retain: coder-2 (0.87), security-specialist-1 (0.82)
```

**Loop 3 retry** (PO decides PROCEED):

```bash
# If PO votes PROCEED (not DEFER), relaunch Loop 3 with targeted fixes
Task: Retry Loop 3 - Address PO blocking concerns

Target security issue (PO priority):
- security-specialist-2: Fix SQLi per PO decision
- Issue: Unsafe query in auth/core.ts
- Focus: Parameterized queries
- Reason: PO considers this blocking

Target test coverage (if PO requires):
- tester-2: Raise coverage to 85%
- Issue: Edge cases missing
- Focus: Integration tests

# Publish retry event
redis-cli publish "cfn:loop3:retry" '{
  "iteration":3,
  "reason":"PO voted PROCEED - fix SQLi and coverage",
  "targetAgents":["security-specialist-2","tester-2"],
  "blocking_concerns":["SQLi vulnerability","test coverage"]
}'
```

---

## Stop Criteria

**Mandatory stop:**
- Iteration limits reached (10 L3, 10 L2)
- Critical security error (SQLi, XSS, secrets)
- Compilation error blocking progress
- Explicit STOP/PAUSE command

---

## Standard Mode Best Practices

1. **Balance quality and velocity** (≥0.75 gate sufficient, ≥0.90 ensures quality)
2. **Agent selection:** Core team (coder, security, perf) + specialists as needed
3. **Redis coordination:** ALWAYS pub/sub (Critical Rule #19)
4. **SQLite memory:** ACL 1 (Private) for agent data, ACL 3 (Swarm) for shared
5. **Post-edit hook:** Run after EVERY edit (--minimum-coverage 80)
6. **Retry strategy:** Max 10 iterations, replace failing agents, target specific issues
7. **Git commits:** After every loop completion with detailed metadata
8. **Decision criteria:** DEFER most common, PROCEED for critical issues, ESCALATE rare

---

## Quick Reference

**Thresholds:**
- Gate: ≥0.75
- Consensus: ≥0.90
- Coverage: ≥80%

**Memory Keys:**
```
Loop 3: cfn/phase-{id}/loop3/agent-{id} (ACL 1, 30d)
Loop 2: cfn/phase-{id}/loop2/consensus (ACL 3, 30d)
Loop 4: cfn/phase-{id}/loop4/decision (ACL 4, 365d)
```

**Redis Channels:**
```
cfn:phase:start                    # Phase begins
cfn:phase:complete                 # Phase ends (after PO)
cfn:phase:transition               # Phase → phase
cfn:loop3:agent:lifecycle          # Agent spawn/terminate
cfn:loop3:agent:complete           # Agent confidence
cfn:loop3:gate:result              # Gate pass/fail
cfn:loop2:validator:spawned        # Validator start
cfn:loop2:validator:complete       # Validator result
cfn:loop2:consensus:complete       # Consensus result
cfn:loop4:decision:made            # PO decision
cfn:loop3:retry                    # Retry iteration
```

---

**Standard Philosophy:** Balance quality and velocity for production features.
