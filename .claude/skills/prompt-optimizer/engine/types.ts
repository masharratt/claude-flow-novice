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
  /** OPTIONAL: declare that this target's provider does NOT answer
   *  deterministically even when sent temperature 0. Set it when a provider
   *  accepts temperature 0 but ignores it — measured true for xAI Grok (L10):
   *  two runs of one byte-identical prompt set produced train baselines of 3
   *  and 8, and a direct two-call probe diverged at word 5.
   *
   *  Nondeterminism is a property of the provider, not of the number we send
   *  it. Without this flag such a target would get NO warning, NO holdout
   *  repeats, and no access to the INCONCLUSIVE mixed-repeats refusal — the
   *  riskiest case with the least protection. Setting it turns all three on,
   *  exactly as a non-zero `evalTemperature` does.
   *
   *  Setting it to `false` does not suppress anything: a non-zero
   *  `evalTemperature` still forces nondeterministic mode, because a target
   *  cannot opt out of noise it is demonstrably generating. */
  nondeterministic?: boolean;
  /** USD cost per 1M tokens for this target's model, preferred over the
   *  engine's built-in PRICING table (`budget.ts`). Optional — declare this
   *  when your model is not in the engine's table so the shared budget
   *  ledger never throws "No pricing for model" mid-run. Pass this to the
   *  engine's exported `costFor(model, inputTokens, outputTokens, pricing)`
   *  from inside `generate()` instead of hand-rolling a local cost function. */
  pricing?: { input: number; output: number };
  /** OPTIONAL: opts this target into `--apply` source patching
   *  (`engine/source-patcher.ts`, wired from `optimize.ts`). A path to this
   *  target's prompt, resolved relative to the CONSUMING project's own cwd,
   *  never relative to the engine's own location (BLOCKER-1). When declared
   *  TOGETHER with `varMap` and `assignmentVar` below, AND the CLI is
   *  invoked with `--apply`, AND the run produced a real (non-refused,
   *  non-dry-run) win, the engine replaces the region between
   *    // PROMPT-OPTIMIZER:START id=<target.id>
   *    // PROMPT-OPTIMIZER:END
   *  in this file with the winning template. Omit all three (the default)
   *  and this target keeps writing only to `templates/<id>.md`, unchanged.
   *  Every existing plugin keeps working untouched. */
  sourceFile?: string;
  /** OPTIONAL, required alongside `sourceFile` to actually patch source: maps
   *  each `{{PLACEHOLDER}}` token used in the template to a local expression
   *  string (e.g. `{ TITLE: 'input.title' }`) that `source-patcher.ts`
   *  substitutes as `${input.title}` in the emitted TS template literal.
   *  `sourceFile` declared without this (or without `assignmentVar`) skips
   *  the patch rather than throwing. */
  varMap?: Record<string, string>;
  /** OPTIONAL, required alongside `sourceFile`: the local variable name the
   *  emitted `const <assignmentVar> = \`...\`;` assignment uses inside the
   *  sentinel region. */
  assignmentVar?: string;
}

export interface Rubric {
  /** Arbitrary category keys this rubric scores against. */
  categories: string[];
  /** Human-readable "what is scored" summary fed to the mutator so it can
   *  reason about failures without the engine hard-coding any rubric
   *  specifics (ban lists, gold standards, etc. all live in the plugin). */
  describe(): string;
  /** Score one generated example. May return a `RubricScore` directly OR a
   *  `Promise<RubricScore>` (E1). The engine always `await`s the result, so
   *  an async rubric (LLM-as-judge, network lookup) works unchanged next to
   *  every existing synchronous rubric. Known limit: an async rubric adds
   *  one call per scored example and its own cost. The engine's budget
   *  ledger (`budget.ts`) does NOT track that cost, only `Target.generate`
   *  costs are recorded there, so an LLM-judge rubric's spend is invisible
   *  to `--budget`/`--lifetime-budget` unless the plugin records it itself. */
  score(text: string, ctx: Fixture): RubricScore | Promise<RubricScore>;
  /** Categories that trigger a bounded (1-retry) reject-and-regenerate
   *  when hit during eval (FIX #4). Omit or empty = never regenerate. */
  regenerateOn?: string[];
}
