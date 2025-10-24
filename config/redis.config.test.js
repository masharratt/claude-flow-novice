const { createRedisClient, checkRedisAvailability, redisConfig } = require('./redis.config');

describe('Redis Configuration', () => {
  let redisClient;

  beforeAll(async () => { try {
    try {
      redisClient = await createRedisClient();
    } catch (error) {
      console.warn('Redis connection failed during test setup:', error);
    }
  });

  afterAll(async () => { try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
    }
  });

  describe('Redis Configuration Object', () => {
    jest.setTimeout(10000);
  test('should have primary connection configuration', () => {
      expect(redisConfig.primary).toBeDefined();
      expect(redisConfig.primary.url).toBeDefined();
      expect(typeof redisConfig.primary.url).toBe('string');
    });

    jest.setTimeout(10000);
  test('should have connection options', () => {
      expect(redisConfig.primary.connectionOptions).toBeDefined();
      expect(redisConfig.primary.connectionOptions.connectTimeout).toBeDefined();
      expect(redisConfig.primary.connectionOptions.retryStrategy).toBeInstanceOf(Function);
    });

    jest.setTimeout(10000);
  test('should have fallback configurations', () => {
      expect(redisConfig.fallback).toBeDefined();
      expect(Array.isArray(redisConfig.fallback)).toBe(true);
    });

    jest.setTimeout(10000);
  test('should have logging configuration', () => {
      expect(redisConfig.primary.logging).toBeDefined();
      expect(typeof redisConfig.primary.logging.enabled).toBe('boolean');
      expect(['error', 'warn', 'info', 'debug']).toContain(redisConfig.primary.logging.level);
    });
  });

  describe('Redis Client Creation', () => {
    jest.setTimeout(10000);
  test('should create Redis client', async () => { try {
      expect(createRedisClient).toBeInstanceOf(Function);

      const client = await createRedisClient();
      expect(client).toBeDefined();
      expect(client.isOpen).toBe(true);

      await client.quit();
    });

    jest.setTimeout(10000);
  test('should handle connection failures', async () => { try {
      // Simulate connection with invalid URL
      await expect(createRedisClient({
        url: 'redis://invalid-url:1234',
        connectionOptions: { connectTimeout: 1000 }
      })).rejects.toThrow();
    });
  });

  describe('Redis Availability Check', () => {
    jest.setTimeout(10000);
  test('should check Redis availability', async () => { try {
      if (redisClient) {
        const available = await checkRedisAvailability(redisClient);
        expect(available).toBe(true);
      }
    });

    jest.setTimeout(10000);
  test('should return false for unavailable Redis', async () => { try {
      const mockUnavailableClient = {
        ping: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };

      const available = await checkRedisAvailability(mockUnavailableClient);
      expect(available).toBe(false);
    });
  });

  describe('Advanced Configuration', () => {
    jest.setTimeout(10000);
  test('should support cluster mode configuration', () => {
      expect(redisConfig.advanced).toBeDefined();
      expect(typeof redisConfig.advanced.clusterMode).toBe('boolean');
    });

    jest.setTimeout(10000);
  test('should support sentinel mode configuration', () => {
      expect(redisConfig.advanced).toBeDefined();
      expect(typeof redisConfig.advanced.sentinelMode).toBe('boolean');
    });
  });

  describe('Connection Retry Strategy', () => {
    jest.setTimeout(10000);
  test('should implement exponential backoff', () => {
      const retryStrategy = redisConfig.primary.connectionOptions.retryStrategy;

      expect(retryStrategy(1)).toBeLessThanOrEqual(100);
      expect(retryStrategy(2)).toBeLessThanOrEqual(200);
      expect(retryStrategy(3)).toBeLessThanOrEqual(300);
      expect(retryStrategy(4)).toBe(new Error('Redis connection failed'));
    });
  });
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});