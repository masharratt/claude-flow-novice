# VERIFY: ACs carry no run-before-bless evidence

```json
{
  "slug": "evidence-missing",
  "acs": [
    { "id": "AC-1", "check": "vitest run t.spec.ts -t \"rejects\"", "kind": "unit", "pass": "body error == \"invalid_email\"", "trigger": "http:POST /api/signup", "seeds": "(none)", "signal": "", "maps_to": ["EC-1"] }
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
