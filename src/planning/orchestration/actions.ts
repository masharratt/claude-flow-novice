import type { Action } from '../goap/types.js';

export function buildOrchestratorActions(): Action[] {
  return [
    {
      name: 'run_loop3_again',
      preconditions: { gate_passed: false, iterations_ok: true, budget_ok: true },
      effects: { gate_passed: true },
      cost: 0.054,
    },
    {
      name: 'run_loop2',
      preconditions: { gate_passed: true, consensus_passed: false, iterations_ok: true, budget_ok: true },
      effects: { consensus_passed: true },
      cost: 0.150,
    },
    {
      name: 'consult_po',
      preconditions: { gate_passed: true, consensus_passed: true, po_consulted: false },
      effects: { orchestration_complete: true },
      cost: 0.010,
    },
    {
      name: 'abort_mission',
      preconditions: { abort_needed: true },
      effects: { orchestration_complete: true },
      cost: 10.0,
    },
  ];
}
