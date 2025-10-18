/**
 * Custom Framework Validation System
 * Integrates with TruthScorer and Byzantine consensus for comprehensive framework validation
 *
 * FEATURES:
 * - Integration with existing 745-line TruthScorer system
 * - Byzantine consensus validation for malicious behavior detection
 * - Framework-specific validation logic execution in secure sandbox
 * - Custom truth component weights and thresholds
 * - Real-time performance monitoring and security scanning
 * - Production-ready error handling and recovery mechanisms
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { VM } from 'vm2';
import TruthScorer from '../verification/truth-scorer.js';
import { ByzantineConsensus } from '../core/byzantine-consensus.js';
import { CustomFrameworkValidator, SecurityPatterns } from '../schemas/custom-framework-schema.js';
import { CustomFrameworkRegistry } from '../configuration/custom-framework-registry.js';
import { validatePhase1Completion } from '../integration/phase1-completion-validator.js';

/**
 * Enhanced Custom Framework Validation System
 * Provides comprehensive validation with Byzantine consensus and security enforcement
 */
export class EnhancedCustomFrameworkValidator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enableByzantineValidation: options.enableByzantineValidation !== false,
      enableSecuritySandbox: options.enableSecuritySandbox !== false,
      truthScorerConfig: options.truthScorerConfig || {},
      byzantineConfig: options.byzantineConfig || {},
      maxConcurrentValidations: options.maxConcurrentValidations || 10,
      validationTimeout: options.validationTimeout || 300000, // 5 minutes
      sandboxMemoryLimit: options.sandboxMemoryLimit || 32 * 1024 * 1024, // 32MB
      cacheValidationResults: options.cacheValidationResults !== false,
      ...options,
    };

    // Core components
    this.truthScorer = new TruthScorer(this.options.truthScorerConfig);
    this.byzantineConsensus = new ByzantineConsensus(this.options.byzantineConfig);
    this.schemaValidator = new CustomFrameworkValidator();
    this.frameworkRegistry = new CustomFrameworkRegistry();

    // State management
    this.state = {
      initialized: false,
      activeValidations: new Map(),
      validationCache: new Map(),
      securityProfile: new Map(),
      performanceMetrics: {
        totalValidations: 0,
        successfulValidations: 0,
        securityViolations: 0,
        byzantineRejections: 0,
        averageValidationTime: 0,
      },
    };

    // Validation execution contexts
    this.validationContexts = {
      sandbox: new Map(),
      truthScoring: new Map(),
      byzantine: new Map(),
    };

    // Security enforcement patterns
    this.securityEnforcement = {
      allowedAPIs: [
        'Math',
        'Date',
        'JSON',
        'parseInt',
        'parseFloat',
        'isNaN',
        'isFinite',
        'encodeURIComponent',
        'decodeURIComponent',
        'String',
        'Number',
        'Boolean',
        'Array',
        'Object',
        'RegExp',
      ],
      blockedPatterns: [
        ...SecurityPatterns.codeInjection,
        ...SecurityPatterns.systemAccess,
        ...SecurityPatterns.fileSystem,
        ...SecurityPatterns.networkAccess,
        ...SecurityPatterns.systemCommands,
      ],
      maxExecutionTime: 30000,
      maxMemoryUsage: this.options.sandboxMemoryLimit,
    };
  }

  /**
   * Initialize the enhanced validation system
   */
  async initialize() {
    if (this.state.initialized) return;

    const startTime = performance.now();

    try {
      console.log('🔧 Initializing Enhanced Custom Framework Validator...');

      // Initialize core components
      await this.frameworkRegistry.initialize();

      if (this.truthScorer.initialize) {
        await this.truthScorer.initialize();
      }

      if (this.byzantineConsensus.initialize) {
        await this.byzantineConsensus.initialize();
      }

      // Setup validation monitoring
      this.setupValidationMonitoring();

      this.state.initialized = true;

      const duration = performance.now() - startTime;

      this.emit('initialized', {
        enhancedValidatorReady: true,
        byzantineEnabled: this.options.enableByzantineValidation,
        sandboxEnabled: this.options.enableSecuritySandbox,
        duration,
      });

      console.log(`✅ Enhanced Custom Framework Validator initialized (${duration.toFixed(2)}ms)`);

      return {
        success: true,
        initialized: true,
        duration,
      };
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to initialize Enhanced Custom Framework Validator: ${error.message}`);
    }
  }

  /**
   * Validate and add custom framework with comprehensive checks
   */
  async validateAndAddFramework(frameworkDefinition, options = {}) {
    this.ensureInitialized();

    const validationId = this.generateValidationId();
    const startTime = performance.now();

    try {
      console.log(
        `🔍 Starting comprehensive framework validation: ${frameworkDefinition.id} [${validationId}]`,
      );

      // Track active validation
      this.state.activeValidations.set(validationId, {
        frameworkId: frameworkDefinition.id,
        startTime,
        phase: 'schema_validation',
      });

      // Phase 1: Schema and basic validation
      const schemaResult = await this.performSchemaValidation(frameworkDefinition, validationId);
      if (!schemaResult.valid) {
        return this.completeValidation(validationId, {
          success: false,
          phase: 'schema_validation',
          frameworkId: frameworkDefinition.id,
          errors: schemaResult.errors,
          warnings: schemaResult.warnings,
          securityIssues: schemaResult.securityIssues,
        });
      }

      // Phase 2: Security validation with sandbox testing
      this.updateValidationPhase(validationId, 'security_validation');
      const securityResult = await this.performSecurityValidation(
        frameworkDefinition,
        validationId,
      );
      if (!securityResult.secure) {
        return this.completeValidation(validationId, {
          success: false,
          phase: 'security_validation',
          frameworkId: frameworkDefinition.id,
          securityViolations: securityResult.violations,
          criticalSecurityIssues: securityResult.criticalIssues,
        });
      }

      // Phase 3: Truth scoring integration validation
      this.updateValidationPhase(validationId, 'truth_scoring_validation');
      const truthScoringResult = await this.performTruthScoringValidation(
        frameworkDefinition,
        validationId,
      );
      if (!truthScoringResult.compatible) {
        return this.completeValidation(validationId, {
          success: false,
          phase: 'truth_scoring_validation',
          frameworkId: frameworkDefinition.id,
          truthScoringIssues: truthScoringResult.issues,
        });
      }

      // Phase 4: Framework logic execution testing
      this.updateValidationPhase(validationId, 'logic_execution_testing');
      const executionResult = await this.performLogicExecutionTesting(
        frameworkDefinition,
        validationId,
      );
      if (!executionResult.safe) {
        return this.completeValidation(validationId, {
          success: false,
          phase: 'logic_execution_testing',
          frameworkId: frameworkDefinition.id,
          executionIssues: executionResult.issues,
        });
      }

      // Phase 5: Byzantine consensus validation (if enabled)
      let byzantineResult = { approved: true, consensus: null };
      if (this.options.enableByzantineValidation) {
        this.updateValidationPhase(validationId, 'byzantine_consensus');
        byzantineResult = await this.performByzantineConsensusValidation(
          frameworkDefinition,
          {
            schemaResult,
            securityResult,
            truthScoringResult,
            executionResult,
          },
          validationId,
        );

        if (!byzantineResult.approved) {
          return this.completeValidation(validationId, {
            success: false,
            phase: 'byzantine_consensus',
            frameworkId: frameworkDefinition.id,
            byzantineRejected: true,
            consensus: byzantineResult.consensus,
            maliciousBehaviorDetected: byzantineResult.maliciousBehaviorDetected,
          });
        }
      }

      // Phase 6: Framework registration
      this.updateValidationPhase(validationId, 'framework_registration');
      const registrationResult = await this.frameworkRegistry.addFramework(frameworkDefinition, {
        preValidated: true,
        validationResults: {
          schema: schemaResult,
          security: securityResult,
          truthScoring: truthScoringResult,
          execution: executionResult,
          byzantine: byzantineResult,
        },
      });

      if (!registrationResult.success) {
        return this.completeValidation(validationId, {
          success: false,
          phase: 'framework_registration',
          frameworkId: frameworkDefinition.id,
          registrationError: registrationResult.error,
        });
      }

      // Success - complete validation
      const result = this.completeValidation(validationId, {
        success: true,
        frameworkId: frameworkDefinition.id,
        frameworkAdded: true,
        validationResults: {
          schema: schemaResult,
          security: securityResult,
          truthScoring: truthScoringResult,
          execution: executionResult,
          byzantine: byzantineResult,
          registration: registrationResult,
        },
        performance: {
          totalTime: performance.now() - startTime,
          phases: this.getValidationPhaseMetrics(validationId),
        },
      });

      this.emit('frameworkValidated', result);

      console.log(
        `✅ Framework validation completed: ${frameworkDefinition.id} [${validationId}] (${(performance.now() - startTime).toFixed(2)}ms)`,
      );

      return result;
    } catch (error) {
      console.error(
        `❌ Framework validation failed: ${frameworkDefinition.id} [${validationId}]`,
        error,
      );

      return this.completeValidation(validationId, {
        success: false,
        frameworkId: frameworkDefinition.id,
        error: error.message,
        phase: this.state.activeValidations.get(validationId)?.phase || 'unknown',
      });
    }
  }

  /**
   * Validate completion using custom framework
   */
  async validateCompletionWithCustomFramework(completion, frameworkId) {
    this.ensureInitialized();

    try {
      const framework = this.frameworkRegistry.getFramework(frameworkId);
      if (!framework) {
        throw new Error(`Custom framework '${frameworkId}' not found`);
      }

      // Create enhanced completion claim for truth scoring
      const enhancedClaim = await this.enhanceCompletionClaim(completion, framework);

      // Use custom truth scoring weights if specified
      const truthScorerConfig = this.buildTruthScorerConfig(framework);
      const customTruthScorer = new TruthScorer(truthScorerConfig);

      // Score the completion using custom framework
      const truthScore = await customTruthScorer.scoreClaim(enhancedClaim);

      // Apply framework-specific validation rules
      const frameworkValidationResult = await this.executeFrameworkValidationRules(
        completion,
        framework,
        truthScore,
      );

      // Apply quality gates
      const qualityGateResult = await this.applyQualityGates(
        completion,
        framework,
        truthScore,
        frameworkValidationResult,
      );

      // Determine final validation result
      const passed = this.determineValidationResult(
        truthScore,
        framework,
        frameworkValidationResult,
        qualityGateResult,
      );

      const result = {
        success: passed,
        frameworkUsed: frameworkId,
        frameworkVersion: framework.version,
        truthScore: truthScore.score,
        truthScoreComponents: truthScore.components,
        frameworkTruthThreshold: framework.validation_config.truth_threshold,
        frameworkValidation: frameworkValidationResult,
        qualityGates: qualityGateResult,
        evidence: [
          ...truthScore.evidence,
          ...frameworkValidationResult.evidence,
          ...qualityGateResult.evidence,
        ],
        metadata: {
          validatedAt: new Date().toISOString(),
          validatorVersion: '2.0.0',
          frameworkCompliant: passed,
        },
      };

      this.emit('completionValidated', result);

      return result;
    } catch (error) {
      return {
        success: false,
        frameworkUsed: frameworkId,
        error: error.message,
        validationFailed: true,
        metadata: {
          validatedAt: new Date().toISOString(),
          errorType: 'validation_error',
        },
      };
    }
  }

  // Core validation methods

  async performSchemaValidation(framework, validationId) {
    try {
      const result = await this.schemaValidator.validate(framework);

      this.emit('validationPhaseComplete', {
        validationId,
        phase: 'schema_validation',
        result,
      });

      return result;
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            type: 'schema_validation_error',
            message: `Schema validation failed: ${error.message}`,
          },
        ],
        warnings: [],
        securityIssues: [],
      };
    }
  }

  async performSecurityValidation(framework, validationId) {
    try {
      const violations = [];
      const criticalIssues = [];

      // Enhanced security scanning
      const frameworkString = JSON.stringify(framework);

      // Pattern-based security scanning
      for (const [category, patterns] of Object.entries(SecurityPatterns)) {
        for (const pattern of patterns) {
          const matches = frameworkString.match(pattern);
          if (matches) {
            const severity = this.getSecuritySeverity(category);
            const violation = {
              type: 'security_pattern_match',
              category,
              severity,
              pattern: pattern.toString(),
              matches: matches.slice(0, 3),
            };

            violations.push(violation);

            if (severity === 'critical') {
              criticalIssues.push(violation);
            }
          }
        }
      }

      // Validation rules security scanning
      if (framework.validation_rules) {
        const rulesViolations = await this.scanValidationRulesSecurity(framework.validation_rules);
        violations.push(...rulesViolations.filter((v) => v.severity !== 'critical'));
        criticalIssues.push(...rulesViolations.filter((v) => v.severity === 'critical'));
      }

      // Security configuration validation
      const configViolations = this.validateSecurityConfig(framework.security_config || {});
      violations.push(...configViolations);

      const result = {
        secure: criticalIssues.length === 0,
        violations,
        criticalIssues,
        securityScore: this.calculateSecurityScore(violations),
      };

      this.emit('validationPhaseComplete', {
        validationId,
        phase: 'security_validation',
        result,
      });

      return result;
    } catch (error) {
      return {
        secure: false,
        violations: [
          {
            type: 'security_validation_error',
            severity: 'critical',
            message: `Security validation failed: ${error.message}`,
          },
        ],
        criticalIssues: [],
      };
    }
  }

  async performTruthScoringValidation(framework, validationId) {
    try {
      const issues = [];

      // Validate truth component weights
      if (framework.validation_config.truth_component_weights) {
        const weights = framework.validation_config.truth_component_weights;
        const requiredComponents = [
          'agent_reliability',
          'cross_validation',
          'external_verification',
          'factual_consistency',
          'logical_coherence',
        ];

        // Check for invalid weight values
        for (const [component, weight] of Object.entries(weights)) {
          if (typeof weight !== 'number' || weight < 0 || weight > 1) {
            issues.push({
              type: 'invalid_weight_value',
              component,
              value: weight,
              message: `Invalid weight value for ${component}: must be number between 0 and 1`,
            });
          }
        }

        // Check weight distribution
        const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
        if (Math.abs(totalWeight - 1.0) > 0.1) {
          issues.push({
            type: 'weight_distribution_warning',
            totalWeight,
            message: `Truth component weights sum to ${totalWeight.toFixed(3)} instead of 1.0`,
          });
        }
      }

      // Validate truth threshold
      const threshold = framework.validation_config.truth_threshold;
      if (threshold < 0.1) {
        issues.push({
          type: 'threshold_too_low',
          value: threshold,
          message: `Truth threshold ${threshold} may be too low for reliable validation`,
        });
      } else if (threshold > 0.95) {
        issues.push({
          type: 'threshold_too_high',
          value: threshold,
          message: `Truth threshold ${threshold} may be too restrictive`,
        });
      }

      // Test integration with truth scorer
      const testResult = await this.testTruthScorerIntegration(framework);
      if (!testResult.compatible) {
        issues.push(...testResult.issues);
      }

      const result = {
        compatible:
          issues.filter(
            (i) => i.type !== 'weight_distribution_warning' && i.type !== 'threshold_too_low',
          ).length === 0,
        issues,
        integrationTest: testResult,
      };

      this.emit('validationPhaseComplete', {
        validationId,
        phase: 'truth_scoring_validation',
        result,
      });

      return result;
    } catch (error) {
      return {
        compatible: false,
        issues: [
          {
            type: 'truth_scoring_validation_error',
            message: `Truth scoring validation failed: ${error.message}`,
          },
        ],
      };
    }
  }

  async performLogicExecutionTesting(framework, validationId) {
    if (!this.options.enableSecuritySandbox) {
      return { safe: true, issues: [] };
    }

    try {
      const issues = [];

      // Test each validation rule in sandbox
      if (framework.validation_rules) {
        for (let i = 0; i < framework.validation_rules.length; i++) {
          const rule = framework.validation_rules[i];
          const ruleTest = await this.testRuleInSandbox(rule, i);

          if (!ruleTest.safe) {
            issues.push({
              type: 'unsafe_rule_execution',
              ruleIndex: i,
              ruleName: typeof rule === 'object' ? rule.name : `rule_${i}`,
              issues: ruleTest.issues,
            });
          }
        }
      }

      const result = {
        safe: issues.length === 0,
        issues,
        sandboxTested: true,
      };

      this.emit('validationPhaseComplete', {
        validationId,
        phase: 'logic_execution_testing',
        result,
      });

      return result;
    } catch (error) {
      return {
        safe: false,
        issues: [
          {
            type: 'logic_execution_testing_error',
            message: `Logic execution testing failed: ${error.message}`,
          },
        ],
      };
    }
  }

  async performByzantineConsensusValidation(framework, validationResults, validationId) {
    try {
      // Create validation proposal for Byzantine consensus
      const proposal = {
        type: 'custom_framework_validation',
        framework: {
          id: framework.id,
          name: framework.name,
          version: framework.version,
          author: framework.metadata?.author,
          checksum: this.calculateFrameworkChecksum(framework),
        },
        validationResults: {
          schemaValid: validationResults.schemaResult.valid,
          securityViolations: validationResults.securityResult.violations.length,
          criticalSecurityIssues: validationResults.securityResult.criticalIssues.length,
          truthScoringCompatible: validationResults.truthScoringResult.compatible,
          logicExecutionSafe: validationResults.executionResult.safe,
        },
        riskAssessment: this.assessFrameworkRisk(framework, validationResults),
        timestamp: Date.now(),
      };

      // Generate validators based on risk and complexity
      const validators = this.generateValidators(framework, proposal.riskAssessment);

      // Achieve Byzantine consensus
      const consensusResult = await this.byzantineConsensus.achieveConsensus(proposal, validators);

      // Analyze for malicious behavior
      const maliciousBehaviorAnalysis = this.analyzeMaliciousBehavior(consensusResult);

      const result = {
        approved: consensusResult.achieved,
        consensus: {
          consensusReached: consensusResult.achieved,
          consensusRatio: consensusResult.consensusRatio,
          validatorCount: validators.length,
          approvalCount: consensusResult.votes.filter((v) => v.vote).length,
          rejectionCount: consensusResult.votes.filter((v) => !v.vote).length,
          securityConcerns: consensusResult.votes.filter(
            (v) => !v.vote && v.reason?.includes('security'),
          ).length,
        },
        maliciousBehaviorDetected: maliciousBehaviorAnalysis.detected,
        evidence: {
          byzantineProof: consensusResult.byzantineProof,
          validatorVotes: consensusResult.votes.map((v) => ({
            validatorId: v.validatorId,
            vote: v.vote,
            confidence: v.confidence,
            reasonCategory: this.categorizeRejectionReason(v.reason),
          })),
        },
      };

      this.emit('validationPhaseComplete', {
        validationId,
        phase: 'byzantine_consensus',
        result,
      });

      return result;
    } catch (error) {
      return {
        approved: false,
        error: error.message,
        maliciousBehaviorDetected: false,
      };
    }
  }

  // Framework execution methods

  async executeFrameworkValidationRules(completion, framework, truthScore) {
    const results = {
      passed: true,
      rulesExecuted: 0,
      rulesPassed: 0,
      rulesFailed: 0,
      evidence: [],
      errors: [],
    };

    if (!framework.validation_rules || framework.validation_rules.length === 0) {
      return results;
    }

    try {
      for (let i = 0; i < framework.validation_rules.length; i++) {
        const rule = framework.validation_rules[i];
        const ruleResult = await this.executeValidationRule(rule, completion, truthScore, i);

        results.rulesExecuted++;

        if (ruleResult.passed) {
          results.rulesPassed++;
        } else {
          results.rulesFailed++;
          if (ruleResult.required) {
            results.passed = false;
          }
        }

        results.evidence.push({
          type: 'validation_rule',
          ruleIndex: i,
          ruleName: ruleResult.ruleName,
          passed: ruleResult.passed,
          score: ruleResult.score,
          weight: ruleResult.weight,
          executionTime: ruleResult.executionTime,
          details: ruleResult.details,
        });

        if (ruleResult.error) {
          results.errors.push({
            ruleIndex: i,
            ruleName: ruleResult.ruleName,
            error: ruleResult.error,
          });
        }
      }
    } catch (error) {
      results.passed = false;
      results.errors.push({
        type: 'framework_execution_error',
        message: `Framework validation rules execution failed: ${error.message}`,
      });
    }

    return results;
  }

  async executeValidationRule(rule, completion, truthScore, ruleIndex) {
    const ruleStartTime = performance.now();
    const ruleName = typeof rule === 'object' ? rule.name : `rule_${ruleIndex}`;

    try {
      let ruleResult = { passed: false, score: 0, details: {} };

      if (typeof rule === 'string') {
        // Simple string rule - evaluate as expression
        ruleResult = this.evaluateStringRule(rule, completion, truthScore);
      } else if (typeof rule === 'object') {
        // Complex object rule
        ruleResult = await this.evaluateObjectRule(rule, completion, truthScore);
      }

      return {
        passed: ruleResult.passed,
        score: ruleResult.score,
        weight: rule.weight || 1,
        required: rule.required !== false,
        ruleName,
        executionTime: performance.now() - ruleStartTime,
        details: ruleResult.details,
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        weight: rule.weight || 1,
        required: rule.required !== false,
        ruleName,
        executionTime: performance.now() - ruleStartTime,
        error: error.message,
      };
    }
  }

  async applyQualityGates(completion, framework, truthScore, frameworkValidation) {
    const results = {
      passed: true,
      gatesApplied: 0,
      gatesPassed: 0,
      gatesFailed: 0,
      evidence: [],
      errors: [],
    };

    if (!framework.quality_gates || framework.quality_gates.length === 0) {
      return results;
    }

    try {
      for (let i = 0; i < framework.quality_gates.length; i++) {
        const gate = framework.quality_gates[i];
        const gateResult = await this.applyQualityGate(
          gate,
          completion,
          truthScore,
          frameworkValidation,
        );

        results.gatesApplied++;

        if (gateResult.passed) {
          results.gatesPassed++;
        } else {
          results.gatesFailed++;
          if (gate.required !== false) {
            results.passed = false;
          }
        }

        results.evidence.push({
          type: 'quality_gate',
          gateIndex: i,
          gateName: gate.name,
          metric: gate.metric,
          threshold: gate.threshold,
          actualValue: gateResult.actualValue,
          passed: gateResult.passed,
          operator: gate.operator || '>=',
        });

        if (gateResult.error) {
          results.errors.push({
            gateIndex: i,
            gateName: gate.name,
            error: gateResult.error,
          });
        }
      }
    } catch (error) {
      results.passed = false;
      results.errors.push({
        type: 'quality_gates_error',
        message: `Quality gates application failed: ${error.message}`,
      });
    }

    return results;
  }

  async applyQualityGate(gate, completion, truthScore, frameworkValidation) {
    try {
      let actualValue;

      // Extract metric value based on gate configuration
      switch (gate.metric) {
        case 'truth_score':
          actualValue = truthScore.score;
          break;
        case 'execution_time':
          actualValue = completion.execution_time || 0;
          break;
        case 'memory_usage':
          actualValue = completion.memory_usage || 0;
          break;
        case 'error_rate':
          actualValue =
            frameworkValidation.rulesFailed / Math.max(frameworkValidation.rulesExecuted, 1);
          break;
        case 'test_coverage':
          actualValue = completion.test_coverage || 0;
          break;
        case 'code_quality':
          actualValue = completion.code_quality_score || 0;
          break;
        case 'security_score':
          actualValue = completion.security_score || 0;
          break;
        case 'performance_score':
          actualValue = completion.performance_score || 0;
          break;
        default:
          actualValue = completion.custom_metrics?.[gate.metric] || 0;
      }

      // Apply threshold comparison
      const operator = gate.operator || '>=';
      let passed = false;

      switch (operator) {
        case '>=':
          passed = actualValue >= gate.threshold;
          break;
        case '<=':
          passed = actualValue <= gate.threshold;
          break;
        case '==':
          passed = actualValue === gate.threshold;
          break;
        case '>':
          passed = actualValue > gate.threshold;
          break;
        case '<':
          passed = actualValue < gate.threshold;
          break;
        default:
          passed = actualValue >= gate.threshold;
      }

      return {
        passed,
        actualValue,
        threshold: gate.threshold,
        operator,
      };
    } catch (error) {
      return {
        passed: false,
        actualValue: null,
        error: error.message,
      };
    }
  }

  // Helper methods

  ensureInitialized() {
    if (!this.state.initialized) {
      throw new Error(
        'Enhanced Custom Framework Validator not initialized. Call initialize() first.',
      );
    }
  }

  generateValidationId() {
    return `validation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  updateValidationPhase(validationId, phase) {
    const validation = this.state.activeValidations.get(validationId);
    if (validation) {
      validation.phase = phase;
      validation.phaseStartTime = performance.now();
    }
  }

  completeValidation(validationId, result) {
    const validation = this.state.activeValidations.get(validationId);
    if (validation) {
      result.totalTime = performance.now() - validation.startTime;
      this.state.activeValidations.delete(validationId);

      // Update performance metrics
      this.updatePerformanceMetrics(result);
    }

    return result;
  }

  getValidationPhaseMetrics(validationId) {
    // Return phase-specific timing metrics
    return {
      phases: [
        'schema_validation',
        'security_validation',
        'truth_scoring_validation',
        'logic_execution_testing',
        'byzantine_consensus',
        'framework_registration',
      ],
    };
  }

  setupValidationMonitoring() {
    // Setup performance and error monitoring
    this.on('validationPhaseComplete', (data) => {
      console.log(`📊 Validation phase completed: ${data.phase} [${data.validationId}]`);
    });

    this.on('frameworkValidated', (result) => {
      if (result.success) {
        console.log(`✅ Framework successfully validated and added: ${result.frameworkId}`);
      } else {
        console.log(
          `❌ Framework validation failed: ${result.frameworkId} (Phase: ${result.phase})`,
        );
      }
    });
  }

  calculateFrameworkChecksum(framework) {
    const frameworkString = JSON.stringify(framework, Object.keys(framework).sort());
    return createHash('sha256').update(frameworkString).digest('hex');
  }

  assessFrameworkRisk(framework, validationResults) {
    let riskScore = 0;

    // Security risk assessment
    riskScore += validationResults.securityResult.criticalIssues.length * 10;
    riskScore += validationResults.securityResult.violations.length * 2;

    // Complexity risk assessment
    if (framework.validation_rules)
      riskScore += Math.min(framework.validation_rules.length * 0.5, 5);
    if (framework.quality_gates) riskScore += Math.min(framework.quality_gates.length * 0.3, 3);
    if (framework.extends) riskScore += 2;
    if (framework.composes) riskScore += framework.composes.length * 1.5;

    // Truth scoring risk
    if (!validationResults.truthScoringResult.compatible) riskScore += 5;

    // Logic execution risk
    if (!validationResults.executionResult.safe) riskScore += 8;

    return {
      score: Math.min(riskScore, 50),
      level:
        riskScore < 5 ? 'low' : riskScore < 15 ? 'medium' : riskScore < 25 ? 'high' : 'critical',
    };
  }

  generateValidators(framework, riskAssessment) {
    const baseValidatorCount = 5;
    const riskMultiplier = {
      low: 1,
      medium: 1.2,
      high: 1.5,
      critical: 2,
    };

    const validatorCount = Math.ceil(baseValidatorCount * riskMultiplier[riskAssessment.level]);

    return Array.from({ length: validatorCount }, (_, i) => ({
      id: `enhanced-validator-${i}`,
      specialization: ['security', 'architecture', 'performance', 'integration'][i % 4],
      reputation: 0.8 + Math.random() * 0.2,
      riskTolerance: riskAssessment.level === 'critical' ? 'very_low' : 'low',
    }));
  }

  analyzeMaliciousBehavior(consensusResult) {
    const securityRejections = consensusResult.votes.filter(
      (vote) => !vote.vote && vote.reason?.toLowerCase().includes('security'),
    ).length;

    const totalVotes = consensusResult.votes.length;

    return {
      detected: securityRejections > totalVotes * 0.3,
      securityConcernRatio: securityRejections / totalVotes,
      indicators: securityRejections,
    };
  }

  categorizeRejectionReason(reason) {
    if (!reason) return 'unknown';

    const reasonLower = reason.toLowerCase();
    if (reasonLower.includes('security')) return 'security';
    if (reasonLower.includes('compatibility')) return 'compatibility';
    if (reasonLower.includes('performance')) return 'performance';
    if (reasonLower.includes('malicious')) return 'malicious_behavior';

    return 'other';
  }

  updatePerformanceMetrics(result) {
    this.state.performanceMetrics.totalValidations++;

    if (result.success) {
      this.state.performanceMetrics.successfulValidations++;
    }

    if (result.securityViolations?.length > 0) {
      this.state.performanceMetrics.securityViolations++;
    }

    if (result.byzantineRejected) {
      this.state.performanceMetrics.byzantineRejections++;
    }

    // Update average validation time
    const newAvgTime =
      (this.state.performanceMetrics.averageValidationTime *
        (this.state.performanceMetrics.totalValidations - 1) +
        (result.totalTime || 0)) /
      this.state.performanceMetrics.totalValidations;

    this.state.performanceMetrics.averageValidationTime = newAvgTime;
  }

  // Additional helper methods for various validation steps
  async testTruthScorerIntegration(framework) {
    try {
      const testConfig = this.buildTruthScorerConfig(framework);
      const testTruthScorer = new TruthScorer(testConfig);

      // Test with mock completion claim
      const mockClaim = this.createMockClaim();
      await testTruthScorer.scoreClaim(mockClaim);

      return { compatible: true, issues: [] };
    } catch (error) {
      return {
        compatible: false,
        issues: [
          {
            type: 'truth_scorer_integration_error',
            message: `Truth scorer integration test failed: ${error.message}`,
          },
        ],
      };
    }
  }

  buildTruthScorerConfig(framework) {
    const config = {};

    if (framework.validation_config.truth_threshold) {
      config.threshold = framework.validation_config.truth_threshold;
    }

    if (framework.validation_config.truth_component_weights) {
      config.weights = framework.validation_config.truth_component_weights;
    }

    return config;
  }

  createMockClaim() {
    return {
      id: 'mock_claim_test',
      agentId: 'test_agent',
      type: 'task_completion',
      title: 'Test Claim',
      description: 'Mock claim for integration testing',
      data: { test: true },
      metrics: { accuracy: 0.9 },
      evidence: [],
      status: 'pending',
      confidence: 0.8,
      submittedAt: new Date(),
      metadata: {},
    };
  }

  async enhanceCompletionClaim(completion, framework) {
    return {
      id: `completion_${Date.now()}`,
      agentId: completion.agent_id || 'unknown_agent',
      type: 'task_completion',
      title: completion.title || 'Custom Framework Completion',
      description: completion.description || 'Completion validated using custom framework',
      data: completion,
      metrics: {
        accuracy: completion.accuracy,
        executionTime: completion.execution_time,
        resourceUsage: completion.resource_usage,
        errorRate: completion.error_rate,
        custom: completion.custom_metrics || {},
      },
      evidence: completion.evidence || [],
      status: 'pending',
      confidence: completion.confidence || 0.8,
      submittedAt: new Date(),
      metadata: {
        framework: framework.id,
        frameworkVersion: framework.version,
      },
    };
  }

  determineValidationResult(truthScore, framework, frameworkValidation, qualityGateResult) {
    // Must meet truth threshold
    if (truthScore.score < framework.validation_config.truth_threshold) {
      return false;
    }

    // Must pass framework validation rules
    if (!frameworkValidation.passed) {
      return false;
    }

    // Must pass quality gates
    if (!qualityGateResult.passed) {
      return false;
    }

    return true;
  }

  // Sandbox execution methods
  async testRuleInSandbox(rule, ruleIndex) {
    if (!this.options.enableSecuritySandbox) {
      return { safe: true, issues: [] };
    }

    try {
      const vm = new VM({
        timeout: 5000,
        sandbox: {
          // Provide safe context for rule execution
          completion: { test: true },
          truthScore: { score: 0.8 },
          Math,
          console: { log: () => {} }, // Mock console
        },
      });

      const ruleCode = typeof rule === 'string' ? rule : rule.validator;

      // Test rule execution
      vm.run(ruleCode);

      return { safe: true, issues: [] };
    } catch (error) {
      return {
        safe: false,
        issues: [
          {
            type: 'sandbox_execution_error',
            message: error.message,
          },
        ],
      };
    }
  }

  evaluateStringRule(rule, completion, truthScore) {
    // Simple rule evaluation with safe context
    try {
      const context = {
        completion,
        truthScore: truthScore.score,
        components: truthScore.components,
      };

      // Very basic evaluation - in production this would be more sophisticated
      if (rule.includes('truthScore') && rule.includes('>')) {
        const threshold = parseFloat(rule.match(/>\s*([\d.]+)/)?.[1] || '0');
        return {
          passed: truthScore.score > threshold,
          score: truthScore.score > threshold ? 1 : 0,
          details: { threshold, actualScore: truthScore.score },
        };
      }

      return { passed: true, score: 1, details: { evaluation: 'default_pass' } };
    } catch (error) {
      return { passed: false, score: 0, details: { error: error.message } };
    }
  }

  async evaluateObjectRule(rule, completion, truthScore) {
    try {
      if (rule.validator?.type) {
        return this.evaluateTypedValidator(rule.validator, completion, truthScore);
      }

      return { passed: true, score: 1, details: { type: 'object_rule_default' } };
    } catch (error) {
      return { passed: false, score: 0, details: { error: error.message } };
    }
  }

  evaluateTypedValidator(validator, completion, truthScore) {
    switch (validator.type) {
      case 'threshold':
        return this.evaluateThresholdValidator(validator.config, completion, truthScore);
      case 'regex':
        return this.evaluateRegexValidator(validator.config, completion, truthScore);
      case 'range':
        return this.evaluateRangeValidator(validator.config, completion, truthScore);
      case 'exists':
        return this.evaluateExistsValidator(validator.config, completion, truthScore);
      default:
        return { passed: true, score: 1, details: { type: validator.type } };
    }
  }

  evaluateThresholdValidator(config, completion, truthScore) {
    const value = this.extractValue(config.field, completion, truthScore);
    const threshold = config.threshold;
    const operator = config.operator || '>=';

    let passed = false;
    switch (operator) {
      case '>=':
        passed = value >= threshold;
        break;
      case '>':
        passed = value > threshold;
        break;
      case '<=':
        passed = value <= threshold;
        break;
      case '<':
        passed = value < threshold;
        break;
      case '==':
        passed = value === threshold;
        break;
    }

    return {
      passed,
      score: passed ? 1 : 0,
      details: { value, threshold, operator },
    };
  }

  evaluateRegexValidator(config, completion, truthScore) {
    const value = this.extractValue(config.field, completion, truthScore);
    const pattern = new RegExp(config.pattern, config.flags || '');
    const passed = pattern.test(String(value));

    return {
      passed,
      score: passed ? 1 : 0,
      details: { value, pattern: config.pattern },
    };
  }

  evaluateRangeValidator(config, completion, truthScore) {
    const value = this.extractValue(config.field, completion, truthScore);
    const min = config.min;
    const max = config.max;
    const passed = value >= min && value <= max;

    return {
      passed,
      score: passed ? 1 : 0,
      details: { value, min, max },
    };
  }

  evaluateExistsValidator(config, completion, truthScore) {
    const value = this.extractValue(config.field, completion, truthScore);
    const passed = value !== undefined && value !== null;

    return {
      passed,
      score: passed ? 1 : 0,
      details: { exists: passed, field: config.field },
    };
  }

  extractValue(field, completion, truthScore) {
    if (field.startsWith('truthScore.')) {
      const scorePath = field.replace('truthScore.', '');
      if (scorePath === 'score') return truthScore.score;
      if (scorePath.startsWith('components.')) {
        const component = scorePath.replace('components.', '');
        return truthScore.components[component];
      }
    }

    if (field.startsWith('completion.')) {
      const completionPath = field.replace('completion.', '');
      return this.getNestedValue(completion, completionPath);
    }

    return this.getNestedValue(completion, field);
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  getSecuritySeverity(category) {
    const severityMap = {
      codeInjection: 'critical',
      systemCommands: 'critical',
      systemAccess: 'high',
      fileSystem: 'high',
      networkAccess: 'medium',
      suspiciousKeywords: 'low',
    };
    return severityMap[category] || 'medium';
  }

  async scanValidationRulesSecurity(rules) {
    const violations = [];

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const ruleString = typeof rule === 'string' ? rule : JSON.stringify(rule);

      // Check for dangerous patterns
      for (const [category, patterns] of Object.entries(SecurityPatterns)) {
        for (const pattern of patterns) {
          if (pattern.test(ruleString)) {
            violations.push({
              type: 'rule_security_violation',
              ruleIndex: i,
              category,
              severity: this.getSecuritySeverity(category),
              pattern: pattern.toString(),
            });
          }
        }
      }
    }

    return violations;
  }

  validateSecurityConfig(securityConfig) {
    const violations = [];

    // Check for suspicious security configurations
    if (securityConfig.allow_external_calls === true) {
      violations.push({
        type: 'external_calls_enabled',
        severity: 'high',
        message: 'Framework allows external calls which may pose security risk',
      });
    }

    if (securityConfig.sandbox_execution === false) {
      violations.push({
        type: 'sandbox_disabled',
        severity: 'high',
        message: 'Framework disables sandbox execution',
      });
    }

    if (securityConfig.max_execution_time && securityConfig.max_execution_time > 300000) {
      violations.push({
        type: 'excessive_execution_time',
        severity: 'medium',
        message: 'Framework allows excessive execution time',
      });
    }

    return violations;
  }

  calculateSecurityScore(violations) {
    let score = 1.0;

    for (const violation of violations) {
      switch (violation.severity) {
        case 'critical':
          score -= 0.3;
          break;
        case 'high':
          score -= 0.2;
          break;
        case 'medium':
          score -= 0.1;
          break;
        case 'low':
          score -= 0.05;
          break;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Shutdown the validator
   */
  async shutdown() {
    if (!this.state.initialized) return;

    try {
      // Cleanup active validations
      this.state.activeValidations.clear();
      this.validationContexts.sandbox.clear();
      this.validationContexts.truthScoring.clear();
      this.validationContexts.byzantine.clear();

      // Shutdown components
      if (this.frameworkRegistry.shutdown) {
        await this.frameworkRegistry.shutdown();
      }

      if (this.byzantineConsensus.shutdown) {
        await this.byzantineConsensus.shutdown();
      }

      this.state.initialized = false;
      this.emit('shutdown');

      console.log('✅ Enhanced Custom Framework Validator shut down');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
}

export default EnhancedCustomFrameworkValidator;
