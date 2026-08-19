---
name: cfn-megaplan-lite
description: "Balanced-cut planning mode for medium features (3-7 files, single shared-state surface). Runs a 7-level DAG at mvp depth but roughly half the wall-clock of full megaplan: both completion bars capped to 1 round, pseudo folded into arch, non-core phases on sonnet, and the live haiku probe dropped. Inherits megaplan's bar scripts and phase skills by relative path. Use as the balanced-cut alternative to /cfn-megaplan for medium features."
version: 1.1.0
tags: [planning, orchestrator, dag, mvp, lite, medium-features]
status: production
---

# CFN MegaPlan-Lite (balanced-cut planning mode)

**Purpose:** A planning orchestrator for medium features that keeps mvp-depth protections (spec hard barrier, arch on opus, Bar A verifiable-done, Bar B static coverage) but cuts full megaplan's 6-8h wall-clock roughly in half. The savings come from four levers: both completion bars capped to 1 round, pseudo folded into the arch agent, non-core phases run on sonnet, and the live haiku probe dropped.

**Position in the pipeline.** `cfn-megaplan` is still the canonical entry point. Lite is the medium-feature branch: deeper than `/write-plan` solo or `cfn-spa-plan` (both lack the two completion bars and the design phases, so neither can hand to `/cfn-loop-task` safely), lighter than full megaplan (no research/ops phases, no tier profiles, no live probe).

## When to Use

Use `/cfn-megaplan-lite` for **medium features**: 3-7 files, a single shared-state surface (one DB table OR one API contract OR one shared type set), one user-facing flow at most.

**Hard exclusion list (fix G3).** Lite drops ops (threat model, observability, rollback rehearsal, canary), research, multi-tenant reasoning, and migration-rehearsal ACs. Therefore lite is explicitly NOT for:

- compliance or PII-heavy features
- multi-tenant features
- external-API integration
- schema migrations
- scale- or capacity-sensitive features
- unknowns-heavy features (anything that needs a research phase to become estimable)

Those need full `/cfn-megaplan --tier=beta|enterprise`. If you are unsure which side of the line a task falls, run full megaplan; lite is an optimization, not a default.

**Upgrade is a fresh run (fix G2).** A lite-planned feature that later needs ops, compliance, or a second shared-state surface is re-run as full `/cfn-megaplan` from scratch. Megaplan does not resume from lite artifacts. Lite artifacts (SPEC, ARCH, PSEUDO, PLAN, VERIFY) are a human head-start for the re-run, not auto-consumed inputs.

## Invocation

```
/cfn-megaplan-lite "<task>"
```

No `--tier`. Lite is a single mode (see No tiers, below).

Hand-off: `/cfn-loop-task "<task>" --mode=mvp`. Lite is mvp-depth; the execution-mode vocabulary has no "lite", so `--mode=mvp` is correct. Precondition: `planning/<slug>/PLAN_<slug>.md` + `planning/<slug>/VERIFY_<slug>.md` + `planning/<slug>/.VERIFY_<slug>.sha256` all on disk (same per-plan directory + persistence gate as megaplan).

## Pipeline shape (7-level DAG)

Only `spec` is a hard gate. After it, branches fan out. Critical path is 7 levels (versus megaplan's 8-9).

```
L1 spec                opus, HARD BARRIER; §1a Actors gate + §1b Interaction Intent walk + Build Flags §8
L2 decide              sonnet, light; BLOCKING forks only; register via cfn-decisions/record.sh
L3 data                sonnet, light, IF db=yes; floor forced (RLS/auth/secrets authored regardless)
L4 arch ∥ ux           arch = opus (ALSO emits PSEUDO_<slug>.md, pseudo folded); ux = sonnet, IF frontend=yes
                       └─ WIREFRAME GATE (frontend only): 1 Approve/Revise cycle, then advance
L5 design ∥ test_plan  design = sonnet light, IF frontend; test_plan = sonnet light (ops skipped -> skipped-dep)
L6 write_plan + Bar A  main chat; /write-plan --mode=mvp; check-verifiable-static.sh + bless-verify.sh; 1 round
L7 plan_review + Bar B-static  main chat; /cfn-plan-review; check-haiku-static.sh + structural + coverage; NO probe; 1 round
Step 7: deferred-decision batch  all [PARKED] items in one AskUserQuestion; re-gate after override
Step 8: batched handoff          synthesis MEGAPLANLITE_<slug>.md; /cfn-loop-task --mode=mvp
```

Node dependencies (the orchestrator honors these; do not spawn a node before its deps return):

| Node | Deps | Phase skill |
|---|---|---|
| spec | (none) | `cfn-spec` |
| decide | spec | `cfn-decide` |
| data | spec, decide (IF db=yes) | `cfn-data` |
| arch | spec, data | `cfn-arch` (also writes PSEUDO) |
| ux | spec, data (IF frontend=yes) | `cfn-ux` |
| design | ux (IF frontend=yes) | `cfn-design` |
| test_plan | spec, arch, ux, data | `cfn-test-plan` |
| write_plan | all active artifacts | `/write-plan` + Bar A |
| plan_review | write_plan | `/cfn-plan-review` + Bar B-static |

**Skipped-dep rule (inherited verbatim from megaplan).** See `cfn-megaplan/SKILL.md` (Pipeline shape, Skipped-dep rule) for the rule and the phase-prompt interface literal it owns. Lite applies it unchanged.

## Reuse map (lite inherits, does not re-implement)

Lite references megaplan's bar scripts and the phase skills by relative path (`.claude/skills/cfn-megaplan/bars/...`), so it rides megaplan's bar improvements for free.

**Bar scripts (inherited unmodified):**
- `.claude/skills/cfn-megaplan/bars/check-verifiable-static.sh` (Bar A static pass)
- `.claude/skills/cfn-megaplan/bars/bless-verify.sh` (manifest hash bless)
- `.claude/skills/cfn-megaplan/bars/check-haiku-static.sh` (Bar B static scan: weasel + optional-DI)
- `.claude/skills/cfn-megaplan/bars/weasel-phrases.txt` (banned phrase list)
- `.claude/skills/cfn-megaplan/lib/plan-paths.sh` (per-plan directory resolver: nested writes, nested-then-flat reads)

**Phase skills (inherited):** `.claude/skills/cfn-spec`, `.claude/skills/cfn-decide`, `.claude/skills/cfn-data`, `.claude/skills/cfn-arch`, `.claude/skills/cfn-ux`, `.claude/skills/cfn-design`, `.claude/skills/cfn-test-plan`. Skipped: `cfn-research` (unknowns not allowed in lite), `cfn-ops` (ops concerns disqualify the task from lite).

**Slash commands (main chat):** `/write-plan`, `/cfn-plan-review`.

**Decision register:** `.claude/skills/cfn-decisions/record.sh`.

## Interface contract (fix N1)

Lite depends on megaplan's bar scripts by path. A megaplan bar refactor that changes these contracts breaks lite. Expected exit codes (confirmed against the scripts):

| Script | 0 | 1 | 2 |
|---|---|---|---|
| `check-verifiable-static.sh` | clean (no error findings) | error finding present (missing AC field, taxonomy mismatch, non-decidable/weasel pass, coverage gap) | parse or usage error (bad args, missing file, invalid stage) |
| `bless-verify.sh` | pinned (sidecar + ledger written) | refused (Bar A error findings remain, nothing pinned) | parse or usage error (no manifest, jq missing, bad JSON) |
| `check-haiku-static.sh` | clean (no error findings) | error finding present (weasel phrase, optional-DI on a core FR) | parse or usage error (bad args, missing file) |

The committed smoke test (`tests/test-smoke.sh`) asserts these paths resolve at test time; it does not assert behavior. Behavior is megaplan's contract to hold.

## Model policy

- **opus:** `spec` (L1), `arch` (L4, including the folded pseudo output). These decide the structure every later phase consumes; an error there is the most expensive kind.
- **sonnet:** `decide`, `data`, `ux`, `design`, `test_plan`. These enumerate or transcribe against an already-decided structure.
- **ux escalation:** if Bar B-static returns 2 control-type findings against `ux` (e.g. an FK field rendered as a textbox, a missing affordance), re-run `ux` once at `opus`. Control-type defects are the class lite keeps the wireframe gate for; two on the same plan means the sonnet pass mis-derived the affordance map and the structure downstream is suspect.
- `write_plan` and `plan_review` run in main chat and inherit the session model; never assign them a model.

## Bar B-lite (static + structural + coverage, no live probe)

Bar B-lite runs three scans only:

1. **Static:** `.claude/skills/cfn-megaplan/bars/check-haiku-static.sh` against the assembled plan (weasel phrases via `.claude/skills/cfn-megaplan/bars/weasel-phrases.txt`, plus optional-decision-input on core FRs).
2. **Structural:** every FR/EC id in `SPEC_<slug>.md` appears in at least one plan step; every plan step cites the artifact and section it implements.
3. **Coverage:** every `[core]` FR has an executable AC in `VERIFY_<slug>.md`; every branch in `PSEUDO_<slug>.md` maps to a step or is explicitly marked out-of-scope.

**DO NOT spawn the live haiku probe.** (Full megaplan now has the same behavior at its `sonnet` Bar B tier, the mvp/beta default; lite is always at that tier.) Rationale: lite's execution model is an opus coordinator driving sonnet-level subagents with clear scoped steps. That coordinator is the clarifying layer the live probe simulated in full megaplan. Spawning the probe here would re-introduce the serial-tail cost lite exists to cut, without adding signal the coordinator does not already supply at execution time. The static/structural/coverage scans still catch gross defects (missing paths, weasel words, unmapped branches, optional-DI on core FRs); the probe's marginal catch does not justify its wall-clock on a medium feature.

## Round caps with mechanical/semantic split (fix G1)

Each bar is capped to **1 round**. Within that round:

- **MECHANICAL findings auto-patch via patch-mode, no user stall:** taxonomy mismatch, missing AC field, non-decidable predicate, weasel phrase, unmapped branch. The orchestrator routes these to the owning phase in patch mode (see Loop-back, below) within the 1-round budget.
- **SEMANTIC findings surface via AskUserQuestion:** unmapped FR/EC, missing assembled-path AC, floor gap (RLS/auth/secrets/PII). These cannot be auto-fixed because the answer changes structure.

After the single round, any residual finding stops the pipeline and surfaces via `AskUserQuestion` (accept as-is / keep iterating / descope to full megaplan). There is no round 2 in lite; a second round means the task is too complex for the balanced cut and should escalate to full `/cfn-megaplan`.

## No tiers, no profile (fix N2)

Lite has one mode. Directives are hardcoded in this file (which phases run, at what model, at what directive). There is no `profiles/<tier>.json` to load.

**Why this must not be re-added.** Tiers are the single biggest wall-clock lever in full megaplan: the profile resolution step, the per-tier floor/inclusion negotiation, and the conditional-branch fan-out are what push the full pipeline to 6-8h. Re-introducing tiers here re-introduces the cost lite exists to avoid. If a feature needs tiered treatment (beta/enterprise depth, ops phases, compliance floor expansion), it is a full-megaplan feature, not a lite feature. Route it there instead of parameterizing lite.

The floor is still forced: `rls`, `auth_boundaries`, `secrets_handling`, `no_unscoped_delete`, `pii_if_present` are authored in the data phase whenever `db=yes` or `pii=yes`, regardless of lite's single mode.

## Protocol

### Step 0: trimmed scope check

1. `/codebase-search "<task keywords>"`: if existing capability covers the task, abort and point to it.
2. If the estimate is 8+ files, stop. Either descope to 3-7 files via `AskUserQuestion`, or route to full `/cfn-megaplan` (the task is not medium).
3. Read the tech-debt ledger (`.cfn-cache/tech-debt-ledger.json`) if present; list any open `cfn:` shortcut in the files in scope as a backlog candidate and inject into the spec prompt. Do not re-harvest.
4. Query prior forks: `.claude/skills/decision-log/query.sh '<entities>' 5 <project>` and `.claude/skills/decision-log/decisions.sh search '<entities>'`. Inject any RESOLVED fork into the spec prompt so it is not re-litigated.
5. Dropped versus megaplan Step 0: no knowledge-base ingest, no retro-signal read. Lite features are medium and bounded; those signals are rarely load-bearing and cost wall-clock.

### Step 1: build the slug

```bash
SLUG=$(echo "$TASK" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
PDIR=$(.claude/skills/cfn-megaplan/lib/plan-paths.sh ensure "$SLUG")   # planning/<slug>, created
```

**Every artifact of this plan lands in ONE per-plan directory: `planning/<slug>/`**, named `<PHASE>_<SLUG>.md`. Nothing goes loose in `planning/`. Writes always use `$PDIR/<NAME>`; reads resolve nested-then-legacy-flat through the shared resolver:

```bash
SPEC=$(.claude/skills/cfn-megaplan/lib/plan-paths.sh resolve "$SLUG" "SPEC_${SLUG}.md") \
  || echo "FATAL: no SPEC artifact at $SPEC"
```

Layout rule and resolver are megaplan's (`.claude/skills/cfn-megaplan/lib/plan-paths.sh` + `cfn-megaplan/SKILL.md` §Step 1) — inherited verbatim, same as the bar scripts. Lite delta: none.

### Step 2: L1 spec (opus, HARD BARRIER)

Spawn `cfn-spec` at `opus`, telling it the plan dir (`Plan dir: planning/<slug>/`; it writes `$PDIR/SPEC_<slug>.md`). Nothing else starts until it returns. Parse the `## 8. Build Flags` block from `$PDIR/SPEC_<slug>.md` (do not re-infer from prose).

- If `frontend: yes` OR `db: yes`: require a `## 1a. Actors` section with at least one row, no blank cells, every FR touched by at least one actor. Missing -> re-run cfn-spec with a directive to emit §1a.
- If `frontend: yes`: require a `## 1b. Interaction Intent` section, one row per interactive feature, no leverage dimension blank. Missing -> re-run cfn-spec to run the Interaction Intent Walk.
- If §1b returns `[OPEN]` intent items, surface via `AskUserQuestion` BEFORE L3 data: a richness decision taken after the schema locks is a migration, not an edit.

### Step 3: L2 decide (sonnet)

Spawn `cfn-decide` at `sonnet`. Resolve **BLOCKING forks only** (forks whose answer changes the schema, a contract, the FR/EC set, or a floor item). Record every resolved decision via `.claude/skills/cfn-decisions/record.sh`. Non-blocking forks park per the triage rule (see Open-item triage, below).

### Step 4: walk L3 through L5

Spawn each level in a single message (true parallel within a level); wait for the level to return before advancing. Every phase prompt carries `Plan dir: planning/<slug>/` and states the artifact path as `planning/<slug>/<PHASE>_<slug>.md`; dep artifact paths are resolved by the orchestrator (`plan-paths.sh resolve`) and pasted in as real paths, so no phase searches for its inputs.

- **L3 data** (sonnet, IF `db=yes`): `cfn-data` at `light`. Floor forced: RLS, auth boundaries, secrets handling, no-unscoped-delete, PII-if-present authored regardless of the light directive.
- **L4 arch ∥ ux** (one message): `cfn-arch` at `opus` (consumes SPEC + DATA, writes `ARCH_<slug>.md`, AND writes `PSEUDO_<slug>.md` as a folded deliverable, not a separate phase). `cfn-ux` at `sonnet` IF `frontend=yes` (consumes SPEC + DATA field-bindings).
  - **WIREFRAME GATE (frontend only):** at the L4 join, before L5, surface the ux wireframe with one `AskUserQuestion`: Approve / Revise. Bound: 1 cycle. Approve -> L5. Revise -> `cfn-ux` patch with the note as finding, re-render, re-surface. After 1 revise cycle, advance (residual surfaces at Step 8). A revision that would change an FR, an AC, or the schema is NOT a wireframe tweak; route it to spec/data and re-run the affected levels. Unattended (`--unattended` / `CFN_MEGAPLAN_UNATTENDED=1`): same rule as full megaplan, auto-approve AS EMITTED, record `approved_by: auto-unattended`, carry to Step 7 as a re-open item.
- **L5 design ∥ test_plan** (one message): `cfn-design` at `sonnet` IF `frontend=yes` (consumes UX). `cfn-test-plan` at `sonnet` (consumes SPEC + ARCH + UX + DATA; ops absent -> skipped-dep rule).

Each phase prompt carries the open-item triage block (below). Collect `[PARKED]` items into a running list; they do not gate the level.

### Step 5: L6 write_plan + Bar A (1 round)

Run `/write-plan "<task>" --mode=mvp` in main chat (Skill tool). Then run Bar A:

```bash
.claude/skills/cfn-megaplan/bars/check-verifiable-static.sh "${PDIR}/VERIFY_${SLUG}.md"
```

Exit 1 routes to the owning phase in patch mode within the 1-round budget (mechanical findings auto-patch; semantic findings surface via `AskUserQuestion`). Only when clean (exit 0) do you bless:

```bash
.claude/skills/cfn-megaplan/bars/bless-verify.sh "${PDIR}/VERIFY_${SLUG}.md" --note "Bar A pass (lite)"
```

Then assert persistence (loop-task hard-depends on it):

```bash
[ -f "${PDIR}/PLAN_${SLUG}.md" ] || echo "FATAL: write-plan did not persist ${PDIR}/PLAN_${SLUG}.md"
```

`MEGAPLANLITE_<slug>.md` (Step 8) is an INDEX, NOT the plan; it cannot substitute for `PLAN_<slug>.md`.

### Step 6: L7 plan_review + Bar B-static (1 round, no probe)

Run `/cfn-plan-review` in main chat. Then run Bar B-lite (static + structural + coverage, as defined above). Route any finding to its owning phase in patch mode (ui_control -> `cfn-ux`, value source -> `cfn-data`/`cfn-arch`, branch -> arch's pseudo output). The 1-round cap and the mechanical/semantic split both apply.

### Step 7: deferred-decision batch

Take the `[PARKED]` list accumulated across L2-L5. Drop any item whose default a later phase made moot. Surface the rest via one batched `AskUserQuestion` (4 per call, each pre-answered by its conservative default). Accepted default -> rewrite marker `[PARKED: <default> | accepted]`, record via `cfn-decide`. Override -> route to the owning phase in patch mode.

Re-gate after an override (the bars passed against the old bytes): override changed an AC row, a `[core]` FR, or a plan step's semantics -> re-run Bar A + Bar B-static and re-bless via `bless-verify.sh`. Override rounds bounded at 2.

### Step 8: batched handoff

Assert the handoff files are on disk:

```bash
for F in "PLAN_${SLUG}" "VERIFY_${SLUG}"; do
  [ -f "${PDIR}/${F}.md" ] || echo "FATAL: missing ${PDIR}/${F}.md"
done
[ -f "${PDIR}/.VERIFY_${SLUG}.sha256" ] || echo "FATAL: missing ${PDIR}/.VERIFY_${SLUG}.sha256 (re-run Bar A static + bless)"
# nothing from this plan may sit loose in the planning root
ls planning/*_"${SLUG}".md 2>/dev/null && echo "WARN: plan artifacts loose in planning/ — move them into ${PDIR}/"
```

Write `$PDIR/MEGAPLANLITE_<slug>.md` (template below). Hand off:

```
/cfn-loop-task "<task>" --mode=mvp
```

## Open-item triage and loop-back (cite megaplan by path)

Lite reuses megaplan's triage and patch mechanics verbatim. This is a DRY fix (B1): one source of truth lives in megaplan; lite points at it.

- **Open-item triage:** see `cfn-megaplan/SKILL.md` §Open-item triage for the BLOCKING-vs-deferrable rule, the Downstream-consumed sections table, the conservative-default requirement, and the never-deferrable list. **Lite delta:** none to the rule itself. The lite downstream-consumers are the 7 active phases above (no ops, no research); apply the table with those phases only.
- **Loop-back protocol (patch mode):** see `cfn-megaplan/SKILL.md` §Loop-back protocol: patch mode for the PATCH-by-default spawn shape, the preserve-every-id rule, and the escalate-to-full-re-run triggers. **Lite delta:** the bound is 1 round per bar (not 3); a second round escalates to full `/cfn-megaplan` instead of looping.
- **Step 7 synthesis template:** see `cfn-megaplan/SKILL.md` §Step 7: Deferred-decision batch, synthesis + hand-off (synthesis template block) for the canonical 8-section shape and the re-gating table. **Lite delta:** the template is renamed `MEGAPLANLITE_<slug>.md`; section deltas are stated below; the re-gating table applies unchanged.

## Failure modes (lite deltas; full list in megaplan)

See `cfn-megaplan/SKILL.md` §Failure modes for the full table. Lite-specific deltas:

| Failure | Lite recovery |
|---|---|
| estimate crosses 8 files mid-pipeline | stop; re-route to full `/cfn-megaplan`. Lite artifacts are a head-start, not consumed. |
| Bar A or Bar B finding survives 1 round | stop; surface via `AskUserQuestion` (accept / iterate / descope to full megaplan). No round 2 in lite. |
| 2 Bar B control-type findings on ux | re-run ux once at opus (Model policy). A third control finding re-routes to full megaplan. |
| feature smells ops/compliance mid-pipeline (PII, multi-tenant, migration) | stop; re-route to full `/cfn-megaplan --tier=beta`. Lite is the wrong cut. |
| `PSEUDO_<slug>.md` missing after L4 | the arch agent did not emit the folded pseudo output; re-spawn arch (opus) with a directive to emit it. Do not spawn a separate pseudo phase. |

## Anti-patterns (lite deltas; full list in megaplan)

See `cfn-megaplan/SKILL.md` §Anti-patterns for the full list. Lite-specific:

- Spawning a separate `cfn-pseudo` phase. Pseudo is folded into arch in lite; a separate spawn re-introduces the level lite removed.
- Spawning the live haiku probe. The execution model replaces it (see Bar B-lite).
- Adding `--tier` or a profile JSON. Re-introduces the 6-8h cost (see No tiers).
- Running lite on a feature that matches the hard exclusion list. Escalate to full megaplan instead.
- Letting the 1-round cap become "skip the bar". The cap bounds iterations, not coverage; the single round still runs the full static + structural + coverage scan.
- Looping a bar a second time "just to be sure". A second round means the task is too complex for lite; escalate.
- Writing an artifact loose in `planning/` instead of `planning/<slug>/`, or hand-rolling the nested-then-flat lookup instead of calling `plan-paths.sh resolve`. Same rules as megaplan; lite has no delta here.

## Synthesis template: MEGAPLANLITE_<slug>.md

The writing agent Reads `cfn-megaplan/SKILL.md` §Step 7: Deferred-decision batch, synthesis + hand-off (synthesis template block) for the canonical 8-section structure (all eight `##` sections REQUIRED, emit every one even if empty as `_none_`, do not rename headings) and emits the lite-named file instead. Same cite-and-Read pattern lite uses for the phase skills.

**Lite deltas versus megaplan synthesis:**
- Output file: `planning/<slug>/MEGAPLANLITE_<slug>.md` (not `MEGAPLAN_<slug>.md`); the `## Artifacts` section lists the plan dir plus the `planning/<slug>/*_<slug>.md` files actually produced.
- Gates line: names "Bar B-static (no probe)" instead of the full haiku-executable bar.
- Cross-plan seams and Build order: collapse to standalone (`_none - standalone plan_` / `_standalone_`) because lite has no ops/research phases and no multi-plan program. If either fills with real content, the task outgrew lite and must be re-run as full megaplan.

## Related

- Full-strength sibling (canonical entry point): `cfn-megaplan` (tiered DAG, both bars full-strength, live haiku probe, research + ops phases). Lite inherits its bar scripts and phase skills by path.
- Phase skills: `cfn-spec`, `cfn-decide`, `cfn-data`, `cfn-arch`, `cfn-ux`, `cfn-design`, `cfn-test-plan`.
- Gates: `cfn-megaplan/bars/check-verifiable-static.sh`, `cfn-megaplan/bars/bless-verify.sh`, `cfn-megaplan/bars/check-haiku-static.sh`.
- Downstream: `/write-plan`, `/cfn-plan-review`, `/cfn-loop-task`.
