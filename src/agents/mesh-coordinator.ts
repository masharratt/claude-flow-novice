/**
 * Mesh Coordinator Agent with Dependency-Aware Completion Tracking
 *
 * A mesh topology coordinator that manages agent dependencies and prevents
 * premature completion through the DependencyTracker system.
 * Ensures coordinators remain available for re-run requests until all
 * dependent agents have completed their tasks.
 */

import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { generateId } from '../utils/helpers.js';
import {
  lifecycleManager,
  registerAgentDependency,
  removeAgentDependency,
  getAgentDependencyStatus,
  forceAgentCompletion,
  type AgentLifecycleContext
} from './lifecycle-manager.js';
import {
  DependencyType,
  getDependencyTracker,
  type DependencyTracker,
  type CompletionBlockerInfo
} from '../lifecycle/dependency-tracker.js';

// ============================================================================
// Mesh Coordinator Types
// ============================================================================

export interface MeshAgentInfo {
  id: string;
  name: string;
  type: string;
  status: 'initializing' | 'ready' | 'working' | 'completed' | 'failed';
  capabilities: string[];
  connections: Set<string>; // Connected agent IDs
  workload: number;
  lastActivity: Date;
  taskHistory: string[];
  completionDependencies: string[]; // Agents this one depends on for completion
  dependentAgents: string[]; // Agents that depend on this one
}

export interface MeshCoordinationTask {
  id: string;
  type: string;
  description: string;
  assignedAgents: string[];
  dependencies: string[];
  status: 'pending' | 'active' | 'completed' | 'failed';
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  coordinatorId: string;
}

export interface MeshCoordinatorConfig {
  maxAgents: number;
  maxConnections: number;
  taskDistributionStrategy: 'round-robin' | 'load-balanced' | 'capability-based';
  enableDependencyTracking: boolean;
  completionTimeout: number;
  rebalanceInterval: number;
  memoryNamespace: string;
}

// ============================================================================
// Mesh Coordinator Implementation
// ============================================================================

export class MeshCoordinator extends EventEmitter {
  private coordinatorId: string;
  private logger: Logger;
  private config: MeshCoordinatorConfig;
  private agents: Map<string, MeshAgentInfo>;
  private tasks: Map<string, MeshCoordinationTask>;
  private dependencyTracker: DependencyTracker;
  private lifecycleContext?: AgentLifecycleContext;
  private isRunning: boolean = false;
  private rebalanceTimer?: NodeJS.Timeout;
  private completionCheckTimer?: NodeJS.Timeout;

  constructor(config: Partial<MeshCoordinatorConfig> = {}) {
    super();

    this.coordinatorId = generateId('mesh-coord');
    this.logger = new Logger(`MeshCoordinator[${this.coordinatorId}]`);

    this.config = {
      maxAgents: 50,
      maxConnections: 8,
      taskDistributionStrategy: 'capability-based',
      enableDependencyTracking: true,
      completionTimeout: 300000, // 5 minutes
      rebalanceInterval: 30000, // 30 seconds
      memoryNamespace: 'mesh-coordinator',
      ...config
    };

    this.agents = new Map();
    this.tasks = new Map();
    this.dependencyTracker = getDependencyTracker(this.config.memoryNamespace);

    this.setupEventHandlers();
  }

  // ============================================================================
  // Initialization and Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Mesh coordinator already running');
      return;
    }

    this.logger.info('Initializing mesh coordinator...');

    // Initialize dependency tracker
    if (this.config.enableDependencyTracking) {
      await this.dependencyTracker.initialize();
    }

    // Register this coordinator with lifecycle management
    this.lifecycleContext = await lifecycleManager.initializeAgent(
      this.coordinatorId,
      {
        name: 'mesh-coordinator',
        type: 'coordinator',
        capabilities: ['coordination', 'mesh-topology', 'dependency-tracking'],
        lifecycle: {
          state_management: true,
          persistent_memory: true,
          max_retries: 3
        },
        hooks: {
          init: 'echo "Mesh coordinator initialized"',
          task_complete: 'echo "Coordination task completed"',
          on_rerun_request: this.handleRerunRequest.bind(this),
          cleanup: 'echo "Mesh coordinator cleanup"'
        }
      },
      generateId('mesh-task')
    );

    await lifecycleManager.transitionState(this.coordinatorId, 'running', 'Mesh coordinator started');

    this.isRunning = true;
    this.startBackgroundTasks();

    this.logger.info('Mesh coordinator initialized successfully');
    this.emit('coordinator:initialized', { coordinatorId: this.coordinatorId });
  }

  async shutdown(force: boolean = false): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info('Shutting down mesh coordinator...');
    this.isRunning = false;

    // Stop background tasks
    this.stopBackgroundTasks();

    // Handle completion dependencies
    if (this.config.enableDependencyTracking && !force) {
      const canComplete = await this.checkCompletionDependencies();
      if (!canComplete) {
        this.logger.info('Coordinator has pending dependencies - deferring completion');
        this.emit('coordinator:completion_deferred', {
          coordinatorId: this.coordinatorId,
          reason: 'Pending agent dependencies'
        });
        return; // Don't complete yet
      }
    }

    // Force completion if requested
    if (force) {
      await forceAgentCompletion(this.coordinatorId, 'Forced shutdown requested');
    }

    // Cleanup all agent dependencies
    await this.cleanupAgentDependencies();

    // Transition to stopped state
    await lifecycleManager.transitionState(this.coordinatorId, 'stopped', 'Mesh coordinator shutdown');

    // Shutdown dependency tracker
    if (this.config.enableDependencyTracking) {
      await this.dependencyTracker.shutdown();
    }

    this.logger.info('Mesh coordinator shutdown complete');
    this.emit('coordinator:shutdown', { coordinatorId: this.coordinatorId });
  }

  // ============================================================================
  // Agent Management with Dependency Tracking
  // ============================================================================

  async registerAgent(
    agentId: string,
    agentInfo: Omit<MeshAgentInfo, 'id' | 'connections' | 'workload' | 'lastActivity' | 'taskHistory' | 'completionDependencies' | 'dependentAgents'>
  ): Promise<void> {
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error('Maximum agent limit reached');
    }

    const meshAgent: MeshAgentInfo = {
      id: agentId,
      connections: new Set(),
      workload: 0,
      lastActivity: new Date(),
      taskHistory: [],
      completionDependencies: [],
      dependentAgents: [],
      ...agentInfo
    };

    this.agents.set(agentId, meshAgent);

    // Register dependency relationship - agents depend on coordinator for coordination
    if (this.config.enableDependencyTracking) {
      await registerAgentDependency(
        agentId,
        this.coordinatorId,
        DependencyType.COORDINATION,
        {
          timeout: this.config.completionTimeout,
          metadata: {
            coordinatorType: 'mesh',
            relationship: 'coordination'
          }
        }
      );
    }

    // Establish mesh connections
    await this.establishMeshConnections(agentId);

    this.logger.info(`Registered agent ${agentId} in mesh topology`);
    this.emit('agent:registered', { agentId, coordinatorId: this.coordinatorId });
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Remove all connections
    await this.removeAllConnections(agentId);

    // Remove dependency relationships
    if (this.config.enableDependencyTracking) {
      const depStatus = getAgentDependencyStatus(agentId);
      for (const depId of depStatus.dependencies) {
        await removeAgentDependency(depId);
      }
    }

    // Remove from agent registry
    this.agents.delete(agentId);

    this.logger.info(`Unregistered agent ${agentId} from mesh topology`);
    this.emit('agent:unregistered', { agentId, coordinatorId: this.coordinatorId });
  }

  async establishMeshConnections(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Find optimal connections based on capabilities and load
    const candidates = this.findConnectionCandidates(agentId);
    const connectionsToMake = Math.min(candidates.length, this.config.maxConnections);

    for (let i = 0; i < connectionsToMake; i++) {
      const targetId = candidates[i];
      await this.establishConnection(agentId, targetId);
    }
  }

  private findConnectionCandidates(agentId: string): string[] {
    const agent = this.agents.get(agentId);
    if (!agent) return [];

    const candidates: Array<{ id: string; score: number }> = [];

    for (const [targetId, target] of this.agents) {
      if (targetId === agentId || agent.connections.has(targetId)) continue;

      // Score based on capability overlap and load
      const capabilityOverlap = agent.capabilities.filter(cap =>
        target.capabilities.includes(cap)
      ).length;

      const loadScore = 1 / (target.workload + 1);
      const score = capabilityOverlap * 2 + loadScore;

      candidates.push({ id: targetId, score });
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .map(c => c.id);
  }

  private async establishConnection(agentId: string, targetId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    const target = this.agents.get(targetId);

    if (!agent || !target) return;

    // Bidirectional connection
    agent.connections.add(targetId);
    target.connections.add(agentId);

    this.logger.debug(`Established mesh connection: ${agentId} <-> ${targetId}`);
    this.emit('connection:established', { agentId, targetId });
  }

  private async removeAllConnections(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Remove bidirectional connections
    for (const connectedId of agent.connections) {
      const connected = this.agents.get(connectedId);
      if (connected) {
        connected.connections.delete(agentId);
      }
    }

    agent.connections.clear();
  }

  // ============================================================================
  // Task Coordination with Dependencies
  // ============================================================================

  async coordinateTask(
    taskDescription: string,
    options: {
      requiredCapabilities?: string[];
      priority?: number;
      dependencies?: string[];
      timeout?: number;
    } = {}
  ): Promise<string> {
    const taskId = generateId('mesh-task');

    const task: MeshCoordinationTask = {
      id: taskId,
      type: 'coordination',
      description: taskDescription,
      assignedAgents: [],
      dependencies: options.dependencies || [],
      status: 'pending',
      priority: options.priority || 1,
      createdAt: new Date(),
      coordinatorId: this.coordinatorId
    };

    this.tasks.set(taskId, task);

    // Select agents for task based on capabilities and load
    const selectedAgents = this.selectAgentsForTask(
      options.requiredCapabilities || [],
      options.priority || 1
    );

    if (selectedAgents.length === 0) {
      task.status = 'failed';
      task.error = 'No suitable agents available';
      this.emit('task:failed', { taskId, error: task.error });
      return taskId;
    }

    // Assign task to selected agents
    task.assignedAgents = selectedAgents.map(a => a.id);
    task.status = 'active';
    task.startedAt = new Date();

    // Create inter-agent dependencies if needed
    if (this.config.enableDependencyTracking) {
      await this.createTaskDependencies(taskId, selectedAgents);
    }

    // Distribute task to agents
    await this.distributeTaskToAgents(task, selectedAgents);

    this.logger.info(`Coordinated task ${taskId} across ${selectedAgents.length} agents`);
    this.emit('task:coordinated', { taskId, agentIds: task.assignedAgents });

    return taskId;
  }

  private selectAgentsForTask(requiredCapabilities: string[], priority: number): MeshAgentInfo[] {
    const suitableAgents: Array<{ agent: MeshAgentInfo; score: number }> = [];

    for (const [agentId, agent] of this.agents) {
      if (agent.status !== 'ready') continue;

      // Check capability match
      const hasRequiredCaps = requiredCapabilities.every(cap =>
        agent.capabilities.includes(cap)
      );

      if (!hasRequiredCaps && requiredCapabilities.length > 0) continue;

      // Calculate selection score
      const capabilityScore = requiredCapabilities.length > 0 ?
        requiredCapabilities.filter(cap => agent.capabilities.includes(cap)).length / requiredCapabilities.length : 1;

      const loadScore = 1 / (agent.workload + 1);
      const connectivityScore = agent.connections.size / this.config.maxConnections;

      const score = capabilityScore * 0.5 + loadScore * 0.3 + connectivityScore * 0.2;

      suitableAgents.push({ agent, score });
    }

    // Return top agents sorted by score
    return suitableAgents
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(5, suitableAgents.length)) // Limit to top 5
      .map(a => a.agent);
  }

  private async createTaskDependencies(taskId: string, agents: MeshAgentInfo[]): Promise<void> {
    // Create completion dependencies between task agents and coordinator
    for (const agent of agents) {
      await registerAgentDependency(
        this.coordinatorId, // Coordinator depends on agents
        agent.id,           // Agent provides completion
        DependencyType.COMPLETION,
        {
          timeout: this.config.completionTimeout,
          metadata: {
            taskId,
            coordinatorType: 'mesh',
            relationship: 'task-completion'
          }
        }
      );

      // Update agent tracking
      agent.dependentAgents.push(this.coordinatorId);

      const coordinatorAgent = this.agents.get(this.coordinatorId);
      if (coordinatorAgent) {
        coordinatorAgent.completionDependencies.push(agent.id);
      }
    }
  }

  private async distributeTaskToAgents(task: MeshCoordinationTask, agents: MeshAgentInfo[]): Promise<void> {
    // Simulate task distribution through mesh network
    for (const agent of agents) {
      agent.status = 'working';
      agent.workload += 1;
      agent.taskHistory.push(task.id);
      agent.lastActivity = new Date();

      // In a real implementation, this would send actual task messages
      this.logger.debug(`Distributed task ${task.id} to agent ${agent.id}`);
    }

    // Start task monitoring
    this.startTaskMonitoring(task.id);
  }

  // ============================================================================
  // Completion and Dependency Management
  // ============================================================================

  async handleTaskCompletion(taskId: string, agentId: string, result: unknown): Promise<void> {
    const task = this.tasks.get(taskId);
    const agent = this.agents.get(agentId);

    if (!task || !agent) return;

    // Update agent status
    agent.status = 'ready';
    agent.workload = Math.max(0, agent.workload - 1);
    agent.lastActivity = new Date();

    // Check if all agents completed the task
    const allCompleted = task.assignedAgents.every(aId => {
      const a = this.agents.get(aId);
      return a && a.status === 'ready';
    });

    if (allCompleted) {
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;

      // Resolve dependencies for this task
      if (this.config.enableDependencyTracking) {
        await this.resolveTaskDependencies(taskId);
      }

      this.logger.info(`Task ${taskId} completed successfully`);
      this.emit('task:completed', { taskId, result });

      // Check if coordinator can now complete
      await this.checkCoordinatorCompletion();
    }
  }

  async handleTaskFailure(taskId: string, agentId: string, error: string): Promise<void> {
    const task = this.tasks.get(taskId);
    const agent = this.agents.get(agentId);

    if (!task || !agent) return;

    task.status = 'failed';
    task.error = error;
    task.completedAt = new Date();

    // Update agent status
    agent.status = 'failed';
    agent.lastActivity = new Date();

    // Handle dependency failures
    if (this.config.enableDependencyTracking) {
      await this.handleTaskDependencyFailure(taskId);
    }

    this.logger.error(`Task ${taskId} failed: ${error}`);
    this.emit('task:failed', { taskId, error, agentId });
  }

  private async resolveTaskDependencies(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Find and resolve all dependencies related to this task
    const depStatus = getAgentDependencyStatus(this.coordinatorId);
    for (const depId of depStatus.dependencies) {
      const dep = this.dependencyTracker.getDependencyDetails(depId);
      if (dep?.metadata?.taskId === taskId) {
        await this.dependencyTracker.resolveDependency(depId, task.result);
      }
    }
  }

  private async handleTaskDependencyFailure(taskId: string): Promise<void> {
    // Mark task-related dependencies as failed
    const depStatus = getAgentDependencyStatus(this.coordinatorId);
    for (const depId of depStatus.dependencies) {
      const dep = this.dependencyTracker.getDependencyDetails(depId);
      if (dep?.metadata?.taskId === taskId) {
        // Dependencies will be automatically marked as failed by the tracker
        this.logger.warn(`Task dependency ${depId} failed due to task ${taskId} failure`);
      }
    }
  }

  private async checkCompletionDependencies(): Promise<boolean> {
    if (!this.config.enableDependencyTracking) {
      return true;
    }

    const blockerInfo = await this.dependencyTracker.canAgentComplete(this.coordinatorId);
    return blockerInfo.canComplete;
  }

  private async checkCoordinatorCompletion(): Promise<void> {
    // Check if coordinator has any pending tasks or dependencies
    const pendingTasks = Array.from(this.tasks.values()).filter(t =>
      t.status === 'pending' || t.status === 'active'
    );

    if (pendingTasks.length === 0) {
      const canComplete = await this.checkCompletionDependencies();
      if (canComplete && !this.isRunning) {
        // All tasks done and no dependencies - can complete
        await this.finalizeCompletion();
      }
    }
  }

  private async finalizeCompletion(): Promise<void> {
    this.logger.info('Mesh coordinator ready for completion');

    // Clean up all agent dependencies
    await this.cleanupAgentDependencies();

    // Transition to completed state
    await lifecycleManager.transitionState(this.coordinatorId, 'stopped', 'All coordination tasks completed');

    this.emit('coordinator:completed', { coordinatorId: this.coordinatorId });
  }

  private async cleanupAgentDependencies(): Promise<void> {
    if (!this.config.enableDependencyTracking) return;

    // Remove all agent dependencies
    for (const [agentId, agent] of this.agents) {
      const depStatus = getAgentDependencyStatus(agentId);
      for (const depId of depStatus.dependencies) {
        await removeAgentDependency(depId);
      }
    }

    // Remove coordinator dependencies
    const coordinatorDepStatus = getAgentDependencyStatus(this.coordinatorId);
    for (const depId of coordinatorDepStatus.dependencies) {
      await removeAgentDependency(depId);
    }
  }

  // ============================================================================
  // Event Handlers and Background Tasks
  // ============================================================================

  private setupEventHandlers(): void {
    this.on('task:completed', this.handleTaskCompletionEvent.bind(this));
    this.on('task:failed', this.handleTaskFailureEvent.bind(this));
    this.on('agent:status_changed', this.handleAgentStatusChange.bind(this));
  }

  private async handleTaskCompletionEvent(event: { taskId: string; result: unknown }): Promise<void> {
    // Additional handling for task completion
    this.logger.debug(`Handling task completion event: ${event.taskId}`);
  }

  private async handleTaskFailureEvent(event: { taskId: string; error: string; agentId: string }): Promise<void> {
    // Additional handling for task failure
    this.logger.debug(`Handling task failure event: ${event.taskId}`);
  }

  private async handleAgentStatusChange(event: { agentId: string; oldStatus: string; newStatus: string }): Promise<void> {
    // Handle agent status changes
    const agent = this.agents.get(event.agentId);
    if (agent) {
      agent.lastActivity = new Date();
    }
  }

  private async handleRerunRequest(): Promise<void> {
    this.logger.info('Mesh coordinator rerun requested');

    // Reset coordinator state for rerun
    await lifecycleManager.transitionState(this.coordinatorId, 'running', 'Coordinator rerun requested');

    this.isRunning = true;
    this.startBackgroundTasks();

    this.emit('coordinator:rerun', { coordinatorId: this.coordinatorId });
  }

  private startBackgroundTasks(): void {
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
    }

    // Periodic mesh rebalancing
    this.rebalanceTimer = setInterval(() => {
      this.rebalanceMeshConnections();
    }, this.config.rebalanceInterval);

    // Periodic completion checking
    this.completionCheckTimer = setInterval(() => {
      this.checkCoordinatorCompletion();
    }, 10000); // Check every 10 seconds
  }

  private stopBackgroundTasks(): void {
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = undefined;
    }

    if (this.completionCheckTimer) {
      clearInterval(this.completionCheckTimer);
      this.completionCheckTimer = undefined;
    }
  }

  private async rebalanceMeshConnections(): Promise<void> {
    // Rebalance connections based on current load and performance
    for (const [agentId, agent] of this.agents) {
      if (agent.connections.size < this.config.maxConnections) {
        const candidates = this.findConnectionCandidates(agentId);
        if (candidates.length > 0) {
          await this.establishConnection(agentId, candidates[0]);
        }
      }
    }
  }

  private startTaskMonitoring(taskId: string): void {
    // Monitor task progress and handle timeouts
    setTimeout(() => {
      const task = this.tasks.get(taskId);
      if (task && task.status === 'active') {
        this.handleTaskFailure(taskId, 'coordinator', 'Task timeout');
      }
    }, this.config.completionTimeout);
  }

  // ============================================================================
  // Public Query Methods
  // ============================================================================

  getCoordinatorStatus(): {
    coordinatorId: string;
    status: string;
    agentCount: number;
    activeTaskCount: number;
    completedTaskCount: number;
    canComplete: boolean;
    dependencies: string[];
  } {
    const activeTasks = Array.from(this.tasks.values()).filter(t =>
      t.status === 'active' || t.status === 'pending'
    );

    const completedTasks = Array.from(this.tasks.values()).filter(t =>
      t.status === 'completed'
    );

    const depStatus = getAgentDependencyStatus(this.coordinatorId);

    return {
      coordinatorId: this.coordinatorId,
      status: this.lifecycleContext?.state || 'unknown',
      agentCount: this.agents.size,
      activeTaskCount: activeTasks.length,
      completedTaskCount: completedTasks.length,
      canComplete: depStatus.canComplete,
      dependencies: depStatus.dependencies
    };
  }

  getMeshTopology(): {
    agents: Array<{ id: string; connections: string[]; workload: number; status: string }>;
    totalConnections: number;
    averageConnections: number;
  } {
    const agents = Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      connections: Array.from(agent.connections),
      workload: agent.workload,
      status: agent.status
    }));

    const totalConnections = agents.reduce((sum, agent) => sum + agent.connections.length, 0) / 2; // Bidirectional
    const averageConnections = this.agents.size > 0 ? totalConnections / this.agents.size : 0;

    return {
      agents,
      totalConnections,
      averageConnections
    };
  }

  getTaskStatus(taskId: string): MeshCoordinationTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): MeshCoordinationTask[] {
    return Array.from(this.tasks.values());
  }
}

// ============================================================================
// Factory and Utility Functions
// ============================================================================

export function createMeshCoordinator(config?: Partial<MeshCoordinatorConfig>): MeshCoordinator {
  return new MeshCoordinator(config);
}

export function createMeshCoordinatorWithDependencies(
  dependencyNamespace: string,
  config?: Partial<MeshCoordinatorConfig>
): MeshCoordinator {
  const enhancedConfig = {
    ...config,
    enableDependencyTracking: true,
    memoryNamespace: dependencyNamespace
  };

  return new MeshCoordinator(enhancedConfig);
}

// Export types for external use
export type {
  MeshAgentInfo,
  MeshCoordinationTask,
  MeshCoordinatorConfig
};