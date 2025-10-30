#!/bin/bash

# ACE System Anti-Pattern Query System
# Purpose: Query relevant anti-patterns based on task classification to prevent repeating mistakes
# Usage: query-anti-patterns.sh "task description" [--limit N] [--format json|simple]

set -euo pipefail

TASK_DESCRIPTION=""
LIMIT=3
MIN_CONFIDENCE=0.0
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
  echo "Usage: query-anti-patterns.sh 'task description' [--limit N] [--format json|simple]" >&2
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

DOMAINS=$(echo "$CLASSIFICATION" | jq -r '.domains[]' 2>/dev/null || echo "")
COMPLEXITY=$(echo "$CLASSIFICATION" | jq -r '.complexity' 2>/dev/null || echo "medium")
TASK_TYPE=$(echo "$CLASSIFICATION" | jq -r '.task_type' 2>/dev/null || echo "general")

# Handle empty domains
if [ -z "$DOMAINS" ]; then
  DOMAINS="general"
fi

# Step 2: Query anti-patterns by domain with severity sorting
TEMP_RESULTS="/tmp/ace-antipattern-results-$$.json"
echo "[]" > "$TEMP_RESULTS"

for DOMAIN in $DOMAINS; do
  # Query anti-patterns for this domain
  QUERY_RESULT=$(sqlite3 "$DB_PATH" -json << EOF
SELECT
  id,
  reflection_type,
  json_extract(extracted_lessons, '\$.anti_pattern') as anti_pattern,
  json_extract(extracted_lessons, '\$.solution') as solution,
  json_extract(extracted_lessons, '\$.impact') as impact,
  json_extract(metadata, '\$.severity') as severity,
  json_extract(metadata, '\$.domain') as domain,
  json_extract(metadata, '\$.sprint_ref') as sprint_ref,
  json_extract(metadata, '\$.keywords') as keywords,
  json_extract(execution_trace, '\$.iterations') as iterations_caused,
  confidence,
  created_at,
  success_count,
  total_count
FROM context_reflections
WHERE reflection_type IN ('anti-pattern', 'warning', 'failure')
  AND (
    json_extract(metadata, '\$.domain') = '$DOMAIN'
    OR json_extract(metadata, '\$.domain') = 'general'
  )
  AND confidence >= $MIN_CONFIDENCE
  AND curator_status IN ('curated', 'pending')
ORDER BY
  CASE json_extract(metadata, '\$.severity')
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  confidence DESC,
  created_at DESC;
EOF
)

  # Merge results
  if [ -n "$QUERY_RESULT" ] && [ "$QUERY_RESULT" != "[]" ]; then
    MERGED=$(jq -s '.[0] + .[1]' "$TEMP_RESULTS" <(echo "$QUERY_RESULT"))
    echo "$MERGED" > "$TEMP_RESULTS"
  fi
done

# Step 3: Deduplication - remove similar anti-patterns
# Strategy: Group by first 60 characters of anti_pattern, keep highest confidence
DEDUPED_RESULTS=$(jq '
  group_by(.anti_pattern[:60]) |
  map(
    sort_by(-.confidence) |
    .[0]
  )
' "$TEMP_RESULTS")

echo "$DEDUPED_RESULTS" > "$TEMP_RESULTS"

# Step 4: Calculate relevance scores
# Scoring factors:
# - Severity weight: 50% (critical=1.0, high=0.8, medium=0.5, low=0.3)
# - Domain match: 30% (exact=1.0, general=0.5)
# - Recency: 10% (exponential decay, half-life=90 days)
# - Frequency: 10% (based on usage ratio: success_count/total_count)

SCORED_RESULTS=$(jq --arg current_date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
  map(
    . as $item |

    # Calculate severity score
    (
      if .severity == "critical" then 1.0
      elif .severity == "high" then 0.8
      elif .severity == "medium" then 0.5
      elif .severity == "low" then 0.3
      else 0.4
      end
    ) as $severity_score |

    # Calculate domain match score
    (
      if (.domain | type == "array") then
        if (.domain | any(. == $item.domain)) then 1.0 else 0.5 end
      else
        if .domain == $item.domain then 1.0 else 0.5 end
      end
    ) as $domain_score |

    # Calculate recency score (exponential decay)
    # Handle both Unix timestamps and SQLite datetime strings
    (
      if (.created_at | type == "number") then
        .created_at
      elif (.created_at | type == "string") then
        (.created_at | gsub(" "; "T") | . + "Z" | fromdateiso8601)
      else
        ($current_date | fromdateiso8601)
      end
    ) as $created_timestamp |

    (
      (
        ($current_date | fromdateiso8601) - $created_timestamp
      ) / 86400
    ) as $days_ago |

    (
      if $days_ago <= 0 then 1.0
      elif $days_ago > 1000 then 0.1
      else (1.0 / (1.0 + ($days_ago / 90.0)))
      end
    ) as $recency_score |

    # Calculate frequency score (failure rate)
    (
      if (.total_count // 0) > 0 then
        (1.0 - ((.success_count // 0) / (.total_count // 1)))
      else 0.5
      end
    ) as $frequency_score |

    # Combined relevance score
    (
      (0.5 * $severity_score) +
      (0.3 * $domain_score) +
      (0.1 * $recency_score) +
      (0.1 * $frequency_score)
    ) as $relevance_score |

    . + {
      relevance_score: ($relevance_score | . * 100 | round / 100),
      scoring_breakdown: {
        severity: ($severity_score | . * 100 | round / 100),
        domain: ($domain_score | . * 100 | round / 100),
        recency: ($recency_score | . * 100 | round / 100),
        frequency: ($frequency_score | . * 100 | round / 100)
      }
    }
  ) |
  sort_by(-.relevance_score)
' "$TEMP_RESULTS")

# Step 5: Limit results
FINAL_RESULTS=$(echo "$SCORED_RESULTS" | jq ".[:$LIMIT]")
TOTAL_COUNT=$(echo "$SCORED_RESULTS" | jq 'length')

# Step 6: Output results
case "$OUTPUT_FORMAT" in
  json)
    echo "$FINAL_RESULTS" | jq \
      --arg task "$TASK_DESCRIPTION" \
      --arg domains "$(echo $DOMAINS | tr '\n' ',' | sed 's/,$//')" \
      --arg complexity "$COMPLEXITY" \
      --arg task_type "$TASK_TYPE" \
      --argjson total_count "$TOTAL_COUNT" \
      --argjson limit "$LIMIT" \
      '{
        query: {
          task: $task,
          domains: ($domains | split(",")),
          complexity: $complexity,
          task_type: $task_type
        },
        anti_patterns: .,
        total_count: $total_count,
        filtered_count: (. | length),
        limit: $limit
      }'
    ;;

  simple)
    echo "=== Anti-Pattern Query Results ==="
    echo "Task: $TASK_DESCRIPTION"
    echo "Domains: $(echo $DOMAINS | tr '\n' ',' | sed 's/,$//')"
    echo "Total Found: $TOTAL_COUNT"
    echo "Returned: $(echo "$FINAL_RESULTS" | jq 'length')"
    echo ""

    echo "$FINAL_RESULTS" | jq -r '
      .[] |
      "[\(.severity // "medium" | ascii_upcase)] \(.domain // "general") - Relevance: \(.relevance_score)\n" +
      "  Anti-Pattern: \(.anti_pattern // "N/A")\n" +
      "  Solution: \(.solution // "N/A")\n" +
      "  Sprint Ref: \(.sprint_ref // "N/A")\n" +
      "  Confidence: \(.confidence)\n"
    '
    ;;

  *)
    echo "ERROR: Unknown format $OUTPUT_FORMAT" >&2
    rm -f "$TEMP_RESULTS"
    exit 1
    ;;
esac

# Cleanup
rm -f "$TEMP_RESULTS"

exit 0
