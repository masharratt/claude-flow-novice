/**
 * FleetCommanderAgent - Central fleet coordinator for managing 1000+ AI agents
 *
 * Features:
 * - Manages up to 1000 concurrent agents
 * - Coordinates 16 different agent pool types
 * - Priority-based resource allocation
 * - Health monitoring and recovery
 * - Redis pub/sub coordination
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import crypto from 'crypto';
import { AgentRegistry } from './AgentRegistry.js';
import { ResourceAllocator } from './ResourceAllocator.js';
import { HealthMonitor } from './HealthMonitor.js';

/**
 * Agent pool types configuration
 */
const AGENT_POOLS = {
  coder: { min: 5, max: 100, priority: 8, resources: { memory: 512, cpu: 0.5 } },
  tester: { min: 3, max: 80, priority: 7, resources: { memory: 256, cpu: 0.3 } },
  reviewer: { min: 2, max: 50, priority: 6, resources: { memory: 256, cpu: 0.2 } },
  architect: { min: 1, max: 20, priority: 9, resources: { memory: 1024, cpu: 0.8 } },
  researcher: { min: 2, max: 40, priority: 7, resources: { memory: 512, cpu: 0.4 } },
  analyst: { min: 2, max: 60, priority: 6, resources: { memory: 384, cpu: 0.4 } },
  optimizer: { min: 1, max: 30, priority: 5, resources: { memory: 256, cpu: 0.3 } },
  security: { min: 1, max: 25, priority: 9, resources: { memory: 384, cpu: 0.5 } },
  performance: { min: 1, max: 25, priority: 6, resources: { memory: 256, cpu: 0.3 } },
  ui: { min: 2, max: 50, priority: 5, resources: { memory: 384, cpu: 0.4 } },
  mobile: { min: 1, max: 30, priority: 5, resources: { memory: 384, cpu: 0.4 } },
  devops: { min: 1, max: 30, priority: 7, resources: { memory: 512, cpu: 0.6 } },
  database: { min: 1, max: 25, priority: 6, resources: { memory: 512, cpu: 0.5 } },
  network: { min: 1, max: 20, priority: 6, resources: { memory: 256, cpu: 0.3 } },
  infrastructure: { min: 1, max: 20, priority: 7, resources: { memory: 384, cpu: 0.5 } },
  coordinator: { min: 1, max: 10, priority: 10, resources: { memory: 512, cpu: 0.7 } }
};

/**
 * Fleet configuration
 */
const FLEET_CONFIG = {
  maxAgents: 1000,
  heartbeatInterval: 5000,
  healthCheckInterval: 10000,
  allocationTimeout: 30000,
  recoveryTimeout: 60000,
  scalingThreshold: 0.8,
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },
  channels: {
    fleet: 'swarm:phase-1:fleet',
    registry: 'swarm:phase-1:registry',
    health: 'swarm:phase-1:health',
    allocation: 'swarm:phase-1:allocation',
    scaling: 'swarm:phase-1:scaling',
    tasks: 'swarm:phase-1:tasks',
    results: 'swarm:phase-1:results'
  }
};

/**
 * FleetCommanderAgent class
 */
export class FleetCommanderAgent extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...FLEET_CONFIG, ...options };
    this.swarmId = options.swarmId || 'phase-1-foundation-infrastructure';
    this.commanderId = `fleet-commander-${crypto.randomBytes(8).toString('hex')}`;

    this.redis = null;
    this.publisher = null;
    this.subscriber = null;

    this.registry = new AgentRegistry({ redis: this.config.redis });
    this.allocator = new ResourceAllocator({ pools: AGENT_POOLS });
    this.healthMonitor = new HealthMonitor({
      interval: this.config.heartbeatInterval,
      timeout: this.config.recoveryTimeout
    });

    this.isRunning = false;
    this.metrics = {
      totalAgents: 0,
      activeAgents: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageResponseTime: 0,
      uptime: 0,
      startTime: null
    };

    this.setupEventHandlers();
  }

  /**
   * Initialize the Fleet Commander
   */
  async initialize() {
    try {
      this.emit('status', { status: 'initializing', message: 'Initializing Fleet Commander' });

      // Initialize Redis connections
      await this.initializeRedis();

      // Initialize components
      await this.registry.initialize();
      await this.allocator.initialize();
      await this.healthMonitor.initialize();

      // Set up Redis subscriptions
      await this.setupSubscriptions();

      // Initialize agent pools
      await this.initializeAgentPools();

      // Start monitoring
      this.startMonitoring();

      this.metrics.startTime = Date.now();
      this.isRunning = true;

      // Announce fleet commander startup
      await this.publishFleetStatus({
        type: 'commander_started',
        commanderId: this.commanderId,
        swarmId: this.swarmId,
        timestamp: Date.now(),
        config: this.config
      });

      this.emit('status', { status: 'running', message: 'Fleet Commander initialized successfully' });
      console.log(`🚀 Fleet Commander ${this.commanderId} initialized for swarm ${this.swarmId}`);

    } catch (error) {
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Initialize Redis connections
   */
  async initializeRedis() {
    this.redis = createClient(this.config.redis);
    this.publisher = this.redis.duplicate();
    this.subscriber = this.redis.duplicate();

    await Promise.all([
      this.redis.connect(),
      this.publisher.connect(),
      this.subscriber.connect()
    ]);

    console.log('📡 Redis connections established');
  }

  /**
   * Setup Redis subscriptions
   */
  async setupSubscriptions() {
    await this.subscriber.subscribe(this.config.channels.registry, (message) => {
      this.handleRegistryMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(this.config.channels.health, (message) => {
      this.handleHealthMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(this.config.channels.tasks, (message) => {
      this.handleTaskMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(this.config.channels.results, (message) => {
      this.handleResultMessage(JSON.parse(message));
    });

    console.log('📡 Redis subscriptions configured');
  }

  /**
   * Initialize agent pools
   */
  async initializeAgentPools() {
    for (const [poolType, config] of Object.entries(AGENT_POOLS)) {
      await this.allocator.createPool(poolType, config);

      // Register minimum agents for each pool
      for (let i = 0; i < config.min; i++) {
        const agentId = await this.registerAgent({
          type: poolType,
          priority: config.priority,
          capabilities: this.getDefaultCapabilities(poolType),
          resources: config.resources
        });

        console.log(`🤖 Registered agent ${agentId} in pool ${poolType}`);
      }
    }

    console.log('🏊 Agent pools initialized');
  }

  /**
   * Register a new agent
   */
  async registerAgent(agentConfig) {
    const agentId = `agent-${crypto.randomBytes(8).toString('hex')}`;
    const agent = {
      id: agentId,
      ...agentConfig,
      status: 'idle',
      createdAt: Date.now(),
      lastActive: Date.now(),
      performance: {
        tasksCompleted: 0,
        averageTaskTime: 0,
        successRate: 1.0
      },
      health: {
        lastHeartbeat: Date.now(),
        failures: 0,
        recoveryAttempts: 0
      }
    };

    await this.registry.register(agent);

    // Update metrics
    this.metrics.totalAgents++;

    // Publish registration event
    await this.publishFleetStatus({
      type: 'agent_registered',
      agentId,
      poolType: agent.type,
      timestamp: Date.now()
    });

    return agentId;
  }

  /**
   * Allocate agent for task
   */
  async allocateAgent(taskRequirements) {
    try {
      const allocation = await this.allocator.allocate(taskRequirements);

      if (!allocation) {
        throw new Error('No suitable agent available');
      }

      // Update agent status
      await this.registry.updateStatus(allocation.agentId, 'busy');

      // Publish allocation event
      await this.publishFleetStatus({
        type: 'agent_allocated',
        agentId: allocation.agentId,
        taskId: taskRequirements.taskId,
        timestamp: Date.now()
      });

      return allocation;

    } catch (error) {
      this.emit('error', { type: 'allocation_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Release agent from task
   */
  async releaseAgent(agentId, result = {}) {
    try {
      const agent = await this.registry.get(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Update agent performance
      if (result.success !== undefined) {
        agent.performance.tasksCompleted++;
        agent.performance.successRate =
          (agent.performance.successRate * (agent.performance.tasksCompleted - 1) + (result.success ? 1 : 0))
          / agent.performance.tasksCompleted;
      }

      if (result.duration) {
        agent.performance.averageTaskTime =
          (agent.performance.averageTaskTime * (agent.performance.tasksCompleted - 1) + result.duration)
          / agent.performance.tasksCompleted;
      }

      // Update agent status
      agent.status = 'idle';
      agent.lastActive = Date.now();

      await this.registry.update(agent);

      // Update metrics
      if (result.success) {
        this.metrics.tasksCompleted++;
      } else {
        this.metrics.tasksFailed++;
      }

      // Publish release event
      await this.publishFleetStatus({
        type: 'agent_released',
        agentId,
        result,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('error', { type: 'release_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Get fleet status
   */
  async getFleetStatus() {
    const agents = await this.registry.listAll();
    const poolStatus = await this.allocator.getPoolStatus();

    return {
      commanderId: this.commanderId,
      swarmId: this.swarmId,
      isRunning: this.isRunning,
      metrics: {
        ...this.metrics,
        uptime: this.isRunning ? Date.now() - this.metrics.startTime : 0
      },
      agents: {
        total: agents.length,
        active: agents.filter(a => a.status === 'active' || a.status === 'busy').length,
        idle: agents.filter(a => a.status === 'idle').length,
        failed: agents.filter(a => a.status === 'failed').length
      },
      pools: poolStatus,
      timestamp: Date.now()
    };
  }

  /**
   * Scale agent pool
   */
  async scalePool(poolType, targetSize) {
    try {
      const pool = await this.allocator.getPool(poolType);
      if (!pool) {
        throw new Error(`Pool ${poolType} not found`);
      }

      const currentSize = pool.currentAgents;
      const diff = targetSize - currentSize;

      if (diff > 0) {
        // Scale up
        for (let i = 0; i < diff; i++) {
          await this.registerAgent({
            type: poolType,
            priority: pool.priorityLevel,
            capabilities: this.getDefaultCapabilities(poolType),
            resources: pool.resourceLimits
          });
        }
      } else if (diff < 0) {
        // Scale down
        const agentsToRelease = await this.registry.getIdleAgents(poolType, Math.abs(diff));
        for (const agentId of agentsToRelease) {
          await this.registry.unregister(agentId);
          this.metrics.totalAgents--;
        }
      }

      // Publish scaling event
      await this.publishFleetStatus({
        type: 'pool_scaled',
        poolType,
        previousSize: currentSize,
        newSize: targetSize,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('error', { type: 'scaling_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Start monitoring processes
   */
  startMonitoring() {
    // Health monitoring
    this.healthMonitor.on('health_check', async (result) => {
      if (!result.healthy) {
        await this.handleUnhealthyAgent(result.agentId, result.reason);
      }
    });

    this.healthMonitor.start();

    // Metrics collection
    this.metricsInterval = setInterval(async () => {
      await this.collectMetrics();
    }, this.config.healthCheckInterval);

    // Auto-scaling
    this.scalingInterval = setInterval(async () => {
      await this.checkAutoScaling();
    }, 30000); // Check every 30 seconds

    console.log('📊 Fleet monitoring started');
  }

  /**
   * Stop monitoring processes
   */
  stopMonitoring() {
    if (this.healthMonitor) {
      this.healthMonitor.stop();
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    if (this.scalingInterval) {
      clearInterval(this.scalingInterval);
    }

    console.log('⏹️ Fleet monitoring stopped');
  }

  /**
   * Shutdown the Fleet Commander
   */
  async shutdown() {
    this.emit('status', { status: 'shutting_down', message: 'Shutting down Fleet Commander' });

    this.isRunning = false;
    this.stopMonitoring();

    // Publish shutdown event
    await this.publishFleetStatus({
      type: 'commander_shutdown',
      commanderId: this.commanderId,
      timestamp: Date.now()
    });

    // Close Redis connections
    if (this.subscriber) await this.subscriber.quit();
    if (this.publisher) await this.publisher.quit();
    if (this.redis) await this.redis.quit();

    this.emit('status', { status: 'shutdown', message: 'Fleet Commander shutdown complete' });
    console.log('🛑 Fleet Commander shutdown complete');
  }

  /**
   * Private helper methods
   */
  setupEventHandlers() {
    this.on('error', (error) => {
      console.error('❌ Fleet Commander error:', error);
    });

    this.on('status', (status) => {
      console.log(`📊 Fleet Commander status: ${status.status} - ${status.message}`);
    });
  }

  async handleRegistryMessage(message) {
    switch (message.type) {
      case 'agent_heartbeat':
        await this.handleAgentHeartbeat(message.agentId, message.timestamp);
        break;
      case 'agent_request':
        await this.handleAgentRequest(message);
        break;
    }
  }

  async handleHealthMessage(message) {
    switch (message.type) {
      case 'agent_unhealthy':
        await this.handleUnhealthyAgent(message.agentId, message.reason);
        break;
      case 'agent_recovered':
        await this.handleAgentRecovery(message.agentId);
        break;
    }
  }

  async handleTaskMessage(message) {
    switch (message.type) {
      case 'task_request':
        await this.handleTaskRequest(message);
        break;
      case 'task_cancel':
        await this.handleTaskCancel(message.taskId);
        break;
    }
  }

  async handleResultMessage(message) {
    switch (message.type) {
      case 'task_completed':
        await this.releaseAgent(message.agentId, message.result);
        break;
      case 'task_failed':
        await this.releaseAgent(message.agentId, { success: false, error: message.error });
        break;
    }
  }

  async handleAgentHeartbeat(agentId, timestamp) {
    await this.registry.updateHeartbeat(agentId, timestamp);
  }

  async handleUnhealthyAgent(agentId, reason) {
    const agent = await this.registry.get(agentId);
    if (agent) {
      agent.status = 'failed';
      agent.health.failures++;
      await this.registry.update(agent);

      // Attempt recovery
      if (agent.health.failures < 3) {
        await this.attemptAgentRecovery(agentId);
      } else {
        await this.registry.unregister(agentId);
        this.metrics.totalAgents--;
      }
    }
  }

  async attemptAgentRecovery(agentId) {
    const agent = await this.registry.get(agentId);
    if (agent) {
      agent.status = 'recovering';
      agent.health.recoveryAttempts++;
      await this.registry.update(agent);

      // Publish recovery request
      await this.publishFleetStatus({
        type: 'agent_recovery_requested',
        agentId,
        timestamp: Date.now()
      });
    }
  }

  async publishFleetStatus(data) {
    if (this.publisher) {
      await this.publisher.publish(
        this.config.channels.fleet,
        JSON.stringify(data)
      );
    }
  }

  async collectMetrics() {
    const agents = await this.registry.listAll();
    this.metrics.totalAgents = agents.length;
    this.metrics.activeAgents = agents.filter(a => a.status === 'active' || a.status === 'busy').length;

    // Publish metrics
    await this.publishFleetStatus({
      type: 'metrics_update',
      metrics: this.metrics,
      timestamp: Date.now()
    });
  }

  async checkAutoScaling() {
    const poolStatus = await this.allocator.getPoolStatus();

    for (const [poolType, status] of Object.entries(poolStatus)) {
      const utilization = status.activeAgents / status.currentAgents;

      if (utilization > this.config.scalingThreshold && status.currentAgents < status.maxAgents) {
        // Scale up
        const newSize = Math.min(status.currentAgents + 2, status.maxAgents);
        await this.scalePool(poolType, newSize);
      } else if (utilization < 0.3 && status.currentAgents > status.minAgents) {
        // Scale down
        const newSize = Math.max(status.currentAgents - 1, status.minAgents);
        await this.scalePool(poolType, newSize);
      }
    }
  }

  getDefaultCapabilities(poolType) {
    const capabilities = {
      coder: ['javascript', 'typescript', 'python', 'java'],
      tester: ['unit-testing', 'integration-testing', 'e2e-testing'],
      reviewer: ['code-review', 'security-review', 'performance-review'],
      architect: ['system-design', 'api-design', 'database-design'],
      researcher: ['information-gathering', 'analysis', 'documentation'],
      analyst: ['data-analysis', 'statistical-analysis', 'reporting'],
      optimizer: ['performance-optimization', 'code-optimization'],
      security: ['security-audit', 'vulnerability-assessment'],
      performance: ['performance-testing', 'load-testing', 'profiling'],
      ui: ['frontend-development', 'ux-design', 'responsive-design'],
      mobile: ['mobile-development', 'ios', 'android'],
      devops: ['ci-cd', 'deployment', 'infrastructure'],
      database: ['database-design', 'sql', 'nosql'],
      network: ['network-configuration', 'protocols', 'security'],
      infrastructure: ['cloud-services', 'containerization', 'orchestration'],
      coordinator: ['project-management', 'coordination', 'planning']
    };

    return capabilities[poolType] || [];
  }
}

export default FleetCommanderAgent;