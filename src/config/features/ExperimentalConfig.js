/**
 * Experimental Features Configuration Integration
 * Checkpoint 1.4 - Unified Configuration System
 */

import { FeatureClassification } from '../features/experimental/FeatureClassification.js';

export class ExperimentalConfig {
  constructor(configManager) {
    this.configManager = configManager;
    this.featureFlags = new Map();
    this.userProfiles = new Map();
    this.defaultSettings = this.getDefaultSettings();
  }

  /**
   * Get default experimental feature settings
   */
  getDefaultSettings() {
    return {
      // Global experimental features settings
      experimental: {
        enabled: false,
        userLevel: FeatureClassification.USER_LEVELS.NOVICE,
        autoEnableStable: true,
        showWarnings: true,
        requireConsent: true,
        enableTelemetry: true,
        maxConcurrentExperimental: 3,
      },

      // Feature flags for different categories
      featureFlags: {
        // Consensus and distributed systems
        'experimental.consensus.enabled': false,
        'experimental.byzantine.enabled': false,
        'experimental.raft.enabled': false,
        'experimental.gossip.enabled': false,

        // Data synchronization
        'experimental.data.crdt.enabled': false,

        // Security features
        'experimental.security.advanced.enabled': false,

        // Neural and AI features (research level)
        'experimental.neural.temporal.enabled': false,
        'experimental.neural.consciousness.enabled': false,
        'experimental.neural.psycho.enabled': false,
        'experimental.neural.safla.enabled': false,
        'research.ai.enabled': false,

        // Performance and optimization
        'experimental.performance.precision.enabled': false,
        'experimental.math.advanced.enabled': false,
        'experimental.math.matrix.enabled': false,
        'experimental.analysis.graph.enabled': false,
      },

      // Per-feature configurations
      features: {
        experimental: {
          // Consensus features
          'consensus-builder': {
            enabled: false,
            stability: 'alpha',
            maxInstances: 1,
            resourceLimits: { cpu: 50, memory: 256 },
          },
          'byzantine-coordinator': {
            enabled: false,
            stability: 'alpha',
            maxInstances: 1,
            resourceLimits: { cpu: 40, memory: 128 },
          },
          'raft-manager': {
            enabled: false,
            stability: 'beta',
            maxInstances: 1,
            resourceLimits: { cpu: 30, memory: 128 },
          },
          'gossip-coordinator': {
            enabled: false,
            stability: 'beta',
            maxInstances: 1,
            resourceLimits: { cpu: 25, memory: 96 },
          },
          'crdt-synchronizer': {
            enabled: false,
            stability: 'alpha',
            maxInstances: 1,
            resourceLimits: { cpu: 35, memory: 200 },
          },
          'quorum-manager': {
            enabled: false,
            stability: 'beta',
            maxInstances: 1,
            resourceLimits: { cpu: 20, memory: 64 },
          },
          'security-manager': {
            enabled: false,
            stability: 'alpha',
            maxInstances: 1,
            resourceLimits: { cpu: 30, memory: 128 },
          },

          // Neural and AI features
          'temporal-advantage': {
            enabled: false,
            stability: 'research',
            maxInstances: 1,
            resourceLimits: { cpu: 80, memory: 512 },
          },
          'consciousness-evolution': {
            enabled: false,
            stability: 'research',
            maxInstances: 1,
            resourceLimits: { cpu: 90, memory: 1024 },
          },
          'psycho-symbolic': {
            enabled: false,
            stability: 'research',
            maxInstances: 1,
            resourceLimits: { cpu: 70, memory: 512 },
          },
          'safla-neural': {
            enabled: false,
            stability: 'research',
            maxInstances: 1,
            resourceLimits: { cpu: 85, memory: 768 },
          },

          // Performance and math features
          'phi-calculator': {
            enabled: false,
            stability: 'alpha',
            maxInstances: 2,
            resourceLimits: { cpu: 60, memory: 256 },
          },
          'nanosecond-scheduler': {
            enabled: false,
            stability: 'alpha',
            maxInstances: 1,
            resourceLimits: { cpu: 40, memory: 128 },
          },
          'matrix-solver': {
            enabled: false,
            stability: 'beta',
            maxInstances: 2,
            resourceLimits: { cpu: 70, memory: 512 },
          },
          pagerank: {
            enabled: false,
            stability: 'beta',
            maxInstances: 1,
            resourceLimits: { cpu: 50, memory: 256 },
          },
        },
      },

      // Performance monitoring settings
      monitoring: {
        enabled: true,
        collectInterval: 5000,
        alertThresholds: {
          cpu: { warning: 70, critical: 85 },
          memory: { warning: 75, critical: 90 },
          responseTime: { warning: 1000, critical: 5000 },
        },
        retentionPeriod: 86400000, // 24 hours
        autoDisableOnCritical: true,
      },

      // User interface settings
      ui: {
        showExperimentalSection: false,
        enableAdvancedMode: false,
        hideWarningsAfterAcknowledge: false,
        groupByStability: true,
        showRiskIndicators: true,
      },
    };
  }

  /**
   * Initialize experimental configuration
   */
  async initialize() {
    // Load existing configuration or set defaults
    await this.loadConfiguration();

    // Set up configuration listeners
    this.setupConfigurationListeners();

    // Initialize user profiles
    await this.loadUserProfiles();

    console.log('[ExperimentalConfig] Initialized successfully');
  }

  /**
   * Load configuration from config manager
   */
  async loadConfiguration() {
    try {
      const existingConfig = await this.configManager.get('experimental', {});
      const mergedConfig = this.mergeConfigurations(this.defaultSettings, existingConfig);

      // Save merged configuration back
      await this.configManager.set('experimental', mergedConfig);

      // Load feature flags into memory
      this.loadFeatureFlags(mergedConfig.featureFlags || {});
    } catch (error) {
      console.error('[ExperimentalConfig] Failed to load configuration:', error);
      // Use defaults on failure
      await this.configManager.set('experimental', this.defaultSettings);
      this.loadFeatureFlags(this.defaultSettings.featureFlags);
    }
  }

  /**
   * Load feature flags into memory
   */
  loadFeatureFlags(flags) {
    this.featureFlags.clear();
    for (const [flag, value] of Object.entries(flags)) {
      this.featureFlags.set(flag, value);
    }
  }

  /**
   * Merge configurations with defaults
   */
  mergeConfigurations(defaults, existing) {
    const merged = { ...defaults };

    for (const [key, value] of Object.entries(existing)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        merged[key] = this.mergeConfigurations(merged[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Setup configuration change listeners
   */
  setupConfigurationListeners() {
    this.configManager.on('changed', this.handleConfigurationChange.bind(this));
  }

  /**
   * Handle configuration changes
   */
  async handleConfigurationChange(path, value, oldValue) {
    if (path.startsWith('experimental.featureFlags.')) {
      const flagName = path.replace('experimental.featureFlags.', '');
      this.featureFlags.set(flagName, value);

      console.log(`[ExperimentalConfig] Feature flag changed: ${flagName} = ${value}`);

      // Emit feature flag change event
      this.configManager.emit('featureFlag.changed', flagName, value, { oldValue });
    }
  }

  /**
   * Get user's experimental configuration
   */
  async getUserConfig(userId) {
    const globalConfig = await this.configManager.get('experimental');
    const userConfig = await this.configManager.get(`users.${userId}.experimental`, {});

    return this.mergeConfigurations(globalConfig, userConfig);
  }

  /**
   * Set user's experimental configuration
   */
  async setUserConfig(userId, config) {
    await this.configManager.set(`users.${userId}.experimental`, config);
  }

  /**
   * Get user's experience level
   */
  async getUserLevel(userId) {
    const userConfig = await this.getUserConfig(userId);
    return userConfig.userLevel || FeatureClassification.USER_LEVELS.NOVICE;
  }

  /**
   * Set user's experience level
   */
  async setUserLevel(userId, level) {
    const validLevels = Object.values(FeatureClassification.USER_LEVELS);
    if (!validLevels.includes(level)) {
      throw new Error(`Invalid user level: ${level}. Valid levels: ${validLevels.join(', ')}`);
    }

    await this.configManager.set(`users.${userId}.experimental.userLevel`, level);
    console.log(`[ExperimentalConfig] Set user level for ${userId}: ${level}`);
  }

  /**
   * Get feature flag value
   */
  getFeatureFlag(flagName) {
    return this.featureFlags.get(flagName) || false;
  }

  /**
   * Set feature flag value
   */
  async setFeatureFlag(flagName, value) {
    this.featureFlags.set(flagName, value);
    await this.configManager.set(`experimental.featureFlags.${flagName}`, value);
  }

  /**
   * Enable multiple feature flags
   */
  async enableFeatureFlags(flags) {
    for (const flag of flags) {
      await this.setFeatureFlag(flag, true);
    }
  }

  /**
   * Disable multiple feature flags
   */
  async disableFeatureFlags(flags) {
    for (const flag of flags) {
      await this.setFeatureFlag(flag, false);
    }
  }

  /**
   * Get enabled experimental features for user
   */
  async getEnabledFeatures(userId) {
    const userLevel = await this.getUserLevel(userId);
    const allAgents = Object.keys(FeatureClassification.EXPERIMENTAL_AGENTS);
    const enabledFlags = Array.from(this.featureFlags.entries())
      .filter(([flag, value]) => value)
      .map(([flag]) => flag);

    return FeatureClassification.getVisibleAgents(allAgents, userLevel, enabledFlags);
  }

  /**
   * Check if user can see experimental features
   */
  async canUserSeeExperimentalFeatures(userId) {
    const userConfig = await this.getUserConfig(userId);
    const userLevel = userConfig.userLevel || FeatureClassification.USER_LEVELS.NOVICE;

    // Novice users don't see experimental features unless explicitly enabled
    if (userLevel === FeatureClassification.USER_LEVELS.NOVICE) {
      return userConfig.showExperimentalFeatures === true;
    }

    return true;
  }

  /**
   * Enable experimental features for user
   */
  async enableExperimentalFeatures(userId) {
    await this.configManager.set(`users.${userId}.experimental.showExperimentalFeatures`, true);
    console.log(`[ExperimentalConfig] Enabled experimental features for user: ${userId}`);
  }

  /**
   * Disable experimental features for user
   */
  async disableExperimentalFeatures(userId) {
    await this.configManager.set(`users.${userId}.experimental.showExperimentalFeatures`, false);
    console.log(`[ExperimentalConfig] Disabled experimental features for user: ${userId}`);
  }

  /**
   * Get feature configuration
   */
  async getFeatureConfig(featureName) {
    return await this.configManager.get(`experimental.features.experimental.${featureName}`, {});
  }

  /**
   * Set feature configuration
   */
  async setFeatureConfig(featureName, config) {
    await this.configManager.set(`experimental.features.experimental.${featureName}`, config);
  }

  /**
   * Get monitoring configuration
   */
  async getMonitoringConfig() {
    return await this.configManager.get('experimental.monitoring', this.defaultSettings.monitoring);
  }

  /**
   * Set monitoring configuration
   */
  async setMonitoringConfig(config) {
    await this.configManager.set('experimental.monitoring', config);
  }

  /**
   * Get UI configuration
   */
  async getUIConfig(userId) {
    const userConfig = await this.getUserConfig(userId);
    return userConfig.ui || this.defaultSettings.ui;
  }

  /**
   * Set UI configuration
   */
  async setUIConfig(userId, config) {
    await this.configManager.set(`users.${userId}.experimental.ui`, config);
  }

  /**
   * Load user profiles
   */
  async loadUserProfiles() {
    try {
      const users = await this.configManager.get('users', {});

      for (const [userId, userConfig] of Object.entries(users)) {
        if (userConfig.experimental) {
          this.userProfiles.set(userId, userConfig.experimental);
        }
      }

      console.log(`[ExperimentalConfig] Loaded ${this.userProfiles.size} user profiles`);
    } catch (error) {
      console.error('[ExperimentalConfig] Failed to load user profiles:', error);
    }
  }

  /**
   * Get configuration summary
   */
  async getConfigSummary() {
    const summary = {
      featureFlags: {
        total: this.featureFlags.size,
        enabled: Array.from(this.featureFlags.values()).filter((v) => v).length,
      },
      experimentalFeatures: {
        total: Object.keys(FeatureClassification.EXPERIMENTAL_AGENTS).length,
        byStability: {},
      },
      users: {
        total: this.userProfiles.size,
        byLevel: {},
      },
    };

    // Count features by stability
    for (const agent of Object.values(FeatureClassification.EXPERIMENTAL_AGENTS)) {
      const stability = agent.stability;
      summary.experimentalFeatures.byStability[stability] =
        (summary.experimentalFeatures.byStability[stability] || 0) + 1;
    }

    // Count users by level
    for (const profile of this.userProfiles.values()) {
      const level = profile.userLevel || FeatureClassification.USER_LEVELS.NOVICE;
      summary.users.byLevel[level] = (summary.users.byLevel[level] || 0) + 1;
    }

    return summary;
  }

  /**
   * Reset configuration to defaults
   */
  async resetToDefaults() {
    await this.configManager.set('experimental', this.defaultSettings);
    this.loadFeatureFlags(this.defaultSettings.featureFlags);
    console.log('[ExperimentalConfig] Reset to default configuration');
  }

  /**
   * Export configuration
   */
  async exportConfiguration() {
    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      configuration: await this.configManager.get('experimental'),
      featureFlags: Object.fromEntries(this.featureFlags),
      userProfiles: Object.fromEntries(this.userProfiles),
    };
  }

  /**
   * Import configuration
   */
  async importConfiguration(configData) {
    if (configData.version !== '1.0.0') {
      throw new Error(`Unsupported configuration version: ${configData.version}`);
    }

    await this.configManager.set('experimental', configData.configuration);
    this.loadFeatureFlags(configData.featureFlags || {});

    // Load user profiles
    if (configData.userProfiles) {
      for (const [userId, profile] of Object.entries(configData.userProfiles)) {
        this.userProfiles.set(userId, profile);
        await this.configManager.set(`users.${userId}.experimental`, profile);
      }
    }

    console.log('[ExperimentalConfig] Imported configuration successfully');
  }
}
