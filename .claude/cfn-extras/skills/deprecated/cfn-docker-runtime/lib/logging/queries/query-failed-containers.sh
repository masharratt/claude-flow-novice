#!/usr/bin/env bash
# Query: Find all failed containers (exit_code != 0)

set -euo pipefail

DB_PATH=${1:-logs/docker-mode/*/logs.db}
TASK_ID=${2:-}

if [[ -z "$TASK_ID" ]]; then
    # Show all failed containers across all tasks
    sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    task_id,
    agent_id,
    container_id,
    exit_code,
    started_at,
    finished_at,
    duration_seconds,
    CASE WHEN oom_killed = 1 THEN 'YES' ELSE 'NO' END as oom_killed
FROM container_events
WHERE event_type = 'exit' AND exit_code != 0
ORDER BY finished_at DESC;
SQL
else
    # Show failed containers for specific task
    sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    agent_id,
    container_id,
    exit_code,
    started_at,
    finished_at,
    duration_seconds,
    CASE WHEN oom_killed = 1 THEN 'YES' ELSE 'NO' END as oom_killed
FROM container_events
WHERE task_id = '$TASK_ID' AND event_type = 'exit' AND exit_code != 0
ORDER BY finished_at DESC;
SQL
fi
