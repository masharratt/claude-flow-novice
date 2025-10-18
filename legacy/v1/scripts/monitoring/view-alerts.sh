#!/usr/bin/env bash
# scripts/monitoring/view-alerts.sh - Real-time alert visualization dashboard
# Phase 1 Sprint 1.1: Alert dashboard

set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================

ALERT_LOG_FILE="${ALERT_LOG_FILE:-/dev/shm/cfn-alerts.jsonl}"
REFRESH_INTERVAL="${REFRESH_INTERVAL:-1}"  # Seconds

# ==============================================================================
# DISPLAY FUNCTIONS
# ==============================================================================

# format_alert - Convert alert JSON to human-readable format
format_alert() {
  local line="$1"

  # Parse JSON fields
  local timestamp alert_type message severity

  timestamp=$(echo "$line" | jq -r '.timestamp // "unknown"' 2>/dev/null || echo "unknown")
  alert_type=$(echo "$line" | jq -r '.alert // "unknown"' 2>/dev/null || echo "unknown")
  message=$(echo "$line" | jq -r '.message // "no message"' 2>/dev/null || echo "no message")
  severity=$(echo "$line" | jq -r '.severity // "info"' 2>/dev/null || echo "info")

  # Format timestamp (remove milliseconds for readability)
  local display_time
  display_time=$(echo "$timestamp" | cut -d'.' -f1 | sed 's/T/ /')

  # Color-code based on severity
  local color_code reset_code
  reset_code="\033[0m"

  case "$severity" in
    critical)
      color_code="\033[1;31m"  # Bright red
      ;;
    warning)
      color_code="\033[1;33m"  # Bright yellow
      ;;
    info)
      color_code="\033[1;36m"  # Bright cyan
      ;;
    *)
      color_code="\033[0m"     # Default
      ;;
  esac

  # Format output: [timestamp] [severity] alert_type: message
  echo -e "${color_code}[${display_time}] [${severity^^}] ${alert_type}: ${message}${reset_code}"
}

# show_alert_summary - Display alert statistics
show_alert_summary() {
  local time_window="${1:-60}"  # Minutes

  echo ""
  echo "=========================================="
  echo "ALERT SUMMARY (Last ${time_window} minutes)"
  echo "=========================================="

  if [ ! -f "$ALERT_LOG_FILE" ]; then
    echo "No alerts found."
    return
  fi

  # Get cutoff time
  local cutoff_time
  cutoff_time=$(date -u -d "$time_window minutes ago" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || \
                date -u -v-"${time_window}M" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || \
                echo "1970-01-01T00:00:00")

  # Calculate statistics
  local total_alerts critical_count warning_count info_count

  total_alerts=$(jq -c --arg cutoff "$cutoff_time" \
    'select(.timestamp >= $cutoff)' \
    "$ALERT_LOG_FILE" 2>/dev/null | wc -l)

  critical_count=$(jq -c --arg cutoff "$cutoff_time" \
    'select(.timestamp >= $cutoff and .severity == "critical")' \
    "$ALERT_LOG_FILE" 2>/dev/null | wc -l)

  warning_count=$(jq -c --arg cutoff "$cutoff_time" \
    'select(.timestamp >= $cutoff and .severity == "warning")' \
    "$ALERT_LOG_FILE" 2>/dev/null | wc -l)

  info_count=$(jq -c --arg cutoff "$cutoff_time" \
    'select(.timestamp >= $cutoff and .severity == "info")' \
    "$ALERT_LOG_FILE" 2>/dev/null | wc -l)

  echo "Total Alerts: $total_alerts"
  echo -e "  \033[1;31mCritical: $critical_count\033[0m"
  echo -e "  \033[1;33mWarning:  $warning_count\033[0m"
  echo -e "  \033[1;36mInfo:     $info_count\033[0m"

  # Show top alert types
  echo ""
  echo "Top Alert Types:"
  jq -c --arg cutoff "$cutoff_time" \
    'select(.timestamp >= $cutoff) | .alert' \
    "$ALERT_LOG_FILE" 2>/dev/null | \
    sort | uniq -c | sort -rn | head -5 | \
    awk '{printf "  %s: %d\n", $2, $1}'

  echo "=========================================="
  echo ""
}

# tail_alerts - Live alert stream (like tail -f)
tail_alerts() {
  echo "[INFO] Watching for alerts (Ctrl+C to exit)..."
  echo ""

  # Show recent alerts first
  if [ -f "$ALERT_LOG_FILE" ]; then
    tail -n 10 "$ALERT_LOG_FILE" | while IFS= read -r line; do
      format_alert "$line"
    done
  fi

  # Follow new alerts
  tail -f "$ALERT_LOG_FILE" 2>/dev/null | while IFS= read -r line; do
    format_alert "$line"
  done
}

# show_recent_alerts - Display N most recent alerts
show_recent_alerts() {
  local count="${1:-20}"

  if [ ! -f "$ALERT_LOG_FILE" ]; then
    echo "No alerts found."
    return
  fi

  echo "=========================================="
  echo "Recent Alerts (Last $count)"
  echo "=========================================="
  echo ""

  tail -n "$count" "$ALERT_LOG_FILE" | while IFS= read -r line; do
    format_alert "$line"
  done

  echo ""
}

# filter_alerts - Show alerts matching criteria
filter_alerts() {
  local filter_type="${1:-}"
  local filter_value="${2:-}"

  if [ -z "$filter_type" ]; then
    echo "Usage: $0 filter <severity|alert|time> <value>" >&2
    exit 1
  fi

  if [ ! -f "$ALERT_LOG_FILE" ]; then
    echo "No alerts found."
    return
  fi

  case "$filter_type" in
    severity)
      jq -c --arg sev "$filter_value" \
        'select(.severity == $sev)' \
        "$ALERT_LOG_FILE" | while IFS= read -r line; do
        format_alert "$line"
      done
      ;;

    alert)
      jq -c --arg alert "$filter_value" \
        'select(.alert == $alert)' \
        "$ALERT_LOG_FILE" | while IFS= read -r line; do
        format_alert "$line"
      done
      ;;

    time)
      # Filter by time range (e.g., "10m", "1h", "30s")
      local minutes
      case "$filter_value" in
        *m) minutes="${filter_value%m}" ;;
        *h) minutes=$((${filter_value%h} * 60)) ;;
        *s) minutes=$((${filter_value%s} / 60)) ;;
        *) minutes="$filter_value" ;;
      esac

      local cutoff_time
      cutoff_time=$(date -u -d "$minutes minutes ago" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || \
                    date -u -v-"${minutes}M" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || \
                    echo "1970-01-01T00:00:00")

      jq -c --arg cutoff "$cutoff_time" \
        'select(.timestamp >= $cutoff)' \
        "$ALERT_LOG_FILE" | while IFS= read -r line; do
        format_alert "$line"
      done
      ;;

    *)
      echo "[ERROR] Unknown filter type: $filter_type" >&2
      echo "Valid types: severity, alert, time" >&2
      exit 1
      ;;
  esac
}

# interactive_dashboard - Real-time updating dashboard
interactive_dashboard() {
  while true; do
    clear
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║          CLAUDE FLOW NOVICE - ALERT DASHBOARD             ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""

    show_alert_summary 60

    echo ""
    echo "Recent Alerts (Last 10):"
    echo "----------------------------------------"

    if [ -f "$ALERT_LOG_FILE" ]; then
      tail -n 10 "$ALERT_LOG_FILE" | while IFS= read -r line; do
        format_alert "$line"
      done
    else
      echo "No alerts yet."
    fi

    echo ""
    echo "Press Ctrl+C to exit | Refreshing every ${REFRESH_INTERVAL}s..."

    sleep "$REFRESH_INTERVAL"
  done
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

case "${1:-tail}" in
  tail)
    tail_alerts
    ;;

  recent)
    show_recent_alerts "${2:-20}"
    ;;

  summary)
    show_alert_summary "${2:-60}"
    ;;

  filter)
    filter_alerts "${2:-}" "${3:-}"
    ;;

  dashboard)
    interactive_dashboard
    ;;

  help)
    cat << EOF
Alert Viewer - Real-time alert monitoring and visualization

Usage: $0 <command> [options]

Commands:
  tail              Live alert stream (default)
  recent [N]        Show N most recent alerts (default: 20)
  summary [M]       Show alert statistics for last M minutes (default: 60)
  filter <type> <value>
                    Filter alerts by severity, alert type, or time
                    Examples:
                      $0 filter severity critical
                      $0 filter alert coordination_time_exceeded
                      $0 filter time 30m
  dashboard         Interactive real-time dashboard
  help              Show this help message

Environment Variables:
  ALERT_LOG_FILE    Path to alert log (default: /dev/shm/cfn-alerts.jsonl)
  REFRESH_INTERVAL  Dashboard refresh rate in seconds (default: 1)

Examples:
  $0 tail                              # Live alert stream
  $0 recent 50                         # Last 50 alerts
  $0 summary 120                       # Stats for last 2 hours
  $0 filter severity critical          # Show only critical alerts
  $0 dashboard                         # Interactive dashboard
EOF
    ;;

  *)
    echo "Unknown command: $1" >&2
    echo "Run '$0 help' for usage information" >&2
    exit 1
    ;;
esac
