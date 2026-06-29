---
name: decision-log
description: "Cross-session decision memory. Two stores in one SQLite DB: an FTS5 index of past conversation messages (query/lookup/briefing) and a structured register of resolved plan decisions (record/decisions). Lets planning phases query prior art and avoid re-opening settled forks."
version: 1.0.0
tags: [planning, memory, decisions, sqlite, fts5, cross-session]
status: production
---

# Decision Log

## Purpose

Persist project decisions and conversation history across sessions so planning phases can query prior art before re-solving a problem or re-opening a settled fork. One SQLite database backs two distinct stores:

1. **`messages`** (conversation FTS index): user/assistant text from Claude Code session JSONL files, BM25-ranked with recency boost. Written by the ingest scripts and the SessionStart hook. Read by `query.sh`, `lookup.sh`, `briefing.sh`.
2. **`decisions`** (structured register): curated plan-time decisions (the chosen option, rationale, rejected alternatives, blocking flag, supersession chain). Written by `record.sh` from the `cfn-decide` phase. Read by `decisions.sh`.

The two stores are separate on purpose: conversation noise stays out of the structured register, and `RESOLVED` forks survive as queryable records distinct from raw chat.

## Inputs

- **DB path:** `${DB_PATH:-$HOME/.claude/decision-log/decisions.db}` (override via `DB_PATH` env).
- **Schema:** `schema.sql` (this dir). Idempotent (`CREATE ... IF NOT EXISTS`); every script applies it on run, so it self-migrates an older message-only DB to add the `decisions` table.
- **project:** defaults to `git rev-parse --show-toplevel` basename, else `CLAUDE_PROJECT_DIR` / cwd basename.
- **Session JSONL:** `~/.claude/projects/<encoded-project>/*.jsonl` (ingest source).

## Outputs

- Rows in the `messages` / `decisions` tables and their FTS5 mirrors.
- stdout: query results (pipe-separated or column mode), structured-decision text (via `jq`), or `[decision-log] ...` status lines.
- exit code: 0 = success, 1 = missing DB / bad usage, 2 = unknown flag.

## Usage

### Structured decisions (the `decisions` store)

```bash
# Write a decision (one invocation per BLOCKING fork; non-blocking optional)
./.claude/skills/decision-log/record.sh \
  --slug <plan-slug> --id D1 --title "<t>" --chosen "<option>" \
  [--rationale "<why>"] [--alternatives "<rejected>"] \
  [--status proposed|accepted|superseded] [--blocking] \
  [--supersede D0] [--project <p>] [--session <sid>] [--timestamp <iso>]
# required: --slug --id --title --chosen. Upserts on (project, slug, decision_id).
# --supersede Dn marks a prior decision superseded by this one.

# Read decisions
./.claude/skills/decision-log/decisions.sh list   [--project <p>] [--slug <s>] [--status <st>]
./.claude/skills/decision-log/decisions.sh show   <slug> [--project <p>]
./.claude/skills/decision-log/decisions.sh search "<terms>" [--project <p>] [--limit N]
```

### Conversation index (the `messages` store)

```bash
# Full-text search across conversation history (BM25 + recency boost)
./.claude/skills/decision-log/query.sh "<terms>" [limit] [project] [context-window]

# Expand one result by message id, with adjacent messages from same session
./.claude/skills/decision-log/lookup.sh <message-id> [context-window]

# Generate a prior-decisions briefing for a task (phrase + term FTS, project-affinity boost)
./.claude/skills/decision-log/briefing.sh "<task-description>" [max-chars] [--project <name>]
```

### Lifecycle / maintenance

```bash
./.claude/skills/decision-log/init.sh         # create empty DB from schema
./.claude/skills/decision-log/ingest.sh <session.jsonl> [project]   # incremental ingest (tracks last_line)
./.claude/skills/decision-log/ingest-all.sh   # backfill every project's session files
./.claude/skills/decision-log/stats.sh        # message/session/project counts + DB size
```

Ingest is incremental: `ingest_state` tracks `last_line` per session file, so re-runs only process new lines. The SessionStart hook `.claude/hooks/cfn-decision-log-ingest.sh` runs the same incremental ingest across all projects in the background at session start, so the conversation index stays current without manual calls.

## Consumers

- **cfn-decide** writes resolved forks via `record.sh` (one call per blocking decision; the structured register is its durable output).
- **cfn-research** queries `query.sh` / `briefing.sh` for prior art so it does not re-solve a solved problem.
- **cfn-plan-review** queries `query.sh '<entities>'` (conversation) and `decisions.sh search '<entities>'` (register) in Phase 1 to surface prior failed assumptions and to avoid re-opening a fork already marked `RESOLVED` (unless `superseded`).
- **cfn-megaplan** orchestrates the above: its decide phase records, its research and plan-review phases read.

## Dependencies

- `sqlite3` (with FTS5: `porter unicode61` tokenizer)
- `jq` (structured-decision and message rendering)
- `git` (project-name derivation; falls back to `CLAUDE_PROJECT_DIR`/cwd)
- Hook: `.claude/hooks/cfn-decision-log-ingest.sh` (SessionStart, background incremental ingest)
