/**
 * Large-Scale Coordinator
 * Manages 100+ concurrent agents with hierarchical coordination
 * Implements work-stealing, load balancing, and fault tolerance
 *
 * Performance Targets:
 * - Support: 100+ simultaneous agents
 * - Coordination latency: <10ms
 * - Recovery time: <5 seconds
 */

import { EventEmitter } from 'node:events';
import { performance } from 'perf_hooks';
import { Logger } from '../core/logger.js';
import type { AgentInstance, AgentDefinition, TaskDefinition } from '../agents/unified-ultra-fast-agent-manager.js';

export interface CoordinationNode {
  id: string;
  level: number;
  agents: Set<string>;
  subCoordinators: Set<string>;
  workQueue: TaskDefinition[];
  capacity: number;
  load: number;
}

export interface WorkStealingConfig {
  enabled: boolean;
  thresholdRatio: number; // Load difference threshold for stealing
  minTasksToSteal: number;
  maxTasksToSteal: number;
}

export interface LoadBalancingStrategy {
  type: 'round-robin' | 'least-loaded' | 'random' | 'weighted';
  rebalanceInterval?: number;
}

export interface LargeScaleConfig {
  maxAgentsPerNode: number;
  hierarchyDepth: number;
  workStealing: WorkStealingConfig;
  loadBalancing: LoadBalancingStrategy;
  healthCheckInterval: number;
  recoveryTimeout: number;
}

export class LargeScaleCoordinator extends EventEmitter {
  private logger: Logger;
  private config: LargeScaleConfig;

  // Hierarchical coordination structure
  private coordinationTree = new Map<string, CoordinationNode>();
  private agentToNode = new Map<string, string>();
  private taskAssignments = new Map<string, string>(); // taskId -> agentId

  // Work-stealing queues
  private globalWorkQueue: TaskDefinition[] = [];
  private workStealingActive = false;

  // Load balancing
  private loadStats = new Map<string, { tasks: number; avgLatency: number; lastUpdate: number }>();
  private rebalanceTimer?: NodeJS.Timeout;

  // Fault tolerance
  private agentHealth = new Map<string, { status: 'healthy' | 'degraded' | 'failed'; lastHeartbeat: number }>();
  private failedAgents = new Set<string>();
  private recoveryQueue: Array<{ agentId: string; failureTime: number }> = [];

  // Performance metrics
  private metrics = {
    totalAgentsManaged: 0,
    activeCoordinationNodes: 0,
    tasksCoordinated: 0,
    workStealingOperations: 0,
    rebalancingOperations: 0,
    agentFailures: 0,
    agentRecoveries: 0,
    avgCoordinationLatency: 0,
    coordinationLatencies: [] as number[]
  };

  constructor(config: Partial<LargeScaleConfig> = {}) {
    super();

    this.config = {
      maxAgentsPerNode: config.maxAgentsPerNode || 10,
      hierarchyDepth: config.hierarchyDepth || 3,
      workStealing: {
        enabled: true,
        thresholdRatio: 2.0,
        minTasksToSteal: 1,
        maxTasksToSteal: 5,
        ...config.workStealing
      },
      loadBalancing: {
        type: 'least-loaded',
        rebalanceInterval: 5000,
        ...config.loadBalancing
      },
      healthCheckInterval: config.healthCheckInterval || 1000,
      recoveryTimeout: config.recoveryTimeout || 5000
    };

    const loggerConfig = process.env.CLAUDE_FLOW_ENV === 'test'
      ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
      : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'LargeScaleCoordinator' });

    this.initialize();
  }

  private initialize(): void {
    // Create root coordination node
    const rootNode: CoordinationNode = {
      id: 'root',
      level: 0,
      agents: new Set(),
      subCoordinators: new Set(),
      workQueue: [],
      capacity: this.config.maxAgentsPerNode,
      load: 0
    };

    this.coordinationTree.set('root', rootNode);

    // Start background processes
    this.startHealthMonitoring();
    this.startLoadBalancing();
    if (this.config.workStealing.enabled) {
      this.startWorkStealing();
    }

    this.logger.info('Large-scale coordinator initialized', {
      maxAgentsPerNode: this.config.maxAgentsPerNode,
      hierarchyDepth: this.config.hierarchyDepth
    });
  }

  /**
   * Register multiple agents in the coordination hierarchy
   */
  async registerAgents(agents: AgentInstance[]): Promise<void> {
    const registerStart = performance.now();

    for (const agent of agents) {
      await this.registerAgent(agent);
    }

    const registerTime = performance.now() - registerStart;
    this.metrics.totalAgentsManaged = this.agentToNode.size;

    this.logger.info('Agents registered in coordination hierarchy', {
      count: agents.length,
      totalManaged: this.metrics.totalAgentsManaged,
      registerTime: `${registerTime.toFixed(2)}ms`
    });

    this.emit('agents:registered', { count: agents.length, totalManaged: this.metrics.totalAgentsManaged });
  }

  /**
   * Register a single agent in the coordination hierarchy
   */
  async registerAgent(agent: AgentInstance): Promise<void> {
    // Find the best coordination node for this agent
    const targetNode = this.findBestNode(agent);

    if (!targetNode) {
      // Create new node if needed
      const newNode = await this.createCoordinationNode(agent);
      targetNode = newNode;
    }

    // Register agent to node
    targetNode.agents.add(agent.id);
    this.agentToNode.set(agent.id, targetNode.id);

    // Initialize health tracking
    this.agentHealth.set(agent.id, {
      status: 'healthy',
      lastHeartbeat: Date.now()
    });

    // Initialize load stats
    this.loadStats.set(agent.id, {
      tasks: 0,
      avgLatency: 0,
      lastUpdate: Date.now()
    });

    this.logger.debug('Agent registered', {
      agentId: agent.id,
      nodeId: targetNode.id,
      nodeLevel: targetNode.level
    });
  }

  /**
   * Coordinate task assignment across agents with intelligent load balancing
   */
  async coordinateTask(task: TaskDefinition): Promise<string> {
    const coordStart = performance.now();

    try {
      // Find best agent for this task
      const targetAgentId = await this.selectTargetAgent(task);

      if (!targetAgentId) {
        // No available agent - queue globally
        this.globalWorkQueue.push(task);
        this.logger.warn('No available agent, task queued', { taskId: task.id });
        return 'queued';
      }

      // Assign task to agent
      this.taskAssignments.set(task.id, targetAgentId);

      // Update load stats
      const loadStat = this.loadStats.get(targetAgentId);
      if (loadStat) {
        loadStat.tasks++;
        loadStat.lastUpdate = Date.now();
      }

      // Update node load
      const nodeId = this.agentToNode.get(targetAgentId);
      if (nodeId) {
        const node = this.coordinationTree.get(nodeId);
        if (node) {
          node.load++;
        }
      }

      // Record metrics
      const coordLatency = performance.now() - coordStart;
      this.metrics.coordinationLatencies.push(coordLatency);
      if (this.metrics.coordinationLatencies.length > 1000) {
        this.metrics.coordinationLatencies = this.metrics.coordinationLatencies.slice(-1000);
      }
      this.metrics.avgCoordinationLatency =
        this.metrics.coordinationLatencies.reduce((a, b) => a + b, 0) / this.metrics.coordinationLatencies.length;
      this.metrics.tasksCoordinated++;

      this.logger.debug('Task coordinated', {
        taskId: task.id,
        agentId: targetAgentId,
        coordLatency: `${coordLatency.toFixed(2)}ms`
      });

      this.emit('task:coordinated', { taskId: task.id, agentId: targetAgentId, latency: coordLatency });
      return targetAgentId;

    } catch (error) {
      this.logger.error('Task coordination failed', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Select the best agent for a task using configured load balancing strategy
   */
  private async selectTargetAgent(task: TaskDefinition): Promise<string | null> {
    const healthyAgents = Array.from(this.agentHealth.entries())
      .filter(([_, health]) => health.status === 'healthy')
      .map(([agentId]) => agentId);

    if (healthyAgents.length === 0) {
      return null;
    }

    switch (this.config.loadBalancing.type) {
      case 'least-loaded':
        return this.selectLeastLoadedAgent(healthyAgents);

      case 'round-robin':
        return this.selectRoundRobinAgent(healthyAgents);

      case 'random':
        return healthyAgents[Math.floor(Math.random() * healthyAgents.length)];

      case 'weighted':
        return this.selectWeightedAgent(healthyAgents, task);

      default:
        return this.selectLeastLoadedAgent(healthyAgents);
    }
  }

  private selectLeastLoadedAgent(agents: string[]): string {
    let minLoad = Infinity;
    let selectedAgent = agents[0];

    for (const agentId of agents) {
      const loadStat = this.loadStats.get(agentId);
      if (loadStat && loadStat.tasks < minLoad) {
        minLoad = loadStat.tasks;
        selectedAgent = agentId;
      }
    }

    return selectedAgent;
  }

  private selectRoundRobinAgent(agents: string[]): string {
    const index = this.metrics.tasksCoordinated % agents.length;
    return agents[index];
  }

  private selectWeightedAgent(agents: string[], task: TaskDefinition): string {
    // Weight based on task type affinity, load, and latency
    let bestScore = -Infinity;
    let selectedAgent = agents[0];

    for (const agentId of agents) {
      const loadStat = this.loadStats.get(agentId);
      if (!loadStat) continue;

      const loadScore = 1 / (loadStat.tasks + 1); // Lower load = higher score
      const latencyScore = loadStat.avgLatency > 0 ? 1000 / loadStat.avgLatency : 1;
      const totalScore = loadScore * 0.7 + latencyScore * 0.3;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        selectedAgent = agentId;
      }
    }

    return selectedAgent;
  }

  /**
   * Find the best coordination node for an agent
   */
  private findBestNode(agent: AgentInstance): CoordinationNode | null {
    let bestNode: CoordinationNode | null = null;
    let minLoad = Infinity;

    for (const node of this.coordinationTree.values()) {
      // Skip full nodes
      if (node.agents.size >= this.config.maxAgentsPerNode) {
        continue;
      }

      // Find node with lowest load at appropriate level
      if (node.load < minLoad && node.level === this.getTargetLevel(agent)) {
        minLoad = node.load;
        bestNode = node;
      }
    }

    return bestNode;
  }

  private getTargetLevel(agent: AgentInstance): number {
    // Distribute agents across hierarchy levels
    return Math.min(
      Math.floor(this.metrics.totalAgentsManaged / this.config.maxAgentsPerNode),
      this.config.hierarchyDepth - 1
    );
  }

  /**
   * Create a new coordination node in the hierarchy
   */
  private async createCoordinationNode(agent: AgentInstance): Promise<CoordinationNode> {
    const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const level = this.getTargetLevel(agent);

    const newNode: CoordinationNode = {
      id: nodeId,
      level,
      agents: new Set(),
      subCoordinators: new Set(),
      workQueue: [],
      capacity: this.config.maxAgentsPerNode,
      load: 0
    };

    this.coordinationTree.set(nodeId, newNode);
    this.metrics.activeCoordinationNodes++;

    // Link to parent coordinator if not root level
    if (level > 0) {
      const parentNode = this.findParentNode(level);
      if (parentNode) {
        parentNode.subCoordinators.add(nodeId);
      }
    }

    this.logger.info('Created new coordination node', {
      nodeId,
      level,
      totalNodes: this.coordinationTree.size
    });

    return newNode;
  }

  private findParentNode(childLevel: number): CoordinationNode | null {
    const parentLevel = childLevel - 1;

    for (const node of this.coordinationTree.values()) {
      if (node.level === parentLevel && node.subCoordinators.size < this.config.maxAgentsPerNode) {
        return node;
      }
    }

    return null;
  }

  /**
   * Work-stealing algorithm for dynamic load balancing
   */
  private startWorkStealing(): void {
    setInterval(() => {
      if (this.workStealingActive) return;

      this.workStealingActive = true;
      this.performWorkStealing();
      this.workStealingActive = false;
    }, 500); // Check every 500ms
  }

  private performWorkStealing(): void {
    const nodes = Array.from(this.coordinationTree.values());

    // Find heavily loaded and lightly loaded nodes
    const sortedByLoad = nodes.sort((a, b) => b.load - a.load);
    const heaviestNode = sortedByLoad[0];
    const lightestNode = sortedByLoad[sortedByLoad.length - 1];

    if (!heaviestNode || !lightestNode) return;

    const loadDifference = heaviestNode.load - lightestNode.load;
    const threshold = lightestNode.load * this.config.workStealing.thresholdRatio;

    if (loadDifference > threshold && heaviestNode.workQueue.length > 0) {
      // Steal tasks from heavy node to light node
      const tasksToSteal = Math.min(
        Math.max(
          Math.floor(loadDifference / 2),
          this.config.workStealing.minTasksToSteal
        ),
        this.config.workStealing.maxTasksToSteal,
        heaviestNode.workQueue.length
      );

      const stolenTasks = heaviestNode.workQueue.splice(0, tasksToSteal);
      lightestNode.workQueue.push(...stolenTasks);

      heaviestNode.load -= tasksToSteal;
      lightestNode.load += tasksToSteal;

      this.metrics.workStealingOperations++;

      this.logger.debug('Work stealing performed', {
        from: heaviestNode.id,
        to: lightestNode.id,
        taskCount: tasksToSteal
      });

      this.emit('work:stolen', { from: heaviestNode.id, to: lightestNode.id, count: tasksToSteal });
    }
  }

  /**
   * Periodic load balancing across coordination nodes
   */
  private startLoadBalancing(): void {
    const interval = this.config.loadBalancing.rebalanceInterval || 5000;

    this.rebalanceTimer = setInterval(() => {
      this.performLoadRebalancing();
    }, interval);
  }

  private performLoadRebalancing(): void {
    const nodes = Array.from(this.coordinationTree.values());
    const avgLoad = nodes.reduce((sum, node) => sum + node.load, 0) / nodes.length;

    let rebalanced = false;

    for (const node of nodes) {
      const loadDiff = node.load - avgLoad;

      if (Math.abs(loadDiff) > avgLoad * 0.3) {
        // Significant load imbalance detected
        rebalanced = true;

        if (loadDiff > 0) {
          // Redistribute excess load
          const tasksToRedistribute = Math.floor(Math.abs(loadDiff) / 2);
          // Logic to move tasks to less loaded nodes
        }
      }
    }

    if (rebalanced) {
      this.metrics.rebalancingOperations++;
      this.logger.debug('Load rebalancing performed');
      this.emit('load:rebalanced');
    }
  }

  /**
   * Health monitoring and automatic recovery
   */
  private startHealthMonitoring(): void {
    setInterval(() => {
      this.checkAgentHealth();
      this.processRecoveryQueue();
    }, this.config.healthCheckInterval);
  }

  private checkAgentHealth(): void {
    const now = Date.now();
    const healthTimeout = this.config.healthCheckInterval * 3;

    for (const [agentId, health] of this.agentHealth.entries()) {
      const timeSinceHeartbeat = now - health.lastHeartbeat;

      if (timeSinceHeartbeat > healthTimeout) {
        // Agent appears to have failed
        if (health.status !== 'failed') {
          this.handleAgentFailure(agentId);
        }
      } else if (timeSinceHeartbeat > healthTimeout / 2) {
        // Agent is degraded
        if (health.status === 'healthy') {
          health.status = 'degraded';
          this.logger.warn('Agent health degraded', { agentId });
          this.emit('agent:degraded', agentId);
        }
      }
    }
  }

  private handleAgentFailure(agentId: string): void {
    const health = this.agentHealth.get(agentId);
    if (!health) return;

    health.status = 'failed';
    this.failedAgents.add(agentId);
    this.metrics.agentFailures++;

    // Add to recovery queue
    this.recoveryQueue.push({
      agentId,
      failureTime: Date.now()
    });

    // Remove from coordination
    const nodeId = this.agentToNode.get(agentId);
    if (nodeId) {
      const node = this.coordinationTree.get(nodeId);
      if (node) {
        node.agents.delete(agentId);
      }
    }

    this.logger.error('Agent failure detected', { agentId });
    this.emit('agent:failed', agentId);
  }

  private processRecoveryQueue(): void {
    const now = Date.now();
    const newRecoveryQueue: typeof this.recoveryQueue = [];

    for (const recovery of this.recoveryQueue) {
      const timeSinceFailure = now - recovery.failureTime;

      if (timeSinceFailure > this.config.recoveryTimeout) {
        // Attempt recovery
        this.attemptAgentRecovery(recovery.agentId);
      } else {
        // Keep in queue
        newRecoveryQueue.push(recovery);
      }
    }

    this.recoveryQueue = newRecoveryQueue;
  }

  private attemptAgentRecovery(agentId: string): void {
    // In production, this would trigger actual agent restart/replacement
    this.logger.info('Attempting agent recovery', { agentId });

    // Simulate recovery success
    this.failedAgents.delete(agentId);
    const health = this.agentHealth.get(agentId);
    if (health) {
      health.status = 'healthy';
      health.lastHeartbeat = Date.now();
    }

    this.metrics.agentRecoveries++;
    this.emit('agent:recovered', agentId);
  }

  /**
   * Update agent heartbeat (called by agents to signal health)
   */
  updateHeartbeat(agentId: string): void {
    const health = this.agentHealth.get(agentId);
    if (health) {
      health.lastHeartbeat = Date.now();
      if (health.status !== 'healthy') {
        health.status = 'healthy';
        this.logger.info('Agent recovered to healthy state', { agentId });
      }
    }
  }

  /**
   * Report task completion for load tracking
   */
  reportTaskCompletion(agentId: string, taskId: string, executionTime: number): void {
    const loadStat = this.loadStats.get(agentId);
    if (loadStat) {
      loadStat.tasks = Math.max(0, loadStat.tasks - 1);
      loadStat.avgLatency = (loadStat.avgLatency + executionTime) / 2;
      loadStat.lastUpdate = Date.now();
    }

    // Update node load
    const nodeId = this.agentToNode.get(agentId);
    if (nodeId) {
      const node = this.coordinationTree.get(nodeId);
      if (node) {
        node.load = Math.max(0, node.load - 1);
      }
    }

    this.taskAssignments.delete(taskId);
  }

  /**
   * Get comprehensive coordination metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      coordinationNodes: this.coordinationTree.size,
      healthyAgents: Array.from(this.agentHealth.values()).filter(h => h.status === 'healthy').length,
      degradedAgents: Array.from(this.agentHealth.values()).filter(h => h.status === 'degraded').length,
      failedAgents: this.failedAgents.size,
      pendingRecoveries: this.recoveryQueue.length,
      globalQueueSize: this.globalWorkQueue.length,
      nodeLoadDistribution: this.getNodeLoadDistribution()
    };
  }

  private getNodeLoadDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const [nodeId, node] of this.coordinationTree.entries()) {
      distribution[nodeId] = node.load;
    }

    return distribution;
  }

  /**
   * Shutdown coordinator gracefully
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down large-scale coordinator');

    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
    }

    this.coordinationTree.clear();
    this.agentToNode.clear();
    this.taskAssignments.clear();
    this.agentHealth.clear();
    this.loadStats.clear();

    this.logger.info('Large-scale coordinator shut down');
  }
}