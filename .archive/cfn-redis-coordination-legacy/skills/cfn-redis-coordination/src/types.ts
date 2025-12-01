/**
 * CFN Redis Coordination Types
 * 
 * Core type definitions for Redis coordination layer with strict mode awareness.
 * All Redis operations must respect Task Mode vs CLI Mode distinction.
 */

// Branded types for type safety
export type TaskId = string & { readonly __brand: 'TaskId' };
export type AgentId = string & { readonly __brand: 'AgentId' };
export type CorrelationId = string & { readonly __brand: 'CorrelationId' };

// Execution modes
export type ExecutionMode = 'task' | 'cli' | 'unknown';

/**
 * Mode Detection Result
 * 
 * Provides clear indication of which mode the agent is running in
 * and whether Redis operations are safe.
 */
export interface ModeDetection {
  mode: ExecutionMode;
  redisAvailable: boolean;
  taskIdPresent: boolean;
  agentIdPresent: boolean;
  canUseRedis: boolean;
  reason: string;
}

/**
 * Redis Configuration
 * 
 * Connection parameters with optional authentication.
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  retryStrategy?: (times: number) => number | null;
}

/**
 * Task Context
 * 
 * Structured context passed to agents via Redis in CLI Mode.
 * In Task Mode, this is passed directly via Task() tool parameters.
 */
export interface TaskContext {
  taskId: TaskId;
  epic?: string;
  scope?: {
    inScope: string[];
    outOfScope: string[];
  };
  deliverables?: string[];
  successCriteria?: string[];
  iteration?: number;
  mode?: 'mvp' | 'standard' | 'enterprise';
  timestamp?: string;
}

/**
 * Agent Completion Report
 * 
 * Structured data agents report when completing work.
 */
export interface CompletionReport {
  agentId: AgentId;
  taskId: TaskId;
  confidence: number;
  iteration: number;
  result: {
    status: 'complete' | 'failed' | 'blocked';
    deliverablesCreated?: string[];
    testsRun?: number;
    testsPassed?: number;
    testsFailed?: number;
    errors?: string[];
    metadata?: Record<string, unknown>;
  };
  timestamp: string;
}

/**
 * Test Results
 * 
 * Structured test execution results for gate checking.
 */
export interface TestResults {
  pass: number;
  fail: number;
  skip?: number;
  total: number;
  passRate: number;
  timestamp: string;
}

/**
 * Consensus Score
 * 
 * Validator feedback with confidence scoring.
 */
export interface ConsensusScore {
  agentId: AgentId;
  score: number; // 0.0 - 1.0
  feedback: string;
  iteration: number;
  timestamp: string;
}

/**
 * Coordination Error Types
 */
export enum CoordinationErrorType {
  MODE_MISMATCH = 'MODE_MISMATCH',           // Attempting Redis ops in Task Mode
  REDIS_UNAVAILABLE = 'REDIS_UNAVAILABLE',   // Redis connection failed
  TIMEOUT = 'TIMEOUT',                       // Operation timed out
  VALIDATION_ERROR = 'VALIDATION_ERROR',     // Invalid input parameters
  MISSING_CONTEXT = 'MISSING_CONTEXT',       // Required context not found
  INVALID_STATE = 'INVALID_STATE',           // Invalid operation for current state
}

/**
 * Coordination Error
 * 
 * Typed error for coordination failures with mode awareness.
 */
export class CoordinationError extends Error {
  constructor(
    public readonly type: CoordinationErrorType,
    message: string,
    public readonly mode?: ExecutionMode,
    public readonly canRetry: boolean = false
  ) {
    super(message);
    this.name = 'CoordinationError';
    Object.setPrototypeOf(this, CoordinationError.prototype);
  }
}

/**
 * Logger Interface
 * 
 * Abstraction for logging to allow dependency injection.
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

/**
 * Redis Operation Options
 * 
 * Options for individual Redis operations.
 */
export interface RedisOperationOptions {
  /** Skip mode validation (for internal use only) */
  skipModeCheck?: boolean;
  /** Operation timeout in milliseconds */
  timeout?: number;
  /** Retry on failure */
  retry?: boolean;
  /** Max retry attempts */
  maxRetries?: number;
}

/**
 * Validation Result
 * 
 * Result of input validation with specific errors.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Type guards and validators
 */

export function isValidTaskId(value: unknown): value is TaskId {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9_-]{1,256}$/.test(value) &&
    value.length > 0
  );
}

export function isValidAgentId(value: unknown): value is AgentId {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9_-]{1,256}$/.test(value) &&
    value.length > 0
  );
}

export function isValidConfidence(value: unknown): value is number {
  return typeof value === 'number' && value >= 0.0 && value <= 1.0;
}

export function validateTaskId(value: string): TaskId {
  if (!isValidTaskId(value)) {
    throw new CoordinationError(
      CoordinationErrorType.VALIDATION_ERROR,
      `Invalid task ID format: ${value}. Must be 1-256 alphanumeric, underscore, or hyphen characters.`
    );
  }
  return value as TaskId;
}

export function validateAgentId(value: string): AgentId {
  if (!isValidAgentId(value)) {
    throw new CoordinationError(
      CoordinationErrorType.VALIDATION_ERROR,
      `Invalid agent ID format: ${value}. Must be 1-256 alphanumeric, underscore, or hyphen characters.`
    );
  }
  return value as AgentId;
}

export function validateConfidence(value: number): number {
  if (!isValidConfidence(value)) {
    throw new CoordinationError(
      CoordinationErrorType.VALIDATION_ERROR,
      `Invalid confidence value: ${value}. Must be between 0.0 and 1.0.`
    );
  }
  return value;
}
