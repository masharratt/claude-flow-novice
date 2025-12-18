# Docker-Based CFN Agent Orchestration

**Purpose:** Agent reference for Docker-based CFN Loop execution with intelligent coordinator patterns, memory optimization, and autonomous iteration.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Environment Variable Contract](#environment-variable-contract)
3. [Coordinator Pattern (Option C)](#coordinator-pattern-option-c)
4. [Docker Agent Spawning](#docker-agent-spawning)
5. [Image Building](#image-building)
6. [Memory Management](#memory-management)
7. [Redis Coordination](#redis-coordination)
8. [Testing Patterns](#testing-patterns)
9. [CFN Loop Integration](#cfn-loop-integration)
10. [Skills and Tools](#skills-and-tools)
11. [Troubleshooting](#troubleshooting)

---

## Environment Variable Contract

**Reference:** `docker/runtime/cfn-runtime.contract.yml`

All Docker-based CFN components (agents, coordinators, orchestrators) use a standardized environment variable contract. This contract defines variable names, types, defaults, scopes, and legacy aliases.

### Key Variables for Coordinator

**Task Configuration:**
- `CFN_TASK_ID` (legacy: `TASK_ID`) - Unique task identifier (auto-generated)
- `CFN_TASK_TIMEOUT` - Task execution timeout in seconds (default: 3600)
- `CFN_ITERATION_LIMIT` - Max CFN Loop iterations (default: 10)

**Coordinator Resources:**
- `CFN_MEMORY_BUDGET` (legacy: `MEMORY_BUDGET`) - Memory allocation (default: "40g")
- `CFN_CPU_LIMIT` - CPU allocation (default: "4")
- `CFN_MAX_PARALLEL_AGENTS` - Max concurrent agents (default: 4)
- `CFN_SPAWN_INTERVAL_MS` - Delay between spawns in ms (default: 500)

**Redis Coordination:**
- `CFN_REDIS_HOST` (legacy: `REDIS_HOST`) - Redis hostname (default: "cfn-redis")
- `CFN_REDIS_PORT` (legacy: `REDIS_PORT`) - Redis port (default: 6379)
- `CFN_REDIS_PASSWORD` - Redis auth password (**REQUIRED in production**)

**Container Runtime:**
- `CFN_DOCKER_SOCKET` - Docker socket path (default: "/var/run/docker.sock")
- `CFN_NETWORK_NAME` - Docker network name (default: "cfn-network")
- `CFN_CONTAINER_MODE` - Running in container (default: false)

**Provider Configuration:**
- `CFN_CUSTOM_ROUTING` - Enable custom AI provider routing (default: false)
- `CFN_DEFAULT_PROVIDER` - Default AI provider (default: "zai")

### Variable Precedence

Variables are resolved in this order (first set wins):
1. Explicitly passed environment variables
2. CFN_ prefixed variables (standard)
3. Legacy variables (with warnings)
4. Defaults specified in contract
5. Hard-coded defaults in code

### Usage Example

```bash
docker run --rm \
  --name cfn-coordinator \
  --memory=2g \
  -e CFN_TASK_ID="task-$(date +%s)" \
  -e CFN_MEMORY_BUDGET="40g" \
  -e CFN_ITERATION_LIMIT="10" \
  -e CFN_REDIS_HOST="cfn-redis" \
  -e CFN_REDIS_PASSWORD="secure-password" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /path/to/workspace:/workspace:rw \
  --network cfn-network \
  cfn-coordinator:v3
```

**See:** `docker/runtime/cfn-runtime.contract.yml` for complete contract specification.

---

## Architecture Overview

### Container Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Docker Network: cfn-network                             │
│                                                         │
│  ┌──────────────────────────────────────┐             │
│  │ Redis Container (cfn-redis)           │             │
│  │ - Task queue coordination             │             │
│  │ - Completion counters                 │             │
│  │ - Metadata storage                    │             │
│  └──────────────────────────────────────┘             │
│                                                         │
│  ┌──────────────────────────────────────┐             │
│  │ Coordinator Container (2GB)           │             │
│  │ - Analyzes all errors                 │             │
│  │ - Creates strategic batches           │             │
│  │ - Spawns agents in waves              │             │
│  │ - Manages iterations                  │             │
│  │ - Mounts: docker.sock, workspace      │             │
│  └──────────────────────────────────────┘             │
│                                                         │
│  ┌──────────────────────────────────────┐             │
│  │ Agent Pool (dynamic, wave-based)      │             │
│  │ Wave 1: [512MB] [512MB] [600MB]       │             │
│  │ Wave 2: [800MB] [1GB]   [512MB]       │             │
│  │ - Claims tasks from Redis             │             │
│  │ - Executes fixes                      │             │
│  │ - Reports completion                  │             │
│  └──────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Coordinator Pattern: Option C (Hybrid Iterator)

**Selected Architecture:** Self-contained coordinator with internal iteration loop

**Why This Pattern:**
- ✅ Fits CFN Loop pattern (Loop 3 → Loop 2 → Iterate)
- ✅ Self-contained (no host script orchestration needed)
- ✅ Passive monitoring (simple Redis counter polling)
- ✅ Wave spawning handles 40GB memory budget automatically
- ✅ Fault-tolerant (Redis coordination survives coordinator restarts)

**Alternatives Rejected:**
- ❌ Option A (Single-Shot): No iteration support
- ❌ Option B (Host-Side Iterator): Requires external orchestration

---

## Coordinator Pattern (Option C)

### Coordinator Lifecycle

```
START
  ↓
┌─────────────────────────────────────┐
│ ITERATION LOOP (max iterations)    │
│                                     │
│ 1. Analyze errors (tsc --noEmit)   │
│    Parse ALL TypeScript errors     │
│                                     │
│ 2. IF errors = 0 → EXIT (PROCEED) │
│                                     │
│ 3. Build dependency graph          │
│    (directory or AST-based)         │
│                                     │
│ 4. Cluster files by dependencies   │
│    (Union-Find algorithm)           │
│                                     │
│ 5. Create strategic batches        │
│    (four-tier memory allocation)    │
│                                     │
│ 6. Push tasks to Redis             │
│    SET task:total, task:completed   │
│    LPUSH task:queue [tasks...]      │
│                                     │
│ 7. Spawn agents in waves           │
│    (respecting memory budget)       │
│                                     │
│ 8. WAIT for completion             │
│    WHILE task:completed < task:total│
│      SLEEP 5s (passive polling)     │
│                                     │
│ 9. Cleanup completed agents        │
│                                     │
│ 10. GOTO step 1 (ITERATE)          │
└─────────────────────────────────────┘
  ↓
EXIT (errors = 0 or max iterations)
```

### Agent Lifecycle

```
START
  ↓
CLAIM task from Redis (atomic RPOP task:queue)
  ↓
IF queue empty → EXIT
  ↓
FETCH task metadata (HGETALL task:N)
  ↓
READ file(s) from /workspace
  ↓
EXECUTE Claude Code CLI with specialist
  ↓
WRITE fixed file(s) to /workspace
  ↓
INCR task:completed
  ↓
HSET task:N:result (metadata)
  ↓
GOTO CLAIM (loop until queue empty)
```

---

## Docker Agent Spawning

### Wave-Based Spawning Algorithm

**Purpose:** Maximize parallelism while respecting memory budget

```javascript
const MEMORY_BUDGET = 40 * 1024 * 1024 * 1024; // 40GB
let currentWave = 1;
let batchQueue = [...batches];

while (batchQueue.length > 0) {
  const wave = [];
  let waveMemory = 0;

  // Fill wave up to budget
  while (batchQueue.length > 0) {
    const batch = batchQueue[0];
    const batchMemory = parseMemory(batch.memory);

    if (waveMemory + batchMemory <= MEMORY_BUDGET) {
      wave.push(batchQueue.shift());
      waveMemory += batchMemory;
    } else {
      break; // Budget full, spawn next wave
    }
  }

  // Spawn all agents in wave (parallel)
  await Promise.all(wave.map(batch => spawnAgent(batch)));

  // Wait for wave completion
  await waitForWaveCompletion(wave);

  currentWave++;
}
```

### Spawning Agent Containers

**Via Dockerode (coordinator internal):**

```javascript
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const container = await docker.createContainer({
  Image: 'claude-flow-novice-agent:frontend',
  name: `agent-${batchId}-${Date.now()}`,
  HostConfig: {
    Memory: parseMemory(batch.memory), // e.g., 512MB, 1GB
    Binds: [
      '/workspace:/workspace:rw',
      '${PWD}/.env:/workspace/.env:ro'
    ],
    NetworkMode: 'cfn-network',
    AutoRemove: false // Manual cleanup after validation
  },
  Env: [
    'REDIS_HOST=cfn-redis',
    'REDIS_PORT=6379',
    `TASK_ID=${batchId}`,
    `AGENT_ID=agent-${batchId}`,
    `ITERATION=${currentIteration}`,
    `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`
  ],
  Cmd: ['node', '/app/agent-worker.js']
});

await container.start();
```

### Agent Worker Pattern

**Agent entrypoint** (`agent-worker.js`):

```javascript
const Redis = require('redis');
const redis = Redis.createClient({ host: process.env.REDIS_HOST });

async function main() {
  while (true) {
    // Atomic task claim
    const taskId = await redis.rpop('task:queue');
    if (!taskId) {
      console.log('Queue empty, exiting');
      process.exit(0);
    }

    // Fetch task metadata
    const task = await redis.hgetall(`task:${taskId}`);
    const files = JSON.parse(task.files);

    // Execute fix
    const result = await fixTypeScriptErrors(files, task);

    // Report completion
    await redis.incr('task:completed');
    await redis.hset(`task:${taskId}:result`, {
      agent_id: process.env.AGENT_ID,
      status: 'completed',
      files_modified: JSON.stringify(result.filesModified),
      fix_time_seconds: result.duration,
      completed_at: new Date().toISOString()
    });
  }
}

main().catch(err => {
  console.error('Agent failed:', err);
  process.exit(1);
});
```

---

## Image Building

### Build Strategies

#### Option 1: Direct Docker Build (Fast, WSL2 compatible)

```bash
docker build -f Dockerfile.agent -t claude-flow-novice-agent:latest .
```

**Use when:**
- Small Docker context (<100MB)
- Fast I/O available
- No Windows mount issues

#### Option 2: Linux Native Build (Recommended - 96% faster)

**Using docker-build skill:**

```bash
# Standard agent image build (most common)
./.claude/skills/docker-build/build.sh

# Custom Dockerfile and tag
./.claude/skills/docker-build/build.sh \
  --dockerfile Dockerfile.coordinator \
  --tag cfn-intelligent-coordinator:latest

# Force rebuild without cache
./.claude/skills/docker-build/build.sh --no-cache
```

**Performance Benefits:**
- Build Time: 755s → <20s (96% faster)
- Context Transfer: 0.1s vs 755s on Windows mounts
- Method: rsync to Linux native storage (`/tmp/cfn-build`)
- Prevents exit code 137 (OOM) on large contexts

**Why this works:**
- Syncs files to `/tmp/cfn-build` (Linux native storage)
- Fast I/O (no Windows mount overhead)
- Uses rsync with exclusion patterns (minimal context)
- BuildKit optimization enabled

**Use when:**
- Large Docker context (>500MB)
- Building from WSL2 with Windows mounts
- Previous direct builds failed with OOM
- After modifying agent templates
- After source code or dependency changes
- When standard Docker build is too slow

**See:** `.claude/skills/docker-build/SKILL.md` for complete documentation

### Dockerfile Patterns

#### Coordinator Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY docker/coordinator/package.json ./
RUN npm install --production

# Copy source
COPY docker/coordinator/src ./src
COPY docker/coordinator/lib ./lib

# Configuration via environment
ENV MEMORY_BUDGET=40g
ENV MAX_ITERATIONS=10
ENV REDIS_HOST=cfn-redis
ENV REDIS_PORT=6379
ENV NETWORK_NAME=cfn-network
ENV AGENT_IMAGE=claude-flow-novice-agent:frontend

# Mount docker.sock for agent spawning
VOLUME /var/run/docker.sock

# Mount workspace for file access
VOLUME /workspace

ENTRYPOINT ["node", "src/coordinator.js"]
```

#### Agent Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Install Claude Code CLI and TypeScript
RUN npm install -g typescript claude-flow-novice

# Copy agent worker script
COPY docker/agents/agent-worker.js ./

# Mount workspace (provided at runtime)
VOLUME /workspace

ENTRYPOINT ["node", "agent-worker.js"]
```

### Multi-Language Agent Images

**Specialized images for different languages:**

```bash
# TypeScript/Frontend agent
docker build -f Dockerfile.agent.typescript -t claude-flow-novice-agent:frontend .

# Python agent
docker build -f Dockerfile.agent.python -t claude-flow-novice-agent:python .

# Rust agent
docker build -f Dockerfile.agent.rust -t claude-flow-novice-agent:rust .
```

---

## Memory Management

### Four-Tier Batching Strategy

**Optimizes memory allocation based on file coordination requirements**

| Tier | Cluster Size | Memory | Use Case | Example |
|------|-------------|--------|----------|---------|
| **1** | 1 file | 512MB | Independent files (no dependencies) | `Footer.tsx` (standalone component) |
| **2** | 2-3 files | 600MB | Small feature clusters | `[LoginForm.tsx, AuthContext.tsx, useAuth.ts]` |
| **3** | 4-8 files | 800MB | Medium feature modules | Story management (list, card, types, API, utils) |
| **4** | 9+ files | 1GB | Large interconnected modules | Complete admin dashboard with shared state |

### Memory Optimization Results

**Based on B10 test (32 agents, 376MB peak per agent):**

**Naive Approach:**
- 85 files × 1GB = **85GB** ❌ (exceeds 40GB budget)

**Strategic Batching:**
- 42 Tier 1 batches × 512MB = 21.5GB
- 12 Tier 2 batches × 600MB = 7.2GB
- 3 Tier 3 batches × 800MB = 2.4GB
- 1 Tier 4 batch × 1GB = 1GB
- **Total: 32.1GB** ✅ (fits in budget, 66% reduction)

### Dependency Clustering

#### Phase 1: Directory-Based (Simple, 80% accuracy)

```javascript
function clusterByDirectory(files) {
  const clusters = new Map();

  for (const file of files) {
    const dir = path.dirname(file);
    if (!clusters.has(dir)) {
      clusters.set(dir, []);
    }
    clusters.get(dir).push(file);
  }

  return Array.from(clusters.values());
}
```

**Pros:**
- Fast (10 lines of code)
- No external dependencies
- Good approximation for typical codebases

**Cons:**
- Misses cross-directory dependencies
- May group unrelated files

#### Phase 2: AST-Based (Complex, 95% accuracy)

```javascript
const ts = require('typescript');

function buildDependencyGraph(files) {
  const graph = new Map();

  for (const file of files) {
    const sourceFile = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest
    );

    const imports = extractImports(sourceFile);
    graph.set(file, imports);
  }

  return unionFind(graph); // Connected components
}
```

**Pros:**
- Accurate dependency detection
- Handles circular dependencies
- Respects TypeScript import structure

**Cons:**
- Requires TypeScript compiler API
- Slower parsing time
- 10x more code

**Decision:** Ship directory-based first, enhance to AST-based if clustering accuracy <80%.

---

## Redis Coordination

### Redis Schema

#### Task Queue

```
task:queue          LIST    [task_ids in queue]
task:total          STRING  Total tasks this iteration
task:completed      STRING  Completed tasks this iteration
```

#### Task Metadata

```
task:1              HASH
  batch_id          "cluster-auth-2"
  tier              "2"
  files             '["LoginForm.tsx","AuthContext.tsx","useAuth.ts"]'
  total_errors      "5"
  memory            "600m"
  coordination_note "Files share AuthContext types"
  iteration         "1"
```

#### Task Results

```
task:1:result       HASH
  agent_id          "wave1-agent-5"
  status            "completed"
  files_modified    '["LoginForm.tsx","AuthContext.tsx","useAuth.ts"]'
  fix_time_seconds  "145"
  completed_at      "2025-01-12T10:30:45Z"
```

### Coordination Patterns

#### Coordinator: Task Creation

```javascript
// Push all tasks to Redis
const taskIds = [];
for (let i = 0; i < batches.length; i++) {
  const taskId = `task:${iteration}-${i}`;
  taskIds.push(taskId);

  // Store task metadata
  await redis.hset(taskId, {
    batch_id: batches[i].batch_id,
    tier: batches[i].tier,
    files: JSON.stringify(batches[i].files),
    total_errors: batches[i].total_errors,
    memory: batches[i].memory,
    coordination_note: batches[i].coordination_note,
    iteration: iteration
  });
}

// Initialize counters
await redis.set('task:total', taskIds.length);
await redis.set('task:completed', 0);

// Push to queue (LPUSH for FIFO via RPOP)
await redis.lpush('task:queue', ...taskIds);
```

#### Agent: Task Claim and Completion

```javascript
// Atomic task claim (RPOP is atomic)
const taskId = await redis.rpop('task:queue');

if (!taskId) {
  console.log('No tasks available');
  process.exit(0);
}

// Fetch task details
const task = await redis.hgetall(taskId);

// Execute work
const result = await executeTask(task);

// Report completion (atomic increment)
await redis.incr('task:completed');

// Store results
await redis.hset(`${taskId}:result`, {
  agent_id: process.env.AGENT_ID,
  status: 'completed',
  files_modified: JSON.stringify(result.filesModified),
  fix_time_seconds: result.duration,
  completed_at: new Date().toISOString()
});
```

#### Coordinator: Wait for Completion

```javascript
async function waitForCompletion() {
  const total = parseInt(await redis.get('task:total'));

  while (true) {
    const completed = parseInt(await redis.get('task:completed'));

    console.log(`Progress: ${completed}/${total} (${Math.round(completed/total*100)}%)`);

    if (completed >= total) {
      console.log('All tasks completed');
      break;
    }

    await sleep(5000); // Poll every 5 seconds
  }
}
```

### Passive Polling vs Active Tracking

**Passive Polling (Selected):**
- ✅ Simpler coordinator logic
- ✅ No agent lifecycle management
- ✅ Natural checkpoint for iterations
- ✅ Scales to any number of agents
- ✅ Fault-tolerant (coordinator can restart)

**Active Tracking (Rejected):**
- ❌ Requires maintaining state for each agent
- ❌ Complex error handling (agent crashes)
- ❌ Coordinator must track agent PIDs
- ❌ Doesn't survive coordinator restarts

---

## Testing Patterns

### Test Infrastructure

#### Full Frontend Test

**File:** `tests/docker/intelligent-coordinator-test.sh`

```bash
#!/bin/bash
set -euo pipefail

FRONTEND_PATH="/mnt/c/Users/masha/Documents/ourstories-v2/frontend"
MEMORY_BUDGET="40g"
MAX_ITERATIONS=5

echo "Starting intelligent coordinator test"
echo "Frontend: $FRONTEND_PATH"
echo "Memory Budget: $MEMORY_BUDGET"
echo "Max Iterations: $MAX_ITERATIONS"

# Count initial errors
INITIAL_ERRORS=$(cd "$FRONTEND_PATH" && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l)
echo "Initial errors: $INITIAL_ERRORS"

# Launch coordinator
START_TIME=$(date +%s)

docker run --rm \
  --name cfn-coordinator \
  --memory=2g \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$FRONTEND_PATH":/workspace:rw \
  -e MEMORY_BUDGET="$MEMORY_BUDGET" \
  -e MAX_ITERATIONS="$MAX_ITERATIONS" \
  -e REDIS_HOST=cfn-redis \
  --network cfn-network \
  --env-file .env \
  cfn-intelligent-coordinator:latest

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Count final errors
FINAL_ERRORS=$(cd "$FRONTEND_PATH" && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l)

echo ""
echo "=== Test Results ==="
echo "Initial errors: $INITIAL_ERRORS"
echo "Final errors: $FINAL_ERRORS"
echo "Errors fixed: $((INITIAL_ERRORS - FINAL_ERRORS))"
echo "Reduction: $(( (INITIAL_ERRORS - FINAL_ERRORS) * 100 / INITIAL_ERRORS ))%"
echo "Duration: ${DURATION}s"

if [ "$FINAL_ERRORS" -eq 0 ]; then
  echo "✅ SUCCESS: All errors resolved"
  exit 0
else
  echo "⚠️  PARTIAL: $FINAL_ERRORS errors remain"
  exit 1
fi
```

#### B10 Batch Test (Reference)

**File:** `tests/docker/b10-typescript-fix-test.sh`

Tests 10 files with TypeScript errors in parallel:
- 32 agents spawned
- 376MB peak memory per agent
- Validates Docker agent coordination

### Validation Steps

1. **Pre-Test Validation:**
   - Count initial errors (`tsc --noEmit`)
   - Verify Docker images exist
   - Check Redis connectivity
   - Validate workspace mount

2. **During Test:**
   - Monitor coordinator logs
   - Track memory usage
   - Count active agents
   - Verify task queue progress

3. **Post-Test Validation:**
   - Count final errors
   - Calculate reduction percentage
   - Verify all containers cleaned up
   - Check for agent failures

---

## CFN Loop Integration

### CFN Loop Mapping

**Loop 3 (Implementation Team):**
- Coordinator spawns agents based on strategic batches
- Agents claim tasks from Redis
- Agents execute TypeScript fixes
- Multiple agents work in parallel

**Loop 2 (Validation):**
- Coordinator runs `tsc --noEmit` after agents complete
- Counts remaining errors
- Reports validation results

**Product Owner Decision:**
- `IF errors > 0`: Decision = **ITERATE** → Start next iteration
- `IF errors = 0`: Decision = **PROCEED** → Exit coordinator
- Max iterations = 10 (safety limit)

**Consensus Mechanism:**
- Self-validation via TypeScript compiler
- No manual consensus needed (compiler is source of truth)
- Binary outcome: errors exist or don't

### Iteration Pattern

```
ITERATION 1:
  Analyze: 400 errors in 85 files
  Batch: 58 batches (32.1GB)
  Spawn: Wave 1 (all batches fit)
  Wait: 4 minutes
  Validate: 42 errors remaining
  Decision: ITERATE

ITERATION 2:
  Analyze: 42 errors in 15 files
  Batch: 11 batches (6GB)
  Spawn: Wave 1 (all batches fit)
  Wait: 1.5 minutes
  Validate: 2 errors remaining
  Decision: ITERATE

ITERATION 3:
  Analyze: 2 errors in 2 files
  Batch: 2 batches (1GB)
  Spawn: Wave 1 (all batches fit)
  Wait: 30 seconds
  Validate: 0 errors
  Decision: PROCEED

RESULT: 3 iterations, 6 minutes total
```

---

## Skills and Tools

### Coordinator Skills

**File:** `docker/coordinator/src/coordinator.js`

**Phases:**
1. `analyzeAllErrors()` - Run `tsc --noEmit` on entire codebase
2. `buildDependencyGraph()` - Parse imports (directory or AST-based)
3. `clusterFiles()` - Group files by dependencies (Union-Find)
4. `createBatches()` - Assign memory tiers based on cluster size
5. `pushTasksToRedis()` - Create task queue with metadata
6. `spawnAgents()` - Wave-based spawning respecting memory budget
7. `waitForCompletion()` - Passive Redis polling (5s intervals)
8. `cleanupAgents()` - Remove completed containers
9. **Main Loop:** Iterates until `errors === 0` or max iterations

### Agent Skills

**File:** `docker/agents/agent-worker.js`

**Capabilities:**
1. Atomic task claiming from Redis
2. File reading from workspace mount
3. TypeScript error fixing via Claude Code CLI
4. File writing to workspace mount
5. Completion reporting to Redis
6. Queue loop (continues until empty)

### Utility Scripts and Skills

**Build from Linux (docker-build skill):**
- `.claude/skills/docker-build/build.sh` - 96% faster builds using Linux native storage
- Wrapper for `scripts/docker/build-from-linux.sh`
- Syncs to `/tmp/cfn-build` for fast I/O
- See `.claude/skills/docker-build/SKILL.md` for complete documentation

**Docker Utils:**
- `scripts/docker-utils/cleanup-agents.sh` - Remove all agent containers
- `scripts/docker-utils/monitor-memory.sh` - Track memory usage
- `scripts/docker-utils/redis-stats.sh` - View Redis coordination stats

---

## Troubleshooting

### Common Issues

#### Issue: OOM During Docker Build (Exit Code 137)

**Cause:** Large Docker context on Windows mount

**Solution - Use docker-build skill (96% faster):**
```bash
# Standard build with default agent image
./.claude/skills/docker-build/build.sh

# Custom Dockerfile and tag
./.claude/skills/docker-build/build.sh \
  --dockerfile Dockerfile.coordinator \
  --tag cfn-intelligent-coordinator:latest

# Force rebuild without cache
./.claude/skills/docker-build/build.sh --no-cache
```

**Alternative - Direct script:**
```bash
export DOCKERFILE="Dockerfile.coordinator"
export IMAGE_NAME="cfn-intelligent-coordinator"
./scripts/docker/build-from-linux.sh
```

#### Issue: Agents Not Claiming Tasks

**Diagnosis:**
```bash
# Check Redis queue
docker exec cfn-redis redis-cli LLEN task:queue

# Check Redis connectivity from agent
docker exec <agent-container> ping cfn-redis
```

**Solutions:**
- Verify `--network cfn-network` on all containers
- Check Redis container is running
- Verify REDIS_HOST environment variable

#### Issue: Coordinator Memory Exceeded

**Diagnosis:**
```bash
docker stats cfn-coordinator
```

**Solutions:**
- Increase coordinator memory: `--memory=4g`
- Reduce batch size in clustering algorithm
- Process files in smaller iterations

#### Issue: Agents Timeout or Hang

**Diagnosis:**
```bash
# Check agent logs
docker logs <agent-container>

# Monitor active agents
docker ps --filter "name=agent-"
```

**Solutions:**
- Increase agent timeout (default: 30 minutes)
- Reduce tier memory allocation (more agents per wave)
- Check for infinite loops in agent worker script

#### Issue: Iteration Count Too High

**Diagnosis:**
- Check clustering accuracy (are related files grouped?)
- Review agent fix quality (are errors being fixed correctly?)

**Solutions:**
- Switch from directory-based to AST-based clustering
- Adjust tier allocation (larger clusters may need more coordination)
- Increase agent memory for complex fixes

---

## Environment Configuration

### Coordinator Environment Variables

```bash
# Memory and Performance
MEMORY_BUDGET=40g          # Total memory budget for all agents
MAX_ITERATIONS=10          # Maximum iteration count
COORDINATOR_MEMORY=2g      # Coordinator container memory

# Redis Coordination
REDIS_HOST=cfn-redis       # Redis hostname (within Docker network)
REDIS_PORT=6379            # Redis port

# Docker Configuration
NETWORK_NAME=cfn-network   # Docker network name
AGENT_IMAGE=claude-flow-novice-agent:frontend  # Agent image to spawn

# Clustering Strategy
CLUSTERING_MODE=directory  # 'directory' or 'ast'
```

### Agent Environment Variables

```bash
# Coordination
REDIS_HOST=cfn-redis       # Redis hostname
REDIS_PORT=6379            # Redis port
TASK_ID=<batch-id>         # Assigned by coordinator
AGENT_ID=<agent-id>        # Assigned by coordinator
ITERATION=<number>         # Current iteration

# Authentication
ANTHROPIC_API_KEY=<key>    # Required for Claude Code CLI
```

---

## Quick Reference

### Build and Run Coordinator

```bash
# Build image using docker-build skill (96% faster)
./.claude/skills/docker-build/build.sh \
  --dockerfile Dockerfile.coordinator \
  --tag cfn-intelligent-coordinator:latest

# Run coordinator
docker run --rm \
  --name cfn-coordinator \
  --memory=2g \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /path/to/project:/workspace:rw \
  -e MEMORY_BUDGET=40g \
  -e MAX_ITERATIONS=10 \
  -e REDIS_HOST=cfn-redis \
  --network cfn-network \
  --env-file .env \
  cfn-intelligent-coordinator:latest
```

### Monitor Execution

```bash
# Coordinator logs
docker logs -f cfn-coordinator

# Agent count
docker ps --filter "name=agent-" | wc -l

# Memory usage
docker stats

# Redis queue length
docker exec cfn-redis redis-cli LLEN task:queue

# Completion progress
docker exec cfn-redis redis-cli GET task:completed
docker exec cfn-redis redis-cli GET task:total
```

### Cleanup

```bash
# Stop coordinator
docker stop cfn-coordinator

# Remove all agents
docker ps -a --filter "name=agent-" -q | xargs docker rm -f

# Clear Redis
docker exec cfn-redis redis-cli FLUSHALL
```

---

## Success Metrics

### Efficiency
- Memory utilization: Target 80-85% of budget
- Parallelization: Maximize agents per wave
- Iteration count: Target <5 iterations for typical projects

### Quality
- Error resolution rate: >90% per iteration
- File coordination: Zero type conflicts in clustered files
- Validation: 100% pass rate on compiler validation

### Performance
- Iteration time: 4-6 minutes per iteration
- Total time: 15-25 minutes for 400 errors
- Throughput: ~20 errors fixed per minute

---

## Multi-Worktree Coordination

### Overview

One git worktree per developer with isolation via `COMPOSE_PROJECT_NAME`. Port offsets are auto-calculated with `run-in-worktree.sh` to avoid conflicts.

### Required Environment Variables

When spawning agents in a worktree context:

```bash
export COMPOSE_PROJECT_NAME="cfn-${BRANCH}"
export CFN_REDIS_PORT="${CFN_REDIS_PORT}"
export CFN_POSTGRES_PORT="${CFN_POSTGRES_PORT}"
export WORKTREE_BRANCH="${BRANCH}"
```

### Service Names

Use service names inside Docker networks (not container names):
- `redis` (not `cfn-redis-feature-branch`)
- `postgres` (not `cfn-postgres-feature-branch`)
- `orchestrator` (not `cfn-orchestrator-xyz`)

### Port Examples

| Worktree | Redis | Postgres | API |
|----------|-------|----------|-----|
| main | 6379 | 5432 | 3001 |
| feature-auth | ~6421 | ~5474 | ~3043 |
| bugfix-validation | ~6457 | ~5510 | ~3079 |

### Playbook

1. Create or enter worktree with branch-specific name
2. Run `./scripts/docker/run-in-worktree.sh up -d` to start services
3. Export project/port env vars before spawning agents
4. Connect using service names inside the network; from host, use offset ports
5. Tear down with `./scripts/docker/run-in-worktree.sh down` and prune networks if needed

### Checklist

- [ ] Start stack with `./scripts/docker/run-in-worktree.sh up -d`
- [ ] Isolate Redis keys by task IDs
- [ ] Avoid shared volumes between worktrees
- [ ] Use service names only inside Docker network

---

## File Structure

```
docker/
├── coordinator/
│   ├── src/
│   │   └── coordinator.js           # Main CFN Loop implementation
│   ├── lib/
│   │   ├── dependency-analyzer.js   # TypeScript AST parser
│   │   ├── union-find.js            # Clustering algorithm
│   │   ├── batch-generator.js       # Strategic batch creation
│   │   └── wave-spawner.js          # Docker spawning with budget mgmt
│   └── package.json                 # Dependencies: dockerode, redis, typescript
├── agents/
│   └── agent-worker.js              # Agent entrypoint
├── Dockerfile.coordinator           # Coordinator image
└── Dockerfile.agent                 # Agent image

tests/docker/
├── intelligent-coordinator-test.sh  # Full frontend test
├── b10-typescript-fix-test.sh       # B10 batch test (reference)
└── docker-hello-world-parity-tests.sh  # Parity validation

scripts/docker/
├── build-from-linux.sh              # Linux native build
└── linux-build.config               # Build configuration

scripts/docker-utils/
├── cleanup-agents.sh                # Remove agent containers
├── monitor-memory.sh                # Memory tracking
└── redis-stats.sh                   # Redis coordination stats

planning/docker/
├── intelligent-coordinator-architecture.md  # Architecture design
└── intelligent-coordinator-handoff.md       # Implementation handoff
```

---

## Version History

- **2025-11-12**: Initial Docker CLAUDE.md created
- Documented Option C coordinator pattern (Hybrid Iterator)
- Four-tier batching strategy with 66% memory optimization
- Wave-based spawning with 40GB budget management
- Redis coordination patterns (passive polling)
- CFN Loop integration (Loop 3 → Loop 2 → Product Owner)

---

**For CFN Loop execution:** This coordinator pattern implements Loop 3 (Implementation) and Loop 2 (Validation) with autonomous iteration based on Product Owner decisions.

**For agent development:** Follow the agent lifecycle pattern for task claiming, execution, and completion reporting using Redis coordination.

**For troubleshooting:** Use the monitoring commands and common issue resolutions documented above.
