/**
 * Experimental Features Integration Layer
 * Checkpoint 1.4 - System Integration and Deployment Architecture
 */

import { ExperimentalFeaturesManager } from './index.js';
import { FeatureClassification } from './FeatureClassification.js';

/**
 * Integration layer for experimental features with Claude Flow system
 */
export class ExperimentalIntegration {
  constructor(claudeFlowCore) {
    this.core = claudeFlowCore;
    this.experimentalManager = null;
    this.hookIntegrations = new Map();
    this.agentInterceptors = new Map();
    this.isIntegrated = false;
  }

  /**
   * Initialize experimental features integration
   */
  async initialize() {
    if (this.isIntegrated) {
      return;
    }

    try {
      console.log('[ExperimentalIntegration] Initializing integration...');

      // Initialize experimental features manager
      this.experimentalManager = new ExperimentalFeaturesManager(
        this.core.configManager,
        this.core.userManager,
        this.core.notificationService,
        this.core.logger,
      );

      await this.experimentalManager.initialize();

      // Set up core system integrations
      await this.setupAgentInterceptors();
      await this.setupHookIntegrations();
      await this.setupCommandInterceptors();
      await this.setupUIIntegrations();

      this.isIntegrated = true;
      console.log('[ExperimentalIntegration] Integration completed successfully');
    } catch (error) {
      console.error('[ExperimentalIntegration] Integration failed:', error);
      throw error;
    }
  }

  /**
   * Set up agent spawn interceptors to handle experimental features
   */
  async setupAgentInterceptors() {
    // Intercept agent spawning requests
    const originalSpawnAgent = this.core.agentManager.spawnAgent.bind(this.core.agentManager);

    this.core.agentManager.spawnAgent = async (agentType, options = {}) => {
      const userId = options.userId || 'system';

      // Check if agent is experimental
      const agentConfig = FeatureClassification.EXPERIMENTAL_AGENTS[agentType];

      if (agentConfig) {
        // Experimental agent - check visibility and enablement
        const userLevel = await this.getUserLevel(userId);
        const enabledFeatures = await this.experimentalManager.getUserEnabledFeatures(userId);

        const isVisible = FeatureClassification.isAgentVisible(
          agentType,
          userLevel,
          enabledFeatures,
        );

        if (!isVisible) {
          // Agent not visible to user - provide graceful degradation
          const degradationResult =
            await this.experimentalManager.gracefulDegradation.handleFeatureUnavailable(
              agentType,
              'not-enabled',
            );

          if (degradationResult.success && degradationResult.fallbackAgent) {
            console.log(
              `[ExperimentalIntegration] Using fallback agent ${degradationResult.fallbackAgent} for ${agentType}`,
            );
            return await originalSpawnAgent(degradationResult.fallbackAgent, {
              ...options,
              fallbackFor: agentType,
              capabilities: degradationResult.capabilities,
              limitations: degradationResult.limitations,
            });
          } else {
            throw new Error(
              `Agent ${agentType} is not available for your current experience level`,
            );
          }
        }

        // Agent is visible - proceed with experimental agent
        console.log(`[ExperimentalIntegration] Spawning experimental agent: ${agentType}`);

        // Start performance monitoring
        await this.experimentalManager.performanceMonitor.startMonitoring(agentType, {
          stability: agentConfig.stability,
          category: agentConfig.category,
        });

        // Execute pre-spawn hook
        await this.executeHook('experimental-agent-pre-spawn', {
          agentType,
          userId,
          stability: agentConfig.stability,
        });

        const agent = await originalSpawnAgent(agentType, {
          ...options,
          experimental: true,
          stability: agentConfig.stability,
          category: agentConfig.category,
        });

        // Execute post-spawn hook
        await this.executeHook('experimental-agent-post-spawn', {
          agentType,
          userId,
          agentId: agent.id,
          stability: agentConfig.stability,
        });

        return agent;
      }

      // Non-experimental agent - proceed normally
      return await originalSpawnAgent(agentType, options);
    };

    console.log('[ExperimentalIntegration] Agent interceptors configured');
  }

  /**
   * Set up hook integrations for experimental features
   */
  async setupHookIntegrations() {
    // Pre-task hook integration
    this.hookIntegrations.set('pre-task', async (taskData) => {
      if (taskData.experimental || this.isExperimentalTask(taskData)) {
        // Log experimental task start
        await this.experimentalManager.performanceMonitor.recordMetric(
          taskData.agentType || 'unknown',
          'taskStart',
          Date.now(),
          { taskId: taskData.taskId, experimental: true },
        );

        // Validate experimental features are still enabled
        if (taskData.userId) {
          const enabledFeatures = await this.experimentalManager.getUserEnabledFeatures(
            taskData.userId,
          );
          if (taskData.agentType && !enabledFeatures.includes(taskData.agentType)) {
            throw new Error(`Experimental feature ${taskData.agentType} is no longer enabled`);
          }
        }
      }
    });

    // Post-task hook integration
    this.hookIntegrations.set('post-task', async (taskData, result) => {
      if (taskData.experimental || this.isExperimentalTask(taskData)) {
        const duration = Date.now() - (taskData.startTime || 0);

        // Record performance metrics
        await this.experimentalManager.performanceMonitor.recordMetric(
          taskData.agentType || 'unknown',
          'taskDuration',
          duration,
          {
            taskId: taskData.taskId,
            success: result.success,
            experimental: true,
          },
        );

        // Record error metrics if task failed
        if (!result.success) {
          await this.experimentalManager.performanceMonitor.recordMetric(
            taskData.agentType || 'unknown',
            'errorCounts',
            1,
            {
              taskId: taskData.taskId,
              error: result.error,
              experimental: true,
            },
          );
        }
      }
    });

    // Session hooks for experimental features
    this.hookIntegrations.set('session-start', async (sessionData) => {
      if (sessionData.userId) {
        // Load user's experimental configuration
        const userConfig = await this.experimentalManager.config.getUserConfig(sessionData.userId);
        sessionData.experimentalConfig = userConfig;

        // Initialize user-specific monitoring
        const enabledFeatures = await this.experimentalManager.getUserEnabledFeatures(
          sessionData.userId,
        );
        for (const feature of enabledFeatures) {
          await this.experimentalManager.performanceMonitor.startMonitoring(feature, {
            stability: FeatureClassification.EXPERIMENTAL_AGENTS[feature]?.stability || 'unknown',
            userId: sessionData.userId,
          });
        }
      }
    });

    this.hookIntegrations.set('session-end', async (sessionData) => {
      if (sessionData.userId) {
        // Stop monitoring for user's features
        const enabledFeatures = await this.experimentalManager.getUserEnabledFeatures(
          sessionData.userId,
        );
        for (const feature of enabledFeatures) {
          await this.experimentalManager.performanceMonitor.stopMonitoring(feature);
        }

        // Generate session report
        const sessionReport = {
          userId: sessionData.userId,
          duration: sessionData.duration,
          experimentalFeaturesUsed: enabledFeatures.length,
          performanceScore: this.experimentalManager.performanceMonitor.getSystemHealthScore(),
          degradationEvents: this.experimentalManager.gracefulDegradation.getDegradationStatus(),
        };

        console.log('[ExperimentalIntegration] Session report:', sessionReport);
      }
    });

    console.log('[ExperimentalIntegration] Hook integrations configured');
  }

  /**
   * Set up command interceptors for experimental features
   */
  async setupCommandInterceptors() {
    // Intercept agent list commands to filter by user level
    const originalListAgents = this.core.commandHandler.listAgents?.bind(this.core.commandHandler);

    if (originalListAgents) {
      this.core.commandHandler.listAgents = async (options = {}) => {
        const allAgents = await originalListAgents(options);
        const userId = options.userId || 'anonymous';

        // Filter agents based on user's experimental configuration
        const visibleAgents = await this.experimentalManager.getVisibleAgents(userId, options);

        return {
          ...allAgents,
          agents: visibleAgents.agents,
          categories: visibleAgents.categories,
          recommendations: visibleAgents.recommendations,
          userLevel: visibleAgents.userLevel,
        };
      };
    }

    // Add experimental feature management commands
    this.core.commandHandler.addCommand('experimental', {
      description: 'Manage experimental features',
      subcommands: {
        list: async (options) => {
          const userId = options.userId || 'anonymous';
          return await this.experimentalManager.getVisibleAgents(userId);
        },
        enable: async (options) => {
          const { feature, userId } = options;
          return await this.experimentalManager.enableFeature(feature, userId);
        },
        disable: async (options) => {
          const { feature, userId } = options;
          return await this.experimentalManager.disableFeature(feature, userId);
        },
        status: async (options) => {
          return await this.experimentalManager.getSystemStatus();
        },
        'upgrade-level': async (options) => {
          const { userId, level } = options;
          return await this.experimentalManager.setUserLevel(userId, level);
        },
      },
    });

    console.log('[ExperimentalIntegration] Command interceptors configured');
  }

  /**
   * Set up UI integrations for experimental features
   */
  async setupUIIntegrations() {
    // Register UI components for experimental features
    if (this.core.uiManager) {
      // Register experimental features panel
      this.core.uiManager.registerComponent('experimental-features-panel', {
        component: 'ExperimentalFeaturesPanel',
        props: {
          manager: this.experimentalManager,
        },
        permissions: ['view-experimental'],
      });

      // Register agent visibility components
      this.core.uiManager.registerComponent('agent-list-with-experimental', {
        component: 'EnhancedAgentList',
        props: {
          visibilityManager: this.experimentalManager.visibilityManager,
        },
      });

      // Register consent dialog component
      this.core.uiManager.registerComponent('experimental-consent-dialog', {
        component: 'ExperimentalConsentDialog',
        props: {
          consentManager: this.experimentalManager.consentManager,
        },
      });
    }

    console.log('[ExperimentalIntegration] UI integrations configured');
  }

  /**
   * Execute experimental feature hooks
   */
  async executeHook(hookName, data) {
    const hook = this.hookIntegrations.get(hookName);
    if (hook) {
      try {
        return await hook(data);
      } catch (error) {
        console.error(`[ExperimentalIntegration] Hook ${hookName} failed:`, error);
      }
    }
  }

  /**
   * Check if task involves experimental features
   */
  isExperimentalTask(taskData) {
    return (
      taskData.experimental ||
      (taskData.agentType && FeatureClassification.EXPERIMENTAL_AGENTS[taskData.agentType]) ||
      (taskData.features &&
        taskData.features.some((f) => FeatureClassification.EXPERIMENTAL_AGENTS[f]))
    );
  }

  /**
   * Get user's experience level
   */
  async getUserLevel(userId) {
    if (userId === 'system' || userId === 'anonymous') {
      return FeatureClassification.USER_LEVELS.NOVICE;
    }

    try {
      return await this.experimentalManager.config.getUserLevel(userId);
    } catch (error) {
      console.warn(`[ExperimentalIntegration] Failed to get user level for ${userId}:`, error);
      return FeatureClassification.USER_LEVELS.NOVICE;
    }
  }

  /**
   * Validate system integration health
   */
  async validateIntegration() {
    const validationResults = {
      overall: 'healthy',
      components: {},
      issues: [],
      recommendations: [],
    };

    try {
      // Validate experimental features manager
      const systemStatus = await this.experimentalManager.getSystemStatus();
      validationResults.components.experimentalManager = {
        status: systemStatus.initialized ? 'healthy' : 'unhealthy',
        details: systemStatus,
      };

      // Validate agent interceptors
      const testAgent = 'coder'; // Known stable agent
      try {
        await this.core.agentManager.spawnAgent(testAgent, { userId: 'system', test: true });
        validationResults.components.agentInterceptors = { status: 'healthy' };
      } catch (error) {
        validationResults.components.agentInterceptors = {
          status: 'unhealthy',
          error: error.message,
        };
        validationResults.issues.push('Agent interceptors failing');
      }

      // Validate hook integrations
      try {
        await this.executeHook('pre-task', { test: true });
        validationResults.components.hookIntegrations = { status: 'healthy' };
      } catch (error) {
        validationResults.components.hookIntegrations = {
          status: 'warning',
          error: error.message,
        };
      }

      // Validate performance monitoring
      const performanceHealth = this.experimentalManager.performanceMonitor.getSystemHealthScore();
      validationResults.components.performanceMonitor = {
        status: performanceHealth.score > 80 ? 'healthy' : 'warning',
        score: performanceHealth.score,
        details: performanceHealth,
      };

      // Validate graceful degradation
      const degradationStatus = this.experimentalManager.gracefulDegradation.getDegradationStatus();
      validationResults.components.gracefulDegradation = {
        status: degradationStatus.degradationLevel === 'none' ? 'healthy' : 'warning',
        details: degradationStatus,
      };

      // Overall health assessment
      const unhealthyComponents = Object.values(validationResults.components).filter(
        (c) => c.status === 'unhealthy',
      ).length;

      if (unhealthyComponents > 0) {
        validationResults.overall = 'unhealthy';
        validationResults.recommendations.push('Address unhealthy components immediately');
      } else if (Object.values(validationResults.components).some((c) => c.status === 'warning')) {
        validationResults.overall = 'warning';
        validationResults.recommendations.push('Monitor warning components closely');
      }
    } catch (error) {
      validationResults.overall = 'critical';
      validationResults.error = error.message;
      validationResults.issues.push('Integration validation failed');
    }

    return validationResults;
  }

  /**
   * Get integration metrics for monitoring
   */
  getIntegrationMetrics() {
    return {
      isIntegrated: this.isIntegrated,
      interceptorsActive: this.agentInterceptors.size,
      hooksRegistered: this.hookIntegrations.size,
      experimentalFeatures: Object.keys(FeatureClassification.EXPERIMENTAL_AGENTS).length,
      systemHealth: this.experimentalManager?.performanceMonitor.getSystemHealthScore() || null,
    };
  }

  /**
   * Cleanup integration
   */
  async cleanup() {
    if (!this.isIntegrated) {
      return;
    }

    console.log('[ExperimentalIntegration] Starting integration cleanup...');

    // Cleanup experimental features manager
    if (this.experimentalManager) {
      await this.experimentalManager.cleanup();
    }

    // Clear interceptors and hooks
    this.agentInterceptors.clear();
    this.hookIntegrations.clear();

    // Restore original methods
    // Note: In production, would need to properly restore original methods

    this.isIntegrated = false;
    console.log('[ExperimentalIntegration] Integration cleanup completed');
  }
}

/**
 * Factory function to create and initialize experimental integration
 */
export async function createExperimentalIntegration(claudeFlowCore) {
  const integration = new ExperimentalIntegration(claudeFlowCore);
  await integration.initialize();
  return integration;
}

/**
 * Deployment helper for experimental features
 */
export class ExperimentalDeployment {
  constructor(environment = 'development') {
    this.environment = environment;
    this.deploymentConfig = this.getDeploymentConfig(environment);
  }

  /**
   * Get deployment configuration for environment
   */
  getDeploymentConfig(environment) {
    const configs = {
      development: {
        enableAllFeatures: true,
        defaultUserLevel: FeatureClassification.USER_LEVELS.ADVANCED,
        performanceMonitoring: 'enhanced',
        consentRequired: false, // For development ease
        gracefulDegradation: true,
      },
      testing: {
        enableAllFeatures: true,
        defaultUserLevel: FeatureClassification.USER_LEVELS.INTERMEDIATE,
        performanceMonitoring: 'full',
        consentRequired: true,
        gracefulDegradation: true,
      },
      staging: {
        enableAllFeatures: false,
        defaultUserLevel: FeatureClassification.USER_LEVELS.NOVICE,
        performanceMonitoring: 'full',
        consentRequired: true,
        gracefulDegradation: true,
        enabledFeatureFlags: [
          'experimental.consensus.enabled',
          'experimental.math.matrix.enabled',
          'experimental.analysis.graph.enabled',
        ],
      },
      production: {
        enableAllFeatures: false,
        defaultUserLevel: FeatureClassification.USER_LEVELS.NOVICE,
        performanceMonitoring: 'critical-only',
        consentRequired: true,
        gracefulDegradation: true,
        enabledFeatureFlags: [], // No experimental features by default in production
      },
    };

    return configs[environment] || configs.production;
  }

  /**
   * Deploy experimental features for environment
   */
  async deploy(claudeFlowCore) {
    console.log(
      `[ExperimentalDeployment] Deploying experimental features for ${this.environment} environment`,
    );

    // Create integration with environment-specific configuration
    const integration = new ExperimentalIntegration(claudeFlowCore);

    // Apply environment-specific settings before initialization
    await this.applyEnvironmentSettings(integration);

    // Initialize integration
    await integration.initialize();

    // Validate deployment
    const validation = await integration.validateIntegration();
    if (validation.overall === 'critical' || validation.overall === 'unhealthy') {
      throw new Error(`Deployment validation failed: ${validation.error || 'System unhealthy'}`);
    }

    console.log(
      `[ExperimentalDeployment] Deployment completed successfully for ${this.environment}`,
    );
    return integration;
  }

  /**
   * Apply environment-specific settings
   */
  async applyEnvironmentSettings(integration) {
    const config = this.deploymentConfig;

    // This would configure the system based on environment
    // For now, just log the intended configuration
    console.log('[ExperimentalDeployment] Applying environment settings:', config);
  }
}
