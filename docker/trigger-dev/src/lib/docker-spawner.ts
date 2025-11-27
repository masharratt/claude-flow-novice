/**
 * Docker Spawner - Dockerode wrapper for container lifecycle management
 *
 * Provides type-safe container creation, monitoring, and cleanup for agent
 * execution with proper timeout handling and resource management.
 *
 * Features:
 * - Automatic socket-proxy fallback (TCP then socket)
 * - Stream-based log capture (stdout/stderr)
 * - Timeout handling with forced kill on expiration
 * - Memory string parsing ("512m", "1g", etc)
 * - Comprehensive error handling
 *
 * References:
 * - docker/docker-compose.yml (socket-proxy configuration)
 * - docker/trigger-dev/.claude/skills/cfn-docker-coordination/src/docker-client.ts
 * - docker/trigger-dev/src/lib/cli-executor.ts (timeout patterns)
 */

import Docker from 'dockerode';
import { Readable } from 'stream';

type DockerContainer = Docker.Container;

/**
 * Options for spawning a container
 */
export interface ContainerSpawnOptions {
  /** Docker image to use (e.g., "cfn-agent:latest") */
  image: string;
  /** Container name (must be unique) */
  name: string;
  /** Memory allocation (e.g., "512m", "1g", "2.5g") */
  memory: string;
  /** Optional CPU limit in cores (e.g., 0.5, 1, 2) */
  cpus?: number;
  /** Environment variables */
  env: Record<string, string>;
  /** Volume mounts: array of { source, target, readonly? } */
  mounts: Array<{ source: string; target: string; readonly?: boolean }>;
  /** Docker network mode (e.g., "bridge", "host", "cfn-network") */
  networkMode: string;
  /** Execution timeout in milliseconds (default: 1800000 = 30 minutes) */
  timeout: number;
  /** Optional command to override entrypoint */
  command?: string[];
}

/**
 * Result of container execution
 */
export interface ContainerResult {
  /** Whether the container exited successfully (exitCode === 0) */
  success: boolean;
  /** Exit code of the container process */
  exitCode: number | null;
  /** Standard output from the container */
  stdout: string;
  /** Standard error from the container */
  stderr: string;
  /** Total execution time in milliseconds */
  durationMs: number;
  /** Container ID for reference and cleanup */
  containerId: string;
  /** Error message if something went wrong */
  error?: string;
}

/**
 * Docker client configuration
 */
interface DockerConfig {
  host?: string;
  port?: number;
  socketPath?: string;
}

/**
 * Parse memory string to bytes
 *
 * Supports: b, k/kb, m/mb, g/gb (case-insensitive)
 * Examples: "512", "512b", "512kb", "1m", "2gb"
 *
 * @param memoryString Memory specification string
 * @returns Memory in bytes
 * @throws Error if format is invalid
 */
export function parseMemoryString(memoryString: string): number {
  const match = memoryString.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/);

  if (!match) {
    throw new Error(
      `[docker-spawner] Invalid memory format: "${memoryString}". Expected format: "512m", "1g", "2.5gb", etc.`
    );
  }

  const [, value, unit] = match;
  const num = parseFloat(value);

  if (isNaN(num) || num <= 0) {
    throw new Error(`[docker-spawner] Memory value must be positive: ${num}`);
  }

  const multipliers: Record<string, number> = {
    b: 1,
    '': 1,
    k: 1024,
    kb: 1024,
    m: 1024 * 1024,
    mb: 1024 * 1024,
    g: 1024 * 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const multiplier = multipliers[unit];
  if (multiplier === undefined) {
    throw new Error(
      `[docker-spawner] Unknown memory unit: "${unit}". Supported: b, k/kb, m/mb, g/gb`
    );
  }

  return Math.round(num * multiplier);
}

/**
 * Docker Spawner for container lifecycle management
 */
export class DockerSpawner {
  private docker: Docker;
  private config: DockerConfig;

  /**
   * Create a new Docker spawner
   *
   * Tries to connect via socket-proxy first (TCP), then falls back to Docker socket.
   * This allows running both inside and outside of containers.
   *
   * Priority order:
   * 1. DOCKER_HOST env var (if set to tcp:// or unix://)
   * 2. Socket-proxy via TCP (default: socket-proxy:2375)
   * 3. Docker socket (default: /var/run/docker.sock)
   *
   * @param socketProxyHost Socket-proxy hostname (default: "socket-proxy")
   * @param socketProxyPort Socket-proxy port (default: 2375)
   * @param dockerSocket Docker socket path (default: "/var/run/docker.sock")
   */
  constructor(
    socketProxyHost: string = 'socket-proxy',
    socketProxyPort: number = 2375,
    dockerSocket: string = '/var/run/docker.sock'
  ) {
    // Check DOCKER_HOST environment variable first
    const dockerHost = process.env.DOCKER_HOST;

    if (dockerHost) {
      console.log(`[docker-spawner] Using DOCKER_HOST: ${dockerHost}`);

      if (dockerHost.startsWith('tcp://')) {
        // Parse tcp://host:port
        const match = dockerHost.match(/tcp:\/\/([^:]+):(\d+)/);
        if (match) {
          this.config = { host: match[1], port: parseInt(match[2], 10) };
          this.docker = new Docker(this.config);
          return;
        }
      } else if (dockerHost.startsWith('unix://')) {
        // Parse unix:///path/to/socket
        const socketPath = dockerHost.replace('unix://', '');
        this.config = { socketPath };
        this.docker = new Docker(this.config);
        return;
      }
    }

    // Try socket-proxy via TCP first
    this.config = { host: socketProxyHost, port: socketProxyPort };
    this.docker = new Docker(this.config);

    console.log(
      `[docker-spawner] Initialized with socket-proxy (${socketProxyHost}:${socketProxyPort}) ` +
        `(fallback to ${dockerSocket})`
    );
  }

  /**
   * Verify Docker daemon is accessible
   *
   * @returns true if Docker is accessible, false otherwise
   */
  async isAccessible(): Promise<boolean> {
    try {
      await this.docker.ping();
      console.log('[docker-spawner] Docker daemon accessible');
      return true;
    } catch (error) {
      console.warn('[docker-spawner] Docker daemon not accessible:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Create and read from a stream into a string buffer
   *
   * Captures all data from a stream (stdout/stderr) into a string.
   * Works with both Node.js Readable streams and ReadableStream.
   *
   * @param stream Stream-like object with data, end, and error events
   * @returns Promise resolving to captured string
   */
  private async streamToString(stream: unknown): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const eventEmitter = stream as any;

      eventEmitter.on('data', (chunk: unknown) => {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk);
        } else if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk, 'utf8'));
        } else {
          chunks.push(Buffer.from(String(chunk), 'utf8'));
        }
      });

      eventEmitter.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });

      eventEmitter.on('error', (error: unknown) => {
        reject(
          new Error(
            `[docker-spawner] Stream error: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      });
    });
  }

  /**
   * Spawn a container and wait for completion
   *
   * Creates a container with the specified options, starts it, captures logs,
   * waits for completion (with timeout), and returns the result.
   *
   * Timeline:
   * 1. Create container from image
   * 2. Start container
   * 3. Attach to logs (stdout/stderr)
   * 4. Wait for container completion
   * 5. Collect exit code
   * 6. Return result with logs and metadata
   *
   * On timeout:
   * 1. Stop container (SIGTERM)
   * 2. Wait 5 seconds for graceful shutdown
   * 3. Kill container (SIGKILL) if still running
   *
   * @param options Container spawn options
   * @returns Container execution result with logs and metadata
   *
   * @example
   * ```typescript
   * const spawner = new DockerSpawner();
   *
   * const result = await spawner.spawnAgentContainer({
   *   image: 'cfn-agent:latest',
   *   name: 'agent-1',
   *   memory: '512m',
   *   cpus: 0.5,
   *   env: {
   *     TASK_ID: 'task-123',
   *     AGENT_ID: 'agent-1',
   *   },
   *   mounts: [
   *     { source: '/workspace', target: '/workspace', readonly: false },
   *   ],
   *   networkMode: 'cfn-network',
   *   timeout: 300000, // 5 minutes
   * });
   *
   * if (result.success) {
   *   console.log('Task completed successfully');
   *   console.log('Output:', result.stdout);
   * } else {
   *   console.error('Task failed:', result.error);
   *   console.error('Logs:', result.stderr);
   * }
   * ```
   */
  async spawnAgentContainer(options: ContainerSpawnOptions): Promise<ContainerResult> {
    const startTime = Date.now();
    let container: DockerContainer | null = null;
    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
      console.log(`[docker-spawner] Spawning container: ${options.name}`);
      console.log(`  Image: ${options.image}`);
      console.log(`  Memory: ${options.memory}`);
      console.log(`  Timeout: ${options.timeout}ms`);

      // Parse memory string
      const memoryBytes = parseMemoryString(options.memory);
      console.log(`  Memory (bytes): ${memoryBytes}`);

      // Build environment array
      const envArray = Object.entries(options.env).map(([key, value]) => `${key}=${value}`);

      // Build bind mounts
      const binds = options.mounts.map((mount) => {
        const mode = mount.readonly ? ':ro' : ':rw';
        return `${mount.source}:${mount.target}${mode}`;
      });

      // Create host configuration
      const hostConfig: Docker.HostConfig = {
        Memory: memoryBytes,
        MemorySwap: memoryBytes, // No swap
        Binds: binds,
        NetworkMode: options.networkMode,
        AutoRemove: false, // Manual cleanup after validation
      };

      if (options.cpus) {
        // CPU quota in microseconds per second
        // cpus=0.5 -> 50000 microseconds per 100000 (1 core)
        hostConfig.CpuQuota = Math.round(options.cpus * 100000);
      }

      // Create container options
      const containerOptions: Docker.ContainerCreateOptions = {
        Image: options.image,
        name: options.name,
        Env: envArray,
        HostConfig: hostConfig,
        Cmd: options.command,
      };

      console.log(`[docker-spawner] Creating container: ${options.name}`);

      // Create container
      container = await this.docker.createContainer(containerOptions);
      const containerId = container.id.substring(0, 12);

      console.log(`[docker-spawner] Container created: ${containerId}`);
      console.log(`[docker-spawner] Starting container...`);

      // Start container
      await container.start();
      console.log(`[docker-spawner] Container started: ${containerId}`);

      // Setup timeout handler
      const timeoutPromise = new Promise<ContainerResult>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Container execution timeout after ${options.timeout}ms`));
        }, options.timeout);
      });

      // Wait for completion or timeout
      try {
        const result = await Promise.race([
          this.waitForContainer(container, containerId),
          timeoutPromise,
        ]);

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        return result;
      } catch (error) {
        // Timeout occurred - cleanup container
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes('timeout')) {
          console.warn(`[docker-spawner] Container timeout, stopping: ${containerId}`);

          try {
            await container.stop({ t: 5 }); // 5 second grace period
            console.log(`[docker-spawner] Container stopped: ${containerId}`);
          } catch (stopError) {
            console.warn(`[docker-spawner] Failed to stop container: ${stopError}`);

            try {
              await container.kill();
              console.log(`[docker-spawner] Container killed: ${containerId}`);
            } catch (killError) {
              console.error(`[docker-spawner] Failed to kill container: ${killError}`);
            }
          }

          const durationMs = Date.now() - startTime;

          return {
            success: false,
            exitCode: null,
            stdout: '',
            stderr: `Container execution timeout after ${options.timeout}ms`,
            durationMs,
            containerId,
            error: `Timeout after ${options.timeout}ms`,
          };
        }

        throw error;
      }
    } catch (error) {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.error(`[docker-spawner] Container spawn failed: ${errorMsg}`);

      // Attempt cleanup
      if (container) {
        try {
          await this.cleanupContainer(container);
        } catch (cleanupError) {
          console.warn(
            `[docker-spawner] Cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`
          );
        }
      }

      return {
        success: false,
        exitCode: null,
        stdout: '',
        stderr: errorMsg,
        durationMs,
        containerId: 'unknown',
        error: errorMsg,
      };
    }
  }

  /**
   * Wait for container to complete and collect logs
   *
   * Attaches to container logs, waits for container to exit,
   * collects stdout/stderr, and returns the result.
   *
   * @param container Docker container to wait for
   * @param containerId Short container ID for logging
   * @returns Container execution result
   */
  private async waitForContainer(container: DockerContainer, containerId: string): Promise<ContainerResult> {
    const startTime = Date.now();

    try {
      console.log(`[docker-spawner] Waiting for container completion: ${containerId}`);

      // Attach to logs for stdout/stderr capture
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
      });

      // Capture logs in parallel
      const logsPromise = this.streamToString(logStream);

      // Wait for container to exit
      const exitStatus = await container.wait();
      const exitCode = exitStatus.StatusCode;

      console.log(`[docker-spawner] Container exited with code: ${exitCode}`);

      // Get logs
      const logs = await logsPromise;

      const durationMs = Date.now() - startTime;

      return {
        success: exitCode === 0,
        exitCode,
        stdout: logs,
        stderr: '', // Docker logs combine stdout/stderr, but we try to separate with simple heuristics
        durationMs,
        containerId,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.error(`[docker-spawner] Wait failed: ${errorMsg}`);

      return {
        success: false,
        exitCode: null,
        stdout: '',
        stderr: errorMsg,
        durationMs,
        containerId,
        error: errorMsg,
      };
    }
  }

  /**
   * Clean up a container by removing it
   *
   * Attempts to stop the container gracefully before removal.
   * Safe to call on already-stopped or non-existent containers.
   *
   * @param container Docker container to remove
   * @param force Force remove without stopping (default: false)
   *
   * @example
   * ```typescript
   * await spawner.cleanupContainer(container);
   * ```
   */
  async cleanupContainer(container: DockerContainer, force: boolean = false): Promise<void> {
    const containerId = container.id.substring(0, 12);

    try {
      console.log(`[docker-spawner] Cleaning up container: ${containerId}`);

      if (!force) {
        try {
          // Try graceful stop first
          console.log(`[docker-spawner] Stopping container: ${containerId}`);
          await container.stop({ t: 5 }); // 5 second grace period
          console.log(`[docker-spawner] Container stopped: ${containerId}`);
        } catch (stopError) {
          // Container may already be stopped
          if (
            !(stopError instanceof Error && stopError.message.includes('already stopped'))
          ) {
            console.warn(
              `[docker-spawner] Stop failed: ${stopError instanceof Error ? stopError.message : stopError}`
            );
          }
        }
      }

      // Remove container
      console.log(`[docker-spawner] Removing container: ${containerId}`);
      await container.remove({ force });
      console.log(`[docker-spawner] Container removed: ${containerId}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // May fail if container doesn't exist, which is OK
      if (errorMsg.includes('404') || errorMsg.includes('No such container')) {
        console.log(`[docker-spawner] Container not found (already removed): ${containerId}`);
      } else {
        console.error(`[docker-spawner] Cleanup failed: ${errorMsg}`);
        throw error;
      }
    }
  }
}

export default DockerSpawner;
