#!/usr/bin/env bash

##############################################################################
# Context Injection Helper - ACE System Integration Phase 1.3
# Retrieves historical context from Redis, filters by agent type, formats as markdown
#
# Usage:
#   ./context-injection.sh --task-id TASK_ID --agent-type AGENT_TYPE --original-context '{...}'
#
# Arguments:
#   --task-id           Unique task identifier (required)
#   --agent-type        Agent type for filtering (required)
#   --original-context  Original task context JSON (required)
#
# Output:
#   Enriched context JSON with historical_context field
#   Logs to: .artifacts/logs/context-injection-{TASK_ID}.log
##############################################################################

set -euo pipefail

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Default values
TASK_ID=""
AGENT_TYPE=""
ORIGINAL_CONTEXT=""
LOG_DIR="$PROJECT_ROOT/.artifacts/logs"
MAX_STRATEGIES=3
MAX_ANTI_PATTERNS=3
MAX_EDGE_CASES=3
MAX_CHARS=2000

# Agent type to domain mapping
declare -A AGENT_DOMAIN_MAP=(
  [backend-dev]="backend"
  [backend-developer]="backend"
  [react-frontend-engineer]="frontend"
  [frontend-developer]="frontend"
  [ui-designer]="frontend"
  [security-specialist]="security"
  [devops-engineer]="devops"
  [kubernetes-specialist]="devops"
  [tester]="testing"
  [qa-engineer]="testing"
  [researcher]="general"
  [architect]="general"
  [reviewer]="general"
)

##############################################################################
# Logging
##############################################################################
log() {
  local level="$1"
  shift
  local message="$*"
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  if [ -n "$TASK_ID" ]; then
    local log_file="$LOG_DIR/context-injection-${TASK_ID}.log"
    mkdir -p "$LOG_DIR"
    echo "[$timestamp] [$level] $message" >> "$log_file"
  fi
  # Always log to stderr, not stdout
  echo "[$timestamp] [$level] $message" >&2
}

##############################################################################
# Retrieve Historical Context from Redis
##############################################################################
retrieve_from_redis() {
  local redis_key="cfn_loop:${TASK_ID}:historical_context"

  log "INFO" "Retrieving context from Redis: $redis_key"

  # Check if key exists
  if ! redis-cli EXISTS "$redis_key" > /dev/null 2>&1; then
    log "WARN" "Redis key not found: $redis_key"
    echo "{}"
    return 0
  fi

  # Retrieve value
  local redis_value
  if ! redis_value=$(redis-cli GET "$redis_key" 2>&1); then
    log "ERROR" "Failed to retrieve from Redis: $redis_value"
    echo "{}"
    return 0
  fi

  # Validate JSON
  if ! echo "$redis_value" | jq . > /dev/null 2>&1; then
    log "ERROR" "Invalid JSON from Redis"
    echo "{}"
    return 0
  fi

  log "INFO" "Successfully retrieved historical context"
  echo "$redis_value"
}

##############################################################################
# Map Agent Type to Domain
##############################################################################
map_agent_to_domain() {
  local agent_type="$1"

  # Check mapping
  if [ -n "${AGENT_DOMAIN_MAP[$agent_type]:-}" ]; then
    local domain="${AGENT_DOMAIN_MAP[$agent_type]}"
    log "INFO" "Mapped agent type '$agent_type' to domain '$domain'"
    echo "$domain"
  else
    log "WARN" "Unknown agent type '$agent_type', using 'general' domain"
    echo "general"
  fi
}

##############################################################################
# Filter Results by Domain
# Filters historical context results to match agent's domain
##############################################################################
filter_by_domain() {
  local historical_context="$1"
  local target_domain="$2"

  log "INFO" "Filtering results for domain: $target_domain"

  # Extract results array
  local results=$(echo "$historical_context" | jq -r '.results // []')

  # Check if results is empty
  if [ "$results" == "[]" ] || [ "$results" == "null" ]; then
    log "WARN" "No results to filter"
    echo "[]"
    return 0
  fi

  # Filter by domain (include general domain as well)
  local filtered
  filtered=$(echo "$results" | jq --arg domain "$target_domain" '
    [.[] | select(.domain == $domain or .domain == "general")]
  ')

  local count=$(echo "$filtered" | jq 'length' 2>/dev/null || echo 0)
  log "INFO" "Filtered to $count results matching domain '$target_domain' or 'general'"

  echo "$filtered"
}

##############################################################################
# Extract Insights by Type
# Extracts and limits insights by category (strategy, anti-pattern, edge-case)
##############################################################################
extract_insights() {
  local filtered_results="$1"
  local insight_type="$2"
  local max_count="$3"

  # Extract insights of specified type from all results
  local insights
  insights=$(echo "$filtered_results" | jq -r --arg type "$insight_type" '
    [.[].insights[]? | select(.type == $type) | .text] | .[:'"$max_count"'] | .[]
  ' 2>/dev/null || echo "")

  echo "$insights"
}

##############################################################################
# Format as Markdown
# Creates markdown-formatted historical context section
##############################################################################
format_markdown() {
  local filtered_results="$1"

  log "INFO" "Formatting historical context as markdown"

  # Check if we have any results
  local count=$(echo "$filtered_results" | jq 'length' 2>/dev/null || echo 0)
  if [ "$count" -eq 0 ] 2>/dev/null; then
    log "WARN" "No filtered results to format"
    echo ""
    return 0
  fi

  # Extract insights by category
  local strategies
  strategies=$(extract_insights "$filtered_results" "strategy" "$MAX_STRATEGIES")

  local anti_patterns
  anti_patterns=$(extract_insights "$filtered_results" "anti-pattern" "$MAX_ANTI_PATTERNS")

  local edge_cases
  edge_cases=$(extract_insights "$filtered_results" "edge-case" "$MAX_EDGE_CASES")

  # Build markdown
  local markdown=""

  # Add header
  markdown+="## Historical Context\n\n"

  # Add strategies section
  if [ -n "$strategies" ]; then
    markdown+="### Strategies\n"
    while IFS= read -r line; do
      markdown+="- $line\n"
    done <<< "$strategies"
    markdown+="\n"
  fi

  # Add anti-patterns section
  if [ -n "$anti_patterns" ]; then
    markdown+="### Anti-Patterns\n"
    while IFS= read -r line; do
      markdown+="- $line\n"
    done <<< "$anti_patterns"
    markdown+="\n"
  fi

  # Add edge cases section
  if [ -n "$edge_cases" ]; then
    markdown+="### Edge Cases\n"
    while IFS= read -r line; do
      markdown+="- $line\n"
    done <<< "$edge_cases"
    markdown+="\n"
  fi

  # Check if we added any content
  if [ "$markdown" == "## Historical Context\n\n" ]; then
    log "WARN" "No insights extracted from filtered results"
    echo ""
    return 0
  fi

  # Log summary
  local strategy_count=0
  [ -n "$strategies" ] && strategy_count=$(echo "$strategies" | wc -l | tr -d ' ')

  local anti_pattern_count=0
  [ -n "$anti_patterns" ] && anti_pattern_count=$(echo "$anti_patterns" | wc -l | tr -d ' ')

  local edge_case_count=0
  [ -n "$edge_cases" ] && edge_case_count=$(echo "$edge_cases" | wc -l | tr -d ' ')

  local total_insights=$((strategy_count + anti_pattern_count + edge_case_count))

  log "INFO" "Formatted markdown: $total_insights insights ($strategy_count strategies, $anti_pattern_count anti-patterns, $edge_case_count edge cases)"

  echo -e "$markdown"
}

##############################################################################
# Enforce Character Limit
# Truncates markdown if it exceeds MAX_CHARS
##############################################################################
enforce_char_limit() {
  local markdown="$1"
  local char_count=${#markdown}

  if [ $char_count -gt $MAX_CHARS ]; then
    log "WARN" "Markdown exceeds character limit ($char_count > $MAX_CHARS), truncating"
    markdown="${markdown:0:$((MAX_CHARS - 3))}..."
    log "INFO" "Truncated to ${#markdown} characters"
  else
    log "INFO" "Markdown character count: $char_count/$MAX_CHARS"
  fi

  echo "$markdown"
}

##############################################################################
# Merge with Original Context
# Adds historical_context field to original context JSON
##############################################################################
merge_context() {
  local original="$1"
  local markdown="$2"

  log "INFO" "Merging historical context with original context"

  # Validate original context is valid JSON
  if ! echo "$original" | jq . > /dev/null 2>&1; then
    log "ERROR" "Invalid original context JSON"
    log "ERROR" "Original context: $original"
    echo "{}"
    return 1
  fi

  # Create enriched context
  local enriched
  enriched=$(echo "$original" | jq --arg hist "$markdown" '. + {historical_context: $hist}')

  # Validate enriched context
  if ! echo "$enriched" | jq . > /dev/null 2>&1; then
    log "ERROR" "Failed to create valid enriched context JSON"
    echo "$original"
    return 1
  fi

  log "INFO" "Successfully merged contexts"
  echo "$enriched"
}

##############################################################################
# Argument Parsing
##############################################################################
parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --task-id)
        TASK_ID="$2"
        shift 2
        ;;
      --agent-type)
        AGENT_TYPE="$2"
        shift 2
        ;;
      --original-context)
        ORIGINAL_CONTEXT="$2"
        shift 2
        ;;
      *)
        log "ERROR" "Unknown option: $1"
        echo "Usage: $0 --task-id TASK_ID --agent-type AGENT_TYPE --original-context '{...}'"
        exit 1
        ;;
    esac
  done

  # Validation
  if [ -z "$TASK_ID" ]; then
    log "ERROR" "--task-id is required"
    exit 1
  fi

  if [ -z "$AGENT_TYPE" ]; then
    log "ERROR" "--agent-type is required"
    exit 1
  fi

  if [ -z "$ORIGINAL_CONTEXT" ]; then
    log "ERROR" "--original-context is required"
    exit 1
  fi
}

##############################################################################
# Main Execution
##############################################################################
main() {
  parse_arguments "$@"

  log "INFO" "Starting context injection for task: $TASK_ID"
  log "INFO" "Agent type: $AGENT_TYPE"

  # Step 1: Retrieve from Redis
  local historical_context
  historical_context=$(retrieve_from_redis)

  # Check if we got results
  if [ "$historical_context" == "{}" ] || [ -z "$historical_context" ]; then
    log "WARN" "No historical context available, returning original context"
    echo "$ORIGINAL_CONTEXT"
    exit 0
  fi

  # Step 2: Map agent type to domain
  local domain
  domain=$(map_agent_to_domain "$AGENT_TYPE")

  # Step 3: Filter by domain
  local filtered_results
  filtered_results=$(filter_by_domain "$historical_context" "$domain")

  # Step 4: Format as markdown
  local markdown
  markdown=$(format_markdown "$filtered_results")

  # Check if we have any markdown to inject
  if [ -z "$markdown" ]; then
    log "WARN" "No relevant historical context for agent type, returning original context"
    echo "$ORIGINAL_CONTEXT"
    exit 0
  fi

  # Step 5: Enforce character limit
  markdown=$(enforce_char_limit "$markdown")

  # Step 6: Merge with original context
  local enriched_context
  if ! enriched_context=$(merge_context "$ORIGINAL_CONTEXT" "$markdown"); then
    log "ERROR" "Context merge failed, returning original context"
    echo "$ORIGINAL_CONTEXT"
    exit 1
  fi

  # Step 7: Output enriched context
  echo "$enriched_context"

  # Calculate confidence score
  local confidence=0.75

  # Boost confidence based on success
  local filtered_count=$(echo "$filtered_results" | jq 'length' 2>/dev/null || echo 0)
  if [ "$filtered_count" -gt 0 ] 2>/dev/null; then
    confidence=$(echo "$confidence + 0.10" | bc)
  fi

  local char_count=${#markdown}
  if [ $char_count -gt 0 ] && [ $char_count -le $MAX_CHARS ]; then
    confidence=$(echo "$confidence + 0.10" | bc)
  fi

  # Cap at 1.0
  confidence=$(echo "if ($confidence > 1.0) 1.0 else $confidence" | bc)

  log "INFO" "Context injection complete"
  log "INFO" "Filtered results: $filtered_count"
  log "INFO" "Markdown length: $char_count/$MAX_CHARS characters"
  log "INFO" "Self-confidence score: $confidence"

  exit 0
}

# Execute main
main "$@"
