/**
 * Integration tests for CoordinatorEntrypoint against real infrastructure
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
    const { GenericContainer, Network } = await import('testcontainers');
    const { CoordinatorEntrypoint, runCoordinator } = await import(
      '../../../src/docker/coordinator/coordinator-entrypoint'
    );

    describe('CoordinatorEntrypoint Integration', () => {
      let redisContainer: Awaited<ReturnType<typeof GenericContainer.prototype.start>>;
      let network: Awaited<ReturnType<InstanceType<typeof Network>['start']>>;
      let redisHost: string;
      let redisPort: number;

      beforeAll(async () => {
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

      describe('CoordinatorEntrypoint class', () => {
        it('should initialize with real Redis connection', async () => {
          const coordinator = new CoordinatorEntrypoint({
            redisHost,
            redisPort,
            taskId: 'test-task-001',
            mode: 'standard',
          });

          expect(coordinator).toBeDefined();
        });

        it('should verify environment successfully', async () => {
          const coordinator = new CoordinatorEntrypoint({
            redisHost,
            redisPort,
            taskId: 'test-task-002',
            mode: 'standard',
          });

          const result = await coordinator.verifyEnvironment();

          expect(result.redisConnected).toBe(true);
        });

        it('should handle task context', async () => {
          const coordinator = new CoordinatorEntrypoint({
            redisHost,
            redisPort,
            taskId: 'test-task-003',
            mode: 'standard',
          });

          const context = coordinator.getTaskContext();

          expect(context.taskId).toBe('test-task-003');
          expect(context.mode).toBe('standard');
        });

        it('should emit lifecycle events', async () => {
          const coordinator = new CoordinatorEntrypoint({
            redisHost,
            redisPort,
            taskId: 'test-task-004',
            mode: 'standard',
          });

          const events: string[] = [];
          coordinator.on('initialized', () => events.push('initialized'));
          coordinator.on('verified', () => events.push('verified'));

          await coordinator.initialize();
          await coordinator.verifyEnvironment();

          expect(events).toContain('initialized');
        });
      });

      describe('Service discovery', () => {
        it('should support redis service name pattern', () => {
          // This validates the pattern used in Docker networks
          const coordinator = new CoordinatorEntrypoint({
            redisHost: 'redis', // Service name
            redisPort: 6379,
            taskId: 'test-task-005',
            mode: 'standard',
          });

          expect(coordinator).toBeDefined();
        });
      });

      describe('Configuration modes', () => {
        it.each(['mvp', 'standard', 'enterprise'])('should accept %s mode', (mode) => {
          const coordinator = new CoordinatorEntrypoint({
            redisHost,
            redisPort,
            taskId: `test-task-${mode}`,
            mode: mode as 'mvp' | 'standard' | 'enterprise',
          });

          expect(coordinator.getTaskContext().mode).toBe(mode);
        });
      });

      describe('Timeout handling', () => {
        it('should respect startup timeout', async () => {
          const coordinator = new CoordinatorEntrypoint({
            redisHost,
            redisPort,
            taskId: 'test-timeout',
            mode: 'standard',
            startupTimeoutMs: 5000,
          });

          const start = Date.now();
          await coordinator.initialize();
          const elapsed = Date.now() - start;

          expect(elapsed).toBeLessThan(5000);
        });
      });
    });
  };

  runTests();
} else {
  describe('CoordinatorEntrypoint Integration', () => {
    it.skip('Docker not available - skipping integration tests', () => {});
  });
}
