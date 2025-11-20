# Docker Redis Configuration Guide

**Purpose**: Explain Redis URL configuration in CFN Loop Docker orchestration
**Context**: orchestrate.sh line 714 - REDIS_URL configuration

---

## Overview

CFN Loop Docker orchestration uses **dual Redis configuration**:
- **Host-side** (orchestrator): Connects to `localhost:6379`
- **Container-side** (agents): Connects to `redis:6379` (service name)

This is CORRECT and required for Docker networking to work properly.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ WSL2 Host (orchestrator)                                │
│   - orchestrate.sh runs on host                         │
│   - Connects to Redis at localhost:6379                 │
│   - Uses CFN_REDIS_HOST=localhost                       │
│   - Uses CFN_REDIS_PORT=6379                            │
└─────────────────────────────────────────────────────────┘
                        ↓
                    Port 6379
                        ↓
┌─────────────────────────────────────────────────────────┐
│ Docker Network: cfn-network (or mcp-network)            │
│                                                          │
│  ┌──────────────────────────────────────┐              │
│  │ Redis Container (service name: redis) │              │
│  │ - Hostname: redis                     │              │
│  │ - Internal port: 6379                 │              │
│  │ - Published port: 6379:6379           │              │
│  └──────────────────────────────────────┘              │
│                        ↑                                 │
│                Service Discovery                         │
│                 (Docker DNS)                             │
│                        ↑                                 │
│  ┌──────────────────────────────────────┐              │
│  │ Agent Containers                      │              │
│  │ - Connect to redis:6379               │              │
│  │ - Docker resolves 'redis' to IP       │              │
│  │ - REDIS_URL=redis://redis:6379        │              │
│  └──────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

## Configuration Details

### Host-Side (orchestrate.sh)

**Location**: Lines 83-84
```bash
REDIS_PORT="${CFN_REDIS_PORT:-6379}"
REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
```

**Usage**: Orchestrator connects from WSL2 host to Redis
```bash
redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping
```

**Why localhost?**
- Redis container publishes port `6379:6379` to host
- Host machine accesses via `localhost:6379`
- This is standard Docker port publishing behavior

### Container-Side (orchestrate.sh)

**Location**: Line 714
```bash
--env REDIS_URL=redis://redis:6379
```

**Usage**: Agents connect from inside Docker network
```bash
# Inside agent container
redis-cli -h redis -p 6379 ping
```

**Why service name?**
- Agents run inside `cfn-network` Docker network
- Docker DNS resolves `redis` service name to container IP
- Container names are prefixed (e.g., `cfn-redis_1`), service names are stable
- Service discovery works across container restarts

---

## Docker Service Discovery

### How It Works

**Service Definition** (docker-compose.yml):
```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - cfn-network
```

**DNS Resolution**:
- Service name: `redis`
- Docker creates DNS entry: `redis` → container IP (e.g., 172.18.0.2)
- Agents query DNS: `redis` → 172.18.0.2
- Connection: `redis://redis:6379` → `redis://172.18.0.2:6379`

**Why NOT container name?**
- Container names include project prefix: `cfn-redis_1`, `cfn-feature-auth-redis_1`
- Container names change with scaling: `redis_1`, `redis_2`, `redis_3`
- Service names are stable and preferred for multi-container apps

### Multi-Worktree Support

**Problem**: Multiple developers use different git worktrees
**Solution**: Each worktree uses unique Docker project name

**Configuration** (per worktree):
```bash
export COMPOSE_PROJECT_NAME="cfn-${BRANCH}"  # e.g., cfn-feature-auth
export CFN_REDIS_PORT="6421"                 # Offset from base 6379
```

**Container naming**:
- Main branch: `cfn-main_redis_1` (service: `redis`, port: 6379)
- Feature branch: `cfn-feature-auth_redis_1` (service: `redis`, port: 6421)

**Service discovery**:
- Within `cfn-main` network: `redis` → 172.18.0.2
- Within `cfn-feature-auth` network: `redis` → 172.19.0.2
- Isolated networks prevent cross-worktree interference

---

## Environment Variables

### Available Variables

**orchestrate.sh** supports these for flexibility:

```bash
# Host-side connection (orchestrator)
CFN_REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
CFN_REDIS_PORT="${CFN_REDIS_PORT:-6379}"

# Container-side connection (agents) - hardcoded to service name
REDIS_URL="redis://redis:6379"
```

### Why Not Parameterize Container Redis URL?

**Option 1 (current)**: Hardcode service name
```bash
--env REDIS_URL=redis://redis:6379
```

**Option 2 (parameterized)**: Use environment variables
```bash
--env REDIS_URL="redis://${CFN_CONTAINER_REDIS_HOST:-redis}:${CFN_REDIS_PORT:-6379}"
```

**Decision**: Use Option 1 (hardcode service name)

**Rationale**:
1. **Service name is standard**: Docker best practice is to use service names
2. **Simpler configuration**: Fewer environment variables to manage
3. **Less error-prone**: No risk of misconfiguration breaking service discovery
4. **Port is internal**: Container always uses 6379 internally (published port varies)
5. **Multi-worktree works**: Each network is isolated, service name is always `redis`

---

## Configuration Scenarios

### Scenario 1: Single Developer (default)

**Setup**:
```bash
docker-compose up -d redis
```

**Host connection**:
```bash
redis-cli -h localhost -p 6379 ping
```

**Agent connection** (inside container):
```bash
redis-cli -h redis -p 6379 ping
```

### Scenario 2: Multi-Worktree (team development)

**Developer 1 (main branch)**:
```bash
export COMPOSE_PROJECT_NAME="cfn-main"
export CFN_REDIS_PORT="6379"
docker-compose up -d redis
```

**Developer 2 (feature branch)**:
```bash
export COMPOSE_PROJECT_NAME="cfn-feature-auth"
export CFN_REDIS_PORT="6421"
docker-compose up -d redis
```

**Container connections**:
- Both use `redis://redis:6379` (service name is same in both networks)
- Networks are isolated, no conflict

**Host connections**:
- Developer 1: `localhost:6379`
- Developer 2: `localhost:6421`

### Scenario 3: Remote Redis (custom deployment)

**If you need remote Redis** (not Docker service):

**Option A**: Override at runtime
```bash
docker run --rm \
  --env REDIS_URL="redis://remote-host:6379" \
  claude-flow-novice:agent
```

**Option B**: Modify orchestrate.sh line 714
```bash
--env REDIS_URL="${CFN_AGENT_REDIS_URL:-redis://redis:6379}"
```

Then set environment variable:
```bash
export CFN_AGENT_REDIS_URL="redis://remote-host:6379"
```

---

## Common Mistakes

### ❌ WRONG: Use container name instead of service name

```bash
--env REDIS_URL=redis://cfn-redis:6379  # Won't resolve in Docker network
```

**Why it fails**: Container names don't resolve via Docker DNS (service names do).

### ❌ WRONG: Use localhost in container

```bash
--env REDIS_URL=redis://localhost:6379  # Refers to agent container, not Redis
```

**Why it fails**: `localhost` inside container is the container itself, not the host.

### ❌ WRONG: Use host IP in container

```bash
--env REDIS_URL=redis://192.168.1.100:6379  # Fragile, breaks with IP changes
```

**Why it fails**: IP addresses change, networks may not allow host access.

### ✅ CORRECT: Use service name

```bash
--env REDIS_URL=redis://redis:6379  # Docker DNS resolves to Redis container
```

**Why it works**: Service discovery is stable, works across restarts and networks.

---

## Troubleshooting

### Issue: "Connection refused" from agent

**Diagnosis**:
```bash
# Check if Redis is running
docker ps | grep redis

# Check if agent is in correct network
docker inspect <agent-container> | grep NetworkMode

# Test DNS resolution from agent
docker exec <agent-container> nslookup redis
```

**Solutions**:
1. Ensure Redis container is running: `docker-compose up -d redis`
2. Ensure agent uses correct network: `--network cfn-network`
3. Check service name in docker-compose.yml matches `redis`

### Issue: "Could not resolve host: redis"

**Diagnosis**:
```bash
# Check Docker network exists
docker network ls | grep cfn-network

# Check Redis is in network
docker inspect <redis-container> | grep Networks
```

**Solutions**:
1. Create network: `docker network create cfn-network`
2. Add Redis to network: `docker network connect cfn-network <redis-container>`
3. Restart Redis with network: `docker-compose up -d redis`

### Issue: Wrong Redis instance (multi-worktree)

**Diagnosis**:
```bash
# Check which Redis container agent is using
docker logs <agent-container> | grep REDIS_URL

# Check network isolation
docker network inspect cfn-network
docker network inspect cfn-feature-auth
```

**Solutions**:
1. Ensure `COMPOSE_PROJECT_NAME` is set per worktree
2. Verify agent uses correct network: `--network cfn-${BRANCH}`
3. Check port offsets are applied correctly

---

## Validation

### Quick Test: Service Discovery

```bash
# 1. Start Redis
docker-compose up -d redis

# 2. Test from agent container
docker run --rm --network cfn-network redis:7-alpine redis-cli -h redis -p 6379 ping
# Expected: PONG

# 3. Test DNS resolution
docker run --rm --network cfn-network alpine:latest nslookup redis
# Expected: IP address of Redis container
```

### Full Test: Agent Connection

```bash
# 1. Spawn agent via orchestrate.sh
./.claude/skills/cfn-loop-orchestration/orchestrate.sh --test-mode

# 2. Check agent logs
docker logs <agent-container> 2>&1 | grep -i redis

# 3. Verify connection
docker exec <agent-container> redis-cli -h redis -p 6379 ping
# Expected: PONG
```

---

## Summary

**Key Points**:
1. ✅ Host uses `localhost:6379` (orchestrator)
2. ✅ Containers use `redis:6379` (agents)
3. ✅ Service name is stable across restarts
4. ✅ Multi-worktree uses same service name, different networks
5. ✅ Docker DNS handles service discovery automatically

**No changes needed** to orchestrate.sh line 714.

**Configuration is correct** for Docker-based CFN Loop orchestration.

---

## Related Documentation

- **Multi-Worktree Docker**: `CLAUDE.md` lines 95-180
- **Environment Contract**: `docker/runtime/cfn-runtime.contract.yml`
- **Docker Compose**: `docker-compose.yml`
- **Orchestration**: `.claude/skills/cfn-loop-orchestration/orchestrate.sh`
