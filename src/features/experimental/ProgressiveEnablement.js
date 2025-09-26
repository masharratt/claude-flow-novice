/**
 * Progressive Enablement System
 * Checkpoint 1.4 - Safe Feature Rollout
 */

import { FeatureClassification } from './FeatureClassification.js';
import { ConsentManager } from './ConsentManager.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';

export class ProgressiveEnablement {
  constructor(configManager, userManager, notificationService) {
    this.configManager = configManager;
    this.userManager = userManager;
    this.notificationService = notificationService;
    this.consentManager = new ConsentManager();
    this.performanceMonitor = new PerformanceMonitor();

    this.enabledFeatures = new Set();
    this.userConsents = new Map();
    this.rollbackStack = [];
  }

  /**
   * Initialize progressive enablement system
   */
  async initialize() {
    await this.loadUserPreferences();
    await this.loadEnabledFeatures();
    await this.performanceMonitor.initialize();

    // Set up feature flag listeners
    this.configManager.on('featureFlag.changed', this.handleFeatureFlagChange.bind(this));

    // Set up performance monitoring
    this.performanceMonitor.on('performanceIssue', this.handlePerformanceIssue.bind(this));
  }

  /**
   * Check if user can enable experimental feature
   */
  async canEnableFeature(featureName, userId) {
    const user = await this.userManager.getUser(userId);
    const userLevel = user.experienceLevel || FeatureClassification.USER_LEVELS.NOVICE;

    // Check if feature exists in experimental catalog
    const agentConfig = FeatureClassification.EXPERIMENTAL_AGENTS[featureName];
    if (!agentConfig) {
      return { canEnable: false, reason: 'Feature not found in experimental catalog' };
    }

    // Check user level permissions
    const stability = FeatureClassification.STABILITY_LEVELS[agentConfig.stability.toUpperCase()];
    const canSeeFeature = FeatureClassification.canUserSeeStabilityLevel(userLevel, stability.visibility);

    if (!canSeeFeature) {
      return {
        canEnable: false,
        reason: `Feature requires ${stability.visibility} user level or higher`,
        requiredLevel: stability.visibility,
        currentLevel: userLevel
      };
    }

    // Check dependencies
    if (agentConfig.dependencies && agentConfig.dependencies.length > 0) {
      const missingDependencies = agentConfig.dependencies.filter(dep =>
        !this.enabledFeatures.has(dep)
      );

      if (missingDependencies.length > 0) {
        return {
          canEnable: false,
          reason: 'Missing required dependencies',
          missingDependencies
        };
      }
    }

    // Check if already enabled
    if (this.enabledFeatures.has(featureName)) {
      return { canEnable: false, reason: 'Feature already enabled' };
    }

    return { canEnable: true };
  }

  /**
   * Enable experimental feature with safety checks
   */
  async enableFeature(featureName, userId, options = {}) {
    const canEnable = await this.canEnableFeature(featureName, userId);

    if (!canEnable.canEnable) {
      throw new Error(`Cannot enable feature: ${canEnable.reason}`);
    }

    const agentConfig = FeatureClassification.EXPERIMENTAL_AGENTS[featureName];
    const stability = FeatureClassification.STABILITY_LEVELS[agentConfig.stability.toUpperCase()];

    // Require consent for non-stable features
    if (stability.requiresConsent) {
      const hasConsent = await this.consentManager.hasConsent(userId, featureName);

      if (!hasConsent && !options.skipConsent) {
        const consentResult = await this.requestConsent(userId, featureName, agentConfig);
        if (!consentResult.granted) {
          throw new Error('User consent required but not granted');
        }
      }
    }

    // Create rollback point
    const rollbackPoint = this.createRollbackPoint(featureName);

    try {
      // Enable feature flags
      await this.enableFeatureFlags(agentConfig.enablementFlags || []);

      // Add to enabled features
      this.enabledFeatures.add(featureName);

      // Update configuration
      await this.configManager.set(`features.experimental.${featureName}.enabled`, true);
      await this.configManager.set(`features.experimental.${featureName}.enabledAt`, new Date().toISOString());
      await this.configManager.set(`features.experimental.${featureName}.enabledBy`, userId);

      // Start performance monitoring
      await this.performanceMonitor.startMonitoring(featureName, {
        stability: agentConfig.stability,
        category: agentConfig.category
      });

      // Send notification
      await this.notificationService.send(userId, {
        type: 'feature.enabled',
        title: 'Experimental Feature Enabled',
        message: `${featureName} has been successfully enabled`,
        feature: featureName,
        warnings: agentConfig.warnings || []
      });

      // Log enablement
      console.log(`[ProgressiveEnablement] Enabled feature: ${featureName} for user: ${userId}`);

      return {
        success: true,
        feature: featureName,
        rollbackId: rollbackPoint.id,
        warnings: agentConfig.warnings || []
      };

    } catch (error) {
      // Rollback on failure
      await this.executeRollback(rollbackPoint);
      throw new Error(`Failed to enable feature ${featureName}: ${error.message}`);
    }
  }

  /**
   * Disable experimental feature
   */
  async disableFeature(featureName, userId, options = {}) {
    if (!this.enabledFeatures.has(featureName)) {
      throw new Error(`Feature ${featureName} is not currently enabled`);
    }

    const agentConfig = FeatureClassification.EXPERIMENTAL_AGENTS[featureName];

    // Check for dependent features
    const dependentFeatures = this.getDependentFeatures(featureName);
    if (dependentFeatures.length > 0 && !options.forceCascade) {
      throw new Error(`Cannot disable feature: ${dependentFeatures.join(', ')} depend on it`);
    }

    // Disable dependent features first if force cascade
    if (dependentFeatures.length > 0 && options.forceCascade) {
      for (const dependentFeature of dependentFeatures) {
        await this.disableFeature(dependentFeature, userId, { cascadeDisable: true });
      }
    }

    try {
      // Stop performance monitoring
      await this.performanceMonitor.stopMonitoring(featureName);

      // Remove from enabled features
      this.enabledFeatures.delete(featureName);

      // Disable feature flags
      await this.disableFeatureFlags(agentConfig.enablementFlags || []);

      // Update configuration
      await this.configManager.set(`features.experimental.${featureName}.enabled`, false);
      await this.configManager.set(`features.experimental.${featureName}.disabledAt`, new Date().toISOString());
      await this.configManager.set(`features.experimental.${featureName}.disabledBy`, userId);

      // Send notification
      if (!options.cascadeDisable) {
        await this.notificationService.send(userId, {
          type: 'feature.disabled',
          title: 'Experimental Feature Disabled',
          message: `${featureName} has been successfully disabled`,
          feature: featureName
        });
      }

      console.log(`[ProgressiveEnablement] Disabled feature: ${featureName} for user: ${userId}`);

      return {
        success: true,
        feature: featureName,
        cascadeDisabled: dependentFeatures
      };

    } catch (error) {
      throw new Error(`Failed to disable feature ${featureName}: ${error.message}`);
    }
  }

  /**
   * Request user consent for experimental feature
   */
  async requestConsent(userId, featureName, agentConfig) {
    const stability = FeatureClassification.STABILITY_LEVELS[agentConfig.stability.toUpperCase()];

    const consentRequest = {
      userId,
      featureName,
      title: `Enable Experimental Feature: ${featureName}`,
      description: agentConfig.description,
      stability: stability.level,
      riskLevel: stability.riskLevel,
      warnings: agentConfig.warnings || [],
      dependencies: agentConfig.dependencies || [],
      requiresAcknowledgment: true
    };

    return await this.consentManager.requestConsent(consentRequest);
  }

  /**
   * Create rollback point for safe feature enablement
   */
  createRollbackPoint(featureName) {
    const rollbackPoint = {
      id: `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      featureName,
      previousState: {
        enabledFeatures: new Set(this.enabledFeatures),
        configuration: this.configManager.getSnapshot()
      }
    };

    this.rollbackStack.push(rollbackPoint);
    return rollbackPoint;
  }

  /**
   * Execute rollback to previous state
   */
  async executeRollback(rollbackPoint) {
    try {
      // Restore enabled features
      this.enabledFeatures = rollbackPoint.previousState.enabledFeatures;

      // Restore configuration
      await this.configManager.restoreSnapshot(rollbackPoint.previousState.configuration);

      // Remove rollback point
      const index = this.rollbackStack.findIndex(rp => rp.id === rollbackPoint.id);
      if (index > -1) {
        this.rollbackStack.splice(index, 1);
      }

      console.log(`[ProgressiveEnablement] Executed rollback: ${rollbackPoint.id}`);
      return { success: true, rollbackId: rollbackPoint.id };

    } catch (error) {
      console.error(`[ProgressiveEnablement] Rollback failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get features that depend on a given feature
   */
  getDependentFeatures(featureName) {
    const dependents = [];

    for (const [agentName, config] of Object.entries(FeatureClassification.EXPERIMENTAL_AGENTS)) {
      if (config.dependencies && config.dependencies.includes(featureName)) {
        if (this.enabledFeatures.has(agentName)) {
          dependents.push(agentName);
        }
      }
    }

    return dependents;
  }

  /**
   * Enable multiple feature flags
   */
  async enableFeatureFlags(flags) {
    for (const flag of flags) {
      await this.configManager.set(`featureFlags.${flag}`, true);
    }
  }

  /**
   * Disable multiple feature flags
   */
  async disableFeatureFlags(flags) {
    for (const flag of flags) {
      await this.configManager.set(`featureFlags.${flag}`, false);
    }
  }

  /**
   * Handle feature flag changes
   */
  async handleFeatureFlagChange(flagName, value, metadata) {
    console.log(`[ProgressiveEnablement] Feature flag changed: ${flagName} = ${value}`);

    // Check if any experimental features need to be disabled
    if (!value) {
      const affectedFeatures = this.getFeaturesByFlag(flagName);
      for (const featureName of affectedFeatures) {
        if (this.enabledFeatures.has(featureName)) {
          console.warn(`[ProgressiveEnablement] Feature ${featureName} disabled due to flag ${flagName}`);
          this.enabledFeatures.delete(featureName);
        }
      }
    }
  }

  /**
   * Handle performance issues
   */
  async handlePerformanceIssue(issue) {
    console.warn(`[ProgressiveEnablement] Performance issue detected:`, issue);

    // Auto-disable features causing severe performance issues
    if (issue.severity === 'critical' && issue.feature) {
      console.warn(`[ProgressiveEnablement] Auto-disabling feature due to critical performance issue: ${issue.feature}`);

      try {
        await this.disableFeature(issue.feature, 'system', {
          reason: 'Automatic disable due to critical performance issue',
          cascadeDisable: true
        });
      } catch (error) {
        console.error(`[ProgressiveEnablement] Failed to auto-disable feature: ${error.message}`);
      }
    }
  }

  /**
   * Get features using specific flag
   */
  getFeaturesByFlag(flagName) {
    const features = [];

    for (const [agentName, config] of Object.entries(FeatureClassification.EXPERIMENTAL_AGENTS)) {
      if (config.enablementFlags && config.enablementFlags.includes(flagName)) {
        features.push(agentName);
      }
    }

    return features;
  }

  /**
   * Get current status of all experimental features
   */
  getStatus() {
    return {
      enabledFeatures: Array.from(this.enabledFeatures),
      totalExperimentalFeatures: Object.keys(FeatureClassification.EXPERIMENTAL_AGENTS).length,
      rollbackPointsAvailable: this.rollbackStack.length,
      performanceMetrics: this.performanceMonitor.getMetrics()
    };
  }

  /**
   * Load user preferences
   */
  async loadUserPreferences() {
    // Implementation would load from user configuration
    console.log('[ProgressiveEnablement] Loading user preferences...');
  }

  /**
   * Load currently enabled features
   */
  async loadEnabledFeatures() {
    const features = await this.configManager.get('features.experimental', {});

    for (const [featureName, config] of Object.entries(features)) {
      if (config.enabled) {
        this.enabledFeatures.add(featureName);
      }
    }

    console.log(`[ProgressiveEnablement] Loaded ${this.enabledFeatures.size} enabled experimental features`);
  }
}