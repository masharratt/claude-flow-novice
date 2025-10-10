/**
 * Type definitions for QEEventBus system
 * Provides comprehensive type safety for event-driven agent coordination
 */

// Core event types
export const EventType = {
  // Agent lifecycle events
  AGENT_SPAWN: 'agent.spawn',
  AGENT_TERMINATE: 'agent.terminate',
  AGENT_ERROR: 'agent.error',
  AGENT_TASK_ASSIGN: 'agent.task.assign',
  AGENT_TASK_COMPLETE: 'agent.task.complete',
  AGENT_HEARTBEAT: 'agent.heartbeat',
  AGENT_STATUS_UPDATE: 'agent.status.update',
  AGENT_CAPABILITY_REGISTER: 'agent.capability.register',
  AGENT_RESOURCE_REQUEST: 'agent.resource.request',
  AGENT_RESOURCE_RELEASE: 'agent.resource.release',

  // Swarm coordination events
  SWARM_INIT: 'swarm.init',
  SWARM_START: 'swarm.start',
  SWARM_PAUSE: 'swarm.pause',
  SWARM_RESUME: 'swarm.resume',
  SWARM_COMPLETE: 'swarm.complete',
  SWARM_ERROR: 'swarm.error',
  SWARM_PHASE_TRANSITION: 'swarm.phase.transition',
  SWARM_CONSENSUS_REQUIRED: 'swarm.consensus.required',
  SWARM_HEALTH_CHECK: 'swarm.health.check',
  SWARM_SCALING: 'swarm.scaling',

  // Task management events
  TASK_CREATE: 'task.create',
  TASK_UPDATE: 'task.update',
  TASK_COMPLETE: 'task.complete',
  TASK_FAIL: 'task.fail',
  TASK_CANCEL: 'task.cancel',
  TASK_DEPENDENCY_RESOLVE: 'task.dependency.resolve',
  TASK_PRIORITY_CHANGE: 'task.priority.change',
  TASK_TIMEOUT: 'task.timeout',
  TASK_RETRY: 'task.retry',
  TASK_ESCALATE: 'task.escalate',

  // Consensus events
  CONSENSUS_START: 'consensus.start',
  CONSENSUS_VOTE: 'consensus.vote',
  CONSENSUS_ACHIEVE: 'consensus.achieve',
  CONSENSUS_FAIL: 'consensus.fail',
  CONSENSUS_TIMEOUT: 'consensus.timeout',
  CONSENSUS_QUORUM_REACHED: 'consensus.quorum.reached',
  CONSENSUS_CONFLICT: 'consensus.conflict',
  CONSENSUS_RESOLUTION: 'consensus.resolution',

  // Memory and state events
  MEMORY_WRITE: 'memory.write',
  MEMORY_READ: 'memory.read',
  MEMORY_CLEAR: 'memory.clear',
  MEMORY_BACKUP: 'memory.backup',
  MEMORY_RESTORE: 'memory.restore',
  STATE_SNAPSHOT: 'state.snapshot',
  STATE_RECOVERY: 'state.recovery',
  STATE_MIGRATION: 'state.migration',

  // System events
  SYSTEM_STARTUP: 'system.startup',
  SYSTEM_SHUTDOWN: 'system.shutdown',
  SYSTEM_HEALTH_CHECK: 'system.health_check',
  SYSTEM_METRICS: 'system.metrics',
  SYSTEM_CONFIG_UPDATE: 'system.config.update',
  SYSTEM_RESOURCE_ALERT: 'system.resource.alert',
  SYSTEM_SECURITY_EVENT: 'system.security.event',

  // Performance events
  PERFORMANCE_MEASURE: 'performance.measure',
  PERFORMANCE_THRESHOLD: 'performance.threshold',
  PERFORMANCE_BENCHMARK: 'performance.benchmark',
  PERFORMANCE_DEGRADATION: 'performance.degradation',
  PERFORMANCE_OPTIMIZATION: 'performance.optimization',

  // Communication events
  MESSAGE_BROADCAST: 'message.broadcast',
  MESSAGE_DIRECT: 'message.direct',
  MESSAGE_GROUP: 'message.group',
  MESSAGE_ANNOUNCEMENT: 'message.announcement',

  // Coordination events
  LEADER_ELECTION: 'coordination.leader.election',
  LEADER_STEP_DOWN: 'coordination.leader.step_down',
  COORDINATION_SYNC: 'coordination.sync',
  COORDINATION_LOCK_REQUEST: 'coordination.lock.request',
  COORDINATION_LOCK_RELEASE: 'coordination.lock.release'
} as const;

export type EventType = typeof EventType[keyof typeof EventType];

// Load balancing strategies
export const LoadBalancingStrategy = {
  ROUND_ROBIN: 'round_robin',
  LEAST_CONNECTIONS: 'least_connections',
  WEIGHTED: 'weighted',
  HASH_BASED: 'hash_based',
  RANDOM: 'random',
  ADAPTIVE: 'adaptive',
  PRIORITY_BASED: 'priority_based'
} as const;

export type LoadBalancingStrategy = typeof LoadBalancingStrategy[keyof typeof LoadBalancingStrategy];

// Event priority levels
export const EventPriority = {
  CRITICAL: 0,    // System-critical events (errors, shutdown, security)
  HIGH: 1,        // High priority (consensus, task completion, leader election)
  NORMAL: 2,      // Normal priority (regular agent communication)
  LOW: 3,         // Low priority (metrics, health checks, logging)
  BULK: 4         // Bulk operations (analytics, backups, cleanup)
} as const;

export type EventPriority = typeof EventPriority[keyof typeof EventPriority];

// Agent status types
export const AgentStatus = {
  INITIALIZING: 'initializing',
  IDLE: 'idle',
  ACTIVE: 'active',
  BUSY: 'busy',
  SUSPENDED: 'suspended',
  ERROR: 'error',
  TERMINATING: 'terminating',
  TERMINATED: 'terminated'
} as const;

export type AgentStatus = typeof AgentStatus[keyof typeof AgentStatus];

// Agent types
export const AgentType = {
  IMPLEMENTER: 'implementer',
  VALIDATOR: 'validator',
  COORDINATOR: 'coordinator',
  SPECIALIST: 'specialist',
  MONITOR: 'monitor',
  GATEKEEPER: 'gatekeeper'
} as const;

export type AgentType = typeof AgentType[keyof typeof AgentType];

// Swarm phases
export const SwarmPhase = {
  INITIALIZATION: 'initialization',
  PLANNING: 'planning',
  EXECUTION: 'execution',
  VALIDATION: 'validation',
  COMPLETION: 'completion',
  RECOVERY: 'recovery',
  CLEANUP: 'cleanup'
} as const;

export type SwarmPhase = typeof SwarmPhase[keyof typeof SwarmPhase];

// Task status types
export const TaskStatus = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout',
  ESCALATED: 'escalated'
} as const;

export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus];

// Core interfaces
export interface AgentEvent {
  id: string;
  type: EventType;
  agentId: string;
  swarmId?: string;
  timestamp: number;
  priority: EventPriority;
  data: any;
  metadata?: {
    source: string;
    version: string;
    correlationId?: string;
    causationId?: string;
    retryCount?: number;
    timeout?: number;
    tags?: string[];
    traceId?: string;
    spanId?: string;
  };
}

export interface AgentInfo {
  id: string;
  type: AgentType;
  role: string;
  status: AgentStatus;
  capabilities: string[];
  resources: {
    cpu: number;
    memory: number;
    bandwidth: number;
  };
  performance: {
    avgResponseTime: number;
    successRate: number;
    taskCompletionRate: number;
  };
  metadata?: {
    version?: string;
    specialization?: string;
    experience?: 'junior' | 'mid' | 'senior' | 'expert';
    location?: string;
    lastActive?: number;
  };
}

export interface SwarmInfo {
  id: string;
  name: string;
  phase: SwarmPhase;
  status: 'initializing' | 'running' | 'paused' | 'completed' | 'error';
  agents: Map<string, AgentInfo>;
  config: {
    strategy: string;
    mode: string;
    maxAgents: number;
    consensusThreshold: number;
    retryAttempts: number;
  };
  performance: {
    startTime: number;
    tasksCompleted: number;
    averageLatency: number;
    throughput: number;
    errorRate: number;
  };
  objectives?: {
    primary: string;
    secondary?: string[];
    constraints?: string[];
    successCriteria?: string[];
  };
}

export interface TaskInfo {
  id: string;
  title: string;
  description: string;
  type: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedAgent?: string;
  dependencies: string[];
  subtasks: string[];
  parentTask?: string;
  estimatedDuration: number;
  actualDuration?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: any;
  artifacts: string[];
  confidence: number;
  progress: number;
  metadata?: {
    tags?: string[];
    complexity?: 'simple' | 'moderate' | 'complex' | 'expert';
    requiredCapabilities?: string[];
    estimatedResources?: {
      cpu: number;
      memory: number;
      time: number;
    };
  };
}

// Event handler interfaces
export interface EventHandler {
  (event: AgentEvent): Promise<void> | void;
}

export interface EventFilter {
  (event: AgentEvent): boolean;
}

export interface SubscriptionOptions {
  priority?: EventPriority;
  filter?: EventFilter;
  once?: boolean;
  timeout?: number;
  retryAttempts?: number;
  maxConcurrency?: number;
  batchSize?: number;
}

// Load balancer configuration
export interface LoadBalancerConfig {
  strategy: LoadBalancingStrategy;
  weights?: Map<string, number>;
  healthCheckInterval?: number;
  maxConnections?: number;
  adaptiveThresholds?: {
    responseTime: number;
    errorRate: number;
    connectionCount: number;
  };
}

// Redis configuration
export interface RedisConfig {
  host: string;
  port: number;
  db?: number;
  password?: string;
  keyPrefix?: string;
  ttl?: number;
  cluster?: {
    enabled: boolean;
    nodes?: Array<{ host: string; port: number }>;
  };
  sentinel?: {
    enabled: boolean;
    hosts: Array<{ host: string; port: number }>;
    name?: string;
  };
}

// Protocol configuration
export interface ProtocolConfig {
  websocket?: {
    port: number;
    enabled: boolean;
    path?: string;
    compression?: boolean;
    maxConnections?: number;
  };
  http?: {
    port: number;
    enabled: boolean;
    cors?: boolean;
    rateLimit?: number;
    compression?: boolean;
  };
  grpc?: {
    port: number;
    enabled: boolean;
    protoPath?: string;
    maxMessageSize?: number;
  };
}

// Performance configuration
export interface PerformanceConfig {
  targetThroughput?: number;
  maxLatency?: number;
  bufferSize?: number;
  workerThreads?: number;
  monitoring?: {
    enabled: boolean;
    interval: number;
    retention: number;
  };
  thresholds?: {
    cpu: number;
    memory: number;
    latency: number;
    errorRate: number;
  };
}

// Logging configuration
export interface LoggingConfig {
  enabled: boolean;
  level: 'debug' | 'info' | 'warn' | 'error';
  format?: 'json' | 'text';
  output?: 'console' | 'file' | 'both';
  file?: {
    path: string;
    maxSize: string;
    maxFiles: number;
  };
}

// Main configuration
export interface QEEventBusConfig {
  nodeId: string;
  redis: RedisConfig;
  loadBalancer?: LoadBalancerConfig;
  protocols?: ProtocolConfig;
  performance?: PerformanceConfig;
  logging?: LoggingConfig;
  security?: {
    enabled: boolean;
    encryption?: boolean;
    authentication?: boolean;
    keyPath?: string;
    certPath?: string;
  };
}

// Performance metrics
export interface PerformanceMetrics {
  eventsProcessed: number;
  eventsPerSecond: number;
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  p95Latency: number;
  p99Latency: number;
  errorCount: number;
  errorRate: number;
  queueSize: number;
  memoryUsage: number;
  cpuUsage: number;
  activeConnections: number;
  throughput: number;
  timestamp: number;
}

// Health check results
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    redis: boolean;
    memory: boolean;
    cpu: boolean;
    connections: boolean;
    throughput: boolean;
  };
  metrics: PerformanceMetrics;
  issues: string[];
  recommendations: string[];
  timestamp: number;
}

// Event serialization formats
export type SerializationFormat = 'json' | 'msgpack' | 'protobuf' | 'avro';

export interface SerializationOptions {
  format: SerializationFormat;
  compression?: boolean;
  encryption?: boolean;
  validation?: boolean;
}

// Consensus types
export interface ConsensusProposal {
  id: string;
  type: string;
  proposer: string;
  data: any;
  votingDeadline: number;
  requiredVotes: number;
  currentVotes: Map<string, boolean>;
  status: 'pending' | 'achieved' | 'failed' | 'expired';
}

export interface VoteEvent extends AgentEvent {
  proposalId: string;
  vote: boolean;
  reason?: string;
}

// Memory types
export interface MemoryEntry {
  id: string;
  agentId: string;
  type: 'knowledge' | 'result' | 'state' | 'communication' | 'observation';
  content: any;
  timestamp: number;
  metadata?: {
    taskId?: string;
    tags?: string[];
    priority?: number;
    shareLevel?: 'private' | 'team' | 'public';
    expiresAt?: number;
  };
}

// Error types
export interface EventError extends Error {
  code: string;
  eventId?: string;
  agentId?: string;
  retryable: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: any;
}

// Utility types
export type EventHandlerMap = Map<EventType, Set<EventHandler>>;
export type EventPromise<T = any> = Promise<T>;
export type EventCallback<T = any> = (data: T, event: AgentEvent) => void;

// Type guards
export function isValidEventType(type: string): type is EventType {
  return Object.values(EventType).includes(type as EventType);
}

export function isValidEventPriority(priority: number): priority is EventPriority {
  return Object.values(EventPriority).includes(priority as EventPriority);
}

export function isValidAgentStatus(status: string): status is AgentStatus {
  return Object.values(AgentStatus).includes(status as AgentStatus);
}

export function isValidTaskStatus(status: string): status is TaskStatus {
  return Object.values(TaskStatus).includes(status as TaskStatus);
}

// Event builder utility
export class EventBuilder {
  private event: Partial<AgentEvent> = {};

  constructor(type: EventType) {
    this.event.type = type;
    this.event.timestamp = Date.now();
    this.event.priority = EventPriority.NORMAL;
    this.event.id = this.generateId();
  }

  agentId(agentId: string): EventBuilder {
    this.event.agentId = agentId;
    return this;
  }

  swarmId(swarmId: string): EventBuilder {
    this.event.swarmId = swarmId;
    return this;
  }

  priority(priority: EventPriority): EventBuilder {
    this.event.priority = priority;
    return this;
  }

  data(data: any): EventBuilder {
    this.event.data = data;
    return this;
  }

  metadata(metadata: AgentEvent['metadata']): EventBuilder {
    this.event.metadata = { ...this.event.metadata, ...metadata };
    return this;
  }

  source(source: string): EventBuilder {
    if (!this.event.metadata) this.event.metadata = {};
    this.event.metadata.source = source;
    return this;
  }

  correlationId(correlationId: string): EventBuilder {
    if (!this.event.metadata) this.event.metadata = {};
    this.event.metadata.correlationId = correlationId;
    return this;
  }

  build(): AgentEvent {
    if (!this.event.agentId) {
      throw new Error('Agent ID is required');
    }
    return this.event as AgentEvent;
  }

  private generateId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Factory function for creating events
export function createEvent(type: EventType): EventBuilder {
  return new EventBuilder(type);
}