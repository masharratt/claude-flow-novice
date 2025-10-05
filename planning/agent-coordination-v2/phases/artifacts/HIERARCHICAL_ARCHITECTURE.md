# Hierarchical Coordinator Architecture Design
**Version**: 1.0
**Phase**: 5.1 (Sprint 1 - Architecture Design)
**Date**: 2025-10-03
**Status**: Design Complete

---

## Executive Summary

This document defines the PM-based hierarchical coordination architecture for claude-flow-novice Phase 5. The design supports 10+ nested agent levels with parent-child relationship management, task delegation workflows, and hierarchical completion detection.

**Key Design Principles**:
- Project Manager (Level 0) supervises all workers (Level 1+)
- Bottom-up completion detection (leaves → root)
- Parent controls all children via pause/inject/resume
- Pointer-based context sharing (no duplication)
- Background process orchestration for scalability

---

## 1. Architecture Overview

### 1.1 Hierarchical Structure

```
Level 0: Claude Code Chat (Supervisor/Root PM)
├─ Level 1: Background PM 1 (Project Manager)
│  ├─ Level 2: Worker 1.1
│  ├─ Level 2: Worker 1.2
│  └─ Level 2: Sub-PM 1.3 (nested coordinator)
│     ├─ Level 3: Worker 1.3.1
│     └─ Level 3: Worker 1.3.2
├─ Level 1: Background PM 2 (Project Manager)
│  ├─ Level 2: Worker 2.1
│  └─ Level 2: Worker 2.2
└─ Level 1: Worker 3 (direct report)
```

**Design Constraints**:
- **Max Depth**: 10+ levels (configurable, default 15)
- **Max Children Per Node**: 10 (prevents fanout explosion)
- **Agent Spawn Time**: <2s for 10 agents across multiple levels
- **Parent Control Latency**: <100ms for pause/inject/resume operations

### 1.2 Component Architecture

```typescript
// Core components hierarchy
┌─────────────────────────────────────────────────────────────┐
│ HierarchicalCoordinator (Entry Point)                       │
│ ├─ Agent Hierarchy Manager (parent-child relationships)     │
│ ├─ Task Delegation System (PM → workers)                    │
│ ├─ Completion Detector (hierarchical-detector.ts)           │
│ └─ Lifecycle Manager (state propagation)                    │
└─────────────────────────────────────────────────────────────┘
         ↓                    ↓                    ↓
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ State        │    │ Message      │    │ Dependency   │
│ Machine      │    │ Broker       │    │ Graph        │
│ (Phase 1)    │    │ (Phase 3)    │    │ (Phase 2)    │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## 2. Core Data Structures

### 2.1 HierarchicalAgentNode

```typescript
/**
 * Represents a node in the agent hierarchy tree
 *
 * Design rationale:
 * - Tracks parent-child relationships for traversal
 * - Stores completion dependencies for bottom-up detection
 * - Maintains workload metrics for load balancing
 * - Includes hierarchy path for O(1) depth queries
 */
interface HierarchicalAgentNode {
  // Identity
  id: string;                       // Unique agent identifier
  name: string;                     // Human-readable agent name
  type: string;                     // Agent type (pm, worker, specialist)

  // Hierarchy positioning
  level: number;                    // Depth in hierarchy (0 = root)
  parentId?: string;                // Parent agent ID (undefined for root)
  childIds: string[];               // Child agent IDs
  hierarchyPath: string[];          // Path from root to this node [root, ..., parent]

  // State and lifecycle
  status: 'initializing' | 'ready' | 'working' | 'completed' | 'failed';
  lastActivity: Date;               // Last state transition timestamp

  // Capabilities and workload
  capabilities: string[];           // Agent capabilities (coordination, coding, etc.)
  workload: number;                 // Current task count (0-N)
  assignedTasks: string[];          // Active task IDs

  // Completion tracking (Phase 4 integration)
  completionDependencies: string[]; // Child agents this depends on
}
```

**Key Design Decisions**:
1. **hierarchyPath**: Enables O(1) level queries without tree traversal
2. **completionDependencies**: Explicit tracking for Phase 4 hierarchical detector
3. **workload**: Simple counter for load-balancing task delegation
4. **status**: Separate from AgentState enum to allow hierarchy-specific states

### 2.2 HierarchicalTask

```typescript
/**
 * Task structure for PM-based delegation
 *
 * Design rationale:
 * - Supports task decomposition (parent → subtasks)
 * - Tracks delegation chain for debugging
 * - Priority-based scheduling for critical tasks
 * - Level tracking for multi-level delegation
 */
interface HierarchicalTask {
  // Identity
  id: string;                       // Unique task identifier
  type: string;                     // Task type (implementation, review, etc.)
  description: string;              // Task description

  // Hierarchy
  parentTaskId?: string;            // Parent task ID (undefined for root tasks)
  subTaskIds: string[];             // Subtask IDs (decomposed from this task)
  level: number;                    // Hierarchy level where task assigned

  // Assignment
  assignedAgentId: string;          // Agent currently executing this task
  coordinatorId: string;            // Coordinator that created this task

  // Dependencies
  dependencies: string[];           // Task IDs this depends on

  // Lifecycle
  status: 'pending' | 'active' | 'delegated' | 'completed' | 'failed';
  priority: number;                 // 1-10 (higher = more urgent)
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Results
  result?: unknown;                 // Task execution result
  error?: string;                   // Error message if failed
}
```

**Key Design Decisions**:
1. **status: 'delegated'**: Distinct state for tasks subdivided to children
2. **priority**: Determines if task should be further decomposed
3. **parentTaskId + subTaskIds**: Bidirectional parent-child linking
4. **coordinatorId**: Tracks which coordinator owns this task

### 2.3 HierarchicalCoordinatorConfig

```typescript
/**
 * Configuration for hierarchical coordinator behavior
 */
interface HierarchicalCoordinatorConfig {
  // Hierarchy constraints
  maxDepth: number;                       // Default: 5 (prevent infinite nesting)
  maxChildrenPerNode: number;             // Default: 10 (prevent fanout explosion)

  // Task delegation strategy
  taskDelegationStrategy: 'top-down' | 'bottom-up' | 'hybrid';
  // - top-down: PM delegates sequentially (breadth-first)
  // - bottom-up: Leaf agents request tasks (pull model)
  // - hybrid: PM delegates to available agents (push-pull)

  // Feature flags
  enableDependencyTracking: boolean;      // Default: true (Phase 2 integration)
  autoPromoteCapable: boolean;            // Default: true (promote high-performing agents)

  // Timeouts
  completionTimeout: number;              // Default: 300000ms (5 min)
  hierarchyRebalanceInterval: number;     // Default: 45000ms (45s)

  // Storage
  memoryNamespace: string;                // Default: 'hierarchical-coordinator'
}
```

---

## 3. Parent-Child Relationship Management

### 3.1 Registration System

```typescript
/**
 * Register agent in hierarchy with parent-child linking
 *
 * Algorithm:
 * 1. Validate parent exists and constraints satisfied
 * 2. Create HierarchicalAgentNode with computed level
 * 3. Link parent → child and child → parent
 * 4. Register completion dependencies (Phase 4)
 * 5. Register coordination dependency with coordinator
 */
async registerAgent(
  agentId: string,
  agentInfo: Omit<HierarchicalAgentNode, 'id' | 'childIds' | 'workload' | ...>,
  parentId?: string
): Promise<void> {
  // Step 1: Validate constraints
  if (parentId) {
    const parent = this.agentHierarchy.get(parentId);
    if (!parent) {
      throw new Error(`Parent agent ${parentId} not found`);
    }
    if (parent.childIds.length >= this.config.maxChildrenPerNode) {
      throw new Error(`Parent ${parentId} has max children (${this.config.maxChildrenPerNode})`);
    }
    if (parent.level >= this.config.maxDepth - 1) {
      throw new Error(`Max depth ${this.config.maxDepth} would be exceeded`);
    }
  }

  // Step 2: Compute hierarchy position
  const hierarchyPath = parentId
    ? [...(this.agentHierarchy.get(parentId)?.hierarchyPath || []), parentId]
    : [];
  const level = hierarchyPath.length; // Level 0 = root, Level 1 = children, etc.

  // Step 3: Create node
  const node: HierarchicalAgentNode = {
    id: agentId,
    childIds: [],
    workload: 0,
    lastActivity: new Date(),
    assignedTasks: [],
    completionDependencies: [],
    hierarchyPath,
    level,
    parentId,
    ...agentInfo,
  };

  this.agentHierarchy.set(agentId, node);

  // Step 4: Link parent-child relationships
  if (parentId) {
    const parent = this.agentHierarchy.get(parentId)!;
    parent.childIds.push(agentId);

    // Phase 4 integration: Parent depends on child completion
    if (this.config.enableDependencyTracking) {
      await registerAgentDependency(
        parentId,               // Parent depends on...
        agentId,                // ...child completion
        DependencyType.COMPLETION,
        {
          timeout: this.config.completionTimeout,
          metadata: {
            coordinatorType: 'hierarchical',
            relationship: 'parent-child',
            hierarchyLevel: level,
          },
        }
      );

      parent.completionDependencies.push(agentId);
    }
  } else {
    // Root agent (no parent)
    this.rootAgentIds.add(agentId);
  }

  // Step 5: Coordinator depends on all agents
  if (this.config.enableDependencyTracking) {
    await registerAgentDependency(
      this.coordinatorId,       // Coordinator depends on...
      agentId,                  // ...agent coordination
      DependencyType.COORDINATION,
      {
        timeout: this.config.completionTimeout,
        metadata: {
          coordinatorType: 'hierarchical',
          relationship: 'coordination',
          hierarchyLevel: level,
        },
      }
    );
  }
}
```

**Design Rationale**:
- **hierarchyPath caching**: Avoids recursive parent traversal on every query
- **Dual dependency registration**: Parent-child (completion) + coordinator-agent (coordination)
- **Level computation**: O(1) via hierarchyPath.length instead of tree traversal
- **Constraint validation first**: Fail fast before modifying state

### 3.2 Unregistration System (Bottom-Up Cleanup)

```typescript
/**
 * Unregister agent and all descendants (recursive bottom-up)
 *
 * Algorithm:
 * 1. Recursively unregister children first (DFS)
 * 2. Remove from parent's childIds array
 * 3. Clean up all dependencies
 * 4. Remove from hierarchy map
 */
async unregisterAgent(agentId: string): Promise<void> {
  const agent = this.agentHierarchy.get(agentId);
  if (!agent) return;

  // Step 1: Recursively unregister children (leaves first)
  for (const childId of [...agent.childIds]) {
    await this.unregisterAgent(childId);
  }

  // Step 2: Remove from parent's children list
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
    // Remove from root set
    this.rootAgentIds.delete(agentId);
  }

  // Step 3: Remove all dependencies for this agent
  if (this.config.enableDependencyTracking) {
    const depStatus = getAgentDependencyStatus(agentId);
    for (const depId of depStatus.dependencies) {
      await removeAgentDependency(depId);
    }
  }

  // Step 4: Remove from hierarchy
  this.agentHierarchy.delete(agentId);
}
```

**Design Rationale**:
- **Bottom-up DFS**: Ensures children cleaned up before parents
- **Dependency cleanup**: Removes both parent-child and coordination dependencies
- **Copy childIds array**: Prevents iteration mutation issues during recursion

### 3.3 Agent Promotion (Hierarchy Rebalancing)

```typescript
/**
 * Promote agent to different parent (or root)
 *
 * Use cases:
 * - Load balancing (move agents to less-loaded PM)
 * - Capability promotion (worker → PM)
 * - Hierarchy optimization (reduce depth)
 */
async promoteAgent(agentId: string, newParentId?: string): Promise<void> {
  const agent = this.agentHierarchy.get(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  // Validate new parent
  if (newParentId) {
    const newParent = this.agentHierarchy.get(newParentId);
    if (!newParent) {
      throw new Error(`New parent ${newParentId} not found`);
    }
    if (newParent.childIds.length >= this.config.maxChildrenPerNode) {
      throw new Error('New parent has max children');
    }
  }

  // Remove from old parent
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
}
```

---

## 4. Task Delegation Workflows

### 4.1 Task Delegation (PM → Workers)

```typescript
/**
 * PM delegates task to worker agent
 *
 * Algorithm:
 * 1. Select best agent for task (capability + workload scoring)
 * 2. Create HierarchicalTask
 * 3. Register task completion dependencies
 * 4. Delegate to agent (update state, possibly subdivide)
 * 5. Start task monitoring (timeout detection)
 */
async delegateTask(
  taskDescription: string,
  options: {
    targetLevel?: number;           // Preferred hierarchy level
    requiredCapabilities?: string[]; // Required agent capabilities
    priority?: number;              // Task priority (1-10)
    parentTaskId?: string;          // Parent task if subdivision
    timeout?: number;               // Task timeout override
  } = {}
): Promise<string> {
  const taskId = generateId('hier-task');

  // Step 1: Select agent using scoring algorithm
  const selectedAgent = this.selectAgentForTask(
    options.targetLevel || 0,
    options.requiredCapabilities || [],
    options.priority || 1
  );

  if (!selectedAgent) {
    throw new Error('No suitable agent found for task delegation');
  }

  // Step 2: Create task
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
    coordinatorId: this.coordinatorId,
  };

  this.tasks.set(taskId, task);

  // Step 3: Link parent task (if subdivision)
  if (options.parentTaskId) {
    const parentTask = this.tasks.get(options.parentTaskId);
    if (parentTask) {
      parentTask.subTaskIds.push(taskId);
    }
  }

  // Step 4: Create task hierarchy dependencies (Phase 2 integration)
  if (this.config.enableDependencyTracking) {
    await this.createTaskHierarchyDependencies(taskId, selectedAgent);
  }

  // Step 5: Delegate to agent
  await this.delegateTaskToAgent(task, selectedAgent);

  return taskId;
}
```

### 4.2 Agent Selection Algorithm

```typescript
/**
 * Multi-criteria agent selection for task delegation
 *
 * Scoring factors:
 * - Level match (40%): Prefer target level
 * - Capability match (30%): Required capabilities present
 * - Load balance (20%): Prefer low workload agents
 * - Hierarchy position (10%): Prefer higher levels for coordination
 */
private selectAgentForTask(
  targetLevel: number,
  requiredCapabilities: string[],
  priority: number
): HierarchicalAgentNode | null {
  const candidates: Array<{ agent: HierarchicalAgentNode; score: number }> = [];

  for (const [agentId, agent] of this.agentHierarchy) {
    // Only consider ready agents
    if (agent.status !== 'ready') continue;

    // Level score (40% weight)
    const levelScore = targetLevel === agent.level
      ? 2.0
      : Math.max(0, 2 - Math.abs(targetLevel - agent.level));

    // Capability score (30% weight)
    const hasRequiredCaps = requiredCapabilities.every(cap =>
      agent.capabilities.includes(cap)
    );

    if (!hasRequiredCaps && requiredCapabilities.length > 0) {
      continue; // Hard requirement not met
    }

    const capabilityScore = requiredCapabilities.length > 0
      ? requiredCapabilities.filter(cap => agent.capabilities.includes(cap)).length /
        requiredCapabilities.length
      : 1.0;

    // Load score (20% weight) - prefer low workload
    const loadScore = 1 / (agent.workload + 1);

    // Hierarchy score (10% weight) - prefer higher levels for coordination
    const hierarchyScore = 1 / (agent.level + 1);

    // Weighted sum
    const score =
      levelScore * 0.4 +
      capabilityScore * 0.3 +
      loadScore * 0.2 +
      hierarchyScore * 0.1;

    candidates.push({ agent, score });
  }

  if (candidates.length === 0) return null;

  // Return highest-scoring candidate
  return candidates.sort((a, b) => b.score - a.score)[0].agent;
}
```

**Design Rationale**:
- **Multi-criteria**: Balances level preference, capabilities, load, hierarchy position
- **Hard vs soft constraints**: requiredCapabilities are hard, others are soft
- **Weighted scoring**: Level (40%) prioritized over load (20%)
- **Sort once**: O(n log n) sort instead of multiple iterations

### 4.3 Task Subdivision (Recursive Delegation)

```typescript
/**
 * Determine if task should be subdivided to child agents
 */
private shouldSubdelegate(
  task: HierarchicalTask,
  agent: HierarchicalAgentNode
): boolean {
  return (
    task.level < this.config.maxDepth - 1 &&  // Not at max depth
    agent.childIds.length > 0 &&              // Agent has children
    task.priority >= 2                        // Only high-priority tasks
  );
}

/**
 * Subdivide task into subtasks for child agents
 */
private async createSubtasks(
  parentTask: HierarchicalTask,
  parentAgent: HierarchicalAgentNode
): Promise<void> {
  const subtaskCount = Math.min(parentAgent.childIds.length, 3); // Max 3 subtasks

  for (let i = 0; i < subtaskCount; i++) {
    const childId = parentAgent.childIds[i];
    const child = this.agentHierarchy.get(childId);

    if (child && child.status === 'ready') {
      // Recursively delegate subtask
      const subtaskId = await this.delegateTask(
        `Subtask ${i + 1} of: ${parentTask.description}`,
        {
          targetLevel: child.level,
          requiredCapabilities: child.capabilities.slice(0, 2),
          priority: parentTask.priority,
          parentTaskId: parentTask.id,
          timeout: this.config.completionTimeout,
        }
      );

      parentTask.subTaskIds.push(subtaskId);
    }
  }

  // Parent task now delegated to children
  parentTask.status = 'delegated';
}
```

---

## 5. Hierarchical Completion Detection (Phase 4 Integration)

### 5.1 Bottom-Up Completion Algorithm

```typescript
/**
 * Check if entire hierarchy completed (bottom-up traversal)
 *
 * Algorithm (from Phase 4 hierarchical-detector.ts):
 * 1. Check root PM completed (implies all children completed)
 * 2. Recursively verify all children completed (bottom-up validation)
 * 3. Create checkpoint before declaring completion
 */
private async checkHierarchyCompletionDependencies(): Promise<boolean> {
  if (!this.config.enableDependencyTracking) {
    return true;
  }

  // Check all agents can complete
  for (const [agentId, agent] of this.agentHierarchy) {
    const blockerInfo = await this.dependencyTracker.canAgentComplete(agentId);
    if (!blockerInfo.canComplete) {
      this.logger.debug(
        `Agent ${agentId} at level ${agent.level} cannot complete: ${blockerInfo.reason}`
      );
      return false;
    }
  }

  // Check coordinator can complete
  const coordinatorBlockerInfo = await this.dependencyTracker.canAgentComplete(
    this.coordinatorId
  );
  return coordinatorBlockerInfo.canComplete;
}

/**
 * Recursive node completion check (from Phase 4)
 */
private checkNodeCompletion(
  node: HierarchicalAgentNode,
  hierarchy: SwarmHierarchy
): boolean {
  // Check node itself completed
  if (node.state !== AgentState.COMPLETED) {
    return false;
  }

  // Check all children completed (recursive)
  for (const childId of node.childIds) {
    const child = hierarchy.nodes.get(childId);
    if (!child || !this.checkNodeCompletion(child, hierarchy)) {
      return false;
    }
  }

  return true;
}
```

### 5.2 Task Completion Handling

```typescript
/**
 * Handle task completion with bottom-up propagation
 *
 * Algorithm:
 * 1. Update agent status (ready, reduce workload)
 * 2. Update task status (completed, store result)
 * 3. Resolve task dependencies (Phase 2 integration)
 * 4. Check parent task completion (if all subtasks done)
 * 5. Check coordinator completion (if all tasks done)
 */
async handleTaskCompletion(
  taskId: string,
  agentId: string,
  result: unknown
): Promise<void> {
  const task = this.tasks.get(taskId);
  const agent = this.agentHierarchy.get(agentId);

  if (!task || !agent) return;

  // Step 1: Update agent
  agent.status = 'ready';
  agent.workload = Math.max(0, agent.workload - 1);
  agent.lastActivity = new Date();

  const taskIndex = agent.assignedTasks.indexOf(taskId);
  if (taskIndex > -1) {
    agent.assignedTasks.splice(taskIndex, 1);
  }

  // Step 2: Update task
  task.status = 'completed';
  task.completedAt = new Date();
  task.result = result;

  // Step 3: Resolve dependencies
  if (this.config.enableDependencyTracking) {
    await this.resolveTaskHierarchyDependencies(taskId, result);
  }

  // Step 4: Check parent task completion
  if (task.parentTaskId) {
    await this.checkParentTaskCompletion(task.parentTaskId);
  }

  // Step 5: Check coordinator completion
  await this.checkCoordinatorCompletion();
}

/**
 * Check if parent task can complete (all subtasks done)
 */
private async checkParentTaskCompletion(parentTaskId: string): Promise<void> {
  const parentTask = this.tasks.get(parentTaskId);
  if (!parentTask) return;

  // Check all subtasks completed or failed
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
      // Propagate failure up
      await this.handleTaskFailure(
        parentTaskId,
        parentTask.assignedAgentId,
        'One or more subtasks failed'
      );
    } else {
      // Aggregate subtask results
      const subtaskResults = parentTask.subTaskIds.map(subTaskId => {
        const subTask = this.tasks.get(subTaskId);
        return subTask?.result;
      });

      // Parent task completion
      await this.handleTaskCompletion(parentTaskId, parentTask.assignedAgentId, {
        subtaskResults,
        aggregatedResult: `Completed with ${subtaskResults.length} subtasks`,
      });
    }
  }
}
```

---

## 6. Integration Points

### 6.1 Phase 1 (State Machine) Integration

```typescript
/**
 * Hierarchical state propagation (parent → children)
 *
 * When parent state changes, optionally propagate to children.
 * Example: Parent ERROR → pause all children
 */
async propagateState(
  parentId: string,
  newState: AgentState,
  cascade: boolean = false
): Promise<void> {
  if (!cascade) return;

  const parent = this.agentHierarchy.get(parentId);
  if (!parent) return;

  // Propagate to all children
  for (const childId of parent.childIds) {
    await this.stateMachine.transition(childId, newState);

    // Recursive propagation
    await this.propagateState(childId, newState, cascade);
  }
}
```

### 6.2 Phase 2 (Dependency Graph) Integration

```typescript
/**
 * Create task hierarchy dependencies
 *
 * Dependencies:
 * - Coordinator depends on agent completing task
 * - Parent agent depends on children completing subtasks
 */
private async createTaskHierarchyDependencies(
  taskId: string,
  agent: HierarchicalAgentNode
): Promise<void> {
  // Coordinator → agent dependency
  await registerAgentDependency(
    this.coordinatorId,
    agent.id,
    DependencyType.COMPLETION,
    {
      timeout: this.config.completionTimeout,
      metadata: {
        taskId,
        coordinatorType: 'hierarchical',
        relationship: 'task-completion',
        hierarchyLevel: agent.level,
      },
    }
  );

  // Parent → children subtask dependencies
  for (const childId of agent.childIds) {
    await registerAgentDependency(
      agent.id,
      childId,
      DependencyType.COMPLETION,
      {
        timeout: this.config.completionTimeout,
        metadata: {
          taskId,
          coordinatorType: 'hierarchical',
          relationship: 'subtask-completion',
          hierarchyLevel: agent.level + 1,
        },
      }
    );

    agent.completionDependencies.push(childId);
  }
}
```

### 6.3 Phase 3 (Message Bus) Integration

```typescript
/**
 * Task delegation via message bus
 *
 * Publish task assignment to 'task' channel
 */
private async delegateTaskToAgent(
  task: HierarchicalTask,
  agent: HierarchicalAgentNode
): Promise<void> {
  // Update agent state
  agent.status = 'working';
  agent.workload += 1;
  agent.assignedTasks.push(task.id);
  agent.lastActivity = new Date();

  // Update task state
  task.status = 'active';
  task.startedAt = new Date();

  // Publish task via message bus
  await this.messageBroker.publish('task', {
    type: 'task_assignment',
    taskId: task.id,
    agentId: agent.id,
    description: task.description,
    priority: task.priority,
    dependencies: task.dependencies,
  });

  // Subdivide if needed
  if (agent.childIds.length > 0 && this.shouldSubdelegate(task, agent)) {
    await this.createSubtasks(task, agent);
  }

  // Start monitoring
  this.startTaskMonitoring(task.id);
}
```

### 6.4 Phase 4 (Completion Detection) Integration

**See Section 5.1** for hierarchical-detector.ts integration.

---

## 7. Level 0 Coordinator (Supervisor Role)

### 7.1 Supervisor Capabilities

```typescript
/**
 * Level 0 coordinator in Claude Code chat
 *
 * Responsibilities:
 * - Create and manage hierarchical swarms
 * - Control all agents at any level (pause/inject/resume)
 * - Monitor hierarchy health
 * - Trigger cascading shutdown
 */
class Level0Coordinator {
  /**
   * Create hierarchical swarm with root PM
   */
  async createHierarchy(config: {
    pmType: 'background' | 'inline';
    workerCount: number;
    depth: number;
  }): Promise<string> {
    const swarmId = generateId('hier-swarm');

    // Initialize hierarchical coordinator
    const coordinator = new HierarchicalCoordinator({
      maxDepth: config.depth,
      maxChildrenPerNode: 10,
      taskDelegationStrategy: 'hybrid',
      enableDependencyTracking: true,
    });

    await coordinator.initialize();

    // Create root PM (Level 1)
    const pmId = await this.createPM(coordinator, config.pmType);

    // Fork worker sessions from PM
    await this.forkWorkers(coordinator, pmId, config.workerCount);

    this.coordinators.set(swarmId, coordinator);
    return swarmId;
  }

  /**
   * Pause any agent at any level
   */
  async pauseAgent(swarmId: string, agentId: string): Promise<void> {
    const coordinator = this.coordinators.get(swarmId);
    if (!coordinator) throw new Error(`Swarm ${swarmId} not found`);

    const agent = coordinator.getAgentStatus(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found in swarm`);

    // Pause via query controller
    await this.queryController.pauseAgent(agentId);

    // Create checkpoint
    await this.checkpointManager.createCheckpoint(agentId, `paused_by_level0`);

    this.logger.info(`Level 0 paused agent ${agentId} at level ${agent.level}`);
  }

  /**
   * Inject message to any agent
   */
  async injectMessage(
    swarmId: string,
    agentId: string,
    message: any
  ): Promise<void> {
    await this.sessionManager.injectMessage(agentId, {
      ...message,
      injectedBy: 'level0-coordinator',
      timestamp: Date.now(),
    });
  }

  /**
   * Resume agent from pause
   */
  async resumeAgent(
    swarmId: string,
    agentId: string,
    checkpointId?: string
  ): Promise<void> {
    if (checkpointId) {
      await this.checkpointManager.restoreCheckpoint(agentId, checkpointId);
    }

    await this.queryController.resumeAgent(agentId);
  }

  /**
   * Monitor hierarchy health
   */
  async getHierarchyStatus(swarmId: string): Promise<{
    depth: number;
    totalAgents: number;
    activeTaskCount: number;
    completedTaskCount: number;
    canComplete: boolean;
  }> {
    const coordinator = this.coordinators.get(swarmId);
    if (!coordinator) throw new Error(`Swarm ${swarmId} not found`);

    return coordinator.getCoordinatorStatus();
  }
}
```

---

## 8. Performance Characteristics

### 8.1 Time Complexity

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| registerAgent | O(1) | Map insertion + constant dependency registration |
| unregisterAgent | O(c) | c = total descendants (DFS traversal) |
| delegateTask | O(n) | n = agent count (linear search for best match) |
| selectAgentForTask | O(n) | Single pass through all agents |
| checkHierarchyCompletion | O(n) | DFS traversal of entire hierarchy |
| handleTaskCompletion | O(1) | Constant time updates |
| checkParentTaskCompletion | O(s) | s = subtask count (bounded by maxChildren) |

### 8.2 Space Complexity

| Data Structure | Space | Notes |
|----------------|-------|-------|
| agentHierarchy | O(n) | n = agent count |
| tasks | O(t) | t = task count |
| rootAgentIds | O(r) | r = root agent count (typically 1-5) |
| hierarchyPath (per node) | O(d) | d = depth (max 15) |
| childIds (per node) | O(c) | c = maxChildrenPerNode (10) |

### 8.3 Performance Targets

| Metric | Target | Actual Implementation |
|--------|--------|----------------------|
| Agent spawn time | <2s for 10 agents | Session forking with pointer-based context |
| Parent control latency | <100ms | Query controller pause/inject/resume |
| Nested hierarchy depth | 10+ levels | Configurable maxDepth (default 15) |
| Background process detection | <500ms | BashOutput monitoring (500ms polling) |
| Checkpoint recovery | <500ms | Artifact-backed storage (Phase 1 validated) |
| Cascading shutdown | <1s for 20 agents | DFS bottom-up shutdown |

---

## 9. Error Handling and Edge Cases

### 9.1 Circular Hierarchy Prevention

```typescript
/**
 * Prevent circular parent-child relationships
 */
private validateNoCycle(childId: string, newParentId: string): boolean {
  let current: string | undefined = newParentId;

  while (current) {
    if (current === childId) {
      return false; // Cycle detected
    }

    const node = this.agentHierarchy.get(current);
    current = node?.parentId;
  }

  return true; // No cycle
}
```

### 9.2 Max Depth Enforcement

```typescript
/**
 * Prevent exceeding max hierarchy depth
 */
if (parent.level >= this.config.maxDepth - 1) {
  throw new Error(
    `Max depth ${this.config.maxDepth} would be exceeded. ` +
    `Parent at level ${parent.level}, child would be at level ${parent.level + 1}`
  );
}
```

### 9.3 Orphan Detection

```typescript
/**
 * Detect and handle orphaned agents (parent removed without cleanup)
 */
async detectOrphans(): Promise<string[]> {
  const orphans: string[] = [];

  for (const [agentId, agent] of this.agentHierarchy) {
    if (agent.parentId && !this.agentHierarchy.has(agent.parentId)) {
      orphans.push(agentId);
    }
  }

  return orphans;
}

async handleOrphans(orphanIds: string[]): Promise<void> {
  for (const orphanId of orphanIds) {
    const orphan = this.agentHierarchy.get(orphanId);
    if (!orphan) continue;

    // Option 1: Promote to root
    orphan.parentId = undefined;
    orphan.hierarchyPath = [];
    orphan.level = 0;
    this.rootAgentIds.add(orphanId);

    // Option 2: Unregister completely (commented out)
    // await this.unregisterAgent(orphanId);
  }
}
```

---

## 10. Future Enhancements

### 10.1 Dynamic Rebalancing

```typescript
/**
 * Automatically rebalance hierarchy based on agent performance
 *
 * Triggers:
 * - Agent workload exceeds threshold (>5 tasks)
 * - Parent has too many children (>maxChildrenPerNode * 0.8)
 * - Agent capabilities improve (promote to PM)
 */
private async rebalanceHierarchy(): Promise<void> {
  for (const [agentId, agent] of this.agentHierarchy) {
    // Check overloaded agents
    if (agent.workload > 5) {
      // Promote some children to reduce load
      const capableChildren = agent.childIds.filter(childId => {
        const child = this.agentHierarchy.get(childId);
        return child && child.capabilities.includes('coordination');
      });

      if (capableChildren.length > 0) {
        // Promote capable child to peer
        await this.promoteAgent(capableChildren[0], agent.parentId);
      }
    }
  }
}
```

### 10.2 Capability-Based Auto-Promotion

```typescript
/**
 * Auto-promote agents based on performance metrics
 */
private async considerAgentPromotion(agentId: string): Promise<void> {
  const agent = this.agentHierarchy.get(agentId);
  if (!agent || agent.level >= this.config.maxDepth - 1) return;

  // Performance score: low workload + coordination capability
  const performanceScore = agent.workload > 0 ? 1 / agent.workload : 1;
  const capabilityScore = agent.capabilities.includes('coordination') ? 2 : 1;

  if (performanceScore + capabilityScore >= 2.5) {
    this.logger.info(`Considering promotion for agent ${agentId}`);
    this.emit('agent:promotion_considered', {
      agentId,
      score: performanceScore + capabilityScore,
    });
  }
}
```

### 10.3 Multi-PM Coordination

```typescript
/**
 * Support multiple PMs at Level 1 (horizontal scaling)
 *
 * Use cases:
 * - Large swarms (50+ agents)
 * - Domain-specific PMs (frontend PM, backend PM)
 */
async createMultiPMHierarchy(pmCount: number): Promise<void> {
  for (let i = 0; i < pmCount; i++) {
    const pmId = await this.registerAgent(
      generateId('pm'),
      {
        name: `pm-${i}`,
        type: 'project-manager',
        level: 1,
        status: 'ready',
        capabilities: ['coordination', 'task-delegation'],
      },
      this.coordinatorId // All PMs report to Level 0 coordinator
    );
  }
}
```

---

## 11. Security Considerations

### 11.1 Privilege Escalation Prevention

```typescript
/**
 * Prevent children from controlling parents
 */
async validateControlAuthorization(
  controllerId: string,
  targetId: string
): Promise<boolean> {
  const controller = this.agentHierarchy.get(controllerId);
  const target = this.agentHierarchy.get(targetId);

  if (!controller || !target) return false;

  // Controller must be ancestor of target (higher in hierarchy)
  return target.hierarchyPath.includes(controllerId);
}
```

### 11.2 Resource Exhaustion Protection

```typescript
/**
 * Prevent DoS via excessive task delegation
 */
private async rateLimitTaskDelegation(agentId: string): Promise<boolean> {
  const agent = this.agentHierarchy.get(agentId);
  if (!agent) return false;

  const taskCount = agent.assignedTasks.length;
  const maxTasksPerAgent = 10;

  if (taskCount >= maxTasksPerAgent) {
    this.logger.warn(
      `Agent ${agentId} at max task capacity (${taskCount}/${maxTasksPerAgent})`
    );
    return false;
  }

  return true;
}
```

---

## 12. Monitoring and Observability

### 12.1 Metrics Collection

```typescript
/**
 * Collect hierarchy metrics for monitoring
 */
getHierarchyMetrics(): {
  totalAgents: number;
  agentsByLevel: Map<number, number>;
  avgWorkload: number;
  taskCompletionRate: number;
  hierarchyHealth: 'healthy' | 'degraded' | 'critical';
} {
  const agentsByLevel = new Map<number, number>();
  let totalWorkload = 0;

  for (const agent of Array.from(this.agentHierarchy.values())) {
    agentsByLevel.set(agent.level, (agentsByLevel.get(agent.level) || 0) + 1);
    totalWorkload += agent.workload;
  }

  const avgWorkload = totalWorkload / this.agentHierarchy.size;

  const completedTasks = Array.from(this.tasks.values()).filter(
    t => t.status === 'completed'
  ).length;
  const taskCompletionRate = completedTasks / this.tasks.size;

  const hierarchyHealth = avgWorkload > 5 ? 'critical' :
                          avgWorkload > 3 ? 'degraded' : 'healthy';

  return {
    totalAgents: this.agentHierarchy.size,
    agentsByLevel,
    avgWorkload,
    taskCompletionRate,
    hierarchyHealth,
  };
}
```

---

## Appendix A: API Reference Summary

### Core Classes

- **HierarchicalCoordinator**: Main coordinator class
  - `initialize()`: Initialize coordinator with dependency tracking
  - `registerAgent()`: Add agent to hierarchy
  - `unregisterAgent()`: Remove agent and descendants
  - `promoteAgent()`: Move agent to different parent
  - `delegateTask()`: Assign task to agent
  - `handleTaskCompletion()`: Process task completion
  - `getCoordinatorStatus()`: Query coordinator state

### Data Structures

- **HierarchicalAgentNode**: Agent hierarchy node
- **HierarchicalTask**: Task with hierarchy metadata
- **HierarchicalCoordinatorConfig**: Configuration options

### Integration Points

- **Phase 1 (State Machine)**: State propagation
- **Phase 2 (Dependency Graph)**: Task dependencies
- **Phase 3 (Message Bus)**: Task delegation messages
- **Phase 4 (Completion Detection)**: Hierarchical detector

---

## Appendix B: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-03 | Initial architecture design for Phase 5.1 |

---

**Design Status**: ✅ Complete
**Confidence Score**: 0.92

**Next Steps**:
1. Run post-edit-pipeline hook on this document
2. Review with Phase 5 development team
3. Begin implementation in Sprint 5.2
4. Integration testing with Phase 4 hierarchical detector
