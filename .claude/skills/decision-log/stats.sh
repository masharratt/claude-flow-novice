#!/bin/bash
# Show decision log statistics
set -euo pipefail

DB_PATH="${HOME}/.claude/decision-log/decisions.db"

if [ ! -f "$DB_PATH" ]; then
    echo "[decision-log] No database found." >&2
    exit 1
fi

echo "=== Decision Log Stats ==="
echo ""

sqlite3 "$DB_PATH" <<'SQL'
.mode column
.headers on

-- Overall counts
SELECT
    COUNT(*) as total_messages,
    COUNT(DISTINCT session_id) as sessions,
    COUNT(DISTINCT project) as projects,
    SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_msgs,
    SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as assistant_msgs
FROM messages;

SELECT '';

-- Per-project breakdown
SELECT
    project,
    COUNT(*) as messages,
    COUNT(DISTINCT session_id) as sessions,
    MIN(timestamp) as earliest,
    MAX(timestamp) as latest
FROM messages
GROUP BY project
ORDER BY messages DESC;

SELECT '';

-- Database size
SELECT
    (page_count * page_size) / 1024 as size_kb
FROM pragma_page_count(), pragma_page_size();
SQL
