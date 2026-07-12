# PLAN: optional-property token on a file NOT named in the core-fr-interfaces list
# (proves the scan is scoped, not repo-wide -- must produce ZERO findings)

| # | File (full path) | Change (exact: function name, typed signature, or config key) | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|
| 6.2 | src/other-module.ts | interface OtherDeps { cache?: CacheClient } | tests/other.spec.ts::x | vitest run tests/other.spec.ts | cache is optional, non-core |
