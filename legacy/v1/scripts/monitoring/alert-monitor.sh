#!/usr/bin/env bash
# scripts/monitoring/alert-monitor.sh - Continuous monitoring daemon with alerting
# Phase 1 Sprint 1.1: Monitoring loop integration

set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/../../lib"
METRICS_FILE="${METRICS_FILE:-/dev/shm/cfn-metrics.jsonl}"
ALERT_LOG_FILE="${ALERT_LOG_FILE:-/dev/shm/cfn-alerts.jsonl}"
MONITOR_PID_FILE="${MONITOR_PID_FILE:-/dev/shm/alert-monitor.pid}"

# Check interval (seconds)
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"

# Cleanup retention (hours)
ALERT_RETENTION_HOURS="${ALERT_RETENTION_HOURS:-24}"
METRICS_RETENTION_HOURS="${METRICS_RETENTION_HOURS:-48}"

# ==============================================================================
# DEPENDENCIES
# ==============================================================================

# Source alerting library
if [ -f "$LIB_DIR/alerting.sh" ]; then
  # shellcheck source=../../lib/alerting.sh
  source "$LIB_DIR/alerting.sh"
else
  echo "[ERROR] Alerting library not found at $LIB_DIR/alerting.sh" >&2
  exit 1
fi

# ==============================================================================
# SIGNAL HANDLERS
# ==============================================================================

cleanup() {
  echo "[INFO] Shutting down alert monitor (PID: $$)" >&2
  rm -f "$MONITOR_PID_FILE"
  exit 0
}

trap cleanup SIGTERM SIGINT

# ==============================================================================
# MONITORING FUNCTIONS
# ==============================================================================

# start_monitor - Begin continuous threshold monitoring
start_monitor() {
  local iteration=0

  echo "[INFO] Alert monitor started (PID: $$)" >&2
  echo "[INFO] Check interval: ${CHECK_INTERVAL}s" >&2
  echo "[INFO] Metrics file: $METRICS_FILE" >&2
  echo "[INFO] Alert log: $ALERT_LOG_FILE" >&2

  # Write PID file
  echo $$ > "$MONITOR_PID_FILE"

  while true; do
    iteration=$((iteration + 1))

    # Check thresholds
    if [ -f "$METRICS_FILE" ]; then
      check_thresholds "$METRICS_FILE" 2>&1 | while IFS= read -r line; do
        echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $line"
      done
    fi

    # Periodic cleanup (every 100 iterations)
    if [ $((iteration % 100)) -eq 0 ]; then
      echo "[INFO] Running periodic cleanup (iteration $iteration)" >&2
      cleanup_old_data
    fi

    # Sleep until next check
    sleep "$CHECK_INTERVAL"
  done
}

# cleanup_old_data - Remove old metrics and alerts
cleanup_old_data() {
  # Clear old alerts
  if [ -f "$ALERT_LOG_FILE" ]; then
    local alert_count_before
    alert_count_before=$(wc -l < "$ALERT_LOG_FILE" 2>/dev/null || echo "0")

    clear_old_alerts "$ALERT_RETENTION_HOURS"

    local alert_count_after
    alert_count_after=$(wc -l < "$ALERT_LOG_FILE" 2>/dev/null || echo "0")

    echo "[INFO] Cleared $((alert_count_before - alert_count_after)) old alerts" >&2
  fi

  # Clear old metrics
  if [ -f "$METRICS_FILE" ]; then
    local metrics_count_before
    metrics_count_before=$(wc -l < "$METRICS_FILE" 2>/dev/null || echo "0")

    local cutoff_time
    cutoff_time=$(date -u -d "$METRICS_RETENTION_HOURS hours ago" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || \
                  date -u -v-"${METRICS_RETENTION_HOURS}H" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || \
                  echo "1970-01-01T00:00:00")

    local temp_file="${METRICS_FILE}.tmp"
    jq -c --arg cutoff "$cutoff_time" \
      'select(.timestamp >= $cutoff)' \
      "$METRICS_FILE" > "$temp_file" 2>/dev/null || true

    if [ -f "$temp_file" ]; then
      mv "$temp_file" "$METRICS_FILE"

      local metrics_count_after
      metrics_count_after=$(wc -l < "$METRICS_FILE" 2>/dev/null || echo "0")

      echo "[INFO] Cleared $((metrics_count_before - metrics_count_after)) old metrics" >&2
    fi
  fi
}

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
      echo "[INFO] Stopping monitor (PID: $pid)" >&2
      kill -TERM "$pid"

      # Wait for graceful shutdown (max 5 seconds)
      for i in {1..10}; do
        if ! kill -0 "$pid" 2>/dev/null; then
          echo "[INFO] Monitor stopped successfully" >&2
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
    echo "[INFO] No monitor running" >&2
  fi
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

case "${1:-start}" in
  start)
    if [ -f "$MONITOR_PID_FILE" ]; then
      echo "[ERROR] Monitor already running (PID: $(cat "$MONITOR_PID_FILE"))" >&2
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

  background)
    # Start in background
    if [ -f "$MONITOR_PID_FILE" ]; then
      echo "[ERROR] Monitor already running (PID: $(cat "$MONITOR_PID_FILE"))" >&2
      exit 1
    fi
    nohup "$0" start > /dev/shm/alert-monitor.log 2>&1 &
    echo "[INFO] Monitor started in background (PID: $!)" >&2
    ;;

  *)
    echo "Usage: $0 {start|stop|restart|status|background}" >&2
    exit 1
    ;;
esac
