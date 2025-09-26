import { EventEmitter } from 'events';
import { Logger } from '../core/logger';
import { generateId } from '../utils/helpers';
import { LifecycleManager } from '../agents/lifecycle-manager';
import { DependencyTracker, DependencyType } from '../lifecycle/dependency-tracker';
import {
  TopologyType,
  TopologyConfiguration,
  TopologyMetrics,
  ITopologyCoordinator,
  CoordinationMessage,
  AgentRegistration,
  TaskExecution,
  TopologyEvent,
} from './types';

export interface AdaptationStrategy {
  id: string;
  name: string;
  description: string;
  conditions: Array<(metrics: TopologyMetrics) => boolean>;
  targetTopology: TopologyType;
  confidence: number;
  estimatedImprovements: {
    latency: number;
    throughput: number;
    reliability: number;
    efficiency: number;
  };
}

export interface AdaptiveCoordinatorConfig extends TopologyConfiguration {
  adaptationInterval: number;
  confidenceThreshold: number;
  stabilityPeriod: number;
  maxAdaptationsPerHour: number;
  enableHybridMode: boolean;
  adaptationStrategies: AdaptationStrategy[];
}

export class AdaptiveCoordinator extends EventEmitter implements ITopologyCoordinator {
  public readonly id: string;
  public readonly type: TopologyType = 'hybrid';
  public config: AdaptiveCoordinatorConfig;

  private logger: Logger;
  private lifecycleManager: LifecycleManager;
  private dependencyTracker: DependencyTracker;
  private agents: Map<string, AgentRegistration>;
  private tasks: Map<string, TaskExecution>;
  private isRunning: boolean = false;
  private currentStrategy: AdaptationStrategy | null = null;
  private adaptationHistory: Array<{
    timestamp: Date;
    strategy: AdaptationStrategy;
    metrics: TopologyMetrics;
    success: boolean;
  }> = [];
  private lastAdaptation: Date | null = null;
  private adaptationCount: number = 0;
  private adaptationTimer?: NodeJS.Timeout;
  private activeTopology: TopologyType = 'mesh';
  private performanceHistory: TopologyMetrics[] = [];
  private stabilityCounter: number = 0;

  constructor(config: Partial<AdaptiveCoordinatorConfig> = {}) {
    super();

    this.id = generateId('adaptive-coord');
    this.logger = new Logger(`AdaptiveCoordinator[${this.id}]`);

    this.config = {
      type: 'hybrid',
      name: `adaptive-coordinator-${this.id}`,
      strategy: 'adaptive',
      faultTolerance: 'byzantine',
      loadBalancing: 'adaptive',
      maxAgents: 50,
      maxConnections: 20,
      enableCrossTopology: true,
      enableAdaptiveOptimization: true,
      performanceThresholds: {
        latency: 1000,
        throughput: 100,
        errorRate: 0.05,
      },
      timeouts: {
        coordination: 30000,
        completion: 300000,
        adaptation: 120000,
      },
      memoryNamespace: `adaptive-coord-${this.id}`,
      adaptationInterval: 60000, // 1 minute
      confidenceThreshold: 0.7,
      stabilityPeriod: 300000, // 5 minutes
      maxAdaptationsPerHour: 6,
      enableHybridMode: true,
      adaptationStrategies: [],
      ...config,
    };

    this.agents = new Map();
    this.tasks = new Map();
    this.lifecycleManager = new LifecycleManager();
    this.dependencyTracker = new DependencyTracker(this.config.memoryNamespace);

    this.initializeAdaptationStrategies();
  }

  async initialize(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Adaptive coordinator already running');
      return;
    }

    this.logger.info('Initializing adaptive coordinator...');

    // Initialize dependency tracker
    await this.dependencyTracker.initialize();

    // Start with mesh topology by default
    this.activeTopology = 'mesh';

    this.isRunning = true;
    this.startAdaptationCycle();

    this.logger.info('Adaptive coordinator initialized successfully');
    this.emit('coordinator:initialized', {
      type: 'coordinator:initialized',
      timestamp: new Date(),
      topologyId: this.id,
      data: { activeTopology: this.activeTopology },
    } as TopologyEvent);
  }

  async shutdown(force: boolean = false): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info('Shutting down adaptive coordinator...');
    this.isRunning = false;

    // Stop adaptation cycle
    this.stopAdaptationCycle();

    // Complete all pending tasks
    if (!force) {
      await this.completePendingTasks();
    }

    // Shutdown dependency tracker
    await this.dependencyTracker.shutdown();

    this.logger.info('Adaptive coordinator shutdown complete');
    this.emit('coordinator:shutdown', {
      type: 'coordinator:shutdown',
      timestamp: new Date(),
      topologyId: this.id,
      data: { force },
    } as TopologyEvent);
  }

  async registerAgent(agent: AgentRegistration): Promise<void> {
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error('Maximum agent limit reached');
    }

    this.agents.set(agent.id, {
      ...agent,
      registeredAt: new Date(),
      status: 'active',
    });

    // Add agent to current topology pattern
    await this.integrateAgentIntoTopology(agent);

    this.logger.info(`Registered agent ${agent.id} in ${this.activeTopology} topology`);
    this.emit('agent:registered', {
      type: 'agent:registered',
      timestamp: new Date(),
      topologyId: this.id,
      data: { agent },
    } as TopologyEvent);
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Check for dependencies
    const hasDependencies = await this.dependencyTracker.hasDependencies(agentId);
    if (hasDependencies) {
      throw new Error(`Cannot unregister agent ${agentId}: has active dependencies`);
    }

    // Remove from topology
    await this.removeAgentFromTopology(agent);

    this.agents.delete(agentId);

    this.logger.info(`Unregistered agent ${agentId}`);
    this.emit('agent:unregistered', {
      type: 'agent:unregistered',
      timestamp: new Date(),
      topologyId: this.id,
      data: { agentId },
    } as TopologyEvent);
  }

  async executeTask(task: TaskExecution): Promise<void> {
    const taskId = generateId('task');
    const enhancedTask = {
      ...task,
      id: taskId,
      coordinatorId: this.id,
      topology: this.activeTopology,
      startTime: new Date(),
      status: 'running' as const,
    };

    this.tasks.set(taskId, enhancedTask);

    try {
      this.logger.info(`Executing task ${taskId} with ${this.activeTopology} topology`);

      // Execute based on current topology
      await this.executeTaskWithTopology(enhancedTask);

      enhancedTask.status = 'completed';
      enhancedTask.endTime = new Date();

      this.emit('task:completed', {
        type: 'task:completed',
        timestamp: new Date(),
        topologyId: this.id,
        data: { task: enhancedTask },
      } as TopologyEvent);
    } catch (error) {
      enhancedTask.status = 'failed';
      enhancedTask.endTime = new Date();
      enhancedTask.error = error.message;

      this.logger.error(`Task ${taskId} failed: ${error.message}`);
      this.emit('task:failed', {
        type: 'task:failed',
        timestamp: new Date(),
        topologyId: this.id,
        data: { task: enhancedTask, error: error.message },
      } as TopologyEvent);

      throw error;
    }
  }

  async routeMessage(message: CoordinationMessage): Promise<void> {
    this.logger.debug(`Routing message ${message.id} in ${this.activeTopology} topology`);

    switch (this.activeTopology) {
      case 'mesh':
        await this.routeMessageMesh(message);
        break;
      case 'hierarchical':
        await this.routeMessageHierarchical(message);
        break;
      case 'hybrid':
        await this.routeMessageHybrid(message);
        break;
      default:
        throw new Error(`Unsupported topology: ${this.activeTopology}`);
    }
  }

  getMetrics(): TopologyMetrics {
    const agents = Array.from(this.agents.values());
    const tasks = Array.from(this.tasks.values());
    const completedTasks = tasks.filter((t) => t.status === 'completed');
    const failedTasks = tasks.filter((t) => t.status === 'failed');

    const latencies = completedTasks
      .filter((t) => t.startTime && t.endTime)
      .map((t) => t.endTime!.getTime() - t.startTime!.getTime());

    const averageLatency =
      latencies.length > 0 ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0;

    const errorRate = tasks.length > 0 ? failedTasks.length / tasks.length : 0;

    const now = Date.now();
    const recentTasks = tasks.filter((t) => t.startTime && now - t.startTime.getTime() < 60000);
    const throughput = recentTasks.length; // tasks per minute

    return {
      agentCount: agents.length,
      activeConnections: this.calculateActiveConnections(),
      averageLatency,
      throughput,
      errorRate,
      resourceUtilization: this.calculateResourceUtilization(),
      faultTolerance: this.calculateFaultTolerance(),
      lastUpdated: new Date(),
    };
  }

  async adaptTopology(): Promise<void> {
    if (!this.canAdaptNow()) {
      this.logger.debug('Adaptation skipped: too frequent or not enough stability');
      return;
    }

    const currentMetrics = this.getMetrics();
    this.performanceHistory.push(currentMetrics);

    // Keep only recent history
    if (this.performanceHistory.length > 10) {
      this.performanceHistory = this.performanceHistory.slice(-10);
    }

    // Find best adaptation strategy
    const bestStrategy = this.findBestAdaptationStrategy(currentMetrics);

    if (bestStrategy && bestStrategy.confidence >= this.config.confidenceThreshold) {
      await this.applyAdaptationStrategy(bestStrategy, currentMetrics);
    } else {
      this.stabilityCounter++;
      this.logger.debug(`No adaptation needed. Stability: ${this.stabilityCounter}`);
    }
  }

  private initializeAdaptationStrategies(): void {
    this.config.adaptationStrategies = [
      {
        id: 'high-latency-to-mesh',
        name: 'High Latency → Mesh',
        description: 'Switch to mesh topology when latency is high',
        conditions: [
          (metrics) => metrics.averageLatency > this.config.performanceThresholds.latency * 2,
          (metrics) => metrics.agentCount <= 20,
        ],
        targetTopology: 'mesh',
        confidence: 0.8,
        estimatedImprovements: {
          latency: -0.4, // 40% reduction
          throughput: 0.2, // 20% increase
          reliability: 0.1, // 10% increase
          efficiency: -0.1, // 10% decrease (more connections)
        },
      },
      {
        id: 'large-scale-to-hierarchical',
        name: 'Large Scale → Hierarchical',
        description: 'Switch to hierarchical topology for large agent populations',
        conditions: [
          (metrics) => metrics.agentCount > 30,
          (metrics) => metrics.resourceUtilization > 0.8,
        ],
        targetTopology: 'hierarchical',
        confidence: 0.85,
        estimatedImprovements: {
          latency: 0.1, // 10% increase
          throughput: 0.3, // 30% increase
          reliability: 0.2, // 20% increase
          efficiency: 0.4, // 40% increase
        },
      },
      {
        id: 'high-error-to-hybrid',
        name: 'High Error Rate → Hybrid',
        description: 'Switch to hybrid topology when error rate is high',
        conditions: [
          (metrics) => metrics.errorRate > this.config.performanceThresholds.errorRate * 2,
          (metrics) => metrics.faultTolerance < 0.8,
        ],
        targetTopology: 'hybrid',
        confidence: 0.75,
        estimatedImprovements: {
          latency: 0.05, // 5% increase
          throughput: 0.15, // 15% increase
          reliability: 0.3, // 30% increase
          efficiency: 0.1, // 10% increase
        },
      },
      {
        id: 'low-throughput-optimization',
        name: 'Low Throughput Optimization',
        description: 'Optimize for throughput when performance is low',
        conditions: [
          (metrics) => metrics.throughput < this.config.performanceThresholds.throughput * 0.5,
          (metrics) => this.stabilityCounter > 3,
        ],
        targetTopology: this.activeTopology === 'mesh' ? 'hierarchical' : 'mesh',
        confidence: 0.6,
        estimatedImprovements: {
          latency: 0, // neutral
          throughput: 0.25, // 25% increase
          reliability: 0.05, // 5% increase
          efficiency: 0.15, // 15% increase
        },
      },
    ];
  }

  private canAdaptNow(): boolean {
    const now = new Date();

    // Check adaptation frequency limit
    if (this.lastAdaptation) {
      const hoursSinceLastAdaptation =
        (now.getTime() - this.lastAdaptation.getTime()) / (1000 * 60 * 60);
      if (
        hoursSinceLastAdaptation < 1 &&
        this.adaptationCount >= this.config.maxAdaptationsPerHour
      ) {
        return false;
      }
    }

    // Check stability period
    if (this.lastAdaptation) {
      const timeSinceLastAdaptation = now.getTime() - this.lastAdaptation.getTime();
      if (timeSinceLastAdaptation < this.config.stabilityPeriod) {
        return false;
      }
    }

    return true;
  }

  private findBestAdaptationStrategy(metrics: TopologyMetrics): AdaptationStrategy | null {
    const validStrategies = this.config.adaptationStrategies.filter((strategy) => {
      // Don't suggest current topology unless it's a different configuration
      if (strategy.targetTopology === this.activeTopology) {
        return false;
      }

      // Check all conditions
      return strategy.conditions.every((condition) => condition(metrics));
    });

    if (validStrategies.length === 0) {
      return null;
    }

    // Return strategy with highest confidence
    return validStrategies.sort((a, b) => b.confidence - a.confidence)[0];
  }

  private async applyAdaptationStrategy(
    strategy: AdaptationStrategy,
    currentMetrics: TopologyMetrics,
  ): Promise<void> {
    this.logger.info(`Applying adaptation strategy: ${strategy.name}`);

    const previousTopology = this.activeTopology;

    try {
      // Record adaptation attempt
      this.adaptationHistory.push({
        timestamp: new Date(),
        strategy,
        metrics: currentMetrics,
        success: false, // Will be updated on success
      });

      // Transition to new topology
      await this.transitionToTopology(strategy.targetTopology);

      // Update success status
      const lastAdaptation = this.adaptationHistory[this.adaptationHistory.length - 1];
      lastAdaptation.success = true;

      // Update state
      this.activeTopology = strategy.targetTopology;
      this.currentStrategy = strategy;
      this.lastAdaptation = new Date();
      this.adaptationCount++;
      this.stabilityCounter = 0;

      this.logger.info(
        `Successfully adapted from ${previousTopology} to ${strategy.targetTopology}`,
      );

      this.emit('topology:adapted', {
        type: 'topology:adapted',
        timestamp: new Date(),
        topologyId: this.id,
        data: {
          previousTopology,
          newTopology: strategy.targetTopology,
          strategy,
          metrics: currentMetrics,
        },
      } as TopologyEvent);
    } catch (error) {
      this.logger.error(`Adaptation failed: ${error.message}`);

      // Revert on failure
      try {
        await this.transitionToTopology(previousTopology);
        this.activeTopology = previousTopology;
      } catch (revertError) {
        this.logger.error(`Failed to revert topology: ${revertError.message}`);
      }

      this.emit('topology:adaptation_failed', {
        type: 'topology:adaptation_failed',
        timestamp: new Date(),
        topologyId: this.id,
        data: {
          strategy,
          error: error.message,
          metrics: currentMetrics,
        },
      } as TopologyEvent);

      throw error;
    }
  }

  private async transitionToTopology(targetTopology: TopologyType): Promise<void> {
    this.logger.info(`Transitioning to ${targetTopology} topology...`);

    // Pause all agents during transition
    const agents = Array.from(this.agents.values());
    for (const agent of agents) {
      await this.lifecycleManager.pauseAgent(agent.id);
    }

    try {
      // Remove agents from current topology
      for (const agent of agents) {
        await this.removeAgentFromTopology(agent);
      }

      // Set new topology
      this.activeTopology = targetTopology;

      // Add agents to new topology
      for (const agent of agents) {
        await this.integrateAgentIntoTopology(agent);
      }

      // Resume all agents
      for (const agent of agents) {
        await this.lifecycleManager.resumeAgent(agent.id);
      }
    } catch (error) {
      // Resume agents on failure
      for (const agent of agents) {
        try {
          await this.lifecycleManager.resumeAgent(agent.id);
        } catch (resumeError) {
          this.logger.warn(`Failed to resume agent ${agent.id}: ${resumeError.message}`);
        }
      }
      throw error;
    }
  }

  private async integrateAgentIntoTopology(agent: AgentRegistration): Promise<void> {
    switch (this.activeTopology) {
      case 'mesh':
        await this.integrateAgentMesh(agent);
        break;
      case 'hierarchical':
        await this.integrateAgentHierarchical(agent);
        break;
      case 'hybrid':
        await this.integrateAgentHybrid(agent);
        break;
    }
  }

  private async removeAgentFromTopology(agent: AgentRegistration): Promise<void> {
    // Remove all dependencies for this agent
    const dependencies = await this.dependencyTracker.getAgentDependencies(agent.id);
    for (const depId of dependencies) {
      await this.dependencyTracker.removeDependency(depId);
    }
  }

  private async integrateAgentMesh(agent: AgentRegistration): Promise<void> {
    // In mesh topology, connect agent to all other agents
    const otherAgents = Array.from(this.agents.values()).filter((a) => a.id !== agent.id);

    for (const otherAgent of otherAgents) {
      await this.dependencyTracker.addDependency(
        agent.id,
        otherAgent.id,
        DependencyType.COORDINATION,
        { topology: 'mesh', relationship: 'peer' },
      );
    }
  }

  private async integrateAgentHierarchical(agent: AgentRegistration): Promise<void> {
    const agents = Array.from(this.agents.values());

    // Simple hierarchical assignment: first agent becomes coordinator
    if (agents.length === 1) {
      // This is the coordinator
      return;
    }

    // Find coordinator (first agent)
    const coordinator = agents[0];
    if (coordinator && coordinator.id !== agent.id) {
      await this.dependencyTracker.addDependency(
        agent.id,
        coordinator.id,
        DependencyType.COORDINATION,
        { topology: 'hierarchical', relationship: 'subordinate' },
      );
    }
  }

  private async integrateAgentHybrid(agent: AgentRegistration): Promise<void> {
    const agents = Array.from(this.agents.values());
    const coordinatorCount = Math.ceil(agents.length / 5); // 1 coordinator per 5 agents

    if (agents.indexOf(agent) < coordinatorCount) {
      // This agent is a coordinator - connect to other coordinators
      const coordinators = agents.slice(0, coordinatorCount).filter((a) => a.id !== agent.id);
      for (const coordinator of coordinators) {
        await this.dependencyTracker.addDependency(
          agent.id,
          coordinator.id,
          DependencyType.COORDINATION,
          { topology: 'hybrid', relationship: 'coordinator-peer' },
        );
      }
    } else {
      // This agent is a worker - connect to assigned coordinator
      const coordinatorIndex = (agents.indexOf(agent) - coordinatorCount) % coordinatorCount;
      const coordinator = agents[coordinatorIndex];
      if (coordinator) {
        await this.dependencyTracker.addDependency(
          agent.id,
          coordinator.id,
          DependencyType.COORDINATION,
          { topology: 'hybrid', relationship: 'worker' },
        );
      }
    }
  }

  private async executeTaskWithTopology(task: TaskExecution): Promise<void> {
    switch (this.activeTopology) {
      case 'mesh':
        await this.executeTaskMesh(task);
        break;
      case 'hierarchical':
        await this.executeTaskHierarchical(task);
        break;
      case 'hybrid':
        await this.executeTaskHybrid(task);
        break;
    }
  }

  private async executeTaskMesh(task: TaskExecution): Promise<void> {
    // In mesh topology, distribute task to all agents
    const agents = Array.from(this.agents.values());
    const promises = agents.map((agent) => this.executeTaskOnAgent(task, agent));
    await Promise.all(promises);
  }

  private async executeTaskHierarchical(task: TaskExecution): Promise<void> {
    // In hierarchical topology, coordinator distributes to subordinates
    const agents = Array.from(this.agents.values());
    const coordinator = agents[0];

    if (coordinator) {
      await this.executeTaskOnAgent(task, coordinator);

      // Coordinator delegates to subordinates
      const subordinates = agents.slice(1);
      const promises = subordinates.map((agent) => this.executeTaskOnAgent(task, agent));
      await Promise.all(promises);
    }
  }

  private async executeTaskHybrid(task: TaskExecution): Promise<void> {
    // In hybrid topology, coordinators manage their groups
    const agents = Array.from(this.agents.values());
    const coordinatorCount = Math.ceil(agents.length / 5);
    const coordinators = agents.slice(0, coordinatorCount);

    const promises = coordinators.map(async (coordinator, index) => {
      await this.executeTaskOnAgent(task, coordinator);

      // Each coordinator manages their workers
      const workerStart = coordinatorCount + index * 4;
      const workers = agents.slice(workerStart, workerStart + 4);

      const workerPromises = workers.map((worker) => this.executeTaskOnAgent(task, worker));
      await Promise.all(workerPromises);
    });

    await Promise.all(promises);
  }

  private async executeTaskOnAgent(task: TaskExecution, agent: AgentRegistration): Promise<void> {
    // Simulate task execution
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000));

    this.logger.debug(`Task ${task.id} executed on agent ${agent.id}`);
  }

  private async routeMessageMesh(message: CoordinationMessage): Promise<void> {
    // In mesh topology, route message to all connected agents
    const agents = Array.from(this.agents.values());
    const promises = agents.map((agent) => this.deliverMessageToAgent(message, agent));
    await Promise.all(promises);
  }

  private async routeMessageHierarchical(message: CoordinationMessage): Promise<void> {
    // In hierarchical topology, route through coordinator
    const agents = Array.from(this.agents.values());
    const coordinator = agents[0];

    if (coordinator) {
      await this.deliverMessageToAgent(message, coordinator);

      // Coordinator forwards to subordinates if needed
      if (message.broadcast) {
        const subordinates = agents.slice(1);
        const promises = subordinates.map((agent) => this.deliverMessageToAgent(message, agent));
        await Promise.all(promises);
      }
    }
  }

  private async routeMessageHybrid(message: CoordinationMessage): Promise<void> {
    // In hybrid topology, route through appropriate coordinators
    const agents = Array.from(this.agents.values());
    const coordinatorCount = Math.ceil(agents.length / 5);
    const coordinators = agents.slice(0, coordinatorCount);

    // Route to coordinators
    const coordinatorPromises = coordinators.map((coord) =>
      this.deliverMessageToAgent(message, coord),
    );
    await Promise.all(coordinatorPromises);

    // Coordinators forward to their workers if broadcast
    if (message.broadcast) {
      const workerPromises = coordinators.map(async (coordinator, index) => {
        const workerStart = coordinatorCount + index * 4;
        const workers = agents.slice(workerStart, workerStart + 4);
        const promises = workers.map((worker) => this.deliverMessageToAgent(message, worker));
        await Promise.all(promises);
      });

      await Promise.all(workerPromises);
    }
  }

  private async deliverMessageToAgent(
    message: CoordinationMessage,
    agent: AgentRegistration,
  ): Promise<void> {
    // Simulate message delivery
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));

    this.logger.debug(`Message ${message.id} delivered to agent ${agent.id}`);
  }

  private calculateActiveConnections(): number {
    const agentCount = this.agents.size;

    switch (this.activeTopology) {
      case 'mesh':
        return agentCount * (agentCount - 1);
      case 'hierarchical':
        return Math.max(0, agentCount - 1);
      case 'hybrid':
        const coordinatorCount = Math.ceil(agentCount / 5);
        const coordinatorConnections = coordinatorCount * (coordinatorCount - 1);
        const workerConnections = agentCount - coordinatorCount;
        return coordinatorConnections + workerConnections;
      default:
        return 0;
    }
  }

  private calculateResourceUtilization(): number {
    const agentCount = this.agents.size;
    const maxAgents = this.config.maxAgents;
    const connectionUtilization = this.calculateActiveConnections() / (maxAgents * maxAgents);
    const agentUtilization = agentCount / maxAgents;

    return (connectionUtilization + agentUtilization) / 2;
  }

  private calculateFaultTolerance(): number {
    const agentCount = this.agents.size;

    switch (this.activeTopology) {
      case 'mesh':
        // Mesh provides high fault tolerance
        return Math.min(0.95, 0.5 + agentCount * 0.05);
      case 'hierarchical':
        // Hierarchical has lower fault tolerance due to single points of failure
        return Math.min(0.8, 0.3 + agentCount * 0.02);
      case 'hybrid':
        // Hybrid provides balanced fault tolerance
        return Math.min(0.9, 0.4 + agentCount * 0.03);
      default:
        return 0.5;
    }
  }

  private startAdaptationCycle(): void {
    this.adaptationTimer = setInterval(() => {
      this.adaptTopology().catch((error) => {
        this.logger.error(`Adaptation cycle error: ${error.message}`);
      });
    }, this.config.adaptationInterval);
  }

  private stopAdaptationCycle(): void {
    if (this.adaptationTimer) {
      clearInterval(this.adaptationTimer);
      this.adaptationTimer = undefined;
    }
  }

  private async completePendingTasks(): Promise<void> {
    const pendingTasks = Array.from(this.tasks.values()).filter(
      (task) => task.status === 'running',
    );

    if (pendingTasks.length > 0) {
      this.logger.info(`Waiting for ${pendingTasks.length} pending tasks to complete...`);

      const timeout = this.config.timeouts.completion;
      const completionPromises = pendingTasks.map((task) =>
        this.waitForTaskCompletion(task.id!, timeout),
      );

      await Promise.allSettled(completionPromises);
    }
  }

  private async waitForTaskCompletion(taskId: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task ${taskId} completion timeout`));
      }, timeout);

      const checkCompletion = () => {
        const task = this.tasks.get(taskId);
        if (task && task.status !== 'running') {
          clearTimeout(timer);
          resolve();
        } else {
          setTimeout(checkCompletion, 1000);
        }
      };

      checkCompletion();
    });
  }
}
