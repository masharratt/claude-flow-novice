import type { Action } from '../../planning/goap/types.js';
import type { SchedulingContext } from './types.js';

export function buildSchedulingActions(ctx: SchedulingContext): Action[] {
  const actions: Action[] = [];

  for (const task of ctx.tasks) {
    if (ctx.completedTasks.includes(task) || ctx.failedTasks.includes(task)) continue;

    const deps = ctx.dependencies[task] ?? [];
    const preconditions: Record<string, boolean> = {};
    for (const dep of deps) {
      preconditions[`${dep}_done`] = true;
    }

    actions.push({
      name: `schedule_${task}`,
      preconditions,
      effects: { [`${task}_done`]: true },
      cost: 1,
    });
  }

  const allDonePrecs: Record<string, boolean> = {};
  for (const task of ctx.tasks) {
    allDonePrecs[`${task}_done`] = true;
  }

  actions.push({
    name: 'complete_all',
    preconditions: allDonePrecs,
    effects: { all_scheduled: true },
    cost: 0,
  });

  return actions;
}
