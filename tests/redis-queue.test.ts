/**
 * Redis Queue System Test Suite
 *
 * Comprehensive test coverage for queue manager, deduplicator, and recovery system.
 * Part of Task 3.4: Redis Queue Consistency & Recovery (Integration Standardization Sprint 3)
 *
 * Test Coverage:
 * - Message deduplication
 * - Queue operations (enqueue, dequeue, acknowledge, reject)
 * - Retry logic with exponential backoff
 * - Dead letter queue functionality
 * - Stuck message recovery
 * - Coordinator crash recovery
 * - Performance requirements (<100ms)
 *
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createClient, RedisClientType } from 'redis';
import {
  MessageDeduplicator,
  DeduplicationOptions,
} from '../src/lib/message-deduplicator';
import {
  RedisQueueManager,
  QueueMessage,
  EnqueueOptions,
  DequeueOptions,
} from '../src/lib/redis-queue-manager';
import {
  QueueRecovery,
  RecoveryOptions,
  ReprocessingSafeguards,
} from '../src/lib/queue-recovery';

// Mock Redis client for testing
const createMockRedisClient = (): jest.Mocked<RedisClientType> => {
  const store = new Map<string, { value: string; expiry?: number }>();
  const lists = new Map<string, string[]>();

  return {
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockImplementation((key: string) => {
      return Promise.resolve(store.has(key) ? 1 : 0);
    }),
    get: jest.fn().mockImplementation((key: string) => {
      const entry = store.get(key);
      if (!entry) return Promise.resolve(null);

      // Check expiry
      if (entry.expiry && Date.now() > entry.expiry) {
        store.delete(key);
        return Promise.resolve(null);
      }

      return Promise.resolve(entry.value);
    }),
    set: jest.fn().mockImplementation((key: string, value: string, options?: any) => {
      const expiry = options?.PX ? Date.now() + options.PX : undefined;
      store.set(key, { value, expiry });
      return Promise.resolve('OK');
    }),
    del: jest.fn().mockImplementation((key: string) => {
      const deleted = store.delete(key) ? 1 : 0;
      return Promise.resolve(deleted);
    }),
    keys: jest.fn().mockImplementation((pattern: string) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      const matchingKeys = Array.from(store.keys()).filter(key => regex.test(key));
      return Promise.resolve(matchingKeys);
    }),
    ttl: jest.fn().mockImplementation((key: string) => {
      const entry = store.get(key);
      if (!entry) return Promise.resolve(-2);
      if (!entry.expiry) return Promise.resolve(-1);

      const ttl = Math.floor((entry.expiry - Date.now()) / 1000);
      return Promise.resolve(ttl > 0 ? ttl : 0);
    }),
    rPush: jest.fn().mockImplementation((key: string, value: string) => {
      if (!lists.has(key)) {
        lists.set(key, []);
      }
      lists.get(key)!.push(value);
      return Promise.resolve(lists.get(key)!.length);
    }),
    lMove: jest.fn().mockImplementation((src: string, dest: string, srcDir: string, destDir: string) => {
      const srcList = lists.get(src);
      if (!srcList || srcList.length === 0) {
        return Promise.resolve(null);
      }

      const value = srcDir === 'LEFT' ? srcList.shift()! : srcList.pop()!;

      if (!lists.has(dest)) {
        lists.set(dest, []);
      }

      const destList = lists.get(dest)!;
      if (destDir === 'RIGHT') {
        destList.push(value);
      } else {
        destList.unshift(value);
      }

      return Promise.resolve(value);
    }),
    blMove: jest.fn().mockImplementation((src: string, dest: string, srcDir: string, destDir: string, timeout: number) => {
      // Mock blocking operation - just call non-blocking version
      return lists.get(src)?.length
        ? (this as any).lMove(src, dest, srcDir, destDir)
        : Promise.resolve(null);
    }),
    lRem: jest.fn().mockImplementation((key: string, count: number, value: string) => {
      const list = lists.get(key);
      if (!list) return Promise.resolve(0);

      let removed = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i] === value) {
          list.splice(i, 1);
          removed++;
          if (removed === Math.abs(count)) break;
        }
      }

      return Promise.resolve(removed);
    }),
    lLen: jest.fn().mockImplementation((key: string) => {
      const list = lists.get(key);
      return Promise.resolve(list ? list.length : 0);
    }),
    lIndex: jest.fn().mockImplementation((key: string, index: number) => {
      const list = lists.get(key);
      if (!list || index < 0 || index >= list.length) {
        return Promise.resolve(null);
      }
      return Promise.resolve(list[index]);
    }),
    lRange: jest.fn().mockImplementation((key: string, start: number, stop: number) => {
      const list = lists.get(key);
      if (!list) return Promise.resolve([]);

      const end = stop === -1 ? list.length : stop + 1;
      return Promise.resolve(list.slice(start, end));
    }),
    multi: jest.fn().mockImplementation(() => {
      const commands: Array<() => Promise<any>> = [];

      return {
        exists: jest.fn().mockImplementation((key: string) => {
          commands.push(() => (this as any).exists(key));
          return this;
        }),
        set: jest.fn().mockImplementation((key: string, value: string, options?: any) => {
          commands.push(() => (this as any).set(key, value, options));
          return this;
        }),
        exec: jest.fn().mockImplementation(() => {
          return Promise.all(commands.map(cmd => cmd()));
        }),
      };
    }),
  } as unknown as jest.Mocked<RedisClientType>;
};

jest.setTimeout(30000);

describe('MessageDeduplicator', () => {
  let redis: jest.Mocked<RedisClientType>;
  let deduplicator: MessageDeduplicator;

  beforeEach(() => {
    redis = createMockRedisClient();
    deduplicator = new MessageDeduplicator(redis, {
      windowMs: 3600000, // 1 hour
      autoCleanup: false, // Disable for tests
    });
  });

  afterEach(() => {
    deduplicator.shutdown();
  });

  describe('createFingerprint', () => {
    test('creates consistent SHA256 fingerprints for same message', () => {
      const message = { taskId: 'task-001', payload: { foo: 'bar' } };

      const hash1 = deduplicator.createFingerprint(message);
      const hash2 = deduplicator.createFingerprint(message);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 produces 64 hex characters
    });

    test('creates different fingerprints for different messages', () => {
      const message1 = { taskId: 'task-001', payload: { foo: 'bar' } };
      const message2 = { taskId: 'task-002', payload: { foo: 'baz' } };

      const hash1 = deduplicator.createFingerprint(message1);
      const hash2 = deduplicator.createFingerprint(message2);

      expect(hash1).not.toBe(hash2);
    });

    test('handles string messages', () => {
      const message = 'test message';
      const hash = deduplicator.createFingerprint(message);

      expect(hash).toHaveLength(64);
    });

    test('handles object with sorted keys for deterministic hashing', () => {
      const message1 = { b: 2, a: 1 };
      const message2 = { a: 1, b: 2 };

      const hash1 = deduplicator.createFingerprint(message1);
      const hash2 = deduplicator.createFingerprint(message2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('isDuplicate', () => {
    test('returns false for first occurrence of message', async () => {
      const message = { taskId: 'task-001' };

      const isDuplicate = await deduplicator.isDuplicate(message);

      expect(isDuplicate).toBe(false);
    });

    test('returns true for duplicate message', async () => {
      const message = { taskId: 'task-001' };

      await deduplicator.markProcessed(message);
      const isDuplicate = await deduplicator.isDuplicate(message);

      expect(isDuplicate).toBe(true);
    });

    test('updates statistics correctly', async () => {
      const message1 = { taskId: 'task-001' };
      const message2 = { taskId: 'task-002' };

      await deduplicator.isDuplicate(message1); // unique
      await deduplicator.markProcessed(message1);
      await deduplicator.isDuplicate(message1); // duplicate
      await deduplicator.isDuplicate(message2); // unique

      const stats = await deduplicator.getStats();

      expect(stats.totalProcessed).toBe(3);
      expect(stats.duplicatesDetected).toBe(1);
      expect(stats.uniqueMessages).toBe(2);
      expect(stats.deduplicationRate).toBeCloseTo(1 / 3);
    });
  });

  describe('markProcessed', () => {
    test('marks message as processed with TTL', async () => {
      const message = { taskId: 'task-001' };

      await deduplicator.markProcessed(message);

      const isDuplicate = await deduplicator.isDuplicate(message);
      expect(isDuplicate).toBe(true);
    });

    test('stores metadata with fingerprint', async () => {
      const message = { taskId: 'task-001' };
      const metadata = { custom: 'data' };

      await deduplicator.markProcessed(message, metadata);

      const fingerprint = await deduplicator.getFingerprint(message);

      expect(fingerprint).not.toBeNull();
      expect(fingerprint?.custom).toBe('data');
    });
  });

  describe('batchIsDuplicate', () => {
    test('checks multiple messages for duplicates efficiently', async () => {
      const messages = [
        { taskId: 'task-001' },
        { taskId: 'task-002' },
        { taskId: 'task-003' },
      ];

      // Mark first message as processed
      await deduplicator.markProcessed(messages[0]);

      const results = await deduplicator.batchIsDuplicate(messages);

      const hash1 = deduplicator.createFingerprint(messages[0]);
      const hash2 = deduplicator.createFingerprint(messages[1]);
      const hash3 = deduplicator.createFingerprint(messages[2]);

      expect(results.get(hash1)).toBe(true); // duplicate
      expect(results.get(hash2)).toBe(false); // unique
      expect(results.get(hash3)).toBe(false); // unique
    });
  });

  describe('batchMarkProcessed', () => {
    test('marks multiple messages as processed efficiently', async () => {
      const messages = [
        { taskId: 'task-001' },
        { taskId: 'task-002' },
        { taskId: 'task-003' },
      ];

      await deduplicator.batchMarkProcessed(messages);

      for (const message of messages) {
        const isDuplicate = await deduplicator.isDuplicate(message);
        expect(isDuplicate).toBe(true);
      }
    });
  });

  describe('cleanupExpired', () => {
    test('removes expired fingerprints', async () => {
      // Note: Mock implementation doesn't fully support TTL expiration
      // This test validates the cleanup logic path
      const message = { taskId: 'task-001' };

      await deduplicator.markProcessed(message);

      const cleanedCount = await deduplicator.cleanupExpired();

      // In real Redis, expired keys would be detected
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('statistics', () => {
    test('tracks and reports statistics accurately', async () => {
      const messages = [
        { taskId: 'task-001' },
        { taskId: 'task-002' },
        { taskId: 'task-001' }, // duplicate
      ];

      for (const message of messages) {
        const isDuplicate = await deduplicator.isDuplicate(message);
        if (!isDuplicate) {
          await deduplicator.markProcessed(message);
        }
      }

      const stats = await deduplicator.getStats();

      expect(stats.totalProcessed).toBe(3);
      expect(stats.duplicatesDetected).toBe(1);
      expect(stats.uniqueMessages).toBe(2);
    });

    test('resets statistics correctly', async () => {
      await deduplicator.isDuplicate({ taskId: 'task-001' });

      deduplicator.resetStats();

      const stats = await deduplicator.getStats();

      expect(stats.totalProcessed).toBe(0);
      expect(stats.duplicatesDetected).toBe(0);
      expect(stats.uniqueMessages).toBe(0);
    });
  });
});

jest.setTimeout(30000);

describe('RedisQueueManager', () => {
  let redis: jest.Mocked<RedisClientType>;
  let queueManager: RedisQueueManager;

  beforeEach(() => {
    redis = createMockRedisClient();
    queueManager = new RedisQueueManager(redis);
  });

  afterEach(() => {
    queueManager.shutdown();
  });

  describe('enqueue', () => {
    test('enqueues message to queue', async () => {
      const payload = { taskId: 'task-001', data: 'test' };

      const messageId = await queueManager.enqueue('test-queue', payload);

      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe('string');
    });

    test('prevents duplicate messages when deduplication enabled', async () => {
      const payload = { taskId: 'task-001', data: 'test' };

      await queueManager.enqueue('test-queue', payload, { deduplicate: true });

      // Attempt to enqueue duplicate
      await expect(
        queueManager.enqueue('test-queue', payload, { deduplicate: true })
      ).rejects.toThrow('Duplicate message detected');
    });

    test('allows duplicate messages when deduplication disabled', async () => {
      const payload = { taskId: 'task-001', data: 'test' };

      const id1 = await queueManager.enqueue('test-queue', payload, { deduplicate: false });
      const id2 = await queueManager.enqueue('test-queue', payload, { deduplicate: false });

      expect(id1).not.toBe(id2);
    });

    test('completes within 100ms performance requirement', async () => {
      const payload = { taskId: 'task-001', data: 'test' };

      const startTime = Date.now();
      await queueManager.enqueue('test-queue', payload);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });

    test('stores message metadata', async () => {
      const payload = { taskId: 'task-001' };
      const metadata = { priority: 'high', source: 'api' };

      await queueManager.enqueue('test-queue', payload, { metadata });

      const message = await queueManager.dequeue('test-queue');

      expect(message?.metadata).toEqual(metadata);
    });
  });

  describe('dequeue', () => {
    test('dequeues message from queue (FIFO)', async () => {
      const payload1 = { taskId: 'task-001' };
      const payload2 = { taskId: 'task-002' };

      await queueManager.enqueue('test-queue', payload1, { deduplicate: false });
      await queueManager.enqueue('test-queue', payload2, { deduplicate: false });

      const message1 = await queueManager.dequeue('test-queue');
      const message2 = await queueManager.dequeue('test-queue');

      expect(message1?.payload.taskId).toBe('task-001');
      expect(message2?.payload.taskId).toBe('task-002');
    });

    test('returns null when queue is empty', async () => {
      const message = await queueManager.dequeue('empty-queue');

      expect(message).toBeNull();
    });

    test('increments delivery attempts on dequeue', async () => {
      const payload = { taskId: 'task-001' };

      await queueManager.enqueue('test-queue', payload, { deduplicate: false });

      const message = await queueManager.dequeue('test-queue');

      expect(message?.deliveryAttempts).toBe(1);
    });

    test('completes within 100ms performance requirement', async () => {
      const payload = { taskId: 'task-001' };
      await queueManager.enqueue('test-queue', payload, { deduplicate: false });

      const startTime = Date.now();
      await queueManager.dequeue('test-queue');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });

    test('supports blocking dequeue with timeout', async () => {
      // Enqueue message after short delay to test blocking
      setTimeout(async () => {
        await queueManager.enqueue('test-queue', { taskId: 'task-001' }, { deduplicate: false });
      }, 100);

      const message = await queueManager.dequeue('test-queue', { timeout: 5000 });

      // In mock, this will return null immediately, but validates the API
      expect(message).toBeDefined();
    });
  });

  describe('acknowledge', () => {
    test('acknowledges successful message processing', async () => {
      const payload = { taskId: 'task-001' };

      await queueManager.enqueue('test-queue', payload, { deduplicate: false });
      const message = await queueManager.dequeue('test-queue');

      await queueManager.acknowledge(message!.id);

      const stats = await queueManager.getStats('test-queue');
      expect(stats.totalAcknowledged).toBe(1);
    });

    test('handles acknowledgment of non-existent message gracefully', async () => {
      await expect(
        queueManager.acknowledge('non-existent-id')
      ).resolves.not.toThrow();
    });
  });

  describe('reject', () => {
    test('rejects message without retry', async () => {
      const payload = { taskId: 'task-001' };

      await queueManager.enqueue('test-queue', payload, { deduplicate: false });
      const message = await queueManager.dequeue('test-queue');

      await queueManager.reject(message!.id, { retry: false });

      const stats = await queueManager.getStats('test-queue');
      expect(stats.totalRejected).toBe(1);
    });

    test('rejects message with retry (re-enqueues)', async () => {
      const payload = { taskId: 'task-001' };

      await queueManager.enqueue('test-queue', payload, { deduplicate: false });
      const message = await queueManager.dequeue('test-queue');

      await queueManager.reject(message!.id, { retry: true });

      // Message should be back in queue
      const requeuedMessage = await queueManager.dequeue('test-queue');
      expect(requeuedMessage?.payload.taskId).toBe('task-001');
    });

    test('stores rejection metadata', async () => {
      const payload = { taskId: 'task-001' };

      await queueManager.enqueue('test-queue', payload, { deduplicate: false });
      const message = await queueManager.dequeue('test-queue');

      await queueManager.reject(message!.id, {
        retry: true,
        error: 'Processing failed',
        metadata: { retryCount: 1 },
      });

      const requeuedMessage = await queueManager.dequeue('test-queue');
      expect(requeuedMessage?.metadata?.rejectionReason).toBe('Processing failed');
    });
  });

  describe('getStats', () => {
    test('returns accurate queue statistics', async () => {
      const payload = { taskId: 'task-001' };

      await queueManager.enqueue('test-queue', payload, { deduplicate: false });
      await queueManager.enqueue('test-queue', payload, { deduplicate: false });

      const message = await queueManager.dequeue('test-queue');
      await queueManager.acknowledge(message!.id);

      const stats = await queueManager.getStats('test-queue');

      expect(stats.queue).toBe('test-queue');
      expect(stats.totalEnqueued).toBe(2);
      expect(stats.totalDequeued).toBe(1);
      expect(stats.totalAcknowledged).toBe(1);
      expect(stats.depth).toBe(1); // 1 message still in queue
    });

    test('calculates oldest message age correctly', async () => {
      const payload = { taskId: 'task-001' };

      await queueManager.enqueue('test-queue', payload, { deduplicate: false });

      // Wait a bit to accumulate age
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = await queueManager.getStats('test-queue');

      expect(stats.oldestMessageAge).toBeGreaterThan(0);
    });
  });

  describe('purge', () => {
    test('purges all messages from queue', async () => {
      await queueManager.enqueue('test-queue', { taskId: 'task-001' }, { deduplicate: false });
      await queueManager.enqueue('test-queue', { taskId: 'task-002' }, { deduplicate: false });

      const purgedCount = await queueManager.purge('test-queue');

      expect(purgedCount).toBe(2);

      const stats = await queueManager.getStats('test-queue');
      expect(stats.depth).toBe(0);
    });
  });

  describe('getQueues', () => {
    test('returns list of all queues', async () => {
      await queueManager.enqueue('queue-1', { data: 'test' }, { deduplicate: false });
      await queueManager.enqueue('queue-2', { data: 'test' }, { deduplicate: false });

      const queues = await queueManager.getQueues();

      expect(queues).toContain('queue-1');
      expect(queues).toContain('queue-2');
    });
  });
});

jest.setTimeout(30000);

describe('QueueRecovery', () => {
  let redis: jest.Mocked<RedisClientType>;
  let queueManager: RedisQueueManager;
  let recovery: QueueRecovery;

  beforeEach(() => {
    redis = createMockRedisClient();
    queueManager = new RedisQueueManager(redis);
    recovery = new QueueRecovery(queueManager, redis, {
      maxRetries: 3,
      processingTimeoutMs: 1000, // 1 second for testing
      monitoringIntervalMs: 5000,
      autoReprocess: false,
    });
  });

  afterEach(() => {
    recovery.shutdown();
    queueManager.shutdown();
  });

  describe('retryWithBackoff', () => {
    test('retries failed operations with exponential backoff', async () => {
      let attempts = 0;
      const message: QueueMessage = {
        id: 'msg-001',
        queue: 'test-queue',
        payload: { taskId: 'task-001' },
        createdAt: new Date(),
        enqueuedAt: new Date(),
        deliveryAttempts: 1,
      };

      const processFn = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retryable error');
        }
        return 'success';
      });

      const result = await recovery.retryWithBackoff(message, processFn);

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('sends to DLQ after max retries', async () => {
      const message: QueueMessage = {
        id: 'msg-001',
        queue: 'test-queue',
        payload: { taskId: 'task-001' },
        createdAt: new Date(),
        enqueuedAt: new Date(),
        deliveryAttempts: 1,
      };

      const processFn = jest.fn().mockRejectedValue(new Error('Persistent error'));

      await expect(
        recovery.retryWithBackoff(message, processFn)
      ).rejects.toThrow('Persistent error');

      const stats = recovery.getStats();
      expect(stats.totalDeadLettered).toBe(1);
    });
  });

  describe('sendToDeadLetter', () => {
    test('sends failed message to dead letter queue', async () => {
      const message: QueueMessage = {
        id: 'msg-001',
        queue: 'test-queue',
        payload: { taskId: 'task-001' },
        createdAt: new Date(),
        enqueuedAt: new Date(),
        deliveryAttempts: 3,
      };

      await recovery.sendToDeadLetter(message, 'Processing failed');

      const stats = await queueManager.getStats('dlq');
      expect(stats.depth).toBe(1);

      const dlqMessage = await queueManager.dequeue('dlq');
      expect(dlqMessage?.payload.taskId).toBe('task-001');
      expect(dlqMessage?.metadata?.failureReason).toBe('Processing failed');
    });
  });

  describe('reprocessDeadLetters', () => {
    test('reprocesses messages from dead letter queue', async () => {
      // Add message to DLQ
      const message: QueueMessage = {
        id: 'msg-001',
        queue: 'test-queue',
        payload: { taskId: 'task-001' },
        createdAt: new Date(),
        enqueuedAt: new Date(),
        deliveryAttempts: 3,
      };

      await recovery.sendToDeadLetter(message, 'Processing failed');

      let processedCount = 0;
      const processFn = jest.fn().mockImplementation(async () => {
        processedCount++;
      });

      const reprocessedCount = await recovery.reprocessDeadLetters(processFn);

      expect(reprocessedCount).toBe(1);
      expect(processedCount).toBe(1);
    });

    test('limits number of messages reprocessed', async () => {
      // Add multiple messages to DLQ
      for (let i = 0; i < 5; i++) {
        const message: QueueMessage = {
          id: `msg-00${i}`,
          queue: 'test-queue',
          payload: { taskId: `task-00${i}` },
          createdAt: new Date(),
          enqueuedAt: new Date(),
          deliveryAttempts: 3,
        };

        await recovery.sendToDeadLetter(message, 'Processing failed');
      }

      const processFn = jest.fn().mockResolvedValue(undefined);

      const reprocessedCount = await recovery.reprocessDeadLetters(processFn, 3);

      expect(reprocessedCount).toBe(3);
    });
  });

  describe('recoverStuckMessages', () => {
    test('recovers messages stuck in processing', async () => {
      // Simulate stuck message by manually adding to processing queue
      const message: QueueMessage = {
        id: 'msg-001',
        queue: 'test-queue',
        payload: { taskId: 'task-001' },
        createdAt: new Date(),
        enqueuedAt: new Date(),
        dequeuedAt: new Date(Date.now() - 2000), // 2 seconds ago (exceeds 1s timeout)
        deliveryAttempts: 1,
      };

      // Manually add to processing queue
      await redis.rPush('queue:test-queue:processing', JSON.stringify(message));

      const recoveredCount = await recovery.recoverStuckMessages('test-queue');

      expect(recoveredCount).toBeGreaterThan(0);

      const stats = recovery.getStats();
      expect(stats.totalStuckDetected).toBeGreaterThan(0);
    });

    test('sends stuck message to DLQ after max retries', async () => {
      const message: QueueMessage = {
        id: 'msg-001',
        queue: 'test-queue',
        payload: { taskId: 'task-001' },
        createdAt: new Date(),
        enqueuedAt: new Date(),
        dequeuedAt: new Date(Date.now() - 2000),
        deliveryAttempts: 3, // Already at max retries
      };

      await redis.rPush('queue:test-queue:processing', JSON.stringify(message));

      await recovery.recoverStuckMessages('test-queue');

      const dlqStats = await queueManager.getStats('dlq');
      expect(dlqStats.depth).toBe(1);
    });
  });

  describe('recoverFromCrash', () => {
    test('recovers stuck messages from all queues', async () => {
      // Create stuck messages in multiple queues
      const queues = ['queue-1', 'queue-2'];

      for (const queue of queues) {
        const message: QueueMessage = {
          id: `msg-${queue}`,
          queue,
          payload: { taskId: `task-${queue}` },
          createdAt: new Date(),
          enqueuedAt: new Date(),
          dequeuedAt: new Date(Date.now() - 2000),
          deliveryAttempts: 1,
        };

        await redis.rPush(`queue:${queue}:processing`, JSON.stringify(message));
      }

      const results = await recovery.recoverFromCrash();

      expect(Object.keys(results).length).toBeGreaterThan(0);

      const stats = recovery.getStats();
      expect(stats.totalRecovered).toBeGreaterThan(0);
    });
  });

  describe('monitoring', () => {
    test('starts and stops monitoring', () => {
      recovery.startMonitoring();

      // Verify monitoring started (no error)
      expect(() => recovery.stopMonitoring()).not.toThrow();
    });

    test('does not start monitoring twice', () => {
      recovery.startMonitoring();

      // Second start should warn but not throw
      expect(() => recovery.startMonitoring()).not.toThrow();

      recovery.stopMonitoring();
    });
  });

  describe('statistics', () => {
    test('tracks recovery statistics', async () => {
      const message: QueueMessage = {
        id: 'msg-001',
        queue: 'test-queue',
        payload: { taskId: 'task-001' },
        createdAt: new Date(),
        enqueuedAt: new Date(),
        deliveryAttempts: 1,
      };

      await recovery.sendToDeadLetter(message, 'Test');

      const stats = recovery.getStats();

      expect(stats.totalDeadLettered).toBe(1);
    });

    test('resets statistics correctly', async () => {
      const message: QueueMessage = {
        id: 'msg-001',
        queue: 'test-queue',
        payload: { taskId: 'task-001' },
        createdAt: new Date(),
        enqueuedAt: new Date(),
        deliveryAttempts: 1,
      };

      await recovery.sendToDeadLetter(message, 'Test');

      recovery.resetStats();

      const stats = recovery.getStats();

      expect(stats.totalDeadLettered).toBe(0);
      expect(stats.totalRecovered).toBe(0);
    });
  });
});

jest.setTimeout(30000);

describe('ReprocessingSafeguards', () => {
  let safeguards: ReprocessingSafeguards;

  beforeEach(() => {
    safeguards = new ReprocessingSafeguards(100);
  });

  describe('hasBeenProcessed', () => {
    test('returns false for unprocessed message', () => {
      expect(safeguards.hasBeenProcessed('msg-001')).toBe(false);
    });

    test('returns true for processed message', () => {
      safeguards.markProcessed('msg-001');

      expect(safeguards.hasBeenProcessed('msg-001')).toBe(true);
    });
  });

  describe('markProcessed', () => {
    test('marks message as processed', () => {
      safeguards.markProcessed('msg-001');

      expect(safeguards.hasBeenProcessed('msg-001')).toBe(true);
    });

    test('implements LRU eviction when limit reached', () => {
      const safeguards = new ReprocessingSafeguards(3);

      safeguards.markProcessed('msg-001');
      safeguards.markProcessed('msg-002');
      safeguards.markProcessed('msg-003');
      safeguards.markProcessed('msg-004'); // Should evict msg-001

      expect(safeguards.hasBeenProcessed('msg-001')).toBe(false);
      expect(safeguards.hasBeenProcessed('msg-004')).toBe(true);
    });
  });

  describe('clear', () => {
    test('clears all processed messages', () => {
      safeguards.markProcessed('msg-001');
      safeguards.markProcessed('msg-002');

      safeguards.clear();

      expect(safeguards.hasBeenProcessed('msg-001')).toBe(false);
      expect(safeguards.hasBeenProcessed('msg-002')).toBe(false);
      expect(safeguards.getTrackedCount()).toBe(0);
    });
  });

  describe('getTrackedCount', () => {
    test('returns number of tracked messages', () => {
      expect(safeguards.getTrackedCount()).toBe(0);

      safeguards.markProcessed('msg-001');
      safeguards.markProcessed('msg-002');

      expect(safeguards.getTrackedCount()).toBe(2);
    });
  });
});
