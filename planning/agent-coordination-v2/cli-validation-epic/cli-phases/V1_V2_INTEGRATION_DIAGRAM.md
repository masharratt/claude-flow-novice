# V1/V2 Integration Architecture Diagram

**Visual representation of V1/V2 toggle architecture and data flow**

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Claude Flow Novice CLI                           │
│                         src/cli/index.ts                                │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               │ Initialize coordinator
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   CoordinatorFactory.create(config)                     │
│               src/coordination/v2/integration/                          │
│                   coordinator-factory.ts                                │
└──────┬──────────────────────────────────────────────────────────────────┘
       │
       │ Version Detection
       ├─────────────────────┐
       │                     │
       ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ ENV Check    │      │ Config Check │
│ COORDINATION │      │ version: v1  │
│ _VERSION=v2  │      │ version: v2  │
└──────┬───────┘      └──────┬───────┘
       │                     │
       └─────────┬───────────┘
                 │
                 ▼
       ┌─────────────────┐
       │ Version: v1|v2? │
       └────┬────────┬───┘
            │        │
    ┌───────┘        └────────┐
    ▼                         ▼
┌─────────────┐         ┌─────────────┐
│   V1 Path   │         │   V2 Path   │
│ TypeScript  │         │    Bash     │
│ Coordinator │         │ Coordinator │
└─────────────┘         └─────────────┘
```

---

## V1 Coordination Flow (TypeScript)

```
┌──────────────────────────────────────────────────────────────┐
│                      V1 TypeScript Path                      │
└──────────────────────────────────────────────────────────────┘

┌───────────────────┐
│ SwarmCoordinator  │ ← EventEmitter-based
│   (V1 Class)      │
└─────────┬─────────┘
          │
          ├─> MemoryManager     (SQLite backend)
          ├─> SwarmMonitor      (Metrics collection)
          ├─> AdvancedScheduler (Task scheduling)
          └─> EventBus          (Cross-component messaging)
          │
          ▼
    ┌──────────────┐
    │ Task Execution│
    │  (Simulated)  │ ← No real Task tool integration
    └──────────────┘
          │
          ▼
    ┌──────────────┐
    │  In-Memory   │
    │   Results    │ ← TypeScript objects
    └──────────────┘
```

**V1 Characteristics**:
- Proven TypeScript implementation
- Event-driven architecture
- Memory manager for state persistence
- Not validated for 500+ agents
- Higher complexity

---

## V2 Coordination Flow (Bash CLI)

```
┌──────────────────────────────────────────────────────────────┐
│                       V2 Bash Path                           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────┐
│ BashCoordinator  │ ← TypeScript wrapper
│   (V2 Class)     │
└────────┬─────────┘
         │
         │ spawn()
         ▼
┌───────────────────┐
│ coordinator-cli.sh│ ← Bash process
│   (Bash Script)   │
└────────┬──────────┘
         │
         ├─> /dev/shm/cfn/      (File-based IPC)
         │   ├─ messages/       (Incoming commands)
         │   ├─ responses/      (Agent responses)
         │   ├─ status.json     (Swarm state)
         │   └─ health.json     (Health check)
         │
         ├─> message-bus.sh     (IPC handler)
         │
         ├─> topology-*.sh      (Flat or Hybrid)
         │   ├─ Flat: 2-300 agents (single coordinator)
         │   └─ Hybrid: 300-1000+ (multi-coordinator mesh)
         │
         └─> Task Tool Integration
             │
             ▼
       ┌──────────────┐
       │ Real Claude  │
       │ Code Agents  │ ← Spawned via Task tool
       └──────────────┘
             │
             ▼
       ┌──────────────┐
       │ Responses →  │
       │ /dev/shm/    │ ← File-based results
       └──────────────┘
             │
             ▼
       ┌──────────────┐
       │ TypeScript   │
       │ Collector    │ ← Reads response files
       └──────────────┘
```

**V2 Characteristics**:
- Proven bash coordination (708 agents, 97.8% delivery)
- Zero TypeScript dependencies
- File-based IPC via /dev/shm
- Real Task tool integration
- Lower complexity

---

## Message Flow: TypeScript ↔ Bash

### 1. Objective Creation (TypeScript → Bash)

```
TypeScript (BashCoordinator)
  │
  │ coordinator.createObjective(description, strategy)
  │
  ▼
┌─────────────────────────────────────────────┐
│ writeMessage({                              │
│   type: 'OBJECTIVE_CREATE',                 │
│   objectiveId: 'objective-1234',            │
│   description: 'Build feature X',           │
│   strategy: 'auto'                          │
│ })                                          │
└──────────────┬──────────────────────────────┘
               │
               │ Write JSON file
               ▼
/dev/shm/cfn/messages/1234567890-abc123.json
               │
               │ Bash polls for new files
               ▼
Bash (coordinator-cli.sh)
  │
  │ Reads message file
  │ Parses JSON
  │ Creates internal objective
  │
  ▼
Objective registered in bash state
```

### 2. Objective Execution (Bash → Task Tool)

```
Bash (coordinator-cli.sh)
  │
  │ OBJECTIVE_EXECUTE received
  │
  ▼
┌─────────────────────────────────────────────┐
│ topology-hybrid.sh                          │
│   │                                         │
│   ├─> Spawn 10 coordinators (mesh)         │
│   │   ├─> coordinator-1 spawns 50 workers  │
│   │   ├─> coordinator-2 spawns 50 workers  │
│   │   └─> ...                               │
│   │                                         │
│   └─> Each worker via Task tool:           │
│       bash agent-wrapper.sh <agent_id>      │
└──────────────┬──────────────────────────────┘
               │
               │ Task tool spawns
               ▼
┌─────────────────────────────────────────────┐
│ Claude Code Agent (Real Process)            │
│   │                                         │
│   ├─> Executes task (code gen, test, etc.) │
│   └─> Writes result to:                    │
│       /dev/shm/cfn/responses/<agent_id>.json│
└─────────────────────────────────────────────┘
```

### 3. Result Collection (Bash → TypeScript)

```
Bash (completion-detector.sh)
  │
  │ Polls /dev/shm/cfn/responses/
  │ Count = expected agent count?
  │
  ▼
All agents completed
  │
  │ Writes status
  ▼
/dev/shm/cfn/status.json
{
  "objectiveId": "objective-1234",
  "status": "completed",
  "agents": { "total": 500, "completed": 489, "failed": 11 },
  "deliveryRate": 97.8,
  "coordinationTime": 20000
}
  │
  │ TypeScript polls this file
  ▼
TypeScript (BashCoordinator.getSwarmStatus())
  │
  │ Reads /dev/shm/cfn/status.json
  │ Parses JSON
  │
  ▼
Returns SwarmStatus object to caller
```

---

## Fallback Mechanism Flow

### Scenario: V2 Initialization Fails

```
┌──────────────────────────────────────────────────────────────┐
│ Step 1: User requests V2                                     │
└──────────────────────────────────────────────────────────────┘

COORDINATION_VERSION=v2 npm run dev
         │
         ▼
CoordinatorFactory.create({ version: 'v2' })
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 2: Attempt V2 initialization                            │
└──────────────────────────────────────────────────────────────┘

BashCoordinator.initialize(config)
  │
  ├─> spawn('bash', ['coordinator-cli.sh', 'start'])
  │   └─> Process spawns but...
  │
  ├─> Check /dev/shm availability
  │   └─> ❌ /dev/shm not mounted
  │
  └─> Timeout after 5s
      │
      ▼
  Throw Error('V2 initialization failed: /dev/shm not accessible')

┌──────────────────────────────────────────────────────────────┐
│ Step 3: Automatic fallback to V1                             │
└──────────────────────────────────────────────────────────────┘

CoordinatorFactory catches error
  │
  │ config.fallbackEnabled === true
  │
  ├─> logger.warn('V2 failed, falling back to V1')
  │
  ├─> EventBus.emit('coordination:fallback', {
  │     from: 'v2',
  │     to: 'v1',
  │     reason: '/dev/shm not accessible',
  │     timestamp: Date.now()
  │   })
  │
  └─> SwarmCoordinator.create(config) ← V1 TypeScript
      │
      ▼
  V1 coordinator starts successfully
      │
      ▼
  User sees: "⚠️  V2 unavailable, using V1 fallback"
      │
      ▼
  Swarm continues with V1 coordination (degraded capacity)
```

**Fallback Time**: <5 seconds (initialization timeout)
**User Impact**: Transparent - swarm continues with V1
**Monitoring**: Fallback event logged and emitted for alerting

---

## Gradual Rollout Strategy

### Phase 1: 0% V2 (All V1)

```
100 requests
  │
  ├─> V1: 100 requests (100%)
  └─> V2: 0 requests (0%)

Config: { rolloutPercentage: 0 }
Status: Baseline - all traffic on V1
```

### Phase 2: 10% V2 (Canary)

```
100 requests
  │
  ├─> V1: 90 requests (90%)
  └─> V2: 10 requests (10%) ← Canary traffic
      │
      ├─> Success: 9 requests (90% of V2)
      └─> Fallback to V1: 1 request (10% fallback rate)

Config: { rolloutPercentage: 10 }
Status: Monitoring V2 stability
Action: If fallback rate <5%, increase to 50%
```

### Phase 3: 50% V2 (Balanced)

```
100 requests
  │
  ├─> V1: 50 requests (50%)
  └─> V2: 50 requests (50%)
      │
      ├─> Success: 48 requests (96% of V2)
      └─> Fallback to V1: 2 requests (4% fallback rate)

Config: { rolloutPercentage: 50 }
Status: V2 stable, validating at scale
Action: If fallback rate <3%, increase to 100%
```

### Phase 4: 100% V2 (Full Rollout)

```
100 requests
  │
  ├─> V1: 0 requests (0%) ← Deprecated
  └─> V2: 100 requests (100%)
      │
      ├─> Success: 99 requests (99% of V2)
      └─> Fallback to V1: 1 request (1% fallback rate)

Config: { rolloutPercentage: 100 }
Status: V2 production, V1 safety net
Action: After 1 month stable, remove V1 code
```

---

## Resource Isolation

### V1 Resources (TypeScript)

```
┌─────────────────────────────────────────┐
│ V1 Resource Namespace                   │
├─────────────────────────────────────────┤
│ Memory:                                 │
│   ├─ TypeScript heap (~50MB)           │
│   ├─ MemoryManager SQLite DB           │
│   └─ EventEmitter subscriptions        │
│                                         │
│ Processes:                              │
│   ├─ Node.js main process              │
│   └─ Background worker timers           │
│                                         │
│ Files:                                  │
│   ├─ .claude-flow/memory.sqlite        │
│   └─ .claude-flow/metrics.json         │
└─────────────────────────────────────────┘
```

### V2 Resources (Bash)

```
┌─────────────────────────────────────────┐
│ V2 Resource Namespace                   │
├─────────────────────────────────────────┤
│ Memory:                                 │
│   ├─ /dev/shm/cfn/ tmpfs (~50MB)       │
│   └─ Bash process heap (~20MB)         │
│                                         │
│ Processes:                              │
│   ├─ coordinator-cli.sh (bash)         │
│   ├─ 10 coordinator-*.sh (mesh)        │
│   └─ 500 agent processes (Task tool)   │
│                                         │
│ Files:                                  │
│   ├─ /dev/shm/cfn/messages/*.json      │
│   ├─ /dev/shm/cfn/responses/*.json     │
│   └─ /dev/shm/cfn/status.json          │
└─────────────────────────────────────────┘
```

**No Conflicts**: V1 and V2 use separate namespaces
**Cleanup**: V2 cleans /dev/shm/cfn/ on shutdown
**Safety**: V1 unaffected if V2 crashes

---

## Performance Comparison

### Coordination Time (500 Agents)

```
┌─────────────────────────────────────────┐
│ V1 TypeScript (Not Validated)          │
├─────────────────────────────────────────┤
│ Agent Spawning:   Unknown (simulated)  │
│ Coordination:     Unknown               │
│ Total:            ~Unknown~             │
│ Proven Scale:     <10 agents           │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ V2 Bash (Proven at 708 agents)         │
├─────────────────────────────────────────┤
│ Agent Spawning:   ~10s (parallel)      │
│ Coordination:     ~15-25s (hybrid)     │
│ Total:            ~25-35s               │
│ Proven Scale:     708 agents (97.8%)   │
└─────────────────────────────────────────┘
```

### Message Latency

```
┌─────────────────────────────────────────┐
│ V1: EventEmitter (in-process)          │
├─────────────────────────────────────────┤
│ Single message:   <1ms                 │
│ Method:           Event-driven          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ V2: File-based IPC (/dev/shm)          │
├─────────────────────────────────────────┤
│ Single message:   ~5-10ms              │
│ Method:           File polling          │
└─────────────────────────────────────────┘
```

**Tradeoff**: V2 slightly slower per message, but proven at scale

---

## Implementation Checklist

### Week 1-2: V1/V2 Infrastructure

- [ ] Create `src/coordination/v2/` directory structure
- [ ] Implement `version-detector.ts` with environment checks
- [ ] Implement `coordinator-factory.ts` with V1/V2 selection
- [ ] Implement `coordinator-interface.ts` (ICoordinator)
- [ ] Implement `bash-coordinator.ts` wrapper (stub)
- [ ] Add `v2-config.json` with defaults
- [ ] Write unit tests for version detection
- [ ] Write integration tests for V1/V2 toggle
- [ ] Write fallback tests (simulated V2 failure)

### Week 3-4: Bash Coordination Scripts

- [ ] Port MVP scripts to `src/coordination/v2/cli/`
- [ ] Implement `coordinator-cli.sh` (start/stop/status)
- [ ] Implement `message-bus.sh` (file-based IPC)
- [ ] Implement `agent-wrapper.sh` (Task tool bridge)
- [ ] Implement `completion-detector.sh` (swarm completion)
- [ ] Implement `topology-flat.sh` (2-300 agents)
- [ ] Implement `topology-hybrid.sh` (300-1000+ agents)
- [ ] Implement `health-monitor.sh` (process checks)
- [ ] Write bash unit tests (bats framework)

### Week 5: Integration & Validation

- [ ] Complete `BashCoordinator` implementation
- [ ] Implement TypeScript → Bash message bridge
- [ ] Implement Bash → TypeScript result collector
- [ ] Run E2E tests with 50 agents (flat topology)
- [ ] Run E2E tests with 500 agents (hybrid topology)
- [ ] Validate fallback mechanism (kill coordinator)
- [ ] Performance benchmarks (V1 vs V2)
- [ ] Fix bugs and edge cases

### Week 6-8: Production Rollout

- [ ] Deploy with `V2_ROLLOUT_PERCENTAGE=0` (100% V1)
- [ ] Monitor V1 baseline metrics (1 week)
- [ ] Increase to `V2_ROLLOUT_PERCENTAGE=10` (canary)
- [ ] Monitor fallback rate and coordination time (1 week)
- [ ] Increase to `V2_ROLLOUT_PERCENTAGE=50` (balanced)
- [ ] Monitor at scale (1 week)
- [ ] Increase to `V2_ROLLOUT_PERCENTAGE=100` (full V2)
- [ ] Monitor for 1 month before removing V1 code

---

## Success Metrics

### Day 1 Toggle

- [ ] `COORDINATION_VERSION=v1|v2` environment variable works
- [ ] Automatic fallback V2→V1 within <5s
- [ ] V1 and V2 resource isolation verified
- [ ] <100ms version detection overhead

### Gradual Rollout

- [ ] `V2_ROLLOUT_PERCENTAGE=10` routes 8-12% to V2
- [ ] Fallback rate <5% during canary phase
- [ ] Monitoring alerts on fallback spikes

### Performance

- [ ] V2 coordination time <30s for 500 agents
- [ ] V2 delivery rate ≥95% for hybrid topology
- [ ] V2 throughput >30 agents/sec

### Stability

- [ ] V2 stable for 24+ hours (no crashes)
- [ ] V1 fallback tested and validated
- [ ] Zero V1/V2 resource leaks

---

**Document Version**: 1.0
**Date**: 2025-10-06
**Related**: V1_V2_TOGGLE_ARCHITECTURE.md
