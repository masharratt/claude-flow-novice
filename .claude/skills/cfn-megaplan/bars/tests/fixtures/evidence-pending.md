# VERIFY: evidence-pending

| AC-id | criterion | binding | check | pass | trigger | seeds | signal |
|---|---|---|---|---|---|---|---|
| AC-1 | email rejected | EC-1 | vitest run t.spec.ts -t "rejects" | body error == "invalid_email" | http:POST /api/signup | (none) | |
| AC-2 | worker publishes | FR-2 [core] | cargo test pub -- --exact | status flips to published, stdout contains "published story=<id>" | worker:spawn | stories(1 row) | log line published story=<id> |

## Gate report
| AC-id | form | decidable | maps_to | core_rule |
|---|---|---|---|---|
| AC-1 | unit | Y | EC-1 | n-a |
| AC-2 | assembled-path | Y | FR-2 | ok |

```json
{
  "slug": "evidence-pending",
  "acs": [
    {
      "id": "AC-1",
      "check": "vitest run t.spec.ts -t \"rejects\"",
      "kind": "unit",
      "pass": "body error == \"invalid_email\"",
      "trigger": "http:POST /api/signup",
      "seeds": "(none)",
      "signal": "",
      "maps_to": [
        "EC-1"
      ],
      "evidence": "PENDING: test not written yet (plan-time bless)"
    },
    {
      "id": "AC-2",
      "check": "cargo test pub -- --exact",
      "kind": "assembled-path",
      "pass": "status flips to published, stdout contains \"published story=<id>\"",
      "trigger": "worker:spawn",
      "seeds": "stories(1 row)",
      "signal": "log line published story=<id>",
      "maps_to": [
        "FR-2"
      ],
      "evidence": "PENDING: worker not implemented yet"
    }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 2,
    "fr_mapped": 2,
    "ec_total": 1,
    "ec_mapped": 1,
    "wiring_total": 0,
    "wiring_mapped": 0,
    "no_new_components_reason": "clean fixture: no new composition-root components introduced",
    "core_fr": [
      "FR-2"
    ],
    "core_fr_assembled_path_ok": [
      "FR-2"
    ],
    "out_of_band_core_fr": [
      "FR-2"
    ],
    "core_fr_runtime_observed": [
      "FR-2"
    ]
  }
}
```
