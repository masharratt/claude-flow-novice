/**
 * Feature Suggestion Configuration System
 *
 * Manages different modes for feature suggestions to separate core validation
 * from enhancement recommendations. Provides fine-grained control over what
 * types of suggestions are allowed.
 */

export class FeatureSuggestionConfig {
  // Predefined suggestion modes
  static MODES = {
    VALIDATION_ONLY: 'validation_only',        // No suggestions, core validation only
    SUGGEST_MINOR: 'suggest_minor',           // Minor improvements only
    SUGGEST_MAJOR: 'suggest_major',           // Major enhancements allowed
    SUGGEST_ENTERPRISE: 'suggest_enterprise'   // Enterprise features allowed
  };

  // Suggestion categories with complexity ratings
  static CATEGORIES = {
    // Low complexity suggestions (1-3)
    'code_quality': { max_complexity: 3, requires_approval: false },
    'documentation': { max_complexity: 2, requires_approval: false },
    'testing_minor': { max_complexity: 3, requires_approval: false },

    // Medium complexity suggestions (4-6)
    'performance_minor': { max_complexity: 4, requires_approval: false },
    'testing_framework': { max_complexity: 6, requires_approval: true },
    'build_optimization': { max_complexity: 5, requires_approval: true },

    // High complexity suggestions (7-8)
    'architecture': { max_complexity: 8, requires_approval: true },
    'performance_major': { max_complexity: 7, requires_approval: true },
    'security_enhancement': { max_complexity: 8, requires_approval: true },

    // Enterprise complexity suggestions (9-10)
    'scalability': { max_complexity: 10, requires_approval: true },
    'enterprise_features': { max_complexity: 10, requires_approval: true },
    'distributed_systems': { max_complexity: 10, requires_approval: true }
  };

  constructor(mode = FeatureSuggestionConfig.MODES.VALIDATION_ONLY, customConfig = {}) {
    this.mode = mode;
    this.config = this.getConfigForMode(mode);
    this.customConfig = customConfig;

    // Apply custom overrides
    if (Object.keys(customConfig).length > 0) {
      this.config = { ...this.config, ...customConfig };
    }

    // Initialize tracking
    this.suggestionMetrics = {
      total_suggestions: 0,
      approved_suggestions: 0,
      rejected_suggestions: 0,
      by_category: {},
      by_complexity: {}
    };
  }

  /**
   * Get configuration for specific suggestion mode
   */
  getConfigForMode(mode) {
    const configs = {
      [FeatureSuggestionConfig.MODES.VALIDATION_ONLY]: {
        allow_suggestions: false,
        max_suggestion_complexity: 0,
        suggestion_categories: [],
        escalation_required: false,
        auto_approve_threshold: 0,
        max_suggestions_per_validation: 0,
        suggestion_filters: {
          require_user_request: true,
          block_implementation_suggestions: true,
          block_architecture_changes: true,
          block_enterprise_features: true
        }
      },

      [FeatureSuggestionConfig.MODES.SUGGEST_MINOR]: {
        allow_suggestions: true,
        max_suggestion_complexity: 3,
        suggestion_categories: ['code_quality', 'documentation', 'testing_minor', 'performance_minor'],
        escalation_required: false,
        auto_approve_threshold: 2,
        max_suggestions_per_validation: 3,
        suggestion_filters: {
          require_user_request: false,
          block_implementation_suggestions: true,
          block_architecture_changes: true,
          block_enterprise_features: true,
          prefer_incremental_improvements: true
        }
      },

      [FeatureSuggestionConfig.MODES.SUGGEST_MAJOR]: {
        allow_suggestions: true,
        max_suggestion_complexity: 7,
        suggestion_categories: [
          'code_quality', 'documentation', 'testing_minor', 'performance_minor',
          'testing_framework', 'build_optimization', 'architecture', 'performance_major'
        ],
        escalation_required: true,
        auto_approve_threshold: 3,
        max_suggestions_per_validation: 5,
        suggestion_filters: {
          require_user_request: false,
          block_implementation_suggestions: false,
          block_architecture_changes: false,
          block_enterprise_features: true,
          require_justification: true
        }
      },

      [FeatureSuggestionConfig.MODES.SUGGEST_ENTERPRISE]: {
        allow_suggestions: true,
        max_suggestion_complexity: 10,
        suggestion_categories: Object.keys(FeatureSuggestionConfig.CATEGORIES),
        escalation_required: true,
        auto_approve_threshold: 5,
        max_suggestions_per_validation: 8,
        suggestion_filters: {
          require_user_request: false,
          block_implementation_suggestions: false,
          block_architecture_changes: false,
          block_enterprise_features: false,
          require_business_justification: true,
          require_impact_analysis: true
        }
      }
    };

    return configs[mode] || configs[FeatureSuggestionConfig.MODES.VALIDATION_ONLY];
  }

  /**
   * Determine if a suggestion should be allowed
   */
  shouldAllowSuggestion(suggestion) {
    // Basic checks
    if (!this.config.allow_suggestions) {
      return false;
    }

    // Complexity check
    const suggestionComplexity = suggestion.complexity || this.estimateSuggestionComplexity(suggestion);
    if (suggestionComplexity > this.config.max_suggestion_complexity) {
      return false;
    }

    // Category check
    const suggestionCategory = suggestion.category || this.categorizeSuggestion(suggestion);
    if (!this.config.suggestion_categories.includes(suggestionCategory)) {
      return false;
    }

    // Filter checks
    if (!this.passesSuggestionFilters(suggestion)) {
      return false;
    }

    // Count check
    if (this.suggestionMetrics.total_suggestions >= this.config.max_suggestions_per_validation) {
      return false;
    }

    return true;
  }

  /**
   * Check suggestion against configured filters
   */
  passesSuggestionFilters(suggestion) {
    const filters = this.config.suggestion_filters;
    const description = (suggestion.description || '').toLowerCase();

    // Implementation suggestion check
    if (filters.block_implementation_suggestions) {
      const implementationKeywords = ['implement', 'build', 'create', 'develop', 'add feature'];
      if (implementationKeywords.some(keyword => description.includes(keyword))) {
        return false;
      }
    }

    // Architecture change check
    if (filters.block_architecture_changes) {
      const architectureKeywords = ['refactor', 'restructure', 'redesign', 'architecture', 'microservices'];
      if (architectureKeywords.some(keyword => description.includes(keyword))) {
        return false;
      }
    }

    // Enterprise feature check
    if (filters.block_enterprise_features) {
      const enterpriseKeywords = ['enterprise', 'scalable', 'distributed', 'byzantine', 'consensus'];
      if (enterpriseKeywords.some(keyword => description.includes(keyword))) {
        return false;
      }
    }

    // User request requirement check
    if (filters.require_user_request && !suggestion.user_requested) {
      return false;
    }

    // Incremental improvement preference
    if (filters.prefer_incremental_improvements) {
      const incrementalKeywords = ['improve', 'enhance', 'optimize', 'better'];
      const hasIncrementalIndicators = incrementalKeywords.some(keyword => description.includes(keyword));

      if (!hasIncrementalIndicators && suggestion.complexity > 2) {
        return false;
      }
    }

    return true;
  }

  /**
   * Estimate complexity of a suggestion
   */
  estimateSuggestionComplexity(suggestion) {
    let complexity = 1;
    const description = (suggestion.description || '').toLowerCase();

    // Keyword-based complexity estimation
    const complexityKeywords = {
      // Low complexity (1-2)
      'fix': 1,
      'update': 1,
      'improve': 1,
      'optimize': 2,
      'enhance': 2,
      'document': 1,

      // Medium complexity (3-5)
      'refactor': 4,
      'test': 3,
      'framework': 4,
      'integration': 4,
      'performance': 3,
      'security': 4,

      // High complexity (6-8)
      'architecture': 7,
      'design': 6,
      'system': 6,
      'scalable': 7,
      'distributed': 8,

      // Enterprise complexity (9-10)
      'enterprise': 9,
      'byzantine': 10,
      'consensus': 10,
      'microservices': 9,
      'fault-tolerant': 10
    };

    for (const [keyword, weight] of Object.entries(complexityKeywords)) {
      if (description.includes(keyword)) {
        complexity = Math.max(complexity, weight);
      }
    }

    // Adjust based on description length
    if (description.length > 200) complexity += 1;
    if (description.length > 500) complexity += 1;

    // Adjust based on multiple technical terms
    const technicalTerms = ['algorithm', 'protocol', 'interface', 'api', 'database', 'cache'];
    const technicalCount = technicalTerms.filter(term => description.includes(term)).length;
    complexity += Math.min(2, technicalCount);

    return Math.min(10, complexity);
  }

  /**
   * Categorize suggestion based on content
   */
  categorizeSuggestion(suggestion) {
    const description = (suggestion.description || '').toLowerCase();

    const categoryKeywords = {
      'code_quality': ['clean', 'readable', 'maintainable', 'refactor', 'lint'],
      'documentation': ['document', 'comment', 'readme', 'guide', 'explain'],
      'testing_minor': ['test', 'assert', 'coverage', 'spec'],
      'testing_framework': ['testing framework', 'test suite', 'jest', 'mocha', 'junit'],
      'performance_minor': ['faster', 'speed', 'efficient', 'optimize'],
      'performance_major': ['performance', 'benchmark', 'profiling', 'memory'],
      'build_optimization': ['build', 'compile', 'bundle', 'webpack', 'rollup'],
      'architecture': ['architecture', 'design', 'pattern', 'structure'],
      'security_enhancement': ['security', 'secure', 'encrypt', 'authentication'],
      'scalability': ['scalable', 'scale', 'distributed', 'horizontal'],
      'enterprise_features': ['enterprise', 'production', 'monitoring', 'logging'],
      'distributed_systems': ['distributed', 'microservices', 'consensus', 'byzantine']
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => description.includes(keyword))) {
        return category;
      }
    }

    return 'code_quality'; // Default category
  }

  /**
   * Process suggestion through configuration pipeline
   */
  processSuggestion(suggestion) {
    const processed = {
      ...suggestion,
      category: suggestion.category || this.categorizeSuggestion(suggestion),
      complexity: suggestion.complexity || this.estimateSuggestionComplexity(suggestion),
      allowed: false,
      requires_approval: false,
      auto_approvable: false,
      rejection_reason: null,
      processing_timestamp: Date.now()
    };

    // Check if suggestion is allowed
    if (!this.shouldAllowSuggestion(processed)) {
      processed.rejection_reason = this.getSuggestionRejectionReason(processed);
      this.suggestionMetrics.rejected_suggestions++;
      return processed;
    }

    // Suggestion is allowed
    processed.allowed = true;

    // Check approval requirements
    const categoryConfig = FeatureSuggestionConfig.CATEGORIES[processed.category];
    processed.requires_approval = categoryConfig?.requires_approval ||
                                 processed.complexity > this.config.auto_approve_threshold ||
                                 this.config.escalation_required;

    processed.auto_approvable = !processed.requires_approval;

    // Add metadata
    processed.metadata = this.generateSuggestionMetadata(processed);

    // Update metrics
    this.updateSuggestionMetrics(processed);

    return processed;
  }

  /**
   * Get reason for suggestion rejection
   */
  getSuggestionRejectionReason(suggestion) {
    if (!this.config.allow_suggestions) {
      return 'Suggestions disabled in current mode';
    }

    if (suggestion.complexity > this.config.max_suggestion_complexity) {
      return `Complexity ${suggestion.complexity} exceeds limit ${this.config.max_suggestion_complexity}`;
    }

    if (!this.config.suggestion_categories.includes(suggestion.category)) {
      return `Category '${suggestion.category}' not allowed in current mode`;
    }

    if (this.suggestionMetrics.total_suggestions >= this.config.max_suggestions_per_validation) {
      return `Maximum suggestions per validation (${this.config.max_suggestions_per_validation}) exceeded`;
    }

    if (!this.passesSuggestionFilters(suggestion)) {
      return 'Suggestion blocked by content filters';
    }

    return 'Unknown rejection reason';
  }

  /**
   * Generate metadata for approved suggestion
   */
  generateSuggestionMetadata(suggestion) {
    return {
      estimated_effort: this.estimateImplementationEffort(suggestion),
      impact_level: this.assessImpactLevel(suggestion),
      dependencies: this.identifyDependencies(suggestion),
      risk_assessment: this.assessRisk(suggestion),
      implementation_guidance: this.generateImplementationGuidance(suggestion)
    };
  }

  /**
   * Estimate implementation effort in story points or hours
   */
  estimateImplementationEffort(suggestion) {
    const effortMap = {
      1: '1-2 hours',
      2: '2-4 hours',
      3: '4-8 hours',
      4: '1-2 days',
      5: '2-3 days',
      6: '3-5 days',
      7: '1-2 weeks',
      8: '2-3 weeks',
      9: '3-4 weeks',
      10: '4+ weeks'
    };

    return effortMap[suggestion.complexity] || 'Unknown';
  }

  /**
   * Assess impact level of suggestion
   */
  assessImpactLevel(suggestion) {
    if (suggestion.complexity <= 3) return 'LOW';
    if (suggestion.complexity <= 6) return 'MEDIUM';
    if (suggestion.complexity <= 8) return 'HIGH';
    return 'CRITICAL';
  }

  /**
   * Identify potential dependencies
   */
  identifyDependencies(suggestion) {
    const description = suggestion.description.toLowerCase();
    const dependencies = [];

    const dependencyIndicators = {
      'database': ['database setup', 'schema changes'],
      'api': ['api integration', 'service dependencies'],
      'authentication': ['auth system', 'user management'],
      'testing': ['test framework', 'test data'],
      'build': ['build pipeline', 'deployment process'],
      'security': ['security review', 'compliance check']
    };

    for (const [indicator, deps] of Object.entries(dependencyIndicators)) {
      if (description.includes(indicator)) {
        dependencies.push(...deps);
      }
    }

    return dependencies;
  }

  /**
   * Assess implementation risk
   */
  assessRisk(suggestion) {
    let riskScore = 0;

    const riskFactors = {
      'breaking': 3,
      'irreversible': 3,
      'database': 2,
      'security': 2,
      'performance': 1,
      'architecture': 2,
      'distributed': 3,
      'enterprise': 2
    };

    const description = suggestion.description.toLowerCase();
    for (const [factor, weight] of Object.entries(riskFactors)) {
      if (description.includes(factor)) {
        riskScore += weight;
      }
    }

    if (riskScore >= 6) return 'HIGH';
    if (riskScore >= 3) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Generate implementation guidance
   */
  generateImplementationGuidance(suggestion) {
    const category = suggestion.category;
    const complexity = suggestion.complexity;

    const guidanceTemplates = {
      'code_quality': {
        steps: ['Review current code', 'Identify improvement areas', 'Apply changes incrementally', 'Test thoroughly'],
        considerations: ['Maintain backward compatibility', 'Follow coding standards', 'Update documentation']
      },
      'testing_framework': {
        steps: ['Evaluate testing needs', 'Choose appropriate framework', 'Set up test environment', 'Create test suite'],
        considerations: ['Integration with existing tools', 'Team training needs', 'CI/CD pipeline impact']
      },
      'performance_major': {
        steps: ['Profile current performance', 'Identify bottlenecks', 'Design optimization strategy', 'Implement and measure'],
        considerations: ['Performance benchmarks', 'Resource constraints', 'User impact during changes']
      },
      'architecture': {
        steps: ['Analyze current architecture', 'Design new structure', 'Plan migration strategy', 'Implement incrementally'],
        considerations: ['System dependencies', 'Data migration', 'Service availability', 'Team coordination']
      }
    };

    return guidanceTemplates[category] || {
      steps: ['Analyze requirements', 'Design solution', 'Implement changes', 'Validate results'],
      considerations: ['Impact on existing system', 'Resource requirements', 'Timeline constraints']
    };
  }

  /**
   * Update suggestion metrics
   */
  updateSuggestionMetrics(suggestion) {
    this.suggestionMetrics.total_suggestions++;

    if (suggestion.allowed) {
      this.suggestionMetrics.approved_suggestions++;
    } else {
      this.suggestionMetrics.rejected_suggestions++;
    }

    // Track by category
    const category = suggestion.category;
    if (!this.suggestionMetrics.by_category[category]) {
      this.suggestionMetrics.by_category[category] = { total: 0, approved: 0, rejected: 0 };
    }
    this.suggestionMetrics.by_category[category].total++;
    if (suggestion.allowed) {
      this.suggestionMetrics.by_category[category].approved++;
    } else {
      this.suggestionMetrics.by_category[category].rejected++;
    }

    // Track by complexity
    const complexity = suggestion.complexity;
    if (!this.suggestionMetrics.by_complexity[complexity]) {
      this.suggestionMetrics.by_complexity[complexity] = { total: 0, approved: 0, rejected: 0 };
    }
    this.suggestionMetrics.by_complexity[complexity].total++;
    if (suggestion.allowed) {
      this.suggestionMetrics.by_complexity[complexity].approved++;
    } else {
      this.suggestionMetrics.by_complexity[complexity].rejected++;
    }
  }

  /**
   * Get current suggestion metrics
   */
  getSuggestionMetrics() {
    return {
      ...this.suggestionMetrics,
      approval_rate: this.suggestionMetrics.total_suggestions > 0
        ? this.suggestionMetrics.approved_suggestions / this.suggestionMetrics.total_suggestions
        : 0,
      current_mode: this.mode,
      config_summary: {
        max_complexity: this.config.max_suggestion_complexity,
        categories_allowed: this.config.suggestion_categories.length,
        escalation_required: this.config.escalation_required
      }
    };
  }

  /**
   * Reset suggestion metrics
   */
  resetMetrics() {
    this.suggestionMetrics = {
      total_suggestions: 0,
      approved_suggestions: 0,
      rejected_suggestions: 0,
      by_category: {},
      by_complexity: {}
    };
  }

  /**
   * Create custom suggestion mode
   */
  static createCustomMode(name, config) {
    return {
      mode_name: name,
      allow_suggestions: config.allow_suggestions || false,
      max_suggestion_complexity: config.max_suggestion_complexity || 3,
      suggestion_categories: config.suggestion_categories || [],
      escalation_required: config.escalation_required || false,
      auto_approve_threshold: config.auto_approve_threshold || 2,
      max_suggestions_per_validation: config.max_suggestions_per_validation || 3,
      suggestion_filters: config.suggestion_filters || {},
      custom: true
    };
  }

  /**
   * Validate configuration
   */
  validateConfiguration() {
    const errors = [];

    if (this.config.max_suggestion_complexity < 0 || this.config.max_suggestion_complexity > 10) {
      errors.push('max_suggestion_complexity must be between 0 and 10');
    }

    if (!Array.isArray(this.config.suggestion_categories)) {
      errors.push('suggestion_categories must be an array');
    }

    const validCategories = Object.keys(FeatureSuggestionConfig.CATEGORIES);
    const invalidCategories = this.config.suggestion_categories.filter(cat =>
      !validCategories.includes(cat)
    );

    if (invalidCategories.length > 0) {
      errors.push(`Invalid suggestion categories: ${invalidCategories.join(', ')}`);
    }

    if (this.config.max_suggestions_per_validation < 0) {
      errors.push('max_suggestions_per_validation cannot be negative');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}