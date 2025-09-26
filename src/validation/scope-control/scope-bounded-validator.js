/**
 * Scope Bounded Validator - Core Implementation
 *
 * Enforces validation boundaries to prevent scope overreach and uncontrolled
 * feature expansion in validator agent loops.
 *
 * Key Features:
 * - Explicit scope boundary enforcement
 * - Feature suggestion toggle system
 * - Real-time violation monitoring
 * - Escalation process for out-of-scope requests
 */

import { ValidationScopeGuard } from './validation-scope-guard.js';
import { FeatureSuggestionConfig } from './feature-suggestion-config.js';
import { ScopeViolationMonitor } from './scope-violation-monitor.js';
import { ScopeEscalationManager } from './scope-escalation-manager.js';

/**
 * Base class for all scope-bounded validators
 * Prevents validators from exceeding their original implementation scope
 */
export class ScopeBoundedValidator {
  constructor(originalScope, suggestionMode = 'validation_only', options = {}) {
    // Core scope control components
    this.originalScope = this.normalizeScope(originalScope);
    this.scopeGuard = new ValidationScopeGuard(this.originalScope, suggestionMode !== 'validation_only');
    this.suggestionConfig = new FeatureSuggestionConfig(suggestionMode);
    this.violationMonitor = new ScopeViolationMonitor(this.originalScope, this.suggestionConfig);
    this.escalationManager = new ScopeEscalationManager(options.escalationConfig || {});

    // Validation state
    this.validationResults = {
      core_validation: {},
      scope_compliance: {},
      suggestions: [],
      violations: []
    };

    // Metrics tracking
    this.metrics = {
      validation_start_time: null,
      scope_checks_performed: 0,
      violations_detected: 0,
      suggestions_generated: 0,
      escalations_triggered: 0
    };

    // Configuration
    this.options = {
      strict_enforcement: options.strict_enforcement !== false,
      auto_escalate: options.auto_escalate !== false,
      track_metrics: options.track_metrics !== false,
      ...options
    };
  }

  /**
   * Normalize scope definition to standard format
   */
  normalizeScope(scope) {
    if (typeof scope === 'string') {
      // Convert simple string scope to structured format
      return {
        primary_objective: scope,
        must_validate: [scope],
        must_not_validate: ['architecture', 'enterprise_features', 'security_frameworks'],
        success_criteria: ['validation_completed'],
        excluded_areas: ['implementation', 'feature_development', 'system_design']
      };
    }

    // Ensure all required fields are present
    return {
      primary_objective: scope.primary_objective || 'Validate target',
      must_validate: scope.must_validate || [],
      must_not_validate: scope.must_not_validate || [],
      success_criteria: scope.success_criteria || [],
      excluded_areas: scope.excluded_areas || [],
      complexity_limits: scope.complexity_limits || { max_new_features: 0, max_architecture_changes: 0 },
      ...scope
    };
  }

  /**
   * Main validation entry point with scope enforcement
   */
  async validate(target, context = {}) {
    this.metrics.validation_start_time = Date.now();

    try {
      // Step 1: Pre-validation scope check
      const validationPlan = this.getValidationPlan(target, context);
      const scopeCheck = await this.performScopeCheck(validationPlan);

      // Step 2: Handle any scope violations
      if (!scopeCheck.withinBounds && this.options.strict_enforcement) {
        await this.handleScopeViolations(scopeCheck.violations, context);
      }

      // Step 3: Execute approved core validation actions
      const coreResults = await this.executeCoreValidation(
        target,
        scopeCheck.approved_actions,
        context
      );

      // Step 4: Process suggestions if enabled
      let suggestions = [];
      if (this.suggestionConfig.config.allow_suggestions && scopeCheck.suggestions.length > 0) {
        suggestions = await this.processSuggestions(scopeCheck.suggestions, context);
      }

      // Step 5: Post-validation scope audit
      const scopeAudit = this.auditScopeCompliance();

      // Step 6: Compile results
      const finalResults = {
        validation_result: coreResults,
        scope_compliance: scopeAudit,
        suggestions: suggestions,
        violations: this.validationResults.violations,
        metrics: this.calculateValidationMetrics()
      };

      // Step 7: Track metrics if enabled
      if (this.options.track_metrics) {
        await this.trackValidationMetrics(finalResults);
      }

      return finalResults;

    } catch (error) {
      if (error instanceof ScopeViolationError) {
        return this.handleScopeViolationError(error);
      }
      throw error;
    }
  }

  /**
   * Perform comprehensive scope checking
   */
  async performScopeCheck(validationPlan) {
    this.metrics.scope_checks_performed++;

    const scopeCheck = this.scopeGuard.validateRequest({
      actions: validationPlan.actions,
      objectives: validationPlan.objectives,
      complexity_estimate: validationPlan.complexity_estimate
    });

    // Real-time violation monitoring
    for (const action of validationPlan.actions) {
      const violationCheck = this.violationMonitor.monitorValidationAction(action, {
        current_scope: this.originalScope,
        suggestion_mode: this.suggestionConfig.mode
      });

      if (violationCheck.violation_detected) {
        scopeCheck.violations.push({
          action: action,
          violation: violationCheck,
          severity: violationCheck.severity
        });
        scopeCheck.withinBounds = false;
        this.metrics.violations_detected++;
      }
    }

    return scopeCheck;
  }

  /**
   * Handle scope violations through escalation process
   */
  async handleScopeViolations(violations, context) {
    const criticalViolations = violations.filter(v => v.severity === 'CRITICAL');
    const nonCriticalViolations = violations.filter(v => v.severity !== 'CRITICAL');

    // Critical violations always halt execution
    if (criticalViolations.length > 0) {
      const criticalError = new ScopeViolationError(
        `Critical scope violations detected: ${criticalViolations.map(v => v.violation.violation_type).join(', ')}`
      );
      criticalError.violations = criticalViolations;
      throw criticalError;
    }

    // Non-critical violations go through escalation process
    for (const violation of nonCriticalViolations) {
      const escalation = await this.escalationManager.escalateOutOfScopeAction(
        violation.action,
        violation.violation.violation_type,
        context
      );

      this.metrics.escalations_triggered++;

      if (escalation.status === 'REJECTED') {
        throw new ScopeViolationError(`Scope violation rejected: ${violation.violation.violation_type}`);
      }

      // Store approved escalations for audit trail
      this.validationResults.violations.push({
        violation: violation,
        escalation: escalation,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Process feature suggestions if enabled
   */
  async processSuggestions(suggestions, context) {
    const processedSuggestions = [];

    for (const suggestion of suggestions) {
      if (this.suggestionConfig.shouldAllowSuggestion(suggestion)) {
        // Categorize and prioritize suggestion
        const processedSuggestion = {
          ...suggestion,
          category: this.categorizeSuggestion(suggestion),
          priority: this.prioritizeSuggestion(suggestion),
          implementation_complexity: this.estimateImplementationComplexity(suggestion),
          requires_approval: suggestion.complexity > this.suggestionConfig.config.max_suggestion_complexity / 2,
          source: 'scope_bounded_validator',
          timestamp: Date.now()
        };

        // Add implementation guidance if appropriate
        if (processedSuggestion.category === 'minor_enhancement') {
          processedSuggestion.implementation_guidance = this.generateImplementationGuidance(suggestion);
        }

        processedSuggestions.push(processedSuggestion);
        this.metrics.suggestions_generated++;
      }
    }

    return processedSuggestions;
  }

  /**
   * Audit scope compliance after validation
   */
  auditScopeCompliance() {
    const violations = this.violationMonitor.violations;
    const warnings = this.violationMonitor.warnings;

    const audit = {
      within_original_scope: violations.length === 0,
      violations_detected: violations,
      warnings: warnings,
      scope_adherence_score: this.calculateScopeAdherenceScore(),
      scope_expansion_attempted: violations.some(v => v.violation_type === 'SCOPE_EXPANSION'),
      enterprise_overreach_detected: violations.some(v => v.violation_type === 'ENTERPRISE_OVERREACH'),
      feature_implementation_attempted: violations.some(v => v.violation_type === 'FEATURE_IMPLEMENTATION'),
      audit_timestamp: Date.now()
    };

    // Add detailed compliance breakdown
    audit.compliance_breakdown = {
      objectives_met: this.checkObjectivesFulfilled(),
      constraints_respected: this.checkConstraintsRespected(),
      success_criteria_achieved: this.checkSuccessCriteriaAchieved(),
      excluded_areas_avoided: this.checkExcludedAreasAvoided()
    };

    return audit;
  }

  /**
   * Calculate scope adherence percentage
   */
  calculateScopeAdherenceScore() {
    const totalActions = this.getTotalActionsAttempted();
    const violations = this.violationMonitor.violations.length;
    const warnings = this.violationMonitor.warnings.length;

    if (totalActions === 0) return 100;

    // Score formula: (total - violations - (warnings * 0.5)) / total * 100
    const penaltyScore = violations + (warnings * 0.5);
    const adherenceScore = Math.max(0, (totalActions - penaltyScore) / totalActions * 100);

    return Math.round(adherenceScore * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Generate validation metrics summary
   */
  calculateValidationMetrics() {
    const endTime = Date.now();
    const validationDuration = endTime - (this.metrics.validation_start_time || endTime);

    return {
      validation_duration_ms: validationDuration,
      scope_checks_performed: this.metrics.scope_checks_performed,
      violations_detected: this.metrics.violations_detected,
      suggestions_generated: this.metrics.suggestions_generated,
      escalations_triggered: this.metrics.escalations_triggered,
      scope_adherence_score: this.calculateScopeAdherenceScore(),
      efficiency_score: this.calculateEfficiencyScore(),
      validation_timestamp: endTime
    };
  }

  /**
   * Calculate efficiency score (validation effectiveness vs overhead)
   */
  calculateEfficiencyScore() {
    const validationActions = this.getTotalValidationActions();
    const overheadActions = this.metrics.violations_detected + this.metrics.escalations_triggered;

    if (validationActions === 0) return 0;
    return Math.max(0, (validationActions - overheadActions) / validationActions * 100);
  }

  // Abstract methods to be implemented by concrete validators

  /**
   * Define validation plan for the target
   * Must be implemented by concrete validator classes
   */
  getValidationPlan(target, context) {
    throw new Error('getValidationPlan must be implemented by concrete validator');
  }

  /**
   * Execute core validation logic within approved scope
   * Must be implemented by concrete validator classes
   */
  async executeCoreValidation(target, approvedActions, context) {
    throw new Error('executeCoreValidation must be implemented by concrete validator');
  }

  // Helper methods for scope compliance checking

  checkObjectivesFulfilled() {
    // Check if all must_validate objectives were addressed
    return this.originalScope.must_validate.every(objective =>
      this.wasObjectiveAddressed(objective)
    );
  }

  checkConstraintsRespected() {
    // Check if any must_not_validate constraints were violated
    return !this.originalScope.must_not_validate.some(constraint =>
      this.wasConstraintViolated(constraint)
    );
  }

  checkSuccessCriteriaAchieved() {
    // Check if success criteria were met
    return this.originalScope.success_criteria.every(criteria =>
      this.wasCriteriaMet(criteria)
    );
  }

  checkExcludedAreasAvoided() {
    // Check if excluded areas were properly avoided
    return !this.originalScope.excluded_areas.some(area =>
      this.wasExcludedAreaEntered(area)
    );
  }

  // Utility methods for suggestion processing

  categorizeSuggestion(suggestion) {
    const categories = {
      'code_quality': ['refactor', 'cleanup', 'documentation'],
      'performance_minor': ['optimization', 'caching', 'efficiency'],
      'testing': ['test_coverage', 'test_quality', 'test_automation'],
      'architecture': ['design', 'structure', 'patterns'],
      'security': ['vulnerability', 'authentication', 'encryption'],
      'scalability': ['performance', 'distributed', 'horizontal']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword =>
        suggestion.description.toLowerCase().includes(keyword)
      )) {
        return category;
      }
    }

    return 'general';
  }

  prioritizeSuggestion(suggestion) {
    const complexityPriority = {
      1: 'low',
      2: 'low',
      3: 'low',
      4: 'medium',
      5: 'medium',
      6: 'medium',
      7: 'high',
      8: 'high',
      9: 'critical',
      10: 'critical'
    };

    return complexityPriority[suggestion.complexity] || 'medium';
  }

  estimateImplementationComplexity(suggestion) {
    // Estimate complexity based on suggestion content and category
    const baseComplexity = suggestion.complexity || 5;

    const categoryComplexityModifiers = {
      'code_quality': 0.8,
      'testing': 1.0,
      'performance_minor': 1.2,
      'architecture': 1.5,
      'security': 1.8,
      'scalability': 2.0
    };

    const category = this.categorizeSuggestion(suggestion);
    const modifier = categoryComplexityModifiers[category] || 1.0;

    return Math.round(baseComplexity * modifier);
  }

  generateImplementationGuidance(suggestion) {
    return {
      estimated_effort: `${this.estimateImplementationComplexity(suggestion)} story points`,
      prerequisites: this.identifyPrerequisites(suggestion),
      potential_risks: this.identifyPotentialRisks(suggestion),
      implementation_steps: this.generateImplementationSteps(suggestion)
    };
  }

  // Placeholder methods for concrete implementation details
  wasObjectiveAddressed(objective) { return true; }
  wasConstraintViolated(constraint) { return false; }
  wasCriteriaMet(criteria) { return true; }
  wasExcludedAreaEntered(area) { return false; }
  getTotalActionsAttempted() { return 1; }
  getTotalValidationActions() { return 1; }
  identifyPrerequisites(suggestion) { return []; }
  identifyPotentialRisks(suggestion) { return []; }
  generateImplementationSteps(suggestion) { return []; }

  /**
   * Handle scope violation errors
   */
  handleScopeViolationError(error) {
    return {
      validation_result: {
        success: false,
        error: 'Scope violation prevented validation completion',
        details: error.message
      },
      scope_compliance: {
        within_original_scope: false,
        critical_violation: true,
        violations_detected: error.violations || [],
        scope_adherence_score: 0
      },
      suggestions: [],
      violations: error.violations || [],
      metrics: this.calculateValidationMetrics()
    };
  }

  /**
   * Track validation metrics for analytics
   */
  async trackValidationMetrics(results) {
    // In production, this would integrate with analytics system
    const metricsData = {
      validator_type: this.constructor.name,
      scope_adherence_score: results.scope_compliance.scope_adherence_score,
      violations_count: results.violations.length,
      suggestions_count: results.suggestions.length,
      validation_duration: results.metrics.validation_duration_ms,
      timestamp: Date.now()
    };

    // Store metrics for analysis
    if (typeof this.storeMetrics === 'function') {
      await this.storeMetrics(metricsData);
    }
  }
}

/**
 * Scope Violation Error
 * Thrown when critical scope violations are detected
 */
export class ScopeViolationError extends Error {
  constructor(message, violations = []) {
    super(message);
    this.name = 'ScopeViolationError';
    this.violations = violations;
  }
}

/**
 * Validation Scope Error
 * Thrown when validation cannot proceed due to scope issues
 */
export class ValidationScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationScopeError';
  }
}