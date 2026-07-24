/**
 * Tests for the commit-msg target (engine Target contract). Provider MOCKED:
 * the live Moonshot API is never called. renderPrompt/extractScript are pure
 * functions exercised directly; generate() is exercised with global.fetch
 * stubbed out so the temperature-honesty behavior (kimi-k2.6 rejects any
 * temperature but 1) can be proven without a network call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commitMsgTarget } from './commit-msg.js';
import type { CommitMsgFixture } from '../rubrics/commit-msg.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

const FIXTURE: CommitMsgFixture = {
  id: 'test-fixture',
  split: 'train',
  files: ['src/example/foo.ts', 'tests/example/foo.test.ts'],
  diffSummary: 'Example diff summary text for testing placeholder substitution.',
  changeType: 'bugfix',
};

describe('commitMsgTarget - id + template', () => {
  it('has id commit-msg', () => {
    expect(commitMsgTarget.id).toBe('commit-msg');
  });

  it('declares evalTemperature: 1 (L2) so the engine never sends this target a temperature it must reject', () => {
    expect(commitMsgTarget.evalTemperature).toBe(1);
  });

  it('declares pricing (L4) instead of relying on a local cost workaround', () => {
    expect(commitMsgTarget.pricing).toEqual({ input: 0.6, output: 2.5 });
  });

  it('the seed template file exists under the project-local templates dir', () => {
    expect(existsSync(resolve(PLUGIN_ROOT, 'templates', 'commit-msg.md'))).toBe(true);
  });

  it('loadTemplate() returns the seed template containing all placeholders', () => {
    const template = commitMsgTarget.loadTemplate();
    expect(typeof template).toBe('string');
    expect(template).toContain('{{DIFF_SUMMARY}}');
    expect(template).toContain('{{FILE_COUNT}}');
  });
});

describe('commitMsgTarget.renderPrompt', () => {
  it('substitutes {{DIFF_SUMMARY}} with the rendered file list and diff summary', () => {
    const template = readFileSync(resolve(PLUGIN_ROOT, 'templates', 'commit-msg.md'), 'utf8');
    const { prompt } = commitMsgTarget.renderPrompt(template, FIXTURE);
    expect(prompt).not.toContain('{{DIFF_SUMMARY}}');
    expect(prompt).toContain('src/example/foo.ts');
    expect(prompt).toContain('Example diff summary text for testing placeholder substitution.');
  });

  it('substitutes {{FILE_COUNT}} with the fixture file count', () => {
    const template = readFileSync(resolve(PLUGIN_ROOT, 'templates', 'commit-msg.md'), 'utf8');
    const { prompt } = commitMsgTarget.renderPrompt(template, FIXTURE);
    expect(prompt).not.toContain('{{FILE_COUNT}}');
    expect(prompt).toContain('2 file(s) changed');
  });

  it('leaves no unsubstituted placeholders of any kind', () => {
    const template = readFileSync(resolve(PLUGIN_ROOT, 'templates', 'commit-msg.md'), 'utf8');
    const { prompt } = commitMsgTarget.renderPrompt(template, FIXTURE);
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});

describe('commitMsgTarget.extractScript - discriminated result (tri-state no-run)', () => {
  it('returns ok:true with the trimmed text on a normal commit message', () => {
    const raw = 'fix(auth): handle undefined session on missing cookie\n\nPreviously only null was checked.';
    const result = commitMsgTarget.extractScript(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain('fix(auth):');
  });

  it('strips markdown code fences before use', () => {
    const raw = '```\nfix(auth): handle undefined session on missing cookie\n```';
    const result = commitMsgTarget.extractScript(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).not.toContain('```');
  });

  it('discriminates an empty response to ok:false reason empty', () => {
    const result = commitMsgTarget.extractScript('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty');
  });

  it('discriminates a refusal string to ok:false reason refusal', () => {
    const raw = "I'm sorry, but I can't help with that request.";
    const result = commitMsgTarget.extractScript(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('refusal');
  });

  it('discriminates content with no word characters to ok:false reason parse-fail', () => {
    const raw = '```\n!!! === ---\n```';
    const result = commitMsgTarget.extractScript(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('parse-fail');
  });

  it('discriminates a too-short message to ok:false reason below-min-words', () => {
    const raw = 'fix bug';
    const result = commitMsgTarget.extractScript(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('below-min-words');
  });
});

describe('commitMsgTarget.generate - always sends temperature 1 (L2: declared via evalTemperature, no local coercion)', () => {
  const originalEnv = process.env.KIMI_API_KEY;

  beforeEach(() => {
    process.env.KIMI_API_KEY = 'test-key-not-real';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalEnv === undefined) delete process.env.KIMI_API_KEY;
    else process.env.KIMI_API_KEY = originalEnv;
  });

  it('sends temperature 1 to kimi-k2.6 regardless of the options.temperature the engine passes', async () => {
    const mockFetch = vi.fn(async (url: unknown, init: any) => {
      expect(url).toBe('https://api.moonshot.ai/v1/chat/completions');
      const body = JSON.parse(init.body);
      expect(body.model).toBe('kimi-k2.6');
      expect(body.temperature).toBe(1); // always 1 -- engine declares evalTemperature: 1 so it never asks for anything else
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'fix(x): ok' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = (await commitMsgTarget.generate('prompt text', { temperature: 1 })) as any;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.raw).toBe('fix(x): ok');
    expect(result.model).toBe('kimi-k2.6');
    expect(result.requestedTemperature).toBeUndefined();
    expect(result.actualTemperature).toBeUndefined();
    expect(result.temperatureCoerced).toBeUndefined();
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

    await expect(commitMsgTarget.generate('prompt text', { temperature: 0 })).rejects.toThrow(/401/);

    let caught: Error | null = null;
    try {
      await commitMsgTarget.generate('prompt text', { temperature: 0 });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).not.toContain('test-key-not-real');
  });
});
