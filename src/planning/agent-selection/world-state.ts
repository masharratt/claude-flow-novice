import type { WorldState } from '../../planning/goap/types.js';
import type { SubstitutionContext } from './types.js';

export function buildSubstitutionState(context: SubstitutionContext): WorldState {
  const excludedFlags = context.excludedAgents.reduce<Record<string, boolean>>(
    (acc, agent) => {
      acc[`${agent}_excluded`] = true;
      return acc;
    },
    {},
  );

  return Object.freeze({
    substitute_found: false,
    chosen_agent: '',
    ...excludedFlags,
  });
}
