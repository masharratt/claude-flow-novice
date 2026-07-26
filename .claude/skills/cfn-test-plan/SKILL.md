---
name: cfn-test-plan
description: "Test-strategy phase of cfn-megaplan. Designs test depth properly: fixtures/test-data, the unit/integration/contract/e2e/load split, mocking strategy, and non-functional tests, instead of lumping everything into a vague red phase. Feeds Bar A (verifiable-done): every acceptance criterion becomes a concrete runnable check. Use after cfn-spec, cfn-arch, and (if frontend) cfn-ux."
version: 1.1.0
tags: [planning, testing, test-strategy, fixtures, tdd, verifiable-done, megaplan]
status: production
---

# CFN Test-Plan Skill (MegaPlan Phase, DAG Level 6)

**Purpose:** Design the test depth for the build before any code exists. Decide where seed data comes from and how it is cleaned up safely, assign each acceptance criterion to the right test level (unit / integration / contract / e2e / load), define what is mocked vs real, and plan the non-functional tests. The headline output is the AC -> executable check table that Bar A (`bars/verifiable-done.md`) consumes: every SPEC functional requirement and edge case becomes a row with a runnable check command and a decidable pass condition. This phase is the upstream feeder for verifiable-done. If a criterion has no concrete check here, Bar A fails the plan.

**Phase:** Test strategy. MegaPlan DAG level 6 (runs parallel with `cfn-design` and `cfn-ops`). Always active, every tier. Joins at level 7 (`/write-plan` + Bar A).

**Scope boundary:** This phase designs the checks. It does not write production code or run the tests. `cfn-loop-task` runs the checks downstream. The output is a specification of tests, not the tests themselves.

## When to Use

- Auto-invoked by `cfn-megaplan` at level 6 (always on, all tiers).
- After `cfn-spec` (acceptance criteria + edge cases), `cfn-arch` (component contracts / boundaries), and when present `cfn-ux` (UI states each need a test).
- Standalone when adding test coverage to an existing feature, or when an AC has no runnable check.

Skip only for: single-line fixes, renames, or a bug fix that already has a reproducing test (those go straight to `/cfn-loop-task`).

## Input

Required:
- `planning/SPEC_<slug>.md` — functional requirements (FR-n), edge cases (EC-n), NFRs with thresholds, pre/post conditions. This is what you turn into checks. **`[core]`-flagged FRs are the mechanisms that must fire end-to-end; each owes an assembled-path AC row (Phase 3).** If the spec marked nothing `[core]`, emit an `[OPEN]` back to spec rather than guessing which FR is core.
- `planning/ARCH_<slug>.md` — component boundaries and interface contracts. Tells you what is a unit vs an integration seam vs a cross-service contract. **§9 (state-machine tables) supplies the SM-n valid + illegal transition rows; every SM-n row owes a transition AC in Phase 3, all tiers (ARCH Step 9 is not tier-gated).**

Optional but authoritative when present:
- `planning/UX_<slug>.md` — the field->control map and screen state table. Every UI state (loading/empty/error/success/partial/disabled) needs a test row. The field->control map drives e2e assertions (a DB-backed dropdown asserts `<select>` options == query result).
- `planning/DATA_<slug>.md` (the data-layer design). **§6 (concurrency table) supplies the CC-n rows (mechanism, entity, race scenario closed, enforcement, expected conflict behavior); every CC-n row owes a race-driving AC in Phase 3.** Present whenever the build has a concurrency mechanism (beta+ by profile, mvp when the race is inherent), presence-keyed, so those rows are charged regardless of tier. **§5 names the exact migration-rehearsal invocation** the `AC-mig` row (Phase 3) cites verbatim.
- `planning/OPS_<slug>.md` (beta+, the operations design). **§2 (observability signals) supplies the OBS-n rows, each with a criticality and a `verify: required|exempt` flag; every `verify: required` OBS-n owes a signal-firing AC in Phase 3.**

From the orchestrator you also receive:
- **Tier** — `mvp` | `beta` | `enterprise`.
- **Directive** — `full` | `light`.
- **Include extras** — e.g. `mocking_strategy`, `load`, `soak`, `nonfunctional`, `concurrency`, `adversarial_data`, `viewport_matrix`, `obs_verification`, `migration_rehearsal`.
- **Omit** — drops listed by the profile.

### Directive scope (`light` vs `full`)

The AC -> executable check table (Phase 3) and the fixture strategy (Phase 1) are floored. They never drop, any tier. Bar A cannot run without them.

- **`light` (mvp):** happy-path + edge tests only. Emit Phase 1 (fixtures), Phase 2 (level split, but only unit + e2e levels populated), Phase 3 (the AC table covering every FR and EC), Phase 6 (TDD ordering). Drop integration, contract, load, soak, and the mocking strategy (Phase 4) and non-functional tests (Phase 5).
- **`beta`:** add integration tests, contract tests, and the mocking strategy (Phase 4). Drop load and soak.
- **`enterprise` (`full`):** everything. Add load + soak + non-functional tests (Phase 5: perf, a11y, security scan), each tied to a SPEC NFR threshold.

`light` reduces breadth (which levels, which non-functional tests). It never reduces coverage: every FR and EC still gets an AC row with a runnable check, every tier.

**Presence-keyed coverage (does not drop with tier).** Some sections are gated by an upstream artifact emitting rows, not by tier. If DATA §6 emits CC-n rows, ARCH §9 emits SM-n rows, OPS §2 emits `verify: required` OBS-n rows, DATA §5 declares a reversible migration, or the build is `frontend: yes`, those rows owe AC coverage in Phase 3 regardless of directive. Tiers control whether a section is emitted at all (`adversarial_data`, `obs_verification`, and `migration_rehearsal` are beta+ extras; `concurrency` is beta+ by profile but mvp still emits §6 when the race is inherent); once emitted, every row is charged. SM-n coverage is charged every tier (ARCH Step 9 is not tier-gated).

## Protocol

### Phase 1: Test-Data / Fixture Strategy (gap G07, FLOORED)

Critical given the shared-DB safety rules. Most projects share one Supabase instance for dev and tests. Assume any `DATABASE_URL` points at production data. Design the fixtures so a test run can never touch a non-test row.

Define:

1. **Seed source.** Where each fixture row comes from: inserted by the test (preferred), a committed seed file, or a factory helper. Name the table and the columns set. No reliance on rows that happen to already exist.
2. **Marker conventions (how test data is identified).** Every test row carries a recognizable marker so cleanup can target only test rows:
   - test article / page URLs contain `example.com`
   - test workspace slugs start with `test-workspace-`
   - test emails match `integration-test%` or `test-%@integration.test`
   - any new entity gets a documented marker in the same style (state it explicitly in the artifact).
3. **Scoped cleanup (MANDATORY).** Every `DELETE FROM` in test teardown MUST have a `WHERE` clause that targets only test-created rows via the marker. Never write an unscoped `DELETE` or `TRUNCATE`. Never disable FK checks (`session_replication_role = 'replica'`) to work around ordering. Scoped deletes with `CASCADE` handle ordering naturally. If cleanup needs an unscoped delete, the fixture design is too broad. Redesign it.

   Example teardown (scoped, safe):
   ```sql
   DELETE FROM bookings WHERE workspace_slug LIKE 'test-workspace-%';
   DELETE FROM courses  WHERE name LIKE 'test-%';
   ```
4. **Isolation strategy.** Insert known rows, assert against them, delete only those rows. State whether tests run serially or in parallel, and if parallel, how markers keep runs from colliding (e.g. per-run suffix on the slug: `test-workspace-<run-id>`).

The artifact must list every fixture table, its marker, and its scoped cleanup `WHERE` clause. A fixture with no marker or an unscoped delete is a hard defect in this phase.

### Phase 1b: Adversarial-Data Fixture Class (`adversarial_data` extra, beta+, gap G51)

Emit this subsection when `adversarial_data` is in extras (beta+). It is **REQUIRED** (not optional) whenever the SPEC build flag `frontend: yes` OR any free-text field appears in the DATA §2 field-bindings table. A rendering surface or a free-text sink is exactly where hostile input lands. The hostile-value catalog comes from `cfn-spec` Step 4 (the Data-quality / Locale-i18n "look for" cells).

Pin one row per hostile class, this exact header:

```
| ADV-id | Class (unicode-emoji-rtl|oversized-10k|html-script-content|zero-rows|high-row-count) | Exact value/generator | Target field/screen state | Asserts (exact: escaped render, no <script> element, layout intact, pagination fires) |
```

All 5 classes are required. A class that genuinely cannot apply to this build is written as `n/a: <reason>` (e.g. `n/a: no list view, high-row-count moot`), never silently dropped. Every ADV-id row owes >=1 AC in Phase 3: its check drives the hostile value through the real render/persist path, its pass condition is the exact assert from the last column (escaped render, no `<script>` element in the DOM, layout intact, pagination fires), never "handles gracefully".

**Tier note (verbatim).** `adversarial_data` is a beta+ extra, NOT floored. Injection / XSS is already floored via the always-on spec EC path: mvp tests the injection EC at unit level; beta+ adds the full fixture class (all five hostile classes as fixtures). The floor enum is unchanged; this subsection widens breadth at beta+, it does not add a new security floor.

### Phase 2: Test-Level Split (gap G08)

For each acceptance criterion, assign the right level. Stop lumping everything into one "red phase". Define what each level covers in this build:

| Level | Covers | Real vs mocked | Speed |
|---|---|---|---|
| unit | one function / module, pure logic, branch coverage | all deps mocked | fastest |
| integration | a module against a real dependency (DB, real internal service) | real DB (scoped fixtures), real internal modules | medium |
| contract | the shape of a cross-service / cross-module boundary (API request/response, payload schema) | schema asserted, counterpart may be stubbed | medium |
| e2e | full user flow through the running app (UI + API + DB) | everything real | slowest |
| load | throughput / latency under concurrent load | real or staging | slow |

Rules:
- A pure-logic FR or EC -> unit. A boundary that crosses a service or persists state -> integration or contract. A user-visible flow or UI state -> e2e. An NFR with a throughput/latency threshold -> load.
- **An FR the spec tagged `[boundary]` MUST be assigned `integration`** (not contract, not unit). Contract only checks payload shape; it cannot catch ordering/filter/limit/status-dependent behavior at the seam. This is non-negotiable: Bar A's `boundary_fr` counter FAILs any `[boundary]` FR whose mapped ACs include no `kind: integration` row.
- Every UI state from `UX_<slug>.md` (loading/empty/error/success/partial/disabled) gets at least one e2e or component test row.
- Push detail down: prefer a fast unit test over a slow e2e when the criterion is logic, not flow. Reserve e2e for what only the full stack can verify.
- **Concurrency rows (CC-n) map to integration, never a new level (gap G47).** Each CC-n row from DATA §6 becomes an **integration** entry in the FR/EC->level table (real DB, real constraint), tagged with its CC-n id so the binding is greppable. There is no "concurrency" test level: the race is proven at the integration level against the real constraint/lock. The greppable token is the CC-n binding, not a level name. The AC that drives the race is written in Phase 3.
- Output a table mapping each FR/EC to its assigned level, so Phase 3 knows which runner each check uses. CC-n rows appear here tagged with their CC-id.

### Phase 3: AC -> Executable Check Table (THE Bar A feed, FLOORED)

This is the payload Bar A consumes. Every SPEC functional requirement (FR-n) and edge case (EC-n) gets at least one AC row. The row shape is exactly what `bars/verifiable-done.md` parses:

```
| AC-id | criterion (plain) | binding (source of truth) | check (executable) | pass condition |
```

Rules (match Bar A exactly):
- **check** is a command an agent can run that exits 0 (pass) or non-zero (fail), and matches one check-taxonomy form below. No prose.
- **pass condition** is a decidable predicate. No "appropriately", "as needed", "handles gracefully", "etc".
- **binding** names the source of truth: a SPEC EC id, an RLS policy name, a DB query, a contract schema.
- Every FR-n and every EC-n maps to >=1 AC row. Bar A fails the plan on any unmapped FR/EC.

**Runnable-check rules (S007 — every one of these caused field reds against CORRECT code).** `verify-run.sh` executes the `check` string verbatim, so it must be an invocation the runner actually accepts:

- **Never `<file>::<testname>`.** No runner implements it; vitest and playwright read it as a filename and report "No test files found". Use `-t "NAME"` (vitest/jest), `-g "NAME"` (playwright), `NAME -- --exact` (cargo). One field manifest used the `::` shorthand in 89 of 104 checks.
- **Name tests that exist.** Copying a test name out of the plan when the implementation named it something else produces a filter matching zero tests. `cargo test` and `vitest -t` both exit **0** on a zero match, so nothing but the summary line catches it.
- **`cwd`** — set the manifest-level `"cwd": "<subdir>"` (or per-AC `cwd`) whenever the runner config lives in a subdirectory. Playwright cannot run from a monorepo root when two `@playwright/test` versions resolve.
- **`requires`** — declare live infrastructure the check needs: `{"env": ["RUN_INTEGRATION=1", "DATABASE_URL"], "db": true, "http": "http://localhost:3800/"}`. `NAME=value` is exported into the check, bare `NAME` is asserted present. An unmet precondition reports `blocked`, never red, so absent infra cannot masquerade as a broken feature. Omit `requires` entirely for checks that need nothing.
- **`evidence` (REQUIRED)** — the check's actual output. This phase runs before the code exists, so every row you emit carries `"evidence": "PENDING: <reason>"`; the field is never omitted and never empty. `cfn-loop-task` 5E.3a backfills the real output from the exit-gate run and re-blesses with `--stage exit`, which rejects any surviving `PENDING`. When you write a check against code that ALREADY exists (standalone use of this skill, adding coverage to a shipped feature), run it now and paste the real output — Bar A fails `evidence_zero_ran` if the pasted runner summary shows zero tests collected. This is the only thing in the pipeline that forces a check authored against the plan to be reconciled with the code.
- **`--ignored` only on `#[ignore]` tests.** Passing it to a plain `#[test]` filters that test out and the run collects zero.

**Assembled-path requirement (FLOORED, every tier).** Every FR the spec marked `[core]` (the mechanism that must actually fire for the feature to exist) gets **>=1 AC row whose check drives the fully-assembled path through the running system**: real trigger -> real wired entry point -> observable outcome. This row is *in addition to* any unit rows for the same FR. A `[core]` FR covered only by the shortcut checks below is a hard defect in this phase — Bar A treats an unmet assembled-path requirement like an unmapped FR. (If the spec marked nothing `[core]`, raise an `[OPEN]` back to spec; do not guess.)

Three banned shortcuts for a `[core]`-FR assembled-path row (each is how a green gate ships a dead feature):

- **Wiring stub.** Calling a private/inner fn directly (`publish_due_tick()`, a route handler fn, a job body) while nothing asserts that fn is registered / spawned / mounted / routed into the running process. The row must exercise the REAL entry point (the spawned worker, the mounted route, the registered handler) and observe the outcome. Add a cheap source/bootstrap guard AC that the wiring call exists (e.g. `grep`/AST assert `lib.rs` spawns the worker) so it cannot be deleted silently. An unregistered worker or unmounted route passes every direct-fn test.
- **Self-seeded seam.** A handoff test that seeds the data the UPSTREAM stage was supposed to write (a worker-read test that inserts the `metadata` the handler should have persisted). The row must let the REAL upstream stage produce that data, then assert the downstream stage consumes it. Each half tested in isolation does not prove the join; a dropped upstream write stays green.
- **Shallow assertion.** A pass condition of "does not throw" / "element exists" / "compiles" / "renders shell" on core logic. A stub returning blank/empty passes. Assert the actual output **content**, the state transition, or the persisted value (rendered DOM contains the field's label AND value; the `<select>` option set equals the query result; the row's status flips to `published` and `published_at` is set).

**Runtime-observed form (out-of-band core mechanisms).** When a `[core]` FR's trigger fires in a spawned worker, cron job, queue consumer, or any async path the caller does not directly await, its assembled-path row should be the **runtime-observed** form: the check reads a concrete runtime signal the real process emits for the test's own input — a log line, telemetry/metric event, or audit row. This is the codified "watch it work in the logs": the machine asserts the exact signal a human would have eyeballed, so a silently-dead async worker cannot pass. Two obligations attach:
- **The signal must be a planned deliverable.** You cannot assert a log line or metric no implementation step emits. If the runtime-observed row needs `log.info("published story=<id>")` or a `stories_published_total` counter, add that emit as an explicit step in the plan (and in Phase 6 ordering) — otherwise the row is untestable and becomes an `[OPEN]`.
- **Sequence it late, never as the first red test.** A runtime-observed check needs the emitting code AND the assembled process running; it belongs at the integration/e2e stage after the wiring exists, not as a pre-code failing unit test. In Phase 6, order it after the unit reds and the wiring-guard step for the same FR. Do not place any check that requires a deploy or a fully-assembled runtime ahead of the steps that build that runtime — a check that can only run post-assembly is sequenced post-assembly.

**Flip test** for each `[core]` FR before you accept its rows: *"Could a hand-written stub that does nothing real pass every check on this FR?"* If yes, the assembled-path row is missing or shortcut-ed. Fix it here — this is exactly the class of miss that survives to prod.

**Input-correlation requirement (rule f — CQR gap #1).** When a `[core]` FR's input is externally produced / non-deterministic (LLM structured output, free-text, webhook/queue payload — the spec lists it in `core_fr_requires_input_correlation`), its assembled-path AC must seed a concrete marker into the upstream input and assert that marker surfaces in the observed output. Declare `seeds: "seed:<TOKEN>"` and reference TOKEN in `pass` (e.g. inject a fact id into the LLM prompt fixture, assert it surfaces in the spoken turn). A handler that returns a literal/constant — a hand-built `TierCOutput { action: Deepen, used_fact_ids: vec![] }` — satisfies `action == Deepen` but cannot reproduce a seeded fact id; the correlation is what proves the handler parsed the upstream input. This is the semantic-substitution sibling of the three wiring shortcuts above: those catch a component wired wrong; this catches a component wired right but internally constant. Bar A rule (f) FAILs a listed FR whose mapped ACs seed no token or fail to reference it.

**Boundary integration requirement (CQR gap #2).** Every FR the spec tagged `[boundary]` owes ≥1 AC of `kind: integration` whose check drives the REAL persistence/service boundary — a live DB query, a real HTTP call — and asserts the boundary-dependent semantic (ordering position, filtered row set, excluded-status absence, limit hit). A builder-isolation unit test with an in-memory `Vec` does NOT count: it cannot detect that the DB `ORDER BY` inverts the order the builder assumes. Bar A's `boundary_fr`/`boundary_fr_integration_ok` counter FAILs any `[boundary]` FR whose mapped ACs include no `kind: integration` row, even if the author declared it ok.

**Concurrency coverage (CC-n rows, presence-keyed all tiers, gap G47).** Every CC-n row from DATA §6 maps to >=1 AC whose check DRIVES the race, not one that merely unit-tests the key generator. Match the check to the row's "race scenario closed" column:
- **double-submit**: the AC fires the real trigger twice (two requests / two invocations of the assembled path) and asserts exactly-one-row persisted OR the exact conflict behavior from the row (e.g. `409 DUPLICATE`, second insert rejected by the unique constraint).
- **parallel-write**: the AC launches two concurrent writers against the real DB and asserts the optimistic/pessimistic lock rejects one, with the exact expected behavior from the row.
- **retry-refire**: the AC replays the same idempotency-keyed request and asserts an identical result with no duplicate row.

A unit test of the key-generation function alone is a **wiring-stub-class defect** (the race is never exercised); the constraint or lock must fire against the real DB. These rows are integration level (Phase 2). Bar A fails the plan on any unmapped CC-n.

**State-machine transition coverage (SM-n rows, ALL tiers, gap G48).** ARCH Step 9 is not tier-gated, so SM-n coverage is charged every tier. For each SM-n row from ARCH §9:
- a **valid-transition** row emits an AC that drives the real trigger and asserts the **persisted state flip** (the entity's status/state column equals the `To` value after the trigger). Never "does not throw".
- an **illegal-transition** row emits an AC that attempts the transition and asserts the **exact rejection** from the row's rejection-behavior column (the named error code / HTTP status / exception).

Level per SM-n: **unit** if the transition is a pure reducer (no persistence), **integration** if the state is persisted, **e2e** only when the trigger is UI-only. Bar A fails the plan on any unmapped SM-n (an illegal transition reachable in prod is an edge-case-class miss, already hard-failed).

**Wiring coverage (WIRE-n rows, MANDATORY, all tiers) — the composition-root guard.** For **every component ARCH §1 (Components) enumerates**, emit one `WIRE-n` row and one AC whose check greps the ARCH-named composition root file(s) (ARCH §1) for a **non-optional** construction + injection of that component, asserting offender-count == 0 (i.e. exactly the required, non-optional wire is present; zero occurrences of the component being constructed nowhere, or injected only behind a `?`). This is the inverse of the existing import-graph guard: prove the wire EXISTS, not that a forbidden import is absent. The `wiring_total`/`wiring_mapped` manifest keys are required on every VERIFY manifest, even when zero (see below) — omitting them is no longer a silent pass. Row shape:

```
| WIRE-id | Component | Composition root file | Check (grep/AST on the composition root) | Pass condition |
|---|---|---|---|---|
| WIRE-1 | ThreadManager | src/index.ts | grep -c 'createThreadManager(' src/index.ts && ! grep -q 'thread?:' src/poll-loop.ts | count >= 1 in src/index.ts AND src/poll-loop.ts declares the dependency non-optional (no `thread?:`) |
```

Kind is `wiring-guard` (a member of the `static/lint` family: grep/AST assertion). Every `WIRE-n` row maps to >=1 AC; Bar A's `wiring_total`/`wiring_mapped` counter pair (`bars/verifiable-done.md`) is a REQUIRED manifest key pair, not presence-keyed like `cc_total`/`sm_total` — a manifest that omits the pair FAILS outright, and FAILS on any unmapped row when present. If the build genuinely introduces zero new composition-root components, emit `wiring_total: 0` / `wiring_mapped: 0` together with a non-empty `no_new_components_reason` string; a bare zero with no reason also FAILS.

**Flag-tautology trap (do not write a wiring AC this way).** Never gate a `WIRE-n` check's runner behind the SAME feature flag that defaults the feature off (`describe.skipIf(!FEATURE_ENABLED)` when `FEATURE_ENABLED` defaults false) — the check self-skips and skipped counts as green, which is precisely how the MP-A thread-manager wiring guard (AC-77) shipped a dead feature 81/81 green (`/home/masha/projects/daily-agents/planning/ROOTCAUSE_mpa_thread_wiring_gap.md`). A `WIRE-n` check is a static grep against source, not a runtime test gated by the feature flag it is meant to guard — it must run and assert unconditionally. `bars/check-verifiable-static.sh` WARNs (does not hard-fail; this is not fully mechanizable in bash) when a wiring AC's check/pass/trigger references an apparent feature/env-flag token; treat any such WARN as a required manual check in the step-6a gate report, not noise to suppress.

Level: **static** (source grep/AST against the composition root file directly checked into the repo — no runner, no fixtures, no DB). Bar A fails the plan on any unmapped `WIRE-n`.

**Observability verification (OBS-n rows, beta+, gap G49).** Every OBS-n row from OPS §2 flagged `verify: required` maps to >=1 AC that asserts the signal fires FOR THE TEST'S OWN INPUT: capture the structured-log sink (assert the exact line for the seeded id) or read the metric counter delta (assert `+1` for the operation the test performed). This generalizes the runtime-observed machinery above beyond `[core]` FRs: any required signal (an alert-backing threshold, an on-call query field, a Phase-4 KPI/guardrail, or a runtime-observed signal of a core FR) owes a firing assertion. `verify: exempt` rows (debug logs, diagnostic-only) owe nothing. As with runtime-observed core rows, the emit must be a planned deliverable (Phase 6) and the check sequences at the assembled / runtime-observed stage, never as the first red.

**Migration rehearsal (AC-mig row; db + reversible + beta+, gap G50).** When the SPEC db flag is set AND DATA §5 declares a reversible migration AND tier is beta+, emit one `AC-mig` row. Its **check** is the DATA §5 rehearsal invocation verbatim:

```
CFN_SCRATCH_DATABASE_URL=<scratch> ./.claude/skills/cfn-migration-rehearsal/execute.sh --up <NNNN.up.sql> --down <NNNN.down.sql>
```

Its **pass condition** is exit 0 with an empty schema-diff (up and down are proven inverses). If no scratch database is available, emit an explicit **WARN row** stating why (`warn: no CFN_SCRATCH_DATABASE_URL, rehearsal deferred`), never silently drop the row. An irreversible migration is `n/a: <reason from DATA §5>`. The rehearsal never runs against `DATABASE_URL` (the skill itself refuses anything that looks like prod).

**Viewport matrix (frontend, gap G46).** When the SPEC build flag `frontend: yes`, every e2e check names its viewport via the playwright project token `--project=<viewport>`. The two named projects are `mobile-375` (375x667) and `desktop-1280` (1280x720). Decision source is the `cfn-design` per-breakpoint table (a layout change at the small breakpoint means both viewports matter).
- **mvp:** 1 viewport, `desktop-1280`, or `mobile-375` if the spec is mobile-first.
- **beta+:** every user-flow e2e AC runs at BOTH viewports (one AC row per `--project`). A component-scoped AC may pin a single viewport with a one-line reason. A screen marked "No change" at all breakpoints in the DESIGN table still needs >=1 smoke AC at the second viewport.

Template AC row (mobile viewport):
```
| AC-14 | booking flow renders on mobile | UX flow + DESIGN bp.sm | npx playwright test tests/booking.e2e.ts -g "flow" --project=mobile-375 (via cfn-e2e) | test green at 375x667: form single-column, Submit reachable |
```
**WSL2 note:** viewport variants are SEPARATE test entries for cfn-e2e batch sizing, never parallel browser pools. Each `--project` run is its own entry the e2e batcher sizes independently; do not spawn a concurrent browser pool per viewport (memory).

Check taxonomy (pick one per AC):

| Kind | Form | Example |
|---|---|---|
| unit / integration test | `<runner> run <file> -t "<case>"` | `vitest run tests/email.spec.ts -t "rejects_invalid"` |
| e2e / UI | `npx playwright test <file> -g "<case>"` (run via cfn-e2e in WSL2); the assertion is stated in the pass-condition column | `npx playwright test tests/booking.e2e.ts -g "course_is_select"` |
| DB state | `db-query` SQL + expected rows | `SELECT ... returns N` |
| HTTP | `curl` + status / body assertion | `curl -s /api/x \| jq .ok == true` |
| build / type | `tsc --noEmit` / `cargo check` exit 0 | compile clean |
| static / lint | grep / ast assertion | `no occurrences of <antipattern>` |
| wiring-guard | grep / ast assertion on the ARCH-named composition root: proves a non-optional construction + injection EXISTS (inverse of the import-graph guard) | `grep -c 'createThreadManager(' src/index.ts` -> count >= 1, AND dependency type has no `thread?:` |
| migration-rehearsal | the DATA §5 rehearsal invocation verbatim (up+down round-trip against a scratch DB) | `CFN_SCRATCH_DATABASE_URL=<scratch> ./.claude/skills/cfn-migration-rehearsal/execute.sh --up 0007.up.sql --down 0007.down.sql` -> exit 0, empty schema-diff |
| assembled-path | real trigger through the running system — no direct-fn call, no self-seed, no no-throw | spawned worker publishes a seeded due row within one interval; builder-saved options render as the exact `<select>` set; source guard asserts the worker is registered in bootstrap |
| assembled-path (runtime-observed) | strongest form — assembled-path check that ALSO reads the runtime signal a human would have watched in the logs: a specific log line, telemetry/metric event, or audit row emitted by the real process for the test's own input | worker logs `published story=<id>` and test captures the structured-log sink / stdout and asserts the line for the seeded id; handler bumps `stories_published_total` and test reads the counter delta |

For a DB-backed dropdown the check is a playwright snapshot asserting the `<select>` option set equals the `SELECT` query result. See the worked example below.

Test commands written into checks must follow the capture convention when run in a shell: `OUT=/tmp/test-${PWD##*/}-$(date +%s).txt`, pipe `2>&1 | tee "$OUT"`, verbose reporter, `vitest run` (no watch), no `-x` / `--bail`. State this once in the artifact; individual rows can name the runner + case tersely.

### Phase 4: Mocking / Stub Strategy (beta+ extra, gap G20)

Only when `mocking_strategy` is in extras (beta and enterprise). Define the boundary: what is faked vs real, and why.

For each external or expensive dependency, one row: dependency, real-or-mocked per level, the seam where the mock is injected, and the fidelity (does the mock assert the real contract shape).

Rules:
- **Unit level mocks all deps.** **Integration level uses the real DB** with scoped fixtures from Phase 1. **e2e mocks nothing internal.**
- Never mock the thing under test. Mock its collaborators.
- Third-party / paid APIs (LLM providers, payment, email) are mocked below e2e; if an e2e must hit a real external, gate it behind a flag and a budget cap.
- A mock must assert the same contract shape the real dependency returns (ties to the contract tests in Phase 2). A mock that drifts from the real shape hides integration bugs.

Omit this phase entirely when not in extras (mvp).

### Phase 5: Non-Functional Tests (enterprise extra, gap G21)

Only when `nonfunctional` / `load` / `soak` are in extras (enterprise). Each test names a threshold pulled directly from a SPEC NFR. No threshold from the spec means no test (and an `[OPEN]` back to spec).

| Test | Threshold (from SPEC NFR) | Check |
|---|---|---|
| perf | NFR-n p95 latency budget | load tool asserts p95 < budget under stated RPS |
| load | NFR-n throughput at concurrency | sustained N RPS, error rate < threshold |
| soak | NFR-n stability over duration | run M minutes, assert no memory growth / no error-rate climb |
| a11y | NFR-n WCAG level | axe scan asserts 0 violations of the named level |
| security scan | NFR-n (auth / injection / headers) | scanner asserts 0 high findings; RLS cross-tenant query returns 0 rows |

Each non-functional test also becomes an AC row in Phase 3 (its check column is the scan/load command, its pass condition is the threshold). Non-functional criteria are verifiable-done like any other.

### Phase 6: TDD Ordering (REQUIRED, all tiers)

No implementation without a failing test. For each implementation step the plan will produce, name the failing test written first.

- For each FR / step: name the test file + case that must be written and must fail before the production code is written (red), then pass after (green).
- **Bug fixes start with a reproducing test.** If this build includes a bug fix, name the reproducing test that fails with the current bug and passes after the fix. The test name references the bug.
- Order the tests so each maps to one named implementation step from the plan. This list is what `cfn-loop-task` uses to enforce test-first.
- **Observability (OBS-n) and concurrency (CC-n) rows sequence late.** An OBS-n firing assertion needs the emit code plus the assembled process, so it lands at the assembled / runtime-observed stage exactly like a core runtime-observed row (never the first red). A CC-n race-driving check needs the real constraint in a real DB, so it lands at the integration stage after the schema/constraint exists. Mark each with its stage.
- **Assembly-dependent checks sequence last, by construction.** A check runs at the earliest step whose code makes it *runnable*, never before. Unit reds come first (pure logic, no wiring). The wiring-guard (source/bootstrap grep) lands with the step that registers/mounts/spawns the mechanism. The assembled-path row — and especially the **runtime-observed** row that reads a log/telemetry signal — comes last for that FR: it needs the emit code plus the assembled process, so it cannot be the first red and must not gate a step that ships before the runtime exists. If a `[core]` FR's runtime-observed check depends on a signal emit, that emit is its own ordered step that precedes the check. Rule of thumb: never place a check that requires a deploy or a running assembled system ahead of the steps that build that system. Mark each Phase 6 row with the stage it becomes runnable (unit / wiring / assembled / runtime-observed) so the loop cannot run a post-assembly check pre-assembly.

## Output

Write to: `planning/TEST_<slug>.md`

Template:
```markdown
# Test Plan: <task>

**Date:** <YYYY-MM-DD>
**Spec:** planning/SPEC_<slug>.md
**Arch:** planning/ARCH_<slug>.md
**UX:** planning/UX_<slug>.md (or "n/a — backend only")
**Tier:** <mvp|beta|enterprise>   **Directive:** <full|light>
**Status:** draft | reviewed | locked

## Test output capture
OUT=/tmp/test-${PWD##*/}-$(date +%s).txt ; <runner> ... 2>&1 | tee "$OUT"
Verbose, no watch, no bail. Read $OUT for full failures.

## 1. Fixtures / Test Data
| Table | Seed source | Marker | Scoped cleanup (WHERE) |

## 1b. Adversarial-Data Fixtures  (beta+; frontend flag OR free-text DATA §2 field)
| ADV-id | Class (unicode-emoji-rtl|oversized-10k|html-script-content|zero-rows|high-row-count) | Exact value/generator | Target field/screen state | Asserts (exact) |

## 2. Test-Level Split
| FR/EC | Level | Runner |
(CC-n concurrency rows appear here as integration entries tagged with their CC-id.)

## 3. Acceptance Criteria -> Executable Checks  (Bar A feed)
| AC-id | criterion | binding | check | pass condition |
Coverage: FR <m/m> mapped, EC <k/k> mapped, CC <j/j> mapped, SM <k/k> mapped, OBS-required <m/m> mapped, ADV <n/n> mapped, migration_rehearsal <AC-mig|warn:r|n/a:r>, viewport <ok|MISSING>.
(Report only the sections that emitted rows; a section with no rows is `n/a`. e2e ACs name `--project=mobile-375` / `--project=desktop-1280`.)

## 4. Mocking Strategy  (beta+ only)
| Dependency | Unit | Integration | e2e | Injection seam | Contract fidelity |

## 5. Non-Functional Tests  (enterprise only)
| Test | Threshold (SPEC NFR) | Check |

## 6. TDD Ordering
| Step | Failing test written first | Runnable at (unit/wiring/assembled/runtime-observed) | Red -> Green |

## Open Items
- [OPEN] <criteria with no runnable check, missing NFR threshold, ambiguous binding>
```

### Output example: course booking form (consistent with cfn-ux)

Same feature as the `cfn-ux` example. The `course` field is FK -> `public.courses`, so it is a dropdown; the test asserts the rendered `<select>` options equal the DB query result. This is the dropdown-class bug turned into a runnable check.

**1. Fixtures**

| Table | Seed source | Marker | Scoped cleanup (WHERE) |
|---|---|---|---|
| courses | inserted by test | name `LIKE 'test-%'` | `DELETE FROM courses WHERE name LIKE 'test-%'` |
| workspaces | inserted by test | slug `LIKE 'test-workspace-%'` | `DELETE FROM workspaces WHERE slug LIKE 'test-workspace-%'` |
| bookings | inserted by test (FK to above) | via workspace slug | `DELETE FROM bookings WHERE workspace_slug LIKE 'test-workspace-%'` |

Cleanup order is child -> parent, or rely on `CASCADE`. No unscoped delete, no FK-check disable.

**2. Test-Level Split**

| FR/EC | Level | Runner |
|---|---|---|
| FR-1 course list populated from courses table | e2e | playwright |
| FR-2 booking persists | integration | vitest + real DB |
| EC-4 invalid email rejected | unit | vitest |
| EC-7 seats > capacity blocked | unit | vitest |
| UX empty-state (no active courses) | e2e | playwright |

**3. Acceptance Criteria -> Executable Checks**

| AC-id | criterion | binding | check | pass condition |
|---|---|---|---|---|
| AC-3 | course field is a dropdown sourced from the courses table | DB: `SELECT id, name FROM courses WHERE active` | `npx playwright test tests/booking.e2e.ts -g "course_is_select"` (via cfn-e2e) | test green: `select#course` is a `<select>`, option set == query result, 0 free-text inputs |
| AC-4 | booking row persists with the selected course | ARCH booking service contract | `vitest run tests/booking.int.ts -t "persists"` (real DB, scoped fixture) | test green, row present with marker |
| AC-7 | invalid email is rejected | spec EC-4 | `vitest run tests/email.spec.ts -t "rejects_invalid"` | test green |
| AC-9 | seats above course capacity blocked | spec EC-7 | `vitest run tests/seats.spec.ts -t "over_capacity"` | test green, returns 400 SEATS_EXCEEDED |
| AC-12 | empty course list shows "No courses available" + disabled Submit | UX empty state | `npx playwright test tests/booking.e2e.ts -g "empty_state"` (via cfn-e2e; fixture: 0 active courses) | test green: banner text "No courses available" present, `button#submit[disabled]` |

Coverage: FR 2/2 mapped, EC 2/2 mapped, UX states mapped, CC n/a (no concurrency mechanism), SM n/a, OBS-required n/a (mvp), ADV n/a (mvp), migration_rehearsal n/a, viewport ok (mvp: desktop-1280).

**6. TDD Ordering**

| Step | Failing test written first | Runnable at | Red -> Green |
|---|---|---|---|
| reject invalid email | `tests/email.spec.ts` › `rejects_invalid` | unit | fails (accepts) -> passes |
| block over-capacity | `tests/seats.spec.ts` › `over_capacity` | unit | fails (allows) -> passes |
| render course select | `tests/booking.e2e.ts` › `course_is_select` | assembled | fails (no select) -> passes |

## Handoff

`TEST_<slug>.md` feeds two consumers:
- **Bar A** (`bars/verifiable-done.md`) at level 7 — parses the Phase 3 AC table directly. It emits `planning/VERIFY_<slug>.md` (the `done = all checks green` manifest). If any AC has no executable check, or any FR/EC is unmapped, Bar A fails the plan and loops back to this phase.
- **`/cfn-loop-task`** downstream — reads the VERIFY manifest, runs each check, and reports done only when every AC is green. It also enforces the Phase 6 TDD ordering (test-first per step).

## Return (to orchestrator)

**Coverage self-check (self-enforcing floor).** Before returning, recompute coverage from the section 3 table. REFUSE to return unless every emitted category is fully mapped: FR `m/m`, EC `k/k`, CC `j/j` (DATA §6 rows), SM `k/k` (ARCH §9 rows), OBS-required `m/m` (OPS §2 `verify: required` rows), ADV `n/n` (Phase 1b rows). For a shortfall, either add the missing AC rows or convert each unmappable criterion into an `[OPEN]` item naming why no runnable check exists. A return with any emitted category mapped short is invalid output. Presence-keyed: a category with zero emitted rows is `n/a` and does not block; a category that emitted rows owes full coverage regardless of tier.

Return exactly:
- Artifact path: `planning/TEST_<slug>.md`
- A 3-line summary (fixtures + markers defined, levels assigned, AC rows with FR/EC coverage count).
- Coverage line: `FR <m/m> mapped, EC <k/k> mapped, CC <j/j> mapped, SM <k/k> mapped, OBS-required <m/m> mapped, ADV <n/n> mapped, migration_rehearsal <AC-mig|warn:r|n/a:r>, viewport <ok|MISSING>` (each category full or accompanied by the `[OPEN]` items that explain the shortfall; report `n/a` for any category with no emitted rows). These feed the Bar A coverage keys `cc_total/cc_mapped`, `sm_total/sm_mapped`, `obs_required_total/obs_required_mapped`, `adv_total/adv_mapped`, `migration_rehearsal`, and the `viewport_missing` warn.
- Any `[OPEN]` items needing a user decision (criterion with no runnable check, missing NFR threshold, ambiguous binding).

## Anti-Patterns

- **Prose criterion with no check.** "Test coverage >=80%", "security review complete", "works correctly", "handles errors gracefully". Bar A rejects every one. Each AC must carry a runnable check + decidable pass condition.
- **Unscoped test cleanup.** Any `DELETE FROM` or `TRUNCATE` without a marker `WHERE` clause. Wipes production data on a shared DB. Every cleanup targets only test-created rows.
- **Disabling FK checks to fix cleanup ordering.** `session_replication_role = 'replica'` means the cleanup is too broad. Use scoped deletes with `CASCADE`.
- **"Add tests after".** Tests are designed here, before code, and written failing-first (Phase 6). No implementation without a failing test.
- **Happy-path only.** Every EC from the spec and every UI state from UX gets a check, not just the success flow.
- **Wiring stub passes while the feature is dead.** Every check on a `[core]` FR calls the inner fn directly; nothing asserts it is registered / spawned / mounted / routed into the running process. An unregistered worker or unmounted route ships green. Each `[core]` mechanism needs one assembled-path row + a wiring guard.
- **Self-seeded seam.** A handoff test seeds the data the upstream stage should have produced, so a dropped upstream write stays green. Let the real upstream write it; assert the downstream reads it.
- **"No throw" / "exists" on core logic.** "renders without throwing", "endpoint defined", "component exists", "compiles" — a hollow stub passes. Assert output content, state transition, or persisted value.
- **Everything lumped as one "red phase".** Assign each criterion its real level (unit / integration / contract / e2e / load). A logic check is a fast unit test, not a slow e2e.
- **Watch mode / bail.** `vitest` not `vitest run`, or `-x` / `--bail`, hides failures and forces re-runs. Verbose, full run, capture to file.
- **Mock that drifts from the real contract.** A stub returning a shape the real dependency never returns hides integration bugs. Mocks assert the real contract shape.
- **Non-functional test with no threshold.** A perf/load/a11y test needs a number from a SPEC NFR. No threshold -> `[OPEN]` back to spec, not an invented value.
- **CC-n row proven by a unit test of the key generator.** The race is never exercised, so a broken constraint ships green. Drive the race against the real DB (double-submit fires twice, parallel-write launches two writers, retry-refire replays the idempotency key) and assert the exact conflict behavior.
- **SM-n valid transition asserting "no throw".** A stub that silently swallows the trigger passes. Assert the persisted state flip; assert the exact rejection for the illegal transition.
- **OBS-n required signal with no firing assertion.** A dead worker that emits nothing passes. Capture the log sink or the metric counter delta for the test's own input.
- **e2e AC without a `--project` viewport (frontend).** An unspecified viewport hides responsive breakage. Name `--project=mobile-375` or `--project=desktop-1280`; beta+ user-flow ACs run at both.
- **Adversarial class silently dropped.** A missing `html-script-content` or `oversized-10k` fixture is a hole, not an omission. Emit all five classes or `n/a: <reason>`.

## Related

- Upstream: `cfn-spec` (FRs, ECs, NFR thresholds, pre/post conditions — the criteria you turn into checks), `cfn-arch` (boundaries — what is a unit vs integration vs contract seam), `cfn-ux` (UI states + field->control map — drives e2e assertions).
- Gate (feeds): `bars/verifiable-done.md` (consumes the Phase 3 AC table; this phase is its upstream feeder).
- Downstream: `/cfn-loop-task` (runs the checks from the VERIFY manifest; enforces TDD ordering).
- Orchestrator: `cfn-megaplan` (spawns this phase at DAG level 6, always active, parallel with `cfn-design` + `cfn-ops`).
- Producers of presence-keyed rows: `cfn-data` §6 (CC-n concurrency) + §5 (migration invocation), `cfn-arch` §9 (SM-n transitions), `cfn-ops` §2 (OBS-n signals), `cfn-spec` Step 4 (adversarial hostile-value catalog), `cfn-design` per-breakpoint table (viewport decision).
- Backlog + design rationale: `docs/PLANNING_PIPELINE_GAPS.md` (gaps G07, G08, G20, G21, and Wave 5: G46 viewport, G47 concurrency, G48 SM transitions, G49 observability, G50 migration rehearsal, G51 adversarial data).
