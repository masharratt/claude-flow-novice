/**
 * Create Networks Module
 * TypeScript implementation for creating CFN Docker networks
 *
 * Migrated from: docker/scripts/create-networks.sh
 */

import { exec } from 'execa';
import { EventEmitter } from 'events';

export interface CreateNetworksOptions {
  dryRun?: boolean;
}

export interface NetworkResult {
  success: boolean;
  exists?: boolean;
  message: string;
}

export interface NetworkDetails {
  Name: string;
  Subnet?: string;
  Gateway?: string;
}

/**
 * CreateNetworks class - Creates CFN Docker networks
 */
export class CreateNetworks extends EventEmitter {
  options: Required<CreateNetworksOptions>;
  networks: string[] = [
    'cfn-coordination',
    'team-frontend',
    'team-backend',
    'team-devops',
    'team-qa',
    'team-seo',
    'team-marketing',
    'team-csuite',
  ];

  constructor(options: CreateNetworksOptions = {}) {
    super();
    this.options = {
      dryRun: options.dryRun ?? false,
    };
  }

  /**
   * Create a single Docker network
   */
  async createNetwork(
    name: string,
    subnet: string,
    gateway: string,
    networkType: string
  ): Promise<NetworkResult> {
    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would create: ${name}`);
      this.emit('log', `  [DRY RUN]   Subnet: ${subnet}`);
      this.emit('log', `  [DRY RUN]   Gateway: ${gateway}`);
      this.emit('log', `  [DRY RUN]   Type: ${networkType}`);
      return { success: true, message: `[DRY RUN] Would create ${name}` };
    }

    try {
      // Check if network already exists
      const existsResult = await exec(`docker network inspect "${name}"`, {
        shell: true,
        reject: false,
      });

      if (existsResult.exitCode === 0) {
        const message = `ℹ️  Network already exists: ${name}`;
        this.emit('log', `  ${message}`);
        return { success: false, exists: true, message };
      }

      // Create network
      const command = `docker network create \\
        --driver bridge \\
        --subnet "${subnet}" \\
        --gateway "${gateway}" \\
        --label cfn.network="${networkType}" \\
        "${name}"`;

      await exec(command, { shell: true });

      const message = `✓ Created: ${name} (${subnet})`;
      this.emit('log', `  ${message}`);
      return { success: true, message };
    } catch (error) {
      const message = `✗ Failed to create ${name}: ${error}`;
      this.emit('error', message);
      throw error;
    }
  }

  /**
   * Create coordination network
   */
  async createCoordinationNetwork(): Promise<NetworkResult> {
    this.emit('log', 'Creating coordination network...');
    return this.createNetwork(
      'cfn-coordination',
      '172.18.0.0/24',
      '172.18.0.1',
      'coordination'
    );
  }

  /**
   * Create team networks
   */
  async createTeamNetworks(): Promise<NetworkResult[]> {
    this.emit('log', 'Creating team networks...');

    const teamNetworks = [
      { name: 'team-frontend', subnet: 1 },
      { name: 'team-backend', subnet: 2 },
      { name: 'team-devops', subnet: 3 },
      { name: 'team-qa', subnet: 4 },
      { name: 'team-seo', subnet: 5 },
      { name: 'team-marketing', subnet: 6 },
      { name: 'team-csuite', subnet: 7 },
    ];

    const results: NetworkResult[] = [];

    for (const team of teamNetworks) {
      const result = await this.createNetwork(
        team.name,
        `172.18.${team.subnet}.0/24`,
        `172.18.${team.subnet}.1`,
        'team'
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Verify network exists
   */
  async verifyNetworkExists(name: string): Promise<boolean> {
    try {
      const result = await exec(`docker network inspect "${name}"`, {
        shell: true,
      });
      return result.exitCode === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get network details
   */
  async getNetworkDetails(name: string): Promise<NetworkDetails> {
    try {
      const result = await exec(
        `docker network inspect "${name}" --format '{{json .}}'`,
        { shell: true }
      );
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`Failed to get network details for ${name}`);
    }
  }

  /**
   * Verify all networks were created
   */
  async verifyAllNetworks(): Promise<boolean> {
    const allNetworks = ['cfn-coordination', ...this.networks.slice(1)];

    for (const network of allNetworks) {
      const exists = await this.verifyNetworkExists(network);
      if (!exists) {
        this.emit('error', `Network not found: ${network}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Create all networks and return status for each
   */
  async createAllNetworksWithStatus(): Promise<
    Array<{ network: string; success: boolean; error?: string }>
  > {
    const results: Array<{ network: string; success: boolean; error?: string }> =
      [];

    // Coordination network
    try {
      await this.createCoordinationNetwork();
      results.push({ network: 'cfn-coordination', success: true });
    } catch (error) {
      results.push({
        network: 'cfn-coordination',
        success: false,
        error: String(error),
      });
    }

    // Team networks
    const teamResults = await this.createTeamNetworks();
    const teamNetworks = [
      'team-frontend',
      'team-backend',
      'team-devops',
      'team-qa',
      'team-seo',
      'team-marketing',
      'team-csuite',
    ];

    for (let i = 0; i < teamResults.length; i++) {
      results.push({
        network: teamNetworks[i],
        success: teamResults[i].success,
      });
    }

    return results;
  }

  /**
   * Create all networks in correct order
   */
  async createAllNetworks(): Promise<void> {
    this.emit('log', '🌐 Creating CFN Docker Networks');
    this.emit('log', '');

    if (this.options.dryRun) {
      this.emit('log', '🔍 DRY RUN MODE - No changes will be made');
      this.emit('log', '');
    }

    await this.createCoordinationNetwork();
    this.emit('log', '');

    await this.createTeamNetworks();
    this.emit('log', '');

    this.emit('log', '✅ Network creation complete!');
    this.emit('log', '');

    this.emit('log', 'Networks created:');
    this.emit('log', '  - cfn-coordination (172.18.0.0/24)');
    this.emit('log', '  - team-frontend (172.18.1.0/24)');
    this.emit('log', '  - team-backend (172.18.2.0/24)');
    this.emit('log', '  - team-devops (172.18.3.0/24)');
    this.emit('log', '  - team-qa (172.18.4.0/24)');
    this.emit('log', '  - team-seo (172.18.5.0/24)');
    this.emit('log', '  - team-marketing (172.18.6.0/24)');
    this.emit('log', '  - team-csuite (172.18.7.0/24)');
    this.emit('log', '');

    this.emit('log', 'Verify with: docker network ls | grep "cfn\\|team"');
    this.emit('log', '');
  }
}

/**
 * Parse command-line arguments
 */
export function parseArgs(args: string[]): CreateNetworksOptions {
  const options: CreateNetworksOptions = {};

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}
