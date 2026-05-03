import { plan } from '../goap/index.js';
import type { ErrorRecoveryContext, RecoveryAction, RecoveryPlan } from './types.js';
import { buildErrorRecoveryState } from './world-state.js';
import { buildErrorRecoveryActions } from './actions.js';
import { errorRecoveryGoal } from './goals.js';

export function planErrorRecovery(context: ErrorRecoveryContext): RecoveryPlan {
  const state = buildErrorRecoveryState(context);
  const actions = buildErrorRecoveryActions(context);
  const result = plan(state, errorRecoveryGoal, actions, { maxIterations: 50 });

  if (!result.reachable || result.actions.length === 0) {
    return { action: 'escalate_to_operator', cost: 0, reachable: false };
  }

  const firstAction = result.actions[0];
  return {
    action: firstAction.name as RecoveryAction,
    cost: result.totalCost,
    reachable: true,
  };
}
