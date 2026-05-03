import { buildSchedulingActions, buildSchedulingState, planNextBatch } from '../../../src/planning/scheduling/index.js';
import type { SchedulingContext } from '../../../src/planning/scheduling/types.js';

describe('buildSchedulingActions', () => {
  it('creates one action per task with preconditions = upstream deps', () => {
    const ctx: SchedulingContext = {
      tasks: ['a', 'b', 'c'],
      dependencies: { a: [], b: ['a'], c: ['a', 'b'] },
      completedTasks: [],
      failedTasks: [],
    };
    const actions = buildSchedulingActions(ctx);
    const scheduleA = actions.find((x) => x.name === 'schedule_a');
    const scheduleB = actions.find((x) => x.name === 'schedule_b');
    const scheduleC = actions.find((x) => x.name === 'schedule_c');
    expect(scheduleA).toBeDefined();
    expect(scheduleA?.preconditions).toEqual({});
    expect(scheduleB?.preconditions).toEqual({ a_done: true });
    expect(scheduleC?.preconditions).toEqual({ a_done: true, b_done: true });
  });
});

describe('buildSchedulingState', () => {
  it('marks completed tasks correctly in world state', () => {
    const ctx: SchedulingContext = {
      tasks: ['a', 'b', 'c'],
      dependencies: { a: [], b: ['a'], c: ['b'] },
      completedTasks: ['a'],
      failedTasks: [],
    };
    const state = buildSchedulingState(ctx);
    expect(state['a_done']).toBe(true);
    expect(state['b_done']).toBe(false);
    expect(state['c_done']).toBe(false);
  });
});

describe('planNextBatch', () => {
  it('returns tasks with all deps completed (first executable batch)', () => {
    const ctx: SchedulingContext = {
      tasks: ['a', 'b', 'c'],
      dependencies: { a: [], b: ['a'], c: ['b'] },
      completedTasks: ['a'],
      failedTasks: [],
    };
    const result = planNextBatch(ctx);
    expect(result.nextBatch).toContain('b');
    expect(result.nextBatch).not.toContain('a');
    expect(result.nextBatch).not.toContain('c');
  });

  it('excludes failed tasks from further planning', () => {
    const ctx: SchedulingContext = {
      tasks: ['a', 'b'],
      dependencies: { a: [], b: [] },
      completedTasks: [],
      failedTasks: ['a'],
    };
    const result = planNextBatch(ctx);
    expect(result.nextBatch).not.toContain('a');
    expect(result.nextBatch).toContain('b');
  });

  it('returns empty when all tasks complete', () => {
    const ctx: SchedulingContext = {
      tasks: ['a', 'b'],
      dependencies: { a: [], b: ['a'] },
      completedTasks: ['a', 'b'],
      failedTasks: [],
    };
    const result = planNextBatch(ctx);
    expect(result.nextBatch).toEqual([]);
    expect(result.remaining).toEqual([]);
    expect(result.blocked).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it('accounts for failed upstream: task depending on failed task goes to blocked', () => {
    const ctx: SchedulingContext = {
      tasks: ['a', 'b', 'c'],
      dependencies: { a: [], b: ['a'], c: ['b'] },
      completedTasks: [],
      failedTasks: ['a'],
    };
    const result = planNextBatch(ctx);
    expect(result.blocked).toContain('b');
    expect(result.blocked).toContain('c');
    expect(result.nextBatch).not.toContain('b');
    expect(result.nextBatch).not.toContain('c');
  });

  it('returns all root tasks schedulable immediately when no deps', () => {
    const ctx: SchedulingContext = {
      tasks: ['a', 'b', 'c'],
      dependencies: { a: [], b: [], c: [] },
      completedTasks: [],
      failedTasks: [],
    };
    const result = planNextBatch(ctx);
    expect(result.nextBatch).toContain('a');
    expect(result.nextBatch).toContain('b');
    expect(result.nextBatch).toContain('c');
  });
});
