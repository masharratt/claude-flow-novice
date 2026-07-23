# VERIFY: evidence pasted, but it shows the check ran zero tests

```json
{
  "slug": "evidence-zero-ran",
  "acs": [
    { "id": "AC-1", "check": "cargo test sm2_optional_backfill -- --ignored --exact", "kind": "unit", "pass": "test result contains \"1 passed\"", "trigger": "fn:sm2", "seeds": "(none)", "signal": "", "evidence": "test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 645 filtered out; finished in 0.01s", "maps_to": ["EC-1"] }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 0, "fr_mapped": 0, "ec_total": 1, "ec_mapped": 1,
    "wiring_total": 0, "wiring_mapped": 0, "no_new_components_reason": "fixture: no new components",
    "core_fr": [], "no_core_mechanism_reason": "fixture: no core mechanism",
    "core_fr_assembled_path_ok": []
  }
}
```
