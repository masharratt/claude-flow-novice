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
import { evaluateTemplate, selectWorst, type EvalResult } from './eval.js';
import { mutateTemplate, pickStrategy } from './mutator.js';
import { isImprovement, type AggregateScore } from './rubric-core.js';
import type { Target, Rubric, Fixture } from './types.js';

export interface CliArgs {
  targetId: string | null;
  dryRun: boolean;
  budget: number;
  maxIters: number;
  patience: number;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { targetId: null, dryRun: false, budget: 5.0, maxIters: 20, patience: 5 };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--budget=')) args.budget = parseFloat(a.split('=')[1]!);
    else if (a.startsWith('--max-iters=')) args.maxIters = parseInt(a.split('=')[1]!, 10);
    else if (a.startsWith('--patience=')) args.patience = parseInt(a.split('=')[1]!, 10);
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

interface IterRow {
  iter: number;
  ts: string;
  strategy: string;
  modelUsed: string;
  candidateTotal: number;
  acceptedTotal: number;
  accepted: boolean;
  spendUsd: number;
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

  console.log(`\n=== Prompt Optimizer: ${target.id} ===`);
  console.log(`Train fixtures: ${trainFixtures.length}, holdout fixtures: ${holdoutFixtures.length}`);
  console.log(`Budget cap: $${args.budget.toFixed(2)} (spent so far: $${budget.spent.toFixed(4)})`);

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
  let holdoutBaselineEval: EvalResult | null = null;
  if (holdoutFixtures.length > 0) {
    holdoutBaselineEval = await evaluateTemplate(target, rubric, baselineTemplate, holdoutFixtures, budget);
    console.log(`[holdout baseline] ${formatAgg(holdoutBaselineEval.aggregate)}`);
  }

  if (args.dryRun) {
    console.log('\n[dry-run] Baseline scored. Exiting without mutations.');
    return {
      status: 'ok',
      targetId: target.id,
      trainBaseline: trainBaselineEval.aggregate,
      holdoutBaseline: holdoutBaselineEval?.aggregate,
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
    });
  }

  // --- Holdout gate (FIX #1): score the winner ONCE on holdout. ---
  let holdoutFinalEval: EvalResult | null = null;
  let overfit = false;
  let holdoutInconclusive = false;
  let finalTemplate = currentTemplate;

  if (holdoutFixtures.length > 0 && holdoutBaselineEval) {
    holdoutFinalEval = await evaluateTemplate(target, rubric, currentTemplate, holdoutFixtures, budget);
    console.log(`\n[holdout final] ${formatAgg(holdoutFinalEval.aggregate)}`);
    // FINDING #1: if the holdout final pass itself mostly/fully excluded
    // fixtures (e.g. budget exhausts at the final gate), its aggregate.total
    // reads near 0 and the naive "total > baseline total" regression check
    // reads as "no regression" — but nothing was actually validated. Treat
    // this as INCONCLUSIVE (same effect as overfit: refuse the win) instead
    // of silently reporting a clean win.
    if (holdoutFinalEval.aborted) {
      holdoutInconclusive = true;
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

  // --- Persist winning template (only a real, non-overfit, conclusive win) ---
  if (!overfit && !holdoutInconclusive && finalTemplate !== baselineTemplate) {
    const templatePath = templateFilePath(paths, target.id);
    mkdirSync(paths.templatesDir, { recursive: true });
    writeFileSync(templatePath, finalTemplate, 'utf8');
  }

  // --- Run report ---
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const runPath = runFilePath(paths, target.id, ts);
  mkdirSync(paths.runsDir, { recursive: true });
  const reportLines = [
    `# Prompt Optimizer Run: ${target.id}`,
    `**Date:** ${new Date().toISOString()}`,
    `**Iterations:** ${iter}`,
    `**Spend:** $${budget.spent.toFixed(4)} / $${args.budget.toFixed(2)}`,
    `**Train baseline:** ${formatAgg(trainBaselineEval.aggregate)}`,
    `**Train final:** ${formatAgg(currentEval.aggregate)}`,
    holdoutBaselineEval ? `**Holdout baseline:** ${formatAgg(holdoutBaselineEval.aggregate)}` : '',
    holdoutFinalEval ? `**Holdout final:** ${formatAgg(holdoutFinalEval.aggregate)}` : '',
    overfit ? `**OVERFIT — win refused. Baseline template retained.**` : '',
    holdoutInconclusive
      ? `**HOLDOUT INCONCLUSIVE — final holdout eval aborted, win refused. Baseline template retained.**`
      : '',
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
