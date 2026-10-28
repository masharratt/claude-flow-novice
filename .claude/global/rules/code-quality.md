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
- Renaming or widening a union, or adding a field behind a hash-gated persist step: grep the OLD literal values and check the hash projection. Detail: `~/.claude/references/verification-traps.md`.

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
- Plans that move/migrate/remove data or code, or change shared state, trace all dependencies, list testable **Assumptions**, answer "what breaks if we ship only this?", and investigate what the target entity is made of. Load `~/.claude/references/plan-completeness.md` when writing such a plan.

## Docker & Build
- Docker, Next.js-in-Docker, Alpine and Rust build rules: load `~/.claude/references/stack-rules.md` when building images or Rust.

## Checks, Tests and Scripted Edits
- **Guards name their failure:** emit `missing=[...] unexpected=[...]`, never a bare count or boolean; report population size; exit 2 on zero rows read.
- **Watch every new test go red** before trusting it: distinct fixture ids per identity axis, real-DB test for raw SQL, fixture shape checked against the validator.
- **Scripted edits:** compute content before opening for write; never trust a clean `git apply --unidiff-zero`.
- Detail and incidents for all three: load `~/.claude/references/verification-traps.md` when writing a guard, a new test, or a scripted edit.
