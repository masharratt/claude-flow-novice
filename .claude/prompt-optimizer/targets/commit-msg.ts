/**
 * commit-msg target: implements the engine `Target` contract (see
 * .claude/skills/prompt-optimizer/engine/types.ts) against a LIVE Moonshot
 * (Kimi) API call. This is the dogfood plugin for the shared prompt-optimizer
 * engine -- it exists to shake out engine bugs against a real provider, not
 * to ship a production commit-message generator.
 *
 * The Moonshot client, the tri-state extract helper, and the placeholder
 * filler all live in ../lib/kimi.ts, shared with the rigged-* refusal-path
 * rig targets. That file also documents the provider facts (endpoint, model,
 * the temperature-1-only constraint, and the approximate pricing).
 *
 * The provider client lives ENTIRELY in the plugin (BLOCKER-2): the shared
 * engine never imports a provider SDK. The Anthropic API is banned
 * project-wide; this target calls Moonshot only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  Target,
  Fixture,
  GenerateOptions,
  GenerateResult,
  RenderResult,
  ExtractResult,
} from '../../skills/prompt-optimizer/engine/types.js';
import {
  PLUGIN_ROOT,
  ONLY_ACCEPTED_TEMPERATURE,
  KIMI_PRICING,
  kimiComplete,
  extractText,
  fillTemplate,
} from '../lib/kimi.js';
import type { CommitMsgFixture } from '../rubrics/commit-msg.js';

const SEED_TEMPLATE_PATH = resolve(PLUGIN_ROOT, 'templates', 'commit-msg.md');

const SYSTEM_MESSAGE =
  'You write git commit messages for a software engineering team. Respond with the commit message only, no commentary.';

/** Minimum word count for a scoreable commit message. Below this, the
 *  generation is treated as a no-run (excluded from the aggregate). */
const MIN_WORDS = 3;

function renderDiffSummary(fixture: CommitMsgFixture): string {
  const fileList = fixture.files.map(p => `- ${p}`).join('\n');
  return `Changed files:\n${fileList}\n\nWhat changed:\n${fixture.diffSummary}`;
}

export const commitMsgTarget: Target = {
  id: 'commit-msg',

  // L2: kimi-k2.6 rejects any temperature but 1 -- declare it so the engine
  // sends this target temperature 1 for eval calls instead of its default 0,
  // and stamps its NONDETERMINISTIC SCORING warning on the run.
  evalTemperature: ONLY_ACCEPTED_TEMPERATURE,

  // L4: preferred by the engine's costFor over its built-in PRICING table.
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
    return kimiComplete(SYSTEM_MESSAGE, prompt);
  },

  extractScript(raw: string): ExtractResult {
    return extractText(raw, MIN_WORDS);
  },
};

export default commitMsgTarget;
