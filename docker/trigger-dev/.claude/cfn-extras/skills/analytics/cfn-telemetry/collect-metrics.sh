#!/bin/bash
# CFN Telemetry Collection System
# Real-time metrics collection for agent monitoring

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TELEMETRY_DIR="${CFN_TELEMETRY_DIR:-$PROJECT_ROOT/.artifacts/telemetry}"
COLLECTION_INTERVAL="${CFN_TELEMETRY_INTERVAL:-30}"  # seconds

# Ensure telemetry directory exists
mkdir -p "$TELEMETRY_DIR"

# Function to collect agent metrics
collect_agent_metrics() {
    local agent_id="$1"
    local agent_pid="$2"
    local iteration="${3:-1}"
    local agent_type="${4:-unknown}"

    if ! kill -0 "$agent_pid" 2>/dev/null; then
        echo "⚠️ Process $agent_pid no longer running" >&2
        return 1
    fi

    # Collect memory and CPU usage
    local memory_kb=$(ps -o rss= -p "$agent_pid" 2>/dev/null | tr -d ' ' || echo "0")
    local cpu_percent=$(ps -o %cpu= -p "$agent_pid" 2>/dev/null | tr -d ' ' || echo "0")
    local start_time=$(ps -o lstart= -p "$agent_pid" 2>/dev/null || echo "unknown")

    # Calculate memory usage percentage
    local memory_limit_kb=$((CFN_MEMORY_LIMIT * 1024))
    local memory_usage_percent=$(echo "scale=1; $memory_kb * 100 / $memory_limit_kb" | bc -l 2>/dev/null || echo "0")

    # Create metrics record
    local metrics_file="$TELEMETRY_DIR/agent_${agent_id}_$(date +%s).json"
    cat > "$metrics_file" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "collection_type": "agent_metrics",
  "agent_id": "$agent_id",
  "agent_type": "$agent_type",
  "iteration": $iteration,
  "pid": $agent_pid,
  "process": {
    "start_time": "$start_time",
    "memory_kb": $memory_kb,
    "cpu_percent": $cpu_percent,
    "memory_limit_kb": $memory_limit_kb,
    "memory_usage_percent": $memory_usage_percent
  },
  "limits": {
    "memory_limit_mb": $CFN_MEMORY_LIMIT,
    "timeout_seconds": $CFN_VALIDATION_TIMEOUT,
    "cpu_limit_percent": $CFN_CPU_LIMIT
  },
  "environment": {
    "cfn_mode": "${CFN_MODE:-unset}",
    "task_id": "${TASK_ID:-unset}",
    "validation_timeout": $CFN_VALIDATION_TIMEOUT
  }
}
EOF

    # Log summary
    echo "📊 Collected metrics for $agent_id: ${memory_kb}KB memory, ${cpu_percent}% CPU" >&2

    # Check for memory limit violations
    if (( $(echo "$memory_usage_percent > 90" | bc -l) )); then
        echo "⚠️ WARNING: $agent_id using ${memory_usage_percent}% of memory limit" >&2
        collect_alert "$agent_id" "memory_warning" "Memory usage at ${memory_usage_percent}%"
    fi

    return 0
}

# Function to collect system metrics
collect_system_metrics() {
    local system_file="$TELEMETRY_DIR/system_$(date +%s).json"

    # System resource usage
    local system_memory=$(free -m | awk 'NR==2{printf "%.1f", $3*100/$2}')
    local system_cpu=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | tr -d ' ')

    cat > "$system_file" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "collection_type": "system_metrics",
  "system": {
    "memory_usage_percent": $system_memory,
    "cpu_usage_percent": ${system_cpu:-0},
    "load_average": "$load_avg"
  },
  "cfn_processes": {
    "active_agents": $(pgrep -f "claude-flow-novice agent" | wc -l || echo 0),
    "orchestrator_processes": $(pgrep -f "orchestrate.sh" | wc -l || echo 0)
  }
}
EOF
}

# Function to collect alerts
collect_alert() {
    local agent_id="$1"
    local alert_type="$2"
    local message="$3"

    local alert_file="$TELEMETRY_DIR/alert_$(date +%s).json"
    cat > "$alert_file" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "alert_type": "$alert_type",
  "agent_id": "$agent_id",
  "message": "$message",
  "severity": "warning"
}
EOF

    echo "🚨 ALERT: $alert_type for $agent_id - $message" >&2
}

# Function to start continuous monitoring
start_monitoring() {
    local agent_id="$1"
    local agent_pid="$2"
    local iteration="${3:-1}"
    local agent_type="${4:-unknown}"

    echo "🔍 Starting monitoring for $agent_id (PID: $agent_pid)" >&2

    # Initial metrics collection
    collect_agent_metrics "$agent_id" "$agent_pid" "$iteration" "$agent_type"

    # Start background monitoring
    (
        while kill -0 "$agent_pid" 2>/dev/null; do
            sleep "$COLLECTION_INTERVAL"
            collect_agent_metrics "$agent_id" "$agent_pid" "$iteration" "$agent_type"
        done

        # Final metrics when process exits
        collect_agent_metrics "$agent_id" "$agent_pid" "$iteration" "$agent_type"
        echo "✅ Monitoring ended for $agent_id" >&2
    ) &

    local monitor_pid=$!
    echo "$monitor_pid"
}

# Function to stop monitoring
stop_monitoring() {
    local monitor_pid="$1"

    if kill -0 "$monitor_pid" 2>/dev/null; then
        kill "$monitor_pid" 2>/dev/null || true
        wait "$monitor_pid" 2>/dev/null || true
        echo "🛑 Stopped monitoring (PID: $monitor_pid)" >&2
    fi
}

# Function to cleanup old telemetry files
cleanup_telemetry() {
    local retention_days="${1:-7}"
    local cutoff_time=$(date -d "$retention_days days ago" +%s 2>/dev/null || echo 0)

    find "$TELEMETRY_DIR" -name "*.json" -type f -mtime "+$retention_days" -delete 2>/dev/null || true
    echo "🧹 Cleaned telemetry files older than $retention_days days" >&2
}

# Function to generate summary report
generate_summary() {
    local summary_file="$TELEMETRY_DIR/summary_$(date +%s).json"

    local total_metrics=$(find "$TELEMETRY_DIR" -name "agent_*.json" | wc -l)
    local total_alerts=$(find "$TELEMETRY_DIR" -name "alert_*.json" | wc -l)
    local recent_metrics=$(find "$TELEMETRY_DIR" -name "agent_*.json" -mmin -60 | wc -l)

    cat > "$summary_file" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "collection_type": "telemetry_summary",
  "metrics": {
    "total_agent_metrics": $total_metrics,
    "recent_metrics_last_hour": $recent_metrics,
    "total_alerts": $total_alerts
  },
  "system": {
    "telemetry_directory": "$TELEMETRY_DIR",
    "collection_interval_seconds": $COLLECTION_INTERVAL
  }
}
EOF

    echo "📈 Telemetry summary: $total_metrics total metrics, $total_alerts alerts" >&2
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-help}" in
        "collect-agent")
            collect_agent_metrics "$2" "$3" "${4:-1}" "${5:-unknown}"
            ;;
        "collect-system")
            collect_system_metrics
            ;;
        "start-monitoring")
            start_monitoring "$2" "$3" "${4:-1}" "${5:-unknown}"
            ;;
        "stop-monitoring")
            stop_monitoring "$2"
            ;;
        "cleanup")
            cleanup_telemetry "${2:-7}"
            ;;
        "summary")
            generate_summary
            ;;
        "help"|"--help"|"-h")
            cat <<'EOF'
CFN Telemetry Collection System

USAGE:
    collect-metrics.sh <command> [args...]

COMMANDS:
    collect-agent <agent_id> <pid> [iteration] [type]    Collect single agent metrics
    collect-system                                      Collect system metrics
    start-monitoring <agent_id> <pid> [iteration] [type]  Start continuous monitoring
    stop-monitoring <monitor_pid>                       Stop monitoring
    cleanup [days]                                      Clean old telemetry files (default: 7 days)
    summary                                             Generate summary report

EXAMPLES:
    collect-metrics.sh collect-agent reviewer_123 45678 1 reviewer
    collect-metrics.sh start-monitoring tester_456 78901
    collect-metrics.sh cleanup 3

EOF
            ;;
        *)
            echo "Unknown command: $1" >&2
            echo "Use 'help' for usage information" >&2
            exit 1
            ;;
    esac
fi