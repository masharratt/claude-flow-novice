# VERIFY: kind is a runner name, not a taxonomy kind (fireside pattern 5)

```json
{
  "slug": "bad-kind",
  "acs": [
    { "id": "AC-1", "check": "grep -c '#\\[serde(default)\\]' src/model.rs | grep -q '^4$'", "kind": "cargo-test", "pass": "count == 4", "trigger": "fn:model", "seeds": "(none)", "signal": "", "evidence": "4", "maps_to": ["EC-1"] }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 0, "fr_mapped": 0, "ec_total": 1, "ec_mapped": 1,
    "wiring_total": 0, "wiring_mapped": 0, "no_new_components_reason": "fixture: no new components",
    "core_fr": [], "no_core_mechanism_reason": "fixture: no core mechanism",
    "core_fr_assembled_path_ok": []
  }
}
```
