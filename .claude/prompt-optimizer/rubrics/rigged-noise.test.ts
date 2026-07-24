/**
 * Tests for the rigged-noise rubric v3 (engine Rubric contract). Pure string
 * scoring -- no network calls, nothing to mock.
 *
 * The load-bearing property of the whole rig lives in the "flat optimum"
 * describe block below: because exactly half the fixtures in each split want a
 * comma and half want none, a template driving comma incidence to ANY value
 * leaves the same expected number of violations. If that 50/50 balance ever
 * drifts, the optimum stops being flat, the mutator can find a real win, the
 * candidate stops being statistically indistinguishable from the baseline, and
 * the INCONCLUSIVE (mixed-repeats) refusal this rig exists to trigger stops
 * firing -- silently, while every other test still passes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreBlurb, rigidNoiseRubric, type BlurbFixture } from './rigged-noise.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = resolve(__dirname, '..', 'fixtures', 'rigged-noise.json');

const WANTS_COMMA: BlurbFixture = {
  id: 'wants-comma-fixture',
  split: 'train',
  wantsComma: true,
  product: 'Brightleaf Ledger',
  audience: 'small farm owners doing their own bookkeeping',
  detail: 'Tracks seasonal income and expenses and generates a tax-ready summary at year end.',
};

const WANTS_NO_COMMA: BlurbFixture = { ...WANTS_COMMA, id: 'wants-no-comma-fixture', wantsComma: false };

describe('rigidNoiseRubric - commaMismatch (the load-bearing check)', () => {
  it('scores 0 when a wantsComma fixture gets a comma', () => {
    const s = scoreBlurb('Brightleaf Ledger tracks farm income, and makes tax season painless.', WANTS_COMMA);
    expect(s.categories.commaMismatch).toBe(0);
  });

  it('scores 1 when a wantsComma fixture gets no comma', () => {
    const s = scoreBlurb('Brightleaf Ledger tracks farm income and makes tax season painless.', WANTS_COMMA);
    expect(s.categories.commaMismatch).toBe(1);
  });

  it('scores 0 when a no-comma fixture gets no comma', () => {
    const s = scoreBlurb('Brightleaf Ledger tracks farm income and makes tax season painless.', WANTS_NO_COMMA);
    expect(s.categories.commaMismatch).toBe(0);
  });

  it('scores 1 when a no-comma fixture gets a comma', () => {
    const s = scoreBlurb('Brightleaf Ledger tracks farm income, and makes tax season painless.', WANTS_NO_COMMA);
    expect(s.categories.commaMismatch).toBe(1);
  });

  it('treats the SAME blurb as a violation for one population and clean for the other', () => {
    // The entire rig in one assertion: the text is fixed, only the fixture's
    // hidden population differs, and the score inverts. No template can be
    // right for both, because renderPrompt never reveals which is which.
    const text = 'Brightleaf Ledger tracks farm income, and makes tax season painless.';
    expect(scoreBlurb(text, WANTS_COMMA).total).toBe(0);
    expect(scoreBlurb(text, WANTS_NO_COMMA).total).toBe(1);
  });
});

describe('rigidNoiseRubric - the flat-optimum property (why this rig is unlearnable)', () => {
  // THE FLAT OPTIMUM: with half the fixtures wanting a comma, a template that
  // always emits one and a template that never emits one score IDENTICALLY.
  // That is what makes any measured train win pure noise, which is exactly the
  // case the INCONCLUSIVE (mixed-repeats) refusal exists to catch.
  const half: BlurbFixture[] = [
    { ...WANTS_COMMA, id: 'a', wantsComma: true },
    { ...WANTS_COMMA, id: 'b', wantsComma: true },
    { ...WANTS_COMMA, id: 'c', wantsComma: false },
    { ...WANTS_COMMA, id: 'd', wantsComma: false },
  ];
  const totalFor = (text: string) => half.reduce((sum, f) => sum + scoreBlurb(text, f).total, 0);

  it('an always-comma template and a never-comma template score exactly the same', () => {
    const alwaysComma = 'Brightleaf Ledger tracks income, simply.';
    const neverComma = 'Brightleaf Ledger tracks income simply.';
    expect(totalFor(alwaysComma)).toBe(2);
    expect(totalFor(neverComma)).toBe(2);
    expect(totalFor(alwaysComma)).toBe(totalFor(neverComma));
  });

  it('neither extreme can reach a perfect score, so there is no instruction to find', () => {
    expect(totalFor('has a comma, here')).toBeGreaterThan(0);
    expect(totalFor('has no comma here')).toBeGreaterThan(0);
  });
});

describe('rigidNoiseRubric - total, hits, metrics', () => {
  it('total equals the single category', () => {
    const s = scoreBlurb('no comma here', WANTS_COMMA);
    expect(s.total).toBe(s.categories.commaMismatch);
    expect(s.total).toBe(1);
  });

  it('hits carries one Hit naming commaMismatch when it fires', () => {
    const s = scoreBlurb('no comma here', WANTS_COMMA);
    expect(s.hits.map(h => h.category)).toEqual(['commaMismatch']);
  });

  it('hits is empty when nothing fired', () => {
    expect(scoreBlurb('a blurb, with a comma', WANTS_COMMA).hits).toEqual([]);
  });

  it('ran is always true (the rubric never produces the no-run tri-state)', () => {
    expect(scoreBlurb('anything at all', WANTS_NO_COMMA).ran).toBe(true);
  });

  it('metrics reports whether a comma was present', () => {
    expect(scoreBlurb('a blurb, with a comma', WANTS_COMMA).metrics).toEqual({ hasComma: 1 });
    expect(scoreBlurb('a blurb with none', WANTS_NO_COMMA).metrics).toEqual({ hasComma: 0 });
  });
});

describe('rigidNoiseRubric - engine contract', () => {
  it('categories lists exactly commaMismatch', () => {
    // Single category on purpose: isImprovement rejects a candidate that
    // regresses on ANY category, so a second category would require both to
    // improve at once and would sharply cut the chance of the lucky train
    // accept this rig needs to reach the holdout gate at all.
    expect([...rigidNoiseRubric.categories]).toEqual(['commaMismatch']);
  });

  it('describe() honestly states the rule, including that the prompt cannot reveal the split', () => {
    const text = rigidNoiseRubric.describe();
    expect(text).toContain('commaMismatch');
    expect(text).toMatch(/half/i);
    // \s+ not a literal space: DESCRIBE_TEXT is hard-wrapped, so this phrase
    // straddles a newline.
    expect(text).toMatch(/nothing\s+in the prompt/i);
  });

  it('describe() does not leak a per-example signal a template could condition on', () => {
    // The rig must stay honest AND unactionable. If describe() ever named the
    // fixture ids or the field, the mutator could write a conditional and win
    // legitimately -- the exact failure mode that killed the v2 OVERFIT rig.
    const text = rigidNoiseRubric.describe();
    expect(text).not.toContain('wantsComma');
    expect(text).not.toMatch(/holdout-|train-/);
  });

  it('regenerateOn is omitted (no retries, to keep the run-to-run noise honest)', () => {
    expect(rigidNoiseRubric.regenerateOn).toBeUndefined();
  });

  it('score() via the Rubric wrapper matches the pure scoring function', () => {
    const text = 'Brightleaf Ledger tracks income, simply.';
    expect(rigidNoiseRubric.score(text, WANTS_COMMA)).toEqual(scoreBlurb(text, WANTS_COMMA));
  });
});

describe('rigidNoiseRubric - fixture-file integrity', () => {
  // If this test fails, the fixtures file has drifted from the balance the rig
  // depends on. Any drift silently stops the rig from testing the INCONCLUSIVE
  // path while every other test still passes.
  it('has 8 train and 4 holdout fixtures', () => {
    const fixtures: BlurbFixture[] = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
    expect(fixtures.length).toBe(12);
    expect(fixtures.filter(f => f.split === 'train').length).toBe(8);
    // Small holdout on purpose: with only 4 examples, one flipped fixture
    // swings the total enough for two repeats to disagree.
    expect(fixtures.filter(f => f.split === 'holdout').length).toBe(4);
  });

  it('splits wantsComma exactly 50/50 WITHIN each split -- the flat optimum depends on it', () => {
    const fixtures: BlurbFixture[] = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
    for (const split of ['train', 'holdout'] as const) {
      const inSplit = fixtures.filter(f => f.split === split);
      const wanting = inSplit.filter(f => f.wantsComma === true).length;
      expect(wanting).toBe(inSplit.length / 2);
    }
  });

  it('declares wantsComma as a real boolean on every fixture', () => {
    const fixtures: BlurbFixture[] = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
    for (const f of fixtures) {
      expect(typeof f.wantsComma).toBe('boolean');
    }
  });
});
