# VERIFY: file::testname shorthand no runner accepts (NSC defect 1)

```json
{
  "slug": "selector-shorthand",
  "acs": [
    { "id": "AC-1", "check": "npx vitest run lib/widget-registry.test.ts::registry_shape_valid --reporter=verbose", "kind": "unit", "pass": "1 passed", "trigger": "fn:registry", "seeds": "(none)", "signal": "", "evidence": " Tests  1 passed (1)", "maps_to": ["EC-1"] }
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
