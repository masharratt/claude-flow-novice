/**
 * Lock Health Monitor
 *
 * Monitors distributed locks for health issues, detects deadlocks,
 * and performs automatic cleanup of stale locks.
 *
 * Features:
 * - Deadlock detection (locks held >5x TTL)
 * - Stale lock cleanup
 * - Lock usage statistics
 * - Contention hotspot detection
 * - Background cleanup task
 * - Incident logging
 *
 * Part of Phase 2, Task P2-2.2: Distributed Locking Enhancement
 */

import { createLogger } from './logging.js';
import { DistributedLockManager, LockMetadata } from './distributed-lock.js';

const logger = createLogger('lock-health-monitor');

/**
 * Deadlock information
 */
export interface Deadlock {
  /** Lock key */
  lockKey: string;
  /** Lock metadata */
  metadata: LockMetadata;
  /** Duration lock has been held (ms) */
  heldDuration: number;
  /** Detection timestamp */
  detectedAt: Date;
  /** Deadlock type */
  type: 'stuck' | 'circular';
}

/**
 * Deadlock incident (resolved)
 */
export interface DeadlockIncident {
  /** Lock key */
  lockKey: string;
  /** Detection timestamp */
  detectedAt: Date;
  /** Resolution timestamp */
  resolvedAt: Date;
  /** Resolution method */
  resolutionMethod: 'force-release' | 'timeout';
  /** Lock metadata at detection */
  metadata: LockMetadata;
}

/**
 * Cleanup statistics
 */
export interface CleanupStats {
  /** Total locks cleaned */
  totalCleaned: number;
  /** Last cleanup time */
  lastCleanupAt?: Date;
  /** Cleanup runs */
  cleanupRuns: number;
}

/**
 * Lock usage by resource
 */
export interface LockUsage {
  [resource: string]: number;
}

/**
 * Contention hotspot
 */
export interface ContentionHotspot {
  /** Resource key */
  resource: string;
  /** Failed acquisition attempts */
  failedAttempts: number;
  /** Last failure time */
  lastFailureAt: Date;
}

/**
 * Lock Health Monitor
 */
export class LockHealthMonitor {
  private redisClient: any;
  private lockManager: DistributedLockManager;
  private deadlockIncidents: DeadlockIncident[] = [];
  private cleanupStats: CleanupStats = {
    totalCleaned: 0,
    cleanupRuns: 0,
  };
  private lockUsage: Map<string, number> = new Map();
  private contentionFailures: Map<string, ContentionHotspot> = new Map();
  private backgroundCleanupTimer?: NodeJS.Timeout;

  constructor(redisClient: any, lockManager: DistributedLockManager) {
    this.redisClient = redisClient;
    this.lockManager = lockManager;
    logger.info('Lock health monitor initialized');
  }

  /**
   * Detect deadlocks in the system
   */
  async detectDeadlocks(): Promise<Deadlock[]> {
    const deadlocks: Deadlock[] = [];

    try {
      // Get all lock keys from Redis
      const lockKeys = await this.redisClient.keys('lock:*');

      for (const lockKey of lockKeys) {
        const data = await this.redisClient.get(lockKey);
        if (!data) continue;

        const metadata: LockMetadata = JSON.parse(data);
        const acquiredAt = new Date(metadata.acquiredAt).getTime();
        const expiresAt = new Date(metadata.expiresAt).getTime();
        const now = Date.now();

        const ttl = expiresAt - acquiredAt;
        const heldDuration = now - acquiredAt;

        // Detect stuck locks (held for >5x TTL)
        if (heldDuration > ttl * 5) {
          deadlocks.push({
            lockKey,
            metadata,
            heldDuration,
            detectedAt: new Date(),
            type: 'stuck',
          });

          logger.warn('Deadlock detected: stuck lock', {
            lockKey,
            heldDuration,
            ttl,
            lockId: metadata.lockId,
          });
        }
      }

      // TODO: Advanced feature - detect circular wait deadlocks
      // This would require tracking lock wait queues and building dependency graphs

      return deadlocks;
    } catch (err) {
      logger.error('Error detecting deadlocks', err as Error);
      return deadlocks;
    }
  }

  /**
   * Resolve a deadlock by force-releasing the lock
   */
  async resolveDeadlock(deadlock: Deadlock): Promise<void> {
    try {
      logger.warn('Resolving deadlock', {
        lockKey: deadlock.lockKey,
        type: deadlock.type,
        heldDuration: deadlock.heldDuration,
      });

      // Extract resource key from lock key (remove 'lock:' prefix)
      const resourceKey = deadlock.lockKey.replace(/^lock:/, '');

      // Force release the lock
      await this.lockManager.forceRelease(resourceKey);

      // Log incident
      const incident: DeadlockIncident = {
        lockKey: deadlock.lockKey,
        detectedAt: deadlock.detectedAt,
        resolvedAt: new Date(),
        resolutionMethod: 'force-release',
        metadata: deadlock.metadata,
      };

      this.deadlockIncidents.push(incident);

      // Keep only last 100 incidents
      if (this.deadlockIncidents.length > 100) {
        this.deadlockIncidents.shift();
      }

      logger.info('Deadlock resolved', {
        lockKey: deadlock.lockKey,
        resolutionMethod: incident.resolutionMethod,
      });
    } catch (err) {
      logger.error('Error resolving deadlock', err as Error, {
        lockKey: deadlock.lockKey,
      });
      throw err;
    }
  }

  /**
   * Get deadlock incident history
   */
  getDeadlockIncidents(): DeadlockIncident[] {
    return [...this.deadlockIncidents];
  }

  /**
   * Find stale locks (expired TTL but still in Redis)
   */
  async findStaleLocks(): Promise<string[]> {
    const staleLocks: string[] = [];

    try {
      const lockKeys = await this.redisClient.keys('lock:*');

      for (const lockKey of lockKeys) {
        const ttl = await this.redisClient.pttl(lockKey);

        // TTL < 0 means expired or no expiry set
        if (ttl === -2) {
          // Key doesn't exist (race condition)
          continue;
        }

        if (ttl === -1) {
          // No expiry set - this is a stale lock!
          staleLocks.push(lockKey);
          logger.warn('Stale lock detected (no TTL)', { lockKey });
        }

        // Also check metadata expiration
        const data = await this.redisClient.get(lockKey);
        if (data) {
          const metadata: LockMetadata = JSON.parse(data);
          const expiresAt = new Date(metadata.expiresAt).getTime();

          if (Date.now() > expiresAt) {
            staleLocks.push(lockKey);
            logger.warn('Stale lock detected (expired metadata)', {
              lockKey,
              expiresAt: metadata.expiresAt,
            });
          }
        }
      }

      return staleLocks;
    } catch (err) {
      logger.error('Error finding stale locks', err as Error);
      return staleLocks;
    }
  }

  /**
   * Cleanup stale locks
   */
  async cleanupStaleLocks(): Promise<number> {
    let cleaned = 0;

    try {
      const staleLocks = await this.findStaleLocks();

      for (const lockKey of staleLocks) {
        try {
          await this.redisClient.del(lockKey);
          cleaned++;

          logger.info('Stale lock cleaned', { lockKey });
        } catch (err) {
          logger.error('Error cleaning stale lock', err as Error, { lockKey });
        }
      }

      // Update cleanup stats
      this.cleanupStats.totalCleaned += cleaned;
      this.cleanupStats.lastCleanupAt = new Date();
      this.cleanupStats.cleanupRuns++;

      if (cleaned > 0) {
        logger.info('Stale lock cleanup complete', {
          cleaned,
          totalCleaned: this.cleanupStats.totalCleaned,
        });
      }

      return cleaned;
    } catch (err) {
      logger.error('Error during stale lock cleanup', err as Error);
      return cleaned;
    }
  }

  /**
   * Get cleanup statistics
   */
  getCleanupStats(): CleanupStats {
    return { ...this.cleanupStats };
  }

  /**
   * Start background cleanup task
   */
  startBackgroundCleanup(intervalMs: number = 60000): void {
    if (this.backgroundCleanupTimer) {
      logger.warn('Background cleanup already running');
      return;
    }

    logger.info('Starting background cleanup', { intervalMs });

    this.backgroundCleanupTimer = setInterval(async () => {
      try {
        await this.cleanupStaleLocks();
      } catch (err) {
        logger.error('Background cleanup error', err as Error);
      }
    }, intervalMs);
  }

  /**
   * Stop background cleanup task
   */
  stopBackgroundCleanup(): void {
    if (this.backgroundCleanupTimer) {
      clearInterval(this.backgroundCleanupTimer);
      this.backgroundCleanupTimer = undefined;
      logger.info('Background cleanup stopped');
    }
  }

  /**
   * Track lock acquisition for usage statistics
   */
  trackAcquisition(resource: string): void {
    const count = this.lockUsage.get(resource) || 0;
    this.lockUsage.set(resource, count + 1);
  }

  /**
   * Track failed lock acquisition for contention detection
   */
  trackFailedAcquisition(resource: string): void {
    const existing = this.contentionFailures.get(resource);

    if (existing) {
      existing.failedAttempts++;
      existing.lastFailureAt = new Date();
    } else {
      this.contentionFailures.set(resource, {
        resource,
        failedAttempts: 1,
        lastFailureAt: new Date(),
      });
    }
  }

  /**
   * Get lock statistics
   */
  getLockStatistics() {
    return this.lockManager.getStatistics();
  }

  /**
   * Get lock usage by resource
   */
  getLockUsageByResource(): LockUsage {
    const usage: LockUsage = {};

    for (const [resource, count] of this.lockUsage.entries()) {
      usage[resource] = count;
    }

    return usage;
  }

  /**
   * Get contention hotspots (resources with high failure rates)
   */
  getContentionHotspots(): ContentionHotspot[] {
    const hotspots = Array.from(this.contentionFailures.values());

    // Sort by failed attempts (descending)
    hotspots.sort((a, b) => b.failedAttempts - a.failedAttempts);

    return hotspots;
  }

  /**
   * Generate health report
   */
  async generateHealthReport(): Promise<{
    deadlocks: Deadlock[];
    staleLocks: string[];
    statistics: any;
    usage: LockUsage;
    hotspots: ContentionHotspot[];
    cleanupStats: CleanupStats;
  }> {
    const deadlocks = await this.detectDeadlocks();
    const staleLocks = await this.findStaleLocks();
    const statistics = this.getLockStatistics();
    const usage = this.getLockUsageByResource();
    const hotspots = this.getContentionHotspots();
    const cleanupStats = this.getCleanupStats();

    return {
      deadlocks,
      staleLocks,
      statistics,
      usage,
      hotspots,
      cleanupStats,
    };
  }

  /**
   * Shutdown cleanup
   */
  async shutdown(): Promise<void> {
    this.stopBackgroundCleanup();
    logger.info('Lock health monitor shut down');
  }
}
