/**
 * Metrics Aggregator
 * Collects and aggregates system metrics, emits metrics_update events
 */

import * as os from 'os';
import type { WebSocketServer } from '../SocketIOServer';
import type { SystemMetrics } from '../types';

export interface MetricsAggregatorConfig {
  pollInterval?: number; // ms
  enableSystemMetrics?: boolean;
  enableAgentMetrics?: boolean;
}

export class MetricsAggregator {
  private wsServer: WebSocketServer;
  private config: Required<MetricsAggregatorConfig>;
  private pollInterval?: NodeJS.Timeout;
  private lastMetrics: SystemMetrics | null = null;
  private agentCounts = {
    total: 0,
    active: 0,
    idle: 0,
    failed: 0
  };

  constructor(wsServer: WebSocketServer, config: MetricsAggregatorConfig = {}) {
    this.wsServer = wsServer;
    this.config = {
      pollInterval: config.pollInterval || 5000,
      enableSystemMetrics: config.enableSystemMetrics !== false,
      enableAgentMetrics: config.enableAgentMetrics !== false
    };
  }

  /**
   * Start metrics polling
   */
  public start(): void {
    if (this.pollInterval) {
      console.warn('MetricsAggregator already started');
      return;
    }

    this.pollInterval = setInterval(() => {
      this.collectAndEmitMetrics();
    }, this.config.pollInterval);

    console.log(`MetricsAggregator started (poll interval: ${this.config.pollInterval}ms)`);

    // Emit initial metrics
    this.collectAndEmitMetrics();
  }

  /**
   * Stop metrics polling
   */
  public stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
      console.log('MetricsAggregator stopped');
    }
  }

  /**
   * Collect and emit metrics
   */
  private collectAndEmitMetrics(): void {
    const metrics = this.collectMetrics();
    this.lastMetrics = metrics;

    this.wsServer.emitMetricsUpdate({
      system: metrics.system,
      agents: metrics.agents,
      swarms: metrics.swarms
    });
  }

  /**
   * Collect system metrics
   */
  private collectMetrics(): SystemMetrics {
    const systemMetrics = this.config.enableSystemMetrics
      ? this.collectSystemMetrics()
      : {
          cpu: 0,
          memory: 0,
          disk: 0,
          network: { bytesIn: 0, bytesOut: 0 }
        };

    const agentMetrics = this.config.enableAgentMetrics
      ? this.agentCounts
      : {
          total: 0,
          active: 0,
          idle: 0,
          failed: 0
        };

    return {
      system: systemMetrics,
      agents: agentMetrics,
      timestamp: new Date()
    };
  }

  /**
   * Collect system-level metrics
   */
  private collectSystemMetrics() {
    // CPU usage (average across all cores)
    const cpus = os.cpus();
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + (100 - (idle / total) * 100);
    }, 0) / cpus.length;

    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = ((totalMem - freeMem) / totalMem) * 100;

    // Network metrics (placeholder - would need better implementation)
    const wsMetrics = this.wsServer.getMetrics();
    const networkMetrics = {
      bytesIn: wsMetrics.bytesReceived,
      bytesOut: wsMetrics.bytesSent
    };

    return {
      cpu: Math.round(cpuUsage * 100) / 100,
      memory: Math.round(memUsage * 100) / 100,
      disk: 0, // Placeholder - would need disk I/O monitoring
      network: networkMetrics
    };
  }

  /**
   * Update agent counts (called by external systems)
   */
  public updateAgentCounts(counts: {
    total?: number;
    active?: number;
    idle?: number;
    failed?: number;
  }): void {
    if (counts.total !== undefined) this.agentCounts.total = counts.total;
    if (counts.active !== undefined) this.agentCounts.active = counts.active;
    if (counts.idle !== undefined) this.agentCounts.idle = counts.idle;
    if (counts.failed !== undefined) this.agentCounts.failed = counts.failed;
  }

  /**
   * Get last metrics
   */
  public getLastMetrics(): SystemMetrics | null {
    return this.lastMetrics;
  }

  /**
   * Get agent counts
   */
  public getAgentCounts() {
    return { ...this.agentCounts };
  }
}

export default MetricsAggregator;
