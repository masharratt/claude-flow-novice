/**
 * StandardAdapter.ts - Reference implementation of standardized integration patterns
 *
 * Features:
 * - Standard data envelope (wrap/unwrap)
 * - Standard error handling (try/catch/log/rethrow)
 * - Standard logging (structured JSON)
 * - Standard retry logic (exponential backoff)
 * - Standard correlation tracking (task_id, agent_id)
 */

import { createHash } from 'crypto';

/**
 * Standard data envelope for all integrations
 */
export interface DataEnvelope<T> {
  /** Unique correlation ID for request tracking */
  correlation_id: string;
  /** Task ID for workflow correlation */
  task_id: string;
  /** Agent ID for agent correlation */
  agent_id?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Actual payload data */
  payload: T;
  /** Optional metadata for extensibility */
  metadata?: Record<string, unknown>;
  /** Content hash for integrity verification */
  content_hash: string;
}

/**
 * Standard error envelope for consistent error handling
 */
export interface ErrorEnvelope {
  correlation_id: string;
  task_id: string;
  error_code: string;
  error_message: string;
  error_stack?: string;
  timestamp: string;
  retry_count?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for retry logic
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  max_attempts: number;
  /** Initial backoff delay in milliseconds */
  initial_delay_ms: number;
  /** Maximum backoff delay in milliseconds */
  max_delay_ms: number;
  /** Backoff multiplier (exponential growth) */
  backoff_multiplier: number;
  /** Jitter factor (0-1) to prevent thundering herd */
  jitter_factor: number;
}

/**
 * Standard logger interface for structured logging
 */
export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

/**
 * Default JSON logger implementation
 */
export class JSONLogger implements Logger {
  private formatLog(level: string, message: string, context?: Record<string, unknown>): string {
    return JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...context,
    });
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.log(this.formatLog('INFO', message, context));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(this.formatLog('WARN', message, context));
  }

  error(message: string, context?: Record<string, unknown>): void {
    console.error(this.formatLog('ERROR', message, context));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    console.debug(this.formatLog('DEBUG', message, context));
  }
}

/**
 * StandardAdapter - Reference implementation for integration patterns
 *
 * @example
 * ```typescript
 * const adapter = new StandardAdapter({
 *   task_id: 'task-123',
 *   agent_id: 'agent-456',
 *   logger: new JSONLogger(),
 * });
 *
 * // Wrap data
 * const envelope = adapter.wrap({ user: 'john', action: 'login' });
 *
 * // Unwrap data with validation
 * const data = adapter.unwrap(envelope);
 *
 * // Execute with retry
 * const result = await adapter.withRetry(async () => {
 *   return await externalApiCall();
 * });
 * ```
 */
export class StandardAdapter {
  private task_id: string;
  private agent_id?: string;
  private logger: Logger;
  private default_retry_config: RetryConfig;

  constructor(config: {
    task_id: string;
    agent_id?: string;
    logger?: Logger;
    retry_config?: Partial<RetryConfig>;
  }) {
    this.task_id = config.task_id;
    this.agent_id = config.agent_id;
    this.logger = config.logger || new JSONLogger();
    this.default_retry_config = {
      max_attempts: 3,
      initial_delay_ms: 100,
      max_delay_ms: 10000,
      backoff_multiplier: 2,
      jitter_factor: 0.1,
      ...config.retry_config,
    };
  }

  /**
   * Wrap payload in standard data envelope
   *
   * @param payload - Data to wrap
   * @param metadata - Optional metadata
   * @returns Standardized data envelope
   */
  wrap<T>(payload: T, metadata?: Record<string, unknown>): DataEnvelope<T> {
    const correlation_id = this.generateCorrelationId();
    const timestamp = new Date().toISOString();
    const content_hash = this.generateContentHash(payload);

    const envelope: DataEnvelope<T> = {
      correlation_id,
      task_id: this.task_id,
      agent_id: this.agent_id,
      timestamp,
      payload,
      metadata,
      content_hash,
    };

    this.logger.debug('Data wrapped in envelope', {
      correlation_id,
      task_id: this.task_id,
      content_hash,
    });

    return envelope;
  }

  /**
   * Unwrap and validate data envelope
   *
   * @param envelope - Data envelope to unwrap
   * @returns Validated payload
   * @throws Error if envelope is invalid or hash mismatch
   */
  unwrap<T>(envelope: DataEnvelope<T>): T {
    try {
      // Validate required fields
      if (!envelope.correlation_id || !envelope.task_id || !envelope.payload) {
        throw new Error('Invalid envelope: missing required fields');
      }

      // Verify content hash
      const computed_hash = this.generateContentHash(envelope.payload);
      if (computed_hash !== envelope.content_hash) {
        throw new Error(
          `Content hash mismatch: expected ${envelope.content_hash}, got ${computed_hash}`
        );
      }

      this.logger.debug('Data unwrapped from envelope', {
        correlation_id: envelope.correlation_id,
        task_id: envelope.task_id,
      });

      return envelope.payload;
    } catch (error) {
      this.logger.error('Failed to unwrap envelope', {
        error: error instanceof Error ? error.message : String(error),
        correlation_id: envelope.correlation_id,
      });
      throw error;
    }
  }

  /**
   * Execute function with retry logic and exponential backoff
   *
   * @param fn - Function to execute
   * @param config - Optional retry configuration
   * @returns Result from successful execution
   * @throws Error if all retry attempts fail
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const retry_config = { ...this.default_retry_config, ...config };
    let last_error: Error | null = null;
    let attempt = 0;

    while (attempt < retry_config.max_attempts) {
      try {
        attempt++;
        this.logger.debug('Executing with retry', {
          task_id: this.task_id,
          attempt,
          max_attempts: retry_config.max_attempts,
        });

        const result = await fn();

        if (attempt > 1) {
          this.logger.info('Retry succeeded', {
            task_id: this.task_id,
            attempt,
          });
        }

        return result;
      } catch (error) {
        last_error = error instanceof Error ? error : new Error(String(error));

        this.logger.warn('Execution failed, will retry', {
          task_id: this.task_id,
          attempt,
          max_attempts: retry_config.max_attempts,
          error: last_error.message,
        });

        // Don't delay after the last attempt
        if (attempt < retry_config.max_attempts) {
          const delay = this.calculateBackoffDelay(attempt, retry_config);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    this.logger.error('All retry attempts exhausted', {
      task_id: this.task_id,
      attempts: retry_config.max_attempts,
      error: last_error?.message,
    });

    throw last_error || new Error('All retry attempts failed');
  }

  /**
   * Execute function with standard error handling
   * Catches errors, logs them, and rethrows with additional context
   *
   * @param fn - Function to execute
   * @param context - Error context information
   * @returns Result from successful execution
   * @throws Error with enriched context
   */
  async withErrorHandling<T>(
    fn: () => Promise<T>,
    context: Record<string, unknown> = {}
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const error_envelope: ErrorEnvelope = {
        correlation_id: this.generateCorrelationId(),
        task_id: this.task_id,
        error_code: 'EXECUTION_ERROR',
        error_message: error instanceof Error ? error.message : String(error),
        error_stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        metadata: context,
      };

      this.logger.error('Execution failed with error', error_envelope);

      // Rethrow with enriched context
      const enriched_error = new Error(error_envelope.error_message);
      (enriched_error as any).envelope = error_envelope;
      throw enriched_error;
    }
  }

  /**
   * Generate unique correlation ID for request tracking
   * Format: {task_id}-{timestamp}-{random}
   */
  private generateCorrelationId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${this.task_id}-${timestamp}-${random}`;
  }

  /**
   * Generate SHA256 hash of payload for integrity verification
   */
  private generateContentHash<T>(payload: T): string {
    const content = JSON.stringify(payload);
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number, config: RetryConfig): number {
    // Exponential backoff: initial_delay * (multiplier ^ (attempt - 1))
    const base_delay = config.initial_delay_ms * Math.pow(config.backoff_multiplier, attempt - 1);

    // Cap at max delay
    const capped_delay = Math.min(base_delay, config.max_delay_ms);

    // Add jitter to prevent thundering herd
    const jitter = capped_delay * config.jitter_factor * Math.random();

    return Math.floor(capped_delay + jitter);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current task context
   */
  getContext(): { task_id: string; agent_id?: string } {
    return {
      task_id: this.task_id,
      agent_id: this.agent_id,
    };
  }
}

/**
 * USAGE EXAMPLE - Before (Ad-hoc pattern):
 *
 * ```typescript
 * // ❌ Ad-hoc error handling, no correlation, no retry
 * async function processData(data: any) {
 *   try {
 *     const result = await externalApi.send(data);
 *     console.log('Success:', result);
 *     return result;
 *   } catch (err) {
 *     console.error('Error:', err);
 *     throw err;
 *   }
 * }
 * ```
 *
 * USAGE EXAMPLE - After (Standardized pattern):
 *
 * ```typescript
 * // ✅ Standardized with correlation, retry, structured logging
 * const adapter = new StandardAdapter({
 *   task_id: 'data-processing-123',
 *   agent_id: 'processor-agent-1',
 * });
 *
 * async function processData(data: any) {
 *   const envelope = adapter.wrap(data, { source: 'user_input' });
 *
 *   const result = await adapter.withRetry(async () => {
 *     return await adapter.withErrorHandling(
 *       async () => externalApi.send(envelope),
 *       { operation: 'external_api_call' }
 *     );
 *   });
 *
 *   return adapter.unwrap(result);
 * }
 * ```
 */
