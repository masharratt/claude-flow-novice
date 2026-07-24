/**
 * Tests for the rigged-overfit target v2 (engine Target contract). Provider
 * MOCKED: the live Moonshot API is never called. renderPrompt/extractScript
 * are pure functions exercised directly; generate() is exercised with
 * globalThis.fetch stubbed out via vi.stubGlobal so the shared lib/kimi.ts
 * client's behavior can be proven without a network call.
 *
 * KIMI_API_KEY is set to a dummy value and the memoized key cache in
 * lib/kimi.ts is reset in beforeEach so no real key is ever read and the
 * memoized value cannot leak between tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { riggedOverfitTarget } from './rigged-overfit.js';
import { __resetApiKeyCache } from '../lib/kimi.js';
import type { ReleaseNoteFixture } from '../rubrics/rigged-overfit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

const TERSE_FIXTURE: ReleaseNoteFixture = {
  id: 'target-test-terse',
  split: 'train',
  change: 'Fixed a rounding error in the cart total calculation.',
  style: 'terse',
};

const FORMAL_FIXTURE: ReleaseNoteFixture = {
  id: 'target-test-formal',
  split: 'holdout',
  change: 'Fixed a rounding error in the cart total calculation.',
  style: 'formal',
};

describe('riggedOverfitTarget - id + template', () => {
  it('has id rigged-overfit', () => {
    expect(riggedOverfitTarget.id).toBe('rigged-overfit');
  });

  it('declares evalTemperature: 1 so the engine never sends this target a temperature it must reject', () => {
    expect(riggedOverfitTarget.evalTemperature).toBe(1);
  });

  it('declares pricing instead of relying on a local cost workaround', () => {
    expect(riggedOverfitTarget.pricing).toEqual({ input: 0.6, output: 2.5 });
  });

  it('the seed template file exists under the project-local templates dir', () => {
    expect(existsSync(resolve(PLUGIN_ROOT, 'templates', 'rigged-overfit.md'))).toBe(true);
  });

  it('loadTemplate() returns the seed template containing the change placeholder', () => {
    const template = riggedOverfitTarget.loadTemplate();
    expect(typeof template).toBe('string');
    expect(template).toContain('{{CHANGE}}');
  });

  // v2 rendered {{STYLE}} into the prompt. The mutator then wrote an explicit
  // conditional ("apply the terse rules if Style is terse, the formal rules if
  // formal"), satisfied train AND holdout, and the OVERFIT gate correctly did
  // not fire -- the win was genuine. An overfit rig REQUIRES the train/holdout
  // distribution shift to be unobservable at generation time, so the template
  // carrying a style placeholder is now the bug this test guards against.
  it('the template does NOT expose the fixture style, or no overfit is possible', () => {
    expect(riggedOverfitTarget.loadTemplate()).not.toContain('{{STYLE}}');
  });
});

describe('riggedOverfitTarget.renderPrompt', () => {
  it('substitutes {{CHANGE}} with the fixture change text', () => {
    const template = readFileSync(resolve(PLUGIN_ROOT, 'templates', 'rigged-overfit.md'), 'utf8');
    const { prompt } = riggedOverfitTarget.renderPrompt(template, TERSE_FIXTURE);
    expect(prompt).not.toContain('{{CHANGE}}');
    expect(prompt).toContain('Fixed a rounding error in the cart total calculation.');
  });

  // The core rig invariant. A terse train fixture and a formal holdout fixture
  // carrying the SAME change text must render to byte-identical prompts: the
  // model cannot condition on a signal it never receives, so the only lever a
  // candidate template has is a single global length, and the length that wins
  // the all-terse train set must regress the all-formal holdout set.
  it('renders the same prompt for a terse and a formal fixture with the same change', () => {
    const template = readFileSync(resolve(PLUGIN_ROOT, 'templates', 'rigged-overfit.md'), 'utf8');
    const terse = riggedOverfitTarget.renderPrompt(template, TERSE_FIXTURE);
    const formal = riggedOverfitTarget.renderPrompt(template, FORMAL_FIXTURE);
    expect(terse.prompt).toBe(formal.prompt);
  });

  it('never leaks the style word into the rendered prompt', () => {
    const template = readFileSync(resolve(PLUGIN_ROOT, 'templates', 'rigged-overfit.md'), 'utf8');
    for (const fixture of [TERSE_FIXTURE, FORMAL_FIXTURE]) {
      const { prompt } = riggedOverfitTarget.renderPrompt(template, fixture);
      expect(prompt.toLowerCase()).not.toContain(fixture.style);
    }
  });

  it('leaves no unsubstituted placeholders of any kind', () => {
    const template = readFileSync(resolve(PLUGIN_ROOT, 'templates', 'rigged-overfit.md'), 'utf8');
    const { prompt } = riggedOverfitTarget.renderPrompt(template, FORMAL_FIXTURE);
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});

describe('riggedOverfitTarget.extractScript - discriminated result (tri-state no-run)', () => {
  it('returns ok:true with the trimmed text on a normal release note', () => {
    const raw = 'Fix cart rounding error.';
    const result = riggedOverfitTarget.extractScript(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain('rounding');
  });

  it('strips markdown code fences before use', () => {
    const raw = '```\nFix cart rounding error.\n```';
    const result = riggedOverfitTarget.extractScript(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).not.toContain('```');
  });

  it('discriminates an empty response to ok:false reason empty', () => {
    const result = riggedOverfitTarget.extractScript('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty');
  });

  it('discriminates a refusal string to ok:false reason refusal', () => {
    const raw = "I'm sorry, but I can't help with that request.";
    const result = riggedOverfitTarget.extractScript(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('refusal');
  });

  it('discriminates content with no word characters to ok:false reason parse-fail', () => {
    const raw = '```\n!!! === ---\n```';
    const result = riggedOverfitTarget.extractScript(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('parse-fail');
  });

  it('discriminates a 1-word output to ok:false reason below-min-words (MIN_WORDS is 2)', () => {
    const raw = 'Fixed.';
    const result = riggedOverfitTarget.extractScript(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('below-min-words');
  });

  it('accepts a 2-word output as ok:true (at the MIN_WORDS floor)', () => {
    const raw = 'Fixed rounding.';
    const result = riggedOverfitTarget.extractScript(raw);
    expect(result.ok).toBe(true);
  });
});

describe('riggedOverfitTarget.generate - uses the shared lib/kimi.ts Moonshot client', () => {
  const originalEnv = process.env.KIMI_API_KEY;

  beforeEach(() => {
    process.env.KIMI_API_KEY = 'test-key-not-real';
    __resetApiKeyCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetApiKeyCache();
    if (originalEnv === undefined) delete process.env.KIMI_API_KEY;
    else process.env.KIMI_API_KEY = originalEnv;
  });

  it('sends temperature 1 to kimi-k2.6 and returns the parsed raw/model/tokens/cost', async () => {
    const mockFetch = vi.fn(async (url: unknown, init: any) => {
      expect(url).toBe('https://api.moonshot.ai/v1/chat/completions');
      const body = JSON.parse(init.body);
      expect(body.model).toBe('kimi-k2.6');
      expect(body.temperature).toBe(1);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Fix cart rounding error.' } }],
          usage: { prompt_tokens: 20, completion_tokens: 8 },
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await riggedOverfitTarget.generate('prompt text', { temperature: 1 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.raw).toBe('Fix cart rounding error.');
    expect(result.model).toBe('kimi-k2.6');
    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(8);
    expect(result.cost).toBeGreaterThan(0);
  });

  it('throws a descriptive error on a non-ok response, without leaking the API key', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'invalid api key',
    } as Response));
    vi.stubGlobal('fetch', mockFetch);

    let caught: Error | null = null;
    try {
      await riggedOverfitTarget.generate('prompt text', { temperature: 1 });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('401');
    expect(caught!.message).not.toContain('test-key-not-real');
  });
});
