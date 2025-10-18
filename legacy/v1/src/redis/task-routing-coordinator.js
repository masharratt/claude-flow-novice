/**
 * Task Routing Coordinator - Integration of task routing and resource management
 * Phase 5 Agent-Booster Integration & Code Performance Acceleration
 */

const CodeTaskRouter = require('./code-task-router');
const WASMInstancePool = require('./wasm-instance-pool');
const WASMErrorHandler = require('./wasm-error-handler');
const Redis = require('ioredis');
const EventEmitter = require('events');

class TaskRoutingCoordinator extends EventEmitter {
  constructor(redisConfig) {
    super();
    this.redis = new Redis(redisConfig);

    // Initialize components
    this.taskRouter = new CodeTaskRouter(this.redis);
    this.wasmPool = new WASMInstancePool(this.redis);
    this.errorHandler = new WASMErrorHandler(this.redis);

    // Coordinator state
    this.activeTasks = new Map();
    this.routingStats = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      reroutedTasks: 0,
      avgTaskDuration: 0,
      wasmUtilization: 0
    };

    // Configuration
    this.config = {
      maxConcurrentTasks: 50,
      taskTimeout: 300000, // 5 minutes
      monitoringInterval: 30000, // 30 seconds
      coordinationChannel: 'swarm:phase-5:coordination',
      statsKey: 'swarm:phase-5:coordinator-stats'
    };

    this.initializeCoordinator();
  }

  async initializeCoordinator() {
    // Setup event handlers
    this.setupEventHandlers();

    // Setup Redis coordination
    await this.setupRedisCoordination();

    // Start monitoring
    this.startMonitoring();

    // Load previous state
    await this.loadCoordinatorState();

    console.log('🚀 TaskRoutingCoordinator initialized with integrated routing and pool management');
  }

  /**
   * Main task execution entry point
   */
  async executeTask(task) {
    const taskId = this.generateTaskId();
    const startTime = Date.now();

    try {
      // Validate task
      const validation = this.validateTask(task);
      if (!validation.valid) {
        throw new Error(`Invalid task: ${validation.reason}`);
      }

      // Check capacity
      if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
        throw new Error('Task queue at capacity');
      }

      // Register active task
      this.activeTasks.set(taskId, {
        id: taskId,
        task,
        status: 'routing',
        startTime,
        routingAttempts: 0,
        executionAttempts: 0
      });

      // Update statistics
      this.routingStats.totalTasks++;

      // Emit task start event
      await this.emitCoordinationEvent({
        type: 'task_started',
        taskId,
        task,
        timestamp: startTime
      });

      console.log(`📋 Executing task ${taskId}: ${task.type || 'unknown'}`);

      // Route and execute task
      const result = await this.routeAndExecuteTask(taskId, task);

      // Update task status
      const taskData = this.activeTasks.get(taskId);
      if (taskData) {
        taskData.status = result.success ? 'completed' : 'failed';
        taskData.endTime = Date.now();
        taskData.duration = taskData.endTime - startTime;
      }

      // Update statistics
      if (result.success) {
        this.routingStats.successfulTasks++;
      } else {
        this.routingStats.failedTasks++;
      }

      // Update average duration
      this.updateAverageDuration(taskData ? taskData.duration : 0);

      // Clean up
      this.activeTasks.delete(taskId);

      // Emit completion event
      await this.emitCoordinationEvent({
        type: 'task_completed',
        taskId,
        result,
        duration: taskData ? taskData.duration : 0,
        timestamp: Date.now()
      });

      console.log(`✅ Task ${taskId} ${result.success ? 'completed' : 'failed'} in ${taskData ? taskData.duration : 0}ms`);

      return {
        success: result.success,
        taskId,
        result: result.data,
        duration: taskData ? taskData.duration : 0,
        routing: result.routing,
        execution: result.execution
      };

    } catch (error) {
      console.error(`❌ Task execution failed for ${taskId}:`, error);

      // Handle task failure
      await this.handleTaskFailure(taskId, task, error);

      // Clean up
      this.activeTasks.delete(taskId);

      // Update statistics
      this.routingStats.failedTasks++;

      // Emit failure event
      await this.emitCoordinationEvent({
        type: 'task_failed',
        taskId,
        error: error.message,
        timestamp: Date.now()
      });

      return {
        success: false,
        taskId,
        error: error.message
      };
    }
  }

  /**
   * Route task to appropriate executor and execute
   */
  async routeAndExecuteTask(taskId, task) {
    const taskData = this.activeTasks.get(taskId);
    if (!taskData) {
      throw new Error(`Task ${taskId} not found`);
    }

    try {
      // Step 1: Route the task
      taskData.status = 'routing';
      const routingResult = await this.taskRouter.routeTask(task);

      if (!routingResult.success) {
        throw new Error(`Task routing failed: ${routingResult.error || 'Unknown error'}`);
      }

      console.log(`🎯 Task ${taskId} routed to ${routingResult.target.type}: ${routingResult.target.id}`);

      // Step 2: Execute based on target type
      taskData.status = 'executing';
      let executionResult;

      if (routingResult.target.type === 'wasm') {
        executionResult = await this.executeWasmTask(task, routingResult.target);
      } else {
        executionResult = await this.executeRegularTask(task, routingResult.target);
      }

      return {
        success: executionResult.success,
        data: executionResult.data,
        routing: routingResult,
        execution: executionResult
      };

    } catch (error) {
      console.error(`❌ Route and execute failed for task ${taskId}:`, error);

      // Attempt rerouting if appropriate
      if (taskData.routingAttempts < 3) {
        taskData.routingAttempts++;
        this.routingStats.reroutedTasks++;

        console.log(`🔄 Rerouting task ${taskId} (attempt ${taskData.routingAttempts})`);
        return await this.routeAndExecuteTask(taskId, task);
      }

      throw error;
    }
  }

  /**
   * Execute task using WASM instance
   */
  async executeWasmTask(task, target) {
    const startTime = Date.now();

    try {
      // Acquire WASM instance
      const acquireResult = await this.wasmPool.acquireInstance({
        fileType: task.filePath ? task.filePath.split('.').pop() : 'unknown',
        operationType: task.type || 'unknown',
        priority: task.priority || 'normal'
      });

      if (!acquireResult.success) {
        if (acquireResult.queued) {
          // Wait for instance and retry
          console.log(`⏳ Task queued for WASM instance, waiting...`);
          await this.sleep(5000);
          return await this.executeWasmTask(task, target);
        } else {
          throw new Error('Failed to acquire WASM instance');
        }
      }

      const instance = acquireResult.instance;
      console.log(`🔧 Acquired WASM instance: ${instance.id}`);

      try {
        // Execute task in WASM instance
        const executionResult = await this.executeInWasmInstance(instance, task);

        // Release instance
        await this.wasmPool.releaseInstance(instance.id, {
          success: executionResult.success,
          executionTime: Date.now() - startTime
        });

        return executionResult;

      } catch (executionError) {
        // Handle execution error with WASM error handler
        const errorResult = await this.errorHandler.handleError(executionError, {
          instanceId: instance.id,
          task,
          retryCallback: async () => await this.executeInWasmInstance(instance, task)
        });

        // Release instance even if execution failed
        await this.wasmPool.releaseInstance(instance.id, {
          success: false,
          executionTime: Date.now() - startTime,
          error: executionError.message
        });

        if (errorResult.fallback) {
          // Fallback to regular execution
          console.log(`🔄 WASM execution failed, falling back to regular execution`);
          return await this.executeRegularTask(task, target);
        }

        throw executionError;
      }

    } catch (error) {
      console.error('❌ WASM task execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute task in WASM instance
   */
  async executeInWasmInstance(instance, task) {
    try {
      // Simulate WASM execution
      // In a real implementation, this would interface with actual WASM modules
      console.log(`⚡ Executing in WASM instance ${instance.id}`);

      const executionTime = Math.random() * 2000 + 500; // 0.5-2.5 seconds
      await this.sleep(executionTime);

      // Simulate success/failure based on task complexity
      const successRate = this.calculateSuccessRate(task);
      const success = Math.random() < successRate;

      if (success) {
        return {
          success: true,
          data: {
            result: `WASM execution completed for ${task.type || 'task'}`,
            instanceId: instance.id,
            executionTime,
            performance: 'optimized'
          },
          executionTime
        };
      } else {
        throw new Error(`WASM execution failed: simulated processing error`);
      }

    } catch (error) {
      console.error(`❌ WASM instance execution failed:`, error);
      throw error;
    }
  }

  /**
   * Execute task using regular agent
   */
  async executeRegularTask(task, target) {
    try {
      console.log(`🤖 Executing task with regular agent: ${target.id}`);

      // Simulate regular agent execution
      const executionTime = Math.random() * 3000 + 1000; // 1-4 seconds
      await this.sleep(executionTime);

      return {
        success: true,
        data: {
          result: `Regular agent execution completed for ${task.type || 'task'}`,
          agentId: target.id,
          executionTime,
          performance: 'standard'
        },
        executionTime
      };

    } catch (error) {
      console.error(`❌ Regular agent execution failed:`, error);
      throw error;
    }
  }

  /**
   * Task validation
   */
  validateTask(task) {
    if (!task || typeof task !== 'object') {
      return { valid: false, reason: 'Task must be an object' };
    }

    if (!task.type && !task.operation) {
      return { valid: false, reason: 'Task must have type or operation' };
    }

    return { valid: true };
  }

  /**
   * Calculate success rate based on task characteristics
   */
  calculateSuccessRate(task) {
    let baseRate = 0.9; // 90% base success rate

    // Adjust based on task complexity
    if (task.complexity === 'critical') {
      baseRate -= 0.2;
    } else if (task.complexity === 'complex') {
      baseRate -= 0.1;
    }

    // Adjust based on operation type
    if (task.type === 'refactor' || task.type === 'optimize') {
      baseRate -= 0.05;
    }

    // Adjust based on file type (WASM-optimized files have higher success)
    if (task.filePath) {
      const ext = task.filePath.split('.').pop();
      if (['rs', 'cpp', 'c'].includes(ext)) {
        baseRate += 0.05;
      }
    }

    return Math.max(0.5, Math.min(0.95, baseRate));
  }

  /**
   * Handle task failure
   */
  async handleTaskFailure(taskId, task, error) {
    console.error(`💀 Handling task failure for ${taskId}:`, error);

    // Log failure for analysis
    await this.logTaskFailure(taskId, task, error);

    // Check if pattern indicates systemic issues
    await this.analyzeFailurePatterns(taskId, task, error);
  }

  async logTaskFailure(taskId, task, error) {
    const failureData = {
      taskId,
      task,
      error: error.message,
      stack: error.stack,
      timestamp: Date.now()
    };

    try {
      await this.redis.lpush('swarm:phase-5:task-failures', JSON.stringify(failureData));
      await this.redis.ltrim('swarm:phase-5:task-failures', 0, 999); // Keep last 1000 failures
    } catch (redisError) {
      console.error('Failed to log task failure:', redisError);
    }
  }

  async analyzeFailurePatterns(taskId, task, error) {
    try {
      const recentFailures = await this.redis.lrange('swarm:phase-5:task-failures', 0, 49);
      const similarFailures = recentFailures.filter(failure => {
        const data = JSON.parse(failure);
        return data.task.type === task.type || data.error === error.message;
      });

      // If similar failures exceed threshold, emit pattern alert
      if (similarFailures.length >= 5) {
        await this.emitCoordinationEvent({
          type: 'failure_pattern_detected',
          pattern: {
            taskType: task.type,
            error: error.message,
            count: similarFailures.length,
            timeframe: 'recent'
          },
          timestamp: Date.now()
        });
      }

    } catch (analysisError) {
      console.error('Failed to analyze failure patterns:', analysisError);
    }
  }

  /**
   * Setup event handlers between components
   */
  setupEventHandlers() {
    // Handle WASM pool status changes
    this.wasmPool.on('status_event', async (event) => {
      await this.emitCoordinationEvent({
        type: 'wasm_pool_status',
        data: event,
        timestamp: Date.now()
      });
    });

    // Handle routing events
    this.taskRouter.on('routing_event', async (event) => {
      await this.emitCoordinationEvent({
        type: 'routing_status',
        data: event,
        timestamp: Date.now()
      });
    });

    // Handle error recovery events
    this.errorHandler.on('recovery_event', async (event) => {
      await this.emitCoordinationEvent({
        type: 'error_recovery',
        data: event,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Redis coordination setup
   */
  async setupRedisCoordination() {
    // Subscribe to coordination channel
    this.coordinationSubscriber = new Redis();
    await this.coordinationSubscriber.subscribe(this.config.coordinationChannel);

    this.coordinationSubscriber.on('message', async (channel, message) => {
      if (channel === this.config.coordinationChannel) {
        await this.handleCoordinationEvent(JSON.parse(message));
      }
    });

    // Setup coordination commands
    await this.redis.defineCommand('taskStats', {
      numberOfKeys: 1,
      lua: `
        local statsKey = KEYS[1]
        local stats = redis.call('HGETALL', statsKey)
        return stats
      `
    });
  }

  async handleCoordinationEvent(event) {
    switch (event.type) {
      case 'system_status_request':
        await this.handleSystemStatusRequest(event);
        break;
      case 'config_update':
        await this.handleConfigUpdate(event);
        break;
      case 'emergency_shutdown':
        await this.handleEmergencyShutdown(event);
        break;
    }
  }

  async handleSystemStatusRequest(event) {
    const status = await this.getSystemStatus();

    await this.emitCoordinationEvent({
      type: 'system_status_response',
      requestId: event.requestId,
      status,
      timestamp: Date.now()
    });
  }

  async handleConfigUpdate(event) {
    this.config = { ...this.config, ...event.config };
    console.log('⚙️ Coordinator configuration updated');
  }

  async handleEmergencyShutdown(event) {
    console.log('🚨 Emergency shutdown initiated');
    await this.shutdown();
  }

  async emitCoordinationEvent(event) {
    try {
      await this.redis.publish(this.config.coordinationChannel, JSON.stringify(event));
    } catch (error) {
      console.error('Failed to emit coordination event:', error);
    }
  }

  /**
   * Monitoring and maintenance
   */
  startMonitoring() {
    setInterval(async () => {
      await this.performMonitoring();
    }, this.config.monitoringInterval);
  }

  async performMonitoring() {
    try {
      // Update WASM utilization
      const poolStats = await this.wasmPool.getPoolStats();
      this.routingStats.wasmUtilization = poolStats.utilization;

      // Check for stuck tasks
      await this.checkStuckTasks();

      // Update coordinator statistics
      await this.updateCoordinatorStats();

      // Emit monitoring event
      await this.emitCoordinationEvent({
        type: 'monitoring_update',
        stats: this.routingStats,
        activeTasks: this.activeTasks.size,
        poolStats,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Monitoring failed:', error);
    }
  }

  async checkStuckTasks() {
    const now = Date.now();
    const stuckThreshold = this.config.taskTimeout;

    for (const [taskId, taskData] of this.activeTasks.entries()) {
      if (now - taskData.startTime > stuckThreshold) {
        console.warn(`⚠️ Stuck task detected: ${taskId} (running for ${now - taskData.startTime}ms)`);

        await this.emitCoordinationEvent({
          type: 'stuck_task_detected',
          taskId,
          duration: now - taskData.startTime,
          timestamp: now
        });

        // Force cleanup of stuck task
        this.activeTasks.delete(taskId);
        this.routingStats.failedTasks++;
      }
    }
  }

  async updateCoordinatorStats() {
    try {
      const statsData = {
        ...this.routingStats,
        activeTasks: this.activeTasks.size,
        lastUpdated: Date.now()
      };

      await this.redis.hmset(this.config.statsKey, statsData);
      await this.redis.expire(this.config.statsKey, 3600); // 1 hour TTL

    } catch (error) {
      console.error('Failed to update coordinator stats:', error);
    }
  }

  updateAverageDuration(duration) {
    const totalTasks = this.routingStats.successfulTasks + this.routingStats.failedTasks;
    if (totalTasks === 1) {
      this.routingStats.avgTaskDuration = duration;
    } else {
      this.routingStats.avgTaskDuration =
        (this.routingStats.avgTaskDuration * (totalTasks - 1) + duration) / totalTasks;
    }
  }

  /**
   * System status and statistics
   */
  async getSystemStatus() {
    const poolStats = await this.wasmPool.getPoolStats();
    const routingStats = await this.taskRouter.getRoutingStats();
    const errorStats = await this.errorHandler.getErrorStats();

    return {
      coordinator: {
        activeTasks: this.activeTasks.size,
        maxConcurrentTasks: this.config.maxConcurrentTasks,
        totalTasks: this.routingStats.totalTasks,
        successRate: this.routingStats.totalTasks > 0 ?
          Math.round((this.routingStats.successfulTasks / this.routingStats.totalTasks) * 100) / 100 : 0
      },
      routing: routingStats,
      pool: poolStats,
      errors: errorStats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: Date.now()
    };
  }

  /**
   * Redis state management
   */
  async loadCoordinatorState() {
    try {
      const statsData = await this.redis.hgetall(this.config.statsKey);
      if (Object.keys(statsData).length > 0) {
        this.routingStats = { ...this.routingStats, ...statsData };
        console.log('📊 Coordinator state loaded from Redis');
      }
    } catch (error) {
      console.error('Failed to load coordinator state:', error);
    }
  }

  /**
   * Utility methods
   */
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down TaskRoutingCoordinator...');

    // Stop accepting new tasks
    this.config.maxConcurrentTasks = 0;

    // Wait for active tasks to complete (with timeout)
    if (this.activeTasks.size > 0) {
      console.log(`⏳ Waiting for ${this.activeTasks.size} active tasks to complete...`);

      const shutdownTimeout = setTimeout(() => {
        console.warn('⚠️ Shutdown timeout reached, forcing cleanup');
        this.activeTasks.clear();
      }, 30000); // 30 second timeout

      // Check every second for completion
      const checkInterval = setInterval(() => {
        if (this.activeTasks.size === 0) {
          clearTimeout(shutdownTimeout);
          clearInterval(checkInterval);
        }
      }, 1000);

      // Wait for either completion or timeout
      await new Promise(resolve => {
        setTimeout(resolve, 31000);
      });
    }

    // Shutdown components
    if (this.coordinationSubscriber) {
      await this.coordinationSubscriber.unsubscribe();
      await this.coordinationSubscriber.quit();
    }

    await this.taskRouter.shutdown();
    await this.wasmPool.shutdown();
    await this.errorHandler.shutdown();

    await this.updateCoordinatorStats();

    if (this.redis) {
      await this.redis.quit();
    }

    console.log('✅ TaskRoutingCoordinator shutdown complete');
  }
}

module.exports = TaskRoutingCoordinator;