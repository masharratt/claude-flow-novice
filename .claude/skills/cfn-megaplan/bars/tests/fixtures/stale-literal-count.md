# VERIFY: stale-literal-count

| AC-id | criterion | binding | check | pass | trigger | seeds | signal |
|---|---|---|---|---|---|---|---|
| AC-1 | schema exists | EC-1 | psql -c "\dt users" | grep -q "users" | http:POST /api/signup | (none) | |

## Gate report
| AC-id | form | decidable | maps_to | core_rule |
|---|---|---|---|---|---|
| AC-1 | db | Y | EC-1 | n-a |

```json
{
  "slug": "stale-literal-count",
  "acs": [
    {
      "id": "AC-1",
      "check": "psql -c \"\\dt users\"",
      "kind": "db",
      "pass": "grep -q \"users\"",
      "trigger": "http:POST /api/signup",
      "seeds": "(none)",
      "signal": "",
      "maps_to": ["EC-1"],
      "evidence": "PENDING: unwritten code",
      "notes": "creates 4 tables for the feature"
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
