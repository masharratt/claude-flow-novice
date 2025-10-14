# Parallel CFN Loop Architecture

## Executive Summary

This architecture enables parallel execution of independent sprints in CFN Loop, reducing epic execution time by 50-70% while maintaining ≥0.90 consensus validation quality. The system uses Redis pub/sub (10K+ msg/sec) for coordination and implements critical safety mechanisms for test execution, memory management, and conflict resolution.

---

## System Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Epic Orchestrator                                │
│                    (Dependency Analysis + Launch)                        │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                ┌────────────┴──────────────┐
                │                           │
    ┌───────────▼──────────┐   ┌───────────▼──────────┐
    │  Meta-Coordinator 1  │   │  Meta-Coordinator 2  │
    │  (Independent Grp 1) │   │  (Independent Grp 2) │
    └───────────┬──────────┘   └───────────┬──────────┘
                │                           │
        ┌───────┼───────┐           ┌──────┼──────┐
        │       │       │           │      │      │
    ┌───▼──┐┌──▼──┐┌──▼──┐     ┌──▼──┐┌──▼──┐┌──▼──┐
    │Sprint││Sprint││Sprint│     │Sprint││Sprint││Sprint│
    │Coord1││Coord2││Coord3│     │Coord4││Coord5││Coord6│
    └───┬──┘└──┬──┘└──┬──┘     └──┬──┘└──┬──┘└──┬──┘
        │      │      │           │      │      │
        └──────┼──────┴───────────┼──────┴──────┘
               │                  │
    ┌──────────▼──────────────────▼───────────────┐
    │           Redis Coordination Layer          │
    │  - Pub/Sub (10K+ msg/sec)                   │
    │  - Test Locks                                │
    │  - Agent Registry                            │
    │  - Dependency Signals                        │
    └─────────────────────────────────────────────┘
```

---

## Core Components

### 1. Dependency Analyzer

**Purpose**: Parse epic configuration and build execution plan

**Input**: Epic JSON configuration
**Output**: Dependency graph with independent groups

```typescript
interface DependencyGraph {
  nodes: Sprint[];
  edges: Dependency[];
  independentGroups: SprintGroup[];
  criticalPath: Sprint[];
  estimatedDuration: {
    sequential: number;
    parallel: number;
  };
}

class DependencyAnalyzer {
  /**
   * Build dependency graph from epic configuration
   */
  async analyze(epic: EpicConfig): Promise<DependencyGraph> {
    // 1. Parse sprint dependencies
    const graph = this.buildDAG(epic.sprints);

    // 2. Detect circular dependencies
    this.detectCycles(graph);

    // 3. Group independent sprints
    const groups = this.findIndependentGroups(graph);

    // 4. Calculate critical path
    const criticalPath = this.calculateCriticalPath(graph);

    return {
      nodes: graph.nodes,
      edges: graph.edges,
      independentGroups: groups,
      criticalPath,
      estimatedDuration: this.estimateDuration(groups, criticalPath)
    };
  }

  /**
   * Group sprints that can execute in parallel
   */
  private findIndependentGroups(graph: DAG): SprintGroup[] {
    const groups: SprintGroup[] = [];
    const processed = new Set<string>();

    // Topological sort to find execution order
    const sorted = this.topologicalSort(graph);

    for (const sprint of sorted) {
      if (processed.has(sprint.id)) continue;

      // Find all sprints at same dependency level
      const group = this.findParallelizableSprints(sprint, sorted, processed);
      groups.push(group);

      group.sprints.forEach(s => processed.add(s.id));
    }

    return groups;
  }
}
```

**Key Algorithms**:
- Topological sort for execution order
- Tarjan's algorithm for cycle detection
- Critical path calculation (longest path in DAG)

---

### 2. Meta-Coordinator

**Purpose**: Manage multiple sprint coordinators for an independent group

**Responsibilities**:
1. Spawn N sprint coordinators
2. Monitor progress via Redis pub/sub
3. Aggregate Loop 4 Product Owner decisions
4. Handle sprint failures and retries

```typescript
class MetaCoordinator {
  private sprintCoordinators: Map<string, SprintCoordinator> = new Map();
  private redis: Redis;
  private conflictResolver: ConflictResolver;

  /**
   * Launch all sprints in parallel
   */
  async executeParallelSprints(sprints: Sprint[]): Promise<MetaResult> {
    // 1. Spawn coordinators
    const coordinators = await Promise.all(
      sprints.map(sprint => this.spawnSprintCoordinator(sprint))
    );

    // 2. Execute sprints in parallel
    const results = await Promise.all(
      coordinators.map(coord => coord.executeCFNLoop())
    );

    // 3. Resolve conflicts
    const conflicts = await this.conflictResolver.detectConflicts(results);
    if (conflicts.length > 0) {
      await this.conflictResolver.resolveConflicts(conflicts);
    }

    // 4. Aggregate Product Owner decisions
    const globalDecision = await this.aggregateLoop4Decisions(results);

    return {
      sprints: results,
      conflicts: conflicts,
      decision: globalDecision
    };
  }

  /**
   * Aggregate Loop 4 decisions across all sprints
   */
  private async aggregateLoop4Decisions(
    results: SprintResult[]
  ): Promise<ProductOwnerDecision> {
    const confidences = results.map(r => r.confidence);
    const avgConfidence = confidences.reduce((a, b) => a + b) / confidences.length;

    // All sprints must pass individual thresholds
    const allPassed = results.every(r => r.decision === 'PROCEED');

    // Global consensus must be ≥0.85
    if (allPassed && avgConfidence >= 0.85) {
      return {
        type: 'PROCEED',
        confidence: avgConfidence,
        sprints: results.map(r => r.sprintId)
      };
    }

    // Check if issues are defer-able
    const canDefer = results.every(r =>
      r.decision === 'PROCEED' || r.decision === 'DEFER'
    );

    if (canDefer) {
      return {
        type: 'DEFER',
        confidence: avgConfidence,
        backlog: results.flatMap(r => r.backlogItems || [])
      };
    }

    // Escalate if any sprint requires human review
    return {
      type: 'ESCALATE',
      reason: 'One or more sprints require manual intervention',
      sprints: results.filter(r => r.decision === 'ESCALATE')
    };
  }
}
```

---

### 3. Sprint Coordinator

**Purpose**: Execute single sprint through CFN Loop (Loop 0-4)

**Enhanced Features**:
- Dependency waiting with productive work
- Interface publishing when ready
- Parallel Loop 2 validation

```typescript
class SprintCoordinatorEnhanced extends BaseSprintCoordinator {
  private dependencies: string[];
  private productiveWorkQueue: Task[] = [];

  /**
   * Execute sprint with dependency awareness
   */
  async executeCFNLoop(): Promise<SprintResult> {
    // 1. Check dependencies
    if (this.dependencies.length > 0) {
      await this.waitForDependenciesWithProductiveWork();
    }

    // 2. Loop 3: Implementation
    const loop3Result = await this.executeLoop3();

    // 3. Publish interface early (don't wait for full completion)
    await this.publishInterface();

    // 4. Loop 2: Validation (can happen while other sprints integrate)
    const loop2Result = await this.executeLoop2Validation();

    // 5. Loop 4: Product Owner decision
    const loop4Decision = await this.executeLoop4ProductOwner(
      loop3Result,
      loop2Result
    );

    return {
      sprintId: this.sprintId,
      confidence: loop2Result.consensus,
      decision: loop4Decision.type,
      deliverables: loop3Result.files,
      backlogItems: loop4Decision.backlog
    };
  }

  /**
   * Wait for dependencies while doing productive work
   */
  private async waitForDependenciesWithProductiveWork(): Promise<void> {
    logger.info(`Sprint ${this.sprintId} waiting for dependencies: ${this.dependencies.join(', ')}`);

    // Build list of independent work (framework, utils, tests)
    this.productiveWorkQueue = await this.identifyIndependentWork();

    const startTime = Date.now();
    const timeout = 600000; // 10 minutes

    while (Date.now() - startTime < timeout) {
      // Check if all dependencies resolved
      const resolved = await this.checkDependencySignals();
      if (resolved) {
        logger.info(`Sprint ${this.sprintId} dependencies resolved`);
        return;
      }

      // Do productive work while waiting
      if (this.productiveWorkQueue.length > 0) {
        const task = this.productiveWorkQueue.shift();
        await this.executeIndependentTask(task);
      } else {
        // All productive work done, just wait
        await sleep(5000);
      }
    }

    throw new Error(`Sprint ${this.sprintId} dependency timeout`);
  }

  /**
   * Identify work that can be done without dependencies
   */
  private async identifyIndependentWork(): Promise<Task[]> {
    return [
      { type: 'framework', file: 'base-classes.ts', priority: 'high' },
      { type: 'utils', file: 'helpers.ts', priority: 'medium' },
      { type: 'tests', file: 'fixtures.ts', priority: 'low' },
      { type: 'docs', file: 'api-spec.md', priority: 'low' },
      { type: 'mocks', file: 'dependency-mocks.ts', priority: 'high' }
    ];
  }
}
```

---

### 4. Test Lock Coordinator

**Purpose**: Prevent concurrent test execution

**Critical Design**: Only ONE coordinator can run tests at a time to avoid:
- Port conflicts (test server already running)
- File system conflicts (coverage reports, artifacts)
- Resource exhaustion (multiple Chrome instances)

```typescript
class TestLockCoordinator {
  private redis: Redis;
  private lockKey = 'cfn:test:execution:lock';
  private lockTTL = 900000; // 15 minutes max hold time

  /**
   * Acquire exclusive test execution lock
   */
  async acquireTestLock(coordinatorId: string): Promise<boolean> {
    const lockValue = JSON.stringify({
      coordinatorId,
      timestamp: Date.now(),
      pid: process.pid
    });

    // Try to acquire lock with NX (only if not exists)
    const acquired = await this.redis.set(
      this.lockKey,
      lockValue,
      'NX',
      'PX',
      this.lockTTL
    );

    if (acquired) {
      logger.info(`Test lock acquired by ${coordinatorId}`);

      // Publish test execution start event
      await this.redis.publish('cfn:test:coordination', JSON.stringify({
        type: 'test_execution_started',
        coordinator: coordinatorId,
        timestamp: Date.now()
      }));

      return true;
    }

    return false;
  }

  /**
   * Wait in queue for test execution slot
   */
  async waitForTestSlot(
    coordinatorId: string,
    maxWaitMs: number = 300000 // 5 minutes
  ): Promise<boolean> {
    const startTime = Date.now();

    // Add to queue
    await this.redis.zadd(
      'cfn:test:queue',
      Date.now(),
      coordinatorId
    );

    while (Date.now() - startTime < maxWaitMs) {
      const acquired = await this.acquireTestLock(coordinatorId);

      if (acquired) {
        // Remove from queue
        await this.redis.zrem('cfn:test:queue', coordinatorId);
        return true;
      }

      // Check queue position
      const position = await this.redis.zrank('cfn:test:queue', coordinatorId);
      logger.info(`Sprint ${coordinatorId} in test queue position ${position + 1}`);

      // Poll every 5 seconds
      await sleep(5000);
    }

    // Timeout - remove from queue
    await this.redis.zrem('cfn:test:queue', coordinatorId);
    logger.error(`Test slot acquisition timeout for ${coordinatorId}`);

    return false;
  }

  /**
   * Release test lock
   */
  async releaseTestLock(coordinatorId: string): Promise<void> {
    const currentHolder = await this.redis.get(this.lockKey);

    if (!currentHolder) return;

    const holder = JSON.parse(currentHolder);

    if (holder.coordinatorId === coordinatorId) {
      await this.redis.del(this.lockKey);

      // Publish test execution complete
      await this.redis.publish('cfn:test:coordination', JSON.stringify({
        type: 'test_execution_completed',
        coordinator: coordinatorId,
        timestamp: Date.now()
      }));

      logger.info(`Test lock released by ${coordinatorId}`);
    }
  }

  /**
   * Force release stale locks (dead coordinator)
   */
  async forceReleaseStaleTestLock(): Promise<boolean> {
    const currentHolder = await this.redis.get(this.lockKey);

    if (!currentHolder) return false;

    const holder = JSON.parse(currentHolder);
    const lockAge = Date.now() - holder.timestamp;

    // If lock held > 15 minutes, force release
    if (lockAge > this.lockTTL) {
      await this.redis.del(this.lockKey);
      logger.warn(`Force released stale test lock from ${holder.coordinatorId}`);

      // Publish force release event
      await this.redis.publish('cfn:test:coordination', JSON.stringify({
        type: 'test_lock_force_released',
        coordinator: holder.coordinatorId,
        lockAge,
        timestamp: Date.now()
      }));

      return true;
    }

    return false;
  }
}
```

---

### 5. Lifecycle Cleanup Manager

**Purpose**: Prevent memory leaks and orphaned agents

**Key Features**:
- Orphan detection (agents idle >2min)
- Redis-synchronized cleanup
- Memory usage tracking

```typescript
class LifecycleCleanupManager {
  private redis: Redis;
  private orphanCheckInterval = 60000; // Check every 60s
  private orphanThreshold = 120000; // 2 minutes idle

  /**
   * Start orphan detection background process
   */
  startOrphanDetection(): void {
    setInterval(async () => {
      await this.detectAndCleanupOrphans();
    }, this.orphanCheckInterval);
  }

  /**
   * Detect and cleanup orphaned agents
   */
  async detectAndCleanupOrphans(): Promise<string[]> {
    const activeAgents = await this.redis.smembers('agents:active');
    const orphans: string[] = [];

    for (const agentId of activeAgents) {
      const lastHeartbeat = await this.redis.get(`agent:heartbeat:${agentId}`);

      if (!lastHeartbeat) {
        orphans.push(agentId);
        continue;
      }

      const lastHeartbeatTime = parseInt(lastHeartbeat);
      const idle = Date.now() - lastHeartbeatTime;

      if (idle > this.orphanThreshold) {
        orphans.push(agentId);
      }
    }

    // Cleanup orphaned agents
    for (const agentId of orphans) {
      await this.cleanupOrphanedAgent(agentId);
    }

    if (orphans.length > 0) {
      logger.warn(`Cleaned up ${orphans.length} orphaned agents: ${orphans.join(', ')}`);

      // Emit Prometheus metric
      agentOrphanCleanupCount.inc(orphans.length);
    }

    return orphans;
  }

  /**
   * Cleanup orphaned agent with Redis sync
   */
  private async cleanupOrphanedAgent(agentId: string): Promise<void> {
    const lockKey = `cleanup:lock:${agentId}`;

    // Acquire cleanup lock (prevent duplicate cleanup)
    const lockAcquired = await this.redis.set(lockKey, Date.now(), 'NX', 'EX', 300);

    if (!lockAcquired) {
      logger.debug(`Cleanup already in progress for ${agentId}`);
      return;
    }

    try {
      // 1. Publish cleanup intent
      await this.redis.publish('agent:lifecycle', JSON.stringify({
        type: 'cleanup_started',
        agentId,
        reason: 'orphan_detection',
        timestamp: Date.now()
      }));

      // 2. Remove from active registry
      await this.redis.srem('agents:active', agentId);

      // 3. Delete agent keys
      const pattern = `agent:*:${agentId}*`;
      const keys = await this.scanKeys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      // 4. Publish cleanup complete
      await this.redis.publish('agent:lifecycle', JSON.stringify({
        type: 'cleanup_completed',
        agentId,
        keysDeleted: keys.length,
        timestamp: Date.now()
      }));

      logger.info(`Orphaned agent ${agentId} cleaned up (${keys.length} keys deleted)`);

    } finally {
      // Always release lock
      await this.redis.del(lockKey);
    }
  }

  /**
   * Get memory usage statistics
   */
  async getMemoryStats(): Promise<MemoryStats> {
    const info = await this.redis.info('memory');
    const lines = info.split('\r\n');

    const stats: MemoryStats = {
      usedMemory: 0,
      usedMemoryHuman: '',
      usedMemoryPeak: 0,
      totalKeys: 0,
      agentKeys: 0
    };

    for (const line of lines) {
      if (line.startsWith('used_memory:')) {
        stats.usedMemory = parseInt(line.split(':')[1]);
      }
      if (line.startsWith('used_memory_human:')) {
        stats.usedMemoryHuman = line.split(':')[1];
      }
      if (line.startsWith('used_memory_peak:')) {
        stats.usedMemoryPeak = parseInt(line.split(':')[1]);
      }
    }

    // Count agent-related keys
    stats.agentKeys = (await this.scanKeys('agent:*')).length;
    stats.totalKeys = await this.redis.dbsize();

    return stats;
  }
}
```

---

## Communication Protocol

### Redis Pub/Sub Channels

| Channel | Purpose | Message Format | Throughput |
|---------|---------|----------------|------------|
| `sprint:coordination` | Sprint lifecycle events | JSON | High (1000s/sec) |
| `agent:lifecycle` | Agent spawn/cleanup | JSON | Medium (100s/sec) |
| `test:coordination` | Test lock events | JSON | Low (10s/sec) |
| `interface:ready` | Dependency signals | JSON | Medium (100s/sec) |
| `conflict:detected` | Resource conflicts | JSON | Low (10s/sec) |

### Message Examples

**Sprint Coordination**:
```json
{
  "type": "sprint_started",
  "sprintId": "sprint-auth-system",
  "coordinatorId": "coord-123",
  "timestamp": 1696960800000
}
```

**Interface Ready Signal**:
```json
{
  "type": "interface_ready",
  "sprintId": "sprint-auth-system",
  "interface": {
    "name": "AuthAPI",
    "endpoints": [
      "POST /auth/login",
      "POST /auth/logout"
    ],
    "mock": "src/mocks/auth-api-mock.ts"
  },
  "timestamp": 1696960900000
}
```

**Test Lock Acquired**:
```json
{
  "type": "test_execution_started",
  "coordinator": "sprint-coord-2",
  "timestamp": 1696961000000
}
```

---

## Performance Characteristics

### Execution Time Comparison

| Epic Size | Sequential | Parallel | Improvement |
|-----------|-----------|----------|-------------|
| 3 independent sprints | 75 min | 35 min | 53% faster |
| 5 sprints (2 dependent) | 125 min | 55 min | 56% faster |
| 10 sprints (mixed) | 250 min | 95 min | 62% faster |

### Resource Usage

| Metric | Sequential | Parallel (3 sprints) | Parallel (5 sprints) |
|--------|-----------|----------------------|----------------------|
| Peak Agents | 15 | 45 | 75 |
| Redis Memory | 50MB | 150MB | 250MB |
| Test Execution | 1x | 1x (serialized) | 1x (serialized) |
| CPU Usage | 25% | 75% | 90% |

---

## Failure Modes & Recovery

### 1. Agent Crash

**Detection**: Heartbeat missing >2min
**Recovery**:
1. Orphan detection cleanup
2. Work transfer to new agent
3. Continue from last checkpoint

### 2. Test Lock Deadlock

**Detection**: Lock held >15min
**Recovery**:
1. Force release stale lock
2. Notify next in queue
3. Log incident for analysis

### 3. Redis Connection Failure

**Detection**: Connection timeout
**Recovery**:
1. Circuit breaker opens
2. Exponential backoff reconnection
3. State recovered from SQLite backup

### 4. Memory Leak

**Detection**: Memory growth >100MB/epic
**Recovery**:
1. Trigger orphan cleanup
2. Force GC cycle
3. Alert monitoring team

---

## Monitoring & Observability

### Prometheus Metrics

```typescript
// Parallel sprint execution time
parallel_sprint_duration_seconds{sprint_id="auth", status="completed"}

// Test slot wait time
test_slot_wait_time_seconds{coordinator_id="sprint-2"}

// Memory usage per sprint
memory_usage_per_sprint_bytes{sprint_id="auth"}

// Conflict resolution count
conflict_resolution_count{type="file_edit", resolved="true"}

// Orphaned agent cleanup
agent_orphan_cleanup_count{reason="heartbeat_timeout"}
```

### Grafana Dashboard Panels

1. **Parallel Sprint Progress**: Real-time execution timeline
2. **Test Queue Depth**: Number of coordinators waiting for test slot
3. **Memory Growth**: Redis memory usage over time
4. **Conflict Resolution**: Auto-resolved vs escalated conflicts
5. **Orphaned Agents**: Cleanup frequency and reasons

---

## Next Steps

1. Review [Test Coordination Strategy](TEST_COORDINATION.md)
2. Review [Memory Safety Guide](MEMORY_SAFETY.md)
3. Review [Troubleshooting Guide](TROUBLESHOOTING.md)
4. Execute parallel CFN Loop epic: `/cfn-loop-epic planning/parallelization/parallel-cfn-loop-epic.json --parallel`
