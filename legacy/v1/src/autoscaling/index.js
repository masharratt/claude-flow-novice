/**
 * Auto-Scaling Engine Entry Point
 * Coordinates all auto-scaling components with Redis integration
 */

import DynamicPoolManager from './DynamicPoolManager.js';
import ResourceOptimizer from './ResourceOptimizer.js';
import PerformanceBenchmark from './PerformanceBenchmark.js';
import Redis from 'ioredis';
import EventEmitter from 'events';

class AutoScalingEngine extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      enabled: true,
      components: {
        poolManager: true,
        resourceOptimizer: true,
        performanceBenchmark: true
      },
      pool: {
        minSize: 5,
        maxSize: 200,
        initialSize: 10
      },
      scaling: {
        algorithm: 'hybrid',
        targetEfficiency: 0.40,
        targetUtilization: 0.85,
        targetResponseTime: 100
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD
      },
      ...config
    };

    this.redis = new Redis(this.config.redis);
    this.components = {};
    this.isRunning = false;
    this.startTime = null;

    // Engine metrics
    this.metrics = {
      uptime: 0,
      totalScaleEvents: 0,
      totalTasksProcessed: 0,
      currentEfficiency: 0,
      currentUtilization: 0
    };
  }

  /**
   * Initialize and start the auto-scaling engine
   */
  async start() {
    if (this.isRunning) {
      console.log('Auto-Scaling Engine is already running');
      return;
    }

    console.log('Starting Auto-Scaling Engine...');
    this.startTime = Date.now();

    try {
      // Initialize components
      if (this.config.components.poolManager) {
        this.components.poolManager = new DynamicPoolManager({
          pool: this.config.pool,
          scaling: this.config.scaling,
          redis: this.config.redis
        });

        this.components.poolManager.on('taskAssigned', (data) => {
          this.metrics.totalTasksProcessed++;
          this.emit('taskAssigned', data);
        });

        this.components.poolManager.on('scaleUp', (data) => {
          this.metrics.totalScaleEvents++;
          this.emit('scaleUp', data);
        });

        this.components.poolManager.on('scaleDown', (data) => {
          this.metrics.totalScaleEvents++;
          this.emit('scaleDown', data);
        });

        await this.components.poolManager.start();
      }

      if (this.config.components.resourceOptimizer) {
        this.components.resourceOptimizer = new ResourceOptimizer({
          scheduling: this.config.scaling,
          redis: this.config.redis
        });

        this.components.resourceOptimizer.on('taskAssigned', (data) => {
          this.emit('taskOptimized', data);
        });

        await this.components.resourceOptimizer.start();
      }

      if (this.config.components.performanceBenchmark) {
        this.components.performanceBenchmark = new PerformanceBenchmark({
          benchmarks: {
            efficiency: { target: this.config.scaling.targetEfficiency },
            utilization: { target: this.config.scaling.targetUtilization },
            responseTime: { target: this.config.scaling.targetResponseTime }
          },
          redis: this.config.redis
        });

        this.components.performanceBenchmark.on('benchmarkCycle', (data) => {
          this.metrics.currentEfficiency = data.results.efficiency;
          this.metrics.currentUtilization = data.results.utilization;
          this.emit('benchmarkUpdate', data);
        });

        await this.components.performanceBenchmark.start();
      }

      this.isRunning = true;
      console.log('Auto-Scaling Engine started successfully');

      // Subscribe to control commands
      await this.redis.subscribe('swarm:phase-2:engine-control');
      this.redis.on('message', async (channel, message) => {
        if (channel === 'swarm:phase-2:engine-control') {
          await this.handleControlCommand(message);
        }
      });

      // Publish engine started event
      await this.publishEvent('engine_started', {
        timestamp: Date.now(),
        config: this.config,
        components: Object.keys(this.components)
      });

      this.emit('started', { timestamp: Date.now() });

    } catch (error) {
      console.error('Failed to start Auto-Scaling Engine:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop the auto-scaling engine
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping Auto-Scaling Engine...');

    this.isRunning = false;

    try {
      // Stop all components
      const stopPromises = [];

      if (this.components.poolManager) {
        stopPromises.push(this.components.poolManager.stop());
      }

      if (this.components.resourceOptimizer) {
        stopPromises.push(this.components.resourceOptimizer.stop());
      }

      if (this.components.performanceBenchmark) {
        stopPromises.push(this.components.performanceBenchmark.stop());
      }

      await Promise.all(stopPromises);

      await this.redis.unsubscribe('swarm:phase-2:engine-control');

      // Generate final report
      const finalReport = await this.generateReport();

      await this.publishEvent('engine_stopped', {
        timestamp: Date.now(),
        uptime: this.getUptime(),
        metrics: this.metrics,
        report: finalReport
      });

      await this.redis.quit();

      this.emit('stopped', { timestamp: Date.now(), report: finalReport });

      console.log('Auto-Scaling Engine stopped');

    } catch (error) {
      console.error('Error stopping Auto-Scaling Engine:', error);
    }
  }

  /**
   * Submit a task to the auto-scaling system
   */
  async submitTask(task) {
    if (!this.isRunning) {
      throw new Error('Auto-Scaling Engine is not running');
    }

    try {
      let result;

      // Use resource optimizer if available, otherwise use pool manager
      if (this.components.resourceOptimizer) {
        result = await this.components.resourceOptimizer.assignTask(task);
      } else if (this.components.poolManager) {
        result = await this.components.poolManager.addAgent();
        result = { success: true, agentId: result };
      } else {
        throw new Error('No component available to handle task');
      }

      await this.publishEvent('task_submitted', {
        taskId: task.id,
        result,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      console.error('Task submission failed:', error);
      await this.publishEvent('task_submission_failed', {
        taskId: task.id,
        error: error.message,
        timestamp: Date.now()
      });

      throw error;
    }
  }

  /**
   * Force scaling actions
   */
  async forceScaleUp(count = 1) {
    if (!this.components.poolManager) {
      throw new Error('Pool Manager not available');
    }

    const result = await this.components.poolManager.forceScaleUp(count);
    await this.publishEvent('force_scale_up', { count, result });
    return result;
  }

  async forceScaleDown(count = 1) {
    if (!this.components.poolManager) {
      throw new Error('Pool Manager not available');
    }

    const result = await this.components.poolManager.forceScaleDown(count);
    await this.publishEvent('force_scale_down', { count, result });
    return result;
  }

  /**
   * Get comprehensive engine status
   */
  async getStatus() {
    const status = {
      isRunning: this.isRunning,
      uptime: this.getUptime(),
      metrics: this.metrics,
      components: {},
      config: this.config
    };

    // Get component-specific status
    if (this.components.poolManager) {
      status.components.poolManager = this.components.poolManager.getPoolStatus();
    }

    if (this.components.resourceOptimizer) {
      status.components.resourceOptimizer = this.components.resourceOptimizer.getMetrics();
    }

    if (this.components.performanceBenchmark) {
      status.components.performanceBenchmark = this.components.performanceBenchmark.getResults();
    }

    return status;
  }

  /**
   * Update engine configuration
   */
  async updateConfig(newConfig) {
    console.log('Updating Auto-Scaling Engine configuration...');

    this.config = { ...this.config, ...newConfig };

    // Update component configurations
    if (this.components.poolManager && newConfig.pool) {
      await this.components.poolManager.updateConfig({ pool: newConfig.pool });
    }

    if (this.components.resourceOptimizer && newConfig.scaling) {
      await this.components.resourceOptimizer.updateConfig(newConfig.scaling);
    }

    if (this.components.performanceBenchmark && newConfig.scaling) {
      // Performance benchmark updates would require restart in a real implementation
      console.log('Performance benchmark configuration updated (requires restart)');
    }

    await this.publishEvent('config_updated', {
      timestamp: Date.now(),
      config: this.config
    });

    this.emit('configUpdated', { config: this.config });
  }

  /**
   * Handle control commands from Redis
   */
  async handleControlCommand(message) {
    try {
      const command = JSON.parse(message);

      switch (command.action) {
        case 'get_status':
          await this.sendStatus(command.requestId);
          break;
        case 'submit_task':
          await this.submitTask(command.task);
          break;
        case 'force_scale_up':
          await this.forceScaleUp(command.count);
          break;
        case 'force_scale_down':
          await this.forceScaleDown(command.count);
          break;
        case 'update_config':
          await this.updateConfig(command.config);
          break;
        case 'restart':
          await this.restart();
          break;
        case 'stop':
          await this.stop();
          break;
        default:
          console.warn(`Unknown control command: ${command.action}`);
      }
    } catch (error) {
      console.error('Error handling control command:', error);
      await this.publishEvent('command_error', {
        error: error.message,
        command: message
      });
    }
  }

  /**
   * Send status response via Redis
   */
  async sendStatus(requestId) {
    const status = await this.getStatus();

    const response = {
      requestId,
      timestamp: Date.now(),
      status
    };

    await this.redis.publish('swarm:phase-2:engine-status', JSON.stringify(response));
  }

  /**
   * Restart the engine
   */
  async restart() {
    console.log('Restarting Auto-Scaling Engine...');
    await this.stop();
    await this.start();
  }

  /**
   * Generate comprehensive performance report
   */
  async generateReport() {
    const report = {
      timestamp: Date.now(),
      uptime: this.getUptime(),
      summary: {
        totalScaleEvents: this.metrics.totalScaleEvents,
        totalTasksProcessed: this.metrics.totalTasksProcessed,
        currentEfficiency: this.metrics.currentEfficiency,
        currentUtilization: this.metrics.currentUtilization
      },
      components: {}
    };

    // Collect component reports
    if (this.components.poolManager) {
      report.components.poolManager = this.components.poolManager.getPoolStatus();
    }

    if (this.components.resourceOptimizer) {
      report.components.resourceOptimizer = this.components.resourceOptimizer.getMetrics();
    }

    if (this.components.performanceBenchmark) {
      report.components.performanceBenchmark = await this.components.performanceBenchmark.generateReport();
    }

    return report;
  }

  /**
   * Get engine uptime
   */
  getUptime() {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  /**
   * Publish events to Redis
   */
  async publishEvent(eventType, data) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      data
    };

    try {
      await this.redis.publish('swarm:phase-2:engine', JSON.stringify(event));
    } catch (error) {
      console.error('Error publishing engine event:', error);
    }
  }

  /**
   * Create a new engine instance with default configuration
   */
  static create(config = {}) {
    return new AutoScalingEngine(config);
  }

  /**
   * Create engine optimized for development
   */
  static createDevelopment() {
    return new AutoScalingEngine({
      pool: {
        minSize: 2,
        maxSize: 10,
        initialSize: 3
      },
      scaling: {
        algorithm: 'reactive',
        checkInterval: 10000
      }
    });
  }

  /**
   * Create engine optimized for production
   */
  static createProduction() {
    return new AutoScalingEngine({
      pool: {
        minSize: 10,
        maxSize: 500,
        initialSize: 20
      },
      scaling: {
        algorithm: 'hybrid',
        checkInterval: 5000
      }
    });
  }
}

export default AutoScalingEngine;