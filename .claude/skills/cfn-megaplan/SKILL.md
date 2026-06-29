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

1. `cfn-data --review` — recover the real schema, audit floor (RLS/unscoped-delete/PII), emit the true field-bindings.
2. `cfn-ux --review` — read shipped UI, diff each field's rendered control vs the affordance map (catches FK-field-as-textbox post-hoc). Consumes step 1's bindings, so it does not guess.
3. `cfn-arch --review` — recover component boundaries + contracts, audit DRY / typed-boundary / retry-timeout / failure handling.

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
L7 write_plan          JOIN — synthesizes all branches; runs Bar A
L8 plan_review         runs Bar B; loops failing phase, not whole pipeline
```

Node dependencies (orchestrator must honor; do not spawn a node before its deps return):

| Node | Deps | Phase skill |
|---|---|---|
| research | — | `cfn-research` |
| spec | research | `cfn-spec` |
| decide | spec | `cfn-decide` |
| pseudo | spec | `cfn-pseudo` |
| data | spec, decide | `cfn-data` |
| arch | spec, pseudo, data | `cfn-arch` |
| ux | spec, data | `cfn-ux` |
| design | ux | `cfn-design` |
| test_plan | spec, arch, ux | `cfn-test-plan` |
| ops | spec, arch, data | `cfn-ops` |
| write_plan | all above | `/write-plan` + Bar A |
| plan_review | write_plan | `cfn-plan-review` + Bar B |

## Protocol

### Step 0: Scope check

1. `/codebase-search "<task keywords>"` — if existing capability covers the task, abort and point to it.
2. If estimate is 8+ files, pause and negotiate scope via `AskUserQuestion` before continuing.
3. Query prior art (gap G06): `~/.claude/skills/cfn-knowledge-base`, `~/.claude/skills/decision-log/query.sh '<entities>' 5 <project>` (conversation FTS), and `~/.claude/skills/decision-log/decisions.sh search '<entities>'` (structured register — settled forks from past plans). Inject any prior playbook / failed-assumption / RESOLVED fork into the spec prompt so it is not re-litigated.
4. Pull recent retro signal (gap G36): read the latest `cfn-retro` output (hotspot files, workflow bottlenecks). If the task touches a known hotspot file, flag it in the spec prompt so the plan accounts for the churn/fragility already observed there.
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

### Step 2: Run spec, infer tier + build flags

Spawn `cfn-spec` (L2). It is the hard barrier — nothing else starts until it returns.

From the spec, derive **build flags** (drives `conditional:` directives) and **tier**:

- `frontend` — spec mentions UI, screens, components, user-facing forms.
- `db` — spec touches a database table, schema, or persisted state.
- `pii` — spec handles personal/identifying/financial data.
- `unknowns` — spec contains `[OPEN]` questions or feasibility risk.

Tier inference: complexity + audience. Prototype / internal / throwaway → `mvp`. Real-user-behind-flag → `beta`. Critical / compliance / scale / external customers → `enterprise`. If the spec is ambiguous about audience, **ask the user** with `AskUserQuestion` (one question, plain English, recommend based on the spec).

Load the matching profile: `.claude/skills/cfn-megaplan/profiles/<tier>.json`.

### Step 3: Resolve the active phase set

For each phase in the profile:

- `skip` → drop.
- `conditional:<flag>` → keep only if the build flag is true, then treat as the tier's normal directive (`full`/`light`); else drop.
- `full` / `light` → keep; pass the directive + `drops`/`extras` into the phase prompt so the phase knows what to include or omit.
- **Floor override:** every item in the profile `floor` array is forced into the relevant phase regardless of tier or directive. A `light` `data` phase still authors RLS, auth boundaries, secrets handling. A `skip`-level concern that is in `floor` (e.g. `pii_if_present` when `pii` flag is true) is forced on.

### Step 4: Walk the DAG, batch by level

For levels L3 → L6, spawn every active phase at that level **in a single message** (true parallel — they are independent within a level). Wait for the whole level to return before advancing (join). Each phase prompt carries:

```
Follow .claude/skills/<phase-skill>/SKILL.md exactly. Read the skill file first.
Task: <task>
Tier: <tier>   Directive: <full|light>   Include extras: <extras>   Omit: <drops>
Floor (forced on, never skip): <applicable floor items>
Read inputs: <dep artifact paths>
Write artifact: planning/<PHASE>_<slug>.md
Return: artifact path + a 3-line summary + any [OPEN] items needing a user decision.
```

If any phase returns `[OPEN]` items, batch them and surface via `AskUserQuestion` before advancing past the level. Record every resolved decision to the decision log (closes gap G35/decision-log loop) — `cfn-decide` owns the register; the orchestrator forwards mid-level decisions to it.

### Step 5: L7 — write_plan + Bar A

Run `/write-plan "<task>" --mode=<tier>`; it consumes every `planning/<PHASE>_<slug>.md` artifact. Then run **Bar A** (`bars/verifiable-done.md`): convert success criteria to executable AC rows, emit `planning/VERIFY_<slug>.md`. If Bar A fails (any non-executable AC, any unmapped FR/EC), loop back to the owning phase (usually `test_plan` or `spec`), not the whole pipeline.

### Step 6: L8 — plan_review + Bar B

Run `cfn-plan-review` (assumptions, dependency trace, blast radius, alpha-readiness scaled to tier). Then run **Bar B** (`bars/haiku-executable.md`): static + structural + coverage scans, then the live haiku probe. Any finding routes to the owning phase (ui_control → `cfn-ux`, value source → `cfn-data`/`cfn-arch`, branch → `cfn-pseudo`) and that phase re-runs. Re-run Bar B until clean.

### Step 7: Synthesis + hand-off

Write `planning/MEGAPLAN_<slug>.md`:

```markdown
# MegaPlan: <task>
Tier: <tier>   Build flags: <frontend? db? pii? unknowns?>   Generated: <date>

## Artifacts (active phases only)
<list of planning/*_<slug>.md actually produced>

## Gates
- Bar A verifiable-done: PASS (N ACs, FR <m/m>, EC <k/k> mapped) -> planning/VERIFY_<slug>.md
- Bar B haiku-executable: PASS (0 findings after <r> rounds)

## Open decisions resolved
<from cfn-decide register>

## Open tech debt in scope
<rows from .cfn-cache/tech-debt-ledger.json whose file/area is touched by this plan; no_trigger rows first. Empty if the ledger is absent or clean. These are backlog candidates for the user, not auto-scheduled work.>

## Next
/cfn-loop-task "<task>" --mode=<tier>   (reads VERIFY_<slug>.md as completion gate)
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

## Anti-patterns

- Running phases strictly sequentially (ignore the level batching) — wastes wall-clock.
- Spawning a node before its deps return.
- Letting a tier knob disable a `floor` item (RLS/auth/secrets/PII).
- Treating Bar A/Bar B as advisory. They are hard gates.
- Editing planning artifacts during implementation without re-running Bar B.

## Related

- Phases: `cfn-research`, `cfn-spec`, `cfn-decide`, `cfn-pseudo`, `cfn-data`, `cfn-arch`, `cfn-ux`, `cfn-design`, `cfn-test-plan`, `cfn-ops`
- Gates: `bars/verifiable-done.md`, `bars/haiku-executable.md`
- Profiles: `profiles/{mvp,beta,enterprise}.json`
- Inputs: `cfn-tech-debt` (Step 0 reads its `.cfn-cache/tech-debt-ledger.json` so open `cfn:` shortcuts in scope surface as backlog candidates)
- Downstream: `/write-plan`, `/cfn-plan-review`, `/cfn-loop-task`
- Backlog + design rationale: `docs/PLANNING_PIPELINE_GAPS.md`
