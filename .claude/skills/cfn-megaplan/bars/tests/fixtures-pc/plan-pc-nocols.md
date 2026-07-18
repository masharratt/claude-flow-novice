# PLAN: pc-nocols (pre-feature plan, no Produces/Consumes columns -> clean exit 0)

| # | File (full path) | Change (exact) | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|
| 2.1 | src/auth/jwt.ts | add `verifyToken(t: string): Promise<Claims>` | tests/jwt.spec.ts::v | `vitest run x 2>&1 | tee "$OUT"` | green |
