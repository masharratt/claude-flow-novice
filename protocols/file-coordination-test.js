#!/usr/bin/env node

/**
 * File-Based Coordination Protocol Test Suite
 *
 * This script demonstrates and tests the file-based coordination protocol
 * with comprehensive monitoring and reporting.
 *
 * Usage:
 *   node protocols/file-coordination-test.js --quick    # Quick test (5 agents, 3 cycles)
 *   node protocols/file-coordination-test.js --full     # Full test (50 agents, 10 cycles)
 *   node protocols/file-coordination-test.js --monitor  # With real-time monitoring
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

class ProtocolTester {
  constructor(options = {}) {
    this.options = {
      agentCount: options.agentCount || 5,
      totalCycles: options.totalCycles || 3,
      cycleInterval: options.cycleInterval || 5000,
      taskTimeout: options.taskTimeout || 3000,
      collectionTimeout: options.collectionTimeout || 5000,
      monitoring: options.monitoring || false,
      ...options
    };

    this.sessionId = this.generateSessionId();
    this.basePath = `/dev/shm/stability-test-${this.sessionId}`;
    this.coordinator = null;
    this.monitoringInterval = null;
    this.startTime = null;
  }

  async runTest() {
    console.log('🚀 Starting File-Based Coordination Protocol Test');
    console.log(`📊 Configuration: ${this.options.agentCount} agents, ${this.options.totalCycles} cycles`);
    console.log(`📁 Session directory: ${this.basePath}`);

    this.startTime = Date.now();

    try {
      await this.setupEnvironment();
      await this.startCoordinator();

      if (this.options.monitoring) {
        this.startMonitoring();
      }

      await this.waitForCompletion();
      await this.generateFinalReport();

      console.log('✅ Test completed successfully');
      return true;

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      return false;
    } finally {
      await this.cleanup();
    }
  }

  async setupEnvironment() {
    // Check if /dev/shm is available and writable
    try {
      await fs.access('/dev/shm', fs.constants.W_OK);
    } catch (error) {
      throw new Error('/dev/shm is not writable. File-based coordination requires shared memory.');
    }

    // Create session directory
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async startCoordinator() {
    return new Promise((resolve, reject) => {
      const coordinatorScript = `
        const { SimpleCoordinator } = await import('./file-coordination-implementation-example.js');

        const config = ${JSON.stringify(this.options)};
        const coordinator = new SimpleCoordinator(config);

        process.on('SIGINT', async () => {
          await coordinator.cleanup();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          await coordinator.cleanup();
          process.exit(0);
        });

        try {
          await coordinator.initialize();
          await coordinator.runTest();
          process.exit(0);
        } catch (error) {
          console.error('Coordinator error:', error);
          process.exit(1);
        }
      `;

      this.coordinator = spawn('node', ['-e', coordinatorScript], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: path.dirname(__filename),
        env: { ...process.env, STABILITY_SESSION_ID: this.sessionId }
      });

      let resolved = false;

      this.coordinator.stdout.on('data', (data) => {
        const output = data.toString().trim();
        console.log(`[COORDINATOR] ${output}`);

        if (!resolved && output.includes('Session directory:')) {
          resolved = true;
          resolve();
        }
      });

      this.coordinator.stderr.on('data', (data) => {
        console.error(`[COORDINATOR ERROR] ${data.toString().trim()}`);
      });

      this.coordinator.on('exit', (code) => {
        if (!resolved) {
          reject(new Error(`Coordinator exited with code ${code} before initialization`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!resolved) {
          reject(new Error('Coordinator failed to start within timeout'));
        }
      }, 30000);
    });
  }

  startMonitoring() {
    console.log('🔍 Starting real-time monitoring...');

    this.monitoringInterval = setInterval(async () => {
      await this.monitorSession();
    }, 2000);
  }

  async monitorSession() {
    try {
      const stats = await this.getSessionStats();

      // Clear line and overwrite
      process.stdout.write('\r' + ' '.repeat(100) + '\r');

      const duration = Math.floor((Date.now() - this.startTime) / 1000);
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;

      console.log(`⏱️  ${minutes}:${seconds.toString().padStart(2, '0')} | 📊 ${stats.activeAgents}/${this.options.agentCount} agents | 📁 ${stats.filesOnDisk} files | 💾 ${stats.memoryUsage}MB`);

    } catch (error) {
      // Ignore monitoring errors
    }
  }

  async getSessionStats() {
    try {
      // Count agent directories with recent activity
      const agentDirs = await fs.readdir(`${this.basePath}/agents`);
      let activeAgents = 0;
      let filesOnDisk = 0;

      for (const dir of agentDirs) {
        const agentPath = `${this.basePath}/agents/${dir}`;
        try {
          const files = await fs.readdir(agentPath);
          filesOnDisk += files.length;

          // Check for recent heartbeat
          const heartbeatFiles = files.filter(f => f.startsWith('heartbeat-'));
          if (heartbeatFiles.length > 0) {
            activeAgents++;
          }
        } catch (error) {
          // Directory might not exist
        }
      }

      // Get memory usage
      const memoryUsage = Math.round(process.memoryUsage().rss / 1024 / 1024);

      return { activeAgents, filesOnDisk, memoryUsage };
    } catch (error) {
      return { activeAgents: 0, filesOnDisk: 0, memoryUsage: 0 };
    }
  }

  async waitForCompletion() {
    return new Promise((resolve) => {
      this.coordinator.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          throw new Error(`Coordinator exited with non-zero code: ${code}`);
        }
      });
    });
  }

  async generateFinalReport() {
    console.log('\n📈 Generating final report...');

    try {
      const reportPath = `${this.basePath}/final-report.json`;
      const reportData = JSON.parse(await fs.readFile(reportPath, 'utf8'));

      console.log('\n' + '='.repeat(80));
      console.log('  FILE-BASED COORDINATION PROTOCOL TEST REPORT');
      console.log('='.repeat(80));

      console.log(`\n📋 Test Configuration:`);
      console.log(`   Session ID: ${reportData.sessionId}`);
      console.log(`   Agent Count: ${reportData.config.agentCount}`);
      console.log(`   Total Cycles: ${reportData.config.totalCycles}`);
      console.log(`   Cycle Interval: ${reportData.config.cycleInterval}ms`);

      if (reportData.performance) {
        console.log(`\n📊 Performance Metrics:`);
        console.log(`   Average Response Time: ${reportData.performance.averageResponseTime}ms`);
        console.log(`   Overall Success Rate: ${reportData.performance.overallSuccessRate}%`);
        console.log(`   Cycles Completed: ${reportData.performance.cyclesCompleted}/${reportData.config.totalCycles}`);
      }

      // Analyze file system performance
      await this.analyzeFileSystemPerformance();

      console.log(`\n📁 Session Directory: ${this.basePath}`);
      console.log(`\n📄 Full Report: ${reportPath}`);

      console.log('\n' + '='.repeat(80));

    } catch (error) {
      console.error('Failed to generate final report:', error.message);
    }
  }

  async analyzeFileSystemPerformance() {
    try {
      const startTime = Date.now();

      // Test file write performance
      const testFile = `${this.basePath}/performance-test.json`;
      const testData = { timestamp: Date.now(), data: 'x'.repeat(1024) };

      const writeStart = process.hrtime.bigint();
      await fs.writeFile(testFile, JSON.stringify(testData));
      const writeEnd = process.hrtime.bigint();
      const writeTime = Number(writeEnd - writeStart) / 1000000;

      // Test file read performance
      const readStart = process.hrtime.bigint();
      await fs.readFile(testFile);
      const readEnd = process.hrtime.bigint();
      const readTime = Number(readEnd - readStart) / 1000000;

      // Test concurrent access
      const concurrentPromises = [];
      for (let i = 0; i < 10; i++) {
        concurrentPromises.push(
          fs.readFile(testFile).then(data => ({ time: Date.now(), size: data.length }))
        );
      }

      const concurrentStart = Date.now();
      await Promise.all(concurrentPromises);
      const concurrentTime = Date.now() - concurrentStart;

      // Clean up
      await fs.unlink(testFile);

      console.log(`\n🚀 File System Performance:`);
      console.log(`   Write Performance: ${writeTime.toFixed(2)}ms (1KB file)`);
      console.log(`   Read Performance: ${readTime.toFixed(2)}ms (1KB file)`);
      console.log(`   Concurrent Access: ${concurrentTime}ms (10 concurrent reads)`);

      // Count total files and directory structure
      const fileStats = await this.countFiles(this.basePath);
      console.log(`   Total Files Created: ${fileStats.files}`);
      console.log(`   Directory Depth: ${fileStats.maxDepth} levels`);

    } catch (error) {
      console.log(`\n⚠️  File system performance analysis failed: ${error.message}`);
    }
  }

  async countFiles(dirPath, depth = 0) {
    let stats = { files: 0, maxDepth: depth };

    try {
      const entries = await fs.readdir(dirPath);

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        const entryStat = await fs.stat(entryPath);

        if (entryStat.isDirectory()) {
          const subStats = await this.countFiles(entryPath, depth + 1);
          stats.files += subStats.files;
          stats.maxDepth = Math.max(stats.maxDepth, subStats.maxDepth);
        } else {
          stats.files++;
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return stats;
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    if (this.coordinator && !this.coordinator.killed) {
      this.coordinator.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!this.coordinator.killed) {
        this.coordinator.kill('SIGKILL');
      }
    }

    // Wait a bit for agents to clean up
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Optionally clean up session directory (commented out for inspection)
    // try {
    //   await fs.rm(this.basePath, { recursive: true, force: true });
    //   console.log('🗑️  Session directory cleaned up');
    // } catch (error) {
    //   console.log('⚠️  Failed to clean up session directory:', error.message);
    // }

    console.log('✨ Cleanup complete');
  }

  generateSessionId() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  let options = {
    agentCount: 5,
    totalCycles: 3,
    cycleInterval: 5000,
    monitoring: false
  };

  if (args.includes('--quick')) {
    options = { ...options, agentCount: 5, totalCycles: 3 };
  } else if (args.includes('--full')) {
    options = { ...options, agentCount: 50, totalCycles: 10, cycleInterval: 10000 };
  }

  if (args.includes('--monitor')) {
    options.monitoring = true;
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log('File-Based Coordination Protocol Test Suite');
    console.log('');
    console.log('Usage:');
    console.log('  node file-coordination-test.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --quick      Quick test (5 agents, 3 cycles) [default]');
    console.log('  --full       Full test (50 agents, 10 cycles)');
    console.log('  --monitor    Enable real-time monitoring');
    console.log('  --help, -h   Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  node file-coordination-test.js --quick');
    console.log('  node file-coordination-test.js --full --monitor');
    process.exit(0);
  }

  const tester = new ProtocolTester(options);
  const success = await tester.runTest();
  process.exit(success ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ProtocolTester };