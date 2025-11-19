# Docker Architecture Summary

Quick reference for Claude Flow Novice Docker infrastructure patterns and processes.

---

## Quick Links

**Comprehensive Report:** [DOCKER_ARCHITECTURE_COMPREHENSIVE_REPORT.md](./architecture/DOCKER_ARCHITECTURE_COMPREHENSIVE_REPORT.md)

**Key Documentation:**
- Multi-Worktree Support: [DOCKER_MULTI_WORKTREE.md](./reference/DOCKER_MULTI_WORKTREE.md)
- Environment Standardization: [DOCKER_ENV_STANDARDIZATION.md](./reference/DOCKER_ENV_STANDARDIZATION.md)
- CFN Agent System: [DOCKER_CFN_AGENT_SYSTEM.md](./reference/DOCKER_CFN_AGENT_SYSTEM.md)
- Docker Agent Reference: [docker/CLAUDE.md](../../docker/CLAUDE.md)

---

## Architecture at a Glance

### System Capabilities

- **62 specialized AI agents** in isolated containers
- **Wave-based execution** with 40GB memory budget
- **Multi-worktree development** with automatic conflict resolution
- **96% faster builds** via Linux native storage (755s → <20s)
- **Production monitoring** with Prometheus, Grafana, Loki

### Three Core Patterns

#### 1. Isolation Patterns

**Multi-Worktree Isolation:**
- Branch-based project namespacing
- Deterministic port allocation (hash-based)
- Network isolation per worktree
- Volume isolation per branch

**Example:**
```bash
# Branch: feature-auth → Project: cfn-feature-auth
# Ports: Redis:6421, Postgres:5474, Orchestrator:3043
# Network: cfn-feature-auth_mcp-network
# Volumes: cfn-feature-auth_redis-data
```

**Service Discovery:**
```bash
# Use service names (NOT container names)
redis-cli -h redis -p 6379           # ✅ Correct
redis-cli -h cfn-redis-1 -p 6379     # ❌ Wrong
```

#### 2. Provisioning Patterns

**Build Optimization:**
```bash
# 96% faster builds using Linux native storage
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/Dockerfile.agent \
  --tag cfn-agent:latest
```

**Multi-Stage Dockerfiles:**
- Stage 1: Dependencies (npm ci)
- Stage 2: Build (TypeScript compilation)
- Stage 3: Production (minimal runtime, non-root user)
- Result: 81% smaller images (980MB → 187MB)

**Environment Contract:**
```bash
# Standardized CFN_ prefix
CFN_REDIS_HOST=redis
CFN_REDIS_PORT=6379
CFN_TASK_ID=task-{timestamp}
CFN_AGENT_TYPE=react-frontend-engineer
CFN_MEMORY_BUDGET=40g
```

#### 3. Workflow Integration

**CFN Loop Orchestration:**
```
Coordinator → Redis Queue → Agent Pool → Workspace
     ↓                           ↓
  Validate                    Report
     ↓                           ↓
Iterate/Proceed            Completion
```

**Wave-Based Spawning:**
- Four-tier memory allocation (512MB, 600MB, 800MB, 1GB)
- Memory budget enforcement (40GB default)
- Parallel spawning within waves
- Dependency-aware batching

**Real Example:**
- 85 files with errors → 58 strategic batches
- Tier 1: 42 batches × 512MB = 21.5GB
- Tier 2: 12 batches × 600MB = 7.2GB
- Tier 3: 3 batches × 800MB = 2.4GB
- Tier 4: 1 batch × 1GB = 1GB
- **Total: 32.1GB** (66% reduction vs naive 85GB)

---

## Quick Start Recipes

### Multi-Worktree Development

```bash
# Start services in current worktree
./scripts/docker/run-in-worktree.sh up -d

# Check configuration (dry run)
./scripts/docker/run-in-worktree.sh --dry-run --verbose up

# Use production compose
./scripts/docker/run-in-worktree.sh -f docker-compose.production.yml up -d

# Stop services
./scripts/docker/run-in-worktree.sh down
```

### Fast Docker Builds

```bash
# Standard agent build (most common)
./.claude/skills/docker-build/build.sh

# Custom Dockerfile
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/Dockerfile.coordinator \
  --tag cfn-coordinator:latest

# Force rebuild
./.claude/skills/docker-build/build.sh --no-cache
```

### CFN Loop Execution

```bash
# Production mode (CLI with Docker coordinator)
/cfn-loop-cli "Implement user authentication" --mode=standard

# Debug mode (Task mode, full visibility)
/cfn-loop-task "Fix security bug" --mode=standard
```

### Manual Coordinator Spawn

```bash
docker run --rm \
  --name cfn-coordinator \
  --memory=2g \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /workspace:/workspace:rw \
  -e CFN_TASK_ID="task-$(date +%s)" \
  -e CFN_MEMORY_BUDGET="40g" \
  -e CFN_REDIS_HOST="redis" \
  -e COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" \
  --network ${COMPOSE_PROJECT_NAME}_mcp-network \
  --env-file .env \
  cfn-coordinator:latest
```

---

## Critical Patterns Reference

### Port Allocation

| Branch | Offset | Redis | Postgres | Orchestrator |
|--------|--------|-------|----------|--------------|
| main | 0 | 6379 | 5432 | 3001 |
| feature-auth | 42 | 6421 | 5474 | 3043 |
| bugfix-X | 78 | 6457 | 5510 | 3079 |

**Calculation:**
```bash
HASH=$(echo -n "$BRANCH" | md5sum | head -c 8)
OFFSET=$((0x${HASH} % 1000 * 100 / 1000))
PORT=$((BASE_PORT + OFFSET))
```

### Memory Tiers

| Tier | Files | Memory | Use Case |
|------|-------|--------|----------|
| 1 | 1 | 512MB | Independent files |
| 2 | 2-3 | 600MB | Small clusters |
| 3 | 4-8 | 800MB | Medium modules |
| 4 | 9+ | 1GB | Large modules |

### Service Names (Docker DNS)

**Always Use:**
```bash
redis              # Redis service
postgres           # PostgreSQL service
orchestrator       # Orchestrator service
playwright         # Playwright MCP
```

**Never Use:**
```bash
cfn-main_redis_1              # Container name
cfn-feature-auth_postgres_1   # Container name
localhost                     # Wrong in containers
```

---

## Data Flow Visualization

```
┌──────────────────────────────────────────────────────────┐
│ User Request: /cfn-loop-cli "Fix errors"                 │
└──────────────┬───────────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────────┐
│ Coordinator: Analyze → Batch → Queue (Redis)             │
└──────────────┬───────────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────────┐
│ Wave Spawn: agent-1, agent-2, ..., agent-N               │
└──────────────┬───────────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────────┐
│ Agent Execution (Parallel):                              │
│ - Claim task (atomic RPOP)                               │
│ - Read files (/workspace)                                │
│ - Execute fix                                            │
│ - Write files                                            │
│ - Report completion (INCR)                               │
└──────────────┬───────────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────────┐
│ Coordinator: Wait → Validate → Iterate/Proceed           │
└──────────────────────────────────────────────────────────┘
```

---

## Container Hierarchy

```
cfn-agent:latest (Base)
    │
    ├── cfn-orchestrator:latest
    │   └── Adds: docker.io, orchestrate.sh
    │
    └── cfn-coordinator:latest
        └── Adds: docker.io, coordinator-entrypoint.sh

redis:7-alpine
    └── Purpose: Coordination, task queue

postgres:15-alpine
    └── Purpose: Data persistence

playwright:v1.40.0-focal
    └── Purpose: MCP browser automation
```

---

## Monitoring Stack

```
Prometheus (:9091)
    ↓ (scrapes metrics)
Redis Exporter (:9121)
Orchestrator Health (:3001)
    ↓ (stores metrics)
Grafana (:3002)
    ↓ (visualizes)
Dashboards (agent performance, system health)

Loki (:3100)
    ↓ (aggregates logs)
All Containers
    ↓ (queries)
Grafana
```

---

## Security Checklist

- [x] Non-root user in all containers
- [x] Read-only mounts for source code
- [x] Secrets via .env (never committed)
- [x] Network isolation per worktree
- [x] MCP tokens in tmpfs (ephemeral)
- [x] Resource limits on all containers
- [x] Health checks for critical services
- [x] TLS for Redis (production)

---

## Performance Benchmarks

| Metric | Value | Notes |
|--------|-------|-------|
| **Build Time** | 20s | Linux native storage (vs 755s Windows mount) |
| **Image Size** | 187MB | Multi-stage build (vs 980MB naive) |
| **Agent Spawn** | 2-3s | Per wave (5 agents/sec max) |
| **Memory Optimization** | 66% reduction | Strategic batching (32GB vs 85GB) |
| **Wave Orchestration** | <5s | 28+ containers spawned |
| **Network Latency** | <1ms | Intra-container communication |

---

## Troubleshooting Quick Reference

### Build OOM (Exit Code 137)

**Problem:** Docker build fails with OOM on Windows mount

**Solution:**
```bash
./.claude/skills/docker-build/build.sh --no-cache
```

### Port Already in Use

**Problem:** `Bind for 0.0.0.0:6379 failed: port is already allocated`

**Solution:**
```bash
# Check what's using port
lsof -i :6379

# Use worktree wrapper (auto-calculates offset)
./scripts/docker/run-in-worktree.sh up -d

# Or override offset
./scripts/docker/run-in-worktree.sh --port-offset 50 up -d
```

### Service Discovery Not Working

**Problem:** Agent can't connect to Redis

**Solution:**
```bash
# Use service name (not container name)
redis-cli -h redis -p 6379  # ✅ Correct

# Verify network
docker network inspect ${COMPOSE_PROJECT_NAME}_mcp-network

# Check agent environment
docker exec agent-123 env | grep REDIS
```

### Agent Container Won't Start

**Problem:** Container exits immediately

**Solution:**
```bash
# Check logs
docker logs agent-123

# Verify environment variables
docker inspect agent-123 | jq '.[0].Config.Env'

# Validate Redis connectivity
docker run --rm --network ${COMPOSE_PROJECT_NAME}_mcp-network \
  redis:7-alpine redis-cli -h redis ping
```

---

## Next Steps

1. **Read Comprehensive Report:** [DOCKER_ARCHITECTURE_COMPREHENSIVE_REPORT.md](./architecture/DOCKER_ARCHITECTURE_COMPREHENSIVE_REPORT.md)
2. **Review Multi-Worktree Guide:** [DOCKER_MULTI_WORKTREE.md](./reference/DOCKER_MULTI_WORKTREE.md)
3. **Explore Skills:**
   - `.claude/skills/docker-build/SKILL.md`
   - `.claude/skills/cfn-docker-agent-spawning/SKILL.md`
   - `.claude/skills/cfn-docker-loop-orchestration/SKILL.md`
4. **Test Multi-Worktree Setup:**
   ```bash
   ./scripts/docker/run-in-worktree.sh --dry-run --verbose up
   ```

---

**Last Updated:** 2025-11-19
**Version:** 1.0.0
**Maintainer:** docker-specialist agent
