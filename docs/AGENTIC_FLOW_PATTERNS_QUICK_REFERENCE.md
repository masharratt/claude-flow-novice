# Agentic-Flow Patterns - Quick Reference for CFN

**Purpose:** Immediately implementable patterns from agentic-flow analysis
**Target:** Bug #4 fixes and CFN v3.1 enhancements
**Updated:** 2025-11-21

---

## Pattern 1: Docker Status Polling (Bug #4 Fix)

**Problem:** Redis queue coordination deadlock - agents never consume queue

**Agentic-Flow Solution:** They use `child_process.on('close')` for completion detection

**CFN Adaptation:** Poll Docker API for container status (no Redis queue)

```javascript
// File: .claude/skills/cfn-loop-orchestration/orchestrate.sh (lines 296-350)
// REPLACE: waitForCompletion() Redis polling
// WITH: Docker API status polling

async function waitForWaveCompletion(waveContainerNames) {
  const checkInterval = 2000; // Poll every 2s
  const stuckTimeout = 30 * 60 * 1000; // 30min timeout

  const containerStartTimes = new Map();
  waveContainerNames.forEach(name => {
    containerStartTimes.set(name, Date.now());
  });

  while (true) {
    // List all containers matching wave names
    const containers = await docker.listContainers({
      filters: { name: waveContainerNames },
      all: true  // Include exited containers
    });

    const running = containers.filter(c => c.State === 'running');
    const exited = containers.filter(c => c.State === 'exited');

    // Check for stuck agents (running >30min with no progress)
    for (const container of running) {
      const name = container.Names[0].replace('/', '');
      const runtime = Date.now() - containerStartTimes.get(name);

      if (runtime > stuckTimeout) {
        console.warn(`⚠️ Agent stuck: ${name} (runtime: ${runtime}ms)`);
        // Kill stuck container
        await docker.getContainer(container.Id).stop();
        await docker.getContainer(container.Id).remove();
      }
    }

    // All agents finished
    if (running.length === 0 && exited.length === waveContainerNames.length) {
      // Collect exit codes
      const failed = [];
      for (const container of exited) {
        const inspect = await docker.getContainer(container.Id).inspect();
        const exitCode = inspect.State.ExitCode;

        if (exitCode !== 0) {
          const name = container.Names[0].replace('/', '');
          failed.push({ name, exitCode });
        }
      }

      if (failed.length > 0) {
        console.warn(`⚠️ ${failed.length} agents failed:`);
        failed.forEach(f => console.warn(`  - ${f.name} (exit ${f.exitCode})`));
      }

      return { success: failed.length === 0, failed };
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
}
```

**Key Changes:**
1. No Redis queue operations (`rPush`, `BLPOP`)
2. Poll Docker API directly for container states
3. Timeout stuck agents after 30min
4. Return exit codes for failure analysis

**Files to Modify:**
- `.claude/skills/cfn-loop-orchestration/orchestrate.sh` (lines 167-195, 296-350)
- `.claude/skills/cfn-coordination/wait-for-completion.sh` (entire file)

---

## Pattern 2: Health Check Endpoints

**Agentic-Flow Pattern:** HTTP endpoint in every agent for health monitoring

**CFN Implementation:**

```javascript
// File: .claude/agents/cfn-dev-team/_shared/agent-health.js (NEW)

const http = require('http');

class AgentHealth {
  constructor(agentId, port = 8080) {
    this.agentId = agentId;
    this.status = 'initializing';
    this.progress = 0;
    this.startTime = Date.now();
    this.lastUpdate = Date.now();

    this.server = http.createServer((req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        const health = {
          agentId: this.agentId,
          status: this.status,  // initializing | working | waiting | complete | error
          progress: this.progress,  // 0.0-1.0
          memory: process.memoryUsage(),
          uptime: (Date.now() - this.startTime) / 1000,
          lastUpdate: (Date.now() - this.lastUpdate) / 1000,
          timestamp: Date.now()
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health, null, 2));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.server.listen(port, () => {
      console.log(`Health check server listening on port ${port}`);
    });
  }

  updateStatus(status, progress = null) {
    this.status = status;
    if (progress !== null) {
      this.progress = progress;
    }
    this.lastUpdate = Date.now();
  }

  close() {
    this.server.close();
  }
}

module.exports = { AgentHealth };
```

**Usage in Agent:**

```javascript
// In agent initialization
const { AgentHealth } = require('./_shared/agent-health.js');
const health = new AgentHealth(process.env.AGENT_ID, 8080);

// Update during execution
health.updateStatus('working', 0.0);
await implementFeature();
health.updateStatus('working', 0.5);
await runTests();
health.updateStatus('working', 0.9);
health.updateStatus('complete', 1.0);

// Cleanup
health.close();
```

**Orchestrator Polling:**

```bash
# File: .claude/skills/cfn-loop-orchestration/poll-agent-health.sh (NEW)

AGENT_CONTAINER="$1"
TIMEOUT_SECONDS="${2:-1800}"  # 30min default

STUCK_THRESHOLD=300  # 5min without update = stuck

while true; do
  # Poll health endpoint
  HEALTH=$(docker exec "$AGENT_CONTAINER" curl -s http://localhost:8080/health 2>/dev/null || echo "{}")

  STATUS=$(echo "$HEALTH" | jq -r '.status // "unknown"')
  LAST_UPDATE=$(echo "$HEALTH" | jq -r '.lastUpdate // 999999')

  # Check if complete
  if [ "$STATUS" = "complete" ]; then
    echo "Agent complete: $AGENT_CONTAINER"
    exit 0
  fi

  # Check if stuck
  if (( $(echo "$LAST_UPDATE > $STUCK_THRESHOLD" | bc -l) )); then
    echo "Agent stuck: $AGENT_CONTAINER (no update for ${LAST_UPDATE}s)"
    docker stop "$AGENT_CONTAINER"
    exit 1
  fi

  sleep 2
done
```

**Benefits:**
- Real-time progress visibility
- Detect stuck agents (no health update for 5min)
- Memory leak detection (memory usage trending up)
- No Redis dependency

---

## Pattern 3: Priority-Based Wave Spawning

**Agentic-Flow Pattern:** Sequential priority levels, parallel within level

**CFN Implementation:**

```javascript
// File: .claude/skills/cfn-loop-orchestration/orchestrate.sh (enhanced)

async function executeWavesWithPriorities(batches, memoryBudget) {
  // Assign priorities to batches
  const priorityGroups = batches.reduce((groups, batch) => {
    // Loop 3 implementers = Priority 1 (most critical)
    // Loop 2 validators = Priority 2
    // Product owner = Priority 3
    const priority = batch.loopType === 'loop3' ? 1 : batch.loopType === 'loop2' ? 2 : 3;

    groups[priority] = groups[priority] || [];
    groups[priority].push(batch);
    return groups;
  }, {});

  // Execute each priority level sequentially
  const priorities = Object.keys(priorityGroups).sort((a, b) => parseInt(a) - parseInt(b));

  for (const priority of priorities) {
    const groupBatches = priorityGroups[priority];
    console.log(`🔄 Priority ${priority}: ${groupBatches.length} batches`);

    // Spawn batches in priority group (with memory budget)
    const wave = [];
    let waveMemory = 0;

    for (const batch of groupBatches) {
      const batchMemory = parseMemory(batch.memory);

      if (waveMemory + batchMemory <= memoryBudget) {
        wave.push(batch);
        waveMemory += batchMemory;
      } else {
        // Memory budget full, spawn wave and wait
        await spawnWave(wave);
        await waitForWaveCompletion(wave);

        // Start new wave
        wave.length = 0;
        wave.push(batch);
        waveMemory = batchMemory;
      }
    }

    // Spawn final wave in priority group
    if (wave.length > 0) {
      await spawnWave(wave);
      await waitForWaveCompletion(wave);
    }

    console.log(`✅ Priority ${priority} complete`);
  }
}

function parseMemory(memStr) {
  const match = memStr.match(/^(\d+)(MB|GB)$/);
  if (!match) throw new Error(`Invalid memory format: ${memStr}`);

  const [, amount, unit] = match;
  const bytes = parseInt(amount) * (unit === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024);
  return bytes;
}
```

**Priority Assignment:**

```javascript
// Loop 3 (implementers) - Priority 1
const loop3Batches = batches.filter(b => b.loopType === 'loop3').map(b => ({
  ...b,
  priority: 1
}));

// Loop 2 (validators) - Priority 2
const loop2Batches = batches.filter(b => b.loopType === 'loop2').map(b => ({
  ...b,
  priority: 2
}));

// Product Owner - Priority 3
const ownerBatch = { loopType: 'owner', priority: 3, ... };
```

**Benefits:**
- Critical work (Loop 3) completes first
- Validators (Loop 2) don't start until implementers finish
- Better memory budget utilization per priority level
- Fail-fast on high-priority failures

---

## Pattern 4: Child Process Spawning (Lightweight Alternative)

**Agentic-Flow Pattern:** Use `child_process.spawn()` instead of Docker for lightweight tasks

**CFN Implementation (Optional Enhancement):**

```javascript
// File: .claude/skills/cfn-agent-spawning/spawn-process.js (NEW)

const { spawn } = require('child_process');
const path = require('path');

async function spawnProcessAgent(config) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      AGENT_ID: config.agentId,
      AGENT_TYPE: config.agentType,
      TASK_ID: config.taskId,
      TASK_PROMPT: config.taskPrompt,
      REDIS_HOST: config.redisHost || 'localhost',
      WORKSPACE_PATH: config.workspacePath
    };

    const agentScript = path.join(
      __dirname,
      '../../../.claude/agents/cfn-dev-team',
      config.agentType,
      'execute.js'
    );

    const child = spawn('node', [agentScript], {
      env,
      stdio: 'pipe',  // Capture stdout/stderr
      cwd: config.workspacePath
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`[${config.agentId}] ${data.toString()}`);
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`[${config.agentId}] ${data.toString()}`);
    });

    child.on('close', (code) => {
      // Parse confidence score from output
      const confidenceMatch = stdout.match(/Confidence:\s*([\d.]+)/i);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0;

      if (code === 0) {
        resolve({
          success: true,
          confidence,
          stdout,
          stderr,
          exitCode: code
        });
      } else {
        reject(new Error(`Agent failed with exit code ${code}\n${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });

    // Timeout after 30min
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Agent timeout: ${config.agentId}`));
    }, 30 * 60 * 1000);
  });
}

module.exports = { spawnProcessAgent };
```

**Hybrid Spawning Strategy:**

```javascript
// File: .claude/skills/cfn-agent-spawning/spawn-agent.sh (enhanced)

async function spawnAgent(config) {
  const spawnMode = process.env.CFN_SPAWN_MODE || 'docker';

  if (spawnMode === 'docker') {
    // Strong isolation (current CFN approach)
    return spawnDockerContainer(config);
  } else if (spawnMode === 'process') {
    // Lightweight (agentic-flow approach)
    return spawnProcessAgent(config);
  } else if (spawnMode === 'hybrid') {
    // Decide based on agent type
    if (config.agentType.includes('validator') || config.agentType === 'product-owner') {
      // Use process for validators (no isolation needed)
      return spawnProcessAgent(config);
    } else {
      // Use Docker for implementers (strong isolation)
      return spawnDockerContainer(config);
    }
  } else {
    throw new Error(`Invalid CFN_SPAWN_MODE: ${spawnMode}`);
  }
}
```

**Performance Comparison:**

| Metric | Docker Spawn | Process Spawn |
|--------|--------------|---------------|
| Startup time | 2-5s | 0.1-0.5s |
| Memory overhead | 100-200MB | 10-20MB |
| Isolation | Strong (filesystem, network) | Weak (shared memory) |
| Use case | Loop 3 implementers | Loop 2 validators |

**Configuration:**

```bash
# .env
CFN_SPAWN_MODE=hybrid  # docker | process | hybrid

# Hybrid mode:
# - Loop 3 implementers: Docker (strong isolation)
# - Loop 2 validators: Process (lightweight)
# - Product owner: Process (short-lived)
```

---

## Pattern 5: Vector Clock State Sync

**Agentic-Flow Pattern:** Track distributed state with logical timestamps

**CFN Implementation (Future Enhancement):**

```javascript
// File: .claude/skills/cfn-coordination/vector-clock.js (NEW)

class VectorClock {
  constructor(agentId, redisClient) {
    this.agentId = agentId;
    this.redis = redisClient;
    this.clock = {};
  }

  async increment() {
    this.clock[this.agentId] = (this.clock[this.agentId] || 0) + 1;
    return this.clock[this.agentId];
  }

  async recordEvent(taskId, event, data) {
    await this.increment();

    const eventData = {
      agentId: this.agentId,
      event,
      data,
      clock: { ...this.clock },
      timestamp: Date.now()
    };

    // Store in Redis with vector clock
    await this.redis.hset(
      `state:${taskId}`,
      `${this.agentId}:${event}:${this.clock[this.agentId]}`,
      JSON.stringify(eventData)
    );

    return eventData;
  }

  async getEventsSince(taskId, otherClock) {
    // Get all events from Redis
    const state = await this.redis.hgetall(`state:${taskId}`);

    // Filter events newer than otherClock
    const events = [];
    for (const [key, value] of Object.entries(state)) {
      const event = JSON.parse(value);
      const [agentId] = key.split(':');

      // Event is new if its clock > otherClock for that agent
      if (event.clock[agentId] > (otherClock[agentId] || 0)) {
        events.push(event);
      }
    }

    // Update our clock with max of all seen clocks
    for (const event of events) {
      for (const [agentId, ts] of Object.entries(event.clock)) {
        this.clock[agentId] = Math.max(this.clock[agentId] || 0, ts);
      }
    }

    return events;
  }
}

module.exports = { VectorClock };
```

**Usage:**

```javascript
// Agent initialization
const { VectorClock } = require('.claude/skills/cfn-coordination/vector-clock.js');
const clock = new VectorClock(agentId, redisClient);

// Record events
await clock.recordEvent(taskId, 'started', { agentType: 'backend-dev' });
await clock.recordEvent(taskId, 'completed', { confidence: 0.92 });

// Catch up on missed events
const lastClock = await redisClient.hget(`agent:${agentId}`, 'lastClock');
const missedEvents = await clock.getEventsSince(taskId, JSON.parse(lastClock || '{}'));
```

**Benefits:**
- No lost messages (all events persisted)
- Agents can catch up after restart
- Distributed state without locking
- Causality tracking (event A happened before event B)

---

## Implementation Priority

**Immediate (Bug #4 Fix):**
1. ✅ Pattern 1: Docker status polling (replace Redis queue)
2. ✅ Pattern 2: Health check endpoints (detect stuck agents)

**Short-term (v3.1 - Q1 2026):**
3. ✅ Pattern 3: Priority-based wave spawning (better memory management)
4. ⚠️ Pattern 4: Hybrid spawning (evaluate performance gain)

**Long-term (v3.2 - Q2 2026):**
5. 🔮 Pattern 5: Vector clock state (eliminate Redis pub/sub issues)

---

## Testing Checklist

**Pattern 1 (Docker Polling):**
- [ ] Poll containers every 2s
- [ ] Detect completion via exit code
- [ ] Timeout stuck agents after 30min
- [ ] Clean up exited containers

**Pattern 2 (Health Checks):**
- [ ] Agents expose `/health` endpoint
- [ ] Report status: initializing | working | complete | error
- [ ] Report progress: 0.0-1.0
- [ ] Detect stuck agents (no update for 5min)

**Pattern 3 (Priority Waves):**
- [ ] Loop 3 agents spawn first (P1)
- [ ] Loop 2 agents spawn second (P2)
- [ ] Product owner spawns last (P3)
- [ ] Memory budget respected per priority level

**Pattern 4 (Hybrid Spawn):**
- [ ] Process spawning works for validators
- [ ] Docker spawning works for implementers
- [ ] Hybrid mode selects correctly
- [ ] Performance improvement measured (>50% faster validators)

**Pattern 5 (Vector Clocks):**
- [ ] Events recorded with logical timestamps
- [ ] Agents catch up on missed events
- [ ] No lost messages
- [ ] Causality preserved

---

## Files to Create/Modify

**New Files:**
- `.claude/agents/cfn-dev-team/_shared/agent-health.js`
- `.claude/skills/cfn-loop-orchestration/poll-agent-health.sh`
- `.claude/skills/cfn-agent-spawning/spawn-process.js`
- `.claude/skills/cfn-coordination/vector-clock.js`

**Modified Files:**
- `.claude/skills/cfn-loop-orchestration/orchestrate.sh` (lines 167-195, 296-350)
- `.claude/skills/cfn-coordination/wait-for-completion.sh` (entire file)
- `.claude/skills/cfn-agent-spawning/spawn-agent.sh` (add hybrid mode)

**Deleted Operations:**
- Remove all `redis.rPush('task:queue')` calls
- Remove all `redis.blpop('task:queue')` calls
- Remove Redis queue-based completion waiting

---

**Generated:** 2025-11-21
**Source:** Agentic-flow repository analysis
**Confidence:** 0.94 (based on direct code analysis)
