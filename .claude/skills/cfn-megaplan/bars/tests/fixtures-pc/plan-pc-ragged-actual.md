# PLAN: pc-ragged-actual (ragged row with too few cells -> error)

| # | File (full path) | Change (exact) | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/auth/jwt.ts | add verify | token | `only` | tests/x | run |
