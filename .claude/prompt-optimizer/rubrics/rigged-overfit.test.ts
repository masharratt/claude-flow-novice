/**
 * Tests for the rigged-overfit rubric v2 (engine Rubric contract). Pure
 * word-count scoring -- no network calls, nothing to mock.
 *
 * The load-bearing property of the whole rig lives in the "load-bearing rig
 * property" describe block below: a style:'terse' (train-shaped) fixture can
 * NEVER produce a `tooTerse` hit, and a style:'formal' (holdout-shaped)
 * fixture can NEVER produce a `tooWordy` hit, no matter what text is scored.
 * If either half of that property ever breaks, the mutator gains train-side
 * evidence for the category it is supposed to be structurally blind to, and
 * the OVERFIT refusal this rig exists to trigger will stop firing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scoreReleaseNote,
  rigOverfitRubric,
  MAX_TERSE_WORDS,
  MIN_FORMAL_WORDS,
  type ReleaseNoteFixture,
} from './rigged-overfit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = resolve(__dirname, '..', 'fixtures', 'rigged-overfit.json');

const TERSE_FIXTURE: ReleaseNoteFixture = {
  id: 'rubric-test-terse',
  split: 'train',
  change: 'Fixed a rounding error in the cart total calculation.',
  style: 'terse',
};

const FORMAL_FIXTURE: ReleaseNoteFixture = {
  id: 'rubric-test-formal',
  split: 'holdout',
  change: 'Fixed a rounding error in the cart total calculation.',
  style: 'formal',
};

function scoreTerse(text: string) {
  return scoreReleaseNote(text, TERSE_FIXTURE);
}

function scoreFormal(text: string) {
  return scoreReleaseNote(text, FORMAL_FIXTURE);
}

describe('rigOverfitRubric - tooWordy (boundary, terse fixture)', () => {
  it('is 0 at exactly 6 words (MAX_TERSE_WORDS)', () => {
    expect(MAX_TERSE_WORDS).toBe(6);
    const s = scoreTerse('Fixed the cart total rounding bug.'); // 6 words
    expect(s.categories.tooWordy).toBe(0);
  });

  it('is 1 at exactly 7 words', () => {
    const s = scoreTerse('Fixed the cart total rounding bug today.'); // 7 words
    expect(s.categories.tooWordy).toBe(1);
  });

  it('scales 1 point per word past the budget', () => {
    const s = scoreTerse('Fixed the cart total rounding bug for everyone today.'); // 9 words
    expect(s.categories.tooWordy).toBe(3);
  });

  it('is 0 for a line under the budget', () => {
    const s = scoreTerse('Fixed rounding.'); // 2 words
    expect(s.categories.tooWordy).toBe(0);
  });
});

describe('rigOverfitRubric - tooTerse (boundary, formal fixture)', () => {
  it('is 0 at exactly 20 words (MIN_FORMAL_WORDS)', () => {
    expect(MIN_FORMAL_WORDS).toBe(20);
    // 20 words.
    const s = scoreFormal(
      'This release fixes a rounding error in the cart total calculation so customers are charged the correct amount every time.',
    );
    expect(s.categories.tooTerse).toBe(0);
  });

  it('is 1 at exactly 19 words', () => {
    // 19 words.
    const s = scoreFormal(
      'This release fixes a rounding error in the cart total calculation so customers are charged the correct amount every.',
    );
    expect(s.categories.tooTerse).toBe(1);
  });

  it('scales 1 point per word short of the floor', () => {
    // 16 words -> 4 short of 20.
    const s = scoreFormal(
      'This release fixes a rounding error in the cart total calculation so customers are charged correctly.',
    );
    expect(s.categories.tooTerse).toBe(4);
  });

  it('is 0 for a line at or over the floor', () => {
    // 28 words, well over the 20-word floor.
    const s = scoreFormal(
      'This release fixes a rounding error in the cart total calculation so that every customer is charged the exact correct amount on every single order from now on.',
    );
    expect(s.categories.tooTerse).toBe(0);
  });
});

describe('rigOverfitRubric - total + hits', () => {
  it('total is the sum of tooWordy and tooTerse', () => {
    const s = scoreTerse('Fixed the cart total rounding bug for everyone today.'); // 9 words, terse
    expect(s.categories.tooWordy).toBe(3);
    expect(s.categories.tooTerse).toBe(0);
    expect(s.total).toBe(3);
  });

  it('hits carries a tooWordy entry when tooWordy fires', () => {
    const s = scoreTerse('Fixed the cart total rounding bug today.');
    expect(s.hits.some(h => h.category === 'tooWordy')).toBe(true);
  });

  it('hits carries a tooTerse entry when tooTerse fires', () => {
    const s = scoreFormal('Fixed the cart total rounding bug.');
    const hit = s.hits.find(h => h.category === 'tooTerse');
    expect(hit).toBeDefined();
    expect(hit!.matched).toContain('words');
  });

  it('hits is empty when a terse fixture text is within budget', () => {
    const s = scoreTerse('Fixed rounding.');
    expect(s.hits).toEqual([]);
    expect(s.total).toBe(0);
  });

  it('ran is always true (extraction, not the rubric, handles the no-run tri-state)', () => {
    expect(scoreTerse('Fixed the cart total rounding bug.').ran).toBe(true);
    expect(scoreFormal('').ran).toBe(true);
  });

  it('metrics reports the word count and style', () => {
    const s = scoreTerse('Fixed the cart total rounding bug.'); // 6 words
    expect(s.metrics).toEqual({ wordCount: 6, style: 'terse' });
  });
});

describe('rigOverfitRubric - engine contract', () => {
  it('categories lists exactly tooWordy and tooTerse', () => {
    expect([...rigOverfitRubric.categories].sort()).toEqual(['tooTerse', 'tooWordy'].sort());
  });

  it('describe() honestly documents BOTH categories and both thresholds', () => {
    const text = rigOverfitRubric.describe();
    expect(text.length).toBeGreaterThan(20);
    expect(text).toContain('tooWordy');
    expect(text).toContain('tooTerse');
    expect(text).toContain(String(MAX_TERSE_WORDS));
    expect(text).toContain(String(MIN_FORMAL_WORDS));
  });

  it('omits regenerateOn (no retries, keeps the live run cheap)', () => {
    expect(rigOverfitRubric.regenerateOn).toBeUndefined();
  });

  it('score() via the Rubric wrapper matches the pure scoring function', () => {
    const text = 'Fixed the cart total rounding bug.';
    const viaRubric = rigOverfitRubric.score(text, FORMAL_FIXTURE);
    const viaPure = scoreReleaseNote(text, FORMAL_FIXTURE);
    expect(viaRubric).toEqual(viaPure);
  });

  it('a fully clean terse example (short) scores total 0', () => {
    const s = scoreTerse('Fix cart rounding.');
    expect(s.total).toBe(0);
  });

  it('a fully clean formal example (25+ words) scores total 0', () => {
    const s = scoreFormal(
      'This release fixes a rounding error in the cart total calculation so that every customer is charged the exact correct amount on every single order from now on.',
    );
    expect(s.total).toBe(0);
  });
});

describe('rigOverfitRubric - load-bearing rig property', () => {
  // THIS IS THE PROPERTY THE ENTIRE RIG DEPENDS ON: a style:'terse'
  // (train-shaped) fixture must NEVER produce a tooTerse hit, and a
  // style:'formal' (holdout-shaped) fixture must NEVER produce a tooWordy
  // hit, for ANY text. Train fixtures are 100% terse and holdout fixtures
  // are 100% formal, so if this property ever breaks the mutator gains
  // train-side evidence for a category it is supposed to be structurally
  // blind to, and the OVERFIT refusal this rig exists to trigger stops
  // firing.
  it('a terse fixture never produces a tooTerse hit, across varied text lengths', () => {
    const samples = [
      '',
      'x',
      'Fixed rounding.',
      'Fixed the cart total rounding bug for everyone today.',
      'This release fixes a rounding error in the cart total calculation so customers are charged correctly every single time without exception.',
    ];
    for (const text of samples) {
      const s = scoreTerse(text);
      expect(s.categories.tooTerse).toBe(0);
      expect(s.hits.some(h => h.category === 'tooTerse')).toBe(false);
    }
  });

  it('a formal fixture never produces a tooWordy hit, across varied text lengths', () => {
    const samples = [
      '',
      'x',
      'Fixed rounding.',
      'Fixed the cart total rounding bug for everyone today.',
      'This release fixes a rounding error in the cart total calculation so customers are charged correctly every single time without exception, no matter how large the order or how many items are in the cart at checkout.',
    ];
    for (const text of samples) {
      const s = scoreFormal(text);
      expect(s.categories.tooWordy).toBe(0);
      expect(s.hits.some(h => h.category === 'tooWordy')).toBe(false);
    }
  });
});

describe('rigOverfitRubric - fixture-file integrity', () => {
  // If this test ever fails, the fixtures file has drifted from the
  // train:terse / holdout:formal split the rig depends on, and the rig
  // silently stops testing the OVERFIT path -- it would keep passing while
  // testing nothing.
  it('every train fixture is style:terse and every holdout fixture is style:formal', () => {
    const raw = readFileSync(FIXTURES_PATH, 'utf8');
    const fixtures: ReleaseNoteFixture[] = JSON.parse(raw);

    expect(fixtures.length).toBeGreaterThan(0);

    const train = fixtures.filter(f => f.split === 'train');
    const holdout = fixtures.filter(f => f.split === 'holdout');

    expect(train.length).toBeGreaterThan(0);
    expect(holdout.length).toBeGreaterThan(0);

    for (const f of train) {
      expect(f.style).toBe('terse');
    }
    for (const f of holdout) {
      expect(f.style).toBe('formal');
    }
  });
});
