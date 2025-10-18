/**
 * SwarmCoordinator - Advanced central orchestration for fleet management
 *
 * Features:
 * - Agent lifecycle orchestration (spawn, monitor, terminate)
 * - Task distribution and load balancing
 * - Dynamic agent scaling based on workload
 * - Fleet-wide coordination via Redis pub/sub
 * - Performance monitoring and optimization
 * - Fault tolerance and recovery mechanisms
 */

import { EventEmitter } from 'events';
import { FleetCommanderAgent } from './FleetCommanderAgent.js';
import { AgentRegistry } from './AgentRegistry.js';
import { ResourceAllocator } from './ResourceAllocator.js';
import { RedisCoordinator } from './RedisCoordinator.js';
import { HealthMonitor } from './HealthMonitor.js';
import crypto from 'crypto';

/**
 * SwarmCoordinator configuration
 */
const SWARM_COORDINATOR_CONFIG = {
  swarmId: 'phase-1-swarmcoordinator-fix',
  maxAgents: 1000,
  heartbeatInterval: 5000,
  coordinationInterval: 10000,
  scalingThreshold: 0.8,
  loadBalancingStrategy: 'weighted_round_robin',
  taskQueueSize: 10000,
  recoveryTimeout: 60000,
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },
  channels: {
    coordination: 'swarm:phase-1:coordination',
    orchestration: 'swarm:phase-1:orchestration',
    scaling: 'swarm:phase-1:scaling',
    monitoring: 'swarm:phase-1:monitoring',
    tasks: 'swarm:phase-1:tasks',
    results: 'swarm:phase-1:results',
    health: 'swarm:phase-1:health'
  }
};

/**
 * Load balancing strategies
 */
const LOAD_BALANCING_STRATEGIES = {
  round_robin: (agents, task) => {
    const availableAgents = agents.filter(a => a.status === 'idle');
    if (availableAgents.length === 0) return null;
    const index = Math.floor(Math.random() * availableAgents.length);
    return availableAgents[index];
  },

  weighted_round_robin: (agents, task) => {
    const availableAgents = agents.filter(a => a.status === 'idle');
    if (availableAgents.length === 0) return null;

    // Weight by performance metrics
    const weighted = availableAgents.map(agent => ({
      agent,
      weight: agent.performance.successRate * (1 / (agent.performance.averageTaskTime || 1))
    }));

    weighted.sort((a, b) => b.weight - a.weight);
    return weighted[0].agent;
  },

  capability_based: (agents, task) => {
    const availableAgents = agents.filter(a => a.status === 'idle');
    if (availableAgents.length === 0) return null;

    // Match capabilities
    const bestMatch = availableAgents.find(agent =>
      task.capabilities && task.capabilities.every(cap =>
        agent.capabilities.includes(cap)
      )
    );

    return bestMatch || availableAgents[0];
  }
};

/**
 * SwarmCoordinator class
 */
export class SwarmCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...SWARM_COORDINATOR_CONFIG, ...options };
    this.swarmId = this.config.swarmId;
    this.coordinatorId = `swarm-coordinator-${crypto.randomBytes(8).toString('hex')}`;

    // Core components
    this.fleetCommander = null;
    this.redisCoordinator = null;
    this.agentRegistry = null;
    this.resourceAllocator = null;
    this.healthMonitor = null;

    // Orchestration state
    this.isRunning = false;
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.agentWorkloads = new Map();
    this.scalingHistory = [];
    this.performanceMetrics = new Map();

    // Load balancing
    this.loadBalancingIndex = 0;
    this.loadBalancingStrategy = LOAD_BALANCING_STRATEGIES[this.config.loadBalancingStrategy];

    // Monitoring
    this.metrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskDuration: 0,
      agentUtilization: 0,
      scalingEvents: 0,
      recoveryEvents: 0,
      uptime: 0,
      startTime: null
    };

    this.setupEventHandlers();
  }

  /**
   * Initialize the SwarmCoordinator
   */
  async initialize() {
    try {
      this.emit('status', { status: 'initializing', message: 'Initializing SwarmCoordinator' });

      // Initialize Redis coordinator first
      this.redisCoordinator = new RedisCoordinator({
        swarmId: this.swarmId,
        redis: this.config.redis,
        channels: this.config.channels
      });
      await this.redisCoordinator.initialize();

      // Initialize fleet components
      await this.initializeFleetComponents();

      // Setup coordination channels
      await this.setupCoordinationChannels();

      // Start orchestration processes
      this.startOrchestration();

      this.metrics.startTime = Date.now();
      this.isRunning = true;

      // Announce coordinator startup
      await this.publishCoordinationEvent({
        type: 'coordinator_started',
        coordinatorId: this.coordinatorId,
        swarmId: this.swarmId,
        timestamp: Date.now(),
        config: this.config
      });

      this.emit('status', { status: 'running', message: 'SwarmCoordinator initialized successfully' });
      console.log(`🚀 SwarmCoordinator ${this.coordinatorId} initialized for swarm ${this.swarmId}`);

    } catch (error) {
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Initialize fleet components
   */
  async initializeFleetComponents() {
    // Initialize FleetCommander
    this.fleetCommander = new FleetCommanderAgent({
      swarmId: this.swarmId,
      maxAgents: this.config.maxAgents,
      redis: this.config.redis
    });
    await this.fleetCommander.initialize();

    // Get component references
    this.agentRegistry = this.fleetCommander.registry;
    this.resourceAllocator = this.fleetCommander.allocator;
    this.healthMonitor = this.fleetCommander.healthMonitor;

    console.log('🏗️ Fleet components initialized');
  }

  /**
   * Setup coordination channels
   */
  async setupCoordinationChannels() {
    // Orchestration commands
    await this.redisCoordinator.subscribe(this.config.channels.orchestration, (message) => {
      this.handleOrchestrationCommand(message);
    });

    // Scaling events
    await this.redisCoordinator.subscribe(this.config.channels.scaling, (message) => {
      this.handleScalingEvent(message);
    });

    // Monitoring data
    await this.redisCoordinator.subscribe(this.config.channels.monitoring, (message) => {
      this.handleMonitoringData(message);
    });

    console.log('📡 Coordination channels configured');
  }

  /**
   * Agent lifecycle orchestration
   */

  async spawnAgent(agentConfig) {
    try {
      const agentId = await this.fleetCommander.registerAgent(agentConfig);

      // Initialize workload tracking
      this.agentWorkloads.set(agentId, {
        currentTasks: 0,
        totalTasks: 0,
        lastTaskTime: Date.now(),
        performanceScore: 1.0
      });

      await this.publishCoordinationEvent({
        type: 'agent_spawned',
        agentId,
        config: agentConfig,
        timestamp: Date.now()
      });

      return agentId;
    } catch (error) {
      this.emit('error', { type: 'spawn_failed', error: error.message });
      throw error;
    }
  }

  async monitorAgent(agentId) {
    const agent = await this.agentRegistry.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const workload = this.agentWorkloads.get(agentId);
    const healthStatus = await this.healthMonitor.checkAgent(agentId);

    return {
      agent,
      workload,
      healthStatus,
      timestamp: Date.now()
    };
  }

  async terminateAgent(agentId, reason = 'manual_termination') {
    try {
      // Check if agent has active tasks
      const activeTask = Array.from(this.activeTasks.values()).find(task => task.agentId === agentId);
      if (activeTask) {
        await this.handleTaskFailure(activeTask.taskId, 'agent_terminated');
      }

      // Remove from fleet
      await this.fleetCommander.registry.unregister(agentId);

      // Clean up workload tracking
      this.agentWorkloads.delete(agentId);
      this.performanceMetrics.delete(agentId);

      await this.publishCoordinationEvent({
        type: 'agent_terminated',
        agentId,
        reason,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('error', { type: 'termination_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Task distribution and load balancing
   */

  async submitTask(task) {
    const taskId = `task-${crypto.randomBytes(8).toString('hex')}`;
    const taskData = {
      id: taskId,
      ...task,
      status: 'queued',
      createdAt: Date.now(),
      priority: task.priority || 5,
      estimatedDuration: task.estimatedDuration || 30000
    };

    // Add to queue
    this.taskQueue.push(taskData);
    this.taskQueue.sort((a, b) => b.priority - a.priority); // Priority queue

    this.metrics.totalTasks++;

    await this.publishCoordinationEvent({
      type: 'task_submitted',
      task: taskData,
      timestamp: Date.now()
    });

    // Process queue immediately
    this.processTaskQueue();

    return taskId;
  }

  async processTaskQueue() {
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue[0];

      try {
        const allocation = await this.allocateAgentForTask(task);
        if (allocation) {
          this.taskQueue.shift(); // Remove from queue
          await this.executeTask(task, allocation.agentId);
        } else {
          // No available agents, wait for next cycle
          break;
        }
      } catch (error) {
        this.emit('error', { type: 'task_allocation_failed', error: error.message, taskId: task.id });
        this.taskQueue.shift();
        this.metrics.failedTasks++;
      }
    }
  }

  async allocateAgentForTask(task) {
    const availableAgents = await this.getAvailableAgentsForTask(task);
    if (availableAgents.length === 0) {
      return null;
    }

    // Use load balancing strategy
    const selectedAgent = this.loadBalancingStrategy(availableAgents, task);
    if (!selectedAgent) {
      return null;
    }

    // Update agent workload
    const workload = this.agentWorkloads.get(selectedAgent.id);
    if (workload) {
      workload.currentTasks++;
      workload.totalTasks++;
      workload.lastTaskTime = Date.now();
    }

    return { agentId: selectedAgent.id, agent: selectedAgent };
  }

  async getAvailableAgentsForTask(task) {
    const allAgents = await this.agentRegistry.listAll();

    return allAgents.filter(agent => {
      // Agent must be idle and healthy
      if (agent.status !== 'idle' || agent.health.failures > 0) {
        return false;
      }

      // Check capability match
      if (task.capabilities) {
        const hasCapabilities = task.capabilities.every(cap =>
          agent.capabilities.includes(cap)
        );
        if (!hasCapabilities) {
          return false;
        }
      }

      // Check pool type
      if (task.poolType && agent.type !== task.poolType) {
        return false;
      }

      return true;
    });
  }

  async executeTask(task, agentId) {
    const taskExecution = {
      taskId: task.id,
      agentId,
      startTime: Date.now(),
      status: 'executing',
      task
    };

    this.activeTasks.set(task.id, taskExecution);

    // Allocate agent through fleet commander
    await this.fleetCommander.allocateAgent({
      taskId: task.id,
      agentId: agentId,
      poolType: task.poolType || 'general',
      capabilities: task.capabilities
    });

    await this.publishCoordinationEvent({
      type: 'task_started',
      taskId: task.id,
      agentId,
      timestamp: Date.now()
    });

    // Set timeout for task execution
    setTimeout(() => {
      if (this.activeTasks.has(task.id)) {
        this.handleTaskTimeout(task.id);
      }
    }, task.timeout || 300000); // 5 minute default timeout
  }

  async handleTaskCompletion(taskId, result) {
    const taskExecution = this.activeTasks.get(taskId);
    if (!taskExecution) {
      return;
    }

    const duration = Date.now() - taskExecution.startTime;

    // Update agent workload
    const workload = this.agentWorkloads.get(taskExecution.agentId);
    if (workload) {
      workload.currentTasks--;

      // Update performance score
      const successRate = result.success ? 1.0 : 0.0;
      workload.performanceScore = (workload.performanceScore * 0.7) + (successRate * 0.3);
    }

    // Update metrics
    this.metrics.completedTasks++;
    this.metrics.averageTaskDuration =
      (this.metrics.averageTaskDuration * (this.metrics.completedTasks - 1) + duration) /
      this.metrics.completedTasks;

    // Release agent
    await this.fleetCommander.releaseAgent(taskExecution.agentId, {
      success: result.success,
      duration,
      result: result.data
    });

    // Clean up
    this.activeTasks.delete(taskId);

    await this.publishCoordinationEvent({
      type: 'task_completed',
      taskId,
      agentId: taskExecution.agentId,
      duration,
      result,
      timestamp: Date.now()
    });

    // Process next task in queue
    this.processTaskQueue();
  }

  async handleTaskFailure(taskId, error) {
    const taskExecution = this.activeTasks.get(taskId);
    if (!taskExecution) {
      return;
    }

    // Update agent workload
    const workload = this.agentWorkloads.get(taskExecution.agentId);
    if (workload) {
      workload.currentTasks--;
      workload.performanceScore *= 0.8; // Decrease performance score
    }

    // Update metrics
    this.metrics.failedTasks++;

    // Release agent
    await this.fleetCommander.releaseAgent(taskExecution.agentId, {
      success: false,
      error,
      duration: Date.now() - taskExecution.startTime
    });

    // Clean up
    this.activeTasks.delete(taskId);

    await this.publishCoordinationEvent({
      type: 'task_failed',
      taskId,
      agentId: taskExecution.agentId,
      error,
      timestamp: Date.now()
    });

    // Process next task in queue
    this.processTaskQueue();
  }

  async handleTaskTimeout(taskId) {
    await this.handleTaskFailure(taskId, 'Task execution timeout');
  }

  /**
   * Dynamic agent scaling
   */

  async calculateOptimalAgentCount(poolType) {
    const pool = await this.resourceAllocator.getPool(poolType);
    if (!pool) {
      return pool.currentAgents;
    }

    // Calculate based on queue length and agent utilization
    const poolTasks = this.taskQueue.filter(task => task.poolType === poolType);
    const activePoolTasks = Array.from(this.activeTasks.values())
      .filter(task => task.task.poolType === poolType);

    const utilizationRate = activePoolTasks.length / pool.currentAgents;
    const queuePressure = poolTasks.length / pool.currentAgents;

    // Scaling factors
    if (utilizationRate > 0.9 || queuePressure > 2) {
      return Math.min(pool.currentAgents + 2, pool.maxAgents);
    } else if (utilizationRate < 0.3 && queuePressure < 0.5) {
      return Math.max(pool.currentAgents - 1, pool.minAgents);
    }

    return pool.currentAgents;
  }

  async scalePool(poolType, targetSize) {
    try {
      const currentStatus = await this.fleetCommander.getFleetStatus();
      const currentPool = currentStatus.pools[poolType];

      if (!currentPool) {
        throw new Error(`Pool ${poolType} not found`);
      }

      const previousSize = currentPool.currentAgents;

      await this.fleetCommander.scalePool(poolType, targetSize);

      // Track scaling event
      this.scalingHistory.push({
        poolType,
        previousSize,
        newSize: targetSize,
        timestamp: Date.now(),
        reason: 'auto_scaling'
      });

      this.metrics.scalingEvents++;

      await this.publishCoordinationEvent({
        type: 'pool_scaled',
        poolType,
        previousSize,
        newSize: targetSize,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('error', { type: 'scaling_failed', error: error.message, poolType });
      throw error;
    }
  }

  async checkAndScalePools() {
    const poolStatus = await this.resourceAllocator.getPoolStatus();

    for (const [poolType, status] of Object.entries(poolStatus)) {
      const optimalSize = await this.calculateOptimalAgentCount(poolType);

      if (optimalSize !== status.currentAgents) {
        await this.scalePool(poolType, optimalSize);
      }
    }
  }

  /**
   * Fleet monitoring and metrics
   */

  async getFleetMetrics() {
    const fleetStatus = await this.fleetCommander.getFleetStatus();
    const redisMetrics = this.redisCoordinator.getMetrics();

    return {
      coordinator: {
        id: this.coordinatorId,
        uptime: this.isRunning ? Date.now() - this.metrics.startTime : 0,
        metrics: this.metrics
      },
      fleet: fleetStatus,
      coordination: {
        redis: redisMetrics,
        taskQueue: {
          size: this.taskQueue.length,
          activeTasks: this.activeTasks.size
        },
        scaling: {
          events: this.scalingHistory.length,
          recentHistory: this.scalingHistory.slice(-10)
        }
      },
      performance: this.calculatePerformanceMetrics(),
      timestamp: Date.now()
    };
  }

  calculatePerformanceMetrics() {
    const workloads = Array.from(this.agentWorkloads.values());
    const agents = workloads.length;

    if (agents === 0) {
      return { agentUtilization: 0, averagePerformance: 0 };
    }

    const totalTasks = workloads.reduce((sum, w) => sum + w.totalTasks, 0);
    const totalActive = workloads.reduce((sum, w) => sum + w.currentTasks, 0);
    const avgPerformance = workloads.reduce((sum, w) => sum + w.performanceScore, 0) / agents;

    return {
      agentUtilization: agents > 0 ? totalActive / agents : 0,
      averagePerformance: avgPerformance,
      totalTasksProcessed: totalTasks,
      activeTasks: totalActive
    };
  }

  async createMetricsDashboard() {
    const metrics = await this.getFleetMetrics();

    return {
      overview: {
        totalAgents: metrics.fleet.agents.total,
        activeAgents: metrics.fleet.agents.active,
        utilizationRate: metrics.performance.agentUtilization,
        taskQueueSize: metrics.coordination.taskQueue.size
      },
      performance: {
        tasksCompleted: this.metrics.completedTasks,
        tasksFailed: this.metrics.failedTasks,
        averageTaskDuration: this.metrics.averageTaskDuration,
        successRate: this.metrics.totalTasks > 0 ?
          this.metrics.completedTasks / this.metrics.totalTasks : 0
      },
      scaling: {
        totalEvents: this.metrics.scalingEvents,
        recentActivity: metrics.coordination.scaling.recentHistory
      },
      health: {
        coordinatorUptime: metrics.coordinator.uptime,
        redisLatency: metrics.coordination.redis.averageLatency
      },
      pools: metrics.fleet.pools,
      timestamp: Date.now()
    };
  }

  /**
   * Event handlers and coordination
   */

  setupEventHandlers() {
    this.on('error', (error) => {
      console.error('❌ SwarmCoordinator error:', error);
    });

    this.on('status', (status) => {
      console.log(`📊 SwarmCoordinator status: ${status.status} - ${status.message}`);
    });
  }

  startOrchestration() {
    // Task queue processing
    this.taskProcessingInterval = setInterval(() => {
      this.processTaskQueue();
    }, 1000);

    // Auto-scaling checks
    this.scalingInterval = setInterval(() => {
      this.checkAndScalePools();
    }, 30000);

    // Metrics collection
    this.metricsInterval = setInterval(() => {
      this.collectAndPublishMetrics();
    }, this.config.coordinationInterval);

    console.log('🔄 Orchestration processes started');
  }

  stopOrchestration() {
    if (this.taskProcessingInterval) {
      clearInterval(this.taskProcessingInterval);
    }

    if (this.scalingInterval) {
      clearInterval(this.scalingInterval);
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    console.log('⏹️ Orchestration processes stopped');
  }

  async handleOrchestrationCommand(message) {
    switch (message.type) {
      case 'spawn_agent':
        await this.spawnAgent(message.config);
        break;
      case 'terminate_agent':
        await this.terminateAgent(message.agentId, message.reason);
        break;
      case 'submit_task':
        await this.submitTask(message.task);
        break;
      case 'scale_pool':
        await this.scalePool(message.poolType, message.targetSize);
        break;
      case 'get_metrics':
        await this.publishCoordinationEvent({
          type: 'metrics_response',
          requestId: message.requestId,
          metrics: await this.getFleetMetrics(),
          timestamp: Date.now()
        });
        break;
    }
  }

  async handleScalingEvent(message) {
    // Process scaling events from other coordinators or components
    this.emit('scaling_event', message);
  }

  async handleMonitoringData(message) {
    // Process monitoring and health data
    this.emit('monitoring_data', message);

    // Handle agent health issues
    if (message.type === 'agent_unhealthy') {
      await this.handleUnhealthyAgent(message.agentId, message.reason);
    }
  }

  async handleUnhealthyAgent(agentId, reason) {
    try {
      // Check if agent has active tasks
      const activeTask = Array.from(this.activeTasks.values()).find(task => task.agentId === agentId);
      if (activeTask) {
        await this.handleTaskFailure(activeTask.taskId, `Agent unhealthy: ${reason}`);
      }

      // Terminate unhealthy agent
      await this.terminateAgent(agentId, `Unhealthy: ${reason}`);

      this.metrics.recoveryEvents++;

    } catch (error) {
      this.emit('error', { type: 'unhealthy_agent_handling_failed', error: error.message, agentId });
    }
  }

  async publishCoordinationEvent(data) {
    if (this.redisCoordinator) {
      await this.redisCoordinator.publish(this.config.channels.coordination, data);
    }
  }

  async collectAndPublishMetrics() {
    const metrics = await this.getFleetMetrics();

    await this.publishCoordinationEvent({
      type: 'metrics_update',
      metrics,
      timestamp: Date.now()
    });
  }

  /**
   * Shutdown the SwarmCoordinator
   */
  async shutdown() {
    this.emit('status', { status: 'shutting_down', message: 'Shutting down SwarmCoordinator' });

    this.isRunning = false;
    this.stopOrchestration();

    // Complete active tasks gracefully
    for (const [taskId, taskExecution] of this.activeTasks.entries()) {
      await this.handleTaskFailure(taskId, 'Coordinator shutdown');
    }

    // Shutdown fleet commander
    if (this.fleetCommander) {
      await this.fleetCommander.shutdown();
    }

    // Shutdown Redis coordinator
    if (this.redisCoordinator) {
      await this.redisCoordinator.close();
    }

    // Announce shutdown
    await this.publishCoordinationEvent({
      type: 'coordinator_shutdown',
      coordinatorId: this.coordinatorId,
      timestamp: Date.now()
    });

    this.emit('status', { status: 'shutdown', message: 'SwarmCoordinator shutdown complete' });
    console.log('🛑 SwarmCoordinator shutdown complete');
  }
}

export default SwarmCoordinator;