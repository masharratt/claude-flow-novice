# PLAN: pc-dup (same identifier produced by two steps -> error, exit 1)

| # | File (full path) | Change (exact) | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/auth/types.ts | add `interface Claims { sub: string }` | `src/auth/types.ts:Claims` | `-` | tests/types.spec.ts::a | `vitest run x 2>&1 | tee "$OUT"` | green |
| 2.2 | src/other/dup.ts | re-add `Claims` | `src/auth/types.ts:Claims` | `-` | tests/dup.spec.ts::b | `vitest run y 2>&1 | tee "$OUT"` | green |
