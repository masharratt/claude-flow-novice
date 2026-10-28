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

## 1. Edit Safety (REQUIRED)

```bash
BACKUP_PATH=$(~/.claude/hooks/cfn-invoke-pre-edit.sh "$FILE" --agent-id "$AGENT_ID")
# ... edit ...
~/.claude/hooks/cfn-invoke-post-edit.sh "$FILE" --agent-id "$AGENT_ID"
```
CFN rules override Claude Code defaults when they conflict.

The post-edit hook runs `tsc` on the single file with no project tsconfig, so its
`TYPE_WARNING` and `LINT_ISSUES` lines are usually false: unresolved workspace imports and
missing path aliases, not real type errors. Confirm against a project-level `pnpm typecheck`
before acting on one, and never "fix" code to satisfy a per-file warning.

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
- **Sparse Language** - remove fluffy language. When 20 words will do over 50, use 20. 
- **Next steps** - after a task finishes, always include suggested next steps or let the user know there are no more next steps in the epic
- **Rust, Docker, Supabase:** never put `CARGO_TARGET_DIR` in RAM (`/dev/shm`); load `~/.claude/references/stack-rules.md` when building Rust or Docker images or touching a Supabase DB.

### Git Workflow
- **Work from the main branch (main/master) by default.** Commit directly to it. Do NOT auto-create a feature branch. This overrides Claude Code's default "if on the default branch, branch first" behavior.
- **Only create a branch when explicitly told to.** If the user asks for a branch/PR, branch; otherwise stay on main.
- **Commit without asking when CI is off.** If the repo has no active CI, commit when necessary and do not ask. Detection: absence of CI config files (`.github/workflows/`, `.circleci/`, `Jenkinsfile`, `.gitlab-ci.yml`, etc.) is a sufficient filesystem signal. If workflow files exist but Actions look disabled at settings level, confirm with `gh api repos/{owner}/{repo}/actions/permissions --jq '.enabled'` (= `false`) before treating as off. Cannot reliably detect for local-only or non-GitHub repos; default to checking for workflow files.

### CodeSearch (MANDATORY)
Query CodeSearch BEFORE grep/glob/find — 400x faster:
```bash
/codebase-search "query" --top 5
```
- If index missing: run `/cfn-codesearch:cfn-codebase-reindex` first
- If reindex fails or CodeSearch returns zero: use grep (not find — less resource intensive in WSL2)

### Security
- Redact credentials, tokens, PII → `[REDACTED]`
- Rollback: use backup scripts, NOT `git checkout`
- New database tables MUST have Row Level Security (RLS) policies before deployment
- HTTP responses must include security headers (HSTS, CSP, X-Frame-Options) via shared middleware
- SQL queries must use explicit schema qualification or connection-level schema setting. Never rely on search_path defaults.

### Test Database Safety (CRITICAL)
- **Never write unscoped DELETE/TRUNCATE in test code, and never name a real entity in a fixture.** Every `DELETE FROM` has a WHERE targeting test-created rows; fixture ids are synthetic; any DELETE/TRUNCATE needs explicit user approval.
- Assume `.env` `DATABASE_URL` is production. Markers, FK rules, teardown asserts, filesystem cleanup: load `~/.claude/references/test-db-safety.md` when writing test setup, teardown or fixtures.

### Test Output Capture (MANDATORY, ALL languages)

All errors in ONE run, no run-twice. Capture full output to file, read after. Unique filename per project (projects run concurrent):

```bash
OUT=/tmp/test-${PWD##*/}-$(date +%s).txt
<test-cmd> 2>&1 | tee "$OUT"
```

- **No watch mode** (`vitest run` not `vitest`), **no bail flag** (drop `-x` / `--bail` / `--fail-fast`), verbose + full traces — every failure first pass.
- **Compile errors ≠ test failures.** Compile fail = zero tests run; dump ALL compile errors one pass BEFORE blaming tests.

Per-language full-error command table + compile-triage commands: `~/.claude/references/test-output-flags.md` (load when running any test suite).

### Provider Ban (CRITICAL)

**Anthropic API calls are BANNED in all projects.** Covers Claude SDK calls, direct Anthropic provider integrations, and benchmark candidates referencing `anthropic:claude-*` models. Claude Code itself remains in use for development; the ban applies only to programmatic API usage from project code. Adding any Anthropic provider integration requires explicit user permission per request — no exceptions, no defaults.

Replacement map, `claude -p` cost safety (unset `ANTHROPIC_API_KEY`, `--budget`), reasoning-model rules: `~/.claude/references/provider-cost-runtime.md`.

### Content Standards
- **Em dashes:** banned in user-facing copy only; allowed in code comments and internal docs. Load `~/.claude/references/content-standards.md` when writing user-facing copy or a scan flags one.
- **Caveman carve-out:** never use terse mode in briefs, plans, AskUserQuestion text, commits, PRs or `readme/*.md`. Detail: `~/.claude/references/caveman-controls.md`.

### Decision Protocol (MANDATORY, ALL contexts)
- **Always use AskUserQuestion** to surface decisions to the user. Never assume or silently decide.
- **One decision per question.** Ask a single question with a plain English explanation of the tradeoff and your recommendation. Do not bundle multiple decisions into one message.
- **Plain English only.** No jargon, acronyms, or internal terminology in decision questions. Write as if explaining to someone unfamiliar with the codebase.
- **Meaningful Decisions** Only surface decisions that have a meaningful consequence if made without human input. Example: "Should I remove these records from the database?" Large consequence, ask user. Commits follow Git Workflow.
- **Order of implementation** should be decided by you. Do not stop to ask the user.

**Night mode exception.** While night mode is on, take the conservative reversible default instead of asking; `cfn-night-mode-inject.sh` announces it and `cfn-night-mode-guard.sh` enforces. Full contract: `~/.claude/skills/cfn-night-mode/SKILL.md`.

### Plan Mode Protocol
- **Completeness default:** full implementation; deferring tests or edge cases saves minutes, not days.
- **Intent confirm:** user-visible change plus a partly ambiguous ask → ONE question before the full plan. Obvious fix with no real tradeoff → state it and move on.
- **Consult the strongest model on plan-critical forks** (architecture choice, data migration, API contract, security-sensitive path): get a second opinion from Fable via an `advisor` subagent; in `codex=true` projects also from Astra via `codex exec`.
- **Investigate before planning:** dump actual schema/imports/config and trace dependencies before any plan that touches data or shared state.
- **Routing:** no shared state → plan mode. Shared state, in-repo → plan mode + `/cfn-plan-review`. Known external consumer → same, plus additive-only change or version the surface. Wrong-quietly surface (RLS, visibility, policy, semantic DB changes) → manifest track regardless of size: `/write-plan` from existing artifacts → Bar A → blessed VERIFY → `cfn-loop-task`. File count is a smell test, never a router; 8+ files = check for a missed decomposition.
- Shared-state plans list testable assumptions (`~/.claude/references/plan-completeness.md`) and run `/cfn-plan-review` in-session; implementation via sonnet-level subagents, TDD required.

### Planning Pipeline
Plain plan mode is the default for feature work; Fable-class models made the megaplan family redundant for ordinary builds. `/cfn-megaplan-fast` only for genuine multi-part mvp/beta programs; full `/cfn-megaplan` only for enterprise/compliance/ops/migration-rehearsal. Non-code deliverables: `/cfn-knowledge-plan` (no drafting before KPLAN approval) → `/cfn-share`. Sub-pipelines (`/write-plan`, `/cfn-plan-review`, `-lite`, `-fast`, `/cfn-goap-plan`, `/cfn-spa-plan`) standalone for narrow or iterative work; `/cfn-loop-cli` only for external-API delegation.
Canonical order, the manifest-vs-session track table (split per surface: wrong-quietly → manifest track), and sub-skill detail: `~/.claude/references/planning-pipeline.md` (load when choosing among planning skills).

### TDD Protocol (REQUIRED)
- **No implementation without a failing test.** No exceptions for "simple" changes. If you cannot write a failing test, fix the design.
- **Bug fixes start with a reproducing test.** Write a test that fails with the current bug before touching production code.

### Question tool
- **Recommendations** add a (Recommended) flag to the best option for long term maintenance, not quick fixes. 
- **Plain english** Give reasoning in plain english as to why an option is a potential solution

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
| Fly.io deploy, blog system, cross-project SEO, WSL port forwarding | `~/.claude/references/deploy-fly-blog.md` | deploying to Fly, touching daily-seo blog, SEO/slug/sitemap work |
| Project port assignments | `~/.claude/references/project-ports.md` | starting dev server, port conflict |
| Blog API site inventory | `~/.claude/references/blog-api-sites.md` | wiring a client site to daily-seo API |
| Model pricing (all providers) | `~/.claude/model-pricing.md` | cost estimates, provider routing config |
| Provider ban replacement map, `claude -p` cost safety, reasoning-model APIs | `~/.claude/references/provider-cost-runtime.md` | calling an LLM provider in project code, scripting `claude -p`, wiring a reasoning model |
| Code quality standards | `~/.claude/rules/code-quality.md` | auto-loaded (glob `**/*`) |
| CLAUDE.md authoring/structure | `~/.claude/references/claude-md-structure.md` | writing or trimming any CLAUDE.md, file too big, deciding what breaks out to reference files |
| Signed-in Chrome for playwright-mcp | `~/.claude/references/playwright-signed-chrome.md` | wiring a signed-in browser session to a project (per-project `.mcp.json` setup) |
| Test output capture flags (per language) | `~/.claude/references/test-output-flags.md` | running any test suite |
| Caveman plugin controls, carve-out, measurements | `~/.claude/references/caveman-controls.md` | adjusting terse-output mode |
| Planning pipeline sub-skills and phases | `~/.claude/references/planning-pipeline.md` | choosing among planning skills |
| Codex: what to offload, call shape, model + effort, model-id traps | `~/.claude/references/codex-delegation.md` | first codex call in a `codex=true` project |
| Nitpicky public repo: location, commit rules, layout | `~/.claude/references/nitpicky-repo.md` | working on the nitpicky skill/UI (`masharratt/nitpicky-ui`) |
| Browser-only frontend traps (real click vs jsdom, StrictMode) | `~/.claude/references/frontend-browser-traps.md` | writing or debugging a frontend test that passes in jsdom |
| Agent spawning: brief budget, model choice, depth limit, fork hazard, shell watchdog, tests in helpers | `~/.claude/references/agent-orchestration.md` | spawning or forking agents, running background shells |
| Model and effort selection (Haiku/Sonnet/Opus/Fable, ultrathink) | `~/.claude/references/model-and-thinking-selection.md` | choosing a model or effort level for a session or helper |
| Test DB and fixture safety (full rules) | `~/.claude/references/test-db-safety.md` | writing test setup, teardown, fixtures, or test file cleanup |
| Commit-time docs contract (feature-status, state-machines) | `~/.claude/references/commit-time-docs.md` | committing, editing either readme doc |
| Rust builds, Docker & build, Supabase DB access | `~/.claude/references/stack-rules.md` | building Rust or Docker images, querying or migrating Supabase |
| Verification traps: guards, tests that cannot fail, scripted edits, enum widen/hash gate | `~/.claude/references/verification-traps.md` | writing a guard, check or new test, scripted edits, widening a union |
| Plan completeness: dependency tracing, assumptions, blast radius, entity completeness | `~/.claude/references/plan-completeness.md` | writing a plan that touches data or shared state |
| Em-dash ruling (full) | `~/.claude/references/content-standards.md` | writing user-facing copy, a scan flags em dashes |
| RTK meta commands, install, name collision | `~/.claude/references/rtk.md` | checking rtk savings, rtk misbehaves |

@RTK.md
