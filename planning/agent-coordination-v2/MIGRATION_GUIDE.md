# Agent Coordination System V2 - Migration Guide

**Version**: 2.0
**Date**: 2025-10-02
**Status**: Implementation Ready

---

## Executive Summary

This guide provides a phased migration path from the current claude-flow-novice coordination system to the V2 architecture featuring:

- Agent lifecycle states (idle → working → waiting → helping → complete)
- True dependency resolution with DAG-based tracking
- Hierarchical and mesh coordination topologies
- Distributed completion detection
- Byzantine consensus validation
- Deadlock prevention and recovery

**Migration Timeline**: 12 weeks
**Backward Compatibility**: Full during transition (Weeks 1-8), deprecated (Week 9-12)
**Rollback Support**: Available through Week 10

---

## Table of Contents

1. [Gap Analysis](#gap-analysis)
2. [Breaking Changes](#breaking-changes)
3. [Backward Compatibility Strategy](#backward-compatibility-strategy)
4. [Phased Migration Plan](#phased-migration-plan)
5. [Code Migration Examples](#code-migration-examples)
6. [Testing Strategy](#testing-strategy)
7. [Rollback Procedures](#rollback-procedures)
8. [Data Migration](#data-migration)

---

## Gap Analysis

### Current System vs Target Architecture

| Feature | Current State | Target V2 | Gap Severity |
|---------|---------------|-----------|--------------|
| **Agent States** | `idle`, `busy`, `failed`, `completed` | `idle`, `working`, `waiting`, `blocked`, `helping`, `complete` | **HIGH** |
| **Dependency Tracking** | Basic task dependencies via arrays | Full DAG with cycle detection, topological sort | **HIGH** |
| **Coordination Topology** | Centralized coordinator only | Mesh (2-7) + Hierarchical (8+) | **MEDIUM** |
| **Completion Detection** | Manual task counting | Automated with Dijkstra-Scholten + counter-based | **HIGH** |
| **Deadlock Detection** | None | Wait-for-graph cycle detection | **HIGH** |
| **Message Passing** | EventEmitter-based | Dedicated channels (state, dependency, task, help) | **MEDIUM** |
| **Consensus** | None | Byzantine fault tolerance + confidence voting | **MEDIUM** |
| **Help System** | Manual task reassignment | Automated waiting → helping transitions | **HIGH** |

### Current Infrastructure Analysis

**SwarmCoordinator** (`src/coordination/swarm-coordinator.ts`):
- ✅ Has: Basic agent registration, task assignment, background workers
- ❌ Missing: State machine, dependency graph, completion detection, help system
- 📊 Lines of Code: ~760
- 🔧 Modification Needed: Extensive refactoring

**SwarmMemory** (`src/memory/swarm-memory.ts`):
- ✅ Has: Entry storage, agent associations, knowledge bases
- ❌ Missing: Dependency graph storage, state transition history, completion probes
- 📊 Lines of Code: ~634
- 🔧 Modification Needed: Schema enhancement

**Orchestrator** (`src/core/orchestrator.ts`):
- ✅ Has: Session management, health checks, task queueing
- ❌ Missing: V2 coordination integration hooks
- 📊 Lines of Code: ~1314
- 🔧 Modification Needed: Moderate integration

**MCP Tools** (`src/mcp/swarm-tools.ts`):
- ✅ Has: Basic swarm tools, agent dispatch, status reporting
- ❌ Missing: V2 coordination methods, dependency tools, help request tools
- 📊 Lines of Code: ~830
- 🔧 Modification Needed: Tool expansion

---

## Breaking Changes

### Critical API Changes

#### 1. Agent State Enum Expansion

**Old**:
```typescript
type AgentStatus = 'idle' | 'busy' | 'failed' | 'completed';
```

**New**:
```typescript
enum AgentState {
  IDLE = 'idle',
  WORKING = 'working',
  WAITING = 'waiting',
  BLOCKED = 'blocked',
  HELPING = 'helping',
  COMPLETE = 'complete',
  ERROR = 'error'
}
```

**Migration Path**:
- `busy` → `working`
- `failed` → `error`
- `completed` → `complete`
- New states: `waiting`, `blocked`, `helping`

#### 2. Task Dependency Structure

**Old**:
```typescript
interface SwarmTask {
  dependencies: string[]; // Just task IDs
}
```

**New**:
```typescript
interface SwarmTask {
  dependencies: DependencyRequest[]; // Full dependency objects
  dependencyGraph: DependencyGraph;
}

interface DependencyRequest {
  id: string;
  requesterId: string;
  type: DependencyType;
  status: 'pending' | 'resolving' | 'resolved' | 'failed';
  requirements: {
    dataType?: string;
    expertise?: string[];
    resourceId?: string;
  };
}
```

**Migration Path**:
- Convert string IDs to full DependencyRequest objects
- Populate dependency graph from existing task relationships

#### 3. SwarmCoordinator Method Signatures

**Old**:
```typescript
assignTask(taskId: string, agentId: string): Promise<void>
```

**New**:
```typescript
assignTask(task: SwarmTask): Promise<void> // Auto-assigns via dependency resolution
requestDependency(request: DependencyRequest): Promise<string>
resolveDependency(dependencyId: string, resolution: DependencyResolution): Promise<void>
```

**Migration Path**:
- Wrap existing `assignTask` calls with compatibility layer
- Implement dependency resolution middleware

#### 4. Completion Detection

**Old**:
```typescript
// Manual checks in background workers
if (allTasksComplete) { /* ... */ }
```

**New**:
```typescript
await checkSwarmCompletion() // Returns true when all agents waiting + no pending deps
```

**Migration Path**:
- Replace manual checks with `checkSwarmCompletion()` calls
- Implement event listeners for `swarm:complete` event

---

## Backward Compatibility Strategy

### Compatibility Layer Architecture

```typescript
/**
 * Compatibility layer for V1 → V2 migration
 * Wraps V2 implementation with V1 API
 */
class SwarmCoordinatorV1Compat extends SwarmCoordinatorV2 {
  // V1 method signatures
  async assignTask(taskId: string, agentId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Task not found');

    // Convert to V2 format
    task.assignedAgent = agentId;
    await super.assignTaskV2(task);
  }

  // V1 status mapping
  getAgentStatus(agentId: string): 'idle' | 'busy' | 'failed' | 'completed' {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');

    // Map V2 states to V1
    const stateMap: Record<AgentState, string> = {
      [AgentState.IDLE]: 'idle',
      [AgentState.WORKING]: 'busy',
      [AgentState.WAITING]: 'idle',
      [AgentState.BLOCKED]: 'busy',
      [AgentState.HELPING]: 'busy',
      [AgentState.COMPLETE]: 'completed',
      [AgentState.ERROR]: 'failed'
    };

    return stateMap[agent.state] as any;
  }
}
```

### Deprecation Timeline

| Week | V1 API Status | V2 API Status | Action |
|------|---------------|---------------|--------|
| 1-4 | Fully supported | Beta | V1 wraps V2 internally |
| 5-8 | Supported + warnings | Stable | Deprecation warnings logged |
| 9-10 | Deprecated | Stable | V1 throws deprecation errors |
| 11-12 | Removed | Production | V1 code deleted |

---

## Phased Migration Plan

### Week 1-2: Foundation Layer

**Deliverables**:
- ✅ AgentState enum and state machine
- ✅ StateMachineManager implementation
- ✅ SwarmMemory schema updates
- ✅ State transition logging

**Implementation Steps**:

1. **Create State Machine Core** (`src/coordination/v2/state-machine.ts`):
```typescript
export class StateMachineManager {
  private agents: Map<string, AgentStateMachine>;
  private config: StateMachineConfig;

  async transition(
    agentId: string,
    toState: AgentState,
    reason: string
  ): Promise<StateTransition> {
    const machine = this.agents.get(agentId);
    if (!machine) throw new Error('Agent not registered');

    // Validate transition
    if (!this.canTransition(machine.currentState, toState)) {
      throw new Error(`Invalid transition: ${machine.currentState} -> ${toState}`);
    }

    // Execute transition handlers
    await this.executePreHandlers(machine.currentState, toState);

    // Update state
    const transition: StateTransition = {
      id: generateId('transition'),
      agentId,
      fromState: machine.currentState,
      toState,
      timestamp: new Date(),
      reason,
      triggeredBy: 'system'
    };

    machine.currentState = toState;
    machine.stateHistory.push(transition);

    // Execute post-transition handlers
    await this.executePostHandlers(transition);

    // Broadcast state change
    this.eventBus.emit('agent:state-change', transition);

    return transition;
  }
}
```

2. **Update SwarmMemory Schema** (`src/memory/swarm-memory.ts`):
```typescript
interface SwarmMemoryV2Schema {
  agentStates: {
    [agentId: string]: {
      currentState: AgentState;
      stateHistory: StateTransition[];
      lastUpdate: Date;
    };
  };

  dependencyGraph: {
    nodes: Map<string, DependencyNode>;
    edges: DependencyEdge[];
    pending: DependencyRequest[];
    resolved: DependencyResolution[];
  };
}
```

**Acceptance Criteria**:
- ✅ All agents can transition between valid states
- ✅ Invalid transitions throw errors
- ✅ State history persisted to SwarmMemory
- ✅ Events emitted for all state changes
- ✅ 100% test coverage on state machine

**Testing**:
```bash
npm test -- --testPathPattern=state-machine
npm test -- --testPathPattern=swarm-memory-v2
```

---

### Week 3-4: Dependency System

**Deliverables**:
- ✅ DependencyManager implementation
- ✅ Dependency graph data structure
- ✅ DAG topological sort
- ✅ Cycle detection algorithm

**Implementation Steps**:

1. **Create Dependency Manager** (`src/coordination/v2/dependency-manager.ts`):
```typescript
export class DependencyManager {
  private graph: DependencyGraph;
  private memory: SwarmMemoryV2;

  async requestDependency(request: DependencyRequest): Promise<string> {
    // Check for circular dependencies
    const wouldCreateCycle = this.detectCycle(request.requesterId, request.type);
    if (wouldCreateCycle) {
      throw new Error('Circular dependency detected');
    }

    // Add to graph
    this.graph.pendingDependencies.set(request.id, request);

    // Route based on topology
    if (this.swarmTopology === 'hierarchical') {
      await this.routeThroughCoordinator(request);
    } else {
      await this.broadcastToAllPeers(request);
    }

    // Store in memory
    await this.memory.storeDependencyRequest(request);

    return request.id;
  }

  detectCycle(requesterId: string, targetCapability: string): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      for (const dependency of this.graph.getNode(nodeId).dependencies) {
        if (!visited.has(dependency)) {
          if (dfs(dependency)) return true;
        } else if (recStack.has(dependency)) {
          return true; // Cycle detected
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    return dfs(requesterId);
  }
}
```

**Acceptance Criteria**:
- ✅ Dependency requests routed correctly (hierarchical + mesh)
- ✅ Cycle detection prevents deadlocks
- ✅ Topological sort produces valid execution order
- ✅ Dependencies stored and retrievable from memory
- ✅ 95% test coverage on dependency logic

---

### Week 5-6: Message Bus Channels

**Deliverables**:
- ✅ Specialized channels (state, dependency, task, help)
- ✅ Priority routing
- ✅ Message persistence
- ✅ Pub/Sub event system

**Implementation Steps**:

1. **Create Message Bus V2** (`src/coordination/v2/message-bus.ts`):
```typescript
export class MessageBusV2 {
  private channels: Map<string, Channel>;

  createChannel(config: ChannelConfig): Channel {
    const channel = new Channel(config);
    this.channels.set(config.name, channel);
    return channel;
  }

  async broadcast(channelName: string, message: Message): Promise<string[]> {
    const channel = this.channels.get(channelName);
    if (!channel) throw new Error('Channel not found');

    // Apply priority routing
    if (channel.config.enablePriority) {
      message.priority = this.calculatePriority(message);
    }

    // Persist if configured
    if (channel.config.persistent) {
      await this.persistMessage(message);
    }

    // Deliver to subscribers
    const deliveredTo = await channel.broadcast(message);

    return deliveredTo;
  }
}
```

**Acceptance Criteria**:
- ✅ 4 channels created (state, dependency, task, help)
- ✅ Priority routing functional
- ✅ Messages persisted and retrievable
- ✅ Delivery guarantees enforced (at-least-once, exactly-once)

---

### Week 7-8: Completion Detection

**Deliverables**:
- ✅ Hierarchical completion detector
- ✅ Mesh distributed completion (Dijkstra-Scholten)
- ✅ Deadlock detection via WFG
- ✅ Swarm shutdown protocol

**Implementation Steps**:

1. **Hierarchical Completion** (`src/coordination/v2/completion-hierarchical.ts`):
```typescript
export class HierarchicalCompletionDetector {
  async checkCompletion(): Promise<boolean> {
    // Step 1: All agents waiting or complete
    const allWaiting = this.agents.every(agent =>
      agent.state === AgentState.WAITING ||
      agent.state === AgentState.COMPLETE
    );

    if (!allWaiting) return false;

    // Step 2: No pending dependencies
    const pendingDeps = await this.dependencyManager.getPendingDependencies();
    if (pendingDeps.length > 0) return false;

    // Step 3: Task queue empty
    if (this.taskQueue.length > 0) return false;

    // Step 4: Consensus from all agents
    const consensus = await this.runConsensusProtocol();
    if (!consensus) return false;

    // All checks passed - trigger completion
    await this.initiateSwarmShutdown();
    return true;
  }
}
```

**Acceptance Criteria**:
- ✅ Completion detected when criteria met
- ✅ False positives prevented by double-check
- ✅ Deadlock detection before completion
- ✅ Swarm shutdown graceful and complete

---

### Week 9-10: Integration & Testing

**Deliverables**:
- ✅ V2 coordinator integrated with existing orchestrator
- ✅ MCP tools updated for V2 API
- ✅ Comprehensive integration tests
- ✅ Performance benchmarks

**Implementation Steps**:

1. **Update Orchestrator** (`src/core/orchestrator.ts`):
```typescript
export class Orchestrator {
  private coordinatorV2: SwarmCoordinatorV2;

  async initialize() {
    // Initialize V2 coordinator
    this.coordinatorV2 = new SwarmCoordinatorV2({
      topology: 'mesh',
      maxAgents: this.config.orchestrator.maxConcurrentAgents,
      enableCompletionDetection: true,
      enableDeadlockPrevention: true
    });

    await this.coordinatorV2.initialize();

    // Setup event bridges
    this.setupV2EventBridge();
  }

  private setupV2EventBridge() {
    this.coordinatorV2.on('agent:state-change', (transition) => {
      this.eventBus.emit('agent:status-update', {
        agentId: transition.agentId,
        status: this.mapV2StateToV1(transition.toState)
      });
    });
  }
}
```

**Acceptance Criteria**:
- ✅ Existing workflows function with V2 backend
- ✅ V1 API calls route correctly through V2
- ✅ No performance regression
- ✅ All integration tests pass

---

### Week 11-12: Hardening & Production

**Deliverables**:
- ✅ Performance optimization
- ✅ Production monitoring
- ✅ Documentation updates
- ✅ V1 code removal

**Implementation Steps**:

1. **Remove V1 Compatibility Layer**:
```typescript
// Delete src/coordination/swarm-coordinator.ts (old)
// Rename src/coordination/v2/swarm-coordinator.ts → src/coordination/swarm-coordinator.ts
```

2. **Update Documentation**:
- API reference with V2 methods
- Migration examples for users
- Troubleshooting guide

**Acceptance Criteria**:
- ✅ V1 code completely removed
- ✅ Documentation updated
- ✅ Production deployment successful
- ✅ Zero critical bugs in 2-week burn-in

---

## Code Migration Examples

### Example 1: Simple Task Assignment

**Before (V1)**:
```typescript
const task = {
  id: 'task-1',
  type: 'research',
  description: 'Research AI architectures',
  dependencies: ['task-0'] // Just IDs
};

await coordinator.assignTask(task.id, 'agent-1');
```

**After (V2)**:
```typescript
const task: SwarmTask = {
  id: 'task-1',
  type: 'research',
  description: 'Research AI architectures',
  dependencies: [{
    id: 'dep-1',
    requesterId: 'agent-1',
    type: DependencyType.DATA,
    status: 'pending',
    requirements: {
      dataType: 'research-results',
      fromTaskId: 'task-0'
    }
  }]
};

// Auto-assigns based on dependency resolution
await coordinator.assignTask(task);
```

### Example 2: Agent Help System

**Before (V1)**:
```typescript
// Manual reassignment when agent idle
if (agent.status === 'idle' && taskQueue.length > 0) {
  const task = taskQueue.shift();
  await coordinator.assignTask(task.id, agent.id);
}
```

**After (V2)**:
```typescript
// Automatic via state transitions
coordinator.on('agent:state-change', async (transition) => {
  if (transition.toState === AgentState.WAITING) {
    // Agent automatically offers help
    await coordinator.offerHelp(transition.agentId);
  }
});

// Or explicit help request
const helpRequest: HelpRequest = {
  requesterId: 'agent-1',
  capability: 'code-review',
  taskContext: 'Review authentication module',
  urgency: 'high'
};

const helperId = await coordinator.requestHelp(helpRequest);
```

### Example 3: Completion Detection

**Before (V1)**:
```typescript
// Manual checking in background worker
setInterval(() => {
  const allComplete = tasks.every(t => t.status === 'completed');
  const allIdle = agents.every(a => a.status === 'idle');

  if (allComplete && allIdle) {
    swarm.complete();
  }
}, 5000);
```

**After (V2)**:
```typescript
// Automatic detection
coordinator.on('swarm:complete', async (result) => {
  console.log('Swarm completed automatically');
  console.log('Consensus:', result.consensus);
  console.log('All agents:', result.agentStates);
});

// Or explicit check
const isComplete = await coordinator.checkSwarmCompletion();
if (isComplete) {
  // Swarm will auto-shutdown via event
}
```

---

## Testing Strategy

### Unit Tests (Per Phase)

**Phase 1 (State Machine)**:
```typescript
describe('StateMachineManager', () => {
  test('should allow valid state transitions', async () => {
    const sm = new StateMachineManager();
    await sm.registerAgent(testAgent);

    const transition = await sm.transition(
      testAgent.id,
      AgentState.WORKING,
      'Task assigned'
    );

    expect(transition.toState).toBe(AgentState.WORKING);
  });

  test('should reject invalid transitions', async () => {
    const sm = new StateMachineManager();
    await sm.registerAgent(testAgent);

    await expect(
      sm.transition(testAgent.id, AgentState.COMPLETE, 'Invalid')
    ).rejects.toThrow('Invalid transition');
  });
});
```

**Phase 2 (Dependencies)**:
```typescript
describe('DependencyManager', () => {
  test('should detect circular dependencies', () => {
    const dm = new DependencyManager();

    // Create cycle: A → B → C → A
    dm.addDependency('agent-a', 'agent-b', DependencyType.DATA);
    dm.addDependency('agent-b', 'agent-c', DependencyType.DATA);

    expect(() => {
      dm.addDependency('agent-c', 'agent-a', DependencyType.DATA);
    }).toThrow('Circular dependency detected');
  });
});
```

### Integration Tests

```typescript
describe('V2 Integration', () => {
  test('complete workflow with dependencies', async () => {
    const coordinator = new SwarmCoordinatorV2({
      topology: 'mesh',
      maxAgents: 3
    });

    await coordinator.initialize();

    // Register agents
    const agent1 = await coordinator.registerAgent('researcher', {});
    const agent2 = await coordinator.registerAgent('coder', {});

    // Create task with dependency
    const task = {
      id: 'task-1',
      type: 'code',
      dependencies: [{
        requesterId: agent2,
        type: DependencyType.DATA,
        requirements: { expertise: ['research'] }
      }]
    };

    await coordinator.assignTask(task);

    // Wait for completion
    const completed = await coordinator.waitForCompletion(60000);

    expect(completed).toBe(true);
  });
});
```

### Performance Tests

```typescript
describe('Performance Benchmarks', () => {
  test('should handle 1000 state transitions <100ms avg', async () => {
    const sm = new StateMachineManager();
    const agents = createTestAgents(100);

    const start = Date.now();

    for (let i = 0; i < 1000; i++) {
      const agent = agents[i % agents.length];
      await sm.transition(agent.id, AgentState.WORKING, 'test');
    }

    const duration = Date.now() - start;
    const avgLatency = duration / 1000;

    expect(avgLatency).toBeLessThan(100);
  });
});
```

---

## Rollback Procedures

### Rollback Decision Criteria

**Trigger rollback if**:
- Critical bugs affecting >10% of swarms
- Performance degradation >30%
- Data corruption detected
- Consensus failures >5%

### Rollback Steps

**Week 1-4 Rollback** (Foundation):
```bash
# Revert state machine commits
git revert <state-machine-commits>

# Restore V1 agent status enum
npm run migrate:restore-v1-schema

# Clear V2 memory entries
npm run clean:v2-memory
```

**Week 5-8 Rollback** (Dependencies + Messages):
```bash
# Disable V2 coordinator
export CFN_USE_V2_COORDINATOR=false

# Switch back to V1 task assignment
npm run switch-coordinator --version=v1

# Preserve dependency data for later retry
npm run backup:dependency-graph
```

**Week 9-10 Rollback** (Integration):
```bash
# Deploy previous orchestrator version
npm run deploy:orchestrator --version=1.5.19

# Disable V2 MCP tools
export CFN_ENABLE_V2_TOOLS=false

# Monitor for stabilization
npm run monitor:health --duration=24h
```

### Data Preservation During Rollback

```typescript
async function preserveV2DataDuringRollback() {
  // Export V2 state for future retry
  const v2Data = {
    agentStates: await memoryManager.exportAgentStates(),
    dependencyGraph: await dependencyManager.exportGraph(),
    completionProbes: await completionDetector.exportProbes(),
    timestamp: new Date()
  };

  await fs.writeFile(
    './rollback-data/v2-state.json',
    JSON.stringify(v2Data, null, 2)
  );

  // Convert back to V1 format
  const v1Data = convertV2ToV1(v2Data);
  await memoryManager.importV1State(v1Data);
}
```

---

## Data Migration

### SwarmMemory Schema Migration

**Step 1: Add V2 Fields (Non-Breaking)**:
```typescript
interface SwarmMemoryEntry {
  // V1 fields (existing)
  id: string;
  agentId: string;
  type: 'knowledge' | 'result' | 'state';

  // V2 fields (new, optional)
  agentState?: AgentState;
  stateTransition?: StateTransition;
  dependencyRequest?: DependencyRequest;
  dependencyResolution?: DependencyResolution;
  completionProbe?: CompletionProbeMessage;
}
```

**Step 2: Migrate Existing Data**:
```typescript
async function migrateSwarmMemoryToV2() {
  const entries = await swarmMemory.recall({ type: 'state' });

  for (const entry of entries) {
    // Convert V1 state to V2
    const v1State = entry.content.status as string;
    const v2State = mapV1StateToV2(v1State);

    // Create state transition record
    const transition: StateTransition = {
      id: generateId('migration'),
      agentId: entry.agentId,
      fromState: AgentState.IDLE,
      toState: v2State,
      timestamp: entry.timestamp,
      reason: 'Migration from V1',
      triggeredBy: 'system'
    };

    // Update entry
    await swarmMemory.remember(entry.agentId, 'state', {
      agentState: v2State,
      stateTransition: transition
    });
  }

  console.log(`Migrated ${entries.length} state entries to V2`);
}
```

**Step 3: Build Dependency Graph from Task History**:
```typescript
async function buildDependencyGraphFromHistory() {
  const tasks = await taskHistory.getAllTasks();
  const graph = new DependencyGraph();

  for (const task of tasks) {
    // Convert string dependencies to DependencyRequest objects
    for (const depTaskId of task.dependencies) {
      const depTask = tasks.find(t => t.id === depTaskId);

      if (depTask) {
        const depRequest: DependencyRequest = {
          id: generateId('dep'),
          requesterId: task.assignedAgent!,
          type: DependencyType.SEQUENCE,
          status: 'resolved',
          requirements: {
            sequenceTaskId: depTaskId
          },
          resolvedAt: depTask.completedAt
        };

        graph.addDependency(task.assignedAgent!, depTask.assignedAgent!, depRequest);
      }
    }
  }

  await swarmMemory.storeDependencyGraph(graph);
  console.log(`Built dependency graph with ${graph.edges.length} edges`);
}
```

---

## Next Steps

After completing migration:

1. **Monitor Production**: Watch metrics for 2 weeks
2. **Gather Feedback**: Collect user reports on V2 experience
3. **Optimize**: Profile and optimize hotspots
4. **Document**: Create comprehensive V2 API documentation
5. **Train**: Conduct team training on new V2 features

**Migration Support**: File issues at https://github.com/your-repo/issues with label `v2-migration`

---

**Last Updated**: 2025-10-02
**Maintained By**: Architecture Team
