import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateTemplate, selectWorst, EVAL_TEMPERATURE } from './eval.js';
import { BudgetTracker } from './budget.js';
import type { Target, Rubric, Fixture, GenerateOptions, GenerateResult, ExtractResult, RubricScore } from './types.js';

// Synthetic-only fixtures per project fixture convention. No real entity ids.
function fixture(id: string, split: 'train' | 'holdout' = 'train'): Fixture {
  return { id, split };
}

let tmpDir: string;
let budgetPath: string;
let budget: BudgetTracker;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'prompt-optimizer-eval-test-'));
  budgetPath = join(tmpDir, '_budget.json');
  budget = new BudgetTracker(budgetPath, 100);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeGenResult(raw: string): GenerateResult {
  return { raw, model: 'mock-model', inputTokens: 10, outputTokens: 5, cost: 0.001 };
}

describe('evaluateTemplate — temperature pinning (FIX #3)', () => {
  it('always calls target.generate with temperature 0 regardless of a plugin default', async () => {
    const seenTemperatures: number[] = [];
    const target: Target = {
      id: 'mock-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (_prompt: string, options: GenerateOptions): Promise<GenerateResult> => {
        seenTemperatures.push(options.temperature);
        return makeGenResult('clean output');
      },
      extractScript: (raw: string): ExtractResult => ({ ok: true, text: raw }),
    };
    const rubric: Rubric = {
      categories: ['foo'],
      describe: () => 'scores foo',
      score: (): RubricScore => ({ categories: { foo: 0 }, total: 0, hits: [], ran: true }),
    };

    await evaluateTemplate(target, rubric, 'tpl', [fixture('f1')], budget);

    expect(EVAL_TEMPERATURE).toBe(0);
    expect(seenTemperatures.every(t => t === 0)).toBe(true);
  });
});

describe('evaluateTemplate — L2: Target.evalTemperature contract field', () => {
  it('uses target.evalTemperature for eval calls when declared, instead of the engine temperature-0 default', async () => {
    const seenTemperatures: number[] = [];
    const target: Target = {
      id: 'kimi-like-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (_prompt: string, options: GenerateOptions): Promise<GenerateResult> => {
        seenTemperatures.push(options.temperature);
        return makeGenResult('clean output');
      },
      extractScript: (raw: string): ExtractResult => ({ ok: true, text: raw }),
      evalTemperature: 1,
    };
    const rubric: Rubric = {
      categories: ['foo'],
      describe: () => 'scores foo',
      score: (): RubricScore => ({ categories: { foo: 0 }, total: 0, hits: [], ran: true }),
    };

    await evaluateTemplate(target, rubric, 'tpl', [fixture('f1')], budget);

    expect(seenTemperatures.every(t => t === 1)).toBe(true);
  });

  it('falls back to the engine EVAL_TEMPERATURE (0) when evalTemperature is absent (existing plugins unaffected)', async () => {
    const seenTemperatures: number[] = [];
    const target: Target = {
      id: 'legacy-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (_prompt: string, options: GenerateOptions): Promise<GenerateResult> => {
        seenTemperatures.push(options.temperature);
        return makeGenResult('clean output');
      },
      extractScript: (raw: string): ExtractResult => ({ ok: true, text: raw }),
      // no evalTemperature declared
    };
    const rubric: Rubric = {
      categories: ['foo'],
      describe: () => 'scores foo',
      score: (): RubricScore => ({ categories: { foo: 0 }, total: 0, hits: [], ran: true }),
    };

    await evaluateTemplate(target, rubric, 'tpl', [fixture('f1')], budget);

    expect(seenTemperatures.every(t => t === EVAL_TEMPERATURE)).toBe(true);
  });

  it('reports the effective evalTemperature used on the EvalResult so callers can detect nondeterministic scoring', async () => {
    const target: Target = {
      id: 'kimi-like-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (): Promise<GenerateResult> => makeGenResult('clean output'),
      extractScript: (raw: string): ExtractResult => ({ ok: true, text: raw }),
      evalTemperature: 1,
    };
    const rubric: Rubric = {
      categories: ['foo'],
      describe: () => 'scores foo',
      score: (): RubricScore => ({ categories: { foo: 0 }, total: 0, hits: [], ran: true }),
    };

    const result = await evaluateTemplate(target, rubric, 'tpl', [fixture('f1')], budget);
    expect(result.evalTemperature).toBe(1);
  });

  it('also uses evalTemperature on the reject-and-regenerate retry call (FIX #4 interaction)', async () => {
    const seenTemperatures: number[] = [];
    let call = 0;
    const target: Target = {
      id: 'kimi-like-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (_prompt: string, options: GenerateOptions): Promise<GenerateResult> => {
        seenTemperatures.push(options.temperature);
        call += 1;
        return makeGenResult(call === 1 ? 'bad output' : 'good output');
      },
      extractScript: (raw: string): ExtractResult => ({ ok: true, text: raw }),
      evalTemperature: 1,
    };
    const rubric: Rubric = {
      categories: ['flagged'],
      describe: () => 'scores flagged',
      regenerateOn: ['flagged'],
      score: (text: string): RubricScore =>
        text === 'bad output'
          ? { categories: { flagged: 1 }, total: 1, hits: [{ category: 'flagged', matched: 'bad output' }], ran: true }
          : { categories: { flagged: 0 }, total: 0, hits: [], ran: true },
    };

    await evaluateTemplate(target, rubric, 'tpl', [fixture('f1')], budget);

    expect(call).toBe(2);
    expect(seenTemperatures).toEqual([1, 1]);
  });
});

describe('evaluateTemplate — tri-state no-run exclusion (FIX #2)', () => {
  it('excludes an ok:false extraction from the aggregate and counts it separately', async () => {
    const target: Target = {
      id: 'mock-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (): Promise<GenerateResult> => makeGenResult('I refuse to answer.'),
      extractScript: (raw: string): ExtractResult =>
        raw.includes('refuse') ? { ok: false, reason: 'refusal' } : { ok: true, text: raw },
    };
    const rubric: Rubric = {
      categories: ['foo'],
      describe: () => 'scores foo',
      score: (): RubricScore => ({ categories: { foo: 5 }, total: 5, hits: [], ran: true }),
    };

    const result = await evaluateTemplate(target, rubric, 'tpl', [fixture('f1'), fixture('f2'), fixture('f3')], budget);

    // All three fixtures produce a refusal -> all excluded, none scored "clean".
    expect(result.aggregate.ranCount).toBe(0);
    expect(result.aggregate.excludedCount).toBe(3);
    expect(result.aggregate.total).toBe(0);
    expect(result.perFixture.every(p => p.score.ran === false)).toBe(true);
  });

  it('aborts the eval when fewer than 50% of fixtures ran', async () => {
    let call = 0;
    const target: Target = {
      id: 'mock-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (): Promise<GenerateResult> => {
        call += 1;
        return makeGenResult(call === 1 ? 'good output' : 'refuse');
      },
      extractScript: (raw: string): ExtractResult =>
        raw === 'refuse' ? { ok: false, reason: 'refusal' } : { ok: true, text: raw },
    };
    const rubric: Rubric = {
      categories: ['foo'],
      describe: () => 'scores foo',
      score: (): RubricScore => ({ categories: { foo: 0 }, total: 0, hits: [], ran: true }),
    };

    // 1 of 3 fixtures runs clean (33%), below the 50% threshold -> abort.
    const result = await evaluateTemplate(
      target,
      rubric,
      'tpl',
      [fixture('f1'), fixture('f2'), fixture('f3')],
      budget,
      { concurrency: 1 },
    );

    expect(result.aborted).toBe(true);
    expect(result.abortReason).toMatch(/1\/3/);
  });

  it('does not abort when at least 50% of fixtures ran', async () => {
    let call = 0;
    const target: Target = {
      id: 'mock-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (): Promise<GenerateResult> => {
        call += 1;
        return makeGenResult(call <= 2 ? 'good output' : 'refuse');
      },
      extractScript: (raw: string): ExtractResult =>
        raw === 'refuse' ? { ok: false, reason: 'refusal' } : { ok: true, text: raw },
    };
    const rubric: Rubric = {
      categories: ['foo'],
      describe: () => 'scores foo',
      score: (): RubricScore => ({ categories: { foo: 0 }, total: 0, hits: [], ran: true }),
    };

    const result = await evaluateTemplate(
      target,
      rubric,
      'tpl',
      [fixture('f1'), fixture('f2'), fixture('f3'), fixture('f4')],
      budget,
      { concurrency: 1 },
    );

    expect(result.aborted).toBe(false);
    expect(result.aggregate.ranCount).toBe(2);
    expect(result.aggregate.excludedCount).toBe(2);
  });
});

describe('evaluateTemplate — reject-and-regenerate (FIX #4)', () => {
  it('regenerates ONCE with the corrective nudge appended when a regenerateOn category is hit, and rescopes to the retry result', async () => {
    const promptsSeen: string[] = [];
    let call = 0;
    const target: Target = {
      id: 'mock-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (prompt: string): Promise<GenerateResult> => {
        promptsSeen.push(prompt);
        call += 1;
        return makeGenResult(call === 1 ? 'bad output' : 'good output');
      },
      extractScript: (raw: string): ExtractResult => ({ ok: true, text: raw }),
    };
    const rubric: Rubric = {
      categories: ['flagged'],
      describe: () => 'scores flagged',
      regenerateOn: ['flagged'],
      score: (text: string): RubricScore =>
        text === 'bad output'
          ? { categories: { flagged: 1 }, total: 1, hits: [{ category: 'flagged', matched: 'bad output' }], ran: true }
          : { categories: { flagged: 0 }, total: 0, hits: [], ran: true },
    };

    const result = await evaluateTemplate(target, rubric, 'tpl', [fixture('f1')], budget, {
      regenerateNudge: '\n\nNUDGE: fix it.',
    });

    expect(call).toBe(2); // exactly one retry, not more
    expect(promptsSeen[1]).toContain('NUDGE: fix it.');
    expect(result.perFixture[0]!.regenerated).toBe(true);
    expect(result.perFixture[0]!.text).toBe('good output');
    expect(result.aggregate.categoryTotals.flagged).toBe(0);
  });

  it('is bounded to exactly 1 retry: scores the regenerated result as-is even if it still hits regenerateOn', async () => {
    let call = 0;
    const target: Target = {
      id: 'mock-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (): Promise<GenerateResult> => {
        call += 1;
        return makeGenResult('always bad');
      },
      extractScript: (raw: string): ExtractResult => ({ ok: true, text: raw }),
    };
    const rubric: Rubric = {
      categories: ['flagged'],
      describe: () => 'scores flagged',
      regenerateOn: ['flagged'],
      score: (): RubricScore => ({
        categories: { flagged: 1 },
        total: 1,
        hits: [{ category: 'flagged', matched: 'always bad' }],
        ran: true,
      }),
    };

    const result = await evaluateTemplate(target, rubric, 'tpl', [fixture('f1')], budget);

    expect(call).toBe(2); // 1 original + 1 retry, never a second retry
    expect(result.perFixture[0]!.regenerated).toBe(true);
    expect(result.aggregate.categoryTotals.flagged).toBe(1); // scored as-is post single retry
  });

  it('never regenerates when the rubric has no regenerateOn categories', async () => {
    let call = 0;
    const target: Target = {
      id: 'mock-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (): Promise<GenerateResult> => {
        call += 1;
        return makeGenResult('bad output');
      },
      extractScript: (raw: string): ExtractResult => ({ ok: true, text: raw }),
    };
    const rubric: Rubric = {
      categories: ['flagged'],
      describe: () => 'scores flagged',
      score: (): RubricScore => ({
        categories: { flagged: 1 },
        total: 1,
        hits: [{ category: 'flagged', matched: 'bad output' }],
        ran: true,
      }),
    };

    await evaluateTemplate(target, rubric, 'tpl', [fixture('f1')], budget);
    expect(call).toBe(1);
  });
});

describe('selectWorst', () => {
  it('returns only ran fixtures, sorted worst-first, capped at k', async () => {
    const target: Target = {
      id: 'mock-target',
      loadTemplate: () => 'tpl',
      renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
      generate: async (_prompt: string, _o): Promise<GenerateResult> => makeGenResult('x'),
      extractScript: (): ExtractResult => ({ ok: true, text: 'x' }),
    };
    const scores: Record<string, number> = { f1: 3, f2: 9, f3: 1 };
    const rubric: Rubric = {
      categories: ['foo'],
      describe: () => '',
      score: (_text, ctx): RubricScore => ({
        categories: { foo: scores[ctx.id as string]! },
        total: scores[ctx.id as string]!,
        hits: [],
        ran: true,
      }),
    };

    const result = await evaluateTemplate(
      target,
      rubric,
      'tpl',
      [fixture('f1'), fixture('f2'), fixture('f3')],
      budget,
    );
    const worst = selectWorst(result, 2);
    expect(worst.map(w => w.fixture.id)).toEqual(['f2', 'f1']);
  });
});
