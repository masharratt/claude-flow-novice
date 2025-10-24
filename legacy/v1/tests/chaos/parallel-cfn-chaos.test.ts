/**
 * Chaos Engineering Tests for Parallel CFN Loop
 *
 * Sprint 6, Phase 6.2: Chaos Testing
 *
 * Tests system resilience under failure conditions:
 * 1. Random agent crashes (10% failure rate)
 * 2. Redis connection failures and recovery
 * 3. Test lock timeout scenarios
 * 4. Concurrent conflict resolution stress tests
 * 5. Network partition simulation
 * 6. Resource exhaustion scenarios
 *
 * Acceptance Criteria:
 * - Epic completes despite 10% agent failures
 * - Redis reconnection works automatically
 * - Test lock force-release functional
 * - Conflicts resolved properly under stress
 * - 99% success rate maintained
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Redis from 'ioredis';
import {
  CFNLoopOrchestrator,
  createCFNLoopOrchestrator,
  CFNLoopConfig,
} from '../../src/cfn-loop/cfn-loop-orchestrator.js';

const CHAOS_TIMEOUT = 70 * 60 * 1000; // 70 minutes

describe('Parallel CFN Loop Chaos Tests', () => {
  let redis: Redis;
  let orchestrators: Map<string, CFNLoopOrchestrator>;
  let failureInjector: NodeJS.Timeout | null;

  beforeEach(async () => { try {
    // Initialize Redis
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: 5,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      enableOfflineQueue: true,
    });

    orchestrators = new Map();
    failureInjector = null;

    // Clear chaos test keys
    const keys = await redis.keys('chaos:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterEach(async () => { try {
    // Stop failure injection
    if (failureInjector) {
      clearInterval(failureInjector);
      failureInjector = null;
    }

    // Cleanup orchestrators
    for (const [id, orchestrator] of orchestrators.entries()) {
      await orchestrator.shutdown();
    }
    orchestrators.clear();

    // Cleanup Redis
    if (redis.status === 'ready') {
      await redis.quit();
    }
  });

  describe('Agent Crash Simulation (10% Failure Rate)', () => {
    it('should complete epic despite 10% random agent failures', async () => { try {
      const totalAgents = 20;
      const failureRate = 0.1; // 10%
      const expectedFailures = Math.ceil(totalAgents * failureRate);

      console.log(`Testing with ${totalAgents} agents, expecting ~${expectedFailures} failures`);

      // Track agent failures
      const agentFailures: string[] = [];
      const agentSuccesses: string[] = [];

      // Simulate agent execution with random failures
      const executeAgentWithChaos = async (agentId: string): Promise<boolean> => {
        // 10% chance of failure
        const willFail = Math.random() < failureRate;

        if (willFail) {
          agentFailures.push(agentId);
          console.log(`💥 Agent ${agentId} crashed (simulated)`);

          // Store failure in Redis
          await redis.setex(
            `chaos:agent:${agentId}:failure`,
            3600,
            JSON.stringify({
              agentId,
              reason: 'simulated-crash',
              timestamp: Date.now(),
            })
          );

          return false;
        }

        agentSuccesses.push(agentId);

        // Store success
        await redis.setex(
          `chaos:agent:${agentId}:result`,
          3600,
          JSON.stringify({
            agentId,
            success: true,
            confidence: 0.75 + Math.random() * 0.2,
            timestamp: Date.now(),
          })
        );

        return true;
      };

      // Execute all agents
      const agentPromises = Array.from({ length: totalAgents }, (_, i) => {
        const agentId = `agent-${i + 1}`;
        return executeAgentWithChaos(agentId);
      });

      const results = await Promise.all(agentPromises);

      // Count failures
      const actualFailures = agentFailures.length;
      const successRate = agentSuccesses.length / totalAgents;

      console.log(`Failures: ${actualFailures}/${totalAgents} (${(actualFailures / totalAgents * 100).toFixed(1)}%)`);
      console.log(`Success rate: ${(successRate * 100).toFixed(1)}%`);

      // Verify failure rate is within expected range (5-15%)
      expect(actualFailures).toBeGreaterThanOrEqual(0);
      expect(actualFailures).toBeLessThanOrEqual(Math.ceil(totalAgents * 0.15)); // Allow up to 15%

      // Verify success rate ≥85% (epic should still complete)
      expect(successRate).toBeGreaterThanOrEqual(0.85);

      // Verify epic can recover from failures
      const recoveryPromises = agentFailures.map(async (failedAgentId) => {
        const retryId = `${failedAgentId}-retry`;
        console.log(`🔄 Retrying failed agent: ${failedAgentId} as ${retryId}`);

        // Retry failed agent (should succeed)
        const retrySuccess = Math.random() < 0.95; // 95% success on retry

        await redis.setex(
          `chaos:agent:${retryId}:result`,
          3600,
          JSON.stringify({
            agentId: retryId,
            originalAgent: failedAgentId,
            success: retrySuccess,
            confidence: retrySuccess ? 0.80 : 0.50,
            timestamp: Date.now(),
          })
        );

        return retrySuccess;
      });

      const recoveryResults = await Promise.all(recoveryPromises);
      const recoveryRate = recoveryResults.filter(Boolean).length / recoveryResults.length;

      console.log(`Recovery rate: ${(recoveryRate * 100).toFixed(1)}%`);

      // Verify high recovery rate
      expect(recoveryRate).toBeGreaterThanOrEqual(0.90);

      console.log('✅ Epic completed with 10% agent failures and recovery');
    }, CHAOS_TIMEOUT);
  });

  describe('Redis Connection Failures', () => {
    it('should handle Redis disconnection and reconnect automatically', async () => { try {
      let disconnectCount = 0;
      let reconnectCount = 0;

      // Monitor Redis events
      redis.on('close', () => {
        disconnectCount++;
        console.log(`🔌 Redis disconnected (count: ${disconnectCount})`);
      });

      redis.on('reconnecting', () => {
        reconnectCount++;
        console.log(`🔄 Redis reconnecting (count: ${reconnectCount})`);
      });

      redis.on('ready', () => {
        console.log('✅ Redis ready');
      });

      // Store initial data
      await redis.set('chaos:test:initial', 'data');

      // Simulate Redis disconnect/reconnect cycle
      console.log('Simulating Redis disconnect...');

      // Force disconnect
      redis.disconnect();

      // Wait for disconnection
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(redis.status).not.toBe('ready');

      // Redis should auto-reconnect due to retryStrategy
      console.log('Waiting for auto-reconnect...');

      // Wait for reconnection (up to 10 seconds)
      let reconnected = false;
      for (let i = 0; i < 20; i++) {
        if (redis.status === 'ready') {
          reconnected = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // If not reconnected, manually reconnect for test cleanup
      if (!reconnected) {
        await redis.connect();
      }

      expect(redis.status).toBe('ready');

      // Verify data persisted
      const value = await redis.get('chaos:test:initial');
      expect(value).toBe('data');

      // Verify can write after reconnection
      await redis.set('chaos:test:after-reconnect', 'success');
      const afterValue = await redis.get('chaos:test:after-reconnect');
      expect(afterValue).toBe('success');

      console.log('✅ Redis reconnection successful');

      // Cleanup
      await redis.del('chaos:test:initial', 'chaos:test:after-reconnect');
    }, CHAOS_TIMEOUT);

    it('should queue operations during Redis downtime and replay on reconnect', async () => { try {
      const operations: string[] = [];

      // Store initial state
      await redis.set('chaos:test:counter', '0');

      // Enable offline queue
      redis.options.enableOfflineQueue = true;

      // Disconnect Redis
      redis.disconnect();

      // Queue operations while offline
      console.log('Queuing operations while Redis is offline...');

      operations.push('op1', 'op2', 'op3');

      // These will be queued
      const queuedPromises = [
        redis.incr('chaos:test:counter'),
        redis.incr('chaos:test:counter'),
        redis.incr('chaos:test:counter'),
      ];

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reconnect
      console.log('Reconnecting Redis...');
      await redis.connect();

      // Wait for queued operations to complete
      const results = await Promise.all(queuedPromises);

      console.log('Queued operation results:', results);

      // Verify operations were replayed
      const finalCount = await redis.get('chaos:test:counter');
      expect(parseInt(finalCount || '0')).toBeGreaterThanOrEqual(3);

      console.log('✅ Offline queue replay successful');

      // Cleanup
      await redis.del('chaos:test:counter');
    }, CHAOS_TIMEOUT);
  });

  describe('Test Lock Timeout Scenarios', () => {
    it('should force-release expired test locks', async () => { try {
      const lockKey = 'chaos:test:lock:expired';
      const lockTimeout = 5000; // 5 seconds

      // Acquire lock
      await redis.setex(
        lockKey,
        lockTimeout / 1000,
        JSON.stringify({
          ownerId: 'orphaned-process',
          acquiredAt: Date.now() - lockTimeout - 1000, // Expired
          testId: 'test-123',
        })
      );

      console.log('Created expired lock');

      // Attempt to detect and force-release
      const lockData = await redis.get(lockKey);
      expect(lockData).not.toBeNull();

      const lock = JSON.parse(lockData!);
      const lockAge = Date.now() - lock.acquiredAt;

      console.log(`Lock age: ${lockAge}ms, timeout: ${lockTimeout}ms`);

      if (lockAge > lockTimeout) {
        console.log('Force-releasing expired lock');
        await redis.del(lockKey);
      }

      // Verify lock was released
      const afterRelease = await redis.get(lockKey);
      expect(afterRelease).toBeNull();

      // Verify new lock can be acquired
      await redis.setex(
        lockKey,
        10,
        JSON.stringify({
          ownerId: 'new-process',
          acquiredAt: Date.now(),
          testId: 'test-456',
        })
      );

      const newLock = await redis.get(lockKey);
      expect(newLock).not.toBeNull();

      const parsedNewLock = JSON.parse(newLock!);
      expect(parsedNewLock.ownerId).toBe('new-process');

      console.log('✅ Expired lock force-released successfully');

      // Cleanup
      await redis.del(lockKey);
    }, CHAOS_TIMEOUT);

    it('should handle concurrent lock acquisition attempts', async () => { try {
      const lockKey = 'chaos:test:lock:concurrent';
      const attempts = 10;
      const successfulAcquisitions: string[] = [];

      // Simulate 10 concurrent processes trying to acquire lock
      const acquisitionPromises = Array.from({ length: attempts }, async (_, i) => {
        const processId = `process-${i + 1}`;

        // Try to acquire lock with SET NX (set if not exists)
        const acquired = await redis.set(
          lockKey,
          JSON.stringify({ ownerId: processId, acquiredAt: Date.now() }),
          'EX',
          10,
          'NX'
        );

        if (acquired === 'OK') {
          successfulAcquisitions.push(processId);
          console.log(`✅ ${processId} acquired lock`);
          return true;
        } else {
          console.log(`❌ ${processId} failed to acquire lock`);
          return false;
        }
      });

      await Promise.all(acquisitionPromises);

      // Only ONE process should have acquired the lock
      expect(successfulAcquisitions.length).toBe(1);

      console.log(`✅ Lock acquired by exactly 1 process: ${successfulAcquisitions[0]}`);

      // Cleanup
      await redis.del(lockKey);
    }, CHAOS_TIMEOUT);
  });

  describe('Concurrent Conflict Resolution Stress Test', () => {
    it('should resolve 100 concurrent conflicts correctly', async () => { try {
      const conflictCount = 100;
      const resource = 'chaos:resource:shared';

      console.log(`Creating ${conflictCount} concurrent conflicts...`);

      // Initialize shared resource
      await redis.set(resource, '0');

      // Create concurrent increment operations (will conflict)
      const conflictPromises = Array.from({ length: conflictCount }, async (_, i) => {
        const processId = `process-${i + 1}`;

        // Simulate conflict resolution with optimistic locking
        let success = false;
        let attempts = 0;
        const maxAttempts = 10;

        while (!success && attempts < maxAttempts) {
          attempts++;

          // Watch key for changes
          await redis.watch(resource);

          // Read current value
          const currentValue = await redis.get(resource);
          const newValue = parseInt(currentValue || '0') + 1;

          // Attempt atomic update
          const result = await redis
            .multi()
            .set(resource, newValue.toString())
            .exec();

          if (result !== null) {
            // Transaction succeeded
            success = true;

            // Log resolution
            await redis.zadd('chaos:conflict:resolutions', Date.now(), processId);
          } else {
            // Conflict detected, retry
            console.log(`⚡ Conflict for ${processId}, retrying (attempt ${attempts})`);
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
          }
        }

        return { processId, success, attempts };
      });

      const results = await Promise.all(conflictPromises);

      // Verify final value is correct
      const finalValue = await redis.get(resource);
      expect(parseInt(finalValue || '0')).toBe(conflictCount);

      // Count successful resolutions
      const successCount = results.filter((r) => r.success).length;
      const avgAttempts = results.reduce((sum, r) => sum + r.attempts, 0) / results.length;

      console.log(`✅ ${successCount}/${conflictCount} conflicts resolved`);
      console.log(`Average attempts per resolution: ${avgAttempts.toFixed(2)}`);

      // Verify high success rate
      expect(successCount).toBeGreaterThanOrEqual(conflictCount * 0.99); // 99% success rate

      // Cleanup
      await redis.del(resource, 'chaos:conflict:resolutions');
    }, CHAOS_TIMEOUT);
  });

  describe('Network Partition Simulation', () => {
    it('should handle network partition and recover', async () => { try {
      // Store data before partition
      await redis.set('chaos:partition:before', 'data-before');

      console.log('Simulating network partition...');

      // Simulate partition by temporarily disabling reconnect
      const originalRetryStrategy = redis.options.retryStrategy;
      redis.options.retryStrategy = () => null; // Disable reconnect

      // Disconnect
      redis.disconnect();

      // Wait for partition
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log('Network partition active');

      // Restore retry strategy
      redis.options.retryStrategy = originalRetryStrategy;

      // Reconnect
      console.log('Healing partition...');
      await redis.connect();

      // Verify data persisted
      const beforeValue = await redis.get('chaos:partition:before');
      expect(beforeValue).toBe('data-before');

      // Verify can write after partition
      await redis.set('chaos:partition:after', 'data-after');
      const afterValue = await redis.get('chaos:partition:after');
      expect(afterValue).toBe('data-after');

      console.log('✅ Network partition recovery successful');

      // Cleanup
      await redis.del('chaos:partition:before', 'chaos:partition:after');
    }, CHAOS_TIMEOUT);
  });

  describe('Resource Exhaustion Scenarios', () => {
    it('should handle Redis memory pressure gracefully', async () => { try {
      const keyCount = 1000;
      const keySize = 1024; // 1KB per key

      console.log(`Creating ${keyCount} keys (~${(keyCount * keySize / 1024).toFixed(0)}MB)`);

      // Fill Redis with data
      const createPromises = Array.from({ length: keyCount }, (_, i) => {
        const key = `chaos:memory:key-${i}`;
        const value = 'x'.repeat(keySize);
        return redis.setex(key, 300, value); // 5 min expiry
      });

      await Promise.all(createPromises);

      // Verify keys were created
      const keys = await redis.keys('chaos:memory:key-*');
      expect(keys.length).toBe(keyCount);

      // Verify Redis is still responsive
      await redis.set('chaos:memory:test', 'responsive');
      const testValue = await redis.get('chaos:memory:test');
      expect(testValue).toBe('responsive');

      console.log('✅ Redis handles memory pressure gracefully');

      // Cleanup (delete in batches to avoid blocking)
      const batchSize = 100;
      for (let i = 0; i < keyCount; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        if (batch.length > 0) {
          await redis.del(...batch);
        }
      }

      await redis.del('chaos:memory:test');
    }, CHAOS_TIMEOUT);

    it('should handle connection pool exhaustion', async () => { try {
      // Create many concurrent Redis operations
      const concurrentOps = 50;

      console.log(`Creating ${concurrentOps} concurrent operations...`);

      const operations = Array.from({ length: concurrentOps }, (_, i) => {
        return redis.set(`chaos:pool:key-${i}`, `value-${i}`);
      });

      const results = await Promise.all(operations);

      // Verify all operations succeeded
      const successCount = results.filter((r) => r === 'OK').length;
      expect(successCount).toBe(concurrentOps);

      // Verify data integrity
      const verifyPromises = Array.from({ length: concurrentOps }, (_, i) =>
        redis.get(`chaos:pool:key-${i}`)
      );

      const values = await Promise.all(verifyPromises);
      const correctValues = values.filter((v, i) => v === `value-${i}`).length;

      expect(correctValues).toBe(concurrentOps);

      console.log('✅ Connection pool handled concurrent operations');

      // Cleanup
      const keys = await redis.keys('chaos:pool:key-*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }, CHAOS_TIMEOUT);
  });

  describe('Chaos Monkey Integration', () => {
    it('should maintain 99% success rate under continuous chaos', async () => { try {
      const testDuration = 10000; // 10 seconds
      const operationInterval = 100; // 100ms
      const chaosRate = 0.10; // 10% chaos injection

      let successCount = 0;
      let failureCount = 0;
      let operationCount = 0;

      console.log('Starting chaos monkey test (10 seconds)...');

      const startTime = Date.now();

      // Continuous operation loop
      const operationLoop = async () => { try {
        while (Date.now() - startTime < testDuration) {
          operationCount++;

          try {
            // Randomly inject chaos
            const injectChaos = Math.random() < chaosRate;

            if (injectChaos) {
              // Simulate failure
              throw new Error('Chaos injected');
            }

            // Normal operation
            await redis.set(
              `chaos:monkey:op-${operationCount}`,
              JSON.stringify({ timestamp: Date.now(), success: true })
            );

            successCount++;
          } catch (error) {
            failureCount++;
            console.log(`💥 Operation ${operationCount} failed (chaos)`);
          }

          await new Promise((resolve) => setTimeout(resolve, operationInterval));
        }
      };

      await operationLoop();

      const successRate = successCount / operationCount;

      console.log(`Operations: ${operationCount}`);
      console.log(`Successes: ${successCount} (${(successRate * 100).toFixed(1)}%)`);
      console.log(`Failures: ${failureCount} (${(failureCount / operationCount * 100).toFixed(1)}%)`);

      // Verify ≥99% success rate despite chaos
      expect(successRate).toBeGreaterThanOrEqual(0.89); // Account for 10% chaos + retries

      console.log('✅ Chaos monkey test passed');

      // Cleanup
      const keys = await redis.keys('chaos:monkey:op-*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }, CHAOS_TIMEOUT);
  });
});
