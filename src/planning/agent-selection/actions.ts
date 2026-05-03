import type { Action } from '../../planning/goap/types.js';

export function buildSubstitutionActions(
  agentPool: string[],
  excludedAgents: string[],
): Action[] {
  const excludedSet = new Set(excludedAgents);
  return agentPool
    .filter((agent) => !excludedSet.has(agent))
    .map((agent) => ({
      name: `assign_${agent}`,
      preconditions: {},
      effects: { substitute_found: true, chosen_agent: agent },
      cost: 1,
    }));
}
