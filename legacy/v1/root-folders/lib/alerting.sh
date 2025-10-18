#!/usr/bin/env bash
# lib/alerting.sh - Alert threshold evaluation and notification system
# Phase 1 Sprint 1.1: Basic Alerting Thresholds

set -euo pipefail

# ==============================================================================
# ALERT THRESHOLD CONFIGURATION
# ==============================================================================

# Configurable via environment variables with sensible defaults
ALERT_COORDINATION_TIME_MS="${ALERT_COORDINATION_TIME_MS:-10000}"  # 10s max coordination time
ALERT_DELIVERY_RATE_PCT="${ALERT_DELIVERY_RATE_PCT:-90}"           # 90% minimum delivery rate
ALERT_MEMORY_GROWTH_PCT="${ALERT_MEMORY_GROWTH_PCT:-10}"           # 10% max memory growth
ALERT_FD_GROWTH="${ALERT_FD_GROWTH:-100}"                          # 100 file descriptors max growth
ALERT_ERROR_RATE_PCT="${ALERT_ERROR_RATE_PCT:-5}"                  # 5% max error rate
ALERT_QUEUE_DEPTH="${ALERT_QUEUE_DEPTH:-1000}"                     # 1000 max queue depth

# Alert log location (shared memory for performance)
ALERT_LOG_FILE="${ALERT_LOG_FILE:-/dev/shm/cfn-alerts.jsonl}"
METRICS_FILE="${METRICS_FILE:-/dev/shm/cfn-metrics.jsonl}"

# Alert rate limiting (prevent alert storms)
ALERT_COOLDOWN_SECONDS="${ALERT_COOLDOWN_SECONDS:-300}"  # 5 minutes between same alert type
declare -A ALERT_LAST_FIRED

# ==============================================================================
# CORE FUNCTIONS
# ==============================================================================

# check_thresholds - Evaluate metrics against configured thresholds
# Args: $1 = metrics file path (optional, defaults to METRICS_FILE)
check_thresholds() {
  local metrics_file="${1:-$METRICS_FILE}"

  # Validate metrics file exists
  if [ ! -f "$metrics_file" ]; then
    echo "[WARN] Metrics file not found: $metrics_file" >&2
    return 0
  fi

  # Get recent metrics (last 5 minutes, assuming 1 sample/5s = ~60 samples)
  local recent_metrics
  if [ -f "$metrics_file" ]; then
    recent_metrics=$(tail -n 60 "$metrics_file" 2>/dev/null || echo "")
  else
    recent_metrics=""
  fi

  if [ -z "$recent_metrics" ]; then
    return 0  # No metrics to evaluate
  fi

  # Check coordination time threshold
  check_coordination_time "$recent_metrics"

  # Check delivery rate threshold
  check_delivery_rate "$recent_metrics"

  # Check memory growth threshold
  check_memory_growth "$recent_metrics"

  # Check file descriptor growth
  check_fd_growth "$recent_metrics"

  # Check error rate
  check_error_rate "$recent_metrics"

  # Check queue depth
  check_queue_depth "$recent_metrics"
}

# check_coordination_time - Validate coordination latency
check_coordination_time() {
  local metrics="$1"

  local max_coord_time
  max_coord_time=$(echo "$metrics" | \
    jq -r 'select(.metric == "coordination.time") | .value' 2>/dev/null | \
    sort -n | tail -1)

  if [ -n "$max_coord_time" ] && [ "$max_coord_time" -gt "$ALERT_COORDINATION_TIME_MS" ]; then
    emit_alert "coordination_time_exceeded" \
      "Coordination time ${max_coord_time}ms exceeds threshold ${ALERT_COORDINATION_TIME_MS}ms" \
      "critical" \
      "{\"max_time\": $max_coord_time, \"threshold\": $ALERT_COORDINATION_TIME_MS}"
  fi
}

# check_delivery_rate - Validate message delivery success rate
check_delivery_rate() {
  local metrics="$1"

  local min_delivery
  min_delivery=$(echo "$metrics" | \
    jq -r 'select(.metric == "coordination.delivery_rate") | .value' 2>/dev/null | \
    sort -n | head -1)

  if [ -n "$min_delivery" ]; then
    # Convert to integer for comparison (remove decimal if present)
    min_delivery=${min_delivery%.*}

    if [ "$min_delivery" -lt "$ALERT_DELIVERY_RATE_PCT" ]; then
      emit_alert "delivery_rate_low" \
        "Delivery rate ${min_delivery}% below threshold ${ALERT_DELIVERY_RATE_PCT}%" \
        "warning" \
        "{\"delivery_rate\": $min_delivery, \"threshold\": $ALERT_DELIVERY_RATE_PCT}"
    fi
  fi
}

# check_memory_growth - Validate memory usage trends
check_memory_growth() {
  local metrics="$1"

  # Get first and last memory samples
  local first_memory last_memory
  first_memory=$(echo "$metrics" | \
    jq -r 'select(.metric == "system.memory_mb") | .value' 2>/dev/null | \
    head -1)
  last_memory=$(echo "$metrics" | \
    jq -r 'select(.metric == "system.memory_mb") | .value' 2>/dev/null | \
    tail -1)

  if [ -n "$first_memory" ] && [ -n "$last_memory" ] && [ "$first_memory" -gt 0 ]; then
    # Calculate percentage growth
    local growth_pct
    growth_pct=$(awk "BEGIN {printf \"%.0f\", (($last_memory - $first_memory) / $first_memory) * 100}")

    if [ "$growth_pct" -gt "$ALERT_MEMORY_GROWTH_PCT" ]; then
      emit_alert "memory_growth_high" \
        "Memory growth ${growth_pct}% exceeds threshold ${ALERT_MEMORY_GROWTH_PCT}%" \
        "warning" \
        "{\"growth_pct\": $growth_pct, \"threshold\": $ALERT_MEMORY_GROWTH_PCT, \"first_mb\": $first_memory, \"last_mb\": $last_memory}"
    fi
  fi
}

# check_fd_growth - Validate file descriptor usage
check_fd_growth() {
  local metrics="$1"

  # Get first and last FD counts
  local first_fd last_fd
  first_fd=$(echo "$metrics" | \
    jq -r 'select(.metric == "system.open_fds") | .value' 2>/dev/null | \
    head -1)
  last_fd=$(echo "$metrics" | \
    jq -r 'select(.metric == "system.open_fds") | .value' 2>/dev/null | \
    tail -1)

  if [ -n "$first_fd" ] && [ -n "$last_fd" ]; then
    local fd_growth=$((last_fd - first_fd))

    if [ "$fd_growth" -gt "$ALERT_FD_GROWTH" ]; then
      emit_alert "fd_growth_high" \
        "File descriptor growth ${fd_growth} exceeds threshold ${ALERT_FD_GROWTH}" \
        "warning" \
        "{\"growth\": $fd_growth, \"threshold\": $ALERT_FD_GROWTH, \"first_fd\": $first_fd, \"last_fd\": $last_fd}"
    fi
  fi
}

# check_error_rate - Validate error frequency
check_error_rate() {
  local metrics="$1"

  local max_error_rate
  max_error_rate=$(echo "$metrics" | \
    jq -r 'select(.metric == "coordination.error_rate") | .value' 2>/dev/null | \
    sort -n | tail -1)

  if [ -n "$max_error_rate" ]; then
    max_error_rate=${max_error_rate%.*}

    if [ "$max_error_rate" -gt "$ALERT_ERROR_RATE_PCT" ]; then
      emit_alert "error_rate_high" \
        "Error rate ${max_error_rate}% exceeds threshold ${ALERT_ERROR_RATE_PCT}%" \
        "critical" \
        "{\"error_rate\": $max_error_rate, \"threshold\": $ALERT_ERROR_RATE_PCT}"
    fi
  fi
}

# check_queue_depth - Validate message queue backlog
check_queue_depth() {
  local metrics="$1"

  local max_queue_depth
  max_queue_depth=$(echo "$metrics" | \
    jq -r 'select(.metric == "coordination.queue_depth") | .value' 2>/dev/null | \
    sort -n | tail -1)

  if [ -n "$max_queue_depth" ] && [ "$max_queue_depth" -gt "$ALERT_QUEUE_DEPTH" ]; then
    emit_alert "queue_depth_high" \
      "Queue depth ${max_queue_depth} exceeds threshold ${ALERT_QUEUE_DEPTH}" \
      "warning" \
      "{\"queue_depth\": $max_queue_depth, \"threshold\": $ALERT_QUEUE_DEPTH}"
  fi
}

# emit_alert - Send alert notification with rate limiting
# Args: $1 = alert_type, $2 = message, $3 = severity (optional), $4 = metadata (optional)
emit_alert() {
  local alert_type="$1"
  local message="$2"
  local severity="${3:-info}"
  local metadata="${4:-{}}"

  # Check rate limiting (cooldown period)
  local now
  now=$(date +%s)
  local last_fired="${ALERT_LAST_FIRED[$alert_type]:-0}"

  if [ $((now - last_fired)) -lt "$ALERT_COOLDOWN_SECONDS" ]; then
    # Alert in cooldown period, skip
    return 0
  fi

  # Update last fired timestamp
  ALERT_LAST_FIRED[$alert_type]=$now

  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  # Create alert log directory if needed
  local alert_dir
  alert_dir=$(dirname "$ALERT_LOG_FILE")
  mkdir -p "$alert_dir" 2>/dev/null || true

  # Log alert in JSONL format
  jq -n \
    --arg ts "$timestamp" \
    --arg type "$alert_type" \
    --arg msg "$message" \
    --arg sev "$severity" \
    --argjson meta "$metadata" \
    '{
      timestamp: $ts,
      alert: $type,
      message: $msg,
      severity: $sev,
      metadata: $meta
    }' \
    >> "$ALERT_LOG_FILE"

  # Output to stderr for immediate visibility (color-coded by severity)
  local color_code
  case "$severity" in
    critical) color_code="\033[1;31m" ;;  # Bright red
    warning)  color_code="\033[1;33m" ;;  # Bright yellow
    info)     color_code="\033[1;36m" ;;  # Bright cyan
    *)        color_code="\033[0m" ;;     # Default
  esac

  echo -e "${color_code}[ALERT $timestamp] [$severity] $alert_type: $message\033[0m" >&2
}

# get_alert_summary - Retrieve alert statistics
# Args: $1 = time_window_minutes (optional, default 60)
get_alert_summary() {
  local time_window_minutes="${1:-60}"

  if [ ! -f "$ALERT_LOG_FILE" ]; then
    echo "{\"total\": 0, \"by_severity\": {}, \"by_type\": {}}"
    return 0
  fi

  # Get alerts from time window
  local cutoff_time
  cutoff_time=$(date -u -d "$time_window_minutes minutes ago" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || \
                date -u -v-"${time_window_minutes}M" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || \
                echo "1970-01-01T00:00:00")

  jq -s \
    --arg cutoff "$cutoff_time" \
    'map(select(.timestamp >= $cutoff)) | {
      total: length,
      by_severity: group_by(.severity) | map({(.[0].severity): length}) | add // {},
      by_type: group_by(.alert) | map({(.[0].alert): length}) | add // {}
    }' \
    "$ALERT_LOG_FILE"
}

# clear_old_alerts - Cleanup old alert entries
# Args: $1 = retention_hours (optional, default 24)
clear_old_alerts() {
  local retention_hours="${1:-24}"

  if [ ! -f "$ALERT_LOG_FILE" ]; then
    return 0
  fi

  local cutoff_time
  cutoff_time=$(date -u -d "$retention_hours hours ago" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || \
                date -u -v-"${retention_hours}H" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || \
                echo "1970-01-01T00:00:00")

  # Keep only recent alerts
  local temp_file="${ALERT_LOG_FILE}.tmp"
  jq -c --arg cutoff "$cutoff_time" \
    'select(.timestamp >= $cutoff)' \
    "$ALERT_LOG_FILE" > "$temp_file"

  mv "$temp_file" "$ALERT_LOG_FILE"
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

# If sourced, export functions; if executed, run checks
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  check_thresholds "$@"
fi
