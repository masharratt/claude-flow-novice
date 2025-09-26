/**
 * Validation Scope Guard
 *
 * Enforces validation boundaries by filtering requests against original scope
 * definitions. Prevents validators from exceeding their intended purpose.
 */

export class ValidationScopeGuard {
  constructor(originalScope, allowSuggestions = false) {
    this.originalScope = this.parseScope(originalScope);
    this.allowSuggestions = allowSuggestions;
    this.violationHistory = [];
    this.boundaryThresholds = this.calculateBoundaryThresholds();
  }

  /**
   * Parse and normalize scope definition
   */
  parseScope(scope) {
    return {
      objectives: Array.isArray(scope.must_validate)
        ? scope.must_validate
        : [scope.primary_objective],
      constraints: Array.isArray(scope.must_not_validate) ? scope.must_not_validate : [],
      boundaries: scope.boundaries || this.inferBoundaries(scope),
      success_criteria: Array.isArray(scope.success_criteria) ? scope.success_criteria : [],
      excluded_areas: Array.isArray(scope.excluded_areas) ? scope.excluded_areas : [],
      complexity_limits: scope.complexity_limits || { max_complexity: 5, max_scope_expansion: 0.2 },
    };
  }

  /**
   * Infer reasonable boundaries from scope definition
   */
  inferBoundaries(scope) {
    return {
      max_actions: 10,
      max_complexity_per_action: 5,
      max_total_complexity: 25,
      allowed_categories: ['validation', 'verification', 'checking'],
      forbidden_categories: ['implementation', 'development', 'architecture', 'enterprise'],
    };
  }

  /**
   * Calculate dynamic boundary thresholds based on scope
   */
  calculateBoundaryThresholds() {
    const objectiveComplexity = this.originalScope.objectives.length;
    const constraintStrictness = this.originalScope.constraints.length;

    return {
      violation_tolerance: Math.max(0, 3 - constraintStrictness),
      complexity_buffer: Math.min(2, objectiveComplexity * 0.5),
      suggestion_threshold: this.allowSuggestions ? 3 : 0,
    };
  }

  /**
   * Validate validation request against scope boundaries
   */
  validateRequest(validationRequest) {
    const scopeCheck = {
      withinBounds: true,
      violations: [],
      warnings: [],
      suggestions: [],
      approved_actions: [],
      rejected_actions: [],
      scope_metrics: {},
    };

    // Validate each requested action
    const actions = validationRequest.actions || [];

    for (const action of actions) {
      const actionAnalysis = this.analyzeAction(action);

      if (this.isWithinCoreScope(action, actionAnalysis)) {
        scopeCheck.approved_actions.push(action);
      } else if (this.isSuggestion(action, actionAnalysis) && this.allowSuggestions) {
        scopeCheck.suggestions.push({
          ...action,
          suggestion_metadata: actionAnalysis,
        });
      } else {
        const violation = this.createViolation(action, actionAnalysis);
        scopeCheck.violations.push(violation);
        scopeCheck.rejected_actions.push(action);
        scopeCheck.withinBounds = false;
      }
    }

    // Check overall request compliance
    const overallCompliance = this.checkOverallCompliance(validationRequest, scopeCheck);
    if (!overallCompliance.compliant) {
      scopeCheck.violations.push(...overallCompliance.violations);
      scopeCheck.withinBounds = false;
    }

    // Calculate scope metrics
    scopeCheck.scope_metrics = this.calculateScopeMetrics(validationRequest, scopeCheck);

    // Record this validation for learning
    this.recordValidationAttempt(scopeCheck);

    return scopeCheck;
  }

  /**
   * Analyze individual action for scope compliance
   */
  analyzeAction(action) {
    return {
      complexity: this.estimateActionComplexity(action),
      category: this.categorizeAction(action),
      scope_alignment: this.calculateScopeAlignment(action),
      risk_level: this.assessRiskLevel(action),
      implementation_indicators: this.detectImplementationIndicators(action),
      enterprise_indicators: this.detectEnterpriseIndicators(action),
    };
  }

  /**
   * Check if action is within core validation scope
   */
  isWithinCoreScope(action, analysis) {
    // Must align with original objectives
    const objectiveAlignment = this.originalScope.objectives.some((objective) =>
      this.actionMatchesObjective(action, objective),
    );

    // Must not violate constraints
    const constraintViolation = this.originalScope.constraints.some((constraint) =>
      this.actionViolatesConstraint(action, constraint),
    );

    // Must not enter excluded areas
    const excludedAreaViolation = this.originalScope.excluded_areas.some((area) =>
      this.actionInExcludedArea(action, area),
    );

    // Must be within complexity limits
    const withinComplexityLimits =
      analysis.complexity <= this.originalScope.boundaries.max_complexity_per_action;

    // Must be validation-related category
    const validationCategory = this.originalScope.boundaries.allowed_categories.includes(
      analysis.category,
    );

    return (
      objectiveAlignment &&
      !constraintViolation &&
      !excludedAreaViolation &&
      withinComplexityLimits &&
      validationCategory
    );
  }

  /**
   * Check if action is a valid suggestion
   */
  isSuggestion(action, analysis) {
    if (!this.allowSuggestions) return false;

    // Suggestions can have higher complexity but must be clearly improvement-focused
    const isImprovement = this.isImprovementSuggestion(action);
    const withinSuggestionLimits =
      analysis.complexity <= this.boundaryThresholds.suggestion_threshold + 5;
    const notImplementation = !analysis.implementation_indicators.is_implementation;

    return isImprovement && withinSuggestionLimits && notImplementation;
  }

  /**
   * Create violation record
   */
  createViolation(action, analysis) {
    const violationType = this.determineViolationType(action, analysis);
    const severity = this.determineViolationSeverity(violationType, analysis);

    return {
      action: action,
      violation_type: violationType,
      severity: severity,
      reason: this.getViolationReason(action, analysis, violationType),
      scope_context: {
        original_objectives: this.originalScope.objectives,
        violated_constraints: this.getViolatedConstraints(action),
        excluded_areas_entered: this.getEnteredExcludedAreas(action),
      },
      analysis: analysis,
      timestamp: Date.now(),
    };
  }

  /**
   * Determine type of violation
   */
  determineViolationType(action, analysis) {
    if (analysis.implementation_indicators.is_implementation) {
      return 'FEATURE_IMPLEMENTATION';
    }

    if (analysis.enterprise_indicators.is_enterprise) {
      return 'ENTERPRISE_OVERREACH';
    }

    if (analysis.complexity > this.originalScope.boundaries.max_complexity_per_action * 2) {
      return 'COMPLEXITY_OVERREACH';
    }

    if (this.originalScope.boundaries.forbidden_categories.includes(analysis.category)) {
      return 'CATEGORY_VIOLATION';
    }

    if (analysis.scope_alignment < 0.3) {
      return 'SCOPE_MISALIGNMENT';
    }

    return 'GENERAL_BOUNDARY_VIOLATION';
  }

  /**
   * Determine violation severity
   */
  determineViolationSeverity(violationType, analysis) {
    const severityMap = {
      FEATURE_IMPLEMENTATION: 'CRITICAL',
      ENTERPRISE_OVERREACH: 'CRITICAL',
      ARCHITECTURE_EXPANSION: 'HIGH',
      COMPLEXITY_OVERREACH: analysis.complexity > 8 ? 'HIGH' : 'MEDIUM',
      CATEGORY_VIOLATION: 'MEDIUM',
      SCOPE_MISALIGNMENT: analysis.scope_alignment < 0.1 ? 'HIGH' : 'MEDIUM',
      GENERAL_BOUNDARY_VIOLATION: 'LOW',
    };

    return severityMap[violationType] || 'MEDIUM';
  }

  /**
   * Estimate action complexity
   */
  estimateActionComplexity(action) {
    let complexity = 1;

    // Base complexity from action description length and keywords
    const description = action.description || action.name || '';
    complexity += Math.min(3, description.length / 50);

    // Complexity keywords
    const complexityKeywords = {
      implement: 3,
      build: 3,
      create: 2,
      develop: 3,
      design: 2,
      architecture: 4,
      system: 2,
      framework: 4,
      enterprise: 5,
      scalable: 3,
      distributed: 4,
      microservices: 5,
      consensus: 5,
      byzantine: 5,
      cryptographic: 4,
      security: 2,
      validate: 1,
      check: 1,
      verify: 1,
      test: 1,
    };

    for (const [keyword, weight] of Object.entries(complexityKeywords)) {
      if (description.toLowerCase().includes(keyword)) {
        complexity += weight;
      }
    }

    // Explicit complexity if provided
    if (typeof action.complexity === 'number') {
      complexity = Math.max(complexity, action.complexity);
    }

    return Math.min(10, Math.max(1, Math.round(complexity)));
  }

  /**
   * Categorize action type
   */
  categorizeAction(action) {
    const description = (action.description || action.name || '').toLowerCase();

    const categoryKeywords = {
      validation: ['validate', 'check', 'verify', 'confirm', 'ensure'],
      testing: ['test', 'spec', 'assert', 'expect'],
      analysis: ['analyze', 'examine', 'inspect', 'review'],
      implementation: ['implement', 'build', 'create', 'develop', 'code'],
      architecture: ['design', 'architect', 'structure', 'pattern'],
      enterprise: ['enterprise', 'scalable', 'distributed', 'production'],
      security: ['secure', 'encrypt', 'authenticate', 'authorize'],
      performance: ['optimize', 'performance', 'speed', 'efficiency'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some((keyword) => description.includes(keyword))) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Calculate how well action aligns with original scope
   */
  calculateScopeAlignment(action) {
    const description = (action.description || '').toLowerCase();
    let alignment = 0;

    // Positive alignment with objectives
    for (const objective of this.originalScope.objectives) {
      const objectiveWords = objective.toLowerCase().split(/\s+/);
      const matches = objectiveWords.filter(
        (word) => word.length > 3 && description.includes(word),
      ).length;
      alignment += (matches / objectiveWords.length) * 0.4;
    }

    // Negative alignment with constraints and excluded areas
    const allRestrictions = [
      ...this.originalScope.constraints,
      ...this.originalScope.excluded_areas,
    ];

    for (const restriction of allRestrictions) {
      const restrictionWords = restriction.toLowerCase().split(/\s+/);
      const matches = restrictionWords.filter(
        (word) => word.length > 3 && description.includes(word),
      ).length;
      alignment -= (matches / restrictionWords.length) * 0.6;
    }

    return Math.max(0, Math.min(1, alignment));
  }

  /**
   * Assess risk level of action
   */
  assessRiskLevel(action) {
    let risk = 0;

    const riskIndicators = [
      'permanent',
      'irreversible',
      'breaking',
      'major',
      'critical',
      'system-wide',
      'global',
      'infrastructure',
      'database',
      'schema',
    ];

    const description = (action.description || '').toLowerCase();
    for (const indicator of riskIndicators) {
      if (description.includes(indicator)) {
        risk += 0.2;
      }
    }

    return Math.min(1, risk);
  }

  /**
   * Detect if action involves implementation
   */
  detectImplementationIndicators(action) {
    const description = (action.description || '').toLowerCase();

    const implementationWords = [
      'implement',
      'build',
      'create',
      'develop',
      'code',
      'write',
      'add',
      'insert',
      'modify',
      'change',
      'update',
      'enhance',
    ];

    const implementationCount = implementationWords.filter((word) =>
      description.includes(word),
    ).length;

    const isImplementation =
      implementationCount >= 2 ||
      implementationWords.some(
        (word) => description.startsWith(word) || description.includes(`${word} `),
      );

    return {
      is_implementation: isImplementation,
      implementation_word_count: implementationCount,
      implementation_confidence: Math.min(1, implementationCount / 3),
    };
  }

  /**
   * Detect enterprise feature indicators
   */
  detectEnterpriseIndicators(action) {
    const description = (action.description || '').toLowerCase();

    const enterpriseWords = [
      'enterprise',
      'scalable',
      'distributed',
      'microservices',
      'byzantine',
      'consensus',
      'fault-tolerant',
      'high-availability',
      'load-balancing',
      'clustering',
      'sharding',
      'replication',
    ];

    const enterpriseCount = enterpriseWords.filter((word) => description.includes(word)).length;

    const isEnterprise = enterpriseCount > 0;

    return {
      is_enterprise: isEnterprise,
      enterprise_word_count: enterpriseCount,
      enterprise_features: enterpriseWords.filter((word) => description.includes(word)),
    };
  }

  /**
   * Check if action is an improvement suggestion
   */
  isImprovementSuggestion(action) {
    const description = (action.description || '').toLowerCase();

    const improvementIndicators = [
      'could',
      'should',
      'might',
      'consider',
      'suggest',
      'recommend',
      'improve',
      'enhance',
      'optimize',
      'better',
      'more efficient',
    ];

    return improvementIndicators.some((indicator) => description.includes(indicator));
  }

  /**
   * Check if action matches specific objective
   */
  actionMatchesObjective(action, objective) {
    const actionDesc = (action.description || '').toLowerCase();
    const objectiveWords = objective
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3);

    const matchCount = objectiveWords.filter((word) => actionDesc.includes(word)).length;
    return matchCount / objectiveWords.length >= 0.3; // At least 30% word match
  }

  /**
   * Check if action violates specific constraint
   */
  actionViolatesConstraint(action, constraint) {
    const actionDesc = (action.description || '').toLowerCase();
    const constraintWords = constraint
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3);

    const violationCount = constraintWords.filter((word) => actionDesc.includes(word)).length;
    return violationCount / constraintWords.length >= 0.4; // More than 40% word match indicates violation
  }

  /**
   * Check if action enters excluded area
   */
  actionInExcludedArea(action, excludedArea) {
    const actionCategory = this.categorizeAction(action);
    return (
      excludedArea.toLowerCase().includes(actionCategory) ||
      actionCategory.includes(excludedArea.toLowerCase())
    );
  }

  /**
   * Check overall request compliance
   */
  checkOverallCompliance(request, scopeCheck) {
    const compliance = { compliant: true, violations: [] };

    // Check total complexity
    const totalComplexity = scopeCheck.approved_actions.reduce(
      (sum, action) => sum + this.estimateActionComplexity(action),
      0,
    );

    if (totalComplexity > this.originalScope.boundaries.max_total_complexity) {
      compliance.compliant = false;
      compliance.violations.push({
        violation_type: 'TOTAL_COMPLEXITY_EXCEEDED',
        severity: 'HIGH',
        reason: `Total complexity ${totalComplexity} exceeds limit ${this.originalScope.boundaries.max_total_complexity}`,
      });
    }

    // Check action count
    const totalActions = scopeCheck.approved_actions.length + scopeCheck.suggestions.length;
    if (totalActions > this.originalScope.boundaries.max_actions) {
      compliance.compliant = false;
      compliance.violations.push({
        violation_type: 'ACTION_COUNT_EXCEEDED',
        severity: 'MEDIUM',
        reason: `Total actions ${totalActions} exceeds limit ${this.originalScope.boundaries.max_actions}`,
      });
    }

    return compliance;
  }

  /**
   * Calculate scope metrics
   */
  calculateScopeMetrics(request, scopeCheck) {
    return {
      total_actions_requested: (request.actions || []).length,
      approved_actions: scopeCheck.approved_actions.length,
      rejected_actions: scopeCheck.rejected_actions.length,
      suggestions_generated: scopeCheck.suggestions.length,
      violations_detected: scopeCheck.violations.length,
      approval_rate: scopeCheck.approved_actions.length / ((request.actions || []).length || 1),
      average_action_complexity: this.calculateAverageComplexity(scopeCheck.approved_actions),
      scope_adherence_percentage: this.calculateScopeAdherence(scopeCheck),
    };
  }

  calculateAverageComplexity(actions) {
    if (actions.length === 0) return 0;
    return (
      actions.reduce((sum, action) => sum + this.estimateActionComplexity(action), 0) /
      actions.length
    );
  }

  calculateScopeAdherence(scopeCheck) {
    const totalActions = scopeCheck.approved_actions.length + scopeCheck.rejected_actions.length;
    if (totalActions === 0) return 100;
    return (scopeCheck.approved_actions.length / totalActions) * 100;
  }

  /**
   * Record validation attempt for learning
   */
  recordValidationAttempt(scopeCheck) {
    this.violationHistory.push({
      timestamp: Date.now(),
      violations: scopeCheck.violations,
      warnings: scopeCheck.warnings,
      approved_actions: scopeCheck.approved_actions.length,
      rejected_actions: scopeCheck.rejected_actions.length,
      scope_metrics: scopeCheck.scope_metrics,
    });

    // Keep only recent history
    if (this.violationHistory.length > 100) {
      this.violationHistory = this.violationHistory.slice(-100);
    }
  }

  // Helper methods for violation analysis

  getViolationReason(action, analysis, violationType) {
    const reasonMap = {
      FEATURE_IMPLEMENTATION: `Action "${action.description}" appears to implement new features rather than validate existing ones`,
      ENTERPRISE_OVERREACH: `Action "${action.description}" introduces enterprise-level complexity beyond validation scope`,
      ARCHITECTURE_EXPANSION: `Action "${action.description}" expands into system architecture beyond original scope`,
      COMPLEXITY_OVERREACH: `Action complexity (${analysis.complexity}) exceeds maximum allowed (${this.originalScope.boundaries.max_complexity_per_action})`,
      CATEGORY_VIOLATION: `Action category "${analysis.category}" is not permitted in this validation scope`,
      SCOPE_MISALIGNMENT: `Action has low alignment (${Math.round(analysis.scope_alignment * 100)}%) with original objectives`,
    };

    return reasonMap[violationType] || `Action violates scope boundaries: ${violationType}`;
  }

  getViolatedConstraints(action) {
    return this.originalScope.constraints.filter((constraint) =>
      this.actionViolatesConstraint(action, constraint),
    );
  }

  getEnteredExcludedAreas(action) {
    return this.originalScope.excluded_areas.filter((area) =>
      this.actionInExcludedArea(action, area),
    );
  }

  /**
   * Get violation statistics for analysis
   */
  getViolationStatistics() {
    if (this.violationHistory.length === 0) {
      return { no_data: true };
    }

    const recentViolations = this.violationHistory.slice(-50);
    const violationTypes = {};
    const severityCount = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

    for (const record of recentViolations) {
      for (const violation of record.violations) {
        violationTypes[violation.violation_type] =
          (violationTypes[violation.violation_type] || 0) + 1;
        severityCount[violation.severity] = (severityCount[violation.severity] || 0) + 1;
      }
    }

    return {
      total_violations: recentViolations.reduce((sum, record) => sum + record.violations.length, 0),
      violation_types: violationTypes,
      severity_breakdown: severityCount,
      average_approval_rate:
        recentViolations.reduce(
          (sum, record) =>
            sum + record.approved_actions / (record.approved_actions + record.rejected_actions),
          0,
        ) / recentViolations.length,
      most_common_violation:
        Object.entries(violationTypes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none',
    };
  }
}
