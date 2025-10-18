#!/usr/bin/env node

/**
 * Unified Memory Monitor with Shared Configuration
 *
 * This script uses the shared memory monitoring configuration to ensure
 * consistent behavior across all CFN-distributed systems.
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { MEMORY_THRESHOLDS, MEMORY_MONITOR_DEFAULTS, getProcessThreshold, isMemoryLeakPattern } from '../config/memory-monitoring-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UnifiedMemoryMonitor {
  constructor(options = {}) {
    // Merge user options with defaults
    this.options = {
      ...MEMORY_MONITOR_DEFAULTS,
      ...options
    };

    this.interval = this.options.interval;
    this.maxDuration = this.options.maxDuration;
    this.logFile = this.options.logFile;
    this.targetPid = this.options.targetPid || null;
    this.processName = this.options.processName || 'node';
    this.monitoring = false;
    this.samples = [];
    this.startTime = Date.now();

    // Process-specific memory history for growth rate analysis
    this.processHistory = {};

    console.log('🔧 Unified Memory Monitor initialized');
    console.log(`   Using shared configuration from: ${path.join(__dirname, '../config/memory-monitoring-config.js')}`);
    console.log(`   Leak detection: ${this.options.enableLeakDetection ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   Growth analysis: ${this.options.enableGrowthAnalysis ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Start memory monitoring
   */
  async start() {
    console.log('\n🔍 Starting Unified Memory Monitor');
    console.log(`📊 Interval: ${this.interval}ms`);
    console.log(`⏱️  Max Duration: ${this.maxDuration}ms`);
    console.log(`📝 Log File: ${this.logFile}`);

    this.monitoring = true;

    // Initialize log file
    await this.writeLog('=== Unified Memory Monitor Started ===');
    await this.writeLog(`Timestamp,PID,ProcessName,CPU%,MEM%,RSS(MB),VSZ(MB),Elapsed(ms),Threshold(MB),Status`);

    // Start monitoring loop
    this.monitorInterval = setInterval(() => {
      this.collectSample();
    }, this.interval);

    // Set timeout to stop monitoring
    setTimeout(() => {
      this.stop();
    }, this.maxDuration);

    return new Promise((resolve) => {
      this.onStop = resolve;
    });
  }

  /**
   * Collect memory sample with enhanced analysis
   */
  async collectSample() {
    try {
      const now = Date.now();
      const elapsed = now - this.startTime;

      // Get process information
      const processes = await this.getProcessInfo();

      for (const proc of processes) {
        const sample = {
          timestamp: new Date().toISOString(),
          pid: proc.pid,
          name: proc.name,
          cpu: proc.cpu,
          mem: proc.mem,
          rss: proc.rss,
          vsz: proc.vsz,
          elapsed: elapsed
        };

        this.samples.push(sample);

        // Get process-specific threshold
        const cmdline = this.getProcessCmdline(proc.pid);
        const threshold = getProcessThreshold(proc.name, proc.pid, cmdline);
        const warningThreshold = threshold.memory * MEMORY_THRESHOLDS.analysis.warningThreshold;
        const criticalThreshold = threshold.memory;

        // Determine status
        let status = 'NORMAL';
        if (proc.rss > criticalThreshold) {
          status = 'CRITICAL';
        } else if (proc.rss > warningThreshold) {
          status = 'WARNING';
        }

        // Log to file with enhanced information
        const logLine = `${sample.timestamp},${sample.pid},${sample.name},${sample.cpu},${sample.mem},${sample.rss},${sample.vsz},${sample.elapsed},${threshold.memory},${status}`;
        await this.writeLog(logLine);

        // Track process-specific memory history
        if (this.options.enableGrowthAnalysis) {
          this.trackProcessHistory(proc, now, threshold);
        }

        // Console output with context-aware warnings
        this.outputMemoryWarning(proc, threshold, status);

        // Advanced leak detection if enabled
        if (this.options.enableLeakDetection && this.options.enableGrowthAnalysis) {
          await this.analyzeForMemoryLeaks(proc, threshold);
        }
      }

    } catch (error) {
      console.error('❌ Error collecting sample:', error.message);
    }
  }

  /**
   * Track process-specific memory history
   */
  trackProcessHistory(proc, timestamp, threshold) {
    const processKey = `${proc.pid}-${proc.name}`;

    if (!this.processHistory[processKey]) {
      this.processHistory[processKey] = [];
    }

    this.processHistory[processKey].push({
      timestamp,
      memory: proc.rss,
      cpu: proc.cpu,
      threshold: threshold.memory
    });

    // Keep only recent samples
    const maxSamples = MEMORY_THRESHOLDS.analysis.maxHistorySamples;
    if (this.processHistory[processKey].length > maxSamples) {
      this.processHistory[processKey] = this.processHistory[processKey].slice(-maxSamples);
    }
  }

  /**
   * Output memory warnings with context
   */
  outputMemoryWarning(proc, threshold, status) {
    const { analysis } = MEMORY_THRESHOLDS;

    if (status === 'WARNING') {
      console.log(`⚠️  Moderate memory usage: PID ${proc.pid} (${proc.name}) - ${proc.rss}MB RSS (threshold: ${threshold.memory}MB)`);
    } else if (status === 'CRITICAL') {
      console.log(`🚨 High memory detected: PID ${proc.pid} (${proc.name}) - ${proc.rss}MB RSS (exceeds threshold: ${threshold.memory}MB)`);

      // Show percentage over threshold
      const overThreshold = ((proc.rss / threshold.memory) - 1) * 100;
      console.log(`   📈 Over threshold by: ${overThreshold.toFixed(1)}%`);
    }
  }

  /**
   * Analyze for memory leaks using historical data
   */
  async analyzeForMemoryLeaks(proc, threshold) {
    const processKey = `${proc.pid}-${proc.name}`;
    const history = this.processHistory[processKey];

    if (!history || history.length < MEMORY_THRESHOLDS.analysis.minSamplesForAnalysis) {
      return;
    }

    // Calculate growth metrics
    const recent = history.slice(-10);
    const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
    const memoryGrowth = recent[recent.length - 1].memory - recent[0].memory;
    const growthRate = timeSpan > 0 ? (memoryGrowth / (timeSpan / 1000)) : 0; // MB/second

    // Calculate consistent growth ratio
    let increasingSegments = 0;
    let totalSegments = 0;

    for (let i = 1; i < recent.length; i++) {
      totalSegments++;
      if (recent[i].memory > recent[i - 1].memory) {
        increasingSegments++;
      }
    }

    const consistentRatio = totalSegments > 0 ? increasingSegments / totalSegments : 0;

    // Check for memory leak pattern
    if (isMemoryLeakPattern(growthRate, memoryGrowth, consistentRatio)) {
      console.log(`🚨 POTENTIAL MEMORY LEAK: PID ${proc.pid} (${proc.name})`);
      console.log(`   📈 Growth rate: ${growthRate.toFixed(2)}MB/s`);
      console.log(`   📊 Total growth: ${memoryGrowth}MB`);
      console.log(`   📈 Consistency: ${(consistentRatio * 100).toFixed(1)}%`);
      console.log(`   💡 Based on sustained growth pattern, not temporary spikes`);
      console.log(`   ⏰ Process age: ${((Date.now() - history[0].timestamp) / 1000).toFixed(0)}s`);

      // Log to file with leak detection details
      await this.writeLog(`MEMORY_LEAK_DETECTED: PID ${proc.pid} (${proc.name}) - Growth: ${growthRate.toFixed(2)}MB/s, Consistency: ${(consistentRatio * 100).toFixed(1)}%`);
    }
  }

  /**
   * Get process information for target processes
   */
  async getProcessInfo() {
    return new Promise((resolve, reject) => {
      const ps = spawn('ps', ['eo', 'pid,%cpu,%mem,rss,vsz,comm'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      ps.stdout.on('data', (data) => {
        output += data.toString();
      });

      ps.stderr.on('data', (data) => {
        error += data.toString();
      });

      ps.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ps command failed: ${error}`));
          return;
        }

        const processes = [];
        const lines = output.trim().split('\n');

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 6) {
            const pid = parseInt(parts[0]);
            const cpu = parseFloat(parts[1]);
            const mem = parseFloat(parts[2]);
            const rss = Math.round(parseInt(parts[3]) / 1024); // Convert KB to MB
            const vsz = Math.round(parseInt(parts[4]) / 1024); // Convert KB to MB
            const name = parts.slice(5).join(' ');

            // Filter for target processes
            if (this.isTargetProcess(pid, name)) {
              processes.push({ pid, cpu, mem, rss, vsz, name });
            }
          }
        }

        resolve(processes);
      });

      ps.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get command line for a process
   */
  getProcessCmdline(pid) {
    try {
      const cmdlineFile = `/proc/${pid}/cmdline`;
      return require('fs').readFileSync(cmdlineFile, 'utf8');
    } catch (error) {
      return '';
    }
  }

  /**
   * Check if process should be monitored
   */
  isTargetProcess(pid, name) {
    // Monitor specific PID if provided
    if (this.targetPid && pid === this.targetPid) {
      return true;
    }

    // Extended process list for comprehensive monitoring
    const targetNames = [
      'spawn-coordinator',
      'spawn-workers',
      'node',
      'claude',
      'rust',
      'cargo',
      'python',
      'python3'
    ];

    return targetNames.some(targetName =>
      name.includes(targetName) ||
      (name === 'node' && this.hasCoordinatorArgs(pid))
    );
  }

  /**
   * Check if node process has coordinator-related arguments
   */
  hasCoordinatorArgs(pid) {
    try {
      const cmdline = this.getProcessCmdline(pid);
      return cmdline.includes('spawn-coordinator') ||
             cmdline.includes('spawn-workers') ||
             cmdline.includes('hybrid-routing') ||
             cmdline.includes('cfn-coordinator');
    } catch (error) {
      return false;
    }
  }

  /**
   * Write to log file
   */
  async writeLog(line) {
    try {
      await fs.appendFile(this.logFile, line + '\n');
    } catch (error) {
      console.error('❌ Error writing to log:', error.message);
    }
  }

  /**
   * Stop monitoring and generate comprehensive report
   */
  async stop() {
    if (!this.monitoring) return;

    console.log('\n🛑 Stopping Unified Memory Monitor');
    this.monitoring = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    // Generate comprehensive analysis report
    await this.generateEnhancedReport();

    if (this.onStop) {
      this.onStop();
    }
  }

  /**
   * Generate enhanced memory analysis report
   */
  async generateEnhancedReport() {
    console.log('\n📊 Unified Memory Analysis Report');
    console.log('='.repeat(60));

    if (this.samples.length === 0) {
      console.log('❌ No samples collected');
      return;
    }

    // Group samples by process
    const processGroups = {};
    for (const sample of this.samples) {
      const key = `${sample.pid}-${sample.name}`;
      if (!processGroups[key]) {
        processGroups[key] = [];
      }
      processGroups[key].push(sample);
    }

    console.log(`\n📈 Summary: ${Object.keys(processGroups).length} processes monitored`);
    console.log(`⏱️  Duration: ${((Date.now() - this.startTime) / 1000).toFixed(1)} seconds`);
    console.log(`📊 Total samples: ${this.samples.length}`);

    // Analyze each process
    for (const [processKey, samples] of Object.entries(processGroups)) {
      const [pid, name] = processKey.split('-');
      console.log(`\n🔍 Process: ${name} (PID: ${pid})`);

      const memoryValues = samples.map(s => s.rss);
      const cpuValues = samples.map(s => s.cpu);

      const minMemory = Math.min(...memoryValues);
      const maxMemory = Math.max(...memoryValues);
      const avgMemory = memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length;

      const minCpu = Math.min(...cpuValues);
      const maxCpu = Math.max(...cpuValues);
      const avgCpu = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;

      console.log(`   Memory: ${minMemory}MB → ${maxMemory}MB (avg: ${avgMemory.toFixed(1)}MB)`);
      console.log(`   CPU: ${minCpu}% → ${maxCpu}% (avg: ${avgCpu.toFixed(1)}%)`);
      console.log(`   Samples: ${samples.length}`);

      // Get threshold for this process
      const cmdline = this.getProcessCmdline(parseInt(pid));
      const threshold = getProcessThreshold(name, parseInt(pid), cmdline);
      console.log(`   Threshold: ${threshold.memory}MB (${threshold.description})`);

      // Check threshold compliance
      const thresholdCompliance = ((maxMemory / threshold.memory) * 100).toFixed(1);
      if (maxMemory > threshold.memory) {
        console.log(`   🚨 EXCEEDED THRESHOLD by ${thresholdCompliance}%`);
      } else {
        console.log(`   ✅ Within threshold (${thresholdCompliance}% of max)`);
      }

      // Memory growth analysis
      const memoryGrowth = maxMemory - minMemory;
      const memoryGrowthRate = memoryGrowth / (samples.length * this.interval / 1000);

      if (memoryGrowth > MEMORY_THRESHOLDS.analysis.totalGrowthThreshold) {
        console.log(`   ⚠️  Memory growth: ${memoryGrowth}MB (${memoryGrowthRate.toFixed(2)}MB/s)`);

        if (memoryGrowthRate > MEMORY_THRESHOLDS.analysis.growthRateThreshold) {
          console.log(`   🚨 HIGH GROWTH RATE detected!`);
        }
      }

      // CPU spikes
      if (maxCpu > 80) {
        console.log(`   ⚠️  High CPU usage detected: ${maxCpu}%`);
      }
    }

    // Write detailed report to file
    const reportFile = this.logFile.replace('.log', '-enhanced-report.json');
    await fs.writeFile(reportFile, JSON.stringify({
      summary: {
        totalSamples: this.samples.length,
        duration: Date.now() - this.startTime,
        processesAnalyzed: Object.keys(processGroups).length,
        configuration: {
          thresholds: MEMORY_THRESHOLDS,
          options: this.options
        }
      },
      processGroups,
      samples: this.samples
    }, null, 2));

    console.log(`\n📄 Enhanced report saved to: ${reportFile}`);
    console.log(`🔧 Configuration: ${path.join(__dirname, '../config/memory-monitoring-config.js')}`);
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pid' && args[i + 1]) {
      options.targetPid = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--interval' && args[i + 1]) {
      options.interval = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--duration' && args[i + 1]) {
      options.maxDuration = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--log-file' && args[i + 1]) {
      options.logFile = args[i + 1];
      i++;
    } else if (args[i] === '--disable-leak-detection') {
      options.enableLeakDetection = false;
    } else if (args[i] === '--disable-growth-analysis') {
      options.enableGrowthAnalysis = false;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Unified Memory Monitor - CFN Distributed Systems

Usage: node unified-memory-monitor.js [options]

Options:
  --pid <number>           Monitor specific process ID
  --interval <ms>          Monitoring interval (default: 2000ms)
  --duration <ms>          Maximum monitoring duration (default: 300000ms)
  --log-file <path>        Log file path (default: ./memory-monitor.log)
  --disable-leak-detection Disable memory leak detection
  --disable-growth-analysis Disable growth pattern analysis
  --help, -h              Show this help

Examples:
  node unified-memory-monitor.js --pid 12345
  node unified-memory-monitor.js --interval 5000 --duration 600000
  node unified-memory-monitor.js --log-file ./custom-monitor.log

Configuration:
  Uses shared configuration from ../config/memory-monitoring-config.js
  Process thresholds and analysis parameters are centrally managed.
      `);
      process.exit(0);
    }
  }

  const monitor = new UnifiedMemoryMonitor(options);
  await monitor.start();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Memory monitor error:', error);
    process.exit(1);
  });
}

export { UnifiedMemoryMonitor };