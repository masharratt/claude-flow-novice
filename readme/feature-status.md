# Feature Status

**Last Updated:** 2026-08-20 (path-resolution audit: root-anchor depth, per-project vs CFN anchors, path containment; cfn-extras brought under the portability gate; macOS awk -v newline fix + gate) | **Version:** 2.21.0 | **Status:** Production

## Status Legend

| Token | Meaning |
|-------|---------|
| `prod` | Production-ready, fully tested, live. |
| `beta` | Feature complete, under verification. Usable but not trusted. |
| `dev` | In development. Not verifiable end-to-end. |
| `stub` | Scaffold only, returns placeholder. Not real. |
| `deprecated` | Still present, scheduled for removal. Do not build on. |

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
| verify-run.sh | ✅ Prod | ✅ 63/63 | `.claude/skills/cfn-loop-orchestration-v2/cli/` | VERIFY-manifest executor (run/resolve/summary/backfill-evidence). Classifies each AC executable/db-query/needs_agent, refuses <3-line agent evidence, hash-checks manifest (exit 4 on tamper), forces red on skipped/todo/zero-collected ACs. Drives Phase 5 Exit gate. (CHANGELOG.md) |
| check-test-hygiene.sh | ✅ Prod | ✅ 23/23 | `.claude/skills/cfn-loop-orchestration-v2/cli/` | Flags focused/skipped/todo markers and conditional skip patterns: `.only`, `.skip`, `.skipIf(`, `.runIf(`, `.concurrent.skip`, `fit`, `@pytest.mark.skipif` (S001, 2026-07-11). Detects `.skipIf(!FLAG)` pattern-skips that silently self-skip. Same-line `cfn-allow-skip:` = recorded quarantine. Findings = Phase 3 gate FAIL |
| parse-test-summary.sh | ✅ Prod | ✅ 44/44 | `.claude/skills/cfn-loop-orchestration-v2/cli/lib/` | Shared lib for gate-check.sh + verify-run.sh AC-verdict parsing. Zero-collected or any skipped/todo forces red. Runners: jest, vitest, pytest, node:test, cargo, cargo-nextest, go. Known limit: `go test` without `-v` stays unknown. (CHANGELOG.md) |
| run-ledger.sh | ✅ Prod | ✅ 47/47 | `.claude/skills/cfn-loop-orchestration-v2/cli/` | One JSONL row per cfn-loop-task run (`~/.claude/cfn-data/loop-task-runs.jsonl`, global): tier, `bar_b_tier` (from MEGAPLAN Gates `tier=` token), iterations, lanes, blocked_on + spec-gap classification, out_of_scope count, amendment count, amendments naming a PLAN `Produces` symbol. Prints FLAG lines (`sonnet` + spec gap → re-gate `--bar-b=full`; amendment touches Produces → run check-produce-consume). `stats [--slug] [--last N]` groups by tier. Wired at 5E.6, never gates. | Regex spec-gap classifier (`cfn:` marker) |
| deferrals.sh | ✅ Prod | ✅ 37/37 | `.claude/skills/cfn-loop-orchestration-v2/cli/` | Lane deferrals lifecycle (S006, 2026-07-11). New tool for record/gate/resolve: persists blocking items to `.deferrals_<slug>.json`, gates Phase 5 (5E.4a no-open-deferrals check), resolves on backlog. Fail-closed (zero deferrals required by default); cfn-loop-task.md Phase 5 exit gate reads and enforces it. |
| THRESHOLDS.md | ✅ Prod | n/a | `.claude/skills/cfn-loop-orchestration-v2/` | Single source of truth for gate/consensus/max-iter per mode |
| VERIFY manifest gate | ✅ Prod | ✅ 55/55 | `cfn-loop-task.md` Phase 5 (5E) + `cfn-megaplan/bars/verifiable-done.md` | Loop done requires verify-run.sh proving every AC green mechanically, manifest unedited since Bar A (sha256 sidecar), no gamed tests, core FRs surviving a mutation probe, and all applicable gate skills run. Re-bless is per-AC scoped: `bless-verify.sh` emits a `regate` line naming only the rows/steps owed (probe only on an added AC); `--force-full` for whole-plan re-gate |
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
| cfn-agent-lifecycle | ✅ Prod | ✅ 21/21 | `cfn-agent-lifecycle/` | Agent start/stop lifecycle hooks. Subagent metadata parsed from stdin JSON payload (env fallback for manual). SQL-escaped; `set -uo pipefail` so bookkeeping never blocks spawns. 21/21 tests. NOT registered in settings yet (duplicate SubagentStop writer conflict). (CHANGELOG.md) |
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
| prompt-optimizer | ✅ Prod | ✅ 122/122 engine, 113/113 plugins | `prompt-optimizer/` | Provider-agnostic hill-climb prompt optimizer engine. State-isolated (project-local paths), provider-agnostic (engine imports no provider SDK). 8 engine modules + 7 suites (122 tests); 3 plugins incl. 2 refusal rigs (113 tests). Held-out split with OVERFIT refusal. (CHANGELOG.md) |

### Validation & Testing Skills

| Skill | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| cfn-loop-validation | ✅ Prod | ✅ | `cfn-loop-validation/` | Validation framework |
| cfn-test-framework | ✅ Prod | ✅ | `cfn-test-framework/` | Test orchestration |
| cfn-validation-framework | ✅ Prod | ✅ | `cfn-validation-framework/` | Test validation |
| cfn-edit-safety | ✅ Prod | ✅ 17/17 | `cfn-edit-safety/` | Pre/post-edit backup and validation pipeline. Post-edit validators (TS/ESLint/Prettier/shellcheck/cargo check) run non-blocking in a warning bucket; missing tools SKIP. 12 jest tests; hook suite 152 passed. Phase 2.7 wires cargo check. (CHANGELOG.md) |
| cfn-persona-verify | ⚠️ Beta | ✅ 21/21 | `cfn-persona-verify/` | Role-coherence gate: flags builds that are tests-green but nonsense for the actor (e.g. manager with no approval capability). 21 negative controls enforce the schema. Wired into cfn-loop-task Phase 4 gate (frontend=yes AND role docs). Observe-only by default. (CHANGELOG.md) |

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
| Tool-initiation failure logging | ✅ Prod | ✅ | `.claude/cfn-scripts/log-tool-init-failure.sh` | Global append-only log of CFN tools that fail to start (exit 126/127, agent no-output, skill not found, MAX_ITERATIONS exhausted). Distinct from tools that start and fail their check (control-flow exits, never logged). Dep-free, flock-safe logger (record/wrap/show modes) writes to `~/.claude/cfn-data/tool-init-failures.jsonl`. Wired into cfn-loop-task: all 11 CFN CLI calls wrapped (9 direct via `wrap`, 2 piped via `wrap ... | tee` + `${PIPESTATUS[0]}`). Triage skill `cfn-triage-tool-failures/` pulls the log, summarizes with jq, diagnoses by category, proposes fixes. Known limitations: wrap logs only exit 126/127; LLM-mediated failures (agent no-output, skill not found, MAX_ITERATIONS) need explicit `record` calls. Log is global across projects. |
| cfn-megaplan Bar A (verifiable-done) | ✅ Prod | ✅ | `cfn-megaplan/bars/` | Static gate for Bar A manifests. Adds rule (f) `literal_stub_correlation` (seed-token correlation catches constant handler stubs on LLM/free-text/webhook inputs), `[boundary]` FR tag + `boundary_fr` integration coverage (forces real DB/HTTP ACs for ordering/filter/limit semantics), and cfn-plan-review Phase 2 signal-flow trace (flags `integration_lane_gap` BLOCKER for unowned external-input lanes). Presence-keyed opt-in; existing manifests unaffected. 2026-08-19 field hardening: absence-assertion pairing (negative check needs a population assertion; shell/SQL/size/eq-nonzero idioms), stale-literal count warn, AC-id widened to multi-hyphen. check-produce-consume: multi-table scan, blank lines + escaped pipes in cells, ragged-row errors, `<path>:(emit\|metric\|obs):<name>` signal tokens, `[]` in paths. |
| cfn-workbench | ⚠️ Beta | ✅ 237 | `.claude/skills/cfn-workbench/` | Self-contained HTML progress page per loop run. Live transparency: watch.sh daemon re-renders on data change, staleness pill (120s/600s), lane roster from planning/run-plan-<slug>.json, event feed via emit-event.sh JSONL. Wired into /cfn-loop-task all phases. |
| check-phase-width | ⚠️ Beta | ✅ 15/15 | `.claude/skills/cfn-megaplan/bars/check-phase-width.sh` | Bar B static: caps lane width per step-number major (<=15 steps, <=8 distinct files; JSON findings, exit 0/1/2). Blocks at write-plan/megaplan/lite/fast plan time; advisory at cfn-loop-task lane derivation 2b (wide-phase split by file cluster, min 5 steps/sub-lane). Regression: 2026-08-19 48-step single-lane phase ran serially 2+ hours (legal 4-way split ~3x). Pairs with loop-task cross-wave `learnings` channel (lane report field, wave-boundary prompt injection, run-plan ledger persistence). | Majors only; freeform lane letters unparsed |
| cfn-megaplan-fast | ⚠️ Beta | ✅ 67 | `.claude/skills/cfn-megaplan-fast/` | Token-lean planner: program mode (spec/data/arch/ux once, per-part test-plan + write-plan + Bar A over section extracts), hard artifact byte caps (`cfn-megaplan/bars/check-size.sh`, recalibrated 2026-08-19 from first-run measured sizes; per-run overrides in `.cap-override.md`), static-only bars 1 round, opus only spec+arch, no nested spawns, optional /goal driver, `--part-specs` failsafe (auto when parts >= 3 or a part's SPEC extract is thin: one 16KB sonnet PARTSPEC per part). Same loop-task hand-off. Known limitations: no ops/tiers/probe; first real-run token measurement pending (AC-7); 2026-08-19 first run found writer self-compression spiral, prompt now caps self-compression at 1 pass. |
| cfn-megaplan-lite | ⚠️ Beta | ✅ smoke | `.claude/skills/cfn-megaplan-lite/` | Balanced-cut planning mode for medium features. Runs `check-size.sh --all` (built-in fast caps) at every level join: OVER = one sonnet compress then advance, never blocks. `--unattended` auto-approves gates with recorded defaults. |
| cfn-knowledge-plan | ⚠️ Beta | ✅ 18 | `.claude/skills/cfn-knowledge-plan/` | Non-code branch of the planning pipeline: strategy docs, proposals, competitive analysis, research memos. Plan-for-the-plan (intake → brief → extract-plan+outline) blocks drafting until KPLAN is approved; extract runs one sonnet agent per source emitting verbatim quotes with locators. Gated by Bar K grounding (check-grounding.sh, rules G1-G9) plus megaplan's weasel scan reused unmodified. Known limitations: Bar K checks the Claims Ledger contract, not prose — it cannot flag an ungrounded sentence that carries no `[C-n]` cite at all. |
| cfn-share | ⚠️ Beta | ✅ 23 | `.claude/skills/cfn-share/` | Publishes a plan/spec/doc as a private Artifact page with a stable URL for non-terminal reviewers. resolve.sh derives title and recalls the pinned URL; record-url.sh writes a `.share-<basename>.url` sidecar holding url + sha256 + timestamp so re-shares update in place and report staleness. Known limitations: Artifact pages are a read surface, not a comment system; reviewer feedback routes back through the owning phase skill by hand. |
| cfn-notify hook | ⚠️ Beta | n/a | `.claude/hooks/cfn-notify.sh` | Audible turn-completion and needs-input signal for WSL2 sessions. Wired to global Stop and Notification hook events; plays a Windows Media wav via detached powershell.exe with a console-beep fallback. 14ms hook overhead (call is backgrounded). Defaults: stop=chimes, input=Windows Notify Calendar, error=Windows Critical Stop; override per event with `CFN_NOTIFY_STOP`/`_INPUT`/`_ERROR` (no file edit). `--list` enumerates the 70 available sounds, `--play <name>` auditions one synchronously and exits 1 on an unknown name. Disable with `CFN_NOTIFY=0`. Known limitations: WSL2/Windows only, silent no-op elsewhere; no audio verification in CI. |

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
| /cfn-loop-task | ✅ Prod | ✅ | `cfn-loop-task.md` (3.5.0) | Task mode execution: derives lanes from planning/PLAN_<slug>.md (lane source), checks completion via planning/VERIFY_<slug>.md. Mechanical Phase 5 Exit gate (5E.0-5E.5 via verify-run.sh, 5E.6 run ledger), Phase 4 gate-wiring matrix, manifest hash check, deferrals gate (S006). 3.5.0: 5E.6 run-ledger row + FLAG lines on every exit path. 3.4.0: bounded step amendment (lanes may change HOW when files+AC+done predicate hold; `step_amendments` audited in run-plan, Step 3.01a) and per-AC scoped re-gate on hash mismatch (Step 0a). |
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

### CI (GitHub Actions)

| Component | Status | Tests | Location | Description |
|-----------|--------|-------|----------|-------------|
| CI workflows | ⚠️ Beta | n/a | `.github/workflows/` | 3 workflows: ci.yml (eslint advisory, tsc typecheck, unit tests Node 18/20, build verification, quality gate), security-credential-scan.yml (repo pre-commit scanner over all tracked files + TruffleHog full-history, verified-only), npm-publish.yml (release gate). Pruned from 13 in 2026-08. |

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
| cfn-hook-budget.sh | ✅ Prod | ✅ | `.claude/hooks/cfn-hook-budget.sh` | Shared timeout budget for search hooks. Budget 3000ms (per-step guards previously SIGKILL'd hooks mid-run). Uses `timeout -k` + capture-to-file; deadlines from `/proc/uptime` (monotonic). Exhaustion skips a step, never floors to `timeout 0`. (CHANGELOG.md) |
| Backup Restore & Cleanup | ✅ Prod | ✅ 74/74 | `.claude/skills/cfn-edit-safety/lib/backup/{restore,cleanup}.sh` | Out-of-band rollback and retention for pre-edit backups. restore.sh: --list/--file/--backup-id, md5 integrity gate, --dry-run. cleanup.sh: dry-run default (--apply to delete), --keep-latest N, flock, refuses non-repo roots. 74/74 tests. (CHANGELOG.md) |
| Pre-edit Backup | ✅ Prod | ✅ 18/18 | `.claude/hooks/cfn-invoke-pre-edit.sh` | Backup before file changes. S014 (2026-07-25): fixed stderr merge in pre-edit hook (captured `✅ Backup created:` banner into stdout path, so `BACKUP_PATH=$(...)` returned two lines and named no directory); fixed restore to understand both current and deprecated backup conventions, fixed `ls -t | head -1` pipe error under `set -euo pipefail` (glob mismatch exited 2, masking "no backup found" logic). All 1451/1451 on-disk backups now resolve to a restorable original. |
| Post-edit Validation | ✅ Prod | ✅ | `.claude/hooks/cfn-invoke-post-edit.sh` | Post-edit validation pipeline. Two divergent pipelines consolidated: TS/ESLint/Prettier ported, tools from `node_modules/.bin` (not bare `npx`), run against edited file's package root. Python/Go/Java/C++ dropped (no wiring). `config/hooks/` deleted. (CHANGELOG.md) |
| Session Start | ✅ Prod | ✅ | `.claude/hooks/SessionStart-*` | Session initialization |
| WSL Memory Monitor | ✅ Prod | ✅ | `~/.local/bin/wsl-memory-monitor.sh` | Kill orphaned test processes |
| Hook Self-Test | ✅ Prod | ✅ 32/32 | `.claude/hooks/cfn-hook-selftest.sh` | SessionStart validation: settings parse, registered hook paths resolve, no unguarded exec targets, orphan detection (S008, 2026-07-25) |
| Security Scanner | ✅ Prod | ✅ 32/32 | `.claude/skills/cfn-edit-safety/lib/hooks/security-scanner.sh` | De-symlinked from external /mnt/c path; detects secrets, API keys, JWT tokens, SQL injection, XSS patterns. Stderr output (not stdout) for FILE/TYPE/MATCHES lines to prevent JSON parse crashes (S009, 2026-07-25). Case-insensitive hardcoded-secret regex (S010, 2026-07-25). |
| Destructive Guard | ✅ Prod | ✅ 32/32 | `.claude/hooks/cfn-careful-guard.sh` | PreToolUse blocker for rm -rf, git push --force, database DROP/TRUNCATE. Added git checkout rule (S011, 2026-07-25). Fixed greedy sed bug: two-step quote extraction prevents JSON tail glue (S012, 2026-07-25). |
| Git Hook Installer | ✅ Prod | ✅ 47/47 | `.claude/hooks/install-git-hooks.sh` | Deploy credential-scanning git hook. Fixed core.hooksPath resolution (S013, 2026-07-25) so husky repos no longer silently ignore installs. Resolves both relative paths and absolute hooksPath values. Coverage expanded from 3/41 to 41/41 repos. |
| Pre-commit Credential Scan | ✅ Prod | ✅ 47/47 | `.claude/hooks/pre-commit` | Tracked source for credential-scanning git hook. Four critical bugs fixed (2026-07-25): (S010) infinite loop from read/append race on `TEMP_RESULTS`; (S011) fail-open via negation exit status always 0; (S012) credential leak via unshadowed `$pattern` in `is_whitelisted()`; (S013-S014) installer ignoring `core.hooksPath`. Added OpenAI (`sk-proj-`, legacy `sk-`+48) and GitHub (`ghp_`, `github_pat_`) patterns. Tests: 47 passed / 0 failed. Mutation-verified (reverting fixes produces 4 failures). |
| Skill Usage Tracker | 🚧 Dev | ✅ 15/15 | `.claude/hooks/cfn-track-skill-usage.sh`, `.claude/cfn-scripts/skill-usage-report.sh` | PostToolUse hook records every Skill-tool invocation to SQLite (WAL mode, `~/.claude/cfn-data/skill-usage.sqlite`, never blocks the tool call); report script joins usage against the full skill inventory to surface unused skills as deprecation candidates. Deps: sqlite3/python3. Known limitations: empty until warmup; tracks invocation count, not value delivered. |

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
| Version | 2.21.0 |
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

## Status Legend (reference)

| Token | Meaning |
|-------|---------|
| prod | Production-ready, fully tested. |
| beta | Feature complete, limited testing. |
| dev | Under development. |
| stub | Scaffold only, not real. |
| deprecated | Scheduled for removal, do not build on. |

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
| cfn-megaplan orchestrator | ⚠️ Beta | ⚠️ wiring | `.claude/skills/cfn-megaplan/` | Tiered DAG entry point; supersedes cfn-spa-plan. Multi-plan support, PLAN_ persistence gate, Bar B CONDITIONAL-PASS, §1a actor gate, [OPEN] triage, patch-mode loop-backs. Tier profiles carry `.caps` (mvp 2x / beta 3x / enterprise 4x fast caps); `check-size.sh --all` at every join, one compress then advance. `--unattended` flag. (CHANGELOG.md) |
| Per-plan artifact directories | ⚠️ Beta | ✅ | `.claude/skills/cfn-megaplan/lib/plan-paths.sh` | Every plan's artifacts now live in `planning/<slug>/` instead of loose in `planning/`. Shared resolver (`plan_dir`/`plan_ensure`/`plan_resolve`/`plan_write`) is nested-first with legacy flat fallback, so old plans keep resolving. All consumers (bars, workbench, decisions, verify-run) route through it. |
| Inclusion profiles | ✅ Prod | ✅ | `.claude/skills/cfn-megaplan/profiles/` | mvp/beta/enterprise phase inclusion (JSON-validated). v1.3.0 (2026-07-16): profiles/tests/test-profiles.sh enforces Step 3a model invariants (5/5 pass), validates per-phase model assignments. v1.2.0 (2026-07-09): test_plan gains concurrency/adversarial_data/viewport_matrix/obs_verification/migration_rehearsal (mvp drops, beta+ extras); ops tokens unchanged |
| Bar A: verifiable-done | ⚠️ Beta | ✅ 59/59 | `.claude/skills/cfn-megaplan/bars/verifiable-done.md` + `bars/check-verifiable-static.sh` | Every AC carries executable check. Mechanical static pass (S004, 2026-07-11): check-verifiable-static.sh lints taxonomy/pass-decidability/weasel/coverage. REQUIRED keys `wiring_total`/`wiring_mapped` (mandatory unless `wiring_total: 0` with `no_new_components_reason`); `wiring-guard` AC kind, WARN-only flag-tautology detection. Presence-keyed coverage keys cc/sm/obs_required/adv/migration_rehearsal/viewport/wiring lint when present. S007 (2026-07-22): new REQUIRED per-AC `evidence` field (the check's real output) with a `--stage plan\|exit` split — `PENDING: <reason>` is legal at plan time (the code does not exist yet) and an error at the exit bless; `evidence_zero_ran` rejects pasted output showing 0 tests collected; `kind` is now a closed vocabulary (unrecognized = error, so `kind: cargo-test` with a grep body can no longer dodge every taxonomy rule by matching none); `unrunnable_selector` rejects the `file::testname` shorthand no runner implements (89 of one field manifest's 104 checks); `requires{env,db,http}` shape lint. |
| bless-verify.sh | ✅ Prod | ✅ 29/29 | `.claude/skills/cfn-megaplan/bars/` | The only supported way to bless a VERIFY manifest (S007, 2026-07-22). Replaces the hand-run `sha256sum > sidecar` one-liner: gates on `check-verifiable-static.sh` (refuses to pin anything on an error finding — blessing was previously self-service), writes the sidecar, snapshots the manifest, and appends a per-bless ledger entry naming which ACs moved in which fields. Reports `structure_changed` (AC set / id / kind / maps_to moved) and `predicate_changed` (a `pass` condition moved — the gaming vector) on separate axes so a reviewer never infers one from the other. `--stage plan\|exit` passes through to the static checker. |
| Manifest integrity hash | ✅ Prod | ✅ | `planning/<slug>/.VERIFY_<slug>.sha256` (legacy flat `planning/.VERIFY_<slug>.sha256` still resolves) + `.bless.json` + `.blessed.json` (bless-verify.sh / verify-run.sh) | Sidecar sha256 of the Bar A-blessed VERIFY file (W2/G38, 2026-07-09). cfn-loop-task Step 0 + verify-run.sh refuse a manifest edited since Bar A; missing sidecar = warn (pre-hash-era). S007: the sidecar is now written only by `bless-verify.sh`, alongside an append-only bless ledger and a manifest snapshot for diffing. |
| check-haiku-static.sh | ✅ Prod | ✅ 13/13 | `.claude/skills/cfn-megaplan/bars/` | Bar B weasel/structure scan (S005, 2026-07-11). Weasel patterns sourced from shared `bars/weasel-phrases.txt`. New scoped warn-only optional-DI scan: core-FR components must use non-optional DI at composition root (compile-error if omitted, not silent no-op); exceptions require DECISIONS register entry, not inline comment. |
| Bar B: haiku-executable | ⚠️ Beta | ✅ | `.claude/skills/cfn-megaplan/bars/haiku-executable.md` | Every step unambiguous for the executor tier. `bars.haiku_executable` profile knob: `sonnet` (mvp/beta default: file+symbol+done predicate, no live probe) or `full` (enterprise: typed signature + haiku probe); `--bar-b=` overrides. Rejects optional-DI for core-FR components at both tiers. |

### Planning Phase Skills

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| cfn-research | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-research/` | Pre-spec feasibility, prior-art query |
| cfn-spec | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-spec/` | Requirements → acceptance criteria. v1.1.0 (2026-07-16): Step 1a Actor Inventory added (mandatory when frontend: yes OR db: yes; required at megaplan L2, consumed verbatim by cfn-arch AuthZ and cfn-data RLS at L5 and L4). v1.0.0: Step 1b (Interaction Intent Walk, 2026-07-08) surfaces intent choices on user-facing surfaces before schema locks (archetype bundles, 7-dimension coverage, resolved vs [OPEN] items track). Post-edit hooks validate sections/FRs. No automated test coverage yet; validated by gate presence check in cfn-megaplan §1b gate |
| cfn-decide | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-decide/` | Decision register + structured decision-log write |
| cfn-decisions | ⚠️ Beta | ✅ 38 | `.claude/skills/cfn-decisions/{record.sh,hook.sh,lib/}` | Per-run decisions-ledger writer. Produces `planning/<slug>/.VERIFY_<slug>.decisions.json` (nested-first via plan-paths.sh; atomic upsert-by-key via mktemp+mv) consumed by cfn-workbench section-decisions.sh, dual-writes SQLite via decision-log/record.sh. Fixed: writer previously targeted flat `planning/` while the renderer read nested-first, orphaning the ledger. hook.sh DRY-extracts the 3 FR-7 loop hook sites (Phase 4.2 PO, Phase 5 batch, Phase 5E.4 quarantine) into one wrapper (D-8 isolation, exit 0 always). Exit taxonomy 0-8 (code 6 reserved). 38 TDD tests: upsert cardinality, atomic write, dual-write parity, D-8 isolation, SQL/jq injection, hook-wrapper runtime. |
| cfn-arch | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-arch/` | Architecture + composition root (S004, 2026-07-11). v1.1.0 (2026-07-16): Step 6 AuthZ matrix columns now bind verbatim to SPEC §1a Actor names (no role invention/rename/merge); same boundary as cfn-data RLS policy (one source of truth). Names the main composition root and core-FR component boundaries; feeds wiring-guard AC generation in cfn-test-plan Phase 3. Identifies DI requirements (non-optional for core FRs per Bar B). |
| cfn-data | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-data/` | Forward DB design + field-bindings (RLS floor). v1.1.0 (2026-07-16): Step 4 RLS Principal/role set sourced verbatim from SPEC §1a Actor Inventory; every §1a actor accounted for per table (explicit allow or explicit no-access note); cfn-arch AuthZ derives from same §1a table at L5, one-source-of-truth design prevents independent role-set drift. |
| cfn-ux | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-ux/` | Full interaction: affordance map (FK→dropdown) + per-field interaction + edge states + flows/journeys + feedback/undo + role visibility. Reads §1b resolved intent as settled; does not re-open answered dimensions |
| cfn-design | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-design/` | Visual/layout/design-system/a11y/i18n + responsive/touch + content/microcopy + API contract |
| cfn-test-plan | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-test-plan/` | AC→executable-check table (feeds Bar A). Phase 3 (S004, 2026-07-11) now emits WIRE-n call-site ACs for each composition-root component wiring, auto-populated in wiring_total/wiring_mapped counts. Producer side names wiring in mandatory Bar A coverage keys. |
| cfn-ops | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-ops/` | Threat model/observability/rollout (beta+). Pairs with cfn-migration-rehearsal on up/down scripts; cfn-loop-task Phase 4 gate-matrix wires migration-rehearsal test ACs. |

### Decision Log (structured records)

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| Structured decision store | ✅ Prod | ✅ | `.claude/skills/decision-log/{schema.sql,record.sh,ingest.sh,decisions.sh}` | SQLite `decisions` table; cross-session, per-project. Write via record.sh, read via decisions.sh. Incremental ingest at SessionStart (detached via `setsid`, never blocks); `ingest.sh` is the parser. Re-ingest idempotent via `UNIQUE uuid` + `INSERT OR IGNORE`. (CHANGELOG.md) |

**Dependencies:** cfn-megaplan reads cfn-spec build flags to route conditional phases. cfn-ux consumes cfn-data field-bindings. cfn-decide writes to decision-log SQLite (read by cfn-megaplan Step 0 + cfn-plan-review Phase 1).

### Post-Merge Gates (manifest -> cfn-vote-implement)

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| cfn-security-review | ✅ Prod | ✅ 10/10 | `.claude/skills/cfn-security-review/` | Post-impl security gate on the diff (injection, authz, secrets, RLS, headers, unscoped DELETE, input). Emits manifest. Never auto-fixes |
| cfn-dep-audit | ✅ Prod | ✅ 8/8 | `.claude/skills/cfn-dep-audit/` | Supply-chain gate: ~90-day cooldown on new deps + immediate-CVE carve-out (npm/pnpm/yarn/cargo audit). Emits manifest |
| cfn-perf-gate | ✅ Prod | ✅ 29/29 | `.claude/skills/cfn-perf-gate/` | Runs CFN_PERF_BENCH_CMD, diffs vs `.cfn-cache/perf-baseline.json`, emits manifest per path regressed beyond CFN_PERF_THRESHOLD_PCT (default 10). Never auto-fixes |
| cfn-a11y-gate | ✅ Prod | ✅ 5/5 | `.claude/skills/cfn-a11y-gate/` | Local WCAG gate: axe-core via Playwright against CFN_A11Y_URLS, emits manifest per violation. Not a GitHub Action. v1.0.1 (2026-07-24): runner moved to .cjs for CommonJS require() support under ESM parent packages; NODE_PATH built from project's node_modules walk (both invocation dir and git root); dependency check now distinguishes genuine module-not-found (exit 3 with install instruction) from other runtime errors (exit 4 with full error); exit codes and error messages now fully deterministic |
| cfn-ab-critic | ⚠️ Beta | n/a | `.claude/skills/cfn-ab-critic/` | Blind A/B critic gate: compares a build artifact against a reference artifact (labels shuffled so the critic cannot tell which is "ours"); emits a vote-manifest when ours loses or confidence < threshold. Triggered by an AC carrying a `reference` key. Deps: cfn-vote-implement, cfn-megaplan/bars (verifiable-done `reference` key). Known limitations: optional gate; only fires when an AC opts in via `reference`; the LLM judgment is a two-phase handoff (phase 1 emits a blinded prompt, the agent re-invokes with verdicts) until a non-Anthropic vision/text compare MCP is reachable in-process |
| cfn-migration-rehearsal | ✅ Prod | ✅ 8/8 | `.claude/skills/cfn-migration-rehearsal/` | Rehearses migration up+down round-trip against CFN_SCRATCH_DATABASE_URL only; refuses prod. Destructive-SQL guard is statement-anchored, so GRANT/REVOKE privilege names are not flagged. Executes what cfn-ops designs |
| docs-sync pre-commit check | ✅ Prod | ✅ 9/9 | `.claude/hooks/cfn-docs-sync-check.sh` | Warns (blocks if CFN_DOCS_SYNC_STRICT=1) when a code commit omits feature-status.md / state-machines.md |

| shell-portability gate | ✅ Prod | ✅ 3/3 + 43/43 | `tests/test-shell-portability.sh` | CI gate (ci.yml lint + macos jobs) blocking `#!/bin/bash` shebangs, hardcoded home paths, and cwd-relative `.claude/skills/cfn-*` refs in executable position. `# portability-ok: <reason>` (reason mandatory) exempts a genuine repo-root-only call. `--list-refs` lists in-scope refs. Check 3 now covers `.claude/cfn-extras/` (a live reverse-symlinked runtime dir, previously exempt wholesale); only its deprecated/ and agents/unused/ subtrees are skipped. Check 4 blocks a heredoc-built (real-newline) variable passed through `awk -v`, which BSD awk rejects while GNU awk and mawk accept. Unit tests: tests/test-portability-skill-refs.sh |
| GNU-tool shim library | ✅ Prod | ✅ 58/58 | `.claude/helpers/cfn-portable.sh` | Shell functions shadowing timeout/stat/date/sed/free/nproc/readlink, defined only when the GNU behavior is absent so it is a no-op on Linux. Sourced by 182 scripts. Removes the PATH dependency that broke hooks spawned outside a login shell |
| shell-syntax gate | ✅ Prod | ✅ 2/2 | `tests/test-shell-syntax.sh` | Two CI checks per in-scope script: `bash -n` parses it, and a shebang requires index mode 100755. Added after 9 scripts were found unparseable, extended after 933 were non-executable in git, where a fresh clone gets 644 and `./script` exits 126 |
| macOS Portability CI job | ✅ Prod | ✅ 3 gates | `.github/workflows/ci.yml` | macos-latest runner installing only bash 5, deliberately not coreutils or gnu-sed, so the BSD shim paths are exercised for real. Blocks the quality gate. Also asserts shims are active and every shim source path resolves |
| global config layer | ✅ Prod | ✅ 8/8 | `.claude/global/` | The CFN operating guide, RTK.md, model-pricing.md, rules/ and references/ were untracked local files on one machine. Now tracked and reverse-symlinked into `~/.claude/`, so a clone carries the rules, not just the tooling |
| fork-subagent token rules | ✅ Prod | n/a | `.claude/global/CLAUDE.md` (Agent Usage) | Guide v2.26.0 adds a Fork Subagents section: a `subagent_type: "fork"` re-sends the whole conversation as its prompt on the parent model, so cost per fork equals current context size. Default is a fresh agent with a short brief; forking needs one-fork-only plus irreplaceable accumulated reasoning. Prompt-level rule, no mechanical gate |
| link-global-config | ✅ Prod | ✅ 8/8 | `.claude/cfn-scripts/link-global-config.sh` | Idempotent linker for the 5 `~/.claude/` config entries, and delegates to link-runtime-dirs.sh so one command makes both halves. Backs up anything it replaces to a timestamped dir rather than deleting. `--check` verifies without writing, `--force` overrides a refusal. Checklist item 7 in readme/macos-setup.md |
| link-runtime-dirs | ✅ Prod | ✅ 20/20 | `.claude/cfn-scripts/link-runtime-dirs.sh` | Creates the 14 `~/.claude/` runtime reverse symlinks (skills, hooks, commands, core, helpers, agents/cfn-dev-team, ...). These are load-bearing, not a convenience: without them every shared skill invocation fails outside this repo. Refuses to touch a populated real dir unless `--force`, and moves rather than deletes. `--check` verifies without writing |
| $HOME skill invocation | ✅ Prod | ✅ gated | `.claude/commands/`, `.claude/skills/`, `.claude/agents/` | 297 shared-skill invocations rewritten from cwd-relative `.claude/skills/cfn-*` to `$HOME/.claude/skills/cfn-*` (71 in commands/agents, 226 in skills). Chosen over a symlink bootstrap because `$HOME` expands in Git Bash, WSL2 and macOS while `ln -s` needs elevation on native Windows. 21 repo-root-only sites carry `portability-ok` |
| root-resolution gate | ✅ Prod | ✅ 27+8+2 | `tests/test-root-resolution.sh` | CI gate (ci.yml lint + macos). Executes each skill script's root-anchor chain and requires the landing dir to hold both `package.json` and `.git`; `<repo>/.claude` and `<repo>/.claude/skills` hold neither, which is the detection signal. Also asserts per-project anchors are `${CLAUDE_PROJECT_DIR:-$PWD}`-based, plus 2 runtime probes proving output follows CLAUDE_PROJECT_DIR |
| PROJECT_ROOT regressions | ✅ Prod | ✅ 16/16 | `tests/test-project-root-resolution.sh` | CI gate. Six named defects: helper sourced before its root was assigned, project data written into the CFN checkout, two wrong-depth chains, cwd-anchored TypeScript, and an unset root reaching `df` with a fallback that could not fire. Every check evaluates the code under test rather than grepping fixed text |
| path-containment gate | ✅ Prod | ✅ 9/9 | `tests/security/test-path-containment.sh` | CI gate. Covers `validate_file_path`, the traversal guard in front of skill deployment. Blocks the prefix-match bypass (base `/srv/app` admitting `/srv/app-evil/payload`), dot-dot escape, absolute paths and escaping symlinks, and asserts both deploy callers anchor containment on the invoking project |
| anchor-class separation | ✅ Prod | ✅ gated | `.claude/skills/`, `.claude/cfn-extras/` | Three anchors kept distinct after conflation caused real misplacement: shared CFN code resolves via `SCRIPT_DIR`/`$HOME`; per-project output (`.artifacts/`, `.cfn/`, `planning/`) anchors on `${CLAUDE_PROJECT_DIR:-$PWD}`; only a this-repo harness derives a repo root from `BASH_SOURCE`. A BASH_SOURCE root points into the shared checkout, so telemetry, backlog and changelog entries were landing in CFN instead of the invoking project |

**Gate dependencies:** cfn-security-review + cfn-dep-audit + cfn-perf-gate + cfn-a11y-gate emit manifests to `.cfn-cache/manifests/` consumed by cfn-vote-implement (3/3 auto, 2/3 product-owner, 1/3 batched user). cfn-migration-rehearsal pairs with cfn-ops (designs up+down) + supabase-schema-sync. docs-sync wired into `.git/hooks/pre-commit`.

### Runtime / Deploy Gates

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| cfn-monitor | ✅ Prod | ✅ 42/42 | `.claude/skills/cfn-monitor/` | Post-deploy health gate: probes CFN_MONITOR_TARGETS for status + latency, JSON summary, exit nonzero on any failure. Stateless single-shot. Bare-host targets (`site.com:200:3000`, no path) parse correctly (port guarded by HTTP-status range). Ships RUNBOOK.md (Fly rollback, log/secret/dep triage). Wired as deploy gate in fireside-family, golfer_collective, daily-automations |

**Tech-debt feedback loop:** cfn-tech-debt writes a machine-readable ledger to `.cfn-cache/tech-debt-ledger.json`; cfn-megaplan Step 0 reads it to surface open `cfn:` shortcuts as backlog candidates when scoping new work (rot-risk `no_trigger` rows ranked first). Closes the harvest -> plan loop.

**Reverse/audit mode:** `cfn-megaplan --review <path>` chains `cfn-data --review` -> `cfn-ux --review` -> `cfn-arch --review` to audit already-implemented code (recover artifacts from code, run phase rules as findings, emit `planning/AUDIT_*_<slug>.md`). cfn-ux review is the post-hoc catch for the FK-field-as-textbox bug. Other phases remain forward-only.

**Wave 5 (verification hardening, G37-G52, 2026-07-09):** the loop done-verdict is now mechanical, not honor-system. `cfn-loop-task` 3.2.0 rewrites Phase 5 Exit into an ordered gate (5E.0 mutation spot-check, 5E.1-5E.3 verify-run run/resolve/summary, 5E.4 all-green final gate, 5E.5 prod-build smoke) and Phase 4 into a build-flag-driven gate-wiring matrix (security/migration-rehearsal/a11y/dep-audit/perf). Planning side: concurrency (CC-n), state-machine (SM-n), observability (OBS-n), adversarial-data (ADV-n), and migration-rehearsal rows now become test ACs, presence-keyed across tiers. cfn-e2e gains a console/network guard fixture (console-guard.ts) + `--strict-console`. Static harnesses cover the new scripts (verify-run 14, verifiable-static 20, hygiene+baseline 12, strict-console 10).

**Live end-to-end validation (2026-07-09):** the mechanical done-verdict chain was driven on a toy VERIFY fixture through the real scripts: Bar A static check (clean, exit 0) -> hash bless -> `verify-run run` (green/predicate-unverified/needs_agent all classified, exit 1 with unresolved) -> evidence-refusal guard rejects <3-line evidence (exit 2) -> `resolve` x2 -> `summary` (all_green, exit 0). Tamper-after-bless returns exit 4; mutation probe (`run --only`) turns the target AC red as designed. W7 console-guard.ts self-test pair passed in a real chromium (clean page no violation, erroring page fails by default, `allow-console-errors` opts out).

**Known limitations:** the live validation exercised the mechanical scripts end-to-end, not the cfn-loop-task 3.2.0 prompt gate matrix inside a real Loop 3/Loop 2 orchestration run (that path remains prompt-driven, unrun end-to-end). Global `~/.claude/CLAUDE.md` is now tracked at `.claude/global/CLAUDE.md` and symlinked, so the canonical-entry switch to cfn-megaplan ships with a clone.

**Video/design skill family (🚧 Dev, untested in CI, 2026-07-12):** 15 skills land under `.claude/skills/` covering video generation and design import. Hyperframes core (`hyperframes`, `-core`, `-cli`, `-registry`, `-keyframes`, `-animation`, `-creative`) is the animation engine and its authoring surface; `remotion-to-hyperframes` migrates Remotion compositions onto it. Vertical skills built on top: `music-to-video`, `talking-head-recut`, `faceless-explainer`, `pr-to-video`, `product-launch-video`, `website-to-video`, `slideshow`, `motion-graphics`, `general-video`, `embedded-captions`. Plus `media-use` (asset handling) and `figma` (design import). No automated test coverage; not wired into any CFN gate or pipeline. Example render assets under `hyperframes-animation/examples/assets/` are gitignored (36M of .mp4 demos) and must be regenerated locally.

**CFN-CLAUDE.md distribution removed (deprecated, 2026-08-20):** `cfn-init` no longer copies a `CFN-CLAUDE.md` into the target project root, and `restructure-cfn-namespace.sh` no longer renames the repo's own `CLAUDE.md`. The `.claude/root-claude-distribute/` source was deleted on 2026-08-18 as a stale v2.21.0 snapshot, leaving both call sites dead. Install docs (`readme/installation-process.md`, `readme/logs-slash-commands.md`) updated; the version-stamped npm summaries are left as historical snapshots.

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
