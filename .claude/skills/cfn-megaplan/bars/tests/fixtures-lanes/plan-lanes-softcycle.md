# PLAN soft cycle

## Phase 2: work

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.0 | `src/a0.ts`<br>`src/shared.ts` | change | `src/a0.ts:a0` | `src/c0.ts:c0` | t/2.0 | npm t | exit 0 |
| 2.1 | `src/a1.ts`<br>`src/shared.ts` | change | `src/a1.ts:a1` | - | t/2.1 | npm t | exit 0 |
| 2.2 | `src/a2.ts`<br>`src/shared.ts` | change | `src/a2.ts:a2` | - | t/2.2 | npm t | exit 0 |

## Phase 3: work

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 3.0 | `src/c0.ts`<br>`src/shared.ts` | change | `src/c0.ts:c0` | - | t/3.0 | npm t | exit 0 |
| 3.1 | `src/c1.ts`<br>`src/shared.ts` | change | `src/c1.ts:c1` | - | t/3.1 | npm t | exit 0 |
| 3.2 | `src/c2.ts`<br>`src/shared.ts` | change | `src/c2.ts:c2` | - | t/3.2 | npm t | exit 0 |
