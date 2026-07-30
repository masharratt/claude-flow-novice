# Feature Status

**Last Updated:** 2026-07-29 | **Version:** 2.24.2 | **Status:** Production

---

## Purpose

This document tracks the production readiness of all Claude Flow Novice (CFN) npm package features. Use it to:
- Verify feature status before releases
- Identify test coverage gaps
- Understand component integration status
- Track development progress from Dev → Beta → Prod

## Structure

1. **Core Orchestration** - CFN Loop execution modes and coordination
2. **Skills System** - Reusable modular capabilities
3. **Agent Ecosystem** - Specialized AI agents by role
4. **CLI & Commands** - User-facing interfaces
5. **Infrastructure** - Databases, hooks, testing

## Update Requirements

This file MUST be updated when:
- Features move between Dev/Beta/Prod status
- New skills or agents are added
- Test coverage changes significantly
- Breaking changes are introduced

---

## Core Orchestration

### CFN Loop System

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| Loop 3 (Implementers) | ✅ Prod | ✅ | `.claude/skills/cfn-loop-orchestration/` | Coders, researchers, architects execute tasks |
| Loop 2 (Validators) | ✅ Prod | ✅ | `.claude/skills/cfn-loop-validation/` | Reviewers, testers validate output |
| Loop 1 (Product Owner) | ✅ Prod | ✅ | `.claude/agents/cfn-dev-team/product-owners/` | Strategic oversight, PROCEED/ITERATE/ABORT |
| Gate Check System | ✅ Prod | ✅ | `.claude/skills/cfn-loop-orchestration-v2/` | Threshold validation before Loop 2 |
| Consensus Collection | ✅ Prod | ✅ | `.claude/skills/cfn-loop-orchestration-v2/` | Validator aggregation with confidence scoring |
| gate-check.sh | ✅ Prod | ✅ 12/12 | `.claude/skills/cfn-loop-orchestration-v2/cli/` | Deterministic pass-rate parser (vitest/jest/pytest), exit-code gate, 0/0 never passes. `--baseline <int>` fails a shrinking suite (exit 3) to block test-deletion gaming (W3/G39, 2026-07-09); legacy output byte-identical when flag absent |
| verify-run.sh | ✅ Prod | ✅ 63/63 | `.claude/skills/cfn-loop-orchestration-v2/cli/` | Mechanical VERIFY-manifest executor (W1/G37-G52, 2026-07-11). run/resolve/summary/backfill-evidence; classifies each AC executable/db-query/needs_agent, refuses <3-line agent evidence, hash-checks manifest (exit 4 on tamper). AC verdict: green/red/unresolved/blocked. Forces red on skipped, todo, or zero-collected ACs (S003) to prevent green-by-skip. S005 (2026-07-22): every results row carries a `reason` naming the deciding rule, `summary.zero_ran` counts checks that matched no test, and a zero-ran check also prints to stderr during the run. S007 (2026-07-22): `playwright: <command>` now executes (only a prose body stays needs_agent — Bar A REQUIRED the prefix while this classified it needs_agent, so 27 rows went to hand-verification); manifest-level and per-AC `cwd` (monorepo runner configs, and playwright cannot run from a root where two `@playwright/test` versions resolve); per-AC `requires{env,db,http}` preconditions with a new **blocked** verdict so absent infra never reads as a broken feature; `backfill-evidence` writes each green row's real output back into the manifest, which is what makes the exit-stage bless satisfiable without a per-AC hand paste. Results JSON is single done authority; prose never counts. Drives cfn-loop-task Phase 5 Exit gate (5E). |
| check-test-hygiene.sh | ✅ Prod | ✅ 23/23 | `.claude/skills/cfn-loop-orchestration-v2/cli/` | Flags focused/skipped/todo markers and conditional skip patterns: `.only`, `.skip`, `.skipIf(`, `.runIf(`, `.concurrent.skip`, `fit`, `@pytest.mark.skipif` (S001, 2026-07-11). Detects `.skipIf(!FLAG)` pattern-skips that silently self-skip. Same-line `cfn-allow-skip:` = recorded quarantine. Findings = Phase 3 gate FAIL |
| parse-test-summary.sh | ✅ Prod | ✅ 44/44 | `.claude/skills/cfn-loop-orchestration-v2/cli/lib/` | Shared lib extracted (S002) from gate-check.sh; hoisted to both gate-check and verify-run for consistent AC verdict parsing. Zero-collected or any skipped/todo forces red (prevents pytest denominator-dropping bug). Runners: jest, vitest, pytest, node:test, cargo, cargo-nextest, go. S005 (2026-07-22) added the cargo/nextest/go branches — cargo output previously satisfied the pytest regex, so Rust runs reported `runner=pytest`, cargo's `ignored` never reached `PTS_SKIP`, and nextest matched nothing and fell back to exit-code-only. New `PTS_FILTERED` exposes the cargo/nextest "filtered out" count that identifies a selector/flag mismatch. cargo counts are summed across every `test result:` line (one per binary; reading only the last reads the doctest block). **Known limitation:** `go test` without `-v` prints no per-test lines and stays `unknown` (exit-code semantics). |
| deferrals.sh | ✅ Prod | ✅ 37/37 | `.claude/skills/cfn-loop-orchestration-v2/cli/` | Lane deferrals lifecycle (S006, 2026-07-11). New tool for record/gate/resolve: persists blocking items to `.deferrals_<slug>.json`, gates Phase 5 (5E.4a no-open-deferrals check), resolves on backlog. Fail-closed (zero deferrals required by default); cfn-loop-task.md Phase 5 exit gate reads and enforces it. |
| THRESHOLDS.md | ✅ Prod | n/a | `.claude/skills/cfn-loop-orchestration-v2/` | Single source of truth for gate/consensus/max-iter per mode |
| VERIFY manifest gate | ✅ Prod | ✅ | `cfn-loop-task.md` Phase 5 (5E) + `cfn-megaplan/bars/verifiable-done.md` | Loop done requires verify-run.sh proving every AC green mechanically, manifest unedited since Bar A (sha256 sidecar), no gamed tests, core FRs surviving a mutation probe, and all applicable gate skills run |
| Sonnet-hardened prompts | ✅ Prod | n/a | commands, skills, `agents/cfn-dev-team/` | Opus/Sonnet migration: mechanical gates, pinned contracts, shared agent prelude, dead-ref quarantine (docs/PROMPT_AUDIT_OPUS_SONNET_MIGRATION.md). 2026-07-03 follow-up: agent-builder rewritten as template enforcer (4-section template, validation checklist, never-change-model rule); remaining 17 profiles restructured to conform; full roster now conforming. 2026-07-03 (phase 2): 5 judgment-heavy profiles pinned to opus (root-cause-analyst, goal-planner, system-architect, product-owner, simplifier) for enhanced reasoning on complex decisions |

### Execution Modes

| Mode | Status | Tests | Location | Description |
|------|--------|-------|----------|-------------|
| Task Mode | ✅ Prod | ✅ | `.claude/commands/cfn-loop-task.md` | Main Chat spawns Task() agents directly ($0.15/iter) |
| CLI Mode | ✅ Prod | ✅ | `.claude/commands/cfn-loop-cli.md` | Coordinator spawns CLI agents ($0.054/iter) |
| MVP Mode | ✅ Prod | ✅ | Orchestrator config | Fast iteration, 70% gate, 5 max iterations |
| Standard Mode | ✅ Prod | ✅ | Orchestrator config | Balanced, 95% gate, 10 max iterations |
| Enterprise Mode | ✅ Prod | ✅ | Orchestrator config | Rigorous, 98% gate, 15 max iterations |

### Provider Routing

| Provider | Status | Tests | Location | Description |
|----------|--------|-------|----------|-------------|
| Anthropic | ✅ Prod | ✅ | Default | Native Claude integration |
| Z.ai | ✅ Prod | ⚠️ | `.claude/commands/cost-routing/` | GLM-4.6 model, 95-98% cost savings |
| OpenRouter | ⚠️ Beta | ⚠️ | `.claude/commands/cost-routing/` | Multi-model support |
| Kimi | ⚠️ Beta | ⚠️ | `.claude/commands/cost-routing/` | Balanced provider |
| Cerebras | ✅ Prod | ✅ | `.claude/skills/cfn-compilation-error-fixer/` | Bulk error fixing (20+ errors) |

---

## Skills System (.claude/skills/)

### Coordination Skills

| Skill | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| cfn-loop-orchestration | ✅ Prod | ✅ | `cfn-loop-orchestration/` | Core orchestrator v3.0 |
| cfn-loop-orchestration-v2 | ✅ Prod | ✅ | `cfn-loop-orchestration-v2/` | Gate checks, consensus |
| cfn-agent-lifecycle | ✅ Prod | ✅ 21/21 | `cfn-agent-lifecycle/` | Agent creation → deletion. S015 (2026-07-25): subagent lifecycle hooks fixed. cfn-subagent-start.sh crashed with NOT NULL constraint (INSERT omitted `name` and `updated_at`); canonical DDL extracted to schema.sql shared with execute-lifecycle-hook.sh (S015a). Both hooks read agent id/type from ENVIRONMENT VARIABLES (never set by Claude Code) instead of stdin JSON SubagentStart/SubagentStop payload (S015b); now parsed from stdin, env fallback for manual invocation. Added SQL escaping for single quotes. json_set(NULL, ...) silently wiped metadata column on stop; now COALESCE-guarded. cfn-subagent-start.sh set -euo pipefail relaxed to set -uo pipefail (nonzero hook exit interferes with spawns, bookkeeping must not block). Tests: 21 assertions, 21 passed / 0 failed, run against /tmp copy of DB. IMPORTANT: these hooks are NOT registered in any settings file yet; registration gated because duplicate SubagentStop writer already registered (cfn-agent-lifecycle/cli/lifecycle-hook.sh complete) and row owner must be decided first. |
| cfn-agent-spawning | ✅ Prod | ✅ | `cfn-agent-spawning/` | CLI agent spawning |

### Code Intelligence Skills

| Skill | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| cfn-codesearch | ✅ Prod | ✅ | `cfn-codesearch/` | Hybrid SQLite + pgvector semantic search |
| pgvector-storage | ✅ Prod | ✅ | `cfn-codesearch/src/store_pgvector.rs` | HNSW-indexed vector embeddings |
| doc-comment-extraction | ✅ Prod | ✅ | `cfn-codesearch/src/cli/index.rs` | Rust (///) and JSDoc (/**/) extraction |
| embedding-validation | ✅ Prod | ✅ | `cfn-codesearch/src/store_*.rs` | Dimension validation (1536) |
| cfn-codebase-reindex | ✅ Prod | ✅ | `cfn-codesearch/cfn-codebase-reindex/` | Incremental indexing |
| cfn-codebase-search | ✅ Prod | ✅ | `cfn-codesearch/cfn-codebase-search/` | Query interface |
| cfn-detect-stale-docs | ✅ Prod | ✅ | `cfn-codesearch/cfn-detect-stale-docs/` | Documentation freshness checking |

### Media & Ingestion Skills

| Skill | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| glm-video-ingest | ⚠️ Beta | ✅ | `glm-video-ingest/` | Loom/video → UI build spec (JSON+MD). Multi-provider: kimi-k2.6 (default, working), zai GLM-5V, gemini. Logs token usage per run. |

**Known limitations (glm-video-ingest):** Loom mp4/transcript endpoints unofficial; public Loom only (no workspace-private auth); zai needs paid balance; gemini `GOOGLE_API_KEY` expired. kimi-k2.6 verified end-to-end.

### Prompt Optimization Skills

| Skill | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| prompt-optimizer | ✅ Prod | ✅ 122/122 engine, 113/113 plugins | `prompt-optimizer/` | Provider-agnostic hill-climb prompt optimizer engine. State-isolated (BLOCKER-1: all writable paths under project-local `<project>/.claude/prompt-optimizer/`, never SKILL_DIR), provider-agnostic (BLOCKER-2: `engine/*` imports no provider SDK; the client lives in the plugin's `Target.generate`). Shared engine at `.claude/skills/prompt-optimizer/`; 8 engine TS modules (paths, budget, mutator, eval, optimize, rubric-core, source-patcher, types) + 7 test suites (122 tests). Engine fixes: held-out split with OVERFIT refusal, no-run tri-state, temperature-0 scoring, reject-and-regenerate, cost-Pareto tie-break. Live-run fixes L1-L12: L1 seed backup + seed-vs-final diff; L2 `Target.evalTemperature` + NONDETERMINISTIC SCORING warning; L3 `--holdout-repeats=N` + INCONCLUSIVE; L4 plugin `Target.pricing`; L5 RUBRIC SATURATED; L6 per-run vs lifetime budget; L7 `isMainModule` realpath; L8 backup-collision `wx`; L9 sample-count integrity (ran-count floor); L10 provider nondeterminism at temperature 0; L11 transient provider failure excluded per-fixture instead of killing the run; L12 final holdout pass skipped when the template is unchanged (was 20 paid calls comparing a template to itself). Plugins at `.claude/prompt-optimizer/`: commit-msg dogfood target plus rigged-overfit and rigged-noise refusal rigs (113 tests). All three holdout-gate outcomes proven against a live model: OVERFIT (rigged-overfit), INCONCLUSIVE/aborted (daily-coverage narration-base), INCONCLUSIVE/mixed-repeats (rigged-noise; see `planning/RIGS_refusal_paths_live.md`). `execute.sh` skill entry point. |

### Validation & Testing Skills

| Skill | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| cfn-loop-validation | ✅ Prod | ✅ | `cfn-loop-validation/` | Validation framework |
| cfn-test-framework | ✅ Prod | ✅ | `cfn-test-framework/` | Test orchestration |
| cfn-validation-framework | ✅ Prod | ✅ | `cfn-validation-framework/` | Test validation |
| cfn-edit-safety | ✅ Prod | ✅ 17/17 | `cfn-edit-safety/` | Pre/post-edit backup & validation. S016 (2026-07-25): post-edit pipeline unversioned and untracked (lived in gitignored dist/, no TypeScript source, hand-maintained). Moved to `.claude/hooks/post-edit-pipeline.js` tracked in repo. 10 validators referenced under nonexistent `.claude/skills/hook-pipeline/` path (added 2025-11-04 in ec9c69585/938d96e60, deleted 2025-11-05 in 304584e0b as collateral in bulk skill cleanup; dispatch table never updated, leaving 9 months of silent no-ops). Dispatches audited: 8 of 10 duplicated tooling already wired in or were broken (js-promise-safety duplicates eslint no-floating-promises; rust-future-safety duplicates cargo clippy; python-import-checker executed third-party __init__.py from post-edit hook; enforce-lf.sh rewrote files mid-edit and only matched application/javascript so all .js files silently skipped). Only bash-pipe-safety covered a real bug class (piped stderr hang under pipefail); shellcheck subsumes it, run non-blocking (exit 10, warning bucket). All 10 entries dropped from validatorsByExtension with removal-SHA comment to prevent restore from stale docs. Detection machinery (existsSync preflight, stderr warning, missing/dispatched counts, exit 9) deliberately kept and tested via CFN_HOOK_VALIDATORS/CFN_HOOK_SHELLCHECK_BIN seams. shellcheck wired for .sh/.bash, system binary (apt install shellcheck / brew install shellcheck), NOT installed on this machine so phase SKIPPED with stderr note (passed: null, never claimed as pass). `* text=auto eol=lf` added to .gitattributes (replaces enforce-lf.sh sed rewrite mid-edit, which was wrong layer). Tests: 7→12, all passed. Hook suite 152 passed / 0 failed. S020 (2026-07-26): Phase 2.7 cargo check wired for .rs edits. Prior .rs handling was placebo (3 regex quality checks plus advice text "run cargo clippy" that never invoked cargo; the a568d6ee5 audit's "cargo clippy covers it" claim was false, clippy was never wired). New phase: on .rs edit, walk up to nearest Cargo.toml (max 20 hops), run `cargo check --quiet --message-format=short` in crate root (180s timeout), parse short-format errors, ride the same non-blocking exit-10 warning bucket as shellcheck; SKIPPED with `passed:null` if cargo absent or no crate ancestor. `CFN_HOOK_CARGO_BIN` test seam. cargo 1.94.0 installed so runs live. 5 new jest tests (red->green, mock-based); 33 pre-existing PostEditValidator tests marked describe.skip (broken since 52e06b7f6, ESM/CJS mismatch). Regex quality block (println/unwrap/panic) retained: covers style cargo check does not. |
| cfn-persona-verify | ⚠️ Beta | ✅ 21/21 | `cfn-persona-verify/` | Role-coherence gate: compares implementation to role reality. Detects builds that are correct/tests-green but nonsense for the actor using them (e.g. manager with no approval capability). Schema mechanically enforced (21 negative controls), walkthrough unproven against live app. Wired into cfn-loop-task Phase 4 gate matrix (trigger: `frontend=yes` AND role docs present; runs last, scoped by `--fr`/`--ref`). NYSDRA reference project migrated: 8/8 role docs valid, 6 seeded rows. Known limitations: (1) walk has never driven a live app; (2) NYSDRA has no test-account env vars provisioned, so the pass cannot authenticate there yet; (3) several write checks degraded to `observe` because the app exposes no cleanup affordance (no expense withdraw, no OKR delete, no vendor delete, cancel-voucher is terminal) — notably the cancelled-voucher-cannot-be-approved money check lost its direct-action assertion and belongs in an executable check. Observe-only by default; capability-scoped writes opt-in, governed by marker invariant (pass may only act on rows it created). |

### Planning & Management Skills

| Skill | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| cfn-planning | ✅ Prod | ✅ | `cfn-planning/` | Epic decomposition, scope management |
| cfn-sprint-execution | ✅ Prod | ✅ | `cfn-sprint-execution/` | Sprint planning & checkpointing |
| cfn-task-planning | ✅ Prod | ✅ | `cfn-task-planning/` | Task decomposition |
| cfn-task-intelligence | ✅ Prod | ✅ | `cfn-task-intelligence/` | Task classification, complexity estimation |
| cfn-epic-creator | ✅ Prod | ✅ | `cfn-epic-creator/` | Epic workflow (11 persona reviews) |
| cfn-epic-parser | ✅ Prod | ✅ | `cfn-epic-parser/` | MDAP epic conversion |
| cfn-tech-debt | ✅ Prod | ✅ | `cfn-tech-debt/` | Harvest `cfn:` shortcut markers into a ledger; flags no-trigger rot. Feeds Product Owner gate (cfn-loop-task Phase 3.5) |
| cfn-megaplan Bar A (verifiable-done) | ✅ Prod | ✅ | `cfn-megaplan/bars/` | Static gate for Bar A manifests. Adds rule (f) `literal_stub_correlation` (seed-token correlation catches constant handler stubs on LLM/free-text/webhook inputs), `[boundary]` FR tag + `boundary_fr` integration coverage (forces real DB/HTTP ACs for ordering/filter/limit semantics), and cfn-plan-review Phase 2 signal-flow trace (flags `integration_lane_gap` BLOCKER for unowned external-input lanes). Presence-keyed opt-in; existing manifests unaffected. |
| cfn-workbench | 🚧 Draft | n/a | `.claude/skills/cfn-workbench/` | Renders a self-contained HTML progress page (planning/workbench_<slug>.html) from .cfn-cache/manifests + planning artifacts, showing how artifacts evolved across iterations. Deps: .cfn-cache/manifests, planning/VERIFY_*, planning/.VERIFY_<slug>.decisions.json (optional). Nocturne dark-theme re-skin (system font stack, no external requests) + Decisions section reading a per-run ledger (.VERIFY_<slug>.decisions.json). UI: sticky header with verdict headline + meta grid, section-nav anchors, state-label system (settled/waiting/unknown/action/fatal), fading .hr dividers, gaps strip, legend, sticky-column AC table, collapsible per-iter detail (140/140 render tests). Sticky header prints the project (repo dir name) so a dashboard says which project it belongs to. Auto-open + live re-render: render.sh --open (marker-tracked idempotent browser launch; WSL2 explorer.exe -> Windows default browser, xdg-open fallback; WORKBENCH_NO_LAUNCH=1 suppresses spawn for tests) and --live <secs> (injects <meta http-equiv=refresh> content=N, stays self-contained, no url=). Wired into /cfn-loop-task: RUN_ID=${SLUG:-$TASK_ID} keys test-output/lane-report/VERIFY_RESULTS to one slug so --slug finds them; render hooks at Phase 1 (open + first render), end Phase 2 (impl progress), Phase 3 gate boundary (every iteration, pass or fail), end Phase 5 (final, VERIFY_RESULTS populated). Known limitations: greenfield renderer, no existing HTML generator to displace; bless sidecar is SLUG-named so the bless section reads as a data gap in task mode (RUN_ID != SLUG) |
| cfn-megaplan-lite | ⚠️ Beta | n/a | `.claude/skills/cfn-megaplan-lite/` | Balanced-cut planning mode for medium features |

### Infrastructure Skills

| Skill | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| cfn-memory-persistence | ✅ Prod | ✅ | `cfn-memory-persistence/` | SQLite + Redis storage |
| cfn-error-management | ✅ Prod | ✅ | `cfn-error-management/` | Unified error handling |
| cfn-transparency-middleware | ✅ Prod | ✅ | `cfn-transparency-middleware/` | Audit trails (Rust) |
| cfn-parameterized-queries | ✅ Prod | ✅ | `cfn-parameterized-queries/` | SQL injection prevention |
| cfn-utilities | ✅ Prod | ✅ | `cfn-utilities/` | Bash utility functions |

### Deployment Skills

| Skill | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| cfn-skill-management | ✅ Prod | ✅ | `cfn-skill-management/` | Skill discovery & deployment |
| cfn-deployment-lifecycle | ✅ Prod | ✅ | `cfn-deployment-lifecycle/` | Skill promotion pipeline |
| cfn-project-management | ✅ Prod | ✅ | `cfn-project-management/` | Backlog & changelog |
| cfn-knowledge-base | ⚠️ Beta | ⚠️ | `cfn-knowledge-base/` | Organizational learning |

---

## Agent Ecosystem (.claude/agents/cfn-dev-team/)

### Coordinators

| Agent | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| cfn-v3-coordinator | ✅ Prod | ✅ | `coordinators/` | Primary orchestrator |
| cfn-frontend-coordinator | ✅ Prod | ✅ | `coordinators/` | React workflow coordination |
| handoff-coordinator | ✅ Prod | ✅ | `coordinators/` | Agent handoffs, context transfer |

### Developers

| Agent | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| backend-developer | ✅ Prod | ✅ | `developers/` | Backend services, APIs |
| react-frontend-engineer | ✅ Prod | ✅ | `developers/frontend/` | React components, UI |
| rust-developer | ✅ Prod | ✅ | `developers/` | Systems programming |
| database-architect | ✅ Prod | ✅ | `developers/database/` | Schema design, optimization |
| api-gateway-specialist | ✅ Prod | ✅ | `developers/` | Gateway design, routing |
| typescript-specialist | ✅ Prod | ✅ | `developers/` | Type safety, generics |
| graphql-specialist | ⚠️ Beta | ⚠️ | `developers/` | GraphQL APIs |
| agent-builder | ✅ Prod | ✅ | `developers/` | Agent template creation |

### Reviewers & Quality

| Agent | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| code-reviewer | ✅ Prod | ✅ | `reviewers/quality/` | Code quality validation |
| code-quality-validator | ✅ Prod | ✅ | `reviewers/quality/` | Technical debt assessment |
| security-specialist | ✅ Prod | ✅ | `reviewers/quality/` | Security review, threat modeling |
| analyst | ✅ Prod | ✅ | `analysts/` | Code analysis, metrics |

### Testers

| Agent | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| tester | ✅ Prod | ✅ | `testers/` | Comprehensive testing |
| playwright-tester | ✅ Prod | ✅ | `testers/` | E2E browser testing |
| interaction-tester | ✅ Prod | ✅ | `testers/` | UI, accessibility testing |
| perf-analyzer | ✅ Prod | ✅ | `testers/` | Performance analysis |
| test-validation-agent | ✅ Prod | ✅ | `testers/` | Test result validation |

### Product Owners

| Agent | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| product-owner | ✅ Prod | ✅ | `product-owners/` | GOAP planning, scope enforcement |
| cto-agent | ⚠️ Beta | ⚠️ | `csuite/` | Technical strategy |

### DevOps

| Agent | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| devops-engineer | ✅ Prod | ✅ | `dev-ops/` | CI/CD, infrastructure |
| docker-specialist | ✅ Prod | ✅ | `dev-ops/` | Container management |
| fly-io-specialist | ✅ Prod | ✅ | `dev-ops/` | Fly.io deployments |

### Specialists

| Agent | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| supabase-specialist | ✅ Prod | ✅ | `developers/database/` | Supabase CLI, migrations |
| memgraph-specialist | ✅ Prod | ✅ | `developers/database/` | Graph database, Cypher queries, MAGE algorithms |
| mem0-specialist | ✅ Prod | ✅ | `developers/database/` | AI memory layer, vector search, conversation memory |

---

## CLI & Commands (.claude/commands/)

### Primary Commands

| Command | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| /cfn-loop-task | ✅ Prod | ✅ | `cfn-loop-task.md` (3.2.0) | Task mode execution: derives lanes from planning/PLAN_<slug>.md (lane source), checks completion via planning/VERIFY_<slug>.md. MEGAPLAN_<slug>.md is an index/summary, never a lane source. 3.2.0 (2026-07-11): mechanical Phase 5 Exit gate (5E.0-5E.5 via verify-run.sh, MAY iterate to Phase 2 bounded by MAX_ITERATIONS), Phase 4 gate-wiring matrix (S004), Phase 3 hygiene scan + shrink-baseline + flaky protocol (S001), manifest hash check, deferrals gate (S006: 5E.4a enforces no-open-deferrals). |
| /cfn-loop-cli | ✅ Prod | ✅ | `cfn-loop-cli.md` | CLI mode execution |
| /cfn-fix-errors | ✅ Prod | ✅ | `cfn-fix-errors.md` | Automated error fixing |
| /cfn-check-errors | ✅ Prod | ✅ | `cfn-check-errors.md` | Error detection |
| /cfn-codesearch-search | ✅ Prod | ✅ | `cfn-codesearch-search.md` | Semantic code search |

### Planning Commands

| Command | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| /write-plan | ✅ Prod | ✅ | `write-plan.md` | TDD planning phase |
| /sparc | ✅ Prod | ✅ | `sparc.md` | SPARC methodology |
| /workflow | ✅ Prod | ✅ | `workflow.md` | Event-driven automation |
| /epic-creator-v2 | ✅ Prod | ✅ | `cfn-epic-creator-v2.md` | Epic creation (11 personas) |

### Utility Commands

| Command | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| /cfn-loop-document | ⚠️ Beta | ⚠️ | `cfn-loop/` | Documentation generation |
| /cfn-mode | ✅ Prod | ✅ | `cfn-loop/` | Toggle spawning mode |
| /cfn-switch-api | ✅ Prod | ✅ | `cost-routing/` | Switch API providers |

---

## Infrastructure

### Databases

| Component | Status | Tests | Location | Description |
|-----------|--------|-------|----------|-------------|
| SQLite Memory | ✅ Prod | ✅ | `.claude/skills/cfn-memory-persistence/` | Agent memory, audit trails |
| SQLite CodeSearch | ✅ Prod | ✅ | `~/.local/share/codesearch/` | Entity metadata, references, type usage |
| pgvector Embeddings | ✅ Prod | ✅ | PostgreSQL + pgvector | HNSW-indexed vector similarity search |

### Hooks System

| Hook | Status | Tests | Location | Description |
|------|--------|-------|----------|-------------|
| cfn-bash-search-hook.sh | ✅ Prod | ✅ 23/23 | `.claude/hooks/cfn-bash-search-hook.sh` | CodeSearch result injection into Claude Code context. S017 (2026-07-25): fixed JSON splicing bug. Hook built its response by directly interpolating raw sqlite3 output (newlines, quotes, backslashes) into a JSON string literal, producing invalid JSON that the harness discards without error surfacing. Root cause 2: even valid JSON at the top level was ignored—PreToolUse reads context from `hookSpecificOutput.additionalContext`, not a bare top-level `additionalContext` key. Now properly encoded with jq and emitted in the correct shape. Hook search hits logged successfully but injected nothing. |
| cfn-smart-search-hook.sh | ✅ Prod | ✅ 23/23 | `.claude/hooks/cfn-smart-search-hook.sh` | Bash symbol search with early-termination guard. S017 (2026-07-25): fixed stderr redirect routing and log overwrite bug. Hook exited 2 (blocking) but wrote reason to stdout instead of stderr, so users got a silent block with no escape-hatch hint. Root cause deeper: line 3 executes `exec 2>/tmp/...log`, redirecting real stderr to a log file, so a bare `>&2` would also be invisible. Original stderr now stashed on fd 3 before the log redirect. Also fixed log redirect from truncate `>` to append `>>` (was truncating the file its own log() function appends to on every run), and removed unguarded `local` declarations outside any function (printed bash error on every SQL hit, cluttering output). |
| cfn-precompact-enhanced.sh | ✅ Prod | ✅ 23/23 | `.claude/hooks/cfn-precompact-enhanced.sh` | Pre-compact source checks. S017 (2026-07-25): fixed unbound variable crash. Hook assigned nine git-derived variables only inside an `if git_available` branch but read them unconditionally at line 156. Under `set -euo pipefail`, this died with `MODIFIED_COUNT: unbound variable` whenever invoked outside a git repo—zero context preserved, violating its own "always exit 0, non-blocking" contract. All nine now initialized with defaults; hook never blocks regardless of environment. |
| cfn-hook-budget.sh | ✅ Prod | ✅ | `.claude/hooks/cfn-hook-budget.sh` | Shared timeout budget system for search hooks. New (2026-07-25). Search hooks registered with `timeout: 5` but per-step guards summed to 11s and 13s, so one slow dependency SIGKILL'd the hook mid-execution, losing telemetry log and block decision. Budget moved DOWN to 3000ms. Key findings: plain `timeout N` sends SIGTERM then waits indefinitely (measured 10002ms vs 2s limit). Grandchild escape from process group while holding stdout blocks the reader on EOF even after timeout (12001ms). `timeout -k` fixes only the first; capture-to-file fixes only the second. Both required. Deadlines computed from `/proc/uptime` (monotonic), not `date` (CLOCK_REALTIME, jumps back after host stall; observed -1533ms). Host freeze at 3.3s. Budget exhaustion must SKIP a step, never floor to `timeout 0` (no limit in coreutils). Timeout SIGKILLing its process group leaked `Killed` job-control chatter onto stderr (the block-decision stream). Suppressed. |
| Backup Restore & Cleanup | ✅ Prod | ✅ 74/74 | `.claude/skills/cfn-edit-safety/lib/backup/{restore,cleanup}.sh` | Out-of-band rollback and retention for pre-edit backups. S017 (2026-07-25): `edit-safety.sh`'s `rollback`/`list`/`cleanup` subcommands all read a registry at `/tmp/edit-safety/backup-registry.json` written only by `register_backup()`, called only from `safe_edit()`, which nothing invokes. That directory did not exist, so `rollback <file>` answered "No backup found" for all 1482 backups the live hook had written, and `cleanup` ran `find /tmp/edit-safety -name 'backup-*.tar.gz'` against a format nothing produces, reclaiming 0 bytes forever. Historical `restore.sh`/`cleanup.sh` (deleted 304584e0b) expected an incompatible older format (`backup_metadata.json`/`original_file`/`backup_ttl`) and were not resurrected. New `restore.sh`: `--list <file>` (newest-first), `--file <file>` (restores newest, taking a `restore-safety` backup of current content first so the restore is itself reversible), `--backup-id <ts_md5>`, positional backup dir; md5-vs-`file_hash` integrity gate refuses on mismatch unless `--force`; `--dry-run` throughout. New `cleanup.sh`: dry-run by default, `--apply` required to delete, `--older-than 7`, `--keep-latest N` per distinct original_file always wins over age, orphans (missing/corrupt metadata) counted but never deleted without `--prune-orphans`, 60s grace so a mid-flight `backup.sh` write is never mistaken for garbage (mutation-verified), flock against concurrent runs, refuses any backups root outside the repo, `--json` report. `edit-safety.sh` rewired to delegate; dead registry functions deleted rather than left as decoys. Live dry-run: 1495 scanned, 483 prunable, 14.8MB at 30-day/keep-2. Deprecation headers on `cfn-invoke-pre-edit.sh` and `backup.sh` corrected: they named replacements (`dist/cli/pre-edit-hook.js`, `backup-manager.ts`) whose sources were deleted in ec6203a3b and whose surviving artifacts are gitignored orphans or test stubs; the stated 2026-02-20 removal date would have deleted the only working backup path. |
| Pre-edit Backup | ✅ Prod | ✅ 18/18 | `.claude/hooks/cfn-invoke-pre-edit.sh` | Backup before file changes. S014 (2026-07-25): fixed stderr merge in pre-edit hook (captured `✅ Backup created:` banner into stdout path, so `BACKUP_PATH=$(...)` returned two lines and named no directory); fixed restore to understand both current and deprecated backup conventions, fixed `ls -t | head -1` pipe error under `set -euo pipefail` (glob mismatch exited 2, masking "no backup found" logic). All 1451/1451 on-disk backups now resolve to a restorable original. |
| Post-edit Validation | ✅ Prod | ✅ | `.claude/hooks/cfn-invoke-post-edit.sh` | Validate after changes. S017 (2026-07-25): two divergent pipelines consolidated to one. `config/hooks/post-edit-pipeline.js` (1399 lines, separate lineage, last touched Jan 2026) was a second implementation reached by 6 cwd-relative call sites in 3 scripts, so it resolved only when the caller sat in the CFN repo root and threw MODULE_NOT_FOUND from every other project. Not a stale copy: it uniquely carried TypeScript (tsc), ESLint, Prettier, cargo check, and Python/Go/Java/C++ phases. TypeScript/ESLint/Prettier ported into `.claude/hooks/post-edit-pipeline.js` (they filled the dead `results.typescript`/`.eslint`/`.prettier` keys the exit chain already branched on, making exit 1 TYPE_WARNING and exit 6 LINT_ISSUES reachable, and satisfying `validation.typescript.enabled=true` in cfn-post-edit.config.json which nothing had honoured). Ported with two fixes: tools resolved from `node_modules/.bin` instead of bare `npx` (original would DOWNLOAD eslint from the registry in projects lacking it), and run against the edited file's package root instead of process.cwd(). Not ported: JS/JSDoc block (used `require()` inside an ESM module, always threw), Python/Go/Java/C++ blocks (no result wiring, no exit codes, no consumers). Callers repointed to absolute paths via readlink -f + `git rev-parse --show-toplevel` with depth fallback. `config/hooks/` deleted. Selftest exit 0, 3 pre-existing unrelated warnings. |
| Session Start | ✅ Prod | ✅ | `.claude/hooks/SessionStart-*` | Session initialization |
| WSL Memory Monitor | ✅ Prod | ✅ | `~/.local/bin/wsl-memory-monitor.sh` | Kill orphaned test processes |
| Hook Self-Test | ✅ Prod | ✅ 32/32 | `.claude/hooks/cfn-hook-selftest.sh` | SessionStart validation: settings parse, registered hook paths resolve, no unguarded exec targets, orphan detection (S008, 2026-07-25) |
| Security Scanner | ✅ Prod | ✅ 32/32 | `.claude/skills/cfn-edit-safety/lib/hooks/security-scanner.sh` | De-symlinked from external /mnt/c path; detects secrets, API keys, JWT tokens, SQL injection, XSS patterns. Stderr output (not stdout) for FILE/TYPE/MATCHES lines to prevent JSON parse crashes (S009, 2026-07-25). Case-insensitive hardcoded-secret regex (S010, 2026-07-25). |
| Destructive Guard | ✅ Prod | ✅ 32/32 | `.claude/hooks/cfn-careful-guard.sh` | PreToolUse blocker for rm -rf, git push --force, database DROP/TRUNCATE. Added git checkout rule (S011, 2026-07-25). Fixed greedy sed bug: two-step quote extraction prevents JSON tail glue (S012, 2026-07-25). |
| Git Hook Installer | ✅ Prod | ✅ 47/47 | `.claude/hooks/install-git-hooks.sh` | Deploy credential-scanning git hook. Fixed core.hooksPath resolution (S013, 2026-07-25) so husky repos no longer silently ignore installs. Resolves both relative paths and absolute hooksPath values. Coverage expanded from 3/41 to 41/41 repos. |
| Pre-commit Credential Scan | ✅ Prod | ✅ 47/47 | `.claude/hooks/pre-commit` | Tracked source for credential-scanning git hook. Four critical bugs fixed (2026-07-25): (S010) infinite loop from read/append race on `TEMP_RESULTS`; (S011) fail-open via negation exit status always 0; (S012) credential leak via unshadowed `$pattern` in `is_whitelisted()`; (S013-S014) installer ignoring `core.hooksPath`. Added OpenAI (`sk-proj-`, legacy `sk-`+48) and GitHub (`ghp_`, `github_pat_`) patterns. Tests: 47 passed / 0 failed. Mutation-verified (reverting fixes produces 4 failures). |

### Docker Support

| Component | Status | Tests | Location | Description |
|-----------|--------|-------|----------|-------------|
| Agent Execution | ✅ Prod | ✅ | `docker/` | Isolated agent containers |
| Orchestrator | ✅ Prod | ✅ | `docker/` | Coordinator containers |
| Playwright Testing | ✅ Prod | ✅ | `docker/` | Browser test containers |
| Multi-worktree | ✅ Prod | ✅ | `docker-compose.yml` | Port auto-offset per branch |

### Testing Infrastructure

| Component | Status | Tests | Location | Description |
|-----------|--------|-------|----------|-------------|
| Jest Unit Tests | ✅ Prod | ✅ | `tests/` | Component/unit testing |
| Integration Tests | ✅ Prod | ✅ | `tests/` | Service integration |
| E2E Tests | ✅ Prod | ✅ | `tests/` | Playwright tests |
| Docker Tests | ✅ Prod | ✅ | `tests/` | Container testing |

---

## NPM Package (package.json)

### Package Info

| Property | Value |
|----------|-------|
| Name | claude-flow-novice |
| Version | 2.19.0 |
| License | MIT |
| Node | ≥18.0.0 |
| npm | ≥9.0.0 |
| Size | 12.5 MB (47.7 MB unpacked) |
| Files | 2,623 |

### Key Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build project |
| `npm run test` | Full test suite |
| `npm run test:unit` | Unit tests only |
| `npm run test:integration` | Integration tests |
| `npm run test:e2e` | E2E Playwright tests |
| `npm run lint` | ESLint checks |
| `npm run typecheck` | TypeScript validation |
| `npm run ci:pre-commit` | Pre-commit checks |
| `npm run ci:full` | Full CI pipeline |

### Key Dependencies

| Package | Purpose |
|---------|---------|
| @anthropic-ai/sdk | Claude API integration |
| express | HTTP server |
| ioredis | Redis client |
| sqlite3 | Local storage |
| jest | Testing framework |
| playwright | Browser automation |
| typescript | Type checking |

---

## Test Coverage

| Area | Files | Coverage | Notes |
|------|-------|----------|-------|
| Unit Tests | 50+ | High | Component/unit level |
| Integration Tests | 30+ | Medium | Service integration |
| E2E Tests | 20+ | Medium | Playwright tests |
| Docker Tests | 10+ | Medium | Container testing |
| Skill Tests | 15+ | Medium | Skill validation |

---

## Status Legend

| Icon | Meaning |
|------|---------|
| ✅ Prod | Production-ready, fully tested |
| ⚠️ Beta | Feature complete, limited testing |
| ⚠️ Dev | Under development |
| ❌ None | Not implemented or no tests |

---

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Task Mode Cost | $0.15/iteration | Full visibility, debugging |
| CLI Mode Cost | $0.054/iteration | Production, cost-optimized |
| Z.ai Routing Cost | $0.004-0.010/iteration | 95-98% savings |
| Memory per Agent | 1-2 GB | CLI: 1GB, Task: 2GB |
| Redis Latency | <100ms | Agent wake-up time |
| CodeSearch Speed | 400x | Faster than grep |

### Mode Thresholds

| Mode | Gate | Consensus | Max Iterations | Validators |
|------|------|-----------|----------------|------------|
| MVP | ≥0.70 | ≥0.80 | 5 | 2 |
| Standard | ≥0.95 | ≥0.90 | 10 | 3-5 |
| Enterprise | ≥0.98 | ≥0.95 | 15 | 5-7 |

Canonical source: `.claude/skills/cfn-loop-orchestration-v2/THRESHOLDS.md`. Planning tiers `mvp|beta|enterprise` (cfn-megaplan) map to execution modes `mvp|standard|enterprise`; `beta` maps to `standard`. Gate computed by `cfn-loop-orchestration-v2/cli/gate-check.sh` (exit 2 on 0/0, never passes).

### Timeouts

| Loop | Timeout | Notes |
|------|---------|-------|
| Loop 1 (PO) | 300s | Strategic decisions |
| Loop 2 (Validators) | 600s | Review and validation |
| Loop 3 (Implementers) | 900s | Code execution |
| Minimum | 60s | Lower bound |
| Maximum | 1800s | Upper bound |

---

## Architecture Notes

**Package Type:** npm package for Claude Code setups

**Integration Pattern:**
```
Consumer Project
       │
       ▼
┌──────────────────────────────────────┐
│  claude-flow-novice (npm package)    │
│  ┌─────────────┐  ┌──────────────┐  │
│  │ Skills (41) │  │ Agents (74)  │  │
│  └──────┬──────┘  └──────┬───────┘  │
│         │                │           │
│         └────────┬───────┘           │
│                  ▼                   │
│         CFN Loop Orchestration       │
└──────────────────────────────────────┘
```

**Coordination Patterns:**
- Chain: Sequential agent execution
- Broadcast: Parallel agent spawning
- Mesh: Multi-agent bidirectional communication
- Consensus: Validator aggregation with scoring

---

## Security Features

| Feature | Status | Location |
|---------|--------|----------|
| Input Validation | ✅ Prod | Joi schemas across skills |
| Secret Protection | ✅ Prod | Environment-based, no hardcoding |
| SQL Injection Prevention | ✅ Prod | `cfn-parameterized-queries/` |
| Audit Logging | ✅ Prod | SQLite + Redis trails |
| ACL Levels | ✅ Prod | Levels 1-5 for agents/skills |

---

---

## GOAP Planning System

| Module | Status | Tests | Location | Description |
|--------|--------|-------|----------|-------------|
| goap-core | Beta | 33 | `src/planning/goap/` | A* planner, world state, cost model, bash CLI bridge |
| agent-selection | Beta | 7 | `src/planning/agent-selection/` | GOAP-based spawn-failure substitution |
| error-recovery | Beta | 11 | `src/planning/error-recovery/` | GOAP-driven retry/recover/escalate decisions |
| orchestration-planner | Beta | 12 | `src/planning/orchestration/` | Budget-aware loop gate decisions |
| dependency-extractor | Beta | 11 | `src/planning/dependency-extractor/` | Epic markdown parser, DAG builder, critical path |
| scheduling | Beta | 7 | `src/planning/scheduling/` | GOAP-based task batch scheduling with failure replanning |
| product-owner-goap | Beta | 34 | `src/cfn-loop/product-owner/` | MVP + Enterprise PO decision engines |

**Dependencies:** GOAP core required by all other GOAP modules. Compiled output at `dist/planning/` required for bash CLI bridges.

**Known limitations:** Bash CLI bridges require `npm run build` before activation. Slug matching in dependency-extractor requires `Dependencies: Phase N` (without trailing description) to match phase IDs reliably.

---

## Planning Pipeline (MegaPlan)

### Tiered Orchestrator

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| cfn-megaplan orchestrator | ⚠️ Beta | ⚠️ wiring | `.claude/skills/cfn-megaplan/` | Tiered DAG entry point; supersedes cfn-spa-plan. Multi-plan program support: shared decision register, cross-plan seam ledger, program build-order DAG, back-propagation rule for forced items. PLAN_ persistence gate (cfn-loop-task lane source). Bar B CONDITIONAL-PASS for sibling-blocked plans in multi-plan programs. v1.2.0 (2026-07-16): §1a presence gate added (actor inventory mandatory when frontend: yes OR db: yes; same gate class as §1b); SPEC row in DAG deps updated to include Actors (§1a). v1.1.0: mechanical [OPEN] triage (blocks only if artifact section is downstream-consumed or touches security floor; everything else self-parks with conservative [PARKED:] default), patch-mode loop-backs for Bar A/B (fix named findings only, escalate after 2 failed rounds), per-phase model key in tier profiles (structure phases + ux + ops stay opus; terminals drop to sonnet; enterprise no downgrades). |
| Inclusion profiles | ✅ Prod | ✅ | `.claude/skills/cfn-megaplan/profiles/` | mvp/beta/enterprise phase inclusion (JSON-validated). v1.3.0 (2026-07-16): profiles/tests/test-profiles.sh enforces Step 3a model invariants (5/5 pass), validates per-phase model assignments. v1.2.0 (2026-07-09): test_plan gains concurrency/adversarial_data/viewport_matrix/obs_verification/migration_rehearsal (mvp drops, beta+ extras); ops tokens unchanged |
| Bar A: verifiable-done | ⚠️ Beta | ✅ 59/59 | `.claude/skills/cfn-megaplan/bars/verifiable-done.md` + `bars/check-verifiable-static.sh` | Every AC carries executable check. Mechanical static pass (S004, 2026-07-11): check-verifiable-static.sh lints taxonomy/pass-decidability/weasel/coverage. REQUIRED keys `wiring_total`/`wiring_mapped` (mandatory unless `wiring_total: 0` with `no_new_components_reason`); `wiring-guard` AC kind, WARN-only flag-tautology detection. Presence-keyed coverage keys cc/sm/obs_required/adv/migration_rehearsal/viewport/wiring lint when present. S007 (2026-07-22): new REQUIRED per-AC `evidence` field (the check's real output) with a `--stage plan\|exit` split — `PENDING: <reason>` is legal at plan time (the code does not exist yet) and an error at the exit bless; `evidence_zero_ran` rejects pasted output showing 0 tests collected; `kind` is now a closed vocabulary (unrecognized = error, so `kind: cargo-test` with a grep body can no longer dodge every taxonomy rule by matching none); `unrunnable_selector` rejects the `file::testname` shorthand no runner implements (89 of one field manifest's 104 checks); `requires{env,db,http}` shape lint. |
| bless-verify.sh | ✅ Prod | ✅ 29/29 | `.claude/skills/cfn-megaplan/bars/` | The only supported way to bless a VERIFY manifest (S007, 2026-07-22). Replaces the hand-run `sha256sum > sidecar` one-liner: gates on `check-verifiable-static.sh` (refuses to pin anything on an error finding — blessing was previously self-service), writes the sidecar, snapshots the manifest, and appends a per-bless ledger entry naming which ACs moved in which fields. Reports `structure_changed` (AC set / id / kind / maps_to moved) and `predicate_changed` (a `pass` condition moved — the gaming vector) on separate axes so a reviewer never infers one from the other. `--stage plan\|exit` passes through to the static checker. |
| Manifest integrity hash | ✅ Prod | ✅ | `planning/.VERIFY_<slug>.sha256` + `.bless.json` + `.blessed.json` (bless-verify.sh / verify-run.sh) | Sidecar sha256 of the Bar A-blessed VERIFY file (W2/G38, 2026-07-09). cfn-loop-task Step 0 + verify-run.sh refuse a manifest edited since Bar A; missing sidecar = warn (pre-hash-era). S007: the sidecar is now written only by `bless-verify.sh`, alongside an append-only bless ledger and a manifest snapshot for diffing. |
| check-haiku-static.sh | ✅ Prod | ✅ 13/13 | `.claude/skills/cfn-megaplan/bars/` | Bar B weasel/structure scan (S005, 2026-07-11). Weasel patterns sourced from shared `bars/weasel-phrases.txt`. New scoped warn-only optional-DI scan: core-FR components must use non-optional DI at composition root (compile-error if omitted, not silent no-op); exceptions require DECISIONS register entry, not inline comment. |
| Bar B: haiku-executable | ⚠️ Beta | ✅ | `.claude/skills/cfn-megaplan/bars/haiku-executable.md` | Every step unambiguous. Rejects optional-DI for core-FR components on compilation bar; optional dependencies allowed only for non-core, with exception registered in DECISIONS. Static + probe scan. |

### Planning Phase Skills

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| cfn-research | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-research/` | Pre-spec feasibility, prior-art query |
| cfn-spec | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-spec/` | Requirements → acceptance criteria. v1.1.0 (2026-07-16): Step 1a Actor Inventory added (mandatory when frontend: yes OR db: yes; required at megaplan L2, consumed verbatim by cfn-arch AuthZ and cfn-data RLS at L5 and L4). v1.0.0: Step 1b (Interaction Intent Walk, 2026-07-08) surfaces intent choices on user-facing surfaces before schema locks (archetype bundles, 7-dimension coverage, resolved vs [OPEN] items track). Post-edit hooks validate sections/FRs. No automated test coverage yet; validated by gate presence check in cfn-megaplan §1b gate |
| cfn-decide | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-decide/` | Decision register + structured decision-log write |
| cfn-decisions | ⚠️ Beta | ✅ 38 | `.claude/skills/cfn-decisions/{record.sh,hook.sh,lib/}` | Per-run decisions-ledger writer. Produces `planning/.VERIFY_<slug>.decisions.json` (atomic upsert-by-key on (slug,id) via mktemp+mv) consumed by cfn-workbench section-decisions.sh renderer, and dual-writes the global SQLite register through decision-log/record.sh (best-effort). hook.sh coordinator bridge DRY-extracts the 3 FR-7 loop hook sites (cfn-loop-task Phase 4.2 PO, Phase 5 batch, Phase 5E.4 quarantine) into one wrapper owning D-8 isolation (always exit 0 so the loop continues) plus per-site log marker. Exit taxonomy 0-8 (code 6 reserved, never emitted per D-7). 38 TDD tests: upsert cardinality, atomic write, dual-write parity, D-8 isolation, SQL/jq injection, hook-wrapper runtime. megaplan SKILL.md:215 site 4 static substitution. |
| cfn-arch | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-arch/` | Architecture + composition root (S004, 2026-07-11). v1.1.0 (2026-07-16): Step 6 AuthZ matrix columns now bind verbatim to SPEC §1a Actor names (no role invention/rename/merge); same boundary as cfn-data RLS policy (one source of truth). Names the main composition root and core-FR component boundaries; feeds wiring-guard AC generation in cfn-test-plan Phase 3. Identifies DI requirements (non-optional for core FRs per Bar B). |
| cfn-data | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-data/` | Forward DB design + field-bindings (RLS floor). v1.1.0 (2026-07-16): Step 4 RLS Principal/role set sourced verbatim from SPEC §1a Actor Inventory; every §1a actor accounted for per table (explicit allow or explicit no-access note); cfn-arch AuthZ derives from same §1a table at L5, one-source-of-truth design prevents independent role-set drift. |
| cfn-ux | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-ux/` | Full interaction: affordance map (FK→dropdown) + per-field interaction + edge states + flows/journeys + feedback/undo + role visibility. Reads §1b resolved intent as settled; does not re-open answered dimensions |
| cfn-design | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-design/` | Visual/layout/design-system/a11y/i18n + responsive/touch + content/microcopy + API contract |
| cfn-test-plan | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-test-plan/` | AC→executable-check table (feeds Bar A). Phase 3 (S004, 2026-07-11) now emits WIRE-n call-site ACs for each composition-root component wiring, auto-populated in wiring_total/wiring_mapped counts. Producer side names wiring in mandatory Bar A coverage keys. |
| cfn-ops | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-ops/` | Threat model/observability/rollout (beta+). Pairs with cfn-migration-rehearsal on up/down scripts; cfn-loop-task Phase 4 gate-matrix wires migration-rehearsal test ACs. |

### Decision Log (structured records)

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| Structured decision store | ✅ Prod | ✅ | `.claude/skills/decision-log/{schema.sql,record.sh,ingest.sh,decisions.sh}` | SQLite `decisions` table; cross-session, per-project; write via record.sh, read via decisions.sh. Incremental ingest runs at SessionStart (hook registered in `~/.claude/settings.local.json`) and detaches via `setsid` so startup never blocks; `ingest.sh` is the single source of truth for parsing. ingest.sh (2026-07-24) fixed two critical bugs: SQL string literals now use single quotes with doubled internal quotes (jq @json emitted backslash-escaped JSON that SQLite could not parse, dropping messages with double quotes and causing parser desync); text extraction now handles both string and array formats, so modern session files with block-type messages no longer skip user turns. Verified recovery: 15,333 → 28,917 messages across 99 session files; NSC 170→3,005, fireside-family 963→3,482, daily-agents/keystone/gsrx never indexed until now. Cursor caveat (2026-07-24): `ingest.sh` advances `last_line` to EOF whether or not rows inserted; after any parser fix, reset `last_line=0` before backfilling to recover missed messages. Re-ingest is idempotent via `UNIQUE uuid` + `INSERT OR IGNORE`. |

**Dependencies:** cfn-megaplan reads cfn-spec build flags to route conditional phases. cfn-ux consumes cfn-data field-bindings. cfn-decide writes to decision-log SQLite (read by cfn-megaplan Step 0 + cfn-plan-review Phase 1).

### Post-Merge Gates (manifest -> cfn-vote-implement)

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| cfn-security-review | ✅ Prod | ✅ 10/10 | `.claude/skills/cfn-security-review/` | Post-impl security gate on the diff (injection, authz, secrets, RLS, headers, unscoped DELETE, input). Emits manifest. Never auto-fixes |
| cfn-dep-audit | ✅ Prod | ✅ 8/8 | `.claude/skills/cfn-dep-audit/` | Supply-chain gate: ~90-day cooldown on new deps + immediate-CVE carve-out (npm/pnpm/yarn/cargo audit). Emits manifest |
| cfn-perf-gate | ✅ Prod | ✅ 29/29 | `.claude/skills/cfn-perf-gate/` | Runs CFN_PERF_BENCH_CMD, diffs vs `.cfn-cache/perf-baseline.json`, emits manifest per path regressed beyond CFN_PERF_THRESHOLD_PCT (default 10). Never auto-fixes |
| cfn-a11y-gate | ✅ Prod | ✅ 5/5 | `.claude/skills/cfn-a11y-gate/` | Local WCAG gate: axe-core via Playwright against CFN_A11Y_URLS, emits manifest per violation. Not a GitHub Action. v1.0.1 (2026-07-24): runner moved to .cjs for CommonJS require() support under ESM parent packages; NODE_PATH built from project's node_modules walk (both invocation dir and git root); dependency check now distinguishes genuine module-not-found (exit 3 with install instruction) from other runtime errors (exit 4 with full error); exit codes and error messages now fully deterministic |
| cfn-ab-critic | ⚠️ Beta | n/a | `.claude/skills/cfn-ab-critic/` | Blind A/B critic gate: compares a build artifact against a reference artifact (labels shuffled so the critic cannot tell which is "ours"); emits a vote-manifest when ours loses or confidence < threshold. Triggered by an AC carrying a `reference` key. Deps: cfn-vote-implement, cfn-megaplan/bars (verifiable-done `reference` key). Known limitations: optional gate; only fires when an AC opts in via `reference`; the LLM judgment is a two-phase handoff (phase 1 emits a blinded prompt, the agent re-invokes with verdicts) until a non-Anthropic vision/text compare MCP is reachable in-process |
| cfn-migration-rehearsal | ✅ Prod | ✅ 6/6 | `.claude/skills/cfn-migration-rehearsal/` | Rehearses migration up+down round-trip against CFN_SCRATCH_DATABASE_URL only; refuses prod. Executes what cfn-ops designs |
| docs-sync pre-commit check | ✅ Prod | ✅ 9/9 | `.claude/hooks/cfn-docs-sync-check.sh` | Warns (blocks if CFN_DOCS_SYNC_STRICT=1) when a code commit omits feature-status.md / state-machines.md |

**Gate dependencies:** cfn-security-review + cfn-dep-audit + cfn-perf-gate + cfn-a11y-gate emit manifests to `.cfn-cache/manifests/` consumed by cfn-vote-implement (3/3 auto, 2/3 product-owner, 1/3 batched user). cfn-migration-rehearsal pairs with cfn-ops (designs up+down) + supabase-schema-sync. docs-sync wired into `.git/hooks/pre-commit`.

### Runtime / Deploy Gates

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| cfn-monitor | ✅ Prod | ✅ 42/42 | `.claude/skills/cfn-monitor/` | Post-deploy health gate: probes CFN_MONITOR_TARGETS for status + latency, JSON summary, exit nonzero on any failure. Stateless single-shot. Bare-host targets (`site.com:200:3000`, no path) parse correctly (port guarded by HTTP-status range). Ships RUNBOOK.md (Fly rollback, log/secret/dep triage). Wired as deploy gate in fireside-family, golfer_collective, daily-automations |

**Tech-debt feedback loop:** cfn-tech-debt writes a machine-readable ledger to `.cfn-cache/tech-debt-ledger.json`; cfn-megaplan Step 0 reads it to surface open `cfn:` shortcuts as backlog candidates when scoping new work (rot-risk `no_trigger` rows ranked first). Closes the harvest -> plan loop.

**Reverse/audit mode:** `cfn-megaplan --review <path>` chains `cfn-data --review` -> `cfn-ux --review` -> `cfn-arch --review` to audit already-implemented code (recover artifacts from code, run phase rules as findings, emit `planning/AUDIT_*_<slug>.md`). cfn-ux review is the post-hoc catch for the FK-field-as-textbox bug. Other phases remain forward-only.

**Wave 5 (verification hardening, G37-G52, 2026-07-09):** the loop done-verdict is now mechanical, not honor-system. `cfn-loop-task` 3.2.0 rewrites Phase 5 Exit into an ordered gate (5E.0 mutation spot-check, 5E.1-5E.3 verify-run run/resolve/summary, 5E.4 all-green final gate, 5E.5 prod-build smoke) and Phase 4 into a build-flag-driven gate-wiring matrix (security/migration-rehearsal/a11y/dep-audit/perf). Planning side: concurrency (CC-n), state-machine (SM-n), observability (OBS-n), adversarial-data (ADV-n), and migration-rehearsal rows now become test ACs, presence-keyed across tiers. cfn-e2e gains a console/network guard fixture (console-guard.ts) + `--strict-console`. Static harnesses cover the new scripts (verify-run 14, verifiable-static 20, hygiene+baseline 12, strict-console 10).

**Live end-to-end validation (2026-07-09):** the mechanical done-verdict chain was driven on a toy VERIFY fixture through the real scripts: Bar A static check (clean, exit 0) -> hash bless -> `verify-run run` (green/predicate-unverified/needs_agent all classified, exit 1 with unresolved) -> evidence-refusal guard rejects <3-line evidence (exit 2) -> `resolve` x2 -> `summary` (all_green, exit 0). Tamper-after-bless returns exit 4; mutation probe (`run --only`) turns the target AC red as designed. W7 console-guard.ts self-test pair passed in a real chromium (clean page no violation, erroring page fails by default, `allow-console-errors` opts out).

**Known limitations:** the live validation exercised the mechanical scripts end-to-end, not the cfn-loop-task 3.2.0 prompt gate matrix inside a real Loop 3/Loop 2 orchestration run (that path remains prompt-driven, unrun end-to-end). Global `~/.claude/CLAUDE.md` canonical-entry switch to cfn-megaplan is local config, not tracked in this repo.

**Video/design skill family (🚧 Dev, untested in CI, 2026-07-12):** 15 skills land under `.claude/skills/` covering video generation and design import. Hyperframes core (`hyperframes`, `-core`, `-cli`, `-registry`, `-keyframes`, `-animation`, `-creative`) is the animation engine and its authoring surface; `remotion-to-hyperframes` migrates Remotion compositions onto it. Vertical skills built on top: `music-to-video`, `talking-head-recut`, `faceless-explainer`, `pr-to-video`, `product-launch-video`, `website-to-video`, `slideshow`, `motion-graphics`, `general-video`, `embedded-captions`. Plus `media-use` (asset handling) and `figma` (design import). No automated test coverage; not wired into any CFN gate or pipeline. Example render assets under `hyperframes-animation/examples/assets/` are gitignored (36M of .mp4 demos) and must be regenerated locally.

**Build-artifact hygiene (2026-07-12):** `.gitignore` now excludes compiled TypeScript output (`src/planning/**/*.{js,js.map,d.ts,d.ts.map}`) and `cfn-loop-orchestration-v2/lib/orchestrator/dist-worker/`. The `.ts` sources remain the single source of truth; the emitted files were untracked churn.

**Wireframe gate (🚧 Dev, prompt-only, 2026-07-17):** `cfn-ux` gains Phase 6 — a low-fidelity grayscale wireframe (one self-contained HTML page per screen, published via the Artifact tool) rendered from the control map + screen states + flows it already owns. Floored at every tier (including mvp): a wrong screen structure is a correctness defect. `cfn-megaplan` surfaces it as a BLOCKING Approve/Revise gate at the L5→L6 barrier, so design/test-plan/ops never build on an unapproved structure; Revise loops `cfn-ux` in patch mode (FR/AC/schema changes route to cfn-spec/cfn-data instead). Rides the existing `frontend` condition; degrades to `planning/wireframe_<slug>.html` on publish failure, `_skipped_` on zero screens. Spec: `planning/SPEC_wireframe_gate_cfn_design.md`. No automated test (prompt-driven skill change); cfn-design unchanged.

**Produce/consume wave ordering (🚧 Dev, 2026-07-17):** `write-plan` step table gains `Produces`/`Consumes` columns (new files/exports created vs symbols needed to pre-exist, as `<path>[:<symbol>]` or `-`). `cfn-loop-task` LANE DERIVATION rolls these into lane-dependency edges and executes lanes in topological **waves** (barrier between waves) instead of one all-concurrent wave, so a lane that imports another lane's new export runs AFTER it lands — replacing a gate-failure + wasted retry wave with correct ordering. A cheap inter-wave producer-existence guard (scoped typecheck/grep, not the full gate) blocks a consumer wave from building on an absent symbol; the failing-lane respawn now also re-runs transitive downstream lanes. Per-slot concurrency cap raised 4→**8** (one `LANE_CAP` constant; lanes=phases so most plans never reach it; coordinator load is O(lanes) offloaded, not attention-bound). Backward-compatible: absent/`-` columns ⇒ zero edges ⇒ today's single wave. Static gate `bars/check-produce-consume.sh` (backtick-aware table parser; blocks on duplicate producer / weasel / empty / malformed cell, warns on dangling consume) with a 9-case test harness (`tests/test-check-produce-consume.sh`, all green). Spec: `planning/SPEC_produce_consume_wave_ordering.md`.

**Native-plan-mode capture hook (🚧 Dev, 2026-07-20):** `.claude/hooks/cfn-plan-capture.sh` (PostToolUse on `EnterPlanMode|ExitPlanMode`, registered user-level in `~/.claude/settings.local.json`) closes the gap where native plan mode emits prose and `/cfn-loop-task` finds no manifest, forcing the weak 5E.4 exit gate. On EnterPlanMode it injects the write-plan shaping contract (H1 title, one `## Phase` per lane, Produces/Consumes step table) so the plan is born parseable. On ExitPlanMode it persists the approved plan to `planning/PLAN_<slug>.md` (slug from H1) and orders the manifest chain: `check-produce-consume.sh` → cfn-plan-review → `VERIFY_<slug>.md` (Bar A) → `check-verifiable-static.sh` → `.VERIFY_<slug>.sha256` sidecar → `/cfn-loop-task <slug>`, so the exit gate starts at 5E.0. Bars resolved via `$HOME/.claude` so the chain works from any project; existing `PLAN_<slug>.md` is never clobbered (new plan parked at `.raw_PLAN_*` for model reconcile); every failure exits 0 silently, never wedging plan mode. Test harness `tests/test-plan-capture.sh` (23 cases, all green). Known limit: `check-produce-consume.sh` parses only the first Produces/Consumes table, so multi-phase plans validate only phase 1.

**VERIFY-manifest runnability (S005 + S007, 2026-07-22):** two field handoffs (`NSC/planning/HANDOFF_verify_manifest_runnability.md`, `fireside-family/planning/MANIFEST_HANDOFF_conversational_interview_engine.md`) reported 71/104 and 21/147 ACs going runtime-red against **correct** code. Every red traced to the manifest, not the build. Fixes, in the order they bite:

- **Runner parity (S005).** cargo/nextest/go branches in `parse-test-summary.sh`. Cargo output previously satisfied the pytest regex, so every Rust run reported `runner=pytest`, `ignored` never reached `PTS_SKIP`, and nextest fell back to exit-code-only — Rust projects were structurally incapable of a parse-driven red.
- **Zero-ran is loud (S005).** `reason` on every results row, `summary.zero_ran`, plus a stderr line during the run. `cargo test` and `vitest -t` both exit **0** when the filter matches nothing, which is why a wrong test name reads as a pass.
- **playwright executes (S007).** Bar A REQUIRED the `playwright:` prefix while `verify-run.sh` classified that exact prefix as `needs_agent`. Discrimination is now on what follows it: a command runs, prose does not.
- **cwd + requires + blocked (S007).** Manifest/per-AC `cwd` for monorepos, `requires{env,db,http}` for live infra, and a third verdict `blocked` so "the dev server is not up" never renders as "the feature is broken".
- **Run-before-bless (S007).** Per-AC `evidence` holding the check's real output, staged: `PENDING: <reason>` at the plan bless (the code does not exist yet), real output required at the exit bless. `verify-run.sh backfill-evidence` fills it from the exit-gate run (green rows only), so the rule costs no hand-pasting.
- **Bless is gated and audited (S007).** `bars/bless-verify.sh` is now the only supported way to write the sidecar: it refuses on Bar A error findings, and appends a ledger naming which ACs moved, splitting `structure_changed` from `predicate_changed` (a `pass` loosened until the code satisfies it).

Harness: 288 assertions across 8 suites, all green (parse-test-summary 55, verify-run 63, verifiable-static 59, bless-verify 29, hygiene 23, deferrals 37, Bar B 13, produce-consume 9).

---

## Legacy Code Removals

**Sprint-4 TS stub layer (2026-07-26, 85c895a95 + 3b41b1aa7 + b894f77e2).** Removed the abandoned TypeScript application layer under `src/{lib,services,hooks,cli,agents,api,middleware,db,lifecycle,jobs,types,coordination}/` (88 stub files carrying the `Created to satisfy test imports` marker), the ~96 placebo test files that imported them, and three duplicate fixture copies under `tests/{src,unit/src,unit/cfn-loop/src}/`. The real implementations were deleted in `ec6203a3b` (Trigger.dev migration Phase 4); only placeholder stubs and compile-fail tests remained. Nothing live imported the layer: the active CFN shell/hooks/skills import nothing from `src/`, the live TS core (`src/cfn-loop/product-owner`, `src/planning`) imports no stub, and `package.json` bin entries are clean. Real implementations are recoverable from `git show 21fca067d:<path>` if any capability is ever needed.

Security note: the deleted layer included security-shaped stub files (`src/api/auth-endpoints.js`, `src/middleware/auth-middleware.js`, `src/services/authentication.js`) and security-themed placebo tests. These were dead stubs, not live security controls (verified zero live importers), so their removal creates no live auth bypass. The live backup path remains the shell script `.claude/skills/cfn-edit-safety/lib/backup/backup.sh`, untouched.

**Docker-agent scaffolding (2026-07-26).** Removed `docker/agent/Dockerfile` plus four dead shell scripts (`scripts/docker-agent-init.sh`, `scripts/build-agent-image.sh`, `scripts/docker-rebuild-all-agents.sh`, `scripts/verify-redis-cleanup.sh`). Nothing live built or invoked them (no compose ref, no CI workflow, no npm script, no hook; only each other and historical docs). `dist/cli/index.js` is intentionally left frozen: its TypeScript source was deleted in `ec6203a3b` but the compiled file still has live consumers (`tests/docker/`, `tests/integration/`, `docker/Dockerfile.optimized`, `docker/scripts/monitor-wrapper.sh`, analytics skill). `dist/cli/conversation-fork-cleanup.js` is now a true orphan (its only consumer, `verify-redis-cleanup.sh`, was deleted); left frozen rather than purged. Both dist files are tracked as BUG #10.

---

## Current Development Phase

**Phase:** Production
**Active Consumers:** Internal projects (daily-reach, fireside-family)
**Last Major Release:** v2.18.40 (2026-01-13)
