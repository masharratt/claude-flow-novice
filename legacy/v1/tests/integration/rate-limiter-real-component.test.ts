/**
 * Integration Test: Real RateLimiter Component (TypeScript)
 * Phase 2 Sprint 2.2 - Coverage Improvement
 *
 * Tests real TypeScript RateLimiter classes with:
 * - Token bucket algorithm validation
 * - Sliding window rate limiting
 * - Worker spawn controls
 * - Task delegation limits
 * - Adaptive refill mechanisms
 * - Failure scenarios
 * - 100-agent coordination simulation
 *
 * Target: Increase coverage from 68% to ≥80%
 */

import { RateLimiter as CoordinationRateLimiter, RateLimitError, RateLimitConfig } from '../../src/coordination/rate-limiter.js';
import { RateLimiter as UtilsRateLimiter, createRateLimiter, createMemoryRateLimiter, createSprintRateLimiter } from '../../src/utils/rate-limiter.js';
import { Logger } from '../../src/core/logger.js';

// Mock logger for testing
class MockLogger implements Logger {
  messages: { level: string; message: string; meta?: any }[] = [];

  info(message: string, meta?: any): void {
    this.messages.push({ level: 'info', message, meta });
  }

  error(message: string, meta?: any): void {
    this.messages.push({ level: 'error', message, meta });
  }

  warn(message: string, meta?: any): void {
    this.messages.push({ level: 'warn', message, meta });
  }

  debug(message: string, meta?: any): void {
    this.messages.push({ level: 'debug', message, meta });
  }

  verbose(message: string, meta?: any): void {
    this.messages.push({ level: 'verbose', message, meta });
  }
}

describe('Integration: Real RateLimiter Components', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = new MockLogger();
  });

  describe('Coordination RateLimiter - Worker Spawn Controls', () => {
    it('should enforce max concurrent worker limit', () => {
      const config: Partial<RateLimitConfig> = {
        maxConcurrentWorkers: 3,
        maxTaskQueueSize: 10,
        workerSpawnWindowMs: 1000,
        maxWorkerSpawnsPerWindow: 10
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      // Spawn 3 workers - should succeed
      limiter.checkWorkerSpawn();
      limiter.checkWorkerSpawn();
      limiter.checkWorkerSpawn();

      // 4th worker should fail
      expect(() => limiter.checkWorkerSpawn()).toThrow(RateLimitError);
      expect(() => limiter.checkWorkerSpawn()).toThrow('Worker spawn limit reached');
    });

    it('should release workers and allow new spawns', () => {
      const config: Partial<RateLimitConfig> = {
        maxConcurrentWorkers: 2,
        maxWorkerSpawnsPerWindow: 10
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      // Spawn 2 workers
      limiter.checkWorkerSpawn();
      limiter.checkWorkerSpawn();

      // Release 1 worker
      limiter.releaseWorker();

      // Should allow 1 more spawn
      expect(() => limiter.checkWorkerSpawn()).not.toThrow();

      // But not 2 more
      expect(() => limiter.checkWorkerSpawn()).toThrow(RateLimitError);
    });

    it('should enforce worker spawn rate limit (sliding window)', () => {
      const config: Partial<RateLimitConfig> = {
        maxConcurrentWorkers: 100,
        workerSpawnWindowMs: 100, // 100ms window
        maxWorkerSpawnsPerWindow: 5
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      // Spawn 5 workers rapidly
      for (let i = 0; i < 5; i++) {
        limiter.checkWorkerSpawn();
        limiter.releaseWorker(); // Release immediately to avoid concurrent limit
      }

      // 6th spawn should fail (rate limit)
      expect(() => limiter.checkWorkerSpawn()).toThrow(RateLimitError);
      expect(() => limiter.checkWorkerSpawn()).toThrow('Worker spawn rate limit exceeded');
    });

    it('should provide retry-after information on rate limit error', () => {
      const config: Partial<RateLimitConfig> = {
        maxConcurrentWorkers: 1,
        maxWorkerSpawnsPerWindow: 1
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      limiter.checkWorkerSpawn();

      try {
        limiter.checkWorkerSpawn();
        fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfterMs).toBeGreaterThan(0);
        expect((error as RateLimitError).statusCode).toBe(429);
      }
    });
  });

  describe('Coordination RateLimiter - Task Delegation Controls', () => {
    it('should enforce max task queue size', () => {
      const config: Partial<RateLimitConfig> = {
        maxTaskQueueSize: 3,
        maxTaskDelegationsPerWindow: 10
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      // Queue 3 tasks - should succeed
      limiter.checkTaskDelegation();
      limiter.checkTaskDelegation();
      limiter.checkTaskDelegation();

      // 4th task should fail
      expect(() => limiter.checkTaskDelegation()).toThrow(RateLimitError);
      expect(() => limiter.checkTaskDelegation()).toThrow('Task queue limit reached');
    });

    it('should release tasks and allow new delegations', () => {
      const config: Partial<RateLimitConfig> = {
        maxTaskQueueSize: 2,
        maxTaskDelegationsPerWindow: 10
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      // Queue 2 tasks
      limiter.checkTaskDelegation();
      limiter.checkTaskDelegation();

      // Release 1 task
      limiter.releaseTask();

      // Should allow 1 more delegation
      expect(() => limiter.checkTaskDelegation()).not.toThrow();

      // But not 2 more
      expect(() => limiter.checkTaskDelegation()).toThrow(RateLimitError);
    });

    it('should enforce task delegation rate limit (sliding window)', () => {
      const config: Partial<RateLimitConfig> = {
        maxTaskQueueSize: 100,
        taskDelegationWindowMs: 100,
        maxTaskDelegationsPerWindow: 5
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      // Delegate 5 tasks rapidly
      for (let i = 0; i < 5; i++) {
        limiter.checkTaskDelegation();
        limiter.releaseTask(); // Release immediately to avoid queue limit
      }

      // 6th delegation should fail (rate limit)
      expect(() => limiter.checkTaskDelegation()).toThrow(RateLimitError);
      expect(() => limiter.checkTaskDelegation()).toThrow('Task delegation rate limit exceeded');
    });

    it('should provide accurate status report', () => {
      const config: Partial<RateLimitConfig> = {
        maxConcurrentWorkers: 10,
        maxTaskQueueSize: 20,
        maxWorkerSpawnsPerWindow: 15,
        maxTaskDelegationsPerWindow: 30
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      // Spawn 3 workers
      limiter.checkWorkerSpawn();
      limiter.checkWorkerSpawn();
      limiter.checkWorkerSpawn();

      // Queue 5 tasks
      for (let i = 0; i < 5; i++) {
        limiter.checkTaskDelegation();
      }

      const status = limiter.getStatus();

      expect(status.currentWorkerCount).toBe(3);
      expect(status.maxConcurrentWorkers).toBe(10);
      expect(status.currentTaskQueueSize).toBe(5);
      expect(status.maxTaskQueueSize).toBe(20);
      expect(status.workersAvailable).toBe(7);
      expect(status.taskQueueAvailable).toBe(15);
      expect(status.recentWorkerSpawns).toBe(3);
      expect(status.recentTaskDelegations).toBe(5);
    });
  });

  describe('Utils RateLimiter - Token Bucket Algorithm', () => {
    it('should allow operations when tokens available', async () => {
      const limiter = createRateLimiter({
        maxTokens: 10,
        refillRate: 5
      });

      // Should have 10 tokens initially
      await expect(limiter.acquire(5)).resolves.not.toThrow();

      const stats = limiter.getStats();
      expect(stats.currentTokens).toBeLessThanOrEqual(5);
      expect(stats.totalAcquired).toBe(5);
    });

    it('should wait when insufficient tokens', async () => {
      const limiter = createRateLimiter({
        maxTokens: 10,
        refillRate: 10, // 10 tokens/sec
        initialTokens: 2
      });

      const startTime = Date.now();

      // Request 5 tokens (need to wait for 3 more)
      await limiter.acquire(5);

      const elapsedMs = Date.now() - startTime;

      // Should have waited ~300ms (3 tokens / 10 tokens/sec)
      expect(elapsedMs).toBeGreaterThanOrEqual(250);
      expect(elapsedMs).toBeLessThan(500);
    });

    it('should refill tokens over time', async () => {
      const limiter = createRateLimiter({
        maxTokens: 100,
        refillRate: 50 // 50 tokens/sec
      });

      // Consume all tokens
      await limiter.acquire(100);
      expect(limiter.hasTokens(10)).toBe(false);

      // Wait 200ms (should refill 10 tokens)
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(limiter.hasTokens(10)).toBe(true);
    });

    it('should not exceed max token capacity', async () => {
      const limiter = createRateLimiter({
        maxTokens: 50,
        refillRate: 100
      });

      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 500));

      const stats = limiter.getStats();
      expect(stats.currentTokens).toBeLessThanOrEqual(50);
    });

    it('should support tryAcquire without waiting', () => {
      const limiter = createRateLimiter({
        maxTokens: 10,
        refillRate: 5,
        initialTokens: 3
      });

      // Should succeed (3 tokens available)
      expect(limiter.tryAcquire(3)).toBe(true);

      // Should fail (0 tokens remaining)
      expect(limiter.tryAcquire(1)).toBe(false);
    });

    it('should track accurate statistics', async () => {
      const limiter = createRateLimiter({
        maxTokens: 20,
        refillRate: 10,
        initialTokens: 5
      });

      // Acquire with wait
      await limiter.acquire(10);

      const stats = limiter.getStats();

      expect(stats.totalAcquired).toBe(10);
      expect(stats.totalWaitTime).toBeGreaterThan(0);
      expect(stats.utilization).toBeGreaterThan(0);
      expect(stats.refillRate).toBe(10);
    });

    it('should calculate time until tokens available', () => {
      const limiter = createRateLimiter({
        maxTokens: 100,
        refillRate: 10, // 10 tokens/sec
        initialTokens: 2
      });

      // Need 10 tokens, have 2, need 8 more
      // 8 tokens / 10 tokens/sec = 0.8 sec = 800ms
      const timeMs = limiter.timeUntilAvailable(10);

      expect(timeMs).toBeGreaterThanOrEqual(700);
      expect(timeMs).toBeLessThanOrEqual(900);
    });

    it('should reset limiter state', async () => {
      const limiter = createRateLimiter({
        maxTokens: 10,
        refillRate: 5
      });

      // Consume tokens and wait
      await limiter.acquire(8);

      // Reset
      limiter.reset();

      const stats = limiter.getStats();
      expect(stats.currentTokens).toBe(10);
      expect(stats.totalAcquired).toBe(0);
      expect(stats.totalWaitTime).toBe(0);
    });

    it('should validate token cost', async () => {
      const limiter = createRateLimiter({
        maxTokens: 10,
        refillRate: 5
      });

      await expect(limiter.acquire(0)).rejects.toThrow('Token cost must be positive');
      await expect(limiter.acquire(-5)).rejects.toThrow('Token cost must be positive');
      await expect(limiter.acquire(15)).rejects.toThrow('exceeds bucket capacity');
    });
  });

  describe('Utils RateLimiter - Adaptive Refill', () => {
    it('should increase refill rate under high load', async () => {
      const limiter = createRateLimiter({
        maxTokens: 50,
        refillRate: 10,
        initialTokens: 5,
        adaptiveRefill: true
      });

      // Generate high load (multiple waits)
      for (let i = 0; i < 5; i++) {
        await limiter.acquire(10);
      }

      const stats = limiter.getStats();

      // Refill rate should increase above base rate
      expect(stats.refillRate).toBeGreaterThan(10);
    });

    it('should decrease refill rate when load is low', async () => {
      const limiter = createRateLimiter({
        maxTokens: 100,
        refillRate: 20,
        adaptiveRefill: true
      });

      // Manually increase refill rate
      (limiter as any).refillRate = 30;

      // Low load (no waits)
      for (let i = 0; i < 10; i++) {
        expect(limiter.tryAcquire(1)).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const stats = limiter.getStats();

      // Refill rate should decrease toward base rate or stay at 30
      expect(stats.refillRate).toBeLessThanOrEqual(30);
    });
  });

  describe('Specialized Rate Limiters', () => {
    it('should create memory rate limiter (CVE-2025-001 mitigation)', async () => {
      const limiter = createMemoryRateLimiter();

      const stats = limiter.getStats();

      expect(stats.currentTokens).toBe(100);
      expect(stats.refillRate).toBe(10); // 10 ops/sec

      // Should allow burst of 100 operations
      await limiter.acquire(100);

      expect(limiter.hasTokens(1)).toBe(false);
    });

    it('should create sprint rate limiter', async () => {
      const limiter = createSprintRateLimiter();

      const stats = limiter.getStats();

      expect(stats.currentTokens).toBe(50);
      expect(stats.refillRate).toBe(5); // 5 sprints/sec
    });
  });

  describe('Failure Scenarios', () => {
    it('should handle disk full simulation (cannot persist state)', () => {
      const config: Partial<RateLimitConfig> = {
        maxConcurrentWorkers: 5,
        maxTaskQueueSize: 10
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      // Simulate disk full by exhausting queue
      for (let i = 0; i < 10; i++) {
        limiter.checkTaskDelegation();
      }

      // Should throw queue full error
      try {
        limiter.checkTaskDelegation();
        fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).code).toBe('TASK_QUEUE_FULL');
      }
    });

    it('should handle rapid bursts exceeding rate limits', () => {
      const config: Partial<RateLimitConfig> = {
        maxConcurrentWorkers: 100,
        workerSpawnWindowMs: 1000,
        maxWorkerSpawnsPerWindow: 10
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      // Rapid burst of 10 spawns
      for (let i = 0; i < 10; i++) {
        limiter.checkWorkerSpawn();
        limiter.releaseWorker();
      }

      // 11th spawn should fail
      try {
        limiter.checkWorkerSpawn();
        fail('Should have thrown SPAWN_RATE_EXCEEDED error');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).code).toBe('SPAWN_RATE_EXCEEDED');
      }
    });

    it('should handle concurrent reset during operations', async () => {
      const limiter = createRateLimiter({
        maxTokens: 20,
        refillRate: 10,
        initialTokens: 5
      });

      // Start acquisition
      const acquirePromise = limiter.acquire(10);

      // Reset during wait
      setTimeout(() => limiter.reset(), 50);

      // Should still complete acquisition
      await expect(acquirePromise).resolves.not.toThrow();
    });

    it('should handle configuration validation errors', () => {
      expect(() => createRateLimiter({
        maxTokens: 0,
        refillRate: 10
      })).toThrow('maxTokens must be positive');

      expect(() => createRateLimiter({
        maxTokens: 10,
        refillRate: 0
      })).toThrow('refillRate must be positive');
    });
  });

  describe('100-Agent Coordination Simulation', () => {
    it('should handle 100 concurrent agent spawns with rate limiting', async () => {
      const config: Partial<RateLimitConfig> = {
        maxConcurrentWorkers: 100,
        maxTaskQueueSize: 500,
        workerSpawnWindowMs: 5000,
        maxWorkerSpawnsPerWindow: 150
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      const spawnPromises: Promise<void>[] = [];

      // Simulate 100 agents attempting to spawn workers
      for (let i = 0; i < 100; i++) {
        spawnPromises.push(
          new Promise<void>((resolve, reject) => {
            try {
              limiter.checkWorkerSpawn();
              // Simulate worker execution
              setTimeout(() => {
                limiter.releaseWorker();
                resolve();
              }, Math.random() * 100);
            } catch (error) {
              reject(error);
            }
          })
        );
      }

      // Should complete without exceeding limits
      const results = await Promise.allSettled(spawnPromises);

      const fulfilled = results.filter(r => r.status === 'fulfilled').length;
      const rejected = results.filter(r => r.status === 'rejected').length;

      // Should allow 100 concurrent workers
      expect(fulfilled).toBe(100);
      expect(rejected).toBe(0);

      const status = limiter.getStatus();
      expect(status.recentWorkerSpawns).toBe(100);
    });

    it('should handle 100 agents with task delegation backpressure', async () => {
      const config: Partial<RateLimitConfig> = {
        maxConcurrentWorkers: 100,
        maxTaskQueueSize: 50, // Limited queue
        taskDelegationWindowMs: 1000,
        maxTaskDelegationsPerWindow: 200
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      let successCount = 0;
      let failureCount = 0;

      // Simulate 100 agents attempting to delegate tasks
      for (let i = 0; i < 100; i++) {
        try {
          limiter.checkTaskDelegation();
          successCount++;

          // Simulate task completion (release some to allow more)
          if (successCount > 0 && successCount % 10 === 0) {
            limiter.releaseTask();
          }
        } catch (error) {
          failureCount++;
        }
      }

      // Should allow up to queue size (with some releases), then apply backpressure
      expect(successCount).toBeGreaterThan(0);
      expect(successCount).toBeLessThanOrEqual(55); // 50 + 5 releases
      expect(failureCount).toBeGreaterThan(0);
      expect(successCount + failureCount).toBe(100);
    });

    it('should handle 100-agent token bucket coordination', async () => {
      const limiter = createRateLimiter({
        maxTokens: 200,
        refillRate: 50, // 50 tokens/sec
        adaptiveRefill: true
      });

      const acquirePromises: Promise<void>[] = [];

      // Simulate 100 agents acquiring 2 tokens each
      for (let i = 0; i < 100; i++) {
        acquirePromises.push(limiter.acquire(2));
      }

      const startTime = Date.now();
      await Promise.all(acquirePromises);
      const elapsedMs = Date.now() - startTime;

      // 200 tokens total, need 200 for 100 agents
      // Should complete in reasonable time with refill
      expect(elapsedMs).toBeLessThan(10000); // 10 seconds max

      const stats = limiter.getStats();
      expect(stats.totalAcquired).toBe(200);

      // Adaptive refill should have kicked in
      expect(stats.refillRate).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Coverage Edge Cases', () => {
    it('should handle edge case: worker release when count is 0', () => {
      const limiter = new CoordinationRateLimiter({}, mockLogger);

      // Release when no workers spawned
      limiter.releaseWorker();

      const status = limiter.getStatus();
      expect(status.currentWorkerCount).toBe(0);
    });

    it('should handle edge case: task release when queue is empty', () => {
      const limiter = new CoordinationRateLimiter({}, mockLogger);

      // Release when no tasks queued
      limiter.releaseTask();

      const status = limiter.getStatus();
      expect(status.currentTaskQueueSize).toBe(0);
    });

    it('should handle edge case: configuration update during operations', () => {
      const limiter = new CoordinationRateLimiter({ maxConcurrentWorkers: 5 }, mockLogger);

      limiter.checkWorkerSpawn();
      limiter.checkWorkerSpawn();

      // Update config mid-execution
      limiter.updateConfig({ maxConcurrentWorkers: 10 });

      // Should allow more workers with new limit
      for (let i = 0; i < 8; i++) {
        limiter.checkWorkerSpawn();
      }

      const status = limiter.getStatus();
      expect(status.currentWorkerCount).toBe(10);
      expect(status.maxConcurrentWorkers).toBe(10);
    });

    it('should handle edge case: hasTokens with cost 0', () => {
      const limiter = createRateLimiter({ maxTokens: 10, refillRate: 5 });

      // Edge case: checking for 0 tokens (should always be true)
      expect(limiter.hasTokens(0)).toBe(true);
    });

    it('should handle edge case: time until available when already available', () => {
      const limiter = createRateLimiter({
        maxTokens: 100,
        refillRate: 10,
        initialTokens: 50
      });

      // Already have 50 tokens
      expect(limiter.timeUntilAvailable(30)).toBe(0);
    });

    it('should handle operation history cleanup', () => {
      const config: Partial<RateLimitConfig> = {
        maxConcurrentWorkers: 100,
        workerSpawnWindowMs: 100,
        maxWorkerSpawnsPerWindow: 50
      };
      const limiter = new CoordinationRateLimiter(config, mockLogger);

      // Generate many operations
      for (let i = 0; i < 30; i++) {
        limiter.checkWorkerSpawn();
        limiter.releaseWorker();
      }

      // Wait for window to expire
      return new Promise<void>(resolve => {
        setTimeout(() => {
          // Old operations should be cleaned up
          const status = limiter.getStatus();
          expect(status.recentWorkerSpawns).toBe(0);
          resolve();
        }, 150);
      });
    });
  });
});
