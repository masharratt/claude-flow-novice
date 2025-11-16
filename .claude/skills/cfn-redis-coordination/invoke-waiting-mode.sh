#!/bin/bash
#
# Invoke Waiting Mode - Agent Coordination for CFN Loop
# Purpose: Handle coordination between agents using waiting mode and collection
# Usage: invoke-waiting-mode.sh <collect|wait|signal> [task-id] [agent-id] [timeout]
#

set -euo pipefail

# Source centralized Redis functions (provides graceful fallback for Task mode)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/redis-functions.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REDIS_COORD_SKILL="$SCRIPT_DIR"

# Parse arguments
COMMAND=${1:-"collect"}
TASK_ID=${2:-""}
AGENT_ID=${3:-""}
TIMEOUT=${4:-120}

# Redis configuration
REDIS_HOST=${REDIS_HOST:-"localhost"}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_DB=${REDIS_DB:-0}

# Debug output
DEBUG=${DEBUG:-false}
if [[ "$DEBUG" == "true" ]]; then
    echo "DEBUG: invoke-waiting-mode called with: $*" >&2
    echo "DEBUG: REDIS_HOST=$REDIS_HOST, REDIS_PORT=$REDIS_PORT, REDIS_DB=$REDIS_DB" >&2
fi

# Function to connect to Redis with error handling
redis_cmd() {
    local cmd="$1"
    shift

    if command -v redis-cli >/dev/null 2>&1; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" "$cmd" "$@" 2>/dev/null
    else
        echo "Warning: redis-cli not available, using mock mode" >&2
        return 0
    fi
}

# Function to collect agent signals
collect_signals() {
    local task_id="$1"
    local agent_type="$2"
    local timeout="${3:-120}"

    echo "📡 Collecting ${agent_type} signals for task: $task_id (timeout: ${timeout}s)" >&2

    local signals_key="swarm:${task_id}:signals:${agent_type}"
    local start_time=$(date +%s)
    local signals_collected=()

    while true; do
        # Get all available signals
        local signals=($(redis_cmd SMEMBERS "$signals_key" 2>/dev/null || echo ""))

        if [[ ${#signals[@]} -gt 0 ]]; then
            for signal in "${signals[@]}"; do
                if [[ ! " ${signals_collected[@]} " =~ " ${signal} " ]]; then
                    signals_collected+=("$signal")
                    echo "  ✓ Signal collected: $signal" >&2

                    # Get detailed signal data
                    local signal_key="swarm:${task_id}:agent:${signal}:data"
                    local signal_data=$(redis_cmd HGETALL "$signal_key" 2>/dev/null || echo "")

                    if [[ -n "$signal_data" ]]; then
                        echo "    Data: $signal_data" >&2
                    fi
                fi
            done
        fi

        # Check if we have all expected signals (this would be based on agent count)
        local expected_signals=${EXPECTED_AGENTS:-1}
        if [[ ${#signals_collected[@]} -ge $expected_signals ]]; then
            echo "✅ All signals collected" >&2
            break
        fi

        # Check timeout
        local current_time=$(date +%s)
        if [[ $((current_time - start_time)) -ge $timeout ]]; then
            echo "⚠️ Timeout reached, proceeding with collected signals" >&2
            break
        fi

        sleep 2
    done

    # Return collected signals as JSON
    local json_output="{"
    json_output+="\"task_id\":\"$task_id\","
    json_output+="\"agent_type\":\"$agent_type\","
    json_output+="\"signals\":["

    for i in "${!signals_collected[@]}"; do
        if [[ $i -gt 0 ]]; then
            json_output+=","
        fi
        json_output+='"'"${signals_collected[$i]}"'"'
    done

    json_output+="],"
    json_output+="\"count\":${#signals_collected[@]},"
    json_output+="\"timeout\":$timeout"
    json_output+="}"

    echo "$json_output"
}

# Function to wait for specific condition
wait_for_signal() {
    local task_id="$1"
    local condition="$2"
    local timeout="${3:-120}"

    echo "⏳ Waiting for signal: $condition (timeout: ${timeout}s)" >&2

    local start_time=$(date +%s)
    local condition_key="swarm:${task_id}:condition:${condition}"

    while true; do
        local condition_met=$(redis_cmd GET "$condition_key" 2>/dev/null || echo "")

        if [[ "$condition_met" == "true" ]]; then
            echo "✅ Condition met: $condition" >&2
            redis_cmd DEL "$condition_key" 2>/dev/null
            echo "true"
            return 0
        fi

        # Check timeout
        local current_time=$(date +%s)
        if [[ $((current_time - start_time)) -ge $timeout ]]; then
            echo "⚠️ Timeout waiting for: $condition" >&2
            echo "false"
            return 1
        fi

        sleep 2
    done
}

# Function to signal completion
signal_completion() {
    local task_id="$1"
    local agent_id="$2"
    local status="${3:-complete}"

    echo "📤 Signaling completion: $agent_id -> $status" >&2

    # Add to completed set
    redis_cmd SADD "swarm:${task_id}:completed" "$agent_id" 2>/dev/null || true

    # Set completion status
    redis_cmd HSET "swarm:${task_id}:agent:${agent_id}:status" "status" "$status" 2>/dev/null || true
    redis_cmd HSET "swarm:${task_id}:agent:${agent_id}:status" "completed_at" "$(date +%s)" 2>/dev/null || true

    # Broadcast completion signal
    redis_cmd PUBLISH "swarm:${task_id}:signals" "agent:$agent_id:status:$status" 2>/dev/null || true

    echo "✅ Signal sent: $agent_id completed"
}

# Main command routing
case "$COMMAND" in
    "collect")
        if [[ -z "$TASK_ID" ]]; then
            echo "Error: collect command requires task-id" >&2
            echo "Usage: $0 collect <task-id> <agent-type> [timeout]" >&2
            exit 1
        fi
        collect_signals "$TASK_ID" "${AGENT_ID:-"loop3"}" "$TIMEOUT"
        ;;
    "wait")
        if [[ -z "$TASK_ID" ]] || [[ -z "$AGENT_ID" ]]; then
            echo "Error: wait command requires task-id and condition" >&2
            echo "Usage: $0 wait <task-id> <condition> [timeout]" >&2
            exit 1
        fi
        wait_for_signal "$TASK_ID" "$AGENT_ID" "$TIMEOUT"
        ;;
    "signal")
        if [[ -z "$TASK_ID" ]] || [[ -z "$AGENT_ID" ]]; then
            echo "Error: signal command requires task-id and agent-id" >&2
            echo "Usage: $0 signal <task-id> <agent-id> [status]" >&2
            exit 1
        fi
        signal_completion "$TASK_ID" "$AGENT_ID" "$TIMEOUT"
        ;;
    "help"|"-h"|"--help")
        cat <<EOF
Usage: $0 <command> [arguments]

Commands:
  collect <task-id> <agent-type> [timeout]   Collect signals from agents
  wait <task-id> <condition> [timeout]       Wait for condition to be met
  signal <task-id> <agent-id> [status]       Signal agent completion

Examples:
  $0 collect cfn-cli-12345 loop3 300
  $0 wait cfn-cli-12345 gate-passed 60
  $0 signal cfn-cli-12345 backend-developer-1 complete

Environment Variables:
  REDIS_HOST    Redis host (default: localhost)
  REDIS_PORT    Redis port (default: 6379)
  REDIS_DB      Redis database (default: 0)
  DEBUG         Enable debug output (true/false)
EOF
        ;;
    *)
        echo "Error: Unknown command '$COMMAND'" >&2
        echo "Use '$0 help' for usage information" >&2
        exit 1
        ;;
esac