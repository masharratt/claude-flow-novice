/**
 * Evaluator: runs a template through a fixture set, scores each generation
 * against a plugin Rubric, and returns an aggregate + per-fixture detail.
 *
 * Bakes in three of the five engine fixes:
 *   FIX #2 tri-state no-run exclusion — a fixture whose generation fails
 *     `extractScript` (ok:false) is excluded from the aggregate and counted
 *     separately. If fewer than 50% of fixtures ran, the whole eval aborts.
 *   FIX #3 temperature-0 scoring — eval always pins temperature 0 for a
 *     stable ranking. A plugin's production seam may use a higher temp;
 *     that is out of scope here (documented divergence).
 *   FIX #4 reject-and-regenerate — when a rubric hit lands in a category
 *     listed in `rubric.regenerateOn`, the engine regenerates ONCE with a
 *     plugin-supplied corrective nudge appended to the prompt (a temp-0
 *     plain retry would reproduce the same output, so the nudge is
 *     required to differ) and rescoring, bounded to exactly 1 retry.
 */
import pLimit from 'p-limit';
import type { Target, Rubric, Fixture, RubricScore } from './types.js';
import { aggregate, shouldAbort, type AggregateScore } from './rubric-core.js';
import type { BudgetTracker } from './budget.js';

export interface PerFixtureResult {
  fixture: Fixture;
  prompt: string;
  text: string;
  score: RubricScore;
  cost: number;
  promptTokens: number;
  regenerated: boolean;
}

export interface EvalResult {
  aggregate: AggregateScore;
  perFixture: PerFixtureResult[];
  totalCost: number;
  totalPromptTokens: number;
  aborted: boolean;
  abortReason?: string;
  /** L2: the effective temperature actually used for this eval's generate
   *  calls — `target.evalTemperature` when declared, else EVAL_TEMPERATURE
   *  (0). Non-zero means scoring for this eval is NOT deterministic; callers
   *  (optimize.ts) use this to stamp a NONDETERMINISTIC SCORING warning
   *  rather than reporting a noisy result as a clean measurement. */
  evalTemperature: number;
}

export interface EvalOptions {
  concurrency?: number;
  /** Corrective nudge appended to the prompt on a reject-and-regenerate
   *  retry. Plugin-supplied because only the plugin knows what "corrective"
   *  means for its rubric. Falls back to a generic nudge if omitted. */
  regenerateNudge?: string;
  /** Fraction of fixtures that must produce a ran:true score, else the eval
   *  aborts. Default 0.5 (FIX #2). */
  minRanFraction?: number;
}

const DEFAULT_CONCURRENCY = 2;
export const EVAL_TEMPERATURE = 0;
const DEFAULT_MIN_RAN_FRACTION = 0.5;
const DEFAULT_NUDGE =
  '\n\nIMPORTANT: your previous output violated the rubric. Regenerate, correcting for that violation.';

async function retryTransient<T>(fn: () => Promise<T>, retries = 2, delayMs = 5000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt >= retries || !/503|UNAVAILABLE|overloaded|ETIMEDOUT|ECONNRESET/i.test(err?.message ?? '')) {
        throw err;
      }
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
}

function excludedScore(reason: string): RubricScore {
  return { categories: {}, total: 0, hits: [], ran: false, metrics: { reason } };
}

export async function evaluateTemplate(
  target: Target,
  rubric: Rubric,
  template: string,
  fixtures: Fixture[],
  budget: BudgetTracker,
  options: EvalOptions = {},
): Promise<EvalResult> {
  const limit = pLimit(options.concurrency ?? DEFAULT_CONCURRENCY);
  const minRanFraction = options.minRanFraction ?? DEFAULT_MIN_RAN_FRACTION;
  // L2: a target may declare the lowest temperature it can actually honor
  // for eval calls (e.g. a provider that rejects temperature 0). Falls back
  // to the engine's temperature-0 default (FIX #3) when absent.
  const evalTemperature = target.evalTemperature ?? EVAL_TEMPERATURE;
  const perFixture: PerFixtureResult[] = [];
  let totalCost = 0;
  let totalPromptTokens = 0;

  await Promise.all(
    fixtures.map(fixture =>
      limit(async () => {
        if (budget.exhausted()) {
          perFixture.push({
            fixture,
            prompt: '',
            text: '',
            score: excludedScore('budget exhausted'),
            cost: 0,
            promptTokens: 0,
            regenerated: false,
          });
          return;
        }

        const { prompt } = target.renderPrompt(template, fixture);
        const gen = await retryTransient(() => target.generate(prompt, { temperature: evalTemperature }));
        budget.record({
          target: target.id,
          phase: 'eval',
          model: gen.model,
          inputTokens: gen.inputTokens,
          outputTokens: gen.outputTokens,
          cost: gen.cost,
        });
        totalCost += gen.cost;
        totalPromptTokens += gen.inputTokens;

        const extracted = target.extractScript(gen.raw);
        if (!extracted.ok) {
          perFixture.push({
            fixture,
            prompt,
            text: '',
            score: excludedScore(extracted.reason),
            cost: gen.cost,
            promptTokens: gen.inputTokens,
            regenerated: false,
          });
          return;
        }

        let text = extracted.text;
        let score = rubric.score(text, fixture);
        let cost = gen.cost;
        let promptTokens = gen.inputTokens;
        let regenerated = false;

        const regenerateOn = rubric.regenerateOn ?? [];
        const triggeringHit =
          regenerateOn.length > 0 ? score.hits.find(h => regenerateOn.includes(h.category)) : undefined;

        if (triggeringHit) {
          const nudge = options.regenerateNudge ?? DEFAULT_NUDGE;
          const retryPrompt = prompt + nudge;
          const retryGen = await retryTransient(() =>
            target.generate(retryPrompt, { temperature: evalTemperature }),
          );
          budget.record({
            target: target.id,
            phase: 'eval',
            model: retryGen.model,
            inputTokens: retryGen.inputTokens,
            outputTokens: retryGen.outputTokens,
            cost: retryGen.cost,
          });
          cost += retryGen.cost;
          promptTokens += retryGen.inputTokens;
          totalCost += retryGen.cost;
          totalPromptTokens += retryGen.inputTokens;

          const retryExtracted = target.extractScript(retryGen.raw);
          if (retryExtracted.ok) {
            // Bounded to exactly 1 retry: score the regenerated result
            // whether or not it still hits regenerateOn — no second retry.
            text = retryExtracted.text;
            score = rubric.score(text, fixture);
            regenerated = true;
          }
          // If the retry itself fails to extract, score the ORIGINAL
          // (pre-retry) result as-is rather than excluding it — the
          // original at least parsed.
        }

        perFixture.push({ fixture, prompt, text, score, cost, promptTokens, regenerated });
      }),
    ),
  );

  const scores = perFixture.map(p => p.score);
  const agg = aggregate(scores);
  const aborted = shouldAbort(scores, minRanFraction);

  return {
    aggregate: agg,
    perFixture,
    totalCost,
    totalPromptTokens,
    aborted,
    abortReason: aborted
      ? `Only ${agg.ranCount}/${scores.length} fixtures ran (below ${(minRanFraction * 100).toFixed(0)}% threshold)`
      : undefined,
    evalTemperature,
  };
}

/** Top-K worst-scoring (ran-only) fixtures, for feeding into the mutator. */
export function selectWorst(result: EvalResult, k: number): PerFixtureResult[] {
  return [...result.perFixture]
    .filter(p => p.score.ran)
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, k);
}
