/**
 * FleetManager - Unified API for fleet management operations
 *
 * Central interface for managing 1000+ AI agents across distributed systems.
 * Provides simplified API for fleet operations while coordinating underlying
 * subsystems (registry, allocation, scaling, monitoring).
 *
 * @module fleet-manager/core
 * @version 2.0.0
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { AgentRegistry } from './AgentRegistry.js';
import { ResourceAllocator } from './ResourceAllocator.js';
import { RedisCoordinator } from '../coordination/RedisCoordinator.js';
import { AutoScalingManager } from '../scaling/AutoScalingManager.js';
import { FleetMonitor } from '../monitoring/FleetMonitor.js';

/**
 * Fleet configuration schema
 */
export const FleetConfigSchema = {
  // Fleet sizing
  maxAgents: 1000,

  // Timing configuration
  heartbeatInterval: 5000,
  healthCheckInterval: 10000,
  allocationTimeout: 30000,
  recoveryTimeout: 60000,

  // Scaling thresholds
  scalingThreshold: 0.8,
  scaleDownThreshold: 0.3,

  // Redis coordination
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0,
    keyPrefix: 'fleet:',
    ttl: 3600
  },

  // Monitoring
  monitoring: {
    enabled: true,
    metricsInterval: 10000,
    retentionDays: 30
  },

  // Auto-scaling
  autoScaling: {
    enabled: true,
    minPoolSize: 5,
    maxPoolSize: 200,
    efficiencyTarget: 0.4
  }
};

/**
 * Agent pool type definitions
 */
export const AGENT_POOL_TYPES = {
  CODER: 'coder',
  TESTER: 'tester',
  REVIEWER: 'reviewer',
  ARCHITECT: 'architect',
  RESEARCHER: 'researcher',
  ANALYST: 'analyst',
  OPTIMIZER: 'optimizer',
  SECURITY: 'security',
  PERFORMANCE: 'performance',
  UI: 'ui',
  MOBILE: 'mobile',
  DEVOPS: 'devops',
  DATABASE: 'database',
  NETWORK: 'network',
  INFRASTRUCTURE: 'infrastructure',
  COORDINATOR: 'coordinator'
};

/**
 * Default pool configurations
 */
const DEFAULT_POOL_CONFIGS = {
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
 * FleetManager - Unified fleet management interface
 *
 * @example
 * const fleet = new FleetManager({
 *   maxAgents: 1500,
 *   redis: { host: 'redis.example.com' },
 *   autoScaling: { enabled: true, efficiencyTarget: 0.45 }
 * });
 *
 * await fleet.initialize();
 * const allocation = await fleet.allocateAgent({ type: 'coder', taskId: 'task-123' });
 * await fleet.releaseAgent(allocation.agentId, { success: true, duration: 1500 });
 * const status = await fleet.getStatus();
 */
export class FleetManager extends EventEmitter {
  /**
   * Create a new FleetManager instance
   * @param {Object} config - Fleet configuration
   */
  constructor(config = {}) {
    super();

    this.config = { ...FleetConfigSchema, ...config };
    this.fleetId = config.fleetId || `fleet-${crypto.randomBytes(8).toString('hex')}`;
    this.swarmId = config.swarmId || 'default-swarm';

    // Component instances
    this.registry = null;
    this.allocator = null;
    this.coordinator = null;
    this.autoScaler = null;
    this.monitor = null;

    // State
    this.isInitialized = false;
    this.isRunning = false;

    // Metrics
    this.metrics = {
      totalAgents: 0,
      activeAgents: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageResponseTime: 0,
      uptime: 0,
      startTime: null
    };
  }

  /**
   * Initialize the fleet manager and all subsystems
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.emit('status', { status: 'initializing', message: 'Initializing Fleet Manager' });

      // Initialize Redis coordinator first (required by other components)
      this.coordinator = new RedisCoordinator({
        host: this.config.redis.host,
        port: this.config.redis.port,
        db: this.config.redis.db,
        keyPrefix: `${this.config.redis.keyPrefix}${this.fleetId}:`,
        monitoring: this.config.monitoring
      });
      await this.coordinator.connect();

      // Initialize agent registry
      this.registry = new AgentRegistry({
        redis: this.config.redis
      });
      await this.registry.initialize();

      // Initialize resource allocator
      this.allocator = new ResourceAllocator({
        redis: this.config.redis,
        pools: DEFAULT_POOL_CONFIGS
      });
      await this.allocator.initialize();

      // Initialize agent pools
      await this.initializeAgentPools();

      // Initialize auto-scaler if enabled
      if (this.config.autoScaling.enabled) {
        this.autoScaler = new AutoScalingManager({
          fleetManager: this,
          config: this.config.autoScaling
        });
        await this.autoScaler.initialize();
      }

      // Initialize fleet monitor if enabled
      if (this.config.monitoring.enabled) {
        this.monitor = new FleetMonitor({
          fleetManager: this,
          config: this.config.monitoring
        });
        await this.monitor.initialize();
      }

      // Setup event routing
      this.setupEventRouting();

      this.metrics.startTime = Date.now();
      this.isInitialized = true;
      this.isRunning = true;

      this.emit('status', { status: 'running', message: 'Fleet Manager initialized successfully' });
      console.log(`🚀 Fleet Manager ${this.fleetId} initialized for swarm ${this.swarmId}`);

    } catch (error) {
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Initialize agent pools with minimum agents
   * @private
   */
  async initializeAgentPools() {
    for (const [poolType, poolConfig] of Object.entries(DEFAULT_POOL_CONFIGS)) {
      await this.allocator.createPool(poolType, poolConfig);

      // Register minimum agents for each pool
      for (let i = 0; i < poolConfig.min; i++) {
        await this.registerAgent({
          type: poolType,
          priority: poolConfig.priority,
          capabilities: this.getDefaultCapabilities(poolType),
          resources: poolConfig.resources
        });
      }
    }

    console.log('🏊 Agent pools initialized');
  }

  /**
   * Register a new agent in the fleet
   * @param {Object} agentConfig - Agent configuration
   * @returns {Promise<string>} Agent ID
   */
  async registerAgent(agentConfig) {
    const agentId = `agent-${crypto.randomBytes(8).toString('hex')}`;
    const agent = {
      id: agentId,
      ...agentConfig,
      status: 'idle',
      fleetId: this.fleetId,
      swarmId: this.swarmId,
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

    // Register with registry
    await this.registry.register(agent);

    // Add to pool
    await this.allocator.addAgentToPool(agent.type, agent);

    // Update metrics
    this.metrics.totalAgents++;

    // Publish registration event via Redis
    await this.coordinator.publish(`fleet:${this.fleetId}:events`, {
      type: 'agent_registered',
      agentId,
      poolType: agent.type,
      timestamp: Date.now()
    });

    return agentId;
  }

  /**
   * Allocate an agent for a task
   * @param {Object} taskRequirements - Task requirements
   * @returns {Promise<Object>} Allocation details
   */
  async allocateAgent(taskRequirements) {
    try {
      const allocation = await this.allocator.allocate(taskRequirements);

      // Update agent status
      await this.registry.updateStatus(allocation.agentId, 'busy');

      // Update metrics
      this.metrics.activeAgents++;

      // Publish allocation event
      await this.coordinator.publish(`fleet:${this.fleetId}:events`, {
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
   * Release an agent from a task
   * @param {string} agentId - Agent ID
   * @param {Object} result - Task result
   * @returns {Promise<void>}
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
      this.metrics.activeAgents--;
      if (result.success) {
        this.metrics.tasksCompleted++;
      } else {
        this.metrics.tasksFailed++;
      }

      // Publish release event
      await this.coordinator.publish(`fleet:${this.fleetId}:events`, {
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
   * Get comprehensive fleet status
   * @returns {Promise<Object>} Fleet status
   */
  async getStatus() {
    const agents = await this.registry.listAll();
    const poolStatus = await this.allocator.getPoolStatus();
    const coordinatorMetrics = this.coordinator.getMetrics();

    return {
      fleetId: this.fleetId,
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
      coordination: {
        messagesPublished: coordinatorMetrics.messagesPublished,
        messagesReceived: coordinatorMetrics.messagesReceived,
        publishLatency: coordinatorMetrics.publishLatency,
        queueSize: this.coordinator.getQueueSize()
      },
      timestamp: Date.now()
    };
  }

  /**
   * Scale an agent pool
   * @param {string} poolType - Pool type
   * @param {number} targetSize - Target pool size
   * @returns {Promise<void>}
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
        const idleAgents = await this.registry.getIdleAgents(poolType, Math.abs(diff));
        for (const agentId of idleAgents) {
          await this.allocator.removeAgentFromPool(poolType, agentId);
          await this.registry.unregister(agentId);
          this.metrics.totalAgents--;
        }
      }

      // Publish scaling event
      await this.coordinator.publish(`fleet:${this.fleetId}:events`, {
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
   * Get fleet health status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    const coordinatorHealth = await this.coordinator.healthCheck();
    const registryStats = await this.registry.getStats();

    return {
      status: coordinatorHealth.status === 'healthy' && this.isRunning ? 'healthy' : 'degraded',
      components: {
        coordinator: coordinatorHealth,
        registry: {
          status: this.registry.isInitialized ? 'healthy' : 'unhealthy',
          totalAgents: registryStats.total
        },
        allocator: {
          status: this.allocator.isInitialized ? 'healthy' : 'unhealthy'
        },
        autoScaler: {
          status: this.autoScaler?.isRunning ? 'healthy' : 'disabled'
        },
        monitor: {
          status: this.monitor?.isRunning ? 'healthy' : 'disabled'
        }
      },
      timestamp: Date.now()
    };
  }

  /**
   * Shutdown the fleet manager
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.emit('status', { status: 'shutting_down', message: 'Shutting down Fleet Manager' });

    this.isRunning = false;

    // Shutdown components in reverse order
    if (this.monitor) await this.monitor.shutdown();
    if (this.autoScaler) await this.autoScaler.shutdown();
    if (this.allocator) await this.allocator.close();
    if (this.registry) await this.registry.close();
    if (this.coordinator) await this.coordinator.disconnect();

    this.emit('status', { status: 'shutdown', message: 'Fleet Manager shutdown complete' });
    console.log('🛑 Fleet Manager shutdown complete');
  }

  /**
   * Setup event routing between components
   * @private
   */
  setupEventRouting() {
    // Route registry events through coordinator
    this.registry.on('agent_registered', (event) => {
      this.emit('agent_registered', event);
    });

    this.registry.on('agent_unregistered', (event) => {
      this.emit('agent_unregistered', event);
    });

    // Route allocator events
    this.allocator.on('agent_allocated', (event) => {
      this.emit('agent_allocated', event);
    });

    this.allocator.on('allocation_released', (event) => {
      this.emit('allocation_released', event);
    });

    // Route coordinator events
    this.coordinator.on('message', (message) => {
      this.emit('coordination_message', message);
    });

    this.coordinator.on('error', (error) => {
      this.emit('coordination_error', error);
    });
  }

  /**
   * Get default capabilities for a pool type
   * @private
   */
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

export default FleetManager;
