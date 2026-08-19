# VERIFY: absence-only

| AC-id | criterion | binding | check | pass | trigger | seeds | signal |
|---|---|---|---|---|---|---|---|
| AC-1 | no TODOs | EC-1 | !grep -r "TODO\|FIXME" src/ | exit 0 | http:POST /api/signup | (none) | |

## Gate report
| AC-id | form | decidable | maps_to | core_rule |
|---|---|---|---|---|---|
| AC-1 | static | Y | EC-1 | n-a |

```json
{
  "slug": "absence-only",
  "acs": [
    {
      "id": "AC-1",
      "check": "!grep -r \"TODO\\|FIXME\" src/",
      "kind": "static",
      "pass": "exit 0",
      "trigger": "http:POST /api/signup",
      "seeds": "(none)",
      "signal": "",
      "maps_to": ["EC-1"],
      "evidence": " Tests  1 passed (1)"
    }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "wiring_total": 0,
    "wiring_mapped": 0,
    "no_new_components_reason": "fixture: minimal coverage for test"
  }
}
```
