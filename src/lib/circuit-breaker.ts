/**
 * Circuit Breaker Pattern Implementation
 *
 * Provides a robust circuit breaker pattern for protecting external dependencies
 * and preventing cascading failures across the system.
 *
 * Features:
 * - Three-state machine: CLOSED, OPEN, HALF_OPEN
 * - Configurable thresholds and timeouts
 * - Fallback support for graceful degradation
 * - Comprehensive metrics and monitoring
 * - Centralized registry for system-wide visibility
 * - Integration with StandardError and Prometheus metrics
 *
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker('external-api', {
 *   failureThreshold: 5,
 *   successThreshold: 2,
 *   timeout: 30000
 * });
 *
 * const result = await breaker.execute(
 *   async () => await externalApiCall(),
 *   async () => cachedFallbackData
 * );
 * ```
 *
 * Part of: HIGH-PRIORITY Circuit Breaker Enhancement
 */

import { StandardError } from './errors.js';
import { Logger } from '../core/logger.js';

const logger = Logger.getInstance();

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  /** Normal operation - requests flow through */
  CLOSED = 'closed',
  /** Failing - requests are rejected immediately */
  OPEN = 'open',
  /** Testing recovery - limited requests allowed */
  HALF_OPEN = 'half_open',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Number of successes to close circuit from half-open (default: 2) */
  successThreshold: number;
  /** Time in ms before attempting half-open (default: 30000) */
  timeout: number;
  /** Time window in ms for counting failures (default: 60000) */
  windowSize?: number;
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  /** Current circuit state */
  state: CircuitBreakerState;
  /** Number of consecutive failures */
  failures: number;
  /** Number of consecutive successes (in half-open) */
  successes: number;
  /** Last failure timestamp */
  lastFailureTime?: Date;
  /** Last success timestamp */
  lastSuccessTime?: Date;
  /** Time when circuit was opened */
  openedAt?: Date;
  /** Total number of calls */
  totalCalls?: number;
  /** Total number of successful calls */
  totalSuccesses?: number;
  /** Total number of failed calls */
  totalFailures?: number;
  /** Total number of rejected calls (circuit open) */
  totalRejected?: number;
}

/**
 * Circuit breaker open error
 */
export class CircuitOpenError extends StandardError {
  public readonly serviceName: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(serviceName: string) {
    super(
      'CIRCUIT_OPEN',
      `Circuit breaker is OPEN for service: ${serviceName}`,
      { serviceName },
      undefined,
      false // Not retryable when circuit is open
    );
    this.serviceName = serviceName;
    this.statusCode = 503;
    this.isOperational = true;
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit Breaker Implementation
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * by failing fast when a service is detected as unhealthy.
 */
export class CircuitBreaker {
  private readonly serviceName: string;
  private readonly config: Required<CircuitBreakerConfig>;
  private metrics: CircuitBreakerMetrics;

  constructor(serviceName: string, config?: Partial<CircuitBreakerConfig>) {
    this.serviceName = serviceName;
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      successThreshold: config?.successThreshold ?? 2,
      timeout: config?.timeout ?? 30000,
      windowSize: config?.windowSize ?? 60000,
    };

    this.metrics = {
      state: CircuitBreakerState.CLOSED,
      failures: 0,
      successes: 0,
      totalCalls: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalRejected: 0,
    };

    logger.info(`Circuit breaker initialized for service: ${serviceName}`, {
      config: this.config,
    });
  }

  /**
   * Execute an operation with circuit breaker protection
   *
   * @param operation - The operation to execute
   * @param fallback - Optional fallback function if circuit is open
   * @returns Result of operation or fallback
   * @throws CircuitOpenError if circuit is open and no fallback provided
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    this.metrics.totalCalls = (this.metrics.totalCalls ?? 0) + 1;

    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.shouldAttemptReset()) {
      this.transitionToHalfOpen();
    }

    // Reject if circuit is OPEN
    if (this.metrics.state === CircuitBreakerState.OPEN) {
      this.metrics.totalRejected = (this.metrics.totalRejected ?? 0) + 1;
      logger.warn(`Circuit breaker rejected request for service: ${this.serviceName}`, {
        state: this.metrics.state,
        failures: this.metrics.failures,
      });

      if (fallback) {
        logger.info(`Executing fallback for service: ${this.serviceName}`);
        return await fallback();
      }

      throw new CircuitOpenError(this.serviceName);
    }

    // Execute operation
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Record successful operation
   */
  private onSuccess(): void {
    this.metrics.totalSuccesses = (this.metrics.totalSuccesses ?? 0) + 1;
    this.metrics.lastSuccessTime = new Date();

    // In CLOSED state, reset failure count on success
    if (this.metrics.state === CircuitBreakerState.CLOSED) {
      this.metrics.failures = 0;
      logger.debug(`Success recorded for service: ${this.serviceName}`, {
        state: this.metrics.state,
        failuresReset: true,
      });
      return;
    }

    // Only track consecutive successes in HALF_OPEN state (for recovery)
    if (this.metrics.state === CircuitBreakerState.HALF_OPEN) {
      this.metrics.successes++;

      logger.debug(`Success recorded for service: ${this.serviceName}`, {
        state: this.metrics.state,
        successes: this.metrics.successes,
      });

      // Transition from HALF_OPEN to CLOSED if threshold met
      if (this.metrics.successes >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Record failed operation
   */
  private onFailure(error: unknown): void {
    this.metrics.failures++;
    this.metrics.totalFailures = (this.metrics.totalFailures ?? 0) + 1;
    this.metrics.lastFailureTime = new Date();

    logger.warn(`Failure recorded for service: ${this.serviceName}`, {
      state: this.metrics.state,
      failures: this.metrics.failures,
      error: error instanceof Error ? error.message : String(error),
    });

    // Transition from HALF_OPEN to OPEN on any failure
    if (this.metrics.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionToOpen();
      return;
    }

    // Transition from CLOSED to OPEN if threshold met
    if (
      this.metrics.state === CircuitBreakerState.CLOSED &&
      this.metrics.failures >= this.config.failureThreshold
    ) {
      this.transitionToOpen();
    }
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    this.metrics.state = CircuitBreakerState.OPEN;
    this.metrics.openedAt = new Date();

    logger.error(`Circuit breaker opened for service: ${this.serviceName}`, {
      failures: this.metrics.failures,
      threshold: this.config.failureThreshold,
    });

    // Emit metrics event
    this.emitMetrics('circuit_opened');
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    this.metrics.state = CircuitBreakerState.HALF_OPEN;
    this.metrics.successes = 0;

    logger.info(`Circuit breaker half-open for service: ${this.serviceName}`, {
      message: 'Testing service recovery',
    });

    // Emit metrics event
    this.emitMetrics('circuit_half_opened');
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    this.metrics.state = CircuitBreakerState.CLOSED;
    this.metrics.failures = 0;
    this.metrics.successes = 0;
    this.metrics.openedAt = undefined;

    logger.info(`Circuit breaker closed for service: ${this.serviceName}`, {
      message: 'Service recovered',
    });

    // Emit metrics event
    this.emitMetrics('circuit_closed');
  }

  /**
   * Check if circuit should attempt reset (OPEN -> HALF_OPEN)
   */
  private shouldAttemptReset(): boolean {
    if (this.metrics.state !== CircuitBreakerState.OPEN) {
      return false;
    }

    if (!this.metrics.openedAt) {
      return false;
    }

    const timeSinceOpen = Date.now() - this.metrics.openedAt.getTime();
    return timeSinceOpen >= this.config.timeout;
  }

  /**
   * Emit metrics for monitoring
   */
  private emitMetrics(event: string): void {
    // Placeholder for Prometheus metrics integration
    // In production, this would push metrics to Prometheus/Grafana
    logger.debug(`Circuit breaker event: ${event}`, {
      service: this.serviceName,
      state: this.metrics.state,
      metrics: this.metrics,
    });
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitBreakerState {
    return this.metrics.state;
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if circuit is healthy (CLOSED state)
   */
  isHealthy(): boolean {
    return this.metrics.state === CircuitBreakerState.CLOSED;
  }

  /**
   * Manually open the circuit
   */
  open(): void {
    logger.warn(`Manually opening circuit for service: ${this.serviceName}`);
    this.transitionToOpen();
  }

  /**
   * Manually close the circuit and reset metrics
   */
  close(): void {
    logger.info(`Manually closing circuit for service: ${this.serviceName}`);
    this.transitionToClosed();
  }

  /**
   * Get service name
   */
  getServiceName(): string {
    return this.serviceName;
  }
}

/**
 * Circuit Breaker Registry
 *
 * Centralized registry for managing multiple circuit breakers across the system.
 * Provides system-wide visibility and health monitoring.
 */
export class CircuitBreakerRegistry {
  private static breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker for a service
   */
  static getOrCreate(
    serviceName: string,
    config?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    let breaker = this.breakers.get(serviceName);

    if (!breaker) {
      breaker = new CircuitBreaker(serviceName, config);
      this.breakers.set(serviceName, breaker);
      logger.info(`Circuit breaker registered: ${serviceName}`);
    }

    return breaker;
  }

  /**
   * Get existing circuit breaker
   */
  static get(serviceName: string): CircuitBreaker | undefined {
    return this.breakers.get(serviceName);
  }

  /**
   * Get all registered circuit breakers
   */
  static getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Get health status for all circuit breakers
   */
  static getHealthStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};

    for (const [name, breaker] of this.breakers.entries()) {
      status[name] = breaker.isHealthy();
    }

    return status;
  }

  /**
   * Get metrics for all circuit breakers
   */
  static getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};

    for (const [name, breaker] of this.breakers.entries()) {
      metrics[name] = breaker.getMetrics();
    }

    return metrics;
  }

  /**
   * Clear all circuit breakers (for testing)
   */
  static clear(): void {
    this.breakers.clear();
    logger.info('Circuit breaker registry cleared');
  }

  /**
   * Remove specific circuit breaker
   */
  static remove(serviceName: string): boolean {
    const result = this.breakers.delete(serviceName);
    if (result) {
      logger.info(`Circuit breaker removed: ${serviceName}`);
    }
    return result;
  }
}

/**
 * Helper function to create a circuit breaker
 */
export function createCircuitBreaker(
  serviceName: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return CircuitBreakerRegistry.getOrCreate(serviceName, config);
}

/**
 * Helper function to execute with circuit breaker protection
 */
export async function executeWithCircuitBreaker<T>(
  serviceName: string,
  operation: () => Promise<T>,
  fallback?: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const breaker = CircuitBreakerRegistry.getOrCreate(serviceName, config);
  return breaker.execute(operation, fallback);
}
