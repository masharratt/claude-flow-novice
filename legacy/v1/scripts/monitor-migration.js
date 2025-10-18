#!/usr/bin/env node

/**
 * SDK Migration Monitoring Script
 * Provides real-time monitoring and alerting during migration
 */

const { MetricsCollector, SDKDashboard } = require('../src/sdk/dashboard');
const { defaultConfig } = require('../src/sdk/performance-config');
const fs = require('fs').promises;
const path = require('path');

class MigrationMonitor {
  constructor(config = {}) {
    this.config = {
      checkInterval: config.checkInterval || 60000, // 1 minute
      alertThresholds: {
        errorRate: 0.05,
        validationFailureRate: 0.2,
        responseTimeP95: 10000,
        cacheHitRate: 0.3
      },
      ...config
    };

    this.collector = new MetricsCollector();
    this.dashboard = new SDKDashboard(this.collector, {
      port: config.dashboardPort || 3000,
      updateInterval: 5000,
      authentication: false
    });

    this.alerts = [];
    this.metricsHistory = [];
    this.isMonitoring = false;
  }

  async start() {
    console.log('🚀 Starting SDK Migration Monitor...\n');

    // Start dashboard
    this.dashboard.start(() => {
      console.log('✅ Dashboard started successfully\n');
    });

    // Start metrics collection
    this.isMonitoring = true;
    this.startMetricsCollection();

    // Set up graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  async stop() {
    console.log('\n🛑 Stopping migration monitor...');
    this.isMonitoring = false;

    // Save final metrics
    await this.saveMetricsSnapshot();

    // Stop dashboard
    this.dashboard.stop();

    console.log('✅ Monitor stopped');
    process.exit(0);
  }

  startMetricsCollection() {
    // Simulate metrics collection (replace with actual implementation)
    const collectMetrics = async () => {
      if (!this.isMonitoring) return;

      try {
        // Collect system metrics
        const systemMetrics = await this.collectSystemMetrics();
        this.recordSystemMetrics(systemMetrics);

        // Collect application metrics
        const appMetrics = await this.collectApplicationMetrics();
        this.recordApplicationMetrics(appMetrics);

        // Check thresholds and trigger alerts
        await this.checkThresholds();

        // Store metrics history
        this.metricsHistory.push({
          timestamp: Date.now(),
          system: systemMetrics,
          application: appMetrics
        });

        // Keep only last 1000 entries
        if (this.metricsHistory.length > 1000) {
          this.metricsHistory = this.metricsHistory.slice(-1000);
        }

        // Save snapshot periodically
        if (this.metricsHistory.length % 10 === 0) {
          await this.saveMetricsSnapshot();
        }
      } catch (error) {
        console.error('Error collecting metrics:', error);
      }

      // Schedule next collection
      setTimeout(collectMetrics, this.config.checkInterval);
    };

    collectMetrics();
  }

  async collectSystemMetrics() {
    const os = require('os');

    return {
      cpu: this.getCPUUsage(),
      memory: (1 - os.freemem() / os.totalmem()) * 100,
      loadAverage: os.loadavg()[0],
      uptime: os.uptime()
    };
  }

  getCPUUsage() {
    const cpus = require('os').cpus();
    const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTick = cpus.reduce(
      (acc, cpu) => acc + Object.values(cpu.times).reduce((a, b) => a + b, 0),
      0
    );
    return ((1 - totalIdle / totalTick) * 100);
  }

  async collectApplicationMetrics() {
    // In real implementation, collect from actual application
    // For now, generate simulated metrics
    return {
      responseTime: Math.random() * 1000 + 200,
      throughput: Math.floor(Math.random() * 100) + 50,
      errorRate: Math.random() * 0.02,
      cacheHitRate: 0.6 + Math.random() * 0.3,
      validationSuccess: 0.9 + Math.random() * 0.09,
      testPassRate: 0.95 + Math.random() * 0.04,
      coverage: 80 + Math.random() * 15,
      activeAgents: Math.floor(Math.random() * 5) + 2,
      queuedTasks: Math.floor(Math.random() * 10)
    };
  }

  recordSystemMetrics(metrics) {
    this.collector.recordMetric('system', 'cpuUsage', metrics.cpu);
    this.collector.recordMetric('system', 'memoryUsage', metrics.memory);
    this.collector.recordMetric('system', 'activeAgents', metrics.activeAgents || 0);
    this.collector.recordMetric('system', 'queuedTasks', metrics.queuedTasks || 0);
  }

  recordApplicationMetrics(metrics) {
    this.collector.recordMetric('performance', 'responseTime', metrics.responseTime);
    this.collector.recordMetric('performance', 'throughput', metrics.throughput);
    this.collector.recordMetric('performance', 'errorRate', metrics.errorRate);
    this.collector.recordMetric('performance', 'cacheHitRate', metrics.cacheHitRate);

    this.collector.recordMetric('quality', 'validationSuccess', metrics.validationSuccess);
    this.collector.recordMetric('quality', 'testPassRate', metrics.testPassRate);
    this.collector.recordMetric('quality', 'coverageMetrics', metrics.coverage);

    // Estimate token usage and cost
    const estimatedTokens = metrics.throughput * 1000; // ~1k tokens per request
    this.collector.recordMetric('cost', 'tokenUsage', estimatedTokens);
    this.collector.metrics.cost.estimatedCost += estimatedTokens * 0.000003; // $3 per 1M tokens
  }

  async checkThresholds() {
    const summary = this.collector.getSummary();

    // Check error rate
    if (summary.performance.errorRate > this.config.alertThresholds.errorRate) {
      this.triggerAlert({
        id: `error-rate-${Date.now()}`,
        name: 'high-error-rate',
        severity: 'critical',
        message: `Error rate ${(summary.performance.errorRate * 100).toFixed(2)}% exceeds threshold ${(this.config.alertThresholds.errorRate * 100).toFixed(2)}%`,
        metric: 'errorRate',
        currentValue: summary.performance.errorRate,
        threshold: this.config.alertThresholds.errorRate,
        recommendation: 'Consider rolling back migration'
      });
    }

    // Check validation failure rate
    const validationFailureRate = 1 - summary.quality.validationSuccessRate;
    if (validationFailureRate > this.config.alertThresholds.validationFailureRate) {
      this.triggerAlert({
        id: `validation-failure-${Date.now()}`,
        name: 'validation-failure-spike',
        severity: 'high',
        message: `Validation failure rate ${(validationFailureRate * 100).toFixed(2)}% exceeds threshold`,
        metric: 'validationFailureRate',
        currentValue: validationFailureRate,
        threshold: this.config.alertThresholds.validationFailureRate,
        recommendation: 'Review validation configuration'
      });
    }

    // Check response time
    if (summary.performance.responseTime.p95 > this.config.alertThresholds.responseTimeP95) {
      this.triggerAlert({
        id: `slow-response-${Date.now()}`,
        name: 'slow-response-time',
        severity: 'warning',
        message: `P95 response time ${summary.performance.responseTime.p95.toFixed(0)}ms exceeds threshold`,
        metric: 'responseTimeP95',
        currentValue: summary.performance.responseTime.p95,
        threshold: this.config.alertThresholds.responseTimeP95,
        recommendation: 'Check for performance bottlenecks'
      });
    }

    // Check cache hit rate
    if (summary.performance.cacheHitRate < this.config.alertThresholds.cacheHitRate) {
      this.triggerAlert({
        id: `low-cache-${Date.now()}`,
        name: 'low-cache-hit-rate',
        severity: 'warning',
        message: `Cache hit rate ${(summary.performance.cacheHitRate * 100).toFixed(1)}% below threshold`,
        metric: 'cacheHitRate',
        currentValue: summary.performance.cacheHitRate,
        threshold: this.config.alertThresholds.cacheHitRate,
        recommendation: 'Review cache configuration'
      });
    }
  }

  triggerAlert(alert) {
    // Deduplicate alerts (don't trigger same alert multiple times)
    const existingAlert = this.alerts.find(
      a => a.name === alert.name && !a.resolved && Date.now() - a.timestamp < 300000
    );

    if (existingAlert) return;

    // Add to collector
    this.collector.addAlert(alert);
    this.alerts.push(alert);

    // Print to console
    const icon = alert.severity === 'critical' ? '🚨' : alert.severity === 'high' ? '⚠️' : '⚡';
    console.log(`\n${icon} ALERT: ${alert.name}`);
    console.log(`   ${alert.message}`);
    console.log(`   Recommendation: ${alert.recommendation}\n`);

    // Write to file
    this.saveAlert(alert);
  }

  async saveAlert(alert) {
    const alertsFile = path.join(__dirname, '../logs/alerts.json');

    try {
      let alerts = [];
      try {
        const content = await fs.readFile(alertsFile, 'utf8');
        alerts = JSON.parse(content);
      } catch (err) {
        // File doesn't exist yet
      }

      alerts.push(alert);

      await fs.writeFile(alertsFile, JSON.stringify(alerts, null, 2));
    } catch (error) {
      console.error('Error saving alert:', error);
    }
  }

  async saveMetricsSnapshot() {
    const summary = this.collector.getSummary();
    const snapshotFile = path.join(__dirname, '../.metrics-snapshot');

    try {
      await fs.writeFile(snapshotFile, JSON.stringify(summary, null, 2));
    } catch (error) {
      console.error('Error saving metrics snapshot:', error);
    }
  }

  generateReport() {
    const summary = this.collector.getSummary();

    console.log('\n' + '='.repeat(80));
    console.log('SDK MIGRATION MONITORING REPORT');
    console.log('='.repeat(80));

    console.log('\n📊 Performance Metrics:');
    console.log(`   Response Time (Avg): ${summary.performance.responseTime.avg.toFixed(0)}ms`);
    console.log(`   Response Time (P95): ${summary.performance.responseTime.p95.toFixed(0)}ms`);
    console.log(`   Error Rate: ${(summary.performance.errorRate * 100).toFixed(2)}%`);
    console.log(`   Cache Hit Rate: ${(summary.performance.cacheHitRate * 100).toFixed(1)}%`);

    console.log('\n💰 Cost Metrics:');
    console.log(`   Total Tokens: ${summary.cost.totalTokens.toLocaleString()}`);
    console.log(`   Estimated Cost: $${summary.cost.estimatedCost.toFixed(2)}`);
    console.log(`   Cache Savings: $${summary.cost.savingsFromCache.toFixed(2)}`);

    console.log('\n✅ Quality Metrics:');
    console.log(`   Validation Success: ${(summary.quality.validationSuccessRate * 100).toFixed(1)}%`);
    console.log(`   Test Pass Rate: ${summary.quality.averageTestPassRate.toFixed(1)}%`);
    console.log(`   Coverage: ${summary.quality.averageCoverage.toFixed(1)}%`);

    console.log('\n🔔 Alerts:');
    console.log(`   Active: ${summary.alerts.active}`);
    console.log(`   Total: ${summary.alerts.total}`);

    console.log('\n' + '='.repeat(80));
    console.log(`Uptime: ${summary.uptime.formatted}`);
    console.log(`Dashboard: http://localhost:${this.dashboard.config.port}`);
    console.log('='.repeat(80) + '\n');
  }
}

// CLI
if (require.main === module) {
  const monitor = new MigrationMonitor({
    checkInterval: process.env.CHECK_INTERVAL || 60000,
    dashboardPort: process.env.DASHBOARD_PORT || 3000
  });

  monitor.start().catch(err => {
    console.error('Failed to start monitor:', err);
    process.exit(1);
  });

  // Generate report every 5 minutes
  setInterval(() => {
    monitor.generateReport();
  }, 300000);
}

module.exports = MigrationMonitor;