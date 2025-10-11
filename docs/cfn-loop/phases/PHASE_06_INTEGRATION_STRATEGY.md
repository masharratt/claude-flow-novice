# Phase 6: Mesh Coordination Integration Strategy

**Version**: 1.0
**Date**: 2025-10-03
**Dependencies**: Phase 1-5 Complete
**Status**: Integration Planning

---

## Integration Overview

Phase 6 mesh coordination **extends** the existing topology selection framework found in `src/coordination/index.ts`. The current implementation already provides:

1. **Topology selection logic** (`selectOptimalTopology`)
2. **Factory pattern** (`createTopologyCoordinator`)
3. **MeshCoordinator interface** (exported from `../agents/mesh-coordinator.js`)

**Phase 6 deliverables**:
- Implement missing MeshCoordinator methods (currently skeleton)
- Add PeerDiscoverySystem, DistributedCompletionDetector, MeshLoadBalancer
- Integrate SDK query control for peer pause/resume
- Extend MessageBroker for P2P communication

---

## Current System Analysis

### Existing Topology Router (src/coordination/index.ts)

```typescript
// EXISTING CODE (Lines 120-273)
export type TopologyType = 'mesh' | 'hierarchical' | 'hybrid';

export async function createTopologyCoordinator(
  config: CoordinationTopologyConfig,
  dependencies: { memory, broker, dependencyGraph, logger, rbacManager }
): Promise<TopologyCoordinator> {
  const effectiveTopology = selectOptimalTopology(config.topology, config.maxAgents);

  if (effectiveTopology === 'hierarchical') {
    coordinator = new QueenAgent(...); // Phase 5 implementation
  } else if (effectiveTopology === 'mesh') {
    coordinator = createMeshCoordinator(config.mesh); // NEEDS FULL IMPLEMENTATION
  } else {
    throw new Error('Hybrid topology not yet implemented');
  }

  return { topology, coordinator, consensus, initialize, shutdown };
}

function selectOptimalTopology(requested: TopologyType, maxAgents: number): TopologyType {
  // Mesh optimal for 2-7 agents
  // Hierarchical optimal for 8+ agents
  if (requested === 'mesh' && maxAgents > 7) {
    console.warn(`Mesh topology requested for ${maxAgents} agents...`);
  }
  return requested; // Honor explicit request
}
```

**Integration Point**: `createMeshCoordinator` needs full implementation to match architecture spec.

### Existing MeshCoordinator Skeleton

Current location: `src/agents/mesh-coordinator.js` (referenced in index.ts:113)

**Status**: Exported but needs implementation of:
- Peer discovery protocol
- Distributed completion detection
- Load balancing
- Query control integration
- Artifact-based state sharing

---

## Integration Points by Component

### 1. MeshCoordinator Implementation

**File**: `src/coordination/v2/coordinators/mesh-coordinator.ts` (new)

**Integration**:
```typescript
import { ICoordinator, Agent, AgentSpawnConfig, Checkpoint } from '../interfaces/ICoordinator.js';
import { MessageBroker } from '../core/message-broker.js'; // Phase 3
import { AgentState } from '../types/sdk.js'; // Phase 1
import { QueryController } from '../sdk/query-controller.js'; // SDK integration
import { ArtifactStorage } from '../sdk/artifact-storage.js'; // SDK artifacts

export class MeshCoordinator implements ICoordinator {
  private messageBus: MessageBroker; // Reuse Phase 3
  private queryController: QueryController; // SDK pause/resume
  private artifactStorage: ArtifactStorage; // SDK state sharing

  // Implement ICoordinator interface methods
  async spawnAgent(config: AgentSpawnConfig): Promise<Agent> {
    // Implementation using SDK session forking
  }

  async pauseAgent(agentId: string, reason?: string): Promise<void> {
    // Delegate to QueryController
    await this.queryController.pauseAgent(agentId);
  }

  async resumeAgent(agentId: string, checkpointId?: string): Promise<void> {
    // Delegate to QueryController
    await this.queryController.resumeAgent(agentId, checkpointId);
  }

  // Additional mesh-specific methods
  async assignTaskToPeer(task: Task): Promise<string> { /* ... */ }
  async waitForMeshCompletion(): Promise<boolean> { /* ... */ }
}
```

**Export Update** (src/coordination/index.ts):
```typescript
// Replace skeleton export with full implementation
export { MeshCoordinator } from './v2/coordinators/mesh-coordinator.js';
```

### 2. PeerDiscoverySystem Integration

**File**: `src/coordination/v2/coordinators/mesh/peer-discovery.ts` (new)

**Dependencies**:
```typescript
import { MessageBroker } from '../../core/message-broker.js'; // Phase 3
import { ArtifactStorage } from '../../sdk/artifact-storage.js'; // SDK
```

**MessageBroker Extension** (src/coordination/v2/core/message-broker.ts):
```typescript
export class MessageBroker {
  // EXISTING: publish, subscribe, unsubscribe (Phase 3)

  // NEW: P2P mesh messaging
  async sendToPeer(senderId: string, recipientId: string, message: Message): Promise<void> {
    await this.publish(`peer:${recipientId}`, {
      ...message,
      senderId,
      recipientId,
      routingType: 'p2p',
      timestamp: Date.now()
    });
  }

  async broadcastToMesh(senderId: string, neighbors: string[], message: Message): Promise<void> {
    await Promise.all(
      neighbors.map(neighborId => this.sendToPeer(senderId, neighborId, message))
    );
  }

  // Existing methods remain unchanged
}
```

### 3. DistributedCompletionDetector Integration

**File**: `src/coordination/v2/coordinators/mesh/distributed-completion.ts` (new)

**Dependencies**:
```typescript
import { MessageBroker } from '../../core/message-broker.js'; // Phase 3
import { AgentState } from '../../types/sdk.js'; // Phase 1
```

**CompletionDetector Extension** (Phase 4 integration):
```typescript
// EXISTING: src/coordination/v2/completion/completion-detector.ts
export class CompletionDetector {
  // EXISTING: detectCompletion (hierarchical pattern)
}

// NEW: Distributed variant for mesh
export class DistributedCompletionDetector extends CompletionDetector {
  // Dijkstra-Scholten algorithm implementation
  async detectCompletion(swarmId: string): Promise<boolean> {
    // Uses MessageBroker for probe/ack protocol
    // Extends base CompletionDetector with distributed logic
  }
}
```

### 4. MeshLoadBalancer Integration

**File**: `src/coordination/v2/coordinators/mesh/load-balancer.ts` (new)

**Dependencies**:
```typescript
import { ArtifactStorage } from '../../sdk/artifact-storage.js'; // SDK
```

**WorkStealingCoordinator Integration** (existing):
```typescript
// EXISTING: src/coordination/work-stealing.ts
export class WorkStealingCoordinator {
  // Used by hierarchical topology
}

// NEW: Mesh variant
export class MeshLoadBalancer {
  async selectLeastLoadedPeer(candidates: string[]): Promise<string> {
    // Mesh-specific load balancing
    // Can delegate to WorkStealingCoordinator logic if needed
  }

  async rebalance(swarmId: string): Promise<void> {
    // Mesh-specific rebalancing using artifact-based load sharing
  }
}
```

### 5. SwarmMemory Integration

**File**: `src/memory/swarm-memory.ts` (extend existing)

**New Methods**:
```typescript
export class SwarmMemoryManager {
  // EXISTING: remember, recall, shareMemory, broadcastMemory

  // NEW: Mesh peer state sharing
  async sharePeerState(peerId: string, state: PeerState): Promise<void> {
    await this.remember(peerId, 'state', state, {
      shareLevel: 'team',
      tags: ['mesh', 'peer-state'],
      metadata: { topology: 'mesh', peerId }
    });
  }

  async queryMeshPeers(swarmId: string): Promise<PeerState[]> {
    const entries = await this.recall({
      tags: ['mesh', 'peer-state'],
      shareLevel: 'team'
    });

    return entries.map(entry => entry.content as PeerState);
  }
}
```

### 6. Query Controller Integration

**File**: `src/coordination/v2/sdk/query-controller.ts` (extend existing)

**New Methods for Mesh**:
```typescript
export class QueryController {
  // EXISTING: pauseAgent, resumeAgent, getAgentState

  // NEW: Batch pause/resume for mesh
  async pausePeers(peerIds: string[], reason?: string): Promise<void> {
    await Promise.all(
      peerIds.map(peerId => this.pauseAgent(peerId, reason))
    );
  }

  async resumePeers(peerIds: string[]): Promise<void> {
    await Promise.all(
      peerIds.map(peerId => this.resumeAgent(peerId))
    );
  }

  // NEW: Token savings tracking for mesh idle periods
  getTokenSavings(agentId: string): { saved: number; total: number; percentage: number } {
    // Calculate token savings from pause periods
  }
}
```

---

## Implementation Sequence

### Step 1: Implement MeshCoordinator Core (Days 1-2)

**Files**:
- `src/coordination/v2/coordinators/mesh-coordinator.ts`
- `src/coordination/v2/coordinators/mesh/peer-agent.ts`

**Dependencies**: ICoordinator interface, SDK QueryController

**Deliverables**:
- MeshCoordinator class implementing ICoordinator
- spawnAgent, pauseAgent, resumeAgent, terminateAgent methods
- Basic peer management (spawn, track, cleanup)

**Tests**:
- `tests/coordination/v2/unit/mesh-coordinator.test.ts`
- Validate ICoordinator interface compliance

### Step 2: Implement PeerDiscoverySystem (Day 2)

**Files**:
- `src/coordination/v2/coordinators/mesh/peer-discovery.ts`

**Dependencies**: MessageBroker (Phase 3), ArtifactStorage (SDK)

**Deliverables**:
- Peer discovery protocol (broadcast/announce)
- Capability matching engine
- Artifact-based state sharing

**Tests**:
- `tests/coordination/v2/unit/peer-discovery.test.ts`
- Discovery latency benchmark (<30s for 10 peers)

### Step 3: Implement DistributedCompletionDetector (Days 3-4)

**Files**:
- `src/coordination/v2/coordinators/mesh/distributed-completion.ts`

**Dependencies**: MessageBroker (Phase 3), CompletionDetector (Phase 4)

**Deliverables**:
- Dijkstra-Scholten algorithm implementation
- Deficit counter tracking
- Completion probe protocol

**Tests**:
- `tests/coordination/v2/unit/distributed-completion.test.ts`
- Performance validation (<2000ms for 10 agents)

### Step 4: Implement MeshLoadBalancer (Day 4)

**Files**:
- `src/coordination/v2/coordinators/mesh/load-balancer.ts`

**Dependencies**: ArtifactStorage (SDK)

**Deliverables**:
- Least-loaded peer selection
- Load tracking and rebalancing
- Work redistribution protocol

**Tests**:
- `tests/coordination/v2/unit/load-balancer.test.ts`
- Load distribution fairness validation

### Step 5: Integration & Query Control (Days 5-6)

**Files**:
- Extend `src/coordination/v2/sdk/query-controller.ts`
- Extend `src/coordination/v2/core/message-broker.ts`
- Extend `src/memory/swarm-memory.ts`

**Deliverables**:
- Batch pause/resume for mesh peers
- P2P messaging extensions
- Mesh peer state sharing in SwarmMemory

**Tests**:
- `tests/coordination/v2/integration/mesh-integration.test.ts`
- Token savings validation (50-75% reduction during idle)

### Step 6: Performance Optimization & Validation (Day 7)

**Files**:
- Performance benchmarking suite
- Documentation updates

**Deliverables**:
- All performance targets validated
- Migration guide published
- API reference documentation

**Tests**:
- `tests/coordination/v2/performance/mesh-performance.test.ts`
- Full integration test with all Phase 1-5 components

---

## Backward Compatibility Checklist

### No Breaking Changes

- ✅ Phase 1 (StateMachine): Reused as-is, no modifications
- ✅ Phase 2 (DependencyGraph): Reused as-is, no modifications
- ✅ Phase 3 (MessageBroker): Extended with new methods (additive only)
- ✅ Phase 4 (CompletionDetector): Extended with DistributedCompletionDetector subclass
- ✅ Phase 5 (HierarchicalCoordinator): Unchanged, remains default for 8+ agents

### API Compatibility

```typescript
// EXISTING API (Phase 5) - STILL WORKS
const coordinator = await CoordinatorFactory.create({
  mode: 'sdk',
  maxConcurrentAgents: 8
}); // Creates HierarchicalCoordinator automatically

// NEW API (Phase 6) - ADDITIVE
const meshCoordinator = await CoordinatorFactory.createWithTopology({
  mode: 'sdk',
  topology: 'mesh',
  maxConcurrentAgents: 5
}); // Creates MeshCoordinator explicitly

// AUTO-SELECTION (Recommended)
const autoCoordinator = await CoordinatorFactory.createWithTopology({
  mode: 'sdk',
  topology: 'auto', // Auto-selects based on agent count
  maxConcurrentAgents: 5
}); // Creates MeshCoordinator for ≤7 agents
```

---

## Testing Strategy

### Unit Tests (Target: >90% coverage)

**Files**:
- `tests/coordination/v2/unit/mesh-coordinator.test.ts`
- `tests/coordination/v2/unit/peer-discovery.test.ts`
- `tests/coordination/v2/unit/distributed-completion.test.ts`
- `tests/coordination/v2/unit/load-balancer.test.ts`

**Coverage**:
- All MeshCoordinator methods
- Peer discovery protocol edge cases
- Dijkstra-Scholten correctness
- Load balancing fairness

### Integration Tests (Target: >80% coverage)

**Files**:
- `tests/coordination/v2/integration/mesh-integration.test.ts`
- `tests/coordination/v2/integration/topology-routing.test.ts`

**Scenarios**:
- Mesh coordinator + MessageBroker (Phase 3)
- Mesh coordinator + CompletionDetector (Phase 4)
- Topology router selection logic
- SwarmMemory peer state sharing

### Performance Tests (All targets must pass)

**File**: `tests/coordination/v2/performance/mesh-performance.test.ts`

**Benchmarks**:
- Peer spawn time: <2s for 10 peers
- Distributed completion: <2000ms for 10 agents
- Peer resume latency: <50ms (p95)
- Token cost reduction: 50-75% during idle
- Message throughput: >8000 msg/sec
- Artifact sharing: <15ms (p95)

---

## Migration Examples

### Example 1: Small Swarm (3 agents)

```typescript
// BEFORE (Phase 5 - Uses hierarchical even for small swarms)
const coordinator = await CoordinatorFactory.create({
  mode: 'sdk',
  maxConcurrentAgents: 3
});

// AFTER (Phase 6 - Auto-selects mesh for efficiency)
const coordinator = await CoordinatorFactory.createWithTopology({
  mode: 'sdk',
  topology: 'auto',
  maxConcurrentAgents: 3
}); // Creates MeshCoordinator (optimal for ≤7 agents)
```

### Example 2: Large Swarm (12 agents)

```typescript
// BEFORE (Phase 5 - Hierarchical by default)
const coordinator = await CoordinatorFactory.create({
  mode: 'sdk',
  maxConcurrentAgents: 12
});

// AFTER (Phase 6 - Explicitly request hierarchical)
const coordinator = await CoordinatorFactory.createWithTopology({
  mode: 'sdk',
  topology: 'hierarchical', // Explicit (same as auto for 12 agents)
  maxConcurrentAgents: 12
}); // Creates HierarchicalCoordinator (optimal for 8+ agents)
```

### Example 3: Explicit Mesh for Testing

```typescript
// Force mesh topology for 10 agents (testing/benchmarking)
const coordinator = await CoordinatorFactory.createWithTopology({
  mode: 'sdk',
  topology: 'mesh', // Explicit override (warning logged)
  maxConcurrentAgents: 10
}); // Creates MeshCoordinator with warning about suboptimal topology
```

---

## Validation Metrics

### Performance Validation

| Metric | Target | Validation Test | Status |
|--------|--------|-----------------|--------|
| Peer spawn time | <2s (10 peers) | `mesh-performance.test.ts::spawn` | ⏳ Pending |
| Distributed completion | <2000ms (10 agents) | `mesh-performance.test.ts::completion` | ⏳ Pending |
| Peer resume latency | <50ms (p95) | `query-controller.test.ts::resume` | ⏳ Pending |
| Token cost reduction | 50-75% | `token-savings.test.ts` | ⏳ Pending |
| Message throughput | >8000 msg/sec | `message-broker.test.ts::mesh` | ⏳ Pending |
| Artifact sharing | <15ms (p95) | `artifact-storage.test.ts::mesh` | ⏳ Pending |

### Functional Validation

- ✅ Topology router selects mesh for 2-7 agents
- ✅ Topology router selects hierarchical for 8+ agents
- ✅ Peer discovery completes successfully
- ✅ Distributed completion detection (Dijkstra-Scholten)
- ✅ Load balancing distributes tasks evenly
- ✅ Query control enables zero-cost pausing

---

## Rollout Plan

### Phase 6.1: Core Implementation (Days 1-2)
- MeshCoordinator skeleton
- Basic peer management
- Unit tests for core methods

### Phase 6.2: Distributed Systems (Days 3-4)
- PeerDiscoverySystem
- DistributedCompletionDetector
- MeshLoadBalancer
- Integration tests

### Phase 6.3: SDK Integration (Days 5-6)
- Query controller extensions
- MessageBroker P2P methods
- SwarmMemory mesh state sharing
- Full integration tests

### Phase 6.4: Validation & Release (Day 7)
- Performance benchmarking
- Documentation updates
- Migration guide
- Production readiness review

---

## Success Criteria

**Phase 6 is complete when**:

1. **Functional**:
   - ✅ MeshCoordinator implements full ICoordinator interface
   - ✅ Topology router correctly selects mesh vs hierarchical
   - ✅ Peer discovery protocol operational
   - ✅ Distributed completion detection working (Dijkstra-Scholten)
   - ✅ Load balancing distributes tasks fairly

2. **Performance**:
   - ✅ All 6 performance targets met (see table above)
   - ✅ No performance regression in Phase 1-5 components

3. **Quality**:
   - ✅ Unit test coverage >90%
   - ✅ Integration test coverage >80%
   - ✅ No breaking changes to existing APIs
   - ✅ Documentation complete (API reference, migration guide)

4. **Production Readiness**:
   - ✅ Security audit passed (peer authentication, message integrity)
   - ✅ Lead architect sign-off
   - ✅ Integration tests passing with all Phase 1-5 components

---

**Document Status**: Ready for Implementation
**Next Action**: Begin Step 1 (MeshCoordinator Core Implementation)
