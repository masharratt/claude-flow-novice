/**
 * Integration tests for RedisHealthCheck against real Redis container
 */
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { RedisHealthCheck, checkRedisHealth, checkRedisHealthWithRetry } from '../../../src/docker/health-check/redis-health-check';

const DOCKER_AVAILABLE = process.env.DOCKER_HOST !== 'disabled';

(DOCKER_AVAILABLE ? describe : describe.skip)('RedisHealthCheck Integration', () => {
  let redisContainer: StartedTestContainer;
  let redisHost: string;
  let redisPort: number;

  beforeAll(async () => {
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    redisHost = redisContainer.getHost();
    redisPort = redisContainer.getMappedPort(6379);
  }, 60000);

  afterAll(async () => {
    await redisContainer?.stop();
  });

  describe('RedisHealthCheck class', () => {
    it('should connect to real Redis and report healthy', async () => {
      const checker = new RedisHealthCheck({
        host: redisHost,
        port: redisPort,
      });

      const result = await checker.check();
      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeGreaterThan(0);
    });

    it('should handle PING/PONG correctly', async () => {
      const checker = new RedisHealthCheck({
        host: redisHost,
        port: redisPort,
      });

      const result = await checker.check();
      expect(result.healthy).toBe(true);
      expect(result.message).toContain('PONG');
    });

    it('should fail for non-existent Redis', async () => {
      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 59999, // unlikely to exist
        timeout: 1000,
      });

      const result = await checker.check();
      expect(result.healthy).toBe(false);
    });
  });

  describe('checkRedisHealth function', () => {
    it('should check health with default config against real Redis', async () => {
      process.env.REDIS_HOST = redisHost;
      process.env.REDIS_PORT = String(redisPort);

      const result = await checkRedisHealth();
      expect(result.healthy).toBe(true);

      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
    });
  });

  describe('checkRedisHealthWithRetry', () => {
    it('should succeed on first attempt against healthy Redis', async () => {
      const result = await checkRedisHealthWithRetry(
        { host: redisHost, port: redisPort },
        { maxRetries: 3, retryDelayMs: 100 }
      );

      expect(result.healthy).toBe(true);
      expect(result.attempts).toBe(1);
    });

    it('should exhaust retries for unavailable Redis', async () => {
      const result = await checkRedisHealthWithRetry(
        { host: 'localhost', port: 59999, timeout: 500 },
        { maxRetries: 2, retryDelayMs: 100 }
      );

      expect(result.healthy).toBe(false);
      expect(result.attempts).toBe(2);
    }, 10000);
  });
});
