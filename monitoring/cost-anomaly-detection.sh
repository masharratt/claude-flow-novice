#!/bin/bash
# Cost Anomaly Detection Script
# Detects >20% cost spikes compared to baseline and triggers alerts

set -euo pipefail

# Configuration
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
ANOMALY_THRESHOLD="${ANOMALY_THRESHOLD:-1.20}"  # 20% increase
BASELINE_WINDOW="${BASELINE_WINDOW:-24h}"
CHECK_WINDOW="${CHECK_WINDOW:-1h}"
LOG_FILE="${LOG_FILE:-/var/log/cfn/cost-anomaly-detection.log}"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Query Prometheus
query_prometheus() {
  local query="$1"
  local url="${PROMETHEUS_URL}/api/v1/query?query=$(echo -n "$query" | jq -sRr @uri)"

  curl -s "$url" | jq -r '.data.result'
}

# Calculate cost rate for a time window
get_cost_rate() {
  local team="$1"
  local window="$2"

  local query="sum by (team) (rate(zai_api_cost_usd{team=\"$team\"}[$window]))"
  query_prometheus "$query" | jq -r '.[0].value[1] // "0"'
}

# Get list of all teams
get_teams() {
  local query='label_values(zai_api_cost_usd, team)'
  query_prometheus "$query" | jq -r '.[]' 2>/dev/null || echo ""
}

# Send alert notification
send_alert() {
  local team="$1"
  local current_rate="$2"
  local baseline_rate="$3"
  local percent_change="$4"

  local message=$(cat <<EOF
{
  "alert": "CostAnomalyDetected",
  "severity": "warning",
  "team": "$team",
  "current_rate": "$current_rate",
  "baseline_rate": "$baseline_rate",
  "percent_change": "$percent_change",
  "threshold": "$ANOMALY_THRESHOLD",
  "timestamp": "$(date -Iseconds)",
  "runbook": "https://docs.example.com/runbooks/cost-anomaly"
}
EOF
)

  log "ALERT: Cost anomaly detected for $team - ${percent_change}% increase"

  if [[ -n "$ALERT_WEBHOOK" ]]; then
    curl -X POST -H "Content-Type: application/json" \
      -d "$message" "$ALERT_WEBHOOK" 2>/dev/null || \
      log "ERROR: Failed to send alert webhook"
  fi

  # Write to Prometheus pushgateway for alerting
  if command -v prometheus-push-gateway &> /dev/null; then
    cat <<EOF | curl --data-binary @- http://localhost:9091/metrics/job/cost-anomaly-detection/team/$team
# TYPE cost_anomaly_detected gauge
cost_anomaly_detected{team="$team",severity="warning"} 1
# TYPE cost_anomaly_percent_change gauge
cost_anomaly_percent_change{team="$team"} $percent_change
EOF
  fi
}

# Main detection logic
detect_anomalies() {
  log "Starting cost anomaly detection (threshold: ${ANOMALY_THRESHOLD}x baseline)"

  local teams=$(get_teams)
  if [[ -z "$teams" ]]; then
    log "WARNING: No teams found in metrics"
    return 0
  fi

  local anomaly_count=0

  for team in $teams; do
    log "Checking team: $team"

    # Get current cost rate (last 1h)
    local current_rate=$(get_cost_rate "$team" "$CHECK_WINDOW")

    # Get baseline cost rate (24h ago)
    local baseline_query="sum by (team) (rate(zai_api_cost_usd{team=\"$team\"}[$CHECK_WINDOW] offset $BASELINE_WINDOW))"
    local baseline_rate=$(query_prometheus "$baseline_query" | jq -r '.[0].value[1] // "0"')

    if [[ "$baseline_rate" == "0" ]] || [[ "$baseline_rate" == "null" ]]; then
      log "INFO: No baseline data for $team, skipping"
      continue
    fi

    # Calculate percent change
    local ratio=$(echo "scale=4; $current_rate / $baseline_rate" | bc)
    local percent_change=$(echo "scale=2; ($ratio - 1) * 100" | bc)

    log "  Current rate: \$$current_rate/h | Baseline: \$$baseline_rate/h | Change: ${percent_change}%"

    # Check if exceeds threshold
    local exceeds=$(echo "$ratio > $ANOMALY_THRESHOLD" | bc)
    if [[ "$exceeds" -eq 1 ]]; then
      send_alert "$team" "$current_rate" "$baseline_rate" "$percent_change"
      ((anomaly_count++))
    fi
  done

  log "Detection complete: $anomaly_count anomalies detected"
  return 0
}

# Health check mode
health_check() {
  log "Running health check"

  # Check Prometheus connectivity
  if ! curl -sf "${PROMETHEUS_URL}/-/healthy" >/dev/null; then
    log "ERROR: Prometheus not reachable at $PROMETHEUS_URL"
    return 1
  fi

  # Check if cost metrics exist
  local metric_count=$(query_prometheus 'count(zai_api_cost_usd)' | jq -r '.[0].value[1] // "0"')
  if [[ "$metric_count" == "0" ]]; then
    log "WARNING: No cost metrics found"
    return 1
  fi

  log "Health check passed: $metric_count cost metrics available"
  return 0
}

# Main execution
main() {
  local mode="${1:-detect}"

  case "$mode" in
    detect)
      detect_anomalies
      ;;
    health)
      health_check
      ;;
    test)
      log "Running test mode with reduced thresholds"
      ANOMALY_THRESHOLD=1.10  # 10% for testing
      detect_anomalies
      ;;
    *)
      echo "Usage: $0 {detect|health|test}"
      echo ""
      echo "Modes:"
      echo "  detect - Run anomaly detection (default)"
      echo "  health - Check connectivity and metrics availability"
      echo "  test   - Run with reduced threshold for testing"
      echo ""
      echo "Environment variables:"
      echo "  PROMETHEUS_URL       - Prometheus server URL (default: http://localhost:9090)"
      echo "  ALERT_WEBHOOK        - Webhook URL for alert notifications"
      echo "  ANOMALY_THRESHOLD    - Detection threshold multiplier (default: 1.20)"
      echo "  BASELINE_WINDOW      - Baseline comparison window (default: 24h)"
      echo "  CHECK_WINDOW         - Current rate check window (default: 1h)"
      echo "  LOG_FILE             - Log file path (default: /var/log/cfn/cost-anomaly-detection.log)"
      exit 1
      ;;
  esac
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
