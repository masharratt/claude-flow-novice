#!/bin/bash
# Query: Show all gate check results

set -euo pipefail

DB_PATH=${1:-}
TASK_ID=${2:-}

if [[ -z "$DB_PATH" || -z "$TASK_ID" ]]; then
    echo "Usage: $0 <db_path> <task_id>"
    exit 1
fi

echo "=== Gate Check Results ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    iteration,
    printf('%.2f%%', pass_rate * 100) as pass_rate,
    printf('%.2f%%', threshold * 100) as threshold,
    CASE WHEN passed = 1 THEN 'PASS' ELSE 'FAIL' END as result,
    agent_count as agents,
    timestamp
FROM gate_checks
WHERE task_id = '$TASK_ID'
ORDER BY iteration;
SQL

echo ""
echo "=== Gate Check Summary ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    COUNT(*) as total_checks,
    SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed_count,
    SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) as failed_count,
    printf('%.2f%%', AVG(pass_rate) * 100) as avg_pass_rate,
    printf('%.2f%%', MAX(pass_rate) * 100) as max_pass_rate
FROM gate_checks
WHERE task_id = '$TASK_ID';
SQL
