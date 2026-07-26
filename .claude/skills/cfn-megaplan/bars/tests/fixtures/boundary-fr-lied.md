# VERIFY: [boundary] FR declared AND marked ok in boundary_fr_integration_ok, but the
# mapped AC is still kind: unit. The declarative subset check passes (FR-5 is in the
# ok list); the per-FR SCAN must still FAIL it -- an author who marks the FR ok but
# maps only a builder-isolation unit AC has not crossed the boundary. (CQR gap #2.)

```json
{
  "slug": "boundary-fr-lied",
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
    "no_new_components_reason": "fixture: no new composition-root components; testing boundary scan only",
    "core_fr": [],
    "no_core_mechanism_reason": "n/a",
    "boundary_fr": [
      "FR-5"
    ],
    "boundary_fr_integration_ok": [
      "FR-5"
    ]
  }
}
```
