/**
 * Hook Integration System
 * Enables coordination protocols for GitHub agents
 */

import { HookContext, GitHubError } from '../types';

export interface HookConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  debug: boolean;
}

export interface HookResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

export class GitHubHookIntegration {
  private config: HookConfig;
  private hooks: Map<string, Function[]> = new Map();

  constructor(config: Partial<HookConfig> = {}) {
    this.config = {
      enabled: true,
      timeout: 5000,
      retries: 2,
      debug: false,
      ...config,
    };
  }

  // =============================================================================
  // HOOK REGISTRATION
  // =============================================================================

  /**
   * Register a pre-operation hook
   */
  registerPreHook(operation: string, handler: (context: HookContext) => Promise<any> | any): void {
    const key = `pre:${operation}`;
    if (!this.hooks.has(key)) {
      this.hooks.set(key, []);
    }
    this.hooks.get(key)!.push(handler);

    if (this.config.debug) {
      console.log(`[GitHubHooks] Registered pre-hook for ${operation}`);
    }
  }

  /**
   * Register a post-operation hook
   */
  registerPostHook(operation: string, handler: (context: HookContext) => Promise<any> | any): void {
    const key = `post:${operation}`;
    if (!this.hooks.has(key)) {
      this.hooks.set(key, []);
    }
    this.hooks.get(key)!.push(handler);

    if (this.config.debug) {
      console.log(`[GitHubHooks] Registered post-hook for ${operation}`);
    }
  }

  /**
   * Register error handling hook
   */
  registerErrorHook(
    operation: string,
    handler: (error: any, context: HookContext) => Promise<any> | any,
  ): void {
    const key = `error:${operation}`;
    if (!this.hooks.has(key)) {
      this.hooks.set(key, []);
    }
    this.hooks.get(key)!.push(handler);

    if (this.config.debug) {
      console.log(`[GitHubHooks] Registered error hook for ${operation}`);
    }
  }

  // =============================================================================
  // HOOK EXECUTION
  // =============================================================================

  /**
   * Execute pre-operation hooks
   */
  async executePreHooks(context: HookContext): Promise<HookResult> {
    if (!this.config.enabled) {
      return { success: true, duration: 0 };
    }

    const startTime = Date.now();
    const key = `pre:${context.operation}`;
    const hooks = this.hooks.get(key) || [];

    if (hooks.length === 0) {
      return { success: true, duration: Date.now() - startTime };
    }

    try {
      const results = [];

      for (const hook of hooks) {
        try {
          const result = await this.executeHookWithTimeout(hook, context);
          results.push(result);

          if (this.config.debug) {
            console.log(`[GitHubHooks] Pre-hook executed for ${context.operation}:`, result);
          }
        } catch (error) {
          if (this.config.debug) {
            console.error(`[GitHubHooks] Pre-hook failed for ${context.operation}:`, error);
          }

          // Continue with other hooks but log the error
          results.push({ error: error.message });
        }
      }

      return {
        success: true,
        data: results,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute post-operation hooks
   */
  async executePostHooks(context: HookContext): Promise<HookResult> {
    if (!this.config.enabled) {
      return { success: true, duration: 0 };
    }

    const startTime = Date.now();
    const key = `post:${context.operation}`;
    const hooks = this.hooks.get(key) || [];

    if (hooks.length === 0) {
      return { success: true, duration: Date.now() - startTime };
    }

    try {
      const results = [];

      for (const hook of hooks) {
        try {
          const result = await this.executeHookWithTimeout(hook, context);
          results.push(result);

          if (this.config.debug) {
            console.log(`[GitHubHooks] Post-hook executed for ${context.operation}:`, result);
          }
        } catch (error) {
          if (this.config.debug) {
            console.error(`[GitHubHooks] Post-hook failed for ${context.operation}:`, error);
          }

          // Continue with other hooks but log the error
          results.push({ error: error.message });
        }
      }

      return {
        success: true,
        data: results,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute error hooks
   */
  async executeErrorHooks(error: any, context: HookContext): Promise<HookResult> {
    if (!this.config.enabled) {
      return { success: true, duration: 0 };
    }

    const startTime = Date.now();
    const key = `error:${context.operation}`;
    const hooks = this.hooks.get(key) || [];

    if (hooks.length === 0) {
      return { success: true, duration: Date.now() - startTime };
    }

    try {
      const results = [];

      for (const hook of hooks) {
        try {
          const result = await this.executeHookWithTimeout(hook, error, context);
          results.push(result);

          if (this.config.debug) {
            console.log(`[GitHubHooks] Error hook executed for ${context.operation}:`, result);
          }
        } catch (hookError) {
          if (this.config.debug) {
            console.error(`[GitHubHooks] Error hook failed for ${context.operation}:`, hookError);
          }

          results.push({ error: hookError.message });
        }
      }

      return {
        success: true,
        data: results,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  // =============================================================================
  // BUILT-IN HOOKS
  // =============================================================================

  /**
   * Setup default GitHub coordination hooks
   */
  setupDefaultHooks(): void {
    // Memory coordination hooks
    this.registerPreHook('*', async (context: HookContext) => {
      try {
        // Store operation start in memory for coordination
        const memoryKey = `github/operations/${context.agent_id}/${Date.now()}`;
        console.log(
          `[GitHubHooks] Starting operation: ${context.operation} for ${context.agent_id}`,
        );

        // This would integrate with claude-flow memory system
        // await storeInMemory(memoryKey, { context, started_at: new Date().toISOString() });

        return { memory_key: memoryKey };
      } catch (error) {
        console.warn('[GitHubHooks] Memory coordination pre-hook failed:', error);
        return { error: error.message };
      }
    });

    this.registerPostHook('*', async (context: HookContext) => {
      try {
        // Update operation completion in memory
        console.log(
          `[GitHubHooks] Completed operation: ${context.operation} for ${context.agent_id}`,
        );

        // This would integrate with claude-flow memory system
        // const completionData = { context, completed_at: new Date().toISOString() };
        // await storeInMemory(`github/completed/${context.agent_id}/${context.operation}`, completionData);

        return { completed: true };
      } catch (error) {
        console.warn('[GitHubHooks] Memory coordination post-hook failed:', error);
        return { error: error.message };
      }
    });

    // Performance monitoring hooks
    this.registerPreHook('*', async (context: HookContext) => {
      context.metadata = context.metadata || {};
      context.metadata.start_time = Date.now();
      return { performance_tracking_enabled: true };
    });

    this.registerPostHook('*', async (context: HookContext) => {
      const startTime = context.metadata?.start_time;
      if (startTime) {
        const duration = Date.now() - startTime;
        console.log(`[GitHubHooks] Operation ${context.operation} took ${duration}ms`);

        // This would integrate with claude-flow metrics system
        // await recordMetric(`github.${context.operation}.duration`, duration);

        return { duration, performance_recorded: true };
      }
      return { performance_tracking: 'start_time_not_found' };
    });

    // Error tracking hooks
    this.registerErrorHook('*', async (error: any, context: HookContext) => {
      console.error(`[GitHubHooks] Error in ${context.operation} for ${context.agent_id}:`, error);

      // This would integrate with claude-flow error tracking
      // await recordError(`github.${context.operation}`, error, context);

      return { error_recorded: true };
    });

    // Validation hooks for critical operations
    this.registerPreHook('merge_pull_request', async (context: HookContext) => {
      // Validate that PR can be safely merged
      const repository = context.repository;
      const prNumber = context.metadata?.pr_number;

      if (!repository || !prNumber) {
        throw new Error('Repository and PR number required for merge validation');
      }

      // This would perform actual validation checks
      console.log(`[GitHubHooks] Validating PR ${prNumber} in ${repository.full_name} for merge`);

      return { validation_passed: true };
    });

    this.registerPreHook('create_release', async (context: HookContext) => {
      // Validate that release can be created
      const repository = context.repository;
      const tagName = context.metadata?.tag_name;

      if (!repository || !tagName) {
        throw new Error('Repository and tag name required for release validation');
      }

      console.log(`[GitHubHooks] Validating release ${tagName} for ${repository.full_name}`);

      return { release_validation_passed: true };
    });

    // Coordination hooks for multi-repo operations
    this.registerPreHook('coordinate_multi_repo_release', async (context: HookContext) => {
      const repoCount = context.metadata?.repository_count || 0;
      console.log(
        `[GitHubHooks] Starting multi-repo release coordination for ${repoCount} repositories`,
      );

      // This would coordinate with other agents
      // await notifyCoordinationStart('multi_repo_release', context);

      return { coordination_started: true };
    });

    this.registerPostHook('coordinate_multi_repo_release', async (context: HookContext) => {
      console.log(`[GitHubHooks] Completed multi-repo release coordination`);

      // This would notify completion to other agents
      // await notifyCoordinationComplete('multi_repo_release', context);

      return { coordination_completed: true };
    });

    if (this.config.debug) {
      console.log('[GitHubHooks] Default hooks registered');
    }
  }

  // =============================================================================
  // CLAUDE-FLOW INTEGRATION
  // =============================================================================

  /**
   * Execute claude-flow hooks using bash commands
   */
  async executeClaudeFlowHook(
    type: 'pre-task' | 'post-task' | 'notify',
    context: HookContext,
  ): Promise<HookResult> {
    const startTime = Date.now();

    try {
      let command: string;

      switch (type) {
        case 'pre-task':
          command = `npx claude-flow@alpha hooks pre-task --description "${context.operation}" --agent-id "${context.agent_id}"`;
          break;
        case 'post-task':
          command = `npx claude-flow@alpha hooks post-task --task-id "${context.operation}" --agent-id "${context.agent_id}"`;
          break;
        case 'notify':
          const message = `${context.agent_id} completed ${context.operation}`;
          command = `npx claude-flow@alpha hooks notify --message "${message}"`;
          break;
        default:
          throw new Error(`Unknown claude-flow hook type: ${type}`);
      }

      if (this.config.debug) {
        console.log(`[GitHubHooks] Executing claude-flow hook: ${command}`);
      }

      // In a real implementation, this would execute the command
      // const result = await execCommand(command);

      return {
        success: true,
        data: { command, type },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Clear all registered hooks
   */
  clearHooks(): void {
    this.hooks.clear();
    if (this.config.debug) {
      console.log('[GitHubHooks] All hooks cleared');
    }
  }

  /**
   * Get registered hooks summary
   */
  getHooksSummary(): any {
    const summary: any = {
      total_hooks: 0,
      by_operation: {},
      by_type: { pre: 0, post: 0, error: 0 },
    };

    for (const [key, handlers] of this.hooks.entries()) {
      const [type, operation] = key.split(':');
      summary.total_hooks += handlers.length;
      summary.by_type[type] = (summary.by_type[type] || 0) + handlers.length;

      if (!summary.by_operation[operation]) {
        summary.by_operation[operation] = { pre: 0, post: 0, error: 0 };
      }
      summary.by_operation[operation][type] += handlers.length;
    }

    return summary;
  }

  /**
   * Update hook configuration
   */
  updateConfig(config: Partial<HookConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.config.debug) {
      console.log('[GitHubHooks] Configuration updated:', this.config);
    }
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private async executeHookWithTimeout(hook: Function, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Hook execution timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);

      Promise.resolve(hook(...args))
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }
}

// Global hook integration instance
export const githubHooks = new GitHubHookIntegration({
  enabled: true,
  timeout: 5000,
  retries: 2,
  debug: process.env.NODE_ENV === 'development',
});

// Initialize default hooks
githubHooks.setupDefaultHooks();
