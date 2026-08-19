# CFN Operating Guide v2.25.0

## 1. Edit Safety (REQUIRED)

```bash
BACKUP_PATH=$(~/.claude/hooks/cfn-invoke-pre-edit.sh "$FILE" --agent-id "$AGENT_ID")
# ... edit ...
~/.claude/hooks/cfn-invoke-post-edit.sh "$FILE" --agent-id "$AGENT_ID"
```
CFN rules override Claude Code defaults when they conflict.

---

## 2. Critical Rules

### Agent Usage (MANDATORY)

**SPAWN FREQUENTLY** Protect context windows in main chat. Offload the work!
- Task requires ≥4 steps, touches multiple files, or combines research + implement + test
- Task involves: architecture decisions, code review, security review, performance analysis, refactoring, debugging root cause
- Research output would flood the main conversation (codebase exploration, log parsing, schema dumps, web research)
- A skill/agent description says "MUST BE USED" or "Use PROACTIVELY" — invoke it immediately, do not wait

Agent descriptions are the dispatch table.

**Solo work only for:** Single-file edits with no research, direct questions answerable from context

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
- **Never write unscoped DELETE/TRUNCATE in test setup or teardown.** Every `DELETE FROM` in test code MUST have a WHERE clause that targets only test-created rows. Unscoped deletes wipe production data when tests run against a shared database.
- **Identify test data by convention.** Use marker values: test article URLs contain `example.com`, test workspace slugs start with `test-workspace-`, test emails match `integration-test%` or `test-%@integration.test`.
- **Never disable FK checks (`session_replication_role = 'replica'`) to work around cleanup ordering.** If you need to disable FK checks, the cleanup is too broad. Scoped deletes with CASCADE handle ordering naturally.
- **Test databases are not isolated.** Most projects share a single Supabase instance for dev and tests. Assume any `DATABASE_URL` in `.env` points to production data. If a test needs a clean slate, insert known test rows and delete only those rows afterward.
- **DELETE/TRUNCATE requires explicit user approval.** Before writing any DELETE or TRUNCATE: explain what rows are removed and why, trace the FK cascade chain (every affected table + cascade rule), state estimated row count impact, then wait for confirmation.
- **Test fixtures MUST NOT name a real entity.** Never import or hardcode a production user id, account id, email, workspace slug, or org id into test code — not as a fixture, not as a constant, not read-only "for reference". Invent a synthetic uuid instead. A real id sitting in a test file is a loaded gun: any execution path that reaches the teardown deletes real data, regardless of how the test was invoked.
- **Destructive teardown MUST assert it is not pointed at production.** Before any DELETE, assert the fixture id differs from the known production id (`assert_ne!(TEST_USER_ID, PRODUCTION_USER_ID, "REFUSING TO RUN: ...")`). This is the tripwire for the case where someone later repoints a fixture at real data to make a failing test pass.
- **`#[ignore]` / test tags are a speed bump, NOT a safety mechanism.** Destructive DB tests should be excluded from the default suite, but never treat exclusion as the thing that keeps data safe — an explicitly-invoked `--ignored` run bypasses it entirely. Safety comes from synthetic fixtures + teardown assertions above. (2026-07-19: an all-`#[ignore]` suite destroyed 137 production `cos_tasks` rows on a deliberate run.)

### Test Output Capture (MANDATORY, ALL languages)

See all errors in ONE run. No run-twice. Capture full output to file, read after.

**Many projects run concurrent. Unique filename per project — no collision.** Include project dir name:

```bash
OUT=/tmp/test-${PWD##*/}-$(date +%s).txt
<test-cmd> 2>&1 | tee "$OUT"
```

Rules:
- **Always pipe `2>&1 | tee "$OUT"`** where `OUT=/tmp/test-${PWD##*/}-$(date +%s).txt`. Read file for full errors. Terminal scrollback lose detail. Project name + timestamp = no clash across concurrent runs.
- **No watch mode.** Use `vitest run` not `vitest`. Watch mode = main cause of re-run.
- **No bail flag.** Drop `-x` / `--bail` / `--fail-fast`. Bail stop at first fail, hide rest.
- **Verbose + full traces.** Want every failure first pass, not summary.
- **Compile errors ≠ test failures.** Compile fail = zero tests run. Dump ALL compile errors one pass BEFORE blaming tests:
  - Rust: `cargo check --message-format=short`
  - TS: `tsc --noEmit`
  - Go: `go build ./...`

Per-language full-error flags (all assume `OUT=/tmp/test-${PWD##*/}-$(date +%s).txt`):

| Lang | Command |
|------|---------|
| vitest | `vitest run --reporter=verbose 2>&1 \| tee "$OUT"` |
| jest | `jest --verbose --no-coverage 2>&1 \| tee "$OUT"` |
| pytest | `pytest -v --tb=short 2>&1 \| tee "$OUT"` |
| Rust | `cargo test 2>&1 \| tee "$OUT"` (`-- --nocapture` for stdout) |
| Go | `go test ./... -v 2>&1 \| tee "$OUT"` |

### Provider Ban (CRITICAL)

**Anthropic API calls are BANNED in all projects.** Covers Claude SDK calls, direct Anthropic provider integrations, and benchmark candidates referencing `anthropic:claude-*` models. Claude Code itself remains in use for development; the ban applies only to programmatic API usage from project code. Adding any Anthropic provider integration requires explicit user permission per request — no exceptions, no defaults.

Replacement map (`anthropic:* -> xai:*`) and cost/reasoning-model rules: `~/.claude/references/provider-cost-runtime.md`.

### Cost Safety (CRITICAL)
- **`claude -p` with `ANTHROPIC_API_KEY` set bills API, not subscription.** Before any long-running `claude -p` loop: `unset ANTHROPIC_API_KEY` to force subscription billing, cap spend with `--budget=<usd>`, confirm via token dashboard. Full rules: `~/.claude/references/provider-cost-runtime.md`.

### Content Standards
- **No Em Dashes:** Never use em dashes (---, &mdash;, or the literal character) in website copy, comments, or code. Use periods, commas, colons, or parentheses instead. (Agents default to em dashes; override this.)

### Decision Protocol (MANDATORY, ALL contexts)
- **Always use AskUserQuestion** to surface decisions to the user. Never assume or silently decide.
- **One decision per question.** Ask a single question with a plain English explanation of the tradeoff and your recommendation. Do not bundle multiple decisions into one message.
- **Plain English only.** No jargon, acronyms, or internal terminology in decision questions. Write as if explaining to someone unfamiliar with the codebase.
- **Meaningful Decisions** Only surface decisions that have a meaningful consequence if made without human input. Example: "Should I commit"? Little consequence, go ahead and do it unless CIDi pipelines enabled. "Should I remove these records from the database?" Large consequence, ask user. 
- **Order of implementation** should be decided by you. Do not stop to ask the user. 

### Plan Mode Protocol
- **Completeness default:** Default to complete implementation. Deferring tests or edge cases saves minutes, not days.
- **One decision per question:** Surface ONE decision per question with genuine tradeoffs and a recommendation.
- **Escape hatch:** Obvious fix with no real tradeoff — state what you'll do and move on.
- **Scope challenge (Step 0):** Verify: (1) minimum viable scope, (2) existing solutions, (3) 8+ files = smell test.
- **Megaplan pre-plan (REQUIRED for non-trivial work):** Before plan mode or `/write-plan`, run `/cfn-megaplan "<task>" [--tier=mvp|beta|enterprise]` — see *Planning Pipeline* below for the DAG, gates, and outputs. Required for: multi-file changes, shared-state changes (DB/API/types), new features, security/auth changes, cross-project work. Skip only for single-line fixes, renames, or bug fixes with a reproducing test. Medium features (3-7 files, single shared-state surface) route to `/cfn-megaplan-lite` instead of skipping planning. Multi-part mvp/beta programs route to `/cfn-megaplan-fast` (one shared plan, thin per-part plans).
- **Investigate before planning:** Dump actual schema/imports/config and trace dependencies before writing any plan that touches data or shared state.
- **Assumption registry:** Every plan must list assumptions as explicit, testable statements. See `code-quality.md` for full rules.
- **plan review:** For migrations, schema changes, or cross-project work, run the plan review skill "/cfn-plan-review" (dependency trace, blast radius, gap analysis) in the same session. Merge results into the plan.
- **Sonnet/TDD:** Assume all implementation will be done with sonnet level subagents and TDD is required

### Planning Pipeline (canonical order)
```
/cfn-megaplan      (canonical entry: tiered DAG — research+spec+decide+pseudo+data+
                    arch+ux+design+test-plan+ops, wrapping write-plan + plan-review,
                    gated by Verifiable-done + Haiku-executable bars; --tier=mvp|beta|enterprise)
   ├─ /cfn-megaplan-lite  (medium-feature branch: balanced cut, both bars 1-round, no live probe,
                          pseudo folded into arch, sonnet non-core phases; for 3-7 file features)
   ├─ /cfn-megaplan-fast  (token-lean branch, DEFAULT for mvp/beta multi-part programs: spec/data/arch/ux
                          ONCE, per-part only test-plan + write-plan + Bar A from section extracts; hard
                          artifact byte caps; static bars, 1 round; opus only spec+arch; no nested spawns.
                          Optional /goal wrapper drives it + loop-task unattended. Full megaplan for
                          enterprise/compliance/ops/migration-rehearsal)
   ↓  (megaplan internally runs write-plan and cfn-plan-review; only invoke them
       standalone when iterating on an existing plan)
/cfn-goap-plan     (optional: goal-state modeling + A* action sequence)
   ↓
/cfn-loop-task     (execution — default, subscription-backed; Verifiable-done manifest
                    is the completion gate)
```
Non-code branch (deliverable is a document, not a build):
```
/cfn-knowledge-plan  (strategy docs, proposals, competitive analysis, board updates,
                      research memos: intake+brief+extract-plan+outline → extract →
                      synthesis → draft, gated by Bar K grounding + weasel scan.
                      Plan-for-the-plan: NO drafting before KPLAN_<slug>.md is approved.)
   ↓
/cfn-share           (publish any plan/spec/doc as a private page with a stable URL for
                      non-terminal reviewers; re-shares update the same link)
```
Sub-pipelines megaplan composes (run standalone only for narrow/iterative work):
- `/cfn-spa-plan` — spec + pseudo + arch only, no tiering or extra phases.
- `/write-plan` — implementation roadmap, agent dispatch, TDD phases.
- `/cfn-plan-review` — assumption extraction, dependency trace, blast radius.
- `/cfn-megaplan-lite`: balanced cut of megaplan for medium features (3-7 files, single shared-state surface); both bars 1-round, no live probe, pseudo folded into arch, sonnet non-core phases.
- `/cfn-megaplan-fast`: token-lean planner for multi-part programs (and cheapest safe path for single features). One program-level spec/data/arch/ux, then per-part test-plan + write-plan + Bar A over `extract-sections.sh` slices (`--part-specs` auto-adds a 12KB per-part SPEC when parts are distinct domains); `check-size.sh` caps every artifact; Bar B static lint only. Same loop-task hand-off. Measured reason: a 7-part megaplan program cost ~10M output tokens.
- `/cfn-knowledge-plan`: non-code deliverables. Route here when the output is prose, not code. A doc that specifies a build still goes to `/cfn-megaplan`. Hand raw sources (full transcript, whole PDF) to intake — summarising first destroys the signal extraction mines.
- `/cfn-share`: hand a plan to someone who does not live in a terminal. Always pass the recorded `url` on re-shares or the reader's link is orphaned.

Conditional phases (frontend/db/pii/unknowns) auto-resolve from cfn-spec build flags; the security floor (RLS/auth/secrets/no-unscoped-delete/PII) is forced on regardless of tier. Outputs `planning/*_*.md` per phase.

`/cfn-loop-cli` only when external-API delegation (non-Claude providers) required.
Skipping `/cfn-megaplan` is the primary cause of intent drift, missed edge cases, and the dropdown-as-textbox class of UI bugs. Default to running it.

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

Every commit MUST update these two docs. Create if missing. **Full contract: `~/.claude/skills/cfn-doc-lint/SCHEMA.md`** (the spec) + `/cfn-doc-lint` (the enforcer). Summary:

1. **`readme/feature-status.md`** — Production readiness tracker. Update when features change, status changes, or test coverage changes.
   - **Closed status vocabulary (all projects):** `prod | beta | dev | stub | deprecated`. No other tokens (`done`, `shipped`, `mvp`, `mock`, `live`, `wired`, `partial`...) — collapse them per SCHEMA. One token per Status cell.
   - **Columns:** `Feature | Status | Description | Dependencies | Known Limitations` (optional: `Last Verified`, `Tests`, `Location`).
   - **Description cell ≤ 280 chars** (over 800 fails lint). Longer = changelog leaking in.
   - **First 20 lines:** `**Last Updated:** YYYY-MM-DD (one-sentence reason)` + a Status Legend.
   - **No changelog/diary/merge-log content.** History goes in `readme/CHANGELOG.md`. This file holds current truth only.

2. **`readme/state-machines.md`** (plural — singular and domain-prefixed filenames fail lint). Entity lifecycle documentation. Update when stateful entities or transitions change.
   - One canonical `## Entity` per state machine. **Edit in place; never prepend a dated copy.** Duplicate entity names fail lint.
   - Per entity: `**Source:**` grounding (table.column or file:line) + `### States` + `### Transitions` (`From | To | Trigger | Guard`) + one diagram (mermaid OR ASCII, not mixed).
   - > 300 lines needs an anchor-link TOC at top.
   - **No implementation/code-review prose** — that goes in an ADR or code comment.

**Enforcement:** run `/cfn-doc-lint` (or `.claude/skills/cfn-doc-lint/execute.sh --check-all ~/projects`) before commit. A PostToolUse hook in `.claude/settings.json` fails edits to these two filenames that violate the contract.

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

@RTK.md
