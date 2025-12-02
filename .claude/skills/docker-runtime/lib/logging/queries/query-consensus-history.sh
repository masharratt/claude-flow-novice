#!/bin/bash
# Query: Show validator consensus over iterations

set -euo pipefail

DB_PATH=${1:-}
TASK_ID=${2:-}

if [[ -z "$DB_PATH" || -z "$TASK_ID" ]]; then
    echo "Usage: $0 <db_path> <task_id>"
    exit 1
fi

echo "=== Validator Consensus History ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    iteration,
    validator_id,
    printf('%.2f', score) as score,
    substr(feedback, 1, 60) || CASE WHEN length(feedback) > 60 THEN '...' ELSE '' END as feedback,
    timestamp
FROM validator_consensus
WHERE task_id = '$TASK_ID'
ORDER BY iteration, validator_id;
SQL

echo ""
echo "=== Consensus Trends by Iteration ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    iteration,
    COUNT(*) as validator_count,
    printf('%.2f', AVG(score)) as avg_score,
    printf('%.2f', MIN(score)) as min_score,
    printf('%.2f', MAX(score)) as max_score,
    printf('%.2f', (MAX(score) - MIN(score))) as score_range
FROM validator_consensus
WHERE task_id = '$TASK_ID'
GROUP BY iteration
ORDER BY iteration;
SQL

echo ""
echo "=== Validator Performance ==="
sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    validator_id,
    COUNT(*) as reviews,
    printf('%.2f', AVG(score)) as avg_score,
    printf('%.2f', MIN(score)) as min_score,
    printf('%.2f', MAX(score)) as max_score
FROM validator_consensus
WHERE task_id = '$TASK_ID'
GROUP BY validator_id
ORDER BY avg_score DESC;
SQL
