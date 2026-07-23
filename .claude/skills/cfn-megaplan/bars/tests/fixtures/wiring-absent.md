# VERIFY: no wiring_total/wiring_mapped keys at all — wiring counters are now MANDATORY
# (not presence-keyed). Omission must FAIL: an opt-in wiring gate is dodgeable by silently
# leaving the keys out, which is the exact failure class that shipped the MP-A wiring gap
# (S004 rootcause). This fixture used to assert "absent = backward-compat pass"; that
# assertion is now INVERTED.

```json
{
  "slug": "wiring-absent",
  "acs": [
    {
      "id": "AC-1",
      "check": "vitest run t.spec.ts -t \"x\"",
      "kind": "unit",
      "pass": "returns exit 0",
      "maps_to": [
        "FR-1"
      ],
      "evidence": " Tests  1 passed (1)"
    }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 1,
    "fr_mapped": 1,
    "ec_total": 0,
    "ec_mapped": 0,
    "core_fr": [],
    "no_core_mechanism_reason": "n/a"
  }
}
```
