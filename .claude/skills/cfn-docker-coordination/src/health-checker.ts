/**
 * Health Checker
 * Monitors container health and provides status information
 */

import Docker from 'dockerode';
import { DockerClient } from './docker-client';
import {
  ContainerState,
  ContainerHealthStatus,
  ContainerTimeoutError,
  ContainerHealthCheckError
} from './types';

/**
 * Container health checker and monitor
 */
export class HealthChecker {
  private dockerClient: DockerClient;

  /**
   * Initialize health checker
   * @param dockerClient Docker client instance
   */
  constructor(dockerClient: DockerClient) {
    this.dockerClient = dockerClient;
  }

  /**
   * Wait for container to become healthy
   * @param container Docker container instance
   * @param timeout Timeout in milliseconds
   * @param pollInterval Poll interval in milliseconds
   * @returns true if container became healthy, false on timeout
   */
  async waitForHealthy(
    container: Docker.Container,
    timeout: number = 30_000, // 30 seconds
    pollInterval: number = 1_000 // 1 second
  ): Promise<boolean> {
    const startTime = Date.now();

    while (true) {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeout) {
        return false;
      }

      try {
        const state = await this.dockerClient.getContainerState(container);

        // Container exited before becoming healthy
        if (!state.isRunning && state.exitCode !== 0) {
          throw new ContainerHealthCheckError(
            state.id,
            `Container exited with code ${state.exitCode}`
          );
        }

        // Check health status
        if (state.healthStatus === ContainerHealthStatus.HEALTHY) {
          return true;
        }

        // If health status is unhealthy, fail immediately
        if (state.healthStatus === ContainerHealthStatus.UNHEALTHY) {
          throw new ContainerHealthCheckError(
            state.id,
            'Container failed health check'
          );
        }

        // Wait and try again
        await this.sleep(pollInterval);
      } catch (error) {
        if (error instanceof ContainerHealthCheckError) {
          throw error;
        }

        // Log warning and continue checking
        if (error instanceof Error) {
          // Continue polling
        }

        await this.sleep(pollInterval);
      }
    }
  }

  /**
   * Check container health status
   * @param container Docker container instance
   * @returns Container state including health status
   */
  async checkHealth(container: Docker.Container): Promise<ContainerState> {
    return await this.dockerClient.getContainerState(container);
  }

  /**
   * Wait for multiple containers to be healthy
   * @param containers Array of Docker container instances
   * @param timeout Timeout in milliseconds
   * @returns Result with healthy and unhealthy containers
   */
  async waitForMultipleHealthy(
    containers: Docker.Container[],
    timeout: number = 60_000
  ): Promise<{
    healthy: Docker.Container[];
    unhealthy: Docker.Container[];
    timedOut: Docker.Container[];
  }> {
    const startTime = Date.now();
    const healthy: Docker.Container[] = [];
    const unhealthy: Docker.Container[] = [];
    const timedOut: Docker.Container[] = [];
    const remaining = new Set(containers);

    while (remaining.size > 0) {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeout) {
        // All remaining containers have timed out
        remaining.forEach(c => timedOut.push(c));
        break;
      }

      const remainingTimeout = timeout - elapsed;

      for (const container of remaining) {
        try {
          await this.waitForHealthy(container, remainingTimeout, 500);
          healthy.push(container);
          remaining.delete(container);
        } catch (error) {
          if (error instanceof ContainerHealthCheckError) {
            unhealthy.push(container);
            remaining.delete(container);
          }
          // On timeout, keep checking
        }
      }

      if (remaining.size > 0) {
        await this.sleep(1_000);
      }
    }

    return { healthy, unhealthy, timedOut };
  }

  /**
   * Check if container is running
   * @param container Docker container instance
   * @returns true if container is running
   */
  async isRunning(container: Docker.Container): Promise<boolean> {
    try {
      const state = await this.dockerClient.getContainerState(container);
      return state.isRunning;
    } catch {
      return false;
    }
  }

  /**
   * Monitor container until completion
   * @param container Docker container instance
   * @param timeout Timeout in milliseconds
   * @param onStateChange Optional callback for state changes
   * @returns Final container state
   */
  async monitorUntilCompletion(
    container: Docker.Container,
    timeout: number = 300_000,
    onStateChange?: (state: ContainerState) => void
  ): Promise<ContainerState> {
    const startTime = Date.now();
    let lastState: ContainerState | null = null;

    while (true) {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeout) {
        throw new ContainerTimeoutError(
          lastState?.id || 'unknown',
          timeout
        );
      }

      const state = await this.dockerClient.getContainerState(container);

      if (!lastState || JSON.stringify(lastState) !== JSON.stringify(state)) {
        lastState = state;
        if (onStateChange) {
          onStateChange(state);
        }
      }

      // Check if container has exited
      if (!state.isRunning && state.exitCode !== undefined) {
        return state;
      }

      // Wait before next check
      await this.sleep(2_000);
    }
  }

  /**
   * Get container health summary
   * @param container Docker container instance
   * @returns Health summary object
   */
  async getHealthSummary(container: Docker.Container): Promise<{
    healthy: boolean;
    status: ContainerHealthStatus;
    running: boolean;
    exitCode?: number;
    details: string;
  }> {
    const state = await this.checkHealth(container);

    let details = '';
    let healthy = false;

    switch (state.healthStatus) {
      case ContainerHealthStatus.HEALTHY:
        healthy = true;
        details = 'Container is healthy and running';
        break;

      case ContainerHealthStatus.UNHEALTHY:
        healthy = false;
        details = 'Container failed health checks';
        break;

      case ContainerHealthStatus.STARTING:
        healthy = false;
        details = 'Container is starting up';
        break;

      case ContainerHealthStatus.UNKNOWN:
      default:
        healthy = state.isRunning;
        details = state.isRunning
          ? 'Container is running'
          : `Container exited with code ${state.exitCode || 'unknown'}`;
    }

    return {
      healthy,
      status: state.healthStatus || ContainerHealthStatus.UNKNOWN,
      running: state.isRunning,
      exitCode: state.exitCode,
      details
    };
  }

  /**
   * Wait for container logs to contain text
   * @param container Docker container instance
   * @param searchText Text to search for
   * @param timeout Timeout in milliseconds
   * @param tail Number of lines to check
   * @returns true if text found, false on timeout
   */
  async waitForLogText(
    container: Docker.Container,
    searchText: string,
    timeout: number = 30_000,
    tail: number = 50
  ): Promise<boolean> {
    const startTime = Date.now();

    while (true) {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeout) {
        return false;
      }

      try {
        const logs = await this.dockerClient.getContainerLogs(container, tail);

        if (logs.includes(searchText)) {
          return true;
        }
      } catch {
        // Container might not have logs yet
      }

      await this.sleep(500);
    }
  }

  /**
   * Perform health check diagnostic
   * @param container Docker container instance
   * @returns Diagnostic report
   */
  async performDiagnostic(container: Docker.Container): Promise<{
    state: ContainerState;
    health: {
      healthy: boolean;
      status: ContainerHealthStatus;
      running: boolean;
      exitCode?: number;
      details: string;
    };
    logs: string;
    metrics?: {
      containerId: string;
      cpuPercent: number;
      memoryUsage: number;
      memoryLimit: number;
      networkInput: number;
      networkOutput: number;
      blockInput: number;
      blockOutput: number;
      pid: number;
    };
  }> {
    const state = await this.checkHealth(container);
    const health = await this.getHealthSummary(container);
    const logs = await this.dockerClient.getContainerLogs(container, 20);

    let metrics;
    try {
      metrics = await this.dockerClient.getContainerMetrics(container);
    } catch {
      // Metrics might not be available
    }

    return { state, health, logs, metrics };
  }

  /**
   * Check container readiness (custom logic)
   * @param container Docker container instance
   * @param readinessCheck Custom readiness check function
   * @param timeout Timeout in milliseconds
   * @returns true if container is ready
   */
  async checkReadiness(
    container: Docker.Container,
    readinessCheck: (state: ContainerState) => boolean,
    timeout: number = 30_000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (true) {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeout) {
        return false;
      }

      const state = await this.checkHealth(container);

      if (readinessCheck(state)) {
        return true;
      }

      await this.sleep(1_000);
    }
  }

  /**
   * Wait for container to be ready
   * Combines health check and running status
   * @param container Docker container instance
   * @param timeout Timeout in milliseconds
   * @returns true if ready, false on timeout
   */
  async waitForReady(
    container: Docker.Container,
    timeout: number = 30_000
  ): Promise<boolean> {
    return await this.checkReadiness(
      container,
      (state) => state.isRunning && (
        state.healthStatus === ContainerHealthStatus.HEALTHY ||
        state.healthStatus === ContainerHealthStatus.UNKNOWN
      ),
      timeout
    );
  }

  /**
   * Check if container has exited
   * @param container Docker container instance
   * @returns true if container has exited
   */
  async hasExited(container: Docker.Container): Promise<boolean> {
    const state = await this.checkHealth(container);
    return !state.isRunning;
  }

  /**
   * Get container exit code
   * @param container Docker container instance
   * @returns Exit code or -1 if still running
   */
  async getExitCode(container: Docker.Container): Promise<number> {
    const state = await this.checkHealth(container);
    return state.exitCode ?? -1;
  }

  /**
   * Sleep utility
   * @param ms Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
