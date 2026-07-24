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
 *   1. No per-category regression (every category total <= prev's), AND
 *   2a. candidate.total is strictly lower than prev.total, OR
 *   2b. candidate.total ties prev.total AND cost info is supplied AND
 *       candidate used fewer prompt tokens (cost-Pareto tie-break, FIX #5)
 *       — kills bloat-for-marginal-gain acceptances.
 * A pure tie with no cost info supplied is NOT an improvement.
 */
export function isImprovement(
  prev: AggregateScore,
  candidate: AggregateScore,
  cost?: { prev: CostInfo; candidate: CostInfo },
): boolean {
  if (candidate.total > prev.total) return false;

  // No category may regress. Check every category referenced by either side.
  const allCategories = new Set([
    ...Object.keys(prev.categoryTotals),
    ...Object.keys(candidate.categoryTotals),
  ]);
  for (const category of allCategories) {
    const prevVal = prev.categoryTotals[category] ?? 0;
    const candVal = candidate.categoryTotals[category] ?? 0;
    if (candVal > prevVal) return false;
  }

  if (candidate.total < prev.total) return true;

  // Tie on total: cost-Pareto tie-break.
  if (cost) {
    return cost.candidate.promptTokens < cost.prev.promptTokens;
  }
  return false;
}
