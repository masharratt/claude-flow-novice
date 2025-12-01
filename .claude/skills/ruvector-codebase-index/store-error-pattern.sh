#!/bin/bash
set -euo pipefail

# Store error pattern in RuVector for future avoidance
# Usage: store-error-pattern.sh --task-id ID --error-type TYPE --pattern TEXT --context CTX --solution SOL

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_ID=""
ERROR_TYPE=""
PATTERN=""
CONTEXT=""
SOLUTION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --error-type) ERROR_TYPE="$2"; shift 2 ;;
    --pattern) PATTERN="$2"; shift 2 ;;
    --context) CONTEXT="$2"; shift 2 ;;
    --solution) SOLUTION="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate required params
if [[ -z "$TASK_ID" || -z "$ERROR_TYPE" || -z "$PATTERN" ]]; then
  echo "Error: Missing required parameters"
  echo "Usage: store-error-pattern.sh --task-id ID --error-type TYPE --pattern TEXT [--context CTX] [--solution SOL]"
  exit 1
fi

# Build document for RuVector storage
DOC=$(cat <<EOF
{
  "type": "error_pattern",
  "task_id": "${TASK_ID}",
  "error_type": "${ERROR_TYPE}",
  "pattern": "${PATTERN}",
  "context": "${CONTEXT:-N/A}",
  "solution": "${SOLUTION:-None provided}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "searchable_text": "${ERROR_TYPE}: ${PATTERN}. Context: ${CONTEXT:-N/A}. Solution: ${SOLUTION:-None}"
}
EOF
)

# Store in RuVector via Node.js indexer
node "$SCRIPT_DIR/embeddings.js" store-error-pattern "$DOC"

echo "✅ Error pattern stored in RuVector"
echo "   Type: $ERROR_TYPE"
echo "   Pattern: $PATTERN"
echo "   Query with: query-error-patterns.sh --task-description '...'"
