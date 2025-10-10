/**
 * FleetMonitor - Real-time fleet monitoring and metrics collection
 *
 * Features:
 * - Real-time performance metrics
 * - Health monitoring
 * - Predictive maintenance
 * - Alert generation
 *
 * @module fleet-manager/monitoring
 * @version 2.0.0
 */

import { EventEmitter } from 'events';

/**
 * Monitoring configuration schema
 */
export const MonitoringConfigSchema = {
  enabled: true,
  metricsInterval: 10000,
  retentionDays: 30,
  alertThresholds: {
    agentFailureRate: 0.05,
    taskFailureRate: 0.1,
    averageResponseTime: 5000,
    poolUtilization: 0.95
  }
};

/**
 * FleetMonitor class
 */
export class FleetMonitor extends EventEmitter {
  constructor({ fleetManager, config = {} }) {
    super();

    this.fleetManager = fleetManager;
    this.config = { ...MonitoringConfigSchema, ...config };
    this.isRunning = false;
    this.metricsInterval = null;

    this.metricsHistory = [];
    this.maxHistorySize = (this.config.retentionDays * 24 * 60 * 60 * 1000) / this.config.metricsInterval;
  }

  /**
   * Initialize fleet monitor
   */
  async initialize() {
    if (!this.config.enabled) {
      console.log('📊 Fleet monitoring disabled');
      return;
    }

    this.isRunning = true;

    // Start metrics collection interval
    this.metricsInterval = setInterval(() => {
      this.collectMetrics().catch(error => {
        console.error('❌ Metrics collection failed:', error);
        this.emit('error', { type: 'metrics_collection_failed', error: error.message });
      });
    }, this.config.metricsInterval);

    console.log('📊 Fleet monitor initialized');
  }

  /**
   * Collect current fleet metrics
   */
  async collectMetrics() {
    if (!this.isRunning) return;

    try {
      const status = await this.fleetManager.getStatus();
      const health = await this.fleetManager.getHealth();

      const metrics = {
        timestamp: Date.now(),
        fleet: {
          totalAgents: status.agents.total,
          activeAgents: status.agents.active,
          idleAgents: status.agents.idle,
          failedAgents: status.agents.failed
        },
        tasks: {
          completed: status.metrics.tasksCompleted,
          failed: status.metrics.tasksFailed,
          successRate: status.metrics.tasksCompleted > 0
            ? status.metrics.tasksCompleted / (status.metrics.tasksCompleted + status.metrics.tasksFailed)
            : 1.0
        },
        performance: {
          averageResponseTime: status.metrics.averageResponseTime,
          uptime: status.metrics.uptime
        },
        coordination: status.coordination,
        health: health.status,
        pools: Object.entries(status.pools).map(([type, pool]) => ({
          type,
          currentAgents: pool.currentAgents,
          utilization: pool.utilization,
          activeAllocations: pool.metrics.activeAllocations
        }))
      };

      // Add to history
      this.metricsHistory.push(metrics);
      if (this.metricsHistory.length > this.maxHistorySize) {
        this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
      }

      // Check alert thresholds
      this.checkAlerts(metrics);

      // Emit metrics event
      this.emit('metrics', metrics);

    } catch (error) {
      console.error('❌ Metrics collection failed:', error);
      this.emit('error', { type: 'metrics_collection_failed', error: error.message });
    }
  }

  /**
   * Check for alert conditions
   */
  checkAlerts(metrics) {
    const thresholds = this.config.alertThresholds;

    // Agent failure rate
    if (metrics.fleet.totalAgents > 0) {
      const failureRate = metrics.fleet.failedAgents / metrics.fleet.totalAgents;
      if (failureRate > thresholds.agentFailureRate) {
        this.emit('alert', {
          type: 'high_agent_failure_rate',
          severity: 'warning',
          message: `Agent failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold ${(thresholds.agentFailureRate * 100)}%`,
          value: failureRate,
          threshold: thresholds.agentFailureRate,
          timestamp: Date.now()
        });
      }
    }

    // Task failure rate
    if (metrics.tasks.successRate < (1 - thresholds.taskFailureRate)) {
      this.emit('alert', {
        type: 'high_task_failure_rate',
        severity: 'warning',
        message: `Task success rate ${(metrics.tasks.successRate * 100).toFixed(1)}% below acceptable threshold`,
        value: metrics.tasks.successRate,
        threshold: 1 - thresholds.taskFailureRate,
        timestamp: Date.now()
      });
    }

    // Response time
    if (metrics.performance.averageResponseTime > thresholds.averageResponseTime) {
      this.emit('alert', {
        type: 'high_response_time',
        severity: 'warning',
        message: `Average response time ${metrics.performance.averageResponseTime}ms exceeds threshold ${thresholds.averageResponseTime}ms`,
        value: metrics.performance.averageResponseTime,
        threshold: thresholds.averageResponseTime,
        timestamp: Date.now()
      });
    }

    // Pool utilization
    for (const pool of metrics.pools) {
      if (pool.utilization > thresholds.poolUtilization) {
        this.emit('alert', {
          type: 'high_pool_utilization',
          severity: 'info',
          message: `Pool ${pool.type} utilization ${(pool.utilization * 100).toFixed(1)}% approaching maximum`,
          poolType: pool.type,
          value: pool.utilization,
          threshold: thresholds.poolUtilization,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(timeRange = 3600000) { // Default 1 hour
    const now = Date.now();
    const startTime = now - timeRange;

    const recentMetrics = this.metricsHistory.filter(m => m.timestamp >= startTime);

    if (recentMetrics.length === 0) {
      return null;
    }

    const summary = {
      timeRange: {
        start: recentMetrics[0].timestamp,
        end: recentMetrics[recentMetrics.length - 1].timestamp,
        duration: timeRange
      },
      agents: {
        avgTotal: 0,
        avgActive: 0,
        avgIdle: 0,
        avgFailed: 0
      },
      tasks: {
        totalCompleted: recentMetrics[recentMetrics.length - 1].tasks.completed,
        totalFailed: recentMetrics[recentMetrics.length - 1].tasks.failed,
        avgSuccessRate: 0
      },
      performance: {
        avgResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: -Infinity
      }
    };

    // Calculate averages
    let totalAgents = 0, totalActive = 0, totalIdle = 0, totalFailed = 0;
    let totalSuccessRate = 0, totalResponseTime = 0;

    for (const metrics of recentMetrics) {
      totalAgents += metrics.fleet.totalAgents;
      totalActive += metrics.fleet.activeAgents;
      totalIdle += metrics.fleet.idleAgents;
      totalFailed += metrics.fleet.failedAgents;
      totalSuccessRate += metrics.tasks.successRate;
      totalResponseTime += metrics.performance.averageResponseTime;

      summary.performance.minResponseTime = Math.min(
        summary.performance.minResponseTime,
        metrics.performance.averageResponseTime
      );
      summary.performance.maxResponseTime = Math.max(
        summary.performance.maxResponseTime,
        metrics.performance.averageResponseTime
      );
    }

    const count = recentMetrics.length;
    summary.agents.avgTotal = totalAgents / count;
    summary.agents.avgActive = totalActive / count;
    summary.agents.avgIdle = totalIdle / count;
    summary.agents.avgFailed = totalFailed / count;
    summary.tasks.avgSuccessRate = totalSuccessRate / count;
    summary.performance.avgResponseTime = totalResponseTime / count;

    return summary;
  }

  /**
   * Get full metrics history
   */
  getMetricsHistory() {
    return [...this.metricsHistory];
  }

  /**
   * Clear metrics history
   */
  clearHistory() {
    this.metricsHistory = [];
  }

  /**
   * Shutdown fleet monitor
   */
  async shutdown() {
    this.isRunning = false;

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    console.log('📊 Fleet monitor shutdown');
  }
}

export default FleetMonitor;
