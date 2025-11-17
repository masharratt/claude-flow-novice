# Multi-Worktree Docker Coordination Analysis

## Executive Summary

Investigation of multi-worktree Docker setup compatibility across your codebase reveals **14 files requiring changes** to ensure proper team alignment and avoid port/network/database conflicts when using multiple git worktrees simultaneously.

**Current Status:** 
- ✅ Docker port isolation: IMPLEMENTED (run-in-worktree.sh handles this well)
- ❌ Agent prompts: 4 hardcoded container names/networks found
- ⚠️ Redis coordination: Uses environment variables but defaults to localhost:6379
- ⚠️ Documentation: No worktree-specific team coordination guidance

---

## Issues Found by Category

### CATEGORY 1: Agent Prompts with Hardcoded Docker References

**Files Requiring Changes:**

#### 1. `.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md`

**Line 218:** Hardcoded container name
```bash
docker run --rm --name cfn-coordinator --memory=2g \
  -e REDIS_HOST=cfn-redis --network cfn-network \
```

**Lines 222, 262:** Hardcoded Redis host
- Line 222: `-e REDIS_HOST=cfn-redis`
- Line 262: `REDIS_HOST="cfn-redis"`

**Line 543:** Hardcoded localhost health check
```bash
test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
```

**Issues:**
- `cfn-coordinator` container name will conflict across worktrees
- `cfn-redis` assumes fixed container naming (should be `${COMPOSE_PROJECT_NAME}-redis`)
- `cfn-network` network is hardcoded (should use worktree-scoped network)
- `localhost:3000` health check fails in multi-worktree scenarios

**Required Changes:**
- Replace `cfn-coordinator` with `${COMPOSE_PROJECT_NAME}-coordinator` (Docker Compose automatic naming)
- Replace `cfn-redis` with service name from environment or Docker network discovery
- Replace `cfn-network` with dynamic network derived from `${COMPOSE_PROJECT_NAME}`
- Replace `localhost:3000` with container service name (Docker internal networking)
- Add environment variable injection for worktree-specific configuration

---

#### 2. `.claude/agents/cfn-dev-team/dev-ops/monitoring-specialist.md`

**Line 62:** Hardcoded localhost target
```yaml
targets: ['localhost:9090']
```

**Line 679:** Hardcoded localhost
```yaml
- localhost
```

**Issues:**
- Assumes Prometheus runs on localhost:9090 (conflicts across worktrees)
- Uses localhost instead of service name

**Required Changes:**
- Replace `localhost:9090` with `${CFN_PROMETHEUS_HOST}:${CFN_PROMETHEUS_PORT}`
- Replace `localhost` with dynamic hostname from environment

---

#### 3. `.claude/agents/docker-coordinators/cfn-docker-v3-coordinator.md`

**Needs Addition:** No hardcoded values found, but MISSING documentation for:
- How to handle worktree-specific Docker networks
- How to inject environment variables for port configuration
- Team coordination patterns

**Required Changes:**
- Add section: "Multi-Worktree Configuration Requirements"
- Document environment variable injection pattern for agents
- Add example: spawning agents with worktree-aware Docker network

---

### CATEGORY 2: Redis Coordination Scripts (Defaults Need Documentation)

**Files with Defaults That Need Team Guidance:**

#### 4. `.claude/skills/cfn-redis-coordination/report-completion.sh`

**Lines 69-93:** Uses environment variables (GOOD, but incomplete)
```bash
redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" ...
```

**Issue:**
- Defaults to `localhost:6379` (works fine for single worktree, fails in multi-worktree team scenarios)
- No documentation for worktree-specific values
- Agents spawned in docker containers won't know worktree-specific Redis port

**Required Changes:**
- Add comment explaining multi-worktree consideration
- Document that `CFN_REDIS_PORT` must be set by run-in-worktree.sh
- Add validation that Redis host is reachable

---

#### 5. `.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh`

**Lines 20-22:** Environment variable defaults
```bash
REDIS_HOST=${REDIS_HOST:-"localhost"}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_DB=${REDIS_DB:-0}
```

**Issue:** Same as above - defaults work for single instance, not for multi-worktree

**Required Changes:**
- Add documentation for team coordination
- Validate environment is set correctly
- Add diagnostic output for troubleshooting

---

### CATEGORY 3: Docker Network & Container Spawning

#### 6. `.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh`

**Line 11:** Hardcoded network name
```bash
DEFAULT_NETWORK="mcp-network"
```

**Issue:**
- Network name `mcp-network` is global, not worktree-scoped
- Multiple worktrees can't have separate MCP networks

**Required Changes:**
- Extract network name from `${COMPOSE_PROJECT_NAME}` or environment
- Add documentation for network naming convention
- Update example in SKILL.md (lines 161-165)

---

#### 7. `.claude/skills/cfn-docker-agent-spawning/SKILL.md`

**Lines 161-165:** Example with hardcoded network
```bash
docker network create mcp-network --driver bridge
docker network connect mcp-network agent-frontend-001
```

**Issue:**
- Examples use global network name, not worktree-scoped

**Required Changes:**
- Update examples to use `${COMPOSE_PROJECT_NAME}-mcp-network`
- Document worktree isolation pattern

---

### CATEGORY 4: Docker Loop Orchestration

#### 8. `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh`

**Lines 1-70:** Hardcoded defaults for Docker network configuration

**Issue:**
- No worktree awareness
- Assumes single global Docker environment
- Network and container naming not scoped

**Required Changes:**
- Add worktree detection at start
- Inject `COMPOSE_PROJECT_NAME` into all spawned agents
- Document network naming pattern

---

### CATEGORY 5: Environment Configuration

#### 9. `.env.example`

**Lines 32-46:** Port configuration section
```bash
CFN_REDIS_PORT=6379
CFN_POSTGRES_PORT=5432
CFN_ORCHESTRATOR_PORT=3001
```

**Issue:**
- Good multi-worktree documentation (lines 70-87)
- But missing guidance on Redis/Postgres HOST configuration for containers

**Required Changes:**
- Add section: "Docker Service Discovery"
- Document how agents inside containers should connect to services
- Explain difference between localhost vs service name in Docker networks

---

#### 10. `.env.hybrid.example`

**Lines 57-59:** Redis configuration
```bash
REDIS_HOST=redis
REDIS_PORT=6379
```

**Issue:**
- Uses service name `redis` (good for single setup)
- Doesn't account for worktree-specific ports/networks
- No guidance for team coordination

**Required Changes:**
- Document worktree override pattern
- Explain service discovery in Docker Compose environments

---

### CATEGORY 6: Main Orchestration & Coordination

#### 11. `.claude/skills/cfn-loop-orchestration/orchestrate.sh`

**Lines 64-65:** Skill references
```bash
REDIS_COORD_SKILL="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination"
```

**Issue:**
- No validation that Redis is reachable with configured port
- Agents spawned don't get worktree-specific environment variables

**Required Changes:**
- Add worktree detection at start
- Pass `CFN_REDIS_PORT` and `COMPOSE_PROJECT_NAME` to spawned agents
- Add Redis connectivity validation

---

#### 12. `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`

**Lines 1-300+:** Agent prompt for CFN v3 coordinator

**Issue:**
- Documentation mentions spawning agents but doesn't address worktree isolation
- No guidance for coordinating across multiple worktrees
- Doesn't mention Docker network considerations

**Required Changes:**
- Add section: "Multi-Worktree Coordination"
- Document how to pass `COMPOSE_PROJECT_NAME` to spawned agents
- Add example of worktree-aware agent spawning

---

### CATEGORY 7: Documentation & Team Guidelines

#### 13. `CLAUDE.md`

**General Issue:**
- Extensive CFN Loop documentation
- Multi-worktree Docker setup documented in .env.example (good)
- But NO guidance for team coordination patterns with multiple worktrees

**Required Additions:**
```markdown
## 3) Multi-Worktree Docker Coordination

### Team Scenarios

#### Scenario 1: Individual Development
- Developer A: feature-auth branch
- Developer B: feature-payments branch
- Each runs: `./scripts/docker/run-in-worktree.sh up -d`
- Automatic port isolation prevents conflicts

#### Scenario 2: Coordinated Testing (New!)
- Multiple developers need to coordinate
- CFN Loops must run in separate worktrees
- Redis coordination needs worktree-aware keys

### Environment Variable Injection

All agents spawned in Docker containers MUST receive:
- CFN_REDIS_PORT (from run-in-worktree.sh)
- CFN_POSTGRES_PORT (from run-in-worktree.sh)
- COMPOSE_PROJECT_NAME (from run-in-worktree.sh)
- WORKTREE_BRANCH (optional, for logging)

### Key Precedence (Container Agent Perspective)

1. Environment variables (from coordinator/orchestrator)
2. Docker service names (redis, postgres, etc. from docker-compose)
3. Fallback to localhost (backwards compatibility for single instance)

### Redis Coordination Keys - Worktree Isolation

When multiple worktrees run CFN Loops simultaneously:

```bash
# Current pattern (GLOBAL - conflicts across worktrees)
swarm:${TASK_ID}:${AGENT_ID}:done

# Recommended pattern (SCOPED - no conflicts)
swarm:${WORKTREE_BRANCH}:${TASK_ID}:${AGENT_ID}:done
OR
swarm:${COMPOSE_PROJECT_NAME}:${TASK_ID}:${AGENT_ID}:done
```

### Docker Network Isolation

```bash
# Current pattern (GLOBAL - conflicts)
docker network create mcp-network

# Multi-worktree pattern (SCOPED)
docker network create ${COMPOSE_PROJECT_NAME}-mcp-network
```

### Container Naming Convention

```bash
# Current pattern (GLOBAL - conflicts)
docker run --name cfn-coordinator
docker run --name cfn-redis-tools

# Multi-worktree pattern (SCOPED)
docker run --name ${COMPOSE_PROJECT_NAME}-coordinator
docker run --name ${COMPOSE_PROJECT_NAME}-redis-tools
```

### Checklist: Team Multi-Worktree Setup

- [ ] All developers use `./scripts/docker/run-in-worktree.sh` (not bare docker-compose)
- [ ] Agent prompts injected with `COMPOSE_PROJECT_NAME` and port variables
- [ ] Redis coordination keys include worktree prefix
- [ ] Docker networks use worktree-scoped names
- [ ] Container names use worktree-scoped names
- [ ] Agents verify Redis connectivity before operations
- [ ] Documentation includes multi-worktree examples
```

---

#### 14. `.claude/agents/cfn-dev-team/README.md`

**General Issue:**
- Agent documentation and examples
- Should include multi-worktree coordination pattern

**Required Addition:**
```markdown
### Multi-Worktree Coordination

Agents spawned in multi-worktree environments need special configuration:

**Environment Variables Provided by Coordinator:**
- `COMPOSE_PROJECT_NAME`: Docker project name (e.g., cfn-feature-auth)
- `CFN_REDIS_PORT`: Worktree-specific Redis port
- `CFN_POSTGRES_PORT`: Worktree-specific Postgres port
- `WORKTREE_BRANCH`: Git branch for logging/identification

**Using in Agent Prompts:**
```bash
redis-cli -h localhost -p "${CFN_REDIS_PORT}" ...
docker network connect "${COMPOSE_PROJECT_NAME}-mcp-network" ...
```

**Spawning Agents with Worktree Context:**
```bash
# Pass environment to spawned agents
npx claude-flow-novice agent-spawn backend-dev \
  --task-id "task-123" \
  --env "COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}" \
  --env "CFN_REDIS_PORT=${CFN_REDIS_PORT}"
```

---

## Summary Table

| # | File | Issue Type | Severity | Lines | Change Type |
|---|------|-----------|----------|-------|------------|
| 1 | docker-specialist.md | Hardcoded container/network names | HIGH | 218, 222, 262, 543 | Code change |
| 2 | monitoring-specialist.md | Hardcoded localhost targets | MEDIUM | 62, 679 | Code change |
| 3 | cfn-docker-v3-coordinator.md | Missing multi-worktree docs | MEDIUM | N/A | Documentation |
| 4 | report-completion.sh | Missing team coordination docs | LOW | 69-93 | Documentation |
| 5 | invoke-waiting-mode.sh | Missing team coordination docs | LOW | 20-22 | Documentation |
| 6 | spawn-agent.sh | Hardcoded network name | HIGH | 11 | Code change |
| 7 | cfn-docker-agent-spawning/SKILL.md | Hardcoded network in examples | MEDIUM | 161-165 | Documentation |
| 8 | cfn-docker-loop-orchestration/orchestrate.sh | No worktree context | MEDIUM | 1-70 | Code change |
| 9 | .env.example | Missing Docker service discovery docs | LOW | 32-46 | Documentation |
| 10 | .env.hybrid.example | Missing worktree override docs | LOW | 57-59 | Documentation |
| 11 | cfn-loop-orchestration/orchestrate.sh | No worktree context passing | MEDIUM | 64-65 | Code change |
| 12 | cfn-v3-coordinator.md | Missing multi-worktree guidance | MEDIUM | Full | Documentation |
| 13 | CLAUDE.md | Missing team coordination patterns | HIGH | N/A | Documentation |
| 14 | cfn-dev-team/README.md | Missing multi-worktree examples | MEDIUM | N/A | Documentation |

---

## Recommended Solution Strategy

### Phase 1: Environment Variable Propagation (IMMEDIATE)
1. Update run-in-worktree.sh to export worktree metadata
2. Add environment variable passing to coordinator/orchestrator
3. Update spawn-agent.sh to pass variables to containers

### Phase 2: Code Hardcoding Fixes (HIGH PRIORITY)
1. Replace hardcoded container names with `${COMPOSE_PROJECT_NAME}`
2. Replace hardcoded network names with `${COMPOSE_PROJECT_NAME}-mcp-network`
3. Replace hardcoded localhost with dynamic service discovery

### Phase 3: Redis Coordination Scoping (MEDIUM PRIORITY)
1. Document optional worktree prefix pattern for Redis keys
2. Add validation that Redis port is correct
3. Update coordination scripts with worktree awareness

### Phase 4: Documentation (ONGOING)
1. Add multi-worktree section to CLAUDE.md
2. Update agent prompts with examples
3. Create team coordination guide
4. Document service discovery pattern

---

## Implementation Notes

### What's Already Good
- `run-in-worktree.sh` correctly handles port isolation per worktree
- Environment variables for ports are properly exported
- Docker Compose service names provide automatic service discovery
- Backup file system exists for safe file operations

### What Needs Work
- Agent prompts assume single global Docker instance
- Container/network naming doesn't account for multiple instances
- No guidance for teams coordinating across worktrees
- Redis coordination keys are globally scoped (could conflict)

### Key Insight: Service Discovery
In Docker Compose networks, containers can reach each other by service name:
```bash
# Inside container on cfn-feature-auth_default network:
redis-cli -h redis -p 6379  # Works! Uses Docker DNS
redis-cli -h localhost -p 6379  # Fails! No localhost service
```

This means agents need to know:
1. Redis service name (always "redis" in docker-compose)
2. Port (from environment variable)
3. Network name (for network-specific operations)

### Team Alignment Pattern
```bash
# Coordinator injects into agent containers:
export COMPOSE_PROJECT_NAME="cfn-feature-auth"
export CFN_REDIS_PORT="6421"  # Base port + offset
export CFN_POSTGRES_PORT="5474"
export WORKTREE_BRANCH="feature-auth"

# Agent uses these values:
redis-cli -h redis -p "${CFN_REDIS_PORT}"
# Resolves to: cfn-feature-auth_redis_1 container
```

