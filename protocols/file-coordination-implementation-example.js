#!/usr/bin/env node

/**
 * File-Based Coordination Protocol Implementation Example
 *
 * This is a complete, working example of the file-based coordination protocol
 * for 50-agent swarm testing in WSL2 environments.
 *
 * Usage:
 *   node protocols/file-coordination-implementation-example.js coordinator
 *   node protocols/file-coordination-implementation-example.js agent agent-0 /dev/shm/stability-test-20251007-142345
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// Import the protocol components (in a real implementation, these would be separate modules)
class FileLock {
  constructor(filePath, maxRetries = 10, retryDelay = 100) {
    this.filePath = filePath;
    this.lockFile = `${filePath}.lock`;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.acquired = false;
  }

  async acquire() {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const lockData = {
          pid: process.pid,
          timestamp: Date.now(),
          sessionId: process.env.STABILITY_SESSION_ID || 'default'
        };

        await fs.writeFile(this.lockFile, JSON.stringify(lockData), { flag: 'wx' });
        this.acquired = true;
        return true;
      } catch (error) {
        if (error.code === 'EEXIST') {
          const stale = await this.isLockStale();
          if (stale) {
            await this.forceRelease();
            continue;
          }
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Failed to acquire lock after ${this.maxRetries} attempts`);
  }

  async release() {
    if (this.acquired) {
      try {
        await fs.unlink(this.lockFile);
        this.acquired = false;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }

  async isLockStale() {
    try {
      const lockData = JSON.parse(await fs.readFile(this.lockFile, 'utf8'));
      const age = Date.now() - lockData.timestamp;
      return age > 30000; // 30 seconds
    } catch (error) {
      return true;
    }
  }

  async forceRelease() {
    try {
      const lockData = JSON.parse(await fs.readFile(this.lockFile, 'utf8'));
      console.warn(`Force releasing stale lock from PID ${lockData.pid}`);
      await fs.unlink(this.lockFile);
    } catch (error) {
      try {
        await fs.unlink(this.lockFile);
      } catch (unlinkError) {
        // Give up
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class SimpleCoordinator {
  constructor(config) {
    this.config = config;
    this.sessionId = this.generateSessionId();
    this.basePath = `/dev/shm/stability-test-${this.sessionId}`;
    this.currentCycle = 0;
    this.running = false;

    // Set environment variable for agents
    process.env.STABILITY_SESSION_ID = this.sessionId;
  }

  async initialize() {
    console.log(`Initializing coordinator with session ID: ${this.sessionId}`);

    await this.createDirectoryStructure();
    await this.initializeSession();
    await this.registerAgents();

    console.log(`Session directory: ${this.basePath}`);
  }

  async runTest() {
    this.running = true;

    console.log(`Starting ${this.config.totalCycles} coordination cycles with ${this.config.agentCount} agents`);

    // Spawn agents
    await this.spawnAgents();

    // Run coordination cycles
    for (let cycle = 1; cycle <= this.config.totalCycles && this.running; cycle++) {
      console.log(`\n=== Cycle ${cycle}/${this.config.totalCycles} ===`);

      const cycleStart = Date.now();

      try {
        // Distribute tasks
        await this.distributeTasks(cycle);

        // Collect results
        const results = await this.collectResults(cycle);

        const cycleTime = Date.now() - cycleStart;
        console.log(`Cycle ${cycle} completed in ${cycleTime}ms`);
        console.log(`Results: ${results.resultsCollected}/${results.agentCount} agents responded`);

        if (results.resultsCollected < results.agentCount) {
          console.warn(`⚠️  ${results.agentCount - results.resultsCollected} agents did not respond`);
        }

      } catch (error) {
        console.error(`Cycle ${cycle} failed:`, error.message);
      }

      // Wait for next cycle
      if (cycle < this.config.totalCycles) {
        console.log(`Waiting ${this.config.cycleInterval/1000}s for next cycle...`);
        await this.sleep(this.config.cycleInterval);
      }
    }

    console.log('\n=== Test Complete ===');
    await this.generateReport();
  }

  async spawnAgents() {
    console.log(`Spawning ${this.config.agentCount} agents...`);

    const agentPromises = [];

    for (let i = 0; i < this.config.agentCount; i++) {
      const agentPromise = new Promise((resolve) => {
        const agent = spawn('node', [
          __filename,
          'agent',
          `agent-${i}`,
          this.basePath
        ], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false
        });

        let ready = false;

        agent.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output.includes('READY')) {
            ready = true;
            resolve({ id: `agent-${i}`, process: agent, pid: agent.pid });
          }
        });

        agent.stderr.on('data', (data) => {
          console.error(`Agent ${i} error:`, data.toString().trim());
        });

        agent.on('exit', (code) => {
          if (!ready) {
            console.error(`Agent ${i} exited with code ${code} before ready`);
            resolve(null);
          }
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!ready) {
            console.error(`Agent ${i} failed to start within timeout`);
            agent.kill();
            resolve(null);
          }
        }, 10000);
      });

      agentPromises.push(agentPromise);
    }

    const agents = await Promise.all(agentPromises);
    const successfulAgents = agents.filter(a => a !== null);

    console.log(`Successfully spawned ${successfulAgents.length}/${this.config.agentCount} agents`);

    if (successfulAgents.length < this.config.agentCount) {
      console.warn(`⚠️  Some agents failed to start. Test will continue with ${successfulAgents.length} agents.`);
    }

    this.agents = successfulAgents;
  }

  async distributeTasks(cycle) {
    const cyclePath = `${this.basePath}/coordinator/cycle-${cycle}`;
    await fs.mkdir(cyclePath, { recursive: true });

    const taskDistributed = {
      cycle,
      timestamp: new Date().toISOString(),
      agentCount: this.config.agentCount,
      tasks: []
    };

    // Create tasks for each agent
    for (let agentId = 0; agentId < this.config.agentCount; agentId++) {
      const task = {
        messageType: "task",
        cycle,
        agentId: `agent-${agentId}`,
        taskId: `task-${cycle}-${agentId}`,
        timestamp: new Date().toISOString(),
        payload: {
          type: "coordination",
          data: {
            operation: "health_check",
            parameters: {
              memoryReport: true,
              fdReport: true,
              latencyTest: cycle % 5 === 0
            }
          }
        },
        timeout: new Date(Date.now() + this.config.taskTimeout).toISOString(),
        retryCount: 0
      };

      const taskPath = `${this.basePath}/agents/agent-${agentId}/task-${cycle}.json`;

      try {
        const lock = new FileLock(taskPath);
        await lock.acquire();
        await fs.writeFile(taskPath, JSON.stringify(task, null, 2));
        await lock.release();

        taskDistributed.tasks.push({
          agentId: task.agentId,
          taskId: task.taskId
        });
      } catch (error) {
        console.error(`Failed to create task for agent-${agentId}:`, error.message);
      }
    }

    await fs.writeFile(
      `${cyclePath}/tasks-distributed.json`,
      JSON.stringify(taskDistributed, null, 2)
    );
  }

  async collectResults(cycle) {
    const cyclePath = `${this.basePath}/coordinator/cycle-${cycle}`;
    const results = [];
    const startTime = Date.now();
    const deadline = Date.now() + this.config.collectionTimeout;

    console.log('Collecting agent results...');

    while (Date.now() < deadline && results.length < this.config.agentCount) {
      for (let agentId = 0; agentId < this.config.agentCount; agentId++) {
        const resultPath = `${this.basePath}/agents/agent-${agentId}/result-${cycle}.json`;

        try {
          const resultData = JSON.parse(await fs.readFile(resultPath, 'utf8'));

          if (!results.find(r => r.agentId === resultData.agentId)) {
            results.push(resultData);
          }
        } catch (error) {
          // File doesn't exist yet, continue checking
        }
      }

      if (results.length < this.config.agentCount) {
        await this.sleep(500);
      }
    }

    const collectionTime = Date.now() - startTime;
    const summary = {
      cycle,
      collectionTime,
      agentCount: this.config.agentCount,
      resultsCollected: results.length,
      successRate: (results.length / this.config.agentCount * 100).toFixed(1),
      results,
      timestamp: new Date().toISOString()
    };

    await fs.writeFile(
      `${cyclePath}/results-summary.json`,
      JSON.stringify(summary, null, 2)
    );

    return summary;
  }

  async generateReport() {
    const report = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      config: this.config,
      summary: {
        totalCycles: this.config.totalCycles,
        agentCount: this.config.agentCount,
        agentsSpawned: this.agents?.length || 0
      }
    };

    // Collect results from all cycles
    try {
      const coordinatorPath = `${this.basePath}/coordinator`;
      const cycleDirs = await fs.readdir(coordinatorPath);

      const cycleResults = [];
      for (const dir of cycleDirs) {
        if (dir.startsWith('cycle-')) {
          const summaryPath = `${coordinatorPath}/${dir}/results-summary.json`;
          try {
            const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
            cycleResults.push(summary);
          } catch (error) {
            // Skip cycles without results
          }
        }
      }

      report.cycles = cycleResults;

      if (cycleResults.length > 0) {
        const avgResponseTime = cycleResults.reduce((sum, cycle) => {
          const avgTime = cycle.results.reduce((s, r) => s + (r.executionTime || 0), 0) / cycle.results.length;
          return sum + avgTime;
        }, 0) / cycleResults.length;

        const overallSuccessRate = cycleResults.reduce((sum, cycle) => sum + parseFloat(cycle.successRate), 0) / cycleResults.length;

        report.performance = {
          averageResponseTime: avgResponseTime.toFixed(2),
          overallSuccessRate: overallSuccessRate.toFixed(1),
          cyclesCompleted: cycleResults.length
        };

        console.log(`\n📊 Performance Summary:`);
        console.log(`   Average Response Time: ${report.performance.averageResponseTime}ms`);
        console.log(`   Overall Success Rate: ${report.performance.overallSuccessRate}%`);
        console.log(`   Cycles Completed: ${report.performance.cyclesCompleted}/${this.config.totalCycles}`);
      }

    } catch (error) {
      console.error('Failed to collect cycle results for report:', error.message);
    }

    const reportPath = `${this.basePath}/final-report.json`;
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n📄 Final report written to: ${reportPath}`);
    console.log(`📂 Session directory: ${this.basePath}`);

    return report;
  }

  async createDirectoryStructure() {
    const dirs = [
      `${this.basePath}/coordinator`,
      `${this.basePath}/agents`,
      `${this.basePath}/monitoring`
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    for (let i = 0; i < this.config.agentCount; i++) {
      await fs.mkdir(`${this.basePath}/agents/agent-${i}`, { recursive: true });
    }
  }

  async initializeSession() {
    const sessionData = {
      sessionId: this.sessionId,
      startTime: new Date().toISOString(),
      coordinatorPid: process.pid,
      config: this.config,
      status: 'running',
      currentCycle: 0
    };

    await fs.writeFile(
      `${this.basePath}/session.json`,
      JSON.stringify(sessionData, null, 2)
    );
  }

  async registerAgents() {
    const registry = {};
    for (let i = 0; i < this.config.agentCount; i++) {
      registry[`agent-${i}`] = {
        status: 'pending',
        registeredAt: new Date().toISOString()
      };
    }

    await fs.writeFile(
      `${this.basePath}/agents/registry.json`,
      JSON.stringify(registry, null, 2)
    );
  }

  generateSessionId() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    this.running = false;

    if (this.agents) {
      console.log('\nCleaning up agents...');
      for (const agent of this.agents) {
        if (agent.process && !agent.process.killed) {
          agent.process.kill('SIGTERM');
          await this.sleep(100);
          if (!agent.process.killed) {
            agent.process.kill('SIGKILL');
          }
        }
      }
    }

    // Mark session as complete
    try {
      const sessionPath = `${this.basePath}/session.json`;
      const session = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
      session.status = 'completed';
      session.endTime = new Date().toISOString();
      await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
    } catch (error) {
      // Ignore errors
    }

    console.log('Cleanup complete');
  }
}

class SimpleAgent {
  constructor(agentId, basePath) {
    this.agentId = agentId;
    this.basePath = basePath;
    this.agentPath = `${basePath}/agents/${agentId}`;
    this.running = false;
    this.heartbeatInterval = null;
    this.metrics = {
      tasksCompleted: 0,
      totalResponseTime: 0,
      errorCount: 0
    };
  }

  async start() {
    console.log(`Agent ${this.agentId} starting...`);
    this.running = true;

    await this.updateStatus('running');
    this.startHeartbeat();

    console.log(`${this.agentId} READY`);

    // Start task processing loop
    this.processTasks();
  }

  async processTasks() {
    while (this.running) {
      try {
        const task = await this.waitForTask();

        if (task) {
          const result = await this.executeTask(task);
          await this.reportResult(task, result);
        } else {
          await this.sleep(1000); // No task, wait
        }

      } catch (error) {
        console.error(`${this.agentId} task processing error:`, error.message);
        await this.sleep(1000);
      }
    }
  }

  async waitForTask() {
    try {
      const files = await fs.readdir(this.agentPath);
      const taskFiles = files.filter(f => f.startsWith('task-') && f.endsWith('.json'));

      for (const file of taskFiles) {
        const taskPath = `${this.agentPath}/${file}`;

        try {
          const lock = new FileLock(taskPath);
          await lock.acquire();

          const task = JSON.parse(await fs.readFile(taskPath, 'utf8'));

          // Check if task has expired
          if (new Date(task.timeout) < new Date()) {
            await lock.release();
            await fs.unlink(taskPath).catch(() => {});
            continue;
          }

          return task;
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.error(`${this.agentId} error reading task:`, error.message);
          }
        }
      }
    } catch (error) {
      // Directory might not exist yet
    }

    return null;
  }

  async executeTask(task) {
    const startTime = Date.now();

    try {
      let result;

      switch (task.payload.type) {
        case 'coordination':
          result = await this.handleCoordinationTask(task.payload.data);
          break;
        default:
          throw new Error(`Unknown task type: ${task.payload.type}`);
      }

      const executionTime = Date.now() - startTime;
      this.metrics.tasksCompleted++;
      this.metrics.totalResponseTime += executionTime;

      return {
        status: 'success',
        executionTime,
        payload: result,
        metrics: {
          cpuUsage: process.cpuUsage().user / 1000000,
          memoryUsage: process.memoryUsage(),
          tasksCompleted: this.metrics.tasksCompleted,
          averageResponseTime: this.metrics.totalResponseTime / this.metrics.tasksCompleted
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.metrics.errorCount++;

      return {
        status: 'error',
        executionTime,
        error: {
          code: error.code || 'TASK_ERROR',
          message: error.message
        }
      };
    }
  }

  async handleCoordinationTask(data) {
    const operations = [];

    if (data.parameters.memoryReport) {
      const memory = process.memoryUsage();
      operations.push({
        operation: 'memory_report',
        data: memory
      });
    }

    if (data.parameters.fdReport) {
      const fdCount = await this.getFileDescriptorCount();
      operations.push({
        operation: 'fd_report',
        data: { count: fdCount }
      });
    }

    if (data.parameters.latencyTest) {
      const start = process.hrtime.bigint();
      await this.sleep(100);
      const end = process.hrtime.bigint();
      const latency = Number(end - start) / 1000000;

      operations.push({
        operation: 'latency_test',
        data: { latency }
      });
    }

    return {
      type: 'coordination_response',
      data: {
        healthStatus: 'healthy',
        operations,
        timestamp: new Date().toISOString()
      }
    };
  }

  async reportResult(task, result) {
    const resultPath = `${this.agentPath}/result-${task.cycle}.json`;
    const lock = new FileLock(resultPath);

    try {
      await lock.acquire();

      const resultMessage = {
        messageType: "result",
        cycle: task.cycle,
        agentId: this.agentId,
        taskId: task.taskId,
        timestamp: new Date().toISOString(),
        ...result
      };

      await fs.writeFile(resultPath, JSON.stringify(resultMessage, null, 2));

      // Clean up task file
      const taskPath = `${this.agentPath}/task-${task.cycle}.json`;
      await fs.unlink(taskPath).catch(() => {});

    } finally {
      await lock.release();
    }
  }

  startHeartbeat() {
    const sendHeartbeat = async () => {
      if (!this.running) return;

      try {
        const timestamp = Date.now();
        const heartbeatPath = `${this.agentPath}/heartbeat-${timestamp}.json`;

        const heartbeat = {
          messageType: "heartbeat",
          agentId: this.agentId,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          status: 'healthy',
          pid: process.pid,
          metrics: {
            ...this.metrics,
            averageResponseTime: this.metrics.tasksCompleted > 0
              ? this.metrics.totalResponseTime / this.metrics.tasksCompleted
              : 0
          }
        };

        await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat, null, 2));

        // Clean up old heartbeats
        await this.cleanupOldHeartbeats();

      } catch (error) {
        console.error(`${this.agentId} heartbeat error:`, error.message);
      }

      if (this.running) {
        this.heartbeatInterval = setTimeout(sendHeartbeat, 5000);
      }
    };

    sendHeartbeat();
  }

  async cleanupOldHeartbeats() {
    try {
      const files = await fs.readdir(this.agentPath);
      const heartbeatFiles = files
        .filter(f => f.startsWith('heartbeat-'))
        .map(f => ({
          name: f,
          timestamp: parseInt(f.split('-')[1].split('.')[0], 10)
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      for (let i = 3; i < heartbeatFiles.length; i++) {
        await fs.unlink(`${this.agentPath}/${heartbeatFiles[i].name}`).catch(() => {});
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async updateStatus(status) {
    const statusPath = `${this.agentPath}/status.json`;
    const lock = new FileLock(statusPath);

    try {
      await lock.acquire();

      const statusData = {
        agentId: this.agentId,
        status,
        lastUpdate: new Date().toISOString(),
        pid: process.pid
      };

      await fs.writeFile(statusPath, JSON.stringify(statusData, null, 2));
    } finally {
      await lock.release();
    }
  }

  async getFileDescriptorCount() {
    try {
      const files = await fs.readdir(`/proc/${process.pid}/fd`);
      return files.length;
    } catch (error) {
      return 0;
    }
  }

  async stop() {
    this.running = false;

    if (this.heartbeatInterval) {
      clearTimeout(this.heartbeatInterval);
    }

    await this.updateStatus('stopped');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === 'coordinator') {
    // Coordinator mode
    const config = {
      agentCount: 5, // Reduced for demo
      totalCycles: 3,
      cycleInterval: 10000, // 10 seconds for demo
      taskTimeout: 5000,
      collectionTimeout: 8000,
      heartbeatInterval: 5000
    };

    const coordinator = new SimpleCoordinator(config);

    // Handle cleanup
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT, cleaning up...');
      await coordinator.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM, cleaning up...');
      await coordinator.cleanup();
      process.exit(0);
    });

    try {
      await coordinator.initialize();
      await coordinator.runTest();
    } catch (error) {
      console.error('Coordinator error:', error);
    } finally {
      await coordinator.cleanup();
    }

  } else if (mode === 'agent') {
    // Agent mode
    const agentId = args[1];
    const basePath = args[2];

    if (!agentId || !basePath) {
      console.error('Agent mode requires agentId and basePath');
      process.exit(1);
    }

    const agent = new SimpleAgent(agentId, basePath);

    // Handle cleanup
    process.on('SIGINT', async () => {
      await agent.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await agent.stop();
      process.exit(0);
    });

    try {
      await agent.start();
    } catch (error) {
      console.error(`Agent ${agentId} error:`, error);
      process.exit(1);
    }

  } else {
    console.log('Usage:');
    console.log('  node file-coordination-implementation-example.js coordinator');
    console.log('  node file-coordination-implementation-example.js agent <agent-id> <base-path>');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { SimpleCoordinator, SimpleAgent, FileLock };