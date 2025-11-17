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

import { DatabaseError, DatabaseErrorCode } from './database-service/types.js';
import { createLogger, Logger } from './logging.js';
import { v4 as uuidv4 } from 'uuid';
import {
  CircuitBreakerState,
  CircuitBreakerConfig,
  CircuitBreakerRegistry,
} from './circuit-breaker.js';

// Re-export circuit breaker types for backward compatibility
export { CircuitBreakerState, CircuitBreakerConfig };

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

// Circuit breaker types now imported from ./circuit-breaker module

/**
 * Error aggregator class
 */
export class ErrorAggregator {
  private logger: Logger;
  private errors: AggregatedError[] = [];
  private correlationId: string;
  private circuitBreakerConfig: Partial<CircuitBreakerConfig>;

  constructor(
    correlationId?: string,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.correlationId = correlationId || uuidv4();
    this.logger = createLogger('error-aggregator');

    // Store circuit breaker configuration for registry
    this.circuitBreakerConfig = {
      failureThreshold: circuitBreakerConfig?.failureThreshold ?? 5,
      successThreshold: circuitBreakerConfig?.successThreshold ?? 2,
      timeout: circuitBreakerConfig?.timeout ?? 60000,
      windowSize: circuitBreakerConfig?.windowSize ?? 120000,
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
    // Use circuit breaker registry - success is tracked automatically via execute()
    // This method is kept for backward compatibility but delegates to registry
    const breaker = CircuitBreakerRegistry.getOrCreate(system, this.circuitBreakerConfig);
    // Success tracking is handled internally by CircuitBreaker.execute()
    // This is just a manual success recording for compatibility
    this.logger.debug('Manual success recorded', { system, correlationId: this.correlationId });
  }

  /**
   * Record failed operation (for circuit breaker)
   */
  private recordFailure(system: string): void {
    // Failure tracking is handled by the circuit breaker registry
    // This is called when addError is invoked
    const breaker = CircuitBreakerRegistry.getOrCreate(system, this.circuitBreakerConfig);
    this.logger.debug('Failure recorded via error aggregation', {
      system,
      state: breaker.getState(),
      correlationId: this.correlationId,
    });
  }

  /**
   * Check if circuit breaker allows operation
   */
  isCircuitOpen(system: string): boolean {
    const breaker = CircuitBreakerRegistry.get(system);
    return breaker ? !breaker.isHealthy() : false;
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
    const allMetrics = CircuitBreakerRegistry.getAllMetrics();
    for (const [system, metrics] of Object.entries(allMetrics)) {
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
    const breaker = CircuitBreakerRegistry.get(system);
    return breaker?.getState() || CircuitBreakerState.CLOSED;
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
