import { describe, test, it, expect, beforeEach, afterEach } from '@jest/globals';
/**
 * Phase 2 User Configuration Manager Tests
 * Byzantine-secure test suite integrating with existing personalization system
 *
 * Tests integrate with:
 * - Existing preference management system (.claude-flow-novice/preferences/)
 * - Phase 1 completion validation framework (recursive validation capability)
 * - Byzantine consensus mechanisms and cryptographic validation
 * - SQLite analytics pipeline from personalization system
 *
 * SUCCESS CRITERIA:
 * - 100% test coverage with Byzantine consensus validation
 * - Custom framework addition with cryptographically signed rules
 * - Seamless integration with existing preference-wizard.js
 * - All configuration changes consensus-validated to prevent malicious injection
 */

import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import { ByzantineConsensus } from '../../src/core/byzantine-consensus.js';
import { validatePhase1Completion } from '../../src/integration/phase1-completion-validator.js';
import { CompletionTruthValidator } from '../../src/validation/completion-truth-validator.js';

// Import the user configuration manager to be tested
let UserConfigurationManager;

describe('Phase 2: User Configuration System - Byzantine Security', function() {
  this.timeout(30000); // Allow time for Byzantine consensus

  let configManager;
  let byzantineConsensus;
  let truthValidator;
  let testPreferencesPath;
  let originalPreferences;

  before(async function() {
    // Initialize Byzantine consensus system
    byzantineConsensus = new ByzantineConsensus();

    // Initialize truth validator with Phase 1 integration
    truthValidator = new CompletionTruthValidator({
      byzantineConsensus,
      enablePhase1Integration: true
    });
    await truthValidator.initialize();

    // Setup test preferences directory
    testPreferencesPath = path.join(process.cwd(), '.test-claude-flow-novice', 'preferences');
    await fs.mkdir(testPreferencesPath, { recursive: true });

    // Backup original preferences if they exist
    const originalPath = path.join(process.cwd(), '.claude-flow-novice', 'preferences', 'user-global.json');
    try {
      originalPreferences = await fs.readFile(originalPath, 'utf8');
    } catch {
      originalPreferences = null;
    }
  });

  beforeEach(async function() {
    // Create fresh UserConfigurationManager instance for each test
    const { UserConfigurationManager: UCM } = await import('../../src/configuration/user-configuration-manager.js');
    UserConfigurationManager = UCM;

    configManager = new UserConfigurationManager({
      byzantineConsensus,
      truthValidator,
      preferencesPath: testPreferencesPath,
      enableByzantineValidation: true,
      consensusThreshold: 0.85
    });

    await configManager.initialize();
  });

  afterEach(async function() {
    if (configManager) {
      await configManager.shutdown();
    }
  });

  after(async function() {
    // Cleanup test directory
    await fs.rm(path.join(process.cwd(), '.test-claude-flow-novice'), {
      recursive: true,
      force: true
    });

    if (truthValidator) {
      await truthValidator.close();
    }
  });

  describe('Checkpoint 2.1: Configuration System with CLI Integration', function() {

    it('should initialize with existing personalization system integration', async function() {
      expect(configManager.initialized).to.be.true;
      expect(configManager.byzantineEnabled).to.be.true;
      expect(configManager.preferencesIntegrated).to.be.true;

      // Validate integration with existing preference structure
      const preferences = await configManager.getPreferences();
      expect(preferences).to.have.property('completion_validation');
      expect(preferences.completion_validation).to.have.property('frameworks');
      expect(preferences.completion_validation).to.have.property('quality_gates');
    });

    it('should support Byzantine-secure configuration updates', async function() {
      const configUpdate = {
        completion_validation: {
          frameworks: {
            'custom-tdd': {
              name: 'Custom TDD Framework',
              truth_threshold: 0.90,
              coverage_requirement: 0.95,
              validation_rules: ['red_green_refactor', 'test_first']
            }
          }
        }
      };

      // Update configuration with Byzantine validation
      const result = await configManager.updateConfiguration(configUpdate, {
        requireConsensus: true,
        validateWithPhase1: true
      });

      expect(result.consensusReached).to.be.true;
      expect(result.cryptographicSignature).to.exist;
      expect(result.phase1ValidationPassed).to.be.true;
      expect(result.configurationApplied).to.be.true;
    });

    it('should prevent malicious configuration injection via Byzantine consensus', async function() {
      const maliciousConfig = {
        completion_validation: {
          frameworks: {
            'malicious-framework': {
              name: 'Malicious Framework',
              truth_threshold: 0.01, // Dangerously low threshold
              bypass_validation: true, // Malicious bypass flag
              inject_code: '$(rm -rf /)',
              validation_rules: []
            }
          }
        }
      };

      // Attempt malicious configuration - should be rejected by Byzantine consensus
      const result = await configManager.updateConfiguration(maliciousConfig, {
        requireConsensus: true,
        securityValidation: true
      });

      expect(result.consensusReached).to.be.false;
      expect(result.securityViolations).to.be.an('array').with.length.greaterThan(0);
      expect(result.configurationApplied).to.be.false;
      expect(result.byzantineRejection).to.be.true;
    });

    it('should integrate with existing CLI commands', async function() {
      // Test CLI integration points
      const cliConfig = await configManager.getCLIConfiguration();

      expect(cliConfig).to.have.property('commands');
      expect(cliConfig.commands).to.include('completion-validation');
      expect(cliConfig.commands).to.include('framework');
      expect(cliConfig.commands).to.include('quality-gates');

      // Validate CLI command structure
      const completionCommand = cliConfig.commandDefinitions['completion-validation'];
      expect(completionCommand).to.have.property('subcommands');
      expect(completionCommand.subcommands).to.include('add-framework');
      expect(completionCommand.subcommands).to.include('set-threshold');
      expect(completionCommand.subcommands).to.include('validate');
    });

    it('should maintain backward compatibility with existing preference system', async function() {
      // Load existing preferences structure
      const existingPrefs = {
        version: '1.0.0',
        preferences: {
          documentation: { verbosity: 'moderate' },
          tone: { style: 'professional' },
          workflow: { auto_optimize: true }
        }
      };

      // Merge with new completion validation preferences
      const result = await configManager.mergeWithExistingPreferences(existingPrefs, {
        validateCompatibility: true,
        preserveExistingSettings: true
      });

      expect(result.compatible).to.be.true;
      expect(result.mergedPreferences.preferences.documentation.verbosity).to.equal('moderate');
      expect(result.mergedPreferences.preferences.completion_validation).to.exist;
      expect(result.backwardCompatible).to.be.true;
    });
  });

  describe('Checkpoint 2.2: Custom Framework Validation Protocol', function() {

    it('should allow users to add custom frameworks with Byzantine validation', async function() {
      const customFramework = {
        id: 'bdd-plus',
        name: 'Enhanced BDD Framework',
        description: 'BDD with additional acceptance criteria',
        validation_config: {
          truth_threshold: 0.88,
          scenario_coverage: 0.92,
          acceptance_criteria_coverage: 0.95,
          gherkin_compliance: true
        },
        validation_rules: [
          'given_when_then_structure',
          'acceptance_criteria_mapping',
          'stakeholder_review_required'
        ],
        quality_gates: {
          pre_implementation: ['scenarios_defined', 'acceptance_criteria_approved'],
          during_implementation: ['scenario_coverage_tracking', 'step_implementation'],
          post_implementation: ['full_scenario_coverage', 'stakeholder_acceptance']
        }
      };

      const result = await configManager.addCustomFramework(customFramework, {
        requireByzantineConsensus: true,
        validateAgainstExistingFrameworks: true,
        enablePhase1Validation: true
      });

      expect(result.frameworkAdded).to.be.true;
      expect(result.byzantineValidated).to.be.true;
      expect(result.cryptographicSignature).to.exist;
      expect(result.validationRulesVerified).to.be.true;
      expect(result.noConflictWithExisting).to.be.true;
    });

    it('should validate custom framework rules for security and consistency', async function() {
      const potentiallyDangerousFramework = {
        id: 'dangerous-framework',
        name: 'Potentially Dangerous Framework',
        validation_config: {
          truth_threshold: 0.01, // Too low
          bypass_all_validation: true, // Security risk
          execute_arbitrary_code: 'rm -rf /'  // Code injection attempt
        },
        validation_rules: [
          '${process.exit(1)}', // Malicious code injection
          'eval(userInput)' // Another injection attempt
        ]
      };

      const result = await configManager.addCustomFramework(potentiallyDangerousFramework, {
        requireByzantineConsensus: true,
        securityValidation: true,
        codeInjectionDetection: true
      });

      expect(result.frameworkAdded).to.be.false;
      expect(result.securityViolations).to.be.an('array').with.length.greaterThan(0);
      expect(result.securityViolations).to.include('truth_threshold_too_low');
      expect(result.securityViolations).to.include('code_injection_detected');
      expect(result.securityViolations).to.include('bypass_validation_attempt');
      expect(result.byzantineRejected).to.be.true;
    });

    it('should enable framework-specific completion validation', async function() {
      // Add a custom framework first
      const customFramework = {
        id: 'strict-tdd',
        name: 'Strict TDD Framework',
        validation_config: {
          truth_threshold: 0.95,
          test_coverage: 1.0,
          red_green_refactor_cycles: true
        },
        validation_rules: [
          'test_first_mandatory',
          'no_code_without_failing_test',
          'refactor_after_green'
        ]
      };

      await configManager.addCustomFramework(customFramework);

      // Test completion validation using the custom framework
      const completion = {
        id: 'test-completion-1',
        claim: 'Implemented user authentication with 100% test coverage',
        framework: 'strict-tdd',
        evidence: {
          tests_written_first: true,
          test_coverage: 1.0,
          red_green_refactor_cycles: 3,
          failing_tests_before_implementation: ['test_login', 'test_logout', 'test_session']
        },
        implementation: {
          code_files: ['auth.js', 'auth.test.js'],
          test_files: ['auth.test.js'],
          coverage_report: { statements: 100, branches: 100, functions: 100, lines: 100 }
        }
      };

      const validationResult = await configManager.validateCompletionWithCustomFramework(
        completion,
        'strict-tdd',
        { enableByzantineConsensus: true }
      );

      expect(validationResult.frameworkValidated).to.be.true;
      expect(validationResult.customFrameworkUsed).to.equal('strict-tdd');
      expect(validationResult.truthScore).to.be.at.least(0.95);
      expect(validationResult.frameworkRulesSatisfied).to.be.true;
      expect(validationResult.consensusReached).to.be.true;
    });

    it('should support framework inheritance and composition', async function() {
      // Define a base framework
      const baseFramework = {
        id: 'base-agile',
        name: 'Base Agile Framework',
        validation_config: {
          truth_threshold: 0.80,
          user_story_compliance: true
        },
        validation_rules: [
          'user_story_format',
          'acceptance_criteria_defined'
        ]
      };

      // Define an extended framework
      const extendedFramework = {
        id: 'scrum-plus',
        name: 'Enhanced Scrum Framework',
        extends: 'base-agile', // Inherit from base framework
        validation_config: {
          truth_threshold: 0.85, // Override base threshold
          sprint_planning_compliance: true,
          definition_of_done_checked: true
        },
        validation_rules: [
          // Inherits base rules plus these additional ones
          'sprint_goal_alignment',
          'definition_of_done_compliance',
          'retrospective_action_items'
        ]
      };

      await configManager.addCustomFramework(baseFramework);
      const result = await configManager.addCustomFramework(extendedFramework, {
        validateInheritance: true,
        requireByzantineConsensus: true
      });

      expect(result.frameworkAdded).to.be.true;
      expect(result.inheritanceValidated).to.be.true;
      expect(result.inheritedRules).to.include('user_story_format');
      expect(result.inheritedRules).to.include('acceptance_criteria_defined');
      expect(result.extendedRules).to.include('sprint_goal_alignment');
      expect(result.mergedValidationConfig.truth_threshold).to.equal(0.85);
    });
  });

  describe('Checkpoint 2.3: Quality Gates Configuration System', function() {

    it('should configure framework-specific quality gates with analytics integration', async function() {
      const qualityGatesConfig = {
        framework: 'custom-tdd',
        gates: {
          pre_implementation: {
            required_gates: [
              {
                name: 'requirements_analysis',
                criteria: { completeness: 0.95, stakeholder_approval: true },
                analytics_tracked: true
              },
              {
                name: 'test_design',
                criteria: { test_coverage_design: 0.90, edge_cases_identified: true },
                analytics_tracked: true
              }
            ],
            bypass_conditions: [], // No bypasses allowed
            escalation_path: 'tech_lead_approval'
          },
          during_implementation: {
            required_gates: [
              {
                name: 'red_green_cycle',
                criteria: { failing_test_first: true, minimal_implementation: true },
                realtime_monitoring: true
              },
              {
                name: 'code_quality',
                criteria: { complexity_score: { max: 10 }, maintainability_index: { min: 85 } },
                analytics_tracked: true
              }
            ]
          },
          post_implementation: {
            required_gates: [
              {
                name: 'full_validation',
                criteria: { truth_score: 0.95, test_coverage: 1.0 },
                byzantine_validation: true
              }
            ]
          }
        },
        analytics_integration: {
          track_gate_performance: true,
          collect_metrics: ['gate_pass_rate', 'average_gate_time', 'bypass_frequency'],
          reporting_frequency: 'daily',
          dashboard_integration: true
        }
      };

      const result = await configManager.configureQualityGates(qualityGatesConfig, {
        requireByzantineConsensus: true,
        integrateWithAnalytics: true,
        validateWithExistingPipeline: true
      });

      expect(result.qualityGatesConfigured).to.be.true;
      expect(result.analyticsIntegrated).to.be.true;
      expect(result.byzantineValidated).to.be.true;
      expect(result.pipelineIntegration).to.be.true;
    });

    it('should enforce quality gates during completion validation', async function() {
      // Configure quality gates first
      const gatesConfig = {
        framework: 'test-framework',
        gates: {
          pre_implementation: {
            required_gates: [
              {
                name: 'design_review',
                criteria: { design_completeness: 0.90, peer_review: true }
              }
            ]
          },
          post_implementation: {
            required_gates: [
              {
                name: 'security_scan',
                criteria: { vulnerability_count: 0, security_score: 0.95 }
              }
            ]
          }
        }
      };

      await configManager.configureQualityGates(gatesConfig);

      // Test completion that should pass quality gates
      const passingCompletion = {
        id: 'passing-completion',
        framework: 'test-framework',
        claim: 'Implemented secure login system',
        evidence: {
          design_completeness: 0.95,
          peer_review: true,
          vulnerability_count: 0,
          security_score: 0.98
        },
        quality_gate_evidence: {
          pre_implementation: {
            design_review: { passed: true, reviewer: 'senior_dev', timestamp: Date.now() }
          },
          post_implementation: {
            security_scan: { passed: true, scan_tool: 'snyk', clean_report: true }
          }
        }
      };

      const passingResult = await configManager.validateWithQualityGates(passingCompletion);

      expect(passingResult.allGatesPassed).to.be.true;
      expect(passingResult.gateResults.pre_implementation.design_review.passed).to.be.true;
      expect(passingResult.gateResults.post_implementation.security_scan.passed).to.be.true;

      // Test completion that should fail quality gates
      const failingCompletion = {
        id: 'failing-completion',
        framework: 'test-framework',
        claim: 'Implemented login system',
        evidence: {
          design_completeness: 0.60, // Below threshold
          peer_review: false, // Missing
          vulnerability_count: 2, // Too many
          security_score: 0.80 // Below threshold
        },
        quality_gate_evidence: {}
      };

      const failingResult = await configManager.validateWithQualityGates(failingCompletion);

      expect(failingResult.allGatesPassed).to.be.false;
      expect(failingResult.failedGates).to.be.an('array').with.length.greaterThan(0);
      expect(failingResult.failedGates).to.include('design_review');
      expect(failingResult.failedGates).to.include('security_scan');
    });

    it('should integrate quality gates with existing analytics pipeline', async function() {
      // Verify integration with SQLite analyzer from personalization system
      const analyticsIntegration = await configManager.getAnalyticsIntegration();

      expect(analyticsIntegration.sqliteIntegrated).to.be.true;
      expect(analyticsIntegration.optimizationEngineConnected).to.be.true;
      expect(analyticsIntegration.teamSyncEnabled).to.be.true;

      // Test analytics data flow
      const qualityGateEvent = {
        type: 'quality_gate_execution',
        framework: 'test-framework',
        gate: 'design_review',
        passed: true,
        duration: 1500,
        criteria_met: ['design_completeness', 'peer_review'],
        timestamp: Date.now()
      };

      const analyticsResult = await configManager.recordQualityGateAnalytics(qualityGateEvent);

      expect(analyticsResult.recorded).to.be.true;
      expect(analyticsResult.sqliteStored).to.be.true;
      expect(analyticsResult.optimizationData).to.exist;
      expect(analyticsResult.teamDataSynced).to.be.true;
    });

    it('should support user-customizable quality gate thresholds', async function() {
      const userCustomThresholds = {
        framework: 'custom-bdd',
        customizable_thresholds: {
          scenario_coverage: {
            default: 0.85,
            user_override: 0.92,
            min_allowed: 0.80,
            max_allowed: 1.0,
            justification_required_above: 0.95
          },
          acceptance_criteria_coverage: {
            default: 0.90,
            user_override: 0.88,
            min_allowed: 0.85,
            max_allowed: 1.0
          }
        },
        user_preferences: {
          strict_mode: true,
          require_justification_for_overrides: true,
          team_approval_for_threshold_changes: true
        }
      };

      const result = await configManager.setCustomizableThresholds(userCustomThresholds, {
        validateThresholdRanges: true,
        requireByzantineConsensus: true,
        integrateWithTeamPreferences: true
      });

      expect(result.thresholdsConfigured).to.be.true;
      expect(result.thresholdValidation.all_within_allowed_ranges).to.be.true;
      expect(result.byzantineValidated).to.be.true;
      expect(result.teamIntegration.synced).to.be.true;
    });
  });

  describe('Byzantine Security and Phase 1 Integration', function() {

    it('should validate configuration changes with Phase 1 completion framework', async function() {
      const configChange = {
        type: 'framework_addition',
        framework: {
          id: 'phase1-validated-tdd',
          name: 'Phase 1 Validated TDD',
          validation_config: { truth_threshold: 0.90 }
        }
      };

      // Validate using Phase 1 completion validation framework
      const phase1ValidationResult = await validatePhase1Completion({
        enableFullValidation: true,
        validateConfigurationChanges: true
      });

      const result = await configManager.validateConfigurationWithPhase1(
        configChange,
        phase1ValidationResult
      );

      expect(result.phase1ValidationPassed).to.be.true;
      expect(result.recursiveValidationSuccess).to.be.true;
      expect(result.configurationValidatedRecursively).to.be.true;
      expect(result.byzantineConsensusWithPhase1).to.be.true;
    });

    it('should implement recursive validation for custom framework validation', async function() {
      // Test that custom frameworks can validate themselves using the completion validation system
      const selfValidatingFramework = {
        id: 'recursive-validation-framework',
        name: 'Recursive Validation Framework',
        validation_config: {
          truth_threshold: 0.90,
          self_validation_enabled: true,
          recursive_validation_depth: 3
        },
        validation_rules: [
          'validate_own_configuration',
          'recursive_truth_scoring',
          'byzantine_consensus_self_check'
        ]
      };

      // Add framework with recursive validation enabled
      const addResult = await configManager.addCustomFramework(selfValidatingFramework, {
        enableRecursiveValidation: true,
        selfValidationRequired: true
      });

      expect(addResult.frameworkAdded).to.be.true;
      expect(addResult.recursiveValidationEnabled).to.be.true;

      // Test recursive validation capability
      const recursiveValidationResult = await configManager.performRecursiveValidation(
        'recursive-validation-framework'
      );

      expect(recursiveValidationResult.canValidateSelf).to.be.true;
      expect(recursiveValidationResult.recursiveDepth).to.be.at.least(2);
      expect(recursiveValidationResult.selfValidationPassed).to.be.true;
      expect(recursiveValidationResult.noInfiniteRecursion).to.be.true;
    });

    it('should maintain Byzantine fault tolerance during high-throughput operations', async function() {
      // Simulate multiple concurrent configuration changes
      const concurrentConfigChanges = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-change-${i}`,
        type: 'threshold_update',
        framework: 'load-test-framework',
        change: {
          truth_threshold: 0.85 + (Math.random() * 0.1),
          validation_rules: [`rule_${i}`]
        }
      }));

      // Execute concurrent changes with Byzantine consensus
      const results = await Promise.allSettled(
        concurrentConfigChanges.map(change =>
          configManager.updateConfiguration(change, {
            requireByzantineConsensus: true,
            concurrencyTolerant: true
          })
        )
      );

      const successfulResults = results.filter(r => r.status === 'fulfilled');
      const byzantineValidatedResults = successfulResults.filter(
        r => r.value?.consensusReached === true
      );

      // Byzantine fault tolerance: should handle at least 2/3 of concurrent requests successfully
      expect(byzantineValidatedResults.length).to.be.at.least(Math.ceil(concurrentConfigChanges.length * 0.67));
    });
  });

  describe('Performance and Integration Requirements', function() {

    it('should maintain <5% performance degradation from baseline', async function() {
      // Baseline performance test
      const baselineStart = performance.now();
      await configManager.getConfiguration();
      const baselineTime = performance.now() - baselineStart;

      // Performance test with Byzantine validation
      const byzantineStart = performance.now();
      await configManager.getConfiguration({ enableByzantineValidation: true });
      const byzantineTime = performance.now() - byzantineStart;

      const performanceDegradation = (byzantineTime - baselineTime) / baselineTime;

      expect(performanceDegradation).to.be.below(0.05); // Less than 5% degradation
    });

    it('should not break existing Claude Flow functionality', async function() {
      // Test integration compatibility
      const compatibilityTest = await configManager.testClaudeFlowCompatibility();

      expect(compatibilityTest.hookSystemWorking).to.be.true;
      expect(compatibilityTest.memorySystemWorking).to.be.true;
      expect(compatibilityTest.cliCommandsWorking).to.be.true;
      expect(compatibilityTest.agentSystemWorking).to.be.true;
      expect(compatibilityTest.breakingChanges).to.have.length(0);
    });

    it('should achieve >85% accuracy on test completions', async function() {
      // Create test completions with known truth values
      const testCompletions = [
        {
          id: 'high-quality-completion',
          expectedTruthScore: 0.95,
          claim: 'Implemented comprehensive unit tests with 100% coverage',
          evidence: { test_coverage: 1.0, assertions: 50, edge_cases: 10 }
        },
        {
          id: 'medium-quality-completion',
          expectedTruthScore: 0.80,
          claim: 'Implemented basic functionality',
          evidence: { test_coverage: 0.75, assertions: 20, edge_cases: 3 }
        },
        {
          id: 'low-quality-completion',
          expectedTruthScore: 0.60,
          claim: 'Added feature',
          evidence: { test_coverage: 0.40, assertions: 5, edge_cases: 0 }
        }
      ];

      const validationResults = await Promise.all(
        testCompletions.map(completion =>
          configManager.validateCompletion(completion, { enableTruthScoring: true })
        )
      );

      // Calculate accuracy
      let accurateValidations = 0;
      for (let i = 0; i < testCompletions.length; i++) {
        const expected = testCompletions[i].expectedTruthScore;
        const actual = validationResults[i].truthScore;
        const accuracy = 1 - Math.abs(expected - actual) / expected;

        if (accuracy >= 0.85) {
          accurateValidations++;
        }
      }

      const overallAccuracy = accurateValidations / testCompletions.length;
      expect(overallAccuracy).to.be.at.least(0.85);
    });
  });
});