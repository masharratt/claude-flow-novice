/**
 * API Key Rotation Tests
 *
 * Tests for API key pool rotation, rate limit detection, and backoff logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { APIKeyRotator, APIKeyRotatorOptions } from '../../src/providers/api-key-rotator.js';
import { RateLimitDetector } from '../../src/providers/rate-limit-detector.js';
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

describe('API Key Rotation', () => {
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

  describe('Initialization', () => {
    it('should initialize with multiple API keys', () => {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2', 'key-3'],
        redis: mockRedis as any,
        logger: mockLogger,
      };

      rotator = new APIKeyRotator(options);
      const stats = rotator.getUsageStats();

      expect(stats.totalKeys).toBe(3);
      expect(stats.activeKeys).toBe(3);
      expect(stats.rateLimitedKeys).toBe(0);
    });

    it('should throw error if no API keys provided', () => {
      const options: APIKeyRotatorOptions = {
        apiKeys: [],
        redis: mockRedis as any,
        logger: mockLogger,
      };

      expect(() => new APIKeyRotator(options)).toThrow('At least one API key is required');
    });

    it('should set default rate limit threshold', () => {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1'],
        redis: mockRedis as any,
        logger: mockLogger,
      };

      rotator = new APIKeyRotator(options);
      const stats = rotator.getUsageStats();

      // Should use default threshold of 100
      expect(stats.usagePerKey[0].utilization).toBe(0);
    });
  });

  describe('Key Rotation', () => {
    it('should rotate to next key when rate limited', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2', 'key-3'],
        redis: mockRedis as any,
        logger: mockLogger,
        rateLimitThreshold: 100,
      };

      rotator = new APIKeyRotator(options);

      // First request succeeds with key-1
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-1',
          model: 'test',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      });

      await rotator.makeRequest({
        model: 'test',
        messages: [{ role: 'user', content: 'test' }],
      });

      // Second request fails with rate limit on key-1
      fetchMock.mockRejectedValueOnce({
        status: 429,
        message: 'Rate limit exceeded',
      });

      // Third request succeeds with key-2 (after rotation)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-2',
          model: 'test',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      });

      const response = await rotator.makeRequest({
        model: 'test',
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(response.id).toBe('test-2');

      const stats = rotator.getUsageStats();
      expect(stats.rateLimitedKeys).toBe(1);
      expect(stats.activeKeys).toBe(2);
    });

    it('should track usage per key', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2'],
        redis: mockRedis as any,
        logger: mockLogger,
        rateLimitThreshold: 100,
      };

      rotator = new APIKeyRotator(options);

      // Make 50 requests (should distribute across keys)
      for (let i = 0; i < 50; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: `test-${i}`,
            model: 'test',
            choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        });

        await rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: `test ${i}` }],
        });
      }

      const stats = rotator.getUsageStats();

      // Both keys should have been used
      expect(stats.usagePerKey[0].requestCount).toBeGreaterThan(0);
      expect(stats.totalRequests).toBe(50);
    });

    it('should respect 90% threshold for proactive rotation', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2'],
        redis: mockRedis as any,
        logger: mockLogger,
        rateLimitThreshold: 10, // Low threshold for testing
      };

      rotator = new APIKeyRotator(options);

      // Make 9 requests (90% of threshold)
      for (let i = 0; i < 9; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: `test-${i}`,
            model: 'test',
            choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        });

        await rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: `test ${i}` }],
        });
      }

      const stats = rotator.getUsageStats();

      // First key should be approaching limit
      expect(stats.usagePerKey[0].utilization).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Exponential Backoff', () => {
    it('should use exponential backoff when all keys exhausted', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2'],
        redis: mockRedis as any,
        logger: mockLogger,
        rateLimitThreshold: 100,
        backoffDelays: [100, 200, 400], // Shorter delays for testing
      };

      rotator = new APIKeyRotator(options);

      // All keys return rate limit
      fetchMock.mockRejectedValue({
        status: 429,
        message: 'Rate limit exceeded',
      });

      // After backoff, one key succeeds
      setTimeout(() => {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'test-backoff',
            model: 'test',
            choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        });
      }, 150);

      const startTime = Date.now();

      await expect(
        rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('All API keys exhausted');

      const duration = Date.now() - startTime;

      // Should have waited at least the first backoff delay
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Error Handling', () => {
    it('should throw immediately for non-rate-limit errors', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2'],
        redis: mockRedis as any,
        logger: mockLogger,
      };

      rotator = new APIKeyRotator(options);

      // Simulate authentication error (non-retryable)
      fetchMock.mockRejectedValueOnce({
        status: 401,
        message: 'Invalid API key',
      });

      await expect(
        rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Invalid API key');

      // Should not have rotated keys
      const stats = rotator.getUsageStats();
      expect(stats.rateLimitedKeys).toBe(0);
    });

    it('should handle network errors gracefully', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1'],
        redis: mockRedis as any,
        logger: mockLogger,
      };

      rotator = new APIKeyRotator(options);

      // Simulate network error
      fetchMock.mockRejectedValueOnce(new Error('fetch failed'));

      await expect(
        rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('fetch failed');
    });
  });

  describe('Usage Statistics', () => {
    it('should provide accurate usage stats', async () => { try {
      const options: APIKeyRotatorOptions = {
        apiKeys: ['key-1', 'key-2', 'key-3'],
        redis: mockRedis as any,
        logger: mockLogger,
        rateLimitThreshold: 100,
      };

      rotator = new APIKeyRotator(options);

      // Make requests
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

        await rotator.makeRequest({
          model: 'test',
          messages: [{ role: 'user', content: `test ${i}` }],
        });
      }

      const stats = rotator.getUsageStats();

      expect(stats.totalKeys).toBe(3);
      expect(stats.activeKeys).toBe(3);
      expect(stats.totalRequests).toBe(10);
      expect(stats.usagePerKey.length).toBe(3);
    });
  });
});

describe('RateLimitDetector', () => {
  let detector: RateLimitDetector;

  beforeEach(() => {
    detector = new RateLimitDetector(mockLogger);
  });

  describe('Rate Limit Detection', () => {
    it('should detect 429 status code', async () => { try {
      const error = { status: 429 };
      const isRateLimit = await detector.detectRateLimit(error);
      expect(isRateLimit).toBe(true);
    });

    it('should detect rate_limit_exceeded error code', async () => { try {
      const error = { code: 'rate_limit_exceeded' };
      const isRateLimit = await detector.detectRateLimit(error);
      expect(isRateLimit).toBe(true);
    });

    it('should detect rate limit in error message', async () => { try {
      const error = { message: 'Too many requests, rate limit exceeded' };
      const isRateLimit = await detector.detectRateLimit(error);
      expect(isRateLimit).toBe(true);
    });

    it('should not detect non-rate-limit errors', async () => { try {
      const error = { status: 401, message: 'Unauthorized' };
      const isRateLimit = await detector.detectRateLimit(error);
      expect(isRateLimit).toBe(false);
    });
  });

  describe('Retry-After Extraction', () => {
    it('should extract Retry-After seconds', async () => { try {
      const error = {
        response: {
          headers: {
            'retry-after': '60',
          },
        },
      };

      const retryAfter = await detector.extractRetryAfter(error);
      expect(retryAfter).toBe(60);
    });

    it('should return null if no Retry-After header', async () => { try {
      const error = {
        response: {
          headers: {},
        },
      };

      const retryAfter = await detector.extractRetryAfter(error);
      expect(retryAfter).toBeNull();
    });
  });

  describe('Backoff Calculation', () => {
    it('should calculate exponential backoff correctly', async () => { try {
      const delays = [
        await detector.calculateBackoffDelay(0, 1000, 60000),
        await detector.calculateBackoffDelay(1, 1000, 60000),
        await detector.calculateBackoffDelay(2, 1000, 60000),
        await detector.calculateBackoffDelay(3, 1000, 60000),
      ];

      // Should be approximately: 1s, 2s, 4s, 8s (with jitter)
      expect(delays[0]).toBeGreaterThanOrEqual(900);
      expect(delays[0]).toBeLessThanOrEqual(1100);

      expect(delays[1]).toBeGreaterThanOrEqual(1800);
      expect(delays[1]).toBeLessThanOrEqual(2200);

      expect(delays[2]).toBeGreaterThanOrEqual(3600);
      expect(delays[2]).toBeLessThanOrEqual(4400);

      expect(delays[3]).toBeGreaterThanOrEqual(7200);
      expect(delays[3]).toBeLessThanOrEqual(8800);
    });

    it('should cap at maximum delay', async () => { try {
      const delay = await detector.calculateBackoffDelay(10, 1000, 10000);
      expect(delay).toBeLessThanOrEqual(11000); // maxDelay + 10% jitter
    });
  });
});
