import { describe, it, expect } from 'vitest';
import { aggregate, ranFraction, shouldAbort, isImprovement, type AggregateScore } from './rubric-core.js';
import type { RubricScore } from './types.js';

function score(categories: Record<string, number>, ran = true): RubricScore {
  const total = Object.values(categories).reduce((a, b) => a + b, 0);
  return { categories, total, hits: [], ran };
}

describe('aggregate (tri-state exclusion)', () => {
  it('sums arbitrary category keys across ran scores only', () => {
    const scores = [score({ foo: 1, bar: 2 }), score({ foo: 3, bar: 0 })];
    const agg = aggregate(scores);
    expect(agg.categoryTotals).toEqual({ foo: 4, bar: 2 });
    expect(agg.total).toBe(6);
    expect(agg.ranCount).toBe(2);
    expect(agg.excludedCount).toBe(0);
  });

  it('excludes ran:false scores from categoryTotals and total, counts them separately', () => {
    const scores = [score({ foo: 5 }), score({ foo: 99 }, false)];
    const agg = aggregate(scores);
    expect(agg.categoryTotals).toEqual({ foo: 5 });
    expect(agg.total).toBe(5);
    expect(agg.ranCount).toBe(1);
    expect(agg.excludedCount).toBe(1);
  });

  it('handles an all-excluded set: zero categoryTotals, zero total, full excludedCount', () => {
    const scores = [score({ foo: 1 }, false), score({ foo: 2 }, false)];
    const agg = aggregate(scores);
    expect(agg.categoryTotals).toEqual({});
    expect(agg.total).toBe(0);
    expect(agg.ranCount).toBe(0);
    expect(agg.excludedCount).toBe(2);
  });
});

describe('ranFraction / shouldAbort', () => {
  it('computes the fraction of scores that ran', () => {
    const scores = [score({}, true), score({}, true), score({}, false), score({}, false)];
    expect(ranFraction(scores)).toBe(0.5);
  });

  it('reports 0 for an empty scores array', () => {
    expect(ranFraction([])).toBe(0);
  });

  it('aborts when ran fraction is below the 50% default threshold', () => {
    const scores = [score({}, true), score({}, false), score({}, false)];
    expect(shouldAbort(scores)).toBe(true);
  });

  it('does not abort when ran fraction meets the threshold', () => {
    const scores = [score({}, true), score({}, true), score({}, false)];
    expect(shouldAbort(scores)).toBe(false);
  });

  it('aborts an empty scores array (0% ran)', () => {
    expect(shouldAbort([])).toBe(true);
  });

  it('honors a custom minRanFraction', () => {
    const scores = [score({}, true), score({}, false), score({}, false)];
    expect(shouldAbort(scores, 0.2)).toBe(false);
    expect(shouldAbort(scores, 0.5)).toBe(true);
  });
});

function agg(categoryTotals: Record<string, number>, extra: Partial<AggregateScore> = {}): AggregateScore {
  const total = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
  return { categoryTotals, total, perScore: [], ranCount: 1, excludedCount: 0, ...extra };
}

describe('isImprovement', () => {
  it('accepts a strictly lower total with no per-category regression', () => {
    const prev = agg({ a: 3, b: 2 });
    const candidate = agg({ a: 1, b: 2 });
    expect(isImprovement(prev, candidate)).toBe(true);
  });

  it('rejects a higher total even if some categories improved', () => {
    const prev = agg({ a: 3, b: 2 });
    const candidate = agg({ a: 0, b: 8 });
    expect(isImprovement(prev, candidate)).toBe(false);
  });

  it('rejects when total improves but ANY single category regresses', () => {
    const prev = agg({ a: 3, b: 2 });
    const candidate = agg({ a: 0, b: 3 }); // total 3 < 5, but b regressed 2 -> 3
    expect(isImprovement(prev, candidate)).toBe(false);
  });

  it('rejects a candidate that introduces a brand-new category with hits', () => {
    const prev = agg({ a: 3 });
    const candidate = agg({ a: 1, newCategory: 1 }); // total 2 < 3, but newCategory is a regression from implicit 0
    expect(isImprovement(prev, candidate)).toBe(false);
  });

  it('rejects a pure tie when no cost info is supplied', () => {
    const prev = agg({ a: 2 });
    const candidate = agg({ a: 2 });
    expect(isImprovement(prev, candidate)).toBe(false);
  });

  it('cost-Pareto tie-break: accepts a tie when candidate used fewer prompt tokens', () => {
    const prev = agg({ a: 2 });
    const candidate = agg({ a: 2 });
    const accepted = isImprovement(prev, candidate, {
      prev: { promptTokens: 500 },
      candidate: { promptTokens: 300 },
    });
    expect(accepted).toBe(true);
  });

  it('cost-Pareto tie-break: rejects a tie when candidate used MORE prompt tokens (kills bloat-for-marginal-gain)', () => {
    const prev = agg({ a: 2 });
    const candidate = agg({ a: 2 });
    const accepted = isImprovement(prev, candidate, {
      prev: { promptTokens: 300 },
      candidate: { promptTokens: 500 },
    });
    expect(accepted).toBe(false);
  });

  it('cost-Pareto tie-break: rejects a tie on equal token counts', () => {
    const prev = agg({ a: 2 });
    const candidate = agg({ a: 2 });
    const accepted = isImprovement(prev, candidate, {
      prev: { promptTokens: 400 },
      candidate: { promptTokens: 400 },
    });
    expect(accepted).toBe(false);
  });
});
