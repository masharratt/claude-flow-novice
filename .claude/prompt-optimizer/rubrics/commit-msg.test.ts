/**
 * Tests for the commit-msg rubric (engine Rubric contract). Pure
 * regex/string scoring -- no network calls, nothing to mock.
 */
import { describe, it, expect } from 'vitest';
import { scoreCommitMessage, commitMsgRubric, type CommitMsgFixture } from './commit-msg.js';

const FIXTURE: CommitMsgFixture = {
  id: 'rubric-test-fixture',
  split: 'train',
  files: ['src/foo/bar.ts', 'tests/foo/bar.test.ts'],
  diffSummary: 'bar.ts threw on empty input; added a guard and a regression test.',
  changeType: 'bugfix',
};

function score(text: string) {
  return scoreCommitMessage(text, FIXTURE);
}

describe('commitMsgRubric - badType', () => {
  it('fires when the subject has no conventional-commit type prefix', () => {
    const s = score('Refactor the bar module for clarity\n\nSplit out the helper for testability.');
    expect(s.categories.badType).toBeGreaterThanOrEqual(1);
  });

  it('stays clean when the subject has a valid type prefix', () => {
    const s = score(
      'refactor(foo): split bar module for testability\n\nExtracted the helper so it can be unit tested alone.',
    );
    expect(s.categories.badType).toBe(0);
  });
});

describe('commitMsgRubric - subjectTooLong', () => {
  const longSubject = 'fix(foo): ' + 'x'.repeat(70);

  it('fires when the subject line exceeds 72 characters', () => {
    const s = score(`${longSubject}\n\nExplaining why this change was needed in detail.`);
    expect(s.categories.subjectTooLong).toBe(1);
  });

  it('stays clean when the subject line is within 72 characters', () => {
    const s = score('fix(foo): guard bar against empty input\n\nExplaining why this change was needed in detail.');
    expect(s.categories.subjectTooLong).toBe(0);
  });
});

describe('commitMsgRubric - notImperative', () => {
  it('fires on a past-tense/gerund verb in the description', () => {
    const s = score('fix(foo): added a guard for empty input\n\nExplaining why this change was needed.');
    expect(s.categories.notImperative).toBeGreaterThanOrEqual(1);
  });

  it('stays clean on an imperative-mood description', () => {
    const s = score('fix(foo): add a guard for empty input\n\nExplaining why this change was needed.');
    expect(s.categories.notImperative).toBe(0);
  });
});

describe('commitMsgRubric - emDash', () => {
  it('fires when an em dash character is present', () => {
    const s = score('fix(foo): guard bar — handles empty input\n\nExplaining why this change was needed.');
    expect(s.categories.emDash).toBeGreaterThanOrEqual(1);
  });

  it('fires on the literal &mdash; entity too', () => {
    const s = score('fix(foo): guard bar &mdash; handles empty input\n\nExplaining why this change was needed.');
    expect(s.categories.emDash).toBeGreaterThanOrEqual(1);
  });

  it('stays clean when no em dash is present', () => {
    const s = score('fix(foo): guard bar, handles empty input\n\nExplaining why this change was needed.');
    expect(s.categories.emDash).toBe(0);
  });
});

describe('commitMsgRubric - whatNotWhy', () => {
  it('fires when the body is absent', () => {
    const s = score('fix(foo): guard bar against empty input');
    expect(s.categories.whatNotWhy).toBe(1);
  });

  it('fires when the body only restates the changed file names', () => {
    const s = score('fix(foo): guard bar against empty input\n\nModified bar.ts and bar.test.ts.');
    expect(s.categories.whatNotWhy).toBe(1);
  });

  it('stays clean when the body explains why the change was needed', () => {
    const s = score(
      'fix(foo): guard bar against empty input\n\n' +
        'bar.ts threw a TypeError whenever the caller passed an empty array, which happened whenever a ' +
        'customer had zero saved items; added an explicit length check before the loop runs.',
    );
    expect(s.categories.whatNotWhy).toBe(0);
  });
});

describe('commitMsgRubric - filler', () => {
  it('fires on banned filler words', () => {
    const s = score('fix(foo): just basically add a guard\n\nExplaining why this change was really needed.');
    expect(s.categories.filler).toBeGreaterThanOrEqual(1);
  });

  it('stays clean when no filler words are present', () => {
    const s = score('fix(foo): add a guard for empty input\n\nExplaining why this change was needed in detail.');
    expect(s.categories.filler).toBe(0);
  });
});

describe('commitMsgRubric - engine contract', () => {
  it('describe() returns a non-empty gold-standard summary', () => {
    expect(commitMsgRubric.describe().length).toBeGreaterThan(20);
  });

  it('regenerateOn includes badType at minimum', () => {
    expect(commitMsgRubric.regenerateOn).toContain('badType');
  });

  it('categories lists exactly the six scored categories', () => {
    expect([...commitMsgRubric.categories].sort()).toEqual(
      ['badType', 'emDash', 'filler', 'notImperative', 'subjectTooLong', 'whatNotWhy'].sort(),
    );
  });

  it('score() via the Rubric wrapper matches the pure scoring function', () => {
    const text = 'fix(foo): add a guard for empty input\n\nExplaining why this change was needed in detail.';
    const viaRubric = commitMsgRubric.score(text, FIXTURE);
    const viaPure = scoreCommitMessage(text, FIXTURE);
    expect(viaRubric).toEqual(viaPure);
  });

  it('a fully clean message scores total 0 across all categories', () => {
    const text =
      'fix(foo): guard bar against empty input\n\n' +
      'bar.ts threw when the caller passed an empty array (zero saved items is a common case); ' +
      'added an explicit length check before the loop runs.';
    const s = score(text);
    expect(s.total).toBe(0);
    expect(s.ran).toBe(true);
  });
});
