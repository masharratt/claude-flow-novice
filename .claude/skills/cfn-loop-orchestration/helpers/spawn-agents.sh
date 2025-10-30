#!/usr/bin/env bash

##############################################################################
# Agent Spawning Helper with Context Injection - ACE System Phase 1.4
# Spawns Loop 3 agents with enriched historical context from Redis
#
# Usage:
#   ./spawn-agents.sh --task-id TASK_ID --iteration N --agents AGENTS --original-context '{...}'
#
# Arguments:
#   --task-id           Unique task identifier (required)
#   --iteration         Current iteration number (required)
#   --agents            Comma-separated list of agent types (required)
#   --original-context  Original task context string (required)
#
# Output:
#   Spawns agents in background with enriched context
#   Returns: 0 on success, 1 on failure
#   Logs to: .artifacts/logs/spawn-agents-{TASK_ID}.log
#
# Performance:
#   - Target injection overhead: < 200ms per agent
#   - Graceful fallback to original context on injection failure
##############################################################################

set -euo pipefail

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# Default values
TASK_ID=""
ITERATION=""
AGENTS=""
ORIGINAL_CONTEXT=""
LOG_DIR="$PROJECT_ROOT/.artifacts/logs"
REDIS_COORD_SKILL="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

##############################################################################
# Logging Functions
##############################################################################

log_info() {
  local message="$1"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $message" | tee -a "$LOG_DIR/spawn-agents-${TASK_ID}.log"
}

log_warn() {
  local message="$1"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] $message" | tee -a "$LOG_DIR/spawn-agents-${TASK_ID}.log"
}

log_error() {
  local message="$1"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $message" | tee -a "$LOG_DIR/spawn-agents-${TASK_ID}.log"
}

##############################################################################
# Helper Functions
##############################################################################

sanitize_input() {
  local input="$1"
  # Remove dangerous characters (only allow alphanumeric, dash, underscore, dot, comma, colon)
  echo "$input" | sed 's/[^a-zA-Z0-9._:,-]//g'
}

enrich_context_for_agent() {
  local task_id="$1"
  local agent_type="$2"
  local original_context="$3"

  # Measure injection time
  local start_time=$(date +%s%3N)

  # Call context-injection.sh
  local enriched_context
  enriched_context=$("$SCRIPT_DIR/context-injection.sh" \
    --task-id "$task_id" \
    --agent-type "$agent_type" \
    --original-context "$original_context" 2>&1)

  local exit_code=$?
  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))

  # Check if injection succeeded
  if [ $exit_code -eq 0 ] && echo "$enriched_context" | jq . >/dev/null 2>&1; then
    # Validate JSON structure
    if echo "$enriched_context" | jq -e '.historical_context' >/dev/null 2>&1; then
      log_info "Context injection successful for $agent_type: ${duration}ms"

      # Log context size
      local hist_size=$(echo "$enriched_context" | jq -r '.historical_context' | wc -c)
      log_injection_metrics "$agent_type" "$duration" "$hist_size"

      # Warn if injection is slow
      if [ "$duration" -gt 200 ]; then
        log_warn "Context injection exceeded 200ms threshold: ${duration}ms"
      fi

      echo "$enriched_context"
      return 0
    fi
  fi

  # Injection failed - log and return original context
  log_warn "Context injection failed for $agent_type, using original context"
  echo "$original_context"
  return 1
}

log_injection_metrics() {
  local agent="$1"
  local duration_ms="$2"
  local context_size="$3"

  log_info "Agent $agent metrics: injection ${duration_ms}ms, historical ${context_size} chars"
}

##############################################################################
# Main Spawning Function
##############################################################################

spawn_agents_with_context() {
  local task_id="$1"
  local iteration="$2"
  local agents="$3"
  local original_context="$4"

  log_info "Starting agent spawning with context injection"
  log_info "Task ID: $task_id, Iteration: $iteration"

  # Convert comma-separated agents to array
  IFS=',' read -ra AGENT_ARRAY <<< "$agents"

  # Track agent instance counts for unique ID generation
  declare -A AGENT_INSTANCE_COUNTS

  # Spawn each agent
  local spawned_count=0
  local injection_success_count=0

  for agent_type in "${AGENT_ARRAY[@]}"; do
    # Trim whitespace
    agent_type=$(echo "$agent_type" | xargs)

    # Generate unique agent ID (agent-type-iteration-instance)
    AGENT_INSTANCE_COUNTS["$agent_type"]=$((${AGENT_INSTANCE_COUNTS["$agent_type"]:-0} + 1))
    INSTANCE_NUM="${AGENT_INSTANCE_COUNTS["$agent_type"]}"
    UNIQUE_AGENT_ID="${agent_type}-${iteration}-${INSTANCE_NUM}"

    log_info "Spawning agent: $agent_type (ID: $UNIQUE_AGENT_ID)"

    # Sanitize inputs
    local safe_agent_type safe_task_id safe_agent_id
    safe_agent_type=$(sanitize_input "$agent_type") || {
      log_error "Failed to sanitize agent type: $agent_type"
      continue
    }
    safe_task_id=$(sanitize_input "$task_id") || {
      log_error "Failed to sanitize task ID: $task_id"
      continue
    }
    safe_agent_id=$(sanitize_input "$UNIQUE_AGENT_ID") || {
      log_error "Failed to sanitize agent ID: $UNIQUE_AGENT_ID"
      continue
    }

    # Enrich context with historical data
    local context_to_use
    context_to_use=$(enrich_context_for_agent "$safe_task_id" "$safe_agent_type" "$original_context")
    local injection_status=$?

    if [ $injection_status -eq 0 ]; then
      ((injection_success_count++))
    fi

    # Spawn agent in background with enriched context
    npx claude-flow-novice agent "$safe_agent_type" \
      --task-id "$safe_task_id" \
      --agent-id "$safe_agent_id" \
      --iteration "$iteration" \
      --context "$context_to_use" &

    # Store PID for monitoring
    AGENT_PID=$!
    "$REDIS_COORD_SKILL/store-context.sh" \
      --task-id "$task_id" \
      --key "${UNIQUE_AGENT_ID}:pid" \
      --value "{\"pid\": $AGENT_PID}" \
      --namespace "swarm" >/dev/null

    # Store agent ID mapping for later retrieval
    redis-cli SADD "swarm:${task_id}:loop3:agent_ids:iteration${iteration}" "$UNIQUE_AGENT_ID" >/dev/null

    log_info "Agent $safe_agent_type spawned (PID: $AGENT_PID)"
    ((spawned_count++))
  done

  # Log summary
  log_info "Agent spawning complete: $spawned_count agents spawned"
  log_info "Context injection success rate: $injection_success_count/$spawned_count"

  if [ "$spawned_count" -eq 0 ]; then
    log_error "No agents were spawned"
    return 1
  fi

  return 0
}

##############################################################################
# Argument Parsing
##############################################################################

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --task-id)
        TASK_ID="$2"
        shift 2
        ;;
      --iteration)
        ITERATION="$2"
        shift 2
        ;;
      --agents)
        AGENTS="$2"
        shift 2
        ;;
      --original-context)
        ORIGINAL_CONTEXT="$2"
        shift 2
        ;;
      *)
        echo "Unknown argument: $1"
        exit 1
        ;;
    esac
  done

  # Validate required arguments
  if [ -z "$TASK_ID" ] || [ -z "$ITERATION" ] || [ -z "$AGENTS" ] || [ -z "$ORIGINAL_CONTEXT" ]; then
    echo "Error: Missing required arguments"
    echo "Usage: $0 --task-id TASK_ID --iteration N --agents AGENTS --original-context CONTEXT"
    exit 1
  fi
}

##############################################################################
# Main Execution
##############################################################################

main() {
  parse_arguments "$@"

  # Execute spawning with context injection
  spawn_agents_with_context "$TASK_ID" "$ITERATION" "$AGENTS" "$ORIGINAL_CONTEXT"

  exit $?
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
