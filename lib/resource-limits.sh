#!/bin/bash
# Resource Limits Foundation v1.0
# DoS prevention and resource exhaustion protection
# Phase 2/3: Global limits, payload validation, FD monitoring

set -euo pipefail

# Source coordination config for thresholds
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${CONFIG_FILE:-$SCRIPT_DIR/../config/coordination-config.sh}"

if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
fi

# Configuration with sensible defaults
export CFN_MAX_GLOBAL_MESSAGES="${CFN_MAX_GLOBAL_MESSAGES:-100000}"
export CFN_MAX_PAYLOAD_SIZE="${CFN_MAX_PAYLOAD_SIZE:-1048576}"  # 1MB
export CFN_FD_WARNING_THRESHOLD="${CFN_FD_WARNING_THRESHOLD:-80}"  # 80%
export MESSAGE_BASE_DIR="${MESSAGE_BASE_DIR:-/dev/shm/cfn-mvp/messages}"

# Metrics integration
METRICS_LIB="${METRICS_LIB:-$(dirname "${BASH_SOURCE[0]}")/metrics.sh}"
if [[ -f "$METRICS_LIB" ]]; then
    source "$METRICS_LIB"
fi

# Logging
log_info() {
    echo "[$(date '+%H:%M:%S')] [RESOURCE-LIMITS] $*" >&2
}

log_error() {
    echo "[$(date '+%H:%M:%S')] [RESOURCE-LIMITS] ERROR: $*" >&2
}

log_warn() {
    echo "[$(date '+%H:%M:%S')] [RESOURCE-LIMITS] WARN: $*" >&2
}

# Check global message count across all agents
# Usage: check_global_message_count
# Returns: 0 if under limit, 1 if exceeded
check_global_message_count() {
    if [[ ! -d "$MESSAGE_BASE_DIR" ]]; then
        # No messages directory yet - under limit
        return 0
    fi

    # Count all .json files in message base directory (all agents, inbox+outbox)
    # Use find with -type f for accuracy (WSL-safe with timeout)
    local count=0
    local timeout=5

    # Use timeout command if available to prevent hang
    if command -v timeout >/dev/null 2>&1; then
        count=$(timeout "$timeout" find "$MESSAGE_BASE_DIR" -type f -name "*.json" 2>/dev/null | wc -l)
    else
        # Fallback without timeout
        count=$(find "$MESSAGE_BASE_DIR" -type f -name "*.json" 2>/dev/null | wc -l)
    fi

    if [[ $count -ge $CFN_MAX_GLOBAL_MESSAGES ]]; then
        log_error "Global message limit exceeded: $count >= $CFN_MAX_GLOBAL_MESSAGES"

        # Emit metric for monitoring
        emit_resource_limit_metric "global_message_limit" "$count" "$CFN_MAX_GLOBAL_MESSAGES"

        return 1
    fi

    # Emit usage metric (every 1000 messages for visibility)
    if [[ $((count % 1000)) -eq 0 ]] && [[ $count -gt 0 ]]; then
        log_info "Global message count: $count / $CFN_MAX_GLOBAL_MESSAGES"

        if command -v emit_metric >/dev/null 2>&1; then
            emit_metric "resource_limits.global_messages" "$count" "gauge" "{\"limit\":$CFN_MAX_GLOBAL_MESSAGES}"
        fi
    fi

    return 0
}

# Validate payload size before write
# Usage: validate_payload_size <payload>
# Returns: 0 if valid, 1 if too large
validate_payload_size() {
    local payload="$1"

    if [[ -z "$payload" ]]; then
        log_error "Empty payload provided"
        return 1
    fi

    # Calculate payload size in bytes
    local payload_size=${#payload}

    if [[ $payload_size -gt $CFN_MAX_PAYLOAD_SIZE ]]; then
        log_error "Payload size exceeded: $payload_size bytes > $CFN_MAX_PAYLOAD_SIZE bytes"

        # Emit metric for monitoring
        emit_resource_limit_metric "payload_size_limit" "$payload_size" "$CFN_MAX_PAYLOAD_SIZE"

        return 1
    fi

    # Warn if payload is >50% of limit
    local warning_threshold=$((CFN_MAX_PAYLOAD_SIZE / 2))
    if [[ $payload_size -gt $warning_threshold ]]; then
        log_warn "Large payload detected: $payload_size bytes (${CFN_MAX_PAYLOAD_SIZE} bytes limit)"

        if command -v emit_metric >/dev/null 2>&1; then
            emit_metric "resource_limits.large_payload" "$payload_size" "gauge" "{\"limit\":$CFN_MAX_PAYLOAD_SIZE,\"threshold\":$warning_threshold}"
        fi
    fi

    return 0
}

# Monitor file descriptor usage
# Usage: monitor_file_descriptors
# Returns: 0 if healthy, 1 if warning threshold exceeded
monitor_file_descriptors() {
    # Get current process FD limit
    local fd_limit
    if command -v ulimit >/dev/null 2>&1; then
        fd_limit=$(ulimit -n 2>/dev/null || echo "1024")
    else
        fd_limit=1024  # Default fallback
    fi

    # Count currently open file descriptors
    local fd_count=0
    local proc_fd_dir="/proc/$$/fd"

    if [[ -d "$proc_fd_dir" ]]; then
        # Linux: count entries in /proc/PID/fd
        fd_count=$(ls -1 "$proc_fd_dir" 2>/dev/null | wc -l)
    else
        # Fallback: use lsof if available
        if command -v lsof >/dev/null 2>&1; then
            fd_count=$(lsof -p $$ 2>/dev/null | wc -l)
        else
            # Cannot determine FD count - return success
            log_warn "Cannot determine file descriptor count (no /proc/PID/fd or lsof)"
            return 0
        fi
    fi

    # Calculate percentage used
    local fd_percentage=$((fd_count * 100 / fd_limit))

    # Emit current FD usage metric
    if command -v emit_metric >/dev/null 2>&1; then
        emit_metric "resource_limits.fd_usage" "$fd_count" "gauge" "{\"limit\":$fd_limit,\"percentage\":$fd_percentage}"
    fi

    # Check against warning threshold
    if [[ $fd_percentage -ge $CFN_FD_WARNING_THRESHOLD ]]; then
        log_error "File descriptor usage at ${fd_percentage}% ($fd_count / $fd_limit) - threshold: ${CFN_FD_WARNING_THRESHOLD}%"

        # Emit warning metric
        emit_resource_limit_metric "fd_warning_threshold" "$fd_count" "$fd_limit"

        return 1
    fi

    # Log info at 50% threshold
    if [[ $fd_percentage -ge 50 ]] && [[ $fd_percentage -lt $CFN_FD_WARNING_THRESHOLD ]]; then
        log_info "File descriptor usage: ${fd_percentage}% ($fd_count / $fd_limit)"
    fi

    return 0
}

# Emit resource limit violation metric
# Usage: emit_resource_limit_metric <limit_type> <current_value> <limit_value>
emit_resource_limit_metric() {
    local limit_type="$1"
    local current_value="$2"
    local limit_value="$3"

    # Build metadata JSON
    local metadata="{\"limit_type\":\"$limit_type\",\"current\":$current_value,\"limit\":$limit_value,\"timestamp\":$(date +%s)}"

    # Emit metric if metrics library available
    if command -v emit_metric >/dev/null 2>&1; then
        emit_metric "resource_limits.violation" "1" "count" "$metadata"
    fi

    log_error "Resource limit violation: $limit_type (current: $current_value, limit: $limit_value)"
}

# Validate inbox capacity (integrated with message-bus.sh inbox overflow protection)
# Usage: validate_inbox_capacity <agent_id>
# Returns: 0 if capacity available, 1 if at/over limit
validate_inbox_capacity() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Agent ID required for inbox capacity check"
        return 1
    fi

    local inbox_dir="$MESSAGE_BASE_DIR/$agent_id/inbox"

    if [[ ! -d "$inbox_dir" ]]; then
        # Inbox doesn't exist yet - capacity available
        return 0
    fi

    # Count messages in inbox
    local inbox_count=$(ls -1 "$inbox_dir"/*.json 2>/dev/null | wc -l)
    local inbox_limit=1000  # Per-agent inbox limit (already implemented in message-bus.sh)

    if [[ $inbox_count -ge $inbox_limit ]]; then
        log_warn "Inbox capacity at limit for $agent_id: $inbox_count / $inbox_limit messages"

        if command -v emit_metric >/dev/null 2>&1; then
            emit_metric "resource_limits.inbox_full" "1" "count" "{\"agent\":\"$agent_id\",\"count\":$inbox_count}"
        fi

        return 1
    fi

    return 0
}

# Background FD monitor daemon
# Usage: start_fd_monitor [interval_seconds]
# Runs in background and checks FD usage every N seconds (default: 30)
start_fd_monitor() {
    local interval="${1:-30}"

    log_info "Starting FD monitor daemon (interval: ${interval}s)"

    # Create PID file for tracking
    local pid_file="/tmp/cfn-fd-monitor.pid"

    # Check if already running
    if [[ -f "$pid_file" ]]; then
        local existing_pid=$(cat "$pid_file")
        if kill -0 "$existing_pid" 2>/dev/null; then
            log_warn "FD monitor already running (PID: $existing_pid)"
            return 0
        else
            # Stale PID file - remove it
            rm -f "$pid_file"
        fi
    fi

    # Start background monitor
    (
        echo $$ > "$pid_file"

        while true; do
            monitor_file_descriptors || true
            sleep "$interval"
        done
    ) &

    local monitor_pid=$!
    log_info "FD monitor started (PID: $monitor_pid)"

    return 0
}

# Stop background FD monitor
# Usage: stop_fd_monitor
stop_fd_monitor() {
    local pid_file="/tmp/cfn-fd-monitor.pid"

    if [[ ! -f "$pid_file" ]]; then
        log_info "FD monitor not running (no PID file)"
        return 0
    fi

    local monitor_pid=$(cat "$pid_file")

    if kill -0 "$monitor_pid" 2>/dev/null; then
        kill "$monitor_pid"
        rm -f "$pid_file"
        log_info "FD monitor stopped (PID: $monitor_pid)"
    else
        log_warn "FD monitor PID $monitor_pid not running (stale PID file)"
        rm -f "$pid_file"
    fi

    return 0
}

# Main command dispatcher
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    command="${1:-}"
    shift || true

    case "$command" in
        check-global-count)
            check_global_message_count
            ;;
        validate-payload)
            validate_payload_size "$@"
            ;;
        monitor-fds)
            monitor_file_descriptors
            ;;
        validate-inbox)
            validate_inbox_capacity "$@"
            ;;
        start-fd-monitor)
            start_fd_monitor "$@"
            ;;
        stop-fd-monitor)
            stop_fd_monitor
            ;;
        *)
            echo "Usage: $0 {check-global-count|validate-payload|monitor-fds|validate-inbox|start-fd-monitor|stop-fd-monitor} [args]"
            echo ""
            echo "Commands:"
            echo "  check-global-count                  - Check global message count limit"
            echo "  validate-payload <payload>          - Validate payload size"
            echo "  monitor-fds                         - Check file descriptor usage"
            echo "  validate-inbox <agent-id>           - Check inbox capacity"
            echo "  start-fd-monitor [interval]         - Start background FD monitor (default: 30s)"
            echo "  stop-fd-monitor                     - Stop background FD monitor"
            exit 1
            ;;
    esac
fi
