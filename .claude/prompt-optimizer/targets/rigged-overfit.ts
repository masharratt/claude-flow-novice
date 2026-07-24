/**
 * rigged-overfit target (v2): implements the engine `Target` contract (see
 * .claude/skills/prompt-optimizer/engine/types.ts) against a LIVE Moonshot
 * (Kimi) API call. This target is a deliberate test rig for the shared
 * prompt-optimizer engine's OVERFIT refusal path (see rubrics/rigged-overfit.ts
 * for the full v2 mechanism -- a train:terse / holdout:formal distribution
 * shift, not v1's forgetting-based ticket rig) -- it is not a production
 * release-note generator.
 *
 * Unlike commit-msg.ts (which predates lib/kimi.ts and inlines its own
 * fetch-based client), this target uses the shared Moonshot client in
 * ../lib/kimi.ts. Do not re-implement a provider client here.
 *
 * Provider facts (see lib/kimi.ts header -- verified live, do not re-probe):
 * - kimi-k2.6 REJECTS any temperature other than 1, so this target declares
 *   `evalTemperature: ONLY_ACCEPTED_TEMPERATURE` (currently 1) instead of
 *   letting the engine default to temperature 0.
 * - Pricing is approximate (see KIMI_PRICING's `cfn:` marker in lib/kimi.ts).
 *
 * The Anthropic API is banned project-wide; this target calls Moonshot only.
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
  kimiComplete,
  extractText,
  fillTemplate,
  ONLY_ACCEPTED_TEMPERATURE,
  KIMI_PRICING,
  PLUGIN_ROOT,
} from '../lib/kimi.js';
import type { ReleaseNoteFixture } from '../rubrics/rigged-overfit.js';

// This file lives at <project>/.claude/prompt-optimizer/targets/rigged-overfit.ts
// -- PLUGIN_ROOT (imported from lib/kimi.ts, resolved there relative to that
// file) points at the shared .claude/prompt-optimizer/ dir where the
// project-local, engine-writable `templates/` dir lives.
const TEMPLATE_PATH = resolve(PLUGIN_ROOT, 'templates', 'rigged-overfit.md');

const SYSTEM_MESSAGE =
  'You write software release notes. Respond with the release note only, no commentary.';

/** Minimum word count for a scoreable release note. Below this, the
 *  generation is treated as a no-run (excluded from the aggregate). Kept low
 *  because a compressed candidate template can legitimately produce a very
 *  short line. */
const MIN_WORDS = 2;

export const riggedOverfitTarget: Target = {
  id: 'rigged-overfit',

  // kimi-k2.6 rejects any temperature but 1 -- declare it so the engine
  // sends this target temperature 1 for eval calls instead of its default 0.
  evalTemperature: ONLY_ACCEPTED_TEMPERATURE,

  // Preferred by the engine's shared costFor over its built-in PRICING table.
  pricing: KIMI_PRICING,

  loadTemplate(): string {
    if (!existsSync(TEMPLATE_PATH)) {
      throw new Error(`rigged-overfit: seed template not found at ${TEMPLATE_PATH}`);
    }
    return readFileSync(TEMPLATE_PATH, 'utf8');
  },

  renderPrompt(template: string, fixture: Fixture): RenderResult {
    const f = fixture as ReleaseNoteFixture;
    // The fixture's `style` is DELIBERATELY not rendered into the prompt.
    // v2 exposed it as {{STYLE}}, and the mutator simply wrote a conditional
    // ("if Style is terse ... if Style is formal ...") that satisfied both
    // populations at once -- a genuine generalizing win, so the OVERFIT gate
    // correctly did not fire. An overfit rig needs the train/holdout
    // distribution shift to be INVISIBLE at generation time: with no style
    // signal in the prompt, a candidate can only pick ONE global length, and
    // the length that wins the all-terse train set must regress the
    // all-formal holdout set.
    const prompt = fillTemplate(template, {
      CHANGE: f.change,
    });
    return { prompt };
  },

  async generate(prompt: string, _options: GenerateOptions): Promise<GenerateResult> {
    // Always calls the shared Moonshot client, which always sends the one
    // temperature kimi-k2.6 accepts -- no local coercion or options
    // inspection needed here (mirrors commit-msg.ts's L2 fix, now shared).
    return kimiComplete(SYSTEM_MESSAGE, prompt);
  },

  extractScript(raw: string): ExtractResult {
    return extractText(raw, MIN_WORDS);
  },
};

export default riggedOverfitTarget;
