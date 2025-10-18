#!/usr/bin/env node
/**
 * 50-Agent Stability Test Memory Monitor
 * WSL2-optimized, 8-hour duration, <1% overhead
 */

import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import v8 from 'v8';
import { spawn, execSync } from 'child_process';
import os from 'os';

class StabilityMonitor {
  constructor(config = {}) {
    this.config = {
      outputPath: config.outputPath || './stability-results',
      samplingInterval: config.samplingInterval || 1000, // 1s
      baselineDelay: config.baselineDelay || 120000,     // 2 min
      leakThreshold: config.leakThreshold || 0.10,       // 10%
      fdThreshold: config.fdThreshold || 10000,
      maxSamples: config.maxSamples || 28800,            // 8 hours at 1s
      ...config
    };

    this.baseline = null;
    this.measurements = [];
    this.alerts = [];
    this.jsonlStream = null;
    this.startTime = Date.now();
    this.running = false;
  }

  async start() {
    console.log('🚀 Starting 8-hour stability test monitor...');
    console.log(`   Sampling interval: ${this.config.samplingInterval}ms`);
    console.log(`   Leak threshold: ${(this.config.leakThreshold * 100).toFixed(1)}%`);
    console.log(`   Output: ${this.config.outputPath}`);

    // Ensure output directory exists
    await fs.mkdir(this.config.outputPath, { recursive: true });

    // Initialize JSONL stream
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `metrics-${timestamp}.jsonl`;
    this.jsonlStream = createWriteStream(`${this.config.outputPath}/${filename}`);
    console.log(`   Log file: ${filename}`);

    // Establish baseline after delay
    setTimeout(() => this.establishBaseline(), this.config.baselineDelay);

    // Start collection loop
    this.running = true;
    this.collectionInterval = setInterval(() => this.collect(), this.config.samplingInterval);

    // Summary reports every 10 minutes
    this.reportInterval = setInterval(() => this.printSummary(), 600000);

    // Graceful shutdown handlers
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));

    console.log('✅ Monitor started. Establishing baseline in 2 minutes...\n');
  }

  async collect() {
    if (!this.running) return;

    const timestamp = Date.now();
    const mem = process.memoryUsage();
    const heap = v8.getHeapStatistics();
    const resources = process.resourceUsage();

    // Collect metrics
    const metrics = {
      timestamp,
      elapsed: timestamp - this.startTime,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers
      },
      heap: {
        totalSize: heap.total_heap_size,
        usedSize: heap.used_heap_size,
        limit: heap.heap_size_limit,
        mallocedMemory: heap.malloced_memory,
        peakMalloced: heap.peak_malloced_memory
      },
      resources: {
        userCPU: resources.userCPUTime,
        systemCPU: resources.systemCPUTime,
        maxRSS: resources.maxRSS
      },
      fds: await this.getFileDescriptorCount(),
      proc: await this.getProcMemory(),
      system: await this.getSystemMetrics()
    };

    // Store and analyze
    this.measurements.push(metrics);

    // Keep memory bounded
    if (this.measurements.length > this.config.maxSamples) {
      this.measurements.shift();
    }

    // Write to JSONL
    this.jsonlStream.write(JSON.stringify(metrics) + '\n');

    // Leak detection every 5 minutes
    if (this.baseline && this.measurements.length % 300 === 0) {
      const leak = this.detectLeak();
      if (leak.detected) {
        this.alerts.push({ timestamp, type: 'memory_leak', data: leak });
        console.warn(`\n⚠️  [${new Date(timestamp).toISOString()}] MEMORY LEAK DETECTED`);
        console.warn(`    Growth: ${leak.growthPercent}% (${leak.growthMB} MB)`);
        console.warn(`    Severity: ${leak.severity}`);
        console.warn(`    Projected 8h: ${leak.projectedGrowth8h.toFixed(2)} MB\n`);
      }
    }

    // FD leak detection
    if (metrics.fds > this.config.fdThreshold) {
      const fdLeak = {
        timestamp,
        count: metrics.fds,
        growth: this.baseline ? metrics.fds - this.baseline.fds : 0
      };
      this.alerts.push({ timestamp, type: 'fd_leak', data: fdLeak });
      console.warn(`\n⚠️  [${new Date(timestamp).toISOString()}] FD LEAK DETECTED`);
      console.warn(`    Open FDs: ${metrics.fds} (threshold: ${this.config.fdThreshold})\n`);
    }
  }

  async getFileDescriptorCount() {
    try {
      const fdPath = `/proc/${process.pid}/fd`;
      const files = await fs.readdir(fdPath);
      return files.length;
    } catch {
      return 0;
    }
  }

  async getProcMemory() {
    try {
      const statusPath = `/proc/${process.pid}/status`;
      const status = await fs.readFile(statusPath, 'utf8');

      const extract = (key) => {
        const match = status.match(new RegExp(`${key}:\\s+(\\d+)`));
        return match ? parseInt(match[1]) * 1024 : 0; // Convert kB to bytes
      };

      return {
        vmRSS: extract('VmRSS'),
        vmSize: extract('VmSize'),
        rssAnon: extract('RssAnon'),
        rssFile: extract('RssFile')
      };
    } catch {
      return null;
    }
  }

  async getSystemMetrics() {
    try {
      // Memory usage from /proc/meminfo
      const meminfo = await fs.readFile('/proc/meminfo', 'utf8');
      const memTotal = parseInt(meminfo.match(/MemTotal:\s+(\d+)/)[1]) * 1024;
      const memAvailable = parseInt(meminfo.match(/MemAvailable:\s+(\d+)/)[1]) * 1024;
      const memUsed = memTotal - memAvailable;

      // tmpfs usage
      const tmpfsOutput = execSync('df -B1 /dev/shm', { encoding: 'utf8' });
      const tmpfsLines = tmpfsOutput.trim().split('\n');
      const tmpfsParts = tmpfsLines[1].split(/\s+/);
      const tmpfsTotal = parseInt(tmpfsParts[1]);
      const tmpfsUsed = parseInt(tmpfsParts[2]);

      // Load average
      const loadavg = os.loadavg();

      return {
        memory: {
          total: memTotal,
          used: memUsed,
          available: memAvailable,
          utilizationPct: (memUsed / memTotal * 100).toFixed(1)
        },
        tmpfs: {
          total: tmpfsTotal,
          used: tmpfsUsed,
          available: tmpfsTotal - tmpfsUsed,
          utilizationPct: (tmpfsUsed / tmpfsTotal * 100).toFixed(1)
        },
        loadavg: {
          '1min': loadavg[0],
          '5min': loadavg[1],
          '15min': loadavg[2]
        }
      };
    } catch (error) {
      console.error('Failed to get system metrics:', error.message);
      return null;
    }
  }

  establishBaseline() {
    if (this.measurements.length === 0) return;

    this.baseline = this.measurements[this.measurements.length - 1];
    console.log('📊 Baseline established:');
    console.log(`   RSS: ${(this.baseline.memory.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Heap: ${(this.baseline.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   FDs: ${this.baseline.fds}`);
    if (this.baseline.system) {
      console.log(`   System memory: ${this.baseline.system.memory.utilizationPct}%`);
      console.log(`   tmpfs: ${this.baseline.system.tmpfs.utilizationPct}%`);
    }
    console.log('');
  }

  detectLeak() {
    if (!this.baseline || this.measurements.length < 300) {
      return { detected: false };
    }

    const current = this.measurements[this.measurements.length - 1];
    const growth = (current.memory.rss - this.baseline.memory.rss) / this.baseline.memory.rss;

    // Calculate trend (linear regression on last 5 minutes)
    const recentWindow = this.measurements.slice(-300);
    const slope = this.calculateSlope(recentWindow.map(m => m.memory.rss));

    const projectedGrowth8h = (slope * 28800) / 1024 / 1024;

    return {
      detected: growth > this.config.leakThreshold || slope > 0.001,
      growthPercent: (growth * 100).toFixed(2),
      growthMB: ((current.memory.rss - this.baseline.memory.rss) / 1024 / 1024).toFixed(2),
      slopePerSecond: slope,
      projectedGrowth8h,
      severity: this.assessSeverity(growth, slope)
    };
  }

  calculateSlope(values) {
    const n = values.length;
    if (n < 2) return 0;

    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  assessSeverity(growth, slope) {
    if (growth > 0.15 || slope > 0.002) return 'CRITICAL';
    if (growth > 0.10 || slope > 0.001) return 'HIGH';
    if (growth > 0.05 || slope > 0.0005) return 'MEDIUM';
    return 'LOW';
  }

  printSummary() {
    if (this.measurements.length === 0) return;

    const current = this.measurements[this.measurements.length - 1];
    const elapsed = (current.timestamp - this.startTime) / 1000 / 3600; // hours

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📈 STABILITY TEST SUMMARY (${elapsed.toFixed(2)}h elapsed)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Memory RSS:  ${(current.memory.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap Used:   ${(current.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Open FDs:    ${current.fds}`);
    console.log(`Samples:     ${this.measurements.length}`);
    console.log(`Alerts:      ${this.alerts.length}`);

    if (this.baseline) {
      const growth = ((current.memory.rss - this.baseline.memory.rss) / this.baseline.memory.rss * 100).toFixed(2);
      console.log(`Growth:      ${growth}% (threshold: ${(this.config.leakThreshold * 100).toFixed(1)}%)`);
    }

    if (current.system) {
      console.log(`System RAM:  ${current.system.memory.utilizationPct}%`);
      console.log(`tmpfs:       ${current.system.tmpfs.utilizationPct}%`);
      console.log(`Load (1m):   ${current.system.loadavg['1min'].toFixed(2)}`);
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }

  async shutdown(signal) {
    console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);
    this.running = false;

    clearInterval(this.collectionInterval);
    clearInterval(this.reportInterval);

    if (this.jsonlStream) {
      this.jsonlStream.end();
    }

    // Generate final report
    await this.generateReport();

    console.log('✅ Monitor stopped. Report generated.');
    process.exit(0);
  }

  async generateReport() {
    if (this.measurements.length === 0) return;

    const first = this.measurements[0];
    const last = this.measurements[this.measurements.length - 1];
    const maxRss = this.measurements.reduce((max, m) => Math.max(max, m.memory.rss), 0);
    const avgRss = this.measurements.reduce((sum, m) => sum + m.memory.rss, 0) / this.measurements.length;
    const maxFds = this.measurements.reduce((max, m) => Math.max(max, m.fds), 0);

    const report = {
      test: {
        duration: (last.timestamp - first.timestamp) / 1000,
        samples: this.measurements.length,
        startTime: new Date(first.timestamp).toISOString(),
        endTime: new Date(last.timestamp).toISOString(),
        samplingInterval: this.config.samplingInterval
      },
      memory: {
        initial: first.memory.rss,
        final: last.memory.rss,
        max: maxRss,
        avg: avgRss,
        growth: ((last.memory.rss - first.memory.rss) / first.memory.rss * 100).toFixed(2) + '%',
        growthMB: ((last.memory.rss - first.memory.rss) / 1024 / 1024).toFixed(2)
      },
      heap: {
        initial: first.memory.heapUsed,
        final: last.memory.heapUsed,
        growth: ((last.memory.heapUsed - first.memory.heapUsed) / first.memory.heapUsed * 100).toFixed(2) + '%'
      },
      fds: {
        initial: first.fds,
        final: last.fds,
        max: maxFds,
        growth: last.fds - first.fds
      },
      system: last.system,
      alerts: this.alerts,
      result: this.determineResult()
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = `${this.config.outputPath}/report-${timestamp}.json`;
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

    console.log('\n' + JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${reportFile}`);
  }

  determineResult() {
    if (!this.baseline || this.measurements.length < 10) {
      return { status: 'INSUFFICIENT_DATA', message: 'Test ran for less than 10 seconds' };
    }

    const last = this.measurements[this.measurements.length - 1];
    const growth = (last.memory.rss - this.baseline.memory.rss) / this.baseline.memory.rss;
    const fdGrowth = last.fds - this.baseline.fds;

    const memoryLeak = growth >= this.config.leakThreshold;
    const fdLeak = last.fds >= this.config.fdThreshold;
    const hasAlerts = this.alerts.length > 0;

    const passed = !memoryLeak && !fdLeak && !hasAlerts;

    return {
      status: passed ? 'PASS' : 'FAIL',
      memoryLeakDetected: memoryLeak,
      fdLeakDetected: fdLeak,
      alertCount: this.alerts.length,
      memoryGrowthPercent: (growth * 100).toFixed(2),
      fdGrowth: fdGrowth,
      message: passed ? 'All stability criteria met' : 'Stability issues detected'
    };
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const config = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      config.outputPath = args[++i];
    } else if (args[i] === '--interval' && args[i + 1]) {
      config.samplingInterval = parseInt(args[++i]);
    } else if (args[i] === '--threshold' && args[i + 1]) {
      config.leakThreshold = parseFloat(args[++i]);
    } else if (args[i] === '--fd-threshold' && args[i + 1]) {
      config.fdThreshold = parseInt(args[++i]);
    } else if (args[i] === '--help') {
      console.log(`
Usage: node stability-monitor.js [options]

Options:
  --output <path>         Output directory for results (default: ./stability-results)
  --interval <ms>         Sampling interval in milliseconds (default: 1000)
  --threshold <percent>   Memory leak threshold (default: 0.10 = 10%)
  --fd-threshold <count>  File descriptor leak threshold (default: 10000)
  --help                  Show this help

Example:
  node stability-monitor.js --output ./test-results --interval 5000 --threshold 0.05
      `);
      process.exit(0);
    }
  }

  const monitor = new StabilityMonitor(config);
  monitor.start();
}

export default StabilityMonitor;