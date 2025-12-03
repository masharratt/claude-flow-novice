#!/bin/bash
set -euo pipefail

# Store learning/pattern in RuVector for future reference
# Usage: store-learning.sh --task-id ID --category CAT --title TITLE --description DESC --confidence NUM --tags TAGS

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_ID=""
CATEGORY="PATTERN"
TITLE=""
DESCRIPTION=""
CONFIDENCE="0.80"
TAGS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --category) CATEGORY="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --confidence) CONFIDENCE="$2"; shift 2 ;;
    --tags) TAGS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate required params
if [[ -z "$TASK_ID" || -z "$TITLE" || -z "$DESCRIPTION" ]]; then
  echo "Error: Missing required parameters"
  echo "Usage: store-learning.sh --task-id ID --title TITLE --description DESC [--category CAT] [--confidence NUM] [--tags TAGS]"
  exit 1
fi

# Validate category
case "$CATEGORY" in
  PATTERN|STRAT|ANTI|EDGE) ;;
  *) echo "Error: Category must be one of: PATTERN, STRAT, ANTI, EDGE"; exit 1 ;;
esac

# Build document for RuVector storage
DOC=$(cat <<EOF
{
  "type": "learning",
  "task_id": "${TASK_ID}",
  "category": "${CATEGORY}",
  "title": "${TITLE}",
  "description": "${DESCRIPTION}",
  "confidence": ${CONFIDENCE},
  "tags": "${TAGS}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "searchable_text": "[${CATEGORY}] ${TITLE}: ${DESCRIPTION}. Tags: ${TAGS}"
}
EOF
)

# Store in RuVector via Node.js indexer
node "$SCRIPT_DIR/embeddings.js" store-learning "$DOC"

echo "✅ Learning stored in RuVector"
echo "   Category: $CATEGORY"
echo "   Title: $TITLE"
echo "   Confidence: $CONFIDENCE"
echo "   Query with: query-learnings.sh --task-description '...'"
