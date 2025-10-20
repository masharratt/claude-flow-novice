#!/bin/bash
# Query pending reflections from context_reflections table
# Usage: ./query-reflections.sh --status pending --limit 10

set -e

DB_PATH="${ACE_DB_PATH:-./.artifacts/database/swarm-memory.db}"
STATUS="pending"
LIMIT=10

while [[ $# -gt 0 ]]; do
  case $1 in
    --status) STATUS="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

sqlite3 "$DB_PATH" <<EOF
SELECT json_group_array(
  json_object(
    'id', id,
    'reflection_type', reflection_type,
    'task_id', task_id,
    'extracted_lessons', extracted_lessons,
    'created_at', created_at
  )
)
FROM (
  SELECT * FROM context_reflections
  WHERE curator_status = '${STATUS}'
  ORDER BY created_at DESC
  LIMIT ${LIMIT}
);
EOF
