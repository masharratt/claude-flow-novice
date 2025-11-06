#!/bin/bash
# CFN CLI Mode Coordination - Safe Redis Operations for CLI Mode Only
# Part of ANTI-023 Memory Leak Protection System

set -euo pipefail

# Source mode detection
MODE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${MODE_SCRIPT_DIR}/mode-detection.sh"

# CLI Mode Redis Coordination Script

# Default Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_TIMEOUT="${REDIS_TIMEOUT:-30}"

# Safe Redis Connection Check
redis_check_connection() {
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
        echo "❌ Redis connection failed: $REDIS_HOST:$REDIS_PORT" >&2
        return 1
    fi
    echo "✅ Redis connection: $REDIS_HOST:$REDIS_PORT" >&2
    return 0
}

# LPUSH wrapper with timeout and error handling
redis_lpush_safe() {
    local key="$1"
    local value="$2"
    local timeout="${3:-$REDIS_TIMEOUT}"

    if ! redis_check_connection; then
        echo "❌ Cannot LPUSH - Redis connection failed" >&2
        return 1
    fi

    # Use timeout to prevent hanging
    if timeout "$timeout" redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "$key" "$value" > /dev/null; then
        echo "✅ LPUSH successful: $key <- $value" >&2
        return 0
    else
        echo "❌ LPUSH failed: $key <- $value (timeout: $timeout)" >&2
        return 1
    fi
}

# BLPOP wrapper with timeout and error handling
redis_blpop_safe() {
    local key="$1"
    local timeout="${2:-$REDIS_TIMEOUT}"
    local output_file="${3:-/tmp/blpop_output}"

    if ! redis_check_connection; then
        echo "❌ Cannot BLPOP - Redis connection failed" >&2
        return 1
    fi

    # Execute BLPOP with timeout and capture output
    if timeout "$timeout" redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BLPOP "$key" "$timeout" > "$output_file"; then
        local result=$(cat "$output_file")
        echo "✅ BLPOP successful: $key" >&2
        echo "$result"
        return 0
    else
        echo "❌ BLPOP failed: $key (timeout: $timeout)" >&2
        return 1
    fi
}

# HSET wrapper with error handling
redis_hset_safe() {
    local key="$1"
    shift
    local data=("$@")

    if ! redis_check_connection; then
        echo "❌ Cannot HSET - Redis connection failed" >&2
        return 1
    fi

    # Build HSET command
    local hset_cmd="redis-cli -h \"$REDIS_HOST\" -p \"$REDIS_PORT\" HSET \"$key\""
    local first=true

    for item in "${data[@]}"; do
        if [[ "$first" == true ]]; then
            first=false
        else
            hset_cmd+=" "
        fi
        hset_cmd+="\"$item\""
    done

    if eval "$hset_cmd" > /dev/null; then
        echo "✅ HSET successful: $key" >&2
        return 0
    else
        echo "❌ HSET failed: $key" >&2
        return 1
    fi
}

# GET wrapper with error handling
redis_get_safe() {
    local key="$1"
    local output_file="${2:-/tmp/redis_get_output}"

    if ! redis_check_connection; then
        echo "❌ Cannot GET - Redis connection failed" >&2
        return 1
    fi

    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "$key" > "$output_file"; then
        local result=$(cat "$output_file")
        echo "✅ GET successful: $key" >&2
        echo "$result"
        return 0
    else
        echo "❌ GET failed: $key" >&2
        return 1
    fi
}

# EXPIRE wrapper with error handling
redis_expire_safe() {
    local key="$1"
    local seconds="$2"

    if ! redis_check_connection; then
        echo "❌ Cannot EXPIRE - Redis connection failed" >&2
        return 1
    fi

    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EXPIRE "$key" "$seconds" > /dev/null; then
        echo "✅ EXPIRE successful: $key -> $seconds seconds" >&2
        return 0
    else
        echo "❌ EXPIRE failed: $key -> $seconds seconds" >&2
        return 1
    fi
}

# HEXPIRE wrapper (Redis 6.2+) with error handling
redis_hexpire_safe() {
    local key="$1"
    local seconds="$2"

    if ! redis_check_connection; then
        echo "❌ Cannot HEXPIRE - Redis connection failed" >&2
        return 1
    fi

    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EXPIRE "$key" "$seconds" > /dev/null; then
        echo "✅ HEXPIRE successful: $key -> $seconds seconds" >&2
        return 0
    else
        echo "❌ HEXPIRE failed: $key -> $seconds seconds" >&2
        return 1
    fi
}

# DEL wrapper with error handling
redis_del_safe() {
    local key="$1"

    if ! redis_check_connection; then
        echo "❌ Cannot DEL - Redis connection failed" >&2
        return 1
    fi

    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$key" > /dev/null; then
        echo "✅ DEL successful: $key" >&2
        return 0
    else
        echo "❌ DEL failed: $key" >&2
        return 1
    fi
}

# Coordination Functions

# Signal agent completion
cfn_signal_agent_complete() {
    local task_id="$1"
    local agent_id="$2"

    if ! is_cli_mode; then
        echo "❌ Agent completion signaling requires CLI mode" >&2
        return 1
    fi

    local key="swarm:${task_id}:${agent_id}:done"
    redis_lpush_safe "$key" "complete"
}

# Store agent confidence score
cfn_store_agent_confidence() {
    local task_id="$1"
    local agent_id="$2"
    local confidence="$3"

    if ! is_cli_mode; then
        echo "❌ Confidence storage requires CLI mode" >&2
        return 1
    fi

    if ! awk -v conf="$confidence" 'BEGIN { if (conf < 0 || conf > 1) exit 1 }'; then
        echo "❌ Invalid confidence value: $confidence (must be 0.0-1.0)" >&2
        return 1
    fi

    local key="swarm:${task_id}:${agent_id}:confidence"
    redis_lpush_safe "$key" "$confidence"
    redis_expire_safe "$key" 3600
}

# Store agent result
cfn_store_agent_result() {
    local task_id="$1"
    local agent_id="$2"
    local confidence="$3"
    local iteration="${4:-1}"

    if ! is_cli_mode; then
        echo "❌ Result storage requires CLI mode" >&2
        return 1
    fi

    if ! awk -v conf="$confidence" 'BEGIN { if (conf < 0 || conf > 1) exit 1 }'; then
        echo "❌ Invalid confidence value: $confidence (must be 0.0-1.0)" >&2
        return 1
    fi

    local key="swarm:${task_id}:${agent_id}:result"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    redis_hset_safe "$key" \
        "confidence" "$confidence" \
        "iteration" "$iteration" \
        "timestamp" "$timestamp" \
        "agent_id" "$agent_id" \
        "task_id" "$task_id"

    redis_expire_safe "$key" 3600
}

# Wait for agent completion
cfn_wait_for_agent_completion() {
    local task_id="$1"
    local agent_id="$2"
    local timeout="${3:-300}"  # 5 minutes default

    if ! is_cli_mode; then
        echo "❌ Agent completion waiting requires CLI mode" >&2
        return 1
    fi

    local key="swarm:${task_id}:${agent_id}:done"
    local output_file="/tmp/agent_completion_${task_id}_${agent_id}"

    echo "⏳ Waiting for agent $agent_id completion (timeout: ${timeout}s)..." >&2

    if redis_blpop_safe "$key" "$timeout" "$output_file"; then
        local result=$(cat "$output_file")
        echo "✅ Agent $agent_id completed: $result" >&2
        return 0
    else
        echo "❌ Agent $agent_id completion timeout" >&2
        return 1
    fi
}

# Collect confidence scores
cfn_collect_confidence_scores() {
    local task_id="$1"
    local agent_ids="$2"
    local threshold="${3:-0.75}"
    local min_quorum="${4:-1}"

    if ! is_cli_mode; then
        echo "❌ Confidence score collection requires CLI mode" >&2
        return 1
    fi

    local confidence_scores=()
    local valid_scores=0
    local total_scores=0

    # Convert comma-separated agent IDs to array
    IFS=',' read -ra AGENT_ARRAY <<< "$agent_ids"

    for agent_id in "${AGENT_ARRAY[@]}"; do
        agent_id=$(echo "$agent_id" | xargs)  # Trim whitespace
        local key="swarm:${task_id}:${agent_id}:confidence"

        # Try to get confidence score
        local confidence_output=$(redis_get_safe "$key" /tmp/confidence_${agent_id} 2>/dev/null || echo "null")

        if [[ "$confidence_output" != "null" ]]; then
            local confidence=$(echo "$confidence_output" | grep -o '[0-9]*\.[0-9]*' | head -1 || echo "0.0")
            confidence_scores+=("$agent_id:$confidence")
            valid_scores=$((valid_scores + 1))
        else
            confidence_scores+=("$agent_id:0.0")
        fi

        total_scores=$((total_scores + 1))
    done

    # Calculate average confidence
    local total_confidence=0
    local count=0

    for score in "${confidence_scores[@]}"; do
        local confidence=$(echo "$score" | cut -d':' -f2)
        total_confidence=$(awk "BEGIN {print $total_confidence + $confidence}")
        count=$((count + 1))
    done

    local average_confidence=0.0
    if [[ $count -gt 0 ]]; then
        average_confidence=$(awk "BEGIN {print $total_confidence / $count}")
    fi

    # Check gate criteria
    local passes_gate=true
    if (( valid_scores < min_quorum )); then
        passes_gate=false
        echo "❌ Gate failed: Only $valid_scores scores found, need $min_quorum" >&2
    elif (( $(awk "BEGIN {print ($average_confidence < $threshold)}") )); then
        passes_gate=false
        echo "❌ Gate failed: Average confidence $average_confidence < $threshold" >&2
    else
        echo "✅ Gate passed: Average confidence $average_confidence >= $threshold" >&2
    fi

    # Output results
    local output="{"
    output+='"average_confidence": '"$average_confidence"','
    output+='"valid_scores": '"$valid_scores"','
    output+='"total_scores": '"$total_scores"','
    output+='"threshold": '"$threshold"','
    output+='"passes_gate': $passes_gate','
    output+='"agent_scores": ['
    local first=true
    for score in "${confidence_scores[@]}"; do
        if [[ "$first" == true ]]; then
            first=false
        else
            output+=","
        fi
        output+="$score"
    done
    output+="]}"

    echo "$output"
}

# Cleanup old task data
cfn_cleanup_task_data() {
    local task_id="$1"
    local max_age="${2:-86400}"  # 24 hours default

    if ! is_cli_mode; then
        echo "❌ Task cleanup requires CLI mode" >&2
        return 1
    fi

    echo "🧹 Cleaning up task data: $task_id (max age: ${max_age}s)" >&2

    # Find and delete old task keys
    local keys_to_delete=()
    local key_patterns=(
        "swarm:${task_id}:*"
        "cfn_loop:${task_id}:*"
        "task:${task_id}:*"
    )

    for pattern in "${key_patterns[@]}"; do
        local keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "$pattern" 2>/dev/null || echo "")
        if [[ -n "$keys" ]]; then
            while read -r key; do
                if [[ -n "$key" ]]; then
                    keys_to_delete+=("$key")
                fi
            done <<< "$keys"
        fi
    done

    # Delete keys in batches
    if [[ ${#keys_to_delete[@]} -gt 0 ]]; then
        local batch_size=100
        for ((i=0; i<${#keys_to_delete[@]}; i+=batch_size)); do
            local batch=("${keys_to_delete[@]:$i:$batch_size}")
            local batch_keys=$(printf '"%s" ' "${batch[@]}")
            if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL $batch_keys > /dev/null; then
                echo "✅ Deleted batch: ${#batch[@]} keys" >&2
            else
                echo "❌ Failed to delete batch: ${#batch[@]} keys" >&2
            fi
        done
    fi

    echo "✅ Task cleanup completed for: $task_id" >&2
}

# Show Usage
show_usage() {
    cat <<'EOF'
CFN CLI Mode Coordination - Safe Redis Operations

USAGE:
    source "$(dirname "${BASH_SOURCE[0]}")/cli-coordination.sh"

    # Configuration
    export REDIS_HOST=localhost
    export REDIS_PORT=6379
    export REDIS_TIMEOUT=30

    # Basic Operations
    redis_check_connection                    # Check Redis connection
    redis_lpush_safe <key> <value> [timeout]   # Safe LPUSH with timeout
    redis_blpop_safe <key> [timeout] [output]  # Safe BLPOP with timeout
    redis_hset_safe <key> <field> <value> ...  # Safe HSET
    redis_get_safe <key> [output]             # Safe GET
    redis_expire_safe <key> <seconds>         # Safe EXPIRE
    redis_del_safe <key>                      # Safe DEL

    # Coordination Functions
    cfn_signal_agent_complete <task_id> <agent_id>
    cfn_store_agent_confidence <task_id> <agent_id> <confidence>
    cfn_store_agent_result <task_id> <agent_id> <confidence> [iteration]
    cfn_wait_for_agent_completion <task_id> <agent_id> [timeout]
    cfn_collect_confidence_scores <task_id> <agent_ids> [threshold] [min_quorum]
    cfn_cleanup_task_data <task_id> [max_age]

EXAMPLES:
    # Signal agent completion
    cfn_signal_agent_complete "task-123" "agent-001"

    # Store confidence score
    cfn_store_agent_confidence "task-123" "agent-001" 0.85

    # Wait for agent completion
    cfn_wait_for_agent_completion "task-123" "agent-001" 300

    # Collect confidence scores
    cfn_collect_confidence_scores "task-123" "agent-001,agent-002" 0.75 1

    # Cleanup old task data
    cfn_cleanup_task_data "task-123" 86400

EOF
}

# Main execution block
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ "$1" == "--help" || "$1" == "-h" ]]; then
        show_usage
        exit 0
    fi

    # Execute single operation if provided
    if [[ $# -gt 0 ]]; then
        case "$1" in
            "check-connection")
                redis_check_connection
                ;;
            "lpush")
                redis_lpush_safe "$2" "$3" "${4:-$REDIS_TIMEOUT}"
                ;;
            "blpop")
                redis_blpop_safe "$2" "${3:-$REDIS_TIMEOUT}" "${4:-/tmp/blpop_output}"
                ;;
            "hset")
                shift
                redis_hset_safe "$@"
                ;;
            "get")
                redis_get_safe "$2" "${3:-/tmp/redis_get_output}"
                ;;
            "expire")
                redis_expire_safe "$2" "$3"
                ;;
            "del")
                redis_del_safe "$2"
                ;;
            "signal")
                cfn_signal_agent_complete "$2" "$3"
                ;;
            "confidence")
                cfn_store_agent_confidence "$2" "$3" "$4"
                ;;
            "wait")
                cfn_wait_for_agent_completion "$2" "$3" "${4:-300}"
                ;;
            "collect")
                cfn_collect_confidence_scores "$2" "$3" "${4:-0.75}" "${5:-1}"
                ;;
            "cleanup")
                cfn_cleanup_task_data "$2" "${3:-86400}"
                ;;
            *)
                echo "Unknown operation: $1" >&2
                echo "Use --help for usage information" >&2
                exit 1
                ;;
        esac
    else
        echo "CFN CLI Mode Coordination System" >&2
        echo "Mode: $(detect_execution_mode)" >&2
        echo "Task Mode: $(is_task_mode && echo "YES" || echo "NO")" >&2
        echo "CLI Mode: $(is_cli_mode && echo "YES" || echo "NO")" >&2
        echo "Redis: $REDIS_HOST:$REDIS_PORT" >&2
        echo "Timeout: ${REDIS_TIMEOUT}s" >&2
    fi
fi