#!/bin/bash
set -euo pipefail

# Update Playbook after Successful CFN Loop

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="$SCRIPT_DIR/playbook.db"

# Import parameterized query library
source "${SCRIPT_DIR}/../bootstrap/sqlite-params.sh"

TASK_ID=""
TASK_TYPE=""
DESCRIPTION=""
LOOP3_AGENTS=""
LOOP2_AGENTS=""
ITERATIONS=""
FINAL_CONFIDENCE=""
FINAL_CONSENSUS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --task-type) TASK_TYPE="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --loop3-agents) LOOP3_AGENTS="$2"; shift 2 ;;
    --loop2-agents) LOOP2_AGENTS="$2"; shift 2 ;;
    --iterations) ITERATIONS="$2"; shift 2 ;;
    --final-confidence) FINAL_CONFIDENCE="$2"; shift 2 ;;
    --final-consensus) FINAL_CONSENSUS="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

# Initialize DB if not exists
if [ ! -f "$DB_PATH" ]; then
  bash "$SCRIPT_DIR/init-playbook.sh"
fi

# Convert agent lists to JSON arrays
LOOP3_JSON=$(echo "$LOOP3_AGENTS" | jq -Rc 'split(",") | map(gsub("^\\s+|\\s+$"; ""))')
LOOP2_JSON=$(echo "$LOOP2_AGENTS" | jq -Rc 'split(",") | map(gsub("^\\s+|\\s+$"; ""))')

# Extract keywords
KEYWORDS=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]' | grep -oE '\w+' | sort -u | tr '\n' ',' | sed 's/,$//')

# Insert into playbook using parameterized query
sqlite_exec "$DB_PATH" "
INSERT INTO playbook_entries (
  task_pattern,
  task_type,
  task_keywords,
  loop3_agents,
  loop2_agents,
  iterations_required,
  final_confidence,
  final_consensus,
  actual_iterations
) VALUES (
  ?1,
  ?2,
  ?3,
  ?4,
  ?5,
  ?6,
  ?7,
  ?8,
  ?9
);" \
  "$DESCRIPTION" \
  "$TASK_TYPE" \
  "$KEYWORDS" \
  "$LOOP3_JSON" \
  "$LOOP2_JSON" \
  "$ITERATIONS" \
  "$FINAL_CONFIDENCE" \
  "$FINAL_CONSENSUS" \
  "$ITERATIONS"

echo "✅ Playbook updated with task execution pattern"
