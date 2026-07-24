# prompt-optimizer

Shared prompt-optimization engine. Hill-climbs a prompt template against a
project-supplied rubric: mutate → score on held-out-safe fixtures → accept
improvements → validate the winner never saw during training. Generic across
projects; each project supplies its own **plugin** (target + rubric +
fixtures). This skill dir (`engine/`) is symlinked into every project via
`~/.claude/skills` — it is READ-ONLY code. Nothing it runs ever writes here.

## Why a shared engine

Multiple projects independently forked a one-off optimizer and hand-rolled
the same fixes (held-out validation, tri-state no-run handling, deterministic
scoring, reject-and-regenerate, cost-aware tie-breaks). This skill is the
one place those fixes live, so every consumer inherits them for free instead
of re-solving the same bugs per project.

## Architecture

```
engine/
  types.ts          the plugin contract (Target, Rubric, Fixture, RubricScore, Hit)
  paths.ts           project-local path resolver (BLOCKER-1 — see below)
  rubric-core.ts     generic aggregate + isImprovement + cost-Pareto tie-break
  budget.ts          BudgetTracker + per-model pricing table
  source-patcher.ts  sentinel-delimited source patcher (optional, plugin-invoked)
  eval.ts            eval loop: tri-state exclusion, temp-0 scoring, reject-and-regenerate
  mutator.ts         rubric-agnostic strategy-rotation mutator
  optimize.ts        orchestrator: baseline -> mutate/accept on train -> holdout gate -> report
execute.sh           entry point: resolves the project-local plugin, runs optimize.ts
```

## The plugin contract

A project supplies a **plugin**: real TS/JS modules (not declarative config),
because a real rubric needs logic (e.g. computed-age/scene scoring can't be
expressed as JSON).

```ts
interface Target {
  id: string;
  loadTemplate(): string | Promise<string>;
  renderPrompt(template: string, fixture: Fixture): { prompt: string };
  // The ONLY place a provider SDK may be imported — never inside engine/*.
  generate(prompt: string, options: { temperature: number }): Promise<GenerateResult>;
  extractScript(raw: string): { ok: true; text: string } | { ok: false; reason: string };
  // Optional — declare only if the target needs it. Both default to
  // engine behavior when absent, so every existing plugin keeps working.
  evalTemperature?: number;      // lowest temp this target can honor (default: 0)
  nondeterministic?: boolean;    // provider ignores temperature 0 (default: false)
  pricing?: { input: number; output: number }; // USD/1M tokens (default: engine's built-in table)
  // Optional, all three together: opts into `--apply` source patching (see
  // "Source-patch auto-apply" below). Omit all three (default) and this
  // target keeps writing only to templates/<id>.md, unchanged.
  sourceFile?: string;           // path to the prompt's source, relative to the CONSUMING project's cwd
  varMap?: Record<string, string>; // {{PLACEHOLDER}} -> local expression string, e.g. { NAME: 'input.name' }
  assignmentVar?: string;        // local var name for the emitted `const <assignmentVar> = \`...\`;`
}

interface Rubric {
  categories: string[];
  describe(): string;            // fed to the mutator — no engine-owned rubric text
  // E1: may return RubricScore directly OR Promise<RubricScore>. The engine
  // always awaits it, so an async rubric (LLM-as-judge, network lookup)
  // works unchanged next to every existing synchronous rubric. Known limit:
  // an async rubric adds one call per scored example and its own cost.
  // budget.ts only tracks Target.generate costs, never a rubric's own spend.
  score(text: string, ctx: Fixture): RubricScore | Promise<RubricScore>;
  regenerateOn?: string[];       // categories that trigger a bounded 1-retry regen
}

interface Fixture {
  id: string;
  split: 'train' | 'holdout';    // frozen — the holdout gate can never train on these
  [key: string]: unknown;        // whatever data your renderPrompt/score need
}
```

Notice `mutateTemplate` calls the LLM only through `target.generate` — the
engine reuses the plugin's own provider client for the meta-prompt that asks
the model to rewrite the template. The engine itself never imports a
provider SDK (BLOCKER-2): `grep -rn "from 'openai'" engine/` must return zero,
and it does.

## Project-local plugin convention

```
<project>/.claude/prompt-optimizer/
  config.json          { "<target-id>": { "target": "./targets/x.ts",
                                            "rubric": "./rubrics/x.ts",
                                            "fixtures": "./fixtures/x.json" } }
  targets/<id>.ts       implements Target
  rubrics/<id>.ts       implements Rubric
  fixtures/<id>.json    Fixture[] with frozen split tags
  # all writable below here, created on demand — never under the engine's own dir
  state/<id>.json       per-iteration log
  runs/<id>-<ts>.md     human-readable run report
  templates/<id>.md     the current winning template
  backups/<id>-<ts>.md  seed backed up here before EVERY overwrite of templates/<id>.md
                        (never lost — see fix #1 below), plus source-patcher
                        backups if a plugin invokes it
  _budget.json          spend ledger. Per-project, SHARED across every
                        target, and persists across every run forever.
                        --budget caps only the current run's fresh spend;
                        --lifetime-budget (optional) caps this ledger's
                        cumulative total across all runs.
```

Dynamic-imports the `.ts`/`.js` modules from the project's own cwd via
`import()` (works with plain JS or, if run through `npx tsx`, `.ts` directly).

**Absent `config.json`** → the engine prints `no plugin configured` and
exits 0. Inheriting this shared skill never breaks a project that hasn't
opted in.

## BLOCKER-1 — state isolation

Every writable path resolves under `<cwd>/.claude/prompt-optimizer/`
(`engine/paths.ts`), never under the engine's own `SKILL_DIR`. Two projects
running this same symlinked engine write to two disjoint directories —
concurrency-safe by construction, no shared budget ledger, no cross-project
fixture leakage.

## BLOCKER-2 — provider-agnostic engine

`engine/*` imports only `p-limit` and node builtins. A provider client
(OpenAI SDK, xAI, Gemini, whatever) lives ENTIRELY inside a plugin's
`Target.generate`. Peer dependencies each consumer project needs:

- `tsx` — to run `.ts` plugin modules directly (or ship plugins as plain `.js`)
- its own provider SDK (`openai`, `@google/genai`, etc.) — inside the plugin only
- `p-limit` — eval concurrency (already a dependency here)
- `vitest` — to run the engine's own test suite in that project, if desired

## Engine fixes baked in

1. **Held-out split** (`optimize.ts`) — mutate/accept only on `split:'train'`;
   score the winner ONCE (or, for a nondeterministic target, `--holdout-repeats`
   times — see fix #3 below) on `split:'holdout'` after convergence. If
   holdout regresses relative to the baseline's holdout score, the run is
   labeled **OVERFIT** and the win is refused — the reported/persisted
   template reverts to the baseline. Before ANY overwrite of
   `templates/<id>.md`, the prior template is backed up to
   `backups/<id>-<ISO-timestamp>.md` and a unified diff (seed vs. final) is
   appended to the run report — the human-authored seed is never destroyed.
2. **Tri-state no-run exclusion** (`eval.ts`, `rubric-core.ts`) — an
   `extractScript` `ok:false` result (parse failure / refusal / empty) is
   excluded from the aggregate and counted separately. The eval aborts if
   fewer than 50% of fixtures produced a scoreable result.
3. **Temperature-0 scoring, with an opt-out** (`eval.ts`) — eval pins
   `temperature: 0` for a stable ranking by default. A target that cannot
   honor temperature 0 (e.g. a provider that rejects any temperature but 1)
   declares `Target.evalTemperature` to override this; the engine then
   stamps a **NONDETERMINISTIC SCORING** warning into the run report and
   per-iteration state, since every total in that run is noisy rather than a
   clean deterministic measurement.

   **A provider may accept temperature 0 and ignore it.** Measured true for
   xAI Grok: two runs of one byte-identical prompt set gave train baselines of
   3, 8 and 5, and a direct two-call probe returned 175 vs 201 words diverging
   at word 5. Nondeterminism is a property of the provider, not of the number
   we send it, so such a target declares `nondeterministic: true` and gets the
   same warning and repeat sampling. Without it the riskiest case had the
   LEAST protection, silently reporting noise as an exact measurement.
   Declaring `nondeterministic: false` cannot suppress a non-zero
   `evalTemperature` — a target may not opt out of noise it demonstrably
   generates.

   Repeat sampling covers the HOLDOUT gate only. Train comparisons stay
   single-sample, so on a nondeterministic target an accepted train win reads
   honestly as "did not regress", not "improved".

   For a nondeterministic target, the
   holdout gate (fix #1) re-scores baseline AND final `--holdout-repeats`
   times (default 2) and requires the final to beat the baseline on EVERY
   repeat; mixed results (wins some, loses others) are labeled
   **INCONCLUSIVE** and the win is refused, same as OVERFIT — a noise floor
   that catches the case where a single lucky/unlucky sample would otherwise
   accept or reject a win on chance alone. Deterministic targets keep the
   original single-sample holdout check, no extra cost.
4. **Reject-and-regenerate** (`eval.ts`) — a rubric hit in a
   `regenerateOn` category triggers exactly ONE regeneration with a
   plugin-supplied corrective nudge appended to the prompt, then scores the
   retry result as-is (never a second retry).
5. **Cost-Pareto tie-break + sample-count integrity** (`rubric-core.ts`) —
   `isImprovement` requires no per-category regression; on an exact tie,
   prefers the candidate with fewer prompt tokens. A pure tie with no cost
   info is not accepted.

   Every comparison is a **per-example rate** (`total / ranCount`), never a
   raw sum, and a candidate that ran on FEWER examples than the incumbent is
   refused outright. An excluded example contributes 0 to the sum, so
   comparing raw sums let a template win by breaking its own output. Found
   live (L9): a candidate scoring `total=2 ran=11 excluded=4` was accepted
   over a `total=3 ran=15 excluded=0` baseline, having improved nothing except
   how many generations failed extraction. Rate normalisation alone does not
   close this — 2/11 beats 3/15 — because the examples an exclusion removes
   are the hard ones. The ran-count floor is the load-bearing guard.

   The floor is deliberately strict: a real win that incidentally loses one
   example is refused too. Nothing distinguishes "dropped a hard example" from
   "dropped one at random", and refusing a real win costs one iteration while
   accepting a fake one corrupts the template that ships.
6. **Non-throwing, overridable pricing** (`budget.ts`) — `costFor` never
   throws on an unknown model: a `Target.pricing` override (USD per 1M
   tokens) is preferred when supplied, else the engine's built-in table;
   an unknown model with neither warns loudly and records cost as `$0`
   rather than crashing the shared budget ledger or silently misreporting
   spend.
7. **Rubric saturation note** (`optimize.ts`) — when the accepted/final
   train total hits exactly `0`, the report notes **RUBRIC SATURATED
   (total=0, no remaining signal)** — distinct from normal convergence,
   since a zero total means the rubric has no more violations left to find.
8. **Per-run budget, with an optional lifetime cap** (`budget.ts`,
   `optimize.ts`): `_budget.json` persists `spentUsd` FOREVER, shared across
   every target in the project. `--budget=N` caps only THIS run
   (`BudgetTracker.runSpent`, which always starts at `0`); it is never
   compared against the ledger's cumulative lifetime total. An OPTIONAL
   `--lifetime-budget=N` sets an absolute ceiling across every run that ever
   wrote to the ledger. `BudgetTracker.exhausted()` trips on either cap;
   `trippedCap()` reports which one (`'run' | 'lifetime' | null`) so every
   print/abort message states which cap tripped and shows both numbers, e.g.
   `[abort] run budget exhausted ($0.4501 of $0.45 this run; $1.0528
   lifetime)`. The run report and per-iteration state record carry both
   `runSpendUsd` and the lifetime `spendUsd`, never only the lifetime figure.
9. **Async rubric scoring** (`types.ts`, `eval.ts`): `Rubric.score` may
   return `RubricScore` or `Promise<RubricScore>`; the engine always
   `await`s it, so an LLM-as-judge or network-backed rubric works unchanged
   next to every existing synchronous rubric. Known limit: an async rubric's
   own call cost is NOT tracked by the budget ledger (only `Target.generate`
   costs are recorded there).
10. **Source-patch auto-apply, opt-in via `--apply`** (`optimize.ts`,
    `source-patcher.ts`, `types.ts`): DEFAULT OFF. A target that declares
    `sourceFile` + `varMap` + `assignmentVar` together (see the plugin
    contract above) can be patched directly: the engine replaces the region
    between `// PROMPT-OPTIMIZER:START id=<target-id>` and
    `// PROMPT-OPTIMIZER:END` in that file with the winning template. The
    patch is attempted ONLY when ALL of these hold, so a refused or
    unchanged result can never reach a real source file:
    - `--apply` was passed, AND
    - the target declares `sourceFile` (with `varMap`/`assignmentVar`), AND
    - the run was NOT `--dry-run`, AND
    - the holdout gate produced a REAL win: not OVERFIT, not
      HOLDOUT INCONCLUSIVE, and the final template actually differs from
      the baseline template.
    Before writing, the replaced region is backed up to
    `backups/<id>-<ISO-timestamp>.txt` (a distinct filename/extension from
    the `.md` template backups already written there). The apply step never
    throws: a missing file, a missing or malformed sentinel pair, or any
    other patcher error is caught, reported as a warning line, and recorded
    on the run's `applyResult` field and in the run report, without failing
    the run or losing the report. Every existing plugin (no `sourceFile`
    declared, or `--apply` never passed) is completely unaffected.

## Usage

```bash
./.claude/skills/prompt-optimizer/execute.sh <target-id> \
  [--dry-run] [--apply] [--budget=N] [--lifetime-budget=N] [--max-iters=N] [--patience=N] [--holdout-repeats=N]
```

Run from inside the consuming project (or `execute.sh` `cd`s there via its
own resolution — see `execute.sh`). Resolves `<project>/.claude/prompt-optimizer/config.json`,
loads the named target's plugin, and runs `engine/optimize.ts` via `npx tsx`.

`--budget=N` (default 5.0) caps THIS run only. `_budget.json` is a single
ledger, per-project, SHARED across every target in that project, and its
`spentUsd` persists across every run forever. `--budget` is compared only
against this run's own fresh spend, never against that cumulative total.

`--lifetime-budget=N` (default: unset, no lifetime ceiling) is an OPTIONAL
absolute cap across every run that ever wrote to the ledger. Use this when
you want a hard stop on total project spend in addition to the per-run cap.

`--holdout-repeats=N` (default 2) — only takes effect for a target the engine
considers nondeterministic: `evalTemperature` is not 0, OR the target declares
`nondeterministic: true` (see fix #3 and L10). Ignored (no extra API calls)
for deterministic targets.

`--apply` (default OFF): see fix #10 above. Only patches a target's
declared `sourceFile` when the run produced a real, non-refused win and the
run was not `--dry-run`. Every target without a declared `sourceFile` is
unaffected regardless of this flag.

## Testing

Engine tests live at `engine/*.test.ts`, run with vitest, provider fully
mocked (no live API calls, no `openai` import anywhere in engine code):

```bash
npx vitest run .claude/skills/prompt-optimizer/engine --reporter=verbose
```
