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

## Gate logic (orchestrator runs this)

1. Parse every AC row from the plan.
2. For each AC: assert `check` is non-empty AND matches one check-taxonomy form AND `pass condition` is a decidable predicate (no "appropriately", "as needed", "etc").
3. Assert every SPEC functional requirement (FR-n) and edge case (EC-n) maps to ≥1 AC.
4. **FAIL the plan** if any AC has no executable check, any FR/EC is unmapped, or any pass condition is non-decidable.
5. Emit `planning/VERIFY_<slug>.md`: the AC table + a `done = all checks green` manifest that `cfn-loop-task` consumes as its completion gate.

## Output contract (consumed by cfn-loop-task)

```json
{
  "slug": "<task-slug>",
  "acs": [
    { "id": "AC-3", "check": "playwright: select#course ...", "kind": "e2e", "pass": "<predicate>", "maps_to": ["FR-2", "EC-1"] }
  ],
  "done_rule": "all acs green",
  "coverage": { "fr_total": 8, "fr_mapped": 8, "ec_total": 6, "ec_mapped": 6 }
}
```

`cfn-loop-task` reads this manifest, runs each `check`, and reports done only when every AC is green. Unmapped FR/EC → gate refuses to start.
