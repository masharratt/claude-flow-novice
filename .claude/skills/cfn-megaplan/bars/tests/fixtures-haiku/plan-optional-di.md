# PLAN: optional DI on a named core-FR dependency interface (must WARN only, exit 0)

| # | File (full path) | Change (exact: function name, typed signature, or config key) | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|
| 6.2 | src/poll-loop.ts | interface PollLoopDeps { thread?: Pick<ThreadManager,'reconcile'>; iterate: () => Promise<void> } | tests/poll-loop.spec.ts::wires_thread | vitest run tests/poll-loop.spec.ts | thread manager reconciled on each tick |
