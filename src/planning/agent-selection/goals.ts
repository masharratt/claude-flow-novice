import type { Goal } from '../../planning/goap/types.js';

export const substitutionGoal: Goal = {
  predicate: (state) => state['substitute_found'] === true,
};
