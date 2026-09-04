---
name: cfn-megaplan
description: "Tiered planning orchestrator. Runs the full SPARC+ pipeline (research, spec, decide, pseudo, data, arch, ux, design, test, ops) as a parallel DAG, scaled by build stage (mvp/beta/enterprise) via inclusion profiles. Enforces two gates: every success criterion is executable (verifiable-done) and every step is unambiguous (haiku-executable). Use as the entry point for any non-trivial build instead of cfn-spa-plan."
version: 1.4.0
tags: [planning, orchestrator, sparc, tiered, mvp, beta, enterprise, dag]
status: production
---

# CFN MegaPlan Orchestrator

**Purpose:** One entry point that produces an implementation plan detailed enough that a haiku-level agent can execute it and `cfn-loop-task` can mechanically verify it is done. Scales the planning depth to the build stage so an MVP is not burdened with enterprise ceremony and an enterprise build is not shipped with MVP gaps.

**Supersedes:** `cfn-spa-plan` (which ran spec+pseudo+arch only, untiered, sequential-ish). MegaPlan is the strict superset. `cfn-spa-plan` remains for callers that only want the three SPARC artifacts.

## When to Use

Entry point for any non-trivial build: multi-file, shared state (DB/API/types), new feature, security/auth, cross-project. Skip only for single-line fixes, renames, or a bug fix with a reproducing test (those go straight to `/cfn-loop-task`).

Medium features (3-7 files, single shared-state surface): use `/cfn-megaplan-lite`, the balanced-cut alternative.

## Invocation

```
/cfn-megaplan "<task>" [--tier=mvp|beta|enterprise] [--bar-b=full|sonnet] [--unattended]   # forward: plan a build
/cfn-megaplan --review <path(s)>                          # reverse: audit shipped code
```

If `--tier` omitted, infer from the spec (see Step 2) and confirm with the user via `AskUserQuestion` when ambiguous.

`--unattended` (also `CFN_MEGAPLAN_UNATTENDED=1`): no human is watching. Every gate that would stall on `AskUserQuestion` takes its recorded default instead of stopping (tier inference takes the inferred tier; BLOCKING `[OPEN]` items take the conservative side and are re-marked `[AUTO: <default> | unattended]`; the wireframe gate auto-approves, see the gate rule). Every auto-taken decision is recorded with `decided_by: auto-unattended` so Step 7 can list them as one batch for the human to overturn. Unattended never widens scope, never loosens a boundary, and never skips a bar; it only removes the wait.

### Reverse mode (audit already-implemented work)

`--review` runs the phases BACKWARD against existing code instead of planning forward. It chains the three review-capable phases as the single entry point (one-entry-point rule):

1. `cfn-data --review`: recover the real schema, audit floor (RLS/unscoped-delete/PII), emit the true field-bindings.
2. `cfn-ux --review`: read shipped UI, diff each field's rendered control vs the affordance map (catches FK-field-as-textbox post-hoc). Consumes step 1's bindings, so it does not guess.
3. `cfn-arch --review`: recover component boundaries + contracts, audit DRY / typed-boundary / retry-timeout / failure handling.

Each emits `planning/<slug>/AUDIT_<PHASE>_<slug>.md` (findings table, `file:line | issue | severity | fix`). Synthesis (Step 7) merges them into `planning/<slug>/AUDIT_<slug>.md` with a single severity-ranked list. Skip a phase when its surface is absent (no UI → skip ux; no DB → skip data). This is the catch for defects that already shipped; the forward pipeline prevents them, this finds the ones that slipped.

## Pipeline shape (8-level DAG)

Only `spec` is a hard gate. After it, branches fan out. Critical path = 9 levels at beta+ (8 at mvp, where `ops` is skipped and `test_plan` collapses back up a level), not 12 sequential.

```
L1 research            (conditional: unknowns)
L2 spec                HARD BARRIER
L3 decide ∥ pseudo
L4 data                (conditional: db)
L5 arch ∥ ux           (ux conditional: frontend)
   └─ WIREFRAME GATE    (frontend only: cfn-ux emits a low-fi wireframe; user Approve/Revise
                         BLOCKS before L6 — the visual wrong-path catch, before design/test/ops)
L6 design ∥ ops        (design conditional: frontend; ops conditional: beta+)
L7 test_plan           consumes OPS §2 (observability signals) + DATA §6 (concurrency);
                       at mvp `ops` is skipped, so the skipped-dep rule lets test_plan
                       run in parallel with design at L6 (no extra level)
L8 write_plan          JOIN: synthesizes all branches; runs Bar A
L9 plan_review         runs Bar B; loops failing phase, not whole pipeline
```

**Why test_plan moved below ops (G49).** `ops` (Phase 2) names the observability signals that must be verified (`OBS-n`, `verify: required`); `test_plan` turns each into an AC. When both sat at L6 in parallel, test_plan could not read OPS. Making the dependency explicit (test_plan deps += ops, data) is correct scheduling; the rejected alternative — a Bar A back-fill loop — would guarantee a wasted iteration, and loops should signal defects, not schedule known work.

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
| ops | spec, arch, data | SPEC: FR ids, audience/tier signals; ARCH: components, external calls; DATA: schema, migration plan | `cfn-ops` |
| test_plan | spec, arch, ux, data, ops | SPEC: FR/EC ids, `[core]` flags; ARCH: component boundaries, contracts, state machines (§9); UX: state enumeration; DATA: concurrency table (§6), migration invocation (§5); OPS: observability signals (§2, `verify: required`) — `ops` absent at mvp, then test_plan runs at L6 | `cfn-test-plan` |
| write_plan | all above | every active artifact in full (synthesis join) | `/write-plan` + Bar A |
| plan_review | write_plan | the assembled plan in full, plus `VERIFY_<slug>.md` | `cfn-plan-review` + Bar B |

**Skipped-dep rule:** A dependency dropped in Step 3 counts as satisfied immediately. In the dependent phase's prompt, replace its artifact path with the literal line `Input <PHASE>: ABSENT (phase skipped: <flag>=false)` so the phase does not go looking for it.

## Open-item triage (BLOCKING vs deferrable)

A mid-pipeline `AskUserQuestion` stalls every downstream level on human latency. Most stalls are not worth it: a question whose answer no downstream phase reads cannot change the plan's structure, only its content. Those get answered once, at the end, in one batch.

**Triage rule (mechanical — the phase does NOT judge importance).** An `[OPEN]` item is **BLOCKING** iff either:

1. It lives in a section of the phase's own artifact that appears in the **Downstream-consumed sections** table below, or
2. It touches a profile `floor` item (`rls`, `auth_boundaries`, `secrets_handling`, `no_unscoped_delete`, `pii_if_present`).

Otherwise it is **deferrable**: the phase picks a default, self-parks the item as `[PARKED: <default> | deferred: <section> is not downstream-consumed]`, and keeps running. It never reaches the user mid-pipeline.

This reuses the existing `[PARKED: <accepted default>]` marker (`cfn-spec` §Open Questions; already honored by `cfn-pseudo`), rather than adding a second vocabulary. The only change: a phase may now park an item *itself* under this rule, instead of only after the user accepts a deferral. `[PARKED]` still travels downstream as a stated assumption and still does not set the `unknowns` build flag.

**Downstream-consumed sections (inverts the Deps table above; this is the triage input).** The orchestrator pastes the row for the phase being spawned into that phase's prompt. `write_plan` (L8) consumes every artifact in full — that join does **not** count here; if it did, every item would be blocking and the rule would be dead. Only phase-to-phase deps (L1→L7) count.

| Artifact | Read by | Downstream-consumed sections (an `[OPEN]` here BLOCKS) |
|---|---|---|
| RESEARCH | spec | feasibility verdicts, prior-art findings, resolved unknowns |
| SPEC | decide, pseudo, data, arch, ux, ops, test_plan | FR/EC ids, `[core]` flags, constraints, pre/post conditions, invariants, entities, pii flag, user-facing flows, audience/tier signals, Build Flags (§8), Actors (§1a), Interaction Intent (§1b) |
| DECISIONS | data | resolved forks that pick storage/shape |
| PSEUDO | arch | module + branch structure |
| DATA | arch, ux, ops, test_plan | schema, field-bindings table, migration plan (§5), concurrency table (§6) |
| ARCH | ops, test_plan | components, external calls, component boundaries, contracts, state machines (§9) |
| UX | design, test_plan | affordance map, state enumeration, flows |
| OPS | test_plan | observability signals (§2, `verify: required`) |
| DESIGN | — (terminal) | _none_ — every non-floor `[OPEN]` here is deferrable |
| TEST | — (terminal) | _none_ — every non-floor `[OPEN]` here is deferrable |

**Picking the default.** The parked default is the **conservative** side, never the convenient one: include the check rather than skip it, keep the stricter validation, keep the narrower access. A default that reduces coverage or loosens a boundary is not eligible for parking — raise it as BLOCKING instead. Rationale: a deferred item the user never gets to must fail safe.

**Never deferrable, regardless of section:** any floor item; anything that changes the schema, a contract, the FR/EC set, or a `[core]` flag. `cfn-spec` §1b Interaction Intent items stay hard-blocking (Step 2) — a richness decision taken after the schema locks is a migration, not an edit.

**Worked example.** `cfn-test-plan` returns "should the e2e run include the invite-resend path?". TEST is terminal (no downstream reader) and the item touches no floor concern → deferrable. The phase parks it as `[PARKED: include invite-resend in e2e | deferred: TEST is not downstream-consumed]` (conservative side = include), the pipeline never stops, and the item surfaces in the Step 7 batch for the user to override.

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
PDIR=$(.claude/skills/cfn-megaplan/lib/plan-paths.sh ensure "$SLUG")   # planning/<slug>, created
```

**Every artifact of this plan lands in ONE per-plan directory: `planning/<slug>/`.** Filenames keep the slug suffix (`$PDIR/SPEC_<slug>.md`, `$PDIR/UX_<slug>.md`, `$PDIR/OPS_<slug>.md`), because every sidecar and ledger name in the bars is derived from the basename and the suffix keeps a file self-identifying when it is copied out of its directory. Nothing this pipeline writes goes loose in `planning/`.

Path rules for every step below and every phase prompt:

- **Writes** always use `$PDIR/<NAME>` (nested). Never write to `planning/<NAME>`.
- **Reads** resolve through the shared resolver, which checks `$PDIR/<NAME>` first and falls back to the legacy flat `planning/<NAME>` so plans written before this layout keep working:

```bash
SPEC=$(.claude/skills/cfn-megaplan/lib/plan-paths.sh resolve "$SLUG" "SPEC_${SLUG}.md") \
  || echo "FATAL: no SPEC artifact at $SPEC"
```

`plan-paths.sh` (`.claude/skills/cfn-megaplan/lib/plan-paths.sh`) is the single source of truth for this layout — `dir|ensure|resolve|write|newest|slug-of`, sourceable as `plan_dir`/`plan_resolve`/etc. Downstream (`/write-plan`, `/cfn-loop-task`, `cfn-workbench`, `cfn-share`) resolves through it too. Do not hand-roll the nested-then-flat lookup.

### Step 2: Run spec, read tier + build flags

Spawn `cfn-spec` (L2). It is the hard barrier: nothing else starts until it returns.

When the task has a user-facing surface, cfn-spec runs its **Interaction Intent Walk** (§1b) and may return `[OPEN]` intent items (richness ceiling, value-type inheritance, composition depth, lifecycle). These MUST be surfaced via `AskUserQuestion` and resolved BEFORE L4 `cfn-data` runs — a richness decision taken after the schema locks is a migration, not an edit. They ride the same `[OPEN]`-batching + 3-round bound as any spec open question (see the `spec has [OPEN]` failure-mode row).

Parse the `## 8. Build Flags` block from `$PDIR/SPEC_<slug>.md` (resolve it via `plan-paths.sh resolve`, Step 1). Do NOT re-infer flags from spec prose. The block has this exact format (cfn-spec's template emits it):

```
## 8. Build Flags
- frontend: yes|no
- db: yes|no
- pii: yes|no
- unknowns: yes|no
- tier-hint: mvp|beta|enterprise
```

If the block is missing, the spec failed its contract: re-run cfn-spec with a directive to emit section 8.

**§1a presence gate (deterministic, same class as the Build Flags check):** if `frontend: yes` OR `db: yes`, the spec MUST contain a `## 1a. Actors` section with at least one row, no blank cells, and every FR touched by at least one actor. A spec missing it failed its contract: re-run `cfn-spec` with a directive to emit §1a. Do not accept prose assurances that the roles are "obvious" — `cfn-data` §4 derives the RLS policy set from this table at L4 (a floor item) and `cfn-arch` §6 derives its AuthZ columns from it at L5. With no §1a, both invent a role set independently and the two do not have to agree.

**§1b presence gate (deterministic, same class as the Build Flags check):** if `frontend: yes`, the spec MUST contain a `## 1b. Interaction Intent` section with at least one row per interactive feature and no leverage dimension left blank (each row resolved, `[OPEN]`, or `N/A: <reason>`). A `frontend: yes` spec with no §1b section — or a §1b that skipped dimensions — failed its contract: re-run cfn-spec with a directive to run the Interaction Intent Walk. Do not let the pipeline advance past L2 on prose assurances that intent was covered; the section either exists with full dimension coverage or the spec is rejected.

Tier = `tier-hint` unless the user passed `--tier`; if tier-hint is absent or the audience is ambiguous, **ask the user** with `AskUserQuestion` (one question, plain English, recommend based on the spec).

Load the matching profile: `.claude/skills/cfn-megaplan/profiles/<tier>.json`.

**Bar B executor tier.** `profile.bars.haiku_executable` is `sonnet` at mvp/beta and `full` at enterprise; `--bar-b=full|sonnet` overrides it. `sonnet` models the real executor (opus coordinator + sonnet lanes): steps name file + symbol + done predicate, typed signatures optional, no live haiku probe. `full` is the haiku-literal bar with the probe. Rules and rationale: `bars/haiku-executable.md` "Executor tier". Pass the resolved tier into `/write-plan` (it changes the step-row validity rule) and record it in the Bar B gate report as `bar_b_tier` and in the synthesis Gates line as `tier=<sonnet|full>` (cfn-loop-task 5E.6 reads that token into the run ledger, which is how a too-loose `sonnet` bar becomes visible: `cli/run-ledger.sh stats`). `bars.verifiable_done` is always `full`; there is no lower tier for Bar A.

### Step 3: Resolve the active phase set

For each phase in the profile, mechanical resolution: if `condition` is present and the named build flag is false, drop the phase; else use `directive` verbatim.

- `directive: skip` → drop.
- `directive: full` / `light` → keep; pass the directive + `drops`/`extras` into the phase prompt so the phase knows what to include or omit.
- Every dropped phase triggers the skipped-dep rule above for its dependents.
- **Floor override:** every item in the profile `floor` array is forced into the relevant phase regardless of tier or directive. A `light` `data` phase still authors RLS, auth boundaries, secrets handling. A `skip`-level concern that is in `floor` (e.g. `pii_if_present` when `pii` flag is true) is forced on.

### Step 3a: Resolve the model per phase

Each profile phase may carry a `model` key (`opus` | `sonnet` | `haiku`). It is a **wall-clock lever, not a quality knob**: phases whose job is transcription and enumeration against an already-decided structure run `sonnet`; phases that decide structure run `opus`.

Rules:

- `model` present → spawn that phase at that model.
- `model` absent → inherit the session model. Every `write_plan` / `plan_review` step is main-chat and always inherits; never assign them a model.
- **Never downgrade a phase that owns a decision downstream phases consume**: `spec`, `data`, `arch`, and `decide` at `full` stay `opus` in every profile. Downgrading them moves the error upstream of everything, where it is most expensive.
- A `directive: light` phase is the safe downgrade candidate — `light` already dropped the parts that needed judgment.
- Never downgrade a phase carrying a `floor` item.
- If a downgraded phase fails Bar A/Bar B twice on the same finding, re-run it at `opus` and record it: the profile's model assignment is wrong, not the phase.

### Step 4: Walk the DAG, batch by level

For levels L3 → L7, spawn every active phase at that level **in a single message** (true parallel; they are independent within a level). Wait for the whole level to return before advancing (join). Note `test_plan` (L7) depends on `ops` (L6) at beta+; at mvp `ops` is skipped and test_plan joins the L6 message.

**Size gate at every join (L2 through L9).** After each level returns and before the next is spawned, run the byte-cap check against the plan dir with the tier profile:

```bash
.claude/skills/cfn-megaplan/bars/check-size.sh --all "$PDIR" --profile .claude/skills/cfn-megaplan/profiles/<tier>.json   # the profile loaded at Step 2
```

Caps live in the profile's `.caps` (mvp = 2x, beta = 3x, enterprise = 4x the `cfn-megaplan-fast` caps; see `_caps_note`). An `OVER` line means that artifact will be re-read in full by every downstream phase, which is the measured #1 cost driver (SPECs at 110-136KB and VERIFYs at 545KB in the curve2026 run). Rule: one sonnet compress spawn per OVER artifact (`general-purpose`, prompt: "remove prose, keep every id/table/contract/check/AC row; target <= <cap> bytes; do not drop or renumber ids"), re-run the check once; still OVER → record `[PARKED] size-over: <artifact> <bytes>/<cap>` and advance. The gate never blocks a level and never spawns a second compress. Cap the phase prompt too: paste `Byte cap for this artifact: <cap>` from the same profile so the phase aims under it instead of being compressed after.

Agent selection: spawn each phase as the profile's `agent` key. A phase with no `agent` key → spawn `general-purpose` with the SKILL.md path in the prompt. Pass the profile's `model` key as the spawn model when present; a phase with no `model` key inherits the session model (see Step 3a).

Each phase prompt carries (the template, nothing more — see Brief budget below):

```
Follow .claude/skills/<phase-skill>/SKILL.md exactly. Read the skill file first.
Task: <task>
Tier: <tier>   Directive: <full|light>   Include extras: <extras>   Omit: <drops>
Floor (forced on, never skip): <applicable floor items>
Plan dir: planning/<slug>/   (ALL your reads and writes live here; never write loose in planning/)
Read inputs: <dep artifact paths, each already resolved to a real path by the orchestrator>
Write artifact: planning/<slug>/<PHASE>_<slug>.md

Open-item triage (apply to EVERY [OPEN] you would raise):
  Downstream-consumed sections of your artifact: <row from the Downstream-consumed table, or "none — terminal">
  An [OPEN] is BLOCKING only if it lives in one of those sections, or touches a floor item.
  Otherwise: pick the CONSERVATIVE default, park it as
    [PARKED: <default> | deferred: <section> is not downstream-consumed]
  and keep going. Do not ask the user. Never park a floor item, a schema/contract/FR-set/[core] change,
  or any default that reduces coverage or loosens a boundary — those are BLOCKING.

Return: artifact path + a 3-line summary + [OPEN] items (BLOCKING, need a user decision now)
        + [PARKED] items (deferred, listed separately with the default you chose).
```

**Brief budget.** A phase brief is the template above filled in — assignment, paths, cap — and stays ≤ 15% of the artifact's byte cap (~3.5KB at mvp SPEC). Brief size drives artifact size: the writer mirrors the brief's register, so a multi-KB brief produces an over-cap artifact and pays the compress spawn at the join (reported 2026-09-03: thousands-of-words briefs → 36KB SPEC vs 24KB cap → 234K subagent tokens compressing two files). Context never rides in the brief: research findings, prior decisions, and phase detail go to input files the agent reads (dep artifacts, decision-log rows, the phase skill itself). `cfn-spawn-depth-guard.sh` warns on main-chat briefs over `CFN_BRIEF_MAX_BYTES` (default 4096; log `~/.claude/brief-size-warn.log`).

If any phase returns **BLOCKING** `[OPEN]` items, batch them and surface via `AskUserQuestion` before advancing past the level. Record every resolved decision via `.claude/skills/cfn-decisions/record.sh` (closes gap G35/decision-log loop AND populates the per-run JSON ledger). The writer owns the per-run JSON register and delegates the SQLite sync to `decision-log/record.sh` (behavior-preserving for SQLite via delegation, additive for JSON as a new per-run artifact); the orchestrator forwards mid-level decisions to the writer, which records them.

**Wireframe gate (L5→L6 barrier, when `frontend=yes`).** `cfn-ux` (L5) emits a low-fi wireframe and returns its reference (`wireframe: <url|path>`) as a BLOCKING approval item (see `cfn-ux` Phase 6). At the L5 join, BEFORE spawning L6 (design ∥ ops), surface the wireframe with one `AskUserQuestion`: **Approve** / **Revise**. This is the visual twin of the spec §1b intent walk — §1b confirms interaction intent in words before the schema locks at L4; the wireframe confirms screen structure + flow in a picture before design/test-plan/ops/write-plan build on it. Catching a wrong structure here costs a `cfn-ux` patch; catching it at Step 7 would cost re-running L6–L9.

- **Approve** → proceed to L6. Record the approval to the decision log.
- **Revise** → route to `cfn-ux` in **patch mode** with the user's note as the finding; it adjusts the structure (a control, a screen, a flow) and re-renders. Re-surface. This rides the same **3-BLOCKING-cycle-per-level bound** as any L5 blocking item; after round 3, surface residual via `AskUserQuestion` (accept as-is / keep iterating / descope).
- A revision that would change an FR, an AC, or the schema is NOT a wireframe tweak — route it to `cfn-spec`/`cfn-data` and re-run the affected levels, not a `cfn-ux` patch.
- A `_skipped: no renderable screens_` reference raises no gate.
- **Unattended runs (`--unattended` / `CFN_MEGAPLAN_UNATTENDED=1`).** The gate still fires but does not stop. Auto-approval means exactly: record the approval to the decision log as `wireframe: <ref> | approved_by: auto-unattended | reason: no reviewer present`, write the same line into the `[PARKED]` running list so it reaches the Step 7 batch as a "re-open?" item, and proceed to L6 with the wireframe AS EMITTED (no auto-revise, no structure guess). An orchestrator that invents its own approval wording, or proceeds without recording, is off-protocol: a later human must be able to see that nobody looked at this picture. Attended runs never auto-approve.

Because the wireframe is approved at L5, it never reaches Bar A/Bar B or the Step 7 batch: the structure the plan is built on was signed off before the plan existed.

`[PARKED]` items do **not** gate the level. Collect them into a running list (artifact, item, chosen default, reason) and carry it to Step 7, where they surface as one batched `AskUserQuestion` after the bars pass.

**Triage audit (cheap, do it — the rule is only worth having if it is enforced in one direction).** For each BLOCKING item a phase returns, confirm the named section actually appears in that artifact's Downstream-consumed row, or that it names a floor item. A phase escalating a terminal-artifact item is re-prompted once with the rule restated, not forwarded to the user. Do not audit in the other direction: a phase that parks something it should have blocked on gets caught by Bar A/Bar B, which read the parked default as a stated assumption.

**Bound:** max 3 BLOCKING-item cycles per level (resolve, re-run phase, re-check). If a phase still returns BLOCKING items after round 3, stop and surface the residual items via `AskUserQuestion` (accept as-is / keep iterating / descope) instead of looping again.

### Loop-back protocol: patch mode (used by Bar A, Bar B, and Step 7 overrides)

"Loop the owning phase" does not mean re-run it. A full re-run of e.g. `cfn-test-plan` rewrites a whole artifact to fix two findings, costs a full phase execution, and churns rows the bars already passed. Loop-backs are the pipeline's serial tail — up to 3 Bar A rounds plus 3 Bar B rounds land end-to-end after every branch has joined, so this is where saved minutes are real minutes.

**Default: PATCH.** Spawn the owning phase's agent with:

```
Follow .claude/skills/<phase-skill>/SKILL.md exactly. Read the skill file first.
PATCH MODE: planning/<slug>/<PHASE>_<slug>.md already exists and already passed its own contract.
Read it. Fix ONLY these findings:
<verbatim finding list — file:line | kind | detail>
Rewrite only the rows/sections those findings name. Do not restructure, re-derive, or renumber
anything else; downstream artifacts already cite these ids. Preserve every id (FR-n, AC-n, D-n).
Re-run your skill's own self-checks (e.g. the coverage self-check) before returning.
Return: the artifact path + one line per finding stating how it was fixed.
```

**Escalate to full re-run** when either: the same finding survives 2 patch rounds, or a finding requires renumbering / adding an FR / changing the artifact's structure (a patch cannot honestly do that). A patch round and a full re-run each count as one round against the phase's 3-round bound — the bound counts attempts, not effort.

Patch mode does not apply to a phase that never ran (a dropped phase newly forced on by a resolved decision). That is a fresh spawn at its normal directive.

### Step 5: L8: write_plan + Bar A

`write_plan` and `plan_review` are slash commands run by the orchestrator in main chat via the Skill tool, never spawned as subagents.

Run `/write-plan "<task>" --mode=<tier>`; it consumes every `$PDIR/<PHASE>_<slug>.md` artifact (it resolves the plan dir itself via `plan-paths.sh`). Then run **Bar A** (`bars/verifiable-done.md`): convert success criteria to executable AC rows, emit `$PDIR/VERIFY_<slug>.md`. If Bar A fails (any non-executable AC, any unmapped FR/EC), loop back to the owning phase (usually `test_plan` or `spec`) in **patch mode** (see Loop-back protocol), not the whole pipeline and not a full phase re-run.

**Mechanical static pass (Bar A step 1.5, REQUIRED).** After `VERIFY_<slug>.md` is emitted, run the static checker:

```bash
.claude/skills/cfn-megaplan/bars/check-verifiable-static.sh "${PDIR}/VERIFY_${SLUG}.md"
```

Exit 1 (error findings — missing AC field, taxonomy mismatch, non-decidable/weasel pass, coverage-counter gap) routes back to the owning phase and counts against the same 3-round Bar A bound. Do not hand-write this scan. Only when it is clean (exit 0) do you proceed.

Run the size gate (Step 4) here too, over `PLAN_<slug>.md` and `VERIFY_<slug>.md`: a VERIFY over cap is usually duplicated evidence prose, not extra ACs; compress once per the Step 4 rule before blessing so the hash pins the compact form.

**Bless the integrity hash (W2).** After Bar A passes (static pass clean), bless the manifest. Use `bless-verify.sh` — **never write the sidecar by hand.** It re-runs the static checker and refuses to pin anything on an error finding, then writes the sidecar plus an append-only bless ledger naming which ACs moved:

```bash
.claude/skills/cfn-megaplan/bars/bless-verify.sh "${PDIR}/VERIFY_${SLUG}.md" --note "Bar A pass"
```

The bars are path-agnostic (every sidecar is derived from the file's own directory + basename), so the sidecar, snapshot, and ledger land in `$PDIR` alongside the manifest — nothing extra to configure.

Exit 1 = refused (Bar A findings remain, nothing pinned). On a re-bless it prints `structure_changed` / `predicate_changed`; a `predicate_changed: true` means a `pass` condition moved and needs a stated reason before you advance.

This is the **plan-stage** bless (the default), which is why every AC's `evidence` field reads `PENDING: <reason>` here — the code it checks does not exist yet. `cfn-loop-task` 5E.3a backfills the real output from the exit-gate run and re-blesses with `--stage exit`, which rejects any surviving `PENDING`.

**PLAN persistence gate (REQUIRED — downstream `/cfn-loop-task` hard-depends on it).** `/write-plan` writes `$PDIR/PLAN_<slug>.md`; this is the lane-derivation source `cfn-loop-task` reads. After `/write-plan` returns, assert the file exists **in the plan dir** (a `PLAN_` that landed loose in `planning/` means write-plan did not pick up the plan dir — move it into `$PDIR` and fix the invocation):

```bash
[ -f "${PDIR}/PLAN_${SLUG}.md" ] || { echo "FATAL: write-plan did not persist ${PDIR}/PLAN_${SLUG}.md"; }
```

If it is missing, re-run `/write-plan` before advancing to L9. `MEGAPLAN_<slug>.md` (Step 7) is an INDEX/summary, NOT the plan — it cannot substitute for `PLAN_<slug>.md`. A megaplan that produces `VERIFY_` but no `PLAN_` will break `cfn-loop-task` at lane derivation (the plan file is the only source of lanes + exclusive file ownership).

**Bound:** max 3 Bar A loop-back iterations. If Bar A still fails after round 3, stop and surface the residual failures via `AskUserQuestion` (accept as-is / keep iterating / descope).

### Step 6: L9: plan_review + Bar B

Run `/cfn-plan-review` (assumptions, dependency trace, blast radius, alpha-readiness scaled to tier) in main chat via the Skill tool. Then run **Bar B** (`bars/haiku-executable.md`) at the resolved executor tier: static + structural + coverage scans (the static set includes `bars/check-phase-width.sh` — <=15 steps, <=8 distinct files per step-number major, so loop-task's one-lane-per-phase rule yields parallelizable lanes; over = split the phase by file cluster in the step table), then the live haiku probe **only at `full`** (`sonnet` skips it; the structural scan accepts file + symbol name in place of a typed signature). Any finding routes to the owning phase (ui_control → `cfn-ux`, value source → `cfn-data`/`cfn-arch`, branch → `cfn-pseudo`), which fixes it in **patch mode** (see Loop-back protocol). Re-run Bar B after each fix round.

**Bound: max 3 Bar B rounds.** If findings remain after round 3, stop and surface residual findings via `AskUserQuestion` (accept as-is / keep iterating / descope).

### Step 7: Deferred-decision batch, synthesis + hand-off

**Deferred-decision batch (run FIRST, before the handoff gate).** Take the `[PARKED]` list accumulated across Step 4 levels. These are the questions the triage rule kept off the critical path; this is where they get answered, once, together. (The wireframe is NOT here — it is a BLOCKING gate at the L5→L6 barrier in Step 4, resolved before design/test-plan/ops run.)

1. Drop any parked item whose default the plan already made moot (a later phase decided it).
2. Surface the rest via `AskUserQuestion`, **batched 4 per call**, each stating the chosen default and what changes if overridden. Every item is pre-answered by its default, so the user can accept the whole batch in one pass.
3. `AskUserQuestion` caps at 4 options per question — an item with more candidate values gets its top 3 plus "Other".
4. Accepted default → rewrite the marker to `[PARKED: <default> | accepted]`. Record it to the decision log via `cfn-decide` like any other resolved fork.
5. Override → route to the owning phase in **patch mode** with the override as the finding.

**Re-gating after an override (do not skip — the bars passed against the OLD bytes).**

| Override changed | Re-run |
|---|---|
| nothing (default accepted) | nothing |
| artifact prose only, no AC row and no plan step | the static passes (`check-verifiable-static.sh`, `check-haiku-static.sh`) |
| one or more AC rows (added/removed/rewritten) | re-bless; then exactly what the bless's `regate` line says (per-AC scope, see `bars/verifiable-done.md` "Per-AC re-gate scope"). Typical: LLM Bar A on the named rows + coverage block, Bar B static+structural on the steps bound to them, no probe unless a row was **added** |
| a plan step's semantics, no AC change | Bar B static + structural on the changed steps only; live probe only if the change added a step or a new file/component |
| a `[core]` FR (SPEC), or `--force-full` | full Bar A + full Bar B, including the live haiku probe |

Any edit to `VERIFY_<slug>.md` **must** re-bless via `bars/bless-verify.sh "$PDIR/VERIFY_<slug>.md" --note "<why>"`, or `cfn-loop-task` Step 0 will correctly reject the manifest as tampered. The re-bless appends a ledger entry naming the moved ACs and fields plus a `regate` scope; read its `predicate_changed` line before accepting an override that touched a `pass` condition, and do the `regate` work before handing off. Never re-run the whole gate for a one-row change; never skip a row `regate` names.

Override rounds are bounded at 2. Residual disagreement is a scope question, not a planning loop — surface it and stop.

**Handoff-file gate (run BEFORE writing the synthesis).** `cfn-loop-task` needs BOTH `$PDIR/PLAN_<slug>.md` (lane source) and `$PDIR/VERIFY_<slug>.md` (completion gate), in the plan dir. Assert both exist; if either is missing the megaplan is NOT done — re-run the owning step (`/write-plan` for PLAN_, Bar A for VERIFY_) before synthesis:

```bash
for F in "PLAN_${SLUG}" "VERIFY_${SLUG}"; do
  [ -f "${PDIR}/${F}.md" ] || echo "FATAL: missing ${PDIR}/${F}.md — megaplan not build-ready"
done
[ -f "${PDIR}/.VERIFY_${SLUG}.sha256" ] || echo "FATAL: missing ${PDIR}/.VERIFY_${SLUG}.sha256 — Bar A hash not blessed (re-run Step 5 static pass + hash)"
# nothing from this plan may sit loose in the planning root
ls planning/*_"${SLUG}".md 2>/dev/null && echo "WARN: plan artifacts loose in planning/ — move them into ${PDIR}/"
```

Write `$PDIR/MEGAPLAN_<slug>.md`. **All eight `##` sections below are REQUIRED** — emit every one even if empty (write `_none_`); dropping a section is a template violation. Do NOT rename headings.

```markdown
# MegaPlan: <task>
Tier: <tier>   Build flags: <frontend? db? pii? unknowns?>   Generated: <date>

## Artifacts (active phases only)
Plan dir: planning/<slug>/
<list of planning/<slug>/*_<slug>.md actually produced — MUST include PLAN_<slug>.md and VERIFY_<slug>.md>

## Gates
- Bar A verifiable-done: PASS (N ACs, FR <m/m>, EC <k/k> mapped) -> planning/<slug>/VERIFY_<slug>.md
- Bar B haiku-executable: PASS (0 findings after <r> rounds, tier=<sonnet|full>)
  # tier= is read back by cfn-loop-task 5E.6 (cli/run-ledger.sh); keep the token exact.
  # or, in a multi-plan program only: CONDITIONAL-PASS (see Cross-plan seams; blocked solely on
  # named sibling-plan items, all tracked below). CONDITIONAL-PASS is NOT a valid handoff state
  # for a standalone megaplan — a standalone plan loops its owning phase until PASS.

## Open decisions resolved
<from cfn-decide register>

## Deferred decisions
<one row per [PARKED] item from the Step 7 batch:
`phase | item | default chosen | accepted|overridden | re-gate run (none|static|full)`.
`_none_` if triage parked nothing. Every row here is a question that was kept off the critical
path on purpose — an item in this table that turns out to have been schema/contract/FR-set
affecting means the triage rule mis-classified it; fix the rule, not just the row.>

## Cross-plan seams   (multi-plan program ONLY; omit the section body with "_none — standalone plan_" otherwise)
<seam ledger rows: `owner-plan | item | target artifact/migration | dependency-critical? | applied|PENDING`.
Every PENDING row that this plan hard-depends on keeps Bar B at CONDITIONAL-PASS, not PASS.>

## Open tech debt in scope
<rows from .cfn-cache/tech-debt-ledger.json whose file/area is touched by this plan; no_trigger rows first. Empty (`_none_`) if the ledger is absent or clean. These are backlog candidates for the user, not auto-scheduled work.>

## Build order   (multi-plan program ONLY; else "_standalone_")
<this plan's position in the program DAG, e.g. MP1 -> MP2 -> [this] -> MP4>

## Next
/cfn-loop-task "<task>" --mode=<mode>   (reads planning/<slug>/PLAN_<slug>.md for lanes
                                        + planning/<slug>/VERIFY_<slug>.md as completion gate)
```

Hand-off mode mapping: mode = `standard` if tier is `beta`, else the tier verbatim. Planning tier vocabulary is mvp|beta|enterprise; execution mode vocabulary is mvp|standard|enterprise; beta maps to standard.

## Multi-plan programs (a task decomposed into N interdependent megaplans)

When one build is too large for a single megaplan and is split into sibling plans (MP1…MPn) that share a schema / contracts package / decision log, the single-plan assumptions above bend. Extra rules:

**Program directory layout.** Each sibling plan keeps its own `planning/<mpN-slug>/`. Program-scoped files (index, shared register) get one more dir at the same level: `planning/<program-slug>/`. Nothing program-scoped goes loose in `planning/` either.

1. **Program index doc.** Write `planning/<program-slug>/MEGAPLAN_program_<program-slug>.md` (or `_mp0_`) that owns what no single plan can: the build-order DAG across plans, the shared contracts/decision-register paths, and a consolidated cross-plan seam ledger (every row from every plan's `## Cross-plan seams`). Without it the reconciliation smears across each plan's prose and drifts. Each plan links back to it.

2. **Shared decision register.** All plans append to ONE register (`planning/<program-slug>/DECISIONS_<program>.md`) so a fork resolved in MP2 is visible to MP4. `cfn-decide` still owns the format; the register is program-scoped, not plan-scoped.

3. **Cross-plan seam ledger is first-class.** A seam = an item plan A needs that lives in plan B's artifacts (a column, RPC, enum member, edge). Each seam row: `owner | item | target migration/artifact | dependency-critical? | applied|PENDING`. A PENDING dependency-critical seam is a real blocker: it keeps the dependent plan's Bar B at **CONDITIONAL-PASS**.

4. **Bar B CONDITIONAL-PASS verdict (multi-plan only).** A plan whose OWN decomposition is haiku-executable but which is blocked solely on named, tracked sibling-plan seam items is **CONDITIONAL-PASS**, not PASS and not a Bar B failure to loop. It becomes a true PASS the instant every blocking seam flips to `applied`. Standalone plans never use this state — they loop the owning phase to PASS. Do NOT hand a CONDITIONAL-PASS plan to `cfn-loop-task` until its blocking seams are `applied` (re-check at the program level, per build order).

5. **Back-propagation rule (CRITICAL).** Planning a LATER plan (MP4) may discover a touchpoint that must live in an EARLIER, already-"done" plan's artifacts (MP4 forcing columns into MP1's `0001` migration). When this happens: (a) apply the item to the earlier plan's DATA/ARCH/etc. artifacts, (b) re-run that earlier plan's Bar A + Bar B, (c) update its seam ledger row to `applied`. An earlier plan that still lists forced items as "NOT yet applied" is NOT build-eligible — its own artifacts are internally inconsistent with its synthesis. A dependency-critical back-propagated item MUST ship in the earlier plan's migration (the sibling that writes it builds before the plan that consumes it), never deferred to the later plan's migration.

6. **Program build order gates execution.** `cfn-loop-task` runs per plan in DAG order (MP1 → MP2 → …). Before starting plan N, confirm every seam plan N depends on is `applied` in the plans already built. The program index doc's build-order DAG is the source of truth for this sequencing.

## Worked example: profile resolution + DAG walk

```
Task: "coach dashboard with payout table"   --tier=beta
Plan dir: planning/coach_dashboard_with_payout_table/   (every artifact below lands here)
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

Model resolution (Step 3a, from beta.json):
- opus:   spec, decide, data, arch, ux, ops   (structure-deciding, or carrying floor items)
- sonnet: research, pseudo, design, test_plan (gathering, or terminal artifacts)

DAG walk (each bracket = one message, phases in a bracket spawn in parallel):
L2  spec                          (hard barrier)
L3  [decide, pseudo]              (one message)
L4  [data]
L5  [arch, ux]                    (one message)
    WIREFRAME GATE                (frontend=yes: cfn-ux emitted a wireframe; Approve/Revise
                                  BLOCKS before L6. Approve → L6; Revise → cfn-ux patch, re-render)
L6  [design, ops]                 (one message)
L7  test_plan                     (consumes OPS §2 + DATA §6; own level below ops at beta+)
L8  write_plan                    (slash command, main chat) + Bar A
                                  static pass (check-verifiable-static.sh) + bless .VERIFY hash
                                  ASSERT planning/<slug>/PLAN_<slug>.md persisted (loop-task lane source)
L9  plan_review                   (slash command, main chat) + Bar B

Open-item triage during the walk:
- L4 data raises "retention window for payout rows?" -> DATA schema IS downstream-consumed
  (arch, ux, ops, test_plan read it) AND pii=yes makes it a floor item -> BLOCKING.
  AskUserQuestion before L5. Correct stall: answering it later would be a migration.
- L6 design raises "which breakpoint does the payout table collapse at?" -> DESIGN is terminal
  -> parked [PARKED: collapse at md (768px) | deferred: DESIGN is not downstream-consumed].
- L7 test_plan raises "should e2e cover the payout-export path?" -> TEST is terminal, no floor
  -> parked [PARKED: cover payout-export | deferred: TEST is not downstream-consumed]
  (conservative side = cover it).
Both parked items surface together in ONE AskUserQuestion at Step 7, after the bars pass.
Net: 1 human stall on the critical path instead of 3.

Hand-off: /cfn-loop-task "coach dashboard with payout table" --mode=standard
          (tier beta maps to execution mode standard)
          precondition: planning/<slug>/{PLAN,VERIFY}_<slug>.md both on disk
```

## Failure modes

| Failure | Recovery |
|---|---|
| phase agent missing | resurrect from `.claude/backups/` or fall back to `general-purpose` with the SKILL.md path in the prompt |
| spec has `[OPEN]` | surface via `AskUserQuestion` before L3 (SPEC is consumed by 7 phases — its opens are almost always BLOCKING) |
| phase escalated a terminal-artifact item as BLOCKING | re-prompt that phase once with the triage rule restated; do not forward to the user |
| phase parked something schema/contract/FR-set affecting | Bar A/Bar B catch it (they read the default as a stated assumption); fix via patch mode and correct the phase's triage row |
| Bar A fails | patch the owning phase only — not the pipeline, not a full phase re-run |
| Bar B probe returns questions | route each to its owning phase, patch it, re-probe |
| same finding survives 2 patch rounds | escalate to a full phase re-run; if that phase was downgraded in Step 3a, re-run it at `opus` |
| Step 7 override changed an AC row | re-bless with `bars/bless-verify.sh`, then do what its `regate` line owes (scoped Bar A on the named rows, Bar B on their steps, probe only on an added row) |
| Step 7 override changed a `[core]` FR | re-run full Bar A + Bar B (the bars passed against the old bytes), then re-bless with `--force-full` |
| tier ambiguous | `AskUserQuestion`, recommend from spec |
| user downgrades tier | floor items stay on; warn if a downgrade drops a phase the build flags say is needed |
| `write-plan` left no `PLAN_<slug>.md` | re-run `/write-plan`; never hand off with only `MEGAPLAN_`/`VERIFY_` — loop-task lane derivation hard-fails without `PLAN_` |
| artifact landed loose in `planning/` instead of `planning/<slug>/` | move it into `$PDIR` (`git mv`), then re-run whatever reads it. A stale flat copy left behind still resolves via the legacy fallback and will be read instead of the nested one only when the nested file is absent — delete it, do not keep both |
| reading a plan written before the per-plan dir landed | nothing to do: `plan-paths.sh resolve` falls back to flat `planning/<NAME>`. Migrate it with `mkdir -p planning/<slug> && git mv planning/*_<slug>.* planning/<slug>/` (include the dotfiles: `.VERIFY_<slug>.sha256`, `.bless.json`, `.blessed.json`) when convenient |
| sibling plan forced an item into an already-done plan | apply it, re-bless that plan's VERIFY and do its `regate` scope (Bar A on the touched rows, Bar B on their steps; probe if a row was added), flip its seam row to `applied` (back-propagation rule); do not build the earlier plan while it lists forced items unapplied |
| dependent plan blocked on sibling seam | Bar B = CONDITIONAL-PASS (multi-plan only); hold `cfn-loop-task` until blocking seams are `applied`, per program build order |

## Anti-patterns

- Running phases strictly sequentially (ignore the level batching), wastes wall-clock.
- Spawning a node before its deps return.
- Letting a tier knob disable a `floor` item (RLS/auth/secrets/PII).
- Treating Bar A/Bar B as advisory. They are hard gates.
- Stopping the pipeline to ask a question no downstream phase reads. Triage it, park it with a conservative default, batch it at Step 7.
- Parking a floor item, a schema/contract change, or any default that reduces coverage or loosens a boundary, because the section looked terminal. Triage classifies by *section*; the floor and the never-deferrable list override the section every time.
- Judging an `[OPEN]` by how important it feels. Triage is mechanical: is the section downstream-consumed, yes or no.
- Full-re-running a phase to fix two Bar findings. Patch mode exists; a re-run also churns ids downstream artifacts already cite.
- Downgrading `spec` / `data` / `arch` / `decide`-at-full to a cheaper model. They decide the structure every later phase consumes; an error there is the most expensive kind.
- Accepting a Step 7 override that rewrites an AC row without re-blessing and doing the `regate` work. The gates passed against different bytes; `cfn-loop-task` will reject the manifest.
- Re-running the WHOLE Bar A + Bar B + probe for a one-row AC change. The bless ledger's `regate` scope names the rows and steps that are owed; a full re-gate for a scoped change is the 1-hour rebless tax this scope exists to remove.
- Editing a plan step's semantics (files, done predicate, AC binding) during implementation without re-running Bar B on that step. Amendments that keep files + AC binding + done predicate are the sanctioned adaptation channel in `cfn-loop-task` (Step 2 "Bounded step amendment") and do not re-open Bar B.
- Writing any artifact loose in `planning/` instead of `planning/<slug>/`. The per-plan dir is what keeps a project with 20 plans navigable; one loose file per plan is how the flat layout came back.
- Hand-rolling the nested-then-flat lookup in a new consumer. Use `plan-paths.sh resolve` — a second copy of that logic is where the two layouts start disagreeing.
- Splitting one plan across two dirs (e.g. VERIFY in `planning/<slug>/`, PLAN loose). The handoff gate checks both in `$PDIR` for exactly this reason.
- Handing off to `cfn-loop-task` with only `MEGAPLAN_`/`VERIFY_` on disk. `MEGAPLAN_` is an index, not the lane source; loop-task needs `PLAN_<slug>.md`.
- Shipping an earlier plan that still lists back-propagated sibling items as "NOT yet applied" — its artifacts contradict its own synthesis.
- Using CONDITIONAL-PASS to hand off a standalone (non-program) megaplan. That state exists only for sibling-seam blocking in a multi-plan program.

## Related

- Phases: `cfn-research`, `cfn-spec`, `cfn-decide`, `cfn-pseudo`, `cfn-data`, `cfn-arch`, `cfn-ux`, `cfn-design`, `cfn-test-plan`, `cfn-ops`
- Gates: `bars/verifiable-done.md`, `bars/haiku-executable.md`, `bars/check-size.sh` (byte caps per `profiles/<tier>.json` `.caps`, every join)
- Layout: `lib/plan-paths.sh` (per-plan directory resolver — nested writes, nested-then-flat reads; every consumer uses it). Tests: `lib/tests/test-plan-paths.sh`
- Profiles: `profiles/{mvp,beta,enterprise}.json`
- Inputs: `cfn-tech-debt` (Step 0 reads its `.cfn-cache/tech-debt-ledger.json` so open `cfn:` shortcuts in scope surface as backlog candidates)
- Downstream: `/write-plan`, `/cfn-plan-review`, `/cfn-loop-task`
- Backlog + design rationale: `docs/PLANNING_PIPELINE_GAPS.md`
- Balanced-cut alternative: `cfn-megaplan-lite` (medium features, 3-7 files, single shared-state surface)
