/**
 * Docker Deploy Stabilization Module
 * TypeScript implementation for stabilizing Docker deployments
 *
 * Migrated from: docker/scripts/docker-deploy.stabilization.sh
 */

import { exec } from 'execa';
import { EventEmitter } from 'events';

export interface DockerDeployStabilizationOptions {
  teamId: string;
  maxWaitTime?: number;
  healthCheckInterval?: number;
  verbose?: boolean;
}

export interface HealthCheckResult {
  coordinator: string;
  redis: string;
  network: string;
  isHealthy?: boolean;
  timestamp?: number;
}

/**
 * DockerDeployStabilization class - Stabilizes Docker deployments
 */
export class DockerDeployStabilization extends EventEmitter {
  teamId: string;
  options: Required<DockerDeployStabilizationOptions>;
  private healthCheckHistory: HealthCheckResult[] = [];

  constructor(options: DockerDeployStabilizationOptions) {
    super();
    this.teamId = options.teamId;
    this.options = {
      maxWaitTime: options.maxWaitTime ?? 300,
      healthCheckInterval: options.healthCheckInterval ?? 5,
      verbose: options.verbose ?? false,
      ...options,
    };
  }

  /**
   * Wait for coordinator startup
   */
  async waitForCoordinatorStartup(): Promise<{ success: boolean; timedOut?: boolean }> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;
    const startTime = Date.now();

    while (true) {
      const elapsed = (Date.now() - startTime) / 1000;

      if (elapsed > this.options.maxWaitTime) {
        this.emit('error', `Coordinator startup timed out after ${this.options.maxWaitTime}s`);
        return { success: false, timedOut: true };
      }

      try {
        const result = await exec(
          `docker inspect --format='{{.State.Running}}' "${coordinatorName}"`,
          { shell: true, reject: false }
        );

        if (result.stdout.trim() === 'true') {
          this.emit('log', `✓ Coordinator started successfully`);
          return { success: true };
        }
      } catch (error) {
        // Continue retrying
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.options.healthCheckInterval * 1000)
      );
    }
  }

  /**
   * Check startup progress
   */
  async checkStartupProgress(): Promise<any> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker logs --tail 5 "${coordinatorName}"`,
        { shell: true, reject: false }
      );

      return { progress: result.stdout };
    } catch (error) {
      return { progress: 'unknown' };
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const coordinatorHealthy = await this.isCoordinatorHealthy();
    const redisHealthy = await this.isRedisHealthy();
    const networkHealthy = await this.isNetworkHealthy();

    const result: HealthCheckResult = {
      coordinator: coordinatorHealthy ? 'healthy' : 'unhealthy',
      redis: redisHealthy ? 'healthy' : 'unhealthy',
      network: networkHealthy ? 'healthy' : 'unhealthy',
      isHealthy: coordinatorHealthy && redisHealthy && networkHealthy,
      timestamp: Date.now(),
    };

    this.healthCheckHistory.push(result);

    return result;
  }

  /**
   * Wait for all components to be healthy
   */
  async waitForAllHealthy(): Promise<{ success: boolean }> {
    const startTime = Date.now();

    while (true) {
      const elapsed = (Date.now() - startTime) / 1000;

      if (elapsed > this.options.maxWaitTime) {
        this.emit('error', 'Timeout waiting for healthy components');
        return { success: false };
      }

      const health = await this.performHealthCheck();

      if (health.isHealthy) {
        this.emit('log', '✓ All components are healthy');
        return { success: true };
      }

      this.emit('log', `Waiting for components: coordinator=${health.coordinator}, redis=${health.redis}, network=${health.network}`);

      await new Promise((resolve) =>
        setTimeout(resolve, this.options.healthCheckInterval * 1000)
      );
    }
  }

  /**
   * Check if coordinator is healthy
   */
  async isCoordinatorHealthy(): Promise<boolean> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker exec "${coordinatorName}" curl -s localhost:8080/health`,
        { shell: true, reject: false }
      );

      return result.exitCode === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check coordinator logs for errors
   */
  async checkCoordinatorLogs(): Promise<boolean> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker logs "${coordinatorName}" | grep -i error | wc -l`,
        { shell: true, reject: false }
      );

      const errorCount = parseInt(result.stdout.trim());

      return errorCount === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check coordinator resource usage
   */
  async checkCoordinatorResources(): Promise<{ healthy: boolean; memory?: string }> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker stats --no-stream --format "{{.MemUsage}}" "${coordinatorName}"`,
        { shell: true, reject: false }
      );

      const memory = result.stdout.trim();
      const memValue = parseFloat(memory);
      const isHealthy = memValue < 1800; // Less than 1.8GB

      return { healthy: isHealthy, memory };
    } catch (error) {
      return { healthy: false };
    }
  }

  /**
   * Check if Redis is healthy
   */
  async isRedisHealthy(): Promise<boolean> {
    const redisName = `cfn-redis-${this.teamId}`;

    try {
      const result = await exec(
        `docker exec "${redisName}" redis-cli ping`,
        { shell: true, reject: false }
      );

      return result.stdout.trim() === 'PONG';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get Redis memory usage
   */
  async getRedisMemoryUsage(): Promise<number> {
    const redisName = `cfn-redis-${this.teamId}`;

    try {
      const result = await exec(
        `docker exec "${redisName}" redis-cli info memory | grep used_memory:`,
        { shell: true, reject: false }
      );

      const match = result.stdout.match(/used_memory:(\d+)/);

      return match ? parseInt(match[1]) : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check Redis persistence
   */
  async checkRedisPersistence(): Promise<boolean> {
    const redisName = `cfn-redis-${this.teamId}`;

    try {
      const result = await exec(
        `docker exec "${redisName}" redis-cli BGSAVE`,
        { shell: true, reject: false }
      );

      return result.stdout.includes('ok');
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if network is healthy
   */
  async isNetworkHealthy(): Promise<boolean> {
    const networkName = `team-${this.teamId}`;

    try {
      const result = await exec(
        `docker network inspect "${networkName}"`,
        { shell: true, reject: false }
      );

      return result.exitCode === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check network connectivity
   */
  async checkNetworkConnectivity(): Promise<boolean> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker exec "${coordinatorName}" ping -c 1 cfn-redis-${this.teamId}`,
        { shell: true, reject: false }
      );

      return result.exitCode === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if agents can reach coordinator
   */
  async canAgentsReachCoordinator(): Promise<boolean> {
    return this.checkNetworkConnectivity();
  }

  /**
   * Check if all containers are running
   */
  async areAllContainersRunning(): Promise<boolean> {
    try {
      const result = await exec(
        `docker ps -a --filter "label=cfn.team=${this.teamId}" --format '{{.Status}}' | grep -c "Up"`,
        { shell: true, reject: false }
      );

      const upCount = parseInt(result.stdout.trim());

      return upCount > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Restart failed containers
   */
  async restartFailedContainers(): Promise<{ restarted: number }> {
    try {
      const result = await exec(
        `docker ps -a --filter "label=cfn.team=${this.teamId}" --filter "status=exited" -q | xargs docker restart 2>/dev/null | wc -l`,
        { shell: true, reject: false }
      );

      const restarted = parseInt(result.stdout.trim());

      return { restarted };
    } catch (error) {
      return { restarted: 0 };
    }
  }

  /**
   * Check container exit codes
   */
  async checkContainerExitCodes(): Promise<{ healthy: boolean }> {
    try {
      const result = await exec(
        `docker ps -a --filter "label=cfn.team=${this.teamId}" --format '{{.Status}}' | grep -v "Exited (0)" | wc -l`,
        { shell: true, reject: false }
      );

      const unhealthyCount = parseInt(result.stdout.trim());

      return { healthy: unhealthyCount === 0 };
    } catch (error) {
      return { healthy: false };
    }
  }

  /**
   * Check if deployment is ready
   */
  async isDeploymentReady(): Promise<boolean> {
    const health = await this.performHealthCheck();

    return health.isHealthy === true;
  }

  /**
   * Get readiness details
   */
  async getReadinessDetails(): Promise<any> {
    const health = await this.performHealthCheck();
    const containers = await this.areAllContainersRunning();

    return {
      coordinator: { ready: health.coordinator === 'healthy' },
      redis: { ready: health.redis === 'healthy' },
      network: { ready: health.network === 'healthy' },
      containers: { ready: containers },
      timestamp: health.timestamp,
    };
  }

  /**
   * Collect stabilization metrics
   */
  async collectMetrics(): Promise<any> {
    const startTime = Date.now();

    const health = await this.performHealthCheck();
    const checks = this.healthCheckHistory.length;
    const successful = this.healthCheckHistory.filter((h) => h.isHealthy).length;

    return {
      startup_time_ms: Date.now() - startTime,
      health_checks: checks,
      successful_checks: successful,
      failed_checks: checks - successful,
    };
  }

  /**
   * Get health check history
   */
  getHealthCheckHistory(): HealthCheckResult[] {
    return this.healthCheckHistory;
  }

  /**
   * Perform complete stabilization
   */
  async stabilize(): Promise<{ success: boolean }> {
    this.emit('log', `🔧 Stabilizing deployment for team: ${this.teamId}`);

    try {
      // Wait for coordinator startup
      const startupResult = await this.waitForCoordinatorStartup();

      if (!startupResult.success) {
        this.emit('error', 'Coordinator startup failed');
        return { success: false };
      }

      // Wait for all components to be healthy
      const healthResult = await this.waitForAllHealthy();

      if (!healthResult.success) {
        this.emit('error', 'Components failed to become healthy');
        return { success: false };
      }

      this.emit('log', '✅ Stabilization complete');

      return { success: true };
    } catch (error) {
      this.emit('error', `Stabilization failed: ${error}`);
      throw error;
    }
  }
}
