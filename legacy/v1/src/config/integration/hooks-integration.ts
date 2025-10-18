/**
 * Hooks Integration for Intelligent Configuration System
 *
 * Integrates the configuration system with the existing hook ecosystem
 * for seamless coordination and automation.
 */

import { EventEmitter } from 'events';
import { IntelligentConfigurationManager } from '../core/intelligent-configuration-manager.js';

export interface HookIntegrationConfig {
  enabled: boolean;
  hookTimeout: number;
  retryAttempts: number;
  cacheDuration: number;
  automaticMode: boolean;
  coordinationEnabled: boolean;
}

export interface ConfigurationHookContext {
  configurationManager: IntelligentConfigurationManager;
  sessionId: string;
  projectPath: string;
  userId?: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface HookExecutionResult {
  success: boolean;
  duration: number;
  output?: any;
  error?: string;
  warnings?: string[];
  metadata?: Record<string, any>;
}

export interface AgentCoordinationInfo {
  activeAgents: string[];
  topology: string;
  maxAgents: number;
  strategy: string;
  performance: {
    averageResponseTime: number;
    throughput: number;
    errorRate: number;
  };
}

/**
 * Configuration Hook Integration Manager
 */
export class ConfigurationHookIntegration extends EventEmitter {
  private configManager: IntelligentConfigurationManager;
  private config: HookIntegrationConfig;
  private hookCache: Map<string, any>;
  private executionHistory: Map<string, HookExecutionResult[]>;

  constructor(configManager: IntelligentConfigurationManager, config: HookIntegrationConfig) {
    super();
    this.configManager = configManager;
    this.config = config;
    this.hookCache = new Map();
    this.executionHistory = new Map();

    this.setupHookIntegration();
  }

  /**
   * Initialize hook integration with configuration system
   */
  private setupHookIntegration(): void {
    if (!this.config.enabled) return;

    // Pre-task hooks for configuration preparation
    this.configManager.on('initializationStarted', async (data) => {
      await this.executePreTaskHooks(data);
    });

    // Post-configuration hooks for system updates
    this.configManager.on('configurationUpdated', async (data) => {
      await this.executePostConfigurationHooks(data);
    });

    // Migration hooks for version transitions
    this.configManager.on('migrationRequired', async (data) => {
      await this.executeMigrationHooks(data);
    });

    // Level change hooks for UI adaptation
    this.configManager.on('configurationLevelChanged', async (data) => {
      await this.executeLevelChangeHooks(data);
    });

    // Auto-setup hooks for AI-driven configuration
    this.configManager.on('autoSetupCompleted', async (data) => {
      await this.executeAutoSetupHooks(data);
    });
  }

  /**
   * Execute pre-task hooks to prepare configuration environment
   */
  async executePreTaskHooks(context: any): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];

    if (!this.config.enabled) return results;

    const hookContext = await this.buildHookContext(context);

    try {
      // Session restoration hook
      const sessionResult = await this.executeHook('session-restore', {
        ...hookContext,
        action: 'restore',
        sessionId: hookContext.sessionId,
      });
      results.push(sessionResult);

      // Resource preparation hook
      const resourceResult = await this.executeHook('resource-preparation', {
        ...hookContext,
        action: 'prepare',
        resources: ['configuration', 'storage', 'ai-models'],
      });
      results.push(resourceResult);

      // Context loading hook
      const contextResult = await this.executeHook('context-loading', {
        ...hookContext,
        action: 'load',
        contexts: ['user', 'project', 'team'],
      });
      results.push(contextResult);

      // Agent initialization hook
      const agentResult = await this.executeHook('agent-initialization', {
        ...hookContext,
        action: 'initialize',
        agentTypes: await this.determineRequiredAgents(hookContext),
      });
      results.push(agentResult);
    } catch (error) {
      this.emit('hookExecutionError', {
        hook: 'pre-task',
        error: error.message,
        context: hookContext,
      });

      results.push({
        success: false,
        duration: 0,
        error: error.message,
      });
    }

    return results;
  }

  /**
   * Execute post-configuration hooks for system coordination
   */
  async executePostConfigurationHooks(data: any): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];

    if (!this.config.enabled) return results;

    const hookContext = await this.buildHookContext(data);

    try {
      // Memory storage hook
      const memoryResult = await this.executeHook('memory-store', {
        ...hookContext,
        action: 'store',
        key: `config/${hookContext.sessionId}`,
        value: JSON.stringify(data.configuration),
        namespace: 'configuration',
      });
      results.push(memoryResult);

      // Agent coordination hook
      const coordinationResult = await this.executeHook('agent-coordination', {
        ...hookContext,
        action: 'update',
        configuration: data.configuration,
        changes: data.changes || [],
      });
      results.push(coordinationResult);

      // Metrics update hook
      const metricsResult = await this.executeHook('metrics-update', {
        ...hookContext,
        action: 'record',
        metrics: {
          configurationUpdated: true,
          changesCount: data.changes?.length || 0,
          timestamp: new Date().toISOString(),
        },
      });
      results.push(metricsResult);

      // Neural pattern training hook
      if (data.configuration?.features?.neural?.enabled) {
        const neuralResult = await this.executeHook('neural-pattern-training', {
          ...hookContext,
          action: 'train',
          pattern: 'configuration-optimization',
          data: {
            configuration: data.configuration,
            changes: data.changes,
            outcome: 'success',
          },
        });
        results.push(neuralResult);
      }
    } catch (error) {
      this.emit('hookExecutionError', {
        hook: 'post-configuration',
        error: error.message,
        context: hookContext,
      });
    }

    return results;
  }

  /**
   * Execute migration hooks for version transitions
   */
  async executeMigrationHooks(data: any): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];

    if (!this.config.enabled) return results;

    const hookContext = await this.buildHookContext(data);

    try {
      // Pre-migration backup hook
      const backupResult = await this.executeHook('pre-migration-backup', {
        ...hookContext,
        action: 'backup',
        fromVersion: data.fromVersion,
        toVersion: data.toVersion,
      });
      results.push(backupResult);

      // Migration validation hook
      const validationResult = await this.executeHook('migration-validation', {
        ...hookContext,
        action: 'validate',
        migration: data,
      });
      results.push(validationResult);

      // Post-migration verification hook
      if (data.success) {
        const verificationResult = await this.executeHook('post-migration-verification', {
          ...hookContext,
          action: 'verify',
          migratedConfiguration: data.configuration,
        });
        results.push(verificationResult);
      }
    } catch (error) {
      this.emit('hookExecutionError', {
        hook: 'migration',
        error: error.message,
        context: hookContext,
      });
    }

    return results;
  }

  /**
   * Execute level change hooks for UI adaptation
   */
  async executeLevelChangeHooks(data: any): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];

    if (!this.config.enabled) return results;

    const hookContext = await this.buildHookContext(data);

    try {
      // UI adaptation hook
      const uiResult = await this.executeHook('ui-adaptation', {
        ...hookContext,
        action: 'adapt',
        fromLevel: data.from,
        toLevel: data.to,
        smooth: data.smooth,
      });
      results.push(uiResult);

      // Feature visibility hook
      const featureResult = await this.executeHook('feature-visibility', {
        ...hookContext,
        action: 'update',
        level: data.to,
        visibleFeatures: await this.getVisibleFeaturesForLevel(data.to),
      });
      results.push(featureResult);

      // Agent reconfiguration hook
      const agentResult = await this.executeHook('agent-reconfiguration', {
        ...hookContext,
        action: 'reconfigure',
        level: data.to,
        agentLimits: await this.getAgentLimitsForLevel(data.to),
      });
      results.push(agentResult);
    } catch (error) {
      this.emit('hookExecutionError', {
        hook: 'level-change',
        error: error.message,
        context: hookContext,
      });
    }

    return results;
  }

  /**
   * Execute auto-setup hooks for AI-driven configuration
   */
  async executeAutoSetupHooks(data: any): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];

    if (!this.config.enabled) return results;

    const hookContext = await this.buildHookContext(data);

    try {
      // Project analysis notification hook
      const analysisResult = await this.executeHook('project-analysis-notification', {
        ...hookContext,
        action: 'notify',
        analysis: data.detectedProject,
        confidence: data.confidence,
      });
      results.push(analysisResult);

      // Agent auto-spawn hook
      if (data.configuration?.agent?.autoSpawn) {
        const spawnResult = await this.executeHook('agent-auto-spawn', {
          ...hookContext,
          action: 'spawn',
          agentConfig: data.configuration.agent,
          projectType: data.detectedProject?.type,
        });
        results.push(spawnResult);
      }

      // Configuration optimization hook
      const optimizationResult = await this.executeHook('configuration-optimization', {
        ...hookContext,
        action: 'optimize',
        configuration: data.configuration,
        projectAnalysis: data.detectedProject,
      });
      results.push(optimizationResult);

      // Success notification hook
      const notificationResult = await this.executeHook('setup-success-notification', {
        ...hookContext,
        action: 'notify',
        configuration: data.configuration,
        recommendations: data.recommendations,
        nextSteps: data.nextSteps,
      });
      results.push(notificationResult);
    } catch (error) {
      this.emit('hookExecutionError', {
        hook: 'auto-setup',
        error: error.message,
        context: hookContext,
      });
    }

    return results;
  }

  /**
   * Execute a specific hook with retry and error handling
   */
  private async executeHook(hookName: string, context: any): Promise<HookExecutionResult> {
    const startTime = Date.now();
    let attempt = 0;

    while (attempt < this.config.retryAttempts) {
      try {
        // Check cache first
        const cacheKey = this.getCacheKey(hookName, context);
        const cachedResult = this.hookCache.get(cacheKey);

        if (cachedResult && this.isCacheValid(cachedResult.timestamp)) {
          return {
            success: true,
            duration: Date.now() - startTime,
            output: cachedResult.output,
            metadata: { cached: true },
          };
        }

        // Execute hook via claude-flow-novice hooks system
        const result = await this.executeClaudeFlowHook(hookName, context);

        // Cache successful results
        if (result.success) {
          this.hookCache.set(cacheKey, {
            output: result.output,
            timestamp: Date.now(),
          });
        }

        // Record execution history
        this.recordExecution(hookName, result);

        return result;
      } catch (error) {
        attempt++;

        if (attempt >= this.config.retryAttempts) {
          const failureResult: HookExecutionResult = {
            success: false,
            duration: Date.now() - startTime,
            error: error.message,
            warnings: [`Failed after ${attempt} attempts`],
          };

          this.recordExecution(hookName, failureResult);
          return failureResult;
        }

        // Exponential backoff
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }

    // Should never reach here, but added for completeness
    return {
      success: false,
      duration: Date.now() - startTime,
      error: 'Unexpected execution path',
    };
  }

  /**
   * Execute claude-flow-novice hook command
   */
  private async executeClaudeFlowHook(
    hookName: string,
    context: any,
  ): Promise<HookExecutionResult> {
    const startTime = Date.now();

    try {
      // Map hook names to claude-flow-novice commands
      const command = this.mapHookToCommand(hookName, context);

      if (!command) {
        return {
          success: false,
          duration: Date.now() - startTime,
          error: `No command mapping for hook: ${hookName}`,
        };
      }

      // Execute command (this would integrate with actual hook execution system)
      const output = await this.executeClaudeFlowCommand(command);

      return {
        success: true,
        duration: Date.now() - startTime,
        output,
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Map hook names to claude-flow-novice commands
   */
  private mapHookToCommand(hookName: string, context: any): string | null {
    const commandMappings: Record<string, (ctx: any) => string> = {
      'session-restore': (ctx) =>
        `npx claude-flow@alpha hooks session-restore --session-id "${ctx.sessionId}"`,

      'resource-preparation': (ctx) =>
        `npx claude-flow@alpha hooks resource-preparation --resources "${ctx.resources?.join(',')}"`,

      'context-loading': (ctx) =>
        `npx claude-flow@alpha hooks context-loading --contexts "${ctx.contexts?.join(',')}"`,

      'agent-initialization': (ctx) =>
        `npx claude-flow@alpha hooks agent-initialization --types "${ctx.agentTypes?.join(',')}"`,

      'memory-store': (ctx) =>
        `npx claude-flow@alpha hooks memory-store --key "${ctx.key}" --value "${ctx.value}" --namespace "${ctx.namespace}"`,

      'agent-coordination': (ctx) =>
        `npx claude-flow@alpha hooks agent-coordination --action "${ctx.action}" --config "${JSON.stringify(ctx.configuration)}"`,

      'metrics-update': (ctx) =>
        `npx claude-flow@alpha hooks metrics-update --metrics "${JSON.stringify(ctx.metrics)}"`,

      'neural-pattern-training': (ctx) =>
        `npx claude-flow@alpha hooks neural-pattern-training --pattern "${ctx.pattern}" --data "${JSON.stringify(ctx.data)}"`,

      'agent-auto-spawn': (ctx) =>
        `npx claude-flow@alpha hooks agent-auto-spawn --config "${JSON.stringify(ctx.agentConfig)}" --project-type "${ctx.projectType}"`,

      'configuration-optimization': (ctx) =>
        `npx claude-flow@alpha hooks configuration-optimization --config "${JSON.stringify(ctx.configuration)}"`,
    };

    const mapper = commandMappings[hookName];
    return mapper ? mapper(context) : null;
  }

  /**
   * Execute claude-flow-novice command (integration point)
   */
  private async executeClaudeFlowCommand(command: string): Promise<any> {
    // This would integrate with the actual claude-flow-novice command execution system
    // For now, return a mock successful result
    return {
      success: true,
      output: `Executed: ${command}`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Build hook execution context
   */
  private async buildHookContext(data: any): Promise<ConfigurationHookContext> {
    return {
      configurationManager: this.configManager,
      sessionId: `config-session-${Date.now()}`,
      projectPath: process.cwd(),
      timestamp: new Date(),
      metadata: {
        ...data,
        hookSystem: 'configuration-integration',
        version: '1.0.0',
      },
    };
  }

  /**
   * Determine required agents based on configuration
   */
  private async determineRequiredAgents(context: ConfigurationHookContext): Promise<string[]> {
    // This would analyze the project and configuration to determine needed agents
    return ['coder', 'tester', 'reviewer'];
  }

  /**
   * Get visible features for configuration level
   */
  private async getVisibleFeaturesForLevel(level: string): Promise<string[]> {
    const featureMap: Record<string, string[]> = {
      novice: ['basic-agents', 'simple-config'],
      intermediate: ['basic-agents', 'simple-config', 'monitoring', 'memory'],
      advanced: ['basic-agents', 'simple-config', 'monitoring', 'memory', 'neural', 'coordination'],
      enterprise: [
        'basic-agents',
        'simple-config',
        'monitoring',
        'memory',
        'neural',
        'coordination',
        'security',
        'team-sharing',
      ],
    };

    return featureMap[level] || featureMap['novice'];
  }

  /**
   * Get agent limits for configuration level
   */
  private async getAgentLimitsForLevel(level: string): Promise<{ min: number; max: number }> {
    const limitMap: Record<string, { min: number; max: number }> = {
      novice: { min: 1, max: 5 },
      intermediate: { min: 2, max: 8 },
      advanced: { min: 3, max: 15 },
      enterprise: { min: 5, max: 50 },
    };

    return limitMap[level] || limitMap['novice'];
  }

  // Helper methods
  private getCacheKey(hookName: string, context: any): string {
    const contextHash = JSON.stringify(context);
    return `${hookName}-${contextHash}`;
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.config.cacheDuration;
  }

  private recordExecution(hookName: string, result: HookExecutionResult): void {
    const history = this.executionHistory.get(hookName) || [];
    history.push(result);

    // Keep only last 10 executions
    if (history.length > 10) {
      history.shift();
    }

    this.executionHistory.set(hookName, history);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get execution statistics
   */
  getExecutionStatistics(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [hookName, history] of this.executionHistory.entries()) {
      const successful = history.filter((r) => r.success).length;
      const failed = history.length - successful;
      const avgDuration = history.reduce((sum, r) => sum + r.duration, 0) / history.length;

      stats[hookName] = {
        totalExecutions: history.length,
        successful,
        failed,
        successRate: successful / history.length,
        averageDuration: Math.round(avgDuration),
        lastExecution: history[history.length - 1]?.timestamp,
      };
    }

    return stats;
  }

  /**
   * Clear hook cache
   */
  clearCache(): void {
    this.hookCache.clear();
  }

  /**
   * Get hook execution history
   */
  getExecutionHistory(hookName?: string): Record<string, HookExecutionResult[]> {
    if (hookName) {
      return { [hookName]: this.executionHistory.get(hookName) || [] };
    }

    return Object.fromEntries(this.executionHistory.entries());
  }
}
