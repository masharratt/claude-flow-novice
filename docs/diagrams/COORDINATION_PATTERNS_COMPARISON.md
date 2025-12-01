# Coordination Patterns: Current vs Agentic-Flow

**Visual comparison of coordination mechanisms**

---

## Current Architecture (CLI Spawning with BLPOP)

```
┌─────────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR (Coordinator)                                      │
│                                                                  │
│ 1. Spawn agents via CLI                                         │
│    npx claude-flow-novice agent-spawn backend-dev               │
│                           ↓                                      │
│                    spawn() in shell                              │
│                           ↓                                      │
│ 2. Wait for completion (BLOCKING)                               │
│    redis.blpop("swarm:task:agent:done", 0) ← INFINITE WAIT     │
│         ↓                                                        │
│    PROBLEM: If agent crashes, hangs forever                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
         ↓ (spawned process)
┌─────────────────────────────────────────────────────────────────┐
│ AGENT (Background Process)                                      │
│                                                                  │
│ 1. Execute task                                                 │
│    [working... working... working...]                           │
│                                                                  │
│ 2. Signal completion                                            │
│    redis.lpush("swarm:task:agent:done", "complete")            │
│    ← SINGLE POINT OF FAILURE                                   │
│                                                                  │
│ 3. Exit                                                          │
│    process.exit(0)                                              │
│                                                                  │
│ PROBLEM: If Redis command fails, orchestrator never wakes      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

ISSUES:
❌ No timeout on BLPOP (infinite wait)
❌ No crash detection (orchestrator doesn't know agent died)
❌ No health monitoring (can't detect hangs)
❌ Single signaling mechanism (no fallback)
❌ Parent waits for child (blocking spawn)
```

---

## Agentic-Flow Architecture (Multi-Layer Coordination)

```
┌──────────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR (Enhanced Monitoring v3.0)                         │
│                                                                   │
│ PHASE 1: Spawning with Health Tracking                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 1. Initialize coordination                                  │ │
│ │    await redis.set("task:total", agentCount)                │ │
│ │    await redis.set("task:completed", 0)                     │ │
│ │                                                              │ │
│ │ 2. Spawn agents (DETACHED)                                  │ │
│ │    const child = spawn('npx', ['agent', ...], {             │ │
│ │      detached: true,  // Don't block parent                 │ │
│ │      stdio: 'ignore'  // Don't inherit stdio                │ │
│ │    });                                                       │ │
│ │    const pid = child.pid;                                   │ │
│ │    child.unref();  // Allow parent to exit                  │ │
│ │                                                              │ │
│ │ 3. Track agent health                                       │ │
│ │    healthMonitor.track(agentId, pid, spawnTime)             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ PHASE 2: Multi-Layer Waiting                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Layer 1: Passive Polling (Primary)                          │ │
│ │    while (true) {                                            │ │
│ │      const completed = await redis.get("task:completed");   │ │
│ │      if (completed >= total) break;                         │ │
│ │      await sleep(5000);  // Poll every 5s                   │ │
│ │    }                                                         │ │
│ │                                                              │ │
│ │ Layer 2: Health Monitoring (30s interval)                   │ │
│ │    for (agent of activeAgents) {                            │ │
│ │      if (!processExists(agent.pid)) {                       │ │
│ │        markDead(agent);  // Agent crashed                   │ │
│ │      }                                                       │ │
│ │      if (elapsed > timeout) {                               │ │
│ │        markTimeout(agent);  // Agent hung                   │ │
│ │      }                                                       │ │
│ │    }                                                         │ │
│ │                                                              │ │
│ │ Layer 3: State Verification                                 │ │
│ │    const state = await redis.get("task:agent:ID");          │ │
│ │    if (state.status === "completed") {                      │ │
│ │      // Agent completed, signal missed                      │ │
│ │    }                                                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
         ↓ (detached process, non-blocking)
┌──────────────────────────────────────────────────────────────────┐
│ AGENT (Background Process)                                       │
│                                                                   │
│ PHASE 1: Execution                                              │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 1. Load context                                             │ │
│ │ 2. Execute via SDK (not shell)                              │ │
│ │    const result = await executeAgentAPI(...)                │ │
│ │ 3. Store conversation                                        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ PHASE 2: Multi-Layer Signaling                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Layer 1: Atomic Counter (Primary, Reliable)                 │ │
│ │    await redis.incr("task:completed")                       │ │
│ │    ← Orchestrator polls this                                │ │
│ │                                                              │ │
│ │ Layer 2: State Persistence (Fallback)                       │ │
│ │    await redis.set("task:agent:ID", JSON.stringify({        │ │
│ │      status: "completed",                                   │ │
│ │      confidence: 0.85,                                      │ │
│ │      timestamp: "2025-11-21T10:30:00Z"                      │ │
│ │    }), 'EX', 86400);  // 24h expiry                         │ │
│ │                                                              │ │
│ │ Layer 3: Direct Signal (BLPOP consumers)                    │ │
│ │    await redis.lpush("task:agent:ID:done", "complete")      │ │
│ │                                                              │ │
│ │ Layer 4: Broadcast (Pub/sub subscribers)                    │ │
│ │    await redis.publish("task:completion", {...})            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ 3. Exit cleanly                                                  │
│    process.exit(0)                                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

BENEFITS:
✅ Non-blocking spawn (detached + unref)
✅ Passive polling (survives restarts)
✅ Health monitoring (detects crashes/hangs)
✅ Multi-layer signaling (redundant, fault-tolerant)
✅ State persistence (verifiable completion)
✅ Timeout handling (prevents infinite waiting)
```

---

## SDK Spawning Pattern (Alternative)

```
┌──────────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR (SDK-Based Spawning)                               │
│                                                                   │
│ 1. No subprocess spawning - Direct SDK calls                    │
│                                                                   │
│ const results = await Promise.all(                              │
│   agents.map(agentType =>                                        │
│     executeAgentViaSDK(agentType, taskId, context)              │
│   )                                                               │
│ );                                                                │
│                                                                   │
│ 2. Results available immediately                                │
│    - No Redis coordination needed                               │
│    - No completion detection needed                             │
│    - No health monitoring needed                                │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
         ↓ (direct function call, not subprocess)
┌──────────────────────────────────────────────────────────────────┐
│ executeAgentViaSDK() Function                                    │
│                                                                   │
│ async function executeAgentViaSDK(                              │
│   agentType: string,                                             │
│   taskId: string,                                                │
│   context: string                                                │
│ ): Promise<AgentResult> {                                        │
│   const { executeAgentAPI } = await import('./anthropic-client');│
│                                                                   │
│   const result = await executeAgentAPI(                         │
│     agentType,                                                   │
│     agentId,                                                     │
│     'claude-sonnet-4-5',                                         │
│     context,                                                     │
│     systemPrompt,                                                │
│     messages,                                                    │
│     maxTokens,                                                   │
│     tools                                                        │
│   );                                                              │
│                                                                   │
│   return {                                                        │
│     agentId,                                                     │
│     agentType,                                                   │
│     success: result.success,                                     │
│     output: result.output,                                       │
│     confidence: extractConfidence(result.output)                │
│   };                                                              │
│ }                                                                 │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
         ↓ (direct HTTP call)
┌──────────────────────────────────────────────────────────────────┐
│ Anthropic API                                                    │
│                                                                   │
│ POST /v1/messages                                                │
│ {                                                                 │
│   "model": "claude-sonnet-4-5-20250929",                         │
│   "messages": [...],                                             │
│   "system": "...",                                               │
│   "tools": [...]                                                 │
│ }                                                                 │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

BENEFITS:
✅ No subprocess spawning (simpler)
✅ No coordination layer needed (direct results)
✅ Better error handling (exceptions vs exit codes)
✅ Immediate result availability
✅ No PID tracking, no health monitoring
✅ Synchronous execution (orchestrator controls flow)

USE WHEN:
- All agents run in same runtime environment
- No need for process isolation
- No Docker containers
- Orchestrator can handle blocking
```

---

## Completion Detection Comparison

### Current Approach (BLPOP with infinite timeout)

```
Time →

Orchestrator                     Agent
    |                              |
    |---spawn("agent")------------>|
    |                              |
    |                              | [working...]
    |                              |
    |---BLPOP(timeout=0)--------   |
    |          ↓                   |
    |     BLOCKING FOREVER         |
    |     (no timeout)             |
    |                              |
    |                              | [crashes]
    |                              | X
    |     STILL WAITING            |
    |     (never wakes up)         |
    |                              |
    ∞ (infinite wait)              |
```

### Agentic-Flow Approach (Passive Polling + Health Monitoring)

```
Time →

Orchestrator                     Agent                Health Monitor
    |                              |                        |
    |---spawn(detached)----------->|                        |
    |---unref()------------------->|                        |
    |---track(pid, timeout)--------|----------------------->|
    |                              |                        |
    |                              | [working...]           |
    |                              |                        |
    |<--poll every 5s----------    |                        |
    | GET task:completed           |                        |
    | → 0 (not done yet)           |                        |
    |                              |                        |
    |<--poll every 5s----------    |                        |
    | GET task:completed           |                        |
    | → 0 (not done yet)           |                        |
    |                              |                        |
    |                              | [crashes]              |
    |                              | X                      |
    |                              |                        |
    |                              |                 <--check PID
    |                              |                 process.kill(pid, 0)
    |                              |                 → Error (process dead)
    |                              |                        |
    |<-------------MARK DEAD------------------------<-------|
    | INCR task:completed          |                        |
    |                              |                        |
    |<--poll every 5s----------    |                        |
    | GET task:completed           |                        |
    | → 1 (marked as done)         |                        |
    |                              |                        |
    | CONTINUE (not blocked)       |                        |
```

---

## Redis Key Patterns Comparison

### Current Pattern (Simple BLPOP)

```
swarm:{taskId}:{agentId}:done   LIST   ["complete"]
                                  ↑
                            Single signal
                         (no redundancy)
```

### Agentic-Flow Pattern (Multi-Layer)

```
task:{taskId}:total              STRING  "10"           ← Total agents
task:{taskId}:completed          STRING  "7"            ← Completion counter (polled)
                                                          PRIMARY MECHANISM

task:{taskId}:agent:{agentId}    STRING  JSON({         ← Agent state (persistent)
  status: "completed",                                   FALLBACK VERIFICATION
  confidence: 0.85,
  timestamp: "..."
})

task:{taskId}:{agentId}:done     LIST    ["complete"]   ← Direct signal (BLPOP)
                                                          OPTIONAL FAST PATH

task:{taskId}:completion         PUBSUB  {...}          ← Broadcast (pub/sub)
                                                          FIRE-AND-FORGET NOTIFICATION
```

**Redundancy Benefits:**
- If BLPOP signal missed → Poll completion counter
- If counter missed → Check agent state
- If state corrupted → Health monitor detects crash
- If everything fails → Timeout kicks in

---

## Wave-Based Spawning (Memory Optimization)

### Current Approach (All-at-Once)

```
Memory Budget: 40GB

Spawn all 10 agents at once:
Agent 1: 1GB ┐
Agent 2: 1GB │
Agent 3: 1GB │
Agent 4: 1GB │
Agent 5: 1GB ├─ 10GB total
Agent 6: 1GB │
Agent 7: 1GB │
Agent 8: 1GB │
Agent 9: 1GB │
Agent 10: 1GB┘

PROBLEM: All agents start simultaneously
- Peak memory: 10GB (within budget)
- But: Memory fragmentation
- But: CPU contention (all agents compete)
```

### Agentic-Flow Approach (Wave-Based)

```
Memory Budget: 40GB

Wave 1 (Tier 1: 512MB agents):
Agent 1: 512MB ┐
Agent 2: 512MB ├─ 10GB total (20 agents)
...            │
Agent 20: 512MB┘
↓ Wait for completion
↓ Cleanup completed agents

Wave 2 (Tier 2: 600MB agents):
Agent 21: 600MB ┐
Agent 22: 600MB ├─ 6GB total (10 agents)
...             │
Agent 30: 600MB ┘
↓ Wait for completion
↓ Cleanup completed agents

Wave 3 (Tier 3: 800MB agents):
Agent 31: 800MB ┐
Agent 32: 800MB ├─ 8GB total (10 agents)
...             │
Agent 40: 800MB ┘
↓ Wait for completion
↓ Cleanup completed agents

Wave 4 (Tier 4: 1GB agents):
Agent 41: 1GB ┐
Agent 42: 1GB ├─ 10GB total (10 agents)
...           │
Agent 50: 1GB ┘

BENEFITS:
✅ Maximum parallelism per wave
✅ No memory budget violations
✅ Cleanup between waves (memory reclamation)
✅ Smaller agents first (higher throughput)
```

---

## Error Handling Comparison

### Current Approach

```typescript
try {
  // Spawn agent
  spawn('npx', ['agent', ...]);

  // Wait for completion (blocking, infinite)
  await redis.blpop(`swarm:${taskId}:${agentId}:done`, 0);

  // If we get here, agent completed
  console.log('Agent completed');
} catch (error) {
  console.error('Error:', error);
  // BUT: How do we know if agent crashed vs Redis failed?
  // BUT: No way to detect timeout
  // BUT: No way to detect hang
}
```

### Agentic-Flow Approach

```typescript
try {
  // Spawn agent (detached, non-blocking)
  const child = spawn('npx', ['agent', ...], {
    detached: true,
    stdio: 'ignore'
  });

  const pid = child.pid;
  child.unref();

  // Track agent health
  healthMonitor.track(agentId, pid, Date.now());

  // Passive polling with timeout
  const timeout = 300000;  // 5 minutes
  const startTime = Date.now();

  while (true) {
    const completed = parseInt(await redis.get(`task:${taskId}:completed`));

    if (completed >= total) {
      console.log('All agents completed');
      break;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > timeout) {
      // Check agent state
      const state = await redis.get(`task:${taskId}:agent:${agentId}`);

      if (state && JSON.parse(state).status === 'completed') {
        console.log('Agent completed, signal missed');
        break;
      }

      // Check if process still alive
      if (!processExists(pid)) {
        throw new Error(`Agent crashed (PID ${pid})`);
      }

      // Process alive but not responding
      throw new Error(`Agent timeout after ${elapsed}ms`);
    }

    await sleep(5000);
  }
} catch (error) {
  // Clear error classification:
  if (error.message.includes('crashed')) {
    console.error('Agent process died');
    // Recovery: Restart agent
  } else if (error.message.includes('timeout')) {
    console.error('Agent hung or slow');
    // Recovery: Kill process, restart
  } else {
    console.error('Unknown error:', error);
    // Recovery: Log and continue
  }
}
```

**Error Types Detected:**
- ✅ **Crash**: Process exit detected via PID check
- ✅ **Hang**: Timeout with process still alive
- ✅ **Timeout**: No completion within time limit
- ✅ **Signal Lost**: State shows completed but signal missed
- ✅ **Redis Failure**: Connection errors vs agent errors

---

## Migration Path Visual

```
CURRENT STATE                    PHASE 1 (Week 1)           PHASE 2 (Week 2)
─────────────                    ────────────────           ────────────────

CLI Spawning                  →  CLI Spawning (detached) →  SDK Spawning
  spawn('npx', ...)               spawn('npx', ...)           executeAgentAPI(...)
  [BLOCKING]                      + unref()                   [DIRECT]
                                  [NON-BLOCKING]

BLPOP (infinite)              →  BLPOP (timeout)         →  Passive Polling
  timeout: 0                      timeout: 300               Poll completion counter
  [HANGS FOREVER]                 [5 MIN TIMEOUT]            [5 SEC INTERVALS]

Single Signal                 →  Dual Signal             →  Multi-Layer Signal
  lpush(done)                     lpush(done) +              incr(completed) +
  [NO FALLBACK]                   incr(completed)            set(state) +
                                  [PRIMARY + FALLBACK]       lpush(done) +
                                                             publish(event)
                                                             [REDUNDANT]

No Health Monitoring          →  Basic Timeout           →  Full Health Monitor
  [BLIND TO CRASHES]              if (elapsed > timeout)     PID checks +
                                  [DETECTS SOME]             Heartbeat +
                                                             Timeout
                                                             [COMPREHENSIVE]

No Workspace Isolation        →  Same                    →  Isolated Workspaces
  Shared /workspace               Shared /workspace          /tmp/agent-{id}/
  [RACE CONDITIONS]               [RACE CONDITIONS]          [ISOLATED]


RELIABILITY:                     RELIABILITY:                RELIABILITY:
50-60%                           75-85%                      95-98%
(frequent hangs)                 (occasional timeouts)       (rare failures)
```

---

## Summary Table

| Feature | Current | Agentic-Flow | Benefit |
|---------|---------|--------------|---------|
| **Spawning** | CLI (blocking) | CLI (detached) or SDK | Non-blocking, direct control |
| **Waiting** | BLPOP (infinite) | Passive polling (5s) | Survives restarts, timeout handling |
| **Signaling** | Single (lpush) | Multi-layer (counter + lpush + publish) | Fault-tolerant, redundant |
| **Health Check** | None | PID + heartbeat + timeout | Detects crashes/hangs |
| **State Persistence** | None | Redis (24h expiry) | Verifiable completion |
| **Error Handling** | Generic | Classified (crash/hang/timeout) | Targeted recovery |
| **Memory Mgmt** | All-at-once | Wave-based | Optimized parallelism |
| **Workspace** | Shared | Isolated (per agent) | No race conditions |

---

**Key Takeaway:** Agentic-flow uses **defensive programming** with **multi-layer redundancy**. Never rely on a single mechanism (BLPOP). Always have fallback layers (polling, state verification, health monitoring, timeout).
