# Docker CFN Loop Bug Report

**Date:** 2025-11-10
**Task ID:** cfn-cli-406735-29147
**Goal:** Build Docker agent monitoring dashboard and identify Docker CFN Loop bugs

## Critical Bugs Discovered

### Bug #1: WebAssembly Out of Memory (CRITICAL)
**Location:** CLI agent spawning via `npx claude-flow-novice agent`
**Error:**
```
RangeError: WebAssembly.Instance(): Out of memory: Cannot allocate Wasm memory for new instance
    at lazyllhttp (node:internal/deps/undici/undici:6311:14)
```

**Impact:**
- All CLI-spawned agents fail with memory errors
- Affects: backend-developer, docker-specialist, react-frontend-engineer
- Causes CFN Loop orchestration to fail completely

**Root Cause:**
- Multiple concurrent Node.js processes spawning agents
- Each process initializes undici's WASM HTTP parser
- WSL2 environment has limited WASM memory allocation
- Memory not released between agent spawns

**Reproduction:**
```bash
/cfn-loop-cli "Build dashboard" --mode=standard
# Spawns 3+ agents concurrently → WASM OOM
```

**Proposed Fix:**
1. Increase Node.js max-old-space-size: `NODE_OPTIONS="--max-old-space-size=8192"`
2. Sequential agent spawning instead of parallel (trade speed for stability)
3. Use Docker containers for agent isolation (prevents WASM memory sharing)
4. Implement agent pool with pre-warmed processes

### Bug #2: Volume Mount Path Resolution
**Location:** `.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh:212`

**Issue:**
```bash
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
```

This resolves to `/mnt/c/Users/masha/Documents/.claude` instead of project root when script is called from subdirectory.

**Impact:**
- Volume mounts fail or mount wrong directories
- Agents can't access project files
- `.claude` directory appears empty in containers

**Evidence:**
```bash
# Actual mount
--volume /mnt/c/Users/masha/Documents/.claude:/app/.claude:ro

# Expected mount
--volume /mnt/c/Users/masha/Documents/claude-flow-novice/.claude:/app/.claude:ro
```

**Proposed Fix:**
```bash
# Use git root or explicit project detection
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
```

### Bug #3: Redis Connection Failures
**Location:** Orchestrator and agent coordination

**Error:**
```
⚠️  Failed to retrieve Redis context, using local SUCCESS_CRITERIA
🔄 Using local SUCCESS_CRITERIA as fallback
```

**Impact:**
- Agents can't coordinate via Redis
- Loop 3 → Loop 2 transitions fail
- Product Owner doesn't receive agent outputs
- Swarm recovery impossible

**Root Cause Analysis:**
1. Redis running on host (localhost:6379)
2. Docker containers configured with: `REDIS_URL=redis://redis:6379`
3. No Redis container named "redis" exists
4. Network mismatch: containers can't reach host Redis

**Evidence:**
```bash
$ redis-cli ping
PONG  # Host Redis works

$ docker run --rm --network mcp-network alpine ping -c 1 redis
ping: bad address 'redis'  # Container can't resolve "redis"
```

**Proposed Fix:**
Option 1: Link to host Redis
```bash
--env REDIS_URL=redis://host.docker.internal:6379
```

Option 2: Deploy Redis container
```bash
docker run -d --name redis --network mcp-network redis:alpine
```

### Bug #4: Missing Agent Definitions
**Location:** Orchestrator agent selection

**Error:**
```
[agent-command] Error: Agent definition not found: frontend-developer
```

**Impact:**
- Orchestrator uses incorrect agent names
- Agent spawning fails immediately
- Loop never starts

**Root Cause:**
- Coordinator uses generic names: `frontend-developer`
- Actual agent file: `.claude/agents/cfn-dev-team/developers/react-frontend-engineer.md`
- Name mismatch causes lookup failure

**Evidence:**
```bash
$ find .claude/agents -name "*frontend*"
.claude/agents/cfn-dev-team/developers/react-frontend-engineer.md
.claude/agents/cfn-dev-team/coordinators/cfn-frontend-coordinator.md

# No "frontend-developer.md" exists
```

**Proposed Fix:**
Update orchestrator agent name mapping:
```bash
# Wrong
--loop3-agents "backend-developer,frontend-developer,docker-specialist"

# Correct
--loop3-agents "backend-developer,react-frontend-engineer,docker-specialist"
```

### Bug #5: Container Restart Loop
**Location:** Docker agent spawn with `--restart unless-stopped`

**Symptom:**
```
Container status: restarting
Container is not running (status: restarting)
```

**Impact:**
- Containers start, crash immediately, restart infinitely
- No logs generated (crash too fast)
- Resource waste from restart cycles

**Root Cause:**
1. Command syntax error in spawn script
2. Missing dependencies in container
3. Incorrect entrypoint configuration

**Evidence:**
```bash
$ docker logs 72e7035a7ccaa
# No output - crashed before logging initialized
```

**Proposed Fix:**
1. Remove `--restart` for debugging: `--rm` for test mode
2. Test command outside Docker first
3. Add health check with proper startup grace period

## Test Results

### Working Configuration
```bash
# Basic container works
docker run --rm \
  --name test-agent \
  --memory 1g \
  --cpus 1.0 \
  --network mcp-network \
  claude-flow-novice:agent \
  sh -c 'echo Container started && which npx'

# Output: Container started, /usr/local/bin/npx
```

### Failing Configuration
```bash
# CFN Loop CLI mode - WASM OOM
/cfn-loop-cli "Build dashboard" --mode=standard
# Result: 2/3 agents fail with WebAssembly memory errors

# Docker spawn script - Volume mount issues
./.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh react-frontend-engineer task-001
# Result: Container restarts infinitely, no logs
```

## Recommended Fixes Priority

### P0 - Critical (Blocking all Docker CFN Loop functionality)
1. **WebAssembly OOM**: Implement Docker-based agent isolation
2. **Redis connectivity**: Deploy Redis container or use host.docker.internal
3. **Volume mount paths**: Fix PROJECT_ROOT calculation

### P1 - High (Blocking specific features)
4. **Agent name mapping**: Update orchestrator with correct agent names
5. **Container restart loop**: Remove --restart for test/debug mode

### P2 - Medium (Improvements)
6. Add health checks to containers
7. Implement graceful degradation for Redis failures
8. Add memory monitoring and automatic scaling

## Next Steps

1. **Immediate**: Test Docker agents with corrected configuration
2. **Short-term**: Deploy Redis container for proper coordination
3. **Medium-term**: Refactor spawn script with proper path resolution
4. **Long-term**: Implement WASM memory pool and agent lifecycle management

## Success Criteria for Fix Validation

- ✅ Docker container spawns successfully
- ✅ Container runs without restart loop
- ✅ Agent can access project files via volume mounts
- ✅ Agent connects to Redis for coordination
- ✅ Agent completes task and signals completion
- ✅ No WebAssembly memory errors
- ✅ Multiple agents can run concurrently without OOM

## Testing Commands

```bash
# Test 1: Basic container functionality
docker run --rm --network mcp-network claude-flow-novice:agent echo "Success"

# Test 2: Redis connectivity from container
docker run --rm --network mcp-network --env REDIS_URL=redis://host.docker.internal:6379 \
  claude-flow-novice:agent sh -c 'apk add redis && redis-cli -u $REDIS_URL ping'

# Test 3: Volume mount verification
docker run --rm -v "$(pwd)/.claude:/app/.claude:ro" \
  claude-flow-novice:agent ls -la /app/.claude

# Test 4: Full agent spawn (after fixes)
./.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh \
  react-frontend-engineer test-task-002 --verbose
```
