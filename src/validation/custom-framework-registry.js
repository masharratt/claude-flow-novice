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
import { RustFrameworkDetector } from './frameworks/rust-detector.js';

export class CustomFrameworkRegistry {
  constructor(options = {}) {
    this.basePath = options.basePath || process.cwd();
    this.registryPath = path.join(this.basePath, '.swarm', 'custom-frameworks.json');
    this.logger = logger.child({ component: 'CustomFrameworkRegistry' });
    this.frameworks = new Map();
    this.rustDetector = new RustFrameworkDetector({ basePath: this.basePath });
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.ensureRegistryDirectory();
      await this.loadExistingFrameworks();

      // Initialize Rust detector with Byzantine validation
      await this.rustDetector.initialize();

      this.initialized = true;

      this.logger.info('Custom Framework Registry initialized', {
        frameworkCount: this.frameworks.size,
        registryPath: this.registryPath,
        rustDetectorEnabled: true
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
   * Auto-detect and register Rust frameworks with Byzantine consensus
   */
  async autoDetectRustFrameworks() {
    await this.initialize();

    try {
      const rustDetectionResult = await this.rustDetector.detectRustFramework();

      if (rustDetectionResult.isRustProject && rustDetectionResult.confidence > 0.7) {
        const rustFramework = await this.createRustFrameworkDefinition(rustDetectionResult);

        // Check if already registered
        const existingRust = Array.from(this.frameworks.values()).find(
          f => f.name.toLowerCase().includes('rust') && f.active
        );

        if (!existingRust) {
          const registerResult = await this.registerFramework(rustFramework);

          this.logger.info('Rust framework auto-registered with Byzantine validation', {
            frameworkId: registerResult.frameworkId,
            confidence: rustDetectionResult.confidence,
            byzantineConsensus: rustDetectionResult.metadata.byzantineConsensus,
            detectedFrameworks: {
              web: rustDetectionResult.frameworks.web.length,
              database: rustDetectionResult.frameworks.database.length,
              async: rustDetectionResult.frameworks.async.length,
              testing: rustDetectionResult.frameworks.testing.length
            }
          });

          return registerResult;
        }
      }

      return {
        success: false,
        reason: 'Rust project not detected or confidence too low',
        confidence: rustDetectionResult.confidence
      };

    } catch (error) {
      this.logger.error('Rust auto-detection failed', error);
      throw error;
    }
  }

  /**
   * Create framework definition from Rust detection results
   */
  async createRustFrameworkDefinition(rustResult) {
    const webFrameworks = rustResult.frameworks.web.map(f => f.name).join(', ');
    const dbFrameworks = rustResult.frameworks.database.map(f => f.name).join(', ');
    const asyncRuntimes = rustResult.frameworks.async.map(f => f.name).join(', ');

    let name = 'Rust Project';
    if (webFrameworks) {
      name = `Rust Web (${webFrameworks})`;
    } else if (dbFrameworks) {
      name = `Rust Database (${dbFrameworks})`;
    } else if (asyncRuntimes) {
      name = `Rust Async (${asyncRuntimes})`;
    }

    const description = this.buildRustDescription(rustResult);

    return {
      name,
      description,
      filePatterns: [
        'Cargo.toml',
        'Cargo.lock',
        '**/*.rs',
        'src/**/*.rs',
        'tests/**/*.rs',
        'benches/**/*.rs',
        'examples/**/*.rs'
      ],
      testingFramework: this.determineRustTestingFramework(rustResult),
      truthThreshold: this.calculateRustTruthThreshold(rustResult),
      tags: [
        'rust',
        'auto-detected',
        'byzantine-validated',
        ...rustResult.frameworks.web.map(f => `web-${f.name}`),
        ...rustResult.frameworks.database.map(f => `db-${f.name}`),
        ...rustResult.frameworks.async.map(f => `async-${f.name}`)
      ],
      rustSpecific: {
        edition: rustResult.evidence.editions?.[0] || '2021',
        cargoWorkspace: rustResult.evidence.workspace !== null,
        dependencies: rustResult.evidence.dependencies,
        detectedFrameworks: rustResult.frameworks,
        byzantineConsensus: rustResult.metadata.byzantineConsensus,
        confidence: rustResult.confidence
      }
    };
  }

  /**
   * Build comprehensive description for Rust framework
   */
  buildRustDescription(rustResult) {
    let description = `Auto-detected Rust project with ${rustResult.confidence.toFixed(2)} confidence`;

    if (rustResult.metadata.byzantineConsensus) {
      description += ' (Byzantine consensus validated)';
    }

    description += `.\n\nProject Details:`;

    if (rustResult.evidence.cargo.name) {
      description += `\n• Name: ${rustResult.evidence.cargo.name}`;
    }

    if (rustResult.evidence.cargo.version) {
      description += `\n• Version: ${rustResult.evidence.cargo.version}`;
    }

    if (rustResult.evidence.editions.length > 0) {
      description += `\n• Rust Edition: ${rustResult.evidence.editions.join(', ')}`;
    }

    if (rustResult.evidence.workspace) {
      description += `\n• Cargo Workspace: ${rustResult.evidence.workspace.members.length} members`;
    }

    if (rustResult.frameworks.web.length > 0) {
      description += `\n• Web Frameworks: ${rustResult.frameworks.web.map(f => f.name).join(', ')}`;
    }

    if (rustResult.frameworks.database.length > 0) {
      description += `\n• Database Frameworks: ${rustResult.frameworks.database.map(f => f.name).join(', ')}`;
    }

    if (rustResult.frameworks.async.length > 0) {
      description += `\n• Async Runtimes: ${rustResult.frameworks.async.map(f => f.name).join(', ')}`;
    }

    if (rustResult.frameworks.testing.length > 0) {
      description += `\n• Testing Frameworks: ${rustResult.frameworks.testing.map(f => f.name).join(', ')}`;
    }

    description += `\n\nDetection completed with ${rustResult.metadata.patternsMatched} patterns matched in ${rustResult.metadata.detectionTime}ms`;

    return description;
  }

  /**
   * Determine appropriate testing framework for Rust project
   */
  determineRustTestingFramework(rustResult) {
    // Check detected testing frameworks
    if (rustResult.frameworks.testing.length > 0) {
      const testFramework = rustResult.frameworks.testing[0].name;

      switch (testFramework) {
        case 'criterion':
        case 'proptest':
        case 'quickcheck':
          return 'custom'; // Non-standard testing approaches
        case 'builtin':
        default:
          return 'unit'; // Standard Rust unit testing
      }
    }

    // Check for testing evidence
    if (rustResult.evidence.patterns.rust) {
      const hasTests = rustResult.evidence.patterns.rust.some(p =>
        p.pattern.includes('test') || p.pattern.includes('assert')
      );

      if (hasTests) {
        return 'unit';
      }
    }

    return 'unit'; // Default for Rust projects
  }

  /**
   * Calculate truth threshold based on Rust project complexity and confidence
   */
  calculateRustTruthThreshold(rustResult) {
    let threshold = 0.80; // Base threshold for Rust projects

    // Adjust based on confidence
    if (rustResult.confidence > 0.9) {
      threshold += 0.05; // High confidence allows higher threshold
    } else if (rustResult.confidence < 0.7) {
      threshold -= 0.05; // Lower confidence needs lower threshold
    }

    // Adjust based on complexity
    const complexityScore = (
      rustResult.frameworks.web.length +
      rustResult.frameworks.database.length +
      rustResult.frameworks.async.length +
      rustResult.frameworks.testing.length
    );

    if (complexityScore > 3) {
      threshold += 0.05; // Complex projects get higher standards
    } else if (complexityScore === 0) {
      threshold -= 0.03; // Simple projects get lower requirements
    }

    // Byzantine consensus bonus
    if (rustResult.metadata.byzantineConsensus) {
      threshold += 0.02; // Validated projects get slight boost
    }

    // Workspace projects
    if (rustResult.evidence.workspace && rustResult.evidence.workspace.validMembers > 2) {
      threshold += 0.03; // Multi-crate workspaces need higher standards
    }

    // Modern edition bonus
    if (rustResult.evidence.editions.includes('2021')) {
      threshold += 0.01; // Modern Rust gets slight boost
    }

    return Math.max(0.65, Math.min(0.95, threshold));
  }

  /**
   * Get Rust framework detection statistics
   */
  async getRustDetectionStatistics() {
    await this.initialize();

    const rustFrameworks = Array.from(this.frameworks.values()).filter(
      f => f.tags && f.tags.includes('rust')
    );

    const totalRustProjects = rustFrameworks.length;
    const byzantineValidated = rustFrameworks.filter(
      f => f.rustSpecific?.byzantineConsensus
    ).length;

    const frameworkDistribution = {
      web: rustFrameworks.filter(f => f.tags.some(tag => tag.startsWith('web-'))).length,
      database: rustFrameworks.filter(f => f.tags.some(tag => tag.startsWith('db-'))).length,
      async: rustFrameworks.filter(f => f.tags.some(tag => tag.startsWith('async-'))).length
    };

    const avgConfidence = totalRustProjects > 0
      ? rustFrameworks.reduce((sum, f) => sum + (f.rustSpecific?.confidence || 0), 0) / totalRustProjects
      : 0;

    return {
      totalRustProjects,
      byzantineValidated,
      byzantineValidationRate: totalRustProjects > 0 ? byzantineValidated / totalRustProjects : 0,
      frameworkDistribution,
      averageConfidence: avgConfidence,
      editions: this.getRustEditionDistribution(rustFrameworks),
      workspaceProjects: rustFrameworks.filter(f => f.rustSpecific?.cargoWorkspace).length
    };
  }

  /**
   * Get Rust edition distribution
   */
  getRustEditionDistribution(rustFrameworks) {
    const editions = {};

    for (const framework of rustFrameworks) {
      const edition = framework.rustSpecific?.edition || 'unknown';
      editions[edition] = (editions[edition] || 0) + 1;
    }

    return editions;
  }

  /**
   * Enhanced search with Rust-specific criteria
   */
  async searchRustFrameworks(criteria) {
    await this.initialize();

    let frameworks = Array.from(this.frameworks.values()).filter(
      f => f.tags && f.tags.includes('rust') && f.active
    );

    // Filter by Rust edition
    if (criteria.edition) {
      frameworks = frameworks.filter(
        f => f.rustSpecific?.edition === criteria.edition
      );
    }

    // Filter by workspace status
    if (criteria.workspace !== undefined) {
      frameworks = frameworks.filter(
        f => f.rustSpecific?.cargoWorkspace === criteria.workspace
      );
    }

    // Filter by Byzantine validation status
    if (criteria.byzantineValidated !== undefined) {
      frameworks = frameworks.filter(
        f => f.rustSpecific?.byzantineConsensus === criteria.byzantineValidated
      );
    }

    // Filter by specific Rust framework types
    if (criteria.frameworkType) {
      const tagPrefix = `${criteria.frameworkType}-`;
      frameworks = frameworks.filter(
        f => f.tags.some(tag => tag.startsWith(tagPrefix))
      );
    }

    // Filter by confidence threshold
    if (criteria.minConfidence) {
      frameworks = frameworks.filter(
        f => (f.rustSpecific?.confidence || 0) >= criteria.minConfidence
      );
    }

    return frameworks;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.rustDetector) {
      await this.rustDetector.cleanup();
    }

    this.frameworks.clear();
    this.initialized = false;
    this.logger.debug('Custom Framework Registry cleanup completed');
  }
}

export default CustomFrameworkRegistry;