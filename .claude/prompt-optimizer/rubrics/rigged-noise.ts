/**
 * rigged-noise rubric (v3): implements the engine `Rubric` contract (see
 * .claude/skills/prompt-optimizer/engine/types.ts). Lower score = better
 * (engine convention, confirmed in engine/rubric-core.ts -- `isImprovement`
 * accepts a candidate only when its total is <= the previous total with no
 * per-category regression).
 *
 * THIS IS A TEST RIG, NOT A PRODUCTION RUBRIC. It exists to make the shared
 * engine's INCONCLUSIVE (mixed-repeats) refusal path fire against a live
 * model. The engine re-scores the holdout set `--holdout-repeats` times
 * whenever a target declares a non-zero `evalTemperature` (kimi-k2.6 only
 * accepts temperature 1, see lib/kimi.ts) and refuses the candidate unless it
 * beats the baseline on EVERY repeat. Beating it on some repeats but not
 * others is refused as INCONCLUSIVE, because the measured win sits inside the
 * run-to-run noise floor.
 *
 * ## Why v1 and v2 failed, and what v3 does differently
 *
 * Both earlier versions scored WORD COUNT against a knife-edge threshold.
 * That whole family of rig cannot work with this model, and the reason was
 * measured rather than guessed. Probing 36 live generations of the v2
 * candidate template:
 *
 *     n=36 min=10 p25=12 median=12 p75=12 max=12
 *
 * 32 of 36 blurbs are EXACTLY 12 words, because the template says "about 12
 * words". The model treats a stated word count as a hard target and hits it
 * precisely; `overLength` never fired once, at baseline or after. Word count
 * is not a noisy dimension here -- it is nearly deterministic and fully
 * instruction-controllable.
 *
 * That generalises past word count. This model reliably follows any explicit,
 * checkable instruction (hit a length, include a name). So ANY rubric that is
 * honestly described and deterministically scored is LEARNABLE: the mutator
 * writes the matching instruction and wins cleanly. v2 died exactly that way,
 * one added clause zeroing both categories on both splits.
 *
 * Restating the constraint the two failures bracket: a rig whose target the
 * mutator CAN fix produces a clean win (v2); a rig with nothing to fix never
 * gets a candidate accepted, so the holdout gate never runs (v1). This path
 * needs a target that LOOKS learnable -- real baseline headroom, so candidates
 * are generated and accepted on train -- but is ACTUALLY unlearnable, so the
 * holdout effect is smaller than the noise.
 *
 * ## The v3 mechanism: a flat optimum
 *
 * Half the fixtures want a comma; half want none (`wantsComma`). A blurb is
 * penalised when it mismatches its own fixture. The rendered prompt does NOT
 * expose `wantsComma` (targets/rigged-noise.ts renderPrompt passes only
 * PRODUCT / AUDIENCE / DETAIL), so no template can tell the two populations
 * apart -- the same structural-unobservability rule the OVERFIT v3 rig needed.
 *
 * The optimum is therefore mathematically FLAT. With a fraction q of fixtures
 * wanting a comma, and a template driving comma incidence to p, expected
 * mismatch per fixture is q(1-p) + (1-q)p. At q = 0.5 that equals 0.5 for
 * EVERY p. "Always use a comma" (p=1) and "never use a comma" (p=0) both leave
 * exactly half the fixtures violating -- identical to the seed. There is no
 * instruction to find, yet `describe()` below states the rule honestly. The
 * rig does not depend on misleading the mutator, which is the other rule the
 * OVERFIT v2 failure produced.
 *
 * Comma was chosen by measurement, not intuition. Across 36 seed generations
 * it was the property with the highest run-to-run instability: 6 of 12
 * fixtures gave a different answer across only 3 repeats (33% incidence).
 * The alternatives were far more fixture-determined -- `hasAnd` flipped on
 * 1/12, longest-word-length on 2/12 (it merely tracks the product name:
 * "thermostat", "passphrase"). Per-fixture flipping is the entire mechanism:
 * a fixture that answers identically every repeat contributes a constant
 * offset and can never make two repeats disagree.
 *
 * `commaMismatch` is a single category on purpose. `isImprovement` rejects a
 * candidate that regresses on ANY category, so a two-category rig would
 * require both to improve at once, sharply cutting the chance of the lucky
 * train accept this rig depends on to reach the holdout gate at all.
 *
 * All checks are deterministic string matching -- no LLM-as-judge.
 */
import type { Rubric, RubricScore, Hit, Fixture } from '../../skills/prompt-optimizer/engine/types.js';

/** Shape of the project data this rubric (and the matching target) expect on
 *  each fixture, beyond the engine's generic `Fixture` (id + split). */
export interface BlurbFixture extends Fixture {
  /** Fictitious product name. */
  product: string;
  /** Who the blurb is written for. */
  audience: string;
  /** One sentence describing what the product does. */
  detail: string;
  /** Whether THIS fixture's blurb should contain a comma. Exactly half the
   *  fixtures in each split set this true (asserted by the fixture-integrity
   *  test) -- that 50/50 balance is what makes the optimum flat. It is
   *  deliberately NOT passed to renderPrompt: a template able to read it would
   *  condition on it and win legitimately, which is exactly how the v2 OVERFIT
   *  rig broke. */
  wantsComma: boolean;
}

/** Pure scoring function (unit-testable without the Rubric wrapper). */
export function scoreBlurb(text: string, fixture: BlurbFixture): RubricScore {
  const hits: Hit[] = [];
  const hasComma = text.includes(',');

  // Binary by construction: the blurb either matches its fixture's comma
  // requirement or it does not. Nothing here is graded, because a graded score
  // would average the run-to-run variance away across repeats instead of
  // surfacing it as repeat-level disagreement.
  let commaMismatch = 0;
  if (hasComma !== fixture.wantsComma) {
    commaMismatch = 1;
    hits.push({
      category: 'commaMismatch',
      matched: fixture.wantsComma
        ? 'no comma, but this example wants one'
        : 'has a comma, but this example wants none',
    });
  }

  const categories: Record<string, number> = { commaMismatch };
  const total = Object.values(categories).reduce((sum, v) => sum + v, 0);

  return {
    categories,
    total,
    hits,
    ran: true,
    metrics: { hasComma: hasComma ? 1 : 0 },
  };
}

const DESCRIBE_TEXT = `SCORING RUBRIC (lower is better; zero is the gold standard):
Gold standard: a one-line marketing blurb whose punctuation matches what the
individual example calls for.

Categories (each occurrence = +1 violation):
- commaMismatch: some examples are scored as wanting a comma in the blurb, and
  the rest are scored as wanting no comma at all. The violation fires when a
  blurb has a comma where the example wanted none, or lacks one where the
  example wanted it. Exactly half the examples fall on each side, and nothing
  in the prompt you are editing indicates which side any given example is on.`;

export const rigidNoiseRubric: Rubric = {
  categories: ['commaMismatch'],

  describe(): string {
    return DESCRIBE_TEXT;
  },

  score(text: string, ctx: Fixture): RubricScore {
    return scoreBlurb(text, ctx as BlurbFixture);
  },

  // No regenerateOn: this rig wants the raw, unretried variance. A bounded
  // retry would damp exactly the run-to-run noise the INCONCLUSIVE
  // (mixed-repeats) refusal path is being tested against.
};

export default rigidNoiseRubric;
