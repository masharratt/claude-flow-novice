import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { runOptimize, unifiedDiff, parseArgs } from './optimize.js';
import type { BudgetState } from './budget.js';

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'prompt-optimizer-optimize-test-'));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

function pluginRoot(): string {
  return join(projectDir, '.claude', 'prompt-optimizer');
}

const MUTATE_MARKER = "You are a prompt engineer";

/** Writes a plain-JS (.mjs) plugin whose `generate` behavior is fully
 *  described by a scoring function: `scoreFn(text) -> number of "bad" hits`.
 *  Distinguishes a mutate-meta-prompt call (starts with MUTATE_MARKER) from
 *  an eval call (the rendered `${template}::${fixture.id}` prompt) so ONE
 *  mock can serve both roles the same way a real plugin's target.generate
 *  would (BLOCKER-2: engine never calls a provider SDK directly). */
function writeMockPlugin(opts: {
  targetId: string;
  baselineTemplate: string;
  improvedTemplate: string;
  /** given the rendered prompt (which encodes template + fixture id) and the
   *  0-based call index FOR THAT EXACT PROMPT (increments each time the same
   *  prompt is generated again — e.g. across L3 holdout-repeats passes),
   *  return how many "BAD" markers the mock model should emit. Existing
   *  single-arg callers are unaffected (callIndex simply unused). */
  badCount: (prompt: string, callIndex: number) => number;
  trainFixtureIds: string[];
  holdoutFixtureIds: string[];
  /** Optional: when true for a given rendered eval prompt, the mock model's
   *  raw output is tagged so `extractScript` reports ok:false (excluded) —
   *  simulates budget exhaustion / extraction failure / refusal for the
   *  FIX #1 abort-gating tests (a fixture that "ran:false" must not let its
   *  eval quietly read as an artificially low, fake-winning total). Defaults
   *  to never excluding (existing tests are unaffected). */
  excludeOn?: (prompt: string) => boolean;
  /** L2/L3: declares Target.evalTemperature on the mock plugin so the
   *  nondeterministic-scoring path (NONDETERMINISTIC SCORING warning,
   *  L3 holdout-repeats gate) is exercised. Omit for the existing
   *  deterministic (temperature-0) mock behavior. */
  evalTemperature?: number;
  /** E2: declares Target.sourceFile/varMap/assignmentVar on the mock plugin
   *  so the `--apply` source-patching path is exercised. Omit (the default)
   *  for every existing test: the mock target has none of these fields and
   *  --apply has nothing to patch. */
  sourceFile?: string;
  varMap?: Record<string, string>;
  assignmentVar?: string;
  /** L12: when set, the mock appends every EVAL prompt (not mutate calls) to
   *  this file, one per line, so a test can count how many live generate
   *  calls a phase actually made. Needed because the L12 defect is invisible
   *  in the totals — the wasted final holdout pass produces the same numbers
   *  it would have produced anyway; only the call count reveals it. */
  callLogPath?: string;
}): void {
  const root = pluginRoot();
  mkdirSync(join(root, 'targets'), { recursive: true });
  mkdirSync(join(root, 'rubrics'), { recursive: true });
  mkdirSync(join(root, 'fixtures'), { recursive: true });

  writeFileSync(
    join(root, 'config.json'),
    JSON.stringify({
      [opts.targetId]: {
        target: './targets/mock.mjs',
        rubric: './rubrics/mock.mjs',
        fixtures: './fixtures/mock.json',
      },
    }),
    'utf8',
  );

  const fixtures = [
    ...opts.trainFixtureIds.map(id => ({ id, split: 'train' })),
    ...opts.holdoutFixtureIds.map(id => ({ id, split: 'holdout' })),
  ];
  writeFileSync(join(root, 'fixtures', 'mock.json'), JSON.stringify(fixtures), 'utf8');

  const evalTempLine =
    opts.evalTemperature !== undefined ? `  evalTemperature: ${JSON.stringify(opts.evalTemperature)},\n` : '';
  const sourceFileLine = opts.sourceFile !== undefined ? `  sourceFile: ${JSON.stringify(opts.sourceFile)},\n` : '';
  const varMapLine = opts.varMap !== undefined ? `  varMap: ${JSON.stringify(opts.varMap)},\n` : '';
  const assignmentVarLine =
    opts.assignmentVar !== undefined ? `  assignmentVar: ${JSON.stringify(opts.assignmentVar)},\n` : '';
  const callLogLine =
    opts.callLogPath !== undefined
      ? `    appendFileSync(${JSON.stringify(opts.callLogPath)}, prompt + '\\n');\n`
      : '';
  const callLogImport = opts.callLogPath !== undefined ? `import { appendFileSync } from 'node:fs';\n` : '';
  const targetSrc = `${callLogImport}
const __callCounts = {};
export const target = {
  id: ${JSON.stringify(opts.targetId)},
  loadTemplate: () => ${JSON.stringify(opts.baselineTemplate)},
  renderPrompt: (tpl, fx) => ({ prompt: tpl + '::' + fx.id }),
${evalTempLine}${sourceFileLine}${varMapLine}${assignmentVarLine}  generate: async (prompt, options) => {
    if (prompt.startsWith(${JSON.stringify(MUTATE_MARKER)})) {
      return {
        raw: '---DIAGNOSIS---\\nDiagnosis text.\\n\\n---STRATEGY---\\nStrategy text.\\n\\n---TEMPLATE---\\n' + ${JSON.stringify(opts.improvedTemplate)} + '\\n\\n---RATIONALE---\\nRationale text.',
        model: 'mock-model',
        inputTokens: 50,
        outputTokens: 50,
        cost: 0.002,
      };
    }
${callLogLine}    const badFn = ${opts.badCount.toString()};
    const excludeFn = ${(opts.excludeOn ?? (() => false)).toString()};
    __callCounts[prompt] = (__callCounts[prompt] || 0) + 1;
    const callIndex = __callCounts[prompt] - 1;
    const n = badFn(prompt, callIndex);
    const text = Array.from({ length: n }, () => 'BAD').join(' ') || 'GOOD';
    const raw = excludeFn(prompt) ? '###EXCLUDE###' + text : text;
    return { raw, model: 'mock-model', inputTokens: 20, outputTokens: 10, cost: 0.001 };
  },
  extractScript: (raw) => (raw.startsWith('###EXCLUDE###') ? { ok: false, reason: 'mock excluded' } : { ok: true, text: raw }),
};
export default target;
`;
  writeFileSync(join(root, 'targets', 'mock.mjs'), targetSrc, 'utf8');

  const rubricSrc = `
export const rubric = {
  categories: ['bad'],
  describe: () => 'Counts BAD markers. Fewer is better.',
  score: (text) => {
    const n = (text.match(/BAD/g) || []).length;
    const hits = [];
    for (let i = 0; i < n; i++) hits.push({ category: 'bad', matched: 'BAD' });
    return { categories: { bad: n }, total: n, hits, ran: true };
  },
};
export default rubric;
`;
  writeFileSync(join(root, 'rubrics', 'mock.mjs'), rubricSrc, 'utf8');
}

describe('runOptimize — inert-by-default (Absent config)', () => {
  it('prints "no plugin configured" and reports status no-plugin when config.json is absent', async () => {
    const report = await runOptimize(['whatever-target'], projectDir);
    expect(report.status).toBe('no-plugin');
  });

  it('does not create ANY files under the project when no plugin is configured', async () => {
    await runOptimize(['whatever-target'], projectDir);
    expect(existsSync(pluginRoot())).toBe(false);
  });
});

describe('runOptimize — unknown target', () => {
  it('reports unknown-target for a target id not present in config.json', async () => {
    writeMockPlugin({
      targetId: 'known-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: () => 1,
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: [],
    });
    const report = await runOptimize(['nonexistent-target'], projectDir);
    expect(report.status).toBe('unknown-target');
  });
});

describe('runOptimize — holdout gate (FIX #1)', () => {
  it('accepts the win and reports the improved template when holdout does NOT regress', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      // BASELINE always emits 1 BAD; IMPROVED always emits 0 BAD (GOOD),
      // on both train AND holdout — a genuine, non-overfit improvement.
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1', 'train-2'],
      holdoutFixtureIds: ['holdout-1'],
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=3'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.overfit).toBe(false);
    expect(report.trainBaseline?.total).toBe(2); // 2 train fixtures x 1 BAD
    expect(report.trainFinal?.total).toBe(0);
    expect(report.holdoutBaseline?.total).toBe(1);
    expect(report.holdoutFinal?.total).toBe(0);
    expect(report.finalTemplate).toContain('IMPROVED');

    // Winning template persisted under the project-local templates dir.
    const templatePath = join(pluginRoot(), 'templates', 'mock-target.md');
    expect(existsSync(templatePath)).toBe(true);
  });

  it('labels OVERFIT and refuses the win when holdout regresses relative to baseline', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      // IMPROVED looks great on train (0 BAD) but WORSE on holdout (3 BAD
      // vs baseline's 1 BAD) — the mutator overfit to train.
      badCount: (prompt) => {
        if (prompt.includes('IMPROVED') && prompt.includes('holdout-1')) return 3;
        if (prompt.includes('IMPROVED')) return 0;
        if (prompt.includes('BASELINE') && prompt.includes('holdout-1')) return 1;
        return 1; // BASELINE on train
      },
      trainFixtureIds: ['train-1', 'train-2'],
      holdoutFixtureIds: ['holdout-1'],
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=3'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.overfit).toBe(true);
    expect(report.holdoutBaseline?.total).toBe(1);
    expect(report.holdoutFinal?.total).toBe(3);
    // Refused: final template reverts to the baseline, not the "winner".
    expect(report.finalTemplate).toBe('BASELINE {{X}}');

    // The overfit "win" must NOT be persisted as the new template.
    const templatePath = join(pluginRoot(), 'templates', 'mock-target.md');
    expect(existsSync(templatePath)).toBe(false);
  });
});

describe('runOptimize — FINDING #1: abort-gating on candidate/holdout eval', () => {
  it('does not accept a candidate whose train eval aborted (mostly-excluded fixtures reading a fake low total)', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      // BASELINE emits 1 BAD on train (a real, non-zero total).
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: [],
      // Every candidate (IMPROVED) train eval is excluded (extraction
      // failure / budget exhaustion stand-in). Without the FIX #1 gate,
      // the excluded fixture contributes 0 to categoryTotals, so
      // candidate.total (0) reads as a fake improvement over baseline (1)
      // and isImprovement() would wrongly accept it.
      excludeOn: (prompt) => prompt.includes('IMPROVED'),
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=1'], projectDir);

    expect(report.status).toBe('ok');
    // Candidate must be rejected: the accepted/final total stays at baseline's.
    expect(report.trainFinal?.total).toBe(1);
    expect(report.finalTemplate).toBe('BASELINE {{X}}');
    expect(report.finalTemplate).not.toContain('IMPROVED');

    // No fake win persisted.
    const templatePath = join(pluginRoot(), 'templates', 'mock-target.md');
    expect(existsSync(templatePath)).toBe(false);
  });

  it('refuses the win as INCONCLUSIVE when the holdout final eval aborts, even though the (fake) totals show no regression', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      // BASELINE emits 1 BAD everywhere; IMPROVED emits 0 BAD everywhere it
      // is actually scored (a genuine, non-overfit train improvement).
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1', 'train-2'],
      holdoutFixtureIds: ['holdout-1'],
      // The FINAL holdout pass (IMPROVED template, holdout-1 fixture) is
      // excluded — e.g. budget exhausts at the final gate. Old code reads
      // holdoutFinal.total (0, from an excluded/empty aggregate) as "not
      // greater than" holdoutBaseline.total (1) -> no regression detected
      // -> reports a clean win. That is WRONG: the holdout gate never
      // actually validated anything.
      excludeOn: (prompt) => prompt.includes('IMPROVED') && prompt.includes('holdout-1'),
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=3'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.holdoutBaseline?.total).toBe(1);
    // The old buggy regression check ("total > baseline total") would be
    // false here (0 is not > 1) — proving this must NOT be gated only by
    // that comparison. The aborted holdout final must independently refuse
    // the win.
    expect((report as any).holdoutInconclusive).toBe(true);
    expect(report.finalTemplate).toBe('BASELINE {{X}}');

    // Refused: must NOT be persisted as a clean win.
    const templatePath = join(pluginRoot(), 'templates', 'mock-target.md');
    expect(existsSync(templatePath)).toBe(false);
  });
});

describe('runOptimize — dry-run', () => {
  it('scores the baseline on train and holdout but performs zero mutations', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => (prompt.includes('BASELINE') ? 2 : 0),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: ['holdout-1'],
    });

    const report = await runOptimize(['mock-target', '--dry-run'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.iterations).toBe(0);
    expect(report.trainBaseline?.total).toBe(2);
    expect(report.finalTemplate).toBe('BASELINE {{X}}');

    const templatePath = join(pluginRoot(), 'templates', 'mock-target.md');
    expect(existsSync(templatePath)).toBe(false);
  });
});

describe('unifiedDiff (L1 helper)', () => {
  it('returns "(no changes)" when before and after are identical', () => {
    expect(unifiedDiff('same\ntext', 'same\ntext')).toBe('(no changes)');
  });

  it('marks removed and added lines with -/+ prefixes', () => {
    const diff = unifiedDiff('line1\nline2\nline3', 'line1\nline2 changed\nline3');
    expect(diff).toContain('- line2');
    expect(diff).toContain('+ line2 changed');
    expect(diff).toContain('  line1');
    expect(diff).toContain('  line3');
  });
});

describe('runOptimize — L1: seed backup before overwrite + seed-vs-final diff in report', () => {
  it('writes a backup of the PRIOR template to backupsDir before persisting a win, and the run report contains a diff section', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1', 'train-2'],
      holdoutFixtureIds: ['holdout-1'],
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=3'], projectDir);
    expect(report.status).toBe('ok');
    expect(report.finalTemplate).toContain('IMPROVED');

    // Backup of the prior (baseline) template must exist, written BEFORE
    // the winning template overwrote templates/mock-target.md.
    const backupsDir = join(pluginRoot(), 'backups');
    expect(existsSync(backupsDir)).toBe(true);
    const backupFiles = readdirSync(backupsDir).filter(f => f.startsWith('mock-target-'));
    expect(backupFiles.length).toBeGreaterThanOrEqual(1);
    const backupContent = readFileSync(join(backupsDir, backupFiles[0]!), 'utf8');
    expect(backupContent).toBe('BASELINE {{X}}');

    // Run report must contain a diff section showing the seed-vs-final change.
    const runsDir = join(pluginRoot(), 'runs');
    const runFiles = readdirSync(runsDir).filter(f => f.startsWith('mock-target-'));
    expect(runFiles.length).toBeGreaterThanOrEqual(1);
    const reportContent = readFileSync(join(runsDir, runFiles[0]!), 'utf8');
    expect(reportContent).toMatch(/## Seed vs Final Diff/i);
    expect(reportContent).toContain('BASELINE');
    expect(reportContent).toContain('IMPROVED');
  });

  it('does not write a backup when the run refuses the win (OVERFIT) and the template is unchanged', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => {
        if (prompt.includes('IMPROVED') && prompt.includes('holdout-1')) return 3;
        if (prompt.includes('IMPROVED')) return 0;
        if (prompt.includes('BASELINE') && prompt.includes('holdout-1')) return 1;
        return 1;
      },
      trainFixtureIds: ['train-1', 'train-2'],
      holdoutFixtureIds: ['holdout-1'],
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=3'], projectDir);
    expect(report.overfit).toBe(true);

    const backupsDir = join(pluginRoot(), 'backups');
    expect(existsSync(backupsDir)).toBe(false);
  });
});

describe('runOptimize — L2: NONDETERMINISTIC SCORING stamped in report and state', () => {
  it('stamps a NONDETERMINISTIC SCORING warning in the run report and per-iteration state when target.evalTemperature is not 0', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: [],
      evalTemperature: 1,
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=1'], projectDir);
    expect(report.status).toBe('ok');

    const runsDir = join(pluginRoot(), 'runs');
    const runFiles = readdirSync(runsDir);
    const reportContent = readFileSync(join(runsDir, runFiles[0]!), 'utf8');
    expect(reportContent).toMatch(/NONDETERMINISTIC SCORING/);

    const stateContent = JSON.parse(readFileSync(join(pluginRoot(), 'state', 'mock-target.json'), 'utf8'));
    expect(stateContent.length).toBeGreaterThan(0);
    expect(stateContent[0].nondeterministicScoring).toBe(true);
  });

  it('does NOT stamp NONDETERMINISTIC SCORING for a deterministic target (no evalTemperature declared)', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: [],
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=1'], projectDir);
    expect(report.status).toBe('ok');

    const runsDir = join(pluginRoot(), 'runs');
    const runFiles = readdirSync(runsDir);
    const reportContent = readFileSync(join(runsDir, runFiles[0]!), 'utf8');
    expect(reportContent).not.toMatch(/NONDETERMINISTIC SCORING/);

    const stateContent = JSON.parse(readFileSync(join(pluginRoot(), 'state', 'mock-target.json'), 'utf8'));
    expect(stateContent[0].nondeterministicScoring).toBe(false);
  });
});

describe('runOptimize — L3: holdout-repeats noise floor gate', () => {
  it('accepts the win when the candidate beats the baseline on EVERY holdout repeat (default repeats=2)', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => (prompt.includes('BASELINE') ? 5 : 0),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: ['holdout-1'],
      evalTemperature: 1,
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=1'], projectDir);

    expect(report.status).toBe('ok');
    expect((report as any).overfit).toBe(false);
    expect((report as any).holdoutInconclusive).toBe(false);
    expect(report.finalTemplate).toContain('IMPROVED');
    expect((report as any).holdoutBaselineRepeatTotals).toEqual([5, 5]);
    expect((report as any).holdoutFinalRepeatTotals).toEqual([0, 0]);
  });

  it('labels INCONCLUSIVE (not a clean win) and refuses when the candidate wins some repeats but not others (noise floor)', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt, callIndex) => {
        if (prompt.includes('BASELINE')) return 5;
        if (prompt.includes('holdout-1')) return callIndex === 0 ? 0 : 10; // wins repeat 0, loses repeat 1
        return 0; // clean win on train, always
      },
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: ['holdout-1'],
      evalTemperature: 1,
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=1'], projectDir);

    expect(report.status).toBe('ok');
    expect((report as any).overfit).toBe(false);
    expect((report as any).holdoutInconclusive).toBe(true);
    expect((report as any).holdoutInconclusiveReason).toBe('mixed-repeats');
    // Refused: reverts to baseline, same refusal path as OVERFIT.
    expect(report.finalTemplate).toBe('BASELINE {{X}}');

    const templatePath = join(pluginRoot(), 'templates', 'mock-target.md');
    expect(existsSync(templatePath)).toBe(false);
  });

  it('honors --holdout-repeats=N: a regression only visible on the 3rd repeat is caught with N=3 but missed with the default N=2', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt, callIndex) => {
        if (prompt.includes('BASELINE')) return 5;
        if (prompt.includes('holdout-1')) return callIndex < 2 ? 0 : 10; // wins repeats 0,1; loses repeat 2
        return 0;
      },
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: ['holdout-1'],
      evalTemperature: 1,
    });

    const report = await runOptimize(
      ['mock-target', '--budget=10', '--max-iters=1', '--holdout-repeats=3'],
      projectDir,
    );

    expect(report.status).toBe('ok');
    expect((report as any).holdoutInconclusive).toBe(true);
    expect((report as any).holdoutInconclusiveReason).toBe('mixed-repeats');
    expect((report as any).holdoutFinalRepeatTotals).toEqual([0, 0, 10]);
    expect(report.finalTemplate).toBe('BASELINE {{X}}');
  });

  it('deterministic targets (no evalTemperature) keep the original single-sample holdout gate — no repeats fields on the report', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1', 'train-2'],
      holdoutFixtureIds: ['holdout-1'],
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=3'], projectDir);

    expect(report.status).toBe('ok');
    expect((report as any).holdoutBaselineRepeatTotals).toBeUndefined();
    expect((report as any).holdoutFinalRepeatTotals).toBeUndefined();
  });
});

describe('runOptimize — L5: rubric saturation note', () => {
  it('notes RUBRIC SATURATED in the report when the accepted/final train total hits 0', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: [],
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=3'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.trainFinal?.total).toBe(0);

    const runsDir = join(pluginRoot(), 'runs');
    const runFiles = readdirSync(runsDir);
    const reportContent = readFileSync(join(runsDir, runFiles[0]!), 'utf8');
    expect(reportContent).toMatch(/RUBRIC SATURATED/);
    expect(reportContent).toMatch(/total=0/);
  });

  it('does not note RUBRIC SATURATED when the final train total is above 0', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      // IMPROVED still leaves 1 BAD marker: never reaches total=0.
      badCount: (prompt) => (prompt.includes('BASELINE') ? 3 : 1),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: [],
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=1'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.trainFinal?.total).toBe(1);

    const runsDir = join(pluginRoot(), 'runs');
    const runFiles = readdirSync(runsDir);
    const reportContent = readFileSync(join(runsDir, runFiles[0]!), 'utf8');
    expect(reportContent).not.toMatch(/RUBRIC SATURATED/);
  });
});

describe('parseArgs (L6: --lifetime-budget flag)', () => {
  it('defaults lifetimeBudget to null when --lifetime-budget is not passed', () => {
    const args = parseArgs(['some-target', '--budget=0.45']);
    expect(args.budget).toBe(0.45);
    expect(args.lifetimeBudget).toBeNull();
  });

  it('parses --lifetime-budget=N as the optional absolute ceiling, separate from --budget', () => {
    const args = parseArgs(['some-target', '--budget=0.45', '--lifetime-budget=2.5']);
    expect(args.budget).toBe(0.45);
    expect(args.lifetimeBudget).toBe(2.5);
  });
});

describe('runOptimize (L6: --budget=N is PER-RUN, not lifetime, the live bug)', () => {
  function seedBudgetLedger(spentUsd: number): void {
    const state: BudgetState = { capUsd: 5, spentUsd, entries: [] };
    mkdirSync(pluginRoot(), { recursive: true });
    writeFileSync(join(pluginRoot(), '_budget.json'), JSON.stringify(state, null, 2), 'utf8');
  }

  it('does NOT abort instantly when the ledger already holds MORE lifetime spend than --budget, because --budget caps only this run', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: [],
    });
    // Ledger already holds $0.6027 lifetime spend (LIVE reproduction: a
    // fresh --budget=0.45 run used to read "Budget already exhausted
    // ($0.6027)" and abort having done zero work).
    seedBudgetLedger(0.6027);

    const report = await runOptimize(['mock-target', '--budget=0.45', '--max-iters=1'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.trainBaseline?.total).toBe(1);
  });

  it('DOES abort when --lifetime-budget=N is supplied and the ledger already meets or exceeds it, even though --budget (run cap) has room', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: [],
    });
    seedBudgetLedger(1.0);

    const report = await runOptimize(
      ['mock-target', '--budget=100', '--lifetime-budget=1.0', '--max-iters=1'],
      projectDir,
    );

    expect(report.status).toBe('aborted');
  });

  it('the abort message states which cap tripped and shows both the run and lifetime numbers', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: [],
    });
    seedBudgetLedger(1.0528);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let allLogs = '';
    try {
      await runOptimize(['mock-target', '--budget=100', '--lifetime-budget=1.0', '--max-iters=1'], projectDir);
      // Read calls BEFORE mockRestore(): mockRestore() also clears mock.calls
      // history (same as mockReset), so reading it after restore always sees
      // an empty array regardless of what was actually logged.
      allLogs = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    } finally {
      logSpy.mockRestore();
    }
    expect(allLogs).toMatch(/abort/i);
    expect(allLogs).toMatch(/lifetime/i);
    expect(allLogs).toContain('1.0528');
  });

  it('carries the run spend (not only lifetime spend) into the per-iteration state record', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1', 'train-2'],
      holdoutFixtureIds: ['holdout-1'],
    });
    seedBudgetLedger(2.0);

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=3'], projectDir);
    expect(report.status).toBe('ok');

    const stateContent = JSON.parse(readFileSync(join(pluginRoot(), 'state', 'mock-target.json'), 'utf8'));
    expect(stateContent.length).toBeGreaterThan(0);
    // Run spend must be present and stay far below the $2.0 lifetime figure
    // already seeded in the ledger, proving it tracks THIS run only.
    expect(typeof stateContent[0].runSpendUsd).toBe('number');
    expect(stateContent[0].runSpendUsd).toBeLessThan(2.0);
    expect(stateContent[0].spendUsd).toBeGreaterThanOrEqual(2.0);
  });
});

describe('runOptimize: E2, --apply wires source-patcher.ts behind an explicit flag', () => {
  const SOURCE_REL = 'src/prompt-source.ts';
  const OLD_REGION_MARKER = 'OLD REGION CONTENT';

  function sourcePath(): string {
    return join(projectDir, SOURCE_REL);
  }

  /** Writes a source file with a valid sentinel pair for target 'mock-target'.
   *  Returns the exact content written so tests can assert byte-for-byte
   *  preservation of everything OUTSIDE the sentinel region. */
  function writeSentinelSource(): string {
    const abs = sourcePath();
    mkdirSync(dirname(abs), { recursive: true });
    const content =
      'export function buildPrompt(input: { x: string }) {\n' +
      '  // PROMPT-OPTIMIZER:START id=mock-target\n' +
      `  const promptVar = \`${OLD_REGION_MARKER}\`;\n` +
      '  // PROMPT-OPTIMIZER:END\n' +
      '  return promptVar;\n' +
      '}\n';
    writeFileSync(abs, content, 'utf8');
    return content;
  }

  /** Writes a source file with NO sentinels at all (case g). */
  function writeSourceWithoutSentinels(): string {
    const abs = sourcePath();
    mkdirSync(dirname(abs), { recursive: true });
    const content = 'export function buildPrompt() {\n  return "no sentinels here";\n}\n';
    writeFileSync(abs, content, 'utf8');
    return content;
  }

  function backupsDir(): string {
    return join(pluginRoot(), 'backups');
  }

  /** Clean, non-overfit, non-inconclusive win on both train and holdout:
   *  IMPROVED always emits 0 BAD, BASELINE always emits 1 BAD. */
  const CLEAN_WIN_BAD_COUNT = (prompt: string) => (prompt.includes('BASELINE') ? 1 : 0);

  function pluginWithSource(badCount: (prompt: string, callIndex: number) => number, holdoutFixtureIds: string[] = ['holdout-1']): void {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount,
      trainFixtureIds: ['train-1', 'train-2'],
      holdoutFixtureIds,
      sourceFile: SOURCE_REL,
      varMap: { X: 'input.x' },
      assignmentVar: 'promptVar',
    });
  }

  it('(a) default (no --apply): source file is NOT touched even when the target declares sourceFile and the run is a clean win', async () => {
    pluginWithSource(CLEAN_WIN_BAD_COUNT);
    const before = writeSentinelSource();

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=3'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.finalTemplate).toContain('IMPROVED');
    expect(readFileSync(sourcePath(), 'utf8')).toBe(before);
    expect((report as any).applyResult?.status).toBe('skipped');
    expect((report as any).applyResult?.reason).toMatch(/--apply/);
  });

  it('(b) --apply + sourceFile + clean win: replaces the sentinel region, leaves surrounding content byte-for-byte untouched, and writes a backup', async () => {
    pluginWithSource(CLEAN_WIN_BAD_COUNT);
    const before = writeSentinelSource();

    const report = await runOptimize(['mock-target', '--apply', '--budget=10', '--max-iters=3'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.finalTemplate).toContain('IMPROVED');

    const after = readFileSync(sourcePath(), 'utf8');
    expect(after).not.toBe(before);
    expect(after).toContain('IMPROVED');
    expect(after).not.toContain(OLD_REGION_MARKER);
    // Content OUTSIDE the sentinel region is untouched byte-for-byte.
    expect(after).toContain('export function buildPrompt(input: { x: string }) {');
    expect(after).toContain('// PROMPT-OPTIMIZER:START id=mock-target');
    expect(after).toContain('// PROMPT-OPTIMIZER:END');
    expect(after).toContain('return promptVar;');
    expect(after).toContain('}\n');

    expect((report as any).applyResult?.status).toBe('applied');
    expect((report as any).applyResult?.sourceFile).toBe(SOURCE_REL);
    const reportedBackupPath = (report as any).applyResult?.backupPath as string;
    expect(existsSync(reportedBackupPath)).toBe(true);
    expect(readFileSync(reportedBackupPath, 'utf8')).toContain(OLD_REGION_MARKER);

    // Backup lives under the project-local backups dir, with a filename
    // distinct from the template backups (.md) already written there.
    expect(reportedBackupPath.startsWith(backupsDir())).toBe(true);
    expect(reportedBackupPath.endsWith('.txt')).toBe(true);
    const backupFiles = readdirSync(backupsDir());
    expect(backupFiles.some(f => f.endsWith('.md'))).toBe(true);
    expect(backupFiles.some(f => f.endsWith('.txt'))).toBe(true);
  });

  it('(c) --apply + OVERFIT refusal: source file NOT touched', async () => {
    pluginWithSource((prompt: string) => {
      if (prompt.includes('IMPROVED') && prompt.includes('holdout-1')) return 3;
      if (prompt.includes('IMPROVED')) return 0;
      if (prompt.includes('BASELINE') && prompt.includes('holdout-1')) return 1;
      return 1;
    });
    const before = writeSentinelSource();

    const report = await runOptimize(['mock-target', '--apply', '--budget=10', '--max-iters=3'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.overfit).toBe(true);
    expect(readFileSync(sourcePath(), 'utf8')).toBe(before);
    expect((report as any).applyResult?.status).toBe('skipped');
    expect((report as any).applyResult?.reason).toMatch(/overfit/i);
  });

  it('(d) --apply + INCONCLUSIVE refusal: source file NOT touched', async () => {
    // Holdout-final-aborts setup (INCONCLUSIVE), matching the existing
    // FINDING #1 test above, with sourceFile/varMap/assignmentVar declared.
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: (prompt: string) => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1', 'train-2'],
      holdoutFixtureIds: ['holdout-1'],
      excludeOn: (prompt: string) => prompt.includes('IMPROVED') && prompt.includes('holdout-1'),
      sourceFile: SOURCE_REL,
      varMap: { X: 'input.x' },
      assignmentVar: 'promptVar',
    });
    const before = writeSentinelSource();

    const report = await runOptimize(['mock-target', '--apply', '--budget=10', '--max-iters=3'], projectDir);

    expect(report.status).toBe('ok');
    expect((report as any).holdoutInconclusive).toBe(true);
    expect(readFileSync(sourcePath(), 'utf8')).toBe(before);
    expect((report as any).applyResult?.status).toBe('skipped');
    expect((report as any).applyResult?.reason).toMatch(/inconclusive/i);
  });

  it('(e) --apply + --dry-run: source file NOT touched', async () => {
    pluginWithSource(CLEAN_WIN_BAD_COUNT);
    const before = writeSentinelSource();

    const report = await runOptimize(['mock-target', '--apply', '--dry-run'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.iterations).toBe(0);
    expect(readFileSync(sourcePath(), 'utf8')).toBe(before);
  });

  it('(f) --apply but the target declares no sourceFile: no patch attempted, clean skip message', async () => {
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: CLEAN_WIN_BAD_COUNT,
      trainFixtureIds: ['train-1', 'train-2'],
      holdoutFixtureIds: ['holdout-1'],
      // No sourceFile/varMap/assignmentVar declared.
    });

    const report = await runOptimize(['mock-target', '--apply', '--budget=10', '--max-iters=3'], projectDir);

    expect(report.status).toBe('ok');
    expect((report as any).applyResult?.status).toBe('skipped');
    expect((report as any).applyResult?.reason).toMatch(/sourceFile/i);
  });

  it('(g) --apply but sentinels are missing from the file: warning surfaced, run still exits successfully with its report intact', async () => {
    pluginWithSource(CLEAN_WIN_BAD_COUNT);
    const before = writeSourceWithoutSentinels();

    const report = await runOptimize(['mock-target', '--apply', '--budget=10', '--max-iters=3'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.finalTemplate).toContain('IMPROVED');
    // Source file left exactly as it was (patcher never got past the read+search).
    expect(readFileSync(sourcePath(), 'utf8')).toBe(before);
    expect((report as any).applyResult?.status).toBe('failed');
    expect((report as any).applyResult?.error).toMatch(/sentinel/i);

    // Run report is still written intact (not lost because of the patch failure).
    const runsDir = join(pluginRoot(), 'runs');
    const runFiles = readdirSync(runsDir).filter(f => f.startsWith('mock-target-'));
    expect(runFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('(h) --apply but the final template equals the baseline (nothing was learned): no patch', async () => {
    // IMPROVED never beats BASELINE (both always emit 1 BAD) so the mutator
    // never accepts a candidate: currentTemplate stays the baseline.
    pluginWithSource(() => 1);
    const before = writeSentinelSource();

    const report = await runOptimize(['mock-target', '--apply', '--budget=10', '--max-iters=1'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.finalTemplate).toBe('BASELINE {{X}}');
    expect(readFileSync(sourcePath(), 'utf8')).toBe(before);
    expect((report as any).applyResult?.status).toBe('skipped');
    expect((report as any).applyResult?.reason).toMatch(/unchanged|nothing/i);
  });
});

describe('runOptimize — L12: the final holdout pass must not re-measure an unchanged template', () => {
  // Found live: a rigged-noise run rejected every candidate, so the final
  // template was byte-identical to the baseline — and the engine still spent
  // 5 more live holdout passes comparing that template to itself. Every
  // holdout call costs real money and the comparison can only ever return
  // measurement noise, because the thing being compared did not change.
  //
  // These tests assert on CALL COUNTS, not totals: the wasted pass produces
  // the same numbers a skipped pass would, so totals cannot see the defect.

  function holdoutCallCount(logPath: string): number {
    if (!existsSync(logPath)) return 0;
    return readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(line => line.includes('holdout-1')).length;
  }

  it('skips the final holdout pass entirely when no candidate was accepted (deterministic target)', async () => {
    const callLog = join(projectDir, 'calls-l12-det.log');
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      // IMPROVED is strictly WORSE, so nothing is ever accepted and the
      // final template stays byte-identical to the baseline.
      badCount: prompt => (prompt.includes('BASELINE') ? 1 : 5),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: ['holdout-1'],
      callLogPath: callLog,
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=2'], projectDir);

    expect(report.status).toBe('ok');
    expect(report.finalTemplate).toBe('BASELINE {{X}}');
    // The baseline pass, and ONLY the baseline pass, touched holdout.
    expect(holdoutCallCount(callLog)).toBe(1);
    expect((report as any).holdoutFinalSkippedUnchanged).toBe(true);
  });

  it('skips all N final holdout repeats when no candidate was accepted (nondeterministic target)', async () => {
    const callLog = join(projectDir, 'calls-l12-nondet.log');
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: prompt => (prompt.includes('BASELINE') ? 1 : 5),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: ['holdout-1'],
      evalTemperature: 1,
      callLogPath: callLog,
    });

    const report = await runOptimize(
      ['mock-target', '--budget=10', '--max-iters=2', '--holdout-repeats=5'],
      projectDir,
    );

    expect(report.status).toBe('ok');
    // 5 baseline repeats and no final repeats — not 10.
    expect(holdoutCallCount(callLog)).toBe(5);
    expect((report as any).holdoutFinalSkippedUnchanged).toBe(true);
  });

  it('does not label a skipped final pass as OVERFIT or INCONCLUSIVE (nothing was refused — nothing was proposed)', async () => {
    const callLog = join(projectDir, 'calls-l12-verdict.log');
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: prompt => (prompt.includes('BASELINE') ? 1 : 5),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: ['holdout-1'],
      evalTemperature: 1,
      callLogPath: callLog,
    });

    const report = await runOptimize(
      ['mock-target', '--budget=10', '--max-iters=2', '--holdout-repeats=3'],
      projectDir,
    );

    expect(report.overfit).toBe(false);
    expect(report.holdoutInconclusive).toBe(false);
    expect(report.holdoutInconclusiveReason).toBeUndefined();
    // No fabricated "final repeats" — nothing was measured, so nothing is reported.
    expect(report.holdoutFinalRepeatTotals).toBeUndefined();
  });

  it('says so in the run report rather than silently omitting the final holdout line', async () => {
    const callLog = join(projectDir, 'calls-l12-report.log');
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      badCount: prompt => (prompt.includes('BASELINE') ? 1 : 5),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: ['holdout-1'],
      callLogPath: callLog,
    });

    await runOptimize(['mock-target', '--budget=10', '--max-iters=2'], projectDir);

    const runsDir = join(pluginRoot(), 'runs');
    const runFile = readdirSync(runsDir).find(f => f.startsWith('mock-target-'))!;
    const reportText = readFileSync(join(runsDir, runFile), 'utf8');
    expect(reportText).toMatch(/holdout final.*skipped/i);
  });

  it('STILL runs the final holdout pass when a candidate WAS accepted (the guard must not disable the gate)', async () => {
    const callLog = join(projectDir, 'calls-l12-guard.log');
    writeMockPlugin({
      targetId: 'mock-target',
      baselineTemplate: 'BASELINE {{X}}',
      improvedTemplate: 'IMPROVED {{X}}',
      // IMPROVED is better everywhere: accepted, so the template DOES change
      // and the holdout gate has a real question to answer.
      badCount: prompt => (prompt.includes('BASELINE') ? 1 : 0),
      trainFixtureIds: ['train-1'],
      holdoutFixtureIds: ['holdout-1'],
      callLogPath: callLog,
    });

    const report = await runOptimize(['mock-target', '--budget=10', '--max-iters=2'], projectDir);

    expect(report.finalTemplate).toContain('IMPROVED');
    expect(holdoutCallCount(callLog)).toBe(2); // baseline + final
    expect((report as any).holdoutFinalSkippedUnchanged).toBeFalsy();
    expect(report.holdoutFinal?.total).toBe(0);
  });
});
