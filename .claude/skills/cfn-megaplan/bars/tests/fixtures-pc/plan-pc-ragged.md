# PLAN: pc-ragged (ragged row with wrong cell count -> error)

| # | File (full path) | Change (exact) | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/auth/jwt.ts | add `verifyToken(t: string): Promise<Claims>` | `src/auth/jwt.ts:verifyToken` | `src/auth/types.ts:Claims` extra-cell | tests/jwt.spec.ts::verify | `vitest run tests/jwt.spec.ts 2>&1 | tee "$OUT"` | test green |
