# Phase 8: Deadlock Detection Architecture Design

**Version**: 1.0
**Date**: 2025-10-03
**Author**: Architect Agent
**Status**: Draft for Review

---

## 1. Executive Summary

### 1.1 Architecture Overview

Phase 8 implements comprehensive deadlock detection and recovery for the agent coordination system using Wait-For-Graph (WFG) cycle detection with Tarjan's algorithm. The architecture emphasizes:

- **Minimal disruption** to existing SwarmCoordinator, TaskScheduler, and MemoryManager components
- **SDK integration** leveraging existing checkpoint mechanisms from Phase 7
- **Performance targets**: Detection <500ms, recovery <500ms, total <1s
- **Multi-level detection** across nested agent hierarchies up to 10+ levels
- **Prevention-first** approach with resource ordering and timeout strategies

### 1.2 Key Design Principles

1. **Leverage Existing Infrastructure**: Reuse DependencyGraph's Tarjan implementation for WFG cycle detection
2. **Event-Driven Integration**: Subscribe to existing events rather than modifying core logic
3. **Checkpoint-Based Recovery**: Use Phase 7 checkpoint rollback for deadlock recovery
4. **Non-Invasive Monitoring**: Track resource allocation through MessageBroker events
5. **Graceful Degradation**: System remains operational even if deadlock detector fails

---

## 2. Component Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Coordination Layer                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          DeadlockDetector (NEW)                          │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │   WFG      │  │   Tarjan's   │  │   Detection    │  │  │
│  │  │  Builder   │→→│   Algorithm  │→→│   Monitor      │  │  │
│  │  └────────────┘  └──────────────┘  └────────────────┘  │  │
│  │         ↓                 ↓                  ↓          │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │        ResourceTracker (NEW)                       │ │  │
│  │  │  - Agent → Resource allocations                    │ │  │
│  │  │  - Resource → Waiting agents queue                 │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↑         ↓                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │     DeadlockResolver (NEW)                              │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │  Priority  │  │  Checkpoint  │  │   Resource     │  │  │
│  │  │  Victim    │→→│   Rollback   │→→│   Release      │  │  │
│  │  │  Selection │  │   Strategy   │  │   Strategy     │  │  │
│  │  └────────────┘  └──────────────┘  └────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │     ResourceOrderingManager (NEW)                       │  │
│  │  - Global resource ordering                              │  │
│  │  - Timeout policies                                      │  │
│  │  - Prevention strategies                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                             ↑         ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Integration Points                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SwarmCoordinator          MessageBroker        TaskScheduler  │
│  (monitors agents)         (tracks requests)    (task deps)    │
│         ↓                        ↓                    ↓         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Event-Based Resource Tracking                    │  │
│  │  - task:assigned → Resource allocation                   │  │
│  │  - message:request → Resource waiting                    │  │
│  │  - task:completed → Resource release                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  MemoryManager            CheckpointManager (Phase 7)          │
│  (state persistence)      (rollback support)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

#### 2.2.1 DeadlockDetector

**Purpose**: Detect deadlock conditions via WFG cycle detection

**Core Responsibilities**:
- Build Wait-For-Graph from ResourceTracker state
- Execute Tarjan's algorithm for cycle detection (reuse DependencyGraph implementation)
- Schedule periodic detection runs (configurable interval, default 100ms)
- Emit deadlock events with cycle details
- Track detection metrics (cycle count, detection time, false positives)

**Public Interface**:
```typescript
interface IDeadlockDetector {
  start(): void;
  stop(): void;
  detectDeadlock(): DeadlockResult;
  getMetrics(): DeadlockMetrics;
}

interface DeadlockResult {
  detected: boolean;
  cycles: ResourceCycle[];
  detectionTime: number;
  timestamp: Date;
}

interface ResourceCycle {
  agents: string[];      // Agent IDs in cycle
  resources: string[];   // Resource IDs in cycle
  cycleType: 'simple' | 'nested' | 'hierarchical';
  depth: number;         // Nesting level (for hierarchical cycles)
}
```

**Key Implementation Details**:
- Reuse `DependencyGraph.detectCycles()` Tarjan implementation for cycle detection
- Build WFG dynamically from ResourceTracker allocations
- Filter cycles to identify true deadlocks vs transient waits
- Support multi-level detection by tracking agent hierarchy metadata

#### 2.2.2 ResourceTracker

**Purpose**: Track resource allocation and waiting states

**Core Responsibilities**:
- Maintain agent → allocated resources mapping
- Maintain resource → waiting agents queue
- Subscribe to coordination events for state updates
- Provide WFG construction data to DeadlockDetector
- Persist state for recovery

**Public Interface**:
```typescript
interface IResourceTracker {
  allocateResource(agentId: string, resourceId: string): void;
  releaseResource(agentId: string, resourceId: string): void;
  requestResource(agentId: string, resourceId: string): void;
  getAgentResources(agentId: string): Set<string>;
  getResourceWaiters(resourceId: string): string[];
  getWaitForGraph(): WaitForGraph;
}

interface WaitForGraph {
  nodes: Map<string, WFGNode>;      // agentId → node
  edges: Map<string, Set<string>>;  // agentId → [waiting for agents]
}

interface WFGNode {
  agentId: string;
  allocatedResources: string[];
  requestedResources: string[];
  hierarchy: number;     // Agent nesting level
  priority: number;      // For victim selection
}
```

**Key Implementation Details**:
- Use Map-based storage for O(1) lookups
- Track resource request timestamps for timeout detection
- Distinguish between synchronous (task deps) and asynchronous (message requests) resources
- Maintain hierarchical metadata for nested agent tracking

#### 2.2.3 DeadlockResolver

**Purpose**: Resolve detected deadlocks via victim selection and recovery

**Core Responsibilities**:
- Select victim agent for deadlock breaking
- Coordinate checkpoint rollback via CheckpointManager
- Release victim's resources
- Re-queue victim's tasks for retry
- Monitor resolution success

**Public Interface**:
```typescript
interface IDeadlockResolver {
  resolve(deadlock: DeadlockResult): Promise<ResolutionResult>;
  setStrategy(strategy: ResolutionStrategy): void;
}

interface ResolutionResult {
  success: boolean;
  victim: string;        // Selected victim agent ID
  recoveryTime: number;  // Time to complete recovery
  rollbackState?: string; // Checkpoint ID used
  error?: string;
}

type ResolutionStrategy =
  | 'priority-based'      // Select lowest priority agent
  | 'youngest-first'      // Select most recently spawned
  | 'least-progress'      // Select agent with least work completed
  | 'random';             // Random selection
```

**Key Implementation Details**:
- Integrate with Phase 7 CheckpointManager for state rollback
- Use priority-based victim selection by default
- Support configurable rollback strategies (full vs partial)
- Emit resolution metrics for monitoring

#### 2.2.4 ResourceOrderingManager

**Purpose**: Prevent deadlocks via resource ordering and timeout policies

**Core Responsibilities**:
- Enforce global resource ordering
- Apply timeout policies to resource requests
- Validate resource acquisition order
- Track prevention metrics

**Public Interface**:
```typescript
interface IResourceOrderingManager {
  registerResource(resourceId: string, order: number): void;
  validateAcquisition(agentId: string, resourceId: string): boolean;
  setTimeoutPolicy(policy: TimeoutPolicy): void;
  getResourceOrder(resourceId: string): number;
}

interface TimeoutPolicy {
  maxWaitTime: number;           // Max time to wait for resource (ms)
  escalationThreshold: number;   // When to escalate priority
  timeoutAction: 'abort' | 'escalate' | 'retry';
}
```

**Key Implementation Details**:
- Assign ordering via hash-based or manual registration
- Reject out-of-order acquisitions to prevent circular waits
- Support hierarchical ordering for nested resource groups
- Integrate with TaskScheduler for timeout enforcement

---

## 3. Integration Strategy

### 3.1 Minimal Code Changes to Existing Components

#### 3.1.1 SwarmCoordinator

**Changes**: NONE (event subscription only)

**Integration Approach**:
- DeadlockDetector subscribes to existing `agent:spawned`, `agent:terminated` events
- ResourceTracker subscribes to existing `task:assigned`, `task:completed` events
- No modification to SwarmCoordinator logic required

#### 3.1.2 TaskScheduler

**Changes**: MINIMAL (optional timeout hook)

**Integration Approach**:
- DeadlockDetector subscribes to existing `task:assigned`, `task:failed` events
- Optional: Add timeout callback for ResourceOrderingManager timeout policies
- Existing retry logic remains unchanged

**Code Addition** (optional):
```typescript
// In TaskScheduler.assignTask()
if (this.resourceOrderingManager) {
  const valid = this.resourceOrderingManager.validateAcquisition(
    task.assignedAgent,
    task.id
  );
  if (!valid) {
    throw new TaskError('Resource ordering violation');
  }
}
```

#### 3.1.3 MessageBroker

**Changes**: NONE (event subscription only)

**Integration Approach**:
- ResourceTracker subscribes to `request:pending`, `request:completed` events
- Track request/reply correlation IDs as resource allocation events
- No modification to MessageBroker logic required

#### 3.1.4 MemoryManager

**Changes**: NONE (standard usage)

**Integration Approach**:
- ResourceTracker stores state via standard `store()` API
- DeadlockDetector retrieves historical data via `query()` API
- No custom interfaces required

### 3.2 Event Subscription Matrix

| Component           | Subscribes To              | Emits                      |
|---------------------|----------------------------|----------------------------|
| DeadlockDetector    | (internal timer)           | deadlock:detected          |
| ResourceTracker     | task:assigned              | resource:allocated         |
|                     | task:completed             | resource:released          |
|                     | message:request            | resource:waiting           |
|                     | agent:spawned              | -                          |
|                     | agent:terminated           | -                          |
| DeadlockResolver    | deadlock:detected          | deadlock:resolved          |
|                     | -                          | deadlock:resolution-failed |
| ResourceOrderingMgr | task:assigned              | resource:ordering-violation|

### 3.3 Checkpoint Integration (Phase 7)

**Checkpoint Workflow for Deadlock Recovery**:

```typescript
// In DeadlockResolver
async resolve(deadlock: DeadlockResult): Promise<ResolutionResult> {
  const victim = this.selectVictim(deadlock.cycles);

  // Step 1: Get latest checkpoint before deadlock
  const checkpoint = await this.checkpointManager.getLatestCheckpoint(
    victim.agentId,
    { beforeTimestamp: deadlock.timestamp }
  );

  // Step 2: Pause victim agent via QueryController
  await this.queryController.pauseAgent(victim.agentId);

  // Step 3: Rollback to pre-deadlock state
  await this.checkpointManager.rollback(victim.agentId, checkpoint.id);

  // Step 4: Release victim's resources
  for (const resourceId of victim.allocatedResources) {
    this.resourceTracker.releaseResource(victim.agentId, resourceId);
  }

  // Step 5: Resume agent with retry
  await this.queryController.resumeAgent(victim.agentId, {
    retryCurrentTask: true
  });

  return {
    success: true,
    victim: victim.agentId,
    recoveryTime: Date.now() - deadlock.timestamp.getTime(),
    rollbackState: checkpoint.id
  };
}
```

---

## 4. Data Structures

### 4.1 Resource Allocation State

```typescript
interface ResourceAllocationState {
  // Agent → Allocated resources
  allocations: Map<string, Set<string>>;

  // Resource → Waiting queue (ordered by timestamp)
  waitQueues: Map<string, ResourceWaiter[]>;

  // Agent hierarchy metadata
  agentHierarchy: Map<string, AgentHierarchyInfo>;

  // Resource ordering
  resourceOrdering: Map<string, number>;
}

interface ResourceWaiter {
  agentId: string;
  requestedAt: number;
  priority: number;
  timeoutAt: number;
}

interface AgentHierarchyInfo {
  agentId: string;
  parentAgentId?: string;
  depth: number;          // Nesting level (0 = root)
  childAgents: string[];  // Nested agents spawned by this agent
}
```

### 4.2 Wait-For-Graph Construction

**Algorithm**:
```typescript
buildWaitForGraph(state: ResourceAllocationState): WaitForGraph {
  const wfg: WaitForGraph = {
    nodes: new Map(),
    edges: new Map()
  };

  // Add nodes for all agents
  for (const [agentId, resources] of state.allocations) {
    wfg.nodes.set(agentId, {
      agentId,
      allocatedResources: Array.from(resources),
      requestedResources: [],
      hierarchy: state.agentHierarchy.get(agentId)?.depth ?? 0,
      priority: 0 // Retrieved from SwarmCoordinator
    });
  }

  // Add edges for waiting relationships
  for (const [resourceId, waiters] of state.waitQueues) {
    // Find agent(s) holding this resource
    const holders = Array.from(state.allocations.entries())
      .filter(([_, resources]) => resources.has(resourceId))
      .map(([agentId]) => agentId);

    // For each waiter, add edge to all holders
    for (const waiter of waiters) {
      if (!wfg.edges.has(waiter.agentId)) {
        wfg.edges.set(waiter.agentId, new Set());
      }

      for (const holder of holders) {
        wfg.edges.get(waiter.agentId)!.add(holder);
      }

      // Update requested resources
      wfg.nodes.get(waiter.agentId)!.requestedResources.push(resourceId);
    }
  }

  return wfg;
}
```

---

## 5. Detection Algorithm Flow

### 5.1 Periodic Detection Cycle

```
┌─────────────────────────────────────────────────────────────┐
│  Timer Trigger (100ms default)                              │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Build Wait-For-Graph                               │
│  - Query ResourceTracker for allocations                    │
│  - Query ResourceTracker for wait queues                    │
│  - Construct WFG nodes and edges                            │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Run Tarjan's Algorithm (Reuse DependencyGraph)    │
│  - Create temporary DependencyGraph from WFG                │
│  - Call detectCycles() to find SCCs                         │
│  - Filter SCCs to identify true deadlocks                   │
└─────────────────────────────────────────────────────────────┘
                         ↓
                  ┌──────────────┐
                  │ Cycles found?│
                  └──────────────┘
                    Yes ↓    No → (Exit, schedule next cycle)
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Validate True Deadlock                             │
│  - Check cycle stability (present for 2+ consecutive runs)  │
│  - Verify no timeout expiring soon                          │
│  - Confirm all agents in cycle are active                   │
└─────────────────────────────────────────────────────────────┘
                         ↓
                  ┌──────────────┐
                  │ True deadlock│
                  └──────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: Emit Deadlock Event                                │
│  - Event: deadlock:detected                                 │
│  - Payload: { cycles, agents, resources, timestamp }        │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  DeadlockResolver: Handle Resolution (separate flow)        │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Performance Optimization

**Target**: Detection <500ms for 50+ agents

**Optimizations**:
1. **Incremental Graph Updates**: Only rebuild WFG nodes affected by recent events
2. **Cycle Caching**: Cache detected cycles and invalidate on state changes
3. **Early Termination**: Stop Tarjan's algorithm after finding first cycle
4. **Timeout Pre-filtering**: Skip detection for agents with imminent timeouts
5. **Hierarchical Partitioning**: Detect cycles independently per hierarchy level

**Complexity Analysis**:
- Graph construction: O(A + R) where A = agents, R = resources
- Tarjan's algorithm: O(A + E) where E = edges (worst case A²)
- Expected case (sparse graph): O(A) with E ≈ 2A

**Benchmark Estimates**:
- 50 agents, 100 resources, 150 edges: ~50ms detection time
- 100 agents, 200 resources, 300 edges: ~150ms detection time

---

## 6. Prevention Strategies

### 6.1 Resource Ordering

**Strategy**: Enforce total ordering on resources to prevent circular waits

**Implementation**:
```typescript
class ResourceOrderingManager {
  private resourceOrdering: Map<string, number>;

  registerResource(resourceId: string, order: number): void {
    this.resourceOrdering.set(resourceId, order);
  }

  validateAcquisition(agentId: string, resourceId: string): boolean {
    const allocated = this.tracker.getAgentResources(agentId);
    const newOrder = this.resourceOrdering.get(resourceId) ?? Infinity;

    // Ensure new resource order > all currently held resources
    for (const heldResource of allocated) {
      const heldOrder = this.resourceOrdering.get(heldResource) ?? 0;
      if (newOrder <= heldOrder) {
        return false; // Ordering violation
      }
    }

    return true;
  }
}
```

**Default Ordering Strategy**: Hash-based ordering for dynamic resources
```typescript
function getResourceOrder(resourceId: string): number {
  // Use hash to generate stable ordering
  let hash = 0;
  for (let i = 0; i < resourceId.length; i++) {
    hash = ((hash << 5) - hash) + resourceId.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
```

### 6.2 Timeout Policies

**Strategy**: Abort or escalate stuck resource requests

**Implementation**:
```typescript
interface TimeoutPolicy {
  maxWaitTime: number;           // 30000ms default
  escalationThreshold: number;   // 10000ms default
  timeoutAction: 'abort' | 'escalate' | 'retry';
}

class ResourceTracker {
  private timeoutPolicy: TimeoutPolicy;

  requestResource(agentId: string, resourceId: string): void {
    const waiter: ResourceWaiter = {
      agentId,
      requestedAt: Date.now(),
      priority: 0,
      timeoutAt: Date.now() + this.timeoutPolicy.maxWaitTime
    };

    // Add to wait queue
    this.waitQueues.get(resourceId)?.push(waiter);

    // Schedule timeout check
    setTimeout(() => {
      this.handleTimeout(agentId, resourceId);
    }, this.timeoutPolicy.maxWaitTime);
  }

  handleTimeout(agentId: string, resourceId: string): void {
    switch (this.timeoutPolicy.timeoutAction) {
      case 'abort':
        this.abortRequest(agentId, resourceId);
        break;
      case 'escalate':
        this.escalatePriority(agentId, resourceId);
        break;
      case 'retry':
        this.retryRequest(agentId, resourceId);
        break;
    }
  }
}
```

### 6.3 Hierarchical Resource Partitioning

**Strategy**: Isolate resources by agent hierarchy level

**Implementation**:
- Root agents (depth 0) access global resources
- Nested agents (depth > 0) access scoped resources only
- Prevents cross-hierarchy deadlocks

---

## 7. Recovery Mechanisms

### 7.1 Rollback Strategy

**Checkpoint Selection**:
1. Get latest checkpoint before deadlock detection timestamp
2. Validate checkpoint integrity
3. Ensure checkpoint is before resource allocation that caused deadlock

**Rollback Steps** (using Phase 7 CheckpointManager):
```typescript
async rollback(victimId: string, checkpointId: string): Promise<void> {
  // 1. Pause victim agent
  await this.queryController.pauseAgent(victimId);

  // 2. Restore state from checkpoint
  await this.checkpointManager.rollback(victimId, checkpointId);

  // 3. Clear resource allocations
  const resources = this.tracker.getAgentResources(victimId);
  for (const resourceId of resources) {
    this.tracker.releaseResource(victimId, resourceId);
  }

  // 4. Resume agent with retry flag
  await this.queryController.resumeAgent(victimId, {
    retryCurrentTask: true,
    avoidResources: Array.from(resources) // Hint to avoid deadlock
  });
}
```

### 7.2 Preemption Strategy

**Alternative**: Abort victim's current task without rollback

**When to Use**:
- No checkpoint available
- Rollback would be too expensive
- Task is idempotent

**Implementation**:
```typescript
async preempt(victimId: string): Promise<void> {
  // 1. Cancel victim's active tasks
  await this.taskScheduler.cancelAgentTasks(victimId);

  // 2. Release all resources
  const resources = this.tracker.getAgentResources(victimId);
  for (const resourceId of resources) {
    this.tracker.releaseResource(victimId, resourceId);
  }

  // 3. Re-queue tasks with lower priority
  await this.taskScheduler.rescheduleAgentTasks(victimId);
}
```

### 7.3 Restart Strategy

**Last Resort**: Terminate and respawn victim agent

**When to Use**:
- Rollback and preemption both failed
- Agent is in corrupted state
- Deadlock persists after resolution attempts

**Implementation**:
```typescript
async restart(victimId: string): Promise<void> {
  // 1. Save agent profile
  const profile = this.swarmCoordinator.getAgent(victimId);

  // 2. Terminate agent
  await this.swarmCoordinator.terminateAgent(victimId);

  // 3. Respawn with fresh state
  await this.swarmCoordinator.spawnAgent(profile);
}
```

---

## 8. Multi-Level Deadlock Detection

### 8.1 Nested Agent Hierarchy Tracking

**Data Structure**:
```typescript
interface AgentHierarchyInfo {
  agentId: string;
  parentAgentId?: string;
  depth: number;          // 0 = root, 1 = child, 2 = grandchild, ...
  childAgents: string[];
  rootAgentId: string;    // Top-level ancestor
}
```

**Hierarchy Construction** (via SwarmCoordinator events):
```typescript
class ResourceTracker {
  on('agent:spawned', (event) => {
    const { agentId, parentAgentId } = event;

    const parentDepth = parentAgentId
      ? this.hierarchy.get(parentAgentId)?.depth ?? 0
      : 0;

    this.hierarchy.set(agentId, {
      agentId,
      parentAgentId,
      depth: parentDepth + 1,
      childAgents: [],
      rootAgentId: parentAgentId
        ? this.hierarchy.get(parentAgentId)!.rootAgentId
        : agentId
    });

    if (parentAgentId) {
      this.hierarchy.get(parentAgentId)!.childAgents.push(agentId);
    }
  });
}
```

### 8.2 Cross-Hierarchy Deadlock Detection

**Challenge**: Deadlocks spanning multiple hierarchy levels

**Solution**: Flatten hierarchy during WFG construction
```typescript
buildWaitForGraph(state: ResourceAllocationState): WaitForGraph {
  // ... standard WFG construction ...

  // Add cross-hierarchy edges
  for (const [agentId, node] of wfg.nodes) {
    const hierarchy = state.agentHierarchy.get(agentId)!;

    // If agent's parent is waiting, agent transitively waits
    if (hierarchy.parentAgentId && wfg.edges.has(hierarchy.parentAgentId)) {
      const parentEdges = wfg.edges.get(hierarchy.parentAgentId)!;

      if (!wfg.edges.has(agentId)) {
        wfg.edges.set(agentId, new Set());
      }

      for (const waitTarget of parentEdges) {
        wfg.edges.get(agentId)!.add(waitTarget);
      }
    }
  }

  return wfg;
}
```

### 8.3 Hierarchical Victim Selection

**Prefer breaking deadlock at higher levels**:
```typescript
selectVictim(cycles: ResourceCycle[]): string {
  // Find agent with highest depth (deepest in hierarchy)
  let maxDepth = -1;
  let victim: string | null = null;

  for (const cycle of cycles) {
    for (const agentId of cycle.agents) {
      const depth = this.hierarchy.get(agentId)?.depth ?? 0;
      if (depth > maxDepth) {
        maxDepth = depth;
        victim = agentId;
      }
    }
  }

  return victim!;
}
```

**Rationale**: Terminating nested agent has less impact than root agent

---

## 9. Performance Considerations

### 9.1 Performance Targets

| Metric                  | Target     | Measurement Strategy                     |
|-------------------------|------------|------------------------------------------|
| WFG Cycle Detection     | <500ms     | Benchmark with 50+ agent graphs          |
| Checkpoint Rollback     | <500ms     | Use Phase 7 checkpoint metrics           |
| Total Recovery Time     | <1s        | End-to-end deadlock→resolution           |
| Detection Overhead      | <5%        | CPU/memory impact during normal ops      |
| False Positive Rate     | <1%        | Chaos testing with simulated deadlocks   |

### 9.2 Overhead Minimization

**Techniques**:
1. **Lazy WFG Construction**: Only build graph when detection triggered
2. **Event Batching**: Aggregate resource events every 100ms instead of per-event
3. **Cycle Stability Check**: Ignore transient cycles (< 200ms duration)
4. **Background Detection**: Run detector in separate thread (worker)
5. **Adaptive Polling**: Increase interval if no deadlocks detected

### 9.3 Memory Optimization

**Memory Budget**: 50MB max for deadlock detection subsystem

**Allocations**:
- ResourceTracker state: ~20MB (100 agents × 200KB each)
- WFG construction: ~10MB temporary
- Tarjan's algorithm state: ~5MB
- Event buffers: ~5MB
- Metrics/logs: ~10MB

**Optimization**:
- Use WeakMap for agent→resource mappings (auto-cleanup)
- Prune wait queues after resource allocation
- Limit cycle history to 100 most recent

---

## 10. Metrics and Monitoring

### 10.1 Deadlock Metrics

```typescript
interface DeadlockMetrics {
  // Detection metrics
  totalDetections: number;
  falsePositives: number;
  truePositives: number;
  avgDetectionTime: number;     // ms
  maxDetectionTime: number;     // ms

  // Recovery metrics
  totalResolutions: number;
  successfulResolutions: number;
  failedResolutions: number;
  avgRecoveryTime: number;      // ms
  maxRecoveryTime: number;      // ms

  // Victim selection metrics
  victimsByStrategy: Record<ResolutionStrategy, number>;
  rollbackCount: number;
  preemptionCount: number;
  restartCount: number;

  // Prevention metrics
  orderingViolations: number;
  timeoutAborts: number;
  timeoutEscalations: number;

  // Resource metrics
  activeAllocations: number;
  queuedRequests: number;
  avgWaitTime: number;          // ms
  maxWaitTime: number;          // ms
}
```

### 10.2 Alerting Thresholds

```typescript
interface AlertThresholds {
  deadlockRate: number;         // deadlocks/hour (alert if > 5)
  detectionTimeP99: number;     // alert if > 1000ms
  recoveryTimeP99: number;      // alert if > 2000ms
  failureRate: number;          // alert if > 5%
  resourceWaitTimeP95: number;  // alert if > 10000ms
}
```

### 10.3 Monitoring Dashboard

**Key Visualizations**:
1. Deadlock detection timeline (per-minute rate)
2. WFG visualization (live graph with cycles highlighted)
3. Resolution success rate trend
4. Resource allocation heatmap
5. Agent hierarchy tree with deadlock indicators

---

## 11. Testing Strategy

### 11.1 Unit Tests

**Coverage Targets**: >90% for all new components

**Test Cases**:
- DeadlockDetector: Tarjan's algorithm correctness
- ResourceTracker: Allocation/release state management
- DeadlockResolver: Victim selection strategies
- ResourceOrderingManager: Ordering validation logic

### 11.2 Integration Tests

**Scenarios**:
1. **Simple Circular Deadlock**: Agent A waits for B, B waits for A
2. **3-Agent Cycle**: A→B→C→A resource dependency
3. **Hierarchical Deadlock**: Parent agent waits for child's resource
4. **Multi-Level Nested Deadlock**: 10-level deep agent hierarchy
5. **False Positive Filtering**: Transient wait cycles < 200ms

### 11.3 Chaos Engineering Tests

**Fault Injection**:
- Checkpoint corruption during rollback
- Detector crash during cycle detection
- Agent termination during resolution
- Network partition simulating resource unavailability

**Success Criteria**:
- 95%+ recovery success rate
- No data loss during rollback
- System remains operational during detector downtime

### 11.4 Performance Benchmarks

**Test Harness**:
```typescript
async function benchmarkDeadlockDetection(agentCount: number) {
  const tracker = new ResourceTracker();
  const detector = new DeadlockDetector(tracker);

  // Setup: Create agent graph with circular dependencies
  for (let i = 0; i < agentCount; i++) {
    tracker.allocateResource(`agent-${i}`, `resource-${i}`);
    tracker.requestResource(`agent-${i}`, `resource-${(i+1) % agentCount}`);
  }

  // Measure detection time
  const start = performance.now();
  const result = await detector.detectDeadlock();
  const duration = performance.now() - start;

  return {
    agentCount,
    detectionTime: duration,
    cycleFound: result.detected,
    cycleSize: result.cycles[0]?.agents.length
  };
}

// Run benchmarks
for (const count of [10, 25, 50, 100]) {
  const results = await benchmarkDeadlockDetection(count);
  console.log(results);
}
```

**Expected Results**:
- 10 agents: <50ms
- 25 agents: <100ms
- 50 agents: <300ms
- 100 agents: <800ms

---

## 12. File Structure

```
src/coordination/v2/deadlock/
├── wait-for-graph.ts              # WFG construction and data structures
├── deadlock-detector.ts           # Detection logic using Tarjan's algorithm
├── deadlock-resolver.ts           # Resolution strategies and execution
├── resource-ordering.ts           # Prevention via resource ordering
├── resource-tracker.ts            # Resource allocation state tracking
├── types.ts                       # TypeScript interfaces
├── index.ts                       # Module exports
├── __tests__/
│   ├── wait-for-graph.test.ts
│   ├── deadlock-detector.test.ts
│   ├── deadlock-resolver.test.ts
│   ├── resource-ordering.test.ts
│   ├── resource-tracker.test.ts
│   └── integration.test.ts       # Multi-level deadlock scenarios
└── benchmarks/
    └── detection-performance.ts  # Performance benchmarks
```

---

## 13. Implementation Plan

### 13.1 Phase 1: Core Detection (Week 8.1-8.2)

**Developer 1 (Lead)**:
- [ ] Implement WaitForGraph data structure
- [ ] Implement DeadlockDetector with Tarjan's algorithm integration
- [ ] Implement ResourceTracker event subscriptions
- [ ] Unit tests for detection logic

**Developer 2**:
- [ ] Implement DeadlockResolver with priority-based victim selection
- [ ] Integrate CheckpointManager rollback
- [ ] Implement ResourceOrderingManager
- [ ] Unit tests for resolution logic

**Developer 3**:
- [ ] Implement metrics collection and monitoring
- [ ] Implement alerting thresholds
- [ ] Create integration tests for simple deadlock scenarios
- [ ] Set up performance benchmarking harness

### 13.2 Phase 2: Multi-Level Detection (Week 8.3)

**Developer 1 (Lead)**:
- [ ] Extend ResourceTracker for agent hierarchy tracking
- [ ] Implement cross-hierarchy WFG construction
- [ ] Add multi-level cycle detection

**Developer 2**:
- [ ] Implement hierarchical victim selection
- [ ] Add nested agent rollback support
- [ ] Implement priority-based pause/resume via QueryController

**SDK Specialist**:
- [ ] Design checkpoint rollback mechanism for nested agents
- [ ] Implement multi-level deadlock detection SDK APIs
- [ ] Validate priority query control for deadlock resolution

### 13.3 Phase 3: Testing & Validation (Week 8.4)

**Developer 3**:
- [ ] Chaos engineering test suite
- [ ] 10+ nested level validation tests
- [ ] Performance benchmarks (50+ agents)
- [ ] False positive rate measurement

**SDK Specialist**:
- [ ] SDK checkpoint recovery testing
- [ ] Integration tests with Phase 7 checkpoints
- [ ] Validate zero data loss during rollback

**All Developers**:
- [ ] Code review and refinement
- [ ] Documentation updates
- [ ] Final performance validation

---

## 14. Risk Assessment

### 14.1 Technical Risks

| Risk                              | Impact | Likelihood | Mitigation                                    |
|-----------------------------------|--------|------------|-----------------------------------------------|
| Tarjan's algorithm overhead       | High   | Medium     | Optimize WFG construction, adaptive polling   |
| False positive deadlock detection | Medium | Medium     | Cycle stability check, timeout pre-filtering  |
| Checkpoint rollback corruption    | High   | Low        | Validate checkpoints, implement rollback tests|
| Multi-level detection complexity  | Medium | Medium     | Incremental implementation, extensive testing |
| Event subscription race conditions| Medium | Low        | Event ordering guarantees, atomic operations  |

### 14.2 Performance Risks

| Risk                          | Impact | Mitigation                                      |
|-------------------------------|--------|-------------------------------------------------|
| Detection latency > 500ms     | High   | Lazy WFG construction, background worker        |
| Memory overhead > 5%          | Medium | WeakMap for auto-cleanup, pruning strategies    |
| False positives > 1%          | Medium | Cycle stability check, validation improvements  |

### 14.3 Integration Risks

| Risk                                  | Impact | Mitigation                                |
|---------------------------------------|--------|-------------------------------------------|
| Breaking existing SwarmCoordinator    | High   | Event-only integration, no code changes   |
| Checkpoint API incompatibility        | Medium | Early Phase 7 integration testing         |
| MessageBroker event overhead          | Low    | Event batching, async processing          |

---

## 15. Success Criteria Validation

### 15.1 Numerical Thresholds

| Threshold                     | Target  | Validation Method                               |
|-------------------------------|---------|------------------------------------------------|
| WFG Cycle Detection           | <500ms  | Benchmark with 50+ agent graphs                |
| Deadlock Detection Scale      | 50+     | Large-scale test harness                       |
| Checkpoint Rollback           | 100%    | Rollback validation tests                      |
| Recovery Speed                | <500ms  | Checkpoint recovery benchmark                  |
| Deadlock Recovery Success Rate| >95%    | Chaos engineering scenarios                    |
| Total Recovery Time           | <1s     | End-to-end recovery tests                      |

### 15.2 Binary Completion Checklist

- [ ] `src/coordination/v2/deadlock/wait-for-graph.ts` implemented
- [ ] `src/coordination/v2/deadlock/deadlock-detector.ts` implemented
- [ ] `src/coordination/v2/deadlock/deadlock-resolver.ts` implemented
- [ ] `src/coordination/v2/deadlock/resource-ordering.ts` implemented
- [ ] Deadlock metrics and alerting operational
- [ ] SDK multi-level deadlock detection working
- [ ] SDK checkpoint rollback for deadlock recovery validated
- [ ] Resume from pre-deadlock checkpoint state tested
- [ ] Priority-based pause/resume for resolution enabled
- [ ] Multi-level deadlock detection across 10+ nested levels verified
- [ ] Zero data loss during checkpoint rollback confirmed
- [ ] Integration tests for deadlock scenarios passing

---

## 16. Open Questions and Decisions

### 16.1 Design Decisions Required

1. **Default victim selection strategy**: Priority-based or youngest-first?
   - **Recommendation**: Priority-based (preserves high-priority work)

2. **Detection polling interval**: 100ms vs 500ms vs adaptive?
   - **Recommendation**: Adaptive (100ms if deadlocks detected recently, 500ms otherwise)

3. **Checkpoint granularity for rollback**: Full state vs incremental?
   - **Recommendation**: Use Phase 7 default (full state for safety)

4. **Resource ordering**: Hash-based vs manual registration?
   - **Recommendation**: Hybrid (manual for critical resources, hash for dynamic)

5. **Timeout action**: Abort vs escalate vs retry?
   - **Recommendation**: Escalate (gives agents more chances before aborting)

### 16.2 Future Enhancements (Post-Phase 8)

1. **Distributed deadlock detection**: Extend to multi-coordinator systems
2. **Predictive deadlock prevention**: ML-based resource request prediction
3. **Resource reservation**: Agents pre-declare resource needs
4. **Deadlock visualization**: Real-time WFG graph UI
5. **Custom victim selection**: User-defined resolution strategies

---

## 17. Confidence Score and Blockers

### Confidence Score: 0.88 (88%)

**Reasoning**:
- **High confidence (0.95)**: Core detection architecture leverages proven Tarjan's algorithm already implemented in DependencyGraph
- **High confidence (0.90)**: Integration strategy is non-invasive, using event subscriptions only
- **Medium confidence (0.85)**: Checkpoint rollback integration depends on Phase 7 APIs being stable
- **Medium confidence (0.80)**: Multi-level detection complexity requires careful testing
- **Lower confidence (0.75)**: Performance targets (<500ms) need validation with real workloads

**Blockers**:
1. **Phase 7 Dependency**: Checkpoint rollback APIs must be finalized (mitigation: work with SDK specialist to clarify interfaces)
2. **MessageBroker Events**: Need to confirm `request:pending` and `request:completed` events exist (mitigation: review MessageBroker implementation)
3. **SwarmCoordinator Agent Metadata**: Need agent priority and hierarchy metadata (mitigation: extend agent profile if needed)

**Risk Mitigation**:
- Start with simple circular deadlock detection (high confidence)
- Incrementally add multi-level detection after core logic validated
- Collaborate with SDK specialist early on checkpoint integration
- Run performance benchmarks early to validate <500ms target feasible

---

## Appendix A: References

- **Tarjan's Algorithm**: Robert Tarjan, "Depth-First Search and Linear Graph Algorithms" (1972)
- **Deadlock Detection**: Andrew S. Tanenbaum, "Operating Systems: Design and Implementation"
- **Wait-For-Graph**: Silberschatz et al., "Operating System Concepts"
- **Checkpoint Recovery**: Daniel Skinner, "A Checkpoint Recovery System"
- **Resource Ordering**: E.W. Dijkstra, "The Banker's Algorithm"

## Appendix B: Glossary

- **WFG (Wait-For-Graph)**: Directed graph representing resource dependencies
- **SCC (Strongly Connected Component)**: Maximal set of nodes with paths to each other
- **Tarjan's Algorithm**: O(V+E) algorithm for finding SCCs via DFS
- **Resource Ordering**: Total ordering on resources to prevent circular waits
- **Victim Selection**: Choosing which agent to preempt in deadlock resolution
- **Checkpoint Rollback**: Restoring agent state to earlier saved checkpoint
- **Hierarchical Deadlock**: Deadlock spanning multiple agent nesting levels

---

**Document Status**: Draft for Review
**Next Steps**: Review by team, validate Phase 7 checkpoint APIs, begin implementation

