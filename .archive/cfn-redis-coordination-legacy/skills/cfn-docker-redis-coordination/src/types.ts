/**
 * Redis Coordination Type Definitions
 *
 * Core types and interfaces for Redis-based task coordination including:
 * - Task and agent management
 * - Consensus tracking
 * - Agent status lifecycle
 * - Confidence scoring
 * - Error handling with typed codes
 *
 * @module cfn-docker-redis-coordination/types
 */

// ===== EXECUTION MODE TYPES =====

export type ExecutionMode = 'mvp' | 'standard' | 'enterprise';

// ===== TASK & AGENT TYPES =====

/**
 * Task context stored in Redis
 */
export interface TaskContext {
  [key: string]: string | number | boolean;
}

/**
 * Agent information and status
 */
export interface AgentInfo {
  agent_id: string;
  agent_type: string;
  container_id?: string;
  task_id: string;
  status: AgentStatus;
  iteration: number;
  created_at: string; // ISO 8601 timestamp
  updated_at?: string; // ISO 8601 timestamp
}

/**
 * Agent lifecycle statuses
 */
export type AgentStatus =
  | 'spawning'
  | 'running'
  | 'working'
  | 'completed'
  | 'failed'
  | 'timeout';

/**
 * Status history entry
 */
export interface StatusHistoryEntry {
  status: AgentStatus;
  timestamp: string; // ISO 8601 timestamp
}

// ===== CONFIDENCE & CONSENSUS TYPES =====

/**
 * Agent confidence/completion result
 */
export interface ConfidenceResult {
  confidence: number; // 0.0 to 1.0
  iteration: number;
  reported_at: string; // ISO 8601 timestamp
  agent_type: string;
}

/**
 * Consensus result for a loop
 */
export interface ConsensusResult {
  total_validators: number;
  responses_received: number;
  average_confidence: number;
  consensus_reached: boolean;
  decision: 'PROCEED' | 'ITERATE' | 'COMPLETE' | 'ABORT';
  collected_at: string; // ISO 8601 timestamp
}

// ===== CONFIGURATION TYPES =====

/**
 * Redis connection configuration
 */
export interface RedisConfig {
  host: string;
  port: number;
  db: number;
  password?: string;
  timeout?: number; // milliseconds
  retryStrategy?: (times: number) => number;
}

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  redis: RedisConfig;
  taskId: string;
  defaultTimeout?: number; // seconds
  defaultTTL?: number; // seconds
  mode?: ExecutionMode;
  verbose?: boolean;
}

// ===== MODE-SPECIFIC THRESHOLDS =====

/**
 * Mode-specific consensus thresholds
 */
export interface ModeThresholds {
  mvp: number;
  standard: number;
  enterprise: number;
}

// ===== WAIT LOOP TYPES =====

/**
 * Parameters for waiting on loop completion
 */
export interface WaitLoopParams {
  taskId: string;
  loopNumber: number;
  agentCount: number;
  timeout?: number; // seconds
  verbose?: boolean;
}

/**
 * Result of wait_loop operation
 */
export interface WaitLoopResult {
  success: boolean;
  completedAgents: number;
  expectedAgents: number;
  executionTime: number; // milliseconds
  message: string;
}

// ===== CONSENSUS COLLECTION TYPES =====

/**
 * Parameters for consensus collection
 */
export interface CollectConsensusParams {
  taskId: string;
  loopNumber: number;
  requiredConsensus: number; // 0.0 to 1.0
  timeout?: number; // seconds
  verbose?: boolean;
}

/**
 * Result of consensus collection
 */
export interface CollectConsensusResult {
  success: boolean;
  totalValidators: number;
  responsesReceived: number;
  averageConfidence: number;
  consensusReached: boolean;
  decision: 'PROCEED' | 'ITERATE' | 'COMPLETE' | 'ABORT';
  executionTime: number; // milliseconds
  message: string;
}

// ===== LOGGER INTERFACE =====

export interface ILogger {
  log(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

// ===== ERROR TYPES =====

export class CoordinationError extends Error {
  constructor(
    message: string,
    public code: string,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CoordinationError';
  }
}

export class ValidationError extends CoordinationError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', metadata);
    this.name = 'ValidationError';
  }
}

export class SecurityError extends CoordinationError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'SECURITY_ERROR', metadata);
    this.name = 'SecurityError';
  }
}

export class TimeoutError extends CoordinationError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'TIMEOUT_ERROR', metadata);
    this.name = 'TimeoutError';
  }
}

export class RedisConnectionError extends CoordinationError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'REDIS_CONNECTION_ERROR', metadata);
    this.name = 'RedisConnectionError';
  }
}

// ===== REDIS CLIENT INTERFACE =====

export interface IRedisClient {
  // Key operations
  exists(key: string): Promise<boolean>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  dbsize(): Promise<number>;
  flushdb(): Promise<string>;

  // String operations
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string>;
  setex(key: string, seconds: number, value: string): Promise<string>;

  // Hash operations
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, fields: Record<string, string | number | boolean>): Promise<number>;
  hmset(key: string, fields: Record<string, string | number | boolean>): Promise<string>;
  hgetall(key: string): Promise<Record<string, string>>;
  hkeys(key: string): Promise<string[]>;
  hvals(key: string): Promise<string[]>;

  // List operations
  lpush(key: string, values: string[]): Promise<number>;
  rpush(key: string, values: string[]): Promise<number>;
  blpop(keys: string[], timeout: number): Promise<[string, string] | null>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;

  // Set operations
  sadd(key: string, members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;

  // Key expiration
  expire(key: string, seconds: number): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  ttl(key: string): Promise<number>;

  // Connection
  ping(): Promise<string>;
  info(section?: string): Promise<string>;
  quit(): Promise<void>;
}

// ===== VALIDATION HELPERS =====

/**
 * Type guard to check if a value is a valid ExecutionMode
 */
export function isValidExecutionMode(value: unknown): value is ExecutionMode {
  return value === 'mvp' || value === 'standard' || value === 'enterprise';
}

/**
 * Type guard to check if a value is a valid AgentStatus
 */
export function isValidAgentStatus(value: unknown): value is AgentStatus {
  const validStatuses: AgentStatus[] = [
    'spawning',
    'running',
    'working',
    'completed',
    'failed',
    'timeout',
  ];
  return validStatuses.includes(value as AgentStatus);
}

/**
 * Validate confidence value
 */
export function isValidConfidence(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1;
}

/**
 * Validate task ID (prevent path traversal and injection)
 */
export function isValidTaskId(taskId: unknown): taskId is string {
  if (typeof taskId !== 'string' || taskId.length === 0 || taskId.length > 256) {
    return false;
  }
  // Allow alphanumeric, hyphens, underscores only (prevent injection)
  return /^[a-zA-Z0-9_-]+$/.test(taskId);
}

/**
 * Validate agent ID (prevent path traversal and injection)
 */
export function isValidAgentId(agentId: unknown): agentId is string {
  if (typeof agentId !== 'string' || agentId.length === 0 || agentId.length > 256) {
    return false;
  }
  return /^[a-zA-Z0-9_-]+$/.test(agentId);
}

/**
 * Validate Redis config
 */
export function isValidRedisConfig(config: unknown): config is RedisConfig {
  if (typeof config !== 'object' || config === null) {
    return false;
  }

  const redisConfig = config as Record<string, unknown>;
  return (
    typeof redisConfig.host === 'string' &&
    typeof redisConfig.port === 'number' &&
    redisConfig.port > 0 &&
    redisConfig.port < 65536 &&
    typeof redisConfig.db === 'number' &&
    redisConfig.db >= 0 &&
    redisConfig.db < 16 &&
    (redisConfig.password === undefined || typeof redisConfig.password === 'string') &&
    (redisConfig.timeout === undefined || typeof redisConfig.timeout === 'number')
  );
}

// ===== EXPORTS =====

export default {
  isValidExecutionMode,
  isValidAgentStatus,
  isValidConfidence,
  isValidTaskId,
  isValidAgentId,
  isValidRedisConfig,
};
