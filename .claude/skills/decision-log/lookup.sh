#!/usr/bin/env bash
# Look up a specific message by ID and return full content + surrounding context
# Usage: lookup.sh <message-id> [context-window]

DB_PATH="${DB_PATH:-${HOME}/.claude/decision-log/decisions.db}"

if [ ! -f "$DB_PATH" ]; then
    echo "[decision-log] No database found." >&2
    exit 1
fi

MESSAGE_ID="${1:-}"
CONTEXT_WINDOW="${2:-3}"

if [ -z "$MESSAGE_ID" ]; then
    echo "Usage: lookup.sh <message-id> [context-window]" >&2
    echo "  message-id: numeric ID from query.sh or briefing.sh results" >&2
    echo "  context-window: number of adjacent messages to include (default: 3)" >&2
    exit 1
fi

RESULTS=$(sqlite3 -json "$DB_PATH" "
WITH target AS (
    SELECT id, session_id, project, timestamp
    FROM messages
    WHERE id = ${MESSAGE_ID}
),
context_range AS (
    SELECT m.id, m.role, m.content, m.project, m.timestamp, m.session_id
    FROM messages m
    JOIN target t ON m.session_id = t.session_id
    WHERE ABS(m.id - t.id) <= ${CONTEXT_WINDOW}
    ORDER BY m.id
)
SELECT id, role, content, project, timestamp, session_id FROM context_range;
" 2>/dev/null)

if [ -z "$RESULTS" ] || [ "$RESULTS" = "[]" ]; then
    echo "[decision-log] No message found with id ${MESSAGE_ID}" >&2
    exit 1
fi

echo "$RESULTS" | jq -r '.[] | "[\(.timestamp)] (\(.project)) [id:\(.id)] \(.role)\n\(.content)\n"' 2>/dev/null
