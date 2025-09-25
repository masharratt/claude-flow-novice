// preference-manager.js - Preference loading, validation, and management
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

export class PreferenceManager {
  constructor() {
    this.globalPrefsPath = path.join(os.homedir(), '.claude-flow-novice', 'preferences', 'global.json');
    this.projectPrefsPath = path.join(process.cwd(), '.claude-flow-novice', 'preferences', 'user-global.json');
    this.cachedPreferences = null;
    this.schema = new PreferenceSchema();
  }

  /**
   * Load and merge preferences from global and project-local sources
   */
  async loadPreferences() {
    if (this.cachedPreferences) {
      return this.cachedPreferences;
    }

    const defaults = this.schema.getDefaults();
    let globalPrefs = {};
    let projectPrefs = {};

    // Load global preferences
    try {
      if (await fs.pathExists(this.globalPrefsPath)) {
        globalPrefs = await fs.readJson(this.globalPrefsPath);
      }
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not load global preferences: ${error.message}`));
    }

    // Load project-specific preferences
    try {
      if (await fs.pathExists(this.projectPrefsPath)) {
        projectPrefs = await fs.readJson(this.projectPrefsPath);
      }
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not load project preferences: ${error.message}`));
    }

    // Merge preferences: defaults < global < project
    const merged = this.mergePreferences(defaults, globalPrefs, projectPrefs);

    // Validate merged preferences
    const errors = this.schema.validate(merged);
    if (errors.length > 0) {
      console.warn(chalk.yellow('Warning: Preference validation errors:'));
      errors.forEach(error => console.warn(chalk.yellow(`  - ${error}`)));

      // Use defaults for invalid preferences
      this.cachedPreferences = this.mergePreferences(defaults, this.sanitizePreferences(merged));
    } else {
      this.cachedPreferences = merged;
    }

    return this.cachedPreferences;
  }

  /**
   * Deep merge multiple preference objects with inheritance
   */
  mergePreferences(...sources) {
    const result = {};

    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;

      for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = this.mergePreferences(result[key] || {}, value);
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Get a specific preference value with dot notation support
   */
  async get(key, defaultValue = null) {
    const preferences = await this.loadPreferences();
    return this.getNestedValue(preferences, key) || defaultValue;
  }

  /**
   * Set a preference value with dot notation support
   */
  async set(key, value, scope = 'project') {
    const targetPath = scope === 'global' ? this.globalPrefsPath : this.projectPrefsPath;

    // Load current preferences for the scope
    let currentPrefs = {};
    if (await fs.pathExists(targetPath)) {
      try {
        currentPrefs = await fs.readJson(targetPath);
      } catch (error) {
        console.warn(`Warning: Could not load existing preferences: ${error.message}`);
      }
    }

    // Set the nested value
    this.setNestedValue(currentPrefs, key, value);

    // Validate the updated preferences
    const errors = this.schema.validate(currentPrefs);
    if (errors.length > 0) {
      throw new Error(`Invalid preference value: ${errors.join(', ')}`);
    }

    // Ensure directory exists
    await fs.ensureDir(path.dirname(targetPath));

    // Update metadata
    if (!currentPrefs.meta) currentPrefs.meta = {};
    currentPrefs.meta.updatedAt = new Date().toISOString();
    currentPrefs.meta.version = currentPrefs.meta.version || '1.0.0';

    // Save the preferences
    await fs.writeJson(targetPath, currentPrefs, { spaces: 2 });

    // Clear cache to force reload
    this.cachedPreferences = null;

    return true;
  }

  /**
   * Reset preferences to defaults
   */
  async reset(scope = 'project') {
    const targetPath = scope === 'global' ? this.globalPrefsPath : this.projectPrefsPath;

    if (await fs.pathExists(targetPath)) {
      await fs.remove(targetPath);
    }

    this.cachedPreferences = null;
    return true;
  }

  /**
   * List all preference keys and values
   */
  async list(scope = 'all') {
    if (scope === 'all') {
      return await this.loadPreferences();
    }

    const targetPath = scope === 'global' ? this.globalPrefsPath : this.projectPrefsPath;

    if (await fs.pathExists(targetPath)) {
      return await fs.readJson(targetPath);
    }

    return {};
  }

  /**
   * Export preferences to a file
   */
  async export(filePath, scope = 'all') {
    const preferences = scope === 'all'
      ? await this.loadPreferences()
      : await this.list(scope);

    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJson(filePath, preferences, { spaces: 2 });

    return filePath;
  }

  /**
   * Import preferences from a file
   */
  async import(filePath, scope = 'project') {
    if (!await fs.pathExists(filePath)) {
      throw new Error(`Preference file not found: ${filePath}`);
    }

    const importedPrefs = await fs.readJson(filePath);

    // Validate imported preferences
    const errors = this.schema.validate(importedPrefs);
    if (errors.length > 0) {
      throw new Error(`Invalid imported preferences: ${errors.join(', ')}`);
    }

    const targetPath = scope === 'global' ? this.globalPrefsPath : this.projectPrefsPath;

    // Add import metadata
    if (!importedPrefs.meta) importedPrefs.meta = {};
    importedPrefs.meta.importedAt = new Date().toISOString();
    importedPrefs.meta.importedFrom = filePath;
    importedPrefs.meta.updatedAt = new Date().toISOString();

    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeJson(targetPath, importedPrefs, { spaces: 2 });

    // Clear cache
    this.cachedPreferences = null;

    return true;
  }

  /**
   * Validate current preferences
   */
  async validate() {
    const preferences = await this.loadPreferences();
    const errors = this.schema.validate(preferences);

    return {
      valid: errors.length === 0,
      errors,
      preferences
    };
  }

  /**
   * Get preferences for a specific context (e.g., specific agent type)
   */
  async getContextualPreferences(context = {}) {
    const basePrefs = await this.loadPreferences();

    // Apply context-specific overrides
    const contextualPrefs = { ...basePrefs };

    // Example: Adjust verbosity for advanced users doing simple tasks
    if (context.taskComplexity === 'simple' && basePrefs.experience?.level === 'advanced') {
      contextualPrefs.documentation.verbosity = 'minimal';
    }

    // Example: Increase explanation for beginners doing complex tasks
    if (context.taskComplexity === 'complex' && basePrefs.experience?.level === 'beginner') {
      contextualPrefs.documentation.verbosity = 'detailed';
      contextualPrefs.documentation.explanations = true;
    }

    // Example: Adjust agent concurrency based on system resources
    if (context.systemResources === 'limited') {
      contextualPrefs.workflow.concurrency = Math.min(contextualPrefs.workflow.concurrency, 2);
    }

    return contextualPrefs;
  }

  /**
   * Generate preference suggestions based on usage patterns
   */
  async generateSuggestions() {
    const preferences = await this.loadPreferences();
    const suggestions = [];

    // Suggest enabling advanced features for intermediate/advanced users
    if (preferences.experience?.level !== 'beginner' && !preferences.advanced?.neuralLearning) {
      suggestions.push({
        type: 'enhancement',
        key: 'advanced.neuralLearning',
        value: true,
        reason: 'Enable neural learning to improve agent performance over time',
        impact: 'medium'
      });
    }

    // Suggest reducing verbosity for experienced users
    if (preferences.experience?.level === 'advanced' && preferences.documentation?.verbosity === 'detailed') {
      suggestions.push({
        type: 'optimization',
        key: 'documentation.verbosity',
        value: 'standard',
        reason: 'Reduce verbosity for faster workflows',
        impact: 'low'
      });
    }

    // Suggest enabling memory persistence for regular users
    if (!preferences.advanced?.memoryPersistence) {
      suggestions.push({
        type: 'enhancement',
        key: 'advanced.memoryPersistence',
        value: true,
        reason: 'Enable memory persistence for better context retention',
        impact: 'high'
      });
    }

    return suggestions;
  }

  /**
   * Helper: Get nested value using dot notation
   */
  getNestedValue(obj, key) {
    return key.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * Helper: Set nested value using dot notation
   */
  setNestedValue(obj, key, value) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, prop) => {
      if (!current[prop]) current[prop] = {};
      return current[prop];
    }, obj);
    target[lastKey] = value;
  }

  /**
   * Helper: Sanitize preferences by removing invalid values
   */
  sanitizePreferences(preferences) {
    const defaults = this.schema.getDefaults();
    const sanitized = {};

    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (preferences[key] && typeof preferences[key] === typeof defaultValue) {
        sanitized[key] = preferences[key];
      } else {
        sanitized[key] = defaultValue;
      }
    }

    return sanitized;
  }

  /**
   * Clear preference cache
   */
  clearCache() {
    this.cachedPreferences = null;
  }
}

// Preference schema and validation
class PreferenceSchema {
  getDefaults() {
    return {
      experience: {
        level: 'beginner',
        background: ['Full-Stack Development'],
        goals: ''
      },
      documentation: {
        verbosity: 'standard',
        explanations: true,
        codeComments: 'standard',
        stepByStep: true
      },
      feedback: {
        tone: 'friendly',
        errorHandling: 'guided',
        notifications: true,
        confirmations: 'important'
      },
      workflow: {
        defaultAgents: ['researcher', 'coder'],
        concurrency: 2,
        autoSave: true,
        testRunning: 'completion'
      },
      advanced: {
        memoryPersistence: false,
        neuralLearning: false,
        hookIntegration: false,
        customAgents: ''
      },
      project: {
        language: 'unknown',
        frameworks: [],
        buildTool: null,
        packageManager: null,
        environment: 'development'
      },
      meta: {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
  }

  validate(preferences) {
    const errors = [];

    if (!preferences || typeof preferences !== 'object') {
      errors.push('Preferences must be an object');
      return errors;
    }

    // Validate experience level
    const validLevels = ['beginner', 'intermediate', 'advanced'];
    if (preferences.experience?.level && !validLevels.includes(preferences.experience.level)) {
      errors.push('Invalid experience level. Must be: beginner, intermediate, or advanced');
    }

    // Validate documentation verbosity
    const validVerbosity = ['minimal', 'standard', 'detailed', 'verbose'];
    if (preferences.documentation?.verbosity && !validVerbosity.includes(preferences.documentation.verbosity)) {
      errors.push('Invalid documentation verbosity. Must be: minimal, standard, detailed, or verbose');
    }

    // Validate feedback tone
    const validTones = ['professional', 'friendly', 'direct', 'educational'];
    if (preferences.feedback?.tone && !validTones.includes(preferences.feedback.tone)) {
      errors.push('Invalid feedback tone. Must be: professional, friendly, direct, or educational');
    }

    // Validate error handling
    const validErrorHandling = ['immediate', 'summary', 'guided'];
    if (preferences.feedback?.errorHandling && !validErrorHandling.includes(preferences.feedback.errorHandling)) {
      errors.push('Invalid error handling. Must be: immediate, summary, or guided');
    }

    // Validate confirmations
    const validConfirmations = ['never', 'destructive', 'important', 'always'];
    if (preferences.feedback?.confirmations && !validConfirmations.includes(preferences.feedback.confirmations)) {
      errors.push('Invalid confirmations setting. Must be: never, destructive, important, or always');
    }

    // Validate concurrency
    if (preferences.workflow?.concurrency) {
      const concurrency = parseInt(preferences.workflow.concurrency);
      if (isNaN(concurrency) || concurrency < 1 || concurrency > 8) {
        errors.push('Concurrency must be a number between 1 and 8');
      }
    }

    // Validate default agents
    const validAgents = ['researcher', 'coder', 'reviewer', 'planner', 'tester'];
    if (preferences.workflow?.defaultAgents && Array.isArray(preferences.workflow.defaultAgents)) {
      for (const agent of preferences.workflow.defaultAgents) {
        if (!validAgents.includes(agent)) {
          errors.push(`Invalid agent type: ${agent}. Must be one of: ${validAgents.join(', ')}`);
        }
      }
    }

    // Validate test running
    const validTestRunning = ['never', 'completion', 'continuous'];
    if (preferences.workflow?.testRunning && !validTestRunning.includes(preferences.workflow.testRunning)) {
      errors.push('Invalid test running setting. Must be: never, completion, or continuous');
    }

    return errors;
  }

  getValidationSchema() {
    return {
      experience: {
        level: { type: 'enum', values: ['beginner', 'intermediate', 'advanced'] },
        background: { type: 'array', items: { type: 'string' } },
        goals: { type: 'string' }
      },
      documentation: {
        verbosity: { type: 'enum', values: ['minimal', 'standard', 'detailed', 'verbose'] },
        explanations: { type: 'boolean' },
        codeComments: { type: 'enum', values: ['minimal', 'standard', 'detailed', 'extensive'] },
        stepByStep: { type: 'boolean' }
      },
      feedback: {
        tone: { type: 'enum', values: ['professional', 'friendly', 'direct', 'educational'] },
        errorHandling: { type: 'enum', values: ['immediate', 'summary', 'guided'] },
        notifications: { type: 'boolean' },
        confirmations: { type: 'enum', values: ['never', 'destructive', 'important', 'always'] }
      },
      workflow: {
        defaultAgents: { type: 'array', items: { type: 'enum', values: ['researcher', 'coder', 'reviewer', 'planner', 'tester'] } },
        concurrency: { type: 'integer', min: 1, max: 8 },
        autoSave: { type: 'boolean' },
        testRunning: { type: 'enum', values: ['never', 'completion', 'continuous'] }
      },
      advanced: {
        memoryPersistence: { type: 'boolean' },
        neuralLearning: { type: 'boolean' },
        hookIntegration: { type: 'boolean' },
        customAgents: { type: 'string' }
      }
    };
  }
}

export default PreferenceManager;