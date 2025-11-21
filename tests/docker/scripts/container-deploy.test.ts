/**
 * Container Deploy Test Suite
 * Tests for deploying CFN Docker containers
 *
 * Migrated from: docker/scripts/container-deploy-cfn-team.sh and container-deploy-cfn-team-fixed.sh
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ContainerDeploy } from '../../../src/docker/scripts/container-deploy';
import { exec } from 'execa';

jest.mock('execa');

describe('ContainerDeploy', () => {
  let deploy: ContainerDeploy;
  const mockExec = exec as jest.MockedFunction<typeof exec>;

  beforeEach(() => {
    jest.clearAllMocks();
    deploy = new ContainerDeploy({
      teamId: 'backend',
      action: 'deploy',
      dryRun: false,
    });
  });

  describe('Configuration', () => {
    it('should parse team ID', () => {
      expect(deploy.teamId).toBe('backend');
    });

    it('should parse action (deploy/redeploy/upgrade)', () => {
      const deployer = new ContainerDeploy({
        teamId: 'backend',
        action: 'redeploy',
        dryRun: false,
      });

      expect(deployer.options.action).toBe('redeploy');
    });

    it('should validate action is valid', () => {
      expect(() => {
        new ContainerDeploy({
          teamId: 'backend',
          action: 'invalid',
          dryRun: false,
        });
      }).toThrow();
    });
  });

  describe('Container Startup', () => {
    it('should start coordinator container', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.startCoordinator();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('docker run'))).toBe(true);
    });

    it('should set container name correctly', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.startCoordinator();

      const calls = mockExec.mock.calls;
      const runCall = calls.find((c) => c[0].includes('docker run'));

      expect(runCall![0]).toContain('--name');
      expect(runCall![0]).toContain('cfn-docker-team-coordinator-backend');
    });

    it('should mount docker socket', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.startCoordinator();

      const calls = mockExec.mock.calls;
      const runCall = calls[0][0];

      expect(runCall).toContain('/var/run/docker.sock');
    });

    it('should set memory limit', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.startCoordinator();

      const calls = mockExec.mock.calls;
      const runCall = calls[0][0];

      expect(runCall).toContain('--memory');
    });

    it('should connect to networks', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.startCoordinator();

      const calls = mockExec.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c.includes('cfn-coordination'))).toBe(true);
      expect(calls.some((c) => c.includes('team-backend'))).toBe(true);
    });

    it('should set environment variables', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.startCoordinator();

      const calls = mockExec.mock.calls;
      const runCall = calls[0][0];

      expect(runCall).toContain('-e');
      expect(runCall).toContain('TEAM_ID=backend');
    });

    it('should use restart policy', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.startCoordinator();

      const calls = mockExec.mock.calls;
      const runCall = calls[0][0];

      expect(runCall).toContain('--restart');
      expect(runCall).toContain('unless-stopped');
    });
  });

  describe('Health Checks', () => {
    it('should wait for coordinator readiness', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      const ready = await deploy.waitForCoordinatorReady();

      expect(ready).toBe(true);
    });

    it('should check container is running', async () => {
      mockExec.mockResolvedValue({ stdout: 'running' } as any);

      const running = await deploy.isCoordinatorRunning();

      expect(running).toBe(true);
    });

    it('should detect stopped container', async () => {
      mockExec.mockResolvedValue({ stdout: 'exited' } as any);

      const running = await deploy.isCoordinatorRunning();

      expect(running).toBe(false);
    });

    it('should retry health checks with backoff', async () => {
      mockExec
        .mockRejectedValueOnce(new Error('Container not ready'))
        .mockRejectedValueOnce(new Error('Container not ready'))
        .mockResolvedValueOnce({ exitCode: 0 } as any);

      const ready = await deploy.waitForCoordinatorReady(3, 100);

      expect(ready).toBe(true);
      expect(mockExec.mock.calls.length).toBeGreaterThan(1);
    });

    it('should timeout after max retries', async () => {
      mockExec.mockRejectedValue(new Error('Container not ready'));

      const ready = await deploy.waitForCoordinatorReady(2, 100);

      expect(ready).toBe(false);
    });
  });

  describe('Redeployment', () => {
    it('should stop existing container on redeploy', async () => {
      deploy.options.action = 'redeploy';
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.redeploy();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('docker stop'))).toBe(true);
    });

    it('should remove old container on redeploy', async () => {
      deploy.options.action = 'redeploy';
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.redeploy();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('docker rm'))).toBe(true);
    });

    it('should start new container after removal', async () => {
      deploy.options.action = 'redeploy';
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.redeploy();

      const calls = mockExec.mock.calls;
      const hasStop = calls.some((c) => c[0].includes('docker stop'));
      const hasStart = calls.some((c) => c[0].includes('docker run'));

      expect(hasStop && hasStart).toBe(true);
    });

    it('should handle missing container gracefully', async () => {
      mockExec.mockRejectedValue(
        new Error('Error response from daemon: No such container')
      );

      const result = await deploy.redeploy();

      // Should still proceed
      expect(result.success).toBeDefined();
    });
  });

  describe('Container Logs', () => {
    it('should retrieve container logs', async () => {
      mockExec.mockResolvedValue({
        stdout: 'Container started successfully',
      } as any);

      const logs = await deploy.getCoordinatorLogs();

      expect(logs).toContain('started');
    });

    it('should follow logs in real-time', async () => {
      mockExec.mockResolvedValue({ stdout: '' } as any);

      await deploy.followCoordinatorLogs();

      const calls = mockExec.mock.calls;
      const logsCall = calls.find((c) => c[0].includes('docker logs'));

      expect(logsCall![0]).toContain('-f');
    });

    it('should show recent logs', async () => {
      mockExec.mockResolvedValue({ stdout: 'Recent logs...' } as any);

      await deploy.getCoordinatorLogs(100);

      const calls = mockExec.mock.calls;
      const logsCall = calls[0][0];

      expect(logsCall).toContain('--tail');
    });
  });

  describe('Rollback', () => {
    it('should rollback to previous version', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      const result = await deploy.rollback();

      expect(result.success).toBe(true);
    });

    it('should save backup before upgrade', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.backup();

      // Should create a backup
      expect(mockExec).toHaveBeenCalled();
    });

    it('should restore from backup on rollback', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.rollback();

      const calls = mockExec.mock.calls;
      // Should restore from backup
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  describe('Dry Run Mode', () => {
    it('should not execute commands in dry-run mode', async () => {
      deploy.options.dryRun = true;

      await deploy.startCoordinator();

      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should log planned actions in dry-run mode', async () => {
      deploy.options.dryRun = true;
      const logs: string[] = [];
      deploy.on('log', (msg: string) => logs.push(msg));

      await deploy.startCoordinator();

      expect(logs.some((l) => l.includes('[DRY RUN]'))).toBe(true);
    });
  });

  describe('Environment Variables', () => {
    it('should set TEAM_ID env var', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.startCoordinator();

      const calls = mockExec.mock.calls;
      const runCall = calls[0][0];

      expect(runCall).toContain('TEAM_ID=backend');
    });

    it('should set REDIS_HOST for team', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.startCoordinator();

      const calls = mockExec.mock.calls;
      const runCall = calls[0][0];

      expect(runCall).toContain('REDIS_HOST=cfn-redis-backend');
    });

    it('should preserve required env vars', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deploy.startCoordinator();

      const calls = mockExec.mock.calls;
      const runCall = calls[0][0];

      expect(runCall).toContain('-e');
    });
  });

  describe('Error Handling', () => {
    it('should handle docker daemon errors', async () => {
      mockExec.mockRejectedValue(
        new Error('Cannot connect to Docker daemon')
      );

      const errors: string[] = [];
      deploy.on('error', (msg: string) => errors.push(msg));

      try {
        await deploy.startCoordinator();
      } catch {
        // Expected
      }

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should provide helpful error messages', async () => {
      mockExec.mockRejectedValue(
        new Error('Image cfn-docker-team-coordinator:latest not found')
      );

      const errors: string[] = [];
      deploy.on('error', (msg: string) => errors.push(msg));

      try {
        await deploy.startCoordinator();
      } catch {
        // Expected
      }

      expect(errors.some((e) => e.includes('Image'))).toBe(true);
    });
  });

  describe('Container Status', () => {
    it('should get container status', async () => {
      mockExec.mockResolvedValue({ stdout: 'running' } as any);

      const status = await deploy.getContainerStatus();

      expect(status).toBe('running');
    });

    it('should get container resource usage', async () => {
      mockExec.mockResolvedValue({
        stdout: 'MemUsage: 512MB / 2GB',
      } as any);

      const stats = await deploy.getContainerStats();

      expect(stats).toBeDefined();
    });

    it('should verify container health', async () => {
      mockExec.mockResolvedValue({ stdout: 'healthy' } as any);

      const healthy = await deploy.verifyHealth();

      expect(healthy).toBe(true);
    });
  });

  describe('Integration', () => {
    it('should deploy complete team setup', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      const result = await deploy.deploy();

      expect(result.success).toBe(true);
    });

    it('should handle deployment failures gracefully', async () => {
      mockExec.mockRejectedValue(new Error('Deployment failed'));

      const errors: string[] = [];
      deploy.on('error', (msg: string) => errors.push(msg));

      try {
        await deploy.deploy();
      } catch {
        // Expected
      }

      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
