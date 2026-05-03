import { applyEffects, hashState, preconditionsMet } from '../../../src/planning/goap/state.js';
import type { WorldState, Action } from '../../../src/planning/goap/types.js';

const makeAction = (overrides: Partial<Action> = {}): Action => ({
  name: 'test',
  preconditions: {},
  effects: {},
  cost: 1,
  ...overrides,
});

describe('applyEffects', () => {
  it('merges effects into state and returns new state', () => {
    const state: WorldState = { a: true, b: 1 };
    const action = makeAction({ effects: { b: 2, c: 'hello' } });
    const next = applyEffects(state, action);
    expect(next).toEqual({ a: true, b: 2, c: 'hello' });
  });

  it('does not mutate the original state', () => {
    const state: WorldState = { x: false };
    const action = makeAction({ effects: { x: true } });
    applyEffects(state, action);
    expect(state.x).toBe(false);
  });

  it('returns a frozen object', () => {
    const state: WorldState = {};
    const next = applyEffects(state, makeAction({ effects: { a: 1 } }));
    expect(Object.isFrozen(next)).toBe(true);
  });

  it('handles empty effects — returns equivalent frozen state', () => {
    const state: WorldState = { a: 1 };
    const next = applyEffects(state, makeAction({ effects: {} }));
    expect(next).toEqual({ a: 1 });
  });
});

describe('hashState', () => {
  it('produces the same string for identical states regardless of insertion order', () => {
    const s1: WorldState = Object.freeze({ b: 2, a: 1 });
    const s2: WorldState = Object.freeze({ a: 1, b: 2 });
    expect(hashState(s1)).toBe(hashState(s2));
  });

  it('produces different strings for different states', () => {
    const s1: WorldState = Object.freeze({ a: true });
    const s2: WorldState = Object.freeze({ a: false });
    expect(hashState(s1)).not.toBe(hashState(s2));
  });

  it('handles empty state', () => {
    expect(hashState(Object.freeze({}))).toBe(hashState(Object.freeze({})));
  });
});

describe('preconditionsMet', () => {
  it('returns true when all preconditions match', () => {
    const state: WorldState = Object.freeze({ door: 'open', hp: 10 });
    const action = makeAction({ preconditions: { door: 'open' } });
    expect(preconditionsMet(state, action)).toBe(true);
  });

  it('returns false when a precondition value mismatches', () => {
    const state: WorldState = Object.freeze({ door: 'closed' });
    const action = makeAction({ preconditions: { door: 'open' } });
    expect(preconditionsMet(state, action)).toBe(false);
  });

  it('returns false when a precondition key is absent from state', () => {
    const state: WorldState = Object.freeze({});
    const action = makeAction({ preconditions: { has_key: true } });
    expect(preconditionsMet(state, action)).toBe(false);
  });

  it('returns true when preconditions object is empty', () => {
    const state: WorldState = Object.freeze({ anything: 99 });
    const action = makeAction({ preconditions: {} });
    expect(preconditionsMet(state, action)).toBe(true);
  });
});
