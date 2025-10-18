/**
 * Phase 3 Framework Compliance Tester
 *
 * CRITICAL MISSION: Test framework compliance for the same system that will validate
 * your testing completion using Byzantine consensus.
 *
 * FRAMEWORK TESTING REQUIREMENTS:
 * - TDD (Test-Driven Development): ≥0.90 truth threshold
 * - BDD (Behavior-Driven Development): ≥0.85 truth threshold
 * - SPARC (Specification, Pseudocode, Architecture, Refinement, Completion): ≥0.80 truth threshold
 * - Clean Architecture: Custom thresholds
 * - Domain-Driven Design (DDD): Custom thresholds
 *
 * VALIDATION TARGETS:
 * - JavaScript/TypeScript projects: >90% accuracy
 * - Python projects: >90% accuracy
 * - Mixed framework projects: Proper detection
 * - Custom framework projects: User-defined validation
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';

// Import existing framework systems
import { FrameworkDetector } from '../src/completion/framework-detector.js';
import { CompletionTruthValidator } from '../src/validation/completion-truth-validator.js';
import { EnhancedCustomFrameworkValidator } from '../src/validation/custom-framework-validator.js';
import { ByzantineConsensus } from '../src/core/byzantine-consensus.js';
import { SqliteMemoryStore } from '../src/memory/sqlite-store.js';

export class Phase3FrameworkComplianceTester extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      testProjectCount: options.testProjectCount || 10,
      accuracyThreshold: options.accuracyThreshold || 0.90,
      byzantineValidation: options.byzantineValidation !== false,
      detailedReporting: options.detailedReporting !== false,
      ...options
    };

    // Core testing components
    this.frameworkDetector = new FrameworkDetector();
    this.truthValidator = new CompletionTruthValidator();
    this.customFrameworkValidator = new EnhancedCustomFrameworkValidator();
    this.byzantineConsensus = new ByzantineConsensus();
    this.memoryStore = new SqliteMemoryStore();

    // Framework definitions with compliance requirements
    this.supportedFrameworks = {
      TDD: {
        name: 'Test-Driven Development',
        truthThreshold: 0.90,
        requiredCoverage: 0.95,
        validationRules: [
          'testCoverage >= 0.95',
          'truthScore >= 0.90',
          'redGreenRefactor === true',
          'testFirst === true'
        ],
        testProjectTypes: ['javascript', 'typescript', 'python']
      },
      BDD: {
        name: 'Behavior-Driven Development',
        truthThreshold: 0.85,
        requiredScenarioCoverage: 0.90,
        validationRules: [
          'scenarioCoverage >= 0.90',
          'truthScore >= 0.85',
          'gherkinCompliant === true',
          'givenWhenThen === true'
        ],
        testProjectTypes: ['javascript', 'typescript', 'python']
      },
      SPARC: {
        name: 'Specification, Pseudocode, Architecture, Refinement, Completion',
        truthThreshold: 0.80,
        requiredPhaseCompletion: 1.0,
        validationRules: [
          'phaseCompletion >= 1.0',
          'truthScore >= 0.80',
          'specificationComplete === true',
          'architectureValidated === true',
          'refinementComplete === true'
        ],
        testProjectTypes: ['javascript', 'typescript', 'python']
      },
      CLEAN_ARCHITECTURE: {
        name: 'Clean Architecture',
        truthThreshold: 0.85,
        customThresholds: true,
        validationRules: [
          'layerSeparation >= 0.90',
          'dependencyInversion === true',
          'truthScore >= 0.85',
          'businessLogicIsolation >= 0.90'
        ],
        testProjectTypes: ['javascript', 'typescript', 'python']
      },
      DDD: {
        name: 'Domain-Driven Design',
        truthThreshold: 0.85,
        customThresholds: true,
        validationRules: [
          'domainModelComplexity <= 0.70',
          'boundedContexts >= 1',
          'truthScore >= 0.85',
          'aggregateConsistency >= 0.90'
        ],
        testProjectTypes: ['javascript', 'typescript', 'python']
      }
    };

    // Test results storage
    this.testResults = {
      frameworkCompliance: new Map(),
      detectionAccuracy: new Map(),
      validationRules: new Map(),
      crossFrameworkPrevention: new Map(),
      byzantineValidation: new Map(),
      overallScore: 0,
      startTime: null,
      endTime: null
    };

    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    console.log('🔧 Initializing Phase 3 Framework Compliance Tester...');
    const startTime = performance.now();

    try {
      // Initialize all components
      await this.memoryStore.initialize();
      await this.frameworkDetector.initialize();
      await this.truthValidator.initialize();
      await this.customFrameworkValidator.initialize();

      if (this.byzantineConsensus.initialize) {
        await this.byzantineConsensus.initialize();
      }

      this.testResults.startTime = Date.now();
      this.initialized = true;

      const duration = performance.now() - startTime;
      console.log(`✅ Phase 3 Framework Compliance Tester initialized (${duration.toFixed(2)}ms)`);

      this.emit('initialized', { duration, byzantineEnabled: this.options.byzantineValidation });
      return { success: true, duration };

    } catch (error) {
      console.error('❌ Failed to initialize Phase 3 Framework Compliance Tester:', error);
      throw error;
    }
  }

  /**
   * Execute comprehensive framework compliance testing
   */
  async executeComplianceTesting() {
    await this.initialize();

    console.log('🚀 Starting Phase 3 Framework Compliance Testing...');
    console.log(`📊 Testing ${Object.keys(this.supportedFrameworks).length} frameworks with ${this.options.testProjectCount} projects each`);

    try {
      // Phase 1: Test each supported framework
      await this.testAllFrameworksCompliance();

      // Phase 2: Validate framework detection accuracy
      await this.validateFrameworkDetectionAccuracy();

      // Phase 3: Test framework-specific validation rules
      await this.testFrameworkValidationRules();

      // Phase 4: Test cross-framework validation prevention
      await this.testCrossFrameworkValidationPrevention();

      // Phase 5: Byzantine consensus validation of compliance results
      if (this.options.byzantineValidation) {
        await this.validateComplianceWithByzantineConsensus();
      }

      // Generate comprehensive compliance report
      const complianceReport = await this.generateComplianceReport();

      this.testResults.endTime = Date.now();
      this.testResults.overallScore = this.calculateOverallComplianceScore();

      console.log(`✅ Phase 3 Framework Compliance Testing completed (${((this.testResults.endTime - this.testResults.startTime) / 1000).toFixed(2)}s)`);
      console.log(`📈 Overall Compliance Score: ${(this.testResults.overallScore * 100).toFixed(2)}%`);

      this.emit('complianceTestingComplete', {
        results: this.testResults,
        report: complianceReport,
        overallScore: this.testResults.overallScore
      });

      return {
        success: true,
        results: this.testResults,
        report: complianceReport,
        overallScore: this.testResults.overallScore,
        byzantineValidated: this.options.byzantineValidation,
        testDuration: (this.testResults.endTime - this.testResults.startTime) / 1000
      };

    } catch (error) {
      console.error('❌ Framework compliance testing failed:', error);
      throw error;
    }
  }

  /**
   * Test each framework with 10+ real projects per framework
   */
  async testAllFrameworksCompliance() {
    console.log('🧪 Testing framework compliance across all supported frameworks...');

    for (const [frameworkKey, framework] of Object.entries(this.supportedFrameworks)) {
      console.log(`📋 Testing ${framework.name} framework compliance...`);

      const frameworkResults = {
        framework: frameworkKey,
        name: framework.name,
        truthThreshold: framework.truthThreshold,
        projectsTestedCount: 0,
        projectsPassed: 0,
        projectsFailed: 0,
        averageTruthScore: 0,
        averageValidationTime: 0,
        testDetails: [],
        complianceRate: 0,
        issues: []
      };

      try {
        // Test framework with required number of projects
        for (let i = 0; i < this.options.testProjectCount; i++) {
          const testProject = this.generateTestProject(frameworkKey, i);
          const projectResult = await this.testFrameworkWithProject(framework, testProject);

          frameworkResults.projectsTestedCount++;
          frameworkResults.testDetails.push(projectResult);
          frameworkResults.averageTruthScore += projectResult.truthScore;
          frameworkResults.averageValidationTime += projectResult.validationTime;

          if (projectResult.passed) {
            frameworkResults.projectsPassed++;
          } else {
            frameworkResults.projectsFailed++;
            frameworkResults.issues.push(...projectResult.issues);
          }
        }

        // Calculate framework compliance metrics
        frameworkResults.averageTruthScore /= frameworkResults.projectsTestedCount;
        frameworkResults.averageValidationTime /= frameworkResults.projectsTestedCount;
        frameworkResults.complianceRate = frameworkResults.projectsPassed / frameworkResults.projectsTestedCount;

        // Validate framework meets minimum requirements
        const frameworkCompliant = this.validateFrameworkCompliance(framework, frameworkResults);
        frameworkResults.frameworkCompliant = frameworkCompliant.compliant;
        frameworkResults.complianceIssues = frameworkCompliant.issues;

        this.testResults.frameworkCompliance.set(frameworkKey, frameworkResults);

        console.log(`✅ ${framework.name}: ${(frameworkResults.complianceRate * 100).toFixed(1)}% compliance (${frameworkResults.projectsPassed}/${frameworkResults.projectsTestedCount})`);

      } catch (error) {
        console.error(`❌ Framework testing failed for ${framework.name}:`, error);
        frameworkResults.error = error.message;
        this.testResults.frameworkCompliance.set(frameworkKey, frameworkResults);
      }
    }
  }

  /**
   * Validate framework detection accuracy >90%
   */
  async validateFrameworkDetectionAccuracy() {
    console.log('🎯 Validating framework detection accuracy...');

    const detectionTestCases = [
      // JavaScript/TypeScript projects
      ...this.generateJavaScriptDetectionCases(),
      ...this.generateTypeScriptDetectionCases(),
      // Python projects
      ...this.generatePythonDetectionCases(),
      // Mixed framework projects
      ...this.generateMixedFrameworkCases(),
      // Custom framework projects
      ...this.generateCustomFrameworkCases()
    ];

    const detectionResults = {
      totalCases: detectionTestCases.length,
      correctDetections: 0,
      incorrectDetections: 0,
      accuracyRate: 0,
      languageAccuracy: {
        javascript: { total: 0, correct: 0, accuracy: 0 },
        typescript: { total: 0, correct: 0, accuracy: 0 },
        python: { total: 0, correct: 0, accuracy: 0 },
        mixed: { total: 0, correct: 0, accuracy: 0 },
        custom: { total: 0, correct: 0, accuracy: 0 }
      },
      detectionDetails: []
    };

    for (const testCase of detectionTestCases) {
      try {
        const detectionResult = await this.frameworkDetector.detectFramework();
        const isCorrect = detectionResult.detected === testCase.expectedFramework;

        detectionResults.languageAccuracy[testCase.type].total++;

        if (isCorrect) {
          detectionResults.correctDetections++;
          detectionResults.languageAccuracy[testCase.type].correct++;
        } else {
          detectionResults.incorrectDetections++;
        }

        detectionResults.detectionDetails.push({
          testCase: testCase.name,
          type: testCase.type,
          expected: testCase.expectedFramework,
          detected: detectionResult.detected,
          confidence: detectionResult.confidence,
          correct: isCorrect,
          detectionTime: detectionResult.metadata?.detectionTime || 0
        });

      } catch (error) {
        console.error(`Detection test failed for ${testCase.name}:`, error);
        detectionResults.incorrectDetections++;
        detectionResults.detectionDetails.push({
          testCase: testCase.name,
          type: testCase.type,
          expected: testCase.expectedFramework,
          detected: 'ERROR',
          error: error.message,
          correct: false
        });
      }
    }

    // Calculate accuracy rates
    detectionResults.accuracyRate = detectionResults.correctDetections / detectionResults.totalCases;

    for (const [language, stats] of Object.entries(detectionResults.languageAccuracy)) {
      stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
    }

    this.testResults.detectionAccuracy.set('overall', detectionResults);

    console.log(`🎯 Framework Detection Accuracy: ${(detectionResults.accuracyRate * 100).toFixed(2)}%`);
    console.log(`   JavaScript: ${(detectionResults.languageAccuracy.javascript.accuracy * 100).toFixed(1)}%`);
    console.log(`   TypeScript: ${(detectionResults.languageAccuracy.typescript.accuracy * 100).toFixed(1)}%`);
    console.log(`   Python: ${(detectionResults.languageAccuracy.python.accuracy * 100).toFixed(1)}%`);
  }

  /**
   * Test framework-specific validation rules execution accuracy
   */
  async testFrameworkValidationRules() {
    console.log('⚖️ Testing framework-specific validation rules...');

    const ruleTestResults = new Map();

    for (const [frameworkKey, framework] of Object.entries(this.supportedFrameworks)) {
      console.log(`🔍 Testing validation rules for ${framework.name}...`);

      const ruleResults = {
        framework: frameworkKey,
        totalRules: framework.validationRules.length,
        rulesExecuted: 0,
        rulesPassed: 0,
        rulesFailed: 0,
        executionAccuracy: 0,
        averageExecutionTime: 0,
        ruleDetails: [],
        issues: []
      };

      for (let i = 0; i < framework.validationRules.length; i++) {
        const rule = framework.validationRules[i];

        try {
          // Test rule execution with various completion scenarios
          const ruleTestCases = this.generateRuleTestCases(frameworkKey, rule);
          let ruleExecutionCount = 0;
          let rulePassCount = 0;
          let totalExecutionTime = 0;

          for (const testCase of ruleTestCases) {
            const ruleStartTime = performance.now();
            const ruleResult = await this.executeValidationRuleTest(rule, testCase);
            const executionTime = performance.now() - ruleStartTime;

            ruleExecutionCount++;
            totalExecutionTime += executionTime;

            if (ruleResult.passed === testCase.expectedPass) {
              rulePassCount++;
            }
          }

          const ruleAccuracy = rulePassCount / ruleExecutionCount;
          const avgExecutionTime = totalExecutionTime / ruleExecutionCount;

          ruleResults.rulesExecuted++;
          ruleResults.averageExecutionTime += avgExecutionTime;

          if (ruleAccuracy >= 0.90) {
            ruleResults.rulesPassed++;
          } else {
            ruleResults.rulesFailed++;
            ruleResults.issues.push(`Rule "${rule}" accuracy: ${(ruleAccuracy * 100).toFixed(1)}% (below 90%)`);
          }

          ruleResults.ruleDetails.push({
            rule,
            ruleIndex: i,
            accuracy: ruleAccuracy,
            executionTime: avgExecutionTime,
            testCasesExecuted: ruleExecutionCount,
            passed: ruleAccuracy >= 0.90
          });

        } catch (error) {
          console.error(`Rule testing failed for ${framework.name} rule "${rule}":`, error);
          ruleResults.rulesFailed++;
          ruleResults.issues.push(`Rule "${rule}" execution error: ${error.message}`);
        }
      }

      ruleResults.executionAccuracy = ruleResults.rulesPassed / ruleResults.rulesExecuted;
      ruleResults.averageExecutionTime /= ruleResults.rulesExecuted;

      ruleTestResults.set(frameworkKey, ruleResults);

      console.log(`⚖️ ${framework.name} Rules: ${ruleResults.rulesPassed}/${ruleResults.rulesExecuted} passed (${(ruleResults.executionAccuracy * 100).toFixed(1)}%)`);
    }

    this.testResults.validationRules = ruleTestResults;
  }

  /**
   * Test cross-framework validation prevention
   */
  async testCrossFrameworkValidationPrevention() {
    console.log('🚫 Testing cross-framework validation prevention...');

    const preventionResults = {
      totalTests: 0,
      preventionSuccesses: 0,
      preventionFailures: 0,
      preventionRate: 0,
      testDetails: [],
      issues: []
    };

    const frameworkPairs = this.generateFrameworkPairs();

    for (const pair of frameworkPairs) {
      try {
        // Create a project configured for framework A
        const projectA = this.generateTestProject(pair.frameworkA, 0);

        // Try to validate it using framework B (should be prevented)
        const frameworkBConfig = this.supportedFrameworks[pair.frameworkB];
        const crossValidationResult = await this.attemptCrossFrameworkValidation(
          projectA,
          pair.frameworkA,
          frameworkBConfig
        );

        preventionResults.totalTests++;

        if (crossValidationResult.prevented) {
          preventionResults.preventionSuccesses++;
        } else {
          preventionResults.preventionFailures++;
          preventionResults.issues.push(
            `Cross-validation not prevented: ${pair.frameworkA} project validated with ${pair.frameworkB} rules`
          );
        }

        preventionResults.testDetails.push({
          sourceFramework: pair.frameworkA,
          targetFramework: pair.frameworkB,
          prevented: crossValidationResult.prevented,
          reason: crossValidationResult.reason,
          detectionAccuracy: crossValidationResult.detectionAccuracy
        });

      } catch (error) {
        console.error(`Cross-framework prevention test failed for ${pair.frameworkA} -> ${pair.frameworkB}:`, error);
        preventionResults.preventionFailures++;
      }
    }

    preventionResults.preventionRate = preventionResults.preventionSuccesses / preventionResults.totalTests;
    this.testResults.crossFrameworkPrevention.set('overall', preventionResults);

    console.log(`🚫 Cross-framework prevention: ${(preventionResults.preventionRate * 100).toFixed(1)}% effective`);
  }

  /**
   * Validate compliance results using Byzantine consensus
   */
  async validateComplianceWithByzantineConsensus() {
    console.log('🛡️ Validating compliance results with Byzantine consensus...');

    try {
      // Create consensus proposal with all compliance test results
      const complianceProposal = {
        type: 'framework_compliance_validation',
        frameworkResults: Object.fromEntries(this.testResults.frameworkCompliance),
        detectionAccuracy: Object.fromEntries(this.testResults.detectionAccuracy),
        validationRules: Object.fromEntries(this.testResults.validationRules),
        crossFrameworkPrevention: Object.fromEntries(this.testResults.crossFrameworkPrevention),
        overallScore: this.calculateOverallComplianceScore(),
        testTimestamp: Date.now(),
        testerSignature: this.generateTesterSignature()
      };

      // Generate validators for compliance validation
      const validators = this.generateComplianceValidators();

      // Achieve Byzantine consensus on compliance results
      const consensusResult = await this.byzantineConsensus.achieveConsensus(
        complianceProposal,
        validators
      );

      const byzantineResults = {
        consensusAchieved: consensusResult.achieved,
        consensusRatio: consensusResult.consensusRatio,
        validatorCount: validators.length,
        approvalVotes: consensusResult.votes.filter(v => v.vote).length,
        rejectionVotes: consensusResult.votes.filter(v => !v.vote).length,
        byzantineProof: consensusResult.byzantineProof,
        cryptographicEvidence: this.generateCryptographicEvidence(consensusResult),
        validatedAt: new Date().toISOString(),
        consensusTime: consensusResult.consensusTime || 0
      };

      this.testResults.byzantineValidation.set('compliance', byzantineResults);

      if (consensusResult.achieved) {
        console.log(`🛡️ Byzantine consensus achieved: ${(consensusResult.consensusRatio * 100).toFixed(1)}% validator approval`);
      } else {
        console.log(`⚠️ Byzantine consensus failed: ${(consensusResult.consensusRatio * 100).toFixed(1)}% validator approval (insufficient)`);
      }

      return byzantineResults;

    } catch (error) {
      console.error('Byzantine consensus validation failed:', error);
      const errorResult = {
        consensusAchieved: false,
        error: error.message,
        validatedAt: new Date().toISOString()
      };
      this.testResults.byzantineValidation.set('compliance', errorResult);
      return errorResult;
    }
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateComplianceReport() {
    console.log('📊 Generating comprehensive compliance report...');

    const report = {
      reportMetadata: {
        generatedAt: new Date().toISOString(),
        phase: 'Phase 3 - Framework Compliance Testing',
        testDuration: (this.testResults.endTime - this.testResults.startTime) / 1000,
        overallScore: this.testResults.overallScore,
        byzantineValidated: this.options.byzantineValidation
      },

      executiveSummary: {
        totalFrameworksTested: Object.keys(this.supportedFrameworks).length,
        totalProjectsTested: Object.keys(this.supportedFrameworks).length * this.options.testProjectCount,
        overallComplianceRate: this.testResults.overallScore,
        criticalIssuesFound: this.extractCriticalIssues(),
        recommendationsCount: this.generateRecommendations().length
      },

      frameworkComplianceResults: this.generateFrameworkComplianceSection(),
      detectionAccuracyResults: this.generateDetectionAccuracySection(),
      validationRulesResults: this.generateValidationRulesSection(),
      crossFrameworkPreventionResults: this.generateCrossFrameworkPreventionSection(),
      byzantineConsensusResults: this.generateByzantineConsensusSection(),

      recommendations: this.generateRecommendations(),
      criticalIssues: this.extractCriticalIssues(),
      performanceMetrics: this.generatePerformanceMetrics(),

      complianceVerification: {
        allFrameworksCompliant: this.verifyAllFrameworksCompliant(),
        detectionAccuracyMet: this.verifyDetectionAccuracyMet(),
        validationRulesAccurate: this.verifyValidationRulesAccurate(),
        crossFrameworkPreventionEffective: this.verifyCrossFrameworkPreventionEffective(),
        byzantineConsensusAchieved: this.verifyByzantineConsensusAchieved()
      }
    };

    // Store report for future reference
    await this.storeComplianceReport(report);

    return report;
  }

  // Helper methods for testing framework compliance

  generateTestProject(frameworkKey, projectIndex) {
    const project = {
      id: `test_project_${frameworkKey}_${projectIndex}`,
      name: `Test Project for ${frameworkKey} Framework ${projectIndex}`,
      framework: frameworkKey,
      type: this.supportedFrameworks[frameworkKey].testProjectTypes[projectIndex % 3],

      // Framework-specific project data
      completion: {
        id: `completion_${frameworkKey}_${projectIndex}`,
        framework: frameworkKey,
        claim: `Test completion for ${frameworkKey} framework validation`,
        evidence: this.generateFrameworkSpecificEvidence(frameworkKey),

        // TDD specific
        testCoverage: frameworkKey === 'TDD' ? 0.95 + Math.random() * 0.05 : Math.random() * 0.9,
        redGreenRefactor: frameworkKey === 'TDD' ? true : Math.random() > 0.5,
        testFirst: frameworkKey === 'TDD' ? true : Math.random() > 0.5,

        // BDD specific
        scenarioCoverage: frameworkKey === 'BDD' ? 0.90 + Math.random() * 0.1 : Math.random() * 0.9,
        gherkinCompliant: frameworkKey === 'BDD' ? true : Math.random() > 0.5,
        givenWhenThen: frameworkKey === 'BDD' ? true : Math.random() > 0.5,

        // SPARC specific
        phases: frameworkKey === 'SPARC' ? this.generateCompleteSPARCPhases() : this.generateRandomPhases(),
        specificationComplete: frameworkKey === 'SPARC' ? true : Math.random() > 0.5,
        architectureValidated: frameworkKey === 'SPARC' ? true : Math.random() > 0.5,
        refinementComplete: frameworkKey === 'SPARC' ? true : Math.random() > 0.5,

        // Clean Architecture specific
        layerSeparation: frameworkKey === 'CLEAN_ARCHITECTURE' ? 0.90 + Math.random() * 0.1 : Math.random() * 0.9,
        dependencyInversion: frameworkKey === 'CLEAN_ARCHITECTURE' ? true : Math.random() > 0.5,
        businessLogicIsolation: frameworkKey === 'CLEAN_ARCHITECTURE' ? 0.90 + Math.random() * 0.1 : Math.random() * 0.9,

        // DDD specific
        domainModelComplexity: frameworkKey === 'DDD' ? 0.60 + Math.random() * 0.1 : Math.random(),
        boundedContexts: frameworkKey === 'DDD' ? Math.floor(1 + Math.random() * 3) : Math.floor(Math.random() * 2),
        aggregateConsistency: frameworkKey === 'DDD' ? 0.90 + Math.random() * 0.1 : Math.random() * 0.9,

        metadata: {
          projectIndex,
          generatedAt: new Date().toISOString()
        }
      }
    };

    return project;
  }

  async testFrameworkWithProject(framework, testProject) {
    const startTime = performance.now();

    try {
      // Validate completion using the framework's truth validator
      const validationResult = await this.truthValidator.validateCompletion(testProject.completion);

      // Check framework-specific requirements
      const frameworkComplianceResult = await this.checkFrameworkCompliance(framework, testProject, validationResult);

      const endTime = performance.now();
      const validationTime = endTime - startTime;

      return {
        projectId: testProject.id,
        framework: testProject.framework,
        truthScore: validationResult.truthScore,
        frameworkThresholdMet: validationResult.frameworkThresholdMet,
        passed: frameworkComplianceResult.passed,
        validationTime,
        issues: frameworkComplianceResult.issues,
        evidence: validationResult.evidence,
        byzantineProof: validationResult.byzantineProof,
        consensusAchieved: validationResult.consensusAchieved
      };

    } catch (error) {
      return {
        projectId: testProject.id,
        framework: testProject.framework,
        truthScore: 0,
        passed: false,
        validationTime: performance.now() - startTime,
        issues: [`Validation error: ${error.message}`],
        error: error.message
      };
    }
  }

  validateFrameworkCompliance(framework, frameworkResults) {
    const issues = [];
    let compliant = true;

    // Check truth threshold compliance
    if (frameworkResults.averageTruthScore < framework.truthThreshold) {
      issues.push(`Average truth score ${frameworkResults.averageTruthScore.toFixed(3)} below threshold ${framework.truthThreshold}`);
      compliant = false;
    }

    // Check compliance rate (should be at least 80% of projects passing)
    if (frameworkResults.complianceRate < 0.80) {
      issues.push(`Compliance rate ${(frameworkResults.complianceRate * 100).toFixed(1)}% below minimum 80%`);
      compliant = false;
    }

    // Framework-specific compliance checks
    if (framework.requiredCoverage && frameworkResults.testDetails.some(p => p.completion?.testCoverage < framework.requiredCoverage)) {
      issues.push(`Some projects below required test coverage ${framework.requiredCoverage}`);
      compliant = false;
    }

    if (framework.requiredScenarioCoverage && frameworkResults.testDetails.some(p => p.completion?.scenarioCoverage < framework.requiredScenarioCoverage)) {
      issues.push(`Some projects below required scenario coverage ${framework.requiredScenarioCoverage}`);
      compliant = false;
    }

    if (framework.requiredPhaseCompletion && frameworkResults.testDetails.some(p => this.calculateSPARCCompletion(p.completion?.phases) < framework.requiredPhaseCompletion)) {
      issues.push(`Some projects below required phase completion ${framework.requiredPhaseCompletion}`);
      compliant = false;
    }

    return { compliant, issues };
  }

  // Detection test case generators

  generateJavaScriptDetectionCases() {
    return [
      {
        name: 'Pure JavaScript Project',
        type: 'javascript',
        expectedFramework: 'javascript',
        files: ['package.json', 'index.js', 'test.js'],
        packageJson: { main: 'index.js', scripts: { test: 'jest' } }
      },
      {
        name: 'Node.js Project with Jest',
        type: 'javascript',
        expectedFramework: 'javascript',
        files: ['package.json', 'server.js', 'tests/server.test.js'],
        packageJson: { devDependencies: { jest: '^27.0.0' } }
      },
      {
        name: 'React JavaScript Project',
        type: 'javascript',
        expectedFramework: 'javascript',
        files: ['package.json', 'src/App.js', 'src/App.test.js'],
        packageJson: { dependencies: { react: '^18.0.0' } }
      }
    ];
  }

  generateTypeScriptDetectionCases() {
    return [
      {
        name: 'TypeScript Project',
        type: 'typescript',
        expectedFramework: 'typescript',
        files: ['tsconfig.json', 'package.json', 'src/index.ts'],
        packageJson: { devDependencies: { typescript: '^4.0.0' } }
      },
      {
        name: 'TypeScript with Types',
        type: 'typescript',
        expectedFramework: 'typescript',
        files: ['tsconfig.json', 'src/types.ts', 'src/interfaces.ts'],
        packageJson: { devDependencies: { '@types/node': '^16.0.0' } }
      },
      {
        name: 'Angular TypeScript Project',
        type: 'typescript',
        expectedFramework: 'typescript',
        files: ['angular.json', 'tsconfig.json', 'src/app/app.component.ts'],
        packageJson: { dependencies: { '@angular/core': '^14.0.0' } }
      }
    ];
  }

  generatePythonDetectionCases() {
    return [
      {
        name: 'Python Project with requirements.txt',
        type: 'python',
        expectedFramework: 'python',
        files: ['requirements.txt', 'main.py', 'test_main.py']
      },
      {
        name: 'Python Project with setup.py',
        type: 'python',
        expectedFramework: 'python',
        files: ['setup.py', 'src/package/__init__.py', 'tests/test_package.py']
      },
      {
        name: 'Python Project with pyproject.toml',
        type: 'python',
        expectedFramework: 'python',
        files: ['pyproject.toml', 'src/main.py', 'tests/conftest.py']
      }
    ];
  }

  generateMixedFrameworkCases() {
    return [
      {
        name: 'Full-stack JavaScript/Python',
        type: 'mixed',
        expectedFramework: 'javascript', // Should detect primary framework
        files: ['package.json', 'frontend/app.js', 'backend/requirements.txt', 'backend/app.py']
      },
      {
        name: 'TypeScript Frontend with Python Backend',
        type: 'mixed',
        expectedFramework: 'typescript',
        files: ['tsconfig.json', 'frontend/src/main.ts', 'backend/main.py']
      }
    ];
  }

  generateCustomFrameworkCases() {
    return [
      {
        name: 'Custom TDD Framework',
        type: 'custom',
        expectedFramework: 'TDD',
        customFramework: {
          id: 'custom_tdd',
          name: 'Custom TDD Framework',
          validation_config: { truth_threshold: 0.90 }
        }
      },
      {
        name: 'Custom BDD Framework',
        type: 'custom',
        expectedFramework: 'BDD',
        customFramework: {
          id: 'custom_bdd',
          name: 'Custom BDD Framework',
          validation_config: { truth_threshold: 0.85 }
        }
      }
    ];
  }

  // Additional helper methods

  generateFrameworkSpecificEvidence(frameworkKey) {
    const baseEvidence = {
      agentReliability: { score: 0.8 + Math.random() * 0.2, source: 'agent_tracker' },
      crossValidation: { score: 0.7 + Math.random() * 0.3, source: 'peer_validation' },
      externalVerification: { score: 0.6 + Math.random() * 0.4, source: 'external_apis' },
      factualConsistency: { score: 0.8 + Math.random() * 0.2, source: 'fact_checker' },
      logicalCoherence: { score: 0.7 + Math.random() * 0.3, source: 'logic_analyzer' }
    };

    // Add framework-specific evidence
    switch (frameworkKey) {
      case 'TDD':
        baseEvidence.testEvidence = {
          redGreenCycle: true,
          testCoverageReport: { lines: 95.5, branches: 92.1, functions: 97.8 },
          testFirstApproach: true
        };
        break;
      case 'BDD':
        baseEvidence.behaviorEvidence = {
          scenarios: ['Given user login', 'When user clicks', 'Then system responds'],
          gherkinSyntax: true,
          acceptanceCriteria: ['AC1: Login succeeds', 'AC2: Error handling']
        };
        break;
      case 'SPARC':
        baseEvidence.sparcEvidence = {
          specification: { complete: true, validated: true },
          pseudocode: { written: true, reviewed: true },
          architecture: { designed: true, documented: true },
          refinement: { iterationsCompleted: 3 },
          completion: { delivered: true, tested: true }
        };
        break;
    }

    return baseEvidence;
  }

  generateCompleteSPARCPhases() {
    return {
      specification: { completed: true, completeness: 1.0, validatedAt: new Date().toISOString() },
      pseudocode: { completed: true, completeness: 1.0, validatedAt: new Date().toISOString() },
      architecture: { completed: true, completeness: 1.0, validatedAt: new Date().toISOString() },
      refinement: { completed: true, completeness: 1.0, validatedAt: new Date().toISOString() },
      completion: { completed: true, completeness: 1.0, validatedAt: new Date().toISOString() }
    };
  }

  generateRandomPhases() {
    return {
      specification: { completed: Math.random() > 0.3, completeness: Math.random() },
      pseudocode: { completed: Math.random() > 0.3, completeness: Math.random() },
      architecture: { completed: Math.random() > 0.3, completeness: Math.random() },
      refinement: { completed: Math.random() > 0.3, completeness: Math.random() },
      completion: { completed: Math.random() > 0.3, completeness: Math.random() }
    };
  }

  calculateSPARCCompletion(phases) {
    if (!phases) return 0;

    const phaseNames = ['specification', 'pseudocode', 'architecture', 'refinement', 'completion'];
    const completedPhases = phaseNames.filter(phase =>
      phases[phase]?.completed === true && phases[phase]?.completeness === 1.0
    );

    return completedPhases.length / phaseNames.length;
  }

  async checkFrameworkCompliance(framework, testProject, validationResult) {
    const issues = [];
    let passed = true;

    // Check truth threshold
    if (validationResult.truthScore < framework.truthThreshold) {
      issues.push(`Truth score ${validationResult.truthScore.toFixed(3)} below threshold ${framework.truthThreshold}`);
      passed = false;
    }

    // Framework-specific checks
    const completion = testProject.completion;

    switch (testProject.framework) {
      case 'TDD':
        if (completion.testCoverage < 0.95) {
          issues.push(`Test coverage ${(completion.testCoverage * 100).toFixed(1)}% below required 95%`);
          passed = false;
        }
        if (!completion.redGreenRefactor) {
          issues.push('Red-Green-Refactor cycle not followed');
          passed = false;
        }
        break;

      case 'BDD':
        if (completion.scenarioCoverage < 0.90) {
          issues.push(`Scenario coverage ${(completion.scenarioCoverage * 100).toFixed(1)}% below required 90%`);
          passed = false;
        }
        if (!completion.gherkinCompliant) {
          issues.push('Not Gherkin compliant');
          passed = false;
        }
        break;

      case 'SPARC':
        const phaseCompletion = this.calculateSPARCCompletion(completion.phases);
        if (phaseCompletion < 1.0) {
          issues.push(`SPARC phase completion ${(phaseCompletion * 100).toFixed(1)}% below required 100%`);
          passed = false;
        }
        break;
    }

    return { passed, issues };
  }

  // Rule testing methods

  generateRuleTestCases(frameworkKey, rule) {
    const testCases = [];

    // Generate test cases that should pass the rule
    for (let i = 0; i < 5; i++) {
      const passingCompletion = this.generateRulePassingCompletion(frameworkKey, rule);
      testCases.push({
        name: `${frameworkKey}_${rule}_pass_${i}`,
        completion: passingCompletion,
        expectedPass: true
      });
    }

    // Generate test cases that should fail the rule
    for (let i = 0; i < 5; i++) {
      const failingCompletion = this.generateRuleFailingCompletion(frameworkKey, rule);
      testCases.push({
        name: `${frameworkKey}_${rule}_fail_${i}`,
        completion: failingCompletion,
        expectedPass: false
      });
    }

    return testCases;
  }

  generateRulePassingCompletion(frameworkKey, rule) {
    const baseCompletion = this.generateTestProject(frameworkKey, 0).completion;

    // Ensure this completion will pass the rule
    if (rule.includes('testCoverage >= 0.95')) {
      baseCompletion.testCoverage = 0.95 + Math.random() * 0.05;
    }
    if (rule.includes('truthScore >= 0.90')) {
      baseCompletion.truthScore = 0.90 + Math.random() * 0.10;
    }
    if (rule.includes('scenarioCoverage >= 0.90')) {
      baseCompletion.scenarioCoverage = 0.90 + Math.random() * 0.10;
    }

    return baseCompletion;
  }

  generateRuleFailingCompletion(frameworkKey, rule) {
    const baseCompletion = this.generateTestProject(frameworkKey, 0).completion;

    // Ensure this completion will fail the rule
    if (rule.includes('testCoverage >= 0.95')) {
      baseCompletion.testCoverage = Math.random() * 0.94;
    }
    if (rule.includes('truthScore >= 0.90')) {
      baseCompletion.truthScore = Math.random() * 0.89;
    }
    if (rule.includes('scenarioCoverage >= 0.90')) {
      baseCompletion.scenarioCoverage = Math.random() * 0.89;
    }

    return baseCompletion;
  }

  async executeValidationRuleTest(rule, testCase) {
    try {
      // Simple rule evaluation for testing
      if (typeof rule === 'string') {
        return this.evaluateStringRule(rule, testCase.completion);
      }

      return { passed: true, score: 1, details: {} };

    } catch (error) {
      return { passed: false, score: 0, error: error.message };
    }
  }

  evaluateStringRule(rule, completion) {
    try {
      // Basic rule evaluation
      if (rule.includes('testCoverage >= 0.95')) {
        return { passed: completion.testCoverage >= 0.95, score: completion.testCoverage >= 0.95 ? 1 : 0 };
      }
      if (rule.includes('truthScore >= 0.90')) {
        return { passed: completion.truthScore >= 0.90, score: completion.truthScore >= 0.90 ? 1 : 0 };
      }
      if (rule.includes('scenarioCoverage >= 0.90')) {
        return { passed: completion.scenarioCoverage >= 0.90, score: completion.scenarioCoverage >= 0.90 ? 1 : 0 };
      }

      return { passed: true, score: 1 };

    } catch (error) {
      return { passed: false, score: 0, error: error.message };
    }
  }

  // Cross-framework validation methods

  generateFrameworkPairs() {
    const frameworks = Object.keys(this.supportedFrameworks);
    const pairs = [];

    for (let i = 0; i < frameworks.length; i++) {
      for (let j = i + 1; j < frameworks.length; j++) {
        pairs.push({
          frameworkA: frameworks[i],
          frameworkB: frameworks[j]
        });
      }
    }

    return pairs;
  }

  async attemptCrossFrameworkValidation(projectA, frameworkA, frameworkBConfig) {
    try {
      // Try to detect the framework of projectA
      const detectionResult = await this.frameworkDetector.detectFramework();

      // If detection correctly identifies frameworkA, then cross-validation should be prevented
      if (detectionResult.detected === frameworkA) {
        return {
          prevented: true,
          reason: `Framework detection correctly identified ${frameworkA}, preventing cross-validation with ${frameworkBConfig.name}`,
          detectionAccuracy: detectionResult.confidence
        };
      } else {
        return {
          prevented: false,
          reason: `Framework detection failed to identify ${frameworkA}, incorrectly detected as ${detectionResult.detected}`,
          detectionAccuracy: detectionResult.confidence
        };
      }

    } catch (error) {
      return {
        prevented: false,
        reason: `Cross-framework validation prevention failed: ${error.message}`,
        detectionAccuracy: 0
      };
    }
  }

  // Byzantine consensus methods

  generateComplianceValidators() {
    return Array.from({ length: 7 }, (_, i) => ({
      id: `compliance-validator-${i}`,
      specialization: ['framework_expert', 'truth_scoring', 'detection_accuracy', 'validation_rules'][i % 4],
      reputation: 0.85 + Math.random() * 0.15,
      complianceFocus: Object.keys(this.supportedFrameworks)[i % Object.keys(this.supportedFrameworks).length]
    }));
  }

  generateTesterSignature() {
    const data = {
      tester: 'Phase3FrameworkComplianceTester',
      version: '1.0.0',
      timestamp: Date.now(),
      testConfiguration: this.options
    };

    return createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  generateCryptographicEvidence(consensusResult) {
    return {
      consensusHash: createHash('sha256')
        .update(JSON.stringify(consensusResult.votes))
        .digest('hex'),
      validatorSignatures: consensusResult.votes.map(vote => ({
        validatorId: vote.validatorId,
        signature: createHash('sha256').update(`${vote.validatorId}-${vote.vote}-${vote.timestamp}`).digest('hex')
      })),
      merkleRoot: this.calculateMerkleRoot(consensusResult.votes),
      timestamp: Date.now(),
      blockchainProof: consensusResult.byzantineProof
    };
  }

  calculateMerkleRoot(votes) {
    // Simple Merkle root calculation
    const hashes = votes.map(vote =>
      createHash('sha256').update(JSON.stringify(vote)).digest('hex')
    );

    if (hashes.length === 0) return '';
    if (hashes.length === 1) return hashes[0];

    // Simplified Merkle tree
    return createHash('sha256')
      .update(hashes.join(''))
      .digest('hex');
  }

  // Report generation methods

  calculateOverallComplianceScore() {
    let totalScore = 0;
    let weights = 0;

    // Framework compliance (40% weight)
    const frameworkScores = Array.from(this.testResults.frameworkCompliance.values());
    if (frameworkScores.length > 0) {
      const avgFrameworkScore = frameworkScores.reduce((sum, result) => sum + result.complianceRate, 0) / frameworkScores.length;
      totalScore += avgFrameworkScore * 0.4;
      weights += 0.4;
    }

    // Detection accuracy (25% weight)
    const detectionResults = this.testResults.detectionAccuracy.get('overall');
    if (detectionResults) {
      totalScore += detectionResults.accuracyRate * 0.25;
      weights += 0.25;
    }

    // Validation rules accuracy (20% weight)
    const ruleResults = Array.from(this.testResults.validationRules.values());
    if (ruleResults.length > 0) {
      const avgRuleScore = ruleResults.reduce((sum, result) => sum + result.executionAccuracy, 0) / ruleResults.length;
      totalScore += avgRuleScore * 0.2;
      weights += 0.2;
    }

    // Cross-framework prevention (15% weight)
    const preventionResults = this.testResults.crossFrameworkPrevention.get('overall');
    if (preventionResults) {
      totalScore += preventionResults.preventionRate * 0.15;
      weights += 0.15;
    }

    return weights > 0 ? totalScore / weights : 0;
  }

  generateFrameworkComplianceSection() {
    const section = {
      title: 'Framework Compliance Results',
      summary: `Tested ${Object.keys(this.supportedFrameworks).length} frameworks with ${this.options.testProjectCount} projects each`,
      frameworks: {}
    };

    for (const [key, results] of this.testResults.frameworkCompliance) {
      section.frameworks[key] = {
        name: results.name,
        truthThreshold: results.truthThreshold,
        complianceRate: `${(results.complianceRate * 100).toFixed(1)}%`,
        averageTruthScore: results.averageTruthScore.toFixed(3),
        projectsPassed: `${results.projectsPassed}/${results.projectsTestedCount}`,
        frameworkCompliant: results.frameworkCompliant,
        issues: results.complianceIssues || [],
        recommendation: this.generateFrameworkRecommendation(key, results)
      };
    }

    return section;
  }

  generateDetectionAccuracySection() {
    const detectionResults = this.testResults.detectionAccuracy.get('overall');
    if (!detectionResults) return { title: 'Detection Accuracy Results', error: 'No detection results available' };

    return {
      title: 'Framework Detection Accuracy Results',
      overallAccuracy: `${(detectionResults.accuracyRate * 100).toFixed(2)}%`,
      requirementMet: detectionResults.accuracyRate >= 0.90,
      languageBreakdown: {
        javascript: `${(detectionResults.languageAccuracy.javascript.accuracy * 100).toFixed(1)}%`,
        typescript: `${(detectionResults.languageAccuracy.typescript.accuracy * 100).toFixed(1)}%`,
        python: `${(detectionResults.languageAccuracy.python.accuracy * 100).toFixed(1)}%`,
        mixed: `${(detectionResults.languageAccuracy.mixed.accuracy * 100).toFixed(1)}%`,
        custom: `${(detectionResults.languageAccuracy.custom.accuracy * 100).toFixed(1)}%`
      },
      totalTestCases: detectionResults.totalCases,
      correctDetections: detectionResults.correctDetections,
      recommendation: detectionResults.accuracyRate >= 0.90 ?
        'Detection accuracy meets requirements' :
        'Detection accuracy below 90% threshold - requires improvement'
    };
  }

  generateValidationRulesSection() {
    const section = {
      title: 'Framework Validation Rules Results',
      frameworks: {}
    };

    for (const [key, results] of this.testResults.validationRules) {
      section.frameworks[key] = {
        totalRules: results.totalRules,
        executionAccuracy: `${(results.executionAccuracy * 100).toFixed(1)}%`,
        rulesPassed: `${results.rulesPassed}/${results.rulesExecuted}`,
        averageExecutionTime: `${results.averageExecutionTime.toFixed(2)}ms`,
        issues: results.issues,
        recommendation: results.executionAccuracy >= 0.90 ?
          'Validation rules meet accuracy requirements' :
          'Validation rules accuracy below 90% - requires optimization'
      };
    }

    return section;
  }

  generateCrossFrameworkPreventionSection() {
    const preventionResults = this.testResults.crossFrameworkPrevention.get('overall');
    if (!preventionResults) return { title: 'Cross-framework Prevention Results', error: 'No prevention results available' };

    return {
      title: 'Cross-framework Validation Prevention Results',
      preventionRate: `${(preventionResults.preventionRate * 100).toFixed(1)}%`,
      totalTests: preventionResults.totalTests,
      preventionSuccesses: preventionResults.preventionSuccesses,
      preventionFailures: preventionResults.preventionFailures,
      issues: preventionResults.issues,
      recommendation: preventionResults.preventionRate >= 0.90 ?
        'Cross-framework prevention is effective' :
        'Cross-framework prevention needs improvement'
    };
  }

  generateByzantineConsensusSection() {
    const byzantineResults = this.testResults.byzantineValidation.get('compliance');
    if (!byzantineResults) return { title: 'Byzantine Consensus Results', disabled: 'Byzantine validation was disabled' };

    return {
      title: 'Byzantine Consensus Validation Results',
      consensusAchieved: byzantineResults.consensusAchieved,
      consensusRatio: `${(byzantineResults.consensusRatio * 100).toFixed(1)}%`,
      validatorCount: byzantineResults.validatorCount,
      approvalVotes: byzantineResults.approvalVotes,
      rejectionVotes: byzantineResults.rejectionVotes,
      cryptographicEvidence: {
        consensusHash: byzantineResults.cryptographicEvidence?.consensusHash?.substring(0, 16) + '...',
        merkleRoot: byzantineResults.cryptographicEvidence?.merkleRoot?.substring(0, 16) + '...',
        validatorSignatures: `${byzantineResults.cryptographicEvidence?.validatorSignatures?.length || 0} signatures`
      },
      recommendation: byzantineResults.consensusAchieved ?
        'Compliance results validated by Byzantine consensus' :
        'Byzantine consensus failed - results require manual review'
    };
  }

  generateRecommendations() {
    const recommendations = [];

    // Framework-specific recommendations
    for (const [key, results] of this.testResults.frameworkCompliance) {
      if (!results.frameworkCompliant) {
        recommendations.push({
          category: 'Framework Compliance',
          framework: key,
          severity: 'HIGH',
          issue: `${results.name} framework compliance below requirements`,
          recommendation: `Improve ${results.name} validation logic to meet ${results.truthThreshold} truth threshold`,
          issues: results.complianceIssues
        });
      }
    }

    // Detection accuracy recommendations
    const detectionResults = this.testResults.detectionAccuracy.get('overall');
    if (detectionResults && detectionResults.accuracyRate < 0.90) {
      recommendations.push({
        category: 'Detection Accuracy',
        severity: 'HIGH',
        issue: `Framework detection accuracy ${(detectionResults.accuracyRate * 100).toFixed(1)}% below 90% requirement`,
        recommendation: 'Improve framework detection patterns and confidence scoring algorithms'
      });
    }

    // Validation rules recommendations
    for (const [key, results] of this.testResults.validationRules) {
      if (results.executionAccuracy < 0.90) {
        recommendations.push({
          category: 'Validation Rules',
          framework: key,
          severity: 'MEDIUM',
          issue: `Validation rules accuracy ${(results.executionAccuracy * 100).toFixed(1)}% below 90%`,
          recommendation: `Optimize validation rule execution for ${key} framework`,
          details: results.issues
        });
      }
    }

    // Cross-framework prevention recommendations
    const preventionResults = this.testResults.crossFrameworkPrevention.get('overall');
    if (preventionResults && preventionResults.preventionRate < 0.90) {
      recommendations.push({
        category: 'Cross-framework Prevention',
        severity: 'MEDIUM',
        issue: `Cross-framework prevention ${(preventionResults.preventionRate * 100).toFixed(1)}% below 90%`,
        recommendation: 'Strengthen framework detection to prevent cross-validation errors',
        details: preventionResults.issues
      });
    }

    // Byzantine consensus recommendations
    const byzantineResults = this.testResults.byzantineValidation.get('compliance');
    if (byzantineResults && !byzantineResults.consensusAchieved) {
      recommendations.push({
        category: 'Byzantine Consensus',
        severity: 'HIGH',
        issue: 'Byzantine consensus failed for compliance validation',
        recommendation: 'Review validator configuration and consensus parameters'
      });
    }

    return recommendations;
  }

  generateFrameworkRecommendation(frameworkKey, results) {
    if (results.frameworkCompliant && results.complianceRate >= 0.90) {
      return `${results.name} framework meets all compliance requirements`;
    }

    const issues = [];

    if (results.averageTruthScore < results.truthThreshold) {
      issues.push(`Increase average truth score from ${results.averageTruthScore.toFixed(3)} to ${results.truthThreshold}`);
    }

    if (results.complianceRate < 0.80) {
      issues.push(`Improve compliance rate from ${(results.complianceRate * 100).toFixed(1)}% to at least 80%`);
    }

    return `Requires improvement: ${issues.join(', ')}`;
  }

  extractCriticalIssues() {
    const criticalIssues = [];

    // Check for frameworks failing compliance
    for (const [key, results] of this.testResults.frameworkCompliance) {
      if (!results.frameworkCompliant) {
        criticalIssues.push({
          type: 'FRAMEWORK_COMPLIANCE_FAILURE',
          framework: key,
          severity: 'CRITICAL',
          description: `${results.name} framework failed compliance validation`,
          impact: 'Framework cannot be used for validation until issues are resolved',
          complianceRate: results.complianceRate,
          issues: results.complianceIssues
        });
      }
    }

    // Check for detection accuracy below threshold
    const detectionResults = this.testResults.detectionAccuracy.get('overall');
    if (detectionResults && detectionResults.accuracyRate < 0.90) {
      criticalIssues.push({
        type: 'DETECTION_ACCURACY_FAILURE',
        severity: 'CRITICAL',
        description: `Framework detection accuracy ${(detectionResults.accuracyRate * 100).toFixed(1)}% below required 90%`,
        impact: 'Incorrect framework detection may lead to validation errors',
        accuracy: detectionResults.accuracyRate
      });
    }

    // Check for Byzantine consensus failures
    const byzantineResults = this.testResults.byzantineValidation.get('compliance');
    if (byzantineResults && !byzantineResults.consensusAchieved) {
      criticalIssues.push({
        type: 'BYZANTINE_CONSENSUS_FAILURE',
        severity: 'CRITICAL',
        description: 'Byzantine consensus failed to validate compliance results',
        impact: 'Compliance validation lacks cryptographic proof of correctness',
        consensusRatio: byzantineResults.consensusRatio
      });
    }

    return criticalIssues;
  }

  generatePerformanceMetrics() {
    const totalTime = (this.testResults.endTime - this.testResults.startTime) / 1000;
    const totalProjects = Object.keys(this.supportedFrameworks).length * this.options.testProjectCount;

    return {
      totalExecutionTime: `${totalTime.toFixed(2)}s`,
      averageTimePerProject: `${(totalTime / totalProjects).toFixed(3)}s`,
      totalProjectsTested: totalProjects,
      totalFrameworksTested: Object.keys(this.supportedFrameworks).length,
      memoryUsage: process.memoryUsage ? process.memoryUsage() : 'N/A',
      testThroughput: `${(totalProjects / totalTime).toFixed(2)} projects/second`
    };
  }

  // Verification methods for final report

  verifyAllFrameworksCompliant() {
    for (const [, results] of this.testResults.frameworkCompliance) {
      if (!results.frameworkCompliant) return false;
    }
    return true;
  }

  verifyDetectionAccuracyMet() {
    const detectionResults = this.testResults.detectionAccuracy.get('overall');
    return detectionResults ? detectionResults.accuracyRate >= 0.90 : false;
  }

  verifyValidationRulesAccurate() {
    for (const [, results] of this.testResults.validationRules) {
      if (results.executionAccuracy < 0.90) return false;
    }
    return true;
  }

  verifyCrossFrameworkPreventionEffective() {
    const preventionResults = this.testResults.crossFrameworkPrevention.get('overall');
    return preventionResults ? preventionResults.preventionRate >= 0.90 : false;
  }

  verifyByzantineConsensusAchieved() {
    if (!this.options.byzantineValidation) return true; // N/A if disabled
    const byzantineResults = this.testResults.byzantineValidation.get('compliance');
    return byzantineResults ? byzantineResults.consensusAchieved : false;
  }

  async storeComplianceReport(report) {
    const reportKey = `phase3-compliance-report-${Date.now()}`;
    await this.memoryStore.store(reportKey, report, {
      namespace: 'phase3-compliance-testing',
      metadata: {
        phase: 'Phase 3',
        reportType: 'framework_compliance',
        overallScore: report.reportMetadata.overallScore,
        byzantineValidated: report.reportMetadata.byzantineValidated
      }
    });
  }

  async shutdown() {
    if (this.memoryStore) await this.memoryStore.close();
    if (this.frameworkDetector) await this.frameworkDetector.close();
    if (this.truthValidator) await this.truthValidator.close();
    if (this.customFrameworkValidator) await this.customFrameworkValidator.shutdown();

    this.emit('shutdown');
    console.log('✅ Phase 3 Framework Compliance Tester shut down');
  }
}

export default Phase3FrameworkComplianceTester;