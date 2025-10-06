# Phase 9: Component Interaction Diagrams

**Version**: 1.0
**Date**: 2025-10-03
**Author**: System Architect Agent
**Status**: Design Complete

---

## 1. System Architecture Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                         USER / CLIENT LAYER                           │
│                    swarmCoordinator.initialize()                      │
│                    swarmCoordinator.spawnAgent()                      │
│                    swarmCoordinator.assignTask()                      │
└───────────────────────────────────────────────────────────────────────┘
                                    ↓
┌───────────────────────────────────────────────────────────────────────┐
│                     FACADE LAYER (Phase 9)                            │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                  SwarmCoordinatorV2                             │ │
│  │  - Topology detection (hierarchical/mesh/hybrid)                │ │
│  │  - Component lifecycle management                               │ │
│  │  - Event-driven orchestration                                   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                    ↓
┌───────────────────────────────────────────────────────────────────────┐
│                  SDK RUNTIME LAYER (Phase 0)                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────────┐ │
│  │  Query      │  │  Checkpoint  │  │ Artifact  │  │ Background   │ │
│  │ Controller  │  │   Manager    │  │  Storage  │  │ Orchestrator │ │
│  │             │  │              │  │           │  │              │ │
│  │ - Spawn     │  │ - Snapshot   │  │ - Binary  │  │ - Multi-lvl  │ │
│  │ - Pause     │  │ - Rollback   │  │ - Cache   │  │ - Process    │ │
│  │ - Resume    │  │ - Recovery   │  │ - Compress│  │ - Monitor    │ │
│  └─────────────┘  └──────────────┘  └───────────┘  └──────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                    ↓
┌───────────────────────────────────────────────────────────────────────┐
│               CORE INFRASTRUCTURE LAYER (Phases 1-4)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   State     │  │ Dependency   │  │   Message    │  │Completion │ │
│  │  Machine    │  │    Graph     │  │    Broker    │  │ Detector  │ │
│  │             │  │              │  │              │  │           │ │
│  │ - 7 states  │  │ - DAG        │  │ - 4 channels │  │ - Hier    │ │
│  │ - Trans     │  │ - Cycles     │  │ - Routing    │  │ - Mesh    │ │
│  │ - Validate  │  │ - Topo sort  │  │ - Pub/sub    │  │ - Event   │ │
│  └─────────────┘  └──────────────┘  └──────────────┘  └───────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                    ↓
┌───────────────────────────────────────────────────────────────────────┐
│          COORDINATION PATTERNS LAYER (Phases 5-6)                     │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐│
│  │  Hierarchical Coordinator     │  │     Mesh Network              ││
│  │                               │  │                               ││
│  │  - PM-worker pattern          │  │  - Peer discovery             ││
│  │  - Parent-child mgmt          │  │  - Byzantine consensus        ││
│  │  - Cascading shutdown         │  │  - Partition healing          ││
│  │  - 20+ agent scale            │  │  - 10+ peer coordination      ││
│  └───────────────────────────────┘  └───────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘
                                    ↓
┌───────────────────────────────────────────────────────────────────────┐
│              SUPPORT SYSTEMS LAYER (Phases 7-8)                       │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐│
│  │     Help Coordinator          │  │   Deadlock Detector           ││
│  │                               │  │                               ││
│  │  - Capability matching        │  │  - WFG cycle detection        ││
│  │  - Zero-cost waiting pool     │  │  - Checkpoint rollback        ││
│  │  - <100ms routing             │  │  - Resource ordering          ││
│  │  - Event-driven resume        │  │  - <500ms detection           ││
│  └───────────────────────────────┘  └───────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘
                                    ↓
┌───────────────────────────────────────────────────────────────────────┐
│                     STORAGE LAYER (Phase 0)                           │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │              SwarmMemory (Persistent State)                   │   │
│  │  - Agent states, checkpoints, artifacts, messages             │   │
│  │  - SQLite backend with indexed queries                        │   │
│  └───────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. Event-Driven Message Flow

```
┌───────────────────────────────────────────────────────────────────────┐
│                    MESSAGE BROKER (Phase 3)                           │
│                    4 Channels: task | coordination | event | help     │
└───────────────────────────────────────────────────────────────────────┘
                      ↓            ↓            ↓            ↓
          ┌───────────┴────┬───────┴────┬──────┴──────┬─────┴────────┐
          │                │            │             │              │
    ┌─────▼─────┐   ┌─────▼─────┐ ┌───▼────┐  ┌────▼─────┐  ┌────▼─────┐
    │   Task    │   │ Coord     │ │ Event  │  │   Help   │  │  Dead    │
    │  Channel  │   │ Channel   │ │Channel │  │ Channel  │  │  Letter  │
    │           │   │           │ │        │  │          │  │  Queue   │
    │ - Assign  │   │ - State   │ │- Error │  │- Request │  │- Failed  │
    │ - Complete│   │ - Depend  │ │- Metric│  │- Matched │  │- Retry   │
    └───────────┘   └───────────┘ └────────┘  └──────────┘  └──────────┘
          │                │            │             │              │
          └────────────────┴────────────┴─────────────┴──────────────┘
                                    ↓
          ┌────────────────────────────────────────────────────────────┐
          │              TOPIC MANAGER (Pub/Sub Routing)               │
          │  - task:assigned       → StateMachine, ResourceTracker     │
          │  - task:completed      → DependencyGraph, CompletionDetect │
          │  - state:changed       → CheckpointManager, Metrics        │
          │  - dependency:satisfied→ TaskScheduler, MessageBroker      │
          │  - help:requested      → HelpMatcher, WaitingAgentPool     │
          │  - deadlock:detected   → DeadlockResolver, Metrics         │
          └────────────────────────────────────────────────────────────┘
```

---

## 3. Task Assignment Flow (Cross-Component)

```
USER: swarmCoordinator.assignTask(agentId, task)
  │
  └─→ SwarmCoordinatorV2.assignTask()
       │
       ├─→ [1] DependencyGraph.isReady(task.id)
       │   │
       │   ├─→ Query: All dependencies satisfied?
       │   │   ├─→ YES → Continue
       │   │   └─→ NO  → Throw DependencyError
       │   │
       │   └─→ Event: dependency:checked
       │
       ├─→ [2] ResourceOrderingManager.validateAcquisition(agentId, task.id)
       │   │
       │   ├─→ Check: Resource ordering violations?
       │   │   ├─→ NO  → Continue
       │   │   └─→ YES → Throw OrderingViolation
       │   │
       │   └─→ Event: resource:validated
       │
       ├─→ [3] MessageBroker.publish('task', event)
       │   │
       │   ├─→ MessageRouter: Route to 'task' channel
       │   ├─→ TopicManager: Notify subscribers
       │   │   │
       │   │   ├─→ Subscriber: StateMachine
       │   │   ├─→ Subscriber: ResourceTracker
       │   │   └─→ Subscriber: Metrics
       │   │
       │   └─→ Event: task:assigned
       │
       └─→ [4] StateMachine.transition(agentId, 'WORKING')
           │
           ├─→ StateTransition: Validate READY → WORKING
           │   ├─→ Valid?   → Continue
           │   └─→ Invalid? → Throw StateError
           │
           ├─→ Event: state:changed
           │
           └─→ CheckpointManager.createCheckpoint(agentId, 'state_transition')
               │
               ├─→ Serialize: Agent state to MessagePack
               ├─→ Compress: gzip (60% reduction)
               ├─→ Store: ArtifactStorage.store(checkpointId, data)
               │
               └─→ Event: checkpoint:created

RESULT:
- Task assigned to agent via MessageBroker
- Agent transitioned to WORKING state
- Checkpoint created for recovery
- All subscribers notified (ResourceTracker, Metrics, etc.)
```

---

## 4. Help Request Flow (Multi-Component)

```
TRIGGER: Agent-A encounters blocker, requests help
  │
  └─→ [1] Agent-A: messageBroker.publish('help', event)
       │
       └─→ Event: help:requested
           │
           ├─→ Payload: {
           │     requester: 'agent-a',
           │     capability: 'rust-expert',
           │     priority: 8,
           │     timeout: 30000,
           │   }
           │
           └─→ TopicManager: Route to HelpCoordinator

[2] HelpCoordinator receives event
  │
  ├─→ HelpMatcher.findHelper({ capability: 'rust-expert', timeout: 100 })
  │   │
  │   ├─→ Query agent registry for capabilities
  │   ├─→ Filter by availability (not WORKING)
  │   ├─→ Rank by capability score
  │   │
  │   └─→ Result: 'agent-b' (match found in 15ms)
  │
  ├─→ [3] StateMachine.transition('agent-a', 'WAITING')
  │   │
  │   ├─→ Event: state:changed
  │   │
  │   └─→ CheckpointManager.createCheckpoint('agent-a', 'waiting_for_help')
  │
  ├─→ [4] WaitingAgentPool.pause('agent-a')
  │   │
  │   └─→ QueryController.pauseAgent('agent-a')
  │       │
  │       ├─→ SDK: query.interrupt(sessionId)
  │       ├─→ Validate: Token usage = 0 (paused)
  │       │
  │       └─→ Event: agent:paused
  │
  ├─→ [5] WaitingAgentPool.resume('agent-b')
  │   │
  │   ├─→ QueryController.resumeAgent('agent-b')
  │   │   │
  │   │   ├─→ SDK: resumeSessionAt(sessionId, messageUUID)
  │   │   ├─→ Latency: 0.02ms (Phase 7 validated)
  │   │   │
  │   │   └─→ Event: agent:resumed
  │   │
  │   └─→ StateMachine.transition('agent-b', 'HELPING')
  │
  └─→ [6] MessageBroker.publish('help', event)
      │
      └─→ Event: help:matched
          │
          └─→ Payload: {
                requester: 'agent-a',
                helper: 'agent-b',
                matchTime: 15, // ms
              }

RESULT:
- Agent-A paused (zero token cost)
- Agent-B resumed (<50ms) to help
- State transitions recorded
- Checkpoints created for recovery
```

---

## 5. Deadlock Detection & Recovery Flow

```
[Phase 8] DeadlockDetector (periodic scan every 100ms)
  │
  ├─→ [1] Timer trigger (100ms interval)
  │
  └─→ [2] Build Wait-For-Graph
       │
       ├─→ ResourceTracker.getAllocations()
       │   │
       │   └─→ Returns: {
       │         'agent-x': ['resource-1'],
       │         'agent-y': ['resource-2'],
       │       }
       │
       ├─→ ResourceTracker.getWaitQueues()
       │   │
       │   └─→ Returns: {
       │         'resource-2': ['agent-x'], // X waits for resource-2
       │         'resource-1': ['agent-y'], // Y waits for resource-1
       │       }
       │
       └─→ WFG: agent-x → agent-y → agent-x (CYCLE!)

[3] DependencyGraph.detectCycles(wfg)
  │
  ├─→ Reuse Tarjan's algorithm from Phase 2
  │
  └─→ Returns: [
        { agents: ['agent-x', 'agent-y'], resources: ['resource-1', 'resource-2'] }
      ]

[4] Validate true deadlock
  │
  ├─→ Check: Cycle stable for 2+ consecutive scans?
  ├─→ Check: No timeout expiring soon?
  └─→ Result: TRUE (deadlock confirmed)

[5] Event: deadlock:detected
  │
  └─→ DeadlockResolver receives event

[6] DeadlockResolver.resolve(deadlock)
  │
  ├─→ [6a] Select victim (priority-based)
  │   │
  │   └─→ Victim: 'agent-y' (lowest priority)
  │
  ├─→ [6b] CheckpointManager.getLatestCheckpoint('agent-y', beforeDeadlock)
  │   │
  │   └─→ Returns: checkpoint-789 (created 500ms ago)
  │
  ├─→ [6c] QueryController.pauseAgent('agent-y')
  │   │
  │   └─→ SDK: query.interrupt(sessionId)
  │
  ├─→ [6d] CheckpointManager.rollback('agent-y', 'checkpoint-789')
  │   │
  │   ├─→ ArtifactStorage.retrieve('checkpoint-789')
  │   ├─→ Decompress: gunzip(data)
  │   ├─→ Deserialize: msgpack.decode(data)
  │   ├─→ Restore: Agent state to pre-deadlock
  │   │
  │   └─→ Latency: 150ms (within <500ms target)
  │
  ├─→ [6e] ResourceTracker.releaseResources('agent-y')
  │   │
  │   ├─→ Free: resource-2 (held by agent-y)
  │   │
  │   └─→ Event: resource:released
  │       │
  │       └─→ Agent-X can now acquire resource-2 (deadlock broken!)
  │
  ├─→ [6f] QueryController.resumeAgent('agent-y', { retryCurrentTask: true })
  │   │
  │   └─→ SDK: resumeSessionAt(sessionId, messageUUID)
  │
  └─→ [6g] Event: deadlock:resolved
      │
      └─→ Payload: {
            victim: 'agent-y',
            recoveryTime: 250, // ms
            rollbackState: 'checkpoint-789',
          }

RESULT:
- Deadlock detected in 100ms (periodic scan)
- Victim selected (agent-y)
- State rolled back via checkpoint (150ms)
- Resources released (deadlock broken)
- Agent resumed with retry (total recovery: 250ms)
```

---

## 6. Swarm Completion Detection Flow

```
TRIGGER: Agent-N completes final task
  │
  └─→ [1] MessageBroker.publish('task', event)
       │
       └─→ Event: task:completed
           │
           ├─→ Payload: {
           │     agentId: 'agent-n',
           │     taskId: 'task-final',
           │     result: { ... },
           │   }
           │
           └─→ Subscribers notified

[2] StateMachine receives event
  │
  └─→ StateMachine.transition('agent-n', 'COMPLETED')
      │
      └─→ Event: state:changed

[3] DependencyGraph receives event
  │
  ├─→ DependencyGraph.markComplete('task-final')
  │
  └─→ Check: Any dependent tasks?
      ├─→ YES → Unblock dependent tasks
      └─→ NO  → Continue

[4] CompletionDetector receives event
  │
  └─→ IF topology === 'hierarchical':
      │
      ├─→ HierarchicalDetector.isComplete()
      │   │
      │   ├─→ Query: PM state === 'COMPLETED'?
      │   ├─→ Query: All workers state === 'COMPLETED'?
      │   │
      │   └─→ Result: true (all agents done)
      │
      └─→ Event: swarm:completed

[5] SwarmCoordinatorV2 receives swarm:completed
  │
  └─→ SwarmCoordinatorV2.shutdown()
      │
      ├─→ [5a] HierarchicalCoordinator.cascadeShutdown()
      │   │
      │   ├─→ DFS traversal: Leaves → Root
      │   │   │
      │   │   ├─→ Shutdown: worker-1
      │   │   ├─→ Shutdown: worker-2
      │   │   ├─→ ...
      │   │   └─→ Shutdown: PM (last)
      │   │
      │   └─→ Latency: <1s for 20 agents
      │
      ├─→ [5b] QueryController.terminateAll()
      │   │
      │   └─→ SDK: Close all sessions
      │
      ├─→ [5c] CheckpointManager.finalCheckpoint()
      │   │
      │   ├─→ Snapshot: All agent states
      │   ├─→ Compress: 60% reduction
      │   │
      │   └─→ Store: ArtifactStorage.store('final-checkpoint', data)
      │
      ├─→ [5d] ArtifactStorage.flush()
      │   │
      │   └─→ Write: Pending cache to disk
      │
      └─→ [5e] MessageBroker.stop()
          │
          └─→ Close: All channels, cleanup subscriptions

RESULT:
- Swarm completion detected (hierarchical pattern)
- Graceful cascading shutdown (DFS: leaves → root)
- Final checkpoint created (all agents)
- Artifacts flushed to disk
- Message bus stopped
- Clean termination
```

---

## 7. Topology Selection Logic

```
USER: swarmCoordinator.initialize(config)
  │
  └─→ SwarmCoordinatorV2.detectTopology(config)
       │
       ├─→ IF config.topology specified:
       │   └─→ Use: config.topology (user override)
       │
       └─→ ELSE auto-detect:
           │
           ├─→ IF config.maxAgents <= 7:
           │   │
           │   ├─→ Topology: 'mesh'
           │   │
           │   └─→ Reason: Mesh optimal for small peer groups
           │       - Peer-to-peer coordination
           │       - Byzantine consensus (f+1 quorum)
           │       - No central coordinator overhead
           │
           ├─→ ELSE IF config.maxAgents >= 20:
           │   │
           │   ├─→ Topology: 'hierarchical'
           │   │
           │   └─→ Reason: Hierarchical scales to 20+ agents
           │       - PM delegates to workers
           │       - Multi-level nesting (10+ levels)
           │       - Centralized task assignment
           │
           └─→ ELSE (8-19 agents):
               │
               ├─→ Topology: 'hybrid'
               │
               └─→ Reason: Hybrid adapts dynamically
                   - PM coordinates high-level tasks
                   - Workers collaborate via mesh
                   - Best of both patterns

INITIALIZATION BY TOPOLOGY:

IF topology === 'hierarchical':
  ├─→ HierarchicalCoordinator.initialize()
  ├─→ HierarchicalDetector.start()
  ├─→ ParentChildManager.trackHierarchy()
  └─→ CascadingShutdown.register()

IF topology === 'mesh':
  ├─→ MeshNetwork.initialize()
  ├─→ MeshDetector.start()
  ├─→ DistributedConsensus.start()
  └─→ SwarmShutdown.register()

IF topology === 'hybrid':
  ├─→ HierarchicalCoordinator.initialize()
  ├─→ MeshNetwork.initialize()
  ├─→ BOTH detectors active
  └─→ Dynamic routing based on workload
```

---

## 8. Error Propagation & Recovery

```
ERROR HIERARCHY:

CRITICAL (SDKRuntimeError):
  ├─→ QueryController failure → Cannot spawn agents
  ├─→ CheckpointManager failure → Cannot recover state
  └─→ ArtifactStorage failure → Cannot persist data

  RECOVERY:
  ├─→ Attempt component restart
  ├─→ IF restart fails → Graceful shutdown
  └─→ Preserve state via emergency checkpoint

HIGH (CoordinatorError):
  ├─→ HierarchicalCoordinator failure → PM stuck
  ├─→ MeshNetwork failure → Peers partitioned
  └─→ CascadingShutdown failure → Orphaned agents

  RECOVERY:
  ├─→ Checkpoint all agents
  ├─→ Force-terminate stuck agents
  ├─→ Retry with timeout (30s)
  └─→ IF retry fails → Force shutdown

MEDIUM (ComponentError):
  ├─→ HelpCoordinator failure → Help requests stuck
  ├─→ DeadlockDetector failure → Deadlocks undetected
  └─→ MessageBroker channel failure → Events lost

  RECOVERY:
  ├─→ Restart component
  ├─→ Replay missed events from DeadLetterQueue
  ├─→ Emit warning event
  └─→ Continue operations (degraded mode)

LOW (AgentError):
  ├─→ Agent task failure → Single agent stuck
  ├─→ Agent state transition failure → Invalid state
  └─→ Agent checkpoint failure → State loss risk

  RECOVERY:
  ├─→ Rollback to last checkpoint
  ├─→ Retry task (max 3 attempts)
  ├─→ IF retry fails → Mark agent as failed
  └─→ Redistribute tasks to healthy agents

ERROR PROPAGATION FLOW:

Agent Exception
  ↓
StateMachine.transition(agentId, 'ERROR')
  ↓
Event: state:changed (state = ERROR)
  ↓
SwarmCoordinatorV2.handleAgentError(agentId)
  ↓
CheckpointManager.createCheckpoint(agentId, 'error-state')
  ↓
IF retries < 3:
  ├─→ CheckpointManager.rollback(agentId, 'pre-error')
  └─→ MessageBroker.publish('task', { type: 'task:retry', agentId })
ELSE:
  ├─→ StateMachine.transition(agentId, 'COMPLETED') // Mark failed
  └─→ MessageBroker.publish('event', { type: 'agent:failed', agentId })
```

---

## 9. Performance Optimization Points

```
OPTIMIZATION 1: Session Pool (50+ Agents in <2s)
┌────────────────────────────────────────────────────────────┐
│  QueryController.initialize()                              │
│  ├─→ Pre-warm 10 sessions in parallel                      │
│  └─→ SessionPool: [session-1, session-2, ..., session-10] │
│                                                            │
│  QueryController.spawnAgent()                              │
│  ├─→ Pop session from pool (if available)                  │
│  ├─→ Fork from pooled session (pointer-based)              │
│  └─→ Latency: 40ms (vs 200ms creating from scratch)       │
│                                                            │
│  Result: 50 agents spawned in 2s (20 in parallel batches) │
└────────────────────────────────────────────────────────────┘

OPTIMIZATION 2: Artifact Cache (<12ms p95)
┌────────────────────────────────────────────────────────────┐
│  ArtifactStorage.store(key, data)                          │
│  ├─→ Write to LRU cache (in-memory, <1ms)                  │
│  ├─→ Batch disk write (async, non-blocking)                │
│  └─→ Flush every 100ms or 10 items                         │
│                                                            │
│  ArtifactStorage.retrieve(key)                             │
│  ├─→ Check LRU cache first (<1ms)                          │
│  ├─→ IF miss → Read from disk + decompress (<12ms)        │
│  └─→ Warm cache for future reads                           │
│                                                            │
│  Result: 95% cache hits, <12ms p95 latency                │
└────────────────────────────────────────────────────────────┘

OPTIMIZATION 3: Query Control Overhead (<5% Tokens)
┌────────────────────────────────────────────────────────────┐
│  QueryController.pauseAgent(agentId)                       │
│  ├─→ SDK: query.interrupt(sessionId)                       │
│  ├─→ Measure: Tokens before = 1000, after = 1000           │
│  └─→ Token cost: 0 (instant pause)                         │
│                                                            │
│  QueryController.resumeAgent(agentId)                      │
│  ├─→ SDK: resumeSessionAt(sessionId, messageUUID)          │
│  ├─→ Resume from checkpoint (no context replay)            │
│  └─→ Overhead: 50 tokens (context injection)               │
│                                                            │
│  Total overhead: 50 / 10000 = 0.5% (well below 5%)        │
└────────────────────────────────────────────────────────────┘

OPTIMIZATION 4: Checkpoint Compression (60% Reduction)
┌────────────────────────────────────────────────────────────┐
│  CheckpointManager.createCheckpoint(agentId, label)        │
│  ├─→ Serialize: JSON → MessagePack (40% smaller)           │
│  ├─→ Compress: MessagePack → gzip (50% smaller)            │
│  └─→ Combined: 60%+ reduction                              │
│                                                            │
│  Example:                                                  │
│  ├─→ Original JSON: 10KB                                   │
│  ├─→ MessagePack: 6KB (40% reduction)                      │
│  └─→ gzip: 4KB (60% total reduction)                       │
│                                                            │
│  Benefit: 60% less storage, 60% faster I/O                │
└────────────────────────────────────────────────────────────┘
```

---

## 10. Integration Testing Workflow

```
TEST SUITE: Hierarchical Workflow (20 agents, 3 levels)

┌────────────────────────────────────────────────────────────┐
│  Step 1: Initialize SwarmCoordinatorV2                     │
│  ├─→ Topology: 'hierarchical'                              │
│  ├─→ MaxAgents: 20                                         │
│  └─→ Expected: All components initialized (<5s)            │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  Step 2: Spawn Agent Hierarchy                             │
│  ├─→ Level 0: PM (1 agent)                                 │
│  ├─→ Level 1: Workers (10 agents, children of PM)          │
│  ├─→ Level 2: Sub-workers (9 agents, children of workers)  │
│  └─→ Expected: All 20 agents spawned in <2s                │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  Step 3: Assign Tasks via PM                               │
│  ├─→ PM assigns 10 tasks to workers                        │
│  ├─→ Workers assign subtasks to sub-workers                │
│  └─→ Expected: All tasks assigned, state = WORKING         │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  Step 4: Monitor Task Completion                           │
│  ├─→ Sub-workers complete subtasks                         │
│  ├─→ Workers complete tasks (dependent on sub-workers)     │
│  ├─→ PM receives completion reports from workers           │
│  └─→ Expected: All tasks completed within 60s timeout      │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  Step 5: Verify Completion Detection                       │
│  ├─→ HierarchicalDetector.isComplete() → TRUE              │
│  ├─→ PM state = COMPLETED                                  │
│  ├─→ All workers state = COMPLETED                         │
│  └─→ Expected: Swarm completion detected                   │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  Step 6: Graceful Shutdown                                 │
│  ├─→ CascadingShutdown: DFS traversal (leaves → root)      │
│  ├─→ QueryController.terminateAll()                        │
│  ├─→ CheckpointManager.finalCheckpoint()                   │
│  └─→ Expected: Clean shutdown, no orphaned sessions        │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  Assertions:                                               │
│  ✅ All 20 agents spawned successfully                     │
│  ✅ Hierarchical parent-child relationships correct         │
│  ✅ All tasks assigned and completed                        │
│  ✅ Completion detection accurate                           │
│  ✅ Graceful shutdown with no errors                        │
│  ✅ Final checkpoint created with all agent states          │
└────────────────────────────────────────────────────────────┘
```

---

## Confidence Score: 0.92 (92%)

**Blockers**: NONE

**Next Steps**: Proceed to Sprint 9.1 implementation (SwarmCoordinatorV2 facade + core integration)
