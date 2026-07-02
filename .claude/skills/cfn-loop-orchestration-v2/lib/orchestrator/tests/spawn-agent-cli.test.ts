/**
 * Unit tests for the CFN worker runtime CLI (src/cli/spawn-agent-cli.ts).
 *
 * Only the pure functions and an injected-deps `main()` are exercised here.
 * No real `claude` subprocess is ever spawned.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Coordinator, WorkerResult, IterationFeedbackData } from '../src/coordination/coordinator';
import {
  parseArgs,
  resolveProvider,
  buildChildEnv,
  buildPrompt,
  stripFrontmatter,
  parseResult,
  findProjectRoot,
  main,
  type ModelMap,
  type ResolvedProvider,
  type SpawnAgentDeps,
  type RunClaudeResult,
} from '../src/cli/spawn-agent-cli';

describe('parseArgs', () => {
  it('parses a full happy-path argv', () => {
    const result = parseArgs([
      'backend-developer',
      '--task-id',
      'task-123',
      '--agent-id',
      'agent-456',
      '--iteration',
      '2',
      '--context',
      'do the thing',
    ]);

    expect(result).toEqual({
      agentType: 'backend-developer',
      taskId: 'task-123',
      agentId: 'agent-456',
      iteration: 2,
      context: 'do the thing',
    });
  });

  it('accepts flags before the positional agentType', () => {
    const result = parseArgs([
      '--task-id',
      'task-123',
      'coder',
      '--agent-id',
      'agent-456',
      '--iteration',
      '0',
      '--context',
      'ctx',
    ]);

    expect(result.agentType).toBe('coder');
    expect(result.iteration).toBe(0);
  });

  it('throws when agentType positional is missing', () => {
    expect(() =>
      parseArgs(['--task-id', 't1', '--agent-id', 'a1', '--iteration', '1', '--context', 'c'])
    ).toThrow(/agentType/i);
  });

  it('throws when --task-id is missing', () => {
    expect(() =>
      parseArgs(['coder', '--agent-id', 'a1', '--iteration', '1', '--context', 'c'])
    ).toThrow(/task-id/i);
  });

  it('throws when --agent-id is missing', () => {
    expect(() =>
      parseArgs(['coder', '--task-id', 't1', '--iteration', '1', '--context', 'c'])
    ).toThrow(/agent-id/i);
  });

  it('throws when --iteration is missing', () => {
    expect(() =>
      parseArgs(['coder', '--task-id', 't1', '--agent-id', 'a1', '--context', 'c'])
    ).toThrow(/iteration/i);
  });

  it('throws when --iteration is not an integer', () => {
    expect(() =>
      parseArgs([
        'coder',
        '--task-id',
        't1',
        '--agent-id',
        'a1',
        '--iteration',
        'nope',
        '--context',
        'c',
      ])
    ).toThrow(/integer/i);
  });

  it('throws when --context is missing', () => {
    expect(() =>
      parseArgs(['coder', '--task-id', 't1', '--agent-id', 'a1', '--iteration', '1'])
    ).toThrow(/context/i);
  });
});

describe('resolveProvider', () => {
  const map: ModelMap = {
    defaultProvider: 'zai',
    defaultTier: 'sonnet',
    tiers: ['haiku', 'sonnet', 'opus'],
    agentTierOverrides: {
      tester: 'haiku',
    },
    providers: {
      zai: {
        baseUrl: 'https://api.z.ai/api/anthropic',
        apiKeyEnvVar: 'ZAI_API_KEY',
        models: { haiku: 'glm-4.6', sonnet: 'glm-4.7', opus: 'glm-5' },
      },
      anthropic: {
        baseUrl: null,
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        models: {
          haiku: 'claude-3-5-haiku-20241022',
          sonnet: 'claude-sonnet-4-20250514',
          opus: 'claude-opus-4-20250514',
        },
      },
    },
  };

  it('defaults to zai / defaultTier when no env override is set', () => {
    const resolved = resolveProvider(map, 'backend-developer', {});
    expect(resolved).toEqual({
      provider: 'zai',
      tier: 'sonnet',
      model: 'glm-4.7',
      baseUrl: 'https://api.z.ai/api/anthropic',
      apiKeyEnvVar: 'ZAI_API_KEY',
    });
  });

  it('applies agentTierOverrides for the agent type', () => {
    const resolved = resolveProvider(map, 'tester', {});
    expect(resolved.tier).toBe('haiku');
    expect(resolved.model).toBe('glm-4.6');
  });

  it('honors CFN_PROVIDER env override', () => {
    const resolved = resolveProvider(map, 'backend-developer', { CFN_PROVIDER: 'anthropic' });
    expect(resolved.provider).toBe('anthropic');
    expect(resolved.baseUrl).toBeNull();
  });

  it('honors CLAUDE_API_PROVIDER when CFN_PROVIDER is absent', () => {
    const resolved = resolveProvider(map, 'backend-developer', {
      CLAUDE_API_PROVIDER: 'anthropic',
    });
    expect(resolved.provider).toBe('anthropic');
  });

  it('throws for an unknown provider', () => {
    expect(() => resolveProvider(map, 'backend-developer', { CFN_PROVIDER: 'bogus' })).toThrow(
      /unknown provider/i
    );
  });
});

describe('buildChildEnv', () => {
  const zaiResolved: ResolvedProvider = {
    provider: 'zai',
    tier: 'sonnet',
    model: 'glm-4.7',
    baseUrl: 'https://api.z.ai/api/anthropic',
    apiKeyEnvVar: 'ZAI_API_KEY',
  };

  const anthropicResolved: ResolvedProvider = {
    provider: 'anthropic',
    tier: 'sonnet',
    model: 'claude-sonnet-4-20250514',
    baseUrl: null,
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  };

  it('sets zai routing vars and strips ANTHROPIC_API_KEY', () => {
    const inputEnv = {
      ANTHROPIC_API_KEY: 'sk-real-key',
      ZAI_API_KEY: 'zai-secret',
      PATH: '/usr/bin',
    };

    const childEnv = buildChildEnv(zaiResolved, inputEnv);

    expect(childEnv.ANTHROPIC_API_KEY).toBeUndefined();
    expect(childEnv.ANTHROPIC_BASE_URL).toBe('https://api.z.ai/api/anthropic');
    expect(childEnv.ANTHROPIC_AUTH_TOKEN).toBe('zai-secret');
    expect(childEnv.ANTHROPIC_MODEL).toBe('glm-4.7');
    expect(childEnv.ANTHROPIC_SMALL_FAST_MODEL).toBe('glm-4.7');
    expect(childEnv.PATH).toBe('/usr/bin');
  });

  it('does not mutate the input env object', () => {
    const inputEnv = { ANTHROPIC_API_KEY: 'sk-real-key', ZAI_API_KEY: 'zai-secret' };
    const snapshot = { ...inputEnv };

    buildChildEnv(zaiResolved, inputEnv);

    expect(inputEnv).toEqual(snapshot);
  });

  it('unsets custom routing vars for the anthropic provider', () => {
    const inputEnv = {
      ANTHROPIC_API_KEY: 'sk-real-key',
      ANTHROPIC_BASE_URL: 'https://old-base',
      ANTHROPIC_AUTH_TOKEN: 'old-token',
      ANTHROPIC_MODEL: 'old-model',
      ANTHROPIC_SMALL_FAST_MODEL: 'old-small-model',
    };

    const childEnv = buildChildEnv(anthropicResolved, inputEnv);

    expect(childEnv.ANTHROPIC_API_KEY).toBeUndefined();
    expect(childEnv.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(childEnv.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(childEnv.ANTHROPIC_MODEL).toBeUndefined();
    expect(childEnv.ANTHROPIC_SMALL_FAST_MODEL).toBeUndefined();
  });
});

describe('buildPrompt', () => {
  it('includes the task context and the CFN_RESULT instruction', () => {
    const prompt = buildPrompt('backend-developer', 'build the widget');

    expect(prompt).toContain('=== TASK CONTEXT ===');
    expect(prompt).toContain('build the widget');
    expect(prompt).toContain('<<<CFN_RESULT>>>');
    expect(prompt).toContain('<<<CFN_END>>>');
    expect(prompt).toContain('backend-developer');
  });

  it('prepends profileText when provided', () => {
    const prompt = buildPrompt('backend-developer', 'ctx', 'PROFILE TEXT HERE');

    expect(prompt.indexOf('PROFILE TEXT HERE')).toBeLessThan(prompt.indexOf('=== TASK CONTEXT ==='));
  });

  it('omits profile section when profileText is absent', () => {
    const prompt = buildPrompt('backend-developer', 'ctx');
    expect(prompt.startsWith('=== CFN WORKER RUN ===')).toBe(true);
    expect(prompt).toContain('=== TASK CONTEXT ===');
  });

  // Regression: agent profile .md files open with YAML frontmatter (--- ... ---).
  // Passed as `claude -p <prompt>`, a leading '-' is misparsed as a CLI flag, so
  // claude exits non-zero with empty stdout. The prompt must never start with '-'
  // and the frontmatter must be stripped.
  it('strips leading YAML frontmatter and never starts with a dash', () => {
    const profile = '---\nname: tester\nmodel: sonnet\n---\n\n# Tester Agent\nDo the thing.';
    const prompt = buildPrompt('tester', 'ctx', profile);

    expect(prompt.startsWith('-')).toBe(false);
    expect(prompt).not.toContain('name: tester');
    expect(prompt).not.toContain('model: sonnet');
    expect(prompt).toContain('# Tester Agent');
  });
});

describe('stripFrontmatter', () => {
  it('removes a leading frontmatter block', () => {
    expect(stripFrontmatter('---\na: 1\n---\nbody')).toBe('body');
  });

  it('leaves text without frontmatter untouched', () => {
    expect(stripFrontmatter('# Heading\ntext')).toBe('# Heading\ntext');
  });

  it('does not strip a --- that is not at the very start', () => {
    const t = 'intro\n---\na: 1\n---\nbody';
    expect(stripFrontmatter(t)).toBe(t);
  });
});

describe('parseResult', () => {
  it('extracts a valid CFN_RESULT block', () => {
    const stdout =
      'some agent chatter\n' +
      '<<<CFN_RESULT>>>{"confidence":0.9,"deliverables":["src/foo.ts"],"testResult":{"pass":5,"fail":0}}<<<CFN_END>>>';

    const result = parseResult(stdout);

    expect(result).toEqual({
      confidence: 0.9,
      deliverables: ['src/foo.ts'],
      testResult: { pass: 5, fail: 0 },
    });
  });

  it('uses the last block when multiple are present', () => {
    const stdout =
      '<<<CFN_RESULT>>>{"confidence":0.1,"deliverables":[],"testResult":{"pass":0,"fail":0}}<<<CFN_END>>>\n' +
      'more output\n' +
      '<<<CFN_RESULT>>>{"confidence":0.8,"deliverables":["src/bar.ts"],"testResult":{"pass":3,"fail":1}}<<<CFN_END>>>';

    const result = parseResult(stdout);

    expect(result.confidence).toBe(0.8);
    expect(result.deliverables).toEqual(['src/bar.ts']);
    expect(result.testResult).toEqual({ pass: 3, fail: 1 });
  });

  it('returns safe defaults when no block is found', () => {
    const result = parseResult('no result block here');
    expect(result).toEqual({ confidence: 0.5, deliverables: [], testResult: { pass: 0, fail: 0 } });
  });

  it('returns safe defaults when the block JSON is malformed', () => {
    const stdout = '<<<CFN_RESULT>>>{not valid json<<<CFN_END>>>';
    const result = parseResult(stdout);
    expect(result).toEqual({ confidence: 0.5, deliverables: [], testResult: { pass: 0, fail: 0 } });
  });

  it('clamps confidence to [0, 1]', () => {
    const over = parseResult(
      '<<<CFN_RESULT>>>{"confidence":5,"deliverables":[],"testResult":{"pass":0,"fail":0}}<<<CFN_END>>>'
    );
    expect(over.confidence).toBe(1);

    const under = parseResult(
      '<<<CFN_RESULT>>>{"confidence":-2,"deliverables":[],"testResult":{"pass":0,"fail":0}}<<<CFN_END>>>'
    );
    expect(under.confidence).toBe(0);
  });

  it('defaults confidence to 0.5 when missing or NaN', () => {
    const missing = parseResult(
      '<<<CFN_RESULT>>>{"deliverables":[],"testResult":{"pass":0,"fail":0}}<<<CFN_END>>>'
    );
    expect(missing.confidence).toBe(0.5);
  });

  it('coerces deliverables, dropping non-string entries and defaulting when absent', () => {
    const withJunk = parseResult(
      '<<<CFN_RESULT>>>{"confidence":0.7,"deliverables":["a.ts",1,null,"b.ts"],"testResult":{"pass":0,"fail":0}}<<<CFN_END>>>'
    );
    expect(withJunk.deliverables).toEqual(['a.ts', 'b.ts']);

    const missing = parseResult(
      '<<<CFN_RESULT>>>{"confidence":0.7,"testResult":{"pass":0,"fail":0}}<<<CFN_END>>>'
    );
    expect(missing.deliverables).toEqual([]);
  });

  it('defaults testResult to {pass:0,fail:0} when missing, and preserves skip when present', () => {
    const missing = parseResult('<<<CFN_RESULT>>>{"confidence":0.7,"deliverables":[]}<<<CFN_END>>>');
    expect(missing.testResult).toEqual({ pass: 0, fail: 0 });

    const withSkip = parseResult(
      '<<<CFN_RESULT>>>{"confidence":0.7,"deliverables":[],"testResult":{"pass":1,"fail":2,"skip":3}}<<<CFN_END>>>'
    );
    expect(withSkip.testResult).toEqual({ pass: 1, fail: 2, skip: 3 });
  });

  // Regression: GLM (and other models) sometimes emit the JSON but drop the
  // <<<CFN_RESULT>>> markers, which previously collapsed to safe defaults and
  // starved the gate/consensus of real worker confidence.
  it('salvages a result-shaped JSON object when the markers are absent', () => {
    const stdout =
      'GLM-4.6 here. Task done.\n' +
      '{"confidence":0.83,"deliverables":["src/foo.ts"],"testResult":{"pass":4,"fail":1}}\n';
    const result = parseResult(stdout);
    expect(result.confidence).toBe(0.83);
    expect(result.deliverables).toEqual(['src/foo.ts']);
    expect(result.testResult).toEqual({ pass: 4, fail: 1 });
  });

  it('prefers the marker block over a stray earlier JSON object', () => {
    const stdout =
      '{"confidence":0.1,"deliverables":[],"testResult":{"pass":0,"fail":9}}\n' +
      '<<<CFN_RESULT>>>{"confidence":0.9,"deliverables":["x.ts"],"testResult":{"pass":2,"fail":0}}<<<CFN_END>>>';
    const result = parseResult(stdout);
    expect(result.confidence).toBe(0.9);
    expect(result.testResult).toEqual({ pass: 2, fail: 0 });
  });

  it('picks the last result-shaped object and ignores unrelated JSON', () => {
    const stdout =
      'config: {"host":"localhost","port":8080}\n' +
      '{"confidence":0.5,"deliverables":[],"testResult":{"pass":1,"fail":0}}\n' +
      '{"confidence":0.66,"deliverables":["a.ts"],"testResult":{"pass":7,"fail":2,"skip":1}}';
    const result = parseResult(stdout);
    expect(result.confidence).toBe(0.66);
    expect(result.deliverables).toEqual(['a.ts']);
    expect(result.testResult).toEqual({ pass: 7, fail: 2, skip: 1 });
  });
});

describe('main', () => {
  class FakeCoordinator implements Coordinator {
    public results = new Map<string, WorkerResult>();
    public doneSignals: string[] = [];

    baseDir(taskId: string): string {
      return `/fake/${taskId}`;
    }

    signalDone(taskId: string, agentId: string): void {
      this.doneSignals.push(`${taskId}:${agentId}`);
    }

    async waitForDone(_taskId: string, agentIds: string[], _timeoutSec: number): Promise<string[]> {
      return agentIds;
    }

    setResult(taskId: string, agentId: string, result: WorkerResult): void {
      this.results.set(`${taskId}:${agentId}`, result);
    }

    getResult(taskId: string, agentId: string): WorkerResult | null {
      return this.results.get(`${taskId}:${agentId}`) ?? null;
    }

    writeFeedback(_taskId: string, _iteration: number, _feedback: IterationFeedbackData): void {
      // no-op for tests
    }

    readFeedback(_taskId: string, _iteration: number): IterationFeedbackData | null {
      return null;
    }
  }

  function baseArgv(): string[] {
    return [
      '/usr/bin/node',
      '/path/to/spawn-agent-cli.js',
      'backend-developer',
      '--task-id',
      'task-1',
      '--agent-id',
      'agent-1',
      '--iteration',
      '1',
      '--context',
      'build the thing',
    ];
  }

  it('writes the parsed WorkerResult and signals done on success', async () => {
    const coordinator = new FakeCoordinator();
    const stdout =
      '<<<CFN_RESULT>>>{"confidence":0.95,"deliverables":["src/x.ts"],"testResult":{"pass":10,"fail":0}}<<<CFN_END>>>';

    const runClaude = jest.fn(
      (): RunClaudeResult => ({ stdout, code: 0 })
    );

    const deps: SpawnAgentDeps = { runClaude, coordinator };

    const exitCode = await main(baseArgv(), deps);

    expect(exitCode).toBe(0);
    expect(runClaude).toHaveBeenCalledTimes(1);
    expect(coordinator.results.get('task-1:agent-1')).toEqual({
      confidence: 0.95,
      deliverables: ['src/x.ts'],
      testResult: { pass: 10, fail: 0 },
    });
    expect(coordinator.doneSignals).toEqual(['task-1:agent-1']);
  });

  // Regression: a non-zero exit (e.g. the CLI rejecting the prompt) used to be
  // parsed into a 0.5 SAFE_DEFAULT that gate/consensus would trust. It must
  // surface as a real failure (FALLBACK_RESULT), not a fake mid-confidence pass.
  it('writes a fallback result when runClaude exits non-zero', async () => {
    const coordinator = new FakeCoordinator();
    const runClaude = jest.fn(
      (): RunClaudeResult => ({ stdout: '', code: 1 })
    );

    const deps: SpawnAgentDeps = { runClaude, coordinator };

    const exitCode = await main(baseArgv(), deps);

    expect(exitCode).toBe(1);
    expect(coordinator.results.get('task-1:agent-1')).toEqual({
      confidence: 0,
      deliverables: [],
      testResult: { pass: 0, fail: 1 },
    });
    expect(coordinator.doneSignals).toEqual(['task-1:agent-1']);
  });

  it('writes a fallback result and still signals done when runClaude throws', async () => {
    const coordinator = new FakeCoordinator();
    const runClaude = jest.fn((): RunClaudeResult => {
      throw new Error('claude binary exploded');
    });

    const deps: SpawnAgentDeps = { runClaude, coordinator };

    const exitCode = await main(baseArgv(), deps);

    expect(exitCode).toBe(1);
    expect(coordinator.results.get('task-1:agent-1')).toEqual({
      confidence: 0,
      deliverables: [],
      testResult: { pass: 0, fail: 1 },
    });
    expect(coordinator.doneSignals).toEqual(['task-1:agent-1']);
  });
});

describe('findProjectRoot', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cfn-root-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    delete process.env.CFN_PROJECT_ROOT;
    delete process.env.PROJECT_ROOT;
  });

  const REL = '.claude/cfn-config/provider-models.json';

  // Regression: a build that emits a nested `dist/.claude/...` tree used to shadow
  // the real project root, because findProjectRoot matched any `.claude` dir. It
  // must anchor on the actual provider-models.json instead and walk past the decoy.
  it('walks past a decoy .claude dir that lacks the config file', () => {
    // Real root holds the config.
    fs.mkdirSync(path.join(tmp, path.dirname(REL)), { recursive: true });
    fs.writeFileSync(path.join(tmp, REL), '{}');

    // Decoy: nested dist/.claude with NO cfn-config, plus a deep start dir under it.
    const startDir = path.join(tmp, 'pkg', 'dist', '.claude', 'skills', 'x', 'src', 'cli');
    fs.mkdirSync(startDir, { recursive: true });

    expect(findProjectRoot(startDir)).toBe(tmp);
  });

  it('honors CFN_PROJECT_ROOT override when it contains the config', () => {
    fs.mkdirSync(path.join(tmp, path.dirname(REL)), { recursive: true });
    fs.writeFileSync(path.join(tmp, REL), '{}');
    process.env.CFN_PROJECT_ROOT = tmp;

    expect(findProjectRoot('/nonexistent/start/dir')).toBe(tmp);
  });
});
