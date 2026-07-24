/**
 * rigged-noise target: implements the engine `Target` contract (see
 * .claude/skills/prompt-optimizer/engine/types.ts). This is a RIGGED test rig,
 * not a production feature -- its entire purpose is to make the shared
 * engine's INCONCLUSIVE (mixed-repeats) refusal path fire against a live
 * model, by pairing an unlearnable rubric (rubrics/rigged-noise.ts v3) with a
 * model that cannot be pinned to temperature 0.
 *
 * Provider facts (see lib/kimi.ts header -- do not re-probe):
 * - kimi-k2.6 REJECTS any temperature but 1, so `evalTemperature:
 *   ONLY_ACCEPTED_TEMPERATURE` is declared below. The engine re-scores the
 *   holdout set `--holdout-repeats` times whenever evalTemperature is
 *   non-zero, and refuses a candidate as INCONCLUSIVE unless it beats the
 *   baseline on every single repeat.
 *
 * The v3 rubric makes the optimum FLAT: half the fixtures want a comma and
 * half want none, so any comma instruction leaves exactly half violating, the
 * same as the seed (full derivation in the rubric header). A candidate's
 * holdout total therefore lands statistically indistinguishable from the
 * baseline's, and which side of that near-tie wins on any given repeat is
 * temperature-1 noise. That disagreement across repeats is the mechanism this
 * plugin exists to exercise, not a bug to fix.
 *
 * renderPrompt below passes ONLY product/audience/detail. It must never pass
 * `wantsComma`: a template able to read which population a fixture belongs to
 * could satisfy both at once and win legitimately, which is exactly how the
 * v2 OVERFIT rig broke (see planning/RIGS_refusal_paths_live.md). Guarded by
 * a test in targets/rigged-noise.test.ts.
 *
 * Uses the shared Moonshot client in lib/kimi.ts -- no provider client is
 * re-implemented here (BLOCKER-2: the shared engine never imports a provider
 * SDK; the plugin's own generate() is the only place that may).
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
import type { BlurbFixture } from '../rubrics/rigged-noise.js';

const TEMPLATE_PATH = resolve(PLUGIN_ROOT, 'templates', 'rigged-noise.md');

const SYSTEM_MESSAGE =
  'You write short marketing blurbs. Respond with the blurb only, no commentary.';

/** Minimum word count for a scoreable blurb. Below this, the generation is
 *  treated as a no-run (excluded from the aggregate) rather than scored. */
const MIN_WORDS = 3;

export const rigidNoiseTarget: Target = {
  id: 'rigged-noise',

  // kimi-k2.6 rejects any temperature but 1 -- declare it so the engine
  // sends this target temperature 1 for eval calls and stamps its
  // NONDETERMINISTIC SCORING warning instead of assuming a clean measurement.
  evalTemperature: ONLY_ACCEPTED_TEMPERATURE,

  // Preferred by the engine's shared costFor over its built-in PRICING table.
  pricing: KIMI_PRICING,

  loadTemplate(): string {
    if (!existsSync(TEMPLATE_PATH)) {
      throw new Error(`rigged-noise: seed template not found at ${TEMPLATE_PATH}`);
    }
    return readFileSync(TEMPLATE_PATH, 'utf8');
  },

  renderPrompt(template: string, fixture: Fixture): RenderResult {
    const f = fixture as BlurbFixture;
    const prompt = fillTemplate(template, {
      PRODUCT: f.product,
      AUDIENCE: f.audience,
      DETAIL: f.detail,
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

export default rigidNoiseTarget;
