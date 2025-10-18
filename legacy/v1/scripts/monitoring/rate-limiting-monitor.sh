#!/usr/bin/env bash
# scripts/monitoring/rate-limiting-monitor.sh - Rate limiting metrics and alerting
# Phase 1 Sprint 1.5: Rate Limiting Monitoring & Alerts

set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/../../lib"
CFN_BASE_DIR="${CFN_BASE_DIR:-/dev/shm/cfn}"
METRICS_FILE="${METRICS_FILE:-/dev/shm/cfn-metrics.jsonl}"
ALERT_LOG_FILE="${ALERT_LOG_FILE:-/dev/shm/cfn-alerts.jsonl}"
MONITOR_PID_FILE="${MONITOR_PID_FILE:-/dev/shm/rate-limiting-monitor.pid}"

# Check interval (seconds)
CHECK_INTERVAL="${CHECK_INTERVAL:-10}"

# Rate limiting thresholds
MAX_INBOX_SIZE="${MAX_INBOX_SIZE:-100}"
INBOX_CRITICAL_PCT="${INBOX_CRITICAL_PCT:-90}"
INBOX_WARNING_PCT="${INBOX_WARNING_PCT:-75}"
BACKPRESSURE_WARNING_RATE="${BACKPRESSURE_WARNING_RATE:-100}"  # events/min
MESSAGE_FAILURE_CRITICAL_RATE="${MESSAGE_FAILURE_CRITICAL_RATE:-10}"  # failures/min

# ==============================================================================
# DEPENDENCIES
# ==============================================================================

# Source libraries
if [ -f "$LIB_DIR/alerting.sh" ]; then
  # shellcheck source=../../lib/alerting.sh
  source "$LIB_DIR/alerting.sh"
else
  echo "[ERROR] Alerting library not found at $LIB_DIR/alerting.sh" >&2
  exit 1
fi

if [ -f "$LIB_DIR/metrics.sh" ]; then
  # shellcheck source=../../lib/metrics.sh
  source "$LIB_DIR/metrics.sh"
else
  echo "[ERROR] Metrics library not found at $LIB_DIR/metrics.sh" >&2
  exit 1
fi

# ==============================================================================
# SIGNAL HANDLERS
# ==============================================================================

cleanup() {
  echo "[INFO] Shutting down rate limiting monitor (PID: $$)" >&2
  rm -f "$MONITOR_PID_FILE"
  exit 0
}

trap cleanup SIGTERM SIGINT

# ==============================================================================
# METRICS COLLECTION FUNCTIONS
# ==============================================================================

# collect_inbox_metrics - Gather inbox size and utilization data
collect_inbox_metrics() {
  local inbox_dir="$CFN_BASE_DIR/inbox"

  # Skip if inbox directory doesn't exist
  if [ ! -d "$inbox_dir" ]; then
    return 0
  fi

  # Iterate through agent inboxes
  for agent_inbox in "$inbox_dir"/*; do
    [ -d "$agent_inbox" ] || continue

    local agent_id
    agent_id=$(basename "$agent_inbox")

    # Count messages in inbox (use ls -1 instead of find for performance)
    local message_count=0
    if ls -1 "$agent_inbox"/*.msg 2>/dev/null | wc -l > /dev/null 2>&1; then
      message_count=$(ls -1 "$agent_inbox"/*.msg 2>/dev/null | wc -l)
    fi

    # Calculate utilization percentage
    local utilization_pct=0
    if [ "$MAX_INBOX_SIZE" -gt 0 ]; then
      utilization_pct=$((message_count * 100 / MAX_INBOX_SIZE))
    fi

    # Emit metrics
    emit_metric "inbox.size" "$message_count" "count" "{\"agent\":\"$agent_id\"}"
    emit_metric "inbox.utilization" "$utilization_pct" "percent" "{\"agent\":\"$agent_id\"}"

    # Check alert thresholds
    check_inbox_thresholds "$agent_id" "$utilization_pct" "$message_count"
  done
}

# check_inbox_thresholds - Evaluate inbox against alert thresholds
check_inbox_thresholds() {
  local agent_id="$1"
  local utilization_pct="$2"
  local message_count="$3"

  if [ "$utilization_pct" -ge "$INBOX_CRITICAL_PCT" ]; then
    emit_alert "inbox_high_utilization" \
      "Agent $agent_id inbox at critical level: ${utilization_pct}% (${message_count}/${MAX_INBOX_SIZE} messages)" \
      "critical" \
      "{\"agent\":\"$agent_id\",\"utilization\":$utilization_pct,\"count\":$message_count,\"max\":$MAX_INBOX_SIZE}"
  elif [ "$utilization_pct" -ge "$INBOX_WARNING_PCT" ]; then
    emit_alert "inbox_high_utilization" \
      "Agent $agent_id inbox utilization elevated: ${utilization_pct}% (${message_count}/${MAX_INBOX_SIZE} messages)" \
      "warning" \
      "{\"agent\":\"$agent_id\",\"utilization\":$utilization_pct,\"count\":$message_count,\"max\":$MAX_INBOX_SIZE}"
  fi
}

# collect_backpressure_metrics - Track backpressure events
collect_backpressure_metrics() {
  if [ ! -f "$METRICS_FILE" ]; then
    return 0
  fi

  # Count backpressure events in last minute (last 6 samples at 10s interval)
  local backpressure_events
  backpressure_events=$(tail -n 60 "$METRICS_FILE" 2>/dev/null | \
    jq -r 'select(.metric == "backpressure.wait") | .value' | wc -l)

  # Emit backpressure rate metric
  emit_metric "backpressure.events_per_min" "$backpressure_events" "count"

  # Check alert threshold
  if [ "$backpressure_events" -gt "$BACKPRESSURE_WARNING_RATE" ]; then
    emit_alert "backpressure_high_rate" \
      "Backpressure events exceed threshold: ${backpressure_events} events/min (threshold: ${BACKPRESSURE_WARNING_RATE}/min)" \
      "warning" \
      "{\"events_per_min\":$backpressure_events,\"threshold\":$BACKPRESSURE_WARNING_RATE}"
  fi
}

# collect_message_failure_metrics - Track message delivery failures
collect_message_failure_metrics() {
  if [ ! -f "$METRICS_FILE" ]; then
    return 0
  fi

  # Count message send failures in last minute
  local send_failures
  send_failures=$(tail -n 60 "$METRICS_FILE" 2>/dev/null | \
    jq -r 'select(.metric == "coordination.send_failure") | .value' | wc -l)

  # Emit failure rate metric
  emit_metric "coordination.send_failures_per_min" "$send_failures" "count"

  # Check critical threshold
  if [ "$send_failures" -gt "$MESSAGE_FAILURE_CRITICAL_RATE" ]; then
    emit_alert "message_send_failures_critical" \
      "Message send failures exceed critical threshold: ${send_failures} failures/min (threshold: ${MESSAGE_FAILURE_CRITICAL_RATE}/min)" \
      "critical" \
      "{\"failures_per_min\":$send_failures,\"threshold\":$MESSAGE_FAILURE_CRITICAL_RATE}"
  fi
}

# collect_overflow_metrics - Track inbox overflow events
collect_overflow_metrics() {
  if [ ! -f "$METRICS_FILE" ]; then
    return 0
  fi

  # Count overflow events in last minute
  local overflow_events
  overflow_events=$(tail -n 60 "$METRICS_FILE" 2>/dev/null | \
    jq -r 'select(.metric == "inbox.overflow") | .value' | wc -l)

  if [ "$overflow_events" -gt 0 ]; then
    emit_metric "inbox.overflow_events_per_min" "$overflow_events" "count"

    emit_alert "inbox_overflow_detected" \
      "Inbox overflow detected: ${overflow_events} events in last minute" \
      "critical" \
      "{\"overflow_events\":$overflow_events}"
  fi
}

# ==============================================================================
# MONITORING LOOP
# ==============================================================================

# start_monitor - Begin continuous rate limiting monitoring
start_monitor() {
  local iteration=0

  echo "[INFO] Rate limiting monitor started (PID: $$)" >&2
  echo "[INFO] Check interval: ${CHECK_INTERVAL}s" >&2
  echo "[INFO] Inbox size limit: $MAX_INBOX_SIZE messages" >&2
  echo "[INFO] Alert thresholds: Critical=${INBOX_CRITICAL_PCT}%, Warning=${INBOX_WARNING_PCT}%" >&2
  echo "[INFO] Metrics file: $METRICS_FILE" >&2
  echo "[INFO] Alert log: $ALERT_LOG_FILE" >&2

  # Write PID file
  echo $$ > "$MONITOR_PID_FILE"

  while true; do
    iteration=$((iteration + 1))

    # Collect all rate limiting metrics
    collect_inbox_metrics
    collect_backpressure_metrics
    collect_message_failure_metrics
    collect_overflow_metrics

    # Log iteration status (every 30 iterations = 5 minutes at 10s interval)
    if [ $((iteration % 30)) -eq 0 ]; then
      echo "[INFO] Rate limiting monitor iteration $iteration completed" >&2
    fi

    # Sleep until next check
    sleep "$CHECK_INTERVAL"
  done
}

# ==============================================================================
# CONTROL FUNCTIONS
# ==============================================================================

# get_monitor_status - Check if monitor is running
get_monitor_status() {
  if [ -f "$MONITOR_PID_FILE" ]; then
    local pid
    pid=$(cat "$MONITOR_PID_FILE")

    if kill -0 "$pid" 2>/dev/null; then
      echo "running (PID: $pid)"
      return 0
    else
      echo "stale (PID file exists but process not running)"
      rm -f "$MONITOR_PID_FILE"
      return 1
    fi
  else
    echo "stopped"
    return 1
  fi
}

# stop_monitor - Stop running monitor
stop_monitor() {
  if [ -f "$MONITOR_PID_FILE" ]; then
    local pid
    pid=$(cat "$MONITOR_PID_FILE")

    if kill -0 "$pid" 2>/dev/null; then
      echo "[INFO] Stopping rate limiting monitor (PID: $pid)" >&2
      kill -TERM "$pid"

      # Wait for graceful shutdown (max 5 seconds)
      for i in {1..10}; do
        if ! kill -0 "$pid" 2>/dev/null; then
          echo "[INFO] Rate limiting monitor stopped successfully" >&2
          return 0
        fi
        sleep 0.5
      done

      # Force kill if still running
      if kill -0 "$pid" 2>/dev/null; then
        echo "[WARN] Monitor did not stop gracefully, forcing..." >&2
        kill -KILL "$pid" 2>/dev/null || true
      fi
    fi

    rm -f "$MONITOR_PID_FILE"
  else
    echo "[INFO] No rate limiting monitor running" >&2
  fi
}

# get_rate_limiting_summary - Display current rate limiting status
get_rate_limiting_summary() {
  echo "=== Rate Limiting Status ==="
  echo ""

  # Inbox utilization summary
  if [ -d "$CFN_BASE_DIR/inbox" ]; then
    echo "Inbox Utilization:"
    for agent_inbox in "$CFN_BASE_DIR/inbox"/*; do
      [ -d "$agent_inbox" ] || continue

      local agent_id
      agent_id=$(basename "$agent_inbox")

      local message_count=0
      if ls -1 "$agent_inbox"/*.msg 2>/dev/null | wc -l > /dev/null 2>&1; then
        message_count=$(ls -1 "$agent_inbox"/*.msg 2>/dev/null | wc -l)
      fi

      local utilization_pct=0
      if [ "$MAX_INBOX_SIZE" -gt 0 ]; then
        utilization_pct=$((message_count * 100 / MAX_INBOX_SIZE))
      fi

      printf "  %-30s %3d messages (%3d%% utilization)\n" "$agent_id:" "$message_count" "$utilization_pct"
    done
  else
    echo "  No inbox directory found"
  fi

  echo ""

  # Recent alerts
  if [ -f "$ALERT_LOG_FILE" ]; then
    echo "Recent Rate Limiting Alerts (last hour):"
    tail -n 100 "$ALERT_LOG_FILE" 2>/dev/null | \
      jq -r 'select(.alert | contains("inbox") or contains("backpressure") or contains("overflow")) |
             "\(.timestamp) [\(.severity)] \(.alert): \(.message)"' | \
      tail -n 10 || echo "  No recent alerts"
  else
    echo "  No alerts logged"
  fi

  echo ""
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

case "${1:-start}" in
  start)
    if [ -f "$MONITOR_PID_FILE" ]; then
      echo "[ERROR] Rate limiting monitor already running (PID: $(cat "$MONITOR_PID_FILE"))" >&2
      exit 1
    fi
    start_monitor
    ;;

  stop)
    stop_monitor
    ;;

  restart)
    stop_monitor
    sleep 1
    start_monitor
    ;;

  status)
    get_monitor_status
    ;;

  summary)
    get_rate_limiting_summary
    ;;

  background)
    # Start in background
    if [ -f "$MONITOR_PID_FILE" ]; then
      echo "[ERROR] Rate limiting monitor already running (PID: $(cat "$MONITOR_PID_FILE"))" >&2
      exit 1
    fi
    nohup "$0" start > /dev/shm/rate-limiting-monitor.log 2>&1 &
    echo "[INFO] Rate limiting monitor started in background (PID: $!)" >&2
    ;;

  *)
    echo "Usage: $0 {start|stop|restart|status|summary|background}" >&2
    echo "" >&2
    echo "Commands:" >&2
    echo "  start      - Start monitoring in foreground" >&2
    echo "  stop       - Stop running monitor" >&2
    echo "  restart    - Restart monitor" >&2
    echo "  status     - Check monitor status" >&2
    echo "  summary    - Display current rate limiting status" >&2
    echo "  background - Start monitor in background" >&2
    exit 1
    ;;
esac
