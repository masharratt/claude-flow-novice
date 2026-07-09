---
name: cfn-megaplan
description: "Tiered planning orchestrator. Runs the full SPARC+ pipeline (research, spec, decide, pseudo, data, arch, ux, design, test, ops) as a parallel DAG, scaled by build stage (mvp/beta/enterprise) via inclusion profiles. Enforces two gates: every success criterion is executable (verifiable-done) and every step is unambiguous (haiku-executable). Use as the entry point for any non-trivial build instead of cfn-spa-plan."
version: 1.0.0
tags: [planning, orchestrator, sparc, tiered, mvp, beta, enterprise, dag]
status: production
---

# CFN MegaPlan Orchestrator

**Purpose:** One entry point that produces an implementation plan detailed enough that a haiku-level agent can execute it and `cfn-loop-task` can mechanically verify it is done. Scales the planning depth to the build stage so an MVP is not burdened with enterprise ceremony and an enterprise build is not shipped with MVP gaps.

**Supersedes:** `cfn-spa-plan` (which ran spec+pseudo+arch only, untiered, sequential-ish). MegaPlan is the strict superset. `cfn-spa-plan` remains for callers that only want the three SPARC artifacts.

## When to Use

Entry point for any non-trivial build: multi-file, shared state (DB/API/types), new feature, security/auth, cross-project. Skip only for single-line fixes, renames, or a bug fix with a reproducing test (those go straight to `/cfn-loop-task`).

## Invocation

```
/cfn-megaplan "<task>" [--tier=mvp|beta|enterprise]      # forward: plan a build
/cfn-megaplan --review <path(s)>                          # reverse: audit shipped code
```

If `--tier` omitted, infer from the spec (see Step 2) and confirm with the user via `AskUserQuestion` when ambiguous.

### Reverse mode (audit already-implemented work)

`--review` runs the phases BACKWARD against existing code instead of planning forward. It chains the three review-capable phases as the single entry point (one-entry-point rule):

1. `cfn-data --review`: recover the real schema, audit floor (RLS/unscoped-delete/PII), emit the true field-bindings.
2. `cfn-ux --review`: read shipped UI, diff each field's rendered control vs the affordance map (catches FK-field-as-textbox post-hoc). Consumes step 1's bindings, so it does not guess.
3. `cfn-arch --review`: recover component boundaries + contracts, audit DRY / typed-boundary / retry-timeout / failure handling.

Each emits `planning/AUDIT_<PHASE>_<slug>.md` (findings table, `file:line | issue | severity | fix`). Synthesis (Step 7) merges them into `planning/AUDIT_<slug>.md` with a single severity-ranked list. Skip a phase when its surface is absent (no UI → skip ux; no DB → skip data). This is the catch for defects that already shipped; the forward pipeline prevents them, this finds the ones that slipped.

## Pipeline shape (8-level DAG)

Only `spec` is a hard gate. After it, branches fan out. Critical path = 8 levels, not 12 sequential.

```
L1 research            (conditional: unknowns)
L2 spec                HARD BARRIER
L3 decide ∥ pseudo
L4 data                (conditional: db)
L5 arch ∥ ux           (ux conditional: frontend)
L6 design ∥ test_plan ∥ ops   (design conditional: frontend)
L7 write_plan          JOIN: synthesizes all branches; runs Bar A
L8 plan_review         runs Bar B; loops failing phase, not whole pipeline
```

Node dependencies (orchestrator must honor; do not spawn a node before its deps return). The Consumes column names which sections of each input artifact the consumer needs; put those paths and section names in the phase prompt:

| Node | Deps | Consumes (sections of each input) | Phase skill |
|---|---|---|---|
| research | (none) | (none) | `cfn-research` |
| spec | research | RESEARCH: feasibility verdicts, prior-art findings, resolved unknowns | `cfn-spec` |
| decide | spec | SPEC: FR/EC ids, constraints, `[OPEN]` items, Build Flags block | `cfn-decide` |
| pseudo | spec | SPEC: FR/EC ids, pre/post conditions, invariants | `cfn-pseudo` |
| data | spec, decide | SPEC: FR ids, entities, pii flag; DECISIONS: resolved forks that pick storage/shape | `cfn-data` |
| arch | spec, pseudo, data | SPEC: FR ids, constraints; PSEUDO: module + branch structure; DATA: schema, field-bindings table | `cfn-arch` |
| ux | spec, data | SPEC: FR ids, user-facing flows; DATA: field-bindings table (drives control derivation) | `cfn-ux` |
| design | ux | UX: affordance map, state enumeration, flows | `cfn-design` |
| test_plan | spec, arch, ux | SPEC: FR/EC ids, `[core]` flags; ARCH: component boundaries, contracts; UX: state enumeration | `cfn-test-plan` |
| ops | spec, arch, data | SPEC: FR ids, audience/tier signals; ARCH: components, external calls; DATA: schema, migration plan | `cfn-ops` |
| write_plan | all above | every active artifact in full (synthesis join) | `/write-plan` + Bar A |
| plan_review | write_plan | the assembled plan in full, plus `VERIFY_<slug>.md` | `cfn-plan-review` + Bar B |

**Skipped-dep rule:** A dependency dropped in Step 3 counts as satisfied immediately. In the dependent phase's prompt, replace its artifact path with the literal line `Input <PHASE>: ABSENT (phase skipped: <flag>=false)` so the phase does not go looking for it.

## Protocol

### Step 0: Scope check

1. `/codebase-search "<task keywords>"`: if existing capability covers the task, abort and point to it.
2. If estimate is 8+ files, pause and negotiate scope via `AskUserQuestion` before continuing.
3. Query prior art (gap G06): `~/.claude/skills/cfn-knowledge-base`, `~/.claude/skills/decision-log/query.sh '<entities>' 5 <project>` (conversation FTS), and `~/.claude/skills/decision-log/decisions.sh search '<entities>'` (structured register of settled forks from past plans). Inject any prior playbook / failed-assumption / RESOLVED fork into the spec prompt so it is not re-litigated.
4. Pull recent retro signal (gap G36): If `.cfn-cache/retro-latest.md` exists, read it and flag hotspot overlap; if absent, skip this sub-step silently (do not search for retro output elsewhere). When the task touches a known hotspot file, flag it in the spec prompt so the plan accounts for the churn/fragility already observed there.
5. Ingest the tech-debt ledger (closes the `cfn-tech-debt` feedback loop). If `.cfn-cache/tech-debt-ledger.json` exists, READ it (never re-harvest) and list any open `cfn:` shortcut that lives in the files/area in scope as candidate backlog entries. Inject them into the spec prompt and carry them to Step 7 so deliberate shortcuts surface for the user instead of silently rotting. `no_trigger` rows (rot risk) rank first.

```bash
# Read open tech debt in scope. Surfaces all open debt unfiltered (no relevance scoring).
# cfn: surfaces every ledger row, add path/keyword relevance filter when a ledger exceeds ~50 markers
LEDGER=".cfn-cache/tech-debt-ledger.json"
[ -f "$LEDGER" ] && jq -r '.markers[] | "\(.file):\(.line) ceiling: \(.ceiling). upgrade: \(.upgrade_trigger // "NONE")."' "$LEDGER"
```

### Step 1: Build the slug

```bash
SLUG=$(echo "$TASK" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
```

All artifacts land in `planning/` named `<PHASE>_<SLUG>.md` (e.g. `SPEC_<slug>.md`, `UX_<slug>.md`, `OPS_<slug>.md`).

### Step 2: Run spec, read tier + build flags

Spawn `cfn-spec` (L2). It is the hard barrier: nothing else starts until it returns.

When the task has a user-facing surface, cfn-spec runs its **Interaction Intent Walk** (§1b) and may return `[OPEN]` intent items (richness ceiling, value-type inheritance, composition depth, lifecycle). These MUST be surfaced via `AskUserQuestion` and resolved BEFORE L4 `cfn-data` runs — a richness decision taken after the schema locks is a migration, not an edit. They ride the same `[OPEN]`-batching + 3-round bound as any spec open question (see the `spec has [OPEN]` failure-mode row).

Parse the `## 8. Build Flags` block from `planning/SPEC_<slug>.md`. Do NOT re-infer flags from spec prose. The block has this exact format (cfn-spec's template emits it):

```
## 8. Build Flags
- frontend: yes|no
- db: yes|no
- pii: yes|no
- unknowns: yes|no
- tier-hint: mvp|beta|enterprise
```

If the block is missing, the spec failed its contract: re-run cfn-spec with a directive to emit section 8.

**§1b presence gate (deterministic, same class as the Build Flags check):** if `frontend: yes`, the spec MUST contain a `## 1b. Interaction Intent` section with at least one row per interactive feature and no leverage dimension left blank (each row resolved, `[OPEN]`, or `N/A: <reason>`). A `frontend: yes` spec with no §1b section — or a §1b that skipped dimensions — failed its contract: re-run cfn-spec with a directive to run the Interaction Intent Walk. Do not let the pipeline advance past L2 on prose assurances that intent was covered; the section either exists with full dimension coverage or the spec is rejected.

Tier = `tier-hint` unless the user passed `--tier`; if tier-hint is absent or the audience is ambiguous, **ask the user** with `AskUserQuestion` (one question, plain English, recommend based on the spec).

Load the matching profile: `.claude/skills/cfn-megaplan/profiles/<tier>.json`.

### Step 3: Resolve the active phase set

For each phase in the profile, mechanical resolution: if `condition` is present and the named build flag is false, drop the phase; else use `directive` verbatim.

- `directive: skip` → drop.
- `directive: full` / `light` → keep; pass the directive + `drops`/`extras` into the phase prompt so the phase knows what to include or omit.
- Every dropped phase triggers the skipped-dep rule above for its dependents.
- **Floor override:** every item in the profile `floor` array is forced into the relevant phase regardless of tier or directive. A `light` `data` phase still authors RLS, auth boundaries, secrets handling. A `skip`-level concern that is in `floor` (e.g. `pii_if_present` when `pii` flag is true) is forced on.

### Step 4: Walk the DAG, batch by level

For levels L3 → L6, spawn every active phase at that level **in a single message** (true parallel; they are independent within a level). Wait for the whole level to return before advancing (join).

Agent selection: spawn each phase as the profile's `agent` key. A phase with no `agent` key → spawn `general-purpose` with the SKILL.md path in the prompt.

Each phase prompt carries:

```
Follow .claude/skills/<phase-skill>/SKILL.md exactly. Read the skill file first.
Task: <task>
Tier: <tier>   Directive: <full|light>   Include extras: <extras>   Omit: <drops>
Floor (forced on, never skip): <applicable floor items>
Read inputs: <dep artifact paths>
Write artifact: planning/<PHASE>_<slug>.md
Return: artifact path + a 3-line summary + any [OPEN] items needing a user decision.
```

If any phase returns `[OPEN]` items, batch them and surface via `AskUserQuestion` before advancing past the level. Record every resolved decision to the decision log (closes gap G35/decision-log loop). `cfn-decide` owns the register; the orchestrator forwards mid-level decisions to it.

**Bound:** max 3 `[OPEN]`-item cycles per level (resolve, re-run phase, re-check). If a phase still returns `[OPEN]` items after round 3, stop and surface the residual items via `AskUserQuestion` (accept as-is / keep iterating / descope) instead of looping again.

### Step 5: L7: write_plan + Bar A

`write_plan` and `plan_review` are slash commands run by the orchestrator in main chat via the Skill tool, never spawned as subagents.

Run `/write-plan "<task>" --mode=<tier>`; it consumes every `planning/<PHASE>_<slug>.md` artifact. Then run **Bar A** (`bars/verifiable-done.md`): convert success criteria to executable AC rows, emit `planning/VERIFY_<slug>.md`. If Bar A fails (any non-executable AC, any unmapped FR/EC), loop back to the owning phase (usually `test_plan` or `spec`), not the whole pipeline.

**PLAN persistence gate (REQUIRED — downstream `/cfn-loop-task` hard-depends on it).** `/write-plan` writes `planning/PLAN_<slug>.md`; this is the lane-derivation source `cfn-loop-task` reads. After `/write-plan` returns, assert the file exists:

```bash
[ -f "planning/PLAN_${SLUG}.md" ] || { echo "FATAL: write-plan did not persist planning/PLAN_${SLUG}.md"; }
```

If it is missing, re-run `/write-plan` before advancing to L8. `MEGAPLAN_<slug>.md` (Step 7) is an INDEX/summary, NOT the plan — it cannot substitute for `PLAN_<slug>.md`. A megaplan that produces `VERIFY_` but no `PLAN_` will break `cfn-loop-task` at lane derivation (the plan file is the only source of lanes + exclusive file ownership).

**Bound:** max 3 Bar A loop-back iterations. If Bar A still fails after round 3, stop and surface the residual failures via `AskUserQuestion` (accept as-is / keep iterating / descope).

### Step 6: L8: plan_review + Bar B

Run `/cfn-plan-review` (assumptions, dependency trace, blast radius, alpha-readiness scaled to tier) in main chat via the Skill tool. Then run **Bar B** (`bars/haiku-executable.md`): static + structural + coverage scans, then the live haiku probe. Any finding routes to the owning phase (ui_control → `cfn-ux`, value source → `cfn-data`/`cfn-arch`, branch → `cfn-pseudo`) and that phase re-runs. Re-run Bar B after each fix round.

**Bound: max 3 Bar B rounds.** If findings remain after round 3, stop and surface residual findings via `AskUserQuestion` (accept as-is / keep iterating / descope).

### Step 7: Synthesis + hand-off

**Handoff-file gate (run BEFORE writing the synthesis).** `cfn-loop-task` needs BOTH `planning/PLAN_<slug>.md` (lane source) and `planning/VERIFY_<slug>.md` (completion gate). Assert both exist; if either is missing the megaplan is NOT done — re-run the owning step (`/write-plan` for PLAN_, Bar A for VERIFY_) before synthesis:

```bash
for F in "PLAN_${SLUG}" "VERIFY_${SLUG}"; do
  [ -f "planning/${F}.md" ] || echo "FATAL: missing planning/${F}.md — megaplan not build-ready"
done
```

Write `planning/MEGAPLAN_<slug>.md`. **All eight `##` sections below are REQUIRED** — emit every one even if empty (write `_none_`); dropping a section is a template violation. Do NOT rename headings.

```markdown
# MegaPlan: <task>
Tier: <tier>   Build flags: <frontend? db? pii? unknowns?>   Generated: <date>

## Artifacts (active phases only)
<list of planning/*_<slug>.md actually produced — MUST include PLAN_<slug>.md and VERIFY_<slug>.md>

## Gates
- Bar A verifiable-done: PASS (N ACs, FR <m/m>, EC <k/k> mapped) -> planning/VERIFY_<slug>.md
- Bar B haiku-executable: PASS (0 findings after <r> rounds)
  # or, in a multi-plan program only: CONDITIONAL-PASS (see Cross-plan seams; blocked solely on
  # named sibling-plan items, all tracked below). CONDITIONAL-PASS is NOT a valid handoff state
  # for a standalone megaplan — a standalone plan loops its owning phase until PASS.

## Open decisions resolved
<from cfn-decide register>

## Cross-plan seams   (multi-plan program ONLY; omit the section body with "_none — standalone plan_" otherwise)
<seam ledger rows: `owner-plan | item | target artifact/migration | dependency-critical? | applied|PENDING`.
Every PENDING row that this plan hard-depends on keeps Bar B at CONDITIONAL-PASS, not PASS.>

## Open tech debt in scope
<rows from .cfn-cache/tech-debt-ledger.json whose file/area is touched by this plan; no_trigger rows first. Empty (`_none_`) if the ledger is absent or clean. These are backlog candidates for the user, not auto-scheduled work.>

## Build order   (multi-plan program ONLY; else "_standalone_")
<this plan's position in the program DAG, e.g. MP1 -> MP2 -> [this] -> MP4>

## Next
/cfn-loop-task "<task>" --mode=<mode>   (reads PLAN_<slug>.md for lanes + VERIFY_<slug>.md as completion gate)
```

Hand-off mode mapping: mode = `standard` if tier is `beta`, else the tier verbatim. Planning tier vocabulary is mvp|beta|enterprise; execution mode vocabulary is mvp|standard|enterprise; beta maps to standard.

## Multi-plan programs (a task decomposed into N interdependent megaplans)

When one build is too large for a single megaplan and is split into sibling plans (MP1…MPn) that share a schema / contracts package / decision log, the single-plan assumptions above bend. Extra rules:

1. **Program index doc.** Write `planning/MEGAPLAN_program_<program-slug>.md` (or `_mp0_`) that owns what no single plan can: the build-order DAG across plans, the shared contracts/decision-register paths, and a consolidated cross-plan seam ledger (every row from every plan's `## Cross-plan seams`). Without it the reconciliation smears across each plan's prose and drifts. Each plan links back to it.

2. **Shared decision register.** All plans append to ONE register (e.g. `planning/DECISIONS_<program>.md`) so a fork resolved in MP2 is visible to MP4. `cfn-decide` still owns the format; the register is program-scoped, not plan-scoped.

3. **Cross-plan seam ledger is first-class.** A seam = an item plan A needs that lives in plan B's artifacts (a column, RPC, enum member, edge). Each seam row: `owner | item | target migration/artifact | dependency-critical? | applied|PENDING`. A PENDING dependency-critical seam is a real blocker: it keeps the dependent plan's Bar B at **CONDITIONAL-PASS**.

4. **Bar B CONDITIONAL-PASS verdict (multi-plan only).** A plan whose OWN decomposition is haiku-executable but which is blocked solely on named, tracked sibling-plan seam items is **CONDITIONAL-PASS**, not PASS and not a Bar B failure to loop. It becomes a true PASS the instant every blocking seam flips to `applied`. Standalone plans never use this state — they loop the owning phase to PASS. Do NOT hand a CONDITIONAL-PASS plan to `cfn-loop-task` until its blocking seams are `applied` (re-check at the program level, per build order).

5. **Back-propagation rule (CRITICAL).** Planning a LATER plan (MP4) may discover a touchpoint that must live in an EARLIER, already-"done" plan's artifacts (MP4 forcing columns into MP1's `0001` migration). When this happens: (a) apply the item to the earlier plan's DATA/ARCH/etc. artifacts, (b) re-run that earlier plan's Bar A + Bar B, (c) update its seam ledger row to `applied`. An earlier plan that still lists forced items as "NOT yet applied" is NOT build-eligible — its own artifacts are internally inconsistent with its synthesis. A dependency-critical back-propagated item MUST ship in the earlier plan's migration (the sibling that writes it builds before the plan that consumes it), never deferred to the later plan's migration.

6. **Program build order gates execution.** `cfn-loop-task` runs per plan in DAG order (MP1 → MP2 → …). Before starting plan N, confirm every seam plan N depends on is `applied` in the plans already built. The program index doc's build-order DAG is the source of truth for this sequencing.

## Worked example: profile resolution + DAG walk

```
Task: "coach dashboard with payout table"   --tier=beta
Build Flags (SPEC section 8): frontend=yes  db=yes  pii=yes  unknowns=no

Profile resolution (profiles/beta.json):
- research:  condition unknowns, flag false -> DROPPED. Skipped-dep rule fires:
             spec's prompt gets "Input RESEARCH: ABSENT (phase skipped: unknowns=false)".
- spec:      full.        decide: full.        pseudo: full.
- data:      condition db, flag true -> kept, directive full. pii floor: pii=yes forces
             PII handling (classification, retention, access boundaries) into data
             even at beta; the floor, not the tier, decides this.
- arch:      full.        ux: condition frontend, flag true -> kept, full.
- design:    condition frontend, flag true -> kept (drops i18n).
- test_plan: full.        ops: full.

DAG walk (each bracket = one message, phases in a bracket spawn in parallel):
L2  spec                          (hard barrier)
L3  [decide, pseudo]              (one message)
L4  [data]
L5  [arch, ux]                    (one message)
L6  [design, test_plan, ops]      (one message)
L7  write_plan                    (slash command, main chat) + Bar A
                                  ASSERT planning/PLAN_<slug>.md persisted (loop-task lane source)
L8  plan_review                   (slash command, main chat) + Bar B

Hand-off: /cfn-loop-task "coach dashboard with payout table" --mode=standard
          (tier beta maps to execution mode standard)
          precondition: PLAN_<slug>.md + VERIFY_<slug>.md both on disk
```

## Failure modes

| Failure | Recovery |
|---|---|
| phase agent missing | resurrect from `.claude/backups/` or fall back to `general-purpose` with the SKILL.md path in the prompt |
| spec has `[OPEN]` | surface via `AskUserQuestion` before L3 |
| Bar A fails | loop owning phase only, not the pipeline |
| Bar B probe returns questions | route each to its owning phase, re-run that phase, re-probe |
| tier ambiguous | `AskUserQuestion`, recommend from spec |
| user downgrades tier | floor items stay on; warn if a downgrade drops a phase the build flags say is needed |
| `write-plan` left no `PLAN_<slug>.md` | re-run `/write-plan`; never hand off with only `MEGAPLAN_`/`VERIFY_` — loop-task lane derivation hard-fails without `PLAN_` |
| sibling plan forced an item into an already-done plan | apply it, re-run that plan's Bar A + Bar B, flip its seam row to `applied` (back-propagation rule); do not build the earlier plan while it lists forced items unapplied |
| dependent plan blocked on sibling seam | Bar B = CONDITIONAL-PASS (multi-plan only); hold `cfn-loop-task` until blocking seams are `applied`, per program build order |

## Anti-patterns

- Running phases strictly sequentially (ignore the level batching), wastes wall-clock.
- Spawning a node before its deps return.
- Letting a tier knob disable a `floor` item (RLS/auth/secrets/PII).
- Treating Bar A/Bar B as advisory. They are hard gates.
- Editing planning artifacts during implementation without re-running Bar B.
- Handing off to `cfn-loop-task` with only `MEGAPLAN_`/`VERIFY_` on disk. `MEGAPLAN_` is an index, not the lane source; loop-task needs `PLAN_<slug>.md`.
- Shipping an earlier plan that still lists back-propagated sibling items as "NOT yet applied" — its artifacts contradict its own synthesis.
- Using CONDITIONAL-PASS to hand off a standalone (non-program) megaplan. That state exists only for sibling-seam blocking in a multi-plan program.

## Related

- Phases: `cfn-research`, `cfn-spec`, `cfn-decide`, `cfn-pseudo`, `cfn-data`, `cfn-arch`, `cfn-ux`, `cfn-design`, `cfn-test-plan`, `cfn-ops`
- Gates: `bars/verifiable-done.md`, `bars/haiku-executable.md`
- Profiles: `profiles/{mvp,beta,enterprise}.json`
- Inputs: `cfn-tech-debt` (Step 0 reads its `.cfn-cache/tech-debt-ledger.json` so open `cfn:` shortcuts in scope surface as backlog candidates)
- Downstream: `/write-plan`, `/cfn-plan-review`, `/cfn-loop-task`
- Backlog + design rationale: `docs/PLANNING_PIPELINE_GAPS.md`
