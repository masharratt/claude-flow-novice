/**
 * Experimental Features Management System - Main Entry Point
 * Checkpoint 1.4 - Progressive Visibility and Safe Enablement
 */

export { FeatureClassification } from './FeatureClassification.js';
export { ProgressiveEnablement } from './ProgressiveEnablement.js';
export { ConsentManager } from './ConsentManager.js';
export { PerformanceMonitor } from './PerformanceMonitor.js';
export { AgentVisibilityManager } from './AgentVisibilityManager.js';
export { GracefulDegradation } from './GracefulDegradation.js';

import { FeatureClassification } from './FeatureClassification.js';
import { ProgressiveEnablement } from './ProgressiveEnablement.js';
import { ConsentManager } from './ConsentManager.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { AgentVisibilityManager } from './AgentVisibilityManager.js';
import { GracefulDegradation } from './GracefulDegradation.js';
import { ExperimentalConfig } from '../config/features/ExperimentalConfig.js';

/**
 * Main Experimental Features Manager
 * Coordinates all experimental feature management components
 */
export class ExperimentalFeaturesManager {
  constructor(configManager, userManager, notificationService, logger) {
    this.configManager = configManager;
    this.userManager = userManager;
    this.notificationService = notificationService;
    this.logger = logger;

    // Initialize components
    this.config = new ExperimentalConfig(configManager);
    this.progressiveEnablement = new ProgressiveEnablement(
      configManager,
      userManager,
      notificationService,
    );
    this.consentManager = new ConsentManager();
    this.performanceMonitor = new PerformanceMonitor();
    this.visibilityManager = new AgentVisibilityManager(configManager, userManager);
    this.gracefulDegradation = new GracefulDegradation(configManager, logger);

    this.initialized = false;
  }

  /**
   * Initialize the experimental features management system
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      this.logger.info('[ExperimentalFeaturesManager] Initializing system...');

      // Initialize components in dependency order
      await this.config.initialize();
      await this.performanceMonitor.initialize();
      await this.progressiveEnablement.initialize();

      // Set up component integrations
      this.setupIntegrations();

      this.initialized = true;
      this.logger.info('[ExperimentalFeaturesManager] System initialized successfully');
    } catch (error) {
      this.logger.error('[ExperimentalFeaturesManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Set up integrations between components
   */
  setupIntegrations() {
    // Performance monitor alerts trigger graceful degradation
    this.performanceMonitor.addAlertHandler(async (alert) => {
      if (alert.severity === 'critical') {
        await this.gracefulDegradation.handleFeatureUnavailable(
          alert.feature,
          'performance-critical',
        );
      }
    });

    // Configuration changes trigger visibility updates
    this.configManager.on('featureFlag.changed', async (flagName, value) => {
      if (!value) {
        // Feature flag disabled, check for affected experimental features
        const affectedFeatures = this.getFeaturesByFlag(flagName);
        for (const feature of affectedFeatures) {
          await this.gracefulDegradation.handleFeatureUnavailable(
            feature,
            `feature-flag-disabled-${flagName}`,
          );
        }
      }
    });
  }

  /**
   * Get visible agents for a specific user
   */
  async getVisibleAgents(userId, context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.visibilityManager.getVisibleAgents(userId, context);
  }

  /**
   * Enable experimental feature for user with full safety checks
   */
  async enableFeature(featureName, userId, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Enable through progressive enablement system
      const result = await this.progressiveEnablement.enableFeature(featureName, userId, options);

      this.logger.info(
        `[ExperimentalFeaturesManager] Enabled feature ${featureName} for user ${userId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`[ExperimentalFeaturesManager] Failed to enable ${featureName}:`, error);
      throw error;
    }
  }

  /**
   * Disable experimental feature for user
   */
  async disableFeature(featureName, userId, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const result = await this.progressiveEnablement.disableFeature(featureName, userId, options);

      this.logger.info(
        `[ExperimentalFeaturesManager] Disabled feature ${featureName} for user ${userId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`[ExperimentalFeaturesManager] Failed to disable ${featureName}:`, error);
      throw error;
    }
  }

  /**
   * Get user's enabled experimental features
   */
  async getUserEnabledFeatures(userId) {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.config.getEnabledFeatures(userId);
  }

  /**
   * Set user's experience level
   */
  async setUserLevel(userId, level) {
    if (!this.initialized) {
      await this.initialize();
    }

    await this.config.setUserLevel(userId, level);

    // Notify user about level change and new available features
    const availableFeatures = await this.getVisibleAgents(userId);

    await this.notificationService.send(userId, {
      type: 'user-level-changed',
      title: 'Experience Level Updated',
      message: `Your experience level has been updated to ${level}`,
      newLevel: level,
      availableFeatures: availableFeatures.agents.length,
      experimentalFeatures: availableFeatures.agents.filter((a) => a.isExperimental).length,
    });

    return { success: true, newLevel: level };
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus() {
    if (!this.initialized) {
      await this.initialize();
    }

    return {
      initialized: this.initialized,
      configuration: await this.config.getConfigSummary(),
      performance: this.performanceMonitor.getSystemHealthScore(),
      degradation: this.gracefulDegradation.getDegradationStatus(),
      visibility: await this.visibilityManager.getVisibilityStatistics(),
      enablement: this.progressiveEnablement.getStatus(),
    };
  }

  /**
   * Handle emergency shutdown of experimental features
   */
  async emergencyShutdown(reason = 'emergency') {
    this.logger.warn(`[ExperimentalFeaturesManager] Emergency shutdown triggered: ${reason}`);

    try {
      // Get all currently enabled experimental features
      const allUsers = await this.userManager.getAllUsers();
      const shutdownResults = [];

      for (const user of allUsers) {
        const enabledFeatures = await this.getUserEnabledFeatures(user.id);

        for (const feature of enabledFeatures) {
          try {
            await this.disableFeature(feature, user.id, {
              reason: `emergency-shutdown-${reason}`,
              skipConfirmation: true,
            });

            shutdownResults.push({
              userId: user.id,
              feature,
              success: true,
            });
          } catch (error) {
            shutdownResults.push({
              userId: user.id,
              feature,
              success: false,
              error: error.message,
            });
          }
        }
      }

      // Activate graceful degradation for all experimental features
      const experimentalFeatures = Object.keys(FeatureClassification.EXPERIMENTAL_AGENTS);
      for (const feature of experimentalFeatures) {
        await this.gracefulDegradation.handleFeatureUnavailable(feature, `emergency-${reason}`);
      }

      this.logger.info(
        `[ExperimentalFeaturesManager] Emergency shutdown completed. Results:`,
        shutdownResults,
      );
      return { success: true, shutdownResults };
    } catch (error) {
      this.logger.error('[ExperimentalFeaturesManager] Emergency shutdown failed:', error);
      throw error;
    }
  }

  /**
   * Generate recommendations for user
   */
  async generateRecommendations(userId) {
    if (!this.initialized) {
      await this.initialize();
    }

    const user = await this.userManager.getUser(userId);
    const userLevel = user.experienceLevel || FeatureClassification.USER_LEVELS.NOVICE;
    const enabledFeatures = await this.getUserEnabledFeatures(userId);
    const visibleAgents = await this.getVisibleAgents(userId);

    const recommendations = [];

    // Experience level upgrade recommendations
    if (userLevel === FeatureClassification.USER_LEVELS.NOVICE && enabledFeatures.length > 3) {
      recommendations.push({
        type: 'experience-upgrade',
        priority: 'medium',
        title: 'Consider Upgrading to Intermediate Level',
        message:
          "You're using several features successfully. Intermediate level unlocks beta features with safety warnings.",
        action: 'upgrade-to-intermediate',
      });
    }

    // Feature recommendations based on usage patterns
    const stableFeatures = visibleAgents.agents.filter(
      (a) => !a.isExperimental || a.stability === 'stable',
    );
    const unusedStableFeatures = stableFeatures.filter((f) => !enabledFeatures.includes(f.name));

    if (unusedStableFeatures.length > 0) {
      recommendations.push({
        type: 'feature-discovery',
        priority: 'low',
        title: 'Discover New Stable Features',
        message: `${unusedStableFeatures.length} stable features are available for your experience level`,
        features: unusedStableFeatures.slice(0, 3).map((f) => f.name),
      });
    }

    // Performance recommendations
    const performanceScore = this.performanceMonitor.getSystemHealthScore();
    if (performanceScore.score < 80 && enabledFeatures.length > 5) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        title: 'System Performance Optimization',
        message: 'Consider disabling some experimental features to improve performance',
        currentScore: performanceScore.score,
        enabledExperimental: enabledFeatures.length,
      });
    }

    return recommendations;
  }

  /**
   * Export user's experimental configuration
   */
  async exportUserConfiguration(userId) {
    if (!this.initialized) {
      await this.initialize();
    }

    const user = await this.userManager.getUser(userId);
    const enabledFeatures = await this.getUserEnabledFeatures(userId);
    const userConfig = await this.config.getUserConfig(userId);

    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      userId,
      userLevel: user.experienceLevel,
      enabledFeatures,
      configuration: userConfig,
      consentRecords: this.consentManager.getUserConsents(userId),
    };
  }

  /**
   * Import user's experimental configuration
   */
  async importUserConfiguration(userId, configData) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (configData.version !== '1.0.0') {
      throw new Error(`Unsupported configuration version: ${configData.version}`);
    }

    try {
      // Set user level
      if (configData.userLevel) {
        await this.setUserLevel(userId, configData.userLevel);
      }

      // Import user configuration
      if (configData.configuration) {
        await this.config.setUserConfig(userId, configData.configuration);
      }

      // Re-enable features (with proper consent validation)
      if (configData.enabledFeatures) {
        for (const feature of configData.enabledFeatures) {
          try {
            await this.enableFeature(feature, userId, {
              skipConsent: false, // Always require fresh consent
              importMode: true,
            });
          } catch (error) {
            this.logger.warn(
              `[ExperimentalFeaturesManager] Failed to import feature ${feature}:`,
              error.message,
            );
          }
        }
      }

      this.logger.info(`[ExperimentalFeaturesManager] Imported configuration for user ${userId}`);
      return { success: true };
    } catch (error) {
      this.logger.error('[ExperimentalFeaturesManager] Configuration import failed:', error);
      throw error;
    }
  }

  /**
   * Get features affected by a specific flag
   */
  getFeaturesByFlag(flagName) {
    const affectedFeatures = [];

    for (const [featureName, config] of Object.entries(FeatureClassification.EXPERIMENTAL_AGENTS)) {
      if (config.enablementFlags && config.enablementFlags.includes(flagName)) {
        affectedFeatures.push(featureName);
      }
    }

    return affectedFeatures;
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup() {
    if (!this.initialized) {
      return;
    }

    this.logger.info('[ExperimentalFeaturesManager] Starting cleanup...');

    // Cleanup components
    await this.performanceMonitor.cleanup();
    await this.gracefulDegradation.cleanup();
    this.visibilityManager.cleanup();

    this.initialized = false;
    this.logger.info('[ExperimentalFeaturesManager] Cleanup completed');
  }
}
