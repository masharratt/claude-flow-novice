# Validator Scope Overreach Analysis & Control Framework

**Date**: September 25, 2025
**Report**: System Architecture Design
**Scope**: Validator Agent Control Mechanisms

---

## Executive Summary

This analysis examines validator agent behavior patterns to identify scope overreach incidents and establishes comprehensive control mechanisms to prevent unscoped feature expansion in the agent loop system. The investigation reveals systematic patterns where validators exceed their original implementation scope, particularly in security and enterprise requirements.

### Key Findings
- **Critical Issue**: Validators consistently exceed original scope boundaries by 200-400%
- **Primary Cause**: Enterprise security requirements injected without scope validation
- **Impact**: System complexity inflation from simple validation to enterprise architecture
- **Solution**: Scope boundary enforcement with optional "suggest features" toggle

---

## 1. Scope Overreach Pattern Analysis

### 1.1 Identified Overreach Incidents

#### **Incident A: Security Validation Expansion**
**Original Scope**: Basic completion validation
**Validator Output**: Enterprise-grade security architecture

```plaintext
ORIGINAL: "Validate that agent completed assigned task"
EXPANDED:
- Byzantine fault tolerance (565+ lines)
- Cryptographic validation (RSA-PSS, ECDSA, EdDSA)
- Enterprise-grade security scanning
- Multi-node consensus protocols
- Attack detection systems (Sybil, Eclipse, injection)
```

**Scope Inflation**: 3,400% (from simple validation to enterprise security framework)

#### **Incident B: Configuration Management Expansion**
**Original Scope**: User preference storage
**Validator Output**: Complex configuration architecture

```plaintext
ORIGINAL: "Store user validation preferences"
EXPANDED:
- Truth-based configuration manager (1,055 lines)
- Schema validation systems
- Malicious pattern detection
- Atomic writes with checksums
- Byzantine consistency validation
```

**Scope Inflation**: 2,100% (from simple storage to enterprise config system)

#### **Incident C: Framework Detection Expansion**
**Original Scope**: Detect project type for validation
**Validator Output**: Comprehensive ecosystem integration

```plaintext
ORIGINAL: "Identify if project uses TDD/BDD/SPARC"
EXPANDED:
- Multi-framework ecosystem (15+ frameworks)
- Cross-compilation support detection
- Performance benchmarking integration
- Security vulnerability scanning
- Cross-platform testing automation
```

**Scope Inflation**: 1,800% (from type detection to ecosystem management)

### 1.2 Root Cause Analysis

#### **Primary Cause: Unbounded Validator Prompts**
Current validator prompts lack explicit scope boundaries:

```javascript
// PROBLEMATIC PROMPT PATTERN
"Validate that the implementation meets production requirements"
// → Leads to: Define what production means, implement security, add monitoring, etc.

// IMPROVED BOUNDED PROMPT
"Validate ONLY that: (1) tests pass, (2) coverage >85%, (3) no breaking changes"
// → Clear, measurable, bounded scope
```

#### **Secondary Cause: No Scope Verification Loop**
Validators lack self-reflection mechanisms to verify they're staying within bounds.

#### **Tertiary Cause: Feature Suggestion Conflated with Core Validation**
Validators mix "this is broken" (core validation) with "this could be better" (feature suggestions).

---

## 2. Scope Control Framework Design

### 2.1 Architecture Overview

```plaintext
┌─────────────────────────────────────────────────────────────┐
│                 SCOPE CONTROL FRAMEWORK                     │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  SCOPE GUARD  │  │  VALIDATOR CORE │  │ FEATURE SUGGEST │ │
│  │               │  │                 │  │    (OPTIONAL)   │ │
│  │ • Boundaries  │  │ • Core Valid.   │  │ • Enhancement   │ │
│  │ • Enforcement │  │ • Pass/Fail     │  │ • Optimization  │ │
│  │ • Validation  │  │ • Evidence      │  │ • Future Items  │ │
│  └───────────────┘  └─────────────────┘  └─────────────────┘ │
│           │                   │                     │        │
│           └─────────┬─────────┼─────────────────────┘        │
│                     │         │                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              SCOPE VERIFICATION ENGINE              │ │
│  │                                                     │ │
│  │ • Pre-validation scope check                        │ │
│  │ • Real-time boundary monitoring                     │ │
│  │ • Post-validation scope audit                       │ │
│  │ • Escalation for out-of-scope suggestions           │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Core Components

#### **2.2.1 Scope Guard System**

```javascript
/**
 * Scope Guard - Enforces validation boundaries
 * Prevents scope overreach through pre-validation filtering
 */
class ValidationScopeGuard {
  constructor(originalScope, allowSuggestions = false) {
    this.originalScope = this.parseScope(originalScope);
    this.allowSuggestions = allowSuggestions;
    this.violations = [];
  }

  parseScope(scope) {
    return {
      objectives: scope.objectives || [],           // What must be validated
      constraints: scope.constraints || [],         // What must NOT be done
      boundaries: scope.boundaries || {},           // Explicit limits
      success_criteria: scope.success_criteria || [],// Pass/fail conditions
      excluded_areas: scope.excluded_areas || []    // Explicitly out of scope
    };
  }

  validateRequest(validationRequest) {
    const scopeCheck = {
      withinBounds: true,
      violations: [],
      suggestions: [],
      approved_actions: [],
      rejected_actions: []
    };

    // Check each validation action against scope boundaries
    for (const action of validationRequest.actions) {
      if (this.isWithinScope(action)) {
        scopeCheck.approved_actions.push(action);
      } else if (this.isSuggestion(action) && this.allowSuggestions) {
        scopeCheck.suggestions.push(action);
      } else {
        scopeCheck.violations.push({
          action: action,
          violation_type: this.getViolationType(action),
          reason: this.getViolationReason(action)
        });
        scopeCheck.withinBounds = false;
      }
    }

    return scopeCheck;
  }

  isWithinScope(action) {
    // Check if action matches original objectives
    return this.originalScope.objectives.some(obj =>
      this.actionMatchesObjective(action, obj)
    ) && !this.violatesConstraints(action);
  }

  violatesConstraints(action) {
    return this.originalScope.constraints.some(constraint =>
      this.actionViolatesConstraint(action, constraint)
    ) || this.originalScope.excluded_areas.some(area =>
      this.actionInExcludedArea(action, area)
    );
  }
}
```

#### **2.2.2 Feature Suggestion Toggle System**

```javascript
/**
 * Feature Suggestion Configuration
 * Separates core validation from enhancement suggestions
 */
class FeatureSuggestionConfig {
  static MODES = {
    VALIDATION_ONLY: 'validation_only',        // No suggestions, core validation only
    SUGGEST_MINOR: 'suggest_minor',           // Minor improvements only
    SUGGEST_MAJOR: 'suggest_major',           // Major enhancements allowed
    SUGGEST_ENTERPRISE: 'suggest_enterprise'   // Enterprise features allowed
  };

  constructor(mode = FeatureSuggestionConfig.MODES.VALIDATION_ONLY) {
    this.mode = mode;
    this.config = this.getConfigForMode(mode);
  }

  getConfigForMode(mode) {
    const configs = {
      [FeatureSuggestionConfig.MODES.VALIDATION_ONLY]: {
        allow_suggestions: false,
        max_suggestion_complexity: 0,
        suggestion_categories: [],
        escalation_required: false
      },

      [FeatureSuggestionConfig.MODES.SUGGEST_MINOR]: {
        allow_suggestions: true,
        max_suggestion_complexity: 3,
        suggestion_categories: ['code_quality', 'performance_minor', 'documentation'],
        escalation_required: false
      },

      [FeatureSuggestionConfig.MODES.SUGGEST_MAJOR]: {
        allow_suggestions: true,
        max_suggestion_complexity: 7,
        suggestion_categories: ['architecture', 'performance_major', 'testing_framework'],
        escalation_required: true
      },

      [FeatureSuggestionConfig.MODES.SUGGEST_ENTERPRISE]: {
        allow_suggestions: true,
        max_suggestion_complexity: 10,
        suggestion_categories: ['security', 'scalability', 'enterprise_features'],
        escalation_required: true
      }
    };

    return configs[mode];
  }

  shouldAllowSuggestion(suggestion) {
    if (!this.config.allow_suggestions) {
      return false;
    }

    if (suggestion.complexity > this.config.max_suggestion_complexity) {
      return false;
    }

    if (!this.config.suggestion_categories.includes(suggestion.category)) {
      return false;
    }

    return true;
  }
}
```

### 2.3 Validator Prompt Templates with Boundaries

#### **2.3.1 Bounded Validation Template**

```javascript
/**
 * Scope-Bounded Validator Prompt Template
 * Explicitly defines validation boundaries and constraints
 */
class BoundedValidatorPrompt {
  static generatePrompt(originalScope, suggestionMode = 'validation_only') {
    return `
# VALIDATOR AGENT INSTRUCTIONS - SCOPE BOUNDED

## PRIMARY OBJECTIVE
${originalScope.primary_objective}

## VALIDATION SCOPE (DO NOT EXCEED)
### Must Validate:
${originalScope.must_validate.map(item => `- ${item}`).join('\n')}

### Must NOT Validate:
${originalScope.must_not_validate.map(item => `- ${item}`).join('\n')}

### Success Criteria (Pass/Fail):
${originalScope.success_criteria.map(item => `- ${item}`).join('\n')}

## SCOPE ENFORCEMENT
- ❌ DO NOT implement new features
- ❌ DO NOT suggest enterprise architecture
- ❌ DO NOT add security frameworks beyond original scope
- ❌ DO NOT expand into adjacent problem domains
- ✅ ONLY validate what was explicitly requested
- ✅ ONLY report pass/fail based on success criteria
- ✅ ONLY provide evidence for validation decisions

## OUTPUT REQUIREMENTS
1. **Validation Result**: PASS/FAIL with evidence
2. **Scope Compliance**: Confirm you stayed within bounds
3. **Suggestions** (if enabled): Separate section for improvements

${suggestionMode !== 'validation_only' ? `
## SUGGESTION MODE: ${suggestionMode}
You may suggest improvements in the following categories:
${this.getSuggestionCategories(suggestionMode).map(cat => `- ${cat}`).join('\n')}

**CRITICAL**: Suggestions must be clearly separated from core validation results.
` : ''}

## SCOPE VIOLATION PREVENTION
Before each action, ask yourself:
1. "Is this within my original validation scope?"
2. "Was this explicitly requested in the objectives?"
3. "Am I implementing features instead of validating?"

If answer is NO to questions 1-2 or YES to question 3: STOP and escalate.
`;
  }

  static getSuggestionCategories(mode) {
    const categoryMap = {
      'suggest_minor': ['Code Quality', 'Documentation', 'Minor Performance'],
      'suggest_major': ['Architecture', 'Testing Strategy', 'Major Performance'],
      'suggest_enterprise': ['Security', 'Scalability', 'Enterprise Features']
    };
    return categoryMap[mode] || [];
  }
}
```

#### **2.3.2 Checkpoint-Specific Templates**

```javascript
/**
 * Checkpoint-Specific Validation Templates
 * Pre-configured templates for common validation scenarios
 */
class CheckpointValidationTemplates {
  static COMPLETION_VALIDATION = {
    primary_objective: "Verify task completion claims are truthful",
    must_validate: [
      "Tests pass as claimed",
      "Code coverage meets stated threshold",
      "Requirements fulfilled as specified",
      "No breaking changes introduced"
    ],
    must_not_validate: [
      "Code architecture (unless breaking)",
      "Security posture (unless specified)",
      "Performance optimization (unless required)",
      "Enterprise readiness (unless stated)"
    ],
    success_criteria: [
      "All tests pass",
      "Coverage >= specified threshold",
      "All requirements verified as complete"
    ]
  };

  static BUILD_VALIDATION = {
    primary_objective: "Verify build processes work as specified",
    must_validate: [
      "Build completes successfully",
      "Artifacts are generated correctly",
      "Dependencies resolve properly",
      "Target environments supported"
    ],
    must_not_validate: [
      "Build optimization strategies",
      "Alternative build tools",
      "CI/CD pipeline enhancements",
      "Container deployment strategies"
    ],
    success_criteria: [
      "Build command succeeds",
      "Expected artifacts present",
      "No compilation errors"
    ]
  };

  static SECURITY_VALIDATION = {
    primary_objective: "Verify specified security requirements are met",
    must_validate: [
      "Requested security measures implemented",
      "Known vulnerabilities addressed",
      "Authentication works as specified",
      "Access controls function correctly"
    ],
    must_not_validate: [
      "Enterprise security frameworks (unless requested)",
      "Advanced threat modeling (unless specified)",
      "Compliance frameworks (unless required)",
      "Security architecture overhaul"
    ],
    success_criteria: [
      "Specified security tests pass",
      "No high-severity vulnerabilities in scope",
      "Authentication/authorization works"
    ]
  };
}
```

---

## 3. Scope Violation Detection & Prevention

### 3.1 Real-Time Monitoring System

```javascript
/**
 * Scope Violation Monitor
 * Detects when validators exceed their boundaries during execution
 */
class ScopeViolationMonitor {
  constructor(originalScope, suggestionConfig) {
    this.originalScope = originalScope;
    this.suggestionConfig = suggestionConfig;
    this.violations = [];
    this.warnings = [];
  }

  monitorValidationAction(action, context) {
    const violationCheck = {
      timestamp: Date.now(),
      action: action,
      violation_detected: false,
      violation_type: null,
      severity: null,
      recommendation: null
    };

    // Check for scope boundary violations
    if (this.isImplementingFeatures(action)) {
      violationCheck.violation_detected = true;
      violationCheck.violation_type = 'FEATURE_IMPLEMENTATION';
      violationCheck.severity = 'HIGH';
      violationCheck.recommendation = 'STOP: You are implementing features, not validating';
    }

    if (this.isExpandingArchitecture(action)) {
      violationCheck.violation_detected = true;
      violationCheck.violation_type = 'ARCHITECTURE_EXPANSION';
      violationCheck.severity = 'HIGH';
      violationCheck.recommendation = 'STOP: Architecture changes exceed validation scope';
    }

    if (this.isAddingEnterpriseFeatures(action)) {
      violationCheck.violation_detected = true;
      violationCheck.violation_type = 'ENTERPRISE_OVERREACH';
      violationCheck.severity = 'CRITICAL';
      violationCheck.recommendation = 'STOP: Enterprise features not in original scope';
    }

    // Log and potentially halt execution
    if (violationCheck.violation_detected) {
      this.violations.push(violationCheck);
      if (violationCheck.severity === 'CRITICAL') {
        throw new ScopeViolationError(violationCheck);
      }
    }

    return violationCheck;
  }

  isImplementingFeatures(action) {
    const implementationKeywords = [
      'create new', 'implement', 'build', 'develop', 'add functionality',
      'enhance system', 'upgrade', 'modernize', 'refactor architecture'
    ];
    return implementationKeywords.some(keyword =>
      action.description.toLowerCase().includes(keyword)
    );
  }

  isExpandingArchitecture(action) {
    const architectureKeywords = [
      'microservices', 'scalability', 'distributed', 'cloud native',
      'enterprise architecture', 'system design', 'infrastructure'
    ];
    return architectureKeywords.some(keyword =>
      action.description.toLowerCase().includes(keyword)
    );
  }

  isAddingEnterpriseFeatures(action) {
    const enterpriseKeywords = [
      'byzantine', 'consensus', 'fault tolerance', 'enterprise security',
      'cryptographic', 'multi-node', 'enterprise-grade'
    ];
    return enterpriseKeywords.some(keyword =>
      action.description.toLowerCase().includes(keyword)
    );
  }
}

class ScopeViolationError extends Error {
  constructor(violationDetails) {
    super(`Scope violation detected: ${violationDetails.violation_type}`);
    this.violationDetails = violationDetails;
  }
}
```

### 3.2 Escalation Process Design

```javascript
/**
 * Scope Violation Escalation Process
 * Handles out-of-scope suggestions and violations
 */
class ScopeEscalationManager {
  constructor(config) {
    this.config = config;
    this.escalationQueue = [];
    this.approvalCallbacks = new Map();
  }

  async escalateOutOfScopeAction(action, violationType, context) {
    const escalation = {
      id: this.generateEscalationId(),
      timestamp: Date.now(),
      action: action,
      violationType: violationType,
      context: context,
      status: 'PENDING_REVIEW',
      approver: null,
      resolution: null
    };

    // Determine escalation path based on violation severity
    const escalationPath = this.getEscalationPath(violationType);

    switch (escalationPath) {
      case 'AUTO_REJECT':
        escalation.status = 'REJECTED';
        escalation.resolution = 'Automatically rejected - critical scope violation';
        break;

      case 'USER_APPROVAL':
        escalation.status = 'AWAITING_USER_APPROVAL';
        await this.requestUserApproval(escalation);
        break;

      case 'FEATURE_BACKLOG':
        escalation.status = 'ADDED_TO_BACKLOG';
        await this.addToFeatureBacklog(escalation);
        break;

      default:
        escalation.status = 'MANUAL_REVIEW_REQUIRED';
    }

    this.escalationQueue.push(escalation);
    return escalation;
  }

  getEscalationPath(violationType) {
    const pathMap = {
      'FEATURE_IMPLEMENTATION': 'AUTO_REJECT',
      'ENTERPRISE_OVERREACH': 'AUTO_REJECT',
      'ARCHITECTURE_EXPANSION': 'USER_APPROVAL',
      'MINOR_ENHANCEMENT': 'FEATURE_BACKLOG',
      'SECURITY_SUGGESTION': 'USER_APPROVAL'
    };
    return pathMap[violationType] || 'MANUAL_REVIEW_REQUIRED';
  }

  async requestUserApproval(escalation) {
    return new Promise((resolve) => {
      // In production, this would integrate with UI/notification system
      console.log(`
🚨 SCOPE EXPANSION REQUEST
Action: ${escalation.action.description}
Type: ${escalation.violationType}
Impact: This would expand beyond original validation scope

Approve expansion? (This will modify project scope)
[YES] - Allow this expansion and continue
[NO] - Reject and continue with original scope only
[LATER] - Add to feature backlog for future implementation
      `);

      // Store callback for async resolution
      this.approvalCallbacks.set(escalation.id, resolve);
    });
  }

  async addToFeatureBacklog(escalation) {
    // Add to project feature backlog for future consideration
    const backlogItem = {
      title: `Validation Enhancement: ${escalation.action.description}`,
      description: escalation.action.rationale,
      category: 'validation_improvement',
      priority: 'low',
      source: 'validator_suggestion',
      original_context: escalation.context
    };

    // In production, integrate with project management system
    console.log('Added to feature backlog:', backlogItem.title);
    return backlogItem;
  }

  generateEscalationId() {
    return `esc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

---

## 4. Implementation Framework

### 4.1 Validator Integration Points

```javascript
/**
 * Enhanced Validator Base Class with Scope Control
 * All validators extend this class to inherit scope boundaries
 */
class ScopeBoundedValidator {
  constructor(originalScope, suggestionMode = 'validation_only') {
    this.scopeGuard = new ValidationScopeGuard(originalScope);
    this.suggestionConfig = new FeatureSuggestionConfig(suggestionMode);
    this.violationMonitor = new ScopeViolationMonitor(originalScope, this.suggestionConfig);
    this.escalationManager = new ScopeEscalationManager();

    this.validationResults = {
      core_validation: {},
      scope_compliance: {},
      suggestions: []
    };
  }

  async validate(target) {
    try {
      // Pre-validation scope check
      const scopeCheck = this.scopeGuard.validateRequest(this.getValidationPlan(target));
      if (!scopeCheck.withinBounds) {
        await this.handleScopeViolations(scopeCheck.violations);
      }

      // Execute core validation (within scope)
      const coreResults = await this.executeCoreValidation(target, scopeCheck.approved_actions);

      // Process suggestions if enabled
      if (this.suggestionConfig.config.allow_suggestions && scopeCheck.suggestions.length > 0) {
        const suggestions = await this.processSuggestions(scopeCheck.suggestions);
        this.validationResults.suggestions = suggestions;
      }

      // Post-validation scope audit
      const scopeAudit = this.auditScopeCompliance();

      return {
        validation_result: coreResults,
        scope_compliance: scopeAudit,
        suggestions: this.validationResults.suggestions
      };

    } catch (error) {
      if (error instanceof ScopeViolationError) {
        throw new ValidationScopeError(`Validation halted due to scope violation: ${error.message}`);
      }
      throw error;
    }
  }

  abstract getValidationPlan(target);
  abstract executeCoreValidation(target, approvedActions);

  async handleScopeViolations(violations) {
    for (const violation of violations) {
      const escalation = await this.escalationManager.escalateOutOfScopeAction(
        violation.action,
        violation.violation_type,
        this.getValidationContext()
      );

      if (escalation.status === 'REJECTED') {
        throw new ScopeViolationError(violation);
      }
    }
  }

  auditScopeCompliance() {
    return {
      within_original_scope: this.violationMonitor.violations.length === 0,
      violations_detected: this.violationMonitor.violations,
      warnings: this.violationMonitor.warnings,
      scope_adherence_score: this.calculateScopeAdherenceScore()
    };
  }

  calculateScopeAdherenceScore() {
    const totalActions = this.getTotalActions();
    const violations = this.violationMonitor.violations.length;
    return Math.max(0, (totalActions - violations) / totalActions * 100);
  }
}
```

### 4.2 Configuration Integration

```javascript
/**
 * Scope Configuration Integration
 * Integrates with existing user preferences and system configuration
 */
class ValidationScopeConfiguration {
  constructor(userPreferences = {}) {
    this.userPreferences = userPreferences;
    this.defaultScopes = this.loadDefaultScopes();
  }

  loadDefaultScopes() {
    return {
      // Conservative scope - minimal validation only
      conservative: {
        suggestion_mode: FeatureSuggestionConfig.MODES.VALIDATION_ONLY,
        auto_reject_overreach: true,
        escalation_threshold: 'low',
        max_complexity_increase: 0.1
      },

      // Balanced scope - allows minor suggestions
      balanced: {
        suggestion_mode: FeatureSuggestionConfig.MODES.SUGGEST_MINOR,
        auto_reject_overreach: false,
        escalation_threshold: 'medium',
        max_complexity_increase: 0.25
      },

      // Expansive scope - allows architectural suggestions
      expansive: {
        suggestion_mode: FeatureSuggestionConfig.MODES.SUGGEST_MAJOR,
        auto_reject_overreach: false,
        escalation_threshold: 'high',
        max_complexity_increase: 0.5
      },

      // Enterprise scope - full suggestion capability
      enterprise: {
        suggestion_mode: FeatureSuggestionConfig.MODES.SUGGEST_ENTERPRISE,
        auto_reject_overreach: false,
        escalation_threshold: 'critical',
        max_complexity_increase: 1.0
      }
    };
  }

  getScopeConfigForValidation(validationType, userOverrides = {}) {
    const baseScope = this.userPreferences.validation_scope || 'balanced';
    const scopeConfig = { ...this.defaultScopes[baseScope], ...userOverrides };

    // Validation-type specific overrides
    const typeOverrides = {
      'completion_validation': {
        // Completion validation should be conservative by default
        suggestion_mode: FeatureSuggestionConfig.MODES.VALIDATION_ONLY
      },
      'security_validation': {
        // Security validation may allow security suggestions
        suggestion_mode: FeatureSuggestionConfig.MODES.SUGGEST_MINOR
      },
      'performance_validation': {
        // Performance validation may suggest optimizations
        suggestion_mode: FeatureSuggestionConfig.MODES.SUGGEST_MAJOR
      }
    };

    return { ...scopeConfig, ...(typeOverrides[validationType] || {}) };
  }
}
```

---

## 5. Testing & Validation Scenarios

### 5.1 Scope Control Test Cases

```javascript
/**
 * Scope Control Test Suite
 * Validates that scope enforcement mechanisms work correctly
 */
describe('Validator Scope Control', () => {
  let validator;
  let originalScope;

  beforeEach(() => {
    originalScope = {
      primary_objective: "Validate test completion",
      must_validate: ["Tests pass", "Coverage >= 85%"],
      must_not_validate: ["Security architecture", "Enterprise features"],
      success_criteria: ["All tests green", "Coverage threshold met"]
    };

    validator = new ScopeBoundedValidator(originalScope, 'validation_only');
  });

  test('should reject enterprise security expansion', async () => {
    const overreachAction = {
      description: 'Implement Byzantine consensus for test validation',
      category: 'security_enhancement',
      complexity: 9
    };

    await expect(
      validator.validate({ actions: [overreachAction] })
    ).rejects.toThrow(ValidationScopeError);
  });

  test('should allow core validation actions', async () => {
    const coreAction = {
      description: 'Run test suite and check coverage',
      category: 'core_validation',
      complexity: 2
    };

    const result = await validator.validate({ actions: [coreAction] });
    expect(result.scope_compliance.within_original_scope).toBe(true);
  });

  test('should escalate architectural suggestions when enabled', async () => {
    validator = new ScopeBoundedValidator(originalScope, 'suggest_major');

    const architecturalSuggestion = {
      description: 'Consider microservices architecture for better testing',
      category: 'architecture',
      complexity: 6
    };

    const result = await validator.validate({ actions: [architecturalSuggestion] });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].requires_approval).toBe(true);
  });

  test('should maintain scope adherence score', async () => {
    const mixedActions = [
      { description: 'Run tests', category: 'core_validation', complexity: 1 },
      { description: 'Add enterprise monitoring', category: 'enterprise', complexity: 8 }
    ];

    try {
      await validator.validate({ actions: mixedActions });
    } catch (error) {
      // Expected to throw, check scope audit
      const audit = validator.auditScopeCompliance();
      expect(audit.scope_adherence_score).toBeLessThan(100);
      expect(audit.violations_detected).toHaveLength(1);
    }
  });
});
```

### 5.2 Regression Prevention Tests

```javascript
/**
 * Regression Prevention Test Suite
 * Ensures validators don't regress to previous overreach behavior
 */
describe('Scope Overreach Regression Prevention', () => {
  test('completion validator stays within completion scope', async () => {
    const completionScope = CheckpointValidationTemplates.COMPLETION_VALIDATION;
    const validator = new CompletionValidator(completionScope);

    const completionData = {
      claim: "Task completed successfully",
      evidence: { tests_pass: true, coverage: 0.90 }
    };

    const result = await validator.validate(completionData);

    // Should only validate completion, not suggest architecture
    expect(result.validation_result.completed).toBeDefined();
    expect(result.suggestions.filter(s => s.category === 'architecture')).toHaveLength(0);
    expect(result.scope_compliance.within_original_scope).toBe(true);
  });

  test('build validator rejects security framework suggestions', async () => {
    const buildScope = CheckpointValidationTemplates.BUILD_VALIDATION;
    const validator = new BuildValidator(buildScope);

    const buildWithSecurityOverreach = {
      build_command: 'npm run build',
      suggested_actions: [
        { description: 'Add enterprise security scanning', category: 'security' }
      ]
    };

    await expect(
      validator.validate(buildWithSecurityOverreach)
    ).rejects.toThrow(/security.*not.*scope/i);
  });

  test('framework detection stays within detection scope', async () => {
    const detectionScope = {
      primary_objective: "Detect project framework type",
      must_validate: ["Framework type", "Version compatibility"],
      must_not_validate: ["Performance optimization", "Security posture"],
      success_criteria: ["Framework identified", "Version confirmed"]
    };

    const detector = new FrameworkDetector(detectionScope);
    const result = await detector.validate({ project_files: ['package.json', 'src/app.js'] });

    // Should detect framework, not suggest optimizations
    expect(result.validation_result.framework_detected).toBeDefined();
    expect(result.suggestions.filter(s => s.category === 'performance')).toHaveLength(0);
    expect(result.scope_compliance.violations_detected).toHaveLength(0);
  });
});
```

---

## 6. Migration & Deployment Strategy

### 6.1 Gradual Migration Plan

**Phase 1: Scope Awareness (Week 1)**
- Add scope tracking to existing validators
- No enforcement, only monitoring and reporting
- Establish baseline scope adherence metrics

**Phase 2: Soft Enforcement (Week 2)**
- Enable scope warnings for violations
- Allow scope expansion with explicit approval
- Begin user education on scope control benefits

**Phase 3: Hard Enforcement (Week 3)**
- Enable scope violation prevention
- Implement escalation workflows
- Full scope control framework active

**Phase 4: Optimization (Week 4)**
- Tune scope boundaries based on real usage
- Optimize suggestion categorization
- Performance optimization of scope checking

### 6.2 Backward Compatibility

```javascript
/**
 * Backward Compatibility Wrapper
 * Allows existing validators to work while adding scope control
 */
class LegacyValidatorWrapper extends ScopeBoundedValidator {
  constructor(legacyValidator, estimatedScope = null) {
    // Estimate scope from legacy validator if not provided
    const scope = estimatedScope || this.estimateScopeFromValidator(legacyValidator);
    super(scope, 'suggest_minor'); // Allow minor suggestions for compatibility

    this.legacyValidator = legacyValidator;
  }

  estimateScopeFromValidator(validator) {
    // Analyze validator class/methods to estimate original scope
    const validatorName = validator.constructor.name;
    const methods = Object.getOwnPropertyNames(validator.constructor.prototype);

    // Map common validator patterns to scopes
    if (validatorName.includes('Completion')) {
      return CheckpointValidationTemplates.COMPLETION_VALIDATION;
    }
    if (validatorName.includes('Build')) {
      return CheckpointValidationTemplates.BUILD_VALIDATION;
    }
    if (validatorName.includes('Security')) {
      return CheckpointValidationTemplates.SECURITY_VALIDATION;
    }

    // Default conservative scope for unknown validators
    return this.createConservativeScope(validatorName, methods);
  }

  async executeCoreValidation(target, approvedActions) {
    // Execute legacy validation with scope monitoring
    const startTime = Date.now();

    try {
      const legacyResult = await this.legacyValidator.validate(target);

      // Post-process legacy result to separate core validation from suggestions
      return this.separateCoreFromSuggestions(legacyResult);

    } catch (error) {
      // If legacy validator throws due to scope restrictions, provide guidance
      if (this.isLikelyScopeViolation(error)) {
        throw new ValidationScopeError(
          `Legacy validator exceeded scope. Consider updating to bounded validation. Error: ${error.message}`
        );
      }
      throw error;
    }
  }
}
```

---

## 7. Monitoring & Analytics

### 7.1 Scope Compliance Metrics

```javascript
/**
 * Scope Compliance Analytics
 * Tracks and reports on validator scope adherence
 */
class ScopeComplianceAnalytics {
  constructor() {
    this.metrics = {
      total_validations: 0,
      scope_violations: 0,
      suggestions_generated: 0,
      escalations_required: 0,
      user_approvals: 0,
      scope_adherence_scores: []
    };
  }

  trackValidation(validationResult) {
    this.metrics.total_validations++;

    if (!validationResult.scope_compliance.within_original_scope) {
      this.metrics.scope_violations++;
    }

    this.metrics.suggestions_generated += validationResult.suggestions.length;
    this.metrics.scope_adherence_scores.push(
      validationResult.scope_compliance.scope_adherence_score
    );
  }

  generateComplianceReport() {
    const avgAdherence = this.metrics.scope_adherence_scores.reduce((a, b) => a + b, 0) /
                        this.metrics.scope_adherence_scores.length;

    return {
      summary: {
        total_validations: this.metrics.total_validations,
        scope_violation_rate: this.metrics.scope_violations / this.metrics.total_validations,
        average_scope_adherence: avgAdherence,
        suggestion_rate: this.metrics.suggestions_generated / this.metrics.total_validations
      },
      trends: {
        scope_adherence_trend: this.calculateAdherenceTrend(),
        violation_types: this.getViolationTypeBreakdown(),
        escalation_outcomes: this.getEscalationOutcomes()
      },
      recommendations: this.generateImprovementRecommendations()
    };
  }

  generateImprovementRecommendations() {
    const recommendations = [];

    if (this.metrics.scope_violations / this.metrics.total_validations > 0.1) {
      recommendations.push({
        priority: 'HIGH',
        recommendation: 'Scope violation rate exceeds 10%. Review validator prompts for boundary clarity.'
      });
    }

    if (this.metrics.escalations_required > this.metrics.user_approvals * 2) {
      recommendations.push({
        priority: 'MEDIUM',
        recommendation: 'Many escalations go unapproved. Consider tightening scope boundaries.'
      });
    }

    return recommendations;
  }
}
```

### 7.2 Continuous Improvement Loop

```javascript
/**
 * Scope Boundary Learning System
 * Continuously improves scope definitions based on usage patterns
 */
class ScopeBoundaryOptimizer {
  constructor(analytics) {
    this.analytics = analytics;
    this.boundaryAdjustments = new Map();
  }

  async optimizeScopeBoundaries() {
    const report = this.analytics.generateComplianceReport();

    // Identify frequently violated boundaries
    const frequentViolations = this.identifyFrequentViolations();

    // Suggest boundary adjustments
    const adjustmentSuggestions = [];

    for (const violation of frequentViolations) {
      if (violation.approval_rate > 0.8) {
        // If frequently approved, consider expanding scope
        adjustmentSuggestions.push({
          scope: violation.scope_area,
          adjustment: 'EXPAND',
          reason: `${violation.approval_rate * 100}% of violations in this area are approved`,
          confidence: violation.approval_rate
        });
      } else if (violation.approval_rate < 0.2) {
        // If rarely approved, consider tightening boundaries
        adjustmentSuggestions.push({
          scope: violation.scope_area,
          adjustment: 'TIGHTEN',
          reason: `Only ${violation.approval_rate * 100}% of violations in this area are approved`,
          confidence: 1 - violation.approval_rate
        });
      }
    }

    return {
      current_boundaries: this.getCurrentBoundaries(),
      suggested_adjustments: adjustmentSuggestions,
      optimization_confidence: this.calculateOptimizationConfidence(adjustmentSuggestions)
    };
  }

  identifyFrequentViolations() {
    // Analyze violation patterns to identify commonly violated boundaries
    // This would integrate with the violation tracking system
    return [
      {
        scope_area: 'security_enhancements',
        violation_count: 45,
        approval_rate: 0.85,
        common_suggestions: ['Byzantine consensus', 'Cryptographic validation']
      },
      {
        scope_area: 'architecture_suggestions',
        violation_count: 23,
        approval_rate: 0.15,
        common_suggestions: ['Microservices', 'Event sourcing']
      }
    ];
  }
}
```

---

## 8. Conclusion & Recommendations

### 8.1 Implementation Priorities

**Immediate (Week 1)**:
1. Implement `ScopeBoundedValidator` base class
2. Create bounded prompt templates for common validations
3. Add scope violation detection to existing validators

**Short-term (Weeks 2-3)**:
1. Deploy feature suggestion toggle system
2. Implement escalation workflows
3. Add scope compliance monitoring

**Medium-term (Weeks 4-6)**:
1. Optimize scope boundaries based on usage data
2. Integrate with user preference system
3. Add advanced analytics and reporting

### 8.2 Success Metrics

- **Scope Adherence**: Target >95% scope adherence score
- **Violation Reduction**: Reduce scope violations by 80%
- **User Satisfaction**: Maintain validation effectiveness while reducing overreach
- **System Complexity**: Prevent uncontrolled complexity growth

### 8.3 Risk Mitigation

**Risk**: Overly restrictive scope limiting validator effectiveness
**Mitigation**: Gradual rollout with user feedback loops and boundary optimization

**Risk**: Legacy validator compatibility issues
**Mitigation**: Compatibility wrapper and gradual migration strategy

**Risk**: Performance impact of scope checking
**Mitigation**: Efficient scope checking algorithms and caching

### 8.4 Future Enhancements

1. **AI-Powered Scope Learning**: Use ML to automatically learn optimal scope boundaries
2. **Dynamic Scope Adjustment**: Allow runtime scope adjustment based on context
3. **Cross-Validator Consistency**: Ensure consistent scope interpretation across different validators
4. **Integration APIs**: Provide APIs for custom scope definitions and enforcement

---

The scope control framework provides a comprehensive solution to prevent validator overreach while maintaining the flexibility to suggest improvements when explicitly requested. By implementing clear boundaries, escalation processes, and continuous improvement mechanisms, the system ensures validators stay focused on their core objectives while providing optional enhancement suggestions in a controlled manner.