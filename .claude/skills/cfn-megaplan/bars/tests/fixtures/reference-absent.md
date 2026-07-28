# VERIFY: reference-absent

| AC-id | criterion | binding | check | pass | trigger | seeds | signal |
|---|---|---|---|---|---|---|---|
| AC-1 | no antipattern | FR-1 | grep -c antipattern src/x.ts | count == 0 | fn:grep | (none) | |

## Gate report
| AC-id | form | decidable | maps_to | core_rule |
|---|---|---|---|---|
| AC-1 | static | Y | FR-1 | n-a |

```json
{
  "slug": "reference-absent",
  "acs": [
    {
      "id": "AC-1",
      "check": "grep -c antipattern src/x.ts",
      "kind": "static",
      "pass": "count == 0",
      "trigger": "fn:grep",
      "seeds": "(none)",
      "signal": "",
      "maps_to": [
        "FR-1"
      ],
      "evidence": "0"
    }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 1,
    "fr_mapped": 1,
    "ec_total": 1,
    "ec_mapped": 1,
    "wiring_total": 0,
    "wiring_mapped": 0,
    "no_new_components_reason": "reference fixture: no new composition-root components"
  }
}
```
