import {
  VALIDATION_RULES,
  Decision,
  CFNContext,
  ValidationResult,
  Violation,
} from './validation-rules.js';

export async function validateCFNDecision(
  decision: Decision,
  context: CFNContext
): Promise<ValidationResult> {
  const violations: Violation[] = [];

  // New sprint-specific validations
  const iterationLimitMap = {
    'mvp': 5,
    'standard': 10,
    'enterprise': 15
  };

  const consensusThresholdMap = {
    'mvp': 0.85,
    'standard': 0.90,
    'enterprise': 0.95
  };

  // Iteration limit validation
  const maxIterations = iterationLimitMap[context.mode] || 10;
  if (context.iteration > maxIterations) {
    violations.push({
      rule: 'Iteration Limit Exceeded',
      description: `Max iterations (${maxIterations}) exceeded for ${context.mode} mode`,
      priority: 'critical'
    });
  }

  // Consensus threshold validation
  const minConsensus = consensusThresholdMap[context.mode] || 0.85;
  if (context.consensus < minConsensus) {
    violations.push({
      rule: 'Consensus Threshold Not Met',
      description: `Consensus ${context.consensus} below minimum ${minConsensus} for ${context.mode} mode`,
      priority: 'critical'
    });
  }

  // Existing validation rules
  for (const rule of VALIDATION_RULES) {
    const result = rule.validate(decision, context);
    if (!result.valid) {
      violations.push(...(result.violations || []));
    }
  }

  // Unexpected permission request validation
  if (decision.action === 'LOOP' && decision.requestedPermission) {
    violations.push({
      rule: 'Unexpected Permission Request',
      description: 'Unnecessary permission request during loop execution',
      priority: 'critical'
    });
  }

  if (violations.length === 0) {
    return {
      valid: true,
      decision,
      violations: [],
    };
  }

  // Auto-correct critical violations
  const criticalViolations = violations.filter(
    (v) => v.priority === 'critical'
  );
  if (criticalViolations.length > 0) {
    const correctedDecision = autoCorrectDecision(
      decision,
      context,
      violations
    );
    return {
      valid: false,
      decision: correctedDecision,
      violations,
      corrected: true,
    };
  }

  return {
    valid: false,
    decision,
    violations,
  };
}

function autoCorrectDecision(
  decision: Decision,
  context: CFNContext,
  violations: Violation[]
): Decision {
  let corrected = { ...decision };

  for (const violation of violations) {
    if (violation.priority === 'critical') {
      switch (violation.rule) {
        case 'Iteration Limit Exceeded':
          corrected.action = 'TERMINATE';
          corrected.terminationReason = 'Maximum iterations exceeded';
          break;
        case 'Consensus Threshold Not Met':
          corrected.action = 'REITERATE';
          corrected.reiterationReason = 'Insufficient consensus';
          break;
        case 'Unexpected Permission Request':
          corrected.requestedPermission = false;
          corrected.executeImmediately = true;
          break;
        default:
          const rule = VALIDATION_RULES.find((r) => r.name === violation.rule);
          if (rule?.autoCorrect) {
            corrected = rule.autoCorrect(corrected, context);
          }
      }
    }
  }

  corrected.correctionSource = 'CFNComplianceMonitor';
  return corrected;
}