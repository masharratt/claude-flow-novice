/**
 * Error Logging Type Definitions
 *
 * Core types and interfaces for the CFN Loop error logging system including:
 * - Error taxonomy and categorization
 * - Severity levels
 * - System diagnostics capture
 * - CFN Loop state tracking
 * - Error reporting and storage
 * - Correlation ID tracking
 * - Circuit breaker states
 *
 * @module cfn-error-logging/types
 */

// ===== ERROR TAXONOMY =====

/**
 * Error type enumeration for categorizing errors
 */
export enum ErrorType {
  ORCHESTRATOR = 'orchestrator',
  AGENT_SPAWN = 'agent-spawn',
  TIMEOUT = 'timeout',
  RESOURCE = 'resource',
  VALIDATION = 'validation',
  CONFIGURATION = 'configuration',
  DEPENDENCY = 'dependency',
  SYSTEM = 'system',
  NETWORK = 'network',
  REDIS = 'redis',
  DOCKER = 'docker',
  PROCESS = 'process',
  UNKNOWN = 'unknown',
}

/**
 * Severity levels for errors
 */
export enum SeverityLevel {
  CRITICAL = 'CRITICAL',
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

// ===== LOGGING BACKEND TYPES =====

/**
 * Supported logging backends
 */
export type LoggingBackend = 'file' | 'redis' | 'console' | 'all';

/**
 * Configuration for logging backends
 */
export interface LoggingBackendConfig {
  file?: {
    baseDir: string;
    maxSizeMb: number;
    retentionDays: number;
  };
  redis?: {
    host: string;
    port: number;
    db: number;
    keyPrefix: string;
  };
  console?: {
    enabled: boolean;
    formatJson: boolean;
  };
}

// ===== SYSTEM DIAGNOSTICS =====

/**
 * Hardware information
 */
export interface HardwareDiagnostics {
  cpuCores: number | string;
  memory: string;
  disk: string;
}

/**
 * Software version information
 */
export interface SoftwareDiagnostics {
  nodeVersion: string;
  npxVersion: string;
  dockerVersion: string;
  redisAvailable: boolean;
  redisConnected: boolean;
  redisInfo?: string;
}

/**
 * Environment variables snapshot
 */
export interface EnvironmentDiagnostics {
  path: string;
  home: string;
  shell: string;
  lang: string;
}

/**
 * Process information
 */
export interface ProcessDiagnostics {
  cfnRunning: number;
  totalProcesses: number | string;
}

/**
 * Complete system diagnostics
 */
export interface SystemDiagnostics {
  timestamp: string;
  hostname: string;
  user: string;
  workingDirectory: string;
  os: string;
  osVersion: string;
  architecture: string;
  hardware: HardwareDiagnostics;
  software: SoftwareDiagnostics;
  environment: EnvironmentDiagnostics;
  processes: ProcessDiagnostics;
}

// ===== CFN LOOP STATE =====

/**
 * Redis state information
 */
export interface RedisState {
  connected: boolean;
  taskContext?: Record<string, unknown>;
  trackedAgents: number;
  recentSignals: number;
  reason?: string;
}

/**
 * Checkpoint information
 */
export interface CheckpointState {
  available: boolean;
  lastIteration?: number;
  mode?: string;
  timestamp?: string;
}

/**
 * Temporary files information
 */
export interface TempFilesInfo {
  directory: string;
  fileCount: number;
}

/**
 * Complete CFN Loop state
 */
export interface CFNLoopState {
  taskId: string;
  timestamp: string;
  errorType: string;
  errorMessage: string;
  exitCode: number | null;
  redisState: RedisState;
  checkpoint: CheckpointState;
  tempFiles?: TempFilesInfo;
  context?: Record<string, unknown>;
}

// ===== ERROR CONTEXT & LOG =====

/**
 * Error context with metadata
 */
export interface ErrorContext {
  correlationId: string;
  timestamp: number;
  errorType: ErrorType;
  severity: SeverityLevel;
  message: string;
  exitCode?: number;
  stackTrace?: string;
  taskId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Complete error log entry
 */
export interface ErrorLogEntry {
  captureId: string;
  timestamp: string;
  unixTimestamp: number;
  error: {
    type: string;
    message: string;
    exitCode?: number;
    taskId?: string;
  };
  systemDiagnostics: SystemDiagnostics;
  cfnState: CFNLoopState;
  correlationId: string;
}

// ===== ERROR REPORT =====

/**
 * Troubleshooting step
 */
export interface TroubleshootingStep {
  number: number;
  action: string;
  status: 'completed' | 'pending' | 'failed';
}

/**
 * Error report (Markdown format)
 */
export interface ErrorReport {
  taskId: string;
  errorType: string;
  message: string;
  timestamp: string;
  exitCode: number | string;
  summary: string;
  likelyCause: string;
  recommendedAction: string;
  troubleshootingSteps: TroubleshootingStep[];
  systemState: {
    nodeVersion: string;
    npxVersion: string;
    redisConnected: boolean;
    memoryAvailable: string;
    diskAvailable: string;
  };
  format: 'markdown' | 'json';
}

/**
 * Error log query result
 */
export interface ErrorLogQuery {
  taskId: string;
  errorType: string;
  timestamp: string;
  message: string;
}

// ===== CIRCUIT BREAKER =====

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenRequests: number;
}

/**
 * Circuit breaker state
 */
export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  nextRetryTime?: number;
}

// ===== BATCHING & BUFFERING =====

/**
 * Batch buffer entry
 */
export interface BatchEntry {
  error: ErrorContext;
  addedAt: number;
}

/**
 * Batch configuration
 */
export interface BatchConfig {
  maxSize: number;
  maxWaitMs: number;
  enabled: boolean;
}

// ===== RETRY LOGIC =====

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// ===== LOGGER INTERFACE =====

/**
 * Logger interface for dependency injection
 */
export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ===== VALIDATION FUNCTIONS =====

/**
 * Validate error type
 */
export function isValidErrorType(type: unknown): type is ErrorType {
  return typeof type === 'string' && Object.values(ErrorType).includes(type as ErrorType);
}

/**
 * Validate severity level
 */
export function isValidSeverity(severity: unknown): severity is SeverityLevel {
  return (
    typeof severity === 'string' &&
    Object.values(SeverityLevel).includes(severity as SeverityLevel)
  );
}

/**
 * Validate correlation ID
 */
export function isValidCorrelationId(id: unknown): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 256;
}

/**
 * Validate task ID
 */
export function isValidTaskId(id: unknown): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 256;
}

/**
 * Validate error context
 */
export function isValidErrorContext(context: unknown): context is ErrorContext {
  if (typeof context !== 'object' || context === null) {
    return false;
  }

  const ctx = context as Record<string, unknown>;
  return (
    isValidCorrelationId(ctx.correlationId) &&
    typeof ctx.timestamp === 'number' &&
    ctx.timestamp > 0 &&
    isValidErrorType(ctx.errorType) &&
    isValidSeverity(ctx.severity) &&
    typeof ctx.message === 'string' &&
    ctx.message.length > 0
  );
}

/**
 * Validate system diagnostics
 */
export function isValidSystemDiagnostics(
  diagnostics: unknown
): diagnostics is SystemDiagnostics {
  if (typeof diagnostics !== 'object' || diagnostics === null) {
    return false;
  }

  const diag = diagnostics as Record<string, unknown>;
  return (
    typeof diag.timestamp === 'string' &&
    typeof diag.hostname === 'string' &&
    typeof diag.user === 'string' &&
    typeof diag.os === 'string'
  );
}

// ===== ERROR CLASSES =====

/**
 * Base error class for error logging system
 */
export class ErrorLoggingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorLoggingError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends ErrorLoggingError {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Storage error
 */
export class StorageError extends ErrorLoggingError {
  constructor(message: string, public readonly backend?: string) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Circuit breaker open error
 */
export class CircuitBreakerOpenError extends ErrorLoggingError {
  constructor(message: string, public readonly retryAfterMs?: number) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends ErrorLoggingError {
  constructor(message: string, public readonly timeoutMs?: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}
