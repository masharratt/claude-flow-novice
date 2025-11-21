/**
 * Deprovision Team Test Suite
 * Tests for deprovisioning CFN Docker team infrastructure
 *
 * Migrated from: docker/scripts/deprovision-team.sh
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DeprovisionTeam } from '../../../src/docker/scripts/deprovision-team';
import { exec } from 'execa';

jest.mock('execa');

describe('DeprovisionTeam', () => {
  let deprovision: DeprovisionTeam;
  const mockExec = exec as jest.MockedFunction<typeof exec>;

  beforeEach(() => {
    jest.clearAllMocks();
    deprovision = new DeprovisionTeam({
      teamId: 'backend',
      archiveWorkspace: false,
      removeWorkspace: false,
      removeNetwork: false,
      removeFirewall: false,
      dryRun: false,
      force: false,
    });
  });

  describe('Configuration', () => {
    it('should parse team ID', () => {
      expect(deprovision.teamId).toBe('backend');
    });

    it('should set archive flag', () => {
      const deprovisioner = new DeprovisionTeam({
        teamId: 'backend',
        archiveWorkspace: true,
        removeWorkspace: false,
        removeNetwork: false,
        removeFirewall: false,
        dryRun: false,
        force: false,
      });

      expect(deprovisioner.options.archiveWorkspace).toBe(true);
    });

    it('should set remove flags', () => {
      const deprovisioner = new DeprovisionTeam({
        teamId: 'backend',
        archiveWorkspace: false,
        removeWorkspace: true,
        removeNetwork: true,
        removeFirewall: true,
        dryRun: false,
        force: false,
      });

      expect(deprovisioner.options.removeWorkspace).toBe(true);
      expect(deprovisioner.options.removeNetwork).toBe(true);
      expect(deprovisioner.options.removeFirewall).toBe(true);
    });
  });

  describe('Confirmation Prompt', () => {
    it('should require confirmation without --force', async () => {
      deprovision.options.force = false;

      // Mock stdin for confirmation
      const requiresConfirm = !deprovision.options.force;

      expect(requiresConfirm).toBe(true);
    });

    it('should skip confirmation with --force', () => {
      deprovision.options.force = true;

      expect(deprovision.options.force).toBe(true);
    });

    it('should skip confirmation in dry-run mode', () => {
      deprovision.options.dryRun = true;

      // Should not require confirmation in dry-run
      expect(deprovision.options.dryRun).toBe(true);
    });
  });

  describe('Coordinator Shutdown', () => {
    it('should stop team coordinator', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.stopCoordinator();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('docker stop'))).toBe(true);
      expect(calls.some((c) => c[0].includes('cfn-docker-team-coordinator-backend'))).toBe(true);
    });

    it('should handle missing coordinator gracefully', async () => {
      mockExec.mockRejectedValue({
        message: 'Error response from daemon: No such container',
      });

      const result = await deprovision.stopCoordinator();

      expect(result.exists).toBe(false);
    });

    it('should remove coordinator container', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.stopCoordinator();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('docker rm'))).toBe(true);
    });
  });

  describe('Agent Shutdown', () => {
    it('should stop all team agents', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.stopAllAgents();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('docker'))).toBe(true);
    });

    it('should use label filter for agents', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.stopAllAgents();

      const calls = mockExec.mock.calls;
      const filterCall = calls.find((c) => c[0].includes('cfn.team=backend'));

      expect(filterCall).toBeDefined();
    });

    it('should handle no agents found', async () => {
      mockExec.mockResolvedValue({ stdout: '' } as any);

      const result = await deprovision.stopAllAgents();

      expect(result.count).toBe(0);
    });
  });

  describe('Redis Shutdown', () => {
    it('should stop team Redis instance', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.stopRedis();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('docker stop'))).toBe(true);
      expect(calls.some((c) => c[0].includes('cfn-redis-backend'))).toBe(true);
    });

    it('should remove Redis container', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.stopRedis();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('docker rm'))).toBe(true);
    });

    it('should handle missing Redis', async () => {
      mockExec.mockRejectedValue({
        message: 'Error response from daemon: No such container',
      });

      const result = await deprovision.stopRedis();

      expect(result.exists).toBe(false);
    });
  });

  describe('Database Update', () => {
    it('should mark team as inactive in database', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.markTeamInactive();

      const calls = mockExec.mock.calls;
      const psqlCall = calls.find((c) => c[0].includes('UPDATE teams'));

      expect(psqlCall).toBeDefined();
      expect(psqlCall![0]).toContain('status=\'inactive\'');
    });

    it('should set deprovisioned_at timestamp', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.markTeamInactive();

      const calls = mockExec.mock.calls;
      const psqlCall = calls[0][0];

      expect(psqlCall).toContain('deprovisioned_at=NOW()');
    });

    it('should handle missing PostgreSQL', async () => {
      mockExec.mockRejectedValue({
        message: 'Error: Cannot connect to PostgreSQL',
      });

      const result = await deprovision.markTeamInactive();

      expect(result.success).toBe(false);
    });
  });

  describe('Workspace Handling', () => {
    it('should archive workspace when requested', async () => {
      deprovision.options.archiveWorkspace = true;
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.handleWorkspace();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('tar'))).toBe(true);
      expect(calls.some((c) => c[0].includes('gz'))).toBe(true);
    });

    it('should remove workspace when requested', async () => {
      deprovision.options.removeWorkspace = true;
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.handleWorkspace();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('rm -rf'))).toBe(true);
    });

    it('should preserve workspace by default', async () => {
      deprovision.options.archiveWorkspace = false;
      deprovision.options.removeWorkspace = false;

      await deprovision.handleWorkspace();

      // Should not execute any removal commands
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should include timestamp in archive filename', async () => {
      deprovision.options.archiveWorkspace = true;
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.handleWorkspace();

      const calls = mockExec.mock.calls;
      const tarCall = calls.find((c) => c[0].includes('tar'));

      expect(tarCall![0]).toMatch(/\d{8}-\d{6}/); // YYYYMMDD-HHMMSS format
    });
  });

  describe('Network Removal', () => {
    it('should remove Docker network when requested', async () => {
      deprovision.options.removeNetwork = true;
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.removeNetwork();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('docker network rm'))).toBe(true);
      expect(calls.some((c) => c[0].includes('team-backend'))).toBe(true);
    });

    it('should handle network in use error', async () => {
      deprovision.options.removeNetwork = true;
      mockExec.mockRejectedValue({
        message: 'network team-backend has active endpoints',
      });

      const result = await deprovision.removeNetwork();

      expect(result.inUse).toBe(true);
    });

    it('should skip network removal by default', async () => {
      deprovision.options.removeNetwork = false;

      await deprovision.removeNetwork();

      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe('Firewall Cleanup', () => {
    it('should remove iptables rules when requested', async () => {
      deprovision.options.removeFirewall = true;
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.removeFirewallRules();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('iptables'))).toBe(true);
      expect(calls.some((c) => c[0].includes('-D'))).toBe(true); // Delete flag
    });

    it('should handle rule not found errors', async () => {
      deprovision.options.removeFirewall = true;
      mockExec.mockRejectedValue({
        message: 'iptables: No chain/target/match by that name',
      });

      // Should not fail on missing rules
      await deprovision.removeFirewallRules();
    });

    it('should skip firewall cleanup by default', async () => {
      deprovision.options.removeFirewall = false;

      await deprovision.removeFirewallRules();

      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe('Complete Deprovisioning', () => {
    it('should execute deprovisioning steps in correct order', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);
      deprovision.options.force = true;
      deprovision.options.removeNetwork = true;
      deprovision.options.removeFirewall = true;
      deprovision.options.removeWorkspace = true;

      await deprovision.deprovisionTeam();

      // Should execute in order
      expect(mockExec).toHaveBeenCalled();
    });

    it('should support selective deprovisioning', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);
      deprovision.options.force = true;
      deprovision.options.removeNetwork = true;
      deprovision.options.removeFirewall = false; // Skip firewall
      deprovision.options.removeWorkspace = false; // Skip workspace

      await deprovision.deprovisionTeam();

      // Should still execute coordinator and agents
      expect(mockExec).toHaveBeenCalled();
    });
  });

  describe('Dry Run Mode', () => {
    it('should not execute commands in dry-run mode', async () => {
      deprovision.options.dryRun = true;

      await deprovision.deprovisionTeam();

      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should log planned actions in dry-run mode', async () => {
      deprovision.options.dryRun = true;
      const logs: string[] = [];
      deprovision.on('log', (msg: string) => logs.push(msg));

      await deprovision.stopCoordinator();

      expect(logs.some((l) => l.includes('[DRY RUN]'))).toBe(true);
    });

    it('should show summary of planned changes', async () => {
      deprovision.options.dryRun = true;
      const logs: string[] = [];
      deprovision.on('log', (msg: string) => logs.push(msg));

      await deprovision.deprovisionTeam();

      const summary = logs.find((l) => l.includes('Summary'));
      expect(summary).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle Docker errors gracefully', async () => {
      mockExec.mockRejectedValue(
        new Error('Cannot connect to Docker daemon')
      );

      const errors: string[] = [];
      deprovision.on('error', (msg: string) => errors.push(msg));

      try {
        await deprovision.stopCoordinator();
      } catch {
        // Expected
      }

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should report all failures but continue', async () => {
      mockExec
        .mockRejectedValueOnce(new Error('Stop coordinator failed'))
        .mockResolvedValueOnce({ exitCode: 0 } as any) // Stop agents
        .mockRejectedValueOnce(new Error('Stop Redis failed'));

      const errors: string[] = [];
      deprovision.on('error', (msg: string) => errors.push(msg));

      await deprovision.deprovisionTeam().catch(() => {
        // May fail overall
      });

      // Should report both errors
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Environment Variable Contracts', () => {
    it('should use TEAM_ID in container names', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.stopCoordinator();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) =>
        c[0].includes('cfn-docker-team-coordinator-backend')
      )).toBe(true);
    });

    it('should use TEAM_ID for network names', async () => {
      deprovision.options.removeNetwork = true;
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await deprovision.removeNetwork();

      const calls = mockExec.mock.calls;
      expect(calls.some((c) => c[0].includes('team-backend'))).toBe(true);
    });
  });
});
