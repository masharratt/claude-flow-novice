#!/usr/bin/env bash
# cfn-post-migration-sync — PostToolUse (Bash) hook.
#
# Fires supabase-schema-sync automatically after a migration-apply command
# (supabase db push, psql -f migrations/*, prisma migrate deploy, sqlx, alembic,
# rails db:migrate, dbmate, atlas, django manage.py migrate, ...) so the
# project-local db-query skill never goes stale after a migration.
#
# Timing: PostToolUse fires AFTER the Bash tool completes, so the migration
# is already applied to the DB before this runs. A failed apply leaves the DB
# unchanged, so a redundant sync is harmless (reflects the unchanged schema).
#
# Non-blocking: every path exits 0. Sync failures + output go to the log.
# No-ops cleanly in non-DB projects (no .env / no DATABASE_URL).
#
# Env overrides:
#   CFN_MIGRATION_SYNC_LOG     default $HOME/.claude/cfn-data/post-migration-sync.log
#   CFN_MIGRATION_PATTERNS     override detection regex (raw alternation; re.search)
set -euo pipefail

LOG="${CFN_MIGRATION_SYNC_LOG:-$HOME/.claude/cfn-data/post-migration-sync.log}"
SYNC="$HOME/.claude/skills/supabase-schema-sync/execute.sh"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

# Decide from the event JSON on stdin. Prints "MATCH\n<cwb>" or nothing.
DECISION=$(python3 -c '
import json, os, re, sys
try:
    data = json.loads(sys.stdin.read() or "{}")
except Exception:
    sys.exit(0)
if data.get("tool_name") != "Bash":
    sys.exit(0)
cmd = (data.get("tool_input") or {}).get("command") or ""
cwd = data.get("cwd") or ""
override = os.environ.get("CFN_MIGRATION_PATTERNS", "")
rx = re.compile(override) if override else re.compile(
    r"supabase\s+db\s+push"
    r"|supabase\s+migration\s+up"
    r"|psql\s+.*-f\s+\S*migrations?/"
    r"|psql\s+.*<\s*\S*migrations?/"
    r"|prisma\s+migrate\s+(?:deploy|dev|resolve)"
    r"|sqlx\s+migrate\s+run"
    r"|cargo\s+sqlx\s+migrate"
    r"|alembic\s+upgrade"
    r"|manage\.py\s+migrate"
    r"|rails\s+db:migrate"
    r"|dbmate\s+(?:up|deploy)"
    r"|atlas\s+migrate\s+apply"
    r"|sequelize\s+db:migrate"
    r"|knex\s+migrate:(?:latest|up)"
    r"|typeorm\s+migration:run"
    r"|\bmigrate\s+-path\s+\S*migrations?\S*.*\b(?:up|down)\b"
)
if cwd and rx.search(cmd):
    print("MATCH")
    print(cwd)
' 2>/dev/null) || exit 0

case "$DECISION" in
    MATCH*) ;;
    *) exit 0 ;;
esac

CWD="$(printf '%s\n' "$DECISION" | sed -n '2p')"
[[ -n "$CWD" ]] || exit 0

# Guard: project must actually have a DB to sync.
[[ -f "$CWD/.env" ]] || exit 0
grep -q '^DATABASE_URL=' "$CWD/.env" 2>/dev/null || exit 0
[[ -x "$SYNC" ]] || exit 0

echo "[$(date -u +%FT%TZ)] migration apply detected in $CWD; running schema-sync" >> "$LOG"
if bash "$SYNC" --project-dir "$CWD" >> "$LOG" 2>&1; then
    echo "cfn-post-migration-sync: schema-sync complete, db-query refreshed for ${CWD##*/}" >&2
else
    echo "cfn-post-migration-sync: schema-sync FAILED (see $LOG)" >&2
fi
exit 0
