/**
 * Type Definitions for Trigger.dev CFN Loop Integration
 *
 * Provides strong TypeScript typing for all Docker container operations,
 * error handling, and environment configuration.
 */

/**
 * Environment configuration validated at startup
 */
export interface EnvironmentConfig {
  // Required API configuration
  triggerApiKey: string;
  triggerProjectSlug: string;

  // API endpoints
  triggerApiUrl: string;

  // Docker configuration
  dockerHost?: string;
  dockerSocket?: string;

  // Workspace configuration
  workspacePath: string;

  // Optional configuration
  triggerOrgSlug?: string;
}

/**
 * Result of spawning an agent container
 */
export interface AgentSpawnResult {
  // Execution metadata
  success: boolean;
  exitCode: number;
  containerName: string;
  executionTimeMs: number;

  // Agent information
  agentType: string;
  taskId: string;

  // Output and errors
  stdout: string;
  stderr: string;

  // Execution details
  startTime: Date;
  endTime: Date;
}

/**
 * Error raised during container execution
 */
export interface ContainerExecutionError extends Error {
  // Standard Error fields
  message: string;
  name: string;

  // Container execution details
  containerName: string;
  exitCode: number;
  stdout: string;
  stderr: string;

  // Execution timing
  executionTimeMs: number;

  // Error context
  timestamp: Date;
  recoverable: boolean;
}

/**
 * Volume mount configuration for container
 */
export interface VolumeMountConfig {
  // Source path (on host)
  sourcePath: string;

  // Destination path (in container)
  containerPath: string;

  // Access mode: read-only or read-write
  mode: 'ro' | 'rw';

  // Validation result
  valid: boolean;
  validationError?: string;
}

/**
 * Docker network configuration
 */
export interface DockerNetworkConfig {
  // Network name
  name: string;

  // Network exists
  exists: boolean;

  // Should create if missing
  autoCreate: boolean;

  // Fallback behavior
  fallbackNetwork?: string;
}

/**
 * Helper type for validated environment
 */
export type ValidatedEnvironment = Required<EnvironmentConfig> & {
  validated: true;
  validationTime: Date;
};

/**
 * Type guard for environment validation
 */
export function isValidatedEnvironment(env: any): env is ValidatedEnvironment {
  return (
    env &&
    typeof env.triggerApiKey === 'string' &&
    typeof env.triggerProjectSlug === 'string' &&
    typeof env.triggerApiUrl === 'string' &&
    typeof env.workspacePath === 'string' &&
    env.validated === true &&
    env.validationTime instanceof Date
  );
}

/**
 * Type guard for container execution errors
 */
export function isContainerExecutionError(error: any): error is ContainerExecutionError {
  return (
    error &&
    typeof error.message === 'string' &&
    typeof error.containerName === 'string' &&
    typeof error.exitCode === 'number' &&
    typeof error.stdout === 'string' &&
    typeof error.stderr === 'string'
  );
}

/**
 * Agent spawn error with complete context
 */
export class AgentSpawnError extends Error implements ContainerExecutionError {
  name = 'AgentSpawnError';
  containerName: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  timestamp: Date = new Date();
  recoverable: boolean = false;

  constructor(options: {
    message: string;
    containerName: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    executionTimeMs: number;
    recoverable?: boolean;
  }) {
    super(options.message);
    this.containerName = options.containerName;
    this.exitCode = options.exitCode;
    this.stdout = options.stdout;
    this.stderr = options.stderr;
    this.executionTimeMs = options.executionTimeMs;
    this.recoverable = options.recoverable ?? false;

    // Maintain prototype chain for instanceof checks
    Object.setPrototypeOf(this, AgentSpawnError.prototype);
  }

  /**
   * Format error for logging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      containerName: this.containerName,
      exitCode: this.exitCode,
      executionTimeMs: this.executionTimeMs,
      timestamp: this.timestamp.toISOString(),
      recoverable: this.recoverable,
      stdout: this.stdout.substring(0, 500), // Truncate for logs
      stderr: this.stderr.substring(0, 500),
    };
  }
}

/**
 * Environment validation error
 */
export class EnvironmentValidationError extends Error {
  name = 'EnvironmentValidationError';
  errors: string[] = [];

  constructor(errors: string[]) {
    super(`Environment validation failed: ${errors.join('; ')}`);
    this.errors = errors;
    Object.setPrototypeOf(this, EnvironmentValidationError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      errors: this.errors,
    };
  }
}

/**
 * Volume validation error
 */
export class VolumeValidationError extends Error {
  name = 'VolumeValidationError';
  path: string;
  reason: string;

  constructor(path: string, reason: string) {
    super(`Volume validation failed for "${path}": ${reason}`);
    this.path = path;
    this.reason = reason;
    Object.setPrototypeOf(this, VolumeValidationError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      path: this.path,
      reason: this.reason,
    };
  }
}
