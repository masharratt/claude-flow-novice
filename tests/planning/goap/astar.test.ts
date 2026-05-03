import { plan } from '../../../src/planning/goap/astar.js';
import type { WorldState, Action, Goal } from '../../../src/planning/goap/types.js';

const freeze = (s: Record<string, boolean | number | string>): WorldState =>
  Object.freeze(s);

describe('plan — toy domain', () => {
  it('single action to reach goal', () => {
    const initial: WorldState = freeze({ has_coffee: false });
    const goal: Goal = { predicate: (s) => s['has_coffee'] === true };
    const actions: Action[] = [
      { name: 'grab_coffee', preconditions: {}, effects: { has_coffee: true }, cost: 1 },
    ];
    const result = plan(initial, goal, actions);
    expect(result.reachable).toBe(true);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].name).toBe('grab_coffee');
    expect(result.totalCost).toBe(1);
  });

  it('returns reachable: false when no applicable actions exist', () => {
    const initial: WorldState = freeze({ x: false });
    const goal: Goal = { predicate: (s) => s['x'] === true };
    const result = plan(initial, goal, []);
    expect(result.reachable).toBe(false);
    expect(result.actions).toHaveLength(0);
    expect(result.totalCost).toBe(0);
  });

  it('chains multiple actions to satisfy goal', () => {
    const initial: WorldState = freeze({ a: false, b: false });
    const goal: Goal = { predicate: (s) => s['a'] === true && s['b'] === true };
    const actions: Action[] = [
      { name: 'setA', preconditions: {}, effects: { a: true }, cost: 1 },
      { name: 'setB', preconditions: {}, effects: { b: true }, cost: 1 },
    ];
    const result = plan(initial, goal, actions);
    expect(result.reachable).toBe(true);
    expect(result.actions).toHaveLength(2);
    expect(result.totalCost).toBe(2);
    const names = result.actions.map((a) => a.name).sort();
    expect(names).toEqual(['setA', 'setB']);
  });

  it('picks the lower-cost path when two paths lead to the same goal', () => {
    const initial: WorldState = freeze({ done: false });
    const goal: Goal = { predicate: (s) => s['done'] === true };
    const actions: Action[] = [
      { name: 'cheap', preconditions: {}, effects: { done: true }, cost: 1 },
      { name: 'expensive', preconditions: {}, effects: { done: true }, cost: 3 },
    ];
    const result = plan(initial, goal, actions);
    expect(result.reachable).toBe(true);
    expect(result.totalCost).toBe(1);
    expect(result.actions[0].name).toBe('cheap');
  });

  it('returns reachable: false within maxIterations when state space is cyclic', () => {
    const initial: WorldState = freeze({ toggle: false });
    const goal: Goal = { predicate: () => false };
    const actions: Action[] = [
      { name: 'flip', preconditions: {}, effects: { toggle: true }, cost: 1 },
      { name: 'flop', preconditions: {}, effects: { toggle: false }, cost: 1 },
    ];
    const result = plan(initial, goal, actions, { maxIterations: 50 });
    expect(result.reachable).toBe(false);
  });

  it('excludedActions prevents use of named action', () => {
    const initial: WorldState = freeze({ done: false });
    const goal: Goal = { predicate: (s) => s['done'] === true };
    const actions: Action[] = [
      { name: 'doIt', preconditions: {}, effects: { done: true }, cost: 1 },
    ];
    const result = plan(initial, goal, actions, { excludedActions: ['doIt'] });
    expect(result.reachable).toBe(false);
  });

  it('preconditions block action from being applied', () => {
    const initial: WorldState = freeze({ door: 'closed', inside: false });
    const goal: Goal = { predicate: (s) => s['inside'] === true };
    const actions: Action[] = [
      {
        name: 'enter',
        preconditions: { door: 'open' },
        effects: { inside: true },
        cost: 1,
      },
    ];
    const result = plan(initial, goal, actions);
    expect(result.reachable).toBe(false);
  });

  it('uses custom heuristic when provided', () => {
    const initial: WorldState = freeze({ step: 0 });
    const goal: Goal = {
      predicate: (s) => (s['step'] as number) >= 3,
      heuristic: (s) => Math.max(0, 3 - (s['step'] as number)),
    };
    const actions: Action[] = [
      { name: 'advance', preconditions: {}, effects: { step: 1 }, cost: 1 },
    ];
    const result = plan(initial, goal, [
      { name: 'advance1', preconditions: { step: 0 }, effects: { step: 1 }, cost: 1 },
      { name: 'advance2', preconditions: { step: 1 }, effects: { step: 2 }, cost: 1 },
      { name: 'advance3', preconditions: { step: 2 }, effects: { step: 3 }, cost: 1 },
    ], { maxIterations: 1000 });
    expect(result.reachable).toBe(true);
    expect(result.totalCost).toBe(3);
  });
});
