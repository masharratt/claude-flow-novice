/**
 * Docker Client Wrapper
 * Provides type-safe access to Docker SDK with proper error handling
 */

import Docker, { Container as DockerContainer } from 'dockerode';
import {
  ContainerOptions,
  ContainerState,
  ContainerStatus,
  ExitStatus,
  ResourceMetrics,
  DockerError,
  HealthCheckConfig
} from './types';

/**
 * Docker client wrapper providing type-safe container operations
 */
export class DockerClient {
  private docker: Docker;

  /**
   * Initialize Docker client
   * @param socketPath Path to Docker socket (default: /var/run/docker.sock)
   */
  constructor(
    socketPath: string = '/var/run/docker.sock',
    socketHost?: string,
    socketPort?: number
  ) {

    // Initialize Docker client with socket connection
    if (socketHost && socketPort) {
      this.docker = new Docker({
        host: socketHost,
        port: socketPort
      });
    } else {
      this.docker = new Docker({
        socketPath: socketPath
      });
    }
  }

  /**
   * Verify Docker daemon is accessible
   * @returns true if Docker is accessible, false otherwise
   */
  async isAccessible(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get Docker version information
   * @returns Docker version object
   */
  async getVersion(): Promise<Docker.DockerVersion> {
    try {
      return await this.docker.version();
    } catch (error) {
      throw new DockerError(
        'Failed to retrieve Docker version',
        'VERSION_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * List all containers
   * @param all Include stopped containers
   * @returns Array of container objects
   */
  async listContainers(all: boolean = false): Promise<Docker.ContainerInfo[]> {
    try {
      return await this.docker.listContainers({ all });
    } catch (error) {
      throw new DockerError(
        'Failed to list containers',
        'LIST_CONTAINERS_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get container by ID or name
   * @param idOrName Container ID or name
   * @returns Container object
   */
  async getContainer(idOrName: string): Promise<DockerContainer> {
    try {
      return this.docker.getContainer(idOrName);
    } catch (error) {
      throw new DockerError(
        `Container not found: ${idOrName}`,
        'CONTAINER_NOT_FOUND',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create a new container
   * @param options Container creation options
   * @returns Created container
   */
  async createContainer(
    options: Partial<unknown>,
    image: string,
    containerOptions: ContainerOptions
  ): Promise<DockerContainer> {
    try {
      // Build complete container options
      const createOptions: Record<string, unknown> = {
        Image: image,
        name: containerOptions.name || `cfn-${containerOptions.agentId}`,
        Env: this.buildEnvironmentArray(containerOptions),
        HostConfig: {
          Memory: containerOptions.memoryLimit * 1024 * 1024,
          MemorySwap: containerOptions.memoryLimit * 1024 * 1024,
          CpuQuota: containerOptions.cpuLimit
            ? Math.floor(containerOptions.cpuLimit * 100000)
            : undefined,
          RestartPolicy: containerOptions.restartPolicy || {
            Name: 'no'
          },
          NetworkMode: containerOptions.network || 'cfn-network'
        },
        Healthcheck: containerOptions.healthCheck
          ? this.buildHealthCheck(containerOptions.healthCheck)
          : undefined,
        WorkingDir: containerOptions.workdir,
        ...options
      };

      // Add volume bindings if provided
      if (containerOptions.volumes) {
        (createOptions as Record<string, unknown>).Volumes = {};
        const hostConfig = ((createOptions as Record<string, unknown>).HostConfig as Record<string, unknown>) || {};
        hostConfig.Binds = [];

        for (const [host, container] of Object.entries(containerOptions.volumes)) {
          const volumes = (createOptions as Record<string, unknown>).Volumes as Record<string, unknown>;
          volumes[container] = {};
          (hostConfig.Binds as string[]).push(`${host}:${container}`);
        }
      }

      return await this.docker.createContainer(
        createOptions as Docker.ContainerCreateOptions
      );
    } catch (error) {
      throw new DockerError(
        `Failed to create container: ${containerOptions.agentId}`,
        'CREATE_CONTAINER_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Start a container
   * @param container Docker container instance
   */
  async startContainer(container: DockerContainer): Promise<void> {
    try {
      await container.start();
    } catch (error) {
      throw new DockerError(
        'Failed to start container',
        'START_CONTAINER_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Stop a container with timeout
   * @param container Docker container instance
   * @param timeout Timeout in seconds
   */
  async stopContainer(
    container: DockerContainer,
    timeout: number = 10
  ): Promise<void> {
    try {
      await container.stop({ t: timeout });
    } catch (error) {
      throw new DockerError(
        'Failed to stop container',
        'STOP_CONTAINER_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Kill a container forcefully
   * @param container Docker container instance
   */
  async killContainer(container: DockerContainer): Promise<void> {
    try {
      await container.kill();
    } catch (error) {
      throw new DockerError(
        'Failed to kill container',
        'KILL_CONTAINER_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Remove a container
   * @param container Docker container instance
   * @param force Force removal without stopping
   */
  async removeContainer(
    container: DockerContainer,
    force: boolean = false
  ): Promise<void> {
    try {
      await container.remove({ force });
    } catch (error) {
      throw new DockerError(
        'Failed to remove container',
        'REMOVE_CONTAINER_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get container inspection details
   * @param container Docker container instance
   * @returns Container inspection data
   */
  async inspectContainer(
    container: DockerContainer
  ): Promise<Docker.ContainerInspectInfo> {
    try {
      return await container.inspect();
    } catch (error) {
      throw new DockerError(
        'Failed to inspect container',
        'INSPECT_CONTAINER_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get container state summary
   * @param container Docker container instance
   * @returns Container state information
   */
  async getContainerState(container: DockerContainer): Promise<ContainerState> {
    const inspect = await this.inspectContainer(container);
    const state = inspect.State;

    let status: ContainerStatus = ContainerStatus.UNKNOWN;
    if (state.Running) {
      status = ContainerStatus.RUNNING;
    } else if (state.ExitCode === 0) {
      status = ContainerStatus.EXITED;
    } else if (state.ExitCode !== 0) {
      status = ContainerStatus.FAILED;
    }

    let exitStatus: ExitStatus | undefined;
    if (state.ExitCode !== undefined && state.ExitCode !== -1) {
      if (state.ExitCode === 0) {
        exitStatus = ExitStatus.SUCCESS;
      } else if (state.ExitCode === 124) {
        exitStatus = ExitStatus.TIMEOUT;
      } else {
        exitStatus = ExitStatus.FAILED;
      }
    }

    return {
      id: inspect.Id,
      name: inspect.Name.replace(/^\//, ''),
      status,
      exitCode: state.ExitCode ?? undefined,
      exitStatus,
      isRunning: state.Running,
      startedAt: state.StartedAt ? new Date(state.StartedAt) : undefined,
      finishedAt: state.FinishedAt ? new Date(state.FinishedAt) : undefined,
      healthStatus: state.Health?.Status as any,
      memoryUsage: undefined,
      cpuUsage: undefined // Requires additional metrics collection
    };
  }

  /**
   * Get container logs
   * @param container Docker container instance
   * @param tail Number of lines to retrieve
   * @returns Container logs as string
   */
  async getContainerLogs(
    container: DockerContainer,
    tail: number = 100
  ): Promise<string> {
    try {
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: tail,
        timestamps: true
      });

      return logs.toString();
    } catch (error) {
      throw new DockerError(
        'Failed to retrieve container logs',
        'GET_LOGS_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get container resource metrics
   * @param container Docker container instance
   * @returns Resource usage metrics
   */
  async getContainerMetrics(container: DockerContainer): Promise<ResourceMetrics> {
    try {
      const stats = await container.stats({ stream: false });
      const inspect = await this.inspectContainer(container);

      // Calculate CPU percentage
      const cpuDelta = (stats as any).cpu_stats.cpu_usage.total_usage -
        (stats as any).precpu_stats.cpu_usage.total_usage;
      const systemDelta = (stats as any).cpu_stats.system_cpu_usage -
        (stats as any).precpu_stats.system_cpu_usage;
      const cpuCount = (stats as any).cpu_stats.online_cpus || 1;
      const cpuPercent = (cpuDelta / systemDelta) * cpuCount * 100.0;

      return {
        containerId: inspect.Id,
        cpuPercent: cpuPercent || 0,
        memoryUsage: (stats as any).memory_stats.usage || 0,
        memoryLimit: (stats as any).memory_stats.limit || 0,
        networkInput: (stats as any).networks?.eth0?.rx_bytes || 0,
        networkOutput: (stats as any).networks?.eth0?.tx_bytes || 0,
        blockInput: (stats as any).blkio_stats?.io_service_bytes_recursive?.[0]?.value || 0,
        blockOutput: (stats as any).blkio_stats?.io_service_bytes_recursive?.[1]?.value || 0,
        pid: inspect.State.Pid
      };
    } catch (error) {
      throw new DockerError(
        'Failed to retrieve container metrics',
        'GET_METRICS_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Execute command in running container
   * @param container Docker container instance
   * @param cmd Command to execute
   * @returns Execution result with exit code and output
   */
  async executeCommand(
    container: DockerContainer,
    cmd: string[]
  ): Promise<{ exitCode: number; output: string }> {
    try {
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true
      });

      const stream = await exec.start({
        Detach: false
      });

      let output = '';
      for await (const chunk of stream) {
        output += chunk.toString();
      }

      const execInspect = await exec.inspect();
      return {
        exitCode: execInspect.ExitCode || 0,
        output
      };
    } catch (error) {
      throw new DockerError(
        'Failed to execute command in container',
        'EXEC_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Build environment variable array from options
   * @param options Container options
   * @returns Array of env vars as ENV=value format
   */
  private buildEnvironmentArray(options: ContainerOptions): string[] {
    const env: string[] = [
      `TASK_ID=${options.taskId}`,
      `AGENT_ID=${options.agentId}`,
      `AGENT_TYPE=${options.agentType}`,
      `CFN_MODE=cli`,
      'REDIS_HOST=redis',
      'REDIS_PORT=6379',
      'CFN_DEBUG=false'
    ];

    // Add custom environment variables
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        if (this.isValidEnvVar(key, value)) {
          env.push(`${key}=${value}`);
        }
      }
    }

    return env;
  }

  /**
   * Validate environment variable for safety
   * @param name Variable name
   * @param _value Variable value (reserved for future validation)
   * @returns true if valid, false otherwise
   */
  private isValidEnvVar(name: string, _value: string): boolean {
    // Block dangerous variables
    const dangerousVars = [
      'LD_PRELOAD',
      'LD_LIBRARY_PATH',
      'LD_DEBUG',
      'DOCKER_HOST',
      'DOCKER_CERT_PATH',
      'DOCKER_TLS',
      'DOCKER_TLS_VERIFY',
      'DOCKER_API_VERSION',
      'DOCKER_CONFIG'
    ];

    if (dangerousVars.includes(name)) {
      return false;
    }

    // Validate name format
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return false;
    }

    return true;
  }

  /**
   * Build health check configuration for Docker API
   * @param config Health check config
   * @returns Docker health check format
   */
  private buildHealthCheck(config: HealthCheckConfig): Docker.HealthConfig {
    return {
      Test: config.Test,
      Interval: config.Interval * 1_000_000_000, // Convert to nanoseconds
      Timeout: config.Timeout * 1_000_000_000,
      Retries: config.Retries,
      StartPeriod: config.StartPeriod ? config.StartPeriod * 1_000_000_000 : 0
    };
  }
}
