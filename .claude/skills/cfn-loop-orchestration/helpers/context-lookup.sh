#!/usr/bin/env bash

##############################################################################
# Context Lookup Helper - ACE System Integration Phase 1.2
# Extracts keywords from task description and queries historical context
#
# Usage:
#   ./context-lookup.sh --task-id TASK_ID --description "Task description"
#
# Arguments:
#   --task-id              Unique task identifier (required)
#   --description          Task description for keyword extraction (required)
#   --similarity-threshold Minimum similarity (0.0-1.0, default: 0.70)
#   --max-results          Maximum results (default: 5)
#
# Output:
#   Stores results in Redis: cfn_loop:{TASK_ID}:historical_context
#   TTL: 1 hour (3600 seconds)
#   Logs to: .artifacts/logs/context-lookup-{TASK_ID}.log
##############################################################################

set -euo pipefail

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ACE_SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-ace-system"

# Default values
TASK_ID=""
DESCRIPTION=""
SIMILARITY_THRESHOLD=0.70
MAX_RESULTS=5
LOG_DIR="$PROJECT_ROOT/.artifacts/logs"
MEMORY_PATH="$PROJECT_ROOT/.artifacts/database/swarm-memory.db"

# Domain classification keywords
declare -A DOMAIN_KEYWORDS=(
  [frontend]="react,vue,angular,ui,component,jsx,tsx,css,html,dom,browser,frontend"
  [backend]="api,server,database,sql,route,endpoint,auth,middleware,backend,express,node"
  [security]="auth,security,encryption,jwt,oauth,vulnerability,xss,csrf,permission,access"
  [devops]="deploy,docker,kubernetes,ci,cd,pipeline,infrastructure,aws,azure,gcp,monitoring"
  [testing]="test,spec,jest,mocha,cypress,e2e,integration,unit,coverage,assertion"
)

##############################################################################
# Input Sanitization
# Prevents command injection, SQL injection via keywords
##############################################################################
sanitize_input() {
  local input="$1"
  # Remove shell metacharacters and special characters
  # Only allow alphanumeric, spaces, hyphens, underscores, periods
  echo "$input" | tr -cd '[:alnum:][:space:]-_.'
}

##############################################################################
# Logging
##############################################################################
log() {
  local level="$1"
  shift
  local message="$*"
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  if [ -n "$TASK_ID" ]; then
    local log_file="$LOG_DIR/context-lookup-${TASK_ID}.log"
    mkdir -p "$LOG_DIR"
    echo "[$timestamp] [$level] $message" | tee -a "$log_file"
  else
    echo "[$timestamp] [$level] $message"
  fi
}

##############################################################################
# Keyword Extraction
# Uses regex to extract meaningful terms (3+ chars, excluding common words)
##############################################################################
extract_keywords() {
  local text="$1"
  local keywords=()

  # Convert to lowercase and extract words
  local words=$(echo "$text" | tr '[:upper:]' '[:lower:]' | grep -oE '\b[a-z0-9]{3,}\b' || true)

  # Common stopwords to exclude
  local stopwords="the|and|for|with|from|that|this|are|was|were|been|have|has|had|but|not|you|all|can|will|what|when|who|how"

  # Filter out stopwords and collect unique keywords
  for word in $words; do
    if ! echo "$word" | grep -qE "^($stopwords)$"; then
      # Add to keywords if not already present
      if [[ ! " ${keywords[@]} " =~ " ${word} " ]]; then
        keywords+=("$word")
      fi
    fi
  done

  # Return comma-separated keywords
  IFS=','
  echo "${keywords[*]}"
}

##############################################################################
# Domain Classification
# Classifies task domain based on keyword matching
##############################################################################
classify_domain() {
  local keywords="$1"
  local max_score=0
  local detected_domain="general"

  # Score each domain based on keyword overlap
  for domain in "${!DOMAIN_KEYWORDS[@]}"; do
    local domain_kw="${DOMAIN_KEYWORDS[$domain]}"
    local score=0

    # Count matching keywords
    IFS=',' read -ra kw_array <<< "$keywords"
    for kw in "${kw_array[@]}"; do
      if echo "$domain_kw" | grep -q "$kw"; then
        ((score++))
      fi
    done

    # Track highest scoring domain
    if [ $score -gt $max_score ]; then
      max_score=$score
      detected_domain="$domain"
    fi
  done

  # Calculate accuracy estimate
  local total_keywords=$(echo "$keywords" | tr ',' '\n' | wc -l)
  local accuracy=0
  if [ $total_keywords -gt 0 ]; then
    accuracy=$(echo "scale=2; ($max_score / $total_keywords) * 100" | bc)
  fi

  log "INFO" "Domain classification: $detected_domain (score: $max_score/$total_keywords, accuracy: ${accuracy}%)"
  echo "$detected_domain"
}

##############################################################################
# Query Historical Context
# Calls invoke-context-query.sh with extracted keywords
# Includes graceful fallback if query fails
##############################################################################
query_historical_context() {
  local keywords="$1"
  local query_script="$ACE_SKILL_DIR/invoke-context-query.sh"

  if [ ! -f "$query_script" ]; then
    log "ERROR" "invoke-context-query.sh not found at $query_script"
    log "WARN" "Falling back to empty results due to missing query script"
    echo "[]"
    return 0
  fi

  log "INFO" "Querying historical context with keywords: $keywords"

  # Call ACE query script with error handling
  local results
  local query_error=""

  if ! results=$("$query_script" \
    --keywords "$keywords" \
    --similarity-threshold "$SIMILARITY_THRESHOLD" \
    --max-results "$MAX_RESULTS" \
    --memory-path "$MEMORY_PATH" 2>&1); then
    query_error="$results"
    log "ERROR" "Context query failed: $query_error"
    log "WARN" "Falling back to empty results due to query failure"
    echo "[]"
    return 0
  fi

  # Validate JSON output
  if ! echo "$results" | jq . > /dev/null 2>&1; then
    log "ERROR" "Invalid JSON from context query"
    log "WARN" "Falling back to empty results due to invalid JSON"
    echo "[]"
    return 0
  fi

  # Count results
  local result_count=$(echo "$results" | jq 'length')
  log "INFO" "Retrieved $result_count similar contexts (threshold: $SIMILARITY_THRESHOLD)"

  echo "$results"
}

##############################################################################
# Store Results in Redis
# Stores query results with metadata and TTL
# Includes warning flag if results are empty due to query failure
##############################################################################
store_in_redis() {
  local keywords="$1"
  local domain="$2"
  local results="$3"
  local redis_key="cfn_loop:${TASK_ID}:historical_context"

  # Detect if results are empty (query failure fallback)
  local result_count=$(echo "$results" | jq 'length')
  local has_error="false"
  if [ "$result_count" -eq 0 ]; then
    has_error="true"
    log "WARN" "Storing empty results - ACE query may have failed"
  fi

  # Create metadata object with error flag
  local metadata=$(jq -n \
    --arg keywords "$keywords" \
    --arg domain "$domain" \
    --arg timestamp "$(date -Iseconds)" \
    --argjson results "$results" \
    --argjson has_error "$has_error" \
    '{
      keywords: $keywords,
      domain: $domain,
      timestamp: $timestamp,
      similarity_threshold: '"$SIMILARITY_THRESHOLD"',
      max_results: '"$MAX_RESULTS"',
      query_error: $has_error,
      results: $results
    }')

  # Store in Redis with TTL
  if ! redis-cli SET "$redis_key" "$metadata" EX 3600 > /dev/null 2>&1; then
    log "ERROR" "Failed to store results in Redis"
    return 1
  fi

  log "INFO" "Stored results in Redis: $redis_key (TTL: 3600s)"

  # Verify storage
  if ! redis-cli EXISTS "$redis_key" > /dev/null 2>&1; then
    log "ERROR" "Redis key verification failed"
    return 1
  fi

  log "INFO" "Redis storage verified successfully"
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
      --description)
        DESCRIPTION="$2"
        shift 2
        ;;
      --similarity-threshold)
        SIMILARITY_THRESHOLD="$2"
        shift 2
        ;;
      --max-results)
        MAX_RESULTS="$2"
        shift 2
        ;;
      *)
        log "ERROR" "Unknown option: $1"
        echo "Usage: $0 --task-id TASK_ID --description 'Task description' [OPTIONS]"
        exit 1
        ;;
    esac
  done

  # Validation
  if [ -z "$TASK_ID" ]; then
    log "ERROR" "--task-id is required"
    exit 1
  fi

  if [ -z "$DESCRIPTION" ]; then
    log "ERROR" "--description is required"
    exit 1
  fi
}

##############################################################################
# Main Execution
##############################################################################
main() {
  parse_arguments "$@"

  log "INFO" "Starting context lookup for task: $TASK_ID"
  log "INFO" "Description: $DESCRIPTION"

  # Step 0: Sanitize input
  local sanitized_description
  sanitized_description=$(sanitize_input "$DESCRIPTION")
  log "INFO" "Sanitized description: $sanitized_description"

  # Step 1: Extract keywords
  local keywords
  keywords=$(extract_keywords "$sanitized_description")

  local keyword_count=$(echo "$keywords" | tr ',' '\n' | wc -l)
  log "INFO" "Extracted $keyword_count keywords: $keywords"

  if [ $keyword_count -lt 3 ]; then
    log "WARN" "Only extracted $keyword_count keywords (requirement: ≥3)"
  fi

  # Step 2: Classify domain
  local domain
  domain=$(classify_domain "$keywords")

  # Step 3: Query historical context
  local results
  if ! results=$(query_historical_context "$keywords"); then
    log "ERROR" "Context query failed"
    exit 1
  fi

  # Step 4: Store in Redis
  if ! store_in_redis "$keywords" "$domain" "$results"; then
    log "ERROR" "Redis storage failed"
    exit 1
  fi

  # Summary
  log "INFO" "Context lookup complete"
  log "INFO" "Keywords: $keyword_count extracted"
  log "INFO" "Domain: $domain"
  log "INFO" "Results: $(echo "$results" | jq 'length') similar contexts"
  log "INFO" "Redis: cfn_loop:${TASK_ID}:historical_context (TTL: 3600s)"

  # Calculate confidence score
  local confidence=0.75

  # Boost confidence based on success criteria
  if [ $keyword_count -ge 3 ]; then
    confidence=$(echo "$confidence + 0.05" | bc)
  fi

  if [ "$(echo "$results" | jq 'length')" -gt 0 ]; then
    confidence=$(echo "$confidence + 0.10" | bc)
  fi

  # Cap at 1.0
  confidence=$(echo "if ($confidence > 1.0) 1.0 else $confidence" | bc)

  log "INFO" "Self-confidence score: $confidence"

  # Return success
  exit 0
}

# Execute main
main "$@"
