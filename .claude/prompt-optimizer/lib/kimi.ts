/**
 * Shared Moonshot (Kimi) client for this project's prompt-optimizer plugin
 * targets. Extracted when the second target needed it (DRY rule: extract on
 * the second occurrence, not the third).
 *
 * Provider facts (verified live -- do not re-probe):
 * - Endpoint: https://api.moonshot.ai/v1/chat/completions (OpenAI-compatible
 *   REST, plain fetch, no SDK). api.moonshot.cn fails auth for this key.
 * - Model: kimi-k2.6.
 * - kimi-k2.6 (and kimi-k2.5) REJECT any temperature other than 1
 *   ("invalid temperature: only 1 is allowed for this model"). Targets using
 *   this client MUST declare `evalTemperature: ONLY_ACCEPTED_TEMPERATURE` so
 *   the engine stamps its NONDETERMINISTIC SCORING warning instead of
 *   assuming a clean temperature-0 measurement.
 *
 * The provider client lives ENTIRELY in the plugin (BLOCKER-2): the shared
 * engine under .claude/skills/prompt-optimizer/engine/ never imports a
 * provider SDK, and this file uses plain fetch rather than one anyway.
 * The Anthropic API is banned project-wide; this client calls Moonshot only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GenerateResult } from '../../skills/prompt-optimizer/engine/types.js';
import { costFor } from '../../skills/prompt-optimizer/engine/budget.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** This file lives at <project>/.claude/prompt-optimizer/lib/kimi.ts. */
export const PLUGIN_ROOT = resolve(__dirname, '..');
/** PLUGIN_ROOT/../.. == the project root, where .env lives. */
const PROJECT_ROOT = resolve(PLUGIN_ROOT, '..', '..');
const ENV_PATH = resolve(PROJECT_ROOT, '.env');

export const API_URL = 'https://api.moonshot.ai/v1/chat/completions';
export const EVAL_MODEL = 'kimi-k2.6';

/** kimi-k2.6 / kimi-k2.5 reject any temperature except 1. */
export const ONLY_ACCEPTED_TEMPERATURE = 1;

/**
 * cfn: approximate Moonshot kimi-k2.6 pricing (USD per 1M tokens), not
 * verified against a live Moonshot pricing page. Declared by each target as
 * `Target.pricing` so the engine's shared `costFor` prefers it over its own
 * built-in table. Upgrade trigger: confirm against
 * https://platform.moonshot.ai pricing docs before these cost figures are
 * trusted for real budget decisions.
 */
export const KIMI_PRICING = { input: 0.6, output: 2.5 };

let cachedApiKey: string | null = null;

/** Loads KIMI_API_KEY without ever logging or throwing it into an error
 *  message. Prefers an already-set env var (test/CI convenience), then
 *  dotenv if installed, then a manual .env parse as a last resort. */
export async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  if (process.env.KIMI_API_KEY) {
    cachedApiKey = process.env.KIMI_API_KEY;
    return cachedApiKey;
  }

  try {
    const dotenv: any = await import('dotenv');
    dotenv.config?.({ path: ENV_PATH });
  } catch {
    // dotenv not installed -- fall through to the manual parse below.
  }

  if (process.env.KIMI_API_KEY) {
    cachedApiKey = process.env.KIMI_API_KEY;
    return cachedApiKey;
  }

  if (existsSync(ENV_PATH)) {
    const raw = readFileSync(ENV_PATH, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*KIMI_API_KEY\s*=\s*(.*)\s*$/);
      if (m) {
        const value = (m[1] ?? '').replace(/^["']|["']$/g, '');
        if (value) {
          cachedApiKey = value;
          return cachedApiKey;
        }
      }
    }
  }

  throw new Error('KIMI_API_KEY not configured (checked env and project .env)');
}

/** Test seam: reset the memoized key so a test can swap env vars. */
export function __resetApiKeyCache(): void {
  cachedApiKey = null;
}

/**
 * One chat completion against kimi-k2.6. Always sends the single temperature
 * the model accepts; the engine learns about that via each target's declared
 * `evalTemperature`, so there is no coercion bookkeeping here.
 */
export async function kimiComplete(
  systemMessage: string,
  prompt: string,
): Promise<GenerateResult> {
  const apiKey = await getApiKey();

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EVAL_MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
      temperature: ONLY_ACCEPTED_TEMPERATURE,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    // Never include the API key in the thrown message -- only status/body.
    throw new Error(
      `${EVAL_MODEL} request failed: ${response.status} ${response.statusText} ${errText.slice(0, 300)}`,
    );
  }

  const data: any = await response.json();
  const raw = data?.choices?.[0]?.message?.content ?? '';
  const inputTokens = data?.usage?.prompt_tokens ?? 0;
  const outputTokens = data?.usage?.completion_tokens ?? 0;

  return {
    raw,
    model: EVAL_MODEL,
    inputTokens,
    outputTokens,
    cost: costFor(EVAL_MODEL, inputTokens, outputTokens, KIMI_PRICING),
  };
}

// ---------------------------------------------------------------------------
// Shared extract helpers (every Kimi target needs the same no-run tri-state
// handling: empty / refusal / parse-fail / below-min-words).
// ---------------------------------------------------------------------------

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function stripFences(body: string): string {
  return body.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
}

export const REFUSAL_PATTERNS: RegExp[] = [
  /\bi(?:'m| am)\s+(?:sorry|unable)\b/i,
  /\bi\s+can(?:not|'t)\s+(?:help|assist|generate|comply|write)\b/i,
  /\bi\s+won'?t\s+(?:help|assist|generate|comply|write)\b/i,
  /\bas an ai\b/i,
  /\bi don'?t have (?:enough|sufficient) (?:information|context)\b/i,
];

/**
 * Shared tri-state extraction (FIX #2). Returns the discriminated
 * ExtractResult the engine needs so unusable generations are EXCLUDED from
 * the aggregate rather than scored as a suspiciously clean zero.
 */
export function extractText(
  raw: string,
  minWords: number,
): { ok: true; text: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  if (REFUSAL_PATTERNS.some(p => p.test(trimmed))) {
    return { ok: false, reason: 'refusal' };
  }

  const cleaned = stripFences(trimmed);
  if (!cleaned) return { ok: false, reason: 'empty' };

  if (!/[a-zA-Z0-9]/.test(cleaned)) {
    return { ok: false, reason: 'parse-fail' };
  }

  if (countWords(cleaned) < minWords) {
    return { ok: false, reason: 'below-min-words' };
  }

  return { ok: true, text: cleaned };
}

/** Substitutes {{PLACEHOLDER}} tokens in a template. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}
