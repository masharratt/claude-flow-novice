export type OrchestratorAction =
  | 'run_loop3_again'
  | 'run_loop2'
  | 'consult_po'
  | 'abort_mission';

export interface OrchestratorContext {
  iteration: number;
  maxIterations: number;
  gatePassed: boolean;
  consensusPassed: boolean;
  poConsulted: boolean;
  budgetRemaining: number;
  timeRemainingMs: number;
  dollarSpent: number;
}

export interface OrchestratorDecision {
  action: OrchestratorAction;
  cost: number;
  reachable: boolean;
}
