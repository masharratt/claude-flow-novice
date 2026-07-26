# VERIFY: [boundary] FR declared, but its only mapped AC is kind: unit (a builder-
# isolation test with in-memory fixtures). boundary_fr_integration_ok is empty.
# Must FAIL: a unit test that never crosses the DB boundary cannot catch an
# ORDER BY reversal at the seam. (CQR gap #2.)

```json
{
  "slug": "boundary-fr-no-integration",
  "acs": [
    {
      "id": "AC-1",
      "check": "vitest run builder.spec.ts -t \"latest_first\"",
      "kind": "unit",
      "pass": "first rendered fact id == \"fact-latest\"",
      "trigger": "fn:build_grounded_prompt",
      "seeds": "facts(2 rows, in-memory Vec)",
      "signal": "",
      "maps_to": [
        "FR-5"
      ],
      "evidence": " Tests  1 passed (1)"
    }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 1,
    "fr_mapped": 1,
    "ec_total": 0,
    "ec_mapped": 0,
    "wiring_total": 0,
    "wiring_mapped": 0,
    "no_new_components_reason": "fixture: no new composition-root components; testing boundary tag only",
    "core_fr": [],
    "no_core_mechanism_reason": "n/a",
    "boundary_fr": [
      "FR-5"
    ],
    "boundary_fr_integration_ok": []
  }
}
```
