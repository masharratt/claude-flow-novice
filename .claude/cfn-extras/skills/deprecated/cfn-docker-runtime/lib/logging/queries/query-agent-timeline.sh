#!/usr/bin/env bash
# Query: Show timeline for specific agent

set -euo pipefail

DB_PATH=${1:-}
AGENT_ID=${2:-}

if [[ -z "$DB_PATH" || -z "$AGENT_ID" ]]; then
    echo "Usage: $0 <db_path> <agent_id>"
    exit 1
fi

echo "=== Container Lifecycle Events ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    event_type,
    container_id,
    exit_code,
    started_at,
    finished_at,
    duration_seconds
FROM container_events
WHERE agent_id = '$AGENT_ID'
ORDER BY created_at;
SQL

echo ""
echo "=== Log Output ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    timestamp,
    stream,
    substr(log_line, 1, 120) || CASE WHEN length(log_line) > 120 THEN '...' ELSE '' END as log_line
FROM container_logs
WHERE agent_id = '$AGENT_ID'
ORDER BY timestamp;
SQL

echo ""
echo "=== Log Statistics ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    stream,
    COUNT(*) as line_count,
    AVG(length(log_line)) as avg_line_length,
    MAX(length(log_line)) as max_line_length
FROM container_logs
WHERE agent_id = '$AGENT_ID'
GROUP BY stream;
SQL
