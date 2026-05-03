import { preconditionsMet } from '../../planning/goap/state.js';
import { buildSchedulingState } from './world-state.js';
import { buildSchedulingActions } from './actions.js';
import type { SchedulingContext, SchedulePlan } from './types.js';

function isTransitivelyBlocked(
  task: string,
  dependencies: Record<string, string[]>,
  failedSet: Set<string>,
  memo: Map<string, boolean>,
): boolean {
  if (memo.has(task)) return memo.get(task)!;
  const deps = dependencies[task] ?? [];
  for (const dep of deps) {
    if (failedSet.has(dep)) {
      memo.set(task, true);
      return true;
    }
    if (isTransitivelyBlocked(dep, dependencies, failedSet, memo)) {
      memo.set(task, true);
      return true;
    }
  }
  memo.set(task, false);
  return false;
}

export function planNextBatch(ctx: SchedulingContext): SchedulePlan {
  const state = buildSchedulingState(ctx);
  const actions = buildSchedulingActions(ctx);

  const completedSet = new Set(ctx.completedTasks);
  const failedSet = new Set(ctx.failedTasks);
  const blockMemo = new Map<string, boolean>();

  const nextBatch: string[] = [];
  const blocked: string[] = [];
  const remaining: string[] = [];

  const unfinished = ctx.tasks.filter((t) => !completedSet.has(t) && !failedSet.has(t));

  for (const task of unfinished) {
    if (isTransitivelyBlocked(task, ctx.dependencies, failedSet, blockMemo)) {
      blocked.push(task);
      continue;
    }

    const action = actions.find((a) => a.name === `schedule_${task}`);
    if (action && preconditionsMet(state, action)) {
      nextBatch.push(task);
    } else {
      remaining.push(task);
    }
  }

  const complete = nextBatch.length === 0 && remaining.length === 0 && blocked.length === 0;

  return { nextBatch, blocked, remaining, complete };
}
