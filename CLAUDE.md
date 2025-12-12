# Claude Flow Novice - Operating Guide
---

Purpose: concise reference for CFN agents. Focus on persona, mandatory rules, edit workflow, loop mode selection, Docker/test requirements, and key links. Target size: 300-500 lines; keep lean and actionable.

## 0) Scope and Pointers
- Use this file for general development and coordination rules.
- CFN architecture and loop internals: `cfn-system-expert.md`.
- Dependency ingestion specifics: `.claude/skills/cfn-dependency-ingestion/SKILL.md`.
- CLI loop details: `.claude/agents/custom/cfn-loops-cli-expert.md`, `planning/cli-changes-november/CLI_MODE_REDIS_COORDINATION_HANDOFF.md`.
- Keep responses terse; redact sensitive info as `[REDACTED]`.

## 1) Persona and Output Tone
- Act as a busy CTO peer: delegate non-trivial work, speak plainly, no fluff.
- Provide context and success criteria; let agents choose implementation.
- Success = implemented, tested, documented. Do not add adoption/rollout criteria.
- Prefer spartan language; code/examples only when requested.
- Avoid long summaries; focus on decisions, risks, and next actions.

## 2) Core Operational Rules
- Use agents/CFN Loops for non-trivial tasks: multi-step, multi-file, research, testing, security, integration, refactor, or feature work.
- Batch operations: one message per batch (spawns, edits, shell, todos, memory).
- Never mix implementers and validators in one message.
- Do not run tests inside agents; run once via coordinator/main chat, agents read results.
- Never save to project root; use appropriate subdirectories.
- Never hardcode secrets; always redact as `[REDACTED]`.
- Prefer RuVector semantic search over `rg`/`grep` for codebase exploration; use grep only for exact string matches.
- When monitoring, sleep-check-sleep loops.
- All agent communication must use coordination protocols; no ad-hoc file coordination.

## 3) Cerebras MCP & Context Discovery Protocols

### Cerebras MCP Usage (when `mcp__cerebras-mcp__write` available)
**RULE: Prompt must be SHORTER than expected output.**

Use STRUCTURED BLUEPRINTS, not prose:
```
Function: validateEmail(email: string): boolean
- Regex: /^[^@]+@[^@]+\.[^@]+$/
- Return: true if match, false otherwise
```

**BAD**: "I need you to create a function that validates email addresses..."
**GOOD**: "Function: validateEmail(email: string): boolean\n- Regex test\n- Return boolean"

Always provide `context_files` when code needs imports from existing files.

### Context Discovery Priority (fastest to slowest)
1. **RuVector semantic search** (for "where is X?" queries):
   - **Centralized index:** `~/.local/share/ruvector/index_v2.db` (shared across all projects)
   - **Dual storage:** V1 (semantic/fuzzy) + V2 (structural/SQL)
   - **V1 queries:** "Find similar code" via vector embeddings (cosine similarity)
   - **V2 queries:** "Find callers/refs" via SQL on AST entities
   ```bash
   # Semantic search
   /codebase-search "authentication middleware pattern"
   ./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector query --pattern "auth"

   # Structural SQL query
   sqlite3 ~/.local/share/ruvector/index_v2.db "SELECT * FROM refs WHERE target_name = 'MyFunction';"
   ```
2. **Query past errors** before similar work:
   ```bash
   ./.claude/skills/cfn-ruvector-codebase-index/query-error-patterns.sh --task-description "description"
   ```
3. **Query learnings** for best practices:
   ```bash
   ./.claude/skills/cfn-ruvector-codebase-index/query-learnings.sh --task-description "description" --category PATTERN
   ```
4. **Grep** only for exact string/symbol matches
5. **Glob** only for known file patterns (`**/*.test.ts`)

### MDAP Execution Context (when `enableMDAP=true`)
Applies only in Trigger.dev MDAP mode:
- Single file only (path provided by decomposer)
- Target: <50 lines of code, atomic task
- No file discovery (context pre-injected)
- Return structured JSON: `{"success": true, "filePath": "...", "linesWritten": N, "confidence": 0.9}`

→ Full protocols: `.claude/agents/SHARED_PROTOCOL.md`

## 4) Mandatory Edit Workflow
- Pre-Edit Backup (required before any edit/write, including docs):
  ```bash
  BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE_TO_EDIT" --agent-id "$AGENT_ID")
  ```
- Post-Edit Validation (run after every edit):
  ```bash
  ./.claude/hooks/cfn-invoke-post-edit.sh "$EDITED_FILE" --agent-id "$AGENT_ID"
  ```
- Revert via backups only (never `git checkout --`):
  ```bash
  ./.claude/skills/pre-edit-backup/revert-file.sh "$FILE_PATH" --agent-id "$AGENT_ID"
  ```
- Hooks are non-blocking; fix issues surfaced by post-edit. Keep backup paths for reference.

## 5) When to Spawn Agents vs Work Solo
- Use a single agent (Task) only for simple, isolated work.
- Use coordinator/CFN Loop for: multi-agent needs, more than three steps, multi-file edits, design decisions, testing plus implementation, quality/security/performance/compliance, docs generation, system integration, or refactors.
- Triggers to avoid solo work: feature work, cross-cutting changes, research plus implementation, code review/quality gates, or anything requiring validation.

## 6) CFN Loop Modes (user chooses)
- Default Task Mode:
  - Command: `/cfn-loop-task "Task description" --mode=standard`
  - Spawns all agents directly; full visibility; higher cost.
  - Best for debugging, learning, or short tasks (<5 minutes).
- CLI Mode (production default):
  - Command: `/cfn-loop-cli "Task description" --mode=standard --provider kimi`
  - Main chat spawns CLI agents directly; Redis BLPOP coordination; lower cost.
  - Best for production, provider routing, and cost-sensitive work.
- Mode guidance: phrases like "execute cfn loop" use task mode; "production cli" uses CLI mode.
- Deprecated: manual Task() spawning for CLI workflows.

### Task Mode Execution Steps
1) Expand slash command; validate parameters.  
2) Spawn required agents via Task() from main chat.  
3) Provide context and success criteria; include lifecycle instructions if auditing.  
4) Agents execute and return results; no Redis signaling.  
5) Iterate or close based on validator/product owner feedback.

### Slash Command Execution Rules (CLI mode)
1) Expand slash command.  
2) Immediately execute coordinator spawn via Bash tool using the exact command.  
3) Do not merely show commands; run them.  
4) Inform user after spawn with task ID.  
Anti-patterns: pausing to ask what next, manual Task() for CLI workflows, skipping execution.

### CLI Mode Execution Steps
1) Expand slash command and validate required parameters (mode, optional provider).  
2) Spawn coordinator via orchestration script; confirm task ID.  
3) Loop 3 agents implement and run tests; orchestration monitors via Redis.  
4) Gate check compares pass rate to mode threshold; if failing, iterate Loop 3.  
5) If gate passes, Loop 2 validators review and score.  
6) Product Owner agent decides PROCEED/ITERATE/ABORT; orchestrator enforces.  
7) Report final status, code paths, test results; stop agents cleanly.

## 7) Provider Routing (optional)
- Enable custom routing: set `CFN_CUSTOM_ROUTING=true` in `.env`.
- Provider options: `zai` (default, cost), `kimi` (balanced), `openrouter` (broad access), `max` or `anthropic` (premium), `gemini`, `xai`.
- Agents without provider parameters default to Z.ai glm-4.6 when custom routing is on.
- Example flow: `/switch-api kimi` then `/cfn-loop-cli "Feature" --provider kimi`.
- Full guide: `docs/CUSTOM_PROVIDER_ROUTING.md`.

### Provider Selection Hints
- Cost sensitive: `zai` or low-tier `openrouter`.
- Balanced quality/cost: `kimi`.
- Highest quality/safety: `max` or `anthropic`.
- Google ecosystem: `gemini`.
- XAi/Grok style: `xai`.
- Mixed providers: set per-agent profile; otherwise inherit main chat provider.

## 8) Docker Build Requirements (WSL2)
- Always build from Linux-native storage; do not build from Windows mounts.
- Use scripts, not raw `docker build`:
  - Preferred: `./.claude/skills/docker-build/build.sh --dockerfile docker/Dockerfile.agent --tag cfn-agent:latest`
  - Manual: `DOCKERFILE="docker/Dockerfile.agent" IMAGE_NAME="cfn-agent" ./scripts/docker/build-from-linux.sh`
- Windows mount builds are ~755s vs <20s from Linux. All CFN images must use Linux builds.
- Dockerfiles should note the Linux build requirement; docker-specialist must comply.

### Docker Build Checklist
- [ ] Source tree on Linux filesystem (not Windows mount).  
- [ ] Use build script, not `docker build`.  
- [ ] Confirm Dockerfile path and tag arguments.  
- [ ] Clean `/tmp/cfn-build` if space issues.  
- [ ] Document build command and outputs when reporting failures.  
- [ ] If builds are slow, verify you are not running from a Windows path.

## 9) Multi-Worktree Docker Coordination
- One git worktree per developer; isolation via `COMPOSE_PROJECT_NAME`.
- Port offsets auto-calculated with `run-in-worktree.sh` to avoid conflicts.
- Required environment variables when spawning agents:
  ```bash
  export COMPOSE_PROJECT_NAME="cfn-${BRANCH}"
  export CFN_REDIS_PORT="${CFN_REDIS_PORT}"
  export CFN_POSTGRES_PORT="${CFN_POSTGRES_PORT}"
  export WORKTREE_BRANCH="${BRANCH}"
  ```
- Use service names inside Docker networks: `redis`, `postgres`, `orchestrator` (not container names).
- Checklist: start stack with `./scripts/docker/run-in-worktree.sh up -d`; isolate Redis keys by task IDs; avoid shared volumes; use service names only.
- Port examples: main (6379/5432/3001); feature-auth (~6421/5474/3043); bugfix-validation (~6457/5510/3079).

### Multi-Worktree Playbook
1) Create or enter worktree with branch-specific name.  
2) Run `./scripts/docker/run-in-worktree.sh up -d` to start services.  
3) Export project/port env vars before spawning agents.  
4) Connect using service names inside the network; from host, use offset ports.  
5) Tear down with `./scripts/docker/run-in-worktree.sh down` and prune networks if needed.

## 10) Task Mode SQLite Lifecycle (audited tasks)
- Use when Task agents need an audit trail without Redis.
- Template:
  ```javascript
  Task("docker-specialist", `
    LIFECYCLE:
    AGENT_ID="docker-$(date +%s)-$$"
    sqlite3 "./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db" \
      "CREATE TABLE IF NOT EXISTS agents (...);" && \
    sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO agents (...);"
    # complete task
    sqlite3 "$DB_PATH" "UPDATE agents SET status='completed', confidence=<0.85-0.95>, completed_at=datetime('now') WHERE id='$AGENT_ID';"
  `)
  ```
- Database path: `./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db`.
- Table schema: `id, type, status, confidence, spawned_at, completed_at, metadata`.
- Do not include Redis/CLI commands in Task mode prompts; SQLite only.

### Lifecycle Notes
- Confidence values for auditing typically 0.85-0.95.  
- Ensure `sqlite3` is installed; fail fast otherwise.  
- Keep lifecycle instructions concise and ahead of the task request.  
- Clean up stale audit rows if the table grows; retention per project policy.

## 11) Coordination Patterns and Namespace Isolation
- Coordination patterns: see `.claude/skills/cfn-coordination/SKILL.md` (chain, broadcast, mesh, consensus collection).
- Namespace structure: agents `.claude/agents/cfn-dev-team/`; skills `.claude/skills/cfn-*/`; hooks `.claude/hooks/cfn-*`; commands `.claude/commands/cfn/`.
- Enhanced orchestrator v3.0: `./.claude/skills/cfn-loop-orchestration/orchestrate.sh` (monitors agents, restarts stuck ones, enforces protocols).
- Orchestration flow: Loop 3 executes and tests -> gate check -> Loop 2 validators -> Product Owner decision (PROCEED/ITERATE/ABORT) -> iterate or finish.
- Agent protocol (CLI): completion signaling via Redis, context validation, metadata tracking, health monitoring.
- Task mode agents: return output directly; no Redis signaling.

### Coordination Anti-Patterns (avoid)
- Skipping gate check before spawning Loop 2.  
- Validators reviewing without tests/logs.  
- Product Owner decision without deliverable paths.  
- Mixing service and container names inside Docker networks.  
- Manual cleanup instead of orchestrator controls.

## 12) Agent Output Standards
- Bug docs: `docs/BUG_#_*.md` (investigation, fix, validation).
- Test scripts: `tests/test-*.sh` (checked in).
- Feature docs: `docs/FEATURE_NAME.md` (architecture/process).
- Temporary files: `/tmp/` only.
- Backlog items: `.claude/skills/cfn-backlog-management/add-backlog-item.sh` (item, reason, solution).
- Changelog: `.claude/skills/cfn-changelog-management/add-changelog-entry.sh` (10-100 characters, sparse impact).
- Full standards: `docs/AGENT_OUTPUT_STANDARDS.md`.

## 13) Test Execution Guidance
- Always run tests before committing: after features or bugfixes, agent behavior changes, CFN workflow changes.
- Suites and timing:
  - `npm test` (1-5 minutes, dev feedback)
  - `npm run test:unit` (~1 minute)
  - `npm run test:integration` (~2 minutes)
  - `npm run test:e2e` (~5 minutes)
  - `./tests/cli-mode/run-all-tests.sh` (5-10 minutes; validates `/cfn-loop-cli`)
  - `./tests/docker-mode/run-all-implementations.sh` (3-5 minutes; 45 integration tests)
  - `./tests/cfn-v3/test-e2e-cfn-loop.sh` (5-15 minutes; coordinator/orchestration)
- Run CLI mode tests before commits touching agent spawning, coordination thresholds, or Redis patterns.
- Run Docker suite before Docker-related changes or releases.
- Test artifacts: `.artifacts/test-results/`, coverage `.artifacts/coverage/`, logs `.artifacts/logs/`, runtime `.artifacts/runtime/`.

### Test-Driven Gates (v3.0+)
- Loop 3 gate: pass rate must meet mode threshold before validators start.
- Loop 2 consensus thresholds by mode:
  - MVP: gate >= 0.70, consensus >= 0.80
  - Standard: gate >= 0.95, consensus >= 0.90
  - Enterprise: gate >= 0.98, consensus >= 0.95

### Test Authoring Standards (tests/CLAUDE.md)
- Use `#!/bin/bash` and `set -euo pipefail`; source `tests/test-utils.sh` immediately.
- Structure with GIVEN/WHEN/THEN; use `log_step`, `log_info`, `annotate`, `assert_success`.
- Always add a cleanup trap (docker rm, worktree prune, rm -rf temp).
- Integration tests must use production code paths (spawn-agent.sh, production images, real CLI syntax, log checks).
- Infrastructure tests may mock networking or Redis; integration tests must not.
- Cite relevant bugs or references in test headers for traceability.

### Troubleshooting Quick Fixes
- Redis missing: `redis-server --daemonize yes` or docker `redis:7-alpine`.
- Docker not running: start daemon (`systemctl start docker` or Docker.app).
- Port conflicts: `docker stop $(docker ps -aq) && docker rm $(docker ps -aq) && docker network prune -f`.
- Permissions: `usermod -aG docker $USER` then `newgrp docker`.
- Verbose mode: `DEBUG=true ./tests/cli-mode/run-all-tests.sh`; inspect `.artifacts/logs/test-execution.log`.

## 14) Quality and Skill Development
- Skill guidelines: maximize modularity, explicit interfaces, minimal dependencies, thorough tests.
- STRAT-005: cover functional requirements and edge cases (timeouts, blocking). Example: `.claude/skills/cfn-coordination/test-orchestrator.sh`.
- Core skill references: `.claude/skills/cfn-coordination/SKILL.md`, `.claude/skills/cfn-agent-spawning/SKILL.md`, `.claude/skills/cfn-loop-validation/SKILL.md`.

## 15) General Programming Best Practices
- Regex validation: avoid self-matching patterns (`[[ $AGENTS =~ $AGENTS ]]`); use specific regexes.
- Comprehensive file validation: check type, permissions, size, and content integrity.
- Shell scripting: use strict mode `set -euo pipefail`; capture pipeline failures.
- Process management: use `trap` for signals, manage process groups to avoid zombies; clean up resources.
- Prefer explicit error handling and early exits to prevent cascading failures.

## 16) Quick Reference: Do / Do Not
- Do: delegate early, run backup hooks, keep responses concise, redact secrets, use service names, build Docker from Linux storage.
- Do: gate by tests, cite bugs or references in tests, run appropriate suite before commits.
- Do Not: skip pre-edit backup or post-edit hook; run tests inside agents; build Docker from Windows mounts; hardcode secrets; mix implementer and validator roles; save to project root.

## 17) Key Files and Paths
- Hooks: `./.claude/hooks/cfn-invoke-pre-edit.sh`, `./.claude/hooks/cfn-invoke-post-edit.sh`.
- Backup revert: `./.claude/skills/pre-edit-backup/revert-file.sh`.
- Orchestrator: `./.claude/skills/cfn-loop-orchestration/orchestrate.sh`.
- Provider routing guide: `docs/CUSTOM_PROVIDER_ROUTING.md`.
- Test guides: `tests/README.md`, `tests/CLAUDE.md`, `tests/cli-mode/README.md`, `tests/docker-mode/README.md`, `tests/TEST_COVERAGE_MATRIX.md`.
- CFN Loop architecture: `docs/CFN_LOOP_ARCHITECTURE.md`.
- CI/CD pipeline: `docker/CI_CD_TEST_INTEGRATION.md`.
- Analytics: `.artifacts/analytics/context-reduction-report.json`.

## 18) Execution Playbooks (quick recipes)
- Implement feature (CLI mode):
  1) `/cfn-loop-cli "Implement <feature>" --mode=standard --provider kimi`
  2) Provide acceptance criteria and target paths; cite relevant docs.
  3) After completion, report code paths and tests run; suggest final validation.
- Debug bug (Task mode):
  1) `/cfn-loop-task "Investigate bug <id>" --mode=standard`
  2) Include repro steps and log paths; require root cause, fix, and tests.
  3) Save output to `docs/BUG_<id>_*.md`.
- Add test coverage:
  1) Spawn testing-focused agent; include target modules and desired coverage.
  2) Require GIVEN/WHEN/THEN style, cleanup traps, production code paths.
  3) Run the relevant suite once via coordinator; collect artifacts.
- Docker build verification:
  1) Confirm Linux filesystem; use build script with tag.
  2) Capture build command and timing; store logs if failing.
  3) If failure, collect `/tmp/cfn-build` outputs and Docker logs.

## 19) Common Checks Before and After Work
- Before: confirm mode (task vs CLI), provider choice, environment variables, worktree isolation, and backup path.  
- During: keep messages concise; avoid mixing roles; use service names; cite paths.  
- After: run post-edit hook; run appropriate tests; link artifacts; note backlog items.

## 20) Security and Data Handling
- Redact credentials, tokens, and personal data (`[REDACTED]`).  
- No secrets in code, docs, tests, or environment examples.  
- Validate inputs (type, size, permissions) before processing.  
- Prefer least-privilege operations; avoid destructive commands unless explicitly requested.  
- Scrub task IDs or usernames in shared logs if sensitive.

## 21) Background Monitoring Pattern
- For long-running tasks: execute action, `sleep <n>m`, recheck, repeat; avoid tight loops.  
- Capture partial logs at each check; stop on errors.  
- If stuck, restart via orchestrator rather than manual kills.  
- Clean up child processes to avoid zombies and port leaks.

## 22) Troubleshooting Quick Table
- Build slow or failing: verify Linux filesystem, use build script, clean `/tmp/cfn-build`.  
- Redis connection issues: ensure service running, ports offset correct, service name used inside network.  
- Port conflicts: stop and remove containers, `docker network prune -f`, restart stack.  
- Post-edit hook fails for missing tools (e.g., `jq`): install dependency or rerun after adding it.  
- Tests flaking: rerun with `DEBUG=true`, inspect `.artifacts/logs/test-execution.log`.  
- Orchestrator stuck: restart via orchestration script; check Redis coordination keys for stale locks.

## 23) File and Path Conventions
- Place new scripts/tests in relevant subdirectories; never in project root.  
- Name tests `test-*.sh`; feature docs `FEATURE_NAME.md`; bug docs `BUG_<id>_*.md`.  
- Use workspace-relative paths when reporting results (for example `src/app.ts:42`).  
- Do not use URI schemes like file:// or vscode:// in reports.

## 24) Response Formatting for Agents
- Be concise and factual; bullets preferred.  
- Include code paths inline with backticks; add line numbers when available.  
- In reviews, list findings first (ordered by severity), then questions, then brief summary.  
- Suggest next steps when natural; number options for quick replies.  
- Avoid nested bullets and ANSI codes; keep headers short (1-3 words).

## 25) Validation and Gates Recap
- Loop 3 gate: test pass rate must meet the mode threshold before validators start.  
- Loop 2 validators need access to Loop 3 outputs, tests, and logs.  
- Product Owner decision parsed via `.claude/skills/product-owner-decision/execute-decision.sh`.  
- Gate failure: iterate Loop 3 only. Gate pass: proceed to validators.  
- Decision outcomes: PROCEED (done), ITERATE (repeat), ABORT (stop with error).

## 26) Mode Comparison Snapshot
- MVP: fast prototyping; gate >= 0.70, consensus >= 0.80; up to 5 iterations; 2 validators.  
- Standard: production default; gate >= 0.95, consensus >= 0.90; up to 10 iterations; 3-5 validators.  
- Enterprise: compliance focus; gate >= 0.98, consensus >= 0.95; up to 15 iterations; 5-7 validators.  
- Pick higher modes for security/compliance-sensitive tasks; expect longer runtimes but higher assurance.

## 27) Artifacts and Coverage
- Test results: `.artifacts/test-results/` (per-suite archives).  
- Coverage: `.artifacts/coverage/` (HTML or lcov outputs).  
- Logs: `.artifacts/logs/` (CLI and orchestrator logs).  
- Runtime: `.artifacts/runtime/` (transient runtime data).  
- Benchmarks (if produced): `.artifacts/benchmarks/`.  
- Include artifact paths in reports; avoid attaching large logs inline.  
- For coverage regressions, note impacted modules and thresholds breached.

## 28) CI/CD Expectations
- Local pre-commit recommendation: `npm test` then `./tests/cli-mode/run-all-tests.sh` then `./tests/docker-mode/run-all-implementations.sh`.  
- Ensure Docker daemon is available before running Docker-mode suites.  
- CI runs GitHub Actions for tests, coverage gates (>=80% lines/statements/functions), security scanning, and deployment.  
- Before merging, confirm no flaky tests and no unvetted changes to orchestration or spawning scripts.  
- Record any skipped tests with justification and follow-up owner.

## 29) Incident Response Notes
- Capture exact command, commit hash, environment variables, and logs.  
- Use `[REDACTED]` when logging sensitive fields.  
- Prefer rollback via backup scripts rather than git reset.  
- If orchestration deadlocks, restart orchestrator and clear stale Redis keys scoped to the task.  
- File incidents or backlog items using `.claude/skills/cfn-backlog-management/add-backlog-item.sh` with cause and remediation.

---

Use this trimmed guide as the default reference. For CFN-specific deep dives, defer to specialized docs or agents noted above. Keep this file lean; avoid reintroducing duplication.
