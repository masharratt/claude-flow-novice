/**
 * Message Deduplicator
 *
 * Provides SHA256-based message fingerprinting and deduplication for Redis queues.
 * Part of Task 3.4: Redis Queue Consistency & Recovery (Integration Standardization Sprint 3)
 *
 * Features:
 * - SHA256-based message fingerprinting
 * - Deduplication window (default 1 hour)
 * - Idempotency key tracking in Redis
 * - Automatic cleanup of expired keys
 * - Batch deduplication support
 *
 * Usage:
 *   const deduplicator = new MessageDeduplicator(redisClient);
 *   const isDuplicate = await deduplicator.isDuplicate(message);
 *   if (!isDuplicate) {
 *     await deduplicator.markProcessed(message);
 *   }
 */

import * as crypto from 'crypto';
import { RedisClientType } from 'redis';
import { createLogger } from './logging.js';
import { createError, ErrorCode, isRetryableError } from './errors.js';
import { withRetry } from './retry.js';

const logger = createLogger('message-deduplicator');

/**
 * Message deduplication options
 */
export interface DeduplicationOptions {
  /** Deduplication window in milliseconds (default: 1 hour) */
  windowMs?: number;
  /** Key prefix for Redis storage (default: 'dedup:') */
  keyPrefix?: string;
  /** Enable automatic cleanup of expired keys (default: true) */
  autoCleanup?: boolean;
  /** Cleanup interval in milliseconds (default: 5 minutes) */
  cleanupIntervalMs?: number;
  /** Maximum retry attempts for Redis operations (default: 3) */
  maxRetries?: number;
}

/**
 * Message fingerprint metadata
 */
export interface MessageFingerprint {
  /** SHA256 hash of message content */
  hash: string;
  /** Message content (for debugging) */
  content: any;
  /** First seen timestamp */
  firstSeenAt: Date;
  /** Expiration timestamp */
  expiresAt: Date;
  /** Number of times this message was seen */
  seenCount: number;
}

/**
 * Deduplication statistics
 */
export interface DeduplicationStats {
  /** Total messages processed */
  totalProcessed: number;
  /** Number of duplicates detected */
  duplicatesDetected: number;
  /** Number of unique messages */
  uniqueMessages: number;
  /** Deduplication rate (duplicates / total) */
  deduplicationRate: number;
  /** Active fingerprints in window */
  activeFingerprints: number;
}

/**
 * Default deduplication options
 */
const DEFAULT_OPTIONS: Required<DeduplicationOptions> = {
  windowMs: 60 * 60 * 1000, // 1 hour
  keyPrefix: 'dedup:',
  autoCleanup: true,
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
  maxRetries: 3,
};

/**
 * Message Deduplicator
 *
 * Provides idempotent message processing using SHA256-based fingerprinting.
 */
export class MessageDeduplicator {
  private redis: RedisClientType;
  private options: Required<DeduplicationOptions>;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private stats: {
    processed: number;
    duplicates: number;
    unique: number;
  } = {
    processed: 0,
    duplicates: 0,
    unique: 0,
  };

  /**
   * Create a new MessageDeduplicator instance
   *
   * @param redis - Redis client instance
   * @param options - Deduplication options
   */
  constructor(redis: RedisClientType, options: DeduplicationOptions = {}) {
    this.redis = redis;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Start automatic cleanup if enabled
    if (this.options.autoCleanup) {
      this.startAutoCleanup();
    }

    logger.info('MessageDeduplicator initialized', {
      windowMs: this.options.windowMs,
      keyPrefix: this.options.keyPrefix,
      autoCleanup: this.options.autoCleanup,
    });
  }

  /**
   * Create message fingerprint (SHA256 hash)
   *
   * @param message - Message content to fingerprint
   * @returns SHA256 hash
   */
  public createFingerprint(message: any): string {
    // Normalize message to JSON string for consistent hashing
    let content: string;

    if (typeof message === 'string') {
      content = message;
    } else if (typeof message === 'object') {
      // Sort object keys for deterministic hashing
      content = JSON.stringify(message, Object.keys(message).sort());
    } else {
      content = String(message);
    }

    // Generate SHA256 hash
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    logger.debug('Created message fingerprint', {
      hash: hash.substring(0, 16) + '...',
      contentLength: content.length,
    });

    return hash;
  }

  /**
   * Check if message is a duplicate
   *
   * @param message - Message content to check
   * @returns True if duplicate, false if unique
   */
  public async isDuplicate(message: any): Promise<boolean> {
    const hash = this.createFingerprint(message);
    const key = this.getRedisKey(hash);

    try {
      const exists = await withRetry(
        async () => {
          const result = await this.redis.exists(key);
          return result === 1;
        },
        { maxAttempts: this.options.maxRetries, shouldRetry: isRetryableError }
      );

      this.stats.processed++;

      if (exists) {
        this.stats.duplicates++;

        // Increment seen count
        await this.incrementSeenCount(hash);

        logger.debug('Duplicate message detected', {
          hash: hash.substring(0, 16) + '...',
          duplicateCount: this.stats.duplicates,
        });

        return true;
      }

      this.stats.unique++;
      return false;
    } catch (error) {
      logger.error('Failed to check duplicate', error instanceof Error ? error : new Error(String(error)), {
        hash: hash.substring(0, 16) + '...',
      });

      // On error, assume not duplicate to allow processing
      return false;
    }
  }

  /**
   * Mark message as processed
   *
   * @param message - Message content to mark
   * @param metadata - Optional metadata to store
   */
  public async markProcessed(message: any, metadata?: Record<string, any>): Promise<void> {
    const hash = this.createFingerprint(message);
    const key = this.getRedisKey(hash);

    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.options.windowMs);

      const fingerprint: MessageFingerprint = {
        hash,
        content: message,
        firstSeenAt: now,
        expiresAt,
        seenCount: 1,
        ...metadata,
      };

      await withRetry(
        async () => {
          // Store fingerprint with TTL
          await this.redis.set(
            key,
            JSON.stringify(fingerprint),
            {
              PX: this.options.windowMs, // Expiration in milliseconds
            }
          );
        },
        { maxAttempts: this.options.maxRetries, shouldRetry: isRetryableError }
      );

      logger.debug('Marked message as processed', {
        hash: hash.substring(0, 16) + '...',
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      logger.error('Failed to mark message as processed', error instanceof Error ? error : new Error(String(error)), {
        hash: hash.substring(0, 16) + '...',
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to mark message as processed',
        { hash },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Batch check for duplicates
   *
   * @param messages - Array of messages to check
   * @returns Map of message hash to duplicate status
   */
  public async batchIsDuplicate(messages: any[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    try {
      // Create fingerprints for all messages
      const fingerprints = messages.map(msg => ({
        message: msg,
        hash: this.createFingerprint(msg),
      }));

      // Check existence in batch using MGET
      const keys = fingerprints.map(fp => this.getRedisKey(fp.hash));

      const existsResults = await withRetry(
        async () => {
          // Use pipeline for efficient batch operations
          const pipeline = this.redis.multi();
          keys.forEach(key => pipeline.exists(key));
          return await pipeline.exec();
        },
        { maxAttempts: this.options.maxRetries, shouldRetry: isRetryableError }
      );

      // Build results map
      fingerprints.forEach((fp, index) => {
        const exists = existsResults && existsResults[index] === 1;
        results.set(fp.hash, !!exists);

        this.stats.processed++;
        if (exists) {
          this.stats.duplicates++;
        } else {
          this.stats.unique++;
        }
      });

      logger.debug('Batch duplicate check complete', {
        totalMessages: messages.length,
        duplicates: Array.from(results.values()).filter(v => v).length,
      });

      return results;
    } catch (error) {
      logger.error('Failed to batch check duplicates', error instanceof Error ? error : new Error(String(error)), {
        messageCount: messages.length,
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to batch check duplicates',
        { messageCount: messages.length },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Batch mark messages as processed
   *
   * @param messages - Array of messages to mark
   */
  public async batchMarkProcessed(messages: any[]): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.options.windowMs);

      // Use pipeline for efficient batch operations
      const pipeline = this.redis.multi();

      messages.forEach(message => {
        const hash = this.createFingerprint(message);
        const key = this.getRedisKey(hash);

        const fingerprint: MessageFingerprint = {
          hash,
          content: message,
          firstSeenAt: now,
          expiresAt,
          seenCount: 1,
        };

        pipeline.set(
          key,
          JSON.stringify(fingerprint),
          { PX: this.options.windowMs }
        );
      });

      await withRetry(
        async () => await pipeline.exec(),
        { maxAttempts: this.options.maxRetries, shouldRetry: isRetryableError }
      );

      logger.debug('Batch marked messages as processed', {
        count: messages.length,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      logger.error('Failed to batch mark messages', error instanceof Error ? error : new Error(String(error)), {
        messageCount: messages.length,
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to batch mark messages',
        { messageCount: messages.length },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get message fingerprint details
   *
   * @param message - Message to get fingerprint for
   * @returns Fingerprint metadata or null if not found
   */
  public async getFingerprint(message: any): Promise<MessageFingerprint | null> {
    const hash = this.createFingerprint(message);
    const key = this.getRedisKey(hash);

    try {
      const data = await withRetry(
        async () => await this.redis.get(key),
        { maxAttempts: this.options.maxRetries, shouldRetry: isRetryableError }
      );

      if (!data) {
        return null;
      }

      const fingerprint = JSON.parse(data) as MessageFingerprint;

      // Convert date strings back to Date objects
      fingerprint.firstSeenAt = new Date(fingerprint.firstSeenAt);
      fingerprint.expiresAt = new Date(fingerprint.expiresAt);

      return fingerprint;
    } catch (error) {
      logger.error('Failed to get fingerprint', error instanceof Error ? error : new Error(String(error)), {
        hash: hash.substring(0, 16) + '...',
      });

      return null;
    }
  }

  /**
   * Remove message fingerprint
   *
   * @param message - Message to remove fingerprint for
   */
  public async removeFingerprint(message: any): Promise<void> {
    const hash = this.createFingerprint(message);
    const key = this.getRedisKey(hash);

    try {
      await withRetry(
        async () => await this.redis.del(key),
        { maxAttempts: this.options.maxRetries, shouldRetry: isRetryableError }
      );

      logger.debug('Removed fingerprint', {
        hash: hash.substring(0, 16) + '...',
      });
    } catch (error) {
      logger.error('Failed to remove fingerprint', error instanceof Error ? error : new Error(String(error)), {
        hash: hash.substring(0, 16) + '...',
      });

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to remove fingerprint',
        { hash },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Cleanup expired fingerprints
   *
   * Note: Redis automatically removes expired keys, but this can be used for manual cleanup
   *
   * @returns Number of fingerprints cleaned up
   */
  public async cleanupExpired(): Promise<number> {
    try {
      const pattern = `${this.options.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);

      let cleanedCount = 0;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);

        // If TTL is -1 (no expiration) or -2 (key doesn't exist), skip
        if (ttl === -1 || ttl === -2) {
          continue;
        }

        // If TTL is 0 or negative (expired but not yet removed), delete
        if (ttl <= 0) {
          await this.redis.del(key);
          cleanedCount++;
        }
      }

      logger.info('Cleaned up expired fingerprints', {
        cleanedCount,
        totalKeys: keys.length,
      });

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired fingerprints', error instanceof Error ? error : new Error(String(error)));

      throw createError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to cleanup expired fingerprints',
        {},
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get deduplication statistics
   *
   * @returns Current statistics
   */
  public async getStats(): Promise<DeduplicationStats> {
    try {
      const pattern = `${this.options.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);

      return {
        totalProcessed: this.stats.processed,
        duplicatesDetected: this.stats.duplicates,
        uniqueMessages: this.stats.unique,
        deduplicationRate: this.stats.processed > 0
          ? this.stats.duplicates / this.stats.processed
          : 0,
        activeFingerprints: keys.length,
      };
    } catch (error) {
      logger.error('Failed to get stats', error instanceof Error ? error : new Error(String(error)));

      return {
        totalProcessed: this.stats.processed,
        duplicatesDetected: this.stats.duplicates,
        uniqueMessages: this.stats.unique,
        deduplicationRate: this.stats.processed > 0
          ? this.stats.duplicates / this.stats.processed
          : 0,
        activeFingerprints: 0,
      };
    }
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      processed: 0,
      duplicates: 0,
      unique: 0,
    };

    logger.debug('Statistics reset');
  }

  /**
   * Stop automatic cleanup
   */
  public stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.debug('Auto cleanup stopped');
    }
  }

  /**
   * Shutdown deduplicator (stop auto cleanup)
   */
  public shutdown(): void {
    this.stopAutoCleanup();
    logger.info('MessageDeduplicator shutdown');
  }

  /**
   * Get Redis key for fingerprint hash
   */
  private getRedisKey(hash: string): string {
    return `${this.options.keyPrefix}${hash}`;
  }

  /**
   * Increment seen count for fingerprint
   */
  private async incrementSeenCount(hash: string): Promise<void> {
    const key = this.getRedisKey(hash);

    try {
      const data = await this.redis.get(key);

      if (data) {
        const fingerprint = JSON.parse(data) as MessageFingerprint;
        fingerprint.seenCount++;

        await this.redis.set(
          key,
          JSON.stringify(fingerprint),
          { KEEPTTL: true } // Preserve existing TTL
        );
      }
    } catch (error) {
      // Log but don't throw - incrementing seen count is not critical
      logger.debug('Failed to increment seen count', {
        hash: hash.substring(0, 16) + '...',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(
      async () => {
        try {
          await this.cleanupExpired();
        } catch (error) {
          logger.error('Auto cleanup failed', error instanceof Error ? error : new Error(String(error)));
        }
      },
      this.options.cleanupIntervalMs
    );

    logger.debug('Auto cleanup started', {
      intervalMs: this.options.cleanupIntervalMs,
    });
  }
}
