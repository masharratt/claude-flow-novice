/**
 * Queue Recovery System
 *
 * Provides failure detection, dead letter queue management, and automatic recovery
 * for Redis queue operations. Handles coordinator crashes and message reprocessing.
 * Part of Task 3.4: Redis Queue Consistency & Recovery (Integration Standardization Sprint 3)
 *
 * Features:
 * - Dead letter queue for failed messages
 * - Automatic retry with exponential backoff
 * - Failure detection (tasks not processed within timeout)
 * - Coordinator crash recovery procedure
 * - Message reprocessing safeguards
 *
 * Usage:
 *   const recovery = new QueueRecovery(queueManager);
 *
 *   // Start monitoring for stuck messages
 *   recovery.startMonitoring();
 *
 *   // Recover from coordinator crash
 *   await recovery.recoverFromCrash();
 *
 *   // Process dead letter queue
 *   const reprocessed = await recovery.reprocessDeadLetters();
 */

import { RedisClientType } from 'redis';
import { createLogger } from './logging.js';
import { createError, ErrorCode, isRetryableError } from './errors.js';
import { withRetry, sleep } from './retry.js';
import { RedisQueueManager, QueueMessage } from './redis-queue-manager.js';

const logger = createLogger('queue-recovery');

/**
 * Recovery options
 */
export interface RecoveryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base retry delay in milliseconds (default: 1000) */
  baseRetryDelayMs?: number;
  /** Maximum retry delay in milliseconds (default: 60000) */
  maxRetryDelayMs?: number;
  /** Message processing timeout in milliseconds (default: 300000 - 5 minutes) */
  processingTimeoutMs?: number;
  /** Monitoring interval in milliseconds (default: 60000 - 1 minute) */
  monitoringIntervalMs?: number;
  /** Dead letter queue name (default: 'dlq') */
  deadLetterQueue?: string;
  /** Enable automatic reprocessing of dead letters (default: false) */
  autoReprocess?: boolean;
}

/**
 * Recovery statistics
 */
export interface RecoveryStats {
  /** Total messages recovered */
  totalRecovered: number;
  /** Total messages sent to DLQ */
  totalDeadLettered: number;
  /** Total messages reprocessed from DLQ */
  totalReprocessed: number;
  /** Total stuck messages detected */
  totalStuckDetected: number;
  /** Last recovery timestamp */
  lastRecoveryAt?: Date;
}

/**
 * Dead letter metadata
 */
export interface DeadLetterMetadata {
  /** Original queue */
  originalQueue: string;
  /** Failure reason */
  failureReason: string;
  /** Number of retry attempts made */
  retryAttempts: number;
  /** Dead lettered timestamp */
  deadLetteredAt: Date;
  /** Original message metadata */
  originalMetadata?: Record<string, any>;
}

/**
 * Default recovery options
 */
const DEFAULT_RECOVERY_OPTIONS: Required<RecoveryOptions> = {
  maxRetries: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 60000,
  processingTimeoutMs: 300000, // 5 minutes
  monitoringIntervalMs: 60000, // 1 minute
  deadLetterQueue: 'dlq',
  autoReprocess: false,
};

/**
 * Queue Recovery System
 *
 * Handles failure detection, retry, and recovery for queue operations.
 */
export class QueueRecovery {
  private queueManager: RedisQueueManager;
  private redis: RedisClientType;
  private options: Required<RecoveryOptions>;
  private monitoringTimer: NodeJS.Timeout | null = null;
  private stats: RecoveryStats = {
    totalRecovered: 0,
    totalDeadLettered: 0,
    totalReprocessed: 0,
    totalStuckDetected: 0,
  };

  /**
   * Create a new QueueRecovery instance
   *
   * @param queueManager - Queue manager instance
   * @param redis - Redis client instance
   * @param options - Recovery options
   */
  constructor(
    queueManager: RedisQueueManager,
    redis: RedisClientType,
    options: RecoveryOptions = {}
  ) {
    this.queueManager = queueManager;
    this.redis = redis;
    this.options = { ...DEFAULT_RECOVERY_OPTIONS, ...options };

    logger.info('QueueRecovery initialized', {
      maxRetries: this.options.maxRetries,
      processingTimeoutMs: this.options.processingTimeoutMs,
      deadLetterQueue: this.options.deadLetterQueue,
    });
  }

  /**
   * Retry message processing with exponential backoff
   *
   * @param message - Message to retry
   * @param processFn - Function to process message
   * @returns Processing result
   */
  public async retryWithBackoff<T = any, R = any>(
    message: QueueMessage<T>,
    processFn: (payload: T) => Promise<R>
  ): Promise<R> {
    const maxAttempts = this.options.maxRetries;
    let attempt = message.deliveryAttempts;

    while (attempt <= maxAttempts) {
      try {
        logger.debug('Processing message with retry', {
          messageId: message.id,
          attempt,
          maxAttempts,
        });

        const result = await processFn(message.payload);

        if (attempt > 1) {
          this.stats.totalRecovered++;
          logger.info('Message processed successfully after retry', {
            messageId: message.id,
            attempt,
          });
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        logger.warn('Message processing failed', {
          messageId: message.id,
          attempt,
          error: err.message,
        });

        // Check if we should retry
        if (!isRetryableError(err) || attempt >= maxAttempts) {
          logger.error('Message processing failed permanently', err, {
            messageId: message.id,
            attempt,
            retryable: isRetryableError(err),
          });

          // Send to dead letter queue
          await this.sendToDeadLetter(message, err.message);

          throw err;
        }

        // Calculate backoff delay
        const delay = this.calculateBackoffDelay(attempt);

        logger.debug('Retrying message after delay', {
          messageId: message.id,
          attempt,
          delayMs: delay,
        });

        // Wait before retry
        await sleep(delay);

        attempt++;
      }
    }

    // Should never reach here, but TypeScript needs it
    throw createError(
      ErrorCode.RETRY_EXHAUSTED,
      'Message processing retry exhausted',
      { messageId: message.id, attempts: attempt }
    );
  }

  /**
   * Send message to dead letter queue
   *
   * @param message - Message to dead letter
   * @param reason - Failure reason
   */
  public async sendToDeadLetter<T = any>(
    message: QueueMessage<T>,
    reason: string
  ): Promise<void> {
    try {
      const metadata: DeadLetterMetadata = {
        originalQueue: message.queue,
        failureReason: reason,
        retryAttempts: message.deliveryAttempts,
        deadLetteredAt: new Date(),
        originalMetadata: message.metadata,
      };

      // Enqueue to dead letter queue
      await this.queueManager.enqueue(
        this.options.deadLetterQueue,
        message.payload,
        {
          deduplicate: false, // Allow duplicate dead letters
          metadata,
        }
      );

      this.stats.totalDeadLettered++;

      logger.info('Message sent to dead letter queue', {
        messageId: message.id,
        originalQueue: message.queue,
        reason,
        retryAttempts: message.deliveryAttempts,
      });
    } catch (error) {
      logger.error('Failed to send message to DLQ', error instanceof Error ? error : new Error(String(error)), {
        messageId: message.id,
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to send message to dead letter queue',
        { messageId: message.id },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Reprocess messages from dead letter queue
   *
   * @param processFn - Function to process dead letter messages
   * @param maxMessages - Maximum number of messages to reprocess (default: 100)
   * @returns Number of messages reprocessed
   */
  public async reprocessDeadLetters<T = any>(
    processFn: (payload: T, metadata: DeadLetterMetadata) => Promise<void>,
    maxMessages: number = 100
  ): Promise<number> {
    let reprocessedCount = 0;

    try {
      logger.info('Starting dead letter reprocessing', {
        maxMessages,
      });

      for (let i = 0; i < maxMessages; i++) {
        // Dequeue from dead letter queue
        const message = await this.queueManager.dequeue<T>(
          this.options.deadLetterQueue,
          { timeout: 0 }
        );

        if (!message) {
          // No more messages
          break;
        }

        try {
          const metadata = message.metadata as DeadLetterMetadata;

          // Process message
          await processFn(message.payload, metadata);

          // Acknowledge successful processing
          await this.queueManager.acknowledge(message.id);

          reprocessedCount++;
          this.stats.totalReprocessed++;

          logger.debug('Dead letter message reprocessed', {
            messageId: message.id,
            originalQueue: metadata.originalQueue,
          });
        } catch (error) {
          // Reject message (will stay in DLQ or be retried based on options)
          await this.queueManager.reject(message.id, {
            retry: false,
            error: error instanceof Error ? error.message : String(error),
          });

          logger.error('Failed to reprocess dead letter', error instanceof Error ? error : new Error(String(error)), {
            messageId: message.id,
          });
        }
      }

      logger.info('Dead letter reprocessing complete', {
        reprocessedCount,
      });

      return reprocessedCount;
    } catch (error) {
      logger.error('Dead letter reprocessing failed', error instanceof Error ? error : new Error(String(error)));

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to reprocess dead letters',
        { reprocessedCount },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Detect and recover stuck messages (messages in processing longer than timeout)
   *
   * @param queue - Queue name to check
   * @returns Number of stuck messages recovered
   */
  public async recoverStuckMessages(queue: string): Promise<number> {
    try {
      const processingKey = `queue:${queue}:processing`;
      const queueKey = `queue:${queue}`;

      // Get all messages in processing
      const processingMessages = await this.redis.lRange(processingKey, 0, -1);

      let recoveredCount = 0;
      const now = Date.now();

      for (const messageData of processingMessages) {
        const message = JSON.parse(messageData) as QueueMessage;

        // Check if message is stuck (processing longer than timeout)
        if (message.dequeuedAt) {
          const processingTime = now - new Date(message.dequeuedAt).getTime();

          if (processingTime > this.options.processingTimeoutMs) {
            logger.warn('Stuck message detected', {
              messageId: message.id,
              queue,
              processingTimeMs: processingTime,
              timeoutMs: this.options.processingTimeoutMs,
            });

            this.stats.totalStuckDetected++;

            // Check if message has exceeded max retries
            if (message.deliveryAttempts >= this.options.maxRetries) {
              // Send to dead letter queue
              await this.sendToDeadLetter(
                message,
                `Message stuck in processing for ${processingTime}ms (exceeded max retries)`
              );

              // Remove from processing
              await this.redis.lRem(processingKey, 1, messageData);

              logger.info('Stuck message sent to DLQ', {
                messageId: message.id,
                deliveryAttempts: message.deliveryAttempts,
              });
            } else {
              // Re-enqueue for retry
              message.deliveryAttempts++;
              message.metadata = {
                ...message.metadata,
                recoveredAt: new Date().toISOString(),
                recoveryReason: 'Stuck in processing',
              };

              // Remove from processing and add back to queue
              await this.redis.lRem(processingKey, 1, messageData);
              await this.redis.rPush(queueKey, JSON.stringify(message));

              recoveredCount++;
              this.stats.totalRecovered++;

              logger.info('Stuck message re-enqueued', {
                messageId: message.id,
                deliveryAttempts: message.deliveryAttempts,
              });
            }
          }
        }
      }

      if (recoveredCount > 0) {
        this.stats.lastRecoveryAt = new Date();
      }

      logger.debug('Stuck message recovery complete', {
        queue,
        recoveredCount,
        totalStuckDetected: this.stats.totalStuckDetected,
      });

      return recoveredCount;
    } catch (error) {
      logger.error('Failed to recover stuck messages', error instanceof Error ? error : new Error(String(error)), {
        queue,
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to recover stuck messages',
        { queue },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Recover from coordinator crash
   *
   * Scans all queues for stuck messages and recovers them.
   *
   * @returns Object with recovery results per queue
   */
  public async recoverFromCrash(): Promise<Record<string, number>> {
    try {
      logger.info('Starting coordinator crash recovery');

      // Get all queues
      const queues = await this.queueManager.getQueues();

      const results: Record<string, number> = {};

      // Recover stuck messages from each queue
      for (const queue of queues) {
        // Skip dead letter queue
        if (queue === this.options.deadLetterQueue) {
          continue;
        }

        const recovered = await this.recoverStuckMessages(queue);
        results[queue] = recovered;
      }

      const totalRecovered = Object.values(results).reduce((sum, count) => sum + count, 0);

      logger.info('Coordinator crash recovery complete', {
        queuesProcessed: queues.length,
        totalRecovered,
        results,
      });

      return results;
    } catch (error) {
      logger.error('Coordinator crash recovery failed', error instanceof Error ? error : new Error(String(error)));

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to recover from coordinator crash',
        {},
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Start automatic monitoring for stuck messages
   */
  public startMonitoring(): void {
    if (this.monitoringTimer) {
      logger.warn('Monitoring already started');
      return;
    }

    this.monitoringTimer = setInterval(
      async () => {
        try {
          await this.recoverFromCrash();

          // Auto-reprocess dead letters if enabled
          if (this.options.autoReprocess) {
            await this.reprocessDeadLetters(async (payload, metadata) => {
              logger.debug('Auto-reprocessing dead letter', {
                originalQueue: metadata.originalQueue,
              });

              // Re-enqueue to original queue
              await this.queueManager.enqueue(metadata.originalQueue, payload, {
                deduplicate: false,
                metadata: {
                  ...metadata,
                  reprocessedAt: new Date().toISOString(),
                },
              });
            });
          }
        } catch (error) {
          logger.error('Monitoring cycle failed', error instanceof Error ? error : new Error(String(error)));
        }
      },
      this.options.monitoringIntervalMs
    );

    logger.info('Monitoring started', {
      intervalMs: this.options.monitoringIntervalMs,
      autoReprocess: this.options.autoReprocess,
    });
  }

  /**
   * Stop automatic monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
      logger.info('Monitoring stopped');
    }
  }

  /**
   * Get recovery statistics
   *
   * @returns Current statistics
   */
  public getStats(): RecoveryStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      totalRecovered: 0,
      totalDeadLettered: 0,
      totalReprocessed: 0,
      totalStuckDetected: 0,
    };

    logger.debug('Statistics reset');
  }

  /**
   * Shutdown recovery system (stop monitoring)
   */
  public shutdown(): void {
    this.stopMonitoring();
    logger.info('QueueRecovery shutdown');
  }

  /**
   * Calculate exponential backoff delay
   *
   * @param attempt - Current attempt number (1-based)
   * @returns Delay in milliseconds
   */
  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff: baseDelay * 2^(attempt - 1)
    const delay = this.options.baseRetryDelayMs * Math.pow(2, attempt - 1);

    // Cap at max delay
    const cappedDelay = Math.min(delay, this.options.maxRetryDelayMs);

    // Add jitter (+/- 10%) to prevent thundering herd
    const jitterFactor = 0.1;
    const jitterRange = cappedDelay * jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange;

    return Math.max(0, Math.floor(cappedDelay + jitter));
  }
}

/**
 * Message reprocessing safeguards
 */
export class ReprocessingSafeguards {
  private processedMessages: Set<string> = new Set();
  private maxProcessedTracking: number;

  /**
   * Create a new ReprocessingSafeguards instance
   *
   * @param maxProcessedTracking - Maximum number of processed message IDs to track (default: 10000)
   */
  constructor(maxProcessedTracking: number = 10000) {
    this.maxProcessedTracking = maxProcessedTracking;

    logger.debug('ReprocessingSafeguards initialized', {
      maxProcessedTracking,
    });
  }

  /**
   * Check if message has already been processed
   *
   * @param messageId - Message ID to check
   * @returns True if already processed
   */
  public hasBeenProcessed(messageId: string): boolean {
    return this.processedMessages.has(messageId);
  }

  /**
   * Mark message as processed
   *
   * @param messageId - Message ID to mark
   */
  public markProcessed(messageId: string): void {
    // Implement simple LRU-like behavior
    if (this.processedMessages.size >= this.maxProcessedTracking) {
      // Remove oldest entry (first in Set)
      const firstId = this.processedMessages.values().next().value;
      this.processedMessages.delete(firstId);
    }

    this.processedMessages.add(messageId);
  }

  /**
   * Clear all processed message tracking
   */
  public clear(): void {
    this.processedMessages.clear();
    logger.debug('Processed messages cleared');
  }

  /**
   * Get number of tracked processed messages
   */
  public getTrackedCount(): number {
    return this.processedMessages.size;
  }
}
