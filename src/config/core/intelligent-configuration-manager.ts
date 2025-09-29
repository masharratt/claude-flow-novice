/**
 * Intelligent Configuration Manager
 *
 * Central orchestrator for the intelligent configuration system,
 * integrating AI detection, progressive disclosure, storage, and migration.
 */

import { EventEmitter } from 'events';
import { ProjectDetectionEngine, ProjectAnalysis } from '../ai/project-detection-engine.js';
import { DecisionTreeGenerator, UserContext } from '../ai/decision-tree-generator.js';
import {
  MultiTierStorageManager,
  StorageConfiguration,
  StorageTier,
} from '../storage/multi-tier-storage.js';
import {
  ProgressiveDisclosureEngine,
  ProgressiveUIConfig,
  ConfigurationMode,
} from '../ui/progressive-disclosure-engine.js';
import { VersionMigrationEngine } from '../migration/version-migration-engine.js';

export interface ConfigurationManagerOptions {
  projectPath?: string;
  userId?: string;
  organizationId?: string;
  storage?: StorageConfiguration;
  ui?: ProgressiveUIConfig;
  ai?: AIConfiguration;
  hooks?: HooksConfiguration;
}

export interface AIConfiguration {
  enabled: boolean;
  autoSetup: boolean;
  confidenceThreshold: number;
  learningEnabled: boolean;
  modelPath?: string;
}

export interface HooksConfiguration {
  enabled: boolean;
  preConfigLoad: boolean;
  postConfigSave: boolean;
  configMigration: boolean;
  configValidation: boolean;
}

export interface ConfigurationContext {
  projectPath: string;
  userId?: string;
  organizationId?: string;
  sessionId: string;
  environment: 'development' | 'production' | 'testing';
  timestamp: Date;
}

export interface ConfigurationSetupResult {
  success: boolean;
  configuration: any;
  detectedProject: ProjectAnalysis;
  confidence: number;
  warnings: string[];
  recommendations: string[];
  nextSteps: string[];
}

export interface ConfigurationUpdateResult {
  success: boolean;
  configuration: any;
  changes: ConfigurationChange[];
  warnings: string[];
  validationErrors: string[];
  migrationRequired: boolean;
}

export interface ConfigurationChange {
  path: string;
  type: 'added' | 'modified' | 'removed';
  oldValue?: any;
  newValue?: any;
  reason: string;
  timestamp: Date;
}

/**
 * Central configuration manager with AI-driven intelligence
 */
export class IntelligentConfigurationManager extends EventEmitter {
  private detectionEngine: ProjectDetectionEngine;
  private decisionTreeGenerator: DecisionTreeGenerator;
  private storageManager: MultiTierStorageManager;
  private uiEngine: ProgressiveDisclosureEngine;
  private migrationEngine: VersionMigrationEngine;

  private context: ConfigurationContext;
  private currentConfiguration: any;
  private userContext: UserContext;
  private options: ConfigurationManagerOptions;

  constructor(options: ConfigurationManagerOptions = {}) {
    super();

    this.options = this.mergeWithDefaults(options);
    this.context = this.initializeContext(options);

    // Initialize engines
    this.detectionEngine = new ProjectDetectionEngine();
    this.decisionTreeGenerator = new DecisionTreeGenerator();
    this.migrationEngine = new VersionMigrationEngine();

    // Initialize storage with default configuration
    this.storageManager = new MultiTierStorageManager(
      this.options.storage || this.getDefaultStorageConfiguration(),
    );

    // Initialize UI engine
    this.uiEngine = new ProgressiveDisclosureEngine(
      this.options.ui || this.getDefaultUIConfiguration(),
    );

    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Initialize the configuration system
   */
  async initialize(): Promise<void> {
    this.emit('initializationStarted', { timestamp: new Date() });

    try {
      // Initialize all subsystems
      await Promise.all([
        this.initializeUserContext(),
        this.setupHooksIntegration(),
        this.loadExistingConfiguration(),
        this.initializeAIServices(),
      ]);

      // Check if auto-setup is needed
      if (!this.currentConfiguration && this.options.ai?.autoSetup) {
        await this.performAutoSetup();
      }

      // Validate current configuration
      if (this.currentConfiguration) {
        await this.validateAndMigrate();
      }

      this.emit('initializationCompleted', {
        hasConfiguration: !!this.currentConfiguration,
        timestamp: new Date(),
      });
    } catch (error) {
      this.emit('initializationFailed', {
        error: error.message,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Perform AI-driven automatic setup
   */
  async performAutoSetup(): Promise<ConfigurationSetupResult> {
    this.emit('autoSetupStarted', { timestamp: new Date() });

    try {
      // Analyze the project
      const projectAnalysis = await this.detectionEngine.analyzeProject(this.context.projectPath);

      this.emit('projectAnalysisCompleted', {
        projectType: projectAnalysis.type,
        confidence: projectAnalysis.confidence,
        timestamp: new Date(),
      });

      // Generate decision tree
      const decisionTree = await this.decisionTreeGenerator.generateDecisionTree(
        projectAnalysis,
        this.userContext,
      );

      // Execute decision tree to generate configuration
      const generatedConfig = await this.decisionTreeGenerator.executeDecisionTree(
        decisionTree,
        projectAnalysis,
        this.userContext,
      );

      // Enhance with metadata
      const configuration = {
        ...generatedConfig,
        metadata: {
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          autoGenerated: true,
          userModified: [],
          projectAnalysis: {
            type: projectAnalysis.type,
            language: projectAnalysis.language,
            framework: projectAnalysis.framework,
            complexity: projectAnalysis.complexity,
            confidence: projectAnalysis.confidence,
          },
        },
      };

      // Save configuration
      const saveResult = await this.storageManager.save(configuration, ['local', 'project']);

      if (saveResult.success) {
        this.currentConfiguration = configuration;

        // Generate recommendations
        const recommendations = await this.generateRecommendations(projectAnalysis, configuration);

        const result: ConfigurationSetupResult = {
          success: true,
          configuration,
          detectedProject: projectAnalysis,
          confidence: projectAnalysis.confidence,
          warnings: this.extractWarnings(saveResult),
          recommendations,
          nextSteps: this.generateNextSteps(projectAnalysis, configuration),
        };

        this.emit('autoSetupCompleted', {
          projectType: projectAnalysis.type,
          confidence: projectAnalysis.confidence,
          timestamp: new Date(),
        });

        return result;
      } else {
        throw new Error('Failed to save generated configuration');
      }
    } catch (error) {
      this.emit('autoSetupFailed', {
        error: error.message,
        timestamp: new Date(),
      });

      return {
        success: false,
        configuration: null,
        detectedProject: null as any,
        confidence: 0,
        warnings: [error.message],
        recommendations: [],
        nextSteps: ['Configure manually using the UI'],
      };
    }
  }

  /**
   * Get current configuration with progressive filtering
   */
  async getConfiguration(level?: ConfigurationMode, tier: StorageTier = 'local'): Promise<any> {
    if (!this.currentConfiguration) {
      const loadResult = await this.storageManager.load(tier);
      this.currentConfiguration = loadResult.configuration;
    }

    if (level) {
      return this.uiEngine.filterConfigurationForLevel(this.currentConfiguration, level);
    }

    return this.currentConfiguration;
  }

  /**
   * Update configuration with validation and AI assistance
   */
  async updateConfiguration(
    updates: any,
    options: UpdateOptions = {},
  ): Promise<ConfigurationUpdateResult> {
    this.emit('configurationUpdateStarted', {
      paths: Object.keys(updates),
      timestamp: new Date(),
    });

    try {
      const currentConfig = await this.getConfiguration();

      // Merge updates with current configuration
      const updatedConfig = await this.mergeConfigurationIntelligently(
        currentConfig,
        updates,
        options,
      );

      // Validate the updated configuration
      const validationResult = await this.validateConfiguration(updatedConfig);

      if (!validationResult.valid && !options.force) {
        return {
          success: false,
          configuration: currentConfig,
          changes: [],
          warnings: validationResult.warnings.map((w) => w.message),
          validationErrors: validationResult.errors.map((e) => e.message),
          migrationRequired: false,
        };
      }

      // Check if migration is needed
      const migrationRequired = this.checkMigrationRequired(currentConfig, updatedConfig);

      // Save updated configuration
      const saveResult = await this.storageManager.save(updatedConfig, options.tiers || ['local']);

      if (saveResult.success) {
        // Detect changes
        const changes = this.detectConfigurationChanges(currentConfig, updatedConfig);

        // Update current configuration
        this.currentConfiguration = updatedConfig;

        // Update metadata
        this.currentConfiguration.metadata = {
          ...this.currentConfiguration.metadata,
          lastModified: new Date().toISOString(),
          userModified: [
            ...(this.currentConfiguration.metadata.userModified || []),
            ...Object.keys(updates),
          ].filter((value, index, self) => self.indexOf(value) === index),
        };

        // Provide AI-driven suggestions
        const suggestions = await this.generateConfigurationSuggestions(updatedConfig, changes);

        const result: ConfigurationUpdateResult = {
          success: true,
          configuration: updatedConfig,
          changes,
          warnings: [
            ...validationResult.warnings.map((w) => w.message),
            ...this.extractWarnings(saveResult),
            ...suggestions,
          ],
          validationErrors: [],
          migrationRequired,
        };

        this.emit('configurationUpdated', {
          changes: changes.length,
          migrationRequired,
          timestamp: new Date(),
        });

        return result;
      } else {
        throw new Error('Failed to save configuration updates');
      }
    } catch (error) {
      this.emit('configurationUpdateFailed', {
        error: error.message,
        timestamp: new Date(),
      });

      return {
        success: false,
        configuration: this.currentConfiguration,
        changes: [],
        warnings: [error.message],
        validationErrors: [],
        migrationRequired: false,
      };
    }
  }

  /**
   * Get configuration UI structure for current level
   */
  async getConfigurationUI(): Promise<any> {
    return this.uiEngine.getCurrentUI();
  }

  /**
   * Change configuration level with smooth transition
   */
  async setConfigurationLevel(level: ConfigurationMode, smooth: boolean = true): Promise<void> {
    await this.uiEngine.setConfigurationLevel(level, smooth);

    this.emit('levelChanged', {
      level,
      timestamp: new Date(),
    });
  }

  /**
   * Get AI-powered suggestions for improvement
   */
  async getSuggestions(): Promise<ConfigurationSuggestion[]> {
    if (!this.currentConfiguration) {
      return [];
    }

    const projectAnalysis = this.currentConfiguration.metadata?.projectAnalysis;
    if (!projectAnalysis) {
      return [];
    }

    return this.generateConfigurationSuggestions(this.currentConfiguration);
  }

  /**
   * Export configuration for sharing or backup
   */
  async exportConfiguration(
    format: 'json' | 'yaml' | 'toml' = 'json',
    includeMetadata: boolean = false,
  ): Promise<string> {
    const config = includeMetadata
      ? this.currentConfiguration
      : this.stripMetadata(this.currentConfiguration);

    switch (format) {
      case 'yaml':
        const yaml = await import('yaml');
        return yaml.stringify(config);
      case 'toml':
        const toml = await import('@iarna/toml');
        return toml.stringify(config);
      default:
        return JSON.stringify(config, null, 2);
    }
  }

  /**
   * Import configuration from external source
   */
  async importConfiguration(
    configData: string,
    format: 'json' | 'yaml' | 'toml' = 'json',
    merge: boolean = false,
  ): Promise<ConfigurationUpdateResult> {
    try {
      let importedConfig: any;

      switch (format) {
        case 'yaml':
          const yaml = await import('yaml');
          importedConfig = yaml.parse(configData);
          break;
        case 'toml':
          const toml = await import('@iarna/toml');
          importedConfig = toml.parse(configData);
          break;
        default:
          importedConfig = JSON.parse(configData);
      }

      if (merge && this.currentConfiguration) {
        return await this.updateConfiguration(importedConfig, { force: false });
      } else {
        // Replace entire configuration
        const saveResult = await this.storageManager.save(importedConfig, ['local']);

        if (saveResult.success) {
          this.currentConfiguration = importedConfig;
          return {
            success: true,
            configuration: importedConfig,
            changes: [
              {
                path: '',
                type: 'modified',
                newValue: importedConfig,
                reason: 'Configuration imported',
                timestamp: new Date(),
              },
            ],
            warnings: [],
            validationErrors: [],
            migrationRequired: false,
          };
        } else {
          throw new Error('Failed to save imported configuration');
        }
      }
    } catch (error) {
      return {
        success: false,
        configuration: this.currentConfiguration,
        changes: [],
        warnings: [error.message],
        validationErrors: [],
        migrationRequired: false,
      };
    }
  }

  /**
   * Reset configuration to defaults
   */
  async resetToDefaults(confirmCallback?: () => Promise<boolean>): Promise<boolean> {
    if (confirmCallback && !(await confirmCallback())) {
      return false;
    }

    // Create backup before reset
    if (this.currentConfiguration) {
      await this.storageManager.backup('local', 'Pre-reset backup');
    }

    // Clear current configuration
    this.currentConfiguration = null;

    // Perform auto-setup with fresh detection
    if (this.options.ai?.autoSetup) {
      await this.performAutoSetup();
    }

    this.emit('configurationReset', { timestamp: new Date() });
    return true;
  }

  // Private helper methods

  private mergeWithDefaults(options: ConfigurationManagerOptions): ConfigurationManagerOptions {
    return {
      projectPath: options.projectPath || process.cwd(),
      userId: options.userId,
      organizationId: options.organizationId,
      storage: options.storage,
      ui: options.ui,
      ai: {
        enabled: true,
        autoSetup: true,
        confidenceThreshold: 0.7,
        learningEnabled: true,
        ...options.ai,
      },
      hooks: {
        enabled: true,
        preConfigLoad: true,
        postConfigSave: true,
        configMigration: true,
        configValidation: true,
        ...options.hooks,
      },
    };
  }

  private initializeContext(options: ConfigurationManagerOptions): ConfigurationContext {
    return {
      projectPath: options.projectPath || process.cwd(),
      userId: options.userId,
      organizationId: options.organizationId,
      sessionId: `session-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      environment: (process.env.NODE_ENV as any) || 'development',
      timestamp: new Date(),
    };
  }

  private async initializeUserContext(): Promise<void> {
    // Initialize user context from stored preferences or defaults
    this.userContext = {
      experienceLevel: 'novice', // Would be determined from user history
      preferences: {
        preferredMode: 'auto',
        featurePreferences: {},
        toolPreferences: {},
        complexityTolerance: 0.5,
      },
      previousProjects: [], // Would be loaded from storage
      teamContext: this.options.organizationId
        ? {
            size: 1,
            roles: ['developer'],
            organizationPolicies: [],
            sharedTemplates: [],
          }
        : undefined,
    };
  }

  private async setupHooksIntegration(): Promise<void> {
    if (!this.options.hooks?.enabled) return;

    // Set up event listeners for hook integration
    this.on('configurationSaved', async (data) => {
      await this.executeHook('post-config-save', data);
    });

    this.on('configurationLoaded', async (data) => {
      await this.executeHook('post-config-load', data);
    });

    this.on('migrationRequired', async (data) => {
      await this.executeHook('config-migration', data);
    });
  }

  private async loadExistingConfiguration(): Promise<void> {
    try {
      const loadResult = await this.storageManager.load('local', ['project']);
      this.currentConfiguration = loadResult.configuration;

      this.emit('configurationLoaded', {
        tier: loadResult.tier,
        timestamp: new Date(),
      });
    } catch (error) {
      // No existing configuration found, which is fine
      this.currentConfiguration = null;
    }
  }

  private async initializeAIServices(): Promise<void> {
    if (this.options.ai?.enabled && this.options.ai?.learningEnabled) {
      // Initialize ML models and learning systems
      // This would load pre-trained models or initialize new ones
    }
  }

  private async performAutoSetup(): Promise<void> {
    // This method was already implemented above
  }

  private async validateAndMigrate(): Promise<void> {
    if (!this.currentConfiguration) return;

    const currentVersion = this.currentConfiguration.version || '1.0.0';
    const latestVersion = '2.0.0'; // Would be determined dynamically

    if (currentVersion !== latestVersion) {
      const validation = await this.migrationEngine.validateMigration(
        this.currentConfiguration,
        latestVersion,
      );

      if (validation.valid) {
        this.emit('migrationRequired', {
          fromVersion: currentVersion,
          toVersion: latestVersion,
          breaking: !validation.compatibility.compatible,
        });

        // Auto-migrate if non-breaking
        if (validation.compatibility.compatible) {
          const migrationResult = await this.migrationEngine.migrate(
            this.currentConfiguration,
            latestVersion,
          );

          if (migrationResult.success) {
            this.currentConfiguration = migrationResult.configuration;
            await this.storageManager.save(this.currentConfiguration, ['local']);
          }
        }
      }
    }
  }

  private getDefaultStorageConfiguration(): StorageConfiguration {
    return {
      local: {
        path: '~/.claude-flow/config.json',
        format: 'json',
        encryption: false,
        backup: true,
      },
      project: {
        enabled: true,
        path: '.claude-flow/config.json',
        format: 'json',
        versionControl: true,
        sharing: 'team',
        gitignore: false,
      },
      team: {
        enabled: false,
        provider: 'github',
        repository: '',
        branch: 'main',
        path: 'config/claude-flow.json',
        authentication: { method: 'token' },
        permissions: { read: [], write: [], admin: [], inherit: true },
        synchronization: 'manual',
        conflictResolution: 'prompt',
      },
      cloud: {
        enabled: false,
        provider: 'github',
        encryption: 'client-side',
        syncInterval: 3600,
        bandwidth: { maxUpload: 1048576, maxDownload: 1048576, throttle: false, compression: true },
        offline: { enabled: true, cacheSize: 10, syncOnConnect: true, conflictHandling: 'prompt' },
      },
      encryption: {
        enabled: false,
        algorithm: 'AES-256-GCM',
        keyDerivation: 'PBKDF2',
      },
      backup: {
        enabled: true,
        maxBackups: 10,
        retention: 30,
        compression: true,
      },
      sync: {
        enabled: false,
        interval: 3600,
        strategy: 'merge',
        conflictResolution: 'prompt',
        bandwidth: { maxUpload: 1048576, maxDownload: 1048576, throttle: false, compression: true },
        retry: { maxAttempts: 3, backoffMultiplier: 2, maxDelay: 60000 },
      },
    };
  }

  private getDefaultUIConfiguration(): ProgressiveUIConfig {
    return {
      mode: 'auto',
      userExperience: 'novice',
      projectComplexity: 'small',
      preferences: {
        theme: 'auto',
        density: 'comfortable',
        animations: true,
        soundEffects: false,
        reducedMotion: false,
        highContrast: false,
        fontSize: 'medium',
        tooltipDelay: 500,
      },
      animations: true,
      hints: true,
    };
  }

  private setupEventHandlers(): void {
    // Set up cross-system event coordination
    this.uiEngine.on('levelChanged', (data) => {
      this.emit('configurationLevelChanged', data);
    });

    this.uiEngine.on('componentUpdated', (data) => {
      this.emit('configurationValueChanged', data);
    });

    this.migrationEngine.on('migrationCompleted', (data) => {
      this.emit('configurationMigrated', data);
    });

    this.storageManager.on('configurationSynced', (data) => {
      this.emit('configurationSynced', data);
    });
  }

  // Additional helper methods would be implemented here...
  private async executeHook(hookName: string, data: any): Promise<void> {
    // Integration with the existing hook system
  }

  private async mergeConfigurationIntelligently(
    current: any,
    updates: any,
    options: UpdateOptions,
  ): Promise<any> {
    // Intelligent merging with conflict resolution
    return { ...current, ...updates };
  }

  private async validateConfiguration(config: any): Promise<any> {
    // Use the schema validator from migration engine
    return this.migrationEngine.validateMigration(config, config.version || '2.0.0');
  }

  private checkMigrationRequired(current: any, updated: any): boolean {
    return current.version !== updated.version;
  }

  private detectConfigurationChanges(current: any, updated: any): ConfigurationChange[] {
    const changes: ConfigurationChange[] = [];
    // Implementation for detecting changes
    return changes;
  }

  private async generateConfigurationSuggestions(
    config: any,
    changes?: ConfigurationChange[],
  ): Promise<string[]> {
    // AI-powered suggestions based on configuration and changes
    return [];
  }

  private async generateRecommendations(analysis: ProjectAnalysis, config: any): Promise<string[]> {
    const recommendations: string[] = [];

    // Based on project type
    switch (analysis.type) {
      case 'web-app':
        recommendations.push('Consider enabling monitoring for production deployments');
        if (!config.features?.memory?.enabled) {
          recommendations.push('Enable persistent memory to maintain context between sessions');
        }
        break;
      case 'api':
        recommendations.push('Enable performance monitoring for API endpoints');
        recommendations.push('Consider setting up team collaboration for API documentation');
        break;
    }

    // Based on complexity
    if (analysis.complexity === 'large' || analysis.complexity === 'enterprise') {
      recommendations.push('Consider upgrading to advanced mode for more control');
      recommendations.push('Enable team configuration sharing for large projects');
    }

    return recommendations;
  }

  private generateNextSteps(analysis: ProjectAnalysis, config: any): string[] {
    return [
      'Review and adjust agent configuration',
      'Explore available features and integrations',
      'Test the configuration with your project',
      'Consider upgrading to intermediate mode when ready',
    ];
  }

  private extractWarnings(saveResult: any): string[] {
    return saveResult.results?.filter((r: any) => !r.success)?.map((r: any) => r.error) || [];
  }

  private stripMetadata(config: any): any {
    const { metadata, ...configWithoutMetadata } = config;
    return configWithoutMetadata;
  }
}

// Type definitions
export interface UpdateOptions {
  tiers?: StorageTier[];
  force?: boolean;
  validateOnly?: boolean;
  backup?: boolean;
}

export interface ConfigurationSuggestion {
  type: 'optimization' | 'feature' | 'security' | 'performance';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  action: string;
}

export default IntelligentConfigurationManager;
