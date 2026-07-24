/**
 * commit-msg target: implements the engine `Target` contract (see
 * .claude/skills/prompt-optimizer/engine/types.ts) against a LIVE Moonshot
 * (Kimi) API call. This is the dogfood plugin for the shared prompt-optimizer
 * engine -- it exists to shake out engine bugs against a real provider, not
 * to ship a production commit-message generator.
 *
 * Provider facts (verified live, see task brief -- do not re-probe):
 * - Endpoint: https://api.moonshot.ai/v1/chat/completions (OpenAI-compatible
 *   REST, plain fetch, no SDK). api.moonshot.cn fails auth for this key.
 * - Model: kimi-k2.6.
 * - kimi-k2.6 (and kimi-k2.5) REJECT any temperature other than 1
 *   ("invalid temperature: only 1 is allowed for this model"). The engine
 *   now supports this directly (L2 fix): `Target.evalTemperature` lets a
 *   target declare the lowest temperature it can actually honor for eval
 *   calls, so the engine's eval loop (engine/eval.ts) sends this target
 *   temperature 1 instead of its usual temperature-0 default. This target
 *   declares `evalTemperature: 1` below and always sends that fixed value
 *   to the API -- no local coercion, no requestedTemperature /
 *   actualTemperature / temperatureCoerced bookkeeping needed anymore.
 * - Pricing (L4 fix): `Target.pricing` is preferred by the engine's
 *   `costFor` over its built-in table, so this target declares its own
 *   pricing instead of a local cost workaround.
 *
 * The Moonshot client lives ENTIRELY in this file (plain fetch, no SDK
 * import) -- the shared engine never imports a provider SDK (BLOCKER-2).
 * The Anthropic API is banned project-wide; this target calls Moonshot only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Target,
  Fixture,
  GenerateOptions,
  GenerateResult,
  RenderResult,
  ExtractResult,
} from '../../skills/prompt-optimizer/engine/types.js';
import { costFor } from '../../skills/prompt-optimizer/engine/budget.js';
import type { CommitMsgFixture } from '../rubrics/commit-msg.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// This file lives at <project>/.claude/prompt-optimizer/targets/commit-msg.ts
// -- the plugin root (where the project-local, engine-writable `templates/`
// dir lives, per the paths.ts convention) is one level up.
const PLUGIN_ROOT = resolve(__dirname, '..');
const SEED_TEMPLATE_PATH = resolve(PLUGIN_ROOT, 'templates', 'commit-msg.md');
// PLUGIN_ROOT/../.. == the project root, where .env lives.
const PROJECT_ROOT = resolve(PLUGIN_ROOT, '..', '..');
const ENV_PATH = resolve(PROJECT_ROOT, '.env');

// ---------------------------------------------------------------------------
// Moonshot (Kimi) client -- plain fetch, OpenAI-compatible REST. No SDK.
// ---------------------------------------------------------------------------

const API_URL = 'https://api.moonshot.ai/v1/chat/completions';
const EVAL_MODEL = 'kimi-k2.6';
/** kimi-k2.6 / kimi-k2.5 reject any temperature except 1. */
const ONLY_ACCEPTED_TEMPERATURE = 1;

/**
 * cfn: approximate Moonshot kimi-k2.6 pricing (USD per 1M tokens), not
 * verified against a live Moonshot pricing page at authoring time. Declared
 * as `Target.pricing` (L4 fix) so the engine's shared `costFor` uses it in
 * preference to its own built-in table -- no local cost function needed.
 * Upgrade trigger: confirm against https://platform.moonshot.ai pricing docs
 * and update before these cost figures are trusted for real budget
 * decisions.
 */
const KIMI_PRICING = { input: 0.6, output: 2.5 };

let cachedApiKey: string | null = null;

/** Loads KIMI_API_KEY without ever logging or throwing it into an error
 *  message. Prefers an already-set env var (test/CI convenience), then
 *  dotenv if installed, then a manual .env parse as a last resort. */
async function getApiKey(): Promise<string> {
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
        let value = m[1] ?? '';
        value = value.replace(/^["']|["']$/g, '');
        if (value) {
          cachedApiKey = value;
          return cachedApiKey;
        }
      }
    }
  }

  throw new Error('KIMI_API_KEY not configured (checked env and project .env)');
}

const SYSTEM_MESSAGE =
  'You write git commit messages for a software engineering team. Respond with the commit message only, no commentary.';

function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

function renderDiffSummary(fixture: CommitMsgFixture): string {
  const fileList = fixture.files.map(p => `- ${p}`).join('\n');
  return `Changed files:\n${fileList}\n\nWhat changed:\n${fixture.diffSummary}`;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function stripFences(body: string): string {
  return body.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
}

const REFUSAL_PATTERNS: RegExp[] = [
  /\bi(?:'m| am)\s+(?:sorry|unable)\b/i,
  /\bi\s+can(?:not|'t)\s+(?:help|assist|generate|comply|write)\b/i,
  /\bi\s+won'?t\s+(?:help|assist|generate|comply|write)\b/i,
  /\bas an ai\b/i,
  /\bi don'?t have (?:enough|sufficient) (?:information|context)\b/i,
];

/** Minimum word count for a scoreable commit message. Below this, the
 *  generation is treated as a no-run (excluded from the aggregate). */
const MIN_WORDS = 3;

export const commitMsgTarget: Target = {
  id: 'commit-msg',

  // L2: kimi-k2.6 rejects any temperature but 1 -- declare it so the engine
  // sends this target temperature 1 for eval calls instead of its default 0.
  evalTemperature: ONLY_ACCEPTED_TEMPERATURE,

  // L4: preferred by engine costFor over its built-in PRICING table.
  pricing: KIMI_PRICING,

  loadTemplate(): string {
    if (!existsSync(SEED_TEMPLATE_PATH)) {
      throw new Error(`commit-msg: seed template not found at ${SEED_TEMPLATE_PATH}`);
    }
    return readFileSync(SEED_TEMPLATE_PATH, 'utf8');
  },

  renderPrompt(template: string, fixture: Fixture): RenderResult {
    const f = fixture as CommitMsgFixture;
    const prompt = fillTemplate(template, {
      DIFF_SUMMARY: renderDiffSummary(f),
      FILE_COUNT: String(f.files.length),
    });
    return { prompt };
  },

  async generate(prompt: string, _options: GenerateOptions): Promise<GenerateResult> {
    const apiKey = await getApiKey();

    // L2: always send the one temperature kimi-k2.6 accepts. The engine
    // knows to ask for this via the declared `evalTemperature: 1` above, so
    // no coercion or options.temperature inspection is needed here.
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EVAL_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_MESSAGE },
          { role: 'user', content: prompt },
        ],
        temperature: ONLY_ACCEPTED_TEMPERATURE,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      // Never include the API key in the thrown message -- only status/body.
      throw new Error(`kimi-k2.6 request failed: ${response.status} ${response.statusText} ${errText.slice(0, 300)}`);
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
  },

  extractScript(raw: string): ExtractResult {
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

    if (countWords(cleaned) < MIN_WORDS) {
      return { ok: false, reason: 'below-min-words' };
    }

    return { ok: true, text: cleaned };
  },
};

export default commitMsgTarget;
