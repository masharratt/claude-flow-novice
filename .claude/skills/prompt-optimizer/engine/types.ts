/**
 * The plugin contract. Every project-local prompt-optimizer plugin
 * (`<project>/.claude/prompt-optimizer/{targets,rubrics,fixtures}/*.ts`)
 * implements Target + Rubric and supplies Fixture data. The engine only
 * knows these shapes; it never imports a provider SDK (BLOCKER-2) — the
 * provider client lives inside a plugin's `Target.generate`.
 */

/** A single scored example. `split` freezes which set a fixture belongs to
 *  so the holdout gate (FIX #1) can never accidentally train on it. */
export interface Fixture {
  id: string;
  split: 'train' | 'holdout';
  [key: string]: unknown;
}

/** One rubric violation (or note) surfaced for a scored example. */
export interface Hit {
  category: string;
  matched: string;
}

/**
 * Result of scoring one generated example against a Rubric.
 * `ran: false` means the example was excluded from aggregation entirely
 * (parse failure, refusal, empty output, below-min-words) — the tri-state
 * no-run exclusion (FIX #2). `categories` holds arbitrary plugin-defined
 * category keys mapped to their violation counts for this example.
 */
export interface RubricScore {
  categories: Record<string, number>;
  total: number;
  hits: Hit[];
  ran: boolean;
  metrics?: Record<string, unknown>;
}

/** Options passed into Target.generate. Eval always pins temperature 0
 *  (FIX #3); a plugin's production seam may ship a different temperature. */
export interface GenerateOptions {
  temperature: number;
}

export interface GenerateResult {
  raw: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

/** Discriminated no-run result. `ok:false` excludes the example from
 *  aggregation and is counted separately (tri-state, FIX #2). */
export type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export interface RenderResult {
  prompt: string;
}

export interface Target {
  id: string;
  /** Load the current (possibly previously-optimized) template body. */
  loadTemplate(): string | Promise<string>;
  /** Fill a template's placeholders with a fixture's data. */
  renderPrompt(template: string, fixture: Fixture): RenderResult;
  /** Call the plugin's own provider client. The ONLY place a provider SDK
   *  may be imported — never inside engine/*. */
  generate(prompt: string, options: GenerateOptions): Promise<GenerateResult>;
  /** Pull the scoreable text out of a raw model response. Must return the
   *  discriminated ExtractResult so no-run cases can be excluded, not
   *  silently scored as empty/garbage text. */
  extractScript(raw: string): ExtractResult;
  /** The lowest temperature this target can actually honor for eval calls.
   *  Optional — engine defaults to 0 (FIX #3) when absent, so every existing
   *  plugin keeps working unchanged. Declare this when a provider rejects
   *  temperature 0 (e.g. a model that only accepts temperature 1): the
   *  engine then uses this value for eval calls instead of hard-pinning 0,
   *  and stamps a NONDETERMINISTIC SCORING warning into the run report and
   *  state record whenever the value is not 0, so a noisy result is never
   *  mistaken for a clean deterministic measurement. */
  evalTemperature?: number;
  /** USD cost per 1M tokens for this target's model, preferred over the
   *  engine's built-in PRICING table (`budget.ts`). Optional — declare this
   *  when your model is not in the engine's table so the shared budget
   *  ledger never throws "No pricing for model" mid-run. Pass this to the
   *  engine's exported `costFor(model, inputTokens, outputTokens, pricing)`
   *  from inside `generate()` instead of hand-rolling a local cost function. */
  pricing?: { input: number; output: number };
}

export interface Rubric {
  /** Arbitrary category keys this rubric scores against. */
  categories: string[];
  /** Human-readable "what is scored" summary fed to the mutator so it can
   *  reason about failures without the engine hard-coding any rubric
   *  specifics (ban lists, gold standards, etc. all live in the plugin). */
  describe(): string;
  score(text: string, ctx: Fixture): RubricScore;
  /** Categories that trigger a bounded (1-retry) reject-and-regenerate
   *  when hit during eval (FIX #4). Omit or empty = never regenerate. */
  regenerateOn?: string[];
}
