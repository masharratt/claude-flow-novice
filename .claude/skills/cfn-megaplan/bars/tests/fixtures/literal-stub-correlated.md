# VERIFY: [core] FR declared core_fr_requires_input_correlation; its mapped AC seeds a
# concrete token (seed:FACT_42) into the upstream LLM input AND references FACT_42 in
# its pass condition. A constant-valued handler stub cannot produce FACT_42 in the
# observed output, so the predicate proves the handler actually parsed the input.
# Rule (f) must PASS this. (CQR gap #1.)

```json
{
  "slug": "literal-stub-correlated",
  "acs": [
    {
      "id": "AC-1",
      "check": "cargo test tier_c_threads_llm_fact -- --exact",
      "kind": "assembled-path",
      "pass": "stdout contains \"cited fact=FACT_42\"",
      "trigger": "http:POST /api/deepen",
      "seeds": "seed:FACT_42 (inject this fact id into the LLM prompt fixture, assert it surfaces in the spoken turn)",
      "signal": "log line cited fact=FACT_42",
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
