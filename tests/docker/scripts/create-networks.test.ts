/**
 * Create Networks Test Suite
 * Tests for creating CFN Docker networks
 *
 * Migrated from: docker/scripts/create-networks.sh
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CreateNetworks, NetworkConfig } from '../../../src/docker/scripts/create-networks';
import { exec } from 'execa';

jest.mock('execa');

describe('CreateNetworks', () => {
  let createNetworks: CreateNetworks;
  const mockExec = exec as jest.MockedFunction<typeof exec>;

  beforeEach(() => {
    jest.clearAllMocks();
    createNetworks = new CreateNetworks({
      dryRun: false,
    });
  });

  describe('Configuration', () => {
    it('should parse --dry-run flag', () => {
      const networks = new CreateNetworks({
        dryRun: true,
      });
      expect(networks.options.dryRun).toBe(true);
    });

    it('should initialize with default networks', () => {
      const expectedNetworks = [
        'cfn-coordination',
        'team-frontend',
        'team-backend',
        'team-devops',
        'team-qa',
        'team-seo',
        'team-marketing',
        'team-csuite',
      ];

      expect(createNetworks.networks.length).toBe(expectedNetworks.length);
    });
  });

  describe('Network Creation', () => {
    it('should create coordination network', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await createNetworks.createCoordinationNetwork();

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('docker network create'),
        expect.any(Object)
      );
    });

    it('should create team networks', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await createNetworks.createTeamNetworks();

      const calls = mockExec.mock.calls;
      expect(calls.length).toBeGreaterThan(1);
    });

    it('should handle existing network gracefully', async () => {
      mockExec.mockRejectedValue({
        message: 'Error response from daemon: network with name cfn-coordination already exists',
      });

      const result = await createNetworks.createNetwork('cfn-coordination', '172.18.0.0/24', '172.18.0.1', 'coordination');

      expect(result).toEqual({
        success: false,
        exists: true,
        message: expect.stringContaining('already exists'),
      });
    });

    it('should assign correct subnets to each team network', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      const networkMap = new Map([
        ['team-frontend', '172.18.1.0/24'],
        ['team-backend', '172.18.2.0/24'],
        ['team-devops', '172.18.3.0/24'],
      ]);

      for (const [name, subnet] of networkMap) {
        await createNetworks.createNetwork(name, subnet, subnet.replace('.0/24', '.1'), 'team');
      }

      const calls = mockExec.mock.calls;
      const callStrings = calls.map((c) => c[0]);

      for (const [name, subnet] of networkMap) {
        const relevantCall = callStrings.find((c) => c.includes(subnet));
        expect(relevantCall).toBeDefined();
      }
    });

    it('should set correct gateway for each network', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      const gateways = ['172.18.0.1', '172.18.1.1', '172.18.2.1'];

      for (const gateway of gateways) {
        await createNetworks.createNetwork(
          `test-${gateway}`,
          gateway.replace('.1', '.0/24'),
          gateway,
          'test'
        );
      }

      const calls = mockExec.mock.calls;
      for (const gateway of gateways) {
        const hasGateway = calls.some((c) => c[0].includes(gateway));
        expect(hasGateway).toBe(true);
      }
    });
  });

  describe('Dry Run Mode', () => {
    it('should not execute commands in dry-run mode', async () => {
      createNetworks.options.dryRun = true;

      await createNetworks.createNetwork(
        'test-network',
        '172.18.0.0/24',
        '172.18.0.1',
        'test'
      );

      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should log actions in dry-run mode', async () => {
      createNetworks.options.dryRun = true;
      const logs: string[] = [];
      createNetworks.on('log', (msg: string) => logs.push(msg));

      await createNetworks.createNetwork(
        'test-network',
        '172.18.0.0/24',
        '172.18.0.1',
        'test'
      );

      expect(logs.some((l) => l.includes('[DRY RUN]'))).toBe(true);
    });
  });

  describe('Network Labels', () => {
    it('should set cfn.network label', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await createNetworks.createNetwork(
        'cfn-coordination',
        '172.18.0.0/24',
        '172.18.0.1',
        'coordination'
      );

      const call = mockExec.mock.calls[0][0];
      expect(call).toContain('--label');
      expect(call).toContain('cfn.network=coordination');
    });

    it('should set bridge driver', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await createNetworks.createNetwork(
        'test-net',
        '172.18.0.0/24',
        '172.18.0.1',
        'test'
      );

      const call = mockExec.mock.calls[0][0];
      expect(call).toContain('--driver');
      expect(call).toContain('bridge');
    });
  });

  describe('Network Validation', () => {
    it('should verify network was created', async () => {
      mockExec.mockResolvedValue({ stdout: 'network-id' } as any);

      const result = await createNetworks.verifyNetworkExists('test-network');

      expect(result).toBe(true);
    });

    it('should detect missing network', async () => {
      mockExec.mockRejectedValue(
        new Error('Error: No such network')
      );

      const result = await createNetworks.verifyNetworkExists('missing-network');

      expect(result).toBe(false);
    });

    it('should get network details', async () => {
      mockExec.mockResolvedValue({
        stdout: JSON.stringify({
          Name: 'cfn-coordination',
          Subnet: '172.18.0.0/24',
          Gateway: '172.18.0.1',
        }),
      } as any);

      const details = await createNetworks.getNetworkDetails('cfn-coordination');

      expect(details.Name).toBe('cfn-coordination');
      expect(details.Subnet).toBe('172.18.0.0/24');
    });
  });

  describe('Error Handling', () => {
    it('should handle docker daemon errors', async () => {
      mockExec.mockRejectedValue(
        new Error('Cannot connect to Docker daemon')
      );

      await expect(createNetworks.createNetwork(
        'test',
        '172.18.0.0/24',
        '172.18.0.1',
        'test'
      )).rejects.toThrow();
    });

    it('should report network creation errors', async () => {
      mockExec.mockRejectedValue(
        new Error('Invalid subnet specification')
      );

      const errors: string[] = [];
      createNetworks.on('error', (msg: string) => errors.push(msg));

      try {
        await createNetworks.createNetwork(
          'bad-net',
          'invalid-subnet',
          '172.18.0.1',
          'test'
        );
      } catch {
        // Expected
      }

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Complete Network Setup', () => {
    it('should create all networks in correct order', async () => {
      mockExec.mockResolvedValue({ exitCode: 0 } as any);

      await createNetworks.createAllNetworks();

      const calls = mockExec.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(8);

      // Verify coordination network is first
      const firstCall = calls[0][0];
      expect(firstCall).toContain('cfn-coordination');
    });

    it('should verify all networks were created', async () => {
      mockExec.mockResolvedValue({ stdout: 'network-id' } as any);

      const allExist = await createNetworks.verifyAllNetworks();

      expect(allExist).toBe(true);
    });

    it('should handle partial failure', async () => {
      mockExec
        .mockResolvedValueOnce({ exitCode: 0 } as any) // coordination
        .mockRejectedValueOnce(new Error('Network error')) // team-frontend
        .mockResolvedValue({ exitCode: 0 } as any); // rest

      const results = await createNetworks.createAllNetworksWithStatus();

      expect(results.some((r) => !r.success)).toBe(true);
      expect(results.some((r) => r.success)).toBe(true);
    });
  });
});
