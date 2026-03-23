#!/bin/bash
set -euo pipefail

# Query Playbook for Similar Tasks

# Import SQLite parameterized query library for SQL injection prevention
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
# Use shared bootstrap utilities
if [[ -f "$PROJECT_ROOT/.claude/skills/shared/bootstrap/sqlite-params.sh" ]]; then
    source "$PROJECT_ROOT/.claude/skills/shared/bootstrap/sqlite-params.sh"
else
    echo "Error: SQLite parameter utilities not found" >&2
    exit 1
fi

DB_PATH="$SCRIPT_DIR/../../../../data/playbook.db"

TASK_TYPE=""
DESCRIPTION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-type) TASK_TYPE="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

if [ -z "$TASK_TYPE" ] || [ -z "$DESCRIPTION" ]; then
  echo "Usage: query-playbook.sh --task-type TYPE --description 'text'" >&2
  exit 1
fi

# Initialize DB if not exists
if [ ! -f "$DB_PATH" ]; then
  bash "$SCRIPT_DIR/init-playbook.sh"
fi

# Extract keywords from description (simple tokenization)
KEYWORDS=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]' | grep -oE '\w+' | sort -u | tr '\n' ',' | sed 's/,$//')

# Query for similar tasks (same task type) using parameterized query
SIMILAR=$(execute_select "$DB_PATH" \
    "SELECT
      task_pattern,
      loop3_agents,
      loop2_agents,
      iterations_required,
      final_confidence,
      common_feedback,
      use_count
    FROM playbook_entries
    WHERE task_type = ?
    ORDER BY final_confidence DESC, use_count DESC
    LIMIT 3;" \
    "$TASK_TYPE"
)

# If no results, return empty
if [ -z "$SIMILAR" ]; then
  echo "{}"
  exit 0
fi

# Return first (best) match
FIRST_MATCH=$(echo "$SIMILAR" | head -1)

TASK_PATTERN=$(echo "$FIRST_MATCH" | cut -d'|' -f1)
LOOP3_AGENTS=$(echo "$FIRST_MATCH" | cut -d'|' -f2)
LOOP2_AGENTS=$(echo "$FIRST_MATCH" | cut -d'|' -f3)
ITERATIONS=$(echo "$FIRST_MATCH" | cut -d'|' -f4)
CONFIDENCE=$(echo "$FIRST_MATCH" | cut -d'|' -f5)
FEEDBACK=$(echo "$FIRST_MATCH" | cut -d'|' -f6)
USE_COUNT=$(echo "$FIRST_MATCH" | cut -d'|' -f7)

# Build JSON output
cat <<EOF
{
  "found": true,
  "task_pattern": "$TASK_PATTERN",
  "loop3_agents": $LOOP3_AGENTS,
  "loop2_agents": $LOOP2_AGENTS,
  "expected_iterations": $ITERATIONS,
  "historical_confidence": $CONFIDENCE,
  "common_feedback": $FEEDBACK,
  "use_count": $USE_COUNT
}
EOF