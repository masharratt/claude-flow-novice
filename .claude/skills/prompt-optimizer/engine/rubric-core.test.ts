import { describe, it, expect } from 'vitest';
import { aggregate, ranFraction, shouldAbort, isImprovement, resolveScoringMode, type AggregateScore } from './rubric-core.js';
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

// L9. Found by the first live daily-coverage run of narration-base, which
// ACCEPTED a candidate scoring total=2 over ran=11 against a baseline of
// total=3 over ran=15. The candidate did not write better narration -- it made
// four generations fail extraction, and an excluded example contributes 0 to
// the sum. Comparing raw sums across unequal sample counts rewards a template
// for breaking its own output.
//
// Two distinct defects, and rate normalisation alone does NOT fix the live
// case (2/11 = 0.182 still beats 3/15 = 0.200). The excluded examples are the
// hard ones, so dropping them lifts the average of whatever survives. The
// ran-count floor is what actually closes it: a template that runs on fewer
// examples than the incumbent is not measuring the same thing, so it is not
// comparable and cannot win.
describe('isImprovement - sample-count integrity (L9)', () => {
  it('refuses the exact live regression: fewer ran examples, lower raw sum', () => {
    const prev = agg({ specificity: 1, monotony: 2 }, { ranCount: 15 });
    const candidate = agg({ specificity: 0, monotony: 2 }, { ranCount: 11, excludedCount: 4 });
    expect(candidate.total).toBeLessThan(prev.total); // the trap: raw sum looks like a win
    expect(isImprovement(prev, candidate)).toBe(false);
  });

  it('refuses a candidate that ran on fewer examples even when its per-example rate is better', () => {
    const prev = agg({ a: 10 }, { ranCount: 10 }); // 1.0 per example
    const candidate = agg({ a: 1 }, { ranCount: 5, excludedCount: 5 }); // 0.2 per example
    expect(isImprovement(prev, candidate)).toBe(false);
  });

  it('refuses a candidate on which nothing ran at all, rather than reading its empty total as perfect', () => {
    const prev = agg({ a: 5 }, { ranCount: 10 });
    const candidate = agg({}, { ranCount: 0, excludedCount: 10 });
    expect(candidate.total).toBe(0);
    expect(isImprovement(prev, candidate)).toBe(false);
  });

  it('compares per-example rates, so a candidate that ran on MORE examples is not punished for its larger sum', () => {
    const prev = agg({ a: 3 }, { ranCount: 10 }); // 0.30 per example
    const candidate = agg({ a: 4 }, { ranCount: 20 }); // 0.20 per example, but a bigger raw sum
    expect(candidate.total).toBeGreaterThan(prev.total);
    expect(isImprovement(prev, candidate)).toBe(true);
  });

  it('applies the rate comparison per category too, not only to the total', () => {
    const prev = agg({ a: 2, b: 2 }, { ranCount: 10 }); // a: 0.20, b: 0.20
    // Total rate improves (0.40 -> 0.30) but category b regresses (0.20 -> 0.25).
    const candidate = agg({ a: 1, b: 5 }, { ranCount: 20 });
    expect(isImprovement(prev, candidate)).toBe(false);
  });

  it('still accepts a genuine win at an unchanged ran count', () => {
    const prev = agg({ a: 3 }, { ranCount: 15 });
    const candidate = agg({ a: 1 }, { ranCount: 15 });
    expect(isImprovement(prev, candidate)).toBe(true);
  });

  it('accepts a candidate that RECOVERS excluded examples at an equal per-example rate', () => {
    // Mirror image of the bug: fixing extraction raises both ranCount and the
    // raw sum. Same rate, more evidence, fewer exclusions -> not a regression.
    const prev = agg({ a: 2 }, { ranCount: 10, excludedCount: 5 });
    const candidate = agg({ a: 3 }, { ranCount: 15, excludedCount: 0 });
    const accepted = isImprovement(prev, candidate, {
      prev: { promptTokens: 400 },
      candidate: { promptTokens: 300 },
    });
    expect(accepted).toBe(true);
  });
});

// L10. `lib/xai.ts` in the daily-coverage plugin asserted "Grok honors
// temperature 0, so eval scoring stays deterministic (FIX #3)". Measured
// false: two `narration-base` runs of the SAME seed template, with prompts
// proven byte-stable across all 22 fixtures, produced train baselines of
// total=3 and total=8. A direct two-call probe at temperature 0 returned
// outputs diverging at word 5 (175 vs 201 words).
//
// The engine gated ALL of its nondeterminism protection -- the warning,
// holdout repeats, and the INCONCLUSIVE mixed-repeats refusal -- on
// `evalTemperature !== 0`. A provider that ignores temperature 0 therefore
// got no protection and no warning: the single riskiest case was the one
// silently treated as an exact measurement. Nondeterminism is a property of
// the provider, not of the number we send it, so a target must be able to
// declare it independently.
describe('resolveScoringMode (L10)', () => {
  it('treats an absent evalTemperature as deterministic temperature 0 (unchanged default)', () => {
    const mode = resolveScoringMode({});
    expect(mode.evalTemperature).toBe(0);
    expect(mode.nondeterministic).toBe(false);
  });

  it('treats a non-zero evalTemperature as nondeterministic (unchanged L2 behaviour)', () => {
    const mode = resolveScoringMode({ evalTemperature: 1 });
    expect(mode.evalTemperature).toBe(1);
    expect(mode.nondeterministic).toBe(true);
    expect(mode.reason).toContain('evalTemperature');
  });

  it('honors an explicit nondeterministic flag even at temperature 0 (the live Grok case)', () => {
    const mode = resolveScoringMode({ nondeterministic: true });
    expect(mode.evalTemperature).toBe(0);
    expect(mode.nondeterministic).toBe(true);
    expect(mode.reason).toContain('provider');
  });

  it('reports temperature as the reason when both apply, since it is the stronger signal', () => {
    const mode = resolveScoringMode({ evalTemperature: 1, nondeterministic: true });
    expect(mode.nondeterministic).toBe(true);
    expect(mode.reason).toContain('evalTemperature');
  });

  it('does not let an explicit nondeterministic:false override a non-zero temperature', () => {
    // A plugin cannot opt out of noise it is demonstrably generating.
    const mode = resolveScoringMode({ evalTemperature: 1, nondeterministic: false });
    expect(mode.nondeterministic).toBe(true);
  });
});
