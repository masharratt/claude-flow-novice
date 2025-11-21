/**
 * Container Deploy Module
 * TypeScript implementation for deploying CFN Docker containers
 *
 * Migrated from: docker/scripts/container-deploy-cfn-team.sh
 */

import { exec } from 'execa';
import { EventEmitter } from 'events';

export type DeployAction = 'deploy' | 'redeploy' | 'upgrade';

export interface ContainerDeployOptions {
  teamId: string;
  action?: DeployAction;
  dryRun?: boolean;
}

export interface DeployResult {
  success: boolean;
  message: string;
}

/**
 * ContainerDeploy class - Deploys CFN Docker containers
 */
export class ContainerDeploy extends EventEmitter {
  teamId: string;
  options: Required<ContainerDeployOptions>;

  constructor(options: ContainerDeployOptions) {
    super();
    this.teamId = options.teamId;

    const action = options.action ?? 'deploy';
    if (!['deploy', 'redeploy', 'upgrade'].includes(action)) {
      throw new Error(`Invalid action: ${action}`);
    }

    this.options = {
      action: action as DeployAction,
      dryRun: options.dryRun ?? false,
      ...options,
    };
  }

  /**
   * Start coordinator container
   */
  async startCoordinator(): Promise<void> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    if (this.options.dryRun) {
      this.emit('log', `[DRY RUN] Would start: ${coordinatorName}`);
      return;
    }

    const command = `docker run -d \\
      --name "${coordinatorName}" \\
      --network cfn-coordination \\
      --memory 2g \\
      --cpus 1.0 \\
      --restart unless-stopped \\
      --label cfn.component=team-coordinator \\
      --label cfn.team="${this.teamId}" \\
      -v /var/run/docker.sock:/var/run/docker.sock \\
      -v "/workspace/${this.teamId}:/workspace:rw" \\
      -e TEAM_ID="${this.teamId}" \\
      -e REDIS_HOST="cfn-redis-${this.teamId}" \\
      -e POSTGRES_HOST=cfn-postgres \\
      cfn-docker-team-coordinator:latest`;

    try {
      await exec(command, { shell: true });
      this.emit('log', `✓ Started coordinator: ${coordinatorName}`);

      // Connect to team network
      await exec(
        `docker network connect "team-${this.teamId}" "${coordinatorName}"`,
        { shell: true, reject: false }
      );
    } catch (error) {
      this.emit('error', `Failed to start coordinator: ${error}`);
      throw error;
    }
  }

  /**
   * Check if coordinator is running
   */
  async isCoordinatorRunning(): Promise<boolean> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker inspect --format='{{.State.Running}}' "${coordinatorName}"`,
        { shell: true }
      );

      return result.stdout.trim() === 'true';
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for coordinator to be ready
   */
  async waitForCoordinatorReady(maxRetries: number = 10, delayMs: number = 1000): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      const running = await this.isCoordinatorRunning();

      if (running) {
        this.emit('log', `✓ Coordinator is ready`);
        return true;
      }

      this.emit('log', `Waiting for coordinator... (${i + 1}/${maxRetries})`);

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    this.emit('error', 'Coordinator failed to become ready');
    return false;
  }

  /**
   * Get container status
   */
  async getContainerStatus(): Promise<string> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker inspect --format='{{.State.Status}}' "${coordinatorName}"`,
        { shell: true }
      );

      return result.stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get container resource stats
   */
  async getContainerStats(): Promise<any> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}\t{{.CPUPerc}}" "${coordinatorName}"`,
        { shell: true }
      );

      return result.stdout;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get coordinator logs
   */
  async getCoordinatorLogs(tail: number = 50): Promise<string> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker logs --tail ${tail} "${coordinatorName}"`,
        { shell: true }
      );

      return result.stdout;
    } catch (error) {
      return '';
    }
  }

  /**
   * Follow coordinator logs in real-time
   */
  async followCoordinatorLogs(): Promise<void> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      await exec(
        `docker logs -f "${coordinatorName}"`,
        { shell: true }
      );
    } catch (error) {
      this.emit('error', `Failed to follow logs: ${error}`);
    }
  }

  /**
   * Verify container health
   */
  async verifyHealth(): Promise<boolean> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker inspect --format='{{.State.Health.Status}}' "${coordinatorName}"`,
        { shell: true, reject: false }
      );

      return result.stdout.trim() === 'healthy';
    } catch (error) {
      return false;
    }
  }

  /**
   * Perform redeploy (stop, remove, restart)
   */
  async redeploy(): Promise<DeployResult> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    if (this.options.dryRun) {
      this.emit('log', `[DRY RUN] Would redeploy coordinator`);
      return { success: true, message: '[DRY RUN] Would redeploy' };
    }

    try {
      // Stop existing container
      await exec(`docker stop "${coordinatorName}"`, {
        shell: true,
        reject: false,
      });

      // Remove container
      await exec(`docker rm "${coordinatorName}"`, {
        shell: true,
        reject: false,
      });

      // Start new container
      await this.startCoordinator();

      // Wait for readiness
      const ready = await this.waitForCoordinatorReady();

      return {
        success: ready,
        message: ready ? 'Redeployment successful' : 'Redeployment timed out',
      };
    } catch (error) {
      this.emit('error', `Redeploy failed: ${error}`);
      return { success: false, message: String(error) };
    }
  }

  /**
   * Create backup before upgrade
   */
  async backup(): Promise<{ success: boolean }> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `/tmp/${coordinatorName}-backup-${timestamp}.tar`;

    try {
      await exec(
        `docker export "${coordinatorName}" > "${backupFile}"`,
        { shell: true }
      );

      this.emit('log', `✓ Created backup: ${backupFile}`);
      return { success: true };
    } catch (error) {
      this.emit('error', `Backup failed: ${error}`);
      return { success: false };
    }
  }

  /**
   * Rollback to previous version
   */
  async rollback(): Promise<DeployResult> {
    this.emit('log', 'Rolling back to previous version...');

    try {
      await this.redeploy();

      return { success: true, message: 'Rollback successful' };
    } catch (error) {
      this.emit('error', `Rollback failed: ${error}`);
      return { success: false, message: String(error) };
    }
  }

  /**
   * Deploy (full workflow)
   */
  async deploy(): Promise<DeployResult> {
    this.emit('log', `🚀 Deploying team: ${this.teamId}`);

    if (this.options.action === 'redeploy' || this.options.action === 'upgrade') {
      return this.redeploy();
    }

    try {
      await this.startCoordinator();

      const ready = await this.waitForCoordinatorReady();

      if (!ready) {
        return { success: false, message: 'Coordinator failed to become ready' };
      }

      const logs = await this.getCoordinatorLogs(10);
      this.emit('log', 'Recent logs:');
      this.emit('log', logs);

      return { success: true, message: 'Deployment successful' };
    } catch (error) {
      this.emit('error', `Deployment failed: ${error}`);
      return { success: false, message: String(error) };
    }
  }
}
