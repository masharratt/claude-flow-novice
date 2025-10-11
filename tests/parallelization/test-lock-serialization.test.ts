/**
 * Test Lock Serialization Tests
 *
 * Validates that test execution locks prevent concurrent test runs across
 * parallel sprint coordinators, eliminating port conflicts and resource contention.
 *
 * Requirements (from ASSUMPTIONS_AND_TESTING.md):
 * 1. Prevent concurrent test execution across 10 sprints
 * 2. Verify no overlap in execution windows
 * 3. Test port conflict prevention (port 3000)
 * 4. Expected: 0 port conflicts across all parallel executions
 *
 * @module tests/parallelization/test-lock-serialization
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { createServer, Server } from 'http';

// ===== TYPE DEFINITIONS =====

/**
 * Test lock coordinator for Redis-based test serialization
 */
interface TestLockConfig {
  redis: Redis;
  lockTTL?: number; // Lock expiration in seconds (default: 900 = 15min)
  acquireTimeout?: number; // Max time to wait for lock in ms (default: 600000 = 10min)
  pollInterval?: number; // How often to check for lock availability (default: 500ms)
}

/**
 * Execution window tracking for overlap detection
 */
interface ExecutionWindow {
  sprintId: string;
  startTime: number;
  endTime: number;
}

// ===== TEST LOCK COORDINATOR =====

/**
 * Manages Redis-based test execution locks to prevent concurrent test runs
 * across parallel sprint coordinators.
 *
 * Key features:
 * - Distributed locking via Redis
 * - Automatic lock expiration (stale lock prevention)
 * - Fair queuing (FIFO via timestamps)
 * - Deadlock prevention via timeout
 */
class TestLockCoordinator {
  private redis: Redis;
  private lockTTL: number;
  private acquireTimeout: number;
  private pollInterval: number;
  private readonly lockKey = 'test:execution:lock';
  private readonly queueKeyPrefix = 'test:queue:';

  constructor(config: TestLockConfig) {
    this.redis = config.redis;
    this.lockTTL = config.lockTTL ?? 900; // 15 minutes default
    this.acquireTimeout = config.acquireTimeout ?? 600000; // 10 minutes default
    this.pollInterval = config.pollInterval ?? 500; // 500ms default
  }

  /**
   * Wait for test execution slot with timeout
   *
   * @param sprintId - Unique sprint identifier
   * @param timeoutMs - Maximum time to wait (default: 600000 = 10min)
   * @returns True if lock acquired, false if timeout
   */
  async waitForTestSlot(sprintId: string, timeoutMs?: number): Promise<boolean> {
    const timeout = timeoutMs ?? this.acquireTimeout;
    const startTime = Date.now();
    const queueKey = `${this.queueKeyPrefix}${sprintId}`;

    // Register in queue with timestamp (for FIFO ordering)
    await this.redis.zadd('test:queue:all', Date.now(), sprintId);
    await this.redis.set(queueKey, Date.now().toString(), 'EX', 3600);

    // Poll for lock acquisition
    while (Date.now() - startTime < timeout) {
      // Try to acquire lock (SET NX with expiration)
      const acquired = await this.redis.set(
        this.lockKey,
        sprintId,
        'EX',
        this.lockTTL,
        'NX'
      );

      if (acquired === 'OK') {
        // Lock acquired successfully
        await this.redis.set(`test:lock:holder`, sprintId, 'EX', this.lockTTL);
        await this.redis.set(`test:lock:acquired:${sprintId}`, Date.now().toString(), 'EX', 3600);
        return true;
      }

      // Check if we're next in queue (fair scheduling)
      const queuePosition = await this.getQueuePosition(sprintId);
      if (queuePosition === 0) {
        // We're next - keep polling aggressively
        await this.sleep(100); // 100ms for next in line
      } else {
        // Not our turn yet - poll less frequently
        await this.sleep(this.pollInterval);
      }
    }

    // Timeout - remove from queue
    await this.redis.zrem('test:queue:all', sprintId);
    await this.redis.del(queueKey);

    return false;
  }

  /**
   * Release test execution lock
   *
   * @param sprintId - Sprint that holds the lock
   */
  async releaseTestLock(sprintId: string): Promise<void> {
    // Verify we hold the lock before releasing (prevent accidental release)
    const holder = await this.redis.get(this.lockKey);

    if (holder === sprintId) {
      // Release lock
      await this.redis.del(this.lockKey);
      await this.redis.del(`test:lock:holder`);
      await this.redis.set(`test:lock:released:${sprintId}`, Date.now().toString(), 'EX', 3600);
    }

    // Remove from queue
    await this.redis.zrem('test:queue:all', sprintId);
    await this.redis.del(`${this.queueKeyPrefix}${sprintId}`);
  }

  /**
   * Get position in queue (0 = first in line)
   */
  private async getQueuePosition(sprintId: string): Promise<number> {
    const rank = await this.redis.zrank('test:queue:all', sprintId);
    return rank ?? -1;
  }

  /**
   * Sleep utility for polling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if lock is currently held
   */
  async isLockHeld(): Promise<boolean> {
    const exists = await this.redis.exists(this.lockKey);
    return exists === 1;
  }

  /**
   * Get current lock holder
   */
  async getLockHolder(): Promise<string | null> {
    return await this.redis.get(this.lockKey);
  }

  /**
   * Force release lock (emergency cleanup)
   */
  async forceReleaseLock(): Promise<void> {
    await this.redis.del(this.lockKey);
    await this.redis.del(`test:lock:holder`);
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Start HTTP server on specified port
 */
function startTestServer(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      res.writeHead(200);
      res.end('Test server running');
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      reject(error);
    });

    server.listen(port, () => {
      resolve(server);
    });
  });
}

/**
 * Close HTTP server
 */
function closeTestServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Simulate test execution
 */
async function runTests(sprintId: string): Promise<void> {
  // Simulate test execution time (500ms)
  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== TEST SUITE =====

describe('Test Lock Serialization', () => {
  let redis: Redis;
  let testLock: TestLockCoordinator;

  beforeEach(async () => {
    // Connect to Redis (test database 15)
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 15, // Use test database
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    // Wait for connection
    await redis.ping();

    // Initialize test lock coordinator
    testLock = new TestLockCoordinator({
      redis,
      lockTTL: 900, // 15 minutes
      acquireTimeout: 600000, // 10 minutes
      pollInterval: 100, // 100ms for faster tests
    });

    // Clean up any existing locks
    await testLock.forceReleaseLock();
    await redis.del('test:queue:all');
    await redis.del('test:lock:holder');

    // Clean up test keys from previous runs
    const testKeys = await redis.keys('test:*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
    }
  });

  afterEach(async () => {
    // Clean up
    await testLock.forceReleaseLock();
    await redis.del('test:queue:all');

    // Clean up all test keys
    const testKeys = await redis.keys('test:*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
    }

    await redis.quit();
  });

  describe('Concurrency Prevention', () => {
    it('should prevent concurrent test execution across 10 sprints', async () => {
      const sprints = Array.from({ length: 10 }, (_, i) => `sprint-${i}`);
      const executionLog: string[] = [];

      // Launch all sprints in parallel
      const results = await Promise.all(
        sprints.map(async (sprintId) => {
          const acquired = await testLock.waitForTestSlot(sprintId, 60000); // 60s timeout for test speed

          if (acquired) {
            try {
              // Log start time
              const startTime = Date.now();
              executionLog.push(`${sprintId}:start:${startTime}`);

              // Simulate test execution (2 seconds per sprint)
              await sleep(2000);

              // Log end time
              const endTime = Date.now();
              executionLog.push(`${sprintId}:end:${endTime}`);

              return { sprintId, success: true };
            } finally {
              await testLock.releaseTestLock(sprintId);
            }
          }

          return { sprintId, success: false };
        })
      );

      // Verify all sprints completed
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBe(10);
      expect(executionLog.length).toBe(20); // 10 starts + 10 ends

      // Parse execution windows
      const startTimes = new Map<string, number>();
      const endTimes = new Map<string, number>();

      for (const entry of executionLog) {
        const [sprintId, event, timestamp] = entry.split(':');

        if (event === 'start') {
          startTimes.set(sprintId, parseInt(timestamp));
        } else {
          endTimes.set(sprintId, parseInt(timestamp));
        }
      }

      // Verify no overlaps in execution windows
      let overlapCount = 0;

      for (const [sprint1, start1] of startTimes.entries()) {
        const end1 = endTimes.get(sprint1);
        if (!end1) continue;

        for (const [sprint2, start2] of startTimes.entries()) {
          if (sprint1 === sprint2) continue;

          const end2 = endTimes.get(sprint2);
          if (!end2) continue;

          // Check if execution windows overlap
          // Overlap occurs if: start1 < end2 AND start2 < end1
          const overlaps = (start1 < end2) && (start2 < end1);

          if (overlaps) {
            overlapCount++;
            console.error(`Overlap detected between ${sprint1} and ${sprint2}:`);
            console.error(`  ${sprint1}: ${start1} - ${end1} (${end1 - start1}ms)`);
            console.error(`  ${sprint2}: ${start2} - ${end2} (${end2 - start2}ms)`);
          }
        }
      }

      // CRITICAL: No overlaps should occur
      expect(overlapCount).toBe(0);
    }, 180000); // 3 minute timeout for 10 sprints @ 2s each + overhead

    it('should verify no overlap in execution windows', async () => {
      const sprints = ['sprint-a', 'sprint-b', 'sprint-c'];
      const windows: ExecutionWindow[] = [];

      // Execute sprints sequentially due to lock
      await Promise.all(
        sprints.map(async (sprintId) => {
          const acquired = await testLock.waitForTestSlot(sprintId, 30000);

          if (acquired) {
            try {
              const startTime = Date.now();
              await sleep(1000); // 1 second execution
              const endTime = Date.now();

              windows.push({ sprintId, startTime, endTime });
            } finally {
              await testLock.releaseTestLock(sprintId);
            }
          }
        })
      );

      // Verify all windows are non-overlapping
      for (let i = 0; i < windows.length; i++) {
        for (let j = i + 1; j < windows.length; j++) {
          const w1 = windows[i];
          const w2 = windows[j];

          // Check for overlap
          const overlaps = (w1.startTime < w2.endTime) && (w2.startTime < w1.endTime);

          expect(overlaps).toBe(false);
        }
      }
    }, 120000); // 2 minute timeout
  });

  describe('Port Conflict Prevention', () => {
    it('should never encounter port conflicts on port 3000', async () => {
      const sprints = ['sprint-1', 'sprint-2', 'sprint-3'];
      const portConflicts: string[] = [];
      const servers: Server[] = [];

      await Promise.all(
        sprints.map(async (sprintId) => {
          try {
            const acquired = await testLock.waitForTestSlot(sprintId, 30000);

            if (acquired) {
              try {
                // Start test server on port 3000
                const server = await startTestServer(3000);
                servers.push(server);

                // Run tests
                await runTests(sprintId);

                // Close server
                await closeTestServer(server);
              } finally {
                await testLock.releaseTestLock(sprintId);
              }
            }
          } catch (error: unknown) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code === 'EADDRINUSE') {
              portConflicts.push(sprintId);
              console.error(`Port conflict detected for ${sprintId}`);
            } else {
              throw error;
            }
          }
        })
      );

      // Clean up any remaining servers
      for (const server of servers) {
        try {
          await closeTestServer(server);
        } catch (error) {
          // Ignore cleanup errors
        }
      }

      // CRITICAL: No port conflicts should occur
      expect(portConflicts.length).toBe(0);
    }, 120000); // 2 minute timeout
  });

  describe('Lock Management', () => {
    it('should acquire and release lock correctly', async () => {
      const sprintId = 'sprint-test';

      // Initially no lock held
      let isHeld = await testLock.isLockHeld();
      expect(isHeld).toBe(false);

      // Acquire lock
      const acquired = await testLock.waitForTestSlot(sprintId, 5000);
      expect(acquired).toBe(true);

      // Lock should be held
      isHeld = await testLock.isLockHeld();
      expect(isHeld).toBe(true);

      const holder = await testLock.getLockHolder();
      expect(holder).toBe(sprintId);

      // Release lock
      await testLock.releaseTestLock(sprintId);

      // Lock should be released
      isHeld = await testLock.isLockHeld();
      expect(isHeld).toBe(false);
    });

    it('should timeout if lock not available within limit', async () => {
      const sprint1 = 'sprint-hold';
      const sprint2 = 'sprint-wait';

      // Sprint 1 acquires lock
      const acquired1 = await testLock.waitForTestSlot(sprint1, 5000);
      expect(acquired1).toBe(true);

      // Sprint 2 tries to acquire with short timeout (should fail)
      const acquired2 = await testLock.waitForTestSlot(sprint2, 1000); // 1 second timeout
      expect(acquired2).toBe(false);

      // Release sprint 1 lock
      await testLock.releaseTestLock(sprint1);

      // Now sprint 2 should succeed
      const acquired3 = await testLock.waitForTestSlot(sprint2, 5000);
      expect(acquired3).toBe(true);

      await testLock.releaseTestLock(sprint2);
    });

    it('should handle lock expiration (stale lock protection)', async () => {
      // Create coordinator with short TTL
      const shortTTLLock = new TestLockCoordinator({
        redis,
        lockTTL: 2, // 2 seconds
        acquireTimeout: 10000,
        pollInterval: 100,
      });

      const sprint1 = 'sprint-expire';
      const sprint2 = 'sprint-acquire';

      // Sprint 1 acquires lock
      const acquired1 = await shortTTLLock.waitForTestSlot(sprint1, 5000);
      expect(acquired1).toBe(true);

      // Wait for lock to expire (3 seconds to be safe)
      await sleep(3000);

      // Sprint 2 should be able to acquire (lock expired)
      const acquired2 = await shortTTLLock.waitForTestSlot(sprint2, 5000);
      expect(acquired2).toBe(true);

      await shortTTLLock.releaseTestLock(sprint2);
    }, 15000); // 15 second timeout for expiration test
  });

  describe('Queue Fairness', () => {
    it('should process sprints in FIFO order', async () => {
      const sprints = ['sprint-first', 'sprint-second', 'sprint-third'];
      const executionOrder: string[] = [];

      // Launch all sprints simultaneously
      await Promise.all(
        sprints.map(async (sprintId, index) => {
          // Stagger launches slightly to ensure queue order
          await sleep(index * 50);

          const acquired = await testLock.waitForTestSlot(sprintId, 30000);

          if (acquired) {
            try {
              executionOrder.push(sprintId);
              await sleep(500); // Short execution time
            } finally {
              await testLock.releaseTestLock(sprintId);
            }
          }
        })
      );

      // Verify execution order matches launch order
      expect(executionOrder).toEqual(sprints);
    }, 60000); // 1 minute timeout
  });
});
