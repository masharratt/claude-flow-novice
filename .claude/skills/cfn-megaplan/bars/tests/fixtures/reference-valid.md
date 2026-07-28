# VERIFY: reference-valid

| AC-id | criterion | binding | check | pass | trigger | seeds | signal |
|---|---|---|---|---|---|---|---|
| AC-1 | no antipattern | FR-1 | grep -c antipattern src/x.ts | count == 0 | fn:grep | (none) | |
| AC-2 | doc reference resolves | EC-1 | grep -c . CLAUDE.md | count >= 1 | fn:grep | (none) | |

## Gate report
| AC-id | form | decidable | maps_to | core_rule |
|---|---|---|---|---|
| AC-1 | static | Y | FR-1 | n-a |
| AC-2 | static | Y | EC-1 | n-a |

```json
{
  "slug": "reference-valid",
  "acs": [
    {
      "id": "AC-1",
      "check": "grep -c antipattern src/x.ts",
      "kind": "static",
      "pass": "count == 0",
      "trigger": "fn:grep",
      "seeds": "(none)",
      "signal": "",
      "reference": "https://example.com/ref.png",
      "maps_to": [
        "FR-1"
      ],
      "evidence": "0"
    },
    {
      "id": "AC-2",
      "check": "grep -c . CLAUDE.md",
      "kind": "static",
      "pass": "count >= 1",
      "trigger": "fn:grep",
      "seeds": "(none)",
      "signal": "",
      "reference": "CLAUDE.md",
      "maps_to": [
        "EC-1"
      ],
      "evidence": "42"
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
