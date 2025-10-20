#!/bin/bash
# Update reflection status
# Usage: ./update-reflection.sh --reflection-id refl-123 --status merged --merged-bullet-ids '["STRAT-007"]'

set -e

DB_PATH="${ACE_DB_PATH:-./.artifacts/database/swarm-memory.db}"
REFLECTION_ID=""
STATUS=""
MERGED_BULLET_IDS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --reflection-id) REFLECTION_ID="$2"; shift 2 ;;
    --status) STATUS="$2"; shift 2 ;;
    --merged-bullet-ids) MERGED_BULLET_IDS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ -z "$REFLECTION_ID" ] || [ -z "$STATUS" ]; then
  echo "Error: --reflection-id and --status required"
  exit 1
fi

sqlite3 "$DB_PATH" <<EOF
UPDATE context_reflections
SET curator_status = '${STATUS}',
    merged_bullet_ids = $([ -n "$MERGED_BULLET_IDS" ] && echo "'$MERGED_BULLET_IDS'" || echo "NULL"),
    processed_at = CURRENT_TIMESTAMP
WHERE id = '${REFLECTION_ID}';
EOF

COUNT=$(sqlite3 "$DB_PATH" "SELECT changes();")

if [ "$COUNT" -gt 0 ]; then
  echo "{\"status\":\"success\",\"reflection_id\":\"${REFLECTION_ID}\",\"new_status\":\"${STATUS}\"}"
else
  echo "{\"status\":\"error\",\"message\":\"Reflection not found: ${REFLECTION_ID}\"}"
  exit 1
fi
