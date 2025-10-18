export type CFNMode = 'mvp' | 'standard' | 'enterprise';

export interface Decision {
  action: 'LOOP' | 'PROCEED' | 'ESCALATE';
  requestedPermission?: boolean;
  executeImmediately?: boolean;
  iteration?: number;
  phaseId?: string;
  reason?: string;
  targetedFixes?: string[];
}

export interface CFNContext {
  mode: CFNMode;
  iteration: number;
  consensus: number;
  phaseId?: string;
  concerns?: string[];
}

export interface ValidationResult {
  valid: boolean;
  decision?: Decision;
  violations?: Violation[];
  corrected?: boolean;
}

export interface Violation {
  rule: string;
  priority: 'critical' | 'high' | 'medium';
  violation: string;
  suggestedFix?: string;
}

export function getModeMaxIterations(mode: CFNMode): number {
  switch (mode) {
    case 'mvp':
      return 5;
    case 'standard':
      return 10;
    case 'enterprise':
      return 15;
  }
}

export function getModeThreshold(mode: CFNMode): number {
  switch (mode) {
    case 'mvp':
      return 0.85;
    case 'standard':
      return 0.9;
    case 'enterprise':
      return 0.95;
  }
}

export interface ValidationRule {
  name: string;
  validate: (decision: Decision, context: CFNContext) => ValidationResult;
  priority: 'critical' | 'high' | 'medium';
  autoCorrect?: (decision: Decision, context: CFNContext) => Decision;
}

export const VALIDATION_RULES: ValidationRule[] = [
  {
    name: 'LOOP without permission check',
    priority: 'critical',
    validate: (decision, context) => {
      if (decision.action === 'LOOP' && decision.requestedPermission) {
        return {
          valid: false,
          violations: [
            {
              rule: 'LOOP without permission check',
              priority: 'critical',
              violation: 'LOOP decision MUST NOT request permission',
              suggestedFix:
                'Remove permission request, spawn workers immediately',
            },
          ],
        };
      }
      return { valid: true };
    },
    autoCorrect: (decision) => ({
      ...decision,
      requestedPermission: false,
      executeImmediately: true,
    }),
  },
  {
    name: 'Iteration limit enforcement',
    priority: 'critical',
    validate: (decision, context) => {
      const maxIter = getModeMaxIterations(context.mode);
      if (context.iteration >= maxIter && decision.action !== 'ESCALATE') {
        return {
          valid: false,
          violations: [
            {
              rule: 'Iteration limit enforcement',
              priority: 'critical',
              violation: `Max iterations (${maxIter}) reached. MUST ESCALATE`,
              suggestedFix: 'Change decision to ESCALATE',
            },
          ],
        };
      }
      return { valid: true };
    },
    autoCorrect: (decision, context) => ({
      action: 'ESCALATE',
      reason: `Max iterations (${context.iteration}) exceeded`,
      iteration: context.iteration,
    }),
  },
  {
    name: 'Consensus threshold alignment',
    priority: 'high',
    validate: (decision, context) => {
      const threshold = getModeThreshold(context.mode);
      const violations: Violation[] = [];

      if (context.consensus >= threshold && decision.action === 'LOOP') {
        violations.push({
          rule: 'Consensus threshold alignment',
          priority: 'high',
          violation: `Consensus ${context.consensus} >= threshold ${threshold}. Should PROCEED`,
          suggestedFix: 'Change decision to PROCEED',
        });
      }

      if (
        context.consensus < threshold &&
        decision.action === 'PROCEED' &&
        context.iteration < getModeMaxIterations(context.mode)
      ) {
        violations.push({
          rule: 'Consensus threshold alignment',
          priority: 'high',
          violation: `Consensus ${context.consensus} < threshold ${threshold}. Should LOOP`,
          suggestedFix: 'Change decision to LOOP',
        });
      }

      return violations.length > 0
        ? { valid: false, violations }
        : { valid: true };
    },
    autoCorrect: (decision, context) => {
      const threshold = getModeThreshold(context.mode);
      if (context.consensus >= threshold) {
        return { action: 'PROCEED', phaseId: context.phaseId };
      } else {
        return { action: 'LOOP', targetedFixes: context.concerns || [] };
      }
    },
  },
];
