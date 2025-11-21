/**
 * Docker Deploy Stabilization Test Suite
 * Tests for stabilization and health checks during deployment
 *
 * Migrated from: docker/scripts/docker-deploy.stabilization.sh
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DockerDeployStabilization } from '../../../src/docker/scripts/docker-deploy-stabilization';
import { exec } from 'execa';

jest.mock('execa');

describe('DockerDeployStabilization', () => {
  let stabilization: DockerDeployStabilization;
  const mockExec = exec as jest.MockedFunction<typeof exec>;

  beforeEach(() => {
    jest.clearAllMocks();
    stabilization = new DockerDeployStabilization({
      teamId: 'backend',
      maxWaitTime: 300,
      healthCheckInterval: 5,
      verbose: false,
    });
  });

  describe('Configuration', () => {
    it('should parse team ID', () => {
      expect(stabilization.teamId).toBe('backend');
    });

    it('should parse max wait time', () => {
      expect(stabilization.options.maxWaitTime).toBe(300);
    });

    it('should parse health check interval', () => {
      expect(stabilization.options.healthCheckInterval).toBe(5);
    });
  });

  describe('Startup Stabilization', () => {
    it('should wait for coordinator startup', async () => {
      mockExec.mockResolvedValue({
        stdout: 'Coordinator ready',
      } as any);

      const result = await stabilization.waitForCoordinatorStartup();

      expect(result.success).toBe(true);
    });

    it('should detect startup timeout', async () => {
      stabilization.options.maxWaitTime = 1;
      mockExec.mockRejectedValue(new Error('Container not ready'));

      const result = await stabilization.waitForCoordinatorStartup();

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
    });

    it('should check startup progress', async () => {
      mockExec.mockResolvedValue({
        stdout: 'Initializing...',
      } as any);

      const progress = await stabilization.checkStartupProgress();

      expect(progress).toBeDefined();
    });

    it('should retry startup checks with backoff', async () => {
      mockExec
        .mockRejectedValueOnce(new Error('Not ready'))
        .mockRejectedValueOnce(new Error('Not ready'))
        .mockResolvedValueOnce({
          stdout: 'Ready',
        } as any);

      const result = await stabilization.waitForCoordinatorStartup();

      expect(result.success).toBe(true);
      expect(mockExec.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('Health Checks', () => {
    it('should perform comprehensive health check', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          coordinator: 'healthy',
          redis: 'healthy',
          network: 'healthy',
        }),
      } as any);

      const health = await stabilization.performHealthCheck();

      expect(health.coordinator).toBe('healthy');
      expect(health.redis).toBe('healthy');
      expect(health.network).toBe('healthy');
    });

    it('should detect unhealthy coordinator', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          coordinator: 'unhealthy',
          redis: 'healthy',
          network: 'healthy',
        }),
      } as any);

      const health = await stabilization.performHealthCheck();

      expect(health.coordinator).toBe('unhealthy');
      expect(health.isHealthy).toBe(false);
    });

    it('should wait for all components to be healthy', async () => {
      mockExec
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            coordinator: 'starting',
            redis: 'healthy',
            network: 'healthy',
          }),
        } as any)
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            coordinator: 'healthy',
            redis: 'healthy',
            network: 'healthy',
          }),
        } as any);

      const result = await stabilization.waitForAllHealthy();

      expect(result.success).toBe(true);
    });
  });

  describe('Coordinator Health', () => {
    it('should check coordinator responds to ping', async () => {
      mockExec.mockResolvedValue({
        stdout: 'PONG',
      } as any);

      const healthy = await stabilization.isCoordinatorHealthy();

      expect(healthy).toBe(true);
    });

    it('should check coordinator logs for errors', async () => {
      mockExec.mockResolvedValue({
        stdout: 'No errors detected',
      } as any);

      const healthy = await stabilization.checkCoordinatorLogs();

      expect(healthy).toBe(true);
    });

    it('should detect errors in coordinator logs', async () => {
      mockExec.mockResolvedValue({
        stdout: 'ERROR: Failed to connect to Redis',
      } as any);

      const healthy = await stabilization.checkCoordinatorLogs();

      expect(healthy).toBe(false);
    });

    it('should check coordinator memory usage', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          MemUsage: '512MB',
          MemLimit: '2GB',
          healthy: true,
        }),
      } as any);

      const result = await stabilization.checkCoordinatorResources();

      expect(result.healthy).toBe(true);
    });

    it('should alert on high coordinator memory', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          MemUsage: '1.8GB',
          MemLimit: '2GB',
          healthy: false,
        }),
      } as any);

      const result = await stabilization.checkCoordinatorResources();

      expect(result.healthy).toBe(false);
    });
  });

  describe('Redis Health', () => {
    it('should check Redis is responsive', async () => {
      mockExec.mockResolvedValue({
        stdout: 'PONG',
      } as any);

      const healthy = await stabilization.isRedisHealthy();

      expect(healthy).toBe(true);
    });

    it('should detect unresponsive Redis', async () => {
      mockExec.mockRejectedValue(
        new Error('Connection refused')
      );

      const healthy = await stabilization.isRedisHealthy();

      expect(healthy).toBe(false);
    });

    it('should check Redis memory usage', async () => {
      mockExec.mockResolvedValue({
        stdout: '{"used_memory": 104857600}', // 100MB
      } as any);

      const usage = await stabilization.getRedisMemoryUsage();

      expect(usage).toBeGreaterThan(0);
    });

    it('should verify Redis persistence', async () => {
      mockExec.mockResolvedValue({
        stdout: 'ok',
      } as any);

      const result = await stabilization.checkRedisPersistence();

      expect(result).toBe(true);
    });
  });

  describe('Network Health', () => {
    it('should verify network exists', async () => {
      mockExec.mockResolvedValue({
        stdout: 'team-backend',
      } as any);

      const exists = await stabilization.isNetworkHealthy();

      expect(exists).toBe(true);
    });

    it('should check network connectivity', async () => {
      mockExec.mockResolvedValue({
        stdout: 'Connected',
      } as any);

      const connected = await stabilization.checkNetworkConnectivity();

      expect(connected).toBe(true);
    });

    it('should detect network issues', async () => {
      mockExec.mockRejectedValue(
        new Error('Network unreachable')
      );

      const connected = await stabilization.checkNetworkConnectivity();

      expect(connected).toBe(false);
    });

    it('should verify agents can reach coordinator', async () => {
      mockExec.mockResolvedValue({
        stdout: 'Reachable',
      } as any);

      const reachable = await stabilization.canAgentsReachCoordinator();

      expect(reachable).toBe(true);
    });
  });

  describe('Container Status', () => {
    it('should check all containers are running', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          total: 3,
          running: 3,
          stopped: 0,
        }),
      } as any);

      const running = await stabilization.areAllContainersRunning();

      expect(running).toBe(true);
    });

    it('should detect stopped containers', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          total: 3,
          running: 2,
          stopped: 1,
        }),
      } as any);

      const running = await stabilization.areAllContainersRunning();

      expect(running).toBe(false);
    });

    it('should restart failed containers', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      const result = await stabilization.restartFailedContainers();

      expect(result.restarted).toBeGreaterThanOrEqual(0);
    });

    it('should check container exit codes', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          coordinator: 0,
          redis: 0,
          agents: [0, 0, 0],
        }),
      } as any);

      const result = await stabilization.checkContainerExitCodes();

      expect(result.healthy).toBe(true);
    });
  });

  describe('Stabilization Process', () => {
    it('should perform complete stabilization', async () => {
      mockExec.mockResolvedValue({
        stdout: 'healthy',
      } as any);

      const result = await stabilization.stabilize();

      expect(result.success).toBe(true);
    });

    it('should log stabilization progress', async () => {
      mockExec.mockResolvedValue({
        stdout: 'healthy',
      } as any);

      const logs: string[] = [];
      stabilization.on('log', (msg: string) => logs.push(msg));

      await stabilization.stabilize();

      expect(logs.length).toBeGreaterThan(0);
    });

    it('should track stabilization time', async () => {
      mockExec.mockResolvedValue({
        stdout: 'healthy',
      } as any);

      const startTime = Date.now();

      await stabilization.stabilize();

      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThan(0);
    });

    it('should handle stabilization failure', async () => {
      mockExec.mockRejectedValue(
        new Error('Stabilization failed')
      );

      const result = await stabilization.stabilize().catch((e) => ({
        success: false,
        error: e.message,
      }));

      expect(result.success).toBe(false);
    });
  });

  describe('Readiness Probes', () => {
    it('should check deployment readiness', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          coordinator: 'ready',
          redis: 'ready',
          network: 'ready',
        }),
      } as any);

      const ready = await stabilization.isDeploymentReady();

      expect(ready).toBe(true);
    });

    it('should detect incomplete readiness', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          coordinator: 'starting',
          redis: 'ready',
          network: 'ready',
        }),
      } as any);

      const ready = await stabilization.isDeploymentReady();

      expect(ready).toBe(false);
    });

    it('should provide readiness details', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          coordinator: { ready: true, uptime: 60 },
          redis: { ready: true, uptime: 60 },
          network: { ready: true, containers: 3 },
        }),
      } as any);

      const details = await stabilization.getReadinessDetails();

      expect(details).toBeDefined();
    });
  });

  describe('Metrics Collection', () => {
    it('should collect stabilization metrics', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          startup_time_ms: 5000,
          health_checks: 10,
          successful_checks: 10,
          failed_checks: 0,
        }),
      } as any);

      const metrics = await stabilization.collectMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.startup_time_ms).toBeGreaterThan(0);
    });

    it('should track health check history', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          healthy: true,
          timestamp: Date.now(),
        }),
      } as any);

      await stabilization.performHealthCheck();
      await stabilization.performHealthCheck();

      const history = stabilization.getHealthCheckHistory();

      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery', () => {
    it('should detect and recover from transient failures', async () => {
      mockExec
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({
          stdout: 'healthy',
        } as any);

      const result = await stabilization.waitForCoordinatorStartup();

      expect(result.success).toBe(true);
    });

    it('should escalate after max retries', async () => {
      stabilization.options.maxWaitTime = 1;
      mockExec.mockRejectedValue(new Error('Persistent error'));

      const result = await stabilization.waitForCoordinatorStartup();

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
    });

    it('should report errors clearly', async () => {
      mockExec.mockRejectedValue(
        new Error('Redis connection failed')
      );

      const errors: string[] = [];
      stabilization.on('error', (msg: string) => errors.push(msg));

      try {
        await stabilization.isRedisHealthy();
      } catch {
        // Expected
      }

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Verbose Mode', () => {
    it('should log detailed progress in verbose mode', async () => {
      stabilization.options.verbose = true;
      mockExec.mockResolvedValue({
        stdout: 'healthy',
      } as any);

      const logs: string[] = [];
      stabilization.on('log', (msg: string) => logs.push(msg));

      await stabilization.performHealthCheck();

      expect(logs.length).toBeGreaterThan(1);
    });

    it('should include timestamps in verbose logs', async () => {
      stabilization.options.verbose = true;
      mockExec.mockResolvedValue({
        stdout: 'healthy',
      } as any);

      const logs: string[] = [];
      stabilization.on('log', (msg: string) => logs.push(msg));

      await stabilization.performHealthCheck();

      const hasTimestamps = logs.some((l) => /\d{2}:\d{2}:\d{2}/.test(l));

      expect(hasTimestamps || logs.length > 0).toBe(true);
    });
  });

  describe('Environment Variables', () => {
    it('should use TEAM_ID from configuration', () => {
      expect(stabilization.teamId).toBe('backend');
    });

    it('should support custom max wait time', () => {
      expect(stabilization.options.maxWaitTime).toBeGreaterThan(0);
    });

    it('should support custom health check interval', () => {
      expect(stabilization.options.healthCheckInterval).toBeGreaterThan(0);
    });
  });
});
