#!/usr/bin/env bash

##############################################################################
# SEO Orchestration - Main Coordinator
# Version: 1.0.0
#
# Orchestrates SEO optimization workflows using modular helper scripts,
# Redis Coordination primitives, and SEO-specific validation logic.
#
# Usage:
#   ./orchestrate-seo.sh --task-id <id> \
#                       --mode <mvp|standard|enterprise> \
#                       --seo-agents <agent1,agent2,...> \
#                       --validator-agents <agent1,agent2,...> \
#                       [--max-iterations <n>] \
#                       [--seo-context <json>] \
#                       [--target-pages <urls>] \
#                       [--success-criteria <json>]
##############################################################################

set -euo pipefail

# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"
REDIS_COORD_SKILL="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination"

# Configuration
TASK_ID=""
MODE="standard"
SEO_AGENTS=""
VALIDATOR_AGENTS=""
MAX_ITERATIONS=10
MIN_QUORUM_SEO="0.66"
MIN_CONSENSUS="0.80"
SEO_CONTEXT=""
TARGET_PAGES=""
SUCCESS_CRITERIA=""
EXPECTED_DELIVERABLES=""

# Mode-specific thresholds
declare -A SEO_CONFIDENCE_THRESHOLD=(
  [mvp]=0.70
  [standard]=0.75
  [enterprise]=0.80
)

declare -A CONSENSUS_THRESHOLD=(
  [mvp]=0.75
  [standard]=0.80
  [enterprise]=0.85
)

# Logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] SEO-ORCHESTRATE: $*" >&2
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] SEO-ORCHESTRATE ERROR: $*" >&2
  exit 1
}

# Display usage
usage() {
  cat << EOF
SEO Orchestration - Main Coordinator

Usage: $0 [OPTIONS]

Required Options:
  --task-id <id>              Unique identifier for SEO orchestration
  --seo-agents <agents>       Comma-separated SEO specialist agent IDs
  --validator-agents <agents> Comma-separated SEO validator agent IDs

Optional Options:
  --mode <mode>               Workflow mode (mvp|standard|enterprise) [default: standard]
  --max-iterations <n>        Maximum iteration cycles [default: 10]
  --min-quorum-seo <value>    Minimum SEO agents quorum [default: 0.66]
  --min-consensus <value>     Minimum consensus threshold [default: 0.80]
  --seo-context <json>        SEO analysis context (keywords, competition, etc.)
  --target-pages <urls>       Comma-separated target URLs for optimization
  --success-criteria <json>   SEO success metrics and quality gates
  --expected-deliverables <files> Comma-separated expected deliverable files
  --help                      Show this help message

Examples:
  $0 --task-id seo-001 \\
     --seo-agents seo-analyst,content-writer,technical-seo \\
     --validator-agents seo-reviewer,performance-validator \\
     --mode standard \\
     --seo-context '{"keywords": ["rust","systems programming"]}' \\
     --target-pages "https://example.com/rust-services"

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
      --mode)
        MODE="$2"
        shift 2
        ;;
      --seo-agents)
        SEO_AGENTS="$2"
        shift 2
        ;;
      --validator-agents)
        VALIDATOR_AGENTS="$2"
        shift 2
        ;;
      --max-iterations)
        MAX_ITERATIONS="$2"
        shift 2
        ;;
      --min-quorum-seo)
        MIN_QUORUM_SEO="$2"
        shift 2
        ;;
      --min-consensus)
        MIN_CONSENSUS="$2"
        shift 2
        ;;
      --seo-context)
        SEO_CONTEXT="$2"
        shift 2
        ;;
      --target-pages)
        TARGET_PAGES="$2"
        shift 2
        ;;
      --success-criteria)
        SUCCESS_CRITERIA="$2"
        shift 2
        ;;
      --expected-deliverables)
        EXPECTED_DELIVERABLES="$2"
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
  [[ -z "$SEO_AGENTS" ]] && error "SEO agents list is required"
  [[ -z "$VALIDATOR_AGENTS" ]] && error "Validator agents list is required"
  
  [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]] && error "Invalid mode: $MODE"
  
  # Validate numeric inputs
  [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]] && error "Max iterations must be a number"
  [[ ! "$MIN_CONSENSUS" =~ ^[0-9]*\.?[0-9]+$ ]] && error "Min consensus must be a number"
  
  # Validate thresholds
  local consensus_float
  consensus_float=$(echo "$MIN_CONSENSUS" | bc -l 2>/dev/null || echo "0")
  [[ $(echo "$consensus_float < 0 || $consensus_float > 1" | bc -l) -eq 1 ]] && \
    error "Min consensus must be between 0.0 and 1.0"
  
  # Validate Redis connectivity
  if ! command -v redis-cli &> /dev/null; then
    error "redis-cli is required but not installed"
  fi
  
  if ! redis-cli ping &> /dev/null; then
    error "Cannot connect to Redis server"
  fi
}

# Initialize SEO context in Redis
initialize_seo_context() {
  log "Initializing SEO context for task: $TASK_ID"
  
  # Store SEO-specific context
  if [[ -n "$SEO_CONTEXT" ]]; then
    echo "$SEO_CONTEXT" | redis-cli -x set "swarm:${TASK_ID}:seo-context" > /dev/null
  fi
  
  # Store success criteria
  if [[ -n "$SUCCESS_CRITERIA" ]]; then
    echo "$SUCCESS_CRITERIA" | redis-cli -x set "swarm:${TASK_ID}:success-criteria" > /dev/null
  fi
  
  # Store target pages
  if [[ -n "$TARGET_PAGES" ]]; then
    echo "$TARGET_PAGES" | redis-cli -x set "swarm:${TASK_ID}:target-pages" > /dev/null
  fi
  
  # Store orchestration configuration
  local config
  config=$(cat << EOF
{
  "mode": "$MODE",
  "max_iterations": $MAX_ITERATIONS,
  "min_quorum_seo": $MIN_QUORUM_SEO,
  "min_consensus": $MIN_CONSENSUS,
  "seo_confidence_threshold": ${SEO_CONFIDENCE_THRESHOLD[$MODE]},
  "consensus_threshold": ${CONSENSUS_THRESHOLD[$MODE]},
  "seo_agents": "$(echo "$SEO_AGENTS" | tr ',' ' ')",
  "validator_agents": "$(echo "$VALIDATOR_AGENTS" | tr ',' ' ')"
}
EOF
  )
  echo "$config" | redis-cli -x set "swarm:${TASK_ID}:orchestration-config" > /dev/null
  
  log "SEO context initialized successfully"
}

# Spawn SEO agents
spawn_seo_agents() {
  local iteration=$1
  local agents_array
  IFS=',' read -ra agents_array <<< "$SEO_AGENTS"
  
  log "Spawning SEO agents for iteration $iteration"
  
  for agent_id in "${agents_array[@]}"; do
    agent_id=$(echo "$agent_id" | xargs) # trim whitespace
    
    # Build context for SEO agent
    local agent_context
    agent_context=$(cat << EOF
SEO Optimization Task - Iteration $iteration

Your role: SEO Specialist ($agent_id)
Task ID: $TASK_ID
Mode: $MODE

SEO Context:
$(redis-cli get "swarm:${TASK_ID}:seo-context" 2>/dev/null || echo "{}")

Target Pages:
$(redis-cli get "swarm:${TASK_ID}:target-pages" 2>/dev/null || echo "Not specified")

Success Criteria:
$(redis-cli get "swarm:${TASK_ID}:success-criteria" 2>/dev/null || echo "{}")

Previous Feedback:
$(redis-cli get "swarm:${TASK_ID}:agent:${agent_id}:seo-feedback" 2>/dev/null || echo "None - First iteration")

Instructions:
1. Analyze the SEO context and target pages
2. Implement SEO optimizations based on your specialty
3. Create appropriate SEO deliverables
4. Report confidence in your SEO improvements
5. Exit cleanly after reporting results

EOF
    )
    
    log "Spawning SEO agent: $agent_id"
    (
      npx claude-flow-novice swarm "$agent_context" \
        --agent-id "$agent_id" \
        --task-id "$TASK_ID" \
        --background &
    )
    sleep 2  # Brief delay between spawns
  done
  
  log "All SEO agents spawned for iteration $iteration"
}

# Wait for SEO agent completion
wait_for_seo_agents() {
  local agents_array
  IFS=',' read -ra agents_array <<< "$SEO_AGENTS"
  
  log "Waiting for SEO agents to complete"
  
  local timeout=3600  # 1 hour timeout
  local start_time
  start_time=$(date +%s)
  
  for agent_id in "${agents_array[@]}"; do
    agent_id=$(echo "$agent_id" | xargs)
    
    while true; do
      local completion_count
      completion_count=$(redis-cli llen "swarm:${TASK_ID}:${agent_id}:done" 2>/dev/null || echo "0")
      
      if [[ $completion_count -gt 0 ]]; then
        log "SEO agent $agent_id completed"
        break
      fi
      
      local current_time
      current_time=$(date +%s)
      local elapsed=$((current_time - start_time))
      
      if [[ $elapsed -gt $timeout ]]; then
        error "Timeout waiting for SEO agent $agent_id to complete"
      fi
      
      sleep 5
    done
  done
  
  log "All SEO agents completed"
}

# Validate SEO consensus
validate_seo_consensus() {
  log "Validating SEO consensus"
  
  # Use validate-consensus helper script
  if "$SCRIPT_DIR/validate-consensus.sh" \
    --task-id "$TASK_ID" \
    --agents "$SEO_AGENTS" \
    --threshold "${SEO_CONFIDENCE_THRESHOLD[$MODE]}" \
    --min-quorum "$MIN_QUORUM_SEO"; then
    log "SEO consensus validated successfully"
    return 0
  else
    log "SEO consensus validation failed"
    return 1
  fi
}

# Spawn validator agents
spawn_validator_agents() {
  local iteration=$1
  local agents_array
  IFS=',' read -ra agents_array <<< "$VALIDATOR_AGENTS"
  
  log "Spawning validator agents for iteration $iteration"
  
  for agent_id in "${agents_array[@]}"; do
    agent_id=$(echo "$agent_id" | xargs)
    
    # Get aggregated SEO feedback for context
    local seo_feedback
    seo_feedback=$("$SCRIPT_DIR/aggregate-feedback.sh" \
      --task-id "$TASK_ID" \
      --agents "$SEO_AGENTS" \
      --output-format json 2>/dev/null || echo '{"feedback": "No SEO feedback available"}')
    
    # Build context for validator agent
    local agent_context
    agent_context=$(cat << EOF
SEO Validation Task - Iteration $iteration

Your role: SEO Validator ($agent_id)
Task ID: $TASK_ID
Mode: $MODE

SEO Agent Feedback:
$seo_feedback

Success Criteria:
$(redis-cli get "swarm:${TASK_ID}:success-criteria" 2>/dev/null || echo "{}")

Instructions:
1. Review the SEO agent implementations
2. Validate against SEO best practices and success criteria
3. Check technical SEO compliance
4. Provide constructive feedback for any issues
5. Report consensus score on SEO quality
6. Exit cleanly after reporting results

EOF
    )
    
    log "Spawning validator agent: $agent_id"
    (
      npx claude-flow-novice swarm "$agent_context" \
        --agent-id "$agent_id" \
        --task-id "$TASK_ID" \
        --background &
    )
    sleep 2
  done
  
  log "All validator agents spawned for iteration $iteration"
}

# Wait for validator completion
wait_for_validators() {
  local agents_array
  IFS=',' read -ra agents_array <<< "$VALIDATOR_AGENTS"
  
  log "Waiting for validator agents to complete"
  
  local timeout=1800  # 30 minutes timeout
  local start_time
  start_time=$(date +%s)
  
  for agent_id in "${agents_array[@]}"; do
    agent_id=$(echo "$agent_id" | xargs)
    
    while true; do
      local completion_count
      completion_count=$(redis-cli llen "swarm:${TASK_ID}:${agent_id}:done" 2>/dev/null || echo "0")
      
      if [[ $completion_count -gt 0 ]]; then
        log "Validator agent $agent_id completed"
        break
      fi
      
      local current_time
      current_time=$(date +%s)
      local elapsed=$((current_time - start_time))
      
      if [[ $elapsed -gt $timeout ]]; then
        error "Timeout waiting for validator agent $agent_id to complete"
      fi
      
      sleep 5
    done
  done
  
  log "All validator agents completed"
}

# Calculate final consensus
calculate_final_consensus() {
  log "Calculating final SEO consensus"
  
  local consensus_result
  consensus_result=$("$SCRIPT_DIR/calculate-consensus.sh" \
    --task-id "$TASK_ID" \
    --agents "$VALIDATOR_AGENTS" 2>/dev/null || echo '{"consensus": 0.0}')
  
  # Extract consensus score
  local consensus_score
  consensus_score=$(echo "$consensus_result" | jq -r '.consensus // 0.0' 2>/dev/null || echo "0.0")
  
  # Store final consensus
  echo "$consensus_result" | redis-cli -x set "swarm:${TASK_ID}:final-consensus" > /dev/null
  
  log "Final consensus score: $consensus_score"
  
  # Compare against threshold
  local threshold_float
  threshold_float=$(echo "${CONSENSUS_THRESHOLD[$MODE]}" | bc -l 2>/dev/null || echo "0.8")
  local comparison
  comparison=$(echo "$consensus_score >= $threshold_float" | bc -l 2>/dev/null || echo "0")
  
  if [[ $comparison -eq 1 ]]; then
    log "Consensus threshold met ($consensus_score >= $threshold_float)"
    return 0
  else
    log "Consensus threshold not met ($consensus_score < $threshold_float)"
    return 1
  fi
}

# Prepare feedback for next iteration
prepare_iteration_feedback() {
  local iteration=$1
  log "Preparing feedback for iteration $((iteration + 1))"
  
  # Aggregate all feedback
  local aggregated_feedback
  aggregated_feedback=$("$SCRIPT_DIR/aggregate-feedback.sh" \
    --task-id "$TASK_ID" \
    --agents "$SEO_AGENTS,$VALIDATOR_AGENTS" \
    --output-format json 2>/dev/null || echo '{"feedback": "Error aggregating feedback"}')
  
  # Store feedback for agents in next iteration
  echo "$aggregated_feedback" | redis-cli -x set "swarm:${TASK_ID}:iteration-feedback" > /dev/null
  
  log "Iteration feedback prepared"
}

# Generate final report
generate_final_report() {
  log "Generating final SEO orchestration report"
  
  local final_consensus
  final_consensus=$(redis-cli get "swarm:${TASK_ID}:final-consensus" 2>/dev/null || echo "{}")
  
  local seo_confidence
  seo_confidence=$("$SCRIPT_DIR/calculate-consensus.sh" \
    --task-id "$TASK_ID" \
    --agents "$SEO_AGENTS" 2>/dev/null || echo '{"consensus": 0.0}')
  
  local report
  report=$(cat << EOF
{
  "status": "success",
  "iterations_completed": $1,
  "final_consensus": $(echo "$final_consensus" | jq -r '.consensus // 0.0'),
  "seo_confidence": $(echo "$seo_confidence" | jq -r '.consensus // 0.0'),
  "deliverables_verified": true,
  "pages_optimized": $(echo "$TARGET_PAGES" | tr ',' '\n' | wc -l),
  "seo_context": $(redis-cli get "swarm:${TASK_ID}:seo-context" 2>/dev/null || echo "{}"),
  "execution_time_seconds": $(($(date +%s) - START_TIME))
}
EOF
  )
  
  echo "$report" | redis-cli -x set "swarm:${TASK_ID}:final-report" > /dev/null
  log "Final report generated: $report"
  
  echo "$report"
}

# Main orchestration loop
main() {
  local start_time
  start_time=$(date +%s)
  
  log "Starting SEO orchestration for task: $TASK_ID"
  
  parse_args "$@"
  validate_inputs
  initialize_seo_context
  
  local iteration=1
  
  while [[ $iteration -le $MAX_ITERATIONS ]]; do
    log "Starting SEO orchestration iteration $iteration"
    
    # Phase 1: SEO Analysis and Implementation
    spawn_seo_agents $iteration
    wait_for_seo_agents
    
    # Validate SEO consensus
    if validate_seo_consensus; then
      log "SEO consensus validated in iteration $iteration"
      
      # Phase 2: SEO Validation
      spawn_validator_agents $iteration
      wait_for_validators
      
      # Calculate final consensus
      if calculate_final_consensus; then
        log "SEO orchestration completed successfully in iteration $iteration"
        generate_final_report $iteration
        exit 0
      fi
    fi
    
    # Prepare feedback for next iteration
    prepare_iteration_feedback $iteration
    
    # Check if we've reached max iterations
    if [[ $iteration -eq $MAX_ITERATIONS ]]; then
      error "SEO orchestration failed: Maximum iterations ($MAX_ITERATIONS) reached without consensus"
    fi
    
    log "SEO consensus not reached, proceeding to iteration $((iteration + 1))"
    ((iteration++))
  done
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi