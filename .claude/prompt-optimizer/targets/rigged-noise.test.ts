/**
 * Tests for the rigged-noise target (engine Target contract). Provider
 * MOCKED: the live Moonshot API is never called. renderPrompt/extractScript
 * are pure functions exercised directly; generate() is exercised with
 * global.fetch stubbed out via vi.stubGlobal so no real key or network call
 * is ever needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rigidNoiseTarget } from './rigged-noise.js';
import { PLUGIN_ROOT, __resetApiKeyCache } from '../lib/kimi.js';
import type { BlurbFixture } from '../rubrics/rigged-noise.js';

const FIXTURE: BlurbFixture = {
  id: 'test-fixture',
  split: 'train',
  wantsComma: true,
  product: 'Brightleaf Ledger',
  audience: 'small farm owners doing their own bookkeeping',
  detail: 'Tracks seasonal income and expenses and generates a tax-ready summary at year end.',
};

describe('rigidNoiseTarget - id + contract declarations', () => {
  it('has id rigged-noise', () => {
    expect(rigidNoiseTarget.id).toBe('rigged-noise');
  });

  it('declares evalTemperature: 1 so the engine never sends this target a temperature kimi-k2.6 must reject', () => {
    expect(rigidNoiseTarget.evalTemperature).toBe(1);
  });

  it('declares pricing instead of relying on the engine built-in table', () => {
    expect(rigidNoiseTarget.pricing).toEqual({ input: 0.6, output: 2.5 });
  });

  it('loadTemplate() returns the seed template containing all three placeholders', () => {
    const template = rigidNoiseTarget.loadTemplate();
    expect(typeof template).toBe('string');
    expect(template).toContain('{{PRODUCT}}');
    expect(template).toContain('{{AUDIENCE}}');
    expect(template).toContain('{{DETAIL}}');
  });
});

describe('rigidNoiseTarget.renderPrompt', () => {
  const template = readFileSync(resolve(PLUGIN_ROOT, 'templates', 'rigged-noise.md'), 'utf8');

  it('substitutes {{PRODUCT}} with the fixture product', () => {
    const { prompt } = rigidNoiseTarget.renderPrompt(template, FIXTURE);
    expect(prompt).not.toContain('{{PRODUCT}}');
    expect(prompt).toContain('Brightleaf Ledger');
  });

  it('substitutes {{AUDIENCE}} with the fixture audience', () => {
    const { prompt } = rigidNoiseTarget.renderPrompt(template, FIXTURE);
    expect(prompt).not.toContain('{{AUDIENCE}}');
    expect(prompt).toContain('small farm owners doing their own bookkeeping');
  });

  it('substitutes {{DETAIL}} with the fixture detail', () => {
    const { prompt } = rigidNoiseTarget.renderPrompt(template, FIXTURE);
    expect(prompt).not.toContain('{{DETAIL}}');
    expect(prompt).toContain('Tracks seasonal income and expenses and generates a tax-ready summary at year end.');
  });

  it('leaves no unsubstituted placeholders of any kind', () => {
    const { prompt } = rigidNoiseTarget.renderPrompt(template, FIXTURE);
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  // These two guard the rig itself, not the target's plumbing. The whole v3
  // mechanism is that no template can tell the wantsComma populations apart.
  // The moment the rendered prompt carries that signal, the mutator can write
  // a conditional and win legitimately -- which is exactly how the v2 OVERFIT
  // rig broke (see planning/RIGS_refusal_paths_live.md).
  it('renders a byte-identical prompt for two fixtures differing ONLY in wantsComma', () => {
    const wants = rigidNoiseTarget.renderPrompt(template, { ...FIXTURE, wantsComma: true });
    const doesNot = rigidNoiseTarget.renderPrompt(template, { ...FIXTURE, wantsComma: false });
    expect(wants.prompt).toBe(doesNot.prompt);
  });

  it('never leaks the wantsComma field name or value into the rendered prompt', () => {
    const { prompt } = rigidNoiseTarget.renderPrompt(template, FIXTURE);
    expect(prompt).not.toMatch(/wantsComma/i);
  });
});

describe('rigidNoiseTarget.extractScript - discriminated result (tri-state no-run)', () => {
  it('discriminates an empty response to ok:false reason empty', () => {
    const result = rigidNoiseTarget.extractScript('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty');
  });

  it('discriminates a refusal string to ok:false reason refusal', () => {
    const raw = "I'm sorry, but I can't help with that request.";
    const result = rigidNoiseTarget.extractScript(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('refusal');
  });

  it('discriminates a 2-word output to ok:false reason below-min-words', () => {
    const result = rigidNoiseTarget.extractScript('too short');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('below-min-words');
  });

  it('returns ok:true on a normal blurb', () => {
    const raw = 'Brightleaf Ledger keeps farm books simple with a tax-ready summary every season.';
    const result = rigidNoiseTarget.extractScript(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain('Brightleaf Ledger');
  });
});

describe('rigidNoiseTarget.generate - uses the shared kimi.ts client', () => {
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

  it('sends temperature 1 to kimi-k2.6 and returns the parsed raw/model/tokens with a non-zero cost', async () => {
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
          choices: [{ message: { content: 'Brightleaf Ledger tracks farm income and expenses all season long.' } }],
          usage: { prompt_tokens: 42, completion_tokens: 13 },
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await rigidNoiseTarget.generate('prompt text', { temperature: 1 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.raw).toBe('Brightleaf Ledger tracks farm income and expenses all season long.');
    expect(result.model).toBe('kimi-k2.6');
    expect(result.inputTokens).toBe(42);
    expect(result.outputTokens).toBe(13);
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
      await rigidNoiseTarget.generate('prompt text', { temperature: 1 });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/401/);
    expect(caught!.message).not.toContain('test-key-not-real');
  });
});
