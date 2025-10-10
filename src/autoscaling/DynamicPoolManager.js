/**
 * Dynamic Pool Manager for Agent Auto-Scaling
 * Manages agent pool with automatic scaling capabilities and Redis coordination
 */

import Redis from 'ioredis';
import ScalingAlgorithm from './ScalingAlgorithm.js';

class DynamicPoolManager {
  constructor(config = {}) {
    this.config = {
      pool: {
        minSize: 5,
        maxSize: 200,
        initialSize: 10
      },
      scaling: {
        algorithm: 'hybrid',
        scaleUpCooldown: 30000,   // 30s
        scaleDownCooldown: 120000, // 120s
        checkInterval: 5000        // 5s
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD
      },
      ...config
    };

    this.redis = new Redis(this.config.redis);
    this.agents = new Map();
    this.metrics = new Map();
    this.lastScaleTime = { up: 0, down: 0 };
    this.isRunning = false;
    this.stats = {
      scaleUps: 0,
      scaleDowns: 0,
      totalAgents: 0,
      avgUtilization: 0
    };

    // Initialize scaling algorithm
    this.scalingAlgorithm = new ScalingAlgorithm(
      this.config.scaling.algorithm,
      this.config.scaling.config
    );

    // Initialize agent pool
    this.initializePool();
  }

  /**
   * Initialize the agent pool with initial size
   */
  async initializePool() {
    const initialSize = this.config.pool.initialSize;

    console.log(`Initializing agent pool with ${initialSize} agents...`);

    for (let i = 0; i < initialSize; i++) {
      await this.addAgent();
    }

    console.log(`Agent pool initialized with ${this.agents.size} agents`);
    await this.publishEvent('pool_initialized', {
      poolSize: this.agents.size,
      timestamp: Date.now()
    });
  }

  /**
   * Start the auto-scaling manager
   */
  async start() {
    if (this.isRunning) {
      console.log('Dynamic Pool Manager is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting Dynamic Pool Manager...');

    // Start scaling monitoring
    this.monitoringInterval = setInterval(async () => {
      await this.checkScaling();
    }, this.config.scaling.checkInterval);

    // Subscribe to control commands
    await this.redis.subscribe('swarm:phase-2:control');
    this.redis.on('message', async (channel, message) => {
      if (channel === 'swarm:phase-2:control') {
        await this.handleControlCommand(message);
      }
    });

    await this.publishEvent('manager_started', {
      poolSize: this.agents.size,
      algorithm: this.config.scaling.algorithm
    });
  }

  /**
   * Stop the auto-scaling manager
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('Stopping Dynamic Pool Manager...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    await this.redis.unsubscribe('swarm:phase-2:control');
    await this.publishEvent('manager_stopped', {
      finalPoolSize: this.agents.size,
      stats: this.stats
    });

    await this.redis.quit();
  }

  /**
   * Check if scaling is needed and perform scaling actions
   */
  async checkScaling() {
    try {
      const currentMetrics = await this.collectMetrics();
      const scalingDecision = await this.scalingAlgorithm.analyze(currentMetrics);

      await this.publishEvent('scaling_decision', scalingDecision);

      if (scalingDecision.action === 'scale_up') {
        await this.scaleUp(scalingDecision);
      } else if (scalingDecision.action === 'scale_down') {
        await this.scaleDown(scalingDecision);
      }

      // Update statistics
      await this.updateStats(currentMetrics);

    } catch (error) {
      console.error('Error during scaling check:', error);
      await this.publishEvent('scaling_error', {
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Scale up the agent pool
   */
  async scaleUp(decision) {
    const now = Date.now();
    const cooldown = this.config.scaling.scaleUpCooldown;

    if (now - this.lastScaleTime.up < cooldown) {
      console.log('Scale up cooldown active, skipping');
      return;
    }

    if (this.agents.size >= this.config.pool.maxSize) {
      console.log('Pool at maximum size, cannot scale up');
      return;
    }

    // Calculate how many agents to add (start with 1, can be more aggressive)
    const agentsToAdd = Math.min(
      Math.ceil(this.agents.size * 0.2), // Add 20% of current size
      this.config.pool.maxSize - this.agents.size
    );

    console.log(`Scaling up by ${agentsToAdd} agents: ${decision.reasoning}`);

    for (let i = 0; i < agentsToAdd; i++) {
      await this.addAgent();
    }

    this.lastScaleTime.up = now;
    this.stats.scaleUps++;

    await this.publishEvent('scale_up', {
      agentsAdded: agentsToAdd,
      newPoolSize: this.agents.size,
      reasoning: decision.reasoning,
      confidence: decision.confidence
    });
  }

  /**
   * Scale down the agent pool
   */
  async scaleDown(decision) {
    const now = Date.now();
    const cooldown = this.config.scaling.scaleDownCooldown;

    if (now - this.lastScaleTime.down < cooldown) {
      console.log('Scale down cooldown active, skipping');
      return;
    }

    if (this.agents.size <= this.config.pool.minSize) {
      console.log('Pool at minimum size, cannot scale down');
      return;
    }

    // Calculate how many agents to remove
    const agentsToRemove = Math.min(
      Math.ceil(this.agents.size * 0.15), // Remove 15% of current size
      this.agents.size - this.config.pool.minSize
    );

    console.log(`Scaling down by ${agentsToRemove} agents: ${decision.reasoning}`);

    // Select idle agents for removal
    const idleAgents = this.getIdleAgents(agentsToRemove);

    for (const agentId of idleAgents) {
      await this.removeAgent(agentId);
    }

    this.lastScaleTime.down = now;
    this.stats.scaleDowns++;

    await this.publishEvent('scale_down', {
      agentsRemoved: agentsToRemove,
      newPoolSize: this.agents.size,
      reasoning: decision.reasoning,
      confidence: decision.confidence
    });
  }

  /**
   * Add a new agent to the pool
   */
  async addAgent() {
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const agent = {
      id: agentId,
      status: 'idle',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      tasksCompleted: 0,
      utilization: 0,
      capabilities: ['general'] // Can be extended with specific capabilities
    };

    this.agents.set(agentId, agent);

    // Store agent in Redis for cross-process coordination
    await this.redis.hset('swarm:agents', agentId, JSON.stringify(agent));

    return agentId;
  }

  /**
   * Remove an agent from the pool
   */
  async removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(`Agent ${agentId} not found in pool`);
      return;
    }

    // Mark agent for graceful shutdown
    agent.status = 'terminating';
    this.agents.set(agentId, agent);

    // Remove from Redis
    await this.redis.hdel('swarm:agents', agentId);
    this.agents.delete(agentId);

    console.log(`Agent ${agentId} removed from pool`);
  }

  /**
   * Get idle agents for removal
   */
  getIdleAgents(count) {
    const agents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'idle')
      .sort((a, b) => b.lastActivity - a.lastActivity) // Least recently used first
      .slice(0, count)
      .map(agent => agent.id);

    return agents;
  }

  /**
   * Collect current metrics from agents and system
   */
  async collectMetrics() {
    const now = Date.now();
    const activeAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'active');

    // Calculate agent utilization
    const avgAgentUtilization = activeAgents.length > 0
      ? activeAgents.reduce((sum, agent) => sum + agent.utilization, 0) / activeAgents.length
      : 0;

    // Get system metrics (placeholder - would integrate with actual monitoring)
    const systemMetrics = await this.getSystemMetrics();

    const metrics = {
      timestamp: now,
      poolSize: this.agents.size,
      activeAgents: activeAgents.length,
      idleAgents: this.agents.size - activeAgents.length,
      agentUtilization: avgAgentUtilization,
      taskQueue: await this.getTaskQueueSize(),
      responseTime: systemMetrics.responseTime || 0,
      cpu: systemMetrics.cpu || 0,
      memory: systemMetrics.memory || 0
    };

    // Store metrics for analysis
    this.metrics.set(now, metrics);

    // Keep only recent metrics (last hour)
    const cutoffTime = now - (60 * 60 * 1000);
    for (const [timestamp] of this.metrics) {
      if (timestamp < cutoffTime) {
        this.metrics.delete(timestamp);
      }
    }

    return metrics;
  }

  /**
   * Get system metrics (placeholder implementation)
   */
  async getSystemMetrics() {
    // In a real implementation, this would integrate with monitoring systems
    // For now, return simulated metrics
    return {
      cpu: Math.random() * 0.8,
      memory: Math.random() * 0.7,
      responseTime: 50 + Math.random() * 100
    };
  }

  /**
   * Get current task queue size from Redis
   */
  async getTaskQueueSize() {
    try {
      const queueSize = await this.redis.llen('swarm:task-queue');
      return queueSize;
    } catch (error) {
      console.error('Error getting task queue size:', error);
      return 0;
    }
  }

  /**
   * Update manager statistics
   */
  async updateStats(currentMetrics) {
    this.stats.totalAgents = this.agents.size;
    this.stats.avgUtilization = currentMetrics.agentUtilization;

    // Store stats in Redis
    await this.redis.hset('swarm:pool-stats', 'stats', JSON.stringify(this.stats));
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
        case 'force_scale_up':
          await this.forceScaleUp(command.count || 1);
          break;
        case 'force_scale_down':
          await this.forceScaleDown(command.count || 1);
          break;
        case 'update_config':
          await this.updateConfig(command.config);
          break;
        default:
          console.warn(`Unknown control command: ${command.action}`);
      }
    } catch (error) {
      console.error('Error handling control command:', error);
    }
  }

  /**
   * Send current status via Redis
   */
  async sendStatus(requestId) {
    const status = {
      requestId,
      timestamp: Date.now(),
      poolSize: this.agents.size,
      stats: this.stats,
      lastDecision: this.scalingAlgorithm.lastDecision,
      algorithmStats: this.scalingAlgorithm.getStats()
    };

    await this.redis.publish('swarm:phase-2:status', JSON.stringify(status));
  }

  /**
   * Force scale up by specified count
   */
  async forceScaleUp(count) {
    console.log(`Force scaling up by ${count} agents`);

    for (let i = 0; i < count; i++) {
      if (this.agents.size < this.config.pool.maxSize) {
        await this.addAgent();
      }
    }

    await this.publishEvent('force_scale_up', {
      agentsAdded: count,
      newPoolSize: this.agents.size
    });
  }

  /**
   * Force scale down by specified count
   */
  async forceScaleDown(count) {
    console.log(`Force scaling down by ${count} agents`);

    const idleAgents = this.getIdleAgents(count);
    for (const agentId of idleAgents) {
      await this.removeAgent(agentId);
    }

    await this.publishEvent('force_scale_down', {
      agentsRemoved: count,
      newPoolSize: this.agents.size
    });
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig) {
    console.log('Updating configuration:', newConfig);
    this.config = { ...this.config, ...newConfig };

    // Reinitialize scaling algorithm if algorithm type changed
    if (newConfig.scaling?.algorithm) {
      this.scalingAlgorithm = new ScalingAlgorithm(
        newConfig.scaling.algorithm,
        newConfig.scaling.config
      );
    }

    await this.publishEvent('config_updated', { config: this.config });
  }

  /**
   * Publish events to Redis channel
   */
  async publishEvent(eventType, data) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      data
    };

    try {
      await this.redis.publish('swarm:phase-2:autoscaling', JSON.stringify(event));
    } catch (error) {
      console.error('Error publishing event:', error);
    }
  }

  /**
   * Get current pool status
   */
  getPoolStatus() {
    const agents = Array.from(this.agents.values());
    const activeAgents = agents.filter(a => a.status === 'active');
    const idleAgents = agents.filter(a => a.status === 'idle');

    return {
      poolSize: agents.length,
      activeAgents: activeAgents.length,
      idleAgents: idleAgents.length,
      utilization: activeAgents.length > 0
        ? activeAgents.reduce((sum, a) => sum + a.utilization, 0) / activeAgents.length
        : 0,
      stats: this.stats,
      config: this.config
    };
  }
}

export default DynamicPoolManager;