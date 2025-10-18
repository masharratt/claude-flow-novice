/**
 * Test Lock Coordinator Tests
 *
 * Sprint 2.1: Comprehensive tests for global test lock coordinator
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestLockCoordinator, TestLockStatus } from '../../src/cfn-loop/test-lock-coordinator';

describe('TestLockCoordinator', () => {
  let coordinator1: TestLockCoordinator;
  let coordinator2: TestLockCoordinator;

  const redisConfig = {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    },
    lock: {
      timeout: 5000,      // 5 seconds for testing
      pollInterval: 100,  // 100ms poll
      maxQueueWait: 10000, // 10 seconds max wait
      forceReleaseEnabled: true
    },
    monitoring: {
      enabled: true,
      metricsPrefix: 'test_cfn_lock'
    }
  };

  beforeEach(async () => {
    coordinator1 = new TestLockCoordinator(
      'coordinator-1',
      'sprint-test-1',
      'phase-test-1',
      redisConfig
    );

    coordinator2 = new TestLockCoordinator(
      'coordinator-2',
      'sprint-test-2',
      'phase-test-2',
      redisConfig
    );
  });

  afterEach(async () => {
    await coordinator1.disconnect();
    await coordinator2.disconnect();
  });

  describe('Connection Management', () => {
    it('should connect to Redis successfully', async () => {
      await expect(coordinator1.connect()).resolves.not.toThrow();
      expect(coordinator1['isConnected']).toBe(true);
    });

    it('should disconnect gracefully', async () => {
      await coordinator1.connect();
      await coordinator1.disconnect();
      expect(coordinator1['isConnected']).toBe(false);
    });

    it('should emit connected event on successful connection', async () => {
      const connectListener = vi.fn();
      coordinator1.on('connected', connectListener);

      await coordinator1.connect();

      expect(connectListener).toHaveBeenCalledWith(
        expect.objectContaining({
          coordinatorId: 'coordinator-1',
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('Lock Acquisition', () => {
    beforeEach(async () => {
      await coordinator1.connect();
      await coordinator2.connect();
    });

    it('should acquire lock when available', async () => {
      const acquired = await coordinator1.acquireLock();
      expect(acquired).toBe(true);
      expect(coordinator1['isLockHeld']).toBe(true);

      const metrics = coordinator1.getMetrics();
      expect(metrics.totalAcquires).toBe(1);
    });

    it('should emit lock:acquired event', async () => {
      const acquireListener = vi.fn();
      coordinator1.on('lock:acquired', acquireListener);

      await coordinator1.acquireLock();

      expect(acquireListener).toHaveBeenCalledWith(
        expect.objectContaining({
          coordinatorId: 'coordinator-1',
          sprintId: 'sprint-test-1',
          phaseId: 'phase-test-1',
          timestamp: expect.any(Number)
        })
      );
    });

    it('should queue when lock is held by another coordinator', async () => {
      // Coordinator 1 acquires lock
      await coordinator1.acquireLock();

      // Coordinator 2 should queue
      const queueListener = vi.fn();
      coordinator2.on('queue:joined', queueListener);

      // Start acquire (will queue)
      const acquirePromise = coordinator2.acquireLock();

      // Wait for queue event
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(queueListener).toHaveBeenCalledWith(
        expect.objectContaining({
          coordinatorId: 'coordinator-2',
          position: expect.any(Number)
        })
      );

      // Release lock 1 so test can complete
      await coordinator1.releaseLock();
      await acquirePromise;
    });

    it('should acquire lock after first coordinator releases (FIFO)', async () => {
      // Coordinator 1 acquires lock
      await coordinator1.acquireLock();

      // Coordinator 2 tries to acquire (will queue)
      const acquirePromise = coordinator2.acquireLock();

      // Wait for queue
      await new Promise(resolve => setTimeout(resolve, 200));

      // Release lock 1
      await coordinator1.releaseLock();

      // Coordinator 2 should now acquire
      const acquired = await acquirePromise;
      expect(acquired).toBe(true);
      expect(coordinator2['isLockHeld']).toBe(true);
    });
  });

  describe('Lock Release', () => {
    beforeEach(async () => {
      await coordinator1.connect();
    });

    it('should release lock successfully', async () => {
      await coordinator1.acquireLock();
      await coordinator1.releaseLock();

      expect(coordinator1['isLockHeld']).toBe(false);

      const metrics = coordinator1.getMetrics();
      expect(metrics.totalReleases).toBe(1);
    });

    it('should emit lock:released event', async () => {
      const releaseListener = vi.fn();
      coordinator1.on('lock:released', releaseListener);

      await coordinator1.acquireLock();
      await coordinator1.releaseLock();

      expect(releaseListener).toHaveBeenCalledWith(
        expect.objectContaining({
          coordinatorId: 'coordinator-1',
          holdTime: expect.any(Number),
          timestamp: expect.any(Number)
        })
      );
    });

    it('should not throw if releasing without holding lock', async () => {
      await expect(coordinator1.releaseLock()).resolves.not.toThrow();
    });
  });

  describe('Force Release (Stale Lock)', () => {
    beforeEach(async () => {
      await coordinator1.connect();
      await coordinator2.connect();
    });

    it('should force release expired lock', async () => {
      // Create coordinator with very short timeout
      const shortTimeoutCoordinator = new TestLockCoordinator(
        'coordinator-short',
        'sprint-short',
        'phase-short',
        {
          ...redisConfig,
          lock: {
            ...redisConfig.lock,
            timeout: 100 // 100ms timeout
          }
        }
      );

      await shortTimeoutCoordinator.connect();

      // Acquire lock
      await shortTimeoutCoordinator.acquireLock();

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 150));

      // Coordinator 2 should force release and acquire
      const forceReleaseListener = vi.fn();
      coordinator2.on('lock:force_released', forceReleaseListener);

      const acquired = await coordinator2.acquireLock();

      expect(acquired).toBe(true);
      expect(forceReleaseListener).toHaveBeenCalled();

      await shortTimeoutCoordinator.disconnect();
    });

    it('should track force release metrics', async () => {
      const shortTimeoutCoordinator = new TestLockCoordinator(
        'coordinator-short',
        'sprint-short',
        'phase-short',
        {
          ...redisConfig,
          lock: {
            ...redisConfig.lock,
            timeout: 100
          }
        }
      );

      await shortTimeoutCoordinator.connect();
      await shortTimeoutCoordinator.acquireLock();

      await new Promise(resolve => setTimeout(resolve, 150));

      await coordinator2.acquireLock();

      const metrics = coordinator2.getMetrics();
      expect(metrics.totalForceReleases).toBeGreaterThan(0);

      await shortTimeoutCoordinator.disconnect();
    });
  });

  describe('Lock Status', () => {
    beforeEach(async () => {
      await coordinator1.connect();
    });

    it('should return AVAILABLE when lock is not held', async () => {
      const status = await coordinator1.getLockStatus();
      expect(status.status).toBe(TestLockStatus.AVAILABLE);
      expect(status.queueLength).toBe(0);
    });

    it('should return LOCKED with metadata when lock is held', async () => {
      await coordinator1.acquireLock();

      const status = await coordinator1.getLockStatus();
      expect(status.status).toBe(TestLockStatus.LOCKED);
      expect(status.metadata).toMatchObject({
        coordinatorId: 'coordinator-1',
        sprintId: 'sprint-test-1',
        phaseId: 'phase-test-1'
      });
    });

    it('should return TIMEOUT when lock is expired', async () => {
      const shortTimeoutCoordinator = new TestLockCoordinator(
        'coordinator-short',
        'sprint-short',
        'phase-short',
        {
          ...redisConfig,
          lock: {
            ...redisConfig.lock,
            timeout: 100
          }
        }
      );

      await shortTimeoutCoordinator.connect();
      await shortTimeoutCoordinator.acquireLock();

      await new Promise(resolve => setTimeout(resolve, 150));

      const status = await shortTimeoutCoordinator.getLockStatus();
      expect(status.status).toBe(TestLockStatus.TIMEOUT);

      await shortTimeoutCoordinator.disconnect();
    });
  });

  describe('Metrics Tracking', () => {
    beforeEach(async () => {
      await coordinator1.connect();
      await coordinator2.connect();
    });

    it('should track acquire and release counts', async () => {
      await coordinator1.acquireLock();
      await coordinator1.releaseLock();
      await coordinator1.acquireLock();
      await coordinator1.releaseLock();

      const metrics = coordinator1.getMetrics();
      expect(metrics.totalAcquires).toBe(2);
      expect(metrics.totalReleases).toBe(2);
    });

    it('should track average wait time', async () => {
      await coordinator1.acquireLock();

      const acquirePromise = coordinator2.acquireLock();

      await new Promise(resolve => setTimeout(resolve, 200));
      await coordinator1.releaseLock();
      await acquirePromise;

      const metrics = coordinator2.getMetrics();
      expect(metrics.averageWaitTime).toBeGreaterThan(0);
    });

    it('should track max wait time', async () => {
      await coordinator1.acquireLock();

      const acquirePromise = coordinator2.acquireLock();

      await new Promise(resolve => setTimeout(resolve, 300));
      await coordinator1.releaseLock();
      await acquirePromise;

      const metrics = coordinator2.getMetrics();
      expect(metrics.maxWaitTime).toBeGreaterThanOrEqual(200);
    });

    it('should track hold time', async () => {
      await coordinator1.acquireLock();
      await new Promise(resolve => setTimeout(resolve, 100));
      await coordinator1.releaseLock();

      const metrics = coordinator1.getMetrics();
      expect(metrics.averageHoldTime).toBeGreaterThan(50);
    });
  });

  describe('Queue Management', () => {
    beforeEach(async () => {
      await coordinator1.connect();
      await coordinator2.connect();
    });

    it('should maintain FIFO queue order', async () => {
      const coordinator3 = new TestLockCoordinator(
        'coordinator-3',
        'sprint-test-3',
        'phase-test-3',
        redisConfig
      );
      await coordinator3.connect();

      // Coordinator 1 acquires lock
      await coordinator1.acquireLock();

      // Coordinator 2 and 3 queue
      const acquire2Promise = coordinator2.acquireLock();
      await new Promise(resolve => setTimeout(resolve, 50));

      const acquire3Promise = coordinator3.acquireLock();
      await new Promise(resolve => setTimeout(resolve, 50));

      // Track acquisition order
      const acquisitions: string[] = [];

      coordinator2.on('lock:acquired', () => acquisitions.push('coordinator-2'));
      coordinator3.on('lock:acquired', () => acquisitions.push('coordinator-3'));

      // Release lock 1
      await coordinator1.releaseLock();

      // Wait for coordinator 2 to acquire and release
      await acquire2Promise;
      await coordinator2.releaseLock();

      // Wait for coordinator 3 to acquire
      await acquire3Promise;

      // Verify FIFO order
      expect(acquisitions).toEqual(['coordinator-2', 'coordinator-3']);

      await coordinator3.disconnect();
    });

    it('should handle queue timeout', async () => {
      const timeoutCoordinator = new TestLockCoordinator(
        'coordinator-timeout',
        'sprint-timeout',
        'phase-timeout',
        {
          ...redisConfig,
          lock: {
            ...redisConfig.lock,
            maxQueueWait: 500 // 500ms max wait
          }
        }
      );

      await timeoutCoordinator.connect();

      // Coordinator 1 acquires and holds lock
      await coordinator1.acquireLock();

      // Timeout coordinator tries to acquire (will queue and timeout)
      const timeoutListener = vi.fn();
      timeoutCoordinator.on('queue:timeout', timeoutListener);

      await expect(timeoutCoordinator.acquireLock()).rejects.toThrow(/Queue wait timeout/);

      expect(timeoutListener).toHaveBeenCalled();

      await timeoutCoordinator.disconnect();
      await coordinator1.releaseLock();
    });
  });

  describe('Exit Cleanup', () => {
    it('should release lock on process exit', async () => {
      await coordinator1.connect();
      await coordinator1.acquireLock();

      expect(coordinator1['isLockHeld']).toBe(true);

      // Simulate exit
      await coordinator1.disconnect();

      expect(coordinator1['isLockHeld']).toBe(false);
    });
  });
});
