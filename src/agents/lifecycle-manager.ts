/**
 * Agent Lifecycle State Management
 * Handles agent state transitions, memory persistence, and lifecycle hooks
 */

import { AgentDefinition } from './agent-loader.js';

export type AgentLifecycleState =
  | 'uninitialized'
  | 'initializing'
  | 'idle'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'cleanup';

export interface AgentLifecycleContext {
  agentId: string;
  agentDefinition: AgentDefinition;
  state: AgentLifecycleState;
  previousState?: AgentLifecycleState;
  startTime?: Date;
  lastActivity?: Date;
  taskId?: string;
  memory?: Map<string, any>;
  retryCount: number;
  maxRetries: number;
  errorHistory: string[];
  stateHistory: Array<{
    state: AgentLifecycleState;
    timestamp: Date;
    reason?: string;
  }>;
}

export interface LifecycleHookResult {
  success: boolean;
  message?: string;
  error?: Error;
  data?: any;
}

class AgentLifecycleManager {
  private agents: Map<string, AgentLifecycleContext> = new Map();
  private hooks: Map<string, Function> = new Map();
  private memoryStorage: Map<string, Map<string, any>> = new Map();

  /**
   * Initialize a new agent lifecycle context
   */
  async initializeAgent(
    agentId: string,
    agentDefinition: AgentDefinition,
    taskId?: string
  ): Promise<AgentLifecycleContext> {
    const context: AgentLifecycleContext = {
      agentId,
      agentDefinition,
      state: 'uninitialized',
      startTime: new Date(),
      lastActivity: new Date(),
      taskId,
      memory: new Map(),
      retryCount: 0,
      maxRetries: agentDefinition.lifecycle?.max_retries ?? 3,
      errorHistory: [],
      stateHistory: [{
        state: 'uninitialized',
        timestamp: new Date(),
        reason: 'Agent initialization'
      }]
    };

    this.agents.set(agentId, context);

    // Load persistent memory if enabled
    if (agentDefinition.lifecycle?.persistent_memory) {
      await this.loadPersistentMemory(agentId);
    }

    // Execute initialization hook
    await this.executeLifecycleHook(agentId, 'init');

    return context;
  }

  /**
   * Transition agent to a new state
   */
  async transitionState(
    agentId: string,
    newState: AgentLifecycleState,
    reason?: string
  ): Promise<boolean> {
    const context = this.agents.get(agentId);
    if (!context) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const validTransitions = this.getValidTransitions(context.state);
    if (!validTransitions.includes(newState)) {
      throw new Error(
        `Invalid state transition from ${context.state} to ${newState}`
      );
    }

    const previousState = context.state;
    context.previousState = previousState;
    context.state = newState;
    context.lastActivity = new Date();

    // Add to state history
    context.stateHistory.push({
      state: newState,
      timestamp: new Date(),
      reason
    });

    // Execute lifecycle hook for the new state
    const hookName = this.getHookNameForState(newState);
    if (hookName) {
      const hookResult = await this.executeLifecycleHook(agentId, hookName);
      if (!hookResult.success && newState !== 'error') {
        // If hook fails, transition to error state
        await this.transitionState(agentId, 'error', `Hook ${hookName} failed: ${hookResult.error?.message}`);
        return false;
      }
    }

    // Save state if persistent memory is enabled
    if (context.agentDefinition.lifecycle?.persistent_memory) {
      await this.savePersistentMemory(agentId);
    }

    return true;
  }

  /**
   * Execute a lifecycle hook
   */
  private async executeLifecycleHook(
    agentId: string,
    hookName: string
  ): Promise<LifecycleHookResult> {
    const context = this.agents.get(agentId);
    if (!context) {
      return { success: false, error: new Error(`Agent ${agentId} not found`) };
    }

    try {
      const hooks = context.agentDefinition.hooks;
      let hookScript: string | undefined;

      // Check for lifecycle-specific hooks first
      if (hooks?.lifecycle && hookName in hooks.lifecycle) {
        hookScript = hooks.lifecycle[hookName as keyof typeof hooks.lifecycle];
      }
      // Fallback to general hooks
      else if (hooks && hookName in hooks) {
        hookScript = hooks[hookName as keyof typeof hooks];
      }

      if (!hookScript) {
        return { success: true, message: `No hook defined for ${hookName}` };
      }

      // Execute the hook script
      const result = await this.executeHookScript(agentId, hookScript, hookName);

      return {
        success: true,
        message: `Hook ${hookName} executed successfully`,
        data: result
      };
    } catch (error) {
      context.errorHistory.push(`Hook ${hookName} failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Execute hook script with proper environment setup
   */
  private async executeHookScript(
    agentId: string,
    script: string,
    hookName: string
  ): Promise<any> {
    const context = this.agents.get(agentId);
    if (!context) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Set up environment variables for the hook
    const env = {
      ...process.env,
      AGENT_ID: agentId,
      AGENT_NAME: context.agentDefinition.name,
      AGENT_STATE: context.state,
      TASK_ID: context.taskId || '',
      HOOK_NAME: hookName,
      SWARM_ID: process.env.SWARM_ID || agentId,
      LIFECYCLE_STATE: context.state
    };

    // Execute the hook (this would integrate with the existing hook system)
    // For now, we'll just log the hook execution
    console.log(`[${agentId}] Executing ${hookName} hook:`, script);

    // In a real implementation, this would execute the shell script
    // with proper sandboxing and error handling
    return { executed: true, hook: hookName, agent: agentId };
  }

  /**
   * Get valid state transitions for current state
   */
  private getValidTransitions(currentState: AgentLifecycleState): AgentLifecycleState[] {
    const transitions: Record<AgentLifecycleState, AgentLifecycleState[]> = {
      uninitialized: ['initializing', 'error'],
      initializing: ['idle', 'error'],
      idle: ['running', 'stopping', 'error'],
      running: ['idle', 'paused', 'stopping', 'error'],
      paused: ['running', 'stopping', 'error'],
      stopping: ['stopped', 'error'],
      stopped: ['cleanup', 'initializing', 'error'],
      error: ['cleanup', 'initializing', 'stopped'],
      cleanup: ['stopped']
    };

    return transitions[currentState] || [];
  }

  /**
   * Get hook name for state transition
   */
  private getHookNameForState(state: AgentLifecycleState): string | null {
    const stateHookMap: Record<AgentLifecycleState, string | null> = {
      uninitialized: null,
      initializing: 'init',
      idle: null,
      running: 'start',
      paused: 'pause',
      stopping: 'stop',
      stopped: 'stop',
      error: null,
      cleanup: 'cleanup'
    };

    return stateHookMap[state] || null;
  }

  /**
   * Handle task completion
   */
  async handleTaskComplete(
    agentId: string,
    taskResult: any,
    success: boolean = true
  ): Promise<LifecycleHookResult> {
    const context = this.agents.get(agentId);
    if (!context) {
      return { success: false, error: new Error(`Agent ${agentId} not found`) };
    }

    // Update context
    context.lastActivity = new Date();

    // Execute task completion hook
    const hookResult = await this.executeLifecycleHook(agentId, 'task_complete');

    // Transition to appropriate state
    if (success) {
      await this.transitionState(agentId, 'idle', 'Task completed successfully');
    } else {
      context.retryCount++;
      if (context.retryCount >= context.maxRetries) {
        await this.transitionState(agentId, 'error', 'Task failed after max retries');
      } else {
        await this.transitionState(agentId, 'idle', `Task failed, retry ${context.retryCount}/${context.maxRetries}`);
      }
    }

    return hookResult;
  }

  /**
   * Handle rerun request
   */
  async handleRerunRequest(
    agentId: string,
    reason?: string
  ): Promise<LifecycleHookResult> {
    const context = this.agents.get(agentId);
    if (!context) {
      return { success: false, error: new Error(`Agent ${agentId} not found`) };
    }

    // Reset retry count for explicit rerun requests
    context.retryCount = 0;

    // Execute rerun hook
    const hookResult = await this.executeLifecycleHook(agentId, 'on_rerun_request');

    // Transition back to running state
    await this.transitionState(agentId, 'running', reason || 'Explicit rerun request');

    return hookResult;
  }

  /**
   * Load persistent memory for agent
   */
  private async loadPersistentMemory(agentId: string): Promise<void> {
    const context = this.agents.get(agentId);
    if (!context) return;

    // Load from persistent storage (this would integrate with the memory system)
    const persistentMemory = this.memoryStorage.get(agentId);
    if (persistentMemory) {
      context.memory = new Map(persistentMemory);
    }
  }

  /**
   * Save persistent memory for agent
   */
  private async savePersistentMemory(agentId: string): Promise<void> {
    const context = this.agents.get(agentId);
    if (!context) return;

    // Save to persistent storage
    this.memoryStorage.set(agentId, new Map(context.memory));
  }

  /**
   * Cleanup agent and its resources
   */
  async cleanupAgent(agentId: string): Promise<boolean> {
    const context = this.agents.get(agentId);
    if (!context) return false;

    try {
      // Transition to cleanup state
      await this.transitionState(agentId, 'cleanup', 'Agent cleanup requested');

      // Execute cleanup hook
      await this.executeLifecycleHook(agentId, 'cleanup');

      // Save final state if persistent memory enabled
      if (context.agentDefinition.lifecycle?.persistent_memory) {
        await this.savePersistentMemory(agentId);
      }

      // Remove from active agents (unless persistent memory is enabled)
      if (!context.agentDefinition.lifecycle?.persistent_memory) {
        this.agents.delete(agentId);
        this.memoryStorage.delete(agentId);
      } else {
        // Just transition to stopped state
        await this.transitionState(agentId, 'stopped', 'Agent cleanup complete');
      }

      return true;
    } catch (error) {
      console.error(`Error cleaning up agent ${agentId}:`, error);
      return false;
    }
  }

  /**
   * Get agent lifecycle context
   */
  getAgentContext(agentId: string): AgentLifecycleContext | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all active agents
   */
  getAllAgents(): AgentLifecycleContext[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by state
   */
  getAgentsByState(state: AgentLifecycleState): AgentLifecycleContext[] {
    return Array.from(this.agents.values()).filter(agent => agent.state === state);
  }

  /**
   * Update agent memory
   */
  updateAgentMemory(agentId: string, key: string, value: any): boolean {
    const context = this.agents.get(agentId);
    if (!context) return false;

    context.memory?.set(key, value);
    context.lastActivity = new Date();

    // Auto-save if persistent memory is enabled
    if (context.agentDefinition.lifecycle?.persistent_memory) {
      this.savePersistentMemory(agentId);
    }

    return true;
  }

  /**
   * Get agent memory value
   */
  getAgentMemory(agentId: string, key: string): any {
    const context = this.agents.get(agentId);
    return context?.memory?.get(key);
  }

  /**
   * Check if agent supports lifecycle management
   */
  static supportsLifecycle(agentDefinition: AgentDefinition): boolean {
    return !!(
      agentDefinition.lifecycle?.state_management ||
      agentDefinition.hooks?.lifecycle ||
      agentDefinition.hooks?.task_complete ||
      agentDefinition.hooks?.on_rerun_request
    );
  }
}

// Singleton instance
export const lifecycleManager = new AgentLifecycleManager();

// Convenience functions
export const initializeAgent = (agentId: string, agentDefinition: AgentDefinition, taskId?: string) =>
  lifecycleManager.initializeAgent(agentId, agentDefinition, taskId);

export const transitionAgentState = (agentId: string, newState: AgentLifecycleState, reason?: string) =>
  lifecycleManager.transitionState(agentId, newState, reason);

export const handleTaskComplete = (agentId: string, taskResult: any, success?: boolean) =>
  lifecycleManager.handleTaskComplete(agentId, taskResult, success);

export const handleRerunRequest = (agentId: string, reason?: string) =>
  lifecycleManager.handleRerunRequest(agentId, reason);

export const cleanupAgent = (agentId: string) =>
  lifecycleManager.cleanupAgent(agentId);

export const getAgentContext = (agentId: string) =>
  lifecycleManager.getAgentContext(agentId);

export const updateAgentMemory = (agentId: string, key: string, value: any) =>
  lifecycleManager.updateAgentMemory(agentId, key, value);

export const getAgentMemory = (agentId: string, key: string) =>
  lifecycleManager.getAgentMemory(agentId, key);

export { AgentLifecycleManager };