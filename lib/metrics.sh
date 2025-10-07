#!/usr/bin/env bash
# Metrics Emission Library v1.0
# Core metrics collection infrastructure for CLI coordination monitoring
set -euo pipefail

# Configuration
METRICS_FILE="${METRICS_FILE:-/dev/shm/cfn-metrics.jsonl}"
METRICS_VERSION="1.0"
METRICS_LOCK_FILE="${METRICS_LOCK_FILE:-/var/lock/cfn-metrics.lock}"

# Ensure metrics file exists
if [[ ! -f "$METRICS_FILE" ]]; then
    mkdir -p "$(dirname "$METRICS_FILE")"
    touch "$METRICS_FILE"
    chmod 644 "$METRICS_FILE"
fi

# Ensure lock directory exists
mkdir -p "$(dirname "$METRICS_LOCK_FILE")"

# Logging function
log_metrics_error() {
    echo "[$(date '+%H:%M:%S')] [METRICS] ERROR: $*" >&2
}

# emit_metric - Emit structured metric in JSONL format
# Usage: emit_metric "metric_name" "value" "unit" "tags"
# Example: emit_metric "coordination.time" "150" "milliseconds" '{"phase":"coordination"}'
emit_metric() {
    local metric_name="$1"
    local value="$2"
    local unit="${3:-count}"
    local tags="${4:-{}}"

    # Validate required parameters
    if [[ -z "$metric_name" || -z "$value" ]]; then
        log_metrics_error "Usage: emit_metric <metric_name> <value> [unit] [tags_json]"
        return 1
    fi

    # Validate value is numeric
    if ! [[ "$value" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
        log_metrics_error "Value must be numeric: $value"
        return 1
    fi

    # Generate ISO 8601 timestamp with millisecond precision
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

    # Build JSON structure manually to avoid jq dependency (for performance)
    # Format: {"timestamp":"...","metric":"...","value":X,"unit":"...","tags":{...}}
    local json_metric

    # Escape special characters in metric name
    local escaped_metric=$(echo "$metric_name" | sed 's/\\/\\\\/g; s/"/\\"/g')
    local escaped_unit=$(echo "$unit" | sed 's/\\/\\\\/g; s/"/\\"/g')

    # Parse tags - validate it's valid JSON
    if command -v jq >/dev/null 2>&1; then
        # Use jq for robust JSON construction if available
        json_metric=$(jq -n \
            --arg ts "$timestamp" \
            --arg metric "$metric_name" \
            --arg val "$value" \
            --arg unit "$unit" \
            --argjson tags "$tags" \
            '{
                timestamp: $ts,
                metric: $metric,
                value: ($val | tonumber),
                unit: $unit,
                tags: $tags
            }')
    else
        # Fallback to manual JSON construction (faster but less safe)
        json_metric=$(cat <<EOF
{"timestamp":"$timestamp","metric":"$escaped_metric","value":$value,"unit":"$escaped_unit","tags":$tags}
EOF
)
    fi

    # Atomic append to metrics file with flock
    # Timeout after 5 seconds to prevent deadlocks
    {
        if flock -x -w 5 200; then
            echo "$json_metric" >> "$METRICS_FILE"
            sync  # Ensure write is flushed to disk
        else
            log_metrics_error "Failed to acquire metrics lock (timeout after 5s)"
            return 1
        fi
    } 200>"$METRICS_LOCK_FILE"

    return 0
}

# emit_coordination_metric - Emit metrics to BOTH metrics file AND message-bus
# Dual-channel emission for event-driven coordination monitoring
# Usage: emit_coordination_metric "metric_name" "value" "unit" "tags" [agent_id]
# Example: emit_coordination_metric "coordination.latency" "45" "ms" '{"phase":"consensus"}' "agent-1"
emit_coordination_metric() {
    local metric_name="$1"
    local value="$2"
    local unit="${3:-count}"
    local tags="${4:-{}}"
    local agent_id="${5:-coordinator}"

    # Emit to standard metrics file (thread-safe JSONL)
    emit_metric "$metric_name" "$value" "$unit" "$tags"

    # Emit to message-bus if available (for real-time coordination events)
    if [[ -n "${MESSAGE_BASE_DIR:-}" ]] && command -v send_message >/dev/null 2>&1; then
        # Construct metric payload for message-bus
        local metric_payload=$(cat <<EOF
{
  "metric": "$metric_name",
  "value": $value,
  "unit": "$unit",
  "tags": $tags,
  "source": "metrics-system"
}
EOF
)
        # Send to message-bus coordinator inbox (non-blocking, best effort)
        send_message "$agent_id" "metrics-collector" "metric.emitted" "$metric_payload" 2>/dev/null || true
    fi

    return 0
}

# Convenience function: Emit coordination time metric
# Usage: emit_coordination_time <duration_ms> [agent_count] [phase]
emit_coordination_time() {
    local duration_ms="$1"
    local agent_count="${2:-1}"
    local phase="${3:-coordination}"

    emit_metric "coordination.time" "$duration_ms" "milliseconds" "{\"phase\":\"$phase\",\"agent_count\":$agent_count}"
}

# Convenience function: Emit agent count metric
# Usage: emit_agent_count <count> [status]
emit_agent_count() {
    local count="$1"
    local status="${2:-active}"

    emit_metric "coordination.agents" "$count" "count" "{\"status\":\"$status\"}"
}

# Convenience function: Emit delivery rate metric
# Usage: emit_delivery_rate <rate_percent> [total_messages] [delivered_messages]
emit_delivery_rate() {
    local rate="$1"
    local total="${2:-0}"
    local delivered="${3:-0}"

    emit_metric "coordination.delivery_rate" "$rate" "percent" "{\"total\":$total,\"delivered\":$delivered,\"target\":90}"
}

# Convenience function: Emit message count metric
# Usage: emit_message_count <count> [direction] [agent_id]
emit_message_count() {
    local count="$1"
    local direction="${2:-sent}"
    local agent_id="${3:-unknown}"

    emit_metric "coordination.messages" "$count" "count" "{\"direction\":\"$direction\",\"agent\":\"$agent_id\"}"
}

# Convenience function: Emit consensus score metric
# Usage: emit_consensus_score <score> [validator_count] [phase]
emit_consensus_score() {
    local score="$1"
    local validator_count="${2:-0}"
    local phase="${3:-validation}"

    emit_metric "consensus.score" "$score" "percent" "{\"validators\":$validator_count,\"phase\":\"$phase\",\"target\":90}"
}

# Convenience function: Emit confidence score metric
# Usage: emit_confidence_score <score> [agent_id] [iteration]
emit_confidence_score() {
    local score="$1"
    local agent_id="${2:-unknown}"
    local iteration="${3:-1}"

    emit_metric "agent.confidence" "$score" "percent" "{\"agent\":\"$agent_id\",\"iteration\":$iteration,\"target\":75}"
}

# Get metrics file size and entry count
# Usage: get_metrics_stats
get_metrics_stats() {
    if [[ ! -f "$METRICS_FILE" ]]; then
        echo "Metrics file does not exist: $METRICS_FILE"
        return 1
    fi

    local file_size=$(du -h "$METRICS_FILE" | cut -f1)
    local entry_count=$(wc -l < "$METRICS_FILE")

    echo "Metrics file: $METRICS_FILE"
    echo "Size: $file_size"
    echo "Entries: $entry_count"
}

# Clear metrics file (with confirmation)
# Usage: clear_metrics [--force]
clear_metrics() {
    local force=false
    if [[ "${1:-}" == "--force" ]]; then
        force=true
    fi

    if [[ ! -f "$METRICS_FILE" ]]; then
        echo "Metrics file does not exist: $METRICS_FILE"
        return 0
    fi

    if [[ "$force" == "false" ]]; then
        read -p "Clear all metrics in $METRICS_FILE? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Metrics clear cancelled"
            return 0
        fi
    fi

    {
        if flock -x -w 5 200; then
            > "$METRICS_FILE"  # Truncate file
            echo "Metrics cleared: $METRICS_FILE"
        else
            log_metrics_error "Failed to acquire lock for clearing metrics"
            return 1
        fi
    } 200>"$METRICS_LOCK_FILE"
}

# Main command dispatcher (if executed directly)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    command="${1:-}"
    shift || true

    case "$command" in
        emit)
            emit_metric "$@"
            ;;
        stats)
            get_metrics_stats
            ;;
        clear)
            clear_metrics "$@"
            ;;
        *)
            echo "Usage: $0 {emit|stats|clear} [args]"
            echo ""
            echo "Commands:"
            echo "  emit <metric> <value> [unit] [tags_json]  - Emit a metric"
            echo "  stats                                      - Show metrics file statistics"
            echo "  clear [--force]                           - Clear all metrics"
            echo ""
            echo "Examples:"
            echo "  $0 emit coordination.time 150 milliseconds '{\"phase\":\"coordination\"}'"
            echo "  $0 stats"
            echo "  $0 clear --force"
            exit 1
            ;;
    esac
fi
