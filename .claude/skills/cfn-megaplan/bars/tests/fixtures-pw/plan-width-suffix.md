# Plan: suffix rows

| # | File (full path) | Change | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | src/e/f1.ts | add `fn1()` | src/e/f1.ts:fn1 | - | t/e.spec.ts::e1 | `vitest run t/e.spec.ts` | test green |
| 2.2 | src/e/f2.ts | add `fn2()` | src/e/f2.ts:fn2 | - | t/e.spec.ts::e2 | `vitest run t/e.spec.ts` | test green |
| 2.3 | src/e/f0.ts | add `fn3()` | src/e/f0.ts:fn3 | - | t/e.spec.ts::e3 | `vitest run t/e.spec.ts` | test green |
| 2.4 | src/e/f1.ts | add `fn4()` | src/e/f1.ts:fn4 | - | t/e.spec.ts::e4 | `vitest run t/e.spec.ts` | test green |
| 2.5 | src/e/f2.ts | add `fn5()` | src/e/f2.ts:fn5 | - | t/e.spec.ts::e5 | `vitest run t/e.spec.ts` | test green |
| 2.6 | src/e/f0.ts | add `fn6()` | src/e/f0.ts:fn6 | - | t/e.spec.ts::e6 | `vitest run t/e.spec.ts` | test green |
| 2.7 | src/e/f1.ts | add `fn7()` | src/e/f1.ts:fn7 | - | t/e.spec.ts::e7 | `vitest run t/e.spec.ts` | test green |
| 2.8 | src/e/f2.ts | add `fn8()` | src/e/f2.ts:fn8 | - | t/e.spec.ts::e8 | `vitest run t/e.spec.ts` | test green |
| 2.9 | src/e/f0.ts | add `fn9()` | src/e/f0.ts:fn9 | - | t/e.spec.ts::e9 | `vitest run t/e.spec.ts` | test green |
| 2.10 | src/e/f1.ts | add `fn10()` | src/e/f1.ts:fn10 | - | t/e.spec.ts::e10 | `vitest run t/e.spec.ts` | test green |
| 2.11 | src/e/f2.ts | add `fn11()` | src/e/f2.ts:fn11 | - | t/e.spec.ts::e11 | `vitest run t/e.spec.ts` | test green |
| 2.12 | src/e/f0.ts | add `fn12()` | src/e/f0.ts:fn12 | - | t/e.spec.ts::e12 | `vitest run t/e.spec.ts` | test green |
| 2.13 | src/e/f1.ts | add `fn13()` | src/e/f1.ts:fn13 | - | t/e.spec.ts::e13 | `vitest run t/e.spec.ts` | test green |
| 2.14 | src/e/f2.ts | add `fn14()` | src/e/f2.ts:fn14 | - | t/e.spec.ts::e14 | `vitest run t/e.spec.ts` | test green |
| 2.15 | src/e/f0.ts | add `fn15()` | src/e/f0.ts:fn15 | - | t/e.spec.ts::e15 | `vitest run t/e.spec.ts` | test green |
| 2.7a | src/e/f1.ts | add `fn7a()` | src/e/f1.ts:fn7a | - | t/e.spec.ts::e7a | `vitest run t/e.spec.ts` | test green |
