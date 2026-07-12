# VERIFY: wiring coverage present but unmapped (wiring_mapped < wiring_total)

```json
{
  "slug": "wiring-mismatch",
  "acs": [
    { "id": "AC-1", "check": "vitest run t.spec.ts::x", "kind": "unit", "pass": "returns exit 0", "maps_to": ["FR-1"] }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 1, "fr_mapped": 1, "ec_total": 0, "ec_mapped": 0,
    "core_fr": [], "no_core_mechanism_reason": "n/a",
    "wiring_total": 2, "wiring_mapped": 1
  }
}
```
