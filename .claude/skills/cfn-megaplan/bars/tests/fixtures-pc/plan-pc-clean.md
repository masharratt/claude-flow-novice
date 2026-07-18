# PLAN: pc-clean (valid produce/consume, one edge)

## Phase 2: Green (Implementation Steps)

| # | File (full path) | Change (exact) | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/auth/types.ts | add `interface Claims { sub: string }` | `src/auth/types.ts:Claims` | `-` | tests/types.spec.ts::shape | `vitest run tests/types.spec.ts 2>&1 | tee "$OUT"` | test green |
| 2.2 | src/auth/jwt.ts | add `verifyToken(t: string): Promise<Claims>` | `src/auth/jwt.ts:verifyToken` | `src/auth/types.ts:Claims` | tests/jwt.spec.ts::verify | `vitest run tests/jwt.spec.ts 2>&1 | tee "$OUT"` | test green |
