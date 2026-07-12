# PLAN: clean (no weasel words, no optional-DI hits)

| # | File (full path) | Change (exact: function name, typed signature, or config key) | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|
| 1.1 | src/poll-loop.ts | interface PollLoopDeps { thread: Pick<ThreadManager,'reconcile'>; iterate: () => Promise<void> } | tests/poll-loop.spec.ts::wires_thread | vitest run tests/poll-loop.spec.ts | thread manager reconciled on each tick, deps.thread required |
| 1.2 | src/index.ts | createThreadManager(cfg): ThreadManager | tests/index.spec.ts::constructs_thread_manager | vitest run tests/index.spec.ts | index.ts constructs ThreadManager and passes it to pollLoop |
