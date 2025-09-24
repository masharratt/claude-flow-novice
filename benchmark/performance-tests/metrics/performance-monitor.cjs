#!/usr/bin/env node

/**
 * Real-time Performance Monitor
 * Tracks system metrics during benchmark execution
 */

const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const v8 = require('v8');

class PerformanceMonitor {
  constructor() {
    this.isMonitoring = false;
    this.metrics = [];
    this.startTime = Date.now();
    this.interval = null;
    this.samplingRate = 1000; // 1 second
  }

  // Get comprehensive system metrics
  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: Date.now(),
      relativeTime: Date.now() - this.startTime,
      system: {
        freeMemory: os.freememory(),
        totalMemory: os.totalmem(),
        loadAverage: os.loadavg(),
        uptime: os.uptime(),
        cpuCount: os.cpus().length
      },
      process: {
        memory: memUsage,
        heap: {
          used: heapStats.used_heap_size,
          total: heapStats.total_heap_size,
          limit: heapStats.heap_size_limit,
          external: heapStats.external_memory
        },
        cpu: cpuUsage,
        pid: process.pid,
        uptime: process.uptime()
      },
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  // Start monitoring
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Monitoring already active');
      return;
    }

    console.log('📊 Starting performance monitoring...');
    this.isMonitoring = true;
    this.metrics = [];
    this.startTime = Date.now();

    // Take initial measurement
    this.metrics.push(this.getSystemMetrics());

    this.interval = setInterval(() => {
      this.metrics.push(this.getSystemMetrics());
      this.displayCurrentMetrics();
    }, this.samplingRate);

    return this;
  }

  // Stop monitoring
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️ Monitoring not active');
      return;
    }

    console.log('🛑 Stopping performance monitoring...');
    this.isMonitoring = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Take final measurement
    this.metrics.push(this.getSystemMetrics());

    return this;
  }

  // Display current metrics
  displayCurrentMetrics() {
    const latest = this.metrics[this.metrics.length - 1];
    const runtime = (latest.relativeTime / 1000).toFixed(1);

    const memoryUsageMB = (latest.process.memory.rss / 1024 / 1024).toFixed(1);
    const heapUsageMB = (latest.process.heap.used / 1024 / 1024).toFixed(1);
    const freeMemoryMB = (latest.system.freeMemory / 1024 / 1024).toFixed(0);
    const loadAvg = latest.system.loadAverage[0].toFixed(2);

    process.stdout.write(`\r📊 [${runtime}s] Memory: ${memoryUsageMB}MB | Heap: ${heapUsageMB}MB | Free: ${freeMemoryMB}MB | Load: ${loadAvg}`);
  }

  // Analyze metrics
  analyzeMetrics() {
    if (this.metrics.length < 2) {
      return { error: 'Insufficient data for analysis' };
    }

    const first = this.metrics[0];
    const last = this.metrics[this.metrics.length - 1];

    // Memory analysis
    const memoryGrowth = last.process.memory.rss - first.process.memory.rss;
    const heapGrowth = last.process.heap.used - first.process.heap.used;

    // Peak values
    const peakMemory = Math.max(...this.metrics.map(m => m.process.memory.rss));
    const peakHeap = Math.max(...this.metrics.map(m => m.process.heap.used));

    // Average values
    const avgMemory = this.metrics.reduce((sum, m) => sum + m.process.memory.rss, 0) / this.metrics.length;
    const avgLoad = this.metrics.reduce((sum, m) => sum + m.system.loadAverage[0], 0) / this.metrics.length;

    return {
      duration: last.relativeTime,
      sampleCount: this.metrics.length,
      memory: {
        growth: memoryGrowth,
        growthMB: memoryGrowth / 1024 / 1024,
        peak: peakMemory,
        peakMB: peakMemory / 1024 / 1024,
        average: avgMemory,
        averageMB: avgMemory / 1024 / 1024
      },
      heap: {
        growth: heapGrowth,
        growthMB: heapGrowth / 1024 / 1024,
        peak: peakHeap,
        peakMB: peakHeap / 1024 / 1024
      },
      system: {
        averageLoad: avgLoad,
        peakLoad: Math.max(...this.metrics.map(m => m.system.loadAverage[0])),
        cpuCount: first.system.cpuCount,
        totalMemoryMB: first.system.totalMemory / 1024 / 1024
      }
    };
  }

  // Save metrics to file
  async saveMetrics(filepath) {
    const analysis = this.analyzeMetrics();
    const report = {
      metadata: {
        startTime: this.startTime,
        endTime: Date.now(),
        samplingRate: this.samplingRate,
        platform: process.platform,
        nodeVersion: process.version
      },
      analysis,
      rawMetrics: this.metrics
    };

    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
    console.log(`\n📁 Metrics saved to: ${filepath}`);
    return report;
  }

  // Generate summary report
  generateSummary() {
    const analysis = this.analyzeMetrics();

    if (analysis.error) {
      return analysis;
    }

    console.log('\n📊 Performance Monitoring Summary:');
    console.log(`⏱️ Duration: ${(analysis.duration / 1000).toFixed(1)} seconds`);
    console.log(`📈 Memory Growth: ${analysis.memory.growthMB.toFixed(1)} MB`);
    console.log(`🎯 Peak Memory: ${analysis.memory.peakMB.toFixed(1)} MB`);
    console.log(`📊 Average Load: ${analysis.system.averageLoad.toFixed(2)}`);
    console.log(`⚡ Peak Load: ${analysis.system.peakLoad.toFixed(2)}`);

    // Health assessment
    const healthScore = this.calculateHealthScore(analysis);
    console.log(`❤️ System Health: ${healthScore.score}/100 (${healthScore.status})`);

    return analysis;
  }

  // Calculate system health score
  calculateHealthScore(analysis) {
    let score = 100;
    let issues = [];

    // Memory growth penalty
    if (analysis.memory.growthMB > 100) {
      score -= 30;
      issues.push(`High memory growth: ${analysis.memory.growthMB.toFixed(1)}MB`);
    } else if (analysis.memory.growthMB > 50) {
      score -= 15;
      issues.push(`Moderate memory growth: ${analysis.memory.growthMB.toFixed(1)}MB`);
    }

    // Load average penalty
    if (analysis.system.averageLoad > analysis.system.cpuCount * 2) {
      score -= 25;
      issues.push(`High CPU load: ${analysis.system.averageLoad.toFixed(2)}`);
    } else if (analysis.system.averageLoad > analysis.system.cpuCount) {
      score -= 10;
      issues.push(`Elevated CPU load: ${analysis.system.averageLoad.toFixed(2)}`);
    }

    // Memory utilization penalty
    const memUtilization = (analysis.memory.peakMB / (analysis.system.totalMemoryMB)) * 100;
    if (memUtilization > 80) {
      score -= 20;
      issues.push(`High memory utilization: ${memUtilization.toFixed(1)}%`);
    }

    let status = 'EXCELLENT';
    if (score < 90) status = 'GOOD';
    if (score < 75) status = 'FAIR';
    if (score < 60) status = 'POOR';
    if (score < 40) status = 'CRITICAL';

    return {
      score: Math.max(0, score),
      status,
      issues
    };
  }
}

module.exports = PerformanceMonitor;

// CLI usage
if (require.main === module) {
  const monitor = new PerformanceMonitor();

  console.log('🚀 Starting performance monitor...');
  console.log('Press Ctrl+C to stop and generate report\n');

  monitor.startMonitoring();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping monitor...');

    monitor.stopMonitoring();

    const timestamp = Date.now();
    const metricsPath = path.join(__dirname, `../../results/verification/performance-metrics-${timestamp}.json`);

    await monitor.saveMetrics(metricsPath);
    monitor.generateSummary();

    console.log('✅ Performance monitoring complete');
    process.exit(0);
  });
}