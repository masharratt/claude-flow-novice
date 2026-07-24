/**
 * Generic rubric aggregation + acceptance logic. Iterates arbitrary
 * plugin-defined category keys (no hard-coded category names) so any
 * project's rubric works unchanged.
 */
import type { RubricScore } from './types.js';

export interface AggregateScore {
  /** Sum of each category's violation count across all RAN scores. */
  categoryTotals: Record<string, number>;
  /** Sum of categoryTotals. Only RAN scores contribute. */
  total: number;
  perScore: RubricScore[];
  ranCount: number;
  excludedCount: number;
}

/** Tri-state aggregate: `ran:false` scores are excluded from categoryTotals
 *  and total, but counted separately (FIX #2). */
export function aggregate(scores: RubricScore[]): AggregateScore {
  const ranScores = scores.filter(s => s.ran);
  const excludedScores = scores.filter(s => !s.ran);
  const categoryTotals: Record<string, number> = {};

  for (const s of ranScores) {
    for (const [category, value] of Object.entries(s.categories)) {
      categoryTotals[category] = (categoryTotals[category] ?? 0) + value;
    }
  }

  const total = Object.values(categoryTotals).reduce((sum, v) => sum + v, 0);

  return {
    categoryTotals,
    total,
    perScore: scores,
    ranCount: ranScores.length,
    excludedCount: excludedScores.length,
  };
}

/** Fraction of scores that actually ran (were not excluded). Empty input
 *  reports 0 (nothing ran), which correctly triggers the abort threshold. */
export function ranFraction(scores: RubricScore[]): number {
  if (scores.length === 0) return 0;
  return scores.filter(s => s.ran).length / scores.length;
}

/** Abort the eval run if fewer than `minRanFraction` (default 50%) of
 *  examples produced a scoreable result (FIX #2). */
export function shouldAbort(scores: RubricScore[], minRanFraction = 0.5): boolean {
  return ranFraction(scores) < minRanFraction;
}

/** Per-example cost info used only for the cost-Pareto tie-break. */
export interface CostInfo {
  promptTokens: number;
}

/**
 * Accept `candidate` over `prev` only if:
 *   0. candidate ran on at least as many examples as prev, and on more than
 *      zero (L9 — sample-count integrity; see the comment in the body), AND
 *   1. No per-category PER-EXAMPLE regression (every category rate <= prev's),
 *      AND
 *   2a. candidate's per-example total rate is strictly lower than prev's, OR
 *   2b. the two rates tie AND cost info is supplied AND candidate used fewer
 *       prompt tokens (cost-Pareto tie-break, FIX #5) — kills
 *       bloat-for-marginal-gain acceptances.
 * A pure tie with no cost info supplied is NOT an improvement.
 *
 * Every comparison is a rate (total / ranCount), never a raw sum, because the
 * two sides may have run on different numbers of examples.
 */
export function isImprovement(
  prev: AggregateScore,
  candidate: AggregateScore,
  cost?: { prev: CostInfo; candidate: CostInfo },
): boolean {
  // L9 — sample-count integrity. An excluded example contributes 0 to the
  // sums below, so a template that breaks its own output shrinks its own
  // total and reads as a win. Found live: a narration-base candidate scoring
  // total=2 over ran=11 was ACCEPTED over a total=3 over ran=15 baseline,
  // having improved nothing except how many generations failed extraction.
  //
  // Two guards, because normalising the rate is not sufficient on its own:
  // in that live case 2/11 = 0.182 still beats 3/15 = 0.200. The examples an
  // exclusion removes are the hard ones, so dropping them lifts the average
  // of whatever survives. A candidate measured on fewer examples than the
  // incumbent is not measuring the same thing, so it cannot be compared.
  if (candidate.ranCount === 0) return false;
  if (candidate.ranCount < prev.ranCount) return false;

  // Per-example rates, so recovering an excluded example (which raises the
  // raw sum) is not mistaken for a regression.
  const prevDivisor = Math.max(1, prev.ranCount);
  const candDivisor = candidate.ranCount;
  const prevTotalRate = prev.total / prevDivisor;
  const candTotalRate = candidate.total / candDivisor;

  // Rates are exact fractions but not exactly representable, so compare with
  // a tolerance rather than letting float noise decide an accept.
  const EPSILON = 1e-9;

  if (candTotalRate > prevTotalRate + EPSILON) return false;

  // No category may regress. Check every category referenced by either side.
  const allCategories = new Set([
    ...Object.keys(prev.categoryTotals),
    ...Object.keys(candidate.categoryTotals),
  ]);
  for (const category of allCategories) {
    const prevVal = (prev.categoryTotals[category] ?? 0) / prevDivisor;
    const candVal = (candidate.categoryTotals[category] ?? 0) / candDivisor;
    if (candVal > prevVal + EPSILON) return false;
  }

  if (candTotalRate < prevTotalRate - EPSILON) return true;

  // Tie on total: cost-Pareto tie-break.
  if (cost) {
    return cost.candidate.promptTokens < cost.prev.promptTokens;
  }
  return false;
}

/** Resolved scoring mode for a run: which temperature eval calls use, and
 *  whether results must be treated as noisy. */
export interface ScoringMode {
  evalTemperature: number;
  nondeterministic: boolean;
  /** Human-readable justification, stamped into the run report so a noisy
   *  result always carries the reason it was treated as noisy. */
  reason: string;
}

/**
 * L10 — decide whether this run's scores are noisy.
 *
 * Originally derived solely as `evalTemperature !== 0`, on the assumption
 * that a provider sent temperature 0 answers deterministically (FIX #3).
 * Measured false against xAI Grok: two runs of the SAME seed template, with
 * prompts proven byte-stable, produced train baselines of total=3 and
 * total=8, and a direct two-call probe at temperature 0 returned outputs
 * diverging at word 5 (175 vs 201 words).
 *
 * That made the single riskiest case the one with the LEAST protection: a
 * provider ignoring temperature 0 got no warning, no holdout repeats, and no
 * access to the INCONCLUSIVE mixed-repeats refusal, so pure run-to-run noise
 * was reported as an exact measurement. Nondeterminism is a property of the
 * provider, not of the number we send it, so a target may now declare it
 * directly. A target may NOT declare itself deterministic at a non-zero
 * temperature — it cannot opt out of noise it is demonstrably generating.
 */
export function resolveScoringMode(
  target: { evalTemperature?: number; nondeterministic?: boolean },
  defaultTemperature = 0,
): ScoringMode {
  const evalTemperature = target.evalTemperature ?? defaultTemperature;
  if (evalTemperature !== 0) {
    return {
      evalTemperature,
      nondeterministic: true,
      reason:
        `target.evalTemperature=${evalTemperature} (not 0). This target cannot honor ` +
        `temperature 0 — every total in this run is noisy, not a clean deterministic measurement.`,
    };
  }
  if (target.nondeterministic === true) {
    return {
      evalTemperature,
      nondeterministic: true,
      reason:
        `target.nondeterministic=true. The provider does not answer deterministically even at ` +
        `temperature 0 — every total in this run is noisy, not a clean deterministic measurement.`,
    };
  }
  return { evalTemperature, nondeterministic: false, reason: 'deterministic scoring at temperature 0' };
}
