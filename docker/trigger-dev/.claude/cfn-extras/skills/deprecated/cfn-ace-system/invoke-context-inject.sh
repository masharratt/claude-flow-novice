#!/usr/bin/env bash

##############################################################################
# ACE Context Injection - Phase 3.3
# Unified positive + negative context merging with relevance scoring
#
# Usage:
#   ./invoke-context-inject.sh --task-description "task" [OPTIONS]
#
# Arguments:
#   --task-description Task description for context relevance (required)
#   --task-tags        Comma-separated tags (optional)
#   --domain           Domain filter (optional)
#   --enable-ace       Enable ACE context (default: true, A/B testing)
#   --positive-limit   Max positive context bullets (default: 10)
#   --negative-limit   Max negative context bullets (default: 5)
#   --min-relevance    Minimum relevance score (default: 0.3)
#   --output           Output file path (default: stdout)
##############################################################################

set -euo pipefail

# Default values
TASK_DESCRIPTION=""
TASK_TAGS=""
DOMAIN=""
ENABLE_ACE=true
POSITIVE_LIMIT=10
NEGATIVE_LIMIT=5
MIN_RELEVANCE=0.3
OUTPUT=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-description)
      TASK_DESCRIPTION="$2"
      shift 2
      ;;
    --task-tags)
      TASK_TAGS="$2"
      shift 2
      ;;
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --enable-ace)
      ENABLE_ACE="$2"
      shift 2
      ;;
    --positive-limit)
      POSITIVE_LIMIT="$2"
      shift 2
      ;;
    --negative-limit)
      NEGATIVE_LIMIT="$2"
      shift 2
      ;;
    --min-relevance)
      MIN_RELEVANCE="$2"
      shift 2
      ;;
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Validation
if [ -z "$TASK_DESCRIPTION" ]; then
  echo "Error: --task-description is required" >&2
  echo "Usage: $0 --task-description 'task' [OPTIONS]" >&2
  exit 1
fi

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# A/B Testing Mode - Return empty context if disabled
if [ "$ENABLE_ACE" != "true" ]; then
  # Log A/B test mode to Redis
  if command -v redis-cli &> /dev/null; then
    redis-cli HINCRBY "ace:ab_test:control_group" "invocations" 1 > /dev/null 2>&1 || true
  fi

  echo "### ACE System Context (A/B Test - Control Group)"
  echo ""
  echo "_ACE context disabled for A/B testing comparison._"
  exit 0
fi

# Log A/B test mode (enabled)
if command -v redis-cli &> /dev/null; then
  redis-cli HINCRBY "ace:ab_test:treatment_group" "invocations" 1 > /dev/null 2>&1 || true
fi

##############################################################################
# Relevance Scoring Function
##############################################################################
calculate_relevance_score() {
  local context_tags="$1"
  local task_tags="$2"

  # No tags = domain-level relevance (0.3)
  if [ -z "$context_tags" ] || [ "$context_tags" == "null" ]; then
    echo "0.3"
    return
  fi

  if [ -z "$task_tags" ]; then
    echo "0.3"
    return
  fi

  # Convert to arrays
  IFS=',' read -ra CONTEXT_TAG_ARRAY <<< "$context_tags"
  IFS=',' read -ra TASK_TAG_ARRAY <<< "$task_tags"

  local max_score=0.0

  # Check for tag matches
  for ctx_tag in "${CONTEXT_TAG_ARRAY[@]}"; do
    ctx_tag=$(echo "$ctx_tag" | xargs | tr '[:upper:]' '[:lower:]')

    for task_tag in "${TASK_TAG_ARRAY[@]}"; do
      task_tag=$(echo "$task_tag" | xargs | tr '[:upper:]' '[:lower:]')

      # Exact match = 1.0
      if [ "$ctx_tag" == "$task_tag" ]; then
        echo "1.0"
        return
      fi

      # Partial match = 0.6
      if [[ "$ctx_tag" == *"$task_tag"* ]] || [[ "$task_tag" == *"$ctx_tag"* ]]; then
        if (( $(echo "$max_score < 0.6" | bc -l) )); then
          max_score=0.6
        fi
      fi
    done
  done

  # Return max score found, or domain match (0.3)
  if (( $(echo "$max_score > 0.0" | bc -l) )); then
    echo "$max_score"
  else
    echo "0.3"
  fi
}

##############################################################################
# Adaptive Limit Calculation
##############################################################################
calculate_adaptive_limit() {
  local relevance="$1"
  local max_limit="$2"

  # High relevance (≥0.8): Full limit
  if (( $(echo "$relevance >= 0.8" | bc -l) )); then
    echo "$max_limit"
  # Medium relevance (0.5-0.8): Half limit
  elif (( $(echo "$relevance >= 0.5" | bc -l) )); then
    echo $((max_limit / 2))
  # Low relevance (<0.5): Quarter limit (minimum 3)
  else
    local quarter=$((max_limit / 4))
    if [ $quarter -lt 3 ]; then
      echo "3"
    else
      echo "$quarter"
    fi
  fi
}

##############################################################################
# Retrieve Positive Context
##############################################################################
retrieve_positive_context() {
  local task_desc="$1"
  local limit="$2"

  local query_script="${SCRIPT_DIR}/query-contexts.sh"

  if [ ! -f "$query_script" ]; then
    echo "[]"
    return
  fi

  local results
  results=$("$query_script" "$task_desc" --limit "$limit" --format json 2>/dev/null || echo '{"results":{"contexts":[]}}')

  echo "$results" | jq -r '.results.contexts[]' 2>/dev/null || echo "[]"
}

##############################################################################
# Retrieve Negative Context
##############################################################################
retrieve_negative_context() {
  local limit="$1"
  local domain_arg=""
  local tags_arg=""

  if [ -n "$DOMAIN" ]; then
    domain_arg="--domain $DOMAIN"
  fi

  if [ -n "$TASK_TAGS" ]; then
    tags_arg="--task-tags $TASK_TAGS"
  fi

  local format_script="${SCRIPT_DIR}/format-negative-context.sh"

  if [ ! -f "$format_script" ]; then
    echo ""
    return
  fi

  "$format_script" $domain_arg $tags_arg --limit "$limit" 2>/dev/null || echo ""
}

##############################################################################
# Format Unified Context
##############################################################################
format_unified_context() {
  local positive_json="$1"
  local negative_text="$2"

  echo "### ACE System Context - Adaptive Lessons"
  echo ""
  echo "The following lessons are derived from prior sprint iterations and system-wide knowledge."
  echo ""

  # Format positive context (strategies/patterns)
  if [ -n "$positive_json" ] && [ "$positive_json" != "[]" ]; then
    echo "#### Recommended Patterns & Strategies"
    echo ""

    local counter=1
    while read -r context_line; do
      local ctx_type=$(echo "$context_line" | jq -r '.reflection_type // "strategy"')
      local ctx_tags=$(echo "$context_line" | jq -r '.tags // ""')
      local ctx_confidence=$(echo "$context_line" | jq -r '.confidence // 0.0')
      local ctx_lessons=$(echo "$context_line" | jq -r '.lessons_preview // ""')

      # Calculate relevance
      local relevance=$(calculate_relevance_score "$ctx_tags" "$TASK_TAGS")

      # Skip if below minimum relevance
      if (( $(echo "$relevance < $MIN_RELEVANCE" | bc -l) )); then
        continue
      fi

      # Format based on type
      case "$ctx_type" in
        strategy)
          echo "$counter. **Strategy** (relevance: $relevance, confidence: $ctx_confidence)"
          ;;
        pattern)
          echo "$counter. **Pattern** (relevance: $relevance, confidence: $ctx_confidence)"
          ;;
        *)
          echo "$counter. **Lesson** (relevance: $relevance, confidence: $ctx_confidence)"
          ;;
      esac

      # Print lessons (truncated)
      if [ -n "$ctx_lessons" ]; then
        echo "   - $ctx_lessons"
      fi

      echo "   - Tags: $ctx_tags"
      echo ""

      ((counter++))
    done < <(echo "$positive_json" | jq -c '.')
  else
    echo "#### Recommended Patterns & Strategies"
    echo ""
    echo "_No high-relevance patterns found for this task._"
    echo ""
  fi

  # Format negative context (anti-patterns)
  if [ -n "$negative_text" ]; then
    echo "$negative_text"
  else
    echo "#### Anti-Patterns to Avoid"
    echo ""
    echo "_No anti-patterns found matching task criteria._"
    echo ""
  fi

  # Metadata footer
  echo "---"
  echo "_Context generated by ACE System v3.3 (adaptive relevance scoring)_"
}

##############################################################################
# Main Execution
##############################################################################

# Step 1: Retrieve positive context with adaptive limit
POSITIVE_RESULTS=$(retrieve_positive_context "$TASK_DESCRIPTION" "$POSITIVE_LIMIT")

# Step 2: Calculate average relevance for adaptive limits
TOTAL_RELEVANCE=0.0
COUNT=0

while read -r context_line; do
  if [ -z "$context_line" ] || [ "$context_line" == "null" ]; then
    continue
  fi

  ctx_tags=$(echo "$context_line" | jq -r '.tags // ""')
  relevance=$(calculate_relevance_score "$ctx_tags" "$TASK_TAGS")

  TOTAL_RELEVANCE=$(echo "$TOTAL_RELEVANCE + $relevance" | bc -l)
  ((COUNT++))
done < <(echo "$POSITIVE_RESULTS" | jq -c '.')

if [ $COUNT -gt 0 ]; then
  AVG_RELEVANCE=$(echo "scale=2; $TOTAL_RELEVANCE / $COUNT" | bc -l)
else
  AVG_RELEVANCE=0.3
fi

# Step 3: Apply adaptive limits
ADAPTIVE_POSITIVE_LIMIT=$(calculate_adaptive_limit "$AVG_RELEVANCE" "$POSITIVE_LIMIT")
ADAPTIVE_NEGATIVE_LIMIT=$(calculate_adaptive_limit "$AVG_RELEVANCE" "$NEGATIVE_LIMIT")

# Step 4: Retrieve contexts with adaptive limits
POSITIVE_CONTEXT=$(retrieve_positive_context "$TASK_DESCRIPTION" "$ADAPTIVE_POSITIVE_LIMIT")
NEGATIVE_CONTEXT=$(retrieve_negative_context "$ADAPTIVE_NEGATIVE_LIMIT")

# Step 5: Format unified output
UNIFIED_CONTEXT=$(format_unified_context "$POSITIVE_CONTEXT" "$NEGATIVE_CONTEXT")

# Step 6: Output results
if [ -n "$OUTPUT" ]; then
  echo "$UNIFIED_CONTEXT" > "$OUTPUT"
  echo "Unified context saved to: $OUTPUT" >&2
else
  echo "$UNIFIED_CONTEXT"
fi

# Log analytics to Redis
if command -v redis-cli &> /dev/null; then
  redis-cli HINCRBY "ace:stats:context_injection" "invocations" 1 > /dev/null 2>&1 || true
  redis-cli HSET "ace:stats:context_injection" "avg_relevance" "$AVG_RELEVANCE" > /dev/null 2>&1 || true
  redis-cli HINCRBY "ace:stats:context_injection" "positive_bullets" "$ADAPTIVE_POSITIVE_LIMIT" > /dev/null 2>&1 || true
  redis-cli HINCRBY "ace:stats:context_injection" "negative_bullets" "$ADAPTIVE_NEGATIVE_LIMIT" > /dev/null 2>&1 || true
fi

exit 0
