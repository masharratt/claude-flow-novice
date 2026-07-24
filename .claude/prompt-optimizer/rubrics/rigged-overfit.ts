/**
 * rigged-overfit rubric (v2): implements the engine `Rubric` contract (see
 * .claude/skills/prompt-optimizer/engine/types.ts). Lower score = better
 * (engine convention, same as commit-msg -- `isImprovement` accepts a
 * candidate only when its total is <= the previous total with no
 * per-category regression).
 *
 * THIS IS A TEST RIG, NOT A PRODUCTION RUBRIC. Do not "fix" the asymmetry
 * below -- it is the point.
 *
 * WHY v2 EXISTS -- v1's rig failed live, do not reintroduce its mechanism:
 * v1 rigged a `missingTicket` category that could only fire on a holdout
 * fixture, betting that the mutator would delete the "include the ticket"
 * instruction it saw no train-side evidence for. It did not: the mutator
 * PRESERVED and even strengthened that instruction. Worse, v1's seed
 * template was deliberately verbose, so the holdout BASELINE itself scored
 * terribly (97 and 107 across two live repeats), and any compression at all
 * looked like a win against that bad baseline. Final holdout score came back
 * 1 and 0 -- a real generalizing improvement, not an overfit. The lesson:
 * OVERFIT cannot depend on the mutator forgetting an instruction it never
 * saw evidence for removing. It requires the seed template to ALREADY BE
 * GOOD on holdout, with train-side pressure pushing the template AWAY from
 * what holdout rewards. That is a distribution shift, not a forgetting bet.
 *
 * HOW v2 WORKS -- structural blindness via distribution shift:
 * Every fixture carries a `style: 'terse' | 'formal'` field that says which
 * length rule applies to THAT fixture. ALL `split:'train'` fixtures are
 * `style:'terse'` (short is good, long is penalized). ALL `split:'holdout'`
 * fixtures are `style:'formal'` (long is good, short is penalized). The two
 * rubric categories are gated by that same field:
 *
 * - `tooWordy` can only ever be nonzero on a `style:'terse'` fixture --
 *   every train fixture, zero holdout fixtures.
 * - `tooTerse` can only ever be nonzero on a `style:'formal'` fixture --
 *   every holdout fixture, zero train fixtures.
 *
 * A mutator optimizing against train fixtures literally cannot produce a
 * `tooTerse` hit no matter what it does to the template, so it has zero
 * evidence `tooTerse` (or the formal-style population) exists at all. It
 * will correctly and rationally drive the template toward "always be
 * terse" -- that is the strictly correct move for 100% of what it can see --
 * which is exactly wrong for the entire holdout population. The seed
 * template is deliberately FORMAL (verbose, complete-sentence prose), so the
 * holdout baseline starts near zero (good) while the train baseline starts
 * large (bad, since a formal seed is far over the terse budget). Train
 * pressure compresses the template; holdout regresses as a direct, provable
 * consequence of the same edit, not a coincidence or a forgotten clause.
 *
 * Critically, `describe()` below does NOT hide `tooTerse` or the formal rule
 * from the mutator -- it documents both categories and both thresholds as
 * honestly as commit-msg's DESCRIBE_TEXT documents its six, including that
 * which rule applies depends on the fixture's declared style. If this rig
 * only worked by lying to the mutator about what gets scored, it would prove
 * nothing about the engine's overfit detection. The mutator has the full,
 * honest rubric text and still cannot act on a population it has no train-
 * side signal for -- that is what makes this a distribution-shift result,
 * not a description-hiding trick.
 *
 * All checks are deterministic string/word-count matching -- no LLM-as-judge.
 */
import type { Rubric, RubricScore, Hit, Fixture } from '../../skills/prompt-optimizer/engine/types.js';

/** Shape of the project data this rubric (and the matching target) expect on
 *  each fixture, beyond the engine's generic `Fixture` (id + split).
 *  `style` declares which length rule applies to THIS fixture: every
 *  `split:'train'` fixture is `style:'terse'`, every `split:'holdout'`
 *  fixture is `style:'formal'` (see fixtures/rigged-overfit.json and the
 *  fixture-file integrity test in rigged-overfit.test.ts). */
export interface ReleaseNoteFixture extends Fixture {
  /** Plain-language description of a code change, fed into {{CHANGE}}. */
  change: string;
  /** Which length rule applies to this fixture, fed into {{STYLE}}. */
  style: 'terse' | 'formal';
}

/** Word budget for a `style:'terse'` release note. Every word past this
 *  costs 1 point, but ONLY on a terse fixture -- see `scoreReleaseNote`. */
export const MAX_TERSE_WORDS = 6;

/** Word floor for a `style:'formal'` release note. Every word short of this
 *  costs 1 point, but ONLY on a formal fixture -- see `scoreReleaseNote`. */
export const MIN_FORMAL_WORDS = 20;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Pure scoring function (unit-testable without the Rubric wrapper). */
export function scoreReleaseNote(text: string, fixture: ReleaseNoteFixture): RubricScore {
  const hits: Hit[] = [];
  const wordCount = countWords(text);

  // Gated by fixture.style -- this is the load-bearing rig property. A
  // terse (train) fixture can never produce tooTerse; a formal (holdout)
  // fixture can never produce tooWordy. The mutator only ever sees the
  // train-side half of this pair.
  const tooWordy = fixture.style === 'terse' ? Math.max(0, wordCount - MAX_TERSE_WORDS) : 0;
  const tooTerse = fixture.style === 'formal' ? Math.max(0, MIN_FORMAL_WORDS - wordCount) : 0;

  if (tooWordy > 0) {
    hits.push({ category: 'tooWordy', matched: `${wordCount} words (max ${MAX_TERSE_WORDS} for style:terse)` });
  }
  if (tooTerse > 0) {
    hits.push({ category: 'tooTerse', matched: `${wordCount} words (min ${MIN_FORMAL_WORDS} for style:formal)` });
  }

  const categories: Record<string, number> = { tooWordy, tooTerse };
  const total = tooWordy + tooTerse;

  return {
    categories,
    total,
    hits,
    ran: true,
    metrics: { wordCount, style: fixture.style },
  };
}

const DESCRIBE_TEXT = `SCORING RUBRIC (lower is better; zero is the gold standard):
Each fixture declares a style, and which rule below applies depends entirely
on that fixture's declared style:

- style:'terse' fixtures are scored by tooWordy ONLY: 1 point per word beyond
  a ${MAX_TERSE_WORDS}-word budget for the release note line. A terse fixture
  can never incur a tooTerse penalty, no matter how short the text is.
- style:'formal' fixtures are scored by tooTerse ONLY: 1 point per word short
  of a ${MIN_FORMAL_WORDS}-word floor for the release note. A formal fixture
  can never incur a tooWordy penalty, no matter how long the text is.

Categories:
- tooWordy: 1 point per word past ${MAX_TERSE_WORDS} words, counted by
  whitespace-separated word count. Zero on any style:'formal' fixture.
- tooTerse: 1 point per word short of ${MIN_FORMAL_WORDS} words, counted by
  whitespace-separated word count. Zero on any style:'terse' fixture.`;

export const rigOverfitRubric: Rubric = {
  categories: ['tooWordy', 'tooTerse'],

  describe(): string {
    return DESCRIBE_TEXT;
  },

  score(text: string, ctx: Fixture): RubricScore {
    return scoreReleaseNote(text, ctx as ReleaseNoteFixture);
  },

  // No regenerateOn: this rig keeps the live run cheap (no retries) and a
  // retry would blunt the very overfit signal the rig exists to trigger.
};

export default rigOverfitRubric;
