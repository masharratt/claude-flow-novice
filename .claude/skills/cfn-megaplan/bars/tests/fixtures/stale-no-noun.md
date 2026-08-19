# VERIFY: stale-no-noun

| AC-id | criterion | binding | check | pass | trigger | seeds | signal |
|---|---|---|---|---|---|---|---|
| AC-1 | types work | EC-1 | grep -q "type" src/main.rs | exit 0 | http:POST /api/signup | (none) | |

## Gate report
| AC-id | form | decidable | maps_to | core_rule |
|---|---|---|---|---|---|
| AC-1 | static | Y | EC-1 | n-a |

```json
{
  "slug": "stale-no-noun",
  "acs": [
    {
      "id": "AC-1",
      "check": "grep -q \"type\" src/main.rs",
      "kind": "static",
      "pass": "exit 0",
      "trigger": "http:POST /api/signup",
      "seeds": "(none)",
      "signal": "",
      "maps_to": ["EC-1"],
      "evidence": "grep: 1 match"
    }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "wiring_total": 0,
    "wiring_mapped": 0,
    "no_new_components_reason": "fixture: minimal coverage for test"
  },
  "description": "scans source files for TODO patterns"
}
```
