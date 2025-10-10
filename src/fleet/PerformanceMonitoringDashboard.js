/**
 * PerformanceMonitoringDashboard - Enterprise-grade performance monitoring for 100+ concurrent agents
 *
 * Features:
 * - Real-time performance metrics visualization
 * - Advanced analytics and reporting
 * - Alerting and notification system
 * - Historical data analysis and trends
 * - Multi-dimensional performance monitoring
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';

/**
 * Dashboard configuration
 */
const DASHBOARD_CONFIG = {
  // Monitoring intervals
  monitoring: {
    metricsInterval: 5000,        // 5 seconds
    aggregationInterval: 60000,   // 1 minute
    cleanupInterval: 3600000,     // 1 hour
    reportInterval: 86400000      // 24 hours
  },

  // Data retention
  retention: {
    realtimeData: 3600000,        // 1 hour
    aggregatedData: 604800000,    // 7 days
    reports: 2592000000           // 30 days
  },

  // Performance thresholds
  thresholds: {
    responseTime: {
      warning: 2000,              // 2 seconds
      critical: 5000              // 5 seconds
    },
    cpuUtilization: {
      warning: 0.70,              // 70%
      critical: 0.90              // 90%
    },
    memoryUtilization: {
      warning: 0.80,              // 80%
      critical: 0.95              // 95%
    },
    errorRate: {
      warning: 0.05,              // 5%
      critical: 0.10              // 10%
    },
    throughput: {
      warning: 100,               // 100 requests/minute
      critical: 50                // 50 requests/minute
    }
  },

  // Alerts configuration
  alerts: {
    enabled: true,
    channels: ['console', 'redis', 'file'],
    debouncePeriod: 300000,      // 5 minutes
    escalationPeriod: 900000     // 15 minutes
  },

  // Redis configuration
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },

  // Channels for coordination
  channels: {
    metrics: 'swarm:scalability:dashboard_metrics',
    alerts: 'swarm:scalability:dashboard_alerts',
    reports: 'swarm:scalability:dashboard_reports'
  }
};

/**
 * Metric types
 */
const METRIC_TYPES = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  TIMER: 'timer'
};

/**
 * Alert severity levels
 */
const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

/**
 * PerformanceMonitoringDashboard class
 */
export class PerformanceMonitoringDashboard extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...DASHBOARD_CONFIG, ...options };
    this.dashboardId = `dashboard-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Redis client
    this.redis = null;

    // System state
    this.isInitialized = false;
    this.isRunning = false;

    // Metrics storage
    this.realtimeMetrics = new Map();
    this.aggregatedMetrics = new Map();
    this.historicalData = [];
    this.metricDefinitions = new Map();

    // Performance data
    this.performanceData = {
      agents: new Map(),
      system: {
        cpu: [],
        memory: [],
        disk: [],
        network: []
      },
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        responseTime: []
      },
      scaling: {
        events: [],
        predictions: [],
        efficiency: []
      }
    };

    // Alert system
    this.alerts = new Map();
    this.alertHistory = [];
    this.alertDebouncers = new Map();

    // Dashboard state
    this.dashboardState = {
      lastUpdate: Date.now(),
      totalAgents: 0,
      activeAgents: 0,
      systemHealth: 'healthy',
      performance: {
        overall: 0,
        responseTime: 0,
        throughput: 0,
        errorRate: 0
      }
    };

    // Timers
    this.monitoringTimer = null;
    this.aggregationTimer = null;
    this.cleanupTimer = null;
    this.reportTimer = null;

    this.setupEventHandlers();
  }

  /**
   * Initialize the performance monitoring dashboard
   */
  async initialize() {
    try {
      this.emit('status', { status: 'initializing', message: 'Initializing Performance Monitoring Dashboard' });

      // Initialize Redis connection
      await this.initializeRedis();

      // Setup metric definitions
      await this.setupMetricDefinitions();

      // Load historical data
      await this.loadHistoricalData();

      // Start monitoring processes
      this.startMonitoringProcesses();

      this.isInitialized = true;
      this.isRunning = true;

      // Announce dashboard startup
      await this.publishDashboardEvent({
        type: 'dashboard_started',
        dashboardId: this.dashboardId,
        timestamp: Date.now(),
        config: this.config
      });

      this.emit('status', { status: 'running', message: 'Performance Monitoring Dashboard initialized successfully' });
      console.log(`🚀 Performance Monitoring Dashboard ${this.dashboardId} initialized`);

    } catch (error) {
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Initialize Redis connection
   */
  async initializeRedis() {
    this.redis = createClient(this.config.redis);
    await this.redis.connect();

    console.log('📡 Redis connection established for performance dashboard');
  }

  /**
   * Setup metric definitions
   */
  async setupMetricDefinitions() {
    // System metrics
    this.defineMetric('system.cpu.utilization', METRIC_TYPES.GAUGE, 'CPU utilization percentage');
    this.defineMetric('system.memory.utilization', METRIC_TYPES.GAUGE, 'Memory utilization percentage');
    this.defineMetric('system.disk.utilization', METRIC_TYPES.GAUGE, 'Disk utilization percentage');
    this.defineMetric('system.network.throughput', METRIC_TYPES.GAUGE, 'Network throughput (bytes/sec)');

    // Agent metrics
    this.defineMetric('agents.total', METRIC_TYPES.GAUGE, 'Total number of agents');
    this.defineMetric('agents.active', METRIC_TYPES.GAUGE, 'Number of active agents');
    this.defineMetric('agents.healthy', METRIC_TYPES.GAUGE, 'Number of healthy agents');
    this.defineMetric('agents.utilization', METRIC_TYPES.GAUGE, 'Average agent utilization');

    // Request metrics
    this.defineMetric('requests.total', METRIC_TYPES.COUNTER, 'Total number of requests');
    this.defineMetric('requests.successful', METRIC_TYPES.COUNTER, 'Number of successful requests');
    this.defineMetric('requests.failed', METRIC_TYPES.COUNTER, 'Number of failed requests');
    this.defineMetric('requests.response_time', METRIC_TYPES.TIMER, 'Request response time');
    this.defineMetric('requests.error_rate', METRIC_TYPES.GAUGE, 'Request error rate');

    // Scaling metrics
    this.defineMetric('scaling.events', METRIC_TYPES.COUNTER, 'Number of scaling events');
    this.defineMetric('scaling.predictions', METRIC_TYPES.COUNTER, 'Number of scaling predictions');
    this.defineMetric('scaling.efficiency', METRIC_TYPES.GAUGE, 'Scaling efficiency percentage');

    console.log('📊 Metric definitions configured');
  }

  /**
   * Define a metric
   */
  defineMetric(name, type, description) {
    this.metricDefinitions.set(name, {
      name,
      type,
      description,
      values: [],
      lastUpdate: null
    });
  }

  /**
   * Load historical data
   */
  async loadHistoricalData() {
    try {
      const historicalData = await this.redis.get(`dashboard:historical:${this.dashboardId}`);
      if (historicalData) {
        const data = JSON.parse(historicalData);
        this.historicalData = data.historicalData || [];
        this.performanceData = { ...this.performanceData, ...data.performanceData };
      }

      console.log(`📈 Loaded ${this.historicalData.length} historical data points`);
    } catch (error) {
      console.warn('Failed to load historical data:', error.message);
    }
  }

  /**
   * Start monitoring processes
   */
  startMonitoringProcesses() {
    // Real-time metrics collection
    this.monitoringTimer = setInterval(async () => {
      await this.collectMetrics();
    }, this.config.monitoring.metricsInterval);

    // Data aggregation
    this.aggregationTimer = setInterval(async () => {
      await this.aggregateMetrics();
    }, this.config.monitoring.aggregationInterval);

    // Data cleanup
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupData();
    }, this.config.monitoring.cleanupInterval);

    // Report generation
    this.reportTimer = setInterval(async () => {
      await this.generateReports();
    }, this.config.monitoring.reportInterval);

    console.log('🔄 Monitoring processes started');
  }

  /**
   * Collect metrics from various sources
   */
  async collectMetrics() {
    try {
      const timestamp = Date.now();

      // Collect system metrics
      await this.collectSystemMetrics(timestamp);

      // Collect agent metrics
      await this.collectAgentMetrics(timestamp);

      // Collect request metrics
      await this.collectRequestMetrics(timestamp);

      // Collect scaling metrics
      await this.collectScalingMetrics(timestamp);

      // Update dashboard state
      await this.updateDashboardState(timestamp);

      // Check thresholds and generate alerts
      await this.checkThresholds(timestamp);

    } catch (error) {
      this.emit('error', { type: 'metrics_collection_failed', error: error.message });
    }
  }

  /**
   * Collect system metrics
   */
  async collectSystemMetrics(timestamp) {
    try {
      // Get system metrics from Redis
      const systemMetrics = await this.redis.hGetAll('system:metrics');

      if (systemMetrics && Object.keys(systemMetrics).length > 0) {
        const cpu = parseFloat(systemMetrics.cpuUtilization) || 0;
        const memory = parseFloat(systemMetrics.memoryUtilization) || 0;
        const disk = parseFloat(systemMetrics.diskUtilization) || 0;
        const network = parseFloat(systemMetrics.networkThroughput) || 0;

        // Update metric definitions
        this.updateMetric('system.cpu.utilization', cpu, timestamp);
        this.updateMetric('system.memory.utilization', memory, timestamp);
        this.updateMetric('system.disk.utilization', disk, timestamp);
        this.updateMetric('system.network.throughput', network, timestamp);

        // Store in performance data
        this.performanceData.system.cpu.push({ timestamp, value: cpu });
        this.performanceData.system.memory.push({ timestamp, value: memory });
        this.performanceData.system.disk.push({ timestamp, value: disk });
        this.performanceData.system.network.push({ timestamp, value: network });

        // Keep arrays manageable
        const maxPoints = 720; // 1 hour of 5-second intervals
        if (this.performanceData.system.cpu.length > maxPoints) {
          this.performanceData.system.cpu = this.performanceData.system.cpu.slice(-maxPoints);
          this.performanceData.system.memory = this.performanceData.system.memory.slice(-maxPoints);
          this.performanceData.system.disk = this.performanceData.system.disk.slice(-maxPoints);
          this.performanceData.system.network = this.performanceData.system.network.slice(-maxPoints);
        }
      }

    } catch (error) {
      console.warn('Failed to collect system metrics:', error.message);
    }
  }

  /**
   * Collect agent metrics
   */
  async collectAgentMetrics(timestamp) {
    try {
      // Get agent metrics from Redis
      const agentMetrics = await this.redis.hGetAll('agents:metrics');

      if (agentMetrics && Object.keys(agentMetrics).length > 0) {
        const total = parseInt(agentMetrics.total) || 0;
        const active = parseInt(agentMetrics.active) || 0;
        const healthy = parseInt(agentMetrics.healthy) || 0;
        const utilization = parseFloat(agentMetrics.utilization) || 0;

        // Update metric definitions
        this.updateMetric('agents.total', total, timestamp);
        this.updateMetric('agents.active', active, timestamp);
        this.updateMetric('agents.healthy', healthy, timestamp);
        this.updateMetric('agents.utilization', utilization, timestamp);

        // Update dashboard state
        this.dashboardState.totalAgents = total;
        this.dashboardState.activeAgents = active;
      }

    } catch (error) {
      console.warn('Failed to collect agent metrics:', error.message);
    }
  }

  /**
   * Collect request metrics
   */
  async collectRequestMetrics(timestamp) {
    try {
      // Get request metrics from Redis
      const requestMetrics = await this.redis.hGetAll('requests:metrics');

      if (requestMetrics && Object.keys(requestMetrics).length > 0) {
        const total = parseInt(requestMetrics.total) || 0;
        const successful = parseInt(requestMetrics.successful) || 0;
        const failed = parseInt(requestMetrics.failed) || 0;
        const responseTime = parseFloat(requestMetrics.responseTime) || 0;
        const errorRate = total > 0 ? failed / total : 0;

        // Update metric definitions
        this.updateMetric('requests.total', total, timestamp);
        this.updateMetric('requests.successful', successful, timestamp);
        this.updateMetric('requests.failed', failed, timestamp);
        this.updateMetric('requests.response_time', responseTime, timestamp);
        this.updateMetric('requests.error_rate', errorRate, timestamp);

        // Store in performance data
        this.performanceData.requests.total = total;
        this.performanceData.requests.successful = successful;
        this.performanceData.requests.failed = failed;
        this.performanceData.requests.responseTime.push({ timestamp, value: responseTime });

        // Update dashboard state
        this.dashboardState.performance.responseTime = responseTime;
        this.dashboardState.performance.throughput = successful / 60; // per minute
        this.dashboardState.performance.errorRate = errorRate;

        // Keep response time history manageable
        if (this.performanceData.requests.responseTime.length > 720) {
          this.performanceData.requests.responseTime = this.performanceData.requests.responseTime.slice(-720);
        }
      }

    } catch (error) {
      console.warn('Failed to collect request metrics:', error.message);
    }
  }

  /**
   * Collect scaling metrics
   */
  async collectScalingMetrics(timestamp) {
    try {
      // Get scaling metrics from Redis
      const scalingMetrics = await this.redis.hGetAll('scaling:metrics');

      if (scalingMetrics && Object.keys(scalingMetrics).length > 0) {
        const events = parseInt(scalingMetrics.events) || 0;
        const predictions = parseInt(scalingMetrics.predictions) || 0;
        const efficiency = parseFloat(scalingMetrics.efficiency) || 0;

        // Update metric definitions
        this.updateMetric('scaling.events', events, timestamp);
        this.updateMetric('scaling.predictions', predictions, timestamp);
        this.updateMetric('scaling.efficiency', efficiency, timestamp);

        // Store in performance data
        this.performanceData.scaling.events.push({ timestamp, value: events });
        this.performanceData.scaling.predictions.push({ timestamp, value: predictions });
        this.performanceData.scaling.efficiency.push({ timestamp, value: efficiency });

        // Keep arrays manageable
        const maxPoints = 1440; // 24 hours of 1-minute intervals
        if (this.performanceData.scaling.events.length > maxPoints) {
          this.performanceData.scaling.events = this.performanceData.scaling.events.slice(-maxPoints);
          this.performanceData.scaling.predictions = this.performanceData.scaling.predictions.slice(-maxPoints);
          this.performanceData.scaling.efficiency = this.performanceData.scaling.efficiency.slice(-maxPoints);
        }
      }

    } catch (error) {
      console.warn('Failed to collect scaling metrics:', error.message);
    }
  }

  /**
   * Update a metric value
   */
  updateMetric(name, value, timestamp) {
    const metric = this.metricDefinitions.get(name);
    if (!metric) return;

    metric.values.push({ timestamp, value });
    metric.lastUpdate = timestamp;

    // Keep values manageable
    const maxValues = metric.type === METRIC_TYPES.COUNTER ? 100 : 720;
    if (metric.values.length > maxValues) {
      metric.values = metric.values.slice(-maxValues);
    }

    // Store in realtime metrics
    this.realtimeMetrics.set(name, { value, timestamp });
  }

  /**
   * Update dashboard state
   */
  async updateDashboardState(timestamp) {
    this.dashboardState.lastUpdate = timestamp;

    // Calculate overall performance score
    const responseTimeScore = Math.max(0, 1 - (this.dashboardState.performance.responseTime / 5000));
    const throughputScore = Math.min(1, this.dashboardState.performance.throughput / 100);
    const errorRateScore = Math.max(0, 1 - this.dashboardState.performance.errorRate);

    this.dashboardState.performance.overall = (responseTimeScore + throughputScore + errorRateScore) / 3;

    // Determine system health
    const healthFactors = [
      this.dashboardState.performance.overall > 0.8,
      this.dashboardState.performance.errorRate < 0.05,
      this.dashboardState.activeAgents > 0
    ];

    const healthyFactors = healthFactors.filter(Boolean).length;
    if (healthyFactors === 3) {
      this.dashboardState.systemHealth = 'healthy';
    } else if (healthyFactors >= 2) {
      this.dashboardState.systemHealth = 'warning';
    } else {
      this.dashboardState.systemHealth = 'critical';
    }

    // Publish updated state
    await this.publishDashboardEvent({
      type: 'state_updated',
      state: this.dashboardState,
      timestamp
    });
  }

  /**
   * Check thresholds and generate alerts
   */
  async checkThresholds(timestamp) {
    if (!this.config.alerts.enabled) return;

    const alerts = [];

    // Check response time
    const responseTime = this.dashboardState.performance.responseTime;
    if (responseTime > this.config.thresholds.responseTime.critical) {
      alerts.push(this.createAlert('response_time', ALERT_SEVERITY.CRITICAL,
        `Response time (${responseTime.toFixed(0)}ms) exceeds critical threshold (${this.config.thresholds.responseTime.critical}ms)`, timestamp));
    } else if (responseTime > this.config.thresholds.responseTime.warning) {
      alerts.push(this.createAlert('response_time', ALERT_SEVERITY.WARNING,
        `Response time (${responseTime.toFixed(0)}ms) exceeds warning threshold (${this.config.thresholds.responseTime.warning}ms)`, timestamp));
    }

    // Check error rate
    const errorRate = this.dashboardState.performance.errorRate;
    if (errorRate > this.config.thresholds.errorRate.critical) {
      alerts.push(this.createAlert('error_rate', ALERT_SEVERITY.CRITICAL,
        `Error rate (${(errorRate * 100).toFixed(1)}%) exceeds critical threshold (${(this.config.thresholds.errorRate.critical * 100).toFixed(1)}%)`, timestamp));
    } else if (errorRate > this.config.thresholds.errorRate.warning) {
      alerts.push(this.createAlert('error_rate', ALERT_SEVERITY.WARNING,
        `Error rate (${(errorRate * 100).toFixed(1)}%) exceeds warning threshold (${(this.config.thresholds.errorRate.warning * 100).toFixed(1)}%)`, timestamp));
    }

    // Process alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }
  }

  /**
   * Create an alert
   */
  createAlert(type, severity, message, timestamp) {
    return {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      timestamp,
      acknowledged: false,
      resolved: false
    };
  }

  /**
   * Process an alert
   */
  async processAlert(alert) {
    // Check debounce
    if (this.isAlertDebounced(alert.type, alert.severity)) {
      return;
    }

    // Store alert
    this.alerts.set(alert.id, alert);
    this.alertHistory.push(alert);

    // Set debounce
    this.setAlertDebounce(alert.type, alert.severity);

    // Publish alert
    await this.publishAlert(alert);

    // Emit alert event
    this.emit('alert', alert);

    console.log(`🚨 ${alert.severity.toUpperCase()} Alert: ${alert.message}`);
  }

  /**
   * Check if alert is debounced
   */
  isAlertDebounced(type, severity) {
    const key = `${type}:${severity}`;
    const debounceTime = this.alertDebouncers.get(key);
    return debounceTime && (Date.now() - debounceTime) < this.config.alerts.debouncePeriod;
  }

  /**
   * Set alert debounce
   */
  setAlertDebounce(type, severity) {
    const key = `${type}:${severity}`;
    this.alertDebouncers.set(key, Date.now());
  }

  /**
   * Publish alert
   */
  async publishAlert(alert) {
    try {
      const alertData = {
        dashboardId: this.dashboardId,
        ...alert,
        timestamp: Date.now()
      };

      // Publish to Redis
      await this.redis.publish(this.config.channels.alerts, JSON.stringify(alertData));

      // Write to file if configured
      if (this.config.alerts.channels.includes('file')) {
        await this.writeAlertToFile(alert);
      }

    } catch (error) {
      console.warn('Failed to publish alert:', error.message);
    }
  }

  /**
   * Write alert to file
   */
  async writeAlertToFile(alert) {
    try {
      const alertLog = `${new Date(alert.timestamp).toISOString()} [${alert.severity.toUpperCase()}] ${alert.message}\n`;
      await fs.appendFile('alerts.log', alertLog);
    } catch (error) {
      console.warn('Failed to write alert to file:', error.message);
    }
  }

  /**
   * Aggregate metrics
   */
  async aggregateMetrics() {
    try {
      const timestamp = Date.now();
      const aggregatedData = {};

      // Aggregate each metric
      for (const [name, metric] of this.metricDefinitions) {
        const aggregated = this.aggregateMetric(metric, timestamp);
        if (aggregated) {
          aggregatedData[name] = aggregated;
        }
      }

      // Store aggregated metrics
      await this.redis.setex(
        `dashboard:aggregated:${this.dashboardId}:${timestamp}`,
        this.config.retention.aggregatedData / 1000,
        JSON.stringify(aggregatedData)
      );

      // Add to historical data
      this.historicalData.push({
        timestamp,
        data: aggregatedData
      });

      // Keep historical data manageable
      if (this.historicalData.length > 10080) { // 7 days of 1-minute intervals
        this.historicalData = this.historicalData.slice(-5040); // Keep 3.5 days
      }

      console.log(`📊 Aggregated ${Object.keys(aggregatedData).length} metrics`);

    } catch (error) {
      console.warn('Failed to aggregate metrics:', error.message);
    }
  }

  /**
   * Aggregate a single metric
   */
  aggregateMetric(metric, timestamp) {
    if (metric.values.length === 0) return null;

    const values = metric.values.map(v => v.value);

    switch (metric.type) {
      case METRIC_TYPES.GAUGE:
        return {
          type: metric.type,
          timestamp,
          current: values[values.length - 1],
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          count: values.length
        };

      case METRIC_TYPES.COUNTER:
        return {
          type: metric.type,
          timestamp,
          current: values[values.length - 1],
          increment: values.length > 1 ? values[values.length - 1] - values[values.length - 2] : 0
        };

      case METRIC_TYPES.TIMER:
        return {
          type: metric.type,
          timestamp,
          current: values[values.length - 1],
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          p50: this.percentile(values, 0.5),
          p95: this.percentile(values, 0.95),
          p99: this.percentile(values, 0.99),
          count: values.length
        };

      default:
        return null;
    }
  }

  /**
   * Calculate percentile
   */
  percentile(values, percentile) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Cleanup old data
   */
  async cleanupData() {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      // Cleanup metric values
      for (const metric of this.metricDefinitions.values()) {
        const cutoffTime = now - this.config.retention.realtimeData;
        const originalLength = metric.values.length;
        metric.values = metric.values.filter(v => v.timestamp > cutoffTime);
        cleanedCount += originalLength - metric.values.length;
      }

      // Cleanup alert history
      const alertCutoffTime = now - this.config.retention.reports;
      const originalAlertLength = this.alertHistory.length;
      this.alertHistory = this.alertHistory.filter(alert => alert.timestamp > alertCutoffTime);
      cleanedCount += originalAlertLength - this.alertHistory.length;

      // Cleanup debouncers
      for (const [key, time] of this.alertDebouncers.entries()) {
        if (now - time > this.config.alerts.debouncePeriod) {
          this.alertDebouncers.delete(key);
        }
      }

      // Cleanup performance data
      const performanceCutoffTime = now - this.config.retention.realtimeData;

      for (const key in this.performanceData.system) {
        if (Array.isArray(this.performanceData.system[key])) {
          const originalLength = this.performanceData.system[key].length;
          this.performanceData.system[key] = this.performanceData.system[key].filter(
            d => d.timestamp > performanceCutoffTime
          );
          cleanedCount += originalLength - this.performanceData.system[key].length;
        }
      }

      if (Array.isArray(this.performanceData.requests.responseTime)) {
        const originalLength = this.performanceData.requests.responseTime.length;
        this.performanceData.requests.responseTime = this.performanceData.requests.responseTime.filter(
          d => d.timestamp > performanceCutoffTime
        );
        cleanedCount += originalLength - this.performanceData.requests.responseTime.length;
      }

      console.log(`🧹 Cleaned up ${cleanedCount} old data points`);

    } catch (error) {
      console.warn('Failed to cleanup data:', error.message);
    }
  }

  /**
   * Generate reports
   */
  async generateReports() {
    try {
      const timestamp = Date.now();
      const report = {
        timestamp,
        dashboardId: this.dashboardId,
        summary: this.generateSummary(),
        performance: this.generatePerformanceReport(),
        alerts: this.generateAlertReport(),
        trends: this.generateTrendReport()
      };

      // Save report to Redis
      await this.redis.setex(
        `dashboard:report:${this.dashboardId}:${timestamp}`,
        this.config.retention.reports / 1000,
        JSON.stringify(report)
      );

      // Publish report
      await this.publishDashboardEvent({
        type: 'report_generated',
        report,
        timestamp
      });

      console.log('📋 Performance report generated');

    } catch (error) {
      console.warn('Failed to generate report:', error.message);
    }
  }

  /**
   * Generate summary report
   */
  generateSummary() {
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);

    const dayMetrics = this.historicalData.filter(d => d.timestamp > dayAgo);

    return {
      period: '24h',
      totalAgents: this.dashboardState.totalAgents,
      activeAgents: this.dashboardState.activeAgents,
      systemHealth: this.dashboardState.systemHealth,
      overallPerformance: this.dashboardState.performance.overall,
      dataPoints: dayMetrics.length,
      alertsGenerated: this.alertHistory.filter(a => a.timestamp > dayAgo).length
    };
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport() {
    const cpu = this.performanceData.system.cpu.slice(-1440); // Last 24 hours
    const memory = this.performanceData.system.memory.slice(-1440);
    const responseTime = this.performanceData.requests.responseTime.slice(-1440);

    return {
      cpu: {
        avg: cpu.length > 0 ? cpu.reduce((sum, d) => sum + d.value, 0) / cpu.length : 0,
        max: cpu.length > 0 ? Math.max(...cpu.map(d => d.value)) : 0,
        min: cpu.length > 0 ? Math.min(...cpu.map(d => d.value)) : 0
      },
      memory: {
        avg: memory.length > 0 ? memory.reduce((sum, d) => sum + d.value, 0) / memory.length : 0,
        max: memory.length > 0 ? Math.max(...memory.map(d => d.value)) : 0,
        min: memory.length > 0 ? Math.min(...memory.map(d => d.value)) : 0
      },
      responseTime: {
        avg: responseTime.length > 0 ? responseTime.reduce((sum, d) => sum + d.value, 0) / responseTime.length : 0,
        max: responseTime.length > 0 ? Math.max(...responseTime.map(d => d.value)) : 0,
        min: responseTime.length > 0 ? Math.min(...responseTime.map(d => d.value)) : 0,
        p95: responseTime.length > 0 ? this.percentile(responseTime.map(d => d.value), 0.95) : 0
      }
    };
  }

  /**
   * Generate alert report
   */
  generateAlertReport() {
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);

    const dayAlerts = this.alertHistory.filter(a => a.timestamp > dayAgo);

    return {
      total: dayAlerts.length,
      bySeverity: {
        info: dayAlerts.filter(a => a.severity === ALERT_SEVERITY.INFO).length,
        warning: dayAlerts.filter(a => a.severity === ALERT_SEVERITY.WARNING).length,
        critical: dayAlerts.filter(a => a.severity === ALERT_SEVERITY.CRITICAL).length
      },
      byType: this.groupAlertsByType(dayAlerts),
      topAlerts: dayAlerts.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10)
    };
  }

  /**
   * Group alerts by type
   */
  groupAlertsByType(alerts) {
    const grouped = {};
    for (const alert of alerts) {
      grouped[alert.type] = (grouped[alert.type] || 0) + 1;
    }
    return grouped;
  }

  /**
   * Generate trend report
   */
  generateTrendReport() {
    const trends = {};

    for (const [name, metric] of this.metricDefinitions) {
      if (metric.values.length < 10) continue;

      const recent = metric.values.slice(-10);
      const older = metric.values.slice(-20, -10);

      if (older.length === 0) continue;

      const recentAvg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length;
      const olderAvg = older.reduce((sum, d) => sum + d.value, 0) / older.length;

      const trend = recentAvg > olderAvg ? 'increasing' : recentAvg < olderAvg ? 'decreasing' : 'stable';
      const change = ((recentAvg - olderAvg) / olderAvg) * 100;

      trends[name] = { trend, change, recentAvg, olderAvg };
    }

    return trends;
  }

  /**
   * Publish dashboard event
   */
  async publishDashboardEvent(data) {
    try {
      const eventData = {
        dashboardId: this.dashboardId,
        ...data,
        timestamp: Date.now()
      };

      await this.redis.publish(this.config.channels.metrics, JSON.stringify(eventData));
    } catch (error) {
      console.warn('Failed to publish dashboard event:', error.message);
    }
  }

  /**
   * Get dashboard status and metrics
   */
  async getDashboardStatus() {
    return {
      dashboardId: this.dashboardId,
      isRunning: this.isRunning,
      state: this.dashboardState,
      metrics: {
        realtime: Object.fromEntries(this.realtimeMetrics),
        aggregated: Object.fromEntries(this.aggregatedMetrics),
        definitions: Array.from(this.metricDefinitions.entries()).map(([name, metric]) => ({
          name,
          type: metric.type,
          description: metric.description,
          lastUpdate: metric.lastUpdate,
          valueCount: metric.values.length
        }))
      },
      alerts: {
        active: Array.from(this.alerts.values()).filter(a => !a.resolved),
        total: this.alerts.size,
        recent: this.alertHistory.slice(-20)
      },
      performance: this.performanceData,
      historicalDataPoints: this.historicalData.length,
      timestamp: Date.now()
    };
  }

  /**
   * Get metrics visualization data
   */
  async getVisualizationData(timeRange = '1h') {
    const now = Date.now();
    let startTime;

    switch (timeRange) {
      case '1h':
        startTime = now - (60 * 60 * 1000);
        break;
      case '6h':
        startTime = now - (6 * 60 * 60 * 1000);
        break;
      case '24h':
        startTime = now - (24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = now - (7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = now - (60 * 60 * 1000);
    }

    const data = {
      timeRange,
      startTime,
      endTime: now,
      metrics: {},
      alerts: this.alertHistory.filter(a => a.timestamp >= startTime && a.timestamp <= now)
    };

    // Get metric data for time range
    for (const [name, metric] of this.metricDefinitions) {
      const values = metric.values.filter(v => v.timestamp >= startTime && v.timestamp <= now);
      if (values.length > 0) {
        data.metrics[name] = {
          type: metric.type,
          values,
          aggregated: this.aggregateMetric({
            ...metric,
            values
          }, now)
        };
      }
    }

    return data;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = Date.now();

    await this.publishDashboardEvent({
      type: 'alert_acknowledged',
      alertId,
      timestamp: Date.now()
    });

    this.emit('alert_acknowledged', { alertId, alert });
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    alert.resolved = true;
    alert.resolvedAt = Date.now();

    await this.publishDashboardEvent({
      type: 'alert_resolved',
      alertId,
      timestamp: Date.now()
    });

    this.emit('alert_resolved', { alertId, alert });
  }

  /**
   * Event handlers
   */
  setupEventHandlers() {
    this.on('error', (error) => {
      console.error('❌ PerformanceMonitoringDashboard error:', error);
    });

    this.on('status', (status) => {
      console.log(`📊 PerformanceMonitoringDashboard status: ${status.status} - ${status.message}`);
    });
  }

  /**
   * Shutdown the performance monitoring dashboard
   */
  async shutdown() {
    this.emit('status', { status: 'shutting_down', message: 'Shutting down Performance Monitoring Dashboard' });

    this.isRunning = false;

    // Clear all timers
    if (this.monitoringTimer) clearInterval(this.monitoringTimer);
    if (this.aggregationTimer) clearInterval(this.aggregationTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.reportTimer) clearInterval(this.reportTimer);

    // Save final state
    await this.saveDashboardState();

    // Publish shutdown event
    await this.publishDashboardEvent({
      type: 'dashboard_shutdown',
      dashboardId: this.dashboardId,
      timestamp: Date.now()
    });

    // Close Redis connection
    if (this.redis) await this.redis.quit();

    this.emit('status', { status: 'shutdown', message: 'Performance Monitoring Dashboard shutdown complete' });
    console.log('🛑 Performance Monitoring Dashboard shutdown complete');
  }

  /**
   * Save dashboard state to Redis
   */
  async saveDashboardState() {
    try {
      const state = {
        dashboardId: this.dashboardId,
        dashboardState: this.dashboardState,
        performanceData: this.performanceData,
        historicalData: this.historicalData.slice(-1000), // Keep last 1000 points
        alerts: this.alertHistory.slice(-100), // Keep last 100 alerts
        timestamp: Date.now()
      };

      await this.redis.setex(
        `dashboard:state:${this.dashboardId}`,
        3600, // 1 hour TTL
        JSON.stringify(state)
      );
    } catch (error) {
      console.warn('Failed to save dashboard state:', error.message);
    }
  }
}

export default PerformanceMonitoringDashboard;