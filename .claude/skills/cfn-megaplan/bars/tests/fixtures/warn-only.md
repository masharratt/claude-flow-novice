# VERIFY: clean ACs but out-of-band core FR missing runtime signal (WARN only, exit 0)

```json
{
  "slug": "warn-only",
  "acs": [
    { "id": "AC-1", "check": "cargo test w.rs::pub", "kind": "assembled-path", "pass": "status == published", "trigger": "worker:spawn", "seeds": "stories(1 row)", "signal": "", "maps_to": ["FR-2"] }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 1, "fr_mapped": 1, "ec_total": 0, "ec_mapped": 0,
    "wiring_total": 0, "wiring_mapped": 0, "no_new_components_reason": "warn-only fixture: no new composition-root components; testing runtime_signal_missing warn only",
    "core_fr": ["FR-2"], "core_fr_assembled_path_ok": ["FR-2"],
    "out_of_band_core_fr": ["FR-2"], "core_fr_runtime_observed": []
  }
}
```
