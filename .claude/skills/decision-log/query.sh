#!/usr/bin/env bash
# Query the decision log using FTS5 (BM25 ranked)
# Returns matching messages with surrounding context

DB_PATH="${DB_PATH:-${HOME}/.claude/decision-log/decisions.db}"

if [ ! -f "$DB_PATH" ]; then
    echo "[decision-log] No database found. Run init.sh first." >&2
    exit 1
fi

QUERY="${1:-}"
LIMIT="${2:-10}"
PROJECT_FILTER="${3:-}"
CONTEXT_WINDOW="${4:-1}"

if [ -z "$QUERY" ]; then
    echo "Usage: query.sh <search-terms> [limit] [project] [context-window]" >&2
    echo "  query.sh 'database mock testing'       # Search all projects" >&2
    echo "  query.sh 'auth middleware' 5            # Top 5 results" >&2
    echo "  query.sh 'deploy' 10 daily-seo          # Filter by project" >&2
    exit 1
fi

# Sanitize query: strip punctuation that FTS5 chokes on, keep words
SAFE_QUERY=$(echo "$QUERY" | sed 's/[^a-zA-Z0-9 ]/ /g' | tr -s ' ')

PROJECT_CLAUSE=""
if [ -n "$PROJECT_FILTER" ]; then
    PROJECT_CLAUSE="AND m.project = '$(echo "$PROJECT_FILTER" | sed "s/'/''/g")'"
fi

sqlite3 -separator '|' "$DB_PATH" <<SQL
WITH ranked AS (
    SELECT
        m.id,
        m.session_id,
        m.project,
        m.role,
        m.content,
        m.timestamp,
        (rank * (1.0 + 0.5 * (julianday('now') - julianday(m.timestamp)) / 30.0)) AS score
    FROM messages_fts fts
    JOIN messages m ON m.id = fts.rowid
    WHERE messages_fts MATCH '${SAFE_QUERY}'
    ${PROJECT_CLAUSE}
    ORDER BY score
    LIMIT ${LIMIT}
)
SELECT
    r.id,
    r.role,
    substr(r.content, 1, 300),
    r.project,
    r.timestamp
FROM ranked r
ORDER BY r.score;
SQL
