# VERIFY: missing-check (AC-2 has no check field)

```json
{
  "slug": "missing-check",
  "acs": [
    { "id": "AC-1", "check": "vitest run t.spec.ts::rejects", "kind": "unit", "pass": "body error == \"invalid_email\"", "maps_to": ["EC-1"] },
    { "id": "AC-2", "kind": "unit", "pass": "returns 200", "maps_to": ["FR-1"] }
  ],
  "done_rule": "all acs green",
  "coverage": { "fr_total": 1, "fr_mapped": 1, "ec_total": 1, "ec_mapped": 1, "core_fr": [], "no_core_mechanism_reason": "pure CRUD, no async mechanism" }
}
```
