#!/bin/bash
# Add new bullet to adaptive_context table
# Usage: ./add-bullet.sh --bullet-id STRAT-007 --category strategy --content "..." --confidence 0.85

set -e

# Default values
DB_PATH="${ACE_DB_PATH:-./.artifacts/database/swarm-memory.db}"
BULLET_ID=""
CATEGORY=""
CONTENT=""
CONFIDENCE=0.5
PRIORITY=5
TAGS="[]"
SOURCE_CONTEXT=""
SOURCE_TASK_ID=""
ACL_LEVEL=4

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --bullet-id)
      BULLET_ID="$2"
      shift 2
      ;;
    --category)
      CATEGORY="$2"
      shift 2
      ;;
    --content)
      CONTENT="$2"
      shift 2
      ;;
    --confidence)
      CONFIDENCE="$2"
      shift 2
      ;;
    --priority)
      PRIORITY="$2"
      shift 2
      ;;
    --tags)
      TAGS="$2"
      shift 2
      ;;
    --source-context)
      SOURCE_CONTEXT="$2"
      shift 2
      ;;
    --source-task-id)
      SOURCE_TASK_ID="$2"
      shift 2
      ;;
    --acl-level)
      ACL_LEVEL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [ -z "$BULLET_ID" ] || [ -z "$CATEGORY" ] || [ -z "$CONTENT" ]; then
  echo "Error: Missing required parameters"
  echo "Usage: $0 --bullet-id <id> --category <cat> --content <text>"
  exit 1
fi

# Validate category
case $CATEGORY in
  strategy|pattern|edge_case|domain_insight|anti_pattern|optimization)
    ;;
  *)
    echo "Error: Invalid category. Must be: strategy, pattern, edge_case, domain_insight, anti_pattern, or optimization"
    exit 1
    ;;
esac

# Generate unique ID
UNIQUE_ID="$(echo -n "$BULLET_ID" | md5sum | cut -d' ' -f1)"

# Insert bullet into database
sqlite3 "$DB_PATH" <<EOF
-- Ensure table exists
CREATE TABLE IF NOT EXISTS adaptive_context (
    id TEXT PRIMARY KEY,
    bullet_id TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('strategy', 'pattern', 'edge_case', 'domain_insight', 'anti_pattern', 'optimization')),
    content TEXT NOT NULL,
    helpful_count INTEGER DEFAULT 0,
    harmful_count INTEGER DEFAULT 0,
    confidence_score REAL DEFAULT 0.5 CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    source_context TEXT NOT NULL,
    source_task_id TEXT,
    source_agent_id TEXT,
    tags TEXT,
    embedding_vector TEXT,
    parent_bullet_id TEXT,
    version INTEGER DEFAULT 1,
    acl_level INTEGER NOT NULL DEFAULT 4 CHECK (acl_level BETWEEN 1 AND 6),
    swarm_id TEXT,
    project_id TEXT,
    is_active BOOLEAN DEFAULT 1,
    is_validated BOOLEAN DEFAULT 0,
    validation_metadata TEXT,
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    last_used_at DATETIME,
    usage_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived_at DATETIME
);

-- Insert bullet
INSERT INTO adaptive_context (
  id, bullet_id, category, content, confidence_score, priority, tags,
  source_context, source_task_id, acl_level, is_active
) VALUES (
  '${UNIQUE_ID}',
  '${BULLET_ID}',
  '${CATEGORY}',
  '${CONTENT}',
  ${CONFIDENCE},
  ${PRIORITY},
  '${TAGS}',
  '${SOURCE_CONTEXT:-Unknown source}',
  $([ -n "$SOURCE_TASK_ID" ] && echo "'$SOURCE_TASK_ID'" || echo "NULL"),
  ${ACL_LEVEL},
  1
);
EOF

# Verify insertion
COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM adaptive_context WHERE bullet_id = '${BULLET_ID}';")

if [ "$COUNT" -eq 1 ]; then
  echo "{\"status\":\"success\",\"bullet_id\":\"${BULLET_ID}\",\"category\":\"${CATEGORY}\",\"confidence\":${CONFIDENCE}}"
  exit 0
else
  echo "{\"status\":\"error\",\"message\":\"Bullet insertion failed\"}"
  exit 1
fi
