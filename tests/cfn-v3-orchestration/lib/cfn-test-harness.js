#!/usr/bin/env node

/**
 * CFN v3 Test Harness
 *
 * Core test infrastructure for CFN v3 orchestration tests.
 * Provides utilities for spawning coordinators, workers, tracking connections,
 * and validating handoffs.
 */

import { spawn } from 'child_process';
import { createClient } from 'redis';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CfnTestHarness extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      redisHost: options.redisHost || process.env.REDIS_HOST || 'localhost',
      redisPort: options.redisPort || process.env.REDIS_PORT || 6379,
      testTimeout: options.timeout || 30000,
      verbose: options.verbose || false,
      debug: options.debug || false,
      cleanup: options.cleanup !== false,
    };

    this.redis = null;
    this.processes = new Map(); // processId -> process handle
    this.connections = new Map(); // workerId -> connection metadata
    this.handoffs = new Map(); // taskId -> handoff metadata
    this.metrics = {
      cfnConnectionCount: 0,
      cfnWorkerSpawnCount: 0,
      cfnCoordinatorConnections: 0,
      cfnHandoffCount: 0,
      cfnReviewerAssignments: 0,
      cfnHandoffFailures: 0,
      cfnStartupTime: 0,
      cfnShutdownTime: 0,
      cfnOrphanedProcesses: 0,
    };

    this.testStartTime = null;
    this.testEndTime = null;
  }

  /**
   * Initialize test harness
   */
  async init() {
    this.log('Initializing CFN test harness...');
    this.testStartTime = Date.now();

    // Connect to Redis
    this.redis = createClient({
      socket: {
        host: this.config.redisHost,
        port: this.config.redisPort,
      },
    });

    this.redis.on('error', (err) => {
      this.error('Redis error:', err);
    });

    await this.redis.connect();
    this.log('✅ Redis connected');

    // Clean up any existing test data
    await this.cleanupRedis();

    return this;
  }

  /**
   * Spawn a coordinator process
   */
  async spawnCoordinator(coordinatorId, options = {}) {
    const startTime = Date.now();
    this.log(`Spawning coordinator: ${coordinatorId}`);

    const scriptPath = options.scriptPath || path.join(__dirname, '../../../.claude/skills/cfn-loop-orchestration-v2/orchestrate-cfn-loop-v3.sh');

    const env = {
      ...process.env,
      COORDINATOR_ID: coordinatorId,
      REDIS_HOST: this.config.redisHost,
      REDIS_PORT: this.config.redisPort,
      TASK_ID: options.taskId || `test-task-${Date.now()}`,
      ...options.env,
    };

    const proc = spawn('bash', [scriptPath], {
      env,
      stdio: this.config.verbose ? 'inherit' : 'pipe',
    });

    const processMetadata = {
      id: coordinatorId,
      type: 'coordinator',
      pid: proc.pid,
      startTime,
      process: proc,
    };

    this.processes.set(coordinatorId, processMetadata);
    this.metrics.cfnCoordinatorConnections++;

    // Track process output
    if (!this.config.verbose && proc.stdout) {
      proc.stdout.on('data', (data) => {
        this.debug(`[${coordinatorId}] ${data.toString().trim()}`);
      });
    }

    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        this.debug(`[${coordinatorId}] ERROR: ${data.toString().trim()}`);
      });
    }

    proc.on('exit', (code, signal) => {
      this.log(`Coordinator ${coordinatorId} exited with code ${code}, signal ${signal}`);
      this.emit('coordinator-exit', { coordinatorId, code, signal });
    });

    // Wait for coordinator to register in Redis
    await this.waitForRedisKey(`coordinator:${coordinatorId}:status`, 5000);

    const duration = Date.now() - startTime;
    this.log(`✅ Coordinator ${coordinatorId} spawned (${duration}ms)`);

    return processMetadata;
  }

  /**
   * Spawn a worker process
   */
  async spawnWorker(workerId, coordinatorId, options = {}) {
    const startTime = Date.now();
    this.log(`Spawning worker: ${workerId} for coordinator: ${coordinatorId}`);

    const scriptPath = options.scriptPath || path.join(__dirname, '../../../dist/cli/spawn.js');

    const env = {
      ...process.env,
      WORKER_ID: workerId,
      COORDINATOR_ID: coordinatorId,
      REDIS_HOST: this.config.redisHost,
      REDIS_PORT: this.config.redisPort,
      ...options.env,
    };

    const proc = spawn('node', [scriptPath], {
      env,
      stdio: this.config.verbose ? 'inherit' : 'pipe',
    });

    const processMetadata = {
      id: workerId,
      type: 'worker',
      pid: proc.pid,
      coordinatorId,
      startTime,
      process: proc,
    };

    this.processes.set(workerId, processMetadata);
    this.metrics.cfnWorkerSpawnCount++;

    // Track process output
    if (!this.config.verbose && proc.stdout) {
      proc.stdout.on('data', (data) => {
        this.debug(`[${workerId}] ${data.toString().trim()}`);
      });
    }

    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        this.debug(`[${workerId}] ERROR: ${data.toString().trim()}`);
      });
    }

    proc.on('exit', (code, signal) => {
      this.log(`Worker ${workerId} exited with code ${code}, signal ${signal}`);
      this.emit('worker-exit', { workerId, code, signal });
    });

    // Wait for worker to register in Redis
    await this.waitForRedisKey(`worker:${workerId}:status`, 5000);

    const duration = Date.now() - startTime;

    // Track connection
    this.connections.set(workerId, {
      workerId,
      coordinatorId,
      connectedAt: Date.now(),
      connectionTime: duration,
    });

    this.metrics.cfnConnectionCount++;

    this.log(`✅ Worker ${workerId} connected (${duration}ms)`);
    this.emit('worker-connected', { workerId, coordinatorId, duration });

    return processMetadata;
  }

  /**
   * Track a handoff from worker to reviewer
   */
  async trackHandoff(taskId, workerId, reviewerId, options = {}) {
    const startTime = Date.now();
    this.log(`Tracking handoff: ${taskId} from ${workerId} to ${reviewerId}`);

    try {
      // Record handoff in Redis
      await this.redis.hSet(`handoff:${taskId}`, {
        workerId,
        reviewerId,
        timestamp: Date.now().toString(),
        status: 'pending',
      });

      // Simulate handoff coordination
      await this.waitForRedisKey(`handoff:${taskId}:status`, options.timeout || 5000);

      const duration = Date.now() - startTime;

      // Track handoff
      this.handoffs.set(taskId, {
        taskId,
        workerId,
        reviewerId,
        handoffTime: duration,
        completedAt: Date.now(),
      });

      this.metrics.cfnHandoffCount++;

      this.log(`✅ Handoff ${taskId} completed (${duration}ms)`);
      this.emit('handoff-completed', { taskId, workerId, reviewerId, duration });

      return { success: true, duration };
    } catch (error) {
      this.metrics.cfnHandoffFailures++;
      this.error(`❌ Handoff ${taskId} failed:`, error.message);
      this.emit('handoff-failed', { taskId, workerId, reviewerId, error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Gracefully shutdown all processes
   */
  async shutdown() {
    const startTime = Date.now();
    this.log('Initiating graceful shutdown...');

    const shutdownPromises = [];

    for (const [processId, metadata] of this.processes) {
      shutdownPromises.push(this.shutdownProcess(processId, metadata));
    }

    await Promise.all(shutdownPromises);

    // Check for orphaned processes
    this.metrics.cfnOrphanedProcesses = await this.checkOrphanedProcesses();

    if (this.config.cleanup) {
      await this.cleanupRedis();
      await this.redis.quit();
    }

    const duration = Date.now() - startTime;
    this.metrics.cfnShutdownTime = duration;

    this.log(`✅ Shutdown completed (${duration}ms)`);
    this.emit('shutdown-completed', { duration, orphanedProcesses: this.metrics.cfnOrphanedProcesses });

    return { duration, orphanedProcesses: this.metrics.cfnOrphanedProcesses };
  }

  /**
   * Shutdown a single process
   */
  async shutdownProcess(processId, metadata) {
    this.log(`Shutting down ${metadata.type}: ${processId} (PID: ${metadata.pid})`);

    return new Promise((resolve) => {
      const proc = metadata.process;

      if (!proc || proc.killed) {
        resolve();
        return;
      }

      // Set timeout for graceful shutdown
      const timeout = setTimeout(() => {
        this.log(`Force killing ${processId} (PID: ${metadata.pid})`);
        proc.kill('SIGKILL');
        resolve();
      }, 5000);

      proc.on('exit', () => {
        clearTimeout(timeout);
        this.processes.delete(processId);
        resolve();
      });

      // Send SIGTERM for graceful shutdown
      proc.kill('SIGTERM');
    });
  }

  /**
   * Check for orphaned processes
   */
  async checkOrphanedProcesses() {
    let orphanCount = 0;

    for (const [processId, metadata] of this.processes) {
      try {
        // Check if process is still running
        process.kill(metadata.pid, 0);
        orphanCount++;
        this.error(`Orphaned process detected: ${processId} (PID: ${metadata.pid})`);
      } catch (error) {
        // Process doesn't exist, which is good
      }
    }

    return orphanCount;
  }

  /**
   * Wait for a Redis key to exist
   */
  async waitForRedisKey(key, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const exists = await this.redis.exists(key);
      if (exists) {
        return true;
      }
      await this.sleep(100);
    }

    throw new Error(`Timeout waiting for Redis key: ${key}`);
  }

  /**
   * Clean up Redis test data
   */
  async cleanupRedis() {
    this.log('Cleaning up Redis test data...');

    const patterns = [
      'coordinator:*',
      'worker:*',
      'handoff:*',
      'test-task-*',
      'swarm:test-*',
    ];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
        this.debug(`Deleted ${keys.length} keys matching ${pattern}`);
      }
    }
  }

  /**
   * Get test metrics
   */
  getMetrics() {
    this.testEndTime = Date.now();

    return {
      ...this.metrics,
      cfnStartupTime: this.testStartTime ? Date.now() - this.testStartTime : 0,
      totalDuration: this.testEndTime - this.testStartTime,
      connections: Array.from(this.connections.values()),
      handoffs: Array.from(this.handoffs.values()),
      processes: Array.from(this.processes.entries()).map(([id, meta]) => ({
        id,
        type: meta.type,
        pid: meta.pid,
        uptime: Date.now() - meta.startTime,
      })),
    };
  }

  /**
   * Validate connection counts
   */
  validateConnections(expected) {
    const actual = this.metrics.cfnConnectionCount;
    const passed = actual === expected;

    return {
      passed,
      expected,
      actual,
      message: passed
        ? `✅ Connection count matches: ${actual}`
        : `❌ Connection count mismatch: expected ${expected}, got ${actual}`,
    };
  }

  /**
   * Validate handoff counts
   */
  validateHandoffs(expected) {
    const actual = this.metrics.cfnHandoffCount;
    const passed = actual === expected;

    return {
      passed,
      expected,
      actual,
      message: passed
        ? `✅ Handoff count matches: ${actual}`
        : `❌ Handoff count mismatch: expected ${expected}, got ${actual}`,
    };
  }

  /**
   * Validate no orphaned processes
   */
  validateCleanShutdown() {
    const orphans = this.metrics.cfnOrphanedProcesses;
    const passed = orphans === 0;

    return {
      passed,
      orphans,
      message: passed
        ? `✅ Clean shutdown: no orphaned processes`
        : `❌ Shutdown incomplete: ${orphans} orphaned processes`,
    };
  }

  // Utility methods

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  log(...args) {
    console.log(`[CFN-TEST]`, ...args);
  }

  debug(...args) {
    if (this.config.debug) {
      console.log(`[CFN-DEBUG]`, ...args);
    }
  }

  error(...args) {
    console.error(`[CFN-ERROR]`, ...args);
  }
}

export default CfnTestHarness;
