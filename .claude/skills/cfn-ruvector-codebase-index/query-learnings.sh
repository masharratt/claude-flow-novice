#!/bin/bash
set -euo pipefail

# Query RuVector for relevant learnings/patterns to follow
# Usage: query-learnings.sh --task-description DESC [--category CAT] [--limit N]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_DESCRIPTION=""
CATEGORY=""
LIMIT=5

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-description) TASK_DESCRIPTION="$2"; shift 2 ;;
    --category) CATEGORY="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate required params
if [[ -z "$TASK_DESCRIPTION" ]]; then
  echo "Error: Missing required parameter"
  echo "Usage: query-learnings.sh --task-description DESC [--category CAT] [--limit N]"
  exit 1
fi

# Query RuVector via Node.js
RESULTS=$(node "$SCRIPT_DIR/embeddings.js" query-learnings "$TASK_DESCRIPTION" "$CATEGORY" "$LIMIT" 2>/dev/null || echo "[]")

# Format output
if [[ "$RESULTS" == "[]" || -z "$RESULTS" ]]; then
  echo "No relevant learnings found for: $TASK_DESCRIPTION"
  exit 0
fi

echo "📚 Relevant learnings/patterns:"
echo "$RESULTS" | jq -r '.[] | "
  ✅ [\(.category)] \(.title) (confidence: \(.confidence))
     \(.description)
     Tags: \(.tags)
     (Task: \(.task_id), \(.timestamp))
"'
