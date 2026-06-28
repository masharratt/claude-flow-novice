#!/usr/bin/env bash
# Read structured decision records (decision-log option 2).
# Reads the `decisions` table written by record.sh. Per-project, cross-session.
#
# Usage:
#   decisions.sh list   [--project <p>] [--slug <s>] [--status <st>]
#   decisions.sh show   <slug> [--project <p>]
#   decisions.sh search "<terms>" [--project <p>] [--limit N]
#
# project defaults to git toplevel basename.
set -uo pipefail

DB_PATH="${DB_PATH:-${HOME}/.claude/decision-log/decisions.db}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$DB_PATH" ]; then
    echo "[decision-log] No database found. Run init.sh first." >&2
    exit 1
fi

# ensure the decisions table exists on a pre-existing message-only db (idempotent)
sqlite3 "$DB_PATH" < "$SCRIPT_DIR/schema.sql"

CMD="${1:-}"; shift || true

PROJECT="" SLUG="" STATUS="" LIMIT=20 TERMS="" POS=""
while [ $# -gt 0 ]; do
    case "$1" in
        --project) PROJECT="${2:-}"; shift 2;;
        --slug)    SLUG="${2:-}"; shift 2;;
        --status)  STATUS="${2:-}"; shift 2;;
        --limit)   LIMIT="${2:-20}"; shift 2;;
        --*)       echo "[decision-log] unknown flag: $1" >&2; exit 2;;
        *)         POS="$1"; shift;;
    esac
done

if [ -z "$PROJECT" ]; then
    PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null \
        || basename "${CLAUDE_PROJECT_DIR:-$(pwd)}")
fi
q(){ printf "%s" "$1" | sed "s/'/''/g"; }
PQ=$(q "$PROJECT")

case "$CMD" in
  list)
    WHERE="project='$PQ'"
    [ -n "$SLUG" ]   && WHERE="$WHERE AND slug='$(q "$SLUG")'"
    [ -n "$STATUS" ] && WHERE="$WHERE AND status='$(q "$STATUS")'"
    sqlite3 "$DB_PATH" <<SQL
.mode column
.headers on
SELECT slug, decision_id AS id, status,
       CASE blocking WHEN 1 THEN 'Y' ELSE '' END AS blk,
       substr(title,1,40) AS title, substr(chosen,1,40) AS chosen
FROM decisions WHERE $WHERE
ORDER BY slug, decision_id;
SQL
    ;;
  show)
    SLUG="${POS:-$SLUG}"
    [ -n "$SLUG" ] || { echo "Usage: decisions.sh show <slug> [--project p]" >&2; exit 1; }
    sqlite3 -json "$DB_PATH" \
      "SELECT decision_id,title,chosen,rationale,alternatives,status,blocking,superseded_by,timestamp
       FROM decisions WHERE project='$PQ' AND slug='$(q "$SLUG")'
       ORDER BY decision_id;" \
    | jq -r '.[] |
        "## \(.decision_id): \(.title)  [\(.status)\(if .blocking==1 then ", BLOCKING" else "" end)]",
        "Chosen: \(.chosen)",
        (if .rationale!="" then "Why: \(.rationale)" else empty end),
        (if .alternatives!="" then "Rejected: \(.alternatives)" else empty end),
        (if .superseded_by!="" then "Superseded by: \(.superseded_by)" else empty end),
        ""'
    ;;
  search)
    TERMS="${POS:-}"
    [ -n "$TERMS" ] || { echo "Usage: decisions.sh search \"<terms>\" [--project p]" >&2; exit 1; }
    SAFE=$(printf "%s" "$TERMS" | sed 's/[^a-zA-Z0-9 ]/ /g' | tr -s ' ')
    FTS=$(printf "%s" "$SAFE" | sed 's/ / OR /g')
    sqlite3 "$DB_PATH" <<SQL
.mode column
.headers on
SELECT d.slug, d.decision_id AS id, d.status, substr(d.title,1,40) AS title
FROM decisions_fts f JOIN decisions d ON d.id=f.rowid
WHERE decisions_fts MATCH '$FTS' AND d.project='$PQ'
ORDER BY rank
LIMIT $LIMIT;
SQL
    ;;
  *)
    echo "Usage: decisions.sh {list|show <slug>|search \"<terms>\"} [--project p] [--slug s] [--status st]" >&2
    exit 1
    ;;
esac
