/**
 * Coordination system exports
 */

// Core coordination components
export { CoordinationManager, type ICoordinationManager } from './manager.js';
export { TaskScheduler } from './scheduler.js';
export { ResourceManager } from './resources.js';
export { MessageRouter } from './messaging.js';

// Advanced scheduling
export {
  AdvancedTaskScheduler,
  type SchedulingStrategy,
  type SchedulingContext,
  CapabilitySchedulingStrategy,
  RoundRobinSchedulingStrategy,
  LeastLoadedSchedulingStrategy,
  AffinitySchedulingStrategy,
} from './advanced-scheduler.js';

// Work stealing
export {
  WorkStealingCoordinator,
  type WorkStealingConfig,
  type AgentWorkload,
} from './work-stealing.js';

// Dependency management
export { DependencyGraph, type DependencyNode, type DependencyPath } from './dependency-graph.js';

// Circuit breakers
export {
  CircuitBreaker,
  CircuitBreakerManager,
  CircuitState,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
} from './circuit-breaker.js';

// Conflict resolution
export {
  ConflictResolver,
  PriorityResolutionStrategy,
  TimestampResolutionStrategy,
  VotingResolutionStrategy,
  OptimisticLockManager,
  type ResourceConflict,
  type TaskConflict,
  type ConflictResolution,
  type ConflictResolutionStrategy,
} from './conflict-resolution.js';

// Metrics and monitoring
export {
  CoordinationMetricsCollector,
  type CoordinationMetrics,
  type MetricsSample,
} from './metrics.js';

// Queen Agent (hierarchical coordinator)
export {
  QueenAgent,
  type WorkerCapabilities,
  type WorkerState,
  type WorkerHealth,
  type DelegationResult,
  type AggregatedResult,
  type QueenAgentConfig,
} from './queen-agent.js';

// Mesh Coordinator (peer-to-peer topology)
export {
  MeshCoordinator,
  createMeshCoordinator,
  createMeshCoordinatorWithDependencies,
  type MeshAgentInfo,
  type MeshCoordinationTask,
  type MeshCoordinatorConfig,
} from '../agents/mesh-coordinator.js';

// Consensus Coordination
export {
  ConsensusCoordinator,
  type ConsensusProtocol,
  type ConsensusProposal,
  type ConsensusVote,
  type ConsensusResult,
  type ConsensusConfig,
} from '../swarm/consensus-coordinator.js';

// Mesh Healing (self-healing mesh network)
export {
  MeshHealingCoordinator,
  type MeshAgent,
  type MeshTask,
  type HeartbeatConfig,
  type MeshHealingConfig,
  type PartitionInfo,
} from './mesh-healing.js';

// Pheromone Trails (ant colony optimization for agent task assignment)
export {
  PheromoneTrailSystem,
  createPheromoneSystem,
  type PheromoneTrail,
  type TrailQueryResult,
  type PheromoneConfig,
} from './pheromone-trails.js';

// V1 Transparency System (for V1 coordination transparency)
export {
  V1TransparencySystem,
  type IV1TransparencySystem,
  type V1TransparencySystem as V1TransparencySystemType,
  type V1TransparencyConfig,
  type V1TransparencyEvent,
  type V1TransparencyMetrics,
  type V1AgentInfo,
  type V1TaskInfo,
  type V1CoordinatorInfo,
  type V1TransparencyEventListener,
} from './v1-transparency/v1-transparency-adapter.js';

export {
  V1ToV2Bridge,
  V1ToV2BridgeFactory,
} from './v1-transparency/v1-to-v2-bridge.js';

// Mesh Network Manager (peer-to-peer topology management)
export {
  MeshNetworkManager,
  type PeerInfo,
  type MeshConfig,
  type BroadcastResult,
  type MeshHealthMetrics,
} from './mesh-network.js';

// Role Assignment System (dynamic capability-based role assignment)
export {
  RoleAssignmentSystem,
  type AgentCapability,
  type AgentCapabilities,
  type RoleRequirement,
  type TaskRole,
  type CapabilityScore,
  type RoleClaim,
  type PeerAcknowledgment,
  type RoleConflict,
  type RoleAssignment,
  type RoleReassignment,
  type RoleAssignmentConfig,
} from './role-assignment.js';

// Import types for internal use in factory functions
import type { QueenAgentConfig, QueenAgent } from './queen-agent.js';
import type { MeshCoordinatorConfig, MeshCoordinator } from '../agents/mesh-coordinator.js';
import type { ConsensusConfig, ConsensusCoordinator } from '../swarm/consensus-coordinator.js';
import type { DependencyGraph } from './dependency-graph.js';
import { QueenAgent as QueenAgentClass } from './queen-agent.js';
import { createMeshCoordinator } from '../agents/mesh-coordinator.js';
import { ConsensusCoordinator as ConsensusCoordinatorClass } from '../swarm/consensus-coordinator.js';

// Topology Selection and Coordination Factory
export type TopologyType = 'mesh' | 'hierarchical' | 'hybrid';

export interface CoordinationTopologyConfig {
  topology: TopologyType;
  maxAgents: number;
  strategy?: 'balanced' | 'adaptive' | 'performance';

  // Hierarchical-specific config
  hierarchical?: Partial<QueenAgentConfig>;

  // Mesh-specific config
  mesh?: Partial<MeshCoordinatorConfig>;

  // Consensus config for decision-making
  consensus?: Partial<ConsensusConfig>;
}

export interface TopologyCoordinator {
  topology: TopologyType;
  coordinator: QueenAgent | MeshCoordinator;
  consensus?: ConsensusCoordinator;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Factory function to create appropriate coordinator based on topology
 *
 * @param config - Topology configuration
 * @param dependencies - Required dependencies (memory, broker, logger, etc.)
 * @returns Topology-specific coordinator instance
 */
export async function createTopologyCoordinator(
  config: CoordinationTopologyConfig,
  dependencies: {
    memory: any;
    broker: any;
    dependencyGraph: DependencyGraph;
    logger: any;
    rbacManager?: any;
  }
): Promise<TopologyCoordinator> {
  const { topology, maxAgents, strategy = 'balanced' } = config;

  // Select topology based on agent count and configuration
  const effectiveTopology = selectOptimalTopology(topology, maxAgents);

  let coordinator: QueenAgent | MeshCoordinator;
  let consensus: ConsensusCoordinator | undefined;

  if (effectiveTopology === 'hierarchical') {
    // Create hierarchical coordinator (QueenAgent)
    const hierarchicalConfig: Partial<QueenAgentConfig> = {
      minWorkers: Math.min(8, maxAgents),
      maxWorkers: maxAgents,
      autoScale: true,
      scalingThreshold: strategy === 'performance' ? 0.7 : 0.8,
      ...config.hierarchical,
    };

    coordinator = new QueenAgentClass(
      hierarchicalConfig,
      dependencies.memory,
      dependencies.broker,
      dependencies.dependencyGraph,
      dependencies.logger,
      dependencies.rbacManager
    );

    // Optionally create consensus for hierarchical decisions
    if (config.consensus) {
      consensus = new ConsensusCoordinatorClass({
        protocol: 'raft', // Hierarchical uses Raft (leader-based)
        timeout: 5000,
        maxRetries: 3,
        ...config.consensus,
      });
    }

  } else if (effectiveTopology === 'mesh') {
    // Create mesh coordinator
    const meshConfig: Partial<MeshCoordinatorConfig> = {
      maxAgents,
      maxConnections: Math.min(8, Math.floor(maxAgents / 3)),
      taskDistributionStrategy: strategy === 'performance' ? 'load-balanced' : 'capability-based',
      enableDependencyTracking: true,
      completionTimeout: 300000,
      rebalanceInterval: strategy === 'adaptive' ? 20000 : 30000,
      ...config.mesh,
    };

    coordinator = createMeshCoordinator(meshConfig);

    // Create consensus for mesh decisions (quorum or PBFT)
    if (config.consensus) {
      consensus = new ConsensusCoordinatorClass({
        protocol: 'quorum', // Mesh uses quorum-based consensus
        timeout: 5000,
        maxRetries: 3,
        ...config.consensus,
      });
    }

  } else {
    // Hybrid topology: Use mesh with hierarchical fallback
    throw new Error('Hybrid topology not yet implemented');
  }

  return {
    topology: effectiveTopology,
    coordinator,
    consensus,
    async initialize() {
      await coordinator.initialize();
      if (consensus) {
        // Consensus coordinator initializes synchronously
        dependencies.logger.info('Consensus coordinator initialized', {
          protocol: consensus.getMetrics().protocol
        });
      }
    },
    async shutdown() {
      await coordinator.shutdown();
      if (consensus) {
        consensus.shutdown();
      }
    },
  };
}

/**
 * Select optimal topology based on configuration and agent count
 *
 * @param requested - Requested topology type
 * @param maxAgents - Maximum number of agents
 * @returns Optimal topology type
 */
function selectOptimalTopology(requested: TopologyType, maxAgents: number): TopologyType {
  // Mesh is optimal for 2-7 agents (peer-to-peer collaboration)
  // Hierarchical is optimal for 8+ agents (coordinator-led structure)

  if (requested === 'mesh' && maxAgents > 7) {
    // Warn but allow mesh for large swarms (may be intentional for testing)
    console.warn(`Mesh topology requested for ${maxAgents} agents (optimal: 2-7). Consider hierarchical topology.`);
  }

  if (requested === 'hierarchical' && maxAgents < 8) {
    // Warn but allow hierarchical for small swarms
    console.warn(`Hierarchical topology requested for ${maxAgents} agents (optimal: 8+). Consider mesh topology.`);
  }

  // Honor explicit request
  return requested;
}

/**
 * Utility function to initialize swarm with topology selection
 *
 * @param options - Swarm initialization options
 * @param dependencies - Required dependencies
 * @returns Initialized topology coordinator
 */
export async function initializeSwarmTopology(
  options: {
    topology: TopologyType;
    maxAgents: number;
    strategy?: 'balanced' | 'adaptive' | 'performance';
    enableConsensus?: boolean;
  },
  dependencies: {
    memory: any;
    broker: any;
    dependencyGraph: DependencyGraph;
    logger: any;
    rbacManager?: any;
  }
): Promise<TopologyCoordinator> {
  const config: CoordinationTopologyConfig = {
    topology: options.topology,
    maxAgents: options.maxAgents,
    strategy: options.strategy || 'balanced',
    consensus: options.enableConsensus ? { protocol: 'quorum' } : undefined,
  };

  const topologyCoordinator = await createTopologyCoordinator(config, dependencies);
  await topologyCoordinator.initialize();

  return topologyCoordinator;
}
