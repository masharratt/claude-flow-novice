---
description: Code quality standards enforced across all projects. Derived from recurring fix patterns across daily-seo, daily-coverage, and 6+ other projects. Includes enum completeness, regression test requirements, and scope challenge rules.
globs: "**/*"
---

# Code Quality Standards

## DRY & Modularity
- Enforce DRY rigorously. Extract on the second occurrence, not the third.
- Before implementing any multi-file feature or refactor, enter Plan Mode and
  identify: (1) existing code that already does part of this, (2) shared logic
  that should be extracted, (3) cross-project types/schemas that must have a
  single source of truth. Do not exit Plan Mode until DRY and modularity
  concerns are addressed in the plan.
- One entry point per workflow. Multiple triggers must call a single orchestrator.

## God Files (split files that do too much)
- **Split at the second unrelated responsibility, not the tenth.** Adding code that shares no state or domain with what's already in the file? Put it in the right file (or a new one) now. Don't let "utils"/"helpers"/"index" become dumping grounds.
- **Split by responsibility, not by line count.** Group what changes together; extract the seam with the fewest cross-references (a domain slice, an I/O boundary) first. Cohesion decides — a 600-line single-responsibility file is fine; a 200-line file wiring auth + billing + email is not.
- **Soft ceilings that trigger a split-or-justify check:** ~400 lines, ~40 exports, ~5 top-level responsibilities. Past any, split or leave a `cfn:` marker saying why not.
- Same fix for a **god object** (one class/struct holding unrelated state + methods): split it by responsibility. Barrel/`index` re-export files are exempt — no logic to split.

## Deliberate Shortcuts (`cfn:` markers)
- Before writing new code, climb the build ladder (see `cfn-arch` skill): YAGNI → reuse in-codebase → stdlib → native platform → reuse installed dep → one line → minimum new code → (last resort) add a NEW dependency.
- A NEW dependency is the last rung, not a reflex. Trivial functionality (a few lines) must not pull a dep. Pin new deps with a ~90-day supply-chain cooldown, then move forward progressively; the cooldown is overridden by a security patch (take CVE fixes immediately).
- Security carve-out: never hand-roll crypto, auth, token/JWT parsing, or input sanitization to avoid a dependency. A widely-audited dep wins there.
- Mark every deliberate shortcut inline with `cfn: <ceiling>, <upgrade trigger>` (e.g. `# cfn: global lock, per-account locks if throughput matters`). The comment names the limit AND what should trigger an upgrade. A marker with no trigger silently rots — `cfn-tech-debt` harvests these and flags them.
- `cfn:` markers are for *intentional under-engineering*, never an excuse to skip validation, error handling, security, or accessibility (those are non-negotiable per Definition of Done).

## No Stubs in "Done" Code
- **A function either works or does not exist yet.** Never report code complete while it contains `throw "not implemented"`, `// TODO`/`// FIXME`, or placeholder returns (`return null` / `[]` / `true` / hardcoded fake values) standing in for real logic.
- **A deferred stub is allowed only with a `cfn:` marker** naming why it's deferred and what triggers real implementation (same contract as any deliberate shortcut). An unmarked stub is a bug, not a shortcut.
- **Never stub to make a test pass.** A test that goes green only because the implementation returns a constant is not coverage — either the test is wrong or the code is a stub. Fix the real behavior.
- **Report stubs, don't bury them.** If scope forces leaving a stub, say so explicitly in the summary with its `cfn:` location. Silent stubs reported as "done" are the failure this rule exists to catch.

## Enum & Value Completeness
- When adding a new enum value, status, or type variant, trace it through ALL consumers: switch/match statements, serializers, DB constraints, API response handlers, UI renderers.
- Never add an enum value to only the type definition. Every consumer must handle it or explicitly ignore it.
- DB enum columns and code enum types must stay in sync. A migration adding a DB value requires a code change in the same commit.

## Inter-Service Contracts
- When one service calls another (API, pipeline stage, trigger payload), define a shared TypeScript interface or Zod schema at the boundary. Never pass loose objects between services/stages.
- Cross-project API contracts must have a single source of truth for the response shape. Client projects must not define fallback schemas that can drift.

## LLM Output Enforcement
- Prompt-only constraints are insufficient. Every LLM output that becomes user-facing MUST pass through a deterministic post-processing layer before use.
- Text-quality rules belong in a shared constraints module applied after every LLM call, not copy-pasted into individual prompts.
- When adding a constraint to one prompt/stage, audit ALL other prompts/stages that touch the same content.

## Canonical Constants
- URL path patterns, schema names, and structural identifiers must be defined as constants in ONE file. Never hardcode the same string in multiple files.
- Resource budgets (DB pool limits, concurrency caps, rate limits) must be named constants in shared config, not magic numbers in individual files.

## Null/Type Safety at Boundaries
- SQL aggregate functions (MAX, MIN, COUNT) return strings or null. Always cast/wrap.
- ORM enum columns may return strings at runtime. Compare with string values or cast explicitly.
- External API responses and DB results are system boundaries. Validate nulls even if types say non-null.

## Plan Mode Completeness

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

## Bug Fix Regression Tests
- Regression test (required per CLAUDE.md Definition of Done) must name the bug in its test name or a comment, and reproduce the exact failure condition — not just the happy path.

## Docker & Build
- Next.js pages that query a database must be marked `force-dynamic` or wrapped in try/catch for Docker builds (no DB at build time).
- Test Docker builds locally before deploying. Never iterate via deploy-fail cycles.
- Alpine images: POSIX sh only. No bash, no GNU sed features.
