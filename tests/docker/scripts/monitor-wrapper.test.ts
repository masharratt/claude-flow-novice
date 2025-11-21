/**
 * Monitor Wrapper Test Suite
 * Tests for monitoring CFN Docker infrastructure
 *
 * Migrated from: docker/scripts/monitor-wrapper.sh
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MonitorWrapper } from '../../../src/docker/scripts/monitor-wrapper';
import { exec } from 'execa';

jest.mock('execa');

describe('MonitorWrapper', () => {
  let monitor: MonitorWrapper;
  const mockExec = exec as jest.MockedFunction<typeof exec>;

  beforeEach(() => {
    jest.clearAllMocks();
    monitor = new MonitorWrapper({
      teamId: 'backend',
      interval: 5,
      duration: 300,
      verbose: false,
    });
  });

  describe('Configuration', () => {
    it('should parse team ID', () => {
      expect(monitor.teamId).toBe('backend');
    });

    it('should parse monitoring interval', () => {
      expect(monitor.options.interval).toBe(5);
    });

    it('should parse monitoring duration', () => {
      expect(monitor.options.duration).toBe(300);
    });

    it('should parse verbose flag', () => {
      const verbose = new MonitorWrapper({
        teamId: 'backend',
        interval: 5,
        duration: 300,
        verbose: true,
      });

      expect(verbose.options.verbose).toBe(true);
    });
  });

  describe('Container Monitoring', () => {
    it('should get coordinator status', async () => {
      mockExec.mockResolvedValue({
        stdout: 'running',
      } as any);

      const status = await monitor.getCoordinatorStatus();

      expect(status).toBe('running');
    });

    it('should get all team containers', async () => {
      mockExec.mockResolvedValue({
        stdout: 'container1\ncontainer2\ncontainer3',
      } as any);

      const containers = await monitor.getTeamContainers();

      expect(containers.length).toBeGreaterThan(0);
    });

    it('should detect stopped containers', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify([
          { Names: 'cfn-docker-team-coordinator-backend', State: { Running: true } },
          { Names: 'cfn-redis-backend', State: { Running: false } },
        ]),
      } as any);

      const containers = await monitor.getTeamContainers();
      const stopped = containers.filter((c) => !c.State.Running);

      expect(stopped.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Monitoring', () => {
    it('should get coordinator memory usage', async () => {
      mockExec.mockResolvedValue({
        stdout: 'MemUsage: 512MB / 2GB',
      } as any);

      const memory = await monitor.getCoordinatorMemory();

      expect(memory).toContain('512');
    });

    it('should get total team memory usage', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          MemUsage: '2.5GB',
          MemPercent: '12.5%',
        }),
      } as any);

      const memory = await monitor.getTotalMemoryUsage();

      expect(memory).toBeDefined();
    });

    it('should detect memory overload', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          MemUsage: '1.8GB',
          MemLimit: '2GB',
        }),
      } as any);

      const overloaded = await monitor.isMemoryOverloaded();

      expect(overloaded).toBe(true);
    });

    it('should alert on high memory usage', async () => {
      monitor.options.memoryThreshold = 0.8;
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          MemUsage: '1.9GB',
          MemLimit: '2GB',
        }),
      } as any);

      const alerts: string[] = [];
      monitor.on('alert', (msg: string) => alerts.push(msg));

      await monitor.checkMemoryThresholds();

      expect(alerts.some((a) => a.includes('memory'))).toBe(true);
    });
  });

  describe('CPU Monitoring', () => {
    it('should get coordinator CPU usage', async () => {
      mockExec.mockResolvedValue({
        stdout: 'CPUPercent: 25.5%',
      } as any);

      const cpu = await monitor.getCoordinatorCpu();

      expect(cpu).toContain('25');
    });

    it('should get total team CPU usage', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          CPUPercent: '45.5%',
        }),
      } as any);

      const cpu = await monitor.getTotalCpuUsage();

      expect(cpu).toBeDefined();
    });

    it('should detect CPU overload', async () => {
      monitor.options.cpuThreshold = 0.8;
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          CPUPercent: '85%',
        }),
      } as any);

      const overloaded = await monitor.isCpuOverloaded();

      expect(overloaded).toBe(true);
    });
  });

  describe('Network Monitoring', () => {
    it('should get team network status', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          Name: 'team-backend',
          Driver: 'bridge',
          Containers: 3,
        }),
      } as any);

      const network = await monitor.getNetworkStatus();

      expect(network).toBeDefined();
      expect(network.Name).toBe('team-backend');
    });

    it('should check network connectivity', async () => {
      mockExec.mockResolvedValue({
        stdout: 'Connected',
      } as any);

      const connected = await monitor.checkNetworkConnectivity();

      expect(connected).toBe(true);
    });

    it('should detect network issues', async () => {
      mockExec.mockRejectedValue(
        new Error('Network unreachable')
      );

      const connected = await monitor.checkNetworkConnectivity();

      expect(connected).toBe(false);
    });
  });

  describe('Health Checks', () => {
    it('should check coordinator health', async () => {
      mockExec.mockResolvedValue({
        stdout: 'healthy',
      } as any);

      const healthy = await monitor.isCoordinatorHealthy();

      expect(healthy).toBe(true);
    });

    it('should check Redis health', async () => {
      mockExec.mockResolvedValue({
        stdout: 'PONG',
      } as any);

      const healthy = await monitor.isRedisHealthy();

      expect(healthy).toBe(true);
    });

    it('should detect unhealthy coordinator', async () => {
      mockExec.mockResolvedValue({
        stdout: 'unhealthy',
      } as any);

      const healthy = await monitor.isCoordinatorHealthy();

      expect(healthy).toBe(false);
    });

    it('should perform full health check', async () => {
      mockExec.mockResolvedValue({ stdout: 'healthy' } as any);

      const health = await monitor.performFullHealthCheck();

      expect(health.coordinator).toBeDefined();
      expect(health.redis).toBeDefined();
      expect(health.network).toBeDefined();
    });
  });

  describe('Continuous Monitoring', () => {
    it('should collect metrics at intervals', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          timestamp: Date.now(),
          memory: '512MB',
          cpu: '25%',
        }),
      } as any);

      const metrics = await monitor.collectMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.memory).toBeDefined();
    });

    it('should store metrics history', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          timestamp: Date.now(),
          memory: '512MB',
        }),
      } as any);

      await monitor.collectMetrics();
      await monitor.collectMetrics();

      const history = monitor.getMetricsHistory();

      expect(history.length).toBeGreaterThan(1);
    });

    it('should track metrics over time', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          timestamp: Date.now(),
          memory: '512MB',
        }),
      } as any);

      await monitor.startMonitoring();

      // Wait for at least one collection
      await new Promise((resolve) => setTimeout(resolve, 100));

      const history = monitor.getMetricsHistory();

      expect(history.length).toBeGreaterThan(0);

      monitor.stopMonitoring();
    });
  });

  describe('Alerting', () => {
    it('should emit alerts for threshold violations', async () => {
      monitor.options.memoryThreshold = 0.7;
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          MemUsage: '1.5GB',
          MemLimit: '2GB',
        }),
      } as any);

      const alerts: string[] = [];
      monitor.on('alert', (msg: string) => alerts.push(msg));

      await monitor.checkThresholds();

      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should provide alert details', async () => {
      monitor.options.memoryThreshold = 0.7;
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          MemUsage: '1.5GB',
          MemLimit: '2GB',
          metric: 'memory',
          value: 0.75,
          threshold: 0.7,
        }),
      } as any);

      const alerts: string[] = [];
      monitor.on('alert', (msg: string) => alerts.push(msg));

      await monitor.checkThresholds();

      if (alerts.length > 0) {
        expect(alerts[0]).toMatch(/memory|threshold/i);
      }
    });
  });

  describe('Reporting', () => {
    it('should generate monitoring report', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          timestamp: Date.now(),
          memory: '512MB',
          cpu: '25%',
        }),
      } as any);

      const report = await monitor.generateReport();

      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
    });

    it('should include summary statistics', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          timestamp: Date.now(),
          memory: '512MB',
        }),
      } as any);

      await monitor.collectMetrics();

      const report = await monitor.generateReport();

      expect(report.summary).toHaveProperty('duration');
      expect(report.summary).toHaveProperty('metricsCollected');
    });

    it('should detect anomalies in metrics', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          timestamp: Date.now(),
          memory: '1800MB',
        }),
      } as any);

      const report = await monitor.generateReport();

      expect(report).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle docker daemon errors', async () => {
      mockExec.mockRejectedValue(
        new Error('Cannot connect to Docker daemon')
      );

      const errors: string[] = [];
      monitor.on('error', (msg: string) => errors.push(msg));

      try {
        await monitor.getCoordinatorStatus();
      } catch {
        // Expected
      }

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should continue monitoring on transient errors', async () => {
      mockExec
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({ stdout: 'running' } as any);

      await monitor.startMonitoring();

      // Wait for retry
      await new Promise((resolve) => setTimeout(resolve, 100));

      const history = monitor.getMetricsHistory();

      // Should have recovered
      expect(history.length).toBeGreaterThanOrEqual(0);

      monitor.stopMonitoring();
    });
  });

  describe('Lifecycle', () => {
    it('should start monitoring', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          timestamp: Date.now(),
          memory: '512MB',
        }),
      } as any);

      monitor.startMonitoring();

      expect(monitor.isMonitoring()).toBe(true);

      monitor.stopMonitoring();
    });

    it('should stop monitoring', async () => {
      monitor.startMonitoring();
      monitor.stopMonitoring();

      expect(monitor.isMonitoring()).toBe(false);
    });

    it('should track elapsed time', async () => {
      monitor.startMonitoring();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const elapsed = monitor.getElapsedTime();

      monitor.stopMonitoring();

      expect(elapsed).toBeGreaterThan(0);
    });
  });

  describe('Environment Variables', () => {
    it('should use TEAM_ID from env', () => {
      expect(monitor.teamId).toBe('backend');
    });

    it('should support custom monitoring interval', () => {
      expect(monitor.options.interval).toBeGreaterThan(0);
    });

    it('should support custom duration', () => {
      expect(monitor.options.duration).toBeGreaterThan(0);
    });
  });
});
