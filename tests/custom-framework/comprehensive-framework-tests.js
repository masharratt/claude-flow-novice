/**
 * Comprehensive Custom Framework Testing Suite
 * Tests all aspects of the custom framework addition workflow
 *
 * TEST COVERAGE:
 * - Schema validation with valid and invalid frameworks
 * - Security validation including malicious code detection
 * - Byzantine consensus validation with various scenarios
 * - Framework-specific validation logic execution
 * - Truth scorer integration with custom weights
 * - CLI command functionality and error handling
 * - End-to-end framework lifecycle testing
 */

import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import EnhancedCustomFrameworkValidator from '../../src/validation/custom-framework-validator.js';
import { CustomFrameworkValidator, defaultFrameworkValidator } from '../../src/schemas/custom-framework-schema.js';
import { CustomFrameworkRegistry } from '../../src/configuration/custom-framework-registry.js';
import { handleFrameworkValidationCommand } from '../../src/cli/commands/validate-framework.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Custom Framework Validation System', function() {
  this.timeout(60000); // 60 second timeout for comprehensive tests

  let validator;
  let schemaValidator;
  let registry;
  let testFrameworksDir;

  // Test frameworks
  const validFramework = {
    id: 'test-framework-valid',
    name: 'Test Framework Valid',
    version: '1.0.0',
    description: 'A valid test framework for validation testing',
    validation_config: {
      truth_threshold: 0.85,
      truth_component_weights: {
        agent_reliability: 0.3,
        cross_validation: 0.25,
        external_verification: 0.2,
        factual_consistency: 0.15,
        logical_coherence: 0.1
      },
      byzantine_validation_required: true,
      consensus_threshold: 0.67,
      security_level: 'standard'
    },
    validation_rules: [
      {
        name: 'accuracy_check',
        description: 'Check minimum accuracy requirement',
        validator: {
          type: 'threshold',
          config: {
            field: 'completion.accuracy',
            threshold: 0.8,
            operator: '>='
          }
        },
        weight: 1.0,
        required: true
      },
      {
        name: 'execution_time_limit',
        description: 'Ensure reasonable execution time',
        validator: {
          type: 'threshold',
          config: {
            field: 'completion.execution_time',
            threshold: 30000,
            operator: '<='
          }
        },
        weight: 0.8,
        required: true
      }
    ],
    quality_gates: [
      {
        name: 'truth_score_gate',
        description: 'Minimum truth score requirement',
        metric: 'truth_score',
        threshold: 0.85,
        operator: '>=',
        required: true
      },
      {
        name: 'memory_usage_gate',
        description: 'Maximum memory usage allowed',
        metric: 'memory_usage',
        threshold: 1073741824, // 1GB
        operator: '<=',
        required: false
      }
    ],
    inheritable: true,
    composable: true,
    allows_override: false,
    metadata: {
      author: 'test-suite',
      license: 'MIT',
      keywords: ['testing', 'validation', 'custom'],
      created_at: new Date().toISOString()
    }
  };

  const maliciousFramework = {
    id: 'test-framework-malicious',
    name: 'Malicious Test Framework',
    version: '1.0.0',
    description: 'A framework with security violations for testing',
    validation_config: {
      truth_threshold: 0.01, // Suspiciously low
      bypass_validation: true, // Security bypass attempt
      disable_security: true
    },
    validation_rules: [
      {
        name: 'malicious_rule',
        validator: 'eval("require(\\'fs\\').readFileSync(\\'/etc/passwd\\', \\'utf8\\')")' // Code injection
      }
    ],
    quality_gates: [],
    metadata: {
      author: 'hacker',
      keywords: ['backdoor', 'exploit']
    }
  };

  const invalidFramework = {
    // Missing required fields
    name: 'Invalid Framework',
    validation_config: {
      truth_threshold: 1.5 // Out of range
    },
    validation_rules: [
      // Invalid rule structure
      {
        name: '', // Empty name
        validator: null // No validator
      }
    ]
  };

  before(async function() {
    // Setup test environment
    testFrameworksDir = path.join(__dirname, '..', '..', '.test-frameworks');
    await fs.mkdir(testFrameworksDir, { recursive: true });

    // Initialize components
    validator = new EnhancedCustomFrameworkValidator({
      enableByzantineValidation: true,
      enableSecuritySandbox: true
    });

    schemaValidator = new CustomFrameworkValidator();
    registry = new CustomFrameworkRegistry({
      frameworksPath: testFrameworksDir
    });

    await validator.initialize();
    await registry.initialize();
  });

  after(async function() {
    // Cleanup test environment
    if (validator) {
      await validator.shutdown();
    }

    if (registry) {
      await registry.shutdown();
    }

    // Remove test directory
    try {
      await fs.rmdir(testFrameworksDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Schema Validation', function() {
    it('should validate a correct framework definition', async function() {
      const result = await schemaValidator.validate(validFramework);

      expect(result.valid).to.be.true;
      expect(result.errors).to.be.an('array').that.is.empty;
      expect(result.warnings).to.be.an('array');
      expect(result.securityIssues).to.be.an('array');
    });

    it('should reject framework with missing required fields', async function() {
      const result = await schemaValidator.validate(invalidFramework);

      expect(result.valid).to.be.false;
      expect(result.errors).to.be.an('array').that.is.not.empty;

      // Check for specific required field errors
      const errorTypes = result.errors.map(e => e.type);
      expect(errorTypes).to.include('schema_validation');
    });

    it('should validate truth component weights', async function() {
      const frameworkWithBadWeights = {
        ...validFramework,
        validation_config: {
          ...validFramework.validation_config,
          truth_component_weights: {
            agent_reliability: 0.5,
            cross_validation: 0.3,
            external_verification: 0.3,
            factual_consistency: 0.2,
            logical_coherence: 0.1
          }
        }
      };

      const result = await schemaValidator.validate(frameworkWithBadWeights);

      expect(result.valid).to.be.true; // Still valid, but with warnings
      expect(result.warnings).to.be.an('array').that.is.not.empty;

      // Check for weight sum warning
      const weightWarnings = result.warnings.filter(w => w.type === 'weights_sum_warning');
      expect(weightWarnings).to.have.length.greaterThan(0);
    });

    it('should reject framework with invalid validation rules', async function() {
      const frameworkWithBadRules = {
        ...validFramework,
        validation_rules: [
          {
            name: '', // Empty name
            validator: null
          },
          {
            // Missing name
            validator: 'some_validator'
          }
        ]
      };

      const result = await schemaValidator.validate(frameworkWithBadRules);

      expect(result.valid).to.be.false;
      expect(result.errors).to.be.an('array').that.is.not.empty;
    });

    it('should validate quality gates configuration', async function() {
      const frameworkWithBadGates = {
        ...validFramework,
        quality_gates: [
          {
            name: 'invalid_gate',
            metric: 'truth_score',
            threshold: 2.0 // Out of range for truth_score
          }
        ]
      };

      const result = await schemaValidator.validate(frameworkWithBadGates);

      expect(result.valid).to.be.false;
      expect(result.errors).to.be.an('array').that.is.not.empty;
    });
  });

  describe('Security Validation', function() {
    it('should detect code injection patterns', async function() {
      const result = await validator.validateAndAddFramework(maliciousFramework);

      expect(result.success).to.be.false;
      expect(result.securityViolations).to.be.an('array').that.is.not.empty;

      // Check for code injection detection
      const codeInjectionViolations = result.securityViolations.filter(v =>
        v.category === 'codeInjection' || v.type === 'dangerous_rule'
      );
      expect(codeInjectionViolations).to.have.length.greaterThan(0);
    });

    it('should detect suspicious configuration flags', async function() {
      const suspiciousFramework = {
        ...validFramework,
        id: 'suspicious-framework',
        validation_config: {
          ...validFramework.validation_config,
          bypass_validation: true,
          disable_security: true,
          allow_unsigned_completions: true
        }
      };

      const result = await validator.validateAndAddFramework(suspiciousFramework);

      expect(result.success).to.be.false;
      expect(result.securityViolations).to.be.an('array').that.is.not.empty;

      // Check for bypass attempt detection
      const bypassViolations = result.securityViolations.filter(v =>
        v.type === 'security_bypass_attempt'
      );
      expect(bypassViolations).to.have.length.greaterThan(0);
    });

    it('should detect suspicious metadata', async function() {
      const frameworkWithSuspiciousMetadata = {
        ...validFramework,
        id: 'suspicious-metadata-framework',
        metadata: {
          ...validFramework.metadata,
          description: 'This framework contains a backdoor for exploitation',
          keywords: ['backdoor', 'malware', 'hack']
        }
      };

      const result = await validator.validateAndAddFramework(frameworkWithSuspiciousMetadata);

      expect(result.success).to.be.false;
      expect(result.securityViolations).to.be.an('array').that.is.not.empty;

      // Check for suspicious keyword detection
      const keywordViolations = result.securityViolations.filter(v =>
        v.type === 'suspicious_metadata'
      );
      expect(keywordViolations).to.have.length.greaterThan(0);
    });

    it('should allow safe frameworks with no security violations', async function() {
      const safeFramework = {
        ...validFramework,
        id: 'safe-framework-test',
        validation_rules: [
          {
            name: 'safe_accuracy_check',
            validator: {
              type: 'threshold',
              config: {
                field: 'completion.accuracy',
                threshold: 0.8,
                operator: '>='
              }
            }
          }
        ]
      };

      const result = await validator.validateAndAddFramework(safeFramework);

      // Should pass security validation
      expect(result.validationResults?.security?.secure).to.be.true;
      expect(result.validationResults?.security?.criticalIssues || []).to.be.empty;
    });
  });

  describe('Byzantine Consensus Validation', function() {
    it('should achieve consensus for valid frameworks', async function() {
      const consensusFramework = {
        ...validFramework,
        id: 'consensus-test-framework'
      };

      const result = await validator.validateAndAddFramework(consensusFramework);

      expect(result.success).to.be.true;
      expect(result.validationResults?.byzantine?.approved).to.be.true;
      expect(result.validationResults?.byzantine?.consensus?.consensusReached).to.be.true;
    });

    it('should reject frameworks with security concerns via consensus', async function() {
      const result = await validator.validateAndAddFramework(maliciousFramework);

      expect(result.success).to.be.false;

      if (result.byzantineRejected) {
        expect(result.consensus?.securityConcerns).to.be.greaterThan(0);
      }
    });

    it('should detect malicious behavior patterns', async function() {
      const maliciousBehaviorFramework = {
        ...maliciousFramework,
        id: 'malicious-behavior-test'
      };

      const result = await validator.validateAndAddFramework(maliciousBehaviorFramework);

      expect(result.success).to.be.false;

      if (result.maliciousBehaviorDetected) {
        expect(result.maliciousBehaviorDetected).to.be.true;
      }
    });
  });

  describe('Framework Logic Execution', function() {
    it('should safely execute framework validation rules', async function() {
      const executionTestFramework = {
        ...validFramework,
        id: 'execution-test-framework'
      };

      const result = await validator.validateAndAddFramework(executionTestFramework);

      expect(result.success).to.be.true;
      expect(result.validationResults?.execution?.safe).to.be.true;
      expect(result.validationResults?.execution?.issues || []).to.be.empty;
    });

    it('should detect unsafe rule execution', async function() {
      const unsafeExecutionFramework = {
        ...validFramework,
        id: 'unsafe-execution-framework',
        validation_rules: [
          {
            name: 'unsafe_rule',
            validator: 'require("fs").readFileSync("/etc/passwd")' // Unsafe file access
          }
        ]
      };

      const result = await validator.validateAndAddFramework(unsafeExecutionFramework);

      expect(result.success).to.be.false;
      expect(result.validationResults?.execution?.safe).to.be.false;
      expect(result.validationResults?.execution?.issues || []).to.not.be.empty;
    });

    it('should execute different validator types correctly', async function() {
      const multiValidatorFramework = {
        ...validFramework,
        id: 'multi-validator-framework',
        validation_rules: [
          {
            name: 'threshold_validator',
            validator: {
              type: 'threshold',
              config: {
                field: 'completion.accuracy',
                threshold: 0.8,
                operator: '>='
              }
            }
          },
          {
            name: 'exists_validator',
            validator: {
              type: 'exists',
              config: {
                field: 'completion.test_results'
              }
            }
          },
          {
            name: 'range_validator',
            validator: {
              type: 'range',
              config: {
                field: 'completion.execution_time',
                min: 100,
                max: 30000
              }
            }
          }
        ]
      };

      const result = await validator.validateAndAddFramework(multiValidatorFramework);

      expect(result.success).to.be.true;
      expect(result.validationResults?.execution?.safe).to.be.true;
    });
  });

  describe('Truth Scorer Integration', function() {
    it('should integrate with custom truth component weights', async function() {
      const customWeightsFramework = {
        ...validFramework,
        id: 'custom-weights-framework',
        validation_config: {
          ...validFramework.validation_config,
          truth_component_weights: {
            agent_reliability: 0.4,
            cross_validation: 0.3,
            external_verification: 0.1,
            factual_consistency: 0.1,
            logical_coherence: 0.1
          }
        }
      };

      const result = await validator.validateAndAddFramework(customWeightsFramework);

      expect(result.success).to.be.true;
      expect(result.validationResults?.truthScoring?.compatible).to.be.true;
    });

    it('should validate completions using custom framework', async function() {
      // First add the framework
      const frameworkResult = await validator.validateAndAddFramework({
        ...validFramework,
        id: 'completion-test-framework'
      });

      expect(frameworkResult.success).to.be.true;

      // Then validate a completion using it
      const mockCompletion = {
        title: 'Test Completion',
        accuracy: 0.9,
        execution_time: 1500,
        memory_usage: 512000,
        test_results: { passed: 10, failed: 1 },
        confidence: 0.8
      };

      const completionResult = await validator.validateCompletionWithCustomFramework(
        mockCompletion,
        'completion-test-framework'
      );

      expect(completionResult.success).to.be.true;
      expect(completionResult.truthScore).to.be.a('number');
      expect(completionResult.frameworkValidation?.passed).to.be.true;
    });

    it('should fail completion validation when framework rules are not met', async function() {
      // Add framework with strict requirements
      const strictFramework = {
        ...validFramework,
        id: 'strict-framework',
        validation_config: {
          ...validFramework.validation_config,
          truth_threshold: 0.95 // Very high threshold
        },
        validation_rules: [
          {
            name: 'perfect_accuracy',
            validator: {
              type: 'threshold',
              config: {
                field: 'completion.accuracy',
                threshold: 1.0,
                operator: '>='
              }
            },
            required: true
          }
        ]
      };

      const frameworkResult = await validator.validateAndAddFramework(strictFramework);
      expect(frameworkResult.success).to.be.true;

      // Test with imperfect completion
      const imperfectCompletion = {
        title: 'Imperfect Completion',
        accuracy: 0.85, // Below required 1.0
        execution_time: 2000,
        confidence: 0.7
      };

      const completionResult = await validator.validateCompletionWithCustomFramework(
        imperfectCompletion,
        'strict-framework'
      );

      expect(completionResult.success).to.be.false;
      expect(completionResult.frameworkValidation?.passed).to.be.false;
    });
  });

  describe('Quality Gates', function() {
    it('should apply quality gates correctly', async function() {
      const qualityGateFramework = {
        ...validFramework,
        id: 'quality-gate-framework',
        quality_gates: [
          {
            name: 'minimum_accuracy',
            metric: 'truth_score',
            threshold: 0.8,
            operator: '>=',
            required: true
          },
          {
            name: 'execution_time_limit',
            metric: 'execution_time',
            threshold: 5000,
            operator: '<=',
            required: true
          }
        ]
      };

      const frameworkResult = await validator.validateAndAddFramework(qualityGateFramework);
      expect(frameworkResult.success).to.be.true;

      // Test with completion that meets quality gates
      const goodCompletion = {
        title: 'Good Completion',
        accuracy: 0.9,
        execution_time: 3000,
        confidence: 0.8
      };

      const completionResult = await validator.validateCompletionWithCustomFramework(
        goodCompletion,
        'quality-gate-framework'
      );

      expect(completionResult.success).to.be.true;
      expect(completionResult.qualityGates?.passed).to.be.true;
    });

    it('should fail when quality gates are not met', async function() {
      const frameworkResult = await validator.validateAndAddFramework({
        ...validFramework,
        id: 'failing-quality-gate-framework',
        quality_gates: [
          {
            name: 'strict_execution_time',
            metric: 'execution_time',
            threshold: 1000,
            operator: '<=',
            required: true
          }
        ]
      });

      expect(frameworkResult.success).to.be.true;

      // Test with completion that fails quality gate
      const slowCompletion = {
        title: 'Slow Completion',
        accuracy: 0.95,
        execution_time: 5000, // Above 1000ms limit
        confidence: 0.9
      };

      const completionResult = await validator.validateCompletionWithCustomFramework(
        slowCompletion,
        'failing-quality-gate-framework'
      );

      expect(completionResult.success).to.be.false;
      expect(completionResult.qualityGates?.passed).to.be.false;
      expect(completionResult.qualityGates?.gatesFailed).to.be.greaterThan(0);
    });
  });

  describe('Framework Registry Integration', function() {
    it('should successfully register validated frameworks', async function() {
      const registryFramework = {
        ...validFramework,
        id: 'registry-test-framework'
      };

      const result = await validator.validateAndAddFramework(registryFramework);

      expect(result.success).to.be.true;
      expect(result.frameworkAdded).to.be.true;

      // Verify framework can be retrieved
      const retrievedFramework = registry.getFramework('registry-test-framework');
      expect(retrievedFramework).to.not.be.null;
      expect(retrievedFramework.id).to.equal('registry-test-framework');
    });

    it('should handle framework inheritance', async function() {
      // First add parent framework
      const parentFramework = {
        ...validFramework,
        id: 'parent-framework',
        inheritable: true
      };

      const parentResult = await validator.validateAndAddFramework(parentFramework);
      expect(parentResult.success).to.be.true;

      // Then add child framework that extends parent
      const childFramework = {
        id: 'child-framework',
        name: 'Child Framework',
        version: '1.0.0',
        description: 'Child framework extending parent',
        extends: 'parent-framework',
        validation_config: {
          truth_threshold: 0.9 // Override parent threshold
        },
        validation_rules: [
          {
            name: 'additional_rule',
            validator: {
              type: 'exists',
              config: {
                field: 'completion.additional_field'
              }
            }
          }
        ]
      };

      const childResult = await validator.validateAndAddFramework(childFramework);

      expect(childResult.success).to.be.true;
      expect(childResult.inheritanceValidated).to.be.true;
    });

    it('should handle framework composition', async function() {
      // Add component frameworks first
      const component1 = {
        ...validFramework,
        id: 'component-1',
        composable: true
      };

      const component2 = {
        ...validFramework,
        id: 'component-2',
        composable: true,
        validation_rules: [
          {
            name: 'component2_rule',
            validator: {
              type: 'threshold',
              config: {
                field: 'completion.component2_metric',
                threshold: 0.5,
                operator: '>='
              }
            }
          }
        ]
      };

      await validator.validateAndAddFramework(component1);
      await validator.validateAndAddFramework(component2);

      // Create composite framework
      const compositeFramework = {
        id: 'composite-framework',
        name: 'Composite Framework',
        version: '1.0.0',
        description: 'Framework composed from multiple components',
        composes: ['component-1', 'component-2'],
        validation_config: {
          truth_threshold: 0.8
        },
        composition_rules: {
          conflict_resolution: 'merge',
          require_all_components: true
        }
      };

      const compositeResult = await validator.validateAndAddFramework(compositeFramework);

      expect(compositeResult.success).to.be.true;
      expect(compositeResult.compositionValidated).to.be.true;
    });
  });

  describe('Performance and Error Handling', function() {
    it('should handle concurrent framework validations', async function() {
      const concurrentFrameworks = [];

      for (let i = 0; i < 5; i++) {
        concurrentFrameworks.push({
          ...validFramework,
          id: `concurrent-framework-${i}`,
          name: `Concurrent Framework ${i}`
        });
      }

      const promises = concurrentFrameworks.map(framework =>
        validator.validateAndAddFramework(framework)
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).to.be.true;
      });
    });

    it('should handle validation timeouts gracefully', async function() {
      const timeoutFramework = {
        ...validFramework,
        id: 'timeout-test-framework',
        validation_rules: [
          {
            name: 'slow_rule',
            validator: 'while(true) { /* infinite loop */ }', // This would timeout
            timeout_ms: 100
          }
        ]
      };

      const result = await validator.validateAndAddFramework(timeoutFramework);

      // Should handle timeout without crashing
      expect(result).to.be.an('object');
      expect(result.success).to.be.false;
    });

    it('should provide detailed error information', async function() {
      const result = await validator.validateAndAddFramework(invalidFramework);

      expect(result.success).to.be.false;
      expect(result.errors).to.be.an('array').that.is.not.empty;
      expect(result.phase).to.be.a('string');
      expect(result.duration).to.be.a('number');
    });
  });

  describe('CLI Integration Tests', function() {
    let tempFrameworkFile;

    beforeEach(async function() {
      tempFrameworkFile = path.join(__dirname, 'temp-framework.json');
    });

    afterEach(async function() {
      try {
        await fs.unlink(tempFrameworkFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should handle CLI framework add command', async function() {
      // Write framework to temp file
      await fs.writeFile(tempFrameworkFile, JSON.stringify(validFramework, null, 2));

      const result = await handleFrameworkValidationCommand(
        ['add', tempFrameworkFile],
        { interactive: false }
      );

      expect(result.success).to.be.true;
    });

    it('should handle CLI framework list command', async function() {
      const result = await handleFrameworkValidationCommand(['list']);

      expect(result.success).to.be.true;
      expect(result.frameworks).to.be.an('array');
    });

    it('should handle CLI framework test command', async function() {
      // First add a framework
      await fs.writeFile(tempFrameworkFile, JSON.stringify({
        ...validFramework,
        id: 'cli-test-framework'
      }, null, 2));

      await handleFrameworkValidationCommand(
        ['add', tempFrameworkFile],
        { interactive: false }
      );

      // Then test it
      const result = await handleFrameworkValidationCommand(['test', 'cli-test-framework']);

      expect(result.success).to.be.true;
      expect(result.truthScore).to.be.a('number');
    });

    it('should handle invalid CLI arguments gracefully', async function() {
      const result = await handleFrameworkValidationCommand(['invalid-command']);

      expect(result.help).to.be.true;
    });

    it('should provide helpful error messages for missing files', async function() {
      const result = await handleFrameworkValidationCommand(['add', 'nonexistent-file.json']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('not found');
    });
  });

  describe('Edge Cases and Boundary Tests', function() {
    it('should handle extremely large frameworks', async function() {
      const largeFramework = {
        ...validFramework,
        id: 'large-framework',
        validation_rules: []
      };

      // Add maximum allowed rules
      for (let i = 0; i < 50; i++) {
        largeFramework.validation_rules.push({
          name: `rule_${i}`,
          validator: {
            type: 'threshold',
            config: {
              field: `completion.metric_${i}`,
              threshold: Math.random(),
              operator: '>='
            }
          }
        });
      }

      const result = await validator.validateAndAddFramework(largeFramework);

      expect(result.success).to.be.true;
    });

    it('should reject frameworks exceeding size limits', async function() {
      const oversizedFramework = {
        ...validFramework,
        id: 'oversized-framework',
        description: 'x'.repeat(2000000) // 2MB description
      };

      const result = await validator.validateAndAddFramework(oversizedFramework);

      expect(result.success).to.be.false;
      expect(result.errors?.some(e => e.type === 'size_limit_exceeded')).to.be.true;
    });

    it('should handle circular inheritance detection', async function() {
      // Add framework A that extends B
      const frameworkA = {
        ...validFramework,
        id: 'framework-a',
        extends: 'framework-b'
      };

      // Add framework B that extends A (circular)
      const frameworkB = {
        ...validFramework,
        id: 'framework-b',
        extends: 'framework-a'
      };

      // First framework should fail due to missing parent
      const resultA = await validator.validateAndAddFramework(frameworkA);
      expect(resultA.success).to.be.false;

      // Add B first
      await validator.validateAndAddFramework({
        ...validFramework,
        id: 'framework-b'
      });

      // Now try to update B to extend A (should detect circular reference)
      const circularB = {
        ...frameworkB,
        extends: 'framework-a'
      };

      // This would be detected during inheritance validation
      const circularResult = await validator.validateAndAddFramework(circularB);
      expect(circularResult.success).to.be.false;
    });

    it('should handle empty and null values gracefully', async function() {
      const emptyValuesFramework = {
        id: 'empty-values-framework',
        name: 'Empty Values Framework',
        version: '1.0.0',
        validation_config: {
          truth_threshold: 0.8
        },
        validation_rules: [],
        quality_gates: [],
        metadata: {}
      };

      const result = await validator.validateAndAddFramework(emptyValuesFramework);

      expect(result.success).to.be.true;
    });
  });
});

// Helper functions for testing
function createTestFramework(overrides = {}) {
  return {
    id: `test-framework-${Date.now()}`,
    name: 'Generated Test Framework',
    version: '1.0.0',
    description: 'Automatically generated test framework',
    validation_config: {
      truth_threshold: 0.8,
      truth_component_weights: {
        agent_reliability: 0.3,
        cross_validation: 0.25,
        external_verification: 0.2,
        factual_consistency: 0.15,
        logical_coherence: 0.1
      }
    },
    validation_rules: [
      {
        name: 'basic_accuracy_check',
        validator: {
          type: 'threshold',
          config: {
            field: 'completion.accuracy',
            threshold: 0.7,
            operator: '>='
          }
        }
      }
    ],
    quality_gates: [
      {
        name: 'truth_score_gate',
        metric: 'truth_score',
        threshold: 0.8,
        operator: '>='
      }
    ],
    metadata: {
      created_at: new Date().toISOString(),
      author: 'test-generator'
    },
    ...overrides
  };
}

function createTestCompletion(overrides = {}) {
  return {
    title: 'Test Completion',
    description: 'Generated test completion',
    accuracy: 0.85,
    execution_time: 2000,
    memory_usage: 1024000,
    confidence: 0.8,
    evidence: ['test_evidence'],
    ...overrides
  };
}

export { createTestFramework, createTestCompletion };