#!/bin/bash
# Log merge action to context_merge_log
# Usage: ./log-merge.sh --merge-type new_bullet --bullet-id STRAT-007 --reflection-id refl-123

set -e

DB_PATH="${ACE_DB_PATH:-./.artifacts/database/swarm-memory.db}"
MERGE_TYPE=""
BULLET_ID=""
REFLECTION_ID=""
SIMILARITY_SCORE=""
CURATOR_REASONING=""
MERGED_FROM_IDS="[]"

while [[ $# -gt 0 ]]; do
  case $1 in
    --merge-type) MERGE_TYPE="$2"; shift 2 ;;
    --bullet-id) BULLET_ID="$2"; shift 2 ;;
    --reflection-id) REFLECTION_ID="$2"; shift 2 ;;
    --similarity-score) SIMILARITY_SCORE="$2"; shift 2 ;;
    --curator-reasoning) CURATOR_REASONING="$2"; shift 2 ;;
    --merged-from-ids) MERGED_FROM_IDS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ -z "$MERGE_TYPE" ] || [ -z "$BULLET_ID" ]; then
  echo "Error: --merge-type and --bullet-id required"
  exit 1
fi

LOG_ID="merge-$(date +%s)-$(openssl rand -hex 3)"

sqlite3 "$DB_PATH" <<EOF
CREATE TABLE IF NOT EXISTS context_merge_log (
    id TEXT PRIMARY KEY,
    merge_type TEXT NOT NULL CHECK (merge_type IN ('new_bullet', 'increment_helpful', 'increment_harmful', 'merge_similar', 'archive', 'edit', 'version_bump')),
    bullet_id TEXT NOT NULL,
    reflection_id TEXT,
    old_content TEXT,
    new_content TEXT,
    similarity_score REAL,
    merged_from_bullet_ids TEXT,
    curator_agent_id TEXT,
    curator_reasoning TEXT,
    acl_level INTEGER NOT NULL DEFAULT 5 CHECK (acl_level BETWEEN 1 AND 6),
    swarm_id TEXT,
    project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO context_merge_log (
  id, merge_type, bullet_id, reflection_id, similarity_score,
  merged_from_bullet_ids, curator_reasoning, acl_level
) VALUES (
  '${LOG_ID}',
  '${MERGE_TYPE}',
  '${BULLET_ID}',
  $([ -n "$REFLECTION_ID" ] && echo "'$REFLECTION_ID'" || echo "NULL"),
  $([ -n "$SIMILARITY_SCORE" ] && echo "${SIMILARITY_SCORE}" || echo "NULL"),
  '${MERGED_FROM_IDS}',
  '${CURATOR_REASONING}',
  5
);
EOF

echo "{\"status\":\"success\",\"log_id\":\"${LOG_ID}\",\"merge_type\":\"${MERGE_TYPE}\"}"
