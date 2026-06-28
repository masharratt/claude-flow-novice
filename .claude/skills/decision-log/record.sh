#!/usr/bin/env bash
# Write a structured decision record (decision-log option 2).
# Upserts on (project, slug, decision_id). Called from the cfn-decide phase,
# one invocation per BLOCKING decision (and optionally non-blocking ones).
#
# Usage:
#   record.sh --slug <plan-slug> --id <D1> --title "<t>" --chosen "<option>" \
#     [--rationale "<why>"] [--alternatives "<rejected>"] \
#     [--status proposed|accepted|superseded] [--blocking] \
#     [--supersede <Dn>] [--project <p>] [--session <sid>] [--timestamp <iso>]
#
# project defaults to git toplevel basename; timestamp defaults to now (UTC).
set -uo pipefail

DB_PATH="${DB_PATH:-${HOME}/.claude/decision-log/decisions.db}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SLUG="" DEC_ID="" TITLE="" CHOSEN="" RATIONALE="" ALTS=""
STATUS="accepted" BLOCKING=0 SUPERSEDE="" PROJECT="" SESSION="" TS=""

while [ $# -gt 0 ]; do
    case "$1" in
        --slug)         SLUG="${2:-}"; shift 2;;
        --id)           DEC_ID="${2:-}"; shift 2;;
        --title)        TITLE="${2:-}"; shift 2;;
        --chosen)       CHOSEN="${2:-}"; shift 2;;
        --rationale)    RATIONALE="${2:-}"; shift 2;;
        --alternatives) ALTS="${2:-}"; shift 2;;
        --status)       STATUS="${2:-}"; shift 2;;
        --blocking)     BLOCKING=1; shift;;
        --supersede)    SUPERSEDE="${2:-}"; shift 2;;
        --project)      PROJECT="${2:-}"; shift 2;;
        --session)      SESSION="${2:-}"; shift 2;;
        --timestamp)    TS="${2:-}"; shift 2;;
        *) echo "[decision-log] unknown arg: $1" >&2; exit 2;;
    esac
done

if [ -z "$SLUG" ] || [ -z "$DEC_ID" ] || [ -z "$TITLE" ] || [ -z "$CHOSEN" ]; then
    echo "Usage: record.sh --slug <s> --id <D1> --title <t> --chosen <o> [opts]" >&2
    echo "  required: --slug --id --title --chosen" >&2
    exit 1
fi

# ensure schema present (idempotent: all CREATE ... IF NOT EXISTS).
# migrates an existing decisions.db that predates the `decisions` table.
sqlite3 "$DB_PATH" < "$SCRIPT_DIR/schema.sql"

# defaults
if [ -z "$PROJECT" ]; then
    PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null \
        || basename "${CLAUDE_PROJECT_DIR:-$(pwd)}")
fi
[ -n "$TS" ] || TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# sqlite single-quote escape
q(){ printf "%s" "$1" | sed "s/'/''/g"; }

sqlite3 "$DB_PATH" <<SQL
INSERT INTO decisions
  (project, slug, decision_id, title, chosen, rationale, alternatives,
   status, blocking, session_id, superseded_by, timestamp)
VALUES
  ('$(q "$PROJECT")','$(q "$SLUG")','$(q "$DEC_ID")','$(q "$TITLE")',
   '$(q "$CHOSEN")','$(q "$RATIONALE")','$(q "$ALTS")','$(q "$STATUS")',
   $BLOCKING,'$(q "$SESSION")','','$(q "$TS")')
ON CONFLICT(project, slug, decision_id) DO UPDATE SET
   title=excluded.title, chosen=excluded.chosen, rationale=excluded.rationale,
   alternatives=excluded.alternatives, status=excluded.status,
   blocking=excluded.blocking, session_id=excluded.session_id,
   timestamp=excluded.timestamp;
SQL

# mark a prior decision superseded by this one
if [ -n "$SUPERSEDE" ]; then
    sqlite3 "$DB_PATH" <<SQL
UPDATE decisions
   SET status='superseded', superseded_by='$(q "$DEC_ID")'
 WHERE project='$(q "$PROJECT")' AND slug='$(q "$SLUG")'
   AND decision_id='$(q "$SUPERSEDE")';
SQL
fi

echo "[decision-log] recorded $PROJECT/$SLUG/$DEC_ID ($STATUS)"
