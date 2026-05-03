import type { WorldState, Action } from './types.js';

export function applyEffects(state: WorldState, action: Action): WorldState {
  return Object.freeze({ ...state, ...action.effects });
}

export function hashState(state: WorldState): string {
  const sorted = Object.keys(state)
    .sort()
    .map((k) => [k, state[k]]);
  return JSON.stringify(sorted);
}

export function preconditionsMet(state: WorldState, action: Action): boolean {
  for (const [key, value] of Object.entries(action.preconditions)) {
    if (state[key] !== value) return false;
  }
  return true;
}
