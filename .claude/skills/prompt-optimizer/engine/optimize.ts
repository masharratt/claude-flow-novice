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
 * Usage: optimize.ts <target-id> [--dry-run] [--budget=N] [--lifetime-budget=N]
 *                     [--max-iters=N] [--patience=N]
 *
 * L6: --budget=N caps THIS run only (compared against BudgetTracker.runSpent,
 * which starts at 0 every construction). --lifetime-budget=N (optional,
 * default unset) is the absolute ceiling across every run that ever wrote to
 * this project's _budget.json ledger. That ledger persists spentUsd forever
 * and is shared across every target in the project.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveProjectPaths, stateFilePath, templateFilePath, runFilePath, isMainModule, type ProjectPaths } from './paths.js';
import { BudgetTracker } from './budget.js';
import { evaluateTemplate, selectWorst, EVAL_TEMPERATURE, type EvalResult } from './eval.js';
import { mutateTemplate, pickStrategy } from './mutator.js';
import { isImprovement, resolveScoringMode, type AggregateScore } from './rubric-core.js';
import { patchSource } from './source-patcher.js';
import type { Target, Rubric, Fixture } from './types.js';

export interface CliArgs {
  targetId: string | null;
  dryRun: boolean;
  /** L6: PER-RUN cap. Compared only against this run's own spend
   *  (`BudgetTracker.runSpent`, which starts at 0 every construction), never
   *  against the ledger's persisted lifetime total. */
  budget: number;
  /** L6: OPTIONAL absolute lifetime ceiling across every run that ever
   *  wrote to this project's `_budget.json`. `null` (default) means no
   *  lifetime ceiling: only the per-run cap applies. */
  lifetimeBudget: number | null;
  maxIters: number;
  patience: number;
  /** L3: number of times to re-score BOTH holdout baseline and holdout
   *  final when the target is nondeterministic (evalTemperature !== 0).
   *  Deterministic targets ignore this and keep the original single-sample
   *  gate. Default 2 — a single sample cannot distinguish a real win from
   *  run-to-run noise. */
  holdoutRepeats: number;
  /** E2: DEFAULT OFF. Opts into auto-applying a real win back into the
   *  target's declared `sourceFile` via `source-patcher.ts`, replacing the
   *  `PROMPT-OPTIMIZER:START id=<target-id>` .. `:END` sentinel region. Every
   *  existing consumer omits this flag and keeps writing only to
   *  `templates/<id>.md`, byte-for-byte unchanged. */
  apply: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    targetId: null,
    dryRun: false,
    budget: 5.0,
    lifetimeBudget: null,
    maxIters: 20,
    patience: 5,
    holdoutRepeats: 2,
    apply: false,
  };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--apply') args.apply = true;
    else if (a.startsWith('--budget=')) args.budget = parseFloat(a.split('=')[1]!);
    else if (a.startsWith('--lifetime-budget=')) args.lifetimeBudget = parseFloat(a.split('=')[1]!);
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

/**
 * L6: says WHICH cap tripped (run vs lifetime) and shows both numbers, e.g.
 *   "[abort] run budget exhausted ($0.4501 of $0.45 this run; $1.0528 lifetime)"
 *   "[abort] lifetime budget exhausted ($1.0528 of $1.00 lifetime; $0.0100 this run)"
 * Before this fix the message only ever showed the (cumulative) spend
 * number with no indication whether the run cap or a lifetime cap tripped.
 */
function budgetAbortMessage(budget: BudgetTracker, args: Pick<CliArgs, 'budget' | 'lifetimeBudget'>): string {
  const tripped = budget.trippedCap();
  if (tripped === 'lifetime') {
    return (
      `[abort] lifetime budget exhausted ($${budget.spent.toFixed(4)} of $${(args.lifetimeBudget ?? 0).toFixed(2)} lifetime; ` +
      `$${budget.runSpent.toFixed(4)} this run)`
    );
  }
  return (
    `[abort] run budget exhausted ($${budget.runSpent.toFixed(4)} of $${args.budget.toFixed(2)} this run; ` +
    `$${budget.spent.toFixed(4)} lifetime)`
  );
}

function formatAgg(agg: AggregateScore): string {
  const cats = Object.entries(agg.categoryTotals)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  return `total=${agg.total} (${cats}) ran=${agg.ranCount} excluded=${agg.excludedCount}`;
}

/** E2: prints what happened for the opt-in apply step, plainly, whether it
 *  applied, was skipped, or failed (requirement 6: never silent). */
function logApplyOutcome(outcome: ApplyOutcome): void {
  if (outcome.status === 'applied') {
    console.log(`[apply] Patched ${outcome.sourceFile}. Backup: ${outcome.backupPath}`);
  } else if (outcome.status === 'skipped') {
    console.log(`[apply] Skipped: ${outcome.reason}`);
  } else {
    console.warn(`[apply] FAILED (${outcome.sourceFile}): ${outcome.error}`);
  }
}

/** E2: the load-bearing safety gate. Reuses the exact same "real, refused-
 *  free win" guard the template-persist block already computes
 *  (overfit / holdoutInconclusive / templateChanged) so a refused or
 *  unchanged result can never reach a real source file. Never throws: every
 *  failure path (missing file, missing/malformed sentinels, any PatchError)
 *  is caught here and returned as a 'failed' outcome instead of propagating,
 *  so a patch failure never fails the run or loses the report. */
function applySourcePatch(params: {
  apply: boolean;
  cwd: string;
  target: Target;
  finalTemplate: string;
  overfit: boolean;
  holdoutInconclusive: boolean;
  holdoutInconclusiveReason: 'aborted' | 'mixed-repeats' | undefined;
  templateChanged: boolean;
  backupsDir: string;
}): ApplyOutcome | undefined {
  const { apply, cwd, target, finalTemplate, overfit, holdoutInconclusive, holdoutInconclusiveReason, templateChanged, backupsDir } =
    params;

  if (!target.sourceFile) {
    // Nothing declared to patch. Only worth reporting when the caller
    // actually asked for --apply; otherwise every plugin without a
    // sourceFile stays silent (unchanged from before this feature existed).
    return apply ? { status: 'skipped', reason: 'target declares no sourceFile' } : undefined;
  }

  if (!apply) {
    return { status: 'skipped', reason: '--apply not passed', sourceFile: target.sourceFile };
  }
  if (overfit) {
    return { status: 'skipped', reason: 'win refused (OVERFIT)', sourceFile: target.sourceFile };
  }
  if (holdoutInconclusive) {
    return {
      status: 'skipped',
      reason: `win refused (HOLDOUT INCONCLUSIVE: ${holdoutInconclusiveReason ?? 'unknown'})`,
      sourceFile: target.sourceFile,
    };
  }
  if (!templateChanged) {
    return { status: 'skipped', reason: 'final template equals baseline (nothing learned)', sourceFile: target.sourceFile };
  }
  if (!target.varMap || !target.assignmentVar) {
    return {
      status: 'skipped',
      reason: 'sourceFile declared but varMap/assignmentVar missing',
      sourceFile: target.sourceFile,
    };
  }

  try {
    const result = patchSource({
      projectDir: cwd,
      sourceFile: target.sourceFile,
      targetId: target.id,
      template: finalTemplate,
      varMap: target.varMap,
      assignmentVar: target.assignmentVar,
      backupsDir,
    });
    return { status: 'applied', sourceFile: target.sourceFile, backupPath: result.backupPath };
  } catch (err: any) {
    return { status: 'failed', sourceFile: target.sourceFile, error: err.message };
  }
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

/**
 * E2: outcome of the (opt-in) source-patch apply step. Never derived from a
 * thrown exception reaching the caller: the apply step always catches its
 * own errors (requirement 5) and reports one of these three shapes instead.
 */
export type ApplyOutcome =
  | { status: 'applied'; sourceFile: string; backupPath: string }
  | { status: 'skipped'; reason: string; sourceFile?: string }
  | { status: 'failed'; sourceFile: string; error: string };

interface IterRow {
  iter: number;
  ts: string;
  strategy: string;
  modelUsed: string;
  candidateTotal: number;
  acceptedTotal: number;
  accepted: boolean;
  /** Lifetime (persisted, cumulative-across-runs) spend at this point.
   *  Unchanged meaning from before L6. */
  spendUsd: number;
  /** L6: THIS run's own spend at this point (starts at 0 every run).
   *  Carried alongside `spendUsd` so a reader of the state file is never
   *  left with only the lifetime figure. */
  runSpendUsd: number;
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
  /** L12: true when the final holdout pass was skipped because no candidate
   *  was accepted (final template === baseline template). `holdoutFinal` then
   *  carries the BASELINE measurement — the same template, already measured —
   *  rather than a second paid pass that could only sample noise. */
  holdoutFinalSkippedUnchanged?: boolean;
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
  /** Lifetime (persisted, cumulative-across-runs) spend. Unchanged meaning
   *  from before L6. */
  spentUsd?: number;
  /** L6: THIS run's own spend, carried on the report alongside `spentUsd`
   *  so a caller is never left with only the lifetime figure. */
  runSpentUsd?: number;
  finalTemplate?: string;
  /** E2: outcome of the opt-in `--apply` source-patch step. Absent when the
   *  target declares no `sourceFile` AND `--apply` was never passed (the
   *  common case: every existing consumer never sees this field). */
  applyResult?: ApplyOutcome;
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

  // L6: args.budget caps THIS run only; args.lifetimeBudget (optional) is
  // the absolute ceiling across every run that ever wrote to this ledger.
  const budget = new BudgetTracker(paths.budgetFile, args.budget, args.lifetimeBudget ?? undefined);

  // L2: a target may declare the lowest temperature it can actually honor
  // for eval calls (e.g. kimi-k2.6 rejects any temperature except 1). When
  // that value is not 0, every eval result for this run is noisy — stamp a
  // prominent warning up front so it lands in the console log, the run
  // report, AND every appended state row (see below).
  // L10: nondeterminism is NOT simply "temperature != 0". A provider may
  // accept temperature 0 and ignore it (measured true for xAI Grok), which
  // left the riskiest case with the least protection. resolveScoringMode
  // honors an explicit target.nondeterministic declaration too.
  const scoringMode = resolveScoringMode(target, EVAL_TEMPERATURE);
  const evalTemperature = scoringMode.evalTemperature;
  const nondeterministicScoring = scoringMode.nondeterministic;

  console.log(`\n=== Prompt Optimizer: ${target.id} ===`);
  console.log(`Train fixtures: ${trainFixtures.length}, holdout fixtures: ${holdoutFixtures.length}`);
  // L6: --budget caps THIS run; the ledger's persisted lifetime spend is
  // reported alongside it so it is never mistaken for the run's own cap.
  console.log(
    args.lifetimeBudget != null
      ? `Budget cap: $${args.budget.toFixed(2)} this run (lifetime cap: $${args.lifetimeBudget.toFixed(2)}, lifetime spent so far: $${budget.spent.toFixed(4)})`
      : `Budget cap: $${args.budget.toFixed(2)} this run (lifetime spent so far: $${budget.spent.toFixed(4)})`,
  );
  if (nondeterministicScoring) {
    console.log(`[NONDETERMINISTIC SCORING] ${scoringMode.reason}`);
  }

  if (budget.exhausted()) {
    console.log(budgetAbortMessage(budget, args));
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
      runSpentUsd: budget.runSpent,
      finalTemplate: baselineTemplate,
    };
  }

  let currentTemplate = baselineTemplate;
  let currentEval = trainBaselineEval;
  let itersWithoutImprovement = 0;
  let iter = 0;

  while (iter < args.maxIters && currentEval.aggregate.total > 0) {
    if (budget.exhausted()) {
      console.log(`[stop] ${budgetAbortMessage(budget, args)}`);
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

    // L11: defense in depth. eval.ts now converts a per-fixture provider
    // failure into a ran:false exclusion, so this should not fire — but
    // mutateTemplate above has been guarded since day one while this call was
    // not, and that asymmetry is what turned one `TypeError: fetch failed`
    // into a dead run that discarded an already-paid-for baseline. An
    // unexpected throw costs this iteration, never the run.
    let candidateEval;
    try {
      candidateEval = await evaluateTemplate(target, rubric, mutation.newTemplate, trainFixtures, budget);
    } catch (err: any) {
      console.log(`[eval] FAILED: ${err?.message ?? String(err)}`);
      itersWithoutImprovement += 1;
      continue;
    }
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
        runSpendUsd: budget.runSpent,
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
      runSpendUsd: budget.runSpent,
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

  // L12: no candidate was accepted, so the "final" template IS the baseline
  // template, byte for byte. Re-running the holdout gate here would spend
  // holdoutRepeatCount live passes comparing a template to itself; the only
  // thing that comparison can measure is run-to-run noise, and the noise can
  // even trip the OVERFIT/INCONCLUSIVE branches on a run that proposed
  // nothing. Measured live: one run burned 5 repeats x 4 fixtures = 20 paid
  // calls on exactly this. The baseline measurement already IS the final
  // measurement, so reuse it and say so.
  const holdoutFinalSkippedUnchanged = currentTemplate === baselineTemplate;

  if (holdoutFixtures.length > 0 && holdoutBaselineEval && holdoutFinalSkippedUnchanged) {
    holdoutFinalEval = holdoutBaselineEval;
    console.log(
      `\n[holdout final] SKIPPED — no candidate was accepted, so the final template is byte-identical to the baseline. The baseline holdout measurement is the final measurement; re-running it would only sample noise.`,
    );
  } else if (holdoutFixtures.length > 0 && holdoutBaselineEval) {
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

  // --- E2: opt-in source-patch apply step (DEFAULT OFF, --apply). ---
  const applyResult = applySourcePatch({
    apply: args.apply,
    cwd,
    target,
    finalTemplate,
    overfit,
    holdoutInconclusive,
    holdoutInconclusiveReason,
    templateChanged,
    backupsDir: paths.backupsDir,
  });
  if (applyResult) logApplyOutcome(applyResult);

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
    `**Spend:** $${budget.runSpent.toFixed(4)} this run / $${args.budget.toFixed(2)} cap this run` +
      (args.lifetimeBudget != null
        ? ` ($${budget.spent.toFixed(4)} lifetime / $${args.lifetimeBudget.toFixed(2)} lifetime cap)`
        : ` ($${budget.spent.toFixed(4)} lifetime)`),
    nondeterministicScoring
      ? `**NONDETERMINISTIC SCORING** (target.evalTemperature=${evalTemperature}) — this target cannot honor temperature 0; treat every total in this run as noisy, not a clean deterministic measurement.`
      : '',
    `**Train baseline:** ${formatAgg(trainBaselineEval.aggregate)}`,
    `**Train final:** ${formatAgg(currentEval.aggregate)}`,
    rubricSaturated ? `**RUBRIC SATURATED** (total=0, no remaining signal)` : '',
    holdoutBaselineEval && !(nondeterministicScoring && holdoutBaselineRepeats.length > 1)
      ? `**Holdout baseline:** ${formatAgg(holdoutBaselineEval.aggregate)}`
      : '',
    holdoutFinalSkippedUnchanged && holdoutFinalEval
      ? `**Holdout final: SKIPPED** — no candidate was accepted, so the final template is byte-identical to the baseline. The holdout baseline above IS the final measurement; no second live pass was run (L12).`
      : '',
    holdoutFinalEval && !holdoutFinalSkippedUnchanged && !(nondeterministicScoring && holdoutFinalRepeats.length > 1)
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
    applyResult
      ? applyResult.status === 'applied'
        ? `**Source patch APPLIED:** ${applyResult.sourceFile} (backup: ${applyResult.backupPath})`
        : applyResult.status === 'failed'
          ? `**Source patch FAILED:** ${applyResult.sourceFile}: ${applyResult.error}`
          : `**Source patch skipped:** ${applyResult.reason}`
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
    holdoutFinalSkippedUnchanged,
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
    runSpentUsd: budget.runSpent,
    finalTemplate,
    applyResult,
  };
}

// Only invoke main() when this module is executed directly (not imported by tests).
// isMainModule realpath's both sides (L7): the engine is normally reached
// through the `~/.claude/skills/prompt-optimizer` symlink, and a raw href
// comparison is false there, which made the CLI exit 0 having done nothing.
const isMain = isMainModule(import.meta.url, process.argv[1]);
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
