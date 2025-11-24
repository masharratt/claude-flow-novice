/**
 * Resilience Utilities - Phase 6 #3
 *
 * Provides retry logic with exponential backoff, circuit breakers,
 * timeout enforcement, and graceful degradation patterns for
 * enterprise-grade error handling.
 */

import { recordMetric } from './metrics';

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNRESET',
    'EPIPE',
    'NETWORK_ERROR',
    'RATE_LIMIT',
    'SERVICE_UNAVAILABLE'
  ]
};

/**
 * Execute operation with retry logic and exponential backoff
 *
 * @param operation - Async operation to execute
 * @param config - Retry configuration
 * @returns Result of successful operation
 * @throws Error if all retries exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      const result = await operation();

      // Track success metrics
      if (attempt > 1) {
        recordMetric('retry.success', 1, {
          operation: operation.name || 'unknown',
          attempts: attempt
        });
      }

      return result;
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const isRetryable = isRetryableError(error as Error, cfg.retryableErrors);

      if (!isRetryable || attempt === cfg.maxAttempts) {
        // Track final failure
        recordMetric('retry.failure', 1, {
          operation: operation.name || 'unknown',
          attempts: attempt,
          error: (error as Error).message
        });
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        cfg.baseDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
        cfg.maxDelayMs
      );

      // Track retry attempt
      recordMetric('retry.attempt', 1, {
        operation: operation.name || 'unknown',
        attempt,
        delay
      });

      // Call retry callback if provided
      if (cfg.onRetry) {
        cfg.onRetry(attempt, error as Error);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError!;
}

function isRetryableError(error: Error, retryableErrors?: string[]): boolean {
  if (!retryableErrors) return true;

  const errorCode = (error as any).code || '';
  const errorMessage = error.message || '';

  return retryableErrors.some(
    code => errorCode === code || errorMessage.includes(code)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Circuit Breaker Pattern
// ============================================================================

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;        // 0.5 = 50%
  minimumRequests: number;          // Minimum requests before evaluation
  recoveryTimeoutMs: number;        // Time before attempting recovery
  onStateChange?: (oldState: CircuitState, newState: CircuitState) => void;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  successCount: number;
  failureCount: number;
  totalRequests: number;
  failureRate: number;
  lastFailureTime?: Date;
  lastStateChange: Date;
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private successCount: number = 0;
  private failureCount: number = 0;
  private lastFailureTime?: Date;
  private lastStateChange: Date = new Date();
  private recoveryTimer?: NodeJS.Timeout;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      // Check if recovery timeout has elapsed
      if (this.shouldAttemptRecovery()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        // Fast fail
        const error = new Error(`Circuit breaker ${this.config.name} is OPEN`);
        (error as any).circuitOpen = true;
        throw error;
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;

    // Close circuit if in HALF_OPEN state
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.CLOSED);
      this.reset();
    }

    this.recordMetrics();
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    // Open circuit if threshold exceeded
    if (this.shouldOpenCircuit()) {
      this.transitionTo(CircuitState.OPEN);
      this.scheduleRecovery();
    }

    // Reopen circuit if failed in HALF_OPEN state
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      this.scheduleRecovery();
    }

    this.recordMetrics();
  }

  private shouldOpenCircuit(): boolean {
    const totalRequests = this.successCount + this.failureCount;

    // Need minimum requests before evaluation
    if (totalRequests < this.config.minimumRequests) {
      return false;
    }

    const failureRate = this.failureCount / totalRequests;
    return failureRate >= this.config.failureThreshold;
  }

  private shouldAttemptRecovery(): boolean {
    if (!this.lastFailureTime) return true;

    const elapsed = Date.now() - this.lastFailureTime.getTime();
    return elapsed >= this.config.recoveryTimeoutMs;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();

    // Call state change callback
    if (this.config.onStateChange) {
      this.config.onStateChange(oldState, newState);
    }

    // Record state change metric
    recordMetric('circuit.state_change', 1, {
      name: this.config.name,
      from: oldState,
      to: newState
    });
  }

  private scheduleRecovery(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }

    this.recoveryTimer = setTimeout(() => {
      if (this.state === CircuitState.OPEN) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }, this.config.recoveryTimeoutMs);
  }

  private reset(): void {
    this.successCount = 0;
    this.failureCount = 0;
    this.lastFailureTime = undefined;
  }

  private recordMetrics(): void {
    const stats = this.getStats();

    recordMetric('circuit.state', 1, {
      name: this.config.name,
      state: stats.state
    });

    recordMetric('circuit.failure_rate', stats.failureRate, {
      name: this.config.name
    });

    recordMetric('circuit.requests', stats.totalRequests, {
      name: this.config.name,
      successes: stats.successCount,
      failures: stats.failureCount
    });
  }

  public getState(): CircuitState {
    return this.state;
  }

  public getStats(): CircuitBreakerStats {
    const totalRequests = this.successCount + this.failureCount;
    const failureRate = totalRequests > 0 ? this.failureCount / totalRequests : 0;

    return {
      state: this.state,
      successCount: this.successCount,
      failureCount: this.failureCount,
      totalRequests,
      failureRate,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange
    };
  }

  public reset(): void {
    this.reset();
    this.transitionTo(CircuitState.CLOSED);
  }
}

// ============================================================================
// Timeout Enforcement
// ============================================================================

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Execute operation with timeout enforcement
 *
 * @param operation - Async operation to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutError - Optional custom error to throw
 * @returns Result of operation
 * @throws TimeoutError if operation exceeds timeout
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutError?: Error
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = timeoutError || new TimeoutError(
        `Operation timed out after ${timeoutMs}ms`,
        timeoutMs
      );

      // Track timeout metrics
      recordMetric('timeout.triggered', 1, {
        operation: operation.name || 'unknown',
        timeoutMs
      });

      reject(error);
    }, timeoutMs);

    operation()
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// Standard timeout configurations
export const TIMEOUTS = {
  AGENT_EXECUTION: 10 * 60 * 1000,   // 10 minutes
  DATABASE_QUERY: 30 * 1000,          // 30 seconds
  HTTP_REQUEST: 60 * 1000,            // 60 seconds
  DOCKER_OPERATION: 5 * 60 * 1000,    // 5 minutes
  REDIS_OPERATION: 5 * 1000           // 5 seconds
};

// ============================================================================
// Graceful Degradation Patterns
// ============================================================================

export interface FallbackConfig<T> {
  fallbackValue?: T;
  fallbackFn?: () => Promise<T> | T;
  onFallback?: (error: Error) => void;
}

/**
 * Execute operation with fallback on failure
 *
 * @param operation - Primary operation to attempt
 * @param config - Fallback configuration
 * @returns Result from operation or fallback
 */
export async function withFallback<T>(
  operation: () => Promise<T>,
  config: FallbackConfig<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Track fallback metrics
    recordMetric('fallback.triggered', 1, {
      operation: operation.name || 'unknown',
      error: (error as Error).message
    });

    // Call fallback callback
    if (config.onFallback) {
      config.onFallback(error as Error);
    }

    // Return fallback value or execute fallback function
    if (config.fallbackFn) {
      return typeof config.fallbackFn === 'function'
        ? await Promise.resolve(config.fallbackFn())
        : config.fallbackFn;
    }

    if (config.fallbackValue !== undefined) {
      return config.fallbackValue;
    }

    // No fallback configured, rethrow error
    throw error;
  }
}

// ============================================================================
// Combined Resilience Wrapper
// ============================================================================

export interface ResilienceConfig<T> {
  retry?: Partial<RetryConfig>;
  circuitBreaker?: CircuitBreaker;
  timeout?: number;
  fallback?: FallbackConfig<T>;
}

/**
 * Execute operation with full resilience patterns
 *
 * Combines retry, circuit breaker, timeout, and fallback
 * for maximum reliability and graceful degradation.
 */
export async function withResilience<T>(
  operation: () => Promise<T>,
  config: ResilienceConfig<T> = {}
): Promise<T> {
  let wrappedOperation = operation;

  // Apply timeout if configured
  if (config.timeout) {
    const timeoutMs = config.timeout;
    wrappedOperation = () => withTimeout(operation, timeoutMs);
  }

  // Apply circuit breaker if configured
  if (config.circuitBreaker) {
    const breaker = config.circuitBreaker;
    const previousOp = wrappedOperation;
    wrappedOperation = () => breaker.execute(previousOp);
  }

  // Apply retry if configured
  if (config.retry) {
    const previousOp = wrappedOperation;
    wrappedOperation = () => withRetry(previousOp, config.retry);
  }

  // Apply fallback if configured
  if (config.fallback) {
    return withFallback(wrappedOperation, config.fallback);
  }

  return wrappedOperation();
}

// ============================================================================
// Pre-configured Circuit Breakers
// ============================================================================

export const CIRCUIT_BREAKERS = {
  redis: new CircuitBreaker({
    name: 'redis',
    failureThreshold: 0.5,
    minimumRequests: 10,
    recoveryTimeoutMs: 60000
  }),

  postgres: new CircuitBreaker({
    name: 'postgres',
    failureThreshold: 0.5,
    minimumRequests: 10,
    recoveryTimeoutMs: 60000
  }),

  dockerDaemon: new CircuitBreaker({
    name: 'docker-daemon',
    failureThreshold: 0.3,
    minimumRequests: 5,
    recoveryTimeoutMs: 30000
  }),

  aiProvider: new CircuitBreaker({
    name: 'ai-provider',
    failureThreshold: 0.4,
    minimumRequests: 10,
    recoveryTimeoutMs: 120000
  })
};
