#!/bin/bash
#
# Redis Coordination Pattern CLI Wrapper
#
# Enables agents to use Redis coordination patterns via simple CLI interface.
# Supports: chain, hierarchical, mesh, waiting, and wake patterns.
#
# Usage:
#   ./redis-pattern.sh --pattern chain --channel task-queue --message "data" --timeout 300
#   ./redis-pattern.sh --pattern waiting --channel task-queue --agent-id coder-1
#   ./redis-pattern.sh --pattern wake --channel task-queue --message "start"
#   ./redis-pattern.sh --pattern hierarchical --channel coordinator --agent-ids agent1,agent2,agent3
#   ./redis-pattern.sh --pattern mesh --channel validator --agent-ids agent1,agent2,agent3
#
# Exit codes:
#   0 - Success
#   1 - Error (validation, redis, etc.)
#   2 - Timeout

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEFAULT_TIMEOUT=300
DEFAULT_BLOCKING_TIMEOUT=0
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

output_json() {
  local status="$1"
  local data="$2"
  local error="${3:-}"

  jq -n \
    --arg status "$status" \
    --argjson data "$data" \
    --arg error "$error" \
    --arg timestamp "$(date +%s)" \
    '{
      status: $status,
      data: $data,
      error: $error,
      timestamp: ($timestamp | tonumber)
    }'
}

check_redis() {
  if ! command -v redis-cli &> /dev/null; then
    log_error "redis-cli not found. Please install Redis."
    log_info "Installation: https://redis.io/docs/getting-started/installation/"
    exit 1
  fi

  if ! redis-cli ping &> /dev/null; then
    log_error "Redis server not reachable at $REDIS_URL"
    log_info "Start Redis server: redis-server"
    exit 1
  fi
}

load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    log_info "Loaded configuration from $CONFIG_FILE"
  else
    log_warning "Configuration file not found: $CONFIG_FILE"
    log_info "Using default configuration"
  fi
}

show_usage() {
  cat <<EOF
Redis Coordination Pattern CLI Wrapper

USAGE:
  $(basename "$0") --pattern <pattern> [OPTIONS]

PATTERNS:
  chain         Sequential chain coordination (A → B → C)
  hierarchical  1:Many broadcast coordination (Coordinator → Multiple Agents)
  mesh          Many:1 aggregation coordination (Multiple Agents → Validator)
  waiting       Zero-token waiting mode (agent blocks until woken)
  wake          Wake up waiting agents

COMMON OPTIONS:
  --pattern <name>         Coordination pattern to use (REQUIRED)
  --channel <channel>      Redis channel/key name (REQUIRED)
  --message <data>         Message data to send (JSON string)
  --timeout <seconds>      Timeout in seconds (default: 300, 0 = infinite)
  --agent-id <id>          Agent identifier
  --task-id <id>           Task identifier
  --config <file>          Path to config file (default: ./config.json)
  --json                   Output JSON format
  --help                   Show this help message

PATTERN-SPECIFIC OPTIONS:

  Chain Pattern:
    --channel <channel>    Channel to push/pop from
    --message <data>       Data to push
    --timeout <seconds>    Wait timeout (default: 300)

  Hierarchical Pattern:
    --channel <channel>    Coordinator's output channel
    --agent-ids <ids>      Comma-separated agent IDs to broadcast to
    --message <data>       Data to broadcast

  Mesh Pattern:
    --channel <channel>    Aggregation channel
    --agent-ids <ids>      Comma-separated agent IDs to collect from
    --timeout <seconds>    Wait timeout per agent (default: 300)

  Waiting Pattern:
    --task-id <id>         Task identifier
    --agent-id <id>        Agent identifier
    --context <context>    Context string (e.g., "iteration-1")
    --timeout <seconds>    Wait timeout (0 = infinite, default)

  Wake Pattern:
    --task-id <id>         Task identifier
    --agent-id <id>        Agent identifier to wake
    --reason <reason>      Wake reason (cfn_loop_iteration, incomplete_work, etc.)
    --iteration <n>        Iteration number (optional)
    --feedback <items>     Comma-separated feedback items (optional)

EXAMPLES:

  # Chain: Agent pushes data and waits for next agent
  $(basename "$0") --pattern chain --channel "auth:coder:done" --message '{"status":"complete"}'

  # Chain: Agent waits for previous agent's data
  $(basename "$0") --pattern chain --channel "auth:researcher:done" --timeout 300

  # Hierarchical: Coordinator broadcasts to multiple agents
  $(basename "$0") --pattern hierarchical --channel "auth:researcher:done" \\
    --agent-ids "analyzer,architect,coder" --message '{"findings":"JWT recommended"}'

  # Mesh: Validator collects results from multiple agents
  $(basename "$0") --pattern mesh --channel "auth:validator" \\
    --agent-ids "coder,tester,reviewer" --timeout 300

  # Waiting: Agent enters waiting mode (zero token cost)
  $(basename "$0") --pattern waiting --task-id auth-system --agent-id coder-1 \\
    --context "iteration-1"

  # Wake: Coordinator wakes agent for next iteration
  $(basename "$0") --pattern wake --task-id auth-system --agent-id coder-1 \\
    --reason cfn_loop_iteration --iteration 2 --feedback "Add error handling,Improve tests"

EXIT CODES:
  0 - Success
  1 - Error (validation, redis connection, etc.)
  2 - Timeout exceeded

OUTPUT:
  Default: Human-readable text to stderr, data to stdout
  --json:  JSON object with status, data, error, and timestamp

EOF
}

# ============================================================================
# PATTERN IMPLEMENTATIONS
# ============================================================================

pattern_chain() {
  local channel="$1"
  local message="${2:-}"
  local timeout="${3:-$DEFAULT_TIMEOUT}"

  check_redis

  if [[ -n "$message" ]]; then
    # Push mode: Send message to channel
    log_info "Chain pattern: Pushing to channel '$channel'"

    echo "$message" | redis-cli -x LPUSH "$channel" >/dev/null

    log_success "Message pushed successfully"

    if [[ "$OUTPUT_JSON" == "true" ]]; then
      output_json "success" '{"action":"push","channel":"'"$channel"'"}' ""
    else
      echo "pushed"
    fi
  else
    # Pop mode: Wait for message from channel
    log_info "Chain pattern: Waiting on channel '$channel' (timeout: ${timeout}s)"

    local result
    if result=$(timeout "$timeout" redis-cli --csv BLPOP "$channel" 0 2>&1); then
      # BLPOP returns: "channel","message"
      # Extract message (second element)
      local extracted_message
      extracted_message=$(echo "$result" | awk -F',' '{print $2}' | sed 's/"//g')

      log_success "Message received from channel '$channel'"

      if [[ "$OUTPUT_JSON" == "true" ]]; then
        output_json "success" "$extracted_message" ""
      else
        echo "$extracted_message"
      fi
    else
      log_error "Timeout waiting for message on channel '$channel'"
      if [[ "$OUTPUT_JSON" == "true" ]]; then
        output_json "timeout" "null" "Timeout after ${timeout}s"
      fi
      exit 2
    fi
  fi
}

pattern_hierarchical() {
  local coordinator_channel="$1"
  local agent_ids="$2"
  local message="${3:-}"

  check_redis

  if [[ -z "$message" ]]; then
    log_error "Hierarchical pattern requires --message"
    exit 1
  fi

  log_info "Hierarchical pattern: Broadcasting from '$coordinator_channel' to agents"

  # Split agent IDs
  IFS=',' read -ra AGENTS <<< "$agent_ids"

  # Broadcast to each agent's inbox
  local broadcast_count=0
  for agent_id in "${AGENTS[@]}"; do
    agent_id=$(echo "$agent_id" | xargs)  # Trim whitespace
    local inbox_key="${coordinator_channel}:${agent_id}:inbox"

    echo "$message" | redis-cli -x LPUSH "$inbox_key" >/dev/null
    log_info "  Broadcasted to agent: $agent_id"
    ((broadcast_count++))
  done

  log_success "Broadcast complete: $broadcast_count agents"

  if [[ "$OUTPUT_JSON" == "true" ]]; then
    output_json "success" '{"action":"broadcast","agents":'"$broadcast_count"'}' ""
  else
    echo "broadcasted:$broadcast_count"
  fi
}

pattern_mesh() {
  local aggregation_channel="$1"
  local agent_ids="$2"
  local timeout="${3:-$DEFAULT_TIMEOUT}"

  check_redis

  log_info "Mesh pattern: Aggregating results from agents (timeout: ${timeout}s per agent)"

  # Split agent IDs
  IFS=',' read -ra AGENTS <<< "$agent_ids"

  local results=()
  local confidences=()

  for agent_id in "${AGENTS[@]}"; do
    agent_id=$(echo "$agent_id" | xargs)  # Trim whitespace
    local result_key="${aggregation_channel}:${agent_id}:result"

    log_info "  Waiting for agent: $agent_id"

    # Try BLPOP first (for first waiter), then fallback to GET (for persistent data)
    local result
    if result=$(redis-cli BLPOP "$result_key" "$timeout" 2>/dev/null); then
      # BLPOP succeeded
      local extracted_result
      extracted_result=$(echo "$result" | tail -n 1)
      results+=("$extracted_result")

      # Extract confidence if available
      if confidence=$(echo "$extracted_result" | jq -r '.confidence // empty' 2>/dev/null); then
        [[ -n "$confidence" ]] && confidences+=("$confidence")
      fi
    else
      # Fallback to GET (for hybrid LPUSH+SET pattern)
      log_info "    Trying persistent key: ${result_key}"
      local persistent_key="${aggregation_channel}:${agent_id}:result"

      for ((i=1; i<=timeout; i++)); do
        if result=$(redis-cli GET "$persistent_key" 2>/dev/null); then
          if [[ -n "$result" ]] && [[ "$result" != "(nil)" ]]; then
            results+=("$result")

            # Extract confidence if available
            if confidence=$(echo "$result" | jq -r '.confidence // empty' 2>/dev/null); then
              [[ -n "$confidence" ]] && confidences+=("$confidence")
            fi
            break
          fi
        fi
        sleep 1
      done

      if [[ ${#results[@]} -eq 0 ]] || [[ "${results[-1]}" == "" ]]; then
        log_warning "  Timeout waiting for agent: $agent_id"
      fi
    fi
  done

  # Calculate consensus if confidences available
  local consensus="null"
  if [[ ${#confidences[@]} -gt 0 ]]; then
    local sum=0
    for conf in "${confidences[@]}"; do
      sum=$(echo "$sum + $conf" | bc)
    done
    consensus=$(echo "scale=4; $sum / ${#confidences[@]}" | bc)
    log_info "Calculated consensus: $consensus"
  fi

  log_success "Aggregation complete: ${#results[@]} results collected"

  if [[ "$OUTPUT_JSON" == "true" ]]; then
    local results_json
    results_json=$(printf '%s\n' "${results[@]}" | jq -s '.')
    jq -n \
      --argjson results "$results_json" \
      --arg consensus "$consensus" \
      --arg count "${#results[@]}" \
      '{results: $results, consensus: ($consensus | tonumber), count: ($count | tonumber)}'
  else
    printf '%s\n' "${results[@]}"
    echo "consensus:$consensus"
  fi
}

pattern_waiting() {
  local task_id="$1"
  local agent_id="$2"
  local context="${3:-default}"
  local timeout="${4:-$DEFAULT_BLOCKING_TIMEOUT}"

  check_redis

  local ready_key="swarm:${task_id}:${agent_id}:ready"
  local wake_key="swarm:${task_id}:${agent_id}:wake"

  log_info "Waiting pattern: Agent '$agent_id' entering waiting mode"
  log_info "  Task: $task_id"
  log_info "  Context: $context"
  log_info "  Timeout: $([ "$timeout" -eq 0 ] && echo "infinite" || echo "${timeout}s")"

  # Publish ready status
  local ready_msg
  ready_msg=$(jq -n \
    --arg status "waiting" \
    --arg context "$context" \
    --arg ts "$(date +%s)" \
    '{status: $status, context: $context, timestamp: ($ts | tonumber)}')

  echo "$ready_msg" | redis-cli -x LPUSH "$ready_key" >/dev/null

  log_info "Agent ready, blocking on wake channel: $wake_key"
  log_success "Zero token cost while waiting..."

  # Block on wake channel
  local wake_result
  if [[ "$timeout" -eq 0 ]]; then
    wake_result=$(redis-cli BLPOP "$wake_key" 0 2>&1)
  else
    if ! wake_result=$(timeout "$timeout" redis-cli BLPOP "$wake_key" 0 2>&1); then
      log_error "Wake-up timeout exceeded"
      if [[ "$OUTPUT_JSON" == "true" ]]; then
        output_json "timeout" "null" "Wake-up timeout after ${timeout}s"
      fi
      exit 2
    fi
  fi

  # Parse wake message (BLPOP returns: key \n message)
  local wake_msg
  wake_msg=$(echo "$wake_result" | tail -n 1)

  log_success "Agent woken up!"

  if [[ "$OUTPUT_JSON" == "true" ]]; then
    output_json "success" "$wake_msg" ""
  else
    echo "$wake_msg"
  fi
}

pattern_wake() {
  local task_id="$1"
  local agent_id="$2"
  local reason="$3"
  local iteration="${4:-0}"
  local feedback="${5:-}"
  local task_desc="${6:-}"

  check_redis

  local wake_key="swarm:${task_id}:${agent_id}:wake"

  log_info "Wake pattern: Waking agent '$agent_id'"
  log_info "  Task: $task_id"
  log_info "  Reason: $reason"
  [[ -n "$iteration" ]] && [[ "$iteration" != "0" ]] && log_info "  Iteration: $iteration"

  # Build wake message
  local wake_msg
  wake_msg=$(jq -n \
    --arg reason "$reason" \
    --arg iteration "$iteration" \
    --arg task "$task_desc" \
    --arg feedback "$feedback" \
    --arg ts "$(date +%s)" \
    '{
      reason: $reason,
      iteration: ($iteration | tonumber),
      task: $task,
      feedback: ($feedback | split(",") | map(select(length > 0))),
      timestamp: ($ts | tonumber)
    }')

  echo "$wake_msg" | redis-cli -x LPUSH "$wake_key" >/dev/null

  log_success "Wake signal sent to agent '$agent_id'"

  if [[ "$OUTPUT_JSON" == "true" ]]; then
    output_json "success" '{"action":"wake","agentId":"'"$agent_id"'"}' ""
  else
    echo "woken:$agent_id"
  fi
}

# ============================================================================
# MAIN
# ============================================================================

main() {
  # Parse arguments
  local pattern=""
  local channel=""
  local message=""
  local timeout="$DEFAULT_TIMEOUT"
  local agent_id=""
  local agent_ids=""
  local task_id=""
  local context="default"
  local reason=""
  local iteration="0"
  local feedback=""
  local task_desc=""
  OUTPUT_JSON="false"

  while [[ $# -gt 0 ]]; do
    case $1 in
      --pattern)
        pattern="$2"
        shift 2
        ;;
      --channel)
        channel="$2"
        shift 2
        ;;
      --message)
        message="$2"
        shift 2
        ;;
      --timeout)
        timeout="$2"
        shift 2
        ;;
      --agent-id)
        agent_id="$2"
        shift 2
        ;;
      --agent-ids)
        agent_ids="$2"
        shift 2
        ;;
      --task-id)
        task_id="$2"
        shift 2
        ;;
      --context)
        context="$2"
        shift 2
        ;;
      --reason)
        reason="$2"
        shift 2
        ;;
      --iteration)
        iteration="$2"
        shift 2
        ;;
      --feedback)
        feedback="$2"
        shift 2
        ;;
      --task)
        task_desc="$2"
        shift 2
        ;;
      --config)
        CONFIG_FILE="$2"
        shift 2
        ;;
      --json)
        OUTPUT_JSON="true"
        shift
        ;;
      --help|-h)
        show_usage
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        show_usage
        exit 1
        ;;
    esac
  done

  # Load configuration
  load_config

  # Validate required arguments
  if [[ -z "$pattern" ]]; then
    log_error "Missing required argument: --pattern"
    show_usage
    exit 1
  fi

  # Execute pattern
  case "$pattern" in
    chain)
      if [[ -z "$channel" ]]; then
        log_error "Chain pattern requires --channel"
        exit 1
      fi
      pattern_chain "$channel" "$message" "$timeout"
      ;;

    hierarchical)
      if [[ -z "$channel" ]] || [[ -z "$agent_ids" ]]; then
        log_error "Hierarchical pattern requires --channel and --agent-ids"
        exit 1
      fi
      pattern_hierarchical "$channel" "$agent_ids" "$message"
      ;;

    mesh)
      if [[ -z "$channel" ]] || [[ -z "$agent_ids" ]]; then
        log_error "Mesh pattern requires --channel and --agent-ids"
        exit 1
      fi
      pattern_mesh "$channel" "$agent_ids" "$timeout"
      ;;

    waiting)
      if [[ -z "$task_id" ]] || [[ -z "$agent_id" ]]; then
        log_error "Waiting pattern requires --task-id and --agent-id"
        exit 1
      fi
      pattern_waiting "$task_id" "$agent_id" "$context" "$timeout"
      ;;

    wake)
      if [[ -z "$task_id" ]] || [[ -z "$agent_id" ]] || [[ -z "$reason" ]]; then
        log_error "Wake pattern requires --task-id, --agent-id, and --reason"
        exit 1
      fi
      pattern_wake "$task_id" "$agent_id" "$reason" "$iteration" "$feedback" "$task_desc"
      ;;

    *)
      log_error "Unknown pattern: $pattern"
      log_info "Available patterns: chain, hierarchical, mesh, waiting, wake"
      exit 1
      ;;
  esac
}

# Run main function
main "$@"
