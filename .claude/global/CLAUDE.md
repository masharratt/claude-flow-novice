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

Agent descriptions are the dispatch table.

**BRIEF BUDGET** A spawn brief is an assignment (task one-liner, input paths, output path + cap), not a context carrier. Keep it ≤ ~2KB; context goes in a file and the brief passes the path. Big briefs make agents write big: over-cap artifacts and compression spawns. The spawn hook warns over 4096 bytes (`CFN_BRIEF_MAX_BYTES`; log `~/.claude/brief-size-warn.log`).

**Solo work only for:** Single-file edits with no research, direct questions answerable from context

**DEPTH LIMIT: only the main chat spawns agents.** A subagent reading this is a leaf: execute the brief directly, never call Agent/Task. If a brief is too big for one agent, say so in the report and let the main chat split it. Exception: orchestration skills (cfn-loop-task, cfn-megaplan and its phase skills) whose own instructions say to spawn. For read-only fan-out prefer `Explore` (its tool set excludes Agent, so nesting is impossible). Any other spawn brief ends with the line: "You are a leaf agent. Do not spawn subagents; do the work yourself."

**Two things that are not completion signals.** Never block on `Monitor` waiting for a subagent notification. Never treat a size-stable output file as "the agent finished" (later agent passes silently overwrite coordinator edits to that file). Wait for the completion notification, nothing else.

### Fork Subagents (`subagent_type: "fork"`) - TOKEN HAZARD
**Default: do NOT fork.** A fork re-sends the entire main-chat context on the parent model (N parallel forks = N x full context); a fresh agent with 5-20 lines of context costs a fraction, and `SendMessage` reaches a live agent that already has it. Fork only when the task depends on conversation-built reasoning a short brief cannot restate without losing fidelity that changes the answer — exactly one fork, late in the session, when context IS the payload. Never for search/read/research, mechanical edits, test runs, or commits; never from inside a fork; past ~50k tokens of conversation, state the reason aloud. Cheapest first: restate in a fresh prompt → point at a file/plan artifact → `SendMessage` → fork last.

### Codex Delegation (gated by project flag)

Use Codex (`mcp__codex__codex` / `mcp__codex__codex-reply` MCP tools) ONLY in projects whose CLAUDE.md contains a literal `codex=true` line. In all other projects, never call codex tools. Subscription-billed: keep `OPENAI_API_KEY` unset or calls silently bill the API.

Load `~/.claude/references/codex-delegation.md` before the first codex call in a flagged project: what to offload, required call shape, reply bounding, which model at which reasoning effort, and the two model-id traps that read as subscription refusals but are not.

### Operations
- **Batch operations**: one message per related batch (spawns, edits, bash, todos)
- **Never mix implementers and validators** in same message
- **Never run tests inside agents** — coordinator executes, agents read results
- **Never save to project root** — use proper subdirs. Temp files → `/tmp/`
- **Frontend changes MUST be verified with Playwright** when project has a frontend
- **No guides/summaries/reports** unless explicitly asked
- **Sparse Language** - remove fluffy language. When 20 words will do over 50, use 20. 
- **Intermediate Technical Level Explanations** - user has some experience but is not an expert
- **Next steps** - after a task finishes, always include suggested next steps or let the user know there are no more next steps in the epic

### Shell Watchdog (hooks enforce)
- **Arm a 15-min check when you launch a background task shell:** `CronCreate` a recurring ~15-min prompt that re-reads the shell's output and process state; `CronDelete` when it exits. Hooks do the rest: the Stop guard blocks idle until the check is armed (ack with `touch /tmp/cfn-shell-watch/<session>.<pid>.watched`), and next-prompt status surfaces finished-but-unacknowledged shells. Services (dev servers, watch mode, `tail -f`) are auto-exempt: reported once, then left alone.

### Git Workflow
- **Work from the main branch (main/master) by default.** Commit directly to it. Do NOT auto-create a feature branch. This overrides Claude Code's default "if on the default branch, branch first" behavior.
- **Only create a branch when explicitly told to.** If the user asks for a branch/PR, branch; otherwise stay on main.
- **Commit without asking when CI is off.** If the repo has no active CI, commit when necessary and do not ask. Detection: absence of CI config files (`.github/workflows/`, `.circleci/`, `Jenkinsfile`, `.gitlab-ci.yml`, etc.) is a sufficient filesystem signal. If workflow files exist but Actions look disabled at settings level, confirm with `gh api repos/{owner}/{repo}/actions/permissions --jq '.enabled'` (= `false`) before treating as off. Cannot reliably detect for local-only or non-GitHub repos; default to checking for workflow files.

### CodeSearch (MANDATORY)
Query CodeSearch BEFORE grep/glob/find — 400x faster:
```bash
/codebase-search "query" --top 5
```
- If index missing: run `/codebase-reindex` first
- If reindex fails or CodeSearch returns zero: use grep (not find — less resource intensive in WSL2)

### Security
- Redact credentials, tokens, PII → `[REDACTED]`
- Rollback: use backup scripts, NOT `git checkout`
- New database tables MUST have Row Level Security (RLS) policies before deployment
- HTTP responses must include security headers (HSTS, CSP, X-Frame-Options) via shared middleware
- SQL queries must use explicit schema qualification or connection-level schema setting. Never rely on search_path defaults.

### Test Database Safety (CRITICAL)
- **Never write unscoped DELETE/TRUNCATE in test setup or teardown.** Every `DELETE FROM` in test code MUST have a WHERE clause targeting only test-created rows. Unscoped deletes wipe production data on a shared database.
- **Identify test data by convention.** Marker values: test article URLs contain `example.com`, test workspace slugs start with `test-workspace-`, test emails match `integration-test%` or `test-%@integration.test`.
- **Never disable FK checks (`session_replication_role = 'replica'`) to work around cleanup ordering.** Needing that means the cleanup is too broad; scoped deletes with CASCADE handle ordering.
- **Test databases are not isolated.** Assume any `DATABASE_URL` in `.env` points at production data. A clean slate = insert known test rows, delete only those.
- **DELETE/TRUNCATE requires explicit user approval.** Explain what rows are removed and why, trace the FK cascade chain (every affected table + cascade rule), state estimated row count impact, wait for confirmation.
- **Test fixtures MUST NOT name a real entity.** Never import or hardcode a production user id, account id, email, workspace slug, or org id into test code — not as a fixture, not as a constant, not read-only. Invent a synthetic uuid: any execution path reaching the teardown deletes real data.
- **Destructive teardown MUST assert it is not pointed at production.** Before any DELETE, assert the fixture id differs from the known production id (`assert_ne!(TEST_USER_ID, PRODUCTION_USER_ID, "REFUSING TO RUN: ...")`). Tripwire for a fixture later repointed at real data.
- **`#[ignore]` / test tags are a speed bump, NOT a safety mechanism.** An explicitly-invoked `--ignored` run bypasses them entirely. Safety = synthetic fixtures + teardown assertions above.

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

Replacement map (`anthropic:* -> xai:*`) and cost/reasoning-model rules: `~/.claude/references/provider-cost-runtime.md`.

### Cost Safety (CRITICAL)
- **`claude -p` with `ANTHROPIC_API_KEY` set bills API, not subscription.** Before any long-running `claude -p` loop: `unset ANTHROPIC_API_KEY` to force subscription billing, cap spend with `--budget=<usd>`, confirm via token dashboard. Full rules: `~/.claude/references/provider-cost-runtime.md`.

### Content Standards
- **Em dashes:** Banned in user-facing copy only (website text, UI, public docs), plus code and code comments. Use periods, commas, colons, or parentheses there. (Agents default to em dashes; override what ships.) Allowed in internal docs: handoffs, subagent briefs, planning artifacts (PLAN_/SPEC_/VERIFY_/DECISIONS_/ARCH_, anything under `planning/`), reports, notes. Never spend turns correcting em dashes in internal docs. Carve-out: code that detects, strips or tests for em dashes has to spell the character literally in its regex or fixture. Those occurrences are the feature, not a violation, so do not "fix" them and do not let a scan flag them.

### Terse-Output Mode Carve-Out (caveman plugin)
Caveman already exempts code, commits, and PRs. Extend that to anything a second party must act on without you present — subagent prompts, plan artifacts under `planning/`, AskUserQuestion text, commit messages, PR bodies, `readme/*.md` — fragments there drop connective reasoning and cost more than the terseness saves. Never drop technical substance from chat replies. Forks inherit every injection; fresh agents get none. Never patch the plugin under `~/.claude/plugins/cache/`; controls: `~/.claude/references/caveman-controls.md`.

### Decision Protocol (MANDATORY, ALL contexts)
- **Always use AskUserQuestion** to surface decisions to the user. Never assume or silently decide.
- **One decision per question.** Ask a single question with a plain English explanation of the tradeoff and your recommendation. Do not bundle multiple decisions into one message.
- **Plain English only.** No jargon, acronyms, or internal terminology in decision questions. Write as if explaining to someone unfamiliar with the codebase.
- **Meaningful Decisions** Only surface decisions that have a meaningful consequence if made without human input. Example: "Should I commit"? Little consequence, go ahead and do it unless CIDi pipelines enabled. "Should I remove these records from the database?" Large consequence, ask user. 
- **Order of implementation** should be decided by you. Do not stop to ask the user.

**Night mode exception.** While `night-mode.sh on`, the AskUserQuestion mandate is suspended: take the conservative reversible default, log every decision under slug `night-<date>`, commit as work finishes but never push, defer irreversible or destructive operations as blocking decisions. A PreToolUse hook enforces; `night-mode.sh off` prints the morning report for review. Full contract: `.claude/skills/cfn-night-mode/SKILL.md`.

### Plan Mode Protocol
- **Completeness default:** full implementation; deferring tests or edge cases saves minutes, not days.
- **Intent confirm:** user-visible change plus a partly ambiguous ask → ONE question before the full plan. Obvious fix with no real tradeoff → state it and move on.
- **Consult the strongest model on plan-critical forks** (architecture choice, data migration, API contract, security-sensitive path): get a second opinion from Fable via an `advisor` subagent; in `codex=true` projects also from Astra via codex MCP.
- **Investigate before planning:** dump actual schema/imports/config and trace dependencies before any plan that touches data or shared state.
- **Routing:** no shared state → plan mode. Shared state, in-repo → plan mode + `/cfn-plan-review`. Known external consumer → same, plus additive-only change or version the surface. Wrong-quietly surface (RLS, visibility, policy, semantic DB changes) → manifest track regardless of size: `/write-plan` from existing artifacts → Bar A → blessed VERIFY → `cfn-loop-task`. File count is a smell test, never a router; 8+ files = check for a missed decomposition.
- Shared-state plans list testable assumptions (`code-quality.md`) and run `/cfn-plan-review` in-session; implementation via sonnet-level subagents, TDD required.

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
- Bug fixes include a regression test (fails without fix, passes with it)

### Commit-Time Documentation (MANDATORY)

Every commit MUST update these two docs (create if missing). Full contract: `~/.claude/skills/cfn-doc-lint/SCHEMA.md`; enforcer: `/cfn-doc-lint` + a PostToolUse hook that fails violating edits.

**cfn-wiki exception (wiki-installed repos only):** where `cfn-wiki` is installed and `<repo>/.wiki/config.json` exists, both files are GENERATED by `wiki sync` — never hand-edit. Author capabilities in `readme/wiki/knowledge.json` or `wiki:enrich` blocks, then run `wiki sync` (`--check` fails on drift). Repos without cfn-wiki follow the hand-maintenance contract below.

1. **`readme/feature-status.md`** — production readiness tracker; update when features, status, or test coverage change.
   - **Closed status vocabulary (all projects):** `prod | beta | dev | stub | deprecated`. No other tokens; collapse per SCHEMA. One token per Status cell.
   - **Columns:** `Feature | Status | Description | Dependencies | Known Limitations` (optional: `Last Verified`, `Tests`, `Location`).
   - **Description cell ≤ 280 chars** (over 800 fails lint). Longer = changelog leaking in.
   - **First 20 lines:** `**Last Updated:** YYYY-MM-DD (one-sentence reason)` + a Status Legend.
   - **No changelog/diary/merge-log content.** History goes in `readme/CHANGELOG.md`.

2. **`readme/state-machines.md`** (plural; singular/domain-prefixed filenames fail lint) — entity lifecycle docs; update when stateful entities or transitions change.
   - One canonical `## Entity` per state machine. **Edit in place; never prepend a dated copy.** Duplicate entity names fail lint.
   - Per entity: `**Source:**` grounding (table.column or file:line) + `### States` + `### Transitions` (`From | To | Trigger | Guard`) + one diagram (mermaid OR ASCII, not mixed).
   - > 300 lines needs an anchor-link TOC at top.
   - **No implementation/code-review prose** — that goes in an ADR or code comment.

---

## 3. Supabase Database Access

- `DATABASE_URL` from `.env` (pooler, IPv4). `SUPABASE_DIRECT_CONNECTION` is IPv6, may fail in WSL2.
- **NEVER `source .env`** (multi-line tokens break bash). Extract: `grep '^DATABASE_URL=' .env | cut -d'=' -f2-`
- **DB queries:** use `./.claude/skills/db-query/execute.sh --sql "..."` (`--schema X` optional). Never raw psql. Handles `pool_size`/`search_path`.
- **After every migration:** `db-query` auto-refreshes via the `cfn-post-migration-sync` PostToolUse (Bash) hook, which detects apply commands (`supabase db push`, `psql -f migrations/*`, `prisma`/`alembic`/`rails`/`sqlx` migrate, `manage.py migrate`, golang `migrate ... up|down`) and runs `supabase-schema-sync`. No-ops in projects without `.env` `DATABASE_URL`. Manual fallback: `~/.claude/skills/supabase-schema-sync/execute.sh`.

---

## 4. References (load on demand)

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
| Caveman plugin controls and measurements | `~/.claude/references/caveman-controls.md` | adjusting terse-output mode |
| Planning pipeline sub-skills and phases | `~/.claude/references/planning-pipeline.md` | choosing among planning skills |
| Codex: what to offload, call shape, model + effort, model-id traps | `~/.claude/references/codex-delegation.md` | first codex call in a `codex=true` project |
| Nitpicky public repo: location, commit rules, layout | `~/.claude/references/nitpicky-repo.md` | working on the nitpicky skill/UI (`masharratt/nitpicky-ui`) |
| Browser-only frontend traps (real click vs jsdom, StrictMode) | `~/.claude/references/frontend-browser-traps.md` | writing or debugging a frontend test that passes in jsdom |

@RTK.md
