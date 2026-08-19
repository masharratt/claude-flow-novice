# VERIFY: stale-many-counts

| AC-id | criterion | binding | check | pass | trigger | seeds | signal |
|---|---|---|---|---|---|---|---|
| AC-1 | many things | FR-1 | check all | exit 0 | test | (none) | |

```json
{
  "slug": "stale-many-counts",
  "description": "creates 4 tables, 15 columns, 7 endpoints, 3 routes",
  "acs": [
    {
      "id": "AC-1",
      "check": "check all",
      "kind": "static",
      "pass": "exit 0",
      "trigger": "test",
      "seeds": "(none)",
      "signal": "",
      "maps_to": ["FR-1"],
      "evidence": "done"
    }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 1,
    "fr_mapped": 1,
    "ec_total": 0,
    "ec_mapped": 0,
    "wiring_total": 0,
    "wiring_mapped": 0,
    "no_new_components_reason": "fixture"
  }
}
