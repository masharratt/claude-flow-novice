# Plan: ok widths

Lanes: A config, B db.

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/a/one.ts | add `f1()` | src/a/one.ts:f1 | - | t/a.spec.ts::x | `vitest run t/a.spec.ts` | test green |
| 2.2 | src/a/two.ts | add `f2()` | src/a/two.ts:f2 | - | t/a.spec.ts::y | `vitest run t/a.spec.ts` | test green |
| 3.1 | src/b/one.ts | add `g1()` | src/b/one.ts:g1 | src/a/one.ts:f1 | t/b.spec.ts::x | `vitest run t/b.spec.ts` | test green |
