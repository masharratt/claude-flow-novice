/**
 * Comprehensive TypeScript interfaces for Agent Lifecycle Management System
 *
 * This module provides all type definitions for the agent lifecycle management
 * system, including state machines, hooks, memory schemas, and communication
 * protocols.
 */

import { EventEmitter } from 'node:events';
import type { ILogger } from '../utils/types.js';
import type { AgentDefinition } from '../agents/agent-loader.js';

// ============================================================================
// Core Lifecycle State Management
// ============================================================================

/**
 * All possible states in the agent lifecycle
 */
export enum AgentLifecycleState {
  // Initialization Phase
  REQUESTED = 'requested',
  PROVISIONING = 'provisioning',
  INITIALIZING = 'initializing',
  CONFIGURED = 'configured',

  // Operational Phase
  READY = 'ready',
  ACTIVE = 'active',
  BUSY = 'busy',
  IDLE = 'idle',
  SUSPENDED = 'suspended',

  // Maintenance Phase
  UPDATING = 'updating',
  MIGRATING = 'migrating',
  BACKING_UP = 'backing_up',

  // Termination Phase
  STOPPING = 'stopping',
  TERMINATING = 'terminating',
  TERMINATED = 'terminated',

  // Error States
  ERROR = 'error',
  FAILED = 'failed',
  RECOVERING = 'recovering',

  // Special States
  HIBERNATING = 'hibernating',
  SCALING = 'scaling',
}

/**
 * Triggers that cause state transitions
 */
export enum AgentLifecycleTrigger {
  // Initialization triggers
  SPAWN_REQUEST = 'spawn_request',
  PROVISION_COMPLETE = 'provision_complete',
  INIT_COMPLETE = 'init_complete',
  CONFIG_COMPLETE = 'config_complete',

  // Operational triggers
  TASK_ASSIGNED = 'task_assigned',
  TASK_COMPLETED = 'task_completed',
  HEALTH_CHECK_PASS = 'health_check_pass',
  HEALTH_CHECK_FAIL = 'health_check_fail',
  IDLE_TIMEOUT = 'idle_timeout',
  SUSPEND_REQUEST = 'suspend_request',
  RESUME_REQUEST = 'resume_request',

  // Maintenance triggers
  UPDATE_REQUEST = 'update_request',
  MIGRATION_REQUEST = 'migration_request',
  BACKUP_REQUEST = 'backup_request',

  // Termination triggers
  SHUTDOWN_REQUEST = 'shutdown_request',
  FORCE_TERMINATE = 'force_terminate',
  RESOURCE_EXHAUSTED = 'resource_exhausted',

  // Error triggers
  INTERNAL_ERROR = 'internal_error',
  EXTERNAL_ERROR = 'external_error',
  COMMUNICATION_FAILURE = 'communication_failure',
  RECOVERY_SUCCESS = 'recovery_success',

  // Special triggers
  HIBERNATE_REQUEST = 'hibernate_request',
  WAKE_REQUEST = 'wake_request',
  SCALE_REQUEST = 'scale_request',
}

/**
 * Conditions that must be met for state transitions
 */
export interface StateTransitionCondition {
  name: string;
  type: 'resource' | 'time' | 'dependency' | 'custom';
  expression: string;
  parameters?: Record<string, unknown>;
}

/**
 * Actions executed during state transitions
 */
export interface StateTransitionAction {
  name: string;
  type: 'notification' | 'resource-allocation' | 'cleanup' | 'custom';
  parameters: Record<string, unknown>;
  async?: boolean;
  timeout?: number;
}

/**
 * Retry policy for failed operations
 */
export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxDelay: number;
  retryableErrors?: string[];
}

/**
 * Definition of a state transition
 */
export interface AgentStateTransition {
  fromState: AgentLifecycleState;
  toState: AgentLifecycleState;
  trigger: AgentLifecycleTrigger;
  conditions?: StateTransitionCondition[];
  actions?: StateTransitionAction[];
  hooks?: LifecycleHook[];
  timeout?: number;
  retryPolicy?: RetryPolicy;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Hook System Types
// ============================================================================

/**
 * All available lifecycle hook types
 */
export enum LifecycleHookType {
  // Initialization hooks
  PRE_PROVISION = 'pre-provision',
  POST_PROVISION = 'post-provision',
  PRE_INITIALIZATION = 'pre-initialization',
  POST_INITIALIZATION = 'post-initialization',
  PRE_CONFIGURATION = 'pre-configuration',
  POST_CONFIGURATION = 'post-configuration',
  AGENT_READY = 'agent-ready',

  // Operational hooks
  TASK_ASSIGNMENT = 'task-assignment',
  PRE_EXECUTION = 'pre-execution',
  POST_EXECUTION = 'post-execution',
  TASK_COMPLETION = 'task-completion',
  HEALTH_CHECK = 'health-check',
  PERFORMANCE_MONITOR = 'performance-monitor',

  // State transition hooks
  STATE_ENTER = 'state-enter',
  STATE_EXIT = 'state-exit',
  STATE_CHANGE = 'state-change',

  // Maintenance hooks
  PRE_UPDATE = 'pre-update',
  POST_UPDATE = 'post-update',
  PRE_MIGRATION = 'pre-migration',
  POST_MIGRATION = 'post-migration',
  PRE_BACKUP = 'pre-backup',
  POST_BACKUP = 'post-backup',

  // Error handling hooks
  ERROR_DETECTED = 'error-detected',
  ERROR_RECOVERY = 'error-recovery',
  FAILURE_HANDLING = 'failure-handling',

  // Termination hooks
  PRE_SHUTDOWN = 'pre-shutdown',
  POST_SHUTDOWN = 'post-shutdown',
  CLEANUP = 'cleanup',
  RESOURCE_DEALLOCATION = 'resource-deallocation',

  // Hibernation hooks
  PRE_HIBERNATION = 'pre-hibernation',
  POST_HIBERNATION = 'post-hibernation',
  PRE_WAKE = 'pre-wake',
  POST_WAKE = 'post-wake',

  // Scaling hooks
  PRE_SCALE = 'pre-scale',
  POST_SCALE = 'post-scale',

  // Communication hooks
  MESSAGE_SENT = 'message-sent',
  MESSAGE_RECEIVED = 'message-received',
  COORDINATION_UPDATE = 'coordination-update',
}

/**
 * Context passed to lifecycle hooks
 */
export interface LifecycleHookContext {
  agentId: string;
  agentDefinition: AgentDefinition;
  currentState: AgentLifecycleState;
  targetState?: AgentLifecycleState;
  trigger: AgentLifecycleTrigger;
  metadata: Record<string, unknown>;
  timestamp: Date;
  sessionId: string;
  lifecycle: AgentLifecycleManager;
  memory: LifecycleMemoryManager;
  communication: LifecycleCommunicationManager;
  logger: ILogger;
  resources?: Record<string, unknown>;
  environment?: Record<string, string>;
}

/**
 * Result returned by hook execution
 */
export interface LifecycleHookResult {
  success: boolean;
  data?: unknown;
  error?: Error;
  duration: number;
  metadata?: Record<string, unknown>;
  nextHooks?: string[];
  skipSubsequentHooks?: boolean;
  stateOverride?: AgentLifecycleState;
}

/**
 * Condition for hook execution
 */
export interface HookCondition {
  name: string;
  expression: string;
  parameters?: Record<string, unknown>;
}

/**
 * Hook handler function signature
 */
export interface LifecycleHookHandler {
  (context: LifecycleHookContext): Promise<LifecycleHookResult>;
}

/**
 * Error handler for hooks
 */
export interface LifecycleHookErrorHandler {
  (error: Error, context: LifecycleHookContext): Promise<void>;
}

/**
 * Complete hook definition
 */
export interface LifecycleHook {
  name: string;
  type: LifecycleHookType;
  priority: number;
  async: boolean;
  timeout: number;
  retryPolicy?: RetryPolicy;
  conditions?: HookCondition[];
  handler: LifecycleHookHandler;
  errorHandler?: LifecycleHookErrorHandler;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Hook execution record
 */
export interface HookExecution {
  hookName: string;
  agentId: string;
  timestamp: Date;
  duration: number;
  result: LifecycleHookResult;
  context: Partial<LifecycleHookContext>;
}

// ============================================================================
// Memory Schema Types
// ============================================================================

/**
 * Complete lifecycle record for an agent
 */
export interface AgentLifecycleRecord {
  agentId: string;
  sessionId: string;
  currentState: AgentLifecycleState;
  previousState?: AgentLifecycleState;
  stateHistory: AgentStateHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
  version: number;
  metadata: AgentLifecycleMetadata;
  configuration: AgentLifecycleConfiguration;
  resources: AgentResourceUsage;
  performance: AgentPerformanceMetrics;
}

/**
 * Individual state transition record
 */
export interface AgentStateHistoryEntry {
  id: string;
  fromState: AgentLifecycleState;
  toState: AgentLifecycleState;
  trigger: AgentLifecycleTrigger;
  timestamp: Date;
  duration: number;
  success: boolean;
  error?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
  hooksExecuted: string[];
  hookResults: LifecycleHookResult[];
  conditions: StateTransitionCondition[];
  actions: StateTransitionAction[];
}

/**
 * Agent lifecycle metadata
 */
export interface AgentLifecycleMetadata {
  totalStateTransitions: number;
  totalUptime: number;
  totalDowntime: number;
  errorCount: number;
  lastError?: {
    message: string;
    timestamp: Date;
    state: AgentLifecycleState;
    errorCode?: string;
    stack?: string;
  };
  performance: {
    averageStateTransitionTime: number;
    successfulTransitions: number;
    failedTransitions: number;
    lastSuccessfulTransition?: Date;
    lastFailedTransition?: Date;
  };
  tags: string[];
  annotations: Record<string, string>;
}

/**
 * Agent lifecycle configuration
 */
export interface AgentLifecycleConfiguration {
  enabledHooks: LifecycleHookType[];
  stateTimeouts: Partial<Record<AgentLifecycleState, number>>;
  retryPolicies: Record<string, RetryPolicy>;
  errorHandling: {
    autoRecovery: boolean;
    maxRecoveryAttempts: number;
    escalationPolicy: string;
  };
  monitoring: {
    enableMetrics: boolean;
    metricsInterval: number;
    healthCheckInterval: number;
  };
  persistence: {
    enablePersistence: boolean;
    persistentStates: AgentLifecycleState[];
    retentionDays: number;
  };
}

/**
 * Agent resource usage tracking
 */
export interface AgentResourceUsage {
  memory: {
    current: number;
    peak: number;
    average: number;
    limit?: number;
  };
  cpu: {
    current: number;
    average: number;
    limit?: number;
  };
  disk: {
    used: number;
    limit?: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    connectionsActive: number;
  };
  handles: {
    files: number;
    sockets: number;
    timers: number;
  };
  lastUpdated: Date;
}

/**
 * Agent performance metrics
 */
export interface AgentPerformanceMetrics {
  tasksCompleted: number;
  tasksSuccessful: number;
  tasksFailed: number;
  averageTaskDuration: number;
  throughput: number; // tasks per hour
  errorRate: number; // percentage
  availability: number; // percentage uptime
  responseTime: {
    average: number;
    p50: number;
    p95: number;
    p99: number;
  };
  lastReset: Date;
}

/**
 * Time-series metrics entry
 */
export interface LifecycleMetrics {
  agentId: string;
  timestamp: Date;
  state: AgentLifecycleState;
  stateEnterTime: Date;
  stateDuration: number;
  metrics: {
    memoryUsage: number;
    cpuUsage: number;
    taskCount: number;
    messageCount: number;
    errorCount: number;
    customMetrics?: Record<string, number>;
  };
  tags?: Record<string, string>;
}

// ============================================================================
// Communication Protocol Types
// ============================================================================

/**
 * Lifecycle event types for communication
 */
export enum LifecycleEventType {
  STATE_CHANGED = 'lifecycle:state_changed',
  HOOK_EXECUTED = 'lifecycle:hook_executed',
  ERROR_OCCURRED = 'lifecycle:error_occurred',
  METRICS_UPDATED = 'lifecycle:metrics_updated',
  RESOURCE_ALLOCATED = 'lifecycle:resource_allocated',
  RESOURCE_DEALLOCATED = 'lifecycle:resource_deallocated',
  AGENT_CREATED = 'lifecycle:agent_created',
  AGENT_DESTROYED = 'lifecycle:agent_destroyed',
  CONFIGURATION_CHANGED = 'lifecycle:configuration_changed',
  HEALTH_CHECK_COMPLETED = 'lifecycle:health_check_completed',
}

/**
 * Lifecycle event data
 */
export interface LifecycleEventData {
  previousState?: AgentLifecycleState;
  currentState: AgentLifecycleState;
  trigger?: AgentLifecycleTrigger;
  metadata?: Record<string, unknown>;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  metrics?: LifecycleMetrics;
  hooks?: {
    executed: string[];
    failed: string[];
  };
  resources?: AgentResourceUsage;
  duration?: number;
}

/**
 * Lifecycle event structure
 */
export interface LifecycleEvent {
  id: string;
  type: LifecycleEventType;
  agentId: string;
  timestamp: Date;
  data: LifecycleEventData;
  correlation?: string;
  source: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  ttl?: number;
}

/**
 * Event subscription configuration
 */
export interface EventSubscription {
  id: string;
  pattern: string;
  callback: (event: LifecycleEvent) => void | Promise<void>;
  filters?: {
    agentIds?: string[];
    eventTypes?: LifecycleEventType[];
    states?: AgentLifecycleState[];
  };
  options?: {
    persistent?: boolean;
    priority?: number;
    maxRetries?: number;
  };
}

/**
 * Message routing configuration
 */
export interface MessageRouterConfig {
  transport: 'memory' | 'redis' | 'rabbitmq' | 'kafka';
  serialization: 'json' | 'msgpack' | 'protobuf';
  compression?: 'gzip' | 'lz4';
  encryption?: {
    enabled: boolean;
    algorithm: string;
    keyPath?: string;
  };
  reliability: {
    acknowledgments: boolean;
    retryPolicy: RetryPolicy;
    deadLetterQueue: boolean;
  };
}

// ============================================================================
// Error Handling and Recovery Types
// ============================================================================

/**
 * Error recovery strategy interface
 */
export interface ErrorRecoveryStrategy {
  name: string;
  priority: number;
  canHandle(error: Error, context: LifecycleHookContext): boolean;
  recover(error: Error, context: LifecycleHookContext): Promise<RecoveryResult>;
  validateRecovery?(result: RecoveryResult, context: LifecycleHookContext): Promise<boolean>;
}

/**
 * Recovery operation result
 */
export interface RecoveryResult {
  success: boolean;
  newState?: AgentLifecycleState;
  actions?: string[];
  metadata?: Record<string, unknown>;
  retryAfter?: number;
  escalate?: boolean;
  message?: string;
}

/**
 * Degradation levels for graceful failure handling
 */
export enum DegradationLevel {
  NONE = 'none',
  MINIMAL = 'minimal',
  PARTIAL = 'partial',
  SEVERE = 'severe',
  COMPLETE = 'complete',
}

/**
 * Degradation configuration
 */
export interface DegradationConfig {
  level: DegradationLevel;
  affectedFeatures: string[];
  fallbackBehavior: string;
  autoRecovery: boolean;
  recoveryThreshold?: number;
  escalationPolicy?: string;
}

// ============================================================================
// Manager Interface Types
// ============================================================================

/**
 * Main agent lifecycle manager interface
 */
export interface AgentLifecycleManager {
  // State management
  getCurrentState(agentId: string): Promise<AgentLifecycleState>;
  transitionState(
    agentId: string,
    trigger: AgentLifecycleTrigger,
    metadata?: Record<string, unknown>,
  ): Promise<AgentStateHistoryEntry>;

  // Hook management
  registerHook(hook: LifecycleHook): void;
  unregisterHook(hookName: string): void;
  executeHooks(
    type: LifecycleHookType,
    context: LifecycleHookContext,
  ): Promise<LifecycleHookResult[]>;

  // Agent management
  createAgent(definition: AgentDefinition): Promise<AgentLifecycleRecord>;
  destroyAgent(agentId: string): Promise<void>;
  getAgentRecord(agentId: string): Promise<AgentLifecycleRecord | null>;

  // Monitoring and metrics
  getMetrics(agentId: string): Promise<LifecycleMetrics[]>;
  getPerformance(agentId: string): Promise<AgentPerformanceMetrics>;
  getHealth(agentId: string): Promise<HealthStatus>;

  // Configuration
  updateConfiguration(agentId: string, config: Partial<AgentLifecycleConfiguration>): Promise<void>;
  getConfiguration(agentId: string): Promise<AgentLifecycleConfiguration>;
}

/**
 * Lifecycle memory manager interface
 */
export interface LifecycleMemoryManager {
  // Record management
  storeLifecycleRecord(record: AgentLifecycleRecord): Promise<void>;
  getLifecycleRecord(agentId: string): Promise<AgentLifecycleRecord | null>;
  updateState(
    agentId: string,
    newState: AgentLifecycleState,
    transition: AgentStateHistoryEntry,
  ): Promise<void>;

  // Metrics storage
  storeMetrics(metrics: LifecycleMetrics): Promise<void>;
  queryMetrics(agentId: string, timeRange: { start: Date; end: Date }): Promise<LifecycleMetrics[]>;

  // Bulk operations
  bulkStore(records: AgentLifecycleRecord[]): Promise<void>;
  bulkQuery(agentIds: string[]): Promise<AgentLifecycleRecord[]>;

  // Cleanup and maintenance
  cleanup(retentionDays: number): Promise<number>;
  vacuum(): Promise<void>;
}

/**
 * Lifecycle communication manager interface
 */
export interface LifecycleCommunicationManager extends EventEmitter {
  // Event publishing
  publishStateChange(
    agentId: string,
    fromState: AgentLifecycleState,
    toState: AgentLifecycleState,
    trigger: AgentLifecycleTrigger,
  ): Promise<void>;

  publishEvent(event: LifecycleEvent): Promise<void>;

  // Subscriptions
  subscribeToAgent(
    agentId: string,
    callback: (event: LifecycleEvent) => void,
  ): Promise<EventSubscription>;
  subscribeToEvents(
    filter: Partial<LifecycleEvent>,
    callback: (event: LifecycleEvent) => void,
  ): Promise<EventSubscription>;

  // Broadcasting
  broadcastToCoordinators(event: LifecycleEvent): Promise<void>;
  broadcastToAgents(event: LifecycleEvent, agentIds?: string[]): Promise<void>;

  // Management
  unsubscribe(subscriptionId: string): Promise<void>;
  getSubscriptions(): EventSubscription[];
}

// ============================================================================
// Health and Status Types
// ============================================================================

/**
 * Health status levels
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  checks: {
    [checkName: string]: {
      status: HealthStatus;
      message?: string;
      duration: number;
      timestamp: Date;
    };
  };
  overall: {
    uptime: number;
    lastFailure?: Date;
    consecutiveFailures: number;
  };
}

// ============================================================================
// Legacy Compatibility Types
// ============================================================================

/**
 * Legacy agent adapter interface
 */
export interface LegacyAgentAdapter {
  adaptAgent(legacyAgent: any): AgentLifecycleRecord;
  adaptStateTransition(transition: any): AgentStateHistoryEntry;
  mapLegacyEvents(events: any[]): LifecycleEvent[];
  isLegacyAgent(agent: any): boolean;
}

/**
 * Migration result tracking
 */
export interface AgentMigrationResult {
  agentId: string;
  success: boolean;
  newState?: AgentLifecycleState;
  error?: string;
  duration?: number;
}

/**
 * Complete migration result
 */
export interface MigrationResult {
  totalAgents: number;
  successfulMigrations: number;
  failedMigrations: number;
  results: AgentMigrationResult[];
  duration: number;
  warnings?: string[];
}

// ============================================================================
// Configuration and Factory Types
// ============================================================================

/**
 * Lifecycle system configuration
 */
export interface LifecycleSystemConfig {
  statemachine: {
    enableValidation: boolean;
    allowUnknownStates: boolean;
    transitionTimeout: number;
  };
  hooks: {
    globalTimeout: number;
    maxConcurrentHooks: number;
    enableMetrics: boolean;
  };
  memory: {
    enablePersistence: boolean;
    retentionDays: number;
    compressionEnabled: boolean;
    replicationFactor: number;
  };
  communication: {
    router: MessageRouterConfig;
    enableBroadcast: boolean;
    messageTimeout: number;
  };
  errorHandling: {
    enableRecovery: boolean;
    maxRecoveryAttempts: number;
    degradationEnabled: boolean;
  };
  monitoring: {
    enableMetrics: boolean;
    metricsInterval: number;
    healthCheckInterval: number;
  };
}

/**
 * Factory for creating lifecycle managers
 */
export interface LifecycleManagerFactory {
  createManager(config: LifecycleSystemConfig): Promise<AgentLifecycleManager>;
  createMemoryManager(config: LifecycleSystemConfig['memory']): Promise<LifecycleMemoryManager>;
  createCommunicationManager(
    config: LifecycleSystemConfig['communication'],
  ): Promise<LifecycleCommunicationManager>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Priority queue item for hook execution
 */
export interface PriorityQueueItem<T> {
  item: T;
  priority: number;
  timestamp: Date;
}

/**
 * Time series store interface
 */
export interface TimeSeriesStore {
  store(
    key: string,
    data: any,
    options?: { timestamp?: Date; tags?: Record<string, string> },
  ): Promise<void>;
  query(
    key: string,
    options?: {
      timeRange?: { start: Date; end: Date };
      tags?: Record<string, string>;
      limit?: number;
      orderBy?: string;
    },
  ): Promise<any[]>;
}

/**
 * LRU Cache interface
 */
export interface LRUCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): boolean;
  clear(): void;
  size: number;
}

/**
 * Message router interface
 */
export interface MessageRouter {
  publish(topic: string, message: any): Promise<void>;
  subscribe(pattern: string, callback: (message: any) => void): Promise<EventSubscription>;
  unsubscribe(subscriptionId: string): Promise<void>;
}

// ============================================================================
// Export all types for external use
// ============================================================================

export type {
  // Core state machine types
  AgentLifecycleState,
  AgentLifecycleTrigger,
  AgentStateTransition,
  StateTransitionCondition,
  StateTransitionAction,
  RetryPolicy,

  // Hook system types
  LifecycleHookType,
  LifecycleHook,
  LifecycleHookContext,
  LifecycleHookResult,
  LifecycleHookHandler,
  LifecycleHookErrorHandler,
  HookCondition,
  HookExecution,

  // Memory schema types
  AgentLifecycleRecord,
  AgentStateHistoryEntry,
  AgentLifecycleMetadata,
  AgentLifecycleConfiguration,
  AgentResourceUsage,
  AgentPerformanceMetrics,
  LifecycleMetrics,

  // Communication types
  LifecycleEventType,
  LifecycleEvent,
  LifecycleEventData,
  EventSubscription,
  MessageRouterConfig,

  // Error handling types
  ErrorRecoveryStrategy,
  RecoveryResult,
  DegradationLevel,
  DegradationConfig,

  // Manager interfaces
  AgentLifecycleManager,
  LifecycleMemoryManager,
  LifecycleCommunicationManager,

  // Health and status types
  HealthStatus,
  HealthCheckResult,

  // Legacy compatibility types
  LegacyAgentAdapter,
  AgentMigrationResult,
  MigrationResult,

  // Configuration types
  LifecycleSystemConfig,
  LifecycleManagerFactory,
};
