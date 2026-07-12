# PLAN: weasel word present (must FAIL, severity error)

| # | File (full path) | Change (exact: function name, typed signature, or config key) | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|
| 3.2 | src/gate/service.ts | handleResponse(res: Response): void | tests/gate.spec.ts::handles_response | vitest run tests/gate.spec.ts | response is handled appropriately |
