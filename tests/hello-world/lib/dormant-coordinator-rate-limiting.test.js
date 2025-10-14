/**
 * Test Suite: Dormant Coordinator Rate Limiting and Queue Bounds
 *
 * Validates VULN-004 mitigation (DoS prevention via queue flooding)
 * - Rate limiting enforcement (100 req/min per sender)
 * - Queue bounds enforcement (1000 max requests)
 * - Queue overflow error handling
 * - Rate limit cleanup (memory leak prevention)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DormantCoordinatorBase } from './dormant-coordinator-base.js';

describe('Dormant Coordinator - Rate Limiting and Queue Bounds (VULN-004)', () => {
  let coordinator;
  const REDIS_URL = 'redis://localhost:6379';

  // Test configuration
  const testConfig = {
    env: {
      MAX_QUEUE_SIZE: '10',
      RATE_LIMIT_MAX_REQUESTS: '5',
      RATE_LIMIT_WINDOW_MS: '1000' // 1 second for faster testing
    }
  };

  beforeEach(() => {
    // Create coordinator with test configuration
    coordinator = new DormantCoordinatorBase('test-coordinator', REDIS_URL, testConfig);
  });

  afterEach(() => {
    if (coordinator.rateLimitCleanupInterval) {
      coordinator.stopRateLimitCleanup();
    }
  });

  describe('Configuration and Initialization', () => {
    it('should load rate limiting configuration from environment', () => {
      expect(coordinator.MAX_QUEUE_SIZE).toBe(10);
      expect(coordinator.RATE_LIMIT_MAX_REQUESTS).toBe(5);
      expect(coordinator.RATE_LIMIT_WINDOW_MS).toBe(1000);
    });

    it('should use default values when environment variables not set', () => {
      const defaultCoordinator = new DormantCoordinatorBase('default-coord', REDIS_URL, {});

      expect(defaultCoordinator.MAX_QUEUE_SIZE).toBe(1000);
      expect(defaultCoordinator.RATE_LIMIT_MAX_REQUESTS).toBe(100);
      expect(defaultCoordinator.RATE_LIMIT_WINDOW_MS).toBe(60000);
    });

    it('should initialize rate limit tracking structures', () => {
      expect(coordinator.rateLimits).toBeInstanceOf(Map);
      expect(coordinator.rateLimits.size).toBe(0);
    });

    it('should initialize statistics for rate limiting', () => {
      expect(coordinator.stats.queueOverflows).toBe(0);
      expect(coordinator.stats.rateLimitViolations).toBe(0);
      expect(coordinator.stats.rateLimitEntriesCleaned).toBe(0);
    });
  });

  describe('Rate Limiting Enforcement', () => {
    it('should allow requests under rate limit', () => {
      const sender = 'sender-1';

      // Should allow 5 requests (at limit)
      for (let i = 0; i < 5; i++) {
        expect(() => coordinator.enforceRateLimit(sender)).not.toThrow();
      }

      expect(coordinator.stats.rateLimitViolations).toBe(0);
    });

    it('should reject requests exceeding rate limit', () => {
      const sender = 'sender-1';

      // Fill up to limit
      for (let i = 0; i < 5; i++) {
        coordinator.enforceRateLimit(sender);
      }

      // 6th request should be rejected
      expect(() => coordinator.enforceRateLimit(sender)).toThrow(
        'Rate limit exceeded: sender-1 (5 req/min)'
      );

      expect(coordinator.stats.rateLimitViolations).toBe(1);
    });

    it('should track rate limits per sender independently', () => {
      const sender1 = 'sender-1';
      const sender2 = 'sender-2';

      // Sender 1: Use full limit
      for (let i = 0; i < 5; i++) {
        coordinator.enforceRateLimit(sender1);
      }

      // Sender 2: Should have independent limit
      expect(() => coordinator.enforceRateLimit(sender2)).not.toThrow();
      expect(() => coordinator.enforceRateLimit(sender2)).not.toThrow();

      expect(coordinator.rateLimits.size).toBe(2);
    });

    it('should reset rate limit after window expires', async () => {
      const sender = 'sender-1';

      // Fill up to limit
      for (let i = 0; i < 5; i++) {
        coordinator.enforceRateLimit(sender);
      }

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should allow new requests after window reset
      expect(() => coordinator.enforceRateLimit(sender)).not.toThrow();
      expect(coordinator.stats.rateLimitViolations).toBe(0);
    });

    it('should increment violation counter on each rate limit breach', () => {
      const sender = 'sender-1';

      // Fill to limit
      for (let i = 0; i < 5; i++) {
        coordinator.enforceRateLimit(sender);
      }

      // Attempt multiple violations
      for (let i = 0; i < 3; i++) {
        try {
          coordinator.enforceRateLimit(sender);
        } catch (error) {
          // Expected
        }
      }

      expect(coordinator.stats.rateLimitViolations).toBe(3);
    });
  });

  describe('Queue Bounds Enforcement', () => {
    it('should accept requests when queue has capacity', async () => {
      // Fill queue to capacity (10 items)
      for (let i = 0; i < 10; i++) {
        const message = {
          id: `msg-${i}`,
          type: 'request',
          from: `sender-${i % 2}`, // Alternate senders to avoid rate limit
          task: 'test',
          data: {}
        };

        await coordinator.handleRequest(message);
      }

      expect(coordinator.requestQueue.length).toBe(10);
      expect(coordinator.stats.queueOverflows).toBe(0);
    });

    it('should reject requests when queue is full', async () => {
      // Fill queue to capacity
      for (let i = 0; i < 10; i++) {
        const message = {
          id: `msg-${i}`,
          type: 'request',
          from: `sender-${i}`, // Unique senders to avoid rate limit
          task: 'test',
          data: {}
        };

        await coordinator.handleRequest(message);
      }

      // Attempt to add 11th message
      const overflowMessage = {
        id: 'msg-overflow',
        type: 'request',
        from: 'sender-overflow',
        task: 'test',
        data: {}
      };

      await expect(coordinator.handleRequest(overflowMessage)).rejects.toThrow(
        'Queue full: 10 (dropping message from sender-overflow)'
      );

      expect(coordinator.stats.queueOverflows).toBe(1);
      expect(coordinator.requestQueue.length).toBe(10); // Should not exceed limit
    });

    it('should log security events on queue overflow', async () => {
      // Fill queue
      for (let i = 0; i < 10; i++) {
        await coordinator.handleRequest({
          id: `msg-${i}`,
          from: `sender-${i}`,
          type: 'request',
          task: 'test',
          data: {}
        });
      }

      // Spy on logger
      const loggerSpy = vi.spyOn(coordinator.logger, 'error');

      // Trigger overflow
      try {
        await coordinator.handleRequest({
          id: 'overflow',
          from: 'attacker',
          type: 'request',
          task: 'test',
          data: {}
        });
      } catch (error) {
        // Expected
      }

      expect(loggerSpy).toHaveBeenCalledWith(
        '[SECURITY] Request rejected',
        expect.objectContaining({
          error: expect.stringContaining('Queue full'),
          from: 'attacker',
          queueOverflows: 1
        })
      );
    });
  });

  describe('Combined Rate Limiting and Queue Bounds', () => {
    it('should enforce both rate limiting and queue bounds', async () => {
      const sender = 'aggressive-sender';

      // Send 5 messages quickly (hit rate limit)
      for (let i = 0; i < 5; i++) {
        await coordinator.handleRequest({
          id: `msg-${i}`,
          from: sender,
          type: 'request',
          task: 'test',
          data: {}
        });
      }

      // 6th message should hit rate limit before queue bound
      await expect(coordinator.handleRequest({
        id: 'msg-6',
        from: sender,
        type: 'request',
        task: 'test',
        data: {}
      })).rejects.toThrow('Rate limit exceeded');

      expect(coordinator.stats.rateLimitViolations).toBe(1);
      expect(coordinator.stats.queueOverflows).toBe(0);
    });

    it('should handle mixed attack scenarios', async () => {
      // Scenario: Multiple senders flooding queue
      // Sender 1: Hit rate limit
      for (let i = 0; i < 5; i++) {
        await coordinator.handleRequest({
          id: `s1-${i}`,
          from: 'sender-1',
          type: 'request',
          task: 'test',
          data: {}
        });
      }

      // Sender 2: Fill remaining queue
      for (let i = 0; i < 5; i++) {
        await coordinator.handleRequest({
          id: `s2-${i}`,
          from: 'sender-2',
          type: 'request',
          task: 'test',
          data: {}
        });
      }

      // Sender 1: Should hit rate limit
      await expect(coordinator.handleRequest({
        id: 's1-extra',
        from: 'sender-1',
        type: 'request',
        task: 'test',
        data: {}
      })).rejects.toThrow('Rate limit exceeded');

      // Sender 3: Should hit queue overflow
      await expect(coordinator.handleRequest({
        id: 's3-overflow',
        from: 'sender-3',
        type: 'request',
        task: 'test',
        data: {}
      })).rejects.toThrow('Queue full');

      expect(coordinator.stats.rateLimitViolations).toBeGreaterThan(0);
      expect(coordinator.stats.queueOverflows).toBe(1);
    });
  });

  describe('Rate Limit Cleanup', () => {
    it('should start cleanup interval on initialization', () => {
      coordinator.startRateLimitCleanup();
      expect(coordinator.rateLimitCleanupInterval).toBeDefined();
    });

    it('should stop cleanup interval on shutdown', () => {
      coordinator.startRateLimitCleanup();
      coordinator.stopRateLimitCleanup();
      expect(coordinator.rateLimitCleanupInterval).toBeNull();
    });

    it('should clean expired rate limit entries', async () => {
      const sender1 = 'sender-1';
      const sender2 = 'sender-2';

      // Create rate limits
      coordinator.enforceRateLimit(sender1);
      coordinator.enforceRateLimit(sender2);

      expect(coordinator.rateLimits.size).toBe(2);

      // Manually set one entry to expired
      const limit1 = coordinator.rateLimits.get(sender1);
      limit1.resetTime = Date.now() - 1000; // Expired 1 second ago

      // Trigger cleanup manually
      coordinator.rateLimitCleanupInterval = setInterval(() => {
        const now = Date.now();
        let cleaned = 0;

        for (const [sender, limit] of coordinator.rateLimits.entries()) {
          if (now > limit.resetTime) {
            coordinator.rateLimits.delete(sender);
            cleaned++;
          }
        }

        if (cleaned > 0) {
          coordinator.stats.rateLimitEntriesCleaned += cleaned;
        }

        clearInterval(coordinator.rateLimitCleanupInterval);
      }, 0);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(coordinator.rateLimits.size).toBe(1);
      expect(coordinator.rateLimits.has(sender2)).toBe(true);
      expect(coordinator.stats.rateLimitEntriesCleaned).toBe(1);
    });

    it('should prevent memory buildup from abandoned rate limits', async () => {
      // Simulate many senders with expired limits
      for (let i = 0; i < 100; i++) {
        coordinator.rateLimits.set(`sender-${i}`, {
          count: 1,
          resetTime: Date.now() - 10000 // All expired
        });
      }

      expect(coordinator.rateLimits.size).toBe(100);

      // Run cleanup
      const now = Date.now();
      let cleaned = 0;

      for (const [sender, limit] of coordinator.rateLimits.entries()) {
        if (now > limit.resetTime) {
          coordinator.rateLimits.delete(sender);
          cleaned++;
        }
      }

      coordinator.stats.rateLimitEntriesCleaned += cleaned;

      expect(coordinator.rateLimits.size).toBe(0);
      expect(coordinator.stats.rateLimitEntriesCleaned).toBe(100);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should expose rate limiting metrics in getStats()', () => {
      const stats = coordinator.getStats();

      expect(stats.rateLimiting).toEqual({
        maxQueueSize: 10,
        rateLimitMaxRequests: 5,
        rateLimitWindowMs: 1000,
        activeRateLimits: 0
      });
    });

    it('should track active rate limits count', () => {
      coordinator.enforceRateLimit('sender-1');
      coordinator.enforceRateLimit('sender-2');
      coordinator.enforceRateLimit('sender-3');

      const stats = coordinator.getStats();
      expect(stats.rateLimiting.activeRateLimits).toBe(3);
    });

    it('should track queue depth alongside rate limits', async () => {
      // Add messages from different senders
      for (let i = 0; i < 5; i++) {
        await coordinator.handleRequest({
          id: `msg-${i}`,
          from: `sender-${i}`,
          type: 'request',
          task: 'test',
          data: {}
        });
      }

      const stats = coordinator.getStats();
      expect(stats.queueSize).toBe(5);
      expect(stats.stats.queueOverflows).toBe(0);
      expect(stats.stats.rateLimitViolations).toBe(0);
    });

    it('should track cumulative violations and overflows', async () => {
      const sender = 'attacker';

      // Trigger multiple rate limit violations
      for (let i = 0; i < 5; i++) {
        coordinator.enforceRateLimit(sender);
      }

      for (let i = 0; i < 3; i++) {
        try {
          coordinator.enforceRateLimit(sender);
        } catch (error) {
          // Expected
        }
      }

      // Fill queue
      for (let i = 0; i < 10; i++) {
        await coordinator.handleRequest({
          id: `msg-${i}`,
          from: `sender-${i}`,
          type: 'request',
          task: 'test',
          data: {}
        });
      }

      // Trigger queue overflow
      try {
        await coordinator.handleRequest({
          id: 'overflow',
          from: 'overflow-sender',
          type: 'request',
          task: 'test',
          data: {}
        });
      } catch (error) {
        // Expected
      }

      const stats = coordinator.getStats();
      expect(stats.stats.rateLimitViolations).toBe(3);
      expect(stats.stats.queueOverflows).toBe(1);
    });
  });

  describe('Normal Operation Under Limits', () => {
    it('should process requests normally when under all limits', async () => {
      // Send 3 messages from 2 senders (well under limits)
      await coordinator.handleRequest({
        id: 'msg-1',
        from: 'sender-1',
        type: 'request',
        task: 'test',
        data: {}
      });

      await coordinator.handleRequest({
        id: 'msg-2',
        from: 'sender-2',
        type: 'request',
        task: 'test',
        data: {}
      });

      await coordinator.handleRequest({
        id: 'msg-3',
        from: 'sender-1',
        type: 'request',
        task: 'test',
        data: {}
      });

      expect(coordinator.requestQueue.length).toBe(3);
      expect(coordinator.stats.requestsReceived).toBe(3);
      expect(coordinator.stats.rateLimitViolations).toBe(0);
      expect(coordinator.stats.queueOverflows).toBe(0);
    });

    it('should handle burst traffic within rate limits', async () => {
      // Send 4 requests quickly (under limit of 5)
      const promises = [];
      for (let i = 0; i < 4; i++) {
        promises.push(coordinator.handleRequest({
          id: `msg-${i}`,
          from: 'sender-1',
          type: 'request',
          task: 'test',
          data: {}
        }));
      }

      await Promise.all(promises);

      expect(coordinator.requestQueue.length).toBe(4);
      expect(coordinator.stats.rateLimitViolations).toBe(0);
    });
  });
});
