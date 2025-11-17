#!/bin/bash
################################################################################
# CFN Distributed Log Monitor
# Task 4.4: Distributed Logging Standardization
#
# Monitors logs in real-time for errors, alerts, and performance issues.
# Provides metrics collection, threshold checking, and alerting capabilities.
#
# Usage:
#   ./log-monitor.sh [OPTIONS]
#
# Options:
#   --log-dir DIR              Directory to monitor (default: /var/log/cfn)
#   --interval SECONDS         Check interval (default: 60)
#   --alert-on LEVEL           Alert levels (error,fatal) (default: error,fatal)
#   --error-threshold COUNT    Error count threshold (default: 10)
#   --pattern PATTERN          Log file pattern (default: *.log)
#   --output-file FILE         Metrics output file
#   --action ACTION            Action on alert (log, email, webhook)
#   --webhook-url URL          Webhook URL for alerts
#   --email-to EMAIL           Email address for alerts
#   --cpu-warning PERCENT      CPU warning threshold (default: 75)
#   --memory-warning PERCENT   Memory warning threshold (default: 85)
#   --retention-check         Check log retention and cleanup
#   --performance-check       Monitor performance impact
#   --daemon                   Run as daemon
#   --dry-run                  Simulate without taking action
#   --debug                    Enable debug output
#   --help                     Display this message
#
################################################################################

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default configuration
LOG_DIR="/var/log/cfn"
CHECK_INTERVAL=60
ALERT_LEVELS=("error" "fatal")
ERROR_THRESHOLD=10
LOG_PATTERN="*.log"
ACTION="log"
WEBHOOK_URL=""
EMAIL_TO=""
CPU_WARNING=75
MEMORY_WARNING=85
RETENTION_CHECK=false
PERFORMANCE_CHECK=false
RUN_DAEMON=false
DRY_RUN=false
DEBUG=false
OUTPUT_METRICS=""
MONITOR_PID=$$
MONITOR_STARTTIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STATE_DIR="/tmp/cfn-monitor-${MONITOR_PID}"

# Metrics tracking
declare -A error_counts
declare -A warning_counts
declare -A log_file_sizes

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

################################################################################
# Utility Functions
################################################################################

log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} [INFO] $*" >&2
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} [ERROR] $*" >&2
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} [SUCCESS] $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} [WARN] $*" >&2
}

debug() {
    if [ "$DEBUG" = true ]; then
        echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} [DEBUG] $*" >&2
    fi
}

# Display usage
usage() {
    sed -n '2,/^$/p' "$0" | head -n -1
    exit 0
}

# Initialize state directory
init_state() {
    mkdir -p "$STATE_DIR"
    touch "$STATE_DIR/started" "$STATE_DIR/last-check"
}

# Cleanup
cleanup() {
    log_info "Shutting down log monitor (PID: $MONITOR_PID)"
    [ -d "$STATE_DIR" ] && rm -rf "$STATE_DIR"
}

trap cleanup EXIT

################################################################################
# Error and Warning Detection
################################################################################

# Count errors and warnings in log files
count_errors() {
    local log_file="$1"
    local error_count=0
    local warning_count=0

    if [ ! -f "$log_file" ]; then
        return 0
    fi

    # Check for error level logs in JSON format
    error_count=$(jq -r 'select(.level == "error" or .level == "ERROR")' \
                  "$log_file" 2>/dev/null | wc -l || echo 0)

    # Check for warning level logs
    warning_count=$(jq -r 'select(.level == "warn" or .level == "WARN" or .level == "warning")' \
                    "$log_file" 2>/dev/null | wc -l || echo 0)

    echo "$error_count|$warning_count"
}

# Extract recent error messages
extract_error_messages() {
    local log_file="$1"
    local limit="${2:-5}"

    jq -r 'select(.level == "error" or .level == "ERROR") |
            "\(.timestamp) [\(.level)] \(.message)"' \
        "$log_file" 2>/dev/null | tail -n "$limit" || true
}

# Extract error context for detailed reporting
extract_error_context() {
    local log_file="$1"

    jq 'select(.level == "error" or .level == "ERROR") |
        {timestamp, level, message, correlationId, source, context, metadata}' \
        "$log_file" 2>/dev/null | head -n 20 || true
}

################################################################################
# Log File Analysis
################################################################################

# Analyze log file growth
analyze_log_growth() {
    local log_file="$1"
    local output_file="${STATE_DIR}/growth-analysis.json"

    if [ ! -f "$log_file" ]; then
        return 0
    fi

    local current_size=$(stat -c%s "$log_file" 2>/dev/null || echo 0)
    local current_time=$(date +%s)
    local growth_rate=0

    # Compare with previous size
    if [ -f "$STATE_DIR/size-$log_file" ]; then
        local prev_size=$(cat "$STATE_DIR/size-$log_file" 2>/dev/null || echo 0)
        local prev_time=$(cat "$STATE_DIR/time-$log_file" 2>/dev/null || echo 0)

        if [ "$prev_time" -gt 0 ]; then
            local time_diff=$(( current_time - prev_time ))
            [ "$time_diff" -gt 0 ] && growth_rate=$(( (current_size - prev_size) / time_diff ))
        fi
    fi

    # Store current state
    echo "$current_size" > "$STATE_DIR/size-$log_file"
    echo "$current_time" > "$STATE_DIR/time-$log_file"

    # Check if growth is abnormal (>10MB per minute)
    if [ "$growth_rate" -gt $((10 * 1024 * 1024)) ]; then
        log_warn "Abnormal log growth detected: ${log_file##*/} (${growth_rate} bytes/sec)"
        return 1
    fi

    return 0
}

# Count total logs and distribution by level
analyze_log_distribution() {
    local log_file="$1"

    if [ ! -f "$log_file" ]; then
        return 0
    fi

    jq -s '{
        total: length,
        byLevel: (group_by(.level) | map({level: .[0].level, count: length}) | sort_by(.count) | reverse)
    }' "$log_file" 2>/dev/null || true
}

################################################################################
# Performance Monitoring
################################################################################

# Check CPU and memory usage of log operations
check_system_performance() {
    local monitor_duration=10  # Check CPU/memory for 10 seconds

    debug "Checking system performance (${monitor_duration}s window)"

    # Get CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | \
        sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | \
        awk '{print 100 - $1}' 2>/dev/null || echo 0)

    # Get memory usage
    local mem_usage=$(free | grep Mem | \
        awk '{printf("%.0f", ($3/$2) * 100)}' 2>/dev/null || echo 0)

    # Log disk usage
    local disk_usage=$(df "$LOG_DIR" | tail -1 | awk '{print $5}' | sed 's/%//' 2>/dev/null || echo 0)

    debug "CPU: ${cpu_usage}%, Memory: ${mem_usage}%, Disk: ${disk_usage}%"

    # Generate performance report
    cat > "${STATE_DIR}/performance.json" <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "cpuUsage": $cpu_usage,
  "cpuWarning": $CPU_WARNING,
  "cpuCritical": $((CPU_WARNING + 15)),
  "memoryUsage": $mem_usage,
  "memoryWarning": $MEMORY_WARNING,
  "memoryCritical": $((MEMORY_WARNING + 10)),
  "diskUsage": $disk_usage,
  "diskWarning": 80,
  "diskCritical": 90
}
EOF

    # Check thresholds
    if [ "$cpu_usage" -gt "$CPU_WARNING" ]; then
        log_warn "CPU usage high: ${cpu_usage}% (threshold: ${CPU_WARNING}%)"
        [ "$DRY_RUN" = false ] && trigger_alert "CPU_HIGH" "$cpu_usage%"
    fi

    if [ "$mem_usage" -gt "$MEMORY_WARNING" ]; then
        log_warn "Memory usage high: ${mem_usage}% (threshold: ${MEMORY_WARNING}%)"
        [ "$DRY_RUN" = false ] && trigger_alert "MEMORY_HIGH" "$mem_usage%"
    fi

    if [ "$disk_usage" -gt 90 ]; then
        log_error "CRITICAL: Disk space low: ${disk_usage}%"
        [ "$DRY_RUN" = false ] && trigger_alert "DISK_CRITICAL" "$disk_usage%"
    fi
}

# Calculate logging overhead
measure_logging_overhead() {
    local start_time=$(date +%s%N)
    local cpu_before=$(ps aux | grep -v grep | awk '{sum+=$3} END {print sum}')

    # Run a sample aggregation
    if [ -x "$SCRIPT_DIR/log-aggregator.sh" ]; then
        timeout 5 "$SCRIPT_DIR/log-aggregator.sh" --source filesystem --pattern "*.log" >/dev/null 2>&1 || true
    fi

    local cpu_after=$(ps aux | grep -v grep | awk '{sum+=$3} END {print sum}')
    local end_time=$(date +%s%N)

    local duration_ms=$(( (end_time - start_time) / 1000000 ))
    local cpu_delta=$(( cpu_after - cpu_before ))

    debug "Logging overhead: ${cpu_delta}% CPU in ${duration_ms}ms"

    # Check if overhead is acceptable (<5%)
    if [ "$cpu_delta" -gt 5 ]; then
        log_warn "High logging overhead detected: ${cpu_delta}%"
    fi
}

################################################################################
# Retention and Cleanup
################################################################################

# Check log retention compliance
check_retention() {
    local retention_days=30
    local debug_retention_days=7

    log_info "Checking log retention (standard: ${retention_days}d, debug: ${debug_retention_days}d)"

    local expired_count=0

    # Find and report expired logs
    find "$LOG_DIR" -name "$LOG_PATTERN" -type f -mtime +$retention_days 2>/dev/null | while read -r log_file; do
        local age=$(stat -c%Y "$log_file" | awk '{print int((systime() - $1) / 86400)}')
        log_warn "Expired log file (${age}d old): $log_file"
        ((expired_count++))

        if [ "$DRY_RUN" = false ]; then
            rm -f "$log_file"
            debug "Removed expired log: $log_file"
        fi
    done

    # Check debug logs
    find "$LOG_DIR/debug" -name "*.log" -type f -mtime +$debug_retention_days 2>/dev/null | while read -r log_file; do
        if [ "$DRY_RUN" = false ]; then
            rm -f "$log_file"
            debug "Removed expired debug log: $log_file"
        fi
    done

    log_info "Retention check complete (expired: $expired_count)"
}

# Cleanup orphaned log files
cleanup_orphaned_logs() {
    log_info "Cleaning up orphaned log files..."

    # Remove empty log files
    find "$LOG_DIR" -name "$LOG_PATTERN" -type f -empty 2>/dev/null | while read -r empty_file; do
        debug "Removing empty log file: $empty_file"
        [ "$DRY_RUN" = false ] && rm -f "$empty_file"
    done

    # Remove logs from deleted containers
    find "$LOG_DIR/containers" -name "*.log" -type f ! -exec fuser -s {} \; 2>/dev/null | while read -r orphaned; do
        debug "Removing orphaned log: $orphaned"
        [ "$DRY_RUN" = false ] && rm -f "$orphaned"
    done
}

################################################################################
# Alerting
################################################################################

# Trigger an alert
trigger_alert() {
    local alert_type="$1"
    local alert_message="$2"
    local alert_timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    log_error "ALERT: $alert_type - $alert_message"

    # Create alert record
    local alert_file="${STATE_DIR}/alert-${alert_type}-${alert_timestamp}.json"
    cat > "$alert_file" <<EOF
{
  "timestamp": "$alert_timestamp",
  "type": "$alert_type",
  "message": "$alert_message",
  "severity": "high",
  "monitor_pid": $MONITOR_PID
}
EOF

    case "$ACTION" in
        log)
            debug "Alert logged to: $alert_file"
            ;;
        email)
            if [ -n "$EMAIL_TO" ]; then
                send_email_alert "$alert_type" "$alert_message" || log_error "Failed to send email alert"
            fi
            ;;
        webhook)
            if [ -n "$WEBHOOK_URL" ]; then
                send_webhook_alert "$alert_type" "$alert_message" || log_error "Failed to send webhook alert"
            fi
            ;;
    esac
}

# Send email alert
send_email_alert() {
    local alert_type="$1"
    local alert_message="$2"

    if ! command -v mail &>/dev/null && ! command -v sendmail &>/dev/null; then
        return 1
    fi

    local subject="CFN Log Monitor Alert: $alert_type"
    local body="Alert Type: $alert_type\nMessage: $alert_message\nTime: $(date)\nHost: $(hostname)"

    echo -e "$body" | mail -s "$subject" "$EMAIL_TO" 2>/dev/null || return 1
    log_info "Email alert sent to: $EMAIL_TO"
}

# Send webhook alert
send_webhook_alert() {
    local alert_type="$1"
    local alert_message="$2"

    if ! command -v curl &>/dev/null; then
        return 1
    fi

    local payload=$(jq -n \
        --arg type "$alert_type" \
        --arg message "$alert_message" \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        '{alert_type: $type, message: $message, timestamp: $timestamp}')

    curl -X POST -H "Content-Type: application/json" \
         -d "$payload" \
         "$WEBHOOK_URL" 2>/dev/null || return 1

    log_info "Webhook alert sent to: $WEBHOOK_URL"
}

################################################################################
# Metrics Output
################################################################################

# Generate and output metrics
generate_metrics() {
    local metric_timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Collect all metrics
    local total_errors=0
    local total_warnings=0
    local log_files_monitored=0

    find "$LOG_DIR" -name "$LOG_PATTERN" -type f 2>/dev/null | while read -r log_file; do
        ((log_files_monitored++))
        local counts=$(count_errors "$log_file")
        local errors="${counts%|*}"
        local warnings="${counts#*|}"
        ((total_errors += errors))
        ((total_warnings += warnings))
    done

    local metrics_file="${OUTPUT_METRICS:-${STATE_DIR}/metrics-${metric_timestamp}.json}"

    cat > "$metrics_file" <<EOF
{
  "timestamp": "$metric_timestamp",
  "monitoring": {
    "startTime": "$MONITOR_STARTTIME",
    "uptime": "$(date -u -d@$(($(date +%s) - $(date -d "$MONITOR_STARTTIME" +%s))) +%H:%M:%S)",
    "checkInterval": $CHECK_INTERVAL
  },
  "logs": {
    "monitored": $log_files_monitored,
    "errors": $total_errors,
    "warnings": $total_warnings,
    "errorThreshold": $ERROR_THRESHOLD
  },
  "performance": $([ -f "${STATE_DIR}/performance.json" ] && cat "${STATE_DIR}/performance.json" || echo '{}'),
  "alerts": {
    "totalAlerts": $(ls -1 "$STATE_DIR"/alert-*.json 2>/dev/null | wc -l),
    "lastAlert": "$(ls -t "$STATE_DIR"/alert-*.json 2>/dev/null | head -1 | xargs -I {} jq -r .timestamp {} 2>/dev/null || echo "none")"
  }
}
EOF

    debug "Metrics written to: $metrics_file"
}

################################################################################
# Monitoring Loop
################################################################################

# Main monitoring loop
monitor_logs() {
    init_state
    log_info "CFN Log Monitor started (PID: $MONITOR_PID)"
    log_info "Monitoring directory: $LOG_DIR"
    log_info "Check interval: ${CHECK_INTERVAL}s"

    local check_count=0

    while true; do
        ((check_count++))
        local check_timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S%Z")

        debug "Check #$check_count at $check_timestamp"

        # Monitor each log file
        find "$LOG_DIR" -name "$LOG_PATTERN" -type f 2>/dev/null | while read -r log_file; do
            debug "Analyzing: $log_file"

            # Count errors
            local counts=$(count_errors "$log_file")
            local errors="${counts%|*}"
            local warnings="${counts#*|}"

            if [ "$errors" -gt "$ERROR_THRESHOLD" ]; then
                log_warn "Error threshold exceeded in ${log_file##*/}: $errors > $ERROR_THRESHOLD"
                trigger_alert "ERROR_THRESHOLD" "$errors errors in ${log_file##*/}"
            fi

            # Analyze growth
            analyze_log_growth "$log_file" || true

            # Show recent errors
            if [ "$errors" -gt 0 ]; then
                log_info "Recent errors in ${log_file##*/}:"
                extract_error_messages "$log_file" 3 | sed 's/^/  /'
            fi
        done

        # Performance checks
        if [ "$PERFORMANCE_CHECK" = true ]; then
            check_system_performance
        fi

        # Retention checks
        if [ "$RETENTION_CHECK" = true ]; then
            check_retention
            cleanup_orphaned_logs
        fi

        # Generate metrics
        generate_metrics

        # Exit if not running as daemon
        if [ "$RUN_DAEMON" = false ]; then
            break
        fi

        # Wait for next check
        sleep "$CHECK_INTERVAL"
    done

    log_success "Log monitoring complete"
}

################################################################################
# Argument Parsing
################################################################################

while [[ $# -gt 0 ]]; do
    case "$1" in
        --log-dir)
            LOG_DIR="$2"
            shift 2
            ;;
        --interval)
            CHECK_INTERVAL="$2"
            shift 2
            ;;
        --alert-on)
            IFS=',' read -ra ALERT_LEVELS <<< "$2"
            shift 2
            ;;
        --error-threshold)
            ERROR_THRESHOLD="$2"
            shift 2
            ;;
        --pattern)
            LOG_PATTERN="$2"
            shift 2
            ;;
        --output-file)
            OUTPUT_METRICS="$2"
            shift 2
            ;;
        --action)
            ACTION="$2"
            shift 2
            ;;
        --webhook-url)
            WEBHOOK_URL="$2"
            shift 2
            ;;
        --email-to)
            EMAIL_TO="$2"
            shift 2
            ;;
        --cpu-warning)
            CPU_WARNING="$2"
            shift 2
            ;;
        --memory-warning)
            MEMORY_WARNING="$2"
            shift 2
            ;;
        --retention-check)
            RETENTION_CHECK=true
            shift
            ;;
        --performance-check)
            PERFORMANCE_CHECK=true
            shift
            ;;
        --daemon)
            RUN_DAEMON=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Run monitoring
monitor_logs "$@"
