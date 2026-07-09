# VERIFY: weasel + shallow pass

```json
{
  "slug": "weasel",
  "acs": [
    { "id": "AC-1", "check": "vitest run t.spec.ts::x", "kind": "unit", "pass": "handles errors gracefully", "maps_to": ["FR-1"] },
    { "id": "AC-2", "check": "vitest run t.spec.ts::y", "kind": "unit", "pass": "renders", "maps_to": ["FR-2"] }
  ],
  "done_rule": "all acs green",
  "coverage": { "fr_total": 2, "fr_mapped": 2, "ec_total": 0, "ec_mapped": 0, "core_fr": [], "no_core_mechanism_reason": "ui only" }
}
```
