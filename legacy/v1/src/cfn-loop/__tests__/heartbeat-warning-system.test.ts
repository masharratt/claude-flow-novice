/**
 * Heartbeat Warning System Test Suite - Sprint 1.2
 *
 * Tests dead coordinator detection via heartbeat monitoring.
 * Validates warning escalation, cleanup, and critical exit paths.
 *
 * Epic: production-blocking-coordination
 * Sprint: 1.2 - Dead Coordinator Detection
 * Target: Detection within 2 minutes (120 seconds)
 *
 * Test Coverage Requirements:
 * - Heartbeat registration and retrieval
 * - Stale heartbeat detection (>120s)
 * - Warning escalation (3 consecutive warnings)
 * - Dead coordinator marking and cleanup
 * - Heartbeat continuity validation
 * - Orphan state cleanup
 *
 * @module cfn-loop/__tests__/heartbeat-warning-system
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import {
  HeartbeatWarningSystem,
  createHeartbeatWarningSystem,
  CoordinatorHealth,
  type HeartbeatWarning,
  type HeartbeatRecord,
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

describe('HeartbeatWarningSystem - Sprint 1.2', () => {
  let redis: Redis;
  let warningSystem: HeartbeatWarningSystem;

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
  }, TEST_TIMEOUT);

  afterEach(async () => {
    // Stop monitoring if running
    if (warningSystem) {
      warningSystem.stopMonitoring();
      warningSystem.removeAllListeners();
    }

    // Clean up test data
    await cleanupRedis(redis);

    // Disconnect Redis
    await redis.quit();
  }, TEST_TIMEOUT);

  // ===== HEARTBEAT REGISTRATION TESTS =====

  describe('Heartbeat Registration', () => {
    it('should register heartbeat with timestamp and sequence', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        debug: false,
      });

      const coordinatorId = 'test-coord-1';
      const iteration = 1;
      const metadata = { phase: 'auth', agentCount: 5 };

      const heartbeat = await warningSystem.registerHeartbeat(coordinatorId, iteration, metadata);

      expect(heartbeat).toBeDefined();
      expect(heartbeat.coordinatorId).toBe(coordinatorId);
      expect(heartbeat.iteration).toBe(iteration);
      expect(heartbeat.sequence).toBe(1); // First heartbeat
      expect(heartbeat.lastHeartbeat).toBeGreaterThan(0);
      expect(heartbeat.metadata).toEqual(metadata);
    });

    it('should increment sequence on consecutive heartbeats', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        debug: false,
      });

      const coordinatorId = 'test-coord-2';

      const heartbeat1 = await warningSystem.registerHeartbeat(coordinatorId, 1);
      const heartbeat2 = await warningSystem.registerHeartbeat(coordinatorId, 1);
      const heartbeat3 = await warningSystem.registerHeartbeat(coordinatorId, 2);

      expect(heartbeat1.sequence).toBe(1);
      expect(heartbeat2.sequence).toBe(2);
      expect(heartbeat3.sequence).toBe(3);
    });

    it('should persist heartbeat to Redis with TTL', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        debug: false,
      });

      const coordinatorId = 'test-coord-3';

      await warningSystem.registerHeartbeat(coordinatorId, 1);

      // Check Redis directly
      const key = `blocking:heartbeat:${coordinatorId}`;
      const exists = await redis.exists(key);
      const ttl = await redis.ttl(key);

      expect(exists).toBe(1);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300); // 5 min TTL
    });
  });

  // ===== HEARTBEAT RETRIEVAL TESTS =====

  describe('Heartbeat Retrieval', () => {
    it('should retrieve registered heartbeat', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        debug: false,
      });

      const coordinatorId = 'test-coord-4';
      const iteration = 2;

      await warningSystem.registerHeartbeat(coordinatorId, iteration);

      const heartbeat = await warningSystem.getHeartbeat(coordinatorId);

      expect(heartbeat).toBeDefined();
      expect(heartbeat!.coordinatorId).toBe(coordinatorId);
      expect(heartbeat!.iteration).toBe(iteration);
    });

    it('should return null for non-existent heartbeat', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        debug: false,
      });

      const heartbeat = await warningSystem.getHeartbeat('non-existent-coord');

      expect(heartbeat).toBeNull();
    });

    it('should check heartbeat freshness', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        debug: false,
      });

      const coordinatorId = 'test-coord-5';

      await warningSystem.registerHeartbeat(coordinatorId, 1);

      // Wait a bit
      await sleep(100);

      const staleDuration = await warningSystem.checkHeartbeatFreshness(coordinatorId);

      expect(staleDuration).toBeGreaterThanOrEqual(100);
      expect(staleDuration).toBeLessThan(500);
    });
  });

  // ===== STALE HEARTBEAT DETECTION TESTS =====

  describe('Stale Heartbeat Detection', () => {
    it('should detect stale heartbeat after threshold', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        monitorInterval: 100, // 100ms monitor interval
        staleThreshold: 200, // 200ms stale threshold
        maxWarnings: 3,
        debug: false,
      });

      const coordinatorId = 'test-coord-6';

      // Register heartbeat
      await warningSystem.registerHeartbeat(coordinatorId, 1);

      // Set up warning listener
      const warnings: HeartbeatWarning[] = [];
      warningSystem.on('heartbeat:warning', (warning) => {
        warnings.push(warning);
      });

      // Start monitoring
      warningSystem.startMonitoring();

      // Wait for stale detection (200ms threshold + 100ms monitor interval + buffer)
      await sleep(500);

      // Should have at least one warning
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].coordinatorId).toBe(coordinatorId);
      expect(warnings[0].health).toBe(CoordinatorHealth.WARNING);
    }, 10000);

    it('should escalate warnings after consecutive detections', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        monitorInterval: 100,
        staleThreshold: 200,
        maxWarnings: 3,
        debug: false,
      });

      const coordinatorId = 'test-coord-7';

      // Register heartbeat
      await warningSystem.registerHeartbeat(coordinatorId, 1);

      // Set up listeners
      const warnings: HeartbeatWarning[] = [];
      warningSystem.on('heartbeat:warning', (warning) => {
        warnings.push(warning);
      });

      const deadEvents: any[] = [];
      warningSystem.on('coordinator:dead', (event) => {
        deadEvents.push(event);
      });

      // Start monitoring
      warningSystem.startMonitoring();

      // Wait for multiple warnings (3 warnings at 100ms intervals)
      await sleep(800);

      // Should have multiple warnings
      expect(warnings.length).toBeGreaterThanOrEqual(3);

      // Health should escalate: WARNING → CRITICAL → DEAD
      const healths = warnings.map((w) => w.health);
      expect(healths).toContain(CoordinatorHealth.WARNING);
      expect(healths).toContain(CoordinatorHealth.CRITICAL);
      expect(healths).toContain(CoordinatorHealth.DEAD);

      // Should have dead coordinator event
      expect(deadEvents.length).toBeGreaterThan(0);
      expect(deadEvents[0].coordinatorId).toBe(coordinatorId);
    }, 10000);
  });

  // ===== DEAD COORDINATOR MARKING TESTS =====

  describe('Dead Coordinator Marking', () => {
    it('should mark coordinator as dead after max warnings', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        maxWarnings: 3,
        autoCleanup: false, // Disable auto-cleanup for this test
        debug: false,
      });

      const coordinatorId = 'test-coord-8';

      // Set up dead coordinator listener
      const deadEvents: any[] = [];
      warningSystem.on('coordinator:dead', (event) => {
        deadEvents.push(event);
      });

      // Mark as dead manually
      await warningSystem.markCoordinatorDead(coordinatorId, 'Test escalation');

      // Should emit dead event
      expect(deadEvents.length).toBe(1);
      expect(deadEvents[0].coordinatorId).toBe(coordinatorId);
      expect(deadEvents[0].reason).toBe('Test escalation');

      // Health status should be DEAD
      const health = warningSystem.getHealthStatus(coordinatorId);
      expect(health).toBe(CoordinatorHealth.DEAD);
    });

    it('should emit error for critical exit path', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        autoCleanup: false,
        debug: false,
      });

      const coordinatorId = 'test-coord-9';

      // Set up error listener
      const errors: Error[] = [];
      warningSystem.on('error', (error) => {
        errors.push(error);
      });

      // Mark as dead
      await warningSystem.markCoordinatorDead(coordinatorId, 'Critical failure');

      // Should emit error
      expect(errors.length).toBe(1);
      expect(errors[0].name).toBe('DeadCoordinatorError');
      expect(errors[0].message).toContain(coordinatorId);
      expect(errors[0].message).toContain('CRITICAL');
    });
  });

  // ===== CLEANUP TESTS =====

  describe('Dead Coordinator Cleanup', () => {
    it('should cleanup all coordinator state', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        autoCleanup: true,
        debug: false,
      });

      const coordinatorId = 'test-coord-10';

      // Create test data in Redis
      await redis.setex(`blocking:heartbeat:${coordinatorId}`, 300, 'test');
      await redis.setex(`blocking:ack:${coordinatorId}:signal1`, 300, 'test');
      await redis.setex(`blocking:signal:${coordinatorId}`, 300, 'test');
      await redis.setex(`blocking:idempotency:${coordinatorId}-test`, 300, 'test');

      // Set up cleanup listener
      const cleanupEvents: any[] = [];
      warningSystem.on('cleanup:complete', (event) => {
        cleanupEvents.push(event);
      });

      // Mark as dead (should trigger auto-cleanup)
      await warningSystem.markCoordinatorDead(coordinatorId, 'Test cleanup');

      // Wait for cleanup
      await sleep(100);

      // Should emit cleanup event
      expect(cleanupEvents.length).toBe(1);
      expect(cleanupEvents[0].coordinatorId).toBe(coordinatorId);
      expect(cleanupEvents[0].keysDeleted).toBeGreaterThan(0);

      // Verify keys are deleted
      const heartbeatExists = await redis.exists(`blocking:heartbeat:${coordinatorId}`);
      const ackExists = await redis.exists(`blocking:ack:${coordinatorId}:signal1`);
      const signalExists = await redis.exists(`blocking:signal:${coordinatorId}`);

      expect(heartbeatExists).toBe(0);
      expect(ackExists).toBe(0);
      expect(signalExists).toBe(0);
    });

    it('should cleanup manually when auto-cleanup disabled', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        autoCleanup: false,
        debug: false,
      });

      const coordinatorId = 'test-coord-11';

      // Create test data
      await redis.setex(`blocking:heartbeat:${coordinatorId}`, 300, 'test');

      // Cleanup manually
      await warningSystem.cleanupDeadCoordinator(coordinatorId);

      // Verify cleanup
      const exists = await redis.exists(`blocking:heartbeat:${coordinatorId}`);
      expect(exists).toBe(0);

      // Check statistics
      const stats = warningSystem.getStatistics();
      expect(stats.cleanupsPerformed).toBe(1);
    });
  });

  // ===== CONTINUITY VALIDATION TESTS =====

  describe('Heartbeat Continuity Validation', () => {
    it('should validate sequence continuity', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        debug: false,
      });

      const coordinatorId = 'test-coord-12';

      // Register consecutive heartbeats
      const heartbeat1 = await warningSystem.registerHeartbeat(coordinatorId, 1);
      const heartbeat2 = await warningSystem.registerHeartbeat(coordinatorId, 1);

      // Validate continuity
      const valid1 = warningSystem.validateHeartbeatContinuity(coordinatorId, heartbeat1);
      const valid2 = warningSystem.validateHeartbeatContinuity(coordinatorId, heartbeat2);

      expect(valid1).toBe(true);
      expect(valid2).toBe(true);
    });

    it('should detect sequence gaps', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        debug: false,
      });

      const coordinatorId = 'test-coord-13';

      // Set up continuity violation listener
      const violations: any[] = [];
      warningSystem.on('continuity:violation', (event) => {
        violations.push(event);
      });

      // Register heartbeat with sequence 1
      await warningSystem.registerHeartbeat(coordinatorId, 1);

      // Create gap - manually set a heartbeat with sequence 5
      const gapHeartbeat: HeartbeatRecord = {
        coordinatorId,
        lastHeartbeat: Date.now(),
        sequence: 5, // Gap!
        iteration: 1,
      };

      const valid = warningSystem.validateHeartbeatContinuity(coordinatorId, gapHeartbeat);

      expect(valid).toBe(false);
      expect(violations.length).toBe(1);
      expect(violations[0].coordinatorId).toBe(coordinatorId);
      expect(violations[0].expectedSequence).toBe(2);
      expect(violations[0].receivedSequence).toBe(5);
      expect(violations[0].gap).toBe(3);
    });
  });

  // ===== MONITORING LIFECYCLE TESTS =====

  describe('Monitoring Lifecycle', () => {
    it('should start and stop monitoring', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        monitorInterval: 100,
        debug: false,
      });

      // Set up listeners
      const startEvents: any[] = [];
      const stopEvents: any[] = [];

      warningSystem.on('monitoring:started', (event) => {
        startEvents.push(event);
      });

      warningSystem.on('monitoring:stopped', (event) => {
        stopEvents.push(event);
      });

      // Start monitoring
      warningSystem.startMonitoring();

      expect(startEvents.length).toBe(1);

      // Wait a bit
      await sleep(300);

      // Stop monitoring
      warningSystem.stopMonitoring();

      expect(stopEvents.length).toBe(1);

      const stats = warningSystem.getStatistics();
      expect(stats.totalMonitorCycles).toBeGreaterThan(0);
    });

    it('should not double-start monitoring', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        debug: false,
      });

      warningSystem.startMonitoring();
      warningSystem.startMonitoring(); // Should warn

      // Only one timer should be running
      warningSystem.stopMonitoring();
    });
  });

  // ===== STATISTICS TESTS =====

  describe('Statistics', () => {
    it('should track statistics', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        debug: false,
      });

      const coordinatorId = 'test-coord-14';

      await warningSystem.registerHeartbeat(coordinatorId, 1);
      await warningSystem.markCoordinatorDead(coordinatorId, 'Test');

      const stats = warningSystem.getStatistics();

      expect(stats.coordinatorsMarkedDead).toBe(1);
      expect(stats.cleanupsPerformed).toBeGreaterThanOrEqual(0);
    });

    it('should reset statistics', async () => {
      warningSystem = createHeartbeatWarningSystem({
        redisClient: redis,
        debug: false,
      });

      const coordinatorId = 'test-coord-15';

      await warningSystem.markCoordinatorDead(coordinatorId, 'Test');

      let stats = warningSystem.getStatistics();
      expect(stats.coordinatorsMarkedDead).toBe(1);

      warningSystem.resetStatistics();

      stats = warningSystem.getStatistics();
      expect(stats.coordinatorsMarkedDead).toBe(0);
    });
  });
});
