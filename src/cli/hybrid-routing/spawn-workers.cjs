/**
 * Worker Spawner - CLI-Based Agent Spawning System
 *
 * Purpose: Spawns CLI-based agents for cost-effective task execution with
 * intelligent agent selection, Redis coordination, and lifecycle management.
 *
 * Features:
 * - Child process spawning via CLI
 * - Intelligent agent selection from registry
 * - Redis-based lifecycle tracking
 * - PID management and cleanup
 * - Error handling and retry logic
 * - Cost-savings mode support
 *
 * @module spawn-workers
 */

const { spawn } = require('child_process');
const { selectAgent } = require('./agent-use-case-registry.cjs');
const redis = require('redis');
const fs = require('fs');
const path = require('path');

// ============================================================================
// WORKER SPAWNER CLASS
// ============================================================================

class WorkerSpawner {
  /**
   * Initialize the Worker Spawner
   * @param {Object} options - Configuration options
   * @param {string} options.redisUrl - Redis connection URL
   * @param {number} options.defaultTimeout - Default task timeout (ms)
   * @param {boolean} options.enableRetry - Enable automatic retries
   * @param {number} options.maxRetries - Maximum retry attempts
   */
  constructor(options = {}) {
    this.activeWorkers = new Map(); // PID tracking: taskId -> workerInfo
    this.taskQueue = new Map(); // Pending tasks
    this.completedTasks = new Map(); // Task results cache

    // Configuration
    this.config = {
      redisUrl: options.redisUrl || 'redis://localhost:6379',
      defaultTimeout: options.defaultTimeout || 600000, // 10 minutes
      enableRetry: options.enableRetry !== false,
      maxRetries: options.maxRetries || 3,
      logDir: options.logDir || path.join(process.cwd(), '.logs', 'workers'),
      cliCommand: options.cliCommand || 'npx',
      cliArgs: options.cliArgs || ['claude']
    };

    // Initialize Redis client
    this.redisClient = null;
    this.redisReady = false;
    this.initializeRedis();

    // Ensure log directory exists
    this._ensureLogDirectory();

    // Cleanup on process exit
    this._setupCleanupHandlers();
  }

  /**
   * Initialize Redis connection
   * @private
   */
  async initializeRedis() {
    try {
      this.redisClient = redis.createClient({
        url: this.config.redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('[WorkerSpawner] Redis reconnection failed after 10 attempts');
              return new Error('Redis reconnection limit exceeded');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.redisClient.on('error', (err) => {
        console.error('[WorkerSpawner] Redis error:', err);
        this.redisReady = false;
      });

      this.redisClient.on('connect', () => {
        console.log('[WorkerSpawner] Redis connected');
        this.redisReady = true;
      });

      await this.redisClient.connect();
    } catch (error) {
      console.error('[WorkerSpawner] Failed to initialize Redis:', error);
      this.redisReady = false;
    }
  }

  /**
   * Ensure log directory exists
   * @private
   */
  _ensureLogDirectory() {
    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   * @private
   */
  _setupCleanupHandlers() {
    const cleanup = async () => {
      console.log('[WorkerSpawner] Cleaning up workers...');
      await this.shutdownAll();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', () => {
      // Synchronous cleanup only
      for (const [taskId, worker] of this.activeWorkers) {
        if (worker.process && !worker.process.killed) {
          worker.process.kill('SIGTERM');
        }
      }
    });
  }

  /**
   * Spawn a worker for a given task
   * @param {string} taskDescription - Task description for agent selection
   * @param {Object} options - Spawning options
   * @param {string} options.taskId - Custom task ID
   * @param {string} options.agentType - Force specific agent type
   * @param {string} options.mode - Execution mode (cli, api, hybrid)
   * @param {number} options.timeout - Task timeout in milliseconds
   * @param {Object} options.metadata - Additional metadata
   * @returns {Promise<Object>} Spawn result with taskId, pid, agentType
   */
  async spawnWorker(taskDescription, options = {}) {
    const taskId = options.taskId || this.generateTaskId();
    const mode = options.mode || 'cli';
    const timeout = options.timeout || this.config.defaultTimeout;

    try {
      // 1. Intelligent agent selection
      const agentType = options.agentType || selectAgent(taskDescription);

      if (!agentType) {
        throw new Error(`Unable to select agent for task: ${taskDescription}`);
      }

      console.log(`[WorkerSpawner] Task ${taskId}: Selected agent '${agentType}'`);

      // 2. Build CLI command arguments
      const args = this._buildCommandArgs(agentType, taskDescription, mode, options);

      // 3. Setup logging
      const logPath = path.join(this.config.logDir, `${taskId}.log`);
      const logStream = fs.createWriteStream(logPath, { flags: 'a' });

      // 4. Spawn worker process
      const workerProcess = spawn(this.config.cliCommand, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TASK_ID: taskId,
          AGENT_TYPE: agentType,
          EXECUTION_MODE: mode
        }
      });

      console.log(`[WorkerSpawner] Spawned worker PID ${workerProcess.pid} for task ${taskId}`);

      // 5. Track worker process
      const workerInfo = {
        taskId,
        pid: workerProcess.pid,
        agentType,
        taskDescription,
        mode,
        startTime: Date.now(),
        timeout,
        process: workerProcess,
        logPath,
        logStream,
        status: 'running',
        retries: 0,
        metadata: options.metadata || {}
      };

      this.activeWorkers.set(taskId, workerInfo);

      // 6. Setup process event handlers
      this._setupProcessHandlers(workerProcess, workerInfo);

      // 7. Redis coordination
      await this._registerWorkerInRedis(workerInfo);

      // 8. Setup timeout
      this._setupTimeout(workerInfo);

      return {
        taskId,
        pid: workerProcess.pid,
        agentType,
        logPath,
        status: 'spawned'
      };

    } catch (error) {
      console.error(`[WorkerSpawner] Failed to spawn worker for task ${taskId}:`, error);

      // Cleanup on failure
      this.activeWorkers.delete(taskId);

      throw error;
    }
  }

  /**
   * Build command arguments for CLI spawning
   * @private
   */
  _buildCommandArgs(agentType, taskDescription, mode, options) {
    const args = [...this.config.cliArgs];

    // Add agent specification
    args.push('--agent', agentType);

    // Add task description
    args.push('--task', taskDescription);

    // Add execution mode
    args.push('--mode', mode);

    // Add optional parameters
    if (options.context) {
      args.push('--context', JSON.stringify(options.context));
    }

    if (options.priority) {
      args.push('--priority', options.priority);
    }

    if (options.parentTaskId) {
      args.push('--parent-task', options.parentTaskId);
    }

    return args;
  }

  /**
   * Setup process event handlers
   * @private
   */
  _setupProcessHandlers(workerProcess, workerInfo) {
    const { taskId, logStream } = workerInfo;

    // Capture stdout
    workerProcess.stdout.on('data', (data) => {
      logStream.write(`[STDOUT] ${data}`);

      // Emit event for real-time monitoring
      this._emitWorkerEvent(taskId, 'stdout', data.toString());
    });

    // Capture stderr
    workerProcess.stderr.on('data', (data) => {
      logStream.write(`[STDERR] ${data}`);

      // Emit event for error monitoring
      this._emitWorkerEvent(taskId, 'stderr', data.toString());
    });

    // Handle process exit
    workerProcess.on('exit', async (code, signal) => {
      console.log(`[WorkerSpawner] Task ${taskId} exited with code ${code}, signal ${signal}`);

      workerInfo.status = code === 0 ? 'completed' : 'failed';
      workerInfo.exitCode = code;
      workerInfo.exitSignal = signal;
      workerInfo.endTime = Date.now();
      workerInfo.duration = workerInfo.endTime - workerInfo.startTime;

      // Close log stream
      logStream.end();

      // Update Redis
      await this._updateWorkerStatus(workerInfo);

      // Handle failure with retry
      if (code !== 0 && this.config.enableRetry && workerInfo.retries < this.config.maxRetries) {
        console.log(`[WorkerSpawner] Retrying task ${taskId} (attempt ${workerInfo.retries + 1}/${this.config.maxRetries})`);
        await this._retryTask(workerInfo);
      } else {
        // Move to completed tasks
        this.completedTasks.set(taskId, workerInfo);
        this.activeWorkers.delete(taskId);

        this._emitWorkerEvent(taskId, 'complete', {
          status: workerInfo.status,
          code,
          duration: workerInfo.duration
        });
      }
    });

    // Handle process errors
    workerProcess.on('error', async (err) => {
      console.error(`[WorkerSpawner] Task ${taskId} process error:`, err);

      workerInfo.status = 'error';
      workerInfo.error = err.message;

      await this._updateWorkerStatus(workerInfo);

      this._emitWorkerEvent(taskId, 'error', err);
    });
  }

  /**
   * Setup task timeout
   * @private
   */
  _setupTimeout(workerInfo) {
    const { taskId, timeout, process } = workerInfo;

    workerInfo.timeoutHandle = setTimeout(() => {
      console.warn(`[WorkerSpawner] Task ${taskId} timed out after ${timeout}ms`);

      workerInfo.status = 'timeout';

      // Kill the process
      if (!process.killed) {
        process.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000);
      }
    }, timeout);
  }

  /**
   * Register worker in Redis
   * @private
   */
  async _registerWorkerInRedis(workerInfo) {
    if (!this.redisReady) {
      console.warn('[WorkerSpawner] Redis not ready, skipping registration');
      return;
    }

    const { taskId, agentType, startTime, mode, taskDescription } = workerInfo;

    try {
      // Store worker metadata
      const key = `swarm:${taskId}:${agentType}:status`;
      const data = JSON.stringify({
        status: 'active',
        agentType,
        taskDescription,
        mode,
        startTime,
        pid: workerInfo.pid
      });

      await this.redisClient.set(key, data, {
        EX: 3600 // 1 hour expiration
      });

      // Add to active workers set
      await this.redisClient.sAdd(`swarm:active_workers`, taskId);

      // Publish spawn event
      await this.redisClient.publish('swarm:events', JSON.stringify({
        event: 'worker_spawned',
        taskId,
        agentType,
        timestamp: Date.now()
      }));

    } catch (error) {
      console.error('[WorkerSpawner] Redis registration error:', error);
    }
  }

  /**
   * Update worker status in Redis
   * @private
   */
  async _updateWorkerStatus(workerInfo) {
    if (!this.redisReady) return;

    const { taskId, agentType, status, exitCode, duration } = workerInfo;

    try {
      const key = `swarm:${taskId}:${agentType}:status`;
      const data = JSON.stringify({
        status,
        agentType,
        exitCode,
        duration,
        endTime: workerInfo.endTime
      });

      await this.redisClient.set(key, data, { EX: 3600 });

      // Remove from active workers if completed
      if (status !== 'running') {
        await this.redisClient.sRem(`swarm:active_workers`, taskId);
      }

      // Publish status event
      await this.redisClient.publish('swarm:events', JSON.stringify({
        event: 'worker_status_change',
        taskId,
        agentType,
        status,
        timestamp: Date.now()
      }));

    } catch (error) {
      console.error('[WorkerSpawner] Redis status update error:', error);
    }
  }

  /**
   * Retry a failed task
   * @private
   */
  async _retryTask(workerInfo) {
    const { taskDescription, agentType, mode, metadata, taskId } = workerInfo;

    // Increment retry counter
    workerInfo.retries += 1;

    // Remove old worker
    this.activeWorkers.delete(taskId);

    // Spawn new worker with same task ID
    try {
      await this.spawnWorker(taskDescription, {
        taskId,
        agentType,
        mode,
        metadata: {
          ...metadata,
          retryAttempt: workerInfo.retries,
          previousAttempts: (metadata.previousAttempts || []).concat({
            exitCode: workerInfo.exitCode,
            duration: workerInfo.duration
          })
        }
      });
    } catch (error) {
      console.error(`[WorkerSpawner] Retry failed for task ${taskId}:`, error);

      // Mark as permanently failed
      workerInfo.status = 'failed_permanent';
      this.completedTasks.set(taskId, workerInfo);
    }
  }

  /**
   * Emit worker event (extensible for monitoring)
   * @private
   */
  _emitWorkerEvent(taskId, event, data) {
    // Can be extended with EventEmitter or custom event system
    // For now, just log
    console.debug(`[WorkerEvent] ${taskId} - ${event}`, data);
  }

  /**
   * Generate unique task ID
   * @private
   */
  generateTaskId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `task-${timestamp}-${random}`;
  }

  /**
   * Get worker status
   * @param {string} taskId - Task ID to check
   * @returns {Object|null} Worker info or null
   */
  getWorkerStatus(taskId) {
    return this.activeWorkers.get(taskId) || this.completedTasks.get(taskId) || null;
  }

  /**
   * Get all active workers
   * @returns {Array<Object>} Array of active worker info
   */
  getActiveWorkers() {
    return Array.from(this.activeWorkers.values());
  }

  /**
   * Get completed tasks
   * @returns {Array<Object>} Array of completed task info
   */
  getCompletedTasks() {
    return Array.from(this.completedTasks.values());
  }

  /**
   * Kill a specific worker
   * @param {string} taskId - Task ID to kill
   * @param {string} signal - Kill signal (default: SIGTERM)
   * @returns {boolean} Success status
   */
  async killWorker(taskId, signal = 'SIGTERM') {
    const worker = this.activeWorkers.get(taskId);

    if (!worker) {
      console.warn(`[WorkerSpawner] Task ${taskId} not found`);
      return false;
    }

    if (worker.process && !worker.process.killed) {
      console.log(`[WorkerSpawner] Killing task ${taskId} with signal ${signal}`);
      worker.process.kill(signal);

      // Clear timeout
      if (worker.timeoutHandle) {
        clearTimeout(worker.timeoutHandle);
      }

      return true;
    }

    return false;
  }

  /**
   * Shutdown all workers gracefully
   * @param {number} timeout - Grace period before force kill (ms)
   * @returns {Promise<void>}
   */
  async shutdownAll(timeout = 10000) {
    console.log(`[WorkerSpawner] Shutting down ${this.activeWorkers.size} workers...`);

    const shutdownPromises = [];

    for (const [taskId, worker] of this.activeWorkers) {
      if (worker.process && !worker.process.killed) {
        worker.process.kill('SIGTERM');

        // Create promise to wait for exit
        const exitPromise = new Promise((resolve) => {
          const onExit = () => {
            resolve();
          };
          worker.process.once('exit', onExit);

          // Force kill after timeout
          setTimeout(() => {
            if (!worker.process.killed) {
              console.warn(`[WorkerSpawner] Force killing task ${taskId}`);
              worker.process.kill('SIGKILL');
            }
            resolve();
          }, timeout);
        });

        shutdownPromises.push(exitPromise);
      }
    }

    await Promise.all(shutdownPromises);

    // Close Redis connection
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    console.log('[WorkerSpawner] Shutdown complete');
  }

  /**
   * Get worker statistics
   * @returns {Object} Statistics object
   */
  getStatistics() {
    const active = this.activeWorkers.size;
    const completed = this.completedTasks.size;
    const completedList = Array.from(this.completedTasks.values());

    const successful = completedList.filter(w => w.status === 'completed').length;
    const failed = completedList.filter(w => w.status === 'failed').length;
    const timedOut = completedList.filter(w => w.status === 'timeout').length;

    const avgDuration = completedList.length > 0
      ? completedList.reduce((sum, w) => sum + (w.duration || 0), 0) / completedList.length
      : 0;

    return {
      active,
      completed,
      successful,
      failed,
      timedOut,
      avgDuration: Math.round(avgDuration),
      successRate: completed > 0 ? (successful / completed * 100).toFixed(2) + '%' : 'N/A'
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  WorkerSpawner
};

// ============================================================================
// CLI USAGE (if run directly)
// ============================================================================

if (require.main === module) {
  const spawner = new WorkerSpawner();

  const taskDescription = process.argv[2] || 'Create a simple REST API endpoint';
  const mode = process.argv[3] || 'cli';

  console.log(`Spawning worker for: "${taskDescription}" in ${mode} mode`);

  spawner.spawnWorker(taskDescription, { mode })
    .then((result) => {
      console.log('Worker spawned:', result);

      // Monitor for 30 seconds then exit
      setTimeout(async () => {
        const stats = spawner.getStatistics();
        console.log('Statistics:', stats);
        await spawner.shutdownAll();
      }, 30000);
    })
    .catch((error) => {
      console.error('Spawn failed:', error);
      process.exit(1);
    });
}
