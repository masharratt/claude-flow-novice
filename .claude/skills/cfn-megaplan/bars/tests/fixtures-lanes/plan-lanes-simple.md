# PLAN simple

## Phase 2: Green (Implementation Steps)

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | `src/a.ts` | new | `src/a.ts:aa` | - | t/a | npm t | exit 0 |
| 2.2 | `src/b.ts` | new | `src/b.ts:bb` | - | t/b | npm t | exit 0 |

## Ops Integration Tasks

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 3.1 | `src/c.ts` | new | `src/c.ts:cc` | - | t/c | npm t | exit 0 |
