# Cross-Project Flags — Triage Later

Status: **open**. Logged 2026-07-17 during the global CLAUDE.md cleanup. User elected to defer, not fix.

## 1. Anthropic provider-ban conflicts (live code, not docs)

Global rule bans Anthropic API calls in project code (replace with xai/grok map). These call it directly:

| Project | Location | Evidence |
|---------|----------|----------|
| daily-reach | `src/lib/ai/` | `@anthropic-ai/sdk`; `claude-*` models in `providers/anthropic.ts`, `ai-service.ts`, `cost-tracker.ts` |
| golfer_collective | `agents/generators/article-generator.js` | declares `@anthropic-ai/sdk ^0.68.0` |
| daily-dashboards | `lib/ai/client.ts` + `package.json` | `@anthropic-ai/sdk` |

Not a conflict (explicit project override, preserved): **fireside-family** root allows OpenAI/Anthropic runtime in its app code.

Options when triaged:
- Migrate to grok map: `anthropic:claude-sonnet-*`→`xai:grok-4-1-fast-non-reasoning`, `claude-opus-*`→`xai:grok-4.20-beta-0309-reasoning`, `claude-haiku-*`→`xai:grok-4-1-fast-non-reasoning`. Each needs testing after.
- Or grant per-project exception with an explicit override note in that project's CLAUDE.md (mirrors fireside-family).

## 2. Trigger.dev key exposure (deferred, NOT rotated)

4 live keys hardcoded in daily-seo: `tr_dev_*`, `tr_prod_*`, `tr_stg_*`, `tr_preview_*`. Redacted from `daily-seo/docker/trigger-dev/CLAUDE.md` only; same values still hardcoded in ~23 sibling files in that dir + likely `.env`. Keys remain live.

When addressed: rotate all 4 in Trigger.dev dashboard, sweep-replace across the dir, move to `.env` only, confirm `.env` gitignored.

## 3. Low-priority cleanup

- Stale `.claude/worktrees/`: daily-drones (15), daily-agents (3), NSC-serve-wt, fireside-family, ggi-takehome — gitignore + `git worktree prune`.
- `ruv-QuDAG/CLAUDE.md` — 11.8KB pure whitespace, 0 words. Populate or delete.
- `daily-coverage/dist/CLAUDE.md` — byte-dup of src copy. Delete + gitignore `dist/`.
- `ebay/archive/CLAUDE.md` (~1362 tok) — stale boilerplate in archive. Delete on archive cleanup.
- rustdesk/.claude/ — held a whole mislocated seo-intelligence-platform guide (CLAUDE.md fixed); rest of the dir (agents/commands/hooks) may be stale carryover — audit.
- daily-agents / daily-agents-mpd ~90% identical CLAUDE.md — reverse-symlink candidate.
- daily-scrape/tests/README.md — stale path `/home/masharratt/` → `/home/masha/`.
- rustdesk `data/id_ed25519` — server private key on disk; confirm gitignored.
