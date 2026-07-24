import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOptimize } from './optimize.js';

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
  /** given the rendered prompt (which encodes template + fixture id), return
   *  how many "BAD" markers the mock model should emit. */
  badCount: (prompt: string) => number;
  trainFixtureIds: string[];
  holdoutFixtureIds: string[];
  /** Optional: when true for a given rendered eval prompt, the mock model's
   *  raw output is tagged so `extractScript` reports ok:false (excluded) —
   *  simulates budget exhaustion / extraction failure / refusal for the
   *  FIX #1 abort-gating tests (a fixture that "ran:false" must not let its
   *  eval quietly read as an artificially low, fake-winning total). Defaults
   *  to never excluding (existing tests are unaffected). */
  excludeOn?: (prompt: string) => boolean;
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

  const targetSrc = `
export const target = {
  id: ${JSON.stringify(opts.targetId)},
  loadTemplate: () => ${JSON.stringify(opts.baselineTemplate)},
  renderPrompt: (tpl, fx) => ({ prompt: tpl + '::' + fx.id }),
  generate: async (prompt, options) => {
    if (prompt.startsWith(${JSON.stringify(MUTATE_MARKER)})) {
      return {
        raw: '---DIAGNOSIS---\\nDiagnosis text.\\n\\n---STRATEGY---\\nStrategy text.\\n\\n---TEMPLATE---\\n' + ${JSON.stringify(opts.improvedTemplate)} + '\\n\\n---RATIONALE---\\nRationale text.',
        model: 'mock-model',
        inputTokens: 50,
        outputTokens: 50,
        cost: 0.002,
      };
    }
    const badFn = ${opts.badCount.toString()};
    const excludeFn = ${(opts.excludeOn ?? (() => false)).toString()};
    const n = badFn(prompt);
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
