import type { WorldState } from '../../planning/goap/types.js';
import type { SchedulingContext } from './types.js';

export function buildSchedulingState(ctx: SchedulingContext): WorldState {
  const state: Record<string, boolean> = { all_scheduled: false };
  for (const task of ctx.tasks) {
    state[`${task}_done`] = ctx.completedTasks.includes(task);
  }
  return Object.freeze(state);
}
