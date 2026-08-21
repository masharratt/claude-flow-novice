# PLAN cycle

## Phase 2: Green (Implementation Steps)

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | `src/a.ts` | new | `src/a.ts:aa` | `src/c.ts:cc` | t/a | npm t | exit 0 |

## Ops Integration Tasks

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 3.1 | `src/c.ts` | new | `src/c.ts:cc` | `src/a.ts:aa` | t/c | npm t | exit 0 |
