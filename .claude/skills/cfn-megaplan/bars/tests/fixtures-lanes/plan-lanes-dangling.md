# PLAN dangling

## Phase 2: Green (Implementation Steps)

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | `src/a.ts` | new | `src/a.ts:aa` | `node_modules/preexisting.ts:zz` | t/a | npm t | exit 0 |
