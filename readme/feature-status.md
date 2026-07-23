# Feature Status

**Last Updated:** 2026-07-20 | **Version:** 2.24.0 | **Status:** Production

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
| verify-run.sh | ✅ Prod | ✅ 35/35 | `.claude/skills/cfn-loop-orchestration-v2/cli/` | Mechanical VERIFY-manifest executor (W1/G37-G52, 2026-07-11). run/resolve/summary; classifies each AC executable/db-query/needs_agent, runs from repo root, refuses <3-line agent evidence, hash-checks manifest (exit 4 on tamper). AC verdict: green/red/unresolved. Forces red on skipped, todo, or zero-collected ACs (S003) to prevent green-by-skip. S005 (2026-07-22): every results row carries a `reason` naming the deciding rule, `summary.zero_ran` counts checks that matched no test, and a zero-ran check also prints to stderr during the run. Results JSON is single done authority; prose never counts. Drives cfn-loop-task Phase 5 Exit gate (5E). **Known limitations:** cwd is hard-pinned to git top-level (subdirectory-relative manifest paths do not resolve); `playwright:` checks always classify `needs_agent`; no manifest schema for infra preconditions (DB URL, dev-server port, env pins). |
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
| cfn-agent-lifecycle | ✅ Prod | ✅ | `cfn-agent-lifecycle/` | Agent creation → deletion |
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

### Validation & Testing Skills

| Skill | Status | Tests | Location | Description |
|-------|--------|-------|----------|-------------|
| cfn-loop-validation | ✅ Prod | ✅ | `cfn-loop-validation/` | Validation framework |
| cfn-test-framework | ✅ Prod | ✅ | `cfn-test-framework/` | Test orchestration |
| cfn-validation-framework | ✅ Prod | ✅ | `cfn-validation-framework/` | Test validation |
| cfn-edit-safety | ✅ Prod | ✅ | `cfn-edit-safety/` | Pre/post-edit backup & validation |
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
| Pre-edit Backup | ✅ Prod | ✅ | `.claude/hooks/cfn-invoke-pre-edit.sh` | Backup before file changes |
| Post-edit Validation | ✅ Prod | ✅ | `.claude/hooks/cfn-invoke-post-edit.sh` | Validate after changes |
| Session Start | ✅ Prod | ✅ | `.claude/hooks/SessionStart-*` | Session initialization |
| WSL Memory Monitor | ✅ Prod | ✅ | `~/.local/bin/wsl-memory-monitor.sh` | Kill orphaned test processes |

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
| Bar A: verifiable-done | ⚠️ Beta | ✅ 37/37 | `.claude/skills/cfn-megaplan/bars/verifiable-done.md` + `bars/check-verifiable-static.sh` | Every AC carries executable check. Mechanical static pass (S004, 2026-07-11): check-verifiable-static.sh lints taxonomy/pass-decidability/weasel/coverage. New REQUIRED keys: `wiring_total`/`wiring_mapped` (mandatory unless `wiring_total: 0` with `no_new_components_reason`); new `wiring-guard` AC kind, WARN-only flag-tautology detection. Presence-keyed coverage keys cc/sm/obs_required/adv/migration_rehearsal/viewport/wiring lint when present. Manifest blessed by sha256 sidecar. |
| Manifest integrity hash | ✅ Prod | ✅ | `planning/.VERIFY_<slug>.sha256` (megaplan Step 5 / verify-run.sh) | Sidecar sha256 of the Bar A-blessed VERIFY file (W2/G38, 2026-07-09). cfn-loop-task Step 0 + verify-run.sh refuse a manifest edited since Bar A; missing sidecar = warn (pre-hash-era) |
| check-haiku-static.sh | ✅ Prod | ✅ 13/13 | `.claude/skills/cfn-megaplan/bars/` | Bar B weasel/structure scan (S005, 2026-07-11). Weasel patterns sourced from shared `bars/weasel-phrases.txt`. New scoped warn-only optional-DI scan: core-FR components must use non-optional DI at composition root (compile-error if omitted, not silent no-op); exceptions require DECISIONS register entry, not inline comment. |
| Bar B: haiku-executable | ⚠️ Beta | ✅ | `.claude/skills/cfn-megaplan/bars/haiku-executable.md` | Every step unambiguous. Rejects optional-DI for core-FR components on compilation bar; optional dependencies allowed only for non-core, with exception registered in DECISIONS. Static + probe scan. |

### Planning Phase Skills

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| cfn-research | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-research/` | Pre-spec feasibility, prior-art query |
| cfn-spec | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-spec/` | Requirements → acceptance criteria. v1.1.0 (2026-07-16): Step 1a Actor Inventory added (mandatory when frontend: yes OR db: yes; required at megaplan L2, consumed verbatim by cfn-arch AuthZ and cfn-data RLS at L5 and L4). v1.0.0: Step 1b (Interaction Intent Walk, 2026-07-08) surfaces intent choices on user-facing surfaces before schema locks (archetype bundles, 7-dimension coverage, resolved vs [OPEN] items track). Post-edit hooks validate sections/FRs. No automated test coverage yet; validated by gate presence check in cfn-megaplan §1b gate |
| cfn-decide | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-decide/` | Decision register + structured decision-log write |
| cfn-arch | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-arch/` | Architecture + composition root (S004, 2026-07-11). v1.1.0 (2026-07-16): Step 6 AuthZ matrix columns now bind verbatim to SPEC §1a Actor names (no role invention/rename/merge); same boundary as cfn-data RLS policy (one source of truth). Names the main composition root and core-FR component boundaries; feeds wiring-guard AC generation in cfn-test-plan Phase 3. Identifies DI requirements (non-optional for core FRs per Bar B). |
| cfn-data | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-data/` | Forward DB design + field-bindings (RLS floor). v1.1.0 (2026-07-16): Step 4 RLS Principal/role set sourced verbatim from SPEC §1a Actor Inventory; every §1a actor accounted for per table (explicit allow or explicit no-access note); cfn-arch AuthZ derives from same §1a table at L5, one-source-of-truth design prevents independent role-set drift. |
| cfn-ux | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-ux/` | Full interaction: affordance map (FK→dropdown) + per-field interaction + edge states + flows/journeys + feedback/undo + role visibility. Reads §1b resolved intent as settled; does not re-open answered dimensions |
| cfn-design | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-design/` | Visual/layout/design-system/a11y/i18n + responsive/touch + content/microcopy + API contract |
| cfn-test-plan | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-test-plan/` | AC→executable-check table (feeds Bar A). Phase 3 (S004, 2026-07-11) now emits WIRE-n call-site ACs for each composition-root component wiring, auto-populated in wiring_total/wiring_mapped counts. Producer side names wiring in mandatory Bar A coverage keys. |
| cfn-ops | ⚠️ Beta | ⚠️ | `.claude/skills/cfn-ops/` | Threat model/observability/rollout (beta+). Pairs with cfn-migration-rehearsal on up/down scripts; cfn-loop-task Phase 4 gate-matrix wires migration-rehearsal test ACs. |

### Decision Log (structured records)

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| Structured decision store | ✅ Prod | ✅ | `.claude/skills/decision-log/{schema.sql,record.sh,decisions.sh}` | SQLite `decisions` table; cross-session, per-project; write via record.sh, read via decisions.sh |

**Dependencies:** cfn-megaplan reads cfn-spec build flags to route conditional phases. cfn-ux consumes cfn-data field-bindings. cfn-decide writes to decision-log SQLite (read by cfn-megaplan Step 0 + cfn-plan-review Phase 1).

### Post-Merge Gates (manifest -> cfn-vote-implement)

| Feature | Status | Tests | Location | Description |
|---------|--------|-------|----------|-------------|
| cfn-security-review | ✅ Prod | ✅ 10/10 | `.claude/skills/cfn-security-review/` | Post-impl security gate on the diff (injection, authz, secrets, RLS, headers, unscoped DELETE, input). Emits manifest. Never auto-fixes |
| cfn-dep-audit | ✅ Prod | ✅ 8/8 | `.claude/skills/cfn-dep-audit/` | Supply-chain gate: ~90-day cooldown on new deps + immediate-CVE carve-out (npm/pnpm/yarn/cargo audit). Emits manifest |
| cfn-perf-gate | ✅ Prod | ✅ 29/29 | `.claude/skills/cfn-perf-gate/` | Runs CFN_PERF_BENCH_CMD, diffs vs `.cfn-cache/perf-baseline.json`, emits manifest per path regressed beyond CFN_PERF_THRESHOLD_PCT (default 10). Never auto-fixes |
| cfn-a11y-gate | ✅ Prod | ✅ 5/5 | `.claude/skills/cfn-a11y-gate/` | Local WCAG gate: axe-core via Playwright against CFN_A11Y_URLS, emits manifest per violation. Not a GitHub Action. Requires axe-core preinstalled, degrades with install instruction |
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

---

## Current Development Phase

**Phase:** Production
**Active Consumers:** Internal projects (daily-reach, fireside-family)
**Last Major Release:** v2.18.40 (2026-01-13)
