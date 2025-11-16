/**
 * Error Aggregation System
 *
 * Provides error aggregation, correlation tracking, and circuit breaker patterns
 * for multi-database operations.
 *
 * Features:
 * - Aggregates errors from multiple database systems
 * - Tracks error correlation across operations
 * - Implements circuit breaker for repeated failures
 * - Provides error analysis and reporting
 *
 * Part of: Critical Error Handling Fixes (Architecture Review)
 */

import { DatabaseError, DatabaseErrorCode } from './database-service/types';
import { createLogger, Logger } from './logging';
import { v4 as uuidv4 } from 'uuid';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Aggregated error with context
 */
export interface AggregatedError {
  /** Unique correlation ID for tracking */
  correlationId: string;
  /** Timestamp when error occurred */
  timestamp: Date;
  /** Database system that failed */
  system: string;
  /** Original database error */
  error: DatabaseError;
  /** Error severity */
  severity: ErrorSeverity;
  /** Operation context */
  operationContext?: Record<string, any>;
  /** Stack trace */
  stackTrace?: string;
}

/**
 * Error aggregation result
 */
export interface ErrorAggregationResult {
  /** Total number of errors */
  totalErrors: number;
  /** Errors by system */
  errorsBySystem: Record<string, AggregatedError[]>;
  /** Errors by severity */
  errorsBySeverity: Record<ErrorSeverity, AggregatedError[]>;
  /** All aggregated errors */
  allErrors: AggregatedError[];
  /** Correlation ID for this aggregation */
  correlationId: string;
  /** Whether all systems failed */
  allSystemsFailed: boolean;
  /** Whether any critical errors occurred */
  hasCriticalErrors: boolean;
}

/**
 * Circuit breaker state
 */
export enum CircuitBreakerState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Failing, rejecting requests
  HALF_OPEN = 'half_open', // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failure threshold before opening circuit */
  failureThreshold: number;
  /** Success threshold to close circuit */
  successThreshold: number;
  /** Timeout before attempting half-open (ms) */
  timeout: number;
  /** Time window for failure counting (ms) */
  windowSize: number;
}

/**
 * Circuit breaker metrics
 */
interface CircuitBreakerMetrics {
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  state: CircuitBreakerState;
  openedAt?: Date;
}

/**
 * Error aggregator class
 */
export class ErrorAggregator {
  private logger: Logger;
  private errors: AggregatedError[] = [];
  private correlationId: string;
  private circuitBreakers: Map<string, CircuitBreakerMetrics> = new Map();
  private circuitBreakerConfig: CircuitBreakerConfig;

  constructor(
    correlationId?: string,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.correlationId = correlationId || uuidv4();
    this.logger = createLogger('error-aggregator');

    // Default circuit breaker configuration
    this.circuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
      windowSize: 120000, // 2 minutes
      ...circuitBreakerConfig,
    };
  }

  /**
   * Add error to aggregation
   */
  addError(
    system: string,
    error: DatabaseError,
    operationContext?: Record<string, any>
  ): AggregatedError {
    const aggregatedError: AggregatedError = {
      correlationId: uuidv4(),
      timestamp: new Date(),
      system,
      error,
      severity: this.determineSeverity(error),
      operationContext,
      stackTrace: error.originalError?.stack,
    };

    this.errors.push(aggregatedError);

    // Update circuit breaker
    this.recordFailure(system);

    // Log error with correlation ID
    this.logger.error(
      'Database operation failed',
      error.originalError,
      {
        correlationId: this.correlationId,
        errorCorrelationId: aggregatedError.correlationId,
        system,
        errorCode: error.code,
        message: error.message,
        severity: aggregatedError.severity,
      }
    );

    return aggregatedError;
  }

  /**
   * Record successful operation (for circuit breaker)
   */
  recordSuccess(system: string): void {
    const metrics = this.getOrCreateMetrics(system);
    metrics.successes++;
    metrics.lastSuccessTime = new Date();

    // Check if we can close the circuit
    if (
      metrics.state === CircuitBreakerState.HALF_OPEN &&
      metrics.successes >= this.circuitBreakerConfig.successThreshold
    ) {
      this.closeCircuit(system);
    }

    this.circuitBreakers.set(system, metrics);
  }

  /**
   * Record failed operation (for circuit breaker)
   */
  private recordFailure(system: string): void {
    const metrics = this.getOrCreateMetrics(system);
    metrics.failures++;
    metrics.lastFailureTime = new Date();

    // Check if we should open the circuit
    if (
      metrics.state === CircuitBreakerState.CLOSED &&
      metrics.failures >= this.circuitBreakerConfig.failureThreshold
    ) {
      this.openCircuit(system);
    }

    // If half-open, go back to open on failure
    if (metrics.state === CircuitBreakerState.HALF_OPEN) {
      this.openCircuit(system);
    }

    this.circuitBreakers.set(system, metrics);
  }

  /**
   * Check if circuit breaker allows operation
   */
  isCircuitOpen(system: string): boolean {
    const metrics = this.circuitBreakers.get(system);
    if (!metrics) return false;

    // Check if we should attempt half-open
    if (
      metrics.state === CircuitBreakerState.OPEN &&
      metrics.openedAt &&
      Date.now() - metrics.openedAt.getTime() >= this.circuitBreakerConfig.timeout
    ) {
      this.halfOpenCircuit(system);
      return false; // Allow one request in half-open state
    }

    return metrics.state === CircuitBreakerState.OPEN;
  }

  /**
   * Open circuit breaker
   */
  private openCircuit(system: string): void {
    const metrics = this.getOrCreateMetrics(system);
    metrics.state = CircuitBreakerState.OPEN;
    metrics.openedAt = new Date();

    this.logger.warn('Circuit breaker opened', {
      system,
      failures: metrics.failures,
      correlationId: this.correlationId,
    });

    this.circuitBreakers.set(system, metrics);
  }

  /**
   * Close circuit breaker
   */
  private closeCircuit(system: string): void {
    const metrics = this.getOrCreateMetrics(system);
    metrics.state = CircuitBreakerState.CLOSED;
    metrics.failures = 0;
    metrics.successes = 0;
    metrics.openedAt = undefined;

    this.logger.info('Circuit breaker closed', {
      system,
      correlationId: this.correlationId,
    });

    this.circuitBreakers.set(system, metrics);
  }

  /**
   * Set circuit to half-open state
   */
  private halfOpenCircuit(system: string): void {
    const metrics = this.getOrCreateMetrics(system);
    metrics.state = CircuitBreakerState.HALF_OPEN;
    metrics.successes = 0;

    this.logger.info('Circuit breaker half-open (testing recovery)', {
      system,
      correlationId: this.correlationId,
    });

    this.circuitBreakers.set(system, metrics);
  }

  /**
   * Get or create circuit breaker metrics
   */
  private getOrCreateMetrics(system: string): CircuitBreakerMetrics {
    let metrics = this.circuitBreakers.get(system);
    if (!metrics) {
      metrics = {
        failures: 0,
        successes: 0,
        state: CircuitBreakerState.CLOSED,
      };
      this.circuitBreakers.set(system, metrics);
    }

    // Clean old failures outside window
    if (
      metrics.lastFailureTime &&
      Date.now() - metrics.lastFailureTime.getTime() > this.circuitBreakerConfig.windowSize
    ) {
      metrics.failures = 0;
    }

    return metrics;
  }

  /**
   * Get aggregation result
   */
  getResult(expectedSystems: string[]): ErrorAggregationResult {
    const errorsBySystem: Record<string, AggregatedError[]> = {};
    const errorsBySeverity: Record<ErrorSeverity, AggregatedError[]> = {
      [ErrorSeverity.LOW]: [],
      [ErrorSeverity.MEDIUM]: [],
      [ErrorSeverity.HIGH]: [],
      [ErrorSeverity.CRITICAL]: [],
    };

    // Group errors
    for (const error of this.errors) {
      // By system
      if (!errorsBySystem[error.system]) {
        errorsBySystem[error.system] = [];
      }
      errorsBySystem[error.system].push(error);

      // By severity
      errorsBySeverity[error.severity].push(error);
    }

    // Check if all systems failed
    const failedSystems = Object.keys(errorsBySystem);
    const allSystemsFailed = expectedSystems.every(system =>
      failedSystems.includes(system)
    );

    // Check for critical errors
    const hasCriticalErrors = errorsBySeverity[ErrorSeverity.CRITICAL].length > 0;

    return {
      totalErrors: this.errors.length,
      errorsBySystem,
      errorsBySeverity,
      allErrors: [...this.errors],
      correlationId: this.correlationId,
      allSystemsFailed,
      hasCriticalErrors,
    };
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: DatabaseError): ErrorSeverity {
    switch (error.code) {
      case DatabaseErrorCode.CONNECTION_FAILED:
      case DatabaseErrorCode.TRANSACTION_FAILED:
        return ErrorSeverity.CRITICAL;

      case DatabaseErrorCode.QUERY_FAILED:
      case DatabaseErrorCode.TIMEOUT:
        return ErrorSeverity.HIGH;

      case DatabaseErrorCode.VALIDATION_FAILED:
      case DatabaseErrorCode.CONSTRAINT_VIOLATION:
        return ErrorSeverity.MEDIUM;

      case DatabaseErrorCode.NOT_FOUND:
      case DatabaseErrorCode.DUPLICATE_KEY:
        return ErrorSeverity.LOW;

      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * Check if errors should cause operation failure
   */
  shouldFailOperation(expectedSystems: string[]): boolean {
    const result = this.getResult(expectedSystems);

    // Fail if all systems failed
    if (result.allSystemsFailed) {
      return true;
    }

    // Fail if any critical errors
    if (result.hasCriticalErrors) {
      return true;
    }

    return false;
  }

  /**
   * Create error report
   */
  createReport(): string {
    const result = this.getResult([]);
    const lines: string[] = [
      '=== Error Aggregation Report ===',
      `Correlation ID: ${this.correlationId}`,
      `Total Errors: ${result.totalErrors}`,
      `All Systems Failed: ${result.allSystemsFailed}`,
      `Critical Errors: ${result.hasCriticalErrors}`,
      '',
      '--- Errors by System ---',
    ];

    for (const [system, errors] of Object.entries(result.errorsBySystem)) {
      lines.push(`${system}: ${errors.length} error(s)`);
      for (const error of errors) {
        lines.push(`  - [${error.severity}] ${error.error.message}`);
      }
    }

    lines.push('');
    lines.push('--- Errors by Severity ---');
    for (const [severity, errors] of Object.entries(result.errorsBySeverity)) {
      if (errors.length > 0) {
        lines.push(`${severity}: ${errors.length} error(s)`);
      }
    }

    lines.push('');
    lines.push('--- Circuit Breaker Status ---');
    for (const [system, metrics] of Array.from(this.circuitBreakers.entries())) {
      lines.push(
        `${system}: ${metrics.state} (failures: ${metrics.failures}, successes: ${metrics.successes})`
      );
    }

    return lines.join('\n');
  }

  /**
   * Get correlation ID
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Reset aggregator (for reuse)
   */
  reset(): void {
    this.errors = [];
    this.correlationId = uuidv4();
  }

  /**
   * Get circuit breaker state for system
   */
  getCircuitBreakerState(system: string): CircuitBreakerState {
    const metrics = this.circuitBreakers.get(system);
    return metrics?.state || CircuitBreakerState.CLOSED;
  }
}

/**
 * Create error aggregator
 */
export function createErrorAggregator(
  correlationId?: string,
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>
): ErrorAggregator {
  return new ErrorAggregator(correlationId, circuitBreakerConfig);
}
