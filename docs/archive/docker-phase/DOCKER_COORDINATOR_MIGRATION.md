# Docker Coordinator Migration - Task() to Container-Based

## Executive Summary

You're correct - the Docker coordinator infrastructure already exists but isn't being used. The coordinator is currently spawned via `Task()` tool from Main Chat, while worker agents run in Docker containers. This document details what exists and the minimal changes needed to run the coordinator itself in Docker.

## Current State vs Desired State

### Current Architecture (Hybrid)
```
Main Chat
    ↓ Task() tool
cfn-docker-v3-coordinator (runs in Main Chat context)
    ↓ orchestrate.sh
    ↓ spawn-agent.sh
Docker Containers (only workers)
```

### Desired Architecture (Full Docker)
```
Main Chat
    ↓ docker run
cfn-intelligent-coordinator:latest (Docker container)
    ↓ orchestrate.sh (inside container)
    ↓ spawn-agent.sh (Docker-in-Docker)
Docker Containers (workers)
```

## What Already Exists ✅

### 1. Docker Images (Built and Ready)
```bash
$ docker images | grep coordinator
cfn-intelligent-coordinator    latest    cc7e4325f568    8 hours ago    348MB
```

**Image Details:**
- **File:** `Dockerfile.coordinator`
- **Base:** node:18-alpine
- **Includes:** dockerode (Docker SDK), Redis client, TypeScript
- **Has:** Redis coordination skills, runtime environment setup
- **Entry:** `node src/coordinator.js`

### 2. Docker Compose Services
```yaml
# docker-compose.yml (already configured)
services:
  redis:         # cfn-redis (6379)
  playwright:    # cfn-playwright (MCP server)
  postgres:      # cfn-postgres (optional)

networks:
  mcp-network:   # 172.28.0.0/16
```

### 3. Agent Spawning Infrastructure
- **spawn-agent.sh:** Spawns worker agents via `docker run` ✅
- **orchestrate.sh:** CFN Loop orchestration (3-loop pattern) ✅
- **Planning phase:** Task decomposition logic (just added) ✅

### 4. Documentation
- Dockerfile.coordinator comments
- Test findings docs (DOCKER_COORDINATOR_SUCCESS_REPORT.md)
- Dual-mode architecture docs (DOCKER_DUAL_MODE_TESTS.md)

## What Needs to Change

### Change #1: Update Slash Command to Use `docker run`

**Current (CFN_DOCKER_LOOP.md):**
```markdown
Main Chat spawns all agents via Task()

## Architecture
Main Chat
    ↓ (Task tool)
cfn-docker-v3-coordinator
```

**New:**
```markdown
Main Chat spawns coordinator via Docker container

## Execution Steps

### Step 1: Prepare Task Context
Create `/tmp/task-context-${TASK_ID}.json` with:
- task_description
- mode (mvp|standard|enterprise)
- success_criteria

### Step 2: Spawn Coordinator Container
```bash
docker run --rm \
  --name "cfn-coordinator-${TASK_ID}" \
  --network mcp-network \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume $(pwd):/app/codebase:ro \
  --volume /tmp:/tmp \
  --env ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
  --env CFN_REDIS_HOST=cfn-redis \
  --env CFN_REDIS_PORT=6379 \
  --env TASK_ID="${TASK_ID}" \
  --env MODE="${MODE:-standard}" \
  --env TASK_DESCRIPTION="${TASK_DESCRIPTION}" \
  cfn-intelligent-coordinator:latest
```

### Step 3: Monitor Execution
```bash
docker logs -f "cfn-coordinator-${TASK_ID}"
```

### Step 4: Cleanup
Container auto-removes on completion (--rm flag)
```

### Change #2: Update Coordinator Entrypoint

**File:** `Dockerfile.coordinator`

**Current (line 56):**
```dockerfile
ENTRYPOINT ["/bin/bash", "-c", "source ./docker/runtime/cfn-runtime.sh && exec node src/coordinator.js"]
```

**Needs:**
- Accept TASK_DESCRIPTION, MODE, TASK_ID as env vars
- Write planning output to /tmp (mounted volume)
- Read orchestrate.sh from mounted codebase

**Potential Issue:** The coordinator image might have its own `coordinator.js` that's different from our `cfn-docker-v3-coordinator` agent logic.

**Resolution:** Check if `docker/coordinator/src/coordinator.js` exists or needs to be created/updated.

### Change #3: Volume Mounts (Critical)

**Docker Socket (Docker-in-Docker):**
```bash
--volume /var/run/docker.sock:/var/run/docker.sock
```
Allows coordinator to spawn worker containers.

**Codebase (Read-Only):**
```bash
--volume $(pwd):/app/codebase:ro
```
Coordinator needs access to:
- `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh`
- `.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh`
- `.claude/skills/cfn-coordination/` (Redis skills)
- `.claude/agents/` (agent definitions for spawning)

**Tmp Directory (Planning Files):**
```bash
--volume /tmp:/tmp
```
Coordinator writes plan files:
- `/tmp/cfn-docker-plan-${TASK_ID}.json`
- `/tmp/task-context-${TASK_ID}-*.json`

**Redis Socket (Alternative to network):**
Not needed - using `--network mcp-network` instead.

### Change #4: Environment Variables

**Required:**
```bash
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"          # For coordinator's LLM calls
CFN_REDIS_HOST=cfn-redis                          # Redis coordination
CFN_REDIS_PORT=6379
TASK_ID="${TASK_ID}"                              # Unique task identifier
MODE="${MODE}"                                    # mvp|standard|enterprise
TASK_DESCRIPTION="${TASK_DESCRIPTION}"            # What to build
```

**Optional (Custom Routing):**
```bash
CFN_CUSTOM_ROUTING=true                           # Enable Z.ai routing
ZAI_API_KEY="${ZAI_API_KEY}"                      # If using Z.ai
ZAI_MODEL="glm-4.6"                               # Cheaper model for coordinator
```

**Optional (Configuration):**
```bash
MEMORY_LIMIT=1g                                   # Worker memory
MAX_ITERATIONS=10                                 # CFN Loop iterations
GATE_THRESHOLD=0.75                               # Loop 3 gate
CONSENSUS_THRESHOLD=0.90                          # Loop 2 consensus
```

### Change #5: Coordinator Script Logic

**File:** `docker/coordinator/src/coordinator.js`

**Check if exists:**
```bash
ls -la docker/coordinator/src/
```

**If it exists:** Review and update to include planning phase logic

**If it doesn't exist:** Create coordinator entry point that:
1. Reads TASK_DESCRIPTION, MODE, TASK_ID from env
2. Performs planning phase (calls LLM for decomposition)
3. Writes plan to `/tmp/cfn-docker-plan-${TASK_ID}.json`
4. Invokes orchestrate.sh with plan file path
5. Monitors execution and reports results

**Alternative:** Make coordinator container invoke the existing cfn-docker-v3-coordinator agent logic via npx claude-flow-novice.

## Implementation Steps

### Step 1: Verify Coordinator Image Contents
```bash
# Inspect what's inside the built image
docker run --rm -it --entrypoint /bin/sh cfn-intelligent-coordinator:latest

# Check structure
ls -la /app
ls -la /app/src
ls -la /app/.claude/skills

# Check if coordinator.js exists and what it does
cat /app/src/coordinator.js | head -50
```

### Step 2: Test Minimal Container Launch
```bash
# Test coordinator can start and access Docker
docker run --rm \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --env TASK_ID="test-123" \
  cfn-intelligent-coordinator:latest \
  /bin/sh -c "docker ps && echo 'Docker access OK'"
```

### Step 3: Create Docker-Based Slash Command

**New File:** `.claude/commands/cfn-docker/CFN_DOCKER_LOOP_NATIVE.md`

```markdown
---
description: "Execute CFN Loop with fully containerized coordinator (Docker-in-Docker)"
argument-hint: "[task-description] --mode=mvp|standard|enterprise"
allowed-tools: ["Bash"]
---

# CFN Docker Loop - Native Container Mode

Execute CFN Loop with coordinator running in Docker container.

**Task Description:** $ARGUMENTS

## Execution Steps

### Step 1: Generate Task ID
```bash
TASK_ID="task-$(date +%s)-$$"
MODE="${MODE:-standard}"
```

### Step 2: Ensure Redis Running
```bash
if ! docker ps | grep -q cfn-redis; then
    echo "Starting Redis..."
    docker-compose up -d redis
    sleep 2
fi
```

### Step 3: Launch Coordinator Container
```bash
docker run --rm \
  --name "cfn-coordinator-${TASK_ID}" \
  --network mcp-network \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume $(pwd):/app/codebase:ro \
  --volume /tmp:/tmp \
  --env ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
  --env CFN_REDIS_HOST=cfn-redis \
  --env CFN_REDIS_PORT=6379 \
  --env TASK_ID="${TASK_ID}" \
  --env MODE="${MODE}" \
  --env TASK_DESCRIPTION="$ARGUMENTS" \
  cfn-intelligent-coordinator:latest
```

### Step 4: Report Results
```bash
echo "✅ CFN Loop execution complete: ${TASK_ID}"
echo "📊 Check Redis for task state: redis-cli HGETALL cfn_docker:task:${TASK_ID}"
```
```

### Step 4: Test Full Workflow
```bash
# Small test task
/cfn-docker-loop-native "Add hello world endpoint to API" --mode=mvp

# Monitor execution
docker logs -f cfn-coordinator-task-*
```

### Step 5: Update Existing Commands (Optional)
Modify existing `/cfn-docker-loop` to detect environment and choose:
- **Local development:** Use Task() (current behavior, full visibility)
- **Production/CI:** Use Docker container (this new approach)

Environment variable to control:
```bash
export CFN_COORDINATOR_MODE=docker  # or "task" for current behavior
```

## Benefits of Docker Coordinator

### Consistency
✅ All agents (coordinator + workers) use same execution model
✅ Coordinator gets same resource isolation as workers
✅ Identical behavior in dev/staging/prod

### Cost Optimization
✅ Can use cheaper model for coordinator via custom routing
✅ Resource limits prevent runaway coordinator processes
✅ Better monitoring of coordinator resource usage

### Portability
✅ Run CFN Loop on any machine with Docker
✅ No need for local Claude Code installation
✅ CI/CD pipelines can execute CFN Loops

### Testing
✅ Coordinator behavior identical across environments
✅ Easier integration testing (all containers)
✅ Reproducible coordinator execution

## Trade-offs

### Current (Task-based)
**Pros:**
- Full visibility in Main Chat
- Easy debugging (logs visible immediately)
- Simpler development workflow
- Direct file system access

**Cons:**
- Inconsistent execution model (coordinator vs workers)
- No resource isolation for coordinator
- Harder to run in CI/CD

### Proposed (Docker-based)
**Pros:**
- Consistent execution model
- Full resource isolation
- Portable across environments
- Better for CI/CD

**Cons:**
- Reduced visibility (need `docker logs`)
- More complex setup (volume mounts, env vars)
- Harder to debug coordinator logic
- Docker-in-Docker complexity

## Recommended Approach

**Hybrid Mode (Best of Both Worlds):**

Keep both modes available, controlled by environment variable:

```bash
# Development (current behavior)
export CFN_COORDINATOR_MODE=task
/cfn-docker-loop "Implement feature"

# Production (new Docker mode)
export CFN_COORDINATOR_MODE=docker
/cfn-docker-loop "Implement feature"
```

**Slash Command Detection:**
```markdown
## Step 1: Detect Mode
```bash
if [[ "${CFN_COORDINATOR_MODE:-task}" == "docker" ]]; then
    # Use docker run (new approach)
else
    # Use Task() tool (current approach)
fi
```
```

**Default:** Keep `task` mode as default for development.
**Override:** Use `docker` mode for production/CI or when testing full containerization.

## Next Steps

1. **Inspect coordinator image** to understand what `docker/coordinator/src/coordinator.js` does
2. **Test minimal launch** to verify Docker-in-Docker works
3. **Create proof-of-concept** slash command for native Docker mode
4. **Compare results** between Task mode and Docker mode
5. **Update planning phase** to work in both modes (file paths, volumes)
6. **Documentation** for when to use each mode

## Questions to Answer

1. **Does `docker/coordinator/src/coordinator.js` exist and what does it do?**
2. **How does it relate to `cfn-docker-v3-coordinator` agent?**
3. **Does it already invoke orchestrate.sh or needs that added?**
4. **Does the coordinator image have orchestrate.sh copied into it?**
5. **What's the coordinator's expected input/output format?**

These need verification before proceeding.
