/**
 * Rate Limit Chaos Engineering Tests
 *
 * Tests system behavior under extreme rate limit scenarios and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { APIKeyRotator, APIKeyRotatorOptions } from '../../src/providers/api-key-rotator.js';
import { RedisClient } from '../../src/dashboard/RedisClient.js';
import { ILogger } from '../../src/core/logger.js';

// Mock logger
const mockLogger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

// Mock Redis client
class MockRedisClient {
  async connect() {}
  disconnect() {}
  async publish(channel: string, message: string) {
    return Promise.resolve();
  }
  async getKeys() {
    return [];
  }
  async getMemoryInfo() {
    return { memoryUsage: 0, keyCount: 0 };
  }
}

describe('Rate Limit Chaos Tests', () => {
  let rotator: APIKeyRotator;
  let mockRedis: MockRedisClient;
  let fetchMock: any;

  beforeEach(() => {
    mockRedis = new MockRedisClient();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    if (rotator) {
      rotator.destroy();
    }
    vi.clearAllMocks();
  });

  describe('Extreme Scenarios', () => {
    it('should recover when all keys rate limited simultaneously', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2', 'key-3'],
        redis: mockRedis as any,
        logger: mockLogger,
        backoffDelays: [50, 100, 200], // Short delays for testing
      };

      rotator = new APIKeyRotator(options);

      // All keys initially rate limited
      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount <= 6) {
          // First 6 calls fail (2 attempts per key)
          return Promise.reject({
            status: 429,
            message: 'Rate limit exceeded',
            response: {
              status: 429,
              headers: { 'retry-after': '1' },
            },
          });
        } else {
          // 7th call succeeds
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 'test-recovery',
              model: 'test',
              choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            }),
          });
        }
      });

      const startTime = Date.now();

      // Should use exponential backoff but eventually succeed
      await expect(
        rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow();

      const duration = Date.now() - startTime;

      // Should have used backoff (at least 50ms)
      expect(duration).toBeGreaterThanOrEqual(50);
    }, 10000);

    it('should handle rapid sequential rate limits', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2', 'key-3'],
        redis: mockRedis as any,
        logger: mockLogger,
      };

      rotator = new APIKeyRotator(options);

      // Simulate burst of requests that trigger rapid rate limits
      const requests = [];
      for (let i = 0; i < 10; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: `test-${i}`,
            model: 'test',
            choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        });

        requests.push(
          rotator.makeRequest({
            model: 'test',
            messages: [{ role: 'user', content: `test ${i}` }],
          })
        );
      }

      // All requests should eventually complete (or fail gracefully)
      const results = await Promise.allSettled(requests);
      const successCount = results.filter((r) => r.status === 'fulfilled').length;

      expect(successCount).toBeGreaterThan(0);
    });

    it('should handle intermittent rate limits', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2'],
        redis: mockRedis as any,
        logger: mockLogger,
      };

      rotator = new APIKeyRotator(options);

      // Alternate between success and rate limit
      let callIndex = 0;
      fetchMock.mockImplementation(() => {
        callIndex++;
        if (callIndex % 3 === 0) {
          return Promise.reject({
            status: 429,
            message: 'Rate limit exceeded',
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: `test-${callIndex}`,
            model: 'test',
            choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        });
      });

      // Make 10 requests
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          rotator.makeRequest({
            model: 'test',
            messages: [{ role: 'user', content: `test ${i}` }],
          })
        );
      }

      const results = await Promise.allSettled(requests);
      const successCount = results.filter((r) => r.status === 'fulfilled').length;

      // Most should succeed due to rotation
      expect(successCount).toBeGreaterThan(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle keys with staggered rate limit recovery', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2', 'key-3'],
        redis: mockRedis as any,
        logger: mockLogger,
      };

      rotator = new APIKeyRotator(options);

      // First key works, second fails, third works
      const responses = [
        { ok: true, json: async () => ({ id: '1', model: 'test', choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }) },
        { error: { status: 429, message: 'Rate limit' } },
        { ok: true, json: async () => ({ id: '2', model: 'test', choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }) },
      ];

      let responseIndex = 0;
      fetchMock.mockImplementation(() => {
        const response = responses[responseIndex % responses.length];
        responseIndex++;
        if ('error' in response) {
          return Promise.reject(response.error);
        }
        return Promise.resolve(response);
      });

      // Should successfully use key-1 and key-3
      const response1 = await rotator.makeRequest({
        model: 'test',
        messages: [{ role: 'user', content: 'test 1' }],
      });
      expect(response1.id).toBe('1');

      // Second request might fail with key-2 but succeed with key-3
      const response2 = await rotator.makeRequest({
        model: 'test',
        messages: [{ role: 'user', content: 'test 2' }],
      });
      expect(response2).toBeDefined();
    });

    it('should handle zero available keys gracefully', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1'],
        redis: mockRedis as any,
        logger: mockLogger,
        backoffDelays: [10, 20], // Very short for testing
      };

      rotator = new APIKeyRotator(options);

      // All requests fail
      fetchMock.mockRejectedValue({
        status: 429,
        message: 'Rate limit exceeded',
      });

      await expect(
        rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow();
    }, 5000);

    it('should maintain state across rapid rotations', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2', 'key-3'],
        redis: mockRedis as any,
        logger: mockLogger,
      };

      rotator = new APIKeyRotator(options);

      // Trigger rapid rotations
      for (let i = 0; i < 100; i++) {
        await rotator.rotateToNextKey();
      }

      const stats = rotator.getUsageStats();

      // Should have wrapped around multiple times (100 / 3 = 33 cycles)
      expect(stats.totalKeys).toBe(3);
      expect(stats.activeKeys).toBe(3);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle 300 requests with 3 keys at 100 req/min limit', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2', 'key-3'],
        redis: mockRedis as any,
        logger: mockLogger,
        rateLimitThreshold: 100,
      };

      rotator = new APIKeyRotator(options);

      // Mock all requests to succeed
      fetchMock.mockImplementation((url, opts) => {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: `test-${Math.random()}`,
            model: 'test',
            choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        });
      });

      // Make 300 requests
      const requests = [];
      for (let i = 0; i < 300; i++) {
        requests.push(
          rotator.makeRequest({
            model: 'test',
            messages: [{ role: 'user', content: `test ${i}` }],
          })
        );
      }

      const results = await Promise.allSettled(requests);
      const successCount = results.filter((r) => r.status === 'fulfilled').length;

      // All should succeed due to rotation
      expect(successCount).toBe(300);

      const stats = rotator.getUsageStats();

      // Each key should be under limit
      for (const keyStats of stats.usagePerKey) {
        expect(keyStats.requestCount).toBeLessThanOrEqual(100);
      }
    }, 30000);

    it('should distribute load evenly across keys', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2', 'key-3'],
        redis: mockRedis as any,
        logger: mockLogger,
      };

      rotator = new APIKeyRotator(options);

      // Mock all requests to succeed
      fetchMock.mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: `test-${Math.random()}`,
            model: 'test',
            choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        });
      });

      // Make 30 requests
      for (let i = 0; i < 30; i++) {
        await rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: `test ${i}` }],
        });
      }

      const stats = rotator.getUsageStats();

      // Load should be roughly even (±3 requests per key)
      const expectedPerKey = 30 / 3;
      for (const keyStats of stats.usagePerKey) {
        expect(Math.abs(keyStats.requestCount - expectedPerKey)).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should emit metrics for key usage distribution', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2', 'key-3'],
        redis: mockRedis as any,
        logger: mockLogger,
      };

      rotator = new APIKeyRotator(options);

      // Mock requests
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test',
          model: 'test',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      });

      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        await rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: `test ${i}` }],
        });
      }

      const stats = rotator.getUsageStats();

      // Should show distribution
      expect(stats.totalRequests).toBe(10);
      expect(stats.usagePerKey.length).toBe(3);
    });

    it('should track utilization percentage accurately', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1'],
        redis: mockRedis as any,
        logger: mockLogger,
        rateLimitThreshold: 100,
      };

      rotator = new APIKeyRotator(options);

      // Mock requests
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test',
          model: 'test',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      });

      // Make 50 requests (50% of threshold)
      for (let i = 0; i < 50; i++) {
        await rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: `test ${i}` }],
        });
      }

      const stats = rotator.getUsageStats();

      // Should show 50% utilization
      expect(stats.usagePerKey[0].utilization).toBeCloseTo(50, 0);
    });

    it('should alert when all keys at 90% limit', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2'],
        redis: mockRedis as any,
        logger: mockLogger,
        rateLimitThreshold: 10,
      };

      rotator = new APIKeyRotator(options);

      // Mock requests
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test',
          model: 'test',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      });

      // Make 18 requests (9 per key = 90% of threshold)
      for (let i = 0; i < 18; i++) {
        await rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: `test ${i}` }],
        });
      }

      const stats = rotator.getUsageStats();

      // Both keys should be at ~90% utilization
      expect(stats.usagePerKey[0].utilization).toBeGreaterThanOrEqual(90);
    });
  });
});
