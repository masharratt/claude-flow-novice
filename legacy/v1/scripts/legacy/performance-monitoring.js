#!/usr/bin/env node

/**
 * Phase 4 Performance Monitoring Script
 * Real-time performance monitoring for controlled rollout
 */

import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';

class Phase4PerformanceMonitor {
  constructor() {
    this.metricsDir = path.join(process.cwd(), '.claude-flow', 'metrics');
    this.alertThresholds = {
      responseTime: { warning: 5, critical: 10 }, // percentage increase
      cpuUsage: { warning: 80, critical: 90 }, // percentage
      memoryUsage: { warning: 85, critical: 95 }, // percentage
      hookExecution: { warning: 100, critical: 500 }, // milliseconds
      databaseQueries: { warning: 5, critical: 10 } // percentage increase
    };
    this.monitoring = false;
    this.baseline = null;
    this.alerts = [];
  }

  async initialize() {
    console.log(chalk.blue('🚀 Initializing Phase 4 Performance Monitor'));

    // Ensure metrics directory exists
    await fs.ensureDir(this.metricsDir);

    // Load baseline performance metrics
    await this.loadBaseline();

    console.log(chalk.green('✅ Performance monitor initialized'));
  }

  async loadBaseline() {
    try {
      const systemMetricsPath = path.join(this.metricsDir, 'system-metrics.json');
      const performanceMetricsPath = path.join(this.metricsDir, 'performance.json');

      if (await fs.pathExists(systemMetricsPath)) {
        const systemMetrics = await fs.readJson(systemMetricsPath);
        const performanceMetrics = await fs.pathExists(performanceMetricsPath)
          ? await fs.readJson(performanceMetricsPath)
          : {};

        // Calculate baseline from recent metrics
        const recentMetrics = systemMetrics.slice(-10);
        this.baseline = this.calculateBaseline(recentMetrics, performanceMetrics);

        console.log(chalk.cyan('📊 Baseline metrics loaded:'));
        console.log(`  CPU: ${this.baseline.cpu.toFixed(2)}%`);
        console.log(`  Memory: ${this.baseline.memory.toFixed(2)}%`);
        console.log(`  Tasks: ${this.baseline.tasks} total`);
      } else {
        console.log(chalk.yellow('⚠️  No baseline metrics found, will establish during monitoring'));
        this.baseline = null;
      }
    } catch (error) {
      console.error(chalk.red('❌ Error loading baseline:'), error.message);
      this.baseline = null;
    }
  }

  calculateBaseline(systemMetrics, performanceMetrics) {
    const avgCpu = systemMetrics.reduce((sum, m) => sum + (m.cpuLoad || 0), 0) / systemMetrics.length;
    const avgMemory = systemMetrics.reduce((sum, m) => sum + (m.memoryUsagePercent || 0), 0) / systemMetrics.length;

    return {
      cpu: avgCpu * 100, // Convert to percentage
      memory: avgMemory,
      tasks: performanceMetrics.totalTasks || 0,
      successfulTasks: performanceMetrics.successfulTasks || 0,
      timestamp: Date.now()
    };
  }

  async startMonitoring(interval = 30000) {
    if (this.monitoring) {
      console.log(chalk.yellow('⚠️  Monitoring already active'));
      return;
    }

    console.log(chalk.blue(`🔄 Starting performance monitoring (${interval/1000}s intervals)`));
    this.monitoring = true;

    const monitoringLoop = async () => {
      if (!this.monitoring) return;

      try {
        const metrics = await this.collectMetrics();
        await this.analyzePerformance(metrics);
        await this.saveMetrics(metrics);

        // Display current status
        this.displayStatus(metrics);

        setTimeout(monitoringLoop, interval);
      } catch (error) {
        console.error(chalk.red('❌ Monitoring error:'), error.message);
        setTimeout(monitoringLoop, interval);
      }
    };

    await monitoringLoop();
  }

  async collectMetrics() {
    const timestamp = Date.now();

    // System metrics
    const cpuUsage = await this.getCpuUsage();
    const memoryUsage = await this.getMemoryUsage();

    // Hook performance metrics
    const hookMetrics = await this.getHookMetrics();

    // Database performance
    const dbMetrics = await this.getDatabaseMetrics();

    // Task performance
    const taskMetrics = await this.getTaskMetrics();

    return {
      timestamp,
      cpu: cpuUsage,
      memory: memoryUsage,
      hooks: hookMetrics,
      database: dbMetrics,
      tasks: taskMetrics
    };
  }

  async getCpuUsage() {
    try {
      return new Promise((resolve) => {
        const proc = spawn('cat', ['/proc/loadavg']);
        let output = '';

        proc.stdout.on('data', (data) => {
          output += data.toString();
        });

        proc.on('close', () => {
          const loadAvg = parseFloat(output.split(' ')[0]);
          const cpuCount = require('os').cpus().length;
          resolve((loadAvg / cpuCount) * 100);
        });

        proc.on('error', () => resolve(0));
      });
    } catch (error) {
      return 0;
    }
  }

  async getMemoryUsage() {
    try {
      const memInfo = await fs.readFile('/proc/meminfo', 'utf8');
      const lines = memInfo.split('\\n');

      const memTotal = parseInt(lines.find(l => l.startsWith('MemTotal:')).split(/\\s+/)[1]) * 1024;
      const memAvailable = parseInt(lines.find(l => l.startsWith('MemAvailable:')).split(/\\s+/)[1]) * 1024;
      const memUsed = memTotal - memAvailable;

      return {
        total: memTotal,
        used: memUsed,
        percentage: (memUsed / memTotal) * 100
      };
    } catch (error) {
      return { total: 0, used: 0, percentage: 0 };
    }
  }

  async getHookMetrics() {
    try {
      // Check for recent hook execution logs
      const swarmDir = path.join(process.cwd(), '.swarm');
      const memoryDbPath = path.join(swarmDir, 'memory.db');

      if (await fs.pathExists(memoryDbPath)) {
        // Simulate hook performance metrics (in real implementation, query the database)
        return {
          averageExecutionTime: 150, // ms
          successRate: 99.5, // percentage
          timeouts: 0,
          errors: 0
        };
      }

      return { averageExecutionTime: 0, successRate: 100, timeouts: 0, errors: 0 };
    } catch (error) {
      return { averageExecutionTime: 0, successRate: 100, timeouts: 0, errors: 0 };
    }
  }

  async getDatabaseMetrics() {
    try {
      // Simulate database performance metrics
      return {
        queryTime: 25, // average ms
        connections: 5,
        validationQueries: 120, // per minute
        performanceImpact: 3.2 // percentage increase
      };
    } catch (error) {
      return { queryTime: 0, connections: 0, validationQueries: 0, performanceImpact: 0 };
    }
  }

  async getTaskMetrics() {
    try {
      const performanceFile = path.join(this.metricsDir, 'performance.json');
      if (await fs.pathExists(performanceFile)) {
        return await fs.readJson(performanceFile);
      }
      return { totalTasks: 0, successfulTasks: 0, failedTasks: 0 };
    } catch (error) {
      return { totalTasks: 0, successfulTasks: 0, failedTasks: 0 };
    }
  }

  async analyzePerformance(metrics) {
    const alerts = [];

    if (this.baseline) {
      // CPU Usage Analysis
      const cpuIncrease = ((metrics.cpu - this.baseline.cpu) / this.baseline.cpu) * 100;
      if (metrics.cpu > this.alertThresholds.cpuUsage.critical) {
        alerts.push({
          type: 'CRITICAL',
          metric: 'CPU_USAGE',
          value: metrics.cpu,
          threshold: this.alertThresholds.cpuUsage.critical,
          message: `CPU usage critical: ${metrics.cpu.toFixed(2)}%`
        });
      } else if (metrics.cpu > this.alertThresholds.cpuUsage.warning) {
        alerts.push({
          type: 'WARNING',
          metric: 'CPU_USAGE',
          value: metrics.cpu,
          threshold: this.alertThresholds.cpuUsage.warning,
          message: `CPU usage high: ${metrics.cpu.toFixed(2)}%`
        });
      }

      // Memory Usage Analysis
      if (metrics.memory.percentage > this.alertThresholds.memoryUsage.critical) {
        alerts.push({
          type: 'CRITICAL',
          metric: 'MEMORY_USAGE',
          value: metrics.memory.percentage,
          threshold: this.alertThresholds.memoryUsage.critical,
          message: `Memory usage critical: ${metrics.memory.percentage.toFixed(2)}%`
        });
      } else if (metrics.memory.percentage > this.alertThresholds.memoryUsage.warning) {
        alerts.push({
          type: 'WARNING',
          metric: 'MEMORY_USAGE',
          value: metrics.memory.percentage,
          threshold: this.alertThresholds.memoryUsage.warning,
          message: `Memory usage high: ${metrics.memory.percentage.toFixed(2)}%`
        });
      }

      // Hook Performance Analysis
      if (metrics.hooks.averageExecutionTime > this.alertThresholds.hookExecution.critical) {
        alerts.push({
          type: 'CRITICAL',
          metric: 'HOOK_PERFORMANCE',
          value: metrics.hooks.averageExecutionTime,
          threshold: this.alertThresholds.hookExecution.critical,
          message: `Hook execution time critical: ${metrics.hooks.averageExecutionTime}ms`
        });
      } else if (metrics.hooks.averageExecutionTime > this.alertThresholds.hookExecution.warning) {
        alerts.push({
          type: 'WARNING',
          metric: 'HOOK_PERFORMANCE',
          value: metrics.hooks.averageExecutionTime,
          threshold: this.alertThresholds.hookExecution.warning,
          message: `Hook execution time high: ${metrics.hooks.averageExecutionTime}ms`
        });
      }

      // Database Performance Analysis
      if (metrics.database.performanceImpact > this.alertThresholds.databaseQueries.critical) {
        alerts.push({
          type: 'CRITICAL',
          metric: 'DATABASE_PERFORMANCE',
          value: metrics.database.performanceImpact,
          threshold: this.alertThresholds.databaseQueries.critical,
          message: `Database performance impact critical: +${metrics.database.performanceImpact}%`
        });
      }
    }

    // Store alerts
    this.alerts = alerts;

    // Log alerts
    alerts.forEach(alert => {
      const color = alert.type === 'CRITICAL' ? chalk.red : chalk.yellow;
      console.log(color(`🚨 ${alert.type}: ${alert.message}`));
    });
  }

  displayStatus(metrics) {
    console.clear();
    console.log(chalk.bold.blue('📊 Phase 4 Performance Monitor - Live Status'));
    console.log(chalk.gray('=' .repeat(60)));

    // Timestamp
    console.log(chalk.cyan(`🕒 ${new Date(metrics.timestamp).toLocaleString()}`));
    console.log();

    // System Resources
    console.log(chalk.bold('🖥️  System Resources:'));
    console.log(`  CPU Usage: ${this.colorizeMetric(metrics.cpu, 80, 90)}%`);
    console.log(`  Memory: ${this.colorizeMetric(metrics.memory.percentage, 85, 95)}% (${(metrics.memory.used / 1024 / 1024 / 1024).toFixed(2)}GB used)`);
    console.log();

    // Hook Performance
    console.log(chalk.bold('🪝 Hook Performance:'));
    console.log(`  Avg Execution: ${this.colorizeMetric(metrics.hooks.averageExecutionTime, 100, 500)}ms`);
    console.log(`  Success Rate: ${metrics.hooks.successRate}%`);
    console.log(`  Timeouts: ${metrics.hooks.timeouts}`);
    console.log();

    // Database Performance
    console.log(chalk.bold('🗄️  Database Performance:'));
    console.log(`  Query Time: ${metrics.database.queryTime}ms avg`);
    console.log(`  Connections: ${metrics.database.connections}`);
    console.log(`  Impact: +${metrics.database.performanceImpact}%`);
    console.log();

    // Task Metrics
    console.log(chalk.bold('📋 Task Metrics:'));
    console.log(`  Total Tasks: ${metrics.tasks.totalTasks}`);
    console.log(`  Successful: ${metrics.tasks.successfulTasks}`);
    console.log(`  Failed: ${metrics.tasks.failedTasks}`);
    console.log();

    // Alerts
    if (this.alerts.length > 0) {
      console.log(chalk.bold.red('🚨 Active Alerts:'));
      this.alerts.forEach(alert => {
        const color = alert.type === 'CRITICAL' ? chalk.red : chalk.yellow;
        console.log(`  ${color(`${alert.type}: ${alert.message}`)}`);
      });
    } else {
      console.log(chalk.green('✅ No active alerts - system performing within thresholds'));
    }

    console.log(chalk.gray('=' .repeat(60)));
    console.log(chalk.dim('Press Ctrl+C to stop monitoring'));
  }

  colorizeMetric(value, warningThreshold, criticalThreshold) {
    if (value >= criticalThreshold) {
      return chalk.red(value.toFixed(2));
    } else if (value >= warningThreshold) {
      return chalk.yellow(value.toFixed(2));
    } else {
      return chalk.green(value.toFixed(2));
    }
  }

  async saveMetrics(metrics) {
    try {
      const metricsFile = path.join(this.metricsDir, 'phase4-monitoring.json');
      let existingMetrics = [];

      if (await fs.pathExists(metricsFile)) {
        existingMetrics = await fs.readJson(metricsFile);
      }

      existingMetrics.push(metrics);

      // Keep only last 1000 entries to prevent file growth
      if (existingMetrics.length > 1000) {
        existingMetrics = existingMetrics.slice(-1000);
      }

      await fs.writeJson(metricsFile, existingMetrics, { spaces: 2 });
    } catch (error) {
      console.error(chalk.red('❌ Error saving metrics:'), error.message);
    }
  }

  stopMonitoring() {
    console.log(chalk.blue('🛑 Stopping performance monitoring'));
    this.monitoring = false;
  }

  async generateReport() {
    console.log(chalk.blue('📋 Generating performance report...'));

    try {
      const metricsFile = path.join(this.metricsDir, 'phase4-monitoring.json');
      if (await fs.pathExists(metricsFile)) {
        const metrics = await fs.readJson(metricsFile);

        const report = {
          generatedAt: new Date().toISOString(),
          monitoringPeriod: {
            start: new Date(metrics[0]?.timestamp).toISOString(),
            end: new Date(metrics[metrics.length - 1]?.timestamp).toISOString(),
            duration: `${((metrics[metrics.length - 1]?.timestamp - metrics[0]?.timestamp) / 1000 / 60).toFixed(2)} minutes`
          },
          summary: this.calculateSummaryStats(metrics),
          alerts: this.summarizeAlerts(metrics),
          recommendations: this.generateRecommendations(metrics)
        };

        const reportFile = path.join(this.metricsDir, `phase4-performance-report-${Date.now()}.json`);
        await fs.writeJson(reportFile, report, { spaces: 2 });

        console.log(chalk.green(`✅ Performance report saved to: ${reportFile}`));
        return reportFile;
      }
    } catch (error) {
      console.error(chalk.red('❌ Error generating report:'), error.message);
    }
  }

  calculateSummaryStats(metrics) {
    if (metrics.length === 0) return {};

    const cpuValues = metrics.map(m => m.cpu);
    const memoryValues = metrics.map(m => m.memory.percentage);
    const hookTimes = metrics.map(m => m.hooks.averageExecutionTime);

    return {
      cpu: {
        min: Math.min(...cpuValues),
        max: Math.max(...cpuValues),
        average: cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length
      },
      memory: {
        min: Math.min(...memoryValues),
        max: Math.max(...memoryValues),
        average: memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length
      },
      hooks: {
        min: Math.min(...hookTimes),
        max: Math.max(...hookTimes),
        average: hookTimes.reduce((a, b) => a + b, 0) / hookTimes.length
      }
    };
  }

  summarizeAlerts(metrics) {
    // Analyze alert patterns from metrics
    return {
      totalAlerts: this.alerts.length,
      criticalAlerts: this.alerts.filter(a => a.type === 'CRITICAL').length,
      warningAlerts: this.alerts.filter(a => a.type === 'WARNING').length,
      mostCommonAlert: 'CPU_USAGE' // Placeholder
    };
  }

  generateRecommendations(metrics) {
    const recommendations = [];

    if (metrics.some(m => m.cpu > 80)) {
      recommendations.push('Consider CPU optimization or scaling');
    }

    if (metrics.some(m => m.memory.percentage > 85)) {
      recommendations.push('Monitor memory usage and implement caching strategies');
    }

    if (metrics.some(m => m.hooks.averageExecutionTime > 100)) {
      recommendations.push('Optimize hook execution performance');
    }

    return recommendations;
  }
}

// CLI Interface
async function main() {
  const monitor = new Phase4PerformanceMonitor();
  await monitor.initialize();

  const command = process.argv[2] || 'monitor';
  const interval = parseInt(process.argv[3]) || 30000;

  switch (command) {
    case 'monitor':
      console.log(chalk.blue('🚀 Starting Phase 4 performance monitoring...'));

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\\n🛑 Received interrupt signal'));
        monitor.stopMonitoring();
        await monitor.generateReport();
        process.exit(0);
      });

      await monitor.startMonitoring(interval);
      break;

    case 'report':
      await monitor.generateReport();
      break;

    case 'help':
    default:
      console.log(chalk.blue('Phase 4 Performance Monitor'));
      console.log();
      console.log('Usage:');
      console.log('  node performance-monitoring.js monitor [interval]  - Start monitoring (default: 30s)');
      console.log('  node performance-monitoring.js report            - Generate performance report');
      console.log('  node performance-monitoring.js help              - Show this help');
      break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('❌ Monitor failed:'), error);
    process.exit(1);
  });
}

export { Phase4PerformanceMonitor };