/**
 * Distributed Lock Manager
 *
 * Provides distributed locking mechanism for cross-database transactions using Redis.
 * Prevents concurrent modifications and ensures data consistency.
 *
 * Features:
 * - Lock acquisition with timeout
 * - Automatic lock release (TTL-based)
 * - Lock metadata tracking
 * - Deadlock detection via timeout
 * - Support for multiple lock granularities (database, table, row)
 *
 * Part of Task 3.1: Cross-Database Transaction Framework
 */

import { randomUUID } from 'crypto';
import { createLogger } from './logging';
import { withRetry } from './retry';
import { generateCorrelationId } from './correlation';

const logger = createLogger('distributed-lock');

/**
 * Lock resource identifier
 */
export interface LockResource {
  /** Database name */
  database: string;
  /** Table name (optional for table-level locks) */
  table?: string;
  /** Row key (optional for row-level locks) */
  key?: string;
}

/**
 * Lock acquisition options
 */
export interface LockOptions {
  /** Lock acquisition timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Transaction ID to associate with lock */
  transactionId?: string;
  /** Auto-release TTL in milliseconds (default: 60000) */
  ttl?: number;
  /** Retry interval for lock acquisition in milliseconds (default: 100) */
  retryInterval?: number;
  /** Correlation ID for tracking */
  correlationId?: string;
}

/**
 * Lock instance
 */
export interface Lock {
  /** Unique lock ID */
  id: string;
  /** Resource being locked */
  resource: LockResource;
  /** Lock acquisition timestamp */
  acquiredAt: Date;
  /** Associated transaction ID */
  transactionId?: string;
  /** Lock TTL in milliseconds */
  ttl: number;
  /** Correlation ID */
  correlationId: string;
}

/**
 * Lock metadata (stored in Redis)
 */
export interface LockMetadata {
  /** Lock ID */
  lockId: string;
  /** Transaction ID */
  transactionId?: string;
  /** Acquired timestamp (ISO string) */
  acquiredAt: string;
  /** Expiration timestamp (ISO string) */
  expiresAt: string;
  /** Correlation ID */
  correlationId: string;
}

/**
 * Redis-backed distributed lock manager
 */
export class DistributedLock {
  private redisClient: any; // Redis client interface (avoid tight coupling)
  private activeLocks: Map<string, Lock> = new Map();

  constructor(redisClient: any) {
    this.redisClient = redisClient;
    logger.info('Distributed lock manager initialized');
  }

  /**
   * Acquire lock on a resource with timeout and retry
   */
  async acquire(resource: LockResource, options: LockOptions = {}): Promise<Lock> {
    const opts = {
      timeout: options.timeout ?? 10000,
      transactionId: options.transactionId,
      ttl: options.ttl ?? 60000,
      retryInterval: options.retryInterval ?? 100,
      correlationId: options.correlationId ?? generateCorrelationId(),
    };

    const lockKey = this.buildLockKey(resource);
    const lockId = randomUUID();
    const startTime = Date.now();

    logger.debug('Attempting lock acquisition', {
      lockKey,
      lockId,
      transactionId: opts.transactionId,
      timeout: opts.timeout,
      correlationId: opts.correlationId,
    });

    // Try to acquire lock with timeout
    while (Date.now() - startTime < opts.timeout) {
      const acquired = await this.tryAcquire(lockKey, lockId, opts);

      if (acquired) {
        const lock: Lock = {
          id: lockId,
          resource,
          acquiredAt: new Date(),
          transactionId: opts.transactionId,
          ttl: opts.ttl,
          correlationId: opts.correlationId,
        };

        this.activeLocks.set(lockId, lock);

        logger.info('Lock acquired successfully', {
          lockId,
          lockKey,
          transactionId: opts.transactionId,
          ttl: opts.ttl,
          duration: Date.now() - startTime,
        });

        return lock;
      }

      // Wait before retry
      await this.sleep(opts.retryInterval);
    }

    // Timeout reached
    const currentHolder = await this.getLockInfo(resource);

    logger.warn('Lock acquisition timeout', {
      lockKey,
      lockId,
      timeout: opts.timeout,
      currentHolder,
      correlationId: opts.correlationId,
    });

    throw new LockAcquisitionError(
      `Failed to acquire lock on ${lockKey} within ${opts.timeout}ms`,
      lockKey,
      currentHolder
    );
  }

  /**
   * Try to acquire lock atomically (single attempt)
   */
  private async tryAcquire(
    lockKey: string,
    lockId: string,
    options: Required<Omit<LockOptions, 'retryInterval'>>
  ): Promise<boolean> {
    try {
      const metadata: LockMetadata = {
        lockId,
        transactionId: options.transactionId,
        acquiredAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + options.ttl).toISOString(),
        correlationId: options.correlationId,
      };

      // Use Redis SET NX (set if not exists) with TTL
      // This is atomic and prevents race conditions
      const result = await this.redisClient.set(
        lockKey,
        JSON.stringify(metadata),
        'PX', // milliseconds
        options.ttl,
        'NX' // only set if not exists
      );

      return result === 'OK';
    } catch (err) {
      logger.error('Error during lock acquisition attempt', err as Error, {
        lockKey,
        lockId,
      });
      return false;
    }
  }

  /**
   * Release a lock manually
   */
  async release(lock: Lock): Promise<void> {
    const lockKey = this.buildLockKey(lock.resource);

    logger.debug('Releasing lock', {
      lockId: lock.id,
      lockKey,
      transactionId: lock.transactionId,
    });

    try {
      // Verify we own the lock before releasing
      const metadata = await this.getLockInfo(lock.resource);

      if (!metadata) {
        logger.warn('Lock already released or expired', {
          lockId: lock.id,
          lockKey,
        });
        this.activeLocks.delete(lock.id);
        return;
      }

      if (metadata.lockId !== lock.id) {
        logger.error('Lock ownership mismatch', new Error('Lock ownership mismatch'), {
          expectedLockId: lock.id,
          actualLockId: metadata.lockId,
          lockKey,
        });
        throw new LockOwnershipError(
          `Cannot release lock ${lockKey}: ownership mismatch`,
          lock.id,
          metadata.lockId
        );
      }

      // Delete lock from Redis
      await this.redisClient.del(lockKey);

      this.activeLocks.delete(lock.id);

      logger.info('Lock released successfully', {
        lockId: lock.id,
        lockKey,
        transactionId: lock.transactionId,
      });
    } catch (err) {
      logger.error('Error releasing lock', err as Error, {
        lockId: lock.id,
        lockKey,
      });
      throw err;
    }
  }

  /**
   * Check if a resource is currently locked
   */
  async isLocked(resource: LockResource): Promise<boolean> {
    const lockKey = this.buildLockKey(resource);

    try {
      const exists = await this.redisClient.exists(lockKey);
      return exists === 1;
    } catch (err) {
      logger.error('Error checking lock status', err as Error, {
        lockKey,
      });
      return false; // Assume unlocked on error (fail-safe)
    }
  }

  /**
   * Get lock metadata for a resource
   */
  async getLockInfo(resource: LockResource): Promise<LockMetadata | null> {
    const lockKey = this.buildLockKey(resource);

    try {
      const data = await this.redisClient.get(lockKey);

      if (!data) {
        return null;
      }

      const metadata: LockMetadata = JSON.parse(data);
      return metadata;
    } catch (err) {
      logger.error('Error retrieving lock info', err as Error, {
        lockKey,
      });
      return null;
    }
  }

  /**
   * Force release of a lock (admin operation - use with caution)
   */
  async forceRelease(resource: LockResource): Promise<void> {
    const lockKey = this.buildLockKey(resource);

    logger.warn('Force releasing lock', {
      lockKey,
    });

    try {
      await this.redisClient.del(lockKey);

      // Clean up from active locks if present
      for (const [id, lock] of Array.from(this.activeLocks.entries())) {
        if (this.buildLockKey(lock.resource) === lockKey) {
          this.activeLocks.delete(id);
        }
      }

      logger.info('Lock force released', {
        lockKey,
      });
    } catch (err) {
      logger.error('Error force releasing lock', err as Error, {
        lockKey,
      });
      throw err;
    }
  }

  /**
   * Get all active locks managed by this instance
   */
  getActiveLocks(): Lock[] {
    return Array.from(this.activeLocks.values());
  }

  /**
   * Clean up expired locks from tracking
   */
  cleanupExpiredLocks(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, lock] of Array.from(this.activeLocks.entries())) {
      const expiresAt = lock.acquiredAt.getTime() + lock.ttl;

      if (now > expiresAt) {
        this.activeLocks.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up expired locks from tracking', { count: cleaned });
    }

    return cleaned;
  }

  /**
   * Release all active locks (cleanup on shutdown)
   */
  async releaseAll(): Promise<void> {
    logger.info('Releasing all active locks', { count: this.activeLocks.size });

    const releases = Array.from(this.activeLocks.values()).map(lock =>
      this.release(lock).catch(err => {
        logger.error('Error releasing lock during cleanup', err, {
          lockId: lock.id,
        });
      })
    );

    await Promise.all(releases);

    logger.info('All locks released');
  }

  /**
   * Build Redis key for lock resource
   */
  private buildLockKey(resource: LockResource): string {
    const parts = ['lock', resource.database];

    if (resource.table) {
      parts.push(resource.table);
    }

    if (resource.key) {
      parts.push(resource.key);
    }

    return parts.join(':');
  }

  /**
   * Sleep utility for retry intervals
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Lock acquisition error
 */
export class LockAcquisitionError extends Error {
  constructor(
    message: string,
    public lockKey: string,
    public currentHolder?: LockMetadata | null
  ) {
    super(message);
    this.name = 'LockAcquisitionError';
  }
}

/**
 * Lock ownership error
 */
export class LockOwnershipError extends Error {
  constructor(
    message: string,
    public expectedLockId: string,
    public actualLockId: string
  ) {
    super(message);
    this.name = 'LockOwnershipError';
  }
}

/**
 * Utility: Execute function with distributed lock
 */
export async function withLock<T>(
  lockManager: DistributedLock,
  resource: LockResource,
  fn: () => Promise<T>,
  options?: LockOptions
): Promise<T> {
  const lock = await lockManager.acquire(resource, options);

  try {
    const result = await fn();
    await lockManager.release(lock);
    return result;
  } catch (err) {
    await lockManager.release(lock);
    throw err;
  }
}
