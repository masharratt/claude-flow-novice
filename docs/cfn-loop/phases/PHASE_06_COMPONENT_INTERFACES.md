# Phase 6: Mesh Coordination Component Interfaces

**Version**: 1.0
**Date**: 2025-10-03
**Purpose**: TypeScript interface specifications for all Phase 6 components
**Status**: Design Phase

---

## Overview

This document defines the complete TypeScript interface specifications for Phase 6 mesh coordination components. All implementations must conform to these interfaces to ensure compatibility with the existing system.

---

## 1. Core Mesh Coordinator Interface

### 1.1 MeshCoordinator

```typescript
/**
 * MeshCoordinator - Main coordinator for peer-to-peer mesh topology
 *
 * File: src/coordination/v2/coordinators/mesh-coordinator.ts
 */
export interface IMeshCoordinator extends ICoordinator {
  /**
   * Assign task to best-fit peer based on capabilities and load
   *
   * @param task - Task to assign
   * @returns Promise resolving to assigned peer ID
   */
  assignTaskToPeer(task: MeshTask): Promise<string>;

  /**
   * Get all active peers in mesh
   *
   * @returns Array of active peer agents
   */
  getActivePeers(): PeerAgent[];

  /**
   * Get peer by ID
   *
   * @param peerId - Peer identifier
   * @returns Peer agent or undefined
   */
  getPeer(peerId: string): PeerAgent | undefined;

  /**
   * Discover peers with specific capabilities
   *
   * @param capabilities - Required capabilities
   * @returns Array of peer IDs matching capabilities
   */
  findPeersByCapabilities(capabilities: string[]): Promise<string[]>;

  /**
   * Wait for mesh completion using distributed algorithm
   *
   * @returns Promise resolving to true when all peers complete
   */
  waitForMeshCompletion(): Promise<boolean>;

  /**
   * Rebalance load across mesh peers
   *
   * @returns Promise resolving when rebalancing complete
   */
  rebalanceMesh(): Promise<void>;

  /**
   * Get mesh topology metrics
   *
   * @returns Mesh-specific metrics
   */
  getMeshMetrics(): MeshMetrics;
}

/**
 * PeerAgent - Individual peer in mesh network
 */
export interface PeerAgent {
  /** Unique peer identifier */
  id: string;

  /** Agent session (SDK) */
  session: AgentSession;

  /** Peer capabilities */
  capabilities: string[];

  /** Current task load (number of active tasks) */
  load: number;

  /** Current peer state */
  state: AgentState;

  /** Connected mesh neighbors */
  neighbors: Set<string>;

  /** Last heartbeat timestamp */
  lastSeen: number;

  /** Peer performance metrics */
  metrics: {
    successRate: number;
    averageResponseTime: number;
    tasksCompleted: number;
    tasksFailed: number;
  };
}

/**
 * MeshTask - Task in mesh coordination context
 */
export interface MeshTask {
  /** Unique task identifier */
  id: string;

  /** Task type */
  type: string;

  /** Task description */
  description: string;

  /** Required capabilities */
  requiredCapabilities: string[];

  /** Task priority (1-10) */
  priority: number;

  /** Task dependencies */
  dependencies: string[];

  /** Assigned peer ID */
  assignedPeer?: string;

  /** Task state */
  state: 'pending' | 'assigned' | 'running' | 'completed' | 'failed';

  /** Task result */
  result?: any;

  /** Error information (if failed) */
  error?: string;

  /** Timestamps */
  createdAt: number;
  assignedAt?: number;
  completedAt?: number;
}

/**
 * MeshMetrics - Mesh topology performance metrics
 */
export interface MeshMetrics extends CoordinatorMetrics {
  /** Total peers in mesh */
  totalPeers: number;

  /** Active peers (not paused) */
  activePeers: number;

  /** Average peer load */
  averagePeerLoad: number;

  /** Mesh discovery time (ms) */
  discoveryTimeMs: number;

  /** Completion detection time (ms) */
  completionDetectionTimeMs: number;

  /** Total messages sent */
  messagesSent: number;

  /** Total messages received */
  messagesReceived: number;

  /** Peer-to-peer latency (p95, ms) */
  p95PeerLatencyMs: number;

  /** Token savings from pausing (%) */
  tokenSavingsPercentage: number;
}

/**
 * MeshCoordinatorConfig - Configuration for mesh coordinator
 */
export interface MeshCoordinatorConfig {
  /** Swarm identifier */
  swarmId: string;

  /** Number of peers (2-7 recommended) */
  peerCount: number;

  /** Maximum concurrent tasks per peer */
  maxConcurrentTasksPerPeer: number;

  /** Enable peer discovery protocol */
  enablePeerDiscovery: boolean;

  /** Enable load balancing */
  enableLoadBalancing: boolean;

  /** Peer discovery interval (ms) */
  discoveryIntervalMs: number;

  /** Completion detection timeout (ms) */
  completionTimeoutMs: number;

  /** Artifact storage path */
  artifactStoragePath: string;

  /** Message bus configuration */
  messageBusConfig?: MessageBrokerConfig;

  /** Enable auto-rebalancing */
  enableAutoRebalance: boolean;

  /** Rebalance interval (ms) */
  rebalanceIntervalMs: number;

  /** Load imbalance threshold (ratio) */
  loadImbalanceThreshold: number;
}
```

---

## 2. Peer Discovery System

### 2.1 PeerDiscoverySystem

```typescript
/**
 * PeerDiscoverySystem - Peer capability matching and discovery
 *
 * File: src/coordination/v2/coordinators/mesh/peer-discovery.ts
 */
export interface IPeerDiscoverySystem {
  /**
   * Start peer discovery protocol
   *
   * @param swarmId - Swarm identifier
   * @returns Promise resolving when discovery started
   */
  startDiscovery(swarmId: string): Promise<void>;

  /**
   * Stop peer discovery protocol
   *
   * @returns Promise resolving when discovery stopped
   */
  stopDiscovery(): Promise<void>;

  /**
   * Find peers with specific capability
   *
   * @param capability - Required capability
   * @returns Array of peer IDs with capability
   */
  findPeersByCapability(capability: string): string[];

  /**
   * Find peers with all required capabilities
   *
   * @param capabilities - Array of required capabilities
   * @returns Array of peer IDs matching all capabilities
   */
  findPeersByCapabilities(capabilities: string[]): string[];

  /**
   * Get peer information
   *
   * @param peerId - Peer identifier
   * @returns Peer info or undefined
   */
  getPeerInfo(peerId: string): PeerInfo | undefined;

  /**
   * Get all known peers
   *
   * @returns Map of peer IDs to peer info
   */
  getAllPeers(): Map<string, PeerInfo>;

  /**
   * Update peer capabilities
   *
   * @param peerId - Peer identifier
   * @param capabilities - New capabilities
   * @returns Promise resolving when updated
   */
  updatePeerCapabilities(peerId: string, capabilities: string[]): Promise<void>;

  /**
   * Check if peer is alive (heartbeat)
   *
   * @param peerId - Peer identifier
   * @param timeoutMs - Timeout threshold (ms)
   * @returns True if peer is alive
   */
  isPeerAlive(peerId: string, timeoutMs: number): boolean;

  /**
   * Get discovery metrics
   *
   * @returns Discovery system metrics
   */
  getMetrics(): PeerDiscoveryMetrics;
}

/**
 * PeerInfo - Information about discovered peer
 */
export interface PeerInfo {
  /** Unique peer identifier */
  id: string;

  /** Peer capabilities */
  capabilities: string[];

  /** Current task load */
  load: number;

  /** Last heartbeat timestamp */
  lastSeen: number;

  /** Peer state */
  state: AgentState;

  /** Peer metadata */
  metadata?: {
    successRate?: number;
    averageResponseTime?: number;
    tasksCompleted?: number;
    tasksFailed?: number;
  };
}

/**
 * PeerDiscoveryMetrics - Discovery system metrics
 */
export interface PeerDiscoveryMetrics {
  /** Total peers discovered */
  totalPeersDiscovered: number;

  /** Active peers */
  activePeers: number;

  /** Stale peers (no recent heartbeat) */
  stalePeers: number;

  /** Discovery broadcasts sent */
  discoveryBroadcastsSent: number;

  /** Peer announcements received */
  peerAnnouncementsReceived: number;

  /** Average discovery latency (ms) */
  averageDiscoveryLatencyMs: number;

  /** Last discovery timestamp */
  lastDiscoveryTime: number;
}

/**
 * PeerDiscoveryConfig - Configuration for discovery system
 */
export interface PeerDiscoveryConfig {
  /** Swarm identifier */
  swarmId: string;

  /** Discovery interval (ms) */
  discoveryIntervalMs: number;

  /** Heartbeat interval (ms) */
  heartbeatIntervalMs: number;

  /** Peer timeout threshold (ms) */
  peerTimeoutMs: number;

  /** Enable artifact-based state sharing */
  enableArtifactSharing: boolean;

  /** Message bus instance */
  messageBus: MessageBroker;

  /** Artifact storage instance */
  artifactStorage: ArtifactStorage;
}
```

---

## 3. Distributed Completion Detection

### 3.1 DistributedCompletionDetector

```typescript
/**
 * DistributedCompletionDetector - Dijkstra-Scholten algorithm for mesh completion
 *
 * File: src/coordination/v2/coordinators/mesh/distributed-completion.ts
 */
export interface IDistributedCompletionDetector {
  /**
   * Initialize completion detection for peers
   *
   * @param peerIds - Array of peer identifiers
   * @returns Promise resolving when initialized
   */
  initialize(peerIds: string[]): Promise<void>;

  /**
   * Detect completion across mesh
   *
   * @param swarmId - Swarm identifier
   * @param timeoutMs - Timeout for detection (optional)
   * @returns Promise resolving to true when completed
   */
  detectCompletion(swarmId: string, timeoutMs?: number): Promise<boolean>;

  /**
   * Check if specific peer is completed
   *
   * @param peerId - Peer identifier
   * @returns True if peer completed
   */
  isPeerCompleted(peerId: string): boolean;

  /**
   * Get deficit counter for peer
   *
   * @param peerId - Peer identifier
   * @returns Deficit counter value
   */
  getDeficitCounter(peerId: string): number;

  /**
   * Get completion probes sent by peer
   *
   * @param peerId - Peer identifier
   * @returns Set of probe IDs
   */
  getCompletionProbes(peerId: string): Set<string>;

  /**
   * Reset completion detection state
   *
   * @returns Promise resolving when reset
   */
  reset(): Promise<void>;

  /**
   * Get completion detection metrics
   *
   * @returns Completion detector metrics
   */
  getMetrics(): CompletionDetectorMetrics;
}

/**
 * CompletionProbe - Completion probe message
 */
export interface CompletionProbe {
  /** Unique probe identifier */
  probeId: string;

  /** Sender peer ID */
  senderId: string;

  /** Recipient peer ID */
  recipientId: string;

  /** Probe timestamp */
  timestamp: number;

  /** Probe type */
  type: 'probe' | 'acknowledgment';
}

/**
 * CompletionDetectorMetrics - Completion detection metrics
 */
export interface CompletionDetectorMetrics {
  /** Total peers tracked */
  totalPeers: number;

  /** Completed peers */
  completedPeers: number;

  /** Total probes sent */
  totalProbesSent: number;

  /** Total acknowledgments received */
  totalAcksReceived: number;

  /** Average detection time (ms) */
  averageDetectionTimeMs: number;

  /** Longest detection time (ms) */
  longestDetectionTimeMs: number;

  /** Detection attempts */
  detectionAttempts: number;

  /** Detection successes */
  detectionSuccesses: number;

  /** Detection timeouts */
  detectionTimeouts: number;
}

/**
 * DistributedCompletionConfig - Configuration for completion detector
 */
export interface DistributedCompletionConfig {
  /** Default completion timeout (ms) */
  defaultTimeoutMs: number;

  /** Probe retry interval (ms) */
  probeRetryIntervalMs: number;

  /** Maximum probe retries */
  maxProbeRetries: number;

  /** Message bus instance */
  messageBus: MessageBroker;

  /** Enable completion checkpoints */
  enableCheckpoints: boolean;
}
```

---

## 4. Mesh Load Balancer

### 4.1 MeshLoadBalancer

```typescript
/**
 * MeshLoadBalancer - Load balancing across mesh peers
 *
 * File: src/coordination/v2/coordinators/mesh/load-balancer.ts
 */
export interface IMeshLoadBalancer {
  /**
   * Select least-loaded peer from candidates
   *
   * @param peerIds - Array of candidate peer IDs
   * @returns Least-loaded peer ID
   */
  selectLeastLoadedPeer(peerIds: string[]): string;

  /**
   * Update peer load
   *
   * @param peerId - Peer identifier
   * @param load - New load value
   * @returns Promise resolving when updated
   */
  updatePeerLoad(peerId: string, load: number): Promise<void>;

  /**
   * Get peer load
   *
   * @param peerId - Peer identifier
   * @returns Current load value
   */
  getPeerLoad(peerId: string): number;

  /**
   * Rebalance tasks across mesh
   *
   * @param swarmId - Swarm identifier
   * @returns Promise resolving when rebalanced
   */
  rebalance(swarmId: string): Promise<void>;

  /**
   * Check if mesh is load-balanced
   *
   * @param threshold - Imbalance threshold ratio (e.g., 1.5)
   * @returns True if balanced
   */
  isBalanced(threshold: number): boolean;

  /**
   * Get load distribution statistics
   *
   * @returns Load distribution stats
   */
  getLoadDistribution(): LoadDistribution;

  /**
   * Get load balancer metrics
   *
   * @returns Load balancer metrics
   */
  getMetrics(): LoadBalancerMetrics;
}

/**
 * LoadDistribution - Load distribution statistics
 */
export interface LoadDistribution {
  /** Average load across all peers */
  averageLoad: number;

  /** Minimum peer load */
  minLoad: number;

  /** Maximum peer load */
  maxLoad: number;

  /** Load standard deviation */
  standardDeviation: number;

  /** Load variance */
  variance: number;

  /** Load distribution by peer ID */
  loadByPeer: Map<string, number>;

  /** Overloaded peers (above threshold) */
  overloadedPeers: string[];

  /** Underloaded peers (below threshold) */
  underloadedPeers: string[];
}

/**
 * LoadBalancerMetrics - Load balancer metrics
 */
export interface LoadBalancerMetrics {
  /** Total rebalancing operations */
  totalRebalances: number;

  /** Successful rebalances */
  successfulRebalances: number;

  /** Failed rebalances */
  failedRebalances: number;

  /** Average rebalance time (ms) */
  averageRebalanceTimeMs: number;

  /** Tasks redistributed */
  tasksRedistributed: number;

  /** Load updates performed */
  loadUpdates: number;

  /** Current load imbalance ratio */
  currentImbalanceRatio: number;
}

/**
 * LoadBalancerConfig - Configuration for load balancer
 */
export interface LoadBalancerConfig {
  /** Load imbalance threshold (ratio) */
  imbalanceThreshold: number;

  /** Rebalance interval (ms) */
  rebalanceIntervalMs: number;

  /** Enable auto-rebalancing */
  enableAutoRebalance: boolean;

  /** Artifact storage instance */
  artifactStorage: ArtifactStorage;

  /** Enable aggressive rebalancing */
  aggressiveRebalancing: boolean;

  /** Minimum tasks before rebalancing */
  minTasksForRebalance: number;
}
```

---

## 5. Topology Router

### 5.1 TopologyRouter

```typescript
/**
 * TopologyRouter - Selects coordinator based on topology and agent count
 *
 * File: src/coordination/v2/coordinators/topology-router.ts
 */
export interface ITopologyRouter {
  /**
   * Select coordinator based on topology configuration
   *
   * @param config - Swarm configuration
   * @returns Coordinator instance (Mesh or Hierarchical)
   */
  selectCoordinator(config: SwarmConfig): ICoordinator;

  /**
   * Validate topology compatibility
   *
   * @param topology - Topology type
   * @param agentCount - Number of agents
   * @returns Validation result
   */
  validateTopology(topology: TopologyType, agentCount: number): TopologyValidationResult;

  /**
   * Get recommended topology for agent count
   *
   * @param agentCount - Number of agents
   * @returns Recommended topology
   */
  getRecommendedTopology(agentCount: number): TopologyType;

  /**
   * Get topology metrics
   *
   * @returns Topology router metrics
   */
  getMetrics(): TopologyRouterMetrics;
}

/**
 * SwarmConfig - Swarm initialization configuration
 */
export interface SwarmConfig {
  /** Topology type */
  topology: TopologyType;

  /** Maximum agents */
  maxAgents: number;

  /** Coordination strategy */
  strategy?: 'balanced' | 'adaptive' | 'performance';

  /** Mesh-specific config */
  meshConfig?: Partial<MeshCoordinatorConfig>;

  /** Hierarchical-specific config */
  hierarchicalConfig?: Partial<QueenAgentConfig>;

  /** Enable consensus */
  enableConsensus?: boolean;

  /** Consensus config */
  consensusConfig?: Partial<ConsensusConfig>;
}

/**
 * TopologyValidationResult - Topology validation result
 */
export interface TopologyValidationResult {
  /** Validation passed */
  valid: boolean;

  /** Validation errors */
  errors: string[];

  /** Validation warnings */
  warnings: string[];

  /** Recommended topology (if different) */
  recommendedTopology?: TopologyType;

  /** Optimization suggestions */
  suggestions: string[];
}

/**
 * TopologyRouterMetrics - Topology router metrics
 */
export interface TopologyRouterMetrics {
  /** Total coordinator selections */
  totalSelections: number;

  /** Mesh coordinator selections */
  meshSelections: number;

  /** Hierarchical coordinator selections */
  hierarchicalSelections: number;

  /** Hybrid coordinator selections */
  hybridSelections: number;

  /** Topology overrides (user forced suboptimal) */
  topologyOverrides: number;

  /** Validation errors encountered */
  validationErrors: number;
}
```

---

## 6. Message Broker Extensions

### 6.1 MessageBroker (P2P Extensions)

```typescript
/**
 * MessageBroker extensions for mesh P2P communication
 *
 * File: src/coordination/v2/core/message-broker.ts (extension)
 */
export interface IMessageBroker {
  // EXISTING METHODS (Phase 3)
  publish(topic: string, message: Message): Promise<void>;
  subscribe(topic: string, handler: MessageHandler): void;
  unsubscribe(topic: string, handler: MessageHandler): void;

  // NEW: P2P mesh methods
  /**
   * Send message directly to peer
   *
   * @param senderId - Sender peer ID
   * @param recipientId - Recipient peer ID
   * @param message - Message to send
   * @returns Promise resolving when sent
   */
  sendToPeer(senderId: string, recipientId: string, message: Message): Promise<void>;

  /**
   * Broadcast message to mesh neighbors
   *
   * @param senderId - Sender peer ID
   * @param neighbors - Array of neighbor peer IDs
   * @param message - Message to broadcast
   * @returns Promise resolving when broadcast complete
   */
  broadcastToMesh(senderId: string, neighbors: string[], message: Message): Promise<void>;

  /**
   * Register callback for peer message events
   *
   * @param peerId - Peer ID to listen for
   * @param handler - Message handler
   */
  onPeerMessage(peerId: string, handler: MessageHandler): void;

  /**
   * Register callback for message publish events
   *
   * @param peerId - Peer ID to track
   * @param handler - Callback for publish events
   */
  onPublish(peerId: string, handler: () => void): void;

  /**
   * Register callback for message acknowledgment events
   *
   * @param peerId - Peer ID to track
   * @param handler - Callback for ack events
   */
  onAcknowledge(peerId: string, handler: () => void): void;
}

/**
 * Message - Base message interface
 */
export interface Message {
  /** Message type */
  type: string;

  /** Message payload */
  payload: any;

  /** Sender ID (optional) */
  senderId?: string;

  /** Recipient ID (optional, for P2P) */
  recipientId?: string;

  /** Message timestamp */
  timestamp: number;

  /** Message ID */
  messageId?: string;

  /** Routing type */
  routingType?: 'broadcast' | 'p2p' | 'multicast';

  /** Metadata */
  metadata?: Record<string, any>;
}
```

---

## 7. SwarmMemory Extensions

### 7.1 SwarmMemoryManager (Mesh Extensions)

```typescript
/**
 * SwarmMemoryManager extensions for mesh peer state sharing
 *
 * File: src/memory/swarm-memory.ts (extension)
 */
export interface ISwarmMemoryManager {
  // EXISTING METHODS
  remember(agentId: string, type: string, content: any, metadata?: any): Promise<string>;
  recall(query: SwarmMemoryQuery): Promise<SwarmMemoryEntry[]>;
  shareMemory(entryId: string, targetAgentId: string): Promise<void>;

  // NEW: Mesh peer state sharing
  /**
   * Share peer state in mesh topology
   *
   * @param peerId - Peer identifier
   * @param state - Peer state to share
   * @returns Promise resolving when shared
   */
  sharePeerState(peerId: string, state: PeerState): Promise<void>;

  /**
   * Query mesh peer states
   *
   * @param swarmId - Swarm identifier
   * @returns Array of peer states
   */
  queryMeshPeers(swarmId: string): Promise<PeerState[]>;

  /**
   * Update peer load in memory
   *
   * @param peerId - Peer identifier
   * @param load - Current load
   * @returns Promise resolving when updated
   */
  updatePeerLoad(peerId: string, load: number): Promise<void>;

  /**
   * Get peer load from memory
   *
   * @param peerId - Peer identifier
   * @returns Current load or undefined
   */
  getPeerLoad(peerId: string): Promise<number | undefined>;
}

/**
 * PeerState - Peer state snapshot
 */
export interface PeerState {
  /** Peer identifier */
  peerId: string;

  /** Peer capabilities */
  capabilities: string[];

  /** Current load */
  load: number;

  /** Peer state */
  state: AgentState;

  /** Active task IDs */
  activeTasks: string[];

  /** Peer metrics */
  metrics: {
    successRate: number;
    averageResponseTime: number;
    tasksCompleted: number;
    tasksFailed: number;
  };

  /** Last update timestamp */
  lastUpdated: number;
}
```

---

## 8. Query Controller Extensions

### 8.1 QueryController (Mesh Batch Operations)

```typescript
/**
 * QueryController extensions for mesh batch operations
 *
 * File: src/coordination/v2/sdk/query-controller.ts (extension)
 */
export interface IQueryController {
  // EXISTING METHODS
  pauseAgent(agentId: string): Promise<void>;
  resumeAgent(agentId: string, checkpointId?: string): Promise<void>;

  // NEW: Mesh batch operations
  /**
   * Pause multiple peers simultaneously
   *
   * @param peerIds - Array of peer IDs
   * @param reason - Pause reason
   * @returns Promise resolving when all paused
   */
  pausePeers(peerIds: string[], reason?: string): Promise<void>;

  /**
   * Resume multiple peers simultaneously
   *
   * @param peerIds - Array of peer IDs
   * @returns Promise resolving when all resumed
   */
  resumePeers(peerIds: string[]): Promise<void>;

  /**
   * Get token savings from pausing
   *
   * @param agentId - Agent ID
   * @returns Token savings statistics
   */
  getTokenSavings(agentId: string): TokenSavings;

  /**
   * Get mesh-wide token savings
   *
   * @param swarmId - Swarm ID
   * @returns Aggregated token savings
   */
  getMeshTokenSavings(swarmId: string): TokenSavings;
}

/**
 * TokenSavings - Token savings statistics
 */
export interface TokenSavings {
  /** Tokens saved from pausing */
  saved: number;

  /** Total tokens consumed */
  total: number;

  /** Savings percentage */
  percentage: number;

  /** Pause duration (ms) */
  pauseDurationMs: number;

  /** Active duration (ms) */
  activeDurationMs: number;
}
```

---

## 9. Factory Functions

### 9.1 MeshCoordinator Factory

```typescript
/**
 * Factory function to create MeshCoordinator
 *
 * File: src/coordination/v2/coordinators/mesh-coordinator.ts
 */
export function createMeshCoordinator(
  config: Partial<MeshCoordinatorConfig>,
  dependencies: {
    messageBus: MessageBroker;
    queryController: QueryController;
    artifactStorage: ArtifactStorage;
    swarmMemory: SwarmMemoryManager;
    logger: Logger;
  }
): IMeshCoordinator;

/**
 * Factory function to create PeerDiscoverySystem
 *
 * File: src/coordination/v2/coordinators/mesh/peer-discovery.ts
 */
export function createPeerDiscoverySystem(
  config: Partial<PeerDiscoveryConfig>,
  dependencies: {
    messageBus: MessageBroker;
    artifactStorage: ArtifactStorage;
  }
): IPeerDiscoverySystem;

/**
 * Factory function to create DistributedCompletionDetector
 *
 * File: src/coordination/v2/coordinators/mesh/distributed-completion.ts
 */
export function createDistributedCompletionDetector(
  config: Partial<DistributedCompletionConfig>,
  dependencies: {
    messageBus: MessageBroker;
  }
): IDistributedCompletionDetector;

/**
 * Factory function to create MeshLoadBalancer
 *
 * File: src/coordination/v2/coordinators/mesh/load-balancer.ts
 */
export function createMeshLoadBalancer(
  config: Partial<LoadBalancerConfig>,
  dependencies: {
    artifactStorage: ArtifactStorage;
  }
): IMeshLoadBalancer;
```

---

## 10. Type Exports

### 10.1 Barrel Exports

```typescript
/**
 * Barrel export for mesh coordination types
 *
 * File: src/coordination/v2/coordinators/mesh/index.ts
 */
export type {
  IMeshCoordinator,
  PeerAgent,
  MeshTask,
  MeshMetrics,
  MeshCoordinatorConfig,
  IPeerDiscoverySystem,
  PeerInfo,
  PeerDiscoveryMetrics,
  PeerDiscoveryConfig,
  IDistributedCompletionDetector,
  CompletionProbe,
  CompletionDetectorMetrics,
  DistributedCompletionConfig,
  IMeshLoadBalancer,
  LoadDistribution,
  LoadBalancerMetrics,
  LoadBalancerConfig,
  ITopologyRouter,
  SwarmConfig,
  TopologyValidationResult,
  TopologyRouterMetrics,
  PeerState,
  TokenSavings
};

export {
  createMeshCoordinator,
  createPeerDiscoverySystem,
  createDistributedCompletionDetector,
  createMeshLoadBalancer
};
```

---

## Usage Examples

### Example 1: Create Mesh Coordinator

```typescript
import { createMeshCoordinator, MeshCoordinatorConfig } from '@/coordination/v2/coordinators/mesh';

const config: Partial<MeshCoordinatorConfig> = {
  swarmId: 'swarm-001',
  peerCount: 5,
  maxConcurrentTasksPerPeer: 3,
  enablePeerDiscovery: true,
  enableLoadBalancing: true,
  discoveryIntervalMs: 30000,
  completionTimeoutMs: 2000
};

const coordinator = createMeshCoordinator(config, {
  messageBus,
  queryController,
  artifactStorage,
  swarmMemory,
  logger
});

await coordinator.initialize();
```

### Example 2: Assign Task to Peer

```typescript
const task: MeshTask = {
  id: 'task-001',
  type: 'code-review',
  description: 'Review authentication module',
  requiredCapabilities: ['code-review', 'security'],
  priority: 8,
  dependencies: [],
  state: 'pending',
  createdAt: Date.now()
};

const assignedPeerId = await coordinator.assignTaskToPeer(task);
console.log(`Task assigned to peer: ${assignedPeerId}`);
```

### Example 3: Wait for Mesh Completion

```typescript
const completed = await coordinator.waitForMeshCompletion();

if (completed) {
  const metrics = coordinator.getMeshMetrics();
  console.log(`Mesh completed in ${metrics.completionDetectionTimeMs}ms`);
}
```

---

**Document Status**: Complete
**Next Action**: Implementation begins with MeshCoordinator core
