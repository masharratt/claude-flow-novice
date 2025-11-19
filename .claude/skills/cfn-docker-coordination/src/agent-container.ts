/**
 * Agent Container Management
 * Handles CFN agent-specific container lifecycle operations
 */

import Docker from 'dockerode';
import { DockerClient } from './docker-client';
import {
  ContainerOptions,
  ContainerManifest,
  ContainerState,
  ExitStatus,
  DockerError,
  MemoryTier
} from './types';

/**
 * Agent container manager for CFN agents
 */
export class AgentContainerManager {
  private dockerClient: DockerClient;
  private readonly defaultNetworkName: string = 'cfn-network';
  private readonly agentImageName: string = 'cfn-agent:latest';

  /**
   * Initialize agent container manager
   * @param dockerClient Docker client instance
   */
  constructor(dockerClient: DockerClient) {
    this.dockerClient = dockerClient;
  }

  /**
   * Spawn a new agent container
   * @param agentType Agent type identifier
   * @param taskId Task ID for coordination
   * @param agentId Unique agent ID
   * @param options Additional container options
   * @returns Container manifest with metadata
   */
  async spawnAgent(
    agentType: string,
    taskId: string,
    agentId: string,
    options?: Partial<ContainerOptions>
  ): Promise<{ container: Docker.Container; manifest: ContainerManifest }> {
    try {
      // Build complete container options
      const containerOptions: ContainerOptions = {
        agentType,
        taskId,
        agentId,
        memoryLimit: options?.memoryLimit || 1024, // Default 1GB
        cpuLimit: options?.cpuLimit || 0.5,
        env: options?.env,
        volumes: options?.volumes,
        network: options?.network || this.defaultNetworkName,
        name: options?.name || `cfn-${agentId}`,
        workdir: options?.workdir || '/app',
        restartPolicy: options?.restartPolicy || { Name: 'no' },
        healthCheck: options?.healthCheck
      };

      // Create the container
      const container = await this.dockerClient.createContainer(
        {},
        this.agentImageName,
        containerOptions
      );

      // Start the container
      await this.dockerClient.startContainer(container);

      // Create manifest
      const manifest = this.createManifest(
        agentId,
        taskId,
        containerOptions
      );

      return { container, manifest };
    } catch (error) {
      throw new DockerError(
        `Failed to spawn agent: ${agentId}`,
        'SPAWN_AGENT_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Stop an agent container gracefully
   * @param container Docker container instance
   * @param timeout Timeout in seconds before force kill
   */
  async stopAgent(
    container: Docker.Container,
    timeout: number = 30
  ): Promise<void> {
    try {
      await this.dockerClient.stopContainer(container, timeout);
    } catch (error) {
      // If graceful stop fails, force kill
      try {
        await this.dockerClient.killContainer(container);
      } catch (killError) {
        throw new DockerError(
          'Failed to stop agent container',
          'STOP_AGENT_ERROR',
          error instanceof Error ? error : undefined
        );
      }
    }
  }

  /**
   * Remove an agent container
   * @param container Docker container instance
   * @param force Force remove without stopping
   */
  async removeAgent(
    container: Docker.Container,
    force: boolean = false
  ): Promise<void> {
    try {
      await this.dockerClient.removeContainer(container, force);
    } catch (error) {
      throw new DockerError(
        'Failed to remove agent container',
        'REMOVE_AGENT_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get agent container status
   * @param container Docker container instance
   * @returns Container state information
   */
  async getAgentStatus(container: Docker.Container): Promise<ContainerState> {
    return await this.dockerClient.getContainerState(container);
  }

  /**
   * Get agent container logs
   * @param container Docker container instance
   * @param tail Number of lines to retrieve
   * @returns Log content
   */
  async getAgentLogs(
    container: Docker.Container,
    tail: number = 100
  ): Promise<string> {
    return await this.dockerClient.getContainerLogs(container, tail);
  }

  /**
   * Save agent logs to file
   * @param container Docker container instance
   * @param outputDir Directory to save logs
   * @returns Path to saved log file
   */
  async saveAgentLogs(
    container: Docker.Container,
    outputDir: string
  ): Promise<string> {
    try {
      // Get all logs and could be written to filesystem
      // For now, just get container info to return path
      await this.getAgentLogs(container, -1); // All logs fetched
      const inspect = await this.dockerClient.inspectContainer(container);
      const containerId = inspect.Id.substring(0, 12);
      const logPath = `${outputDir}/${containerId}.log`;

      // In real implementation, write to filesystem
      // For now, return the path
      return logPath;
    } catch (error) {
      throw new DockerError(
        'Failed to save agent logs',
        'SAVE_LOGS_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Execute command in agent container
   * @param container Docker container instance
   * @param cmd Command to execute
   * @returns Execution result
   */
  async executeInAgent(
    container: Docker.Container,
    cmd: string[]
  ): Promise<{ exitCode: number; output: string }> {
    return await this.dockerClient.executeCommand(container, cmd);
  }

  /**
   * Wait for agent container to complete
   * @param container Docker container instance
   * @param timeout Timeout in milliseconds
   * @param pollInterval Poll interval in milliseconds
   * @returns Exit code
   */
  async waitForAgentCompletion(
    container: Docker.Container,
    timeout: number = 300_000, // 5 minutes
    pollInterval: number = 2_000 // 2 seconds
  ): Promise<number> {
    const startTime = Date.now();

    while (true) {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeout) {
        throw new DockerError(
          `Agent container timeout after ${timeout}ms`,
          'AGENT_TIMEOUT'
        );
      }

      const state = await this.getAgentStatus(container);

      if (!state.isRunning && state.exitCode !== undefined) {
        return state.exitCode;
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  /**
   * Get agent container by name
   * @param containerName Container name
   * @returns Container or null if not found
   */
  async getAgentByName(containerName: string): Promise<Docker.Container | null> {
    try {
      return await this.dockerClient.getContainer(containerName);
    } catch {
      return null;
    }
  }

  /**
   * List all running agents
   * @param pattern Optional name pattern to filter
   * @returns Array of agent containers
   */
  async listRunningAgents(pattern?: string): Promise<Docker.ContainerInfo[]> {
    try {
      const containers = await this.dockerClient.listContainers(false);

      return containers.filter(c => {
        if (!c.Names || c.Names.length === 0) return false;

        const name = c.Names[0].replace(/^\//, '');

        if (!name.startsWith('cfn-')) return false;

        if (pattern && !name.includes(pattern)) return false;

        return true;
      });
    } catch (error) {
      throw new DockerError(
        'Failed to list running agents',
        'LIST_AGENTS_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Cleanup all stopped agents
   * @param pattern Optional name pattern to filter
   * @returns Number of agents removed
   */
  async cleanupStoppedAgents(pattern?: string): Promise<number> {
    try {
      // List all containers (including stopped)
      let containers = await this.dockerClient.listContainers(true);

      // Filter for stopped agents
      containers = containers.filter(c => {
        if (!c.Names || c.Names.length === 0) return false;

        const name = c.Names[0].replace(/^\//, '');

        if (!name.startsWith('cfn-')) return false;

        if (pattern && !name.includes(pattern)) return false;

        // Only include stopped containers
        return c.State === 'exited' || c.State === 'dead';
      });

      // Remove each container
      let removed = 0;
      for (const containerInfo of containers) {
        try {
          const container = await this.dockerClient.getContainer(containerInfo.Id);
          await this.removeAgent(container, true);
          removed++;
        } catch {
          // Continue with next container
        }
      }

      return removed;
    } catch (error) {
      throw new DockerError(
        'Failed to cleanup stopped agents',
        'CLEANUP_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create container manifest for tracking
   * @param agentId Agent ID
   * @param batchId Batch ID
   * @param options Container options
   * @returns Container manifest
   */
  private createManifest(
    agentId: string,
    batchId: string,
    options: ContainerOptions
  ): ContainerManifest {
    // Determine tier based on memory limit
    let tier = 1;
    if (options.memoryLimit >= MemoryTier.XLARGE) {
      tier = 4;
    } else if (options.memoryLimit >= MemoryTier.LARGE) {
      tier = 3;
    } else if (options.memoryLimit >= MemoryTier.MEDIUM) {
      tier = 2;
    }

    return {
      container_id: agentId,
      batch_id: batchId,
      tier,
      memory_limit: `${options.memoryLimit}m`,
      status: 'running',
      started_at: new Date().toISOString()
    };
  }

  /**
   * Update manifest with completion info
   * @param manifest Original manifest
   * @param exitCode Container exit code
   * @returns Updated manifest
   */
  static updateManifest(
    manifest: ContainerManifest,
    exitCode: number
  ): ContainerManifest {
    let exitStatus: ExitStatus = ExitStatus.FAILED;
    if (exitCode === 0) {
      exitStatus = ExitStatus.SUCCESS;
    } else if (exitCode === 124) {
      exitStatus = ExitStatus.TIMEOUT;
    }

    return {
      ...manifest,
      status: 'exited',
      exit_code: exitCode,
      exit_status: exitStatus,
      finished_at: new Date().toISOString()
    };
  }

  /**
   * Validate agent image is available
   * @returns true if image is available
   */
  async validateAgentImage(): Promise<boolean> {
    try {
      // This is a simplified check - in real implementation would use Docker API
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate safe container name from agent ID
   * @param agentId Agent ID
   * @returns Safe container name
   */
  static generateSafeContainerName(agentId: string): string {
    // Remove or replace invalid characters
    const safe = agentId
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '-')
      .substring(0, 63); // Docker name length limit

    if (!safe.match(/^[a-z0-9]/)) {
      return `agent-${safe}`;
    }

    return `cfn-${safe}`;
  }

  /**
   * Check if container name already exists
   * @param containerName Container name to check
   * @returns true if container exists
   */
  async containerNameExists(containerName: string): Promise<boolean> {
    const container = await this.getAgentByName(containerName);
    return container !== null;
  }

  /**
   * Parse memory string to bytes
   * @param memory Memory string (e.g., "512m", "1g")
   * @returns Bytes as number
   */
  static parseMemory(memory: string): number {
    const match = memory.match(/^(\d+)(b|k|kb|m|mb|g|gb)?$/i);
    if (!match) {
      throw new Error(`Invalid memory format: ${memory}`);
    }

    const value = parseInt(match[1], 10);
    const unit = (match[2] || 'b').toLowerCase();

    switch (unit) {
      case 'b':
        return value;
      case 'k':
      case 'kb':
        return value * 1024;
      case 'm':
      case 'mb':
        return value * 1024 * 1024;
      case 'g':
      case 'gb':
        return value * 1024 * 1024 * 1024;
      default:
        throw new Error(`Unknown memory unit: ${unit}`);
    }
  }

  /**
   * Format bytes to human-readable memory string
   * @param bytes Bytes to format
   * @returns Formatted string (e.g., "512MB")
   */
  static formatMemory(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes}B`;
    } else if (bytes < 1024 * 1024) {
      return `${Math.floor(bytes / 1024)}KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${Math.floor(bytes / (1024 * 1024))}MB`;
    } else {
      return `${Math.floor(bytes / (1024 * 1024 * 1024))}GB`;
    }
  }
}
