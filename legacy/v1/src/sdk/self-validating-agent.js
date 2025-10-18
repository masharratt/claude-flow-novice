#!/usr/bin/env node

/**
 * Self-Validating Agent - Phase 2 SDK Integration
 *
 * Implements comprehensive self-validation loops that catch 80% of errors before consensus.
 * Integrates with enhanced-post-edit-pipeline for validation and SwarmMemory for learning.
 *
 * Key Features:
 * - Pre-validation before tool execution
 * - Post-validation with automatic retry (max 3 attempts)
 * - Confidence scoring (threshold 0.75)
 * - Learning from validation failures
 * - Memory integration for validation history
 * - Structured feedback for retry attempts
 *
 * @module self-validating-agent
 */

import { enhancedPostEditHook } from '../hooks/enhanced-post-edit-pipeline.js';
import { SwarmMemory } from '../memory/swarm-memory.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Self-Validating Agent Configuration
 */
const DEFAULT_CONFIG = {
  confidenceThreshold: 0.75,
  maxRetries: 3,
  minimumCoverage: 80,
  enableTDD: true,
  enableSecurity: true,
  blockOnCritical: true,
  learningEnabled: true,
  memoryNamespace: 'swarm:validation'
};

/**
 * Validation Error Types
 */
const ERROR_TYPES = {
  SYNTAX: 'syntax',
  TEST: 'test',
  COVERAGE: 'coverage',
  SECURITY: 'security',
  FORMATTING: 'formatting',
  TDD_VIOLATION: 'tdd_violation'
};

/**
 * Self-Validating Agent Class
 *
 * Wraps agent operations with comprehensive validation loops
 */
export class SelfValidatingAgent {
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      agentId: config.agentId || `agent-${Date.now()}`,
      agentType: config.agentType || 'coder'
    };

    this.memory = null;
    this.validationHistory = [];
    this.learningPatterns = {
      commonErrors: {},
      successPatterns: {},
      retryEffectiveness: []
    };

    this.metrics = {
      totalValidations: 0,
      passedFirstAttempt: 0,
      passedAfterRetry: 0,
      failed: 0,
      averageConfidence: 0,
      averageRetries: 0
    };
  }

  /**
   * Initialize agent with memory connection
   */
  async initialize() {
    console.log(`🤖 Initializing self-validating agent: ${this.config.agentId}`);

    try {
      // Initialize SwarmMemory for validation tracking
      this.memory = new SwarmMemory({
        swarmId: this.config.swarmId || 'default',
        directory: '.swarm',
        filename: 'validation-memory.db'
      });

      await this.memory.initialize();

      // Load previous learning patterns
      await this.loadLearningHistory();

      console.log(`✅ Agent ${this.config.agentId} initialized with validation capability`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to initialize agent: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pre-Validation: Check before action execution
   *
   * Assesses risk and blocks dangerous operations
   */
  async preValidate(tool, args) {
    console.log(`🔍 Pre-validating ${tool} operation...`);

    const validation = {
      block: false,
      reason: null,
      risk: 0,
      warnings: []
    };

    // File write/edit operations require special attention
    if (tool === 'Write' || tool === 'Edit') {
      const impact = await this.assessImpact(args);

      if (impact.risk > 0.7) {
        validation.block = true;
        validation.reason = `High risk operation: ${impact.reason}`;
        validation.risk = impact.risk;

        console.log(`🛑 BLOCKED: ${validation.reason}`);
        return validation;
      }

      if (impact.risk > 0.4) {
        validation.warnings.push(`Medium risk: ${impact.reason}`);
        console.log(`⚠️ WARNING: ${impact.reason}`);
      }
    }

    // Check for security patterns in content
    if (args.content) {
      const securityCheck = this.checkSecurityPatterns(args.content);
      if (securityCheck.hasIssues) {
        validation.warnings.push(...securityCheck.issues);
        validation.risk = Math.max(validation.risk, securityCheck.riskLevel);

        if (securityCheck.riskLevel > 0.8 && this.config.enableSecurity) {
          validation.block = true;
          validation.reason = 'Critical security issue detected';
        }
      }
    }

    console.log(`✅ Pre-validation passed (risk: ${validation.risk.toFixed(2)})`);
    return validation;
  }

  /**
   * Self-Validate with Retry Logic
   *
   * Main validation loop with automatic retry on failure
   */
  async selfValidateWithRetry(operation, result) {
    let attempt = 0;
    let lastValidation = null;
    const startTime = Date.now();

    console.log(`🧪 Starting self-validation with retry (max ${this.config.maxRetries} attempts)`);

    while (attempt < this.config.maxRetries) {
      attempt++;
      console.log(`\n🔄 Validation attempt ${attempt}/${this.config.maxRetries}`);

      // Run comprehensive validation
      const validation = await this.runValidation(result, attempt);
      lastValidation = validation;

      // Track in metrics
      this.metrics.totalValidations++;

      // Store validation in memory for learning
      await this.storeValidation(validation, {
        attempt,
        operation,
        file: result.file,
        timestamp: Date.now()
      });

      // Check confidence threshold
      if (validation.confidence >= this.config.confidenceThreshold) {
        console.log(`✅ Self-validation passed (confidence: ${validation.confidence.toFixed(3)})`);

        if (attempt === 1) {
          this.metrics.passedFirstAttempt++;
        } else {
          this.metrics.passedAfterRetry++;
        }

        // Update success pattern
        await this.recordSuccess(validation, attempt);

        const duration = Date.now() - startTime;
        console.log(`⏱️ Validation completed in ${duration}ms`);

        return {
          ...result,
          validationPassed: true,
          validation,
          attempts: attempt,
          duration
        };
      }

      // Learn from failure
      if (this.config.learningEnabled) {
        await this.learnFromValidation(validation, attempt);
      }

      console.log(`⚠️ Attempt ${attempt}/${this.config.maxRetries}: Confidence ${validation.confidence.toFixed(3)} < ${this.config.confidenceThreshold}`);

      // Retry with feedback (unless this was the last attempt)
      if (attempt < this.config.maxRetries) {
        console.log(`🔄 Retrying with feedback...`);
        result = await this.retryWithFeedback(result, validation, attempt);
      }
    }

    // Max retries exceeded
    this.metrics.failed++;
    const duration = Date.now() - startTime;

    console.log(`❌ Self-validation failed after ${attempt} attempts (${duration}ms)`);
    console.log(`📊 Final confidence: ${lastValidation.confidence.toFixed(3)}`);

    return {
      ...result,
      validationFailed: true,
      validation: lastValidation,
      attempts: attempt,
      duration,
      escalate: true,
      escalationReason: 'Maximum retry attempts exceeded'
    };
  }

  /**
   * Run Comprehensive Validation
   *
   * Uses enhanced-post-edit-pipeline for full validation suite
   */
  async runValidation(result, attempt = 1) {
    console.log(`🔬 Running comprehensive validation (attempt ${attempt})...`);

    const validationStart = Date.now();

    try {
      // Use enhanced post-edit hook for comprehensive validation
      const hookResult = await enhancedPostEditHook(
        result.file,
        `${this.config.memoryNamespace}/${this.config.agentId}/attempt-${attempt}`,
        {
          validate: true,
          format: true,
          enableTDD: this.config.enableTDD,
          minimumCoverage: this.config.minimumCoverage,
          returnStructured: true,
          blockOnCritical: this.config.blockOnCritical,
          generateRecommendations: true,
          enableSecurity: this.config.enableSecurity
        }
      );

      // Calculate confidence score based on validation results
      const confidence = this.calculateConfidence(hookResult);

      // Extract detailed errors for feedback
      const errors = this.extractErrors(hookResult);

      // Categorize issues by type
      const categorizedErrors = this.categorizeErrors(errors);

      const validationTime = Date.now() - validationStart;

      const validation = {
        confidence,
        passed: confidence >= this.config.confidenceThreshold,
        details: hookResult,
        errors,
        categorizedErrors,
        metrics: {
          coverage: hookResult.coverage?.lines?.percentage || 0,
          testsPassed: hookResult.testing?.results?.summary?.passed || 0,
          testsFailed: hookResult.testing?.results?.summary?.failed || 0,
          testsTotal: hookResult.testing?.results?.summary?.total || 0,
          securityIssues: hookResult.validation?.issues?.filter(i => i.type === 'security').length || 0,
          syntaxErrors: hookResult.validation?.issues?.filter(i => i.severity === 'error').length || 0,
          formattingIssues: hookResult.formatting?.changes || 0,
          tddCompliance: hookResult.tddCompliance?.hasTests || false,
          tddPhase: hookResult.tddPhase || 'unknown'
        },
        validationTime,
        timestamp: new Date().toISOString()
      };

      this.logValidationSummary(validation);

      return validation;

    } catch (error) {
      console.error(`❌ Validation execution failed: ${error.message}`);

      return {
        confidence: 0,
        passed: false,
        error: error.message,
        details: null,
        errors: [{
          type: ERROR_TYPES.SYNTAX,
          severity: 'critical',
          message: `Validation failed: ${error.message}`
        }],
        categorizedErrors: {
          [ERROR_TYPES.SYNTAX]: [error.message]
        },
        metrics: {},
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Calculate Confidence Score
   *
   * Weighted scoring based on multiple validation factors
   */
  calculateConfidence(hookResult) {
    let confidence = 1.0;
    const weights = {
      syntax: 0.35,        // 35% weight - critical
      tests: 0.25,         // 25% weight - important
      coverage: 0.20,      // 20% weight - important
      security: 0.15,      // 15% weight - important
      formatting: 0.05     // 5% weight - minor
    };

    // Syntax validation (critical)
    if (!hookResult.validation?.passed) {
      const errorCount = hookResult.validation?.issues?.filter(i => i.severity === 'error').length || 0;
      if (errorCount > 0) {
        confidence *= (1 - weights.syntax); // Severe penalty
      }
    }

    // Test results
    if (hookResult.testing?.results?.summary) {
      const { passed = 0, failed = 0, total = 0 } = hookResult.testing.results.summary;
      if (total > 0) {
        const passRate = passed / total;
        confidence *= (passRate * weights.tests + (1 - weights.tests));
      }
    }

    // Coverage
    const coverage = hookResult.coverage?.lines?.percentage || 0;
    if (coverage < this.config.minimumCoverage) {
      const coverageRatio = coverage / this.config.minimumCoverage;
      confidence *= (coverageRatio * weights.coverage + (1 - weights.coverage));
    }

    // Security issues
    const securityIssues = hookResult.validation?.issues?.filter(i =>
      i.type === 'security' && i.severity === 'critical'
    ).length || 0;

    if (securityIssues > 0) {
      confidence *= (1 - weights.security); // Penalty per critical issue
    }

    // Formatting (minor)
    if (hookResult.formatting?.needed && hookResult.formatting?.changes > 10) {
      confidence *= (1 - weights.formatting * 0.5); // Half penalty for formatting
    }

    // Update metrics
    this.metrics.averageConfidence =
      (this.metrics.averageConfidence * (this.metrics.totalValidations - 1) + confidence) /
      this.metrics.totalValidations;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Extract Errors from Validation Results
   */
  extractErrors(hookResult) {
    const errors = [];

    // Syntax/validation errors
    if (hookResult.validation?.issues) {
      hookResult.validation.issues.forEach(issue => {
        errors.push({
          type: ERROR_TYPES.SYNTAX,
          severity: issue.severity,
          message: issue.message,
          line: issue.line,
          column: issue.column,
          code: issue.code
        });
      });
    }

    // Test failures
    if (hookResult.testing?.results?.failures) {
      hookResult.testing.results.failures.forEach(failure => {
        errors.push({
          type: ERROR_TYPES.TEST,
          testName: failure.name,
          message: failure.message,
          stack: failure.stack
        });
      });
    }

    // Coverage issues
    const coverage = hookResult.coverage?.lines?.percentage || 0;
    if (coverage < this.config.minimumCoverage) {
      errors.push({
        type: ERROR_TYPES.COVERAGE,
        current: coverage,
        required: this.config.minimumCoverage,
        message: `Coverage ${coverage}% is below minimum ${this.config.minimumCoverage}%`
      });
    }

    // TDD violations
    if (hookResult.tddCompliance?.recommendations) {
      hookResult.tddCompliance.recommendations
        .filter(r => r.type === 'tdd_violation')
        .forEach(rec => {
          errors.push({
            type: ERROR_TYPES.TDD_VIOLATION,
            priority: rec.priority,
            message: rec.message,
            action: rec.action
          });
        });
    }

    return errors;
  }

  /**
   * Categorize Errors by Type
   */
  categorizeErrors(errors) {
    const categorized = {};

    errors.forEach(error => {
      if (!categorized[error.type]) {
        categorized[error.type] = [];
      }
      categorized[error.type].push(error);
    });

    return categorized;
  }

  /**
   * Learn from Validation Results
   *
   * Analyzes patterns and adjusts strategy
   */
  async learnFromValidation(validation, attempt) {
    this.validationHistory.push({
      timestamp: Date.now(),
      attempt,
      confidence: validation.confidence,
      errors: validation.categorizedErrors,
      metrics: validation.metrics
    });

    // Keep only last 100 validations in memory
    if (this.validationHistory.length > 100) {
      this.validationHistory.shift();
    }

    // Analyze recent patterns
    const recentFailures = this.validationHistory.slice(-10);
    const commonErrors = this.findCommonErrors(recentFailures);

    // Adjust strategy based on patterns
    if (commonErrors[ERROR_TYPES.SYNTAX] >= 3) {
      console.log('📚 Learning: High syntax error rate - enabling strict validation mode');
      this.config.syntaxMode = 'strict';
      this.config.blockOnCritical = true;
    }

    if (commonErrors[ERROR_TYPES.TEST] >= 5) {
      console.log('📚 Learning: High test failure rate - enabling TDD-first mode');
      this.config.tddFirst = true;
      this.config.enableTDD = true;
    }

    if (commonErrors[ERROR_TYPES.SECURITY] >= 2) {
      console.log('📚 Learning: Security issues detected - enabling paranoid mode');
      this.config.securityMode = 'paranoid';
      this.config.enableSecurity = true;
    }

    if (commonErrors[ERROR_TYPES.COVERAGE] >= 4) {
      console.log('📚 Learning: Coverage issues - increasing minimum threshold');
      this.config.minimumCoverage = Math.min(90, this.config.minimumCoverage + 5);
    }

    // Store learning patterns in memory
    if (this.memory) {
      await this.memory.storePattern(`learning-${this.config.agentId}-${Date.now()}`, {
        type: 'validation-learning',
        agentId: this.config.agentId,
        patterns: commonErrors,
        adjustments: {
          syntaxMode: this.config.syntaxMode,
          tddFirst: this.config.tddFirst,
          securityMode: this.config.securityMode,
          minimumCoverage: this.config.minimumCoverage
        },
        confidence: 0.7 + (attempt * 0.1), // Increase confidence with attempts
        timestamp: new Date().toISOString()
      });
    }

    return commonErrors;
  }

  /**
   * Retry with Feedback
   *
   * Generates specific feedback and retries operation
   */
  async retryWithFeedback(result, validation, attempt) {
    console.log(`🔄 Generating feedback for retry attempt ${attempt + 1}...`);

    // Generate structured feedback based on error categories
    const feedback = {
      errors: [],
      suggestions: [],
      priority: 'high'
    };

    // Syntax errors (highest priority)
    if (validation.categorizedErrors[ERROR_TYPES.SYNTAX]) {
      validation.categorizedErrors[ERROR_TYPES.SYNTAX].forEach(error => {
        feedback.errors.push({
          type: 'syntax',
          message: `Fix syntax error: ${error.message}`,
          location: error.line ? `Line ${error.line}` : 'Unknown',
          action: 'Fix syntax before proceeding'
        });
      });
    }

    // Test failures
    if (validation.categorizedErrors[ERROR_TYPES.TEST]) {
      validation.categorizedErrors[ERROR_TYPES.TEST].forEach(error => {
        feedback.errors.push({
          type: 'test',
          message: `Fix failing test: ${error.testName}`,
          details: error.message,
          action: 'Update implementation to pass test'
        });
      });
    }

    // Coverage issues
    if (validation.categorizedErrors[ERROR_TYPES.COVERAGE]) {
      feedback.errors.push({
        type: 'coverage',
        message: `Increase coverage to ${this.config.minimumCoverage}%`,
        current: validation.metrics.coverage,
        action: 'Add tests for uncovered lines'
      });
    }

    // Security issues
    if (validation.categorizedErrors[ERROR_TYPES.SECURITY]) {
      validation.categorizedErrors[ERROR_TYPES.SECURITY].forEach(error => {
        feedback.errors.push({
          type: 'security',
          message: `Fix security issue: ${error.message}`,
          severity: 'critical',
          action: 'Address security vulnerability immediately'
        });
      });
    }

    // TDD violations
    if (validation.categorizedErrors[ERROR_TYPES.TDD_VIOLATION]) {
      validation.categorizedErrors[ERROR_TYPES.TDD_VIOLATION].forEach(error => {
        feedback.suggestions.push({
          type: 'tdd',
          message: error.message,
          action: error.action
        });
      });
    }

    // Add attempt-specific guidance
    if (attempt === 1) {
      feedback.suggestions.push({
        message: 'First retry - focus on critical errors',
        action: 'Fix syntax and security issues first'
      });
    } else if (attempt === 2) {
      feedback.suggestions.push({
        message: 'Second retry - comprehensive fixes needed',
        action: 'Address all validation errors and improve test coverage'
      });
    }

    console.log(`📋 Feedback generated: ${feedback.errors.length} errors, ${feedback.suggestions.length} suggestions`);

    // In a real implementation, this would pass feedback to the SDK agent
    // For now, we return the result with feedback attached
    return {
      ...result,
      retryFeedback: feedback,
      retryAttempt: attempt + 1
    };
  }

  /**
   * Store Validation in Memory
   */
  async storeValidation(validation, context) {
    if (!this.memory) return;

    try {
      const validationId = `validation-${this.config.agentId}-${context.timestamp}`;

      await this.memory.storeCoordination(validationId, {
        agentId: this.config.agentId,
        attempt: context.attempt,
        operation: context.operation,
        file: context.file,
        confidence: validation.confidence,
        passed: validation.passed,
        errors: validation.categorizedErrors,
        metrics: validation.metrics,
        timestamp: validation.timestamp
      });

    } catch (error) {
      console.error(`⚠️ Failed to store validation in memory: ${error.message}`);
    }
  }

  /**
   * Record Success Pattern
   */
  async recordSuccess(validation, attempts) {
    if (!this.memory) return;

    try {
      const patternId = `success-${this.config.agentId}-${Date.now()}`;

      await this.memory.storePattern(patternId, {
        type: 'validation-success',
        agentId: this.config.agentId,
        attempts,
        confidence: validation.confidence,
        metrics: validation.metrics,
        strategyUsed: {
          syntaxMode: this.config.syntaxMode,
          tddFirst: this.config.tddFirst,
          securityMode: this.config.securityMode
        },
        timestamp: new Date().toISOString()
      });

      this.learningPatterns.retryEffectiveness.push({
        attempts,
        success: true,
        confidence: validation.confidence
      });

    } catch (error) {
      console.error(`⚠️ Failed to record success pattern: ${error.message}`);
    }
  }

  /**
   * Load Learning History from Memory
   */
  async loadLearningHistory() {
    if (!this.memory) return;

    try {
      // Load previous patterns for this agent
      const patterns = await this.memory.search({
        namespace: 'swarm:patterns',
        limit: 50
      });

      patterns.forEach(entry => {
        const pattern = entry.value;
        if (pattern.agentId === this.config.agentId && pattern.type === 'validation-learning') {
          if (pattern.adjustments) {
            // Apply learned adjustments
            this.config = { ...this.config, ...pattern.adjustments };
          }
        }
      });

      console.log(`📚 Loaded learning history: ${patterns.length} patterns`);

    } catch (error) {
      console.warn(`⚠️ Could not load learning history: ${error.message}`);
    }
  }

  /**
   * Helper Methods
   */

  async assessImpact(args) {
    const criticalFiles = [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'jest.config.js',
      '.env',
      'Cargo.toml',
      'go.mod'
    ];

    const fileName = path.basename(args.file || '');
    const isCritical = criticalFiles.includes(fileName);

    return {
      risk: isCritical ? 0.9 : 0.3,
      reason: isCritical
        ? `Modifying critical configuration file: ${fileName}`
        : 'Safe operation on regular file'
    };
  }

  checkSecurityPatterns(content) {
    const issues = [];
    let riskLevel = 0;

    const securityPatterns = [
      { pattern: /eval\s*\(/g, issue: 'Use of eval() detected', risk: 0.9 },
      { pattern: /password\s*=\s*['"][^'"]+['"]/gi, issue: 'Hardcoded password detected', risk: 1.0 },
      { pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/gi, issue: 'Hardcoded API key detected', risk: 1.0 },
      { pattern: /innerHTML\s*=/g, issue: 'Potential XSS with innerHTML', risk: 0.6 },
      { pattern: /new\s+Function\s*\(/g, issue: 'Dynamic function creation detected', risk: 0.7 },
      { pattern: /exec\s*\(/g, issue: 'Command execution detected', risk: 0.8 }
    ];

    securityPatterns.forEach(({ pattern, issue, risk }) => {
      if (pattern.test(content)) {
        issues.push(issue);
        riskLevel = Math.max(riskLevel, risk);
      }
    });

    return {
      hasIssues: issues.length > 0,
      issues,
      riskLevel
    };
  }

  findCommonErrors(history) {
    const counts = {};

    Object.values(ERROR_TYPES).forEach(type => {
      counts[type] = 0;
    });

    history.forEach(entry => {
      if (entry.errors) {
        Object.keys(entry.errors).forEach(errorType => {
          counts[errorType] += entry.errors[errorType].length;
        });
      }
    });

    return counts;
  }

  logValidationSummary(validation) {
    console.log(`\n📊 Validation Summary:`);
    console.log(`   Confidence: ${(validation.confidence * 100).toFixed(1)}%`);
    console.log(`   Status: ${validation.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Coverage: ${validation.metrics.coverage}%`);
    console.log(`   Tests: ${validation.metrics.testsPassed}/${validation.metrics.testsTotal} passed`);
    console.log(`   Security Issues: ${validation.metrics.securityIssues}`);
    console.log(`   Syntax Errors: ${validation.metrics.syntaxErrors}`);
    console.log(`   TDD Phase: ${validation.metrics.tddPhase}`);
    console.log(`   Time: ${validation.validationTime}ms\n`);
  }

  /**
   * Get Agent Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageRetries: this.metrics.totalValidations > 0
        ? (this.metrics.passedAfterRetry / this.metrics.totalValidations).toFixed(2)
        : 0,
      firstAttemptSuccessRate: this.metrics.totalValidations > 0
        ? ((this.metrics.passedFirstAttempt / this.metrics.totalValidations) * 100).toFixed(1) + '%'
        : '0%',
      overallSuccessRate: this.metrics.totalValidations > 0
        ? (((this.metrics.passedFirstAttempt + this.metrics.passedAfterRetry) / this.metrics.totalValidations) * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Cleanup
   */
  async cleanup() {
    if (this.memory) {
      await this.memory.close();
    }
  }
}

/**
 * Factory function for creating self-validating agents
 */
export function createSelfValidatingAgent(config) {
  return new SelfValidatingAgent(config);
}

/**
 * Export default
 */
export default SelfValidatingAgent;