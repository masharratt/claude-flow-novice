#!/bin/bash
set -euo pipefail

# Query RuVector for relevant error patterns to avoid
# Usage: query-error-patterns.sh --task-description DESC [--limit N]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_DESCRIPTION=""
LIMIT=5

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-description) TASK_DESCRIPTION="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate required params
if [[ -z "$TASK_DESCRIPTION" ]]; then
  echo "Error: Missing required parameter"
  echo "Usage: query-error-patterns.sh --task-description DESC [--limit N]"
  exit 1
fi

# Query RuVector via Node.js
RESULTS=$(node "$SCRIPT_DIR/embeddings.js" query-error-patterns "$TASK_DESCRIPTION" "$LIMIT" 2>/dev/null || echo "[]")

# Format output
if [[ "$RESULTS" == "[]" || -z "$RESULTS" ]]; then
  echo "No relevant error patterns found for: $TASK_DESCRIPTION"
  exit 0
fi

echo "📚 Relevant error patterns to avoid:"
echo "$RESULTS" | jq -r '.[] | "
  ❌ \(.error_type): \(.pattern)
     Context: \(.context)
     Solution: \(.solution)
     (Task: \(.task_id), \(.timestamp))
"'
