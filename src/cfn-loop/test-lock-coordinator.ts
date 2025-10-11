/**
 * Test Lock Coordinator
 *
 * Sprint 2.1: Global test execution lock to prevent resource conflicts across parallel sprints
 *
 * Features:
 * - Global test execution lock using Redis
 * - FIFO queue management for waiting coordinators
 * - Timeout and force release for stale locks (15min)
 * - Prometheus metrics for test slot contention
 * - Automatic cleanup on process exit
 */

import { createClient, RedisClientType } from 'redis';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

/**
 * Test lock status
 */
export enum TestLockStatus {
  AVAILABLE = 'available',
  LOCKED = 'locked',
  QUEUED = 'queued',
  TIMEOUT = 'timeout',
  FORCE_RELEASED = 'force_released'
}

/**
 * Test lock configuration
 */
export interface TestLockConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    database?: number;
  };
  lock: {
    timeout: number;           // Lock timeout in ms (default: 900000 = 15min)
    pollInterval: number;      // Queue poll interval in ms (default: 1000)
    maxQueueWait: number;      // Max queue wait time in ms (default: 1800000 = 30min)
    forceReleaseEnabled: boolean; // Enable force release (default: true)
  };
  monitoring: {
    enabled: boolean;
    metricsPrefix: string;     // Prometheus metrics prefix
  };
}

/**
 * Test lock metadata
 */
export interface TestLockMetadata {
  coordinatorId: string;
  sprintId: string;
  phaseId: string;
  acquiredAt: number;
  expiresAt: number;
  hostname: string;
  pid: number;
}

/**
 * Queue entry
 */
export interface QueueEntry {
  coordinatorId: string;
  sprintId: string;
  phaseId: string;
  enqueuedAt: number;
  priority: number;
}

/**
 * Lock metrics
 */
export interface TestLockMetrics {
  totalAcquires: number;
  totalReleases: number;
  totalTimeouts: number;
  totalForceReleases: number;
  currentQueueLength: number;
  averageWaitTime: number;
  averageHoldTime: number;
  maxWaitTime: number;
  maxHoldTime: number;
  contentionRate: number;      // Percentage of time lock is contested
}

/**
 * Test Lock Coordinator
 *
 * Provides global test execution lock with FIFO queue and timeout management
 */
export class TestLockCoordinator extends EventEmitter {
  private config: TestLockConfig;
  private client: RedisClientType | null = null;
  private coordinatorId: string;
  private sprintId: string;
  private phaseId: string;
  private isConnected = false;
  private isLockHeld = false;
  private lockAcquiredAt = 0;
  private queuePollInterval: NodeJS.Timeout | null = null;
  private metrics: TestLockMetrics;

  // Redis keys
  private readonly LOCK_KEY = 'cfn:test:lock';
  private readonly QUEUE_KEY = 'cfn:test:queue';
  private readonly METRICS_KEY = 'cfn:test:metrics';

  // Default configuration
  private static readonly DEFAULT_CONFIG: Partial<TestLockConfig> = {
    lock: {
      timeout: 900000,        // 15 minutes
      pollInterval: 1000,     // 1 second
      maxQueueWait: 1800000,  // 30 minutes
      forceReleaseEnabled: true
    },
    monitoring: {
      enabled: true,
      metricsPrefix: 'cfn_test_lock'
    }
  };

  constructor(
    coordinatorId: string,
    sprintId: string,
    phaseId: string,
    config: Partial<TestLockConfig>
  ) {
    super();

    this.coordinatorId = coordinatorId;
    this.sprintId = sprintId;
    this.phaseId = phaseId;

    this.config = {
      redis: config.redis!,
      lock: { ...TestLockCoordinator.DEFAULT_CONFIG.lock!, ...config.lock },
      monitoring: { ...TestLockCoordinator.DEFAULT_CONFIG.monitoring!, ...config.monitoring }
    };

    this.initializeMetrics();
    this.setupExitHandlers();
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): void {
    this.metrics = {
      totalAcquires: 0,
      totalReleases: 0,
      totalTimeouts: 0,
      totalForceReleases: 0,
      currentQueueLength: 0,
      averageWaitTime: 0,
      averageHoldTime: 0,
      maxWaitTime: 0,
      maxHoldTime: 0,
      contentionRate: 0
    };
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      this.client = createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port,
          connectTimeout: 10000
        },
        password: this.config.redis.password,
        database: this.config.redis.database || 0
      });

      await this.client.connect();
      this.isConnected = true;

      this.emit('connected', {
        coordinatorId: this.coordinatorId,
        timestamp: Date.now()
      });

      console.log(`✅ Test Lock Coordinator ${this.coordinatorId}: Connected to Redis`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Redis connection failed: ${errorMessage}`);
    }
  }

  /**
   * Acquire test lock with FIFO queue support
   */
  async acquireLock(): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('Not connected to Redis');
    }

    const startTime = Date.now();

    try {
      // Try to acquire lock immediately
      const acquired = await this.tryAcquireLock();

      if (acquired) {
        const waitTime = Date.now() - startTime;
        this.updateWaitTimeMetrics(waitTime);
        return true;
      }

      // Lock is held, join queue
      await this.joinQueue();

      // Poll queue until lock is acquired or timeout
      return await this.waitInQueue(startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', {
        coordinatorId: this.coordinatorId,
        error: errorMessage,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Try to acquire lock (non-blocking)
   */
  private async tryAcquireLock(): Promise<boolean> {
    if (!this.client) return false;

    const now = Date.now();
    const expiresAt = now + this.config.lock.timeout;

    const metadata: TestLockMetadata = {
      coordinatorId: this.coordinatorId,
      sprintId: this.sprintId,
      phaseId: this.phaseId,
      acquiredAt: now,
      expiresAt,
      hostname: require('os').hostname(),
      pid: process.pid
    };

    // Try to set lock with NX (only if not exists)
    const result = await this.client.set(
      this.LOCK_KEY,
      JSON.stringify(metadata),
      {
        NX: true,
        PX: this.config.lock.timeout
      }
    );

    if (result === 'OK') {
      this.isLockHeld = true;
      this.lockAcquiredAt = now;
      this.metrics.totalAcquires++;

      this.emit('lock:acquired', {
        coordinatorId: this.coordinatorId,
        sprintId: this.sprintId,
        phaseId: this.phaseId,
        timestamp: now
      });

      console.log(`🔒 Test Lock ACQUIRED by ${this.coordinatorId} (Sprint: ${this.sprintId}, Phase: ${this.phaseId})`);
      return true;
    }

    // Check if lock is expired (stale lock detection)
    if (this.config.lock.forceReleaseEnabled) {
      const lockData = await this.client.get(this.LOCK_KEY);
      if (lockData) {
        const lock: TestLockMetadata = JSON.parse(lockData);
        if (now > lock.expiresAt) {
          // Force release expired lock
          await this.forceReleaseLock(lock);
          // Retry acquire
          return await this.tryAcquireLock();
        }
      }
    }

    return false;
  }

  /**
   * Join the waiting queue
   */
  private async joinQueue(): Promise<void> {
    if (!this.client) return;

    const entry: QueueEntry = {
      coordinatorId: this.coordinatorId,
      sprintId: this.sprintId,
      phaseId: this.phaseId,
      enqueuedAt: Date.now(),
      priority: 0 // FIFO, all same priority
    };

    // Add to sorted set (FIFO queue using timestamp as score)
    await this.client.zAdd(this.QUEUE_KEY, {
      score: entry.enqueuedAt,
      value: JSON.stringify(entry)
    });

    const queueLength = await this.client.zCard(this.QUEUE_KEY);
    this.metrics.currentQueueLength = queueLength;

    this.emit('queue:joined', {
      coordinatorId: this.coordinatorId,
      position: queueLength,
      timestamp: Date.now()
    });

    console.log(`⏳ Test Lock QUEUED: ${this.coordinatorId} (Position: ${queueLength})`);
  }

  /**
   * Wait in queue until lock is acquired
   */
  private async waitInQueue(startTime: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.queuePollInterval = setInterval(async () => {
        try {
          const elapsed = Date.now() - startTime;

          // Check for queue timeout
          if (elapsed > this.config.lock.maxQueueWait) {
            this.metrics.totalTimeouts++;
            this.emit('queue:timeout', {
              coordinatorId: this.coordinatorId,
              waitTime: elapsed,
              timestamp: Date.now()
            });
            this.cleanup();
            reject(new Error(`Queue wait timeout after ${elapsed}ms`));
            return;
          }

          // Check if we're first in queue
          const firstInQueue = await this.isFirstInQueue();
          if (!firstInQueue) {
            return; // Keep waiting
          }

          // Try to acquire lock
          const acquired = await this.tryAcquireLock();

          if (acquired) {
            // Remove from queue
            await this.removeFromQueue();
            const waitTime = Date.now() - startTime;
            this.updateWaitTimeMetrics(waitTime);
            this.cleanup();
            resolve(true);
          }

        } catch (error) {
          this.cleanup();
          reject(error);
        }
      }, this.config.lock.pollInterval);
    });
  }

  /**
   * Check if this coordinator is first in queue
   */
  private async isFirstInQueue(): Promise<boolean> {
    if (!this.client) return false;

    // Get first entry in queue (lowest score)
    const entries = await this.client.zRange(this.QUEUE_KEY, 0, 0);

    if (entries.length === 0) return false;

    const firstEntry: QueueEntry = JSON.parse(entries[0]);
    return firstEntry.coordinatorId === this.coordinatorId;
  }

  /**
   * Remove this coordinator from queue
   */
  private async removeFromQueue(): Promise<void> {
    if (!this.client) return;

    // Find and remove our entry
    const allEntries = await this.client.zRange(this.QUEUE_KEY, 0, -1);

    for (const entryStr of allEntries) {
      const entry: QueueEntry = JSON.parse(entryStr);
      if (entry.coordinatorId === this.coordinatorId) {
        await this.client.zRem(this.QUEUE_KEY, entryStr);
        break;
      }
    }

    this.emit('queue:removed', {
      coordinatorId: this.coordinatorId,
      timestamp: Date.now()
    });
  }

  /**
   * Release test lock
   */
  async releaseLock(): Promise<void> {
    if (!this.client || !this.isLockHeld) {
      return;
    }

    try {
      // Verify we still hold the lock
      const lockData = await this.client.get(this.LOCK_KEY);
      if (lockData) {
        const lock: TestLockMetadata = JSON.parse(lockData);
        if (lock.coordinatorId !== this.coordinatorId) {
          console.warn(`⚠️ Lock held by different coordinator: ${lock.coordinatorId}`);
          return;
        }
      }

      // Release lock
      await this.client.del(this.LOCK_KEY);

      const holdTime = Date.now() - this.lockAcquiredAt;
      this.updateHoldTimeMetrics(holdTime);

      this.isLockHeld = false;
      this.metrics.totalReleases++;

      this.emit('lock:released', {
        coordinatorId: this.coordinatorId,
        holdTime,
        timestamp: Date.now()
      });

      console.log(`🔓 Test Lock RELEASED by ${this.coordinatorId} (Hold time: ${holdTime}ms)`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', {
        coordinatorId: this.coordinatorId,
        error: errorMessage,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Force release expired lock
   */
  private async forceReleaseLock(lock: TestLockMetadata): Promise<void> {
    if (!this.client) return;

    await this.client.del(this.LOCK_KEY);
    this.metrics.totalForceReleases++;

    this.emit('lock:force_released', {
      coordinatorId: lock.coordinatorId,
      sprintId: lock.sprintId,
      expiredAt: lock.expiresAt,
      timestamp: Date.now()
    });

    console.log(`⚠️ Test Lock FORCE RELEASED (expired lock held by ${lock.coordinatorId})`);
  }

  /**
   * Get current lock status
   */
  async getLockStatus(): Promise<{ status: TestLockStatus; metadata?: TestLockMetadata; queueLength: number }> {
    if (!this.client || !this.isConnected) {
      throw new Error('Not connected to Redis');
    }

    const lockData = await this.client.get(this.LOCK_KEY);
    const queueLength = await this.client.zCard(this.QUEUE_KEY);

    if (!lockData) {
      return {
        status: TestLockStatus.AVAILABLE,
        queueLength
      };
    }

    const metadata: TestLockMetadata = JSON.parse(lockData);

    // Check if expired
    if (Date.now() > metadata.expiresAt) {
      return {
        status: TestLockStatus.TIMEOUT,
        metadata,
        queueLength
      };
    }

    return {
      status: TestLockStatus.LOCKED,
      metadata,
      queueLength
    };
  }

  /**
   * Get current metrics
   */
  getMetrics(): TestLockMetrics {
    return { ...this.metrics };
  }

  /**
   * Update wait time metrics
   */
  private updateWaitTimeMetrics(waitTime: number): void {
    const alpha = 0.2; // Smoothing factor
    if (this.metrics.averageWaitTime === 0) {
      this.metrics.averageWaitTime = waitTime;
    } else {
      this.metrics.averageWaitTime = (alpha * waitTime) + ((1 - alpha) * this.metrics.averageWaitTime);
    }

    if (waitTime > this.metrics.maxWaitTime) {
      this.metrics.maxWaitTime = waitTime;
    }
  }

  /**
   * Update hold time metrics
   */
  private updateHoldTimeMetrics(holdTime: number): void {
    const alpha = 0.2; // Smoothing factor
    if (this.metrics.averageHoldTime === 0) {
      this.metrics.averageHoldTime = holdTime;
    } else {
      this.metrics.averageHoldTime = (alpha * holdTime) + ((1 - alpha) * this.metrics.averageHoldTime);
    }

    if (holdTime > this.metrics.maxHoldTime) {
      this.metrics.maxHoldTime = holdTime;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.queuePollInterval) {
      clearInterval(this.queuePollInterval);
      this.queuePollInterval = null;
    }
  }

  /**
   * Setup exit handlers for automatic cleanup
   */
  private setupExitHandlers(): void {
    const cleanup = async () => {
      if (this.isLockHeld) {
        console.log('🧹 Releasing lock on process exit...');
        await this.releaseLock();
      }
      await this.disconnect();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    this.cleanup();

    if (this.client) {
      try {
        if (this.isLockHeld) {
          await this.releaseLock();
        }
        await this.client.quit();
      } catch (error) {
        console.warn('Warning during disconnect:', error);
      }
      this.client = null;
    }

    this.isConnected = false;

    this.emit('disconnected', {
      coordinatorId: this.coordinatorId,
      timestamp: Date.now()
    });

    console.log(`✅ Test Lock Coordinator ${this.coordinatorId}: Disconnected`);
  }
}

export default TestLockCoordinator;
