#!/bin/bash
# Query: Show coordination event timeline

set -euo pipefail

DB_PATH=${1:-}
TASK_ID=${2:-}

if [[ -z "$DB_PATH" || -z "$TASK_ID" ]]; then
    echo "Usage: $0 <db_path> <task_id>"
    exit 1
fi

echo "=== Coordination Event Timeline ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    timestamp,
    event_type,
    agent_id,
    key,
    substr(value, 1, 40) || CASE WHEN length(value) > 40 THEN '...' ELSE '' END as value
FROM coordination_events
WHERE task_id = '$TASK_ID'
ORDER BY timestamp;
SQL

echo ""
echo "=== Event Type Distribution ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    event_type,
    COUNT(*) as count,
    MIN(timestamp) as first_occurrence,
    MAX(timestamp) as last_occurrence
FROM coordination_events
WHERE task_id = '$TASK_ID'
GROUP BY event_type
ORDER BY count DESC;
SQL
