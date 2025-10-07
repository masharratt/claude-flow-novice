/**
 * Integration Test: RateLimiter Failure Scenarios
 * Phase 2 Sprint 2.2 - Failure Injection Testing
 *
 * Tests failure scenarios:
 * - Agent crashes mid-operation
 * - Disk full during state persistence
 * - Network partition scenarios
 * - Race conditions
 * - Memory pressure
 * - Thundering herd prevention
 *
 * Target: Increase coverage from 68% to ≥80%
 */

import { RateLimiter as CoordinationRateLimiter, RateLimitError } from '../../src/coordination/rate-limiter.js';
import { RateLimiter as UtilsRateLimiter, createRateLimiter } from '../../src/utils/rate-limiter.js';
import { Logger } from '../../src/core/logger.js';

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

describe('Integration: RateLimiter Failure Scenarios', () => {
  describe('Agent Crash Scenarios', () => {
    it('should handle agent crash before worker release', () => {
      const limiter = new CoordinationRateLimiter(
        { maxConcurrentWorkers: 5 },
        new MockLogger()
      );

      // Spawn 3 workers
      limiter.checkWorkerSpawn();
      limiter.checkWorkerSpawn();
      limiter.checkWorkerSpawn();

      // Simulate agent crash (no release calls)
      // System should still enforce limits

      let status = limiter.getStatus();
      expect(status.currentWorkerCount).toBe(3);

      // Spawn 2 more to reach limit
      limiter.checkWorkerSpawn();
      limiter.checkWorkerSpawn();

      // Should fail at limit
      expect(() => limiter.checkWorkerSpawn()).toThrow(RateLimitError);

      // Manual cleanup simulation (recovery process)
      limiter.reset();

      status = limiter.getStatus();
      expect(status.currentWorkerCount).toBe(0);
    });

    it('should handle token bucket crash mid-acquisition', async () => {
      const limiter = createRateLimiter({
        maxTokens: 50,
        refillRate: 10,
        initialTokens: 5
      });

      // Start multiple acquisitions
      const promise1 = limiter.acquire(10);
      const promise2 = limiter.acquire(10);

      // Simulate crash recovery by creating new limiter
      const recoveredLimiter = createRateLimiter({
        maxTokens: 50,
        refillRate: 10,
        initialTokens: 50
      });

      // Original acquisitions should complete
      await expect(promise1).resolves.not.toThrow();
      await expect(promise2).resolves.not.toThrow();

      // Recovered limiter should have fresh state
      const stats = recoveredLimiter.getStats();
      expect(stats.currentTokens).toBe(50);
    });
  });

  describe('Disk Full Scenarios', () => {
    it('should handle queue exhaustion (disk full simulation)', () => {
      const limiter = new CoordinationRateLimiter(
        {
          maxTaskQueueSize: 10,
          maxTaskDelegationsPerWindow: 100
        },
        new MockLogger()
      );

      // Fill queue to simulate disk full
      for (let i = 0; i < 10; i++) {
        limiter.checkTaskDelegation();
      }

      // Should throw queue full error
      try {
        limiter.checkTaskDelegation();
        fail('Should have thrown TASK_QUEUE_FULL error');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).code).toBe('TASK_QUEUE_FULL');
        expect((error as RateLimitError).retryAfterMs).toBeGreaterThan(0);
      }
    });

    it('should allow recovery after disk space freed', () => {
      const limiter = new CoordinationRateLimiter(
        { maxTaskQueueSize: 5 },
        new MockLogger()
      );

      // Fill queue
      for (let i = 0; i < 5; i++) {
        limiter.checkTaskDelegation();
      }

      // Queue full
      expect(() => limiter.checkTaskDelegation()).toThrow('TASK_QUEUE_FULL');

      // Simulate disk space freed
      limiter.releaseTask();
      limiter.releaseTask();

      // Should allow new delegations
      expect(() => limiter.checkTaskDelegation()).not.toThrow();
      expect(() => limiter.checkTaskDelegation()).not.toThrow();
    });
  });

  describe('Race Condition Scenarios', () => {
    it('should handle concurrent worker spawns racing for last slot', async () => {
      const limiter = new CoordinationRateLimiter(
        { maxConcurrentWorkers: 10 },
        new MockLogger()
      );

      // Spawn 9 workers
      for (let i = 0; i < 9; i++) {
        limiter.checkWorkerSpawn();
      }

      // 10 agents try to spawn concurrently for last slot
      const spawnPromises = Array.from({ length: 10 }, () =>
        new Promise<boolean>(resolve => {
          try {
            limiter.checkWorkerSpawn();
            resolve(true);
          } catch (error) {
            resolve(false);
          }
        })
      );

      const results = await Promise.all(spawnPromises);
      const successCount = results.filter(r => r).length;

      // Only 1 should succeed (last slot)
      expect(successCount).toBe(1);

      const status = limiter.getStatus();
      expect(status.currentWorkerCount).toBe(10);
    });

    it('should handle concurrent token acquisitions', async () => {
      const limiter = createRateLimiter({
        maxTokens: 50,
        refillRate: 25,
        initialTokens: 30
      });

      // 10 concurrent acquisitions of 5 tokens each (need 50 total)
      const acquirePromises = Array.from({ length: 10 }, () =>
        limiter.acquire(5)
      );

      const startTime = Date.now();
      await Promise.all(acquirePromises);
      const elapsedMs = Date.now() - startTime;

      // Should have waited for refill (need 20 more tokens)
      // 20 tokens / 25 tokens/sec = 0.8s
      expect(elapsedMs).toBeGreaterThanOrEqual(700);

      const stats = limiter.getStats();
      expect(stats.totalAcquired).toBe(50);
    });

    it('should handle reset during concurrent operations', async () => {
      const limiter = createRateLimiter({
        maxTokens: 100,
        refillRate: 20,
        initialTokens: 10
      });

      const acquirePromises = Array.from({ length: 5 }, () =>
        limiter.acquire(10)
      );

      // Reset after 100ms
      setTimeout(() => limiter.reset(), 100);

      // All acquisitions should still complete
      const results = await Promise.allSettled(acquirePromises);
      const fulfilled = results.filter(r => r.status === 'fulfilled').length;

      expect(fulfilled).toBe(5);
    });
  });

  describe('Memory Pressure Scenarios', () => {
    it('should handle large operation history without memory leak', () => {
      const limiter = new CoordinationRateLimiter(
        {
          maxConcurrentWorkers: 1000,
          workerSpawnWindowMs: 10000,
          maxWorkerSpawnsPerWindow: 2000
        },
        new MockLogger()
      );

      // Generate 1000 operations
      for (let i = 0; i < 1000; i++) {
        limiter.checkWorkerSpawn();
        limiter.releaseWorker();
      }

      const status = limiter.getStatus();
      expect(status.recentWorkerSpawns).toBe(1000);

      // Operation history should be bounded
      const historySize = (limiter as any).operationHistory.length;
      expect(historySize).toBeLessThanOrEqual(2000);
    });

    it('should cleanup old operation records efficiently', async () => {
      const limiter = new CoordinationRateLimiter(
        {
          maxConcurrentWorkers: 100,
          workerSpawnWindowMs: 100,
          maxWorkerSpawnsPerWindow: 50
        },
        new MockLogger()
      );

      // Generate operations
      for (let i = 0; i < 30; i++) {
        limiter.checkWorkerSpawn();
        limiter.releaseWorker();
      }

      const initialHistorySize = (limiter as any).operationHistory.length;
      expect(initialHistorySize).toBe(30);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Trigger cleanup with new operation
      limiter.checkWorkerSpawn();
      limiter.releaseWorker();

      const finalHistorySize = (limiter as any).operationHistory.length;

      // Old records should be cleaned up
      expect(finalHistorySize).toBeLessThan(initialHistorySize);
      expect(finalHistorySize).toBeLessThanOrEqual(5);
    });

    it('should handle adaptive refill tracking without memory leak', async () => {
      const limiter = createRateLimiter({
        maxTokens: 100,
        refillRate: 20,
        initialTokens: 10,
        adaptiveRefill: true
      });

      // Generate 50 acquisitions with waits
      for (let i = 0; i < 50; i++) {
        await limiter.acquire(5);
      }

      // Wait time tracking should be bounded
      const waitTimes = (limiter as any).recentWaitTimes;
      expect(waitTimes.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Thundering Herd Prevention', () => {
    it('should prevent thundering herd with staggered backpressure', async () => {
      const limiter = new CoordinationRateLimiter(
        {
          maxConcurrentWorkers: 10,
          workerSpawnWindowMs: 1000,
          maxWorkerSpawnsPerWindow: 15
        },
        new MockLogger()
      );

      // Spawn 10 workers
      for (let i = 0; i < 10; i++) {
        limiter.checkWorkerSpawn();
      }

      // 100 agents try to spawn simultaneously
      const spawnAttempts = Array.from({ length: 100 }, () =>
        new Promise<{ success: boolean; retryAfterMs?: number }>(resolve => {
          try {
            limiter.checkWorkerSpawn();
            resolve({ success: true });
          } catch (error) {
            if (error instanceof RateLimitError) {
              resolve({ success: false, retryAfterMs: error.retryAfterMs });
            } else {
              resolve({ success: false });
            }
          }
        })
      );

      const results = await Promise.all(spawnAttempts);
      const failures = results.filter(r => !r.success);

      // Should fail with retry-after information
      expect(failures.length).toBe(100);
      failures.forEach(failure => {
        expect(failure.retryAfterMs).toBeGreaterThan(0);
      });
    });

    it('should distribute load with token bucket backpressure', async () => {
      const limiter = createRateLimiter({
        maxTokens: 20,
        refillRate: 10, // 10 tokens/sec
        initialTokens: 20
      });

      const acquireTimes: number[] = [];

      // 20 agents acquire 2 tokens each (40 total)
      for (let i = 0; i < 20; i++) {
        const startTime = Date.now();
        await limiter.acquire(2);
        acquireTimes.push(Date.now() - startTime);
      }

      // First 10 should be instant (20 tokens available)
      expect(acquireTimes.slice(0, 10).every(t => t < 50)).toBe(true);

      // Remaining 10 should wait for refill
      expect(acquireTimes.slice(10).some(t => t > 100)).toBe(true);
    });
  });

  describe('Network Partition Scenarios', () => {
    it('should handle isolated agent state (no coordination)', () => {
      // Simulate 3 isolated agents (network partition)
      const agent1 = new CoordinationRateLimiter(
        { maxConcurrentWorkers: 10 },
        new MockLogger()
      );
      const agent2 = new CoordinationRateLimiter(
        { maxConcurrentWorkers: 10 },
        new MockLogger()
      );
      const agent3 = new CoordinationRateLimiter(
        { maxConcurrentWorkers: 10 },
        new MockLogger()
      );

      // Each agent maintains independent state
      for (let i = 0; i < 5; i++) {
        agent1.checkWorkerSpawn();
        agent2.checkWorkerSpawn();
        agent3.checkWorkerSpawn();
      }

      // Each has 5 workers locally
      expect(agent1.getStatus().currentWorkerCount).toBe(5);
      expect(agent2.getStatus().currentWorkerCount).toBe(5);
      expect(agent3.getStatus().currentWorkerCount).toBe(5);

      // Total system: 15 workers (would exceed global limit if coordinated)
      const totalWorkers =
        agent1.getStatus().currentWorkerCount +
        agent2.getStatus().currentWorkerCount +
        agent3.getStatus().currentWorkerCount;

      expect(totalWorkers).toBe(15);
    });

    it('should recover after network partition heals', () => {
      const limiter = new CoordinationRateLimiter(
        { maxConcurrentWorkers: 20 },
        new MockLogger()
      );

      // Simulate partition: spawn workers while isolated
      for (let i = 0; i < 15; i++) {
        limiter.checkWorkerSpawn();
      }

      // Network heals: reset to coordinated state
      limiter.reset();

      const status = limiter.getStatus();
      expect(status.currentWorkerCount).toBe(0);

      // Can spawn again under coordination
      for (let i = 0; i < 10; i++) {
        limiter.checkWorkerSpawn();
      }

      expect(limiter.getStatus().currentWorkerCount).toBe(10);
    });
  });

  describe('Edge Case Failures', () => {
    it('should handle extremely rapid operations', async () => {
      const limiter = createRateLimiter({
        maxTokens: 1000,
        refillRate: 500,
        initialTokens: 1000
      });

      // 500 rapid operations
      const promises = Array.from({ length: 500 }, () => limiter.acquire(2));

      await Promise.all(promises);

      const stats = limiter.getStats();
      expect(stats.totalAcquired).toBe(1000);
    });

    it('should handle config update during active operations', async () => {
      const limiter = new CoordinationRateLimiter(
        { maxConcurrentWorkers: 5 },
        new MockLogger()
      );

      // Spawn 3 workers
      limiter.checkWorkerSpawn();
      limiter.checkWorkerSpawn();
      limiter.checkWorkerSpawn();

      // Update config while workers active
      limiter.updateConfig({ maxConcurrentWorkers: 10 });

      // Should allow 7 more workers
      for (let i = 0; i < 7; i++) {
        expect(() => limiter.checkWorkerSpawn()).not.toThrow();
      }

      expect(limiter.getStatus().currentWorkerCount).toBe(10);
    });

    it('should handle zero-cost token acquisition edge case', () => {
      const limiter = createRateLimiter({
        maxTokens: 10,
        refillRate: 5
      });

      // Edge case: acquire 0 tokens
      expect(() => limiter.tryAcquire(0)).toThrow('Token cost must be positive');
    });

    it('should handle negative refill edge case', () => {
      // System clock moved backward
      const limiter = createRateLimiter({
        maxTokens: 100,
        refillRate: 50
      });

      // Consume tokens
      limiter.tryAcquire(50);

      // Manually adjust last refill time to future (clock backward simulation)
      (limiter as any).lastRefillTime = Date.now() + 10000;

      // Should not refill (negative elapsed time)
      limiter.tryAcquire(1);

      const stats = limiter.getStats();
      expect(stats.currentTokens).toBeLessThan(100);
    });

    it('should handle retry-after calculation edge cases', () => {
      const limiter = new CoordinationRateLimiter(
        {
          maxConcurrentWorkers: 1,
          workerSpawnWindowMs: 1000,
          maxWorkerSpawnsPerWindow: 1
        },
        new MockLogger()
      );

      // Spawn 1 worker
      limiter.checkWorkerSpawn();

      // Immediate retry should fail with positive retry-after
      try {
        limiter.checkWorkerSpawn();
        fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const retryAfter = (error as RateLimitError).retryAfterMs;

        // Should have retry-after >= 1000ms (or min 1000ms)
        expect(retryAfter).toBeGreaterThanOrEqual(1000);
      }
    });
  });

  describe('Stress Testing', () => {
    it('should handle sustained high load without degradation', async () => {
      const limiter = createRateLimiter({
        maxTokens: 500,
        refillRate: 100,
        adaptiveRefill: true
      });

      const iterations = 200;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await limiter.acquire(5);
      }

      const elapsedMs = Date.now() - startTime;
      const stats = limiter.getStats();

      // Should complete 200 iterations (1000 tokens)
      expect(stats.totalAcquired).toBe(1000);

      // Should complete in reasonable time with refill
      expect(elapsedMs).toBeLessThan(20000); // 20 seconds max

      // Adaptive refill should be active
      expect(stats.refillRate).toBeGreaterThanOrEqual(100);
    });

    it('should handle burst followed by idle period', async () => {
      const limiter = createRateLimiter({
        maxTokens: 100,
        refillRate: 50,
        adaptiveRefill: true
      });

      // Burst
      for (let i = 0; i < 20; i++) {
        await limiter.acquire(5);
      }

      const burstStats = limiter.getStats();
      expect(burstStats.totalWaitTime).toBeGreaterThan(0);

      // Idle period
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should refill to max
      const idleStats = limiter.getStats();
      expect(idleStats.currentTokens).toBe(100);
    });

    it('should maintain accuracy under continuous load', async () => {
      const limiter = new CoordinationRateLimiter(
        {
          maxConcurrentWorkers: 50,
          maxTaskQueueSize: 100,
          workerSpawnWindowMs: 5000,
          maxWorkerSpawnsPerWindow: 200
        },
        new MockLogger()
      );

      // Continuous load: spawn and release
      for (let i = 0; i < 150; i++) {
        limiter.checkWorkerSpawn();
        limiter.releaseWorker();
      }

      const status = limiter.getStatus();

      // Should track accurately
      expect(status.recentWorkerSpawns).toBe(150);
      expect(status.currentWorkerCount).toBe(0);
    });
  });
});
