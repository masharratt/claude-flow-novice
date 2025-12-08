# Agentic-Flow Docker & Coordination Analysis

**Analysis Date:** 2025-11-21
**Repository:** https://github.com/ruvnet/agentic-flow
**Focus:** Docker implementation patterns and coordination mechanisms for multi-agent systems

---

## Executive Summary

Agentic-flow uses a **WebSocket-based Federation Hub pattern** with centralized coordination, vector clocks for distributed state, and child process spawning for agent execution. Their approach differs significantly from our Redis-based coordination but offers proven patterns for container-to-container communication and completion detection.

**Key Finding:** They DON'T use Docker for agent spawning - they use **Node.js child_process.spawn()** with coordination via WebSocket hub. Containers are used for deployment/scaling, not agent isolation.

---

## 1. Docker Container Architecture

### 1.1 Federation Hub Pattern

**File:** `/agentic-flow/docker/federation-test/docker-compose.yml`

```yaml
services:
  # Central coordination hub
  federation-hub:
    build:
      dockerfile: docker/federation-test/Dockerfile.hub
    container_name: federation-hub
    ports:
      - "8443:8443"  # WebSocket server
    environment:
      - NODE_ENV=production
      - HUB_PORT=8443
      - HUB_DB_PATH=/data/hub.db
    volumes:
      - hub-data:/data
    networks:
      - federation-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8443/health"]
      interval: 5s
      timeout: 3s
      retries: 3

  # Agent containers (researcher, coder, tester, reviewer)
  agent-researcher:
    build:
      dockerfile: docker/federation-test/Dockerfile.agent
    container_name: agent-researcher
    depends_on:
      - federation-hub
    environment:
      - AGENT_TYPE=researcher
      - AGENT_ID=researcher-001
      - TENANT_ID=test-collaboration
      - HUB_ENDPOINT=ws://federation-hub:8443
      - TASK=research
    networks:
      - federation-network
```

**Key Insights:**

1. **Hub-and-Spoke Topology:** All agents connect to central hub via WebSocket
2. **Service Discovery:** Use Docker DNS (`federation-hub:8443`, not IP addresses)
3. **Health Checks:** HTTP-based health endpoint with 5s intervals
4. **Depends_on:** Sequential startup (hub first, then agents)
5. **Tenant Isolation:** Multi-tenancy via `TENANT_ID` environment variable

### 1.2 Container Networking

**Network Type:** Bridge network (`federation-network`)

**Service Discovery Pattern:**
```javascript
// Agents connect using service name (not container name)
const HUB_ENDPOINT = process.env.HUB_ENDPOINT || 'ws://federation-hub:8443';
```

**Why this works:**
- Docker automatically resolves `federation-hub` to container IP within the network
- No need for Redis service discovery or dynamic IP lookup
- Container names are auto-prefixed (`federation-hub` → `federation-hub_1`)

---

## 2. Coordination Mechanisms

### 2.1 WebSocket-Based Hub Server

**File:** `/agentic-flow/src/federation/FederationHubServer.ts`

**Protocol:** Custom message-based protocol over WebSocket

```typescript
interface SyncMessage {
  type: 'auth' | 'pull' | 'push' | 'ack' | 'error';
  agentId?: string;
  tenantId?: string;
  token?: string;
  vectorClock?: Record<string, number>;  // For distributed state
  data?: any[];
  error?: string;
  timestamp: number;
}
```

**Agent Lifecycle:**

```typescript
// 1. Authentication
ws.on('message', async (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === 'auth') {
    // Verify JWT token
    // Register in SQLite database
    this.connections.set(agentId, {
      ws, agentId, tenantId,
      connectedAt: Date.now(),
      vectorClock: {}
    });

    // Send ACK
    ws.send(JSON.stringify({ type: 'ack', timestamp: Date.now() }));
  }
});

// 2. Pull (agent requests updates)
case 'pull':
  const changes = await this.getChangesSince(tenantId, message.vectorClock);
  ws.send({ type: 'ack', data: changes, vectorClock: globalVectorClock });

// 3. Push (agent sends updates)
case 'push':
  // Store in SQLite + AgentDB
  db.prepare(`INSERT INTO episodes (...) VALUES (...)`).run();

  // Update global vector clock
  this.globalVectorClock[agentId] = Math.max(
    this.globalVectorClock[agentId] || 0,
    message.vectorClock[agentId]
  );

  // Broadcast to other agents in same tenant
  this.broadcastToTenant(tenantId, agentId, message);
```

**Key Patterns:**

1. **Pull-Push Sync:** Agents pull updates, then push their changes (similar to git)
2. **Vector Clocks:** Track distributed state without central locking
3. **Tenant Broadcasting:** Real-time updates to other agents in same tenant
4. **SQLite Backend:** Hub uses SQLite for metadata (not Redis)

### 2.2 Agent Client Implementation

**File:** `/agentic-flow/src/federation/FederationHubClient.ts`

```typescript
export class FederationHubClient {
  async connect(): Promise<void> {
    this.ws = new WebSocket(this.config.endpoint);

    this.ws.on('open', async () => {
      // Authenticate immediately
      await this.send({
        type: 'auth',
        agentId: this.config.agentId,
        tenantId: this.config.tenantId,
        token: this.config.token,
        vectorClock: this.vectorClock
      });

      // Wait for ACK with timeout
      const authTimeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 5000);
    });
  }

  async sync(db: AgentDB): Promise<void> {
    // Increment vector clock
    this.vectorClock[this.config.agentId]++;

    // PULL: Get updates from hub
    await this.send({
      type: 'pull',
      vectorClock: this.vectorClock
    });

    // PUSH: Send local changes
    const localChanges = await db.getChangesSince(this.lastSyncTime);
    await this.send({
      type: 'push',
      data: localChanges,
      vectorClock: this.vectorClock
    });
  }
}
```

**Completion Detection Pattern:**

Agents DON'T explicitly signal completion. Instead:

1. **Time-based:** Agents run for fixed duration (60s in test)
2. **Task completion:** Agent exits after finishing work
3. **WebSocket close:** Hub detects disconnection via `ws.on('close')`

```typescript
ws.on('close', () => {
  if (agentId) {
    this.connections.delete(agentId);
    logger.info('Agent disconnected', { agentId, tenantId });
  }
});
```

---

## 3. Process Spawning (NOT Docker-based)

### 3.1 Swarm Executor Pattern

**File:** `/examples/research-swarm/lib/swarm-executor.js`

**Critical Discovery:** They use **child_process.spawn()**, not Docker containers

```javascript
import { spawn } from 'child_process';

async function executeAgent(agent, verbose) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      SWARM_ROLE: agent.config.role,
      SWARM_MODE: 'true'
    };

    const child = spawn('node', [runnerPath, agent.agent, agent.task], {
      env,
      stdio: verbose ? 'inherit' : 'pipe'
    });

    let output = '';
    child.stdout.on('data', (data) => output += data.toString());

    child.on('close', (code) => {
      const jobId = output.match(/Job ID:\s+([a-f0-9-]+)/)?.[1];

      if (code === 0) {
        resolve({ success: true, jobId });
      } else {
        resolve({ success: false, exitCode: code });
      }
    });
  });
}
```

**Concurrency Control:**

```javascript
async function executeAgentGroup(agents, maxConcurrent, verbose) {
  const running = new Set();
  const results = [];

  for (const agent of agents) {
    // Wait if at max concurrency
    while (running.size >= maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const agentPromise = executeAgent(agent, verbose)
      .then(result => {
        results.push(result);
        running.delete(agentPromise);
      });

    running.add(agentPromise);
  }

  // Wait for all agents in group to complete
  await Promise.all([...running]);

  return results;
}
```

**Priority-Based Execution:**

```javascript
// Group agents by priority
const priorityGroups = groupByPriority(agents);
const priorities = Object.keys(priorityGroups).sort((a, b) => parseInt(a) - parseInt(b));

// Execute each priority group sequentially
for (const priority of priorities) {
  const groupAgents = priorityGroups[priority];
  const groupResults = await executeAgentGroup(groupAgents, maxConcurrent, verbose);
}
```

**Key Patterns:**

1. **Promise-based concurrency:** Use Set to track running processes
2. **Polling-based throttling:** Check running.size every 1s
3. **Exit code detection:** Parse stdout for job IDs, detect success via exit code
4. **Priority batching:** Sequential priority levels, parallel within level

---

## 4. QUIC Transport (Future Direction)

**File:** `/src/transport/quic.ts`

**Note:** QUIC is planned but not production-ready. Current implementation uses WebSocket as fallback.

```typescript
export class QuicTransport {
  async send(address: string, message: AgentMessage): Promise<void> {
    // Create QUIC message
    const quicMessage = createQuicMessage(
      message.id,
      message.type,
      Array.from(payloadBytes),
      message.metadata ?? null
    );

    // Send via WASM client
    await this.wasmClient.sendMessage(address, quicMessage);
  }

  async receive(address: string): Promise<AgentMessage> {
    const quicMessage = await this.wasmClient.recvMessage(address);
    return parseMessage(quicMessage);
  }
}
```

**Features:**
- 0-RTT connection establishment (50-70% faster than TCP)
- Stream multiplexing (no head-of-line blocking)
- Built-in TLS 1.3 encryption
- Connection pooling

**Implementation Status:** Rust/WASM module required, WebSocket used as fallback

---

## 5. Health Monitoring & Recovery

### 5.1 Health Check Implementation

**File:** `/agentic-flow/src/health.ts`

```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    api: { status: 'pass' | 'fail'; message?: string };
    memory: { status: 'pass' | 'warn' | 'fail'; usage: number; limit: number };
    quic?: { status: 'pass' | 'warn' | 'fail'; enabled: boolean; connections?: number };
  };
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const memUsage = process.memoryUsage();
  const memLimit = 512 * 1024 * 1024; // 512MB
  const memPercent = (memUsage.heapUsed / memLimit) * 100;

  const checks = {
    memory: {
      status: memPercent > 90 ? 'fail' : memPercent > 75 ? 'warn' : 'pass',
      usage: Math.round(memUsage.heapUsed / 1024 / 1024),
      limit: Math.round(memLimit / 1024 / 1024)
    }
  };

  let overallStatus = 'healthy';
  if (checks.memory.status === 'fail') {
    overallStatus = 'unhealthy';
  } else if (checks.memory.status === 'warn') {
    overallStatus = 'degraded';
  }

  return { status: overallStatus, checks, ... };
}
```

**Docker Health Check:**

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8443/health"]
  interval: 5s
  timeout: 3s
  retries: 3
```

**HTTP Endpoint:**

```typescript
export function startHealthServer(port: number = 8080): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      const health = await getHealthStatus();
      const statusCode = health.status === 'healthy' ? 200 : 503;

      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
    }
  });

  return server;
}
```

### 5.2 Container Recovery (Implicit)

**No explicit recovery mechanism** - relies on:

1. Docker restart policies (`restart: unless-stopped`)
2. WebSocket reconnection (client-side)
3. Health checks detecting failures

**Missing:** Automatic agent restart on failure, stuck agent detection

---

## 6. Comparison to CFN Architecture

### 6.1 Similarities

| Feature | Agentic-Flow | CFN |
|---------|--------------|-----|
| Multi-agent coordination | WebSocket hub | Redis pub/sub |
| Agent spawning | child_process.spawn | CLI via bash |
| Completion detection | Exit code + stdout parsing | Redis signals + Docker status |
| Concurrency control | Promise Set + polling | Wave-based spawning |
| State persistence | SQLite + AgentDB | SQLite + Redis |
| Health monitoring | HTTP endpoints | Redis + Docker API |

### 6.2 Key Differences

| Aspect | Agentic-Flow | CFN |
|--------|--------------|-----|
| **Agent isolation** | Process-based (same container) | Container-based (Docker) |
| **Coordination layer** | WebSocket (centralized) | Redis (distributed) |
| **Completion protocol** | Exit code + websocket close | Redis signals + Docker status polling |
| **State sync** | Pull-push with vector clocks | Redis pub/sub + blocking waits |
| **Tenant isolation** | Environment variable | Redis key namespacing |
| **Recovery** | Restart policy only | Orchestrator monitors + restarts |
| **Scalability** | Single hub bottleneck | Distributed Redis cluster |

### 6.3 Architectural Tradeoffs

**Agentic-Flow Strengths:**
- Simpler architecture (centralized hub)
- Lower resource overhead (processes vs containers)
- Easier debugging (single log stream)
- Better for small-scale (<50 agents)

**Agentic-Flow Weaknesses:**
- No agent isolation (shared memory/filesystem)
- Single point of failure (hub)
- Limited scalability (WebSocket connections)
- No automatic recovery from stuck agents

**CFN Strengths:**
- Strong isolation (containers)
- Distributed coordination (Redis cluster)
- Automatic recovery (orchestrator monitors)
- Better for large-scale (100+ agents)

**CFN Weaknesses:**
- Higher complexity (3-tier architecture)
- Higher resource overhead (Docker)
- Harder debugging (distributed logs)
- Coordination deadlocks (Bug #4)

---

## 7. Applicable Patterns for CFN

### 7.1 WebSocket Hub for Coordination

**Problem:** Redis coordination deadlocks (Bug #4)

**Solution:** Add WebSocket hub alongside Redis for real-time updates

```typescript
// CFN Enhancement: Hybrid coordination
class CoordinationHub {
  private redis: RedisClient;
  private ws: WebSocketServer;

  async notifyAgentCompletion(agentId: string): Promise<void> {
    // Existing: Redis signal
    await this.redis.publish(`agent:${agentId}:complete`, '1');

    // New: WebSocket broadcast (non-blocking)
    this.ws.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'agent-complete',
          agentId,
          timestamp: Date.now()
        }));
      }
    });
  }
}
```

**Benefits:**
- Non-blocking notifications (no BLPOP deadlock)
- Real-time progress updates for monitoring
- Fallback if Redis connection fails

### 7.2 Child Process Spawning Pattern

**Problem:** Docker container overhead for short-lived agents

**Solution:** Use child_process.spawn for lightweight tasks

```javascript
// CFN Enhancement: Hybrid spawning
async function spawnAgent(config) {
  if (config.isolation === 'strict') {
    // Use Docker (current CFN approach)
    return spawnDockerContainer(config);
  } else {
    // Use process (agentic-flow approach)
    return spawnProcess(config);
  }
}

function spawnProcess(config) {
  return new Promise((resolve) => {
    const child = spawn('node', [
      '.claude/skills/cfn-agent-spawning/execute-agent.js',
      config.agentType,
      config.taskId
    ], {
      env: { ...process.env, ...config.env },
      stdio: 'pipe'
    });

    let output = '';
    child.stdout.on('data', (data) => output += data.toString());

    child.on('close', (code) => {
      const confidence = parseFloat(output.match(/Confidence: ([\d.]+)/)?.[1] || '0');
      resolve({ success: code === 0, confidence, output });
    });
  });
}
```

**Use Cases:**
- Loop 2 validators (no need for isolation)
- Product owner decisions (short-lived)
- Test execution (already isolated in test runner)

### 7.3 Priority-Based Batching

**Problem:** All agents spawn simultaneously, exceeding memory budget

**Solution:** Adopt agentic-flow's priority grouping

```javascript
// CFN Enhancement: Priority groups
async function executeWave(batches, memoryBudget) {
  // Group by priority
  const priorityGroups = batches.reduce((groups, batch) => {
    const priority = batch.priority || 1;
    groups[priority] = groups[priority] || [];
    groups[priority].push(batch);
    return groups;
  }, {});

  // Execute priority levels sequentially
  for (const priority of Object.keys(priorityGroups).sort()) {
    const group = priorityGroups[priority];

    // Spawn agents in group concurrently (within memory budget)
    const wave = [];
    let waveMemory = 0;

    for (const batch of group) {
      const batchMemory = parseMemory(batch.memory);
      if (waveMemory + batchMemory <= memoryBudget) {
        wave.push(batch);
        waveMemory += batchMemory;
      } else {
        // Start new wave
        await Promise.all(wave.map(spawnAgent));
        await waitForWaveCompletion(wave);
        wave = [batch];
        waveMemory = batchMemory;
      }
    }

    // Spawn final wave
    if (wave.length > 0) {
      await Promise.all(wave.map(spawnAgent));
      await waitForWaveCompletion(wave);
    }
  }
}
```

**Benefits:**
- Critical agents (Loop 3 implementers) run first
- Memory budget respected per priority level
- Better failure isolation (high priority fails fast)

### 7.4 Vector Clock State Management

**Problem:** Redis pub/sub loses messages if agents aren't subscribed yet

**Solution:** Use vector clocks to track agent state

```typescript
// CFN Enhancement: Vector clocks for state sync
interface AgentVectorClock {
  [agentId: string]: number;  // Logical timestamp
}

class CoordinationState {
  private vectorClock: AgentVectorClock = {};

  async recordEvent(agentId: string, event: string): Promise<void> {
    // Increment vector clock
    this.vectorClock[agentId] = (this.vectorClock[agentId] || 0) + 1;

    // Store in Redis with clock
    await this.redis.hset(`state:${taskId}`, {
      [`${agentId}:${event}`]: JSON.stringify({
        clock: this.vectorClock,
        timestamp: Date.now()
      })
    });
  }

  async getEventsSince(clock: AgentVectorClock): Promise<any[]> {
    // Get all events from Redis
    const state = await this.redis.hgetall(`state:${taskId}`);

    // Filter events newer than given clock
    return Object.entries(state)
      .filter(([key, value]) => {
        const event = JSON.parse(value);
        const [agentId] = key.split(':');
        return event.clock[agentId] > (clock[agentId] || 0);
      })
      .map(([key, value]) => JSON.parse(value));
  }
}
```

**Benefits:**
- No lost messages (state persisted)
- Agents can catch up after reconnect
- Distributed state without locking

### 7.5 Health Check Endpoints

**Problem:** No visibility into agent health during execution

**Solution:** Add HTTP health endpoints to agents

```javascript
// CFN Enhancement: Agent health endpoints
class AgentHealthServer {
  constructor(agentId, port) {
    this.server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          agentId,
          status: this.getStatus(),
          progress: this.getProgress(),
          memory: process.memoryUsage(),
          uptime: process.uptime()
        }));
      }
    });

    this.server.listen(port);
  }

  getStatus() {
    // Return current agent status
    return 'working' | 'waiting' | 'complete' | 'error';
  }

  getProgress() {
    // Return progress percentage
    return 0.75; // 75% complete
  }
}

// In agent initialization
const health = new AgentHealthServer(process.env.AGENT_ID, 8080);
```

**Orchestrator Enhancement:**

```javascript
// Poll agent health instead of waiting for Redis signals
async function waitForWaveCompletion(wave) {
  const interval = setInterval(async () => {
    for (const agent of wave) {
      try {
        const health = await fetch(`http://${agent.containerName}:8080/health`);
        const status = await health.json();

        if (status.status === 'complete') {
          // Mark agent as done
        } else if (status.status === 'error') {
          // Handle error
        }
      } catch (error) {
        // Container may be down, check Docker status
      }
    }
  }, 2000);
}
```

**Benefits:**
- Real-time progress monitoring
- Detect stuck agents (no progress updates)
- Memory leak detection (memory usage trending up)
- No dependency on Redis coordination

---

## 8. Recommendations for CFN

### 8.1 Short-Term Fixes (Bug #4)

1. **Replace Redis queue with Docker API polling** (as documented in Bug #4)
   - Remove `rPush('task:queue')` operations
   - Use `docker.listContainers()` to poll status
   - Check exit codes for completion

2. **Add health check endpoints to agents**
   - Agents expose `/health` endpoint
   - Orchestrator polls every 2s for status
   - Timeout stuck agents after 30min

3. **Implement vector clocks for state sync**
   - Track agent events with logical timestamps
   - Allow agents to catch up after restart
   - No reliance on Redis pub/sub ordering

### 8.2 Medium-Term Enhancements (Q1 2026)

1. **Hybrid spawning strategy**
   - Docker for Loop 3 implementers (strong isolation)
   - Child processes for Loop 2 validators (lightweight)
   - Environment variable: `CFN_SPAWN_MODE=docker|process|hybrid`

2. **WebSocket coordination hub**
   - Add WebSocket server alongside Redis
   - Real-time progress updates to Main Chat
   - Non-blocking notifications (no BLPOP)

3. **Priority-based wave spawning**
   - Assign priorities to agent types (Loop 3 = P1, Loop 2 = P2)
   - Execute priority groups sequentially
   - Better memory budget management

### 8.3 Long-Term Vision (Q2 2026)

1. **QUIC transport layer**
   - Evaluate agentic-flow's Rust/WASM QUIC module
   - 50-70% faster than WebSocket
   - Built-in TLS 1.3 encryption

2. **Distributed hub architecture**
   - Replace single Redis with hub cluster
   - Load balancing across hubs
   - Tenant-based sharding

3. **Agent marketplace**
   - Agents discover each other via hub
   - Capability-based matching
   - Dynamic swarm composition

---

## 9. File References

### Docker Files
- `/agentic-flow/docker/federation-test/docker-compose.yml` - Federation hub setup
- `/agentic-flow/docker/federation-test/Dockerfile.hub` - Hub container
- `/agentic-flow/docker/federation-test/Dockerfile.agent` - Agent container
- `/agentic-flow/docker/docker-compose.yml` - Production deployment

### Coordination
- `/agentic-flow/src/federation/FederationHubServer.ts` - WebSocket hub implementation
- `/agentic-flow/src/federation/FederationHubClient.ts` - Agent client
- `/agentic-flow/docker/federation-test/run-hub.ts` - Hub runner
- `/agentic-flow/docker/federation-test/run-agent.ts` - Agent runner

### Process Spawning
- `/examples/research-swarm/lib/swarm-executor.js` - Swarm execution with child_process.spawn
- `/agentic-flow/src/examples/parallel-swarm-deployment.ts` - Parallel spawning examples

### Health & Monitoring
- `/agentic-flow/src/health.ts` - Health check implementation
- `/agentic-flow/src/transport/quic.ts` - QUIC transport layer

---

## 10. Confidence Assessment

**Analysis Confidence:** 0.92

**High Confidence (0.95+):**
- WebSocket hub pattern (well-documented, production code)
- Child process spawning (multiple examples, clear patterns)
- Docker networking (standard Docker Compose patterns)
- Health check implementation (complete code)

**Medium Confidence (0.85-0.94):**
- Vector clock implementation (partial code, inferred usage)
- QUIC transport (planned feature, not production-ready)
- Recovery mechanisms (implicit, no explicit code)

**Low Confidence (<0.85):**
- Large-scale performance (no production metrics available)
- Multi-tenant security (code present, no penetration testing)

**Sources:**
- Direct code analysis from cloned repository
- Docker Compose files and Dockerfiles
- TypeScript implementation files
- JavaScript examples and tests

---

## Conclusion

Agentic-flow's architecture prioritizes **simplicity and developer experience** over strict isolation and scalability. Their WebSocket hub pattern is elegant but creates a single point of failure. Their child process spawning is lightweight but lacks isolation.

**For CFN:** Adopt their health check patterns and priority-based batching, but keep Docker-based spawning for strong isolation. Consider hybrid coordination (Redis + WebSocket) to eliminate deadlocks while maintaining distributed capability.

**Next Steps:**
1. Implement Bug #4 fix (Docker API polling for completion)
2. Add health check endpoints to agents
3. Test hybrid spawning (Docker vs process) for performance comparison
4. Evaluate WebSocket hub as Redis fallback

---

**Generated:** 2025-11-21
**Analyst:** docker-specialist (claude-sonnet-4-5)
**Repository:** https://github.com/ruvnet/agentic-flow (commit: latest)
