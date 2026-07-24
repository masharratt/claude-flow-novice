/**
 * Budget ledger. Single JSON file, shared across all targets FOR ONE PROJECT.
 * Hard-stops optimization when budget exhausted.
 *
 * Ported near-verbatim from fireside's lib/budget.ts. The only change: the
 * caller MUST supply a project-local path (via `paths.ts`'s `budgetFile`),
 * never a path under the engine's own SKILL_DIR (BLOCKER-1). This module
 * itself has no opinion on the path — it just persists to whatever path it
 * is given.
 *
 * L6 fix: `_budget.json` persists `spentUsd` FOREVER across runs (it is one
 * ledger shared by every target in the project). A tracker used to compare
 * the caller's cap against that CUMULATIVE total, so `--budget=N` read like
 * a per-run cap but behaved like a lifetime one (LIVE BUG: a fresh
 * `--budget=0.45` run against a ledger already holding $0.60 of historical
 * spend aborted instantly, having done zero work). The constructor now takes
 * a per-run cap (2nd arg, unchanged position) and an OPTIONAL lifetime cap
 * (3rd arg). `runSpent` always starts at 0 for a fresh construction; `spent`
 * keeps its old meaning (persisted, lifetime total). `exhausted()` trips on
 * EITHER cap; `trippedCap()` reports which one so callers can print an
 * accurate message. The persisted `BudgetState` JSON shape is unchanged
 * ({capUsd, spentUsd, entries}) so an existing `_budget.json` still loads.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface BudgetEntry {
  ts: string;
  target: string;
  phase: 'eval' | 'mutate';
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface BudgetState {
  /** Historical field name kept for backward compatibility with existing
   *  `_budget.json` files. Since L6, this no longer gates `exhausted()`
   *  directly (the run/lifetime caps passed to the constructor do). It is
   *  retained purely so an old ledger file's shape still parses untouched. */
  capUsd: number;
  spentUsd: number;
  entries: BudgetEntry[];
}

/** L6: which cap (if any) is currently tripped. */
export type TrippedCap = 'run' | 'lifetime' | null;

export class BudgetTracker {
  private state: BudgetState;
  /** This construction's own spend. Always starts at 0, never read from
   *  the persisted ledger, so a fresh run gets a fresh per-run budget even
   *  when the ledger already holds lifetime spend from prior runs. */
  private runSpentUsd = 0;

  constructor(
    private path: string,
    private runCapUsd: number,
    private lifetimeCapUsd?: number,
  ) {
    if (existsSync(this.path)) {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as BudgetState;
      this.state = { ...raw, capUsd: lifetimeCapUsd ?? raw.capUsd };
    } else {
      this.state = { capUsd: lifetimeCapUsd ?? runCapUsd, spentUsd: 0, entries: [] };
    }
  }

  /** This run's own spend so far (starts at 0 every construction). */
  get runSpent(): number {
    return this.runSpentUsd;
  }

  /** Lifetime (persisted, cumulative-across-runs) spend. Unchanged meaning
   *  from before L6. */
  get spent(): number {
    return this.state.spentUsd;
  }

  /** Remaining budget for THIS run against the per-run cap. */
  get runRemaining(): number {
    return this.runCapUsd - this.runSpentUsd;
  }

  /** Remaining budget against the optional lifetime cap. `null` when no
   *  lifetime cap was supplied (no ceiling to report against). */
  get lifetimeRemaining(): number | null {
    if (this.lifetimeCapUsd === undefined) return null;
    return this.lifetimeCapUsd - this.state.spentUsd;
  }

  /** True when either the per-run cap or (if supplied) the lifetime cap has
   *  been reached. */
  exhausted(): boolean {
    return this.trippedCap() !== null;
  }

  /** Which cap is currently tripped, checked run-cap first (the common
   *  case), then lifetime. `null` when neither is tripped. */
  trippedCap(): TrippedCap {
    if (this.runRemaining <= 0) return 'run';
    if (this.lifetimeCapUsd !== undefined && this.state.spentUsd >= this.lifetimeCapUsd) return 'lifetime';
    return null;
  }

  record(entry: Omit<BudgetEntry, 'ts'>): void {
    const full: BudgetEntry = { ...entry, ts: new Date().toISOString() };
    this.state.entries.push(full);
    this.state.spentUsd += entry.cost;
    this.runSpentUsd += entry.cost;
    this.flush();
  }

  private flush(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.state, null, 2), 'utf8');
  }
}

/** Cost calculators. Prices per 1M tokens. Plugins may extend/override by
 *  passing their own pricing table shape; this table is a convenience
 *  default covering the models known at port time. */
export const PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'grok-4-1-fast-non-reasoning': { input: 1.25, output: 2.50 },
  'grok-4-1-fast-reasoning': { input: 1.25, output: 2.50 },
  'grok-4.20-beta-0309-reasoning': { input: 1.25, output: 2.50 },
  'grok-4.20-beta-0309-non-reasoning': { input: 1.25, output: 2.50 },
  'grok-4.20-0309-non-reasoning': { input: 1.25, output: 2.50 },
  'grok-4.20-0309-reasoning': { input: 1.25, output: 2.50 },
};

export interface PricingTable {
  input: number;
  output: number;
}

/**
 * L4 fix: a project-supplied `Target.pricing` override is preferred over
 * this engine's built-in table (which only knows the models known at port
 * time). Never throws on an unknown model mid-run — a new consumer's model
 * absent from both the override and the table would otherwise break the
 * shared budget ledger. Instead it warns loudly and records the cost as 0,
 * so the spend number is visibly incomplete rather than silently wrong.
 */
export function costFor(
  model: string,
  inputTokens: number,
  outputTokens: number,
  override?: PricingTable,
): number {
  const p = override ?? PRICING[model];
  if (!p) {
    console.warn(
      `[budget] pricing unknown for model: ${model}. Recording cost as $0 for this call — ` +
        `supply Target.pricing or extend the engine PRICING table so the spend ledger is accurate.`,
    );
    return 0;
  }
  return (inputTokens * p.input) / 1_000_000 + (outputTokens * p.output) / 1_000_000;
}
