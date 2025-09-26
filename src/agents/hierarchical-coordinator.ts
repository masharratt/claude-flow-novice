/**
 * Hierarchical Coordinator Agent with Dependency-Aware Completion Tracking
 *
 * A hierarchical topology coordinator that manages agent dependencies in a tree structure.
 * Prevents premature completion through the DependencyTracker system and ensures
 * coordinators remain available for re-run requests until all child agents complete.
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
// Hierarchical Coordinator Types
// ============================================================================

export interface HierarchicalAgentNode {
  id: string;
  name: string;
  type: string;
  level: number;
  parentId?: string;
  childIds: string[];
  status: 'initializing' | 'ready' | 'working' | 'completed' | 'failed';
  capabilities: string[];
  workload: number;
  lastActivity: Date;
  assignedTasks: string[];
  completionDependencies: string[]; // Child agents this depends on
  hierarchyPath: string[]; // Path from root to this node
}

export interface HierarchicalTask {
  id: string;
  type: string;
  description: string;
  parentTaskId?: string;
  subTaskIds: string[];
  assignedAgentId: string;
  dependencies: string[];
  status: 'pending' | 'active' | 'delegated' | 'completed' | 'failed';
  priority: number;
  level: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  coordinatorId: string;
}

export interface HierarchicalCoordinatorConfig {
  maxDepth: number;
  maxChildrenPerNode: number;
  taskDelegationStrategy: 'top-down' | 'bottom-up' | 'hybrid';
  enableDependencyTracking: boolean;
  completionTimeout: number;
  hierarchyRebalanceInterval: number;
  memoryNamespace: string;
  autoPromoteCapable: boolean;
}

// ============================================================================
// Hierarchical Coordinator Implementation
// ============================================================================

export class HierarchicalCoordinator extends EventEmitter {
  private coordinatorId: string;
  private logger: Logger;
  private config: HierarchicalCoordinatorConfig;
  private agentHierarchy: Map<string, HierarchicalAgentNode>;
  private tasks: Map<string, HierarchicalTask>;
  private rootAgentIds: Set<string>;
  private dependencyTracker: DependencyTracker;
  private lifecycleContext?: AgentLifecycleContext;
  private isRunning: boolean = false;
  private rebalanceTimer?: NodeJS.Timeout;
  private completionCheckTimer?: NodeJS.Timeout;

  constructor(config: Partial<HierarchicalCoordinatorConfig> = {}) {
    super();

    this.coordinatorId = generateId('hier-coord');
    this.logger = new Logger(`HierarchicalCoordinator[${this.coordinatorId}]`);

    this.config = {
      maxDepth: 5,
      maxChildrenPerNode: 10,
      taskDelegationStrategy: 'hybrid',
      enableDependencyTracking: true,
      completionTimeout: 300000, // 5 minutes
      hierarchyRebalanceInterval: 45000, // 45 seconds
      memoryNamespace: 'hierarchical-coordinator',
      autoPromoteCapable: true,
      ...config
    };

    this.agentHierarchy = new Map();
    this.tasks = new Map();
    this.rootAgentIds = new Set();
    this.dependencyTracker = getDependencyTracker(this.config.memoryNamespace);

    this.setupEventHandlers();
  }

  // ============================================================================
  // Initialization and Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Hierarchical coordinator already running');
      return;
    }

    this.logger.info('Initializing hierarchical coordinator...');

    // Initialize dependency tracker
    if (this.config.enableDependencyTracking) {
      await this.dependencyTracker.initialize();
    }

    // Register this coordinator with lifecycle management
    this.lifecycleContext = await lifecycleManager.initializeAgent(
      this.coordinatorId,
      {
        name: 'hierarchical-coordinator',
        type: 'coordinator',
        capabilities: ['coordination', 'hierarchical-topology', 'dependency-tracking', 'task-delegation'],
        lifecycle: {
          state_management: true,
          persistent_memory: true,
          max_retries: 3
        },
        hooks: {
          init: 'echo "Hierarchical coordinator initialized"',
          task_complete: 'echo "Hierarchical coordination task completed"',
          on_rerun_request: this.handleRerunRequest.bind(this),
          cleanup: 'echo "Hierarchical coordinator cleanup"'
        }
      },
      generateId('hier-task')
    );

    await lifecycleManager.transitionState(this.coordinatorId, 'running', 'Hierarchical coordinator started');

    this.isRunning = true;
    this.startBackgroundTasks();

    this.logger.info('Hierarchical coordinator initialized successfully');
    this.emit('coordinator:initialized', { coordinatorId: this.coordinatorId });
  }

  async shutdown(force: boolean = false): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info('Shutting down hierarchical coordinator...');
    this.isRunning = false;

    // Stop background tasks
    this.stopBackgroundTasks();

    // Handle completion dependencies - check entire hierarchy
    if (this.config.enableDependencyTracking && !force) {
      const canComplete = await this.checkHierarchyCompletionDependencies();
      if (!canComplete) {
        this.logger.info('Coordinator has pending hierarchy dependencies - deferring completion');
        this.emit('coordinator:completion_deferred', {
          coordinatorId: this.coordinatorId,
          reason: 'Pending agent hierarchy dependencies'
        });
        return; // Don't complete yet
      }
    }

    // Force completion if requested
    if (force) {
      await forceAgentCompletion(this.coordinatorId, 'Forced hierarchical shutdown requested');
    }

    // Cleanup all hierarchy dependencies
    await this.cleanupHierarchyDependencies();

    // Transition to stopped state
    await lifecycleManager.transitionState(this.coordinatorId, 'stopped', 'Hierarchical coordinator shutdown');

    // Shutdown dependency tracker
    if (this.config.enableDependencyTracking) {
      await this.dependencyTracker.shutdown();
    }

    this.logger.info('Hierarchical coordinator shutdown complete');
    this.emit('coordinator:shutdown', { coordinatorId: this.coordinatorId });
  }

  // ============================================================================
  // Agent Hierarchy Management with Dependency Tracking
  // ============================================================================

  async registerAgent(
    agentId: string,
    agentInfo: Omit<HierarchicalAgentNode, 'id' | 'childIds' | 'workload' | 'lastActivity' | 'assignedTasks' | 'completionDependencies' | 'hierarchyPath'>,
    parentId?: string
  ): Promise<void> {
    // Validate hierarchy constraints
    if (parentId) {
      const parent = this.agentHierarchy.get(parentId);
      if (!parent) {
        throw new Error(`Parent agent ${parentId} not found`);
      }
      if (parent.childIds.length >= this.config.maxChildrenPerNode) {
        throw new Error(`Parent agent ${parentId} has reached maximum children limit`);
      }
      if (parent.level >= this.config.maxDepth - 1) {
        throw new Error('Maximum hierarchy depth would be exceeded');
      }
    }

    // Create hierarchical agent node
    const hierarchyPath = parentId
      ? [...(this.agentHierarchy.get(parentId)?.hierarchyPath || []), parentId]
      : [];

    const hierarchicalAgent: HierarchicalAgentNode = {
      id: agentId,
      childIds: [],
      workload: 0,
      lastActivity: new Date(),
      assignedTasks: [],
      completionDependencies: [],
      hierarchyPath,
      level: hierarchyPath.length,
      parentId,
      ...agentInfo
    };

    // Register in hierarchy
    this.agentHierarchy.set(agentId, hierarchicalAgent);

    // Update parent-child relationships
    if (parentId) {
      const parent = this.agentHierarchy.get(parentId)!;
      parent.childIds.push(agentId);

      // Register parent-child dependency
      if (this.config.enableDependencyTracking) {
        await registerAgentDependency(
          parentId,    // Parent depends on child completion
          agentId,     // Child provides completion
          DependencyType.COMPLETION,
          {
            timeout: this.config.completionTimeout,
            metadata: {
              coordinatorType: 'hierarchical',
              relationship: 'parent-child',
              hierarchyLevel: hierarchicalAgent.level
            }
          }
        );

        parent.completionDependencies.push(agentId);
      }
    } else {
      // Root agent
      this.rootAgentIds.add(agentId);
    }

    // Register coordination dependency with this coordinator
    if (this.config.enableDependencyTracking) {
      await registerAgentDependency(
        this.coordinatorId, // Coordinator depends on all agents
        agentId,           // Agent provides coordination completion
        DependencyType.COORDINATION,
        {
          timeout: this.config.completionTimeout,
          metadata: {
            coordinatorType: 'hierarchical',
            relationship: 'coordination',
            hierarchyLevel: hierarchicalAgent.level
          }
        }
      );
    }

    this.logger.info(`Registered agent ${agentId} at level ${hierarchicalAgent.level} in hierarchy`);
    this.emit('agent:registered', { agentId, parentId, level: hierarchicalAgent.level });
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agentHierarchy.get(agentId);
    if (!agent) return;

    // Recursively unregister children first (bottom-up)
    for (const childId of [...agent.childIds]) {
      await this.unregisterAgent(childId);
    }

    // Remove from parent's children
    if (agent.parentId) {
      const parent = this.agentHierarchy.get(agent.parentId);
      if (parent) {
        const index = parent.childIds.indexOf(agentId);
        if (index > -1) {
          parent.childIds.splice(index, 1);
        }

        // Remove parent-child dependency
        if (this.config.enableDependencyTracking) {
          const depStatus = getAgentDependencyStatus(agent.parentId);
          for (const depId of depStatus.dependencies) {
            const dep = this.dependencyTracker.getDependencyDetails(depId);
            if (dep?.providerAgentId === agentId) {
              await removeAgentDependency(depId);
            }
          }
        }
      }
    } else {
      // Remove from root agents
      this.rootAgentIds.delete(agentId);
    }

    // Remove all dependencies for this agent
    if (this.config.enableDependencyTracking) {
      const depStatus = getAgentDependencyStatus(agentId);
      for (const depId of depStatus.dependencies) {
        await removeAgentDependency(depId);
      }
    }

    // Remove from hierarchy
    this.agentHierarchy.delete(agentId);

    this.logger.info(`Unregistered agent ${agentId} from hierarchy`);
    this.emit('agent:unregistered', { agentId });
  }

  async promoteAgent(agentId: string, newParentId?: string): Promise<void> {
    const agent = this.agentHierarchy.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Validate promotion
    if (newParentId) {
      const newParent = this.agentHierarchy.get(newParentId);
      if (!newParent) {
        throw new Error(`New parent ${newParentId} not found`);
      }
      if (newParent.childIds.length >= this.config.maxChildrenPerNode) {
        throw new Error('New parent has reached maximum children limit');
      }
    }

    // Remove from current parent
    if (agent.parentId) {
      const oldParent = this.agentHierarchy.get(agent.parentId);
      if (oldParent) {
        const index = oldParent.childIds.indexOf(agentId);
        if (index > -1) {
          oldParent.childIds.splice(index, 1);
        }
      }
    } else {
      this.rootAgentIds.delete(agentId);
    }

    // Update hierarchy position
    agent.parentId = newParentId;
    agent.hierarchyPath = newParentId
      ? [...(this.agentHierarchy.get(newParentId)?.hierarchyPath || []), newParentId]
      : [];
    agent.level = agent.hierarchyPath.length;

    // Add to new parent or root
    if (newParentId) {
      const newParent = this.agentHierarchy.get(newParentId)!;
      newParent.childIds.push(agentId);
    } else {
      this.rootAgentIds.add(agentId);
    }

    // Update dependencies
    if (this.config.enableDependencyTracking) {
      await this.updatePromotionDependencies(agentId, newParentId);
    }

    this.logger.info(`Promoted agent ${agentId} to level ${agent.level}`);
    this.emit('agent:promoted', { agentId, newParentId, newLevel: agent.level });
  }

  private async updatePromotionDependencies(agentId: string, newParentId?: string): Promise<void> {
    // Remove old parent dependencies
    const depStatus = getAgentDependencyStatus(agentId);
    for (const depId of depStatus.dependencies) {
      const dep = this.dependencyTracker.getDependencyDetails(depId);
      if (dep?.dependencyType === DependencyType.COMPLETION && dep.metadata?.relationship === 'parent-child') {
        await removeAgentDependency(depId);
      }
    }

    // Add new parent dependency
    if (newParentId) {
      await registerAgentDependency(
        newParentId,  // New parent depends on this agent
        agentId,      // This agent provides completion
        DependencyType.COMPLETION,
        {
          timeout: this.config.completionTimeout,
          metadata: {
            coordinatorType: 'hierarchical',
            relationship: 'parent-child',
            hierarchyLevel: this.agentHierarchy.get(agentId)?.level
          }
        }
      );
    }
  }

  // ============================================================================
  // Hierarchical Task Delegation with Dependencies
  // ============================================================================

  async delegateTask(
    taskDescription: string,
    options: {
      targetLevel?: number;
      requiredCapabilities?: string[];
      priority?: number;
      parentTaskId?: string;
      timeout?: number;
    } = {}
  ): Promise<string> {
    const taskId = generateId('hier-task');

    // Find appropriate agent for delegation
    const selectedAgent = this.selectAgentForTask(
      options.targetLevel || 0,
      options.requiredCapabilities || [],
      options.priority || 1
    );

    if (!selectedAgent) {
      throw new Error('No suitable agent found for task delegation');
    }

    // Create hierarchical task
    const task: HierarchicalTask = {
      id: taskId,
      type: 'delegation',
      description: taskDescription,
      parentTaskId: options.parentTaskId,
      subTaskIds: [],
      assignedAgentId: selectedAgent.id,
      dependencies: [],
      status: 'pending',
      priority: options.priority || 1,
      level: selectedAgent.level,
      createdAt: new Date(),
      coordinatorId: this.coordinatorId
    };

    this.tasks.set(taskId, task);

    // Update parent task relationship
    if (options.parentTaskId) {
      const parentTask = this.tasks.get(options.parentTaskId);
      if (parentTask) {
        parentTask.subTaskIds.push(taskId);
      }
    }

    // Create task completion dependencies
    if (this.config.enableDependencyTracking) {
      await this.createTaskHierarchyDependencies(taskId, selectedAgent);
    }

    // Delegate task to agent
    await this.delegateTaskToAgent(task, selectedAgent);

    this.logger.info(`Delegated task ${taskId} to agent ${selectedAgent.id} at level ${selectedAgent.level}`);
    this.emit('task:delegated', { taskId, agentId: selectedAgent.id, level: selectedAgent.level });

    return taskId;
  }

  private selectAgentForTask(
    targetLevel: number,
    requiredCapabilities: string[],
    priority: number
  ): HierarchicalAgentNode | null {
    const candidates: Array<{ agent: HierarchicalAgentNode; score: number }> = [];

    for (const [agentId, agent] of this.agentHierarchy) {
      if (agent.status !== 'ready') continue;

      // Check level preference
      const levelScore = targetLevel === agent.level ? 2 : Math.max(0, 2 - Math.abs(targetLevel - agent.level));

      // Check capability match
      const hasRequiredCaps = requiredCapabilities.every(cap =>
        agent.capabilities.includes(cap)
      );

      if (!hasRequiredCaps && requiredCapabilities.length > 0) continue;

      const capabilityScore = requiredCapabilities.length > 0 ?
        requiredCapabilities.filter(cap => agent.capabilities.includes(cap)).length / requiredCapabilities.length : 1;

      // Consider workload and hierarchy position
      const loadScore = 1 / (agent.workload + 1);
      const hierarchyScore = 1 / (agent.level + 1); // Prefer higher levels for coordination

      const score = levelScore * 0.4 + capabilityScore * 0.3 + loadScore * 0.2 + hierarchyScore * 0.1;

      candidates.push({ agent, score });
    }

    if (candidates.length === 0) return null;

    return candidates.sort((a, b) => b.score - a.score)[0].agent;
  }

  private async createTaskHierarchyDependencies(taskId: string, agent: HierarchicalAgentNode): Promise<void> {
    // Create completion dependency: coordinator depends on task completion by agent
    await registerAgentDependency(
      this.coordinatorId, // Coordinator depends on agent
      agent.id,          // Agent provides task completion
      DependencyType.COMPLETION,
      {
        timeout: this.config.completionTimeout,
        metadata: {
          taskId,
          coordinatorType: 'hierarchical',
          relationship: 'task-completion',
          hierarchyLevel: agent.level
        }
      }
    );

    // If agent has children, create dependencies on children completing subtasks
    for (const childId of agent.childIds) {
      await registerAgentDependency(
        agent.id,  // Parent agent depends on child
        childId,   // Child provides completion
        DependencyType.COMPLETION,
        {
          timeout: this.config.completionTimeout,
          metadata: {
            taskId,
            coordinatorType: 'hierarchical',
            relationship: 'subtask-completion',
            hierarchyLevel: agent.level + 1
          }
        }
      );

      agent.completionDependencies.push(childId);
    }
  }

  private async delegateTaskToAgent(task: HierarchicalTask, agent: HierarchicalAgentNode): Promise<void> {
    // Update agent status
    agent.status = 'working';
    agent.workload += 1;
    agent.assignedTasks.push(task.id);
    agent.lastActivity = new Date();

    // Start task execution
    task.status = 'active';
    task.startedAt = new Date();

    // If agent has children and task is complex, further delegate subtasks
    if (agent.childIds.length > 0 && this.shouldSubdelegate(task, agent)) {
      await this.createSubtasks(task, agent);
    }

    // Start task monitoring
    this.startTaskMonitoring(task.id);

    this.logger.debug(`Task ${task.id} delegated to agent ${agent.id}`);
  }

  private shouldSubdelegate(task: HierarchicalTask, agent: HierarchicalAgentNode): boolean {
    // Determine if task should be further subdivided
    return (
      task.level < this.config.maxDepth - 1 &&
      agent.childIds.length > 0 &&
      task.priority >= 2 // Only high-priority tasks get subdivided
    );
  }

  private async createSubtasks(parentTask: HierarchicalTask, parentAgent: HierarchicalAgentNode): Promise<void> {
    // Create subtasks for each child agent
    const subtaskCount = Math.min(parentAgent.childIds.length, 3); // Max 3 subtasks

    for (let i = 0; i < subtaskCount; i++) {
      const childId = parentAgent.childIds[i];
      const child = this.agentHierarchy.get(childId);

      if (child && child.status === 'ready') {
        const subtaskId = await this.delegateTask(
          `Subtask ${i + 1} of: ${parentTask.description}`,
          {
            targetLevel: child.level,
            requiredCapabilities: child.capabilities.slice(0, 2), // Use some capabilities
            priority: parentTask.priority,
            parentTaskId: parentTask.id,
            timeout: this.config.completionTimeout
          }
        );

        parentTask.subTaskIds.push(subtaskId);
      }
    }

    parentTask.status = 'delegated';
    this.logger.debug(`Created ${parentTask.subTaskIds.length} subtasks for task ${parentTask.id}`);
  }

  // ============================================================================
  // Completion and Dependency Management
  // ============================================================================

  async handleTaskCompletion(taskId: string, agentId: string, result: unknown): Promise<void> {
    const task = this.tasks.get(taskId);
    const agent = this.agentHierarchy.get(agentId);

    if (!task || !agent) return;

    // Update agent status
    agent.status = 'ready';
    agent.workload = Math.max(0, agent.workload - 1);
    agent.lastActivity = new Date();

    const taskIndex = agent.assignedTasks.indexOf(taskId);
    if (taskIndex > -1) {
      agent.assignedTasks.splice(taskIndex, 1);
    }

    // Update task status
    task.status = 'completed';
    task.completedAt = new Date();
    task.result = result;

    // Resolve task dependencies
    if (this.config.enableDependencyTracking) {
      await this.resolveTaskHierarchyDependencies(taskId, result);
    }

    // Handle parent task completion if all subtasks are done
    if (task.parentTaskId) {
      await this.checkParentTaskCompletion(task.parentTaskId);
    }

    this.logger.info(`Task ${taskId} completed by agent ${agentId}`);
    this.emit('task:completed', { taskId, agentId, result });

    // Check if coordinator can now complete
    await this.checkCoordinatorCompletion();
  }

  async handleTaskFailure(taskId: string, agentId: string, error: string): Promise<void> {
    const task = this.tasks.get(taskId);
    const agent = this.agentHierarchy.get(agentId);

    if (!task || !agent) return;

    task.status = 'failed';
    task.error = error;
    task.completedAt = new Date();

    // Update agent status
    agent.status = 'failed';
    agent.lastActivity = new Date();

    // Handle dependency failures
    if (this.config.enableDependencyTracking) {
      await this.handleTaskHierarchyDependencyFailure(taskId);
    }

    // Propagate failure up the hierarchy
    if (task.parentTaskId) {
      await this.handleTaskFailure(task.parentTaskId, agentId, `Subtask failed: ${error}`);
    }

    this.logger.error(`Task ${taskId} failed: ${error}`);
    this.emit('task:failed', { taskId, error, agentId });
  }

  private async resolveTaskHierarchyDependencies(taskId: string, result: unknown): Promise<void> {
    const depStatus = getAgentDependencyStatus(this.coordinatorId);
    for (const depId of depStatus.dependencies) {
      const dep = this.dependencyTracker.getDependencyDetails(depId);
      if (dep?.metadata?.taskId === taskId) {
        await this.dependencyTracker.resolveDependency(depId, result);
      }
    }
  }

  private async handleTaskHierarchyDependencyFailure(taskId: string): Promise<void> {
    // Mark task-related dependencies as failed
    const depStatus = getAgentDependencyStatus(this.coordinatorId);
    for (const depId of depStatus.dependencies) {
      const dep = this.dependencyTracker.getDependencyDetails(depId);
      if (dep?.metadata?.taskId === taskId) {
        this.logger.warn(`Task hierarchy dependency ${depId} failed due to task ${taskId} failure`);
      }
    }
  }

  private async checkParentTaskCompletion(parentTaskId: string): Promise<void> {
    const parentTask = this.tasks.get(parentTaskId);
    if (!parentTask) return;

    // Check if all subtasks are completed
    const allSubtasksCompleted = parentTask.subTaskIds.every(subTaskId => {
      const subTask = this.tasks.get(subTaskId);
      return subTask && (subTask.status === 'completed' || subTask.status === 'failed');
    });

    if (allSubtasksCompleted) {
      const hasFailedSubtasks = parentTask.subTaskIds.some(subTaskId => {
        const subTask = this.tasks.get(subTaskId);
        return subTask && subTask.status === 'failed';
      });

      if (hasFailedSubtasks) {
        await this.handleTaskFailure(parentTaskId, parentTask.assignedAgentId, 'One or more subtasks failed');
      } else {
        // Aggregate subtask results
        const subtaskResults = parentTask.subTaskIds.map(subTaskId => {
          const subTask = this.tasks.get(subTaskId);
          return subTask?.result;
        });

        await this.handleTaskCompletion(parentTaskId, parentTask.assignedAgentId, {
          subtaskResults,
          aggregatedResult: `Completed with ${subtaskResults.length} subtasks`
        });
      }
    }
  }

  private async checkHierarchyCompletionDependencies(): Promise<boolean> {
    if (!this.config.enableDependencyTracking) {
      return true;
    }

    // Check if all agents in hierarchy can complete
    for (const [agentId, agent] of this.agentHierarchy) {
      const blockerInfo = await this.dependencyTracker.canAgentComplete(agentId);
      if (!blockerInfo.canComplete) {
        this.logger.debug(`Agent ${agentId} at level ${agent.level} cannot complete: ${blockerInfo.reason}`);
        return false;
      }
    }

    // Check coordinator dependencies
    const coordinatorBlockerInfo = await this.dependencyTracker.canAgentComplete(this.coordinatorId);
    return coordinatorBlockerInfo.canComplete;
  }

  private async checkCoordinatorCompletion(): Promise<void> {
    // Check if all tasks are completed
    const pendingTasks = Array.from(this.tasks.values()).filter(t =>
      t.status === 'pending' || t.status === 'active' || t.status === 'delegated'
    );

    if (pendingTasks.length === 0) {
      const canComplete = await this.checkHierarchyCompletionDependencies();
      if (canComplete && !this.isRunning) {
        // All tasks done and no dependencies - can complete
        await this.finalizeCompletion();
      }
    }
  }

  private async finalizeCompletion(): Promise<void> {
    this.logger.info('Hierarchical coordinator ready for completion');

    // Clean up all hierarchy dependencies
    await this.cleanupHierarchyDependencies();

    // Transition to completed state
    await lifecycleManager.transitionState(this.coordinatorId, 'stopped', 'All hierarchical coordination tasks completed');

    this.emit('coordinator:completed', { coordinatorId: this.coordinatorId });
  }

  private async cleanupHierarchyDependencies(): Promise<void> {
    if (!this.config.enableDependencyTracking) return;

    // Remove all agent dependencies in hierarchy
    for (const [agentId, agent] of this.agentHierarchy) {
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

  private async handleTaskCompletionEvent(event: { taskId: string; agentId: string; result: unknown }): Promise<void> {
    this.logger.debug(`Handling hierarchical task completion event: ${event.taskId}`);
  }

  private async handleTaskFailureEvent(event: { taskId: string; error: string; agentId: string }): Promise<void> {
    this.logger.debug(`Handling hierarchical task failure event: ${event.taskId}`);
  }

  private async handleAgentStatusChange(event: { agentId: string; oldStatus: string; newStatus: string }): Promise<void> {
    const agent = this.agentHierarchy.get(event.agentId);
    if (agent) {
      agent.lastActivity = new Date();

      // Auto-promote capable agents if enabled
      if (this.config.autoPromoteCapable && event.newStatus === 'ready' && agent.capabilities.includes('coordination')) {
        await this.considerAgentPromotion(event.agentId);
      }
    }
  }

  private async considerAgentPromotion(agentId: string): Promise<void> {
    const agent = this.agentHierarchy.get(agentId);
    if (!agent || agent.level >= this.config.maxDepth - 1) return;

    // Check if agent should be promoted based on performance and capabilities
    const performanceScore = agent.workload > 0 ? 1 / agent.workload : 1;
    const capabilityScore = agent.capabilities.includes('coordination') ? 2 : 1;

    if (performanceScore + capabilityScore >= 2.5) {
      this.logger.info(`Considering promotion for capable agent ${agentId}`);
      this.emit('agent:promotion_considered', { agentId, score: performanceScore + capabilityScore });
    }
  }

  private async handleRerunRequest(): Promise<void> {
    this.logger.info('Hierarchical coordinator rerun requested');

    // Reset coordinator state for rerun
    await lifecycleManager.transitionState(this.coordinatorId, 'running', 'Hierarchical coordinator rerun requested');

    this.isRunning = true;
    this.startBackgroundTasks();

    this.emit('coordinator:rerun', { coordinatorId: this.coordinatorId });
  }

  private startBackgroundTasks(): void {
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
    }

    // Periodic hierarchy rebalancing
    this.rebalanceTimer = setInterval(() => {
      this.rebalanceHierarchy();
    }, this.config.hierarchyRebalanceInterval);

    // Periodic completion checking
    this.completionCheckTimer = setInterval(() => {
      this.checkCoordinatorCompletion();
    }, 15000); // Check every 15 seconds
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

  private async rebalanceHierarchy(): Promise<void> {
    // Rebalance hierarchy based on agent performance and workload
    for (const [agentId, agent] of this.agentHierarchy) {
      // Check if agent should be promoted or demoted
      if (agent.workload === 0 && agent.childIds.length > this.config.maxChildrenPerNode / 2) {
        // Consider promoting some children
        const capableChildren = agent.childIds.filter(childId => {
          const child = this.agentHierarchy.get(childId);
          return child && child.capabilities.includes('coordination');
        });

        if (capableChildren.length > 0) {
          this.logger.debug(`Considering hierarchy rebalancing for agent ${agentId}`);
        }
      }
    }
  }

  private startTaskMonitoring(taskId: string): void {
    // Monitor task progress and handle timeouts
    setTimeout(() => {
      const task = this.tasks.get(taskId);
      if (task && (task.status === 'active' || task.status === 'delegated')) {
        this.handleTaskFailure(taskId, task.assignedAgentId, 'Task timeout in hierarchy');
      }
    }, this.config.completionTimeout);
  }

  // ============================================================================
  // Public Query Methods
  // ============================================================================

  getCoordinatorStatus(): {
    coordinatorId: string;
    status: string;
    hierarchyDepth: number;
    totalAgents: number;
    rootAgents: number;
    activeTaskCount: number;
    completedTaskCount: number;
    canComplete: boolean;
    dependencies: string[];
  } {
    const activeTasks = Array.from(this.tasks.values()).filter(t =>
      t.status === 'active' || t.status === 'pending' || t.status === 'delegated'
    );

    const completedTasks = Array.from(this.tasks.values()).filter(t =>
      t.status === 'completed'
    );

    const depStatus = getAgentDependencyStatus(this.coordinatorId);

    const maxDepth = this.agentHierarchy.size > 0
      ? Math.max(...Array.from(this.agentHierarchy.values()).map(a => a.level))
      : 0;

    return {
      coordinatorId: this.coordinatorId,
      status: this.lifecycleContext?.state || 'unknown',
      hierarchyDepth: maxDepth + 1,
      totalAgents: this.agentHierarchy.size,
      rootAgents: this.rootAgentIds.size,
      activeTaskCount: activeTasks.length,
      completedTaskCount: completedTasks.length,
      canComplete: depStatus.canComplete,
      dependencies: depStatus.dependencies
    };
  }

  getHierarchyStructure(): {
    agents: Array<{
      id: string;
      name: string;
      level: number;
      parentId?: string;
      childIds: string[];
      workload: number;
      status: string;
    }>;
    depth: number;
    rootCount: number;
  } {
    const agents = Array.from(this.agentHierarchy.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      level: agent.level,
      parentId: agent.parentId,
      childIds: [...agent.childIds],
      workload: agent.workload,
      status: agent.status
    }));

    const depth = agents.length > 0 ? Math.max(...agents.map(a => a.level)) + 1 : 0;

    return {
      agents,
      depth,
      rootCount: this.rootAgentIds.size
    };
  }

  getTaskStatus(taskId: string): HierarchicalTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): HierarchicalTask[] {
    return Array.from(this.tasks.values());
  }

  getAgentStatus(agentId: string): HierarchicalAgentNode | undefined {
    return this.agentHierarchy.get(agentId);
  }
}

// ============================================================================
// Factory and Utility Functions
// ============================================================================

export function createHierarchicalCoordinator(config?: Partial<HierarchicalCoordinatorConfig>): HierarchicalCoordinator {
  return new HierarchicalCoordinator(config);
}

export function createHierarchicalCoordinatorWithDependencies(
  dependencyNamespace: string,
  config?: Partial<HierarchicalCoordinatorConfig>
): HierarchicalCoordinator {
  const enhancedConfig = {
    ...config,
    enableDependencyTracking: true,
    memoryNamespace: dependencyNamespace
  };

  return new HierarchicalCoordinator(enhancedConfig);
}

// Export types for external use
export type {
  HierarchicalAgentNode,
  HierarchicalTask,
  HierarchicalCoordinatorConfig
};