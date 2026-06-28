# Planning Pipeline Gaps — Prioritized Backlog

**Scope:** Gaps in the CFN planning pipeline (`cfn-spa-plan` → `write-plan` → `cfn-plan-review` → `cfn-loop-task`).
**Generated:** 2026-06-27

## Build status — ALL WAVES COMPLETE (2026-06-27)

Implemented as `cfn-megaplan` (tiered orchestrator) + 7 new phase skills + 2 gates + 3 tier profiles. All 36 gaps have a home.

| Built artifact | Path | Gaps covered |
|---|---|---|
| Orchestrator | `.claude/skills/cfn-megaplan/SKILL.md` | DAG, tiering, entry hooks G06/G36 |
| Profiles | `.claude/skills/cfn-megaplan/profiles/{mvp,beta,enterprise}.json` | tiering model |
| Bar A verifiable-done | `.claude/skills/cfn-megaplan/bars/verifiable-done.md` | G01 |
| Bar B haiku-executable | `.claude/skills/cfn-megaplan/bars/haiku-executable.md` | G02 |
| cfn-ux | `.claude/skills/cfn-ux/SKILL.md` | G03, G26 |
| cfn-decide | `.claude/skills/cfn-decide/SKILL.md` | G04, G24, decision-log loop |
| cfn-data | `.claude/skills/cfn-data/SKILL.md` | G05, G13, G19, G22, G33 + RLS floor |
| cfn-research | `.claude/skills/cfn-research/SKILL.md` | G06, G09 |
| cfn-test-plan | `.claude/skills/cfn-test-plan/SKILL.md` | G07, G08, G20, G21 |
| cfn-design | `.claude/skills/cfn-design/SKILL.md` | G15, G16, G32 |
| cfn-ops | `.claude/skills/cfn-ops/SKILL.md` | G10, G11, G12, G14, G18, G23, G27, G28, G31 |
| write-plan ext | `.claude/commands/write-plan.md` | G29, G30 |
| cfn-plan-review ext | `.claude/skills/cfn-plan-review/SKILL.md` | G35 + Bar B wiring |
| cfn-spec ext | `.claude/skills/cfn-spec/SKILL.md` | Step 8 Build Flags (frontend/db/pii/unknowns/tier-hint) — orchestrator routing input |
| cfn-arch ext | `.claude/skills/cfn-arch/SKILL.md` | G17 (Step 9 state machines), G25 (Step 10 error taxonomy), + megaplan division-of-labor (defers storage→cfn-data, ops→cfn-ops) |

**Adoption note:** the canonical planning order in `~/.claude/CLAUDE.md` still names `cfn-spa-plan` as entry point. Switching the canonical entry to `cfn-megaplan` is a user-facing workflow change — left unedited pending user sign-off (see final next-steps).

## Two governing bars (apply to ALL plan output)

These are not phases. They are acceptance bars on every plan the pipeline emits. Build first — they govern everything downstream.

### Bar A — Verifiable-done
Every success criterion carries an executable check returning binary pass/fail. No prose criteria.
- Bad: "Test coverage ≥80%", "Security review complete".
- Good: `AC-3 | dropdown populated from courses | PASS = playwright: select#course options match SELECT name FROM courses`.
- `cfn-loop-task` gate runs the check column; done = all green. Lint rejects any AC with no executable check.

### Bar B — Haiku-executable specificity
Plan-review rejects any plan needing a judgment call. A haiku agent runs against the plan; if it asks ANY clarifying question, plan fails.
- Every file named with full path. No "the relevant component".
- Every function signature typed (args + return).
- Every UI field → explicit control type (see cfn-ux affordance map).
- Every value source named (which table / env var / constant).
- Zero "handle appropriately / as needed / figure out".
- Every PSEUDO branch maps to a named step.

## Systemic root causes

1. **Dead agents.** ~12 specialist agents exist; pipeline wires almost none (researcher, database-architect, ui-designer, security-specialist, technical-advisor, devops, accessibility-advocate, canary).
2. **Review-time checklists masquerading as design-time phases.** Security, RLS, observability, rollback, state machines are *checked late* instead of *designed early*. Design is cheaper than catch.
3. **Blind past merge.** No success metrics, rollout, lifecycle, or learning loop. Plan ends at "tests pass", not "feature works in prod and we learned".

---

## Priority list

Impact = build failures / ambiguity it kills. Effort = build cost. Both 1-5.

### P0 — Wave 1 (make output executable)

| ID | Gap | Impact | Effort | Build phase | Why |
|----|-----|:--:|:--:|---|-----|
| G01 | Verifiable-done standard (Bar A) | 5 | 2 | quality bar | Loop can't know done without it. False-done or infinite loop. |
| G02 | Haiku-executable spec bar (Bar B) | 5 | 3 | quality bar | Ambiguity = wrong build. The dropdown bug. |
| G03 | UX interaction design — field→control map, states, flows | 5 | 3 | `cfn-ux` | Derives control type from data binding. Kills dropdown-class bugs. |

### P1 — Wave 2 (cheap, high-value holes)

| ID | Gap | Impact | Effort | Build phase | Why |
|----|-----|:--:|:--:|---|-----|
| G04 | Decision register + decision-log write | 4 | 2 | `cfn-decide` | Plugs open decision-log loop. Forces tradeoff forks to user pre-lock. |
| G05 | Forward DB design — schema/indexes/RLS/migration up+down | 4 | 3 | `cfn-data` | Designed forward vs traced late. |
| G06 | KB / retro prior-art query at plan entry | 3 | 1 | entry hook | Cheapest. Stops re-solving solved problems. |
| G07 | Test-data / fixture strategy (scoped seed + cleanup) | 3 | 2 | `cfn-test-plan` | Critical given test-DB safety rules. Feeds Bar A. |
| G08 | Test-level split — unit/integration/contract/e2e/load | 3 | 2 | `cfn-test-plan` | Currently all lumped as "red phase". |
| G09 | Research / feasibility spike phase | 3 | 2 | `cfn-research` | Pipeline assumes problem understood. No "is this possible" gate. |

### P2 — Wave 3 (design depth)

| ID | Gap | Impact | Effort | Build phase | Why |
|----|-----|:--:|:--:|---|-----|
| G10 | Threat model (STRIDE) designed up front | 4 | 3 | `cfn-ops:threat` | Security is a checklist, not a design. |
| G11 | Observability design — logs/metrics/traces/alerts authored | 4 | 3 | `cfn-ops:obs` | Checkbox'd in review, never designed. |
| G12 | Rollout plan — feature flags, canary %, staged | 4 | 3 | `cfn-ops:rollout` | Wires unused `cfn-canary`. |
| G13 | Concurrency / idempotency / race design | 4 | 3 | `cfn-data` / `cfn-arch` | Major bug source, zero coverage. Retries, double-submit, ordering, locks. |
| G14 | Failure-mode / degradation design (FMEA, circuit breaker, timeout budget) | 3 | 3 | `cfn-ops` | What happens when a dep is down. |
| G15 | UI visual / layout / design-system reuse + a11y | 3 | 3 | `cfn-design` | Layers on cfn-ux. DRY for components/tokens. |
| G16 | API contract design — versioning, OpenAPI, deprecation, back-compat | 3 | 2 | `cfn-design` / `cfn-data` | ARCH does internal boundaries only. |
| G17 | State-machine design at plan time | 3 | 2 | `cfn-arch` ext | `state-machines.md` required at commit, never designed at plan. Backwards. |
| G18 | Success metrics / KPIs — prod acceptance | 4 | 2 | `cfn-ops:rollout` | How we know it worked after ship. |
| G19 | Data lifecycle — seed / backfill / retention / cleanup | 3 | 2 | `cfn-data` | Migration of existing rows, retention policy. |
| G20 | Mocking / stub strategy — what's faked vs real | 2 | 2 | `cfn-test-plan` | Boundary definition for tests. |
| G21 | Non-functional tests planned — perf/load/soak/a11y/security scan | 3 | 2 | `cfn-test-plan` | Only happy-path "red phase" today. |
| G22 | Privacy / PII / retention / compliance | 3 | 2 | `cfn-data` | New tables: what's PII, retention, beyond RLS checkbox. |
| G23 | Infra / capacity design — topology, scaling, cost-per-call (LLM tokens) | 3 | 3 | `cfn-ops` | Wires `devops-engineer` / `fly-io-specialist` at plan time. |
| G24 | Design alternatives / judge panel — score 2-3 approaches | 3 | 3 | `cfn-decide` | Single path today. No approach comparison. |
| G25 | Error taxonomy — consistent codes/shapes, single source | 2 | 2 | `cfn-arch` ext | Cross-surface error contract. |
| G26 | Analytics / telemetry events named up front | 2 | 2 | `cfn-ux` / `cfn-ops` | What user events tracked. |
| G27 | Rollback rehearsal — tested, not just named | 3 | 2 | `cfn-ops:rollout` | Rollback named in review, never exercised. |
| G28 | Runbook / on-call doc for new surface | 2 | 2 | `cfn-ops` | Operating the feature post-merge. |

### P3 — Wave 4 (polish)

| ID | Gap | Impact | Effort | Build phase | Why |
|----|-----|:--:|:--:|---|-----|
| G29 | Effort / time / token estimate on plan output | 2 | 2 | `write-plan` ext | Blockers section is a stub today. |
| G30 | Risk register — likelihood × impact × mitigation | 2 | 2 | `write-plan` ext | Structured vs ad-hoc blockers. |
| G31 | Cost model — token / API / infra spend | 2 | 2 | `cfn-ops` | Cost-safety rules exist, unused in planning. |
| G32 | i18n / localization / timezones | 2 | 2 | `cfn-design` | Cron + dates everywhere, no tz design. |
| G33 | Multi-tenancy isolation design | 2 | 2 | `cfn-data` | Where relevant. |
| G34 | Plan-cost gate — "is this plan worth it" | 2 | 1 | `cfn-spa-plan` ext | Spawns 4 SPARC agents always, no worth-it check. |
| G35 | Plan judge — quality of chosen approach vs alternatives | 2 | 3 | `cfn-plan-review` ext | Review checks completeness, not approach quality. |
| G36 | Retro → plan feedback loop | 2 | 3 | entry hook | `cfn-retro` hotspots fed forward into next plan. |

---

## cfn-ux affordance map (G03 core payload)

Root cause of the dropdown bug: nobody derived control type from data binding. Deterministic map:

| Field binding | Control | Validation |
|---|---|---|
| FK / lookup table | select / combobox (search if >20 rows) | value ∈ table |
| enum | select, or radio if ≤4 | value ∈ enum |
| boolean | toggle / checkbox | — |
| date / timestamp | date picker | range |
| free text | input / textarea | length, pattern |
| numeric range | stepper / slider | min / max |
| multi-select FK | tag / chip multiselect | each ∈ table |

Per screen, cfn-ux also enumerates: states (loading/empty/error/success/partial/disabled), flows (entry→action→result→error), affordances (clickable, disabled-when). Output feeds Bar B so the implementer can't guess wrong.

## Proposed phase consolidation

35 gaps cluster into a conditional pipeline (triggers in brackets):

```
cfn-research        [unknowns]      G06 G09
  ↓
cfn-spec
  ↓
cfn-decide          [always]        G04 G24 G34
  ↓
cfn-data            [DB touched]    G05 G13 G19 G22 G33
  ↓
cfn-pseudo
  ↓
cfn-arch            [always]        G17 G25
  ↓
cfn-ux              [frontend]      G03 G26
  ↓
cfn-design          [frontend]      G15 G16 G32
  ↓
cfn-test-plan       [always]        G07 G08 G20 G21
  ↓
write-plan          [always]        G29 G30   + Bar A (G01)
  ↓
cfn-ops             [always, light] G10 G11 G12 G14 G18 G23 G27 G28 G31
  ↓
cfn-plan-review     [always]        Bar B (G02) G35 G36
  ↓
cfn-loop-task
```

## Build sequence

- **Wave 1 (P0):** G01, G02, G03. Convert "plan looks done" → "haiku builds it right, loop knows it's done".
- **Wave 2 (P1):** G04, G05, G06, G07, G08, G09.
- **Wave 3 (P2):** G10–G28. Split `cfn-ops` into threat / obs / rollout sub-items.
- **Wave 4 (P3):** G29–G36.

**Start:** G01 (Verifiable-done) — smallest, unblocks the loop's core gap.

---

## Orchestration model (DAG, not 13-sequential)

13 named stages, but only **spec** is a hard gate. After spec, branches fan out. Critical path = 8 levels.

```
research
  ↓
spec ─────────────── hard barrier (sole true gate)
  ↓
decide  ∥  pseudo    level 3: both spec-only, independent
  ↓
data                 level 4: needs decide
  ↓
arch  ∥  ux          level 5: both consume data
  ↓
design ∥ test-plan ∥ ops   level 6: 3-way fan-out
  ↓
write-plan           level 7: JOIN — synthesizes all branches
  ↓
plan-review
  ↓
loop-task
```

Dependency DAG (node: deps):

| Node | Depends on |
|---|---|
| research | (entry) |
| spec | research |
| decide | spec |
| pseudo | spec |
| data | spec, decide |
| arch | spec, pseudo, data |
| ux | spec, data |
| design | ux |
| test-plan | spec, arch, ux |
| ops | spec, arch, data |
| write-plan | spec, decide, data, pseudo, arch, ux, design, test-plan |
| plan-review | write-plan |
| loop-task | plan-review |

Orchestrator sends each level as one batched spawn message, joins, advances. 3 parallel fan-outs (levels 3, 5, 6).

Conditional skips shorten the path: no-frontend drops ux+design; no-DB drops data; no-unknowns drops research; trivial task skips the pipeline entirely. Backend-only DB feature ≈ 6 hops; pure-logic refactor ≈ 4; full-stack new feature = full 8.

The two bars (G01 Verifiable-done, G02 Haiku-executable) are NOT levels — they are gates inside write-plan and plan-review. No extra hops.

---

## Tiering model — megaplan-mvp / beta / enterprise

The pipeline scales by build stage. `megaplan-<tier>` = the orchestrator + an inclusion profile that turns phases on/off and full/light. Extends the existing `write-plan --mode` knob across the whole pipeline.

### Three governing rules

1. **Always-on core** — spec, pseudo, write-plan, plan-review, + both bars (G01, G02). Executability is never optional. A throwaway MVP plan still must be buildable and know when it is done.
2. **Security floor never scales down** — RLS on new tables, auth boundaries, secrets handling, no-unscoped-DELETE, PII-if-present. Modeled as a floor, not a tier column, so no preset can accidentally disable it. Matches global CLAUDE.md.
3. **Progressive enrichment** — everything else scales: skip → light → full.

### Inclusion matrix

`●` full · `◐` light · `—` skip · `🔒` security floor (forced on regardless of tier)

| Phase / gap | MVP | Beta | Enterprise |
|---|:--:|:--:|:--:|
| research / feasibility | — | ◐ | ● |
| spec | ● | ● | ● |
| decide (tradeoff forks) | ◐ blocking only | ● | ● + alternatives panel |
| data: schema/indexes | ◐ basic | ● + lifecycle | ● + multi-tenancy |
| data: RLS/auth/secrets | 🔒 | 🔒 | 🔒 |
| pseudo (branches) | ● | ● | ● |
| arch | ◐ | ● | ● + error taxonomy |
| ux interaction (affordance map) | ● if frontend | ● | ● |
| design: visual/a11y | ◐ functional | ● | ● + i18n/tz |
| test-plan | ◐ happy+edge | ● +integration+contract | ● +load/soak/nonfunctional |
| concurrency/idempotency | — unless inherent | ● | ● |
| privacy/PII/compliance | 🔒 if PII present | ● | ● + legal/retention |
| ops: threat model (STRIDE) | — | ◐ | ● |
| ops: observability | ◐ errors logged | ● | ● + dashboards |
| ops: rollout/flags/canary | — | ● flags | ● + canary |
| ops: success metrics/KPIs | — | ● | ● |
| ops: failure-mode/circuit | — | ◐ | ● FMEA |
| ops: rollback rehearsal | named only | ● tested | ● |
| ops: capacity/infra/cost | — | ◐ | ● |
| ops: runbook/on-call | — | ◐ | ● |
| estimation / risk register | — | ◐ | ● |
| write-plan | ● | ● | ● |
| Bar A verifiable-done | ● | ● | ● |
| Bar B haiku-executable | ● | ● | ● |
| plan-review | ◐ bars + blast radius | ● full alpha-readiness | ● + plan judge + compliance |

### Tier meaning

- **megaplan-mvp** — prove it works. Correctness + security floor + buildability. ~7-8 active phases. Ugly-but-functional ok. No ops/rollout/compliance. Still gets ux (the dropdown bug is correctness, not polish).
- **megaplan-beta** — alpha-ready: real users behind a flag, no paging, no data loss. Adds observability, rollout, metrics, full tests, concurrency, privacy. ~16 phases.
- **megaplan-enterprise** — critical/compliance/scale. Everything full + threat model, capacity, multi-tenancy, i18n, plan judge, risk register. All 36 gaps.

### Design notes

- **ux floors at MVP** — interaction correctness ≠ visual polish. `design` (visual/a11y) scales down; `ux` (field→control, states, flows) does not.
- **Security is a floor, not a knob** — modeled as `🔒` so no preset disables RLS/auth/secrets.
- **Bars are tier-independent** — a throwaway MVP plan still must be executable + verifiable, else loop-task cannot run it.
- **Tier inferred from spec, user-confirmable** — `cfn-spec` already infers mode; megaplan reads it, confirms via AskUserQuestion when ambiguous.

---

## Profile schema (draft)

One JSON profile per tier under `.claude/skills/cfn-megaplan/profiles/{mvp,beta,enterprise}.json`. The orchestrator loads the profile, walks the DAG, and for each node reads its directive.

### Directive vocabulary

| Value | Meaning |
|---|---|
| `full` | Run the phase at full depth. |
| `light` | Run a reduced variant (phase defines what "light" drops). |
| `skip` | Do not run. |
| `floor` | Forced on; ignore tier; cannot be overridden by user downgrade. |
| `conditional:<trigger>` | Run only if trigger fires (e.g. `frontend`, `db`, `pii`, `unknowns`). Resolves to the tier's directive when the trigger is true, else `skip`. |

### Schema (JSON Schema, abbreviated)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "cfn-megaplan-profile",
  "type": "object",
  "required": ["tier", "version", "phases", "bars", "floor"],
  "properties": {
    "tier":    { "enum": ["mvp", "beta", "enterprise"] },
    "version": { "type": "string" },
    "description": { "type": "string" },
    "bars": {
      "description": "Tier-independent gates. Always full. Listed for explicitness; orchestrator hard-codes them on.",
      "type": "object",
      "required": ["verifiable_done", "haiku_executable"],
      "properties": {
        "verifiable_done":  { "const": "full" },
        "haiku_executable": { "const": "full" }
      }
    },
    "floor": {
      "description": "Security floor. Each entry is forced on regardless of tier or user downgrade.",
      "type": "array",
      "items": {
        "enum": ["rls", "auth_boundaries", "secrets_handling", "no_unscoped_delete", "pii_if_present"]
      }
    },
    "phases": {
      "description": "Directive per DAG node. Key = phase id.",
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["directive", "level"],
        "properties": {
          "directive": {
            "type": "string",
            "pattern": "^(full|light|skip|floor|conditional:[a-z_]+)$"
          },
          "level":   { "type": "integer", "minimum": 1, "maximum": 8,
                       "description": "DAG level for fan-out batching." },
          "agent":   { "type": "string", "description": "subagent_type to spawn." },
          "extras":  { "type": "array", "items": { "type": "string" },
                       "description": "Tier add-ons, e.g. alternatives_panel, multi_tenancy, i18n." },
          "drops":   { "type": "array", "items": { "type": "string" },
                       "description": "What the 'light' variant omits." }
        }
      }
    }
  }
}
```

### Example: `mvp.json` (excerpt)

```json
{
  "tier": "mvp",
  "version": "1.0.0",
  "description": "Prove it works. Correctness + security floor + buildability.",
  "bars": { "verifiable_done": "full", "haiku_executable": "full" },
  "floor": ["rls", "auth_boundaries", "secrets_handling", "no_unscoped_delete", "pii_if_present"],
  "phases": {
    "research":    { "directive": "conditional:unknowns", "level": 1, "agent": "researcher" },
    "spec":        { "directive": "full",  "level": 2, "agent": "specification-agent" },
    "decide":      { "directive": "light", "level": 3, "drops": ["alternatives_panel", "non_blocking_forks"] },
    "pseudo":      { "directive": "full",  "level": 3, "agent": "pseudocode" },
    "data":        { "directive": "conditional:db", "level": 4, "agent": "database-architect", "drops": ["lifecycle", "multi_tenancy"] },
    "arch":        { "directive": "light", "level": 4, "agent": "system-architect", "drops": ["error_taxonomy"] },
    "ux":          { "directive": "conditional:frontend", "level": 5, "agent": "ui-designer" },
    "design":      { "directive": "conditional:frontend", "level": 6, "agent": "ui-designer", "drops": ["i18n", "a11y_full"] },
    "test_plan":   { "directive": "light", "level": 6, "drops": ["integration", "contract", "load", "soak"] },
    "ops":         { "directive": "light", "level": 6, "drops": ["threat", "rollout", "metrics", "capacity", "runbook", "failure_mode"] },
    "write_plan":  { "directive": "full",  "level": 7 },
    "plan_review": { "directive": "light", "level": 8, "drops": ["plan_judge", "compliance", "full_alpha_readiness"] }
  }
}
```

`beta.json` and `enterprise.json` share the same shape; directives shift toward `full` and `extras`/`drops` adjust per the inclusion matrix. The orchestrator resolves `conditional:<trigger>` against build flags emitted by `cfn-spec` (frontend? db? pii? unknowns?), batches phases by `level`, and joins at level 7.
