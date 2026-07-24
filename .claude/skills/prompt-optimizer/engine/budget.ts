/**
 * Budget ledger. Single JSON file, shared across all targets FOR ONE PROJECT.
 * Hard-stops optimization when budget exhausted.
 *
 * Ported near-verbatim from fireside's lib/budget.ts. The only change: the
 * caller MUST supply a project-local path (via `paths.ts`'s `budgetFile`),
 * never a path under the engine's own SKILL_DIR (BLOCKER-1). This module
 * itself has no opinion on the path — it just persists to whatever path it
 * is given.
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
  capUsd: number;
  spentUsd: number;
  entries: BudgetEntry[];
}

export class BudgetTracker {
  private state: BudgetState;

  constructor(private path: string, capUsd: number) {
    if (existsSync(this.path)) {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as BudgetState;
      this.state = { ...raw, capUsd };
    } else {
      this.state = { capUsd, spentUsd: 0, entries: [] };
    }
  }

  get remaining(): number {
    return this.state.capUsd - this.state.spentUsd;
  }

  get spent(): number {
    return this.state.spentUsd;
  }

  exhausted(): boolean {
    return this.remaining <= 0;
  }

  record(entry: Omit<BudgetEntry, 'ts'>): void {
    const full: BudgetEntry = { ...entry, ts: new Date().toISOString() };
    this.state.entries.push(full);
    this.state.spentUsd += entry.cost;
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
