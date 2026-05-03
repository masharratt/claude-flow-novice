import {
  buildOrchestratorState,
  buildOrchestratorActions,
  decideNextAction,
} from '../../../src/planning/orchestration/index';
import type { OrchestratorContext } from '../../../src/planning/orchestration/index';

function makeCtx(overrides: Partial<OrchestratorContext> = {}): OrchestratorContext {
  return {
    iteration: 1,
    maxIterations: 10,
    gatePassed: false,
    consensusPassed: false,
    poConsulted: false,
    budgetRemaining: 5.0,
    timeRemainingMs: 3600000,
    dollarSpent: 0,
    ...overrides,
  };
}

describe('buildOrchestratorState', () => {
  it('returns correct WorldState from OrchestratorContext', () => {
    const ctx = makeCtx({ gatePassed: true, consensusPassed: false, poConsulted: false });
    const state = buildOrchestratorState(ctx);
    expect(state.gate_passed).toBe(true);
    expect(state.consensus_passed).toBe(false);
    expect(state.po_consulted).toBe(false);
    expect(state.orchestration_complete).toBe(false);
  });

  it('sets budget_ok: true when budget_remaining > 0.10', () => {
    const state = buildOrchestratorState(makeCtx({ budgetRemaining: 0.50 }));
    expect(state.budget_ok).toBe(true);
  });

  it('sets budget_ok: false when budget_remaining <= 0.10', () => {
    const state = buildOrchestratorState(makeCtx({ budgetRemaining: 0.10 }));
    expect(state.budget_ok).toBe(false);
  });

  it('sets iterations_ok: false when iteration >= maxIterations', () => {
    const state = buildOrchestratorState(makeCtx({ iteration: 10, maxIterations: 10 }));
    expect(state.iterations_ok).toBe(false);
  });
});

describe('decideNextAction', () => {
  it('returns run_loop3_again when gate not passed, budget OK, iterations OK', () => {
    const ctx = makeCtx({
      gatePassed: false,
      consensusPassed: false,
      poConsulted: false,
      budgetRemaining: 5.0,
      iteration: 1,
      maxIterations: 10,
    });
    const decision = decideNextAction(ctx);
    expect(decision.action).toBe('run_loop3_again');
    expect(decision.reachable).toBe(true);
  });

  it('returns abort_mission when budget exhausted (budget_ok: false)', () => {
    const ctx = makeCtx({ budgetRemaining: 0.05 });
    const decision = decideNextAction(ctx);
    expect(decision.action).toBe('abort_mission');
  });

  it('returns abort_mission when iterations exhausted (iterations_ok: false)', () => {
    const ctx = makeCtx({ iteration: 10, maxIterations: 10 });
    const decision = decideNextAction(ctx);
    expect(decision.action).toBe('abort_mission');
  });

  it('returns run_loop2 when gate passed, consensus not passed, budget OK', () => {
    const ctx = makeCtx({
      gatePassed: true,
      consensusPassed: false,
      poConsulted: false,
      budgetRemaining: 5.0,
      iteration: 1,
      maxIterations: 10,
    });
    const decision = decideNextAction(ctx);
    expect(decision.action).toBe('run_loop2');
    expect(decision.reachable).toBe(true);
  });

  it('returns consult_po when gate passed, consensus passed, po not consulted', () => {
    const ctx = makeCtx({
      gatePassed: true,
      consensusPassed: true,
      poConsulted: false,
      budgetRemaining: 5.0,
    });
    const decision = decideNextAction(ctx);
    expect(decision.action).toBe('consult_po');
    expect(decision.reachable).toBe(true);
  });

  it('returns abort_mission as fallback when no other action applicable', () => {
    const ctx = makeCtx({
      budgetRemaining: 0.0,
      iteration: 10,
      maxIterations: 10,
    });
    const decision = decideNextAction(ctx);
    expect(decision.action).toBe('abort_mission');
  });
});

describe('buildOrchestratorActions', () => {
  it('creates 4 actions: run_loop3_again, run_loop2, consult_po, abort_mission', () => {
    const actions = buildOrchestratorActions();
    const names = actions.map((a) => a.name);
    expect(actions).toHaveLength(4);
    expect(names).toContain('run_loop3_again');
    expect(names).toContain('run_loop2');
    expect(names).toContain('consult_po');
    expect(names).toContain('abort_mission');
  });

  it('total cost of run_loop3 + run_loop2 + consult_po path is less than abort_mission alone', () => {
    const actions = buildOrchestratorActions();
    const byName = Object.fromEntries(actions.map((a) => [a.name, a]));
    const pathCost =
      byName['run_loop3_again'].cost +
      byName['run_loop2'].cost +
      byName['consult_po'].cost;
    expect(pathCost).toBeLessThan(byName['abort_mission'].cost);
  });
});
