/**
 * Fleet Manager WASM Booster Integration
 *
 * Provides integration hooks between Fleet Manager and WASM Agent-Booster
 * for coordinated 52x performance acceleration across fleet operations.
 */

import WASMInstanceManager from './WASMInstanceManager.js';
import AgentBoosterWrapper from './AgentBoosterWrapper.js';
import { connectRedis } from '../cli/utils/redis-client.js';
import { EventEmitter } from 'events';

export class FleetBoosterIntegration extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      fleetId: config.fleetId || 'default-fleet',
      maxBoosterAgents: config.maxBoosterAgents || 50,
      redisKey: config.redisKey || 'fleet:booster',
      boosterPriority: config.boosterPriority || 'high',
      performanceTarget: config.performanceTarget || 52.0,
      ...config
    };

    this.boosterWrappers = new Map();
    this.taskQueue = [];
    this.redisClient = null;
    this.isInitialized = false;

    this.metrics = {
      totalBoosterTasks: 0,
      acceleratedTasks: 0,
      averageSpeedup: 0.0,
      boosterUtilization: 0.0
    };
  }

  /**
   * Initialize fleet-booster integration
   */
  async initialize() {
    try {
      console.log(`🚀 Initializing Fleet-Booster Integration for ${this.config.fleetId}`);

      // Connect to Redis
      this.redisClient = await connectRedis({
        host: 'localhost',
        port: 6379,
        database: 0
      });

      // Subscribe to fleet coordination events
      await this.subscribeToFleetEvents();

      // Initialize booster wrapper pool
      await this.initializeBoosterPool();

      this.isInitialized = true;
      console.log('✅ Fleet-Booster Integration initialized successfully');

      this.emit('initialized', {
        fleetId: this.config.fleetId,
        maxBoosterAgents: this.config.maxBoosterAgents
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Fleet-Booster Integration:', error);
      throw error;
    }
  }

  /**
   * Initialize booster wrapper pool
   */
  async initializeBoosterPool() {
    console.log(`📦 Initializing booster pool (max: ${this.config.maxBoosterAgents} agents)`);

    // Create booster wrapper for fleet
    const wrapper = new AgentBoosterWrapper({
      redisKey: `${this.config.redisKey}:${this.config.fleetId}`,
      wasm: {
        poolSize: 10,
        memoryLimit: 512,
        taskTimeout: 30000
      },
      fallbackEnabled: true,
      performanceTracking: true
    });

    await wrapper.initialize();

    this.boosterWrappers.set(this.config.fleetId, wrapper);

    console.log(`✅ Booster pool initialized for fleet ${this.config.fleetId}`);
  }

  /**
   * Subscribe to fleet coordination events
   */
  async subscribeToFleetEvents() {
    try {
      const subscriber = this.redisClient.duplicate();
      await subscriber.connect();

      // Subscribe to fleet task assignment events
      await subscriber.subscribe(`fleet:${this.config.fleetId}:tasks`, (message) => {
        try {
          const taskEvent = JSON.parse(message);
          this.handleFleetTask(taskEvent);
        } catch (error) {
          console.warn('⚠️ Failed to parse fleet task event:', error);
        }
      });

      // Subscribe to booster coordination events
      await subscriber.subscribe(`${this.config.redisKey}:coordination`, (message) => {
        try {
          const event = JSON.parse(message);
          this.handleBoosterEvent(event);
        } catch (error) {
          console.warn('⚠️ Failed to parse booster event:', error);
        }
      });

      console.log('📡 Subscribed to fleet coordination events');
    } catch (error) {
      console.warn('⚠️ Failed to subscribe to fleet events:', error);
    }
  }

  /**
   * Handle fleet task and determine if booster acceleration is needed
   */
  async handleFleetTask(taskEvent) {
    const { taskId, agentId, taskType, description, input, priority } = taskEvent;

    // Determine if task is suitable for booster acceleration
    const needsBooster = this.shouldAccelerate(taskType, input);

    if (needsBooster) {
      console.log(`⚡ Task ${taskId} eligible for booster acceleration`);

      // Route to booster
      await this.routeToBooster({
        taskId,
        agentId,
        taskType,
        description,
        input,
        priority
      });
    }

    this.emit('task.routed', {
      taskId,
      needsBooster,
      taskType
    });
  }

  /**
   * Determine if task should be accelerated with booster
   */
  shouldAccelerate(taskType, input) {
    const boosterTaskTypes = [
      'code-generation',
      'code-optimization',
      'performance-analysis',
      'ast-analysis',
      'file-processing',
      'batch-optimization'
    ];

    // Check if task type is suitable for acceleration
    if (!boosterTaskTypes.includes(taskType)) {
      return false;
    }

    // Check if input is large enough to benefit from acceleration
    if (input && input.code) {
      const codeSize = input.code.length;
      return codeSize > 100; // Minimum code size to benefit from acceleration
    }

    return true;
  }

  /**
   * Route task to booster for acceleration
   */
  async routeToBooster(taskRequest) {
    const wrapper = this.boosterWrappers.get(this.config.fleetId);
    if (!wrapper) {
      throw new Error('Booster wrapper not initialized');
    }

    try {
      console.log(`🚀 Routing task ${taskRequest.taskId} to booster`);

      const startTime = Date.now();

      // Execute task with booster acceleration
      const result = await wrapper.executeTask(taskRequest);

      const executionTime = Date.now() - startTime;

      // Update metrics
      this.metrics.totalBoosterTasks++;
      if (result.performanceMultiplier && result.performanceMultiplier >= this.config.performanceTarget) {
        this.metrics.acceleratedTasks++;
      }

      // Calculate average speedup
      const speedup = result.performanceMultiplier || 1.0;
      this.metrics.averageSpeedup =
        (this.metrics.averageSpeedup * (this.metrics.totalBoosterTasks - 1) + speedup) /
        this.metrics.totalBoosterTasks;

      console.log(`✅ Task ${taskRequest.taskId} completed with ${speedup.toFixed(1)}x speedup in ${executionTime}ms`);

      // Publish result back to fleet
      await this.publishTaskResult({
        taskId: taskRequest.taskId,
        result,
        executionTime,
        performanceMultiplier: speedup
      });

      return result;

    } catch (error) {
      console.error(`❌ Failed to execute booster task ${taskRequest.taskId}:`, error);

      // Publish error back to fleet
      await this.publishTaskError({
        taskId: taskRequest.taskId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Handle booster events
   */
  handleBoosterEvent(event) {
    const { type, timestamp, data } = event;

    switch (type) {
      case 'booster.allocated':
        console.log(`🔧 Booster allocated: instance ${data.instanceId}`);
        break;

      case 'booster.task.completed':
        console.log(`✅ Booster task completed: ${data.taskId}`);
        break;

      case 'booster.error':
        console.warn(`⚠️ Booster error: ${data.error}`);
        break;

      case 'booster.pool.updated':
        this.updateBoosterUtilization(data);
        break;

      default:
        console.log(`📡 Unknown booster event: ${type}`);
    }

    this.emit('booster.event', event);
  }

  /**
   * Update booster utilization metrics
   */
  updateBoosterUtilization(data) {
    const { availableInstances, poolSize } = data;
    this.metrics.boosterUtilization = ((poolSize - availableInstances) / poolSize) * 100;

    console.log(`📊 Booster utilization: ${this.metrics.boosterUtilization.toFixed(1)}%`);
  }

  /**
   * Publish task result back to fleet
   */
  async publishTaskResult(taskResult) {
    try {
      const event = {
        type: 'task.result',
        timestamp: Date.now(),
        data: taskResult
      };

      await this.redisClient.publish(
        `fleet:${this.config.fleetId}:results`,
        JSON.stringify(event)
      );

      console.log(`📤 Published result for task ${taskResult.taskId}`);
    } catch (error) {
      console.warn('⚠️ Failed to publish task result:', error);
    }
  }

  /**
   * Publish task error back to fleet
   */
  async publishTaskError(taskError) {
    try {
      const event = {
        type: 'task.error',
        timestamp: Date.now(),
        data: taskError
      };

      await this.redisClient.publish(
        `fleet:${this.config.fleetId}:errors`,
        JSON.stringify(event)
      );

      console.log(`📤 Published error for task ${taskError.taskId}`);
    } catch (error) {
      console.warn('⚠️ Failed to publish task error:', error);
    }
  }

  /**
   * Get integration status and metrics
   */
  getStatus() {
    const wrapperStatus = this.boosterWrappers.get(this.config.fleetId)?.getStatus();

    return {
      isInitialized: this.isInitialized,
      fleetId: this.config.fleetId,
      maxBoosterAgents: this.config.maxBoosterAgents,
      performanceTarget: this.config.performanceTarget,
      metrics: { ...this.metrics },
      boosterStatus: wrapperStatus || null,
      taskQueueSize: this.taskQueue.length
    };
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    const status = this.getStatus();

    return {
      fleetId: this.config.fleetId,
      performanceTarget: this.config.performanceTarget,
      metrics: {
        totalBoosterTasks: status.metrics.totalBoosterTasks,
        acceleratedTasks: status.metrics.acceleratedTasks,
        accelerationRate: status.metrics.totalBoosterTasks > 0
          ? (status.metrics.acceleratedTasks / status.metrics.totalBoosterTasks) * 100
          : 0,
        averageSpeedup: status.metrics.averageSpeedup,
        boosterUtilization: status.metrics.boosterUtilization
      },
      targetAchievement: {
        performanceTargetMet: status.metrics.averageSpeedup >= this.config.performanceTarget,
        accelerationRateGood: status.metrics.totalBoosterTasks > 0 &&
          (status.metrics.acceleratedTasks / status.metrics.totalBoosterTasks) >= 0.80
      },
      boosterPoolStatus: status.boosterStatus
    };
  }

  /**
   * Manually queue task for booster acceleration
   */
  async queueTask(taskRequest) {
    if (!this.isInitialized) {
      throw new Error('Fleet-Booster Integration not initialized');
    }

    // Add to queue
    this.taskQueue.push({
      ...taskRequest,
      queuedAt: Date.now()
    });

    console.log(`📥 Task ${taskRequest.taskId} queued for booster acceleration`);

    // Process queue
    await this.processQueue();
  }

  /**
   * Process task queue
   */
  async processQueue() {
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();

      try {
        await this.routeToBooster(task);
      } catch (error) {
        console.error(`❌ Failed to process queued task ${task.taskId}:`, error);
        // Re-queue task with delay
        setTimeout(() => {
          this.taskQueue.push(task);
        }, 5000);
      }
    }
  }

  /**
   * Gracefully shutdown integration
   */
  async shutdown() {
    console.log('🛑 Shutting down Fleet-Booster Integration');

    try {
      // Shutdown all booster wrappers
      for (const [fleetId, wrapper] of this.boosterWrappers) {
        await wrapper.shutdown();
        console.log(`  🧹 Shutdown booster wrapper for fleet ${fleetId}`);
      }

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      // Clear data
      this.boosterWrappers.clear();
      this.taskQueue = [];
      this.isInitialized = false;

      console.log('✅ Fleet-Booster Integration shutdown complete');

      this.emit('shutdown');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }
}

/**
 * Create fleet-booster integration for multiple fleets
 */
export class MultiFleetBoosterIntegration {
  constructor(config = {}) {
    this.fleetIntegrations = new Map();
    this.config = config;
  }

  /**
   * Add fleet integration
   */
  async addFleet(fleetId, fleetConfig = {}) {
    const integration = new FleetBoosterIntegration({
      fleetId,
      ...this.config,
      ...fleetConfig
    });

    await integration.initialize();

    this.fleetIntegrations.set(fleetId, integration);

    console.log(`✅ Added fleet-booster integration for ${fleetId}`);

    return integration;
  }

  /**
   * Get fleet integration
   */
  getFleet(fleetId) {
    return this.fleetIntegrations.get(fleetId);
  }

  /**
   * Get all fleet integrations
   */
  getAllFleets() {
    return Array.from(this.fleetIntegrations.entries()).map(([fleetId, integration]) => ({
      fleetId,
      status: integration.getStatus(),
      performance: integration.getPerformanceReport()
    }));
  }

  /**
   * Shutdown all fleet integrations
   */
  async shutdown() {
    console.log('🛑 Shutting down all fleet integrations');

    for (const [fleetId, integration] of this.fleetIntegrations) {
      await integration.shutdown();
      console.log(`  ✅ Shutdown integration for fleet ${fleetId}`);
    }

    this.fleetIntegrations.clear();

    console.log('✅ All fleet integrations shutdown complete');
  }
}

export default FleetBoosterIntegration;
