/**
 * Coordinator Timeout Handler Tests - Sprint 1.4
 *
 * Test Coverage:
 * 1. Timeout detection based on threshold
 * 2. State cleanup on timeout (heartbeat, ACKs, signals, idempotency)
 * 3. Event emission (coordinator:timeout)
 * 4. Metrics tracking (timeout_events_total)
 * 5. Integration with HeartbeatWarningSystem cleanup
 * 6. Activity tracking and monitoring
 *
 * @module cfn-loop/__tests__/coordinator-timeout-handler.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import {
  CoordinatorTimeoutHandler,
  createCoordinatorTimeoutHandler,
  type CoordinatorTimeoutConfig,
  type CoordinatorTimeoutEvent,
} from '../coordinator-timeout-handler.js';
import {
  HeartbeatWarningSystem,
  type HeartbeatWarningConfig,
} from '../heartbeat-warning-system.js';

// ===== TEST CONFIGURATION =====

const REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_TEST_DB || '1'), // Use separate DB for tests
  retryStrategy: (times: number) => {
    if (times > 3) return null; // Stop retrying after 3 attempts
    return Math.min(times * 50, 500);
  },
};

const TEST_TIMEOUT = 30000; // 30 seconds for all tests

// ===== TEST UTILITIES =====

async function cleanupRedis(redis: Redis): Promise<void> {
  try {
    // Clean up all test keys
    const patterns = [
      'blocking:heartbeat:*',
      'blocking:ack:*',
      'blocking:signal:*',
      'blocking:idempotency:*',
      'coordinator:activity:*',
    ];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    }
  } catch (error) {
    console.error('Redis cleanup failed:', error);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== TEST SUITE =====

describe('CoordinatorTimeoutHandler', () => {
  let redis: Redis;
  let timeoutHandler: CoordinatorTimeoutHandler;
  let heartbeatSystem: HeartbeatWarningSystem;

  beforeEach(async () => {
    // Initialize Redis client
    redis = new Redis(REDIS_CONFIG);

    // Wait for Redis connection
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });

    // Clean up any existing test data
    await cleanupRedis(redis);

    // Create HeartbeatWarningSystem for integration testing
    const heartbeatConfig: HeartbeatWarningConfig = {
      redisClient: redis,
      monitorInterval: 1000, // 1 second
      staleThreshold: 5000, // 5 seconds
      maxWarnings: 3,
      autoCleanup: true,
      debug: false,
    };

    heartbeatSystem = new HeartbeatWarningSystem(heartbeatConfig);
  }, TEST_TIMEOUT);

  afterEach(async () => {
    // Stop monitoring
    if (timeoutHandler) {
      timeoutHandler.stopMonitoring();
    }
    if (heartbeatSystem) {
      heartbeatSystem.stopMonitoring();
    }

    // Clean up test data
    await cleanupRedis(redis);

    // Disconnect Redis
    await redis.quit();
  }, TEST_TIMEOUT);

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);

      expect(timeoutHandler).toBeDefined();

      const metrics = timeoutHandler.getMetrics();
      expect(metrics.totalChecks).toBe(0);
      expect(metrics.timeoutEventsTotal).toBe(0);
      expect(metrics.cleanupsPerformed).toBe(0);
    });

    it('should initialize with custom configuration', () => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
        timeoutThreshold: 60000, // 1 minute
        checkInterval: 10000, // 10 seconds
        heartbeatSystem,
        autoCleanup: true,
        debug: true,
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);

      expect(timeoutHandler).toBeDefined();
    });

    it('should initialize without HeartbeatWarningSystem', () => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
        timeoutThreshold: 60000,
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);

      expect(timeoutHandler).toBeDefined();
    });
  });

  describe('Activity Tracking', () => {
    beforeEach(() => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
        timeoutThreshold: 5000, // 5 seconds for testing
        checkInterval: 1000, // 1 second
        autoCleanup: true,
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);
    });

    it('should record coordinator activity', async () => {
      const coordinatorId = 'coordinator-1';
      const iteration = 1;
      const phase = 'test-phase';

      await timeoutHandler.recordActivity(coordinatorId, iteration, phase);

      // Verify activity was stored in Redis
      const activityKey = `coordinator:activity:${coordinatorId}`;
      const activityJson = await redis.get(activityKey);

      expect(activityJson).toBeDefined();

      const activity = JSON.parse(activityJson!);
      expect(activity.coordinatorId).toBe(coordinatorId);
      expect(activity.iteration).toBe(iteration);
      expect(activity.phase).toBe(phase);
      expect(activity.lastActivity).toBeGreaterThan(Date.now() - 1000);
    });

    it('should update activity on subsequent recordings', async () => {
      const coordinatorId = 'coordinator-1';

      // Record initial activity
      await timeoutHandler.recordActivity(coordinatorId, 1, 'phase-1');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Record updated activity
      await timeoutHandler.recordActivity(coordinatorId, 2, 'phase-2');

      // Verify latest activity
      const activityKey = `coordinator:activity:${coordinatorId}`;
      const activityJson = await redis.get(activityKey);
      const activity = JSON.parse(activityJson!);

      expect(activity.iteration).toBe(2);
      expect(activity.phase).toBe('phase-2');
    });
  });

  describe('Timeout Detection', () => {
    beforeEach(() => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
        timeoutThreshold: 5000, // 5 seconds
        checkInterval: 1000,
        autoCleanup: false, // Disable for detection-only tests
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);
    });

    it('should detect timeout when activity exceeds threshold', async () => {
      const coordinatorId = 'coordinator-timeout';
      const iteration = 1;

      // Record activity 6 seconds ago (beyond 5 second threshold)
      const pastTime = Date.now() - 6000;
      const activityKey = `coordinator:activity:${coordinatorId}`;
      await redis.set(
        activityKey,
        JSON.stringify({
          coordinatorId,
          lastActivity: pastTime,
          iteration,
        })
      );

      // Check for timeout
      const isTimeout = await timeoutHandler.checkCoordinatorTimeout(coordinatorId);

      expect(isTimeout).toBe(true);

      const metrics = timeoutHandler.getMetrics();
      expect(metrics.timeoutEventsTotal).toBe(1);
    });

    it('should NOT detect timeout when activity is within threshold', async () => {
      const coordinatorId = 'coordinator-active';
      const iteration = 1;

      // Record recent activity (within threshold)
      await timeoutHandler.recordActivity(coordinatorId, iteration);

      // Check for timeout
      const isTimeout = await timeoutHandler.checkCoordinatorTimeout(coordinatorId);

      expect(isTimeout).toBe(false);

      const metrics = timeoutHandler.getMetrics();
      expect(metrics.timeoutEventsTotal).toBe(0);
    });

    it('should return false when no activity record exists', async () => {
      const coordinatorId = 'coordinator-unknown';

      // Check for timeout (no activity recorded)
      const isTimeout = await timeoutHandler.checkCoordinatorTimeout(coordinatorId);

      expect(isTimeout).toBe(false);
    });
  });

  describe('Event Emission', () => {
    beforeEach(() => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
        timeoutThreshold: 5000,
        autoCleanup: false, // Focus on events only
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);
    });

    it('should emit coordinator:timeout event on timeout detection', async () => {
      const coordinatorId = 'coordinator-timeout';
      const iteration = 3;
      const phase = 'test-phase';

      // Setup listener
      let timeoutEvent: CoordinatorTimeoutEvent | null = null;
      timeoutHandler.on('coordinator:timeout', (event: CoordinatorTimeoutEvent) => {
        timeoutEvent = event;
      });

      // Record stale activity
      const pastTime = Date.now() - 6000;
      const activityKey = `coordinator:activity:${coordinatorId}`;
      await redis.set(
        activityKey,
        JSON.stringify({
          coordinatorId,
          lastActivity: pastTime,
          iteration,
          phase,
        })
      );

      // Trigger timeout check
      await timeoutHandler.checkCoordinatorTimeout(coordinatorId);

      // Verify event was emitted
      expect(timeoutEvent).toBeDefined();
      expect(timeoutEvent!.coordinatorId).toBe(coordinatorId);
      expect(timeoutEvent!.timeoutDuration).toBeGreaterThan(5000);
      expect(timeoutEvent!.metadata?.iteration).toBe(iteration);
      expect(timeoutEvent!.metadata?.phase).toBe(phase);
      expect(timeoutEvent!.reason).toContain('inactive');
    });
  });

  describe('State Cleanup', () => {
    describe('Direct Cleanup (No HeartbeatWarningSystem)', () => {
      beforeEach(() => {
        const config: CoordinatorTimeoutConfig = {
          redisClient: redis,
          timeoutThreshold: 5000,
          autoCleanup: true,
          heartbeatSystem: undefined, // No integration
        };

        timeoutHandler = createCoordinatorTimeoutHandler(config);
      });

      it('should cleanup all coordinator state on timeout', async () => {
        const coordinatorId = 'coordinator-cleanup';

        // Setup coordinator state in Redis
        await redis.set(`blocking:heartbeat:${coordinatorId}`, JSON.stringify({ seq: 1 }));
        await redis.set(`blocking:ack:${coordinatorId}:signal1`, JSON.stringify({ ack: 'test' }));
        await redis.set(`blocking:ack:${coordinatorId}:signal2`, JSON.stringify({ ack: 'test' }));
        await redis.set(`blocking:signal:${coordinatorId}`, JSON.stringify({ sig: 'test' }));
        await redis.set(`blocking:idempotency:op1:${coordinatorId}`, JSON.stringify({ idem: 'test' }));
        await redis.set(`coordinator:activity:${coordinatorId}`, JSON.stringify({ act: 'test' }));

        // Verify state exists
        let keys = await redis.keys(`*${coordinatorId}*`);
        expect(keys.length).toBeGreaterThan(0);

        // Trigger cleanup
        await timeoutHandler.cleanupTimeoutCoordinator(coordinatorId);

        // Verify all state was removed
        keys = await redis.keys(`*${coordinatorId}*`);
        expect(keys.length).toBe(0);

        // Verify metrics
        const metrics = timeoutHandler.getMetrics();
        expect(metrics.cleanupsPerformed).toBe(1);
        expect(metrics.cleanupFailures).toBe(0);
      });

      it('should emit cleanup:complete event after successful cleanup', async () => {
        const coordinatorId = 'coordinator-cleanup';

        // Setup listener
        let cleanupEvent: any = null;
        timeoutHandler.on('cleanup:complete', (event) => {
          cleanupEvent = event;
        });

        // Setup minimal state
        await redis.set(`coordinator:activity:${coordinatorId}`, JSON.stringify({ test: 'data' }));

        // Trigger cleanup
        await timeoutHandler.cleanupTimeoutCoordinator(coordinatorId);

        // Verify event
        expect(cleanupEvent).toBeDefined();
        expect(cleanupEvent.coordinatorId).toBe(coordinatorId);
      });

      it('should emit cleanup:failed event on cleanup error', async () => {
        const coordinatorId = 'coordinator-fail';

        // Mock Redis to throw error
        const originalDel = redis.del.bind(redis);
        vi.spyOn(redis, 'del').mockRejectedValueOnce(new Error('Redis error'));

        // Setup listener
        let failEvent: any = null;
        timeoutHandler.on('cleanup:failed', (event) => {
          failEvent = event;
        });

        // Setup state
        await redis.set(`coordinator:activity:${coordinatorId}`, JSON.stringify({ test: 'data' }));

        // Trigger cleanup (should fail)
        await timeoutHandler.cleanupTimeoutCoordinator(coordinatorId);

        // Verify failure event
        expect(failEvent).toBeDefined();
        expect(failEvent.coordinatorId).toBe(coordinatorId);
        expect(failEvent.error).toContain('Redis error');

        // Verify metrics
        const metrics = timeoutHandler.getMetrics();
        expect(metrics.cleanupFailures).toBe(1);

        // Restore mock
        redis.del = originalDel;
      });
    });

    describe('Integration with HeartbeatWarningSystem', () => {
      beforeEach(() => {
        const config: CoordinatorTimeoutConfig = {
          redisClient: redis,
          timeoutThreshold: 5000,
          autoCleanup: true,
          heartbeatSystem, // Use integration
        };

        timeoutHandler = createCoordinatorTimeoutHandler(config);
      });

      it('should delegate cleanup to HeartbeatWarningSystem', async () => {
        const coordinatorId = 'coordinator-integrated';

        // Setup coordinator state
        await redis.set(`blocking:heartbeat:${coordinatorId}`, JSON.stringify({ seq: 1 }));
        await redis.set(`blocking:ack:${coordinatorId}:signal1`, JSON.stringify({ ack: 'test' }));
        await redis.set(`blocking:signal:${coordinatorId}`, JSON.stringify({ sig: 'test' }));

        // Verify state exists
        let keys = await redis.keys(`*${coordinatorId}*`);
        expect(keys.length).toBeGreaterThan(0);

        // Trigger cleanup (should delegate)
        await timeoutHandler.cleanupTimeoutCoordinator(coordinatorId);

        // Verify cleanup was performed (by HeartbeatWarningSystem)
        keys = await redis.keys(`*${coordinatorId}*`);
        expect(keys.length).toBe(0);

        // Verify metrics
        const metrics = timeoutHandler.getMetrics();
        expect(metrics.cleanupsPerformed).toBe(1);
      });
    });
  });

  describe('Automatic Timeout Monitoring', () => {
    it('should check for timeouts on interval', async () => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
        timeoutThreshold: 2000, // 2 seconds
        checkInterval: 500, // 500ms
        autoCleanup: false,
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);

      // Start monitoring
      timeoutHandler.startMonitoring();

      // Wait for at least 2 check cycles
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Stop monitoring
      timeoutHandler.stopMonitoring();

      // Verify checks were performed
      const metrics = timeoutHandler.getMetrics();
      expect(metrics.totalChecks).toBeGreaterThan(0);
    });

    it('should emit monitoring:started event', async () => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
        checkInterval: 1000,
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);

      let startEvent: any = null;
      timeoutHandler.on('monitoring:started', (event) => {
        startEvent = event;
      });

      timeoutHandler.startMonitoring();

      expect(startEvent).toBeDefined();
      expect(startEvent.checkInterval).toBe(1000);

      timeoutHandler.stopMonitoring();
    });

    it('should emit monitoring:stopped event', async () => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
        checkInterval: 1000,
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);

      let stopEvent: any = null;
      timeoutHandler.on('monitoring:stopped', (event) => {
        stopEvent = event;
      });

      timeoutHandler.startMonitoring();
      timeoutHandler.stopMonitoring();

      expect(stopEvent).toBeDefined();
      expect(stopEvent.metrics).toBeDefined();
    });

    it('should not start monitoring twice', () => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);

      timeoutHandler.startMonitoring();

      // Try to start again (should warn, not throw)
      expect(() => {
        timeoutHandler.startMonitoring();
      }).not.toThrow();

      timeoutHandler.stopMonitoring();
    });
  });

  describe('Metrics Tracking', () => {
    beforeEach(() => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
        timeoutThreshold: 5000,
        autoCleanup: true,
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);
    });

    it('should track timeout_events_total metric', async () => {
      const coordinatorId = 'coordinator-metrics';

      // Record stale activity
      const pastTime = Date.now() - 6000;
      const activityKey = `coordinator:activity:${coordinatorId}`;
      await redis.set(
        activityKey,
        JSON.stringify({
          coordinatorId,
          lastActivity: pastTime,
          iteration: 1,
        })
      );

      // Trigger timeout
      await timeoutHandler.checkCoordinatorTimeout(coordinatorId);

      // Verify metric
      const metrics = timeoutHandler.getMetrics();
      expect(metrics.timeoutEventsTotal).toBe(1);
    });

    it('should increment timeout_events_total for multiple timeouts', async () => {
      // Create multiple timed-out coordinators
      for (let i = 1; i <= 3; i++) {
        const coordinatorId = `coordinator-${i}`;
        const pastTime = Date.now() - 6000;
        const activityKey = `coordinator:activity:${coordinatorId}`;

        await redis.set(
          activityKey,
          JSON.stringify({
            coordinatorId,
            lastActivity: pastTime,
            iteration: 1,
          })
        );

        await timeoutHandler.checkCoordinatorTimeout(coordinatorId);
      }

      // Verify total count
      const metrics = timeoutHandler.getMetrics();
      expect(metrics.timeoutEventsTotal).toBe(3);
      expect(metrics.cleanupsPerformed).toBe(3);
    });

    it('should reset metrics', async () => {
      const coordinatorId = 'coordinator-reset';

      // Generate some metrics
      const pastTime = Date.now() - 6000;
      await redis.set(
        `coordinator:activity:${coordinatorId}`,
        JSON.stringify({
          coordinatorId,
          lastActivity: pastTime,
          iteration: 1,
        })
      );

      await timeoutHandler.checkCoordinatorTimeout(coordinatorId);

      let metrics = timeoutHandler.getMetrics();
      expect(metrics.timeoutEventsTotal).toBeGreaterThan(0);

      // Reset
      timeoutHandler.resetMetrics();

      metrics = timeoutHandler.getMetrics();
      expect(metrics.timeoutEventsTotal).toBe(0);
      expect(metrics.cleanupsPerformed).toBe(0);
      expect(metrics.totalChecks).toBe(0);
    });
  });

  describe('End-to-End Timeout Flow', () => {
    it('should detect timeout, emit event, cleanup state, and update metrics', async () => {
      const config: CoordinatorTimeoutConfig = {
        redisClient: redis,
        timeoutThreshold: 5000,
        autoCleanup: true,
      };

      timeoutHandler = createCoordinatorTimeoutHandler(config);

      const coordinatorId = 'coordinator-e2e';

      // Setup event listeners
      let timeoutEvent: CoordinatorTimeoutEvent | null = null;
      let cleanupEvent: any = null;

      timeoutHandler.on('coordinator:timeout', (event) => {
        timeoutEvent = event;
      });

      timeoutHandler.on('cleanup:complete', (event) => {
        cleanupEvent = event;
      });

      // Setup coordinator state
      const pastTime = Date.now() - 6000;
      await redis.set(`blocking:heartbeat:${coordinatorId}`, JSON.stringify({ seq: 1 }));
      await redis.set(`blocking:ack:${coordinatorId}:signal1`, JSON.stringify({ ack: 'test' }));
      await redis.set(
        `coordinator:activity:${coordinatorId}`,
        JSON.stringify({
          coordinatorId,
          lastActivity: pastTime,
          iteration: 5,
          phase: 'production',
        })
      );

      // Verify initial state
      let keys = await redis.keys(`*${coordinatorId}*`);
      expect(keys.length).toBeGreaterThan(0);

      // Trigger timeout detection
      const isTimeout = await timeoutHandler.checkCoordinatorTimeout(coordinatorId);

      // Assertions
      expect(isTimeout).toBe(true);

      // Event emitted
      expect(timeoutEvent).toBeDefined();
      expect(timeoutEvent!.coordinatorId).toBe(coordinatorId);
      expect(timeoutEvent!.metadata?.iteration).toBe(5);
      expect(timeoutEvent!.metadata?.phase).toBe('production');

      // Cleanup performed
      expect(cleanupEvent).toBeDefined();

      // State removed
      keys = await redis.keys(`*${coordinatorId}*`);
      expect(keys.length).toBe(0);

      // Metrics updated
      const metrics = timeoutHandler.getMetrics();
      expect(metrics.timeoutEventsTotal).toBe(1);
      expect(metrics.cleanupsPerformed).toBe(1);
      expect(metrics.cleanupFailures).toBe(0);
    });
  });
});
