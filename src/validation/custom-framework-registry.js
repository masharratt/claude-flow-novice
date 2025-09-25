/**
 * Custom Framework Registry
 * Phase 2 Implementation - Custom Framework Support System
 *
 * Manages custom framework definitions and their integration
 * with the main validation system.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../core/logger.js';
import { TruthConfigManager } from './truth-config-manager.js';

export class CustomFrameworkRegistry {
  constructor(options = {}) {
    this.basePath = options.basePath || process.cwd();
    this.registryPath = path.join(this.basePath, '.swarm', 'custom-frameworks.json');
    this.logger = logger.child({ component: 'CustomFrameworkRegistry' });
    this.frameworks = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.ensureRegistryDirectory();
      await this.loadExistingFrameworks();
      this.initialized = true;

      this.logger.info('Custom Framework Registry initialized', {
        frameworkCount: this.frameworks.size,
        registryPath: this.registryPath
      });

    } catch (error) {
      this.logger.error('Failed to initialize Custom Framework Registry', error);
      throw error;
    }
  }

  /**
   * Register a new custom framework
   */
  async registerFramework(frameworkDef) {
    await this.initialize();

    try {
      // Validate framework definition
      const validation = this.validateFrameworkDefinition(frameworkDef);
      if (!validation.valid) {
        throw new Error(`Invalid framework definition: ${validation.errors.join(', ')}`);
      }

      // Generate framework ID and metadata
      const frameworkId = this.generateFrameworkId(frameworkDef.name);
      const framework = {
        id: frameworkId,
        ...frameworkDef,
        registeredDate: new Date().toISOString(),
        version: '1.0.0',
        active: true
      };

      // Create truth configuration for the framework
      const truthConfig = await this.createFrameworkTruthConfig(framework);
      framework.truthConfigId = truthConfig.configId;

      // Store in registry
      this.frameworks.set(frameworkId, framework);

      // Persist to disk
      await this.saveRegistry();

      this.logger.info('Custom framework registered', {
        frameworkId,
        name: framework.name,
        truthConfigId: framework.truthConfigId
      });

      return {
        success: true,
        frameworkId,
        framework
      };

    } catch (error) {
      this.logger.error('Failed to register custom framework', error);
      throw error;
    }
  }

  /**
   * Get all registered frameworks
   */
  async listFrameworks(options = {}) {
    await this.initialize();

    const frameworks = Array.from(this.frameworks.values());

    // Filter by active status if specified
    if (options.activeOnly) {
      return frameworks.filter(f => f.active);
    }

    // Sort by registration date
    return frameworks.sort((a, b) =>
      new Date(b.registeredDate) - new Date(a.registeredDate)
    );
  }

  /**
   * Get a specific framework by ID or name
   */
  async getFramework(identifier) {
    await this.initialize();

    // Try by ID first
    if (this.frameworks.has(identifier)) {
      return this.frameworks.get(identifier);
    }

    // Try by name
    for (const framework of this.frameworks.values()) {
      if (framework.name.toLowerCase() === identifier.toLowerCase()) {
        return framework;
      }
    }

    return null;
  }

  /**
   * Update an existing framework
   */
  async updateFramework(frameworkId, updates) {
    await this.initialize();

    const framework = this.frameworks.get(frameworkId);
    if (!framework) {
      throw new Error(`Framework not found: ${frameworkId}`);
    }

    // Validate updates
    const updatedFramework = { ...framework, ...updates };
    const validation = this.validateFrameworkDefinition(updatedFramework);
    if (!validation.valid) {
      throw new Error(`Invalid framework update: ${validation.errors.join(', ')}`);
    }

    // Update metadata
    updatedFramework.modifiedDate = new Date().toISOString();
    updatedFramework.version = this.incrementVersion(framework.version);

    // Update truth configuration if needed
    if (updates.truthThreshold || updates.testingFramework) {
      const newTruthConfig = await this.createFrameworkTruthConfig(updatedFramework);
      updatedFramework.truthConfigId = newTruthConfig.configId;
    }

    // Store update
    this.frameworks.set(frameworkId, updatedFramework);
    await this.saveRegistry();

    this.logger.info('Custom framework updated', { frameworkId, version: updatedFramework.version });

    return updatedFramework;
  }

  /**
   * Deactivate a framework (soft delete)
   */
  async deactivateFramework(frameworkId) {
    await this.initialize();

    const framework = this.frameworks.get(frameworkId);
    if (!framework) {
      throw new Error(`Framework not found: ${frameworkId}`);
    }

    framework.active = false;
    framework.deactivatedDate = new Date().toISOString();

    await this.saveRegistry();

    this.logger.info('Custom framework deactivated', { frameworkId });

    return framework;
  }

  /**
   * Export framework definitions for sharing
   */
  async exportFramework(frameworkId, options = {}) {
    await this.initialize();

    const framework = this.frameworks.get(frameworkId);
    if (!framework) {
      throw new Error(`Framework not found: ${frameworkId}`);
    }

    const exportData = {
      ...framework,
      exportedDate: new Date().toISOString(),
      exportedBy: 'CustomFrameworkRegistry'
    };

    // Include truth configuration if requested
    if (options.includeTruthConfig) {
      const configManager = new TruthConfigManager({
        configDir: path.join(this.basePath, '.swarm', 'configs')
      });
      await configManager.initialize();

      try {
        const truthConfig = await configManager.loadConfiguration(framework.truthConfigId);
        exportData.truthConfiguration = truthConfig;
      } catch (error) {
        this.logger.warn('Could not load truth configuration for export', error);
      }

      await configManager.cleanup();
    }

    return exportData;
  }

  /**
   * Import framework definition from export
   */
  async importFramework(importData, options = {}) {
    await this.initialize();

    try {
      // Validate import data
      if (!importData.name || !importData.filePatterns) {
        throw new Error('Invalid import data: missing required fields');
      }

      // Check for naming conflicts
      const existingFramework = await this.getFramework(importData.name);
      if (existingFramework && !options.overwrite) {
        throw new Error(`Framework with name '${importData.name}' already exists`);
      }

      // Create framework definition from import
      const frameworkDef = {
        name: importData.name,
        filePatterns: importData.filePatterns,
        testingFramework: importData.testingFramework,
        truthThreshold: importData.truthThreshold || 0.75,
        description: importData.description,
        tags: [...(importData.tags || []), 'imported']
      };

      // Register the imported framework
      const result = await this.registerFramework(frameworkDef);

      this.logger.info('Custom framework imported', {
        frameworkId: result.frameworkId,
        name: importData.name
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to import custom framework', error);
      throw error;
    }
  }

  /**
   * Validate framework definition
   */
  validateFrameworkDefinition(frameworkDef) {
    const errors = [];

    // Required fields
    if (!frameworkDef.name) {
      errors.push('Framework name is required');
    }

    if (!frameworkDef.filePatterns || frameworkDef.filePatterns.length === 0) {
      errors.push('At least one file pattern is required');
    }

    if (!frameworkDef.testingFramework) {
      errors.push('Testing framework approach is required');
    }

    // Validate truth threshold
    if (frameworkDef.truthThreshold !== undefined) {
      if (typeof frameworkDef.truthThreshold !== 'number' ||
          frameworkDef.truthThreshold < 0 ||
          frameworkDef.truthThreshold > 1) {
        errors.push('Truth threshold must be a number between 0 and 1');
      }
    }

    // Validate file patterns
    if (frameworkDef.filePatterns) {
      for (const pattern of frameworkDef.filePatterns) {
        if (typeof pattern !== 'string' || pattern.trim().length === 0) {
          errors.push('File patterns must be non-empty strings');
          break;
        }
      }
    }

    // Validate testing framework
    const validTestingFrameworks = ['unit', 'behavior', 'integration', 'custom'];
    if (frameworkDef.testingFramework &&
        !validTestingFrameworks.includes(frameworkDef.testingFramework)) {
      errors.push(`Testing framework must be one of: ${validTestingFrameworks.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create truth configuration for custom framework
   */
  async createFrameworkTruthConfig(framework) {
    const configManager = new TruthConfigManager({
      configDir: path.join(this.basePath, '.swarm', 'configs')
    });

    await configManager.initialize();

    try {
      // Map testing framework to base configuration
      let baseFramework = 'CUSTOM';
      if (framework.testingFramework === 'unit') {
        baseFramework = 'TDD';
      } else if (framework.testingFramework === 'behavior') {
        baseFramework = 'BDD';
      }

      // Create configuration with custom settings
      const config = await configManager.createFromFramework(baseFramework, {
        name: `${framework.name} Configuration`,
        description: `Custom configuration for ${framework.name} framework`,
        threshold: framework.truthThreshold || 0.75,
        tags: ['custom-framework', framework.testingFramework]
      });

      // Save the configuration
      const saveResult = await configManager.saveConfiguration(
        config,
        `custom_${framework.name.replace(/\s+/g, '_').toLowerCase()}`
      );

      await configManager.cleanup();

      return {
        configId: saveResult.configId,
        filepath: saveResult.filepath
      };

    } catch (error) {
      await configManager.cleanup();
      throw error;
    }
  }

  /**
   * Generate unique framework ID
   */
  generateFrameworkId(name) {
    const normalized = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const timestamp = Date.now().toString(36);
    const hash = crypto.createHash('md5').update(name).digest('hex').slice(0, 8);
    return `custom-${normalized}-${timestamp}-${hash}`;
  }

  /**
   * Increment semantic version
   */
  incrementVersion(version) {
    const parts = version.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join('.');
  }

  /**
   * Load existing frameworks from disk
   */
  async loadExistingFrameworks() {
    try {
      const data = await fs.readFile(this.registryPath, 'utf8');
      const frameworksArray = JSON.parse(data);

      for (const framework of frameworksArray) {
        this.frameworks.set(framework.id, framework);
      }

      this.logger.debug('Loaded existing custom frameworks', { count: frameworksArray.length });

    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.warn('Failed to load existing frameworks', error);
      }
      // File doesn't exist, start with empty registry
    }
  }

  /**
   * Save registry to disk
   */
  async saveRegistry() {
    const frameworksArray = Array.from(this.frameworks.values());

    await fs.writeFile(
      this.registryPath,
      JSON.stringify(frameworksArray, null, 2),
      'utf8'
    );

    this.logger.debug('Custom framework registry saved', { count: frameworksArray.length });
  }

  /**
   * Ensure registry directory exists
   */
  async ensureRegistryDirectory() {
    const registryDir = path.dirname(this.registryPath);
    await fs.mkdir(registryDir, { recursive: true });
  }

  /**
   * Search frameworks by various criteria
   */
  async searchFrameworks(criteria) {
    await this.initialize();

    let frameworks = Array.from(this.frameworks.values());

    // Filter by active status
    if (criteria.activeOnly !== false) {
      frameworks = frameworks.filter(f => f.active);
    }

    // Filter by name
    if (criteria.name) {
      const namePattern = new RegExp(criteria.name, 'i');
      frameworks = frameworks.filter(f => namePattern.test(f.name));
    }

    // Filter by testing framework
    if (criteria.testingFramework) {
      frameworks = frameworks.filter(f => f.testingFramework === criteria.testingFramework);
    }

    // Filter by file patterns
    if (criteria.filePattern) {
      frameworks = frameworks.filter(f =>
        f.filePatterns.some(pattern => pattern.includes(criteria.filePattern))
      );
    }

    // Filter by tags
    if (criteria.tag) {
      frameworks = frameworks.filter(f =>
        f.tags && f.tags.includes(criteria.tag)
      );
    }

    return frameworks;
  }

  /**
   * Get registry statistics
   */
  async getStatistics() {
    await this.initialize();

    const frameworks = Array.from(this.frameworks.values());

    return {
      total: frameworks.length,
      active: frameworks.filter(f => f.active).length,
      inactive: frameworks.filter(f => !f.active).length,
      byTestingFramework: {
        unit: frameworks.filter(f => f.testingFramework === 'unit').length,
        behavior: frameworks.filter(f => f.testingFramework === 'behavior').length,
        integration: frameworks.filter(f => f.testingFramework === 'integration').length,
        custom: frameworks.filter(f => f.testingFramework === 'custom').length
      },
      registryPath: this.registryPath
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.frameworks.clear();
    this.initialized = false;
    this.logger.debug('Custom Framework Registry cleanup completed');
  }
}

export default CustomFrameworkRegistry;