/**
 * WASM Instance Pool - Dynamic pool management for booster instances
 * Phase 5 Agent-Booster Integration & Code Performance Acceleration
 */

const Redis = require('ioredis');
const EventEmitter = require('events');

class WASMInstancePool extends EventEmitter {
  constructor(redisClient) {
    super();
    this.redis = redisClient || new Redis();
    this.instances = new Map();
    this.pendingRequests = [];

    // Pool configuration
    this.config = {
      minPoolSize: 2,
      maxPoolSize: 20,
      scaleUpThreshold: 0.8,  // 80% utilization
      scaleDownThreshold: 0.3, // 30% utilization
      healthCheckInterval: 30000, // 30 seconds
      scalingCooldown: 60000, // 1 minute
      instanceTimeout: 300000, // 5 minutes
      memoryKey: 'swarm:phase-5:wasm-pool',
      statusChannel: 'swarm:phase-5:wasm-status'
    };

    // Pool statistics
    this.stats = {
      totalCreated: 0,
      totalDestroyed: 0,
      activeInstances: 0,
      avgUtilization: 0,
      lastScalingAction: 0,
      scalingEvents: []
    };

    this.initializePool();
  }

  async initializePool() {
    // Load existing pool state from Redis
    await this.loadPoolState();

    // Initialize Redis pub/sub for status events
    this.statusSubscriber = new Redis();
    await this.statusSubscriber.subscribe(this.config.statusChannel);

    this.statusSubscriber.on('message', async (channel, message) => {
      if (channel === this.config.statusChannel) {
        await this.handleStatusEvent(JSON.parse(message));
      }
    });

    // Ensure minimum pool size
    await this.ensureMinPoolSize();

    // Start monitoring and auto-scaling
    this.startMonitoring();

    console.log(`🚀 WASMInstancePool initialized (min: ${this.config.minPoolSize}, max: ${this.config.maxPoolSize})`);
  }

  /**
   * Acquire a WASM instance for task execution
   */
  async acquireInstance(requirements = {}) {
    const startTime = Date.now();

    try {
      // Find best available instance
      const instance = await this.findBestInstance(requirements);

      if (instance) {
        await this.markInstanceBusy(instance.id);

        return {
          success: true,
          instance,
          acquireTime: Date.now() - startTime
        };
      }

      // No available instance, try to scale up
      if (await this.shouldScaleUp()) {
        const newInstance = await this.scaleUp();

        if (newInstance) {
          await this.markInstanceBusy(newInstance.id);

          return {
            success: true,
            instance: newInstance,
            acquireTime: Date.now() - startTime
          };
        }
      }

      // Add to pending queue if pool at capacity
      const requestId = this.generateRequestId();
      this.pendingRequests.push({
        id: requestId,
        requirements,
        timestamp: Date.now(),
        callback: null
      });

      await this.emitStatusEvent({
        type: 'instance_queued',
        requestId,
        requirements,
        queueLength: this.pendingRequests.length,
        timestamp: Date.now()
      });

      return {
        success: false,
        queued: true,
        requestId,
        queuePosition: this.pendingRequests.length,
        acquireTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('❌ Failed to acquire WASM instance:', error);
      throw error;
    }
  }

  /**
   * Release a WASM instance back to the pool
   */
  async releaseInstance(instanceId, performance = {}) {
    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        console.warn(`⚠️ Instance ${instanceId} not found in pool`);
        return;
      }

      // Update instance performance metrics
      this.updateInstancePerformance(instanceId, performance);

      // Mark instance as available
      await this.markInstanceAvailable(instanceId);

      // Process pending requests
      await this.processPendingRequests();

      // Check if we should scale down
      await this.checkScaleDown();

      await this.emitStatusEvent({
        type: 'instance_released',
        instanceId,
        performance,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('❌ Failed to release instance:', error);
    }
  }

  /**
   * Find the best available instance based on requirements
   */
  async findBestInstance(requirements) {
    const availableInstances = Array.from(this.instances.values())
      .filter(instance => instance.status === 'available' && instance.healthy);

    if (availableInstances.length === 0) {
      return null;
    }

    // Score instances based on various factors
    let bestInstance = null;
    let bestScore = -1;

    for (const instance of availableInstances) {
      const score = this.scoreInstance(instance, requirements);
      if (score > bestScore) {
        bestScore = score;
        bestInstance = instance;
      }
    }

    return bestInstance;
  }

  scoreInstance(instance, requirements) {
    let score = 0;

    // Base score for being available
    score += 50;

    // Performance score
    if (instance.performance) {
      if (instance.performance.avgExecutionTime) {
        score += Math.max(0, 50 - instance.performance.avgExecutionTime / 100);
      }
      if (instance.performance.successRate) {
        score += instance.performance.successRate * 30;
      }
    }

    // Load score (prefer less loaded instances)
    const loadRatio = instance.currentTasks / instance.maxConcurrentTasks;
    score += (1 - loadRatio) * 20;

    // Specialization score
    if (requirements.fileType && instance.specializations) {
      if (instance.specializations.includes(requirements.fileType)) {
        score += 25;
      }
    }

    // Recency score (prefer recently used instances)
    const timeSinceLastUse = Date.now() - (instance.lastUsed || 0);
    if (timeSinceLastUse < 300000) { // 5 minutes
      score += 10;
    }

    return score;
  }

  /**
   * Scale up the pool by creating new instances
   */
  async scaleUp() {
    const now = Date.now();

    // Check cooldown period
    if (now - this.stats.lastScalingAction < this.config.scalingCooldown) {
      console.log('⏳ Scaling action in cooldown period');
      return null;
    }

    if (this.instances.size >= this.config.maxPoolSize) {
      console.log('📊 Pool at maximum capacity');
      return null;
    }

    try {
      const instanceId = this.generateInstanceId();
      const instance = await this.createWasmInstance(instanceId);

      if (instance) {
        this.instances.set(instanceId, instance);
        this.stats.totalCreated++;
        this.stats.activeInstances++;
        this.stats.lastScalingAction = now;

        this.stats.scalingEvents.push({
          type: 'scale_up',
          instanceId,
          poolSize: this.instances.size,
          timestamp: now
        });

        await this.savePoolState();

        await this.emitStatusEvent({
          type: 'pool_scaled_up',
          instanceId,
          poolSize: this.instances.size,
          timestamp: now
        });

        console.log(`📈 Pool scaled up - new instance: ${instanceId}`);
        return instance;
      }

    } catch (error) {
      console.error('❌ Failed to scale up pool:', error);
    }

    return null;
  }

  /**
   * Scale down the pool by removing idle instances
   */
  async scaleDown() {
    const now = Date.now();

    // Check cooldown period
    if (now - this.stats.lastScalingAction < this.config.scalingCooldown) {
      return;
    }

    // Don't scale below minimum pool size
    if (this.instances.size <= this.config.minPoolSize) {
      return;
    }

    // Find candidates for removal
    const candidates = Array.from(this.instances.values())
      .filter(instance =>
        instance.status === 'available' &&
        instance.healthy &&
        !instance.essential &&
        (now - (instance.lastUsed || 0)) > this.config.instanceTimeout
      )
      .sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));

    if (candidates.length === 0) {
      return;
    }

    // Remove the most idle instance
    const instanceToRemove = candidates[0];
    await this.removeInstance(instanceToRemove.id);

    this.stats.totalDestroyed++;
    this.stats.activeInstances--;
    this.stats.lastScalingAction = now;

    this.stats.scalingEvents.push({
      type: 'scale_down',
      instanceId: instanceToRemove.id,
      poolSize: this.instances.size,
      timestamp: now
    });

    await this.savePoolState();

    await this.emitStatusEvent({
      type: 'pool_scaled_down',
      instanceId: instanceToRemove.id,
      poolSize: this.instances.size,
      timestamp: now
    });

    console.log(`📉 Pool scaled down - removed instance: ${instanceToRemove.id}`);
  }

  /**
   * Create a new WASM instance
   */
  async createWasmInstance(instanceId) {
    try {
      // In a real implementation, this would spawn a WASM process
      // For now, we'll simulate instance creation
      const instance = {
        id: instanceId,
        status: 'initializing',
        healthy: false,
        currentTasks: 0,
        maxConcurrentTasks: 5,
        specializations: this.getRandomSpecializations(),
        performance: {
          avgExecutionTime: 0,
          successRate: 1.0,
          totalTasks: 0,
          failedTasks: 0
        },
        createdAt: Date.now(),
        lastUsed: null,
        essential: false, // Mark if this is essential for min pool size
        memory: {
          allocated: 128, // MB
          used: 0
        },
        cpu: {
          usage: 0
        }
      };

      // Initialize the instance (simulated)
      await this.initializeWasmInstance(instance);

      console.log(`🔧 Created WASM instance: ${instanceId}`);
      return instance;

    } catch (error) {
      console.error('❌ Failed to create WASM instance:', error);
      return null;
    }
  }

  async initializeWasmInstance(instance) {
    // Simulate instance initialization
    await new Promise(resolve => setTimeout(resolve, 1000));

    instance.status = 'available';
    instance.healthy = true;
    instance.essential = this.instances.size < this.config.minPoolSize;

    await this.emitStatusEvent({
      type: 'instance_initialized',
      instanceId: instance.id,
      specializations: instance.specializations,
      timestamp: Date.now()
    });
  }

  getRandomSpecializations() {
    const allSpecializations = ['js', 'ts', 'rust', 'cpp', 'python', 'go', 'java'];
    const count = Math.floor(Math.random() * 3) + 1; // 1-3 specializations
    const shuffled = allSpecializations.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Remove an instance from the pool
   */
  async removeInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    // Ensure instance is not busy
    if (instance.status === 'busy') {
      console.warn(`⚠️ Cannot remove busy instance: ${instanceId}`);
      return;
    }

    // Cleanup instance resources
    await this.cleanupInstance(instance);

    this.instances.delete(instanceId);

    await this.emitStatusEvent({
      type: 'instance_removed',
      instanceId,
      timestamp: Date.now()
    });
  }

  async cleanupInstance(instance) {
    // In a real implementation, this would cleanup WASM process
    console.log(`🧹 Cleaning up instance: ${instance.id}`);
  }

  /**
   * Check if pool should scale up
   */
  async shouldScaleUp() {
    const utilization = this.calculateUtilization();
    return utilization > this.config.scaleUpThreshold &&
           this.instances.size < this.config.maxPoolSize &&
           this.canScaleUp();
  }

  /**
   * Check if pool should scale down
   */
  async checkScaleDown() {
    const utilization = this.calculateUtilization();
    if (utilization < this.config.scaleDownThreshold &&
        this.instances.size > this.config.minPoolSize &&
        this.canScaleDown()) {
      await this.scaleDown();
    }
  }

  calculateUtilization() {
    if (this.instances.size === 0) return 0;

    let totalCapacity = 0;
    let usedCapacity = 0;

    for (const instance of this.instances.values()) {
      totalCapacity += instance.maxConcurrentTasks;
      usedCapacity += instance.currentTasks;
    }

    return totalCapacity > 0 ? usedCapacity / totalCapacity : 0;
  }

  canScaleUp() {
    const now = Date.now();
    return now - this.stats.lastScalingAction >= this.config.scalingCooldown;
  }

  canScaleDown() {
    const now = Date.now();
    return now - this.stats.lastScalingAction >= this.config.scalingCooldown;
  }

  /**
   * Process pending requests in queue
   */
  async processPendingRequests() {
    while (this.pendingRequests.length > 0) {
      const request = this.pendingRequests[0];

      const instance = await this.findBestInstance(request.requirements);
      if (instance) {
        // Remove from queue
        this.pendingRequests.shift();

        // Mark instance as busy
        await this.markInstanceBusy(instance.id);

        // Resolve request
        if (request.callback) {
          request.callback({
            success: true,
            instance,
            requestId: request.id
          });
        }

        await this.emitStatusEvent({
          type: 'request_dequeued',
          requestId: request.id,
          instanceId: instance.id,
          queueLength: this.pendingRequests.length,
          timestamp: Date.now()
        });
      } else {
        break; // No available instances
      }
    }
  }

  /**
   * Instance status management
   */
  async markInstanceBusy(instanceId) {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = 'busy';
      instance.currentTasks++;
      instance.lastUsed = Date.now();
      await this.savePoolState();
    }
  }

  async markInstanceAvailable(instanceId) {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = 'available';
      instance.currentTasks = Math.max(0, instance.currentTasks - 1);
      instance.lastUsed = Date.now();
      await this.savePoolState();
    }
  }

  /**
   * Update instance performance metrics
   */
  updateInstancePerformance(instanceId, performance) {
    const instance = this.instances.get(instanceId);
    if (!instance || !performance) return;

    instance.performance.totalTasks++;

    if (performance.success) {
      // Update average execution time
      const newTime = performance.executionTime || 0;
      const totalTime = instance.performance.avgExecutionTime * (instance.performance.totalTasks - 1);
      instance.performance.avgExecutionTime = (totalTime + newTime) / instance.performance.totalTasks;
    } else {
      instance.performance.failedTasks++;
    }

    // Update success rate
    instance.performance.successRate =
      (instance.performance.totalTasks - instance.performance.failedTasks) / instance.performance.totalTasks;
  }

  /**
   * Ensure minimum pool size
   */
  async ensureMinPoolSize() {
    const currentSize = this.instances.size;
    const needed = this.config.minPoolSize - currentSize;

    if (needed > 0) {
      console.log(`📊 Ensuring minimum pool size: creating ${needed} instances`);

      for (let i = 0; i < needed; i++) {
        const instanceId = this.generateInstanceId();
        const instance = await this.createWasmInstance(instanceId);

        if (instance) {
          this.instances.set(instanceId, instance);
          this.stats.totalCreated++;
        }
      }

      this.stats.activeInstances = this.instances.size;
      await this.savePoolState();
    }
  }

  /**
   * Health monitoring and maintenance
   */
  startMonitoring() {
    // Health check interval
    setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // Utilization monitoring
    setInterval(async () => {
      await this.monitorUtilization();
    }, 60000); // Every minute
  }

  async performHealthCheck() {
    const now = Date.now();

    for (const [instanceId, instance] of this.instances.entries()) {
      try {
        // Check if instance is responsive
        const isHealthy = await this.pingInstance(instance);

        if (!isHealthy && instance.healthy) {
          console.warn(`⚠️ Instance ${instanceId} marked as unhealthy`);
          instance.healthy = false;

          await this.emitStatusEvent({
            type: 'instance_unhealthy',
            instanceId,
            timestamp: now
          });
        } else if (isHealthy && !instance.healthy) {
          console.log(`✅ Instance ${instanceId} recovered`);
          instance.healthy = true;

          await this.emitStatusEvent({
            type: 'instance_recovered',
            instanceId,
            timestamp: now
          });
        }

        // Check for zombie instances (busy for too long)
        if (instance.status === 'busy' && instance.lastUsed) {
          const busyTime = now - instance.lastUsed;
          if (busyTime > 300000) { // 5 minutes
            console.warn(`⚠️ Zombie instance detected: ${instanceId}`);
            await this.handleZombieInstance(instanceId);
          }
        }

      } catch (error) {
        console.error(`❌ Health check failed for instance ${instanceId}:`, error);
        instance.healthy = false;
      }
    }

    await this.savePoolState();
  }

  async pingInstance(instance) {
    // Simulate health check - in real implementation would ping WASM process
    return instance.status !== 'failed' && Math.random() > 0.05; // 95% uptime simulation
  }

  async handleZombieInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (instance) {
      console.log(`🔄 Resetting zombie instance: ${instanceId}`);
      instance.status = 'available';
      instance.currentTasks = 0;
      instance.lastUsed = Date.now();

      await this.emitStatusEvent({
        type: 'instance_reset',
        instanceId,
        timestamp: Date.now()
      });
    }
  }

  async monitorUtilization() {
    const utilization = this.calculateUtilization();
    this.stats.avgUtilization = utilization;

    // Auto-scaling based on utilization
    if (utilization > this.config.scaleUpThreshold) {
      await this.scaleUp();
    } else if (utilization < this.config.scaleDownThreshold) {
      await this.checkScaleDown();
    }

    await this.emitStatusEvent({
      type: 'utilization_update',
      utilization,
      poolSize: this.instances.size,
      timestamp: Date.now()
    });
  }

  /**
   * Redis coordination methods
   */
  async loadPoolState() {
    try {
      const poolData = await this.redis.get(this.config.memoryKey);
      if (poolData) {
        const data = JSON.parse(poolData);

        // Restore instances
        if (data.instances) {
          this.instances = new Map(Object.entries(data.instances));
        }

        // Restore stats
        if (data.stats) {
          this.stats = { ...this.stats, ...data.stats };
        }

        console.log('📊 WASM pool state loaded from Redis');
      }
    } catch (error) {
      console.error('Failed to load pool state:', error);
    }
  }

  async savePoolState() {
    try {
      const data = {
        instances: Object.fromEntries(this.instances),
        stats: this.stats,
        pendingRequests: this.pendingRequests,
        lastUpdated: Date.now()
      };

      await this.redis.setex(this.config.memoryKey, 3600, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save pool state:', error);
    }
  }

  async emitStatusEvent(event) {
    try {
      await this.redis.publish(this.config.statusChannel, JSON.stringify(event));
    } catch (error) {
      console.error('Failed to emit status event:', error);
    }
  }

  async handleStatusEvent(event) {
    switch (event.type) {
      case 'instance_requested':
        // Handle external instance requests
        break;
      case 'pool_config_update':
        // Handle configuration updates
        await this.updateConfiguration(event.config);
        break;
    }
  }

  async updateConfiguration(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ Pool configuration updated');

    // Ensure pool respects new min/max sizes
    await this.ensureMinPoolSize();

    if (this.instances.size > this.config.maxPoolSize) {
      await this.scaleDownToMaxSize();
    }
  }

  async scaleDownToMaxSize() {
    while (this.instances.size > this.config.maxPoolSize) {
      const candidates = Array.from(this.instances.values())
        .filter(instance => instance.status === 'available' && !instance.essential)
        .sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));

      if (candidates.length > 0) {
        await this.removeInstance(candidates[0].id);
      } else {
        break;
      }
    }
  }

  /**
   * Utility methods
   */
  generateInstanceId() {
    return `wasm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get pool statistics
   */
  async getPoolStats() {
    const utilization = this.calculateUtilization();
    const healthyInstances = Array.from(this.instances.values())
      .filter(instance => instance.healthy).length;

    return {
      poolSize: this.instances.size,
      minPoolSize: this.config.minPoolSize,
      maxPoolSize: this.config.maxPoolSize,
      utilization: Math.round(utilization * 100) / 100,
      healthyInstances,
      busyInstances: Array.from(this.instances.values())
        .filter(instance => instance.status === 'busy').length,
      pendingRequests: this.pendingRequests.length,
      totalCreated: this.stats.totalCreated,
      totalDestroyed: this.stats.totalDestroyed,
      avgUtilization: Math.round(this.stats.avgUtilization * 100) / 100,
      lastScalingAction: this.stats.lastScalingAction,
      scalingEvents: this.stats.scalingEvents.slice(-10) // Last 10 events
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down WASMInstancePool...');

    if (this.statusSubscriber) {
      await this.statusSubscriber.unsubscribe();
      await this.statusSubscriber.quit();
    }

    // Wait for all instances to finish their tasks
    const busyInstances = Array.from(this.instances.values())
      .filter(instance => instance.status === 'busy');

    if (busyInstances.length > 0) {
      console.log(`⏳ Waiting for ${busyInstances.length} instances to complete...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Cleanup all instances
    for (const [instanceId, instance] of this.instances.entries()) {
      await this.cleanupInstance(instance);
    }

    await this.savePoolState();

    if (this.redis) {
      await this.redis.quit();
    }

    console.log('✅ WASMInstancePool shutdown complete');
  }
}

module.exports = WASMInstancePool;