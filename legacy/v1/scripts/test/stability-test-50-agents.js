#!/usr/bin/env node

/**
 * 8-Hour Stability Test for 50-Agent Swarm
 *
 * Tests:
 * - 50 agents coordinating every 5 minutes for 8 hours (96 cycles)
 * - Memory stability (RSS/VSZ) with <10% growth target
 * - File descriptor stability
 * - tmpfs usage monitoring
 * - Coordination time variance <20%
 * - Zero crash tolerance
 *
 * Usage:
 *   node scripts/test/stability-test-50-agents.js
 *   node scripts/test/stability-test-50-agents.js --dry-run
 *   node scripts/test/stability-test-50-agents.js --cycles 10 --interval 30000
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  AGENT_COUNT: 50,
  COORDINATION_INTERVAL: 5 * 60 * 1000, // 5 minutes
  TOTAL_DURATION: 8 * 60 * 60 * 1000, // 8 hours
  TOTAL_CYCLES: 96,
  LOG_FILE: 'stability-test-results.jsonl',
  MEMORY_GROWTH_THRESHOLD: 0.10, // 10%
  FD_VARIANCE_THRESHOLD: 0.10, // 10%
  COORDINATION_VARIANCE_THRESHOLD: 0.20, // 20%
  TMPFS_PATH: '/tmp',
  HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
};

// Parse CLI args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const cyclesOverride = args.findIndex(a => a === '--cycles');
const intervalOverride = args.findIndex(a => a === '--interval');

if (cyclesOverride !== -1 && args[cyclesOverride + 1]) {
  CONFIG.TOTAL_CYCLES = parseInt(args[cyclesOverride + 1], 10);
  CONFIG.TOTAL_DURATION = CONFIG.TOTAL_CYCLES * CONFIG.COORDINATION_INTERVAL;
}
if (intervalOverride !== -1 && args[intervalOverride + 1]) {
  CONFIG.COORDINATION_INTERVAL = parseInt(args[intervalOverride + 1], 10);
}

class StabilityTestRunner {
  constructor() {
    this.agents = [];
    this.swarmId = null;
    this.startTime = null;
    this.baselineMetrics = null;
    this.cycleMetrics = [];
    this.isRunning = false;
    this.logStream = null;
    this.healthCheckInterval = null;

    // Bind cleanup handlers
    this.cleanup = this.cleanup.bind(this);
    process.on('SIGINT', this.cleanup);
    process.on('SIGTERM', this.cleanup);
    process.on('uncaughtException', (err) => {
      this.log(`Uncaught exception: ${err.message}`, 'error');
      this.cleanup();
    });
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}]`;

    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      warning: '\x1b[33m',
      error: '\x1b[31m',
      reset: '\x1b[0m',
    };

    const color = colors[level] || colors.reset;
    console.log(`${color}${prefix} ${message}${colors.reset}`);
  }

  async captureSystemMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      memory: await this.getMemoryMetrics(),
      fileDescriptors: await this.getFileDescriptorMetrics(),
      tmpfs: await this.getTmpfsMetrics(),
      processes: await this.getProcessMetrics(),
    };

    return metrics;
  }

  async getMemoryMetrics() {
    try {
      // Get current process and all child processes
      const { stdout } = await execAsync(`ps -o pid,rss,vsz,comm -p ${process.pid} --ppid ${process.pid} --no-headers`);
      const lines = stdout.trim().split('\n').filter(l => l.trim());

      let totalRss = 0;
      let totalVsz = 0;
      const processes = [];

      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const pid = parseInt(parts[0], 10);
          const rss = parseInt(parts[1], 10); // KB
          const vsz = parseInt(parts[2], 10); // KB
          const comm = parts.slice(3).join(' ');

          totalRss += rss;
          totalVsz += vsz;
          processes.push({ pid, rss, vsz, comm });
        }
      });

      return {
        totalRss: totalRss * 1024, // Convert to bytes
        totalVsz: totalVsz * 1024,
        processCount: processes.length,
        processes: processes.slice(0, 5), // Top 5 for logging
      };
    } catch (error) {
      this.log(`Failed to get memory metrics: ${error.message}`, 'warning');
      return { totalRss: 0, totalVsz: 0, processCount: 0, processes: [] };
    }
  }

  async getFileDescriptorMetrics() {
    try {
      // Count file descriptors for current process
      const fdPath = `/proc/${process.pid}/fd`;
      const files = await fs.readdir(fdPath);
      const openFds = files.length;

      // Get system FD limit
      const { stdout: limitsOut } = await execAsync(`cat /proc/${process.pid}/limits | grep 'open files'`);
      const limitMatch = limitsOut.match(/(\d+)\s+(\d+)/);
      const softLimit = limitMatch ? parseInt(limitMatch[1], 10) : 1024;
      const hardLimit = limitMatch ? parseInt(limitMatch[2], 10) : 4096;

      return {
        open: openFds,
        softLimit,
        hardLimit,
        utilization: (openFds / softLimit) * 100,
      };
    } catch (error) {
      this.log(`Failed to get FD metrics: ${error.message}`, 'warning');
      return { open: 0, softLimit: 1024, hardLimit: 4096, utilization: 0 };
    }
  }

  async getTmpfsMetrics() {
    try {
      const { stdout } = await execAsync(`df -B1 ${CONFIG.TMPFS_PATH} | tail -1`);
      const parts = stdout.trim().split(/\s+/);

      if (parts.length >= 6) {
        const total = parseInt(parts[1], 10);
        const used = parseInt(parts[2], 10);
        const available = parseInt(parts[3], 10);
        const utilizationPct = parseFloat(parts[4]);

        return { total, used, available, utilizationPct };
      }

      return { total: 0, used: 0, available: 0, utilizationPct: 0 };
    } catch (error) {
      this.log(`Failed to get tmpfs metrics: ${error.message}`, 'warning');
      return { total: 0, used: 0, available: 0, utilizationPct: 0 };
    }
  }

  async getProcessMetrics() {
    try {
      // Count agent processes (looking for node processes spawned by this script)
      const { stdout } = await execAsync(`pgrep -P ${process.pid} | wc -l`);
      const childProcessCount = parseInt(stdout.trim(), 10);

      return {
        parentPid: process.pid,
        childProcessCount,
        expectedAgents: this.agents.length,
        agentsCrashed: Math.max(0, this.agents.length - childProcessCount),
      };
    } catch (error) {
      this.log(`Failed to get process metrics: ${error.message}`, 'warning');
      return { parentPid: process.pid, childProcessCount: 0, expectedAgents: 0, agentsCrashed: 0 };
    }
  }

  async spawnAgent(index) {
    return new Promise((resolve, reject) => {
      // Simple agent process that stays alive and responds to coordination
      const agentScript = `
        const agentId = 'agent-${index}';
        let coordinations = 0;

        process.on('message', (msg) => {
          if (msg.type === 'coordinate') {
            coordinations++;
            process.send({
              type: 'coordination_response',
              agentId,
              coordinations,
              timestamp: Date.now()
            });
          } else if (msg.type === 'status') {
            process.send({
              type: 'status_response',
              agentId,
              coordinations,
              uptime: process.uptime(),
              memory: process.memoryUsage()
            });
          }
        });

        // Keep alive
        setInterval(() => {}, 60000);

        process.send({ type: 'ready', agentId });
      `;

      const agent = spawn('node', ['-e', agentScript], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        detached: false,
      });

      agent.stdout.on('data', (data) => {
        // Suppress normal output
      });

      agent.stderr.on('data', (data) => {
        this.log(`Agent ${index} error: ${data.toString().trim()}`, 'warning');
      });

      agent.on('message', (msg) => {
        if (msg.type === 'ready') {
          resolve({
            id: msg.agentId,
            process: agent,
            pid: agent.pid,
            spawnTime: Date.now(),
          });
        }
      });

      agent.on('exit', (code, signal) => {
        this.log(`Agent ${index} exited with code ${code}, signal ${signal}`, 'error');
        const agentIndex = this.agents.findIndex(a => a.id === `agent-${index}`);
        if (agentIndex !== -1) {
          this.agents[agentIndex].crashed = true;
          this.agents[agentIndex].exitCode = code;
          this.agents[agentIndex].exitSignal = signal;
        }
      });

      agent.on('error', (error) => {
        reject(error);
      });

      // Timeout after 10 seconds
      setTimeout(() => reject(new Error(`Agent ${index} spawn timeout`)), 10000);
    });
  }

  async spawnAllAgents() {
    this.log(`Spawning ${CONFIG.AGENT_COUNT} agents...`, 'info');
    const startTime = Date.now();

    const agentPromises = Array.from({ length: CONFIG.AGENT_COUNT }, (_, i) =>
      this.spawnAgent(i).catch(err => {
        this.log(`Failed to spawn agent ${i}: ${err.message}`, 'error');
        return null;
      })
    );

    const agents = await Promise.all(agentPromises);
    this.agents = agents.filter(a => a !== null);

    const duration = Date.now() - startTime;
    this.log(`Spawned ${this.agents.length}/${CONFIG.AGENT_COUNT} agents in ${duration}ms`, 'success');

    if (this.agents.length < CONFIG.AGENT_COUNT) {
      throw new Error(`Failed to spawn all agents: ${this.agents.length}/${CONFIG.AGENT_COUNT}`);
    }
  }

  async coordinateAgents(cycle) {
    const startTime = Date.now();
    const responses = [];

    const coordinationPromises = this.agents.map(agent => {
      return new Promise((resolve) => {
        if (agent.crashed) {
          resolve({ agentId: agent.id, error: 'Agent crashed', responded: false });
          return;
        }

        const timeout = setTimeout(() => {
          resolve({ agentId: agent.id, error: 'Timeout', responded: false });
        }, 5000);

        const messageHandler = (msg) => {
          if (msg.type === 'coordination_response') {
            clearTimeout(timeout);
            agent.process.off('message', messageHandler);
            resolve({ ...msg, responded: true });
          }
        };

        agent.process.on('message', messageHandler);
        agent.process.send({ type: 'coordinate', cycle });
      });
    });

    const results = await Promise.all(coordinationPromises);
    const responded = results.filter(r => r.responded).length;
    const failed = results.filter(r => !r.responded).length;

    const duration = Date.now() - startTime;

    return {
      cycle,
      startTime: new Date(startTime).toISOString(),
      durationMs: duration,
      agentsTotal: this.agents.length,
      agentsResponded: responded,
      agentsFailed: failed,
      responses: results,
    };
  }

  async runCoordinationCycle(cycle) {
    this.log(`Running coordination cycle ${cycle}/${CONFIG.TOTAL_CYCLES}`, 'info');

    // Capture pre-coordination metrics
    const preMetrics = await this.captureSystemMetrics();

    // Coordinate agents
    const coordination = await this.coordinateAgents(cycle);

    // Capture post-coordination metrics
    const postMetrics = await this.captureSystemMetrics();

    // Calculate deltas
    const memoryDelta = postMetrics.memory.totalRss - preMetrics.memory.totalRss;
    const fdDelta = postMetrics.fileDescriptors.open - preMetrics.fileDescriptors.open;

    const cycleData = {
      cycle,
      timestamp: new Date().toISOString(),
      preMetrics,
      coordination,
      postMetrics,
      deltas: {
        memory: memoryDelta,
        fileDescriptors: fdDelta,
      },
    };

    this.cycleMetrics.push(cycleData);

    // Write to JSONL log
    await this.writeLogEntry(cycleData);

    // Log summary
    this.log(
      `Cycle ${cycle}: ${coordination.agentsResponded}/${coordination.agentsTotal} agents responded in ${coordination.durationMs}ms ` +
      `(mem: ${memoryDelta > 0 ? '+' : ''}${(memoryDelta / 1024 / 1024).toFixed(2)}MB, fds: ${fdDelta > 0 ? '+' : ''}${fdDelta})`,
      coordination.agentsFailed > 0 ? 'warning' : 'success'
    );

    return cycleData;
  }

  async writeLogEntry(data) {
    try {
      const logLine = JSON.stringify(data) + '\n';
      await fs.appendFile(CONFIG.LOG_FILE, logLine, 'utf8');
    } catch (error) {
      this.log(`Failed to write log entry: ${error.message}`, 'warning');
    }
  }

  async runStabilityTest() {
    this.log('Starting 8-hour stability test for 50-agent swarm', 'info');
    this.log(`Configuration: ${CONFIG.TOTAL_CYCLES} cycles, ${CONFIG.COORDINATION_INTERVAL / 60000} min interval`, 'info');

    if (isDryRun) {
      this.log('DRY RUN MODE - Test will complete after 3 cycles', 'warning');
      CONFIG.TOTAL_CYCLES = 3;
      CONFIG.COORDINATION_INTERVAL = 10000; // 10 seconds
    }

    try {
      // Phase 1: Spawn agents
      await this.spawnAllAgents();

      // Capture baseline metrics
      this.startTime = Date.now();
      this.baselineMetrics = await this.captureSystemMetrics();
      this.log(`Baseline metrics captured: ${(this.baselineMetrics.memory.totalRss / 1024 / 1024).toFixed(2)}MB RSS, ${this.baselineMetrics.fileDescriptors.open} FDs`, 'info');

      await this.writeLogEntry({
        type: 'baseline',
        timestamp: new Date().toISOString(),
        metrics: this.baselineMetrics,
        config: CONFIG,
      });

      // Phase 2: Run coordination cycles
      this.isRunning = true;

      for (let cycle = 1; cycle <= CONFIG.TOTAL_CYCLES && this.isRunning; cycle++) {
        const cycleStartTime = Date.now();

        await this.runCoordinationCycle(cycle);

        // Check for critical failures
        const crashed = this.agents.filter(a => a.crashed).length;
        if (crashed > 0) {
          this.log(`CRITICAL: ${crashed} agents have crashed!`, 'error');
          throw new Error(`Test failed: ${crashed} agents crashed`);
        }

        // Wait for next cycle
        if (cycle < CONFIG.TOTAL_CYCLES) {
          const elapsed = Date.now() - cycleStartTime;
          const waitTime = Math.max(0, CONFIG.COORDINATION_INTERVAL - elapsed);

          if (waitTime > 0) {
            const nextCycle = new Date(Date.now() + waitTime).toISOString();
            this.log(`Waiting ${(waitTime / 1000).toFixed(0)}s until next cycle (${nextCycle})`, 'info');
            await this.sleep(waitTime);
          }
        }
      }

      // Phase 3: Generate report
      this.log('All coordination cycles completed, generating report...', 'success');
      const report = await this.generateReport();

      return report;

    } catch (error) {
      this.log(`Stability test failed: ${error.message}`, 'error');
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async generateReport() {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;

    // Calculate memory growth
    const finalMetrics = this.cycleMetrics[this.cycleMetrics.length - 1]?.postMetrics;
    const memoryGrowth = finalMetrics
      ? (finalMetrics.memory.totalRss - this.baselineMetrics.memory.totalRss) / this.baselineMetrics.memory.totalRss
      : 0;

    // Calculate FD stability
    const fdValues = this.cycleMetrics.map(c => c.postMetrics.fileDescriptors.open);
    const fdMean = fdValues.reduce((sum, v) => sum + v, 0) / fdValues.length;
    const fdStdDev = Math.sqrt(fdValues.reduce((sum, v) => sum + Math.pow(v - fdMean, 2), 0) / fdValues.length);
    const fdVariance = fdMean > 0 ? fdStdDev / fdMean : 0;

    // Calculate coordination time variance
    const coordTimes = this.cycleMetrics.map(c => c.coordination.durationMs);
    const coordMean = coordTimes.reduce((sum, t) => sum + t, 0) / coordTimes.length;
    const coordStdDev = Math.sqrt(coordTimes.reduce((sum, t) => sum + Math.pow(t - coordMean, 2), 0) / coordTimes.length);
    const coordVariance = coordMean > 0 ? coordStdDev / coordMean : 0;

    // Count crashes
    const totalCrashes = this.agents.filter(a => a.crashed).length;

    // Success criteria evaluation
    const memoryPass = memoryGrowth < CONFIG.MEMORY_GROWTH_THRESHOLD;
    const fdPass = fdVariance < CONFIG.FD_VARIANCE_THRESHOLD;
    const coordPass = coordVariance < CONFIG.COORDINATION_VARIANCE_THRESHOLD;
    const crashPass = totalCrashes === 0;
    const overallPass = memoryPass && fdPass && coordPass && crashPass;

    const report = {
      testConfig: CONFIG,
      execution: {
        startTime: new Date(this.startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        totalDurationMs: totalDuration,
        totalDurationHours: (totalDuration / 1000 / 3600).toFixed(2),
        cyclesCompleted: this.cycleMetrics.length,
        agentsSpawned: CONFIG.AGENT_COUNT,
      },
      metrics: {
        memory: {
          baseline: this.baselineMetrics.memory.totalRss,
          final: finalMetrics?.memory.totalRss || 0,
          growth: memoryGrowth,
          growthPct: (memoryGrowth * 100).toFixed(2),
          threshold: CONFIG.MEMORY_GROWTH_THRESHOLD,
          pass: memoryPass,
        },
        fileDescriptors: {
          baseline: this.baselineMetrics.fileDescriptors.open,
          mean: fdMean.toFixed(2),
          stdDev: fdStdDev.toFixed(2),
          variance: coordVariance.toFixed(4),
          threshold: CONFIG.FD_VARIANCE_THRESHOLD,
          pass: fdPass,
        },
        coordination: {
          mean: coordMean.toFixed(2),
          min: Math.min(...coordTimes),
          max: Math.max(...coordTimes),
          stdDev: coordStdDev.toFixed(2),
          variance: coordVariance.toFixed(4),
          threshold: CONFIG.COORDINATION_VARIANCE_THRESHOLD,
          pass: coordPass,
        },
        crashes: {
          total: totalCrashes,
          threshold: 0,
          pass: crashPass,
        },
      },
      success: overallPass,
      recommendations: this.generateRecommendations(memoryGrowth, fdVariance, coordVariance, totalCrashes),
      timestamp: new Date().toISOString(),
    };

    // Write report to file
    const reportFile = `stability-test-report-${Date.now()}.json`;
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');

    // Print report to console
    this.printReport(report);

    return report;
  }

  generateRecommendations(memoryGrowth, fdVariance, coordVariance, crashes) {
    const recommendations = [];

    if (!memoryGrowth || memoryGrowth >= CONFIG.MEMORY_GROWTH_THRESHOLD) {
      recommendations.push({
        severity: 'high',
        category: 'memory',
        message: `Memory growth ${(memoryGrowth * 100).toFixed(2)}% exceeds ${(CONFIG.MEMORY_GROWTH_THRESHOLD * 100)}% threshold`,
        actions: [
          'Investigate memory leaks in agent processes',
          'Review coordination message handling for retained references',
          'Consider implementing periodic agent restart strategy',
        ],
      });
    }

    if (fdVariance >= CONFIG.FD_VARIANCE_THRESHOLD) {
      recommendations.push({
        severity: 'medium',
        category: 'file-descriptors',
        message: `FD variance ${(fdVariance * 100).toFixed(2)}% exceeds ${(CONFIG.FD_VARIANCE_THRESHOLD * 100)}% threshold`,
        actions: [
          'Review file descriptor cleanup in coordination cycles',
          'Check for unclosed file handles or sockets',
          'Implement FD monitoring and cleanup strategy',
        ],
      });
    }

    if (coordVariance >= CONFIG.COORDINATION_VARIANCE_THRESHOLD) {
      recommendations.push({
        severity: 'medium',
        category: 'coordination',
        message: `Coordination time variance ${(coordVariance * 100).toFixed(2)}% exceeds ${(CONFIG.COORDINATION_VARIANCE_THRESHOLD * 100)}% threshold`,
        actions: [
          'Investigate coordination bottlenecks',
          'Consider optimizing message passing strategy',
          'Review agent response timeout handling',
        ],
      });
    }

    if (crashes > 0) {
      recommendations.push({
        severity: 'critical',
        category: 'crashes',
        message: `${crashes} agents crashed during test`,
        actions: [
          'Review agent crash logs for error patterns',
          'Implement better error handling in agent processes',
          'Consider agent health monitoring and automatic recovery',
        ],
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        severity: 'info',
        category: 'success',
        message: 'All stability criteria passed',
        actions: [
          'System is stable for 50-agent swarm operations',
          'Consider testing with larger agent counts',
          'Monitor production deployments for similar patterns',
        ],
      });
    }

    return recommendations;
  }

  printReport(report) {
    console.log('\n' + '='.repeat(80));
    console.log('  8-HOUR STABILITY TEST REPORT - 50-AGENT SWARM');
    console.log('='.repeat(80));

    console.log('\nExecution Summary:');
    console.log(`  Start Time: ${report.execution.startTime}`);
    console.log(`  End Time: ${report.execution.endTime}`);
    console.log(`  Duration: ${report.execution.totalDurationHours} hours`);
    console.log(`  Cycles Completed: ${report.execution.cyclesCompleted}/${CONFIG.TOTAL_CYCLES}`);
    console.log(`  Agents Spawned: ${report.execution.agentsSpawned}`);

    console.log('\nMetrics:');
    console.log(`  Memory Growth: ${report.metrics.memory.growthPct}% (threshold: ${(CONFIG.MEMORY_GROWTH_THRESHOLD * 100)}%) [${report.metrics.memory.pass ? 'PASS' : 'FAIL'}]`);
    console.log(`  FD Variance: ${(report.metrics.fileDescriptors.variance * 100).toFixed(2)}% (threshold: ${(CONFIG.FD_VARIANCE_THRESHOLD * 100)}%) [${report.metrics.fileDescriptors.pass ? 'PASS' : 'FAIL'}]`);
    console.log(`  Coordination Variance: ${(report.metrics.coordination.variance * 100).toFixed(2)}% (threshold: ${(CONFIG.COORDINATION_VARIANCE_THRESHOLD * 100)}%) [${report.metrics.coordination.pass ? 'PASS' : 'FAIL'}]`);
    console.log(`  Crashes: ${report.metrics.crashes.total} (threshold: ${report.metrics.crashes.threshold}) [${report.metrics.crashes.pass ? 'PASS' : 'FAIL'}]`);

    console.log('\nCoordination Performance:');
    console.log(`  Mean: ${report.metrics.coordination.mean}ms`);
    console.log(`  Min: ${report.metrics.coordination.min}ms`);
    console.log(`  Max: ${report.metrics.coordination.max}ms`);
    console.log(`  Std Dev: ${report.metrics.coordination.stdDev}ms`);

    console.log(`\nOverall Result: ${report.success ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}`);

    if (report.recommendations.length > 0) {
      console.log('\nRecommendations:');
      report.recommendations.forEach((rec, i) => {
        const severityColor = rec.severity === 'critical' ? '\x1b[31m' : rec.severity === 'high' ? '\x1b[33m' : '\x1b[36m';
        console.log(`\n  ${i + 1}. [${severityColor}${rec.severity.toUpperCase()}\x1b[0m] ${rec.category}`);
        console.log(`     ${rec.message}`);
        rec.actions.forEach(action => {
          console.log(`     - ${action}`);
        });
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log(`\nDetailed logs written to: ${CONFIG.LOG_FILE}`);
    console.log(`Full report written to: stability-test-report-${Date.now()}.json`);
    console.log('');
  }

  async cleanup() {
    if (!this.isRunning && this.agents.length === 0) {
      return;
    }

    this.log('Cleaning up resources...', 'info');
    this.isRunning = false;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Kill all agent processes
    for (const agent of this.agents) {
      if (agent.process && !agent.crashed) {
        try {
          agent.process.kill('SIGTERM');
          await this.sleep(100);
          if (!agent.process.killed) {
            agent.process.kill('SIGKILL');
          }
        } catch (error) {
          // Process may already be dead
        }
      }
    }

    // Wait for cleanup
    await this.sleep(1000);

    this.log('Cleanup completed', 'success');

    // Don't exit if we're generating a report
    if (this.cycleMetrics.length > 0) {
      // Report will be generated by caller
    } else {
      process.exit(0);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const runner = new StabilityTestRunner();

  try {
    const report = await runner.runStabilityTest();
    process.exit(report.success ? 0 : 1);
  } catch (error) {
    console.error(`\x1b[31mTest failed: ${error.message}\x1b[0m`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { StabilityTestRunner, CONFIG };
