/**
 * Redis Performance Monitoring Dashboard
 *
 * Real-time performance monitoring for Redis operations with metrics visualization
 * and alerting capabilities for swarm orchestration systems.
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

/**
 * Performance monitoring dashboard class
 */
export class RedisPerformanceDashboard extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // Dashboard configuration
      refreshInterval: config.refreshInterval || 5000, // 5 seconds
      retentionPeriod: config.retentionPeriod || 3600000, // 1 hour
      alertThresholds: {
        latency: config.latencyThreshold || 100, // ms
        errorRate: config.errorRateThreshold || 5, // %
        memoryUsage: config.memoryThreshold || 80, // %
        connectionUtilization: config.connectionThreshold || 90 // %
      },
      // Output configuration
      logFile: config.logFile || './logs/redis-performance.json',
      enableWebDashboard: config.enableWebDashboard !== false,
      webPort: config.webPort || 3001,
      ...config
    };

    this.metricsHistory = [];
    this.alerts = [];
    this.isRunning = false;
    this.dashboardTimer = null;

    // Performance collectors
    this.redisClient = null;
    this.metricsCollector = null;
  }

  /**
   * Initialize the dashboard with a Redis client
   */
  async initialize(redisClient) {
    try {
      this.redisClient = redisClient;
      this.metricsCollector = new MetricsCollector(this.redisClient);

      // Initialize logging
      await this.ensureLogDirectory();

      console.log('🚀 Redis Performance Dashboard initialized');
      this.emit('initialized', { timestamp: Date.now() });

    } catch (error) {
      console.error('❌ Failed to initialize dashboard:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Start the monitoring dashboard
   */
  async start() {
    if (this.isRunning) {
      console.warn('⚠️ Dashboard is already running');
      return;
    }

    try {
      this.isRunning = true;

      // Start metrics collection
      this.startMetricsCollection();

      // Start web dashboard if enabled
      if (this.config.enableWebDashboard) {
        await this.startWebDashboard();
      }

      console.log('✅ Performance monitoring dashboard started');
      this.emit('started', { timestamp: Date.now() });

    } catch (error) {
      this.isRunning = false;
      console.error('❌ Failed to start dashboard:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop the monitoring dashboard
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      this.isRunning = false;

      if (this.dashboardTimer) {
        clearInterval(this.dashboardTimer);
        this.dashboardTimer = null;
      }

      // Generate final report
      await this.generateFinalReport();

      console.log('🛑 Performance monitoring dashboard stopped');
      this.emit('stopped', { timestamp: Date.now() });

    } catch (error) {
      console.error('❌ Error stopping dashboard:', error);
      this.emit('error', error);
    }
  }

  /**
   * Start periodic metrics collection
   */
  startMetricsCollection() {
    this.dashboardTimer = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        await this.processMetrics(metrics);
      } catch (error) {
        console.error('❌ Error collecting metrics:', error);
        this.emit('error', error);
      }
    }, this.config.refreshInterval);
  }

  /**
   * Collect comprehensive performance metrics
   */
  async collectMetrics() {
    const timestamp = Date.now();

    try {
      // Get Redis client performance report
      const clientReport = this.redisClient.getPerformanceReport();

      // Get system metrics
      const systemMetrics = await this.metricsCollector.collectSystemMetrics();

      // Get Redis server metrics
      const serverMetrics = await this.metricsCollector.collectRedisMetrics();

      return {
        timestamp,
        client: clientReport,
        system: systemMetrics,
        server: serverMetrics
      };

    } catch (error) {
      console.error('❌ Error collecting metrics:', error);
      return {
        timestamp,
        error: error.message,
        status: 'error'
      };
    }
  }

  /**
   * Process collected metrics and check for alerts
   */
  async processMetrics(metrics) {
    // Store metrics history
    this.metricsHistory.push(metrics);

    // Maintain retention period
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoffTime);

    // Check for performance alerts
    const alerts = this.checkPerformanceAlerts(metrics);
    if (alerts.length > 0) {
      alerts.forEach(alert => {
        this.alerts.push(alert);
        this.emit('alert', alert);
        console.warn(`🚨 PERFORMANCE ALERT: ${alert.message}`);
      });
    }

    // Log metrics
    await this.logMetrics(metrics);

    // Emit metrics event
    this.emit('metrics', metrics);
  }

  /**
   * Check for performance alerts based on thresholds
   */
  checkPerformanceAlerts(metrics) {
    const alerts = [];

    if (!metrics.client || !metrics.client.performance) {
      return alerts;
    }

    const { performance, health, pool } = metrics.client;
    const thresholds = this.config.alertThresholds;

    // Latency alerts
    if (performance.latency.avg > thresholds.latency) {
      alerts.push({
        type: 'LATENCY_HIGH',
        severity: 'WARNING',
        message: `Average latency ${performance.latency.avg.toFixed(2)}ms exceeds threshold ${thresholds.latency}ms`,
        value: performance.latency.avg,
        threshold: thresholds.latency,
        timestamp: Date.now()
      });
    }

    // Error rate alerts
    if (performance.summary.errorRate > thresholds.errorRate) {
      alerts.push({
        type: 'ERROR_RATE_HIGH',
        severity: 'CRITICAL',
        message: `Error rate ${performance.summary.errorRate.toFixed(2)}% exceeds threshold ${thresholds.errorRate}%`,
        value: performance.summary.errorRate,
        threshold: thresholds.errorRate,
        timestamp: Date.now()
      });
    }

    // Connection pool utilization alerts
    if (pool && pool.totalConnections > 0) {
      const utilization = (pool.inUseConnections / pool.totalConnections) * 100;
      if (utilization > thresholds.connectionUtilization) {
        alerts.push({
          type: 'CONNECTION_POOL_HIGH',
          severity: 'WARNING',
          message: `Connection pool utilization ${utilization.toFixed(1)}% exceeds threshold ${thresholds.connectionUtilization}%`,
          value: utilization,
          threshold: thresholds.connectionUtilization,
          timestamp: Date.now()
        });
      }
    }

    // Health status alerts
    if (health.status !== 'healthy') {
      alerts.push({
        type: 'HEALTH_CHECK_FAILED',
        severity: 'CRITICAL',
        message: `Redis health check failed: ${health.status}`,
        healthStatus: health.status,
        timestamp: Date.now()
      });
    }

    return alerts;
  }

  /**
   * Log metrics to file
   */
  async logMetrics(metrics) {
    try {
      const logEntry = {
        ...metrics,
        loggedAt: new Date().toISOString()
      };

      await fs.appendFile(this.config.logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('❌ Failed to log metrics:', error);
    }
  }

  /**
   * Generate performance summary report
   */
  generatePerformanceReport() {
    if (this.metricsHistory.length === 0) {
      return { status: 'NO_DATA', message: 'No metrics data available' };
    }

    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    const alerts = this.alerts.slice(-10); // Last 10 alerts

    return {
      summary: {
        uptime: latest.client?.performance?.summary?.uptime || 0,
        totalOperations: latest.client?.performance?.summary?.totalOperations || 0,
        successRate: latest.client?.performance?.summary?.successRate || 0,
        averageLatency: latest.client?.performance?.latency?.avg || 0,
        throughput: latest.client?.performance?.summary?.throughput || 0
      },
      health: latest.client?.health || { status: 'unknown' },
      pool: latest.client?.pool || { totalConnections: 0 },
      alerts: {
        count: alerts.length,
        recent: alerts
      },
      timestamp: Date.now()
    };
  }

  /**
   * Generate detailed performance analysis
   */
  generateDetailedAnalysis() {
    if (this.metricsHistory.length < 2) {
      return { status: 'INSUFFICIENT_DATA', message: 'Need at least 2 data points for analysis' };
    }

    const recentMetrics = this.metricsHistory.slice(-10); // Last 10 samples
    const latencyData = recentMetrics.map(m => m.client?.performance?.latency?.avg || 0);
    const throughputData = recentMetrics.map(m => m.client?.performance?.summary?.throughput || 0);

    return {
      trends: {
        latency: {
          current: latencyData[latencyData.length - 1],
          average: latencyData.reduce((a, b) => a + b, 0) / latencyData.length,
          trend: this.calculateTrend(latencyData)
        },
        throughput: {
          current: throughputData[throughputData.length - 1],
          average: throughputData.reduce((a, b) => a + b, 0) / throughputData.length,
          trend: this.calculateTrend(throughputData)
        }
      },
      alerts: {
        total: this.alerts.length,
        critical: this.alerts.filter(a => a.severity === 'CRITICAL').length,
        warnings: this.alerts.filter(a => a.severity === 'WARNING').length
      },
      recommendations: this.generateRecommendations(),
      timestamp: Date.now()
    };
  }

  /**
   * Calculate trend from data points
   */
  calculateTrend(data) {
    if (data.length < 2) return 'stable';

    const first = data[0];
    const last = data[data.length - 1];
    const change = ((last - first) / first) * 100;

    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    const latest = this.metricsHistory[this.metricsHistory.length - 1];

    if (!latest.client) return recommendations;

    const { performance, pool } = latest.client;

    // Latency recommendations
    if (performance.latency.avg > 50) {
      recommendations.push({
        category: 'LATENCY',
        priority: 'HIGH',
        message: 'Consider increasing connection pool size or enabling pipelining',
        current: performance.latency.avg,
        target: 50
      });
    }

    // Memory recommendations
    if (performance.memory.compressionRatio < 0.3) {
      recommendations.push({
        category: 'MEMORY',
        priority: 'MEDIUM',
        message: 'Compression efficiency is low. Review compression threshold settings',
        current: performance.memory.compressionRatio,
        target: 0.5
      });
    }

    // Connection pool recommendations
    if (pool && pool.totalConnections > 0) {
      const utilization = (pool.inUseConnections / pool.totalConnections) * 100;
      if (utilization > 80) {
        recommendations.push({
          category: 'CONNECTIONS',
          priority: 'HIGH',
          message: 'Connection pool utilization is high. Consider increasing maxConnections',
          current: utilization,
          target: 70
        });
      }
    }

    return recommendations;
  }

  /**
   * Ensure log directory exists
   */
  async ensureLogDirectory() {
    try {
      const logDir = path.dirname(this.config.logFile);
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      console.warn('⚠️ Could not create log directory:', error.message);
    }
  }

  /**
   * Generate final report on shutdown
   */
  async generateFinalReport() {
    try {
      const report = {
        summary: this.generatePerformanceReport(),
        analysis: this.generateDetailedAnalysis(),
        alerts: this.alerts,
        metricsCollected: this.metricsHistory.length,
        uptime: Date.now() - (this.metricsHistory[0]?.timestamp || Date.now())
      };

      const reportFile = this.config.logFile.replace('.json', '-final-report.json');
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

      console.log(`📊 Final performance report generated: ${reportFile}`);
      return report;
    } catch (error) {
      console.error('❌ Failed to generate final report:', error);
    }
  }

  /**
   * Get current status snapshot
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      metricsCollected: this.metricsHistory.length,
      alertsCount: this.alerts.length,
      uptime: this.isRunning ? Date.now() - (this.metricsHistory[0]?.timestamp || Date.now()) : 0,
      lastUpdate: this.metricsHistory.length > 0 ? this.metricsHistory[this.metricsHistory.length - 1].timestamp : null
    };
  }

  /**
   * Get real-time metrics for API consumption
   */
  getRealTimeMetrics() {
    if (this.metricsHistory.length === 0) {
      return { status: 'NO_DATA' };
    }

    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    const previous = this.metricsHistory.length > 1 ? this.metricsHistory[this.metricsHistory.length - 2] : null;

    return {
      current: latest,
      previous,
      alerts: this.alerts.slice(-5), // Last 5 alerts
      status: this.getStatus()
    };
  }
}

/**
 * Metrics collector for system and Redis server metrics
 */
class MetricsCollector {
  constructor(redisClient) {
    this.redisClient = redisClient;
  }

  async collectSystemMetrics() {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      return {
        memory: {
          rss: memUsage.rss,
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          heapUsedPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        uptime: process.uptime(),
        pid: process.pid
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async collectRedisMetrics() {
    try {
      // Get Redis info
      const info = await this.redisClient.executeCommand('info');
      const parsedInfo = this.parseRedisInfo(info);

      return {
        memory: {
          used: parsedInfo.memory?.used_memory || 0,
          peak: parsedInfo.memory?.used_memory_peak || 0,
          rss: parsedInfo.memory?.used_memory_rss || 0,
          usedHuman: parsedInfo.memory?.used_memory_human || '0B'
        },
        clients: {
          connected: parsedInfo.clients?.connected_clients || 0,
          blocked: parsedInfo.clients?.blocked_clients || 0
        },
        stats: {
          totalCommands: parsedInfo.stats?.total_commands_processed || 0,
          totalOperations: parsedInfo.stats?.total_net_input_bytes || 0,
          keyspaceHits: parsedInfo.stats?.keyspace_hits || 0,
          keyspaceMisses: parsedInfo.stats?.keyspace_misses || 0
        },
        server: {
          version: parsedInfo.server?.redis_version || 'unknown',
          uptime: parsedInfo.server?.uptime_in_seconds || 0
        }
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  parseRedisInfo(info) {
    const parsed = {};
    const sections = info.split('\r\n\r\n');

    sections.forEach(section => {
      const lines = section.split('\r\n');
      if (lines.length === 0) return;

      const sectionName = lines[0].includes('#') ?
        lines[0].replace('# ', '').toLowerCase() : 'default';

      parsed[sectionName] = {};

      lines.slice(1).forEach(line => {
        if (line && line.includes(':')) {
          const [key, value] = line.split(':');
          parsed[sectionName][key.toLowerCase()] = isNaN(value) ? value : Number(value);
        }
      });
    });

    return parsed;
  }
}

export default RedisPerformanceDashboard;