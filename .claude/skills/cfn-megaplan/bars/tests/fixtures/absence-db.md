# VERIFY: absence-db

| AC-id | criterion | binding | check | pass | trigger | seeds | signal |
|---|---|---|---|---|---|---|---|
| AC-1 | schema clean | EC-1 | psql "$DB_URL" -c "SELECT COUNT(*) FROM violations" | grep -q "^0$" | http:POST /api/signup | (none) | |

## Gate report
| AC-id | form | decidable | maps_to | core_rule |
|---|---|---|---|---|---|
| AC-1 | db | Y | EC-1 | n-a |

```json
{
  "slug": "absence-db",
  "acs": [
    {
      "id": "AC-1",
      "check": "psql \"$DB_URL\" -c \"SELECT COUNT(*) FROM violations\" | grep -q \"^0$\"",
      "kind": "integration",
      "pass": "exit 0",
      "trigger": "http:POST /api/signup",
      "seeds": "(none)",
      "signal": "",
      "maps_to": ["EC-1"],
      "evidence": "0"
    }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "wiring_total": 0,
    "wiring_mapped": 0,
    "no_new_components_reason": "fixture: minimal coverage for test",
    "boundary_fr": ["EC-1"],
    "boundary_fr_integration_ok": ["EC-1"]
  }
}
```
