/**
 * Throughput Monitoring and Benchmarking System
 * Real-time performance monitoring for file processing operations
 */

const EventEmitter = require('events');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');

class ThroughputMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      samplingInterval: options.samplingInterval || 1000, // 1 second
      reportInterval: options.reportInterval || 5000, // 5 seconds
      historySize: options.historySize || 300, // 5 minutes of data
      enableAlerts: options.enableAlerts !== false,
      throughputThreshold: options.throughputThreshold || 10, // MB/s
      errorThreshold: options.errorThreshold || 5, // 5% error rate
      ...options
    };

    // Monitoring state
    this.isMonitoring = false;
    this.startTime = null;
    this.monitoringTimer = null;
    this.reportTimer = null;

    // Performance metrics
    this.currentMetrics = {
      timestamp: null,
      bytesProcessed: 0,
      filesProcessed: 0,
      errors: 0,
      processingTime: 0,
      throughput: 0,
      fileRate: 0,
      errorRate: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      activeWorkers: 0
    };

    // Historical data for trend analysis
    this.metricsHistory = [];
    this.benchmarks = new Map();
    this.alerts = [];

    // Performance targets
    this.targets = {
      throughput: this.options.throughputThreshold, // MB/s
      fileRate: 100, // files/second
      errorRate: this.options.errorThreshold, // percentage
      cpuUsage: 80, // percentage
      memoryUsage: 80 // percentage of available
    };

    // System baseline
    this.systemBaseline = null;
  }

  /**
   * Start monitoring
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      console.warn('Monitoring already started');
      return;
    }

    this.isMonitoring = true;
    this.startTime = Date.now();
    this.currentMetrics.timestamp = this.startTime;

    // Capture system baseline
    await this.captureSystemBaseline();

    // Start sampling timer
    this.monitoringTimer = setInterval(() => {
      this.collectMetrics();
    }, this.options.samplingInterval);

    // Start reporting timer
    this.reportTimer = setInterval(() => {
      this.generateReport();
    }, this.options.reportInterval);

    console.log('📊 Throughput monitoring started');
    this.emit('monitoring-started', { timestamp: this.startTime });
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    // Clear timers
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }

    // Generate final report
    await this.generateReport(true);

    console.log('📊 Throughput monitoring stopped');
    this.emit('monitoring-stopped', { duration: Date.now() - this.startTime });
  }

  /**
   * Capture system baseline metrics
   */
  async captureSystemBaseline() {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    this.systemBaseline = {
      cpuModel: cpus[0].model,
      cpuCount: cpus.length,
      totalMemory: totalMemory,
      availableMemory: freeMemory,
      loadAverage: os.loadavg(),
      platform: os.platform(),
      arch: os.arch()
    };

    console.log('🔍 System baseline captured:', this.systemBaseline);
  }

  /**
   * Collect current performance metrics
   */
  collectMetrics() {
    const timestamp = Date.now();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Calculate time-weighted averages
    const timeDelta = timestamp - this.currentMetrics.timestamp;
    const bytesDelta = this.currentMetrics.bytesProcessed;
    const filesDelta = this.currentMetrics.filesProcessed;
    const errorsDelta = this.currentMetrics.errors;

    // Update current metrics
    this.currentMetrics = {
      timestamp,
      bytesProcessed: 0, // Reset for next interval
      filesProcessed: 0,
      errors: 0,
      processingTime: 0,
      throughput: timeDelta > 0 ? (bytesDelta / timeDelta / 1024 / 1024) * 1000 : 0, // MB/s
      fileRate: timeDelta > 0 ? (filesDelta / timeDelta) * 1000 : 0, // files/s
      errorRate: filesDelta > 0 ? (errorsDelta / filesDelta) * 100 : 0, // percentage
      cpuUsage: this.calculateCPUUsage(cpuUsage),
      memoryUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      activeWorkers: this.currentMetrics.activeWorkers // Will be updated externally
    };

    // Store in history
    this.metricsHistory.push({ ...this.currentMetrics });
    if (this.metricsHistory.length > this.options.historySize) {
      this.metricsHistory.shift();
    }

    // Check for alerts
    if (this.options.enableAlerts) {
      this.checkAlerts();
    }

    // Emit metrics update
    this.emit('metrics-update', this.currentMetrics);
  }

  /**
   * Calculate CPU usage percentage
   */
  calculateCPUUsage(cpuUsage) {
    // Convert CPU usage to percentage (simplified)
    const totalUsage = cpuUsage.user + cpuUsage.system;
    const elapsed = Date.now() - this.startTime;
    return elapsed > 0 ? Math.min((totalUsage / elapsed / 1000000) * 100, 100) : 0;
  }

  /**
   * Update metrics from external source
   */
  updateMetrics(metrics) {
    if (metrics.bytesProcessed !== undefined) {
      this.currentMetrics.bytesProcessed += metrics.bytesProcessed;
    }
    if (metrics.filesProcessed !== undefined) {
      this.currentMetrics.filesProcessed += metrics.filesProcessed;
    }
    if (metrics.errors !== undefined) {
      this.currentMetrics.errors += metrics.errors;
    }
    if (metrics.processingTime !== undefined) {
      this.currentMetrics.processingTime += metrics.processingTime;
    }
    if (metrics.activeWorkers !== undefined) {
      this.currentMetrics.activeWorkers = metrics.activeWorkers;
    }
  }

  /**
   * Check for performance alerts
   */
  checkAlerts() {
    const alerts = [];

    // Throughput alert
    if (this.currentMetrics.throughput < this.targets.throughput) {
      alerts.push({
        type: 'throughput',
        severity: 'warning',
        message: `Low throughput: ${this.currentMetrics.throughput.toFixed(2)} MB/s (target: ${this.targets.throughput} MB/s)`,
        value: this.currentMetrics.throughput,
        target: this.targets.throughput
      });
    }

    // Error rate alert
    if (this.currentMetrics.errorRate > this.targets.errorRate) {
      alerts.push({
        type: 'error-rate',
        severity: 'error',
        message: `High error rate: ${this.currentMetrics.errorRate.toFixed(2)}% (target: ${this.targets.errorRate}%)`,
        value: this.currentMetrics.errorRate,
        target: this.targets.errorRate
      });
    }

    // CPU usage alert
    if (this.currentMetrics.cpuUsage > this.targets.cpuUsage) {
      alerts.push({
        type: 'cpu-usage',
        severity: 'warning',
        message: `High CPU usage: ${this.currentMetrics.cpuUsage.toFixed(2)}% (target: ${this.targets.cpuUsage}%)`,
        value: this.currentMetrics.cpuUsage,
        target: this.targets.cpuUsage
      });
    }

    // Memory usage alert
    if (this.currentMetrics.memoryUsage > this.targets.memoryUsage) {
      alerts.push({
        type: 'memory-usage',
        severity: 'warning',
        message: `High memory usage: ${this.currentMetrics.memoryUsage.toFixed(2)}% (target: ${this.targets.memoryUsage}%)`,
        value: this.currentMetrics.memoryUsage,
        target: this.targets.memoryUsage
      });
    }

    // Emit alerts
    alerts.forEach(alert => {
      this.alerts.push(alert);
      this.emit('alert', alert);
    });
  }

  /**
   * Generate performance report
   */
  async generateReport(isFinal = false) {
    if (this.metricsHistory.length === 0) {
      return null;
    }

    const report = {
      timestamp: Date.now(),
      duration: Date.now() - this.startTime,
      isFinal,
      summary: this.calculateSummary(),
      trends: this.calculateTrends(),
      current: this.currentMetrics,
      baseline: this.systemBaseline,
      targets: this.targets,
      alerts: this.alerts.slice(-10) // Last 10 alerts
    };

    this.emit('report-generated', report);

    if (isFinal) {
      console.log('\n📊 FINAL PERFORMANCE REPORT');
      console.log('=' .repeat(60));
      console.log(`Duration: ${(report.duration / 1000).toFixed(2)} seconds`);
      console.log(`Average Throughput: ${report.summary.avgThroughput.toFixed(2)} MB/s`);
      console.log(`Peak Throughput: ${report.summary.maxThroughput.toFixed(2)} MB/s`);
      console.log(`Total Files: ${report.summary.totalFiles}`);
      console.log(`Total Bytes: ${(report.summary.totalBytes / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Error Rate: ${report.summary.avgErrorRate.toFixed(2)}%`);
      console.log(`Efficiency: ${report.summary.efficiency.toFixed(2)}%`);
      console.log('=' .repeat(60));
    }

    return report;
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary() {
    if (this.metricsHistory.length === 0) {
      return null;
    }

    const throughputs = this.metricsHistory.map(m => m.throughput);
    const fileRates = this.metricsHistory.map(m => m.fileRate);
    const errorRates = this.metricsHistory.map(m => m.errorRate);
    const cpuUsages = this.metricsHistory.map(m => m.cpuUsage);
    const memoryUsages = this.metricsHistory.map(m => m.memoryUsage);

    // Calculate total processed data
    const totalBytes = this.metricsHistory.reduce((sum, m) => sum + m.bytesProcessed, 0);
    const totalFiles = this.metricsHistory.reduce((sum, m) => sum + m.filesProcessed, 0);
    const totalErrors = this.metricsHistory.reduce((sum, m) => sum + m.errors, 0);

    // Calculate averages
    const avgThroughput = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
    const avgFileRate = fileRates.reduce((a, b) => a + b, 0) / fileRates.length;
    const avgErrorRate = errorRates.reduce((a, b) => a + b, 0) / errorRates.length;
    const avgCpuUsage = cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length;
    const avgMemoryUsage = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;

    // Calculate efficiency (actual vs target throughput)
    const efficiency = (avgThroughput / this.targets.throughput) * 100;

    return {
      totalBytes,
      totalFiles,
      totalErrors,
      avgThroughput,
      maxThroughput: Math.max(...throughputs),
      minThroughput: Math.min(...throughputs.filter(t => t > 0)),
      avgFileRate,
      maxFileRate: Math.max(...fileRates),
      avgErrorRate,
      avgCpuUsage,
      avgMemoryUsage,
      efficiency,
      sampleCount: this.metricsHistory.length
    };
  }

  /**
   * Calculate performance trends
   */
  calculateTrends() {
    if (this.metricsHistory.length < 10) {
      return null;
    }

    const recent = this.metricsHistory.slice(-10);
    const older = this.metricsHistory.slice(-20, -10);

    if (older.length === 0) return null;

    const recentAvg = recent.reduce((sum, m) => sum + m.throughput, 0) / recent.length;
    const olderAvg = older.reduce((sum, m) => sum + m.throughput, 0) / older.length;

    const trend = {
      throughput: {
        direction: recentAvg > olderAvg ? 'improving' : 'declining',
        change: ((recentAvg - olderAvg) / olderAvg) * 100,
        recent: recentAvg,
        older: olderAvg
      }
    };

    return trend;
  }

  /**
   * Run performance benchmark
   */
  async runBenchmark(testFiles, options = {}) {
    console.log('🚀 Running performance benchmark...');

    const benchmarkId = `benchmark-${Date.now()}`;
    const startTime = Date.now();

    const benchmark = {
      id: benchmarkId,
      startTime,
      testFiles: testFiles.length,
      options,
      results: {
        totalBytes: 0,
        totalFiles: 0,
        totalTime: 0,
        throughput: 0,
        errors: 0
      }
    };

    // Start monitoring for benchmark
    await this.startMonitoring();

    try {
      // Process test files (this would be integrated with the file processor)
      for (const file of testFiles) {
        try {
          const stats = await fs.stat(file);
          benchmark.results.totalBytes += stats.size;
          benchmark.results.totalFiles++;

          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

          this.updateMetrics({
            bytesProcessed: stats.size,
            filesProcessed: 1
          });

        } catch (error) {
          benchmark.results.errors++;
          console.error(`Error processing ${file}:`, error.message);
        }
      }

      benchmark.results.totalTime = Date.now() - startTime;
      benchmark.results.throughput = (benchmark.results.totalBytes / benchmark.results.totalTime) * 1000 / 1024 / 1024; // MB/s

      // Store benchmark results
      this.benchmarks.set(benchmarkId, benchmark);

      console.log(`✅ Benchmark completed: ${benchmark.results.throughput.toFixed(2)} MB/s`);
      this.emit('benchmark-completed', benchmark);

      return benchmark;

    } finally {
      await this.stopMonitoring();
    }
  }

  /**
   * Get current monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      startTime: this.startTime,
      duration: this.startTime ? Date.now() - this.startTime : 0,
      currentMetrics: this.currentMetrics,
      historySize: this.metricsHistory.length,
      alertsCount: this.alerts.length,
      benchmarksCount: this.benchmarks.size
    };
  }

  /**
   * Export metrics data
   */
  exportMetrics(format = 'json') {
    const data = {
      timestamp: Date.now(),
      baseline: this.systemBaseline,
      current: this.currentMetrics,
      history: this.metricsHistory,
      summary: this.calculateSummary(),
      trends: this.calculateTrends(),
      targets: this.targets,
      alerts: this.alerts
    };

    if (format === 'csv') {
      return this.convertToCSV(data.history);
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Convert metrics to CSV format
   */
  convertToCSV(history) {
    const headers = [
      'timestamp', 'throughput', 'fileRate', 'errorRate',
      'cpuUsage', 'memoryUsage', 'activeWorkers'
    ];

    const rows = history.map(m => [
      m.timestamp,
      m.throughput.toFixed(2),
      m.fileRate.toFixed(2),
      m.errorRate.toFixed(2),
      m.cpuUsage.toFixed(2),
      m.memoryUsage.toFixed(2),
      m.activeWorkers
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}

export default ThroughputMonitor;