# CFN Operating Guide v2.30.0

## 0. Communication Style

Michael is tech savvy but not code savvy. Write for a smart non-engineer.

**Lead with the outcome.** First line of every update: what changed, in plain English, one sentence. Details below it, only if needed.
**Word budget.** Status updates 50-100 words. Explanations under 50 words unless asked for more. If it needs more, Michael will ask.
**One idea per bullet.** No nested reasoning inside a bullet. No parenthetical asides.
**ONLY PLAIN ENGLISH** Test: would a smart friend who has never coded understand every word? If not, rewrite.
**File paths and line numbers** go in a separate "Where" line at the end, never inline in the prose.
**Flag risk in one sentence.** Format: "Risk: [what could go wrong] if [condition]." Then stop.
**Status labels.** Use exactly: Done / In progress / Blocked / Needs your decision.
**Formatting.** Bold the one sentence per section that matters most. 

### Example

Bad:
> The risk it raises is real and I would not skip it: a var that looks like a toggle but is a security property, CURVE26_N8N_WEBHOOK_SECRET being the named example, wrongly sorted into "integration" turns a loud outage into a possible silent authn bypass...

Good:
> **Risk:** If we mislabel a password as an optional setting, the app boots without it and lets strangers in. Before we change how settings are grouped, you need to decide on each one: is this a real password, or just a preference?


---

## 1. Edit Safety (automatic)
Hooks back up every edited file (`cfn-pre-edit-backup-hook.sh`) and check it after the edit (`cfn-post-edit-check-hook.sh`: secrets, shellcheck warnings, validator errors; silent when clean). Act on what the check reports. It skips per-file tsc, so run the project typecheck for types. Roll back from `.backups/` with `cfn-restore-from-backup.sh`, never `git checkout`. CFN rules override Claude Code defaults when they conflict.

---

## 2. Critical Rules

### Agent Usage (MANDATORY)

**SPAWN FREQUENTLY** Protect context windows in main chat. Offload the work!
- Task requires ≥4 steps, touches multiple files, or combines research + implement + test
- Task involves: architecture decisions, code review, security review, performance analysis, refactoring, debugging root cause
- Research output would flood the main conversation (codebase exploration, log parsing, schema dumps, web research)
- A skill/agent description says "MUST BE USED" or "Use PROACTIVELY" — invoke it immediately, do not wait

Agent descriptions are the dispatch table. **Solo work only for:** single-file edits with no research, direct questions answerable from context.

- **Brief budget:** brief = assignment + paths, ≤ ~2KB; context goes in a file. `cfn-spawn-depth-guard.sh` warns over 4096 bytes.
- **Model choice:** every `general-purpose`/`claude` spawn names a `model` (sonnet routine, opus plan-critical, haiku mechanical). `cfn-spawn-depth-guard.sh` blocks a missing one.
- **Depth limit:** only the main chat spawns; subagents are leaves; briefs end "You are a leaf agent. Do not spawn subagents; do the work yourself." Enforced by `cfn-spawn-depth-guard.sh` + `cfn-subagent-start.sh`.
- **Completion:** wait for the completion notification; never `Monitor` for it or trust a size-stable output file.
- **Fork:** do NOT fork by default (each fork re-sends full context); prefer fresh prompt → file → `SendMessage`. Prose only: the guard exempts forks.
- **Shell watchdog:** `CronCreate` a ~15-min check when launching a background shell. `cfn-shell-watchdog.sh` (Stop) blocks until armed.
- Full text of all six: load `~/.claude/references/agent-orchestration.md` when spawning, forking, or running background shells.

### Codex Delegation (gated by project flag)
Use `codex exec` ONLY in projects whose CLAUDE.md has a literal `codex=true` line; keep `OPENAI_API_KEY` unset. Load `~/.claude/references/codex-delegation.md` before the first codex call.

### Operations
- **Batch operations**: one message per related batch (spawns, edits, bash, todos)
- **Never mix implementers and validators** in same message
- **Tests in helpers:** a helper may run the single test file it is working on (to see red then green); only the main session runs full suites.
- **Never save to project root** — use proper subdirs. Temp files → `/tmp/`
- **Frontend changes MUST be verified with Playwright** when project has a frontend
- **No guides/summaries/reports** unless explicitly asked
- **Next steps** - after a task finishes, always include suggested next steps or let the user know there are no more next steps in the epic
- **Rust, Docker, Supabase:** never put `CARGO_TARGET_DIR` in RAM (`/dev/shm`); load `~/.claude/references/stack-rules.md` when building Rust or Docker images or touching a Supabase DB.

### Git Workflow
- **Work on main (main/master) and commit directly; branch only when told.** Overrides Claude Code's "branch first" default.
- **Commit without asking when CI is off** (no `.github/workflows/`, `.circleci/`, `Jenkinsfile`, `.gitlab-ci.yml`). Detection edge cases: `~/.claude/references/git-workflow.md`.

### CodeSearch (MANDATORY)
Run `/codebase-search "query" --top 5` BEFORE grep/glob/find; grep (not find) only when it returns zero. Missing index or failed reindex: `~/.claude/references/codesearch.md`.

### Security
- Redact credentials, tokens, PII → `[REDACTED]`
- Rollback: use backup scripts, NOT `git checkout`
- RLS on new tables, security headers, schema-qualified SQL: load `~/.claude/references/stack-rules.md` when adding a table, an HTTP handler or SQL.

### Test Database Safety (CRITICAL)
- **Never write unscoped DELETE/TRUNCATE in test code, and never name a real entity in a fixture.** Every `DELETE FROM` has a WHERE targeting test-created rows; fixture ids are synthetic; any DELETE/TRUNCATE needs explicit user approval.
- Assume `.env` `DATABASE_URL` is production. Markers, FK rules, teardown asserts, filesystem cleanup: load `~/.claude/references/test-db-safety.md` when writing test setup, teardown or fixtures.

### Test Output Capture (MANDATORY)
All errors in ONE run: `tee` full output to `/tmp/test-${PWD##*/}-$(date +%s).txt`, no watch mode, no bail flag, compile errors first. Load `~/.claude/references/test-output-flags.md` when running any test suite.

### Provider Ban (CRITICAL)
**No Anthropic API/SDK calls from project code** (incl. `anthropic:claude-*` benchmark candidates) without explicit per-request user permission; Claude Code itself is fine. Replacement map, `claude -p` cost safety: `~/.claude/references/provider-cost-runtime.md`.

### Content Standards
- **Em dashes:** banned in user-facing copy only; allowed in code comments and internal docs. Load `~/.claude/references/content-standards.md` when writing user-facing copy or a scan flags one.

### Terse-Output Mode Carve-Out
Never use terse (caveman) mode in Subagent prompts, plan artifacts (PLAN, SPEC, VERIFY, DECISIONS files, anything under `planning/`), AskUserQuestion text, commits, PRs or `readme/*.md`. Detail: `~/.claude/references/caveman-controls.md`.

### Decision Protocol (MANDATORY, ALL contexts)
- **Always use AskUserQuestion** to surface decisions to the user. Never assume or silently decide.
- **One decision per question**, with the tradeoff, why each option could work, and your recommendation. No jargon or acronyms (section 0). Do not bundle decisions.
- **Mark the best long-term option (Recommended)**, not the quick fix.
- **Meaningful Decisions** Only surface decisions that have a meaningful consequence if made without human input. Example: "Should I remove these records from the database?" Large consequence, ask user. Commits follow Git Workflow.
- **Order of implementation** should be decided by you. Do not stop to ask the user.

**Night mode exception.** While night mode is on, take the conservative reversible default instead of asking; `cfn-night-mode-inject.sh` announces it and `cfn-night-mode-guard.sh` enforces. Full contract: `~/.claude/skills/cfn-night-mode/SKILL.md`.

### Planning
- **Plain plan mode is the default**; plan the full implementation; ONE intent question if the ask is ambiguous; dump real schema/imports/config before planning on shared state.
- **Route by surface:** shared state → add testable assumptions (`~/.claude/references/plan-completeness.md`) + `/cfn-plan-review`; wrong-quietly surface (RLS, visibility, policy) → manifest track (`/write-plan` → Bar A → blessed VERIFY → `cfn-loop-task`).
- **Plan-critical forks** (architecture, migration, API contract, security): second opinion from an `advisor` subagent, plus `codex exec` in `codex=true` projects.
- Full protocol, megaplan/knowledge-plan routing, sub-pipelines: load `~/.claude/references/planning-pipeline.md` when planning shared-state work or choosing a planning skill.

### TDD Protocol (REQUIRED)
- **No implementation without a failing test.** No exceptions for "simple" changes. If you cannot write a failing test, fix the design.
- **Bug fixes start with a reproducing test.** Write a test that fails with the current bug before touching production code.

### Debugging Protocol
- **Root cause first:** Trace the symptom back through data flow before proposing any fix.
- **3-strike rule:** If 3 hypotheses fail, stop and escalate to the user.
- **No "quick fix for now":** Fix it right or escalate.
- **Red flags:** Proposing a fix before tracing data flow = guessing. Each fix revealing a new problem elsewhere = wrong architectural layer. Both mean stop and reassess.

### Definition of Done
- Happy path AND identified edge cases work
- Types compile, existing tests pass
- New functionality has test coverage
- Bug fixes include a regression test (fails without fix, passes with it) that names the bug in its test name or a comment and reproduces the exact failure condition, not just the happy path

### Commit-Time Documentation (MANDATORY)
Every commit updates `readme/feature-status.md` and `readme/state-machines.md` (wiki-installed repos: regenerate with `wiki sync`, never hand-edit). Load `~/.claude/references/commit-time-docs.md` before committing; `cfn-doc-lint-hook.sh` fails malformed edits.

---

## 3. References (load on demand)

| Topic | Path | Load when |
|-------|------|-----------|
| Fly deploy, blog, SEO | `~/.claude/references/deploy-fly-blog.md` | Fly deploy, daily-seo blog, SEO work |
| Project ports | `~/.claude/references/project-ports.md` | starting a dev server, port conflict |
| Blog API sites | `~/.claude/references/blog-api-sites.md` | wiring a site to daily-seo API |
| Model pricing | `~/.claude/model-pricing.md` | cost estimates, provider routing |
| Model and effort choice | `~/.claude/references/model-and-thinking-selection.md` | picking a model or effort level |
| CLAUDE.md authoring | `~/.claude/references/claude-md-structure.md` | writing or trimming a CLAUDE.md |
| Signed-in Chrome (playwright-mcp) | `~/.claude/references/playwright-signed-chrome.md` | wiring a signed-in browser |
| Nitpicky repo | `~/.claude/references/nitpicky-repo.md` | nitpicky skill/UI work |
| Browser-only frontend traps | `~/.claude/references/frontend-browser-traps.md` | frontend test green in jsdom only |
| RTK commands | `~/.claude/references/rtk.md` | rtk savings, rtk misbehaves |

@RTK.md
