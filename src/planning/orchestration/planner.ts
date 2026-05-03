import { plan } from '../goap/astar.js';
import { buildOrchestratorState } from './world-state.js';
import { buildOrchestratorActions } from './actions.js';
import { orchestrationGoal } from './goals.js';
import type { OrchestratorContext, OrchestratorDecision, OrchestratorAction } from './types.js';

export function decideNextAction(ctx: OrchestratorContext): OrchestratorDecision {
  const initialState = buildOrchestratorState(ctx);
  const actions = buildOrchestratorActions();
  const result = plan(initialState, orchestrationGoal, actions, { maxIterations: 20 });

  if (!result.reachable || result.actions.length === 0) {
    return { action: 'abort_mission', cost: 10.0, reachable: false };
  }

  const first = result.actions[0];
  if (first === undefined) {
    return { action: 'abort_mission', cost: 10.0, reachable: false };
  }
  return {
    action: first.name as OrchestratorAction,
    cost: first.cost,
    reachable: true,
  };
}
