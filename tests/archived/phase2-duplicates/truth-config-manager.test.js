import { describe, test, it, expect, beforeEach, afterEach } from '@jest/globals';
/**
 * Truth Config Manager Test Suite
 *
 * Comprehensive tests for TruthConfigManager including:
 * - Schema validation
 * - Framework presets
 * - Byzantine fault tolerance
 * - TruthScorer integration
 * - Configuration persistence
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import TruthConfigManager from '../src/validation/truth-config-manager.js';
import TruthScorer from '../src/verification/truth-scorer.js';

describe('TruthConfigManager', () => {
  let configManager;
  let testConfigDir;
  let mockLogger;

  beforeEach(async () => {
    // Create temporary test directory
    testConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'truth-config-test-'));

    // Mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => mockLogger)
    };

    // Initialize config manager
    configManager = new TruthConfigManager({
      configDir: testConfigDir,
      logger: mockLogger
    });

    await configManager.initialize();
  });

  afterEach(async () => {
    // Cleanup
    await configManager.cleanup();
    await fs.rm(testConfigDir, { recursive: true, force: true });
  });

  describe('Framework Presets', () => {
    it('should provide TDD configuration with threshold ≥0.90', async () => {
      const config = await configManager.createFromFramework('TDD');

      expect(config.framework).toBe('TDD');
      expect(config.threshold).toBeGreaterThanOrEqual(0.90);
      expect(config.weights.agentReliability).toBeGreaterThan(0);
      expect(config.checks.historicalValidation).toBe(true);
      expect(config.checks.crossAgentValidation).toBe(true);
    });

    it('should provide BDD configuration with threshold ≥0.85', async () => {
      const config = await configManager.createFromFramework('BDD');

      expect(config.framework).toBe('BDD');
      expect(config.threshold).toBeGreaterThanOrEqual(0.85);
      expect(config.threshold).toBeLessThan(0.90);
      expect(config.weights.crossValidation).toBeGreaterThanOrEqual(0.25);
    });

    it('should provide SPARC configuration with threshold ≥0.80', async () => {
      const config = await configManager.createFromFramework('SPARC');

      expect(config.framework).toBe('SPARC');
      expect(config.threshold).toBeGreaterThanOrEqual(0.80);
      expect(config.threshold).toBeLessThan(0.85);
      expect(config.checks.logicalValidation).toBe(true);
    });

    it('should reject unknown framework', async () => {
      await expect(configManager.createFromFramework('UNKNOWN'))
        .rejects.toThrow('Unknown framework: UNKNOWN');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate correct configuration', async () => {
      const config = await configManager.createFromFramework('TDD');
      const validation = await configManager.validateConfiguration(config);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.byzantineFaultTolerant).toBe(true);
    });

    it('should reject configuration with invalid threshold', async () => {
      const config = await configManager.createFromFramework('TDD');
      config.threshold = 1.5; // Invalid: > 1.0

      const validation = await configManager.validateConfiguration(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(error => error.includes('Threshold'))).toBe(true);
    });

    it('should reject configuration with invalid weight sum', async () => {
      const config = await configManager.createFromFramework('TDD');
      config.weights.agentReliability = 0.8; // Makes sum > 1.0

      const validation = await configManager.validateConfiguration(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(error => error.includes('Weight sum'))).toBe(true);
    });

    it('should detect Byzantine fault patterns', async () => {
      const maliciousConfig = {
        framework: 'TDD',
        threshold: 0.01, // Suspiciously low
        weights: {
          agentReliability: 0.95, // Excessive concentration
          crossValidation: 0.01,
          externalVerification: 0.01,
          factualConsistency: 0.01,
          logicalCoherence: 0.02
        },
        checks: {
          historicalValidation: false,
          crossAgentValidation: false,
          externalValidation: false,
          logicalValidation: false,
          statisticalValidation: false // All disabled
        },
        confidence: {
          level: 0.6,
          minSampleSize: 1,
          maxErrorMargin: 0.4
        }
      };

      const validation = await configManager.validateConfiguration(maliciousConfig);
      expect(validation.byzantineFaultTolerant).toBe(false);
      expect(validation.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Persistence', () => {
    it('should save and load configuration', async () => {
      const originalConfig = await configManager.createFromFramework('TDD');
      const { configId } = await configManager.saveConfiguration(originalConfig, 'test-config');

      const loadedConfig = await configManager.loadConfiguration('test-config');

      expect(loadedConfig.framework).toBe(originalConfig.framework);
      expect(loadedConfig.threshold).toBe(originalConfig.threshold);
      expect(loadedConfig.metadata.configId).toBeTruthy();
    });

    it('should list saved configurations', async () => {
      const config1 = await configManager.createFromFramework('TDD');
      const config2 = await configManager.createFromFramework('BDD');

      await configManager.saveConfiguration(config1, 'tdd-config');
      await configManager.saveConfiguration(config2, 'bdd-config');

      const configurations = await configManager.listConfigurations();

      expect(configurations.length).toBeGreaterThanOrEqual(2);
      expect(configurations.some(c => c.framework === 'TDD')).toBe(true);
      expect(configurations.some(c => c.framework === 'BDD')).toBe(true);
    });

    it('should reject saving invalid configuration', async () => {
      const invalidConfig = { framework: 'INVALID' };

      await expect(configManager.saveConfiguration(invalidConfig, 'invalid'))
        .rejects.toThrow('Cannot save invalid configuration');
    });
  });

  describe('TruthScorer Integration', () => {
    it('should apply configuration to new TruthScorer', async () => {
      const config = await configManager.createFromFramework('TDD');
      const truthScorer = await configManager.applyConfiguration(config);

      expect(truthScorer).toBeInstanceOf(TruthScorer);
      expect(configManager.getCurrentConfiguration()).toEqual(config);
    });

    it('should apply configuration to existing TruthScorer', async () => {
      const existingScorer = new TruthScorer({ logger: mockLogger });
      const config = await configManager.createFromFramework('BDD');

      const scorer = await configManager.applyConfiguration(config, existingScorer);

      expect(scorer).toBe(existingScorer);
      expect(configManager.getCurrentConfiguration().framework).toBe('BDD');
    });

    it('should reject applying invalid configuration', async () => {
      const invalidConfig = {
        framework: 'TDD',
        threshold: 'invalid', // Wrong type
        weights: {},
        checks: {},
        confidence: {}
      };

      await expect(configManager.applyConfiguration(invalidConfig))
        .rejects.toThrow('Cannot apply invalid configuration');
    });
  });

  describe('Weight Customization', () => {
    it('should allow weight customization', async () => {
      const customWeights = {
        agentReliability: 0.4,
        crossValidation: 0.3,
        externalVerification: 0.1,
        factualConsistency: 0.1,
        logicalCoherence: 0.1
      };

      const config = await configManager.createFromFramework('TDD', {
        weights: customWeights
      });

      expect(config.weights).toEqual(customWeights);

      const validation = await configManager.validateConfiguration(config);
      expect(validation.valid).toBe(true);
    });

    it('should reject invalid weight customization', async () => {
      const invalidWeights = {
        agentReliability: 0.8, // Sum > 1.0
        crossValidation: 0.8,
        externalVerification: 0.1,
        factualConsistency: 0.1,
        logicalCoherence: 0.1
      };

      const config = await configManager.createFromFramework('TDD', {
        weights: invalidWeights
      });

      const validation = await configManager.validateConfiguration(config);
      expect(validation.valid).toBe(false);
    });
  });

  describe('Hot Reload', () => {
    it('should hot reload valid configuration', async () => {
      const config = await configManager.createFromFramework('SPARC');
      const { configId } = await configManager.saveConfiguration(config, 'sparc-config');

      const reloadedConfig = await configManager.hotReload('sparc-config');

      expect(reloadedConfig.framework).toBe('SPARC');
      expect(configManager.getCurrentConfiguration()).toEqual(config);
    });

    it('should reject hot reloading invalid configuration', async () => {
      // Create invalid config file directly
      const invalidConfig = { framework: 'INVALID' };
      const filepath = path.join(testConfigDir, 'invalid-config.json');
      await fs.writeFile(filepath, JSON.stringify(invalidConfig));

      await expect(configManager.hotReload('invalid-config'))
        .rejects.toThrow('Cannot hot reload invalid configuration');
    });
  });

  describe('Framework Coherence', () => {
    it('should warn about TDD coherence issues', async () => {
      const config = await configManager.createFromFramework('TDD', {
        threshold: 0.7, // Low for TDD
        checks: { ...configManager.getFrameworkPresets().TDD.checks, historicalValidation: false }
      });

      const validation = await configManager.validateConfiguration(config);
      expect(validation.warnings.some(w => w.includes('TDD'))).toBe(true);
    });

    it('should warn about BDD coherence issues', async () => {
      const config = await configManager.createFromFramework('BDD', {
        weights: {
          ...configManager.getFrameworkPresets().BDD.weights,
          crossValidation: 0.1 // Too low for BDD
        }
      });

      const validation = await configManager.validateConfiguration(config);
      expect(validation.warnings.some(w => w.includes('cross-validation'))).toBe(true);
    });

    it('should warn about SPARC coherence issues', async () => {
      const config = await configManager.createFromFramework('SPARC', {
        checks: {
          ...configManager.getFrameworkPresets().SPARC.checks,
          logicalValidation: false
        },
        weights: {
          ...configManager.getFrameworkPresets().SPARC.weights,
          externalVerification: 0.05 // Too low for SPARC
        }
      });

      const validation = await configManager.validateConfiguration(config);
      expect(validation.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Integrity', () => {
    it('should detect configuration hash consistency', async () => {
      const config = await configManager.createFromFramework('TDD');
      const hash1 = configManager.hashConfig(config);
      const hash2 = configManager.hashConfig(config);

      expect(hash1).toBe(hash2);

      // Modify config
      const modifiedConfig = { ...config, threshold: 0.95 };
      const hash3 = configManager.hashConfig(modifiedConfig);

      expect(hash1).not.toBe(hash3);
    });

    it('should validate configuration integrity on initialization', async () => {
      // Create some configs
      const config1 = await configManager.createFromFramework('TDD');
      const config2 = await configManager.createFromFramework('BDD');

      await configManager.saveConfiguration(config1, 'integrity-test-1');
      await configManager.saveConfiguration(config2, 'integrity-test-2');

      // Check integrity
      const integrity = await configManager.validateConfigurationIntegrity();

      expect(integrity.total).toBeGreaterThanOrEqual(2);
      expect(integrity.valid).toBeGreaterThanOrEqual(2);
      expect(integrity.invalid).toBe(0);
    });
  });

  describe('Advanced Features', () => {
    it('should maintain validation history', async () => {
      const config = await configManager.createFromFramework('TDD');

      await configManager.validateConfiguration(config);
      await configManager.validateConfiguration(config);

      const history = configManager.getValidationHistory();
      expect(history.length).toBe(2);
      expect(history[0].validationId).toBeTruthy();
    });

    it('should handle configuration anomaly detection', async () => {
      const anomalousConfig = await configManager.createFromFramework('TDD', {
        threshold: 0.5 // Significant deviation from TDD preset (0.90)
      });

      const validation = await configManager.validateConfiguration(anomalousConfig);
      expect(validation.warnings.some(w => w.includes('deviates significantly'))).toBe(true);
    });

    it('should provide framework presets', () => {
      const presets = configManager.getFrameworkPresets();

      expect(presets).toHaveProperty('TDD');
      expect(presets).toHaveProperty('BDD');
      expect(presets).toHaveProperty('SPARC');
      expect(presets).toHaveProperty('CUSTOM');

      expect(presets.TDD.threshold).toBeGreaterThanOrEqual(0.90);
      expect(presets.BDD.threshold).toBeGreaterThanOrEqual(0.85);
      expect(presets.SPARC.threshold).toBeGreaterThanOrEqual(0.80);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration files gracefully', async () => {
      await expect(configManager.loadConfiguration('non-existent'))
        .rejects.toThrow('Configuration not found');
    });

    it('should handle corrupted configuration files', async () => {
      // Create corrupted config file
      const corruptedPath = path.join(testConfigDir, 'corrupted.json');
      await fs.writeFile(corruptedPath, '{ invalid json');

      await expect(configManager.loadConfiguration(corruptedPath))
        .rejects.toThrow('Configuration load failed');
    });

    it('should handle initialization failures gracefully', async () => {
      // Try to initialize with invalid directory
      const invalidManager = new TruthConfigManager({
        configDir: '/invalid/path/that/does/not/exist/and/cannot/be/created',
        logger: mockLogger
      });

      await expect(invalidManager.initialize()).rejects.toThrow();
    });
  });

  describe('Schema Validation Edge Cases', () => {
    it('should validate nested object structures', async () => {
      const config = {
        framework: 'TDD',
        threshold: 0.9,
        weights: {
          agentReliability: 0.3,
          crossValidation: 0.25,
          externalVerification: 0.2,
          factualConsistency: 0.15,
          logicalCoherence: 0.1
        },
        checks: {
          historicalValidation: true,
          crossAgentValidation: true,
          externalValidation: true,
          logicalValidation: true,
          statisticalValidation: true
        },
        confidence: {
          level: 0.95,
          minSampleSize: 10,
          maxErrorMargin: 0.05
        }
      };

      const validation = await configManager.validateConfiguration(config);
      expect(validation.valid).toBe(true);
    });

    it('should reject null or undefined configuration', async () => {
      const validation1 = await configManager.validateConfiguration(null);
      const validation2 = await configManager.validateConfiguration(undefined);

      expect(validation1.valid).toBe(false);
      expect(validation2.valid).toBe(false);
    });

    it('should handle missing required fields', async () => {
      const incompleteConfig = {
        framework: 'TDD'
        // Missing threshold, weights, checks, confidence
      };

      const validation = await configManager.validateConfiguration(incompleteConfig);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});

/**
 * Integration Tests with Real TruthScorer
 */
describe('TruthConfigManager Integration', () => {
  let configManager;
  let testConfigDir;

  beforeEach(async () => {
    testConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'truth-config-integration-'));
    configManager = new TruthConfigManager({ configDir: testConfigDir });
    await configManager.initialize();
  });

  afterEach(async () => {
    await configManager.cleanup();
    await fs.rm(testConfigDir, { recursive: true, force: true });
  });

  it('should create functional TruthScorer with TDD configuration', async () => {
    const config = await configManager.createFromFramework('TDD');
    const truthScorer = await configManager.applyConfiguration(config);

    // Create mock claim for testing
    const mockClaim = {
      id: 'test-claim-1',
      agentId: 'test-agent',
      type: 'task_completion',
      title: 'Test Claim',
      description: 'Test claim description',
      data: { success: true },
      metrics: { accuracy: 0.95, executionTime: 1000 },
      evidence: [],
      references: [],
      status: 'pending',
      confidence: 0.9,
      submittedAt: new Date(),
      metadata: {}
    };

    // Test truth scoring with applied configuration
    const truthScore = await truthScorer.scoreClaim(mockClaim);

    expect(truthScore).toHaveProperty('score');
    expect(truthScore.score).toBeGreaterThanOrEqual(0);
    expect(truthScore.score).toBeLessThanOrEqual(1);
    expect(truthScore).toHaveProperty('components');
    expect(truthScore).toHaveProperty('confidence');
    expect(truthScore).toHaveProperty('evidence');
    expect(truthScore).toHaveProperty('timestamp');
  });

  it('should validate truth scores meet framework thresholds', async () => {
    const tddConfig = await configManager.createFromFramework('TDD');
    const truthScorer = await configManager.applyConfiguration(tddConfig);

    const mockHighQualityClaim = {
      id: 'high-quality-claim',
      agentId: 'reliable-agent',
      type: 'task_completion',
      title: 'High Quality Claim',
      description: 'Well-validated claim',
      data: { success: true, quality: 'high' },
      metrics: { accuracy: 0.98, precision: 0.97, recall: 0.96, executionTime: 500 },
      evidence: [
        { type: 'test_result', source: 'automated_test', timestamp: new Date(), data: { passed: true }, reliability: 0.95, verifiable: true }
      ],
      references: ['test-suite-1', 'benchmark-1'],
      status: 'pending',
      confidence: 0.95,
      submittedAt: new Date(),
      metadata: { framework: 'TDD' }
    };

    const truthScore = await truthScorer.scoreClaim(mockHighQualityClaim);
    const isValid = truthScorer.validateScore(truthScore);

    // For TDD framework, expect high standards
    expect(truthScore.score).toBeGreaterThan(0.8);
    expect(isValid).toBe(truthScore.score >= tddConfig.threshold);
  });

  it('should demonstrate framework-specific behavior differences', async () => {
    const tddConfig = await configManager.createFromFramework('TDD');
    const bddConfig = await configManager.createFromFramework('BDD');
    const sparcConfig = await configManager.createFromFramework('SPARC');

    const mockClaim = {
      id: 'framework-test-claim',
      agentId: 'test-agent',
      type: 'task_completion',
      title: 'Framework Test',
      description: 'Testing framework differences',
      data: { success: true },
      metrics: { accuracy: 0.88 },
      evidence: [],
      references: [],
      status: 'pending',
      confidence: 0.85,
      submittedAt: new Date(),
      metadata: {}
    };

    // Test with TDD configuration (high threshold)
    const tddScorer = await configManager.applyConfiguration(tddConfig);
    const tddScore = await tddScorer.scoreClaim(mockClaim);
    const tddValid = tddScorer.validateScore(tddScore);

    // Test with BDD configuration (medium threshold)
    const bddScorer = await configManager.applyConfiguration(bddConfig);
    const bddScore = await bddScorer.scoreClaim(mockClaim);
    const bddValid = bddScorer.validateScore(bddScore);

    // Test with SPARC configuration (lower threshold)
    const sparcScorer = await configManager.applyConfiguration(sparcConfig);
    const sparcScore = await sparcScorer.scoreClaim(mockClaim);
    const sparcValid = sparcScorer.validateScore(sparcScore);

    // Verify framework thresholds are working as expected
    expect(tddConfig.threshold).toBeGreaterThan(bddConfig.threshold);
    expect(bddConfig.threshold).toBeGreaterThan(sparcConfig.threshold);

    // Log results for analysis
    console.log('Framework Comparison Results:', {
      TDD: { score: tddScore.score, valid: tddValid, threshold: tddConfig.threshold },
      BDD: { score: bddScore.score, valid: bddValid, threshold: bddConfig.threshold },
      SPARC: { score: sparcScore.score, valid: sparcValid, threshold: sparcConfig.threshold }
    });
  });
});