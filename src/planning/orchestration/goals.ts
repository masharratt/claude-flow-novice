import type { Goal } from '../goap/types.js';

export const orchestrationGoal: Goal = {
  predicate: (state) => state['orchestration_complete'] === true,
};
