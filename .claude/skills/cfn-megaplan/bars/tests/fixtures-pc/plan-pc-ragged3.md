# PLAN: pc-ragged3 (ragged row with 3 cells vs header 7 -> error)

| # | File (full path) | Change (exact) | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/auth/jwt.ts | add verify | token | `only` | tests/x | `run` | green |
