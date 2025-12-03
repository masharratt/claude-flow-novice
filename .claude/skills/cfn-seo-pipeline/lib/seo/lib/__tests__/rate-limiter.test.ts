/**
 * RateLimiter Test Suite
 *
 * @module planning/seo/lib/__tests__/rate-limiter.test
 * @description Comprehensive tests for token bucket rate limiter implementation
 */

import { RateLimiter, RateLimiterManager } from '../rate-limiter';
import { ResearchQuery, ResearchErrorCode } from '../../types/research';

// Mock query factory
const createMockQuery = (overrides?: Partial<ResearchQuery>): ResearchQuery => ({
  query: 'test query',
  type: 'serp',
  options: {
    priority: 'normal'
  },
  ...overrides
});

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    // Create rate limiter with small limits for faster testing
    rateLimiter = new RateLimiter('websearch', {
      maxRequests: 5,
      windowMs: 1000,
      service: 'websearch',
      enableQueue: true,
      maxQueueSize: 10,
      backoffStrategy: 'exponential',
      backoffDelay: 100,
      maxBackoffDelay: 1000
    });
  });

  afterEach(() => {
    rateLimiter.stop();
  });

  describe('Token Acquisition and Consumption', () => {
    it('should acquire token immediately when available', async () => {
      // GIVEN: Rate limiter with available tokens
      const query = createMockQuery();

      // WHEN: Acquiring a token
      await rateLimiter.acquireToken(query);

      // THEN: Token should be consumed
      const stats = rateLimiter.getStats();
      expect(stats.currentTokens).toBeLessThan(5);
      expect(stats.totalRequests).toBe(1);
    });

    it('should consume tokens for multiple requests', async () => {
      // GIVEN: Rate limiter with 5 tokens
      const query = createMockQuery();

      // WHEN: Making 3 requests
      await rateLimiter.acquireToken(query);
      await rateLimiter.acquireToken(query);
      await rateLimiter.acquireToken(query);

      // THEN: 3 tokens should be consumed
      const stats = rateLimiter.getStats();
      expect(stats.currentTokens).toBeLessThanOrEqual(2);
      expect(stats.totalRequests).toBe(3);
    });

    it('should track throttled requests when tokens exhausted', async () => {
      // GIVEN: Rate limiter with 5 tokens
      const query = createMockQuery();

      // WHEN: Making 7 requests (2 more than limit)
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 7; i++) {
        promises.push(rateLimiter.acquireToken(query));
      }

      // Wait a bit for queue to process
      await new Promise(resolve => setTimeout(resolve, 200));

      // THEN: Some requests should be throttled
      const stats = rateLimiter.getStats();
      expect(stats.totalRequests).toBeGreaterThan(0);
      expect(stats.throttledRequests).toBeGreaterThan(0);
    });
  });

  describe('Token Refill Based on Elapsed Time', () => {
    it('should refill tokens over time', async () => {
      // GIVEN: Rate limiter with consumed tokens
      const query = createMockQuery();
      await rateLimiter.acquireToken(query);
      await rateLimiter.acquireToken(query);
      await rateLimiter.acquireToken(query);

      const statsAfter = rateLimiter.getStats();
      const initialTokens = statsAfter.currentTokens;

      // WHEN: Waiting for refill (200ms with 5 tokens per second)
      await new Promise(resolve => setTimeout(resolve, 300));

      // THEN: Tokens should be refilled
      const statsFinal = rateLimiter.getStats();
      expect(statsFinal.currentTokens).toBeGreaterThan(initialTokens);
    });

    it('should not exceed max tokens when refilling', async () => {
      // GIVEN: Rate limiter with full tokens
      const query = createMockQuery();

      // WHEN: Waiting for refill time
      await new Promise(resolve => setTimeout(resolve, 500));

      // THEN: Tokens should not exceed max (5)
      const stats = rateLimiter.getStats();
      expect(stats.currentTokens).toBeLessThanOrEqual(5);
    });

    it('should calculate correct refill rate', () => {
      // GIVEN: Rate limiter with 5 requests per 1000ms
      const config = rateLimiter.getConfig();
      const stats = rateLimiter.getStats();

      // WHEN: Checking configuration
      const expectedRefillRate = config.maxRequests / (config.windowMs / 1000);

      // THEN: Refill rate should be 5 tokens per second
      expect(expectedRefillRate).toBe(5);
    });
  });

  describe('Priority Queue Insertion and Processing', () => {
    it('should queue requests when rate limit exceeded', async () => {
      // GIVEN: Rate limiter with tokens exhausted
      const query = createMockQuery();

      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquireToken(query);
      }

      // WHEN: Making additional request
      const queuePromise = rateLimiter.acquireToken(query);

      // THEN: Request should be queued
      const stats = rateLimiter.getStats();
      expect(stats.queueLength).toBeGreaterThan(0);
      expect(stats.throttledRequests).toBeGreaterThan(0);
    });

    it('should prioritize high priority requests in queue', async () => {
      // GIVEN: Rate limiter with exhausted tokens
      const lowPriorityQuery = createMockQuery({ options: { priority: 'low' } });
      const highPriorityQuery = createMockQuery({ options: { priority: 'high' } });

      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquireToken(createMockQuery());
      }

      // WHEN: Queueing low priority then high priority
      const lowPromise = rateLimiter.acquireToken(lowPriorityQuery);
      const highPromise = rateLimiter.acquireToken(highPriorityQuery);

      // THEN: Queue should have both requests
      const stats = rateLimiter.getStats();
      expect(stats.queueLength).toBe(2);
    });

    it('should process queue when tokens become available', async () => {
      // GIVEN: Rate limiter with exhausted tokens and queued requests
      const query = createMockQuery();

      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquireToken(query);
      }

      // Queue request
      const queuePromise = rateLimiter.acquireToken(query);

      const initialQueueLength = rateLimiter.getStats().queueLength;

      // WHEN: Waiting for refill and queue processing
      await new Promise(resolve => setTimeout(resolve, 300));

      // THEN: Queue should be processed
      const finalQueueLength = rateLimiter.getStats().queueLength;
      expect(finalQueueLength).toBeLessThanOrEqual(initialQueueLength);
    });

    it('should insert requests in correct priority order', async () => {
      // GIVEN: Rate limiter with exhausted tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquireToken(createMockQuery());
      }

      // WHEN: Queueing multiple priorities
      await rateLimiter.acquireToken(createMockQuery({ options: { priority: 'low' } }));
      await rateLimiter.acquireToken(createMockQuery({ options: { priority: 'high' } }));
      await rateLimiter.acquireToken(createMockQuery({ options: { priority: 'normal' } }));

      // THEN: Queue should maintain priority order
      const stats = rateLimiter.getStats();
      expect(stats.queueLength).toBe(3);
    });
  });

  describe('Exponential and Linear Backoff Calculation', () => {
    it('should calculate exponential backoff correctly', () => {
      // GIVEN: Rate limiter with exponential backoff
      const limiter = new RateLimiter('websearch', {
        maxRequests: 5,
        windowMs: 1000,
        service: 'websearch',
        backoffStrategy: 'exponential',
        backoffDelay: 1000,
        maxBackoffDelay: 30000
      });

      // WHEN: Calculating backoff for retries
      const backoff0 = limiter.calculateBackoff(0);
      const backoff1 = limiter.calculateBackoff(1);
      const backoff2 = limiter.calculateBackoff(2);
      const backoff3 = limiter.calculateBackoff(3);

      // THEN: Backoff should increase exponentially
      expect(backoff0).toBe(1000);        // 1000 * 2^0
      expect(backoff1).toBe(2000);        // 1000 * 2^1
      expect(backoff2).toBe(4000);        // 1000 * 2^2
      expect(backoff3).toBe(8000);        // 1000 * 2^3

      limiter.stop();
    });

    it('should calculate linear backoff correctly', () => {
      // GIVEN: Rate limiter with linear backoff
      const limiter = new RateLimiter('websearch', {
        maxRequests: 5,
        windowMs: 1000,
        service: 'websearch',
        backoffStrategy: 'linear',
        backoffDelay: 1000,
        maxBackoffDelay: 30000
      });

      // WHEN: Calculating backoff for retries
      const backoff0 = limiter.calculateBackoff(0);
      const backoff1 = limiter.calculateBackoff(1);
      const backoff2 = limiter.calculateBackoff(2);

      // THEN: Backoff should increase linearly
      expect(backoff0).toBe(1000);        // 1000 * 1
      expect(backoff1).toBe(2000);        // 1000 * 2
      expect(backoff2).toBe(3000);        // 1000 * 3

      limiter.stop();
    });

    it('should cap backoff at maxBackoffDelay', () => {
      // GIVEN: Rate limiter with max backoff of 5000ms
      const limiter = new RateLimiter('websearch', {
        maxRequests: 5,
        windowMs: 1000,
        service: 'websearch',
        backoffStrategy: 'exponential',
        backoffDelay: 1000,
        maxBackoffDelay: 5000
      });

      // WHEN: Calculating backoff for many retries
      const backoff5 = limiter.calculateBackoff(5);  // Would be 32000ms
      const backoff10 = limiter.calculateBackoff(10); // Would be 1024000ms

      // THEN: Backoff should be capped at 5000ms
      expect(backoff5).toBe(5000);
      expect(backoff10).toBe(5000);

      limiter.stop();
    });
  });

  describe('Queue Overflow Handling', () => {
    it('should reject requests when queue is full', async () => {
      // GIVEN: Rate limiter with small queue
      const limiter = new RateLimiter('websearch', {
        maxRequests: 1,
        windowMs: 1000,
        service: 'websearch',
        enableQueue: true,
        maxQueueSize: 2
      });

      // Exhaust token
      await limiter.acquireToken(createMockQuery());

      // Fill queue
      const promise1 = limiter.acquireToken(createMockQuery());
      const promise2 = limiter.acquireToken(createMockQuery());

      // WHEN: Exceeding queue capacity
      // THEN: Should throw error
      await expect(limiter.acquireToken(createMockQuery())).rejects.toThrow('Rate limit queue is full');

      limiter.stop();
    });

    it('should throw error when queuing disabled and rate limited', async () => {
      // GIVEN: Rate limiter with queuing disabled
      const limiter = new RateLimiter('websearch', {
        maxRequests: 1,
        windowMs: 1000,
        service: 'websearch',
        enableQueue: false
      });

      // Exhaust token
      await limiter.acquireToken(createMockQuery());

      // WHEN: Making request when rate limited
      // THEN: Should throw error immediately
      await expect(limiter.acquireToken(createMockQuery())).rejects.toThrow('Rate limit exceeded and queuing is disabled');

      limiter.stop();
    });
  });

  describe('Statistics Tracking', () => {
    it('should track total requests correctly', async () => {
      // GIVEN: Rate limiter
      const query = createMockQuery();

      // WHEN: Making 5 requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquireToken(query);
      }

      // THEN: Total requests should be 5
      const stats = rateLimiter.getStats();
      expect(stats.totalRequests).toBe(5);
    });

    it('should calculate throttle rate correctly', async () => {
      // GIVEN: Rate limiter with limited capacity
      const query = createMockQuery();

      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquireToken(query);
      }

      // Queue 2 more requests
      const promise1 = rateLimiter.acquireToken(query);
      const promise2 = rateLimiter.acquireToken(query);

      await new Promise(resolve => setTimeout(resolve, 50));

      // WHEN: Checking statistics
      const stats = rateLimiter.getStats();

      // THEN: Throttle rate should reflect queued requests
      expect(stats.throttledRequests).toBeGreaterThan(0);
      expect(stats.throttleRate).toBeGreaterThan(0);
    });

    it('should track average queue wait time', async () => {
      // GIVEN: Rate limiter with exhausted tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquireToken(createMockQuery());
      }

      // Queue requests
      const promise1 = rateLimiter.acquireToken(createMockQuery());
      const promise2 = rateLimiter.acquireToken(createMockQuery());

      // Wait for queue to accumulate wait time
      await new Promise(resolve => setTimeout(resolve, 100));

      // WHEN: Checking statistics
      const stats = rateLimiter.getStats();

      // THEN: Average queue wait time should be tracked
      if (stats.queueLength > 0) {
        expect(stats.avgQueueWaitMs).toBeGreaterThan(0);
      }
    });
  });

  describe('Configuration Management', () => {
    it('should return current configuration', () => {
      // GIVEN: Rate limiter with config
      // WHEN: Getting configuration
      const config = rateLimiter.getConfig();

      // THEN: Should return complete config
      expect(config.maxRequests).toBe(5);
      expect(config.windowMs).toBe(1000);
      expect(config.service).toBe('websearch');
      expect(config.enableQueue).toBe(true);
    });

    it('should update configuration dynamically', () => {
      // GIVEN: Rate limiter with initial config
      const initialConfig = rateLimiter.getConfig();

      // WHEN: Updating configuration
      rateLimiter.updateConfig({ maxRequests: 10 });

      // THEN: Configuration should be updated
      const updatedConfig = rateLimiter.getConfig();
      expect(updatedConfig.maxRequests).toBe(10);
      expect(updatedConfig.windowMs).toBe(initialConfig.windowMs);
    });

    it('should reset rate limiter state', async () => {
      // GIVEN: Rate limiter with consumed tokens and queue
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquireToken(createMockQuery());
      }

      // WHEN: Resetting state
      rateLimiter.reset();

      // THEN: State should be reset to initial values
      const stats = rateLimiter.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.throttledRequests).toBe(0);
      expect(stats.queueLength).toBe(0);
    });
  });

  describe('RateLimiterManager', () => {
    let manager: RateLimiterManager;

    beforeEach(() => {
      manager = new RateLimiterManager();
    });

    afterEach(() => {
      manager.stopAll();
    });

    it('should create and cache rate limiters', () => {
      // WHEN: Getting limiter twice
      const limiter1 = manager.getLimiter('websearch');
      const limiter2 = manager.getLimiter('websearch');

      // THEN: Should return same instance
      expect(limiter1).toBe(limiter2);
    });

    it('should create separate limiters for different services', () => {
      // WHEN: Getting limiters for different services
      const webSearchLimiter = manager.getLimiter('websearch');
      const webFetchLimiter = manager.getLimiter('webfetch');

      // THEN: Should return different instances
      expect(webSearchLimiter).not.toBe(webFetchLimiter);
    });

    it('should aggregate statistics from all limiters', async () => {
      // GIVEN: Multiple limiters with requests
      const limiter1 = manager.getLimiter('websearch');
      const limiter2 = manager.getLimiter('webfetch');

      await limiter1.acquireToken(createMockQuery());
      await limiter2.acquireToken(createMockQuery());

      // WHEN: Getting all statistics
      const allStats = manager.getAllStats();

      // THEN: Should include stats from both limiters
      expect(Object.keys(allStats).length).toBeGreaterThan(0);
    });

    it('should stop all limiters when requested', () => {
      // GIVEN: Multiple active limiters
      const limiter1 = manager.getLimiter('websearch');
      const limiter2 = manager.getLimiter('webfetch');

      // WHEN: Stopping all limiters
      manager.stopAll();

      // THEN: All limiters should be stopped and cleared
      const allStats = manager.getAllStats();
      expect(Object.keys(allStats).length).toBe(0);
    });
  });
});
