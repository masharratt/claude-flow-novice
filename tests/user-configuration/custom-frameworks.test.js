/**
 * Phase 2 Custom Framework Registry Tests
 * Framework addition with Byzantine validation and security testing
 *
 * Tests custom framework capabilities:
 * - Framework definition and validation
 * - Security validation against malicious rules
 * - Integration with existing framework detection
 * - Byzantine consensus for framework approval
 * - Framework inheritance and composition
 *
 * SECURITY FOCUS:
 * - Code injection prevention
 * - Malicious rule detection
 * - Byzantine consensus against malicious frameworks
 * - Cryptographic validation of framework additions
 */

import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import { ByzantineConsensus } from '../../src/core/byzantine-consensus.js';

let CustomFrameworkRegistry;

describe('Phase 2: Custom Framework Registry - Security & Byzantine Validation', function() {
  this.timeout(25000);

  let frameworkRegistry;
  let byzantineConsensus;
  let testFrameworksPath;

  before(async function() {
    byzantineConsensus = new ByzantineConsensus();

    // Setup test frameworks directory
    testFrameworksPath = path.join(process.cwd(), '.test-frameworks');
    await fs.mkdir(testFrameworksPath, { recursive: true });
  });

  beforeEach(async function() {
    const { CustomFrameworkRegistry: CFR } = await import('../../src/configuration/custom-framework-registry.js');
    CustomFrameworkRegistry = CFR;

    frameworkRegistry = new CustomFrameworkRegistry({
      byzantineConsensus,
      frameworksPath: testFrameworksPath,
      enableSecurityValidation: true,
      enableByzantineValidation: true,
      maliciousCodeDetection: true
    });

    await frameworkRegistry.initialize();
  });

  afterEach(async function() {
    if (frameworkRegistry) {
      await frameworkRegistry.shutdown();
    }
  });

  after(async function() {
    await fs.rm(testFrameworksPath, { recursive: true, force: true });
  });

  describe('Framework Definition and Validation', function() {

    it('should accept valid custom framework definitions', async function() {
      const validFramework = {
        id: 'enhanced-tdd',
        name: 'Enhanced Test-Driven Development',
        version: '1.0.0',
        description: 'TDD with additional quality gates and metrics',
        author: 'test-user',
        validation_config: {
          truth_threshold: 0.90,
          test_coverage_minimum: 0.95,
          code_complexity_maximum: 10,
          maintainability_index_minimum: 85
        },
        validation_rules: [
          {
            name: 'test_first_rule',
            description: 'Tests must be written before implementation',
            validator: 'test_timestamp_before_implementation',
            required: true
          },
          {
            name: 'red_green_refactor',
            description: 'Must follow red-green-refactor cycle',
            validator: 'validate_tdd_cycle',
            required: true
          }
        ],
        quality_gates: [
          {
            phase: 'pre_implementation',
            gate: 'test_design_review',
            criteria: {
              test_cases_designed: true,
              edge_cases_identified: true,
              test_coverage_plan: { minimum: 0.95 }
            }
          },
          {
            phase: 'implementation',
            gate: 'continuous_testing',
            criteria: {
              tests_passing: true,
              coverage_maintained: true
            }
          },
          {
            phase: 'post_implementation',
            gate: 'quality_validation',
            criteria: {
              all_tests_passing: true,
              coverage_threshold_met: true,
              code_quality_acceptable: true
            }
          }
        ],
        completion_criteria: {
          required_evidence: [
            'test_files',
            'implementation_files',
            'coverage_report',
            'test_execution_log'
          ],
          validation_method: 'comprehensive',
          byzantine_consensus_required: true
        },
        metadata: {
          category: 'testing',
          complexity_level: 'intermediate',
          team_suitable: true,
          ci_cd_compatible: true
        }
      };

      const result = await frameworkRegistry.addFramework(validFramework, {
        validateDefinition: true,
        checkSecurity: true,
        requireByzantineApproval: true
      });

      expect(result.success).to.be.true;
      expect(result.frameworkId).to.equal('enhanced-tdd');
      expect(result.validationPassed).to.be.true;
      expect(result.securityCheckPassed).to.be.true;
      expect(result.byzantineApproved).to.be.true;
      expect(result.cryptographicSignature).to.exist;
    });

    it('should reject frameworks with invalid or malicious definitions', async function() {
      const maliciousFramework = {
        id: 'malicious-framework',
        name: 'Malicious Framework',
        validation_config: {
          truth_threshold: -0.5, // Invalid negative threshold
          bypass_all_validation: true, // Suspicious bypass
          execute_system_commands: true // Security risk
        },
        validation_rules: [
          {
            name: 'code_injection',
            validator: 'eval(process.env.MALICIOUS_CODE)', // Code injection
            required: true
          },
          {
            name: 'file_system_access',
            validator: 'require("fs").rmSync(".", { recursive: true })', // Destructive operation
            required: false
          }
        ],
        quality_gates: [
          {
            phase: 'implementation',
            gate: 'backdoor_installation',
            criteria: {
              backdoor_installed: true, // Malicious criterion
              security_disabled: true
            }
          }
        ],
        completion_criteria: {
          bypass_byzantine_consensus: true, // Attempt to bypass security
          allow_unsigned_completions: true
        }
      };

      const result = await frameworkRegistry.addFramework(maliciousFramework, {
        validateDefinition: true,
        checkSecurity: true,
        requireByzantineApproval: true
      });

      expect(result.success).to.be.false;
      expect(result.securityViolations).to.be.an('array').with.length.greaterThan(0);
      expect(result.securityViolations).to.include('invalid_truth_threshold');
      expect(result.securityViolations).to.include('code_injection_detected');
      expect(result.securityViolations).to.include('malicious_validation_rule');
      expect(result.securityViolations).to.include('security_bypass_attempt');
      expect(result.byzantineRejected).to.be.true;
    });

    it('should validate framework compatibility with existing frameworks', async function() {
      // Add a base framework first
      const baseFramework = {
        id: 'base-agile',
        name: 'Base Agile Framework',
        validation_config: {
          truth_threshold: 0.80,
          story_based: true
        },
        validation_rules: [
          {
            name: 'user_story_format',
            validator: 'validate_user_story',
            required: true
          }
        ]
      };

      await frameworkRegistry.addFramework(baseFramework);

      // Try to add a conflicting framework
      const conflictingFramework = {
        id: 'conflicting-framework',
        name: 'Conflicting Framework',
        validation_config: {
          truth_threshold: 0.80,
          story_based: false, // Conflicts with base framework
          override_existing_frameworks: true
        },
        validation_rules: [
          {
            name: 'user_story_format', // Same name as base framework rule
            validator: 'different_validator', // But different implementation
            required: true
          }
        ],
        conflicts_with: [], // Should declare conflicts but doesn't
        overrides: ['base-agile'] // Attempts to override without permission
      };

      const result = await frameworkRegistry.addFramework(conflictingFramework, {
        checkCompatibility: true,
        requireByzantineApproval: true
      });

      expect(result.success).to.be.false;
      expect(result.compatibilityIssues).to.be.an('array').with.length.greaterThan(0);
      expect(result.compatibilityIssues).to.include('rule_name_conflict');
      expect(result.compatibilityIssues).to.include('unauthorized_override_attempt');
      expect(result.byzantineRejected).to.be.true;
    });
  });

  describe('Framework Security Validation', function() {

    it('should detect and prevent code injection attacks', async function() {
      const codeInjectionAttempts = [
        {
          id: 'eval-injection',
          validation_rules: [
            { validator: 'eval(userInput)' }
          ]
        },
        {
          id: 'function-constructor',
          validation_rules: [
            { validator: 'new Function("return process")()' }
          ]
        },
        {
          id: 'require-injection',
          validation_rules: [
            { validator: 'require("child_process").exec("rm -rf /")' }
          ]
        },
        {
          id: 'template-injection',
          validation_rules: [
            { validator: '${process.exit(1)}' }
          ]
        }
      ];

      for (const attempt of codeInjectionAttempts) {
        const result = await frameworkRegistry.addFramework(attempt, {
          checkSecurity: true,
          codeInjectionDetection: true
        });

        expect(result.success).to.be.false;
        expect(result.securityViolations).to.include('code_injection_detected');
      }
    });

    it('should validate framework rule sandbox execution', async function() {
      const frameworkWithUnsafeRule = {
        id: 'unsafe-rule-framework',
        name: 'Framework with Unsafe Rule',
        validation_rules: [
          {
            name: 'safe_rule',
            validator: 'return completion.testCoverage > 0.8', // Safe rule
            required: true
          },
          {
            name: 'unsafe_rule',
            validator: 'require("fs").writeFileSync("/etc/passwd", "hacked")', // Unsafe rule
            required: false
          }
        ]
      };

      const result = await frameworkRegistry.addFramework(frameworkWithUnsafeRule, {
        sandboxValidation: true,
        testExecuteRules: true
      });

      expect(result.success).to.be.false;
      expect(result.sandboxViolations).to.be.an('array').with.length.greaterThan(0);
      expect(result.sandboxViolations).to.include('file_system_access_attempt');
      expect(result.unsafeRules).to.include('unsafe_rule');
    });

    it('should cryptographically sign approved frameworks', async function() {
      const trustedFramework = {
        id: 'trusted-framework',
        name: 'Cryptographically Signed Framework',
        validation_config: {
          truth_threshold: 0.85,
          security_compliant: true
        },
        validation_rules: [
          {
            name: 'secure_validation',
            validator: 'validate_securely',
            required: true
          }
        ],
        security_metadata: {
          author_verified: true,
          code_reviewed: true,
          security_audited: true
        }
      };

      const result = await frameworkRegistry.addFramework(trustedFramework, {
        requireByzantineApproval: true,
        cryptographicSigning: true,
        securityAudit: true
      });

      expect(result.success).to.be.true;
      expect(result.cryptographicSignature).to.exist;
      expect(result.signatureValid).to.be.true;
      expect(result.byzantineApproved).to.be.true;
      expect(result.securityAuditPassed).to.be.true;

      // Verify signature can be validated later
      const framework = await frameworkRegistry.getFramework('trusted-framework');
      const signatureVerification = await frameworkRegistry.verifyFrameworkSignature(framework);

      expect(signatureVerification.valid).to.be.true;
      expect(signatureVerification.trustedSource).to.be.true;
      expect(signatureVerification.tamperEvidence).to.be.false;
    });
  });

  describe('Byzantine Consensus for Framework Approval', function() {

    it('should achieve consensus for legitimate framework additions', async function() {
      const legitimateFramework = {
        id: 'consensus-approved-framework',
        name: 'Consensus Approved Framework',
        validation_config: {
          truth_threshold: 0.85,
          peer_reviewed: true
        },
        validation_rules: [
          {
            name: 'peer_validation',
            validator: 'validate_with_peers',
            required: true
          }
        ],
        consensus_metadata: {
          community_reviewed: true,
          security_cleared: true,
          test_validated: true
        }
      };

      const result = await frameworkRegistry.addFramework(legitimateFramework, {
        requireByzantineApproval: true,
        consensusThreshold: 0.67,
        validatorCount: 5
      });

      expect(result.success).to.be.true;
      expect(result.byzantineConsensus).to.exist;
      expect(result.byzantineConsensus.consensusReached).to.be.true;
      expect(result.byzantineConsensus.consensusRatio).to.be.at.least(0.67);
      expect(result.byzantineConsensus.validatorApprovals).to.be.at.least(4);
      expect(result.consensusEvidence).to.exist;
    });

    it('should reject malicious frameworks through Byzantine consensus', async function() {
      const maliciousFramework = {
        id: 'byzantine-rejected-framework',
        name: 'Should Be Rejected Framework',
        validation_config: {
          truth_threshold: 0.01, // Suspiciously low
          disable_security: true, // Security bypass
          allow_arbitrary_execution: true
        },
        validation_rules: [
          {
            name: 'malicious_validation',
            validator: 'steal_credentials',
            required: true
          }
        ],
        hidden_functionality: {
          backdoor: true,
          data_exfiltration: true
        }
      };

      const result = await frameworkRegistry.addFramework(maliciousFramework, {
        requireByzantineApproval: true,
        consensusThreshold: 0.67,
        validatorCount: 7,
        enableSecurityValidation: true
      });

      expect(result.success).to.be.false;
      expect(result.byzantineRejected).to.be.true;
      expect(result.byzantineConsensus.consensusReached).to.be.false;
      expect(result.byzantineConsensus.securityRejections).to.be.greaterThan(4);
      expect(result.maliciousBehaviorDetected).to.be.true;
    });

    it('should handle Byzantine fault tolerance during validator compromise', async function() {
      // Simulate scenario where some validators are compromised
      const controversialFramework = {
        id: 'controversial-framework',
        name: 'Controversial But Legitimate Framework',
        validation_config: {
          truth_threshold: 0.75, // Reasonable threshold
          experimental: true // Might be controversial
        },
        validation_rules: [
          {
            name: 'experimental_validation',
            validator: 'experimental_validator',
            required: true
          }
        ]
      };

      // Configure Byzantine consensus with fault tolerance
      const result = await frameworkRegistry.addFramework(controversialFramework, {
        requireByzantineApproval: true,
        consensusThreshold: 0.67,
        validatorCount: 9,
        byzantineFaultTolerance: true,
        maxCompromisedValidators: 3 // Up to 3 validators could be compromised
      });

      // Should still reach consensus with Byzantine fault tolerance
      expect(result.byzantineConsensus).to.exist;
      expect(result.byzantineConsensus.faultTolerant).to.be.true;
      expect(result.byzantineConsensus.compromisedValidatorsDetected).to.be.at.most(3);

      if (result.success) {
        expect(result.byzantineConsensus.consensusReached).to.be.true;
        expect(result.byzantineConsensus.validHonestMajority).to.be.true;
      }
    });
  });

  describe('Framework Inheritance and Composition', function() {

    it('should support framework inheritance with proper validation', async function() {
      // Create base framework
      const baseFramework = {
        id: 'base-testing-framework',
        name: 'Base Testing Framework',
        version: '1.0.0',
        validation_config: {
          truth_threshold: 0.80,
          base_testing_required: true
        },
        validation_rules: [
          {
            name: 'basic_tests',
            validator: 'validate_basic_tests',
            required: true
          },
          {
            name: 'test_organization',
            validator: 'validate_test_structure',
            required: true
          }
        ],
        quality_gates: [
          {
            phase: 'implementation',
            gate: 'basic_testing',
            criteria: { tests_exist: true }
          }
        ],
        inheritable: true,
        inheritance_rules: {
          allow_override: ['truth_threshold'],
          require_extension: ['validation_rules'],
          preserve: ['quality_gates']
        }
      };

      await frameworkRegistry.addFramework(baseFramework);

      // Create derived framework
      const derivedFramework = {
        id: 'advanced-testing-framework',
        name: 'Advanced Testing Framework',
        version: '1.0.0',
        extends: 'base-testing-framework',
        validation_config: {
          truth_threshold: 0.90, // Override allowed
          base_testing_required: true, // Inherited
          advanced_testing_required: true // Extended
        },
        validation_rules: [
          // Inherits basic_tests and test_organization
          {
            name: 'performance_tests',
            validator: 'validate_performance_tests',
            required: true
          },
          {
            name: 'security_tests',
            validator: 'validate_security_tests',
            required: true
          }
        ],
        quality_gates: [
          // Inherits basic_testing gate
          {
            phase: 'implementation',
            gate: 'advanced_testing',
            criteria: {
              performance_tests_pass: true,
              security_tests_pass: true
            }
          }
        ]
      };

      const result = await frameworkRegistry.addFramework(derivedFramework, {
        validateInheritance: true,
        requireByzantineApproval: true
      });

      expect(result.success).to.be.true;
      expect(result.inheritanceValidated).to.be.true;
      expect(result.inheritanceIssues).to.be.empty;
      expect(result.resolvedFramework).to.exist;

      // Verify inheritance resolution
      const resolvedFramework = result.resolvedFramework;
      expect(resolvedFramework.validation_rules).to.have.length(4); // 2 inherited + 2 extended
      expect(resolvedFramework.quality_gates).to.have.length(2); // 1 inherited + 1 extended
      expect(resolvedFramework.validation_config.truth_threshold).to.equal(0.90); // Overridden
    });

    it('should support framework composition with conflict resolution', async function() {
      // Create component frameworks
      const securityFramework = {
        id: 'security-framework',
        name: 'Security Framework',
        validation_config: {
          security_threshold: 0.95
        },
        validation_rules: [
          {
            name: 'vulnerability_scan',
            validator: 'validate_security',
            required: true
          }
        ],
        composable: true
      };

      const performanceFramework = {
        id: 'performance-framework',
        name: 'Performance Framework',
        validation_config: {
          performance_threshold: 0.85
        },
        validation_rules: [
          {
            name: 'performance_test',
            validator: 'validate_performance',
            required: true
          }
        ],
        composable: true
      };

      await frameworkRegistry.addFramework(securityFramework);
      await frameworkRegistry.addFramework(performanceFramework);

      // Create composite framework
      const compositeFramework = {
        id: 'secure-performant-framework',
        name: 'Secure and Performant Framework',
        composes: ['security-framework', 'performance-framework'],
        validation_config: {
          truth_threshold: 0.88,
          // Inherits security_threshold and performance_threshold
          composite_validation: true
        },
        validation_rules: [
          {
            name: 'integration_test',
            validator: 'validate_secure_performance_integration',
            required: true
          }
        ],
        composition_rules: {
          conflict_resolution: 'merge',
          require_all_components: true,
          validate_component_compatibility: true
        }
      };

      const result = await frameworkRegistry.addFramework(compositeFramework, {
        validateComposition: true,
        requireByzantineApproval: true
      });

      expect(result.success).to.be.true;
      expect(result.compositionValidated).to.be.true;
      expect(result.componentCompatibility).to.be.true;
      expect(result.resolvedFramework).to.exist;

      // Verify composition resolution
      const resolvedFramework = result.resolvedFramework;
      expect(resolvedFramework.validation_rules).to.have.length(3); // security + performance + integration
      expect(resolvedFramework.validation_config).to.have.property('security_threshold');
      expect(resolvedFramework.validation_config).to.have.property('performance_threshold');
    });
  });

  describe('Framework Validation and Usage', function() {

    it('should validate completions using custom frameworks', async function() {
      // Add a custom framework
      const customFramework = {
        id: 'custom-validation-framework',
        name: 'Custom Validation Framework',
        validation_config: {
          truth_threshold: 0.85,
          custom_metrics_required: true
        },
        validation_rules: [
          {
            name: 'custom_validation',
            validator: 'validate_custom_criteria',
            criteria: {
              documentation_coverage: 0.90,
              code_review_approved: true,
              integration_tests_pass: true
            },
            required: true
          }
        ]
      };

      await frameworkRegistry.addFramework(customFramework);

      // Test completion validation with custom framework
      const completion = {
        id: 'test-completion',
        claim: 'Implemented user authentication with comprehensive documentation',
        framework: 'custom-validation-framework',
        evidence: {
          documentation_coverage: 0.95,
          code_review_approved: true,
          integration_tests_pass: true,
          custom_metrics: {
            complexity_score: 8,
            maintainability_index: 87
          }
        }
      };

      const validationResult = await frameworkRegistry.validateCompletion(completion);

      expect(validationResult.success).to.be.true;
      expect(validationResult.frameworkUsed).to.equal('custom-validation-framework');
      expect(validationResult.truthScore).to.be.at.least(0.85);
      expect(validationResult.customValidationPassed).to.be.true;
      expect(validationResult.criteriaResults).to.exist;
      expect(validationResult.criteriaResults.documentation_coverage).to.be.true;
      expect(validationResult.criteriaResults.code_review_approved).to.be.true;
      expect(validationResult.criteriaResults.integration_tests_pass).to.be.true;
    });

    it('should handle framework versioning and compatibility', async function() {
      // Add framework v1
      const frameworkV1 = {
        id: 'versioned-framework',
        name: 'Versioned Framework',
        version: '1.0.0',
        validation_config: {
          truth_threshold: 0.80
        },
        validation_rules: [
          {
            name: 'basic_validation',
            validator: 'validate_v1',
            required: true
          }
        ],
        backward_compatibility: [],
        forward_compatibility: ['1.1.0']
      };

      await frameworkRegistry.addFramework(frameworkV1);

      // Add framework v1.1
      const frameworkV11 = {
        id: 'versioned-framework',
        name: 'Versioned Framework',
        version: '1.1.0',
        validation_config: {
          truth_threshold: 0.85, // Increased threshold
          new_feature_enabled: true
        },
        validation_rules: [
          {
            name: 'basic_validation',
            validator: 'validate_v11', // Updated validator
            required: true
          },
          {
            name: 'new_validation',
            validator: 'validate_new_feature',
            required: false // Optional for backward compatibility
          }
        ],
        backward_compatibility: ['1.0.0'],
        forward_compatibility: ['1.2.0']
      };

      const result = await frameworkRegistry.addFramework(frameworkV11, {
        allowVersionUpdate: true,
        validateBackwardCompatibility: true
      });

      expect(result.success).to.be.true;
      expect(result.versionUpdated).to.be.true;
      expect(result.backwardCompatible).to.be.true;
      expect(result.migrationPath).to.exist;

      // Test that completions using v1.0.0 still work
      const legacyCompletion = {
        id: 'legacy-completion',
        framework: 'versioned-framework',
        frameworkVersion: '1.0.0',
        claim: 'Legacy completion using old framework version',
        evidence: { basic_evidence: true }
      };

      const legacyValidation = await frameworkRegistry.validateCompletion(legacyCompletion);
      expect(legacyValidation.success).to.be.true;
      expect(legacyValidation.backwardCompatibilityUsed).to.be.true;
    });
  });
});