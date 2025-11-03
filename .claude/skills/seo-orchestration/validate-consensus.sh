#!/usr/bin/env bash

##############################################################################
# SEO Consensus Validation Script
# Version: 1.0.0
#
# Validates SEO consensus scores against thresholds and quorum requirements.
# Used to determine if SEO optimizations meet quality standards.
##############################################################################

set -euo pipefail

# Configuration
TASK_ID=""
AGENTS=""
THRESHOLD="0.80"
MIN_QUORUM="0.66"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"

# Logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] SEO-VALIDATE-CONSENSUS: $*" >&2
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] SEO-VALIDATE-CONSENSUS ERROR: $*" >&2
  exit 1
}

# Display usage
usage() {
  cat << EOF
SEO Consensus Validation

Usage: $0 [OPTIONS]

Required Options:
  --task-id <id>          Unique identifier for SEO task
  --agents <agents>       Comma-separated list of SEO agent IDs
  --threshold <value>     Minimum confidence threshold (0.0-1.0)
  --min-quorum <value>    Minimum quorum (n, n%, or 0.n format)

Optional Options:
  --help                  Show this help message

Examples:
  $0 --task-id seo-001 --agents seo-analyst,content-writer --threshold 0.75 --min-quorum 0.66

EOF
}

# Parse command line arguments
parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --task-id)
        TASK_ID="$2"
        shift 2
        ;;
      --agents)
        AGENTS="$2"
        shift 2
        ;;
      --threshold)
        THRESHOLD="$2"
        shift 2
        ;;
      --min-quorum)
        MIN_QUORUM="$2"
        shift 2
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        error "Unknown option: $1. Use --help for usage information."
        ;;
    esac
  done
}

# Validate inputs
validate_inputs() {
  [[ -z "$TASK_ID" ]] && error "Task ID is required"
  [[ -z "$AGENTS" ]] && error "Agents list is required"
  [[ -z "$THRESHOLD" ]] && error "Threshold is required"
  [[ -z "$MIN_QUORUM" ]] && error "Min quorum is required"
  
  # Validate threshold
  if ! [[ "$THRESHOLD" =~ ^[0-9]*\.?[0-9]+$ ]]; then
    error "Threshold must be a numeric value between 0.0 and 1.0"
  fi
  
  local threshold_float
  threshold_float=$(echo "$THRESHOLD" | bc -l 2>/dev/null || echo "0")
  if [[ $(echo "$threshold_float < 0 || $threshold_float > 1" | bc -l) -eq 1 ]]; then
    error "Threshold must be between 0.0 and 1.0"
  fi
  
  # Check Redis connectivity
  if ! command -v redis-cli &> /dev/null; then
    error "redis-cli is required but not installed"
  fi
  
  if ! redis-cli ping &> /dev/null; then
    error "Cannot connect to Redis server"
  fi
}

# Calculate quorum requirement
calculate_quorum_requirement() {
  local total_agents=$1
  local min_quorum_spec="$2"
  
  # Parse quorum specification
  if [[ "$min_quorum_spec" =~ ^[0-9]+$ ]]; then
    # Absolute number
    echo "$min_quorum_spec"
  elif [[ "$min_quorum_spec" =~ ^([0-9]+)%$ ]]; then
    # Percentage
    local percentage="${BASH_REMATCH[1]}"
    local required
    required=$(echo "scale=0; ($total_agents * $percentage) / 100" | bc -l)
    echo "$required"
  elif [[ "$min_quorum_spec" =~ ^0\.[0-9]+$ ]]; then
    # Fraction
    local required
    required=$(echo "scale=0; $total_agents * $min_quorum_spec" | bc -l)
    echo "$required"
  else
    error "Invalid quorum specification: $min_quorum_spec"
  fi
}

# Collect agent confidence scores
collect_agent_scores() {
  local agents_array
  IFS=',' read -ra agents_array <<< "$AGENTS"
  
  local scores=()
  local completed_agents=()
  
  log "Collecting confidence scores from agents"
  
  for agent_id in "${agents_array[@]}"; do
    agent_id=$(echo "$agent_id" | xargs) # trim whitespace
    
    # Get confidence score from Redis
    local confidence_key="swarm:${TASK_ID}:${agent_id}:confidence"
    local confidence_score
    confidence_score=$(redis-cli get "$confidence_key" 2>/dev/null || echo "")
    
    if [[ -n "$confidence_score" ]] && [[ "$confidence_score" =~ ^[0-9]*\.?[0-9]+$ ]]; then
      scores+=("$confidence_score")
      completed_agents+=("$agent_id")
      log "Agent $agent_id confidence: $confidence_score"
    else
      log "Warning: No confidence score found for agent $agent_id"
    fi
  done
  
  # Store results in Redis for debugging
  printf '%s\n' "${completed_agents[@]}" | redis-cli -x set "swarm:${TASK_ID}:validated-agents" > /dev/null 2>&1 || true
  printf '%s\n' "${scores[@]}" | redis-cli -x set "swarm:${TASK_ID}:confidence-scores" > /dev/null 2>&1 || true
  
  # Return scores array
  printf '%s\n' "${scores[@]}"
}

# Validate consensus
validate_consensus() {
  local scores=("$@")
  
  if [[ ${#scores[@]} -eq 0 ]]; then
    error "No confidence scores available for validation"
  fi
  
  # Calculate required quorum
  local total_agents
  total_agents=$(echo "$AGENTS" | tr ',' '\n' | wc -l)
  local required_quorum
  required_quorum=$(calculate_quorum_requirement "$total_agents" "$MIN_QUORUM")
  
  log "Total agents: $total_agents, Required quorum: $required_quorum"
  log "Available scores: ${#scores[@]}"
  
  # Check quorum requirement
  if [[ ${#scores[@]} -lt $required_quorum ]]; then
    log "Consensus validation failed: Insufficient agent responses (${#scores[@]} < $required_quorum)"
    return 1
  fi
  
  # Calculate average confidence
  local sum=0.0
  local count=0
  
  for score in "${scores[@]}"; do
    sum=$(echo "$sum + $score" | bc -l)
    ((count++))
  done
  
  local average_confidence
  average_confidence=$(echo "scale=3; $sum / $count" | bc -l)
  
  log "Average confidence: $average_confidence, Threshold: $THRESHOLD"
  
  # Compare against threshold
  local comparison
  comparison=$(echo "$average_confidence >= $THRESHOLD" | bc -l 2>/dev/null || echo "0")
  
  # Store validation results
  local validation_result
  validation_result=$(cat << EOF
{
  "task_id": "$TASK_ID",
  "timestamp": "$(date -Iseconds)",
  "total_agents": $total_agents,
  "completed_agents": $count,
  "required_quorum": $required_quorum,
  "quorum_met": $([[ $count -ge $required_quorum ]] && echo "true" || echo "false"),
  "confidence_scores": [$(IFS=','; echo "${scores[*]}")],
  "average_confidence": $average_confidence,
  "threshold": $THRESHOLD,
  "threshold_met": $([[ $comparison -eq 1 ]] && echo "true" || echo "false"),
  "consensus_validated": $([[ $comparison -eq 1 ]] && echo "true" || echo "false")
}
EOF
  )
  
  echo "$validation_result" | redis-cli -x set "swarm:${TASK_ID}:consensus-validation" > /dev/null
  log "Validation result stored: $validation_result"
  
  if [[ $comparison -eq 1 ]]; then
    log "SEO consensus validation PASSED (average: $average_confidence >= threshold: $THRESHOLD)"
    return 0
  else
    log "SEO consensus validation FAILED (average: $average_confidence < threshold: $THRESHOLD)"
    return 1
  fi
}

# Main function
main() {
  parse_args "$@"
  validate_inputs
  
  log "Starting SEO consensus validation for task: $TASK_ID"
  
  # Collect agent scores
  local scores_array
  readarray -t scores_array < <(collect_agent_scores)
  
  # Validate consensus
  if validate_consensus "${scores_array[@]}"; then
    log "SEO consensus validation completed successfully"
    exit 0
  else
    log "SEO consensus validation failed"
    exit 1
  fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi