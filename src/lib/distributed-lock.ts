/**
 * Distributed Lock Manager - Enhanced v2
 *
 * Provides distributed locking mechanism for cross-database transactions using Redis.
 * Prevents concurrent modifications and ensures data consistency.
 *
 * Enhanced Features (Phase 2, Task P2-2.2):
 * - Mandatory TTL enforcement with automatic expiration
 * - Lock renewal mechanism for long-running operations
 * - Auto-renewal with configurable interval
 * - Lock health monitoring and statistics
 * - Deadlock detection support
 * - Stale lock cleanup
 * - Backward compatible with existing usage
 *
 * Part of Task 3.1 (enhanced in Task P2-2.2)
 */

import { randomUUID } from 'crypto';
import { createLogger } from './logging';
import { generateCorrelationId } from './correlation';

const logger = createLogger('distributed-lock');

/**
 * Lock acquisition options (enhanced)
 */
export interface LockOptions {
  /** Lock resource key (required) */
  key: string;
  /** Auto-release TTL in milliseconds (REQUIRED in v2) */
  ttl: number;
  /** Lock acquisition timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Auto-renewal interval in milliseconds (optional, enables auto-renewal) */
  renewInterval?: number;
  /** Transaction ID to associate with lock */
  transactionId?: string;
  /** Retry interval for lock acquisition in milliseconds (default: 100) */
  retryInterval?: number;
  /** Correlation ID for tracking */
  correlationId?: string;
}

/**
 * Lock instance (enhanced)
 */
export interface Lock {
  /** Unique lock ID */
  id: string;
  /** Lock resource key */
  key: string;
  /** Lock acquisition timestamp */
  acquiredAt: Date;
  /** Associated transaction ID */
  transactionId?: string;
  /** Lock TTL in milliseconds */
  ttl: number;
  /** Auto-renewal interval (if enabled) */
  renewInterval?: number;
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
  /** Process ID (for deadlock detection) */
  processId: number;
  /** Acquired timestamp (ISO string) */
  acquiredAt: string;
  /** Expiration timestamp (ISO string) */
  expiresAt: string;
  /** Last renewal timestamp (ISO string) */
  lastRenewedAt?: string;
  /** Correlation ID */
  correlationId: string;
}

/**
 * Lock statistics
 */
export interface LockStatistics {
  /** Total lock acquisitions */
  totalAcquisitions: number;
  /** Total lock releases */
  totalReleases: number;
  /** Currently held locks */
  currentlyHeld: number;
  /** Total renewals performed */
  totalRenewals: number;
  /** Average lock duration (ms) */
  averageDuration: number;
  /** Failed acquisition attempts */
  failedAcquisitions: number;
}

/**
 * Enhanced Redis-backed distributed lock manager
 */
export class DistributedLockManager {
  private redisClient: any;
  private activeLocks: Map<string, Lock> = new Map();
  private renewalTimers: Map<string, NodeJS.Timeout> = new Map();
  private statistics: LockStatistics = {
    totalAcquisitions: 0,
    totalReleases: 0,
    currentlyHeld: 0,
    totalRenewals: 0,
    averageDuration: 0,
    failedAcquisitions: 0,
  };
  private lockDurations: number[] = [];

  constructor(redisClient: any) {
    this.redisClient = redisClient;
    logger.info('Enhanced distributed lock manager initialized (v2)');
  }

  /**
   * Acquire lock on a resource with TTL enforcement and optional auto-renewal
   */
  async acquireLock(options: LockOptions): Promise<Lock> {
    // Validate TTL (REQUIRED in v2)
    if (options.ttl === undefined || options.ttl === null) {
      // Backward compatibility: use default 60s TTL
      options.ttl = 60000;
    }

    if (options.ttl <= 0) {
      throw new Error('TTL must be positive');
    }

    const opts = {
      timeout: options.timeout ?? 10000,
      transactionId: options.transactionId,
      retryInterval: options.retryInterval ?? 100,
      correlationId: options.correlationId ?? generateCorrelationId(),
    };

    const lockKey = this.buildLockKey(options.key);
    const lockId = randomUUID();
    const startTime = Date.now();

    logger.debug('Attempting lock acquisition', {
      lockKey,
      lockId,
      ttl: options.ttl,
      renewInterval: options.renewInterval,
      transactionId: opts.transactionId,
      timeout: opts.timeout,
      correlationId: opts.correlationId,
    });

    // Try to acquire lock with timeout
    while (Date.now() - startTime < opts.timeout) {
      const acquired = await this.tryAcquire(lockKey, lockId, options, opts);

      if (acquired) {
        const lock: Lock = {
          id: lockId,
          key: options.key,
          acquiredAt: new Date(),
          transactionId: opts.transactionId,
          ttl: options.ttl,
          renewInterval: options.renewInterval,
          correlationId: opts.correlationId,
        };

        this.activeLocks.set(lockId, lock);
        this.statistics.totalAcquisitions++;
        this.statistics.currentlyHeld++;

        // Start auto-renewal if configured
        if (options.renewInterval) {
          this.startAutoRenewal(lock);
        }

        logger.info('Lock acquired successfully', {
          lockId,
          lockKey,
          ttl: options.ttl,
          renewInterval: options.renewInterval,
          transactionId: opts.transactionId,
          duration: Date.now() - startTime,
        });

        return lock;
      }

      // Wait before retry
      await this.sleep(opts.retryInterval);
    }

    // Timeout reached
    const currentHolder = await this.getLockInfo(options.key);

    this.statistics.failedAcquisitions++;

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
    options: LockOptions,
    opts: { transactionId?: string; correlationId: string }
  ): Promise<boolean> {
    try {
      const now = new Date();
      const metadata: LockMetadata = {
        lockId,
        transactionId: opts.transactionId,
        processId: process.pid,
        acquiredAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + options.ttl).toISOString(),
        correlationId: opts.correlationId,
      };

      // Use Redis SET NX (set if not exists) with TTL (PX = milliseconds)
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
   * Renew lock TTL (extends expiration time)
   */
  async renewLock(lockId: string, ttl: number): Promise<void> {
    const lock = this.activeLocks.get(lockId);

    if (!lock) {
      throw new LockOwnershipError(
        `Cannot renew lock ${lockId}: lock not found in active locks`,
        lockId,
        'unknown'
      );
    }

    const lockKey = this.buildLockKey(lock.key);

    try {
      // Get current lock metadata
      const metadata = await this.getLockInfo(lock.key);

      if (!metadata) {
        throw new Error('Lock has expired or been released');
      }

      if (metadata.lockId !== lockId) {
        throw new LockOwnershipError(
          `Cannot renew lock ${lockKey}: ownership mismatch`,
          lockId,
          metadata.lockId
        );
      }

      // Update expiration time
      const now = new Date();
      metadata.expiresAt = new Date(now.getTime() + ttl).toISOString();
      metadata.lastRenewedAt = now.toISOString();

      // Update Redis with new TTL
      await this.redisClient.set(
        lockKey,
        JSON.stringify(metadata),
        'PX',
        ttl
      );

      // Update local lock object
      lock.ttl = ttl;

      this.statistics.totalRenewals++;

      logger.debug('Lock renewed successfully', {
        lockId,
        lockKey,
        newTtl: ttl,
      });
    } catch (err) {
      logger.error('Error renewing lock', err as Error, {
        lockId,
        lockKey,
      });
      throw err;
    }
  }

  /**
   * Start auto-renewal for a lock
   */
  private startAutoRenewal(lock: Lock): void {
    if (!lock.renewInterval) {
      return;
    }

    const timer = setInterval(async () => {
      try {
        await this.renewLock(lock.id, lock.ttl);
        logger.debug('Auto-renewal completed', {
          lockId: lock.id,
          key: lock.key,
        });
      } catch (err) {
        logger.error('Auto-renewal failed', err as Error, {
          lockId: lock.id,
          key: lock.key,
        });
        // Stop renewal on failure
        this.stopAutoRenewal(lock.id);
      }
    }, lock.renewInterval);

    this.renewalTimers.set(lock.id, timer);

    logger.debug('Auto-renewal started', {
      lockId: lock.id,
      key: lock.key,
      interval: lock.renewInterval,
    });
  }

  /**
   * Stop auto-renewal for a lock
   */
  private stopAutoRenewal(lockId: string): void {
    const timer = this.renewalTimers.get(lockId);

    if (timer) {
      clearInterval(timer);
      this.renewalTimers.delete(lockId);

      logger.debug('Auto-renewal stopped', { lockId });
    }
  }

  /**
   * Release a lock manually
   */
  async releaseLock(lockId: string): Promise<void> {
    const lock = this.activeLocks.get(lockId);

    if (!lock) {
      logger.warn('Lock not found in active locks', { lockId });
      return;
    }

    const lockKey = this.buildLockKey(lock.key);

    logger.debug('Releasing lock', {
      lockId,
      lockKey,
      transactionId: lock.transactionId,
    });

    try {
      // Stop auto-renewal if active
      this.stopAutoRenewal(lockId);

      // Verify we own the lock before releasing
      const metadata = await this.getLockInfo(lock.key);

      if (!metadata) {
        logger.warn('Lock already released or expired', {
          lockId,
          lockKey,
        });
        this.activeLocks.delete(lockId);
        this.statistics.currentlyHeld = Math.max(0, this.statistics.currentlyHeld - 1);
        return;
      }

      if (metadata.lockId !== lockId) {
        logger.error('Lock ownership mismatch', new Error('Lock ownership mismatch'), {
          expectedLockId: lockId,
          actualLockId: metadata.lockId,
          lockKey,
        });
        throw new LockOwnershipError(
          `Cannot release lock ${lockKey}: ownership mismatch`,
          lockId,
          metadata.lockId
        );
      }

      // Delete lock from Redis
      await this.redisClient.del(lockKey);

      // Track duration for statistics
      const duration = Date.now() - lock.acquiredAt.getTime();
      this.lockDurations.push(duration);

      // Keep only last 100 durations for average calculation
      if (this.lockDurations.length > 100) {
        this.lockDurations.shift();
      }

      // Update statistics
      this.statistics.totalReleases++;
      this.statistics.currentlyHeld = Math.max(0, this.statistics.currentlyHeld - 1);
      this.statistics.averageDuration = this.calculateAverageDuration();

      this.activeLocks.delete(lockId);

      logger.info('Lock released successfully', {
        lockId,
        lockKey,
        duration,
        transactionId: lock.transactionId,
      });
    } catch (err) {
      logger.error('Error releasing lock', err as Error, {
        lockId,
        lockKey,
      });
      throw err;
    }
  }

  /**
   * Check if a resource is currently locked
   */
  async isLocked(key: string): Promise<boolean> {
    const lockKey = this.buildLockKey(key);

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
  async getLockInfo(key: string): Promise<LockMetadata | null> {
    const lockKey = this.buildLockKey(key);

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
  async forceRelease(key: string): Promise<void> {
    const lockKey = this.buildLockKey(key);

    logger.warn('Force releasing lock', {
      lockKey,
    });

    try {
      await this.redisClient.del(lockKey);

      // Clean up from active locks if present
      for (const [id, lock] of Array.from(this.activeLocks.entries())) {
        if (lock.key === key) {
          this.stopAutoRenewal(id);
          this.activeLocks.delete(id);
          this.statistics.currentlyHeld = Math.max(0, this.statistics.currentlyHeld - 1);
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
   * Get lock statistics
   */
  getStatistics(): LockStatistics {
    return { ...this.statistics };
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
        this.stopAutoRenewal(id);
        this.activeLocks.delete(id);
        this.statistics.currentlyHeld = Math.max(0, this.statistics.currentlyHeld - 1);
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
      this.releaseLock(lock.id).catch(err => {
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
  private buildLockKey(key: string): string {
    return `lock:${key}`;
  }

  /**
   * Calculate average lock duration
   */
  private calculateAverageDuration(): number {
    if (this.lockDurations.length === 0) {
      return 0;
    }

    const sum = this.lockDurations.reduce((acc, dur) => acc + dur, 0);
    return Math.round(sum / this.lockDurations.length);
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
  lockManager: DistributedLockManager,
  key: string,
  fn: () => Promise<T>,
  options?: Omit<LockOptions, 'key'>
): Promise<T> {
  const lock = await lockManager.acquireLock({
    key,
    ttl: options?.ttl ?? 60000,
    ...options,
  });

  try {
    const result = await fn();
    await lockManager.releaseLock(lock.id);
    return result;
  } catch (err) {
    await lockManager.releaseLock(lock.id);
    throw err;
  }
}

// Backward compatibility exports
export type { LockOptions, Lock, LockMetadata };
export { DistributedLockManager as DistributedLock };
