# Codex Parity: Claude-Side Optimizations and Their Codex Equivalents

**Date:** 2026-09-07 (night session; applied + verified same day on user go-ahead)
**Status:** Applied. G1-G4 live (global AGENTS.md, repo AGENTS.md exec-bit rule, 2 agent roles, config.toml + astra.config.toml). Findings in "Applied-state findings".
**Context:** codex-cli upgraded to 0.153.4. `gpt-6-astra` verified live via `codex exec` (read-only smoke test returned `ASTRA-OK`, 7.8k tokens). Billing is subscription, so per-token cost is a non-issue; rate limits and context loading are the real constraints.

## Parity map — what exists on each side

| Claude side | Codex equivalent | Status here |
|---|---|---|
| `~/.claude/CLAUDE.md` (global operating guide) | `~/.codex/AGENTS.md` (global instructions, merged into every session) | **MISSING.** Biggest gap. |
| Repo `CLAUDE.md` | Repo root `AGENTS.md` | Present (41 lines, 2026-08-27): edit safety, git rules, test capture, docs-on-commit. |
| Rules glob (`code-quality.md` etc.) | Same `AGENTS.md` files (no glob mechanism) | Partial — TDD, no-stubs, provider ban, test-DB safety are **not** in any AGENTS.md. |
| Edit-safety hooks (pre/post backup) | `.codex/hooks.json` → `edit-safety.sh` | Present, verified 2026-08-27, advisory-only, untouched since. |
| Subagents (`.claude/agents/*`) | `.codex/agents/*.toml` (V2 multi-agent, enabled by default) | **MISSING.** Built-ins only: `default`, `worker`, `explorer`. |
| Model tiers (haiku/sonnet/opus routing) | `model` + `model_reasoning_effort` per profile/agent | Absent. All calls use server default (gpt-5.6-sol). |
| Statusline / usage HUD | codex-hud plugin | Present. |
| Auto-memory | `~/.codex/memories/` (native, post-upgrade) | Native; nothing to port. |
| RTK token proxy | N/A — codex compacts internally; subscription billing makes it moot | Skip. |
| Night-mode guard hook | None — and `codex exec` bypasses ALL Claude hooks | Mitigate in text: hard rules in global AGENTS.md (never push, never destructive SQL). |

## Ranked gaps and fixes

### G1 — Create `~/.codex/AGENTS.md` (global). Highest value.
Today, codex delegated to `ggi-work` or any other repo reads **zero** rules: those repos have no AGENTS.md, and no global file exists. Every other project gets the raw model. The global file is codex's `~/.claude/CLAUDE.md`. Keep it under ~60 lines: it loads into every codex session in every repo. Draft in Appendix A.

### G2 — Extend repo `AGENTS.md` with the missing CFN rules
Additive only (existing 41 lines stay). Draft in Appendix B. Lower priority than G1 if you want to minimize review load — the global file already carries most of it; repo file then only needs repo-specific deltas.

### G3 — Codex subagent roles (`.codex/agents/*.toml`)
Direct analog of the CFN agent dispatch table. Do NOT port all ~40: codex subagents burn the same subscription rate limit pool, and the built-in `explorer`/`worker` cover research/mechanical work. Port 2 instruction-heavy roles: `code-reviewer` and `root-cause-analyst` (Appendix C).

**Known caveat (verify before relying on pins):** community reports the V2 `spawn_agent` schema dropped `model`/`reasoning_effort`/`agent_type` around the 5.6 drop (~0.144), so per-agent model pins may be ignored — unresolved per an Sept 2026 OpenAI community thread. Docs still document per-file `model` keys taking precedence. Consequence: write roles as **instructions + sandbox only**; pin models at spawn/CLI level (`codex exec -m gpt-5.6-sol`), and treat any per-file pin as a bonus to verify. The role files in Appendix C follow that rule.

### G4 — `config.toml` upgrades: `[agents]` block + trust + astra profile
Current file is 77 bytes: one trust entry pointing at `/home/masha/projects-gg/gg-all-projects` — this repo is untrusted. Draft in Appendix D. Notes:
- `max_concurrent_threads_per_session = 4`: cap codex-internal parallelism for WSL2 (freeze history: swap thrash + CPU oversubscription). The WSL memory monitor only kills *node* processes; codex is a native binary and would not be killed, so the cap is the only guard.
- `default_subagent_model = "gpt-5.6-terra"`: keeps any future subagent fan-out off expensive tiers by default (docs suggest terra for cheap exploration).
- `[profiles.astra]` from the 2026-09-06 change list, now unblocked by the smoke test.

### G5 — Minor: trust entry for this repo
Included in Appendix D. Affects interactive approval prompts; MCP/exec calls set sandbox per call and are unaffected.

### Skip list (deliberate, with reasons)
- **Full 40-agent roster**: rate-limit burn, built-ins cover the rest, briefs already carry role context.
- **Playwright MCP for codex**: heavy, and frontend verification stays on the Claude side per existing rules.
- **CFN skills port**: codex now has native `~/.codex/skills/`, but CFN skills are bash orchestration built around Claude hooks; revisit only if a specific skill is needed codex-side.
- **Night-mode guard port**: cannot hook `codex exec` from Claude side; covered textually by global AGENTS.md hard rules + sandbox discipline (read-only default, workspace-write only for fully specified implementation — unchanged from the Astra change list).

## Verification results (2026-09-07, applied + tested)

1. ~~models_cache stale~~ — confirmed cosmetic: live `gpt-6-astra` calls work while the cache still omits the slug.
2. ~~Bubblewrap~~ — installed by user.
3. Subagent spawn verified in exec mode: `SPAWN-OK`, role `code-reviewer` ran on an empty diff. Rollout JSONL records only parent-model entries (`gpt-5.6-sol`) and no `agent_type` field — V2 pin-drop confirmed in practice. Model pinning stays CLI-level (D5).
4. `codex mcp-server` — not retested this session; keep the deprecation watch.

## Applied-state findings (0.153.4 specifics the drafts did not predict)

1. **Profiles moved out of config.toml.** `[profiles.astra]` there now errors: `legacy ... move those settings into /home/masha/.codex/astra.config.toml`. Per-profile files sit beside config.toml and are selected with `-p <name>`. Appendix D below updated to the new layout.
2. **Codex persists the last-used model across sessions.** After one `--model gpt-6-astra` exec, a flagless exec came up `model: gpt-6-astra` with no `[profiles]` selector involved. The top-level `model = "gpt-5.6-sol"` pin in config.toml is therefore required for the opt-in contract (D2), not just nice-to-have. Verified: pin restores `gpt-5.6-sol` default; `-p astra` still selects astra at effort `low`.

## Morning actions (all done 2026-09-07)

1. ~~Apply Appendix A~~ → `~/.codex/AGENTS.md` created.
2. ~~Apply Appendix D~~ → config.toml + `astra.config.toml` (migrated to the new per-profile file format after the legacy-table error).
3. ~~Apply Appendix C~~ → `.codex/agents/{code-reviewer,root-cause-analyst}.toml`; spawn verified.
4. ~~Appendix B~~ → applied slimmed: only the `core.fileMode=false` exec-bit rule was genuinely missing; the rest duplicated existing AGENTS.md sections.
5. ~~bubblewrap~~ → installed by user.

## Appendix A — `~/.codex/AGENTS.md` draft

```markdown
# CFN Operating Rules (codex-global)

You are codex, executing delegated briefs from a Claude Code coordinator.
The brief is your assignment. Do what it says; report file:line evidence.

## Role
- Leaf agent: do not spawn subagents unless the brief asks for them.
- Stay in the brief's scope. Flag drift instead of following it.
- Read-only sandbox is the default. Write only what the brief authorizes.

## Hard rules
- Never `git push`, never `git reset --hard` / `clean`, no force flags.
- Commit only when the brief says to. Never `git add -A`; stage explicit paths.
- Rollback via backup scripts (`revert.sh` sidecars), never `git checkout`.
- Never `source .env` (multi-line tokens break shells). Extract single vars with grep/cut.
- Temp files in `/tmp/` only. Never write to project root.
- Redact credentials/tokens/PII as `[REDACTED]` in all output.

## Provider ban (CRITICAL)
- NEVER add Anthropic API calls to project code: no `anthropic` SDKs,
  no `claude-*` model ids, no Anthropic provider config. This includes
  dependencies and benchmark candidates. If a task seems to require one,
  stop and report instead.

## Test database safety (CRITICAL)
- Test DBs are NOT isolated; assume any DATABASE_URL points at shared/production data.
- Every DELETE/TRUNCATE must be scoped with WHERE to test-created rows
  (marker conventions: `test-%`, `example.com`, synthetic uuids).
- Never disable FK checks to make cleanup ordering work.
- Never hardcode real user/org/workspace ids in test code.

## Code rules
- TDD: no implementation without a failing test first. Bug fixes start with a
  reproducing test.
- No stubs reported as done. Deliberate shortcuts get a `cfn: <limit>, <upgrade trigger>`
  comment. Deferred work is named in the report, not hidden.
- Adding an enum value means updating every consumer (switches, serializers, UI, DB).

## Tests
- No watch mode, no bail/fail-fast flags. Full output on the first run.
- Capture: `<cmd> 2>&1 | tee /tmp/test-$(basename $PWD)-$(date +%s).txt`

## Style
- Sparse output. Cite `file:line`. No em dashes in code, comments, or user-facing copy.
```

## Appendix B — repo `AGENTS.md` additions (optional, additive)

```markdown
## Delegation context
This repo is the CFN source of truth; its `.claude/` dirs are reverse-symlinked
into `~/.claude/` and shared by every project. Edits here propagate everywhere.
- Skills shell out via `$HOME/.claude/skills/...`, never cwd-relative paths
  (`tests/test-shell-portability.sh` enforces this).
- New scripts need exec bit via `git update-index --chmod=+x` (repo sets
  `core.fileMode=false`; plain chmod is invisible to the index) and
  `#!/usr/bin/env bash` shebang.
- Stage explicit paths only: other projects' agents write into this repo
  through the symlinks; `git add -A` picks up foreign work.
```

## Appendix C — `.codex/agents/` role drafts

`code-reviewer.toml`:
```toml
name = "code-reviewer"
description = "Read-only review of the working diff: correctness, security, DRY. Findings only, never edits."
sandbox_mode = "read-only"
developer_instructions = """
Review the current diff (git diff / git status). Trace callers before flagging.
Security first: injection, authz gaps, secret exposure, unscoped deletes.
Output a findings list only: file:line | severity | one-sentence defect | failure scenario.
No edits, no fixes, no commits. Bound output to the findings list.
"""
```

`root-cause-analyst.toml`:
```toml
name = "root-cause-analyst"
description = "Trace a reported failure back through data flow to root cause. Diagnosis only, no fixes."
sandbox_mode = "read-only"
developer_instructions = """
Trace the symptom back through the data flow before proposing anything.
Name the root cause with file:line evidence. If 3 hypotheses fail, stop and report.
Output: root cause statement, evidence chain, then (only if asked) fix options.
No edits, no commits.
"""
```

(No `model`/`model_reasoning_effort` keys: V2 pinning is unreliable. Pin at spawn: `codex exec -m gpt-5.6-sol -c model_reasoning_effort=high`.)

## Appendix D — `config.toml` draft (APPLIED 2026-09-07, updated to 0.153.x profile format)

`~/.codex/config.toml` (top-level `model` pin must precede all `[tables]`):
```toml
model = "gpt-5.6-sol"

[projects."..."]        # trust entries incl. claude-flow-novice, fireside-family, gg-all-projects

[agents]
enabled = true
max_concurrent_threads_per_session = 4
default_subagent_model = "gpt-5.6-terra"
```

`~/.codex/astra.config.toml` (selected via `codex exec -p astra`; legacy `[profiles.*]` tables in config.toml are rejected by 0.153.x):
```toml
model = "gpt-6-astra"
model_reasoning_effort = "low"
```

Usage: default calls unchanged (server default sol). Astra: `codex exec -p astra ...` or MCP per-call `model: "gpt-6-astra"`. Escalation-class tasks only (arch second opinions, security review, hard debugging) per the 2026-09-06 change list; Medium+ reasoning drains the 5-hour window fast.
