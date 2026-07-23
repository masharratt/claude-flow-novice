# VERIFY: weasel + shallow pass

```json
{
  "slug": "weasel",
  "acs": [
    {
      "id": "AC-1",
      "check": "vitest run t.spec.ts -t \"x\"",
      "kind": "unit",
      "pass": "handles errors gracefully",
      "maps_to": [
        "FR-1"
      ],
      "evidence": " Tests  1 passed (1)"
    },
    {
      "id": "AC-2",
      "check": "vitest run t.spec.ts -t \"y\"",
      "kind": "unit",
      "pass": "renders",
      "maps_to": [
        "FR-2"
      ],
      "evidence": " Tests  1 passed (1)"
    }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 2,
    "fr_mapped": 2,
    "ec_total": 0,
    "ec_mapped": 0,
    "wiring_total": 0,
    "wiring_mapped": 0,
    "no_new_components_reason": "weasel fixture: no new composition-root components; testing weasel/shallow pass conditions only",
    "core_fr": [],
    "no_core_mechanism_reason": "ui only"
  }
}
```
