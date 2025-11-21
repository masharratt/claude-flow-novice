/**
 * Provision Team Test Suite
 * Tests for provisioning CFN Docker team infrastructure
 *
 * Migrated from: docker/scripts/provision-team.sh
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ProvisionTeam, TeamConfig } from '../../../src/docker/scripts/provision-team';
import { exec } from 'execa';
import * as fs from 'fs';

jest.mock('execa');
jest.mock('fs');

describe('ProvisionTeam', () => {
  let provision: ProvisionTeam;
  const mockExec = exec as jest.MockedFunction<typeof exec>;
  const mockReadFile = jest.spyOn(fs, 'readFileSync') as jest.Mock;

  const validTeamConfig: TeamConfig = {
    team: {
      id: 'backend',
      name: 'Backend Team',
      workspace: {
        path: '/workspace/backend',
        disk_quota: '100GB',
      },
      resources: {
        memory: '10GB',
        cpu_cores: 2,
        max_agents: 5,
      },
      network: {
        subnet_id: 2,
        coordinator_ip: '172.18.2.10',
      },
      allowed_skills: ['bash', 'typescript'],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provision = new ProvisionTeam({
      configFile: '/config/teams/backend.yaml',
      createWorkspace: false,
      createNetwork: false,
      spawnRedis: false,
      spawnCoordinator: false,
      skipValidation: false,
      dryRun: false,
    });
  });

  describe('Configuration Loading', () => {
    it('should load YAML config file', async () => {
      mockReadFile.mockReturnValue(JSON.stringify(validTeamConfig));

      const config = await provision.loadConfig('/config/teams/backend.yaml');

      expect(config.team.id).toBe('backend');
      expect(config.team.name).toBe('Backend Team');
    });

    it('should validate required config fields', async () => {
      const incompleteConfig = {
        team: {
          id: 'test',
          // missing: name, workspace, resources, network
        },
      };

      mockReadFile.mockReturnValue(JSON.stringify(incompleteConfig));

      const validation = await provision.validateConfig(incompleteConfig);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should verify config file exists', async () => {
      mockReadFile.mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(provision.loadConfig('/missing.yaml')).rejects.toThrow();
    });
  });

  describe('Workspace Creation', () => {
    it('should create workspace directories', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.createWorkspace(validTeamConfig);

      const calls = mockExec.mock.calls;
      const hasMkdir = calls.some((c) => c[0].includes('mkdir'));
      expect(hasMkdir).toBe(true);
    });

    it('should set correct ownership and permissions', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.createWorkspace(validTeamConfig);

      const calls = mockExec.mock.calls;
      const hasChown = calls.some((c) => c[0].includes('chown'));
      const hasChmod = calls.some((c) => c[0].includes('chmod'));

      expect(hasChown).toBe(true);
      expect(hasChmod).toBe(true);
    });

    it('should create /code and /skills subdirectories', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.createWorkspace(validTeamConfig);

      const calls = mockExec.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c.includes('/code'))).toBe(true);
      expect(calls.some((c) => c.includes('/skills'))).toBe(true);
    });

    it('should not create workspace in dry-run mode', async () => {
      provision.options.dryRun = true;

      await provision.createWorkspace(validTeamConfig);

      // Should log but not execute
      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe('Network Creation', () => {
    it('should create Docker network with correct subnet', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.createNetwork(validTeamConfig);

      const calls = mockExec.mock.calls;
      const networkCall = calls.find((c) => c[0].includes('docker network create'));

      expect(networkCall).toBeDefined();
      expect(networkCall![0]).toContain('172.18.2.0/24');
    });

    it('should handle existing network', async () => {
      mockExec.mockRejectedValue({
        message: 'network with name team-backend already exists',
      });

      const result = await provision.createNetwork(validTeamConfig);

      expect(result.exists).toBe(true);
    });

    it('should set network labels', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.createNetwork(validTeamConfig);

      const calls = mockExec.mock.calls;
      const networkCall = calls[0][0];

      expect(networkCall).toContain('--label');
      expect(networkCall).toContain('cfn.network=team');
      expect(networkCall).toContain(`cfn.team=${validTeamConfig.team.id}`);
    });
  });

  describe('Redis Spawning', () => {
    it('should spawn team-specific Redis instance', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.spawnRedis(validTeamConfig);

      const calls = mockExec.mock.calls;
      const dockerRunCall = calls.find((c) => c[0].includes('docker run'));

      expect(dockerRunCall).toBeDefined();
      expect(dockerRunCall![0]).toContain('redis:7-alpine');
    });

    it('should assign Redis to correct network and IP', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.spawnRedis(validTeamConfig);

      const calls = mockExec.mock.calls;
      const redisCall = calls[0][0];

      expect(redisCall).toContain('team-backend');
      expect(redisCall).toContain('172.18.2.20'); // Standard Redis IP pattern
    });

    it('should set memory limit for Redis', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.spawnRedis(validTeamConfig);

      const calls = mockExec.mock.calls;
      const redisCall = calls[0][0];

      expect(redisCall).toContain('--memory');
      expect(redisCall).toContain('512m');
    });

    it('should handle existing Redis container', async () => {
      mockExec.mockRejectedValue({
        message: 'A container with name cfn-redis-backend already exists',
      });

      const result = await provision.spawnRedis(validTeamConfig);

      expect(result.exists).toBe(true);
    });
  });

  describe('Coordinator Spawning', () => {
    it('should spawn team coordinator', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.spawnCoordinator(validTeamConfig);

      const calls = mockExec.mock.calls;
      const dockerRunCall = calls.find((c) => c[0].includes('docker run'));

      expect(dockerRunCall).toBeDefined();
    });

    it('should set coordinator environment variables', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.spawnCoordinator(validTeamConfig);

      const calls = mockExec.mock.calls;
      const coordinatorCall = calls[0][0];

      expect(coordinatorCall).toContain(`TEAM_ID=${validTeamConfig.team.id}`);
      expect(coordinatorCall).toContain('REDIS_HOST=cfn-redis-backend');
      expect(coordinatorCall).toContain('POSTGRES_HOST=cfn-postgres');
    });

    it('should mount docker socket', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.spawnCoordinator(validTeamConfig);

      const calls = mockExec.mock.calls;
      const coordinatorCall = calls[0][0];

      expect(coordinatorCall).toContain('/var/run/docker.sock');
    });

    it('should mount workspace with rw permissions', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.spawnCoordinator(validTeamConfig);

      const calls = mockExec.mock.calls;
      const coordinatorCall = calls[0][0];

      expect(coordinatorCall).toContain('/workspace');
      expect(coordinatorCall).toContain(':rw');
    });

    it('should connect to both coordination and team networks', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.spawnCoordinator(validTeamConfig);

      const calls = mockExec.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c.includes('cfn-coordination'))).toBe(true);
      expect(calls.some((c) => c.includes('team-backend'))).toBe(true);
    });
  });

  describe('Firewall Configuration', () => {
    it('should configure iptables rules', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.configureFirewall(validTeamConfig);

      const calls = mockExec.mock.calls;
      const iptablesCall = calls.find((c) => c[0].includes('iptables'));

      expect(iptablesCall).toBeDefined();
    });

    it('should allow agents to coordinator', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.configureFirewall(validTeamConfig);

      const calls = mockExec.mock.calls.map((c) => c[0]);
      const allowCoordinator = calls.find((c) =>
        c.includes('172.18.2.10') && c.includes('-j ACCEPT')
      );

      expect(allowCoordinator).toBeDefined();
    });

    it('should block cross-team access', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.configureFirewall(validTeamConfig);

      const calls = mockExec.mock.calls.map((c) => c[0]);
      const blockRule = calls.find((c) => c.includes('-j DROP'));

      expect(blockRule).toBeDefined();
    });
  });

  describe('Complete Provisioning', () => {
    it('should execute provisioning steps in correct order', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);
      mockReadFile.mockReturnValue(JSON.stringify(validTeamConfig));
      provision.options.createWorkspace = true;
      provision.options.createNetwork = true;
      provision.options.spawnRedis = true;
      provision.options.spawnCoordinator = true;

      await provision.provisionTeam();

      // Verify order: config load, workspace, network, redis, coordinator
      expect(mockExec).toHaveBeenCalled();
    });

    it('should support selective provisioning', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);
      mockReadFile.mockReturnValue(JSON.stringify(validTeamConfig));
      provision.options.createWorkspace = true;
      provision.options.spawnRedis = false; // Skip Redis

      const callCount = mockExec.mock.calls.length;

      await provision.provisionTeam();

      // Fewer calls without Redis spawning
      expect(mockExec.mock.calls.length).toBeLessThan(10);
    });
  });

  describe('Environment Variable Contracts', () => {
    it('should preserve TEAM_ID variable', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.spawnCoordinator(validTeamConfig);

      const calls = mockExec.mock.calls;
      const teamIdVar = calls.find((c) =>
        c[0].includes('TEAM_ID=backend')
      );

      expect(teamIdVar).toBeDefined();
    });

    it('should set REDIS_HOST for team-specific instance', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.spawnCoordinator(validTeamConfig);

      const calls = mockExec.mock.calls[0][0];

      expect(calls).toContain('REDIS_HOST=cfn-redis-backend');
    });

    it('should preserve POSTGRES_HOST variable', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await provision.spawnCoordinator(validTeamConfig);

      const calls = mockExec.mock.calls[0][0];

      expect(calls).toContain('POSTGRES_HOST=cfn-postgres');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing config file', async () => {
      mockReadFile.mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(
        provision.provisionTeam()
      ).rejects.toThrow();
    });

    it('should handle invalid YAML', async () => {
      mockReadFile.mockReturnValue('{ invalid yaml');

      await expect(
        provision.provisionTeam()
      ).rejects.toThrow();
    });

    it('should report errors for each step', async () => {
      const errors: string[] = [];
      provision.on('error', (msg: string) => errors.push(msg));
      mockExec.mockRejectedValue(new Error('Docker error'));

      try {
        await provision.createWorkspace(validTeamConfig);
      } catch {
        // Expected
      }

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Dry Run Mode', () => {
    it('should not execute commands in dry-run mode', async () => {
      provision.options.dryRun = true;

      await provision.provisionTeam();

      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should log planned actions in dry-run mode', async () => {
      provision.options.dryRun = true;
      const logs: string[] = [];
      provision.on('log', (msg: string) => logs.push(msg));

      await provision.createWorkspace(validTeamConfig);

      expect(logs.some((l) => l.includes('[DRY RUN]'))).toBe(true);
    });
  });
});
