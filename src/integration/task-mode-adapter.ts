/**
 * Task Mode Adapter - In-Memory and Hybrid Coordination
 *
 * Provides task mode coordination that works with or without trigger.dev:
 * - In-memory event queuing when trigger.dev unavailable
 * - Hybrid mode using trigger.dev webhooks for event notifications
 * - Fallback to memory when API calls fail
 *
 * Configuration:
 * - TASK_MODE_USE_MEMORY: Force memory mode (default: auto-detect)
 * - TASK_MODE_TIMEOUT_MS: Default timeout for agent completion waits
 */

import { EventEmitter } from 'node:events';
import type {
  TaskModeSpawnRequest,
  TaskModeAgentResult,
  TaskModeEvent,
  AgentCompletePayload,
  GateResultPayload,
  ConsensusResultPayload,
  PODecisionPayload,
  AgentType,
} from '../types/trigger-dev-events.d.js';
import TriggerDevClient, { TriggerDevError } from './trigger-dev-client.js';

// TODO: RUNTIME_TEST: Verify EventEmitter imports work in Node.js environment

/**
 * Task mode coordination result
 */
export interface TaskModeCoordinationResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Pending agent completion waiter
 */
interface PendingCompletion {
  agentId: string;
  resolve: (result: TaskModeAgentResult) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

/**
 * Task mode event storage (FIFO queue)
 */
export class TaskModeEventQueue {
  private queue: TaskModeEvent[] = [];
  private eventEmitter: EventEmitter = new EventEmitter();

  /**
   * Enqueue event for later processing
   */
  enqueue(event: TaskModeEvent): void {
    this.queue.push(event);
    this.eventEmitter.emit('event-added', event);
  }

  /**
   * Dequeue next event (FIFO)
   */
  dequeue(): TaskModeEvent | undefined {
    return this.queue.shift();
  }

  /**
   * Get all events of specific type
   */
  getByType(type: TaskModeEvent['type']): TaskModeEvent[] {
    return this.queue.filter(e => e.type === type);
  }

  /**
   * Get all events for task
   */
  getByTaskId(taskId: string): TaskModeEvent[] {
    return this.queue.filter(e => e.taskId === taskId);
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Subscribe to new events
   */
  on(event: string, listener: Function): void {
    this.eventEmitter.on(event, listener as any);
  }

  /**
   * Unsubscribe from events
   */
  off(event: string, listener: Function): void {
    this.eventEmitter.off(event, listener as any);
  }
}

/**
 * TaskModeCoordinator - In-memory and hybrid coordination
 *
 * Provides task mode without Redis/external coordination:
 * - Spawns agents with in-memory tracking
 * - Waits for completion via event listeners
 * - Falls back to memory if trigger.dev unavailable
 * - Optionally uses trigger.dev for webhook notifications
 */
export class TaskModeCoordinator {
  private readonly config: {
    useMemory: boolean;
    defaultTimeoutMs: number;
    useTriggerDev: boolean;
  };

  private triggerDevClient?: TriggerDevClient;
  private eventQueue: TaskModeEventQueue = new TaskModeEventQueue();
  private pendingCompletions: Map<string, PendingCompletion> = new Map();

  constructor(options?: {
    useMemory?: boolean;
    defaultTimeoutMs?: number;
    triggerDevConfig?: any;
  }) {
    this.config = {
      useMemory:
        options?.useMemory !== undefined
          ? options.useMemory
          : (process.env.TASK_MODE_USE_MEMORY === 'true' || !process.env.TRIGGER_API_URL),
      defaultTimeoutMs: options?.defaultTimeoutMs || 30000,
      useTriggerDev: Boolean(process.env.TRIGGER_API_URL),
    };

    // Initialize trigger.dev client if configured
    if (this.config.useTriggerDev && !this.config.useMemory) {
      try {
        this.triggerDevClient = new TriggerDevClient(options?.triggerDevConfig);
      } catch (error) {
        // Fall back to memory mode if trigger.dev config fails
        console.warn('Trigger.dev initialization failed, using memory mode:', error);
        this.config.useMemory = true;
      }
    }
  }

  /**
   * Spawn agent and wait for completion
   *
   * TODO: RUNTIME_TEST: Verify agent spawning works in memory mode
   * TODO: RUNTIME_TEST: Test timeout behavior with slow agents
   *
   * @param agentType Type of agent to spawn
   * @param taskId Task ID
   * @param payload Agent configuration
   * @param timeoutMs Optional timeout override
   * @returns Promise resolving to agent result
   * @throws Error on spawn failure or timeout
   */
  async spawnAgent(
    agentType: AgentType,
    taskId: string,
    payload: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<TaskModeAgentResult> {
    const agentId = this.generateAgentId(agentType);
    const timeout = timeoutMs || this.config.defaultTimeoutMs;

    try {
      // If using trigger.dev, trigger the run
      if (this.triggerDevClient && !this.config.useMemory) {
        await this.triggerViaTriggerDev(agentType, taskId, payload);
      }

      // Wait for completion either via webhook or event queue
      const result = await this.waitForCompletion(agentId, timeout);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Agent spawn failed: ${String(error)}`);
    }
  }

  /**
   * Register agent completion event
   *
   * Used by webhook handlers to signal completion
   */
  registerAgentComplete(payload: AgentCompletePayload): TaskModeCoordinationResult {
    this.eventQueue.enqueue({
      type: 'agent-complete',
      taskId: payload.taskId,
      payload,
      timestamp: Date.now(),
    });

    // Resolve pending completion if waiting
    const pending = this.pendingCompletions.get(payload.agentId);
    if (pending) {
      clearTimeout(pending.timeoutHandle);
      pending.resolve({
        agentId: payload.agentId,
        agentType: payload.agentType,
        success: payload.status === 'success',
        output: payload.output,
        confidenceScore: payload.confidenceScore,
        executionTimeMs: payload.executionTimeMs,
      });
      this.pendingCompletions.delete(payload.agentId);
    }

    return {
      success: true,
      message: 'Agent completion registered',
      data: { agentId: payload.agentId },
    };
  }

  /**
   * Register gate result
   */
  registerGateResult(payload: GateResultPayload): TaskModeCoordinationResult {
    this.eventQueue.enqueue({
      type: 'gate-result',
      taskId: payload.taskId,
      payload,
      timestamp: Date.now(),
    });

    return {
      success: true,
      message: 'Gate result registered',
      data: { taskId: payload.taskId, passed: payload.passed },
    };
  }

  /**
   * Register consensus result
   */
  registerConsensusResult(payload: ConsensusResultPayload): TaskModeCoordinationResult {
    this.eventQueue.enqueue({
      type: 'consensus-result',
      taskId: payload.taskId,
      payload,
      timestamp: Date.now(),
    });

    return {
      success: true,
      message: 'Consensus result registered',
      data: {
        taskId: payload.taskId,
        consensusScore: payload.consensusScore,
      },
    };
  }

  /**
   * Register PO decision
   */
  registerPODecision(payload: PODecisionPayload): TaskModeCoordinationResult {
    this.eventQueue.enqueue({
      type: 'po-decision',
      taskId: payload.taskId,
      payload,
      timestamp: Date.now(),
    });

    return {
      success: true,
      message: 'PO decision registered',
      data: { taskId: payload.taskId, decision: payload.decision },
    };
  }

  /**
   * Get event queue (for testing and inspection)
   */
  getEventQueue(): TaskModeEventQueue {
    return this.eventQueue;
  }

  /**
   * Get all events for task
   */
  getTaskEvents(taskId: string): TaskModeEvent[] {
    return this.eventQueue.getByTaskId(taskId);
  }

  /**
   * Check if using memory mode
   */
  isMemoryMode(): boolean {
    return this.config.useMemory;
  }

  /**
   * Internal: Trigger agent run via trigger.dev
   *
   * @private
   */
  private async triggerViaTriggerDev(
    agentType: AgentType,
    taskId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.triggerDevClient) {
      return;
    }

    try {
      // TODO: RUNTIME_TEST: Verify trigger.dev API call succeeds
      await this.triggerDevClient.triggerCFNLoop({
        taskId,
        description: `Task mode agent: ${agentType}`,
        mode: 'standard',
        successCriteria: {
          gate: 'test-pass-rate >= 0.95',
          consensusThreshold: 0.9,
          testPassRateThreshold: 0.95,
        },
        context: {
          agentType,
          payload,
        },
      });
    } catch (error) {
      // Fall back to memory mode if trigger.dev fails
      console.warn('Trigger.dev trigger failed, continuing in memory mode:', error);
    }
  }

  /**
   * Internal: Wait for agent completion
   *
   * @private
   */
  private waitForCompletion(agentId: string, timeoutMs: number): Promise<TaskModeAgentResult> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingCompletions.delete(agentId);
        reject(new Error(`Agent ${agentId} did not complete within ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingCompletions.set(agentId, {
        agentId,
        resolve,
        reject,
        timeoutHandle,
      });
    });
  }

  /**
   * Internal: Generate unique agent ID
   *
   * @private
   */
  private generateAgentId(agentType: AgentType): string {
    return `${agentType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create task mode coordinator singleton
 */
let coordinatorInstance: TaskModeCoordinator | null = null;

export const createTaskModeCoordinator = (options?: {
  useMemory?: boolean;
  defaultTimeoutMs?: number;
  triggerDevConfig?: any;
}): TaskModeCoordinator => {
  if (!coordinatorInstance) {
    coordinatorInstance = new TaskModeCoordinator(options);
  }
  return coordinatorInstance;
};

/**
 * Get existing coordinator instance or create new one
 */
export const getTaskModeCoordinator = (): TaskModeCoordinator => {
  if (!coordinatorInstance) {
    coordinatorInstance = new TaskModeCoordinator();
  }
  return coordinatorInstance;
};

export default TaskModeCoordinator;
