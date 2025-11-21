/**
 * Monitor Wrapper Module
 * TypeScript implementation for monitoring CFN Docker infrastructure
 *
 * Migrated from: docker/scripts/monitor-wrapper.sh
 */

import { exec } from 'execa';
import { EventEmitter } from 'events';

export interface MonitorWrapperOptions {
  teamId: string;
  interval?: number;
  duration?: number;
  verbose?: boolean;
  memoryThreshold?: number;
  cpuThreshold?: number;
}

export interface Metrics {
  timestamp: number;
  memory?: string;
  cpu?: string;
  containers?: number;
}

/**
 * MonitorWrapper class - Monitors CFN Docker infrastructure
 */
export class MonitorWrapper extends EventEmitter {
  teamId: string;
  options: Required<MonitorWrapperOptions>;
  private metricsHistory: Metrics[] = [];
  private monitoringActive: boolean = false;
  private startTime: number = 0;

  constructor(options: MonitorWrapperOptions) {
    super();
    this.teamId = options.teamId;
    this.options = {
      interval: options.interval ?? 5,
      duration: options.duration ?? 300,
      verbose: options.verbose ?? false,
      memoryThreshold: options.memoryThreshold ?? 0.85,
      cpuThreshold: options.cpuThreshold ?? 0.90,
      ...options,
    };
  }

  /**
   * Get coordinator status
   */
  async getCoordinatorStatus(): Promise<string> {
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
   * Get all team containers
   */
  async getTeamContainers(): Promise<any[]> {
    try {
      const result = await exec(
        `docker ps -a --filter "label=cfn.team=${this.teamId}" --format '{{json .}}'`,
        { shell: true }
      );

      const lines = result.stdout.trim().split('\n').filter((l) => l);
      return lines.map((line) => JSON.parse(line));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get coordinator memory usage
   */
  async getCoordinatorMemory(): Promise<string> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker stats --no-stream --format "table {{.MemUsage}}" "${coordinatorName}"`,
        { shell: true }
      );

      return result.stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get total team memory usage
   */
  async getTotalMemoryUsage(): Promise<any> {
    try {
      const result = await exec(
        `docker stats --no-stream --filter "label=cfn.team=${this.teamId}" --format '{{json .}}'`,
        { shell: true }
      );

      return JSON.parse(result.stdout);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if memory is overloaded
   */
  async isMemoryOverloaded(): Promise<boolean> {
    const stats = await this.getTotalMemoryUsage();

    if (!stats) return false;

    const memUsageStr = stats.MemUsage || '';
    const memLimitStr = stats.MemLimit || '';

    const parseMemory = (str: string): number => {
      const match = str.match(/(\d+\.?\d*)(GB|MB)/);
      if (!match) return 0;

      const value = parseFloat(match[1]);
      const unit = match[2];

      return unit === 'GB' ? value : value / 1024;
    };

    const used = parseMemory(memUsageStr);
    const limit = parseMemory(memLimitStr);

    return limit > 0 && used / limit > this.options.memoryThreshold;
  }

  /**
   * Check thresholds and emit alerts
   */
  async checkThresholds(): Promise<void> {
    const overloaded = await this.isMemoryOverloaded();

    if (overloaded) {
      const alert = `ALERT: Memory usage exceeds ${this.options.memoryThreshold * 100}% threshold`;
      this.emit('alert', alert);
    }
  }

  /**
   * Check memory thresholds specifically
   */
  async checkMemoryThresholds(): Promise<void> {
    const stats = await this.getTotalMemoryUsage();

    if (stats && stats.MemUsage) {
      const memPercent = parseFloat(stats.MemPercent || '0');

      if (memPercent > this.options.memoryThreshold * 100) {
        this.emit('alert', `Memory usage at ${memPercent}% (threshold: ${this.options.memoryThreshold * 100}%)`);
      }
    }
  }

  /**
   * Get coordinator CPU usage
   */
  async getCoordinatorCpu(): Promise<string> {
    const coordinatorName = `cfn-docker-team-coordinator-${this.teamId}`;

    try {
      const result = await exec(
        `docker stats --no-stream --format "table {{.CPUPerc}}" "${coordinatorName}"`,
        { shell: true }
      );

      return result.stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get total team CPU usage
   */
  async getTotalCpuUsage(): Promise<any> {
    try {
      const result = await exec(
        `docker stats --no-stream --filter "label=cfn.team=${this.teamId}" --format '{{json .}}'`,
        { shell: true }
      );

      return JSON.parse(result.stdout);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if CPU is overloaded
   */
  async isCpuOverloaded(): Promise<boolean> {
    const stats = await this.getTotalCpuUsage();

    if (!stats) return false;

    const cpuPercent = parseFloat(stats.CPUPercent || '0');

    return cpuPercent > this.options.cpuThreshold * 100;
  }

  /**
   * Get network status
   */
  async getNetworkStatus(): Promise<any> {
    const networkName = `team-${this.teamId}`;

    try {
      const result = await exec(
        `docker network inspect "${networkName}" --format '{{json .}}'`,
        { shell: true }
      );

      return JSON.parse(result.stdout);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check network connectivity
   */
  async checkNetworkConnectivity(): Promise<boolean> {
    try {
      const network = await this.getNetworkStatus();

      return network !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if coordinator is healthy
   */
  async isCoordinatorHealthy(): Promise<boolean> {
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
   * Perform full health check
   */
  async performFullHealthCheck(): Promise<any> {
    return {
      coordinator: await this.isCoordinatorHealthy(),
      redis: await this.isRedisHealthy(),
      network: await this.checkNetworkConnectivity(),
      timestamp: Date.now(),
    };
  }

  /**
   * Collect metrics
   */
  async collectMetrics(): Promise<Metrics> {
    const memory = await this.getCoordinatorMemory();
    const cpu = await this.getCoordinatorCpu();
    const containers = (await this.getTeamContainers()).length;

    const metrics: Metrics = {
      timestamp: Date.now(),
      memory,
      cpu,
      containers,
    };

    this.metricsHistory.push(metrics);

    return metrics;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(): Metrics[] {
    return this.metricsHistory;
  }

  /**
   * Start monitoring
   */
  startMonitoring(): void {
    this.monitoringActive = true;
    this.startTime = Date.now();

    this.emit('log', `Starting monitoring for team: ${this.teamId}`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.monitoringActive = false;

    this.emit('log', 'Monitoring stopped');
  }

  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean {
    return this.monitoringActive;
  }

  /**
   * Get elapsed time
   */
  getElapsedTime(): number {
    return this.startTime > 0 ? Date.now() - this.startTime : 0;
  }

  /**
   * Generate monitoring report
   */
  async generateReport(): Promise<any> {
    const health = await this.performFullHealthCheck();
    const metrics = this.metricsHistory;

    return {
      team: this.teamId,
      health,
      metrics,
      summary: {
        duration: this.getElapsedTime(),
        metricsCollected: metrics.length,
        healthy: health.coordinator && health.redis && health.network,
      },
    };
  }
}
