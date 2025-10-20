#!/bin/bash
# Store reflection in context_reflections table
# Usage: ./store-reflection.sh --reflection-type success --task-id sprint-123 --lessons-file lessons.json

set -e

# Default values
DB_PATH="${ACE_DB_PATH:-./.artifacts/database/swarm-memory.db}"
REFLECTION_TYPE=""
TASK_ID=""
AGENT_ID=""
EXECUTION_TRACE=""
FEEDBACK_SIGNALS=""
LESSONS_FILE=""
ACL_LEVEL=3
SWARM_ID="default-swarm"
PROJECT_ID="default-project"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --reflection-type)
      REFLECTION_TYPE="$2"
      shift 2
      ;;
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --agent-id)
      AGENT_ID="$2"
      shift 2
      ;;
    --execution-trace-file)
      if [ -f "$2" ]; then
        EXECUTION_TRACE=$(cat "$2")
      fi
      shift 2
      ;;
    --feedback-signals-file)
      if [ -f "$2" ]; then
        FEEDBACK_SIGNALS=$(cat "$2")
      fi
      shift 2
      ;;
    --lessons-file)
      LESSONS_FILE="$2"
      shift 2
      ;;
    --acl-level)
      ACL_LEVEL="$2"
      shift 2
      ;;
    --swarm-id)
      SWARM_ID="$2"
      shift 2
      ;;
    --project-id)
      PROJECT_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [ -z "$REFLECTION_TYPE" ] || [ -z "$TASK_ID" ] || [ -z "$LESSONS_FILE" ]; then
  echo "Error: Missing required parameters"
  echo "Usage: $0 --reflection-type <type> --task-id <id> --lessons-file <path>"
  exit 1
fi

# Validate reflection type
case $REFLECTION_TYPE in
  success|failure|optimization|edge_case|pattern)
    ;;
  *)
    echo "Error: Invalid reflection_type. Must be: success, failure, optimization, edge_case, or pattern"
    exit 1
    ;;
esac

# Read lessons file
if [ ! -f "$LESSONS_FILE" ]; then
  echo "Error: Lessons file not found: $LESSONS_FILE"
  exit 1
fi

EXTRACTED_LESSONS=$(cat "$LESSONS_FILE")

# Generate unique reflection ID
REFLECTION_ID="refl-$(date +%s)-$(openssl rand -hex 3)"

# Create database if not exists
mkdir -p "$(dirname "$DB_PATH")"

# Insert reflection into database
sqlite3 "$DB_PATH" <<EOF
-- Ensure table exists (idempotent)
CREATE TABLE IF NOT EXISTS context_reflections (
    id TEXT PRIMARY KEY,
    reflection_type TEXT NOT NULL CHECK (reflection_type IN ('success', 'failure', 'optimization', 'edge_case', 'pattern')),
    task_id TEXT NOT NULL,
    agent_id TEXT,
    execution_trace TEXT NOT NULL,
    feedback_signals TEXT NOT NULL,
    extracted_lessons TEXT NOT NULL,
    curator_status TEXT DEFAULT 'pending' CHECK (curator_status IN ('pending', 'processing', 'merged', 'rejected', 'human_review')),
    merged_bullet_ids TEXT,
    rejection_reason TEXT,
    acl_level INTEGER NOT NULL DEFAULT 3 CHECK (acl_level BETWEEN 1 AND 6),
    swarm_id TEXT NOT NULL,
    project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME
);

-- Insert reflection
INSERT INTO context_reflections (
  id, reflection_type, task_id, agent_id, execution_trace, feedback_signals,
  extracted_lessons, curator_status, acl_level, swarm_id, project_id
) VALUES (
  '${REFLECTION_ID}',
  '${REFLECTION_TYPE}',
  '${TASK_ID}',
  $([ -n "$AGENT_ID" ] && echo "'$AGENT_ID'" || echo "NULL"),
  '${EXECUTION_TRACE:-{}}',
  '${FEEDBACK_SIGNALS:-{}}',
  '${EXTRACTED_LESSONS}',
  'pending',
  ${ACL_LEVEL},
  '${SWARM_ID}',
  $([ -n "$PROJECT_ID" ] && echo "'$PROJECT_ID'" || echo "NULL")
);
EOF

# Verify insertion
COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM context_reflections WHERE id = '${REFLECTION_ID}';")

if [ "$COUNT" -eq 1 ]; then
  echo "{\"status\":\"success\",\"reflection_id\":\"${REFLECTION_ID}\",\"database\":\"${DB_PATH}\",\"lessons_count\":$(echo "$EXTRACTED_LESSONS" | jq 'length')}"
  exit 0
else
  echo "{\"status\":\"error\",\"message\":\"Reflection insertion failed\"}"
  exit 1
fi
