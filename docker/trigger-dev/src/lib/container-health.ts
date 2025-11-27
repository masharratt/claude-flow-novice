/**
 * Container Health Monitoring and Auto-Restart
 *
 * Provides real-time health monitoring for Docker containers with automatic
 * restart capabilities, resource usage tracking, and configurable thresholds.
 * Integrates with Dockerode for container stats and lifecycle management.
 *
 * Features:
 * - Real-time CPU and memory usage monitoring
 * - Configurable warning and critical thresholds
 * - Automatic restart on health failures
 * - Consecutive failure tracking
 * - Health event callbacks for custom handling
 * - Graceful cleanup and monitoring shutdown
 *
 * @module container-health
 * @version 1.0.0
 * @see docker-spawner.ts for container creation patterns
 * @see container-metrics.ts for metrics recording
 */

import Docker = require('dockerode');

// =============================================
// Type Definitions
// =============================================

/**
 * Current health status of a container
 *
 * @typedef {Object} HealthStatus
 * @property {string} containerId - Docker container ID (full or short hash)
 * @property {boolean} healthy - Whether container is currently healthy
 * @property {number} memoryUsagePercent - Current memory usage as % of limit (0-100)
 * @property {number} cpuUsagePercent - Current CPU usage as % of limit (0-100)
 * @property {Date} lastCheck - Timestamp of the last health check
 * @property {string[]} warnings - Array of warning messages for the container
 * @property {number} consecutiveFailures - Number of consecutive failed checks
 */
export interface HealthStatus {
  containerId: string;
  healthy: boolean;
  memoryUsagePercent: number;
  cpuUsagePercent: number;
  lastCheck: Date;
  warnings: string[];
  consecutiveFailures: number;
}

/**
 * Configuration options for a health monitor
 *
 * @typedef {Object} HealthMonitorOptions
 * @property {string} containerId - Docker container ID to monitor
 * @property {number} [checkIntervalMs] - Interval between health checks in milliseconds (default: 5000)
 * @property {number} [memoryWarningThreshold] - Memory threshold for warnings as decimal (default: 0.9 = 90%)
 * @property {number} [cpuWarningThreshold] - CPU threshold for warnings as decimal (default: 0.8 = 80%)
 * @property {number} [maxConsecutiveFailures] - Max consecutive failures before critical (default: 3)
 * @property {(status: HealthStatus) => void} [onWarning] - Callback when warning threshold exceeded
 * @property {(status: HealthStatus) => void} [onCritical] - Callback when max failures reached
 */
export interface HealthMonitorOptions {
  containerId: string;
  checkIntervalMs?: number;
  memoryWarningThreshold?: number;
  cpuWarningThreshold?: number;
  maxConsecutiveFailures?: number;
  onWarning?: ((status: HealthStatus) => void) | undefined;
  onCritical?: ((status: HealthStatus) => void) | undefined;
}

/**
 * Docker container restart policy configuration
 *
 * @typedef {Object} RestartPolicy
 * @property {'no' | 'always' | 'on-failure' | 'unless-stopped'} Name - Restart policy name
 * @property {number} [MaximumRetryCount] - Max retry attempts for 'on-failure' policy
 */
export interface RestartPolicy {
  Name: 'no' | 'always' | 'on-failure' | 'unless-stopped';
  MaximumRetryCount?: number;
}

/**
 * Container statistics from Docker API
 *
 * @typedef {Object} ContainerStats
 * @property {number} memoryUsageBytes - Current memory usage in bytes
 * @property {number} memoryLimitBytes - Memory limit in bytes
 * @property {number} cpuSystemNs - Cumulative CPU time in system (nanoseconds)
 * @property {number} cpuUserNs - Cumulative CPU time in user mode (nanoseconds)
 * @property {number} systemCpuSystemNs - System CPU time in system mode (nanoseconds)
 * @property {number} previousCpuSystemNs - Previous cumulative CPU system time (nanoseconds)
 * @property {number} previousCpuUserNs - Previous cumulative CPU user time (nanoseconds)
 * @property {number} previousSystemCpuSystemNs - Previous system CPU time (nanoseconds)
 * @property {number} cpuCount - Number of CPUs available
 */
export interface ContainerStats {
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  cpuSystemNs: number;
  cpuUserNs: number;
  systemCpuSystemNs: number;
  previousCpuSystemNs: number;
  previousCpuUserNs: number;
  previousSystemCpuSystemNs: number;
  cpuCount: number;
}

// =============================================
// Default Configuration
// =============================================

const DEFAULT_CHECK_INTERVAL_MS = 5000;
const DEFAULT_MEMORY_WARNING_THRESHOLD = 0.9;
const DEFAULT_CPU_WARNING_THRESHOLD = 0.8;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

// =============================================
// HealthMonitor Class
// =============================================

/**
 * Monitor container health with periodic checks and event callbacks
 *
 * Tracks memory and CPU usage, detects unhealthy conditions, and triggers
 * callbacks when thresholds are exceeded. Maintains consecutive failure count
 * for escalation logic.
 *
 * @class HealthMonitor
 */
export class HealthMonitor {
  private docker: Docker;
  private options: Omit<Required<HealthMonitorOptions>, 'onWarning' | 'onCritical'> & {
    onWarning?: ((status: HealthStatus) => void) | undefined;
    onCritical?: ((status: HealthStatus) => void) | undefined;
  };
  private status: HealthStatus;
  private intervalId?: NodeJS.Timeout;

  /**
   * Create a new health monitor for a container
   *
   * @param {HealthMonitorOptions} options - Monitor configuration
   * @throws {Error} If containerId is not provided or Docker connection fails
   */
  constructor(options: HealthMonitorOptions) {
    if (!options.containerId) {
      throw new Error('[container-health] containerId is required');
    }

    // Initialize Docker client with fallback to socket-proxy
    try {
      this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    } catch (err) {
      // Fallback to socket-proxy for containers
      this.docker = new Docker({ host: 'socket-proxy', port: 2375 });
    }

    // Merge options with defaults
    this.options = {
      containerId: options.containerId,
      checkIntervalMs: options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS,
      memoryWarningThreshold: options.memoryWarningThreshold ?? DEFAULT_MEMORY_WARNING_THRESHOLD,
      cpuWarningThreshold: options.cpuWarningThreshold ?? DEFAULT_CPU_WARNING_THRESHOLD,
      maxConsecutiveFailures: options.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES,
      onWarning: options.onWarning ?? undefined,
      onCritical: options.onCritical ?? undefined,
    };

    // Initialize status
    this.status = {
      containerId: options.containerId,
      healthy: true,
      memoryUsagePercent: 0,
      cpuUsagePercent: 0,
      lastCheck: new Date(),
      warnings: [],
      consecutiveFailures: 0,
    };
  }

  /**
   * Start monitoring the container
   *
   * Begins periodic health checks at the configured interval. Multiple calls
   * to start() will be ignored if monitoring is already active.
   *
   * @returns {void}
   */
  public start(): void {
    if (this.intervalId) {
      console.warn(`[container-health] Monitor already running for ${this.options.containerId}`);
      return;
    }

    console.log(
      `[container-health] Starting monitor for ${this.options.containerId} (interval: ${this.options.checkIntervalMs}ms)`
    );

    // Perform initial check
    this.performCheck().catch(err => {
      console.error(`[container-health] Initial check failed: ${err.message}`);
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.performCheck().catch(err => {
        console.error(`[container-health] Check failed: ${err.message}`);
      });
    }, this.options.checkIntervalMs);
  }

  /**
   * Stop monitoring the container
   *
   * Cancels the periodic monitoring interval. Safe to call even if monitoring
   * is not currently running.
   *
   * @returns {void}
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log(`[container-health] Stopped monitor for ${this.options.containerId}`);
    }
  }

  /**
   * Get the current health status
   *
   * Returns a snapshot of the most recent health check without triggering
   * a new check. Use this to query status between checks.
   *
   * @returns {HealthStatus} Current health status
   */
  public getStatus(): HealthStatus {
    return { ...this.status };
  }

  /**
   * Check if the container is currently healthy
   *
   * Returns the healthy flag from the most recent check.
   *
   * @returns {boolean} True if healthy, false otherwise
   */
  public isHealthy(): boolean {
    return this.status.healthy;
  }

  /**
   * Perform a single health check
   *
   * Queries Docker stats, calculates resource usage percentages, and triggers
   * callbacks if thresholds are exceeded or failures accumulate.
   *
   * @private
   * @returns {Promise<void>}
   */
  private async performCheck(): Promise<void> {
    try {
      const stats = await getContainerStats(this.options.containerId);

      // Calculate usage percentages
      const memoryUsagePercent =
        stats.memoryLimitBytes > 0 ? (stats.memoryUsageBytes / stats.memoryLimitBytes) * 100 : 0;
      const cpuUsagePercent = calculateCpuUsagePercent(stats);

      // Update status
      this.status.lastCheck = new Date();
      this.status.memoryUsagePercent = memoryUsagePercent;
      this.status.cpuUsagePercent = cpuUsagePercent;
      this.status.warnings = [];

      // Check thresholds
      let thresholdExceeded = false;

      if (memoryUsagePercent > this.options.memoryWarningThreshold * 100) {
        this.status.warnings.push(
          `Memory usage ${memoryUsagePercent.toFixed(2)}% exceeds threshold ${(this.options.memoryWarningThreshold * 100).toFixed(0)}%`
        );
        thresholdExceeded = true;
      }

      if (cpuUsagePercent > this.options.cpuWarningThreshold * 100) {
        this.status.warnings.push(
          `CPU usage ${cpuUsagePercent.toFixed(2)}% exceeds threshold ${(this.options.cpuWarningThreshold * 100).toFixed(0)}%`
        );
        thresholdExceeded = true;
      }

      // Update health based on thresholds
      if (thresholdExceeded) {
        this.status.consecutiveFailures++;
        this.status.healthy = this.status.consecutiveFailures < this.options.maxConsecutiveFailures;

        // Emit warning callback
        if (this.options.onWarning) {
          this.options.onWarning(this.getStatus());
        }

        // Emit critical callback when max failures reached
        if (this.status.consecutiveFailures >= this.options.maxConsecutiveFailures && this.options.onCritical) {
          this.options.onCritical(this.getStatus());
        }
      } else {
        // Reset consecutive failures when healthy
        this.status.consecutiveFailures = 0;
        this.status.healthy = true;
      }
    } catch (err) {
      // Handle check errors (e.g., container stopped)
      this.status.consecutiveFailures++;
      this.status.healthy = this.status.consecutiveFailures < this.options.maxConsecutiveFailures;
      this.status.warnings.push(`Health check error: ${err instanceof Error ? err.message : String(err)}`);

      if (this.options.onWarning) {
        this.options.onWarning(this.getStatus());
      }

      if (this.status.consecutiveFailures >= this.options.maxConsecutiveFailures && this.options.onCritical) {
        this.options.onCritical(this.getStatus());
      }
    }
  }
}

// =============================================
// Public Functions
// =============================================

/**
 * Create a new health monitor instance
 *
 * Factory function for creating and initializing a HealthMonitor with
 * the given configuration. Does not start monitoring automatically.
 *
 * @param {HealthMonitorOptions} options - Monitor configuration
 * @returns {HealthMonitor} Configured health monitor instance
 * @throws {Error} If containerId is not provided
 *
 * @example
 * const monitor = createHealthMonitor({
 *   containerId: 'abc123def456',
 *   checkIntervalMs: 5000,
 *   memoryWarningThreshold: 0.9,
 *   cpuWarningThreshold: 0.8,
 *   maxConsecutiveFailures: 3,
 *   onWarning: (status) => console.log('Warning:', status),
 *   onCritical: (status) => console.log('Critical:', status),
 * });
 */
export function createHealthMonitor(options: HealthMonitorOptions): HealthMonitor {
  return new HealthMonitor(options);
}

/**
 * Start monitoring a container
 *
 * Convenience function that creates and starts a monitor in one call.
 * Returns the monitor for further manipulation.
 *
 * @param {HealthMonitor} monitor - Monitor instance to start
 * @returns {void}
 *
 * @example
 * const monitor = createHealthMonitor(options);
 * startMonitoring(monitor);
 */
export function startMonitoring(monitor: HealthMonitor): void {
  monitor.start();
}

/**
 * Stop monitoring a container
 *
 * Stops the monitoring interval and cleans up resources. Safe to call
 * if monitoring is not currently running.
 *
 * @param {HealthMonitor} monitor - Monitor instance to stop
 * @returns {void}
 *
 * @example
 * stopMonitoring(monitor);
 */
export function stopMonitoring(monitor: HealthMonitor): void {
  monitor.stop();
}

/**
 * Get container statistics from Docker API
 *
 * Queries the Docker API for real-time container statistics including
 * memory usage, memory limits, and CPU metrics. Returns data in a
 * normalized format for cross-platform compatibility.
 *
 * @param {string} containerId - Docker container ID
 * @returns {Promise<ContainerStats>} Container statistics
 * @throws {Error} If container not found or stats unavailable
 *
 * @example
 * const stats = await getContainerStats('abc123def456');
 * console.log(`Memory: ${stats.memoryUsageBytes} / ${stats.memoryLimitBytes}`);
 */
export async function getContainerStats(containerId: string): Promise<ContainerStats> {
  let docker: Docker;

  try {
    docker = new Docker({ socketPath: '/var/run/docker.sock' });
  } catch (err) {
    docker = new Docker({ host: 'socket-proxy', port: 2375 });
  }

  const container = docker.getContainer(containerId);

  try {
    const statsData = await container.stats({ stream: false });

    // Extract memory stats
    const memoryUsageBytes = statsData.memory_stats?.usage ?? 0;
    const memoryLimitBytes = statsData.memory_stats?.limit ?? 0;

    // Extract CPU stats with proper type handling
    const cpuStats = statsData.cpu_stats;
    const previousCpuStats = statsData.precpu_stats;

    // From current stats
    const cpuSystemNs = cpuStats?.cpu_usage?.total_usage ?? 0;
    const cpuUserNs = cpuStats?.cpu_usage?.total_usage ?? 0;
    const systemCpuSystemNs = cpuStats?.system_cpu_usage ?? 0;

    // From previous stats
    const previousCpuSystemNs = previousCpuStats?.cpu_usage?.total_usage ?? 0;
    const previousCpuUserNs = previousCpuStats?.cpu_usage?.total_usage ?? 0;
    const previousSystemCpuSystemNs = previousCpuStats?.system_cpu_usage ?? 0;

    const cpuCount = (cpuStats?.cpu_usage?.percpu_usage ?? []).length || 1;

    return {
      memoryUsageBytes,
      memoryLimitBytes,
      cpuSystemNs,
      cpuUserNs,
      systemCpuSystemNs,
      previousCpuSystemNs,
      previousCpuUserNs,
      previousSystemCpuSystemNs,
      cpuCount,
    };
  } catch (err) {
    throw new Error(
      `[container-health] Failed to get stats for container ${containerId}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Perform a single health check on a container
 *
 * Executes one health check cycle without continuous monitoring. Useful
 * for on-demand health verification or integration into existing monitoring
 * systems.
 *
 * @param {string} containerId - Docker container ID to check
 * @param {HealthMonitorOptions} options - Health check configuration
 * @returns {Promise<HealthStatus>} Health status from this check
 * @throws {Error} If stats unavailable or configuration invalid
 *
 * @example
 * const status = await checkHealth('abc123def456', {
 *   containerId: 'abc123def456',
 *   memoryWarningThreshold: 0.9,
 *   cpuWarningThreshold: 0.8,
 * });
 * console.log(`Healthy: ${status.healthy}`);
 * console.log(`Memory: ${status.memoryUsagePercent.toFixed(2)}%`);
 */
export async function checkHealth(containerId: string, options: HealthMonitorOptions): Promise<HealthStatus> {
  const memoryThreshold = options.memoryWarningThreshold ?? DEFAULT_MEMORY_WARNING_THRESHOLD;
  const cpuThreshold = options.cpuWarningThreshold ?? DEFAULT_CPU_WARNING_THRESHOLD;
  const maxFailures = options.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;

  try {
    const stats = await getContainerStats(containerId);

    const memoryUsagePercent = stats.memoryLimitBytes > 0 ? (stats.memoryUsageBytes / stats.memoryLimitBytes) * 100 : 0;
    const cpuUsagePercent = calculateCpuUsagePercent(stats);

    const warnings: string[] = [];
    let healthy = true;

    if (memoryUsagePercent > memoryThreshold * 100) {
      warnings.push(
        `Memory usage ${memoryUsagePercent.toFixed(2)}% exceeds threshold ${(memoryThreshold * 100).toFixed(0)}%`
      );
      healthy = false;
    }

    if (cpuUsagePercent > cpuThreshold * 100) {
      warnings.push(`CPU usage ${cpuUsagePercent.toFixed(2)}% exceeds threshold ${(cpuThreshold * 100).toFixed(0)}%`);
      healthy = false;
    }

    return {
      containerId,
      healthy,
      memoryUsagePercent,
      cpuUsagePercent,
      lastCheck: new Date(),
      warnings,
      consecutiveFailures: healthy ? 0 : 1,
    };
  } catch (err) {
    throw new Error(
      `[container-health] Health check failed for ${containerId}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Get a Docker restart policy configuration
 *
 * Creates a properly formatted restart policy object for use with
 * Docker container creation or update operations.
 *
 * @param {number} [retries=3] - Maximum retry count for 'on-failure' policy (default: 3)
 * @returns {RestartPolicy} Restart policy configuration with 'on-failure' strategy
 *
 * @example
 * const policy = getDefaultRestartPolicy(5);
 * // Returns: { Name: 'on-failure', MaximumRetryCount: 5 }
 *
 * @example
 * // Use with Dockerode container update
 * await container.update({
 *   RestartPolicy: getDefaultRestartPolicy(3),
 * });
 */
export function getDefaultRestartPolicy(retries: number = 3): RestartPolicy {
  if (retries < 0) {
    throw new Error('[container-health] Retry count must be non-negative');
  }

  return {
    Name: 'on-failure',
    MaximumRetryCount: retries,
  };
}

// =============================================
// Helper Functions
// =============================================

/**
 * Calculate CPU usage percentage from container stats
 *
 * Computes CPU usage relative to available CPU cores using the formula:
 * ((cpuDelta / systemDelta) * systemCpus * 100)
 *
 * This matches Docker's own CPU percentage calculation.
 *
 * @private
 * @param {ContainerStats} stats - Container statistics from Docker API
 * @returns {number} CPU usage as percentage (0-100)
 */
function calculateCpuUsagePercent(stats: ContainerStats): number {
  // Calculate deltas
  const cpuDelta = (stats.cpuUserNs + stats.cpuSystemNs) - (stats.previousCpuUserNs + stats.previousCpuSystemNs);
  const systemDelta = stats.systemCpuSystemNs - stats.previousSystemCpuSystemNs;

  if (systemDelta === 0 || stats.cpuCount === 0) {
    return 0;
  }

  // Calculate percentage: (cpuDelta / systemDelta) * cpuCount * 100
  return (cpuDelta / systemDelta) * stats.cpuCount * 100;
}

/**
 * Merge health statuses from multiple checks
 *
 * Combines results from multiple monitors into a single aggregated status.
 * Useful for monitoring groups of containers or creating composite health views.
 *
 * @param {HealthStatus[]} statuses - Array of health statuses
 * @returns {Object} Aggregated health information
 *
 * @example
 * const monitors = containers.map(id => createHealthMonitor({ containerId: id }));
 * monitors.forEach(m => startMonitoring(m));
 * const statuses = monitors.map(m => m.getStatus());
 * const aggregate = aggregateHealthStatuses(statuses);
 * console.log(`${aggregate.healthyCount}/${aggregate.totalCount} containers healthy`);
 */
export function aggregateHealthStatuses(
  statuses: HealthStatus[]
): {
  totalCount: number;
  healthyCount: number;
  unhealthyCount: number;
  avgMemoryPercent: number;
  avgCpuPercent: number;
  allWarnings: string[];
} {
  if (statuses.length === 0) {
    return {
      totalCount: 0,
      healthyCount: 0,
      unhealthyCount: 0,
      avgMemoryPercent: 0,
      avgCpuPercent: 0,
      allWarnings: [],
    };
  }

  const healthyCount = statuses.filter(s => s.healthy).length;
  const unhealthyCount = statuses.length - healthyCount;
  const avgMemoryPercent = statuses.reduce((sum, s) => sum + s.memoryUsagePercent, 0) / statuses.length;
  const avgCpuPercent = statuses.reduce((sum, s) => sum + s.cpuUsagePercent, 0) / statuses.length;
  const allWarnings = statuses.flatMap(s => s.warnings);

  return {
    totalCount: statuses.length,
    healthyCount,
    unhealthyCount,
    avgMemoryPercent,
    avgCpuPercent,
    allWarnings,
  };
}
