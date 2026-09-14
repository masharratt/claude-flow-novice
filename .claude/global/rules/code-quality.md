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
- **"Widen" in a step title is a smell: ask whether any existing value CHANGES.** A change described as widening a union is often a rename plus additions, and a rename breaks every literal consumer, including tests and fixtures no plan step names. Grep the OLD literal values, not the type name, and give each consumer file its own step. Tracing the call sites of the signature change is not enough: the literal-value consumers of the union it rides on are a different set. One such step produced breakages in a spend call, four source files and three test files in a single run, with typecheck red until the last one was fixed by hand.
- **Adding a field to a type does not make it reach storage when a hash gate sits downstream.** Where a pipeline persists a snapshot only when it differs (`changed = hash(new) !== storedHash`), the new field must participate in the hash function's own projection of "what counts as content". If it does not, a base whose only change is the new field hashes identically, the gate stays shut, and the enrichment is computed on every run and discarded forever, until something unrelated changes. Two checks when adding such a field: (1) the hash's projection includes it; (2) that inclusion cannot manufacture a spurious entry in a different consumer of the same diff (a field-level alert, say), with a unit test asserting the diff stays empty for a same-content-except-the-new-field comparison. Code review and isolated unit tests both pass on the broken version: nothing about any individual function is wrong.

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

## Checks and Guards Must Name Their Failure

A check that runs, reports, and cannot tell you which way it went is worse than no check: the
next session spends its turn on the wrong question. Four shapes of this, all measured:

- **A cardinality collapses the thing you needed to see.** Live tables carried 22 policies
  under one naming scheme; a migration creates 22 under another. Disjoint sets, identical
  count, so a COUNT-based check reports "intact" while every policy it guards is missing.
- **A bare boolean names neither direction nor members.** `expect(sameSet(a, b)).toBe(true)`
  prints `expected false to be true` and tells you nothing about what drifted.
- **A live-state read makes shared state the fixture.** An assertion on a live feature-flag
  value turns red when somebody else flips the flag, with no indication that the shared
  state, not the code, moved.
- **A check that examined nothing reports the same green as a check that examined
  everything.** A scan that excludes fixture rows by default examines zero rows in an
  environment where every row is a fixture. Two findings and no findings are different
  answers, but so are no findings and no rows, and only the check knows which it had.

Rules:

- When writing or reviewing any guard, post-apply check or schema assertion, ask what its
  output looks like when it fails. If the answer is a number, a bare boolean, or silence,
  make it emit both set differences by name: `missing=[...] unexpected=[...]`. That costs
  nothing and is self-explaining.
- Verify schema state by diffing the full live set against the migration source. Do not
  sample names: two sessions sampling for the same damage both produced wrong three-item
  lists.
- Any check that filters its own population must report that population's SIZE alongside its
  verdict, and a gate needs a distinct exit code for zero (0 clean, 1 findings, 2 read zero
  rows) plus a rendered line saying it certified nothing. Without it, the first run in a
  fresh environment reports the same green it will report on the day it matters.
- **A requirement covering N call sites is usually graded on some of them and reads as full
  coverage.** Coverage counters count mapped requirement ids, not call sites. A row named for
  a sibling function, and a static absence grep (no occurrence of a literal in a file, which
  says nothing about whether anything carries the predicate), both look like coverage and are
  not. At an exit gate, mutate EVERY site the plan enumerates, one at a time, running the
  whole manifest each time. Aim the mutation by first mapping the line to its enclosing
  function: the first predicate after a function name often belongs to the previous function.
  A surviving mutant means write the row and re-gate.

## Tests That Cannot Fail

A green suite is evidence only if the assertion could have gone the other way. Before
trusting a new test, watch it go red.

- **An identity comparison needs two distinct fixture ids.** A fixture that uses one id for
  both sides makes the axis under test unfalsifiable. One suite was 13 of 13 green while the
  live route answered 404 for every legitimate self-read, because the person id and the auth
  user id were the same constant. Name them separately (`FIXTURE_PERSON_ID`,
  `FIXTURE_AUTH_USER_ID`), split them BEFORE writing the regression test, and confirm the red.
  Same family as a fixture naming a real entity.
- **A mocked query proves you sent the SQL you expected, never that the server accepts it.**
  Column scoping, casts and `ON CONFLICT` targets only fail on a real database. A lease
  statement shipped with an ambiguous column reference (Postgres 42702) behind 19 green
  mocked tests, and every cron tick 500'd. For any new or edited raw statement, add an
  integration test that runs it against a real local database inside BEGIN/ROLLBACK.
- **Check the fixture shape against the validator, not against your eye.** Under zod v4,
  `z.string().uuid()` enforces the full RFC 4122 pattern, so a constant like
  `11111111-1111-1111-1111-111111111111` fails with `Invalid UUID` on its variant nibble.
  Use the `00000000-0000-4000-8000-<counter>` family. The value looks like a uuid, tests that
  never cross the schema pass, and the failure surfaces far away as a validation error from a
  route rather than from the fixture.

## Scripted Edits

Three ways a script that reports success leaves the tree worse than it found it. All three
matter more on a checkout shared with other sessions, where uncommitted work has no git
safety net.

- **Compute the content before you open the file for writing.** `open(path, "w").write(f(s))`
  evaluates the open first, so a raising `f` leaves the file at zero bytes. That destroyed a
  peer session's uncommitted paragraph in a hot doc; only a pre-edit hook backup recovered it.
  Compute into a variable, assert on it, then write. Prefer the Edit tool for in-place edits.
  If a scripted edit fails, check the file is not empty before anything else.
- **Never reference an earlier variable in the same `local` statement that declares it.**
  `local n="$1" f="$MIG/${n}.up.sql"` is broken in bash 5.2: every word expands before any
  assignment lands, so `${n}` resolves from the enclosing scope (or empty without `set -u`).
  If an enclosing loop uses the same name, the call silently operates on the wrong value and
  returns success. Split the declarations. When a scripted chain "succeeds" with zero effect,
  echo the computed path before trusting the return code.
- **Never trust a clean `git apply --unidiff-zero`.** A `-U0` hunk carries no context, so git
  applies each hunk at the new-side line number in its header, and those numbers assume every
  earlier hunk was applied. Drop some hunks and every later number is short by their line
  count, so kept insertions land inside unrelated statements. It applies cleanly and reports
  success; one such commit failed typecheck with 14 syntax errors, one per kept hunk after the
  first dropped one. Reconstruct the file instead: read the base blob, parse the hunks, keep
  the ones you own, sort by OLD-side start, and splice in one pass tracking position in the
  base. A single kept hunk, or kept hunks all preceding the first dropped one, happens to
  work. That is luck, not a rule.
