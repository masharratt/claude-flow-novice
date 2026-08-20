# Plan: multifile cells

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | `src/m/a1.ts`, `src/m/a2.ts`, `src/m/a3.ts`, `src/m/a4.ts`, `src/m/a5.ts` | add stuff | src/m/a1.ts:h1 | - | t/m.spec.ts::m1 | `vitest run t/m.spec.ts` | test green |
| 2.2 | src/m/a5.ts, src/m/a6.ts, src/m/a7.ts, src/m/a8.ts, src/m/a9.ts | add more | src/m/a6.ts:h2 | - | t/m.spec.ts::m2 | `vitest run t/m.spec.ts` | test green |
