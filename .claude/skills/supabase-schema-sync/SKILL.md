---
name: supabase-schema-sync
version: 1.0.0
tags: [supabase, postgres, schema, migration, context]
status: production
description: "Introspects Supabase DB after migrations and updates project db-query skill with current schema. Run after any migration to keep agent context accurate."
---

# supabase-schema-sync

## Purpose

Introspects a live Supabase database via psql and writes a project-local `db-query` skill populated with the current schema. Agents can then read the schema from context instead of running `--inspect` or `--describe` commands on every task.

Running this after each migration keeps agent schema knowledge accurate with zero per-task overhead.

## Usage

```bash
# Sync schema for current project (reads .env from $PWD)
/home/masha/projects/claude-flow-novice/.claude/skills/supabase-schema-sync/execute.sh

# Sync schema for a different project
/home/masha/projects/claude-flow-novice/.claude/skills/supabase-schema-sync/execute.sh \
  --project-dir /path/to/other-project

# Sync only specific schemas
/home/masha/projects/claude-flow-novice/.claude/skills/supabase-schema-sync/execute.sh \
  --project-dir /path/to/project \
  --schemas public,analytics

# Help
/home/masha/projects/claude-flow-novice/.claude/skills/supabase-schema-sync/execute.sh --help
```

## What It Generates

Writes two files to `<project-dir>/.claude/skills/db-query/`:

1. `SKILL.md` - Schema reference in markdown table format, consumed by agents as context. Contains all tables, columns, types, and nullability for each schema. Replaces any existing file.
2. `execute.sh` - Query runner with automatic URL cleanup (strips pgbouncer params psql cannot handle). Only written if the file does not already exist.

## When to Run

- After any database migration
- After `supabase db push` or `supabase migration up`
- When agents are writing SQL against stale schema knowledge
- When onboarding to a new project for the first time

## Hooking Into Migration Workflow

Add to your migration script or post-migration step:

```bash
# After running migrations
supabase db push

# Sync schema to agent context
/home/masha/projects/claude-flow-novice/.claude/skills/supabase-schema-sync/execute.sh \
  --project-dir "$PWD"
```

Or add a npm/make target:

```bash
# package.json scripts
"db:migrate": "supabase db push && cfn-schema-sync"

# Makefile
db-migrate:
    supabase db push
    .claude/skills/supabase-schema-sync/execute.sh
```

## Examples

```bash
# Typical post-migration invocation
cd /home/masha/projects/my-saas
.claude/skills/supabase-schema-sync/execute.sh

# Output
Syncing schema for project: /home/masha/projects/my-saas
Detected schemas: public, analytics
Introspecting schema: public (12 tables)
Introspecting schema: analytics (4 tables)
Schema sync complete. db-query skill updated.
  -> /home/masha/projects/my-saas/.claude/skills/db-query/SKILL.md
```

## Implementation

- Extracts `DATABASE_URL` from `.env` with grep (never sources .env)
- Strips pgbouncer-incompatible params: `pool_size`, `connection_limit`, `pgbouncer`
- Keeps `sslmode` (psql handles it correctly)
- Auto-detects all non-system schemas when `--schemas` is not provided
- Excludes: `pg_catalog`, `information_schema`, `pg_toast`, `pg_temp_*`

## Tests

```bash
# Dry-run: verify URL cleaning logic
bash -c '
  RAW="postgresql://user:pass@host:5432/db?pool_size=10&pgbouncer=true&sslmode=require"
  CLEAN=$(echo "$RAW" | sed "s/[?&]pool_size=[^&]*//g" | sed "s/[?&]pgbouncer=[^&]*//g" | sed "s/[?&]\{2,\}/\&/g" | sed "s/?&/?/g" | sed "s/[?&]$//")
  echo "Clean URL: $CLEAN"
  # Expected: postgresql://user:pass@host:5432/db?sslmode=require
'
```

## Dependencies

- `psql` (PostgreSQL client) in PATH
- `.env` file in project directory with `DATABASE_URL=...`
- `DATABASE_URL` must use the pooler connection (IPv4-compatible, not direct IPv6)
