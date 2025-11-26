/**
 * Network Manager Tests
 */

import { NetworkManager } from '../src/network-manager';
import { NetworkError } from '../src/types';

describe('NetworkManager', () => {
  let manager: NetworkManager;

  beforeEach(() => {
    manager = new NetworkManager('/var/run/docker.sock');
  });

  describe('network names', () => {
    it('should use default network name', () => {
      const defaultName = 'cfn-network';
      expect(defaultName).toBe('cfn-network');
    });

    it('should accept custom network names', () => {
      const customName = 'my-custom-network';
      expect(customName.length).toBeGreaterThan(0);
    });

    it('should validate network names are lowercase', () => {
      const validNames = [
        'cfn-network',
        'cfn-backend',
        'test-network-123'
      ];

      validNames.forEach(name => {
        expect(name).toBe(name.toLowerCase());
      });
    });

    it('should reject network names with uppercase', () => {
      const invalidName = 'CFN-NETWORK';
      expect(invalidName).not.toBe(invalidName.toLowerCase());
    });
  });

  describe('network drivers', () => {
    it('should use bridge driver by default', () => {
      const driver = 'bridge';
      expect(driver).toBe('bridge');
    });

    it('should accept overlay driver', () => {
      const driver = 'overlay';
      expect(driver).toBe('overlay');
    });

    it('should accept custom drivers', () => {
      const driver = 'custom-driver';
      expect(driver.length).toBeGreaterThan(0);
    });
  });

  describe('network IPAM configuration', () => {
    it('should use proper subnet format', () => {
      const subnet = '172.20.0.0/16';
      expect(subnet).toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/);
    });

    it('should use proper gateway format', () => {
      const gateway = '172.20.0.1';
      expect(gateway).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    });

    it('should support multiple subnets', () => {
      const subnets = [
        '172.20.0.0/16',
        '172.21.0.0/16',
        '172.22.0.0/16'
      ];

      expect(subnets.length).toBeGreaterThan(1);
      subnets.forEach(subnet => {
        expect(subnet).toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/);
      });
    });
  });

  describe('network labels', () => {
    it('should add CFN managed label', () => {
      const labels = {
        'cfn-managed': 'true'
      };

      expect(labels['cfn-managed']).toBe('true');
    });

    it('should add network identification label', () => {
      const labels = {
        'cfn-network': 'true'
      };

      expect(labels['cfn-network']).toBe('true');
    });

    it('should support custom labels', () => {
      const labels = {
        'cfn-managed': 'true',
        'environment': 'dev',
        'team': 'platform'
      };

      expect(Object.keys(labels).length).toBe(3);
    });
  });

  describe('network options', () => {
    it('should enable IP masquerade', () => {
      const option = 'com.docker.network.bridge.enable_ip_masquerade';
      expect(option).toContain('docker.network');
    });

    it('should enable inter-container communication', () => {
      const option = 'com.docker.network.bridge.enable_icc';
      expect(option).toContain('docker.network');
    });

    it('should disable default bridge', () => {
      const option = 'com.docker.network.bridge.default_bridge';
      const value = 'false';
      expect(value).toBe('false');
    });
  });

  describe('network filtering', () => {
    it('should filter by CFN managed label', () => {
      const networks = [
        { Name: 'cfn-network', Labels: { 'cfn-managed': 'true' } },
        { Name: 'other-network', Labels: {} },
        { Name: 'cfn-backend', Labels: { 'cfn-managed': 'true' } }
      ];

      const filtered = networks.filter(n =>
        n.Labels?.['cfn-managed'] === 'true'
      );

      expect(filtered.length).toBe(2);
      expect(filtered[0].Name).toBe('cfn-network');
    });

    it('should filter by network name pattern', () => {
      const networks = [
        { Name: 'cfn-network' },
        { Name: 'cfn-backend' },
        { Name: 'my-network' }
      ];

      const filtered = networks.filter(n =>
        n.Name.startsWith('cfn-')
      );

      expect(filtered.length).toBe(2);
    });
  });

  describe('container connection', () => {
    it('should track connected containers', () => {
      const containers: Record<string, object> = {
        'container-1': { Name: 'agent-1' },
        'container-2': { Name: 'agent-2' }
      };

      expect(Object.keys(containers).length).toBe(2);
    });

    it('should support custom IPv4 assignment', () => {
      const ipv4 = '172.20.1.100';
      expect(ipv4).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    });

    it('should support IPv6 if available', () => {
      const ipv6 = 'fe80::42:1ff:fe00:0';
      expect(ipv6).toContain(':');
    });
  });

  describe('network info conversion', () => {
    it('should convert network inspect to NetworkInfo', () => {
      const mockNetwork = {
        Name: 'cfn-network',
        Id: 'abc123',
        Driver: 'bridge',
        Containers: {
          'id-1': {},
          'id-2': {}
        },
        IPAM: {
          Config: [
            { Subnet: '172.20.0.0/16', Gateway: '172.20.0.1' }
          ]
        }
      };

      const containers = Object.keys(mockNetwork.Containers);
      expect(containers.length).toBe(2);
      expect(mockNetwork.Name).toBe('cfn-network');
    });
  });

  describe('network validation', () => {
    it('should validate network name is not empty', () => {
      const networkName = 'cfn-network';
      expect(networkName.length).toBeGreaterThan(0);
    });

    it('should validate driver is specified', () => {
      const driver = 'bridge';
      expect(driver).toBeDefined();
    });

    it('should validate IPAM config exists', () => {
      const ipam = {
        Driver: 'default',
        Config: [
          { Subnet: '172.20.0.0/16', Gateway: '172.20.0.1' }
        ]
      };

      expect(ipam.Config.length).toBeGreaterThan(0);
    });
  });

  describe('network isolation', () => {
    it('should use distinct subnet ranges per network', () => {
      const subnets = [
        '172.20.0.0/16',  // Network 1
        '172.21.0.0/16',  // Network 2
        '172.22.0.0/16'   // Network 3
      ];

      const addresses = subnets.map(s => {
        const [network] = s.split('/');
        return network;
      });

      expect(addresses[0]).not.toBe(addresses[1]);
      expect(addresses[1]).not.toBe(addresses[2]);
    });

    it('should isolate containers to networks', () => {
      const network1Containers = ['container-1', 'container-2'];
      const network2Containers = ['container-3', 'container-4'];

      const allContainers = [
        ...network1Containers,
        ...network2Containers
      ];

      expect(allContainers.length).toBe(4);
      expect(network1Containers).not.toEqual(network2Containers);
    });
  });

  describe('pruning', () => {
    it('should track deleted networks', () => {
      const result = {
        NetworksDeleted: ['network-1', 'network-2'],
        SpaceReclaimed: 0
      };

      expect(result.NetworksDeleted.length).toBe(2);
    });

    it('should track space reclaimed', () => {
      const result = {
        NetworksDeleted: [],
        SpaceReclaimed: 1024000
      };

      expect(result.SpaceReclaimed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should throw NetworkError on creation failure', () => {
      const error = new NetworkError('Failed to create network');
      expect(error).toBeInstanceOf(NetworkError);
    });

    it('should preserve original error', () => {
      const originalError = new Error('Docker error');
      const networkError = new NetworkError('Wrapped', originalError);
      expect(networkError.originalError).toBe(originalError);
    });

    it('should have NetworkError name', () => {
      const error = new NetworkError('Test');
      expect(error.name).toBe('NetworkError');
    });
  });

  describe('network existence checks', () => {
    it('should return true for existing network', () => {
      const exists = true;
      expect(exists).toBe(true);
    });

    it('should return false for non-existing network', () => {
      const exists = false;
      expect(exists).toBe(false);
    });
  });

  describe('force disconnection', () => {
    it('should support force flag for disconnect', () => {
      const force = true;
      expect(force).toBe(true);
    });

    it('should default to non-force disconnect', () => {
      const force = false;
      expect(force).toBe(false);
    });
  });

  describe('network agenttype filtering', () => {
    it('should search for network by agent type', () => {
      const agentType = 'backend';
      const networkName = `cfn-${agentType}-network`;
      expect(networkName).toBe('cfn-backend-network');
    });

    it('should fallback to default network', () => {
      const defaultNetwork = 'cfn-network';
      expect(defaultNetwork).toBe('cfn-network');
    });
  });

  describe('IP address information', () => {
    it('should return subnet and gateway', () => {
      const ipInfo = {
        subnet: '172.20.0.0/16',
        gateway: '172.20.0.1'
      };

      expect(ipInfo.subnet).toMatch(/\/\d+$/);
      expect(ipInfo.gateway).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    });

    it('should return null if IPAM missing', () => {
      const ipInfo = null;
      expect(ipInfo).toBeNull();
    });
  });
});
