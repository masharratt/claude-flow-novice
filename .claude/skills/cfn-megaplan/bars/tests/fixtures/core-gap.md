# VERIFY: core FR with no clean assembled-path (core_fr not subset of assembled_path_ok)

```json
{
  "slug": "core-gap",
  "acs": [
    {
      "id": "AC-1",
      "check": "vitest run t.spec.ts -t \"x\"",
      "kind": "unit",
      "pass": "returns exit 0",
      "maps_to": [
        "FR-2"
      ],
      "evidence": " Tests  1 passed (1)"
    }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 2,
    "fr_mapped": 2,
    "ec_total": 0,
    "ec_mapped": 0,
    "wiring_total": 0,
    "wiring_mapped": 0,
    "no_new_components_reason": "core-gap fixture: no new composition-root components; testing core_fr assembled-path gap only",
    "core_fr": [
      "FR-2"
    ],
    "core_fr_assembled_path_ok": [],
    "out_of_band_core_fr": [
      "FR-2"
    ],
    "core_fr_runtime_observed": []
  }
}
```
