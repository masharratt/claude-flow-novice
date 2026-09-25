# Rigging the engine's refusal paths against a live model

Engine: `claude-flow-novice/.claude/skills/prompt-optimizer/`.
Rigs: `claude-flow-novice/.claude/prompt-optimizer/{targets,rubrics,fixtures}/rigged-*.ts`.

The holdout gate has three outcomes: accept, `OVERFIT`, `INCONCLUSIVE`. Two of
those are refusals, and they are the engine's only protection against shipping
a template that scored well by accident. They had unit coverage but had never
fired against a live model, which is the one thing unit tests cannot prove:
that a real mutator, given a real model, actually produces the situation the
refusal exists to catch.

## Status

| Path | Variant | Proven live | Evidence |
|------|---------|-------------|----------|
| `OVERFIT` | — | YES | `rigged-overfit` v3, below |
| `INCONCLUSIVE` | `aborted` | YES | daily-coverage `narration-base`, unrigged (see `PLAN_daily_coverage_migration.md`) |
| `INCONCLUSIVE` | `mixed-repeats` | YES | `rigged-noise` v3, below (v1 and v2 failed first) |

## OVERFIT — `rigged-overfit` v3

**Rig.** 10 train fixtures all `style: terse`, 5 holdout fixtures all
`style: formal`. The rubric charges `tooWordy` only on terse fixtures and
`tooTerse` only on formal ones. The seed template is verbose: perfect on the
formal holdout, maximally wrong on the terse train set. A candidate can only
win train by compressing, and compressing must break the holdout.

**Result** (`runs/rigged-overfit-2026-07-24T15-02-03-852Z.md`):

```
[train baseline]   total=460 (tooWordy=460, tooTerse=0) ran=10 excluded=0
[holdout baseline] 2 repeats: [0, 0] (spread=0)
--- Iter 2 (tighten-negatives) ---
[accept] total=460 -> total=131                        ran=10 excluded=0
[holdout final]    2 repeats: [19, 19] (spread=0)
[OVERFIT] holdout regressed on EVERY repeat. Refusing the win; reporting baseline as final.
```

The candidate won train legitimately — a 72% improvement with `excluded=0`, so
the L9 sample-count guards were not involved; it earned the win by genuinely
compressing. Then holdout went `0 -> 19` on **both** repeats with zero spread,
hitting `allRegressed` at `engine/optimize.ts:602-605`.

Verified after the refusal:
- `templates/rigged-overfit.md` is byte-identical to `.seed.md` — the refused
  win did not reach disk.
- No new file in `backups/` — backups are written only for an accepted,
  non-refused win, so their absence is a second independent signal.
- Report records `**OVERFIT — win refused. Baseline template retained.**`

### Why v1 and v2 failed, and the general rule

**v1** gave train too much headroom against a holdout-only category, so the
holdout never moved.

**v2** rendered the fixture's `style` into the prompt as `{{STYLE}}`. The
mutator read it and wrote an explicit conditional:

```
Apply ONLY the instruction block that matches Style.
'terse' rules:  - Maximum 6 words.
'formal' rules: - Write at least two full sentences, 25 words or more.
```

That satisfied both populations at once. Holdout final came back `[0, 0]`,
identical to baseline, and `OVERFIT` correctly did **not** fire — the win was
real. The rig was broken, not the gate.

**The rule this yields:** an overfit rig cannot depend on the mutator failing
to notice something, or on an honest `describe()` going unread. The
train/holdout distribution shift must be *structurally unobservable in the
rendered prompt*. Given any signal it can condition on, a competent mutator
will write a conditional and legitimately generalise. v3 drops `STYLE` from
`renderPrompt` entirely, so a candidate can express only one global length.

Guarded by two tests in `targets/rigged-overfit.test.ts` — a terse and a
formal fixture with the same change text must render byte-identical prompts,
and the style word must never appear in a rendered prompt.

## INCONCLUSIVE / mixed-repeats — `rigged-noise`

Not yet proven. Two rig designs have failed, and the pair of failures pins down
what this path actually needs.

**v1 — no headroom.** Seed asked for "roughly 14 words. Mention the product by
name," and the cliff sat at 14. Live: `[train baseline] total=0 (overLength=0,
missingProduct=0) ran=8`. A perfect baseline gives the mutator nothing to
chase, so no candidate is ever meaningfully different and the holdout
comparison never happens.

**v2 — a break-even tension that wasn't.** Two categories were supposed to
trade off: `MAX_WORDS = 12` against a `missingProduct` check on deliberately
long (two-to-three word) product names, on the theory that naming the product
costs about the headroom the budget can absorb. Live
(`runs/rigged-noise-2026-07-24T15-31-45-466Z.md`):

```
[train baseline]   total=5 (overLength=0, missingProduct=5) ran=8 excluded=0
[holdout baseline] 3 repeats: [3, 4, 3] (spread=1)
--- Iter 1 (targeted-surgical) ---
[accept] total=5 -> total=0 (overLength=0, missingProduct=0) ran=8 excluded=0
[holdout final]    3 repeats: [0, 0, 0] (spread=0)
```

The candidate added one clause — `The blurb must include the exact product name
{{PRODUCT}}.` — and won **both** categories on **both** splits. The premise was
simply false: a blurb naming a two-word product fits in 12 words with room to
spare ("Brightleaf Ledger: tax-ready books for small farms" is 7). `overLength`
never fired once, at baseline or after, so there was no tension for the noise to
act on. `noneRegressed` held and the engine correctly recorded a clean win.

The `[holdout baseline]` spread of 1 is worth keeping: the noise mechanism
itself works. The candidate escaped the tension rather than the noise being
absent.

### Measured: word count is not a noisy dimension for this model

v1 and v2 were the same mistake twice — both scored word count against a
knife-edge threshold. Before attempting a third, 36 live generations of the v2
candidate template were probed directly:

```
n=36 min=10 p25=12 median=12 p75=12 max=12
distribution: [10,11,11,11,12,12, ...thirty-two 12s... ]
```

32 of 36 are **exactly 12 words**, because the template says "about 12 words",
and nothing ever exceeded it. The model treats a stated word count as a hard
target and hits it precisely. `overLength` at 12 could not have fired.

This generalises well past word count, and it is the most useful thing the
three failures produced: **this model reliably follows any explicit, checkable
instruction**, so any rubric that is honestly described and deterministically
scored is LEARNABLE. The mutator writes the matching instruction and wins
cleanly. Every "tune the threshold" idea dies here, which is why v3 changes the
mechanism instead of the number.

A second probe ruled out the obvious replacements. Scoring 36 seed generations
for per-fixture instability across 3 repeats:

| property | incidence | fixtures flipping across repeats |
|----------|-----------|----------------------------------|
| hasComma | 33% | **6/12** |
| hasHyphen | 28% | 5/12 |
| longest word >= 10 | 50% | 3/12 |
| hasAnd | 44% | 1/12 |
| longest word >= 11 | 17% | 2/12 |

Most candidates are fixture-determined, not run-determined — the long-word
metrics merely track the product name ("thermostat", "passphrase"), and a
fixture answering identically every repeat contributes a constant offset that
can never make two repeats disagree. Comma was the one property with real
run-to-run instability, so v3 is built on it. Chosen by measurement, not
intuition.

### What this path actually requires

The two failures bracket it. A rig where the mutator **can** genuinely fix the
target produces a clean win (v2). A rig where it has **nothing** to fix never
produces an accepted candidate, so the holdout gate never runs (v1).
`mixed-repeats` needs neither: a target that *looks* learnable — enough
baseline headroom that candidates are generated and accepted on train — but is
*actually* unlearnable, so the real holdout effect is smaller than the
run-to-run noise. That is the literal definition of the case the refusal exists
to catch: a train win that sits inside the noise floor.

This also means the rig must NOT depend on misleading the mutator (same rule
the OVERFIT v2 failure produced). An honest `describe()` is a requirement; the
target has to be genuinely unhittable, not merely undescribed.

### v3 design — a flat optimum

Combining both constraints: the target must be unlearnable *even when
described accurately*. v3 gets that from a **flat optimum** rather than from a
threshold.

Every fixture carries `wantsComma: boolean`, set true on exactly half of each
split. A blurb is penalised when its comma usage mismatches its own fixture.
The rendered prompt does not expose the field (`renderPrompt` passes only
PRODUCT / AUDIENCE / DETAIL) — the same structural-unobservability rule the
OVERFIT v3 rig needed.

With a fraction `q` of fixtures wanting a comma and a template driving comma
incidence to `p`, expected mismatch per fixture is `q(1-p) + (1-q)p`. At
`q = 0.5` that is **0.5 for every p**. "Always use a comma" and "never use a
comma" both leave exactly half the fixtures violating, identical to the seed.
There is no instruction to find, yet `describe()` states the rule plainly. The
mutator is not being tricked; it is being given a genuinely flat landscape.

Supporting choices, each for a specific reason:
- **Single category** (`commaMismatch`). `isImprovement` rejects any candidate
  that regresses on ANY category, so a two-category rig needs both to improve
  at once — which would sharply cut the chance of the lucky train accept this
  rig depends on to reach the holdout gate at all.
- **Holdout fixtures chosen by measured instability.** The four fixtures that
  flipped comma usage across repeats in the seed probe were moved into the
  holdout split; only holdout repeats feed the gate, and 5 of 8 flipping
  fixtures had been sitting in train where their variance was wasted.
- **4 holdout fixtures, 5 repeats.** A small holdout keeps per-repeat totals
  swingy (one flipped fixture moves the total by 1). At a per-repeat
  regression probability near 0.5, three repeats leave ~25% chance of an
  accidental unanimous verdict; five cuts that to ~9%.

Guarded by tests: the fixture-integrity test asserts the 50/50 balance within
each split (drift silently un-rigs the whole thing), and two target tests
assert that two fixtures differing only in `wantsComma` render byte-identical
prompts and that the field name never appears in a prompt.

### Result — proven live

`runs/rigged-noise-2026-07-24T19-31-13-466Z.md`:

```
[train baseline]   total=3 (commaMismatch=3) ran=8 excluded=0
[holdout baseline] 5 repeats: [3, 1, 1, 2, 1] (spread=2)
--- Iter 1 --- [eval] candidate: total=4  [reject] no improvement vs total=3
--- Iter 2 --- [mutate] FAILED: fetch failed
--- Iter 3 --- [eval] candidate: total=4  [reject] no improvement vs total=3
[holdout final]    5 repeats: [2, 1, 2, 0, 1] (spread=2)
[INCONCLUSIVE] holdout regressed on SOME repeats but not others — the win is
inside the noise floor. Refusing the win; reporting baseline as final.
```

Per-repeat, paired by index: `2>3` no, `1>1` no, **`2>1` yes**, `0>2` no,
`1>1` no. Neither `noneRegressed` nor `allRegressed`, so the mixed branch at
`engine/optimize.ts:597-613` fired.

Verified after the refusal, same three checks as OVERFIT:
- `templates/rigged-noise.md` byte-identical to `.seed.md`.
- No new file in `backups/`.
- Report records `**HOLDOUT INCONCLUSIVE (mixed-repeats) — win refused.
  Baseline template retained.**`

**The flat optimum behaved exactly as designed.** Both candidates scored
*worse* than baseline on train (4 vs 3) and neither was accepted — there is no
gradient to climb, which is the whole point. Note what that means: nothing was
ever accepted, so the "final" template was byte-identical to the baseline. The
engine scored **the same template against itself** and the two passes still
disagreed across repeats.

That is a stronger result than the lucky-accept path this rig was designed
around. With the template held constant, the disagreement cannot be attributed
to any change in the prompt — it isolates pure measurement noise, which is
precisely what the refusal exists to catch. A rig that produced a mixed verdict
via an accepted candidate would have confounded "the candidate is noise" with
"the candidate differs".

Both earlier attempts also produced the holdout spread that made this possible:
v2 spread=1, v3 spread=2-3 across 5 repeats. The comma dimension, chosen by
measurement, is what supplied it.

### Follow-on defect found by this run (L12, FIXED)

The final holdout gate ran unconditionally, with no check that the template
actually changed. In this run nothing was accepted, so the engine spent
`holdoutRepeats x holdoutFixtures` = 20 live model calls comparing the baseline
template to itself, and then printed "Refusing the win" when there was no win
to refuse.

Cost, not just cosmetics: at 5 repeats those 20 calls are a meaningful slice of
a run's budget, spent for zero information. Worse, the comparison could only
ever sample noise, so a run that proposed nothing could still trip the
OVERFIT / INCONCLUSIVE branches — which is exactly what happened here.

Fixed in `engine/optimize.ts`: when `currentTemplate === baselineTemplate` the
final pass is skipped, `holdoutFinal` reuses the baseline measurement (same
template, already measured), and the report states
`**Holdout final: SKIPPED**` rather than omitting the line. A new
`holdoutFinalSkippedUnchanged` flag carries this on `RunReport`.

Covered by 5 tests in `engine/optimize.test.ts` that assert on CALL COUNTS,
not totals — the wasted pass produced the same numbers a skipped pass would,
so totals cannot see this defect. The last of the 5 is the guard test: when a
candidate IS accepted, the final pass still runs.

## Incidental findings

Running the engine live for real surfaced two engine bugs that no unit test had
caught. Both are written up in `PLAN_daily_coverage_migration.md` (L9, L10).
Neither was in the rigs — they were in the engine, found because the rigs and
the migration put a real model behind it.

The `[mutate] FAILED: fetch failed` line in the run above is a transient
network error. The engine continued to the next iteration rather than aborting
the run, which is the intended resilience behaviour.
