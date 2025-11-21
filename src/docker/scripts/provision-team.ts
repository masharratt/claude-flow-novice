/**
 * Provision Team Module
 * TypeScript implementation for provisioning CFN Docker team infrastructure
 *
 * Migrated from: docker/scripts/provision-team.sh
 */

import { exec } from 'execa';
import { EventEmitter } from 'events';
import { ValidateTeamConfig, TeamConfig } from './validate-team-config';
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

export interface ProvisionTeamOptions {
  configFile: string;
  createWorkspace?: boolean;
  createNetwork?: boolean;
  spawnRedis?: boolean;
  spawnCoordinator?: boolean;
  skipValidation?: boolean;
  dryRun?: boolean;
}

/**
 * ProvisionTeam class - Provisions CFN Docker team infrastructure
 */
export class ProvisionTeam extends EventEmitter {
  options: Required<ProvisionTeamOptions>;
  validator: ValidateTeamConfig;

  constructor(options: ProvisionTeamOptions) {
    super();
    this.validator = new ValidateTeamConfig();
    this.options = {
      createWorkspace: options.createWorkspace ?? false,
      createNetwork: options.createNetwork ?? false,
      spawnRedis: options.spawnRedis ?? false,
      spawnCoordinator: options.spawnCoordinator ?? false,
      skipValidation: options.skipValidation ?? false,
      dryRun: options.dryRun ?? false,
      ...options,
    };
  }

  /**
   * Load config from file
   */
  async loadConfig(configFile: string): Promise<TeamConfig> {
    const content = readFileSync(configFile, 'utf-8');
    return parseYaml(content) as TeamConfig;
  }

  /**
   * Validate configuration
   */
  async validateConfig(config: TeamConfig): Promise<{ valid: boolean; errors: string[] }> {
    const result = this.validator.validateCompleteConfig(config);
    return {
      valid: result.valid,
      errors: result.errors,
    };
  }

  /**
   * Create workspace directory
   */
  async createWorkspace(config: TeamConfig): Promise<void> {
    const { path: workspacePath, disk_quota } = config.team.workspace;

    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would create: ${workspacePath}/code`);
      this.emit('log', `  [DRY RUN] Would create: ${workspacePath}/skills`);
      this.emit('log', `  [DRY RUN] Would set ownership to 1000:1000`);
      return;
    }

    try {
      await exec(`sudo mkdir -p "${workspacePath}/code"`, { shell: true });
      await exec(`sudo mkdir -p "${workspacePath}/skills"`, { shell: true });
      await exec(`sudo chown -R 1000:1000 "${workspacePath}"`, { shell: true });
      await exec(`sudo chmod -R 755 "${workspacePath}"`, { shell: true });

      this.emit('log', `  ✓ Created workspace at ${workspacePath}`);
    } catch (error) {
      this.emit('error', `Failed to create workspace: ${error}`);
      throw error;
    }
  }

  /**
   * Create Docker network
   */
  async createNetwork(config: TeamConfig): Promise<{ success: boolean; exists?: boolean }> {
    const { id } = config.team;
    const { subnet_id, coordinator_ip } = config.team.network;
    const networkName = `team-${id}`;
    const subnet = `172.18.${subnet_id}.0/24`;
    const gateway = `172.18.${subnet_id}.1`;

    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would create network: ${networkName}`);
      return { success: true };
    }

    try {
      const existsResult = await exec(`docker network inspect "${networkName}"`, {
        shell: true,
        reject: false,
      });

      if (existsResult.exitCode === 0) {
        this.emit('log', `  ⚠ Network already exists: ${networkName}`);
        return { success: false, exists: true };
      }

      const command = `docker network create \\
        --driver bridge \\
        --subnet "${subnet}" \\
        --gateway "${gateway}" \\
        --label cfn.network=team \\
        --label cfn.team="${id}" \\
        "${networkName}"`;

      await exec(command, { shell: true });
      this.emit('log', `  ✓ Created network: ${networkName} (${subnet})`);
      return { success: true };
    } catch (error) {
      this.emit('error', `Failed to create network: ${error}`);
      throw error;
    }
  }

  /**
   * Spawn team Redis instance
   */
  async spawnRedis(config: TeamConfig): Promise<{ success: boolean; exists?: boolean }> {
    const { id } = config.team;
    const { subnet_id } = config.team.network;
    const redisName = `cfn-redis-${id}`;
    const redisIp = `172.18.${subnet_id}.20`;
    const networkName = `team-${id}`;

    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would spawn: ${redisName}`);
      this.emit('log', `  [DRY RUN]   Network: ${networkName}`);
      this.emit('log', `  [DRY RUN]   IP: ${redisIp}`);
      return { success: true };
    }

    try {
      const existsResult = await exec(
        `docker ps -a --filter "name=${redisName}" --format '{{.Names}}'`,
        { shell: true, reject: false }
      );

      if (existsResult.stdout.includes(redisName)) {
        this.emit('log', `  ⚠ Redis container already exists: ${redisName}`);
        return { success: false, exists: true };
      }

      const command = `docker run -d \\
        --name "${redisName}" \\
        --network "${networkName}" \\
        --ip "${redisIp}" \\
        --memory 512m \\
        --cpus 0.5 \\
        --restart unless-stopped \\
        --label cfn.component=redis \\
        --label cfn.team="${id}" \\
        -v "cfn-redis-${id}-data:/data" \\
        redis:7-alpine \\
        redis-server --maxmemory 512mb --maxmemory-policy volatile-lru`;

      await exec(command, { shell: true });
      this.emit('log', `  ✓ Spawned Redis: ${redisName} at ${redisIp}`);
      return { success: true };
    } catch (error) {
      this.emit('error', `Failed to spawn Redis: ${error}`);
      throw error;
    }
  }

  /**
   * Spawn team coordinator
   */
  async spawnCoordinator(config: TeamConfig): Promise<{ success: boolean; exists?: boolean }> {
    const { id, name } = config.team;
    const { memory, cpu_cores, max_agents } = config.team.resources;
    const { coordinator_ip } = config.team.network;
    const coordinatorName = `cfn-docker-team-coordinator-${id}`;
    const networkName = `team-${id}`;
    const redisHost = `cfn-redis-${id}`;

    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would spawn: ${coordinatorName}`);
      return { success: true };
    }

    try {
      const existsResult = await exec(
        `docker ps -a --filter "name=${coordinatorName}" --format '{{.Names}}'`,
        { shell: true, reject: false }
      );

      if (existsResult.stdout.includes(coordinatorName)) {
        this.emit('log', `  ⚠ Coordinator container already exists: ${coordinatorName}`);
        return { success: false, exists: true };
      }

      // Convert memory to proper format (e.g., "10GB" -> "10g")
      const memoryFlag = memory.toLowerCase();

      const command = `docker run -d \\
        --name "${coordinatorName}" \\
        --network cfn-coordination \\
        --ip "${coordinator_ip}" \\
        --memory 2g \\
        --cpus 1.0 \\
        --restart unless-stopped \\
        --label cfn.component=team-coordinator \\
        --label cfn.team="${id}" \\
        -v /var/run/docker.sock:/var/run/docker.sock \\
        -v "/workspace/${id}:/workspace:rw" \\
        -e TEAM_ID="${id}" \\
        -e TEAM_NAME="${name}" \\
        -e REDIS_HOST="${redisHost}" \\
        -e POSTGRES_HOST=cfn-postgres \\
        -e BUDGET_ALLOCATED="${memoryFlag}" \\
        -e MAX_AGENTS="${max_agents}" \\
        cfn-docker-team-coordinator:latest`;

      await exec(command, { shell: true });

      // Connect to team network
      await exec(`docker network connect "${networkName}" "${coordinatorName}"`, {
        shell: true,
      });

      this.emit('log', `  ✓ Spawned coordinator: ${coordinatorName} at ${coordinator_ip}`);
      return { success: true };
    } catch (error) {
      this.emit('error', `Failed to spawn coordinator: ${error}`);
      throw error;
    }
  }

  /**
   * Configure firewall rules
   */
  async configureFirewall(config: TeamConfig): Promise<void> {
    const { id } = config.team;
    const { subnet_id, coordinator_ip } = config.team.network;

    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would configure iptables rules for team isolation`);
      return;
    }

    try {
      // Allow agents -> coordinator
      await exec(
        `sudo iptables -A DOCKER-USER -s "172.18.${subnet_id}.11/28" -d "${coordinator_ip}" -j ACCEPT`,
        { shell: true, reject: false }
      );

      // Allow agents -> Redis
      await exec(
        `sudo iptables -A DOCKER-USER -s "172.18.${subnet_id}.11/28" -d "172.18.${subnet_id}.20" -j ACCEPT`,
        { shell: true, reject: false }
      );

      // Block agents -> other networks
      for (let i = 1; i <= 7; i++) {
        if (i !== subnet_id) {
          await exec(
            `sudo iptables -A DOCKER-USER -s "172.18.${subnet_id}.11/28" -d "172.18.${i}.0/24" -j DROP`,
            { shell: true, reject: false }
          );
        }
      }

      this.emit('log', `  ✓ Configured firewall rules for team isolation`);
    } catch (error) {
      this.emit('error', `Failed to configure firewall: ${error}`);
    }
  }

  /**
   * Provision team infrastructure
   */
  async provisionTeam(): Promise<void> {
    this.emit('log', '📋 Reading team configuration...');

    const config = await this.loadConfig(this.options.configFile);

    this.emit('log', '✓ Team Configuration:');
    this.emit('log', `  ID: ${config.team.id}`);
    this.emit('log', `  Name: ${config.team.name}`);
    this.emit('log', `  Workspace: ${config.team.workspace.path}`);
    this.emit('log', `  Memory: ${config.team.resources.memory}`);
    this.emit('log', '');

    if (!this.options.skipValidation) {
      const validation = await this.validateConfig(config);
      if (!validation.valid) {
        throw new Error(`Config validation failed: ${validation.errors.join(', ')}`);
      }
    }

    if (this.options.createWorkspace) {
      this.emit('log', '📁 Creating workspace directory...');
      await this.createWorkspace(config);
      this.emit('log', '');
    }

    if (this.options.createNetwork) {
      this.emit('log', '🌐 Creating Docker network...');
      await this.createNetwork(config);
      this.emit('log', '');
    }

    if (this.options.spawnRedis) {
      this.emit('log', '🗄️  Spawning team Redis instance...');
      await this.spawnRedis(config);
      this.emit('log', '');
    }

    if (this.options.spawnCoordinator) {
      this.emit('log', '🚀 Spawning team coordinator...');
      await this.spawnCoordinator(config);
      this.emit('log', '');
    }

    if (this.options.createNetwork) {
      this.emit('log', '🔒 Configuring firewall rules...');
      await this.configureFirewall(config);
      this.emit('log', '');
    }

    this.emit('log', '✅ Team provisioning complete!');
  }
}
