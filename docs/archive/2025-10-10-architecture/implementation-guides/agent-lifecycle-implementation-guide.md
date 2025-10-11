# Agent Lifecycle Management Implementation Guide

## Overview

This guide provides practical examples and implementation details for the Agent Lifecycle Management (ALM) system. It demonstrates how the state machine, hooks, memory, and communication components work together to provide comprehensive lifecycle management for claude-flow agents.

## Quick Start Example

```typescript
import {
  AgentLifecycleManager,
  SQLiteLifecycleMemoryManager,
  DefaultLifecycleCommunicationManager,
  InMemoryMessageRouter
} from '../src/lifecycle/index.js';
import { AgentDefinition } from '../src/agents/agent-loader.js';

// Initialize the lifecycle management system
async function initializeLifecycleSystem() {
  // 1. Create memory manager
  const memoryManager = new SQLiteLifecycleMemoryManager(
    database,
    logger,
    config.memory
  );

  // 2. Create communication manager
  const messageRouter = new InMemoryMessageRouter(logger);
  const communicationManager = new DefaultLifecycleCommunicationManager(
    eventBus,
    messageRouter,
    logger,
    config.communication
  );

  // 3. Create lifecycle manager
  const lifecycleManager = new AgentLifecycleManager(
    memoryManager,
    communicationManager,
    logger,
    config
  );

  return lifecycleManager;
}

// Example: Create and manage an agent lifecycle
async function agentLifecycleExample() {
  const lifecycleManager = await initializeLifecycleSystem();

  // Define an agent
  const agentDefinition: AgentDefinition = {
    name: 'example-coder',
    type: 'coder',
    description: 'TypeScript code generation agent',
    capabilities: ['typescript', 'testing', 'documentation'],
    priority: 'medium',
    hooks: {
      lifecycle: {
        init: 'setup-environment',
        start: 'validate-dependencies',
        stop: 'cleanup-resources'
      }
    },
    lifecycle: {
      state_management: true,
      persistent_memory: true,
      max_retries: 3,
      timeout_ms: 30000,
      auto_cleanup: true
    }
  };

  // Create agent lifecycle record
  const agentRecord = await lifecycleManager.createAgent(agentDefinition);
  console.log(`Agent created: ${agentRecord.agentId}`);

  // Subscribe to agent events
  await lifecycleManager.subscribeToAgent(agentRecord.agentId, (event) => {
    console.log(`Agent ${event.agentId}: ${event.data.previousState} -> ${event.data.currentState}`);
  });

  // Transition agent through states
  await lifecycleManager.transitionState(
    agentRecord.agentId,
    AgentLifecycleTrigger.TASK_ASSIGNED,
    { taskId: 'task-123', description: 'Generate user authentication module' }
  );

  // Monitor agent performance
  const metrics = await lifecycleManager.getMetrics(agentRecord.agentId);
  console.log('Agent metrics:', metrics);
}
```

## State Machine Integration

### Custom State Transitions

```typescript
// Define custom state transition with hooks and conditions
const customTransition: AgentStateTransition = {
  fromState: AgentLifecycleState.READY,
  toState: AgentLifecycleState.ACTIVE,
  trigger: AgentLifecycleTrigger.TASK_ASSIGNED,
  conditions: [
    {
      name: 'resource-availability',
      type: 'resource',
      expression: 'memory.available > 100MB',
      parameters: { minMemory: 104857600 }
    },
    {
      name: 'dependency-check',
      type: 'custom',
      expression: 'dependencies.satisfied === true'
    }
  ],
  actions: [
    {
      name: 'allocate-resources',
      type: 'resource-allocation',
      parameters: { memory: '200MB', cpu: '50%' }
    },
    {
      name: 'notify-coordinators',
      type: 'notification',
      parameters: { message: 'Agent becoming active' }
    }
  ],
  hooks: ['pre-execution', 'resource-allocation'],
  timeout: 30000,
  retryPolicy: {
    maxAttempts: 3,
    backoffStrategy: 'exponential',
    baseDelay: 1000,
    maxDelay: 10000
  }
};

// Register custom transition
lifecycleManager.registerStateTransition(customTransition);
```

### State Machine Validation

```typescript
class AgentStateMachineValidator {
  validateTransition(
    currentState: AgentLifecycleState,
    trigger: AgentLifecycleTrigger,
    targetState: AgentLifecycleState
  ): ValidationResult {
    const allowedTransitions = AGENT_LIFECYCLE_STATE_MACHINE[currentState];

    const validTransition = allowedTransitions.find(
      t => t.trigger === trigger && t.toState === targetState
    );

    if (!validTransition) {
      return {
        valid: false,
        error: `Invalid transition: ${currentState} -> ${targetState} via ${trigger}`
      };
    }

    return { valid: true, transition: validTransition };
  }

  async validateConditions(
    conditions: StateTransitionCondition[],
    context: LifecycleHookContext
  ): Promise<boolean> {
    for (const condition of conditions) {
      const result = await this.evaluateCondition(condition, context);
      if (!result) {
        this.logger.warn(`Condition failed: ${condition.name}`);
        return false;
      }
    }
    return true;
  }

  private async evaluateCondition(
    condition: StateTransitionCondition,
    context: LifecycleHookContext
  ): Promise<boolean> {
    switch (condition.type) {
      case 'resource':
        return this.checkResourceCondition(condition, context);
      case 'time':
        return this.checkTimeCondition(condition, context);
      case 'dependency':
        return this.checkDependencyCondition(condition, context);
      case 'custom':
        return this.evaluateCustomCondition(condition, context);
      default:
        return false;
    }
  }
}
```

## Hook System Implementation

### Custom Lifecycle Hooks

```typescript
// Example: Resource monitoring hook
const resourceMonitoringHook: LifecycleHook = {
  name: 'resource-monitoring',
  type: LifecycleHookType.PERFORMANCE_MONITOR,
  priority: 100,
  async: true,
  timeout: 5000,
  conditions: [
    {
      name: 'monitoring-enabled',
      expression: 'config.monitoring.enabled === true'
    }
  ],
  handler: async (context: LifecycleHookContext): Promise<LifecycleHookResult> => {
    const startTime = Date.now();

    try {
      // Collect resource metrics
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Store metrics
      const metrics: LifecycleMetrics = {
        agentId: context.agentId,
        timestamp: new Date(),
        state: context.currentState,
        stateEnterTime: context.timestamp,
        stateDuration: Date.now() - context.timestamp.getTime(),
        metrics: {
          memoryUsage: memoryUsage.heapUsed,
          cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
          taskCount: 0, // Would be retrieved from agent
          messageCount: 0,
          errorCount: 0
        }
      };

      await context.memory.storeMetrics(metrics);

      // Check for resource warnings
      const warnings = [];
      if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
        warnings.push('High memory usage detected');
      }

      return {
        success: true,
        data: { metrics, warnings },
        duration: Date.now() - startTime,
        metadata: { hookType: 'resource-monitoring' }
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        duration: Date.now() - startTime
      };
    }
  },
  errorHandler: async (error: Error, context: LifecycleHookContext) => {
    context.logger.error(`Resource monitoring hook failed for agent ${context.agentId}`, error);

    // Publish error event
    await context.communication.publishEvent({
      id: `error_${Date.now()}`,
      type: LifecycleEventType.ERROR_OCCURRED,
      agentId: context.agentId,
      timestamp: new Date(),
      data: {
        currentState: context.currentState,
        error: {
          message: error.message,
          code: 'HOOK_EXECUTION_FAILED',
          stack: error.stack
        }
      },
      source: 'resource-monitoring-hook',
      priority: 'high'
    });
  },
  enabled: true
};

// Register the hook
lifecycleManager.registerHook(resourceMonitoringHook);
```

### Hook Execution Pipeline

```typescript
class LifecycleHookExecutor {
  private hooks: Map<LifecycleHookType, LifecycleHook[]> = new Map();
  private executionHistory: HookExecution[] = [];
  private logger: ILogger;

  async executeHooks(
    type: LifecycleHookType,
    context: LifecycleHookContext
  ): Promise<LifecycleHookResult[]> {
    const hooks = this.getHooksForType(type);
    const results: LifecycleHookResult[] = [];

    // Sort hooks by priority
    const sortedHooks = hooks.sort((a, b) => a.priority - b.priority);

    for (const hook of sortedHooks) {
      if (!hook.enabled) continue;

      // Check conditions
      const conditionsMet = await this.checkConditions(hook.conditions || [], context);
      if (!conditionsMet) continue;

      // Execute hook with timeout and retry
      const result = await this.executeHookWithRetry(hook, context);
      results.push(result);

      // Record execution history
      this.recordExecution(hook, context, result);

      // Handle result
      if (!result.success && hook.errorHandler) {
        await hook.errorHandler(result.error!, context);
      }

      // Check if we should skip subsequent hooks
      if (result.skipSubsequentHooks) {
        this.logger.info(`Skipping subsequent hooks after ${hook.name}`);
        break;
      }

      // Handle state override
      if (result.stateOverride) {
        context.targetState = result.stateOverride;
      }
    }

    return results;
  }

  private async executeHookWithRetry(
    hook: LifecycleHook,
    context: LifecycleHookContext
  ): Promise<LifecycleHookResult> {
    const retryPolicy = hook.retryPolicy || {
      maxAttempts: 1,
      backoffStrategy: 'fixed',
      baseDelay: 1000,
      maxDelay: 5000
    };

    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
      try {
        const result = await this.executeHookWithTimeout(hook, context);
        if (result.success || attempt === retryPolicy.maxAttempts) {
          return result;
        }
      } catch (error) {
        if (attempt === retryPolicy.maxAttempts) {
          return {
            success: false,
            error: error as Error,
            duration: 0,
            metadata: { attempts: attempt }
          };
        }

        // Calculate delay for next attempt
        const delay = this.calculateRetryDelay(retryPolicy, attempt);
        await this.delay(delay);
      }
    }

    throw new Error('Unexpected end of retry loop');
  }

  private async executeHookWithTimeout(
    hook: LifecycleHook,
    context: LifecycleHookContext
  ): Promise<LifecycleHookResult> {
    const startTime = Date.now();

    const timeoutPromise = new Promise<LifecycleHookResult>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Hook ${hook.name} timed out after ${hook.timeout}ms`));
      }, hook.timeout);
    });

    const executionPromise = hook.handler(context);

    try {
      const result = await Promise.race([executionPromise, timeoutPromise]);
      result.duration = Date.now() - startTime;
      return result;
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        duration: Date.now() - startTime
      };
    }
  }
}
```

## Memory Management Examples

### Querying Lifecycle Data

```typescript
class LifecycleQueryService {
  constructor(private memoryManager: LifecycleMemoryManager) {}

  // Get agent state history with filtering
  async getAgentStateHistory(
    agentId: string,
    filter?: {
      startDate?: Date;
      endDate?: Date;
      states?: AgentLifecycleState[];
      successOnly?: boolean;
    }
  ): Promise<AgentStateHistoryEntry[]> {
    const record = await this.memoryManager.getLifecycleRecord(agentId);
    if (!record) return [];

    let history = record.stateHistory;

    if (filter) {
      history = history.filter(entry => {
        if (filter.startDate && entry.timestamp < filter.startDate) return false;
        if (filter.endDate && entry.timestamp > filter.endDate) return false;
        if (filter.states && !filter.states.includes(entry.toState)) return false;
        if (filter.successOnly && !entry.success) return false;
        return true;
      });
    }

    return history;
  }

  // Get performance trends
  async getPerformanceTrends(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<PerformanceTrend> {
    const metrics = await this.memoryManager.queryMetrics(agentId, timeRange);

    const trend: PerformanceTrend = {
      agentId,
      timeRange,
      dataPoints: metrics.length,
      averageMemoryUsage: 0,
      averageCpuUsage: 0,
      stateDistribution: {},
      errorRate: 0
    };

    if (metrics.length === 0) return trend;

    // Calculate averages
    trend.averageMemoryUsage = metrics.reduce((sum, m) => sum + m.metrics.memoryUsage, 0) / metrics.length;
    trend.averageCpuUsage = metrics.reduce((sum, m) => sum + m.metrics.cpuUsage, 0) / metrics.length;

    // Calculate state distribution
    const stateCount: Record<string, number> = {};
    metrics.forEach(m => {
      stateCount[m.state] = (stateCount[m.state] || 0) + 1;
    });

    for (const [state, count] of Object.entries(stateCount)) {
      trend.stateDistribution[state] = count / metrics.length;
    }

    // Calculate error rate
    const totalErrors = metrics.reduce((sum, m) => sum + m.metrics.errorCount, 0);
    trend.errorRate = totalErrors / metrics.length;

    return trend;
  }

  // Get agent health score
  async getAgentHealthScore(agentId: string): Promise<HealthScore> {
    const record = await this.memoryManager.getLifecycleRecord(agentId);
    if (!record) throw new Error(`Agent ${agentId} not found`);

    const now = new Date();
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
    const recentMetrics = await this.memoryManager.queryMetrics(agentId, {
      start: lastHour,
      end: now
    });

    const score: HealthScore = {
      agentId,
      timestamp: now,
      overallScore: 0,
      components: {
        uptime: this.calculateUptimeScore(record),
        performance: this.calculatePerformanceScore(recentMetrics),
        errors: this.calculateErrorScore(record, recentMetrics),
        resources: this.calculateResourceScore(recentMetrics)
      }
    };

    // Calculate overall score as weighted average
    const weights = { uptime: 0.3, performance: 0.3, errors: 0.2, resources: 0.2 };
    score.overallScore = Object.entries(score.components).reduce(
      (sum, [component, componentScore]) => sum + componentScore * weights[component as keyof typeof weights],
      0
    );

    return score;
  }
}

interface PerformanceTrend {
  agentId: string;
  timeRange: { start: Date; end: Date };
  dataPoints: number;
  averageMemoryUsage: number;
  averageCpuUsage: number;
  stateDistribution: Record<string, number>;
  errorRate: number;
}

interface HealthScore {
  agentId: string;
  timestamp: Date;
  overallScore: number;
  components: {
    uptime: number;
    performance: number;
    errors: number;
    resources: number;
  };
}
```

## Communication Patterns

### Event-Driven Coordination

```typescript
// Agent coordination using lifecycle events
class AgentCoordinator {
  private communicationManager: LifecycleCommunicationManager;
  private activeAgents: Map<string, AgentCoordinationInfo> = new Map();

  constructor(communicationManager: LifecycleCommunicationManager) {
    this.communicationManager = communicationManager;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle agent state changes
    this.communicationManager.subscribeToEvents(
      { type: LifecycleEventType.STATE_CHANGED },
      async (event) => {
        await this.handleAgentStateChange(event);
      }
    );

    // Handle agent errors
    this.communicationManager.subscribeToEvents(
      { type: LifecycleEventType.ERROR_OCCURRED },
      async (event) => {
        await this.handleAgentError(event);
      }
    );

    // Handle resource events
    this.communicationManager.subscribeToEvents(
      { type: LifecycleEventType.RESOURCE_ALLOCATED },
      async (event) => {
        await this.handleResourceAllocation(event);
      }
    );
  }

  private async handleAgentStateChange(event: LifecycleEvent): Promise<void> {
    const agentInfo = this.activeAgents.get(event.agentId);

    if (event.data.currentState === AgentLifecycleState.ACTIVE) {
      // Agent became active, update load balancing
      await this.updateLoadBalancing(event.agentId, 'add');

      // Notify other agents in the same swarm
      await this.notifySwarmMembers(event.agentId, 'agent_active');
    } else if (event.data.currentState === AgentLifecycleState.TERMINATED) {
      // Agent terminated, redistribute its tasks
      await this.redistributeTasks(event.agentId);

      // Update load balancing
      await this.updateLoadBalancing(event.agentId, 'remove');

      // Clean up from tracking
      this.activeAgents.delete(event.agentId);
    }
  }

  private async handleAgentError(event: LifecycleEvent): Promise<void> {
    if (event.priority === 'critical') {
      // Critical error - initiate failover
      await this.initiateFailover(event.agentId);
    } else {
      // Non-critical error - increment error count
      const agentInfo = this.activeAgents.get(event.agentId);
      if (agentInfo) {
        agentInfo.errorCount++;

        // If error count exceeds threshold, mark for replacement
        if (agentInfo.errorCount > 5) {
          await this.scheduleAgentReplacement(event.agentId);
        }
      }
    }
  }

  private async redistributeTasks(failedAgentId: string): Promise<void> {
    // Get tasks assigned to failed agent
    const assignedTasks = await this.getAssignedTasks(failedAgentId);

    // Find suitable replacement agents
    const availableAgents = Array.from(this.activeAgents.values())
      .filter(agent => agent.state === AgentLifecycleState.READY || agent.state === AgentLifecycleState.IDLE)
      .sort((a, b) => a.taskCount - b.taskCount); // Sort by load

    // Redistribute tasks
    for (const task of assignedTasks) {
      const targetAgent = availableAgents[0]; // Get least loaded agent
      if (targetAgent) {
        await this.assignTaskToAgent(task.id, targetAgent.agentId);
        targetAgent.taskCount++;
      } else {
        // No available agents, queue task for later
        await this.queueTaskForLater(task);
      }
    }
  }
}

interface AgentCoordinationInfo {
  agentId: string;
  state: AgentLifecycleState;
  taskCount: number;
  errorCount: number;
  lastSeen: Date;
  capabilities: string[];
  swarmId?: string;
}
```

### Message Broadcasting

```typescript
// Broadcast system status updates
class SystemStatusBroadcaster {
  private communicationManager: LifecycleCommunicationManager;
  private statusUpdateInterval: NodeJS.Timeout;

  constructor(communicationManager: LifecycleCommunicationManager) {
    this.communicationManager = communicationManager;
    this.startStatusUpdates();
  }

  private startStatusUpdates(): void {
    this.statusUpdateInterval = setInterval(async () => {
      await this.broadcastSystemStatus();
    }, 30000); // Every 30 seconds
  }

  private async broadcastSystemStatus(): Promise<void> {
    const systemStatus = await this.collectSystemStatus();

    const statusEvent: LifecycleEvent = {
      id: `status_${Date.now()}`,
      type: LifecycleEventType.METRICS_UPDATED,
      agentId: 'system',
      timestamp: new Date(),
      data: {
        currentState: AgentLifecycleState.ACTIVE,
        metrics: systemStatus
      },
      source: 'system-status-broadcaster',
      priority: 'low'
    };

    // Broadcast to all coordinators
    await this.communicationManager.broadcastToCoordinators(statusEvent);

    // Broadcast to monitoring systems
    await this.communicationManager.publishEvent(statusEvent);
  }

  private async collectSystemStatus(): Promise<any> {
    return {
      timestamp: new Date(),
      activeAgents: await this.getActiveAgentCount(),
      totalTasks: await this.getTotalTaskCount(),
      systemLoad: process.loadavg(),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }
}
```

## Error Handling and Recovery

### Comprehensive Error Recovery

```typescript
class AgentErrorRecoveryService {
  private recoveryStrategies: ErrorRecoveryStrategy[] = [];
  private recoveryHistory: Map<string, RecoveryAttempt[]> = new Map();

  constructor() {
    this.initializeRecoveryStrategies();
  }

  private initializeRecoveryStrategies(): void {
    this.recoveryStrategies = [
      new TimeoutRecoveryStrategy(),
      new MemoryExhaustionRecoveryStrategy(),
      new NetworkFailureRecoveryStrategy(),
      new DependencyFailureRecoveryStrategy(),
      new GenericErrorRecoveryStrategy()
    ];
  }

  async recoverFromError(
    error: Error,
    context: LifecycleHookContext
  ): Promise<RecoveryResult> {
    const recoveryAttempts = this.recoveryHistory.get(context.agentId) || [];

    // Check if we've exceeded max recovery attempts
    if (recoveryAttempts.length >= 5) {
      return {
        success: false,
        escalate: true,
        message: 'Maximum recovery attempts exceeded'
      };
    }

    // Find applicable recovery strategy
    for (const strategy of this.recoveryStrategies) {
      if (strategy.canHandle(error, context)) {
        const attempt: RecoveryAttempt = {
          strategyName: strategy.name,
          timestamp: new Date(),
          error: error.message
        };

        try {
          const result = await strategy.recover(error, context);
          attempt.success = result.success;
          attempt.result = result;

          // Record attempt
          recoveryAttempts.push(attempt);
          this.recoveryHistory.set(context.agentId, recoveryAttempts);

          if (result.success) {
            // Validate recovery if strategy supports it
            if (strategy.validateRecovery) {
              const isValid = await strategy.validateRecovery(result, context);
              if (!isValid) {
                result.success = false;
                result.message = 'Recovery validation failed';
              }
            }
          }

          return result;
        } catch (recoveryError) {
          attempt.success = false;
          attempt.recoveryError = recoveryError.message;
          recoveryAttempts.push(attempt);

          continue; // Try next strategy
        }
      }
    }

    return {
      success: false,
      message: 'No applicable recovery strategy found'
    };
  }
}

class TimeoutRecoveryStrategy implements ErrorRecoveryStrategy {
  name = 'timeout-recovery';
  priority = 100;

  canHandle(error: Error): boolean {
    return error.name === 'TimeoutError' || error.message.includes('timeout');
  }

  async recover(error: Error, context: LifecycleHookContext): Promise<RecoveryResult> {
    // Increase timeout and retry
    const currentTimeout = context.metadata.timeout as number || 30000;
    const newTimeout = Math.min(currentTimeout * 2, 300000); // Max 5 minutes

    return {
      success: true,
      actions: ['increase-timeout', 'retry-operation'],
      metadata: {
        oldTimeout: currentTimeout,
        newTimeout: newTimeout
      },
      retryAfter: 1000,
      message: `Increased timeout from ${currentTimeout}ms to ${newTimeout}ms`
    };
  }

  async validateRecovery(result: RecoveryResult, context: LifecycleHookContext): Promise<boolean> {
    // Check if the agent is responsive after timeout increase
    try {
      const healthCheck = await this.performHealthCheck(context.agentId);
      return healthCheck.responsive;
    } catch {
      return false;
    }
  }

  private async performHealthCheck(agentId: string): Promise<{ responsive: boolean }> {
    // Implementation would check agent responsiveness
    return { responsive: true };
  }
}

interface RecoveryAttempt {
  strategyName: string;
  timestamp: Date;
  error: string;
  success?: boolean;
  result?: RecoveryResult;
  recoveryError?: string;
}
```

## Integration with Existing Systems

### Backward Compatibility Layer

```typescript
// Adapter for existing claude-flow agents
class LegacyAgentLifecycleAdapter {
  private lifecycleManager: AgentLifecycleManager;
  private legacyAgentMap: Map<string, string> = new Map(); // legacy ID -> lifecycle ID

  constructor(lifecycleManager: AgentLifecycleManager) {
    this.lifecycleManager = lifecycleManager;
  }

  // Wrap existing agent spawn function
  async spawnAgent(legacyAgentConfig: any): Promise<string> {
    // Convert legacy config to new format
    const agentDefinition: AgentDefinition = this.convertLegacyConfig(legacyAgentConfig);

    // Create lifecycle record
    const lifecycleRecord = await this.lifecycleManager.createAgent(agentDefinition);

    // Map legacy ID to lifecycle ID
    this.legacyAgentMap.set(legacyAgentConfig.id, lifecycleRecord.agentId);

    // Set up legacy event forwarding
    await this.setupLegacyEventForwarding(legacyAgentConfig.id, lifecycleRecord.agentId);

    return legacyAgentConfig.id; // Return legacy ID for compatibility
  }

  // Handle legacy status updates
  async updateAgentStatus(legacyId: string, status: string): Promise<void> {
    const lifecycleId = this.legacyAgentMap.get(legacyId);
    if (!lifecycleId) return;

    // Map legacy status to lifecycle trigger
    const trigger = this.mapLegacyStatusToTrigger(status);
    if (trigger) {
      await this.lifecycleManager.transitionState(lifecycleId, trigger);
    }
  }

  // Convert legacy agent configuration
  private convertLegacyConfig(legacyConfig: any): AgentDefinition {
    return {
      name: legacyConfig.name || legacyConfig.id,
      type: legacyConfig.type || 'custom',
      description: legacyConfig.description || `Legacy agent ${legacyConfig.id}`,
      capabilities: legacyConfig.capabilities || [],
      priority: this.mapLegacyPriority(legacyConfig.priority),
      hooks: this.convertLegacyHooks(legacyConfig.hooks),
      lifecycle: {
        state_management: true,
        persistent_memory: false,
        max_retries: 3,
        timeout_ms: 60000,
        auto_cleanup: true
      }
    };
  }

  private mapLegacyStatusToTrigger(status: string): AgentLifecycleTrigger | null {
    const statusMap: Record<string, AgentLifecycleTrigger> = {
      'spawned': AgentLifecycleTrigger.SPAWN_REQUEST,
      'running': AgentLifecycleTrigger.TASK_ASSIGNED,
      'idle': AgentLifecycleTrigger.TASK_COMPLETED,
      'terminated': AgentLifecycleTrigger.SHUTDOWN_REQUEST,
      'error': AgentLifecycleTrigger.INTERNAL_ERROR
    };

    return statusMap[status] || null;
  }

  private async setupLegacyEventForwarding(
    legacyId: string,
    lifecycleId: string
  ): Promise<void> {
    // Subscribe to lifecycle events and forward to legacy systems
    await this.lifecycleManager.subscribeToAgent(lifecycleId, (event) => {
      this.forwardToLegacySystem(legacyId, event);
    });
  }

  private forwardToLegacySystem(legacyId: string, event: LifecycleEvent): void {
    // Convert lifecycle event to legacy format and forward
    const legacyEvent = {
      agentId: legacyId,
      status: this.mapLifecycleStateToLegacyStatus(event.data.currentState!),
      timestamp: event.timestamp,
      data: event.data
    };

    // Forward to legacy event system
    this.emitLegacyEvent(legacyEvent);
  }

  private mapLifecycleStateToLegacyStatus(state: AgentLifecycleState): string {
    const stateMap: Record<AgentLifecycleState, string> = {
      [AgentLifecycleState.READY]: 'spawned',
      [AgentLifecycleState.ACTIVE]: 'running',
      [AgentLifecycleState.IDLE]: 'idle',
      [AgentLifecycleState.TERMINATED]: 'terminated',
      [AgentLifecycleState.ERROR]: 'error',
      [AgentLifecycleState.FAILED]: 'error'
    } as any;

    return stateMap[state] || 'unknown';
  }

  private emitLegacyEvent(event: any): void {
    // Implementation would emit to legacy event system
    console.log('Legacy event:', event);
  }
}
```

## Performance Optimizations

### Efficient State Tracking

```typescript
class OptimizedStateTracker {
  private stateCache: Map<string, CachedStateInfo> = new Map();
  private batchUpdateTimer: NodeJS.Timeout;
  private pendingUpdates: StateUpdate[] = [];

  constructor(private memoryManager: LifecycleMemoryManager) {
    this.setupBatchUpdates();
  }

  // Cache frequently accessed state information
  async getAgentState(agentId: string): Promise<AgentLifecycleState> {
    const cached = this.stateCache.get(agentId);

    if (cached && Date.now() - cached.timestamp < 30000) { // 30-second cache
      return cached.state;
    }

    const record = await this.memoryManager.getLifecycleRecord(agentId);
    if (record) {
      this.stateCache.set(agentId, {
        state: record.currentState,
        timestamp: Date.now()
      });
      return record.currentState;
    }

    throw new Error(`Agent ${agentId} not found`);
  }

  // Batch state updates for efficiency
  queueStateUpdate(update: StateUpdate): void {
    this.pendingUpdates.push(update);
    this.invalidateCache(update.agentId);
  }

  private setupBatchUpdates(): void {
    this.batchUpdateTimer = setInterval(async () => {
      if (this.pendingUpdates.length > 0) {
        await this.processBatchUpdates();
      }
    }, 1000); // Process batch every second
  }

  private async processBatchUpdates(): Promise<void> {
    const updates = this.pendingUpdates.splice(0);

    // Group updates by agent
    const updatesByAgent = new Map<string, StateUpdate[]>();
    for (const update of updates) {
      const agentUpdates = updatesByAgent.get(update.agentId) || [];
      agentUpdates.push(update);
      updatesByAgent.set(update.agentId, agentUpdates);
    }

    // Process each agent's updates
    for (const [agentId, agentUpdates] of updatesByAgent) {
      try {
        // Only apply the latest update for each agent
        const latestUpdate = agentUpdates[agentUpdates.length - 1];
        await this.memoryManager.updateState(
          agentId,
          latestUpdate.newState,
          latestUpdate.transition
        );
      } catch (error) {
        console.error(`Failed to apply batch update for agent ${agentId}:`, error);
      }
    }
  }

  private invalidateCache(agentId: string): void {
    this.stateCache.delete(agentId);
  }
}

interface CachedStateInfo {
  state: AgentLifecycleState;
  timestamp: number;
}

interface StateUpdate {
  agentId: string;
  newState: AgentLifecycleState;
  transition: AgentStateHistoryEntry;
}
```

## Monitoring and Observability

### Comprehensive Metrics Dashboard

```typescript
class LifecycleMetricsDashboard {
  constructor(
    private memoryManager: LifecycleMemoryManager,
    private communicationManager: LifecycleCommunicationManager
  ) {}

  async generateSystemReport(): Promise<SystemReport> {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const report: SystemReport = {
      generatedAt: now,
      timeRange: { start: last24Hours, end: now },
      agentStatistics: await this.getAgentStatistics(),
      stateTransitionMetrics: await this.getStateTransitionMetrics(last24Hours, now),
      performanceMetrics: await this.getPerformanceMetrics(last24Hours, now),
      errorAnalysis: await this.getErrorAnalysis(last24Hours, now),
      resourceUtilization: await this.getResourceUtilization(last24Hours, now),
      recommendations: []
    };

    // Generate recommendations based on metrics
    report.recommendations = this.generateRecommendations(report);

    return report;
  }

  private async getAgentStatistics(): Promise<AgentStatistics> {
    // Implementation would query all agent records
    return {
      totalAgents: 0,
      activeAgents: 0,
      idleAgents: 0,
      errorAgents: 0,
      agentsByType: {},
      averageUptime: 0
    };
  }

  private generateRecommendations(report: SystemReport): string[] {
    const recommendations: string[] = [];

    // Analyze error rate
    if (report.errorAnalysis.errorRate > 0.1) { // 10% error rate
      recommendations.push('High error rate detected. Consider reviewing agent configurations and implementing additional error handling.');
    }

    // Analyze resource utilization
    if (report.resourceUtilization.averageMemoryUsage > 0.8) { // 80% memory usage
      recommendations.push('High memory usage detected. Consider implementing memory optimization strategies or increasing available resources.');
    }

    // Analyze state transition patterns
    const failedTransitions = report.stateTransitionMetrics.totalTransitions - report.stateTransitionMetrics.successfulTransitions;
    if (failedTransitions > report.stateTransitionMetrics.totalTransitions * 0.05) { // 5% failure rate
      recommendations.push('High state transition failure rate. Review transition conditions and timeout configurations.');
    }

    return recommendations;
  }
}

interface SystemReport {
  generatedAt: Date;
  timeRange: { start: Date; end: Date };
  agentStatistics: AgentStatistics;
  stateTransitionMetrics: StateTransitionMetrics;
  performanceMetrics: PerformanceMetrics;
  errorAnalysis: ErrorAnalysis;
  resourceUtilization: ResourceUtilization;
  recommendations: string[];
}

interface AgentStatistics {
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  errorAgents: number;
  agentsByType: Record<string, number>;
  averageUptime: number;
}
```

This implementation guide provides comprehensive examples of how to use the Agent Lifecycle Management system in practice. It covers all major components including state machines, hooks, memory management, communication protocols, error recovery, and monitoring. The system is designed to be incrementally adoptable, backward compatible, and production-ready for enterprise deployments.