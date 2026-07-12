# VERIFY: wiring_total: 0 WITH a non-empty no_new_components_reason (must PASS)
# Legitimate zero-components case: a pure docs/config change introduces no new
# composition-root components, so the wiring gate is satisfied by the stated reason.

```json
{
  "slug": "wiring-zero-with-reason",
  "acs": [
    { "id": "AC-1", "check": "vitest run t.spec.ts::x", "kind": "unit", "pass": "returns exit 0", "maps_to": ["FR-1"] }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 1, "fr_mapped": 1, "ec_total": 0, "ec_mapped": 0,
    "wiring_total": 0, "wiring_mapped": 0, "no_new_components_reason": "docs-only change, no new composition-root components",
    "core_fr": [], "no_core_mechanism_reason": "n/a"
  }
}
```
