#!/usr/bin/env bash
# Rate Limiting & Backpressure System v1.0
# Phase 1 Sprint 1.5: Inbox capacity management and dynamic rate limiting

set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================

# Inbox capacity limits
MAX_INBOX_SIZE="${MAX_INBOX_SIZE:-1000}"              # Maximum messages per inbox
BACKPRESSURE_WAIT_MS="${BACKPRESSURE_WAIT_MS:-100}"   # Wait time between retries (ms)
BACKPRESSURE_MAX_RETRIES="${BACKPRESSURE_MAX_RETRIES:-50}"  # Max retry attempts

# Dynamic rate limiting based on system load
RATE_LIMIT_CHECK_INTERVAL="${RATE_LIMIT_CHECK_INTERVAL:-5}"  # Check system load every 5s
RATE_LIMIT_HIGH_LOAD_THRESHOLD="${RATE_LIMIT_HIGH_LOAD_THRESHOLD:-0.8}"  # 80% CPU per core
RATE_LIMIT_MEDIUM_LOAD_THRESHOLD="${RATE_LIMIT_MEDIUM_LOAD_THRESHOLD:-0.5}"  # 50% CPU per core

# Batch size configuration (can be dynamically adjusted)
export CFN_BATCH_SIZE="${CFN_BATCH_SIZE:-10}"

# Message base directory (from coordination-config.sh)
MESSAGE_BASE_DIR="${MESSAGE_BASE_DIR:-/dev/shm/cfn-mvp/messages}"
CFN_BASE_DIR="${CFN_BASE_DIR:-/dev/shm/cfn}"

# ==============================================================================
# LOGGING
# ==============================================================================

log_rate_limit() {
    echo "[$(date '+%H:%M:%S')] [RATE-LIMIT] $*" >&2
}

log_error() {
    echo "[$(date '+%H:%M:%S')] [RATE-LIMIT] ERROR: $*" >&2
}

# ==============================================================================
# INBOX CAPACITY MANAGEMENT
# ==============================================================================

# check_inbox_capacity - Check if inbox can accept messages
# Usage: check_inbox_capacity <agent-id>
# Returns: 0 if has capacity, 1 if full
check_inbox_capacity() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Agent ID required for capacity check"
        return 1
    fi

    local inbox="$MESSAGE_BASE_DIR/$agent_id/inbox"

    # If inbox doesn't exist, it has capacity (will be created)
    if [[ ! -d "$inbox" ]]; then
        return 0
    fi

    # Count messages in inbox (WSL-safe, no memory leak)
    # Use array expansion to count files (faster than find, handles set -e)
    local files=("$inbox"/*.json)
    local count=0
    if [[ -f "${files[0]}" ]]; then
        count="${#files[@]}"
    fi

    if [[ $count -ge $MAX_INBOX_SIZE ]]; then
        log_rate_limit "Inbox $agent_id at capacity: $count/$MAX_INBOX_SIZE messages"
        return 1  # Full
    fi

    return 0  # Has capacity
}

# get_inbox_size - Get current inbox message count
# Usage: get_inbox_size <agent-id>
# Output: Number of messages in inbox
get_inbox_size() {
    local agent_id="$1"
    local inbox="$MESSAGE_BASE_DIR/$agent_id/inbox"

    if [[ ! -d "$inbox" ]]; then
        echo "0"
        return 0
    fi

    # Use ls instead of find (WSL-safe, <10ms)
    # Count files, default to 0 if no matches (handles set -e)
    local files=("$inbox"/*.json)
    if [[ -f "${files[0]}" ]]; then
        echo "${#files[@]}"
    else
        echo "0"
    fi
    return 0
}

# get_inbox_utilization - Get inbox utilization percentage
# Usage: get_inbox_utilization <agent-id>
# Output: Utilization percentage (0-100)
get_inbox_utilization() {
    local agent_id="$1"
    local size=$(get_inbox_size "$agent_id")
    local utilization=$((size * 100 / MAX_INBOX_SIZE))
    echo "$utilization"
}

# ==============================================================================
# BACKPRESSURE MECHANISM
# ==============================================================================

# send_with_backpressure - Send message with backpressure handling
# Usage: send_with_backpressure <from> <to> <type> <payload>
# Returns: 0 on success, 1 on failure after max retries
send_with_backpressure() {
    local from="$1"
    local to="$2"
    local msg_type="$3"
    local payload="$4"
    local retries=0

    if [[ -z "$from" || -z "$to" || -z "$msg_type" ]]; then
        log_error "Usage: send_with_backpressure <from> <to> <type> <payload>"
        return 1
    fi

    # Check if message-bus.sh functions are available
    if ! command -v send_message >/dev/null 2>&1; then
        log_error "send_message function not available. Source message-bus.sh first."
        return 1
    fi

    # Retry loop with backpressure
    while [[ $retries -lt $BACKPRESSURE_MAX_RETRIES ]]; do
        # Check if inbox has capacity
        if check_inbox_capacity "$to"; then
            # Inbox has capacity, send message using message-bus.sh
            if send_message "$from" "$to" "$msg_type" "$payload"; then
                # Emit success metric to BOTH metrics file AND message-bus
                if command -v emit_coordination_metric >/dev/null 2>&1; then
                    emit_coordination_metric "backpressure.send.success" "1" "count" \
                        "{\"from\":\"$from\",\"to\":\"$to\",\"retries\":$retries}" "$from"
                elif command -v emit_metric >/dev/null 2>&1; then
                    emit_metric "backpressure.send.success" "1" "count" "{\"from\":\"$from\",\"to\":\"$to\",\"retries\":$retries}"
                fi
                return 0
            else
                log_error "Failed to send message: $from -> $to"
                return 1
            fi
        fi

        # Inbox full, apply backpressure
        retries=$((retries + 1))

        # Emit backpressure metric to message-bus for real-time coordination
        if command -v emit_coordination_metric >/dev/null 2>&1; then
            emit_coordination_metric "backpressure.wait" "1" "count" \
                "{\"from\":\"$from\",\"to\":\"$to\",\"retry\":$retries}" "$from"
        elif command -v emit_metric >/dev/null 2>&1; then
            emit_metric "backpressure.wait" "1" "count" "{\"from\":\"$from\",\"to\":\"$to\",\"retry\":$retries}"
        fi

        log_rate_limit "Backpressure applied: $from -> $to (retry $retries/$BACKPRESSURE_MAX_RETRIES)"

        # Wait before retry (convert ms to seconds for sleep)
        # Use awk instead of bc for portability
        local wait_seconds=$(awk "BEGIN {printf \"%.3f\", $BACKPRESSURE_WAIT_MS / 1000}")
        sleep "$wait_seconds"
    done

    # Failed after max retries - emit alert
    log_error "Inbox overflow: $to full after $retries retries"

    if command -v emit_alert >/dev/null 2>&1; then
        emit_alert "inbox_overflow" \
            "Inbox $to exceeded capacity after $retries retries from $from" \
            "critical" \
            "{\"from\":\"$from\",\"to\":\"$to\",\"retries\":$retries,\"max_size\":$MAX_INBOX_SIZE}"
    fi

    # Emit failure metric to message-bus for critical coordination
    if command -v emit_coordination_metric >/dev/null 2>&1; then
        emit_coordination_metric "backpressure.send.failure" "1" "count" \
            "{\"from\":\"$from\",\"to\":\"$to\",\"retries\":$retries}" "$from"
    elif command -v emit_metric >/dev/null 2>&1; then
        emit_metric "backpressure.send.failure" "1" "count" "{\"from\":\"$from\",\"to\":\"$to\",\"retries\":$retries}"
    fi

    return 1
}

# ==============================================================================
# OVERFLOW DETECTION & MONITORING
# ==============================================================================

# monitor_inbox_overflow - Background monitoring for inbox overflow
# Usage: monitor_inbox_overflow [interval_seconds]
# Runs in background, checking all inboxes periodically
monitor_inbox_overflow() {
    local interval="${1:-5}"  # Default 5 second interval

    log_rate_limit "Starting inbox overflow monitoring (interval: ${interval}s)"

    while true; do
        # Check all agent inboxes (WSL-safe directory iteration)
        if [[ -d "$MESSAGE_BASE_DIR" ]]; then
            # Use ls to list directories (avoid find on WSL)
            for agent_dir in "$MESSAGE_BASE_DIR"/*; do
                [[ -d "$agent_dir" ]] || continue

                local inbox="$agent_dir/inbox"
                [[ -d "$inbox" ]] || continue

                local agent_id=$(basename "$agent_dir")
                local size=$(get_inbox_size "$agent_id")
                local utilization=$(get_inbox_utilization "$agent_id")

                # Emit inbox size metric to message-bus for real-time coordination
                if command -v emit_coordination_metric >/dev/null 2>&1; then
                    emit_coordination_metric "inbox.size" "$size" "count" "{\"agent\":\"$agent_id\"}" "$agent_id"
                    emit_coordination_metric "inbox.utilization" "$utilization" "percent" "{\"agent\":\"$agent_id\"}" "$agent_id"
                elif command -v emit_metric >/dev/null 2>&1; then
                    emit_metric "inbox.size" "$size" "count" "{\"agent\":\"$agent_id\"}"
                    emit_metric "inbox.utilization" "$utilization" "percent" "{\"agent\":\"$agent_id\"}"
                fi

                # Alert if at capacity
                if ! check_inbox_capacity "$agent_id"; then
                    if command -v emit_alert >/dev/null 2>&1; then
                        emit_alert "inbox_overflow" \
                            "Agent $agent_id inbox at capacity: $size/$MAX_INBOX_SIZE messages" \
                            "warning" \
                            "{\"agent\":\"$agent_id\",\"size\":$size,\"max_size\":$MAX_INBOX_SIZE,\"utilization\":$utilization}"
                    fi
                fi

                # Warning if approaching capacity (>80%)
                if [[ $utilization -gt 80 && $utilization -lt 100 ]]; then
                    log_rate_limit "WARN: Inbox $agent_id approaching capacity: $utilization%"

                    if command -v emit_alert >/dev/null 2>&1; then
                        emit_alert "inbox_high_utilization" \
                            "Agent $agent_id inbox at ${utilization}% capacity" \
                            "info" \
                            "{\"agent\":\"$agent_id\",\"size\":$size,\"utilization\":$utilization}"
                    fi
                fi
            done
        fi

        sleep "$interval"
    done
}

# ==============================================================================
# DYNAMIC RATE LIMITING
# ==============================================================================

# get_system_load - Get current system load per CPU
# Output: Load average per CPU (0.0 to 1.0+)
get_system_load() {
    local load_1min=$(uptime | awk '{print $(NF-2)}' | tr -d ',')
    local cpu_count=$(nproc)

    # Calculate load per CPU using awk for portability
    local load_per_cpu=$(awk "BEGIN {printf \"%.2f\", $load_1min / $cpu_count}")
    echo "$load_per_cpu"
}

# apply_dynamic_rate_limit - Adjust rate limits based on system load
# Usage: apply_dynamic_rate_limit
# Adjusts global CFN_BATCH_SIZE and BACKPRESSURE_WAIT_MS based on CPU load
apply_dynamic_rate_limit() {
    local load_per_cpu=$(get_system_load)

    # Emit system load metric to message-bus for real-time coordination
    if command -v emit_coordination_metric >/dev/null 2>&1; then
        local load_pct=$(awk "BEGIN {printf \"%.0f\", $load_per_cpu * 100}")
        emit_coordination_metric "system.load_per_cpu" "$load_pct" "percent" "{}" "rate-limiter"
    elif command -v emit_metric >/dev/null 2>&1; then
        local load_pct=$(awk "BEGIN {printf \"%.0f\", $load_per_cpu * 100}")
        emit_metric "system.load_per_cpu" "$load_pct" "percent" "{}"
    fi

    # Adjust based on load thresholds (using awk for float comparison)
    local is_high_load=$(awk "BEGIN {print ($load_per_cpu > $RATE_LIMIT_HIGH_LOAD_THRESHOLD) ? 1 : 0}")
    local is_medium_load=$(awk "BEGIN {print ($load_per_cpu > $RATE_LIMIT_MEDIUM_LOAD_THRESHOLD) ? 1 : 0}")

    if [[ $is_high_load -eq 1 ]]; then
        # High load: reduce batch size, increase wait time
        export CFN_BATCH_SIZE=5
        export BACKPRESSURE_WAIT_MS=200
        log_rate_limit "High system load ($load_per_cpu): Reduced batch size to 5, increased backpressure wait to 200ms"

    elif [[ $is_medium_load -eq 1 ]]; then
        # Medium load: moderate settings
        export CFN_BATCH_SIZE=10
        export BACKPRESSURE_WAIT_MS=100
        log_rate_limit "Medium system load ($load_per_cpu): Batch size 10, backpressure wait 100ms"

    else
        # Low load: aggressive settings
        export CFN_BATCH_SIZE=20
        export BACKPRESSURE_WAIT_MS=50
        log_rate_limit "Low system load ($load_per_cpu): Increased batch size to 20, reduced backpressure wait to 50ms"
    fi

    # Emit rate limit adjustment metric to message-bus for real-time coordination
    if command -v emit_coordination_metric >/dev/null 2>&1; then
        emit_coordination_metric "rate_limit.batch_size" "$CFN_BATCH_SIZE" "count" "{\"load\":\"$load_per_cpu\"}" "rate-limiter"
        emit_coordination_metric "rate_limit.backpressure_wait_ms" "$BACKPRESSURE_WAIT_MS" "milliseconds" "{\"load\":\"$load_per_cpu\"}" "rate-limiter"
    elif command -v emit_metric >/dev/null 2>&1; then
        emit_metric "rate_limit.batch_size" "$CFN_BATCH_SIZE" "count" "{\"load\":\"$load_per_cpu\"}"
        emit_metric "rate_limit.backpressure_wait_ms" "$BACKPRESSURE_WAIT_MS" "milliseconds" "{\"load\":\"$load_per_cpu\"}"
    fi
}

# monitor_dynamic_rate_limit - Background monitoring for dynamic rate limiting
# Usage: monitor_dynamic_rate_limit [interval_seconds]
monitor_dynamic_rate_limit() {
    local interval="${1:-$RATE_LIMIT_CHECK_INTERVAL}"

    log_rate_limit "Starting dynamic rate limit monitoring (interval: ${interval}s)"

    while true; do
        apply_dynamic_rate_limit
        sleep "$interval"
    done
}

# ==============================================================================
# UTILITY FUNCTIONS
# ==============================================================================

# get_all_inbox_stats - Get statistics for all inboxes
# Output: JSON array of inbox statistics
get_all_inbox_stats() {
    local stats="["
    local first=true

    if [[ -d "$MESSAGE_BASE_DIR" ]]; then
        # WSL-safe: use glob expansion instead of find
        for agent_dir in "$MESSAGE_BASE_DIR"/*; do
            [[ -d "$agent_dir" ]] || continue

            local inbox="$agent_dir/inbox"
            [[ -d "$inbox" ]] || continue

            local agent_id=$(basename "$agent_dir")
            local size=$(get_inbox_size "$agent_id")
            local utilization=$(get_inbox_utilization "$agent_id")

            if [[ "$first" == "true" ]]; then
                first=false
            else
                stats+=","
            fi

            stats+="{\"agent\":\"$agent_id\",\"size\":$size,\"utilization\":$utilization,\"max_size\":$MAX_INBOX_SIZE}"
        done
    fi

    stats+="]"
    echo "$stats"
}

# cleanup_rate_limiting - Stop background monitoring processes
# Usage: cleanup_rate_limiting
cleanup_rate_limiting() {
    # Kill background monitoring processes
    pkill -f "monitor_inbox_overflow" 2>/dev/null || true
    pkill -f "monitor_dynamic_rate_limit" 2>/dev/null || true

    log_rate_limit "Rate limiting cleanup completed"
}

# ==============================================================================
# MAIN COMMAND DISPATCHER
# ==============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    command="${1:-}"
    shift || true

    case "$command" in
        check-capacity)
            check_inbox_capacity "$@"
            ;;
        get-size)
            get_inbox_size "$@"
            ;;
        get-utilization)
            get_inbox_utilization "$@"
            ;;
        send-backpressure)
            send_with_backpressure "$@"
            ;;
        monitor-overflow)
            monitor_inbox_overflow "$@"
            ;;
        apply-rate-limit)
            apply_dynamic_rate_limit
            ;;
        monitor-rate-limit)
            monitor_dynamic_rate_limit "$@"
            ;;
        get-stats)
            get_all_inbox_stats
            ;;
        cleanup)
            cleanup_rate_limiting
            ;;
        *)
            cat <<EOF
Usage: $0 <command> [args]

Commands:
  check-capacity <agent-id>              - Check if inbox has capacity (returns 0/1)
  get-size <agent-id>                    - Get inbox message count
  get-utilization <agent-id>             - Get inbox utilization percentage
  send-backpressure <from> <to> <type> <payload> - Send with backpressure
  monitor-overflow [interval]            - Start overflow monitoring (background)
  apply-rate-limit                       - Apply dynamic rate limits based on system load
  monitor-rate-limit [interval]          - Start dynamic rate limit monitoring (background)
  get-stats                              - Get all inbox statistics (JSON)
  cleanup                                - Stop monitoring processes

Environment Variables:
  MAX_INBOX_SIZE                         - Maximum messages per inbox (default: 1000)
  BACKPRESSURE_WAIT_MS                   - Wait time between retries (default: 100ms)
  BACKPRESSURE_MAX_RETRIES               - Maximum retry attempts (default: 50)
  RATE_LIMIT_CHECK_INTERVAL              - Rate limit check interval (default: 5s)
  RATE_LIMIT_HIGH_LOAD_THRESHOLD         - High load threshold (default: 0.8)
  RATE_LIMIT_MEDIUM_LOAD_THRESHOLD       - Medium load threshold (default: 0.5)

Examples:
  # Check inbox capacity
  $0 check-capacity agent-1

  # Send with backpressure
  $0 send-backpressure agent-1 agent-2 "task" '{"action":"process"}'

  # Start monitoring
  $0 monitor-overflow 5 &
  $0 monitor-rate-limit 10 &

  # Get statistics
  $0 get-stats | jq '.'
EOF
            exit 1
            ;;
    esac
fi
