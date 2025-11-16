/**
 * Performance Test: System Throughput
 *
 * Tests:
 * - Operations per second
 * - Message processing rate
 * - Transaction throughput
 * - Concurrent operation capacity
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { DatabaseService } from '../../src/lib/database-service';
import { RedisQueueManager } from '../../src/lib/redis-queue-manager';
import { MetricsLogger } from '../../src/lib/metrics-logger';

describe('Throughput Performance', () => {
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
    });
  });

  afterAll(async () => {
    await dbService.disconnect();
    await queueManager.disconnect();
    await metricsLogger.close();
  });

  it('should achieve >100 write operations/second', async () => {
    const operationCount = 200;
    const start = Date.now();

    const promises = [];
    for (let i = 0; i < operationCount; i++) {
      promises.push(
        dbService.set('redis', `throughput:${i}`, { data: i })
      );
    }

    await Promise.all(promises);
    const duration = (Date.now() - start) / 1000; // seconds

    const throughput = operationCount / duration;
    expect(throughput).toBeGreaterThan(100);
  });

  it('should process >200 queue messages/second', async () => {
    const messageCount = 400;
    const queueName = 'throughput-test';

    // Enqueue messages
    const enqueueStart = Date.now();
    const enqueuePromises = [];
    for (let i = 0; i < messageCount; i++) {
      enqueuePromises.push(
        queueManager.enqueue(queueName, { id: i, data: `msg${i}` })
      );
    }
    await Promise.all(enqueuePromises);
    const enqueueDuration = (Date.now() - enqueueStart) / 1000;

    // Dequeue messages
    const dequeueStart = Date.now();
    const dequeuePromises = [];
    for (let i = 0; i < messageCount; i++) {
      dequeuePromises.push(queueManager.dequeue(queueName));
    }
    await Promise.all(dequeuePromises);
    const dequeueDuration = (Date.now() - dequeueStart) / 1000;

    const enqueueThroughput = messageCount / enqueueDuration;
    const dequeueThroughput = messageCount / dequeueDuration;

    expect(enqueueThroughput).toBeGreaterThan(200);
    expect(dequeueThroughput).toBeGreaterThan(200);
  });

  it('should log >150 metric entries/second', async () => {
    const metricCount = 300;
    const start = Date.now();

    const promises = [];
    for (let i = 0; i < metricCount; i++) {
      promises.push(
        metricsLogger.log({
          name: 'throughput_test',
          value: i,
          tags: { iteration: i },
        })
      );
    }

    await Promise.all(promises);
    const duration = (Date.now() - start) / 1000;

    const throughput = metricCount / duration;
    expect(throughput).toBeGreaterThan(150);
  });

  it('should maintain throughput with mixed operations', async () => {
    const operationCount = 200;
    const start = Date.now();

    const promises = [];
    for (let i = 0; i < operationCount; i++) {
      if (i % 3 === 0) {
        promises.push(dbService.set('redis', `mixed:${i}`, { data: i }));
      } else if (i % 3 === 1) {
        promises.push(dbService.get('redis', `mixed:${i - 1}`));
      } else {
        promises.push(metricsLogger.log({ name: 'mixed_op', value: i }));
      }
    }

    await Promise.all(promises);
    const duration = (Date.now() - start) / 1000;

    const throughput = operationCount / duration;
    expect(throughput).toBeGreaterThan(80); // Lower threshold for mixed ops
  });

  it('should scale throughput with parallelism', async () => {
    const testParallelism = async (workers: number) => {
      const opsPerWorker = 50;
      const start = Date.now();

      const workerPromises = [];
      for (let w = 0; w < workers; w++) {
        workerPromises.push(
          (async () => {
            for (let i = 0; i < opsPerWorker; i++) {
              await dbService.set('redis', `parallel:${w}:${i}`, { data: i });
            }
          })()
        );
      }

      await Promise.all(workerPromises);
      const duration = (Date.now() - start) / 1000;
      const throughput = (workers * opsPerWorker) / duration;

      return throughput;
    };

    const throughput2 = await testParallelism(2);
    const throughput4 = await testParallelism(4);

    // Throughput should increase with more workers
    expect(throughput4).toBeGreaterThan(throughput2 * 1.5);
  });
});
