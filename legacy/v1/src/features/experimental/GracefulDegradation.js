/**
 * Graceful Degradation System
 * Checkpoint 1.4 - Fallback Mechanisms for Disabled Experimental Features
 */

import { FeatureClassification } from './FeatureClassification.js';

export class GracefulDegradation {
  constructor(configManager, logger) {
    this.configManager = configManager;
    this.logger = logger;
    this.fallbackStrategies = this.initializeFallbackStrategies();
    this.degradationLevel = 'none';
    this.disabledFeatures = new Set();
    this.fallbackMappings = new Map();
  }

  /**
   * Initialize fallback strategies for experimental features
   */
  initializeFallbackStrategies() {
    return {
      // Consensus and Distributed Systems Fallbacks
      'consensus-builder': {
        fallbackAgent: 'coordinator',
        fallbackMethod: 'simple-coordination',
        capabilities: ['basic-coordination', 'task-distribution'],
        limitations: ['No Byzantine fault tolerance', 'Limited to simple consensus'],
        degradationImpact: 'medium',
        message: 'Using basic coordination instead of advanced consensus mechanisms',
      },

      'byzantine-coordinator': {
        fallbackAgent: 'coordinator',
        fallbackMethod: 'majority-vote',
        capabilities: ['simple-voting', 'basic-fault-tolerance'],
        limitations: ['No Byzantine fault tolerance', 'Assumes honest majority'],
        degradationImpact: 'high',
        message: 'Byzantine fault tolerance disabled, using simple majority voting',
      },

      'raft-manager': {
        fallbackAgent: 'coordinator',
        fallbackMethod: 'leader-election',
        capabilities: ['basic-leader-election', 'simple-replication'],
        limitations: ['Less robust leader election', 'Basic replication only'],
        degradationImpact: 'medium',
        message: 'Using basic leader election instead of Raft consensus',
      },

      'gossip-coordinator': {
        fallbackAgent: 'coordinator',
        fallbackMethod: 'broadcast',
        capabilities: ['simple-broadcast', 'basic-messaging'],
        limitations: ['No epidemic protocols', 'Higher network overhead'],
        degradationImpact: 'low',
        message: 'Using broadcast communication instead of gossip protocol',
      },

      'crdt-synchronizer': {
        fallbackAgent: 'coordinator',
        fallbackMethod: 'last-write-wins',
        capabilities: ['basic-synchronization', 'conflict-detection'],
        limitations: ['Data conflicts may occur', 'No automatic resolution'],
        degradationImpact: 'high',
        message: 'Using last-write-wins instead of CRDT synchronization',
      },

      'quorum-manager': {
        fallbackAgent: 'coordinator',
        fallbackMethod: 'simple-majority',
        capabilities: ['majority-voting', 'basic-consensus'],
        limitations: ['Less flexible than quorum-based decisions', 'Fixed majority requirement'],
        degradationImpact: 'medium',
        message: 'Using simple majority instead of configurable quorum',
      },

      'security-manager': {
        fallbackAgent: 'coordinator',
        fallbackMethod: 'basic-auth',
        capabilities: ['basic-authentication', 'simple-authorization'],
        limitations: ['Reduced security features', 'Basic access control only'],
        degradationImpact: 'high',
        message: 'Using basic security instead of advanced security manager',
      },

      // Neural and AI Fallbacks
      'temporal-advantage': {
        fallbackAgent: 'coordinator',
        fallbackMethod: 'standard-scheduling',
        capabilities: ['basic-task-scheduling', 'simple-optimization'],
        limitations: ['No temporal processing', 'Standard time-based scheduling only'],
        degradationImpact: 'high',
        message: 'Using standard scheduling without temporal optimization',
      },

      'consciousness-evolution': {
        fallbackAgent: 'researcher',
        fallbackMethod: 'pattern-analysis',
        capabilities: ['basic-pattern-recognition', 'simple-analysis'],
        limitations: ['No consciousness modeling', 'Basic pattern matching only'],
        degradationImpact: 'high',
        message: 'Using basic pattern analysis instead of consciousness evolution',
      },

      'psycho-symbolic': {
        fallbackAgent: 'analyst',
        fallbackMethod: 'symbolic-processing',
        capabilities: ['symbolic-reasoning', 'basic-psychology'],
        limitations: ['No advanced psychological models', 'Basic symbolic processing'],
        degradationImpact: 'medium',
        message: 'Using basic symbolic processing without psychological modeling',
      },

      'safla-neural': {
        fallbackAgent: 'optimizer',
        fallbackMethod: 'standard-optimization',
        capabilities: ['basic-optimization', 'performance-tuning'],
        limitations: ['No self-aware feedback loops', 'Standard optimization only'],
        degradationImpact: 'high',
        message: 'Using standard optimization without self-aware neural feedback',
      },

      // Performance and Math Fallbacks
      'phi-calculator': {
        fallbackAgent: 'optimizer',
        fallbackMethod: 'standard-math',
        capabilities: ['basic-calculations', 'standard-math'],
        limitations: ['No advanced phi calculations', 'Standard mathematical functions'],
        degradationImpact: 'medium',
        message: 'Using standard mathematical functions instead of phi calculator',
      },

      'nanosecond-scheduler': {
        fallbackAgent: 'coordinator',
        fallbackMethod: 'millisecond-scheduling',
        capabilities: ['millisecond-precision', 'standard-scheduling'],
        limitations: ['Reduced timing precision', 'Millisecond instead of nanosecond precision'],
        degradationImpact: 'medium',
        message: 'Using millisecond precision instead of nanosecond scheduling',
      },

      'matrix-solver': {
        fallbackAgent: 'optimizer',
        fallbackMethod: 'basic-algebra',
        capabilities: ['basic-linear-algebra', 'simple-matrices'],
        limitations: ['Limited matrix operations', 'No advanced solving algorithms'],
        degradationImpact: 'medium',
        message: 'Using basic linear algebra instead of advanced matrix solver',
      },

      pagerank: {
        fallbackAgent: 'analyst',
        fallbackMethod: 'simple-ranking',
        capabilities: ['basic-sorting', 'simple-scoring'],
        limitations: ['No graph-based ranking', 'Simple scoring algorithms only'],
        degradationImpact: 'low',
        message: 'Using simple ranking instead of PageRank algorithm',
      },
    };
  }

  /**
   * Handle experimental feature becoming unavailable
   */
  async handleFeatureUnavailable(featureName, reason = 'disabled') {
    this.logger.warn(`[GracefulDegradation] Feature unavailable: ${featureName} (${reason})`);

    const fallbackStrategy = this.fallbackStrategies[featureName];
    if (!fallbackStrategy) {
      return this.handleNoFallbackAvailable(featureName, reason);
    }

    // Mark feature as disabled
    this.disabledFeatures.add(featureName);

    // Implement fallback
    const fallbackResult = await this.implementFallback(featureName, fallbackStrategy, reason);

    // Update degradation level
    this.updateDegradationLevel(fallbackStrategy.degradationImpact);

    // Store fallback mapping
    this.fallbackMappings.set(featureName, {
      fallbackAgent: fallbackStrategy.fallbackAgent,
      fallbackMethod: fallbackStrategy.fallbackMethod,
      implementedAt: new Date().toISOString(),
      reason,
      degradationImpact: fallbackStrategy.degradationImpact,
    });

    // Log the degradation
    this.logDegradation(featureName, fallbackStrategy, reason);

    return fallbackResult;
  }

  /**
   * Implement fallback strategy for disabled feature
   */
  async implementFallback(featureName, fallbackStrategy, reason) {
    try {
      // Create fallback configuration
      const fallbackConfig = {
        originalFeature: featureName,
        fallbackAgent: fallbackStrategy.fallbackAgent,
        fallbackMethod: fallbackStrategy.fallbackMethod,
        capabilities: fallbackStrategy.capabilities,
        limitations: fallbackStrategy.limitations,
        message: fallbackStrategy.message,
      };

      // Configure the fallback agent
      await this.configureFallbackAgent(fallbackConfig);

      // Update system configuration to use fallback
      await this.updateSystemConfiguration(featureName, fallbackConfig);

      // Notify users about the degradation
      await this.notifyUserOfDegradation(featureName, fallbackStrategy);

      this.logger.info(
        `[GracefulDegradation] Implemented fallback for ${featureName}: ${fallbackStrategy.fallbackAgent}`,
      );

      return {
        success: true,
        originalFeature: featureName,
        fallbackAgent: fallbackStrategy.fallbackAgent,
        capabilities: fallbackStrategy.capabilities,
        limitations: fallbackStrategy.limitations,
        degradationLevel: this.degradationLevel,
      };
    } catch (error) {
      this.logger.error(
        `[GracefulDegradation] Failed to implement fallback for ${featureName}:`,
        error,
      );
      return this.handleFallbackFailure(featureName, fallbackStrategy, error);
    }
  }

  /**
   * Configure fallback agent with appropriate settings
   */
  async configureFallbackAgent(fallbackConfig) {
    const agentConfig = {
      name: `${fallbackConfig.fallbackAgent}-fallback-${fallbackConfig.originalFeature}`,
      type: fallbackConfig.fallbackAgent,
      mode: 'fallback',
      originalFeature: fallbackConfig.originalFeature,
      capabilities: fallbackConfig.capabilities,
      limitations: fallbackConfig.limitations,
      fallbackMethod: fallbackConfig.fallbackMethod,
      metadata: {
        isFallback: true,
        degradationMode: true,
        limitedCapabilities: true,
      },
    };

    // Store agent configuration
    await this.configManager.set(`agents.fallback.${fallbackConfig.originalFeature}`, agentConfig);

    return agentConfig;
  }

  /**
   * Update system configuration to use fallback
   */
  async updateSystemConfiguration(featureName, fallbackConfig) {
    // Update routing to use fallback agent
    await this.configManager.set(`routing.${featureName}`, {
      target: fallbackConfig.fallbackAgent,
      method: fallbackConfig.fallbackMethod,
      mode: 'fallback',
      originalFeature: featureName,
    });

    // Update feature flags
    await this.configManager.set(`degradation.${featureName}`, {
      enabled: true,
      fallbackAgent: fallbackConfig.fallbackAgent,
      implementedAt: new Date().toISOString(),
      capabilities: fallbackConfig.capabilities,
      limitations: fallbackConfig.limitations,
    });
  }

  /**
   * Notify users about the degradation
   */
  async notifyUserOfDegradation(featureName, fallbackStrategy) {
    const notification = {
      type: 'degradation',
      severity: this.getDegradationSeverity(fallbackStrategy.degradationImpact),
      title: 'Feature Degradation Notice',
      message: fallbackStrategy.message,
      details: {
        disabledFeature: featureName,
        fallbackAgent: fallbackStrategy.fallbackAgent,
        capabilities: fallbackStrategy.capabilities,
        limitations: fallbackStrategy.limitations,
        impact: fallbackStrategy.degradationImpact,
      },
      actions: [
        {
          label: 'View Details',
          action: 'show-degradation-details',
          feature: featureName,
        },
        {
          label: 'Enable Feature',
          action: 'enable-experimental-feature',
          feature: featureName,
          condition: 'user-has-permission',
        },
      ],
      timestamp: new Date().toISOString(),
    };

    // This would integrate with the notification system
    console.log('[GracefulDegradation] User notification:', notification);
  }

  /**
   * Handle case where no fallback is available
   */
  async handleNoFallbackAvailable(featureName, reason) {
    this.logger.error(`[GracefulDegradation] No fallback available for: ${featureName}`);

    // Mark as completely unavailable
    this.disabledFeatures.add(featureName);

    // Update configuration to disable feature completely
    await this.configManager.set(`features.${featureName}.available`, false);
    await this.configManager.set(`features.${featureName}.disabledReason`, reason);

    // Notify about complete unavailability
    const notification = {
      type: 'feature-unavailable',
      severity: 'high',
      title: 'Feature Unavailable',
      message: `${featureName} is currently unavailable and no fallback exists`,
      feature: featureName,
      reason,
      timestamp: new Date().toISOString(),
    };

    console.warn('[GracefulDegradation] Feature completely unavailable:', notification);

    return {
      success: false,
      feature: featureName,
      reason: 'no-fallback-available',
      message: `${featureName} is unavailable with no fallback option`,
    };
  }

  /**
   * Handle fallback implementation failure
   */
  async handleFallbackFailure(featureName, fallbackStrategy, error) {
    this.logger.error(
      `[GracefulDegradation] Fallback implementation failed: ${featureName}`,
      error,
    );

    // Mark as failed fallback
    await this.configManager.set(`degradation.${featureName}.failed`, true);
    await this.configManager.set(`degradation.${featureName}.error`, error.message);

    // Try emergency fallback (most basic functionality)
    const emergencyFallback = await this.implementEmergencyFallback(featureName);

    return {
      success: false,
      feature: featureName,
      reason: 'fallback-failed',
      error: error.message,
      emergencyFallback,
    };
  }

  /**
   * Implement emergency fallback (most basic functionality)
   */
  async implementEmergencyFallback(featureName) {
    const basicAgent = 'coordinator'; // Most basic agent that should always be available

    const emergencyConfig = {
      agent: basicAgent,
      method: 'basic-operation',
      capabilities: ['basic-coordination'],
      limitations: ['Extremely limited functionality', 'Emergency mode only'],
      message: `${featureName} is in emergency mode with minimal functionality`,
    };

    await this.configManager.set(`emergency.${featureName}`, emergencyConfig);

    this.logger.info(`[GracefulDegradation] Emergency fallback implemented for: ${featureName}`);

    return emergencyConfig;
  }

  /**
   * Update system degradation level
   */
  updateDegradationLevel(newImpact) {
    const impactLevels = { low: 1, medium: 2, high: 3 };
    const currentLevel =
      this.degradationLevel === 'none' ? 0 : impactLevels[this.degradationLevel] || 0;
    const newLevel = impactLevels[newImpact] || 0;

    if (newLevel > currentLevel) {
      const levels = ['none', 'low', 'medium', 'high'];
      this.degradationLevel = levels[newLevel] || 'high';

      this.logger.warn(
        `[GracefulDegradation] System degradation level increased to: ${this.degradationLevel}`,
      );
    }
  }

  /**
   * Get degradation severity for notifications
   */
  getDegradationSeverity(impact) {
    const severityMap = {
      low: 'info',
      medium: 'warning',
      high: 'error',
    };
    return severityMap[impact] || 'warning';
  }

  /**
   * Log degradation event
   */
  logDegradation(featureName, fallbackStrategy, reason) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'feature-degradation',
      feature: featureName,
      reason,
      fallback: {
        agent: fallbackStrategy.fallbackAgent,
        method: fallbackStrategy.fallbackMethod,
        impact: fallbackStrategy.degradationImpact,
      },
      systemDegradationLevel: this.degradationLevel,
      totalDisabledFeatures: this.disabledFeatures.size,
    };

    this.logger.warn('[GracefulDegradation] Degradation event:', logEntry);
  }

  /**
   * Restore feature from degradation
   */
  async restoreFeature(featureName) {
    if (!this.disabledFeatures.has(featureName)) {
      return { success: false, reason: 'Feature not in degraded state' };
    }

    try {
      // Remove from disabled features
      this.disabledFeatures.delete(featureName);

      // Remove fallback mapping
      this.fallbackMappings.delete(featureName);

      // Clear degradation configuration
      await this.configManager.delete(`degradation.${featureName}`);
      await this.configManager.delete(`routing.${featureName}`);
      await this.configManager.delete(`agents.fallback.${featureName}`);
      await this.configManager.delete(`emergency.${featureName}`);

      // Update degradation level
      this.recalculateDegradationLevel();

      this.logger.info(`[GracefulDegradation] Restored feature: ${featureName}`);

      return {
        success: true,
        feature: featureName,
        restoredAt: new Date().toISOString(),
        newDegradationLevel: this.degradationLevel,
      };
    } catch (error) {
      this.logger.error(`[GracefulDegradation] Failed to restore feature ${featureName}:`, error);
      return {
        success: false,
        feature: featureName,
        reason: 'restoration-failed',
        error: error.message,
      };
    }
  }

  /**
   * Recalculate system degradation level
   */
  recalculateDegradationLevel() {
    if (this.fallbackMappings.size === 0) {
      this.degradationLevel = 'none';
      return;
    }

    let maxImpact = 0;
    const impactLevels = { low: 1, medium: 2, high: 3 };

    for (const mapping of this.fallbackMappings.values()) {
      const impact = impactLevels[mapping.degradationImpact] || 0;
      if (impact > maxImpact) {
        maxImpact = impact;
      }
    }

    const levels = ['none', 'low', 'medium', 'high'];
    this.degradationLevel = levels[maxImpact] || 'none';
  }

  /**
   * Get system degradation status
   */
  getDegradationStatus() {
    return {
      degradationLevel: this.degradationLevel,
      disabledFeatures: Array.from(this.disabledFeatures),
      activeFallbacks: this.getActiveFallbacks(),
      impactAssessment: this.getImpactAssessment(),
      recommendedActions: this.getRecommendedActions(),
    };
  }

  /**
   * Get active fallbacks
   */
  getActiveFallbacks() {
    const fallbacks = [];

    for (const [feature, mapping] of this.fallbackMappings.entries()) {
      fallbacks.push({
        originalFeature: feature,
        fallbackAgent: mapping.fallbackAgent,
        fallbackMethod: mapping.fallbackMethod,
        implementedAt: mapping.implementedAt,
        reason: mapping.reason,
        degradationImpact: mapping.degradationImpact,
      });
    }

    return fallbacks;
  }

  /**
   * Get impact assessment
   */
  getImpactAssessment() {
    const assessment = {
      overallImpact: this.degradationLevel,
      affectedCapabilities: [],
      performanceImpact: 'low',
      functionalityImpact: 'low',
      userExperienceImpact: 'low',
    };

    // Analyze impact based on disabled features
    for (const feature of this.disabledFeatures) {
      const fallbackStrategy = this.fallbackStrategies[feature];
      if (fallbackStrategy) {
        assessment.affectedCapabilities.push(...fallbackStrategy.limitations);

        // Assess impact levels
        if (fallbackStrategy.degradationImpact === 'high') {
          assessment.performanceImpact = 'high';
          assessment.functionalityImpact = 'high';
          assessment.userExperienceImpact = 'medium';
        }
      }
    }

    return assessment;
  }

  /**
   * Get recommended actions for current degradation state
   */
  getRecommendedActions() {
    const actions = [];

    if (this.degradationLevel === 'high') {
      actions.push({
        priority: 'high',
        action: 'restore-critical-features',
        message: 'System is in high degradation state. Restore critical experimental features.',
        features: Array.from(this.disabledFeatures).slice(0, 3),
      });
    }

    if (this.disabledFeatures.size > 5) {
      actions.push({
        priority: 'medium',
        action: 'review-feature-usage',
        message: 'Multiple features are degraded. Review which features are essential.',
        count: this.disabledFeatures.size,
      });
    }

    if (this.degradationLevel !== 'none') {
      actions.push({
        priority: 'low',
        action: 'enable-experimental-features',
        message: 'Consider enabling experimental features for full functionality.',
        affectedFeatures: Array.from(this.disabledFeatures),
      });
    }

    return actions;
  }

  /**
   * Test all fallback strategies
   */
  async testFallbackStrategies() {
    const results = {};

    for (const [featureName, strategy] of Object.entries(this.fallbackStrategies)) {
      try {
        // Simulate feature unavailable
        const testResult = await this.handleFeatureUnavailable(featureName, 'test');

        // Restore immediately
        await this.restoreFeature(featureName);

        results[featureName] = {
          success: testResult.success,
          fallbackAgent: strategy.fallbackAgent,
          tested: true,
        };
      } catch (error) {
        results[featureName] = {
          success: false,
          error: error.message,
          tested: true,
        };
      }
    }

    return results;
  }

  /**
   * Cleanup degradation system
   */
  async cleanup() {
    // Restore all degraded features
    for (const featureName of this.disabledFeatures) {
      try {
        await this.restoreFeature(featureName);
      } catch (error) {
        this.logger.error(`[GracefulDegradation] Failed to cleanup ${featureName}:`, error);
      }
    }

    // Clear all mappings
    this.fallbackMappings.clear();
    this.disabledFeatures.clear();
    this.degradationLevel = 'none';

    this.logger.info('[GracefulDegradation] Cleanup completed');
  }
}
