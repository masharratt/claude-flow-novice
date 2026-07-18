# PLAN: pc-dangling (consume with no matching produce -> warn, exit 0)

| # | File (full path) | Change (exact) | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/auth/jwt.ts | add `verifyToken(t: string): Promise<Claims>` | `src/auth/jwt.ts:verifyToken` | `src/auth/types.ts:Claimz` | tests/jwt.spec.ts::verify | `vitest run tests/jwt.spec.ts 2>&1 | tee "$OUT"` | test green |
