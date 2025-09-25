/**
 * Filter Configuration System
 * Manages user preferences and project-specific overrides
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

class FilterConfiguration {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.globalConfigPath = join(require('os').homedir(), '.claude-flow', 'filter-config.json');
    this.projectConfigPath = join(projectRoot, '.claude', 'filter-config.json');
    this.settingsPath = join(projectRoot, '.claude', 'settings.json');

    this.loadConfiguration();
    this.setupWatchers();
  }

  /**
   * Load configuration from multiple sources with precedence
   */
  loadConfiguration() {
    // Default configuration
    const defaultConfig = this.getDefaultConfiguration();

    // Global user configuration
    let globalConfig = {};
    try {
      if (existsSync(this.globalConfigPath)) {
        globalConfig = JSON.parse(readFileSync(this.globalConfigPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Error loading global config:', error.message);
    }

    // Project-specific configuration
    let projectConfig = {};
    try {
      if (existsSync(this.projectConfigPath)) {
        projectConfig = JSON.parse(readFileSync(this.projectConfigPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Error loading project config:', error.message);
    }

    // Existing settings.json integration
    let settingsConfig = {};
    try {
      if (existsSync(this.settingsPath)) {
        const settings = JSON.parse(readFileSync(this.settingsPath, 'utf8'));
        settingsConfig = {
          contentFilters: settings.contentFilters || {},
          toneProcessors: settings.toneProcessors || {},
          userPreferences: settings.userPreferences || {}
        };
      }
    } catch (error) {
      console.warn('Error loading settings:', error.message);
    }

    // Merge configurations with precedence: project > settings > global > default
    this.config = this.deepMerge(
      defaultConfig,
      globalConfig,
      settingsConfig,
      projectConfig
    );

    this.validateConfiguration();
  }

  /**
   * Get default filter configuration
   */
  getDefaultConfiguration() {
    return {
      version: '1.0.0',
      contentFilters: {
        enabled: true,
        maxMdFiles: 15,
        allowedDocTypes: [
          'API',
          'README',
          'CHANGELOG',
          'GUIDE',
          'TUTORIAL',
          'SPEC',
          'ARCHITECTURE'
        ],
        blockedPatterns: [
          {
            pattern: 'IMPLEMENTATION_REPORT',
            reason: 'Implementation reports create clutter',
            severity: 'high'
          },
          {
            pattern: 'COMPLETION_SUMMARY',
            reason: 'Completion summaries are redundant',
            severity: 'medium'
          },
          {
            pattern: 'AGENT_REPORT',
            reason: 'Agent reports should be consolidated',
            severity: 'medium'
          },
          {
            pattern: 'PERFORMANCE_ANALYSIS',
            reason: 'Performance data should be in metrics files',
            severity: 'low'
          },
          {
            pattern: '^TEMP_',
            reason: 'Temporary files should not be committed',
            severity: 'high'
          },
          {
            pattern: '^WORKING_',
            reason: 'Working files should not be committed',
            severity: 'high'
          },
          {
            pattern: 'STATUS_UPDATE',
            reason: 'Status updates should be in logs',
            severity: 'medium'
          }
        ],
        rootDirectoryProtection: true,
        allowedRootFiles: [
          'README.md',
          'CHANGELOG.md',
          'LICENSE.md',
          'CONTRIBUTING.md',
          'CODE_OF_CONDUCT.md',
          'SECURITY.md'
        ],
        preferredDirectories: {
          documentation: ['docs', 'documentation', 'guides'],
          reports: ['reports', 'analysis', 'metrics'],
          temporary: ['temp', 'working', 'draft', 'scratch'],
          tests: ['test-reports', 'coverage', 'benchmarks'],
          specifications: ['specs', 'requirements', 'designs']
        },
        consolidationRules: {
          maxSimilarFiles: 3,
          similarityThreshold: 0.7,
          consolidatePatterns: [
            'report',
            'summary',
            'analysis',
            'status',
            'update'
          ]
        }
      },
      toneProcessors: {
        enabled: true,
        defaultPreset: 'professional',
        presets: {
          professional: {
            formality: 0.8,
            enthusiasm: 0.3,
            technical: 0.7,
            conciseness: 0.6
          },
          casual: {
            formality: 0.3,
            enthusiasm: 0.6,
            technical: 0.4,
            conciseness: 0.5
          },
          technical: {
            formality: 0.9,
            enthusiasm: 0.2,
            technical: 0.9,
            conciseness: 0.8
          },
          concise: {
            formality: 0.6,
            enthusiasm: 0.1,
            technical: 0.8,
            conciseness: 0.9
          },
          friendly: {
            formality: 0.4,
            enthusiasm: 0.8,
            technical: 0.5,
            conciseness: 0.4
          }
        },
        processing: {
          removeSelfCongratulatory: true,
          simplifyJargon: false,
          focusOnActionable: true,
          removeFluff: true,
          enhanceClarity: true
        },
        customPatterns: {
          'we have successfully': 'we have',
          'perfectly implemented': 'implemented',
          'flawless execution': 'execution',
          'amazing results': 'good results',
          'incredible performance': 'good performance',
          'outstanding achievement': 'achievement',
          'brilliant solution': 'solution',
          'seamlessly integrated': 'integrated'
        },
        agentSpecificTones: {
          researcher: 'technical',
          coder: 'concise',
          reviewer: 'professional',
          tester: 'professional',
          planner: 'professional',
          'backend-dev': 'technical',
          'frontend-dev': 'friendly',
          devops: 'concise',
          analyst: 'technical',
          architect: 'professional'
        }
      },
      userPreferences: {
        strictMode: false,
        allowReports: false,
        consolidateDocuments: true,
        maxDocumentLength: 5000,
        preferredTone: 'professional',
        autoSuggestAlternatives: true,
        logFilterActions: true,
        realTimeNotifications: false
      },
      hooks: {
        preDocumentGeneration: true,
        postAgentMessage: true,
        preFileWrite: true,
        realTimeFiltering: true,
        batchProcessing: true
      },
      projectTypes: {
        'web-app': {
          allowedDocTypes: ['API', 'README', 'GUIDE', 'SPEC'],
          maxMdFiles: 20,
          preferredTone: 'professional'
        },
        'library': {
          allowedDocTypes: ['API', 'README', 'CHANGELOG', 'TUTORIAL'],
          maxMdFiles: 10,
          preferredTone: 'technical'
        },
        'documentation': {
          allowedDocTypes: ['GUIDE', 'TUTORIAL', 'SPEC', 'API'],
          maxMdFiles: 50,
          preferredTone: 'friendly'
        },
        'research': {
          allowedDocTypes: ['ANALYSIS', 'REPORT', 'SPEC', 'README'],
          maxMdFiles: 30,
          preferredTone: 'technical',
          allowReports: true
        }
      }
    };
  }

  /**
   * Validate configuration structure and values
   */
  validateConfiguration() {
    const errors = [];

    // Validate content filters
    if (this.config.contentFilters) {
      if (this.config.contentFilters.maxMdFiles < 1) {
        errors.push('maxMdFiles must be at least 1');
      }

      if (!Array.isArray(this.config.contentFilters.allowedDocTypes)) {
        errors.push('allowedDocTypes must be an array');
      }

      if (!Array.isArray(this.config.contentFilters.blockedPatterns)) {
        errors.push('blockedPatterns must be an array');
      }
    }

    // Validate tone processors
    if (this.config.toneProcessors && this.config.toneProcessors.presets) {
      Object.entries(this.config.toneProcessors.presets).forEach(([name, preset]) => {
        ['formality', 'enthusiasm', 'technical', 'conciseness'].forEach(prop => {
          if (typeof preset[prop] !== 'number' || preset[prop] < 0 || preset[prop] > 1) {
            errors.push(`Preset ${name}.${prop} must be a number between 0 and 1`);
          }
        });
      });
    }

    if (errors.length > 0) {
      console.warn('Configuration validation errors:', errors);
      throw new Error(`Invalid configuration: ${errors.join(', ')}`);
    }
  }

  /**
   * Get configuration for specific context
   */
  getConfig(context = {}) {
    let config = { ...this.config };

    // Apply project type overrides
    if (context.projectType && this.config.projectTypes[context.projectType]) {
      config = this.deepMerge(config, {
        contentFilters: this.config.projectTypes[context.projectType],
        userPreferences: {
          preferredTone: this.config.projectTypes[context.projectType].preferredTone
        }
      });
    }

    // Apply agent-specific overrides
    if (context.agentType && this.config.toneProcessors.agentSpecificTones[context.agentType]) {
      config.userPreferences.preferredTone = this.config.toneProcessors.agentSpecificTones[context.agentType];
    }

    // Apply runtime overrides
    if (context.overrides) {
      config = this.deepMerge(config, context.overrides);
    }

    return config;
  }

  /**
   * Update configuration section
   */
  updateConfig(section, updates, scope = 'project') {
    if (!this.config[section]) {
      this.config[section] = {};
    }

    this.config[section] = this.deepMerge(this.config[section], updates);

    this.validateConfiguration();
    this.saveConfiguration(scope);

    return this.config[section];
  }

  /**
   * Save configuration to appropriate location
   */
  saveConfiguration(scope = 'project') {
    const configToSave = {
      version: this.config.version,
      lastUpdated: new Date().toISOString(),
      contentFilters: this.config.contentFilters,
      toneProcessors: this.config.toneProcessors,
      userPreferences: this.config.userPreferences,
      hooks: this.config.hooks
    };

    try {
      let targetPath;
      if (scope === 'global') {
        targetPath = this.globalConfigPath;
        const configDir = dirname(targetPath);
        if (!existsSync(configDir)) {
          require('fs').mkdirSync(configDir, { recursive: true });
        }
      } else {
        targetPath = this.projectConfigPath;
        const configDir = dirname(targetPath);
        if (!existsSync(configDir)) {
          require('fs').mkdirSync(configDir, { recursive: true });
        }
      }

      writeFileSync(targetPath, JSON.stringify(configToSave, null, 2));

      // Also update settings.json for backward compatibility
      if (scope === 'project') {
        this.updateSettingsJson();
      }

    } catch (error) {
      console.error('Error saving configuration:', error.message);
      throw error;
    }
  }

  /**
   * Update settings.json for backward compatibility
   */
  updateSettingsJson() {
    try {
      let settings = {};
      if (existsSync(this.settingsPath)) {
        settings = JSON.parse(readFileSync(this.settingsPath, 'utf8'));
      }

      settings.contentFilters = this.config.contentFilters;
      settings.toneProcessors = this.config.toneProcessors;
      settings.userPreferences = this.config.userPreferences;
      settings.hooks = this.config.hooks;

      const settingsDir = dirname(this.settingsPath);
      if (!existsSync(settingsDir)) {
        require('fs').mkdirSync(settingsDir, { recursive: true });
      }

      writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
    } catch (error) {
      console.warn('Error updating settings.json:', error.message);
    }
  }

  /**
   * Setup file watchers for configuration changes
   */
  setupWatchers() {
    if (typeof require !== 'undefined') {
      try {
        const fs = require('fs');

        const watchPaths = [
          this.globalConfigPath,
          this.projectConfigPath,
          this.settingsPath
        ].filter(path => existsSync(path));

        watchPaths.forEach(path => {
          fs.watchFile(path, { interval: 1000 }, () => {
            console.log(`Configuration file changed: ${path}`);
            this.loadConfiguration();
          });
        });
      } catch (error) {
        console.warn('Error setting up watchers:', error.message);
      }
    }
  }

  /**
   * Get profile-specific configuration
   */
  getProfile(profileName) {
    const profiles = this.config.profiles || {};
    return profiles[profileName] || null;
  }

  /**
   * Create or update profile
   */
  setProfile(profileName, profileConfig) {
    if (!this.config.profiles) {
      this.config.profiles = {};
    }

    this.config.profiles[profileName] = {
      ...profileConfig,
      created: new Date().toISOString()
    };

    this.saveConfiguration();
  }

  /**
   * Apply profile to current configuration
   */
  applyProfile(profileName) {
    const profile = this.getProfile(profileName);
    if (!profile) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    this.config = this.deepMerge(this.config, profile);
    this.validateConfiguration();

    return this.config;
  }

  /**
   * Detect project type automatically
   */
  detectProjectType() {
    const packageJsonPath = join(this.projectRoot, 'package.json');
    const cargoTomlPath = join(this.projectRoot, 'Cargo.toml');
    const requirementsPath = join(this.projectRoot, 'requirements.txt');
    const docsPath = join(this.projectRoot, 'docs');

    if (existsSync(docsPath) && require('fs').statSync(docsPath).isDirectory()) {
      return 'documentation';
    }

    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.main || packageJson.exports) {
          return 'library';
        }
        if (packageJson.scripts && packageJson.scripts.start) {
          return 'web-app';
        }
      } catch (error) {
        // Continue with other detection methods
      }
    }

    if (existsSync(cargoTomlPath)) {
      return 'library';
    }

    if (existsSync(requirementsPath)) {
      return 'web-app';
    }

    return 'general';
  }

  /**
   * Deep merge utility
   */
  deepMerge(...objects) {
    const isObject = obj => obj && typeof obj === 'object' && !Array.isArray(obj);

    return objects.reduce((prev, obj) => {
      Object.keys(obj || {}).forEach(key => {
        if (isObject(prev[key]) && isObject(obj[key])) {
          prev[key] = this.deepMerge(prev[key], obj[key]);
        } else {
          prev[key] = obj[key];
        }
      });
      return prev;
    }, {});
  }

  /**
   * Export current configuration
   */
  exportConfig() {
    return {
      ...this.config,
      projectRoot: this.projectRoot,
      configPaths: {
        global: this.globalConfigPath,
        project: this.projectConfigPath,
        settings: this.settingsPath
      },
      detectedProjectType: this.detectProjectType()
    };
  }

  /**
   * Reset to default configuration
   */
  reset(scope = 'project') {
    this.config = this.getDefaultConfiguration();
    this.saveConfiguration(scope);
  }

  /**
   * CLI command handlers
   */
  static createCliHandlers(filterConfig) {
    return {
      'config-get': (section) => {
        if (section) {
          return filterConfig.config[section] || null;
        }
        return filterConfig.exportConfig();
      },

      'config-set': (section, key, value) => {
        const updates = { [key]: value };
        return filterConfig.updateConfig(section, updates);
      },

      'config-reset': (scope) => {
        filterConfig.reset(scope);
        return { reset: true, scope };
      },

      'config-profile': (action, profileName, profileConfig) => {
        switch (action) {
          case 'create':
            filterConfig.setProfile(profileName, profileConfig);
            return { created: profileName };
          case 'apply':
            filterConfig.applyProfile(profileName);
            return { applied: profileName };
          case 'list':
            return Object.keys(filterConfig.config.profiles || {});
          default:
            throw new Error(`Unknown profile action: ${action}`);
        }
      }
    };
  }
}

export default FilterConfiguration;
export { FilterConfiguration };