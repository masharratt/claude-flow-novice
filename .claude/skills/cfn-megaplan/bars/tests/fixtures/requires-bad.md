# VERIFY: malformed requires{} preconditions

```json
{
  "slug": "requires-bad",
  "acs": [
    { "id": "AC-1", "check": "npx vitest run t.spec.ts -t \"a\"", "kind": "integration", "pass": "1 passed", "trigger": "fn:a", "seeds": "(none)", "signal": "", "evidence": " Tests  1 passed (1)", "requires": { "env": ["not a var name"], "http": "localhost:3800" }, "maps_to": ["EC-1"] },
    { "id": "AC-2", "check": "npx vitest run t.spec.ts -t \"b\"", "kind": "integration", "pass": "1 passed", "trigger": "fn:b", "seeds": "(none)", "signal": "", "evidence": " Tests  1 passed (1)", "requires": { "db": "yes" }, "maps_to": ["EC-2"] }
  ],
  "done_rule": "all acs green",
  "coverage": {
    "fr_total": 0, "fr_mapped": 0, "ec_total": 2, "ec_mapped": 2,
    "wiring_total": 0, "wiring_mapped": 0, "no_new_components_reason": "fixture: no new components",
    "core_fr": [], "no_core_mechanism_reason": "fixture: no core mechanism",
    "core_fr_assembled_path_ok": []
  }
}
```
