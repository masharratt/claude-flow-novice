# CFN Loop — Standard Mode with Cost Optimization (DRAFT)

**Use when:** General feature development requiring balanced quality and velocity.

---

## Thresholds

| Gate (L3) | Consensus (L2) | Max Iters (L3/L2) | Coverage | Validators | PO |
|---|---|---|---|---|---|
| ≥0.75 | ≥0.90 | 10 / 10 | ≥80% | 4 (quality, security, perf, tester) | Single |

---

## NEW: Cost-Optimized Agent Spawning

Choose strategy based on task complexity and budget:

| Strategy | Loop 3 Cost | When to Use |
|----------|------------|-------------|
| **Pure Claude (Task)** | $15/1M tokens | Complex logic, novel problems |
| **Pure Router (CLI)** | $0.10-2/1M tokens | CRUD, bulk ops, proven patterns |
| **Hybrid (recommended)** | ~$1-4/1M tokens | Most features, balanced approach |

### Decision Tree
```
Is this a novel/complex problem?
├─ YES → Pure Claude (examples below in "Option A")
│
└─ NO → Is task well-defined (CRUD, files, reviews)?
    ├─ YES → Pure Router (examples in "Option B")
    │
    └─ NO → Hybrid (examples in "Option C")
```

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

**All strategies use the same initialization:**

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

## Loop 3: Spawn Implementers

### OPTION A: Pure Claude (Task Tool)
**Use for:** Complex logic, novel problems, high-stakes code
**Cost:** $15/1M tokens per agent

**Batch spawn in single message:**

```javascript
// Spawn ALL agents using Task tool in ONE message
Task("Auth Core", "Implement JWT validation and token refresh logic.
  Files: src/auth/core.ts, src/auth/middleware.ts
  Confidence target: ≥0.75", "coder")

Task("Session Manager", "Implement session lifecycle and cleanup.
  Files: src/auth/session.ts, src/auth/session-store.ts
  Confidence target: ≥0.75", "coder")

Task("Security Hardening", "Add rate limiting and brute force prevention.
  Files: src/auth/security.ts, src/auth/rate-limit.ts
  Confidence target: ≥0.75", "security-specialist")

TodoWrite {"todos": [
  {"content": "JWT core implementation", "status": "in_progress"},
  {"content": "Session management", "status": "pending"},
  {"content": "Security hardening", "status": "pending"}
]}
```

**Cost Example:** 3 agents × 20K tokens × $15/1M = $0.90

---

### OPTION B: Pure Router (CLI Commands)
**Use for:** CRUD operations, bulk file generation, proven patterns
**Cost:** $0.10-2/1M tokens per agent (87-99% savings)

**Production-proven:** Layers 1 & 2 achieve 100% success rate with this approach.

```bash
# Main Claude session executes CLI command
# All 3 agents use z.ai router, coordinate via Redis

node tests/manual/test-swarm-direct.js \
  "Implement authentication system:
   - JWT validation and refresh (coder-1: src/auth/core.ts, src/auth/middleware.ts)
   - Session lifecycle management (coder-2: src/auth/session.ts, src/auth/session-store.ts)
   - Security hardening with rate limiting (security-1: src/auth/security.ts, src/auth/rate-limit.ts)

   All agents coordinate via Redis pub/sub.
   Target confidence: ≥0.75 per agent.
   Max retries: 5 per task." \
  --executor \
  --max-agents 3 \
  --strategy development \
  --mode mesh \
  --swarm-id "auth-implementation-loop3"

# Monitor progress
redis-cli SUBSCRIBE "swarm:auth-implementation-loop3:*"
```

**Cost Example:** 3 agents × 20K tokens × $0.50/1M = $0.30 (97% savings)

**Redis Coordination:**
```bash
# Agents publish completion events
redis-cli publish "swarm:auth:coder-1:complete" '{
  "agent": "coder-1",
  "task": "jwt-core",
  "confidence": 0.85,
  "files": ["src/auth/core.ts", "src/auth/middleware.ts"]
}'
```

---

### OPTION C: Hybrid (Recommended)
**Use for:** Most features - coordinator intelligence + worker efficiency
**Cost:** ~$1-4/1M tokens (80-95% savings)

**Step 1: Spawn coordinator via Task tool**

```javascript
Task("AuthCoordinator",
  `Lead authentication implementation. Spawn 3 worker agents via CLI:

  node tests/manual/test-swarm-direct.js "Implement auth system" \
    --executor --max-agents 3 --strategy development --mode mesh

  Workers will handle:
  1. JWT core (coder-1: src/auth/core.ts, src/auth/middleware.ts)
  2. Session management (coder-2: src/auth/session.ts, src/auth/session-store.ts)
  3. Security hardening (security-1: src/auth/security.ts, src/auth/rate-limit.ts)

  Monitor Redis pub/sub channels:
  - swarm:auth:*:complete (worker completion)
  - swarm:auth:*:progress (status updates)

  Aggregate confidence scores from all workers.
  Report when all workers achieve ≥0.75 confidence.

  If any worker fails, re-execute CLI with --retry flag.`,
  "coordinator"
)

TodoWrite {"todos": [
  {"content": "Spawn workers via CLI", "status": "in_progress"},
  {"content": "Monitor Redis coordination", "status": "pending"},
  {"content": "Aggregate worker results", "status": "pending"}
]}
```

**Step 2: Coordinator executes CLI (internal)**
```bash
# Coordinator runs this command
node tests/manual/test-swarm-direct.js \
  "Auth implementation: JWT, sessions, security" \
  --executor \
  --max-agents 3 \
  --strategy development \
  --mode mesh
```

**Step 3: Workers coordinate via Redis**
```bash
# Worker publishes progress
redis-cli publish "swarm:auth:coder-1:progress" '{
  "status": "implementing",
  "file": "src/auth/core.ts",
  "progress": 0.6
}'

# Coordinator subscribes and monitors
redis-cli SUBSCRIBE "swarm:auth:*"
```

**Cost Example:**
- 1 coordinator: 15K tokens × $15/1M = $0.225
- 3 workers: 20K tokens × $0.50/1M × 3 = $0.30
- **Total: $0.525 (94% savings)**

---

## Topology Selection (All Strategies)

**Mesh topology** (2-7 agents):
```bash
Agents (mesh topology, 2-7):
1. coder-1: Core auth logic
2. coder-2: Session management
3. security-specialist-1: Security hardening

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

## Redis Pub/Sub (Mandatory for CLI Strategies)

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

## SQLite Memory Storage (All Strategies)

**Loop 3 results** (ACL Level 1: Private, 30-day TTL):

```bash
/sqlite-memory store \
  --key "cfn/phase-auth/loop3/agent-coder-1" \
  --level private \
  --data '{
    "confidence":0.85,
    "files":["src/auth/core.ts"],
    "reasoning":"Tests pass, security clean",
    "coverage":0.85,
    "strategy":"hybrid",
    "cost":"$0.225"
  }' \
  --ttl 2592000
```

**Phase-level results** (ACL Level 3: Swarm, 30-day TTL):

```bash
/sqlite-memory store \
  --key "cfn/phase-auth/loop3/results" \
  --level swarm \
  --data '{
    "avgConfidence":0.85,
    "agents":["coder-1","coder-2","security-specialist-1"],
    "gateStatus":"pass",
    "strategy":"hybrid",
    "totalCost":"$0.525",
    "savingsVsPureClaude":"94%"
  }' \
  --ttl 2592000
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

---

## Cost Tracking Template

After Loop 3 completion, store cost metrics:

```bash
/sqlite-memory store \
  --key "cfn/phase-auth/cost-analysis" \
  --level project \
  --data '{
    "strategy": "hybrid",
    "coordinatorCost": "$0.225",
    "workerCost": "$0.30",
    "totalCost": "$0.525",
    "pureClaude": "$0.90",
    "savings": "94%",
    "agentBreakdown": {
      "coordinator": {"tokens": 15000, "model": "claude", "cost": "$0.225"},
      "coder-1": {"tokens": 20000, "model": "z.ai-glm-4.6", "cost": "$0.10"},
      "coder-2": {"tokens": 20000, "model": "z.ai-glm-4.6", "cost": "$0.10"},
      "security-1": {"tokens": 20000, "model": "z.ai-glm-4.6", "cost": "$0.10"}
    }
  }'
```

---

## Security Considerations (CLI Strategies)

From `ENTERPRISE_COORDINATION_FINAL_REPORT.md` security audit:

**CRITICAL (Must implement before production):**
1. **Redis authentication** (8 hours)
   ```bash
   redis-cli CONFIG SET requirepass "${REDIS_PASSWORD}"
   ```

2. **JSON schema validation** (12 hours)
   - See: `src/security/message-validator.js`

3. **HMAC-SHA256 message signing** (6 hours)
   - See: `src/security/message-signer.js`

**Without these fixes:**
- VULN-001: Unauthorized Redis access (CVSS 8.5 CRITICAL)
- VULN-002: Unsafe JSON deserialization (CVSS 7.8 CRITICAL)
- VULN-003: Message spoofing (CVSS 6.5 MEDIUM)

---

## Production Readiness

### Pure Claude (Task Tool)
- ✅ Production-ready (current default)
- ✅ No additional setup required
- ⚠️ Highest cost ($15/1M tokens)

### Pure Router (CLI Commands)
- ✅ Production-ready (Layers 1 & 2 validated)
- ⚠️ Requires Redis security fixes (26 hours)
- ✅ 87-99% cost savings
- ✅ 100% success rate in validation

### Hybrid (Recommended)
- ✅ Production-ready with Redis security
- ⚠️ Same Redis requirements as Pure Router
- ✅ 80-95% cost savings
- ✅ Best balance of quality and cost

---

## References

- Cost optimization guide: `CLAUDE-DRAFT-COST-OPTIMIZATION.md`
- Production validation: `ENTERPRISE_COORDINATION_FINAL_REPORT.md`
- Security fixes: Report lines 401-469
- CLI executor: `tests/manual/test-swarm-direct.js`
