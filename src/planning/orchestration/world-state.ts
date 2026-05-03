import type { WorldState } from '../goap/types.js';
import type { OrchestratorContext } from './types.js';

export function buildOrchestratorState(ctx: OrchestratorContext): WorldState {
  const budget_ok = ctx.budgetRemaining > 0.10;
  const iterations_ok = ctx.iteration < ctx.maxIterations;
  return {
    gate_passed: ctx.gatePassed,
    consensus_passed: ctx.consensusPassed,
    po_consulted: ctx.poConsulted,
    budget_ok,
    iterations_ok,
    abort_needed: !budget_ok || !iterations_ok,
    orchestration_complete: false,
  };
}
