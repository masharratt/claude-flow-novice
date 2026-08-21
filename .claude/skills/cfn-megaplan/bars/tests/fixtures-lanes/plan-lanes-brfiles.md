# PLAN br files

## Phase 2: Green (Implementation Steps)

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | `src/a.ts`<br>`src/b.ts` | new | `src/a.ts:aa` | - | t/a | npm t | exit 0 |

## Ops Integration Tasks

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 3.1 | `src/b.ts` | edit | `src/b.ts:bb` | - | t/b | npm t | exit 0 |
