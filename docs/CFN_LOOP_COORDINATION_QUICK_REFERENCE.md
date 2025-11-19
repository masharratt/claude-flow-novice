# CFN Loop Coordination Quick Reference

**Companion to:** `/home/user/claude-flow-novice/docs/CFN_LOOP_DOCKER_COORDINATION_PATTERNS.md`

## Core Concepts at a Glance

### Three Execution Modes

```
TASK MODE          CLI MODE (Recommended)    DOCKER MODE
─────────          ──────────────────────    ───────────
Direct spawning    Coordinator-based        Container-isolated
$0.15/iter        $0.054/iter (64% savings) Container per agent
Full visibility   Progress reports          Service discovery
<5 min tasks      >5 min tasks              High isolation
No coordination   Redis coordination        Network: mcp-network
```

### Redis Coordination Primitives

| Pattern | Type | Use Case | Example |
|---------|------|----------|---------|
| `swarm:${TASK_ID}:${AGENT_ID}:done` | List (LPUSH/BLPOP) | Agent completion signal | Agent finish → Coordinator unblock |
| `swarm:${TASK_ID}:${AGENT_ID}:confidence` | String (SET/GET) | Confidence/consensus scores | 0.0-1.0 confidence value |
| `swarm:${TASK_ID}:${AGENT_ID}:result` | Hash (HSET/HGETALL) | Test results, deliverables | pass_rate, test_count, files |
| `swarm:${TASK_ID}:gate-passed` | List (broadcast) | Gate pass signal to Loop 2 | Conditional workflow progression |
| `swarm:${TASK_ID}:loop3:agent_ids:iteration${N}` | Set (SADD/SMEMBERS) | Agent instance tracking | List all agents per iteration |

### Test-Driven Gate Check

```
Accuracy Improvement: 55% (confidence) → 95%+ (test-driven)

Process:
1. Agent runs test suite from success criteria
2. Calculate: pass_rate = PASS / (PASS + FAIL)
3. Agent reports to Redis: HSET result test_pass_rate 0.95
4. Coordinator aggregates all agents' pass rates
5. Gate check: mean_pass_rate >= threshold?
   ├─ YES (0.925 >= 0.75): Signal Loop 2 to proceed
   └─ NO: Wake Loop 3 for iteration N+1

Thresholds (Standard Mode):
├─ Loop 3 Gate: 0.75 (75% tests must pass)
├─ Loop 2 Consensus: 0.90 (90% validator agreement)
└─ Max Iterations: 10
```

### Docker Service Discovery (Critical!)

```
INSIDE Container (Agent):
✅ CORRECT
  redis-cli -h redis -p 6379        # Service name
  psql -h postgres -U postgres      # Service name

❌ WRONG
  redis-cli -h cfn-redis-1          # Container name doesn't resolve
  redis-cli -h 172.18.0.2           # IP is dynamic, changes at restart

Service Names in mcp-network:
├─ redis (resolves to internal container IP, dynamic)
├─ postgres (resolves to internal container IP, dynamic)
└─ orchestrator (resolves to internal container IP, dynamic)

Container Names (auto-prefixed):
${COMPOSE_PROJECT_NAME}_service_1
```

## Critical Files

| File | Purpose | Lines |
|------|---------|-------|
| `.claude/skills/cfn-loop-orchestration/orchestrate.sh` | Main coordinator, handles all 3 phases | 1,100+ |
| `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh` | Test-driven validation | 250+ |
| `.claude/skills/cfn-redis-coordination/report-completion.sh` | Agent completion signaling | 80+ |
| `.claude/skills/cfn-loop-orchestration/helpers/consensus.sh` | Loop 2 consensus collection | 200+ |
| `docker/Dockerfile.agent` | Agent container image definition | 60+ |
| `CLAUDE.md` (lines 267-410) | CFN Loop architecture patterns | 150+ |

## Command Examples

### Spawn CFN Loop (CLI Mode - Recommended)

```bash
# Production mode with automatic coordinator
/cfn-loop-cli "Implement JWT authentication" --mode=standard

# Or directly with npx
npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id task-$(date +%s) \
  --mode standard \
  --loop3-agents coder,tester \
  --loop2-agents reviewer,security-specialist \
  --product-owner product-owner-agent
```

### Docker Mode Activation

```bash
# With explicit Docker mode
CFN_DOCKER_MODE=true \
CFN_DOCKER_IMAGE=claude-flow-novice:agent \
CFN_DOCKER_NETWORK=mcp-network \
CFN_MEMORY_LIMIT=2g \
/cfn-loop-cli "Build feature" --mode=standard
```

### Multi-Worktree Setup

```bash
# Calculate offset from branch name
BRANCH=$(git rev-parse --abbrev-ref HEAD)
OFFSET=$(echo -n "$BRANCH" | sha256sum | head -c 8)
OFFSET=$((0x${OFFSET:0:4} % 1000))

# Set environment for isolation
export COMPOSE_PROJECT_NAME="cfn-${BRANCH}"
export CFN_REDIS_PORT=$((6379 + OFFSET))
export CFN_POSTGRES_PORT=$((5432 + OFFSET))

# Launch with isolated resources
/cfn-loop-cli "Task" --mode=standard
```

## Troubleshooting Guide

| Issue | Cause | Solution |
|-------|-------|----------|
| Agents never complete | Redis not reachable | Check REDIS_HOST, REDIS_PORT env vars |
| BLPOP timeout (300s) | Agent crashed silently | Check agent logs, verify task-id in Redis |
| Gate check fails | Test pass rate < threshold | Run tests manually, verify success criteria JSON |
| Docker service discovery fails | Using IP or container name | Use service name: redis, not cfn-redis-1 |
| Port conflict in multi-worktree | Same COMPOSE_PROJECT_NAME | Check: echo $COMPOSE_PROJECT_NAME |
| "Consensus on vapor" detected | Tests pass but code broken | Gate threshold too low, increase to 0.80+ |

## Performance Metrics

| Metric | CLI Mode | Task Mode | Docker Mode |
|--------|----------|-----------|-------------|
| Cost per iteration | $0.054 | $0.150 | $0.054 |
| Overhead per agent | 2-5ms | 1-2ms | 50-100ms |
| Network round-trips (MULTI/EXEC) | 1 | 1 | 1 + docker spawn |
| Max parallel agents | 100+ | 10-20 | 20-50 (resource limited) |
| Visibility | Progress reports | Full | Progress reports |

## Key Decisions Made in v3.0

1. **Test-driven gates replace confidence** → 95%+ accuracy
2. **Atomic Redis transactions (MULTI/EXEC)** → 62% coordination overhead reduction
3. **Clean agent exit (no waiting mode)** → Enables adaptive specialization
4. **Service names for Docker DNS** → Robust across restarts
5. **Blocking operations (BLPOP)** → No polling, immediate unblock
6. **Sequential phases (Loop 3 → Gate → Loop 2 → PO)** → Prevents "consensus on vapor"

## Integration Points

```
User Input
    ↓
Main Chat Spawn (/cfn-loop-cli)
    ↓
cfn-v3-coordinator (agent type: cfn-v3-coordinator)
    ├─ orchestrate.sh (main flow)
    ├─ helpers/spawn-agents.sh (Docker or CLI spawning)
    ├─ helpers/gate-check.sh (test-driven validation)
    ├─ helpers/consensus.sh (Loop 2 collection)
    └─ product-owner-decision/execute-decision.sh (PROCEED/ITERATE/ABORT)
    ↓
Redis (:6379 or port offset)
    ├─ LPUSH/BLPOP for completion signals
    ├─ SET/GET for confidence scores
    ├─ HSET/HGETALL for test results
    └─ SMEMBERS for agent tracking
    ↓
Docker or CLI Agent Execution
    ├─ Loop 3: Implement + Test
    ├─ Loop 2: Review + Validate
    └─ PO: Decision Making
    ↓
Final Output (JSON)
    └─ status, iterations, decision, pass_rates, deliverables
```

## See Also

- **Full Analysis:** `docs/CFN_LOOP_DOCKER_COORDINATION_PATTERNS.md` (1,464 lines)
- **Architecture:** `CLAUDE.md` (CFN Loop Orchestration Pattern section)
- **Test-Driven Guide:** `docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md`
- **Agent Selection:** `.claude/skills/cfn-agent-spawning/agent-selection-guide.md`

---

**Last Updated:** 2025-11-19
**Research Confidence:** 0.93
**Validation Rounds:** 4
