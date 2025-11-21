/**
 * Integration tests for RedisHealthCheck against real Redis container
 */
import { execSync } from 'child_process';

// Check Docker availability synchronously before importing testcontainers
const isDockerAvailable = (): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

const DOCKER_AVAILABLE = isDockerAvailable();

if (DOCKER_AVAILABLE) {
  // Dynamic import to avoid testcontainers initialization when Docker unavailable
  const runTests = async () => {
    const { GenericContainer } = await import('testcontainers');
    const { RedisHealthCheck, checkRedisHealth, checkRedisHealthWithRetry } = await import(
      '../../../src/docker/health-check/redis-health-check'
    );

    describe('RedisHealthCheck Integration', () => {
      let redisContainer: Awaited<ReturnType<typeof GenericContainer.prototype.start>>;
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
        });

        it('should report unhealthy for non-existent Redis', async () => {
          const checker = new RedisHealthCheck({
            host: 'localhost',
            port: 59999,
          });
          const result = await checker.check();
          expect(result.healthy).toBe(false);
        });
      });

      describe('checkRedisHealth function', () => {
        it('should return healthy for running Redis', async () => {
          const result = await checkRedisHealth({ host: redisHost, port: redisPort });
          expect(result.healthy).toBe(true);
        });
      });

      describe('checkRedisHealthWithRetry function', () => {
        it('should succeed on first try for running Redis', async () => {
          const result = await checkRedisHealthWithRetry({
            host: redisHost,
            port: redisPort,
            retries: 3,
            retryDelay: 100,
          });
          expect(result.healthy).toBe(true);
        });

        it('should fail after retries for unavailable Redis', async () => {
          const result = await checkRedisHealthWithRetry({
            host: 'localhost',
            port: 59999,
            retries: 2,
            retryDelay: 100,
          });
          expect(result.healthy).toBe(false);
        });
      });
    });
  };

  runTests();
} else {
  describe('RedisHealthCheck Integration', () => {
    it.skip('Docker not available - skipping integration tests', () => {});
  });
}
