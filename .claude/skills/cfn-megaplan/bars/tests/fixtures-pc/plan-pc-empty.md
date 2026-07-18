# PLAN: pc-empty (empty produce cell, neither identifier nor `-` -> error, exit 1)

| # | File (full path) | Change (exact) | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/auth/jwt.ts | add verify |  | `-` | tests/jwt.spec.ts::v | `vitest run x 2>&1 | tee "$OUT"` | green |
