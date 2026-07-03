---
name: cfn-test-plan
description: "Test-strategy phase of cfn-megaplan. Designs test depth properly: fixtures/test-data, the unit/integration/contract/e2e/load split, mocking strategy, and non-functional tests, instead of lumping everything into a vague red phase. Feeds Bar A (verifiable-done): every acceptance criterion becomes a concrete runnable check. Use after cfn-spec, cfn-arch, and (if frontend) cfn-ux."
version: 1.0.0
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
- `planning/ARCH_<slug>.md` — component boundaries and interface contracts. Tells you what is a unit vs an integration seam vs a cross-service contract.

Optional but authoritative when present:
- `planning/UX_<slug>.md` — the field->control map and screen state table. Every UI state (loading/empty/error/success/partial/disabled) needs a test row. The field->control map drives e2e assertions (a DB-backed dropdown asserts `<select>` options == query result).

From the orchestrator you also receive:
- **Tier** — `mvp` | `beta` | `enterprise`.
- **Directive** — `full` | `light`.
- **Include extras** — e.g. `mocking_strategy`, `load`, `soak`, `nonfunctional`.
- **Omit** — drops listed by the profile.

### Directive scope (`light` vs `full`)

The AC -> executable check table (Phase 3) and the fixture strategy (Phase 1) are floored. They never drop, any tier. Bar A cannot run without them.

- **`light` (mvp):** happy-path + edge tests only. Emit Phase 1 (fixtures), Phase 2 (level split, but only unit + e2e levels populated), Phase 3 (the AC table covering every FR and EC), Phase 6 (TDD ordering). Drop integration, contract, load, soak, and the mocking strategy (Phase 4) and non-functional tests (Phase 5).
- **`beta`:** add integration tests, contract tests, and the mocking strategy (Phase 4). Drop load and soak.
- **`enterprise` (`full`):** everything. Add load + soak + non-functional tests (Phase 5: perf, a11y, security scan), each tied to a SPEC NFR threshold.

`light` reduces breadth (which levels, which non-functional tests). It never reduces coverage: every FR and EC still gets an AC row with a runnable check, every tier.

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
- Every UI state from `UX_<slug>.md` (loading/empty/error/success/partial/disabled) gets at least one e2e or component test row.
- Push detail down: prefer a fast unit test over a slow e2e when the criterion is logic, not flow. Reserve e2e for what only the full stack can verify.
- Output a table mapping each FR/EC to its assigned level, so Phase 3 knows which runner each check uses.

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

**Assembled-path requirement (FLOORED, every tier).** Every FR the spec marked `[core]` (the mechanism that must actually fire for the feature to exist) gets **>=1 AC row whose check drives the fully-assembled path through the running system**: real trigger -> real wired entry point -> observable outcome. This row is *in addition to* any unit rows for the same FR. A `[core]` FR covered only by the shortcut checks below is a hard defect in this phase — Bar A treats an unmet assembled-path requirement like an unmapped FR. (If the spec marked nothing `[core]`, raise an `[OPEN]` back to spec; do not guess.)

Three banned shortcuts for a `[core]`-FR assembled-path row (each is how a green gate ships a dead feature):

- **Wiring stub.** Calling a private/inner fn directly (`publish_due_tick()`, a route handler fn, a job body) while nothing asserts that fn is registered / spawned / mounted / routed into the running process. The row must exercise the REAL entry point (the spawned worker, the mounted route, the registered handler) and observe the outcome. Add a cheap source/bootstrap guard AC that the wiring call exists (e.g. `grep`/AST assert `lib.rs` spawns the worker) so it cannot be deleted silently. An unregistered worker or unmounted route passes every direct-fn test.
- **Self-seeded seam.** A handoff test that seeds the data the UPSTREAM stage was supposed to write (a worker-read test that inserts the `metadata` the handler should have persisted). The row must let the REAL upstream stage produce that data, then assert the downstream stage consumes it. Each half tested in isolation does not prove the join; a dropped upstream write stays green.
- **Shallow assertion.** A pass condition of "does not throw" / "element exists" / "compiles" / "renders shell" on core logic. A stub returning blank/empty passes. Assert the actual output **content**, the state transition, or the persisted value (rendered DOM contains the field's label AND value; the `<select>` option set equals the query result; the row's status flips to `published` and `published_at` is set).

**Flip test** for each `[core]` FR before you accept its rows: *"Could a hand-written stub that does nothing real pass every check on this FR?"* If yes, the assembled-path row is missing or shortcut-ed. Fix it here — this is exactly the class of miss that survives to prod.

Check taxonomy (pick one per AC):

| Kind | Form | Example |
|---|---|---|
| unit / integration test | `<runner> run <file>::<case>` | `vitest run tests/email.spec.ts::rejects_invalid` |
| e2e / UI | `playwright:` + assertion on snapshot / network | `select#course options match query` |
| DB state | `db-query` SQL + expected rows | `SELECT ... returns N` |
| HTTP | `curl` + status / body assertion | `curl -s /api/x \| jq .ok == true` |
| build / type | `tsc --noEmit` / `cargo check` exit 0 | compile clean |
| static / lint | grep / ast assertion | `no occurrences of <antipattern>` |
| assembled-path | real trigger through the running system — no direct-fn call, no self-seed, no no-throw | spawned worker publishes a seeded due row within one interval; builder-saved options render as the exact `<select>` set; source guard asserts the worker is registered in bootstrap |

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

## 2. Test-Level Split
| FR/EC | Level | Runner |

## 3. Acceptance Criteria -> Executable Checks  (Bar A feed)
| AC-id | criterion | binding | check | pass condition |
Coverage: FR <m/m> mapped, EC <k/k> mapped.

## 4. Mocking Strategy  (beta+ only)
| Dependency | Unit | Integration | e2e | Injection seam | Contract fidelity |

## 5. Non-Functional Tests  (enterprise only)
| Test | Threshold (SPEC NFR) | Check |

## 6. TDD Ordering
| Step | Failing test written first | Red -> Green |

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
| AC-3 | course field is a dropdown sourced from the courses table | DB: `SELECT id, name FROM courses WHERE active` | playwright: snapshot `select#course` | element is `<select>`, option set == query result, 0 free-text inputs |
| AC-4 | booking row persists with the selected course | ARCH booking service contract | `vitest run tests/booking.int.ts::persists` (real DB, scoped fixture) | test green, row present with marker |
| AC-7 | invalid email is rejected | spec EC-4 | `vitest run tests/email.spec.ts::rejects_invalid` | test green |
| AC-9 | seats above course capacity blocked | spec EC-7 | `vitest run tests/seats.spec.ts::over_capacity` | test green, returns 400 SEATS_EXCEEDED |
| AC-12 | empty course list shows "No courses available" + disabled Submit | UX empty state | playwright: snapshot booking form with 0 active courses | banner text present, `button#submit[disabled]` |

Coverage: FR 2/2 mapped, EC 2/2 mapped, UX states mapped.

**6. TDD Ordering**

| Step | Failing test written first | Red -> Green |
|---|---|---|
| render course select | `tests/booking.e2e.ts::course_is_select` | fails (no select) -> passes |
| reject invalid email | `tests/email.spec.ts::rejects_invalid` | fails (accepts) -> passes |
| block over-capacity | `tests/seats.spec.ts::over_capacity` | fails (allows) -> passes |

## Handoff

`TEST_<slug>.md` feeds two consumers:
- **Bar A** (`bars/verifiable-done.md`) at level 7 — parses the Phase 3 AC table directly. It emits `planning/VERIFY_<slug>.md` (the `done = all checks green` manifest). If any AC has no executable check, or any FR/EC is unmapped, Bar A fails the plan and loops back to this phase.
- **`/cfn-loop-task`** downstream — reads the VERIFY manifest, runs each check, and reports done only when every AC is green. It also enforces the Phase 6 TDD ordering (test-first per step).

## Return (to orchestrator)

Return exactly:
- Artifact path: `planning/TEST_<slug>.md`
- A 3-line summary (fixtures + markers defined, levels assigned, AC rows with FR/EC coverage count).
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

## Related

- Upstream: `cfn-spec` (FRs, ECs, NFR thresholds, pre/post conditions — the criteria you turn into checks), `cfn-arch` (boundaries — what is a unit vs integration vs contract seam), `cfn-ux` (UI states + field->control map — drives e2e assertions).
- Gate (feeds): `bars/verifiable-done.md` (consumes the Phase 3 AC table; this phase is its upstream feeder).
- Downstream: `/cfn-loop-task` (runs the checks from the VERIFY manifest; enforces TDD ordering).
- Orchestrator: `cfn-megaplan` (spawns this phase at DAG level 6, always active, parallel with `cfn-design` + `cfn-ops`).
- Backlog + design rationale: `docs/PLANNING_PIPELINE_GAPS.md` (gaps G07, G08, G20, G21).
