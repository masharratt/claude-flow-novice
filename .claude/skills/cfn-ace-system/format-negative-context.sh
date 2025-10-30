#!/bin/bash
# format-negative-context.sh
# Phase 3.2 - Format anti-patterns from ACE database for agent context injection
# Usage: format-negative-context.sh --domain "security" --limit 5 [--task-tags "JWT,auth"]

set -euo pipefail

# Configuration
ACE_DB="/mnt/c/Users/masha/Documents/claude-flow-novice/ace-context.db"
DOMAIN=""
LIMIT=5
TASK_TAGS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --task-tags) TASK_TAGS="$2"; shift 2 ;;
    *) echo "Unknown parameter: $1" >&2; exit 1 ;;
  esac
done

# Input sanitization (SECURITY: prevent SQL injection)
sanitize_input() {
  echo "$1" | sed 's/[^a-zA-Z0-9_,\-]//g'
}

DOMAIN=$(sanitize_input "$DOMAIN")
LIMIT=$(sanitize_input "$LIMIT")
TASK_TAGS=$(sanitize_input "$TASK_TAGS")

# Validate limit
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [ "$LIMIT" -lt 1 ] || [ "$LIMIT" -gt 20 ]; then
  echo "Error: --limit must be between 1 and 20" >&2
  exit 1
fi

# Redact sensitive data from output
redact_sensitive() {
  local text="$1"
  # Redact potential API keys (patterns: sk_live_XXX, sk_test_XXX, etc.)
  text=$(echo "$text" | sed -E 's/\bsk_(live|test)_[a-zA-Z0-9_]+/[REDACTED_API_KEY]/g')
  # Redact generic long alphanumeric strings (32+ chars with underscores/hyphens)
  text=$(echo "$text" | sed -E 's/\b[a-zA-Z0-9_-]{32,}\b/[REDACTED]/g')
  # Redact password/token patterns
  text=$(echo "$text" | sed -E 's/(password|pwd|token|secret|key)[:=]\s*[^ ]+/\1: [REDACTED]/gi')
  # Redact JWT tokens (xxx.yyy.zzz format)
  text=$(echo "$text" | sed -E 's/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/[REDACTED_JWT]/g')
  echo "$text"
}

# Build SQL query with filters
build_query() {
  local query="SELECT 
    json_extract(extracted_lessons, '$.anti_pattern') as description,
    json_extract(extracted_lessons, '$.solution') as solution,
    json_extract(metadata, '$.severity') as severity,
    json_extract(metadata, '$.sprint_ref') as sprint_ref,
    json_extract(metadata, '$.tags') as tags,
    confidence,
    json_extract(execution_trace, '$.iterations') as iterations
  FROM context_reflections
  WHERE reflection_type IN ('anti-pattern', 'warning')"
  
  # Filter by domain if specified
  if [[ -n "$DOMAIN" ]]; then
    query="$query AND json_extract(metadata, '$.domain') = '$DOMAIN'"
  fi
  
  # Filter by task tags for relevance scoring
  if [[ -n "$TASK_TAGS" ]]; then
    IFS=',' read -ra TAG_ARRAY <<< "$TASK_TAGS"
    local tag_conditions=""
    for tag in "${TAG_ARRAY[@]}"; do
      tag=$(echo "$tag" | xargs)  # trim whitespace
      if [[ -n "$tag_conditions" ]]; then
        tag_conditions="$tag_conditions OR "
      fi
      tag_conditions="${tag_conditions}json_extract(metadata, '$.tags') LIKE '%$tag%'"
    done
    query="$query AND ($tag_conditions)"
  fi
  
  # Order by severity (critical first), then recency
  query="$query ORDER BY 
    CASE json_extract(metadata, '$.severity')
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      ELSE 4
    END,
    created_at DESC
  LIMIT $LIMIT"
  
  echo "$query"
}

# Get severity emoji
get_severity_emoji() {
  case "$1" in
    critical) echo "🚫" ;;
    high) echo "⚠️" ;;
    medium) echo "⚡" ;;
    low) echo "ℹ️" ;;
    *) echo "•" ;;
  esac
}

# Check if database exists
if [[ ! -f "$ACE_DB" ]]; then
  echo "Error: ACE database not found at $ACE_DB" >&2
  exit 1
fi

# Build and execute query
QUERY=$(build_query)

# Format output
echo "### ⚠️ Anti-Patterns to Avoid"
echo ""

COUNTER=1
FOUND=0

while IFS='|' read -r description solution severity sprint_ref tags confidence iterations; do
  FOUND=1
  
  # Redact sensitive information
  description=$(redact_sensitive "$description")
  solution=$(redact_sensitive "$solution")
  
  # Handle null/empty values
  severity=${severity:-"low"}
  iterations=${iterations:-"1"}
  confidence=${confidence:-"0.0"}
  sprint_ref=${sprint_ref:-"unknown"}
  tags=${tags:-"general"}
  
  # Get severity emoji
  EMOJI=$(get_severity_emoji "$severity")
  
  # Format iteration text
  if [[ "$iterations" == "1" ]]; then
    ITERATION_TEXT="failed in 1 sprint"
  else
    ITERATION_TEXT="failed in $iterations sprints"
  fi
  
  # Format entry
  echo "$COUNTER. **$description** ($EMOJI ${severity^^}, $ITERATION_TEXT)"
  echo "   - Issue: $description"
  echo "   - Sprint: \`$sprint_ref\` (ITERATE x$iterations, final confidence: $confidence)"
  
  if [[ -n "$solution" && "$solution" != "null" && "$solution" != "" ]]; then
    echo "   - Solution: $solution"
  else
    echo "   - Solution: Not yet determined (investigate before implementing)"
  fi
  
  echo "   - Tags: $tags"
  echo ""
  
  ((COUNTER++))
done < <(sqlite3 "$ACE_DB" "$QUERY" 2>/dev/null || true)

# Handle no results
if [[ $FOUND -eq 0 ]]; then
  echo "No anti-patterns found matching criteria."
  if [[ -n "$DOMAIN" ]]; then
    echo "- Domain filter: $DOMAIN"
  fi
  if [[ -n "$TASK_TAGS" ]]; then
    echo "- Tag filter: $TASK_TAGS"
  fi
  echo ""
  echo "Consider broadening search criteria or checking database status."
fi

exit 0
