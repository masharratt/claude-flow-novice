---
name: cfn-migration-rehearsal
description: "Rehearses a DB migration up+down round-trip against an EXPLICIT scratch database only. Applies up, captures schema, applies down, re-captures, and diffs to prove up and down are inverses. Refuses to run without CFN_SCRATCH_DATABASE_URL and refuses anything that looks like prod. Executes what cfn-ops only designs."
version: 1.0.0
tags: [database, migration, rollback, safety, scratch-db, round-trip]
status: production
---

# CFN Migration Rehearsal

**Purpose:** `cfn-ops` DESIGNS the rollback (the up+down pair and the rollback rehearsal step). This skill EXECUTES that rehearsal: it actually applies the up migration, applies the down migration, and proves the schema round-trips back to its starting state. A down migration that does not fully reverse its up is caught here, before merge, on a disposable database, not in production during an incident.

## SAFETY CONTRACT (read first)

This skill runs DDL against a real database. Every guard below runs BEFORE any database connection is opened. If any guard trips, the skill exits non-zero with a clear message and touches nothing.

- **Requires `CFN_SCRATCH_DATABASE_URL`.** Without it, the skill refuses. It never falls back to `DATABASE_URL`, `.env`, or any ambient connection. The scratch database must be explicitly named by you.
- **Refuses prod look-alikes.** It refuses if the scratch URL equals `DATABASE_URL` or `SUPABASE_DIRECT_CONNECTION` (read from `.env` without sourcing it) or the environment `DATABASE_URL`, and refuses any URL pointing at a Supabase pooler endpoint (`*pooler.supabase.com*`, `*.pooler.*`).
- **Never writes unscoped DELETE/TRUNCATE.** The skill itself issues no destructive SQL. It also refuses to run a migration FILE that contains an unscoped `DELETE` or a `TRUNCATE`, per the test-database safety rules.
- **Disposable target only.** Use a throwaway database you can drop and recreate. The rehearsal applies real DDL and rolls it back; if the down is wrong, the scratch DB is left in the post-down state for inspection.

The scratch database is YOUR responsibility to provision and dispose. A good pattern: a local Postgres container or a dedicated Supabase project used for nothing else.

## How It Works

1. Run all safety guards. Refuse on any failure.
2. Verify `psql` and `pg_dump` are installed (exit non-zero if not).
3. Capture the baseline schema snapshot (`s0`) with `pg_dump --schema-only`, normalized (comments/SET/blank lines stripped, sorted).
4. Apply the **up** migration with `psql -v ON_ERROR_STOP=1`. On error, stop and report.
5. Capture `s1`. Note if up produced no schema change.
6. Apply the **down** migration. On error, report that up applied but down failed to roll back.
7. Capture `s2`.
8. Diff `s0` vs `s2`:
   - identical to baseline -> **ROUND-TRIP CLEAN** (exit 0).
   - any drift -> **ROUND-TRIP DIRTY**, print the diff, exit non-zero. The down does not reverse the up.

## Inputs

- `--up <file>` (or first positional): the up migration SQL file. Required.
- `--down <file>` (or second positional): the down migration SQL file. Required. A migration with no down is not rehearsable.
- `CFN_SCRATCH_DATABASE_URL` (env): the disposable scratch database. Required.

## Outputs

- Verdict to stdout: `ROUND-TRIP CLEAN` or `ROUND-TRIP DIRTY` with the schema diff.
- Exit codes: `0` clean, `2` safety refusal, `3` missing psql/pg_dump, `4` up failed, `5` down failed, `6` round-trip dirty.

## Usage

```bash
export CFN_SCRATCH_DATABASE_URL="postgres://user:pass@localhost:5433/scratch"

./.claude/skills/cfn-migration-rehearsal/execute.sh \
  --up   supabase/migrations/0007_orders.up.sql \
  --down supabase/migrations/0007_orders.down.sql
```

## Rules

- Never point this at production. The guards exist precisely because a migration rehearsal that hits prod is catastrophic.
- A clean round-trip is necessary but not sufficient. It proves the down reverses the up structurally; it does not prove data is preserved. Data-preservation rehearsal is a separate concern.
- If you cannot provide a scratch database, do not work around the guard. The correct response to "I have no scratch DB" is to provision one, not to disable the check.
- After a real migration lands, run `supabase-schema-sync` so the `db-query` skill's schema context stays current.

## Related

- `cfn-ops` - designs the up+down pair and the rollback rehearsal step that this skill executes.
- `supabase-schema-sync` - refreshes the schema context after a migration is actually applied.
- `db-query` skill - for querying the real DB (this skill deliberately bypasses it because it targets a scratch DB, not `DATABASE_URL`).
