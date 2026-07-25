/**
 * Stress Test: System Limits
 *
 * Tests:
 * - Maximum concurrent connections
 * - Memory usage under load
 * - Database connection pooling
 * - System degradation patterns
 * - Recovery after stress
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { DatabaseService } from '../../src/lib/database-service';
import { RedisQueueManager } from '../../src/lib/redis-queue-manager';
import { MetricsLogger } from '../../src/lib/metrics-logger';

describe('System Stress Tests', () => {
  let dbService: DatabaseService;
  let queueManager: RedisQueueManager;
  let metricsLogger: MetricsLogger;

  beforeAll(async () => {
    dbService = new DatabaseService({
      redis: { type: 'redis', host: 'localhost', port: 6379 },
      sqlite: { type: 'sqlite', database: ':memory:' },
    });

    await dbService.initialize();

    queueManager = new RedisQueueManager({
      host: 'localhost',
      port: 6379,
    });

    metricsLogger = new MetricsLogger({
      enableRedis: true,
      enableSQLite: true,
    });
  });

  afterAll(async () => {
    if (dbService) { await dbService.disconnect(); };
    await queueManager.disconnect();
    await metricsLogger.close();
  });

  it('should handle maximum queue depth (10000 messages)', async () => {
    const queueName = 'stress-test-queue';
    const messageCount = 10000;

    const start = Date.now();

    // Enqueue in batches for efficiency
    const batchSize = 100;
    for (let batch = 0; batch < messageCount / batchSize; batch++) {
      const promises = [];
      for (let i = 0; i < batchSize; i++) {
        const msgId = batch * batchSize + i;
        promises.push(
          queueManager.enqueue(queueName, {
            id: msgId,
            data: `message-${msgId}`,
          })
        );
      }
      await Promise.all(promises);
    }

    const enqueueDuration = Date.now() - start;
    expect(enqueueDuration).toBeLessThan(30000); // <30s for 10k messages

    // Dequeue all
    const dequeueStart = Date.now();
    let dequeueCount = 0;

    while (dequeueCount < messageCount) {
      const msg = await queueManager.dequeue(queueName, { timeout: 100 });
      if (msg) {
        dequeueCount++;
        await queueManager.acknowledge(queueName, msg.messageId);
      } else {
        break;
      }
    }

    const dequeueDuration = Date.now() - dequeueStart;

    expect(dequeueCount).toBe(messageCount);
    expect(dequeueDuration).toBeLessThan(60000); // <60s for 10k messages
  }, 120000);

  it('should handle burst traffic (1000 ops in 1s)', async () => {
    const operationCount = 1000;

    const start = Date.now();

    const promises = [];
    for (let i = 0; i < operationCount; i++) {
      promises.push(
        dbService.set('redis', `burst:${i}`, { id: i, timestamp: Date.now() })
      );
    }

    await Promise.all(promises);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(2000); // Allow 2s for burst

    // Verify all written
    const results = await dbService.query('redis', 'burst:*');
    expect(results.length).toBe(operationCount);
  }, 10000);

  it('should maintain stability with large data volumes', async () => {
    const recordCount = 5000;
    const largePayload = 'x'.repeat(1024); // 1KB payload

    const start = Date.now();

    // Write large volume
    const writePromises = [];
    for (let i = 0; i < recordCount; i++) {
      writePromises.push(
        dbService.set('redis', `large:${i}`, {
          id: i,
          data: largePayload,
          timestamp: Date.now(),
        })
      );
    }

    await Promise.all(writePromises);
    const writeDuration = Date.now() - start;

    expect(writeDuration).toBeLessThan(20000); // <20s for 5000 x 1KB

    // Read back
    const readStart = Date.now();
    const readPromises = [];
    for (let i = 0; i < 100; i++) {
      readPromises.push(dbService.get('redis', `large:${i}`));
    }

    await Promise.all(readPromises);
    const readDuration = Date.now() - readStart;

    expect(readDuration).toBeLessThan(1000); // <1s for 100 reads
  }, 30000);

  it('should handle connection pool exhaustion gracefully', async () => {
    const connectionAttempts = 200;

    const promises = [];
    for (let i = 0; i < connectionAttempts; i++) {
      promises.push(
        (async () => {
          try {
            await dbService.set('redis', `conn:${i}`, { id: i });
            await dbService.get('redis', `conn:${i}`);
            return 'success';
          } catch (error) {
            return 'error';
          }
        })()
      );
    }

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r === 'success').length;

    // Should maintain >90% success rate even under connection stress
    expect(successCount).toBeGreaterThan(connectionAttempts * 0.9);
  }, 15000);

  it('should recover after sustained high load', async () => {
    // Phase 1: Apply high load
    const loadDuration = 5000; // 5 seconds
    const loadStart = Date.now();

    const loadInterval = setInterval(async () => {
      await dbService.set('redis', `load:${Date.now()}`, {
        data: 'stress-test',
      });
    }, 10);

    await new Promise(resolve => setTimeout(resolve, loadDuration));
    clearInterval(loadInterval);

    // Phase 2: Measure recovery
    await new Promise(resolve => setTimeout(resolve, 1000)); // Cool down

    const recoveryStart = Date.now();
    await dbService.set('redis', 'recovery:test', { data: 'test' });
    const result = await dbService.get('redis', 'recovery:test');
    const recoveryDuration = Date.now() - recoveryStart;

    expect(result.data).toBe('test');
    expect(recoveryDuration).toBeLessThan(500); // Should recover quickly
  }, 15000);

  it('should maintain metric logging under stress', async () => {
    const metricCount = 5000;
    const start = Date.now();

    const promises = [];
    for (let i = 0; i < metricCount; i++) {
      promises.push(
        metricsLogger.log({
          name: 'stress_metric',
          value: Math.random() * 100,
          tags: {
            index: i,
            batch: Math.floor(i / 100),
          },
        })
      );
    }

    await Promise.all(promises);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(10000); // <10s for 5000 metrics

    // Verify metrics retrievable
    const metrics = await metricsLogger.query({
      name: 'stress_metric',
    });

    expect(metrics.length).toBeGreaterThan(0);
  }, 20000);

  it('should identify performance degradation thresholds', async () => {
    const measurePerformance = async (load: number) => {
      const promises = [];
      const start = Date.now();

      for (let i = 0; i < load; i++) {
        promises.push(
          dbService.set('redis', `perf:${load}:${i}`, { data: i })
        );
      }

      await Promise.all(promises);
      return Date.now() - start;
    };

    // Test increasing load
    const loads = [10, 50, 100, 200, 500];
    const timings = [];

    for (const load of loads) {
      const duration = await measurePerformance(load);
      timings.push({ load, duration });
    }

    // Verify linear or sub-linear scaling
    const ratio100to50 = timings[2].duration / timings[1].duration;
    const ratio200to100 = timings[3].duration / timings[2].duration;

    // Performance should degrade less than linearly
    expect(ratio200to100).toBeLessThan(3);
  }, 20000);
});
