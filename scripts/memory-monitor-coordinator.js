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

        // Log to file
        const logLine = `${sample.timestamp},${sample.pid},${sample.name},${sample.cpu},${sample.mem},${sample.rss},${sample.vsz},${sample.elapsed}`;
        await this.writeLog(logLine);

        // Console output for significant memory usage
        if (proc.rss > 500) { // More than 500MB
          console.log(`⚠️  High memory detected: PID ${proc.pid} (${proc.name}) - ${proc.rss}MB RSS, ${proc.cpu}% CPU`);
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

      // Check for memory leak pattern
      const memoryGrowth = maxMemory - minMemory;
      const memoryGrowthRate = memoryGrowth / (samples.length * this.interval / 1000); // MB/second

      if (memoryGrowth > 100) { // More than 100MB growth
        console.log(`   ⚠️  Memory growth: ${memoryGrowth}MB (${memoryGrowthRate.toFixed(2)}MB/s)`);

        if (memoryGrowthRate > 1.0) { // More than 1MB/second
          console.log(`   🚨 POTENTIAL MEMORY LEAK DETECTED!`);
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
    maxDuration: 60000, // 1 minute for quick test
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