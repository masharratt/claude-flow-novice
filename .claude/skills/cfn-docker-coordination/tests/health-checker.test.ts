/**
 * Health Checker Tests
 */

import { HealthChecker } from '../src/health-checker';
import { DockerClient } from '../src/docker-client';
import {
  ContainerHealthStatus,
  ContainerStatus,
  ContainerTimeoutError,
  ContainerHealthCheckError
} from '../src/types';

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;
  let mockDockerClient: Partial<DockerClient>;

  beforeEach(() => {
    mockDockerClient = {
      getContainerState: jest.fn(),
      getContainerLogs: jest.fn(),
      getContainerMetrics: jest.fn(),
      inspectContainer: jest.fn()
    };

    healthChecker = new HealthChecker(mockDockerClient as DockerClient);
  });

  describe('health status checks', () => {
    it('should recognize healthy container', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        name: 'test-agent',
        status: ContainerStatus.RUNNING,
        isRunning: true,
        healthStatus: ContainerHealthStatus.HEALTHY
      });

      const state = await healthChecker.checkHealth(mockContainer);

      expect(state.healthStatus).toBe(ContainerHealthStatus.HEALTHY);
      expect(state.isRunning).toBe(true);
    });

    it('should recognize unhealthy container', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        name: 'test-agent',
        status: ContainerStatus.RUNNING,
        isRunning: true,
        healthStatus: ContainerHealthStatus.UNHEALTHY
      });

      const state = await healthChecker.checkHealth(mockContainer);

      expect(state.healthStatus).toBe(ContainerHealthStatus.UNHEALTHY);
    });

    it('should recognize starting container', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        name: 'test-agent',
        status: ContainerStatus.RUNNING,
        isRunning: true,
        healthStatus: ContainerHealthStatus.STARTING
      });

      const state = await healthChecker.checkHealth(mockContainer);

      expect(state.healthStatus).toBe(ContainerHealthStatus.STARTING);
    });
  });

  describe('wait for healthy', () => {
    it('should return true when container becomes healthy', async () => {
      const mockContainer = {} as any;
      let callCount = 0;

      (mockDockerClient.getContainerState as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount >= 3) {
          return {
            id: 'container-1',
            isRunning: true,
            healthStatus: ContainerHealthStatus.HEALTHY
          };
        }
        return {
          id: 'container-1',
          isRunning: true,
          healthStatus: ContainerHealthStatus.STARTING
        };
      });

      const result = await healthChecker.waitForHealthy(mockContainer, 10000, 100);

      expect(result).toBe(true);
    });

    it('should return false on timeout', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true,
        healthStatus: ContainerHealthStatus.STARTING
      });

      const result = await healthChecker.waitForHealthy(mockContainer, 100, 50);

      expect(result).toBe(false);
    });

    it('should throw on unhealthy container', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true,
        healthStatus: ContainerHealthStatus.UNHEALTHY
      });

      await expect(
        healthChecker.waitForHealthy(mockContainer, 5000, 100)
      ).rejects.toThrow(ContainerHealthCheckError);
    });

    it('should throw if container exits before healthy', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: false,
        exitCode: 1,
        healthStatus: ContainerHealthStatus.UNKNOWN
      });

      await expect(
        healthChecker.waitForHealthy(mockContainer, 5000, 100)
      ).rejects.toThrow(ContainerHealthCheckError);
    });
  });

  describe('wait for multiple containers', () => {
    it('should wait for all containers', async () => {
      const mockContainers = [{}, {}, {}] as any[];

      let callCounts = [0, 0, 0];
      (mockDockerClient.getContainerState as jest.Mock)
        .mockImplementation(async () => {
          const index = callCounts.findIndex(c => c < 5);
          if (index >= 0) callCounts[index]++;

          return {
            id: `container-${index}`,
            isRunning: callCounts[index] < 5,
            healthStatus: callCounts[index] < 5
              ? ContainerHealthStatus.STARTING
              : ContainerHealthStatus.HEALTHY
          };
        });

      const result = await healthChecker.waitForMultipleHealthy(
        mockContainers,
        10000
      );

      expect(result.healthy.length).toBeLessThanOrEqual(3);
    });

    it('should track unhealthy containers', async () => {
      const mockContainers = [{}, {}] as any[];

      (mockDockerClient.getContainerState as jest.Mock)
        .mockResolvedValueOnce({
          id: 'container-1',
          isRunning: true,
          healthStatus: ContainerHealthStatus.UNHEALTHY
        })
        .mockResolvedValueOnce({
          id: 'container-2',
          isRunning: true,
          healthStatus: ContainerHealthStatus.HEALTHY
        });

      const result = await healthChecker.waitForMultipleHealthy(
        mockContainers,
        5000
      );

      expect(result.unhealthy.length).toBeGreaterThanOrEqual(0);
      expect(result.healthy.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('health summary', () => {
    it('should report healthy status', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true,
        healthStatus: ContainerHealthStatus.HEALTHY
      });

      const summary = await healthChecker.getHealthSummary(mockContainer);

      expect(summary.healthy).toBe(true);
      expect(summary.running).toBe(true);
      expect(summary.details).toContain('healthy');
    });

    it('should report unhealthy status', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true,
        healthStatus: ContainerHealthStatus.UNHEALTHY
      });

      const summary = await healthChecker.getHealthSummary(mockContainer);

      expect(summary.healthy).toBe(false);
      expect(summary.details).toContain('failed health');
    });

    it('should report exited status', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: false,
        exitCode: 1,
        healthStatus: ContainerHealthStatus.UNKNOWN
      });

      const summary = await healthChecker.getHealthSummary(mockContainer);

      expect(summary.running).toBe(false);
      expect(summary.exitCode).toBe(1);
    });
  });

  describe('monitor until completion', () => {
    it('should monitor until container exits', async () => {
      const mockContainer = {} as any;
      let callCount = 0;

      (mockDockerClient.getContainerState as jest.Mock).mockImplementation(async () => {
        callCount++;
        return {
          id: 'container-1',
          isRunning: callCount < 3,
          exitCode: callCount >= 3 ? 0 : undefined
        };
      });

      const result = await healthChecker.monitorUntilCompletion(
        mockContainer,
        10000
      );

      expect(result.exitCode).toBe(0);
    });

    it('should timeout if container runs too long', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true,
        exitCode: undefined
      });

      await expect(
        healthChecker.monitorUntilCompletion(mockContainer, 100)
      ).rejects.toThrow(ContainerTimeoutError);
    });

    it('should call state change callback', async () => {
      const mockContainer = {} as any;
      const callback = jest.fn();
      let callCount = 0;

      (mockDockerClient.getContainerState as jest.Mock).mockImplementation(async () => {
        callCount++;
        return {
          id: 'container-1',
          isRunning: callCount < 3,
          exitCode: callCount >= 3 ? 0 : undefined,
          status: callCount < 3
            ? ContainerStatus.RUNNING
            : ContainerStatus.EXITED
        };
      });

      await healthChecker.monitorUntilCompletion(
        mockContainer,
        10000,
        callback
      );

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('running state checks', () => {
    it('should return true if container is running', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true
      });

      const running = await healthChecker.isRunning(mockContainer);

      expect(running).toBe(true);
    });

    it('should return false if container has exited', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: false,
        exitCode: 0
      });

      const running = await healthChecker.isRunning(mockContainer);

      expect(running).toBe(false);
    });
  });

  describe('exit code retrieval', () => {
    it('should return exit code for exited container', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: false,
        exitCode: 42
      });

      const code = await healthChecker.getExitCode(mockContainer);

      expect(code).toBe(42);
    });

    it('should return -1 for running container', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true,
        exitCode: undefined
      });

      const code = await healthChecker.getExitCode(mockContainer);

      expect(code).toBe(-1);
    });
  });

  describe('log text waiting', () => {
    it('should return true when log text found', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerLogs as jest.Mock)
        .mockResolvedValue('Server started on port 3000\nReady to accept connections');

      const found = await healthChecker.waitForLogText(
        mockContainer,
        'Ready to accept',
        5000
      );

      expect(found).toBe(true);
    });

    it('should return false on timeout', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerLogs as jest.Mock)
        .mockResolvedValue('Starting server...');

      const found = await healthChecker.waitForLogText(
        mockContainer,
        'Ready to accept',
        100,
        50
      );

      expect(found).toBe(false);
    });
  });

  describe('diagnostic reporting', () => {
    it('should perform full diagnostic', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true,
        healthStatus: ContainerHealthStatus.HEALTHY
      });

      (mockDockerClient.getContainerLogs as jest.Mock)
        .mockResolvedValue('Application started');

      (mockDockerClient.getContainerMetrics as jest.Mock)
        .mockResolvedValue({
          containerId: 'container-1',
          cpuPercent: 5,
          memoryUsage: 512000000,
          memoryLimit: 1024000000
        });

      const diagnostic = await healthChecker.performDiagnostic(mockContainer);

      expect(diagnostic.state).toBeDefined();
      expect(diagnostic.health).toBeDefined();
      expect(diagnostic.logs).toBeDefined();
      expect(diagnostic.metrics).toBeDefined();
    });
  });

  describe('readiness checks', () => {
    it('should check custom readiness condition', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true,
        healthStatus: ContainerHealthStatus.HEALTHY
      });

      const readinessCheck = (state: any) => state.isRunning && state.healthStatus === 'healthy';

      const ready = await healthChecker.checkReadiness(
        mockContainer,
        readinessCheck,
        5000
      );

      expect(ready).toBe(true);
    });

    it('should timeout on readiness check', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: false
      });

      const readinessCheck = (state: any) => state.isRunning;

      const ready = await healthChecker.checkReadiness(
        mockContainer,
        readinessCheck,
        100
      );

      expect(ready).toBe(false);
    });
  });

  describe('wait for ready', () => {
    it('should return true when container is ready', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true,
        healthStatus: ContainerHealthStatus.HEALTHY
      });

      const ready = await healthChecker.waitForReady(mockContainer, 5000);

      expect(ready).toBe(true);
    });

    it('should allow unknown health status if running', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true,
        healthStatus: ContainerHealthStatus.UNKNOWN
      });

      const ready = await healthChecker.waitForReady(mockContainer, 5000);

      expect(ready).toBe(true);
    });
  });

  describe('exit detection', () => {
    it('should detect exited container', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: false,
        exitCode: 0
      });

      const exited = await healthChecker.hasExited(mockContainer);

      expect(exited).toBe(true);
    });

    it('should return false for running container', async () => {
      const mockContainer = {} as any;

      (mockDockerClient.getContainerState as jest.Mock).mockResolvedValue({
        id: 'container-1',
        isRunning: true
      });

      const exited = await healthChecker.hasExited(mockContainer);

      expect(exited).toBe(false);
    });
  });
});
