/**
 * Scope Control System for CFN Loop Product Owner
 *
 * Provides scope boundary management, cost function calculation,
 * and scope validation for GOAP-based Product Owner decisions.
 */

export interface ScopeBoundaries {
  primary_goal: string;
  in_scope: string[];
  out_of_scope: string[];
  risk_profile: 'internal-only-low-risk' | 'public-facing-medium-risk' | 'critical-high-risk';
  decision_authority_config: {
    auto_approve_threshold: number;    // e.g., 0.90 (90% consensus)
    auto_relaunch_max_iteration: number;  // e.g., 10
    escalation_criteria: string[];
  };
}

export interface ValidatorConcern {
  validator: string;
  concern: string;
  recommendation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ScopeClassification {
  concern: ValidatorConcern;
  classification: 'in-scope' | 'out-of-scope';
  reasoning: string;
  cost_penalty: number;
}

export class ScopeControl {
  /**
   * Initialize scope boundaries at project start
   */
  static createScopeBoundaries(config: {
    primaryGoal: string;
    inScope: string[];
    outOfScope: string[];
    riskProfile: ScopeBoundaries['risk_profile'];
    autoApproveThreshold?: number;
    maxIterations?: number;
    escalationCriteria?: string[];
  }): ScopeBoundaries {
    return {
      primary_goal: config.primaryGoal,
      in_scope: config.inScope,
      out_of_scope: config.outOfScope,
      risk_profile: config.riskProfile,
      decision_authority_config: {
        auto_approve_threshold: config.autoApproveThreshold || 0.90,
        auto_relaunch_max_iteration: config.maxIterations || 10,
        escalation_criteria: config.escalationCriteria || [
          'Breaking changes to public API',
          'Security model changes affecting other systems',
          'Budget impact >$50 in single phase'
        ]
      }
    };
  }

  /**
   * Classify validator concern as in-scope or out-of-scope
   */
  static classifyConcern(
    concern: ValidatorConcern,
    scope: ScopeBoundaries
  ): ScopeClassification {
    const concernLower = concern.concern.toLowerCase();
    const recommendationLower = concern.recommendation.toLowerCase();

    // Check if concern relates to in-scope items
    const inScopeMatch = scope.in_scope.some(item =>
      concernLower.includes(item.toLowerCase()) ||
      recommendationLower.includes(item.toLowerCase())
    );

    // Check if concern relates to out-of-scope items
    const outOfScopeMatch = scope.out_of_scope.some(item =>
      concernLower.includes(item.toLowerCase()) ||
      recommendationLower.includes(item.toLowerCase())
    );

    if (outOfScopeMatch && !inScopeMatch) {
      return {
        concern,
        classification: 'out-of-scope',
        reasoning: `Recommendation involves out-of-scope items: ${scope.out_of_scope.filter(item =>
          concernLower.includes(item.toLowerCase()) ||
          recommendationLower.includes(item.toLowerCase())
        ).join(', ')}`,
        cost_penalty: 1000  // Prohibitive cost
      };
    }

    if (inScopeMatch || concern.severity === 'critical') {
      return {
        concern,
        classification: 'in-scope',
        reasoning: inScopeMatch
          ? `Relates to in-scope items: ${scope.in_scope.filter(item =>
              concernLower.includes(item.toLowerCase()) ||
              recommendationLower.includes(item.toLowerCase())
            ).join(', ')}`
          : `Critical severity requires attention regardless of explicit scope match`,
        cost_penalty: concern.severity === 'critical' ? 20 : 50
      };
    }

    // Default: treat as in-scope if unclear (safer approach)
    return {
      concern,
      classification: 'in-scope',
      reasoning: 'No explicit out-of-scope match; defaulting to in-scope for safety',
      cost_penalty: 50
    };
  }

  /**
   * Calculate GOAP action cost based on scope impact
   */
  static calculateActionCost(
    action: {
      name: string;
      baseComplexity: number;
      scopeImpact: 'maintains' | 'expands' | 'reduces';
      addressesConcerns?: ScopeClassification[];
    },
    state: {
      loop2Iteration: number;
      loop3Iteration: number;
      criticalBlockers: number;
    }
  ): number {
    let cost = action.baseComplexity * 10;

    // Scope impact (CRITICAL)
    if (action.scopeImpact === 'expands') {
      cost += 1000;  // Prohibitive (effectively blocked)
    }
    if (action.scopeImpact === 'reduces') {
      cost += 500;   // Heavily penalized
    }

    // Add penalties from addressed concerns
    if (action.addressesConcerns) {
      action.addressesConcerns.forEach(classification => {
        cost += classification.cost_penalty;
      });
    }

    // Iteration pressure (prefer faster solutions near limits)
    if (state.loop2Iteration >= 8) {
      cost *= 1.5;
    }

    // Blocker severity
    cost += state.criticalBlockers * 20;

    return Math.round(cost);
  }

  /**
   * Generate memory storage payload for scope boundaries
   */
  static generateMemoryPayload(scope: ScopeBoundaries): {
    namespace: string;
    key: string;
    value: string;
  } {
    return {
      namespace: 'scope-control',
      key: 'project-boundaries',
      value: JSON.stringify(scope)
    };
  }

  /**
   * Parse validator concerns from consensus feedback
   */
  static parseValidatorConcerns(
    validatorFeedback: Record<string, string>,
    validatorTypes: Record<string, string>
  ): ValidatorConcern[] {
    return Object.entries(validatorFeedback).map(([validator, feedback]) => {
      // Infer severity from keywords
      const feedbackLower = feedback.toLowerCase();
      let severity: ValidatorConcern['severity'] = 'medium';

      if (feedbackLower.includes('critical') ||
          feedbackLower.includes('blocker') ||
          feedbackLower.includes('security vulnerability') ||
          feedbackLower.includes('data loss')) {
        severity = 'critical';
      } else if (feedbackLower.includes('important') ||
                 feedbackLower.includes('significant') ||
                 feedbackLower.includes('must')) {
        severity = 'high';
      } else if (feedbackLower.includes('minor') ||
                 feedbackLower.includes('nice to have') ||
                 feedbackLower.includes('consider')) {
        severity = 'low';
      }

      return {
        validator,
        concern: feedback,
        recommendation: feedback,  // In simple cases, concern = recommendation
        severity
      };
    });
  }

  /**
   * Create backlog items for deferred out-of-scope concerns
   */
  static createBacklogItems(
    outOfScopeConcerns: ScopeClassification[]
  ): Array<{
    title: string;
    description: string;
    source: string;
    deferred_at: string;
    reasoning: string;
  }> {
    return outOfScopeConcerns.map(classification => ({
      title: `${classification.concern.validator}: ${classification.concern.concern.substring(0, 60)}...`,
      description: classification.concern.recommendation,
      source: classification.concern.validator,
      deferred_at: new Date().toISOString(),
      reasoning: classification.reasoning
    }));
  }

  /**
   * Validate scope boundaries structure
   */
  static validateScopeBoundaries(scope: any): scope is ScopeBoundaries {
    return (
      typeof scope === 'object' &&
      typeof scope.primary_goal === 'string' &&
      Array.isArray(scope.in_scope) &&
      Array.isArray(scope.out_of_scope) &&
      typeof scope.risk_profile === 'string' &&
      ['internal-only-low-risk', 'public-facing-medium-risk', 'critical-high-risk'].includes(scope.risk_profile) &&
      typeof scope.decision_authority_config === 'object' &&
      typeof scope.decision_authority_config.auto_approve_threshold === 'number' &&
      typeof scope.decision_authority_config.auto_relaunch_max_iteration === 'number' &&
      Array.isArray(scope.decision_authority_config.escalation_criteria)
    );
  }

  /**
   * Example scope boundaries for common scenarios
   */
  static getExampleScopes() {
    return {
      'help-system': ScopeControl.createScopeBoundaries({
        primaryGoal: 'Implement help coordinator system',
        inScope: [
          'help routing via MessageBroker',
          'agent capability matching',
          'waiting pool management',
          'state machine integration (HELPING state)'
        ],
        outOfScope: [
          'ML-based help suggestions',
          'External API integrations',
          'Advanced analytics',
          'JWT authentication',
          'OAuth providers'
        ],
        riskProfile: 'internal-only-low-risk'
      }),

      'user-auth': ScopeControl.createScopeBoundaries({
        primaryGoal: 'Build user authentication system',
        inScope: [
          'user registration and login',
          'password hashing',
          'session management',
          'basic RBAC'
        ],
        outOfScope: [
          'social login',
          'passwordless authentication',
          'advanced MFA',
          'SSO integration'
        ],
        riskProfile: 'public-facing-medium-risk',
        escalationCriteria: [
          'Changes to password storage mechanism',
          'Modifications to session token generation',
          'Security model changes'
        ]
      }),

      'payment-processing': ScopeControl.createScopeBoundaries({
        primaryGoal: 'Integrate payment processing',
        inScope: [
          'Stripe API integration',
          'payment intent creation',
          'webhook handling',
          'basic refund support'
        ],
        outOfScope: [
          'multi-currency support',
          'subscription billing',
          'split payments',
          'cryptocurrency'
        ],
        riskProfile: 'critical-high-risk',
        autoApproveThreshold: 0.95,  // Higher threshold for critical systems
        escalationCriteria: [
          'Changes to payment data handling',
          'Modifications to webhook security',
          'Budget impact >$100 in single phase',
          'PCI DSS compliance concerns'
        ]
      })
    };
  }
}

/**
 * Example usage in Product Owner agent:
 *
 * // At project start:
 * const scope = ScopeControl.createScopeBoundaries({
 *   primaryGoal: "Implement help coordinator system",
 *   inScope: ["help routing", "agent matching"],
 *   outOfScope: ["ML features", "external APIs"],
 *   riskProfile: "internal-only-low-risk"
 * });
 *
 * // Store in memory:
 * const payload = ScopeControl.generateMemoryPayload(scope);
 * await memoryUsage({
 *   action: "store",
 *   namespace: payload.namespace,
 *   key: payload.key,
 *   value: payload.value
 * });
 *
 * // In Product Owner decision:
 * const concerns = ScopeControl.parseValidatorConcerns(validatorFeedback);
 * const classifications = concerns.map(c =>
 *   ScopeControl.classifyConcern(c, scope)
 * );
 *
 * const inScopeConcerns = classifications.filter(c => c.classification === 'in-scope');
 * const outOfScopeConcerns = classifications.filter(c => c.classification === 'out-of-scope');
 *
 * if (outOfScopeConcerns.length > 0) {
 *   const backlogItems = ScopeControl.createBacklogItems(outOfScopeConcerns);
 *   // Defer to backlog, approve phase
 * }
 *
 * if (inScopeConcerns.length > 0) {
 *   const cost = ScopeControl.calculateActionCost({
 *     name: "relaunch_loop3",
 *     baseComplexity: 3,
 *     scopeImpact: "maintains",
 *     addressesConcerns: inScopeConcerns
 *   }, state);
 *   // PROCEED with Loop 3 relaunch
 * }
 */
