/**
 * Topology Coordination Types and Interfaces
 * 
 * Enhanced topology coordination types that build upon lifecycle management
 * and dependency tracking to provide robust coordination systems.
 */

import { EventEmitter } from 'node:events';
import { AgentLifecycleContext } from '../agents/lifecycle-manager.js';
import { DependencyTracker } from '../lifecycle/dependency-tracker.js';

// ============================================================================
// Core Topology Types
// ============================================================================

export type TopologyType = 'mesh' | 'hierarchical' | 'ring' | 'star' | 'hybrid';
export type CoordinationStrategy = 'centralized' | 'distributed' | 'hybrid' | 'adaptive';
export type FaultToleranceLevel = 'none' | 'basic' | 'byzantine' | 'full';
export type LoadBalancingStrategy = 'round-robin' | 'least-loaded' | 'capability-based' | 'adaptive';

export interface TopologyConfiguration {
  type: TopologyType;
  name: string;
  strategy: CoordinationStrategy;
  faultTolerance: FaultToleranceLevel;
  loadBalancing: LoadBalancingStrategy;
  maxAgents: number;
  maxConnections?: number;
  maxDepth?: number;
  enableCrossTopology: boolean;
  enableAdaptiveOptimization: boolean;
  performanceThresholds: {
    latency: number;
    throughput: number;
    errorRate: number;
  };
  timeouts: {
    coordination: number;
    completion: number;
    heartbeat: number;
  };
  memoryNamespace: string;
}

export interface TopologyMetrics {
  id: string;
  type: TopologyType;
  agentCount: number;
  connectionCount: number;
  averageLatency: number;
  throughput: number;
  errorRate: number;
  cpuUsage: number;
  memoryUsage: number;
  lastUpdate: Date;
  coordinationEfficiency: number;
  faultToleranceScore: number;
}

export interface AgentNode {
  id: string;
  name: string;
  type: string;
  status: 'initializing' | 'ready' | 'working' | 'completed' | 'failed' | 'suspended';
  capabilities: string[];
  topologyRole: 'coordinator' | 'worker' | 'bridge' | 'monitor';
  position: {
    level?: number; // For hierarchical
    connections?: string[]; // For mesh
    ring_position?: number; // For ring
    hub_distance?: number; // For star
  };
  workload: number;
  lastActivity: Date;
  performanceMetrics: {
    tasksCompleted: number;
    averageTaskTime: number;
    errorCount: number;
    reliability: number;
  };
  communicationChannels: Map<string, CommunicationChannel>;
  dependencies: string[];
  dependents: string[];
}

export interface CommunicationChannel {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  type: 'direct' | 'routed' | 'broadcast' | 'multicast';
  protocol: 'sync' | 'async' | 'stream';
  status: 'active' | 'inactive' | 'congested' | 'failed';
  metrics: {
    messagesSent: number;
    messagesReceived: number;
    averageLatency: number;
    errorCount: number;
    bandwidth: number;
  };
  queueSize: number;
  maxQueueSize: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface CoordinationTask {
  id: string;
  type: string;
  description: string;
  priority: number;
  topology: TopologyType;
  coordinatorId: string;
  assignedAgents: string[];
  dependencies: string[];
  status: 'pending' | 'active' | 'delegated' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  result?: unknown;
  error?: string;
  metadata: Record<string, unknown>;
  subtasks: string[];
  parentTask?: string;
  coordinationPattern: 'sequential' | 'parallel' | 'pipeline' | 'mapreduce';
  resourceRequirements: {
    cpu: number;
    memory: number;
    bandwidth: number;
    storage: number;
  };
}

// ============================================================================
// Coordination Protocol Types
// ============================================================================

export interface CoordinationMessage {
  id: string;
  type: 'task' | 'status' | 'heartbeat' | 'coordination' | 'failure' | 'recovery';
  sourceId: string;
  targetId: string;
  payload: unknown;
  timestamp: Date;
  priority: number;
  requiresAck: boolean;
  ttl: number;
  route?: string[];
  retryCount: number;
  maxRetries: number;
}

export interface ConsensusProposal {
  id: string;
  proposerId: string;
  type: 'topology_change' | 'leader_election' | 'resource_allocation' | 'task_assignment';
  payload: unknown;
  timestamp: Date;
  requiredVotes: number;
  votes: Map<string, boolean>;
  status: 'pending' | 'accepted' | 'rejected' | 'timeout';
  deadline: Date;
}

export interface ByzantineFaultToleranceConfig {
  enabled: boolean;
  maxFaultyNodes: number;
  consensusAlgorithm: 'pbft' | 'raft' | 'tendermint';
  verificationRequired: boolean;
  redundancyFactor: number;
  timeoutMultiplier: number;
}

// ============================================================================
// Bridge and Adaptation Types
// ============================================================================

export interface TopologyBridge {
  id: string;
  sourceTopology: string;
  targetTopology: string;
  type: 'protocol_adapter' | 'message_router' | 'load_balancer';
  status: 'active' | 'inactive' | 'failed';
  configuration: Record<string, unknown>;
  metrics: {
    messagesRouted: number;
    averageLatency: number;
    errorRate: number;
    throughput: number;
  };
}

export interface AdaptationDecision {
  id: string;
  timestamp: Date;
  currentTopology: TopologyType;
  recommendedTopology: TopologyType;
  confidence: number;
  reasoning: string[];
  expectedImprovements: {
    latency: number;
    throughput: number;
    reliability: number;
    cost: number;
  };
  migrationPlan: {
    steps: Array<{
      description: string;
      estimatedDuration: number;
      riskLevel: 'low' | 'medium' | 'high';
      rollbackPossible: boolean;
    }>;
    totalDuration: number;
    resources: Record<string, number>;
  };
}

export interface TopologyOptimizationResult {
  originalTopology: TopologyConfiguration;
  optimizedTopology: TopologyConfiguration;
  improvements: {
    performance: number;
    efficiency: number;
    reliability: number;
    cost: number;
  };
  changes: Array<{
    component: string;
    before: unknown;
    after: unknown;
    impact: string;
  }>;
  validationResults: {
    passed: boolean;
    warnings: string[];
    errors: string[];
  };
}

// ============================================================================
// Interface Definitions
// ============================================================================

export interface ITopologyCoordinator extends EventEmitter {
  readonly id: string;
  readonly type: TopologyType;
  readonly config: TopologyConfiguration;
  
  // Lifecycle management
  initialize(): Promise<void>;
  shutdown(force?: boolean): Promise<void>;
  isRunning(): boolean;
  
  // Agent management
  registerAgent(agentId: string, agentInfo: Partial<AgentNode>): Promise<void>;
  unregisterAgent(agentId: string): Promise<void>;
  getAgent(agentId: string): AgentNode | undefined;
  getAllAgents(): AgentNode[];
  
  // Task coordination
  coordinateTask(task: CoordinationTask): Promise<string>;
  delegateTask(taskId: string, agentIds: string[]): Promise<void>;
  handleTaskCompletion(taskId: string, agentId: string, result: unknown): Promise<void>;
  handleTaskFailure(taskId: string, agentId: string, error: string): Promise<void>;
  
  // Communication
  sendMessage(message: CoordinationMessage): Promise<void>;
  broadcastMessage(message: Omit<CoordinationMessage, 'targetId'>): Promise<void>;
  
  // Metrics and monitoring
  getMetrics(): TopologyMetrics;
  getPerformanceStats(): Record<string, number>;
  
  // Adaptation and optimization
  canAdaptTo(newType: TopologyType): boolean;
  getOptimizationRecommendations(): AdaptationDecision[];
}

export interface ITopologyManager {
  // Topology lifecycle
  createTopology(config: TopologyConfiguration): Promise<ITopologyCoordinator>;
  destroyTopology(topologyId: string): Promise<void>;
  getTopology(topologyId: string): ITopologyCoordinator | undefined;
  getAllTopologies(): ITopologyCoordinator[];
  
  // Cross-topology operations
  createBridge(sourceId: string, targetId: string, bridgeType: string): Promise<TopologyBridge>;
  removeBridge(bridgeId: string): Promise<void>;
  routeMessage(message: CoordinationMessage, route: string[]): Promise<void>;
  
  // Optimization and adaptation
  optimizeTopology(topologyId: string): Promise<TopologyOptimizationResult>;
  adaptTopology(topologyId: string, newConfig: Partial<TopologyConfiguration>): Promise<void>;
  recommendTopology(requirements: Record<string, unknown>): Promise<TopologyConfiguration>;
  
  // Monitoring and metrics
  getGlobalMetrics(): Record<string, TopologyMetrics>;
  getResourceUtilization(): Record<string, number>;
  detectBottlenecks(): Array<{ component: string; severity: number; description: string }>;
}

export interface IAdaptiveCoordinator extends ITopologyCoordinator {
  // Adaptive capabilities
  analyzePerformance(): Promise<Record<string, number>>;
  detectOptimizationOpportunities(): Promise<AdaptationDecision[]>
  switchTopology(newType: TopologyType): Promise<void>;
  optimizeConfiguration(): Promise<TopologyConfiguration>;
  
  // Hybrid coordination
  enableHybridMode(secondaryType: TopologyType): Promise<void>;
  balanceTopologies(ratio: number): Promise<void>;
}

export interface ICommunicationBridge {
  // Message routing
  routeMessage(message: CoordinationMessage): Promise<void>;
  translateProtocol(message: CoordinationMessage, targetProtocol: string): Promise<CoordinationMessage>;
  queueMessage(message: CoordinationMessage): Promise<void>;
  
  // Bridge management
  establishBridge(sourceTopology: string, targetTopology: string): Promise<void>;
  closeBridge(bridgeId: string): Promise<void>;
  getBridgeStatus(bridgeId: string): TopologyBridge | undefined;
  
  // Synchronization
  synchronizeState(topologyIds: string[]): Promise<void>;
  resolveConflicts(conflicts: Array<{ source: string; target: string; data: unknown }>): Promise<void>;
}

// ============================================================================
// Event Types
// ============================================================================

export interface TopologyEvent {
  type: string;
  timestamp: Date;
  topologyId: string;
  data: unknown;
}

export interface AgentEvent extends TopologyEvent {
  agentId: string;
}

export interface TaskEvent extends TopologyEvent {
  taskId: string;
  agentId?: string;
}

export interface CoordinationEvent extends TopologyEvent {
  coordinationType: string;
  participants: string[];
}

export interface AdaptationEvent extends TopologyEvent {
  fromTopology: TopologyType;
  toTopology: TopologyType;
  reason: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export type TopologyFactory<T extends ITopologyCoordinator> = (
  config: TopologyConfiguration
) => Promise<T>;

export type CoordinationHook = (
  event: TopologyEvent
) => Promise<void> | void;

export type PerformanceMetric = {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  threshold?: number;
};

export type OptimizationRule = {
  id: string;
  condition: (metrics: TopologyMetrics) => boolean;
  action: (coordinator: ITopologyCoordinator) => Promise<void>;
  priority: number;
  description: string;
};
