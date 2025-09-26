/**
 * Scope Control Framework Test Suite
 *
 * Tests validator scope enforcement, boundary detection, and suggestion separation
 * to prevent unscoped feature expansion in agent loops.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ScopeBoundedValidator, ScopeViolationError } from '../../src/validation/scope-control/scope-bounded-validator.js';
import { ValidationScopeGuard } from '../../src/validation/scope-control/validation-scope-guard.js';
import { FeatureSuggestionConfig } from '../../src/validation/scope-control/feature-suggestion-config.js';

describe('Scope Control Framework', () => {
  let testScope;
  let validator;

  beforeEach(() => {
    testScope = {
      primary_objective: "Validate test completion",
      must_validate: ["Tests pass", "Coverage >= 85%", "No breaking changes"],
      must_not_validate: ["Security architecture", "Enterprise features", "Performance optimization"],
      success_criteria: ["All tests green", "Coverage threshold met", "Build succeeds"],
      excluded_areas: ["implementation", "architecture", "enterprise_features"],
      limits: {
        max_complexity: 5,
        max_validation_time: "10 minutes"
      }
    };
  });

  afterEach(() => {
    validator = null;
  });

  describe('Scope Boundary Enforcement', () => {
    test('should reject feature implementation actions', async () => {
      validator = new TestValidator(testScope, 'validation_only');

      const implementationAction = {
        description: 'Implement Byzantine consensus for test validation',
        category: 'implementation',
        complexity: 9
      };

      await expect(
        validator.validate({ actions: [implementationAction] })
      ).rejects.toThrow(ScopeViolationError);
    });

    test('should reject enterprise security expansion', async () => {
      validator = new TestValidator(testScope, 'validation_only');

      const enterpriseAction = {
        description: 'Add enterprise-grade cryptographic validation',
        category: 'security',
        complexity: 10
      };

      await expect(
        validator.validate({ actions: [enterpriseAction] })
      ).rejects.toThrow(ScopeViolationError);
    });

    test('should reject architecture expansion', async () => {
      validator = new TestValidator(testScope, 'validation_only');

      const architectureAction = {
        description: 'Design microservices architecture for testing',
        category: 'architecture',
        complexity: 8
      };

      await expect(
        validator.validate({ actions: [architectureAction] })
      ).rejects.toThrow(ScopeViolationError);
    });

    test('should allow core validation actions', async () => {
      validator = new TestValidator(testScope, 'validation_only');

      const validationActions = [
        {
          description: 'Run test suite and check results',
          category: 'validation',
          complexity: 2
        },
        {
          description: 'Verify code coverage meets 85% threshold',
          category: 'verification',
          complexity: 3
        },
        {
          description: 'Check for breaking changes in API',
          category: 'checking',
          complexity: 4
        }
      ];

      const result = await validator.validate({ actions: validationActions });

      expect(result.scope_compliance.within_original_scope).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.validation_result.success).toBe(true);
    });

    test('should maintain scope adherence score', async () => {
      validator = new TestValidator(testScope, 'validation_only');

      const mixedActions = [
        { description: 'Run tests', category: 'validation', complexity: 2 },
        { description: 'Check coverage', category: 'validation', complexity: 1 },
        { description: 'Add enterprise monitoring', category: 'enterprise', complexity: 8 }
      ];

      try {
        await validator.validate({ actions: mixedActions });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ScopeViolationError);

        const audit = validator.auditScopeCompliance();
        expect(audit.scope_adherence_score).toBeLessThan(100);
        expect(audit.violations_detected.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Suggestion System', () => {
    test('should separate suggestions from core validation in suggest_minor mode', async () => {
      validator = new TestValidator(testScope, 'suggest_minor');

      const mixedActions = [
        {
          description: 'Validate login functionality',
          category: 'validation',
          complexity: 2
        },
        {
          description: 'Consider improving test documentation',
          category: 'code_quality',
          complexity: 2
        },
        {
          description: 'Could optimize test execution performance',
          category: 'performance_minor',
          complexity: 3
        }
      ];

      const result = await validator.validate({ actions: mixedActions });

      expect(result.validation_result.success).toBe(true);
      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].category).toBe('code_quality');
      expect(result.suggestions[1].category).toBe('performance_minor');
      expect(result.scope_compliance.within_original_scope).toBe(true);
    });

    test('should block architectural suggestions in suggest_minor mode', async () => {
      validator = new TestValidator(testScope, 'suggest_minor');

      const architecturalSuggestion = {
        description: 'Consider microservices architecture for better testing',
        category: 'architecture',
        complexity: 7
      };

      const result = await validator.validate({ actions: [architecturalSuggestion] });

      expect(result.suggestions).toHaveLength(0);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].violation.violation_type).toBe('CATEGORY_VIOLATION');
    });

    test('should allow architectural suggestions in suggest_major mode', async () => {
      validator = new TestValidator(testScope, 'suggest_major');

      const architecturalSuggestion = {
        description: 'Consider improving test architecture for better maintainability',
        category: 'architecture',
        complexity: 6
      };

      const result = await validator.validate({ actions: [architecturalSuggestion] });

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].category).toBe('architecture');
      expect(result.suggestions[0].requires_approval).toBe(true);
    });

    test('should enforce suggestion complexity limits', async () => {
      validator = new TestValidator(testScope, 'suggest_minor');

      const highComplexitySuggestion = {
        description: 'Consider implementing distributed test execution',
        category: 'performance_minor',
        complexity: 8
      };

      const result = await validator.validate({ actions: [highComplexitySuggestion] });

      expect(result.suggestions).toHaveLength(0);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].violation.violation_type).toBe('COMPLEXITY_OVERREACH');
    });
  });

  describe('Scope Guard Functionality', () => {
    let scopeGuard;

    beforeEach(() => {
      scopeGuard = new ValidationScopeGuard(testScope, false);
    });

    test('should detect implementation indicators', () => {
      const implementationAction = {
        description: 'Implement new OAuth authentication system',
        complexity: 7
      };

      const analysis = scopeGuard.analyzeAction(implementationAction);

      expect(analysis.implementation_indicators.is_implementation).toBe(true);
      expect(analysis.implementation_indicators.implementation_word_count).toBeGreaterThan(0);
    });

    test('should detect enterprise indicators', () => {
      const enterpriseAction = {
        description: 'Add Byzantine fault tolerance for distributed validation',
        complexity: 10
      };

      const analysis = scopeGuard.analyzeAction(enterpriseAction);

      expect(analysis.enterprise_indicators.is_enterprise).toBe(true);
      expect(analysis.enterprise_indicators.enterprise_features).toContain('byzantine');
    });

    test('should calculate scope alignment correctly', () => {
      const alignedAction = {
        description: 'Run tests and check coverage meets requirements',
        complexity: 3
      };

      const misalignedAction = {
        description: 'Implement blockchain-based consensus mechanism',
        complexity: 10
      };

      const alignedAnalysis = scopeGuard.analyzeAction(alignedAction);
      const misalignedAnalysis = scopeGuard.analyzeAction(misalignedAction);

      expect(alignedAnalysis.scope_alignment).toBeGreaterThan(0.5);
      expect(misalignedAnalysis.scope_alignment).toBeLessThan(0.3);
    });

    test('should validate request with multiple actions', () => {
      const validationRequest = {
        actions: [
          { description: 'Run unit tests', complexity: 2 },
          { description: 'Check test coverage', complexity: 2 },
          { description: 'Implement new security framework', complexity: 9 }
        ]
      };

      const scopeCheck = scopeGuard.validateRequest(validationRequest);

      expect(scopeCheck.withinBounds).toBe(false);
      expect(scopeCheck.approved_actions).toHaveLength(2);
      expect(scopeCheck.rejected_actions).toHaveLength(1);
      expect(scopeCheck.violations).toHaveLength(1);
    });
  });

  describe('Feature Suggestion Configuration', () => {
    test('should configure validation_only mode correctly', () => {
      const config = new FeatureSuggestionConfig(
        FeatureSuggestionConfig.MODES.VALIDATION_ONLY
      );

      expect(config.config.allow_suggestions).toBe(false);
      expect(config.config.max_suggestion_complexity).toBe(0);
      expect(config.config.suggestion_categories).toHaveLength(0);
    });

    test('should configure suggest_minor mode correctly', () => {
      const config = new FeatureSuggestionConfig(
        FeatureSuggestionConfig.MODES.SUGGEST_MINOR
      );

      expect(config.config.allow_suggestions).toBe(true);
      expect(config.config.max_suggestion_complexity).toBe(3);
      expect(config.config.suggestion_categories).toContain('code_quality');
      expect(config.config.suggestion_categories).not.toContain('architecture');
    });

    test('should process suggestions correctly', () => {
      const config = new FeatureSuggestionConfig(
        FeatureSuggestionConfig.MODES.SUGGEST_MAJOR
      );

      const suggestion = {
        description: 'Consider refactoring test structure for better maintainability',
        complexity: 5
      };

      const processed = config.processSuggestion(suggestion);

      expect(processed.allowed).toBe(true);
      expect(processed.category).toBe('architecture');
      expect(processed.requires_approval).toBe(true);
      expect(processed.metadata).toBeDefined();
    });

    test('should reject suggestions exceeding complexity limits', () => {
      const config = new FeatureSuggestionConfig(
        FeatureSuggestionConfig.MODES.SUGGEST_MINOR
      );

      const complexSuggestion = {
        description: 'Implement distributed testing infrastructure',
        complexity: 8
      };

      const processed = config.processSuggestion(complexSuggestion);

      expect(processed.allowed).toBe(false);
      expect(processed.rejection_reason).toContain('Complexity');
    });
  });

  describe('Scope Overreach Prevention', () => {
    test('should prevent completion validator from suggesting enterprise features', async () => {
      const completionScope = {
        primary_objective: "Validate task completion claims",
        must_validate: ["Tests pass as claimed", "Requirements met as stated"],
        must_not_validate: ["Code architecture", "Enterprise security", "Performance optimization"],
        success_criteria: ["Completion claim verified", "Evidence supports claim"],
        excluded_areas: ["enterprise_features", "architecture", "implementation"]
      };

      validator = new TestValidator(completionScope, 'suggest_minor');

      const completionData = {
        claim: "User authentication implemented successfully",
        evidence: { tests_pass: true, coverage: 0.90 },
        actions: [
          {
            description: 'Verify authentication tests pass',
            category: 'validation',
            complexity: 2
          },
          {
            description: 'Add Byzantine consensus for validation',
            category: 'enterprise_features',
            complexity: 10
          }
        ]
      };

      const result = await validator.validate(completionData);

      // Should validate completion without enterprise suggestions
      expect(result.validation_result.success).toBe(true);
      expect(result.suggestions.filter(s => s.category === 'enterprise_features')).toHaveLength(0);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].violation.violation_type).toBe('ENTERPRISE_OVERREACH');
    });

    test('should prevent build validator from adding security frameworks', async () => {
      const buildScope = {
        primary_objective: "Validate build process works",
        must_validate: ["Build completes successfully", "Artifacts generated"],
        must_not_validate: ["Security frameworks", "Performance optimization"],
        success_criteria: ["Build succeeds", "Required artifacts present"],
        excluded_areas: ["security", "enterprise_features"]
      };

      validator = new TestValidator(buildScope, 'validation_only');

      const buildActions = [
        {
          description: 'Execute build command',
          category: 'validation',
          complexity: 2
        },
        {
          description: 'Add enterprise security scanning to build',
          category: 'security',
          complexity: 7
        }
      ];

      await expect(
        validator.validate({ actions: buildActions })
      ).rejects.toThrow(/security.*not.*scope/i);
    });

    test('should maintain scope boundaries across multiple validations', async () => {
      validator = new TestValidator(testScope, 'validation_only');

      // First validation - should pass
      const validActions1 = [
        { description: 'Run tests', category: 'validation', complexity: 2 }
      ];
      const result1 = await validator.validate({ actions: validActions1 });
      expect(result1.scope_compliance.within_original_scope).toBe(true);

      // Second validation with overreach - should fail
      const invalidActions2 = [
        { description: 'Implement microservices', category: 'architecture', complexity: 9 }
      ];
      await expect(
        validator.validate({ actions: invalidActions2 })
      ).rejects.toThrow(ScopeViolationError);

      // Scope boundaries should remain consistent
      expect(validator.originalScope.excluded_areas).toContain('architecture');
    });
  });

  describe('Metrics and Analytics', () => {
    test('should track validation metrics', async () => {
      validator = new TestValidator(testScope, 'suggest_minor');

      const actions = [
        { description: 'Run tests', category: 'validation', complexity: 2 },
        { description: 'Consider better documentation', category: 'code_quality', complexity: 2 }
      ];

      const result = await validator.validate({ actions });

      expect(result.metrics).toBeDefined();
      expect(result.metrics.validation_duration_ms).toBeGreaterThan(0);
      expect(result.metrics.scope_checks_performed).toBeGreaterThan(0);
      expect(result.metrics.suggestions_generated).toBe(1);
      expect(result.metrics.scope_adherence_score).toBe(100);
    });

    test('should calculate efficiency score', async () => {
      validator = new TestValidator(testScope, 'validation_only');

      const actions = [
        { description: 'Validate tests', category: 'validation', complexity: 2 }
      ];

      const result = await validator.validate({ actions });

      expect(result.metrics.efficiency_score).toBeGreaterThanOrEqual(0);
      expect(result.metrics.efficiency_score).toBeLessThanOrEqual(100);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle legacy validator compatibility', async () => {
      // Simulate wrapping a legacy validator
      const legacyValidator = {
        validate: async (target) => ({
          passed: true,
          suggestions: [
            'Add enterprise monitoring',
            'Implement microservices',
            'Add blockchain validation'
          ]
        })
      };

      validator = new TestValidator(testScope, 'validation_only');

      // Should filter out enterprise suggestions from legacy validator
      const result = await validator.validate({
        actions: [
          { description: 'Run basic validation', category: 'validation', complexity: 2 }
        ]
      });

      expect(result.validation_result.success).toBe(true);
      expect(result.suggestions).toHaveLength(0); // No suggestions in validation_only mode
    });

    test('should work with existing project structure', async () => {
      const projectScope = {
        primary_objective: "Validate project build and test",
        must_validate: ["Build succeeds", "Tests pass", "Linting passes"],
        must_not_validate: ["Code architecture", "Database design", "Deployment strategy"],
        success_criteria: ["All validations pass"],
        excluded_areas: ["implementation", "deployment", "architecture"]
      };

      validator = new TestValidator(projectScope, 'suggest_minor');

      const projectActions = [
        { description: 'Run npm build', category: 'validation', complexity: 2 },
        { description: 'Execute test suite', category: 'validation', complexity: 3 },
        { description: 'Run ESLint', category: 'validation', complexity: 1 },
        { description: 'Consider adding Prettier', category: 'code_quality', complexity: 2 }
      ];

      const result = await validator.validate({ actions: projectActions });

      expect(result.validation_result.success).toBe(true);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].category).toBe('code_quality');
      expect(result.scope_compliance.within_original_scope).toBe(true);
    });
  });
});

/**
 * Test implementation of ScopeBoundedValidator for testing
 */
class TestValidator extends ScopeBoundedValidator {
  getValidationPlan(target, context = {}) {
    return {
      actions: target.actions || [],
      objectives: [this.originalScope.primary_objective],
      complexity_estimate: target.actions?.reduce((sum, action) => sum + (action.complexity || 1), 0) || 1
    };
  }

  async executeCoreValidation(target, approvedActions, context) {
    // Simulate validation execution
    const results = {
      success: true,
      actions_executed: approvedActions.length,
      validation_details: approvedActions.map(action => ({
        action: action.description,
        result: 'PASS',
        execution_time: Math.random() * 100
      }))
    };

    // Simulate some validation logic
    if (approvedActions.length === 0) {
      results.success = false;
      results.error = 'No approved actions to execute';
    }

    return results;
  }

  // Override helper methods for testing
  wasObjectiveAddressed(objective) {
    return true; // Simulate objective completion
  }

  wasConstraintViolated(constraint) {
    return false; // Simulate constraint compliance
  }

  wasCriteriaMet(criteria) {
    return true; // Simulate criteria fulfillment
  }

  wasExcludedAreaEntered(area) {
    return false; // Simulate excluded area avoidance
  }

  getTotalActionsAttempted() {
    return this.metrics.scope_checks_performed || 1;
  }

  getTotalValidationActions() {
    return this.metrics.scope_checks_performed || 1;
  }
}

/**
 * Mock scope violation scenarios for testing
 */
describe('Scope Violation Scenarios', () => {
  const testCases = [
    {
      name: 'Feature Implementation Overreach',
      originalScope: 'Validate user login functionality',
      violatingAction: 'Implement OAuth 2.0 authentication system',
      expectedViolationType: 'FEATURE_IMPLEMENTATION'
    },
    {
      name: 'Enterprise Security Overreach',
      originalScope: 'Check if API responses are valid',
      violatingAction: 'Add Byzantine consensus validation with cryptographic proofs',
      expectedViolationType: 'ENTERPRISE_OVERREACH'
    },
    {
      name: 'Architecture Expansion Overreach',
      originalScope: 'Verify database connection works',
      violatingAction: 'Design microservices architecture for better scalability',
      expectedViolationType: 'ARCHITECTURE_EXPANSION'
    },
    {
      name: 'Complexity Overreach',
      originalScope: 'Run simple unit tests',
      violatingAction: 'Implement comprehensive end-to-end testing framework with AI-powered test generation',
      expectedViolationType: 'COMPLEXITY_OVERREACH'
    }
  ];

  testCases.forEach(testCase => {
    test(`should detect ${testCase.name}`, async () => {
      const scope = {
        primary_objective: testCase.originalScope,
        must_validate: [testCase.originalScope],
        must_not_validate: ['implementation', 'architecture', 'enterprise_features'],
        success_criteria: ['validation completed'],
        excluded_areas: ['implementation', 'architecture', 'enterprise_features']
      };

      const validator = new TestValidator(scope, 'validation_only');
      const violatingAction = {
        description: testCase.violatingAction,
        complexity: 9
      };

      try {
        await validator.validate({ actions: [violatingAction] });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ScopeViolationError);
        expect(error.message).toContain(testCase.expectedViolationType.toLowerCase());
      }
    });
  });
});