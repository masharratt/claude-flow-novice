/**
 * Redis Queue Manager
 *
 * Provides reliable queue operations with idempotency, acknowledgment protocol,
 * and message visibility timeout for Docker agent ↔ Redis communication.
 * Part of Task 3.4: Redis Queue Consistency & Recovery (Integration Standardization Sprint 3)
 *
 * Features:
 * - Enqueue with idempotency (prevents duplicate messages)
 * - Dequeue with acknowledgment protocol
 * - Message visibility timeout
 * - Queue monitoring (depth, age, throughput)
 * - Multiple queue support (task, result, coordination)
 * - Performance: <100ms per operation
 *
 * Usage:
 *   const queueManager = new RedisQueueManager(redisClient);
 *
 *   // Producer
 *   await queueManager.enqueue('task-queue', {
 *     taskId: 'task-001',
 *     agentType: 'backend-developer',
 *     payload: { ... }
 *   });
 *
 *   // Consumer
 *   const message = await queueManager.dequeue('task-queue', { timeout: 30000 });
 *   try {
 *     await processTask(message.payload);
 *     await queueManager.acknowledge(message.id);
 *   } catch (error) {
 *     await queueManager.reject(message.id, { retry: true });
 *   }
 */

import { RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from './logging.js';
import { createError, ErrorCode, isRetryableError, StandardError } from './errors.js';
import { withRetry } from './retry.js';
import { MessageDeduplicator } from './message-deduplicator.js';

const logger = createLogger('redis-queue-manager');

/**
 * Queue message
 */
export interface QueueMessage<T = any> {
  /** Unique message ID */
  id: string;
  /** Queue name */
  queue: string;
  /** Message payload */
  payload: T;
  /** Message creation timestamp */
  createdAt: Date;
  /** Message enqueue timestamp */
  enqueuedAt: Date;
  /** Message dequeue timestamp (if dequeued) */
  dequeuedAt?: Date;
  /** Number of delivery attempts */
  deliveryAttempts: number;
  /** Message visibility timeout (milliseconds) */
  visibilityTimeout?: number;
  /** Message metadata */
  metadata?: Record<string, any>;
}

/**
 * Enqueue options
 */
export interface EnqueueOptions {
  /** Enable deduplication (default: true) */
  deduplicate?: boolean;
  /** Message metadata */
  metadata?: Record<string, any>;
  /** Message visibility timeout in milliseconds (default: 30000) */
  visibilityTimeout?: number;
}

/**
 * Dequeue options
 */
export interface DequeueOptions {
  /** Maximum wait time in milliseconds (default: 0 - no wait) */
  timeout?: number;
  /** Message visibility timeout in milliseconds (default: 30000) */
  visibilityTimeout?: number;
  /** Number of messages to dequeue (default: 1) */
  count?: number;
}

/**
 * Reject options
 */
export interface RejectOptions {
  /** Retry message (re-enqueue) (default: false) */
  retry?: boolean;
  /** Error message */
  error?: string;
  /** Metadata to attach */
  metadata?: Record<string, any>;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  /** Queue name */
  queue: string;
  /** Number of messages in queue */
  depth: number;
  /** Number of messages in processing (invisible) */
  inFlight: number;
  /** Age of oldest message in seconds */
  oldestMessageAge: number;
  /** Total messages enqueued */
  totalEnqueued: number;
  /** Total messages dequeued */
  totalDequeued: number;
  /** Total messages acknowledged */
  totalAcknowledged: number;
  /** Total messages rejected */
  totalRejected: number;
  /** Throughput (messages per second) */
  throughput: number;
}

/**
 * Default queue options
 */
const DEFAULT_ENQUEUE_OPTIONS: Required<EnqueueOptions> = {
  deduplicate: true,
  metadata: {},
  visibilityTimeout: 30000, // 30 seconds
};

const DEFAULT_DEQUEUE_OPTIONS: Required<DequeueOptions> = {
  timeout: 0,
  visibilityTimeout: 30000, // 30 seconds
  count: 1,
};

/**
 * Redis Queue Manager
 *
 * Provides reliable queue operations with at-least-once delivery guarantees.
 */
export class RedisQueueManager {
  private redis: RedisClientType;
  private deduplicator: MessageDeduplicator;
  private stats: Map<string, {
    enqueued: number;
    dequeued: number;
    acknowledged: number;
    rejected: number;
    startTime: Date;
  }> = new Map();

  /**
   * Create a new RedisQueueManager instance
   *
   * @param redis - Redis client instance
   * @param deduplicator - Optional custom deduplicator instance
   */
  constructor(redis: RedisClientType, deduplicator?: MessageDeduplicator) {
    this.redis = redis;
    this.deduplicator = deduplicator || new MessageDeduplicator(redis);

    logger.info('RedisQueueManager initialized');
  }

  /**
   * Enqueue a message to a queue
   *
   * @param queue - Queue name
   * @param payload - Message payload
   * @param options - Enqueue options
   * @returns Message ID
   */
  public async enqueue<T = any>(
    queue: string,
    payload: T,
    options: EnqueueOptions = {}
  ): Promise<string> {
    const opts = { ...DEFAULT_ENQUEUE_OPTIONS, ...options };
    const startTime = Date.now();

    try {
      // Check for duplicates if enabled
      if (opts.deduplicate) {
        const isDuplicate = await this.deduplicator.isDuplicate(payload);

        if (isDuplicate) {
          logger.warn('Duplicate message detected, skipping enqueue', {
            queue,
            payloadHash: this.deduplicator.createFingerprint(payload).substring(0, 16) + '...',
          });

          throw createError(
            ErrorCode.DB_DUPLICATE_KEY,
            'Duplicate message detected',
            { queue }
          );
        }
      }

      // Create message
      const message: QueueMessage<T> = {
        id: uuidv4(),
        queue,
        payload,
        createdAt: new Date(),
        enqueuedAt: new Date(),
        deliveryAttempts: 0,
        visibilityTimeout: opts.visibilityTimeout,
        metadata: opts.metadata,
      };

      // Push to queue (RPUSH for FIFO)
      await withRetry(
        async () => {
          const queueKey = this.getQueueKey(queue);
          await this.redis.rPush(queueKey, JSON.stringify(message));
        },
        { maxAttempts: 3, shouldRetry: isRetryableError }
      );

      // Mark as processed in deduplicator if enabled
      if (opts.deduplicate) {
        await this.deduplicator.markProcessed(payload, {
          messageId: message.id,
          queue,
        });
      }

      // Update stats
      this.updateStats(queue, 'enqueued');

      const duration = Date.now() - startTime;

      logger.debug('Message enqueued', {
        queue,
        messageId: message.id,
        durationMs: duration,
      });

      // Validate performance requirement (<100ms)
      if (duration > 100) {
        logger.warn('Enqueue operation exceeded 100ms target', {
          queue,
          durationMs: duration,
        });
      }

      return message.id;
    } catch (error) {
      // Re-throw duplicate errors without wrapping
      if (error instanceof StandardError && error.code === ErrorCode.DB_DUPLICATE_KEY) {
        throw error;
      }

      logger.error('Failed to enqueue message', error instanceof Error ? error : new Error(String(error)), {
        queue,
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to enqueue message',
        { queue },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Dequeue a message from a queue
   *
   * @param queue - Queue name
   * @param options - Dequeue options
   * @returns Message or null if queue is empty
   */
  public async dequeue<T = any>(
    queue: string,
    options: DequeueOptions = {}
  ): Promise<QueueMessage<T> | null> {
    const opts = { ...DEFAULT_DEQUEUE_OPTIONS, ...options };
    const startTime = Date.now();

    try {
      const queueKey = this.getQueueKey(queue);
      const processingKey = this.getProcessingKey(queue);

      let messageData: string | null = null;

      // Use blocking pop if timeout specified
      if (opts.timeout > 0) {
        const result = await withRetry(
          async () => {
            // BLMOVE atomically moves from queue to processing set with timeout
            return await this.redis.blMove(
              queueKey,
              processingKey,
              'LEFT',
              'RIGHT',
              opts.timeout / 1000 // Convert to seconds
            );
          },
          { maxAttempts: 1 } // Don't retry blocking operations
        );

        messageData = result;
      } else {
        // Non-blocking pop
        messageData = await withRetry(
          async () => {
            return await this.redis.lMove(
              queueKey,
              processingKey,
              'LEFT',
              'RIGHT'
            );
          },
          { maxAttempts: 3, shouldRetry: isRetryableError }
        );
      }

      if (!messageData) {
        return null;
      }

      // Parse message
      const message = JSON.parse(messageData) as QueueMessage<T>;

      // Convert date strings back to Date objects
      message.createdAt = new Date(message.createdAt);
      message.enqueuedAt = new Date(message.enqueuedAt);
      message.dequeuedAt = new Date();
      message.deliveryAttempts++;

      // Store message with visibility timeout
      await this.storeInFlight(message, opts.visibilityTimeout);

      // Update stats
      this.updateStats(queue, 'dequeued');

      const duration = Date.now() - startTime;

      logger.debug('Message dequeued', {
        queue,
        messageId: message.id,
        deliveryAttempts: message.deliveryAttempts,
        durationMs: duration,
      });

      // Validate performance requirement (<100ms)
      if (duration > 100) {
        logger.warn('Dequeue operation exceeded 100ms target', {
          queue,
          durationMs: duration,
        });
      }

      return message;
    } catch (error) {
      logger.error('Failed to dequeue message', error instanceof Error ? error : new Error(String(error)), {
        queue,
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to dequeue message',
        { queue },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Acknowledge successful message processing
   *
   * @param messageId - Message ID to acknowledge
   */
  public async acknowledge(messageId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Remove from in-flight storage
      const message = await this.getInFlight(messageId);

      if (!message) {
        logger.warn('Message not found for acknowledgment', { messageId });
        return;
      }

      // Remove from processing set
      const processingKey = this.getProcessingKey(message.queue);
      await withRetry(
        async () => {
          await this.redis.lRem(processingKey, 1, JSON.stringify(message));
        },
        { maxAttempts: 3, shouldRetry: isRetryableError }
      );

      // Remove from in-flight storage
      await this.removeInFlight(messageId);

      // Update stats
      this.updateStats(message.queue, 'acknowledged');

      const duration = Date.now() - startTime;

      logger.debug('Message acknowledged', {
        queue: message.queue,
        messageId,
        durationMs: duration,
      });
    } catch (error) {
      logger.error('Failed to acknowledge message', error instanceof Error ? error : new Error(String(error)), {
        messageId,
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to acknowledge message',
        { messageId },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Reject message processing (with optional retry)
   *
   * @param messageId - Message ID to reject
   * @param options - Reject options
   */
  public async reject(messageId: string, options: RejectOptions = {}): Promise<void> {
    const startTime = Date.now();

    try {
      // Get message from in-flight storage
      const message = await this.getInFlight(messageId);

      if (!message) {
        logger.warn('Message not found for rejection', { messageId });
        return;
      }

      // Remove from processing set
      const processingKey = this.getProcessingKey(message.queue);
      await withRetry(
        async () => {
          await this.redis.lRem(processingKey, 1, JSON.stringify(message));
        },
        { maxAttempts: 3, shouldRetry: isRetryableError }
      );

      // Remove from in-flight storage
      await this.removeInFlight(messageId);

      if (options.retry) {
        // Re-enqueue message
        message.metadata = {
          ...message.metadata,
          ...options.metadata,
          rejectedAt: new Date().toISOString(),
          rejectionReason: options.error,
        };

        const queueKey = this.getQueueKey(message.queue);
        await withRetry(
          async () => {
            await this.redis.rPush(queueKey, JSON.stringify(message));
          },
          { maxAttempts: 3, shouldRetry: isRetryableError }
        );

        logger.debug('Message rejected and re-enqueued', {
          queue: message.queue,
          messageId,
          deliveryAttempts: message.deliveryAttempts,
        });
      } else {
        logger.debug('Message rejected without retry', {
          queue: message.queue,
          messageId,
        });
      }

      // Update stats
      this.updateStats(message.queue, 'rejected');

      const duration = Date.now() - startTime;

      logger.debug('Message rejected', {
        queue: message.queue,
        messageId,
        retry: options.retry,
        durationMs: duration,
      });
    } catch (error) {
      logger.error('Failed to reject message', error instanceof Error ? error : new Error(String(error)), {
        messageId,
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to reject message',
        { messageId },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get queue statistics
   *
   * @param queue - Queue name
   * @returns Queue statistics
   */
  public async getStats(queue: string): Promise<QueueStats> {
    try {
      const queueKey = this.getQueueKey(queue);
      const processingKey = this.getProcessingKey(queue);

      // Get queue depth
      const depth = await this.redis.lLen(queueKey);

      // Get in-flight count
      const inFlight = await this.redis.lLen(processingKey);

      // Get oldest message age
      let oldestMessageAge = 0;
      const oldestMessage = await this.redis.lIndex(queueKey, 0);

      if (oldestMessage) {
        const message = JSON.parse(oldestMessage) as QueueMessage;
        const age = Date.now() - new Date(message.enqueuedAt).getTime();
        oldestMessageAge = Math.floor(age / 1000); // Convert to seconds
      }

      // Get stats from tracking
      const stats = this.stats.get(queue) || {
        enqueued: 0,
        dequeued: 0,
        acknowledged: 0,
        rejected: 0,
        startTime: new Date(),
      };

      // Calculate throughput (messages per second)
      const elapsed = (Date.now() - stats.startTime.getTime()) / 1000;
      const throughput = elapsed > 0 ? stats.dequeued / elapsed : 0;

      return {
        queue,
        depth,
        inFlight,
        oldestMessageAge,
        totalEnqueued: stats.enqueued,
        totalDequeued: stats.dequeued,
        totalAcknowledged: stats.acknowledged,
        totalRejected: stats.rejected,
        throughput,
      };
    } catch (error) {
      logger.error('Failed to get queue stats', error instanceof Error ? error : new Error(String(error)), {
        queue,
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to get queue stats',
        { queue },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Purge all messages from a queue
   *
   * @param queue - Queue name
   * @returns Number of messages purged
   */
  public async purge(queue: string): Promise<number> {
    try {
      const queueKey = this.getQueueKey(queue);

      const count = await withRetry(
        async () => {
          const len = await this.redis.lLen(queueKey);
          await this.redis.del(queueKey);
          return len;
        },
        { maxAttempts: 3, shouldRetry: isRetryableError }
      );

      logger.info('Queue purged', {
        queue,
        messagesPurged: count,
      });

      return count;
    } catch (error) {
      logger.error('Failed to purge queue', error instanceof Error ? error : new Error(String(error)), {
        queue,
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to purge queue',
        { queue },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get all queue names
   *
   * @returns Array of queue names
   */
  public async getQueues(): Promise<string[]> {
    try {
      const pattern = 'queue:*';
      const keys = await this.redis.keys(pattern);

      const queues = keys
        .filter(key => !key.includes(':processing'))
        .map(key => key.replace('queue:', ''));

      return queues;
    } catch (error) {
      logger.error('Failed to get queues', error instanceof Error ? error : new Error(String(error)));

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to get queues',
        {},
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Shutdown queue manager (cleanup resources)
   */
  public shutdown(): void {
    this.deduplicator.shutdown();
    logger.info('RedisQueueManager shutdown');
  }

  /**
   * Get Redis key for queue
   */
  private getQueueKey(queue: string): string {
    return `queue:${queue}`;
  }

  /**
   * Get Redis key for processing set
   */
  private getProcessingKey(queue: string): string {
    return `queue:${queue}:processing`;
  }

  /**
   * Get Redis key for in-flight message storage
   */
  private getInFlightKey(messageId: string): string {
    return `inflight:${messageId}`;
  }

  /**
   * Store message in in-flight storage with TTL
   */
  private async storeInFlight<T = any>(
    message: QueueMessage<T>,
    visibilityTimeout: number
  ): Promise<void> {
    const key = this.getInFlightKey(message.id);

    await withRetry(
      async () => {
        await this.redis.set(
          key,
          JSON.stringify(message),
          { PX: visibilityTimeout }
        );
      },
      { maxAttempts: 3, shouldRetry: isRetryableError }
    );
  }

  /**
   * Get message from in-flight storage
   */
  private async getInFlight<T = any>(messageId: string): Promise<QueueMessage<T> | null> {
    const key = this.getInFlightKey(messageId);

    const data = await withRetry(
      async () => await this.redis.get(key),
      { maxAttempts: 3, shouldRetry: isRetryableError }
    );

    if (!data) {
      return null;
    }

    const message = JSON.parse(data) as QueueMessage<T>;

    // Convert date strings back to Date objects
    message.createdAt = new Date(message.createdAt);
    message.enqueuedAt = new Date(message.enqueuedAt);
    if (message.dequeuedAt) {
      message.dequeuedAt = new Date(message.dequeuedAt);
    }

    return message;
  }

  /**
   * Remove message from in-flight storage
   */
  private async removeInFlight(messageId: string): Promise<void> {
    const key = this.getInFlightKey(messageId);

    await withRetry(
      async () => await this.redis.del(key),
      { maxAttempts: 3, shouldRetry: isRetryableError }
    );
  }

  /**
   * Update queue statistics
   */
  private updateStats(queue: string, operation: 'enqueued' | 'dequeued' | 'acknowledged' | 'rejected'): void {
    let stats = this.stats.get(queue);

    if (!stats) {
      stats = {
        enqueued: 0,
        dequeued: 0,
        acknowledged: 0,
        rejected: 0,
        startTime: new Date(),
      };
      this.stats.set(queue, stats);
    }

    stats[operation]++;
  }
}
