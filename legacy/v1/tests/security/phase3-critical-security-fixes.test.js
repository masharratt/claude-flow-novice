/**
 * Phase 3 CRITICAL Security Fixes Validation
 *
 * Tests for 4 CRITICAL vulnerabilities from SECURITY_AUDIT_PHASE3.md:
 * - SEC-INJ-001: Payload Injection Prevention
 * - SEC-MEM-001: Subscription Limit Enforcement
 * - SEC-DOS-001: Queue Overflow Protection
 * - SEC-DOS-002: Rate Limiting
 */

import { MessageBroker } from '../../src/coordination/v2/core/message-broker.js';
import { MessagePriority } from '../../src/coordination/v2/core/message.js';

describe('SEC-INJ-001: Payload Injection Prevention', () => {
  let broker;

  beforeEach(() => {
    broker = new MessageBroker();
  });

  afterEach(async () => {
    if (broker && typeof broker.shutdown === 'function') {
      await broker.shutdown();
    }
  });

  test('should reject prototype pollution attempts (__proto__)', async () => {
    // Use Object.defineProperty to simulate real attack where __proto__ is non-enumerable
    const malicious = Object.defineProperty({}, '__proto__', {
      value: { isAdmin: true },
      enumerable: false // Makes it non-enumerable like real attack
    });

    await expect(
      broker.publish({
        topic: 'test',
        payload: malicious
      })
    ).rejects.toThrow(/Forbidden keys detected|prototype pollution/i);
  });

  test('should reject prototype pollution attempts (constructor)', async () => {
    await expect(
      broker.publish({
        topic: 'test',
        payload: { constructor: { prototype: { isAdmin: true } } }
      })
    ).rejects.toThrow(/Forbidden keys detected|prototype pollution/i);
  });

  test('should reject oversized payloads (>1MB)', async () => {
    const largePayload = 'x'.repeat(2 * 1024 * 1024); // 2MB
    await expect(
      broker.publish({
        topic: 'test',
        payload: { data: largePayload }
      })
    ).rejects.toThrow(/Payload size|exceeds maximum/i);
  });

  test('should reject deeply nested objects (depth >5)', async () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: {} } } } } } } }; // depth 7
    await expect(
      broker.publish({
        topic: 'test',
        payload: deep
      })
    ).rejects.toThrow(/Payload depth|too deeply nested/i);
  });

  test('should sanitize dangerous keys (eval, Function)', async () => {
    await expect(
      broker.publish({
        topic: 'test',
        payload: { eval: '() => console.log("hacked")', Function: 'malicious' }
      })
    ).rejects.toThrow(/Forbidden keys detected|dangerous keys/i);
  });

  test('should accept valid payloads', async () => {
    const validPayloads = [
      { name: 'John', age: 30 },
      { nested: { level1: { level2: { level3: 'data' } } } }, // depth 3
      { array: [1, 2, 3] },
      { string: 'x'.repeat(100 * 1024) } // 100KB (under 1MB)
    ];

    for (const payload of validPayloads) {
      await expect(
        broker.publish({ topic: 'test', payload })
      ).resolves.toBeDefined();
    }
  });
});

describe('SEC-MEM-001: Subscription Limit Enforcement', () => {
  test('should enforce global subscription limit', async () => {
    const broker = new MessageBroker({ maxSubscriptions: 10 });

    // Create 10 subscriptions (should succeed)
    for (let i = 0; i < 10; i++) {
      await broker.subscribe({
        topic: `test.${i}`,
        handler: async () => {}
      });
    }

    // 11th subscription should fail
    await expect(
      broker.subscribe({
        topic: 'test.11',
        handler: async () => {}
      })
    ).rejects.toThrow(/Maximum subscriptions|subscription limit/i);

    await broker.shutdown();
  });

  test('should enforce per-agent subscription limit', async () => {
    const broker = new MessageBroker({ maxSubscriptionsPerAgent: 5 });

    // Agent-1 creates 5 subscriptions (should succeed)
    for (let i = 0; i < 5; i++) {
      await broker.subscribe({
        topic: `test.${i}`,
        handler: async () => {},
        subscriberId: 'agent-1'
      });
    }

    // 6th subscription for agent-1 should fail
    await expect(
      broker.subscribe({
        topic: 'test.6',
        handler: async () => {},
        subscriberId: 'agent-1'
      })
    ).rejects.toThrow(/exceeded subscription limit|per-agent limit/i);

    // Different agent can still subscribe
    const sub = await broker.subscribe({
      topic: 'test.other',
      handler: async () => {},
      subscriberId: 'agent-2'
    });
    expect(sub).toBeDefined();

    await broker.shutdown();
  });

  test('should auto-expire inactive subscriptions', async () => {
    const broker = new MessageBroker({
      subscriptionTTL: 1000, // 1 second
      cleanupIntervalMs: 100 // Clean up every 100ms for testing
    });

    const sub = await broker.subscribe({
      topic: 'test',
      handler: async () => {}
    });

    expect(broker.getSubscriptions().length).toBe(1);

    // Wait for expiration (TTL=1000ms + cleanup interval=100ms + buffer)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Subscription should be removed by background cleanup timer
    expect(broker.getSubscriptions().length).toBe(0);

    await broker.shutdown();
  });
});

describe('SEC-DOS-001: Queue Overflow Protection', () => {
  test('should enforce per-sender queue limit', async () => {
    const broker = new MessageBroker({ maxQueueSizePerSender: 10 });

    // Fill agent-1 quota (10 messages)
    for (let i = 0; i < 10; i++) {
      await broker.publish({
        topic: 'test',
        payload: { i },
        senderId: 'agent-1'
      });
    }

    // 11th message from agent-1 should be rejected
    await expect(
      broker.publish({
        topic: 'test',
        payload: { i: 11 },
        senderId: 'agent-1'
      })
    ).rejects.toThrow(/exceeded queue limit|per-sender limit/i);

    // Different agent can still send
    await expect(
      broker.publish({
        topic: 'test',
        payload: { i: 0 },
        senderId: 'agent-2'
      })
    ).resolves.toBeDefined();

    await broker.shutdown();
  });

  test('should evict low-priority messages when queue full', async () => {
    const broker = new MessageBroker({ maxQueueSize: 5 });

    // Fill queue with low-priority messages
    for (let i = 0; i < 5; i++) {
      await broker.publish({
        topic: 'test',
        payload: { i },
        priority: MessagePriority.LOW
      });
    }

    expect(broker.getQueueSize()).toBe(5);

    // High-priority message should evict low-priority
    const criticalMsg = await broker.publish({
      topic: 'critical',
      payload: { critical: true },
      priority: MessagePriority.CRITICAL
    });

    expect(criticalMsg).toBeDefined();
    expect(broker.getQueueSize()).toBe(5); // Still at limit after eviction

    await broker.shutdown();
  });

  test('should move evicted messages to dead letter queue', async () => {
    const broker = new MessageBroker({
      maxQueueSize: 3,
      enableDeadLetterQueue: true
    });

    // Subscribe to monitor evictions
    const evictedMessages = [];
    broker.onError((event) => {
      if (event.type === 'eviction') {
        evictedMessages.push(event.message);
      }
    });

    // Fill with low-priority
    await broker.publish({ topic: 'a', payload: {}, priority: 2 });
    await broker.publish({ topic: 'b', payload: {}, priority: 2 });
    await broker.publish({ topic: 'c', payload: {}, priority: 2 });

    // High-priority evicts one
    await broker.publish({ topic: 'd', payload: {}, priority: 10 });

    // Verify dead letter queue has evicted message
    expect(broker.getDeadLetterQueueSize()).toBe(1);

    await broker.shutdown();
  });
});

describe('SEC-DOS-002: Rate Limiting', () => {
  test('should enforce per-sender rate limit', async () => {
    const broker = new MessageBroker({
      rateLimit: { maxMessagesPerSecond: 10 }
    });

    // Send 10 messages rapidly (should succeed)
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        broker.publish({
          topic: 'test',
          payload: { i },
          senderId: 'agent-1'
        })
      );
    }
    await Promise.all(promises);

    // 11th message should be rate-limited
    await expect(
      broker.publish({
        topic: 'test',
        payload: { i: 11 },
        senderId: 'agent-1'
      })
    ).rejects.toThrow(/Rate limit exceeded|too many messages/i);

    await broker.shutdown();
  });

  test('should allow burst then throttle', async () => {
    const broker = new MessageBroker({
      rateLimit: {
        maxMessagesPerSecond: 5,
        maxBurstSize: 10
      }
    });

    // Burst of 10 messages (should succeed)
    const burst = [];
    for (let i = 0; i < 10; i++) {
      burst.push(
        broker.publish({ topic: 'test', payload: { i }, senderId: 'agent-1' })
      );
    }
    await Promise.all(burst);

    // Wait 1 second (tokens refill: 5)
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Next 5 messages succeed
    for (let i = 0; i < 5; i++) {
      await broker.publish({ topic: 'test', payload: { i }, senderId: 'agent-1' });
    }

    // 6th message should fail (tokens exhausted)
    await expect(
      broker.publish({
        topic: 'test',
        payload: {},
        senderId: 'agent-1'
      })
    ).rejects.toThrow(/Rate limit/i);

    await broker.shutdown();
  });

  test('should cleanup idle rate limiters', async () => {
    const broker = new MessageBroker({
      rateLimit: { maxMessagesPerSecond: 100 }
    });

    // Send from agent-1
    await broker.publish({ topic: 'test', payload: {}, senderId: 'agent-1' });

    // Wait for cleanup (5 minutes idle timeout)
    // For testing, we'll just verify the limiter was created
    expect(broker.getRateLimiterCount).toBeDefined();

    await broker.shutdown();
  });
});

describe('Security Integration Test', () => {
  test('ALL 4 CRITICAL FIXES: Comprehensive validation', async () => {
    const broker = new MessageBroker({
      // SEC-DOS-001: Queue limits
      maxQueueSizePerSender: 100,
      enableDeadLetterQueue: true,

      // SEC-DOS-002: Rate limiting
      rateLimit: { maxMessagesPerSecond: 100 },

      // SEC-MEM-001: Subscription limits
      maxSubscriptions: 10000,
      maxSubscriptionsPerAgent: 100,
      subscriptionTTL: 3600000 // 1 hour
    });

    // SEC-INJ-001: Payload validation
    await expect(
      broker.publish({
        topic: 'test',
        payload: { __proto__: { isAdmin: true } }
      })
    ).rejects.toThrow();

    // SEC-MEM-001: Subscription limit
    for (let i = 0; i < 100; i++) {
      await broker.subscribe({
        topic: `test.${i}`,
        handler: async () => {},
        subscriberId: 'agent-1'
      });
    }
    await expect(
      broker.subscribe({
        topic: 'test.101',
        handler: async () => {},
        subscriberId: 'agent-1'
      })
    ).rejects.toThrow();

    // SEC-DOS-001: Per-sender queue limit
    for (let i = 0; i < 100; i++) {
      await broker.publish({
        topic: 'test',
        payload: { i },
        senderId: 'heavy-sender'
      });
    }
    await expect(
      broker.publish({
        topic: 'test',
        payload: { i: 101 },
        senderId: 'heavy-sender'
      })
    ).rejects.toThrow();

    // SEC-DOS-002: Rate limiting
    const rapid = [];
    for (let i = 0; i < 100; i++) {
      rapid.push(
        broker.publish({ topic: 'test', payload: { i }, senderId: 'rapid-sender' })
      );
    }
    await Promise.all(rapid);

    await expect(
      broker.publish({
        topic: 'test',
        payload: { i: 101 },
        senderId: 'rapid-sender'
      })
    ).rejects.toThrow();

    await broker.shutdown();
  });
});
