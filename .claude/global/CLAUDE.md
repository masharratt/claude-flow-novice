# CFN Operating Guide v2.28.0

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

### Fork Subagents (`subagent_type: "fork"`) - TOKEN HAZARD

A fork inherits the **entire main-chat conversation** as its prompt and always runs on the parent model. Cost per fork = current context size, re-sent. Three forks at 100k context = 300k input tokens before the fork does any work. A fresh agent (any other `subagent_type`, or omitted) starts near-empty and costs a fraction.

**Default: do NOT fork. Spawn a fresh agent and pass the 5-20 lines of context it actually needs.**

Fork ONLY when all three hold:
1. The task depends on reasoning built up in this conversation that cannot be restated in a short brief (a long debugging trail, an accumulated design rationale, many interlocking decisions).
2. Writing that brief would cost more effort than it saves, or would lose fidelity that changes the answer.
3. Exactly ONE fork is needed. Never fan out forks in parallel: N forks = N x full context.

Hard rules:
- **Never fork for search, file reading, or research.** Use `Explore` or `general-purpose` with an explicit query.
- **Never fork for a mechanical edit, test run, lint, or commit.** Fresh agent or solo.
- **Never fork early in a session** when context is small enough to restate. Cheap to brief, so brief it.
- **Never fork from inside a fork.** A fork executes directly, it does not re-delegate.
- **Fork late, once, and only when context IS the payload.** Late-session handoffs, "continue this exact investigation in isolation", or a verification pass that must see everything already reasoned about.
- **Check context size first.** Past ~50k tokens of conversation, a fork is expensive enough to require the same justification as any other large spend. State the reason out loud before spawning.
- **Prefer `SendMessage` to an existing agent** over a new fork when the context you need already lives in that agent.

Cheaper substitutes, in order: restate context in a fresh agent prompt, point the agent at a file/plan artifact, `SendMessage` to a live agent, then fork as last resort.

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
- **Compile errors ≠ test failures.** Compile fail = zero tests run. Dump ALL compile errors one pass BEFORE blaming tests.

Per-language full-error command table + compile-triage commands: `~/.claude/references/test-output-flags.md` (load when running any test suite).

### Provider Ban (CRITICAL)

**Anthropic API calls are BANNED in all projects.** Covers Claude SDK calls, direct Anthropic provider integrations, and benchmark candidates referencing `anthropic:claude-*` models. Claude Code itself remains in use for development; the ban applies only to programmatic API usage from project code. Adding any Anthropic provider integration requires explicit user permission per request — no exceptions, no defaults.

Replacement map (`anthropic:* -> xai:*`) and cost/reasoning-model rules: `~/.claude/references/provider-cost-runtime.md`.

### Cost Safety (CRITICAL)
- **`claude -p` with `ANTHROPIC_API_KEY` set bills API, not subscription.** Before any long-running `claude -p` loop: `unset ANTHROPIC_API_KEY` to force subscription billing, cap spend with `--budget=<usd>`, confirm via token dashboard. Full rules: `~/.claude/references/provider-cost-runtime.md`.

### Content Standards
- **No Em Dashes:** Never use em dashes (---, &mdash;, or the literal character) in website copy, comments, or code. Use periods, commas, colons, or parentheses instead. (Agents default to em dashes; override this.)

### Terse-Output Mode Carve-Out (caveman plugin)

The caveman plugin injects terse-output rules at session start, on every compact, and on every user prompt. Its own boundaries already exempt code, commits, and PRs. Extend that exemption to anything a second party must act on without you present:

- **Subagent prompts** (the `prompt` field of Agent/Task). A brief is the agent's entire world. Fragments drop the connective reasoning, so the agent guesses or asks back, costing far more than the terseness saved.
- **Plan artifacts on disk:** PLAN, SPEC, VERIFY, DECISIONS, ARCH, and anything under `planning/`. Other sessions and humans read these later with none of this conversation.
- **AskUserQuestion text.** Already covered by Decision Protocol ("Plain English only") below.
- **Commit messages, PR bodies, `readme/*.md`.**

Terse mode stays on for chat replies to the user. It is not a licence to drop technical substance anywhere.

Forks inherit every injection above; fresh agents get none. Never patch the plugin under `~/.claude/plugins/cache/`. Controls, byte measurements, and disable methods (this session / one project / everywhere): `~/.claude/references/caveman-controls.md` (load when adjusting terse-output mode).

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
- **Routing tree (replaces the old megaplan-required triggers):** Pick the track by planning depth, not file count. File count is a smell test only (8+ files = check for a missed decomposition), never a router.
  1. **No shared state** (component-local state, single-consumer pages) → plan mode.
  2. **Shared state, in-repo only** (DB/API/types where every consumer compiles and tests in this tree) → plan mode + `/cfn-plan-review`. Cross-repo consumers are out of process scope — rare for us, no discovery attempts.
  3. **Known external consumer** (e.g. sites in `~/.claude/references/blog-api-sites.md`) → same as 2, plus: additive-only change or version the surface.
  4. **Wrong-quietly surface** (RLS, visibility, policy, semantic DB changes) → manifest track regardless of size: `/write-plan` from existing artifacts → Bar A → blessed VERIFY → `cfn-loop-task` (see *Manifest Track vs Session Track*).

  The `/cfn-megaplan` family is for program-scale work only: multi-part mvp/beta programs (`/cfn-megaplan-fast`), enterprise/compliance/ops/migration-rehearsal (full `/cfn-megaplan`). Ordinary feature work never routes there.
- **Investigate before planning:** Dump actual schema/imports/config and trace dependencies before writing any plan that touches data or shared state.
- **Assumption registry:** Every plan must list assumptions as explicit, testable statements. See `code-quality.md` for full rules.
- **plan review:** For any shared-state work (routing branch 2+), run the plan review skill "/cfn-plan-review" (dependency trace, blast radius, gap analysis) in the same session. Merge results into the plan.
- **Sonnet/TDD:** Assume all implementation will be done with sonnet level subagents and TDD is required

### Planning Pipeline (canonical order)
```
/cfn-megaplan      (program-scale entry: tiered DAG — research+spec+decide+pseudo+data+
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
Sub-pipelines megaplan composes (`/cfn-spa-plan`, `/write-plan`, `/cfn-plan-review`, `/cfn-megaplan-lite`, `/cfn-megaplan-fast`, `/cfn-knowledge-plan`, `/cfn-share` — run standalone only for narrow/iterative work) and conditional-phase rules (security floor forced on regardless of tier): `~/.claude/references/planning-pipeline.md` (load when choosing among planning skills).

`/cfn-loop-cli` only when external-API delegation (non-Claude providers) required.
Routing wrong is the primary cause of intent drift, missed edge cases, and the dropdown-as-textbox class of UI bugs: plan mode alone on a wrong-quietly surface (branch 4), or skipping `/cfn-plan-review` on shared state (branch 2). Route per the routing tree in *Plan Mode Protocol*.

### Manifest Track vs Session Track (when planning artifacts already exist)

`cfn-loop-task` requires `PLAN_<slug>.md`. It does not require `VERIFY_<slug>.md` — without one it proceeds
without the mechanical Bar A all-green done gate and falls back to gate-vote opinion (dry-review,
security-review, a11y, dep-audit, 3-vote still run regardless; they trigger off manifest build flags, not
off VERIFY presence). Verified against `cfn-loop-task.md:20,26,224`.

Once SPEC/DATA/ARCH/UX already exist for a feature (a megaplan sunk the expensive phases already), the live
question per surface is never "megaplan vs plan mode" — it's whether that surface needs a blessed VERIFY
manifest at all. One criterion decides it: **can this be wrong quietly?**

| Track | Criterion | Process |
|---|---|---|
| Manifest track | Wrong state is invisible until someone is harmed: RLS, `can_view_person`-class visibility, chat/booking state, block enforcement, anything writing policy | `/write-plan` from existing artifacts → Bar A → blessed VERIFY → `cfn-loop-task` |
| Session track | Wrong state is visible the moment you open the page: content pages, display/read surfaces, info/FAQ, schedule display | Plan mode in its own session, TDD, `cfn-loop-task` with PLAN only, no VERIFY |

Split **per surface, not per feature** — one feature can straddle both (e.g. a schedule feature's display
half is session track, its visibility-policy half is manifest track). Evidence for the split (shipped binding
defects, S007 grading failures): `~/.claude/references/planning-pipeline.md`.

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
| Test output capture flags (per language) | `~/.claude/references/test-output-flags.md` | running any test suite |
| Caveman plugin controls and measurements | `~/.claude/references/caveman-controls.md` | adjusting terse-output mode |
| Planning pipeline sub-skills and phases | `~/.claude/references/planning-pipeline.md` | choosing among planning skills |

@RTK.md
