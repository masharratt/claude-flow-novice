/**
 * TypeScript type definitions for Fleet Manager
 *
 * @module @claude-flow-novice/fleet-manager
 * @version 2.0.0
 */

import { EventEmitter } from 'events';

// ============================================================
// Core Types
// ============================================================

/**
 * Fleet configuration options
 */
export interface FleetConfig {
  /** Maximum number of agents in the fleet */
  maxAgents?: number;

  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;

  /** Health check interval in milliseconds */
  healthCheckInterval?: number;

  /** Allocation timeout in milliseconds */
  allocationTimeout?: number;

  /** Recovery timeout in milliseconds */
  recoveryTimeout?: number;

  /** Scaling threshold (0-1) */
  scalingThreshold?: number;

  /** Scale down threshold (0-1) */
  scaleDownThreshold?: number;

  /** Redis configuration */
  redis?: RedisConfig;

  /** Monitoring configuration */
  monitoring?: MonitoringConfig;

  /** Auto-scaling configuration */
  autoScaling?: AutoScalingConfig;

  /** Fleet ID */
  fleetId?: string;

  /** Swarm ID */
  swarmId?: string;
}

/**
 * Redis connection configuration
 */
export interface RedisConfig {
  /** Redis host */
  host: string;

  /** Redis port */
  port: number;

  /** Redis database number */
  db?: number;

  /** Redis password */
  password?: string;

  /** Key prefix for Redis keys */
  keyPrefix?: string;

  /** TTL for Redis keys in seconds */
  ttl?: number;
}

/**
 * Agent pool types
 */
export type AgentPoolType =
  | 'coder'
  | 'tester'
  | 'reviewer'
  | 'architect'
  | 'researcher'
  | 'analyst'
  | 'optimizer'
  | 'security'
  | 'performance'
  | 'ui'
  | 'mobile'
  | 'devops'
  | 'database'
  | 'network'
  | 'infrastructure'
  | 'coordinator';

/**
 * Agent status
 */
export type AgentStatus = 'idle' | 'busy' | 'active' | 'failed' | 'recovering';

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Agent type/pool */
  type: AgentPoolType;

  /** Priority level (1-10) */
  priority?: number;

  /** Agent capabilities */
  capabilities?: string[];

  /** Resource requirements */
  resources?: ResourceRequirements;
}

/**
 * Resource requirements
 */
export interface ResourceRequirements {
  /** Memory in MB */
  memory: number;

  /** CPU allocation (0-1) */
  cpu: number;
}

/**
 * Agent data structure
 */
export interface Agent {
  /** Unique agent ID */
  id: string;

  /** Agent type */
  type: AgentPoolType;

  /** Current status */
  status: AgentStatus;

  /** Priority level */
  priority: number;

  /** Capabilities */
  capabilities: string[];

  /** Resource requirements */
  resources: ResourceRequirements;

  /** Fleet ID */
  fleetId: string;

  /** Swarm ID */
  swarmId: string;

  /** Creation timestamp */
  createdAt: number;

  /** Last active timestamp */
  lastActive: number;

  /** Performance metrics */
  performance: AgentPerformance;

  /** Health information */
  health: AgentHealth;
}

/**
 * Agent performance metrics
 */
export interface AgentPerformance {
  /** Tasks completed */
  tasksCompleted: number;

  /** Average task time in ms */
  averageTaskTime: number;

  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Agent health information
 */
export interface AgentHealth {
  /** Last heartbeat timestamp */
  lastHeartbeat: number;

  /** Failure count */
  failures: number;

  /** Recovery attempts */
  recoveryAttempts: number;
}

/**
 * Task requirements for agent allocation
 */
export interface TaskRequirements {
  /** Task ID */
  taskId: string;

  /** Preferred pool type */
  poolType?: AgentPoolType;

  /** Required capabilities */
  capabilities?: string[];

  /** Allocation strategy */
  strategy?: AllocationStrategy;

  /** Priority level */
  priority?: number;
}

/**
 * Allocation strategies
 */
export type AllocationStrategy =
  | 'priority_based'
  | 'round_robin'
  | 'least_loaded'
  | 'capability_match'
  | 'performance_based';

/**
 * Allocation result
 */
export interface AllocationResult {
  /** Allocation ID */
  allocationId: string;

  /** Allocated agent ID */
  agentId: string;

  /** Pool type */
  poolType: AgentPoolType;

  /** Agent data */
  agent: Agent;
}

/**
 * Task result
 */
export interface TaskResult {
  /** Success flag */
  success: boolean;

  /** Task duration in ms */
  duration?: number;

  /** Error message if failed */
  error?: string;

  /** Additional result data */
  data?: any;
}

// ============================================================
// Fleet Manager
// ============================================================

/**
 * Fleet Manager - Main fleet management interface
 */
export class FleetManager extends EventEmitter {
  constructor(config?: FleetConfig);

  /** Fleet ID */
  readonly fleetId: string;

  /** Swarm ID */
  readonly swarmId: string;

  /** Initialization status */
  readonly isInitialized: boolean;

  /** Running status */
  readonly isRunning: boolean;

  /**
   * Initialize the fleet manager
   */
  initialize(): Promise<void>;

  /**
   * Register a new agent
   */
  registerAgent(config: AgentConfig): Promise<string>;

  /**
   * Allocate an agent for a task
   */
  allocateAgent(requirements: TaskRequirements): Promise<AllocationResult>;

  /**
   * Release an agent from a task
   */
  releaseAgent(agentId: string, result?: TaskResult): Promise<void>;

  /**
   * Get fleet status
   */
  getStatus(): Promise<FleetStatus>;

  /**
   * Get fleet health
   */
  getHealth(): Promise<FleetHealth>;

  /**
   * Scale an agent pool
   */
  scalePool(poolType: AgentPoolType, targetSize: number): Promise<void>;

  /**
   * Shutdown the fleet manager
   */
  shutdown(): Promise<void>;

  // Events
  on(event: 'agent_registered', listener: (data: { agentId: string }) => void): this;
  on(event: 'agent_unregistered', listener: (data: { agentId: string }) => void): this;
  on(event: 'agent_allocated', listener: (data: { agentId: string; taskId: string }) => void): this;
  on(event: 'allocation_released', listener: (data: { agentId: string; result: TaskResult }) => void): this;
  on(event: 'error', listener: (error: { type: string; error: string }) => void): this;
  on(event: 'status', listener: (status: { status: string; message: string }) => void): this;
}

/**
 * Fleet status
 */
export interface FleetStatus {
  /** Fleet ID */
  fleetId: string;

  /** Swarm ID */
  swarmId: string;

  /** Running status */
  isRunning: boolean;

  /** Fleet metrics */
  metrics: FleetMetrics;

  /** Agent statistics */
  agents: {
    total: number;
    active: number;
    idle: number;
    failed: number;
  };

  /** Pool status */
  pools: Record<AgentPoolType, PoolStatus>;

  /** Coordination metrics */
  coordination: {
    messagesPublished: number;
    messagesReceived: number;
    publishLatency: number;
    queueSize: number;
  };

  /** Timestamp */
  timestamp: number;
}

/**
 * Fleet metrics
 */
export interface FleetMetrics {
  /** Total agents */
  totalAgents: number;

  /** Active agents */
  activeAgents: number;

  /** Tasks completed */
  tasksCompleted: number;

  /** Tasks failed */
  tasksFailed: number;

  /** Average response time */
  averageResponseTime: number;

  /** Uptime in ms */
  uptime: number;

  /** Start time */
  startTime: number | null;
}

/**
 * Pool status
 */
export interface PoolStatus {
  /** Pool type */
  type: AgentPoolType;

  /** Current agent count */
  currentAgents: number;

  /** Minimum agents */
  minAgents: number;

  /** Maximum agents */
  maxAgents: number;

  /** Priority level */
  priorityLevel: number;

  /** Resource limits */
  resourceLimits: ResourceRequirements;

  /** Scaling enabled */
  scalingEnabled: boolean;

  /** Utilization (0-1) */
  utilization: number;

  /** Pool metrics */
  metrics: PoolMetrics;
}

/**
 * Pool metrics
 */
export interface PoolMetrics {
  /** Total allocations */
  totalAllocations: number;

  /** Active allocations */
  activeAllocations: number;

  /** Average utilization */
  averageUtilization: number;

  /** Last allocation time */
  lastAllocationTime: number | null;

  /** Last scale time */
  lastScaleTime: number | null;
}

/**
 * Fleet health status
 */
export interface FleetHealth {
  /** Overall status */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /** Component health */
  components: {
    coordinator: ComponentHealth;
    registry: ComponentHealth;
    allocator: ComponentHealth;
    autoScaler: ComponentHealth;
    monitor: ComponentHealth;
  };

  /** Timestamp */
  timestamp: number;
}

/**
 * Component health
 */
export interface ComponentHealth {
  /** Status */
  status: 'healthy' | 'degraded' | 'unhealthy' | 'disabled';

  /** Latency in ms */
  latency?: number;

  /** Error message */
  error?: string;

  /** Additional data */
  [key: string]: any;
}

// ============================================================
// Auto-Scaling
// ============================================================

/**
 * Auto-scaling configuration
 */
export interface AutoScalingConfig {
  /** Enable auto-scaling */
  enabled?: boolean;

  /** Minimum pool size */
  minPoolSize?: number;

  /** Maximum pool size */
  maxPoolSize?: number;

  /** Scale up threshold (0-1) */
  scaleUpThreshold?: number;

  /** Scale down threshold (0-1) */
  scaleDownThreshold?: number;

  /** Scale up cooldown in ms */
  scaleUpCooldown?: number;

  /** Scale down cooldown in ms */
  scaleDownCooldown?: number;

  /** Efficiency target (0-1) */
  efficiencyTarget?: number;

  /** Check interval in ms */
  checkInterval?: number;
}

// ============================================================
// Monitoring
// ============================================================

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  /** Enable monitoring */
  enabled?: boolean;

  /** Metrics collection interval in ms */
  metricsInterval?: number;

  /** Metrics retention in days */
  retentionDays?: number;

  /** Alert thresholds */
  alertThresholds?: AlertThresholds;
}

/**
 * Alert thresholds
 */
export interface AlertThresholds {
  /** Agent failure rate threshold (0-1) */
  agentFailureRate?: number;

  /** Task failure rate threshold (0-1) */
  taskFailureRate?: number;

  /** Average response time threshold in ms */
  averageResponseTime?: number;

  /** Pool utilization threshold (0-1) */
  poolUtilization?: number;
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Create and initialize a fleet manager
 */
export function createFleet(config?: FleetConfig): Promise<FleetManager>;

/**
 * Fleet configuration presets
 */
export const FLEET_PRESETS: {
  development: FleetConfig;
  staging: FleetConfig;
  production: FleetConfig;
  enterprise: FleetConfig;
};

/**
 * Package version
 */
export const VERSION: string;

/**
 * Agent pool types constant
 */
export const AGENT_POOL_TYPES: Record<string, AgentPoolType>;

/**
 * Fleet configuration schema
 */
export const FleetConfigSchema: FleetConfig;

/**
 * Allocation strategies constant
 */
export const ALLOCATION_STRATEGIES: Record<string, AllocationStrategy>;

/**
 * Auto-scaling configuration schema
 */
export const AutoScalingConfigSchema: AutoScalingConfig;

/**
 * Monitoring configuration schema
 */
export const MonitoringConfigSchema: MonitoringConfig;
