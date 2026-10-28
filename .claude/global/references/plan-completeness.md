# Plan Mode Completeness

Load when: writing or reviewing a plan that moves, migrates or removes data/code, or changes shared state (DB schema, API contracts, shared types, config). `/cfn-plan-review` runs these checks; pointer lives in `~/.claude/rules/code-quality.md`.

### Dependency Tracing (before planning)
- Any plan that moves, migrates, or removes data/code must start by tracing ALL dependencies outward from the target entity.
- For databases: FK relationships, join tables, views, triggers, functions, computed columns, and any table referenced by the target's queries. Run `\dt` or dump the full schema first. Plan from the actual schema, not from memory or the task description.
- For code: imports, callers, shared types, config references, environment variables, and build dependencies.
- The plan is not ready until the full dependency graph is documented. A migration plan that names only the "obvious" table is incomplete by definition.

### Assumption Registry
- Every plan MUST include an explicit **Assumptions** section listing what the plan takes for granted.
- Each assumption must be phrased as a testable statement: "the listings table has no FK dependencies on other tables", "auth tokens are self-contained and not referenced by session records".
- The user reviews assumptions before implementation begins. Wrong assumptions caught here cost minutes. Wrong assumptions caught during implementation cost hours.

### Blast Radius Analysis
- For any plan that changes shared state (DB schema, API contracts, shared types, config), answer: "If we ship exactly this plan and nothing else, what breaks?"
- List every downstream consumer: other tables with FKs, services that call the API, code that imports the type, cron jobs that read the config.
- If you cannot enumerate downstream consumers, the investigation is incomplete. Stop and investigate before continuing the plan.

### Entity Completeness
- When a plan targets a named entity (table, service, module), investigate what that entity is actually made of before scoping the plan. "Migrate listings" means nothing until you know what listings depends on.
- For database entities: dump the schema, trace FKs in both directions, check for views and functions that reference the table, identify lookup/reference tables.
- For code entities: trace the import graph, identify shared state, check for runtime dependencies not visible in types.
