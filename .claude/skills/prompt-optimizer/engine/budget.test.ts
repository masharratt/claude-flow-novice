import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { costFor, PRICING, BudgetTracker, type BudgetState } from './budget.js';

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

/**
 * L6: --budget=N must mean PER-RUN, not lifetime.
 *
 * LIVE BUG: `_budget.json` persists `spentUsd` forever. BudgetTracker used to
 * compare the `--budget` value against that CUMULATIVE total, so a fresh
 * `--budget=0.45` run against a ledger already holding $0.60 of historical
 * spend aborted instantly with "Budget already exhausted ($0.6027)" having
 * done zero work. `--budget` reads like a per-run cap and behaved like a
 * lifetime one.
 *
 * Fix under test: BudgetTracker takes a per-run cap (existing 2nd ctor arg)
 * and an OPTIONAL lifetime cap (new 3rd arg). `runSpent` always starts at 0
 * per construction; `spent` keeps its old (lifetime, persisted) meaning.
 * `exhausted()` trips on EITHER cap; `trippedCap()` reports which one.
 */
describe('BudgetTracker (L6: per-run cap vs lifetime cap)', () => {
  let tmpDir: string;
  let budgetPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'prompt-optimizer-budget-test-'));
    budgetPath = join(tmpDir, '_budget.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedLedger(spentUsd: number, capUsd = 5): void {
    const state: BudgetState = { capUsd, spentUsd, entries: [] };
    writeFileSync(budgetPath, JSON.stringify(state, null, 2), 'utf8');
  }

  it('LIVE BUG: a tracker constructed against an EXISTING ledger with prior spend is NOT immediately exhausted when given a per-run cap', () => {
    // Ledger already holds $0.6027 of historical (lifetime) spend.
    seedLedger(0.6027);

    // A fresh --budget=0.45 run must NOT abort instantly: the run cap
    // applies to THIS run's fresh spend (starts at 0), not the persisted
    // cumulative total.
    const tracker = new BudgetTracker(budgetPath, 0.45);

    expect(tracker.runSpent).toBe(0);
    expect(tracker.spent).toBeCloseTo(0.6027, 10); // lifetime figure preserved
    expect(tracker.exhausted()).toBe(false);
  });

  it('the run cap trips after enough recorded cost within one construction', () => {
    const tracker = new BudgetTracker(budgetPath, 0.10);
    expect(tracker.exhausted()).toBe(false);

    tracker.record({ target: 't1', phase: 'eval', model: 'm', inputTokens: 1, outputTokens: 1, cost: 0.06 });
    expect(tracker.exhausted()).toBe(false);

    tracker.record({ target: 't1', phase: 'eval', model: 'm', inputTokens: 1, outputTokens: 1, cost: 0.05 });
    expect(tracker.runSpent).toBeCloseTo(0.11, 10);
    expect(tracker.exhausted()).toBe(true);
  });

  it('a supplied lifetime cap trips even when the run cap has room', () => {
    // Ledger already holds $1.00 lifetime spend; lifetime cap is $1.00.
    seedLedger(1.0);
    const tracker = new BudgetTracker(budgetPath, 100, 1.0);

    // Run cap ($100) has plenty of room, but the lifetime cap is already met.
    expect(tracker.runSpent).toBe(0);
    expect(tracker.exhausted()).toBe(true);
    expect(tracker.trippedCap()).toBe('lifetime');
  });

  it("the tripped-cap reporter returns 'run' vs 'lifetime' correctly, and null when neither is tripped", () => {
    // Neither tripped.
    const clean = new BudgetTracker(budgetPath, 10, 10);
    expect(clean.trippedCap()).toBeNull();

    // Run cap tripped, no lifetime cap supplied.
    const runTripped = new BudgetTracker(join(tmpDir, '_budget2.json'), 0.01);
    runTripped.record({ target: 't1', phase: 'eval', model: 'm', inputTokens: 1, outputTokens: 1, cost: 0.02 });
    expect(runTripped.trippedCap()).toBe('run');

    // Lifetime cap tripped, run cap has room.
    seedLedger(5.0, 5.0);
    const lifetimeTripped = new BudgetTracker(budgetPath, 100, 5.0);
    expect(lifetimeTripped.trippedCap()).toBe('lifetime');
  });

  it('an existing _budget.json shape ({capUsd, spentUsd, entries}) loads without error and its spentUsd is preserved and still accumulated into', () => {
    seedLedger(2.5, 5);
    const tracker = new BudgetTracker(budgetPath, 1.0);

    expect(tracker.spent).toBeCloseTo(2.5, 10);

    tracker.record({ target: 't1', phase: 'mutate', model: 'm', inputTokens: 10, outputTokens: 10, cost: 0.25 });

    expect(tracker.spent).toBeCloseTo(2.75, 10);
    expect(tracker.runSpent).toBeCloseTo(0.25, 10);

    const persisted = JSON.parse(readFileSync(budgetPath, 'utf8')) as BudgetState;
    expect(persisted.spentUsd).toBeCloseTo(2.75, 10);
    expect(persisted.entries.length).toBe(1);
  });
});
