# VERIFY: [boundary] FR with a kind: integration AC that drives the real DB path
# (asserts ordering across the persistence boundary, not an in-memory Vec).
# boundary_fr_integration_ok matches. Must PASS (exit 0, empty findings). (CQR gap #2.)

```json
{
  "slug": "boundary-fr-clean",
  "acs": [
    {
      "id": "AC-1",
      "check": "cargo test fetch_asserted_for_prompt_orders_latest_first -- --exact",
      "kind": "integration",
      "pass": "first rendered fact created_at >= last bio fact created_at",
      "trigger": "db:select provenance ORDER BY created_at",
      "seeds": "facts(2 rows, created_at distinct, persisted)",
      "signal": "",
      "maps_to": [
        "FR-5"
      ],
      "evidence": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.10s"
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
    "boundary_fr_integration_ok": [
      "FR-5"
    ]
  }
}
```
