# VERIFY: wiring_total: 0 with NO no_new_components_reason declared (must FAIL)
# The zero-components escape hatch requires an explicit, non-empty justification. A bare
# wiring_total: 0 is indistinguishable from a manifest that just forgot to fill it in.

```json
{
  "slug": "wiring-zero-no-reason",
  "acs": [
    { "id": "AC-1", "check": "vitest run t.spec.ts::x", "kind": "unit", "pass": "returns exit 0", "maps_to": ["FR-1"] }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 1, "fr_mapped": 1, "ec_total": 0, "ec_mapped": 0,
    "wiring_total": 0, "wiring_mapped": 0,
    "core_fr": [], "no_core_mechanism_reason": "n/a"
  }
}
```
