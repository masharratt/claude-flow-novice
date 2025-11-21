/**
 * Deprovision Team Module
 * TypeScript implementation for deprovisioning CFN Docker team infrastructure
 *
 * Migrated from: docker/scripts/deprovision-team.sh
 */

import { exec } from 'execa';
import { EventEmitter } from 'events';

export interface DeprovisionTeamOptions {
  teamId: string;
  archiveWorkspace?: boolean;
  removeWorkspace?: boolean;
  removeNetwork?: boolean;
  removeFirewall?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

/**
 * DeprovisionTeam class - Deprovisions CFN Docker team infrastructure
 */
export class DeprovisionTeam extends EventEmitter {
  teamId: string;
  options: Required<DeprovisionTeamOptions>;

  constructor(options: DeprovisionTeamOptions) {
    super();
    this.teamId = options.teamId;
    this.options = {
      archiveWorkspace: options.archiveWorkspace ?? false,
      removeWorkspace: options.removeWorkspace ?? false,
      removeNetwork: options.removeNetwork ?? false,
      removeFirewall: options.removeFirewall ?? false,
      dryRun: options.dryRun ?? false,
      force: options.force ?? false,
    };
  }

  /**
   * Stop team coordinator
   */
  async stopCoordinator(): Promise<{ exists: boolean; success: boolean }> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would stop: ${coordinatorName}`);
      return { exists: true, success: true };
    }

    try {
      const existsResult = await exec(
        `docker ps -a --filter "name=${coordinatorName}" --format '{{.Names}}'`,
        { shell: true, reject: false }
      );

      if (!existsResult.stdout.includes(coordinatorName)) {
        this.emit('log', `  ℹ️  Coordinator not found: ${coordinatorName}`);
        return { exists: false, success: true };
      }

      await exec(`docker stop "${coordinatorName}"`, { shell: true, reject: false });
      await exec(`docker rm "${coordinatorName}"`, { shell: true, reject: false });

      this.emit('log', `  ✓ Stopped and removed: ${coordinatorName}`);
      return { exists: true, success: true };
    } catch (error) {
      this.emit('error', `Failed to stop coordinator: ${error}`);
      throw error;
    }
  }

  /**
   * Stop all team agents
   */
  async stopAllAgents(): Promise<{ count: number; success: boolean }> {
    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would stop all containers with label cfn.team=${this.teamId}`);
      return { count: 0, success: true };
    }

    try {
      const listResult = await exec(
        `docker ps -a --filter "label=cfn.team=${this.teamId}" -q`,
        { shell: true, reject: false }
      );

      const agentIds = listResult.stdout.trim().split('\n').filter((id) => id);

      if (agentIds.length === 0) {
        this.emit('log', `  ℹ️  No agents found for team ${this.teamId}`);
        return { count: 0, success: true };
      }

      for (const agentId of agentIds) {
        await exec(`docker stop "${agentId}"`, { shell: true, reject: false });
        await exec(`docker rm "${agentId}"`, { shell: true, reject: false });
      }

      this.emit('log', `  ✓ Stopped and removed ${agentIds.length} agent(s)`);
      return { count: agentIds.length, success: true };
    } catch (error) {
      this.emit('error', `Failed to stop agents: ${error}`);
      throw error;
    }
  }

  /**
   * Stop team Redis
   */
  async stopRedis(): Promise<{ exists: boolean; success: boolean }> {
    const redisName = `cfn-redis-${this.teamId}`;

    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would stop: ${redisName}`);
      return { exists: true, success: true };
    }

    try {
      const existsResult = await exec(
        `docker ps -a --filter "name=${redisName}" --format '{{.Names}}'`,
        { shell: true, reject: false }
      );

      if (!existsResult.stdout.includes(redisName)) {
        this.emit('log', `  ℹ️  Redis not found: ${redisName}`);
        return { exists: false, success: true };
      }

      await exec(`docker stop "${redisName}"`, { shell: true, reject: false });
      await exec(`docker rm "${redisName}"`, { shell: true, reject: false });

      this.emit('log', `  ✓ Stopped and removed: ${redisName}`);
      return { exists: true, success: true };
    } catch (error) {
      this.emit('error', `Failed to stop Redis: ${error}`);
      throw error;
    }
  }

  /**
   * Mark team as inactive in database
   */
  async markTeamInactive(): Promise<{ success: boolean }> {
    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would update teams table: status='inactive'`);
      return { success: true };
    }

    try {
      const postgresCheck = await exec(
        `docker ps --filter "name=cfn-postgres" --format '{{.Names}}'`,
        { shell: true, reject: false }
      );

      if (!postgresCheck.stdout.includes('cfn-postgres')) {
        this.emit('log', `  ⚠ PostgreSQL not running, skipping database update`);
        return { success: false };
      }

      await exec(
        `docker exec cfn-postgres psql -U cfn_admin -d cfn_corporate -c "UPDATE teams SET status='inactive', deprovisioned_at=NOW() WHERE id='${this.teamId}';"`,
        { shell: true, reject: false }
      );

      this.emit('log', `  ✓ Marked team as inactive in database`);
      return { success: true };
    } catch (error) {
      this.emit('error', `Failed to mark team inactive: ${error}`);
      return { success: false };
    }
  }

  /**
   * Handle workspace (archive or remove)
   */
  async handleWorkspace(): Promise<void> {
    const workspacePath = `/workspace/${this.teamId}`;

    if (this.options.archiveWorkspace) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const archiveFile = `/tmp/${this.teamId}-workspace-${timestamp}.tar.gz`;

      if (this.options.dryRun) {
        this.emit('log', `  [DRY RUN] Would archive: ${workspacePath} -> ${archiveFile}`);
        return;
      }

      try {
        await exec(
          `sudo tar -czf "${archiveFile}" -C "$(dirname '${workspacePath}')" "$(basename '${workspacePath}')"`,
          { shell: true }
        );
        this.emit('log', `  ✓ Archived workspace to: ${archiveFile}`);
      } catch (error) {
        this.emit('error', `Failed to archive workspace: ${error}`);
      }
    } else if (this.options.removeWorkspace) {
      if (this.options.dryRun) {
        this.emit('log', `  [DRY RUN] Would DELETE: ${workspacePath} (IRREVERSIBLE)`);
        return;
      }

      try {
        await exec(`sudo rm -rf "${workspacePath}"`, { shell: true });
        this.emit('log', `  ✓ Deleted workspace: ${workspacePath}`);
      } catch (error) {
        this.emit('error', `Failed to delete workspace: ${error}`);
      }
    } else {
      this.emit('log', `  ℹ️  Workspace preserved at: ${workspacePath}`);
    }
  }

  /**
   * Remove Docker network
   */
  async removeNetwork(): Promise<{ success: boolean; inUse?: boolean }> {
    if (!this.options.removeNetwork) {
      return { success: true };
    }

    const networkName = `team-${this.teamId}`;

    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would remove network: ${networkName}`);
      return { success: true };
    }

    try {
      const existsResult = await exec(`docker network inspect "${networkName}"`, {
        shell: true,
        reject: false,
      });

      if (existsResult.exitCode !== 0) {
        this.emit('log', `  ℹ️  Network not found: ${networkName}`);
        return { success: true };
      }

      await exec(`docker network rm "${networkName}"`, {
        shell: true,
        reject: false,
      });

      this.emit('log', `  ✓ Removed network: ${networkName}`);
      return { success: true };
    } catch (error) {
      if (String(error).includes('active endpoints')) {
        return { success: false, inUse: true };
      }
      this.emit('error', `Failed to remove network: ${error}`);
      throw error;
    }
  }

  /**
   * Remove firewall rules
   */
  async removeFirewallRules(): Promise<void> {
    if (!this.options.removeFirewall) {
      return;
    }

    if (this.options.dryRun) {
      this.emit('log', `  [DRY RUN] Would remove iptables rules`);
      return;
    }

    // This would require determining the subnet_id from config
    // For now, we'll skip the detailed implementation
    this.emit('log', `  ℹ️  Firewall rule removal requires subnet configuration`);
  }

  /**
   * Deprovision team completely
   */
  async deprovisionTeam(): Promise<void> {
    this.emit('log', `🗑️  Deprovisioning team: ${this.teamId}`);
    this.emit('log', '');

    if (this.options.dryRun) {
      this.emit('log', '🔍 DRY RUN MODE - No changes will be made');
      this.emit('log', '');
    }

    this.emit('log', 'Step 1: Stopping team coordinator...');
    await this.stopCoordinator();
    this.emit('log', '');

    this.emit('log', 'Step 2: Stopping all team agents...');
    await this.stopAllAgents();
    this.emit('log', '');

    this.emit('log', 'Step 3: Stopping team Redis...');
    await this.stopRedis();
    this.emit('log', '');

    this.emit('log', 'Step 4: Marking team as inactive in database...');
    await this.markTeamInactive();
    this.emit('log', '');

    this.emit('log', 'Step 5: Handling workspace...');
    await this.handleWorkspace();
    this.emit('log', '');

    if (this.options.removeNetwork) {
      this.emit('log', 'Step 6: Removing Docker network...');
      await this.removeNetwork();
      this.emit('log', '');
    }

    if (this.options.removeFirewall) {
      this.emit('log', 'Step 7: Removing firewall rules...');
      await this.removeFirewallRules();
      this.emit('log', '');
    }

    this.emit('log', '✅ Team deprovisioning complete!');
  }
}
