/**
 * Enhanced Retry Manager with Circuit Breaker Integration
 *
 * Provides advanced retry logic with:
 * - Exponential backoff with jitter
 * - Circuit breaker integration
 * - Correlation ID tracking
 * - Configurable retry policies
 * - Detailed retry attempt logging
 * - Retryable error classification
 *
 * Part of HIGH-PRIORITY retry logic implementation
 *
 * Usage:
 *   const manager = new RetryManager({ correlationId: 'req-123' });
 *   const result = await manager.executeWithRetry(
 *     async () => await databaseQuery(),
 *     { maxAttempts: 3, baseDelayMs: 1000 }
 *   );
 */

import { withRetry, RetryOptions, RetryStats, sleep } from './retry.js';
import { StandardError, ErrorCode, isRetryableError } from './errors.js';
import { createLogger } from './logging.js';

const logger = createLogger('retry-manager');

/**
 * Circuit breaker state
 */
export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject all requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit (default: 5) */
  failureThreshold?: number;
  /** Success threshold to close circuit from half-open (default: 2) */
  successThreshold?: number;
  /** Timeout in ms before attempting recovery (default: 60000) */
  openTimeoutMs?: number;
  /** Enable circuit breaker (default: false) */
  enabled?: boolean;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /** Policy name for logging */
  name: string;
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Use exponential backoff */
  exponential: boolean;
  /** Add jitter to delays */
  jitter: boolean;
  /** Custom retry condition */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Predefined retry policies
 */
export const RetryPolicies = {
  /** Quick retry for fast operations (3 attempts, 500ms base, 5s max) */
  QUICK: {
    name: 'QUICK',
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    exponential: true,
    jitter: true,
  } as RetryPolicy,

  /** Standard retry for typical operations (3 attempts, 1s base, 30s max) */
  STANDARD: {
    name: 'STANDARD',
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    exponential: true,
    jitter: true,
  } as RetryPolicy,

  /** Aggressive retry for critical operations (5 attempts, 2s base, 60s max) */
  AGGRESSIVE: {
    name: 'AGGRESSIVE',
    maxAttempts: 5,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    exponential: true,
    jitter: true,
  } as RetryPolicy,

  /** Database-specific retry (3 attempts, 1s base, 30s max, only retryable errors) */
  DATABASE: {
    name: 'DATABASE',
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    exponential: true,
    jitter: true,
    shouldRetry: (error: Error) => {
      // Only retry specific database errors
      if (error instanceof StandardError) {
        return error.isRetryable;
      }
      return isRetryableError(error);
    },
  } as RetryPolicy,

  /** Network-specific retry (4 attempts, 2s base, 45s max) */
  NETWORK: {
    name: 'NETWORK',
    maxAttempts: 4,
    baseDelayMs: 2000,
    maxDelayMs: 45000,
    exponential: true,
    jitter: true,
    shouldRetry: (error: Error) => {
      if (error instanceof StandardError) {
        return error.code === ErrorCode.NETWORK_ERROR || error.isRetryable;
      }
      return isRetryableError(error);
    },
  } as RetryPolicy,

  /** File system retry (2 attempts, 500ms base, 5s max) */
  FILE_SYSTEM: {
    name: 'FILE_SYSTEM',
    maxAttempts: 2,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    exponential: false,
    jitter: false,
  } as RetryPolicy,
};

/**
 * Retry manager configuration
 */
export interface RetryManagerConfig {
  /** Correlation ID for tracking related operations */
  correlationId?: string;
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerConfig;
  /** Default retry policy */
  defaultPolicy?: RetryPolicy;
  /** Enable detailed logging */
  enableLogging?: boolean;
}

/**
 * Retry attempt metadata
 */
export interface RetryAttemptMetadata {
  attemptNumber: number;
  correlationId?: string;
  error: Error;
  delayMs: number;
  timestamp: Date;
  policyName?: string;
}

/**
 * Enhanced Retry Manager with circuit breaker and correlation tracking
 */
export class RetryManager {
  private readonly config: Required<RetryManagerConfig>;
  private circuitState: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private retryAttempts: RetryAttemptMetadata[] = [];

  constructor(config: RetryManagerConfig = {}) {
    this.config = {
      correlationId: config.correlationId,
      circuitBreaker: {
        failureThreshold: 5,
        successThreshold: 2,
        openTimeoutMs: 60000,
        enabled: false,
        ...config.circuitBreaker,
      },
      defaultPolicy: config.defaultPolicy || RetryPolicies.STANDARD,
      enableLogging: config.enableLogging ?? true,
    };
  }

  /**
   * Execute operation with retry logic
   *
   * @param fn - Async function to execute
   * @param policyOrOptions - Retry policy or custom options
   * @returns Result of the function
   * @throws Error if all retry attempts fail or circuit is open
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    policyOrOptions?: RetryPolicy | RetryOptions
  ): Promise<T> {
    // Check circuit breaker
    if (this.config.circuitBreaker.enabled) {
      this.checkCircuitBreaker();
    }

    // Determine retry options
    const options = this.buildRetryOptions(policyOrOptions);
    const policyName = (policyOrOptions as RetryPolicy)?.name;

    // Clear retry attempts for new operation
    this.retryAttempts = [];

    // Log operation start
    if (this.config.enableLogging) {
      logger.debug('Starting operation with retry', {
        correlationId: this.config.correlationId,
        policy: policyName || 'custom',
        maxAttempts: options.maxAttempts,
        circuitState: this.circuitState,
      });
    }

    try {
      // Execute with retry
      const result = await withRetry(fn, {
        ...options,
        onRetry: (attempt, error, delayMs) => {
          // Track retry attempt
          this.retryAttempts.push({
            attemptNumber: attempt,
            correlationId: this.config.correlationId,
            error,
            delayMs,
            timestamp: new Date(),
            policyName,
          });

          // Log retry attempt
          if (this.config.enableLogging) {
            logger.warn('Retry attempt', {
              correlationId: this.config.correlationId,
              attempt,
              maxAttempts: options.maxAttempts,
              error: error.message,
              delayMs,
              policyName,
              isRetryable: error instanceof StandardError ? error.isRetryable : isRetryableError(error),
            });
          }

          // Call custom onRetry if provided
          if (options.onRetry) {
            options.onRetry(attempt, error, delayMs);
          }
        },
      });

      // Record success for circuit breaker
      if (this.config.circuitBreaker.enabled) {
        this.recordSuccess();
      }

      // Log success
      if (this.config.enableLogging) {
        logger.debug('Operation succeeded', {
          correlationId: this.config.correlationId,
          retryAttempts: this.retryAttempts.length,
          circuitState: this.circuitState,
        });
      }

      return result;
    } catch (error) {
      // Record failure for circuit breaker
      if (this.config.circuitBreaker.enabled) {
        this.recordFailure();
      }

      // Log failure
      if (this.config.enableLogging) {
        logger.error('Operation failed after retries', {
          correlationId: this.config.correlationId,
          retryAttempts: this.retryAttempts.length,
          finalError: error instanceof Error ? error.message : String(error),
          circuitState: this.circuitState,
        });
      }

      throw error;
    }
  }

  /**
   * Execute operation with retry and return statistics
   *
   * @param fn - Async function to execute
   * @param policyOrOptions - Retry policy or custom options
   * @returns Result and retry statistics
   */
  async executeWithRetryStats<T>(
    fn: () => Promise<T>,
    policyOrOptions?: RetryPolicy | RetryOptions
  ): Promise<{ result: T; stats: RetryStats; attempts: RetryAttemptMetadata[] }> {
    const startTime = Date.now();
    let result: T;

    try {
      result = await this.executeWithRetry(fn, policyOrOptions);
    } catch (error) {
      const stats: RetryStats = {
        totalAttempts: this.retryAttempts.length + 1,
        succeeded: false,
        totalTimeMs: Date.now() - startTime,
        delays: this.retryAttempts.map((a) => a.delayMs),
        errors: this.retryAttempts.map((a) => a.error),
      };
      throw error;
    }

    const stats: RetryStats = {
      totalAttempts: this.retryAttempts.length + 1,
      succeeded: true,
      totalTimeMs: Date.now() - startTime,
      delays: this.retryAttempts.map((a) => a.delayMs),
      errors: this.retryAttempts.map((a) => a.error),
    };

    return {
      result,
      stats,
      attempts: [...this.retryAttempts],
    };
  }

  /**
   * Get current circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitState;
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitStats() {
    return {
      state: this.circuitState,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Manually reset circuit breaker
   */
  resetCircuit(): void {
    this.circuitState = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;

    if (this.config.enableLogging) {
      logger.info('Circuit breaker manually reset', {
        correlationId: this.config.correlationId,
      });
    }
  }

  /**
   * Build retry options from policy or custom options
   */
  private buildRetryOptions(policyOrOptions?: RetryPolicy | RetryOptions): RetryOptions {
    if (!policyOrOptions) {
      // Use default policy
      return {
        maxAttempts: this.config.defaultPolicy.maxAttempts,
        baseDelayMs: this.config.defaultPolicy.baseDelayMs,
        maxDelayMs: this.config.defaultPolicy.maxDelayMs,
        exponential: this.config.defaultPolicy.exponential,
        jitter: this.config.defaultPolicy.jitter,
        shouldRetry: this.config.defaultPolicy.shouldRetry,
      };
    }

    // Check if it's a retry policy
    if ('name' in policyOrOptions) {
      const policy = policyOrOptions as RetryPolicy;
      return {
        maxAttempts: policy.maxAttempts,
        baseDelayMs: policy.baseDelayMs,
        maxDelayMs: policy.maxDelayMs,
        exponential: policy.exponential,
        jitter: policy.jitter,
        shouldRetry: policy.shouldRetry,
      };
    }

    // It's custom retry options
    return policyOrOptions as RetryOptions;
  }

  /**
   * Check circuit breaker state and throw if open
   */
  private checkCircuitBreaker(): void {
    const now = Date.now();

    switch (this.circuitState) {
      case CircuitState.OPEN:
        // Check if timeout has elapsed
        if (
          this.lastFailureTime &&
          now - this.lastFailureTime.getTime() >= this.config.circuitBreaker.openTimeoutMs
        ) {
          // Transition to half-open
          this.circuitState = CircuitState.HALF_OPEN;
          this.successCount = 0;

          if (this.config.enableLogging) {
            logger.info('Circuit breaker transitioning to half-open', {
              correlationId: this.config.correlationId,
              timeSinceOpen: now - this.lastFailureTime.getTime(),
            });
          }
        } else {
          // Circuit is still open, reject request
          throw new StandardError(
            ErrorCode.OPERATION_TIMEOUT,
            'Circuit breaker is open - service unavailable',
            {
              circuitState: this.circuitState,
              failureCount: this.failureCount,
              timeSinceOpen: this.lastFailureTime
                ? now - this.lastFailureTime.getTime()
                : 0,
            },
            undefined,
            false // Not retryable
          );
        }
        break;

      case CircuitState.HALF_OPEN:
        // Allow request through for testing
        if (this.config.enableLogging) {
          logger.debug('Allowing request through half-open circuit', {
            correlationId: this.config.correlationId,
            successCount: this.successCount,
            successThreshold: this.config.circuitBreaker.successThreshold,
          });
        }
        break;

      case CircuitState.CLOSED:
        // Normal operation
        break;
    }
  }

  /**
   * Record successful operation for circuit breaker
   */
  private recordSuccess(): void {
    switch (this.circuitState) {
      case CircuitState.HALF_OPEN:
        this.successCount++;

        if (this.successCount >= this.config.circuitBreaker.successThreshold) {
          // Close the circuit
          this.circuitState = CircuitState.CLOSED;
          this.failureCount = 0;
          this.successCount = 0;

          if (this.config.enableLogging) {
            logger.info('Circuit breaker closed after recovery', {
              correlationId: this.config.correlationId,
            });
          }
        }
        break;

      case CircuitState.CLOSED:
        // Reset failure count on success
        if (this.failureCount > 0) {
          this.failureCount = 0;
        }
        break;
    }
  }

  /**
   * Record failed operation for circuit breaker
   */
  private recordFailure(): void {
    this.lastFailureTime = new Date();

    switch (this.circuitState) {
      case CircuitState.HALF_OPEN:
        // Failed during recovery, reopen circuit
        this.circuitState = CircuitState.OPEN;
        this.successCount = 0;

        if (this.config.enableLogging) {
          logger.warn('Circuit breaker reopened after failed recovery', {
            correlationId: this.config.correlationId,
          });
        }
        break;

      case CircuitState.CLOSED:
        this.failureCount++;

        if (this.failureCount >= this.config.circuitBreaker.failureThreshold) {
          // Open the circuit
          this.circuitState = CircuitState.OPEN;

          if (this.config.enableLogging) {
            logger.error('Circuit breaker opened due to failures', {
              correlationId: this.config.correlationId,
              failureCount: this.failureCount,
              threshold: this.config.circuitBreaker.failureThreshold,
            });
          }
        }
        break;
    }
  }
}

/**
 * Create a retry manager instance with correlation ID
 *
 * @param correlationId - Correlation ID for tracking
 * @param config - Additional configuration
 * @returns RetryManager instance
 */
export function createRetryManager(
  correlationId?: string,
  config?: Omit<RetryManagerConfig, 'correlationId'>
): RetryManager {
  return new RetryManager({
    ...config,
    correlationId,
  });
}

/**
 * Execute operation with standard retry policy
 *
 * @param fn - Async function to execute
 * @param correlationId - Optional correlation ID
 * @returns Result of the function
 */
export async function withStandardRetry<T>(
  fn: () => Promise<T>,
  correlationId?: string
): Promise<T> {
  const manager = createRetryManager(correlationId);
  return manager.executeWithRetry(fn, RetryPolicies.STANDARD);
}

/**
 * Execute database operation with retry policy
 *
 * @param fn - Async function to execute
 * @param correlationId - Optional correlation ID
 * @returns Result of the function
 */
export async function withDatabaseRetry<T>(
  fn: () => Promise<T>,
  correlationId?: string
): Promise<T> {
  const manager = createRetryManager(correlationId);
  return manager.executeWithRetry(fn, RetryPolicies.DATABASE);
}

/**
 * Execute network operation with retry policy
 *
 * @param fn - Async function to execute
 * @param correlationId - Optional correlation ID
 * @returns Result of the function
 */
export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  correlationId?: string
): Promise<T> {
  const manager = createRetryManager(correlationId);
  return manager.executeWithRetry(fn, RetryPolicies.NETWORK);
}

/**
 * Execute file system operation with retry policy
 *
 * @param fn - Async function to execute
 * @param correlationId - Optional correlation ID
 * @returns Result of the function
 */
export async function withFileSystemRetry<T>(
  fn: () => Promise<T>,
  correlationId?: string
): Promise<T> {
  const manager = createRetryManager(correlationId);
  return manager.executeWithRetry(fn, RetryPolicies.FILE_SYSTEM);
}
