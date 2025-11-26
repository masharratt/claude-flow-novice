#!/bin/bash

# ACE System Context Query - Domain-Aware Integration
# Purpose: Query relevant contexts using task classifier domains
# Usage: query-contexts.sh "task description" [--limit N] [--min-confidence X]

set -euo pipefail

TASK_DESCRIPTION=""
LIMIT=5
MIN_CONFIDENCE=0.80
OUTPUT_FORMAT="json"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --min-confidence)
      MIN_CONFIDENCE="$2"
      shift 2
      ;;
    --format)
      OUTPUT_FORMAT="$2"
      shift 2
      ;;
    *)
      if [ -z "$TASK_DESCRIPTION" ]; then
        TASK_DESCRIPTION="$1"
      fi
      shift
      ;;
  esac
done

if [ -z "$TASK_DESCRIPTION" ]; then
  echo "Usage: query-contexts.sh 'task description' [--limit N] [--min-confidence X]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DB_PATH="${PROJECT_ROOT}/ace-context.db"
CLASSIFIER_PATH="${SCRIPT_DIR}/../cfn-task-classifier/classify-task.sh"

# Verify dependencies
if [ ! -f "$CLASSIFIER_PATH" ]; then
  echo "ERROR: Task classifier not found at $CLASSIFIER_PATH" >&2
  exit 1
fi

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: ACE database not found at $DB_PATH" >&2
  exit 1
fi

# Step 1: Classify task to extract domains
CLASSIFICATION=$("$CLASSIFIER_PATH" "$TASK_DESCRIPTION" --format=json)
if [ $? -ne 0 ]; then
  echo "ERROR: Task classification failed" >&2
  exit 1
fi

DOMAINS=$(echo "$CLASSIFICATION" | jq -r '.domains[]')
COMPLEXITY=$(echo "$CLASSIFICATION" | jq -r '.complexity')
TASK_TYPE=$(echo "$CLASSIFICATION" | jq -r '.task_type')

# Step 2: Extract tags from task (for future relevance scoring)
TAGS_OUTPUT=$("${SCRIPT_DIR}/extract-tags.sh" --text "$TASK_DESCRIPTION" --task-only 2>/dev/null || echo "[]")
TASK_TAGS=$(echo "$TAGS_OUTPUT" | jq -r 'if type == "array" then .[] else empty end' 2>/dev/null || echo "")

# Step 3: Query SQLite for contexts by domain
TEMP_RESULTS="/tmp/ace-query-results-$$.json"
echo "[]" > "$TEMP_RESULTS"

for DOMAIN in $DOMAINS; do
  # Query contexts for this domain
  QUERY_RESULT=$(sqlite3 "$DB_PATH" -json << EOF
SELECT
  id,
  reflection_type,
  json_extract(metadata, '$.tags') as tags,
  json_extract(metadata, '$.domain') as domain,
  json_extract(metadata, '$.keywords') as keywords,
  confidence,
  created_at,
  substr(extracted_lessons, 1, 500) as lessons_preview
FROM context_reflections
WHERE json_extract(metadata, '$.domain') = '$DOMAIN'
  AND confidence >= $MIN_CONFIDENCE
  AND curator_status IN ('curated', 'pending')
ORDER BY confidence DESC, created_at DESC
LIMIT $LIMIT;
EOF
)

  # Merge results
  if [ -n "$QUERY_RESULT" ] && [ "$QUERY_RESULT" != "[]" ]; then
    MERGED=$(jq -s '.[0] + .[1]' "$TEMP_RESULTS" <(echo "$QUERY_RESULT"))
    echo "$MERGED" > "$TEMP_RESULTS"
  fi
done

# Step 4: Sort by confidence and limit results
# TODO: Add relevance scoring integration with correct API (8 params required)
FINAL_RESULTS=$(jq "sort_by(-.confidence) | .[:$LIMIT]" "$TEMP_RESULTS")

# Step 5: Output results
case "$OUTPUT_FORMAT" in
  json)
    echo "$FINAL_RESULTS" | jq '{
      query: {
        task: $task,
        domains: $domains,
        complexity: $complexity,
        task_type: $task_type,
        tags: ($tags | split(" ") | map(select(. != "")))
      },
      results: {
        count: (. | length),
        contexts: .
      }
    }' \
      --arg task "$TASK_DESCRIPTION" \
      --arg domains "$(echo $DOMAINS | tr '\n' ',' | sed 's/,$//')" \
      --arg complexity "$COMPLEXITY" \
      --arg task_type "$TASK_TYPE" \
      --arg tags "$TASK_TAGS"
    ;;

  simple)
    echo "Query: $TASK_DESCRIPTION"
    echo "Domains: $(echo $DOMAINS | tr '\n' ',' | sed 's/,$//')"
    echo "Results: $(echo "$FINAL_RESULTS" | jq 'length')"
    echo ""
    echo "$FINAL_RESULTS" | jq -r '.[] | "[\(.domain)] \(.id) (confidence: \(.confidence))"'
    ;;

  *)
    echo "ERROR: Unknown format $OUTPUT_FORMAT" >&2
    exit 1
    ;;
esac

# Cleanup
rm -f "$TEMP_RESULTS"

exit 0
