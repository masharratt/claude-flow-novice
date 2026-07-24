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
}

interface Rubric {
  categories: string[];
  describe(): string;            // fed to the mutator — no engine-owned rubric text
  score(text: string, ctx: Fixture): RubricScore;
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
  backups/              source-patcher backups, if a plugin invokes it
  _budget.json          spend ledger, capped by --budget
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
   score the winner ONCE on `split:'holdout'` after convergence. If holdout
   regresses relative to the baseline's holdout score, the run is labeled
   **OVERFIT** and the win is refused — the reported/persisted template
   reverts to the baseline.
2. **Tri-state no-run exclusion** (`eval.ts`, `rubric-core.ts`) — an
   `extractScript` `ok:false` result (parse failure / refusal / empty) is
   excluded from the aggregate and counted separately. The eval aborts if
   fewer than 50% of fixtures produced a scoreable result.
3. **Temperature-0 scoring** (`eval.ts`) — eval always pins `temperature: 0`
   for a stable ranking, regardless of what a plugin's production seam ships.
4. **Reject-and-regenerate** (`eval.ts`) — a rubric hit in a
   `regenerateOn` category triggers exactly ONE regeneration with a
   plugin-supplied corrective nudge appended to the prompt, then scores the
   retry result as-is (never a second retry).
5. **Cost-Pareto tie-break** (`rubric-core.ts`) — `isImprovement` requires no
   per-category regression; on an exact total tie, prefers the candidate
   with fewer prompt tokens. A pure tie with no cost info is not accepted.

## Usage

```bash
./.claude/skills/prompt-optimizer/execute.sh <target-id> [--dry-run] [--budget=N] [--max-iters=N] [--patience=N]
```

Run from inside the consuming project (or `execute.sh` `cd`s there via its
own resolution — see `execute.sh`). Resolves `<project>/.claude/prompt-optimizer/config.json`,
loads the named target's plugin, and runs `engine/optimize.ts` via `npx tsx`.

## Testing

Engine tests live at `engine/*.test.ts`, run with vitest, provider fully
mocked (no live API calls, no `openai` import anywhere in engine code):

```bash
npx vitest run .claude/skills/prompt-optimizer/engine --reporter=verbose
```
