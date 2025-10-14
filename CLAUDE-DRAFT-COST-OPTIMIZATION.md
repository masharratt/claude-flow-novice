# Agent Spawning Cost Optimization Strategies (DRAFT)

**Status:** Documentation for review - three proven strategies for balancing quality and cost

---

## Overview

This repository supports three agent spawning strategies, each with different cost and quality tradeoffs:

| Strategy | Cost per 1M tokens | Quality | Use Case | Savings |
|----------|-------------------|---------|----------|---------|
| **Pure Claude (Task tool)** | $15 | Highest | Critical features, complex logic | Baseline |
| **Pure Router (CLI commands)** | $0.10-2 | Good | Bulk operations, proven patterns | 87-99% |
| **Hybrid (Task + CLI)** | ~$1-4 | High | Most features, balanced approach | 80-95% |

---

## Strategy 1: Pure Claude (Task Tool)

**Current default approach** - Use Claude Code's Task tool for all agent spawning.

### When to Use
- Complex reasoning required
- Novel problem domains
- High-stakes production code
- When quality matters more than cost

### Example Pattern
```javascript
// Spawn all agents using Task tool in ONE message
Task("Coordinator", "Lead swarm coordination", "coordinator")
Task("Backend Dev", "Implement server-side features", "coder")
Task("Frontend Dev", "Build UI components", "coder")
Task("QA Engineer", "Create and run tests", "tester")
```

### Cost Profile
- All agents use Claude API ($15/1M tokens)
- Best quality, highest cost
- Proven in CLAUDE.md for general development

---

## Strategy 2: Pure Router (CLI Commands)

**Production-ready** - Use bash/node CLI commands with z.ai routing for ALL agents.

### When to Use
- Well-defined tasks (CRUD, file generation, reviews)
- Bulk operations (70+ files)
- Budget-conscious projects
- Proven coordination patterns

### Example Pattern
```bash
# Direct swarm execution (Redis-backed)
node tests/manual/test-swarm-direct.js "Create REST API" \
  --executor \
  --max-agents 3 \
  --strategy development \
  --mode mesh

# All agents coordinate via Redis pub/sub
# Model: z.ai glm-4.6 ($0.10-2/1M tokens)
```

### Cost Profile
- All agents use z.ai router ($0.10-2/1M tokens)
- 87-99% cost savings vs pure Claude
- **Production-proven:** Layers 1 & 2 achieve 100% success rate

### Production Evidence
From `ENTERPRISE_COORDINATION_FINAL_REPORT.md`:

**Layer 1 (Mesh Coordination):**
- Status: ✅ PRODUCTION READY
- 70/70 files, 0 conflicts, 100% success rate
- Real Z.ai API (glm-4.6 model)
- 140 Redis pub/sub messages, 0 race conditions

**Layer 2 (Review Coordination):**
- Status: ✅ PRODUCTION READY
- 70/70 reviews, 100% pass rate
- Dynamic scaling (3-10 reviewers based on queue)
- Real Z.ai API, 350 timeline events

---

## Strategy 3: Hybrid (Recommended)

**Best balance** - Coordinator via Task tool, workers via CLI commands.

### Architecture
```
Main Claude Session
  ↓ Task tool (Claude $15/1M)
Coordinator Agent
  ↓ bash/node CLI (z.ai $0.10-2/1M)
Worker Agents 1-N
  ↓ Redis pub/sub coordination
Results aggregated back up
```

### When to Use
- Most feature development
- When you need coordinator intelligence
- When worker tasks are well-defined
- 80-95% cost savings with high quality

### Example Pattern

**Step 1: Spawn coordinator via Task tool**
```javascript
Task("SwarmLead",
  `Coordinate implementation of authentication system.
   Spawn 5 workers via CLI:
   node tests/manual/test-swarm-direct.js "Auth implementation" --executor --max-agents 5

   Workers handle: JWT tokens, session management, rate limiting, tests, docs.
   Coordinate via Redis pub/sub on channels:
   - swarm:coordination
   - swarm:auth:*

   Aggregate results and report confidence scores.`,
  "coordinator"
)
```

**Step 2: Coordinator spawns workers via CLI**
```bash
# Coordinator executes this command
node tests/manual/test-swarm-direct.js \
  "Implement authentication with JWT, sessions, rate limiting" \
  --executor \
  --max-agents 5 \
  --strategy development \
  --mode mesh \
  --swarm-id "auth-workers-001"
```

**Step 3: Redis coordination**
```bash
# Workers publish to Redis
redis-cli publish "swarm:auth:worker-1:complete" '{
  "worker": "coder-1",
  "task": "jwt-implementation",
  "confidence": 0.85,
  "files": ["src/auth/jwt.ts"]
}'

# Coordinator subscribes and aggregates
redis-cli subscribe "swarm:auth:*:complete"
```

### Cost Breakdown
- 1 Coordinator agent: $15/1M tokens (~10K tokens = $0.15)
- 5 Worker agents: $1/1M tokens each (~50K tokens = $0.05 total)
- **Total: $0.20 vs $1.00 pure Claude (80% savings)**

### Production Evidence
From report lines 68-74 (Layer 1):
- Coordinator-A and Coordinator-B spawned via CLI
- Communicated via Redis pub/sub
- 35 files each, 0 conflicts, 100% success

---

## Decision Tree

```
Is quality more important than cost?
├─ YES → Pure Claude (Task tool)
│
└─ NO → Is task well-defined and proven?
    ├─ YES → Pure Router (CLI commands)
    │
    └─ NO → Hybrid (Task coordinator + CLI workers)
```

---

## Redis Pub/Sub Coordination (All Strategies)

**Mandatory for CLI strategies** - All agents MUST coordinate via Redis.

### Channel Naming
```bash
swarm:coordination          # General coordination
swarm:{phase}:*             # Phase-specific channels
swarm:{phase}:{worker}:*    # Worker-specific events
```

### Security Requirements
From security audit (report lines 401-410):

**CRITICAL (Must fix before production):**
1. Enable Redis authentication globally (8 hours)
2. Add JSON schema validation for messages (12 hours)
3. Implement HMAC-SHA256 message signing (6 hours)

```bash
# Secure Redis configuration
redis-cli CONFIG SET requirepass "${REDIS_PASSWORD}"
redis-cli AUTH "${REDIS_PASSWORD}"

# TLS encryption
redis://localhost:6379 → rediss://localhost:6379
```

---

## Cost Comparison: Real Example

**Task: Generate 70 REST API endpoints**

### Pure Claude
```
70 agents × $15/1M × 20K tokens avg = $21.00
```

### Pure Router
```
70 agents × $0.50/1M × 20K tokens avg = $0.70
Savings: $20.30 (97%)
```

### Hybrid
```
1 coordinator × $15/1M × 15K tokens = $0.225
70 workers × $0.50/1M × 20K tokens = $0.70
Total: $0.925
Savings: $20.08 (96%)
```

---

## CLI Command Reference

### Initialize Swarm (Redis-backed)
```bash
node tests/manual/test-swarm-direct.js "Objective" \
  --executor \
  --max-agents 5 \
  --strategy development \
  --mode mesh
```

### Swarm Recovery (After Interruption)
```bash
# Redis persistence enables recovery
redis-cli keys "swarm:*"  # Find interrupted swarms
node tests/manual/test-swarm-recovery.js
```

### Monitor Progress
```bash
redis-cli MONITOR  # Watch all Redis commands
redis-cli SUBSCRIBE "swarm:*"  # Subscribe to swarm events
```

---

## Implementation Checklist

### Using Pure Router
- [ ] Ensure Redis is running and secured
- [ ] Set `Z_AI_API_KEY` environment variable
- [ ] Test CLI execution: `node tests/manual/test-swarm-direct.js --help`
- [ ] Define objective clearly (agents work autonomously)
- [ ] Set up Redis pub/sub monitoring

### Using Hybrid
- [ ] Same as Pure Router, plus:
- [ ] Define coordinator responsibilities clearly
- [ ] Specify CLI command for coordinator to execute
- [ ] Define Redis channels for coordination
- [ ] Implement result aggregation logic in coordinator

---

## Limitations & Tradeoffs

### Pure Router
**Pros:**
- ✅ Maximum cost savings (87-99%)
- ✅ Production-proven (Layers 1 & 2)
- ✅ Redis state survives interruptions
- ✅ No Claude Code session limits

**Cons:**
- ⚠️ Less flexible for novel problems
- ⚠️ Requires well-defined tasks
- ⚠️ Redis dependency (must be secured)

### Hybrid
**Pros:**
- ✅ 80-95% cost savings
- ✅ Coordinator intelligence for complex decisions
- ✅ Worker cost efficiency
- ✅ Best of both worlds

**Cons:**
- ⚠️ More complex setup
- ⚠️ Coordinator must know CLI commands
- ⚠️ Redis coordination required

---

## Next Steps

1. **Try Pure Router** for well-defined tasks first
2. **Use Hybrid** for most feature development
3. **Reserve Pure Claude** for complex/novel problems
4. **Monitor costs** and adjust strategy based on results

---

## References

- Production validation: `ENTERPRISE_COORDINATION_FINAL_REPORT.md`
- Layer 1 implementation: `tests/hello-world/layer1-mesh-coordination.js`
- Layer 2 implementation: `tests/hello-world/layer2-review-coordination.js`
- CLI executor: `tests/manual/test-swarm-direct.js`
- Security audit: Report lines 383-469
