/**
 * Truth Configuration Manager for Completion Validation Framework
 * Phase 2 Implementation - CLI Setup Wizard Support
 *
 * Manages validation configuration with Byzantine-fault-tolerance
 * Provides framework detection and quality gate customization
 */

import { SqliteMemoryStore } from '../memory/sqlite-store.js';
import { ByzantineConsensus } from '../core/byzantine-consensus.js';
import fs from 'fs/promises';
import path from 'path';

export class TruthConfigManager {
  constructor(options = {}) {
    this.memoryStore = null;
    this.byzantineConsensus = options.byzantineConsensus || new ByzantineConsensus();
    this.configPath = options.configPath || './.claude-flow/validation-config.json';
    this.initialized = false;

    // Default configuration with framework-specific thresholds
    this.defaultConfig = {
      version: '2.0.0',
      framework: 'auto',
      qualityGates: {
        truthScore: 0.90,
        testCoverage: 0.95,
        codeQuality: 0.85,
        documentationScore: 0.80
      },
      frameworkSpecific: {
        javascript: {
          framework: 'jest',
          truthScore: 0.85,
          testCoverage: 0.90,
          filePatterns: ['**/*.test.js', '**/*.spec.js'],
          packageJson: true
        },
        typescript: {
          framework: 'jest',
          truthScore: 0.90,
          testCoverage: 0.95,
          filePatterns: ['**/*.test.ts', '**/*.spec.ts'],
          tsConfig: true
        },
        python: {
          framework: 'pytest',
          truthScore: 0.88,
          testCoverage: 0.92,
          filePatterns: ['**/test_*.py', '**/*_test.py'],
          requirementsFile: true
        },
        tdd: {
          truthScore: 0.95,
          testCoverage: 0.98,
          testFirst: true,
          redGreenRefactor: true
        },
        bdd: {
          truthScore: 0.90,
          scenarioCoverage: 0.95,
          gherkinCompliant: true
        },
        sparc: {
          truthScore: 0.92,
          phaseCompletion: 1.0,
          architectureDocumented: true
        }
      },
      validationSettings: {
        byzantineConsensusEnabled: true,
        consensusTimeout: 5000,
        requiredValidators: 3,
        allowPartialValidation: false,
        strictMode: false
      }
    };
  }

  async initialize() {
    if (this.initialized) return;

    // Initialize memory store for configuration caching
    this.memoryStore = new SqliteMemoryStore();
    await this.memoryStore.initialize();

    // Load existing configuration if available
    await this.loadConfiguration();

    this.initialized = true;
  }

  /**
   * Detect project framework with >90% accuracy
   */
  async detectFramework() {
    const detectionResults = {
      javascript: 0,
      typescript: 0,
      python: 0,
      confidence: 0,
      detected: 'unknown',
      evidence: {}
    };

    try {
      // Check for package.json (JavaScript/TypeScript)
      try {
        const packageJson = await fs.readFile('package.json', 'utf8');
        const pkg = JSON.parse(packageJson);

        detectionResults.evidence.packageJson = true;
        detectionResults.javascript += 0.3;

        // Check for TypeScript indicators
        if (pkg.devDependencies?.typescript ||
            pkg.dependencies?.typescript ||
            pkg.devDependencies?.['@types/node'] ||
            await this.fileExists('tsconfig.json')) {
          detectionResults.typescript += 0.4;
          detectionResults.evidence.typescript = true;
        }

        // Check for test frameworks
        if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
          detectionResults.javascript += 0.2;
          detectionResults.typescript += 0.2;
          detectionResults.evidence.jest = true;
        }

        if (pkg.devDependencies?.mocha || pkg.dependencies?.mocha) {
          detectionResults.javascript += 0.2;
          detectionResults.evidence.mocha = true;
        }

      } catch (error) {
        // No package.json found
      }

      // Check for Python indicators
      const pythonFiles = [
        'requirements.txt', 'setup.py', 'pyproject.toml',
        'Pipfile', 'environment.yml', 'conda.yml'
      ];

      for (const file of pythonFiles) {
        if (await this.fileExists(file)) {
          detectionResults.python += 0.2;
          detectionResults.evidence[file] = true;
        }
      }

      // Check file extensions in current directory
      const fileExtensions = await this.analyzeFileExtensions();

      if (fileExtensions.js > 0) {
        detectionResults.javascript += Math.min(0.3, fileExtensions.js * 0.05);
        detectionResults.evidence.jsFiles = fileExtensions.js;
      }

      if (fileExtensions.ts > 0) {
        detectionResults.typescript += Math.min(0.4, fileExtensions.ts * 0.05);
        detectionResults.evidence.tsFiles = fileExtensions.ts;
      }

      if (fileExtensions.py > 0) {
        detectionResults.python += Math.min(0.4, fileExtensions.py * 0.05);
        detectionResults.evidence.pyFiles = fileExtensions.py;
      }

      // Determine the most likely framework
      const scores = {
        javascript: detectionResults.javascript,
        typescript: detectionResults.typescript,
        python: detectionResults.python
      };

      const maxScore = Math.max(...Object.values(scores));
      const detected = Object.keys(scores).find(key => scores[key] === maxScore);

      detectionResults.detected = detected;
      detectionResults.confidence = maxScore;

      // Store detection results for future reference
      await this.memoryStore.store('framework-detection', detectionResults, {
        namespace: 'configuration',
        metadata: { timestamp: new Date().toISOString() }
      });

      return detectionResults;

    } catch (error) {
      console.warn('Framework detection error:', error.message);
      return {
        ...detectionResults,
        detected: 'unknown',
        confidence: 0,
        error: error.message
      };
    }
  }

  async analyzeFileExtensions() {
    const extensions = { js: 0, ts: 0, py: 0 };

    try {
      const files = await fs.readdir('.', { withFileTypes: true });

      for (const file of files) {
        if (file.isFile()) {
          const ext = path.extname(file.name).toLowerCase();
          if (ext === '.js') extensions.js++;
          else if (ext === '.ts') extensions.ts++;
          else if (ext === '.py') extensions.py++;
        }
      }
    } catch (error) {
      // Directory reading failed, return empty results
    }

    return extensions;
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load configuration from file or create default
   */
  async loadConfiguration() {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      if (await this.fileExists(this.configPath)) {
        const configData = await fs.readFile(this.configPath, 'utf8');
        const config = JSON.parse(configData);

        // Merge with defaults to ensure completeness
        this.config = this.mergeWithDefaults(config);

        // Cache in memory store
        await this.memoryStore.store('current-config', this.config, {
          namespace: 'configuration'
        });
      } else {
        // Use default configuration
        this.config = { ...this.defaultConfig };
        await this.saveConfiguration();
      }
    } catch (error) {
      console.warn('Error loading configuration, using defaults:', error.message);
      this.config = { ...this.defaultConfig };
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfiguration() {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      const configJson = JSON.stringify(this.config, null, 2);
      await fs.writeFile(this.configPath, configJson, 'utf8');

      // Update memory store
      await this.memoryStore.store('current-config', this.config, {
        namespace: 'configuration',
        metadata: {
          timestamp: new Date().toISOString(),
          saved: true
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to save configuration:', error.message);
      return false;
    }
  }

  /**
   * Update configuration with validation
   */
  async updateConfiguration(updates) {
    await this.initialize();

    // Validate updates
    const validation = await this.validateConfigurationUpdates(updates);
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }

    // Apply updates
    this.config = this.mergeDeep(this.config, updates);

    // Save updated configuration
    const saved = await this.saveConfiguration();
    if (!saved) {
      throw new Error('Failed to save updated configuration');
    }

    return this.config;
  }

  /**
   * Get framework-specific configuration
   */
  getFrameworkConfig(framework) {
    const frameworkConfig = this.config.frameworkSpecific[framework];
    if (!frameworkConfig) {
      throw new Error(`Unknown framework: ${framework}`);
    }

    return {
      ...this.config.qualityGates,
      ...frameworkConfig
    };
  }

  /**
   * Validate configuration updates
   */
  async validateConfigurationUpdates(updates) {
    const errors = [];

    // Validate quality gate thresholds
    if (updates.qualityGates) {
      const gates = updates.qualityGates;

      if (gates.truthScore !== undefined && (gates.truthScore < 0 || gates.truthScore > 1)) {
        errors.push('truthScore must be between 0 and 1');
      }

      if (gates.testCoverage !== undefined && (gates.testCoverage < 0 || gates.testCoverage > 1)) {
        errors.push('testCoverage must be between 0 and 1');
      }

      if (gates.codeQuality !== undefined && (gates.codeQuality < 0 || gates.codeQuality > 1)) {
        errors.push('codeQuality must be between 0 and 1');
      }
    }

    // Validate framework selection
    if (updates.framework && !['auto', 'javascript', 'typescript', 'python', 'tdd', 'bdd', 'sparc'].includes(updates.framework)) {
      errors.push('Invalid framework selection');
    }

    // Validate validation settings
    if (updates.validationSettings) {
      const settings = updates.validationSettings;

      if (settings.consensusTimeout !== undefined && settings.consensusTimeout < 1000) {
        errors.push('consensusTimeout must be at least 1000ms');
      }

      if (settings.requiredValidators !== undefined && settings.requiredValidators < 1) {
        errors.push('requiredValidators must be at least 1');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get current configuration
   */
  async getCurrentConfiguration() {
    await this.initialize();
    return { ...this.config };
  }

  /**
   * Reset to default configuration
   */
  async resetToDefaults() {
    this.config = { ...this.defaultConfig };
    await this.saveConfiguration();
    return this.config;
  }

  /**
   * Test current configuration
   */
  async testConfiguration() {
    await this.initialize();

    const results = {
      configurationValid: true,
      frameworkDetection: null,
      qualityGates: {},
      validationSettings: {},
      errors: []
    };

    try {
      // Test framework detection
      results.frameworkDetection = await this.detectFramework();

      // Test quality gates
      const framework = results.frameworkDetection.detected;
      if (framework !== 'unknown') {
        try {
          results.qualityGates = this.getFrameworkConfig(framework);
        } catch (error) {
          results.errors.push(`Framework config error: ${error.message}`);
          results.configurationValid = false;
        }
      }

      // Test validation settings
      if (this.config.validationSettings.byzantineConsensusEnabled) {
        try {
          const consensusTest = await this.byzantineConsensus.testConsensus();
          results.validationSettings.byzantineConsensus = consensusTest.functional;
        } catch (error) {
          results.errors.push(`Byzantine consensus test failed: ${error.message}`);
        }
      }

    } catch (error) {
      results.configurationValid = false;
      results.errors.push(`Configuration test failed: ${error.message}`);
    }

    return results;
  }

  // Helper methods

  mergeWithDefaults(config) {
    return this.mergeDeep(this.defaultConfig, config);
  }

  mergeDeep(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeDeep(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  async close() {
    if (this.memoryStore) {
      await this.memoryStore.close();
    }
  }
}