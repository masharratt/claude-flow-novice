# VERIFY: [core] FR declared core_fr_requires_input_correlation, but its only mapped AC
# seeds "(none)" and asserts a constant predicate. A handler that returns a literal
# TierCOutput { action: Deepen } satisfies "action == Deepen AND depth >= 1" without
# ever parsing the LLM output. Rule (f) must FAIL this. (CQR gap #1.)

```json
{
  "slug": "literal-stub-missing",
  "acs": [
    {
      "id": "AC-1",
      "check": "cargo test tier_c_default_action -- --exact",
      "kind": "assembled-path",
      "pass": "action == Deepen AND depth >= 1",
      "trigger": "http:POST /api/deepen",
      "seeds": "(none)",
      "signal": "",
      "maps_to": [
        "FR-3"
      ],
      "evidence": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.10s"
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
    "no_new_components_reason": "fixture: no new composition-root components; testing rule (f) only",
    "core_fr": [
      "FR-3"
    ],
    "core_fr_assembled_path_ok": [
      "FR-3"
    ],
    "core_fr_requires_input_correlation": [
      "FR-3"
    ]
  }
}
```
