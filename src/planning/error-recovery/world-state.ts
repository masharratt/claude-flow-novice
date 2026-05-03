import type { WorldState } from '../goap/types.js';
import type { ErrorRecoveryContext } from './types.js';
import { normalizeErrorType } from './error-type-mapping.js';

function computeRetryApplicable(context: ErrorRecoveryContext): boolean {
  const normalized = normalizeErrorType(context.errorType);
  if (context.circuitOpen || context.budgetExhausted) return false;
  if (normalized === 'docker') return false;
  if (normalized === 'resource' && context.resourceAvailable && context.attemptCount > 0) return false;
  if (context.fallbackAvailable && context.attemptCount >= 2) return false;
  return true;
}

export function buildErrorRecoveryState(context: ErrorRecoveryContext): WorldState {
  return Object.freeze({
    error_type: normalizeErrorType(context.errorType),
    attempt_count: context.attemptCount,
    budget_exhausted: context.budgetExhausted,
    circuit_open: context.circuitOpen,
    resource_available: context.resourceAvailable,
    fallback_available: context.fallbackAvailable,
    retry_applicable: computeRetryApplicable(context),
    error_resolved: false,
  });
}
