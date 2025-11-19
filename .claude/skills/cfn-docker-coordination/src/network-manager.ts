/**
 * Network Manager
 * Handles Docker network creation and management for CFN agents
 */

import Docker from 'dockerode';
import { NetworkError, NetworkInfo } from './types';

/**
 * Docker network manager for CFN infrastructure
 */
export class NetworkManager {
  private docker: Docker;
  private readonly defaultNetworkName: string = 'cfn-network';
  private readonly networkDriver: string = 'bridge';

  /**
   * Initialize network manager
   * @param socketPath Path to Docker socket
   */
  constructor(socketPath: string = '/var/run/docker.sock') {
    this.docker = new Docker({
      socketPath: socketPath
    });
  }

  /**
   * Create CFN network if it doesn't exist
   * @param networkName Network name (default: cfn-network)
   * @returns Network object
   */
  async createNetworkIfMissing(networkName: string = this.defaultNetworkName): Promise<Docker.Network> {
    try {
      // Check if network already exists
      try {
        const network = await this.getNetwork(networkName);
        return network;
      } catch {
        // Network doesn't exist, create it
      }

      // Create network with bridge driver
      const network = await this.docker.createNetwork({
        Name: networkName,
        Driver: this.networkDriver,
        IPAM: {
          Config: [
            {
              Subnet: '172.20.0.0/16',
              Gateway: '172.20.0.1'
            }
          ]
        },
        Options: {
          'com.docker.network.bridge.default_bridge': 'false',
          'com.docker.network.bridge.enable_ip_masquerade': 'true',
          'com.docker.network.bridge.enable_icc': 'true'
        },
        Labels: {
          'cfn-managed': 'true',
          'cfn-network': 'true'
        }
      });

      return network;
    } catch (error) {
      throw new NetworkError(
        `Failed to create network: ${networkName}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get network by name or ID
   * @param nameOrId Network name or ID
   * @returns Network object
   */
  async getNetwork(nameOrId: string): Promise<Docker.Network> {
    try {
      return this.docker.getNetwork(nameOrId);
    } catch (error) {
      throw new NetworkError(
        `Network not found: ${nameOrId}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Verify network exists and is accessible
   * @param networkName Network name
   * @returns true if network exists and is accessible
   */
  async verifyNetworkExists(networkName: string = this.defaultNetworkName): Promise<boolean> {
    try {
      await this.getNetwork(networkName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all CFN-managed networks
   * @returns Array of network information
   */
  async listCfnNetworks(): Promise<NetworkInfo[]> {
    try {
      const networks = await this.docker.listNetworks();

      return networks
        .filter(n => n.Labels?.['cfn-managed'] === 'true')
        .map(n => this.convertToNetworkInfo(n));
    } catch (error) {
      throw new NetworkError(
        'Failed to list networks',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Connect container to network
   * @param network Docker network instance
   * @param container Docker container instance or ID
   * @param ipv4Address Optional IPv4 address to assign
   */
  async connectToNetwork(
    network: Docker.Network,
    container: Docker.Container | string,
    ipv4Address?: string
  ): Promise<void> {
    try {
      const containerId = typeof container === 'string'
        ? container
        : (await container.inspect()).Id;

      await network.connect({
        Container: containerId,
        EndpointConfig: ipv4Address ? {
          IPAMConfig: {
            IPv4Address: ipv4Address
          }
        } : undefined
      });
    } catch (error) {
      throw new NetworkError(
        'Failed to connect container to network',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Disconnect container from network
   * @param network Docker network instance
   * @param container Docker container instance or ID
   * @param force Force disconnection even if container is running
   */
  async disconnectFromNetwork(
    network: Docker.Network,
    container: Docker.Container | string,
    force: boolean = false
  ): Promise<void> {
    try {
      const containerId = typeof container === 'string'
        ? container
        : (await container.inspect()).Id;

      await network.disconnect({
        Container: containerId,
        Force: force
      });
    } catch (error) {
      throw new NetworkError(
        'Failed to disconnect container from network',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get network information
   * @param network Docker network instance
   * @returns Network information
   */
  async getNetworkInfo(network: Docker.Network): Promise<NetworkInfo> {
    try {
      const inspect = await network.inspect();
      return this.convertToNetworkInfo(inspect);
    } catch (error) {
      throw new NetworkError(
        'Failed to inspect network',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Remove network
   * @param network Docker network instance
   */
  async removeNetwork(network: Docker.Network): Promise<void> {
    try {
      await network.remove();
    } catch (error) {
      throw new NetworkError(
        'Failed to remove network',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Prune unused networks
   * @returns Pruning result
   */
  async pruneNetworks(): Promise<{
    NetworksDeleted: string[];
    SpaceReclaimed: number;
  }> {
    try {
      const result = await this.docker.pruneNetworks();
      return {
        NetworksDeleted: result.NetworksDeleted || [],
        SpaceReclaimed: (result as any).SpaceReclaimed || 0
      };
    } catch (error) {
      throw new NetworkError(
        'Failed to prune networks',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if container is connected to network
   * @param network Docker network instance
   * @param containerId Container ID
   * @returns true if connected
   */
  async isContainerConnected(
    network: Docker.Network,
    containerId: string
  ): Promise<boolean> {
    try {
      const info = await this.getNetworkInfo(network);
      return Object.keys(info.containers).includes(containerId);
    } catch {
      return false;
    }
  }

  /**
   * Get all containers connected to network
   * @param network Docker network instance
   * @returns Array of container IDs
   */
  async getNetworkContainers(network: Docker.Network): Promise<string[]> {
    try {
      const info = await this.getNetworkInfo(network);
      return info.containers;
    } catch (error) {
      throw new NetworkError(
        'Failed to get network containers',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create or get network
   * @param networkName Network name
   * @returns Network object
   */
  async ensureNetwork(networkName: string = this.defaultNetworkName): Promise<Docker.Network> {
    try {
      const exists = await this.verifyNetworkExists(networkName);

      if (exists) {
        return await this.getNetwork(networkName);
      }

      return await this.createNetworkIfMissing(networkName);
    } catch (error) {
      throw new NetworkError(
        `Failed to ensure network exists: ${networkName}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Convert Docker network inspect result to NetworkInfo
   * @param network Docker network inspect result
   * @returns NetworkInfo object
   */
  private convertToNetworkInfo(
    network: Docker.NetworkInspectInfo
  ): NetworkInfo {
    return {
      name: network.Name,
      id: network.Id,
      driver: network.Driver,
      ipam: network.IPAM as any,
      containers: Object.keys(network.Containers || {})
    };
  }

  /**
   * Get network by agent type filter
   * @param agentType Agent type to filter by
   * @returns Network object or null
   */
  async getNetworkByAgentType(agentType: string): Promise<Docker.Network | null> {
    try {
      const networks = await this.listCfnNetworks();
      const network = networks.find(n =>
        n.name === `cfn-network` || n.name === `cfn-${agentType}-network`
      );

      if (!network) return null;

      return await this.getNetwork(network.name);
    } catch {
      return null;
    }
  }

  /**
   * Validate network configuration
   * @param networkName Network name to validate
   * @returns true if network is properly configured
   */
  async validateNetworkConfig(networkName: string): Promise<boolean> {
    try {
      const network = await this.getNetwork(networkName);
      const info = await this.getNetworkInfo(network);

      // Validate basic properties
      if (!info.driver) return false;
      if (!info.ipam) return false;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get network IP info
   * @param networkName Network name
   * @returns IP configuration info
   */
  async getNetworkIpInfo(networkName: string): Promise<{
    subnet: string;
    gateway: string;
  } | null> {
    try {
      const network = await this.getNetwork(networkName);
      const info = await this.getNetworkInfo(network);

      if (!info.ipam || !info.ipam.Config || info.ipam.Config.length === 0) {
        return null;
      }

      const config = info.ipam.Config[0];
      return {
        subnet: config.Subnet || '',
        gateway: config.Gateway || ''
      };
    } catch {
      return null;
    }
  }
}
