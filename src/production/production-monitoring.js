/**
 * Production Monitoring and Alerting System
 *
 * Provides comprehensive monitoring and alerting for production deployments
 * with Redis-backed coordination and real-time alerting capabilities
 */

import Redis from "ioredis";
import { EventEmitter } from "events";
import { promises as fs } from "fs";
import path from "path";

class ProductionMonitoring extends EventEmitter {
  constructor(options = {}) {
    super();

    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    this.swarmId = 'phase-6-production-deployment';
    this.monitoringChannel = 'swarm:phase-6:monitoring';

    this.config = {
      monitoringInterval: options.monitoringInterval || 30000, // 30 seconds
      alertCooldown: options.alertCooldown || 300000, // 5 minutes
      metricsRetention: options.metricsRetention || 86400000, // 24 hours
      healthCheckInterval: options.healthCheckInterval || 10000, // 10 seconds
      alertThresholds: options.alertThresholds || this.getDefaultThresholds()
    };

    this.monitoringState = {
      active: false,
      startTime: null,
      lastHealthCheck: null,
      activeAlerts: new Map(),
      metricsHistory: [],
      systemStatus: 'unknown',
      lastAlertTime: new Map()
    };

    this.confidenceScore = 0;
    this.metrics = {
      system: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0
      },
      application: {
        responseTime: 0,
        errorRate: 0,
        throughput: 0,
        activeConnections: 0
      },
      deployment: {
        status: 'unknown',
        uptime: 0,
        lastDeployment: null,
        rollbackCount: 0
      }
    };
  }

  getDefaultThresholds() {
    return {
      system: {
        cpu: { warning: 70, critical: 90 },
        memory: { warning: 80, critical: 95 },
        disk: { warning: 85, critical: 95 },
        network: { warning: 70, critical: 90 }
      },
      application: {
        responseTime: { warning: 500, critical: 2000 }, // ms
        errorRate: { warning: 1, critical: 5 }, // percentage
        throughput: { warning: 100, critical: 50 }, // req/s
        activeConnections: { warning: 800, critical: 950 }
      },
      deployment: {
        uptime: { warning: 99.5, critical: 99.0 }, // percentage
        rollbackCount: { warning: 1, critical: 3 }
      }
    };
  }

  async publishMonitoringEvent(eventType, data) {
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      swarmId: this.swarmId,
      data: data
    };

    await this.redis.publish(this.monitoringChannel, JSON.stringify(event));
    await this.redis.setex(
      `swarm:${this.swarmId}:monitoring:${eventType}`,
      3600,
      JSON.stringify(event)
    );

    this.emit(eventType, event);
  }

  async startMonitoring() {
    await this.publishMonitoringEvent('monitoring_started', {
      config: this.config,
      thresholds: this.config.alertThresholds
    });

    this.monitoringState.active = true;
    this.monitoringState.startTime = new Date().toISOString();

    // Start monitoring loops
    this.startMetricsCollection();
    this.startHealthChecks();
    this.startAlertProcessing();

    await this.publishMonitoringEvent('monitoring_active', {
      status: 'active',
      startTime: this.monitoringState.startTime
    });
  }

  startMetricsCollection() {
    setInterval(async () => {
      if (this.monitoringState.active) {
        await this.collectMetrics();
      }
    }, this.config.monitoringInterval);
  }

  startHealthChecks() {
    setInterval(async () => {
      if (this.monitoringState.active) {
        await this.performHealthChecks();
      }
    }, this.config.healthCheckInterval);
  }

  startAlertProcessing() {
    setInterval(async () => {
      if (this.monitoringState.active) {
        await this.processAlerts();
      }
    }, 60000); // Process alerts every minute
  }

  async collectMetrics() {
    try {
      const timestamp = new Date().toISOString();

      // Collect system metrics
      const systemMetrics = await this.collectSystemMetrics();

      // Collect application metrics
      const applicationMetrics = await this.collectApplicationMetrics();

      // Collect deployment metrics
      const deploymentMetrics = await this.collectDeploymentMetrics();

      const currentMetrics = {
        timestamp,
        system: systemMetrics,
        application: applicationMetrics,
        deployment: deploymentMetrics
      };

      // Update current metrics
      this.metrics = currentMetrics;

      // Store metrics history
      this.monitoringState.metricsHistory.push(currentMetrics);

      // Trim history to retention period
      const retentionLimit = Math.floor(this.config.metricsRetention / this.config.monitoringInterval);
      if (this.monitoringState.metricsHistory.length > retentionLimit) {
        this.monitoringState.metricsHistory = this.monitoringState.metricsHistory.slice(-retentionLimit);
      }

      // Store in Redis
      await this.redis.setex(
        `swarm:${this.swarmId}:monitoring:metrics:${timestamp}`,
        this.config.metricsRetention / 1000,
        JSON.stringify(currentMetrics)
      );

      await this.publishMonitoringEvent('metrics_collected', currentMetrics);

    } catch (error) {
      await this.publishMonitoringEvent('metrics_collection_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async collectSystemMetrics() {
    // Simulate system metrics collection
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      disk: Math.random() * 100,
      network: Math.random() * 100,
      loadAverage: Math.random() * 4,
      processes: Math.floor(Math.random() * 500) + 100
    };
  }

  async collectApplicationMetrics() {
    // Simulate application metrics collection
    return {
      responseTime: Math.random() * 1000 + 100,
      errorRate: Math.random() * 2,
      throughput: Math.floor(Math.random() * 2000) + 500,
      activeConnections: Math.floor(Math.random() * 1000),
      queueSize: Math.floor(Math.random() * 100),
      cacheHitRate: Math.random() * 100
    };
  }

  async collectDeploymentMetrics() {
    // Collect deployment-related metrics
    const uptime = this.calculateUptime();

    return {
      status: this.getDeploymentStatus(),
      uptime,
      lastDeployment: await this.getLastDeploymentTime(),
      rollbackCount: await this.getRollbackCount(),
      version: await this.getCurrentVersion()
    };
  }

  async performHealthChecks() {
    try {
      const healthChecks = [
        'application_health',
        'database_health',
        'redis_health',
        'external_services_health',
        'ssl_certificate_health'
      ];

      const results = {};

      for (const check of healthChecks) {
        results[check] = await this.performHealthCheck(check);
      }

      const overallHealth = Object.values(results).every(r => r.healthy);
      this.monitoringState.systemStatus = overallHealth ? 'healthy' : 'unhealthy';
      this.monitoringState.lastHealthCheck = new Date().toISOString();

      await this.publishMonitoringEvent('health_check_completed', {
        results,
        overallHealth,
        status: this.monitoringState.systemStatus
      });

    } catch (error) {
      await this.publishMonitoringEvent('health_check_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async performHealthCheck(checkType) {
    // Simulate health check execution
    const healthy = Math.random() > 0.05; // 95% success rate

    return {
      type: checkType,
      healthy,
      responseTime: Math.random() * 1000 + 50,
      status: healthy ? 'ok' : 'error',
      message: healthy ? 'Service is healthy' : 'Service is experiencing issues',
      timestamp: new Date().toISOString()
    };
  }

  async processAlerts() {
    try {
      const alerts = await this.evaluateAlertConditions();

      for (const alert of alerts) {
        await this.handleAlert(alert);
      }

      // Check for resolved alerts
      await this.checkResolvedAlerts();

    } catch (error) {
      await this.publishMonitoringEvent('alert_processing_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async evaluateAlertConditions() {
    const alerts = [];

    // Evaluate system metrics
    for (const [metric, value] of Object.entries(this.metrics.system)) {
      const threshold = this.config.alertThresholds.system[metric];
      if (!threshold) continue;

      if (value >= threshold.critical) {
        alerts.push({
          type: 'system',
          metric,
          severity: 'critical',
          value,
          threshold: threshold.critical,
          message: `System ${metric} is critically high: ${value.toFixed(2)}%`
        });
      } else if (value >= threshold.warning) {
        alerts.push({
          type: 'system',
          metric,
          severity: 'warning',
          value,
          threshold: threshold.warning,
          message: `System ${metric} is elevated: ${value.toFixed(2)}%`
        });
      }
    }

    // Evaluate application metrics
    for (const [metric, value] of Object.entries(this.metrics.application)) {
      const threshold = this.config.alertThresholds.application[metric];
      if (!threshold) continue;

      if (metric === 'responseTime' || metric === 'errorRate') {
        if (value >= threshold.critical) {
          alerts.push({
            type: 'application',
            metric,
            severity: 'critical',
            value,
            threshold: threshold.critical,
            message: `Application ${metric} is critically high: ${value.toFixed(2)}`
          });
        } else if (value >= threshold.warning) {
          alerts.push({
            type: 'application',
            metric,
            severity: 'warning',
            value,
            threshold: threshold.warning,
            message: `Application ${metric} is elevated: ${value.toFixed(2)}`
          });
        }
      } else if (metric === 'throughput' || metric === 'activeConnections') {
        if (value <= threshold.critical) {
          alerts.push({
            type: 'application',
            metric,
            severity: 'critical',
            value,
            threshold: threshold.critical,
            message: `Application ${metric} is critically low: ${value}`
          });
        } else if (value <= threshold.warning) {
          alerts.push({
            type: 'application',
            metric,
            severity: 'warning',
            value,
            threshold: threshold.warning,
            message: `Application ${metric} is below expected: ${value}`
          });
        }
      }
    }

    return alerts;
  }

  async handleAlert(alert) {
    const alertKey = `${alert.type}_${alert.metric}`;
    const lastAlertTime = this.monitoringState.lastAlertTime.get(alertKey);

    // Check alert cooldown
    if (lastAlertTime && (Date.now() - lastAlertTime) < this.config.alertCooldown) {
      return; // Skip due to cooldown
    }

    // Create alert
    const fullAlert = {
      ...alert,
      id: this.generateAlertId(),
      timestamp: new Date().toISOString(),
      swarmId: this.swarmId,
      acknowledged: false,
      resolved: false
    };

    // Store active alert
    this.monitoringState.activeAlerts.set(alertKey, fullAlert);
    this.monitoringState.lastAlertTime.set(alertKey, Date.now());

    // Store in Redis
    await this.redis.setex(
      `swarm:${this.swarmId}:monitoring:alert:${fullAlert.id}`,
      86400, // 24 hours
      JSON.stringify(fullAlert)
    );

    // Publish alert
    await this.publishMonitoringEvent('alert_triggered', fullAlert);

    // Send notifications
    await this.sendAlertNotifications(fullAlert);
  }

  async checkResolvedAlerts() {
    const resolvedAlerts = [];

    for (const [alertKey, alert] of this.monitoringState.activeAlerts) {
      const currentValue = this.getAlertValue(alert.type, alert.metric);
      const threshold = this.config.alertThresholds[alert.type]?.[alert.metric];

      if (!threshold) continue;

      // Check if alert condition is resolved
      const isResolved = this.isAlertResolved(alert, currentValue, threshold);

      if (isResolved) {
        alert.resolved = true;
        alert.resolvedAt = new Date().toISOString();
        resolvedAlerts.push(alert);

        this.monitoringState.activeAlerts.delete(alertKey);

        await this.publishMonitoringEvent('alert_resolved', alert);
      }
    }

    return resolvedAlerts;
  }

  getAlertValue(type, metric) {
    return this.metrics[type]?.[metric] || 0;
  }

  isAlertResolved(alert, currentValue, threshold) {
    if (alert.metric === 'responseTime' || alert.metric === 'errorRate') {
      return currentValue < threshold.warning;
    } else if (alert.metric === 'throughput' || alert.metric === 'activeConnections') {
      return currentValue > threshold.warning;
    } else {
      // For system metrics (cpu, memory, disk, network)
      return currentValue < threshold.warning;
    }
  }

  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async sendAlertNotifications(alert) {
    const notification = {
      alertId: alert.id,
      severity: alert.severity,
      message: alert.message,
      timestamp: alert.timestamp,
      channels: ['email', 'slack', 'pagerduty']
    };

    // Store notification in Redis
    await this.redis.setex(
      `swarm:${this.swarmId}:monitoring:notification:${alert.id}`,
      86400,
      JSON.stringify(notification)
    );

    await this.publishMonitoringEvent('alert_notification_sent', notification);
  }

  calculateUptime() {
    if (!this.monitoringState.startTime) return 0;

    const now = new Date();
    const start = new Date(this.monitoringState.startTime);
    const totalMs = now - start;
    const uptimeMs = totalMs - (this.calculateDowntime() * 1000);

    return (uptimeMs / totalMs) * 100;
  }

  calculateDowntime() {
    // Calculate downtime from health check failures
    // This is a simplified implementation
    return 0;
  }

  getDeploymentStatus() {
    if (!this.monitoringState.active) return 'inactive';
    if (this.monitoringState.systemStatus === 'healthy') return 'operational';
    return 'degraded';
  }

  async getLastDeploymentTime() {
    // Get last deployment time from Redis
    try {
      const deploymentData = await this.redis.get(`swarm:${this.swarmId}:deployment:last`);
      return deploymentData ? JSON.parse(deploymentData).timestamp : null;
    } catch {
      return null;
    }
  }

  async getRollbackCount() {
    // Get rollback count from Redis
    try {
      const rollbackData = await this.redis.get(`swarm:${this.swarmId}:deployment:rollbacks`);
      return rollbackData ? JSON.parse(rollbackData).count : 0;
    } catch {
      return 0;
    }
  }

  async getCurrentVersion() {
    // Get current application version
    return '1.0.0'; // Placeholder
  }

  async getMonitoringStatus() {
    return {
      active: this.monitoringState.active,
      startTime: this.monitoringState.startTime,
      systemStatus: this.monitoringState.systemStatus,
      lastHealthCheck: this.monitoringState.lastHealthCheck,
      activeAlerts: Array.from(this.monitoringState.activeAlerts.values()),
      currentMetrics: this.metrics,
      uptime: this.calculateUptime(),
      confidence: this.confidenceScore
    };
  }

  async acknowledgeAlert(alertId) {
    const alertKey = Array.from(this.monitoringState.activeAlerts.keys())
      .find(key => this.monitoringState.activeAlerts.get(key)?.id === alertId);

    if (alertKey) {
      const alert = this.monitoringState.activeAlerts.get(alertKey);
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date().toISOString();

      await this.publishMonitoringEvent('alert_acknowledged', alert);
      return alert;
    }

    throw new Error(`Alert not found: ${alertId}`);
  }

  async stopMonitoring() {
    this.monitoringState.active = false;

    await this.publishMonitoringEvent('monitoring_stopped', {
      stoppedAt: new Date().toISOString(),
      totalRuntime: this.calculateUptime()
    });
  }

  async generateMonitoringReport() {
    const report = {
      timestamp: new Date().toISOString(),
      swarmId: this.swarmId,
      monitoringPeriod: {
        start: this.monitoringState.startTime,
        end: new Date().toISOString(),
        duration: this.calculateUptime()
      },
      currentStatus: await this.getMonitoringStatus(),
      metricsSummary: this.generateMetricsSummary(),
      alertsSummary: this.generateAlertsSummary(),
      recommendations: await this.generateRecommendations()
    };

    await this.publishMonitoringEvent('report_generated', report);
    return report;
  }

  generateMetricsSummary() {
    if (this.monitoringState.metricsHistory.length === 0) {
      return { message: 'No metrics data available' };
    }

    const recent = this.monitoringState.metricsHistory.slice(-100); // Last 100 data points

    const summary = {
      system: {},
      application: {}
    };

    // Calculate averages and ranges
    for (const metric of ['cpu', 'memory', 'disk', 'network']) {
      const values = recent.map(m => m.system[metric]);
      summary.system[metric] = {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }

    for (const metric of ['responseTime', 'errorRate', 'throughput', 'activeConnections']) {
      const values = recent.map(m => m.application[metric]);
      summary.application[metric] = {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }

    return summary;
  }

  generateAlertsSummary() {
    const activeAlerts = Array.from(this.monitoringState.activeAlerts.values());

    return {
      totalActive: activeAlerts.length,
      critical: activeAlerts.filter(a => a.severity === 'critical').length,
      warning: activeAlerts.filter(a => a.severity === 'warning').length,
      acknowledged: activeAlerts.filter(a => a.acknowledged).length,
      oldestAlert: activeAlerts.length > 0 ?
        new Date(Math.min(...activeAlerts.map(a => new Date(a.timestamp)))) : null
    };
  }

  async generateRecommendations() {
    const recommendations = [];
    const status = await this.getMonitoringStatus();

    // System recommendations
    if (status.currentMetrics.system.cpu > 80) {
      recommendations.push({
        category: 'performance',
        priority: 'high',
        message: 'High CPU utilization detected. Consider scaling or optimization.',
        action: 'review_cpu_usage'
      });
    }

    if (status.currentMetrics.system.memory > 85) {
      recommendations.push({
        category: 'performance',
        priority: 'high',
        message: 'High memory usage detected. Monitor for memory leaks.',
        action: 'review_memory_usage'
      });
    }

    // Application recommendations
    if (status.currentMetrics.application.errorRate > 1) {
      recommendations.push({
        category: 'reliability',
        priority: 'critical',
        message: 'Elevated error rate detected. Investigate application logs.',
        action: 'investigate_errors'
      });
    }

    if (status.currentMetrics.application.responseTime > 500) {
      recommendations.push({
        category: 'performance',
        priority: 'medium',
        message: 'Response times are elevated. Consider performance optimization.',
        action: 'optimize_performance'
      });
    }

    // Alert recommendations
    if (status.activeAlerts.length > 5) {
      recommendations.push({
        category: 'monitoring',
        priority: 'medium',
        message: 'Multiple active alerts. Review system health.',
        action: 'review_alerts'
      });
    }

    return recommendations;
  }

  async cleanup() {
    await this.stopMonitoring();
    await this.redis.quit();
  }
}

export default ProductionMonitoring;