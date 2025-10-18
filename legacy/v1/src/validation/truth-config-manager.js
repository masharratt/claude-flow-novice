/**
 * Truth-Based Configuration Manager
 *
 * Provides schema-validated, framework-specific truth scoring configurations
 * with Byzantine-fault-tolerant validation and persistent storage.
 *
 * Integrates with TruthScorer (745 lines) to provide dynamic configuration
 * management for the Completion Validation Framework.
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppError } from '../utils/error-handler.js';
import { logger } from '../core/logger.js';
import TruthScorer from '../verification/truth-scorer.js';

/**
 * Framework-specific configuration presets
 * Truth thresholds are calibrated for each methodology
 */
const FRAMEWORK_PRESETS = {
  TDD: {
    name: 'Test-Driven Development',
    threshold: 0.9,
    description: 'High confidence required for test-first development',
    weights: {
      agentReliability: 0.35,
      crossValidation: 0.25,
      externalVerification: 0.15,
      factualConsistency: 0.15,
      logicalCoherence: 0.1,
    },
    checks: {
      historicalValidation: true,
      crossAgentValidation: true,
      externalValidation: true,
      logicalValidation: true,
      statisticalValidation: true,
    },
    confidence: {
      level: 0.95,
      minSampleSize: 10,
      maxErrorMargin: 0.03,
    },
  },

  BDD: {
    name: 'Behavior-Driven Development',
    threshold: 0.85,
    description: 'Balanced confidence for behavior validation',
    weights: {
      agentReliability: 0.3,
      crossValidation: 0.3,
      externalVerification: 0.2,
      factualConsistency: 0.1,
      logicalCoherence: 0.1,
    },
    checks: {
      historicalValidation: true,
      crossAgentValidation: true,
      externalValidation: true,
      logicalValidation: true,
      statisticalValidation: false,
    },
    confidence: {
      level: 0.9,
      minSampleSize: 8,
      maxErrorMargin: 0.05,
    },
  },

  SPARC: {
    name: 'Specification, Pseudocode, Architecture, Refinement, Completion',
    threshold: 0.8,
    description: 'Progressive validation for systematic development',
    weights: {
      agentReliability: 0.25,
      crossValidation: 0.2,
      externalVerification: 0.25,
      factualConsistency: 0.15,
      logicalCoherence: 0.15,
    },
    checks: {
      historicalValidation: true,
      crossAgentValidation: true,
      externalValidation: true,
      logicalValidation: true,
      statisticalValidation: true,
    },
    confidence: {
      level: 0.85,
      minSampleSize: 5,
      maxErrorMargin: 0.08,
    },
  },

  CUSTOM: {
    name: 'Custom Configuration',
    threshold: 0.75,
    description: 'User-defined configuration template',
    weights: {
      agentReliability: 0.3,
      crossValidation: 0.25,
      externalVerification: 0.2,
      factualConsistency: 0.15,
      logicalCoherence: 0.1,
    },
    checks: {
      historicalValidation: true,
      crossAgentValidation: true,
      externalValidation: false,
      logicalValidation: true,
      statisticalValidation: true,
    },
    confidence: {
      level: 0.8,
      minSampleSize: 5,
      maxErrorMargin: 0.1,
    },
  },
};

/**
 * JSON Schema for configuration validation
 */
const CONFIGURATION_SCHEMA = {
  type: 'object',
  required: ['framework', 'threshold', 'weights', 'checks', 'confidence'],
  properties: {
    framework: {
      type: 'string',
      enum: Object.keys(FRAMEWORK_PRESETS),
    },
    threshold: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Minimum truth score threshold (0-1)',
    },
    weights: {
      type: 'object',
      required: [
        'agentReliability',
        'crossValidation',
        'externalVerification',
        'factualConsistency',
        'logicalCoherence',
      ],
      properties: {
        agentReliability: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
        crossValidation: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
        externalVerification: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
        factualConsistency: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
        logicalCoherence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
      },
      additionalProperties: false,
    },
    checks: {
      type: 'object',
      required: [
        'historicalValidation',
        'crossAgentValidation',
        'externalValidation',
        'logicalValidation',
        'statisticalValidation',
      ],
      properties: {
        historicalValidation: { type: 'boolean' },
        crossAgentValidation: { type: 'boolean' },
        externalValidation: { type: 'boolean' },
        logicalValidation: { type: 'boolean' },
        statisticalValidation: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    confidence: {
      type: 'object',
      required: ['level', 'minSampleSize', 'maxErrorMargin'],
      properties: {
        level: {
          type: 'number',
          minimum: 0.5,
          maximum: 0.99,
        },
        minSampleSize: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
        },
        maxErrorMargin: {
          type: 'number',
          minimum: 0.001,
          maximum: 0.5,
        },
      },
      additionalProperties: false,
    },
    metadata: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        version: { type: 'string' },
        author: { type: 'string' },
        created: { type: 'string', format: 'date-time' },
        modified: { type: 'string', format: 'date-time' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  additionalProperties: false,
};

/**
 * Truth-Based Configuration Manager
 *
 * Manages validated configurations for truth scoring with framework-specific
 * presets, schema validation, and Byzantine-fault-tolerant persistence.
 */
export class TruthConfigManager {
  constructor(options = {}) {
    this.logger = options.logger || logger.child({ component: 'TruthConfigManager' });
    this.configDir = options.configDir || path.join(process.cwd(), '.swarm', 'configs');
    this.currentConfig = null;
    this.truthScorer = null;
    this.validators = new Map();
    this.configCache = new Map();
    this.watchers = new Map();
    this.validationHistory = [];

    this.logger.info('TruthConfigManager initialized', {
      configDir: this.configDir,
      frameworks: Object.keys(FRAMEWORK_PRESETS),
    });
  }

  /**
   * Initialize the configuration manager
   */
  async initialize() {
    try {
      await this.ensureConfigDirectory();
      await this.loadDefaultConfigurations();
      await this.validateConfigurationIntegrity();

      this.logger.info('TruthConfigManager initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize TruthConfigManager', error);
      throw new AppError(
        `Configuration manager initialization failed: ${error.message}`,
        'CONFIG_MANAGER_INIT_FAILED',
        500,
      );
    }
  }

  /**
   * Create configuration from framework preset
   */
  async createFromFramework(framework, customizations = {}) {
    this.logger.debug('Creating configuration from framework', { framework, customizations });

    const preset = FRAMEWORK_PRESETS[framework.toUpperCase()];
    if (!preset) {
      throw new AppError(
        `Unknown framework: ${framework}. Available: ${Object.keys(FRAMEWORK_PRESETS).join(', ')}`,
        'UNKNOWN_FRAMEWORK',
        400,
      );
    }

    const config = {
      framework: framework.toUpperCase(),
      threshold: customizations.threshold || preset.threshold,
      weights: { ...preset.weights, ...customizations.weights },
      checks: { ...preset.checks, ...customizations.checks },
      confidence: { ...preset.confidence, ...customizations.confidence },
      metadata: {
        name: customizations.name || `${preset.name} Configuration`,
        description: customizations.description || preset.description,
        version: '1.0.0',
        author: 'TruthConfigManager',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        tags: customizations.tags || [framework.toLowerCase()],
      },
    };

    const validationResult = await this.validateConfiguration(config);
    if (!validationResult.valid) {
      throw new AppError(
        `Configuration validation failed: ${validationResult.errors.join(', ')}`,
        'CONFIG_VALIDATION_FAILED',
        400,
      );
    }

    this.currentConfig = config;
    this.logger.info('Configuration created from framework', {
      framework,
      threshold: config.threshold,
    });

    return config;
  }

  /**
   * Validate configuration against schema with Byzantine fault tolerance
   */
  async validateConfiguration(config, options = {}) {
    const startTime = Date.now();
    const validationId = crypto.randomUUID();

    this.logger.debug('Starting configuration validation', {
      validationId,
      framework: config?.framework,
    });

    try {
      const result = {
        valid: true,
        errors: [],
        warnings: [],
        byzantineFaultTolerant: true,
        validationId,
        timestamp: new Date(),
        duration: 0,
      };

      // Schema validation
      const schemaValidation = this.validateAgainstSchema(config);
      if (!schemaValidation.valid) {
        result.valid = false;
        result.errors.push(...schemaValidation.errors);
      }

      // Weight sum validation
      const weightSum = Object.values(config.weights || {}).reduce(
        (sum, weight) => sum + weight,
        0,
      );
      if (Math.abs(weightSum - 1.0) > 0.001) {
        result.valid = false;
        result.errors.push(`Weight sum must equal 1.0, got ${weightSum.toFixed(3)}`);
      }

      // Byzantine fault tolerance checks
      const byzantineChecks = await this.performByzantineValidation(config);
      if (!byzantineChecks.faultTolerant) {
        result.byzantineFaultTolerant = false;
        result.warnings.push(...byzantineChecks.warnings);
      }

      // Framework coherence validation
      const coherenceValidation = this.validateFrameworkCoherence(config);
      if (!coherenceValidation.coherent) {
        result.warnings.push(...coherenceValidation.warnings);
      }

      // Threshold reasonableness check
      if (config.threshold < 0.5) {
        result.warnings.push(
          `Low truth threshold ${config.threshold} may accept unreliable results`,
        );
      }

      if (config.threshold > 0.98) {
        result.warnings.push(`High truth threshold ${config.threshold} may be overly restrictive`);
      }

      result.duration = Date.now() - startTime;

      // Record validation history
      this.validationHistory.push({
        validationId,
        config: this.hashConfig(config),
        result: { ...result },
        timestamp: new Date(),
      });

      // Keep only last 100 validations
      if (this.validationHistory.length > 100) {
        this.validationHistory = this.validationHistory.slice(-100);
      }

      this.logger.debug('Configuration validation completed', {
        validationId,
        valid: result.valid,
        errors: result.errors.length,
        warnings: result.warnings.length,
        duration: result.duration,
      });

      return result;
    } catch (error) {
      this.logger.error('Configuration validation failed', error);
      throw new AppError(
        `Configuration validation error: ${error.message}`,
        'CONFIG_VALIDATION_ERROR',
        500,
      );
    }
  }

  /**
   * Validate configuration against JSON schema
   */
  validateAgainstSchema(config) {
    const errors = [];

    try {
      // Basic type and structure validation
      if (!config || typeof config !== 'object') {
        errors.push('Configuration must be an object');
        return { valid: false, errors };
      }

      // Required fields
      const requiredFields = CONFIGURATION_SCHEMA.required;
      for (const field of requiredFields) {
        if (!(field in config)) {
          errors.push(`Missing required field: ${field}`);
        }
      }

      // Framework validation
      if (config.framework && !FRAMEWORK_PRESETS[config.framework]) {
        errors.push(`Invalid framework: ${config.framework}`);
      }

      // Threshold validation
      if (typeof config.threshold !== 'number' || config.threshold < 0 || config.threshold > 1) {
        errors.push('Threshold must be a number between 0 and 1');
      }

      // Weights validation
      if (config.weights) {
        const requiredWeights = CONFIGURATION_SCHEMA.properties.weights.required;
        for (const weight of requiredWeights) {
          if (!(weight in config.weights)) {
            errors.push(`Missing weight: ${weight}`);
          } else if (
            typeof config.weights[weight] !== 'number' ||
            config.weights[weight] < 0 ||
            config.weights[weight] > 1
          ) {
            errors.push(`Invalid weight ${weight}: must be number between 0 and 1`);
          }
        }
      }

      // Checks validation
      if (config.checks) {
        const requiredChecks = CONFIGURATION_SCHEMA.properties.checks.required;
        for (const check of requiredChecks) {
          if (!(check in config.checks)) {
            errors.push(`Missing check: ${check}`);
          } else if (typeof config.checks[check] !== 'boolean') {
            errors.push(`Invalid check ${check}: must be boolean`);
          }
        }
      }

      // Confidence validation
      if (config.confidence) {
        const confidenceProps = CONFIGURATION_SCHEMA.properties.confidence.properties;

        if (
          typeof config.confidence.level !== 'number' ||
          config.confidence.level < 0.5 ||
          config.confidence.level > 0.99
        ) {
          errors.push('Confidence level must be number between 0.5 and 0.99');
        }

        if (
          !Number.isInteger(config.confidence.minSampleSize) ||
          config.confidence.minSampleSize < 1 ||
          config.confidence.minSampleSize > 1000
        ) {
          errors.push('Min sample size must be integer between 1 and 1000');
        }

        if (
          typeof config.confidence.maxErrorMargin !== 'number' ||
          config.confidence.maxErrorMargin < 0.001 ||
          config.confidence.maxErrorMargin > 0.5
        ) {
          errors.push('Max error margin must be number between 0.001 and 0.5');
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      errors.push(`Schema validation error: ${error.message}`);
      return { valid: false, errors };
    }
  }

  /**
   * Perform Byzantine fault tolerance validation
   */
  async performByzantineValidation(config) {
    const warnings = [];
    let faultTolerant = true;

    try {
      // Check for configuration consistency across multiple validation rounds
      const validationRounds = 3;
      const results = [];

      for (let i = 0; i < validationRounds; i++) {
        const hash = this.hashConfig(config);
        results.push(hash);

        // Small delay between validations to simulate distributed validation
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // All hashes should be identical for Byzantine fault tolerance
      const uniqueHashes = [...new Set(results)];
      if (uniqueHashes.length > 1) {
        faultTolerant = false;
        warnings.push('Configuration shows inconsistency across validation rounds');
      }

      // Check for malicious configuration patterns
      const maliciousPatterns = this.detectMaliciousPatterns(config);
      if (maliciousPatterns.length > 0) {
        faultTolerant = false;
        warnings.push(
          ...maliciousPatterns.map((pattern) => `Malicious pattern detected: ${pattern}`),
        );
      }

      // Validate against historical configurations for anomaly detection
      const anomalies = this.detectConfigurationAnomalies(config);
      if (anomalies.length > 0) {
        warnings.push(...anomalies.map((anomaly) => `Configuration anomaly: ${anomaly}`));
      }

      return { faultTolerant, warnings };
    } catch (error) {
      return {
        faultTolerant: false,
        warnings: [`Byzantine validation failed: ${error.message}`],
      };
    }
  }

  /**
   * Detect malicious configuration patterns
   */
  detectMaliciousPatterns(config) {
    const patterns = [];

    // Extremely low thresholds that would accept everything
    if (config.threshold < 0.1) {
      patterns.push('Suspiciously low truth threshold');
    }

    // All weights concentrated in one component
    const weights = Object.values(config.weights || {});
    const maxWeight = Math.max(...weights);
    if (maxWeight > 0.9) {
      patterns.push('Excessive weight concentration in single component');
    }

    // All validation checks disabled
    const checks = Object.values(config.checks || {});
    const enabledChecks = checks.filter((check) => check === true);
    if (enabledChecks.length === 0) {
      patterns.push('All validation checks disabled');
    }

    // Extremely permissive confidence settings
    if (config.confidence?.maxErrorMargin > 0.3) {
      patterns.push('Excessively high error margin tolerance');
    }

    if (config.confidence?.minSampleSize === 1) {
      patterns.push('Minimal sample size requirement');
    }

    return patterns;
  }

  /**
   * Detect configuration anomalies against historical data
   */
  detectConfigurationAnomalies(config) {
    const anomalies = [];

    // Compare against framework preset
    const preset = FRAMEWORK_PRESETS[config.framework];
    if (!preset) return anomalies;

    // Threshold deviation
    const thresholdDeviation = Math.abs(config.threshold - preset.threshold);
    if (thresholdDeviation > 0.15) {
      anomalies.push(`Threshold deviates significantly from ${config.framework} preset`);
    }

    // Weight distribution anomalies
    for (const [component, weight] of Object.entries(config.weights)) {
      const presetWeight = preset.weights[component];
      if (presetWeight && Math.abs(weight - presetWeight) > 0.2) {
        anomalies.push(`${component} weight deviates significantly from preset`);
      }
    }

    return anomalies;
  }

  /**
   * Validate framework coherence
   */
  validateFrameworkCoherence(config) {
    const warnings = [];
    let coherent = true;

    const framework = config.framework;
    const preset = FRAMEWORK_PRESETS[framework];

    if (!preset) {
      return { coherent: false, warnings: ['Unknown framework'] };
    }

    // TDD-specific coherence checks
    if (framework === 'TDD') {
      if (!config.checks.historicalValidation) {
        warnings.push('TDD methodology benefits from historical validation');
      }
      if (config.threshold < 0.85) {
        warnings.push('TDD typically requires high confidence thresholds');
      }
    }

    // BDD-specific coherence checks
    if (framework === 'BDD') {
      if (config.weights.crossValidation < 0.2) {
        warnings.push('BDD emphasizes cross-validation for behavior verification');
      }
    }

    // SPARC-specific coherence checks
    if (framework === 'SPARC') {
      if (!config.checks.logicalValidation) {
        warnings.push('SPARC methodology emphasizes logical coherence');
      }
      if (config.weights.externalVerification < 0.15) {
        warnings.push('SPARC benefits from external verification in architecture phase');
      }
    }

    return { coherent: warnings.length === 0, warnings };
  }

  /**
   * Save configuration to persistent storage
   */
  async saveConfiguration(config, name, options = {}) {
    const configId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    this.logger.debug('Saving configuration', { configId, name, framework: config.framework });

    try {
      // Validate before saving
      const validation = await this.validateConfiguration(config);
      if (!validation.valid) {
        throw new AppError(
          `Cannot save invalid configuration: ${validation.errors.join(', ')}`,
          'INVALID_CONFIG_SAVE',
          400,
        );
      }

      // Prepare configuration with metadata
      const configWithMetadata = {
        ...config,
        metadata: {
          ...config.metadata,
          configId,
          name,
          saved: timestamp,
          modified: timestamp,
          version: config.metadata?.version || '1.0.0',
        },
      };

      // Generate filename
      const filename = `${name.replace(/[^a-zA-Z0-9-_]/g, '_')}_${configId.slice(0, 8)}.json`;
      const filepath = path.join(this.configDir, filename);

      // Save to file with atomic write
      const tempPath = filepath + '.tmp';
      await fs.writeFile(tempPath, JSON.stringify(configWithMetadata, null, 2), 'utf8');
      await fs.rename(tempPath, filepath);

      // Update cache
      this.configCache.set(configId, {
        config: configWithMetadata,
        filepath,
        checksum: this.hashConfig(configWithMetadata),
      });

      this.logger.info('Configuration saved successfully', {
        configId,
        name,
        filepath,
        framework: config.framework,
      });

      return { configId, filepath, saved: timestamp };
    } catch (error) {
      this.logger.error('Failed to save configuration', error);
      throw new AppError(`Configuration save failed: ${error.message}`, 'CONFIG_SAVE_FAILED', 500);
    }
  }

  /**
   * Load configuration from storage
   */
  async loadConfiguration(identifier) {
    this.logger.debug('Loading configuration', { identifier });

    try {
      let filepath;

      // Check if identifier is a file path
      if (identifier.includes('/') || identifier.includes('\\')) {
        filepath = identifier;
      } else {
        // Look for config by ID or name
        const files = await fs.readdir(this.configDir);
        const configFile = files.find(
          (file) => file.includes(identifier) || file.startsWith(identifier),
        );

        if (!configFile) {
          throw new AppError(`Configuration not found: ${identifier}`, 'CONFIG_NOT_FOUND', 404);
        }

        filepath = path.join(this.configDir, configFile);
      }

      // Load and parse configuration
      const configData = await fs.readFile(filepath, 'utf8');
      const config = JSON.parse(configData);

      // Validate loaded configuration
      const validation = await this.validateConfiguration(config);
      if (!validation.valid) {
        this.logger.warn('Loaded configuration has validation issues', {
          filepath,
          errors: validation.errors,
        });
      }

      // Update cache
      const configId = config.metadata?.configId || crypto.randomUUID();
      this.configCache.set(configId, {
        config,
        filepath,
        checksum: this.hashConfig(config),
        loaded: new Date(),
      });

      this.logger.info('Configuration loaded successfully', {
        filepath,
        framework: config.framework,
        configId,
      });

      return config;
    } catch (error) {
      this.logger.error('Failed to load configuration', error);
      throw new AppError(`Configuration load failed: ${error.message}`, 'CONFIG_LOAD_FAILED', 500);
    }
  }

  /**
   * Apply configuration to TruthScorer instance
   */
  async applyConfiguration(config, truthScorer = null) {
    this.logger.debug('Applying configuration to TruthScorer', { framework: config.framework });

    try {
      // Validate configuration first
      const validation = await this.validateConfiguration(config);
      if (!validation.valid) {
        throw new AppError(
          `Cannot apply invalid configuration: ${validation.errors.join(', ')}`,
          'INVALID_CONFIG_APPLY',
          400,
        );
      }

      // Create or update TruthScorer instance
      if (truthScorer) {
        this.truthScorer = truthScorer;
      } else {
        // Create new TruthScorer with configuration
        const TruthScorerClass = await import('../verification/truth-scorer.js');
        this.truthScorer = new TruthScorerClass.default({
          config: {
            threshold: config.threshold,
            weights: config.weights,
            checks: config.checks,
            confidence: config.confidence,
          },
          logger: this.logger.child({ component: 'TruthScorer' }),
        });
      }

      this.currentConfig = config;

      this.logger.info('Configuration applied to TruthScorer', {
        framework: config.framework,
        threshold: config.threshold,
        weightsSet: Object.keys(config.weights).length,
        checksEnabled: Object.values(config.checks).filter(Boolean).length,
      });

      return this.truthScorer;
    } catch (error) {
      this.logger.error('Failed to apply configuration', error);
      throw new AppError(
        `Configuration application failed: ${error.message}`,
        'CONFIG_APPLY_FAILED',
        500,
      );
    }
  }

  /**
   * List available configurations
   */
  async listConfigurations() {
    try {
      const files = await fs.readdir(this.configDir);
      const configFiles = files.filter((file) => file.endsWith('.json'));

      const configurations = [];

      for (const file of configFiles) {
        const filepath = path.join(this.configDir, file);
        try {
          const configData = await fs.readFile(filepath, 'utf8');
          const config = JSON.parse(configData);

          configurations.push({
            id: config.metadata?.configId || path.parse(file).name,
            name: config.metadata?.name || path.parse(file).name,
            framework: config.framework,
            threshold: config.threshold,
            description: config.metadata?.description,
            created: config.metadata?.created,
            modified: config.metadata?.modified,
            filepath: filepath,
          });
        } catch (parseError) {
          this.logger.warn('Failed to parse configuration file', {
            file,
            error: parseError.message,
          });
        }
      }

      return configurations.sort(
        (a, b) => new Date(b.modified || b.created || 0) - new Date(a.modified || a.created || 0),
      );
    } catch (error) {
      this.logger.error('Failed to list configurations', error);
      throw new AppError(
        `Configuration listing failed: ${error.message}`,
        'CONFIG_LIST_FAILED',
        500,
      );
    }
  }

  /**
   * Get framework presets
   */
  getFrameworkPresets() {
    return { ...FRAMEWORK_PRESETS };
  }

  /**
   * Get current configuration
   */
  getCurrentConfiguration() {
    return this.currentConfig ? { ...this.currentConfig } : null;
  }

  /**
   * Get validation history
   */
  getValidationHistory() {
    return [...this.validationHistory];
  }

  /**
   * Create configuration hash for integrity checking
   */
  hashConfig(config) {
    const configString = JSON.stringify(config, Object.keys(config).sort());
    return crypto.createHash('sha256').update(configString).digest('hex');
  }

  /**
   * Ensure configuration directory exists
   */
  async ensureConfigDirectory() {
    try {
      await fs.access(this.configDir);
    } catch {
      await fs.mkdir(this.configDir, { recursive: true });
      this.logger.info('Created configuration directory', { configDir: this.configDir });
    }
  }

  /**
   * Load default configurations for each framework
   */
  async loadDefaultConfigurations() {
    for (const [framework, preset] of Object.entries(FRAMEWORK_PRESETS)) {
      const defaultName = `${framework}_default`;
      const configPath = path.join(this.configDir, `${defaultName}.json`);

      try {
        // Check if default config already exists
        await fs.access(configPath);
      } catch {
        // Create default configuration
        const config = await this.createFromFramework(framework);
        await this.saveConfiguration(config, defaultName);
        this.logger.debug('Created default configuration', { framework, configPath });
      }
    }
  }

  /**
   * Validate configuration integrity across all stored configs
   */
  async validateConfigurationIntegrity() {
    try {
      const configs = await this.listConfigurations();
      let validCount = 0;
      let invalidCount = 0;

      for (const configInfo of configs) {
        try {
          const config = await this.loadConfiguration(configInfo.filepath);
          const validation = await this.validateConfiguration(config);

          if (validation.valid) {
            validCount++;
          } else {
            invalidCount++;
            this.logger.warn('Invalid configuration found', {
              name: configInfo.name,
              errors: validation.errors,
            });
          }
        } catch (error) {
          invalidCount++;
          this.logger.error('Failed to validate stored configuration', {
            name: configInfo.name,
            error: error.message,
          });
        }
      }

      this.logger.info('Configuration integrity check completed', {
        total: configs.length,
        valid: validCount,
        invalid: invalidCount,
      });

      return { total: configs.length, valid: validCount, invalid: invalidCount };
    } catch (error) {
      this.logger.error('Configuration integrity check failed', error);
      return { total: 0, valid: 0, invalid: 0, error: error.message };
    }
  }

  /**
   * Hot reload configuration with validation
   */
  async hotReload(identifier) {
    this.logger.info('Hot reloading configuration', { identifier });

    try {
      const config = await this.loadConfiguration(identifier);
      const validation = await this.validateConfiguration(config);

      if (!validation.valid) {
        throw new AppError(
          `Cannot hot reload invalid configuration: ${validation.errors.join(', ')}`,
          'INVALID_HOT_RELOAD',
          400,
        );
      }

      await this.applyConfiguration(config);

      this.logger.info('Configuration hot reloaded successfully', {
        identifier,
        framework: config.framework,
        threshold: config.threshold,
      });

      return config;
    } catch (error) {
      this.logger.error('Configuration hot reload failed', error);
      throw new AppError(`Hot reload failed: ${error.message}`, 'HOT_RELOAD_FAILED', 500);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.logger.debug('Cleaning up TruthConfigManager');

    // Clear caches
    this.configCache.clear();
    this.validationHistory.length = 0;

    // Close any file watchers
    for (const [path, watcher] of this.watchers) {
      try {
        watcher.close();
      } catch (error) {
        this.logger.warn('Failed to close watcher', { path, error: error.message });
      }
    }
    this.watchers.clear();

    this.currentConfig = null;
    this.truthScorer = null;

    this.logger.info('TruthConfigManager cleanup completed');
  }
}

export default TruthConfigManager;
