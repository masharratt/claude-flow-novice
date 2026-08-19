# PLAN: pc-ragged-too-many (ragged row with too many cells -> error)

| # | File (full path) | Change (exact) | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/auth/jwt.ts | add verify | token | `only` | tests/x | run | green | extra_cell_value |
