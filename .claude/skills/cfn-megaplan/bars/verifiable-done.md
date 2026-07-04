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
| AC-id | criterion | binding | check | pass condition | trigger | seeds | signal |
```

Column definitions:

- **trigger** = the entrypoint the check drives, one of: `http:<METHOD> <path>` (e.g. `http:POST /api/x`), `worker:spawn`, `ui:<action> <selector>` (e.g. `ui:click #save`), `fn:<name>` (direct function call).
- **seeds** = the fixture rows the check inserts, listed by table/stage (e.g. `stories(2 rows, status=due)`). `(none)` if the check inserts nothing.
- **signal** = the log line / metric / audit row the check asserts the running process emitted. Empty allowed ONLY for synchronous core paths; out-of-band core paths must fill it.

Examples:

```
AC-3 | course field is a dropdown sourced from the courses table
     | DB: SELECT name FROM courses
     | playwright: snapshot select#course
     | element is <select>, option set == query result, 0 free-text inputs
     | trigger: ui:load /courses/new
     | seeds: courses(3 rows, fixture names A/B/C)
     | signal: (empty, synchronous path)

AC-7 | invalid email is rejected
     | spec EC-4
     | vitest run tests/email.spec.ts::rejects_invalid
     | test green, response body error == "invalid_email"
     | trigger: http:POST /api/signup
     | seeds: (none)
     | signal: (empty, synchronous path)

AC-11 | new payouts table denies cross-tenant reads
      | RLS policy payouts_tenant_isolation
      | db-query: SET ROLE tenant_b; SELECT count(*) FROM payouts WHERE tenant_id = '<tenant_a>'
      | returns 0 rows
      | trigger: fn:db-query (static policy check; sibling AC-12 is the bootstrap-guard asserting the policy is attached)
      | seeds: payouts(1 row, tenant_a)
      | signal: (empty, synchronous path)

AC-38 | spawned worker publishes a seeded due row within one interval
      | FR-2 [core]
      | cargo test tests/worker.rs::spawned_worker_publishes_within_interval
      | row status flips to published within one tick AND stdout contains "published story=<seeded id>"
      | trigger: worker:spawn
      | seeds: stories(1 row, status=due)   <- seeded at the INPUT stage, not the stage under test
      | signal: log line "published story=<id>" captured from the running worker
```

## Check taxonomy (pick one per AC)

| Kind | Form | Example |
|---|---|---|
| unit/integration test | `<runner> run <file>::<case>` | `vitest run tests/x.spec.ts::case` |
| e2e / UI | `playwright:` + assertion on snapshot/network | `select#course options match query` |
| DB state | `db-query` SQL + expected rows | `SELECT ... returns N` |
| HTTP | `curl` + status/body assertion | `curl -s /api/x \| jq .ok == true` |
| build/type | `tsc --noEmit` / `cargo check` exit 0 | compile clean |
| static/lint | grep/ast assertion | `no occurrences of <antipattern>` |
| assembled-path | real trigger through the running system (no direct-fn call, no self-seed, no no-throw) | spawned worker publishes a seeded due row within one interval; builder-saved options render as the exact `<select>` set |
| assembled-path (runtime-observed) | strongest form: assembled-path check that also asserts the real process **emitted the runtime signal** a human would have eyeballed in the logs: a specific log line, a telemetry/metric event, an audit row | worker logs `published story=<id>` (test captures stdout / structured-log sink, asserts the line for the seeded id); handler increments `stories_published_total` and test reads the counter delta |

## Gate logic (orchestrator runs this)

1. Parse every AC row from the plan.
2. For each AC: assert `check` is non-empty AND matches one check-taxonomy form AND `pass condition` is a decidable predicate (no "appropriately", "as needed", "etc").
3. Assert every SPEC functional requirement (FR-n) and edge case (EC-n) maps to ≥1 AC.
4. **Assembled-path check (the anti-stub rule).** Read the SPEC `[core]` flags. For **every `[core]` FR**, assert ≥1 mapped AC is `kind: assembled-path` and passes ALL of these mechanical rules. Evaluate the rules on the `trigger` / `seeds` / `signal` / `pass condition` columns only. No intent inference:
   - **(a) wiring_stub:** FAIL if the AC's `trigger` starts with `fn:` and no sibling AC on the same FR has kind static bootstrap-guard (a grep/AST check asserting that fn is registered/spawned/mounted/routed).
   - **(b) shallow:** FAIL if the pass condition, trimmed, matches regex `^(does not throw|renders|exists|compiles|no error)$` with no other predicate.
   - **(c) non_decidable:** the pass condition must contain at least one of: a comparison operator, an expected literal value, an expected row count, an exit code, or an exact string. Otherwise FAIL.
   - **(d) self_seed:** FAIL if `seeds` names a table that an upstream stage of the same `[core]` FR writes (the upstream write must be produced by the real upstream stage, then read; only seed the pipeline's INPUT stage).
   - If SPEC marks **no** FR `[core]`, FAIL with `no_core_flag` (spec must mark the mechanism, or explicitly declare "no core mechanism" with reason).
   - **Out-of-band core mechanisms** (a `[core]` FR whose trigger fires in a spawned worker, cron job, queue consumer, or any async path that a caller does not directly await) require the **runtime-observed** assembled-path form: the `signal` column must name a concrete runtime signal (log line, telemetry/metric event, or audit row) that the check asserts for the test's own input. This is the codified equivalent of watching the feature work in the logs. An empty `signal` is accepted for synchronous core paths but WARNs for out-of-band ones (`runtime_signal_missing`).
5. **FAIL the plan** if any AC has no executable check, any FR/EC is unmapped, any pass condition is non-decidable, or any `[core]` FR lacks a clean assembled-path AC (step 4).
6. Produce the **gate report** (step 6a), then emit `planning/VERIFY_<slug>.md` in the pinned layout below.

6a. **Gate report (required before emitting VERIFY).** Produce a gate report table with exactly one row per AC:

```
| AC-id | check_form_matched (taxonomy kind or NONE) | pass_decidable (Y/N + failing phrase) | maps_to | core_rule (ok/wiring_stub/self_seed/shallow/n-a) |
```

Any non-clean cell (check_form_matched NONE, pass_decidable N, empty maps_to, core_rule other than ok or n-a) = FAIL. The report is appended to `planning/VERIFY_<slug>.md`. **A PASS verdict without this table is invalid.**

## Pinned VERIFY file layout (contract)

`VERIFY_<slug>.md` = (1) markdown AC table, (2) gate report table, (3) the JSON manifest in a fenced ```json block as the FINAL element of the file. Consumers parse the LAST fenced json block. `cfn-loop-task` Step 0 consumes this file as its completion gate.

## Output contract (consumed by cfn-loop-task)

The JSON manifest below is the FINAL fenced ```json block of `VERIFY_<slug>.md` (pinned layout above). `cfn-loop-task` Step 0 parses the LAST fenced json block of the file.

```json
{
  "slug": "<task-slug>",
  "acs": [
    { "id": "AC-3", "check": "playwright: select#course ...", "kind": "e2e", "pass": "<predicate>", "trigger": "ui:load /courses/new", "seeds": "courses(3 rows)", "signal": "", "maps_to": ["FR-2", "EC-1"] },
    { "id": "AC-38", "check": "cargo test ...::spawned_worker_publishes_within_interval", "kind": "assembled-path", "pass": "row status flips to published within one tick", "trigger": "worker:spawn", "seeds": "stories(1 row, status=due)", "signal": "log line published story=<id>", "maps_to": ["FR-2"] }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 8, "fr_mapped": 8, "ec_total": 6, "ec_mapped": 6,
    "core_fr": ["FR-2"], "core_fr_assembled_path_ok": ["FR-2"],
    "out_of_band_core_fr": ["FR-2"], "core_fr_runtime_observed": ["FR-2"]
  }
}
```

`cfn-loop-task` reads this manifest, runs each `check`, and reports done only when every AC is green. Unmapped FR/EC → gate refuses to start. Any `core_fr` not in `core_fr_assembled_path_ok` → gate refuses to start (a core mechanism with no clean assembled-path check is a stub-risk the gate must not pass). Any `out_of_band_core_fr` not in `core_fr_runtime_observed` → WARN (`runtime_signal_missing`): the async mechanism fires but no check reads the log/telemetry signal a human would have watched for. Enterprise tier promotes this WARN to a FAIL.
