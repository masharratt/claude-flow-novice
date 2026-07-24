import { describe, it, expect, vi, afterEach } from 'vitest';
import { costFor, PRICING } from './budget.js';

/**
 * L4: budget.ts hardcodes Grok/Gemini model ids. costFor() used to THROW
 * "No pricing for model" for anything else, breaking the shared budget
 * ledger for any new consumer's model (the dogfood commit-msg plugin had
 * to hand-roll a local kimiCostFor to work around this).
 *
 * Fix under test:
 *   1. costFor() accepts an optional plugin-supplied pricing override
 *      (Target.pricing), preferred over the engine's built-in table.
 *   2. costFor() NEVER throws on an unknown model — it warns loudly and
 *      returns cost 0 instead, so the spend ledger is never silently wrong
 *      but also never crashes the run.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

describe('costFor — known model via engine PRICING table', () => {
  it('computes cost from the engine table when no override is supplied', () => {
    const model = 'gemini-2.5-flash-lite';
    const cost = costFor(model, 1_000_000, 1_000_000);
    const expected = PRICING[model]!.input + PRICING[model]!.output;
    expect(cost).toBeCloseTo(expected, 10);
  });
});

describe('costFor — L4: plugin-supplied pricing override', () => {
  it('prefers an explicit override over the engine PRICING table for a model absent from that table', () => {
    const cost = costFor('kimi-k2.6', 1_000_000, 1_000_000, { input: 0.6, output: 2.5 });
    expect(cost).toBeCloseTo(0.6 + 2.5, 10);
  });

  it('prefers the override even when the model IS present in the engine table', () => {
    const model = 'gemini-2.5-flash-lite';
    const cost = costFor(model, 1_000_000, 1_000_000, { input: 9, output: 9 });
    expect(cost).toBeCloseTo(18, 10);
    expect(cost).not.toBeCloseTo(PRICING[model]!.input + PRICING[model]!.output, 10);
  });
});

describe('costFor — L4: unknown model never throws mid-run', () => {
  it('does not throw for a model absent from both the table and an override', () => {
    expect(() => costFor('some-brand-new-model', 100, 100)).not.toThrow();
  });

  it('records the cost as 0 for an unknown model instead of guessing', () => {
    const cost = costFor('some-brand-new-model', 1_000_000, 1_000_000);
    expect(cost).toBe(0);
  });

  it('warns loudly ("pricing unknown for <model>") so the spend number is never silently wrong', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    costFor('some-brand-new-model', 100, 100);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toMatch(/pricing unknown for.*some-brand-new-model/i);
  });
});
