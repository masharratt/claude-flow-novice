#!/usr/bin/env bash
# Query: Generate analytics report for task

set -euo pipefail

DB_PATH=${1:-}
TASK_ID=${2:-}

if [[ -z "$DB_PATH" || -z "$TASK_ID" ]]; then
    echo "Usage: $0 <db_path> <task_id>"
    exit 1
fi

echo "=== Task Execution Summary ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    COUNT(DISTINCT agent_id) as total_agents,
    COUNT(DISTINCT container_id) as total_containers,
    SUM(CASE WHEN event_type = 'exit' AND exit_code = 0 THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN event_type = 'exit' AND exit_code != 0 THEN 1 ELSE 0 END) as failed,
    printf('%.2f%%', AVG(CASE WHEN event_type = 'exit' AND exit_code = 0 THEN 100.0 ELSE 0.0 END)) as success_rate,
    SUM(oom_killed) as oom_kills
FROM container_events
WHERE task_id = '$TASK_ID';
SQL

echo ""
echo "=== Execution Duration ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    printf('%.2f', AVG(duration_seconds)) as avg_duration_sec,
    printf('%.2f', MIN(duration_seconds)) as min_duration_sec,
    printf('%.2f', MAX(duration_seconds)) as max_duration_sec,
    printf('%.2f', SUM(duration_seconds)) as total_duration_sec
FROM container_events
WHERE task_id = '$TASK_ID' AND event_type = 'exit' AND duration_seconds IS NOT NULL;
SQL

echo ""
echo "=== Log Volume ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    stream,
    COUNT(*) as total_lines,
    printf('%.2f', AVG(length(log_line))) as avg_line_length,
    SUM(length(log_line)) as total_bytes
FROM container_logs
WHERE task_id = '$TASK_ID'
GROUP BY stream;
SQL

echo ""
echo "=== Coordination Activity ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    event_type,
    COUNT(*) as event_count
FROM coordination_events
WHERE task_id = '$TASK_ID'
GROUP BY event_type
ORDER BY event_count DESC;
SQL

echo ""
echo "=== Performance Metrics ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    metric_name,
    printf('%.2f', metric_value) as value,
    unit,
    timestamp
FROM performance_metrics
WHERE task_id = '$TASK_ID'
ORDER BY timestamp DESC
LIMIT 10;
SQL

echo ""
echo "=== Timeline Overview ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    MIN(started_at) as first_spawn,
    MAX(finished_at) as last_exit,
    printf('%.2f', (julianday(MAX(finished_at)) - julianday(MIN(started_at))) * 86400) as total_runtime_sec
FROM container_events
WHERE task_id = '$TASK_ID' AND event_type IN ('spawn', 'exit');
SQL
