# Bar A — Verifiable-Done Gate

**Type:** Quality gate (not a phase). Tier-independent — runs at full strength for MVP, Beta, Enterprise.
**Invoked by:** `cfn-megaplan` orchestrator inside the `write_plan` step, and re-checked in `plan_review`.
**Purpose:** Every success criterion the plan emits must carry an executable check that returns binary pass/fail, so `cfn-loop-task` can mechanically decide when the build is actually done.

## The rule

No prose success criteria. Each acceptance criterion (AC) is a row with an executable check.

**Reject:** "Test coverage ≥80%", "Security review complete", "Works correctly", "Handles errors gracefully".
**Accept:** a check command an agent can run that exits 0 (pass) or non-zero (fail).

## Required AC row shape

```
| AC-id | criterion | binding | check | pass condition | trigger | seeds | signal | evidence | reference (optional) |
```

Column definitions:

- **trigger** = the entrypoint the check drives, one of: `http:<METHOD> <path>` (e.g. `http:POST /api/x`), `worker:spawn`, `ui:<action> <selector>` (e.g. `ui:click #save`), `fn:<name>` (direct function call).
- **seeds** = the fixture rows the check inserts, listed by table/stage (e.g. `stories(2 rows, status=due)`). `(none)` if the check inserts nothing.
- **signal** = the log line / metric / audit row the check asserts the running process emitted. Empty allowed ONLY for synchronous core paths; out-of-band core paths must fill it.
- **evidence** = the check's ACTUAL output from running it once, pasted verbatim (S007). Required on every AC; `PENDING: <reason>` at plan time, real output by the exit gate. See *Run-before-bless* below.
- **reference** (optional) = when present, names ONE specific artifact (a repo-relative path, an absolute path, or an http(s) URL; never a glob) that the `cfn-ab-critic` skill uses as the blind A/B comparison target for this AC's output. Omit the column entirely when the AC does not opt in. The executable `check` still solely decides pass/fail; `reference` adds a quality bar on top, it does not replace the check or the `kind`. See *Optional AC key: `reference`* below.

Examples:

```
AC-3 | course field is a dropdown sourced from the courses table
     | DB: SELECT name FROM courses
     | playwright: npx playwright test e2e/courses.spec.ts -g "course_is_select" --project=desktop-1280
     | element is <select>, option set == query result, 0 free-text inputs
     | trigger: ui:load /courses/new
     | seeds: courses(3 rows, fixture names A/B/C)
     | signal: (empty, synchronous path)
     | requires: http http://localhost:3800/ , env ALLOW_TEST_AUTH=true
     | evidence: "Running 1 test using 1 worker / 1 passed (2.1s)"

AC-7 | invalid email is rejected
     | spec EC-4
     | vitest run tests/email.spec.ts -t "rejects_invalid"
     | test green, response body error == "invalid_email"
     | trigger: http:POST /api/signup
     | seeds: (none)
     | signal: (empty, synchronous path)
     | evidence: "Test Files  1 passed (1) / Tests  1 passed (1)"

AC-11 | new payouts table denies cross-tenant reads
      | RLS policy payouts_tenant_isolation
      | db-query: SET ROLE tenant_b; SELECT count(*) FROM payouts WHERE tenant_id = '<tenant_a>'
      | returns 0 rows
      | trigger: fn:db-query (static policy check; sibling AC-12 is the bootstrap-guard asserting the policy is attached)
      | seeds: payouts(1 row, tenant_a)
      | signal: (empty, synchronous path)
      | requires: db true
      | evidence: " count \n-------\n     0\n(1 row)"

AC-38 | spawned worker publishes a seeded due row within one interval
      | FR-2 [core]
      | cargo test spawned_worker_publishes_within_interval -- --exact
      | row status flips to published within one tick AND stdout contains "published story=<seeded id>"
      | trigger: worker:spawn
      | seeds: stories(1 row, status=due)   <- seeded at the INPUT stage, not the stage under test
      | signal: log line "published story=<id>" captured from the running worker
      | evidence: "test result: ok. 1 passed; 0 failed; 0 ignored; 644 filtered out; finished in 1.20s"
```

`requires` is omitted entirely when the check needs no live infrastructure (AC-7 above). It is a machine-read precondition set, not a place for setup notes — see *Runnable-check contract* rule 3 below.

The `evidence` values above are the **exit-stage** state. A manifest authored during planning carries `evidence: "PENDING: <reason>"` on every row and gets it backfilled from the exit-gate run — see *Run-before-bless* below.

## Runnable-check contract (S007 — read before authoring any `check`)

A `check` is executed verbatim by `verify-run.sh`. Three rules, each of which
cost a field loop a full manual re-verification pass when it was broken:

**1. No `<file>::<name>` selector.** It is a manifest-internal shorthand no
runner implements. vitest and playwright both read it as a single filename and
report "No test files found" — non-zero exit, zero tests run. `check-verifiable-static.sh`
rejects it (`unrunnable_selector`).

| Runner | Not runnable | Runnable |
|---|---|---|
| vitest / jest | `vitest run F.test.ts::NAME` | `vitest run F.test.ts -t "NAME"` |
| playwright | `playwright test F.spec.ts::NAME` | `playwright test F.spec.ts -g "NAME"` |
| cargo | `cargo test F.rs::NAME` | `cargo test NAME -- --exact` |

Note the vitest landmine this creates in the other direction: `vitest run -t <name>`
that matches **zero** tests exits **0**. Verdicts are not exit-code-only —
`verify-run.sh` parses the runner's own summary and forces red on a zero
collected count — but the `evidence` rule below is what catches a typo'd test
name at bless time rather than at loop-exit time.

**2. Paths are relative to `cwd`, not to the repo root.** Set the manifest-level
`"cwd": "<subdir>"` (or a per-AC `cwd`) whenever the runner config
(`vitest.config`, `playwright.config`, `tsconfig` path aliases) lives in a
subdirectory. Playwright in particular cannot run from a monorepo root when two
`@playwright/test` versions resolve, so this is not fixable by path-prefixing.
A `cwd` that does not exist reports `blocked`, not red.

**3. Infrastructure a check needs is declared, never assumed.** Use `requires`:

```json
"requires": {
  "env": ["RUN_INTEGRATION=1", "DATABASE_URL"],
  "db": true,
  "http": "http://localhost:3800/"
}
```

- `env` entry `NAME=value` is **exported into the check** — the manifest states
  the pins, so a human can read the row and reproduce the run by hand.
- `env` entry bare `NAME` is **asserted present** in the runner's environment.
  For secrets that must never be written into a committed manifest.
- `db: true` requires `CFN_VERIFY_DATABASE_URL`.
- `http: <url>` requires something listening at that URL (any response counts).

An unmet precondition reports **`blocked`**, a third state distinct from red.
"Infra absent" must never masquerade as "feature broken" — one field loop
hand-verified 27 rows to tell those two apart.

## Run-before-bless: the `evidence` field (S007, REQUIRED)

Every AC carries `"evidence": "<the check's ACTUAL output>"`. The check must be
**executed once** and its real output pasted before the manifest is hashed.
`check-verifiable-static.sh` fails any AC with empty evidence, and for
runner-kind ACs it parses the pasted text and fails
`evidence_zero_ran` when it shows a zero collected count.

**Two stages, because a plan-time manifest describes code that does not exist yet.**

| Stage | When | `evidence` rule |
|---|---|---|
| `--stage plan` (default) | megaplan Bar A, before implementation | `"PENDING: <reason>"` accepted (warn). Empty is still an error — the field is never omitted. |
| `--stage exit` | `cfn-loop-task` Phase 5 exit gate, after the build | a surviving `PENDING` is an **error** (`evidence_pending`). Real output only. |

Backfilling is mechanical, not a paste job — the exit-gate run already executed
every check, so its recorded output is the evidence:

```bash
verify-run.sh backfill-evidence --results ${PDIR}/VERIFY_RESULTS_${SLUG}.json \
                                --verify  ${PDIR}/VERIFY_${SLUG}.md
bars/bless-verify.sh "${PDIR}/VERIFY_${SLUG}.md" --stage exit --note "exit gate: evidence backfilled"
```

Only **green** rows are backfilled. A red row's output is evidence the check
failed, so writing it in would let the exit bless pass on a manifest whose
checks do not pass; those rows keep their placeholder and stay iteration fuel.

This exists because authoring happens against the plan and verification happens
against the code, and nothing else in the loop forces those to be the same
statement. Two field manifests hashed green on shape and then went runtime-red
against **correct** code — 21 of 147 and 71 of 104 ACs — every one a check
string that did not match the real invocation. The single deciding fact:
`cargo test` exits 0 whether the filter matched 645 tests or 0, so an author
doing a manual preflight sees exit 0 and blesses a check that proves nothing.
Pasting the runner's own `test result: N passed` line makes that visible.

## Check taxonomy (pick one per AC)

`kind` is a **closed vocabulary**, matched exactly (lowercased). A kind outside
this set is an error, not a warning — an unrecognized kind used to fall through
every taxonomy rule, so `kind: cargo-test` with a grep body passed the
kind/command consistency lint by matching nothing at all.

```
unit  integration  e2e  ui  e2e/ui  assembled-path  wiring-guard
db  db-query  http  curl  build  type  compile  static  lint
migration-rehearsal  perf  a11y  security
```

| Kind | Form | Example |
|---|---|---|
| unit/integration test | `<runner> run <file> -t "<case>"` | `vitest run tests/x.spec.ts -t "case"` |
| e2e / UI | `playwright:` + either a real command (executed) or a snapshot/network assertion (routed to an agent) | `playwright: npx playwright test e2e/x.spec.ts -g "case" --project=desktop-1280` |
| DB state | `db-query` SQL + expected rows | `SELECT ... returns N` |
| HTTP | `curl` + status/body assertion | `curl -s /api/x \| jq .ok == true` |
| build/type | `tsc --noEmit` / `cargo check` exit 0 | compile clean |
| static/lint | grep/ast assertion | `no occurrences of <antipattern>` |
| assembled-path | real trigger through the running system (no direct-fn call, no self-seed, no no-throw) | spawned worker publishes a seeded due row within one interval; builder-saved options render as the exact `<select>` set |
| assembled-path (runtime-observed) | strongest form: assembled-path check that also asserts the real process **emitted the runtime signal** a human would have eyeballed in the logs: a specific log line, a telemetry/metric event, an audit row | worker logs `published story=<id>` (test captures stdout / structured-log sink, asserts the line for the seeded id); handler increments `stories_published_total` and test reads the counter delta |
| migration-rehearsal | `CFN_SCRATCH_DATABASE_URL=... ./.claude/skills/cfn-migration-rehearsal/execute.sh --up <NNNN.up.sql> --down <NNNN.down.sql>` — applies up then down against a scratch DB, asserts exit 0 and empty schema-diff | reversible migration `0007` rolls up and back clean, schema-diff empty |

## Gate logic (orchestrator runs this)

1. Parse every AC row from the plan.

1.5. **Mechanical static pass (mandatory, BEFORE the LLM gate report).** After the VERIFY file is drafted, run `bars/check-verifiable-static.sh planning/<slug>/VERIFY_<slug>.md`. It parses the LAST fenced json manifest and mechanically checks: every AC has id/check/kind/pass/maps_to; each `check` matches the taxonomy form for its `kind`; each `pass` is decidable (comparison op / quoted literal / row count / exit code / exact string) and not a banned weasel/shallow phrase; and coverage counters are internally consistent (see coverage keys below). Exit 0 = clean or warnings only, exit 1 = error findings, exit 2 = usage/parse. **Any error-severity finding FAILS the gate** and routes back to the owning phase — do not hand-write this scan, the script is the single source of the static pass. The LLM gate report (step 6a) runs only after the script is clean.

2. For each AC: assert `check` is non-empty AND matches one check-taxonomy form AND `pass condition` is a decidable predicate (no "appropriately", "as needed", "etc").
3. Assert every SPEC functional requirement (FR-n) and edge case (EC-n) maps to ≥1 AC.
4. **Assembled-path check (the anti-stub rule).** Read the SPEC `[core]` flags. For **every `[core]` FR**, assert ≥1 mapped AC is `kind: assembled-path` and passes ALL of these mechanical rules. Evaluate the rules on the `trigger` / `seeds` / `signal` / `pass condition` columns only. No intent inference:
   - **(a) wiring_stub:** FAIL if the AC's `trigger` starts with `fn:` and no sibling AC on the same FR has kind static bootstrap-guard (a grep/AST check asserting that fn is registered/spawned/mounted/routed).

     **Why this exists (do not relax, do not drop as noisy).** This repo has shipped this exact failure class TWICE: first the `route()` MVP wiring hole, second the MP-A per-ticket thread manager — fully specified, plan-assigned, coded, unit-tested, and shipped 81/81 all-green while completely unreachable from `src/index.ts`. Two independent holes compounded: the component was never constructed at the composition root, and the poll-loop's dependency on it was declared OPTIONAL (`thread?: Pick<ThreadManager,'reconcile'>` + `if (deps.thread)`), so the daemon compiled and ran with the feature entirely absent. The only guard AC was `describe.skipIf(!THREAD_REFACTOR_ENABLED)`, gated on the same flag that disables the feature, so it skipped green. Full writeup: `/home/masha/projects/daily-agents/planning/ROOTCAUSE_mpa_thread_wiring_gap.md`. The `wiring_total`/`wiring_mapped` coverage counter below (and its producers in `cfn-arch` §1/§2 and `cfn-test-plan` Phase 3) exists specifically to make this class mechanically visible. If a plan finds the counter noisy, the fix is a cleaner composition root, not removing or downgrading the counter.
   - **(b) shallow:** FAIL if the pass condition, trimmed, matches regex `^(does not throw|renders|exists|compiles|no error)$` with no other predicate.
   - **(c) non_decidable:** the pass condition must contain at least one of: a comparison operator, an expected literal value, an expected row count, an exit code, or an exact string. Otherwise FAIL.
   - **(d) self_seed:** FAIL if `seeds` names a table that an upstream stage of the same `[core]` FR writes (the upstream write must be produced by the real upstream stage, then read; only seed the pipeline's INPUT stage).
   - **(e) flag_tautology (WARN only, not mechanically provable in bash — do not overpromise a hard block):** a `wiring-guard` AC (see `wiring_total`/`wiring_mapped` below) whose `check`/`pass`/`trigger` references an apparent feature/env-flag token (`describe.skipIf(...)`, `_ENABLED`, `_FLAG`, `process.env.`, `getenv(`, `env::var(`) is a candidate green-by-skip tautology when that same flag also defaults the feature off. `check-verifiable-static.sh` flags this as a `warn`-severity finding (a token grep, no flag-default analysis); it never hard-fails the gate on this rule alone. The step-6a gate report (below) MUST explicitly resolve every such WARN by confirming the flag's default is NOT what makes the check pass — this is the one rule in this section that stays LLM-judged by design, matching the binding scope correction that a general flag-default analyzer is out of scope for a static bash checker.
   - **(f) literal_stub_correlation:** for `[core]` FRs whose input is externally produced / non-deterministic (LLM structured output, free-text, a webhook or queue payload — any producer whose value the implementer could hardcode), the assembled-path AC's `pass` must assert a CORRELATION between a value seeded into the upstream input and the observed output, not merely a decidable constant. The AC declares `seeds: "seed:<TOKEN>"` (a concrete marker injected into the upstream input) and `pass` references that TOKEN; `check-verifiable-static.sh` FAILs the FR if no mapped AC both declares a `seed:` token and references it in `pass`. A handler that returns a literal `TierCOutput { action: Deepen, used_fact_ids: vec![] }` satisfies `action == Deepen` but cannot reproduce a seeded fact id, so the predicate proves the handler actually parsed the upstream input rather than returning a constant. Spec lists these FRs in the `core_fr_requires_input_correlation` coverage key (presence-keyed; absent = not applicable).
     **Why this exists (do not relax).** This is the semantic-substitution sibling of the wiring-class rules (a)-(e). Rules (a)-(e) all catch a component wired WRONG or NOT AT ALL — unregistered, unconstructed, shallow, self-seeded, flag-gated. None can catch a component wired CORRECTLY but internally returning a constant or reversing a semantic no AC re-checks. The CQR conversation-quality engine shipped exactly this: 8 pure modules each green on signature-purity ACs, while the production handler built a literal stub `TierCOutput` and the LLM's structured output was parsed only inside `#[cfg(test)]`. Decidability (rule c) was satisfied; the feature was inert on the live path. Full writeup: `/home/masha/projects/fireside-family/planning/handoff_cqr_megaplan_gaps.md` gap #1.
   - If SPEC marks **no** FR `[core]`, FAIL with `no_core_flag` (spec must mark the mechanism, or explicitly declare "no core mechanism" with reason).
   - **Out-of-band core mechanisms** (a `[core]` FR whose trigger fires in a spawned worker, cron job, queue consumer, or any async path that a caller does not directly await) require the **runtime-observed** assembled-path form: the `signal` column must name a concrete runtime signal (log line, telemetry/metric event, or audit row) that the check asserts for the test's own input. This is the codified equivalent of watching the feature work in the logs. An empty `signal` is accepted for synchronous core paths but WARNs for out-of-band ones (`runtime_signal_missing`).
5. **FAIL the plan** if any AC has no executable check, any FR/EC is unmapped, any pass condition is non-decidable, or any `[core]` FR lacks a clean assembled-path AC (step 4).
6. Produce the **gate report** (step 6a), then emit `planning/<slug>/VERIFY_<slug>.md` (the plan's own directory, `$PDIR`) in the pinned layout below.

6a. **Gate report (required before emitting VERIFY).** Produce a gate report table with exactly one row per AC:

```
| AC-id | check_form_matched (taxonomy kind or NONE) | pass_decidable (Y/N + failing phrase) | maps_to | core_rule (ok/wiring_stub/self_seed/shallow/n-a) |
```

Any non-clean cell (check_form_matched NONE, pass_decidable N, empty maps_to, core_rule other than ok or n-a) = FAIL. The report is appended to `planning/<slug>/VERIFY_<slug>.md`. **A PASS verdict without this table is invalid.**

**Flag-tautology resolution (required whenever `check-verifiable-static.sh` emits a `warn`-severity finding on a `wiring-guard` AC).** For each such WARN, the gate report adds one line confirming, by reading the actual flag default in config/env: "flag `<NAME>` defaults `<value>`; guard runs unconditionally / guard is gated on this flag and therefore IS a tautology." A tautology found here is a hard FAIL of that AC's `core_rule` cell (mark it `wiring_stub`), even though the static script only warned — this is the one rule this bar deliberately keeps LLM-judged rather than mechanized (see rule (e) above).

## Pinned VERIFY file layout (contract)

`VERIFY_<slug>.md` = (1) markdown AC table, (2) gate report table, (3) the JSON manifest in a fenced ```json block as the FINAL element of the file. Consumers parse the LAST fenced json block. `cfn-loop-task` Step 0 consumes this file as its completion gate.

**Integrity sidecar `planning/<slug>/.VERIFY_<slug>.sha256`** (always beside its manifest — `bless-verify.sh` derives every sidecar path from the file's own directory, so nothing changes for a legacy flat plan)**.** After Bar A PASSES (including the mechanical static pass, step 1.5), the orchestrator blesses the validated file. **Blessing is done ONLY through `bars/bless-verify.sh`** — never by writing the sidecar by hand:

```bash
./.claude/skills/cfn-megaplan/bars/bless-verify.sh "${PDIR}/VERIFY_${SLUG}.md" \
  --note "Bar A pass, first bless"
```

The script (1) re-runs `check-verifiable-static.sh` and REFUSES to pin anything if there is a single error-severity finding, (2) writes the sha256 sidecar in the same path/format as before, and (3) appends a bless-ledger entry to `planning/<slug>/.VERIFY_<slug>.bless.json` plus a manifest snapshot in `planning/<slug>/.VERIFY_<slug>.blessed.json`.

The hash pins the exact validated bytes. `cfn-loop-task` Step 0 recomputes it and REFUSES to run if the manifest was edited after Bar A (a post-gate manifest edit is a way to game the done verdict); `verify-run.sh` enforces the same independently (exit 4 on mismatch, missing sidecar = warn for pre-hash-era files).

**Bless ledger (required reading on any re-bless).** A hand-written sidecar made re-blessing all-or-nothing: a reviewer could not tell whether a corrected `check` command or a rewritten acceptance criterion caused the new hash. The ledger reports two axes separately per bless:

| Field | Meaning | Reviewer action |
|---|---|---|
| `changed[]` | Per AC id, exactly which fields moved | Skim. `check`/`evidence`-only moves are the benign case. |
| `added` / `removed` | AC ids that appeared or disappeared | Any `removed` needs a stated reason — an AC deleted after Bar A is scope reduction. |
| `structure_changed` | An AC was added/removed, or an `id`/`kind`/`maps_to` moved | The criteria set itself changed. Re-read the coverage block. |
| `predicate_changed` | A `pass` condition moved | **The gaming vector.** A `pass` loosened until the code satisfies it is a fabricated green. Never approve without reading the before/after. |

A re-bless with `predicate_changed: true` is legitimate only when the original predicate was wrong (untestable, or it encoded a misread requirement). "The code does X, so the predicate now says X" is not a reason.

## Output contract (consumed by cfn-loop-task)

The JSON manifest below is the FINAL fenced ```json block of `VERIFY_<slug>.md` (pinned layout above). `cfn-loop-task` Step 0 parses the LAST fenced json block of the file.

```json
{
  "slug": "<task-slug>",
  "cwd": "portal",
  "acs": [
    { "id": "AC-3", "check": "playwright: npx playwright test e2e/booking.spec.ts -g \"course_is_select\" --project=desktop-1280", "kind": "e2e", "pass": "select#course option set == query result, 0 free-text inputs", "trigger": "ui:load /courses/new", "seeds": "courses(3 rows)", "signal": "", "requires": { "env": ["ALLOW_TEST_AUTH=true"], "http": "http://localhost:3800/" }, "evidence": "Running 1 test using 1 worker\n  1 passed (2.1s)", "maps_to": ["FR-2", "EC-1"] },
    { "id": "AC-38", "check": "cargo test spawned_worker_publishes_within_interval -- --exact --ignored", "kind": "assembled-path", "pass": "row status flips to published within one tick", "trigger": "worker:spawn", "seeds": "stories(1 row, status=due)", "signal": "log line published story=<id>", "requires": { "db": true }, "evidence": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 644 filtered out; finished in 1.20s", "maps_to": ["FR-2"] }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 8, "fr_mapped": 8, "ec_total": 6, "ec_mapped": 6,
    "wiring_total": 3, "wiring_mapped": 3,
    "core_fr": ["FR-2"], "core_fr_assembled_path_ok": ["FR-2"],
    "out_of_band_core_fr": ["FR-2"], "core_fr_runtime_observed": ["FR-2"]
  }
}
```

**Wiring coverage (`wiring_total`/`wiring_mapped`) is a REQUIRED top-level coverage key, not optional.** Producer: `cfn-test-plan` Phase 3, sourced from every component `cfn-arch` §1 enumerates against the composition root(s) `cfn-arch` §1 names. `check-verifiable-static.sh` Check 1b FAILS any manifest missing either key — **required, not presence-keyed, because an opt-in wiring gate is dodgeable by omission, which is the same failure class it exists to prevent.** (This is not hypothetical: the real MP-A manifest that shipped the per-ticket thread manager 81/81 green while unreachable from `src/index.ts` simply omitted the wiring keys, so a presence-keyed gate gave it no check at all — see the rootcause writeup linked above.) Every `WIRE-n` row (one per component) owes >=1 mapped AC of kind `wiring-guard` or the gate FAILS — this is the mechanical half of the wiring-guard rule above. A build with genuinely zero new composition-root components may set `wiring_total: 0` / `wiring_mapped: 0`, but ONLY together with a non-empty `no_new_components_reason` string (same escape-hatch precedent as `no_core_mechanism_reason` below); a bare `wiring_total: 0` with no reason still FAILS.

`cfn-loop-task` reads this manifest, runs each `check`, and reports done only when every AC is green. Unmapped FR/EC → gate refuses to start. Any `core_fr` not in `core_fr_assembled_path_ok` → gate refuses to start (a core mechanism with no clean assembled-path check is a stub-risk the gate must not pass). Any `out_of_band_core_fr` not in `core_fr_runtime_observed` → WARN (`runtime_signal_missing`): the async mechanism fires but no check reads the log/telemetry signal a human would have watched for. Enterprise tier promotes this WARN to a FAIL. Any `boundary_fr` not in `boundary_fr_integration_ok`, or backed only by non-`integration` ACs, → gate refuses to start (a boundary FR with no real-DB/HTTP check cannot prove its ordering/filter/limit semantics hold at the seam). Any `core_fr_requires_input_correlation` FR whose mapped ACs seed no `seed:<TOKEN>` token or fail to reference it in `pass` → gate refuses to start (rule f — a constant handler stub would otherwise pass).

### Optional coverage keys (presence-keyed enforcement)

Producers that emit specialized row classes add their own paired counters. All are **optional and additive** — old manifests without them still parse. Enforcement is **presence-keyed, not tier-keyed**: if the counter is present with `total > mapped`, the gate FAILS regardless of tier (the upstream artifact emitted rows, so those rows owe AC coverage). Tiers control whether the producing section is emitted at all; they never relax coverage. The `check-verifiable-static.sh` static pass lints every counter below when present. New ID vocabularies `CC-n` / `SM-n` / `OBS-n` / `ADV-n` are legal in an AC's `binding` and in `maps_to`.

| Key(s) | Producer | Rule | Verdict on gap |
|---|---|---|---|
| `cc_total` / `cc_mapped` | cfn-data §6 (concurrency) | every `CC-n` race-control row maps to ≥1 AC whose check drives the race | FAIL (all tiers) |
| `sm_total` / `sm_mapped` | cfn-arch Step 9 (state machines) | every valid/illegal `SM-n` transition maps to ≥1 AC (persisted flip / exact rejection) | FAIL (all tiers) |
| `obs_required_total` / `obs_required_mapped` | cfn-ops Phase 2 (observability) | every `verify: required` `OBS-n` signal maps to ≥1 AC asserting the signal fires for the test's own input | FAIL (beta+) |
| `adv_total` / `adv_mapped` | cfn-test-plan Phase 1 (adversarial data) | every `ADV-n` hostile-input row maps to ≥1 AC | FAIL (presence-keyed) |
| `migration_rehearsal` | cfn-ops Phase 6 / cfn-data §5 | db + reversible + beta+ → value is `AC-<id>` (a migration-rehearsal AC) OR `warn:<reason>` (no scratch DB) OR `n/a:<reason>` (irreversible) | FAIL if db+reversible+beta+ and no AC and no warn |
| `no_core_mechanism_reason` | spec | required string when `core_fr` is empty (spec declares no core mechanism) | FAIL if `core_fr` empty and key absent |
| `viewport_missing` | cfn-test-plan Phase 3 (viewport matrix) | `true` when a frontend user-flow e2e AC omits `--project=<viewport>` | WARN (enterprise promotes to FAIL) |
| `core_fr_requires_input_correlation` | spec (marks `[core]` FRs whose input is externally produced: LLM/free-text/webhook/queue) | every listed FR has ≥1 mapped AC that seeds `seed:<TOKEN>` into the upstream input and references TOKEN in `pass` (rule f) | FAIL (presence-keyed) |
| `boundary_fr` / `boundary_fr_integration_ok` | spec `[boundary]` flag (FRs crossing a persistence/service boundary with ordering/filter/limit/status-dependent semantics) | every `[boundary]` FR maps to ≥1 AC of kind `integration` driving the REAL DB/HTTP path; a builder-isolation unit AC does not count | FAIL (presence-keyed); empty `boundary_fr` needs `no_boundary_fr_reason` |
| `no_boundary_fr_reason` | spec | required string when `boundary_fr` is empty (spec declares no boundary-crossing FRs) | FAIL if `boundary_fr` empty and key absent |

### Required coverage keys (mandatory, not presence-keyed)

Unlike the optional keys above, these MUST be present in every manifest's `coverage` object or the gate FAILS outright (`check-verifiable-static.sh` Check 1b), regardless of tier.

| Key(s) | Producer | Rule | Verdict on gap |
|---|---|---|---|
| `fr_total` / `fr_mapped` | spec (functional requirements) | every FR maps to ≥1 AC | FAIL if missing or unmapped |
| `ec_total` / `ec_mapped` | spec (edge cases) | every EC maps to ≥1 AC | FAIL if missing or unmapped |
| `wiring_total` / `wiring_mapped` | cfn-test-plan Phase 3 (wiring coverage), sourced from cfn-arch §1 Components + composition root | every component cfn-arch §1 enumerates maps to ≥1 AC of kind `wiring-guard` whose check greps the composition root for a non-optional construction + injection, offender-count == 0. Zero new components: `wiring_total: 0` / `wiring_mapped: 0` is legal ONLY with a non-empty `no_new_components_reason` | FAIL if either key missing, if `wiring_mapped != wiring_total`, or if `wiring_total: 0` has no stated reason |

### Optional AC key: `reference` (cfn-ab-critic trigger)

`reference` is an OPTIONAL key on an AC object, orthogonal to the executable check. When present, it names ONE specific artifact (a repo-relative path, an absolute path, or an http(s) URL; never a glob) that the `cfn-ab-critic` skill uses as the blind A/B comparison target for that AC's output. The executable `check` is UNCHANGED and still solely decides pass/fail; `reference` adds a quality bar on top, it does not replace the check or change the `kind`. Omitting the key entirely is always legal (opt-in by presence).

`check-verifiable-static.sh` check 1g lints the key when present: a non-string, empty, or glob value is an error at both stages; a local path that does not resolve warns at the `--stage plan` bless (the artifact may not exist yet) and errors at the `--stage exit` bless, mirroring the two-stage `evidence` contract (check 1d). Path existence is checked relative to the cwd the gate is invoked from, which is the repo root by convention.
