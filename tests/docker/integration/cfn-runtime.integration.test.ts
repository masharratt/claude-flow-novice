/**
 * Integration tests for CfnRuntime against real infrastructure
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
    const { CfnRuntime, createRuntime } = await import(
      '../../../src/docker/runtime/cfn-runtime'
    );

    describe('CfnRuntime Integration', () => {
      let redisContainer: Awaited<ReturnType<typeof GenericContainer.prototype.start>>;
      let network: any;
      let redisHost: string;
      let redisPort: number;

      beforeAll(async () => {
        const { Network } = await import('testcontainers');
        network = await new Network().start();

        redisContainer = await new GenericContainer('redis:7-alpine')
          .withNetwork(network)
          .withNetworkAliases('redis')
          .withExposedPorts(6379)
          .start();

        redisHost = redisContainer.getHost();
        redisPort = redisContainer.getMappedPort(6379);
      }, 60000);

      afterAll(async () => {
        await redisContainer?.stop();
        await network?.stop();
      });

      describe('createRuntime', () => {
        it('should create runtime with real Redis config', () => {
          const runtime = createRuntime({
            redis: {
              host: redisHost,
              port: redisPort,
              db: 0,
            },
          });

          expect(runtime.redis.host).toBe(redisHost);
          expect(runtime.redis.port).toBe(redisPort);
        });

        it('should validate runtime configuration', () => {
          const runtime = createRuntime({
            redis: {
              host: redisHost,
              port: redisPort,
              db: 0,
            },
          });

          expect(runtime.validate()).toBe(true);
        });
      });

      describe('CfnRuntime class', () => {
        it('should initialize with environment variables', () => {
          process.env.REDIS_HOST = redisHost;
          process.env.REDIS_PORT = String(redisPort);

          const runtime = new CfnRuntime();
          expect(runtime.redis.host).toBe(redisHost);
          expect(runtime.redis.port).toBe(redisPort);

          delete process.env.REDIS_HOST;
          delete process.env.REDIS_PORT;
        });

        it('should provide task configuration', () => {
          const runtime = createRuntime();

          expect(runtime.task).toBeDefined();
          expect(typeof runtime.task.id).toBe('string');
        });

        it('should provide agent configuration', () => {
          const runtime = createRuntime({
            agent: {
              id: 'test-agent-001',
              type: 'integration-tester',
              role: 'tester',
            },
          });

          expect(runtime.agent.id).toBe('test-agent-001');
          expect(runtime.agent.type).toBe('integration-tester');
        });
      });

      describe('Service discovery simulation', () => {
        it('should use redis as service name within Docker network', async () => {
          // This tests the pattern of using 'redis' service name
          // In real Docker network, containers resolve 'redis' to the container IP
          const runtime = createRuntime({
            redis: {
              host: 'redis', // Service name pattern
              port: 6379,
              db: 0,
            },
          });

          expect(runtime.redis.host).toBe('redis');
        });
      });
    });
  };

  runTests();
} else {
  describe('CfnRuntime Integration', () => {
    it.skip('Docker not available - skipping integration tests', () => {});
  });
}
