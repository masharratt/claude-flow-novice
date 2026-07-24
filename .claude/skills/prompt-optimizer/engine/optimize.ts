/**
 * Engine orchestrator: resolves a project-local plugin from cwd, evaluates
 * the baseline, mutates/accepts on `split:'train'` only, then scores the
 * winner ONCE on `split:'holdout'` (FIX #1 — held-out validation, the
 * mutator never sees holdout data). Reports train vs holdout and refuses
 * the "win" (labels OVERFIT) if holdout regresses relative to the baseline.
 *
 * Absent `.claude/prompt-optimizer/config.json` -> prints "no plugin
 * configured" and exits 0 (inert-by-default): a project inherits this
 * shared skill for free and nothing breaks until it opts in with a plugin.
 *
 * Usage: optimize.ts <target-id> [--dry-run] [--budget=N] [--max-iters=N] [--patience=N]
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveProjectPaths, stateFilePath, templateFilePath, runFilePath, type ProjectPaths } from './paths.js';
import { BudgetTracker } from './budget.js';
import { evaluateTemplate, selectWorst, EVAL_TEMPERATURE, type EvalResult } from './eval.js';
import { mutateTemplate, pickStrategy } from './mutator.js';
import { isImprovement, type AggregateScore } from './rubric-core.js';
import type { Target, Rubric, Fixture } from './types.js';

export interface CliArgs {
  targetId: string | null;
  dryRun: boolean;
  budget: number;
  maxIters: number;
  patience: number;
  /** L3: number of times to re-score BOTH holdout baseline and holdout
   *  final when the target is nondeterministic (evalTemperature !== 0).
   *  Deterministic targets ignore this and keep the original single-sample
   *  gate. Default 2 — a single sample cannot distinguish a real win from
   *  run-to-run noise. */
  holdoutRepeats: number;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { targetId: null, dryRun: false, budget: 5.0, maxIters: 20, patience: 5, holdoutRepeats: 2 };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--budget=')) args.budget = parseFloat(a.split('=')[1]!);
    else if (a.startsWith('--max-iters=')) args.maxIters = parseInt(a.split('=')[1]!, 10);
    else if (a.startsWith('--patience=')) args.patience = parseInt(a.split('=')[1]!, 10);
    else if (a.startsWith('--holdout-repeats=')) args.holdoutRepeats = parseInt(a.split('=')[1]!, 10);
    else if (!a.startsWith('--') && !args.targetId) args.targetId = a;
  }
  return args;
}

interface PluginConfigEntry {
  target: string;
  rubric: string;
  fixtures: string;
}

type PluginConfig = Record<string, PluginConfigEntry>;

function loadPluginConfig(paths: ProjectPaths): PluginConfig | null {
  if (!existsSync(paths.configFile)) return null;
  return JSON.parse(readFileSync(paths.configFile, 'utf8')) as PluginConfig;
}

async function importPluginModule(paths: ProjectPaths, relPath: string): Promise<any> {
  const abs = resolve(paths.root, relPath);
  return import(pathToFileURL(abs).href);
}

function loadFixturesFile(paths: ProjectPaths, relPath: string): Fixture[] {
  const abs = resolve(paths.root, relPath);
  return JSON.parse(readFileSync(abs, 'utf8')) as Fixture[];
}

function formatAgg(agg: AggregateScore): string {
  const cats = Object.entries(agg.categoryTotals)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  return `total=${agg.total} (${cats}) ran=${agg.ranCount} excluded=${agg.excludedCount}`;
}

/**
 * L1: minimal line-based unified diff (LCS-backed), no new dependency.
 * Templates are small (a few dozen to a few hundred lines) so the O(n*m)
 * LCS table is cheap. Returns "(no changes)" when before === after so the
 * report never shows an empty diff section when nothing was persisted.
 */
export function unifiedDiff(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const lines: string[] = [];
  let i = 0;
  let j = 0;
  let changed = false;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push(`  ${a[i]}`);
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      lines.push(`- ${a[i]}`);
      i += 1;
      changed = true;
    } else {
      lines.push(`+ ${b[j]}`);
      j += 1;
      changed = true;
    }
  }
  while (i < n) {
    lines.push(`- ${a[i]}`);
    i += 1;
    changed = true;
  }
  while (j < m) {
    lines.push(`+ ${b[j]}`);
    j += 1;
    changed = true;
  }

  return changed ? lines.join('\n') : '(no changes)';
}

interface IterRow {
  iter: number;
  ts: string;
  strategy: string;
  modelUsed: string;
  candidateTotal: number;
  acceptedTotal: number;
  accepted: boolean;
  spendUsd: number;
  /** L2: true when target.evalTemperature is declared and not 0 — this
   *  run's totals are noisy, not from a deterministic model. Stamped onto
   *  every state row so no reader of the state file mistakes a noisy total
   *  for a clean measurement. */
  nondeterministicScoring: boolean;
}

function loadIterState(paths: ProjectPaths, targetId: string): IterRow[] {
  const p = stateFilePath(paths, targetId);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, 'utf8')) as IterRow[];
}

function appendIterState(paths: ProjectPaths, targetId: string, row: IterRow): void {
  const rows = loadIterState(paths, targetId);
  rows.push(row);
  const p = stateFilePath(paths, targetId);
  mkdirSync(paths.stateDir, { recursive: true });
  writeFileSync(p, JSON.stringify(rows, null, 2), 'utf8');
}

export interface RunReport {
  status: 'no-plugin' | 'unknown-target' | 'aborted' | 'ok';
  targetId?: string;
  trainBaseline?: AggregateScore;
  trainFinal?: AggregateScore;
  holdoutBaseline?: AggregateScore;
  holdoutFinal?: AggregateScore;
  overfit?: boolean;
  /** FINDING #1: the holdout final eval itself aborted (mostly-excluded
   *  fixtures — budget exhaustion / extraction failure / refusals), so the
   *  holdout gate could not actually validate anything. Distinct from
   *  `overfit` (a real regression measurement); this means NO measurement
   *  was possible. Treated the same as overfit for persist/report purposes:
   *  the win is refused and the baseline template is retained. */
  holdoutInconclusive?: boolean;
  /** L3 extension of FINDING #1: WHY the win was refused as inconclusive.
   *  'aborted' — a holdout eval pass (single-sample or one of the repeats)
   *  itself aborted (mostly-excluded fixtures). 'mixed-repeats' — the
   *  candidate beat the baseline on SOME holdout repeats but not others
   *  (noise floor as wide as the measured win — see L3). */
  holdoutInconclusiveReason?: 'aborted' | 'mixed-repeats';
  /** L2: true when target.evalTemperature is declared and not 0. The run's
   *  totals are noisy (not from a deterministic model) — see the report's
   *  NONDETERMINISTIC SCORING note. */
  nondeterministicScoring?: boolean;
  /** L3: per-repeat holdout totals when nondeterministicScoring is true and
   *  more than one repeat was taken. Absent for deterministic targets (the
   *  original single-sample gate is unchanged for them). */
  holdoutBaselineRepeatTotals?: number[];
  holdoutFinalRepeatTotals?: number[];
  /** L5: true when the accepted/final train total hit exactly 0 — the
   *  rubric has no remaining signal to optimize against. */
  rubricSaturated?: boolean;
  iterations?: number;
  spentUsd?: number;
  finalTemplate?: string;
}

export async function runOptimize(argv: string[], cwd: string = process.cwd()): Promise<RunReport> {
  const args = parseArgs(argv);
  const paths = resolveProjectPaths(cwd);

  const config = loadPluginConfig(paths);
  if (!config) {
    console.log('no plugin configured');
    return { status: 'no-plugin' };
  }

  if (!args.targetId || !config[args.targetId]) {
    console.log(
      `unknown or missing target id "${args.targetId ?? ''}". Known targets: ${Object.keys(config).join(', ') || '(none)'}`,
    );
    return { status: 'unknown-target' };
  }

  const entry = config[args.targetId];
  const targetMod = await importPluginModule(paths, entry.target);
  const rubricMod = await importPluginModule(paths, entry.rubric);
  const target: Target = targetMod.default ?? targetMod.target;
  const rubric: Rubric = rubricMod.default ?? rubricMod.rubric;

  const allFixtures = loadFixturesFile(paths, entry.fixtures);
  const trainFixtures = allFixtures.filter(f => f.split === 'train');
  const holdoutFixtures = allFixtures.filter(f => f.split === 'holdout');

  const budget = new BudgetTracker(paths.budgetFile, args.budget);

  // L2: a target may declare the lowest temperature it can actually honor
  // for eval calls (e.g. kimi-k2.6 rejects any temperature except 1). When
  // that value is not 0, every eval result for this run is noisy — stamp a
  // prominent warning up front so it lands in the console log, the run
  // report, AND every appended state row (see below).
  const evalTemperature = target.evalTemperature ?? EVAL_TEMPERATURE;
  const nondeterministicScoring = evalTemperature !== 0;

  console.log(`\n=== Prompt Optimizer: ${target.id} ===`);
  console.log(`Train fixtures: ${trainFixtures.length}, holdout fixtures: ${holdoutFixtures.length}`);
  console.log(`Budget cap: $${args.budget.toFixed(2)} (spent so far: $${budget.spent.toFixed(4)})`);
  if (nondeterministicScoring) {
    console.log(
      `[NONDETERMINISTIC SCORING] target.evalTemperature=${evalTemperature} (not 0). ` +
        `This target cannot honor temperature 0 — every total in this run is noisy, not a clean deterministic measurement.`,
    );
  }

  if (budget.exhausted()) {
    console.log(`Budget already exhausted ($${budget.spent.toFixed(4)}).`);
    return { status: 'aborted' };
  }

  const baselineTemplate = await target.loadTemplate();

  // --- Baseline train eval ---
  const trainBaselineEval: EvalResult = await evaluateTemplate(target, rubric, baselineTemplate, trainFixtures, budget);
  console.log(`[train baseline] ${formatAgg(trainBaselineEval.aggregate)}`);
  if (trainBaselineEval.aborted) {
    console.log(`[abort] ${trainBaselineEval.abortReason}`);
    return { status: 'aborted', targetId: target.id, trainBaseline: trainBaselineEval.aggregate };
  }

  // --- Baseline holdout eval (reference only; mutator never trains on this) ---
  // L3: when scoring is nondeterministic, a single sample cannot be trusted
  // as a noise floor (LIVE evidence: identical seed + fixtures produced
  // holdout baseline 5 in one run, 2 in another). Re-score `holdoutRepeats`
  // times; deterministic targets keep the original single-sample behavior.
  const holdoutRepeatCount = nondeterministicScoring ? Math.max(1, args.holdoutRepeats) : 1;
  let holdoutBaselineEval: EvalResult | null = null;
  const holdoutBaselineRepeats: EvalResult[] = [];
  if (holdoutFixtures.length > 0) {
    for (let r = 0; r < holdoutRepeatCount; r++) {
      holdoutBaselineRepeats.push(await evaluateTemplate(target, rubric, baselineTemplate, holdoutFixtures, budget));
    }
    holdoutBaselineEval = holdoutBaselineRepeats[0]!;
    if (nondeterministicScoring && holdoutBaselineRepeats.length > 1) {
      const totals = holdoutBaselineRepeats.map(e => e.aggregate.total);
      console.log(
        `[holdout baseline] ${holdoutBaselineRepeats.length} repeats: [${totals.join(', ')}] (spread=${Math.max(...totals) - Math.min(...totals)})`,
      );
    } else {
      console.log(`[holdout baseline] ${formatAgg(holdoutBaselineEval.aggregate)}`);
    }
  }

  if (args.dryRun) {
    console.log('\n[dry-run] Baseline scored. Exiting without mutations.');
    return {
      status: 'ok',
      targetId: target.id,
      trainBaseline: trainBaselineEval.aggregate,
      holdoutBaseline: holdoutBaselineEval?.aggregate,
      nondeterministicScoring,
      holdoutBaselineRepeatTotals:
        nondeterministicScoring && holdoutBaselineRepeats.length > 1
          ? holdoutBaselineRepeats.map(e => e.aggregate.total)
          : undefined,
      iterations: 0,
      spentUsd: budget.spent,
      finalTemplate: baselineTemplate,
    };
  }

  let currentTemplate = baselineTemplate;
  let currentEval = trainBaselineEval;
  let itersWithoutImprovement = 0;
  let iter = 0;

  while (iter < args.maxIters && currentEval.aggregate.total > 0) {
    if (budget.exhausted()) {
      console.log(`[stop] Budget exhausted ($${budget.spent.toFixed(4)}).`);
      break;
    }
    if (itersWithoutImprovement >= args.patience) {
      console.log(`[stop] Patience exhausted (${args.patience} iters without improvement).`);
      break;
    }

    iter += 1;
    const worst = selectWorst(currentEval, 5);
    const strategy = pickStrategy(iter - 1);
    console.log(`\n--- Iter ${iter} (${strategy}) ---`);

    let mutation;
    try {
      mutation = await mutateTemplate(target, rubric, currentTemplate, worst, budget, { strategy });
    } catch (err: any) {
      console.log(`[mutate] FAILED: ${err.message}`);
      itersWithoutImprovement += 1;
      continue;
    }

    if (!mutation.placeholdersPreserved) {
      console.log('[mutate] REJECTED: placeholders drifted.');
      itersWithoutImprovement += 1;
      continue;
    }

    const candidateEval = await evaluateTemplate(target, rubric, mutation.newTemplate, trainFixtures, budget);
    console.log(`[eval] candidate: ${formatAgg(candidateEval.aggregate)}`);

    // FINDING #1: a candidate eval that mostly/fully excluded fixtures
    // (budget exhaustion, extraction failures, refusals) reads an
    // artificially low aggregate.total (excluded fixtures contribute 0) —
    // that is NOT a real measurement and must never be accepted as a win.
    if (candidateEval.aborted) {
      console.log(`[reject] candidate eval ABORTED: ${candidateEval.abortReason}`);
      itersWithoutImprovement += 1;
      appendIterState(paths, target.id, {
        iter,
        ts: new Date().toISOString(),
        strategy: mutation.strategy,
        modelUsed: mutation.modelUsed,
        candidateTotal: candidateEval.aggregate.total,
        acceptedTotal: currentEval.aggregate.total,
        accepted: false,
        spendUsd: budget.spent,
        nondeterministicScoring,
      });
      continue;
    }

    const accept = isImprovement(currentEval.aggregate, candidateEval.aggregate, {
      prev: { promptTokens: currentEval.totalPromptTokens },
      candidate: { promptTokens: candidateEval.totalPromptTokens },
    });

    if (accept) {
      console.log(`[accept] ${formatAgg(currentEval.aggregate)} -> ${formatAgg(candidateEval.aggregate)}`);
      currentTemplate = mutation.newTemplate;
      currentEval = candidateEval;
      itersWithoutImprovement = 0;
    } else {
      console.log(`[reject] no improvement vs ${formatAgg(currentEval.aggregate)}`);
      itersWithoutImprovement += 1;
    }

    appendIterState(paths, target.id, {
      iter,
      ts: new Date().toISOString(),
      strategy: mutation.strategy,
      modelUsed: mutation.modelUsed,
      candidateTotal: candidateEval.aggregate.total,
      acceptedTotal: currentEval.aggregate.total,
      accepted: accept,
      spendUsd: budget.spent,
      nondeterministicScoring,
    });
  }

  // --- Holdout gate (FIX #1, extended by L3 for nondeterministic targets). ---
  let holdoutFinalEval: EvalResult | null = null;
  const holdoutFinalRepeats: EvalResult[] = [];
  let overfit = false;
  let holdoutInconclusive = false;
  let holdoutInconclusiveReason: 'aborted' | 'mixed-repeats' | undefined;
  let finalTemplate = currentTemplate;

  if (holdoutFixtures.length > 0 && holdoutBaselineEval) {
    for (let r = 0; r < holdoutRepeatCount; r++) {
      holdoutFinalRepeats.push(await evaluateTemplate(target, rubric, currentTemplate, holdoutFixtures, budget));
    }
    holdoutFinalEval = holdoutFinalRepeats[0]!;

    if (nondeterministicScoring && holdoutFinalRepeats.length > 1) {
      // L3: a single sample cannot distinguish a real win from run-to-run
      // noise. Pair each repeat's final total against that SAME repeat
      // index's baseline total and require the win on EVERY repeat. Wins
      // on some but not all repeats means the measured "win" is inside the
      // noise floor — refuse it (same refusal path as OVERFIT) and label it
      // INCONCLUSIVE rather than reporting a clean win.
      const finalTotals = holdoutFinalRepeats.map(e => e.aggregate.total);
      const baselineTotals = holdoutBaselineRepeats.map(e => e.aggregate.total);
      console.log(
        `\n[holdout final] ${holdoutFinalRepeats.length} repeats: [${finalTotals.join(', ')}] (spread=${Math.max(...finalTotals) - Math.min(...finalTotals)})`,
      );

      const anyAborted = holdoutFinalRepeats.some(e => e.aborted) || holdoutBaselineRepeats.some(e => e.aborted);
      if (anyAborted) {
        holdoutInconclusive = true;
        holdoutInconclusiveReason = 'aborted';
        finalTemplate = baselineTemplate;
        console.log(
          `[INCONCLUSIVE] a holdout repeat pass ABORTED (mostly-excluded fixtures). Refusing the win; reporting baseline as final.`,
        );
      } else {
        const regressed = finalTotals.map((t, idx) => t > (baselineTotals[idx] ?? baselineTotals[0]!));
        const noneRegressed = regressed.every(r => !r);
        const allRegressed = regressed.every(Boolean);
        if (noneRegressed) {
          // Beats the baseline on EVERY repeat — a real, non-noise win.
        } else if (allRegressed) {
          overfit = true;
          finalTemplate = baselineTemplate;
          console.log(`[OVERFIT] holdout regressed on EVERY repeat. Refusing the win; reporting baseline as final.`);
        } else {
          holdoutInconclusive = true;
          holdoutInconclusiveReason = 'mixed-repeats';
          finalTemplate = baselineTemplate;
          console.log(
            `[INCONCLUSIVE] holdout regressed on SOME repeats but not others — the win is inside the noise floor. Refusing the win; reporting baseline as final.`,
          );
        }
      }
    } else {
      // Deterministic target (or repeats collapsed to 1): original
      // single-sample gate, unchanged.
      console.log(`\n[holdout final] ${formatAgg(holdoutFinalEval.aggregate)}`);
      // FINDING #1: if the holdout final pass itself mostly/fully excluded
      // fixtures (e.g. budget exhausts at the final gate), its aggregate.total
      // reads near 0 and the naive "total > baseline total" regression check
      // reads as "no regression" — but nothing was actually validated. Treat
      // this as INCONCLUSIVE (same effect as overfit: refuse the win) instead
      // of silently reporting a clean win.
      if (holdoutFinalEval.aborted) {
        holdoutInconclusive = true;
        holdoutInconclusiveReason = 'aborted';
        finalTemplate = baselineTemplate;
        console.log(
          `[INCONCLUSIVE] holdout final eval ABORTED: ${holdoutFinalEval.abortReason}. Refusing the win; reporting baseline as final.`,
        );
      } else if (holdoutFinalEval.aggregate.total > holdoutBaselineEval.aggregate.total) {
        overfit = true;
        finalTemplate = baselineTemplate;
        console.log(
          `[OVERFIT] holdout regressed (${holdoutFinalEval.aggregate.total} > ${holdoutBaselineEval.aggregate.total}). Refusing the win; reporting baseline as final.`,
        );
      }
    }
  }

  // --- Persist winning template (only a real, non-overfit, conclusive win) ---
  // L1: the seed template and the persisted "current" template are the SAME
  // file (templateFilePath). Back up whatever was there BEFORE overwriting
  // it, so a wrongly-accepted template is always recoverable and the
  // original human-written seed is never silently destroyed.
  const templateChanged = finalTemplate !== baselineTemplate;
  if (!overfit && !holdoutInconclusive && templateChanged) {
    const backupTs = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = resolve(paths.backupsDir, `${target.id}-${backupTs}.md`);
    mkdirSync(paths.backupsDir, { recursive: true });
    writeFileSync(backupPath, baselineTemplate, 'utf8');

    const templatePath = templateFilePath(paths, target.id);
    mkdirSync(paths.templatesDir, { recursive: true });
    writeFileSync(templatePath, finalTemplate, 'utf8');
  }

  // L5: a perfect accepted train total means the rubric has no remaining
  // signal to optimize against — different from normal convergence
  // (patience/budget/max-iters exhausted with total still > 0).
  const rubricSaturated = currentEval.aggregate.total === 0;

  // --- Run report ---
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const runPath = runFilePath(paths, target.id, ts);
  mkdirSync(paths.runsDir, { recursive: true });
  const reportLines = [
    `# Prompt Optimizer Run: ${target.id}`,
    `**Date:** ${new Date().toISOString()}`,
    `**Iterations:** ${iter}`,
    `**Spend:** $${budget.spent.toFixed(4)} / $${args.budget.toFixed(2)}`,
    nondeterministicScoring
      ? `**NONDETERMINISTIC SCORING** (target.evalTemperature=${evalTemperature}) — this target cannot honor temperature 0; treat every total in this run as noisy, not a clean deterministic measurement.`
      : '',
    `**Train baseline:** ${formatAgg(trainBaselineEval.aggregate)}`,
    `**Train final:** ${formatAgg(currentEval.aggregate)}`,
    rubricSaturated ? `**RUBRIC SATURATED** (total=0, no remaining signal)` : '',
    holdoutBaselineEval && !(nondeterministicScoring && holdoutBaselineRepeats.length > 1)
      ? `**Holdout baseline:** ${formatAgg(holdoutBaselineEval.aggregate)}`
      : '',
    holdoutFinalEval && !(nondeterministicScoring && holdoutFinalRepeats.length > 1)
      ? `**Holdout final:** ${formatAgg(holdoutFinalEval.aggregate)}`
      : '',
    nondeterministicScoring && holdoutBaselineRepeats.length > 1
      ? `**Holdout baseline repeats (${holdoutBaselineRepeats.length}):** [${holdoutBaselineRepeats.map(e => e.aggregate.total).join(', ')}] (spread=${Math.max(...holdoutBaselineRepeats.map(e => e.aggregate.total)) - Math.min(...holdoutBaselineRepeats.map(e => e.aggregate.total))})`
      : '',
    nondeterministicScoring && holdoutFinalRepeats.length > 1
      ? `**Holdout final repeats (${holdoutFinalRepeats.length}):** [${holdoutFinalRepeats.map(e => e.aggregate.total).join(', ')}] (spread=${Math.max(...holdoutFinalRepeats.map(e => e.aggregate.total)) - Math.min(...holdoutFinalRepeats.map(e => e.aggregate.total))})`
      : '',
    overfit ? `**OVERFIT — win refused. Baseline template retained.**` : '',
    holdoutInconclusive
      ? `**HOLDOUT INCONCLUSIVE (${holdoutInconclusiveReason}) — win refused. Baseline template retained.**`
      : '',
    '',
    '## Seed vs Final Diff',
    '',
    '```diff',
    unifiedDiff(baselineTemplate, finalTemplate),
    '```',
    '',
    '## Final Template',
    '',
    '```',
    finalTemplate,
    '```',
    '',
  ].filter(Boolean);
  writeFileSync(runPath, reportLines.join('\n'), 'utf8');
  console.log(`\n[report] ${runPath}`);

  return {
    status: 'ok',
    targetId: target.id,
    trainBaseline: trainBaselineEval.aggregate,
    trainFinal: currentEval.aggregate,
    holdoutBaseline: holdoutBaselineEval?.aggregate,
    holdoutFinal: holdoutFinalEval?.aggregate,
    overfit,
    holdoutInconclusive,
    holdoutInconclusiveReason,
    nondeterministicScoring,
    holdoutBaselineRepeatTotals:
      nondeterministicScoring && holdoutBaselineRepeats.length > 1
        ? holdoutBaselineRepeats.map(e => e.aggregate.total)
        : undefined,
    holdoutFinalRepeatTotals:
      nondeterministicScoring && holdoutFinalRepeats.length > 1
        ? holdoutFinalRepeats.map(e => e.aggregate.total)
        : undefined,
    rubricSaturated,
    iterations: iter,
    spentUsd: budget.spent,
    finalTemplate,
  };
}

// Only invoke main() when this module is executed directly (not imported by tests).
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runOptimize(process.argv.slice(2))
    .then(report => {
      if (report.status === 'no-plugin') process.exit(0);
      if (report.status === 'unknown-target' || report.status === 'aborted') process.exit(1);
      process.exit(0);
    })
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
