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
| AC-id | criterion (plain) | binding (source of truth) | check (executable) | pass condition |
```

Examples:

```
AC-3 | course field is a dropdown sourced from the courses table
     | DB: SELECT name FROM courses
     | playwright: snapshot select#course
     | element is <select>, option set == query result, 0 free-text inputs

AC-7 | invalid email is rejected
     | spec EC-4
     | vitest run tests/email.spec.ts::rejects_invalid
     | test green

AC-11 | new payouts table denies cross-tenant reads
      | RLS policy payouts_tenant_isolation
      | db-query: SET ROLE tenant_b; SELECT count(*) FROM payouts WHERE tenant_id = '<tenant_a>'
      | returns 0 rows
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
| assembled-path (runtime-observed) | strongest form: assembled-path check that also asserts the real process **emitted the runtime signal** a human would have eyeballed in the logs — a specific log line, a telemetry/metric event, an audit row | worker logs `published story=<id>` (test captures stdout / structured-log sink, asserts the line for the seeded id); handler increments `stories_published_total` and test reads the counter delta |

## Gate logic (orchestrator runs this)

1. Parse every AC row from the plan.
2. For each AC: assert `check` is non-empty AND matches one check-taxonomy form AND `pass condition` is a decidable predicate (no "appropriately", "as needed", "etc").
3. Assert every SPEC functional requirement (FR-n) and edge case (EC-n) maps to ≥1 AC.
4. **Assembled-path check (the anti-stub rule).** Read the SPEC `[core]` flags. For **every `[core]` FR**, assert ≥1 mapped AC is `kind: assembled-path` AND its pass condition is not a banned shortcut. Banned-shortcut heuristics — FAIL if the assembled-path row's check/pass matches any:
   - **Wiring stub:** check calls a private/inner fn directly (e.g. names a `*_tick`/handler fn) with no sibling AC asserting that fn is registered/spawned/mounted/routed (look for a `grep`/AST bootstrap-guard AC on the same `[core]` FR).
   - **Self-seeded seam:** a handoff/downstream AC whose fixture seeds the exact data an upstream `[core]` stage is supposed to write (the upstream write must be produced by the real upstream stage, then read).
   - **Shallow assertion:** pass condition is only "does not throw" / "renders" / "exists" / "compiles" / "no error" with no content/state/persistence predicate.
   - If SPEC marks **no** FR `[core]`, FAIL with `no_core_flag` (spec must mark the mechanism, or explicitly declare "no core mechanism" with reason).
   - **Out-of-band core mechanisms** (a `[core]` FR whose trigger fires in a spawned worker, cron job, queue consumer, or any async path that a caller does not directly await) require the **runtime-observed** assembled-path form: the check must assert the running process emitted a concrete runtime signal (log line, telemetry/metric event, or audit row) for the test's own input. This is the codified equivalent of watching the feature work in the logs — the machine reads the signal a human would have eyeballed. A plain assembled-path row without a runtime signal is accepted for synchronous core paths but WARNs for out-of-band ones (`runtime_signal_missing`).
5. **FAIL the plan** if any AC has no executable check, any FR/EC is unmapped, any pass condition is non-decidable, or any `[core]` FR lacks a clean assembled-path AC (step 4).
6. Emit `planning/VERIFY_<slug>.md`: the AC table + a `done = all checks green` manifest that `cfn-loop-task` consumes as its completion gate.

## Output contract (consumed by cfn-loop-task)

```json
{
  "slug": "<task-slug>",
  "acs": [
    { "id": "AC-3", "check": "playwright: select#course ...", "kind": "e2e", "pass": "<predicate>", "maps_to": ["FR-2", "EC-1"] },
    { "id": "AC-38", "check": "cargo test ...::spawned_worker_publishes_within_interval", "kind": "assembled-path", "pass": "row status flips to published within one tick", "maps_to": ["FR-2"] }
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
