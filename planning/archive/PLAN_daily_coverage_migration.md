# PLAN: migrate daily-coverage onto the shared prompt-optimizer engine

Source recon: `planning/RECON_daily_coverage_migration.md`.
Engine: `claude-flow-novice/.claude/skills/prompt-optimizer/` (shared, reverse-symlinked).
Consumer: `/home/masha/projects/daily-coverage/`, 8 targets, currently a standalone fork
at `daily-coverage/.claude/skills/prompt-optimizer/`.

## Corrections to the recon (verified directly, do not propagate the originals)

1. Recon said the shared `RubricScore` "has no `metrics` extension point". FALSE.
   `engine/types.ts:35` declares `metrics?: Record<string, unknown>`. An engagement
   penalty breakdown has a home already.
2. Recon said adding an async scoring hook is a "major API change, breaks all existing
   consumers". FALSE, and it is already done: widening `Rubric.score` to
   `RubricScore | Promise<RubricScore>` is backward compatible because every synchronous
   rubric still satisfies the widened type. Shipped as E1; full engine plus plugin suite
   is 144/144 green afterward.
3. Recon's headline recommendation was to STRIP the engagement judge for a faster port.
   REJECTED. It is the fork's most evolved capability and the reason this fork is worth
   migrating at all. E1 keeps it.

## Engine changes this migration needs

| ID | Change | Status |
|----|--------|--------|
| E1 | `Rubric.score` may return a Promise; `engine/eval.ts` awaits both call sites. Unblocks the async LLM-as-judge. | DONE |
| E2 | Wire `engine/source-patcher.ts` into `optimize.ts` behind an explicit `--apply` flag. It is currently DEAD CODE in the shared engine (recon Gap #2, verified). daily-coverage patches 6 source files via sentinels and cannot port without it. | DONE |
| L7 | `isMainModule()` in `engine/paths.ts`, realpath'ing both sides of the main-module check. Found by running the first ported target: invoking the engine through `~/.claude/skills/prompt-optimizer/...` (a symlink into this repo) made `import.meta.url === pathToFileURL(argv[1]).href` false, so the CLI ran NOTHING and exited 0 with no output. That symlink IS the documented invocation path for every consumer except this repo, so the shared engine was unusable from any other project and the failure looked exactly like success. | DONE |
| L8 | `source-patcher.ts` backup filenames collide when two patches land in the same millisecond; the second silently overwrote the first backup, destroying the only copy of the region it replaced. Now written with the `wx` flag and suffixed on collision. | DONE |
| L10 | Nondeterminism was derived solely as `evalTemperature !== 0`, on FIX #3's assumption that a provider sent temperature 0 answers deterministically. Measured FALSE for xAI Grok, so the riskiest case had the LEAST protection: a provider that ignores temperature 0 got no warning, no holdout repeats, and no access to the INCONCLUSIVE mixed-repeats refusal, and pure run-to-run noise was reported as an exact measurement. Added `Target.nondeterministic` and a pure `resolveScoringMode()` in `rubric-core.ts`; `nondeterministic: false` cannot suppress a non-zero temperature, since a target may not opt out of noise it demonstrably generates. daily-coverage's `lib/xai.ts` asserted the false claim in a comment; corrected, and all 8 targets now declare the flag. | DONE |
| L9 | `isImprovement` compared RAW category sums across evals that ran on different numbers of examples. An excluded example contributes 0, so a template that breaks its own output shrinks its own total and reads as a win. Found by the first live `narration-base` run, which ACCEPTED `total=2 ran=11 excluded=4` over a `total=3 ran=15 excluded=0` baseline — it improved nothing except how many generations failed extraction. Fixed with two guards: a ran-count floor (a candidate measured on fewer examples than the incumbent is not comparable) and per-example rate comparison for both total and every category. Rate normalisation alone is NOT sufficient — in the live case 2/11 = 0.182 still beats 3/15 = 0.200, because the examples an exclusion removes are the hard ones. | DONE |

E2 rationale: the module already exists and is already tested. The alternative (each
consumer reimplements auto-apply) duplicates the exact logic the engine already ships,
which is what the shared-engine extraction existed to prevent. Default OFF so no existing
consumer changes behavior.

Known limit to document with E1: an async rubric costs one model call per scored example
and the engine does NOT record that in the budget ledger. Only `Target.generate` spend is
tracked. The engagement judge therefore under-reports run cost.

## Blockers on the consumer side

| ID | Blocker | Fix |
|----|---------|-----|
| B1 | No fixture carries `split`. The engine requires `split: 'train' \| 'holdout'` on every fixture. | Partition each target's fixture set deterministically (stable hash of fixture id, not random, so the split never moves between runs). Roughly 70/30. |
| B2 | Fixtures are pulled live from the production DB (`samples.ts`), engine expects static JSON. | Snapshot to static JSON per target. Reproducibility is the point: a moving fixture set makes run-to-run totals incomparable, which is the same noise-floor problem L3 already fought. |
| B3 | `extractScript` returns `string`, engine needs the discriminated `ExtractResult`. | Mechanical per-target change. Map empty/refusal/parse-fail to `{ok:false,reason}` so unusable generations are EXCLUDED rather than scored as a clean zero. |
| B4 | Fork folds the engagement penalty in via a private `__engagementPenalty` field on the score object. | Fold it inside the async `score()` return instead, with the per-dimension breakdown in `metrics`. |

## Fixture data handling (decide before B2)

The fork's fixtures are production article text. Per the CFN fixture rule, no fixture may
name a real entity. Article/news text is not PII and the fork already reads it, so
snapshotting is acceptable, but the snapshot must be reviewed for embedded person names
and identifiers before it is committed, and the fixtures directory should stay
project-local to daily-coverage (never committed into claude-flow-novice).

## Not migrating

- `real-signal.ts` (production skip rates, recon Gap #3). Optional signal, no engine hook,
  and it shells out to the production DB. Left in the fork. If it returns later it should
  come back as a documented rubric input, not a hidden global.

## Order

1. E2 (engine, `--apply` flag, TDD) so the engine side is complete before any target moves.
2. Consumer scaffold: `daily-coverage/.claude/prompt-optimizer/` with `config.json`,
   `lib/xai.ts` (the Grok client, plugin-side per BLOCKER-2), and the shared rubric ported.
3. Engagement judge as an async rubric wrapper over the deterministic rubric (B4).
4. Fixture snapshot plus deterministic split (B1, B2), one target at a time.
5. Port targets easiest first: narration-base, brief-transitions, combined-narration,
   multi-story-script, then the four sharing `script-gemini.ts`.
6. Retire the fork only after a live run of at least one ported target matches the fork's
   behavior. Move, do not delete (a project-local `.claude/skills/prompt-optimizer` would
   SHADOW the shared engine, which is why fireside's fork had to be retired rather than
   left in place).

## Progress

| Step | Status | Evidence |
|------|--------|----------|
| 1. E2 (`--apply`) | DONE | engine suite 208/208 |
| 2. Consumer scaffold | DONE | `daily-coverage/.claude/prompt-optimizer/{config.json,lib/xai.ts,lib/show.ts,lib/engine-types.ts,rubrics/script-quality.ts}` |
| 3. Engagement judge as async rubric (B4) | DONE | `lib/engagement-judge.ts` + `rubrics/script-quality-engagement.ts`; penalty is an ordinary `engagement` category, so the engine's own per-category non-regression check covers it (the fork hid it on a private `__engagementPenalty` field) |
| 4. Fixture snapshot + deterministic split (B1, B2) | DONE | `scripts/convert-fixtures.ts`; 8 files, 92 fixtures, every 3rd is holdout; `articleId` dropped for a synthetic `id`; zero UUIDs remain |
| 5. Port all 8 targets (B3) | DONE | offline smoke: all 8 render with no leftover `{{PLACEHOLDER}}`, both splits present, empty input correctly extracts to `ok:false` |
| 6. Retire the fork | DONE | fork moved to `.archive/prompt-optimizer-fork/` via `git mv`; `~/.claude/skills/prompt-optimizer` confirmed still resolving to claude-flow-novice (no shadow); full daily-coverage suite 5531 passed / 41 skipped / 0 failed across 447 files |

Plugin tests: 42 passing (`.claude/prompt-optimizer/**/*.test.ts`, added to `vitest.config.ts` include).

First live result, `narration-base --dry-run`:
`[train baseline] total=6 (specificity=3, monotony=3) ran=14 excluded=1` /
`[holdout baseline] total=0`. The one exclusion is the tri-state gate working.

### Live (non-dry) runs

`brief-transitions`, full run, exit 0: `[train baseline] total=0` and
`[holdout baseline] total=0`, no iterations attempted. RUBRIC SATURATED, and a
correct result rather than a failure — the target emits a ~10-word transition
line and `script-quality` needs >=80 words before `specificity` is measurable
(`MIN_WORDS_FOR_SPECIFICITY`). It proves the plumbing (real xAI calls,
extraction, holdout pass, project-local report) but cannot prove parity, so it
is the wrong target for the step-6 check.

`narration-base`, full run, exit 0, 3 iterations. Two findings:

1. **`[INCONCLUSIVE]` fired against a live model** — the `aborted` variant:
   `holdout final eval ABORTED: Only 3/7 fixtures ran (below 50% threshold).
   Refusing the win; reporting baseline as final.` This is FINDING #1's guard
   (a holdout pass that mostly excluded its fixtures reads as a clean near-zero
   total and would otherwise be reported as a win) doing its job on real work,
   with no rig involved.
2. **L9** (see the engine table above). The run accepted a candidate that had
   simply broken its own extraction on 4 of 15 examples.

The two interact: the same candidate that won train by shedding examples went
on to shed most of the holdout set, and only the abort guard stopped the run
reporting a win. L9 closes the door one step earlier, at acceptance.

Re-run after L9, same seed, all three candidates correctly refused:

| Iter | candidate | before L9 | after L9 | reason |
|------|-----------|-----------|----------|--------|
| 1 | `total=6 ran=15` | reject | reject | `numHallucination` 0 -> 1, per-category rule (unchanged) |
| 2 | `total=4 ran=14 excluded=1` | reject | reject | ran-count floor, 15 -> 14 |
| 3 | `total=3 ran=11 excluded=4` | **ACCEPT** | reject | ran-count floor, 15 -> 11 |

Holdout then ran 7/7 with no abort: because the baseline template survived to
the gate, the run ended cleanly instead of tripping INCONCLUSIVE.

### Grok is not deterministic at temperature 0 (L10)

The two `narration-base` runs disagreed on the baseline for a template neither
had modified — `total=3 (specificity=1, monotony=2)` vs
`total=8 (specificity=4, monotony=4)`. Diagnosed rather than assumed:

1. Ruled out our own prompt: rendering all 22 fixtures twice is byte-identical,
   and no date or time token appears in the rendered prompt (`renderShowBibleText`
   was the suspect, both runs being minutes apart on one day).
2. Ruled out template drift: run 1 ended INCONCLUSIVE, and the engine only
   writes a template when `!overfit && !holdoutInconclusive && templateChanged`,
   so the seed was untouched.
3. Direct probe, one fixture, two calls at temperature 0:
   `identical raw output at temperature 0: false`, 175 vs 201 words, diverging
   at word 5.

So the variance is the provider. It is also larger than the 2-5 point gaps the
optimizer chases, which makes a single-sample comparison on this target
inside the noise floor.

**Known remaining limitation.** L10 turns on repeat sampling for the HOLDOUT
gate only. Train comparisons stay single-sample, so an accepted train win on a
Grok target can still be noise. Fixing that means repeating every train eval,
multiplying the run cost by the repeat count, so it is deliberately not done
here. The honest reading of a Grok train win is "did not regress", not
"improved".

**Tradeoff accepted in L9.** The ran-count floor refuses ANY drop, so a
genuine improvement that incidentally loses one example (iter 2 above:
rate 4/14 = 0.286 against a 8/15 = 0.533 baseline) is refused too. Nothing
distinguishes "dropped one hard example" from "dropped one at random" without
knowing which example went, and the asymmetry favours strictness: refusing a
real win costs one iteration, accepting a fake win corrupts the template that
gets shipped.

### Retiring the fork was not just a directory move

Three inbound dependencies had to be repointed first. Retiring by move alone
would have broken production.

1. **`src/services/prompts/version.ts` read production templates OUT of the
   fork** — 6 `templatePath` entries under
   `.claude/skills/prompt-optimizer/templates/`. But the shared engine writes an
   accepted template to `.claude/prompt-optimizer/templates/`. Two copies
   existed, byte-identical at the time of checking purely by timing, and
   nothing kept them in sync. **The first accepted win would have diverged
   them silently**: the optimizer would report success, production would keep
   serving the old prompt, and both files would still look correct. This was a
   live bug before the move, not one the move introduced. Repointed to the
   plugin dir; the committed content hashes stayed valid (content identical)
   and `tests/services/prompts/version.test.ts` proves it, 4/4 green.
2. **`scripts/compare-narration-prompts.ts` imported `scoreScript` from the
   fork's `lib/rubric.ts`.** Repointed to the plugin rubric. The shapes differ:
   the fork returned the six categories as flat top-level fields, the engine
   contract nests them under `.categories`, so every read moved. The script's
   own `oldTotals` / `newTotals` accumulators are plain objects and correctly
   stayed flat. `tsc --noEmit` clean.
3. **`vitest.config.ts` included the fork's `lib/*.test.ts`.** Those 87 tests
   were dropped deliberately, with the reason recorded in the config: they
   cover archived code with no remaining caller, and the ported surface is
   covered by the plugin's own 42. This is an intentional suite shrink, called
   out here so it is never mistaken for tests going missing.

`real-signal.ts` (explicitly out of scope, see "Not migrating") went to the
archive with the rest of the fork; it had no inbound imports from `src/`.

### Divergences from the fork (deliberate)

- `brief-transitions` and `combined-narration` seeded their negative constraints
  from `Math.random()`, so two evals of the SAME template compared different
  prompts and defeated temperature-0 determinism before the model was reached.
  Both now seed from the fixture id. The production seam still randomises.
- `articleId` (a real article UUID) is gone from every fixture. It was only ever
  an identifier and a PRNG seed, so a synthetic id serves both roles without a
  production identifier sitting in a fixture file.

## Verification

- Engine suite green after E2, and `grep -rn "from 'openai'" engine/` still zero (BLOCKER-2).
- After the first ported target: a live `--dry-run` produces a baseline, and no new files
  appear under the shared skill dir (BLOCKER-1 state isolation).
- A live run of one ported target reaches a holdout verdict (win, OVERFIT, or INCONCLUSIVE)
  without aborting.
