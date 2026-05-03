import type { Action } from '../goap/types.js';
import { PROHIBITIVE_COST } from '../goap/index.js';
import type { ErrorRecoveryContext } from './types.js';
import { normalizeErrorType } from './error-type-mapping.js';

export function buildErrorRecoveryActions(context: ErrorRecoveryContext): Action[] {
  const escalateCost = context.escalateToOperatorCost ?? 10;
  const repairDockerCost = context.circuitOpen ? PROHIBITIVE_COST : 3;

  const actions: Action[] = [
    {
      name: 'retry_with_backoff',
      preconditions: { retry_applicable: true },
      effects: { error_resolved: true },
      cost: 1,
    },
    {
      name: 'allocate_resources',
      preconditions: { error_type: 'resource', resource_available: true, budget_exhausted: false },
      effects: { error_resolved: true },
      cost: 2,
    },
    {
      name: 'repair_docker_env',
      preconditions: { error_type: 'docker', circuit_open: false },
      effects: { error_resolved: true },
      cost: repairDockerCost,
    },
    {
      name: 'switch_to_fallback_agent',
      preconditions: { fallback_available: true, budget_exhausted: false, circuit_open: false },
      effects: { error_resolved: true },
      cost: 2,
    },
    {
      name: 'escalate_to_operator',
      preconditions: {},
      effects: { error_resolved: true },
      cost: escalateCost,
    },
    {
      name: 'skip_task',
      preconditions: {},
      effects: { error_resolved: true },
      cost: 50,
    },
  ];
  return actions.sort((a, b) => a.cost - b.cost);
}

export { normalizeErrorType };
