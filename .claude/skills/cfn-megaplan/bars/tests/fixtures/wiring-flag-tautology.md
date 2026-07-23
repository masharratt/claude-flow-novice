# VERIFY: wiring-guard AC gated on a feature/env flag token (must WARN, not FAIL)

```json
{
  "slug": "wiring-flag-tautology",
  "acs": [
    {
      "id": "AC-1",
      "check": "grep -c 'createThreadManager(' src/index.ts # gated on THREAD_REFACTOR_ENABLED flag",
      "kind": "wiring-guard",
      "pass": "count >= 1",
      "trigger": "fn:check-verifiable-static",
      "seeds": "(none)",
      "signal": "",
      "maps_to": [
        "FR-20"
      ],
      "evidence": "exit 0, 1 match"
    }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 1,
    "fr_mapped": 1,
    "ec_total": 0,
    "ec_mapped": 0,
    "core_fr": [],
    "no_core_mechanism_reason": "n/a",
    "wiring_total": 1,
    "wiring_mapped": 1
  }
}
```
