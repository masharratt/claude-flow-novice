# VERIFY: coverage mismatch (fr_mapped < fr_total, cc unmapped)

```json
{
  "slug": "coverage-mismatch",
  "acs": [
    { "id": "AC-1", "check": "vitest run t.spec.ts::x", "kind": "unit", "pass": "returns exit 0", "maps_to": ["FR-1"] }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 3, "fr_mapped": 1, "ec_total": 2, "ec_mapped": 2,
    "cc_total": 2, "cc_mapped": 1,
    "wiring_total": 0, "wiring_mapped": 0, "no_new_components_reason": "coverage-mismatch fixture: no new composition-root components; testing fr/cc coverage mismatch only",
    "core_fr": [], "no_core_mechanism_reason": "n/a"
  }
}
```
