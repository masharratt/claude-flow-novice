import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mutateTemplate, pickStrategy, detectPlaceholders, STRATEGY_ROTATION } from './mutator.js';
import { BudgetTracker } from './budget.js';
import type { Target, Rubric, GenerateOptions, GenerateResult, ExtractResult, Fixture } from './types.js';
import type { PerFixtureResult } from './eval.js';

let tmpDir: string;
let budget: BudgetTracker;

function setup() {
  tmpDir = mkdtempSync(join(tmpdir(), 'prompt-optimizer-mutator-test-'));
  budget = new BudgetTracker(join(tmpDir, '_budget.json'), 10);
}
function teardown() {
  rmSync(tmpDir, { recursive: true, force: true });
}

function worstResult(id: string, category: string, matched: string, text: string): PerFixtureResult {
  const fixture: Fixture = { id, split: 'train' };
  return {
    fixture,
    prompt: 'p',
    text,
    score: { categories: { [category]: 1 }, total: 1, hits: [{ category, matched }], ran: true },
    cost: 0,
    promptTokens: 0,
    regenerated: false,
  };
}

describe('pickStrategy / STRATEGY_ROTATION', () => {
  it('rotates through all 4 strategies before repeating', () => {
    const seen = new Set(Array.from({ length: STRATEGY_ROTATION.length }, (_, i) => pickStrategy(i)));
    expect(seen.size).toBe(STRATEGY_ROTATION.length);
    expect(pickStrategy(0)).toBe(pickStrategy(STRATEGY_ROTATION.length));
  });
});

describe('detectPlaceholders', () => {
  it('finds every {{TOKEN}} placeholder in a template with no external list needed', () => {
    const tpl = 'Hello {{NAME}}, your {{ITEM}} is ready. {{NAME}} again.';
    expect(detectPlaceholders(tpl).sort()).toEqual(['ITEM', 'NAME']);
  });

  it('returns an empty array for a template with no placeholders', () => {
    expect(detectPlaceholders('no tokens here')).toEqual([]);
  });
});

describe('mutateTemplate — rubric-agnostic (no hard-coded ban lists)', () => {
  it('feeds rubric.describe() into the meta-prompt instead of any engine-owned rubric text', async () => {
    setup();
    try {
      let seenPrompt = '';
      const target: Target = {
        id: 't',
        loadTemplate: () => 'tpl {{X}}',
        renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
        generate: async (prompt: string, _o: GenerateOptions): Promise<GenerateResult> => {
          seenPrompt = prompt;
          return {
            raw: '---DIAGNOSIS---\nd\n\n---STRATEGY---\ns\n\n---TEMPLATE---\nnew tpl {{X}}\n\n---RATIONALE---\nr',
            model: 'mock',
            inputTokens: 1,
            outputTokens: 1,
            cost: 0,
          };
        },
        extractScript: (raw: string): ExtractResult => ({ ok: true, text: raw }),
      };
      const describeText = 'THIS PROJECT-SPECIFIC RUBRIC TEXT MUST FLOW THROUGH VERBATIM';
      const rubric: Rubric = {
        categories: ['foo'],
        describe: () => describeText,
        score: () => ({ categories: {}, total: 0, hits: [], ran: true }),
      };

      await mutateTemplate(target, rubric, 'tpl {{X}}', [worstResult('f1', 'foo', 'bar', 'text with bar')], budget, {
        strategy: 'targeted-surgical',
      });

      expect(seenPrompt).toContain(describeText);
      // Engine source itself must never hard-code rubric-specific ban lists.
      expect(seenPrompt).not.toMatch(/BANNED_OPENERS|buildRubricReference/);
    } finally {
      teardown();
    }
  });

  it('parses DIAGNOSIS/STRATEGY/TEMPLATE/RATIONALE sections and flags placeholder preservation', async () => {
    setup();
    try {
      const target: Target = {
        id: 't',
        loadTemplate: () => 'tpl {{X}} {{Y}}',
        renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
        generate: async (): Promise<GenerateResult> => ({
          raw:
            '---DIAGNOSIS---\nSaw issue.\n\n---STRATEGY---\nFix it.\n\n---TEMPLATE---\nnew tpl {{X}} (missing Y)\n\n---RATIONALE---\nDone.',
          model: 'mock',
          inputTokens: 1,
          outputTokens: 1,
          cost: 0,
        }),
        extractScript: (raw: string): ExtractResult => ({ ok: true, text: raw }),
      };
      const rubric: Rubric = {
        categories: ['foo'],
        describe: () => 'desc',
        score: () => ({ categories: {}, total: 0, hits: [], ran: true }),
      };

      const result = await mutateTemplate(
        target,
        rubric,
        'tpl {{X}} {{Y}}',
        [worstResult('f1', 'foo', 'bar', 'text with bar')],
        budget,
      );

      expect(result.diagnosis).toBe('Saw issue.');
      expect(result.rationale).toBe('Done.');
      expect(result.newTemplate).toContain('{{X}}');
      // {{Y}} was dropped by the (mock) rewrite -> must be flagged, not silently accepted.
      expect(result.placeholdersPreserved).toBe(false);
    } finally {
      teardown();
    }
  });

  it('FINDING #2: rejects a mutated template that INTRODUCES a hallucinated placeholder absent from the original set', async () => {
    setup();
    try {
      const target: Target = {
        id: 't',
        loadTemplate: () => 'tpl {{X}}',
        renderPrompt: (tpl, fx) => ({ prompt: `${tpl}:${fx.id}` }),
        generate: async (): Promise<GenerateResult> => ({
          // Original template only has {{X}}. The LLM rewrite here keeps
          // {{X}} (nothing dropped) but ADDS a brand-new {{EXTRA_CONTEXT}}
          // token never present in the original template — this must NOT
          // be silently accepted, or the literal token leaks into
          // renderPrompt / plugin code downstream.
          raw:
            '---DIAGNOSIS---\nd\n\n---STRATEGY---\ns\n\n---TEMPLATE---\ntpl {{X}} {{EXTRA_CONTEXT}}\n\n---RATIONALE---\nr',
          model: 'mock',
          inputTokens: 1,
          outputTokens: 1,
          cost: 0,
        }),
        extractScript: (raw: string): ExtractResult => ({ ok: true, text: raw }),
      };
      const rubric: Rubric = {
        categories: ['foo'],
        describe: () => 'desc',
        score: () => ({ categories: {}, total: 0, hits: [], ran: true }),
      };

      const result = await mutateTemplate(
        target,
        rubric,
        'tpl {{X}}',
        [worstResult('f1', 'foo', 'bar', 'text with bar')],
        budget,
      );

      // {{X}} is preserved, so the drop-check alone would pass this. The
      // bidirectional check must still reject it for the ADDED token.
      expect(result.newTemplate).toContain('{{X}}');
      expect(result.newTemplate).toContain('{{EXTRA_CONTEXT}}');
      expect(result.placeholdersPreserved).toBe(false);
    } finally {
      teardown();
    }
  });
});
