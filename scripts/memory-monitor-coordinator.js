#!/usr/bin/env node

/**
 * Memory Monitor for Coordinator CLI Process
 *
 * Monitors memory usage patterns in spawn-coordinator and spawn-workers processes
 * Identifies potential memory leaks and provides detailed analysis
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

class MemoryMonitor {
  constructor(options = {}) {
    this.interval = options.interval || 1000; // 1 second default
    this.maxDuration = options.maxDuration || 300000; // 5 minutes default
    this.logFile = options.logFile || './memory-monitor.log';
    this.targetPid = options.targetPid || null;
    this.processName = options.processName || 'node';
    this.monitoring = false;
    this.samples = [];
    this.startTime = Date.now();

    // Process-specific memory history for growth rate analysis
    this.processHistory = {};

    // Context-aware thresholds for different process types
    this.thresholds = {
      'cfn-coordinator-mvp': { memory: 2000, timeout: 3600000 }, // Higher limit for coordinators
      'cfn-coordinator-standard': { memory: 2000, timeout: 3600000 },
      'cfn-coordinator-enterprise': { memory: 3000, timeout: 7200000 },
      'spawn-coordinator': { memory: 1500, timeout: 1800000 },
      'spawn-workers': { memory: 1500, timeout: 1800000 },
      'node': { memory: 1000, timeout: 900000 },
      'default': { memory: 1500, timeout: 1800000 }
    };
  }

  /**
   * Start memory monitoring
   */
  async start() {
    console.log('🔍 Starting Memory Monitor for Coordinator CLI');
    console.log(`📊 Interval: ${this.interval}ms`);
    console.log(`⏱️  Max Duration: ${this.maxDuration}ms`);
    console.log(`📝 Log File: ${this.logFile}`);

    this.monitoring = true;

    // Initialize log file
    await this.writeLog('=== Memory Monitor Started ===');
    await this.writeLog(`Timestamp,PID,ProcessName,CPU%,MEM%,RSS(MB),VSZ(MB),Elapsed(ms)`);

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
   * Collect memory sample
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

        // Track process-specific memory history
        const processKey = `${proc.pid}-${proc.name}`;
        if (!this.processHistory[processKey]) {
          this.processHistory[processKey] = [];
        }
        this.processHistory[processKey].push({
          timestamp: now,
          memory: proc.rss,
          cpu: proc.cpu
        });

        // Keep only last 30 samples per process for growth rate analysis
        if (this.processHistory[processKey].length > 30) {
          this.processHistory[processKey] = this.processHistory[processKey].slice(-30);
        }

        // Log to file
        const logLine = `${sample.timestamp},${sample.pid},${sample.name},${sample.cpu},${sample.mem},${sample.rss},${sample.vsz},${sample.elapsed}`;
        await this.writeLog(logLine);

        // Get context-aware threshold for this process
        const processThreshold = this.getThresholdForProcess(proc.name, proc.pid);
        const warningThreshold = processThreshold.memory * 0.7; // Warning at 70%
        const criticalThreshold = processThreshold.memory;

        // Console output for graduated memory warnings
        if (proc.rss > warningThreshold) {
          console.log(`⚠️  Moderate memory usage: PID ${proc.pid} (${proc.name}) - ${proc.rss}MB RSS (threshold: ${processThreshold.memory}MB)`);
        }
        if (proc.rss > criticalThreshold) {
          console.log(`🚨 High memory detected: PID ${proc.pid} (${proc.name}) - ${proc.rss}MB RSS (exceeds threshold: ${processThreshold.memory}MB)`);
        }

        // Check for concerning memory growth patterns (only if we have enough history)
        if (this.processHistory[processKey].length >= 10) {
          const growthAnalysis = this.analyzeMemoryGrowth(this.processHistory[processKey]);
          if (growthAnalysis.isLeaking) {
            console.log(`🚨 POTENTIAL MEMORY LEAK: PID ${proc.pid} (${proc.name}) - ${growthAnalysis.growthRate.toFixed(2)}MB/s sustained growth`);
            console.log(`   💡 This is based on sustained growth pattern, not temporary spikes`);
          }
        }
      }

    } catch (error) {
      console.error('❌ Error collecting sample:', error.message);
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
   * Check if process should be monitored
   */
  isTargetProcess(pid, name) {
    // Monitor specific PID if provided
    if (this.targetPid && pid === this.targetPid) {
      return true;
    }

    // Monitor processes matching names
    const targetNames = [
      'spawn-coordinator',
      'spawn-workers',
      'node',
      'claude'
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
      const cmdlineFile = `/proc/${pid}/cmdline`;
      const cmdline = require('fs').readFileSync(cmdlineFile, 'utf8');
      return cmdline.includes('spawn-coordinator') ||
             cmdline.includes('spawn-workers') ||
             cmdline.includes('hybrid-routing');
    } catch (error) {
      return false;
    }
  }

  /**
   * Get context-aware threshold for a process
   */
  getThresholdForProcess(processName, pid) {
    // Check if process name matches any specific thresholds
    if (this.thresholds[processName]) {
      return this.thresholds[processName];
    }

    // Check for coordinator processes by examining command line
    if (processName === 'node' && this.hasCoordinatorArgs(pid)) {
      const cmdline = require('fs').readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (cmdline.includes('cfn-coordinator-mvp')) {
        return this.thresholds['cfn-coordinator-mvp'];
      } else if (cmdline.includes('cfn-coordinator-standard')) {
        return this.thresholds['cfn-coordinator-standard'];
      } else if (cmdline.includes('cfn-coordinator-enterprise')) {
        return this.thresholds['cfn-coordinator-enterprise'];
      } else if (cmdline.includes('spawn-coordinator') || cmdline.includes('spawn-workers')) {
        return this.thresholds['spawn-coordinator'];
      }
    }

    // Default threshold
    return this.thresholds['default'];
  }

  /**
   * Analyze memory growth pattern to distinguish leaks from legitimate usage
   */
  analyzeMemoryGrowth(history) {
    if (history.length < 5) {
      return { isLeaking: false, growthRate: 0 };
    }

    // Calculate growth rate over recent history (last 10 samples)
    const recent = history.slice(-10);
    const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
    const memoryGrowth = recent[recent.length - 1].memory - recent[0].memory;
    const growthRate = timeSpan > 0 ? (memoryGrowth / (timeSpan / 1000)) : 0; // MB/second

    // Check for consistent growth pattern
    const consistentGrowth = this.isConsistentGrowth(recent);

    // Only flag as leak if:
    // 1. Growth rate is significant (> 3MB/s)
    // 2. Growth is consistent (not just spikes)
    // 3. Total growth is substantial (> 50MB in analysis window)
    const isLeaking = growthRate > 3.0 && consistentGrowth && memoryGrowth > 50;

    return {
      isLeaking,
      growthRate,
      memoryGrowth,
      consistent: consistentGrowth
    };
  }

  /**
   * Check if memory growth is consistent vs temporary spikes
   */
  isConsistentGrowth(samples) {
    if (samples.length < 3) return false;

    let increasingSegments = 0;
    let totalSegments = 0;

    for (let i = 1; i < samples.length; i++) {
      totalSegments++;
      if (samples[i].memory > samples[i - 1].memory) {
        increasingSegments++;
      }
    }

    // Consistent growth means at least 70% of segments are increasing
    const consistencyRatio = increasingSegments / totalSegments;
    return consistencyRatio > 0.7;
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
   * Stop monitoring and generate report
   */
  async stop() {
    if (!this.monitoring) return;

    console.log('\n🛑 Stopping Memory Monitor');
    this.monitoring = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    // Generate analysis report
    await this.generateReport();

    if (this.onStop) {
      this.onStop();
    }
  }

  /**
   * Generate memory analysis report
   */
  async generateReport() {
    console.log('\n📊 Memory Analysis Report');
    console.log('='.repeat(50));

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

      // Check for memory leak pattern with more realistic thresholds
      const memoryGrowth = maxMemory - minMemory;
      const memoryGrowthRate = memoryGrowth / (samples.length * this.interval / 1000); // MB/second

      if (memoryGrowth > 500) { // More than 500MB growth (increased from 100MB)
        console.log(`   ⚠️  Memory growth: ${memoryGrowth}MB (${memoryGrowthRate.toFixed(2)}MB/s)`);

        if (memoryGrowthRate > 5.0) { // More than 5MB/second (increased from 1MB/s)
          console.log(`   🚨 POTENTIAL MEMORY LEAK DETECTED!`);
          console.log(`   💡 Consider monitoring longer before killing - legitimate file operations can cause temporary spikes`);
        }
      }

      // Check for CPU spikes
      if (maxCpu > 80) {
        console.log(`   ⚠️  High CPU usage detected: ${maxCpu}%`);
      }
    }

    // Write detailed report to file
    const reportFile = this.logFile.replace('.log', '-report.json');
    await fs.writeFile(reportFile, JSON.stringify({
      summary: {
        totalSamples: this.samples.length,
        duration: Date.now() - this.startTime,
        processesAnalyzed: Object.keys(processGroups).length
      },
      processGroups,
      samples: this.samples
    }, null, 2));

    console.log(`\n📄 Detailed report saved to: ${reportFile}`);
  }
}

/**
 * Monitor a specific coordinator process
 */
async function monitorCoordinator(args = []) {
  const options = {
    interval: 2000, // 2 seconds
    maxDuration: 300000, // 5 minutes for realistic monitoring (increased from 1 minute)
    logFile: './coordinator-memory.log'
  };

  // If coordinator PID provided, monitor it specifically
  const coordinatorPidArg = args.find(arg => arg.startsWith('--pid='));
  if (coordinatorPidArg) {
    options.targetPid = parseInt(coordinatorPidArg.split('=')[1]);
  }

  const monitor = new MemoryMonitor(options);
  await monitor.start();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  monitorCoordinator(process.argv.slice(2)).catch(console.error);
}

export { MemoryMonitor };