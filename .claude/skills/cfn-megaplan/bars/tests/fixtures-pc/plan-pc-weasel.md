# PLAN: pc-weasel (banned vague phrase in a produce cell -> error, exit 1)

| # | File (full path) | Change (exact) | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/auth/jwt.ts | add token verify | the relevant export as needed | `-` | tests/jwt.spec.ts::v | `vitest run x 2>&1 | tee "$OUT"` | green |
