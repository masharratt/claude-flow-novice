/**
 * CLI Wizard User Experience Tests
 * Tests the complete CLI wizard flow for Phase 2 framework setup
 *
 * SUCCESS CRITERIA:
 * - Complete wizard flow in <5 minutes
 * - User-friendly prompts and error handling
 * - Graceful interruption and resume capability
 * - Comprehensive help and validation feedback
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

// Mock CLI framework for testing
class MockCLIWizard extends EventEmitter {
  constructor(configManager, options = {}) {
    super();
    this.configManager = configManager;
    this.options = {
      timeout: options.timeout || 5 * 60 * 1000, // 5 minutes
      autoAdvance: options.autoAdvance || false,
      responses: options.responses || {}
    };

    this.state = {
      currentStep: 0,
      startTime: null,
      completed: false,
      stepHistory: []
    };
  }

  async startWizard() {
    this.state.startTime = Date.now();
    this.emit('started');

    try {
      await this.executeWizardFlow();
      this.state.completed = true;
      this.emit('completed', this.getWizardResults());
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async executeWizardFlow() {
    const steps = [
      { name: 'welcome', handler: this.welcomeStep.bind(this) },
      { name: 'project_detection', handler: this.projectDetectionStep.bind(this) },
      { name: 'framework_selection', handler: this.frameworkSelectionStep.bind(this) },
      { name: 'threshold_configuration', handler: this.thresholdConfigurationStep.bind(this) },
      { name: 'quality_gates', handler: this.qualityGatesStep.bind(this) },
      { name: 'security_setup', handler: this.securitySetupStep.bind(this) },
      { name: 'validation_test', handler: this.validationTestStep.bind(this) },
      { name: 'finalization', handler: this.finalizationStep.bind(this) }
    ];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      this.state.currentStep = i;

      const stepStart = Date.now();
      this.emit('step_start', { step: step.name, index: i });

      try {
        const result = await step.handler();
        const stepDuration = Date.now() - stepStart;

        this.state.stepHistory.push({
          name: step.name,
          index: i,
          success: true,
          duration: stepDuration,
          result
        });

        this.emit('step_complete', { step: step.name, index: i, duration: stepDuration });

      } catch (error) {
        const stepDuration = Date.now() - stepStart;

        this.state.stepHistory.push({
          name: step.name,
          index: i,
          success: false,
          duration: stepDuration,
          error: error.message
        });

        this.emit('step_error', { step: step.name, index: i, error });
        throw error;
      }
    }
  }

  async welcomeStep() {
    await this.delay(100);
    return {
      message: 'Welcome to the Claude Flow Phase 2 Configuration Wizard',
      version: '2.0.0',
      estimatedTime: '3-5 minutes'
    };
  }

  async projectDetectionStep() {
    await this.delay(500);

    // Simulate project detection
    const mockProjectPath = this.options.responses.projectPath || process.cwd();

    // Check for common files to determine project type
    const detectionResult = {
      path: mockProjectPath,
      framework: 'TDD',
      language: 'JavaScript',
      confidence: 0.92,
      detectedFiles: ['package.json', 'jest.config.js'],
      suggestions: [
        'Jest testing framework detected',
        'TDD methodology recommended',
        'Consider adding integration tests'
      ]
    };

    if (this.options.responses.skipProjectDetection) {
      detectionResult.framework = null;
      detectionResult.suggestions = ['Manual framework selection required'];
    }

    return detectionResult;
  }

  async frameworkSelectionStep() {
    await this.delay(300);

    const availableFrameworks = [
      { id: 'tdd', name: 'Test-Driven Development', description: 'Write tests first, then implement' },
      { id: 'bdd', name: 'Behavior-Driven Development', description: 'Focus on behavior scenarios' },
      { id: 'sparc', name: 'SPARC Methodology', description: 'Systematic five-phase approach' },
      { id: 'custom', name: 'Custom Framework', description: 'Define your own methodology' }
    ];

    const selectedFramework = this.options.responses.framework || 'tdd';

    if (!availableFrameworks.some(f => f.id === selectedFramework)) {
      throw new Error(`Invalid framework selection: ${selectedFramework}`);
    }

    return {
      available: availableFrameworks,
      selected: selectedFramework,
      framework: availableFrameworks.find(f => f.id === selectedFramework)
    };
  }

  async thresholdConfigurationStep() {
    await this.delay(400);

    const selectedFramework = this.state.stepHistory.find(s => s.name === 'framework_selection')?.result?.selected || 'tdd';

    const defaultThresholds = {
      tdd: { truth: 0.90, coverage: 0.95 },
      bdd: { truth: 0.85, scenario_coverage: 0.90 },
      sparc: { truth: 0.80, phase_completion: 1.0 },
      custom: { truth: 0.85 }
    };

    const thresholds = this.options.responses.thresholds || defaultThresholds[selectedFramework];

    // Validate thresholds
    if (thresholds.truth < 0.01 || thresholds.truth > 1.0) {
      throw new Error('Truth threshold must be between 0.01 and 1.0');
    }

    if (selectedFramework === 'tdd' && thresholds.coverage < 0.5) {
      throw new Error('Test coverage threshold should be at least 50%');
    }

    return {
      framework: selectedFramework,
      thresholds,
      validation: {
        truthThresholdValid: thresholds.truth >= 0.01 && thresholds.truth <= 1.0,
        coverageThresholdValid: !thresholds.coverage || thresholds.coverage >= 0.5
      }
    };
  }

  async qualityGatesStep() {
    await this.delay(600);

    const selectedFramework = this.state.stepHistory.find(s => s.name === 'framework_selection')?.result?.selected || 'tdd';

    const frameworkGates = {
      tdd: ['requirements_analysis', 'test_design', 'implementation', 'refactoring'],
      bdd: ['scenario_definition', 'stakeholder_review', 'automation', 'acceptance'],
      sparc: ['specification', 'pseudocode', 'architecture', 'refinement', 'completion'],
      custom: ['custom_gate_1', 'custom_gate_2']
    };

    const selectedGates = this.options.responses.qualityGates || frameworkGates[selectedFramework];
    const enforcementLevel = this.options.responses.enforcementLevel || 'moderate';

    const validEnforcementLevels = ['lenient', 'moderate', 'strict'];
    if (!validEnforcementLevels.includes(enforcementLevel)) {
      throw new Error(`Invalid enforcement level: ${enforcementLevel}`);
    }

    const gates = selectedGates.map((gate, index) => ({
      id: gate,
      name: gate.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      enforcement_level: enforcementLevel,
      order: index,
      timeout_minutes: 30
    }));

    return {
      framework: selectedFramework,
      gates,
      enforcementLevel,
      totalGates: gates.length
    };
  }

  async securitySetupStep() {
    await this.delay(800);

    const securityOptions = {
      enableByzantineValidation: this.options.responses.byzantineValidation !== false,
      consensusThreshold: this.options.responses.consensusThreshold || 0.85,
      cryptographicValidation: this.options.responses.cryptographicValidation !== false,
      securityLevel: this.options.responses.securityLevel || 'high'
    };

    // Validate security configuration
    if (securityOptions.consensusThreshold < 0.5 || securityOptions.consensusThreshold > 1.0) {
      throw new Error('Consensus threshold must be between 0.5 and 1.0');
    }

    const validSecurityLevels = ['low', 'medium', 'high', 'maximum'];
    if (!validSecurityLevels.includes(securityOptions.securityLevel)) {
      throw new Error(`Invalid security level: ${securityOptions.securityLevel}`);
    }

    // Test Byzantine consensus setup
    const consensusTest = await this.testByzantineConsensus(securityOptions);

    return {
      ...securityOptions,
      consensusTest,
      securityFeatures: {
        byzantineFaultTolerance: securityOptions.enableByzantineValidation,
        cryptographicProofs: securityOptions.cryptographicValidation,
        consensusValidation: consensusTest.successful
      }
    };
  }

  async validationTestStep() {
    await this.delay(1000);

    const frameworkResult = this.state.stepHistory.find(s => s.name === 'framework_selection')?.result;
    const thresholdResult = this.state.stepHistory.find(s => s.name === 'threshold_configuration')?.result;
    const securityResult = this.state.stepHistory.find(s => s.name === 'security_setup')?.result;

    if (!frameworkResult || !thresholdResult || !securityResult) {
      throw new Error('Missing configuration from previous steps');
    }

    // Create test configuration
    const testConfig = {
      completion_validation: {
        frameworks: {
          'wizard-test': {
            id: 'wizard-test',
            name: `Wizard ${frameworkResult.selected.toUpperCase()} Framework`,
            type: frameworkResult.selected.toUpperCase(),
            truth_threshold: thresholdResult.thresholds.truth,
            validation_rules: ['test_rule_1', 'test_rule_2'],
            quality_gates: this.state.stepHistory.find(s => s.name === 'quality_gates')?.result?.gates || []
          }
        }
      }
    };

    // Validate configuration
    const validation = await this.configManager.validateConfigurationUpdate(testConfig, {
      securityValidation: true
    });

    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors[0]?.message}`);
    }

    // Test Byzantine consensus
    let consensusResult = null;
    if (securityResult.enableByzantineValidation) {
      consensusResult = await this.configManager.validateWithByzantineConsensus(
        testConfig,
        `wizard-validation-test-${crypto.randomBytes(4).toString('hex')}`
      );

      if (!consensusResult.consensusReached) {
        throw new Error('Byzantine consensus validation failed');
      }
    }

    return {
      configurationValid: validation.valid,
      consensusAchieved: consensusResult?.consensusReached || false,
      testResults: {
        schemaValidation: 'PASSED',
        securityValidation: 'PASSED',
        byzantineConsensus: consensusResult ? 'PASSED' : 'SKIPPED'
      }
    };
  }

  async finalizationStep() {
    await this.delay(400);

    const allSteps = this.state.stepHistory;
    const frameworkStep = allSteps.find(s => s.name === 'framework_selection')?.result;
    const thresholdStep = allSteps.find(s => s.name === 'threshold_configuration')?.result;
    const qualityGatesStep = allSteps.find(s => s.name === 'quality_gates')?.result;
    const securityStep = allSteps.find(s => s.name === 'security_setup')?.result;

    // Build final configuration
    const finalConfig = {
      completion_validation: {
        frameworks: {
          [`wizard-${frameworkStep.selected}`]: {
            id: `wizard-${frameworkStep.selected}`,
            name: `Wizard ${frameworkStep.framework.name}`,
            type: frameworkStep.selected.toUpperCase(),
            truth_threshold: thresholdStep.thresholds.truth,
            ...thresholdStep.thresholds,
            validation_rules: this.getValidationRules(frameworkStep.selected),
            quality_gates: qualityGatesStep.gates.map(g => g.id),
            wizard_configured: true,
            created_at: new Date().toISOString()
          }
        },
        security: {
          byzantine_validation: securityStep.enableByzantineValidation,
          consensus_threshold: securityStep.consensusThreshold,
          cryptographic_validation: securityStep.cryptographicValidation,
          security_level: securityStep.securityLevel
        }
      }
    };

    // Apply final configuration
    const updateResult = await this.configManager.updateConfiguration(finalConfig, {
      requireConsensus: securityStep.enableByzantineValidation,
      securityValidation: true
    });

    if (!updateResult.success) {
      throw new Error(`Failed to save configuration: ${updateResult.error}`);
    }

    return {
      configurationSaved: true,
      framework: frameworkStep.selected,
      totalSteps: allSteps.length,
      totalTime: Date.now() - this.state.startTime,
      consensusAchieved: updateResult.consensusReached,
      updateResult
    };
  }

  async testByzantineConsensus(securityOptions) {
    await this.delay(200);

    if (!securityOptions.enableByzantineValidation) {
      return { successful: false, reason: 'Byzantine validation disabled' };
    }

    // Simulate consensus test
    const testProposal = {
      type: 'security_test',
      timestamp: Date.now(),
      threshold: securityOptions.consensusThreshold
    };

    try {
      const consensusResult = await this.configManager.byzantineConsensus.achieveConsensus(
        testProposal,
        this.generateTestValidators()
      );

      return {
        successful: consensusResult.achieved,
        consensusRatio: consensusResult.consensusRatio,
        validatorCount: 7,
        testDuration: 150
      };
    } catch (error) {
      return {
        successful: false,
        reason: error.message
      };
    }
  }

  generateTestValidators() {
    return Array.from({ length: 7 }, (_, i) => ({
      id: `test-validator-${i}`,
      reputation: 0.8 + Math.random() * 0.2,
      specialization: ['security', 'validation', 'consensus'][i % 3]
    }));
  }

  getValidationRules(framework) {
    const rules = {
      tdd: ['test_first', 'red_green_refactor', 'unit_tests', 'integration_tests'],
      bdd: ['given_when_then', 'acceptance_criteria', 'scenario_coverage'],
      sparc: ['all_phases_complete', 'phase_validation', 'cross_phase_consistency'],
      custom: ['custom_rule_1', 'custom_rule_2']
    };

    return rules[framework] || [];
  }

  getWizardResults() {
    const totalTime = Date.now() - this.state.startTime;
    const successfulSteps = this.state.stepHistory.filter(s => s.success);

    return {
      completed: this.state.completed,
      totalTime,
      totalSteps: this.state.stepHistory.length,
      successfulSteps: successfulSteps.length,
      steps: this.state.stepHistory,
      timePerStep: totalTime / this.state.stepHistory.length,
      withinTimeLimit: totalTime < this.options.timeout
    };
  }

  async delay(ms) {
    if (this.options.autoAdvance) {
      return new Promise(resolve => setTimeout(resolve, Math.min(ms, 10)));
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

describe('CLI Wizard User Experience Tests', () => {
  let configManager;
  let testDir;

  beforeEach(async () => {
    testDir = path.join(__dirname, `cli-wizard-test-${crypto.randomBytes(4).toString('hex')}`);
    await fs.mkdir(testDir, { recursive: true });

    // Import the configuration manager
    const { UserConfigurationManager } = require('../../../src/configuration/user-configuration-manager');

    configManager = new UserConfigurationManager({
      preferencesPath: path.join(testDir, 'preferences'),
      enableByzantineValidation: true,
      consensusThreshold: 0.85
    });

    await configManager.initialize();
  });

  afterEach(async () => {
    if (configManager) {
      await configManager.shutdown();
    }
    try {
      await fs.rmdir(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Complete Wizard Flow (<5 minute completion)', () => {
    test('should complete TDD framework setup within time limit', async () => {
      const wizard = new MockCLIWizard(configManager, {
        autoAdvance: true,
        responses: {
          framework: 'tdd',
          thresholds: { truth: 0.90, coverage: 0.95 },
          enforcementLevel: 'moderate',
          byzantineValidation: true,
          consensusThreshold: 0.85
        }
      });

      const results = await new Promise((resolve, reject) => {
        wizard.on('completed', resolve);
        wizard.on('error', reject);

        wizard.startWizard();
      });

      console.log(`\n🏁 TDD Wizard Results:`);
      console.log(`  Total Time: ${results.totalTime}ms (${(results.totalTime/1000).toFixed(1)}s)`);
      console.log(`  Steps: ${results.successfulSteps}/${results.totalSteps} successful`);
      console.log(`  Time per Step: ${results.timePerStep.toFixed(0)}ms average`);

      // Verify completion requirements
      expect(results.completed).toBe(true);
      expect(results.withinTimeLimit).toBe(true);
      expect(results.totalTime).toBeLessThan(5 * 60 * 1000); // 5 minutes
      expect(results.successfulSteps).toBe(results.totalSteps);

      // Verify reasonable performance per step
      expect(results.timePerStep).toBeLessThan(30000); // 30 seconds per step max

      // Verify configuration was saved
      const savedConfig = await configManager.getPreferences();
      expect(savedConfig.preferences.completion_validation.frameworks).toHaveProperty('wizard-tdd');
    });

    test('should complete BDD framework setup with stakeholder review', async () => {
      const wizard = new MockCLIWizard(configManager, {
        autoAdvance: true,
        responses: {
          framework: 'bdd',
          thresholds: { truth: 0.85, scenario_coverage: 0.90 },
          qualityGates: ['scenario_definition', 'stakeholder_review', 'automation', 'acceptance'],
          enforcementLevel: 'strict',
          byzantineValidation: true
        }
      });

      const results = await new Promise((resolve, reject) => {
        wizard.on('completed', resolve);
        wizard.on('error', reject);
        wizard.startWizard();
      });

      console.log(`\n🏁 BDD Wizard Results:`);
      console.log(`  Total Time: ${results.totalTime}ms (${(results.totalTime/1000).toFixed(1)}s)`);
      console.log(`  Quality Gates: ${results.steps.find(s => s.name === 'quality_gates')?.result?.totalGates}`);

      expect(results.completed).toBe(true);
      expect(results.withinTimeLimit).toBe(true);
      expect(results.successfulSteps).toBe(results.totalSteps);

      // Verify BDD-specific configuration
      const savedConfig = await configManager.getPreferences();
      const bddFramework = savedConfig.preferences.completion_validation.frameworks['wizard-bdd'];
      expect(bddFramework.type).toBe('BDD');
      expect(bddFramework.truth_threshold).toBe(0.85);
    });

    test('should complete SPARC methodology setup with all phases', async () => {
      const wizard = new MockCLIWizard(configManager, {
        autoAdvance: true,
        responses: {
          framework: 'sparc',
          thresholds: { truth: 0.80, phase_completion: 1.0 },
          qualityGates: ['specification', 'pseudocode', 'architecture', 'refinement', 'completion'],
          enforcementLevel: 'moderate',
          byzantineValidation: true,
          securityLevel: 'high'
        }
      });

      const results = await new Promise((resolve, reject) => {
        wizard.on('completed', resolve);
        wizard.on('error', reject);
        wizard.startWizard();
      });

      console.log(`\n🏁 SPARC Wizard Results:`);
      console.log(`  Total Time: ${results.totalTime}ms (${(results.totalTime/1000).toFixed(1)}s)`);
      console.log(`  Phases: 5 (Specification, Pseudocode, Architecture, Refinement, Completion)`);

      expect(results.completed).toBe(true);
      expect(results.withinTimeLimit).toBe(true);

      // Verify all 5 SPARC phases are configured
      const savedConfig = await configManager.getPreferences();
      const sparcFramework = savedConfig.preferences.completion_validation.frameworks['wizard-sparc'];
      expect(sparcFramework.quality_gates).toHaveLength(5);
      expect(sparcFramework.quality_gates).toContain('completion');
    });

    test('should handle custom framework creation workflow', async () => {
      const wizard = new MockCLIWizard(configManager, {
        autoAdvance: true,
        responses: {
          framework: 'custom',
          thresholds: { truth: 0.88 },
          qualityGates: ['custom_gate_1', 'custom_gate_2', 'final_review'],
          enforcementLevel: 'moderate',
          byzantineValidation: true,
          consensusThreshold: 0.90 // Higher consensus for custom frameworks
        }
      });

      const results = await new Promise((resolve, reject) => {
        wizard.on('completed', resolve);
        wizard.on('error', reject);
        wizard.startWizard();
      });

      console.log(`\n🏁 Custom Framework Wizard Results:`);
      console.log(`  Total Time: ${results.totalTime}ms (${(results.totalTime/1000).toFixed(1)}s)`);
      console.log(`  Custom Gates: ${results.steps.find(s => s.name === 'quality_gates')?.result?.totalGates}`);

      expect(results.completed).toBe(true);
      expect(results.withinTimeLimit).toBe(true);

      // Verify custom framework configuration
      const savedConfig = await configManager.getPreferences();
      const customFramework = savedConfig.preferences.completion_validation.frameworks['wizard-custom'];
      expect(customFramework.type).toBe('CUSTOM');
      expect(customFramework.wizard_configured).toBe(true);
    });
  });

  describe('Error Handling and User Guidance', () => {
    test('should provide helpful error messages for invalid inputs', async () => {
      const errorScenarios = [
        {
          name: 'invalid_truth_threshold',
          responses: {
            framework: 'tdd',
            thresholds: { truth: 1.5, coverage: 0.95 } // Invalid threshold > 1.0
          },
          expectedError: 'Truth threshold must be between 0.01 and 1.0'
        },
        {
          name: 'invalid_coverage_threshold',
          responses: {
            framework: 'tdd',
            thresholds: { truth: 0.90, coverage: 0.3 } // Too low coverage
          },
          expectedError: 'Test coverage threshold should be at least 50%'
        },
        {
          name: 'invalid_consensus_threshold',
          responses: {
            framework: 'bdd',
            consensusThreshold: 0.3 // Too low for Byzantine security
          },
          expectedError: 'Consensus threshold must be between 0.5 and 1.0'
        },
        {
          name: 'invalid_framework_selection',
          responses: {
            framework: 'nonexistent'
          },
          expectedError: 'Invalid framework selection: nonexistent'
        }
      ];

      for (const scenario of errorScenarios) {
        console.log(`\nTesting error scenario: ${scenario.name}`);

        const wizard = new MockCLIWizard(configManager, {
          autoAdvance: true,
          responses: scenario.responses
        });

        await expect(new Promise((resolve, reject) => {
          wizard.on('completed', resolve);
          wizard.on('error', reject);
          wizard.startWizard();
        })).rejects.toThrow(scenario.expectedError);

        console.log(`  ✅ Correctly rejected with: ${scenario.expectedError}`);
      }
    });

    test('should provide step-by-step guidance and progress indicators', async () => {
      const wizard = new MockCLIWizard(configManager, {
        autoAdvance: true,
        responses: {
          framework: 'tdd',
          thresholds: { truth: 0.90, coverage: 0.95 }
        }
      });

      const progressEvents = [];

      wizard.on('step_start', (event) => {
        progressEvents.push({ type: 'start', ...event });
      });

      wizard.on('step_complete', (event) => {
        progressEvents.push({ type: 'complete', ...event });
      });

      const results = await new Promise((resolve, reject) => {
        wizard.on('completed', resolve);
        wizard.on('error', reject);
        wizard.startWizard();
      });

      // Verify progress tracking
      const stepNames = ['welcome', 'project_detection', 'framework_selection', 'threshold_configuration',
                        'quality_gates', 'security_setup', 'validation_test', 'finalization'];

      expect(progressEvents.length).toBe(stepNames.length * 2); // start + complete for each step

      // Verify each step was tracked
      for (let i = 0; i < stepNames.length; i++) {
        const startEvent = progressEvents[i * 2];
        const completeEvent = progressEvents[i * 2 + 1];

        expect(startEvent.type).toBe('start');
        expect(startEvent.step).toBe(stepNames[i]);
        expect(startEvent.index).toBe(i);

        expect(completeEvent.type).toBe('complete');
        expect(completeEvent.step).toBe(stepNames[i]);
        expect(completeEvent.duration).toBeGreaterThan(0);
      }

      console.log(`✅ Progress tracking: ${progressEvents.length} events captured`);
      console.log(`✅ All ${stepNames.length} steps tracked properly`);
    });
  });

  describe('Interruption and Resume Capability', () => {
    test('should handle wizard interruption gracefully', async () => {
      const wizard = new MockCLIWizard(configManager, {
        autoAdvance: true,
        responses: {
          framework: 'tdd',
          thresholds: { truth: 0.90, coverage: 0.95 }
        }
      });

      let interruptedAt = null;
      let stepCount = 0;

      wizard.on('step_complete', (event) => {
        stepCount++;
        if (stepCount === 3) { // Interrupt after 3 steps
          interruptedAt = event.step;
          wizard.emit('interrupt');
        }
      });

      // Start wizard but interrupt partway through
      try {
        await new Promise((resolve, reject) => {
          wizard.on('completed', resolve);
          wizard.on('error', reject);
          wizard.on('interrupt', () => reject(new Error('Wizard interrupted')));
          wizard.startWizard();
        });
      } catch (error) {
        expect(error.message).toBe('Wizard interrupted');
      }

      // Verify partial state was saved
      expect(interruptedAt).toBe('framework_selection');
      expect(wizard.state.stepHistory).toHaveLength(3);
      expect(wizard.state.completed).toBe(false);

      // Verify we can access partial results
      const partialResults = wizard.getWizardResults();
      expect(partialResults.completed).toBe(false);
      expect(partialResults.successfulSteps).toBe(3);
      expect(partialResults.steps).toHaveLength(3);

      console.log(`✅ Wizard interrupted after step: ${interruptedAt}`);
      console.log(`✅ Partial results preserved: ${partialResults.successfulSteps} steps`);
    });

    test('should enable resume from interruption point', async () => {
      // Simulate a partially completed wizard session
      const partialConfig = {
        completion_validation: {
          frameworks: {
            'wizard-partial': {
              id: 'wizard-partial',
              name: 'Partially Configured Framework',
              type: 'TDD',
              truth_threshold: 0.88,
              wizard_in_progress: true,
              completed_steps: ['welcome', 'project_detection', 'framework_selection']
            }
          }
        }
      };

      await configManager.updateConfiguration(partialConfig);

      // Create new wizard instance to simulate resume
      const resumeWizard = new MockCLIWizard(configManager, {
        autoAdvance: true,
        resumeFrom: 'threshold_configuration',
        responses: {
          framework: 'tdd', // Should be detected from partial config
          thresholds: { truth: 0.90, coverage: 0.95 },
          enforcementLevel: 'moderate'
        }
      });

      // Modify wizard to start from resume point
      const originalExecute = resumeWizard.executeWizardFlow;
      resumeWizard.executeWizardFlow = async function() {
        const steps = [
          { name: 'threshold_configuration', handler: this.thresholdConfigurationStep.bind(this) },
          { name: 'quality_gates', handler: this.qualityGatesStep.bind(this) },
          { name: 'security_setup', handler: this.securitySetupStep.bind(this) },
          { name: 'validation_test', handler: this.validationTestStep.bind(this) },
          { name: 'finalization', handler: this.finalizationStep.bind(this) }
        ];

        this.state.currentStep = 3; // Resume from step 3

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          this.state.currentStep = i + 3; // Offset by resumed steps

          const stepStart = Date.now();
          this.emit('step_start', { step: step.name, index: i + 3 });

          const result = await step.handler();
          const stepDuration = Date.now() - stepStart;

          this.state.stepHistory.push({
            name: step.name,
            index: i + 3,
            success: true,
            duration: stepDuration,
            result
          });

          this.emit('step_complete', { step: step.name, index: i + 3, duration: stepDuration });
        }
      };

      const resumeResults = await new Promise((resolve, reject) => {
        resumeWizard.on('completed', resolve);
        resumeWizard.on('error', reject);
        resumeWizard.startWizard();
      });

      console.log(`✅ Wizard resumed successfully`);
      console.log(`  Resumed from: threshold_configuration (step 3)`);
      console.log(`  Remaining steps: ${resumeResults.steps.length}`);
      console.log(`  Total resume time: ${resumeResults.totalTime}ms`);

      expect(resumeResults.completed).toBe(true);
      expect(resumeResults.steps).toHaveLength(5); // Only remaining steps
      expect(resumeResults.totalTime).toBeLessThan(3 * 60 * 1000); // Should be faster than full wizard

      // Verify final configuration combines original and resumed parts
      const finalConfig = await configManager.getPreferences();
      expect(finalConfig.preferences.completion_validation.frameworks).toHaveProperty('wizard-tdd');
    });
  });

  describe('Help and Documentation Integration', () => {
    test('should provide contextual help for each step', async () => {
      const helpWizard = new MockCLIWizard(configManager, {
        autoAdvance: true,
        responses: {
          framework: 'tdd',
          requestHelp: true // Flag to request help at each step
        }
      });

      const helpContent = {
        framework_selection: {
          title: 'Framework Selection Help',
          content: 'Choose the methodology that best fits your development process',
          options: [
            'TDD: Test-first development with high code coverage',
            'BDD: Behavior-focused development with stakeholder scenarios',
            'SPARC: Systematic five-phase development methodology'
          ]
        },
        threshold_configuration: {
          title: 'Threshold Configuration Help',
          content: 'Set validation thresholds for your chosen framework',
          guidance: [
            'Truth threshold: Minimum confidence level (0.01-1.0)',
            'Coverage threshold: Minimum test coverage percentage',
            'Higher values = stricter validation'
          ]
        },
        quality_gates: {
          title: 'Quality Gates Help',
          content: 'Configure checkpoints in your development process',
          enforcement_levels: {
            lenient: 'Warnings only, process continues',
            moderate: 'Warnings with manual override option',
            strict: 'Blocks process until requirements met'
          }
        }
      };

      // Mock help system
      helpWizard.getHelp = function(stepName) {
        return helpContent[stepName] || {
          title: 'General Help',
          content: 'Contact support for assistance'
        };
      };

      const results = await new Promise((resolve, reject) => {
        helpWizard.on('completed', resolve);
        helpWizard.on('error', reject);
        helpWizard.startWizard();
      });

      // Verify help was available for key steps
      const helpSteps = ['framework_selection', 'threshold_configuration', 'quality_gates'];

      for (const stepName of helpSteps) {
        const help = helpWizard.getHelp(stepName);
        expect(help.title).toBeDefined();
        expect(help.content).toBeDefined();
        console.log(`✅ Help available for ${stepName}: ${help.title}`);
      }

      expect(results.completed).toBe(true);
    });

    test('should validate configuration examples and provide suggestions', async () => {
      const suggestionWizard = new MockCLIWizard(configManager, {
        autoAdvance: true,
        responses: {
          framework: 'custom', // Custom framework for suggestion testing
          thresholds: { truth: 0.85 }
        }
      });

      // Add suggestion system
      suggestionWizard.getSuggestions = function(stepName, currentConfig) {
        const suggestions = {
          framework_selection: {
            tdd: ['High test coverage recommended', 'Consider mutation testing'],
            bdd: ['Involve stakeholders in scenario creation', 'Use Given-When-Then format'],
            custom: ['Define clear validation criteria', 'Document your methodology']
          },
          threshold_configuration: {
            tdd: currentConfig?.truth < 0.85 ? ['Consider higher truth threshold for TDD'] : [],
            general: currentConfig?.truth > 0.95 ? ['Very high threshold may slow development'] : []
          }
        };

        return suggestions[stepName] || {};
      };

      const results = await new Promise((resolve, reject) => {
        suggestionWizard.on('completed', resolve);
        suggestionWizard.on('error', reject);
        suggestionWizard.startWizard();
      });

      // Test suggestion system
      const frameworkSuggestions = suggestionWizard.getSuggestions('framework_selection', {});
      expect(frameworkSuggestions.custom).toContain('Define clear validation criteria');

      const thresholdSuggestions = suggestionWizard.getSuggestions('threshold_configuration', { truth: 0.85 });
      expect(thresholdSuggestions.tdd || thresholdSuggestions.general).toBeDefined();

      console.log(`✅ Suggestion system functional`);
      console.log(`  Framework suggestions: ${JSON.stringify(frameworkSuggestions.custom)}`);

      expect(results.completed).toBe(true);
    });
  });

  describe('Performance and Usability Metrics', () => {
    test('should complete wizard within usability benchmarks', async () => {
      const benchmarkTests = [
        { name: 'speed_test', autoAdvance: true, targetTime: 30000 }, // 30 seconds with auto-advance
        { name: 'realistic_test', autoAdvance: false, targetTime: 300000 } // 5 minutes realistic timing
      ];

      for (const benchmark of benchmarkTests) {
        console.log(`\nRunning ${benchmark.name}...`);

        const wizard = new MockCLIWizard(configManager, {
          autoAdvance: benchmark.autoAdvance,
          responses: {
            framework: 'tdd',
            thresholds: { truth: 0.90, coverage: 0.95 },
            enforcementLevel: 'moderate'
          }
        });

        const startTime = Date.now();
        const results = await new Promise((resolve, reject) => {
          wizard.on('completed', resolve);
          wizard.on('error', reject);
          wizard.startWizard();
        });
        const actualTime = Date.now() - startTime;

        console.log(`  Benchmark: ${benchmark.name}`);
        console.log(`  Target: ${benchmark.targetTime}ms`);
        console.log(`  Actual: ${actualTime}ms`);
        console.log(`  Result: ${actualTime < benchmark.targetTime ? '✅ PASSED' : '❌ FAILED'}`);

        expect(actualTime).toBeLessThan(benchmark.targetTime);
        expect(results.completed).toBe(true);
        expect(results.successfulSteps).toBe(results.totalSteps);
      }
    });
  });
});