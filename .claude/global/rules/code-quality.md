---
description: Code quality standards enforced across all projects. Derived from recurring fix patterns across daily-seo, daily-coverage, and 6+ other projects. Includes enum completeness, regression test requirements, and scope challenge rules.
globs: "**/*"
---

# Code Quality Standards

## DRY & Modularity
- Enforce DRY rigorously: extract on the second occurrence, not the third.
- Before any multi-file feature or refactor, enter Plan Mode and identify (1) existing code that already does part of it, (2) shared logic to extract, (3) cross-project types/schemas needing one source of truth. Do not exit Plan Mode until DRY and modularity are addressed.
- One entry point per workflow; multiple triggers call a single orchestrator.

## God Files (split files that do too much)
- **Split at the second unrelated responsibility, not the tenth.** Code sharing no state or domain with the file goes in the right file (or a new one) now. "utils"/"helpers"/"index" are not dumping grounds.
- **Split by responsibility, not line count.** Group what changes together; extract the seam with the fewest cross-references (domain slice, I/O boundary) first. A 600-line single-responsibility file is fine; a 200-line file wiring auth + billing + email is not.
- **Soft ceilings triggering a split-or-justify check:** ~400 lines, ~40 exports, ~5 top-level responsibilities. Past any, split or leave a `cfn:` marker saying why not.
- A **god object** (one class/struct with unrelated state + methods) gets the same fix. Barrel/`index` re-export files are exempt (no logic to split).

## Deliberate Shortcuts (`cfn:` markers)
- Climb the build ladder first (`cfn-arch` skill): YAGNI → reuse in-codebase → stdlib → native platform → reuse installed dep → one line → minimum new code → (last resort) a NEW dependency.
- Trivial functionality (a few lines) must not pull a dep. Pin new deps with a ~90-day supply-chain cooldown, then move forward progressively; a security patch overrides the cooldown (take CVE fixes immediately).
- Security carve-out: never hand-roll crypto, auth, token/JWT parsing, or input sanitization to avoid a dependency; a widely-audited dep wins.
- Mark every deliberate shortcut inline `cfn: <ceiling>, <upgrade trigger>` (e.g. `# cfn: global lock, per-account locks if throughput matters`). A marker with no trigger silently rots; `cfn-tech-debt` harvests and flags them.
- `cfn:` markers cover *intentional under-engineering*, never skipped validation, error handling, security, or accessibility (non-negotiable per Definition of Done).

## No Stubs in "Done" Code
- **A function either works or does not exist yet.** Never report complete while code holds `throw "not implemented"`, `// TODO`/`// FIXME`, or placeholder returns (`return null` / `[]` / `true` / hardcoded fake values) standing in for real logic.
- **A deferred stub needs a `cfn:` marker** naming why it's deferred and what triggers the real implementation. An unmarked stub is a bug.
- **Never stub to make a test pass.** Green only because the code returns a constant is not coverage: the test is wrong or the code is a stub. Fix the real behavior.
- **Report stubs, don't bury them:** name each left-in stub and its `cfn:` location in the summary.

## Enum & Value Completeness
- A new enum value, status, or type variant is traced through ALL consumers: switch/match, serializers, DB constraints, API response handlers, UI renderers. Each handles it or explicitly ignores it; never add it to the type definition only.
- DB enum columns and code enum types stay in sync: a migration adding a DB value ships its code change in the same commit.
- Renaming or widening a union, or adding a field behind a hash-gated persist step: grep the OLD literal values and check the hash projection. Detail: `~/.claude/references/verification-traps.md`.

## Inter-Service Contracts
- Service-to-service calls (API, pipeline stage, trigger payload) share a TypeScript interface or Zod schema at the boundary; never loose objects.
- Cross-project API contracts have one source of truth for the response shape; clients define no drifting fallback schemas.

## LLM Output Enforcement
- Prompt-only constraints are insufficient: every user-facing LLM output passes a deterministic post-processing layer before use.
- Text-quality rules live in a shared constraints module applied after every LLM call, not copy-pasted into prompts.
- Adding a constraint to one prompt/stage means auditing ALL prompts/stages touching the same content.

## Canonical Constants
- URL path patterns, schema names, and structural identifiers are constants in ONE file; never hardcode the same string in multiple files.
- Resource budgets (DB pool limits, concurrency caps, rate limits) are named constants in shared config, not magic numbers.

## Null/Type Safety at Boundaries
- SQL aggregates (MAX, MIN, COUNT) return strings or null: always cast/wrap.
- ORM enum columns may return strings at runtime: compare as strings or cast explicitly.
- External API responses and DB results are boundaries: validate nulls even if types say non-null.

## Plan Mode Completeness
- Plans that move/migrate/remove data or code, or change shared state, trace all dependencies, list testable **Assumptions**, answer "what breaks if we ship only this?", and investigate what the target entity is made of. Load `~/.claude/references/plan-completeness.md` when writing such a plan.

## Docker & Build
- Docker, Next.js-in-Docker, Alpine and Rust build rules: load `~/.claude/references/stack-rules.md` when building images or Rust.

## Checks, Tests and Scripted Edits
- **Guards name their failure:** emit `missing=[...] unexpected=[...]`, never a bare count or boolean; report population size; exit 2 on zero rows read.
- **Watch every new test go red** before trusting it: distinct fixture ids per identity axis, real-DB test for raw SQL, fixture shape checked against the validator.
- **Scripted edits:** compute content before opening for write; never trust a clean `git apply --unidiff-zero`.
- Detail and incidents for all three: load `~/.claude/references/verification-traps.md` when writing a guard, a new test, or a scripted edit.
