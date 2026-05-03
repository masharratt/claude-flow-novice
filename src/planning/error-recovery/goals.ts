import type { Goal } from '../goap/types.js';

export const errorRecoveryGoal: Goal = { predicate: (state) => state['error_resolved'] === true };
